import type { CropCoords, CropData, CropDefinition, ImageFormat } from './types.js'

export type CropTarget = {
  coords: CropCoords
  format: ImageFormat
  height: number
  /** Key in generatedUrls: the crop name, or `cropName.sizeName` for multi-size crops. */
  key: string
  /** Crop name in cropData. */
  name: string
  quality: number
  width: number
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

    return sizes.map((size) => ({
      ...size,
      name: def.name,
      coords,
      format: def.format ?? 'webp',
      quality: def.quality ?? 80,
    }))
  })
}

export function sameCoords(a: CropCoords | undefined, b: CropCoords): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
