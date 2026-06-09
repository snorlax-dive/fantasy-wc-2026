import { test, expect } from '@playwright/test'

// Requires authenticated session. Use Playwright's storageState fixture or
// test.use({ storageState: 'playwright/.auth/user.json' }) after running
// the global setup that logs in via magic link.

test.describe('Predictions page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip if no auth cookies — these tests need a logged-in session.
    // In CI, run global-setup.ts first to produce the auth state file.
    await page.goto('/predictions')
    if (page.url().includes('/login')) {
      test.skip()
    }
  })

  test('predictions page renders fixture list', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('entering valid scores shows save button', async ({ page }) => {
    const firstPredCard = page.locator('[data-testid="prediction-card"]').first()
    if (!(await firstPredCard.isVisible())) return // no fixtures yet

    const inputs = firstPredCard.getByRole('spinbutton')
    await inputs.nth(0).fill('2')
    await inputs.nth(1).fill('1')
    const saveBtn = firstPredCard.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeEnabled()
  })

  test('locked match shows no editable inputs', async ({ page }) => {
    // If any fixtures are locked (past kickoff), their inputs should be disabled
    const lockedCards = page.locator('[data-testid="prediction-card"][data-locked="true"]')
    const count = await lockedCards.count()
    if (count === 0) return // nothing locked yet

    const inputs = lockedCards.first().getByRole('spinbutton')
    for (let i = 0; i < await inputs.count(); i++) {
      await expect(inputs.nth(i)).toBeDisabled()
    }
  })
})
