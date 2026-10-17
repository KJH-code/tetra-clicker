// Named builds the OPENER bot can play, each opened by one step of the
// OPENER prestige chain. A build must loop: end in a PC (or a DPC) so the
// board comes back empty for the next one. Shapes are fumen strings
// (src/sim/fumen.ts); the bot falls back to its DPC search whenever the
// queue does not fit the build. The list waits on fumen data for TEAL,
// 산악 2호, 신DT, Sarcell, SDPC, GA spin, Eternal Return and the like.
export interface OpenerDef {
  id: string;
  name: string;
  fumen: string;
}

export const OPENERS: OpenerDef[] = [];
