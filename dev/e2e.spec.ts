import { expect, type Locator, type Page, test } from '@playwright/test'
import sharp from 'sharp'

import { devUser } from './helpers/credentials.js'

async function uploadMedia(page: Page, prefix: string): Promise<string> {
  const filename = `${prefix}-${Date.now()}.png`
  const upload = await page.request.post('/api/media', {
    multipart: {
      file: {
        name: filename,
        buffer: await sharp({
          create: { background: 'teal', channels: 3, height: 900, width: 1600 },
        })
          .png()
          .toBuffer(),
        mimeType: 'image/png',
      },
    },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  return filename
}

/** Picks an uploaded file from the list drawer; selecting it opens the crop modal. */
async function chooseMedia(page: Page, field: Locator, filename: string) {
  await field.getByRole('button', { name: /choose from existing/i }).click()
  await page.locator('.list-drawer').getByText(filename).click()
}

// ---------------------------------------------------------------------------
// Basic admin sanity
// ---------------------------------------------------------------------------

test.describe('logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('admin panel loads and login succeeds', async ({ page }) => {
    await page.goto('/admin')
    // Retried because a fill before hydration is wiped when React takes over the form.
    await expect(async () => {
      await page.fill('#field-email', devUser.email)
      await page.fill('#field-password', devUser.password)
      await page.click('.form-submit button')
      await expect(page).toHaveTitle(/Dashboard/, { timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
  })
})

test('posts collection is listed in the admin nav', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('#nav-posts')).toBeVisible()
})

// ---------------------------------------------------------------------------
// CropImageField rendering
// ---------------------------------------------------------------------------

test('create-post form renders the crop image field', async ({ page }) => {
  await page.goto('/admin/collections/posts/create')
  await expect(
    page.locator('#field-heroImage').getByRole('button', { name: /choose from existing/i }),
  ).toBeVisible()
})

test('create-post form does not show the crop button before an image is selected', async ({
  page,
}) => {
  await page.goto('/admin/collections/posts/create')
  await expect(page.getByRole('button', { name: /crop/i })).not.toBeVisible()
})

test('create-post form does not show crop previews before an image is selected', async ({
  page,
}) => {
  await page.goto('/admin/collections/posts/create')
  // No thumbnail/preview cards should be rendered yet
  await expect(page.locator('[data-crop-preview]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Full crop workflow
// ---------------------------------------------------------------------------

test('selecting an image opens the crop modal with a tab for each crop preset', async ({
  page,
}) => {
  const filename = await uploadMedia(page, 'tabs')
  await page.goto('/admin/collections/posts/create')
  await chooseMedia(page, page.locator('#field-heroImage'), filename)

  await expect(page.getByRole('heading', { name: /crop image/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desktop', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mobile', exact: true })).toBeVisible()
})

test('crop modal can be closed without saving', async ({ page }) => {
  const filename = await uploadMedia(page, 'cancel')
  await page.goto('/admin/collections/posts/create')
  const field = page.locator('#field-heroImage')
  await chooseMedia(page, field, filename)

  const heading = page.getByRole('heading', { name: /crop image/i })
  await expect(heading).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(heading).toBeHidden()
  await expect(field.getByRole('button', { name: /crop image/i })).toBeVisible()
})

test('applying crops and saving the document generates the crop files', async ({ page }) => {
  const filename = await uploadMedia(page, 'save')
  await page.goto('/admin/collections/pages/create')
  const field = page.locator('#field-coverImage')
  await chooseMedia(page, field, filename)

  await expect(page.locator('.ReactCrop__crop-selection')).toBeVisible()
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page).toHaveURL(/\/admin\/collections\/pages\/(?!create$)[^/]+$/)

  const id = page.url().split('/').pop()
  const doc = (await (await page.request.get(`/api/pages/${id}`)).json()) as {
    coverImage: { cropData: Record<string, unknown>; generatedUrls: Record<string, string> }
  }
  expect(Object.keys(doc.coverImage.cropData)).toEqual(['wide'])
  expect(doc.coverImage.generatedUrls.wide).toMatch(/-crop-[0-9a-f]{16}\.webp$/)

  await field.getByRole('button', { name: /preview crops/i }).click()
  await expect(page.locator(`img[src="${doc.coverImage.generatedUrls.wide}"]`)).toBeVisible()
})

test('a required crop field shows the required marker and a validation error', async ({ page }) => {
  const filename = await uploadMedia(page, 'required')

  await page.goto('/admin/collections/pages/create')

  const field = page.locator('#field-coverImage')
  await expect(field.getByText('*', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /save/i }).click()
  const error = field.locator('.field-error')
  await expect(error).toHaveText(/required/i)

  await chooseMedia(page, field, filename)
  await expect(error).toBeHidden()
})

// ---------------------------------------------------------------------------
// Persistence / save flow
// ---------------------------------------------------------------------------

test('saving a post with no image selected does not error', async ({ page }) => {
  await page.goto('/admin/collections/posts/create')

  await page.getByRole('button', { name: /save/i }).click()

  // Should NOT show a hard error banner — an empty heroImage is optional
  await expect(page.locator('.payload-toast-error')).not.toBeVisible({ timeout: 5_000 })
})

test('post list shows the created post after saving', async ({ page }) => {
  await page.goto('/admin/collections/posts/create')
  await page.getByRole('button', { name: /save/i }).click()

  // Navigate to the posts list
  await page.goto('/admin/collections/posts')
  const rows = page.locator('table tbody tr').or(page.locator('[data-list-item]'))
  await expect(rows.first()).toBeVisible({ timeout: 10_000 })
})
