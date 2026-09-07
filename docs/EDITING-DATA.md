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
roster" to "Real roster" on its own. Record the season you took it from — rosters
turn over every year.

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
