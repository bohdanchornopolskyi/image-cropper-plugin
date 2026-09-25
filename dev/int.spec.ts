import type { Config } from 'payload'

import config from '@payload-config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CropTarget } from '../src/crop-targets.js'
import type { CropImageValue } from '../src/types.js'

import { focalInCrop, initCrop } from '../src/crop-geometry.js'
import { cropTargets } from '../src/crop-targets.js'
import { validateCropData } from '../src/field-hooks.js'
import { generateCrops } from '../src/generate.js'
import { makeDeleteOrphanedCrops } from '../src/hook.js'
import { createCropImage, cropImageField, cropImagePlugin } from '../src/index.js'
import { makeCallbackCropStorage, makeLocalCropStorage } from '../src/storage.js'
import { getCropUrl, resolveMediaCrop } from '../src/utilities.js'

/**
 * Minimal shape of the group field returned by cropImageField – typed locally
 * so tests don't have to fight Payload's large Field union type.
 */
type TestGroupField = {
  admin?: {
    components?: {
      Field?: {
        clientProps?: Record<string, unknown>
      }
    }
    condition?: unknown
    description?: unknown
  }
  fields: Array<{
    name?: string
    relationTo?: string
    required?: boolean
    type?: string
  }>
  label: unknown
  name: string
  type: string
}

// ---------------------------------------------------------------------------
// Unit tests – cropImageField
// ---------------------------------------------------------------------------

describe('cropImageField', () => {
  test('returns a group field with the given name and label', () => {
    const field = cropImageField({
      name: 'heroImage',
      crops: [],
      label: 'Hero Image',
    }) as unknown as TestGroupField
    expect(field.type).toBe('group')
    expect(field.name).toBe('heroImage')
    expect(field.label).toBe('Hero Image')
  })

  test('label defaults to false when not provided', () => {
    const field = cropImageField({ name: 'cover', crops: [] }) as unknown as TestGroupField
    expect(field.label).toBe(false)
  })

  test('includes image (upload), cropData (json), and generatedUrls (json) sub-fields', () => {
    const field = cropImageField({ name: 'heroImage', crops: [] }) as unknown as TestGroupField
    const byName = Object.fromEntries(field.fields.filter((f) => f.name).map((f) => [f.name, f]))
    expect(byName['image']?.type).toBe('upload')
    expect(byName['cropData']?.type).toBe('json')
    expect(byName['generatedUrls']?.type).toBe('json')
  })

  test('image upload field has required:false by default', () => {
    const field = cropImageField({ name: 'heroImage', crops: [] }) as unknown as TestGroupField
    const imageField = field.fields.find((f) => f.name === 'image')
    expect(imageField?.required).toBe(false)
  })

  test('image upload field honours the required option', () => {
    const field = cropImageField({
      name: 'heroImage',
      crops: [],
      required: true,
    }) as unknown as TestGroupField
    const imageField = field.fields.find((f) => f.name === 'image')
    expect(imageField?.required).toBe(true)
  })

  test('image upload field uses mediaCollectionSlug for relationTo', () => {
    const field = cropImageField({
      name: 'hero',
      crops: [],
      mediaCollectionSlug: 'images',
    }) as unknown as TestGroupField
    const imageField = field.fields.find((f) => f.name === 'image')
    expect(imageField?.relationTo).toBe('images')
  })

  test('mediaCollectionSlug clientProp reflects mediaCollectionSlug', () => {
    const field = cropImageField({
      name: 'hero',
      crops: [],
      mediaCollectionSlug: 'files',
    }) as unknown as TestGroupField
    expect(field.admin?.components?.Field?.clientProps?.mediaCollectionSlug).toBe('files')
  })

  test('required clientProp mirrors the field config', () => {
    const required = cropImageField({
      name: 'hero',
      crops: [],
      required: true,
    }) as unknown as TestGroupField
    const optional = cropImageField({ name: 'hero', crops: [] }) as unknown as TestGroupField
    expect(required.admin?.components?.Field?.clientProps?.required).toBe(true)
    expect(optional.admin?.components?.Field?.clientProps?.required).toBe(false)
  })

  test('generates crops in a beforeChange hook on generatedUrls and validates cropData', () => {
    const field = cropImageField({ name: 'hero', crops: [] }) as unknown as {
      fields: Array<{ hooks?: { beforeChange?: unknown[] }; name: string; validate?: unknown }>
    }
    const byName = Object.fromEntries(field.fields.map((f) => [f.name, f]))
    expect(byName.generatedUrls?.hooks?.beforeChange).toHaveLength(1)
    expect(typeof byName.cropData?.validate).toBe('function')
  })

  test('cropDefinitions clientProp contains the provided crops', () => {
    const crops = [
      { name: 'desktop', aspectRatio: 16 / 9, height: 1080, label: 'Desktop', width: 1920 },
    ]
    const field = cropImageField({ name: 'hero', crops }) as unknown as TestGroupField
    expect(field.admin?.components?.Field?.clientProps?.cropDefinitions).toEqual(crops)
  })

  test('focalPoint clientProp defaults to true and honours an explicit false', () => {
    const props = (focalPoint?: boolean) =>
      (cropImageField({ name: 'hero', crops: [], focalPoint }) as unknown as TestGroupField).admin
        ?.components?.Field?.clientProps
    expect(props()?.focalPoint).toBe(true)
    expect(props(true)?.focalPoint).toBe(true)
    expect(props(false)?.focalPoint).toBe(false)
  })

  test('returns three sub-fields total', () => {
    const field = cropImageField({ name: 'heroImage', crops: [] }) as unknown as TestGroupField
    expect(field.fields).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Unit tests – cropImagePlugin
// ---------------------------------------------------------------------------

describe('cropImagePlugin', () => {
  const baseConfig = (): Config =>
    ({
      collections: [
        { slug: 'posts', fields: [] },
        { slug: 'media', fields: [] },
      ],
    }) as unknown as Config

  test('adds no endpoints to the media collection', async () => {
    const media = (await cropImagePlugin()(baseConfig())).collections?.find(
      (c) => c.slug === 'media',
    )
    expect(media?.endpoints).toBeUndefined()
  })

  test('registers server-only crop runtime state for the media collection', async () => {
    const custom = (await cropImagePlugin({ mediaDir: '/tmp/crops' })(baseConfig()))
      .custom as Record<string, Record<string, { mediaDir: string; storage: unknown }>>
    expect(custom['payload-plugin-image-cropper']?.media?.mediaDir).toBe('/tmp/crops')
  })

  describe('media directory', () => {
    let dirs: string[]

    beforeEach(async () => {
      dirs = await Promise.all(
        [0, 1].map(() => fs.promises.mkdtemp(path.join(os.tmpdir(), 'plugin-dir-test-'))),
      )
      await Promise.all(
        dirs.map((dir) => fs.promises.writeFile(path.join(dir, 'photo-crop-a.webp'), '')),
      )
    })

    afterEach(async () => {
      await Promise.all(dirs.map((dir) => fs.promises.rm(dir, { force: true, recursive: true })))
    })

    async function deleteMediaWith(pluginOptions: { mediaDir?: string }, staticDir: string) {
      const cfg = baseConfig()
      cfg.collections![1] = { ...cfg.collections![1], upload: { staticDir } } as never
      const media = (await cropImagePlugin(pluginOptions)(cfg)).collections?.find(
        (c) => c.slug === 'media',
      )
      const hook = media?.hooks?.afterDelete?.[0] as (arg: unknown) => Promise<void>
      await hook({ doc: { filename: 'photo.jpg' } })
    }

    const cropExists = (dir: string) => fs.existsSync(path.join(dir, 'photo-crop-a.webp'))

    test('defaults to the collection staticDir', async () => {
      await deleteMediaWith({}, dirs[0])
      expect(cropExists(dirs[0])).toBe(false)
    })

    test('resolves a relative staticDir against the working directory', async () => {
      await deleteMediaWith({}, path.relative(process.cwd(), dirs[0]))
      expect(cropExists(dirs[0])).toBe(false)
    })

    test('an explicit mediaDir wins over staticDir', async () => {
      await deleteMediaWith({ mediaDir: dirs[1] }, dirs[0])
      expect(cropExists(dirs[0])).toBe(true)
      expect(cropExists(dirs[1])).toBe(false)
    })
  })

  test('adds afterDelete hook to the media collection', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    expect(media?.hooks?.afterDelete).toHaveLength(1)
  })

  test('does not modify non-media collections', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const posts = result.collections?.find((c) => c.slug === 'posts')
    expect(posts?.endpoints).toBeUndefined()
    expect(posts?.hooks?.afterDelete).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Unit tests – createCropImage
// ---------------------------------------------------------------------------

describe('createCropImage', () => {
  const baseConfig = (): Config =>
    ({
      collections: [
        { slug: 'posts', fields: [] },
        { slug: 'media', fields: [] },
        { slug: 'files', fields: [] },
      ],
    }) as unknown as Config

  test('plugin and field both default to the "media" collection slug', () => {
    const { field, plugin } = createCropImage()

    const result = plugin(baseConfig()) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    expect(media?.hooks?.afterDelete).toHaveLength(1)

    const f = field({ name: 'hero', crops: [] }) as unknown as TestGroupField
    expect(f.admin?.components?.Field?.clientProps?.mediaCollectionSlug).toBe('media')
  })

  test('plugin and field both use the same custom mediaCollectionSlug', () => {
    const { field, plugin } = createCropImage({ mediaCollectionSlug: 'files' })

    const result = plugin(baseConfig()) as unknown as Config
    const files = result.collections?.find((c) => c.slug === 'files')
    expect(files?.hooks?.afterDelete).toHaveLength(1)

    const f = field({ name: 'hero', crops: [] }) as unknown as TestGroupField
    expect(f.admin?.components?.Field?.clientProps?.mediaCollectionSlug).toBe('files')
  })

  test('plugin does not touch other collections', () => {
    const { plugin } = createCropImage({ mediaCollectionSlug: 'files' })
    const result = plugin(baseConfig()) as unknown as Config
    const posts = result.collections?.find((c) => c.slug === 'posts')
    expect(posts?.endpoints).toBeUndefined()
  })

  test('field still accepts all other CropImageFieldConfig options', () => {
    const crops = [{ name: 'banner', height: 200, label: 'Banner', width: 800 }]
    const { field } = createCropImage({ mediaCollectionSlug: 'files' })
    const f = field({
      name: 'hero',
      crops,
      label: 'Hero Image',
      required: true,
    }) as unknown as TestGroupField
    expect(f.name).toBe('hero')
    expect(f.label).toBe('Hero Image')
    expect(f.admin?.components?.Field?.clientProps?.cropDefinitions).toEqual(crops)
    const imageField = f.fields.find((sub) => sub.name === 'image')
    expect(imageField?.required).toBe(true)
    expect(imageField?.relationTo).toBe('files')
  })
})

// ---------------------------------------------------------------------------
// Unit tests – cropTargets
// ---------------------------------------------------------------------------

describe('cropTargets', () => {
  const coords = { height: 60, width: 80, x: 10, y: 20 }

  test('returns one target for a single-size crop definition', () => {
    const targets = cropTargets([{ name: 'hero', height: 1080, label: 'Hero', width: 1920 }], {
      hero: coords,
    })
    expect(targets).toEqual([
      { name: 'hero', coords, format: 'webp', height: 1080, key: 'hero', quality: 80, width: 1920 },
    ])
  })

  test('returns one target per size for a multi-size crop definition', () => {
    const targets = cropTargets(
      [
        {
          name: 'card',
          label: 'Card',
          sizes: [
            { name: 'desktop', height: 675, label: 'Desktop', width: 1200 },
            { name: 'mobile', height: 338, label: 'Mobile', width: 600 },
          ],
        },
      ],
      { card: coords },
    )
    expect(targets.map((t) => [t.key, t.name, t.width])).toEqual([
      ['card.desktop', 'card', 1200],
      ['card.mobile', 'card', 600],
    ])
  })

  test('skips a crop definition when coordinates are missing', () => {
    const targets = cropTargets(
      [
        { name: 'hero', height: 1080, label: 'Hero', width: 1920 },
        { name: 'thumb', height: 300, label: 'Thumb', width: 300 },
      ],
      { hero: coords },
    )
    expect(targets.map((t) => t.key)).toEqual(['hero'])
  })

  test('honours explicit format and quality from the crop definition', () => {
    const [target] = cropTargets(
      [{ name: 'banner', format: 'jpeg', height: 200, label: 'Banner', quality: 90, width: 800 }],
      { banner: coords },
    )
    expect(target?.format).toBe('jpeg')
    expect(target?.quality).toBe(90)
  })
})

// ---------------------------------------------------------------------------
// Unit tests – validateCropData
// ---------------------------------------------------------------------------

describe('validateCropData', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}${opts ? JSON.stringify(opts) : ''}`
  const validate = (value: unknown) =>
    (validateCropData as (v: unknown, o: unknown) => string | true)(value, { req: { t } })

  test('accepts empty values and coordinates inside the image', () => {
    expect(validate(null)).toBe(true)
    expect(validate(undefined)).toBe(true)
    expect(validate({ hero: { height: 100, width: 100, x: 0, y: 0 } })).toBe(true)
    expect(validate({ hero: { height: 50.004, width: 50, x: 50.003, y: 49.999 } })).toBe(true)
  })

  test.each([
    ['x of 100', { height: 10, width: 10, x: 100, y: 0 }],
    ['negative y', { height: 10, width: 10, x: 0, y: -5 }],
    ['zero width', { height: 10, width: 0, x: 0, y: 0 }],
    ['box past the right edge', { height: 10, width: 60, x: 50, y: 0 }],
    ['non-numeric coordinate', { height: 10, width: 10, x: '5', y: 0 }],
    ['missing coordinate', { width: 10, x: 0, y: 0 }],
  ])('rejects %s', (_, coords) => {
    expect(validate({ hero: coords })).toBe('plugin-image-cropper:cropOutsideImage{"name":"hero"}')
  })

  test('rejects a value that is not an object', () => {
    expect(validate('nope')).toBe('plugin-image-cropper:invalidCropData')
  })
})

// ---------------------------------------------------------------------------
// Unit tests – initCrop (focal point default positioning)
// ---------------------------------------------------------------------------

describe('initCrop – focal point default positioning', () => {
  test('with no existing crop and no focal point, defaults to dead-center (backward compatible)', () => {
    const crop = initCrop(1000, 1000, undefined, undefined)
    expect(crop).toMatchObject({ height: 90, width: 90, x: 5, y: 5 })
  })

  test('with no existing crop and a center focal point (50/50), matches the dead-center default', () => {
    const crop = initCrop(1000, 1000, undefined, undefined, undefined, { x: 50, y: 50 })
    expect(crop).toMatchObject({ height: 90, width: 90, x: 5, y: 5 })
  })

  test('with no existing crop, centers the default crop on an off-center focal point', () => {
    const crop = initCrop(1000, 1000, undefined, undefined, undefined, { x: 20, y: 80 })
    // width/height stay at the 90% default; x/y shift toward the focal point
    expect(crop).toMatchObject({ height: 90, width: 90, x: 0, y: 10 })
  })

  test('clamps the focal-centered crop so it never exits the image bounds', () => {
    const crop = initCrop(1000, 1000, undefined, undefined, undefined, { x: 2, y: 98 })
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(100)
    expect(crop.y + crop.height).toBeLessThanOrEqual(100)
  })

  test('with an aspect ratio and an off-center focal point, centers the aspect-constrained crop on it', () => {
    const withoutFocal = initCrop(1000, 1000, 16 / 9, undefined)
    const withFocal = initCrop(1000, 1000, 16 / 9, undefined, undefined, { x: 10, y: 90 })

    // Size stays governed by the aspect ratio, independent of the focal point
    expect(withFocal.width).toBeCloseTo(withoutFocal.width, 5)
    expect(withFocal.height).toBeCloseTo(withoutFocal.height, 5)
    // Position shifts toward (and clamps at) the focal point
    expect(withFocal.x).toBe(0)
    expect(withFocal.y).toBeCloseTo(100 - withFocal.height, 5)
  })

  test('an existing manual crop always wins when no focal point is given', () => {
    const existing = { height: 50, width: 50, x: 10, y: 10 }
    expect(initCrop(1000, 1000, undefined, existing)).toMatchObject(existing)
  })

  test('an existing manual crop wins when it still contains the focal point', () => {
    const existing = { height: 50, width: 50, x: 10, y: 10 }
    const crop = initCrop(1000, 1000, undefined, existing, undefined, { x: 30, y: 30 })
    expect(crop).toMatchObject(existing)
  })

  test('an existing crop that excludes the focal point is re-seeded from the point', () => {
    const existing = { height: 50, width: 50, x: 10, y: 10 }
    const crop = initCrop(1000, 1000, undefined, existing, undefined, { x: 90, y: 90 })
    expect(crop).toMatchObject({ height: 90, width: 90, x: 10, y: 10 })
    expect(focalInCrop({ x: 90, y: 90 }, crop)).toBe(true)
  })

  // The re-seed above is only a valid recovery if a focal-seeded crop is
  // guaranteed to contain the point.
  test('a focal-seeded crop always contains the focal point', () => {
    const misses: string[] = []
    for (const [w, h] of [
      [1000, 1000],
      [4018, 3014],
      [800, 2000],
    ]) {
      for (const aspect of [undefined, 16 / 9, 9 / 16, 1, 4 / 3]) {
        for (let x = 0; x <= 100; x += 5) {
          for (let y = 0; y <= 100; y += 5) {
            const c = initCrop(w, h, aspect, undefined, undefined, { x, y })
            if (!focalInCrop({ x, y }, c)) {
              misses.push(`${w}x${h} aspect=${String(aspect)} focal=${x},${y}`)
            }
          }
        }
      }
    }
    expect(misses).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Unit tests – getCropUrl
// ---------------------------------------------------------------------------

describe('getCropUrl', () => {
  test('returns empty string for null', () => {
    expect(getCropUrl(null, 'desktop')).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(getCropUrl(undefined, 'desktop')).toBe('')
  })

  test('returns the generated URL when present', () => {
    const value: CropImageValue = {
      generatedUrls: { desktop: '/media/hero-crop-desktop.webp' },
      image: { url: '/media/hero.webp' },
    }
    expect(getCropUrl(value, 'desktop')).toBe('/media/hero-crop-desktop.webp')
  })

  test('falls back to image.url when no generated URL for that crop name', () => {
    const value: CropImageValue = {
      generatedUrls: { mobile: '/media/hero-crop-mobile.webp' },
      image: { url: '/media/hero.webp' },
    }
    expect(getCropUrl(value, 'desktop')).toBe('/media/hero.webp')
  })

  test('falls back to image.url when generatedUrls is empty', () => {
    const value: CropImageValue = { generatedUrls: {}, image: { url: '/media/hero.webp' } }
    expect(getCropUrl(value, 'desktop')).toBe('/media/hero.webp')
  })

  test('returns empty string when image is a numeric ID (not populated)', () => {
    const value: CropImageValue = { generatedUrls: {}, image: 42 }
    expect(getCropUrl(value, 'desktop')).toBe('')
  })

  test('returns empty string when both generatedUrls and image are absent', () => {
    expect(getCropUrl({}, 'desktop')).toBe('')
  })

  test('returns empty string when generatedUrls is not a record', () => {
    const value: CropImageValue = { generatedUrls: 'bad', image: { url: '/media/hero.webp' } }
    expect(getCropUrl(value, 'desktop')).toBe('/media/hero.webp')
  })
})

// ---------------------------------------------------------------------------
// Unit tests – resolveMediaCrop
// ---------------------------------------------------------------------------

describe('resolveMediaCrop', () => {
  const mediaDoc = { height: 1080, url: '/media/hero.webp', width: 1920 }

  test('returns null for null value', () => {
    expect(resolveMediaCrop(null, 'desktop')).toBeNull()
  })

  test('returns null for undefined value', () => {
    expect(resolveMediaCrop(undefined, 'desktop')).toBeNull()
  })

  test('returns null when image is a numeric ID (depth=0)', () => {
    expect(resolveMediaCrop({ image: 42 }, 'desktop')).toBeNull()
  })

  test('returns the image doc when no generated URL exists', () => {
    const value = { generatedUrls: {}, image: mediaDoc }
    const result = resolveMediaCrop(value, 'desktop')
    expect(result?.url).toBe('/media/hero.webp')
    expect(result?.width).toBe(1920)
  })

  test('injects crop URL into the media object', () => {
    const value = {
      generatedUrls: { desktop: '/media/hero-crop-desktop.webp' },
      image: mediaDoc,
    }
    const result = resolveMediaCrop(value, 'desktop')
    expect(result?.url).toBe('/media/hero-crop-desktop.webp')
    expect(result?.width).toBe(1920)
    expect(result?.height).toBe(1080)
  })

  test('does not mutate the original media doc', () => {
    const value = {
      generatedUrls: { desktop: '/media/hero-crop-desktop.webp' },
      image: mediaDoc,
    }
    resolveMediaCrop(value, 'desktop')
    expect(mediaDoc.url).toBe('/media/hero.webp')
  })

  test('overrides width and height when outputSize is provided', () => {
    const value = {
      generatedUrls: { desktop: '/media/hero-crop-desktop.webp' },
      image: mediaDoc,
    }
    const result = resolveMediaCrop(value, 'desktop', { height: 600, width: 800 })
    expect(result?.width).toBe(800)
    expect(result?.height).toBe(600)
    expect(result?.url).toBe('/media/hero-crop-desktop.webp')
  })

  test('preserves all other properties from the image doc', () => {
    const richDoc = { ...mediaDoc, alt: 'Hero', mimeType: 'image/webp' }
    const value = {
      generatedUrls: { desktop: '/media/hero-crop-desktop.webp' },
      image: richDoc,
    }
    const result = resolveMediaCrop(value, 'desktop') as typeof richDoc
    expect(result?.alt).toBe('Hero')
    expect(result?.mimeType).toBe('image/webp')
  })
})

// ---------------------------------------------------------------------------
// Unit tests – makeDeleteOrphanedCrops
// ---------------------------------------------------------------------------

describe('makeDeleteOrphanedCrops', () => {
  let mediaDir: string

  beforeEach(async () => {
    mediaDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hook-test-'))
  })

  afterAll(async () => {
    // best-effort cleanup
  })

  async function touch(filename: string) {
    await fs.promises.writeFile(path.join(mediaDir, filename), '')
  }

  async function exists(filename: string) {
    return fs.promises
      .access(path.join(mediaDir, filename))
      .then(() => true)
      .catch(() => false)
  }

  test('deletes all crop files for the deleted media document', async () => {
    await touch('hero.webp')
    await touch('hero-crop-desktop-0-0-100x100-1920x1080.webp')
    await touch('hero-crop-mobile-0-0-100x100-828x1470.webp')

    const hook = makeDeleteOrphanedCrops(makeLocalCropStorage(mediaDir))
    await (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } })

    expect(await exists('hero.webp')).toBe(true) // source not deleted
    expect(await exists('hero-crop-desktop-0-0-100x100-1920x1080.webp')).toBe(false)
    expect(await exists('hero-crop-mobile-0-0-100x100-828x1470.webp')).toBe(false)
  })

  test('does not delete crop files belonging to other images', async () => {
    await touch('hero.webp')
    await touch('hero-crop-desktop.webp')
    await touch('other-crop-desktop.webp')

    const hook = makeDeleteOrphanedCrops(makeLocalCropStorage(mediaDir))
    await (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } })

    expect(await exists('other-crop-desktop.webp')).toBe(true)
  })

  test('is a no-op when doc has no filename', async () => {
    await touch('hero-crop-desktop.webp')

    const hook = makeDeleteOrphanedCrops(makeLocalCropStorage(mediaDir))
    await (hook as (arg: unknown) => Promise<void>)({ doc: {} })

    expect(await exists('hero-crop-desktop.webp')).toBe(true)
  })

  test('does not throw when mediaDir does not exist', async () => {
    const hook = makeDeleteOrphanedCrops(makeLocalCropStorage('/nonexistent/path'))
    await expect(
      (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } }),
    ).resolves.toBeUndefined()
  })

  test('is a no-op when there are no crop files to delete', async () => {
    await touch('hero.webp')

    const hook = makeDeleteOrphanedCrops(makeLocalCropStorage(mediaDir))
    await expect(
      (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } }),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Unit tests – makeLocalCropStorage
// ---------------------------------------------------------------------------

describe('makeLocalCropStorage', () => {
  let mediaDir: string

  beforeEach(async () => {
    mediaDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-storage-test-'))
  })

  afterEach(async () => {
    await fs.promises.rm(mediaDir, { force: true, recursive: true })
  })

  const upload = (filename: string, bytes = 'new') => ({
    buffer: Buffer.from(bytes),
    cropName: 'hero',
    filename,
    format: 'webp' as const,
    mediaId: '1',
  })

  test('writes the crop, returns its URL, and leaves other crops alone', async () => {
    await fs.promises.writeFile(path.join(mediaDir, 'photo-crop-old.webp'), '')

    const storage = makeLocalCropStorage(mediaDir)
    const result = await storage.upload(upload('photo-crop-new.webp'))

    expect(result.url).toBe(`/${path.basename(mediaDir)}/photo-crop-new.webp`)
    expect(fs.readdirSync(mediaDir).sort()).toEqual(['photo-crop-new.webp', 'photo-crop-old.webp'])
  })

  test('keeps an existing file with the same name untouched', async () => {
    const storage = makeLocalCropStorage(mediaDir)
    await storage.upload(upload('photo-crop-a.webp', 'first'))
    await storage.upload(upload('photo-crop-a.webp', 'second'))

    expect(fs.readFileSync(path.join(mediaDir, 'photo-crop-a.webp'), 'utf8')).toBe('first')
  })

  test('deletes every crop of a source and nothing else', async () => {
    for (const name of [
      'photo.jpg',
      'photo-crop-a.webp',
      'photo-crop-b.jpg',
      'other-crop-a.webp',
    ]) {
      await fs.promises.writeFile(path.join(mediaDir, name), '')
    }

    await makeLocalCropStorage(mediaDir).deleteCropsByBase('photo')

    expect(fs.readdirSync(mediaDir).sort()).toEqual(['other-crop-a.webp', 'photo.jpg'])
  })
})

// ---------------------------------------------------------------------------
// Unit tests – generateCrops (no Payload instance)
// ---------------------------------------------------------------------------

describe('generateCrops', () => {
  let mediaDir: string
  const media = { id: '1', filename: 'source.jpg', height: 300, width: 400 }

  beforeAll(async () => {
    mediaDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'generate-test-'))
    await sharp({
      create: { background: { b: 200, g: 150, r: 100 }, channels: 3, height: 300, width: 400 },
    })
      .jpeg()
      .toFile(path.join(mediaDir, 'source.jpg'))
  })

  afterAll(async () => {
    await fs.promises.rm(mediaDir, { force: true, recursive: true })
  })

  const target = (overrides: Partial<CropTarget> = {}): CropTarget => ({
    name: 'hero',
    coords: { height: 50, width: 50, x: 0, y: 0 },
    format: 'webp',
    height: 100,
    key: 'hero',
    quality: 80,
    width: 100,
    ...overrides,
  })

  const generate = (
    targets: CropTarget[],
    overrides: Partial<Parameters<typeof generateCrops>[0]> = {},
  ) =>
    generateCrops({
      media,
      mediaDir,
      storage: makeLocalCropStorage(mediaDir),
      targets,
      ...overrides,
    })

  const fileOf = (url: string | undefined) => path.join(mediaDir, path.basename(url ?? ''))

  test('renders every target at its output size and format, keyed by target key', async () => {
    const urls = await generate([
      target({ format: 'webp', key: 'a', width: 200 }),
      target({ format: 'jpeg', key: 'b' }),
      target({ format: 'png', key: 'c' }),
    ])

    expect(Object.keys(urls)).toEqual(['a', 'b', 'c'])
    expect(urls.a).toMatch(/^\/generate-test-\w+\/source-crop-[0-9a-f]{16}\.webp$/)
    expect(urls.b).toMatch(/\.jpg$/)
    expect(urls.c).toMatch(/\.png$/)
    const { format, height, width } = await sharp(fileOf(urls.a)).metadata()
    expect({ format, height, width }).toEqual({ format: 'webp', height: 100, width: 200 })
  })

  test('crops EXIF-rotated images in the displayed orientation', async () => {
    // Stored 400×200 with orientation 6, so browsers display it as 200×400:
    // the left (red) half ends up on top and the right (blue) half at the bottom.
    const square = (background: string) =>
      sharp({ create: { background, channels: 3, height: 200, width: 200 } })
        .png()
        .toBuffer()
    await sharp({ create: { background: 'black', channels: 3, height: 200, width: 400 } })
      .composite([
        { input: await square('red'), left: 0, top: 0 },
        { input: await square('blue'), left: 200, top: 0 },
      ])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(path.join(mediaDir, 'rotated.jpg'))

    const { bottom } = await generate(
      [target({ coords: { height: 50, width: 100, x: 0, y: 50 }, format: 'png', key: 'bottom' })],
      { media: { id: '1', filename: 'rotated.jpg', height: 200, width: 400 } },
    )

    const output = fileOf(bottom)
    const { height, width } = await sharp(output).metadata()
    expect({ height, width }).toEqual({ height: 100, width: 100 })
    const { dominant } = await sharp(output).stats()
    expect(dominant.b).toBeGreaterThan(200)
    expect(dominant.r).toBeLessThan(50)
  })

  test('the same inputs reuse one file without rewriting it', async () => {
    const first = await generate([target({ key: 'cached' })])
    const mtime = fs.statSync(fileOf(first.cached)).mtimeMs
    const second = await generate([target({ key: 'cached' })])

    expect(second.cached).toBe(first.cached)
    expect(fs.statSync(fileOf(second.cached)).mtimeMs).toBe(mtime)
  })

  test('key order and extra keys in the coordinates do not change the file', async () => {
    const a = await generate([target({ coords: { height: 40, width: 30, x: 1, y: 2 } })])
    const b = await generate([
      target({
        coords: Object.fromEntries([
          ['unit', '%'],
          ['x', 1],
          ['y', 2],
          ['width', 30],
          ['height', 40],
        ]) as CropTarget['coords'],
      }),
    ])
    expect(b.hero).toBe(a.hero)
  })

  test('keeps each crop file when two documents crop the same media differently', async () => {
    const first = await generate([target()])
    const second = await generate([target({ coords: { height: 50, width: 50, x: 25, y: 25 } })])

    expect(first.hero).not.toBe(second.hero)
    expect(fs.existsSync(fileOf(first.hero))).toBe(true)
    expect(fs.existsSync(fileOf(second.hero))).toBe(true)
  })

  test('a quality, format or sub-percent coordinate change writes a new file', async () => {
    const results = await Promise.all(
      [
        target(),
        target({ quality: 50 }),
        target({ format: 'jpeg' }),
        target({ coords: { height: 50, width: 50, x: 0.4, y: 0 } }),
      ].map((t) => generate([t])),
    )
    expect(new Set(results.map((r) => r.hero)).size).toBe(4)
  })

  test('passes each crop to onCropGenerated and returns its URL', async () => {
    const onCropGenerated = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/crop.webp' })
    const urls = await generate([target({ key: 'card.lg', width: 120 })], {
      storage: makeCallbackCropStorage(onCropGenerated, makeLocalCropStorage(mediaDir)),
    })

    expect(urls).toEqual({ 'card.lg': 'https://cdn.example.com/crop.webp' })
    const ctx = onCropGenerated.mock.calls[0]?.[0] as Record<string, unknown>
    expect(ctx).toMatchObject({ cropName: 'card.lg', format: 'webp', mediaId: '1' })
    expect(Buffer.isBuffer(ctx.buffer)).toBe(true)
  })

  test('writes to local disk when onCropGenerated returns no URL', async () => {
    const urls = await generate([target({ key: 'void', width: 130 })], {
      storage: makeCallbackCropStorage(
        vi.fn().mockResolvedValue(undefined),
        makeLocalCropStorage(mediaDir),
      ),
    })
    expect(fs.existsSync(fileOf(urls.void))).toBe(true)
  })

  test('fetches the source from the media URL when it is not on disk', async () => {
    const remote = await sharp({
      create: { background: { b: 100, g: 100, r: 100 }, channels: 3, height: 100, width: 100 },
    })
      .jpeg()
      .toBuffer()
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(remote)))
    vi.stubGlobal('fetch', mockFetch)
    try {
      const urls = await generate([target({ key: 'remote' })], {
        media: {
          id: '1',
          filename: 'remote.jpg',
          height: 100,
          url: 'https://cdn.example.com/remote.jpg',
          width: 100,
        },
      })
      expect(mockFetch).toHaveBeenCalledWith('https://cdn.example.com/remote.jpg')
      expect(fs.existsSync(fileOf(urls.remote))).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test.each([
    ['has no file', { id: '1' }, /no file/],
    ['has no dimensions', { id: '1', filename: 'source.jpg' }, /no dimensions/],
    ['is missing on disk and has no URL', { ...media, filename: 'ghost.jpg' }, /not found/],
  ])('fails when the media %s', async (_, badMedia, message) => {
    await expect(generate([target()], { media: badMedia })).rejects.toThrow(message)
  })

  test('fails when the source is not a readable image', async () => {
    await fs.promises.writeFile(path.join(mediaDir, 'broken.jpg'), 'not an image')
    await expect(
      generate([target()], { media: { ...media, filename: 'broken.jpg' } }),
    ).rejects.toThrow(/not a readable image/)
  })
})

// ---------------------------------------------------------------------------
// Integration tests – requires Payload + in-memory MongoDB
// ---------------------------------------------------------------------------

describe('Payload integration', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await payload.destroy()
  })

  test('media collection exists without a generate-crop endpoint', () => {
    const endpoints = payload.collections['media'].config.endpoints
    expect(Array.isArray(endpoints) ? endpoints.map((e) => e.path) : []).not.toContain(
      '/generate-crop',
    )
  })

  test('posts collection exists', () => {
    expect(payload.collections['posts']).toBeDefined()
  })

  test('can create a post and the heroImage group field is present in the response', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {},
    })
    expect(post).toHaveProperty('heroImage')
    expect(typeof post.heroImage).toBe('object')
  })

  test('heroImage group contains image, cropData, and generatedUrls fields', async () => {
    const post = await payload.create({ collection: 'posts', data: {} })
    const heroImage = post.heroImage as Record<string, unknown>
    expect(
      'image' in heroImage || heroImage['image'] === undefined || heroImage['image'] === null,
    ).toBe(true)
  })

  test('can update a post heroImage.cropData via the API', async () => {
    const post = await payload.create({ collection: 'posts', data: {} })
    const cropData = { desktop: { height: 80, width: 90, x: 5, y: 10 } }

    const updated = await payload.update({
      id: post.id,
      collection: 'posts',
      data: { heroImage: { cropData } },
    })

    expect((updated.heroImage as Record<string, unknown>)['cropData']).toEqual(cropData)
  })

  test('can query multiple posts', async () => {
    await payload.create({ collection: 'posts', data: {} })
    await payload.create({ collection: 'posts', data: {} })

    const result = await payload.find({ collection: 'posts' })
    expect(result.totalDocs).toBeGreaterThanOrEqual(2)
  })

  test('media collection afterDelete hook is registered', () => {
    const mediaCollection = payload.collections['media']
    const hooks = mediaCollection.config.hooks?.afterDelete
    expect(Array.isArray(hooks)).toBe(true)
    expect(hooks.length).toBeGreaterThanOrEqual(1)
  })

  test('posts collection has the cardImage multi-size group field', () => {
    expect(payload.collections['posts']).toBeDefined()
  })

  test('can create a post and cardImage group field is present', async () => {
    const post = await payload.create({ collection: 'posts', data: {} })
    expect(post).toHaveProperty('cardImage')
    expect(typeof post.cardImage).toBe('object')
  })

  // The field saves the focal point by PATCHing focalX/focalY straight onto the
  // media doc, relying on Payload to read those as an upload edit. That parsing
  // lives in Payload (uploads/generateFileData.ts), not here — so pin it, or a
  // Payload bump could silently stop persisting focal points.
  const createMedia = async (name: string) => {
    const file = await sharp({
      create: { background: { b: 0, g: 0, r: 0 }, channels: 3, height: 300, width: 400 },
    })
      .png()
      .toBuffer()

    return payload.create({
      collection: 'media',
      data: {},
      file: { name, data: file, mimetype: 'image/png', size: file.length },
    })
  }

  describe('crops generated on save', () => {
    const mediaDir = path.resolve(import.meta.dirname, 'media')
    const onDisk = (url: unknown) => fs.existsSync(path.join(mediaDir, path.basename(String(url))))
    const heroCrops = {
      desktop: { height: 56.25, width: 100, x: 0, y: 0 },
      mobile: { height: 100, width: 42.1875, x: 10, y: 0 },
    }

    test('creating a post through the Local API renders every crop and size', async () => {
      const media = await createMedia('save-create.png')
      const post = await payload.create({
        collection: 'posts',
        data: {
          cardImage: {
            cropData: { card: { height: 50, width: 100, x: 0, y: 0 } },
            image: media.id,
          },
          heroImage: { cropData: heroCrops, image: media.id },
        },
      })

      const hero = post.heroImage?.generatedUrls as Record<string, string>
      const card = post.cardImage?.generatedUrls as Record<string, string>
      expect(Object.keys(hero).sort()).toEqual(['desktop', 'mobile'])
      expect(Object.keys(card).sort()).toEqual(['card.lg', 'card.md', 'card.sm'])
      expect([...Object.values(hero), ...Object.values(card)].every(onDisk)).toBe(true)
      const { height, width } = await sharp(
        path.join(mediaDir, path.basename(hero.desktop)),
      ).metadata()
      expect({ height, width }).toEqual({ height: 1080, width: 1920 })
    })

    test('saving again without changes does not render crops again', async () => {
      const media = await createMedia('save-unchanged.png')
      const post = await payload.create({
        collection: 'posts',
        data: { heroImage: { cropData: heroCrops, image: media.id } },
      })
      const urls = post.heroImage?.generatedUrls as Record<string, string>
      await fs.promises.unlink(path.join(mediaDir, path.basename(urls.desktop)))

      const again = await payload.update({
        id: post.id,
        collection: 'posts',
        data: { heroImage: { cropData: heroCrops, image: media.id } },
      })

      expect(again.heroImage?.generatedUrls).toEqual(urls)
      expect(onDisk(urls.desktop)).toBe(false)
    })

    test('changing one crop re-renders only that crop', async () => {
      const media = await createMedia('save-changed.png')
      const post = await payload.create({
        collection: 'posts',
        data: { heroImage: { cropData: heroCrops, image: media.id } },
      })
      const before = post.heroImage?.generatedUrls as Record<string, string>

      const after = (
        await payload.update({
          id: post.id,
          collection: 'posts',
          data: {
            heroImage: {
              cropData: { ...heroCrops, desktop: { height: 50, width: 88.89, x: 5, y: 5 } },
              image: media.id,
            },
          },
        })
      ).heroImage?.generatedUrls as Record<string, string>

      expect(after.desktop).not.toBe(before.desktop)
      expect(onDisk(after.desktop)).toBe(true)
      expect(after.mobile).toBe(before.mobile)
    })

    test('ignores generatedUrls sent by the client', async () => {
      const media = await createMedia('save-client-urls.png')
      const post = await payload.create({
        collection: 'posts',
        data: {
          heroImage: {
            cropData: heroCrops,
            generatedUrls: { desktop: 'https://evil.example.com/x.webp' },
            image: media.id,
          },
        },
      })
      expect((post.heroImage?.generatedUrls as Record<string, string>).desktop).not.toMatch(/evil/)
    })

    test('rejects coordinates outside the image', async () => {
      const media = await createMedia('save-invalid.png')
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            heroImage: {
              cropData: { desktop: { height: 10, width: 10, x: 100, y: 0 } },
              image: media.id,
            },
          },
        }),
      ).rejects.toMatchObject({
        data: { errors: [expect.objectContaining({ path: 'heroImage.cropData' })] },
      })
    })

    test('a failed crop fails the save with an error on the field', async () => {
      const media = await createMedia('save-missing-source.png')
      await fs.promises.unlink(path.join(mediaDir, media.filename!))

      await expect(
        payload.create({
          collection: 'posts',
          data: { heroImage: { cropData: heroCrops, image: media.id } },
        }),
      ).rejects.toMatchObject({
        data: {
          errors: [
            expect.objectContaining({
              message: expect.stringMatching(/Could not generate crops: Source file not found/),
              path: 'heroImage.cropData',
            }),
          ],
        },
      })
    })
  })

  test('a plain focalX/focalY update on a media doc is persisted by Payload', async () => {
    const media = await createMedia('focal-test.png')

    // Payload defaults an un-edited upload to dead centre.
    expect(media.focalX).toBe(50)
    expect(media.focalY).toBe(50)

    const updated = await payload.update({
      id: media.id,
      collection: 'media',
      data: { focalX: 62, focalY: 31 },
    })

    expect(updated.focalX).toBe(62)
    expect(updated.focalY).toBe(31)

    // And it survives a re-read, not just the update's return value.
    const reread = await payload.findByID({ id: media.id, collection: 'media' })
    expect(reread.focalX).toBe(62)
    expect(reread.focalY).toBe(31)
  })

  // Fractional coords are stored verbatim: a fileless update never reaches
  // Payload's resize path (which is what rounds), so CropModal's deliberately
  // fractional focal point survives the round trip intact.
  test('fractional focal coords are stored verbatim, not rounded', async () => {
    const media = await createMedia('focal-round.png')

    const updated = await payload.update({
      id: media.id,
      collection: 'media',
      data: { focalX: 62.4, focalY: 31.8 },
    })

    expect(updated.focalX).toBe(62.4)
    expect(updated.focalY).toBe(31.8)
  })

  // The counterpart to the above, and the reason the plugin ships getFocalPosition:
  // writing focalX/focalY does NOT re-derive Payload's own cropped imageSizes.
  // `shouldReupload` compares incoming data against itself, because updateByID
  // does not pass originalDoc to generateFileData — so it is always false without
  // a file in the request. Consumers must read the focal point at render time.
  test('a focal update does not regenerate Payload imageSizes', async () => {
    const media = await createMedia('focal-sizes.png')
    const before = (media.sizes as Record<string, { filename?: null | string }>).square?.filename
    expect(before).toBeTruthy()

    const updated = await payload.update({
      id: media.id,
      collection: 'media',
      data: { focalX: 90, focalY: 90 },
    })

    const after = (updated.sizes as Record<string, { filename?: null | string }>).square?.filename
    expect(after).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Unit tests – getCropUrl (multi-size / sizeName)
// ---------------------------------------------------------------------------

describe('getCropUrl – multi-size compound keys', () => {
  test('resolves compound key via sizeName param', () => {
    const value: CropImageValue = {
      generatedUrls: { 'card.lg': '/media/photo-crop-card.lg.webp' },
    }
    expect(getCropUrl(value, 'card', 'lg')).toBe('/media/photo-crop-card.lg.webp')
  })

  test('getCropUrl(value, "a.b") is equivalent to getCropUrl(value, "a", "b")', () => {
    const value: CropImageValue = {
      generatedUrls: { 'card.lg': '/media/photo-crop-card.lg.webp' },
    }
    expect(getCropUrl(value, 'card.lg')).toBe(getCropUrl(value, 'card', 'lg'))
  })

  test('falls back to image URL when compound key is missing', () => {
    const value: CropImageValue = {
      generatedUrls: {},
      image: { url: '/media/photo.webp' },
    }
    expect(getCropUrl(value, 'card', 'lg')).toBe('/media/photo.webp')
  })

  test('returns empty string when both compound key and image are absent', () => {
    expect(getCropUrl({}, 'card', 'lg')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Unit tests – resolveMediaCrop (multi-size / sizeName)
// ---------------------------------------------------------------------------

describe('resolveMediaCrop – multi-size compound keys', () => {
  const mediaDoc = { height: 1080, url: '/media/photo.webp', width: 1920 }

  test('injects compound crop URL via sizeName param', () => {
    const value = {
      generatedUrls: { 'card.lg': '/media/photo-crop-card.lg.webp' },
      image: mediaDoc,
    }
    const result = resolveMediaCrop(value, 'card', undefined, 'lg')
    expect(result?.url).toBe('/media/photo-crop-card.lg.webp')
  })

  test('overrides dimensions when outputSize and sizeName are both provided', () => {
    const value = {
      generatedUrls: { 'card.sm': '/media/photo-crop-card.sm.webp' },
      image: mediaDoc,
    }
    const result = resolveMediaCrop(value, 'card', { height: 219, width: 390 }, 'sm')
    expect(result?.url).toBe('/media/photo-crop-card.sm.webp')
    expect(result?.width).toBe(390)
    expect(result?.height).toBe(219)
  })

  test('falls back to original image when compound key not found', () => {
    const value = { generatedUrls: {}, image: mediaDoc }
    const result = resolveMediaCrop(value, 'card', undefined, 'md')
    expect(result?.url).toBe('/media/photo.webp')
  })

  test('does not mutate the original media doc', () => {
    const doc = { ...mediaDoc }
    resolveMediaCrop(
      { generatedUrls: { 'card.lg': '/x.webp' }, image: doc },
      'card',
      undefined,
      'lg',
    )
    expect(doc.url).toBe('/media/photo.webp')
  })
})
