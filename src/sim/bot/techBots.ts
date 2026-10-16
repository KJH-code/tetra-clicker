import { STANDARD, type Weights } from './cc/eval';
import { ccBot } from './ccBot';
import type { BotPolicy } from './policy';

// Weight presets for the technique buildings, each a variation on Cold
// Clear's stock weights pointed at what that building is paid for. The
// numbers are tuned by measurement (tests/slow); see buildings.ts for what
// each bot then earns per piece.

// T-SPIN: T-spin doubles only. Singles and triples are vetoed; they come
// later as prestige upgrades.
// Partial slots keep a reward so the search has a gradient toward building
// them; a finished slot is worth less than spinning it, or the bot would
// hoard slots instead of cashing them.
export const TSPIN_WEIGHTS: Weights = {
  ...STANDARD,
  clear1: -80, clear2: -60, clear3: -40, clear4: 0,
  tslot: [8, 148, 300, 0],
  tspin2: 2000,
  wasted_t: -200,
};

// B2B: tetrises and T-spin doubles, never a clear that breaks the chain.
export const B2B_WEIGHTS: Weights = {
  ...STANDARD,
  back_to_back: 400,
  b2b_clear: 600,
  clear1: -500,
  clear2: -500,
  clear3: -500,
  clear4: 600,
  tspin2: 600,
};

// COMBO: let the stack grow, then cut it down a row at a time.
export const COMBO_WEIGHTS: Weights = {
  ...STANDARD,
  combo_garbage: 800,
  height: -12,
  top_half: -40,
  top_quarter: -300,
  clear1: 0,
  clear2: 0,
  clear3: 0,
  clear4: 0,
  well_depth: 0,
  tslot: [0, 0, 0, 0],
};

// ALL-SPIN: any full spin, by any piece.
export const ALLSPIN_WEIGHTS: Weights = {
  ...STANDARD,
  allspin: [0, 500, 800, 1000],
  tspin1: 400,
  tspin2: 800,
  tspin3: 1000,
};

const SEARCH = { width: 4, depth: 2 };

const isTsd = (l: { piece: string; spin: string; lines: number }): boolean => l.piece === 'T' && l.spin === 'full' && l.lines === 2;

export const tspinBot = (): BotPolicy => ccBot({
  ...SEARCH,
  weights: TSPIN_WEIGHTS,
  strict: (_m, l) => !(l.piece === 'T' && l.spin === 'full' && (l.lines === 1 || l.lines === 3)),
});

// Only tetrises and T-spin doubles clear, so the chain never breaks (outside
// a panic, when surviving comes first).
export const b2bBot = (): BotPolicy => ccBot({
  ...SEARCH,
  weights: B2B_WEIGHTS,
  // Tetrises need a tall stack; survival takes over a little later.
  panicHeight: 12,
  allow: (_m, l) => l.lines === 0 || l.lines === 4 || isTsd(l),
});

// Build without clearing until the stack is tall, then cut it down a row a
// piece for as long as the combo lasts.
// Building tolerates a ragged stack (rows with gaps at different places are
// what a cut-down combo is made of) but not holes, which a combo cannot
// reach and which once let a long run top out.
export const COMBO_BUILD: Weights = {
  ...STANDARD,
  clear1: -2000, clear2: -2000, clear3: -2000, clear4: -2000, tspin1: -2000, tspin2: -2000, tspin3: -2000,
  height: 0, top_half: 0, jeopardy: 0, well_depth: 0, tslot: [0, 0, 0, 0],
  bumpiness: -5, row_transitions: 0,
};
export const comboBot = (buildTo = 10): BotPolicy => ccBot({
  ...SEARCH,
  weights: COMBO_WEIGHTS,
  panicHeight: 12,
  mode: (game, height) => (game.combo < 0 && height < buildTo ? { weights: COMBO_BUILD } : { weights: COMBO_WEIGHTS }),
});

export const allspinBot = (): BotPolicy => ccBot({ ...SEARCH, weights: ALLSPIN_WEIGHTS });
