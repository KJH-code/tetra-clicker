/// <reference lib="webworker" />
import { installEngine } from '../sim/bot/ccWasm';
import { policyFor, playOne } from '../sim/bot/index';
import { positionKey } from '../sim/bot/prefetch';
import { Game, type GameSnapshot } from '../sim/game';
import type { BotChoice } from '../sim/bot/policy';
import engineUrl from './cold-clear.wasm?url';

// Runs copies of the bot boards a few pieces ahead of the page and posts
// each decision, keyed by position, so the page never waits on a search.
export type ToWorker =
  | { type: 'track'; id: number; skill: string; snapshot: GameSnapshot }
  | { type: 'drop'; id: number }
  // The page used one of this board's decisions.
  | { type: 'taken'; id: number };
export type FromWorker = { type: 'choice'; id: number; key: string; choice: BotChoice };

const AHEAD = 6;

interface Copy { game: Game; skill: string; ahead: number }
const copies = new Map<number, Copy>();
let ready = false;

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'track') copies.set(m.id, { game: new Game(0, m.snapshot), skill: m.skill, ahead: 0 });
  else if (m.type === 'drop') copies.delete(m.id);
  else if (m.type === 'taken') { const c = copies.get(m.id); if (c) c.ahead = Math.max(0, c.ahead - 1); }
  schedule();
};

let pending = false;
function schedule(): void {
  if (pending || !ready) return;
  pending = true;
  setTimeout(work, 0);
}

// One decision per turn of the event loop, for the board furthest behind,
// so new messages are never kept waiting long.
function work(): void {
  pending = false;
  let next: [number, Copy] | null = null;
  for (const entry of copies) if (entry[1].ahead < AHEAD && (!next || entry[1].ahead < next[1].ahead)) next = entry;
  if (!next) return;
  const [id, copy] = next;
  const policy = policyFor(copy.skill);
  if (!policy || !copy.game.active) { copies.delete(id); schedule(); return; }
  const key = positionKey(copy.game);
  const choice = policy.choose(copy.game);
  if (!choice || !playOne(copy.game, { choose: () => choice })) { copies.delete(id); schedule(); return; }
  copy.ahead++;
  scope.postMessage({ type: 'choice', id, key, choice } satisfies FromWorker);
  schedule();
}

void (async () => {
  const bytes = await (await fetch(engineUrl)).arrayBuffer();
  installEngine((await WebAssembly.instantiate(bytes, {})).instance);
  ready = true;
  schedule();
})();
