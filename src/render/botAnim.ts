import type { BotMove } from '../sim/bot/index';
import type { Placement, Grid } from '../sim/board';

// The sim commits a bot's piece instantly. The renderer replays it: the piece
// appears at spawn, slides and turns toward its column, then drops. The
// board underneath shows the pre-move grid until the drop lands.
const SLIDE_MS = 320;
const DROP_MS = 90;
export const BOT_ANIM_MS = SLIDE_MS + DROP_MS;

export interface BotAnimation {
  move: BotMove;
  before: Grid;
  t: number;
}

export function animatedPlacement(anim: BotAnimation): Placement {
  const { from, via, to, path } = anim.move;
  // A move played input by input replays its path, so a spin is seen
  // turning into its slot.
  if (path && path.length > 1) {
    const k = Math.min(1, anim.t / BOT_ANIM_MS);
    return path[Math.min(path.length - 1, Math.floor(k * path.length))]!;
  }
  if (anim.t < SLIDE_MS) {
    const k = easeOut(anim.t / SLIDE_MS);
    return { piece: from.piece, rot: k > 0.4 ? via.rot : from.rot, x: Math.round(from.x + (via.x - from.x) * k), y: from.y };
  }
  const k = Math.min(1, (anim.t - SLIDE_MS) / DROP_MS);
  return { ...to, y: Math.round(via.y + (to.y - via.y) * k) };
}

export const isLanded = (anim: BotAnimation): boolean => anim.t >= BOT_ANIM_MS;

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}
