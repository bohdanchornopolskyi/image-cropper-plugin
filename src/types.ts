/** Output image format for Sharp processing */
export type ImageFormat = 'webp' | 'jpeg' | 'png'

export type CropDefinition = {
  /** Machine-readable slot name, used as the key in cropData and generatedUrls */
  name: string
  /** Human-readable label shown in the crop modal tabs */
  label: string
  /**
   * Desired output aspect ratio as width/height (e.g. 16/9).
   * When set, the crop handle is constrained to this ratio.
   */
  aspectRatio?: number
  /** Output image width in pixels */
  width: number
  /** Output image height in pixels */
  height: number
  /** Sharp quality, 1–100. Defaults to 80. Ignored for PNG. */
  quality?: number
  /** Output format. Defaults to 'webp'. */
  format?: ImageFormat
}

/** Percent-based crop rectangle as produced by react-image-crop */
export type CropCoords = {
  /** 0–100 (percent from left) */
  x: number
  /** 0–100 (percent from top) */
  y: number
  /** 0–100 (percent of image width) */
  width: number
  /** 0–100 (percent of image height) */
  height: number
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
  image?: unknown
  cropData?: unknown
  generatedUrls?: unknown
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
}

export type CropImageFieldConfig = {
  name: string
  label?: string
  required?: boolean
  crops: CropDefinition[]
  admin?: {
    condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean
    description?: string
  }
  /** Override if your media collection uses a non-default slug. Defaults to 'media'. */
  mediaCollectionSlug?: string
}
