const { chromium } = require('playwright');

(async () => {
  const examId = 'vvpp_a2_20260301_v1';
  const base = 'http://localhost:3000';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const counts = { imagesGenerate: 0, ttsSynthesize: 0, imagesFile: 0, ttsAudio: 0 };

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/images/generate')) counts.imagesGenerate += 1;
    if (u.includes('/api/tts/synthesize')) counts.ttsSynthesize += 1;
    if (u.includes('/api/images/file/')) counts.imagesFile += 1;
    if (u.includes('/api/tts/audio/')) counts.ttsAudio += 1;
  });

  async function open(url, waitMs = 8000) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(waitMs);
  }

  await open(`${base}/trainer/listening?examId=${examId}`, 5000);
  await open(`${base}/trainer/writing?examId=${examId}`, 7000);
  await open(`${base}/trainer/speaking?examId=${examId}`, 7000);
  await open(`${base}/exam?examId=${examId}`, 5000);

  for (const label of ['Sākt simulāciju', 'Start simulation']) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(2500);
      break;
    }
  }

  for (const label of ['Rakstīšana', 'Runāšana', 'Writing', 'Speaking']) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(1800);
    }
  }

  await page.waitForTimeout(5000);

  console.log(JSON.stringify(counts, null, 2));
  await browser.close();
})();
