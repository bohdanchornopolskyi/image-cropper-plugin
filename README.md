# payload-image-cropper

A [Payload CMS 3.x](https://payloadcms.com) plugin that adds interactive image cropping to your collections. Define crop presets per field, let editors crop images in an intuitive modal, and automatically generate optimized image variants via Sharp — all stored and ready to use in your frontend.

## Features

- **Interactive crop modal** — powered by `react-image-crop` with aspect ratio constraints
- **Multiple crop presets per field** — desktop, mobile, social, etc., each with its own dimensions and format
- **Server-side image generation** — Sharp processes crops on save; supports `webp`, `jpeg`, and `png`
- **Automatic cleanup** — crop files are deleted when the source media is removed
- **Frontend utilities** — `getCropUrl` and `resolveMediaCrop` helpers for templates
- **TypeScript-first** — full types exported for all config and values

## Requirements

- Payload `^3.80.0`
- React `^18.0.0` or `^19.0.0`
- Sharp `^0.33.0` (peer dependency — install separately)

## Installation

```bash
npm install payload-image-cropper
# or
pnpm add payload-image-cropper
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

#### S3 (and other cloud storage)

The plugin generates crop files using Sharp, which reads and writes to the **local filesystem**. When using cloud storage (S3, GCS, Azure Blob, etc.) with `disableLocalStorage: true`, the source files are not present on disk, so the plugin cannot process them.

**To use this plugin with S3:**

1. Keep local storage enabled alongside S3 so files remain on disk for Sharp to read:

```ts
import { s3Storage } from '@payloadcms/storage-s3'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      upload: {
        staticDir: 'public/media',          // files stay on disk
        staticURL: '/media',
      },
      fields: [],
    },
  ],
  plugins: [
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET,
      config: {
        region: process.env.S3_REGION,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      },
      disableLocalStorage: false,           // keep files on disk
    }),
    cropImagePlugin({
      mediaCollectionSlug: 'media',
      mediaDir: path.join(process.cwd(), 'public/media'),
    }),
  ],
})
```

2. The generated crop files will be written to `mediaDir` on disk. They will **not** be automatically uploaded to S3 — they are served from local disk via `staticURL`.

> **Note:** If you require crop files to also live in S3, you would need to upload them in a post-hook or via a custom handler. Full S3-native support (download → process → upload) is not yet built into this plugin.

### 2. Add `cropImageField` to a collection

```ts
import { cropImageField } from 'payload-image-cropper'

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
          format: 'webp',
          quality: 85,
        },
      ],
    }),
  ],
}
```

## Configuration Reference

### Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `mediaCollectionSlug` | `string` | `'media'` | Slug of the collection that stores media uploads |
| `mediaDir` | `string` | `process.cwd() + '/public/media'` | Absolute path to the media storage directory |

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

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | **Required.** Unique machine-readable key (e.g. `'desktop'`) |
| `label` | `string` | — | **Required.** Human-readable tab label in the crop modal |
| `width` | `number` | — | **Required.** Output image width in pixels |
| `height` | `number` | — | **Required.** Output image height in pixels |
| `aspectRatio` | `number` | — | Constrain the crop selection (e.g. `16 / 9`) |
| `format` | `'webp' \| 'jpeg' \| 'png'` | `'webp'` | Output image format |
| `quality` | `number` | `80` | Sharp quality setting (1–100, ignored for PNG) |

## Using crops in your frontend

```ts
import { getCropUrl, resolveMediaCrop } from 'payload-image-cropper/utilities'

// Get the URL for a specific crop variant
const url = getCropUrl(post.heroImage, 'desktop')
// → '/media/my-photo-crop-desktop-5-10-90x80-1920x1080.webp'

// Get the full media object with the crop URL injected as `url`
const media = resolveMediaCrop(post.heroImage, 'mobile')
// → { id: '...', filename: '...', url: '/media/...mobile....webp', ... }
```

Both helpers are safe to call with `null` or `undefined` — they return `null` in that case.

## Data shape

`cropImageField` stores a group with three sub-fields on the document:

```ts
{
  heroImage: {
    image: '64abc...',          // Relation ID to the media document
    cropData: {                 // Crop coordinates (percent-based, 0–100)
      desktop: { x: 5, y: 10, width: 90, height: 80 },
      mobile:  { x: 20, y: 0, width: 60, height: 100 },
    },
    generatedUrls: {            // Public URLs of the generated crop files
      desktop: '/media/photo-crop-desktop-5-10-90x80-1920x1080.webp',
      mobile:  '/media/photo-crop-mobile-20-0-60x100-828x1035.webp',
    },
  }
}
```

## Admin UI imports

The crop field component is a client component. If your Payload project customizes the admin bundle, import it from the `/client` export path:

```ts
import { CropImageField } from 'payload-image-cropper/client'
```

## How it works

1. The editor selects or uploads a media file in the field.
2. They open the crop modal and define a crop region for each preset.
3. On save, the field calls the `/api/{mediaCollectionSlug}/generate-crop` endpoint.
4. The endpoint uses Sharp to extract, resize, and encode each crop region to the configured format.
5. Generated files are written to `mediaDir` alongside the original.
6. The public URLs are stored in `generatedUrls` and returned immediately for use.
7. When the source media document is deleted, all associated crop files are removed automatically.

## License

MIT
