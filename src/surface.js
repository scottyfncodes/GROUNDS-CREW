// The field surface: grids of state (how shaggy the grass is, which way it was cut, how scuffed the dirt is,
// how much chalk is down) and the shader that turns them into pixels. Tools change the grids only where they
// touch; the shader repaints only the texels that changed. Nothing here knows about workers or the DOM.

import { BOUNDS, RES, GW, GH, RG, region, areaIdOf, chalkPaths, CHALK_HALF, MOUND, BASE, FIELDERS, AREAS } from './geometry.js';
import { PAL } from './config.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function hash2(x, y, s = 0) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const C = {
  light: hex(PAL.freshCut), dark: hex(PAL.cutDark), olive: hex(PAL.mutedOlive), shadow: hex(PAL.shadowGreen), dry: hex(PAL.dryGrass),
  clay: hex(PAL.terracotta), groom: hex(PAL.groomedEarth), deep: hex(PAL.richClay), scuff: hex(PAL.scuffDark), track: hex(PAL.dustyCinnamon), chalk: hex(PAL.chalkWhite),
};

/** Which way a mower lane runs: 1 up and down the field, 2 across it, 3 and 4 the diagonals. */
export const axisOf = (d) => (Math.abs(d[1]) > 0.9 ? 1 : Math.abs(d[0]) > 0.9 ? 2 : d[0] * d[1] > 0 ? 3 : 4);
export const gx = (x) => Math.floor((x - BOUNDS.x0) * RES);
export const gy = (y) => Math.floor((BOUNDS.y1 - y) * RES);
export const wx = (i) => BOUNDS.x0 + (i + 0.5) / RES;
export const wy = (j) => BOUNDS.y1 - (j + 0.5) / RES;

export class Surface {
  /** @param {(w:number,h:number)=>any} makeCanvas returns a canvas (DOM or a stub in tests) */
  constructor(makeCanvas) {
    const N = GW * GH;
    this.rg = new Uint8Array(N); this.area = new Uint8Array(N);
    this.n = new Uint8Array(N); this.lf = new Uint8Array(N); this.mf = new Uint8Array(N); this.lip = new Int8Array(N); this.ring = new Uint8Array(N); this.chalkM = new Uint8Array(N);
    this.rough = new Uint8Array(N);   // grass: 0 fresh cut .. 255 shaggy
    this.dir = new Uint8Array(N);     // grass: which way it was last cut (0 never, 1 up/down, 2 across, 3 and 4 diagonals, 5 arcs)
    this.bf = new Uint8Array(N);      // grass: blade clumps, the texture of long grass
    this.shade = new Uint8Array(N);   // grass: bit0 light/dark band, bit1 crossed in the current second pass
    this.scuff = new Uint8Array(N);   // dirt: 0 groomed .. 255 torn up
    this.chalk = new Uint8Array(N);   // chalk: 0 none .. 255 fresh
    this.dirty = null;
    this._static();
    this.canvas = makeCanvas ? makeCanvas(GW, GH) : null;
    if (this.canvas) { this.ctx = this.canvas.getContext('2d'); this.img = this.ctx.createImageData(GW, GH); }
  }

  _static() {
    const { rg, area, n, lf, mf, lip, ring } = this;
    for (let j = 0; j < GH; j++) { const y = wy(j); for (let i = 0; i < GW; i++) {
      const x = wx(i), k = j * GW + i, r = region(x, y); rg[k] = r; area[k] = areaIdOf(r);
      n[k] = hash2(i, j) * 255; lf[k] = vnoise(x / 38, y / 38, 7) * 255; mf[k] = vnoise(x / 6.5, y / 6.5, 3) * 255; if (r && r <= RG.FOUL) this.bf[k] = (vnoise(x / 1.4, y / 2.1, 5) * 0.75 + vnoise(x / 0.6, y / 0.9, 6) * 0.25) * 255;
      if (r === RG.SKIN) ring[k] = Math.floor(Math.hypot(x - MOUND[0], y - MOUND[1]) / 2.4) & 1;
      else if (r === RG.MOUND) ring[k] = Math.floor(Math.hypot(x - MOUND[0], y - MOUND[1]) / 1.8) & 1;
      else if (r === RG.PLATE) ring[k] = Math.floor(Math.hypot(x, y) / 1.8) & 1;
      else if (r === RG.TRACK) ring[k] = 0;
    } }
    const dirt = (r) => r >= RG.SKIN, grass = (r) => r >= RG.OUTFIELD && r <= RG.FOUL;
    for (let j = 1; j < GH - 2; j++) for (let i = 0; i < GW; i++) {       // a soft lip where turf meets dirt
      const k = j * GW + i, r = rg[k], below = rg[k + GW], below2 = rg[k + 2 * GW], above = rg[k - GW];
      if (grass(r) && (dirt(below) || dirt(below2))) lip[k] = -16; else if (dirt(r) && grass(above)) lip[k] = -12; else if (r && !below) lip[k] = -10;
    }
    for (const p of chalkPaths()) for (let s = 0; s < p.pts.length - 1; s++) this._stamp(p.pts[s], p.pts[s + 1], CHALK_HALF, (k) => { if (rg[k]) this.chalkM[k] = 1; });
  }

  _stamp(a, b, hw, fn) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len * RES)), R = Math.ceil(hw * RES);
    for (let s = 0; s <= steps; s++) { const x = a[0] + (b[0] - a[0]) * s / steps, y = a[1] + (b[1] - a[1]) * s / steps, ci = gx(x), cj = gy(y);
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue; if (Math.hypot(wx(i) - x, wy(j) - y) <= hw) fn(j * GW + i); } }
  }

  _mark(i0, j0, i1, j1) {
    i0 = Math.max(0, i0 - 2); j0 -= 2; i1 += 2; j1 += 2;   // neighbours too: the cut edge is drawn across them
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(GW - 1, i1); j1 = Math.min(GH - 1, j1); if (i1 < i0 || j1 < j0) return;
    // separate regions for separate workers: merge only rectangles that touch, so three tools far apart never repaint the field between them
    const list = this.dirty || (this.dirty = []);
    for (const d of list) if (i0 <= d[2] + 8 && i1 >= d[0] - 8 && j0 <= d[3] + 8 && j1 >= d[1] - 8) { if (i0 < d[0]) d[0] = i0; if (j0 < d[1]) d[1] = j0; if (i1 > d[2]) d[2] = i1; if (j1 > d[3]) d[3] = j1; return; }
    if (list.length >= 6) { const d = list[0]; d[0] = Math.min(d[0], i0); d[1] = Math.min(d[1], j0); d[2] = Math.max(d[2], i1); d[3] = Math.max(d[3], j1); return; }
    list.push([i0, j0, i1, j1]);
  }

  // ---- tools -------------------------------------------------------------------------------------------

  /** Cut one mower pass: texels of `areaId` inside lane k (width W, travel direction dir) between v0 and v1 along it. */
  cutLane(areaId, dir, W, k, v0, v1, pass) {
    if (v1 < v0) { const t = v0; v0 = v1; v1 = t; }
    const dx = dir[0], dy = dir[1], px = -dy, py = dx, u0 = k * W, u1 = u0 + W, par = k & 1, { area, rough, shade } = this, axis = axisOf(dir);
    const xs = [u0 * px + v0 * dx, u1 * px + v0 * dx, u0 * px + v1 * dx, u1 * px + v1 * dx], ys = [u0 * py + v0 * dy, u1 * py + v0 * dy, u0 * py + v1 * dy, u1 * py + v1 * dy];
    const i0 = Math.max(0, gx(Math.min(...xs)) - 1), i1 = Math.min(GW - 1, gx(Math.max(...xs)) + 1), j0 = Math.max(0, gy(Math.max(...ys)) - 1), j1 = Math.min(GH - 1, gy(Math.min(...ys)) + 1);
    let cut = 0;
    for (let j = j0; j <= j1; j++) { const y = wy(j); for (let i = i0; i <= i1; i++) { const q = j * GW + i; if (area[q] !== areaId) continue; const x = wx(i), u = x * px + y * py, v = x * dx + y * dy;
      if (u < u0 || u >= u1 || v < v0 || v > v1) continue;
      if (pass === 2) { if (shade[q] & 2) continue; shade[q] = (shade[q] ^ par) | 2; } else shade[q] = par;
      rough[q] = 0; this.dir[q] = axis; cut++; } }
    if (cut) this._mark(i0, j0, i1, j1);
    return cut;
  }
  /** Cut part of an arc lane: texels at distance [kW, (k+1)W) from home plate between angles a0 and a1 (radians from the centre-field line). */
  cutArc(areaId, W, k, a0, a1) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const r0 = k * W, r1 = r0 + W, { area, rough, shade, dir } = this, xs = [], ys = [];
    for (const r of [r0, r1]) for (const a of [a0, a1, (a0 + a1) / 2]) { xs.push(Math.sin(a) * r); ys.push(Math.cos(a) * r); }
    const i0 = Math.max(0, gx(Math.min(...xs)) - 2), i1 = Math.min(GW - 1, gx(Math.max(...xs)) + 2), j0 = Math.max(0, gy(Math.max(...ys)) - 2), j1 = Math.min(GH - 1, gy(Math.min(...ys)) + 2); let cut = 0;
    for (let j = j0; j <= j1; j++) { const y = wy(j); for (let i = i0; i <= i1; i++) { const q = j * GW + i; if (area[q] !== areaId) continue; const x = wx(i), r = Math.hypot(x, y);
      if (r < r0 || r >= r1) continue; const a = Math.atan2(x, y); if (a < a0 || a > a1) continue; shade[q] = k & 1; rough[q] = 0; dir[q] = 5; cut++; } }
    if (cut) this._mark(i0, j0, i1, j1); return cut;
  }
  /** Before a crossing pass: forget which texels the last one crossed. */
  beginSecondPass(areaId) { const { area, shade } = this; for (let q = 0; q < area.length; q++) if (area[q] === areaId) shade[q] &= 1; }

  groom(areaId, x, y, r) {
    const R = Math.ceil(r * RES), ci = gx(x), cj = gy(y), { area, scuff } = this; let hit = 0;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue; const q = j * GW + i;
      if (area[q] !== areaId || !scuff[q]) continue; if (di * di + dj * dj > R * R) continue; scuff[q] = 0; hit++; }
    if (hit) this._mark(ci - R, cj - R, ci + R, cj + R); return hit;
  }
  chalkAt(x, y, r) {
    const R = Math.ceil(r * RES), ci = gx(x), cj = gy(y), { chalkM, chalk } = this; let hit = 0;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue; const q = j * GW + i;
      if (!chalkM[q] || chalk[q] === 255 || di * di + dj * dj > R * R) continue; chalk[q] = 255; hit++; }
    if (hit) this._mark(ci - R, cj - R, ci + R, cj + R); return hit;
  }
  /** The tidy-up at the end of a job: what the route missed by a sliver is finished by hand over a second or so. */
  finishSweep(job, amount) {
    const { area, rough, scuff, chalk, chalkM, shade } = this, id = job.areaId, a = Math.max(1, Math.round(amount * 255)); let left = 0;
    for (let q = 0; q < area.length; q++) {
      if (job.type === 'chalk') { if (chalkM[q] && chalk[q] < 255) { chalk[q] = Math.min(255, chalk[q] + a); if (chalk[q] < 255) left++; } continue; }
      if (area[q] !== id) continue;
      if (job.type === 'mow') { if (rough[q]) { if (job.parityAt) { const i = q % GW, j = (q / GW) | 0; shade[q] = job.parityAt(wx(i), wy(j)); } rough[q] = Math.max(0, rough[q] - a); if (rough[q]) left++; } }
      else if (scuff[q]) { scuff[q] = Math.max(0, scuff[q] - a); if (scuff[q]) left++; }
    }
    this._mark(0, 0, GW - 1, GH - 1); return left;
  }
  finishAll() { this.rough.fill(0); this.scuff.fill(0); for (let q = 0; q < this.chalk.length; q++) this.chalk[q] = this.chalkM[q] ? 255 : 0; this._mark(0, 0, GW - 1, GH - 1); }

  // ---- condition ---------------------------------------------------------------------------------------

  /** Condition 0..1 of every work area and of grass, dirt, lines and the whole field. Sampled every other texel. */
  stats() {
    const sum = new Float64Array(8), cnt = new Float64Array(8), { area, rough, scuff, chalk, chalkM } = this;
    for (let j = 0; j < GH; j += 2) for (let i = (j >> 1) & 1; i < GW; i += 2) { const q = j * GW + i, a = area[q];
      if (chalkM[q]) { sum[6] += chalk[q]; cnt[6]++; }
      if (!a) continue; cnt[a]++; sum[a] += a <= 3 ? 255 - rough[q] : 255 - scuff[q]; }
    const c = (a) => (cnt[a] ? sum[a] / cnt[a] / 255 : 1), areas = {}; for (const k in AREAS) areas[k] = c(AREAS[k].id);
    const grass = (sum[1] + sum[2] + sum[3]) / Math.max(1, cnt[1] + cnt[2] + cnt[3]) / 255, dirt = (sum[4] + sum[5]) / Math.max(1, cnt[4] + cnt[5]) / 255, lines = c(6);
    return { areas, grass, dirt, lines, field: 0.5 * grass + 0.3 * dirt + 0.2 * lines };
  }

  // ---- wear --------------------------------------------------------------------------------------------

  /** A field nobody has tended: old faded stripes, scuffed dirt, ghost lines. */
  initWorn(seed) {
    const { rg, area, rough, shade, scuff, chalk, chalkM, lf, mf } = this;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const q = j * GW + i, a = area[q]; if (chalkM[q]) chalk[q] = 46 + hash2(i, j, seed) * 60;
      if (!a) continue; if (a <= 3) { rough[q] = 172 + lf[q] * 0.3; shade[q] = Math.floor((wx(i) + 1000) / 24) & 1; this.dir[q] = 1; } else scuff[q] = 185 + mf[q] * 0.27; }
    this._spots(seed, 1); this._mark(0, 0, GW - 1, GH - 1);
  }
  /** The morning after a game: growth everywhere, wear where people stood and ran, faded chalk. Never a reset. */
  wear(seed, day, rain = false) {
    const { area, rough, scuff, chalk, chalkM, mf } = this, s = seed + day * 101;
    for (let j = 0; j < GH; j++) { const y = wy(j); for (let i = 0; i < GW; i++) { const q = j * GW + i, a = area[q];
      if (chalkM[q]) { const x = wx(i); chalk[q] = chalk[q] * (Math.hypot(x, y) < 22 ? 0.12 : 0.28 + 0.3 * vnoise(x / 20, y / 20, s)); }
      if (!a) continue; const x = wx(i);
      if (a <= 3) rough[q] = Math.min(255, rough[q] + 58 + vnoise(x / 30, y / 30, s) * 46);
      else { const lane = Math.abs(Math.abs(x) - y) * 0.7071 < 4 && y < BASE + 6 ? 90 : 0; scuff[q] = Math.min(255, scuff[q] + 105 + mf[q] * 0.3 + vnoise(x / 9, y / 9, s) * 60 + lane + (rain ? 80 : 0)); } } }
    this._spots(s, 0.8); this._mark(0, 0, GW - 1, GH - 1);
  }
  _spots(seed, k) {                                                       // worn patches where fielders stand
    const pts = Object.values(FIELDERS).concat([[-BASE + 6, BASE + 8], [BASE - 6, BASE + 8]]), { area, rough } = this;
    pts.forEach((p, n) => { const cx = p[0] + (hash2(n, 1, seed) - 0.5) * 18, cy = p[1] + (hash2(n, 2, seed) - 0.5) * 18, R = 13 + hash2(n, 3, seed) * 9, Rt = Math.ceil(R * RES), ci = gx(cx), cj = gy(cy);
      for (let dj = -Rt; dj <= Rt; dj++) for (let di = -Rt; di <= Rt; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue; const q = j * GW + i; if (!area[q] || area[q] > 3) continue;
        const f = 1 - Math.hypot(di, dj) / Rt; if (f > 0) rough[q] = Math.min(255, rough[q] + f * f * 150 * k * (0.6 + hash2(i >> 2, j >> 2, seed) * 0.6)); } });
  }

  // ---- shader ------------------------------------------------------------------------------------------

  /** Repaint the texels that changed (or everything) and push them to the canvas. */
  flush(all) {
    if (!this.canvas) { this.dirty = null; return; }
    const rects = all ? [[0, 0, GW - 1, GH - 1]] : this.dirty; if (!rects) return; this.dirty = null;
    for (const d of rects) this._shade(d);
  }

  _shade(d) {
    const [i0, j0, i1, j1] = d, D = this.img.data, { rg, n, lf, mf, lip, ring, rough, shade, scuff, chalk, chalkM, dir, bf } = this, isGrass = (k) => rg[k] >= RG.OUTFIELD && rg[k] <= RG.FOUL;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * GW + i, r = rg[q], o = q * 4; if (!r) { D[o + 3] = 0; continue; }
      const nn = n[q] / 255 - 0.5, l = lf[q] / 255 - 0.5, m = mf[q] / 255; let R, G, B;
      if (r <= RG.FOUL) {
        const ro = rough[q] / 255, cut = (shade[q] & 1) ? C.light : C.dark, w = Math.min(1, ro * 1.3);              // how long it is, as you see it: linear, so 30% grown looks 30% grown
        const dry = ro > 0.86 ? (ro - 0.86) * 3 : 0, b = bf[q] / 255 - 0.5, deep = 0.5 - l * 1.2 + b * 0.5;
        // long grass: a lush, clumpy green that deepens in the hollows; dries a little only when it is very long
        const sr = C.olive[0] + (C.shadow[0] - C.olive[0]) * deep + (C.dry[0] - C.olive[0]) * dry, sg = C.olive[1] + (C.shadow[1] - C.olive[1]) * deep + (C.dry[1] - C.olive[1]) * dry, sb = C.olive[2] + (C.shadow[2] - C.olive[2]) * deep + (C.dry[2] - C.olive[2]) * dry;
        const keep = 0.14 * w, gr = sr + (cut[0] - sr) * keep, gg = sg + (cut[1] - sg) * keep, gb = sb + (cut[2] - sb) * keep;        // old stripes ghost through
        R = cut[0] + (gr - cut[0]) * w; G = cut[1] + (gg - cut[1]) * w; B = cut[2] + (gb - cut[2]) * w;
        // cut grass: fine blade streaks laid the way the mower went
        let streak = 0; const ax = dir[q];
        if (ax && w < 0.95) { const x = wx(i), y = wy(j); let u, v;
          if (ax === 1) { u = x; v = y; } else if (ax === 2) { u = y; v = x; } else if (ax === 3) { u = (x - y) * 0.7071; v = (x + y) * 0.7071; } else if (ax === 4) { u = (x + y) * 0.7071; v = (x - y) * 0.7071; } else { u = Math.hypot(x, y); v = Math.atan2(x, y) * u; }
          const ui = Math.floor(u * 1.35); streak = (hash2(ui, Math.floor(v / 9 + hash2(ui, 3, 4) * 3), 9) - 0.5) * 15 + (hash2(ui, 7, 2) - 0.5) * 7; }
        const tuft = w * (b * 40 + (m - 0.5) * 22 + nn * 5) + (1 - w) * (streak + nn * 4 + l * 9);
        R += tuft; G += tuft; B += tuft * 0.55;
        // the cut edge: long grass leans over fresh cut and shades it; its own tips catch the light
        if (q > GW && q < rg.length - GW) { const tall = (k) => isGrass(k) && rough[k] > 150, short = (k) => isGrass(k) && rough[k] < 70;
          if (ro < 0.27 && (tall(q - GW) || tall(q - 1) || tall(q + 1))) { R -= 20; G -= 18; B -= 12; }
          else if (ro > 0.59 && (short(q + GW) || short(q - 1) || short(q + 1))) { R += 9; G += 11; B += 4; } }
      } else if (r === RG.TRACK) { const s = nn * 16 + l * 16; R = C.track[0] + s; G = C.track[1] + s; B = C.track[2] + s; }
      else {
        const sc = scuff[q] / 255, rgm = ring[q] ? 0 : 0.2, fr = C.groom[0] + (C.clay[0] - C.groom[0]) * rgm, fg = C.groom[1] + (C.clay[1] - C.groom[1]) * rgm, fb = C.groom[2] + (C.clay[2] - C.groom[2]) * rgm;
        const blot = (m > 0.6 ? 0.55 : m < 0.3 ? -0.25 : 0) + (nn > 0.4 ? 0.7 : nn < -0.44 ? -0.5 : 0);            // scuffs, cleat marks, loose pale dirt
        const wr = C.deep[0] + (C.scuff[0] - C.deep[0]) * blot, wg = C.deep[1] + (C.scuff[1] - C.deep[1]) * blot, wb = C.deep[2] + (C.scuff[2] - C.deep[2]) * blot;
        R = fr + (wr - fr) * sc; G = fg + (wg - fg) * sc; B = fb + (wb - fb) * sc; const s = nn * (6 + sc * 14); R += s; G += s; B += s;
      }
      if (chalkM[q]) { const c = chalk[q] / 255, a = c > 0.6 ? c * (0.84 + (nn + 0.5) * 0.16) : c * (nn > 0 ? 1.25 : 0.45); R += (C.chalk[0] - R) * a; G += (C.chalk[1] - G) * a; B += (C.chalk[2] - B) * a; }
      const lp = lip[q]; D[o] = R + lp; D[o + 1] = G + lp; D[o + 2] = B + lp; D[o + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0, i0, j0, i1 - i0 + 1, j1 - j0 + 1);
  }

  // ---- persistence: 2 ft blocks, run-length encoded ---------------------------------------------------

  serialize() {
    const bw = GW >> 2, bh = GH >> 2, { area, chalkM } = this;
    // each 2 ft block is stored once, read from a texel of the kind being saved (so turf edges do not borrow dirt values)
    const pick = (i, j, ok) => { for (let dj = 0; dj < 4; dj++) for (let di = 0; di < 4; di++) { const q = ((j << 2) + dj) * GW + (i << 2) + di; if (ok(q)) return q; } return -1; };
    const pack = (ok, val) => { const bytes = []; let prev = -1, run = 0; for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const q = pick(i, j, ok), v = q < 0 ? 0 : val(q); if (v === prev && run < 255) run++; else { if (run) bytes.push(run, prev); prev = v; run = 1; } } bytes.push(run, prev);
      let str = ''; for (let k = 0; k < bytes.length; k += 4096) str += String.fromCharCode.apply(null, bytes.slice(k, k + 4096)); return btoa(str); };
    return { a: pack((q) => area[q] >= 1 && area[q] <= 3, (q) => this.dir[q]), g: pack((q) => area[q] >= 1 && area[q] <= 3, (q) => ((this.rough[q] >> 3) << 1) | (this.shade[q] & 1)), d: pack((q) => area[q] >= 4, (q) => this.scuff[q] >> 3), c: pack((q) => chalkM[q] === 1, (q) => this.chalk[q] >> 3) };
  }
  deserialize(o) {
    const bw = GW >> 2, bh = GH >> 2, un = (s) => { const b = atob(s), out = new Uint8Array(bw * bh); let p = 0; for (let k = 0; k + 1 < b.length; k += 2) { const run = b.charCodeAt(k), v = b.charCodeAt(k + 1); out.fill(v, p, p + run); p += run; } if (p !== bw * bh) throw new Error('field data is the wrong size'); return out; };
    const g = un(o.g), d = un(o.d), c = un(o.c), ax = o.a ? un(o.a) : null, up = (v) => (v >= 31 ? 255 : v << 3);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const q = j * GW + i, b = (j >> 2) * bw + (i >> 2), a = this.area[q];
      if (a && a <= 3) { this.rough[q] = up(g[b] >> 1); this.shade[q] = g[b] & 1; this.dir[q] = ax ? Math.min(5, ax[b]) : this.rough[q] < 128 ? 1 : 0; } else if (a) this.scuff[q] = up(d[b]); if (this.chalkM[q]) this.chalk[q] = up(c[b]); }
    this._mark(0, 0, GW - 1, GH - 1);
  }
}
