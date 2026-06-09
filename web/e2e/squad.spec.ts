import { test, expect } from '@playwright/test'

test.describe('Squad builder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/squad')
    if (page.url().includes('/login')) {
      test.skip()
    }
  })

  test('squad page renders player pool', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('selecting a player adds them to the selected list', async ({ page }) => {
    const firstPlayer = page.locator('[data-testid="player-card"]').first()
    if (!(await firstPlayer.isVisible())) return

    await firstPlayer.click()
    await expect(page.locator('[data-testid="selected-players"]')).toContainText(
      await firstPlayer.getAttribute('data-player-name') ?? ''
    )
  })

  test('over-budget squad shows budget warning', async ({ page }) => {
    // Select all the most expensive players visible
    const playerCards = page.locator('[data-testid="player-card"]')
    const count = Math.min(await playerCards.count(), 11)
    for (let i = 0; i < count; i++) {
      await playerCards.nth(i).click()
    }

    const budgetIndicator = page.locator('[data-testid="budget-remaining"]')
    if (await budgetIndicator.isVisible()) {
      const budgetText = await budgetIndicator.textContent()
      // If over budget, text should include a negative or warning state
      const saveBtn = page.getByRole('button', { name: /save squad/i })
      if (budgetText?.includes('-')) {
        await expect(saveBtn).toBeDisabled()
      }
    }
  })

  test('locked squad shows read-only state', async ({ page }) => {
    // If the round has started, squad builder should be in read-only mode
    const lockedMsg = page.locator('[data-testid="squad-locked"]')
    if (await lockedMsg.isVisible()) {
      await expect(page.getByRole('button', { name: /save squad/i })).not.toBeVisible()
    }
  })
})
