import { LEVELS, garbageSecondsAt, gravityAt } from '../data/levels';
import { GOLDEN, type GoldenOutcome } from '../data/golden';
import { EVENTS, type EventKind } from '../data/events';
import { createRng, restoreRng, type Rng } from './rng';

// A round is one life on the manual board. Lines earned during it go into
// the vault, which is banked every few dozen rows (a checkpoint); topping out
// is the only way a life ends, and it takes whatever the vault still holds.
// Rows cleared raise the level, which multiplies income and speeds up
// gravity and garbage.
export type RoundPhase = 'idle' | 'running';

export interface RoundSnapshot {
  phase: RoundPhase;
  paused: boolean;
  vault: number;
  // Vault Lines times the level each was earned at: risk weight that only
  // counts once banked.
  vaultRisk: number;
  startLevel: number;
  rowsPerLevel: number;
  rows: number;
  elapsedMs: number;
  garbageMs: number;
  rng: number;
  goldenMs: number;
  goldenRng: number;
  // Missing in saves from before life events.
  eventMs?: number;
  eventRng?: number;
}

export class Round {
  phase: RoundPhase = 'idle';
  paused = false;
  vault = 0;
  vaultRisk = 0;
  startLevel: number = LEVELS.startLevel;
  rowsPerLevel: number = LEVELS.rowsPerLevel;
  rows = 0; // cleared in this life
  elapsedMs = 0;
  garbageMs = 0;
  // Life time left until the next golden piece. It only counts down while
  // no golden piece is on the board, so there is never more than one.
  goldenMs = 0;
  private rng: Rng;
  // Golden pieces draw from their own stream so they do not shift the
  // garbage holes a seed produces.
  private goldenRng: Rng;
  // Life time to the next event, and the events' own stream.
  eventMs = 0;
  private eventRng: Rng;

  constructor(seed: number, snapshot?: RoundSnapshot | null) {
    if (snapshot) {
      this.phase = snapshot.phase;
      // A life restored from a save waits for the player to come back.
      this.paused = snapshot.phase !== 'idle';
      this.vault = snapshot.vault;
      this.vaultRisk = snapshot.vaultRisk;
      this.startLevel = snapshot.startLevel;
      this.rowsPerLevel = snapshot.rowsPerLevel;
      this.rows = snapshot.rows;
      this.elapsedMs = snapshot.elapsedMs;
      this.garbageMs = snapshot.garbageMs;
      this.rng = restoreRng(snapshot.rng);
      this.goldenRng = restoreRng(snapshot.goldenRng);
      this.goldenMs = snapshot.goldenMs;
      this.eventRng = snapshot.eventRng !== undefined ? restoreRng(snapshot.eventRng) : createRng(seed ^ 0x3c6ef372);
      this.eventMs = snapshot.eventMs ?? this.drawEventMs();
    } else {
      this.rng = createRng(seed ^ 0x9e3779b9);
      this.goldenRng = createRng(seed ^ 0x6a09e667);
      this.eventRng = createRng(seed ^ 0x3c6ef372);
    }
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  // Running and not paused: the only state in which time moves.
  get live(): boolean {
    return this.active && !this.paused;
  }

  get level(): number {
    return this.startLevel + Math.floor(this.rows / this.rowsPerLevel);
  }

  // Rows still to clear before the next checkpoint banks the vault.
  get rowsToCheckpoint(): number {
    return LEVELS.checkpointRows - (this.rows % LEVELS.checkpointRows);
  }

  snapshot(): RoundSnapshot {
    return {
      phase: this.phase, paused: this.paused, vault: this.vault, vaultRisk: this.vaultRisk,
      startLevel: this.startLevel, rowsPerLevel: this.rowsPerLevel, rows: this.rows,
      elapsedMs: this.elapsedMs, garbageMs: this.garbageMs, rng: this.rng.state(),
      goldenMs: this.goldenMs, goldenRng: this.goldenRng.state(),
      eventMs: this.eventMs, eventRng: this.eventRng.state(),
    };
  }

  // `goldenScale` shortens the wait (upgrades that make golden pieces commoner).
  start(startLevel: number, rowsPerLevel: number, goldenScale = 1): void {
    this.phase = 'running';
    this.paused = false;
    this.vault = 0;
    this.vaultRisk = 0;
    this.startLevel = Math.max(1, Math.floor(startLevel));
    this.rowsPerLevel = Math.max(1, Math.round(rowsPerLevel));
    this.rows = 0;
    this.elapsedMs = 0;
    this.garbageMs = 0;
    this.goldenMs = this.drawGoldenMs(goldenScale);
    this.eventMs = this.drawEventMs();
  }

  private drawEventMs(): number {
    return (EVENTS.minSeconds + this.eventRng.next() * (EVENTS.maxSeconds - EVENTS.minSeconds)) * 1000;
  }

  // Count down to the next event while none is on and the level allows
  // one; returns the kind when it is due.
  // Kinds in `owned` have become buildings and no longer turn up as events.
  tickEvent(dtMs: number, busy: boolean, owned: ReadonlySet<EventKind> = new Set()): EventKind | null {
    if (!this.live || busy || this.level < EVENTS.fromLevel) return null;
    this.eventMs -= dtMs;
    if (this.eventMs > 0) return null;
    this.eventMs = this.drawEventMs();
    const w = EVENTS.weights(this.level);
    for (const k of owned) w[k] = 0;
    if (w.rival + w.invader + w.helper <= 0) return null;
    const kinds = Object.keys(w) as EventKind[];
    let r = this.eventRng.next() * kinds.reduce((n, k) => n + w[k], 0);
    for (const k of kinds) { r -= w[k]; if (r < 0) return k; }
    return kinds[kinds.length - 1]!;
  }

  // A seed for an event's own board (the rival's), from the events' stream.
  eventSeed(): number {
    return Math.floor(this.eventRng.next() * 0x7fffffff);
  }

  // Count cleared rows. Reports a level-up and how many checkpoints were passed.
  addRows(n: number): { levelUp: boolean; checkpoints: number } {
    const before = this.level;
    const cpBefore = Math.floor(this.rows / LEVELS.checkpointRows);
    this.rows += n;
    return { levelUp: this.level > before, checkpoints: Math.floor(this.rows / LEVELS.checkpointRows) - cpBefore };
  }

  private drawGoldenMs(scale: number): number {
    const s = GOLDEN.minSeconds + this.goldenRng.next() * (GOLDEN.maxSeconds - GOLDEN.minSeconds);
    return s * 1000 * scale;
  }

  // `weight` lets effects reweigh the table (a prestige step halves CLOT).
  drawOutcome(table: readonly GoldenOutcome[] = GOLDEN.outcomes, weight: (o: GoldenOutcome) => number = (o) => o.weight): GoldenOutcome {
    const weights = table.map(weight);
    const total = weights.reduce((n, w) => n + w, 0);
    let r = this.goldenRng.next() * total;
    for (let i = 0; i < table.length; i++) {
      r -= weights[i]!;
      if (r < 0) return table[i]!;
    }
    return table[table.length - 1]!;
  }

  // Whether a due golden piece comes as a wrath piece. No draw at all when
  // wrath pieces are off, so a seed plays the same as before they existed.
  drawWrath(chance: number): boolean {
    if (chance <= 0) return false;
    return this.goldenRng.next() < chance;
  }

  end(): void {
    this.phase = 'idle';
    this.paused = false;
    this.vault = 0;
    this.vaultRisk = 0;
    this.rows = 0;
  }

  // Advance life time. Returns the garbage rows due and whether a golden
  // piece is due. `garbageScale` stretches garbage gaps (a prestige upgrade).
  // `fixedSeconds` replaces the level's gap (an invader's steady rate).
  advance(dtMs: number, golden?: { ready: boolean; scale: number }, garbageScale = 1, garbageFrom: number = LEVELS.garbageFromLevel,
    fixedSeconds?: number): { garbage: number[]; golden: boolean } {
    const out = { garbage: [] as number[], golden: false };
    if (!this.live) return out;
    this.elapsedMs += dtMs;
    if (golden?.ready) {
      this.goldenMs -= dtMs;
      if (this.goldenMs <= 0) {
        out.golden = true;
        this.goldenMs = this.drawGoldenMs(golden.scale);
      }
    }
    const seconds = fixedSeconds ?? garbageSecondsAt(this.level, garbageFrom);
    if (seconds !== null) {
      this.garbageMs += dtMs;
      const interval = seconds * 1000 * garbageScale;
      while (this.garbageMs >= interval) {
        this.garbageMs -= interval;
        out.garbage.push(this.rng.nextInt(10));
      }
    } else {
      this.garbageMs = 0;
    }
    return out;
  }

  gravity(): number {
    return gravityAt(this.level);
  }
}
