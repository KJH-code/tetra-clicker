import { DANGER } from '../data/danger';
import { GOLDEN, type GoldenOutcome } from '../data/golden';
import { createRng, restoreRng, type Rng } from './rng';

// A round is one stretch of manual play. Lines earned during it go into the
// vault, not the bank; settling banks all of it, topping out banks only part.
// Danger climbs with round time and is what makes garbage and gravity bite.
export type RoundPhase = 'idle' | 'running' | 'settling';

export interface RoundSnapshot {
  phase: RoundPhase;
  paused: boolean;
  vault: number;
  danger: number;
  elapsedMs: number;
  garbageMs: number;
  settleMs: number;
  rng: number;
  goldenMs?: number;
  goldenRng?: number;
}

export class Round {
  phase: RoundPhase = 'idle';
  paused = false;
  vault = 0;
  danger = 0;
  elapsedMs = 0;
  garbageMs = 0;
  settleMs = 0;
  // Round time left until the next golden piece. It only counts down while
  // no golden piece is on the board, so there is never more than one.
  goldenMs = 0;
  private rng: Rng;
  // Golden pieces draw from their own stream so they do not shift the
  // garbage holes a seed produces.
  private goldenRng: Rng;
  // Round-local clock for the settle double tap.
  private clockMs = 0;
  private lastTapMs = -Infinity;

  constructor(seed: number, snapshot?: RoundSnapshot | null) {
    if (snapshot) {
      this.phase = snapshot.phase;
      // A round restored from a save waits for the player to come back.
      this.paused = snapshot.phase !== 'idle';
      this.vault = snapshot.vault;
      this.danger = snapshot.danger;
      this.elapsedMs = snapshot.elapsedMs;
      this.garbageMs = snapshot.garbageMs;
      this.settleMs = snapshot.settleMs;
      this.rng = restoreRng(snapshot.rng);
      this.goldenRng = snapshot.goldenRng !== undefined ? restoreRng(snapshot.goldenRng) : createRng(seed ^ 0x6a09e667);
      this.goldenMs = snapshot.goldenMs ?? this.drawGoldenMs(1);
    } else {
      this.rng = createRng(seed ^ 0x9e3779b9);
      this.goldenRng = createRng(seed ^ 0x6a09e667);
    }
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  // Running and not paused: the only state in which time moves.
  get live(): boolean {
    return this.active && !this.paused;
  }

  snapshot(): RoundSnapshot {
    return {
      phase: this.phase, paused: this.paused, vault: this.vault, danger: this.danger,
      elapsedMs: this.elapsedMs, garbageMs: this.garbageMs, settleMs: this.settleMs, rng: this.rng.state(),
      goldenMs: this.goldenMs, goldenRng: this.goldenRng.state(),
    };
  }

  // `goldenScale` shortens the wait (upgrades that make golden pieces commoner).
  // `floorAdd` raises the starting danger (a prestige upgrade).
  start(wrath: number, goldenScale = 1, floorAdd = 0): void {
    this.phase = 'running';
    this.paused = false;
    this.vault = 0;
    this.danger = DANGER.wrathFloor[Math.min(wrath, DANGER.wrathFloor.length - 1)]! + floorAdd;
    this.elapsedMs = 0;
    this.garbageMs = 0;
    this.settleMs = 0;
    this.lastTapMs = -Infinity;
    this.goldenMs = this.drawGoldenMs(goldenScale);
  }

  private drawGoldenMs(scale: number): number {
    const s = GOLDEN.minSeconds + this.goldenRng.next() * (GOLDEN.maxSeconds - GOLDEN.minSeconds);
    return s * 1000 * scale;
  }

  drawOutcome(): GoldenOutcome {
    const total = GOLDEN.outcomes.reduce((n, o) => n + o.weight, 0);
    let r = this.goldenRng.next() * total;
    for (const o of GOLDEN.outcomes) {
      r -= o.weight;
      if (r < 0) return o;
    }
    return GOLDEN.outcomes[GOLDEN.outcomes.length - 1]!;
  }

  end(): void {
    this.phase = 'idle';
    this.paused = false;
    this.vault = 0;
    this.danger = 0;
    this.settleMs = 0;
  }

  // Returns true when this tap begins the settle countdown (the second tap
  // inside the window while running).
  tapSettle(): boolean {
    if (this.phase !== 'running' || this.paused) return false;
    const second = this.clockMs - this.lastTapMs <= DANGER.settleDoubleTapMs;
    this.lastTapMs = this.clockMs;
    if (!second) return false;
    this.phase = 'settling';
    this.settleMs = DANGER.settleCountdownMs;
    return true;
  }

  // Advance round time. Returns the garbage rows due, whether the settle
  // countdown just finished, and whether a golden piece is due.
  // `scales` slow the danger rise and stretch garbage gaps (prestige upgrades).
  advance(dtMs: number, wrath: number, golden?: { ready: boolean; scale: number },
    scales: { rise: number; garbage: number } = { rise: 1, garbage: 1 }): { garbage: number[]; settled: boolean; golden: boolean } {
    this.clockMs += dtMs;
    const out = { garbage: [] as number[], settled: false, golden: false };
    if (!this.live) return out;
    this.elapsedMs += dtMs;
    if (golden?.ready) {
      this.goldenMs -= dtMs;
      if (this.goldenMs <= 0) {
        out.golden = true;
        this.goldenMs = this.drawGoldenMs(golden.scale);
      }
    }
    const rise = DANGER.risePerSecond * (wrath >= 3 ? DANGER.wrath3RiseMultiplier : 1) * scales.rise;
    this.danger += (rise * dtMs) / 1000;
    if (wrath >= 1 && this.danger > 0) {
      this.garbageMs += dtMs;
      const interval = Math.max(DANGER.garbageMinSeconds, DANGER.garbageSecondsAtDanger1 / this.danger) * 1000 * scales.garbage;
      while (this.garbageMs >= interval) {
        this.garbageMs -= interval;
        out.garbage.push(this.rng.nextInt(10));
      }
    }
    if (this.phase === 'settling') {
      this.settleMs -= dtMs;
      if (this.settleMs <= 0) out.settled = true;
    }
    return out;
  }

  gravity(wrath: number): number {
    return wrath >= 2 ? this.danger * DANGER.gravityPerDanger : 0;
  }
}
