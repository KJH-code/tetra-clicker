import type { BoardRenderer } from './boardRenderer';
import type { LifeEvent } from '../sim/events';
import { HEIGHT, WIDTH, TOP_VISIBLE_ROW, occupiedCells } from '../sim/board';
import { pieceFromId } from '../sim/pieces';
import { PIECE_COLORS, THEME, VIEW, font } from './theme';
import { t } from '../ui/i18n';
import { EVENTS } from '../data/events';

export const EVENT_NAMES = { rival: 'RIVAL', invader: 'INVADER', helper: 'HELPER', bonus: 'BONUS ROUND', boss: 'BOSS', tech: 'TECH CHALLENGE', mystery: 'MYSTERY' } as const;
export const EVENT_COLORS = { rival: '#ff5050', invader: '#ff8c1a', helper: '#39ff14', bonus: '#ffc233', boss: '#c03bff', tech: '#00f0ff', mystery: '#a77bff' } as const;
const COLORS = EVENT_COLORS;

// The event's name in the player's language (RIVAL, INVADER and HELPER stay as they are).
export function eventName(kind: keyof typeof EVENT_NAMES): string {
  switch (kind) {
    case 'bonus': return t('BONUS ROUND');
    case 'boss': return t('BOSS');
    case 'tech': return t('TECH CHALLENGE');
    case 'mystery': return t('MYSTERY');
    default: return EVENT_NAMES[kind];
  }
}

// A life event on the manual board: a banner over the well with the time
// left, garbage gauges (rows waiting for each side), and in a rival fight
// the rival's board, small, under the NEXT column.
export function drawEventHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, ev: LifeEvent | null, nextShown = 5): void {
  if (!ev) return;
  const c = r.layout.cell;
  const left = r.cellX(0);
  const top = r.cellY(TOP_VISIBLE_ROW);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS[ev.kind];
  ctx.font = font(800, c * 0.5 * VIEW.textScale);
  const time = `${Math.ceil(ev.msLeft / 1000)}s`;
  const extra = ev.kind === 'bonus' ? ` · ×${EVENTS.bonus.incomeMul}` : ev.kind === 'mystery' ? ` · ×${EVENTS.mystery.incomeMul}`
    : ev.kind === 'tech' ? ` · ${ev.label} ${ev.done}/${ev.need}` : '';
  const title = `${eventName(ev.kind)} · ${time}${extra}`;
  const size = c * 0.5 * VIEW.textScale;
  ctx.font = font(800, size);
  const tw = ctx.measureText(title).width;
  if (tw > WIDTH * c - 8) ctx.font = font(800, (size * (WIDTH * c - 8)) / tw);
  ctx.fillText(title, left + (WIDTH * c) / 2, top + c * 0.2);
  // The boss's health, a bar under the banner.
  if (ev.kind === 'boss') {
    const w = WIDTH * c - 16;
    const y = top + c * 0.95;
    ctx.fillStyle = THEME.boxHead;
    ctx.fillRect(left + 8, y, w, c * 0.28);
    ctx.fillStyle = COLORS.boss;
    ctx.shadowColor = COLORS.boss;
    ctx.shadowBlur = 10;
    ctx.fillRect(left + 8, y, w * Math.max(0, ev.hp / ev.maxHp), c * 0.28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = THEME.text;
    ctx.font = font(700, c * 0.3 * VIEW.textScale);
    ctx.fillText(`${Math.max(0, ev.hp)} / ${ev.maxHp}`, left + (WIDTH * c) / 2, y + c * 0.35);
  }
  ctx.restore();

  // Rows waiting for me: a red bar up the well's left edge.
  const mine = ev.kind === 'rival' || ev.kind === 'boss' ? ev.toMe : 0;
  if (mine > 0) gauge(ctx, left - 5, r.cellY(HEIGHT), Math.min(20, mine) * c, '#ff3b3b');
  if (ev.kind === 'invader' && ev.shield > 0) gauge(ctx, left - 5, r.cellY(HEIGHT), Math.min(20, ev.shield) * c, '#00f0ff');

  if (ev.kind !== 'rival') return;
  // The rival's board, scaled into the NEXT column below the previews.
  const colX = r.cellX(WIDTH) + 4;
  const colW = r.layout.rightCells * c - 8;
  const rows = HEIGHT - TOP_VISIBLE_ROW;
  // Below the last preview (each takes three rows from row one), with room for its label.
  const room = r.cellY(HEIGHT) - (1 + nextShown * 3) * c - c;
  const mini = Math.max(3, Math.floor(Math.min(colW / WIDTH, room / rows)));
  const ox = colX + (colW - mini * WIDTH) / 2;
  const oy = r.cellY(HEIGHT) - rows * mini - 4;
  ctx.save();
  ctx.fillStyle = THEME.background;
  ctx.fillRect(ox, oy, mini * WIDTH, mini * rows);
  ctx.strokeStyle = COLORS.rival;
  ctx.strokeRect(ox - 0.5, oy - 0.5, mini * WIDTH + 1, mini * rows + 1);
  const g = ev.game;
  for (let y = TOP_VISIBLE_ROW; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const id = g.grid[y * WIDTH + x]!;
      if (!id) continue;
      const p = pieceFromId(id);
      ctx.fillStyle = p ? PIECE_COLORS[p] : THEME.dim;
      ctx.fillRect(ox + x * mini, oy + (y - TOP_VISIBLE_ROW) * mini, mini - 1, mini - 1);
    }
  }
  if (g.active) {
    ctx.fillStyle = PIECE_COLORS[g.active.piece];
    for (const [x, y] of occupiedCells(g.active)) if (y >= TOP_VISIBLE_ROW) ctx.fillRect(ox + x * mini, oy + (y - TOP_VISIBLE_ROW) * mini, mini - 1, mini - 1);
  }
  ctx.fillStyle = COLORS.rival;
  ctx.font = font(700, c * 0.36 * VIEW.textScale);
  ctx.textAlign = 'center';
  ctx.fillText(`RIVAL L${ev.level}`, ox + (mini * WIDTH) / 2, oy - c * 0.5);
  if (ev.toRival > 0) gauge(ctx, ox - 4, oy + mini * rows, Math.min(rows, ev.toRival) * mini, '#ff3b3b');
  ctx.restore();
}

function gauge(ctx: CanvasRenderingContext2D, x: number, bottom: number, h: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillRect(x, bottom - h, 3, h);
  ctx.restore();
}

// The RIVAL building's rows waiting for the manual board, up its left edge.
export function drawDuelGauge(ctx: CanvasRenderingContext2D, r: BoardRenderer, rows: number): void {
  if (rows <= 0) return;
  gauge(ctx, r.cellX(0) - 5, r.cellY(HEIGHT), Math.min(20, rows) * r.layout.cell, '#ff3b3b');
}
