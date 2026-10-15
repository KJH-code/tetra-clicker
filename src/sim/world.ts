import { Game, type GameSnapshot, type LockResult } from './game';
import { Economy } from './economy';
import { earnedFor, attackFor } from './attack';
import { tag, type Tag } from './tags';
import { POLICIES, playOne, type BotMove } from './bot/index';
import { buildingById, BUILDINGS } from '../data/buildings';
import { classifyGap, LINES_PER_PIECE, STEP_MS } from './clock';
import { add, mul, num, toNumber, type Num } from './num';
import type { Placement } from './board';

export interface AutoBoard {
  buildingId: string;
  game: Game;
  // Time until the bot places its next piece.
  timerMs: number;
  lastMove: BotMove | null;
}

export interface AutoBoardSnapshot {
  buildingId: string;
  game: GameSnapshot;
  timerMs: number;
}

export interface WorldSnapshot {
  seed: number;
  // Leftover sub-step time, kept so a reload continues on the same step grid.
  accumulatorMs: number;
  manual: GameSnapshot;
  economy: { balance: string; owned: Record<string, number> };
  autoBoards: AutoBoardSnapshot[];
}

// Events the renderer and UI react to. The sim never touches the DOM; it
// only queues these.
export type WorldEvent =
  | { type: 'manualLock'; result: LockResult; earned: Num; tags: Tag[]; at: Placement }
  | { type: 'botMove'; board: number; move: BotMove; earned: Num }
  | { type: 'catchUp'; seconds: number; earned: Num }
  | { type: 'bought'; buildingId: string; owned: number }
  | { type: 'slept'; seconds: number };

export class World {
  manual: Game;
  economy: Economy;
  autoBoards: AutoBoard[] = [];
  events: WorldEvent[] = [];
  private accumulatorMs = 0;
  private lastTickMs: number | null = null;
  private readonly seed: number;
  private boardsCreated = 0;

  constructor(seed: number, snapshot?: WorldSnapshot) {
    this.seed = seed;
    if (snapshot) {
      this.manual = new Game(seed, snapshot.manual);
      this.economy = new Economy();
      this.economy.balance = num(Number(snapshot.economy.balance));
      for (const [id, n] of Object.entries(snapshot.economy.owned)) this.economy.setOwned(id, n);
      this.autoBoards = snapshot.autoBoards.map((b) => ({
        buildingId: b.buildingId,
        game: new Game(seed, b.game),
        timerMs: b.timerMs,
        lastMove: null,
      }));
      this.boardsCreated = this.autoBoards.length;
      // The tick clock is deliberately not restored: time while the tab was
      // closed earns nothing, so the first tick after a load only sets it.
      this.accumulatorMs = snapshot.accumulatorMs;
    } else {
      this.manual = new Game(seed);
      this.economy = new Economy();
    }
  }

  snapshot(): WorldSnapshot {
    const eco = this.economy.snapshot();
    return {
      seed: this.seed,
      accumulatorMs: this.accumulatorMs,
      manual: this.manual.snapshot(),
      economy: { balance: String(eco.balance), owned: eco.owned },
      autoBoards: this.autoBoards.map((b) => ({ buildingId: b.buildingId, game: b.game.snapshot(), timerMs: b.timerMs })),
    };
  }

  // --- manual board -------------------------------------------------------

  manualLock(result: LockResult): Num {
    const at = this.manual.active!;
    const earned = earnedFor(result, [tag.board('manual')]);
    const final = this.economy.earn(earned.amount, earned.tags);
    this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
    return final;
  }

  manualHardDrop(): LockResult {
    const result = this.manual.hardDrop();
    this.manualLock(result);
    return result;
  }

  // --- shop ---------------------------------------------------------------

  buy(id: string): boolean {
    const def = buildingById(id);
    if (!def || !this.economy.buy(id)) return false;
    // The first copy of a building is its board; later copies only add income.
    if (!this.autoBoards.some((b) => b.buildingId === id)) {
      this.autoBoards.push({
        buildingId: id,
        // Each board gets its own stream so two boards never mirror each other.
        game: new Game(this.seed * 7919 + this.boardsCreated * 104729 + 1),
        timerMs: 1000 / def.pps,
        lastMove: null,
      });
      this.boardsCreated++;
    }
    this.events.push({ type: 'bought', buildingId: id, owned: this.economy.owned(id) });
    return true;
  }

  // --- time ---------------------------------------------------------------

  // Income tags a bot's clear carries. Bots earn no technique bonuses, so the
  // result is flattened before pricing.
  private botTags(buildingId: string): Tag[] {
    return [tag.board('auto'), tag.building(buildingId), tag.clear(1)];
  }

  private botEarn(board: AutoBoard, move: BotMove): Num {
    const flat: LockResult = { ...move.result, spin: 'none', comboIndex: 0, b2bExtended: false, perfectClear: false };
    const amount = num(attackFor(flat).total);
    if (toNumber(amount) === 0) return num(0);
    return this.economy.earn(amount, this.botTags(board.buildingId));
  }

  // Expected Lines per second from every auto board, as the catch-up formula
  // sees it. Also what the shop shows as income.
  incomePerSecond(): Num {
    let total = num(0);
    for (const b of this.autoBoards) {
      const def = buildingById(b.buildingId);
      if (!def) continue;
      const rate = def.pps * LINES_PER_PIECE * this.economy.incomeMultiplier(this.botTags(b.buildingId));
      total = add(total, num(rate));
    }
    return total;
  }

  // Advance to wall-clock time `nowMs`. Short gaps are simulated step by
  // step; long gaps (hidden tab) are settled with the formula; very long gaps
  // mean the computer was asleep and earn nothing.
  advance(nowMs: number): void {
    if (this.lastTickMs === null) {
      this.lastTickMs = nowMs;
      return;
    }
    const gap = Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    const kind = classifyGap(gap);
    if (kind === 'sleep') {
      this.accumulatorMs = 0;
      this.events.push({ type: 'slept', seconds: gap / 1000 });
      return;
    }
    if (kind === 'formula') {
      this.accumulatorMs = 0;
      this.catchUp(gap / 1000);
      return;
    }
    this.accumulatorMs += gap;
    while (this.accumulatorMs >= STEP_MS) {
      this.accumulatorMs -= STEP_MS;
      this.step(STEP_MS);
    }
  }

  // One fixed step: every bot counts down to its next piece.
  step(dtMs: number): void {
    for (let i = 0; i < this.autoBoards.length; i++) {
      const board = this.autoBoards[i]!;
      const def = buildingById(board.buildingId);
      if (!def) continue;
      board.timerMs -= dtMs;
      while (board.timerMs <= 0) {
        board.timerMs += 1000 / def.pps;
        const policy = POLICIES[def.skill];
        if (!policy) break;
        const move = playOne(board.game, policy);
        if (!move) break;
        board.lastMove = move;
        const earned = this.botEarn(board, move);
        this.events.push({ type: 'botMove', board: i, move, earned });
      }
    }
  }

  catchUp(seconds: number): void {
    const earned = mul(this.incomePerSecond(), num(seconds));
    if (toNumber(earned) > 0) {
      this.economy.balance = add(this.economy.balance, earned);
    }
    this.events.push({ type: 'catchUp', seconds, earned });
  }

  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  static buildings() {
    return BUILDINGS;
  }
}
