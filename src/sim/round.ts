import { DANGER } from '../data/danger';
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
}

export class Round {
  phase: RoundPhase = 'idle';
  paused = false;
  vault = 0;
  danger = 0;
  elapsedMs = 0;
  garbageMs = 0;
  settleMs = 0;
  private rng: Rng;
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
    } else {
      this.rng = createRng(seed ^ 0x9e3779b9);
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
    };
  }

  start(wrath: number): void {
    this.phase = 'running';
    this.paused = false;
    this.vault = 0;
    this.danger = DANGER.wrathFloor[Math.min(wrath, DANGER.wrathFloor.length - 1)]!;
    this.elapsedMs = 0;
    this.garbageMs = 0;
    this.settleMs = 0;
    this.lastTapMs = -Infinity;
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

  // Advance round time. Returns how many garbage rows are due and whether
  // the settle countdown just finished.
  advance(dtMs: number, wrath: number): { garbage: number[]; settled: boolean } {
    this.clockMs += dtMs;
    const out = { garbage: [] as number[], settled: false };
    if (!this.live) return out;
    this.elapsedMs += dtMs;
    const rise = DANGER.risePerSecond * (wrath >= 3 ? DANGER.wrath3RiseMultiplier : 1);
    this.danger += (rise * dtMs) / 1000;
    if (wrath >= 1 && this.danger > 0) {
      this.garbageMs += dtMs;
      const interval = Math.max(DANGER.garbageMinSeconds, DANGER.garbageSecondsAtDanger1 / this.danger) * 1000;
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
