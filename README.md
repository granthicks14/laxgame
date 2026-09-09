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
Premier Lacrosse League, in three chapters: **high school** (Class D → C → B →
A), **college** (D-III → D-II → D-I) and **professional** (semi-pro → PLL).
Winning the last rung of a chapter completes that chapter and opens the next
job market. **There is exactly one ending, and it is the PLL championship** —
`npm run stages` asserts that across all 360 combinations of rung, result and
hot seat. This is the long game. It is the **same career engine
as Dynasty** — every offseason system, the transfer window, recruiting,
scouting, development, staff, statistics and the record book — plus the ladder
on top. Nothing is missing because the mode is called something else; `npm run
checklist` prints the compatibility table and `npm run modes` proves it by
driving a full season and offseason in each.

- **You climb one level at a time, and never more.** Winning Division III opens
  Division II jobs and nothing above them. There is no path that skips a rung,
  by reputation or otherwise — `npm run stages` asserts it across every rung at
  every reputation, for promotions, demotions and rehires alike, because a
  skipped level is invisible in a screenshot and the climb is the entire mode.
- **A championship gets you interviews, not a promotion.** Which jobs depends on
  the reputation you have built, and taking one is a decision: the strongest
  programme in the list is reliably the one in the deepest trouble.
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
  years without a job and the career is over. *(Since the scoring rewrite a
  well-run programme wins more, so sackings have become rare and the ladder
  climbs faster — see the note under Tuning and testing.)*
- **Legacy.** Championships weighted by how hard they were to win, how far you
  climbed, the players you found and developed, and the years you gave it.
- **Every rung is genuinely playable.** Not simulation-only: 267 programmes
  across six levels, each with ratings, an identity, a conference, a home
  ground, a generated roster and a schedule. You can press Play on a Division
  III fixture and the match engine loads two real college squads.
  `npm run stages` proves it rung by rung — 266 checks, including one fixture
  per level run through the actual engine.

| Level | Programmes | Conferences |
| --- | --- | --- |
| THSLL district | 40 | 5 classes |
| NCAA Division III | 107 | 13 |
| NCAA Division II | 34 | 6 |
| NCAA Division I | 66 | 10 |
| Continental Lacrosse League | 12 | 2 |
| Premier Lacrosse League | 8 | 1 |

**Four difficulties, chosen once before the first job.** They are not a bonus on
the opposition's rating — no tier gives a rival programme a player, a point of
rating or a resource you do not have. What changes is DECISIONS and RESOURCES.

| | Standard | Elite | Impossible | Final |
| --- | --- | --- | --- | --- |
| Coach Points earned | 100% | 82% | 64% | 50% |
| Coach upgrade cost | 100% | 130% | 170% | 215% |
| Rival recruiting effort | 100% | 125% | 155% | 190% |
| Rival scouting accuracy | 35% | 55% | 75% | 92% |
| Transfer resistance | none | −6 | −13 | −20 |
| Rivals per transfer | — | +1 | +2 | +3 |
| Player development | 100% | 92% | 84% | 76% |
| Quality of jobs offered | standard | −12pts | −24pts | −34pts |
| Legacy multiplier | 1.0× | 1.35× | 1.8× | 2.4× |

That table is not written down twice. The difficulty screen, the comparison
screen and the simulation all read the same `MODIFIER_SPECS` list in
`src/challenge/difficulty.ts`, so the game cannot tell you one thing and do
another. Tapping a tier answers one question — *what makes this harder than the
tier below it?* — with every modifier it changes, signed and quantified.

On the harder tiers the coach tree **cannot be finished**, which is the point:
you have to decide what kind of coach you are. The office reads back the
identity your spending has actually formed — The Scout, The Recruiter, The
Developer, The Strategist — rather than leaving it implicit.

**One rating scale for the whole sport.** A team's `overall` used to be a
standing *within its own level*, which is why a Division I team could be rated
94 while a PLL club was 88. Every level now occupies a fixed slice of one
universal scale — high school 40-80, D-III 55-83, D-II 65-87, D-I 75-92,
semi-pro 80-94, PLL 88-99 — and a programme's standing among its own peers
decides where in that slice it lands. The slices overlap on purpose, because
reality does; what is never allowed is a level reaching past its neighbour.
`npm run hierarchy` builds every team and every roster at every level and fails
the run on any inversion.

**The coach is one person for the whole career.** Everything he has earned lives
in `career.coach` — a `CoachProfile` held on the save beside the career, never
inside a team's data — and it *never* resets when he changes jobs. His Coach Points,
his experience and level, his career record, his championships, every programme
he has run and every upgrade he owns travel with him from Class D to the PLL.
Only the programme changes: a new roster, a new division, a new set of problems,
and a staff he has to build again.

- **His own upgrade tree**, 25 upgrades over five branches (Scouting, Recruiting,
  Transfers, Development, Sideline), gated by *both* Coach Points and coach
  level, and with prerequisites inside each branch. It is deliberately longer
  than one climb: a career that spends everything on it still finishes around
  level 11–12 after thirty seasons, and nothing in it is a label with no effect —
  every perk is read by the system it belongs to.
- **Levels and titles.** Experience comes from playing, winning, and finishing
  seasons; twelve levels run from *Volunteer Assistant* up.
- **The record follows him.** Wins, losses, titles, seasons, and the list of
  programmes he has coached, each with the years he was there and what he did.

**Pitching a transfer** — an approach is an *angle*, not a button. Ten of them
(Immediate Playing Time, Championship Opportunity, Starting Role, Player
Development, Better Coaching, Program Prestige, Team Culture, Fresh Start,
Bigger Role, System Fit), each worth something to some players and nothing to
others: a player buried on a depth chart wants to hear that he will play, not
about your culture. The fit is worked out from *his* situation and shown before
you commit to it, the angle he has already heard is worth much less the second
time, and the Transfers branch of the coach tree buys extra approaches, extra
targets, full portal reports and more persuasive pitches.

**The postseason** — qualifying is a screen, once: your record, your seed, your
conference, the bracket you are in and who you play first. The bracket then
**opens itself** the day it is drawn. It shows every game in the tournament with
your team marked, and — this is the point — **it does not shut when you are
knocked out**: the rounds reveal one at a time, so a coach whose season ended in
the quarter-finals can still follow the tournament through to a champion.

**Records are checked against the schedule.** The schedule is the source of
truth. Every result is written to both teams' rows (with the conference split
kept separately, because that is what seeds a conference tournament), and
`validateRecords` re-derives every row from the played fixtures after every game
and on every load — so wins + losses + ties always equals games played, and a
save written by an older build repairs itself instead of drifting.

**Game stories** — a simulated result comes back with one line about what the
game *was*: a comeback, a goalie stealing it, a shootout, a rock fight, an upset.
Every word of it is derived from that game's own box score — the quarter-by-
quarter run of play, the shooting, the saves, the faceoffs — so a story can never
describe a game that did not happen, and a game you played by hand gets no story
at all rather than one about a different game.

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

**The transfer window, by level** — the same machinery, called what each level
actually calls it. High school has player movement between schools; a college
has the portal, and **your own players can enter it** — a man with years left
and no path to the field leaves, and the culture track in the coach's office is
what keeps him; the professional levels have free agency. Ratings on a target
are your own estimate with an error bar: a player you have faced this season is
a known quantity, one from across the league is a report, and your scouting
staff narrows the gap.

| Level | Window | Approaches | Pool | Your players can leave |
| --- | --- | --- | --- | --- |
| High school | Player movement | 3 | 8 | no |
| D-III / D-II | Transfer portal | 4 | 12 | yes |
| D-I | Transfer portal | 5 | 14 | yes |
| Semi-pro / PLL | Free agency | 3–4 | 8–10 | yes |

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

## Simulated games

A game the coach does not play is not a random number in the right range. It is
played out in four steps, the same four that decide a real one:

1. **Possessions.** Faceoffs, pace, both sides' style and turnovers decide how
   many times each team gets the ball.
2. **Shots.** Offensive quality against defensive pressure decides how often a
   possession ends in a shot, and how many of those are on frame — minus
   whatever the rain and the wind take off.
3. **Quality.** A shot against a packed crease is not a shot on the break, and a
   greedy offence takes worse ones than a patient one.
4. **The goalie.** Save percentage is driven by his rating measured against the
   level he plays at, and it is the sharpest lever in the model: across four
   hundred games between otherwise identical teams, a 65-rated keeper concedes
   **10.5** a game and a 99-rated one concedes **5.3**.

**The box score comes out of those steps**, so saves always equal shots on goal
minus goals, faceoffs always equal goals plus the period starts, and no player's
line can disagree with the scoreboard. `npm run scoring` checks every one of
them: 2,395/2,395 box scores agree with their scoreline.

Results respond to the things that should move them, and only those:

| Matchup (Division I, 400 games each) | Average |
| --- | --- |
| Even teams | 6.6–6.7 |
| Elite offence against a weak defence | 11.2–6.5 |
| Two elite defences | 5.2–4.8 |
| One elite keeper against a poor one | 9.3–5.2 |
| Extreme mismatch | 15.3–3.6 |
| Fast break against a packed defence | 9.1–8.0 |
| Heavy rain and wind | 7.5–7.2 (8.9–8.2 in perfect conditions) |
| District champion against the bottom club (high school) | 22.2–4.9 |

**A note on the size of the numbers.** Each level is calibrated separately, and
a *played* game is the ground truth: whatever the simulation says has to be a
game you could have played, or the league table is a lie. Across all six levels
simulated and played results now agree within 4%. But the game's quarters are
2–4½ minutes, not the 12–15 of a real match, so scorelines are compressed
against real-world ones however realistic the *shape* is. **Long quarters get
closest**: a PLL game reads about 12–12, semi-pro 11–11, Division II 10–10.
Division I comes out as the most defensive level in this engine — better
defenders everywhere genuinely suppress the game — which is a known limitation
rather than a target.

`npm run scoring` reports goals, shots, shooting and save percentages,
possessions, overtime and blowout rates for every level; `npm run levels` runs
the same measurements through the real match engine, which is how you tell
whether the two still agree. **Settings → Simulation details** turns on a
per-game breakdown on the schedule screen — possessions, shots, shooting
percentage, saves, ground balls, turnovers and faceoffs — for working out why a
scoreline looks wrong.

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
them.

`npm run stages` walks all nine rungs of the ladder: it checks the league data
exists, plays one fixture through the **real match engine** using the same
config the Play button builds, plays the season out through the playoffs to a
champion, runs the offseason, and confirms that winning **promotes** the coach
rather than ending the career. It also runs the ending invariant exhaustively.
It is what caught the bug where taking a college job destroyed the save on the
next load, because save validation only knew about the forty high schools.

**Known balance shift.** The possession model rewards a rating edge more steeply
than the formula it replaced, so a coach who spends Coach Points well and
develops his squad now wins considerably more. Across eight simulated careers of
45 seasons the average coach reaches the seventh rung of nine, six of eight
reach the PLL (in 15–45 seasons), and *nobody was sacked*. Before the rewrite it
was the fifth rung, one in ten reaching the PLL, and about one sacking a career.
The climb is more satisfying and the failure consequence has stopped biting.
If you want the old difficulty back, the levers in order of bluntness are
`parWinPct` in `src/challenge/ladder.ts` (what a programme expects),
`promotionFloor` in `src/challenge/state.ts` (the reputation needed before the
next rung will interview you), and the response slopes in `shotRateFactor` and
`onGoalFactor` in `src/league/simulate.ts` — the last of which would also move
the matchup table above, so measure with `npm run scoring` before and after.

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

`npm run test:ladder` proves the two things nothing else can, in a real browser:
that winning the top high school championship completes a *chapter* and opens the
college job market rather than ending the career, that a Division I title does
the same, and that the PLL championship — and only the PLL championship — reaches
the final completion screen. It also presses Play on a Division III fixture and
checks that two real college squads load into the match engine. The saves it
starts from are generated by the game's own code at run time, so the fixtures
cannot go stale against the save format.

`npm run modes` drives a full season and offseason in Dynasty (high school),
Challenge (high school) and Challenge (Division I) and asserts that all 35
career systems produced a real result in each — 105 checks. Dynasty and
Challenge are the same engine, and this is what stops a feature quietly working
in one and not the other. It caught the offseason emptying the squad it was
about to refill.

`npm run checklist` prints the mode compatibility table and what each level gets.

`npm run careers` is the Challenge Mode stress test. It sweeps **all four
difficulties** over the same seeds and the same six spending strategies (a coach
who buys everything, one who buys nothing, one who only recruits, one who
changes job at every opportunity), so a difference between tiers is the
difficulty and nothing else. It re-derives the record from the schedule after
**every game**, checks the standings, the squad shape, the bracket and the
coach's profile across every job change, prints how many seasons a career spends
at each rung, and FAILS if a harder tier climbs further or buys more of the coach
tree than an easier one. It is what caught the offseason cutting every goalie on
the roster, the transfer window stripping the midfield to two, and a coach's
upgrades being halved when he changed programme.

Measured over eight careers per tier, fifty seasons each:

| tier | reached the PLL | seasons to finish | avg rung | coach upgrades | sackings | battles lost |
| --- | --- | --- | --- | --- | --- | --- |
| Standard | 5/8 | 33.8 | 8.1 | 17.9 | 0.1 | 18 |
| Elite | 5/8 | 35.6 | 7.9 | 16.4 | 0.4 | 27 |
| Impossible | 3/8 | 42.0 | 7.3 | 12.4 | 0.6 | 42 |
| Final | 1/8 | 47.0 | 6.3 | 10.4 | 1.0 | 61 |

Every measure moves the right way, and Final is genuinely finishable rather than
a wall. Those are figures for a crude automated coach that recruits and trades
mechanically — a person who plays the systems well finishes considerably faster.

`npm run hierarchy` builds every team and every roster at all six levels and
prints the team and player rating distribution for each, then fails the run if
the hierarchy inverts anywhere — an average Division I team above an average PLL
club, a level reaching past its neighbour, or a level outside its own band. It is
the guard on the universal rating scale.

`npm run abuse` does the things a real save eventually does anyway: it tampers
with a record, deletes a standings row mid-season, throws away the coach's
profile, spends points that are not there, changes job five times in a row, and
asks for a bracket that does not exist. Nothing may throw and nothing may
silently corrupt the career.

`npm run stories` prints how often each kind of game story comes up at every
game length and re-checks every one against the box score it came from. A
comeback headline over a game nobody trailed in, or a scoreline in the sentence
that is not the scoreline of the game, fails the run.

`npm run scoring` simulates thousands of games per level and reports the
distributions; `npm run levels` does the same through the real match engine.

`npm run test:responsive` walks the Challenge and recruiting screens at four
widths from an iPhone SE up and fails on horizontal overflow, text under 10.5px
or a touch target under 30px.

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
  challenge/ the nine-rung ladder, situations, job offers, legacy, the coach
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
