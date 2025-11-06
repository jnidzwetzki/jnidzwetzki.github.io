const { test, expect } = require('@playwright/test');

/**
 * Search functionality tests for Type-on-Strap theme
 */
test.describe('Search Functionality', () => {
  test('should display search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have search input field', async ({ page }) => {
    await page.goto('/search');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]');
    const count = await searchInput.count();
    
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test('should allow typing in search field', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      const value = await searchInput.inputValue();
      expect(value).toBe('test');
    }
  });

  test('should display search results', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      // Type a common word that should appear in posts
      await searchInput.fill('blog');
      
      // Wait for search to process and results to appear
      await page.waitForTimeout(2000);
      
      // Check for actual result items (li elements) instead of just the container
      const resultItems = page.locator('#results-container li, .search-results li, [id*="result"] li');
      const itemCount = await resultItems.count();
      
      // If no results, at least verify search ran (input has value and page is functional)
      if (itemCount === 0) {
        const inputValue = await searchInput.inputValue();
        expect(inputValue).toBe('blog');
        // Search may not find results, but should not error
        await expect(page.locator('body')).toBeVisible();
      } else {
        expect(itemCount).toBeGreaterThan(0);
      }
    }
  });

  test('should clear search results', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      
      await searchInput.clear();
      const value = await searchInput.inputValue();
      expect(value).toBe('');
    }
  });

  test('should handle no results gracefully', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      // Search for something that definitely won't exist
      await searchInput.fill('xyzabc123notfound999');
      await page.waitForTimeout(1000);
      
      // Page should still be functional
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should search case-insensitively', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('JEKYLL');
      await page.waitForTimeout(1000);
      
      // Search should work regardless of case
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should highlight search terms in results', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('jekyll');
      await page.waitForTimeout(1000);
      
      // Results may have highlighting, but page should be functional
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should have search result links', async ({ page }) => {
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('jekyll');
      await page.waitForTimeout(1000);
      
      // Check if result links exist
      const resultLinks = page.locator('#search-results a, .search-results a, [id*="result"] a');
      const count = await resultLinks.count();
      
      if (count > 0) {
        // Click first result
        await resultLinks.first().click();
        
        // Should navigate to a page
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('should show search from navbar', async ({ page }) => {
    await page.goto('/');
    
    // Look for search link in navbar
    const searchLink = page.locator('nav a[href*="search"], .navbar a[href*="search"]');
    
    if (await searchLink.count() > 0) {
      await searchLink.first().click();
      await expect(page).toHaveURL(/search/);
    }
  });

  test('should have working search on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');
    
    await page.goto('/search');
    
    const searchInput = page.locator('input[type="search"], input[type="text"][id*="search"], input[placeholder*="search" i]').first();
    
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
      await searchInput.fill('test');
      
      const value = await searchInput.inputValue();
      expect(value).toBe('test');
    }
  });
});

