'use client'

import { Button, useConfig } from '@payloadcms/ui'

import type { CropDefinition, StaticLabel } from '../types.js'
import { usePluginTranslation } from './usePluginTranslation.js'
import { useResolveLabel } from './useResolveLabel.js'
import { CropModal } from './CropModal.js'
import { PreviewModal } from './PreviewModal.js'
import { CropIcon, EditSvg, GridIcon, XSvg } from './icons.js'
import { useCropImageField } from './useCropImageField.js'
import styles from './CropImageField.module.css'

type Props = {
  path: string
  cropDefinitions?: CropDefinition[]
  fieldLabel?: StaticLabel
  mediaCollectionSlug?: string
  generateCropEndpoint?: string
  readOnly?: boolean
}

export function CropImageField({
  path,
  cropDefinitions = [],
  fieldLabel,
  mediaCollectionSlug = 'media',
  generateCropEndpoint,
  readOnly,
}: Props) {
  const { config } = useConfig()
  const resolveL = useResolveLabel()
  const t = usePluginTranslation()
  const apiRoute = config.routes.api || '/api'
  const resolvedFieldLabel = resolveL(fieldLabel ?? 'Image')
  const endpoint = generateCropEndpoint ?? `${apiRoute}/${mediaCollectionSlug}/generate-crop`

  const {
    media,
    fileMeta,
    urls,
    crops,
    anyCropSet,
    allCropsReady,
    modalOpen,
    setModalOpen,
    previewOpen,
    setPreviewOpen,
    generating,
    ListDrawer,
    CreateMediaDrawer,
    openMediaDrawer,
    openCreateDrawer,
    handleListSelect,
    handleDocCreate,
    handleSave,
    remove,
  } = useCropImageField({ path, cropDefinitions, mediaCollectionSlug, apiRoute, endpoint })

  return (
    <div className={styles.wrap}>
      <div className={styles.labelWrap}>
        <label className={styles.label}>{resolvedFieldLabel}</label>
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
                {t('createNew')}
              </Button>
              <span className="upload__dropzoneContent__orText">{t('or')}</span>
              <Button
                buttonStyle="pill"
                disabled={readOnly}
                onClick={openMediaDrawer}
                size="small"
                type="button"
              >
                {t('chooseFromExisting')}
              </Button>
            </div>
            <p className="upload__dragAndDropText">{t('dragAndDropFile')}</p>
          </div>
        </div>
      ) : (
        <div className={styles.fileRow}>
          <img alt={media.alt ?? ''} className={styles.thumb} src={media.url ?? ''} />

          <div className={styles.mainDetail}>
            <span className={styles.filename}>{media.filename}</span>
            {generating ? (
              <span className={styles.generating}>{t('generatingCrops')}</span>
            ) : (
              fileMeta && <span className={styles.fileMeta}>{fileMeta}</span>
            )}
          </div>

          <div className={styles.iconActions}>
            {cropDefinitions.length > 0 && (
              <button
                className={styles.iconBtn}
                onClick={() => setPreviewOpen(true)}
                title={t('previewCropsAndSizes')}
                type="button"
              >
                <GridIcon />
              </button>
            )}
            <button
              className={styles.iconBtn}
              disabled={readOnly || generating}
              onClick={() => setModalOpen(true)}
              title={allCropsReady || anyCropSet ? t('editCrops') : t('cropImage')}
              type="button"
            >
              <CropIcon />
            </button>
            <button
              className={styles.iconBtn}
              disabled={readOnly}
              onClick={openMediaDrawer}
              title={t('changeImage')}
              type="button"
            >
              <EditSvg />
            </button>
            <button
              className={styles.iconBtn}
              disabled={readOnly}
              onClick={remove}
              title={t('remove')}
              type="button"
            >
              <XSvg />
            </button>
          </div>
        </div>
      )}

      {modalOpen && media?.url && (
        <CropModal
          cropDefinitions={cropDefinitions}
          initialCropData={crops}
          mediaUrl={media.url}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {previewOpen && (
        <PreviewModal
          cropDefinitions={cropDefinitions}
          crops={crops}
          onClose={() => setPreviewOpen(false)}
          urls={urls}
        />
      )}

      <ListDrawer onSelect={handleListSelect} />
      <CreateMediaDrawer onSave={handleDocCreate} />
    </div>
  )
}
