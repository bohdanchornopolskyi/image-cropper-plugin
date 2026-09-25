import type { Config, FieldHook, PayloadRequest, Validate } from 'payload'

import { ValidationError } from 'payload'

import type { PluginTranslationKey } from './translations/index.js'
import type { CropCoords, CropData, CropDefinition, CropStorage, GeneratedUrls } from './types.js'

import { cropTargets, sameCoords } from './crop-targets.js'
import { generateCrops, type SourceMedia } from './generate.js'
import { isRecord } from './isRecord.js'
import { resolveLabel } from './utilities.js'

const RUNTIME_KEY = 'payload-plugin-image-cropper'

/** `req.context` flag that makes the hook render every crop again, set by `regenerateCrops`. */
export const REGENERATE_CONTEXT_KEY = 'payload-plugin-image-cropper:regenerate'

type PluginT = (
  key: `plugin-image-cropper:${PluginTranslationKey}`,
  opts?: Record<string, unknown>,
) => string

const pluginT = (t: unknown) => t as PluginT

type CropRuntime = { mediaDir: string; storage: CropStorage }

/** Server-only plugin state, keyed by media collection slug, read by the crop field hook. */
export function withCropRuntime(config: Config, mediaSlug: string, runtime: CropRuntime): Config {
  const existing = isRecord(config.custom?.[RUNTIME_KEY]) ? config.custom[RUNTIME_KEY] : {}
  return {
    ...config,
    custom: { ...config.custom, [RUNTIME_KEY]: { ...existing, [mediaSlug]: runtime } },
  }
}

function getCropRuntime(config: { custom?: Record<string, unknown> }, mediaSlug: string) {
  const all = config.custom?.[RUNTIME_KEY]
  return isRecord(all) ? (all[mediaSlug] as CropRuntime | undefined) : undefined
}

/** Tolerance for float drift in coordinates written by the crop UI. */
const EPSILON = 0.01

function isInsideImage(c: unknown): c is CropCoords {
  if (!isRecord(c)) {
    return false
  }
  const { height, width, x, y } = c
  const nums = [x, y, width, height]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return false
  }
  const [cx, cy, cw, ch] = nums as number[]
  return (
    cx >= -EPSILON &&
    cy >= -EPSILON &&
    cw > 0 &&
    ch > 0 &&
    cx + cw <= 100 + EPSILON &&
    cy + ch <= 100 + EPSILON
  )
}

/**
 * Validates `cropData`: every stored box must lie inside the image, and with `requireAllCrops`
 * every crop definition needs coordinates once an image is selected.
 */
export function makeValidateCropData(
  cropDefinitions: CropDefinition[],
  requireAllCrops: boolean,
): Validate {
  return (value, { req, siblingData }) => {
    const t = pluginT(req.t)
    if (value !== null && value !== undefined && !isRecord(value)) {
      return t('plugin-image-cropper:invalidCropData')
    }
    const crops = value ?? {}

    const bad = Object.entries(crops).find(([, coords]) => !isInsideImage(coords))
    if (bad) {
      return t('plugin-image-cropper:cropOutsideImage', { name: bad[0] })
    }

    const imageId = relationId(isRecord(siblingData) ? siblingData.image : null)
    const missing = cropDefinitions.filter((def) => !crops[def.name])
    if (requireAllCrops && imageId !== null && missing.length) {
      const names = missing.map(
        (def) => resolveLabel(def.label, req.i18n?.language ?? 'en') || def.name,
      )
      return t('plugin-image-cropper:missingCrops', { names: names.join(', ') })
    }
    return true
  }
}

function relationId(v: unknown): null | number | string {
  if (typeof v === 'string' || typeof v === 'number') {
    return v
  }
  return isRecord(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? v.id : null
}

const LOOKUPS_KEY = 'payload-plugin-image-cropper:media'

type Lookups = { byId: Map<string, Promise<null | SourceMedia>>; tail: Promise<unknown> }

/**
 * Media lookups for one request run one at a time and are shared per media document: crop
 * fields' hooks run in parallel, and parallel queries that open a MongoDB transaction fail.
 */
function findMedia(
  req: PayloadRequest,
  mediaSlug: string,
  id: number | string,
  overrideAccess: boolean | undefined,
): Promise<null | SourceMedia> {
  const lookups = ((req.context[LOOKUPS_KEY] as Lookups | undefined) ??= {
    byId: new Map(),
    tail: Promise.resolve(),
  })
  const key = `${mediaSlug}:${String(id)}`
  let lookup = lookups.byId.get(key)
  if (!lookup) {
    lookup = lookups.tail.then(
      () =>
        req.payload.findByID({
          id,
          collection: mediaSlug,
          depth: 0,
          disableErrors: true,
          overrideAccess,
          req,
        }) as Promise<null | SourceMedia>,
    )
    lookups.byId.set(key, lookup)
    lookups.tail = lookup.catch(() => null)
  }
  return lookup
}

/**
 * `beforeChange` hook for the `generatedUrls` sub-field. The stored URLs are server-owned:
 * a crop is rendered when its coordinates or the source image changed, or its URL is
 * missing, and every other URL is carried over from the previous document. With
 * `REGENERATE_CONTEXT_KEY` in `req.context`, every crop is rendered again.
 */
export function makeGenerateCropsHook(
  cropDefinitions: CropDefinition[],
  mediaSlug: string,
): FieldHook {
  return async ({ overrideAccess, path, previousSiblingDoc, req, siblingData }) => {
    const previous: Record<string, unknown> = previousSiblingDoc ?? {}
    const imageId = relationId(siblingData.image !== undefined ? siblingData.image : previous.image)
    const cropDataRaw =
      siblingData.cropData !== undefined ? siblingData.cropData : previous.cropData
    if (imageId === null || !isRecord(cropDataRaw)) {
      return null
    }

    const cropData = cropDataRaw as CropData
    const sameImage = String(relationId(previous.image)) === String(imageId)
    const prevCropData = (isRecord(previous.cropData) ? previous.cropData : {}) as CropData
    const regenerate = req.context[REGENERATE_CONTEXT_KEY] === true
    const prevUrls = (
      !regenerate && sameImage && isRecord(previous.generatedUrls) ? previous.generatedUrls : {}
    ) as GeneratedUrls

    const urls: GeneratedUrls = {}
    const targets = cropTargets(cropDefinitions, cropData).filter(({ coords }) =>
      isInsideImage(coords),
    )
    const stale = targets.filter((target) => {
      const prevUrl = prevUrls[target.key]
      if (prevUrl && sameCoords(prevCropData[target.name], target.coords)) {
        urls[target.key] = prevUrl
        return false
      }
      return true
    })
    if (!stale.length) {
      return urls
    }

    const cropDataPath = [...path.slice(0, -1), 'cropData'].join('.')
    const fail = (message: string) =>
      new ValidationError({
        errors: [
          {
            message: pluginT(req.t)('plugin-image-cropper:cropFailed', { error: message }),
            path: cropDataPath,
          },
        ],
        req,
      })

    const runtime = getCropRuntime(req.payload.config, mediaSlug)
    if (!runtime) {
      throw fail(`cropImagePlugin is not configured for the "${mediaSlug}" collection`)
    }

    const media = await findMedia(req, mediaSlug, imageId, overrideAccess)
    if (!media) {
      throw fail('Media not found')
    }

    try {
      Object.assign(urls, await generateCrops({ ...runtime, media, targets: stale }))
    } catch (e) {
      req.payload.logger.error({ err: e, msg: '[imageCropper] Crop generation failed' })
      throw fail(e instanceof Error ? e.message : 'Unknown error')
    }
    return urls
  }
}
