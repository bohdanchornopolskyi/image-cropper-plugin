'use client'

import { Button, FieldDescription, FieldError, useConfig } from '@payloadcms/ui'

import type { CropDefinition, StaticDescription, StaticLabel } from '../types.js'

import styles from './CropImageField.module.css'
import { CropModal } from './CropModal.js'
import { CropIcon, EditSvg, GridIcon, XSvg } from './icons.js'
import { PreviewModal } from './PreviewModal.js'
import { useCropImageField } from './useCropImageField.js'
import { usePluginTranslation } from './usePluginTranslation.js'
import { useResolveLabel } from './useResolveLabel.js'

type Props = {
  cropDefinitions?: CropDefinition[]
  fieldDescription?: StaticDescription
  fieldLabel?: StaticLabel
  focalPoint?: boolean
  mediaCollectionSlug?: string
  path: string
  readOnly?: boolean
  required?: boolean
}

export function CropImageField({
  cropDefinitions = [],
  fieldDescription,
  fieldLabel,
  focalPoint = true,
  mediaCollectionSlug = 'media',
  path,
  readOnly,
  required = false,
}: Props) {
  const { config } = useConfig()
  const resolveL = useResolveLabel()
  const t = usePluginTranslation()
  const apiRoute = config.routes.api || '/api'
  const resolvedFieldLabel = resolveL(fieldLabel ?? 'Image')

  const {
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
  } = useCropImageField({
    apiRoute,
    cropDefinitions,
    mediaCollectionSlug,
    path,
    required,
  })

  return (
    <div className={styles.wrap} id={`field-${path.replace(/\./g, '__')}`}>
      <div className={styles.labelWrap}>
        <label className={styles.label}>
          {resolvedFieldLabel}
          {required && <span className={styles.required}>*</span>}
        </label>
      </div>
      {fieldDescription ? <FieldDescription description={fieldDescription} path={path} /> : null}
      <div className={styles.errorWrap}>
        <FieldError path={`${path}.image`} showError={showError} />
        <FieldError path={`${path}.cropData`} showError={showCropDataError} />
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
            {fileMeta && <span className={styles.fileMeta}>{fileMeta}</span>}
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
              disabled={readOnly}
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
          focalPoint={focalPoint}
          focalX={media.focalX}
          focalY={media.focalY}
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
