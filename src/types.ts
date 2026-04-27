/** Output image format for Sharp processing */
export type ImageFormat = 'jpeg' | 'png' | 'webp'

/** A single output size within a multi-size crop definition */
export type SizeDefinition = {
  /** Output image height in pixels */
  height: number
  /** Human-readable label shown in preview cards. Defaults to `name`. */
  label?: string
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
  label: string
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
  /** Suggested output filename (e.g. `"photo-crop-card.desktop-5-5-90x90-1200x675.webp"`). */
  filename: string
  /** Output format chosen for this crop. */
  format: ImageFormat
  /** ID of the source media document. */
  mediaId: number | string
}

export type CropImagePluginConfig = {
  /**
   * Slug of the collection that stores media documents and serves as the
   * upload target for crop fields. Defaults to 'media'.
   */
  mediaCollectionSlug?: string
  /**
   * Absolute path to the directory where source and crop files are stored.
   * Must match the `staticDir` set on the upload collection.
   * Defaults to `path.join(process.cwd(), 'public/media')`.
   */
  mediaDir?: string
  /**
   * Called after each crop is generated, before the URL is stored.
   *
   * Return `{ url }` to override the stored URL (e.g. with an S3 CDN URL)
   * **and** skip the local disk write — your callback owns storage.
   * Return nothing (or `undefined`) to fall back to the default local-disk write.
   *
   * This is the integration point for S3 / GCS / Azure Blob:
   * upload `buffer` to your bucket, return the public CDN URL.
   */
  onCropGenerated?: (
    ctx: OnCropGeneratedContext,
  ) => Promise<{ url: string } | void> | { url: string } | void
}

export type CropImageFieldConfig = {
  admin?: {
    condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean
    description?: string
  }
  crops: CropDefinition[]
  label?: string
  /** Override if your media collection uses a non-default slug. Defaults to 'media'. */
  mediaCollectionSlug?: string
  name: string
  required?: boolean
}
