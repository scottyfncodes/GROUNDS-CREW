// Game day: the reward. The crew clears the field, the light goes, the towers come on, the crowd fills in,
// two teams take the field you prepared and play a few scripted moments. Not a baseball engine: a vignette.

import { FIELDERS, DUGOUT, FIRST, SECOND, THIRD, HOME, MOUND, dist } from './geometry.js';
import { PAY } from './config.js';
import { mulberry } from './sim.js';

const BASES = [HOME, FIRST, SECOND, THIRD];
const PLAYS = ['single', 'fly', 'homer', 'grounder', 'strikeout', 'double'];

export class GameDay {
  constructor(sim) {
    this.sim = sim; this.rng = mulberry(sim.seed * 31 + sim.day * 977);
    this.phase = 'clearing'; this.t = 0; this.pt = 0; this.lights = 0; this.crowd = 0; this.crowdTarget = 0; this.cheer = 0;
    this.board = { on: false, home: 0, away: 0, hits: 0, inning: 1 }; this.caption = ''; this.captionT = 0;
    this.actors = []; this.ball = null; this.runners = []; this.queue = []; this.playI = 0; this.done = false;
    // the evening is decided up front, so skipping it pays the same as watching it
    const pool = PLAYS.slice(), pick = () => pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
    this.plays = [pick(), pick(), pick()]; if (!this.plays.some((p) => p === 'single' || p === 'double' || p === 'homer')) this.plays[1] = 'single';
    if (this.rng() < 0.45 && !this.plays.includes('homer')) this.plays[2] = 'homer';
    let on = 0, runs = 0; for (const p of this.plays) { if (p === 'single') { if (on >= 3) { runs++; on--; } on++; } else if (p === 'double') { runs += Math.max(0, on - 1); on = Math.min(on, 1) + 1; } else if (p === 'homer') { runs += on + 1; on = 0; } }
    this.final = { home: runs + Math.floor(this.rng() * 3), away: Math.floor(this.rng() * 4) }; if (this.final.home === this.final.away) this.final.home++;
    this.field = sim.refresh().field;
  }

  say(text, secs = 2.6) { this.caption = text; this.captionT = secs; this.sim.emit('caption', { text }); }
  at(t, fn) { this.queue.push({ t: this.pt + t, fn }); this.queue.sort((a, b) => a.t - b.t); }
  actor(team, role, from, to, speed = 46) { const a = { team, role, x: from[0], y: from[1], px: from[0], py: from[1], to: to.slice(), speed, face: to[0] >= from[0] ? 1 : -1, pose: 'stand', moving: false, step: 0, id: team + role }; this.actors.push(a); return a; }
  send(a, to, speed) { a.to = to.slice(); if (speed) a.speed = speed; }
  throwBall(from, to, dur, arc) { this.ball = { from: from.slice(), to: to.slice(), t: 0, dur, arc, x: from[0], y: from[1], z: 3 }; }
  who(role) { return this.actors.find((a) => a.role === role); }

  step(dt) {
    this.t += dt; this.pt += dt; const sim = this.sim;
    if (this.captionT > 0 && (this.captionT -= dt) <= 0) this.caption = '';
    this.crowd += (this.crowdTarget - this.crowd) * Math.min(1, dt * 0.7); this.cheer = Math.max(0, this.cheer - dt * 0.5);
    for (const a of this.actors) { a.px = a.x; a.py = a.y; const d = Math.hypot(a.to[0] - a.x, a.to[1] - a.y); a.moving = d > 0.5;
      if (a.moving) { const g = Math.min(d, a.speed * dt); a.x += (a.to[0] - a.x) / d * g; a.y += (a.to[1] - a.y) / d * g; a.step += g; if (Math.abs(a.to[0] - a.x) > 1) a.face = a.to[0] > a.x ? 1 : -1; } }
    if (this.ball) { const b = this.ball; b.t += dt; const k = Math.min(1, b.t / b.dur); b.x = b.from[0] + (b.to[0] - b.from[0]) * k; b.y = b.from[1] + (b.to[1] - b.from[1]) * k; b.z = 3 + Math.sin(k * Math.PI) * b.arc; if (k >= 1 && !b.hold) this.ball = null; }
    while (this.queue.length && this.queue[0].t <= this.pt) this.queue.shift().fn();

    switch (this.phase) {
      case 'clearing': {
        const clear = sim.workers.every((w) => w.state === 'IDLE' && !w.path);
        if (this.pt > 0.8 && (clear || this.pt > 14)) { this.go('dusk'); sim.light = 'golden'; this.crowdTarget = 0.5; this.say('Gates are open.', 3); }
        break; }
      case 'dusk': if (this.pt > 4.5) { this.go('lights'); sim.light = 'night'; for (let i = 0; i < 4; i++) this.at(0.3 + i * 0.55, () => { this.lights = (i + 1) / 4; sim.emit('tower', { i }); }); } break;
      case 'lights': if (this.pt > 3.2) { this.board.on = true; this.crowdTarget = 0.9; sim.emit('organ', {}); this.go('players'); this.takeField(); } break;
      case 'players': if (this.pt > 5.2) { this.go('plays'); this.nextPlay(); } break;
      case 'plays': break;
      case 'final': if (this.pt > 3.4) this.finish(); break;
    }
  }
  go(phase) { this.phase = phase; this.pt = 0; this.queue.length = 0; }

  takeField() {
    Object.entries(FIELDERS).forEach(([role, p], i) => { const a = this.actor('away', role, [DUGOUT.away[0] - i * 2, DUGOUT.away[1] + (i % 3) * 3], DUGOUT.away); this.at(0.2 + i * 0.12, () => this.send(a, p, 52)); });
    this.say('Here come the teams.', 3);
  }

  batter() { const b = this.actor('home', 'BAT', DUGOUT.home, [-7, 0.5], 40); b.face = 1; return b; }
  retire(a) { this.send(a, DUGOUT.home, 36); this.at(5, () => { this.actors = this.actors.filter((x) => x !== a); }); }
  score(n) { if (n > 0) { this.board.home += n; this.cheer = 1; this.sim.emit('score', { n }); } }
  advance(bases, bat) {                                          // everyone on base moves up; the batter joins them
    let runs = 0; const all = this.runners.concat(bat ? [{ a: bat, base: 0 }] : []), keep = [];
    for (const r of all) { const dest = r.base + bases, a = r.a; let delay = 0;
      for (let b = r.base + 1; b <= Math.min(4, dest); b++) { const to = BASES[b % 4]; this.at(delay, () => this.send(a, to, 44)); delay += 90 / 44; }
      if (dest >= 4) { runs++; this.at(delay + 0.3, () => this.retire(a)); } else { r.base = dest; keep.push(r); } }
    this.runners = keep; return runs;
  }

  nextPlay() {
    if (this.playI >= this.plays.length) { this.go('final'); this.board.home = this.final.home; this.board.away = this.final.away; this.board.inning = 9;
      this.say(this.final.home > this.final.away ? `Clovers win, ${this.final.home}–${this.final.away}.` : `Visitors take it, ${this.final.away}–${this.final.home}.`, 3.4); this.cheer = 1; this.sim.emit('final', { win: this.final.home > this.final.away }); return; }
    const kind = this.plays[this.playI++], bat = this.batter(), P = this.who('P'), f = (r) => this.who(r), back = (a, r) => this.at(1.2, () => this.send(a, FIELDERS[r], 30)), end = (t) => this.at(t, () => { this.pt = 0; this.queue.length = 0; this.nextPlay(); });
    this.pt = 0;
    this.at(1.9, () => { if (P) P.pose = 'throw'; this.throwBall(MOUND, [0, 1], 0.5, 1.5); this.sim.emit('pitch', {}); });
    this.at(2.35, () => { bat.pose = 'swing'; if (P) P.pose = 'stand'; });
    const hit = (to, dur, arc) => this.at(2.42, () => { this.throwBall([0, 1], to, dur, arc); this.sim.emit('crack', {}); });
    if (kind === 'strikeout') { this.at(2.5, () => { this.sim.emit('whiff', {}); this.say('Swing and a miss. Strike three.'); }); this.at(3.6, () => { bat.pose = 'stand'; this.retire(bat); }); end(5.4); return; }
    this.board.hits += kind === 'fly' || kind === 'grounder' ? 0 : 1;
    if (kind === 'single') { const spot = [-112, 205]; hit(spot, 1.5, 22); this.at(2.5, () => { bat.pose = 'stand'; this.send(f('LF'), spot, 50); this.cheer = 0.7; this.say('Base hit to left.'); this.score(this.advance(1, bat)); });
      this.at(4.3, () => { this.throwBall(spot, FIELDERS.SS, 0.9, 10); back(f('LF'), 'LF'); }); end(6.6); }
    else if (kind === 'double') { const spot = [165, 232]; hit(spot, 1.9, 26); this.at(2.5, () => { bat.pose = 'stand'; this.send(f('RF'), spot, 50); this.cheer = 0.8; this.say('Into the corner. Stand-up double.'); this.score(this.advance(2, bat)); });
      this.at(4.8, () => { this.throwBall(spot, FIELDERS['2B'], 1.1, 14); back(f('RF'), 'RF'); }); end(7.6); }
    else if (kind === 'homer') { hit([36, 452], 2.7, 90); this.at(2.5, () => { bat.pose = 'stand'; this.say('High, deep… gone! Clovers score.', 3.6); this.send(f('CF'), [20, 372], 46); });
      this.at(5.0, () => { this.cheer = 1; this.sim.emit('roar', {}); this.score(this.advance(4, bat)); }); this.at(6.2, () => back(f('CF'), 'CF')); end(11.6); }
    else if (kind === 'fly') { const spot = [14, 296]; hit(spot, 2.5, 70); this.at(2.5, () => { bat.pose = 'stand'; this.send(f('CF'), spot, 40); this.send(bat, FIRST, 40); this.say('Lifted to center…'); });
      this.at(5.0, () => { this.say('Caught. One away.'); this.sim.emit('clap', {}); this.retire(bat); back(f('CF'), 'CF'); }); end(7); }
    else { const ss = FIELDERS.SS; hit(ss, 0.85, 1.5); this.at(2.5, () => { bat.pose = 'stand'; this.send(bat, FIRST, 40); this.say('Grounder to short…'); });
      this.at(3.4, () => { this.throwBall(ss, FIELDERS['1B'], 0.7, 7); }); this.at(4.2, () => { this.say('Out at first.'); this.sim.emit('clap', {}); this.retire(bat); }); end(6.2); }
  }

  /** The day summary: what the gate pays, and a bonus for how good the field looked. */
  finish() {
    if (this.done) return; this.done = true; const sim = this.sim;
    this.board.on = true; this.board.home = this.final.home; this.board.away = this.final.away; this.lights = 1; this.crowd = this.crowdTarget = 0.9; sim.light = 'night';
    const craft = Math.round(this.field * PAY.craft / 5) * 5, win = this.final.home > this.final.away; if (win) sim.record.w++; else sim.record.l++;
    sim.bucks += PAY.gate + craft;
    sim.summary = { day: sim.day, home: this.final.home, away: this.final.away, win, field: this.field, jobs: sim.earned, gate: PAY.gate, craft, total: sim.earned + PAY.gate + craft, bucks: sim.bucks, record: { ...sim.record } };
    sim.mode = 'summary'; this.phase = 'over'; this.caption = ''; sim.emit('summary', sim.summary);
  }
  skip() { this.finish(); }
}
