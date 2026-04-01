import type { Config, Field, Plugin } from 'payload'
import path from 'path'

import type { CropImageFieldConfig, CropImagePluginConfig } from './types.js'
import { makeGenerateCropHandler } from './handler.js'
import { makeDeleteOrphanedCrops } from './hook.js'

export type {
  CropDefinition,
  CropImagePluginConfig,
  CropImageFieldConfig,
  CropImageValue,
  CropData,
  CropCoords,
  GeneratedUrls,
  ImageFormat,
} from './types.js'

export function cropImagePlugin(pluginConfig: CropImagePluginConfig = {}): Plugin {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  const mediaDir = pluginConfig.mediaDir ?? path.join(process.cwd(), 'public/media')

  return (incomingConfig: Config): Config => {
    const collections = (incomingConfig.collections ?? []).map((collection) => {
      if (collection.slug !== mediaSlug) return collection

      return {
        ...collection,
        endpoints: [
          ...(collection.endpoints ?? []),
          {
            path: '/generate-crop',
            method: 'post' as const,
            handler: makeGenerateCropHandler(mediaDir, mediaSlug),
          },
        ],
        hooks: {
          ...collection.hooks,
          afterDelete: [
            ...(collection.hooks?.afterDelete ?? []),
            makeDeleteOrphanedCrops(mediaDir),
          ],
        },
      }
    })

    return { ...incomingConfig, collections }
  }
}

export function cropImageField(config: CropImageFieldConfig): Field {
  const mediaSlug = config.mediaCollectionSlug ?? 'media'

  return {
    name: config.name,
    type: 'group',
    label: config.label ?? false,
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
    admin: {
      condition: config.admin?.condition,
      description: config.admin?.description,
      components: {
        Field: {
          path: 'image-cropper-plugin/client#CropImageField',
          exportName: 'CropImageField',
          clientProps: {
            cropDefinitions: config.crops,
            fieldLabel: config.label ?? config.name,
            mediaCollectionSlug: mediaSlug,
            generateCropEndpoint: `/api/${mediaSlug}/generate-crop`,
          },
        },
      },
    },
  }
}
