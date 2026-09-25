import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

import type { CropTarget } from './crop-targets.js'
import type { CropStorage, GeneratedUrls, ImageFormat } from './types.js'

export type SourceMedia = {
  filename?: null | string
  height?: null | number
  id: number | string
  url?: null | string
  width?: null | number
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

/**
 * Reads the source image bytes.
 * Tries the local filesystem first; falls back to fetching from the media URL
 * when the file is not present on disk (e.g. cloud storage with disableLocalStorage: true).
 */
async function readSource(localPath: string, mediaUrl?: null | string): Promise<Buffer | null> {
  if (fs.existsSync(localPath)) {
    return fs.promises.readFile(localPath)
  }
  if (typeof mediaUrl === 'string' && /^https?:\/\//.test(mediaUrl)) {
    const res = await fetch(mediaUrl)
    if (!res.ok) {
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  }
  return null
}

/** Renders every target from one read of the source image and returns their URLs by key. */
export async function generateCrops({
  media,
  mediaDir,
  storage,
  targets,
}: {
  media: SourceMedia
  mediaDir: string
  storage: CropStorage
  targets: CropTarget[]
}): Promise<GeneratedUrls> {
  if (!media.filename) {
    throw new Error('Media has no file')
  }
  if (!media.width || !media.height) {
    throw new Error('Media has no dimensions')
  }

  const safeFilename = path.basename(media.filename)
  const source = await readSource(path.join(mediaDir, safeFilename), media.url)
  if (!source) {
    throw new Error(`Source file not found: ${safeFilename}`)
  }

  const metadata = await sharp(source)
    .metadata()
    .catch(() => null)
  if (!metadata) {
    throw new Error(`Source file is not a readable image: ${safeFilename}`)
  }
  const { height: originalHeight, width: originalWidth } = metadata.autoOrient
  const base = path.basename(safeFilename, path.extname(safeFilename))

  const entries = await Promise.all(
    targets.map(async ({ coords, format, height, key, quality, width }) => {
      const left = Math.max(0, Math.round((coords.x / 100) * originalWidth))
      const top = Math.max(0, Math.round((coords.y / 100) * originalHeight))
      const cropW = Math.min(
        originalWidth - left,
        Math.max(1, Math.round((coords.width / 100) * originalWidth)),
      )
      const cropH = Math.min(
        originalHeight - top,
        Math.max(1, Math.round((coords.height / 100) * originalHeight)),
      )

      const hash = createHash('sha256')
        .update(source)
        .update(
          JSON.stringify([
            coords.x,
            coords.y,
            coords.width,
            coords.height,
            width,
            height,
            format,
            quality,
          ]),
        )
        .digest('hex')
        .slice(0, 16)
      const filename = `${base}-crop-${hash}.${format === 'jpeg' ? 'jpg' : format}`

      const pipeline = sharp(source)
        .autoOrient()
        .extract({ height: cropH, left, top, width: cropW })
        .resize(width, height, { fit: 'fill' })
      const buffer = await applyFormat(pipeline, format, quality).toBuffer()

      const { url } = await storage.upload({
        buffer,
        cropName: key,
        filename,
        format,
        mediaId: media.id,
      })
      return [key, url] as const
    }),
  )

  return Object.fromEntries(entries)
}
