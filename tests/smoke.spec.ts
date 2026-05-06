import { test, expect } from '@playwright/test'

test.describe('synth smoke', () => {
  test('app loads with the boot preset', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Synth', level: 1 })).toBeVisible()
    // Status line ends with "presets: web" once the storage layer is up.
    await expect(page.getByText(/presets: web/)).toBeVisible({ timeout: 10_000 })
  })

  test('typing a note shows it in the playing readout', async ({ page }) => {
    await page.goto('/')
    // Click on the page first to satisfy the autoplay gesture requirement.
    await page.getByRole('heading', { name: 'Synth', level: 1 }).click()
    // Initial state: silent.
    await expect(page.getByText('silent')).toBeVisible()
    // Press "z" → bottom row C in the current octave (default 4 → C4).
    await page.keyboard.down('z')
    await expect(page.getByText(/playing:.*C4/)).toBeVisible({ timeout: 2_000 })
    await page.keyboard.up('z')
    await expect(page.getByText('silent')).toBeVisible({ timeout: 2_000 })
  })

  test('preset switcher applies a different preset', async ({ page }) => {
    await page.goto('/')
    const select = page.locator('select').first()
    await select.selectOption('Bright Lead')
    await expect(select).toHaveValue('Bright Lead')
  })
})
