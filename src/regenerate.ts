import type { CollectionSlug, Payload } from 'payload'

import { REGENERATE_CONTEXT_KEY } from './field-hooks.js'
import { isRecord } from './isRecord.js'

export type RegenerateCropsResult = {
  failed: Array<{ id: number | string; message: string }>
  regenerated: number
  skipped: number
}

/**
 * Renders the crops of every document in a collection again from their stored coordinates,
 * for example after a crop definition gains a size or changes format. Each document is saved
 * through the Local API, so the collection's own hooks run as on any other update.
 *
 * @param args.field  Name of the crop field. Use a dot path for a field inside named groups
 *                    (`'hero.image'`); fields inside arrays or blocks are not supported.
 */
export async function regenerateCrops({
  batchSize = 20,
  collection,
  field,
  payload,
}: {
  batchSize?: number
  collection: CollectionSlug
  field: string
  payload: Payload
}): Promise<RegenerateCropsResult> {
  const result: RegenerateCropsResult = { failed: [], regenerated: 0, skipped: 0 }
  const segments = field.split('.')

  for (let page = 1; ; page++) {
    const batch = await payload.find({ collection, depth: 0, limit: batchSize, page, sort: 'id' })

    for (const doc of batch.docs) {
      const value = segments.reduce<unknown>((v, key) => (isRecord(v) ? v[key] : undefined), doc)
      if (!isRecord(value) || value.image == null || !isRecord(value.cropData)) {
        result.skipped++
        continue
      }

      const data = segments.reduceRight<Record<string, unknown>>(
        (inner, key) => ({ [key]: inner }),
        { cropData: value.cropData, image: value.image },
      )
      try {
        await payload.update({
          id: doc.id,
          collection,
          context: { [REGENERATE_CONTEXT_KEY]: true },
          data,
          depth: 0,
        })
        result.regenerated++
      } catch (e) {
        result.failed.push({ id: doc.id, message: e instanceof Error ? e.message : String(e) })
      }
    }

    if (!batch.hasNextPage) {
      break
    }
  }

  return result
}
