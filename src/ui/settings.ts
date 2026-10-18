import { ACTION_LABELS, DEFAULT_HANDLING, HANDLING_LIMITS, SDF_INSTANT, type HandlingSettings, type KeyBindings } from '../data/handling';
import { t } from './i18n';

// Moving a save between browsers: the page supplies the text and takes it back.
export interface SaveTransfer {
  exportText(): string;
  // False when the text is not a save; the game is left as it was.
  importText(text: string): boolean;
}

// Handling (DAS / ARR / SDF), keys, sound, moving the save, and the
// language and accessibility options. Handling stays first: it is what a
// player opens settings for most.
export class SettingsPanel {
  private listening: keyof KeyBindings | null = null;
  private importOpen = false;
  private note = '';

  constructor(
    private overlay: HTMLElement,
    private settings: HandlingSettings,
    private onChange: (s: HandlingSettings) => void,
    private onOpenChange: (open: boolean) => void,
    private transfer?: SaveTransfer,
  ) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    window.addEventListener('keydown', this.capture, true);
  }

  open(): void {
    // A fresh look each time: no import box or note left from last time.
    this.importOpen = false;
    this.note = '';
    this.render();
    this.overlay.hidden = false;
    this.onOpenChange(true);
  }

  close(): void {
    this.overlay.hidden = true;
    this.listening = null;
    this.onOpenChange(false);
  }

  private capture = (e: KeyboardEvent): void => {
    if (this.overlay.hidden) return;
    if (e.code === 'Escape') { e.preventDefault(); this.listening ? this.cancelListen() : this.close(); return; }
    if (!this.listening) return;
    e.preventDefault();
    e.stopPropagation();
    const action = this.listening;
    // A key can serve one action only; take it away from any other.
    for (const a of Object.keys(this.settings.keys) as (keyof KeyBindings)[]) {
      this.settings.keys[a] = this.settings.keys[a].filter((k) => k !== e.code);
    }
    this.settings.keys[action] = [e.code];
    this.listening = null;
    this.onChange(this.settings);
    this.render();
  };

  private cancelListen(): void {
    this.listening = null;
    this.render();
  }

  private render(): void {
    const box = document.createElement('div');
    box.className = 'settings';
    box.append(h2(t('HANDLING')));
    box.append(this.slider('DAS', 'das', 'ms'));
    box.append(this.slider('ARR', 'arr', 'ms'));
    box.append(this.slider('SDF', 'sdf', '×'));
    box.append(h2(t('SOUND')));
    const sound = this.slider(t('VOL'), 'volume', '');
    const mute = document.createElement('button');
    mute.className = 'btn mute' + (this.settings.muted ? ' on' : '');
    mute.textContent = t(this.settings.muted ? 'MUTED' : 'MUTE');
    mute.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this.onChange(this.settings);
      this.render();
    });
    sound.append(mute);
    sound.classList.add('with-btn');
    box.append(sound);
    if (this.transfer) box.append(...this.saveSection(this.transfer));
    box.append(...this.languageSection(), ...this.accessSection());
    box.append(h2(t('KEYS')));
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (const action of Object.keys(ACTION_LABELS) as (keyof KeyBindings)[]) {
      const row = document.createElement('div');
      row.className = 'keyrow';
      const label = document.createElement('span');
      label.textContent = t(ACTION_LABELS[action]);
      const btn = document.createElement('button');
      btn.className = 'btn' + (this.listening === action ? ' listening' : '');
      btn.textContent = this.listening === action ? t('PRESS…') : this.settings.keys[action].map(keyName).join(' / ') || '—';
      btn.addEventListener('click', () => { this.listening = action; this.render(); });
      row.append(label, btn);
      keys.append(row);
    }
    box.append(keys);
    const actions = document.createElement('div');
    actions.className = 'row';
    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.textContent = t('DEFAULTS');
    reset.addEventListener('click', () => {
      // Defaults for handling and sound; the tutorial stays where it got to,
      // and the language stays one the player can read.
      const { tutorial, language } = this.settings;
      Object.assign(this.settings, structuredClone(DEFAULT_HANDLING), { tutorial, language });
      this.onChange(this.settings);
      this.render();
    });
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = t('CLOSE');
    close.addEventListener('click', () => this.close());
    actions.append(reset, close);
    box.append(actions);
    this.overlay.replaceChildren(box);
  }

  // Each language in its own name; a change reloads the page (main.ts),
  // since the shop and the tabs are built once.
  private languageSection(): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'row a11y-row';
    for (const [value, name] of [['auto', t('AUTO')], ['en', 'English'], ['ko', '한국어']] as const) {
      const b = button(name, () => { this.settings.language = value; this.onChange(this.settings); this.render(); });
      b.classList.toggle('on', this.settings.language === value);
      b.dataset['lang'] = value;
      row.append(b);
    }
    return [h2(t('LANGUAGE')), row];
  }

  private accessSection(): HTMLElement[] {
    const s = this.settings;
    const toggle = (label: string, key: 'patterns' | 'reduceMotion' | 'highContrast'): HTMLElement => {
      const b = button(`${t(label)}: ${t(s[key] ? 'ON' : 'OFF')}`, () => { s[key] = !s[key]; this.onChange(s); this.render(); });
      b.classList.toggle('on', s[key]);
      b.dataset['a11y'] = key;
      return b;
    };
    const palette = button(`${t('PIECE COLOURS')}: ${t(s.palette === 'cvd' ? 'COLOUR-BLIND SAFE' : 'STANDARD')}`, () => {
      s.palette = s.palette === 'cvd' ? 'standard' : 'cvd';
      this.onChange(s);
      this.render();
    });
    palette.dataset['a11y'] = 'palette';
    palette.classList.toggle('on', s.palette === 'cvd');
    const row = document.createElement('div');
    row.className = 'row a11y-row';
    row.append(palette, toggle(t('PATTERNS'), 'patterns'), toggle(t('LESS MOTION'), 'reduceMotion'), toggle(t('HIGH CONTRAST'), 'highContrast'));
    return [h2(t('ACCESSIBILITY')), row, this.slider(t('TEXT'), 'uiScale', '%')];
  }

  // EXPORT copies the save as text and downloads it as a file; IMPORT takes
  // pasted text or a file and, once it reads as a save, replaces this one.
  private saveSection(tr: SaveTransfer): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'row save-row';
    const exp = button(t('EXPORT'), () => {
      const text = tr.exportText();
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = `tetra-clicker-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.note = t('Copied, and saved as a file.');
      this.render();
    });
    exp.dataset['save'] = 'export';
    const imp = button(t(this.importOpen ? 'CANCEL' : 'IMPORT'), () => { this.importOpen = !this.importOpen; this.note = ''; this.render(); });
    imp.dataset['save'] = 'import';
    row.append(exp, imp);
    const out: HTMLElement[] = [h2(t('SAVE')), row];
    if (this.importOpen) {
      const area = document.createElement('textarea');
      area.className = 'save-text';
      area.rows = 4;
      area.placeholder = t('Paste a TETRA1: save here, or pick a file.');
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.txt,text/plain';
      file.addEventListener('change', async () => { area.value = (await file.files?.[0]?.text()) ?? ''; });
      const load = button(t('LOAD'), () => {
        if (!confirm(t('Replace this game with the imported save?'))) return;
        if (!tr.importText(area.value)) { this.note = t('That is not a Tetra Clicker save.'); this.render(); }
      });
      load.dataset['save'] = 'load';
      const r2 = document.createElement('div');
      r2.className = 'row save-row';
      r2.append(file, load);
      out.push(area, r2);
    }
    if (this.note) {
      const n = document.createElement('div');
      n.className = 'save-note';
      n.textContent = this.note;
      out.push(n);
    }
    return out;
  }

  private slider(label: string, key: 'das' | 'arr' | 'sdf' | 'volume' | 'uiScale', unit: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slider';
    const l = document.createElement('span');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    const lim = HANDLING_LIMITS[key];
    input.min = String(lim.min);
    input.max = String(lim.max);
    input.step = String(lim.step);
    input.value = String(this.settings[key]);
    const val = document.createElement('span');
    val.className = 'val';
    const show = (): void => {
      const v = this.settings[key];
      val.textContent = key === 'sdf' && v >= SDF_INSTANT ? '∞' : `${v}${unit}`;
    };
    input.addEventListener('input', () => {
      this.settings[key] = Number(input.value);
      show();
      this.onChange(this.settings);
    });
    show();
    row.append(l, input, val);
    return row;
  }
}

function h2(text: string): HTMLElement {
  const e = document.createElement('h2');
  e.textContent = text;
  return e;
}

function keyName(code: string): string {
  return code.replace(/^Key|^Digit|^Arrow/, '').replace('Left', 'L').replace('Right', 'R').replace('Space', 'SPACE').toUpperCase();
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
