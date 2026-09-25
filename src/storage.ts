import fs from 'fs'
import path from 'path'

import type { CropImagePluginConfig, CropStorage } from './types.js'

export function makeLocalCropStorage(mediaDir: string): CropStorage {
  const urlBase = `/${path.basename(mediaDir)}`

  return {
    async deleteCropsByBase(filenameBase) {
      const prefix = `${filenameBase}-crop-`
      for await (const dirent of await fs.promises.opendir(mediaDir)) {
        if (dirent.name.startsWith(prefix)) {
          await fs.promises.unlink(path.join(mediaDir, dirent.name)).catch((e: unknown) => {
            console.error(`[deleteOrphanedCrops] Failed to delete ${dirent.name}:`, e)
          })
        }
      }
    },

    async upload({ buffer, filename }) {
      const filePath = path.join(mediaDir, filename)
      if (!fs.existsSync(filePath)) {
        await fs.promises.writeFile(filePath, buffer)
      }
      return { url: `${urlBase}/${filename}` }
    },
  }
}

export function makeCallbackCropStorage(
  onCropGenerated: NonNullable<CropImagePluginConfig['onCropGenerated']>,
  fallback: CropStorage,
): CropStorage {
  return {
    deleteCropsByBase: fallback.deleteCropsByBase,

    async upload(ctx) {
      const result = await onCropGenerated(ctx)
      return result?.url ? { url: result.url } : fallback.upload(ctx)
    },
  }
}
