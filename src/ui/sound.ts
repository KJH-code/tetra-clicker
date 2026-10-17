// Every sound is synthesized with WebAudio: no files to load, and each cue
// is a few oscillator notes with a short envelope.
export type Cue =
  | 'lock' | 'clear1' | 'clear2' | 'clear3' | 'clear4' | 'tspin' | 'pc'
  | 'levelUp' | 'checkpoint' | 'topOut' | 'golden' | 'wrath' | 'achievement' | 'buy';

interface Note {
  freq: number;
  at: number; // seconds after the cue starts
  dur: number;
  type?: OscillatorType;
  gain?: number;
  // Glide to this frequency over the note.
  to?: number;
}

const arp = (freqs: number[], step: number, dur: number, type: OscillatorType = 'square', gain = 0.5): Note[] =>
  freqs.map((freq, i) => ({ freq, at: i * step, dur, type, gain }));

// C major up the octave, so bigger clears climb higher.
const C = [523.25, 659.25, 783.99, 1046.5, 1318.5];

const CUES: Record<Cue, Note[]> = {
  lock: [{ freq: 180, at: 0, dur: 0.04, type: 'triangle', gain: 0.35 }],
  clear1: arp(C.slice(0, 1), 0.05, 0.12),
  clear2: arp(C.slice(0, 2), 0.05, 0.12),
  clear3: arp(C.slice(0, 3), 0.05, 0.12),
  clear4: arp(C.slice(0, 4), 0.05, 0.16),
  tspin: [{ freq: 300, to: 900, at: 0, dur: 0.18, type: 'sawtooth', gain: 0.35 }, ...arp([987.77, 1318.5], 0.06, 0.14, 'square', 0.4).map((n) => ({ ...n, at: n.at + 0.12 }))],
  pc: arp([...C, 1567.98], 0.06, 0.22, 'triangle', 0.7),
  levelUp: arp([440, 554.37, 659.25, 880], 0.07, 0.14, 'triangle', 0.6),
  checkpoint: arp([783.99, 1046.5, 1567.98], 0.09, 0.3, 'sine', 0.8),
  topOut: [{ freq: 330, to: 55, at: 0, dur: 0.9, type: 'sawtooth', gain: 0.5 }],
  golden: arp([1318.5, 1567.98, 2093], 0.05, 0.3, 'sine', 0.6),
  // A low minor rumble: the wrath piece reads as a threat.
  wrath: [{ freq: 110, to: 82.41, at: 0, dur: 0.8, type: 'sawtooth', gain: 0.6 }, { freq: 130.81, to: 97.99, at: 0.05, dur: 0.75, type: 'square', gain: 0.25 }],
  achievement: arp([783.99, 987.77, 1174.66, 1567.98], 0.08, 0.25, 'triangle', 0.6),
  buy: [{ freq: 660, at: 0, dur: 0.06, type: 'square', gain: 0.3 }, { freq: 990, at: 0.05, dur: 0.08, type: 'square', gain: 0.3 }],
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(private volume: number, private muted: boolean) {}

  // Browsers keep audio off until the page gets a gesture, so the context
  // is made on the first key or touch.
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
  }

  set(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    // Perceived loudness is roughly logarithmic; squaring the slider keeps
    // its lower half useful.
    if (this.master) this.master.gain.value = this.muted ? 0 : (this.volume / 100) ** 2 * 0.4;
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0) return;
    const t0 = ctx.currentTime + 0.005;
    for (const n of CUES[cue]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = n.type ?? 'square';
      osc.frequency.setValueAtTime(n.freq, t0 + n.at);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
      const peak = n.gain ?? 0.5;
      env.gain.setValueAtTime(0.0001, t0 + n.at);
      env.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(env).connect(this.master);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.02);
    }
  }
}
