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

test('admin panel loads and login succeeds', async ({ page }) => {
  await login(page)
  await expect(page.locator('.graphic-icon')).toBeVisible()
})

test('posts collection is listed in the admin nav', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('link', { name: /posts/i })).toBeVisible()
})

test('create-post form renders the crop image field', async ({ page }) => {
  await login(page)
  await page.goto('/admin/collections/posts/create')
  // The CropImageField renders a "Select Image" button when no image is chosen
  await expect(page.getByRole('button', { name: /select image/i })).toBeVisible()
})
