# Editing the league

Everything about the league lives in `src/data/`. Edit those files, restart the
dev server, and the schedules, standings, playoffs, team select screen and
generated rosters all follow automatically.

> Existing saves store the team you chose by id and your roster as real data. If
> you rename or remove a team id, saves referencing it are discarded safely on
> load rather than crashing. Bumping `CAREER_VERSION` in `src/league/types.ts`
> retires every old save at once, which is what you want after a structural
> change.

---

## Teams — `src/data/teams.ts`

The `TEAMS` array is the single source of truth. `validateLeague()` runs at
startup and warns in the console about duplicate ids, rivals that point at
nothing, and classes too thin to schedule.

One entry per programme:

```ts
{
  id: 'highland-park',        // stable key; used by saves, rivalries, schedules
  name: 'Highland Park',      // full name
  short: 'Highland Park',     // list/table name
  abbr: 'HP',                 // 2-4 chars, drawn on the scoreboard and badge
  mascot: 'Scots',
  classKey: 'a',              // 'a' | 'b' | 'c-east' | 'c-west' | 'd'
  placement: 'reported',      // 'reported' = THSLL said so; 'assumed' = our guess
  primary: '#3f6fd0',         // jersey shell
  secondary: '#f5d020',       // helmet + shoulder band
  trim: '#ffffff',
  identity: 'offense',        // drives AI tendencies and roster generation
  description: '…',           // one line, shown on the scouting report
  homeField: { name, venue, time, crowd },
  rivals: ['jesuit-dallas', 'esd'],
  overall: 89, offense: 93, defense: 85, goalie: 86,
  attack: 94, midfield: 89, faceoff: 83, speed: 87, chemistry: 90,
}
```

**Adding a team:** append an entry with a unique `id` and put it in a class.
Schedules are generated from class membership, so a class works with any number
of teams (odd counts get byes). Small classes automatically play a double round
robin so the season is not five games long.

**`placement` matters.** Set it to `'reported'` only when you have actually seen
the class stated on a THSLL page. It is surfaced in the Teams screen as "Class
confirmed" or "Class unverified", so a wrong value misleads the player.

**Ratings** run 50–99 and are gameplay values only. They feed two systems:

- Player generation. `attack` seeds the attackmen, `midfield` the middies,
  `defense` the poles, `goalie` the keeper, `faceoff` the FOGO. `speed` biases
  the whole roster and `chemistry` affects passing and per-game consistency.
- The season simulator, for games you don't play yourself.

`identity` gives a team a personality and picks its AI tactics
(`src/league/matchSetup.ts` → `tacticsFor`):

| identity | plays like |
| --- | --- |
| `offense` | dodges hard, crashes the crease |
| `defense` | packs it in, patient on offence |
| `transition` | pushes every groundball, aggressive marking |
| `goalie` | conservative, leans on the keeper |
| `faceoff` | wins possessions, pressures the ball |
| `balanced` | no strong tendency |

`rivals` is symmetric — listing B under A is enough. Rivalry games are
highlighted on the schedule, get a pregame banner, and pay an extra coaching
point when you win one.

---

## Classes and playoffs

`CLASSES` and `CLASS_ORDER` in `teams.ts` name the classes. THSLL also runs a
Sixes competition; it is a different format and is deliberately not modelled.

The playoff field scales with the class in `src/league/career.ts`:

```ts
export function playoffFieldSize(teamCount: number): number {
  if (teamCount >= 12) return 8;
  if (teamCount >= 6) return 4;
  return 2;
}
```

`advancePhase` derives the round names from the field size, so an 8-team field
plays QF → SF → F and a 4-team field plays SF → F with no other changes.

## Levels — `src/data/levels.ts`

The six tiers of the sport. A team's `overall` is a rating *within its own
level*; what turns that into a squad is the level's **player band**, which is
the range of actual attribute values its players are drawn from.

```ts
d1: { band: { lo: 74, hi: 99 }, rosterSize: 28, minDifficulty: 'allstate', crowdScale: 1.7, ... }
```

High school has `band: null`, meaning *identity* — high school ratings ARE the
player scale, and every other level is measured from it. Do not give high school
a band: Dynasty balance and every save in existence depend on it staying the
yardstick.

`minDifficulty` floors the AI's decision quality, so a professional opponent
genuinely thinks better rather than only having better numbers. `crowdScale`
sizes the stands. Run `npm run ladder` after any change: it prints the actual
player pools each level produces.

Because goalies are judged against `Match.par` — the average overall of the two
squads on the field — raising a band does **not** silently strangle scoring at
that level. Run `npm run levels` to confirm; it plays real matches at every tier
and prints goals, shooting and save percentages.

## The world — `src/data/world/programs.ts`

Compact tables of every programme above high school: id, name, mascot, abbr,
conference, `tier` (a within-level strength, 0–99), colours and region.

**Names and conference memberships are real (2026) but unverified from this
build environment. `tier` and every number derived from it are gameplay
fiction.** The Continental Lacrosse League is invented outright. The file states
all of this at the top; keep that header accurate if you edit it.

`src/data/world.ts` builds the world from those tables and validates it. Run
`npm run world` after editing: it checks that every conference exists, sits at
the right level, and has at least four teams — the fewest that can play a real
season.

## Season formats — `src/world/season.ts`

One engine for every level. A `SeasonFormat` says how many regular-season games
there are, how many are non-conference, how big the conference tournament and
national bracket are, and what the trophy is called. High school reproduces
exactly what the district already did.

## The ladder — `src/challenge/ladder.ts`, `situations.ts`, `state.ts`

`STAGES` is the nine rungs of Challenge Mode. `parWinPct` is roughly what a
competent coach manages there, and it feeds the expectations a programme holds
you to.

`SITUATIONS` are the starting problems. Each one has an `expectationRelief`
(how much easier the board is on you because of it) and an `applySituation`
that changes the roster you inherit. **The situation must be applied to the
roster, not to the team rating** — team ratings are derived from the roster, so
shifting both double-counts the problem and makes it permanent. Chemistry is the
one exception, because it does not live in any player.

`state.ts` holds reputation, heat and offers. `promotionReach` decides whether a
championship carries you one rung or two; without the two-rung path a nine-rung
ladder takes eighty seasons and nobody finishes it. Run `RUNS=10 npm run
challenge` after touching any of it.

## Scouting — `src/scouting/`

`prospects.ts` generates a class and hides it. The key idea is that `hype` (the
public ranking) is generated from a **shadow player at the slot he was ranked
in**, while the real player is generated from a much better or much worse slot.
That is what makes a hidden gem genuinely hidden rather than merely
underrated — and gems are weighted toward the back of the class, busts toward
the front, because nobody hides at number one.

`estimateOf` is what every screen renders. Never render `prospect.player`
directly; the truth is only visible once he signs.

`scouts.ts` sets what a scout costs and how fast he works. `recruiting.ts` runs
the weekly cycle: tips, scouting, rival interest, and commitments. The two
numbers that decide whether the whole system is worth using are the tip chance
(you cannot scout a player you have not heard of) and the rival `insight` rate
(how long your window is before somebody else finds him). Run `npm run
scouting` after changing either.

## Rosters — `src/data/rosters.ts`

Two kinds of roster, never mixed:

- **`official`** — names, numbers, positions and grades from a published source.
  Ratings are *always* generated: no public source publishes ratings, and
  inventing them and calling them official would be a lie.
- **`generated`** — the whole player is fictional. This is the fallback and what
  every team ships with today, because thsll.org is unreachable from this
  project's build environment.

To import a real roster, add one entry to `OFFICIAL_ROSTERS`:

```ts
'highland-park': {
  teamId: 'highland-park',
  source: 'https://thsll.org/team?id=4',
  retrieved: '2026-09-07',
  season: 2026,
  players: [
    { name: 'A. Player', number: 7, position: 'A', grade: 12 },
  ],
},
```

That is the whole change. `generateRoster` picks it up automatically, fills any
positions the source does not cover with generated players so the squad is
always legal, marks each player's `source`, and the UI switches from "Generated
roster" to "Real roster" on its own.

**The `season` field is enforced, not decoration.** This build plays
`TARGET_SEASON` (2026). League sites publish next season's team pages early, so
an entry with any other season — a 2027 page pasted in by mistake — is ignored
and the team stays on generated players. Startup logs the skipped import through
`validateLeague()`. To move the game to a later season, bump `TARGET_SEASON`
and re-import; do not relabel old data.

---

## Rosters and players — `src/data/players.ts`

Rosters are **generated**, not stored, for every team except yours. That keeps
saves small and means editing a team's ratings immediately changes its players.

- `ROSTER_SHAPE` sets the squad: 4 A, 7 M, 6 D, 2 G, 1 FOGO.
- `POS_PROFILE` shifts attributes by position (attackmen shoot, poles check).
- `WEIGHTS` decides how attributes roll up into an overall for each position.
- `softCap()` compresses the top of the scale so elite programs produce
  excellent players rather than a roster of identical 99s.
- Name pools live in `src/data/names.ts`.

To ship a real roster instead, replace `generateRoster(team, seed)` with a
lookup into your own data. Anything that produces `PlayerData[]` works.

Every generated player is fictional.

---

## Faceoffs — `src/match/faceoff.ts`

Two inputs, deliberately doing different jobs:

- **Your FOGO's rating** sets the width of the clamp window, scaled by the
  difference against the opponent's faceoff man. A specialist gives you a
  forgiving target; a poor one gives you a sliver.
- **Your timing** decides how close to the centre of that window you land.

The opponent rolls a clamp quality of his own from his rating, and the better
clamp wins; two poor clamps produce a scrum and a live ground ball at X. Perfect
timing wins comfortably at any rating — skill is what the player controls — but
against a much better FOGO a merely good clamp is a coin flip. `npm run balance`
prints the full table.

## Difficulty — `src/data/difficulty.ts`

Each profile tunes **AI decision quality only** — reaction delay, aim noise,
mark distance, slide trigger, shot selection, goalie reaction, check timing. The
AI never gets attributes the player cannot have. Keep it that way; it is the
difference between a hard game and a cheating one.

## Tactics — `src/data/tactics.ts`

The offensive and defensive styles you pick from the Team screen. These are read
directly by the match AI every frame, so changes here are felt in play.

## Field and feel — `src/data/constants.ts`

`FIELD` is the pitch geometry in yards (NFHS spec). `SIM` is the feel: speeds,
acceleration, friction, pass and shot velocity, check range, dodge, stamina,
shot clock. `GAME_LENGTHS` sets the three quarter lengths.

After changing anything in `SIM` or `src/match/`, run:

```bash
npm run balance
```

It plays full games headlessly at every difficulty and reports goals, shots,
shots on goal, save percentage, ground balls, turnovers and upset rates. Healthy
targets: **8–10 goals per game combined, a 60–65% save rate, 20–30 turnovers,
and no ties.**

`npm run human` measures the same engine from a player's seat, and
`npm run ai-audit` catches AI regressions (standing still, hugging the sideline,
sticking on the crease, ignoring loose balls). If you retune scoring, also
re-check `src/league/simulate.ts` — the season simulator is calibrated to
produce the same scorelines as a played game, and drifting apart makes the
standings describe a different sport from the one you played.

---

## Stadiums and emblems — `src/data/stadiums.ts`, `src/data/emblems.ts`

Neither file holds art. A venue is derived from the data a team already carries
(its `homeField` kind, crowd, colours and identity) and drawn by
`src/render/field.ts` from one architecture with four styles: `bowl`,
`grandstand`, `bleachers` and `complex`. To pin a specific look, add an entry to
`OVERRIDES` in stadiums.ts:

```ts
'highland-park': { style: 'bowl', pressBox: true, lightTowers: true, scoreboard: 'big' },
```

Emblems work the same way: `emblemFor(team)` builds an original mark from the
team's initials, colours and playing style, and `EMBLEM_OVERRIDES` pins a shape
or glyph. These are **original marks, not school logos** — nothing is fetched,
so there is no broken image and no empty logo box to design around.

---

## Weather — `src/render/weather.ts`

Five conditions, chosen from the venue's time of day and seeded from the match,
with a generated temperature. Only `rain` touches the simulation, through
`passAccuracy` and `footing`, and both sit within a few percent of 1 on purpose:
weather is atmosphere, and a game should never be decided by it.

---

## Coaching — `src/league/coaching.ts`

Five tracks, four levels, costs in `COSTS`. `coachEffects(staff)` turns a staff
into the numbers every other system reads: `offenseIQ` and `defenseIQ` go into
`src/match/ai.ts`, `developmentRate` and `breakoutRate` into development,
`staminaRate` into `Match.tickStamina`, and `appeal`/`retention` into transfers
and recruiting.

Retuning the pace of a dynasty is two numbers: `COSTS` here, and the Coach Point
award in `recordUserResult` (`src/league/career.ts`). A season currently pays
around twenty points, which is roughly one upgrade.

---

## Archetypes and curves — `src/data/archetypes.ts`

What kind of player somebody is (`ARCHETYPES`, which bias attributes at creation
and growth every offseason), when he improves (`CURVES`), and how high his
ceiling is in words (`TIERS`). `CURVES[*].weight` must sum to 1.

## Development projects — `src/league/projects.ts`

A season-long commitment to one player: a cost, a set of attributes it drives,
and a stated tradeoff. The tradeoff is real — development.ts suppresses growth
outside a project's focus to a quarter of normal.

## Development — `src/league/development.ts`

`BANDS` holds the overall-point value of each outcome; everything else scales
it by grade, headroom, playing time, production and coaching. Growth is applied
to the attributes that carry weight at the player's position (`positionKeys`),
which is what makes a jump show up in his overall — spreading points evenly
across all thirteen attributes does not.

Check any change with `npm run dynasty`, which prints the average gain, the
number of breakouts and the biggest jump for each season.

---

## Promotion and relegation — `src/league/promotion.ts`

`FLOWS` is the whole rulebook: which divisions exchange teams, and how many.
Every promotion is matched by a relegation, which is what keeps divisions the
same size year on year. A career stores its own class table in
`career.classOverrides`, so the data file's `classKey` is only the starting
position — read a team's current class with `effectiveClass(career, id)` and a
division's membership with `classMembers(career, key)`.

---

## Transfers — `src/league/transfers.ts`

`MARKET_SIZE`, `MAX_PITCHES` and `POS_CAP` shape the window; `interestIn()` is
the model. The playing-time term dominates deliberately, and `NEEDED` (starters
plus cover) decides whether a team is actually short at a position — measuring
need against the full squad shape is how a market ends up full of third-choice
goalkeepers.

---

## League statistics — `src/league/leagueStats.ts`

Other teams' player stats are derived from the schedule rather than stored, so a
save stays small and the tables never drift. Rosters are cached per season
because player IDs are not seeded: accumulating stats against one copy of a
roster and reading them back off another silently produces an empty
leaderboard.
