import type { Placement } from '../board';
import type { Game } from '../game';

// A policy picks where the active piece goes. It returns the placement at
// the spawn row (the bot slides there, then hard drops) or null when nothing
// legal exists, which the single bot's tests prove never happens.
export interface BotPolicy {
  choose(game: Game): Placement | null;
}
