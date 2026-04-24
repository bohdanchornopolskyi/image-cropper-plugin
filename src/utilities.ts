import type { CropImageValue } from './types.js'

import { isRecord } from './isRecord.js'

/**
 * Returns the pre-generated crop URL for the given slot, or falls back to the
 * original image URL. Returns an empty string if no image is set.
 *
 * @param value     The cropImage group field value from Payload
 * @param cropName  The slot name (must match a CropDefinition.name)
 * @param sizeName  For multi-size crops, the size name (e.g. 'desktop').
 *                  Equivalent to passing `"cropName.sizeName"` as cropName.
 */
export function getCropUrl(
  value: CropImageValue | null | undefined,
  cropName: string,
  sizeName?: string,
): string {
  if (!value) {
    return ''
  }

  const key = sizeName ? `${cropName}.${sizeName}` : cropName
  const urls = value.generatedUrls
  if (isRecord(urls)) {
    const url = urls[key]
    if (typeof url === 'string') {
      return url
    }
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
 * @param sizeName    For multi-size crops, the size name (e.g. 'desktop').
 *                    Equivalent to passing `"cropName.sizeName"` as cropName.
 */
export function resolveMediaCrop<
  T extends { height?: null | number; url?: null | string; width?: null | number },
>(
  value:
    | { cropData?: unknown; generatedUrls?: unknown; image?: null | number | T }
    | null
    | undefined,
  cropName: string,
  outputSize?: { height: number; width: number },
  sizeName?: string,
): null | T {
  if (!value) {
    return null
  }

  const imageValue = value.image
  const imageDoc: null | T =
    imageValue != null && typeof imageValue !== 'number' ? imageValue : null

  const url = getCropUrl(value, cropName, sizeName)
  if (!url || !imageDoc) {
    return imageDoc
  }

  return {
    ...imageDoc,
    url,
    ...(outputSize ? { height: outputSize.height, width: outputSize.width } : {}),
  }
}
