import { chromium, devices } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { enterSport } from './enter.mjs';
const OUT = '/tmp/claude-0/-home-user-laxgame/3fb48e6a-67d8-5fb9-b0aa-0211083b6a02/scratchpad';
const browser = await chromium.launch({ executablePath: chromiumPath() });

// Desktop: mid-play
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await enterSport(page, 'football', { title: 'Gridiron' });
  await page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Coach the home side' }).first().click();
  await page.locator('.callcard__inner').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/fb-call.png` });
  // Call a pass and snap it
  await page.locator('.callcard__play').filter({ hasText: 'Curls' }).first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/fb-live.png` });
  await ctx.close();
}
// Phone
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await enterSport(page, 'football', { title: 'Gridiron', tap: true });
  await page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().tap();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Coach the home side' }).first().tap();
  await page.locator('.callcard__inner').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/fb-phone-call.png` });
  await page.locator('.callcard__play').first().tap();
  await page.waitForTimeout(400);
  await page.locator('.tbtn--snap').tap();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/fb-phone-live.png` });
  await ctx.close();
}
await browser.close();
console.log('shots taken');
