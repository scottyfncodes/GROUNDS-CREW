// Pixel people and machines, drawn from rectangles on a sprite-pixel grid (one sprite pixel = two feet).
// Drawn procedurally so every pose follows the simulation: legs step with distance walked, wheels turn with
// distance driven, arms do what the job is.

import { PAL } from './config.js';

/** A rect plotter on the sprite grid: x right, y up from the feet, snapped to device pixels so edges stay crisp. */
export function plotter(g, ox, oy, u, flip) {
  return (x, y, w, h, c) => {
    const X = flip ? -(x + w) : x, x0 = Math.round(ox + X * u), x1 = Math.round(ox + (X + w) * u), y1 = Math.round(oy - y * u), y0 = Math.round(oy - (y + h) * u);
    g.fillStyle = c; g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };
}

export const CHARS = {
  gus: { bw: 8, th: 5, lh: 3, hw: 6, hh: 4, shirt: PAL.vintageCream, pants: '#4a5a78', boots: PAL.warmCharcoal, cap: PAL.fadedNavy, brim: 2, skin: PAL.skin, tache: '#8d8a84', braces: PAL.brickRed },
  frankie: { bw: 6, th: 4, lh: 3, hw: 6, hh: 4, shirt: '#7fb0c8', pants: '#4b4a52', boots: PAL.warmCharcoal, cap: PAL.sunFadedOrange, brim: 3, skin: PAL.skin, gloves: PAL.vintageCream, tail: '#7a4a2a' },
  pearl: { bw: 6, th: 5, lh: 5, hw: 5, hh: 4, shirt: PAL.vintageCream, pants: PAL.brickRed, bib: PAL.brickRed, boots: PAL.warmCharcoal, cap: PAL.brassYellow, straw: true, skin: PAL.skinDeep },
  home: { bw: 6, th: 4, lh: 3, hw: 5, hh: 3, shirt: PAL.vintageCream, pants: PAL.vintageCream, boots: PAL.fadedNavy, cap: PAL.fadedNavy, brim: 2, skin: PAL.skin, stripe: PAL.fadedNavy },
  away: { bw: 6, th: 4, lh: 3, hw: 5, hh: 3, shirt: '#a9adb3', pants: '#a9adb3', boots: PAL.warmCharcoal, cap: PAL.brickRed, brim: 2, skin: PAL.skinDeep, stripe: PAL.brickRed },
};
export const heightOf = (c) => c.lh + c.th + c.hh + 1;

/**
 * @param pose stand | walk | push | drag | rake | chalk | ride | cheer | sip | wave | stretch | look | lean | swing | throw
 * @param o {step: feet walked, t: seconds, flip, back: seen from behind, seat: lift in sprite px}
 */
export function drawPerson(g, ox, oy, u, ch, pose, o = {}) {
  const r = plotter(g, ox, oy, u, o.flip), t = o.t || 0, walking = o.moving && pose !== 'ride';
  const ph = walking ? Math.floor((o.step || 0) / 7) & 1 : 0, bob = walking ? ph : pose === 'stretch' ? (Math.sin(t * 2.2) > 0.2 ? 1 : 0) : pose === 'cheer' ? (Math.sin(t * 11) > 0 ? 1 : 0) : 0;
  const hb = ch.bw / 2, base = (pose === 'ride' ? (o.seat || 0) : 0);
  let y = base;
  if (pose !== 'ride') {                                                   // legs
    const ll = walking && ph === 0 ? 1 : 0, rl = walking && ph === 1 ? 1 : 0;
    r(-3, ll, 2, ch.lh - ll, ch.pants); r(1, rl, 2, ch.lh - rl, ch.pants); r(-3, ll, 2, 1, ch.boots); r(1, rl, 2, 1, ch.boots);
    if (walking) r(ph ? 2 : -4, ph ? rl : ll, 1, 1, ch.boots);
    y += ch.lh;
  }
  y += bob; const ty = y;
  r(-hb, ty, ch.bw, ch.th, ch.shirt);                                      // torso
  if (ch.bib) { r(-hb + 1, ty, ch.bw - 2, ch.th - 2, ch.bib); r(-hb + 1, ty + ch.th - 2, 1, 2, ch.bib); r(hb - 2, ty + ch.th - 2, 1, 2, ch.bib); }
  if (ch.braces && !o.back) { r(-2, ty + 1, 1, ch.th - 1, ch.braces); r(1, ty + 1, 1, ch.th - 1, ch.braces); }
  if (ch.stripe) r(-hb, ty, ch.bw, 1, ch.stripe);
  const sh = ty + ch.th - 1, hand = ch.gloves || ch.skin, hs = ch.gloves ? 2 : 1;      // arms
  const armDown = (x) => { r(x, sh - 2, 1, 3, ch.shirt); r(x - (ch.gloves && x < 0 ? 1 : 0), sh - 3, hs, 1 + (ch.gloves ? 1 : 0), hand); };
  const armUp = (x, lift) => { r(x, sh, 1, 2 + lift, ch.shirt); r(x - (ch.gloves && x < 0 ? 1 : 0), sh + 2 + lift, hs, 1 + (ch.gloves ? 1 : 0), hand); };
  const armFwd = (yy, len) => { r(hb, yy, len, 1, ch.shirt); r(hb + len, yy - (ch.gloves ? 1 : 0), hs, hs, hand); };
  switch (pose) {
    case 'cheer': armUp(-hb - 1, 1); armUp(hb, 1); break;
    case 'stretch': { const up = Math.sin(t * 2.2) > 0.2 ? 1 : 0; armUp(-hb - 1, up); armUp(hb, up); break; }
    case 'wave': armDown(-hb - 1); r(hb, sh, 1, 3, ch.shirt); r(hb + (Math.sin(t * 9) > 0 ? 1 : 0), sh + 3, hs, 1 + (ch.gloves ? 1 : 0), hand); break;
    case 'sip': { armDown(-hb - 1); const up = Math.sin(t * 1.7) > 0.3; r(hb, sh - 1, 1, 2, ch.shirt); r(hb, up ? sh + 1 : sh - 2, 2, 1, ch.skin); r(hb + 1, up ? sh + 2 : sh - 1, 2, 2, PAL.vintageCream); r(hb + 1, up ? sh + 3 : sh, 2, 1, '#6b4a32'); break; }
    case 'push': case 'chalk': case 'ride': armDown(-hb - 1); armFwd(sh - 2, 2); break;
    case 'drag': r(-hb - 2, sh - 2, 2, 1, ch.shirt); r(-hb - 3, sh - 2, 1, 1, hand); armDown(hb); break;
    case 'rake': { armDown(-hb - 1); armFwd(sh - 2, 1); const k = Math.sin(t * 6) > 0 ? 1 : 0; for (let i = 0; i < 7; i++) r(hb + 1 + i + (i > 3 ? k : 0), sh - 2 - i, 1, 1, PAL.weatheredWood); r(hb + 6 + k, 0, 3, 1, PAL.warmCharcoal); r(hb + 6 + k, 1, 1, 1, PAL.warmCharcoal); break; }
    case 'lean': armDown(-hb - 1); armFwd(sh - 1, 1); r(hb + 2, 1, 1, ch.lh + ch.th + 3, PAL.weatheredWood); r(hb + 1, 0, 3, 1, PAL.warmCharcoal); break;
    case 'swing': armDown(-hb - 1); armFwd(sh - 1, 2); r(hb + 3, sh - 1, 5, 1, PAL.weatheredWood); break;
    case 'bat': armDown(-hb - 1); r(hb, sh - 1, 1, 2, ch.shirt); r(hb, sh + 1, 1, 5, PAL.weatheredWood); break;
    case 'throw': armDown(-hb - 1); armUp(hb, 1); break;
    default: armDown(-hb - 1); armDown(hb);
  }
  const hy = ty + ch.th, hh2 = ch.hw / 2;                                  // head
  r(-hh2, hy, ch.hw, ch.hh, ch.skin);
  if (!o.back) {
    const look = pose === 'look' ? (Math.sin(t * 0.9) > 0 ? 1 : 0) : 0;
    r(0 + look, hy + 1 + (ch.hh > 3 ? 1 : 0), 1, 1, PAL.warmCharcoal); if (ch.hw > 5 || !look) r(2 + look - (ch.hw < 6 ? 0 : 0), hy + 1 + (ch.hh > 3 ? 1 : 0), 1, 1, PAL.warmCharcoal);
    if (ch.tache) r(0, hy, 3, 1, ch.tache);
  } else r(-hh2, hy, ch.hw, ch.hh - 1, ch.tail || ch.cap);
  if (ch.tail) { r(-hh2 - 1, hy + 1, 1, 2, ch.tail); if (walking && ph) r(-hh2 - 2, hy + 1, 1, 1, ch.tail); }
  const top = hy + ch.hh;
  if (ch.straw) { r(-hh2 - 2, top - 1, ch.hw + 4, 1, ch.cap); r(-hh2, top, ch.hw, 2, ch.cap); r(-hh2, top, ch.hw, 1, PAL.brickRed); }
  else { r(-hh2, top - 1, ch.hw, 2, ch.cap); r(-hh2 + 1, top + 1, ch.hw - 2, 1, ch.cap); if (!o.back) r(hh2, top - 1, ch.brim, 1, ch.cap); }
  return top + 2;
}

const WHEEL = PAL.warmCharcoal, HUB = '#8d8a84';
function wheel(r, x, y, s, phase) { r(x, y, s, s, WHEEL); const p = Math.floor(phase) & 3, hx = s > 2 ? [0, s - 1, s - 1, 0][p] : p & 1, hy = s > 2 ? [0, 0, s - 1, s - 1][p] : (p >> 1) & 1; r(x + hx, y + hy, 1, 1, HUB); }

/** Riding mower. view: 'side' | 'up' (driving away) | 'down' (driving toward the camera). Returns the seat height. */
export function drawRider(g, ox, oy, u, o = {}) {
  const vib = o.running ? (Math.sin((o.t || 0) * 75) > 0 ? 1 : 0) * (0.5 / 1) : 0, r = plotter(g, ox, oy - vib * u * 0.5, u, o.flip), ph = (o.dist || 0) / 3.2;
  const body = o.pro ? PAL.tree : '#b8443a', trim = o.pro ? PAL.brassYellow : PAL.vintageCream, dark = o.pro ? PAL.treeDeep : '#8f3229';
  if (o.view === 'side') {
    r(-5, 1, 10, 2, PAL.warmCharcoal);                                    // deck
    if (o.pro) r(-6, 1, 12, 1, PAL.brassYellow);
    r(-6, 3, 7, 3, body); r(1, 3, 6, 4, body); r(1, 6, 6, 1, dark); r(-6, 5, 7, 1, dark); r(6, 4, 1, 2, trim);
    r(-6, 6, 2, 3, PAL.warmCharcoal); r(1, 7, 1, 3, PAL.warmCharcoal); r(0, 9, 2, 1, PAL.warmCharcoal);      // seat back, column, wheel
    if (o.pro) r(4, 7, 1, 3, PAL.warmCharcoal);
    wheel(r, -7, 0, 4, ph); wheel(r, 3, 0, 3, ph * 1.3);
    return 5;
  }
  r(-6, 0, 2, 4, WHEEL); r(4, 0, 2, 4, WHEEL); r(-6, (Math.floor(ph) & 1) + 1, 2, 1, HUB); r(4, (Math.floor(ph) & 1) + 1, 2, 1, HUB);
  r(-5, 1, 10, 1, o.pro ? PAL.brassYellow : PAL.warmCharcoal);
  if (o.view === 'down') { r(-5, 2, 10, 5, body); r(-5, 6, 10, 1, dark); r(-4, 3, 2, 1, trim); r(2, 3, 2, 1, trim); r(-1, 7, 2, 2, PAL.warmCharcoal); return 6; }
  r(-5, 2, 10, 5, body); r(-5, 2, 10, 1, dark); r(-5, 6, 10, 1, trim); r(-3, 7, 6, 3, PAL.warmCharcoal); return 6;
}

/** Hand equipment drawn in front of (or behind) the worker. hands: sprite-px height of the hands. */
export function drawPush(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip), ph = (o.dist || 0) / 2.2; for (let i = 0; i < 4; i++) r(5 + i, 5 - i, 1, 1, PAL.warmCharcoal); r(8, 1, 5, 2, '#b8443a'); r(8, 3, 5, 1, '#8f3229'); r(9, 0, 4, 1, HUB); wheel(r, 7, 0, 2, ph); }
export function drawChalker(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip), ph = (o.dist || 0) / 2.2; for (let i = 0; i < 3; i++) r(5 + i, 5 - i, 1, 1, PAL.warmCharcoal); r(7, 2, 5, 4, PAL.vintageCream); r(7, 4, 5, 1, PAL.fadedNavy); r(7, 6, 5, 1, PAL.fadedNavy); wheel(r, 7, 0, 2, ph); wheel(r, 10, 0, 2, ph); }
export function drawRakeParked(g, ox, oy, u) { const r = plotter(g, ox, oy, u, false); r(0, 0, 1, 9, PAL.weatheredWood); r(-1, 8, 3, 1, PAL.warmCharcoal); r(-1, 7, 1, 1, PAL.warmCharcoal); r(1, 7, 1, 1, PAL.warmCharcoal); }

export function drawBird(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip); if (o.fly) { const up = Math.sin((o.t || 0) * 22) > 0; r(-1, 0, 3, 1, PAL.warmCharcoal); r(-2, up ? 1 : -1, 2, 1, PAL.warmCharcoal); r(1, up ? 1 : -1, 2, 1, PAL.warmCharcoal); } else { const peck = o.peck ? 1 : 0; r(-1, 0, 3, 2, PAL.warmCharcoal); r(-1, 0, 2, 1, PAL.vintageCream); r(1, 1 - peck, 2, 1, PAL.warmCharcoal); r(3, 1 - peck, 1, 1, PAL.sunFadedOrange); r(-2, 1, 1, 1, PAL.warmCharcoal); } }

/** Tree canopies, baked once into small canvases and drawn unsmoothed so they stay chunky. */
export function bakeCanopy(seed, R) {
  const n = R * 2 + 2, c = document.createElement('canvas'); c.width = n; c.height = n; const g = c.getContext('2d');
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffff) / 65536; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = x - R - 0.5, dy = y - R - 0.5, d = Math.hypot(dx, dy * 1.12), edge = R - 0.4 - rnd() * 1.4; if (d > edge) continue;
    const lit = (-dx - dy * 1.4) / R + (rnd() - 0.5) * 0.7; g.fillStyle = lit > 0.62 ? PAL.treeHi : lit < -0.55 ? PAL.treeDeep : PAL.tree; g.fillRect(x, y, 1, 1); }
  return c;
}
