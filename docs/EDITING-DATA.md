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

The `TEAMS` array is the single source of truth. One entry per program:

```ts
{
  id: 'highland-park',        // stable key; used by saves, rivalries, schedules
  name: 'Highland Park',      // full name
  short: 'Highland Park',     // list/table name
  abbr: 'HP',                 // 2-4 chars, drawn on the scoreboard and badge
  mascot: 'Scots',
  division: 'd1',             // 'd1' | 'd2' — see DIVISIONS
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

**Adding a team:** append an entry with a unique `id` and put it in a division.
Schedules are generated from division membership, so a division works with any
number of teams (odd counts get byes).

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

## Divisions and playoffs

`DIVISIONS` in `teams.ts` names the divisions. The bracket size lives in
`src/league/career.ts`:

```ts
career.playoffSeeds = standingsSorted(career).slice(0, 8).map((r) => r.teamId);
```

Change `8` to resize the field. `createRound` pairs top against bottom, and
`advancePhase` walks QF → SF → F, so a 4-team bracket simply starts at the
semifinals once you also trim the round list.

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
targets: **7–12 goals per game combined, 45–55% save rate, 20–30 turnovers,
no ties.**
