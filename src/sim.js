// The simulation: crew state machines, job scheduling, the day loop, the economy. Fixed timestep, no DOM.
// Everything visible is derived from this state; the renderer and UI only read it.

import { FEEL, PAY, UPGRADES, PATTERNS } from './config.js';
import { AREAS, NAV, region, RG, dist } from './geometry.js';
import { mowRoute, dragRoute, rakeRoute, chalkRoute, routeLength } from './routes.js';
import { GameDay } from './gameday.js';

export const ST = {
  IDLE: 'IDLE', ASSIGNED: 'ASSIGNED', TO_EQUIP: 'TRAVELING_TO_EQUIPMENT', COLLECT: 'COLLECTING_EQUIPMENT', TO_WORK: 'TRAVELING_TO_WORK',
  WORKING: 'WORKING', FINISHING: 'FINISHING', RETURNING: 'RETURNING_EQUIPMENT', AVAILABLE: 'AVAILABLE',
};

export const JOBS = {
  'mow:outfield': { area: 'outfield', type: 'mow', equip: 'rider', label: 'Mow the outfield', doing: 'Mowing the outfield', patterned: true },
  'mow:infield': { area: 'infield', type: 'mow', equip: 'push', label: 'Mow the infield', doing: 'Mowing the infield', patterned: true },
  'mow:foul': { area: 'foul', type: 'mow', equip: 'rider', label: 'Mow foul territory', doing: 'Mowing foul territory' },
  'drag:skin': { area: 'skin', type: 'drag', equip: 'mat', label: 'Drag the infield', doing: 'Dragging the infield' },
  'rake:mound': { area: 'mound', type: 'rake', equip: 'rake', label: 'Rake mound & plate', doing: 'Raking the mound' },
  'chalk:lines': { area: 'lines', type: 'chalk', equip: 'chalker', label: 'Chalk the lines', doing: 'Chalking the lines' },
};
export const JOB_OF_AREA = Object.fromEntries(Object.entries(JOBS).map(([k, j]) => [j.area, k]));
export const EQUIP_NAME = { rider: 'riding mower', push: 'reel mower', mat: 'drag mat', rake: 'rake', chalker: 'chalker' };

const CREW = [
  { id: 'gus', name: 'Gus', bio: 'Veteran. Unhurried. Proud of his stripes.', pace: 0.94 },
  { id: 'frankie', name: 'Frankie', bio: 'Quick, cheerful, easily distracted.', pace: 1.08 },
  { id: 'pearl', name: 'Pearl', bio: 'Tall, quiet, never misses a spot.', pace: 1.0 },
];

export function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Sim {
  constructor(surface, emit = () => {}) {
    this.surface = surface; this.emit = emit;
    this.mode = 'title'; this.day = 1; this.bucks = 0; this.seed = 1948; this.speed = 1; this.time = 0;
    this.upgrades = {}; this.patterns = { outfield: 'classic', infield: 'classic' }; this.tutorial = 0;
    this.jobs = {}; this.equip = { rider: null, push: null, mat: null, rake: null, chalker: null };
    this.paid = {}; this.earned = 0; this.doneToday = 0; this.stripes = 0; this.light = 'morning';
    this.workers = []; this.gameday = null; this.summary = null; this.gather = null; this.record = { w: 0, l: 0 };
    this.rng = mulberry(this.seed); this._statT = 0; this.cond = null;
    this._crew();
  }

  _crew() {
    const want = this.upgrades.crew3 ? 3 : 2;
    while (this.workers.length < want) { const c = CREW[this.workers.length], h = NAV.idle[this.workers.length];
      this.workers.push({ ...c, x: h[0], y: h[1], px: h[0], py: h[1], home: h, face: this.workers.length === 1 ? -1 : 1, state: ST.IDLE, job: null, equip: null, path: null, pi: 0, timer: 0, moving: false, heading: [1, 0], step: 0, pose: 'stand', idleT: 2 + this.workers.length * 2.3, workT: 0, hop: 0 }); }
  }

  // ---- reading -----------------------------------------------------------------------------------------

  refresh() { this.cond = this.surface.stats(); return this.cond; }
  worker(id) { return this.workers.find((w) => w.id === id); }
  freeWorker(near) { const free = this.workers.filter((w) => w.state === ST.IDLE); if (!free.length) return null; return near ? free.sort((a, b) => dist([a.x, a.y], near) - dist([b.x, b.y], near))[0] : free[0]; }
  patternsOwned() { return PATTERNS.filter((p) => !p.needs || this.upgrades[p.needs]); }
  /** Why a job cannot start right now, or null when it can. */
  blocked(key, workerId) {
    const def = JOBS[key]; if (!def) return 'No such job';
    if (this.mode !== 'day') return 'Not during the game';
    if (this.jobs[key]) return `${this.jobs[key].worker.name} is on it`;
    const holder = this.equip[def.equip]; if (holder) return `${this.worker(holder).name} has the ${EQUIP_NAME[def.equip]}`;
    const w = workerId ? this.worker(workerId) : this.freeWorker(); if (!w || w.state !== ST.IDLE) return workerId && w ? `${w.name} is busy` : 'Crew is busy';
    return null;
  }
  jobProgress(job) { return job.total ? Math.min(1, job.done / job.total) : 0; }
  statusOf(w) {
    const j = w.job, d = j && JOBS[j.key];
    switch (w.state) {
      case ST.ASSIGNED: case ST.TO_EQUIP: return `Fetching the ${EQUIP_NAME[d.equip]}`;
      case ST.COLLECT: return `Getting the ${EQUIP_NAME[d.equip]} ready`;
      case ST.TO_WORK: return `Heading out to ${AREAS[d.area].label.toLowerCase()}`;
      case ST.WORKING: return `${d.doing} · ${Math.round(this.jobProgress(j) * 100)}%`;
      case ST.FINISHING: return 'Finishing touches';
      case ST.RETURNING: return `Putting the ${EQUIP_NAME[w.equip] || 'gear'} away`;
      case ST.AVAILABLE: return 'Done. Dusting off';
      default: return w.moving ? 'Walking back to the shed' : w.pose === 'sip' ? 'Coffee break' : w.pose === 'stretch' ? 'Stretching' : w.pose === 'wave' ? 'Waving at the scoreboard' : w.pose === 'look' ? 'Looking over the field' : 'Ready for a job';
    }
  }

  // ---- commands ----------------------------------------------------------------------------------------

  start() { if (this.mode === 'title') { this.mode = 'day'; this.emit('start'); } }

  assign(workerId, key, pattern) {
    const why = this.blocked(key, workerId); if (why) return { ok: false, reason: why };
    const def = JOBS[key], w = workerId ? this.worker(workerId) : this.freeWorker(NAV.door);
    if (def.patterned) { const owned = this.patternsOwned().map((p) => p.id); pattern = owned.includes(pattern) ? pattern : this.patterns[def.area] || 'classic'; this.patterns[def.area] = pattern; }
    const W = def.equip === 'rider' ? FEEL.RIDER_WIDTH : FEEL.PUSH_WIDTH;
    const plan = def.type === 'mow' ? mowRoute(def.area, pattern, W) : def.type === 'drag' ? dragRoute() : def.type === 'rake' ? rakeRoute() : chalkRoute();
    const job = { key, type: def.type, area: def.area, areaId: AREAS[def.area].id, pattern, worker: w, segs: plan.segs, parityAt: plan.parityAt, si: 0, sd: 0, pass: 1, total: routeLength(plan.segs), done: 0, age: 0 };
    this.jobs[key] = job; this.equip[def.equip] = w.id; w.job = job; w.state = ST.ASSIGNED; w.timer = FEEL.ASSIGN_HOP; w.hop = 1; w.pose = 'stand'; w.path = null;
    // onboarding: 0 mow something, 1 watch the first stripe, 2 send a second job, 3 open the gates when happy, 4 done
    if (this.tutorial === 0 && def.type === 'mow') this.tutorial = 1; else if (this.tutorial === 1 || this.tutorial === 2) this.tutorial = 3;
    this.emit('assign', { worker: w, job }); return { ok: true, worker: w, job };
  }

  cancel(workerId) {
    const w = this.worker(workerId); if (!w || !w.job) return false; const job = w.job, def = JOBS[job.key];
    delete this.jobs[job.key]; w.job = null;
    if (w.equip) { w.state = ST.RETURNING; w.path = this._pathTo(w, NAV.park[w.equip]); w.pi = 0; }
    else { this.equip[def.equip] = null; this._goIdle(w); }
    this.emit('cancel', { worker: w, job }); return true;
  }

  buy(id) {
    const u = UPGRADES.find((x) => x.id === id); if (!u || this.upgrades[id] || this.bucks < u.cost) return false;
    this.bucks -= u.cost; this.upgrades[id] = true; this._crew();
    const spot = id === 'mower' ? NAV.park.rider : id === 'mat' ? NAV.park.mat : null;
    if (spot) { this.gather = { at: spot, t: 5 }; this.workers.filter((w) => w.state === ST.IDLE).forEach((w, i) => { w.path = this._pathTo(w, [spot[0] + 12 + i * 9, spot[1] - 6 - i * 3]); w.pi = 0; }); }
    this.emit('buy', { id }); return true;
  }

  /** The field-ready action. Returns what is still unfinished so the UI can ask "open anyway?". */
  gateCheck() { const c = this.refresh(), busy = this.workers.filter((w) => w.job).length; return { field: c.field, busy, unfinished: c.field < 0.9 || busy > 0 }; }
  openGates() {
    if (this.mode !== 'day') return false;
    this.workers.forEach((w) => { if (w.job) this.cancel(w.id); });
    this.tutorial = 4; this.mode = 'gameday'; this.gameday = new GameDay(this); this.emit('gates'); return true;
  }
  nextDay() {
    if (this.mode !== 'summary') return false;
    this.day++; this.surface.wear(this.seed, this.day); this.paid = {}; this.earned = 0; this.doneToday = 0; this.stripes = 0; this.gameday = null; this.summary = null; this.light = 'morning'; this.mode = 'day';
    this.workers.forEach((w) => { w.x = w.px = w.home[0]; w.y = w.py = w.home[1]; w.path = null; w.state = ST.IDLE; w.pose = 'stand'; w.moving = false; w.idleT = 1 + this.rng() * 4; });
    this.refresh(); this.emit('newday'); return true;
  }

  // ---- the step ----------------------------------------------------------------------------------------

  step(dt) {
    this.time += dt;
    for (const w of this.workers) { w.px = w.x; w.py = w.y; this._worker(w, dt); }
    if (this.gather && (this.gather.t -= dt) <= 0) { this.gather = null; this.workers.filter((w) => w.state === ST.IDLE).forEach((w) => this._goIdle(w)); }
    if (this.mode === 'gameday') this.gameday.step(dt);
    if (this.mode === 'day' && this.light === 'morning' && (this.doneToday >= 2 || this.stripes >= 8)) this.light = 'afternoon';
    if ((this._statT -= dt) <= 0) { this._statT = 0.5; this.refresh(); }
  }

  _inside(w) { return region(w.x, w.y) !== RG.OUT; }
  /** A walkable path: the park is open ground, the wall is crossed only at the gate by the shed. */
  _pathTo(w, target) {
    const inNow = this._inside(w), inThen = region(target[0], target[1]) !== RG.OUT;
    if (inNow === inThen) return [target];
    return inNow ? [NAV.gateIn, NAV.gateOut, target] : [NAV.gateOut, NAV.gateIn, target];
  }
  _goIdle(w) { w.state = ST.IDLE; w.pose = 'stand'; w.path = this._pathTo(w, w.home); w.pi = 0; w.idleT = 1.5 + this.rng() * 3; }

  _move(w, speed, dt) {
    let left = speed * dt; w.moving = true;
    while (left > 0 && w.path && w.pi < w.path.length) { const p = w.path[w.pi], d = Math.hypot(p[0] - w.x, p[1] - w.y);
      if (d <= left) { w.x = p[0]; w.y = p[1]; left -= d; w.pi++; } else { const ux = (p[0] - w.x) / d, uy = (p[1] - w.y) / d; w.x += ux * left; w.y += uy * left; w.heading = [ux, uy]; if (Math.abs(ux) > 0.15) w.face = ux > 0 ? 1 : -1; left = 0; } }
    w.step += speed * dt; if (!w.path || w.pi >= w.path.length) { w.path = null; w.moving = false; return true; } return false;
  }

  _speeds(w) {
    const e = w.equip, pace = w.pace;
    const work = e === 'rider' ? FEEL.RIDER_SPEED * (this.upgrades.mower ? FEEL.RIDER_PRO_MULT : 1) : e === 'push' ? FEEL.PUSH_SPEED * pace : e === 'mat' ? FEEL.MAT_SPEED * (this.upgrades.mat ? FEEL.MAT_PRO_MULT : 1) * pace : e === 'rake' ? FEEL.RAKE_SPEED * pace : FEEL.CHALK_SPEED * pace;
    const travel = e === 'rider' ? work : e ? FEEL.CARRY_SPEED * pace : FEEL.WALK_SPEED * pace;
    return { work, travel, link: e === 'rider' ? work * FEEL.TURN_SLOW : e === 'push' ? work : travel };
  }

  _worker(w, dt) {
    const job = w.job, def = job && JOBS[job.key], hurry = this.mode === 'gameday' ? 1.7 : 1; w.moving = false; if (w.hop > 0) w.hop = Math.max(0, w.hop - dt / FEEL.ASSIGN_HOP); if (w.cheer > 0) w.cheer -= dt;
    switch (w.state) {
      case ST.IDLE:
        if (w.path) { this._move(w, FEEL.WALK_SPEED * w.pace * hurry, dt); w.pose = 'stand'; break; }
        if ((w.idleT -= dt) <= 0) this._idle(w); break;
      case ST.ASSIGNED:
        if ((w.timer -= dt) <= 0) { w.state = ST.TO_EQUIP; w.path = this._pathTo(w, NAV.park[def.equip]); w.pi = 0; } break;
      case ST.TO_EQUIP:
        if (this._move(w, FEEL.WALK_SPEED * w.pace, dt)) { w.state = ST.COLLECT; w.timer = FEEL.COLLECT_TIME; } break;
      case ST.COLLECT:
        if ((w.timer -= dt) <= 0) { w.equip = def.equip; w.state = ST.TO_WORK; w.path = this._pathTo(w, job.segs[0].a); w.pi = 0; this.emit('collect', { worker: w }); } break;
      case ST.TO_WORK:
        if (this._move(w, this._speeds(w).travel, dt)) { w.state = ST.WORKING; this.emit('workstart', { worker: w, job }); } break;
      case ST.WORKING: this._work(w, job, dt); break;
      case ST.FINISHING:
        this.surface.finishSweep(job, dt / FEEL.FINISH_TIME);
        if ((w.timer -= dt) <= 0) { this.surface.finishSweep(job, 1); this._complete(w, job); } break;
      case ST.RETURNING:
        if (this._move(w, this._speeds(w).travel * hurry, dt)) { w.state = ST.AVAILABLE; w.timer = FEEL.RETURN_TIME; } break;
      case ST.AVAILABLE:
        if ((w.timer -= dt) <= 0) { if (w.equip) { this.equip[w.equip] = null; this.emit('returned', { worker: w, equip: w.equip }); w.equip = null; } this._goIdle(w); } break;
    }
  }

  _work(w, job, dt) {
    const sp = this._speeds(w), S = this.surface; let budget = dt; w.workT += dt; job.age += dt;
    while (budget > 1e-6 && job.si < job.segs.length) {
      const seg = job.segs[job.si], len = dist(seg.a, seg.b), speed = seg.work ? sp.work : sp.link, room = len - job.sd, go = Math.min(room, speed * budget);
      const ux = len ? (seg.b[0] - seg.a[0]) / len : 0, uy = len ? (seg.b[1] - seg.a[1]) / len : 0, d0 = job.sd, d1 = job.sd + go;
      if (seg.work && seg.pass === 2 && job.pass === 1) { job.pass = 2; S.beginSecondPass(job.areaId); }
      w.x = seg.a[0] + ux * d1; w.y = seg.a[1] + uy * d1; if (len) { w.heading = [ux, uy]; if (Math.abs(ux) > 0.15) w.face = ux > 0 ? 1 : -1; }
      if (seg.work) {
        if (job.type === 'mow') { const va = seg.a[0] * seg.dir[0] + seg.a[1] * seg.dir[1], sgn = (ux * seg.dir[0] + uy * seg.dir[1]) >= 0 ? 1 : -1; S.cutLane(job.areaId, seg.dir, seg.W, seg.k, va + sgn * (d0 - 0.6), va + sgn * (d1 + 0.6), seg.pass); }
        else if (job.type === 'drag') S.groom(job.areaId, w.x - ux * 3.5, w.y - uy * 3.5, this.upgrades.mat ? FEEL.MAT_PRO_RADIUS : FEEL.MAT_RADIUS);
        else if (job.type === 'rake') S.groom(job.areaId, w.x, w.y, 6.8);
        else S.chalkAt(w.x, w.y, 1.7);
      }
      job.sd = d1; job.done += go; budget -= speed > 0 ? go / speed : budget; w.step += go; w.moving = true; w.working = seg.work;
      if (job.sd >= len - 1e-6) {
        if (seg.work && seg.endOfLane) { if (job.type === 'mow') { this.stripes++; job.lanes = (job.lanes || 0) + 1; if (this.tutorial === 1) this.tutorial = 2; } this.emit('stripe', { seg, job, worker: w }); }
        job.si++; job.sd = 0;
      }
    }
    if (job.si >= job.segs.length) { w.state = ST.FINISHING; w.timer = FEEL.FINISH_TIME; w.working = false; w.pose = 'stand'; }
  }

  _complete(w, job) {
    delete this.jobs[job.key]; w.job = null; this.doneToday++;
    const pay = this.paid[job.key] ? 0 : PAY[job.key]; this.paid[job.key] = true; this.bucks += pay; this.earned += pay;
    w.state = ST.RETURNING; w.path = this._pathTo(w, NAV.park[w.equip]); w.pi = 0; w.cheer = 1.6;
    this.refresh(); this.emit('jobdone', { worker: w, job, pay });
  }

  _idle(w) {                                                          // small unsynchronised idle business
    const r = this.rng(), others = this.workers.filter((o) => o !== w && o.state === ST.IDLE && !o.path);
    if (w.pose !== 'stand') { w.pose = 'stand'; w.idleT = 3 + this.rng() * 6; return; }
    if (w.id === 'gus') w.pose = r < 0.45 ? 'sip' : r < 0.75 ? 'look' : 'lean';
    else if (w.id === 'frankie') w.pose = r < 0.35 ? 'stretch' : r < 0.7 ? 'wave' : 'look';
    else w.pose = r < 0.4 ? 'look' : r < 0.7 ? 'stretch' : 'sip';
    if (w.pose === 'sip' && others.length && this.rng() < 0.5) { const o = others[0]; o.pose = 'sip'; o.idleT = 3.2; o.face = o.x < w.x ? 1 : -1; w.face = -o.face; this.emit('break', {}); }
    if (w.pose === 'look' || w.pose === 'wave') w.face = 1;
    w.idleT = 2.4 + this.rng() * 1.8;
  }

  // ---- persistence -------------------------------------------------------------------------------------

  toSave() { return { day: this.day, bucks: this.bucks, seed: this.seed, upgrades: this.upgrades, patterns: this.patterns, tutorial: this.tutorial, paid: this.paid, earned: this.earned, doneToday: this.doneToday, light: this.light === 'afternoon' ? 'afternoon' : 'morning', record: this.record, field: this.surface.serialize() }; }
  fromSave(s) {
    const num = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? v : d);
    this.day = Math.floor(num(s.day, 1, 1e6, 1)); this.bucks = Math.floor(num(s.bucks, 0, 1e9, 0)); this.seed = Math.floor(num(s.seed, 0, 2 ** 31, 1948));
    this.upgrades = {}; for (const u of UPGRADES) if (s.upgrades && s.upgrades[u.id] === true) this.upgrades[u.id] = true;
    const ok = this.patternsOwned().map((p) => p.id); for (const a of ['outfield', 'infield']) this.patterns[a] = s.patterns && ok.includes(s.patterns[a]) ? s.patterns[a] : 'classic';
    this.tutorial = Math.floor(num(s.tutorial, 0, 4, 0)); this.paid = {}; for (const k in JOBS) if (s.paid && s.paid[k]) this.paid[k] = true;
    this.earned = Math.floor(num(s.earned, 0, 1e9, 0)); this.doneToday = Math.floor(num(s.doneToday, 0, 99, 0)); this.light = s.light === 'afternoon' ? 'afternoon' : 'morning';
    this.record = { w: Math.floor(num(s.record && s.record.w, 0, 1e6, 0)), l: Math.floor(num(s.record && s.record.l, 0, 1e6, 0)) };
    this.surface.deserialize(s.field); this.rng = mulberry(this.seed + this.day * 7919); this._crew(); this.refresh();
  }
}
