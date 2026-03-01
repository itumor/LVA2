import { test, expect } from 'playwright/test';

const BASE = 'http://localhost:3000';
const LONG_TIMEOUT_MS = 240000;

async function waitForGeneratedImage(page: import('playwright/test').Page, timeoutMs = 150000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const src = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const hit = imgs.find((img) => (img.getAttribute('src') || '').includes('/api/images/file/'));
      return hit ? hit.getAttribute('src') : null;
    });
    if (src) return src;
    await page.waitForTimeout(2000);
  }
  return null;
}

test('trainer writing shows generated image', async ({ page }) => {
  test.setTimeout(LONG_TIMEOUT_MS);
  await page.goto(`${BASE}/trainer/writing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const src = await waitForGeneratedImage(page);
  await page.screenshot({ path: '/Users/eramadan/GitRepo/LVA2/test-results/ui-pass/trainer-writing.png', fullPage: true });
  expect(src, 'No generated image found on trainer writing').toBeTruthy();
});

test('trainer speaking shows generated image', async ({ page }) => {
  test.setTimeout(LONG_TIMEOUT_MS);
  await page.goto(`${BASE}/trainer/speaking`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  for (const label of ['Nākamais', 'Next', 'Next Task', 'Turpināt']) {
    const btn = page.getByRole('button', { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
  const src = await waitForGeneratedImage(page);
  await page.screenshot({ path: '/Users/eramadan/GitRepo/LVA2/test-results/ui-pass/trainer-speaking.png', fullPage: true });
  expect(src, 'No generated image found on trainer speaking').toBeTruthy();
});

test('exam shows generated image', async ({ page }) => {
  test.setTimeout(LONG_TIMEOUT_MS);
  await page.goto(`${BASE}/exam`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  for (const startLabel of ['Sākt simulāciju', 'Start simulation', 'Start']) {
    const startBtn = page.getByRole('button', { name: startLabel }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click().catch(() => {});
      await page.waitForTimeout(2500);
      break;
    }
  }

  let src = await waitForGeneratedImage(page, 30000);
  if (!src) {
    for (let step = 0; step < 16; step += 1) {
      for (const label of ['Runāšana', 'Rakstīšana', 'Speaking', 'Writing']) {
        const locator = page.getByRole('button', { name: label }).first();
        if (await locator.isVisible().catch(() => false)) {
          await locator.click().catch(() => {});
          await page.waitForTimeout(1200);
        }
      }
      for (const label of ['Nākamais', 'Next', 'Next Task', 'Turpināt']) {
        const btn = page.getByRole('button', { name: label }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(1200);
        }
      }
      src = await waitForGeneratedImage(page, 15000);
      if (src) break;
    }
  }
  await page.screenshot({ path: '/Users/eramadan/GitRepo/LVA2/test-results/ui-pass/exam.png', fullPage: true });
  expect(src, 'No generated image found on exam').toBeTruthy();
});
