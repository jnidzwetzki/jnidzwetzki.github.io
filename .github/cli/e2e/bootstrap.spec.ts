import { expect, test } from '@playwright/test';
import { setTheme } from './support/helpers';

const bootstrapPostUrl = '/demo/2017/09/17/Use-Bootstrap';

test.describe('Bootstrap Isolation @desktop', () => {

  test('should load bootstrap post without CSS 404 errors', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', response => {
      if (response.status() === 404 && response.url().includes('bootstrap')) {
        failedRequests.push(response.url());
      }
    });

    await page.goto(bootstrapPostUrl);
    await expect(page.locator('article')).toBeVisible();

    expect(failedRequests).toHaveLength(0);
  });

  test('should render bootstrap components', async ({ page }) => {
    await page.goto(bootstrapPostUrl);

    const card = page.locator('.card').first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('should not override theme background in dark mode', async ({ page }) => {
    await page.goto(bootstrapPostUrl);
    await setTheme(page, 'dark');

    const bgColor = await page.locator('body').evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );

    // Bootstrap sets body bg to rgb(255, 255, 255) (#fff)
    // Dark theme should use --background: #22272e -> rgb(34, 39, 46)
    // If bootstrap overrides the theme, bg will be white
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('should not override theme text color in dark mode', async ({ page }) => {
    await page.goto(bootstrapPostUrl);
    await setTheme(page, 'dark');

    const textColor = await page.locator('body').evaluate(
      el => window.getComputedStyle(el).color,
    );

    // Bootstrap sets body color to rgb(33, 37, 41) (#212529) - dark text
    // Dark theme should use --text: #cdd9e5 -> rgb(205, 217, 229)
    // If bootstrap overrides, text will be dark on dark bg (unreadable)
    expect(textColor).not.toBe('rgb(33, 37, 41)');
  });

  test('should preserve theme link color in dark mode', async ({ page }) => {
    await page.goto(bootstrapPostUrl);
    await setTheme(page, 'dark');

    const link = page.locator('.post-content a').first();
    if (await link.count() > 0) {
      const linkColor = await link.evaluate(
        el => window.getComputedStyle(el).color,
      );

      // Bootstrap sets links to #007bff, theme dark sets --link: #00a8e0
      // Verify it's not bootstrap's default blue
      expect(linkColor).not.toBe('rgb(0, 123, 255)');
    }
  });

  test('should have bootstrap-iso wrapper around content', async ({ page }) => {
    await page.goto(bootstrapPostUrl);

    const wrapper = page.locator('.post-content .bootstrap-iso');
    await expect(wrapper).toBeVisible();
  });
});
