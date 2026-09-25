# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-09-25

### Added

- **`getCropSrcSet(value, cropDefinition)`** returns a `srcset` string with one `url widthw`
  entry per generated size, largest first, skipping sizes that have no file yet. It takes the
  crop definition because that is where the pixel widths live. ([#17](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/17))
- **`requireAllCrops` field option** blocks saving while an image is selected but any crop has
  no coordinates, and the error names the missing crops. Off by default. ([#20](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/20))
- **`regenerateCrops({ payload, collection, field })`** renders the stored crops of every
  document again from their coordinates, for example after a crop definition gains a size or
  changes format. It runs in batches and reports how many documents were regenerated, skipped
  and failed. ([#21](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/21))
- **Crop modal keyboard access and tab status.** ([#19](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/19))
  - Both modals are real dialogs: Escape closes them, Tab can't reach the page behind them, and
    focus returns to the button that opened them.
  - Each crop tab shows whether its crop is set.
  - **Reset to focal point** centres the active crop on the focal point, within the preset's
    aspect ratio and minimum size.

## [0.2.0] - 2026-09-25

### Breaking

- **The `generate-crop` endpoint is removed.** `POST /api/{mediaCollectionSlug}/generate-crop`
  no longer exists. Crops are generated on the server when the document saves. Anything that
  called the endpoint directly has to set `cropData` on the document instead. ([#15](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/15))
- **Saves can fail on a crop error.** A crop that cannot be rendered, for example because the
  source file is missing or S3 rejects the upload, now fails the save with an error on the field.
  Before, the crop was dropped in the browser without telling anyone. ([#15](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/15))
- **Crop coordinates are validated.** Coordinates outside the image, or a box with no area, are
  rejected with a validation error on the field. ([#15](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/15))

### Changed

- **Crops render when the document saves.** The crop modal's **Apply** button only records the
  coordinates, so a re-crop the editor never saves leaves the published crops untouched. Output
  size, format and quality come only from the crop definitions in the config, never from the
  request. Crops are rendered again only when their coordinates or the source image change.
  ([#15](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/15))
- **The preview grid** shows a crop as not yet generated between **Apply** and the document save.

### Added

- **Local API support.** Seeds, scripts and migrations that create or update documents with
  `cropData` now get crops, with no admin UI involved. ([#15](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/15))

## [0.1.8] - 2026-09-25

### Changed

- **`mediaDir` defaults to the collection's `staticDir`**: the plugin reads and writes crops in
  the media collection's `upload.staticDir`, resolved against the working directory the same way
  Payload resolves it. You no longer have to repeat the path in `mediaDir`. An explicit
  `mediaDir` still wins. ([#13](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/13))
- **Content-hashed crop filenames**: a crop's filename is now the source name plus a hash of
  the source file, crop coordinates, output size, format and quality, for example
  `photo-crop-3f2a9c01d4e5b6a7.webp`. Existing crops keep their URLs until they are re-cropped.
  ([#14](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/14))

### Fixed

- **Crops deleted across documents**: generating a crop no longer deletes other crop files. Two
  documents that crop the same media keep their own files, and a `hero` crop no longer removes
  `hero-mobile` files. A crop replaced by a re-crop stays on disk or in the bucket until its
  source media is deleted. ([#14](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/14))
- **Stale crops**: changing only the quality or format, or moving a crop by less than 1%, now
  writes a new file instead of returning the old one. ([#14](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/14))

### Internal

- Local disk, S3 and `onCropGenerated` share one storage adapter interface. When
  `onCropGenerated` returns no URL, the fallback write to disk now behaves exactly like the
  local adapter. ([#12](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/12))

## [0.1.7] - 2026-09-25

### Fixed

- **Custom API routes**: the field built its crop endpoint from a hardcoded `/api`, so projects
  with a custom `routes.api` could not generate crops. It now uses the configured route.
  ([#7](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/7))
- **EXIF-rotated images**: phone photos stored with an orientation tag were cropped in the
  wrong region. Sources are now auto-oriented before extraction, and the crop maths uses the
  oriented dimensions. A source file Sharp cannot read returns a 422 instead of a 500.
  ([#8](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/8))
- **Required fields and validation errors**: `required: true` now shows the `*` marker and
  blocks the save with Payload's field error on the crop field, instead of failing without
  pointing at it. ([#9](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/9))
- **S3 cleanup past 1000 crops**: deleting crops now pages through the whole bucket listing
  instead of stopping at the first 1000 objects. Each plugin instance also gets its own S3
  client, so a second instance no longer uploads with the first one's bucket credentials.
  ([#10](https://github.com/bohdanchornopolskyi/image-cropper-plugin/issues/10))

## [0.1.6] - 2026-09-14

### Added

- **`cacheControl` option on `S3CropConfig`** — sets the `Cache-Control` header written on
  every crop upload. Defaults to `public, max-age=31536000, immutable`. Crop filenames encode
  the crop region and the output size, so changing a crop always writes a new key; the old URL
  is never reused for different bytes, which makes a one-year immutable cache safe. Pass your
  own string to override.

### Fixed

- **Subpath types under `moduleResolution: node`** — `payload-plugin-image-cropper/client` and
  `/utilities` resolved to `any` for consumers on the legacy resolver. Added `typesVersions`
  and moved the `types` condition to the front of each export map, where TypeScript looks for
  it.

## [0.1.5] - 2026-08-06

### Added

- **Focal point support** — the crop modal now shows a draggable focal-point marker (plus X/Y
  number inputs for keyboard use), saved to the media document's `focalX`/`focalY`. These are
  the same fields Payload's own image editor writes, so the stored point is shared between both
  UIs. The marker can never leave the active crop: dragging clamps it to the box edge, and
  moving or resizing the box away from it drops it back to the box centre.
- **`focalPoint` field option** (`boolean`, defaults to `true`) — set to `false` for fields
  where subject position is irrelevant (logos, flat graphics). The marker is hidden and the
  media document is never written to.
- **Focal-point-aware crop seeding** — for a preset that hasn't been cropped yet, the modal's
  initial selection is centred on the media's focal point instead of the plain geometric
  centre, so the focal point stays the default positioning signal and a manual crop is an
  optional per-breakpoint override. Falls back to dead-centre when no point is set, matching
  prior versions. A stored crop that no longer contains the focal point is re-derived from the
  point rather than honoured.
- **`getFocalPosition(media)`** — returns the media's focal point as a CSS `object-position`
  string (e.g. `'62% 30%'`), or `undefined` when none is set.
- **`resolveMediaCrop` now returns `objectPosition`** when it falls back to the uncropped
  original, so `object-fit: cover` frames the same subject a manual crop would have targeted.
  Omitted once a crop is saved — the baked file is already framed.

### Fixed

- **`getFocalPosition` was missing from the `/utilities` export** — the README documented
  importing it from `payload-plugin-image-cropper/utilities`, but it was never re-exported.
- **Focal-point save no longer blocks crop generation** — the `focalX`/`focalY` write is
  started in parallel and joined afterwards. The generate-crop endpoint only reads the source
  file, so it never needed to queue behind that write.

### Notes

- Writing `focalX`/`focalY` does **not** re-crop Payload's own `upload.imageSizes`. Payload
  re-derives those only when a file is present in the request (its admin image editor sends
  one); a plain field update is stored as-is. Read the point at render time with
  `getFocalPosition` — or let `resolveMediaCrop` do it — if you need focal-point framing.

---

## [0.1.4] - 2026-08-03

### Added

- **`filterOptions`** — restrict which media documents can be selected in the picker drawer,
  matching the semantics of the `filterOptions` option on Payload's native `upload` field.
  Accepts a static `Where` object or a function of `{ data, siblingData, user, req }`. The
  resolved filter is applied to the picker drawer, and the inner `image` upload field enforces
  it server-side on save.

  ```ts
  cropImageField({
    name: 'fallbackImage',
    filterOptions: { mimeType: { contains: 'image' } },
    crops: [/* ... */],
  })
  ```

  Note: the "create new" drawer does not filter; server-side validation is the backstop.

### Changed

- **`admin.description` now accepts a locale map** — the field description type was widened from
  `string` to Payload's `StaticDescription` (`string | Record<string, string>`), and the
  description is now actually rendered in the admin panel (via Payload's `FieldDescription`
  component), which the custom field component previously dropped.

  ```ts
  cropImageField({
    name: 'heroImage',
    admin: { description: { en: 'MP4 and WebM are supported.', de: 'MP4 und WebM werden unterstützt.' } },
    crops: [/* ... */],
  })
  ```

  Plain strings continue to work with no changes required. Description functions/components are
  not supported.

- **`StaticDescription`** type re-exported from the main entry point.

Both changes are additive and backward-compatible.

---

## [0.1.3] - 2026-06-23

### Fixed

- **`payload` peer dependency** — widened the range from `^3.80.0` to `>=3.0.0` so the plugin
  uses the host project's installed Payload version instead of pulling in a separate copy.
  This fixes TypeScript errors like `Plugin` is not assignable when the host runs an older
  Payload 3.x release (e.g. 3.72.0 vs 3.85.0).

### Added

- **Plugin UI translations** — built-in English and German strings for crop modal, preview
  modal, and field chrome. The plugin registers its translation namespace via `i18n` in
  `cropImagePlugin`, so labels switch when the admin user changes the UI language.

---

## [0.1.2] - 2026-06-05

### Added

- **Localized labels** — `CropDefinition.label`, `SizeDefinition.label`, and
  `CropImageFieldConfig.label` now accept Payload's `StaticLabel` type (`string` or
  `Record<string, string>`), so field and crop names can be translated per locale.

  ```ts
  cropField({
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
    ],
  })
  ```

- **`resolveLabel(label, lang)`** utility exported from `payload-plugin-image-cropper/utilities`.
- **`StaticLabel`** type re-exported from the main entry point.

Plain strings continue to work with no changes required.

---

## [0.1.1] - 2026-05-29

### Fixed

- **Layout shift in the crop field UI** ([#1]). The filled field now renders as a single
  fixed-height row matching Payload's native upload field, so adding an image, generating
  crops, or removing the image no longer pushes the rest of the page up or down. Previously
  the inline crop-size previews only appeared after crops were generated, which changed the
  field's height and shifted surrounding content.

### Changed

- Generated crop/size previews moved out of the inline row into a dedicated, read-only
  **"Crops & Sizes"** modal, opened from a new preview button on the field. This keeps the
  field compact while giving a larger, clearer view of every generated size and its
  dimensions.

---

## [0.1.0] - 2026-05-08

### Added

- **`createCropImage(pluginConfig)`** — a paired factory that returns a `{ plugin, field }` pair
  guaranteed to target the same media collection. The returned `field` factory omits
  `mediaCollectionSlug` from its parameter type, making slug divergence a compile-time error
  rather than a silent runtime 404. This is now the recommended way to set up the plugin when
  using a non-default collection slug.

  ```ts
  // Before
  plugins: [cropImagePlugin({ mediaCollectionSlug: 'files', ... })]
  fields:  [cropImageField({ mediaCollectionSlug: 'files', name: 'hero', crops: [...] })]

  // After — slug is set once and shared automatically
  const { plugin, field } = createCropImage({ mediaCollectionSlug: 'files', ... })
  plugins: [plugin]
  fields:  [field({ name: 'hero', crops: [...] })]
  ```

- **Minimum crop size enforcement** — the crop UI now constrains the minimum selection area
  based on the configured output dimensions and aspect ratio. This prevents the plugin from
  generating upscaled, low-quality images when the user selects a very small region.

### Internal

- Crop request construction logic extracted into a pure `buildCropRequests` function, separating
  side-effect-free logic from the UI event handler and making it independently unit-testable.

---

## [0.0.9] - 2025-04-XX

### Added

- First-class S3 option on `cropImagePlugin` — pass `s3: { ... }` directly to the plugin
  config instead of wiring up a separate storage adapter for cropped images.

---

## [0.0.8] and earlier

See git history.
