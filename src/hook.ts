import type { CollectionAfterDeleteHook } from 'payload'

import path from 'path'

import type { CropStorage } from './types.js'

export function makeDeleteOrphanedCrops(storage: CropStorage): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const filename = doc.filename
    if (typeof filename !== 'string' || !filename) {
      return
    }

    const base = path.basename(filename, path.extname(filename))
    await storage.deleteCropsByBase(base).catch((e: unknown) => {
      console.error(`[deleteOrphanedCrops] Failed to delete crops for "${base}":`, e)
    })
  }
}
