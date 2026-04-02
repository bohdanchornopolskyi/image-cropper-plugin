import type { CollectionAfterDeleteHook, FieldHook } from 'payload'

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

import type { CropCoords, CropDefinition, ImageFormat } from './types.js'

function applyFormat(pipeline: sharp.Sharp, format: ImageFormat, quality: number): sharp.Sharp {
  if (format === 'jpeg') {
    return pipeline.jpeg({ quality })
  }
  if (format === 'png') {
    return pipeline.png()
  }
  return pipeline.webp({ quality })
}

export function makeGenerateCropsBeforeChange(
  mediaDir: string,
  mediaCollectionSlug: string,
  cropDefinitions: CropDefinition[],
): FieldHook {
  return async ({ previousValue, req, value }) => {
    if (!value || !value.image) {
      return value
    }

    const currentCropData = value.cropData || {}
    const previousCropData = previousValue?.cropData || {}

    let hasChanges = false
    for (const def of cropDefinitions) {
      if (
        JSON.stringify(currentCropData[def.name]) !== JSON.stringify(previousCropData[def.name])
      ) {
        hasChanges = true
        break
      }
    }

    if (!hasChanges) {
      return value
    }

    const mediaDoc = await req.payload.findByID({
      id: typeof value.image === 'object' ? value.image.id : value.image,
      collection: mediaCollectionSlug,
      depth: 0,
      req,
    })

    if (!mediaDoc || typeof mediaDoc.filename !== 'string') {
      return value
    }

    const safeFilename = path.basename(mediaDoc.filename)
    const sourceFilePath = path.join(mediaDir, safeFilename)

    if (!fs.existsSync(sourceFilePath)) {
      return value
    }

    const originalWidth = mediaDoc.width as number
    const originalHeight = mediaDoc.height as number
    const newGeneratedUrls = { ...(value.generatedUrls || {}) }
    const mediaDirBase = path.basename(mediaDir)

    for (const def of cropDefinitions) {
      const cropData: CropCoords = currentCropData[def.name]

      if (!cropData || JSON.stringify(cropData) === JSON.stringify(previousCropData[def.name])) {
        continue
      }

      const left = Math.max(0, Math.round((cropData.x / 100) * originalWidth))
      const top = Math.max(0, Math.round((cropData.y / 100) * originalHeight))
      const cropW = Math.min(
        originalWidth - left,
        Math.max(1, Math.round((cropData.width / 100) * originalWidth)),
      )
      const cropH = Math.min(
        originalHeight - top,
        Math.max(1, Math.round((cropData.height / 100) * originalHeight)),
      )

      const base = path.basename(safeFilename, path.extname(safeFilename))
      const tag = `${Math.round(cropData.x)}-${Math.round(cropData.y)}-${Math.round(cropData.width)}x${Math.round(cropData.height)}`
      const ext = def.format === 'jpeg' ? 'jpg' : def.format || 'webp'
      const outputFilename = `${base}-crop-${def.name}-${tag}-${def.width}x${def.height}.${ext}`
      const outputFilePath = path.join(mediaDir, outputFilename)
      const slotPrefix = `${base}-crop-${def.name}-`

      try {
        const dir = await fs.promises.opendir(mediaDir)
        for await (const dirent of dir) {
          if (dirent.name.startsWith(slotPrefix) && dirent.name !== outputFilename) {
            await fs.promises.unlink(path.join(mediaDir, dirent.name)).catch((e) => {
              console.error(`[CropPlugin] Failed to delete old crop ${dirent.name}:`, e)
            })
          }
        }
      } catch (e) {
        console.error(`[CropPlugin] Failed to clean up media directory:`, e)
      }

      try {
        const pipeline = sharp(sourceFilePath)
          .extract({ height: cropH, left, top, width: cropW })
          .resize(def.width, def.height, { fit: 'fill' })

        await applyFormat(pipeline, def.format || 'webp', def.quality || 80).toFile(outputFilePath)

        newGeneratedUrls[def.name] = `/${mediaDirBase}/${outputFilename}`
      } catch (e) {
        console.error(`[CropPlugin] Sharp processing failed for ${def.name}:`, e)
      }
    }

    return {
      ...value,
      generatedUrls: newGeneratedUrls,
    }
  }
}

export function makeDeleteOrphanedCrops(mediaDir: string): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const filename = doc.filename
    if (typeof filename !== 'string' || !filename) {
      return
    }

    const base = path.basename(filename, path.extname(filename))
    const cropPrefix = `${base}-crop-`

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
