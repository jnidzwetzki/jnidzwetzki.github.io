const { test, expect } = require('@playwright/test');

test.describe('Search Functionality', () => {
  test('should display search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('body')).toBeVisible();
    
    // Verify search-specific elements exist
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]');
    await expect(searchInput.first()).toBeVisible();
  });

  test('should have search input field', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]');
    await expect(searchInput.first()).toBeVisible();
    
    // Verify it's actually a functional input
    const inputType = await searchInput.first().getAttribute('type');
    expect(['search', 'text']).toContain(inputType);
  });

  test('should allow typing in search field', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');
    const value = await searchInput.inputValue();
    expect(value).toBe('test');
  });

  test('should display search results', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('blog');

    await page.waitForTimeout(2000);

    const resultItems = page.locator('#results-container li, .search-results li, [id*="result"] li');
    const itemCount = await resultItems.count();

    expect(itemCount).toBeGreaterThan(0);
  });

  test('should clear search results', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    await searchInput.clear();
    const value = await searchInput.inputValue();
    expect(value).toBe('');
  });

  test('should handle no results gracefully', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('xyzabc123notfound999');
    await page.waitForTimeout(1000);

    // Verify no results message or empty results container
    const resultItems = page.locator('#results-container li, .search-results li, [id*="result"] li');
    const itemCount = await resultItems.count();
    
    // For "no results" scenario, we expect 0 items OR a "no results" message
    if (itemCount === 0) {
      // Verify the page still rendered properly
      await expect(page.locator('body')).toBeVisible();
    } else {
      // If there are items, they might be "no results found" messages
      const noResultsText = page.locator(':has-text("No result"), :has-text("No matches"), :has-text("nothing found")');
      expect(await noResultsText.count()).toBeGreaterThan(0);
    }
  });

  test('should search case-insensitively', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('JEKYLL');
    await page.waitForTimeout(1000);

    const resultItems = page.locator('#results-container li, .search-results li, [id*="result"] li');
    const itemCount = await resultItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('should highlight search terms in results', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('jekyll');
    await page.waitForTimeout(1000);

    const resultItems = page.locator('#results-container li, .search-results li, [id*="result"] li');
    const itemCount = await resultItems.count();
    expect(itemCount).toBeGreaterThan(0);
    
    // Verify results contain the search term
    const firstResult = resultItems.first();
    const resultText = await firstResult.textContent();
    expect(resultText.toLowerCase()).toContain('jekyll');
  });

  test('should have search result links', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('jekyll');
    await page.waitForTimeout(1000);

    const resultLinks = page.locator('#results-container a, #search-results a, .search-results a, [id*="result"] a');
    const count = await resultLinks.count();

    expect(count).toBeGreaterThan(0);
    
    await resultLinks.first().click();

    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show search from navbar', async ({ page }) => {
    await page.goto('/');

    const searchLink = page.locator('nav a[href*="search"], .navbar a[href*="search"]');

    expect(await searchLink.count()).toBeGreaterThan(0);
    await searchLink.first().click();
    await expect(page).toHaveURL(/search/);
  });

  test('should have working search on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');

    await page.goto('/search');

    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();

    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');

    const value = await searchInput.inputValue();
    expect(value).toBe('test');
  });
});
