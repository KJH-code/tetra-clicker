import type { Placement } from '../board';
import type { Game } from '../game';
import type { Input } from './cc/movegen';

// What a policy decided: where the piece goes (at the spawn row; the bot
// slides there and hard drops) and whether it is the held piece rather than
// the active one. Null means nothing legal exists, which the bot tests prove
// never happens.
export interface BotChoice {
  placement: Placement;
  useHold: boolean;
  // When set, the bot plays these inputs from spawn instead of sliding there,
  // so spins happen for real; `placement` is then where the piece locks.
  inputs?: Input[];
  path?: Placement[];
}

export interface BotPolicy {
  choose(game: Game): BotChoice | null;
}
