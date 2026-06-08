'use client'

import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { CropData, CropDefinition } from '../types.js'
import { computeMinCrop, initCrop, percentCropToCoords, type MinCrop } from '../crop-geometry.js'
import { usePluginTranslation } from './usePluginTranslation.js'
import { useResolveLabel } from './useResolveLabel.js'
import styles from './CropImageField.module.css'

type CropModalProps = {
  cropDefinitions: CropDefinition[]
  initialCropData: CropData
  mediaUrl: string
  onClose: () => void
  onSave: (finalCrops: CropData) => void
}

export function CropModal({
  cropDefinitions,
  initialCropData,
  mediaUrl,
  onClose,
  onSave,
}: CropModalProps) {
  const t = usePluginTranslation()
  const resolveL = useResolveLabel()
  const [activeTab, setActiveTab] = useState<string>(cropDefinitions[0]?.name ?? '')
  const [pendingCrops, setPendingCrops] = useState<CropData>(initialCropData)
  const [percentCrop, setPercentCrop] = useState<PercentCrop | undefined>()
  const [minCrop, setMinCrop] = useState<MinCrop | undefined>()
  const imgRef = useRef<HTMLImageElement>(null)

  const activeDef = cropDefinitions.find((d) => d.name === activeTab)
  const activeLabel = activeDef ? resolveL(activeDef.label) : ''

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget
      const { naturalWidth: w, naturalHeight: h } = img
      const mc = activeDef ? computeMinCrop(img, activeDef) : undefined
      setMinCrop(mc)
      setPercentCrop(initCrop(w, h, activeDef?.aspectRatio, pendingCrops[activeTab], mc))
    },
    [activeDef, pendingCrops, activeTab],
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
      const mc = def ? computeMinCrop(img, def) : undefined
      setMinCrop(mc)
      setPercentCrop(initCrop(img.naturalWidth, img.naturalHeight, def?.aspectRatio, existing, mc))
    } else {
      setMinCrop(undefined)
      setPercentCrop(existing ? { unit: '%', ...existing } : undefined)
    }
  }

  const handleSave = () => {
    onSave({
      ...pendingCrops,
      ...(percentCrop ? { [activeTab]: percentCropToCoords(percentCrop) } : {}),
    })
  }

  // Only treat a backdrop click as a close request when the press *started* on the
  // backdrop itself. Otherwise a crop drag that begins inside the modal and releases
  // over the backdrop would fire a click on the backdrop and close the window.
  const pressStartedOnBackdrop = useRef(false)

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    pressStartedOnBackdrop.current = e.target === e.currentTarget
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && pressStartedOnBackdrop.current) {
      onClose()
    }
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('cropImage')}</h2>
          <button
            aria-label={t('close')}
            className={styles.modalClose}
            onClick={onClose}
            type="button"
          >
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
              {resolveL(def.label)}
            </button>
          ))}
        </div>

        <div className={styles.cropArea}>
          <ReactCrop
            aspect={activeDef?.aspectRatio}
            crop={percentCrop}
            keepSelection
            minHeight={minCrop?.displayHeight}
            minWidth={minCrop?.displayWidth}
            onChange={(_, pct) => setPercentCrop(pct)}
          >
            <img
              alt={t('cropSource')}
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
                ? `${activeLabel} — ${t('sizeCount', { count: activeDef.sizes.length })}`
                : `${activeLabel} — ${activeDef.width} × ${activeDef.height} px`)}
          </span>
          <div className={styles.footerActions}>
            <button className={styles.btnGhost} onClick={onClose} type="button">
              {t('cancel')}
            </button>
            <button className={styles.btnPrimary} onClick={handleSave} type="button">
              {t('saveAndGenerate')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
