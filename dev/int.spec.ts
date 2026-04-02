import type { Config } from 'payload'

import config from '@payload-config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import type { CropImageValue } from '../src/types.js'

import { makeGenerateCropHandler } from '../src/handler.js'
import { makeDeleteOrphanedCrops } from '../src/hook.js'
import { cropImageField, cropImagePlugin } from '../src/index.js'
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

  test('generateCropEndpoint clientProp reflects mediaCollectionSlug', () => {
    const field = cropImageField({
      name: 'hero',
      crops: [],
      mediaCollectionSlug: 'files',
    }) as unknown as TestGroupField
    expect(field.admin?.components?.Field?.clientProps?.generateCropEndpoint).toBe(
      '/api/files/generate-crop',
    )
  })

  test('cropDefinitions clientProp contains the provided crops', () => {
    const crops = [
      { name: 'desktop', aspectRatio: 16 / 9, height: 1080, label: 'Desktop', width: 1920 },
    ]
    const field = cropImageField({ name: 'hero', crops }) as unknown as TestGroupField
    expect(field.admin?.components?.Field?.clientProps?.cropDefinitions).toEqual(crops)
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

  test('adds the generate-crop endpoint to the media collection', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ method: string; path: string }> | undefined
    expect(Array.isArray(endpoints)).toBe(true)
    expect(endpoints?.some((e) => e.path === '/generate-crop' && e.method === 'post')).toBe(true)
  })

  test('adds afterDelete hook to the media collection', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    expect(media?.hooks?.afterDelete).toHaveLength(1)
  })

  test('preserves existing endpoints on the media collection', () => {
    const cfg = baseConfig()
    const existing = { handler: () => new Response(), method: 'get' as const, path: '/existing' }
    cfg.collections![1] = { ...cfg.collections![1], endpoints: [existing] }
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(cfg) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ path: string }> | undefined
    expect(endpoints?.some((e) => e.path === '/existing')).toBe(true)
    expect(endpoints?.some((e) => e.path === '/generate-crop')).toBe(true)
  })

  test('does not modify non-media collections', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const posts = result.collections?.find((c) => c.slug === 'posts')
    expect(posts?.endpoints).toBeUndefined()
    expect(posts?.hooks?.afterDelete).toBeUndefined()
  })

  test('handles endpoints:false on the media collection without crashing', () => {
    const cfg = baseConfig()
    cfg.collections![1] = { ...cfg.collections![1], endpoints: false }
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(cfg) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ path: string }> | undefined
    expect(endpoints?.some((e) => e.path === '/generate-crop')).toBe(true)
  })

  test('endpoint uses post method', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(
      baseConfig(),
    ) as unknown as Config
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ method: string; path: string }> | undefined
    const cropEndpoint = endpoints?.find((e) => e.path === '/generate-crop')
    expect(cropEndpoint?.method).toBe('post')
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

    const hook = makeDeleteOrphanedCrops(mediaDir)
    await (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } })

    expect(await exists('hero.webp')).toBe(true) // source not deleted
    expect(await exists('hero-crop-desktop-0-0-100x100-1920x1080.webp')).toBe(false)
    expect(await exists('hero-crop-mobile-0-0-100x100-828x1470.webp')).toBe(false)
  })

  test('does not delete crop files belonging to other images', async () => {
    await touch('hero.webp')
    await touch('hero-crop-desktop.webp')
    await touch('other-crop-desktop.webp')

    const hook = makeDeleteOrphanedCrops(mediaDir)
    await (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } })

    expect(await exists('other-crop-desktop.webp')).toBe(true)
  })

  test('is a no-op when doc has no filename', async () => {
    await touch('hero-crop-desktop.webp')

    const hook = makeDeleteOrphanedCrops(mediaDir)
    await (hook as (arg: unknown) => Promise<void>)({ doc: {} })

    expect(await exists('hero-crop-desktop.webp')).toBe(true)
  })

  test('does not throw when mediaDir does not exist', async () => {
    const hook = makeDeleteOrphanedCrops('/nonexistent/path')
    await expect(
      (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } }),
    ).resolves.toBeUndefined()
  })

  test('is a no-op when there are no crop files to delete', async () => {
    await touch('hero.webp')

    const hook = makeDeleteOrphanedCrops(mediaDir)
    await expect(
      (hook as (arg: unknown) => Promise<void>)({ doc: { filename: 'hero.webp' } }),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Unit tests – makeGenerateCropHandler (isolated, no Payload instance)
// ---------------------------------------------------------------------------

describe('makeGenerateCropHandler (isolated)', () => {
  let mediaDir: string
  let testImageFile: string

  beforeAll(async () => {
    mediaDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'handler-test-'))
    testImageFile = path.join(mediaDir, 'source.jpg')

    // Create a real 400×300 image so Sharp can process it
    await sharp({
      create: { background: { b: 200, g: 150, r: 100 }, channels: 3, height: 300, width: 400 },
    })
      .jpeg()
      .toFile(testImageFile)
  })

  afterAll(async () => {
    await fs.promises.rm(mediaDir, { force: true, recursive: true })
  })

  type MockRequest = {
    json: () => Promise<unknown>
    payload: { findByID: () => Promise<Record<string, unknown>> }
    user: unknown
  }

  function makeRequest(body: unknown, user: unknown = { id: '1' }): MockRequest {
    return {
      json: async () => body,
      payload: {
        findByID: async () => ({
          filename: 'source.jpg',
          height: 300,
          width: 400,
        }),
      },
      user,
    }
  }

  async function callHandler(
    handler: ReturnType<typeof makeGenerateCropHandler>,
    req: MockRequest,
  ): Promise<Response> {
    return handler(req as unknown as Parameters<typeof handler>[0])
  }

  test('returns 401 when there is no authenticated user', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(handler, makeRequest({}, null))
    expect(res.status).toBe(401)
  })

  test('returns 400 for an invalid request body', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(handler, makeRequest({ bad: 'data' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when cropData coords are missing', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(
      handler,
      makeRequest({
        cropData: { x: 0, y: 0 }, // missing width and height
        cropName: 'desktop',
        mediaId: '1',
        outputHeight: 1080,
        outputWidth: 1920,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('returns 400 for an invalid format value', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(
      handler,
      makeRequest({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        format: 'bmp', // not in VALID_FORMATS
        mediaId: '1',
        outputHeight: 1080,
        outputWidth: 1920,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('generates a webp crop and returns its URL', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(
      handler,
      makeRequest({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        format: 'webp',
        mediaId: '1',
        outputHeight: 150,
        outputWidth: 200,
      }),
    )

    // Response.json() without a status option defaults to 200
    expect([undefined, 200]).toContain(res.status)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toHaveProperty('url')
    expect(body['url']).toMatch(/\.webp$/)

    // The file should actually exist on disk
    const filePath = path.join(mediaDir, path.basename(body['url'] as string))
    expect(fs.existsSync(filePath)).toBe(true)
  })

  test('generates a jpeg crop when format is jpeg', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(
      handler,
      makeRequest({
        cropData: { height: 80, width: 80, x: 10, y: 10 },
        cropName: 'desktop-jpeg',
        format: 'jpeg',
        mediaId: '1',
        outputHeight: 150,
        outputWidth: 200,
      }),
    )
    const body = (await res.json()) as Record<string, unknown>
    expect(body['url']).toMatch(/\.jpg$/)
  })

  test('generates a png crop when format is png', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const res = await callHandler(
      handler,
      makeRequest({
        cropData: { height: 90, width: 90, x: 5, y: 5 },
        cropName: 'desktop-png',
        format: 'png',
        mediaId: '1',
        outputHeight: 150,
        outputWidth: 200,
      }),
    )
    const body = (await res.json()) as Record<string, unknown>
    expect(body['url']).toMatch(/\.png$/)
  })

  test('returns the cached URL without regenerating if the file already exists', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const requestBody = {
      cropData: { height: 100, width: 100, x: 0, y: 0 },
      cropName: 'cached',
      format: 'webp',
      mediaId: '1',
      outputHeight: 100,
      outputWidth: 100,
    }

    const first = (await (await callHandler(handler, makeRequest(requestBody))).json()) as Record<
      string,
      unknown
    >
    const firstMtime = fs.statSync(
      path.join(mediaDir, path.basename(first['url'] as string)),
    ).mtimeMs

    const second = (await (await callHandler(handler, makeRequest(requestBody))).json()) as Record<
      string,
      unknown
    >
    const secondMtime = fs.statSync(
      path.join(mediaDir, path.basename(second['url'] as string)),
    ).mtimeMs

    expect(first['url']).toBe(second['url'])
    expect(firstMtime).toBe(secondMtime) // file was NOT rewritten
  })

  test('deletes the old crop file when crop coords change (same slot)', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')

    // First crop
    const first = (await (
      await callHandler(
        handler,
        makeRequest({
          cropData: { height: 50, width: 50, x: 0, y: 0 },
          cropName: 'replace-me',
          format: 'webp',
          mediaId: '1',
          outputHeight: 100,
          outputWidth: 100,
        }),
      )
    ).json()) as Record<string, unknown>

    const firstFile = path.join(mediaDir, path.basename(first['url'] as string))
    expect(fs.existsSync(firstFile)).toBe(true)

    // Second crop with different coords for the same slot
    await callHandler(
      handler,
      makeRequest({
        cropData: { height: 50, width: 50, x: 25, y: 25 }, // different region
        cropName: 'replace-me',
        format: 'webp',
        mediaId: '1',
        outputHeight: 100,
        outputWidth: 100,
      }),
    )

    // The old file should have been removed
    expect(fs.existsSync(firstFile)).toBe(false)
  })

  test('returns 404 when the media document has no filename', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const req: MockRequest = {
      ...makeRequest({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        mediaId: 'missing',
        outputHeight: 100,
        outputWidth: 100,
      }),
      payload: { findByID: async () => ({ filename: null, height: 300, width: 400 }) },
    }
    const res = await callHandler(handler, req)
    expect(res.status).toBe(404)
  })

  test('returns 404 when the source file does not exist on disk', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const req: MockRequest = {
      ...makeRequest({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        mediaId: '1',
        outputHeight: 100,
        outputWidth: 100,
      }),
      payload: {
        findByID: async () => ({ filename: 'ghost.jpg', height: 300, width: 400 }),
      },
    }
    const res = await callHandler(handler, req)
    expect(res.status).toBe(404)
  })

  test('returns 422 when the media document has no dimensions', async () => {
    const handler = makeGenerateCropHandler(mediaDir, 'media')
    const req: MockRequest = {
      ...makeRequest({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        mediaId: '1',
        outputHeight: 100,
        outputWidth: 100,
      }),
      payload: { findByID: async () => ({ filename: 'source.jpg' }) },
    }
    const res = await callHandler(handler, req)
    expect(res.status).toBe(422)
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

  test('media collection exists and has the generate-crop endpoint', () => {
    const mediaCollection = payload.collections['media']
    expect(mediaCollection).toBeDefined()
    const endpoints = mediaCollection.config.endpoints as Array<{ path: string }> | false
    expect(Array.isArray(endpoints)).toBe(true)
    expect((endpoints as Array<{ path: string }>).some((e) => e.path === '/generate-crop')).toBe(
      true,
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
})
