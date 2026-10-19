// Fonts ship with the page (OFL; see THIRD_PARTY.md): Exo 2 for Latin and
// figures, Pretendard for Hangul, fetched in subsets as text needs them.
import '@fontsource/exo-2/latin-500.css';
import '@fontsource/exo-2/latin-700.css';
import '@fontsource/exo-2/latin-800.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { World, type WorldEvent } from './sim/world';
import type { LockResult } from './sim/game';
import type { BotTech } from './sim/attack';
import { format } from './sim/num';
import { LocalStorageStore } from './save/localStorageStore';
import { SAVE_VERSION, type SaveData } from './save/schema';
import { startAutosave } from './save/autosave';
import { exportSave, importSave } from './save/transfer';
import { DEFAULT_HANDLING, type HandlingSettings } from './data/handling';
import { BUILDINGS, buildingById } from './data/buildings';
import { GARBAGE } from './data/garbage';
import { SYNERGIES } from './data/synergies';
import { tag } from './sim/tags';
import { BoardRenderer, type BoardView } from './render/boardRenderer';
import { WIDTH } from './sim/board';
import { Fx } from './render/fx';
import { hitStrength } from './render/hit';
import { animatedPlacement, isLanded, type BotAnimation } from './render/botAnim';
import { GOLD, PIECE_COLORS, WRATH_RIM, THEME, VIEW, setPalette, buildingColor, font } from './render/theme';
import { BUFFS } from './data/golden';
import { drawRoundHud } from './render/roundHud';
import { drawEventHud, drawDuelGauge } from './render/eventHud';
import { InputHandler, type Action } from './ui/input';
import { Shop } from './ui/shop';
import { SettingsPanel } from './ui/settings';
import { AchievementsPanel } from './ui/achievements';
import { achievementById } from './data/achievements';
import { AscendPanel } from './ui/ascend';
import { Sound, type Cue } from './ui/sound';
import { TutorialBubble, advance as tutorialAdvance, currentStep as tutorialStep } from './ui/tutorial';
import { installEngine } from './sim/bot/ccWasm';
import engineUrl from './engine/cold-clear.wasm?url';
import { BotPrefetch } from './engine/botPrefetch';
import { resolveLanguage, setLanguage, t } from './ui/i18n';

// The technique bots think with Cold Clear compiled to wasm. Browsers only
// compile a module this size asynchronously, so it loads before anything plays.
installEngine(await loadEngine());
// Board text uses the page's fonts; wait for them (a moment at most) so the
// first frames do not draw in a fallback.
await Promise.race([
  Promise.all([['800 16px "Exo 2"', 'A'], ['700 16px "Exo 2"', 'A'], ['700 16px "Pretendard Variable"', '금고레벨']]
    .map(([f, text]) => document.fonts.load(f!, text).catch(() => []))),
  new Promise((r) => setTimeout(r, 1500)),
]);

async function loadEngine(): Promise<WebAssembly.Instance> {
  const response = await fetch(engineUrl);
  // A host that serves .wasm with the wrong type breaks streaming; bytes always work.
  const bytes = await response.arrayBuffer();
  return (await WebAssembly.instantiate(bytes, {})).instance;
}

const store = new LocalStorageStore();
const saved = store.load();
const settings: HandlingSettings = mergeSettings(saved?.settings);
applyDisplay();
// The language is set before any panel is built; changing it reloads.
const lang = resolveLanguage(settings.language, navigator.languages ?? [navigator.language]);
setLanguage(lang);
document.documentElement.lang = lang;
for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button, #touch button[data-action="hardDrop"]')) b.textContent = t(b.textContent ?? '');

// Accessibility settings into the renderers and the page: palette and
// patterns (the colour-blind palette always shows patterns), motion,
// contrast and text size.
function applyDisplay(): void {
  setPalette(settings.palette);
  VIEW.patterns = settings.patterns || settings.palette === 'cvd';
  VIEW.reduceMotion = settings.reduceMotion;
  VIEW.hitEffects = settings.hitEffects;
  VIEW.highContrast = settings.highContrast;
  VIEW.textScale = settings.uiScale / 100;
  THEME.grid = settings.highContrast ? '#343b52' : '#161a25';
  const root = document.documentElement;
  root.classList.toggle('high-contrast', settings.highContrast);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  root.style.setProperty('--ui-scale', String(settings.uiScale / 100));
}
const world = saved ? new World(saved.world.seed, saved.world) : new World((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
// Bot decisions are worked out ahead in a worker so a search never stalls a frame.
const prefetch = new BotPrefetch(world);
// Handles for checking the page by hand in dev builds.
if (import.meta.env.DEV) Object.assign(window, { prefetch, world });

// --- manual board ---------------------------------------------------------
const manualPane = document.getElementById('manual-pane')!;
const manualCanvas = document.getElementById('manual-board') as HTMLCanvasElement;
let manual = new BoardRenderer(manualCanvas, { cell: 28, leftCells: 5, rightCells: 5 });
// The board takes the largest cell (up to 28) that fits its pane, leaving
// room for the touch buttons when they show; rebuilt only when that changes.
const MANUAL_COLS = 20; // hold 5 + well 10 + next 5
const MANUAL_ROWS = 22;
function fitManual(): void {
  const touch = document.getElementById('touch')!;
  const touchH = touch.offsetHeight > 0 ? touch.offsetHeight + 10 : 0;
  const w = manualPane.clientWidth - 24;
  const h = manualPane.clientHeight - 24 - touchH;
  if (w <= 0 || h <= 0) return;
  // On a wide screen the pane's width follows the canvas, so only height
  // limits it there; a phone's pane is the screen's width.
  const narrow = matchMedia('(max-width: 900px)').matches;
  const cell = Math.max(10, Math.min(28, narrow ? Math.floor(w / MANUAL_COLS) : 28, Math.floor(h / MANUAL_ROWS)));
  if (cell !== manual.layout.cell) manual = new BoardRenderer(manualCanvas, { cell, leftCells: 5, rightCells: 5 });
}
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

// Touch buttons press the input's actions directly; a tap on the board itself
// starts or resumes a life, as any key does.
for (const btn of document.querySelectorAll<HTMLButtonElement>('#touch button')) {
  const action = btn.dataset['action'] as Action;
  const up = (): void => { btn.classList.remove('pressed'); input.release(action); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('pressed');
    input.press(action);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) btn.addEventListener(ev, up);
}
manualCanvas.addEventListener('pointerdown', () => {
  if (!world.round.active) world.startRound();
  else if (world.round.paused) world.resumeRound();
});

// Phones show one pane at a time.
function showTab(tab: string): void {
  document.body.dataset['tab'] = tab;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.classList.toggle('on', b.dataset['tab'] === tab);
  fitManual();
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.addEventListener('click', () => showTab(b.dataset['tab']!));
showTab('board');
window.addEventListener('resize', fitManual);

const shopRoot = document.getElementById('shop-pane')!;
const settingsOverlay = document.getElementById('settings-overlay')!;
const sound = new Sound(settings.volume, settings.muted);
for (const ev of ['keydown', 'pointerdown'] as const) window.addEventListener(ev, () => sound.unlock(), { capture: true });
const settingsPanel = new SettingsPanel(settingsOverlay, settings, () => {
  sound.set(settings.volume, settings.muted);
  applyDisplay();
  fitManual();
  saveNow();
  if (resolveLanguage(settings.language, navigator.languages ?? [navigator.language]) !== lang) location.reload();
}, (open) => input.setActive(!open), {
  exportText: () => exportSave(snapshot()),
  importText: (text) => {
    const data = importSave(text);
    if (!data) return false;
    // Written past the autosave, which stays shut until the reload.
    store.replace(data);
    location.reload();
    return true;
  },
});
const ascendOverlay = document.getElementById('ascend-overlay')!;
// Built before the shop so a save made on the prestige shop reopens it.
let shop: Shop;
const ascendPanel = new AscendPanel(ascendOverlay, world, (open) => input.setActive(!open), () => {
  autoRoot.replaceChildren();
  autoViews.length = 0;
  shop.refresh(true);
  saveNow();
});
// A returning save skips the steps it already shows done.
settings.tutorial = tutorialStep(settings.tutorial, world);
const tutorial = new TutorialBubble(manualPane, () => settings.tutorial, (step) => { settings.tutorial = step; saveNow(); });
tutorial.refresh();
const achievementsPanel = new AchievementsPanel(document.getElementById('achievements-overlay')!, world, (open) => input.setActive(!open));
shop = new Shop(shopRoot, world, () => settingsPanel.open(), () => ascendPanel.confirm(), () => achievementsPanel.open());

// --- save -----------------------------------------------------------------
function snapshot(): SaveData {
  return { version: SAVE_VERSION, savedAt: Date.now(), world: world.snapshot(), settings };
}
function saveNow(): void { store.save(snapshot()); }
startAutosave(store, snapshot);

function mergeSettings(s: Partial<HandlingSettings> | undefined): HandlingSettings {
  const d = structuredClone(DEFAULT_HANDLING);
  // Less motion starts on for a player whose system asks for it.
  d.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!s) return d;
  // Only actions that still exist: an old save may bind keys to one that was removed.
  const keys = { ...d.keys };
  for (const a of Object.keys(keys) as (keyof typeof keys)[]) if (s.keys?.[a]) keys[a] = s.keys[a];
  // Saves from before sound and the tutorial take the defaults, except that
  // a player who has saved before has seen the game: the tutorial still
  // skips the steps their save already shows done.
  return {
    das: s.das ?? d.das, arr: s.arr ?? d.arr, sdf: s.sdf ?? d.sdf, keys,
    volume: s.volume ?? d.volume, muted: s.muted ?? d.muted, tutorial: s.tutorial ?? d.tutorial,
    language: s.language ?? d.language, palette: s.palette ?? d.palette, patterns: s.patterns ?? d.patterns,
    reduceMotion: s.reduceMotion ?? d.reduceMotion, hitEffects: s.hitEffects ?? d.hitEffects,
    uiScale: s.uiScale ?? d.uiScale, highContrast: s.highContrast ?? d.highContrast,
  };
}

// --- events → effects -----------------------------------------------------
function cueFor(e: WorldEvent): Cue | null {
  switch (e.type) {
    case 'manualLock': {
      const r = e.result;
      if (r.lines === 0) return 'lock';
      if (r.perfectClear) return 'pc';
      if (r.spin === 'full') return 'tspin';
      return (['clear1', 'clear2', 'clear3', 'clear4'] as const)[Math.min(4, r.lines) - 1]!;
    }
    case 'levelUp': return 'levelUp';
    case 'checkpoint': return 'checkpoint';
    case 'roundEnd': return 'topOut';
    case 'golden': return e.wrath ? 'wrath' : 'golden';
    case 'goldenSpawn': return e.wrath ? 'wrath' : null;
    case 'achievement': return 'achievement';
    case 'rivalWin': return 'checkpoint';
    case 'lifeEvent': return e.phase === 'start' ? 'wrath' : e.phase === 'won' ? 'checkpoint' : null;
    case 'bought': return 'buy';
    case 'garbage': return 'rise';
    case 'garbageCancel': return 'cancel';
    default: return null;
  }
}

function handleEvent(e: WorldEvent): void {
  const cue = cueFor(e);
  if (cue && e.type === 'manualLock' && e.result.lines > 0) {
    // Each step of a combo a semitone higher, an octave at most.
    sound.play(cue, { strength: hitStrength(e.result), pitch: Math.min(12, Math.max(0, e.result.comboIndex)) });
  } else if (cue) sound.play(cue);
  const step = tutorialAdvance(settings.tutorial, e, world);
  if (step !== settings.tutorial) {
    settings.tutorial = step;
    tutorial.refresh();
    saveNow();
  }
  switch (e.type) {
    case 'manualLock': {
      const r = e.result;
      if (r.lines > 0) {
        const strength = hitStrength(r);
        const color = r.golden ? GOLD : PIECE_COLORS[r.piece];
        manualFx.rowClear(r.clearedRows);
        manualFx.hit(strength);
        manualFx.shatter(manual, r.clearedRows, color, strength);
        const cx = manual.cellX(5);
        const cy = manual.cellY(r.clearedRows[0] ?? e.at.y);
        manualFx.float(`+${format(e.earned)}`, cx, cy, { color, size: 22 + r.lines * 3 });
        const label = clearLabel(r);
        // A technique's name lands big in the middle of the well; a plain clear's stays small by the amount.
        if (label && strength >= 2) {
          manualFx.popup(label, cx, manual.cellY(26), { color: r.perfectClear ? GOLD : r.spin === 'full' ? PIECE_COLORS.T : '#ffffff', size: 18 + strength * 2.5, dur: 1000 + strength * 80, maxWidth: manual.layout.cell * 9.6 });
        } else if (label) manualFx.float(label, cx, cy - 26, { color: '#ffffff', size: 13, dur: 1100 });
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
      manualFx.float(t('GO · LEVEL {n}', { n: e.level }), manual.cellX(5), manual.cellY(29), { color: '#00f0ff', size: 26, dur: 900 });
      break;
    case 'levelUp':
      manualFx.float(t('LEVEL {n}', { n: e.level }), manual.cellX(5), manual.cellY(24), { color: '#00f0ff', size: 22, dur: 1100 });
      break;
    case 'checkpoint':
      manualFx.float(t('CHECKPOINT +{v}', { v: format(e.banked) }), manual.cellX(5), manual.cellY(22), { color: '#39ff14', size: 22, dur: 1600 });
      shop.refresh(true);
      break;
    case 'garbage':
      manualFx.rise(manual, e.rows);
      break;
    case 'garbageCancel':
      manualFx.popup(`−${e.rows}`, manual.cellX(1), manual.cellY(36), { color: '#ff4d5e', size: 16 + Math.min(4, e.rows) * 2, dur: 800 });
      break;
    case 'hardcoreOver':
      ascendPanel.hardcoreOver(e.crowns);
      autoRoot.replaceChildren();
      autoViews.length = 0;
      shop.refresh(true);
      break;
    case 'roundEnd': {
      manualFx.shakeBoard(6);
      if (Number(e.forfeited) > 0) {
        manualFx.float(`−${format(e.forfeited)}`, manual.cellX(5), manual.cellY(25), { color: '#ff3b3b', size: 30, dur: 1600 });
      }
      manualFx.float(t('TOPPED OUT · LEVEL {n}', { n: e.level }), manual.cellX(5), manual.cellY(23), { color: '#ffffff', size: 16, dur: 1600 });
      shop.refresh(true);
      break;
    }
    case 'paused':
      break;
    case 'buff':
      break;
    case 'goldenSpawn':
      manualFx.float(e.wrath ? 'WRATH' : t('GOLDEN'), manual.cellX(5), manual.cellY(22), { color: e.wrath ? WRATH_RIM : GOLD, size: 18, dur: 1200 });
      break;
    case 'golden': {
      const o = e.outcome;
      const text = o.kind === 'buff' ? t(BUFFS[o.buff]?.label ?? o.id)
        : o.kind === 'ruin' ? `RUIN −${format(e.amount)}` : `LUCKY +${format(e.amount)}`;
      // A wrath result is the whole board's news: bigger, longer, harder shake.
      manualFx.shakeBoard(e.wrath ? 7 : 3);
      manualFx.float(text, manual.cellX(5), manual.cellY(23), e.wrath
        ? { color: o.id === 'elder_frenzy' ? '#ff5050' : WRATH_RIM, size: 36, dur: 2800 }
        : { color: GOLD, size: 24, dur: 2000 });
      break;
    }
    case 'rivalWin':
      manualFx.float(t('RIVAL DOWN ×{n} +{v}', { n: e.streak, v: format(e.amount) }), manual.cellX(5), manual.cellY(24), { color: '#ff5050', size: 26, dur: 2200 });
      break;
    case 'garbageBonus':
      manualFx.float(t('GARBAGE BONUS +{v}', { v: format(e.amount) }), manual.cellX(5), manual.cellY(27), { color: GOLD, size: 18, dur: 1400 });
      break;
    case 'garbageQueued':
      manualFx.float(t('+{n} GARBAGE', { n: e.rows }), manual.cellX(1), manual.cellY(38), { color: '#ff4d5e', size: 13, dur: 1200 });
      break;
    case 'helperRow':
      manualFx.float(`HELPER +${format(e.amount)}`, manual.cellX(5), manual.cellY(30), { color: '#39ff14', size: 16, dur: 1000 });
      break;
    case 'lifeEvent': {
      const names = { rival: 'RIVAL', invader: 'INVADER', helper: 'HELPER' };
      const name = names[e.kind];
      const text = e.phase === 'start' ? `${name}!` : e.phase === 'won' ? t('{name} BEATEN +{v}', { name, v: format(e.amount) })
        : e.phase === 'lost' ? t('{name} WINS', { name }) : t('{name} LEAVES', { name });
      manualFx.float(text, manual.cellX(5), manual.cellY(24), { color: e.phase === 'lost' ? '#7a7aa0' : '#ff8c1a', size: e.phase === 'start' ? 30 : 24, dur: 2200 });
      if (e.phase === 'start') manualFx.shakeBoard(4);
      break;
    }
    case 'achievement':
      toast(t('★ {name} · +1% income', { name: t(achievementById(e.id)?.name ?? e.id) }), 'achievement');
      shop.refresh(true);
      break;
    case 'goldenLost':
      manualFx.float(t(e.wrath ? 'WRATH LOST' : 'GOLDEN LOST'), manual.cellX(5), manual.cellY(23), { color: '#7a7aa0', size: 16, dur: 1200 });
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
    case 'downstack': {
      const g = r.garbageCleared;
      return g ? `${g.clean + g.cheese} GARBAGE${g.cheese ? ' · CHEESE' : ''}` : null;
    }
    case 'fourwide': return r.comboIndex > 0 ? `${r.comboIndex} COMBO` : null;
    case 'opener': return r.perfectClear ? 'PERFECT CLEAR' : r.piece === 'T' && r.spin === 'full' ? `T-SPIN ${names[r.lines]}` : null;
  }
}

function toast(text: string, kind = ''): void {
  const t = document.createElement('div');
  t.className = kind ? `toast ${kind}` : 'toast';
  // Several at once (a save that already met a dozen achievements) stack
  // instead of printing over each other.
  // The bot pane, or on a phone whichever pane is showing.
  const panes = ['auto-pane', 'manual-pane', 'shop-pane'].map((id) => document.getElementById(id)!);
  const pane = panes.find((p) => p.offsetParent !== null) ?? panes[0]!;
  t.style.top = `${12 + (pane.querySelectorAll('.toast').length % 8) * 34}px`;
  t.textContent = text;
  pane.append(t);
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
            v.fx.float(label, v.renderer.cellX(5), v.renderer.cellY((r.clearedRows[0] ?? 30) - 2), { color: '#ffffff', size: Math.max(8, Math.round(v.renderer.layout.cell * 0.8)), dur: 900,
              maxWidth: WIDTH * v.renderer.layout.cell - 4 });
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
    golden: { active: g.golden.active, holds: g.golden.holds, next: g.golden.queue, wrath: !!g.golden.wrath },
  };
  const buffs = world.buffs.active.map((b) => ({ label: BUFFS[b.id]?.label ?? b.id, msLeft: b.msLeft }));
  manual.render(view, manualFx, (ctx) => {
    drawRoundHud(ctx, manual, world.round, world.wrath(), buffs, world.nextStartLevel(), world.economy.meta.hardcore, world.economy.boardGarbage * GARBAGE.penaltyPctPerRow);
    drawEventHud(ctx, manual, world.lifeEvent, view.next.length);
    // Rows waiting for the board: the rival's and what purchases sent.
    drawDuelGauge(ctx, manual, (world.duel?.toMe ?? 0) + world.garbageQueue);
  });
  manualPane.classList.toggle('hardcore', world.economy.meta.hardcore);
  ensureAutoViews();
  world.autoBoards.forEach((board, i) => {
    const v = autoViews[i]!;
    const def = buildingById(board.buildingId);
    const hold = { holds: board.game.holds, holdUsed: false, next: [] as never[] };
    if (v.anim) {
      const p = animatedPlacement(v.anim);
      v.renderer.render({ grid: v.anim.before, active: p, ghostY: null, ...hold }, v.fx, (ctx) => label(ctx, v.renderer, boardLabel(board.buildingId, def?.name), board.buildingId));
    } else {
      v.renderer.render({ grid: board.game.grid, active: null, ghostY: null, ...hold }, v.fx, (ctx) => label(ctx, v.renderer, boardLabel(board.buildingId, def?.name), board.buildingId));
    }
  });
}

const e2Earned = (v: AutoView): number => v.lastEarned;

// The building's name, SYN when a synergy it is part of is bought, and the
// buff multiplier while one is lifting this bot.
function boardLabel(id: string, name: string | undefined): string {
  const syn = SYNERGIES.some((s) => s.pair.includes(id) && world.economy.hasUpgrade(s.id)) ? ' · SYN' : '';
  const buff = world.buffs.multiplier([tag.board('auto'), tag.building(id)], world.economy);
  // The rival names its fight: the streak while a life runs.
  const duel = id === 'rival' && world.duel ? ` · ${t('WIN {n}', { n: world.economy.meta.rivalStreak })}` : '';
  return `${name ?? id}${syn}${duel}${buff > 1 ? ` ×${buff}` : ''}`;
}

// The board's name over the buffer rows, after a bar in the building's
// colour (the same as its shop card).
function label(ctx: CanvasRenderingContext2D, r: BoardRenderer, text: string, id: string): void {
  const c = r.layout.cell;
  const h = Math.max(12, Math.round(c * 1.3));
  ctx.save();
  ctx.fillStyle = buildingColor(BUILDINGS.findIndex((b) => b.id === id));
  ctx.fillRect(r.cellX(0) + 3, 4, 4, h - 4);
  ctx.fillStyle = THEME.text;
  // As large as fits across the well, 9-13 px.
  const room = WIDTH * c - 12;
  let size = 13;
  ctx.font = font(800, size);
  while (size > 9 && ctx.measureText(text).width > room) ctx.font = font(800, --size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, r.cellX(0) + 12, 2 + h / 2);
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
// Dev server only: lets a browser script stage a clear or a garbage rise
// for screenshots without playing one out.
if (import.meta.env.DEV) Object.assign(window, { tetra: { world, handleEvent } });
