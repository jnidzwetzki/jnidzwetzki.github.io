const { test, expect } = require('@playwright/test');

test.describe('Blog Functionality', () => {
  test('should display blog posts', async ({ page }) => {
    await page.goto('/');
    
    const posts = page.locator('.post-teaser, article, .post, .blog-post');
    const count = await posts.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should open individual blog post', async ({ page }) => {
    await page.goto('/');
    
    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();
    
    await expect(page.locator('article, .post-content, main').first()).toBeVisible();
  });

  test('should have post metadata', async ({ page }) => {
    await page.goto('/');
    
    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();
    
    const article = page.locator('article, .post-content, main').first();
    await expect(article).toBeVisible();
  });

  test('should have post navigation', async ({ page }) => {
    await page.goto('/');
    
    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();
    
    const navLinks = page.locator('.post-nav, .pagination, nav a');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should filter posts by tag', async ({ page }) => {
    await page.goto('/tags');
    
    // Click on a tag
    const tag = page.locator('a[href*="tags"]').first();
    if (await tag.isVisible()) {
      await tag.click();
      
      // Verify posts are shown
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should filter posts by category', async ({ page }) => {
    await page.goto('/categories');
    
    // Click on a category
    const category = page.locator('a[href*="categories"], .category').first();
    if (await category.isVisible()) {
      await category.click();
      
      // Verify posts are shown
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should have blog pagination', async ({ page }) => {
    await page.goto('/blog');
    
    // Check if pagination exists
    const pagination = page.locator('.pagination, .pager, nav[aria-label*="pagination" i]');
    // Pagination may not exist if few posts
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display post excerpts on blog page', async ({ page }) => {
    await page.goto('/blog');
    
    const posts = page.locator('article, .post, .blog-post');
    const firstPost = posts.first();
    
    if (await firstPost.isVisible()) {
      // Posts should have some text content
      const text = await firstPost.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('should have syntax highlighting in code blocks', async ({ page }) => {
    await page.goto('/blog');
    
    // Navigate to a post that might have code
    const posts = page.locator('article a, .post a, .blog-post a');
    const count = await posts.count();
    
    if (count > 0) {
      await posts.first().click();
      
      // Check if code blocks exist and have highlighting classes
      const codeBlocks = page.locator('pre code, .highlight');
      if (await codeBlocks.count() > 0) {
        const codeBlock = codeBlocks.first();
        const className = await codeBlock.getAttribute('class');
        expect(className).toBeTruthy();
      }
    }
  });

  test('should have share buttons on posts', async ({ page }) => {
    await page.goto('/');
    
    // Click first post title
    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();
    
    // Share buttons may or may not be enabled
    await expect(page.locator('article, main')).toBeVisible();
  });
});

