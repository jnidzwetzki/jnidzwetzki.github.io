/**
 * Helper to open mobile menu - forces menu visibility for mobile tests
 */
async function openMobileMenu(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  
  const menu = page.locator('nav ul');
  await menu.evaluate(el => {
    el.classList.remove('hide');
    el.style.opacity = '1';
    el.style.fontSize = '';
  });
  
  await page.waitForTimeout(200);
}

module.exports = {
  openMobileMenu,
};

