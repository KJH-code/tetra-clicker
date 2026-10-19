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
  // ??? until the building is unlocked, as the shop hides it.
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
    name: target.unlocked ? target.name : '???',
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
