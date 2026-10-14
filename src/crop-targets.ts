import type { CropCoords, CropData, CropDefinition, ImageFormat } from './types.js'

export type CropTarget = {
  coords: CropCoords
  format: ImageFormat
  height: number
  /** Key in generatedUrls: the crop name or `cropName.sizeName`, plus `@format` for non-fallback formats. */
  key: string
  /** Crop name in cropData. */
  name: string
  quality: number
  width: number
}

/** A crop's output formats in preference order, deduplicated. The last one is the fallback. */
export function cropFormats(def: Pick<CropDefinition, 'format'>): ImageFormat[] {
  const formats = [def.format ?? []].flat()
  return formats.length ? [...new Set(formats)] : ['webp']
}

/** generatedUrls key of one format: the fallback (last) format keeps the plain key. */
export function formatKey(key: string, format: ImageFormat, formats: ImageFormat[]): string {
  return format === formats[formats.length - 1] ? key : `${key}@${format}`
}

/** Sharp quality for one format. PNG is lossless, so it gets a constant that keeps its filename hash stable. */
export function formatQuality(quality: CropDefinition['quality'], format: ImageFormat): number {
  if (format === 'png') {
    return 80
  }
  return (typeof quality === 'number' ? quality : quality?.[format]) ?? 80
}

/** One target per output file: every size of every crop that has coordinates. */
export function cropTargets(cropDefinitions: CropDefinition[], cropData: CropData): CropTarget[] {
  return cropDefinitions.flatMap((def) => {
    const coords = cropData[def.name]
    if (!coords) {
      return []
    }

    const sizes = def.sizes
      ? def.sizes.map((s) => ({ height: s.height, key: `${def.name}.${s.name}`, width: s.width }))
      : [{ height: def.height, key: def.name, width: def.width }]

    const formats = cropFormats(def)
    return sizes.flatMap((size) =>
      formats.map((format) => ({
        ...size,
        name: def.name,
        coords,
        format,
        key: formatKey(size.key, format, formats),
        quality: formatQuality(def.quality, format),
      })),
    )
  })
}

export function sameCoords(a: CropCoords | undefined, b: CropCoords): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
