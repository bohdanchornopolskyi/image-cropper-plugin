import type { FilterOptions, StaticDescription, StaticLabel } from 'payload'

export type { StaticDescription, StaticLabel }

/** Output image format for Sharp processing */
export type ImageFormat = 'jpeg' | 'png' | 'webp'

/** A single output size within a multi-size crop definition */
export type SizeDefinition = {
  /** Output image height in pixels */
  height: number
  /** Human-readable label shown in preview cards. Defaults to `name`. */
  label?: StaticLabel
  /** Machine-readable size name. Stored as `cropName.sizeName` in generatedUrls. */
  name: string
  /** Output image width in pixels */
  width: number
}

export type CropDefinition = {
  /**
   * Desired output aspect ratio as width/height (e.g. 16/9).
   * When set, the crop handle is constrained to this ratio.
   */
  aspectRatio?: number
  /** Output format. Defaults to 'webp'. */
  format?: ImageFormat
  /** Human-readable label shown in the crop modal tabs */
  label: StaticLabel
  /** Machine-readable slot name, used as the key in cropData and generatedUrls */
  name: string
  /** Sharp quality, 1–100. Defaults to 80. Ignored for PNG. */
  quality?: number
} & (
  | {
      /** Output image height in pixels */
      height: number
      sizes?: never
      /** Output image width in pixels */
      width: number
    }
  | {
      height?: never
      /**
       * Multiple output sizes generated from one crop region.
       * Stored as compound keys (`cropName.sizeName`) in generatedUrls.
       * When set, top-level `width` and `height` are not used.
       */
      sizes: SizeDefinition[]
      width?: never
    }
)

/** Percent-based crop rectangle as produced by react-image-crop */
export type CropCoords = {
  /** 0–100 (percent of image height) */
  height: number
  /** 0–100 (percent of image width) */
  width: number
  /** 0–100 (percent from left) */
  x: number
  /** 0–100 (percent from top) */
  y: number
}

/** Map of cropName → percent crop coordinates */
export type CropData = Record<string, CropCoords>

/** Map of cropName → public URL of the generated crop file */
export type GeneratedUrls = Record<string, string>

/**
 * The shape of the group field value as it arrives from the Payload API.
 * Sub-fields are typed loosely because the depth of the `image` relation
 * varies depending on the query depth used by the caller.
 */
export type CropImageValue = {
  cropData?: unknown
  generatedUrls?: unknown
  image?: unknown
}

/**
 * Context passed to the `onCropGenerated` callback after a crop file is
 * processed by Sharp and ready to be stored.
 */
export type OnCropGeneratedContext = {
  /** Raw output bytes — upload this to your cloud storage bucket. */
  buffer: Buffer
  /** Compound key that will be stored in generatedUrls (e.g. `"card.desktop"`). */
  cropName: string
  /** Output filename: the source name plus a hash of the crop's inputs (e.g. `"photo-crop-3f2a9c01d4e5b6a7.webp"`). */
  filename: string
  /** Output format chosen for this crop. */
  format: ImageFormat
  /** ID of the source media document. */
  mediaId: number | string
}

/** Internal storage adapter that writes and removes crop files: local disk, S3 or `onCropGenerated`. */
export type CropStorage = {
  deleteCropsByBase: (filenameBase: string) => Promise<void>
  upload: (ctx: OnCropGeneratedContext) => Promise<{ url: string }>
}

/**
 * S3 / S3-compatible storage configuration for crop files.
 * Mirrors the shape of `@payloadcms/storage-s3` so you can reuse the same
 * values — no AWS SDK imports needed in your config.
 */
export type S3CropConfig = {
  /** Object ACL. Typically `'public-read'` for publicly-served crops. */
  acl?:
    | 'authenticated-read'
    | 'aws-exec-read'
    | 'bucket-owner-full-control'
    | 'bucket-owner-read'
    | 'private'
    | 'public-read'
    | 'public-read-write'
  /** S3 bucket name. */
  bucket: string
  /**
   * `Cache-Control` header written on every crop file. Crop filenames are a hash of the
   * source file and every crop setting, so a re-crop is always a new key and can be cached forever.
   *
   * @default 'public, max-age=31536000, immutable'
   */
  cacheControl?: string
  /** S3 client configuration — same object you pass to `@payloadcms/storage-s3`. */
  config: {
    credentials?: {
      accessKeyId: string
      secretAccessKey: string
    }
    /** Custom endpoint for S3-compatible providers (DigitalOcean Spaces, MinIO, etc.). */
    endpoint?: string
    forcePathStyle?: boolean
    region: string
  }
  /**
   * Build the public URL for a crop file.
   * Receives the same `filename` and `prefix` values passed to the plugin so
   * you can reuse the same `generateFileURL` function from `s3Storage`:
   *
   * ```ts
   * generateUrl: ({ filename, prefix }) => {
   *   const parts = [process.env.CDN_ENDPOINT, prefix, filename].filter(Boolean)
   *   return parts.join('/')
   * }
   * ```
   */
  generateUrl: (args: { filename: string; prefix?: string }) => string
  /**
   * Key prefix inside the bucket (e.g. `'crops'` → key becomes `crops/filename`).
   * Mirrors the `prefix` option in `@payloadcms/storage-s3` collection config.
   */
  prefix?: string
}

export type CropImagePluginConfig = {
  /**
   * Slug of the collection that stores media documents and serves as the
   * upload target for crop fields. Defaults to 'media'.
   */
  mediaCollectionSlug?: string
  /**
   * Directory where source images are read from and crop files are written to.
   * Relative paths resolve against `process.cwd()`.
   * Defaults to the media collection's `upload.staticDir`.
   */
  mediaDir?: string
  /**
   * Called after each crop is generated, before the URL is stored.
   *
   * Return `{ url }` to override the stored URL and skip the local disk write.
   * Return nothing to fall back to the default local-disk write.
   *
   * @deprecated Prefer the `s3` option for S3/S3-compatible storage.
   */
  onCropGenerated?: (
    ctx: OnCropGeneratedContext,
  ) => { url: string } | Promise<{ url: string } | void> | void
  /**
   * S3 / S3-compatible storage for generated crop files.
   *
   * When set, crops are uploaded to the bucket (via `PutObject`) instead of
   * local disk, and are cleaned up automatically (via `ListObjects` +
   * `DeleteObject`) when the source media document is deleted.
   *
   * The config shape mirrors `@payloadcms/storage-s3` so you can reuse the
   * same values without any additional imports.
   */
  s3?: S3CropConfig
}

export type CropImageFieldConfig = {
  admin?: {
    condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean
    description?: StaticDescription
  }
  crops: CropDefinition[]
  /**
   * Restrict which media documents can be selected in the picker drawer.
   * Same semantics as the `filterOptions` option on Payload's `upload` field —
   * accepts a static `Where` object or a function of `{ data, siblingData, user, req }`.
   * Note: the "create new" drawer does not filter; server-side validation is the backstop.
   */
  filterOptions?: FilterOptions
  /**
   * Show a draggable focal-point marker inside the crop modal, saved to the media
   * doc's `focalX`/`focalY`. Set to `false` for fields where the subject position
   * is irrelevant (logos, flat graphics). Defaults to `true`.
   */
  focalPoint?: boolean
  label?: StaticLabel
  /** Override if your media collection uses a non-default slug. Defaults to 'media'. */
  mediaCollectionSlug?: string
  name: string
  required?: boolean
}
