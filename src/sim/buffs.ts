import { BUFFS } from '../data/golden';
import { multiplier, type EffectContext } from './effects';
import type { Tag } from './tags';

export interface BuffState {
  id: string;
  msLeft: number;
}

// Buffs run on game time, independent of rounds: a frenzy that outlives its
// round keeps multiplying the bots.
export class Buffs {
  active: BuffState[] = [];

  constructor(snapshot: BuffState[] = []) {
    this.active = snapshot.filter((b) => BUFFS[b.id] && b.msLeft > 0).map((b) => ({ ...b }));
  }

  // The same buff again restarts its timer rather than stacking time, so a
  // lucky streak cannot bank hours of frenzy.
  grant(id: string, durationMs: number): void {
    const cur = this.active.find((b) => b.id === id);
    if (cur) cur.msLeft = Math.max(cur.msLeft, durationMs);
    else this.active.push({ id, msLeft: durationMs });
  }

  tick(dtMs: number): void {
    for (const b of this.active) b.msLeft -= dtMs;
    this.active = this.active.filter((b) => b.msLeft > 0);
  }

  multiplier(tags: readonly Tag[], ctx: EffectContext): number {
    if (this.active.length === 0) return 1;
    return multiplier(this.active.flatMap((b) => BUFFS[b.id]!.effects), 'income', tags, ctx);
  }

  snapshot(): BuffState[] {
    return this.active.map((b) => ({ ...b }));
  }
}
