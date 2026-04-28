import type { CollectionAfterDeleteHook } from 'payload'

import fs from 'fs'
import path from 'path'

import type { CropStorage } from './types.js'

export function makeDeleteOrphanedCrops(
  mediaDir: string,
  storage?: CropStorage,
): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const filename = doc.filename
    if (typeof filename !== 'string' || !filename) {
      return
    }

    const base = path.basename(filename, path.extname(filename))
    const cropPrefix = `${base}-crop-`

    if (storage) {
      if (storage.deleteCropsByBase) {
        await storage.deleteCropsByBase(base).catch((e: unknown) => {
          console.error(`[deleteOrphanedCrops] storage.deleteCropsByBase failed for "${base}":`, e)
        })
      }
      return
    }

    try {
      const dir = await fs.promises.opendir(mediaDir)
      for await (const dirent of dir) {
        if (dirent.name.startsWith(cropPrefix)) {
          await fs.promises.unlink(path.join(mediaDir, dirent.name)).catch((e: unknown) => {
            console.error(`[deleteOrphanedCrops] Failed to delete ${dirent.name}:`, e)
          })
        }
      }
    } catch (e) {
      console.error(`[deleteOrphanedCrops] Failed to read media directory:`, e)
    }
  }
}
