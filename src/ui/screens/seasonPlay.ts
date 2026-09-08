import type { App } from '../App';
import { GameScreen } from './GameScreen';
import { PostGameScreen } from './PostGame';
import { buildSeasonMatch } from '../../league/careerMatch';
import { applyGameStats, recordUserResult, roundNameIn, userIsHome } from '../../league/career';
import { saveCareer } from '../../state/saves';
import type { Career, ScheduledGame } from '../../league/types';

export function playSeasonGame(app: App, career: Career, game: ScheduledGame): void {
  const config = buildSeasonMatch(career, game, app.settings.goalReplays);
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
        title: roundNameIn(career, game),
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

