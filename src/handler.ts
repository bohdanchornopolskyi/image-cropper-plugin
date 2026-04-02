import type { PayloadHandler } from 'payload'

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

import type { CropCoords, ImageFormat } from './types.js'

import { isRecord } from './isRecord.js'

type GenerateCropBody = {
  cropData: CropCoords
  cropName: string
  format?: ImageFormat
  mediaId: number | string
  outputHeight: number
  outputWidth: number
  quality?: number
}

const VALID_FORMATS: readonly ImageFormat[] = ['webp', 'jpeg', 'png']

function isCropCoords(v: unknown): v is CropCoords {
  if (!isRecord(v)) {
    return false
  }
  return (
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  )
}

function isGenerateCropBody(v: unknown): v is GenerateCropBody {
  if (!isRecord(v)) {
    return false
  }
  if (typeof v.format !== 'undefined' && !VALID_FORMATS.includes(v.format as ImageFormat)) {
    return false
  }
  if (typeof v.cropName !== 'string' || !/^[\w-]+$/.test(v.cropName)) {
    return false
  }
  return (
    (typeof v.mediaId === 'string' || typeof v.mediaId === 'number') &&
    typeof v.cropName === 'string' &&
    typeof v.outputWidth === 'number' &&
    typeof v.outputHeight === 'number' &&
    isCropCoords(v.cropData)
  )
}

function applyFormat(pipeline: sharp.Sharp, format: ImageFormat, quality: number): sharp.Sharp {
  if (format === 'jpeg') {
    return pipeline.jpeg({ quality })
  }
  if (format === 'png') {
    return pipeline.png()
  }
  return pipeline.webp({ quality })
}

export function makeGenerateCropHandler(
  mediaDir: string,
  mediaCollectionSlug: string,
): PayloadHandler {
  const mediaDirBase = path.basename(mediaDir)

  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody: unknown = await req.json?.()

    if (!isGenerateCropBody(rawBody)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      cropData,
      cropName,
      format = 'webp',
      mediaId,
      outputHeight,
      outputWidth,
      quality = 80,
    } = rawBody

    const mediaDoc = await req.payload.findByID({
      id: mediaId,
      collection: mediaCollectionSlug,
      overrideAccess: false,
      req,
    })

    const { filename, height: originalHeight, width: originalWidth } = mediaDoc ?? {}

    if (!filename) {
      return Response.json({ error: 'Media not found' }, { status: 404 })
    }

    if (!originalWidth || !originalHeight) {
      return Response.json({ error: 'Media has no dimensions' }, { status: 422 })
    }

    const safeFilename = path.basename(filename)
    const sourceFilePath = path.join(mediaDir, safeFilename)

    if (!fs.existsSync(sourceFilePath)) {
      return Response.json({ error: `Source file not found: ${safeFilename}` }, { status: 404 })
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
    const ext = format === 'jpeg' ? 'jpg' : format
    const outputFilename = `${base}-crop-${cropName}-${tag}-${outputWidth}x${outputHeight}.${ext}`
    const outputFilePath = path.join(mediaDir, outputFilename)
    const slotPrefix = `${base}-crop-${cropName}-`

    let alreadyExists = false
    try {
      for (const file of await fs.promises.readdir(mediaDir)) {
        if (file === outputFilename) {
          alreadyExists = true
        } else if (file.startsWith(slotPrefix)) {
          await fs.promises.unlink(path.join(mediaDir, file)).catch((e: unknown) => {
            console.error(`[generateCrop] Failed to delete old crop file ${file}:`, e)
          })
        }
      }
    } catch (e) {
      console.error('[generateCrop] Failed to read media directory:', e)
    }

    if (alreadyExists) {
      return Response.json({ url: `/${mediaDirBase}/${outputFilename}` })
    }

    try {
      const pipeline = sharp(sourceFilePath)
        .extract({ height: cropH, left, top, width: cropW })
        .resize(outputWidth, outputHeight, { fit: 'fill' })

      await applyFormat(pipeline, format, quality).toFile(outputFilePath)

      return Response.json({ url: `/${mediaDirBase}/${outputFilename}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      console.error('[generateCrop] Sharp processing failed:', e)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
