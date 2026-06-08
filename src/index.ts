import type { Config, Field, Plugin } from 'payload'

import path from 'path'

import type { CropImageFieldConfig, CropImagePluginConfig } from './types.js'

import { makeGenerateCropHandler } from './handler.js'
import { makeDeleteOrphanedCrops } from './hook.js'
import { makeS3CropStorage } from './s3.js'
import { de as pluginTranslationsDe, en as pluginTranslationsEn } from './translations/index.js'

export type {
  CropCoords,
  CropData,
  CropDefinition,
  CropImageFieldConfig,
  CropImagePluginConfig,
  CropImageValue,
  GeneratedUrls,
  ImageFormat,
  OnCropGeneratedContext,
  S3CropConfig,
  SizeDefinition,
} from './types.js'

export function cropImagePlugin(pluginConfig: CropImagePluginConfig = {}): Plugin {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  const mediaDir = pluginConfig.mediaDir ?? path.join(process.cwd(), 'public/media')
  const storage = pluginConfig.s3 ? makeS3CropStorage(pluginConfig.s3) : undefined

  return (incomingConfig: Config): Config => {
    const collections = (incomingConfig.collections ?? []).map((collection) => {
      if (collection.slug !== mediaSlug) {
        return collection
      }

      return {
        ...collection,
        endpoints: [
          ...(Array.isArray(collection.endpoints) ? collection.endpoints : []),
          {
            handler: makeGenerateCropHandler(
              mediaDir,
              mediaSlug,
              pluginConfig.onCropGenerated,
              storage,
            ),
            method: 'post' as const,
            path: '/generate-crop',
          },
        ],
        hooks: {
          ...collection.hooks,
          afterDelete: [
            ...(collection.hooks?.afterDelete ?? []),
            makeDeleteOrphanedCrops(mediaDir, storage),
          ],
        },
      }
    })

    const existingTranslations = (incomingConfig.i18n?.translations ?? {}) as Record<
      string,
      Record<string, unknown>
    >
    const translations = {
      ...existingTranslations,
      de: { ...existingTranslations['de'], 'plugin-image-cropper': pluginTranslationsDe },
      en: { ...existingTranslations['en'], 'plugin-image-cropper': pluginTranslationsEn },
    }

    return {
      ...incomingConfig,
      collections,
      i18n: { ...incomingConfig.i18n, translations } as Config['i18n'],
    }
  }
}

/**
 * Creates a plugin and a field factory that are guaranteed to target the same
 * media collection. Use this instead of calling `cropImagePlugin` and
 * `cropImageField` independently when your collection uses a non-default slug —
 * that approach requires you to set `mediaCollectionSlug` in two places, and a
 * mismatch silently causes 404s at crop generation time.
 *
 * @example
 * const { plugin, field } = createCropImage({ mediaCollectionSlug: 'files' })
 * // payload.config.ts  →  plugins: [plugin]
 * // collection fields  →  field({ name: 'hero', crops: [...] })
 */
export function createCropImage(pluginConfig: CropImagePluginConfig = {}): {
  field: (config: Omit<CropImageFieldConfig, 'mediaCollectionSlug'>) => Field
  plugin: Plugin
} {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  return {
    field: (fieldConfig) => cropImageField({ ...fieldConfig, mediaCollectionSlug: mediaSlug }),
    plugin: cropImagePlugin(pluginConfig),
  }
}

export function cropImageField(config: CropImageFieldConfig): Field {
  const mediaSlug = config.mediaCollectionSlug ?? 'media'

  return {
    name: config.name,
    type: 'group',
    admin: {
      components: {
        Field: {
          clientProps: {
            cropDefinitions: config.crops,
            fieldLabel: config.label ?? config.name,
            generateCropEndpoint: `/api/${mediaSlug}/generate-crop`,
            mediaCollectionSlug: mediaSlug,
          },
          exportName: 'CropImageField',
          path: 'payload-plugin-image-cropper/client#CropImageField',
        },
      },
      condition: config.admin?.condition,
      description: config.admin?.description,
    },
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
    label: config.label ?? false,
  }
}
