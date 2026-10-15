import { Game, type GameSnapshot, type LockResult } from './game';
import { Economy } from './economy';
import { earnedFor, attackFor } from './attack';
import { tag, type Tag } from './tags';
import { POLICIES, playOne, type BotMove } from './bot/index';
import { buildingById, BUILDINGS } from '../data/buildings';
import { classifyGap, STEP_MS } from './clock';
import { conditionMet, evaluate, flagCount } from './effects';
import { recordManual, emptyStats, type Stats } from './stats';
import { ATTACK } from '../data/attackTable';
import { upgradeById } from '../data/upgrades';
import { Round, type RoundSnapshot } from './round';
import { DANGER } from '../data/danger';
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
  economy: { balance: string; owned: Record<string, number>; upgrades: string[]; stats: Stats };
  round: RoundSnapshot | null;
  autoBoards: AutoBoardSnapshot[];
}

// Events the renderer and UI react to. The sim never touches the DOM; it
// only queues these.
export type WorldEvent =
  | { type: 'manualLock'; result: LockResult; earned: Num; tags: Tag[]; at: Placement }
  | { type: 'botMove'; board: number; move: BotMove; earned: Num }
  | { type: 'catchUp'; seconds: number; earned: Num }
  | { type: 'bought'; buildingId: string; owned: number }
  | { type: 'upgraded'; upgradeId: string }
  | { type: 'roundStart'; danger: number }
  | { type: 'settleStart' }
  | { type: 'roundEnd'; outcome: 'settled' | 'toppedOut'; deposited: Num; forfeited: Num }
  | { type: 'garbage'; rows: number }
  | { type: 'paused' }
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
  round: Round;

  constructor(seed: number, snapshot?: WorldSnapshot) {
    this.seed = seed;
    this.round = new Round(seed, snapshot?.round ?? null);
    if (snapshot) {
      this.manual = new Game(seed, snapshot.manual);
      this.economy = new Economy();
      this.economy.balance = num(Number(snapshot.economy.balance));
      for (const [id, n] of Object.entries(snapshot.economy.owned)) this.economy.setOwned(id, n);
      for (const id of snapshot.economy.upgrades) this.economy.upgrades.add(id);
      this.economy.stats = { ...emptyStats(), ...snapshot.economy.stats };
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
    this.applyRules();
  }

  // Manual-board rules bought as upgrades. Recomputed after every purchase;
  // bots always play the default rules.
  private applyRules(): void {
    const fx = this.economy.effects;
    const eco = this.economy;
    this.manual.rules = {
      comboGrace: flagCount(fx, 'rule:combo_grace', eco),
      b2bShield: flagCount(fx, 'rule:b2b_shield', eco) > 0,
      nextCount: 5 + flagCount(fx, 'rule:next_plus', eco),
      holdSlots: 1 + flagCount(fx, 'rule:hold2', eco),
    };
  }

  comboStep(): number {
    return evaluate(this.economy.effects, 'combo_step', [], this.economy, ATTACK.comboStep);
  }

  buyUpgrade(id: string): boolean {
    // Shopping happens between rounds.
    if (this.round.active) return false;
    if (!upgradeById(id) || !this.economy.buyUpgrade(id)) return false;
    this.applyRules();
    this.events.push({ type: 'upgraded', upgradeId: id });
    return true;
  }

  snapshot(): WorldSnapshot {
    const eco = this.economy.snapshot();
    return {
      seed: this.seed,
      accumulatorMs: this.accumulatorMs,
      manual: this.manual.snapshot(),
      economy: { balance: String(eco.balance), owned: eco.owned, upgrades: eco.upgrades, stats: eco.stats },
      round: this.round.active ? this.round.snapshot() : null,
      autoBoards: this.autoBoards.map((b) => ({ buildingId: b.buildingId, game: b.game.snapshot(), timerMs: b.timerMs })),
    };
  }

  // --- manual board -------------------------------------------------------

  manualLock(result: LockResult): Num {
    const at = this.manual.active!;
    const earned = earnedFor(result, [tag.board('manual')], this.comboStep());
    // Manual Lines go into the round's vault, raised by the danger they were
    // earned at. Outside a round (only reachable through the API) they bank.
    const danger = this.round.active ? this.round.danger : 0;
    const base = evaluate(this.economy.effects, 'income', earned.tags, this.economy, Number(earned.amount));
    const final = num(base * (1 + danger));
    if (this.round.active) this.round.vault += Number(final);
    else this.economy.balance = add(this.economy.balance, final);
    recordManual(this.economy.stats, result, Number(final));
    this.economy.stats.riskLines += Number(final) * danger;
    this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
    if (result.topped && this.round.active) this.endRound('toppedOut');
    return final;
  }

  manualHardDrop(): LockResult {
    const result = this.manual.hardDrop();
    this.manualLock(result);
    return result;
  }

  // --- rounds -------------------------------------------------------------

  wrath(): number {
    return flagCount(this.economy.effects, 'rule:wrath', this.economy);
  }

  startRound(): boolean {
    if (this.round.active) return false;
    this.round.start(this.wrath());
    this.economy.stats.rounds += 1;
    this.events.push({ type: 'roundStart', danger: this.round.danger });
    return true;
  }

  tapSettle(): boolean {
    if (!this.round.tapSettle()) return false;
    this.events.push({ type: 'settleStart' });
    return true;
  }

  pauseRound(): void {
    if (!this.round.active || this.round.paused) return;
    this.round.paused = true;
    this.events.push({ type: 'paused' });
  }

  resumeRound(): void {
    this.round.paused = false;
  }

  private endRound(outcome: 'settled' | 'toppedOut'): void {
    const vault = this.round.vault;
    const kept = outcome === 'settled' ? vault : vault * (1 - DANGER.forfeit);
    this.economy.balance = add(this.economy.balance, num(kept));
    if (outcome === 'settled') this.economy.stats.roundsSettled += 1;
    this.round.end();
    this.manual.reset();
    this.events.push({ type: 'roundEnd', outcome, deposited: num(kept), forfeited: num(vault - kept) });
  }

  private stepRound(dtMs: number): void {
    if (!this.round.live) return;
    const wrath = this.wrath();
    const { garbage, settled } = this.round.advance(dtMs, wrath);
    for (const hole of garbage) {
      if (this.manual.addGarbage(hole)) { this.endRound('toppedOut'); return; }
    }
    if (garbage.length) this.events.push({ type: 'garbage', rows: garbage.length });
    const g = this.round.gravity(wrath);
    if (g > 0) {
      const locked = this.manual.tick(dtMs, g);
      if (locked) this.manualLock(locked);
      if (!this.round.active) return;
    }
    if (settled) this.endRound('settled');
  }

  // --- shop ---------------------------------------------------------------

  // A building can be bought once its unlock conditions hold (owning the
  // previous tier) and the price is covered.
  canBuy(id: string): boolean {
    const def = buildingById(id);
    if (!def) return false;
    return this.isUnlocked(id) && this.economy.canBuy(id);
  }

  isUnlocked(id: string): boolean {
    const def = buildingById(id);
    if (!def) return false;
    return (def.unlock ?? []).every((c) => conditionMet(c, this.economy));
  }

  buy(id: string): boolean {
    const def = buildingById(id);
    if (this.round.active) return false;
    if (!def || !this.isUnlocked(id) || !this.economy.buy(id)) return false;
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
  private botTags(buildingId: string, lines: number): Tag[] {
    return [tag.board('auto'), tag.building(buildingId), tag.clear(lines)];
  }

  private botEarn(board: AutoBoard, move: BotMove): Num {
    // Every clear pays its table value; bots just get no technique bonuses.
    const flat: LockResult = { ...move.result, spin: 'none', comboIndex: 0, b2bExtended: false, perfectClear: false };
    const amount = num(attackFor(flat).total);
    if (toNumber(amount) === 0) return num(0);
    return this.economy.earn(amount, this.botTags(board.buildingId, move.result.lines));
  }

  // Expected Lines per second from every auto board, as the catch-up formula
  // sees it. Also what the shop shows as income.
  incomePerSecond(): Num {
    let total = num(0);
    for (const b of this.autoBoards) {
      const def = buildingById(b.buildingId);
      if (!def) continue;
      // The multiplier is read for the building's own clear size, which is
      // the tag its purchases' bonus filters on.
      const rate = def.pps * def.linesPerPiece * this.economy.incomeMultiplier(this.botTags(b.buildingId, def.clearSize));
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
    // A gap too long to simulate means the tab was away: the manual round
    // cannot have been played, so it waits paused.
    if (kind !== 'sim') this.pauseRound();
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
    this.stepRound(dtMs);
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
