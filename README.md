# Lone Star Lax

**Play it: [lone-star-lax.vercel.app](https://lone-star-lax.vercel.app)**

An original retro arcade lacrosse game set in the **THSLL North District**. Pick a
North Texas program, play the games yourself, and build it into a champion.

Runs entirely in the browser. No accounts, no servers, no paid APIs, no asset
downloads — everything from the pixel field to the crowd noise is generated in
code.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the production build
```

`dist/` is a plain static site with no server component. The build uses relative
asset paths, so it also works from a subdirectory or straight off the filesystem.

Requires Node 18+.

### Deploying to Vercel

The repository is already linked to a Vercel project and every push rebuilds it.
`vercel.json` pins the settings (framework `vite`, `npm ci`, `npm run build`,
output `dist`) and adds immutable caching for hashed assets.

To deploy your own copy, import the repository at
[vercel.com/new](https://vercel.com/new) — no further configuration needed — or
from the command line:

```bash
npx vercel        # preview deployment
npx vercel --prod # production
```

The whole game is static: no functions, no environment variables, no external
services, and it fits comfortably in Vercel's free Hobby tier.

> The linked project's production branch is currently
> `claude/retro-lacrosse-game-32i9po`, since that is the only branch in the
> repository. Once this is merged, point the project at your default branch in
> **Project → Settings → Git**.

---

## What's in it

**Play Now** — any two North District teams, home or away, four difficulty
levels, three game lengths.

**Season** — a full round-robin district schedule, live standings, and an
eight-team playoff bracket ending in the district championship. Play every game
or simulate the ones you don't want.

**Dynasty** — the same season, run back year after year. Players develop and
graduate, recruits arrive, your program's reputation decides how good they are,
and the rest of the league drifts around you.

**Practice** — five drills: Shooting Gallery, Faceoff Reps, Clearing & Passing,
Defensive Stand, and open Free Play.

**How to Play** — an interactive walkthrough that teaches movement, passing,
dodging, shooting and checking during a live scrimmage.

---

## Controls

| Keyboard | |
| --- | --- |
| `W A S D` / arrows | Move |
| `Shift` | Sprint (burns stamina) |
| `Space` | Pass with the ball · Check without it · Clamp at the faceoff |
| `F` (hold) | Charge a shot; release to fire. Your movement direction picks the corner |
| `E` | Dodge |
| `Tab` | Switch defender |
| `Esc` / `P` | Pause |

**Touch:** drag anywhere on the field to move (push to the edge to sprint), with
PASS / SHOOT / DODGE / SWITCH buttons. On a phone in portrait the camera rotates
so you play up and down the field.

---

## How the game works

The match is a real simulation, not a dice roll:

- **Ball physics.** The ball is a separate entity with its own velocity, arc and
  bounce. Passes lead the receiver, can be intercepted in flight, and go loose
  if nobody catches them.
- **Shooting.** Charge time sets power, and accuracy falls off with distance,
  defensive pressure and running speed. Low-charge shots skip off the turf.
- **Goalies.** A keeper positions on the arc, has a genuine reaction delay, and
  covers part — never all — of the cage. Picking a corner beats him; forcing him
  to move first beats him more often. League-wide save rate lands near 50%.
- **Defence.** Man marking with help slides, timing-based checks, and real
  consequences for missing one.
- **Faceoffs.** Your FOGO's rating sets how wide the clamp window is; your timing
  decides how well you hit it. A specialist is worth having, but the draw is
  yours to win.
- **Rules that matter.** Faceoffs, crease, offsides, shot clock, and backing up
  a missed shot over the end line.

**Difficulty changes AI decision quality, never its attributes.** Higher levels
react sooner, aim better, slide smarter and pick better shots. Nothing cheats.

### Tuning and testing

`npm run balance` runs the whole engine headlessly across every difficulty and
prints goals, shots, save percentage, ground balls, turnovers, upset rates, how
spread out the AI keeps its shape, and faceoff win rates by timing precision. Use it after touching anything in
`src/match/`. Current output sits around 10–12 goals per game combined, a ~50%
save rate, ~30 shots and no ties.

`npm run test:e2e` drives a real browser through the title screen, a quick game,
a full season and playoff bracket, a dynasty offseason, a save reload, the
practice drills, phone and tablet layouts, and a frame-rate check. Playwright is
deliberately not a project dependency — install it only when you want to run the
suite:

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npm run preview &
npm run test:e2e
```

---

## Project layout

```
src/
  core/      seeded RNG, math, safe localStorage, event emitter
  data/      teams, players, ratings, difficulty, tactics, field constants
  match/     the simulation: Match, ai, faceoff, formation, commentary
  render/    canvas renderer, camera, pixel sprites, field layer, particles
  input/     unified keyboard + touch input
  audio/     Web Audio synthesis (no sound files)
  league/    schedules, standings, playoffs, simulation, career progression
  ui/        DOM screens and the design system
  dev/       headless balance harness
scripts/     browser end-to-end suite
```

Gameplay renders to a low-resolution pixel buffer that is upscaled with
nearest-neighbour filtering; menus and HUD are DOM so text stays crisp and
responsive at any size.

---

## Data and attribution

School names and division groupings follow the **THSLL North District** as a
best-effort snapshot — league membership changes season to season, so verify
against [thsll.org](https://thsll.org) and edit
[`src/data/teams.ts`](src/data/teams.ts) to match the current year.

Everything else is invented for gameplay: **all ratings are fictional balance
values**, every player is generated and does not represent any real athlete, and
team colours are approximations chosen for on-field readability rather than
official branding. Rivalries are gameplay rivalries, not historical claims.

See [docs/EDITING-DATA.md](docs/EDITING-DATA.md) to change teams, ratings,
rosters or difficulty.

This game is not affiliated with, endorsed by, or sponsored by the Texas High
School Lacrosse League or any school.
