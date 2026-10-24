import { expect, test } from '@playwright/test';
import { SAMPLE_PGN } from '../src/core/sample';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      throw new Error(`Unexpected external request: ${route.request().url()}`);
    }
    await route.continue();
  });
});

test('sample imports, replays, completes real WASM review, and explores alternatives', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByLabel('Game notation (PGN)').fill(SAMPLE_PGN);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.getByRole('heading', { name: '34... Qc2#' })).toBeVisible();
  await page.getByRole('button', { name: 'First position' }).click();
  await page.getByRole('button', { name: 'Analyze game', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Review complete', { timeout: 150_000 });
  await expect(page.locator('.move-grade')).toHaveCount(68);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /^19\. Rh1 / }).click();
  await expect(page.getByRole('heading', { name: 'Why this is a blunder' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Move explanation' })).toContainText('queen on d4');
  await page.getByRole('button', { name: 'Show opponent response', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Suggested move e5 to f3' })).toBeVisible();
  await page.getByRole('button', { name: 'Play next in line' }).click();
  await expect(page.getByRole('gridcell', { name: 'f3 black knight', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await page.getByRole('button', { name: 'Show best move', exact: true }).click();
  await expect(page.getByRole('img', { name: /Suggested move/ })).toBeVisible();
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.getByRole('img', { name: /Suggested move/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play next in line' }).click();
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await page.getByRole('tab', { name: 'Player comparison' }).click();
  await expect(page.getByRole('heading', { name: 'ripu502' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'jaisingh16' })).toBeVisible();
  expect(errors).toEqual([]);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test('cancel and retry do not publish stale output into a new game', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Game notation (PGN)').fill('1. e4 e5 2. Nf3 Nc6 *');
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze game', exact: true }).click();
  await page.getByRole('button', { name: 'Pause analysis' }).click();
  await expect(page.getByRole('status')).toContainText('paused');
  await page.getByText('Import another game', { exact: false }).click();
  await page.getByLabel('Game notation (PGN)').fill('1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze game', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Review complete', { timeout: 60_000 });
  await expect(page.locator('.move-grade')).toHaveCount(4);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.getByRole('heading', { name: '2... Qh4#' })).toBeVisible();
});
