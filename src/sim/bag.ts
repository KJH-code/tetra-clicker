import { PIECES, type Piece } from './pieces';
import type { Rng } from './rng';

// 7-bag: every seven pieces contain each tetromino exactly once. The queue
// holds at least `lookahead` pieces so the next preview never runs dry.
export interface Bag {
  take(): Piece;
  peek(n: number): Piece[];
  // Make sure at least n pieces are queued. Bags are dealt in the same order
  // whenever they are dealt, so looking further ahead changes nothing.
  ensure(n: number): void;
  snapshot(): { queue: Piece[]; rng: number };
}

export function createBag(rng: Rng, lookahead = 5, initialQueue: Piece[] = []): Bag {
  const queue: Piece[] = [...initialQueue];
  const refill = (min = lookahead + 1): void => {
    while (queue.length < min) {
      const bag = [...PIECES];
      // Fisher-Yates so each permutation is equally likely.
      for (let i = bag.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      queue.push(...bag);
    }
  };
  refill();
  return {
    take: () => {
      const p = queue.shift()!;
      refill();
      return p;
    },
    peek: (n) => queue.slice(0, n),
    ensure: (n) => refill(n),
    snapshot: () => ({ queue: [...queue], rng: rng.state() }),
  };
}
