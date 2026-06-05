'use client'

import { createPortal } from 'react-dom'

import type { CropData, CropDefinition, GeneratedUrls } from '../types.js'
import { useResolveLabel } from './useResolveLabel.js'
import styles from './CropImageField.module.css'

function CropCards({
  cropDefinitions,
  crops,
  urls,
}: {
  cropDefinitions: CropDefinition[]
  crops: CropData
  urls: GeneratedUrls
}) {
  const resolveL = useResolveLabel()
  const cards = cropDefinitions.flatMap((def) => {
    const defLabel = resolveL(def.label)
    return def.sizes
      ? def.sizes.map((size) => {
          const sizeLabel = resolveL(size.label) || size.name
          return {
            key: `${def.name}.${size.name}`,
            defName: def.name,
            imgAlt: `${defLabel} — ${sizeLabel}`,
            label: defLabel,
            size: `${sizeLabel} — ${size.width}×${size.height}`,
          }
        })
      : [
          {
            key: def.name,
            defName: def.name,
            imgAlt: defLabel,
            label: defLabel,
            size: `${def.width}×${def.height}`,
          },
        ]
  })

  return (
    <div className={styles.cropCards}>
      {cards.map(({ key, defName, imgAlt, label, size }) => {
        const url = urls[key]
        return (
          <div className={styles.cropCard} key={key}>
            {url ? (
              <img alt={imgAlt} className={styles.cropCardImg} src={url} />
            ) : (
              <div className={styles.cropCardEmpty}>
                <span className={`${styles.dot}${crops[defName] ? ` ${styles.dotSet}` : ''}`} />
              </div>
            )}
            <span className={styles.cropCardLabel}>{label}</span>
            <span className={styles.cropCardSize}>{size}</span>
          </div>
        )
      })}
    </div>
  )
}

type PreviewModalProps = {
  cropDefinitions: CropDefinition[]
  crops: CropData
  urls: GeneratedUrls
  onClose: () => void
}

export function PreviewModal({ cropDefinitions, crops, urls, onClose }: PreviewModalProps) {
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.previewModal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Crops &amp; Sizes</h2>
          <button aria-label="Close" className={styles.modalClose} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className={styles.previewBody}>
          <CropCards cropDefinitions={cropDefinitions} crops={crops} urls={urls} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
