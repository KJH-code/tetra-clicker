// Copies of one building that earn its card and bot boards another star.
// Only for show: a star changes nothing but how the building looks.
export const TIER_STEPS = [10, 25, 50, 100];

export function buildingTier(owned: number): number {
  return TIER_STEPS.filter((n) => owned >= n).length;
}
