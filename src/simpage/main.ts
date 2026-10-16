import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET, DEFAULT_HORIZON_SECONDS, type SimParams, type PlayerParams, type TargetParams } from '../sim/simulate';
import { LADDER, type LadderEntry } from '../data/ladder';
import { IncomeChart } from './chart';
import { formatDuration, formatLines } from './format';

const STORE_KEY = 'tetra-clicker/sim';

interface PageState {
  ladder: LadderEntry[];
  player: PlayerParams;
  target: TargetParams;
  horizonDays: number;
  upgrades: boolean;
}

function defaults(): PageState {
  return { ladder: structuredClone(LADDER), player: { ...DEFAULT_PLAYER }, target: { ...DEFAULT_TARGET }, horizonDays: DEFAULT_HORIZON_SECONDS / 86_400, upgrades: true };
}

function load(): PageState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw) as Partial<PageState>;
    const d = defaults();
    // Rows are matched by id so a ladder change in code survives an old save.
    const ladder = d.ladder.map((b) => ({ ...b, ...(s.ladder?.find((x) => x.id === b.id) ?? {}) }));
    return { ladder, player: { ...d.player, ...s.player }, target: { ...d.target, ...s.target }, horizonDays: s.horizonDays ?? d.horizonDays, upgrades: s.upgrades ?? true };
  } catch {
    return defaults();
  }
}

const state = load();
const controls = document.getElementById('controls')!;
const chart = new IncomeChart(document.getElementById('chart') as HTMLCanvasElement, document.getElementById('tooltip')!);
const unlocks = document.getElementById('unlocks') as HTMLTableElement;
const summary = document.createElement('div');
summary.className = 'summary';
unlocks.before(summary);

function save(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage may be blocked */ }
}

function run(): void {
  const params: SimParams = { buildings: state.ladder, player: state.player, target: state.target, horizonSeconds: state.horizonDays * 86_400, upgrades: state.upgrades };
  const result = simulate(params);
  chart.setState({ result, ladder: state.ladder, horizonSeconds: params.horizonSeconds });
  renderUnlocks(result.firstUnlock, result.target);
  const upgradesBought = result.purchases.filter((p) => p.kind === 'upgrade').length;
  summary.innerHTML =
    `<span>FINAL INCOME <b>${formatLines(result.finalIncome)}/s</b></span>` +
    `<span>FINAL BALANCE <b>${formatLines(result.finalBalance)}</b></span>` +
    `<span>BUILDINGS <b>${result.purchases.length - upgradesBought}</b></span>` +
    `<span>UPGRADES <b>${upgradesBought}</b></span>`;
  save();
}

function renderUnlocks(actual: Record<string, number>, target: Record<string, number>): void {
  const rows = state.ladder.map((b) => {
    const a = actual[b.id];
    const t = target[b.id]!;
    const ratio = a === undefined ? null : a / t;
    const cls = ratio === null ? 'none' : ratio > 0.6 && ratio < 1.6 ? 'good' : 'off';
    return `<tr><td>${b.name}</td><td>${a === undefined ? '—' : formatDuration(a)}</td><td>${formatDuration(t)}</td><td class="ratio ${cls}">${ratio === null ? '—' : `×${ratio.toFixed(2)}`}</td></tr>`;
  });
  unlocks.innerHTML = `<tr><th>BUILDING</th><th>UNLOCK</th><th>TARGET</th><th>ACTUAL / TARGET</th></tr>${rows.join('')}`;
}

// --- controls ---------------------------------------------------------------

function slider(label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'slider';
  const l = document.createElement('label');
  l.textContent = label;
  const range = document.createElement('input');
  range.type = 'range'; range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(get());
  const num = document.createElement('input');
  num.type = 'number'; num.min = String(min); num.max = String(max); num.step = String(step); num.value = String(get());
  const apply = (v: number): void => {
    if (!Number.isFinite(v)) return;
    set(v); range.value = String(v); num.value = String(v); run();
  };
  range.addEventListener('input', () => apply(Number(range.value)));
  num.addEventListener('change', () => apply(Number(num.value)));
  row.append(l, range, num);
  return row;
}

function h2(text: string): HTMLElement {
  const e = document.createElement('h2');
  e.textContent = text;
  return e;
}

function ladderTable(): HTMLElement {
  const table = document.createElement('table');
  const cols: { key: keyof LadderEntry; label: string; step: number }[] = [
    { key: 'basePrice', label: 'PRICE', step: 1 },
    { key: 'growth', label: 'GROWTH', step: 0.01 },
    { key: 'pps', label: 'PPS', step: 0.1 },
    { key: 'linesPerPiece', label: 'L/PIECE', step: 0.05 },
    { key: 'bonusPct', label: '+%', step: 1 },
  ];
  table.innerHTML = `<tr><th>ID</th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
  for (const b of state.ladder) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.name}</td>`;
    for (const c of cols) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(c.step);
      input.value = String(b[c.key]);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        (b as unknown as Record<string, number>)[c.key] = v;
        run();
      });
      td.append(input);
      tr.append(td);
    }
    table.append(tr);
  }
  return table;
}

function buildControls(): void {
  controls.innerHTML = '';
  controls.append(h2('PLAYER'));
  controls.append(slider('PPS', () => state.player.pps, (v) => { state.player.pps = v; }, 0.1, 3, 0.05));
  controls.append(slider('LINES / PIECE', () => state.player.linesPerPiece, (v) => { state.player.linesPerPiece = v; }, 0.2, 3, 0.05));
  controls.append(slider('AVG LEVEL', () => state.player.avgLevel ?? 1, (v) => { state.player.avgLevel = v; }, 1, 15, 0.5));
  controls.append(slider('FOCUS MIN', () => state.player.focusMinutes, (v) => { state.player.focusMinutes = v; }, 0, 180, 1));
  controls.append(slider('DAILY MIN', () => state.player.dailyMinutes, (v) => { state.player.dailyMinutes = v; }, 0, 480, 5));
  controls.append(h2('TARGET'));
  controls.append(slider('FIRST (S)', () => state.target.firstSeconds, (v) => { state.target.firstSeconds = v; }, 10, 600, 5));
  controls.append(slider('RATIO', () => state.target.ratio, (v) => { state.target.ratio = v; }, 1.2, 5, 0.1));
  controls.append(slider('HORIZON (D)', () => state.horizonDays, (v) => { state.horizonDays = v; }, 1, 90, 1));
  // Milestone and manual ×2 upgrades bought by the same payback rule.
  const up = document.createElement('label');
  up.className = 'toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.upgrades;
  box.addEventListener('change', () => { state.upgrades = box.checked; run(); });
  up.append(box, document.createTextNode(' UPGRADES'));
  controls.append(up);
  controls.append(h2('LADDER'));
  controls.append(ladderTable());
  const row = document.createElement('div');
  row.className = 'row';
  const reset = document.createElement('button');
  reset.className = 'btn';
  reset.textContent = 'RESET';
  reset.addEventListener('click', () => { Object.assign(state, defaults()); buildControls(); run(); });
  const copy = document.createElement('button');
  copy.className = 'btn';
  copy.textContent = 'COPY JSON';
  copy.addEventListener('click', async () => {
    const text = exportJson();
    try { await navigator.clipboard.writeText(text); } catch { /* fall through to the textarea */ }
    copy.classList.add('flash');
    setTimeout(() => copy.classList.remove('flash'), 800);
    out.value = text;
    out.hidden = false;
  });
  const out = document.createElement('textarea');
  out.hidden = true;
  out.rows = 12;
  out.style.cssText = 'width:100%;margin-top:8px;background:#11112a;color:#e8e8ff;border:1px solid #1a1a30;border-radius:8px;font:11px monospace;';
  row.append(reset, copy);
  controls.append(row, out);
}

// The exact shape of src/data/ladder.ts entries, plus the player model, so
// the chosen numbers can be pasted back without translation.
function exportJson(): string {
  return JSON.stringify({ ladder: state.ladder, player: state.player, target: state.target, upgrades: state.upgrades }, null, 2);
}

buildControls();
run();
