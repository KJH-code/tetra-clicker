// Which bot boards the middle pane shows at full size once there are more
// than it can hold: the top earners. A board already shown keeps its place
// until an outsider earns `margin` times what the weakest shown board does,
// so the grid does not reshuffle every time two incomes cross.
export const SHOWN_BOARDS = 8;
const MARGIN = 1.25;

export function chooseShown(prev: readonly number[], incomes: readonly number[], max = SHOWN_BOARDS, margin = MARGIN): number[] {
  const all = incomes.map((_, i) => i);
  if (all.length <= max) return all;
  const kept = prev.filter((i) => i < incomes.length).slice(0, max);
  if (kept.length === 0) return [...all].sort((a, b) => incomes[b]! - incomes[a]! || a - b).slice(0, max);
  // Fill any free places with the best outsiders.
  const outside = (): number[] => all.filter((i) => !kept.includes(i)).sort((a, b) => incomes[b]! - incomes[a]! || a - b);
  while (kept.length < max) kept.push(outside()[0]!);
  // Swap the weakest shown board for a clearly stronger outsider, one at a time.
  for (;;) {
    const best = outside()[0];
    const weakest = kept.reduce((w, i) => (incomes[i]! < incomes[w]! ? i : w), kept[0]!);
    if (best === undefined || incomes[best]! <= incomes[weakest]! * margin) break;
    kept[kept.indexOf(weakest)] = best;
  }
  return kept;
}
