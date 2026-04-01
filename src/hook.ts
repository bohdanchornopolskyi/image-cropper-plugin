import type { CollectionAfterDeleteHook } from 'payload'

import fs from 'fs'
import path from 'path'

export function makeDeleteOrphanedCrops(mediaDir: string): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const filename = doc.filename
    if (typeof filename !== 'string' || !filename) return

    const base = path.basename(filename, path.extname(filename))
    const cropPrefix = `${base}-crop-`

    let files: string[]
    try {
      files = await fs.promises.readdir(mediaDir)
    } catch {
      return
    }

    await Promise.all(
      files
        .filter((file) => file.startsWith(cropPrefix))
        .map((file) =>
          fs.promises.unlink(path.join(mediaDir, file)).catch((e: unknown) => {
            console.error(`[deleteOrphanedCrops] Failed to delete ${file}:`, e)
          }),
        ),
    )
  }
}
