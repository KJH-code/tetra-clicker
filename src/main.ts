import { World, type WorldEvent } from './sim/world';
import type { LockResult } from './sim/game';
import type { BotTech } from './sim/attack';
import { format } from './sim/num';
import { LocalStorageStore } from './save/localStorageStore';
import { SAVE_VERSION, type SaveData } from './save/schema';
import { startAutosave } from './save/autosave';
import { DEFAULT_HANDLING, type HandlingSettings } from './data/handling';
import { buildingById } from './data/buildings';
import { SYNERGIES } from './data/synergies';
import { tag } from './sim/tags';
import { BoardRenderer, type BoardView } from './render/boardRenderer';
import { Fx } from './render/fx';
import { animatedPlacement, isLanded, type BotAnimation } from './render/botAnim';
import { GOLD, PIECE_COLORS } from './render/theme';
import { BUFFS } from './data/golden';
import { drawRoundHud } from './render/roundHud';
import { InputHandler } from './ui/input';
import { Shop } from './ui/shop';
import { SettingsPanel } from './ui/settings';
import { AscendPanel } from './ui/ascend';
import { installEngine } from './sim/bot/ccWasm';
import engineUrl from './engine/cold-clear.wasm?url';
import { BotPrefetch } from './engine/botPrefetch';

// The technique bots think with Cold Clear compiled to wasm. Browsers only
// compile a module this size asynchronously, so it loads before anything plays.
installEngine(await loadEngine());

async function loadEngine(): Promise<WebAssembly.Instance> {
  const response = await fetch(engineUrl);
  // A host that serves .wasm with the wrong type breaks streaming; bytes always work.
  const bytes = await response.arrayBuffer();
  return (await WebAssembly.instantiate(bytes, {})).instance;
}

const store = new LocalStorageStore();
const saved = store.load();
const settings: HandlingSettings = saved ? mergeSettings(saved.settings) : structuredClone(DEFAULT_HANDLING);
const world = saved ? new World(saved.world.seed, saved.world) : new World((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
// Bot decisions are worked out ahead in a worker so a search never stalls a frame.
const prefetch = new BotPrefetch(world);
// Handles for checking the page by hand in dev builds.
if (import.meta.env.DEV) Object.assign(window, { prefetch, world });

// --- manual board ---------------------------------------------------------
const manualCanvas = document.getElementById('manual-board') as HTMLCanvasElement;
const manual = new BoardRenderer(manualCanvas, { cell: 28, leftCells: 5, rightCells: 5 });
const manualFx = new Fx();

// --- auto boards ----------------------------------------------------------
interface AutoView { renderer: BoardRenderer; fx: Fx; anim: BotAnimation | null; lastEarned: number }
const autoViews: AutoView[] = [];
const autoRoot = document.getElementById('auto-boards')!;

// Bot boards shrink as more of them share the middle pane: the largest cell
// at which every board fits without scrolling. When the size changes every
// canvas is rebuilt so they all match.
const AUTO_BOARD_COLS = 14; // hold column + the 10-wide well
const AUTO_BOARD_ROWS = 22; // 20 visible + 2 buffer rows
const AUTO_GAP = 12;
function autoCellSize(): number {
  const n = world.autoBoards.length;
  const pane = autoRoot.parentElement!;
  const w = pane.clientWidth - 2 * AUTO_GAP;
  const h = pane.clientHeight - 2 * AUTO_GAP;
  for (let cell = n <= 1 ? 20 : 14; cell > 6; cell--) {
    const cols = Math.max(1, Math.floor((w + AUTO_GAP) / (AUTO_BOARD_COLS * cell + AUTO_GAP)));
    if (Math.ceil(n / cols) * (AUTO_BOARD_ROWS * cell + AUTO_GAP) - AUTO_GAP <= h) return cell;
  }
  return 6;
}

function ensureAutoViews(): void {
  const cell = autoCellSize();
  if (autoViews.length > 0 && autoViews[0]!.renderer.layout.cell !== cell) {
    autoRoot.replaceChildren();
    autoViews.length = 0;
  }
  while (autoViews.length < world.autoBoards.length) {
    const canvas = document.createElement('canvas');
    autoRoot.append(canvas);
    autoViews.push({ renderer: new BoardRenderer(canvas, { cell, leftCells: 4, rightCells: 0 }), fx: new Fx(), anim: null, lastEarned: 0 });
  }
}

// --- input / shop / settings -----------------------------------------------
const input = new InputHandler({
  // A getter: ascending replaces the manual game.
  get game() { return world.manual; },
  onHardDrop: () => { world.manualHardDrop(); },
  gate: () => (!world.round.active ? 'start' : world.round.paused ? 'resume' : 'play'),
  start: () => { world.startRound(); },
  resume: () => { world.resumeRound(); },
}, settings);
// A life cannot be played from another tab or window: pause it.
document.addEventListener('visibilitychange', () => { if (document.hidden) world.pauseRound(); });
window.addEventListener('blur', () => world.pauseRound());
input.attach(window);
input.setActive(true);

const shopRoot = document.getElementById('shop-pane')!;
const settingsOverlay = document.getElementById('settings-overlay')!;
const settingsPanel = new SettingsPanel(settingsOverlay, settings, () => saveNow(), (open) => input.setActive(!open));
const ascendOverlay = document.getElementById('ascend-overlay')!;
// Built before the shop so a save made on the prestige shop reopens it.
let shop: Shop;
const ascendPanel = new AscendPanel(ascendOverlay, world, (open) => input.setActive(!open), () => {
  autoRoot.replaceChildren();
  autoViews.length = 0;
  shop.refresh(true);
  saveNow();
});
shop = new Shop(shopRoot, world, () => settingsPanel.open(), () => ascendPanel.confirm());

// --- save -----------------------------------------------------------------
function snapshot(): SaveData {
  return { version: SAVE_VERSION, savedAt: Date.now(), world: world.snapshot(), settings };
}
function saveNow(): void { store.save(snapshot()); }
startAutosave(store, snapshot);

function mergeSettings(s: Partial<HandlingSettings> | undefined): HandlingSettings {
  const d = structuredClone(DEFAULT_HANDLING);
  if (!s) return d;
  // Only actions that still exist: an old save may bind keys to one that was removed.
  const keys = { ...d.keys };
  for (const a of Object.keys(keys) as (keyof typeof keys)[]) if (s.keys?.[a]) keys[a] = s.keys[a];
  return { das: s.das ?? d.das, arr: s.arr ?? d.arr, sdf: s.sdf ?? d.sdf, keys };
}

// --- events → effects -----------------------------------------------------
function handleEvent(e: WorldEvent): void {
  switch (e.type) {
    case 'manualLock': {
      const r = e.result;
      if (r.lines > 0) {
        manualFx.rowClear(r.clearedRows);
        manualFx.shakeBoard(r.lines + (r.spin !== 'none' ? 1 : 0) + (r.perfectClear ? 3 : 0));
        const cx = manual.cellX(5);
        const cy = manual.cellY(r.clearedRows[0] ?? e.at.y);
        manualFx.float(`+${format(e.earned)}`, cx, cy, { color: r.golden ? GOLD : PIECE_COLORS[r.piece], size: 22 + r.lines * 3 });
        const label = clearLabel(r);
        if (label) manualFx.float(label, cx, cy - 26, { color: '#ffffff', size: 13, dur: 1100 });
      }
      break;
    }
    case 'botMove': {
      ensureAutoViews();
      const v = autoViews[e.board]!;
      v.anim = { move: e.move, before: e.move.before, t: 0 };
      v.lastEarned = Number(e.earned);
      break;
    }
    case 'catchUp': {
      if (Number(e.earned) > 0) toast(`+${format(e.earned)} · ${Math.round(e.seconds)}s`);
      break;
    }
    case 'bought':
      ensureAutoViews();
      shop.refresh(true);
      break;
    case 'upgraded':
      shop.refresh(true);
      break;
    case 'slept':
      break;
    case 'roundStart':
      manualFx.float(`GO · LEVEL ${e.level}`, manual.cellX(5), manual.cellY(29), { color: '#00f0ff', size: 26, dur: 900 });
      break;
    case 'levelUp':
      manualFx.float(`LEVEL ${e.level}`, manual.cellX(5), manual.cellY(24), { color: '#00f0ff', size: 22, dur: 1100 });
      break;
    case 'checkpoint':
      manualFx.float(`CHECKPOINT +${format(e.banked)}`, manual.cellX(5), manual.cellY(22), { color: '#39ff14', size: 22, dur: 1600 });
      shop.refresh(true);
      break;
    case 'garbage':
      manualFx.shakeBoard(1);
      break;
    case 'roundEnd': {
      manualFx.shakeBoard(6);
      if (Number(e.forfeited) > 0) {
        manualFx.float(`−${format(e.forfeited)}`, manual.cellX(5), manual.cellY(25), { color: '#ff3b3b', size: 30, dur: 1600 });
      }
      manualFx.float(`TOPPED OUT · LEVEL ${e.level}`, manual.cellX(5), manual.cellY(23), { color: '#ffffff', size: 16, dur: 1600 });
      shop.refresh(true);
      break;
    }
    case 'paused':
      break;
    case 'buff':
      break;
    case 'goldenSpawn':
      manualFx.float('GOLDEN', manual.cellX(5), manual.cellY(22), { color: GOLD, size: 18, dur: 1200 });
      break;
    case 'golden': {
      const o = e.outcome;
      const text = o.kind === 'buff' ? BUFFS[o.buff]?.label ?? o.id : `LUCKY +${format(e.amount)}`;
      manualFx.shakeBoard(3);
      manualFx.float(text, manual.cellX(5), manual.cellY(23), { color: GOLD, size: 24, dur: 2000 });
      break;
    }
    case 'goldenLost':
      manualFx.float('GOLDEN LOST', manual.cellX(5), manual.cellY(23), { color: '#7a7aa0', size: 16, dur: 1200 });
      break;
  }
}

function clearLabel(r: LockResult): string | null {
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  const parts: string[] = [];
  if (r.b2bExtended) parts.push('B2B');
  if (r.spin === 'full') parts.push(`${r.piece}-SPIN`);
  if (r.spin === 'mini') parts.push(`MINI ${r.piece}-SPIN`);
  parts.push(names[r.lines] ?? `${r.lines} LINES`);
  if (r.comboIndex > 0) parts.push(`${r.comboIndex} COMBO`);
  if (r.perfectClear) parts.push('PERFECT CLEAR');
  return parts.length ? parts.join(' ') : null;
}

// A bot board names only the technique its building is paid for: the full
// clear name does not fit a board shrunk to share the pane with eight others.
function techLabel(r: LockResult, tech: BotTech): string | null {
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  switch (tech) {
    case 'tspin': return r.piece === 'T' && r.spin === 'full' ? `T-SPIN ${names[r.lines]}` : null;
    case 'allspin': return r.spin === 'full' ? `${r.piece}-SPIN ${names[r.lines]}` : null;
    case 'combo': return r.comboIndex > 0 ? `${r.comboIndex} COMBO` : null;
    case 'b2b': return r.b2bExtended ? `B2B ${r.spin === 'full' ? 'TSD' : names[r.lines]}` : null;
    case 'pc': return r.perfectClear ? 'PERFECT CLEAR' : null;
  }
}

function toast(text: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.getElementById('auto-pane')!.append(t);
  setTimeout(() => t.remove(), 2600);
}

// --- loop -----------------------------------------------------------------
let lastFrame = performance.now();

function tick(): void {
  const now = performance.now();
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;
  // Wall clock, not frame time: hidden tabs throttle frames but time still passes.
  world.advance(Date.now());
  input.update(dt);
  for (const e of world.drainEvents()) handleEvent(e);
  manualFx.update(dt);
  for (const v of autoViews) {
    v.fx.update(dt);
    if (v.anim) {
      v.anim.t += dt;
      if (isLanded(v.anim)) {
        const r = v.anim.move.result;
        if (r.lines > 0) {
          v.fx.rowClear(r.clearedRows);
          v.fx.shakeBoard(1);
          v.fx.float(`+${format(e2Earned(v))}`, v.renderer.cellX(5), v.renderer.cellY(r.clearedRows[0] ?? 30), { color: PIECE_COLORS[r.piece], size: 14, dur: 700 });
          // Technique bots announce their technique, as the manual board does.
          const tech = buildingById(world.autoBoards[autoViews.indexOf(v)]?.buildingId ?? '')?.tech;
          const label = tech ? techLabel(r, tech) : null;
          if (label) {
            v.fx.float(label, v.renderer.cellX(5), v.renderer.cellY((r.clearedRows[0] ?? 30) - 2), { color: '#ffffff', size: Math.max(8, Math.round(v.renderer.layout.cell * 0.8)), dur: 900 });
          }
        }
        v.anim = null;
      }
    }
  }
  render();
  shop.refresh();
}

function render(): void {
  const g = world.manual;
  const view: BoardView = {
    grid: g.grid, active: g.active, ghostY: g.active ? g.ghostY() : null,
    holds: g.holds, holdUsed: g.holdUsed, next: g.next(),
    golden: { active: g.golden.active, holds: g.golden.holds, next: g.golden.queue },
  };
  const buffs = world.buffs.active.map((b) => ({ label: BUFFS[b.id]?.label ?? b.id, msLeft: b.msLeft }));
  manual.render(view, manualFx, (ctx) => drawRoundHud(ctx, manual, world.round, world.wrath(), buffs, world.nextStartLevel()));
  ensureAutoViews();
  world.autoBoards.forEach((board, i) => {
    const v = autoViews[i]!;
    const def = buildingById(board.buildingId);
    const hold = { holds: board.game.holds, holdUsed: false, next: [] as never[] };
    if (v.anim) {
      const p = animatedPlacement(v.anim);
      v.renderer.render({ grid: v.anim.before, active: p, ghostY: null, ...hold }, v.fx, (ctx) => label(ctx, v.renderer, boardLabel(board.buildingId, def?.name)));
    } else {
      v.renderer.render({ grid: board.game.grid, active: null, ghostY: null, ...hold }, v.fx, (ctx) => label(ctx, v.renderer, boardLabel(board.buildingId, def?.name)));
    }
  });
}

const e2Earned = (v: AutoView): number => v.lastEarned;

// The building's name, SYN when a synergy it is part of is bought, and the
// buff multiplier while one is lifting this bot.
function boardLabel(id: string, name: string | undefined): string {
  const syn = SYNERGIES.some((s) => s.pair.includes(id) && world.economy.hasUpgrade(s.id)) ? ' · SYN' : '';
  const buff = world.buffs.multiplier([tag.board('auto'), tag.building(id)], world.economy);
  return `${name ?? id}${syn}${buff > 1 ? ` ×${buff}` : ''}`;
}

function label(ctx: CanvasRenderingContext2D, r: BoardRenderer, text: string): void {
  ctx.save();
  ctx.fillStyle = '#7a7aa0';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, r.cellX(0) + 4, 4);
  ctx.restore();
}

function frame(): void {
  tick();
  prefetch.sync();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Hidden tabs stop animation frames entirely; a coarse interval keeps the
// clock advancing so the catch-up formula runs while the tab is away.
window.setInterval(() => { if (document.hidden) tick(); }, 1000);
