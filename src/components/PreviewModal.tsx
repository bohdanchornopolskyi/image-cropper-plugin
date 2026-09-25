'use client'

import { useId } from 'react'

import type { CropData, CropDefinition, GeneratedUrls } from '../types.js'

import styles from './CropImageField.module.css'
import { Dialog } from './Dialog.js'
import { usePluginTranslation } from './usePluginTranslation.js'
import { useResolveLabel } from './useResolveLabel.js'

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
            defName: def.name,
            imgAlt: `${defLabel} — ${sizeLabel}`,
            key: `${def.name}.${size.name}`,
            label: defLabel,
            size: `${sizeLabel} — ${size.width}×${size.height}`,
          }
        })
      : [
          {
            defName: def.name,
            imgAlt: defLabel,
            key: def.name,
            label: defLabel,
            size: `${def.width}×${def.height}`,
          },
        ]
  })

  return (
    <div className={styles.cropCards}>
      {cards.map(({ defName, imgAlt, key, label, size }) => {
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
  onClose: () => void
  urls: GeneratedUrls
}

export function PreviewModal({ cropDefinitions, crops, onClose, urls }: PreviewModalProps) {
  const t = usePluginTranslation()
  const titleId = useId()
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div className={styles.previewModal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle} id={titleId}>
            {t('cropsAndSizes')}
          </h2>
          <button
            aria-label={t('close')}
            className={styles.modalClose}
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className={styles.previewBody}>
          <CropCards cropDefinitions={cropDefinitions} crops={crops} urls={urls} />
        </div>
      </div>
    </Dialog>
  )
}
