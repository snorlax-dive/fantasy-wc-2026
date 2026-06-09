import { test, expect } from '@playwright/test'

// These tests require the dev server and a real (test) Supabase project.
// Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test.local to run.

test.describe('Auth flow', () => {
  test('unauthenticated visit to /squad redirects to /login', async ({ page }) => {
    await page.goto('/squad')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to /predictions redirects to /login', async ({ page }) => {
    await page.goto('/predictions')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to /leaderboard redirects to /login', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading')).toBeVisible()
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
  })

  test('wrong invite code → error message', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/email/i).fill('test@example.com')
    // Fill invite code field if present
    const inviteField = page.getByPlaceholder(/invite/i)
    if (await inviteField.isVisible()) {
      await inviteField.fill('WRONG-CODE')
    }
    await page.getByRole('button', { name: /sign in|send|continue/i }).click()
    await expect(page.getByText(/invalid|wrong|incorrect/i)).toBeVisible({ timeout: 5000 })
  })
})
