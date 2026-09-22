# Lone Star Sports

**Play it: [lone-star-lax.vercel.app](https://lone-star-lax.vercel.app)**

A hub of original retro sports games. Opening it puts you in the hub, not in a
sport: **Play Now**, choose a sport, and that sport loads — its own branding, its
own engine, its own rules, its own controls.

Three are playable.

- **Lacrosse — _Lone Star Lax_.** Start in the **THSLL North District**, play the
  games yourself, and — if you want the long version — coach your way from the
  bottom of high school lacrosse to the professional game. Everything below the
  hub section is about this one.
- **Basketball — _Hardwood_.** Half-court five-on-five with a real ball in three
  dimensions, a rim you can rattle, and a release window you either hit or do
  not. Exhibition games and a twenty-two game season with a bracket at the end.
- **Football — _Gridiron_.** You play offence and coach defence: call it, snap
  it, throw it, run it, and when the other lot have the ball your eleven play it
  out on their own ratings and the game plan you set. Underneath is a
  thirty-two club league — the real cities, names, divisions and conferences,
  with **every single player invented** — a seventeen game season, the real
  playoff bracket, a salary cap, a scouted draft, free agency, a trade desk, a
  coaching staff and five buildings worth investing in.

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

## The hub

The front door is a hub, and the flow through it is deliberate:

```
open the game -> PLAY NOW -> choose a sport -> that sport loads -> play it
```

A sport is not a menu option that swaps a skin. It is a separate module with its
own engine, rules, controls, camera, animations, sounds, teams and modes, and it
is a separate **download**: the hub's bundle is about 12 kB gzipped and contains
no lacrosse and no basketball at all. Choosing a sport is what fetches it, behind
that sport's own loading screen. Backing out to the hub does not unload it, so
going back in is instant.

What is genuinely shared is only what means the same thing in every sport: the
DOM helpers and the UI kit, the schema-driven input manager (each sport declares
its own actions, keys and touch buttons, and rebinds are stored per sport), the
`Viewport` base a camera is built on — projection, the portrait rotation, the
pixel scale, screen shake — the synthesised audio engine, settings, and the save
plumbing. **Framing is deliberately not shared.** Lacrosse's camera trails the
ball down a 110-yard field and leads it toward the cage; basketball's stands the
court upright, holds the half being played, and swings when possession turns
over. Writing one camera for both would have made both worse.

The same rule decides everything else. Lacrosse has Dynasty, Challenge and Super
Challenge; basketball does not, because empty copies of them would be worse than
leaving them out. Basketball has a shot-clock, a release window and a bonus;
lacrosse has none of those. Football has a salary cap, a draft and a kick meter,
and it is the only one of the three where you coach half the game rather than
play it — because that is what makes a football game short enough to finish.

Sports still being built (soccer, hockey, baseball, tennis, volleyball)
appear on the selection screen as a roadmap strip that says what each one needs.
They are not buttons, because a button that does nothing is a lie.

### Basketball — Hardwood

The ball is a real object: position, velocity and height in feet and seconds,
integrated exactly enough that a shot arrives where it was aimed. The rim is a
torus — the ball crosses the plane of the ring and is tested in three dimensions
against it — so a shot can rattle in, rattle out, or catch the back iron, and a
missed shot comes off where a missed shot should. Misses are aimed at a specific
piece of iron rather than jittered, which is what makes rebounding real.

The shot is a timing shot. Holding the shoot button gathers; a bar under the
shooter shows a green window and a needle crossing it, and letting go inside the
window is worth real percentage. The window's **width** is the shooter — a career
shooter gives you a forgiving target, a centre gives you a sliver — and its
position never moves, so it can be learned.

Difficulty changes how well the opposition **decides** — shot selection, how fast
help arrives, how hard it closes out — and never hands it a rating it does not
have on the roster screen. `npm run hoops` proves that: the ladder from Rookie to
Legend moves average shot quality from 55.2% to 58.9% with identical rosters.

`npm run hoops` also holds the whole engine against real basketball: shooting
percentages by distance and contest, the three-point share of offence, where the
rebounds go, assists as a share of makes, turnovers, fouls, foul-outs, that the
box score's rows add up to the team line, and that the same seed produces the
same box score twice. `npm run test:hoops` drives a browser through the whole
thing — hub, loading screen, tip-off, keyboard, pause menu, final buzzer, box
score, clubs, season, reload, back to the hub, then the same on a phone with
touch controls.

---

### Football — Gridiron

**The clubs are the real ones. Every player is invented.** The cities, names,
divisions and conference structure are the ones people already know, because a
franchise game whose league you have to learn before you can care about it has
thrown away the one thing it got for free. Not one name, likeness or career in
the game belongs to a real person: every roster, draft class and free agent is
generated from the club's id, the save's seed and the year. Nothing in it is
anybody's artwork either — a club is drawn from two colours and its own three
letters.

**You play offence and coach defence.** Between downs the game stops and asks
what you are running; then you take the snap, and the throw is a tap at the
receiver you want. When the other lot have the ball your eleven play it out on
their own ratings, your coordinator's coaching and the plan on the chip —
attack, balanced or bend — at three and a half times speed, with a button to
skip straight to the end of the series. Nobody ever hands you a safety to steer.
The one exception is the one it would be absurd to take away: a ball your
defence has just taken off them is yours to run.

A field goal is a kick, not a dice roll: one pass of a marker, one press, and a
band to hit whose width is your kicker's accuracy and whose centre the wind has
moved. From forty-five yards a good leg makes 96% struck and 34% shanked; from
fifty-two a good leg makes 85% and a poor one 34%. Timing is about a third of
it. The leg on the roster is the rest.

**Underneath it is a franchise.** Seventeen games over eighteen weeks with the
real rotation — six in your division, four against one division in each
conference, and three against the clubs that finished where you finished.
Fourteen clubs in January, reseeded between rounds, and one game in February
that gets a screen of its own. A two hundred million salary cap, four rounds of
a draft you scout before you pick (the report is wrong by an amount that shrinks
as you spend on it, and never reaches certainty), three waves of free agency
where a club nobody wants to join pays over the odds, a trade desk where the
other side is not an idiot, a head coach and two coordinators, five buildings,
and a town whose support you earn.

Dynasty is one club for as long as you like. Challenge is the hot seat: the
owner has a number in his head before the season starts, missing it for long
enough ends the job, and beating it gets you a phone call from somewhere better.

Whatever you skip in an offseason, the club does for you — a real organisation
re-signs its own and bids on the market whether or not anybody is watching.

## What's in it

**Play Now** — any two North District teams, home or away, four difficulty
levels, three game lengths.

**Season** — a full district schedule, live standings, and a playoff bracket
ending in the class championship. Small classes play everyone home and away;
the playoff field is roughly the top half, so qualifying means something. Play
every game, simulate the ones you don't want, or simulate the whole season at
once — the hub leads with all three, so the button you are going to press is
never below the fold.

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
  to win with a roster that cannot win. What it costs you is *time*. No two
  offers on the same screen carry the same problem if it can be helped.
- **The first job is the worst job in the district.** The squad you are handed
  sits 6 rating points below its class on Standard and 12 on the Final
  Challenge, with a thinner bench and a colder room — but untouched ceilings, so
  the hole is a coaching problem rather than a life sentence. `npm run
  start-check` plays the opening seasons twice with the same seeds, once with a
  coach who does nothing and once with a coach who actually coaches: the first
  wins 26–34% of his games in year one, takes the class in 0–20% of careers, and
  is still 5–7 points behind after eight seasons; the second climbs to roughly
  class average and wins it in 11 careers of 20.
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

**Five difficulties, chosen once before the first job.** They are not a bonus on
the opposition's rating — no tier gives a rival programme a player, a point of
rating or a resource you do not have. What changes is DECISIONS and RESOURCES,
and one thing on the field: the programme you are handed at the bottom of the
ladder is further behind its class the harder the tier.

|  | Standard | Hard | Very Hard | Impossible | Final Challenge |
| --- | --- | --- | --- | --- | --- |
| Coach Points earned | 100% | 82% | 73% | 64% | 50% |
| Coaching experience | 100% | 88% | 82% | 76% | 66% |
| Coach upgrade cost | 100% | 130% | 150% | 170% | 215% |
| Programme staff cost | 100% | 120% | 132% | 145% | 175% |
| Rival recruiting effort | 100% | 125% | 140% | 155% | 190% |
| Rival scouting accuracy | 35% | 55% | 65% | 75% | 92% |
| Your interest builds at | 100% | 90% | 85% | 80% | 72% |
| Scholarship offers | Standard | -1 | -1 | -2 | -3 |
| Transfer resistance | None | -6 pts | -9 pts | -13 pts | -20 pts |
| Rivals per transfer | Standard | +1 | +2 | +2 | +3 |
| Your players leaving | 100% | 120% | 132% | 145% | 170% |
| Player development | 100% | 92% | 88% | 84% | 76% |
| Breakout seasons | 100% | 85% | 77% | 70% | 55% |
| Quality of jobs offered | Standard | -12% | -18% | -24% | -34% |
| The squad you start with | 6 OVR below the class | 7 | 8 | 10 | 12 |
| Broken programmes | Standard | +30% | +47% | +65% | +100% |
| What they demand of you | Standard | +2 win% | +3 win% | +4 win% | +6 win% |

That table is not written down twice. The difficulty screen, the comparison
screen and the simulation all read the same `MODIFIER_SPECS` list in
`src/challenge/difficulty.ts`, so the game cannot tell you one thing and do
another. Tapping a tier answers one question — *what makes this harder than the
tier below it?* — with every modifier it changes, signed and quantified.

On the harder tiers the coach tree **cannot be finished**, which is the point:
you have to decide what kind of coach you are. The office reads back the
identity your spending has actually formed — The Scout, The Recruiter, The
Developer, The Strategist — rather than leaving it implicit.

**Super Challenge** — the same career engine, the same ladder, the same
difficulty tiers, the same coach: one objective is different, and it is the
whole mode. **Win three championships inside any rolling ten-season window.**

- There is **no total time limit** and no permanent failure. A window that
  closes without three titles is not a loss — the tracker says *dominance not
  yet proven* and the career continues. The mode has no "you failed" ending.
- The hub is built for a coach who wants to simulate. The fixture and its
  controls — play, simulate the game, simulate the whole season — sit directly
  under the header, and the tracker is a compact card: on a phone it is 92px at
  the top of the screen; on a wide screen it moves into a sticky column beside
  the controls with the table. `npm run test:super` measures it in a real
  browser at 390px and 1440px: every control on the first screenful, and eight
  consecutive simulations without a scroll at either size.
- The tracker itself opens into the full record: the window being measured,
  titles inside it, the best ten-year run of the career, career championships,
  every season laid out, and how far off the requirement you are.
- It is **derived**, never stored. `dominance()` searches every ten-season
  window in the career's own step history, so there is no counter to drift, no
  migration to write, and no way for the display and the rule to disagree.
  `npm run dominance` checks the window arithmetic on 19 constructed careers and
  `npm run super` drives the mode end to end, including the awkward cases:
  titles exactly ten seasons apart, three in a row at the start, a gap that
  breaks a window, and a career that qualifies only on its last season.

**The hall of careers.** A Challenge career ends and its save is gone, so each
difficulty keeps one line outside any save: the best legacy scored on it, the
fastest climb to the PLL, the furthest rung reached, and how many careers you
have run there. It is on the difficulty picker, where the decision to play again
is actually made, and on the ending, which tells you whether you beat your own
mark or what still stands. Nothing in it is seeded or awarded — an empty hall is
an honest hall.

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

- **His own upgrade tree**, 64 upgrades over eight branches (Offence, Defence,
  Strength & Conditioning, Player Development, Scouting, Recruiting, Transfers
  and Programme Management), gated by *both* Coach Points and coach level, with
  prerequisites inside each branch and twenty coach levels to climb. It cannot
  be finished in one career, which is the point — `npm run careers` reports what
  a full run actually buys, from about 20 of 64 on Standard down to 9 on the
  Final Challenge — and nothing in it is a label with no effect: the sweep fails
  if any upgrade leaves every perk unchanged, or if any upgrade is unreachable.
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

**Roster needs** — a squad is not a pile of players, and recruiting knows it.
Every position is measured against the roster shape the level carries: who is on
the books, who graduates, who is coming back, who has already committed —
recruits and transfers both — how many places that leaves open, the average
rating, the projected starting line, and how far that line sits below the
standard of the level. Nothing is stored: it is recomputed from the squad, the
class and the portal every time it is read, which is what makes a commitment
change it the moment it lands.

Both markets read the same numbers. A recruit weighs the depth chart he would
JOIN — whether a starting place is open, whether he beats the man who would
otherwise be last in the line-up, whether there is any room at all — so three
goalkeepers can no longer all commit to a programme that needed one, and an
84 attacker behind a 95-90-88 line can see the queue he would be joining. A
transfer counts the players already committed when he works out who is ahead of
him. `npm run needs` drives the real interest models and reports it: three
keepers commit and a fourth's interest falls from 10 to 0 with "You are already
full at goalie" on his card; gut a defence and the identical player prefers it
to the stacked attack by ten points of interest.

The panel is on the offseason, the recruiting board and the transfer window,
sorted by urgency, with the open places, the projected depth and a line saying
what each position actually needs.

**A team plays like its roster, not like its average.** Attack, midfield,
defence and goalkeeping drive results separately, in the simulation and in the
match engine alike. `npm run profiles` plays the same three squads — an elite
offence with a poor defence, a balanced side, and an elite defence with no
attack — hundreds of times through the league simulation and two dozen times
through the real engine, and holds them to what a coach would expect:

| Squad | Simulated | Played |
| --- | --- | --- |
| A94 M93 D70 G72 | 10.3 - 13.4 | 16.4 - 15.0 |
| A83 M83 D83 G83 | 9.4 - 8.9 | 13.7 - 10.6 |
| A70 M75 D94 G95 | 8.0 - 5.6 | 10.6 - 8.5 |

The shoot-out team's games run ten goals higher than the defensive team's, in
both engines, and neither arrangement is a free win.

**Player development** — every player has an archetype, a development curve and
a hidden work rate. An early developer arrives close to finished; a late bloomer
looks ordinary for two years and then jumps. **Development projects** commit one
player for a season: they cost Coach Points, concentrate his growth into named
attributes, and suppress everything outside them. Each player carries the history
of what every offseason actually did to him.

**Every player has a face and a page.** Portraits are generated, never
photographed: the id is hashed into skin tone, face shape, hair style and
colour, brows, facial hair, eye black, a headband and a helmet in the
programme's colours, so the same player looks the same everywhere he appears and
no two look alike. Nothing is scraped, downloaded or traced from a real person —
it is a few hundred lines of canvas drawing, cached and drawn at 24, 48 or 96
pixels so the sprite never falls between pixels. His page carries the lot: the
portrait, number, position, class, role in the side, star tier, overall against
ceiling, season and career totals with per-game rates, what he is good and bad
at against the standard of his level, his development history season by season,
and where he came from.

**Stars.** A star is a player who stands out *among his own*, which on one
universal scale cannot be a fixed number — 79 is the best player in a high
school district and a bench player in the PLL. The two marks are per level,
calibrated against the actual generated distributions: about 5–7% of players at
any level are stars and 1–2% are elite. `npm run ratings` samples every level
and fails if the mark dies out or becomes common. A star is worth having on the
field, too: the defence marks him tighter and slides to him sooner, and the AI
looks for him with the ball. `npm run stars` measures exactly what he is worth.

**Practice** — five drills: Shooting Gallery, Faceoff Reps, Clearing & Passing,
Defensive Stand, and open Free Play.

**Goal replays** — every goal plays a short broadcast highlight of the goal that
was actually scored, replayed out of a circular buffer that records the real
positions of the ball and all twenty players at 20 Hz (about 54 KB, and nothing
allocated after it is built). Seven camera treatments share that footage —
broadcast wide, sideline, shooter cam, end line, goalie cam, ball cam and a
close-up — each with its own anchor, push-in and follow rate, and each tightening
onto the cage for the slow-motion finish. Which one you get is a hash of the
seed and the goal number, so the same goal always replays the same way, the
choice never touches the simulation's random stream, and the same framing never
runs twice in a row. The ball crossing the line brings a jolt through the
camera, the crowd and a burst of team colour; the scorer, the assist and the
distance stay on screen throughout. Skippable, and switchable off in Settings.

**Championships** — winning one gets the screen to itself, once: the programme's
colours, confetti, the trophy, the final it was won in, the players who actually
scored it, and where it sits in the coach's record. The season summary keeps a
line about it; the moment is not buried in it.

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
- **One seed, one game.** Everything the match engine rolls — the clamp window,
  the whistle, the shots, the saves — comes from the match's own seeded stream,
  so the same fixture from the same seed plays out identically every time.
  `npm run gameplay` plays one three times and fails if the box scores differ.
  (They used to: the whistle delay was a live `Math.random()`, which nudged the
  timing of everything after every faceoff and made the engine impossible to
  measure to within a goal.)
- **One seed, one career.** The same holds a level up. A player's id is drawn
  from the generator's own seeded stream, which matters because that id is
  hashed into the rng that resolves a transfer pitch and into the scouting
  sheet's per-attribute offsets — while it carried a `Math.random()` and a
  process-wide counter, the portal was not reproducible and a career's outcome
  depended on how many players happened to have been generated before it. Two
  runs of `npm run start-check` now come back byte-identical, and a tier
  measured on its own gives the same answer as the same tier measured after
  four others.

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

`npm run careers` is the Challenge Mode stress test. It sweeps **all five
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

`npm run hierarchy` is the guard on the universal rating scale. It builds every
team and every roster at all six levels, prints the team and player distribution
for each, and fails the run on any inversion — an average Division I team above
an average PLL club, a level reaching past its neighbour, or a level outside its
own band. Run it after touching `overallBand`, `band` or a programme's `tier`.

`npm run stories` prints how often each kind of game story comes up at every
game length and re-checks every one against the box score it came from. A
comeback headline over a game nobody trailed in, or a scoreline in the sentence
that is not the scoreline of the game, fails the run.

`npm run scoring` simulates thousands of games per level and reports the
distributions; `npm run levels` does the same through the real match engine.

`npm run test:responsive` walks the Challenge and recruiting screens at four
widths from an iPhone SE up and fails on horizontal overflow, text under 10.5px,
a touch target under 30px, or a topbar title or subtitle cut off with an
ellipsis. (That last one found four real truncations the first time it ran.)

`npm run test:hoops` does the equivalent for basketball: the hub's front door
(and that opening the program loads no sport at all), the loading screen, a real
game driven by keys and by thumbs, the camera framing, the pause menu's tabs, the
final buzzer, a box score whose rows add up to its own total and to the
scoreboard, the clubs and rosters, a season that survives a reload, and the way
back out to the hub — then the whole game again on a phone, where it checks that
all five touch buttons exist, are a thumb's size, are on the screen, do not sit
on each other, and leave nothing held down.

`npm run gridiron` plays whole football games headlessly at every difficulty and
prints the numbers the sport is actually described by — yards per carry,
completion percentage, sack rate, points, drives, where the yards come from —
next to what those numbers are in the real thing. It also measures the kick: a
good leg from forty-five makes 96% struck and 34% shanked, a good leg from
fifty-two makes 85% where a poor one makes 34%, and a twenty-three yarder is
routine. Those four numbers are the whole design of the kick meter, and the
harness fails if timing stops mattering or starts mattering more than the leg.

`npm run gridiron-nfl` builds the league and then lives in it: twelve seasons of
fixtures checked for legality (seventeen games each, six in the division,
nobody twice in a week, everybody a bye), twenty seasons of a franchise with the
cap, the roster size, the average age and the scoring watched the whole way, the
seeding and the bracket, a draft class, the trade desk refusing a robbery, three
seasons replayed from the same seed to prove determinism, a Challenge career
with its sackings, and a twenty-season save taken apart afterwards to check that
nobody is on the roster twice, every contract is legal, the drift stayed in
bounds and the whole thing survives a round trip through JSON and plays on.

`npm run test:gridiron` drives a browser through football end to end: the menu,
the clubs, a game coached by keys through to the final whistle and its box
score, the same game by thumb on a phone, then a whole franchise — the league
and its playoff picture, the roster and a player's page, the staff room, the
trade desk, a season simulated, an offseason walked step by step through
contracts, three waves of free agency, a scouted draft and the buildings, into
the next season and a game actually played in it. Then every one of those
management screens again at 412 pixels wide, checking that nothing runs off the
side and every control is a thumb's size, because mobile-first is a claim that
has to be checked.

`npm run shots` photographs the screens that matter at phone and desktop width
into a folder, on a real save with real content in it, so a UI pass can be done
by looking at the screens rather than at the source.

`npm run final` is the last sweep: it proves a superstar is worth having and
still beatable by playing the same fixtures with and without one, checks a
season's statistics for internal consistency (nobody scores more than he shot,
nobody plays more games than were played, no career total behind a season),
round-trips a save in all four modes through the app's own storage code, and
holds promotion and relegation to their invariant — every promotion matched by
a relegation, so no division changes size, and the spots a coach is promised are
the spots the rule actually uses.

`npm run start-check` measures the first seasons of a Challenge career at every
tier, twice with the same seeds: once with a coach who does nothing and once
with a coach who works. It fails if the opening job is a coronation or a dead
end.

`npm run needs` drives the real recruiting and transfer interest models against
constructed squads: three keepers committing, a gutted defence beside a stacked
attack, a position with no room left. `npm run profiles` plays three squad
shapes through both the simulation and the match engine and fails if a roster
stops deciding how a team plays.

`npm run test:super` plays a Super Challenge career through the actual screens
at phone and desktop size — the controls have to be on the first screenful and
stay there, the tracker has to be compact and visible, and the career has to be
graded every season and end only by winning three titles in a window. That last
one is there because it once was not: the season summary tested for the
Challenge mode by name, so Super Challenge seasons were never graded at all.

`npm run gameplay` drives the match engine itself. It plays a full game at the
longest setting and watches every frame for the things that ruin a match without
crashing it — a player off the field, a NaN position, a ball held by nobody, a
loose ball sitting still in live play, a quarter that never ends — and checks
that the box score adds up afterwards. It covers the keeper being reachable by
Switch after a rebound, a screen being callable, quarter simulation, and the
goal replay: that every camera angle gets used, that the same goal always
replays the same way, that no framing runs twice in a row, and that a real
engine goal arms the clip with the right scorer, keeper and cage.

`npm run test:e2e` drives a real browser through the title screen, a quick game,
a full season and playoff bracket, a dynasty offseason, a save reload, the
practice drills, phone and tablet layouts, and a frame-rate check. It also
corrupts the save data on purpose — truncated JSON, an empty career, a null
settings blob — and requires the game to boot to the menu anyway. Playwright is
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
  render/    the shared Viewport (projection, rotation, pixel scale, shake)
  input/     schema-driven keyboard + touch input, shared by every sport
  audio/     Web Audio synthesis (no sound files), one sound pack per sport
  state/     settings, keybinds, per-sport preferences, the hub's save index
  ui/        the design system, the hub, and the DOM screens
  sports/
    registry.ts   every sport's manifest, card art, and lazy loader
    lacrosse/     its controls, sounds, settings and entry point
    basketball/   court, ball, rim, shot model, AI, camera, renderer, season
    football/     field, engine, AI, playbook, camera, renderer, fast simulator
      nfl.ts      thirty-two clubs, and the band each one's players come from
      franchise/  schedule, playoffs, staff, cap, draft, free agency, trades,
                  development, injuries, facilities, money, news, save
  data/      lacrosse: teams, rosters, players, ratings, difficulty, tactics
  match/     lacrosse: the simulation — Match, ai, faceoff, commentary, replay
  world/     lacrosse: conference tournaments, national brackets, auto-bids
  challenge/ lacrosse: the nine-rung ladder, job offers, legacy, the coach
  scouting/  lacrosse: prospects and fog of war, scouts, the recruiting class
  league/    lacrosse: schedules, standings, playoffs, career progression
  dev/       headless balance, human-proxy and AI audit harnesses
scripts/     browser end-to-end and feature-audit suites
```

Each sport is a separate chunk: the hub is about 12 kB gzipped, basketball about
35 kB, football about 74 kB, lacrosse about 145 kB, and none of them is fetched
until it is chosen.

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

**Football.** The thirty-two clubs use real professional team cities, names,
divisions and conference structure, because a franchise game whose league you
have to learn before you can care about it has thrown away the one thing it got
for free. **Every single player in them is invented.** Not one name, likeness,
photograph, statistic or career in the football section belongs to a real
person: every roster, draft class and free agent in the game is generated at
runtime from the club's id, the save's seed and the year, and the draft
prospects' colleges are made up too. No logo, wordmark or other artwork
belonging to anybody is used, reproduced or approximated — a club is drawn from
two colours and its own three letters, by this game's own renderer — and the
venues are original names rather than sponsors'. See
[`src/sports/football/nfl.ts`](src/sports/football/nfl.ts), which states all of
this at the top of the file.

This game is not affiliated with, endorsed by, or sponsored by the Texas High
School Lacrosse League, the National Football League, any of its clubs, or any
school.
