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
import path from 'path'
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
      mediaCollectionSlug: 'media',                        // default: 'media'
      mediaDir: path.join(process.cwd(), 'public/media'),  // must match staticDir
    }),
  ],
})
```

> **Important:** `mediaDir` must be an **absolute path** pointing to the same directory as the media collection's `staticDir`. Always use `process.cwd()` rather than `__dirname` / `import.meta.url` — Payload resolves `staticDir` relative to the working directory, not the config file location.

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
      mediaDir: path.join(process.cwd(), 'public/media'),
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

> `mediaDir` is still needed to read the source image. If you use `disableLocalStorage: true`, the source file is fetched from its URL automatically and `mediaDir` is unused.

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
| `mediaDir` | `string` | `process.cwd() + '/public/media'` | Absolute path to the media storage directory |
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
| `prefix` | `string` | Key prefix inside the bucket. Mirrors `prefix` in `s3Storage` collection config. |

### `cropImageField` options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Field name in the document |
| `crops` | `CropDefinition[]` | — | **Required.** Array of crop presets |
| `label` | `string` | — | Display label in the admin panel |
| `required` | `boolean` | `false` | Whether a selection is required |
| `mediaCollectionSlug` | `string` | `'media'` | Override the media collection slug for this field |
| `admin.condition` | `function` | — | Conditionally show this field |
| `admin.description` | `string` | — | Help text shown below the field |

### `CropDefinition`

A crop preset is either a **single-size** variant (specify `width` + `height`) or a **multi-size** variant (specify `sizes`). The two forms are mutually exclusive.

**Single-size**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Unique machine-readable key (e.g. `'desktop'`) |
| `label` | `string` | — | **Required.** Human-readable tab label in the crop modal |
| `width` | `number` | — | **Required.** Output image width in pixels |
| `height` | `number` | — | **Required.** Output image height in pixels |
| `aspectRatio` | `number` | — | Constrain the crop selection (e.g. `16 / 9`) |
| `format` | `'webp' \| 'jpeg' \| 'png'` | `'webp'` | Output image format |
| `quality` | `number` | `80` | Sharp quality (1–100, ignored for PNG) |

**Multi-size** (use `sizes` instead of `width` / `height`)

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Unique machine-readable key (e.g. `'card'`) |
| `label` | `string` | — | **Required.** Human-readable tab label in the crop modal |
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
| `label` | `string` | Human-readable label shown in the admin UI |

## Using crops in your frontend

### Single-size crops

```ts
import { getCropUrl, resolveMediaCrop } from 'payload-plugin-image-cropper/utilities'

// URL for a named crop
const url = getCropUrl(post.heroImage, 'desktop')
// → '/media/my-photo-crop-desktop-5-10-90x80-1920x1080.webp'

// Full media object with the crop URL injected as `url`
const media = resolveMediaCrop(post.heroImage, 'mobile')
// → { id: '...', filename: '...', url: '/media/...mobile....webp', ... }
```

Both helpers are safe to call with `null` or `undefined` — they return `''` / `null` respectively. When no generated crop exists yet, `getCropUrl` falls back to the original `image.url` so the field degrades gracefully before an editor has cropped the image.

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
      desktop: '/media/photo-crop-desktop-5-10-90x80-1920x1080.webp',
      mobile:  '/media/photo-crop-mobile-20-0-60x100-828x1035.webp',
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
      'card.lg': '/media/photo-crop-card-0-12-100x75-1200x675.webp',
      'card.md': '/media/photo-crop-card-0-12-100x75-768x432.webp',
      'card.sm': '/media/photo-crop-card-0-12-100x75-390x219.webp',
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
2. They open the crop modal and define a crop region for each preset.
3. On save, the field calls the `/api/{mediaCollectionSlug}/generate-crop` endpoint once per size (multi-size crops fan out automatically).
4. The endpoint uses Sharp to extract, resize, and encode each crop region to the configured format.
5. Generated files are written to `mediaDir` on disk (or handed to `onCropGenerated` for cloud upload).
6. The public URLs are stored in `generatedUrls` under their key (or compound key for multi-size).
7. When the source media document is deleted, all associated crop files are removed automatically.

## License

MIT
