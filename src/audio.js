// Sound: a quiet, close-up palette. Ambience and three one-shots are recorded assets; the machines, the crowd
// and the organ are synthesised so they can follow the simulation (an engine that idles, a crowd that swells).
// Nothing plays before the first touch, and everything works with the sound off.

import { ST } from './sim.js';

const FILES = { click: 'assets/audio/click.ogg', footstep: 'assets/audio/footstep.ogg', thud: 'assets/audio/thud.ogg', forest: 'assets/audio/ambience_forest.ogg', wind: 'assets/audio/ambience_wind.ogg' };
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export class Sound {
  constructor(settings) { this.settings = settings; this.ctx = null; this.buf = {}; this.loops = {}; this.lastStep = 0; this.lastTick = 0; this.birdT = 4; }

  /** Call from a user gesture. Safe to call again. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.connect(c.destination); this.applyVolume();
    const n = c.sampleRate * 2, nb = c.createBuffer(1, n, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
    for (const k in FILES) fetch(FILES[k]).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing')))).then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej))).then((b) => { this.buf[k] = b; if (k === 'forest' || k === 'wind') this._ambience(k); }).catch(() => { this.buf[k] = null; });
    this._engine(); this._scrape(); this._crowd();
  }
  applyVolume() { if (this.master) this.master.gain.value = this.settings.muted ? 0 : this.settings.volume; }
  suspend(on) { if (this.ctx) (on ? this.ctx.suspend() : this.ctx.resume()).catch(() => {}); }

  _loopNoise(filterType, freq, q) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return { g, f }; }
  _ambience(k) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.buf[k]; s.loop = true; const g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.master); s.start(); this.loops[k] = { g }; }
  _engine() { const c = this.ctx, a = c.createOscillator(), b = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); a.type = 'sawtooth'; b.type = 'square'; a.frequency.value = 58; b.frequency.value = 29.3; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0; a.connect(f); b.connect(f); f.connect(g); g.connect(this.master); a.start(); b.start(); this.loops.engine = { g, a, b }; this.loops.cut = this._loopNoise('bandpass', 2600, 0.8); }
  _scrape() { this.loops.scrape = this._loopNoise('bandpass', 1100, 0.6); }
  _crowd() { this.loops.crowd = this._loopNoise('bandpass', 760, 0.45); this.loops.wash = this._loopNoise('lowpass', 500, 0.3); }

  _set(loop, v, tc = 0.25) { const l = this.loops[loop]; if (l) l.g.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  play(name, gain = 0.5, rate = 1) { const c = this.ctx, b = c && this.buf[name]; if (!b) return false; const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(this.master); s.start(); return true; }
  tone(freq, dur, gain = 0.1, type = 'sine', when = 0, attack = 0.008) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when; o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05); }
  burst(freq, dur, gain, when = 0, q = 1) { const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(), t = c.currentTime + when; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  organ(notes, step = 0.19, gain = 0.05) { notes.forEach((n, i) => { if (n == null) return; const f = NOTE(n), w = i * step, d = step * 1.5; this.tone(f, d, gain, 'sine', w, 0.02); this.tone(f * 2, d, gain * 0.5, 'sine', w, 0.02); this.tone(f * 3, d, gain * 0.25, 'sine', w, 0.02); this.tone(f / 2, d, gain * 0.5, 'triangle', w, 0.02); }); }

  click() { if (!this.ctx) return; if (!this.play('click', 0.35)) this.tone(660, 0.06, 0.06, 'triangle'); }

  on(type, d) {
    if (!this.ctx) return;
    switch (type) {
      case 'assign': this.tone(NOTE(76), 0.12, 0.05, 'triangle'); this.tone(NOTE(81), 0.16, 0.05, 'triangle', 0.08); break;
      case 'stripe': this.tone(NOTE(88), 0.5, 0.035); this.tone(NOTE(95), 0.6, 0.03, 'sine', 0.09); break;
      case 'jobdone': [81, 85, 88, 93].forEach((n, i) => this.tone(NOTE(n), 0.3, 0.05, 'triangle', i * 0.07)); break;
      case 'collect': case 'returned': if (!this.play('thud', 0.25, 1.3)) this.burst(180, 0.12, 0.2); break;
      case 'cancel': this.tone(NOTE(69), 0.14, 0.04, 'triangle'); break;
      case 'buy': [74, 78, 81, 86].forEach((n, i) => this.tone(NOTE(n), 0.35, 0.05, 'triangle', i * 0.09)); break;
      case 'gates': this.organ([62, 66, 69, 74], 0.22); break;
      case 'tower': if (!this.play('thud', 0.5, 0.7)) this.burst(120, 0.2, 0.3); this.tone(120, 0.5, 0.03, 'sine'); break;
      case 'organ': this.organ([62, 66, 69, 71, 69, 74, null, 78, 74], 0.17); break;
      case 'pitch': this.burst(3000, 0.1, 0.04, 0, 2); break;
      case 'crack': this.play('thud', 0.6, 2.4); this.burst(1800, 0.06, 0.3, 0, 1.5); break;
      case 'whiff': this.burst(900, 0.22, 0.08, 0, 3); break;
      case 'clap': for (let i = 0; i < 14; i++) this.burst(1500 + Math.random() * 900, 0.05, 0.035, i * 0.09 + Math.random() * 0.04, 1.2); break;
      case 'score': case 'roar': this.organ([69, 74, 78], 0.14, 0.04); break;
      case 'final': this.organ(d.win ? [62, 66, 69, 74, 78, 81] : [69, 66, 62], 0.2); break;
      case 'summary': this.tone(NOTE(74), 0.5, 0.04, 'triangle'); break;
    }
  }

  /** Once a frame: loops follow what is actually happening. */
  update(sim, dt, paused) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let mow = 0, reel = 0, scrape = 0, chalk = 0, steps = 0;
    if (!paused) for (const w of sim.workers) { const working = w.state === ST.WORKING && w.working;
      if (w.equip === 'rider' && w.moving) mow = Math.max(mow, working ? 1 : 0.6); if (w.equip === 'push' && working) reel = 1; if ((w.equip === 'mat' || w.equip === 'rake') && working) scrape = 1; if (w.equip === 'chalker' && working) chalk = 1; if (w.moving && w.equip !== 'rider') steps++; }
    const e = this.loops.engine; this._set('engine', mow * 0.05); if (e) { const f = 52 + mow * 12 + Math.sin(this.ctx.currentTime * 3) * 1.2; e.a.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.2); e.b.frequency.setTargetAtTime(f / 2 + 0.4, this.ctx.currentTime, 0.2); }
    this._set('cut', mow > 0.9 ? 0.02 : reel ? 0.03 * (0.5 + 0.5 * Math.sin(this.ctx.currentTime * 26)) : 0, 0.05);
    this._set('scrape', scrape * 0.035 * (0.7 + 0.3 * Math.sin(this.ctx.currentTime * 5)), 0.08);
    this.lastTick -= dt; if (chalk && this.lastTick <= 0) { this.lastTick = 0.16; this.burst(4200, 0.03, 0.03, 0, 4); }
    this.lastStep -= dt; if (steps && this.lastStep <= 0) { this.lastStep = 0.34 / Math.min(2, steps); if (!this.play('footstep', 0.07, 0.9 + Math.random() * 0.3)) this.burst(300, 0.04, 0.03); }
    const gd = sim.gameday, night = sim.light === 'night' || sim.light === 'golden', crowd = gd ? gd.crowd : 0, cheer = gd ? gd.cheer : 0;
    this._set('forest', sim.mode === 'title' || !night ? 0.32 : 0.04, 1.5); this._set('wind', night ? 0.16 : 0.2, 1.5);
    this._set('crowd', crowd * 0.035 + cheer * 0.09, 0.4); this._set('wash', crowd * 0.05 + cheer * 0.05, 0.6);
    if (this.buf.forest === null && !night) { this.birdT -= dt; if (this.birdT <= 0) { this.birdT = 3 + Math.random() * 7; const f = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f * (1 + i * 0.06), 0.07, 0.02, 'sine', i * 0.11); } }
  }
}
