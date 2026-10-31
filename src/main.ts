// Fonts ship with the page (OFL; see THIRD_PARTY.md): Exo 2 for Latin and
// figures, Pretendard for Hangul, fetched in subsets as text needs them;
// Galmuri for both in the pixel style.
import '@fontsource/exo-2/latin-500.css';
import '@fontsource/exo-2/latin-700.css';
import '@fontsource/exo-2/latin-800.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './fonts.css';
import './pixel.css';
import { World, type WorldEvent } from './sim/world';
import type { LockResult } from './sim/game';
import type { BotTech } from './sim/attack';
import { format, toNumber } from './sim/num';
import { Backdrop } from './render/backdrop';
import { Coins, unitStep } from './render/coins';
import { buildingTier } from './data/tiers';
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
import { TOP_VISIBLE_ROW, WIDTH, occupiedCells } from './sim/board';
import { Fx } from './render/fx';
import { hitStrength } from './render/hit';
import { animatedPlacement, isLanded, type BotAnimation } from './render/botAnim';
import { GOLD, PIECE_COLORS, WRATH_RIM, THEME, VIEW, setPalette, buildingColor, font, levelTheme } from './render/theme';
import { BUFFS } from './data/golden';
import { drawRoundHud, drawLifePanel } from './render/roundHud';
import { Roller } from './render/roll';
import { missionById } from './data/missions';
import { drawEventHud, drawDuelGauge, eventName, EVENT_COLORS } from './render/eventHud';
import { InputHandler, type Action } from './ui/input';
import { Shop } from './ui/shop';
import { SettingsPanel } from './ui/settings';
import { AchievementsPanel } from './ui/achievements';
import { achievementById } from './data/achievements';
import { AscendPanel } from './ui/ascend';
import { Sound, type Cue } from './ui/sound';
import { TutorialBubble, advance as tutorialAdvance, currentStep as tutorialStep } from './ui/tutorial';
import { installEngine, ccWasmBot, CC_DEFAULT } from './sim/bot/ccWasm';
import { Game } from './sim/game';
import { BotZoom } from './ui/botZoom';
import { BOT_LINKS, linkBuffId } from './data/botlinks';
import engineUrl from './engine/cold-clear.wasm?url';
import { BotPrefetch } from './engine/botPrefetch';
import { resolveLanguage, setLanguage, t } from './ui/i18n';
import { TitleScreen } from './ui/title';
import { readBody } from './engine/readBody';

// The title screen covers the loading: it needs nothing the engine brings.
const title = new TitleScreen(document.body);
// The technique bots think with Cold Clear compiled to wasm. Browsers only
// compile a module this size asynchronously, so it loads before anything plays.
installEngine(await loadEngine((k) => title.progress(k * 0.9)));
// Board text uses the page's fonts; wait for them (a moment at most) so the
// first frames do not draw in a fallback.
await Promise.race([
  Promise.all([['800 16px "Exo 2"', 'A'], ['700 16px "Exo 2"', 'A'], ['700 16px "Pretendard Variable"', '금고레벨'], ['700 12px Galmuri11', 'A금'], ['400 12px Galmuri11', 'A금']]
    .map(([f, text]) => document.fonts.load(f!, text).catch(() => []))),
  new Promise((r) => setTimeout(r, 1500)),
]);

async function loadEngine(onProgress: (k: number) => void): Promise<WebAssembly.Instance> {
  const response = await fetch(engineUrl);
  // A host that serves .wasm with the wrong type breaks streaming; bytes always
  // work, read in chunks so the title's loading bar follows the download.
  const bytes = await readBody(response, onProgress);
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
  VIEW.backdrop = settings.backdrop / 100;
  VIEW.highContrast = settings.highContrast;
  VIEW.textScale = settings.uiScale / 100;
  VIEW.pixel = settings.style === 'pixel';
  THEME.grid = settings.highContrast ? '#343b52' : '#161a25';
  const root = document.documentElement;
  root.classList.toggle('high-contrast', settings.highContrast);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  root.classList.toggle('pixel', VIEW.pixel);
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
const backdrop = new Backdrop(document.getElementById('backdrop') as HTMLCanvasElement);
const coins = new Coins(document.getElementById('coins') as HTMLCanvasElement, () => {
  const el = document.getElementById('balance');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
});
const milestoneEl = document.getElementById('milestone')!;

// --- auto boards ----------------------------------------------------------
interface AutoView { renderer: BoardRenderer; fx: Fx; anim: BotAnimation | null; lastEarned: number }
const autoViews: AutoView[] = [];
const autoRoot = document.getElementById('auto-boards')!;
// A bot board clicked opens large, with its numbers.
const botZoom = new BotZoom(document.getElementById('bot-overlay')!, world, (open) => input.setActive(!open));

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
  // One grid, every board the same size, rows filled left to right.
  const pane = autoRoot.parentElement!;
  const cols = Math.max(1, Math.min(world.autoBoards.length, Math.floor((pane.clientWidth - AUTO_GAP) / (AUTO_BOARD_COLS * cell + AUTO_GAP))));
  autoRoot.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
  while (autoViews.length < world.autoBoards.length) {
    const canvas = document.createElement('canvas');
    const index = autoViews.length;
    canvas.title = t('Click to look closer');
    canvas.addEventListener('click', () => botZoom.show(index));
    autoRoot.append(canvas);
    autoViews.push({ renderer: new BoardRenderer(canvas, { cell, leftCells: 4, rightCells: 0 }), fx: new Fx(), anim: null, lastEarned: 0 });
  }
}

// --- hint -------------------------------------------------------------------
// The bots' pick for the piece in play, drawn as a dashed ghost for a few
// seconds. Worked out on a copy, so asking never touches the life.
let hint: { cells: readonly (readonly [number, number])[]; color: string; hold: boolean; until: number } | null = null;
const hintPolicy = ccWasmBot({ weights: CC_DEFAULT, nodes: 1_500 });

function showHint(): void {
  if (!world.requestHint()) {
    if (world.autoBoards.length > 0 && world.hintMs > 0) manualFx.float(t('HINT IN {n}s', { n: Math.ceil(world.hintMs / 1000) }), manual.cellX(5), manual.cellY(33), { color: '#8d93ab', size: 13, dur: 900 });
    return;
  }
  const copy = new Game(1, world.manual.snapshot());
  const choice = hintPolicy.choose(copy);
  if (!choice) return;
  if (choice.useHold) copy.swapHold();
  if (!copy.setActive(choice.placement)) return;
  const landed = { ...choice.placement, y: copy.ghostY() };
  hint = { cells: occupiedCells(landed), color: PIECE_COLORS[landed.piece], hold: choice.useHold, until: performance.now() + BOT_LINKS.hintShowMs };
  sound.play('buy');
}

function drawHint(ctx: CanvasRenderingContext2D): void {
  if (!hint) return;
  const left = hint.until - performance.now();
  if (left <= 0 || !world.round.live) { hint = null; return; }
  const c = manual.layout.cell;
  ctx.save();
  ctx.globalAlpha = Math.min(1, left / 600) * (0.6 + 0.4 * Math.sin(performance.now() / 120) ** 2);
  ctx.strokeStyle = hint.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  for (const [x, y] of hint.cells) ctx.strokeRect(manual.cellX(x) + 2, manual.cellY(y) + 2, c - 4, c - 4);
  if (hint.hold) {
    ctx.setLineDash([]);
    ctx.fillStyle = hint.color;
    ctx.font = font(800, c * 0.45);
    ctx.textAlign = 'center';
    const [x, y] = hint.cells[0]!;
    ctx.fillText(t('HOLD FIRST'), manual.cellX(x) + c / 2, manual.cellY(y) - 6);
  }
  ctx.restore();
}

// --- input / shop / settings -----------------------------------------------
const input = new InputHandler({
  // A getter: ascending replaces the manual game.
  get game() { return world.manual; },
  onHardDrop: () => { world.manualHardDrop(); },
  gate: () => (!world.round.active ? 'start' : world.round.paused ? 'resume' : 'play'),
  start: () => { world.startRound(); },
  resume: () => { world.resumeRound(); },
  onHint: () => { showHint(); },
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
  // A hidden shop had no width to fit its names to; now it has.
  if (tab === 'shop') shop.refresh(true);
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
  // The shop's icons are drawn once; a palette or style change redraws them.
  shop?.refresh(true);
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
    // A save from before milestones starts at its balance's unit (set once the world loads), not at 1K again.
    milestone: s.milestone ?? -1,
    uiScale: s.uiScale ?? d.uiScale, highContrast: s.highContrast ?? d.highContrast, backdrop: s.backdrop ?? d.backdrop,
    style: s.style ?? d.style,
    titleScreen: s.titleScreen ?? d.titleScreen,
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
    case 'missionDone': return 'checkpoint';
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
      const now = world.round.elapsedMs;
      lockTimes = lockTimes.filter((at) => at > now - PPS_WINDOW_S * 1000 && at <= now);
      lockTimes.push(now);
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
    case 'botLink': {
      const i = world.autoBoards.findIndex((b) => b.buildingId === e.building);
      const v = autoViews[i];
      if (v) v.fx.popup(`×2 · ${Math.ceil(e.msLeft / 1000)}s`, v.renderer.cellX(5), v.renderer.cellY(26), { color: '#39ff14', size: Math.max(10, Math.round(v.renderer.layout.cell)), dur: 900, maxWidth: WIDTH * v.renderer.layout.cell - 4 });
      break;
    }
    case 'botLevel':
      toast(t('{name} BOT · LEVEL {n}', { name: buildingById(e.building)?.name ?? e.building, n: e.level }), 'achievement');
      break;
    case 'botAbility': {
      const text = { tetris: t('−1 GARBAGE'), pc: t('BOTS ×2'), downstack: t('−1 ROW'), allspin: t('HINT −2s') }[e.building as 'tetris'];
      const v = autoViews[e.board];
      if (v && text) v.fx.popup(text, v.renderer.cellX(5), v.renderer.cellY(30), { color: '#00f0ff', size: Math.max(10, Math.round(v.renderer.layout.cell)), dur: 1100, maxWidth: WIDTH * v.renderer.layout.cell - 4 });
      // What lands on your own board shows there too.
      if (text && (e.building === 'tetris' || e.building === 'downstack')) manualFx.float(`${buildingById(e.building)?.name} ${text}`, manual.cellX(5), manual.cellY(36), { color: '#00f0ff', size: 13, dur: 1100 });
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
    case 'bought': {
      ensureAutoViews();
      shop.refresh(true);
      // Crossing 10, 25, 50 or 100 copies earns a star.
      const tier = buildingTier(e.owned);
      if (tier > buildingTier(e.owned - 1)) {
        toast(t('{name} ★{n}', { name: buildingById(e.buildingId)?.name ?? e.buildingId, n: tier }), 'achievement');
        const card = document.querySelector(`[data-building="${e.buildingId}"]`);
        card?.classList.remove('tier-up');
        void (card as HTMLElement | null)?.offsetWidth;
        card?.classList.add('tier-up');
      }
      break;
    }
    case 'upgraded':
      shop.refresh(true);
      break;
    case 'slept':
      break;
    case 'roundStart':
      lockTimes = [];
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
    case 'missionDone': {
      // Several met by one piece stack up the well instead of overprinting.
      const now = performance.now();
      missionStack = now - missionStackAt < 1500 ? missionStack + 1 : 0;
      missionStackAt = now;
      const y = 30 - missionStack * 2.6;
      const def = missionById(e.id);
      manualFx.popup(t('MISSION · {name}', { name: t(def?.label ?? e.id) }), manual.cellX(5), manual.cellY(y), { color: '#39ff14', size: 18, dur: 1600, maxWidth: manual.layout.cell * 9.6 });
      manualFx.float(`+${format(e.amount)}`, manual.cellX(5), manual.cellY(y + 1.2), { color: '#39ff14', size: 16, dur: 1600 });
      break;
    }
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
      const name = eventName(e.kind);
      const text = e.phase === 'start' ? `${name}!`
        : e.kind === 'bonus' ? t('{name} +{v}', { name, v: format(e.amount) })
        : e.kind === 'tech' ? (e.phase === 'won' ? t('{name} CLEARED +{v}', { name, v: format(e.amount) }) : t('{name} FAILED', { name }))
        : e.kind === 'boss' && e.phase === 'lost' ? t('{name} ESCAPED', { name })
        : e.phase === 'won' ? t('{name} BEATEN +{v}', { name, v: format(e.amount) })
        : e.phase === 'lost' ? t('{name} WINS', { name }) : t('{name} LEAVES', { name });
      const color = e.phase === 'lost' ? '#7a7aa0' : EVENT_COLORS[e.kind];
      if (e.phase === 'start' || e.phase === 'won') manualFx.popup(text, manual.cellX(5), manual.cellY(24), { color, size: e.phase === 'start' ? 28 : 22, dur: 2200, maxWidth: manual.layout.cell * 9.6 });
      else manualFx.float(text, manual.cellX(5), manual.cellY(24), { color, size: 22, dur: 2200, maxWidth: manual.layout.cell * 9.6 });
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
    // The biggest thing it did.
    case 'master': return r.perfectClear ? 'PERFECT CLEAR' : r.spin === 'full' ? `${r.piece}-SPIN ${names[r.lines]}`
      : r.comboIndex > 1 ? `${r.comboIndex} COMBO` : r.lines === 4 ? (r.b2bExtended ? 'B2B TETRIS' : 'TETRIS') : null;
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
  backdrop.setIncome(toNumber(world.incomePerSecond()));
  backdrop.update(dt);
  coins.update(dt);
  checkMilestone();
  for (const v of autoViews) {
    v.fx.update(dt);
    if (v.anim) {
      v.anim.t += dt;
      if (isLanded(v.anim)) {
        const r = v.anim.move.result;
        if (r.lines > 0) {
          v.fx.rowClear(r.clearedRows);
          v.fx.shakeBoard(1);
          const balanceEl = document.getElementById('balance');
          if (balanceEl) coins.spawn(v.renderer.canvas.getBoundingClientRect(), balanceEl.getBoundingClientRect(), PIECE_COLORS[r.piece]);
          v.fx.float(`+${format(e2Earned(v))}`, v.renderer.cellX(5), v.renderer.cellY(r.clearedRows[0] ?? 30), { color: PIECE_COLORS[r.piece], size: 14, dur: 700 });
          // Technique bots announce their technique, as the manual board does.
          const tech = buildingById(world.autoBoards[autoViews.indexOf(v)]?.buildingId ?? '')?.tech;
          const label = tech ? techLabel(r, tech) : null;
          if (label) {
            // A bot's technique bursts too, at about half the hand's strength,
            // its name stamped across its well.
            v.fx.shatter(v.renderer, r.clearedRows, PIECE_COLORS[r.piece], Math.ceil(hitStrength(r) / 2));
            v.fx.hit(Math.min(3, Math.ceil(hitStrength(r) / 2)));
            v.fx.popup(label, v.renderer.cellX(5), v.renderer.cellY((r.clearedRows[0] ?? 30) - 2), { color: '#ffffff', size: Math.max(9, Math.round(v.renderer.layout.cell * 0.95)), dur: 1000,
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

// Life time (ms) of the manual board's recent locks, for the PPS readout.
const PPS_WINDOW_S = 10;
let lockTimes: number[] = [];

let missionStack = 0;
let missionStackAt = 0;

// A balance past a new thousands-step (1K, 1M, 1B, …) for the first time: a banner.
function checkMilestone(): void {
  const step = unitStep(toNumber(world.economy.balance));
  if (settings.milestone < 0) { settings.milestone = step; return; }
  if (step <= settings.milestone) return;
  settings.milestone = step;
  milestoneEl.textContent = `${format(1000 ** step).replace(/\.0+(?=\D|$)/, '')} LINES`;
  milestoneEl.hidden = false;
  milestoneEl.style.animation = 'none';
  void milestoneEl.offsetWidth;
  milestoneEl.style.animation = '';
  window.setTimeout(() => { milestoneEl.hidden = true; }, 2400);
  sound.play('achievement');
  saveNow();
}

const vaultRoll = new Roller();
function render(): void {
  const g = world.manual;
  const view: BoardView = {
    grid: g.grid, active: g.active, ghostY: g.active ? g.ghostY() : null,
    // A mystery hides what is coming.
    holds: g.holds, holdUsed: g.holdUsed, next: world.lifeEvent?.kind === 'mystery' ? [] : g.next(),
    golden: { active: g.golden.active, holds: g.golden.holds, next: g.golden.queue, wrath: !!g.golden.wrath },
  };
  const buffs = world.buffs.active.map((b) => ({ label: BUFFS[b.id]?.label ?? b.id, msLeft: b.msLeft }));
  // The well's colour follows the level band, white at 20G.
  const level = world.round.active ? world.round.level : world.nextStartLevel();
  const theme = levelTheme(level, world.round.active && !Number.isFinite(world.round.gravity(world.gravityPace())));
  manual.accent = theme.frame;
  manual.wellBackground = theme.background;
  manual.wellGrid = settings.highContrast ? undefined : theme.grid;
  manual.render(view, manualFx, (ctx) => {
    const hudBottom = drawRoundHud(ctx, manual, world.round, world.wrath(), buffs, world.nextStartLevel(), world.economy.meta.hardcore, world.economy.boardGarbage * GARBAGE.penaltyPctPerRow, world.economy.stackBonus,
      vaultRoll.value(Number(world.round.vault), performance.now()));
    drawEventHud(ctx, manual, world.lifeEvent, view.next.length);
    // Rows waiting for the board: the rival's and what purchases sent.
    drawDuelGauge(ctx, manual, (world.duel?.toMe ?? 0) + world.garbageQueue);
    drawHint(ctx);
    if (world.round.active) {
      const seconds = world.round.elapsedMs / 1000;
      const window = Math.min(PPS_WINDOW_S, seconds);
      const recent = lockTimes.filter((at) => at > world.round.elapsedMs - PPS_WINDOW_S * 1000).length;
      drawLifePanel(ctx, manual, {
        missions: world.missions.map((m) => {
          const def = missionById(m.id)!;
          return { label: def.label, progress: world.missionProgress(m), goal: def.goal, done: m.done };
        }),
        pps: window > 0.5 ? recent / window : 0, seconds,
        combo: Math.max(0, g.combo), b2b: Math.max(0, g.b2b),
      }, hudBottom);
    }
  });
  manualPane.classList.toggle('hardcore', world.economy.meta.hardcore);
  ensureAutoViews();
  world.autoBoards.forEach((board, i) => {
    const v = autoViews[i]!;
    const def = buildingById(board.buildingId);
    // Starred buildings frame their boards in their own colour.
    const tier = buildingTier(world.economy.owned(board.buildingId));
    v.renderer.accent = tier > 0 ? buildingColor(BUILDINGS.findIndex((b) => b.id === board.buildingId)) : undefined;
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
  const tier = buildingTier(world.economy.owned(id));
  const link = world.links.multiplier([tag.board('auto'), tag.building(id)], world.economy);
  const mul = buff * link;
  return `${name ?? id}${tier > 0 ? ` ${'★'.repeat(tier)}` : ''}${syn}${duel}${mul > 1 ? ` ×${+mul.toFixed(2)}` : ''}`;
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
  // What this building earns now, at the foot of the hold column.
  const perSecond = `${format(world.boardIncome(id))}/s`;
  ctx.fillStyle = THEME.dim;
  let small = Math.max(8, Math.round(c * 0.55));
  ctx.font = font(700, small);
  const colW = r.layout.leftCells * c - 6;
  while (small > 7 && ctx.measureText(perSecond).width > colW) ctx.font = font(700, --small);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(perSecond, r.cellX(0) - 4, r.height - 4);
  // Its level and the way to the next, a bar over the per-second figure.
  const level = world.botLevel(id);
  const bx = 3;
  const bw = colW - 3;
  const bh = Math.max(4, Math.round(c * 0.35));
  const by = r.height - 6 - small - bh - 2;
  ctx.fillStyle = THEME.boxHead;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = buildingColor(BUILDINGS.findIndex((b) => b.id === id));
  ctx.fillRect(bx + 1, by + 1, Math.round((bw - 2) * world.botLevelProgress(id)), bh - 2);
  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'left';
  ctx.font = font(800, Math.max(8, small));
  ctx.fillText(level >= world.botLevelCap() ? `LV${level} MAX` : `LV${level}`, bx, by - 2);
  // A link running: the well's rim lights in the bot's colour and burns down.
  const left = world.links.active.find((b) => b.id === linkBuffId(id))?.msLeft ?? 0;
  if (left > 0) drawLinkRim(ctx, r, left / world.linkCapMs(id), buildingColor(BUILDINGS.findIndex((b) => b.id === id)));
  ctx.restore();
}

// The rim around a bot's well, as much of it as `k` (0..1) of its link is
// left, running clockwise from the top-left corner.
function drawLinkRim(ctx: CanvasRenderingContext2D, r: BoardRenderer, k: number, color: string): void {
  const c = r.layout.cell;
  const x0 = r.cellX(0);
  const y0 = r.cellY(TOP_VISIBLE_ROW);
  const w = WIDTH * c;
  const h = r.height - y0;
  const t = 3;
  let rest = Math.max(0, Math.min(1, k)) * 2 * (w + h);
  ctx.save();
  ctx.fillStyle = color;
  const run = (len: number, draw: (n: number) => void): void => { const n = Math.min(len, rest); if (n > 0) draw(n); rest -= n; };
  run(w, (n) => ctx.fillRect(x0, y0, n, t));
  run(h, (n) => ctx.fillRect(x0 + w - t, y0, t, n));
  run(w, (n) => ctx.fillRect(x0 + w - n, y0 + h - t, n, t));
  run(h, (n) => ctx.fillRect(x0, y0 + h - n, t, n));
  ctx.restore();
}

function frame(): void {
  tick();
  if (botZoom.open) botZoom.refresh();
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

// Everything is up: the title asks for a key (or steps aside at once when
// turned off). Its key is the gesture that lets audio start.
title.ready({ prompt: window.matchMedia('(pointer: coarse)').matches ? t('TAP TO START') : t('PRESS ANY KEY'), subtitle: t('TETRIS × IDLE CLICKER') }, {
  auto: !settings.titleScreen,
  reduceMotion: settings.reduceMotion,
  onGo: () => { sound.unlock(); sound.play('start'); },
});
