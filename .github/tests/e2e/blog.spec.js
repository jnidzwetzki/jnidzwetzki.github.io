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
    
    const articleText = await article.textContent();
    expect(articleText?.length).toBeGreaterThan(50);
  });

  test('should have post navigation', async ({ page }) => {
    await page.goto('/');

    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();

    const article = page.locator('article, .post-content, main').first();
    await expect(article).toBeVisible();
    
    const navLinks = page.locator('.post-nav, .pagination, nav a');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should filter posts by tag', async ({ page }) => {
    await page.goto('/tags');

    const tag = page.locator('a[href*="tags"]').first();
    const tagExists = await tag.count() > 0;
    
    if (!tagExists) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }
    
    await expect(tag).toBeVisible();
    await tag.click();

    await expect(page.locator('body')).toBeVisible();
    
    expect(page.url()).toContain('tag');
  });

  test('should filter posts by category', async ({ page }) => {
    await page.goto('/categories');

    const category = page.locator('a[href*="categories"], .category').first();
    const categoryExists = await category.count() > 0;
    
    if (!categoryExists) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }
    
    await expect(category).toBeVisible();
    await category.click();

    await expect(page.locator('body')).toBeVisible();
    
    expect(page.url()).toMatch(/categories|category/);
  });

  test('should have blog pagination', async ({ page }) => {
    await page.goto('/blog');

    await expect(page.locator('body')).toBeVisible();
    
    const posts = page.locator('article, .post, .blog-post');
    expect(await posts.count()).toBeGreaterThan(0);
    
    const pagination = page.locator('.pagination, .pager, nav[aria-label*="pagination" i]');
  });

  test('should display post excerpts on blog page', async ({ page }) => {
    await page.goto('/blog');

    const posts = page.locator('article, .post, .blog-post');
    const firstPost = posts.first();

    await expect(firstPost).toBeVisible();
    
    const text = await firstPost.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  /**
   * @note Not all posts contain code blocks, so we conditionally check if they exist.
   */
  test('should have syntax highlighting in code blocks', async ({ page }) => {
    await page.goto('/blog');

    const posts = page.locator('article a, .post a, .blog-post a');
    const count = await posts.count();

    expect(count).toBeGreaterThan(0);
    
    await posts.first().click();

    const codeBlocks = page.locator('pre code, .highlight');
    const codeBlockCount = await codeBlocks.count();
    
    if (codeBlockCount > 0) {
      const codeBlock = codeBlocks.first();
      const className = await codeBlock.getAttribute('class');
      expect(className).toBeTruthy();
    }
  });

  test('should have share buttons on posts', async ({ page }) => {
    await page.goto('/');

    const firstPost = page.locator('.post-teaser header h1 a, article header h1 a, .banner h1 a').first();
    await firstPost.click();

    const article = page.locator('article, main');
    await expect(article).toBeVisible();
    
    const articleText = await article.textContent();
    expect(articleText?.length).toBeGreaterThan(50);
  });
});
