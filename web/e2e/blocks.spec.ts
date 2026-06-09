import { test, expect } from '@playwright/test'

test.describe('Blocks & Shields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/blocks')
    if (page.url().includes('/login')) {
      test.skip()
    }
  })

  test('blocks page loads', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('GROUP stage shows blocks-not-available message', async ({ page }) => {
    // During the group stage, the blocks UI should indicate it's not open yet
    const notAvailable = page.getByText(/knockout rounds|not available|group stage/i)
    const blockForm = page.locator('[data-testid="block-form"]')

    // Either the "not available" message is shown, or a block form is shown (KO stage)
    const isGroupStage = await notAvailable.isVisible()
    const isKOStage = await blockForm.isVisible()
    expect(isGroupStage || isKOStage).toBe(true)
  })

  test('KO stage: block form shows target and player selection', async ({ page }) => {
    const blockForm = page.locator('[data-testid="block-form"]')
    if (!(await blockForm.isVisible())) {
      test.skip() // not in KO stage yet
    }

    await expect(page.getByLabel(/target/i)).toBeVisible()
    await expect(page.getByLabel(/player/i)).toBeVisible()
  })

  test('shield button visible in KO stage', async ({ page }) => {
    const blockForm = page.locator('[data-testid="block-form"]')
    if (!(await blockForm.isVisible())) {
      test.skip()
    }

    const shieldBtn = page.getByRole('button', { name: /shield/i })
    await expect(shieldBtn).toBeVisible()
  })
})
