// Route planning: where a tool has to travel to finish an area. A route is a list of straight segments;
// `work` segments have the tool down (cutting, dragging, chalking), the rest are the links between them.

import { S2, MOUND, HOME, SKIN_R, RG, region, areaAt, chalkPaths, NAV, dist } from './geometry.js';
import { FEEL } from './config.js';

export const PATTERN_DIRS = {
  classic: [[0, 1]], diagonal: [[S2, S2]], checker: [[0, 1], [1, 0]], diamonds: [[S2, S2], [-S2, S2]],
};

/** One set of parallel mower passes over the texels where inArea is true. */
function lanePass(inArea, dir, W, pass, from) {
  const [dx, dy] = dir, px = -dy, py = dx, lanes = [];
  for (let k = -30; k <= 30; k++) {
    const u = (k + 0.5) * W, runs = []; let start = null;
    for (let v = -470; v <= 470; v += 2) {
      let inside = false;
      for (const o of [-0.36, 0, 0.36]) { const uu = u + o * W; if (inArea(uu * px + v * dx, uu * py + v * dy)) { inside = true; break; } }
      if (inside && start === null) start = v; else if (!inside && start !== null) { if (v - 2 - start >= 6) runs.push([start - 3, v + 1]); start = null; }
    }
    if (runs.length) lanes.push({ k, runs });
  }
  const pt = (k, v) => { const u = (k + 0.5) * W; return [u * px + v * dx, u * py + v * dy]; };
  const build = (rev, startUp) => { const segs = []; let up = startUp;
    for (const lane of rev ? [...lanes].reverse() : lanes) { const runs = up ? lane.runs : [...lane.runs].reverse();
      runs.forEach((r, n) => { const v0 = up ? r[0] : r[1], v1 = up ? r[1] : r[0]; segs.push({ a: pt(lane.k, v0), b: pt(lane.k, v1), work: true, k: lane.k, dir, W, pass, endOfLane: n === runs.length - 1 }); }); up = !up; }
    return segs; };
  let best = null, bd = Infinity;
  for (const rev of [false, true]) for (const up of [true, false]) { const s = build(rev, up); if (!s.length) continue; const d = dist(s[0].a, from); if (d < bd) { bd = d; best = s; } }
  return best || [];
}

/** Fan arcs: concentric lanes around home plate, swept foul line to foul line, alternating direction, inside out. */
function arcPass(inArea, W, from) {
  const lanes = [];
  for (let k = 1; k < 30; k++) { const r = (k + 0.5) * W, n = Math.max(8, Math.ceil((r * Math.PI / 2) / 5)), runs = []; let cur = null;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 4 + (i / n) * Math.PI / 2, ok = [-0.34, 0, 0.34].some((o) => inArea(Math.sin(a) * (r + o * W), Math.cos(a) * (r + o * W)));
      if (ok && i < n) (cur || (cur = [])).push(a); else if (cur) { if (cur.length > 1) runs.push(cur); cur = null; } }
    if (runs.length) lanes.push({ k, r, runs }); }
  const segs = []; let fwd = true;
  if (lanes.length && from[0] > 0) fwd = false;
  for (const lane of lanes) { const runs = fwd ? lane.runs : [...lane.runs].reverse().map((r) => [...r].reverse());
    runs.forEach((run, ri) => { const pts = run.map((a) => [Math.sin(a) * lane.r, Math.cos(a) * lane.r]);
      for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], work: true, arc: { k: lane.k }, W, pass: 1, endOfLane: ri === runs.length - 1 && i === pts.length - 2, lane: i === pts.length - 2 ? pts : null }); });
    fwd = !fwd; }
  return segs;
}

function link(segs) {
  const out = [];
  segs.forEach((s, i) => { if (i && dist(segs[i - 1].b, s.a) > 0.5) out.push({ a: segs[i - 1].b, b: s.a, work: false }); out.push(s); });
  return out;
}

export function mowRoute(areaKey, pattern, W, from = NAV.gateIn) {
  let segs = [], parityAt;
  const lane = (dir) => (x, y) => Math.floor((x * -dir[1] + y * dir[0]) / W) & 1;
  if (areaKey === 'foul') {
    const L = lanePass((x, y) => x < 0 && areaAt(x, y) === 'foul', [-S2, S2], W, 1, from);
    const R = lanePass((x, y) => x >= 0 && areaAt(x, y) === 'foul', [S2, S2], W, 1, L.length ? L[L.length - 1].b : from);
    segs = L.concat(R); const pl = lane([-S2, S2]), pr = lane([S2, S2]); parityAt = (x, y) => (x < 0 ? pl(x, y) : pr(x, y));
  } else if (pattern === 'arcs') {
    segs = arcPass((x, y) => areaAt(x, y) === areaKey, W, from); parityAt = (x, y) => Math.floor(Math.hypot(x, y) / W) & 1;
  } else {
    const dirs = PATTERN_DIRS[pattern] || PATTERN_DIRS.classic, inArea = (x, y) => areaAt(x, y) === areaKey;
    dirs.forEach((d, n) => { segs = segs.concat(lanePass(inArea, d, W, n + 1, segs.length ? segs[segs.length - 1].b : from)); });
    const p1 = lane(dirs[0]), p2 = dirs[1] ? lane(dirs[1]) : null; parityAt = p2 ? (x, y) => p1(x, y) ^ p2(x, y) : p1;
  }
  return { segs: link(segs), parityAt };
}

export function dragRoute(from = NAV.gateIn) {
  const runs = [];
  for (let r = SKIN_R - 3.5; r >= 11; r -= FEEL.MAT_STEP) {
    const n = Math.ceil((2 * Math.PI * r) / 2.5); let cur = null;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, x = MOUND[0] + Math.sin(a) * r, y = MOUND[1] + Math.cos(a) * r, ok = i < n && region(x, y) === RG.SKIN;
      if (ok) (cur || (cur = [])).push([x, y]); else if (cur) { if (cur.length > 2) runs.push(cur); cur = null; } }
  }
  const segs = []; let pos = from;                                   // nearest end next, so the mat never doubles back far
  while (runs.length) { let bi = 0, flip = false, bd = Infinity; runs.forEach((run, i) => { const d0 = dist(pos, run[0]), d1 = dist(pos, run[run.length - 1]); if (d0 < bd) { bd = d0; bi = i; flip = false; } if (d1 < bd) { bd = d1; bi = i; flip = true; } });
    const run = runs.splice(bi, 1)[0]; if (flip) run.reverse();
    for (let i = 0; i < run.length - 1; i++) segs.push({ a: run[i], b: run[i + 1], work: true }); pos = run[run.length - 1]; }
  return { segs: link(segs) };
}

export function rakeRoute() {
  const ring = (c, r, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; p.push([c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r]); } return p; };
  const segs = [];
  for (const p of [ring(MOUND, 4.5, 12), ring(HOME, 7.5, 16), ring(HOME, 2, 6)]) for (let i = 0; i < p.length - 1; i++) segs.push({ a: p[i], b: p[i + 1], work: true });
  return { segs: link(segs) };
}

export function chalkRoute() {
  const segs = [];
  for (const p of chalkPaths()) for (let i = 0; i < p.pts.length - 1; i++) segs.push({ a: p.pts[i], b: p.pts[i + 1], work: true, endOfLane: i === p.pts.length - 2 && p.id.startsWith('line') });
  return { segs: link(segs) };
}

export const routeLength = (segs) => segs.reduce((n, s) => n + dist(s.a, s.b), 0);

/** Which shade a mowing pattern gives a point: used for the preview before a job is assigned. */
export function patternParity(areaKey, pattern, W) {
  const lane = (dir) => (x, y) => Math.floor((x * -dir[1] + y * dir[0]) / W) & 1;
  if (areaKey === 'foul') { const pl = lane([-S2, S2]), pr = lane([S2, S2]); return (x, y) => (x < 0 ? pl(x, y) : pr(x, y)); }
  if (pattern === 'arcs') return (x, y) => Math.floor(Math.hypot(x, y) / W) & 1;
  const dirs = PATTERN_DIRS[pattern] || PATTERN_DIRS.classic, p1 = lane(dirs[0]), p2 = dirs[1] ? lane(dirs[1]) : null; return p2 ? (x, y) => p1(x, y) ^ p2(x, y) : p1;
}
