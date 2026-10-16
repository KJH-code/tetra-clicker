import { ccWasmBot, CC_DEFAULT, stackHeight, type CcKind, type CcMode, type CcWeights } from './ccWasm';
import type { BotPolicy } from './policy';

// The technique buildings, each Cold Clear (the real engine, engine/) with
// weights pointed at what that building is paid for. The numbers come from
// measurement sweeps; tests/slow holds each bot to its technique and its
// earnings (buildings.ts).

const w = (over: Partial<CcWeights>): CcWeights => ({ ...CC_DEFAULT, ...over });

// T-SPIN: a T-spin double from nearly every T. Singles and triples are off
// (prestige upgrades later). A stack a little taller than Cold Clear likes
// leaves room for the overhang a TSD slot needs.
export const TSPIN: CcMode = {
  weights: w({
    tslot: [8, 148, 600, 0], tspin1: -500, tspin2: 2000, tspin3: -500,
    clear4: 0, wasted_t: -500, well_depth: 0, max_well_depth: 0, height: -20, top_half: -100,
  }),
  forbid: ['tspin1', 'tspin3'],
};

// B2B: only tetrises and TSDs clear, so the chain never breaks, until the
// stack passes eight rows; then any clear will do and stock weights dig out.
const SMALL_CLEARS: CcKind[] = ['clear1', 'clear2', 'clear3', 'tspin1', 'tspin3', 'mini1', 'mini2'];
export const B2B: CcMode = { weights: CC_DEFAULT, forbid: SMALL_CLEARS };
const B2B_PANIC = 8;

// COMBO: build a ragged stack twelve rows high without clearing, then cut it
// down a row at a time with combo weights until the combo breaks.
const ALL_CLEARS: CcKind[] = ['clear1', 'clear2', 'clear3', 'clear4', 'tspin1', 'tspin2', 'tspin3', 'mini1', 'mini2'];
export const COMBO_BUILD: CcMode = {
  weights: w({ height: 0, top_half: 0, jeopardy: 0, tslot: [0, 0, 0, 0], well_depth: 0, max_well_depth: 0, bumpiness: -5, row_transitions: 0 }),
  forbid: ALL_CLEARS,
};
export const COMBO_CUT: CcMode = { weights: w({ combo_garbage: 1500, clear1: 0, clear2: 0, clear3: 0 }) };
const COMBO_BUILD_TO = 12;

// ALL-SPIN: every piece spins into its clears; overhangs are what spins need,
// so they cost nothing and covered holes cost less.
export const ALLSPIN: CcMode = {
  weights: w({
    allspin: [800, 1200, 1500, 1800], tspin1: 600, tspin2: 1200, tspin3: 1500,
    clear1: -300, clear2: -300, clear3: -300, overhang_cells: 0, cavity_cells: -80,
  }),
  allSpins: true,
};

export const tspinBot = (): BotPolicy => ccWasmBot({ ...TSPIN, nodes: 20_000 });

export const b2bBot = (): BotPolicy => ccWasmBot({
  ...B2B, nodes: 10_000,
  mode: (game) => (stackHeight(game.grid) >= B2B_PANIC ? { weights: CC_DEFAULT } : null),
});

export const comboBot = (): BotPolicy => ccWasmBot({
  ...COMBO_CUT, nodes: 10_000,
  mode: (game) => (game.combo < 0 && stackHeight(game.grid) < COMBO_BUILD_TO ? COMBO_BUILD : null),
});

export const allspinBot = (): BotPolicy => ccWasmBot({ ...ALLSPIN, nodes: 10_000 });

// Play synergies (src/data/synergies.ts) switch a board to one of these.

// T-SPIN + ALL-SPIN: singles and triples are open too, and a triple slot is
// worth building.
export const TSPIN_TST: CcMode = {
  weights: w({ ...TSPIN.weights, tslot: [8, 148, 600, 500], tspin1: 300, tspin3: 2500 }),
};
export const tspinTstBot = (): BotPolicy => ccWasmBot({ ...TSPIN_TST, nodes: 20_000 });

// COMBO + B2B: still only tetrises and TSDs to start a run, but once a
// combo is going any clear may extend it. Weighted so combos show (up to 7
// in a 1,800-piece sweep); that costs the chain about a tenth of its Lines
// per piece, which the synergy's ×1.25 more than repays.
const B2B_COMBO_RUN: CcMode = { weights: w({ combo_garbage: 1500, clear1: 0, clear2: 0, clear3: 0 }) };
export const b2bComboBot = (): BotPolicy => ccWasmBot({
  ...B2B, nodes: 10_000,
  mode: (game) => (stackHeight(game.grid) >= B2B_PANIC ? { weights: CC_DEFAULT } : game.combo >= 0 ? B2B_COMBO_RUN : null),
});
