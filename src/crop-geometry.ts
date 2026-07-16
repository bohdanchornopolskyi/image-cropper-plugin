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

/** Percent-based focal point, as stored by Payload's native `focalPoint` upload option. */
export type FocalPoint = { x: number; y: number }

/** Payload's own default when an image has no focal point set yet. */
export const DEFAULT_FOCAL: FocalPoint = { x: 50, y: 50 }

/** Positions a crop of the given percent size so it's centered on the focal point. */
function centerAtFocal(width: number, height: number, focal: FocalPoint): PercentCrop {
  const x = Math.max(0, Math.min(focal.x - width / 2, 100 - width))
  const y = Math.max(0, Math.min(focal.y - height / 2, 100 - height))
  return { unit: '%', x, y, width, height }
}

export function initCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
  existing: CropCoords | undefined,
  minPct?: { pctWidth: number; pctHeight: number },
  focal?: FocalPoint,
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

  // No crop has been chosen for this slot yet — default to the media's focal
  // point (falling back to dead-center when none is set) instead of a plain
  // geometric center, so focal point remains the primary positioning signal.
  const focalPoint = focal ?? DEFAULT_FOCAL
  const startW = Math.max(90, minW)
  if (aspect) {
    const aspectCrop = makeAspectCrop({ unit: '%', width: startW }, aspect, mediaWidth, mediaHeight)
    return centerAtFocal(aspectCrop.width, aspectCrop.height, focalPoint)
  }
  const startH = Math.max(90, minH)
  return centerAtFocal(startW, startH, focalPoint)
}

export function percentCropToCoords(pct: PercentCrop): CropCoords {
  return { x: pct.x, y: pct.y, width: pct.width, height: pct.height }
}
