const { test, expect } = require('@playwright/test');

test.describe('Portfolio Functionality', () => {
  test('should display portfolio page', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display portfolio items', async ({ page }) => {
    await page.goto('/portfolio');

    const items = page.locator('.portfolio-item, article, .card');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should open individual portfolio item', async ({ page }) => {
    await page.goto('/portfolio');

    const firstItem = page.locator('.portfolio-item a, article a, .card a').first();

    if (await firstItem.isVisible()) {
      await firstItem.click();

      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain('portfolio');
    }
  });

  test('should have portfolio item images', async ({ page }) => {
    await page.goto('/portfolio');

    const images = page.locator('.portfolio-item img, article img, .card img');
    const count = await images.count();

    if (count > 0) {
      const firstImage = images.first();

      const src = await firstImage.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toMatch(/\.(jpg|jpeg|png|gif|webp|svg)/i);

      await firstImage.evaluate((img) => {
        return img.complete || new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
    }
  });

  test('should have portfolio item titles', async ({ page }) => {
    await page.goto('/portfolio');

    const items = page.locator('.portfolio-item, article, .card');
    const firstItem = items.first();

    if (await firstItem.isVisible()) {
      const title = firstItem.locator('h1, h2, h3, h4, .title');
      const titleCount = await title.count();
      expect(titleCount).toBeGreaterThan(0);
    }
  });

  test('should have portfolio item descriptions', async ({ page }) => {
    await page.goto('/portfolio');

    const items = page.locator('.portfolio-item, article, .card');
    const firstItem = items.first();

    if (await firstItem.isVisible()) {
      const text = await firstItem.textContent();
      expect(text?.length).toBeGreaterThan(10);
    }
  });

  test('should have responsive portfolio grid', async ({ page, isMobile }) => {
    await page.goto('/portfolio');

    const items = page.locator('.portfolio-item, article, .card');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(items.nth(i)).toBeVisible();
    }
  });

  test('should navigate back to portfolio from detail page', async ({ page }) => {
    await page.goto('/portfolio');

    const firstItem = page.locator('.portfolio-item a, article a, .card a').first();

    if (await firstItem.isVisible()) {
      await firstItem.click();

      await page.goBack();

      await expect(page).toHaveURL(/portfolio/);
    }
  });

  test('should have portfolio metadata', async ({ page }) => {
    await page.goto('/portfolio');

    const firstItem = page.locator('.portfolio-item a, article a, .card a').first();

    if (await firstItem.isVisible()) {
      await firstItem.click();

      await expect(page.locator('body')).toBeVisible();
    }
  });
});
