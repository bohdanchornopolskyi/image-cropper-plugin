'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Button, useDocumentDrawer, useField, useListDrawer, useConfig } from '@payloadcms/ui'

import type { CropCoords, CropData, CropDefinition, GeneratedUrls } from '../types.js'
import { isRecord } from '../isRecord.js'
import styles from './CropImageField.module.css'

type MediaDoc = {
  id: number | string
  url?: string | null
  width?: number | null
  height?: number | null
  filename?: string | null
  filesize?: number | null
  mimeType?: string | null
  alt?: string | null
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

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  return `${Math.round(bytes / 1_000)}KB`
}

function Icon({
  children,
  strokeLinejoin,
  strokeWidth = '1.5',
}: {
  children: ReactNode
  strokeLinejoin?: 'round'
  strokeWidth?: string
}) {
  return (
    <svg
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin={strokeLinejoin}
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}

function CropIcon() {
  return (
    <Icon>
      <polyline points="6,2 6,18 22,18" />
      <polyline points="2,6 18,6 18,22" />
    </Icon>
  )
}

function EditSvg() {
  return (
    <Icon strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Icon>
  )
}

function XSvg() {
  return (
    <Icon strokeWidth="2">
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </Icon>
  )
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
  cropDefinitions: CropDefinition[]
  initialCropData: CropData
  mediaUrl: string
  onClose: () => void
  onSave: (finalCrops: CropData) => void
}

function CropModal({
  cropDefinitions,
  initialCropData,
  mediaUrl,
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
          <button aria-label="Close" className={styles.modalClose} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          {cropDefinitions.map((def) => (
            <button
              className={`${styles.tab}${activeTab === def.name ? ` ${styles.tabActive}` : ''}`}
              key={def.name}
              onClick={() => switchTab(def.name)}
              type="button"
            >
              {def.label}
            </button>
          ))}
        </div>

        <div className={styles.cropArea}>
          <ReactCrop
            aspect={activeDef?.aspectRatio}
            crop={percentCrop}
            keepSelection
            onChange={(_, pct) => setPercentCrop(pct)}
          >
            <img
              alt="Crop source"
              className={styles.cropImg}
              draggable={false}
              onLoad={onImageLoad}
              ref={imgRef}
              src={mediaUrl}
            />
          </ReactCrop>
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.cropHint}>
            {activeDef &&
              (activeDef.sizes
                ? `${activeDef.label} — ${activeDef.sizes.length} size${activeDef.sizes.length === 1 ? '' : 's'}`
                : `${activeDef.label} — ${activeDef.width} × ${activeDef.height} px`)}
          </span>
          <div className={styles.footerActions}>
            <button className={styles.btnGhost} onClick={onClose} type="button">
              Cancel
            </button>
            <button className={styles.btnPrimary} onClick={handleSave} type="button">
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
  const { config } = useConfig()
  const apiRoute = config.routes.api || '/api'
  const endpoint = generateCropEndpoint ?? `${apiRoute}/${mediaCollectionSlug}/generate-crop`

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
    imageRaw !== null && typeof imageRaw !== 'number' && typeof imageRaw !== 'string'
      ? imageRaw
      : null
  const imageId: number | string | null =
    imageDoc?.id ?? (typeof imageRaw === 'number' || typeof imageRaw === 'string' ? imageRaw : null)

  const [fetchedDoc, setFetchedDoc] = useState<MediaDoc | null>(null)

  // imageDoc from Payload's form store may be incomplete (only {id}, no url/filename)
  // when the form loads from the DB — always fetch the full doc when imageId changes.
  useEffect(() => {
    if (!imageId) {
      setFetchedDoc(null)
      return
    }
    const controller = new AbortController()
    fetch(`${apiRoute}/${mediaCollectionSlug}/${imageId}?depth=0`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (isMediaDoc(data)) setFetchedDoc(data)
      })
      .catch(() => null)
    return () => controller.abort()
  }, [imageId, mediaCollectionSlug])

  // fetchedDoc takes priority: it always has all fields; imageDoc may have only {id}.
  const media: MediaDoc | null = imageId ? (fetchedDoc ?? imageDoc) : null

  const [ListDrawer, , { openDrawer: openMediaDrawer, closeDrawer: closeMediaDrawer }] =
    useListDrawer({
      collectionSlugs: [mediaCollectionSlug],
    })

  const [CreateMediaDrawer, , { openDrawer: openCreateDrawer, closeDrawer: closeCreateDrawer }] =
    useDocumentDrawer({ collectionSlug: mediaCollectionSlug })

  const selectDoc = useCallback(
    (doc: Record<string, unknown>, docID: string) => {
      const newDoc: MediaDoc = {
        id: typeof doc.id === 'number' || typeof doc.id === 'string' ? doc.id : docID,
        url: typeof doc.url === 'string' ? doc.url : null,
        width: typeof doc.width === 'number' ? doc.width : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        filename: typeof doc.filename === 'string' ? doc.filename : null,
        filesize: typeof doc.filesize === 'number' ? doc.filesize : null,
        mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
        alt: typeof doc.alt === 'string' ? doc.alt : null,
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
    ({ docID, doc }: { collectionSlug: string; docID: string; doc: Record<string, unknown> }) => {
      closeMediaDrawer()
      selectDoc(doc, docID)
    },
    [selectDoc, closeMediaDrawer],
  )

  const handleDocCreate = useCallback(
    ({ doc }: { doc: { id?: string | number; [key: string]: unknown } }) => {
      const id = typeof doc.id === 'string' || typeof doc.id === 'number' ? String(doc.id) : ''
      if (id) {
        selectDoc(doc, id)
        closeCreateDrawer()
      }
    },
    [selectDoc, closeCreateDrawer],
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

        const targets = def.sizes
          ? def.sizes.map((s) => ({ key: `${def.name}.${s.name}`, width: s.width, height: s.height }))
          : [{ key: def.name, width: def.width, height: def.height }]

        return targets.map(({ key, width, height }) =>
          fetch(endpoint, {
            body: JSON.stringify({
              cropData: coords,
              cropName: key,
              format: def.format ?? 'webp',
              mediaId: media.id,
              outputHeight: height,
              outputWidth: width,
              quality: def.quality ?? 80,
            }),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          })
            .then((res) => res.json())
            .then((data: unknown) => {
              if (isRecord(data) && typeof data.url === 'string') {
                return { name: key, url: data.url }
              }
              return null
            })
            .catch((e: unknown) => {
              console.error(`[CropImageField] Network error for crop "${key}":`, e)
              return null
            }),
        )
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

  return (
    <div className={styles.wrap}>
      <div className={styles.labelWrap}>
        <label className={styles.label}>{fieldLabel}</label>
      </div>

      {!media ? (
        <div className="dropzone">
          <div className="upload__dropzoneContent">
            <div className="upload__dropzoneContent__buttons">
              <Button
                buttonStyle="pill"
                disabled={readOnly}
                onClick={openCreateDrawer}
                size="small"
                type="button"
              >
                Create New
              </Button>
              <span className="upload__dropzoneContent__orText">or</span>
              <Button
                buttonStyle="pill"
                disabled={readOnly}
                onClick={openMediaDrawer}
                size="small"
                type="button"
              >
                Choose from existing
              </Button>
            </div>
            <p className="upload__dragAndDropText">or drag and drop a file</p>
          </div>
        </div>
      ) : (
        <div className={`file-details ${styles.selectedWrap}`}>
          <header className={styles.selectedHeader}>
            <img alt={media.alt ?? ''} className={styles.thumb} src={media.url ?? ''} />

            <div className={styles.mainDetail}>
              <span className={styles.filename}>{media.filename}</span>
              {fileMeta && <span className={styles.fileMeta}>{fileMeta}</span>}
              {generating && <span className={styles.generating}>Generating crops…</span>}
            </div>

            <div className={styles.iconActions}>
              <button
                className={styles.iconBtn}
                disabled={readOnly || generating}
                onClick={() => setModalOpen(true)}
                title={allCropsReady || anyCropSet ? 'Edit Crops' : 'Crop Image'}
                type="button"
              >
                <CropIcon />
              </button>
              <button
                className={styles.iconBtn}
                disabled={readOnly}
                onClick={openMediaDrawer}
                title="Change image"
                type="button"
              >
                <EditSvg />
              </button>
              <button
                className={styles.iconBtn}
                disabled={readOnly}
                onClick={remove}
                title="Remove"
                type="button"
              >
                <XSvg />
              </button>
            </div>
          </header>

          {cropDefinitions.length > 0 && (
            <div className={styles.cropCards}>
              {cropDefinitions.flatMap((def) => {
                if (def.sizes) {
                  return def.sizes.map((size) => {
                    const key = `${def.name}.${size.name}`
                    const url = urls[key]
                    return (
                      <div className={styles.cropCard} key={key}>
                        {url ? (
                          <img
                            alt={`${def.label} — ${size.label ?? size.name}`}
                            className={styles.cropCardImg}
                            src={url}
                          />
                        ) : (
                          <div className={styles.cropCardEmpty}>
                            <span
                              className={`${styles.dot}${crops[def.name] ? ` ${styles.dotSet}` : ''}`}
                            />
                          </div>
                        )}
                        <span className={styles.cropCardLabel}>{def.label}</span>
                        <span className={styles.cropCardSize}>
                          {size.label ?? size.name} — {size.width}×{size.height}
                        </span>
                      </div>
                    )
                  })
                }
                const url = urls[def.name]
                return [
                  <div className={styles.cropCard} key={def.name}>
                    {url ? (
                      <img alt={def.label} className={styles.cropCardImg} src={url} />
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
                  </div>,
                ]
              })}
            </div>
          )}
        </div>
      )}

      {modalOpen && media?.url && (
        <CropModal
          cropDefinitions={cropDefinitions}
          initialCropData={cropData ?? {}}
          mediaUrl={media.url}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      <ListDrawer onSelect={handleListSelect} />
      <CreateMediaDrawer onSave={handleDocCreate} />
    </div>
  )
}
