import type { Stats } from '../sim/stats';

// Short goals for one life: three are drawn when a life starts and each pays
// some minutes of what the game earns into the vault once met, so a life
// has something to aim at besides staying alive. A top-out ends them.
export interface MissionDef {
  id: string;
  label: string;
  // `stat`: that counter rises by `goal` this life; `levels`: levels gained;
  // `seconds`: life time.
  kind: 'stat' | 'levels' | 'seconds';
  stat?: keyof Stats;
  goal: number;
  // Reward: this many minutes of PER SECOND plus the hand's recent rate.
  minutes: number;
  // Drawn only once the HARD MISSIONS prestige upgrade is bought.
  hard?: boolean;
}

export const MISSIONS_PER_LIFE = 3;

export const MISSIONS: MissionDef[] = [
  { id: 'tetris3', label: 'TETRIS ×3', kind: 'stat', stat: 'tetrises', goal: 3, minutes: 2 },
  { id: 'tspin2', label: 'T-SPIN ×2', kind: 'stat', stat: 'spins', goal: 2, minutes: 3 },
  { id: 'tsd1', label: 'T-SPIN DOUBLE', kind: 'stat', stat: 'tsd', goal: 1, minutes: 3 },
  { id: 'b2b4', label: 'B2B ×4', kind: 'stat', stat: 'b2bs', goal: 4, minutes: 3 },
  { id: 'combo5', label: '5 COMBO', kind: 'stat', stat: 'combo5', goal: 1, minutes: 2 },
  { id: 'levels5', label: 'LEVEL +5', kind: 'levels', goal: 5, minutes: 2 },
  { id: 'checkpoint', label: 'CHECKPOINT', kind: 'stat', stat: 'checkpoints', goal: 1, minutes: 2 },
  { id: 'garbage4', label: 'GARBAGE ×4 BY TECHNIQUE', kind: 'stat', stat: 'garbageBonusRows', goal: 4, minutes: 3 },
  { id: 'survive3', label: 'SURVIVE 3 MIN', kind: 'seconds', goal: 180, minutes: 1 },
  { id: 'pieces100', label: '100 PIECES', kind: 'stat', stat: 'manualPieces', goal: 100, minutes: 1 },
  { id: 'tetris6', label: 'TETRIS ×6', kind: 'stat', stat: 'tetrises', goal: 6, minutes: 5, hard: true },
  { id: 'pc1', label: 'PERFECT CLEAR', kind: 'stat', stat: 'pcs', goal: 1, minutes: 5, hard: true },
  { id: 'combo10', label: '10 COMBO', kind: 'stat', stat: 'combo10', goal: 1, minutes: 5, hard: true },
];

export const missionById = (id: string): MissionDef | undefined => MISSIONS.find((m) => m.id === id);
