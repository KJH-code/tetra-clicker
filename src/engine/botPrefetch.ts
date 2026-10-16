import type { World, AutoBoard } from '../sim/world';
import { POLICIES } from '../sim/bot/index';
import { buildingById } from '../data/buildings';
import { PrefetchedPolicy } from '../sim/bot/prefetch';
import type { BotPolicy } from '../sim/bot/policy';
import type { Game } from '../sim/game';
import type { FromWorker, ToWorker } from './botWorker';

// The page side of the bot worker: each bot board plays through a
// PrefetchedPolicy fed by the worker's copy of that board. When the page had
// to think for itself (the worker fell behind, or the board was replaced),
// the copy is re-synced from the board as it now stands.
export class BotPrefetch {
  private readonly worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
  private readonly ids = new WeakMap<Game, number>();
  private readonly policies = new Map<number, PrefetchedPolicy>();
  private readonly tracked = new Map<number, { board: AutoBoard; misses: number }>();
  private nextId = 1;

  constructor(private readonly world: World) {
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      this.policies.get(m.id)?.offer(m.key, m.choice);
    };
    world.policyFor = (board) => this.policyFor(board);
  }

  // A board's id and policy, made the first time the page sees the board.
  private ensure(board: AutoBoard): number | undefined {
    let id = this.ids.get(board.game);
    if (id !== undefined) return id;
    const inner = POLICIES[skillOf(board)];
    if (!inner) return undefined;
    id = this.nextId++;
    this.ids.set(board.game, id);
    this.policies.set(id, new PrefetchedPolicy(inner));
    this.tracked.set(id, { board, misses: -1 });
    return id;
  }

  private policyFor(board: AutoBoard): BotPolicy | undefined {
    const id = this.ensure(board);
    if (id === undefined) return undefined;
    const policy = this.policies.get(id)!;
    return { choose: (game: Game) => {
      const before = policy.misses;
      const choice = policy.choose(game);
      if (policy.misses === before) this.post({ type: 'taken', id });
      return choice;
    } };
  }

  // Decisions the page had to work out itself, per board (for checking the worker keeps up).
  misses(): number[] {
    return [...this.policies.values()].map((p) => p.misses);
  }

  private post(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  // After each frame's steps: hand the worker any board it has not seen
  // (a board bought this frame starts thinking before its first piece is
  // due), or one the page had to play itself since the last sync.
  sync(): void {
    const live = new Set<number>();
    for (const board of this.world.autoBoards) {
      const id = this.ensure(board);
      if (id === undefined) continue;
      live.add(id);
      const t = this.tracked.get(id)!;
      const policy = this.policies.get(id)!;
      if (t.misses !== policy.misses) {
        t.misses = policy.misses;
        policy.clear();
        this.post({ type: 'track', id, skill: skillOf(board), snapshot: board.game.snapshot() });
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (live.has(id)) continue;
      this.tracked.delete(id);
      this.policies.delete(id);
      this.post({ type: 'drop', id });
    }
  }
}

const skillOf = (board: AutoBoard): string => buildingById(board.buildingId)?.skill ?? '';
