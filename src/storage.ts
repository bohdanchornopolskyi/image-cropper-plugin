import fs from 'fs'
import path from 'path'

import type { CropImagePluginConfig, CropStorage } from './types.js'

async function deleteMatching(
  dir: string,
  matches: (name: string) => boolean,
  logTag: string,
): Promise<void> {
  for await (const dirent of await fs.promises.opendir(dir)) {
    if (matches(dirent.name)) {
      await fs.promises.unlink(path.join(dir, dirent.name)).catch((e: unknown) => {
        console.error(`[${logTag}] Failed to delete ${dirent.name}:`, e)
      })
    }
  }
}

export function makeLocalCropStorage(mediaDir: string): CropStorage {
  const urlBase = `/${path.basename(mediaDir)}`

  return {
    async deleteCropsByBase(filenameBase) {
      const prefix = `${filenameBase}-crop-`
      await deleteMatching(mediaDir, (name) => name.startsWith(prefix), 'deleteOrphanedCrops')
    },

    async upload({ buffer, filename, replaces }) {
      const filePath = path.join(mediaDir, filename)
      const url = `${urlBase}/${filename}`

      if (replaces) {
        await deleteMatching(
          mediaDir,
          (name) => name !== filename && name.startsWith(replaces),
          'generateCrop',
        ).catch((e: unknown) => console.error('[generateCrop] Failed to read media directory:', e))
      }

      if (!fs.existsSync(filePath)) {
        await fs.promises.writeFile(filePath, buffer)
      }
      return { url }
    },
  }
}

export function makeCallbackCropStorage(
  onCropGenerated: NonNullable<CropImagePluginConfig['onCropGenerated']>,
  fallback: CropStorage,
): CropStorage {
  return {
    deleteCropsByBase: fallback.deleteCropsByBase,

    async upload({ replaces, ...ctx }) {
      const result = await onCropGenerated(ctx)
      return result?.url ? { url: result.url } : fallback.upload({ ...ctx, replaces })
    },
  }
}
