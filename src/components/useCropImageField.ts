'use client'

import type { Validate } from 'payload'

import { useDocumentDrawer, useField, useListDrawer } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { FocalPoint } from '../crop-geometry.js'
import type { CropData, CropDefinition, GeneratedUrls } from '../types.js'

import { cropTargets, sameCoords } from '../crop-targets.js'
import { isRecord } from '../isRecord.js'

export type MediaDoc = {
  alt?: null | string
  filename?: null | string
  filesize?: null | number
  focalX?: null | number
  focalY?: null | number
  height?: null | number
  id: number | string
  mimeType?: null | string
  url?: null | string
  width?: null | number
}

function isMediaDoc(v: unknown): v is MediaDoc {
  return isRecord(v) && 'id' in v
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`
  }
  return `${Math.round(bytes / 1_000)}KB`
}

export function useCropImageField(args: {
  apiRoute: string
  cropDefinitions: CropDefinition[]
  mediaCollectionSlug: string
  path: string
  required: boolean
}) {
  const { apiRoute, cropDefinitions, mediaCollectionSlug, path, required } = args

  const validateImage = useCallback<Validate>(
    (value, { req: { t } }) =>
      required && !value && typeof value !== 'number' ? t('validation:required') : true,
    [required],
  )

  const {
    filterOptions,
    setValue: setImageValue,
    showError,
    value: imageRaw,
  } = useField<MediaDoc | null | number>({
    path: `${path}.image`,
    validate: validateImage,
  })
  const {
    setValue: setCropData,
    showError: showCropDataError,
    value: cropData,
  } = useField<CropData | null>({
    path: `${path}.cropData`,
  })
  const { setValue: setGeneratedUrls, value: generatedUrls } = useField<GeneratedUrls | null>({
    path: `${path}.generatedUrls`,
  })

  const imageDoc: MediaDoc | null =
    imageRaw !== null && typeof imageRaw !== 'number' && typeof imageRaw !== 'string'
      ? imageRaw
      : null
  const imageId: null | number | string =
    imageDoc?.id ?? (typeof imageRaw === 'number' || typeof imageRaw === 'string' ? imageRaw : null)

  const [fetchedDoc, setFetchedDoc] = useState<MediaDoc | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // imageDoc from Payload's form store may be incomplete (only {id}, no url/filename)
  // when the form loads from the DB — always fetch the full doc when imageId changes.
  // Also re-read on modal open: focalX/focalY may have changed since page load (e.g.
  // via Payload's own image editor in another tab) and nothing else would refetch.
  useEffect(() => {
    if (!imageId) {
      setFetchedDoc(null)
      return
    }
    const controller = new AbortController()
    fetch(`${apiRoute}/${mediaCollectionSlug}/${imageId}?depth=0`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (isMediaDoc(data)) {
          setFetchedDoc(data)
        }
      })
      .catch(() => null)
    return () => controller.abort()
  }, [imageId, mediaCollectionSlug, modalOpen])

  // fetchedDoc takes priority: it always has all fields; imageDoc may have only {id}.
  const media: MediaDoc | null = imageId ? (fetchedDoc ?? imageDoc) : null

  const [ListDrawer, , { closeDrawer: closeMediaDrawer, openDrawer: openMediaDrawer }] =
    useListDrawer({
      collectionSlugs: [mediaCollectionSlug],
      filterOptions,
    })

  const [CreateMediaDrawer, , { closeDrawer: closeCreateDrawer, openDrawer: openCreateDrawer }] =
    useDocumentDrawer({ collectionSlug: mediaCollectionSlug })

  const [previewOpen, setPreviewOpen] = useState(false)

  const selectDoc = useCallback(
    (doc: Record<string, unknown>, docID: string) => {
      const newDoc: MediaDoc = {
        id: typeof doc.id === 'number' || typeof doc.id === 'string' ? doc.id : docID,
        alt: typeof doc.alt === 'string' ? doc.alt : null,
        filename: typeof doc.filename === 'string' ? doc.filename : null,
        filesize: typeof doc.filesize === 'number' ? doc.filesize : null,
        focalX: typeof doc.focalX === 'number' ? doc.focalX : null,
        focalY: typeof doc.focalY === 'number' ? doc.focalY : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
        url: typeof doc.url === 'string' ? doc.url : null,
        width: typeof doc.width === 'number' ? doc.width : null,
      }
      if (String(newDoc.id) !== String(imageId)) {
        setCropData(null)
        setGeneratedUrls(null)
      }
      setImageValue(newDoc)
      setFetchedDoc(newDoc)
      setModalOpen(true)
    },
    [imageId, setImageValue, setCropData, setGeneratedUrls],
  )

  const handleListSelect = useCallback(
    ({ doc, docID }: { collectionSlug: string; doc: Record<string, unknown>; docID: string }) => {
      closeMediaDrawer()
      selectDoc(doc, docID)
    },
    [selectDoc, closeMediaDrawer],
  )

  const handleDocCreate = useCallback(
    ({ doc }: { doc: { [key: string]: unknown; id?: number | string } }) => {
      const id = typeof doc.id === 'string' || typeof doc.id === 'number' ? String(doc.id) : ''
      if (id) {
        selectDoc(doc, id)
        closeCreateDrawer()
      }
    },
    [selectDoc, closeCreateDrawer],
  )

  const handleSave = async (finalCrops: CropData, focal?: FocalPoint) => {
    if (!media?.id) {
      return
    }

    // Crops render on the server when the document saves. Until then, drop the URLs of
    // crops that changed so the preview never shows an image that no longer matches.
    const prevCrops = cropData ?? {}
    const prevUrls = generatedUrls ?? {}
    const keptUrls: GeneratedUrls = {}
    for (const { name, coords, key } of cropTargets(cropDefinitions, finalCrops)) {
      if (prevUrls[key] && sameCoords(prevCrops[name], coords)) {
        keptUrls[key] = prevUrls[key]
      }
    }
    setCropData(finalCrops)
    setGeneratedUrls(keptUrls)
    setModalOpen(false)

    // The focal point lives on the media doc, in the same focalX/focalY fields
    // Payload's own image editor writes to — one source of truth, so the stored
    // value stays in sync between both UIs. Note this does not re-crop Payload's
    // upload.imageSizes: it only re-derives those when the request carries a file
    // (see uploads/generateFileData.ts), so consumers should read the point at
    // render time via getFocalPosition. Undefined when the field has
    // focalPoint:false — never touch the media doc in that case.
    if (!focal || (focal.x === media.focalX && focal.y === media.focalY)) {
      return
    }
    const saved = await fetch(`${apiRoute}/${mediaCollectionSlug}/${media.id}`, {
      body: JSON.stringify({ focalX: focal.x, focalY: focal.y }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    })
      .then((res) => res.ok)
      .catch((e: unknown) => {
        console.error('[CropImageField] Failed to save focal point:', e)
        return false
      })
    if (saved) {
      setFetchedDoc((prev) => (prev ? { ...prev, focalX: focal.x, focalY: focal.y } : prev))
    }
  }

  const remove = () => {
    setImageValue(null)
    setCropData(null)
    setGeneratedUrls(null)
    setFetchedDoc(null)
  }

  const urls = generatedUrls ?? {}
  const crops = cropData ?? {}
  const anyCropSet = cropDefinitions.some((d) => crops[d.name])
  const allCropsReady = cropDefinitions.every((d) =>
    d.sizes ? d.sizes.every((s) => urls[`${d.name}.${s.name}`]) : Boolean(urls[d.name]),
  )

  const fileMeta = media
    ? [
        media.filesize ? formatFileSize(media.filesize) : null,
        media.width && media.height ? `${media.width}×${media.height}` : null,
        media.mimeType ?? null,
      ]
        .filter(Boolean)
        .join(' — ')
    : null

  return {
    allCropsReady,
    anyCropSet,
    CreateMediaDrawer,
    crops,
    fileMeta,
    handleDocCreate,
    handleListSelect,
    handleSave,
    ListDrawer,
    media,
    modalOpen,
    openCreateDrawer,
    openMediaDrawer,
    previewOpen,
    remove,
    setModalOpen,
    setPreviewOpen,
    showCropDataError,
    showError,
    urls,
  }
}
