import { Game, type GameSnapshot, type LockResult } from './game';
import { Economy } from './economy';
import { earnedFor, attackFor } from './attack';
import { tag, type Tag } from './tags';
import { POLICIES, playOne, type BotMove } from './bot/index';
import { buildingById, BUILDINGS } from '../data/buildings';
import { classifyGap, STEP_MS } from './clock';
import { conditionMet, evaluate, flagCount } from './effects';
import { recordManual, emptyStats, addStats, type Stats } from './stats';
import { ATTACK } from '../data/attackTable';
import { upgradeById } from '../data/upgrades';
import { Round, type RoundSnapshot } from './round';
import { Buffs, type BuffState } from './buffs';
import { Payout } from './payout';
import { BUFFS, type GoldenOutcome } from '../data/golden';
import { PRESTIGE, TECH_CHECKS, prestigeById, prestigeRequires } from '../data/prestige';
import { crownGain, metaFrom, metaSnapshot, type MetaSnapshot } from './prestige';
import { LEVELS } from '../data/levels';
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
  buffs: BuffState[];
  meta?: MetaSnapshot;
  // Fractions of a Line waiting to be paid (see Payout).
  carry?: { balance: number; vault: number };
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
  | { type: 'roundStart'; level: number }
  | { type: 'levelUp'; level: number }
  | { type: 'checkpoint'; banked: Num }
  | { type: 'roundEnd'; deposited: Num; forfeited: Num; level: number }
  | { type: 'garbage'; rows: number }
  | { type: 'paused' }
  | { type: 'buff'; id: string; ms: number }
  | { type: 'goldenSpawn' }
  | { type: 'golden'; outcome: GoldenOutcome; amount: Num }
  | { type: 'goldenLost' }
  | { type: 'ascended'; crowns: number }
  | { type: 'newRun'; startLines: number }
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
  buffs: Buffs;
  private toBalance = new Payout();
  private toVault = new Payout();

  constructor(seed: number, snapshot?: WorldSnapshot) {
    this.seed = seed;
    this.round = new Round(seed, snapshot?.round ?? null);
    this.buffs = new Buffs(snapshot?.buffs ?? []);
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
    this.economy.meta = metaFrom(snapshot?.meta);
    this.toBalance = new Payout(snapshot?.carry?.balance ?? 0);
    this.toVault = new Payout(snapshot?.carry?.vault ?? 0);
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
    if (this.ascending) return false;
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
      buffs: this.buffs.snapshot(),
      meta: metaSnapshot(this.economy.meta),
      carry: { balance: this.toBalance.carry, vault: this.toVault.carry },
      autoBoards: this.autoBoards.map((b) => ({ buildingId: b.buildingId, game: b.game.snapshot(), timerMs: b.timerMs })),
    };
  }

  // --- manual board -------------------------------------------------------

  manualLock(result: LockResult): Num {
    const at = this.manual.active!;
    const earned = earnedFor(result, [tag.board('manual')], this.comboStep());
    // Manual Lines go into the life's vault, times the level they were earned
    // at. Outside a life (only reachable through the API) they bank at ×1.
    const level = this.round.active ? this.round.level : 1;
    // Manual upgrades multiply the table value only; the share of bot income
    // (without buffs, or a frenzy would count twice) rides on top, and the
    // level and buffs raise both.
    const base = evaluate(this.economy.effects, 'income', earned.tags, this.economy, Number(earned.amount));
    const share = result.lines * this.economy.manualShare() * toNumber(this.incomePerSecond());
    const buff = this.buffs.multiplier(earned.tags, this.economy);
    const exact = (base + share) * level * buff;
    let final: Num;
    if (this.round.active) {
      final = num(this.toVault.take(exact));
      this.round.vault += Number(final);
      this.round.vaultRisk += Number(final) * level;
    } else {
      final = num(this.toBalance.take(exact));
      this.economy.balance = add(this.economy.balance, final);
    }
    recordManual(this.economy.stats, result, Number(final));
    // Five back-to-back clears in a row: the chain counter reads 4 after the fifth.
    if (result.b2bExtended && this.manual.b2b === 4) this.economy.stats.b2b5 += 1;
    this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
    // The golden piece pays only when it clears a line; placed flat it is gone.
    // It triggers after its own clear is paid, so a clear frenzy starts on
    // the next clear, and lucky Lines sit in the vault at the same risk.
    if (result.golden) {
      if (result.lines > 0) this.triggerGolden();
      else this.events.push({ type: 'goldenLost' });
    }
    if (result.topped && this.round.active) {
      this.endRound();
    } else if (this.round.active && result.lines > 0) {
      const { levelUp, checkpoints } = this.round.addRows(result.lines);
      const stats = this.economy.stats;
      stats.maxLevel = Math.max(stats.maxLevel, this.round.level);
      if (levelUp) this.events.push({ type: 'levelUp', level: this.round.level });
      if (checkpoints > 0) this.checkpoint(checkpoints);
    }
    return final;
  }

  // Bank the vault: its Lines go to the balance and its risk weight counts
  // toward prestige. Only banked Lines ever weigh.
  private checkpoint(passed: number): void {
    const banked = num(this.round.vault);
    this.economy.balance = add(this.economy.balance, banked);
    this.economy.stats.riskLines += this.round.vaultRisk * this.riskWeight();
    this.economy.stats.checkpoints += passed;
    this.round.vault = 0;
    this.round.vaultRisk = 0;
    this.events.push({ type: 'checkpoint', banked });
  }

  private triggerGolden(): void {
    const outcome = this.round.drawOutcome();
    this.economy.stats.goldens += 1;
    let amount = num(0);
    if (outcome.kind === 'buff') {
      this.grantBuff(outcome.buff);
    } else {
      const exact = toNumber(this.incomePerSecond()) * outcome.seconds;
      if (this.round.active) {
        amount = num(this.toVault.take(exact));
        this.round.vault += toNumber(amount);
        // Lucky Lines sit in the vault at risk, so they weigh like any other.
        this.round.vaultRisk += toNumber(amount) * this.round.level;
      } else {
        amount = num(this.toBalance.take(exact));
        this.economy.balance = add(this.economy.balance, amount);
      }
    }
    this.events.push({ type: 'golden', outcome, amount });
  }

  goldenScale(): number {
    return evaluate(this.economy.effects, 'golden_interval', [], this.economy, 1);
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
    if (this.round.active || this.ascending) return false;
    this.round.start(this.fx('start_level', LEVELS.startLevel), this.fx('rows_per_level', LEVELS.rowsPerLevel), this.goldenScale());
    this.economy.stats.rounds += 1;
    this.economy.stats.maxLevel = Math.max(this.economy.stats.maxLevel, this.round.level);
    this.events.push({ type: 'roundStart', level: this.round.level });
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

  // A top-out is the only way a life ends: the unbanked vault is lost, save
  // the share prestige upgrades keep, which also counts as banked risk.
  private endRound(): void {
    const vault = this.round.vault;
    const level = this.round.level;
    const retain = Math.min(1, Math.max(0, this.fx('retain', LEVELS.retain)));
    // The vault holds whole Lines; the kept share rounds down.
    const kept = Math.floor(vault * retain + 1e-9);
    this.economy.balance = add(this.economy.balance, num(kept));
    if (vault > 0) this.economy.stats.riskLines += this.round.vaultRisk * (kept / vault) * this.riskWeight();
    this.economy.stats.deaths += 1;
    this.round.end();
    // Under a Line of carry belongs to the finished round.
    this.toVault.carry = 0;
    this.manual.reset();
    // A golden piece belongs to its round.
    this.manual.clearGolden();
    this.events.push({ type: 'roundEnd', deposited: num(kept), forfeited: num(vault - kept), level });
  }

  private stepRound(dtMs: number): void {
    if (!this.round.live) return;
    const { garbage, golden } = this.round.advance(dtMs, { ready: !this.manual.hasGolden, scale: this.goldenScale() },
      this.fx('garbage_interval', 1));
    if (golden && this.manual.markGolden(this.manual.rules.nextCount - 1)) this.events.push({ type: 'goldenSpawn' });
    for (const hole of garbage) {
      if (this.manual.addGarbage(hole)) { this.endRound(); return; }
    }
    if (garbage.length) this.events.push({ type: 'garbage', rows: garbage.length });
    const locked = this.manual.tick(dtMs, this.round.gravity() * this.fx('gravity', 1));
    if (locked) this.manualLock(locked);
  }

  // A data-driven number: `base` with every effect on `target` applied.
  private fx(target: string, base: number): number {
    return evaluate(this.economy.effects, target, [], this.economy, base);
  }

  // --- prestige -----------------------------------------------------------

  get ascending(): boolean {
    return this.economy.meta.ascending;
  }

  riskWeight(): number {
    return this.fx('risk_weight', 1);
  }

  techChecks(): { id: string; label: string; done: boolean }[] {
    return TECH_CHECKS.map((c) => ({ id: c.id, label: c.label, done: conditionMet(c.when, this.economy) }));
  }

  techScore(): number {
    const done = this.techChecks().filter((c) => c.done).length;
    return Math.min(this.fx('tech_cap', PRESTIGE.techCapBase), done * PRESTIGE.techPerCheck);
  }

  crownPreview(): number {
    return crownGain(this.economy.meta.riskBanked, this.economy.stats.riskLines, this.techScore());
  }

  canAscend(): boolean {
    return !this.round.active && !this.ascending && this.crownPreview() >= 1;
  }

  // Bank the crowns and wipe the run. The world then waits on the prestige
  // shop until newRun().
  ascend(): number {
    if (!this.canAscend()) return 0;
    const gain = this.crownPreview();
    const meta = this.economy.meta;
    meta.crowns += gain;
    meta.crownsEarned += gain;
    meta.riskBanked += this.economy.stats.riskLines;
    meta.ascensions += 1;
    addStats(meta.lifetime, this.economy.stats);
    meta.ascending = true;
    this.economy.resetRun();
    this.autoBoards = [];
    this.manual = new Game(this.seed + meta.ascensions * 7_777);
    this.round = new Round(this.seed + meta.ascensions);
    this.buffs = new Buffs();
    this.toBalance.carry = 0;
    this.toVault.carry = 0;
    this.applyRules();
    this.events.push({ type: 'ascended', crowns: gain });
    return gain;
  }

  canBuyPrestige(id: string): boolean {
    const def = prestigeById(id);
    const meta = this.economy.meta;
    if (!def || !meta.ascending || meta.prestige.has(id)) return false;
    const req = prestigeRequires(id);
    if (req && !meta.prestige.has(req)) return false;
    return meta.crowns >= def.price;
  }

  buyPrestige(id: string): boolean {
    if (!this.canBuyPrestige(id)) return false;
    const meta = this.economy.meta;
    meta.crowns -= prestigeById(id)!.price;
    meta.prestige.add(id);
    return true;
  }

  newRun(): boolean {
    if (!this.ascending) return false;
    this.economy.meta.ascending = false;
    const start = Math.floor(this.fx('start_lines', 0));
    this.economy.balance = num(start);
    this.applyRules();
    this.events.push({ type: 'newRun', startLines: start });
    return true;
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
    if (this.ascending) return false;
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
    const amount = attackFor(flat).total;
    if (amount === 0) return num(0);
    const tags = this.botTags(board.buildingId, move.result.lines);
    const exact = evaluate(this.economy.effects, 'income', tags, this.economy, amount * this.buffs.multiplier(tags, this.economy));
    const paid = num(this.toBalance.take(exact));
    this.economy.balance = add(this.economy.balance, paid);
    return paid;
  }

  // Expected Lines per second from every auto board, as the catch-up formula
  // sees it. The shop shows it with buffs; the formula and the manual share
  // use it without.
  incomePerSecond(withBuffs = false): Num {
    let total = num(0);
    for (const b of this.autoBoards) {
      const def = buildingById(b.buildingId);
      if (!def) continue;
      // The multiplier is read for the building's own clear size, which is
      // the tag its purchases' bonus filters on.
      const tags = this.botTags(b.buildingId, def.clearSize);
      const buff = withBuffs ? this.buffs.multiplier(tags, this.economy) : 1;
      const rate = def.pps * def.linesPerPiece * this.economy.incomeMultiplier(tags) * buff;
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
    // Buffs keep running while the tab is away but pay nothing extra there,
    // so leaving a frenzy in a hidden tab is not a way to farm it.
    if (kind !== 'sim') this.buffs.tick(gap);
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
    this.buffs.tick(dtMs);
  }

  // Start a buff, scaled by upgrades that lengthen buffs.
  grantBuff(id: string): void {
    const def = BUFFS[id];
    if (!def) return;
    const ms = evaluate(this.economy.effects, 'buff_duration', [], this.economy, def.durationMs);
    this.buffs.grant(id, ms);
    this.events.push({ type: 'buff', id, ms });
  }

  catchUp(seconds: number): void {
    const earned = num(this.toBalance.take(toNumber(mul(this.incomePerSecond(), num(seconds)))));
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
