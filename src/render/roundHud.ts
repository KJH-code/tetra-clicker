import type { Round } from '../sim/round';
import type { BoardRenderer } from './boardRenderer';
import { format } from '../sim/num';
import { HEIGHT, TOP_VISIBLE_ROW, WIDTH } from '../sim/board';
import { fontFamily, GOLD, THEME, VIEW, font as fontOf } from './theme';
import { LEVELS, levelPay } from '../data/levels';
import { t } from '../ui/i18n';

// Life readout drawn on the manual board, in the hold column under the hold
// slots: vault, level with a bar to the next one, rows to the next
// checkpoint. A centred banner covers the states where the board is not
// live (waiting, paused).
export function drawRoundHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, round: Round, wrath: number,
  buffs: { label: string; msLeft: number }[] = [], nextStartLevel = 1, hardcore = false, botPenaltyPct = 0, stackBonusPct = 0,
  vaultShown = Number(round.vault)): number {
  const c = r.layout.cell;
  const colW = r.layout.leftCells * c;
  const x0 = 6;
  // Larger text takes more room down the column, and shrinks back to fit
  // across it: the column is only five cells wide.
  const s = VIEW.textScale;
  const font = (px: number, text: string, weight = ''): void => {
    let size = Math.round(px * s);
    ctx.font = `${weight} ${size}px ${fontFamily()}`;
    const w = ctx.measureText(text).width;
    if (w > colW - x0 * 2) {
      size = Math.floor((size * (colW - x0 * 2)) / w);
      ctx.font = `${weight} ${size}px ${fontFamily()}`;
    }
  };
  let y = r.cellY(TOP_VISIBLE_ROW + 8);
  const top = y - (hardcore ? c * 0.9 * s : 0);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const label = (text: string): void => {
    ctx.fillStyle = THEME.dim;
    font(c * 0.38, text);
    ctx.fillText(text, x0, y);
    y += c * 0.55 * s;
  };
  if (hardcore) {
    ctx.fillStyle = '#ff3b3b';
    font(c * 0.42, t('HARDCORE'), '800');
    ctx.fillText(t('HARDCORE'), x0, y - c * 0.8 * s);
  }
  label(t('VAULT'));
  ctx.fillStyle = THEME.text;
  font(c * 0.7, format(vaultShown), '700');
  ctx.fillText(format(vaultShown), x0, y);
  y += c * 1.0 * s;
  label(round.active ? t('CHECKPOINT IN {n}', { n: round.rowsToCheckpoint }) : t('CHECKPOINT EVERY {n}', { n: LEVELS.checkpointRows }));
  y += c * 0.15 * s;
  label(wrath > 0 ? t('LEVEL · WRATH {w}', { w: 'I'.repeat(wrath) }) : t('LEVEL'));
  // Level and the bar to the next one; the colour warms as levels climb.
  const level = round.active ? round.level : nextStartLevel;
  const color = level < 5 ? '#00f0ff' : level < 10 ? '#ff2ed2' : '#ff3b3b';
  ctx.fillStyle = color;
  ctx.shadowColor = VIEW.pixel ? '#000000' : color;
  if (VIEW.pixel) ctx.shadowOffsetX = ctx.shadowOffsetY = 2;
  else ctx.shadowBlur = 10;
  const pay = `${level}  ×${+levelPay(level).toFixed(2)}`;
  font(c * 0.7, pay, '700');
  ctx.fillText(pay, x0, y);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  y += c * 0.85 * s;
  // The bar to the next level, big enough to read from the corner of an eye;
  // in the pixel style it fills a block per row cleared.
  const w = colW - x0 * 2;
  const h = Math.round(c * 0.55);
  const k = round.active ? (round.rows % round.rowsPerLevel) / round.rowsPerLevel : 0;
  ctx.fillStyle = THEME.boxHead;
  ctx.fillRect(x0, y, w, h);
  if (VIEW.pixel) {
    const n = round.rowsPerLevel;
    const gap = 2;
    const bw = (w - 4 - gap * (n - 1)) / n;
    const lit = round.active ? round.rows % n : 0;
    for (let i = 0; i < lit; i++) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x0 + 2 + i * (bw + gap)), y + 2, Math.max(1, Math.round(bw)), h - 4);
    }
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x0, y, w * k, h);
  }
  y += h + c * 0.4;
  // Garbage left on the board slows the bots.
  if (botPenaltyPct > 0) {
    ctx.fillStyle = '#ff4d5e';
    const text = t('BOTS −{n}%', { n: botPenaltyPct });
    font(c * 0.42, text, '800');
    ctx.fillText(text, x0, y);
    y += c * 0.55 * s;
  }
  // A low stack speeds them up.
  if (stackBonusPct > 0) {
    ctx.fillStyle = '#39ff14';
    const text = t('BOTS +{n}%', { n: Math.round(stackBonusPct) });
    font(c * 0.42, text, '800');
    ctx.fillText(text, x0, y);
  }
  y += c * 0.55 * s;
  hudPanel(ctx, 2, top - 6, colW - 4, y - top + 6);
  // Running buffs, under the multiplier they stack with.
  y += c * 0.45;
  for (const b of buffs) {
    ctx.fillStyle = GOLD;
    ctx.shadowColor = VIEW.pixel ? '#000000' : GOLD;
    if (VIEW.pixel) ctx.shadowOffsetX = ctx.shadowOffsetY = 2;
    else ctx.shadowBlur = 8;
    font(c * 0.36, t(b.label), '700');
    ctx.fillText(t(b.label), x0, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    y += c * 0.5 * s;
    ctx.fillStyle = THEME.text;
    font(c * 0.36, `${Math.ceil(b.msLeft / 1000)}s`);
    ctx.fillText(`${Math.ceil(b.msLeft / 1000)}s`, x0, y);
    y += c * 0.65 * s;
  }
  const bottom = y;

  const banner = bannerText(round);
  if (banner) {
    const cx = r.cellX(0) + (WIDTH * c) / 2;
    const cy = r.cellY(TOP_VISIBLE_ROW + 9);
    ctx.fillStyle = '#090b10e0';
    ctx.fillRect(r.cellX(0), cy - c * 1.4, WIDTH * c, c * 2.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = banner.color;
    ctx.shadowColor = VIEW.pixel ? '#000000' : banner.color;
    if (VIEW.pixel) ctx.shadowOffsetX = ctx.shadowOffsetY = 3;
    else ctx.shadowBlur = 14;
    ctx.font = fontOf(800, c * 0.9 * VIEW.textScale);
    ctx.fillText(banner.big, cx, cy - c * 0.25);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    if (banner.small) {
      ctx.fillStyle = THEME.dim;
      ctx.font = fontOf(700, c * 0.4 * VIEW.textScale);
      ctx.fillText(banner.small, cx, cy + c * 0.7);
    }
  }
  ctx.restore();
  // Where its text ends, so the life panel below keeps clear of it.
  return bottom;
}

function bannerText(round: Round): { big: string; small?: string; color: string } | null {
  if (!round.active) return { big: t('READY'), small: t('ANY KEY'), color: '#00f0ff' };
  if (round.paused) return { big: t('PAUSED'), small: t('ANY KEY'), color: '#ffe600' };
  return null;
}

export interface LifeInfo {
  missions: { label: string; progress: number; goal: number; done: boolean }[];
  pps: number;
  seconds: number;
  combo: number;
  b2b: number;
}

// The bottom of the hold column while a life runs: pace and chains, then the
// life's three missions with a bar each, a done one ticked green. It stays
// below `minTop` (where the HUD above it ends), shrinking its text when
// large text or a short board would have the two run into each other.
export function drawLifePanel(ctx: CanvasRenderingContext2D, r: BoardRenderer, info: LifeInfo, minTop = 0): void {
  const c = r.layout.cell;
  const lines = 1 + (info.combo > 0 || info.b2b > 0 ? 1 : 0);
  const height = (k: number): number => 8 + c * 1.05 * k * info.missions.length + c * 0.55 * k + c * 0.6 * k * lines + 8;
  const room = r.cellY(HEIGHT) - minTop - 6;
  const s = VIEW.textScale * Math.min(1, room / height(VIEW.textScale));
  const x0 = 6;
  const w = r.layout.leftCells * c - x0 * 2;
  const fit = (px: number, text: string, weight: number): void => {
    let size = px * s;
    ctx.font = fontOf(weight, size);
    const tw = ctx.measureText(text).width;
    if (tw > w) size = (size * w) / tw;
    ctx.font = fontOf(weight, size);
  };
  const rowH = c * 1.05 * s;
  let y = r.cellY(HEIGHT) - 8 - rowH * info.missions.length;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const m of info.missions) {
    const text = m.done ? `✓ ${t(m.label)}` : t(m.label);
    ctx.fillStyle = m.done ? '#39ff14' : THEME.text;
    // The label stops short of its count on the right.
    const count = `${m.progress}/${m.goal}`;
    ctx.font = fontOf(700, c * 0.3 * s);
    const room = m.done ? w : w - ctx.measureText(count).width - 6;
    let size = c * 0.36 * s;
    ctx.font = fontOf(700, size);
    const tw = ctx.measureText(text).width;
    if (tw > room) size = Math.max(6, (size * room) / tw);
    ctx.font = fontOf(700, size);
    ctx.fillText(text, x0, y);
    const by = y + c * 0.5 * s;
    const bh = c * 0.18;
    ctx.fillStyle = THEME.boxHead;
    ctx.fillRect(x0, by, w, bh);
    ctx.fillStyle = m.done ? '#39ff14' : '#00f0ff';
    ctx.fillRect(x0, by, w * Math.min(1, m.progress / m.goal), bh);
    if (!m.done) {
      ctx.fillStyle = THEME.dim;
      ctx.textAlign = 'right';
      ctx.font = fontOf(700, c * 0.3 * s);
      ctx.fillText(count, x0 + w, y + c * 0.05);
      ctx.textAlign = 'left';
    }
    y += rowH;
  }
  // Above the missions: a heading, and pace, time and chains.
  y = r.cellY(HEIGHT) - 8 - rowH * info.missions.length - c * 0.55 * s;
  ctx.fillStyle = THEME.dim;
  fit(c * 0.34, t('MISSIONS'), 700);
  ctx.fillText(t('MISSIONS'), x0, y);
  const mm = Math.floor(info.seconds / 60);
  const ss = String(Math.floor(info.seconds % 60)).padStart(2, '0');
  const pace = [`${info.pps.toFixed(2)} PPS · ${mm}:${ss}`];
  if (lines > 1) pace.push([info.combo > 0 ? `${info.combo} COMBO` : '', info.b2b > 0 ? `B2B ×${info.b2b}` : ''].filter(Boolean).join(' · '));
  for (let i = pace.length - 1; i >= 0; i--) {
    y -= c * 0.6 * s;
    ctx.fillStyle = i === 0 ? THEME.text : '#ffe600';
    fit(c * 0.36, pace[i]!, 700);
    ctx.fillText(pace[i]!, x0, y);
  }
  hudPanel(ctx, 2, y - 6, w + x0 * 2 - 4, r.cellY(HEIGHT) - y + 2);
  ctx.restore();
}

// The box behind a block of HUD text, drawn after the text and slid under
// it (destination-over), so it can fit whatever the text came to. Pixel
// style: a bevelled slab; classic: a faint plate.
function hudPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (VIEW.pixel) {
    ctx.fillStyle = THEME.box;
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(x, y, w - 3, 3);
    ctx.fillRect(x, y, 3, h - 3);
    ctx.fillStyle = '#00000080';
    ctx.fillRect(x + 3, y + h - 3, w - 3, 3);
    ctx.fillRect(x + w - 3, y + 3, 3, h - 3);
    ctx.fillStyle = THEME.boxHead;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillStyle = '#ffffff08';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
