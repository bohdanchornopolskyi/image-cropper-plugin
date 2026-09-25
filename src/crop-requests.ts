import type { CropData, CropDefinition, ImageFormat } from './types.js'

export function generateCropEndpoint(
  apiRoute: string | undefined,
  mediaCollectionSlug: string,
): string {
  return `${apiRoute || '/api'}/${mediaCollectionSlug}/generate-crop`
}

export type CropRequest = {
  body: {
    cropData: CropData[string]
    cropName: string
    format: ImageFormat
    mediaId: number | string
    outputHeight: number
    outputWidth: number
    quality: number
  }
  key: string
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
    if (!coords) {
      return []
    }

    const targets = def.sizes
      ? def.sizes.map((s) => ({ height: s.height, key: `${def.name}.${s.name}`, width: s.width }))
      : [{ height: def.height, key: def.name, width: def.width }]

    return targets.map(({ height, key, width }) => ({
      body: {
        cropData: coords,
        cropName: key,
        format: def.format ?? 'webp',
        mediaId,
        outputHeight: height,
        outputWidth: width,
        quality: def.quality ?? 80,
      },
      key,
    }))
  })
}
