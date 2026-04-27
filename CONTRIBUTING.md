# Contributing

Thank you for considering a contribution to `payload-plugin-image-cropper`! This document explains how to get the project running locally and how to submit changes.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Project structure](#project-structure)
- [Submitting changes](#submitting-changes)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)

---

## Code of conduct

Be respectful and constructive. Harassment or abusive language in any form will not be tolerated.

---

## Getting started

### Prerequisites

- Node.js `^18.20.2` or `>=20.9.0`
- pnpm `^9` or `^10`

### Install dependencies

```bash
pnpm install
```

### Start the dev environment

The `dev/` directory contains a Payload project that exercises the plugin. It starts an in-memory MongoDB replica set automatically, so no external database is required.

```bash
pnpm dev
```

Then open [http://localhost:3000/admin](http://localhost:3000/admin) to use the admin panel, and [http://localhost:3000/demo](http://localhost:3000/demo) to see the multi-size crop demo page.

The seed creates a default admin user on first start:

| Field | Value |
|---|---|
| Email | `dev@payloadcms.com` |
| Password | `test` |

---

## Development workflow

The plugin source lives in `src/`. Changes there are picked up by the dev server directly (no manual build step needed in development).

### Build

```bash
pnpm build
```

This runs three steps: type declarations via `tsc`, JavaScript via SWC, and static file copying. Output goes to `dist/`.

### Tests

```bash
pnpm test:int   # Vitest integration tests
pnpm test:e2e   # Playwright end-to-end tests
```

### Lint

```bash
pnpm lint
pnpm lint:fix
```

---

## Project structure

```
src/
  index.ts          # Plugin entry — cropImagePlugin() and cropImageField()
  handler.ts        # /generate-crop endpoint handler (Sharp processing)
  hook.ts           # afterDelete hook — removes orphaned crop files
  types.ts          # All exported TypeScript types
  utilities.ts      # getCropUrl / resolveMediaCrop frontend helpers
  exports/
    client.ts       # /client export — CropImageField React component
    utilities.ts    # /utilities export

dev/                # Local Payload app for manual testing
```

---

## Submitting changes

1. **Fork** the repository and create a branch from `main`:

   ```bash
   git checkout -b fix/my-bug-fix
   ```

2. Make your changes in `src/`. Add or update tests where applicable.

3. Make sure everything passes:

   ```bash
   pnpm lint && pnpm test:int
   ```

4. **Open a pull request** against `main` with a clear title and description. Reference any related issue with `Closes #123`.

### Commit style

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add quality option per size in multi-size crops
fix: delete orphaned crops when filename contains spaces
docs: clarify mediaDir resolution in README
```

---

## Reporting bugs

Use the **Bug report** issue template. Please include:

- Plugin version (`payload-plugin-image-cropper@x.y.z`)
- Payload version
- A minimal reproduction (config snippet + steps to reproduce)
- What you expected vs. what actually happened

---

## Requesting features

Use the **Feature request** issue template. Describe the use case first — we want to understand the problem before jumping to a solution.
