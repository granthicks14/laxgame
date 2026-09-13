/**
 * Screen photographs, at phone and desktop width.
 *
 * A UI pass cannot be done from the source: somebody has to look at the screens.
 * This walks the ones that matter, on a real save with real content in it, and
 * writes a PNG per screen per width so they can be looked at side by side.
 *
 *   npm run build && npm run preview &
 *   node scripts/shots.mjs [outdir]
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[2] ?? 'shots';
mkdirSync(OUT, { recursive: true });

/** Saves written by the game's own code, so the screens have real content. */
const seed = (env) => execFileSync('npm', ['run', 'seed-save', '--silent'], {
  env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).trim();
/** A coach sitting on a championship, and a coach with a season in front of him. */
const CHAMPION = seed({ STAGE: '3', CHAMPION: '1' });
const MIDSEASON = seed({ STAGE: '4' });
const keyFor = (save) => `lsl.career.challenge.v${JSON.parse(save).version}`;

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch({ executablePath: chromiumPath() });
const problems = [];

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: size.name === 'phone',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${size.name}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${size.name}: ${m.text()}`); });

  const settle = (ms = 380) => page.waitForTimeout(ms);
  const shot = async (name) => {
    const buf = await page.screenshot();
    writeFileSync(join(OUT, `${size.name}-${name}.png`), buf);
    // Horizontal overflow is a bug wherever it happens, so check it here too.
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) problems.push(`${size.name}/${name}: ${over}px of horizontal overflow`);
    console.log(`${size.name}-${name}.png`);
  };
  const tap = async (re) => {
    const b = page.getByRole('button', { name: re }).first();
    if (!(await b.count())) { problems.push(`${size.name}: no button matching ${re}`); return false; }
    await b.click().catch(() => {});
    await settle();
    return true;
  };
  const menu = async (label) => {
    await page.locator('.menu-btn__label').filter({ hasText: label }).first().click();
    await settle(420);
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot('title');

  const boot = async (save) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(([k, v]) => {
      localStorage.clear();
      localStorage.setItem(k, v);
    }, [keyFor(save), save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Press Start').click();
    await settle(450);
  };

  await boot(CHAMPION);
  await shot('menu');
  await menu('Challenge');
  await settle(450);
  await shot('challenge-entry');
  await tap(/Continue the career|See how it ended/i);
  await settle(700);
  await shot('championship');
  await tap(/^Continue$/i);
  await settle(700);
  await shot('season-summary');
  if (await tap(/jobs? on the table/i)) {
    await settle(700);
    await shot('job-offers');
  }

  // A coach mid-career, for the screens he actually lives in.
  await boot(MIDSEASON);
  await menu('Challenge');
  await settle(450);
  await tap(/Continue the career|See how it ended/i);
  await settle(800);
  await shot('hub');

  for (const [label, name] of [
    [/^Team$/i, 'roster'],
    [/Recruiting board/i, 'recruiting'],
    [/Career tracker/i, 'tracker'],
    [/^Statistics$/i, 'stats'],
  ]) {
    if (await tap(label)) {
      await settle(520);
      await shot(name);
      if (name === 'roster') {
        const row = page.locator('tr[role="button"]').first();
        if (await row.count()) {
          await row.click().catch(() => {});
          await settle(520);
          await shot('player');
          await tap(/^Back$/i);
          await settle(400);
        }
      }
      await tap(/^Back$/i);
      await settle(420);
    }
  }

  // The difficulty picker, from a clean start.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await settle(450);
  await menu('Challenge');
  await settle(450);
  await shot('challenge-intro');
  await tap(/Choose your difficulty|Start the climb/i);
  await settle(500);
  await shot('difficulty');
  if (await tap(/Compare all \d+/i)) {
    await settle(500);
    await shot('difficulty-compare');
  }

  await browser.newContext().then((c) => c.close());
  await ctx.close();
}

console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nNo problems.');
await browser.close();
