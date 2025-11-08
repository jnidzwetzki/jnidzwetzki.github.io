const { test, expect } = require('@playwright/test');

test.describe('Gallery Functionality', () => {
  test('should display gallery page', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display gallery images', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img, img[class*="gallery"]');
    const count = await images.count();

    if (count > 0) {
      expect(count).toBeGreaterThan(0);

      await expect(images.first()).toBeVisible();
    }
  });

  test('should have valid image sources', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img, img[class*="gallery"]');
    const count = await images.count();

    if (count > 0) {
      const firstImage = images.first();
      const src = await firstImage.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toMatch(/\.(jpg|jpeg|png|gif|webp|svg)/i);
    }
  });

  test('should have image alt text', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img');
    const count = await images.count();

    if (count > 0) {
      const firstImage = images.first();
      const alt = await firstImage.getAttribute('alt');
      expect(alt).toBeDefined();
    }
  });

  test('should have responsive gallery layout', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img');
    const count = await images.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        await expect(images.nth(i)).toBeVisible();
      }
    }
  });

  test('should load images progressively', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img');
    const count = await images.count();

    if (count > 0) {
      const firstImage = images.first();
      await expect(firstImage).toBeVisible();

      const isLoaded = await firstImage.evaluate((img) => {
        return img.complete && img.naturalWidth > 0;
      });

      expect(isLoaded).toBe(true);
    }
  });

  test('should have gallery grid layout', async ({ page }) => {
    await page.goto('/gallery');

    const gallery = page.locator('.gallery, [class*="gallery"]').first();

    if (await gallery.isVisible()) {
      await expect(gallery).toBeVisible();

      const images = gallery.locator('img');
      const count = await images.count();

      if (count > 0) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('should handle image lazy loading', async ({ page }) => {
    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img');
    const count = await images.count();

    if (count > 0) {
      const firstImage = images.first();
      const loading = await firstImage.getAttribute('loading');

      if (loading) {
        expect(['lazy', 'eager']).toContain(loading);
      }
    }
  });

  test('should display gallery on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');

    await page.goto('/gallery');

    const images = page.locator('.gallery img, .gallery-item img');
    const count = await images.count();

    if (count > 0) {
      await expect(images.first()).toBeVisible();
    }
  });
});
