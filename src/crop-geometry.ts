import { centerCrop, clamp, makeAspectCrop, type PercentCrop } from 'react-image-crop'

import type { CropCoords, CropDefinition } from './types.js'

export type MinCrop = {
  displayHeight: number
  displayWidth: number
  pctHeight: number
  pctWidth: number
}

export function computeMinCrop(imgEl: HTMLImageElement, def: CropDefinition): MinCrop | undefined {
  const { height: dh, naturalHeight: nh, naturalWidth: nw, width: dw } = imgEl
  if (!nw || !dw) {
    return undefined
  }

  let outputH: number, outputW: number
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
      displayHeight: (minNatH / nh) * dh,
      displayWidth: (minNatW / nw) * dw,
      pctHeight: (minNatH / nh) * 100,
      pctWidth: (minNatW / nw) * 100,
    }
  }

  const minNatW = Math.min(outputW, nw)
  const minNatH = Math.min(outputH, nh)
  return {
    displayHeight: (minNatH / nh) * dh,
    displayWidth: (minNatW / nw) * dw,
    pctHeight: (minNatH / nh) * 100,
    pctWidth: (minNatW / nw) * 100,
  }
}

/** Percent-based focal point, as stored by Payload's native `focalPoint` upload option. */
export type FocalPoint = { x: number; y: number }

/** Payload's own default when an image has no focal point set yet. */
export const DEFAULT_FOCAL: FocalPoint = { x: 50, y: 50 }

/**
 * Clamps a raw percent value into 0–100. Kept fractional — rounding to whole
 * percent makes a focal-point drag snap to a ~6px grid.
 */
export const clampPct = (n: number) => (Number.isFinite(n) ? clamp(n, 0, 100) : 0)

/** Whether the focal point falls inside (or on the edge of) the crop box. */
export const focalInCrop = (f: FocalPoint, c: PercentCrop) =>
  f.x >= c.x && f.x <= c.x + c.width && f.y >= c.y && f.y <= c.y + c.height

/** Nearest point inside the crop box. */
export const clampToCrop = (f: FocalPoint, c: PercentCrop): FocalPoint => ({
  x: clamp(f.x, c.x, c.x + c.width),
  y: clamp(f.y, c.y, c.y + c.height),
})

export const cropCenter = (c: PercentCrop): FocalPoint => ({
  x: c.x + c.width / 2,
  y: c.y + c.height / 2,
})

/** Positions a crop of the given percent size so it's centered on the focal point. */
function centerAtFocal(width: number, height: number, focal: FocalPoint): PercentCrop {
  const x = Math.max(0, Math.min(focal.x - width / 2, 100 - width))
  const y = Math.max(0, Math.min(focal.y - height / 2, 100 - height))
  return { height, unit: '%', width, x, y }
}

/** Honours a stored crop, lifting it to the quality minimum if it falls short. */
function keepExisting(
  existing: CropCoords,
  minW: number,
  minH: number,
  aspect: number | undefined,
  mediaWidth: number,
  mediaHeight: number,
): PercentCrop {
  if (existing.width >= minW && existing.height >= minH) {
    return {
      height: existing.height,
      unit: '%',
      width: existing.width,
      x: existing.x,
      y: existing.y,
    }
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
    height: h,
    unit: '%',
    width: w,
    x: Math.max(0, Math.min(existing.x, 100 - w)),
    y: Math.max(0, Math.min(existing.y, 100 - h)),
  }
}

export function initCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
  existing: CropCoords | undefined,
  minPct?: { pctHeight: number; pctWidth: number },
  focal?: FocalPoint,
): PercentCrop {
  const minW = minPct?.pctWidth ?? 0
  const minH = minPct?.pctHeight ?? 0

  if (existing) {
    const kept = keepExisting(existing, minW, minH, aspect, mediaWidth, mediaHeight)
    // A stored crop that excludes the focal point can't be honoured any more — fall
    // through and re-derive it from the point instead. Pass no `focal` to opt out.
    if (!focal || focalInCrop(focal, kept)) {
      return kept
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
  return { height: pct.height, width: pct.width, x: pct.x, y: pct.y }
}
