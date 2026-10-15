import type { Placement } from '../board';
import type { Game } from '../game';

// What a policy decided: where the piece goes (at the spawn row; the bot
// slides there and hard drops) and whether it is the held piece rather than
// the active one. Null means nothing legal exists, which the bot tests prove
// never happens.
export interface BotChoice {
  placement: Placement;
  useHold: boolean;
}

export interface BotPolicy {
  choose(game: Game): BotChoice | null;
}
