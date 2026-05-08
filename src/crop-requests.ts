import type { CropData, CropDefinition, ImageFormat } from './types.js'

export type CropRequest = {
  key: string
  body: {
    cropData: CropData[string]
    cropName: string
    format: ImageFormat
    mediaId: number | string
    outputHeight: number
    outputWidth: number
    quality: number
  }
}

/**
 * Maps crop definitions and the user's chosen crop coordinates into a flat
 * list of API request descriptors — one per output size.
 *
 * Pure function: no side effects, safe to unit-test without a browser.
 */
export function buildCropRequests(
  cropDefinitions: CropDefinition[],
  finalCrops: CropData,
  mediaId: number | string,
): CropRequest[] {
  return cropDefinitions.flatMap((def) => {
    const coords = finalCrops[def.name]
    if (!coords) return []

    const targets = def.sizes
      ? def.sizes.map((s) => ({ key: `${def.name}.${s.name}`, width: s.width, height: s.height }))
      : [{ key: def.name, width: def.width, height: def.height }]

    return targets.map(({ key, width, height }) => ({
      key,
      body: {
        cropData: coords,
        cropName: key,
        format: def.format ?? 'webp',
        mediaId,
        outputHeight: height,
        outputWidth: width,
        quality: def.quality ?? 80,
      },
    }))
  })
}
