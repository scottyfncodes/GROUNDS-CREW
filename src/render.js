// The renderer: Cloverfield Park as a model on a tabletop. An oblique camera (no perspective, so a tap maps back
// to an exact spot on the ground), the field surface as one image, everything upright sorted far-to-near,
// and four lighting states blended over the top.

import { PAL, FEEL } from './config.js';
import { BOUNDS, RES, GW, GH, S2, BASE, FIRST, SECOND, THIRD, MOUND, WALL_H, SHED, NAV, GATE_T, fenceR, foulW, linePt, region, RG, AREAS, clamp, lerp } from './geometry.js';
import { hash2, wx, wy } from './surface.js';
import { patternParity } from './routes.js';
import { ST } from './sim.js';
import { CHARS, heightOf, drawPerson, drawRider, drawPush, drawChalker, drawRakeParked, drawBird, drawCat, bakeCanopy, plotter } from './sprites.js';

const K = 0.8;                                          // ground foreshortening of the oblique view
const LIGHTS = ['morning', 'afternoon', 'golden', 'night'];
const SHADOW = { morning: [-0.75, 0.42, 0.2], afternoon: [0.16, 0.26, 0.26], golden: [1.15, -0.2, 0.3], night: [0.05, 0.16, 0.2] };
const FAN_COLORS = [PAL.vintageCream, PAL.brickRed, PAL.fadedNavy, PAL.sunFadedOrange, PAL.skyBlue, PAL.brassYellow, '#ffffff', PAL.tree];
const TOWERS = [[-258, 262], [258, 262], linePt(-1, 58, 128), linePt(1, 58, 128)];
const BOARD = { x: -62, w: 124, y: 440, z: 26, h: 48 };

export class Renderer {
  constructor(canvas, sim, surface) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.sim = sim; this.surface = surface;
    this.cam = { x: 0, y: 190, s: 0.74 }; this.director = true; this.speed = 1; this.cat = { state: 'off', t: 18, a: 0, dir: 1, step: 0 }; this.walkers = []; this.walkT = 0; this.fw = []; this.teams = {}; this.to = { ...this.cam }; this.home = { ...this.cam }; this.insets = { top: 60, bottom: 100 }; this.follow = null; this.userMoved = false;
    this.L = { morning: 1, afternoon: 0, golden: 0, night: 0 }; this.lamps = 0;
    this.parts = []; this.sparks = []; this.sheens = []; this.flash = 0; this.floats = []; this.routeFx = null; this.hint = null; this.preview = null; this.selected = null; this.overlays = {};
    this.dpr = 1; this.slow = 0; this.t = 0; this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._scenery(); this.resize();
  }

  // ---- camera ------------------------------------------------------------------------------------------

  resize() {
    const cv = this.cv, w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, cap = this.slow > 2 ? 1.5 : this.slow > 1 ? 2 : 3;
    this.dpr = Math.min(devicePixelRatio || 1, cap); this.vw = w; this.vh = h; cv.width = Math.round(w * this.dpr); cv.height = Math.round(h * this.dpr); this.frame();
  }
  /** The default framing for this screen: the park fills the width in portrait and the height in landscape. */
  frame(insets) {
    if (insets) this.insets = insets; const { top, bottom } = this.insets, avail = Math.max(160, this.vh - top - bottom);
    let s = Math.min(this.vw / 530, avail / 545), y = 188; if (s < 0.46) { s = 0.46; y = 150; }
    this.home = { x: 0, y, s }; this.minS = Math.min(s, Math.min(this.vw / 600, avail / 600)) * 0.92;
    if (!this.userMoved) { this.to = { ...this.home }; if (!this._framed) { this.cam = { ...this.home }; this._framed = true; } }
  }
  reset() { this.userMoved = false; this.follow = null; this.to = { ...this.home }; }
  /** Tonight's visitors wear their own colours. */
  _team(team) { if (team === 'home') return CHARS.home; const c = this.sim.card.opp.color; return this.teams[c] || (this.teams[c] = { ...CHARS.away, cap: c, stripe: c }); }
  /** Flower beds, once bought: by the gates, the scoreboard and the concessions stand. */
  beds() { if (this._beds) return this._beds; const mk = (x, y, w, d, seed) => { const f = []; for (let i = 0; i < w * d / 5; i++) f.push({ x: x + 1 + hash2(i, seed, 3) * (w - 2), y: y + 1 + hash2(i, seed, 5) * (d - 2), c: ['#d94f4f', '#f2c94c', '#f7f3e8', '#e48fb0', '#d94f4f'][Math.floor(hash2(i, seed, 7) * 5)] }); return { x, y, w, d, f }; };
    return (this._beds = [mk(-46, -150, 16, 5, 1), mk(30, -150, 16, 5, 2), mk(-50, 432, 22, 5, 3), mk(28, 432, 22, 5, 4), mk(146, -84, 36, 4, 5), mk(-276, 136, 30, 4, 6)]); }
  /**
   * The director: while nobody is steering the camera, it frames the work that is happening, close enough to see the
   * grass change and the crew's hands, and drifts back to the whole park when the crew is idle. Returns true when it is framing work.
   */
  direct() {
    const sim = this.sim; if (this.follow || this.userMoved || !this.director || sim.mode !== 'day') return false;
    const act = sim.workers.filter((w) => w.job && (w.state === ST.TO_WORK || w.state === ST.WORKING || w.state === ST.FINISHING) && region(w.x, w.y) !== RG.OUT);
    if (!act.length) { this.to = { ...this.home }; return false; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const w of act) { const ahead = [w.x + w.heading[0] * 34, w.y + w.heading[1] * 34]; for (const p of [[w.x, w.y], ahead]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
    const fast = 1 + 0.3 * Math.max(0, (this.speed || 1) - 1), padX = 80 * fast, padY = 64 * fast, bw = Math.max(250 * fast, x1 - x0 + padX * 2), bh = Math.max(200 * fast, y1 - y0 + padY * 2);
    const avail = Math.max(160, this.vh - this.insets.top - this.insets.bottom), s = clamp(Math.min(this.vw / bw, avail / (bh * K)), this.home.s, this.home.s * 2.4);
    this.to = { x: clamp((x0 + x1) / 2, -215, 215), y: clamp((y0 + y1) / 2 + 6, -20, 360), s }; return true;
  }
  clearFx() { this.parts.length = this.sparks.length = this.sheens.length = this.floats.length = 0; this.routeFx = null; }
  /** Jump the camera to where it is heading (used after time is skipped). */
  snap() { if (this.follow) { const w = this.sim.worker(this.follow); if (w) { this.to.x = w.x; this.to.y = w.y + 14; this.to.s = Math.max(this.to.s, this.home.s * 1.9); } } this.cam = { ...this.to }; }
  panBy(dx, dy) { this.follow = null; this.userMoved = true; this.to.x = clamp(this.to.x - dx / this.cam.s, -270, 270); this.to.y = clamp(this.to.y + dy / (this.cam.s * K), -110, 450); this.cam.x = this.to.x; this.cam.y = this.to.y; }
  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy); this.userMoved = true; const s = clamp(this.cam.s * factor, this.minS, FEEL.ZOOM_MAX); this.cam.s = this.to.s = s;
    const after = this.toWorld(sx, sy); this.cam.x = this.to.x = clamp(this.cam.x + before[0] - after[0], -270, 270); this.cam.y = this.to.y = clamp(this.cam.y + before[1] - after[1], -110, 450);
  }
  focus(p, s) { this.userMoved = true; this.to.x = p[0]; this.to.y = p[1]; if (s) this.to.s = Math.max(this.to.s, s); }
  get cyS() { return this.insets.top + (this.vh - this.insets.top - this.insets.bottom) / 2; }
  sx(x) { return this.vw / 2 + (x - this.cam.x) * this.cam.s; }
  sy(y, z = 0) { return this.cyS - (y - this.cam.y) * this.cam.s * K - z * this.cam.s; }
  toWorld(px, py) { return [(px - this.vw / 2) / this.cam.s + this.cam.x, this.cam.y - (py - this.cyS) / (this.cam.s * K)]; }
  /** Screen box of a worker, for picking. */
  workerBox(w) { const u = FEEL.SPRITE_FT * this.cam.s, hgt = (heightOf(CHARS[w.id]) + (w.equip === 'rider' ? 5 : 0)) * u, x = this.sx(w.x), y = this.sy(w.y); return { x0: x - 8 * u, x1: x + 8 * u, y0: y - hgt, y1: y + 2 * u, cx: x, cy: y - hgt / 2 }; }

  // ---- static scenery ----------------------------------------------------------------------------------

  _scenery() {
    const arc = (a0, a1, off, n) => { const out = []; for (let i = 0; i <= n; i++) { const th = a0 + (a1 - a0) * i / n, r = fenceR(clamp(th, -Math.PI / 4, Math.PI / 4)) + off; out.push([Math.sin(th) * r, Math.cos(th) * r]); } return out; };
    this.lot = arc(-0.95, 0.95, 62, 44).concat([[275, 110], [186, -62], [96, -137], [-96, -137], [-186, -62], [-275, 110]]);
    this.fence = arc(-Math.PI / 4, Math.PI / 4, 0, 48);
    const side = (sg) => { const p = []; for (let t = 0; t <= 330; t += 11) p.push({ p: linePt(sg, t, foulW(t)), t }); return p; };
    this.sideL = side(-1); this.sideR = side(1);
    this.backstop = []; for (let a = -45; a <= 45; a += 7.5) { const r = a * Math.PI / 180; this.backstop.push([Math.sin(r) * 62, -Math.cos(r) * 62]); }
    // grandstand: five tiers wrapping behind home plate, stepping up and away from the field
    const standPath = (d) => { const p = []; for (let t = 105; t >= 0; t -= 15) p.push(linePt(-1, t, d)); for (let a = -37.5; a <= 37.5; a += 7.5) { const r = a * Math.PI / 180; p.push([Math.sin(r) * d, -Math.cos(r) * d]); } for (let t = 0; t <= 105; t += 15) p.push(linePt(1, t, d)); return p; };
    this.tiers = []; for (let i = 0; i < 5; i++) this.tiers.push({ inner: standPath(66 + i * 9), outer: standPath(75 + i * 9), z: 2 + i * 3.5, col: i & 1 ? '#c9bfa4' : '#d3c9ae', seat: i < 2 ? PAL.brickRed : PAL.seatBlue });
    this.standBack = standPath(118); this.standRim = standPath(111);
    const bl = (off) => { const p = []; for (let t = 128; t <= 200; t += 12) p.push(linePt(1, t, foulW(t) + off)); return p; };
    this.bleachers = []; for (let i = 0; i < 3; i++) this.bleachers.push({ inner: bl(5 + i * 7), outer: bl(12 + i * 7), z: 2 + i * 3.5, col: i & 1 ? '#9c7d58' : '#ab8b63', plank: true });
    // fans: a seat every few feet on every tier, each with its own arrival time and colour
    this.fans = []; this.seats = []; const seat = (path, z, n0, col) => { let c = 0; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(len / 5.2); for (let k = 0; k < n; k++) { const f = (k + 0.5) / n, id = this.fans.length + n0; if (col && ++c % 9 === 0) continue; if (col) this.seats.push({ x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), z, c: col }); this.fans.push({ x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), z, u: hash2(id, 5, 11), c: FAN_COLORS[Math.floor(hash2(id, 9, 3) * FAN_COLORS.length)], ph: hash2(id, 2, 8) * 6.28 }); } } };
    this.tiers.forEach((t, i) => seat(standPath(70.5 + i * 9), t.z, i * 1000, t.seat)); this.bleachers.forEach((t, i) => seat(bl(8.5 + i * 7), t.z, 9000 + i * 100, null));
    // upright things, each with the y it is sorted by
    const U = this.uprights = [];
    for (let i = 0; i < 19; i++) { const th = -0.93 + i * 0.103, r = fenceR(clamp(th, -0.785, 0.785)) + 38 + hash2(i, 3, 1) * 22; if (Math.abs(th) < 0.2 || (Math.abs(th) > 0.7 && Math.abs(th) < 0.86)) continue; U.push({ kind: 'tree', x: Math.sin(th) * r, y: Math.cos(th) * r, R: 6 + Math.floor(hash2(i, 9, 1) * 3), v: i % 3, ph: hash2(i, 4, 1) * 6 }); }
    [[-262, 150, 7], [240, 64, 8], [236, 30, 6], [-150, -92, 6], [128, -104, 7], [165, -92, 6]].forEach((t, i) => U.push({ kind: 'tree', x: t[0], y: t[1], R: t[2], v: i % 3, ph: i * 1.7 }));
    U.push({ kind: 'house', x: -292, y: 262, w: 26, d: 16, wall: PAL.vintageCream, roof: PAL.brickRed }, { kind: 'house', x: 262, y: 266, w: 24, d: 15, wall: '#d7cdb4', roof: PAL.fadedNavy }, { kind: 'house', x: 216, y: 318, w: 20, d: 14, wall: PAL.vintageCream, roof: PAL.weatheredWood });
    U.push({ kind: 'board', x: 0, y: BOARD.y }, { kind: 'flag', x: 114, y: 424 });
    TOWERS.forEach((p, i) => U.push({ kind: 'tower', x: p[0], y: p[1], i }));
    U.push({ kind: 'pole', x: -233.3, y: 233.3 }, { kind: 'pole', x: 233.3, y: 233.3 });
    U.push({ kind: 'dugout', side: -1, y: linePt(-1, 44, 61)[1] }, { kind: 'dugout', side: 1, y: linePt(1, 44, 61)[1] });
    U.push({ kind: 'shed', x: SHED.x, y: SHED.y }, { kind: 'stand', x: 152, y: -74 }, { kind: 'entrance', x: 0, y: -133 }, { kind: 'cart', x: -252, y: 132 });
    this.canopies = {}; this.birds = [{ at: 0, x: 0, y: 0, z: 0, t: 3, state: 'perch', from: null, flip: false }, { at: 3, x: 0, y: 0, z: 0, t: 9, state: 'perch', from: null, flip: true }];
    this.perches = [[-30, BOARD.y, BOARD.z + BOARD.h + 9], [38, BOARD.y, BOARD.z + BOARD.h + 9], [-120, fenceR(-0.33) * Math.cos(0.33), WALL_H], [SHED.x + 20, SHED.y + 8, SHED.h + 5], [150, fenceR(0.4) * Math.cos(0.4), WALL_H], [-60, 190, 0], [40, 96, 0], [TOWERS[1][0], TOWERS[1][1], 86]];
    this.perches[2][0] = Math.sin(-0.33) * fenceR(0.33); this.perches[4][0] = Math.sin(0.4) * fenceR(0.4);
    this.birds.forEach((b) => { const p = this.perches[b.at]; b.x = p[0]; b.y = p[1]; b.z = p[2]; });
    this.clouds = [0, 1, 2].map((i) => ({ x: -400 + i * 330, y: 60 + i * 130, r: 120 + i * 30, v: 5 + i * 1.6 }));
  }

  // ---- effects -----------------------------------------------------------------------------------------

  puff(x, y, z, color, n, spread, up, life) { if (this.parts.length > 260) return; for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.5) * 9, vz: up * (0.5 + Math.random()), life: life * (0.6 + Math.random() * 0.6), max: life, c: color, s: 1 }); }
  on(type, d) {
    if (type === 'stripe') { if (d.job.type === 'mow') { if (this.sheens.length > 2) this.sheens.shift(); this.sheens.push({ seg: d.seg, t: 0, first: d.first }); if (d.first) this.floats.push({ x: d.seg.lane ? d.seg.lane[d.seg.lane.length >> 1][0] : (d.seg.a[0] + d.seg.b[0]) / 2, y: d.seg.lane ? d.seg.lane[d.seg.lane.length >> 1][1] : (d.seg.a[1] + d.seg.b[1]) / 2, z: 10, t: 0, text: 'First stripe!', big: true }); } if (this.sparks.length > 3) this.sparks.shift(); if (!d.seg.lane) this.sparks.push({ a: d.seg.b, b: d.seg.a, t: 0, chalk: d.job.type === 'chalk' }); }
    else if (type === 'jobdone') { if (d.pay) this.floats.push({ x: d.worker.x, y: d.worker.y, z: 34, t: 0, text: `+${d.pay}` }); this.puff(d.worker.x, d.worker.y, 22, PAL.brassYellow, 10, 14, 16, 1.1); }
    else if (type === 'workstart') this.routeFx = null;
    else if (type === 'firework') { const pal = [['#ffd27a', '#fff3c4'], ['#ff8a7a', '#ffd0c4'], ['#9fd0ff', '#e8f4ff'], ['#b8ff9a', '#f0ffe0'], ['#e0a8ff', '#f6e8ff']][d.hue % 5]; for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2, v = 26 + Math.random() * 10; this.fw.push({ x: d.x, y: d.y, z: d.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: 1.3 + Math.random() * 0.5, c: pal[i % 2] }); } this.flash = Math.max(this.flash, 0.35); }
    else if (type === 'assign') this.routeFx = { segs: d.job.segs.filter((s) => s.work), t: 0 };
    else if (type === 'tower') { if (d.i === 3) this.flash = 1; this.puff(TOWERS[d.i][0], TOWERS[d.i][1], 82, '#fff3c4', 8, 14, 6, 0.7); }
    else if (type === 'score' || type === 'roar') for (let i = 0; i < 16; i++) { const f = this.fans[Math.floor(Math.random() * this.fans.length)]; this.puff(f.x, f.y, f.z + 8, FAN_COLORS[i % 6], 1, 2, 22, 1.2); }
  }
  overlay(key, build) { if (!this.overlays[key]) { const c = document.createElement('canvas'); c.width = GW >> 1; c.height = GH >> 1; const g = c.getContext('2d'), im = g.createImageData(c.width, c.height); build(im.data, c.width, c.height); g.putImageData(im, 0, 0); this.overlays[key] = c; } return this.overlays[key]; }
  areaOverlay(area) {
    const S = this.surface, id = AREAS[area].id;
    return this.overlay('a:' + area, (D, w, h) => { const inA = (i, j) => { if (i < 0 || j < 0 || i >= w || j >= h) return false; const q = (j * 2) * GW + i * 2; if (id === 6) return S.chalkM[q] || S.chalkM[q + 1] || S.chalkM[q + GW] || S.chalkM[q + GW + 1]; return S.area[q] === id; };
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (id === 6) { let near = false; for (let dj = -2; dj <= 2 && !near; dj++) for (let di = -2; di <= 2; di++) if (inA(i + di, j + dj)) { near = true; break; } if (!near) continue; const o = (j * w + i) * 4; D[o] = 217; D[o + 1] = 164; D[o + 2] = 65; D[o + 3] = inA(i, j) ? 0 : 190; continue; }
        if (!inA(i, j)) continue; const edge = !inA(i - 1, j) || !inA(i + 1, j) || !inA(i, j - 1) || !inA(i, j + 1) || !inA(i - 2, j) || !inA(i + 2, j) || !inA(i, j - 2) || !inA(i, j + 2), o = (j * w + i) * 4; D[o] = 255; D[o + 1] = 248; D[o + 2] = 225; D[o + 3] = edge ? 235 : 38; } });
  }
  previewOverlay(area, pattern) {
    const S = this.surface, id = AREAS[area].id, par = patternParity(area, pattern, area === 'infield' ? FEEL.PUSH_WIDTH : FEEL.RIDER_WIDTH);
    return this.overlay(`p:${area}:${pattern}`, (D, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (j * 2) * GW + i * 2; if (S.area[q] !== id) continue; const p = par(wx(i * 2), wy(j * 2)), o = (j * w + i) * 4; if (p) { D[o] = 215; D[o + 1] = 240; D[o + 2] = 160; D[o + 3] = 105; } else { D[o] = 30; D[o + 1] = 70; D[o + 2] = 40; D[o + 3] = 80; } } });
  }

  // ---- frame -------------------------------------------------------------------------------------------

  draw(alpha, dt, simDt) {
    const g = this.g, sim = this.sim, c = this.cam; this.t += dt; const t = this.t;
    if (dt > 0.026) this.slowT = (this.slowT || 0) + dt; else this.slowT = Math.max(0, (this.slowT || 0) - dt * 0.5);
    if (this.slowT > 2.5 && this.slow < 3) { this.slow++; this.slowT = 0; this.resize(); }
    // camera
    this._dt = dt;
    if (this.follow) { const w = sim.worker(this.follow); if (w) { this.to.x = w.x; this.to.y = w.y + 14; this.to.s = Math.max(this.to.s, this.home.s * 1.9); } }
    const directing = this.direct();
    const rate = directing ? 0.03 : FEEL.CAMERA_EASE, e = this.reduced ? 1 : 1 - Math.pow(1 - rate, dt * 60), es = this.reduced ? 1 : 1 - Math.pow(1 - (directing ? 0.022 : rate), dt * 60);
    c.x += (this.to.x - c.x) * e; c.y += (this.to.y - c.y) * e; c.s += (this.to.s - c.s) * es;
    for (const k of LIGHTS) { const tgt = sim.light === k ? 1 : 0, rate = dt / (this.reduced ? 0.4 : FEEL.LIGHT_SECONDS); this.L[k] = clamp(this.L[k] + clamp(tgt - this.L[k], -rate, rate), 0, 1); }
    const Lsum = LIGHTS.reduce((n, k) => n + this.L[k], 0) || 1, L = {}; for (const k of LIGHTS) L[k] = this.L[k] / Lsum;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const gd = sim.gameday, lampsT = gd ? gd.lights : 0; this.lamps += (lampsT - this.lamps) * Math.min(1, dt * 12);
    const sv = [0, 0, 0]; for (const k of LIGHTS) for (let i = 0; i < 3; i++) sv[i] += SHADOW[k][i] * L[k];
    this.surface.flush();

    const s = c.s, u = FEEL.SPRITE_FT * s, X = (x) => this.vw / 2 + (x - c.x) * s, cy = this.cyS, Y = (y, z = 0) => cy - (y - c.y) * s * K - z * s;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = PAL.table; g.fillRect(0, 0, this.vw, this.vh);
    const path = (pts, z) => { g.beginPath(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (i) g.lineTo(X(p[0]), Y(p[1], z)); else g.moveTo(X(p[0]), Y(p[1], z)); } };
    const poly = (pts, z, fill) => { path(pts, z); g.closePath(); g.fillStyle = fill; g.fill(); };
    const band = (inner, outer, z, fill) => { g.beginPath(); inner.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1], z)) : g.moveTo(X(p[0]), Y(p[1], z)))); for (let i = outer.length - 1; i >= 0; i--) g.lineTo(X(outer[i][0]), Y(outer[i][1], z)); g.closePath(); g.fillStyle = fill; g.fill(); };
    const wallFace = (pts, z0, z1, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1], z1)) : g.moveTo(X(p[0]), Y(p[1], z1)))); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(pts[i][0]), Y(pts[i][1], z0)); g.closePath(); g.fill(); };
    const box = (x, y, w, d, h, top, face, z0 = 0) => { g.fillStyle = face; g.fillRect(X(x), Y(y, z0 + h), w * s, h * s + 0.5); g.fillStyle = top; g.fillRect(X(x), Y(y + d, z0 + h), w * s, d * s * K + 0.5); };
    const shadowBox = (x, y, w, d, h) => { g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x + w), Y(y)); g.lineTo(X(x + w) + sv[0] * h * s, Y(y) + sv[1] * h * s); g.lineTo(X(x + w) + sv[0] * h * s, Y(y + d) + sv[1] * h * s); g.lineTo(X(x) + sv[0] * h * s, Y(y + d) + sv[1] * h * s); g.lineTo(X(x), Y(y + d)); g.closePath(); g.fill(); };
    const shadowBlob = (x, y, r, h) => { g.beginPath(); g.ellipse(X(x) + sv[0] * h * s * 0.5, Y(y) + sv[1] * h * s * 0.5, (r + Math.abs(sv[0]) * h * 0.5) * s, (r * 0.5 + Math.abs(sv[1]) * h * 0.5) * s, 0, 0, 6.3); g.fill(); };

    // the slab the park stands on
    g.lineJoin = 'round'; g.save(); g.translate(0, 7 * s + 3); path(this.lot); g.closePath(); g.fillStyle = g.strokeStyle = PAL.lotEdge; g.lineWidth = 26 * s; g.fill(); g.stroke(); g.restore();
    g.save(); g.translate(0, 16 * s + 8); path(this.lot); g.closePath(); g.fillStyle = g.strokeStyle = 'rgba(90,80,50,.14)'; g.lineWidth = 30 * s; g.fill(); g.stroke(); g.restore();
    path(this.lot); g.closePath(); g.fillStyle = g.strokeStyle = PAL.lot; g.lineWidth = 26 * s; g.fill(); g.stroke();
    // paths, yard and bullpen painted on the slab
    poly([[-18, -150], [18, -150], [18, -120], [-18, -120]], 0, PAL.path); poly([[-272, 52], [-176, 52], [-160, 96], [-188, 134], [-272, 134]], 0, PAL.path);
    poly([linePt(1, 226, foulW(226) + 5), linePt(1, 300, foulW(300) + 5), linePt(1, 300, foulW(300) + 22), linePt(1, 226, foulW(226) + 22)], 0, PAL.dustyCinnamon);
    g.fillStyle = PAL.chalkWhite; for (const tt of [240, 286]) { const p = linePt(1, tt, foulW(tt) + 13); g.fillRect(X(p[0]) - s, Y(p[1]) - s * 0.6, 2.4 * s, 1.2 * s); }
    // grandstand and bleachers
    this.tiers.forEach((tr, i) => { band(tr.inner, tr.outer, tr.z, tr.col); wallFace(tr.inner, i ? this.tiers[i - 1].z : 0, tr.z, '#a3987e'); });
    this.bleachers.forEach((tr, i) => { band(tr.inner, tr.outer, tr.z, tr.col); wallFace(tr.inner, i ? this.bleachers[i - 1].z : 0, tr.z, '#6b5338'); });
    { const sw = Math.max(1.2, 3 * s), sh = Math.max(1, 1.3 * s), bk = Math.max(1, 1 * s); for (const st of this.seats) { const sx = X(st.x) - sw / 2, sy = Y(st.y, st.z + 1.6); g.fillStyle = st.c; g.fillRect(sx, sy, sw, sh); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(sx, sy - bk, sw, bk); } }
    wallFace(this.standBack, 0, 26, PAL.fadedNavy); band(this.standRim, this.standBack, 26, PAL.vintageCream);
    if (sim.upgrades.bunting) { const cols = [PAL.fadedNavy, PAL.vintageCream, PAL.brickRed]; for (let i = 1; i < this.standRim.length - 1; i += 2) { const p = this.standRim[i], bx = X(p[0]), by = Y(p[1], 26); for (let k = 0; k < 3; k++) { g.fillStyle = cols[k]; g.beginPath(); g.arc(bx, by, (5 - k * 1.5) * s, 0, Math.PI); g.fill(); } } }
    // the press box over home plate
    { const pz = 26; box(-28, -132, 56, 12, 13, PAL.fadedNavy, PAL.vintageCream, pz); g.fillStyle = L.night > 0.4 ? '#ffd98a' : '#3d5470'; g.fillRect(X(-24), Y(-132, pz + 10), 48 * s, 4.5 * s); g.fillStyle = PAL.vintageCream; for (let i = 1; i < 6; i++) g.fillRect(X(-24 + i * 8) - 0.4 * s, Y(-132, pz + 10), 0.8 * s, 4.5 * s);
      g.fillStyle = PAL.brickRed; g.fillRect(X(-30), Y(-132, pz + 14.5), 60 * s, 1.6 * s); g.fillStyle = PAL.warmCharcoal; g.fillRect(X(20) - 0.4 * s, Y(-126, pz + 28), 0.8 * s, 14 * s);
      for (let i = 0; i < 4; i++) { const wv = this.reduced ? 0 : Math.sin(t * 3.1 - i) * 0.5 * s; g.fillStyle = i & 1 ? PAL.vintageCream : PAL.fadedNavy; g.fillRect(X(20) + (0.4 + i * 2.4) * s, Y(-126, pz + 28) + wv, 2.5 * s, 6 * s); } }
    for (let i = 0; i < this.standRim.length - 1; i += 2) band([this.standRim[i], this.standRim[i + 1]], [this.standBack[i], this.standBack[i + 1]], 26, PAL.brickRed);
    const crowd = gd ? gd.crowd : 0, cheer = gd ? gd.cheer : 0;
    if (crowd > 0.01) { const fu = Math.max(1.6, u * 1.25); for (const f of this.fans) { if (f.u > crowd) continue; const jump = cheer > 0.05 && !this.reduced ? Math.max(0, Math.sin(t * 9 + f.ph)) * cheer * 2.4 * s : 0, fx = X(f.x), fy = Y(f.y, f.z) - jump; g.fillStyle = f.c; g.fillRect(fx - fu / 2, fy - fu * 1.4, fu, fu * 1.4); g.fillStyle = f.ph > 3 ? PAL.skin : PAL.skinDeep; g.fillRect(fx - fu * 0.35, fy - fu * 2.1, fu * 0.7, fu * 0.7); } }

    // the field
    const S = this.surface; g.imageSmoothingEnabled = s < RES * 0.9; g.imageSmoothingQuality = 'high';
    g.drawImage(S.canvas, X(BOUNDS.x0), Y(BOUNDS.y1), GW / RES * s, GH / RES * s * K); g.imageSmoothingEnabled = false;
    const ov = (cvs, a) => { g.globalAlpha = a; g.imageSmoothingEnabled = true; g.drawImage(cvs, X(BOUNDS.x0), Y(BOUNDS.y1), GW / RES * s, GH / RES * s * K); g.imageSmoothingEnabled = false; g.globalAlpha = 1; };
    if (this.preview) ov(this.previewOverlay(this.preview.area, this.preview.pattern), 0.85);
    if (this.hint) ov(this.areaOverlay(this.hint), this.reduced ? 0.7 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2)));
    if (this.selected && AREAS[this.selected]) ov(this.areaOverlay(this.selected), 0.95);
    if (this.routeFx) { const r = this.routeFx; r.t += dt; const a = clamp(1.6 - r.t, 0, 1) * 0.75; if (a <= 0) this.routeFx = null; else { g.strokeStyle = `rgba(255,248,225,${a})`; g.lineWidth = Math.max(1, 1.2 * s); g.setLineDash([5 * s, 5 * s]); g.lineDashOffset = -t * 30; g.beginPath(); for (const sg of r.segs) { g.moveTo(X(sg.a[0]), Y(sg.a[1])); g.lineTo(X(sg.b[0]), Y(sg.b[1])); } g.stroke(); g.setLineDash([]); } }
    // a finished stripe catches the light: a flash along its whole length, then a glint that runs back down it
    for (let i = this.sheens.length - 1; i >= 0; i--) { const sh = this.sheens[i], sg = sh.seg; sh.t += dt; const dur = sh.first ? 1.5 : 0.9; if (sh.t > dur) { this.sheens.splice(i, 1); continue; }
      if (sg.lane) { const k = sh.t / dur, pts = sg.lane; g.save(); g.lineCap = 'butt'; g.lineJoin = 'round'; g.strokeStyle = `rgba(255,252,220,${(sh.first ? 0.36 : 0.2) * (1 - k)})`; g.lineWidth = sg.W * s * 0.9; g.beginPath(); pts.forEach((p, n) => (n ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();
        const gi = Math.min(pts.length - 1, Math.floor((1 - k) * (pts.length - 1))), gp = pts[gi]; g.fillStyle = `rgba(255,252,220,${0.55 * (1 - k)})`; g.beginPath(); g.ellipse(X(gp[0]), Y(gp[1]), sg.W * s * 0.6, sg.W * s * 0.35, 0, 0, 6.3); g.fill(); g.restore(); continue; }
      const k = sh.t / dur, nx = -sg.dir[1] * sg.W / 2, ny = sg.dir[0] * sg.W / 2, A = sg.b, B = sg.a, q = (p, sgn) => [X(p[0] + nx * sgn), Y(p[1] + ny * sgn)], c0 = q(A, 1), c1 = q(A, -1), c2 = q(B, -1), c3 = q(B, 1);
      const gr = g.createLinearGradient(X(A[0]), Y(A[1]), X(B[0]), Y(B[1])), base = (sh.first ? 0.34 : 0.16) * Math.max(0, 1 - k * 2.2), peak = sh.first ? 0.62 : 0.34, c = Math.min(0.98, k * 1.25), w = 0.09;
      gr.addColorStop(0, `rgba(255,252,220,${base})`); gr.addColorStop(Math.max(0, c - w), `rgba(255,252,220,${base})`); if (c < 0.98) gr.addColorStop(c, `rgba(255,252,220,${peak * (1 - k * 0.5)})`); gr.addColorStop(Math.min(1, c + w), `rgba(255,252,220,${base})`); gr.addColorStop(1, `rgba(255,252,220,${base})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.lineTo(c2[0], c2[1]); g.lineTo(c3[0], c3[1]); g.closePath(); g.fill(); }
    // bases, plate, rubber
    g.fillStyle = PAL.chalkWhite; for (const b of [FIRST, SECOND, THIRD]) { g.beginPath(); g.moveTo(X(b[0]), Y(b[1] + 2.6)); g.lineTo(X(b[0] + 2.6), Y(b[1])); g.lineTo(X(b[0]), Y(b[1] - 2.6)); g.lineTo(X(b[0] - 2.6), Y(b[1])); g.fill(); }
    g.beginPath(); g.moveTo(X(-1.7), Y(1.7)); g.lineTo(X(1.7), Y(1.7)); g.lineTo(X(1.7), Y(0)); g.lineTo(X(0), Y(-1.7)); g.lineTo(X(-1.7), Y(0)); g.fill(); g.fillRect(X(-1.6), Y(MOUND[1] + 0.5), 3.2 * s, Math.max(1, 0.9 * s));
    // little things left lying about
    const dseed = sim.seed + sim.day * 13, bth = (hash2(dseed, 1, 2) - 0.5) * 1.2, br = fenceR(bth) - 21, r0 = plotter(g, X(Math.sin(bth) * br), Y(Math.cos(bth) * br), u, false); r0(0, 0, 1, 1, PAL.chalkWhite);
    const gl = linePt(hash2(dseed, 3, 2) > 0.5 ? 1 : -1, 120 + hash2(dseed, 4, 2) * 60, 26), r1 = plotter(g, X(gl[0]), Y(gl[1]), u, false); r1(0, 0, 2, 2, PAL.weatheredWood); r1(0, 1, 1, 1, '#6b4a32');
    const r2 = plotter(g, X(17), Y(-17), u, false); r2(0, 0, 2, 2, PAL.vintageCream); r2(0, 2, 2, 1, PAL.chalkWhite); r2(0, 1, 2, 1, PAL.fadedNavy);

    // cloud shadows drifting over the model (daylight only)
    const day = L.morning + L.afternoon + L.golden * 0.5; if (day > 0.05 && !this.reduced) { g.save(); path(this.lot); g.closePath(); g.clip(); g.fillStyle = `rgba(40,60,80,${0.06 * day})`; for (const cl of this.clouds) { cl.x += cl.v * dt; if (cl.x > 520) cl.x = -520; g.beginPath(); g.ellipse(X(cl.x), Y(cl.y), cl.r * s, cl.r * s * 0.5, 0, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(X(cl.x + cl.r * 0.7), Y(cl.y + 30), cl.r * 0.7 * s, cl.r * s * 0.34, 0, 0, 6.3); g.fill(); } g.restore(); }

    if (sim.wet > 0.02) { ov(this.overlay('wet', (D, w, h) => { const S = this.surface; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (j * 2) * GW + i * 2; if (S.area[q] !== 4 && S.area[q] !== 5) continue; const o = (j * w + i) * 4; D[o] = 70; D[o + 1] = 44; D[o + 2] = 34; D[o + 3] = 120; } }), sim.wet * 0.75 * Math.min(1, 1.25 - (sim.cond ? sim.cond.areas.skin : 0)));
      for (const [px, py, pr] of [[-30, 104, 7], [44, 92, 5], [-58, 70, 4], [8, 128, 6], [-6, -4, 4]]) { const rr = pr * (0.4 + 0.6 * sim.wet); g.fillStyle = `rgba(96,118,140,${0.55 * sim.wet})`; g.beginPath(); g.ellipse(X(px), Y(py), rr * s, rr * s * K * 0.8, 0, 0, 6.3); g.fill(); g.fillStyle = `rgba(230,240,250,${0.45 * sim.wet})`; g.beginPath(); g.ellipse(X(px - rr * 0.3), Y(py + rr * 0.2), rr * s * 0.35, rr * s * 0.12, 0, 0, 6.3); g.fill(); } }
    if (sim.upgrades.flowers) for (const b of this.beds()) { g.fillStyle = '#6b4a32'; g.fillRect(X(b.x), Y(b.y + b.d), b.w * s, b.d * s * K); for (const f of b.f) { g.fillStyle = f.c; g.fillRect(X(f.x) - 0.9 * s, Y(f.y) - 0.9 * s, 1.8 * s, 1.8 * s); } }

    // ground shadows
    g.fillStyle = `rgba(30,40,50,${sv[2]})`;
    for (const o of this.uprights) { if (o.kind === 'tree') shadowBlob(o.x, o.y, o.R * 1.7, o.R * 3.4); else if (o.kind === 'house') shadowBox(o.x, o.y, o.w, o.d, 20); else if (o.kind === 'shed') shadowBox(SHED.x, SHED.y, SHED.w, SHED.d, SHED.h + 4); else if (o.kind === 'stand') shadowBox(o.x, o.y, 32, 20, 16); else if (o.kind === 'tower') shadowBlob(o.x, o.y, 2, 60); else if (o.kind === 'board') shadowBox(BOARD.x, BOARD.y, BOARD.w, 4, 50); }
    { const sh = []; this.fence.forEach((p) => sh.push(p)); g.beginPath(); sh.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); for (let i = sh.length - 1; i >= 0; i--) g.lineTo(X(sh[i][0]) + sv[0] * WALL_H * s, Y(sh[i][1]) + sv[1] * WALL_H * s); g.closePath(); g.fill(); }
    this._life(dt, simDt); const actors = this._actors(alpha);
    for (const a of actors) { if (a.kind === 'ball') { g.beginPath(); g.ellipse(X(a.x), Y(a.y), 1.6 * s, 0.9 * s, 0, 0, 6.3); g.fill(); } else shadowBlob(a.x, a.y, a.sr || 4.5, a.sh || 14); }

    // walls
    wallFace(this.fence, 0, WALL_H, PAL.fadedNavy);
    if (sim.upgrades.ivy) { if (!this.ivy) { this.ivy = []; for (let i = 0; i < this.fence.length - 1; i++) for (let k = 0; k < 7; k++) { const f = Math.random(), a = this.fence[i], b = this.fence[i + 1]; this.ivy.push({ x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), z: 1 + Math.random() * (WALL_H - 2.5), c: Math.random() < 0.5 ? '#5f9a55' : '#2f6b45' }); } }
      for (let i = 0; i < this.fence.length - 1; i++) { if (i >= 17 && i <= 18) continue; const a = this.fence[i], b = this.fence[i + 1]; g.fillStyle = '#3f7a4a'; g.beginPath(); g.moveTo(X(a[0]), Y(a[1], WALL_H - 0.6)); g.lineTo(X(b[0]), Y(b[1], WALL_H - 0.6)); g.lineTo(X(b[0]), Y(b[1], 0.4)); g.lineTo(X(a[0]), Y(a[1], 0.4)); g.fill(); }
      for (const v of this.ivy) { const th = Math.atan2(v.x, v.y); if (Math.abs(th - Math.atan2(this.fence[18][0], this.fence[18][1])) < 0.045) continue; g.fillStyle = v.c; g.fillRect(X(v.x) - 0.8 * s, Y(v.y, v.z) - 0.8 * s, 1.6 * s, 1.6 * s); } }
    sim.banners.forEach((n, k) => { const i = 9 + k * 4 + (9 + k * 4 >= 16 ? 4 : 0), m = this.fence[Math.min(this.fence.length - 2, i)], m2 = this.fence[Math.min(this.fence.length - 1, i + 1)]; g.fillStyle = PAL.brassYellow; g.beginPath(); g.moveTo(X(m[0]), Y(m[1], WALL_H - 0.5)); g.lineTo(X(m2[0]), Y(m2[1], WALL_H - 0.5)); g.lineTo(X(m2[0]), Y(m2[1], 1)); g.lineTo(X(m[0]), Y(m[1], 1)); g.fill();
      g.fillStyle = PAL.brickRed; g.font = `${Math.max(4, 4.6 * s)}px "Alfa Slab One", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`S${n}`, X((m[0] + m2[0]) / 2), Y((m[1] + m2[1]) / 2, WALL_H / 2)); });
    g.fillStyle = 'rgba(241,230,207,.2)'; if (!sim.upgrades.ivy) for (let i = 5; i < 44; i += 6) { if (i === 23) continue; const a = this.fence[i], b = this.fence[i + 2]; g.beginPath(); g.moveTo(X(a[0]), Y(a[1], 8.5)); g.lineTo(X(b[0]), Y(b[1], 8.5)); g.lineTo(X(b[0]), Y(b[1], 2.5)); g.lineTo(X(a[0]), Y(a[1], 2.5)); g.fill(); }
    { const a = this.fence[17], b = this.fence[19]; g.fillStyle = PAL.brassYellow; g.beginPath(); g.moveTo(X(a[0]), Y(a[1], 9)); g.lineTo(X(b[0]), Y(b[1], 9)); g.lineTo(X(b[0]), Y(b[1], 2)); g.lineTo(X(a[0]), Y(a[1], 2)); g.fill(); g.fillStyle = PAL.brickRed; const m = this.fence[18]; g.font = `${Math.max(4, 5 * s)}px "Alfa Slab One", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText("'58", X(m[0]), Y(m[1], 5.5)); }
    path(this.fence, WALL_H); g.strokeStyle = PAL.vintageCream; g.lineWidth = Math.max(1.2, 2 * s); g.stroke();
    g.fillStyle = PAL.vintageCream; g.font = `600 ${Math.max(5, 6 * s)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [[3, '330'], [24, '400'], [45, '330']].forEach(([i, txt]) => { const p = this.fence[i]; g.fillText(txt, X(p[0]), Y(p[1], 5.5)); });
    g.strokeStyle = PAL.fadedNavy; g.lineWidth = Math.max(2, 3.2 * s); g.lineCap = 'butt';
    for (const sd of [this.sideL, this.sideR]) { g.beginPath(); let pen = false; for (const q of sd) { const gap = sd === this.sideL && Math.abs(q.t - GATE_T) < 9; if (gap) { pen = false; continue; } if (pen) g.lineTo(X(q.p[0]), Y(q.p[1], 3)); else { g.moveTo(X(q.p[0]), Y(q.p[1], 3)); pen = true; } } g.stroke(); }
    path(this.backstop, 3); g.stroke();
    { const a = linePt(-1, GATE_T - 9, foulW(GATE_T - 9)), b = linePt(-1, GATE_T + 9, foulW(GATE_T + 9)); g.fillStyle = PAL.brassYellow; g.fillRect(X(a[0]) - s, Y(a[1], 8), 2 * s, 8 * s); g.fillRect(X(b[0]) - s, Y(b[1], 8), 2 * s, 8 * s); }

    // everything upright, far to near
    const list = this.uprights.concat(actors); list.sort((a, b) => b.y - a.y);
    for (const o of list) this._upright(o, { g, X, Y, s, u, t, L, box, poly, dt });

    // particles
    const wsp = simDt; this._emit(dt, wsp);
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.life -= dt; if (p.life <= 0) { this.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= 26 * dt; g.globalAlpha = Math.min(1, p.life / p.max * 1.6); g.fillStyle = p.c; const ps = Math.max(1.2, u * 0.75 * p.s); g.fillRect(X(p.x) - ps / 2, Y(p.y, p.z) - ps / 2, ps, ps); }
    g.globalAlpha = 1;
    for (let i = this.sparks.length - 1; i >= 0; i--) { const sp = this.sparks[i], k0 = sp.t / 0.7; sp.t += dt; const k1 = Math.min(1, sp.t / 0.7); for (let k = k0; k < k1; k += 0.07) this.parts.push({ x: lerp(sp.a[0], sp.b[0], k), y: lerp(sp.a[1], sp.b[1], k), z: 2, vx: 0, vy: 0, vz: 9, life: 0.55, max: 0.55, c: sp.chalk ? '#ffffff' : (Math.random() < 0.5 ? '#fff8d8' : PAL.sunlit), s: 1.2 }); if (k1 >= 1) this.sparks.splice(i, 1); }

    this._light(g, X, Y, s, L);
    if (this.fw.length) { g.globalCompositeOperation = 'lighter'; for (let i = this.fw.length - 1; i >= 0; i--) { const p = this.fw[i]; p.life -= dt; if (p.life <= 0) { this.fw.splice(i, 1); continue; } p.x += p.vx * dt; p.z += p.vz * dt; p.vz -= 18 * dt; p.vx *= 0.985; p.vz *= 0.985; g.globalAlpha = Math.min(1, p.life / 1.2); g.fillStyle = p.c; const ps = Math.max(1.5, 1.6 * s); g.fillRect(X(p.x) - ps / 2, Y(p.y, p.z) - ps / 2, ps, ps); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }

    // readable things on top of the light
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i], life = f.big ? 2.4 : 1.5; f.t += dt; if (f.t > life) { this.floats.splice(i, 1); continue; } g.font = `${f.big ? Math.max(20, 15 * s) : Math.max(12, 9 * s)}px "Alfa Slab One", serif`; g.globalAlpha = clamp((life - f.t) * 2, 0, 1); const pop = f.big ? 1 + Math.max(0, 0.25 - f.t) * 1.2 : 1, fx = f.big ? clamp(X(f.x), 96, this.vw - 96) : X(f.x), fy = Math.max(96, Y(f.y, f.z + f.t * (f.big ? 7 : 16))); g.lineWidth = f.big ? 5 * pop : 3; g.strokeStyle = PAL.fadedNavy; g.strokeText(f.text, fx, fy); g.fillStyle = PAL.brassYellow; g.fillText(f.text, fx, fy); } g.globalAlpha = 1;
    for (const w of sim.workers) { if (this.selected !== w.id && this.follow !== w.id) continue; const b = this.workerBox(w); g.strokeStyle = PAL.brassYellow; g.lineWidth = 2; g.beginPath(); g.ellipse(b.cx, this.sy(w.y), 9 * u * 0.9, 4 * u * 0.9, 0, 0, 6.3); g.stroke();
      if (w.job && w.state === ST.WORKING) { const pw = 26, pr = sim.jobProgress(w.job); g.fillStyle = PAL.fadedNavy; g.fillRect(b.cx - pw / 2 - 1, b.y0 - 9, pw + 2, 5); g.fillStyle = PAL.vintageCream; g.fillRect(b.cx - pw / 2, b.y0 - 8, pw, 3); g.fillStyle = PAL.brassYellow; g.fillRect(b.cx - pw / 2, b.y0 - 8, pw * pr, 3); } }
  }

  /** Workers, their machines, parked equipment, ballplayers, birds and the ball as sortable things. */
  _actors(alpha) {
    const sim = this.sim, out = [];
    for (const w of sim.workers) out.push({ kind: 'worker', w, x: lerp(w.px, w.x, alpha), y: lerp(w.py, w.y, alpha), sr: w.equip === 'rider' ? 9 : 4.5, sh: 14 });
    for (const e in NAV.park) if (!sim.equip[e] || (!sim.worker(sim.equip[e]).equip && !(e === 'rider' && sim.worker(sim.equip[e]).state === ST.COLLECT && sim.worker(sim.equip[e]).timer < FEEL.COLLECT_TIME * 0.5))) out.push({ kind: 'parked', e, x: NAV.park[e][0], y: NAV.park[e][1], sr: e === 'rider' ? 9 : 3, sh: 8 });
    for (const w of sim.workers) if (w.equip === 'mat') { const hx = w.heading[0], hy = w.heading[1]; out.push({ kind: 'mat', x: lerp(w.px, w.x, alpha) - hx * 7.5, y: lerp(w.py, w.y, alpha) - hy * 7.5 + 0.01, w, sr: 5, sh: 1 }); }
    if (sim.gameday) { for (const a of sim.gameday.actors) out.push({ kind: 'player', a, x: lerp(a.px, a.x, alpha), y: lerp(a.py, a.y, alpha), sr: 3.6, sh: 11 }); const b = sim.gameday.ball; if (b) out.push({ kind: 'ball', x: b.x, y: b.y, z: b.z }); }
    for (const b of this.birds) out.push({ kind: 'bird', b, x: b.x, y: b.y - 0.5, sr: 1.5, sh: b.z * 0.3 });
    if (this.cat.state !== 'off') { const r = fenceR(this.cat.a) + 0.5; out.push({ kind: 'cat', x: Math.sin(this.cat.a) * r, y: Math.cos(this.cat.a) * r - 0.4, sr: 1.4, sh: WALL_H }); }
    for (const f of this.walkers) out.push({ kind: 'walker', f, x: f.x, y: f.y, sr: 1.6, sh: 6 });
    return out;
  }

  _upright(o, q) {
    const { g, X, Y, s, u, t, L, box, poly } = q, sim = this.sim, night = L.night;
    switch (o.kind) {
      case 'tree': { const key = o.v + ':' + o.R, cv = this.canopies[key] || (this.canopies[key] = bakeCanopy(o.v * 77 + o.R, o.R)), sway = this.reduced ? 0 : Math.round(Math.sin(t * 0.8 + o.ph) * 0.9) * u, w = cv.width * u, x = X(o.x), y = Y(o.y);
        const h2 = cv.height >> 1, top = Math.round(y - o.R * u * 0.9 - cv.height * u * 0.86), left = Math.round(x - w / 2), mid = top + Math.round(h2 * u);
        g.fillStyle = PAL.weatheredWood; g.fillRect(Math.round(x - u), mid, Math.round(2 * u), Math.round(y) - mid);
        g.drawImage(cv, 0, h2, cv.width, cv.height - h2, left, mid, Math.round(w), Math.round((cv.height - h2) * u));
        g.drawImage(cv, 0, 0, cv.width, h2, left + sway, top, Math.round(w), mid - top); break; }
      case 'house': { const hz = 12, gz = hz + o.w * 0.36, mx = o.x + o.w / 2, roofD = '#00000033';
        g.fillStyle = o.wall; g.fillRect(X(o.x), Y(o.y, hz), o.w * s, hz * s + 0.5);
        const q4 = (pts, c) => { g.beginPath(); pts.forEach((p, n) => (n ? g.lineTo(X(p[0]), Y(p[1], p[2])) : g.moveTo(X(p[0]), Y(p[1], p[2])))); g.closePath(); g.fillStyle = c; g.fill(); };
        q4([[o.x - 1.5, o.y + o.d + 1, hz - 1], [mx, o.y + o.d + 1, gz], [mx, o.y - 1, gz], [o.x - 1.5, o.y - 1, hz - 1]], o.roof);
        q4([[mx, o.y + o.d + 1, gz], [o.x + o.w + 1.5, o.y + o.d + 1, hz - 1], [o.x + o.w + 1.5, o.y - 1, hz - 1], [mx, o.y - 1, gz]], o.roof); q4([[mx, o.y + o.d + 1, gz], [o.x + o.w + 1.5, o.y + o.d + 1, hz - 1], [o.x + o.w + 1.5, o.y - 1, hz - 1], [mx, o.y - 1, gz]], 'rgba(0,0,0,.22)');
        q4([[o.x, o.y, hz], [mx, o.y, gz - 1], [o.x + o.w, o.y, hz]], o.wall); q4([[o.x, o.y, hz], [mx, o.y, gz - 1], [o.x + o.w, o.y, hz]], 'rgba(0,0,0,.06)');
        g.fillStyle = PAL.warmCharcoal; g.fillRect(X(o.x + o.w * 0.72), Y(o.y + o.d * 0.5, gz + 2), 2.4 * s, 5 * s);
        g.fillStyle = night > 0.5 ? '#ffd98a' : PAL.fadedNavy; g.fillRect(X(o.x + 3), Y(o.y, 9), 4 * s, 4 * s); g.fillRect(X(o.x + o.w - 7), Y(o.y, 9), 4 * s, 4 * s); g.fillRect(X(mx - 1.5), Y(o.y, hz + 4.5), 3 * s, 3 * s);
        g.fillStyle = o.roof; g.fillRect(X(mx - 2), Y(o.y, 7), 4 * s, 7 * s); break; }
      case 'board': { const gd = sim.gameday, on = gd && gd.board.on, bx = X(BOARD.x), by = Y(BOARD.y, BOARD.z + BOARD.h), bw = BOARD.w * s, bh = BOARD.h * s;
        g.fillStyle = PAL.warmCharcoal; g.fillRect(X(BOARD.x + 14), Y(BOARD.y, BOARD.z), 5 * s, BOARD.z * s); g.fillRect(X(BOARD.x + BOARD.w - 19), Y(BOARD.y, BOARD.z), 5 * s, BOARD.z * s);
        g.fillStyle = '#1d3a2e'; g.fillRect(bx, by, bw, bh); g.strokeStyle = PAL.vintageCream; g.lineWidth = Math.max(1, 1.4 * s); g.strokeRect(bx + 1.5 * s, by + 1.5 * s, bw - 3 * s, bh - 3 * s);
        g.fillStyle = PAL.fadedNavy; g.fillRect(bx, by - 9 * s, bw, 9 * s); g.fillStyle = PAL.vintageCream; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.max(5, 7 * s)}px "Alfa Slab One", serif`; g.fillText('CLOVERFIELD PARK', bx + bw / 2, by - 4.3 * s);
        g.fillStyle = on ? '#ffd98a' : 'rgba(241,230,207,.82)'; g.font = `600 ${Math.max(8, 17 * s)}px "Barlow Condensed", sans-serif`;
        const hs = gd ? gd.board.home : 0, as = gd ? gd.board.away : 0; g.textAlign = 'left'; g.fillText('CLOVERS', bx + 9 * s, by + 14.5 * s); g.fillText(sim.card.opp.short.toUpperCase(), bx + 9 * s, by + 34 * s); g.textAlign = 'right'; g.fillText(String(hs), bx + bw - 10 * s, by + 14.5 * s); g.fillText(String(as), bx + bw - 10 * s, by + 34 * s);
        g.fillStyle = 'rgba(241,230,207,.35)'; g.fillRect(bx + 8 * s, by + 23.6 * s, bw - 16 * s, Math.max(1, 0.8 * s)); break; }
      case 'flag': { const x = X(o.x), top = Y(o.y, 56); g.fillStyle = PAL.warmCharcoal; g.fillRect(x - 0.6 * s, top, 1.2 * s, 56 * s); for (let i = 0; i < 5; i++) { const wv = this.reduced ? 0 : Math.sin(t * 3.4 - i * 0.9) * (0.5 + i * 0.35) * s; g.fillStyle = i < 2 ? PAL.brickRed : i < 4 ? PAL.vintageCream : PAL.brickRed; g.fillRect(x + (0.6 + i * 3.4) * s, top + wv + i * 0.3 * s, 3.5 * s, 9 * s - i * 0.6 * s); } break; }
      case 'tower': { const x = X(o.x), on = this.lamps >= (o.i + 1) / 4 - 0.01; g.fillStyle = PAL.warmCharcoal; g.fillRect(x - s, Y(o.y, 78), 2 * s, 78 * s); g.fillRect(x - 3 * s, Y(o.y, 3), 6 * s, 3 * s);
        g.fillStyle = PAL.warmCharcoal; g.fillRect(x - 9 * s, Y(o.y, 88), 18 * s, 10 * s); g.fillStyle = on ? '#fff3c4' : '#c9c2b0'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(x - 7.6 * s + i * 4 * s, Y(o.y, 86.6) + j * 4.2 * s, 3 * s, 3 * s); break; }
      case 'pole': g.fillStyle = PAL.brassYellow; g.fillRect(X(o.x) - 0.9 * s, Y(o.y, 36), 1.8 * s, 36 * s); break;
      case 'dugout': { const sg = o.side, a = linePt(sg, 44, 51), b = linePt(sg, 84, 51), c2 = linePt(sg, 84, 61), d = linePt(sg, 44, 61); poly([d, c2, [c2[0], c2[1]], [d[0], d[1]]], 0, PAL.warmCharcoal);
        g.fillStyle = PAL.warmCharcoal; g.beginPath(); g.moveTo(X(d[0]), Y(d[1], 8)); g.lineTo(X(c2[0]), Y(c2[1], 8)); g.lineTo(X(c2[0]), Y(c2[1], 0)); g.lineTo(X(d[0]), Y(d[1], 0)); g.fill();
        poly([a, b, c2, d], 8, PAL.fadedNavy); g.strokeStyle = PAL.vintageCream; g.lineWidth = Math.max(1, s); g.beginPath(); g.moveTo(X(a[0]), Y(a[1], 8)); g.lineTo(X(b[0]), Y(b[1], 8)); g.stroke();
        if (sg > 0) { const r = plotter(g, X(a[0] - 5), Y(a[1] - 3), u, false); r(0, 0, 2, 3, PAL.sunFadedOrange); r(0, 3, 2, 1, PAL.vintageCream); } break; }
      case 'shed': { const { x, y, w, d, h } = SHED; box(x, y, w, d, h, PAL.brickRed, '#d9c8a4'); g.fillStyle = '#c4b28c'; for (let i = 1; i < 6; i++) g.fillRect(X(x + i * w / 6), Y(y, h), Math.max(1, 0.5 * s), h * s);
        g.fillStyle = '#8a3c33'; for (let k = 2; k < d; k += 3) g.fillRect(X(x), Y(y + k, h), w * s, Math.max(1, 0.6 * s));
        g.fillStyle = PAL.brickRed; g.fillRect(X(x - 2), Y(y, h + 1.5), (w + 4) * s, 3 * s); g.fillStyle = '#8a3c33'; g.fillRect(X(x - 2), Y(y, h - 1.5), (w + 4) * s, Math.max(1, 0.8 * s));
        g.fillStyle = PAL.vintageCream; g.fillRect(X(x + 25), Y(y, 12), 6 * s, 5 * s); g.fillStyle = night > 0.5 ? '#ffd98a' : '#4b5d73'; g.fillRect(X(x + 25.7), Y(y, 11.3), 4.6 * s, 3.6 * s); g.fillStyle = PAL.vintageCream; g.fillRect(X(x + 27.8), Y(y, 11.3), 0.5 * s, 3.6 * s);
        g.fillStyle = PAL.weatheredWood; g.fillRect(X(x + 11), Y(y, 12), 12 * s, 12 * s); g.fillStyle = '#6b4a32'; g.fillRect(X(x + 16.6), Y(y, 12), Math.max(1, 0.8 * s), 12 * s);
        g.fillStyle = PAL.vintageCream; g.fillRect(X(x + 8), Y(y, 16.2), 18 * s, 3.4 * s); g.fillStyle = PAL.fadedNavy; g.font = `${Math.max(3, 2.9 * s)}px "Alfa Slab One", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; if (s > 1.1) g.fillText('GROUNDS', X(x + 17), Y(y, 14.5)); else for (let i = 0; i < 5; i++) g.fillRect(X(x + 10 + i * 3), Y(y, 15), 2 * s, 1.2 * s);
        const r = plotter(g, X(x + 28.5), Y(y - 0.5), u, false); r(0, 0, 3, 2, PAL.brickRed); r(1, 2, 1, 1, PAL.warmCharcoal); const r3 = plotter(g, X(x + 4), Y(y, 9), u, false); r3(0, 0, 3, 1, PAL.fadedNavy); r3(0, 1, 2, 1, PAL.fadedNavy);
        break; }
      case 'stand': box(o.x, o.y, 32, 20, 13, PAL.brassYellow, PAL.vintageCream); g.fillStyle = PAL.brickRed; for (let i = 0; i < 4; i++) g.fillRect(X(o.x + i * 8), Y(o.y, 13), 4 * s, 3 * s); g.fillStyle = night > 0.5 ? '#ffd98a' : PAL.fadedNavy; g.fillRect(X(o.x + 5), Y(o.y, 9), 22 * s, 5 * s); break;
      case 'entrance': box(-26, o.y - 6, 10, 6, 22, PAL.vintageCream, PAL.brickRed); box(16, o.y - 6, 10, 6, 22, PAL.vintageCream, PAL.brickRed); box(-26, o.y - 6, 52, 6, 8, PAL.vintageCream, PAL.fadedNavy, 22); g.fillStyle = PAL.brassYellow; g.fillRect(X(-18), Y(o.y - 6, 27.5), 36 * s, 1.6 * s); break;
      case 'cat': { const c = this.cat; drawCat(g, X(o.x), Y(o.y, WALL_H), u * 0.85, { flip: c.dir < 0, sit: c.state === 'sit', moving: c.state === 'walk', step: c.step, tail: Math.sin(t * 2) > 0.6 ? 1 : 0 }); break; }
      case 'walker': { const f = o.f, fu = Math.max(1.6, u * 1.1), fx = X(o.x), fy = Y(o.y), b = (Math.floor(f.step / 2.5) & 1) * fu * 0.5; g.fillStyle = f.c; g.fillRect(fx - fu / 2, fy - fu * 2.2 - b, fu, fu * 1.5); g.fillStyle = f.skin; g.fillRect(fx - fu * 0.4, fy - fu * 3 - b, fu * 0.8, fu * 0.8); g.fillStyle = PAL.warmCharcoal; g.fillRect(fx - fu / 2, fy - fu * 0.7, fu * 0.4, fu * 0.7 - b); g.fillRect(fx + fu * 0.1, fy - fu * 0.7 + b, fu * 0.4, fu * 0.7 - b); break; }
      case 'cart': { const r = plotter(g, X(o.x), Y(o.y), u, false); r(-4, 2, 8, 2, PAL.weatheredWood); r(-4, 4, 1, 2, PAL.weatheredWood); r(3, 4, 1, 2, PAL.weatheredWood); r(-3, 0, 2, 2, PAL.warmCharcoal); r(1, 0, 2, 2, PAL.warmCharcoal); r(4, 3, 3, 1, '#6b4a32'); r(-2, 4, 3, 1, PAL.tree); break; }
      case 'parked': { const x = X(o.x), y = Y(o.y); if (o.e === 'rider') drawRider(g, x, y, u, { view: 'side', pro: sim.upgrades.mower }); else if (o.e === 'push') drawPush(g, x - 8 * u, y, u, {}); else if (o.e === 'chalker') drawChalker(g, x - 8 * u, y, u, {}); else if (o.e === 'rake') drawRakeParked(g, x, y, u); else this._mat(g, x, y, u, sim.upgrades.mat, true); break; }
      case 'mat': { this._mat(g, X(o.x), Y(o.y), u, sim.upgrades.mat, Math.abs(o.w.heading[0]) > 0.5); g.strokeStyle = '#6b4a32'; g.lineWidth = Math.max(1, u * 0.5); g.beginPath(); g.moveTo(X(o.x), Y(o.y)); g.lineTo(X(o.x + o.w.heading[0] * 7.5) - o.w.face * 3 * u, Y(o.y + o.w.heading[1] * 7.5, 9)); g.stroke(); break; }
      case 'worker': this._worker(g, o, X, Y, u, t); break;
      case 'player': { const a = o.a, ch = this._team(a.team), pose = a.moving ? 'stand' : a.pose === 'swing' ? 'swing' : a.pose === 'throw' ? 'throw' : a.role === 'BAT' && Math.abs(a.x + 7) < 1 ? 'bat' : 'stand'; drawPerson(g, X(o.x), Y(o.y), u * 0.9, ch, pose, { flip: a.face < 0, moving: a.moving, step: a.step, t }); break; }
      case 'ball': { const bs = Math.max(2, u * 0.9); g.fillStyle = '#ffffff'; g.fillRect(X(o.x) - bs / 2, Y(o.y, o.z) - bs / 2, bs, bs); break; }
      case 'bird': drawBird(g, X(o.b.x), Y(o.b.y, o.b.z), u * 0.8, { fly: o.b.state === 'fly', t, flip: o.b.flip, peck: o.b.state === 'perch' && Math.sin(t * 2.3 + o.b.at) > 0.86 }); break;
    }
  }
  _mat(g, x, y, u, pro, wide) { const r = plotter(g, x, y, u, false), w = (pro ? 7 : 5) + (wide ? 0 : 1), c = pro ? '#8d9399' : '#6b4a32'; r(-w / 2, 0, w, 2, c); r(-w / 2, 1, w, 1, pro ? '#c5cad0' : '#8a6a48'); if (pro) for (let i = 0; i < w; i += 2) r(-w / 2 + i, 0, 1, 1, PAL.warmCharcoal); }

  _worker(g, o, X, Y, u, t) {
    const w = o.w, sim = this.sim, ch = CHARS[w.id], x = X(o.x), hop = w.hop > 0 ? Math.sin(w.hop * Math.PI) * 3 * u : 0, y = Y(o.y) - hop, flip = w.face < 0;
    const hy = w.heading[1], view = w.moving && Math.abs(hy) > 0.82 ? (hy > 0 ? 'up' : 'down') : 'side';
    const has = w.equip, cheer = w.cheer > 0, working = w.state === ST.WORKING && w.working, opt = { flip, moving: w.moving, step: w.step, t: t + w.x * 0.01, view };
    const mounting = w.state === ST.COLLECT && w.job && w.job.type === 'mow' && w.job.worker === w && NAV.park.rider && sim.equip.rider === w.id && w.timer < FEEL.COLLECT_TIME * 0.5;
    if (has === 'rider' || mounting) {
      // the machine turns smoothly through the lane ends instead of snapping round
      const target = Math.atan2(w.heading[1], w.heading[0]); if (w._vh == null) w._vh = target; let dA = target - w._vh; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
      w._vh += Math.sign(dA) * Math.min(Math.abs(dA), (this._dt || 0.016) * 5.2);
      const vx = Math.cos(w._vh), vy = Math.sin(w._vh), rv = mounting ? 'side' : Math.abs(vy) > 0.8 ? (vy > 0 ? 'up' : 'down') : 'side', fl = rv === 'side' ? (mounting ? false : vx < 0) : false;
      const ro = { view: rv, flip: fl, pro: sim.upgrades.mower, running: w.moving && !mounting, t, dist: w.step };
      const mh = mounting ? Math.sin(Math.min(1, (FEEL.COLLECT_TIME * 0.5 - w.timer) / 0.35) * Math.PI) * 2 * u : 0;
      if (rv === 'down') { drawPerson(g, x, y, u, ch, cheer ? 'cheer' : 'ride', { ...opt, flip: false, seat: 6, moving: false, view: 'down' }); drawRider(g, x, y, u, ro); }
      else { const seat = drawRider(g, x, y, u, ro); drawPerson(g, x + (rv === 'side' ? (fl ? 3 : -3) * u : 0), y - mh, u, ch, cheer ? 'cheer' : 'ride', { ...opt, flip: fl, seat: seat + 1, back: rv === 'up', moving: false }); }
      return;
    }
    w._vh = null;
    let pose = cheer ? 'cheer' : w.pose;
    if (has === 'push') { drawPush(g, x, y, u, { flip, dist: w.step }); pose = cheer ? 'cheer' : 'push'; opt.view = 'side'; }
    else if (has === 'chalker') { drawChalker(g, x, y, u, { flip, dist: w.step }); pose = cheer ? 'cheer' : 'chalk'; opt.view = 'side'; }
    else if (has === 'mat') pose = cheer ? 'cheer' : 'drag';
    else if (has === 'rake') pose = cheer ? 'cheer' : working ? 'rake' : w.moving ? 'carry' : 'lean';
    else if (w.state === ST.COLLECT) pose = 'push';
    else if (w.moving) pose = 'walk';
    drawPerson(g, x, y, u, ch, pose, opt);
    if (w.say && w.say.t > 0) this._bubble(g, x, y - (heightOf(ch) + 3) * u - hop, w.say.text, w.say.t);
  }

  /** A little speech board above a groundskeeper's head. */
  _bubble(g, x, y, text, t) {
    if (x < -10 || x > this.vw + 10 || y < 0 || y > this.vh) return;
    const a = Math.min(1, t * 3, (3.2 - (3.2 - t)) * 3); g.save(); g.globalAlpha = Math.min(1, a); g.font = '600 13px "Barlow Condensed", sans-serif'; const w = Math.ceil(g.measureText(text).width) + 14, h = 22;
    const bx = Math.round(Math.max(8, Math.min(this.vw - w - 8, x - w / 2))), by = Math.round(Math.max(this.insets.top + 4, y - h - 6));
    g.fillStyle = PAL.fadedNavy; g.fillRect(bx - 2, by - 2, w + 4, h + 6); g.fillStyle = PAL.vintageCream; g.fillRect(bx, by, w, h);
    g.beginPath(); g.moveTo(x - 5, by + h); g.lineTo(x + 5, by + h); g.lineTo(x, by + h + 6); g.closePath(); g.fillStyle = PAL.fadedNavy; g.fill();
    g.fillStyle = PAL.fadedNavy; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, bx + 7, by + h / 2 + 1); g.restore();
  }

  /** Things that live in the park on their own: a cat on the outfield wall, fans coming in for the game. */
  _life(dt, simDt) {
    const c = this.cat, sim = this.sim;
    if (!this.reduced) {
      if (c.state === 'off') { if ((c.t -= dt) <= 0 && sim.mode !== 'gameday') { c.dir = Math.random() < 0.5 ? 1 : -1; c.a = -c.dir * Math.PI / 4; c.sitAt = (Math.random() - 0.5) * 0.9; c.state = 'walk'; } }
      else if (c.state === 'walk') { c.a += c.dir * dt * 0.036; c.step += dt * 13; if (!c.sat && (c.dir > 0 ? c.a >= c.sitAt : c.a <= c.sitAt)) { c.state = 'sit'; c.t = 7 + Math.random() * 9; c.sat = true; } if (Math.abs(c.a) > Math.PI / 4) { c.state = 'off'; c.sat = false; c.t = 50 + Math.random() * 60; } }
      else if (c.state === 'sit' && (c.t -= dt) <= 0) c.state = 'walk';
    }
    const gd = sim.gameday;
    if (gd && (gd.phase === 'clearing' || gd.phase === 'dusk' || gd.phase === 'lights') && simDt > 0 && this.walkers.length < 46 && (this.walkT -= simDt) <= 0) {
      this.walkT = 0.12 + Math.random() * 0.25; const st = this.seats[Math.floor(Math.random() * this.seats.length)];
      if (st) this.walkers.push({ x: (Math.random() - 0.5) * 22, y: -150 - Math.random() * 10, to: [st.x, st.y], c: FAN_COLORS[Math.floor(Math.random() * FAN_COLORS.length)], skin: Math.random() < 0.5 ? PAL.skin : PAL.skinDeep, step: 0, sp: 22 + Math.random() * 10 });
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) { const f = this.walkers[i], dx = f.to[0] - f.x, dy = f.to[1] - f.y, d = Math.hypot(dx, dy), go = f.sp * simDt; if (d <= go || !gd) { this.walkers.splice(i, 1); continue; } f.x += dx / d * go; f.y += dy / d * go; f.step += go; }
  }

  /** Clippings, dust and chalk follow the tools; birds go about their business. */
  _emit(dt, simDt) {
    const sim = this.sim;
    for (const w of sim.workers) {
      if (w.equip === 'rider' && w.moving && simDt > 0 && Math.random() < dt * 4) { const bx = w.x - w.heading[0] * 7, by = w.y - w.heading[1] * 7; this.puff(bx, by, 12, 'rgba(120,116,110,.55)', 1, 1, 7, 0.9); }
      if (w.state === ST.IDLE && w.pose === 'sip' && !w.path && Math.random() < dt * 2.2) this.puff(w.x + w.face * 5, w.y, 17, 'rgba(255,255,255,.7)', 1, 0.6, 7, 1.1);
    }
    if (simDt > 0) for (const w of sim.workers) { if (w.state !== ST.WORKING || !w.working || !w.job) { if (w.moving && !w.equip && Math.random() < dt * 1.5 && region(w.x, w.y) >= RG.SKIN) this.puff(w.x, w.y, 1, '#d9b38c', 1, 2, 4, 0.5); continue; }
      const ty = w.job.type, rate = dt * (ty === 'mow' ? 26 : ty === 'drag' ? 16 : ty === 'rake' ? 9 : 12); if (Math.random() > rate) continue; const hx = w.heading[0], hy = w.heading[1];
      if (ty === 'mow') { const side = w.equip === 'rider' ? 12 : 6; this.puff(w.x - hx * 6 + (Math.random() - 0.5) * side * Math.abs(hy) + hy * 0, w.y - hy * 6 + (Math.random() - 0.5) * side * Math.abs(hx), 2.5, Math.random() < 0.5 ? PAL.sunlit : '#b9d98a', 2, 5, 10, 2.4); }
      else if (ty === 'chalk') this.puff(w.x + hx * 3, w.y + hy * 3, 1, '#ffffff', 1, 3, 5, 0.6); else this.puff(w.x - hx * (ty === 'drag' ? 9 : -6), w.y - hy * (ty === 'drag' ? 9 : -6), 1, '#e3bd94', 1, 6, 6, 0.8); }
    for (const b of this.birds) { b.t -= dt;
      if (b.state === 'perch') { const scared = sim.workers.some((w) => w.moving && Math.hypot(w.x - b.x, w.y - b.y) < 34 && b.z < 4); if (b.t <= 0 || scared) { let n = Math.floor(Math.random() * this.perches.length); if (n === b.at || this.birds.some((o) => o !== b && o.at === n)) n = (n + 1) % this.perches.length; if (this.birds.some((o) => o !== b && o.at === n)) n = (n + 1) % this.perches.length; b.from = [b.x, b.y, b.z]; b.at = n; b.state = 'fly'; b.t = b.dur = 1.6 + Math.random(); b.flip = this.perches[n][0] < b.x; } }
      else { const p = this.perches[b.at], k = clamp(1 - b.t / b.dur, 0, 1), e = k * k * (3 - 2 * k); b.x = lerp(b.from[0], p[0], e); b.y = lerp(b.from[1], p[1], e); b.z = lerp(b.from[2], p[2], e) + Math.sin(k * Math.PI) * 28; if (k >= 1) { b.state = 'perch'; b.t = 5 + Math.random() * 11; } } }
  }

  _light(g, X, Y, s, L) {
    const w = this.vw, h = this.vh;
    if (L.morning > 0.01) { g.globalAlpha = L.morning; g.globalCompositeOperation = 'soft-light'; let gr = g.createLinearGradient(w, 0, 0, h); gr.addColorStop(0, 'rgba(255,232,180,.6)'); gr.addColorStop(1, 'rgba(110,145,205,.42)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over'; gr = g.createLinearGradient(0, 0, 0, h * 0.5); gr.addColorStop(0, 'rgba(255,250,235,.26)'); gr.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.5); }
    if (L.afternoon > 0.01) { g.globalAlpha = L.afternoon; g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,246,214,.22)'; g.fillRect(0, 0, w, h); }
    if (L.golden > 0.01) { g.globalAlpha = L.golden; g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ffd3a1'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'soft-light'; const gr = g.createLinearGradient(0, h, w, 0); gr.addColorStop(0, 'rgba(255,170,80,.6)'); gr.addColorStop(1, 'rgba(120,90,160,.3)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (L.night > 0.01) { const lit = this.lamps, cx = X(0), cy = Y(150), R = 520 * s; g.globalAlpha = L.night; g.globalCompositeOperation = 'multiply';
      const mixc = (a, b, k) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
      const gr = g.createRadialGradient(cx, cy, 40 * s, cx, cy, R); gr.addColorStop(0, mixc([120, 126, 170], [255, 247, 226], lit)); gr.addColorStop(0.42, mixc([104, 110, 156], [226, 220, 214], lit)); gr.addColorStop(0.62, mixc([86, 92, 140], [128, 134, 176], lit)); gr.addColorStop(1, '#262d54'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      TOWERS.forEach((p, i) => { if (lit < (i + 1) / 4 - 0.01) return; const lx = X(p[0]), ly = Y(p[1], 83), gr2 = g.createRadialGradient(lx, ly, 0, lx, ly, 62 * s); gr2.addColorStop(0, 'rgba(255,240,190,.85)'); gr2.addColorStop(0.25, 'rgba(255,236,180,.3)'); gr2.addColorStop(1, 'rgba(255,236,180,0)'); g.fillStyle = gr2; g.fillRect(lx - 62 * s, ly - 62 * s, 124 * s, 124 * s); });
      if (this.sim.gameday && this.sim.gameday.board.on) { const bx = X(0), by = Y(BOARD.y, BOARD.z + BOARD.h / 2), gr3 = g.createRadialGradient(bx, by, 0, bx, by, 80 * s); gr3.addColorStop(0, 'rgba(255,214,130,.3)'); gr3.addColorStop(1, 'rgba(255,214,130,0)'); g.fillStyle = gr3; g.fillRect(bx - 80 * s, by - 80 * s, 160 * s, 160 * s); } }
    if (this.flash > 0.01) { g.globalAlpha = 1; g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,240,200,${0.3 * this.flash})`; g.fillRect(0, 0, w, h); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}
