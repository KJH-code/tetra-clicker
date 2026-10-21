import type { Game } from '../game';
import type { BotChoice, BotPolicy } from './policy';
import { solvePc, moveFor, type PcStep } from './cc/pcf';
import { ccWasmBot, stackHeight } from './ccWasm';
import { PC_RECOVER, PC_SETUP_STAGES } from './pcBot';
import { TSPIN, COMBO_BUILD, COMBO_CUT } from './techBots';
import { planBuild } from './buildFollower';
import type { BuildStage } from '../fumen';

// OPENER: a DPC loop found by search rather than from a book. From an empty
// board, a four-line PC (pcf). Then Cold Clear builds and fires a TSD low on
// the board, and pcf finishes the leftover rows into a second PC, which
// empties the board for the next round. Named builds that loop the same way
// (fumen data, opened by prestige) will slot in ahead of the search.
const PC_PREVIEW = 11;
// Rows a TSD's leftovers may reach and still be finished into a PC.
const PC_FROM_RESIDUE = 6;
const TSD_PANIC = 8;

// Where a board is in the loop. Kept per game like the PC bot's plan; a
// fresh copy (a reload, the worker) starts from what the board shows.
type Phase = 'pc' | 'tsd' | 'finish';

// The 4-WIDE + OPENER synergy swaps the TSD for a short combo: build a few
// rows without clearing, then cut them down a row a piece.
const COMBO_BUILD_TO = 5;

export function openerBot(builds: readonly BuildStage[][] = [], after: 'tsd' | 'combo' = 'tsd'): BotPolicy {
  const plans = new WeakMap<Game, PcStep[]>();
  const stagePlans = new WeakMap<Game, BotChoice[]>();
  const state = new WeakMap<Game, { phase: Phase; filled: number; failed: string; cutting: boolean }>();
  const tsd = ccWasmBot({ ...TSPIN, forbid: [...(TSPIN.forbid ?? []), 'clear1', 'clear2', 'clear3', 'clear4', 'mini1', 'mini2'], nodes: 10_000 });
  const recover = ccWasmBot({ weights: PC_RECOVER, nodes: 3_000 });
  const combo = ccWasmBot({
    ...COMBO_CUT, nodes: 6_000,
    mode: (game) => (game.combo < 0 && stackHeight(game.grid) < COMBO_BUILD_TO ? COMBO_BUILD : null),
  });

  const follow = (game: Game, plan: PcStep[]): BotChoice | null => {
    const active = game.active!;
    const step = plan[0];
    if (!step) return null;
    const useHold = active.piece !== step.piece;
    const piece = useHold ? (game.hold ?? game.next(1)[0]) : active.piece;
    const move = piece ? moveFor(game.grid, piece, step) : null;
    if (!move) { plans.set(game, []); return null; }
    plan.shift();
    return { placement: move.placement, useHold, inputs: move.inputs, path: move.path };
  };

  // A PC from this board (empty: four rows; leftovers: up to six), searched
  // once per board shape.
  const pc = (game: Game, st: { failed: string }): BotChoice | null => {
    const key = game.grid.join('');
    if (st.failed === key) return null;
    const active = game.active!;
    const empty = game.grid.every((c) => c === 0);
    const hold = game.hold;
    const seq = hold ? [hold, active.piece, ...game.preview(PC_PREVIEW - 2)] : [active.piece, ...game.preview(PC_PREVIEW - 1)];
    const found = solvePc(game.grid, seq, empty ? 4 : PC_FROM_RESIDUE, empty ? 400_000 : 80_000);
    if (!found || found.length === 0) {
      st.failed = key;
      // No PC in sight from empty: a known setup the queue can lay, if any.
      const setup = empty ? planBuild(game, PC_SETUP_STAGES) : null;
      if (setup) { stagePlans.set(game, setup); return stagePlans.get(game)!.shift()!; }
      return null;
    }
    plans.set(game, found);
    return follow(game, found);
  };

  return {
    choose(game: Game): BotChoice | null {
      if (!game.active) return null;
      const filled = game.grid.reduce((n, c) => n + (c ? 1 : 0), 0);
      const empty = filled === 0;
      let st = state.get(game);
      if (!st) { st = { phase: empty ? 'pc' : 'finish', filled, failed: '', cutting: false }; state.set(game, st); }
      const cleared = filled < st.filled;
      st.filled = filled;
      // A researched build the queue fits comes first.
      // A researched build comes first: a stage under way plays on, and a
      // new one starts when the board is its leftovers and the queue can
      // finish it. Whatever the last stage leaves is finished into a PC (or
      // dug out) before the loop starts again.
      let staged = stagePlans.get(game);
      if (!staged || staged.length === 0) {
        staged = undefined;
        for (const b of builds) {
          const p = planBuild(game, b);
          if (p) { staged = p; stagePlans.set(game, p); break; }
        }
      }
      if (staged && staged.length > 0) {
        const step = staged.shift()!;
        plans.set(game, []);
        st.phase = 'finish';
        return step;
      }
      const plan = plans.get(game);
      if (plan && plan.length > 0) {
        const c = follow(game, plan);
        if (c) return c;
      }
      // The first PC of the loop empties the board; the TSD comes next.
      if (st.phase === 'pc' || (st.phase === 'finish' && empty)) {
        const c = empty ? pc(game, st) : null;
        if (c) { st.phase = 'tsd'; st.cutting = false; return c; }
      }
      // Only T-spins may clear while setting up, so a clear that leaves
      // rows is the TSD (one that empties the board was the PC before it).
      // A combo is done once it breaks.
      if (st.phase === 'tsd' && !empty && (after === 'tsd' ? cleared : game.combo < 0 && st.cutting)) st.phase = 'finish';
      if (cleared && !empty) st.cutting = true;
      if (st.phase === 'finish') {
        if (stackHeight(game.grid) <= PC_FROM_RESIDUE) {
          const c = pc(game, st);
          if (c) { st.phase = 'pc'; return c; }
        }
        return recover.choose(game);
      }
      if (stackHeight(game.grid) >= TSD_PANIC) return recover.choose(game);
      return after === 'tsd' ? tsd.choose(game) : combo.choose(game);
    },
  };
}
