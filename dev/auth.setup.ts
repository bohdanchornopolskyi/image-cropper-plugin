import { expect, test as setup } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

setup('log in', async ({ request }) => {
  const res = await request.post('/api/users/login', {
    data: { email: devUser.email, password: devUser.password },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await request.storageState({ path: 'playwright/.auth/user.json' })
})
