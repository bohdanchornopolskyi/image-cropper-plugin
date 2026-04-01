'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useField, useListDrawer } from '@payloadcms/ui'

import type { CropCoords, CropData, CropDefinition, GeneratedUrls } from '../types.js'
import { isRecord } from '../isRecord.js'
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
  cropDefinitions?: CropDefinition[]
  fieldLabel?: string
  mediaCollectionSlug?: string
  generateCropEndpoint?: string
  readOnly?: boolean
}

function isMediaDoc(v: unknown): v is MediaDoc {
  return isRecord(v) && 'id' in v
}

function initCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
  existing: CropCoords | undefined,
): PercentCrop {
  if (existing) {
    return {
      unit: '%',
      x: existing.x,
      y: existing.y,
      width: existing.width,
      height: existing.height,
    }
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

function percentCropToCoords(pct: PercentCrop): CropCoords {
  return { x: pct.x, y: pct.y, width: pct.width, height: pct.height }
}

type CropModalProps = {
  mediaUrl: string
  cropDefinitions: CropDefinition[]
  initialCropData: CropData
  onClose: () => void
  onSave: (finalCrops: CropData) => void
}

function CropModal({
  mediaUrl,
  cropDefinitions,
  initialCropData,
  onClose,
  onSave,
}: CropModalProps) {
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
      setPendingCrops((prev) => ({ ...prev, [activeTab]: percentCropToCoords(percentCrop) }))
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
    onSave({
      ...pendingCrops,
      ...(percentCrop ? { [activeTab]: percentCropToCoords(percentCrop) } : {}),
    })
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Crop Image</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          {cropDefinitions.map((def) => (
            <button
              key={def.name}
              type="button"
              className={`${styles.tab}${activeTab === def.name ? ` ${styles.tabActive}` : ''}`}
              onClick={() => switchTab(def.name)}
            >
              {def.label}
            </button>
          ))}
        </div>

        <div className={styles.cropArea}>
          <ReactCrop
            crop={percentCrop}
            onChange={(_, pct) => setPercentCrop(pct)}
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
    </div>,
    document.body,
  )
}

export function CropImageField({
  path,
  cropDefinitions = [],
  fieldLabel = 'Image',
  mediaCollectionSlug = 'media',
  generateCropEndpoint,
  readOnly,
}: Props) {
  const endpoint = generateCropEndpoint ?? `/api/${mediaCollectionSlug}/generate-crop`

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

  useEffect(() => {
    if (!imageId || imageDocRef.current) {
      setFetchedDoc(null)
      return
    }
    fetch(`/api/${mediaCollectionSlug}/${imageId}?depth=0`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (isMediaDoc(data)) setFetchedDoc(data)
      })
      .catch(() => null)
  }, [imageId, mediaCollectionSlug])

  const media: MediaDoc | null = imageDoc ?? fetchedDoc

  const [ListDrawer, , { openDrawer: openMediaDrawer, closeDrawer: closeMediaDrawer }] =
    useListDrawer({ collectionSlugs: [mediaCollectionSlug] })

  const handleSelect = useCallback(
    ({ docID, doc }: { collectionSlug: string; docID: string; doc: Record<string, unknown> }) => {
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
      setModalOpen(true)
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

    const results = await Promise.all(
      cropDefinitions.flatMap((def) => {
        const coords = finalCrops[def.name]
        if (!coords) return []
        return [
          fetch(endpoint, {
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
            .then((res) => res.json())
            .then((data: unknown) => {
              if (isRecord(data) && typeof data.url === 'string') {
                return { name: def.name, url: data.url }
              }
              return null
            })
            .catch((e: unknown) => {
              console.error(`[CropImageField] Network error for crop "${def.name}":`, e)
              return null
            }),
        ]
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

  const urls = generatedUrls ?? {}
  const crops = cropData ?? {}
  const allCropsReady = cropDefinitions.every((d) => urls[d.name])
  const anyCropSet = cropDefinitions.some((d) => crops[d.name])

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
              const url = urls[def.name]
              return (
                <div key={def.name} className={styles.cropCard}>
                  {url ? (
                    <img src={url} alt={def.label} className={styles.cropCardImg} />
                  ) : (
                    <div className={styles.cropCardEmpty}>
                      <span
                        className={`${styles.dot}${crops[def.name] ? ` ${styles.dotSet}` : ''}`}
                      />
                    </div>
                  )}
                  <span className={styles.cropCardLabel}>{def.label}</span>
                  <span className={styles.cropCardSize}>
                    {def.width}×{def.height}
                  </span>
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
