# payload-image-cropper

A [Payload CMS 3.x](https://payloadcms.com) plugin that adds interactive image cropping to your collections. Define crop presets per field, let editors crop images in an intuitive modal, and automatically generate optimized image variants via Sharp — all stored and ready to use in your frontend.

## Features

- **Interactive crop modal** — powered by `react-image-crop` with aspect ratio constraints
- **Multiple crop presets per field** — desktop, mobile, social, etc., each with its own dimensions and format
- **Multi-size crops** — one crop selection generates multiple output sizes (e.g. 1200×675, 768×432, 390×219) for responsive images without making editors crop separately per breakpoint
- **Server-side image generation** — Sharp processes crops on save; supports `webp`, `jpeg`, and `png`
- **S3 / cloud storage** — `onCropGenerated` callback receives the Sharp buffer and can upload to any storage provider, returning a CDN URL
- **Automatic cleanup** — crop files are deleted when the source media is removed
- **Frontend utilities** — `getCropUrl` and `resolveMediaCrop` helpers for templates
- **Localized labels** — `label` fields accept a `Record<string, string>` locale map (Payload's `StaticLabel` type); the admin panel resolves the correct language automatically
- **TypeScript-first** — full types exported for all config and values

## Requirements

- Payload `^3.80.0`
- React `^18.0.0` or `^19.0.0`
- Sharp `^0.33.0` (peer dependency — install separately)

## Installation

```bash
npm install payload-plugin-image-cropper
# or
pnpm add payload-plugin-image-cropper
```

Sharp is a peer dependency and must be installed in your project:

```bash
npm install sharp
```

## Setup

### 1. Add the plugin to your Payload config

#### Local filesystem storage

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { cropImagePlugin } from 'payload-plugin-image-cropper'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      upload: {
        staticDir: 'public/media', // relative to process.cwd()
      },
      fields: [],
    },
  ],
  plugins: [
    cropImagePlugin({
      mediaCollectionSlug: 'media', // default: 'media'
    }),
  ],
})
```

The plugin reads and writes crops in the media collection's `staticDir`, resolved against the working directory the same way Payload resolves it. Set `mediaDir` only to point the plugin at a different directory.

#### S3 and other cloud storage

Add an `s3` block to `cropImagePlugin` using the same values you already pass to `@payloadcms/storage-s3` — no extra imports or custom functions needed. The plugin creates the S3 client internally, uploads crops on save, and deletes them automatically when the source media document is removed.

```ts
import { s3Storage } from '@payloadcms/storage-s3'
import { cropImagePlugin } from 'payload-plugin-image-cropper'

export default buildConfig({
  plugins: [
    s3Storage({
      acl: 'public-read',
      bucket: process.env.S3_BUCKET,
      collections: {
        media: {
          generateFileURL: ({ filename, prefix }) => {
            return [process.env.CDN_ENDPOINT, prefix, filename].filter(Boolean).join('/')
          },
          prefix: process.env.S3_PREFIX,
        },
      },
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
        endpoint: process.env.S3_ENDPOINT,   // omit for AWS, required for DO Spaces / MinIO
        forcePathStyle: false,
        region: process.env.S3_REGION,
      },
    }),
    cropImagePlugin({
      mediaCollectionSlug: 'media',
      s3: {
        acl: 'public-read',
        bucket: process.env.S3_BUCKET,
        config: {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          },
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: false,
          region: process.env.S3_REGION,
        },
        prefix: process.env.S3_PREFIX,
        generateUrl: ({ filename, prefix }) => {
          return [process.env.CDN_ENDPOINT, prefix, filename].filter(Boolean).join('/')
        },
      },
    }),
  ],
})
```

The `s3` config mirrors `@payloadcms/storage-s3` so the values are identical — copy the `bucket`, `config`, `acl`, and `prefix` across, and write the same `generateUrl` arrow function you use for `generateFileURL`. The plugin handles `PutObject` on crop save and `ListObjects` + `DeleteObject` on source media deletion.

> The source image is read from `staticDir` when it is on disk. With `disableLocalStorage: true`, it is fetched from its URL instead.

### 2. Add `cropImageField` to a collection

#### Single-size crops (one output per crop)

```ts
import { cropImageField } from 'payload-plugin-image-cropper'

{
  slug: 'posts',
  fields: [
    cropImageField({
      name: 'heroImage',
      label: 'Hero Image',
      crops: [
        {
          name: 'desktop',
          label: 'Desktop (16:9)',
          width: 1920,
          height: 1080,
          aspectRatio: 16 / 9,
          format: 'webp',
          quality: 85,
        },
        {
          name: 'mobile',
          label: 'Mobile (4:5)',
          width: 828,
          height: 1035,
          aspectRatio: 4 / 5,
        },
      ],
    }),
  ],
}
```

#### Multi-size crops (one crop selection → multiple output sizes)

Use `sizes` instead of `width` / `height` when you need the same crop region at different resolutions — e.g. a card image that should be 1200 px wide on desktop but 390 px on mobile. The editor crops once; the plugin generates all sizes automatically.

```ts
cropImageField({
  name: 'cardImage',
  label: 'Card Image',
  crops: [
    {
      name: 'card',
      label: 'Card (16:9)',
      aspectRatio: 16 / 9,
      sizes: [
        { name: 'lg', label: 'Large (desktop)', width: 1200, height: 675 },
        { name: 'md', label: 'Medium (tablet)', width: 768,  height: 432 },
        { name: 'sm', label: 'Small (mobile)',  width: 390,  height: 219 },
      ],
    },
  ],
})
```

Generated URLs are stored under compound keys: `card.lg`, `card.md`, `card.sm`.

## Configuration Reference

### Plugin options (`cropImagePlugin`)

| Option | Type | Default | Description |
|---|---|---|---|
| `mediaCollectionSlug` | `string` | `'media'` | Slug of the collection that stores media uploads |
| `mediaDir` | `string` | the media collection's `staticDir` | Directory where source images are read from and crops are written to. Relative paths resolve against `process.cwd()`. |
| `s3` | `S3CropConfig` | — | S3 / S3-compatible storage. When set, crops are uploaded to the bucket and deleted automatically — no custom code required. |
| `onCropGenerated` | `function` | — | _(Advanced)_ Low-level hook called after Sharp processes each crop. Return `{ url }` to store a custom URL and skip the local disk write, or return void to write to disk. |

### `S3CropConfig`

| Option | Type | Description |
|---|---|---|
| `bucket` | `string` | **Required.** S3 bucket name. |
| `config` | `object` | **Required.** S3 client config — same object passed to `@payloadcms/storage-s3`. |
| `config.region` | `string` | **Required.** AWS / provider region. |
| `config.credentials` | `object` | `accessKeyId` + `secretAccessKey`. Omit to use environment variables or instance profile. |
| `config.endpoint` | `string` | Custom endpoint for S3-compatible providers (DigitalOcean Spaces, MinIO, etc.). |
| `config.forcePathStyle` | `boolean` | Force path-style URLs. |
| `generateUrl` | `(args: { filename, prefix? }) => string` | **Required.** Build the public URL for a crop file. Same logic as `generateFileURL` in `s3Storage`. |
| `acl` | `string` | Object ACL, e.g. `'public-read'`. |
| `cacheControl` | `string` | `Cache-Control` header for crop objects. Defaults to `'public, max-age=31536000, immutable'` — safe because each crop filename is a hash of the source file and every crop setting, so a re-crop writes a new key. |
| `prefix` | `string` | Key prefix inside the bucket. Mirrors `prefix` in `s3Storage` collection config. |

### `cropImageField` options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Field name in the document |
| `crops` | `CropDefinition[]` | — | **Required.** Array of crop presets |
| `label` | `string \| Record<string, string>` | — | Display label in the admin panel. Accepts a locale map (see [Localized labels](#localized-labels)). |
| `required` | `boolean` | `false` | Whether a selection is required |
| `focalPoint` | `boolean` | `true` | Show the draggable focal-point marker in the crop modal, saved to the media doc's `focalX`/`focalY`. Set to `false` for fields where subject position is irrelevant (logos, flat graphics) — the marker is hidden and the media doc is never written to. |
| `mediaCollectionSlug` | `string` | `'media'` | Override the media collection slug for this field |
| `admin.condition` | `function` | — | Conditionally show this field |
| `admin.description` | `string` | — | Help text shown below the field |

### `CropDefinition`

A crop preset is either a **single-size** variant (specify `width` + `height`) or a **multi-size** variant (specify `sizes`). The two forms are mutually exclusive.

**Single-size**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Unique machine-readable key (e.g. `'desktop'`) |
| `label` | `string \| Record<string, string>` | — | **Required.** Human-readable tab label in the crop modal. Accepts a locale map (see [Localized labels](#localized-labels)). |
| `width` | `number` | — | **Required.** Output image width in pixels |
| `height` | `number` | — | **Required.** Output image height in pixels |
| `aspectRatio` | `number` | — | Constrain the crop selection (e.g. `16 / 9`) |
| `format` | `'webp' \| 'jpeg' \| 'png'` | `'webp'` | Output image format |
| `quality` | `number` | `80` | Sharp quality (1–100, ignored for PNG) |

**Multi-size** (use `sizes` instead of `width` / `height`)

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Unique machine-readable key (e.g. `'card'`) |
| `label` | `string \| Record<string, string>` | — | **Required.** Human-readable tab label in the crop modal. Accepts a locale map. |
| `sizes` | `SizeDefinition[]` | — | **Required.** Output sizes to generate from this crop region |
| `aspectRatio` | `number` | — | Constrain the crop selection |
| `format` | `'webp' \| 'jpeg' \| 'png'` | `'webp'` | Output image format (applies to all sizes) |
| `quality` | `number` | `80` | Sharp quality (applies to all sizes) |

### `SizeDefinition`

| Option | Type | Description |
|---|---|---|
| `name` | `string` | **Required.** Size key suffix (e.g. `'lg'`). Combined with the crop name as `card.lg`. |
| `width` | `number` | **Required.** Output width in pixels |
| `height` | `number` | **Required.** Output height in pixels |
| `label` | `string \| Record<string, string>` | Human-readable label shown in the admin UI. Accepts a locale map. |

## Localized labels

Every `label` field in `cropImageField`, `CropDefinition`, and `SizeDefinition` accepts either a plain string or a locale map matching Payload's [`StaticLabel`](https://payloadcms.com/docs/fields/overview#field-options) type (`Record<string, string>`). The admin panel resolves the correct language automatically based on the editor's active language, falling back to `'en'`, then the first available key.

```ts
cropImageField({
  name: 'heroImage',
  label: { en: 'Hero Image', de: 'Heldenbild' },
  crops: [
    {
      name: 'desktop',
      label: { en: 'Desktop', de: 'Desktop' },
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
    },
    {
      name: 'mobile',
      label: { en: 'Mobile', de: 'Mobil' },
      width: 828,
      height: 1470,
      aspectRatio: 9 / 16,
    },
  ],
})
```

With multi-size crops:

```ts
cropImageField({
  name: 'cardImage',
  label: { en: 'Card Image', de: 'Kartenbild' },
  crops: [
    {
      name: 'card',
      label: { en: 'Card (16:9)', de: 'Karte (16:9)' },
      aspectRatio: 16 / 9,
      sizes: [
        { name: 'lg', label: { en: 'Large (desktop)', de: 'Groß (Desktop)' }, width: 1200, height: 675 },
        { name: 'md', label: { en: 'Medium (tablet)', de: 'Mittel (Tablet)' }, width: 768,  height: 432 },
        { name: 'sm', label: { en: 'Small (mobile)',  de: 'Klein (Mobil)'  }, width: 390,  height: 219 },
      ],
    },
  ],
})
```

Locale maps work alongside Payload's `i18n` config — no extra setup is required in the plugin.

## Using crops in your frontend

### Single-size crops

```ts
import { getCropUrl, resolveMediaCrop, resolveLabel } from 'payload-plugin-image-cropper/utilities'

// Resolve a StaticLabel to a string
const label = resolveLabel({ en: 'Hero Image', de: 'Heldenbild' }, 'de') // → 'Heldenbild'

// URL for a named crop
const url = getCropUrl(post.heroImage, 'desktop')
// → '/media/my-photo-crop-3f2a9c01d4e5b6a7.webp'

// Full media object with the crop URL injected as `url`
const media = resolveMediaCrop(post.heroImage, 'mobile')
// → { id: '...', filename: '...', url: '/media/my-photo-crop-....webp', ... }
```

Both helpers are safe to call with `null` or `undefined` — they return `''` / `null` respectively. When no generated crop exists yet, `getCropUrl` falls back to the original `image.url` so the field degrades gracefully before an editor has cropped the image.

### Combining manual crops with focal point

You don't have to choose between the manual cropper and Payload's focal point — `resolveMediaCrop` combines both automatically. When a slot has a saved crop, its baked file is used as-is. When it doesn't (yet), the returned object carries `objectPosition` — the media's focal point as a CSS value — so `object-fit: cover` frames the same subject the focal point marks, exactly like default Payload behavior:

```tsx
const media = resolveMediaCrop(post.heroImage, 'desktop')

<img
  src={media.url}
  style={{ objectFit: 'cover', objectPosition: media.objectPosition ?? 'center' }}
/>
// Cropped → objectPosition is undefined, the baked file is already framed correctly.
// Not cropped yet → objectPosition tracks the focal point, e.g. '80% 20%'.
```

This is also useful for ad-hoc shapes you haven't defined a preset for — e.g. a one-off 1:1 thumbnail. Use `getFocalPosition` directly on the raw media document:

```ts
import { getFocalPosition } from 'payload-plugin-image-cropper/utilities'

const position = getFocalPosition(post.heroImage.image) // → '80% 20%' or undefined
```

### Multi-size crops

Pass the size name as the third argument to `getCropUrl`:

```ts
const lgUrl = getCropUrl(post.cardImage, 'card', 'lg')
const mdUrl = getCropUrl(post.cardImage, 'card', 'md')
const smUrl = getCropUrl(post.cardImage, 'card', 'sm')

// Compound-key shorthand — equivalent to the above
const lgUrl = getCropUrl(post.cardImage, 'card.lg')
```

Use `resolveMediaCrop` when you need the full media object. Pass the `outputSize` object as the third argument so the returned object reflects the actual pixel dimensions of that size:

```ts
const lgMedia = resolveMediaCrop(post.cardImage, 'card', { width: 1200, height: 675 }, 'lg')
const mdMedia = resolveMediaCrop(post.cardImage, 'card', { width: 768,  height: 432 }, 'md')
const smMedia = resolveMediaCrop(post.cardImage, 'card', { width: 390,  height: 219 }, 'sm')
// → { id: '...', filename: '...', url: '/media/...card.lg....webp', width: 1200, height: 675, ... }
```

#### Standard HTML — `<picture>` srcset

```html
<picture>
  <source media="(min-width: 1024px)" srcset={lgUrl}>
  <source media="(min-width: 640px)"  srcset={mdUrl}>
  <img src={smUrl} alt="Card image">
</picture>
```

#### Next.js `<Image>` with a custom loader

```tsx
import Image from 'next/image'
import { getCropUrl } from 'payload-plugin-image-cropper/utilities'

function cardImageLoader({ width }) {
  if (width <= 390) return getCropUrl(post.cardImage, 'card', 'sm')
  if (width <= 768) return getCropUrl(post.cardImage, 'card', 'md')
  return getCropUrl(post.cardImage, 'card', 'lg')
}

<Image
  loader={cardImageLoader}
  src={getCropUrl(post.cardImage, 'card', 'lg')}
  alt="Card"
  width={1200}
  height={675}
  sizes="(max-width: 390px) 390px, (max-width: 768px) 768px, 1200px"
  priority
/>
```

## Data shape

`cropImageField` stores a group with three sub-fields on the document:

**Single-size crops:**
```ts
{
  heroImage: {
    image: '64abc...',      // relation ID to the media document
    cropData: {
      desktop: { x: 5, y: 10, width: 90, height: 80 },
      mobile:  { x: 20, y: 0, width: 60, height: 100 },
    },
    generatedUrls: {
      desktop: '/media/photo-crop-3f2a9c01d4e5b6a7.webp',
      mobile:  '/media/photo-crop-81d04be29a6c7f35.webp',
    },
  }
}
```

**Multi-size crops** — compound keys `{cropName}.{sizeName}`:
```ts
{
  cardImage: {
    image: '64abc...',
    cropData: {
      card: { x: 0, y: 12, width: 100, height: 75 },
    },
    generatedUrls: {
      'card.lg': '/media/photo-crop-0c9e1f7a2b3d4e56.webp',
      'card.md': '/media/photo-crop-7a45c2e9d18b0f63.webp',
      'card.sm': '/media/photo-crop-e2b8f14c6d09a735.webp',
    },
  }
}
```

## Admin UI imports

The crop field component is a client component. If your Payload project customizes the admin bundle, import it from the `/client` export path:

```ts
import { CropImageField } from 'payload-plugin-image-cropper/client'
```

## How it works

1. The editor selects or uploads a media file in the field.
2. They open the crop modal and define a crop region for each preset. If a preset hasn't been
   cropped yet, the initial selection is centered on the image's focal point (from Payload's
   native `focalPoint` upload option) instead of the plain geometric center — so focal point
   remains the default positioning signal, and the manual crop is an optional per-breakpoint
   override. When the media has no focal point set, this falls back to dead-center, matching
   prior versions of the plugin.
3. The focal point itself is set in the same modal, by dragging the marker on any crop tab (or
   via the X/Y inputs in the footer), and is saved to the media doc's `focalX`/`focalY` — the
   same fields Payload's own image editor writes, so the stored value stays in sync between
   both UIs. The point can never sit outside the active crop: dragging it stops at the box edge,
   and moving the box away from it drops it back to the box centre. Set `focalPoint: false` on
   the field to hide it entirely.

   > **Note:** writing `focalX`/`focalY` this way does *not* re-crop Payload's own
   > `upload.imageSizes`. Payload only re-derives those when a file is present in the request
   > (its admin image editor sends one); a plain field update is stored as-is. If you rely on
   > focal-point-cropped `imageSizes`, re-save the media doc in Payload's own editor, or read
   > the point at render time with
   > [`getFocalPosition`](#combining-manual-crops-with-focal-point) instead — which is what
   > `resolveMediaCrop` does for you.
4. On save, the field calls the `/api/{mediaCollectionSlug}/generate-crop` endpoint once per size (multi-size crops fan out automatically).
5. The endpoint uses Sharp to extract, resize, and encode each crop region to the configured format.
6. Generated files are written to the media collection's `staticDir` on disk (or handed to `onCropGenerated` for cloud upload).
7. The public URLs are stored in `generatedUrls` under their key (or compound key for multi-size).
8. When the source media document is deleted, all associated crop files are removed automatically.

> **Note:** for a preset an editor has never opened/saved, `getCropUrl` still falls back to the
> plain original `image.url` (unchanged from prior versions) — the focal-point default described
> above only applies to the crop modal's *initial* selection, not to the raw URL. `resolveMediaCrop`
> goes one step further and also returns `objectPosition` for that fallback case, so frontend code
> can combine the original image with the focal point via `object-fit: cover` — see
> [Combining manual crops with focal point](#combining-manual-crops-with-focal-point).

## License

MIT
