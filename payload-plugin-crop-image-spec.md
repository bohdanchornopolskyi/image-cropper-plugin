# Payload Plugin Spec: `payload-plugin-crop-image`

## Overview

A Payload CMS 3.x plugin that adds on-demand image cropping to the admin interface. Editors select an image from the media library, draw named crop regions per slot (e.g. "Desktop Hero", "Mobile"), and the plugin uses Sharp to write permanent, statically-served crop files to disk. Crop files are deleted when regenerated with new coordinates or when the source media document is deleted. Frontend utilities resolve the stored crop URL — no runtime image processing.

---

## How It Works

1. **Schema**: `cropImageField(config)` returns a Payload `group` field containing three sub-fields: `image` (upload relation), `cropData` (JSON of `{[cropName]: {x,y,width,height}}` in percent units), and `generatedUrls` (JSON of `{[cropName]: "/media/filename-crop-...webp"}`).

2. **Admin UI**: A custom `CropImageField` React component replaces the default group renderer. It shows a thumbnail, crop preview cards, and opens a full-screen crop modal (rendered via portal) powered by `react-image-crop`. After the user draws crops and clicks "Save & Generate", the component calls the `POST /api/media/generate-crop` endpoint for each slot concurrently and stores the returned URLs.

3. **Server handler**: `generateCropHandler` receives the media document ID, crop name, percent coordinates, and output dimensions. It resolves the source file from disk, converts percent coords to pixels, calls Sharp to crop and resize to exact output dimensions, writes the result to the media static directory, and returns the public URL. Before writing, it scans for and deletes any stale file for the same slot (same `{base}-crop-{cropName}-` prefix but different coordinates or size).

4. **Cleanup hook**: `deleteOrphanedCrops` is an `afterDelete` hook on the media collection. When a media document is deleted, it scans the media directory for all files matching `${base}-crop-*` and deletes them.

5. **Frontend**: `getCropUrl(value, cropName)` reads `generatedUrls` and falls back to the original image URL. `resolveMediaCrop(value, cropName, outputSize?)` returns a `Media`-shaped object with the crop URL and optionally overridden dimensions — drop-in for any component that accepts a `Media` prop.

---

## Package Structure

```
payload-plugin-crop-image/
├── src/
│   ├── index.ts                    # plugin factory + cropImageField export
│   ├── types.ts                    # all shared types
│   ├── handler.ts                  # generateCropHandler (server, POST endpoint)
│   ├── hook.ts                     # deleteOrphanedCrops (afterDelete hook)
│   ├── utilities.ts                # getCropUrl + resolveMediaCrop (isomorphic)
│   ├── isRecord.ts                 # internal type guard
│   ├── CropImageField.tsx          # 'use client' admin component
│   └── CropImageField.module.css   # scoped styles for the admin component
├── package.json
├── tsconfig.json
└── README.md
```

---

## `package.json`

```json
{
  "name": "payload-plugin-crop-image",
  "version": "1.0.0",
  "description": "Payload CMS 3.x plugin for on-demand image cropping with persistent static files",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./utilities": {
      "import": "./dist/utilities.js",
      "require": "./dist/utilities.js",
      "types": "./dist/utilities.d.ts"
    }
  },
  "scripts": {
    "build": "tsc"
  },
  "peerDependencies": {
    "payload": "^3.0.0",
    "react": "^18.0.0 || ^19.0.0",
    "sharp": "^0.33.0"
  },
  "dependencies": {
    "react-image-crop": "^11.0.7"
  },
  "devDependencies": {
    "@payloadcms/ui": "^3.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## `src/types.ts`

```ts
// ─── Crop field configuration (passed by the content author at schema time) ───

export type CropDefinition = {
  /** Machine-readable slot name, used as the key in cropData and generatedUrls */
  name: string
  /** Human-readable label shown in the crop modal tabs */
  label: string
  /**
   * Desired output aspect ratio as width/height (e.g. 16/9).
   * When set, the crop handle is constrained to this ratio.
   */
  aspectRatio?: number
  /** Output image width in pixels */
  width: number
  /** Output image height in pixels */
  height: number
  /** Sharp quality, 1–100. Defaults to 80. Ignored for PNG. */
  quality?: number
  /** Output format. Defaults to 'webp'. */
  format?: 'webp' | 'jpeg' | 'png'
}

// ─── Runtime data types stored in the database ───────────────────────────────

/** Percent-based crop rectangle as produced by react-image-crop */
export type CropCoords = {
  x: number      // 0–100 (percent from left)
  y: number      // 0–100 (percent from top)
  width: number  // 0–100 (percent of image width)
  height: number // 0–100 (percent of image height)
}

/** Map of cropName → percent crop coordinates */
export type CropData = Record<string, CropCoords>

/** Map of cropName → public URL of the generated crop file */
export type GeneratedUrls = Record<string, string>

/**
 * The shape of the group field value as it arrives from the Payload API.
 * Sub-fields are typed loosely because the depth of the `image` relation
 * varies depending on the query depth used by the caller.
 */
export type CropImageValue = {
  image?: unknown
  cropData?: unknown
  generatedUrls?: unknown
}

// ─── Plugin configuration ─────────────────────────────────────────────────────

export type CropImagePluginConfig = {
  /**
   * Slug of the collection that stores media documents and serves as the
   * upload target for crop fields. Defaults to 'media'.
   */
  mediaCollectionSlug?: string
  /**
   * Absolute path to the directory where source and crop files are stored.
   * Must match the `staticDir` set on the upload collection.
   * Defaults to `path.join(process.cwd(), 'public/media')`.
   */
  mediaDir?: string
}
```

---

## `src/isRecord.ts`

```ts
export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
```

---

## `src/handler.ts`

Server-side endpoint handler. Registered as `POST /api/{mediaCollectionSlug}/generate-crop`.

```ts
import type { PayloadHandler } from 'payload'

import fs from 'fs'
import path from 'path'

import sharp from 'sharp'

import type { CropCoords } from './types'
import { isRecord } from './isRecord'

type Body = {
  mediaId: string | number
  cropName: string
  cropData: CropCoords
  outputWidth: number
  outputHeight: number
  quality?: number
  format?: 'webp' | 'jpeg' | 'png'
}

function isCropCoords(v: unknown): v is CropCoords {
  if (!isRecord(v)) return false
  return (
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  )
}

const VALID_FORMATS = ['webp', 'jpeg', 'png'] as const

function isBody(v: unknown): v is Body {
  if (!isRecord(v)) return false
  if (
    typeof v.format !== 'undefined' &&
    !VALID_FORMATS.includes(v.format as 'webp' | 'jpeg' | 'png')
  )
    return false
  return (
    (typeof v.mediaId === 'string' || typeof v.mediaId === 'number') &&
    typeof v.cropName === 'string' &&
    typeof v.outputWidth === 'number' &&
    typeof v.outputHeight === 'number' &&
    isCropCoords(v.cropData)
  )
}

export function makeGenerateCropHandler(mediaDir: string, mediaCollectionSlug: string): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await req.json?.()

    if (!isBody(rawBody)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      mediaId,
      cropName,
      cropData,
      outputWidth,
      outputHeight,
      quality = 80,
      format = 'webp',
    } = rawBody

    const mediaDoc = await req.payload.findByID({
      collection: mediaCollectionSlug,
      id: mediaId,
      overrideAccess: false,
      req,
    })

    const { filename, width: originalWidth, height: originalHeight } = mediaDoc ?? {}

    if (!filename) {
      return Response.json({ error: 'Media not found' }, { status: 404 })
    }

    if (!originalWidth || !originalHeight) {
      return Response.json({ error: 'Media has no dimensions' }, { status: 422 })
    }

    const sourceFilePath = path.join(mediaDir, filename)

    if (!fs.existsSync(sourceFilePath)) {
      return Response.json({ error: `Source file not found: ${filename}` }, { status: 404 })
    }

    const left = Math.max(0, Math.round((cropData.x / 100) * originalWidth))
    const top = Math.max(0, Math.round((cropData.y / 100) * originalHeight))
    const cropW = Math.min(
      originalWidth - left,
      Math.max(1, Math.round((cropData.width / 100) * originalWidth)),
    )
    const cropH = Math.min(
      originalHeight - top,
      Math.max(1, Math.round((cropData.height / 100) * originalHeight)),
    )

    const base = path.basename(filename, path.extname(filename))
    const tag = `${Math.round(cropData.x)}-${Math.round(cropData.y)}-${Math.round(cropData.width)}x${Math.round(cropData.height)}`
    const ext = format === 'jpeg' ? 'jpg' : format
    const outputFilename = `${base}-crop-${cropName}-${tag}-${outputWidth}x${outputHeight}.${ext}`
    const outputFilePath = path.join(mediaDir, outputFilename)

    // Scan for stale files for this slot; track if the exact output already exists
    let alreadyExists = false
    const slotPrefix = `${base}-crop-${cropName}-`
    try {
      for (const file of await fs.promises.readdir(mediaDir)) {
        if (file === outputFilename) {
          alreadyExists = true
        } else if (file.startsWith(slotPrefix)) {
          try {
            await fs.promises.unlink(path.join(mediaDir, file))
          } catch (e) {
            console.error(`[generateCrop] Failed to delete old crop file ${file}:`, e)
          }
        }
      }
    } catch (e) {
      console.error('[generateCrop] Failed to read media directory:', e)
    }

    if (alreadyExists) {
      return Response.json({ url: `/${path.basename(mediaDir)}/${outputFilename}` })
    }

    try {
      const pipeline = sharp(sourceFilePath)
        .extract({ left, top, width: cropW, height: cropH })
        .resize(outputWidth, outputHeight, { fit: 'fill' })

      if (format === 'jpeg') {
        await pipeline.jpeg({ quality }).toFile(outputFilePath)
      } else if (format === 'png') {
        await pipeline.png().toFile(outputFilePath)
      } else {
        await pipeline.webp({ quality }).toFile(outputFilePath)
      }

      return Response.json({ url: `/${path.basename(mediaDir)}/${outputFilename}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      console.error('[generateCrop] Sharp processing failed:', e)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
```

> **Note on the returned URL**: The URL segment is derived from `path.basename(mediaDir)` (e.g. `public/media` → `media`). An alternative, more explicit approach is to accept a `publicUrlPrefix` option in the plugin config (e.g. `'/media'`) rather than inferring it. Both work; the explicit option is safer when the static directory is not under `public/`.

---

## `src/hook.ts`

`afterDelete` hook that cleans up all crop files derived from the deleted media document.

```ts
import type { CollectionAfterDeleteHook } from 'payload'

import fs from 'fs'
import path from 'path'

export function makeDeleteOrphanedCrops(mediaDir: string): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const filename = doc.filename
    if (typeof filename !== 'string' || !filename) return

    const base = path.basename(filename, path.extname(filename))
    const cropPrefix = `${base}-crop-`

    let files: string[]
    try {
      files = await fs.promises.readdir(mediaDir)
    } catch {
      return
    }

    for (const file of files) {
      if (file.startsWith(cropPrefix)) {
        try {
          await fs.promises.unlink(path.join(mediaDir, file))
        } catch (e) {
          console.error(`[deleteOrphanedCrops] Failed to delete ${file}:`, e)
        }
      }
    }
  }
}
```

---

## `src/utilities.ts`

Isomorphic utilities consumed by frontend components. No Node.js APIs — safe to import in the browser.

```ts
import { isRecord } from './isRecord'
import type { CropImageValue } from './types'

/**
 * Returns the pre-generated crop URL for the given slot, or falls back to the
 * original image URL. Returns an empty string if no image is set.
 *
 * @param value     The cropImage group field value from Payload
 * @param cropName  The slot name (must match a CropDefinition.name)
 */
export function getCropUrl(
  value: CropImageValue | null | undefined,
  cropName: string,
): string {
  if (!value) return ''

  const urls = value.generatedUrls
  if (isRecord(urls)) {
    const url = urls[cropName]
    if (typeof url === 'string') return url
  }

  const img = value.image
  if (isRecord(img) && typeof img.url === 'string') {
    return img.url
  }

  return ''
}

/**
 * Returns a Media-shaped object with the crop URL injected.
 * Falls back to the original media document when no generated URL exists.
 * Returns null if no image is set or it hasn't been populated (depth=0).
 *
 * @param value       The cropImage group field value from Payload
 * @param cropName    The slot name (must match a CropDefinition.name)
 * @param outputSize  When provided, overrides width/height on the returned
 *                    object so it matches the actual output dimensions exactly
 */
export function resolveMediaCrop<T extends { url?: string | null; width?: number | null; height?: number | null }>(
  value: { image?: T | number | null; cropData?: unknown; generatedUrls?: unknown } | null | undefined,
  cropName: string,
  outputSize?: { width: number; height: number },
): T | null {
  if (!value) return null

  const imageValue = value.image
  const imageDoc: T | null =
    imageValue != null && typeof imageValue !== 'number' ? imageValue : null

  const url = getCropUrl(value, cropName)
  if (!url || !imageDoc) return imageDoc

  return {
    ...imageDoc,
    url,
    ...(outputSize ? { width: outputSize.width, height: outputSize.height } : {}),
  }
}
```

---

## `src/CropImageField.tsx`

Full `'use client'` admin component.

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
  type PixelCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useField, useListDrawer } from '@payloadcms/ui'

import type { CropCoords, CropData, CropDefinition, GeneratedUrls } from './types'
import { isRecord } from './isRecord'
import styles from './CropImageField.module.css'

type MediaDoc = {
  id: number | string
  url?: string | null
  width?: number | null
  height?: number | null
  filename?: string | null
  alt?: string | null
  updatedAt?: string | null
}

type Props = {
  path: string
  field?: {
    label?: string
    admin?: {
      custom?: {
        cropDefinitions?: CropDefinition[]
        fieldLabel?: string
        mediaCollectionSlug?: string
        generateCropEndpoint?: string
      }
    }
  }
  // Populated via clientProps in the field config
  cropDefinitions?: CropDefinition[]
  fieldLabel?: string
  mediaCollectionSlug?: string
  generateCropEndpoint?: string
  readOnly?: boolean
}

function isMediaDoc(v: unknown): v is MediaDoc {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && 'id' in v
}

function initCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
  existing: CropCoords | undefined,
): PercentCrop {
  if (existing) {
    return { unit: '%', x: existing.x, y: existing.y, width: existing.width, height: existing.height }
  }
  if (aspect) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight,
    )
  }
  return { unit: '%', x: 5, y: 5, width: 90, height: 90 }
}

// ─── Crop Modal ───────────────────────────────────────────────────────────────
// Isolated component so its frequent state updates don't re-render the Payload
// form field. Rendered via portal so it escapes any ancestor overflow/z-index.

type CropModalProps = {
  mediaUrl: string
  cropDefinitions: CropDefinition[]
  initialCropData: CropData
  onClose: () => void
  onSave: (finalCrops: CropData) => void
}

function CropModal({ mediaUrl, cropDefinitions, initialCropData, onClose, onSave }: CropModalProps) {
  const [activeTab, setActiveTab] = useState<string>(cropDefinitions[0]?.name ?? '')
  const [pendingCrops, setPendingCrops] = useState<CropData>(initialCropData)
  const [percentCrop, setPercentCrop] = useState<PercentCrop | undefined>()
  const imgRef = useRef<HTMLImageElement>(null)

  const activeDef = cropDefinitions.find((d) => d.name === activeTab)

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget
      setPercentCrop(initCrop(w, h, activeDef?.aspectRatio, pendingCrops[activeTab]))
    },
    [activeDef?.aspectRatio, pendingCrops, activeTab],
  )

  const switchTab = (name: string) => {
    if (percentCrop) {
      setPendingCrops((prev) => ({
        ...prev,
        [activeTab]: { x: percentCrop.x, y: percentCrop.y, width: percentCrop.width, height: percentCrop.height },
      }))
    }
    setActiveTab(name)
    const def = cropDefinitions.find((d) => d.name === name)
    const existing = pendingCrops[name] ?? initialCropData[name]
    const img = imgRef.current
    if (img) {
      setPercentCrop(initCrop(img.naturalWidth, img.naturalHeight, def?.aspectRatio, existing))
    } else {
      setPercentCrop(existing ? { unit: '%', ...existing } : undefined)
    }
  }

  const handleSave = () => {
    const finalCrops: CropData = {
      ...pendingCrops,
      ...(percentCrop
        ? { [activeTab]: { x: percentCrop.x, y: percentCrop.y, width: percentCrop.width, height: percentCrop.height } }
        : {}),
    }
    onSave(finalCrops)
  }

  const modal = (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Crop Image</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          {cropDefinitions.map((def) => {
            const isActive = activeTab === def.name
            return (
              <button
                key={def.name}
                type="button"
                className={`${styles.tab}${isActive ? ` ${styles.tabActive}` : ''}`}
                onClick={() => switchTab(def.name)}
              >
                {def.label}
              </button>
            )
          })}
        </div>

        <div className={styles.cropArea}>
          <ReactCrop
            crop={percentCrop}
            onChange={(_, pct) => setPercentCrop(pct)}
            onComplete={(_px: PixelCrop) => {}}
            aspect={activeDef?.aspectRatio}
            keepSelection
          >
            <img
              ref={imgRef}
              src={mediaUrl}
              alt="Crop source"
              onLoad={onImageLoad}
              className={styles.cropImg}
              crossOrigin="anonymous"
              draggable={false}
            />
          </ReactCrop>
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.cropHint}>
            {activeDef && `${activeDef.label} — ${activeDef.width} × ${activeDef.height} px`}
          </span>
          <div className={styles.footerActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.btnPrimary} onClick={handleSave}>
              Save &amp; Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// ─── Main Field ───────────────────────────────────────────────────────────────

export function CropImageField({
  path,
  field,
  readOnly,
  cropDefinitions: cropDefinitionsProp,
  fieldLabel: fieldLabelProp,
  mediaCollectionSlug: mediaCollectionSlugProp,
  generateCropEndpoint: generateCropEndpointProp,
}: Props) {
  const cropDefinitions: CropDefinition[] =
    cropDefinitionsProp ?? field?.admin?.custom?.cropDefinitions ?? []
  const fieldLabel: string =
    fieldLabelProp ?? field?.admin?.custom?.fieldLabel ?? 'Image'
  const mediaSlug: string =
    mediaCollectionSlugProp ?? field?.admin?.custom?.mediaCollectionSlug ?? 'media'
  const generateCropEndpoint: string =
    generateCropEndpointProp ??
    field?.admin?.custom?.generateCropEndpoint ??
    `/api/${mediaSlug}/generate-crop`

  const { value: imageRaw, setValue: setImageValue } = useField<MediaDoc | number | null>({
    path: `${path}.image`,
  })
  const { value: cropData, setValue: setCropData } = useField<CropData | null>({
    path: `${path}.cropData`,
  })
  const { value: generatedUrls, setValue: setGeneratedUrls } = useField<GeneratedUrls | null>({
    path: `${path}.generatedUrls`,
  })

  const imageDoc: MediaDoc | null =
    imageRaw !== null && typeof imageRaw !== 'number' ? imageRaw : null
  const imageId: number | string | null =
    imageDoc?.id ?? (typeof imageRaw === 'number' ? imageRaw : null)

  const [fetchedDoc, setFetchedDoc] = useState<MediaDoc | null>(null)
  const imageDocRef = useRef(imageDoc)
  imageDocRef.current = imageDoc

  // When the field is loaded with only an ID (depth=0), fetch the full doc
  useEffect(() => {
    if (!imageId || imageDocRef.current) {
      setFetchedDoc(null)
      return
    }
    fetch(`/api/${mediaSlug}/${imageId}?depth=0`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (isMediaDoc(data)) setFetchedDoc(data)
      })
      .catch(() => null)
  }, [imageId, mediaSlug])

  const media: MediaDoc | null = imageDoc ?? fetchedDoc

  const [ListDrawer, , { openDrawer: openMediaDrawer, closeDrawer: closeMediaDrawer }] =
    useListDrawer({ collectionSlugs: [mediaSlug] })

  const handleSelect = useCallback(
    ({ docID, doc }: { collectionSlug: string; docID: string; doc: { [key: string]: unknown } }) => {
      const newDoc: MediaDoc = {
        id: typeof doc.id === 'number' || typeof doc.id === 'string' ? doc.id : docID,
        url: typeof doc.url === 'string' ? doc.url : null,
        width: typeof doc.width === 'number' ? doc.width : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        filename: typeof doc.filename === 'string' ? doc.filename : null,
        alt: typeof doc.alt === 'string' ? doc.alt : null,
        updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      }
      if (String(newDoc.id) !== String(imageId)) {
        setCropData(null)
        setGeneratedUrls(null)
      }
      setImageValue(newDoc)
      setFetchedDoc(newDoc)
      closeMediaDrawer()
      setModalOpen(true) // auto-open crop modal after image selection
    },
    [imageId, setImageValue, setCropData, setGeneratedUrls, closeMediaDrawer],
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleSave = async (finalCrops: CropData) => {
    if (!media?.id) return

    setCropData(finalCrops)
    setModalOpen(false)
    setGenerating(true)

    const pending = cropDefinitions.flatMap((def) => {
      const coords = finalCrops[def.name]
      return coords ? [{ def, coords }] : []
    })

    const results = await Promise.all(
      pending.map(async ({ def, coords }) => {
        try {
          const res = await fetch(generateCropEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              mediaId: media.id,
              cropName: def.name,
              cropData: coords,
              outputWidth: def.width,
              outputHeight: def.height,
              quality: def.quality ?? 80,
              format: def.format ?? 'webp',
            }),
          })
          const data: unknown = await res.json()
          if (isRecord(data) && typeof data.url === 'string') {
            return { name: def.name, url: data.url }
          }
        } catch (e) {
          console.error(`[CropImageField] Network error for crop "${def.name}":`, e)
        }
        return null
      }),
    )

    const newUrls: GeneratedUrls = { ...(generatedUrls ?? {}) }
    for (const result of results) {
      if (result) newUrls[result.name] = result.url
    }

    setGeneratedUrls(newUrls)
    setGenerating(false)
  }

  const remove = () => {
    setImageValue(null)
    setCropData(null)
    setGeneratedUrls(null)
    setFetchedDoc(null)
  }

  const allCropsReady = cropDefinitions.every((d) => (generatedUrls ?? {})[d.name])
  const anyCropSet = cropDefinitions.some((d) => (cropData ?? {})[d.name])

  return (
    <div className={styles.wrap}>
      <div className={styles.labelWrap}>
        <label className={styles.label}>{fieldLabel}</label>
      </div>

      {!media ? (
        <div className={styles.empty}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={openMediaDrawer}
            disabled={readOnly}
          >
            Select Image
          </button>
        </div>
      ) : (
        <div className={styles.selected}>
          <div className={styles.thumbnail}>
            <img src={media.url ?? ''} alt={media.alt ?? ''} className={styles.thumbnailImg} />
          </div>

          <div className={styles.info}>
            <span className={styles.filename}>{media.filename}</span>

            {generating && <span className={styles.generating}>Generating crops…</span>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setModalOpen(true)}
                disabled={readOnly || generating}
              >
                {allCropsReady || anyCropSet ? 'Edit Crops' : 'Crop Image'}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={openMediaDrawer}
                disabled={readOnly}
              >
                Change
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={remove}
                disabled={readOnly}
              >
                Remove
              </button>
            </div>
          </div>

          <div className={styles.cropCards}>
            {cropDefinitions.map((def) => {
              const coordsSet = !!(cropData ?? {})[def.name]
              const url = (generatedUrls ?? {})[def.name]
              return (
                <div key={def.name} className={styles.cropCard}>
                  {url ? (
                    <img src={url} alt={def.label} className={styles.cropCardImg} />
                  ) : (
                    <div className={styles.cropCardEmpty}>
                      <span className={`${styles.dot}${coordsSet ? ` ${styles.dotSet}` : ''}`} />
                    </div>
                  )}
                  <span className={styles.cropCardLabel}>{def.label}</span>
                  <span className={styles.cropCardSize}>{def.width}×{def.height}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modalOpen && media?.url && (
        <CropModal
          mediaUrl={media.url}
          cropDefinitions={cropDefinitions}
          initialCropData={cropData ?? {}}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      <ListDrawer onSelect={handleSelect} />
    </div>
  )
}
```

---

## `src/CropImageField.module.css`

```css
.wrap {
  width: 100%;
  margin-bottom: calc(var(--base, 8px) * 2);
}

.labelWrap {
  margin-bottom: 8px;
}

.label {
  display: block;
  font-size: 11.2px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-elevation-400, #999);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  border: 1px dashed var(--theme-elevation-150, rgba(255, 255, 255, 0.15));
  border-radius: var(--style-radius-m, 4px);
  background: var(--theme-elevation-50, rgba(255, 255, 255, 0.03));
}

.selected {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--theme-elevation-150, rgba(255, 255, 255, 0.12));
  border-radius: var(--style-radius-m, 4px);
  background: var(--theme-elevation-50, rgba(255, 255, 255, 0.03));
}

.thumbnail {
  flex-shrink: 0;
  width: 96px;
  height: 72px;
  border-radius: var(--style-radius-s, 3px);
  overflow: hidden;
  background: var(--theme-elevation-100, rgba(255, 255, 255, 0.06));
}

.thumbnailImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filename {
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-text, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-elevation-300, rgba(255, 255, 255, 0.25));
}

.dotSet {
  background: var(--theme-success-500, #46c263);
}

.generating {
  font-size: 11px;
  color: var(--theme-elevation-500, rgba(255, 255, 255, 0.5));
  font-style: italic;
}

.cropCards {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
  align-items: flex-start;
}

.cropCard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.cropCardImg {
  height: 56px;
  width: auto;
  min-width: 40px;
  max-width: 120px;
  border-radius: 3px;
  display: block;
  object-fit: cover;
}

.cropCardEmpty {
  height: 56px;
  width: 72px;
  border-radius: 3px;
  background: var(--theme-elevation-100, rgba(255, 255, 255, 0.06));
  border: 1px dashed var(--theme-elevation-200, rgba(255, 255, 255, 0.12));
  display: flex;
  align-items: center;
  justify-content: center;
}

.cropCardLabel {
  font-size: 10px;
  font-weight: 500;
  color: var(--theme-elevation-600, rgba(255, 255, 255, 0.6));
  white-space: nowrap;
}

.cropCardSize {
  font-size: 10px;
  color: var(--theme-elevation-400, rgba(255, 255, 255, 0.35));
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.btnPrimary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 500;
  border-radius: var(--style-radius-s, 3px);
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, opacity 0.15s;
  background: var(--theme-text, #fff);
  color: var(--theme-bg, #0d0d0d);
}

.btnPrimary:disabled {
  opacity: 0.45;
  cursor: default;
}

.btnPrimary:not(:disabled):hover {
  opacity: 0.88;
}

.btnGhost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 500;
  border-radius: var(--style-radius-s, 3px);
  border: 1px solid var(--theme-elevation-200, rgba(255, 255, 255, 0.15));
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, opacity 0.15s;
  background: transparent;
  color: var(--theme-text, #fff);
}

.btnGhost:disabled {
  opacity: 0.4;
  cursor: default;
}

.btnGhost:not(:disabled):hover {
  border-color: var(--theme-elevation-400, rgba(255, 255, 255, 0.35));
}

.btnDanger {
  composes: btnGhost;
  color: var(--theme-error-500, #f44336);
  border-color: transparent;
}

.btnDanger:not(:disabled):hover {
  border-color: var(--theme-error-500, #f44336);
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 960px;
  height: calc(100vh - 32px);
  background: var(--theme-elevation-0, #111);
  border: 1px solid var(--theme-elevation-150, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.modalHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--theme-elevation-150, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
}

.modalTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text, #fff);
}

.modalClose {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--theme-elevation-500, rgba(255, 255, 255, 0.5));
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}

.modalClose:hover {
  color: var(--theme-text, #fff);
  background: var(--theme-elevation-100, rgba(255, 255, 255, 0.06));
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--theme-elevation-150, rgba(255, 255, 255, 0.1));
  padding: 0 20px;
  flex-shrink: 0;
  overflow-x: auto;
}

.tab {
  flex-shrink: 0;
  padding: 10px 16px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--theme-elevation-500, rgba(255, 255, 255, 0.5));
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s;
  white-space: nowrap;
}

.tab:hover {
  color: var(--theme-text, #fff);
}

.tabActive {
  color: var(--theme-text, #fff);
  border-bottom-color: var(--theme-text, #fff);
}

.cropArea {
  container-type: size;
  flex: 1;
  overflow: hidden;
  padding: 24px;
  background: var(--theme-elevation-100, rgba(255, 255, 255, 0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  --rc-drag-handle-bg-colour: rgba(255, 255, 255, 0.95);
  --rc-border-color: rgba(0, 0, 0, 0.45);
  --rc-drag-handle-size: 10px;
}

.cropImg {
  display: block;
  max-width: 100cqw;
  max-height: 100cqh;
  user-select: none;
}

.modalFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--theme-elevation-150, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
  gap: 12px;
}

.cropHint {
  font-size: 11.5px;
  color: var(--theme-elevation-500, rgba(255, 255, 255, 0.4));
}

.footerActions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.cropArea :global(.ReactCrop__child-wrapper) {
  overflow: visible;
}

.cropArea :global(.ReactCrop.ReactCrop--fixed-aspect) {
  overflow: visible;
}

/* Override react-image-crop's max-height: inherit which would overwrite our cqh constraint */
.cropArea :global(.ReactCrop__child-wrapper > img) {
  max-width: 100cqw;
  max-height: 100cqh;
}

.cropArea :global(.ReactCrop__drag-handle) {
  background-color: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.45);
  width: 10px;
  height: 10px;
}
```

---

## `src/index.ts`

Plugin factory and `cropImageField` field factory — the main entry point.

```ts
import type { Config, Field, Plugin } from 'payload'
import path from 'path'

import type { CropDefinition, CropImagePluginConfig } from './types'
import { makeGenerateCropHandler } from './handler'
import { makeDeleteOrphanedCrops } from './hook'

export type {
  CropDefinition,
  CropImagePluginConfig,
  CropImageValue,
  CropData,
  CropCoords,
  GeneratedUrls,
} from './types'

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function cropImagePlugin(pluginConfig: CropImagePluginConfig = {}): Plugin {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  const mediaDir = pluginConfig.mediaDir ?? path.join(process.cwd(), 'public/media')

  return (incomingConfig: Config): Config => {
    const collections = (incomingConfig.collections ?? []).map((collection) => {
      if (collection.slug !== mediaSlug) return collection

      return {
        ...collection,
        endpoints: [
          ...(collection.endpoints ?? []),
          {
            path: '/generate-crop',
            method: 'post' as const,
            handler: makeGenerateCropHandler(mediaDir, mediaSlug),
          },
        ],
        hooks: {
          ...collection.hooks,
          afterDelete: [
            ...(collection.hooks?.afterDelete ?? []),
            makeDeleteOrphanedCrops(mediaDir),
          ],
        },
      }
    })

    return { ...incomingConfig, collections }
  }
}

// ─── Field factory ────────────────────────────────────────────────────────────

export type CropImageFieldConfig = {
  name: string
  label?: string
  required?: boolean
  crops: CropDefinition[]
  admin?: {
    condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean
    description?: string
  }
  /** Override if your media collection uses a non-default slug. Defaults to 'media'. */
  mediaCollectionSlug?: string
}

export function cropImageField(config: CropImageFieldConfig): Field {
  const mediaSlug = config.mediaCollectionSlug ?? 'media'

  return {
    name: config.name,
    type: 'group',
    label: config.label ?? false,
    fields: [
      {
        name: 'image',
        type: 'upload',
        relationTo: mediaSlug,
        required: config.required ?? false,
      },
      {
        name: 'cropData',
        type: 'json',
      },
      {
        name: 'generatedUrls',
        type: 'json',
      },
    ],
    admin: {
      condition: config.admin?.condition,
      description: config.admin?.description,
      components: {
        Field: {
          // This path must resolve to the built CropImageField component.
          // In a published npm package this would be 'payload-plugin-crop-image/CropImageField'
          // or whatever the package's exports map points to for the component.
          path: 'payload-plugin-crop-image/CropImageField',
          exportName: 'CropImageField',
          clientProps: {
            cropDefinitions: config.crops,
            fieldLabel: config.label ?? config.name,
            mediaCollectionSlug: mediaSlug,
            generateCropEndpoint: `/api/${mediaSlug}/generate-crop`,
          },
        },
      },
    },
  }
}
```

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Consumer Integration

### 1. Register the plugin in `payload.config.ts`

```ts
import { cropImagePlugin } from 'payload-plugin-crop-image'

export default buildConfig({
  plugins: [
    cropImagePlugin({
      // mediaCollectionSlug: 'media',                           // default
      // mediaDir: path.join(process.cwd(), 'public/media'),     // default
    }),
  ],
})
```

### 2. Add the field to any collection or global

```ts
import { cropImageField } from 'payload-plugin-crop-image'

export const HeroFields = [
  cropImageField({
    name: 'heroImage',
    label: 'Hero Image',
    required: true,
    crops: [
      {
        name: 'desktop',
        label: 'Desktop',
        aspectRatio: 16 / 9,
        width: 1920,
        height: 1080,
        format: 'webp',
        quality: 80,
      },
      {
        name: 'mobile',
        label: 'Mobile',
        aspectRatio: 9 / 16,
        width: 828,
        height: 1470,
        format: 'webp',
        quality: 75,
      },
    ],
  }),
]
```

### 3. Render in frontend components

```tsx
import { getCropUrl, resolveMediaCrop } from 'payload-plugin-crop-image/utilities'

// Option A: just get the URL
const desktopUrl = getCropUrl(page.heroImage, 'desktop')

// Option B: get a Media-shaped object (drop-in for any component accepting a Media prop)
const desktopMedia = resolveMediaCrop(page.heroImage, 'desktop', { width: 1920, height: 1080 })
```

---

## Key Design Decisions and Constraints

**Crop files are not Payload documents.** They are plain files written to `public/media/` (or your configured `mediaDir`) and served by Next.js as static assets. They do not appear in the media library. This is intentional — they are derivatives of a source image, not independently managed assets.

**Deterministic filenames encode all parameters.** Pattern: `{base}-crop-{cropName}-{x}-{y}-{w}x{h}-{outputW}x{outputH}.{ext}`. Any change to crop coordinates or dimensions produces a new filename, and the old one must be explicitly deleted. The handler does this automatically.

**The `generate-crop` endpoint uses `overrideAccess: false`** when fetching the media document, so it respects collection-level read access. The user must also be authenticated (`req.user` guard at the top of the handler).

**Cleanup is two-layered:**
- *Same-slot regeneration*: the handler scans for `{base}-crop-{cropName}-*` and deletes anything that is not the exact target filename before writing the new file.
- *Source deletion*: the `afterDelete` hook scans for `{base}-crop-*` and deletes all derived files.

**The `deleteOrphanedCrops` hook is appended, not replaced**, in case the consuming application already has its own `afterDelete` hooks on the media collection. The plugin merges via spread in `makeDeleteOrphanedCrops`.

**CSS Modules are required.** Payload's Turbopack/webpack config supports CSS Modules out of the box; no extra configuration needed in the consumer application.

**`react-image-crop` must be a direct dependency of the plugin**, not a peer, because the component imports its CSS (`import 'react-image-crop/dist/ReactCrop.css'`). Consumers should not need to install it separately.

**Container Query Units (`cqw`/`cqh`)** are used on `.cropImg` to keep the image within the crop area regardless of viewport size. The `.cropArea` element sets `container-type: size` to establish the context. Browser support: Chromium 105+, Firefox 110+, Safari 16+.

**The crop modal auto-opens after image selection** because cropping is mandatory wherever this field is used. This is implemented by calling `setModalOpen(true)` at the end of the `handleSelect` callback, after `closeMediaDrawer()`.

**All crop generation calls are concurrent.** `Promise.all` is used to fire all slot generation requests in parallel, keeping latency proportional to the slowest single crop rather than the sum of all crops.
