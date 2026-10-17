// TETR.IO's defaults, since that is what most players' hands already know.
// Values are milliseconds except SDF, which is a multiplier; at SDF_INSTANT
// the soft drop lands immediately.
export interface HandlingSettings {
  das: number;
  arr: number;
  sdf: number;
  keys: KeyBindings;
  // The page preferences that are saved with handling: sound, 0..100, and
  // how far the tutorial got (TUTORIAL_OFF once dismissed or finished).
  volume: number;
  muted: boolean;
  tutorial: number;
}

export const TUTORIAL_OFF = -1;

export interface KeyBindings {
  left: string[];
  right: string[];
  softDrop: string[];
  hardDrop: string[];
  rotateCW: string[];
  rotateCCW: string[];
  rotate180: string[];
  hold: string[];
}

export const SDF_INSTANT = 41;
export const HANDLING_LIMITS = {
  das: { min: 0, max: 500, step: 1 },
  arr: { min: 0, max: 200, step: 1 },
  sdf: { min: 1, max: SDF_INSTANT, step: 1 },
  volume: { min: 0, max: 100, step: 1 },
} as const;

// With no gravity SDF has nothing to multiply, so it is read as cells per
// tenth of a second: SDF 6 moves the piece 60 rows a second, a whole board in
// a third of a second.
export const SOFT_DROP_CELLS_PER_SECOND_PER_SDF = 10;

export const DEFAULT_HANDLING: HandlingSettings = {
  das: 167,
  arr: 33,
  sdf: 6,
  keys: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    softDrop: ['ArrowDown'],
    hardDrop: ['Space'],
    rotateCW: ['ArrowUp', 'KeyX'],
    rotateCCW: ['KeyZ', 'ControlLeft'],
    rotate180: ['KeyA'],
    hold: ['ShiftLeft', 'KeyC'],
  },
  volume: 50,
  muted: false,
  tutorial: 0,
};

export const ACTION_LABELS: Record<keyof KeyBindings, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  softDrop: 'SOFT',
  hardDrop: 'HARD',
  rotateCW: 'CW',
  rotateCCW: 'CCW',
  rotate180: '180',
  hold: 'HOLD',
};
