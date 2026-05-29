import { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop'

import type { CropCoords, CropDefinition } from './types.js'

export type MinCrop = {
  displayWidth: number
  displayHeight: number
  pctWidth: number
  pctHeight: number
}

export function computeMinCrop(imgEl: HTMLImageElement, def: CropDefinition): MinCrop | undefined {
  const { naturalWidth: nw, naturalHeight: nh, width: dw, height: dh } = imgEl
  if (!nw || !dw) return undefined

  let outputW: number, outputH: number
  if (def.sizes) {
    const largest = def.sizes.reduce((a, b) => (a.width >= b.width ? a : b))
    outputW = largest.width
    outputH = largest.height
  } else {
    outputW = def.width
    outputH = def.height
  }

  if (def.aspectRatio) {
    const ar = def.aspectRatio
    const maxFitNatW = nw / nh > ar ? nh * ar : nw
    const minNatW = Math.min(outputW, maxFitNatW)
    const minNatH = minNatW / ar
    return {
      displayWidth: (minNatW / nw) * dw,
      displayHeight: (minNatH / nh) * dh,
      pctWidth: (minNatW / nw) * 100,
      pctHeight: (minNatH / nh) * 100,
    }
  }

  const minNatW = Math.min(outputW, nw)
  const minNatH = Math.min(outputH, nh)
  return {
    displayWidth: (minNatW / nw) * dw,
    displayHeight: (minNatH / nh) * dh,
    pctWidth: (minNatW / nw) * 100,
    pctHeight: (minNatH / nh) * 100,
  }
}

export function initCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
  existing: CropCoords | undefined,
  minPct?: { pctWidth: number; pctHeight: number },
): PercentCrop {
  const minW = minPct?.pctWidth ?? 0
  const minH = minPct?.pctHeight ?? 0

  if (existing) {
    if (existing.width >= minW && existing.height >= minH) {
      return { unit: '%', x: existing.x, y: existing.y, width: existing.width, height: existing.height }
    }
    // Existing crop is below the quality minimum — re-center at minimum size
    const startW = Math.max(existing.width, minW)
    if (aspect) {
      return centerCrop(
        makeAspectCrop({ unit: '%', width: startW }, aspect, mediaWidth, mediaHeight),
        mediaWidth,
        mediaHeight,
      )
    }
    const w = Math.max(existing.width, minW)
    const h = Math.max(existing.height, minH)
    return {
      unit: '%',
      x: Math.max(0, Math.min(existing.x, 100 - w)),
      y: Math.max(0, Math.min(existing.y, 100 - h)),
      width: w,
      height: h,
    }
  }

  const startW = Math.max(90, minW)
  if (aspect) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: startW }, aspect, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight,
    )
  }
  const startH = Math.max(90, minH)
  return { unit: '%', x: (100 - startW) / 2, y: (100 - startH) / 2, width: startW, height: startH }
}

export function percentCropToCoords(pct: PercentCrop): CropCoords {
  return { x: pct.x, y: pct.y, width: pct.width, height: pct.height }
}
