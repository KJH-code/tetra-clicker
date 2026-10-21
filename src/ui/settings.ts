import { ACTION_LABELS, DEFAULT_HANDLING, HANDLING_LIMITS, SDF_INSTANT, type HandlingSettings } from '../data/handling';
import { t } from './i18n';
import { addKey, keyName, removeKey } from './keys';
import type { Action } from './input';

// Moving a save between browsers: the page supplies the text and takes it back.
export interface SaveTransfer {
  exportText(): string;
  // False when the text is not a save; the game is left as it was.
  importText(text: string): boolean;
}

// Handling (DAS / ARR / SDF) and keys first, as what a player opens
// settings for most; then sound, language, accessibility and moving the save.
export class SettingsPanel {
  // The action the next key pressed is added to.
  private listening: Action | null = null;
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
    addKey(this.settings.keys, this.listening, e.code);
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
    box.append(h2(t('SETTINGS')));
    box.append(h2(t('HANDLING')));
    box.append(this.slider('DAS', 'das', 'ms'));
    box.append(this.slider('ARR', 'arr', 'ms'));
    box.append(this.slider('SDF', 'sdf', '×'));
    box.append(h2(t('KEYS')), this.keysSection());
    box.append(h2(t('SOUND')));
    const sound = this.slider(t('VOL'), 'volume', '');
    const mute = button(t(this.settings.muted ? 'MUTED' : 'MUTE'), () => {
      this.settings.muted = !this.settings.muted;
      this.onChange(this.settings);
      this.render();
    });
    mute.classList.add('mute');
    mute.classList.toggle('on', this.settings.muted);
    sound.append(mute);
    sound.classList.add('with-btn');
    box.append(sound);
    box.append(...this.languageSection(), ...this.accessSection());
    if (this.transfer) box.append(...this.saveSection(this.transfer));
    const actions = document.createElement('div');
    actions.className = 'row';
    const reset = button(t('DEFAULTS'), () => {
      // Defaults for handling and sound; the tutorial stays where it got to,
      // and the language stays one the player can read.
      const { tutorial, language } = this.settings;
      Object.assign(this.settings, structuredClone(DEFAULT_HANDLING), { tutorial, language });
      this.onChange(this.settings);
      this.render();
    });
    const close = button(t('CLOSE'), () => this.close());
    close.classList.add('primary');
    actions.append(reset, close);
    box.append(actions);
    // Keep the scroll position across re-renders (a toggle should not jump to the top).
    const scroll = (this.overlay.firstElementChild as HTMLElement | null)?.scrollTop ?? 0;
    this.overlay.replaceChildren(box);
    box.scrollTop = scroll;
  }

  // One row per action: its keys as chips (× takes one off), + adds the next key pressed.
  private keysSection(): HTMLElement {
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (const action of Object.keys(ACTION_LABELS) as Action[]) {
      const row = document.createElement('div');
      row.className = 'keyrow';
      row.dataset['action'] = action;
      const label = document.createElement('span');
      label.textContent = t(ACTION_LABELS[action]);
      const caps = document.createElement('div');
      caps.className = 'caps';
      for (const code of this.settings.keys[action]) {
        const cap = document.createElement('span');
        cap.className = 'keycap';
        cap.dataset['code'] = code;
        const x = document.createElement('button');
        x.className = 'x';
        x.textContent = '×';
        x.title = t('Remove');
        x.addEventListener('click', () => { removeKey(this.settings.keys, action, code); this.onChange(this.settings); this.render(); });
        cap.append(keyName(code), x);
        caps.append(cap);
      }
      if (!this.settings.keys[action].length) {
        const none = document.createElement('span');
        none.className = 'none';
        none.textContent = '—';
        caps.append(none);
      }
      const listening = this.listening === action;
      const add = button(listening ? t('PRESS…') : '+', () => { this.listening = listening ? null : action; this.render(); });
      add.classList.add('key-add');
      add.classList.toggle('listening', listening);
      add.title = t('Add a key');
      row.append(label, caps, add);
      keys.append(row);
    }
    return keys;
  }

  // Each language in its own name; a change reloads the page (main.ts),
  // since the shop and the tabs are built once.
  private languageSection(): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'seg';
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
    const palette = document.createElement('div');
    palette.className = 'seg';
    for (const [value, name] of [['standard', t('STANDARD')], ['cvd', t('COLOUR-BLIND SAFE')]] as const) {
      const b = button(name, () => { s.palette = value; this.onChange(s); this.render(); });
      b.classList.toggle('on', s.palette === value);
      b.dataset['palette'] = value;
      palette.append(b);
    }
    const switches = document.createElement('div');
    switches.className = 'switches';
    const toggle = (label: string, key: 'patterns' | 'reduceMotion' | 'highContrast' | 'hitEffects'): HTMLElement => {
      const b = document.createElement('button');
      b.className = 'switch';
      b.setAttribute('aria-pressed', String(s[key]));
      b.dataset['a11y'] = key;
      const knob = document.createElement('span');
      knob.className = 'knob';
      b.append(label, knob);
      b.addEventListener('click', () => { s[key] = !s[key]; this.onChange(s); this.render(); });
      return b;
    };
    switches.append(toggle(t('HIT EFFECTS'), 'hitEffects'), toggle(t('PATTERNS'), 'patterns'), toggle(t('LESS MOTION'), 'reduceMotion'), toggle(t('HIGH CONTRAST'), 'highContrast'));
    const style = document.createElement('div');
    style.className = 'seg';
    for (const [value, name] of [['pixel', t('PIXEL')], ['classic', t('CLASSIC')]] as const) {
      const b = button(name, () => { s.style = value; this.onChange(s); this.render(); });
      b.classList.toggle('on', s.style === value);
      b.dataset['style'] = value;
      style.append(b);
    }
    const styleRow = document.createElement('div');
    styleRow.className = 'slider';
    styleRow.style.gridTemplateColumns = '64px 1fr';
    const sl = document.createElement('span');
    sl.textContent = t('STYLE');
    styleRow.append(sl, style);
    const paletteRow = document.createElement('div');
    paletteRow.className = 'slider';
    const pl = document.createElement('span');
    pl.textContent = t('PIECE COLOURS');
    paletteRow.style.gridTemplateColumns = '64px 1fr';
    paletteRow.append(pl, palette);
    return [h2(t('ACCESSIBILITY')), styleRow, paletteRow, switches, this.slider(t('TEXT'), 'uiScale', '%'), this.slider(t('BACKDROP'), 'backdrop', '%')];
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

  private slider(label: string, key: 'das' | 'arr' | 'sdf' | 'volume' | 'uiScale' | 'backdrop', unit: string): HTMLElement {
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


function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
