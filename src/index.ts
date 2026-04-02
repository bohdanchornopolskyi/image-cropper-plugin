import type { Config, Field, Plugin } from 'payload'

import fs from 'fs'
import path from 'path'

import type { CropImageFieldConfig, CropImagePluginConfig } from './types.js'

import { makeDeleteOrphanedCrops, makeGenerateCropsBeforeChange } from './hook.js'

export type {
  CropCoords,
  CropData,
  CropDefinition,
  CropImageFieldConfig,
  CropImagePluginConfig,
  CropImageValue,
  GeneratedUrls,
  ImageFormat,
} from './types.js'

function injectCropHooks(fields: Field[], mediaDir: string): Field[] {
  return fields.map((field): Field => {
    if (field.type === 'group' && 'name' in field && field.custom?.isCropImageField) {
      const fieldHook = makeGenerateCropsBeforeChange(
        mediaDir,
        field.custom.mediaCollectionSlug,
        field.custom.crops,
      )

      return {
        ...field,
        hooks: {
          ...field.hooks,
          beforeChange: [...(field.hooks?.beforeChange || []), fieldHook],
        },
      }
    }

    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({
          ...tab,
          fields: injectCropHooks(tab.fields, mediaDir),
        })),
      }
    }

    if (field.type === 'blocks') {
      return {
        ...field,
        blocks: field.blocks.map((block) => ({
          ...block,
          fields: injectCropHooks(block.fields, mediaDir),
        })),
      }
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: injectCropHooks(field.fields, mediaDir),
      }
    }

    return field
  })
}

export function cropImagePlugin(pluginConfig: CropImagePluginConfig = {}): Plugin {
  const mediaSlug = pluginConfig.mediaCollectionSlug ?? 'media'
  const mediaDir = pluginConfig.mediaDir ?? path.join(process.cwd(), 'public/media')

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true })
  }

  return (incomingConfig: Config): Config => {
    const collections = (incomingConfig.collections ?? []).map((collection) => {
      const modifiedCollection = { ...collection }

      if (modifiedCollection.fields) {
        modifiedCollection.fields = injectCropHooks(modifiedCollection.fields, mediaDir)
      }

      if (collection.slug === mediaSlug) {
        modifiedCollection.hooks = {
          ...collection.hooks,
          afterDelete: [
            ...(collection.hooks?.afterDelete ?? []),
            makeDeleteOrphanedCrops(mediaDir),
          ],
        }
      }

      return modifiedCollection
    })

    const globals = (incomingConfig.globals ?? []).map((global) => {
      if (global.fields) {
        return { ...global, fields: injectCropHooks(global.fields, mediaDir) }
      }
      return global
    })

    return { ...incomingConfig, collections, globals }
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
            mediaCollectionSlug: mediaSlug,
          },
          exportName: 'CropImageField',
          path: 'payload-plugin-image-cropper/client#CropImageField',
        },
      },
      condition: config.admin?.condition,
      description: config.admin?.description,
    },
    custom: {
      crops: config.crops,
      isCropImageField: true,
      mediaCollectionSlug: mediaSlug,
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
