// Sound: a quiet, close-up palette. Ambience and three one-shots are recorded assets (Ogg where the browser can
// decode it, MP3 otherwise, so iPhone Safari gets sound too). The machines, the crowd and the organ are
// synthesised into short loops when sound is first unlocked, so they can follow the simulation: an engine that
// putters and revs, a rake that scrapes in strokes, a crowd that murmurs and roars. Nothing plays before the
// first touch, and the game is complete with the sound off.

import { ST } from './sim.js';

const FILES = { click: 'click', footstep: 'footstep', thud: 'thud', forest: 'ambience_forest', wind: 'ambience_wind', town: 'ambience_neighbourhood' };
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

/** Original organ phrases: [midi note | null, beats]. One beat is the phrase's step. */
export const STINGERS = {
  gates: { step: 0.2, notes: [[62, 1], [66, 1], [69, 1], [74, 3]] },
  lights: { step: 0.15, notes: [[74, 1], [78, 1], [81, 1], [86, 3], [81, 1], [86, 5]] },
  walkup: { step: 0.17, notes: [[67, 1], [71, 1], [74, 1], [71, 1], [76, 2], [74, 3]] },
  rally: { step: 0.14, notes: [[69, 1], [69, 1], [71, 1], [73, 1], [74, 2], [null, 1], [74, 1], [78, 4]] },
  homer: { step: 0.12, notes: [[74, 1], [78, 1], [81, 1], [86, 1], [90, 4], [86, 2], [90, 6]] },
  win: { step: 0.18, notes: [[62, 1], [66, 1], [69, 1], [74, 2], [73, 1], [74, 1], [78, 5]] },
  lose: { step: 0.3, notes: [[69, 1], [66, 1], [64, 1], [62, 3]] },
  morning: { step: 0.24, notes: [[67, 1], [71, 1], [74, 2], [72, 1], [71, 1], [67, 3]] },
};

export class Sound {
  constructor(settings) { this.settings = settings; this.ctx = null; this.buf = {}; this.loops = {}; this.lastStep = 0; this.lastTick = 0; this.birdT = 4; this.played = {}; }

  /** Call from a user gesture. Safe to call again. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.sr = c.sampleRate;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(comp); this.applyVolume();
    // a small room for the organ and the crowd
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(1.8); const vg = c.createGain(); vg.gain.value = 0.28; this.verb.connect(vg); vg.connect(this.master);
    const n = this.sr * 2, nb = c.createBuffer(1, n, this.sr), d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
    for (const k in FILES) this._load(k, FILES[k]);
    this._organBus(); this.synth = {};
    // build the synthesised loops one at a time after the tap, so the first tap answers at once
    const jobs = [['engine', () => this._engineBuf(), () => this._engine()], ['reel', () => this._reelBuf(), () => this._loopBuf('reel', this.synth.reel, 'highpass', 900)], ['scrape', () => this._scrapeBuf(), () => this._loopBuf('scrape', this.synth.scrape, 'bandpass', 1300)],
      ['crowd', () => this._crowdBuf(6, 1), () => this._loopBuf('crowd', this.synth.crowd, 'lowpass', 2600, true)], ['cheer', () => this._crowdBuf(3.2, 2.4), null]];
    const next = () => { const j = jobs.shift(); if (!j) return; this.synth[j[0]] = j[1](); if (j[2]) j[2](); (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(next); };
    setTimeout(next, 120);
  }
  applyVolume() { if (this.master) this.master.gain.value = this.settings.muted ? 0 : this.settings.volume; }
  suspend(on) { if (this.ctx) (on ? this.ctx.suspend() : this.ctx.resume()).catch(() => {}); }

  /** Ogg first; if this browser cannot decode it (iPhone Safari), the MP3 twin. */
  _load(key, stem) {
    const c = this.ctx, get = (ext) => fetch(`assets/audio/${stem}.${ext}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing')))).then((ab) => new Promise((res, rej) => { const pr = c.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(() => {}); }));   // older Safari only has the callback form; newer browsers also reject the promise
    get('ogg').catch(() => get('mp3')).then((b) => { this.buf[key] = b; if (key === 'forest' || key === 'wind' || key === 'town') this._ambience(key); }).catch(() => { this.buf[key] = null; });
  }

  // ---- synthesis: built once, looped ------------------------------------------------------------------------

  _impulse(sec) { const c = this.ctx, n = Math.floor(this.sr * sec), b = c.createBuffer(2, n, this.sr); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); } return b; }
  /** A little single-cylinder engine: 52 firings in exactly two seconds, so it loops without a seam. */
  _engineBuf() {
    const sr = this.sr, n = sr * 2, b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0), fires = 52, per = n / fires; let lp = 0;
    for (let f = 0; f < fires; f++) { const s0 = Math.floor(f * per), amp = 0.75 + Math.random() * 0.3, len = Math.floor(per);
      for (let i = 0; i < len && s0 + i < n; i++) { const t = i / sr, thump = Math.exp(-t * 70) * Math.sin(2 * Math.PI * 62 * t) * amp, rattle = (Math.random() * 2 - 1) * Math.exp(-t * 140) * 0.35; d[s0 + i] += thump + rattle; } }
    for (let i = 0; i < n; i++) { lp += (d[i] - lp) * 0.18; d[i] = lp * 1.6; } return b;
  }
  /** A reel mower: fast bright blade clicks over a soft whirr. */
  _reelBuf() { const sr = this.sr, n = sr, b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0), clicks = 36; for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.05; for (let k = 0; k < clicks; k++) { const s0 = Math.floor(k * n / clicks); for (let i = 0; i < 260 && s0 + i < n; i++) d[s0 + i] += (Math.random() * 2 - 1) * Math.exp(-i / 50) * (0.6 + Math.random() * 0.3); } return b; }
  /** Rake and drag: grit in strokes, a little over a second each. */
  _scrapeBuf() { const sr = this.sr, n = sr * 2, b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) { const ph = (i / n) * 3 % 1, env = Math.sin(Math.PI * Math.min(1, ph * 1.25)) ** 1.5; d[i] = (Math.random() * 2 - 1) * (0.25 + 0.75 * env) * (Math.random() < 0.02 ? 2.2 : 1) * 0.5; } return b; }
  /** A crowd: many short voiced syllables (noise through two formants) spread across the stereo field. */
  _crowdBuf(sec, excite) {
    const sr = this.sr, n = Math.floor(sr * sec), b = this.ctx.createBuffer(2, n, sr), L = b.getChannelData(0), R = b.getChannelData(1), count = Math.floor(sec * 26 * excite);
    const bp = (f, q) => { const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al; return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }; };
    const run = (s, x) => { const y = s.b0 * x + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2; s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y; return y; };
    for (let v = 0; v < count; v++) { const len = Math.floor(sr * (0.1 + Math.random() * 0.3)), start = Math.floor(Math.random() * n), f1 = bp(300 + Math.random() * 500 * excite, 6), f2 = bp(900 + Math.random() * 1300 * excite, 8), pan = Math.random(), amp = (0.4 + Math.random() * 0.6) * (excite > 1 ? 0.9 : 0.6);
      for (let i = 0; i < len; i++) { const env = Math.sin(Math.PI * i / len), x = Math.random() * 2 - 1, y = (run(f1, x) + run(f2, x) * 0.7) * env * amp, k = (start + i) % n; L[k] += y * (1 - pan); R[k] += y * pan; } }
    if (excite > 1) for (let i = 0; i < n; i++) { const env = Math.sin(Math.PI * i / n) ** 0.6; L[i] *= env; R[i] *= env; }
    return b;
  }

  _ambience(k) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.buf[k]; s.loop = true; if (s.buffer.duration > 1) { s.loopStart = 0.03; s.loopEnd = s.buffer.duration - 0.03; } const g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.master); s.start(0, 0.03); this.loops[k] = { g }; }
  _loopBuf(key, buf, type, freq, verb) { const c = this.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); if (verb) g.connect(this.verb); s.start(); this.loops[key] = { g, s, f }; }
  _engine() { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.synth.engine; s.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 160; body.gain.value = 7; const g = c.createGain(); g.gain.value = 0; s.connect(lp); lp.connect(body); body.connect(g); g.connect(this.master); s.start(); this.loops.engine = { g, s, lp }; }
  /** The organ: drawbar sines through a turning-speaker wobble into the room. */
  _organBus() { const c = this.ctx, inG = c.createGain(), dl = c.createDelay(0.05), lfo = c.createOscillator(), depth = c.createGain(), out = c.createGain(); dl.delayTime.value = 0.006; lfo.frequency.value = 5.6; depth.gain.value = 0.0018; lfo.connect(depth); depth.connect(dl.delayTime); lfo.start(); inG.connect(dl); inG.connect(out); dl.connect(out); out.gain.value = 0.6; out.connect(this.master); out.connect(this.verb); this.organIn = inG; }

  _set(loop, v, tc = 0.25) { const l = this.loops[loop]; if (l) l.g.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  play(name, gain = 0.5, rate = 1) { const c = this.ctx, b = c && (this.buf[name] || (this.synth && this.synth[name])); if (!b) return false; const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(this.master); if (name === 'cheer') g.connect(this.verb); s.start(); return true; }
  tone(freq, dur, gain = 0.1, type = 'sine', when = 0, attack = 0.008, dest) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when; o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05); }
  burst(freq, dur, gain, when = 0, q = 1) { const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(), t = c.currentTime + when; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  /** One organ note: drawbars (sub, fundamental, fifth, octave, twelfth, fifteenth) with a percussive second harmonic on the attack. */
  organNote(midi, when, dur, gain = 0.05) { const c = this.ctx, f = NOTE(midi), t = c.currentTime + when, g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.09); g.connect(this.organIn);
    [[0.5, 0.45], [1, 1], [1.5, 0.55], [2, 0.5], [3, 0.28], [4, 0.22]].forEach(([m, a]) => { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = f * m; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.12); });
    this.tone(f * 3, 0.22, gain * 0.5, 'sine', when, 0.004, this.organIn); }
  stinger(name, gain = 0.05) { const st = STINGERS[name]; if (!st || !this.ctx) return; let at = 0, last = null; for (const [n, beats] of st.notes) { const d = beats * st.step; if (n != null) { this.organNote(n, at, d * 0.92, gain); last = { n, at, d }; } at += d; } if (last) { this.organNote(last.n - 12, last.at, last.d, gain * 0.7); this.organNote(last.n - 17, last.at, last.d, gain * 0.5); } }

  click() { if (!this.ctx) return; if (!this.play('click', 0.35)) this.tone(660, 0.06, 0.06, 'triangle'); }
  clap(n = 14, gain = 0.035) { for (let i = 0; i < n; i++) this.burst(1400 + Math.random() * 1000, 0.05, gain, i * 0.08 + Math.random() * 0.05, 1.2); }

  on(type, d) {
    if (!this.ctx) return;
    switch (type) {
      case 'assign': this.tone(NOTE(76), 0.12, 0.05, 'triangle'); this.tone(NOTE(81), 0.16, 0.05, 'triangle', 0.08); break;
      case 'stripe': this.tone(NOTE(88), 0.5, 0.035); this.tone(NOTE(95), 0.6, 0.03, 'sine', 0.09); if (d && d.first) [88, 93, 97].forEach((n, i) => this.tone(NOTE(n), 0.7, 0.03, 'sine', 0.18 + i * 0.08)); break;
      case 'jobdone': [81, 85, 88, 93].forEach((n, i) => this.tone(NOTE(n), 0.3, 0.05, 'triangle', i * 0.07)); break;
      case 'collect': case 'returned': if (!this.play('thud', 0.25, 1.3)) this.burst(180, 0.12, 0.2); break;
      case 'cancel': this.tone(NOTE(69), 0.14, 0.04, 'triangle'); break;
      case 'buy': [74, 78, 81, 86].forEach((n, i) => this.tone(NOTE(n), 0.35, 0.05, 'triangle', i * 0.09)); break;
      case 'gates': this.stinger('gates'); break;
      case 'tower': if (!this.play('thud', 0.5, 0.7)) this.burst(120, 0.2, 0.3); this.tone(120, 0.5, 0.03, 'sine'); break;
      case 'organ': this.stinger('lights', 0.055); this.play('cheer', 0.5); break;
      case 'walkup': this.stinger('walkup', 0.04); break;
      case 'pitch': this.burst(3000, 0.1, 0.04, 0, 2); break;
      case 'crack': this.play('thud', 0.6, 2.4); this.burst(1800, 0.06, 0.3, 0, 1.5); break;
      case 'whiff': this.burst(900, 0.22, 0.08, 0, 3); break;
      case 'clap': this.clap(); break;
      case 'score': this.stinger('rally', 0.045); this.play('cheer', 0.55); this.clap(20, 0.03); break;
      case 'roar': this.stinger('homer', 0.05); this.play('cheer', 0.8, 1.05); break;
      case 'final': this.stinger(d.win ? 'win' : 'lose', 0.05); if (d.win) this.play('cheer', 0.6); break;
      case 'firework': this.burst(300 + Math.random() * 200, 0.6, 0.18, 0, 0.7); this.burst(2400, 0.4, 0.05, 0.05, 0.5); break;
      case 'summary': this.tone(NOTE(74), 0.5, 0.04, 'triangle'); break;
      case 'newday': this.stinger('morning', 0.03); break;
      case 'blimp': this.stinger('walkup', 0.035); break;
      case 'ooh': this.play('cheer', 0.3 + d.stars * 0.17, 0.74); if (d.stars === 3) this.clap(24, 0.03); break;
    }
  }

  /** Once a frame: loops follow what is actually happening. */
  update(sim, dt, paused) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let mow = 0, reel = 0, scrape = 0, chalk = 0, steps = 0, drag = 0;
    if (!paused) for (const w of sim.workers) { const working = w.state === ST.WORKING && w.working;
      if (w.equip === 'rider' && (w.moving || w.state === ST.FINISHING)) mow = Math.max(mow, working ? 1 : 0.55); if (w.equip === 'push' && working) reel = 1; if (w.equip === 'rake' && working) scrape = 1; if (w.equip === 'mat' && working) drag = 1; if (w.equip === 'chalker' && working) chalk = 1; if (w.moving && w.equip !== 'rider') steps++; }
    const now = this.ctx.currentTime, e = this.loops.engine;
    this._set('engine', mow ? 0.16 + mow * 0.1 : 0, 0.3); if (e) e.s.playbackRate.setTargetAtTime(0.82 + mow * 0.36 + Math.sin(now * 2.7) * 0.015, now, 0.35);
    this._set('reel', reel * 0.05, 0.1); this._set('scrape', scrape * 0.07 + drag * 0.05, 0.12); if (this.loops.scrape) this.loops.scrape.s.playbackRate.setTargetAtTime(drag ? 0.55 : 1, now, 0.2);
    this.lastTick -= dt; if (chalk && this.lastTick <= 0) { this.lastTick = 0.16; this.burst(4200, 0.03, 0.03, 0, 4); }
    this.lastStep -= dt; if (steps && this.lastStep <= 0) { this.lastStep = 0.34 / Math.min(2, steps); if (!this.play('footstep', 0.07, 0.9 + Math.random() * 0.3)) this.burst(300, 0.04, 0.03); }
    const gd = sim.gameday, night = sim.light === 'night' || sim.light === 'golden', crowd = gd ? gd.crowd : 0, cheer = gd ? gd.cheer : 0;
    this._set('forest', sim.mode === 'title' || !night ? 0.3 : 0.03, 1.5); this._set('wind', night ? 0.14 : 0.17, 1.5); this._set('town', sim.light === 'morning' || sim.mode === 'title' ? 0.06 : 0.025, 2);
    this._set('crowd', crowd * 0.22 + cheer * 0.2, 0.5);
    if (this.buf.forest === null && !night) { this.birdT -= dt; if (this.birdT <= 0) { this.birdT = 3 + Math.random() * 7; const f = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f * (1 + i * 0.06), 0.07, 0.02, 'sine', i * 0.11); } }
  }
}
