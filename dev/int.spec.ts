import type { Config } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { cropImageField, cropImagePlugin } from '../src/index.js'

// ---------------------------------------------------------------------------
// Unit tests – no Payload instance required
// ---------------------------------------------------------------------------

describe('cropImageField', () => {
  test('returns a group field with the given name and label', () => {
    const field = cropImageField({
      crops: [],
      label: 'Hero Image',
      name: 'heroImage',
    })
    expect(field.type).toBe('group')
    expect(field.name).toBe('heroImage')
    expect(field.label).toBe('Hero Image')
  })

  test('label defaults to false when not provided', () => {
    const field = cropImageField({ crops: [], name: 'cover' })
    expect(field.label).toBe(false)
  })

  test('includes image (upload), cropData (json), and generatedUrls (json) sub-fields', () => {
    const field = cropImageField({ crops: [], name: 'heroImage' })
    if (field.type !== 'group') throw new Error('expected group field')
    const byName = Object.fromEntries(field.fields.map((f) => [f.name, f]))
    expect(byName['image']?.type).toBe('upload')
    expect(byName['cropData']?.type).toBe('json')
    expect(byName['generatedUrls']?.type).toBe('json')
  })

  test('image upload field has required:false by default', () => {
    const field = cropImageField({ crops: [], name: 'heroImage' })
    if (field.type !== 'group') throw new Error('expected group field')
    const imageField = field.fields.find((f) => f.name === 'image')
    expect(imageField?.required).toBe(false)
  })

  test('image upload field honours the required option', () => {
    const field = cropImageField({ crops: [], name: 'heroImage', required: true })
    if (field.type !== 'group') throw new Error('expected group field')
    const imageField = field.fields.find((f) => f.name === 'image')
    expect(imageField?.required).toBe(true)
  })

  test('image upload field uses mediaCollectionSlug for relationTo', () => {
    const field = cropImageField({ crops: [], mediaCollectionSlug: 'images', name: 'hero' })
    if (field.type !== 'group') throw new Error('expected group field')
    const imageField = field.fields.find((f) => f.name === 'image')
    if (imageField?.type !== 'upload') throw new Error('expected upload field')
    expect(imageField.relationTo).toBe('images')
  })

  test('generateCropEndpoint clientProp reflects mediaCollectionSlug', () => {
    const field = cropImageField({ crops: [], mediaCollectionSlug: 'files', name: 'hero' })
    const clientProps = field.admin?.components?.Field?.clientProps as Record<string, unknown>
    expect(clientProps?.generateCropEndpoint).toBe('/api/files/generate-crop')
  })
})

describe('cropImagePlugin', () => {
  const baseConfig = (): Config =>
    ({
      collections: [
        { slug: 'posts', fields: [] },
        { slug: 'media', fields: [] },
      ],
    }) as unknown as Config

  test('adds the generate-crop endpoint to the media collection', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(baseConfig())
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ method: string; path: string }> | undefined
    expect(Array.isArray(endpoints)).toBe(true)
    expect(endpoints?.some((e) => e.path === '/generate-crop' && e.method === 'post')).toBe(true)
  })

  test('adds afterDelete hook to the media collection', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(baseConfig())
    const media = result.collections?.find((c) => c.slug === 'media')
    expect(media?.hooks?.afterDelete).toHaveLength(1)
  })

  test('preserves existing endpoints on the media collection', () => {
    const cfg = baseConfig()
    const existing = { handler: () => new Response(), method: 'get' as const, path: '/existing' }
    cfg.collections![1] = { ...cfg.collections![1]!, endpoints: [existing] }
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(cfg)
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ path: string }> | undefined
    expect(endpoints?.some((e) => e.path === '/existing')).toBe(true)
    expect(endpoints?.some((e) => e.path === '/generate-crop')).toBe(true)
  })

  test('does not modify non-media collections', () => {
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(baseConfig())
    const posts = result.collections?.find((c) => c.slug === 'posts')
    expect(posts?.endpoints).toBeUndefined()
    expect(posts?.hooks?.afterDelete).toBeUndefined()
  })

  test('handles endpoints:false on the media collection without crashing', () => {
    const cfg = baseConfig()
    cfg.collections![1] = { ...cfg.collections![1]!, endpoints: false }
    const result = cropImagePlugin({ mediaCollectionSlug: 'media' })(cfg)
    const media = result.collections?.find((c) => c.slug === 'media')
    const endpoints = media?.endpoints as Array<{ path: string }> | undefined
    expect(endpoints?.some((e) => e.path === '/generate-crop')).toBe(true)
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
    expect(
      (endpoints as Array<{ path: string }>).some((e) => e.path === '/generate-crop'),
    ).toBe(true)
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
    // Payload omits null sub-fields from the response, so an empty group comes back as {}
    expect(typeof post.heroImage).toBe('object')
  })
})
