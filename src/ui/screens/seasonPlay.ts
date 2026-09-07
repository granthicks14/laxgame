import type { App } from '../App';
import { GameScreen } from './GameScreen';
import { PostGameScreen } from './PostGame';
import { makeMatchConfig, tacticsFor } from '../../league/matchSetup';
import {
  applyGameStats, effectiveTeam, opponentOf, recordUserResult, roundName,
  rosterForMatch, userIsHome,
} from '../../league/career';
import { saveCareer } from '../../state/saves';
import { generateRoster } from '../../data/players';
import type { Career, ScheduledGame } from '../../league/types';

export function buildSeasonMatch(career: Career, game: ScheduledGame) {
  const oppId = opponentOf(career, game);
  const you = effectiveTeam(career, career.teamId);
  const them = effectiveTeam(career, oppId);
  const isHome = userIsHome(career, game);
  const oppRoster = generateRoster(them, `${career.seed}:${career.year}:${oppId}`);
  const yourRoster = rosterForMatch(career);

  const label = game.playoff
    ? roundName(game.playoff).toUpperCase()
    : game.rivalry ? 'RIVALRY GAME' : undefined;

  return makeMatchConfig({
    homeTeam: isHome ? you : them,
    awayTeam: isHome ? them : you,
    humanSide: isHome ? 'home' : 'away',
    difficulty: career.difficulty,
    gameLength: career.gameLength,
    seed: hashSeed(`${career.seed}:${career.year}:${game.id}`),
    contextLabel: label,
    homeRoster: isHome ? yourRoster : oppRoster,
    awayRoster: isHome ? oppRoster : yourRoster,
    homeTactics: isHome ? career.tactics : tacticsFor(them),
    awayTactics: isHome ? tacticsFor(them) : career.tactics,
  });
}

export function playSeasonGame(app: App, career: Career, game: ScheduledGame): void {
  const config = buildSeasonMatch(career, game);
  const isHome = userIsHome(career, game);

  app.push((a) => new GameScreen(a, {
    config,
    onQuit: () => a.pop(),
    onComplete: (match) => {
      const won = isHome
        ? match.score.home > match.score.away
        : match.score.away > match.score.home;
      applyGameStats(career, match.playerStats(), won);
      recordUserResult(career, game, match.score.home, match.score.away);
      saveCareer(career);

      a.replace((b) => new PostGameScreen(b, {
        match,
        title: game.playoff ? roundName(game.playoff) : `Week ${game.week}`,
        actions: [
          {
            label: 'Continue',
            primary: true,
            onClick: () => b.pop(),
          },
        ],
      }));
    },
  }));
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
