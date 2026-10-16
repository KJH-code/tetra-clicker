import type { Game } from '../game';
import { PIECES } from '../pieces';
import type { BotChoice, BotPolicy } from './policy';

// Bot boards play only their own pieces, so a copy of a board can run ahead
// of the real one (in a worker) and hand over its decisions. A decision is
// keyed by everything the bot sees, so a stale or mismatched one is simply
// never used, and the real board gets exactly the move it would have chosen.
export function positionKey(game: Game): string {
  let h = 2166136261;
  const g = game.grid;
  for (let i = 0; i < g.length; i++) h = Math.imul(h ^ g[i]!, 16777619);
  const queue = game.next(5).map((p) => PIECES.indexOf(p)).join('');
  const holds = game.holds.map((p) => PIECES.indexOf(p)).join('');
  return `${h >>> 0}:${game.active?.piece ?? '-'}:${holds}:${game.holdUsed ? 1 : 0}:${queue}:${game.combo}:${game.b2b}`;
}

// The policy a board plays with: a decision handed over for this exact
// position, else the bot thinks here and now.
export class PrefetchedPolicy implements BotPolicy {
  private readonly ready = new Map<string, BotChoice>();
  misses = 0;

  constructor(private readonly inner: BotPolicy) {}

  offer(key: string, choice: BotChoice): void {
    // Bounded: a worker that ran down a line the board left behind would
    // otherwise pile up decisions nobody takes.
    if (this.ready.size > 64) this.ready.clear();
    this.ready.set(key, choice);
  }

  clear(): void {
    this.ready.clear();
  }

  choose(game: Game): BotChoice | null {
    const key = positionKey(game);
    const hit = this.ready.get(key);
    if (hit) {
      this.ready.delete(key);
      return hit;
    }
    this.misses++;
    return this.inner.choose(game);
  }
}
