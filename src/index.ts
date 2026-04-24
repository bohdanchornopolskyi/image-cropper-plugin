import type { Config, Field, Plugin } from 'payload'

import path from 'path'

import type { CropImageFieldConfig, CropImagePluginConfig } from './types.js'

import { makeGenerateCropHandler } from './handler.js'
import { makeDeleteOrphanedCrops } from './hook.js'

export type {
  CropCoords,
  CropData,
  CropDefinition,
  CropImageFieldConfig,
  CropImagePluginConfig,
  CropImageValue,
  GeneratedUrls,
  ImageFormat,
  SizeDefinition,
} from './types.js'

export function cropImagePlugin(pluginConfig: CropImagePluginConfig = {}): Plugin {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  const mediaDir = pluginConfig.mediaDir ?? path.join(process.cwd(), 'public/media')

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
            handler: makeGenerateCropHandler(mediaDir, mediaSlug),
            method: 'post' as const,
            path: '/generate-crop',
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
