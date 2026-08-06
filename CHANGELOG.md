# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
