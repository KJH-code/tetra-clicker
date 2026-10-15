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

// Prices fitted with the simulator page to the chosen schedule: first
// building at about a minute, each next one 2.5× later, for a 0.5 PPS
// single/double player who plays 15 minutes flat out and then an hour a
// day. Rounded to friendly numbers afterwards.
export const LADDER: LadderEntry[] = [
  { id: 'single', name: 'SINGLE', basePrice: 15, growth: 1.15, pps: 1, linesPerPiece: 0.4, bonusPct: 10 },
  { id: 'double', name: 'DOUBLE', basePrice: 60, growth: 1.15, pps: 1, linesPerPiece: 0.445, bonusPct: 10, requires: 'single' },
  { id: 'triple', name: 'TRIPLE', basePrice: 250, growth: 1.15, pps: 1, linesPerPiece: 0.475, bonusPct: 10, requires: 'double' },
  { id: 'tetris', name: 'TETRIS', basePrice: 900, growth: 1.15, pps: 1, linesPerPiece: 0.62, bonusPct: 10, requires: 'triple' },
  { id: 'tspin', name: 'T-SPIN', basePrice: 3_000, growth: 1.15, pps: 1, linesPerPiece: 0.8, bonusPct: 10, requires: 'tetris' },
  { id: 'allspin', name: 'ALL-SPIN', basePrice: 10_000, growth: 1.15, pps: 1, linesPerPiece: 0.9, bonusPct: 10, requires: 'tspin' },
  { id: 'combo', name: 'COMBO', basePrice: 35_000, growth: 1.15, pps: 1, linesPerPiece: 1.0, bonusPct: 10, requires: 'allspin' },
  { id: 'b2b', name: 'B2B', basePrice: 100_000, growth: 1.15, pps: 1, linesPerPiece: 1.1, bonusPct: 10, requires: 'combo' },
  { id: 'pc', name: 'PERFECT', basePrice: 300_000, growth: 1.15, pps: 1, linesPerPiece: 1.2, bonusPct: 10, requires: 'b2b' },
];
