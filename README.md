# Lone Star Lax

**Play it: [lone-star-lax.vercel.app](https://lone-star-lax.vercel.app)**

An original retro arcade lacrosse game. Start in the **THSLL North District**,
play the games yourself, and — if you want the long version — coach your way from
the bottom of high school lacrosse to the professional game.

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

**Season** — a full district schedule, live standings, and a playoff bracket
ending in the class championship. Small classes play everyone home and away;
the playoff field is roughly the top half, so qualifying means something. Play
every game or simulate the ones you don't want.

**Dynasty** — the same season, run back year after year, built out of five
systems that feed each other:

- **The coach's office.** Coach Points buy staff across five tracks — offensive
  scheme, defensive scheme, player development, strength and conditioning, team
  culture — four levels each. A season is worth roughly one upgrade, so you
  choose what your programme is good at. The scheme tracks change how your side
  *thinks* in the match engine (spacing, cutting, slide timing, lane coverage);
  none of them inflate a rating.
- **Player development.** Growth depends on grade, headroom, playing time,
  production and coaching, and lands in bands you can read: breakout, strong,
  normal, limited, and the occasional step back for an older player at his
  ceiling who never got on the field. Young players with room make real jumps.
- **Transfers.** Eight players a window, each of whom left an actual situation —
  buried behind somebody better, on a losing team, wanting a bigger role. What
  decides their interest is the role they would have *here*, worked out against
  your depth chart. Three pitches a window, and they can commit, think it over,
  decline, or choose somebody else.
- **Promotion and relegation.** Win your division and go up; finish at the
  bottom and go down. Promotions and relegations are matched one for one, so
  every division stays the size it was, and every move comes with its reason.
- **Statistics.** Team totals, your full squad's lines, and district
  leaderboards for points, goals, assists, saves and ground balls.

**Challenge** — one coaching career, nine rungs, from Class D high school to the
Premier Lacrosse League. This is the long game.

- **You climb by winning championships.** Nothing else moves you up, and even a
  title only gets you *interviews*: which jobs you are offered depends on the
  reputation you have built, and taking one is a decision. A coach with a real
  name in the sport gets offered something *two* rungs up as well — a smaller
  job at a much higher level, against a bigger job at the next one.
- **Every job is a mess, and the mess is real.** A rebuild genuinely hands you a
  squad of underclassmen; a goalie problem genuinely means the man in the cage
  cannot stop the ball. The situation is applied to the roster you inherit, and
  it lowers what the programme expects of you — you are not sacked for failing
  to win with a roster that cannot win. What it costs you is *time*.
- **Each rung is harder because the players are better.** Every level maps its
  teams onto a higher band of actual attributes (D-III 62–93, D-I 74–99, PLL
  84–99), carries deeper squads, and floors the AI's decision quality. A
  professional opponent genuinely thinks better than a high schooler.
- **You can be sacked.** Three seasons below what the programme wanted and you
  are out: down a rung, the recruits you were chasing gone, starting again. Two
  years without a job and the career is over.
- **Legacy.** Championships weighted by how hard they were to win, how far you
  climbed, the players you found and developed, and the years you gave it.

**Recruiting and scouting** — a class runs alongside every season, in every mode.

- **You never see a prospect's real rating.** You see the public ranking, which
  is *wrong*, and your own estimate with an error bar around it. Scouting slides
  the estimate off the ranking and onto the truth.
- **Hidden gems are genuinely hidden.** Around 7% of a class belongs near the top
  and is ranked in the middle, because nobody has watched him. Another 7% is the
  same mistake pointing the other way. You cannot scout a player you have never
  heard of — a scout has to *tip* you, and a scout with an eye for a sleeper is
  the only reliable way that happens.
- **Scouts are hired, and they cost the same Coach Points as your staff.** They
  have a specialty, a quality and a trait; a programme that scouts brilliantly
  coaches worse unless it is winning enough to afford both.
- **Rivals recruit for real, mostly off the rankings.** A well-resourced
  programme scouts too and will eventually see through one — but it takes them
  most of a cycle. That window is the whole game. Leave a gem alone and roughly
  a third of the time somebody else takes him.
- **Offers are scarce** (three at high school, seven at Division I) and a
  prospect ranked far above your programme is not listening.
- **The board** sorts into Top Targets, Hidden Gems, Being Scouted, Offers Out,
  Recruiting Battles and Committed, filterable by position, with a full written
  scouting report and a breakdown of exactly what he is weighing about you.
- **The professional draft** spends picks instead of offers, and the players
  nobody took are undrafted free agents you can sign with a camp invite.

**Player development** — every player has an archetype, a development curve and
a hidden work rate. An early developer arrives close to finished; a late bloomer
looks ordinary for two years and then jumps. **Development projects** commit one
player for a season: they cost Coach Points, concentrate his growth into named
attributes, and suppress everything outside them. Each player carries the history
of what every offseason actually did to him.

**Practice** — five drills: Shooting Gallery, Faceoff Reps, Clearing & Passing,
Defensive Stand, and open Free Play.

**Goal replays** — every goal plays a short broadcast-style highlight: letterbox,
ball trail, slow motion for the finish, a camera that pushes in on the cage, and
the scorer and assist on screen. Skippable, and switchable off in Settings.

**How to Play** — an interactive walkthrough that teaches movement, passing,
dodging, shooting and checking during a live scrimmage.

**Stadiums and weather** — every programme has its own ground, built from one
reusable architecture: stands sized to the crowd, benches and a scorer's table,
a branded scoreboard behind the end line, a mark at midfield and the programme's
name painted across the end zone. Crowds scale with the level, so a PLL stadium
is not a school field. Conditions run from clear afternoons to rain under the
lights and shift with the region — a spring game in the northeast is greyer,
wetter and thirteen degrees colder than one in Texas. Only light rain touches
the simulation, and only barely.

**News** — the hub carries a feed of what is actually happening: results,
streaks, upsets, a player who has just taken a jump, a scout's report, a job in
danger. Every line is *derived* from the save, so it can never tell you
something that did not happen.

---

## Controls

Movement lives under the left hand and every action under the right, so you can
hold a direction and act at the same time.

| Keyboard | |
| --- | --- |
| `W A S D` / arrows | Move |
| `Shift` | Sprint (burns stamina) |
| `J` / `Space` | Pass with the ball · Check without it · Clamp at the faceoff |
| `K` / `F` (hold) | Charge a shot; release to fire. Push toward the post you want |
| `L` / `E` | Dodge |
| `I` | Call for a screen |
| `O` / `Tab` | Switch to whoever can reach the ball first |
| `Esc` / `P` | Pause |

**Every one of these is rebindable**, in Settings or from the pause menu without
leaving the game. Taking a key that another action holds moves it, and nothing
can be left unbound. The hint strip, the faceoff prompt, How to Play and the
walkthrough all read whatever you have set.

**Pause** gives you Resume, Simulate a quarter, Game settings, Controls and the
live box score, so you never have to quit a game to look something up.

**Touch:** drag anywhere on the field to move (push to the edge to sprint), with
PASS / SHOOT / DODGE / SWITCH buttons and a SCREEN pill above them. On a phone
in portrait the camera rotates so you play up and down the field.

---

## How the game works

The match is a real simulation, not a dice roll:

- **Ball physics.** The ball is a separate entity with its own velocity, arc and
  bounce. Passes lead the receiver, can be intercepted in flight, and go loose
  if nobody catches them.
- **Shooting.** Charge time sets power. Accuracy falls off sharply with
  distance, defensive pressure and sprinting — a good look is genuinely on
  frame, a forced one sprays. Steering across the goal mouth picks your corner,
  and an aim line shows exactly where the shot is going. Low-charge shots skip
  off the turf.
- **Switching.** The switch button ranks your squad by time-to-reach — distance,
  top speed and which way each man is already running — against where the ball
  is going to be. It never takes the ball off your own carrier.
- **Goalies.** A keeper positions on the arc, has a genuine reaction delay, and
  covers part — never all — of the cage. Picking a corner beats him; forcing him
  to move first beats him more often. League-wide save rate lands near 50%.
- **Defence.** Man marking with help slides, timing-based checks, and real
  consequences for missing one.
- **Faceoffs.** Your FOGO's rating sets how wide the clamp window is; your timing
  decides how well you hit it. A specialist is worth having, but the draw is
  yours to win.
- **Screens.** Call for one and the best-placed team-mate comes over, plants on
  your defender's shoulder and holds it. A defender fighting through is slowed,
  never stopped: it buys a step, not a goal.
- **Superstars.** A player at 86 overall wears a star, 90 an elite pair —
  roughly one a squad and a handful in the district. Defences mark them tighter
  and slide to them sooner.
- **Simulating a quarter.** The pause menu can hand the rest of a quarter to the
  bench. It runs the same engine from the same game state with both sides on AI,
  then gives it back: the stats are real because the quarter was really played.
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

`npm run dynasty` plays a programme through eight seasons headlessly and prints
what each system produced: development spread and breakouts, league movement,
staff spending, transfer outcomes, district leaders and squad strength. Use it
after touching anything in `src/league/`.

`npm run ratings` prints the league-wide overall distribution, which is what the
star and elite thresholds are calibrated against.

`npm run levels` runs the real match engine at every tier and prints what a game
looks like there. This is the check that stops the ladder quietly inverting:
before goalies were judged against the standard of the game they are playing in
rather than an absolute number, scoring *fell* as the level rose, because keepers
improved faster than shooters. Current output is 7–10 goals a game at every rung
with shooting around 26–32% and saves around 50–57%.

`npm run challenge` runs a whole Challenge career headlessly — every season, job
offer, sacking and championship — and `RUNS=10 npm run challenge` samples ten of
them. Across sixty simulated seasons a coach averages the fifth rung of nine and
about one in ten reaches the PLL, which is roughly the intended difficulty for a
player who simulates rather than plays.

`npm run scouting` measures the recruiting model: how often a ranking is wrong,
how fast scouting closes the gap, what a class looks like with none, one, three
and five scouts, and how many gems the AI takes if you ignore them.

`npm run world` validates the 243-team world — every conference is the right
level and big enough to play a season — and `npm run ladder` prints the actual
player pools each level produces.

`npm run test:dynasty` drives a browser through two whole years — preseason
staff and tactics, a played game, a simulated quarter, statistics, the playoffs,
development, league movement and the transfer window — and checks that every
stage actually did something. It is what caught a game simulated to its final
whistle never reaching the post-game screen.

`npm run test:challenge` drives a browser through a Challenge career: the ladder,
taking the first job, hiring a scout, working a class, playing a season out, the
end-of-season verdict, and the career tracker.

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
  data/      teams, rosters, players, ratings, difficulty, tactics, constants
  match/     the simulation: Match, ai, faceoff, formation, commentary, replay
  render/    canvas renderer, camera, pixel sprites, field layer, particles
  input/     unified keyboard + touch input
  audio/     Web Audio synthesis (no sound files)
  world/     season formats: conference tournaments, national brackets, auto-bids
  challenge/ the nine-rung ladder, starting situations, job offers, legacy
  scouting/  prospects and fog of war, scouts, the recruiting class
  league/    schedules, standings, playoffs, simulation, career progression
  ui/        DOM screens and the design system
  dev/       headless balance, human-proxy and AI audit harnesses
scripts/     browser end-to-end and feature-audit suites
```

Gameplay renders to a low-resolution pixel buffer that is upscaled with
nearest-neighbour filtering; menus and HUD are DOM so text stays crisp and
responsive at any size.

---

## Data and attribution

The league is modelled on the **THSLL North District** and its real class
structure: Class A, Class B, Class C East, Class C West and Class D. The
district also runs a Sixes competition; that is a different format and is
deliberately not modelled, because this game simulates the field game.

**The wider world.** Above high school the game carries 203 further programmes
across NCAA Division III, II and I, a fictional semi-professional league, and the
eight Premier Lacrosse League clubs. **Programme names and conference
memberships are real (2026) but unverified from this build environment**;
everything else about them — every rating, every player, every rivalry, the
prestige numbers and the venues — is invented gameplay data. The Continental
Lacrosse League is invented outright and does not correspond to any real
competition. See
[`src/data/world/programs.ts`](src/data/world/programs.ts), which states all of
this at the top of the file.

What is taken from THSLL is the class structure and the set of member
programmes. **Which class each programme sits in is best-effort** — every team
carries a `placement` field recording whether the class was reported by THSLL or
is our assumption, and the Teams screen shows it. Verify against
[thsll.org](https://thsll.org) and edit
[`src/data/teams.ts`](src/data/teams.ts); nothing else needs touching.

Everything else is invented for gameplay: **all ratings are fictional balance
values**, team colours are chosen for on-field readability rather than official
branding, and rivalries are gameplay rivalries rather than historical claims.

**Rosters.** The game distinguishes two kinds of roster. `official` means the
names, numbers, positions and grades came from a published roster — ratings are
*always* generated, because no public source publishes them. `generated` means
the whole player is fictional. **Every team currently ships `generated`**, and
says so in the Teams and Team screens: thsll.org is unreachable from this
project's build environment, so no roster has been verified. Importing one is a
data-only change to [`src/data/rosters.ts`](src/data/rosters.ts).

The game plays the **2026** season (`TARGET_SEASON`). Every import carries the
season it was taken from, and one from any other season is ignored rather than
used — league sites publish the following season's pages early, and a 2027 squad
is not this game's league.

See [docs/EDITING-DATA.md](docs/EDITING-DATA.md) to change teams, ratings,
rosters or difficulty.

This game is not affiliated with, endorsed by, or sponsored by the Texas High
School Lacrosse League or any school.
