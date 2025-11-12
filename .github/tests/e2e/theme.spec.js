const { test, expect } = require('@playwright/test');

test.describe('Theme and Dark Mode', () => {
  /**
   * Helper function to check if theme toggle is available on the page.
   * @param {import('@playwright/test').Page} page - Playwright page object
   * @returns {Promise<boolean>} True if theme toggle exists
   */
  async function hasThemeToggle(page) {
    const themeToggle = page.locator('#theme-toggle, button:has-text("Dark"), button:has-text("Light")');
    return await themeToggle.count() > 0;
  }

  test('should toggle dark mode', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle, button:has-text("Dark"), button:has-text("Light")').first();

    if (!await hasThemeToggle(page)) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    
    const initialTheme = await page.getAttribute('html', 'data-theme');

    await themeToggle.click();

    await page.waitForTimeout(500);

    const newTheme = await page.getAttribute('html', 'data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should persist theme preference', async ({ page, context }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle, button:has-text("Dark"), button:has-text("Light")').first();

    if (!await hasThemeToggle(page)) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    await page.waitForTimeout(500);
    const theme = await page.getAttribute('html', 'data-theme');

    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.waitForTimeout(500);

    const persistedTheme = await newPage.getAttribute('html', 'data-theme');
    expect(persistedTheme).toBe(theme);

    await newPage.close();
  });

  test('should have correct theme styles applied', async ({ page }) => {
    await page.goto('/');

    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBeTruthy();

    const backgroundColor = await page.locator('body').evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );
    expect(backgroundColor).toBeTruthy();
  });

  test('should toggle theme multiple times', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle, button:has-text("Dark"), button:has-text("Light")').first();

    if (!await hasThemeToggle(page)) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    
    const themes = [];

    for (let i = 0; i < 3; i++) {
      await themeToggle.click();
      await page.waitForTimeout(300);
      const theme = await page.getAttribute('html', 'data-theme');
      themes.push(theme);
    }

    expect(themes[0]).toBe(themes[2]);
    expect(themes[0]).not.toBe(themes[1]);
  });

  test('should update theme toggle button appearance', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle').first();

    if (!await hasThemeToggle(page)) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    
    const initialHtml = await themeToggle.innerHTML();

    await themeToggle.click();
    await page.waitForTimeout(300);

    const newHtml = await themeToggle.innerHTML();
    expect(newHtml).not.toBe(initialHtml);
  });
});

test.describe('Dark Mode Initialization', () => {
  test('should default to light mode when no preference or localStorage', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);

    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');
  });

  test('should respect browser preference for dark mode', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);

    const theme = await page.getAttribute('html', 'data-theme');
    const localStorage = await page.evaluate(() => window.localStorage.getItem('theme'));

    expect(theme).toBe('dark');
    expect(localStorage).toBe('dark');

    await context.close();
  });

  test('should respect browser preference for light mode', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'light',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);

    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');

    await context.close();
  });

  test('should prioritize localStorage over browser preference', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    await page.goto('/');

    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    await page.waitForTimeout(500);

    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');

    await context.close();
  });

  test('should save theme to localStorage when toggled', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle').first();

    const toggleExists = await themeToggle.count() > 0;
    if (!toggleExists) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    await page.waitForTimeout(300);

    const theme = await page.getAttribute('html', 'data-theme');
    const localStorageTheme = await page.evaluate(() => window.localStorage.getItem('theme'));

    expect(theme).toBe(localStorageTheme);
    expect(localStorageTheme).toBeTruthy();
  });

  test('should maintain theme across navigation', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle').first();

    const toggleExists = await themeToggle.count() > 0;
    if (!toggleExists) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    await page.waitForTimeout(300);
    const initialTheme = await page.getAttribute('html', 'data-theme');

    const blogLink = page.locator('a[href*="blog"], a[href*="posts"]').first();
    const blogLinkExists = await blogLink.count() > 0;
    
    if (blogLinkExists) {
      await blogLink.click();
      await page.waitForTimeout(500);

      const themeAfterNav = await page.getAttribute('html', 'data-theme');
      expect(themeAfterNav).toBe(initialTheme);
    }
  });

  test('should have correct button text based on theme', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle').first();

    const toggleExists = await themeToggle.count() > 0;
    if (!toggleExists) {
      test.skip(true, 'Theme toggle not enabled in site configuration');
      return;
    }

    await expect(themeToggle).toBeVisible();
    
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    });
    await page.reload();
    await page.waitForTimeout(300);

    let buttonText = await themeToggle.textContent();
    expect(buttonText.toLowerCase()).toContain('dark');

    await themeToggle.click();
    await page.waitForTimeout(300);

    buttonText = await themeToggle.textContent();
    expect(buttonText.toLowerCase()).toContain('light');
  });
});
