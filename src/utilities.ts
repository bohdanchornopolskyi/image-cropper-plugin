import type { CropImageValue, StaticLabel } from './types.js'

import { isRecord } from './isRecord.js'

/**
 * Resolves a Payload `StaticLabel` to a plain string for the given locale.
 * Falls back to `'en'`, then to the first available translation.
 */
export function resolveLabel(label: StaticLabel | undefined, lang: string): string {
  if (!label) {
    return ''
  }
  if (typeof label === 'string') {
    return label
  }
  return label[lang] ?? label['en'] ?? Object.values(label)[0] ?? ''
}

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
 * Returns the `object-position` value (e.g. `"62% 30%"`) that keeps a media
 * document's focal point framed under `object-fit: cover`. Returns
 * `undefined` when no focal point is set, matching default Payload behavior
 * for un-cropped renders.
 *
 * @param media  A media document (or relation ID / null) — typically
 *               `value.image` from a cropImage group field, or any Payload
 *               upload doc with `focalPoint: true`.
 */
export function getFocalPosition(
  media: { focalX?: null | number; focalY?: null | number } | null | number | undefined,
): string | undefined {
  if (!isRecord(media)) {
    return undefined
  }
  const { focalX, focalY } = media
  if (typeof focalX !== 'number' || typeof focalY !== 'number') {
    return undefined
  }
  return `${focalX}% ${focalY}%`
}

/**
 * Returns a Media-shaped object with the crop URL injected.
 * Falls back to the original media document when no generated URL exists.
 * Returns null if no image is set or it hasn't been populated (depth=0).
 *
 * When falling back to the original image (no crop saved yet for this slot),
 * the returned object also carries `objectPosition` — the media's focal
 * point as a CSS `object-position` value — so `object-fit: cover` frames the
 * same subject a manual crop would have targeted. Once a crop is saved,
 * `objectPosition` is omitted: the baked file is already framed correctly.
 *
 * @param value       The cropImage group field value from Payload
 * @param cropName    The slot name (must match a CropDefinition.name)
 * @param outputSize  When provided, overrides width/height on the returned
 *                    object so it matches the actual output dimensions exactly
 * @param sizeName    For multi-size crops, the size name (e.g. 'desktop').
 *                    Equivalent to passing `"cropName.sizeName"` as cropName.
 */
export function resolveMediaCrop<
  T extends {
    focalX?: null | number
    focalY?: null | number
    height?: null | number
    url?: null | string
    width?: null | number
  },
>(
  value:
    | { cropData?: unknown; generatedUrls?: unknown; image?: null | number | T }
    | null
    | undefined,
  cropName: string,
  outputSize?: { height: number; width: number },
  sizeName?: string,
): null | (T & { objectPosition?: string }) {
  if (!value) {
    return null
  }

  const imageValue = value.image
  const imageDoc: null | T =
    imageValue != null && typeof imageValue !== 'number' ? imageValue : null

  if (!imageDoc) {
    return null
  }

  const key = sizeName ? `${cropName}.${sizeName}` : cropName
  const urls = value.generatedUrls
  const isCropped = isRecord(urls) && typeof urls[key] === 'string'

  const url = getCropUrl(value, cropName, sizeName)
  if (!url) {
    return imageDoc
  }

  return {
    ...imageDoc,
    url,
    ...(outputSize ? { height: outputSize.height, width: outputSize.width } : {}),
    ...(isCropped ? {} : { objectPosition: getFocalPosition(imageDoc) }),
  }
}
