import { Game, type GameSnapshot, type LockResult } from './game';
import { Economy } from './economy';
import { earnedFor, botAttack, isTechClear } from './attack';
import { tag, type Tag } from './tags';
import { policyFor, playOne, type BotMove } from './bot/index';
import { OPENERS } from '../data/openers';
import type { BotPolicy } from './bot/policy';
import { buildingById, BUILDINGS, helperEvery } from '../data/buildings';
import { SYNERGIES } from '../data/synergies';
import { classifyGap, STEP_MS } from './clock';
import { conditionMet, evaluate, flagCount } from './effects';
import { recordManual, emptyStats, addStats, type Stats } from './stats';
import { ATTACK } from '../data/attackTable';
import { upgradeById } from '../data/upgrades';
import { Round, type RoundSnapshot } from './round';
import { Buffs, type BuffState } from './buffs';
import { Payout } from './payout';
import { BUFFS, WRATH, type GoldenOutcome } from '../data/golden';
import { PRESTIGE, TECH_CHECKS, prestigeById, prestigeRequires } from '../data/prestige';
import { crownGain, metaFrom, metaSnapshot, type MetaSnapshot } from './prestige';
import { LEVELS, lockAt } from '../data/levels';
import { GARBAGE } from '../data/garbage';
import { ACHIEVEMENTS } from '../data/achievements';
import { challengePoints, CHALLENGE, BUILDING_KINDS_ANY } from '../data/challenges';
import { EVENTS, RIVAL_DUEL, type EventKind } from '../data/events';
import { startEvent, attackRows, cancel, randomHole, type LifeEvent } from './events';
import { ccWasmBot, CC_DEFAULT } from './bot/ccWasm';
import { tag as tagOf } from './tags';
import { createRng, type Rng } from './rng';
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
  // PER SECOND through this run, one sample every `sampleEvery` seconds of play.
  samples?: number[];
  sampleEvery?: number;
  // Purchase garbage still to rise, and what sizes the next purchase's rows.
  garbage?: { queue: number; carry: number; manualRate: number; holes: number };
}

export const SAMPLE_SECONDS = 30;
const MAX_SAMPLES = 240;

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
  // Queued purchase garbage a clear's attack wiped out.
  | { type: 'garbageCancel'; rows: number }
  // A purchase sent rows to the queue.
  | { type: 'garbageQueued'; rows: number }
  // Garbage rows cleared with a technique paid this much.
  | { type: 'garbageBonus'; rows: number; amount: Num }
  | { type: 'paused' }
  | { type: 'buff'; id: string; ms: number }
  | { type: 'goldenSpawn'; wrath: boolean }
  // `amount` is what lucky paid, or what ruin took.
  | { type: 'golden'; outcome: GoldenOutcome; amount: Num; wrath: boolean }
  | { type: 'goldenLost'; wrath: boolean }
  | { type: 'ascended'; crowns: number }
  | { type: 'newRun'; startLines: number }
  | { type: 'hardcoreOver'; crowns: number }
  | { type: 'achievement'; id: string }
  // A life event starting or ending; `amount` is what it paid.
  | { type: 'lifeEvent'; kind: EventKind; phase: 'start' | 'won' | 'lost' | 'over'; amount: Num }
  // The RIVAL building's board beaten: the streak it reached and the pay.
  | { type: 'rivalWin'; streak: number; amount: Num }
  | { type: 'helperRow'; amount: Num }
  | { type: 'slept'; seconds: number };

export class World {
  manual: Game;
  economy: Economy;
  autoBoards: AutoBoard[] = [];
  // Where a board's decisions come from. The page swaps in one fed by a
  // worker running ahead; the decisions are the same either way.
  policyFor: (board: AutoBoard) => BotPolicy | undefined = (board) => policyFor(this.skillFor(board));

  // The building's own skill, or the one a play synergy switched it to.
  skillFor(board: AutoBoard): string {
    const variant = SYNERGIES.find((s) => s.variant?.building === board.buildingId && this.economy.hasUpgrade(s.id));
    const skill = variant?.variant!.skill ?? buildingById(board.buildingId)?.skill ?? '';
    // OPENER plays every named build researched so far.
    if (skill === 'opener') {
      const builds = OPENERS.filter((_, i) => this.economy.hasPrestige(`opener_${i + 1}`)).map((o) => o.id);
      if (builds.length) return `opener:${builds.join(',')}`;
    }
    return skill;
  }
  events: WorldEvent[] = [];
  private accumulatorMs = 0;
  private lastTickMs: number | null = null;
  private readonly seed: number;
  private boardsCreated = 0;
  round: Round;
  buffs: Buffs;
  private toBalance = new Payout();
  private toVault = new Payout();
  // Game time until the next sweep of the achievement list.
  private achievementMs = 0;
  // Tests of exact income turn this off: each achievement's +1% would blur
  // the amounts they check.
  awardAchievements = true;
  // The life event on now (rival, invader, helper), if any.
  lifeEvent: LifeEvent | null = null;
  // The RIVAL building's fight with the manual board, while a life runs.
  duel: { toMe: number; toRival: number; myCarry: number; rivalCarry: number; holes: Rng } | null = null;
  // HELPER: qualifying clears since the last garbage row it lifted.
  private helperCount = 0;
  // Purchase garbage waiting to rise (the red gauge), the fraction of a row
  // of attack carried toward cancelling it, and the hand's recent Lines a
  // second (sizes purchases while bots earn little).
  garbageQueue = 0;
  private garbageCarry = 0;
  private manualRate = 0;
  private garbageHoles: Rng;
  // PER SECOND (without buffs) through the run, for the stats graph.
  samples: number[] = [];
  sampleEvery = SAMPLE_SECONDS;
  private sampleMs = 0;

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
    this.samples = [...(snapshot?.samples ?? [])];
    this.sampleEvery = snapshot?.sampleEvery ?? SAMPLE_SECONDS;
    this.garbageQueue = snapshot?.garbage?.queue ?? 0;
    this.garbageCarry = snapshot?.garbage?.carry ?? 0;
    this.manualRate = snapshot?.garbage?.manualRate ?? 0;
    this.garbageHoles = createRng(snapshot?.garbage?.holes ?? (seed * 2654435761 + 97) >>> 0);
    this.applyRules();
    this.countBoardGarbage();
    this.syncLive();
  }

  // Manual-board rules bought as upgrades. Recomputed after every purchase;
  // bots always play the default rules.
  private applyRules(): void {
    const fx = this.economy.effects;
    const eco = this.economy;
    this.manual.rules = {
      comboGrace: flagCount(fx, 'rule:combo_grace', eco),
      b2bShield: flagCount(fx, 'rule:b2b_shield', eco) > 0,
      nextCount: Math.max(1, Math.round(this.fx('next_count', 5 + flagCount(fx, 'rule:next_plus', eco)))),
      holdSlots: Math.max(0, Math.round(this.fx('hold_slots', 1))),
    };
  }

  // Challenge rules can shut run upgrades, or synergies, out.
  upgradeAllowed(id: string): boolean {
    const fx = this.economy.effects;
    if (flagCount(fx, 'rule:no_upgrades', this.economy) > 0) return false;
    return !(flagCount(fx, 'rule:no_synergies', this.economy) > 0 && upgradeById(id)?.group === 'synergy');
  }

  // How many kinds of building this run may own (a challenge rule).
  buildingKinds(): number {
    return this.fx('building_kinds', BUILDING_KINDS_ANY);
  }

  comboStep(): number {
    return evaluate(this.economy.effects, 'combo_step', [], this.economy, ATTACK.comboStep);
  }

  buyUpgrade(id: string): boolean {
    this.syncLive();
    if (this.ascending || !this.upgradeAllowed(id)) return false;
    const price = Number(this.economy.upgradePrice(id));
    if (!upgradeById(id) || !this.economy.buyUpgrade(id)) return false;
    this.queueGarbage(price);
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
      samples: [...this.samples],
      sampleEvery: this.sampleEvery,
      garbage: { queue: this.garbageQueue, carry: this.garbageCarry, manualRate: this.manualRate, holes: this.garbageHoles.state() },
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
    this.economy.stats.linesEarned += toNumber(final);
    this.manualRate += Number(final) / GARBAGE.manualWindowSeconds;
    if (this.round.active && result.garbageCleared && isTechClear(result)) this.garbageBonus(result.garbageCleared.clean + result.garbageCleared.cheese);
    if (this.round.active && !result.topped && (this.buyGarbageOnLock(result) || this.duelOnLock(result) || this.helperOnLock(result))) {
      this.countBoardGarbage();
      this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
      this.endRound();
      return final;
    }
    if (this.lifeEvent && this.round.active && !result.topped && this.eventOnLock(result, toNumber(final))) {
      // Incoming garbage pushed the stack through the ceiling.
      this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
      this.endRound();
      return final;
    }
    // Five back-to-back clears in a row: the chain counter reads 4 after the fifth.
    if (result.b2bExtended && this.manual.b2b === 4) this.economy.stats.b2b5 += 1;
    this.events.push({ type: 'manualLock', result, earned: final, tags: earned.tags, at });
    // The golden piece pays only when it clears a line; placed flat it is gone.
    // It triggers after its own clear is paid, so a clear frenzy starts on
    // the next clear, and lucky Lines sit in the vault at the same risk.
    if (result.lines === 4 && this.buffs.active.some((b) => b.id === 'clot')) this.economy.stats.clotTetrises += 1;
    if (result.golden) {
      if (result.lines > 0 && result.wrath) this.triggerWrath();
      else if (result.lines > 0) this.triggerGolden();
      else {
        this.economy.stats.goldensLost += 1;
        this.events.push({ type: 'goldenLost', wrath: !!result.wrath });
      }
    }
    this.triggerSynergies(result);
    if (result.topped && this.round.active) {
      this.endRound();
    } else if (this.round.active && result.lines > 0) {
      const { levelUp, checkpoints } = this.round.addRows(result.lines);
      const stats = this.economy.stats;
      stats.maxLevel = Math.max(stats.maxLevel, this.round.level);
      stats.maxLifeRows = Math.max(stats.maxLifeRows, this.round.rows);
      if (levelUp) this.events.push({ type: 'levelUp', level: this.round.level });
      if (checkpoints > 0) this.checkpoint(checkpoints);
    }
    this.countBoardGarbage();
    this.checkAchievements();
    return final;
  }

  // --- purchase garbage --------------------------------------------------

  // Rows a purchase sends: its price over a minute of what the game earns
  // (bots plus the hand's recent rate), rounded down, at most four, times
  // the buy_garbage effects. With no income yet there is nothing to weigh it
  // against, and nothing to slow: no rows.
  garbageFor(price: number): number {
    this.syncLive();
    const perSecond = toNumber(this.incomePerSecond()) + this.manualRate;
    if (perSecond <= 0) return 0;
    const raw = (price / (perSecond * GARBAGE.secondsPerRow)) * this.fx('buy_garbage', 1);
    const cap = this.economy.lifeLive ? GARBAGE.maxRowsPerBuy : GARBAGE.idleMaxRows;
    return Math.min(cap, Math.floor(raw + 1e-9));
  }

  private queueGarbage(price: number): void {
    const rows = this.garbageFor(price);
    if (rows <= 0) return;
    this.garbageQueue += rows;
    this.events.push({ type: 'garbageQueued', rows });
  }

  // A clear's attack cancels queued rows first; a piece that clears nothing
  // lets up to four rise. True if they pushed the stack out.
  private buyGarbageOnLock(result: LockResult): boolean {
    if (this.garbageQueue <= 0) return false;
    const a = attackRows(result, this.garbageCarry);
    this.garbageCarry = a.carry;
    const before = this.garbageQueue;
    this.garbageQueue = cancel(this.garbageQueue, a.rows).incoming;
    if (this.garbageQueue < before) this.events.push({ type: 'garbageCancel', rows: before - this.garbageQueue });
    if (result.lines > 0 || this.garbageQueue <= 0) return false;
    const n = Math.min(this.garbageQueue, GARBAGE.maxRowsPerLock);
    this.garbageQueue -= n;
    for (let i = 0; i < n; i++) if (this.manual.addGarbage(randomHole(this.garbageHoles))) return true;
    this.events.push({ type: 'garbage', rows: n });
    return false;
  }

  // Garbage rows cleared by a technique: ten seconds of PER SECOND each, into the vault.
  private garbageBonus(rows: number): void {
    const amount = this.payVault(toNumber(this.incomePerSecond()) * GARBAGE.techBonusSeconds * rows);
    this.economy.stats.garbageBonusRows += rows;
    this.events.push({ type: 'garbageBonus', rows, amount });
  }

  // The penalty reads this count; refreshed whenever the board can change.
  private countBoardGarbage(): void {
    this.economy.boardGarbage = Math.min(GARBAGE.penaltyMaxRows, this.manual.garbageRows());
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

  // Link synergies: a tetris or perfect clear by hand starts a bot buff.
  private triggerSynergies(result: LockResult): void {
    for (const s of SYNERGIES) {
      if (!s.trigger || !this.economy.hasUpgrade(s.id)) continue;
      const hit = s.trigger.on === 'tetris' ? result.lines === 4 : s.trigger.on === 'pc' ? result.perfectClear : !!result.garbageCleared;
      if (hit) this.grantBuff(s.trigger.buff);
    }
  }

  private triggerGolden(): void {
    const outcome = this.round.drawOutcome();
    this.economy.stats.goldens += 1;
    let amount = num(0);
    if (outcome.kind === 'buff') {
      this.grantBuff(outcome.buff);
    } else if (outcome.kind === 'lucky') {
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
      this.economy.stats.linesEarned += toNumber(amount);
    }
    this.events.push({ type: 'golden', outcome, amount, wrath: false });
  }

  private triggerWrath(): void {
    const fx = this.economy.effects;
    const outcome = this.round.drawOutcome(WRATH.outcomes, (o) => evaluate(fx, 'wrath_weight', [`wrath:${o.id}`], this.economy, o.weight));
    this.economy.stats.wraths += 1;
    let amount = num(0);
    if (outcome.kind === 'buff') {
      this.grantBuff(outcome.buff);
    } else if (outcome.kind === 'ruin') {
      this.economy.stats.ruins += 1;
      const share = Math.min(1, Math.max(0, this.fx('ruin_share', outcome.share)));
      const vault = this.round.vault;
      const lost = Math.floor(vault * share + 1e-9);
      if (vault > 0) this.round.vaultRisk *= 1 - lost / vault;
      this.round.vault = vault - lost;
      amount = num(lost);
    }
    this.events.push({ type: 'golden', outcome, amount, wrath: true });
  }

  // Chance a due golden piece comes as a wrath piece: none until the WRATH
  // prestige chain opens them, then by how many wrath upgrades this run owns.
  wrathChance(): number {
    if (flagCount(this.economy.effects, 'wrath_pieces', this.economy) === 0) return 0;
    return WRATH.chance[Math.min(WRATH.chance.length - 1, this.wrath())] ?? 0;
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

  // The level the next life starts at (wrath and prestige raise it).
  nextStartLevel(): number {
    return Math.max(1, Math.floor(this.fx('start_level', LEVELS.startLevel)));
  }

  // Prices and purchase garbage read whether a life is live; kept in step
  // with every change of state.
  private syncLive(): void {
    this.economy.lifeLive = this.round.live ? 1 : 0;
  }

  startRound(): boolean {
    if (this.round.active || this.ascending) return false;
    this.round.start(this.nextStartLevel(), this.fx('rows_per_level', LEVELS.rowsPerLevel), this.goldenScale());
    this.economy.stats.rounds += 1;
    this.economy.stats.maxLevel = Math.max(this.economy.stats.maxLevel, this.round.level);
    this.events.push({ type: 'roundStart', level: this.round.level });
    this.syncLive();
    return true;
  }

  pauseRound(): void {
    if (!this.round.active || this.round.paused) return;
    this.round.paused = true;
    this.syncLive();
    this.events.push({ type: 'paused' });
  }

  resumeRound(): void {
    this.round.paused = false;
    this.syncLive();
  }

  // A top-out is the only way a life ends: the unbanked vault is lost, save
  // the share prestige upgrades keep, which also counts as banked risk. In a
  // hardcore run nothing is kept and the run ascends on the spot.
  private endRound(): void {
    if (this.lifeEvent) this.endEvent('lost', num(0));
    this.duel = null;
    this.economy.meta.rivalStreak = 0;
    this.helperCount = 0;
    const vault = this.round.vault;
    const level = this.round.level;
    const hardcore = this.economy.meta.hardcore;
    const retain = hardcore ? 0 : Math.min(1, Math.max(0, this.fx('retain', LEVELS.retain)));
    // The vault holds whole Lines; the kept share rounds down.
    const kept = Math.floor(vault * retain + 1e-9);
    this.economy.balance = add(this.economy.balance, num(kept));
    if (vault > 0) this.economy.stats.riskLines += this.round.vaultRisk * (kept / vault) * this.riskWeight();
    this.economy.stats.deaths += 1;
    this.round.end();
    this.syncLive();
    // Under a Line of carry belongs to the finished round.
    this.toVault.carry = 0;
    // Garbage still on the board waits for the next life: a top-out is no
    // way to shed it.
    this.garbageQueue += this.manual.garbageRows();
    this.manual.reset();
    // The next life opens on a fresh bag, hold empty.
    this.manual.newBag(this.round.eventSeed());
    this.countBoardGarbage();
    // A golden piece belongs to its round.
    this.manual.clearGolden();
    this.events.push({ type: 'roundEnd', deposited: num(kept), forfeited: num(vault - kept), level });
    if (hardcore) {
      const crowns = this.doAscend();
      this.events.push({ type: 'hardcoreOver', crowns });
    }
  }

  private stepRound(dtMs: number): void {
    if (!this.round.live) return;
    const ev = this.lifeEvent;
    // Timed cheese only in hardcore, and while an invader is on (a row
    // every few seconds, whatever the level).
    const invader = ev?.kind === 'invader';
    const timed = invader || flagCount(this.economy.effects, 'timed_garbage', this.economy) > 0;
    const { garbage: rows, golden } = this.round.advance(dtMs, { ready: !this.manual.hasGolden, scale: this.goldenScale() },
      invader ? 1 : this.fx('garbage_interval', 1), timed ? this.fx('garbage_from_level', LEVELS.garbageFromLevel) : Infinity,
      invader ? EVENTS.invader.rowSeconds : undefined);
    // Attack banked against an invader blocks rows before they land.
    let garbage = rows;
    if (ev?.kind === 'invader' && ev.shield > 0) {
      const blocked = Math.min(ev.shield, rows.length);
      ev.shield -= blocked;
      garbage = rows.slice(blocked);
    }
    if (this.stepEvent(dtMs)) return;
    // A rival building on the board starts its fight with the life.
    if (!this.duel && this.economy.owned('rival') > 0) this.duel = { toMe: 0, toRival: 0, myCarry: 0, rivalCarry: 0, holes: createRng(this.round.eventSeed()) };
    const owned = new Set((['rival', 'invader', 'helper'] as const).filter((k) => this.economy.owned(k) > 0));
    const due = this.round.tickEvent(dtMs, this.lifeEvent !== null, owned);
    if (due) this.beginEvent(due);
    const stats = this.economy.stats;
    stats.maxLifeSeconds = Math.max(stats.maxLifeSeconds, Math.floor(this.round.elapsedMs / 1000));
    if (golden) {
      const wrath = this.round.drawWrath(this.wrathChance());
      if (this.manual.markGolden(this.manual.rules.nextCount - 1, wrath)) this.events.push({ type: 'goldenSpawn', wrath });
    }
    for (const hole of garbage) {
      if (this.manual.addGarbage(hole)) { this.endRound(); return; }
    }
    if (garbage.length) this.events.push({ type: 'garbage', rows: garbage.length });
    this.countBoardGarbage();
    const pace = this.fx('gravity_pace', LEVELS.gravityPace);
    const lock = lockAt(this.round.level, pace);
    this.manual.lockDelayMs = lock.delayMs;
    this.manual.lockResetLimit = lock.resets;
    const locked = this.manual.tick(dtMs, this.round.gravity(pace) * this.fx('gravity', 1));
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
    return TECH_CHECKS.map((c) => ({ id: c.id, label: c.label, done: c.when.every((w) => conditionMet(w, this.economy)) }));
  }

  techScore(): number {
    const done = this.techChecks().filter((c) => c.done).length;
    return Math.min(this.fx('tech_cap', PRESTIGE.techCapBase), done * PRESTIGE.techPerCheck);
  }

  crownPreview(): number {
    return crownGain(this.economy.meta.riskBanked, this.economy.stats.riskLines, this.techScore());
  }

  // Between lives, or mid-life in a hardcore run (its only life never ends
  // on its own terms otherwise).
  canAscend(): boolean {
    const midLife = this.round.active && !this.economy.meta.hardcore;
    return !midLife && !this.ascending && this.crownPreview() >= 1;
  }

  // Bank the crowns and wipe the run. The world then waits on the prestige
  // shop until newRun(). A hardcore life still running banks its vault first,
  // so walking away alive keeps everything earned.
  ascend(): number {
    if (!this.canAscend()) return 0;
    if (this.round.active) {
      this.checkpoint(0);
      this.round.end();
      this.toVault.carry = 0;
    }
    // Ascending alive clears a challenge run.
    const meta = this.economy.meta;
    const points = challengePoints(meta.challenge);
    if (points >= CHALLENGE.minPoints) meta.challengeBest = Math.max(meta.challengeBest, points);
    return this.doAscend();
  }

  challengeUnlocked(): boolean {
    return this.economy.meta.achievements.has('hc_level20');
  }

  // The next run's challenge pick; empty for none. Picks under the minimum
  // are kept (the shop shows them) but NEW RUN will not start them.
  setNextChallenge(pick: Record<string, number>): boolean {
    if (!this.ascending || !this.challengeUnlocked()) return false;
    this.economy.meta.nextChallenge = { ...pick };
    return true;
  }

  canStartRun(): boolean {
    const pick = this.economy.meta.nextChallenge;
    const pts = challengePoints(pick);
    return pts === 0 || (pts >= CHALLENGE.minPoints && this.challengeUnlocked());
  }

  // A hardcore top-out lands here directly, crowns or not.
  private doAscend(): number {
    // The run's last state counts before it is wiped.
    this.checkAchievements();
    this.lifeEvent = null;
    this.duel = null;
    this.economy.meta.rivalStreak = 0;
    // The challenge's rules end with its run.
    this.economy.meta.challenge = {};
    const gain = this.crownPreview();
    const meta = this.economy.meta;
    if (toNumber(this.economy.balance) === 0) meta.emptyAscensions += 1;
    if (meta.hardcore) {
      meta.hardcoreAscensions += 1;
      const s = this.economy.stats;
      meta.hardcoreBest = { level: Math.max(meta.hardcoreBest.level, s.maxLevel), rows: Math.max(meta.hardcoreBest.rows, s.maxLifeRows) };
    }
    meta.crowns += gain;
    meta.crownsEarned += gain;
    meta.riskBanked += this.economy.stats.riskLines;
    meta.ascensions += 1;
    addStats(meta.lifetime, this.economy.stats);
    meta.ascending = true;
    this.economy.resetRun();
    this.autoBoards = [];
    this.samples = [];
    this.sampleEvery = SAMPLE_SECONDS;
    this.manual = new Game(this.seed + meta.ascensions * 7_777);
    this.round = new Round(this.seed + meta.ascensions);
    this.buffs = new Buffs();
    this.toBalance.carry = 0;
    this.toVault.carry = 0;
    this.applyRules();
    this.events.push({ type: 'ascended', crowns: gain });
    this.checkAchievements();
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

  // The mode of the run NEW RUN starts; it can only be picked on the
  // prestige shop, and stays as it was unless changed.
  setNextHardcore(on: boolean): boolean {
    if (!this.ascending) return false;
    this.economy.meta.nextHardcore = on;
    return true;
  }

  newRun(): boolean {
    if (!this.ascending || !this.canStartRun()) return false;
    const meta = this.economy.meta;
    meta.ascending = false;
    // A challenge run is a hardcore run with its rules on top.
    meta.challenge = challengePoints(meta.nextChallenge) > 0 ? { ...meta.nextChallenge } : {};
    meta.hardcore = meta.nextHardcore || challengePoints(meta.challenge) > 0;
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
    return this.isUnlocked(id) && this.kindAllowed(id) && this.economy.canBuy(id);
  }

  private kindAllowed(id: string): boolean {
    if (this.economy.owned(id) > 0) return true;
    const kinds = BUILDINGS.filter((b) => this.economy.owned(b.id) > 0).length;
    return kinds < this.buildingKinds();
  }

  isUnlocked(id: string): boolean {
    const def = buildingById(id);
    if (!def) return false;
    return (def.unlock ?? []).every((c) => conditionMet(c, this.economy));
  }

  buy(id: string): boolean {
    this.syncLive();
    const def = buildingById(id);
    if (this.ascending) return false;
    const price = Number(this.economy.price(id));
    if (!def || !this.isUnlocked(id) || !this.kindAllowed(id) || !this.economy.buy(id)) return false;
    this.queueGarbage(price);
    // The first copy of a building is its board; later copies only add income.
    if (!this.autoBoards.some((b) => b.buildingId === id)) {
      // Each board gets its own stream so two boards never mirror each other.
      const seed = this.seed * 7919 + this.boardsCreated * 104729 + 1;
      const game = new Game(seed);
      if (def.mode) game.setMode(def.mode, seed);
      this.autoBoards.push({ buildingId: id, game, timerMs: 1000 / def.pps, lastMove: null });
      this.boardsCreated++;
    }
    this.economy.meta.buildingsSeen.add(id);
    this.events.push({ type: 'bought', buildingId: id, owned: this.economy.owned(id) });
    this.checkAchievements();
    return true;
  }

  // --- time ---------------------------------------------------------------

  // Income tags a bot's clear carries.
  private botTags(buildingId: string, lines: number): Tag[] {
    return [tag.board('auto'), tag.building(buildingId), tag.clear(lines)];
  }

  private botEarn(board: AutoBoard, move: BotMove): Num {
    const def = buildingById(board.buildingId);
    const amount = botAttack(move.result, def?.tech, def?.garbageBonus);
    if (amount === 0) return num(0);
    const tags = this.botTags(board.buildingId, move.result.lines);
    const exact = evaluate(this.economy.effects, 'income', tags, this.economy, amount * this.buffs.multiplier(tags, this.economy));
    const paid = num(this.toBalance.take(exact));
    this.economy.balance = add(this.economy.balance, paid);
    this.economy.stats.linesEarned += toNumber(paid);
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
    this.syncLive();
    // The hand's recent rate fades over about a minute.
    this.manualRate *= Math.exp(-dtMs / 1000 / GARBAGE.manualWindowSeconds);
    this.stepRound(dtMs);
    for (let i = 0; i < this.autoBoards.length; i++) {
      const board = this.autoBoards[i]!;
      const def = buildingById(board.buildingId);
      if (!def) continue;
      board.timerMs -= dtMs;
      while (board.timerMs <= 0) {
        board.timerMs += 1000 / (def.pps * this.ppsFactor(board.buildingId));
        const policy = this.policyFor(board);
        if (!policy) break;
        const move = playOne(board.game, policy);
        if (!move) break;
        board.lastMove = move;
        const earned = this.botEarn(board, move);
        this.events.push({ type: 'botMove', board: i, move, earned });
        if (board.buildingId === 'rival') this.duelOnRivalMove(board, move.result);
      }
    }
    this.buffs.tick(dtMs);
    // Bot Lines add up between the events that check; a sweep a second
    // catches thresholds they cross.
    this.economy.stats.playSeconds += dtMs / 1000;
    this.sampleMs += dtMs;
    if (this.sampleMs >= this.sampleEvery * 1000) {
      this.sampleMs = 0;
      this.samples.push(toNumber(this.incomePerSecond()));
      // Past the cap, every other sample goes and the gap doubles, so the
      // whole run still fits.
      if (this.samples.length > MAX_SAMPLES) {
        this.samples = this.samples.filter((_, i) => i % 2 === 0);
        this.sampleEvery *= 2;
      }
    }
    this.achievementMs += dtMs;
    if (this.achievementMs >= 1000) {
      this.achievementMs = 0;
      this.checkAchievements();
    }
  }

  // --- buildings that reach into the manual board ------------------------

  // A rival that has won streak fights plays this much faster.
  private ppsFactor(buildingId: string): number {
    return buildingId === 'rival' && this.duel ? 1 + RIVAL_DUEL.ppsPerWin * this.economy.meta.rivalStreak : 1;
  }

  // My lock against the rival: attack cancels what is coming, the rest goes
  // across; a lock that clears nothing takes what is waiting. True if that
  // garbage topped the life out.
  private duelOnLock(result: LockResult): boolean {
    const d = this.duel;
    if (!d) return false;
    const a = attackRows(result, d.myCarry);
    d.myCarry = a.carry;
    const c = cancel(d.toMe, a.rows);
    d.toMe = c.incoming;
    d.toRival += c.over;
    if (result.lines === 0 && d.toMe > 0) {
      const n = Math.min(d.toMe, RIVAL_DUEL.maxRowsPerLock);
      d.toMe -= n;
      for (let i = 0; i < n; i++) if (this.manual.addGarbage(randomHole(d.holes))) return true;
    }
    return false;
  }

  private duelOnRivalMove(board: AutoBoard, r: LockResult): void {
    const d = this.duel;
    // A paused life is not fought; the rival plays on alone.
    if (!d || !this.round.live) return;
    const meta = this.economy.meta;
    let beaten = r.topped;
    if (!beaten) {
      const a = attackRows(r, d.rivalCarry);
      d.rivalCarry = a.carry;
      const sent = Math.floor(a.rows * (1 + RIVAL_DUEL.attackPerWin * meta.rivalStreak));
      const c = cancel(d.toRival, sent);
      d.toRival = c.incoming;
      d.toMe += c.over;
      if (r.lines === 0 && d.toRival > 0) {
        const n = Math.min(d.toRival, RIVAL_DUEL.maxRowsPerLock);
        d.toRival -= n;
        for (let i = 0; i < n && !beaten; i++) beaten = board.game.addGarbage(randomHole(d.holes));
      }
    }
    if (!beaten) return;
    // Beaten: its board starts over, the next rival is stronger, and the
    // win pays more the longer the streak.
    if (!r.topped) board.game.reset();
    d.toRival = 0;
    meta.rivalStreak += 1;
    meta.rivalBest = Math.max(meta.rivalBest, meta.rivalStreak);
    this.economy.stats.rivalWins += 1;
    const reward = toNumber(this.incomePerSecond()) * RIVAL_DUEL.rewardSecondsPerLevel * this.round.level * meta.rivalStreak;
    this.events.push({ type: 'rivalWin', streak: meta.rivalStreak, amount: this.payVault(reward) });
  }

  // HELPER: every so many combo or back-to-back clears, one garbage row
  // lifted and paid like a single.
  private helperOnLock(result: LockResult): boolean {
    const every = helperEvery(this.economy.owned('helper'));
    if (every <= 0 || result.lines === 0 || !(result.comboIndex > 0 || result.b2bExtended)) return false;
    this.helperCount += 1;
    if (this.helperCount < every) return false;
    this.helperCount = 0;
    if (!this.manual.removeGarbageRow()) return false;
    this.economy.stats.helperRows += 1;
    const single = evaluate(this.economy.effects, 'income', [tagOf.board('manual'), tagOf.clear(1)], this.economy, ATTACK.normal[1]);
    const amount = this.payVault(single * this.round.level * this.buffs.multiplier([tagOf.board('manual')], this.economy));
    this.events.push({ type: 'helperRow', amount });
    return false;
  }

  // --- life events -------------------------------------------------------

  beginEvent(kind: EventKind): void {
    this.lifeEvent = startEvent(kind, this.round.level, this.round.eventSeed(), this.fx('rival_pace', EVENTS.rival.pace));
    this.events.push({ type: 'lifeEvent', kind, phase: 'start', amount: num(0) });
  }

  private endEvent(phase: 'won' | 'lost' | 'over', amount: Num): void {
    const ev = this.lifeEvent;
    if (!ev) return;
    this.lifeEvent = null;
    this.events.push({ type: 'lifeEvent', kind: ev.kind, phase, amount });
  }

  // Lines into the vault at the life's level, like lucky Lines.
  private payVault(exact: number): Num {
    const amount = num(this.toVault.take(exact));
    this.round.vault += toNumber(amount);
    this.round.vaultRisk += toNumber(amount) * this.round.level;
    this.economy.stats.linesEarned += toNumber(amount);
    return amount;
  }

  // A manual lock during an event. True if garbage from it topped the life out.
  private eventOnLock(result: LockResult, earned: number): boolean {
    const ev = this.lifeEvent!;
    if (ev.kind === 'invader') {
      ev.earned += earned;
      const a = attackRows(result, ev.carry);
      ev.carry = a.carry;
      ev.shield += a.rows;
      return false;
    }
    if (ev.kind === 'helper') {
      if (result.lines > 0 && (result.comboIndex > 0 || result.b2bExtended) && this.manual.removeGarbageRow()) {
        ev.rows += 1;
        this.economy.stats.helperRows += 1;
        // Paid like a single by hand, at the level.
        const single = evaluate(this.economy.effects, 'income', [tagOf.board('manual'), tagOf.clear(1)], this.economy, ATTACK.normal[1]);
        this.payVault(single * this.round.level * this.buffs.multiplier([tagOf.board('manual')], this.economy));
      }
      return false;
    }
    // Rival: attack cancels what is coming first, the rest goes across; a
    // piece that clears nothing takes the rows still waiting.
    const a = attackRows(result, ev.myCarry);
    ev.myCarry = a.carry;
    const c = cancel(ev.toMe, a.rows);
    ev.toMe = c.incoming;
    ev.toRival += c.over;
    if (result.lines === 0 && ev.toMe > 0) {
      const n = Math.min(ev.toMe, EVENTS.rival.maxRowsPerLock);
      ev.toMe -= n;
      for (let i = 0; i < n; i++) if (this.manual.addGarbage(randomHole(ev.holes))) return true;
    }
    return false;
  }

  // Time passing during an event. True if the life ended.
  private stepEvent(dtMs: number): boolean {
    const ev = this.lifeEvent;
    if (!ev) return false;
    if (ev.kind === 'invader' || ev.kind === 'helper') {
      ev.msLeft -= dtMs;
      if (ev.msLeft > 0) return false;
      if (ev.kind === 'invader') {
        this.economy.stats.invadersSurvived += 1;
        this.endEvent('won', this.payVault(ev.earned * EVENTS.invader.payout));
      } else {
        this.endEvent('over', num(0));
      }
      return false;
    }
    // The rival plays its own pieces at its own pace.
    ev.timerMs -= dtMs;
    while (ev.timerMs <= 0 && this.lifeEvent === ev) {
      ev.timerMs += 1000 / ev.pps;
      const move = playOne(ev.game, this.rivalPolicy(ev.level));
      if (!move) break;
      const r = move.result;
      if (r.topped) {
        this.economy.stats.rivalWins += 1;
        const reward = toNumber(this.incomePerSecond()) * EVENTS.rival.rewardSecondsPerLevel * ev.level;
        this.endEvent('won', this.payVault(reward));
        return false;
      }
      const a = attackRows(r, ev.rivalCarry);
      ev.rivalCarry = a.carry;
      const c = cancel(ev.toRival, a.rows);
      ev.toRival = c.incoming;
      ev.toMe += c.over;
      if (r.lines === 0 && ev.toRival > 0) {
        const n = Math.min(ev.toRival, EVENTS.rival.maxRowsPerLock);
        ev.toRival -= n;
        for (let i = 0; i < n; i++) {
          if (ev.game.addGarbage(randomHole(ev.holes))) {
            this.economy.stats.rivalWins += 1;
            const reward = toNumber(this.incomePerSecond()) * EVENTS.rival.rewardSecondsPerLevel * ev.level;
            this.endEvent('won', this.payVault(reward));
            return false;
          }
        }
      }
    }
    return false;
  }

  private rivalPolicies = new Map<number, BotPolicy>();
  private rivalPolicy(level: number): BotPolicy {
    const nodes = EVENTS.rival.nodes(level);
    let p = this.rivalPolicies.get(nodes);
    if (!p) { p = ccWasmBot({ weights: CC_DEFAULT, nodes }); this.rivalPolicies.set(nodes, p); }
    return p;
  }

  // Mark every achievement whose conditions now hold. Met ones stay met.
  checkAchievements(): void {
    const meta = this.economy.meta;
    if (!this.awardAchievements || meta.achievements.size === ACHIEVEMENTS.length) return;
    for (const a of ACHIEVEMENTS) {
      if (meta.achievements.has(a.id) || !a.when.every((c) => conditionMet(c, this.economy))) continue;
      meta.achievements.add(a.id);
      this.events.push({ type: 'achievement', id: a.id });
    }
  }

  // Start a buff, scaled by upgrades that lengthen buffs (all of them, or
  // one, filtered on `buff:<id>`).
  grantBuff(id: string): void {
    const def = BUFFS[id];
    if (!def) return;
    const ms = evaluate(this.economy.effects, 'buff_duration', [`buff:${id}`], this.economy, def.durationMs);
    this.buffs.grant(id, ms);
    this.events.push({ type: 'buff', id, ms });
  }

  catchUp(seconds: number): void {
    const earned = num(this.toBalance.take(toNumber(mul(this.incomePerSecond(), num(seconds)))));
    if (toNumber(earned) > 0) {
      this.economy.balance = add(this.economy.balance, earned);
      this.economy.stats.linesEarned += toNumber(earned);
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
