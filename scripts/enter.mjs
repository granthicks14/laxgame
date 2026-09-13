/**
 * GETTING INTO A SPORT FROM THE HUB
 *
 * Every browser suite used to start the same way: open the page, press start,
 * you are in lacrosse. The hub put two screens in front of that — Play Now, then
 * a sport to choose — and a sport is now a separate download, so "the menu is on
 * screen" is something to wait for rather than assume.
 *
 * One helper, so a change to the hub's front door is one edit rather than nine.
 */

/** Which card to click, by the name on it. */
const CARD = {
  lacrosse: 'Lacrosse',
  basketball: 'Basketball',
};

/**
 * Walk from a freshly loaded page to a sport's own main menu.
 *
 * @param page       a Playwright page already at the base URL
 * @param sport      'lacrosse' | 'basketball'
 * @param opts.title the topbar title to wait for, so the suite does not race the
 *                   dynamic import.
 * @param opts.tap   drive the hub by touch rather than mouse.
 */
export async function enterSport(page, sport = 'lacrosse', opts = {}) {
  const name = CARD[sport];
  if (!name) throw new Error(`enterSport: unknown sport "${sport}"`);

  // The touch suite must ARRIVE by touch: a tap that the hub mishandles is
  // exactly the kind of bug it exists to catch, so it must not be clicked past.
  const hit = async (locator) => (opts.tap ? locator.tap() : locator.click());
  await hit(page.getByRole('button', { name: /^Play Now$/i }).first());
  await page.waitForTimeout(220);
  await hit(page.locator('.sport-card__name').filter({ hasText: name }).first());

  // The sport's chunk is fetched here. Wait for its menu, not for a timer.
  await page.locator('.menu-btn').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(150);
  if (opts.title) {
    await page.locator('.topbar__title').filter({ hasText: opts.title }).first()
      .waitFor({ state: 'visible', timeout: 5000 });
  }
}

/** Back to the hub's front door from anywhere inside a sport's menu. */
export async function backToHub(page) {
  await page.locator('.hub-back').first().click();
  await page.locator('.hub-mark__sports').waitFor({ state: 'visible', timeout: 5000 });
}
