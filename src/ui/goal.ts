import type { AchievementDef } from '../data/achievements';
import type { EffectContext } from '../sim/effects';
// The shop's NEXT GOAL card: the next building on the ladder (the first one
// not yet owned), or once every kind is owned the cheapest next copy, and
// how long PER SECOND takes to pay for it. Plain data in, plain data out.
export interface GoalBuilding {
  id: string;
  name: string;
  price: number;
  owned: number;
  unlocked: boolean;
}

export interface Goal {
  id: string;
  name: string;
  price: number;
  // Share of the price already in hand, 0..1.
  progress: number;
  // Seconds until affordable; 0 when it already is, null with no income.
  seconds: number | null;
}

export function nextGoal(buildings: readonly GoalBuilding[], balance: number, perSecond: number): Goal | null {
  const target = buildings.find((b) => b.owned === 0)
    ?? [...buildings].sort((a, b) => a.price - b.price)[0];
  if (!target) return null;
  const left = Math.max(0, target.price - balance);
  return {
    id: target.id,
    name: target.name,
    price: target.price,
    progress: target.price > 0 ? Math.min(1, balance / target.price) : 1,
    seconds: left === 0 ? 0 : perSecond > 0 ? left / perSecond : null,
  };
}

// 45s, 12m, 3h 20m, 2d 5h: two units at most, as the card is narrow.
export function durationParts(seconds: number): { key: string; vars: Record<string, number> } {
  const s = Math.ceil(seconds);
  if (s < 60) return { key: '{n}s', vars: { n: s } };
  const m = Math.floor(s / 60);
  if (m < 60) return { key: '{m}m', vars: { m } };
  const h = Math.floor(m / 60);
  if (h < 24) return { key: '{h}h {m}m', vars: { h, m: m % 60 } };
  return { key: '{d}d {h}h', vars: { d: Math.floor(h / 24), h: h % 24 } };
}

// Achievements nearly met, for the shop: those whose every condition is a
// count (owned, stat or career at least n), by how far along the furthest
// is, the share being the weakest condition's. Hidden ones stay hidden.
export interface NearAchievement { id: string; name: string; value: number; goal: number; progress: number }

export function nearAchievements(defs: readonly AchievementDef[], met: ReadonlySet<string>, ctx: EffectContext, n: number): NearAchievement[] {
  const out: NearAchievement[] = [];
  for (const a of defs) {
    if (met.has(a.id) || a.hidden) continue;
    let worst: { value: number; goal: number } | null = null;
    let countable = a.when.length > 0;
    for (const c of a.when) {
      const v = c.type === 'owned' ? { value: ctx.owned(c.id), goal: c.gte }
        : c.type === 'career' ? { value: ctx.career?.(c.stat) ?? 0, goal: c.gte }
        : c.type === 'stat' && 'gte' in c ? { value: ctx.stat?.(c.stat) ?? 0, goal: c.gte }
        : null;
      if (!v) { countable = false; break; }
      if (!worst || v.value / v.goal < worst.value / worst.goal) worst = v;
    }
    if (!countable || !worst) continue;
    out.push({ id: a.id, name: a.name, value: Math.floor(worst.value), goal: worst.goal, progress: Math.min(1, worst.value / worst.goal) });
  }
  return out.sort((a, b) => b.progress - a.progress).slice(0, n);
}
