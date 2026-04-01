import type { CropImageValue } from './types.js'
import { isRecord } from './isRecord.js'

/**
 * Returns the pre-generated crop URL for the given slot, or falls back to the
 * original image URL. Returns an empty string if no image is set.
 *
 * @param value     The cropImage group field value from Payload
 * @param cropName  The slot name (must match a CropDefinition.name)
 */
export function getCropUrl(value: CropImageValue | null | undefined, cropName: string): string {
  if (!value) return ''

  const urls = value.generatedUrls
  if (isRecord(urls)) {
    const url = urls[cropName]
    if (typeof url === 'string') return url
  }

  const img = value.image
  if (isRecord(img) && typeof img.url === 'string') {
    return img.url
  }

  return ''
}

/**
 * Returns a Media-shaped object with the crop URL injected.
 * Falls back to the original media document when no generated URL exists.
 * Returns null if no image is set or it hasn't been populated (depth=0).
 *
 * @param value       The cropImage group field value from Payload
 * @param cropName    The slot name (must match a CropDefinition.name)
 * @param outputSize  When provided, overrides width/height on the returned
 *                    object so it matches the actual output dimensions exactly
 */
export function resolveMediaCrop<
  T extends { url?: string | null; width?: number | null; height?: number | null },
>(
  value:
    | { image?: T | number | null; cropData?: unknown; generatedUrls?: unknown }
    | null
    | undefined,
  cropName: string,
  outputSize?: { width: number; height: number },
): T | null {
  if (!value) return null

  const imageValue = value.image
  const imageDoc: T | null =
    imageValue != null && typeof imageValue !== 'number' ? imageValue : null

  const url = getCropUrl(value, cropName)
  if (!url || !imageDoc) return imageDoc

  return {
    ...imageDoc,
    url,
    ...(outputSize ? { width: outputSize.width, height: outputSize.height } : {}),
  }
}
