// The full building ladder as the economy simulator sees it. Only `single`
// has a bot today; the rest live here so the ladder's numbers can be tuned
// before their bots exist. When a bot arrives, its entry moves to
// buildings.ts. Lines per piece follow the design's per-piece income steps.
export interface LadderEntry {
  id: string;
  name: string;
  basePrice: number;
  growth: number;
  pps: number;
  linesPerPiece: number;
  bonusPct: number;
  requires?: string;
}

// Placeholder prices in Cookie Clicker-like proportions; the simulator page
// exists to replace them.
export const LADDER: LadderEntry[] = [
  { id: 'single', name: 'SINGLE', basePrice: 15, growth: 1.15, pps: 1, linesPerPiece: 0.4, bonusPct: 10 },
  { id: 'double', name: 'DOUBLE', basePrice: 100, growth: 1.15, pps: 1, linesPerPiece: 0.5, bonusPct: 10, requires: 'single' },
  { id: 'triple', name: 'TRIPLE', basePrice: 1_100, growth: 1.15, pps: 1, linesPerPiece: 0.6, bonusPct: 10, requires: 'double' },
  { id: 'tetris', name: 'TETRIS', basePrice: 12_000, growth: 1.15, pps: 1, linesPerPiece: 0.7, bonusPct: 10, requires: 'triple' },
  { id: 'tspin', name: 'T-SPIN', basePrice: 130_000, growth: 1.15, pps: 1, linesPerPiece: 0.8, bonusPct: 10, requires: 'tetris' },
  { id: 'allspin', name: 'ALL-SPIN', basePrice: 1_400_000, growth: 1.15, pps: 1, linesPerPiece: 0.9, bonusPct: 10, requires: 'tspin' },
  { id: 'combo', name: 'COMBO', basePrice: 20_000_000, growth: 1.15, pps: 1, linesPerPiece: 1.0, bonusPct: 10, requires: 'allspin' },
  { id: 'b2b', name: 'B2B', basePrice: 330_000_000, growth: 1.15, pps: 1, linesPerPiece: 1.1, bonusPct: 10, requires: 'combo' },
  { id: 'pc', name: 'PERFECT', basePrice: 5_100_000_000, growth: 1.15, pps: 1, linesPerPiece: 1.2, bonusPct: 10, requires: 'b2b' },
];
