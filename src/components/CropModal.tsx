'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { CropCoords, CropData, CropDefinition } from '../types.js'

import {
  clampPct,
  clampToCrop,
  computeMinCrop,
  cropCenter,
  DEFAULT_FOCAL,
  focalInCrop,
  type FocalPoint,
  initCrop,
  type MinCrop,
  percentCropToCoords,
} from '../crop-geometry.js'
import styles from './CropImageField.module.css'
import { usePluginTranslation } from './usePluginTranslation.js'
import { useResolveLabel } from './useResolveLabel.js'

type CropModalProps = {
  cropDefinitions: CropDefinition[]
  /** When false, no marker and no focal write — crops just seed from the centre. */
  focalPoint: boolean
  focalX?: null | number
  focalY?: null | number
  initialCropData: CropData
  mediaUrl: string
  onClose: () => void
  onSave: (finalCrops: CropData, focal?: FocalPoint) => void
}

export function CropModal({
  cropDefinitions,
  focalPoint,
  focalX,
  focalY,
  initialCropData,
  mediaUrl,
  onClose,
  onSave,
}: CropModalProps) {
  const t = usePluginTranslation()
  const resolveL = useResolveLabel()
  const [focal, setFocal] = useState<FocalPoint>(() =>
    focalPoint && typeof focalX === 'number' && typeof focalY === 'number'
      ? { x: focalX, y: focalY }
      : DEFAULT_FOCAL,
  )
  const [activeTab, setActiveTab] = useState<string>(cropDefinitions[0]?.name ?? '')
  const [pendingCrops, setPendingCrops] = useState<CropData>(initialCropData)
  const [percentCrop, setPercentCrop] = useState<PercentCrop | undefined>()
  const [minCrop, setMinCrop] = useState<MinCrop | undefined>()
  const imgRef = useRef<HTMLImageElement>(null)

  const activeDef = cropDefinitions.find((d) => d.name === activeTab)
  const activeLabel = activeDef ? resolveL(activeDef.label) : ''

  // `initCrop` owns the reconcile rule: passing the focal point lets it drop a
  // stored crop that no longer contains it. Pass none when the field opted out.
  const seedCrop = (
    img: HTMLImageElement,
    def: CropDefinition | undefined,
    existing: CropCoords | undefined,
  ) => {
    const mc = def ? computeMinCrop(img, def) : undefined
    setMinCrop(mc)
    setPercentCrop(
      initCrop(
        img.naturalWidth,
        img.naturalHeight,
        def?.aspectRatio,
        existing,
        mc,
        focalPoint ? focal : undefined,
      ),
    )
  }

  const switchTab = (name: string) => {
    if (percentCrop) {
      setPendingCrops((prev) => ({ ...prev, [activeTab]: percentCropToCoords(percentCrop) }))
    }
    setActiveTab(name)
    const def = cropDefinitions.find((d) => d.name === name)
    const existing = pendingCrops[name] ?? initialCropData[name]
    const img = imgRef.current
    if (img) {
      seedCrop(img, def, existing)
    } else {
      setMinCrop(undefined)
      setPercentCrop(existing ? { unit: '%', ...existing } : undefined)
    }
  }

  // The point may never leave the crop box, whether it's moved by drag or by input.
  const applyFocal = (next: FocalPoint) =>
    setFocal(percentCrop ? clampToCrop(next, percentCrop) : next)

  // Measured against the image, not the marker, so the drag tracks the pointer
  // exactly instead of accumulating offsets.
  const setFocalFromPointer = (e: React.PointerEvent) => {
    const img = imgRef.current
    if (!img) {
      return
    }
    const box = img.getBoundingClientRect()
    applyFocal({
      x: clampPct(((e.clientX - box.left) / box.width) * 100),
      y: clampPct(((e.clientY - box.top) / box.height) * 100),
    })
  }

  // Moving or resizing the box away from the point takes the point with it: the
  // focal point lands in the middle of wherever the crop ended up. Bound to
  // onComplete, not onChange, so the point doesn't chase the box mid-drag.
  const onCropComplete = (pct: PercentCrop) => {
    if (focalPoint) {
      setFocal((f) => (focalInCrop(f, pct) ? f : cropCenter(pct)))
    }
  }

  const handleSave = () => {
    onSave(
      {
        ...pendingCrops,
        ...(percentCrop ? { [activeTab]: percentCropToCoords(percentCrop) } : {}),
      },
      focalPoint ? focal : undefined,
    )
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
            onComplete={(_, pct) => onCropComplete(pct)}
          >
            <img
              alt={t('cropSource')}
              className={styles.cropImg}
              draggable={false}
              onLoad={(e) => seedCrop(e.currentTarget, activeDef, pendingCrops[activeTab])}
              ref={imgRef}
              src={mediaUrl}
            />
            {/* stopPropagation keeps the grab away from ReactCrop, which would
                otherwise start moving the selection instead. The X/Y inputs in the
                footer are the keyboard path to the same value. */}
            {focalPoint && (
              <span
                className={styles.focalDot}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.stopPropagation()
                    setFocalFromPointer(e)
                  }
                }}
                style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
              />
            )}
          </ReactCrop>
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.cropHint}>
            {activeDef &&
              (activeDef.sizes
                ? `${activeLabel} — ${t('sizeCount', { count: activeDef.sizes.length })}`
                : `${activeLabel} — ${activeDef.width} × ${activeDef.height} px`)}
          </span>
          {focalPoint && (
            <div className={styles.focalInputs}>
              <span className={styles.focalInputLabel}>{t('focalPoint')}</span>
              {(['x', 'y'] as const).map((axis) => (
                <label className={styles.focalInputLabel} key={axis}>
                  {axis.toUpperCase()}
                  <input
                    aria-label={`${t('focalPoint')} ${axis.toUpperCase()} %`}
                    className={styles.focalInput}
                    max={100}
                    min={0}
                    onChange={(e) =>
                      applyFocal({ ...focal, [axis]: clampPct(Number(e.target.value)) })
                    }
                    type="number"
                    value={Math.round(focal[axis])}
                  />
                </label>
              ))}
            </div>
          )}
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
