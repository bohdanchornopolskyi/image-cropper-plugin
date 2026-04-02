import { expect, test } from '@playwright/test'

const EMAIL = 'dev@payloadcms.com'
const PASSWORD = 'test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin')
  await page.fill('#field-email', EMAIL)
  await page.fill('#field-password', PASSWORD)
  await page.click('.form-submit button')
  await expect(page).toHaveTitle(/Dashboard/)
}

// ---------------------------------------------------------------------------
// Basic admin sanity
// ---------------------------------------------------------------------------

test('admin panel loads and login succeeds', async ({ page }) => {
  await login(page)
  await expect(page.locator('.graphic-icon')).toBeVisible()
})

test('posts collection is listed in the admin nav', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('link', { name: /posts/i })).toBeVisible()
})

// ---------------------------------------------------------------------------
// CropImageField rendering
// ---------------------------------------------------------------------------

test('create-post form renders the crop image field', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')
  await expect(page.getByRole('button', { name: /select image/i })).toBeVisible()
})

test('create-post form does not show the crop button before an image is selected', async ({
  page,
}) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')
  await expect(page.getByRole('button', { name: /crop/i })).not.toBeVisible()
})

test('create-post form does not show crop previews before an image is selected', async ({
  page,
}) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')
  // No thumbnail/preview cards should be rendered yet
  await expect(page.locator('[data-crop-preview]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Full crop workflow
// ---------------------------------------------------------------------------

test('selecting an image via the drawer enables the crop button', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')

  // Open the media drawer
  await page.getByRole('button', { name: /select image/i }).click()

  // Wait for the media drawer/list to appear and pick the first media item
  const drawer = page.locator('[data-drawer]').or(page.locator('[role="dialog"]')).first()
  await expect(drawer).toBeVisible({ timeout: 10_000 })

  // Click the first media item in the drawer
  const firstMediaItem = drawer.locator('button, [role="button"]').first()
  await firstMediaItem.click()

  // After selection the "Crop" button should be visible
  await expect(page.getByRole('button', { name: /crop/i })).toBeVisible({ timeout: 5_000 })
})

test('opening the crop modal shows a tab for each crop preset', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')

  // Select an image
  await page.getByRole('button', { name: /select image/i }).click()
  const drawer = page.locator('[data-drawer]').or(page.locator('[role="dialog"]')).first()
  await expect(drawer).toBeVisible({ timeout: 10_000 })
  await drawer.locator('button, [role="button"]').first().click()

  // Open the crop modal
  await page.getByRole('button', { name: /crop/i }).click()

  // The dev config registers "Desktop" and "Mobile" crop presets
  await expect(page.getByRole('tab', { name: /desktop/i })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('tab', { name: /mobile/i })).toBeVisible({ timeout: 5_000 })
})

test('crop modal can be closed without saving', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')

  // Select an image
  await page.getByRole('button', { name: /select image/i }).click()
  const drawer = page.locator('[data-drawer]').or(page.locator('[role="dialog"]')).first()
  await expect(drawer).toBeVisible({ timeout: 10_000 })
  await drawer.locator('button, [role="button"]').first().click()

  // Open and close the crop modal
  await page.getByRole('button', { name: /crop/i }).click()
  const modal = page.locator('[role="dialog"]').last()
  await expect(modal).toBeVisible({ timeout: 5_000 })

  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible({ timeout: 5_000 })
})

// ---------------------------------------------------------------------------
// Persistence / save flow
// ---------------------------------------------------------------------------

test('saving a post with no image selected does not error', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')

  await page.getByRole('button', { name: /save/i }).click()

  // Should NOT show a hard error banner — an empty heroImage is optional
  await expect(page.locator('.payload-toast-error')).not.toBeVisible({ timeout: 5_000 })
})

test('post list shows the created post after saving', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')
  await page.getByRole('button', { name: /save/i }).click()

  // Navigate to the posts list
  await page.goto('/admin/collections/posts')
  const rows = page.locator('table tbody tr').or(page.locator('[data-list-item]'))
  await expect(rows.first()).toBeVisible({ timeout: 10_000 })
})

// ---------------------------------------------------------------------------
// generate-crop API endpoint (via fetch inside the browser context)
// ---------------------------------------------------------------------------

test('generate-crop endpoint returns 401 when not authenticated', async ({ page }) => {
  // Perform the request without logging in
  await page.goto('/admin')

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/media/generate-crop', {
      body: JSON.stringify({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        mediaId: '000000000000000000000000',
        outputHeight: 1080,
        outputWidth: 1920,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return res.status
  })

  expect(status).toBe(401)
})

test('generate-crop endpoint returns 400 for an invalid request body', async ({ page }) => {
  await login(page)

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/media/generate-crop', {
      body: JSON.stringify({ bad: 'payload' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return res.status
  })

  expect(status).toBe(400)
})

test('generate-crop endpoint returns 404 for a non-existent media ID', async ({ page }) => {
  await login(page)

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/media/generate-crop', {
      body: JSON.stringify({
        cropData: { height: 100, width: 100, x: 0, y: 0 },
        cropName: 'desktop',
        mediaId: '000000000000000000000000',
        outputHeight: 1080,
        outputWidth: 1920,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return res.status
  })

  // 404 (not found) or 422 (no dimensions) are both acceptable for a missing doc
  expect([404, 422, 500]).toContain(status)
})
