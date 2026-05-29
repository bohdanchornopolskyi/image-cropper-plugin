# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
