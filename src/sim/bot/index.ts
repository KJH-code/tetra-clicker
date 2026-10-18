import type { BotPolicy } from './policy';
import { singleBot } from './singleBot';
import { sizeBot } from './sizeBot';
import { tspinBot, allspinBot, comboBot, b2bBot, tspinTstBot, b2bComboBot, downstackBot, fourWideBot } from './techBots';
import { pcBot } from './pcBot';
import { ccWasmBot, CC_DEFAULT } from './ccWasm';
import { openerBot } from './openerBot';
import { OPENERS } from '../../data/openers';
import { decodeBuild } from '../fumen';
import type { Game, LockResult } from '../game';
import { cloneGrid, type Grid, type Placement } from '../board';
import { replay } from './cc/movegen';

export const POLICIES: Record<string, BotPolicy> = {
  single: singleBot,
  double: sizeBot(2),
  triple: sizeBot(3),
  tetris: sizeBot(4),
  tspin: tspinBot(),
  allspin: allspinBot(),
  combo: comboBot(),
  b2b: b2bBot(),
  pc: pcBot(),
  downstack: downstackBot(),
  fourwide: fourWideBot(),
  opener: openerBot(),
  opener_combo: openerBot([], 'combo'),
  // The buildings that reach into the manual board play bots measured above.
  helper: comboBot(),
  invader: downstackBot(),
  rival: ccWasmBot({ weights: CC_DEFAULT, nodes: 6_000 }),
  // Switched to by play synergies.
  tspin_tst: tspinTstBot(),
  b2b_combo: b2bComboBot(),
};

// A skill name to its policy. "opener:a,b" is the OPENER bot with those
// named builds researched (the world spells it out, so a worker that only
// has the name plays the same builds).
const variants = new Map<string, BotPolicy>();
export function policyFor(skill: string): BotPolicy | undefined {
  const fixed = POLICIES[skill];
  if (fixed) return fixed;
  const [base, list] = skill.split(':');
  if (base !== 'opener' || !list) return undefined;
  let p = variants.get(skill);
  if (!p) {
    const builds = list.split(',').map((id) => OPENERS.find((o) => o.id === id)).filter((o) => o !== undefined).map((o) => decodeBuild(o.fumen));
    p = openerBot(builds);
    variants.set(skill, p);
  }
  return p;
}

export interface BotMove {
  from: Placement; // where the piece started (spawn)
  via: Placement; // after sliding/rotating on the spawn row
  to: Placement; // where it locked
  result: LockResult;
  // The grid as it was before the piece landed, so a renderer can replay the move.
  before: Grid;
  usedHold: boolean;
  // Every position on the way, when the move was played input by input.
  path?: Placement[];
}

// One bot turn: choose, (hold,) then either play the chosen inputs (bots
// that spin) or slide to the spot and drop (bots that never spin, whose
// placement is set directly so the spin flag stays off).
export function playOne(game: Game, policy: BotPolicy): BotMove | null {
  if (!game.active) return null;
  const choice = policy.choose(game);
  if (!choice) return null;
  const before = cloneGrid(game.grid);
  if (choice.useHold && !game.swapHold()) return null;
  const from = { ...game.active! };
  if (choice.inputs) {
    if (from.piece !== choice.placement.piece || !replay(game, choice.inputs)) return null;
    const at = game.active!;
    if (at.x !== choice.placement.x || at.rot !== choice.placement.rot) return null;
    const result = game.hardDrop();
    return { from, via: choice.path?.[Math.max(0, choice.path.length - 2)] ?? at, to: choice.placement, result, before, usedHold: choice.useHold, ...(choice.path ? { path: choice.path } : {}) };
  }
  if (from.piece !== choice.placement.piece || !game.setActive(choice.placement)) return null;
  const to = { ...choice.placement, y: game.ghostY() };
  const result = game.hardDrop();
  return { from, via: choice.placement, to, result, before, usedHold: choice.useHold };
}
