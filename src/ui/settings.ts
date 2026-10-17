import { ACTION_LABELS, DEFAULT_HANDLING, HANDLING_LIMITS, SDF_INSTANT, type HandlingSettings, type KeyBindings } from '../data/handling';

// DAS / ARR / SDF, key rebinding and sound. The spec keeps the options list
// short on purpose; volume is the one addition, since synthesized cues
// with no way to quiet them would drive players to mute the tab.
export class SettingsPanel {
  private listening: keyof KeyBindings | null = null;

  constructor(
    private overlay: HTMLElement,
    private settings: HandlingSettings,
    private onChange: (s: HandlingSettings) => void,
    private onOpenChange: (open: boolean) => void,
  ) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    window.addEventListener('keydown', this.capture, true);
  }

  open(): void {
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
    box.append(h2('HANDLING'));
    box.append(this.slider('DAS', 'das', 'ms'));
    box.append(this.slider('ARR', 'arr', 'ms'));
    box.append(this.slider('SDF', 'sdf', '×'));
    box.append(h2('SOUND'));
    const sound = this.slider('VOL', 'volume', '');
    const mute = document.createElement('button');
    mute.className = 'btn mute' + (this.settings.muted ? ' on' : '');
    mute.textContent = this.settings.muted ? 'MUTED' : 'MUTE';
    mute.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this.onChange(this.settings);
      this.render();
    });
    sound.append(mute);
    sound.classList.add('with-btn');
    box.append(sound);
    box.append(h2('KEYS'));
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (const action of Object.keys(ACTION_LABELS) as (keyof KeyBindings)[]) {
      const row = document.createElement('div');
      row.className = 'keyrow';
      const label = document.createElement('span');
      label.textContent = ACTION_LABELS[action];
      const btn = document.createElement('button');
      btn.className = 'btn' + (this.listening === action ? ' listening' : '');
      btn.textContent = this.listening === action ? 'PRESS…' : this.settings.keys[action].map(keyName).join(' / ') || '—';
      btn.addEventListener('click', () => { this.listening = action; this.render(); });
      row.append(label, btn);
      keys.append(row);
    }
    box.append(keys);
    const actions = document.createElement('div');
    actions.className = 'row';
    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.textContent = 'DEFAULTS';
    reset.addEventListener('click', () => {
      // Defaults for handling and sound; the tutorial stays where it got to.
      const tutorial = this.settings.tutorial;
      Object.assign(this.settings, structuredClone(DEFAULT_HANDLING), { tutorial });
      this.onChange(this.settings);
      this.render();
    });
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.close());
    actions.append(reset, close);
    box.append(actions);
    this.overlay.replaceChildren(box);
  }

  private slider(label: string, key: 'das' | 'arr' | 'sdf' | 'volume', unit: string): HTMLElement {
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
