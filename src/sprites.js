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
  gus: { bw: 8, th: 5, lh: 3, hw: 6, hh: 4, shirt: PAL.vintageCream, pants: '#4a5a78', boots: PAL.warmCharcoal, cap: PAL.fadedNavy, brim: 2, skin: PAL.skin, tache: '#8d8a84', braces: PAL.brickRed, belly: true, badge: PAL.brassYellow, hair: '#8d8a84' },
  frankie: { bw: 6, th: 4, lh: 3, hw: 6, hh: 4, shirt: '#7fb0c8', pants: '#4b4a52', boots: PAL.warmCharcoal, cap: PAL.sunFadedOrange, brim: 3, skin: PAL.skin, gloves: PAL.vintageCream, tail: '#7a4a2a', cheeks: '#e59a7a' },
  pearl: { bw: 6, th: 5, lh: 5, hw: 5, hh: 4, shirt: PAL.vintageCream, pants: PAL.brickRed, bib: PAL.brickRed, boots: PAL.warmCharcoal, cap: PAL.brassYellow, straw: true, skin: PAL.skinDeep, hair: '#3a2a22' },
  home: { bw: 6, th: 4, lh: 3, hw: 5, hh: 3, shirt: PAL.vintageCream, pants: PAL.vintageCream, boots: PAL.fadedNavy, cap: PAL.fadedNavy, brim: 2, skin: PAL.skin, stripe: PAL.fadedNavy, number: true },
  away: { bw: 6, th: 4, lh: 3, hw: 5, hh: 3, shirt: '#a9adb3', pants: '#a9adb3', boots: PAL.warmCharcoal, cap: PAL.brickRed, brim: 2, skin: PAL.skinDeep, stripe: PAL.brickRed, number: true },
};
export const heightOf = (c) => c.lh + c.th + c.hh + 1;

const shadeOf = (hex, k) => { const v = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(v >> 16)},${f((v >> 8) & 255)},${f(v & 255)})`; };
const SHADE = new Map(); const dark = (c, k = 0.78) => { const key = c + k; if (!SHADE.has(key)) SHADE.set(key, c[0] === '#' ? shadeOf(c, k) : c); return SHADE.get(key); };

/**
 * @param pose stand | walk | push | drag | rake | chalk | ride | cheer | sip | wave | stretch | look | lean | swing | bat | throw
 * @param o {step: feet walked, t: seconds, flip, view: 'side' | 'up' (walking away) | 'down' (toward the camera), seat: lift in sprite px}
 */
export function drawPerson(g, ox, oy, u, ch, pose, o = {}) {
  const r = plotter(g, ox, oy, u, o.flip), t = o.t || 0, walking = o.moving && pose !== 'ride', view = walking ? o.view || 'side' : 'side', back = o.back || view === 'up';
  // a four-frame stride: contact, passing (body up), contact on the other foot, passing
  const ph = walking ? Math.floor((o.step || 0) / 4.2) & 3 : 0, pass = walking && (ph & 1) === 1;
  const bob = pass ? 1 : pose === 'stretch' ? (Math.sin(t * 2.2) > 0.2 ? 1 : 0) : pose === 'cheer' ? (Math.sin(t * 11) > 0 ? 1 : 0) : 0;
  const hb = ch.bw / 2, pantsFar = dark(ch.pants, 0.74), bootFar = dark(ch.boots, 0.8);
  let y = pose === 'ride' ? (o.seat || 0) : 0;
  const shirtSh = dark(ch.shirt, 0.84), sx = o.flip ? -hb : hb - 1;                     // the side of the body away from the light
  if (pose !== 'ride') {
    if (walking && view === 'side') {                                       // side-on stride: legs swing past each other
      const far = [-3, -2, 1, 0][ph], near = [1, 0, -3, -2][ph];
      r(far, 0, 2, ch.lh, pantsFar); r(far + (ph === 2 ? 1 : 0), 0, 2, 1, bootFar);
      r(near, 0, 2, ch.lh, ch.pants); r(near + (ph === 0 ? 1 : 0), 0, 2, 1, ch.boots);
    } else if (walking) {                                                   // walking toward or away: feet lift in turn
      const lL = ph === 0 ? 1 : 0, lR = ph === 2 ? 1 : 0;
      r(-3, lL, 2, ch.lh - lL, ch.pants); r(1, lR, 2, ch.lh - lR, ch.pants); r(-3, lL, 2, 1, ch.boots); r(1, lR, 2, 1, ch.boots);
    } else { r(-3, 0, 2, ch.lh, ch.pants); r(1, 0, 2, ch.lh, ch.pants); r(-3, 0, 2, 1, ch.boots); r(1, 0, 2, 1, ch.boots); r(-1, ch.lh - 1, 2, 1, dark(ch.pants, 0.86)); }
    y += ch.lh;
  }
  y += bob; const ty = y;
  r(-hb, ty, ch.bw, ch.th, ch.shirt); r(sx, ty, 1, ch.th, shirtSh);        // torso, with its shaded side
  if (ch.belly) r(hb - 1 - (o.flip ? ch.bw - 1 : 0), ty, 1, 2, shirtSh);
  if (ch.bib) { r(-hb + 1, ty, ch.bw - 2, ch.th - 2, ch.bib); r(-hb + 1, ty + ch.th - 2, 1, 2, ch.bib); r(hb - 2, ty + ch.th - 2, 1, 2, ch.bib); }
  if (ch.braces && !back) { r(-2, ty + 1, 1, ch.th - 1, ch.braces); r(1, ty + 1, 1, ch.th - 1, ch.braces); }
  if (ch.stripe) r(-hb, ty, ch.bw, 1, ch.stripe);
  if (ch.number && back) { r(-1, ty + 1, 2, 2, ch.stripe || PAL.fadedNavy); }
  const sh = ty + ch.th - 1, hand = ch.gloves || ch.skin, hs = ch.gloves ? 2 : 1;      // arms
  const armDown = (x, swing = 0) => { r(x + swing, sh - 2, 1, 3, ch.shirt); r(x + swing - (ch.gloves && x < 0 ? 1 : 0), sh - 3, hs, 1 + (ch.gloves ? 1 : 0), hand); };
  const armUp = (x, lift) => { r(x, sh, 1, 2 + lift, ch.shirt); r(x - (ch.gloves && x < 0 ? 1 : 0), sh + 2 + lift, hs, 1 + (ch.gloves ? 1 : 0), hand); };
  const armFwd = (yy, len) => { r(hb, yy, len, 1, ch.shirt); r(hb + len, yy - (ch.gloves ? 1 : 0), hs, hs, hand); };
  const swing = walking && view === 'side' ? [-1, 0, 1, 0][ph] : 0;
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
    case 'carry': armDown(-hb - 1, swing); armFwd(sh - 2, 1); break;
    default: armDown(-hb - 1, -swing); armDown(hb, swing);
  }
  const hy = ty + ch.th, hh2 = ch.hw / 2;                                  // head
  r(-hh2, hy, ch.hw, ch.hh, ch.skin); r(o.flip ? -hh2 : hh2 - 1, hy, 1, ch.hh, dark(ch.skin, 0.88));
  if (!back) {
    const look = pose === 'look' ? (Math.sin(t * 0.9) > 0 ? 1 : 0) : 0, ey = hy + 1 + (ch.hh > 3 ? 1 : 0);
    if (view === 'down') { r(-2, ey, 1, 1, PAL.warmCharcoal); r(1, ey, 1, 1, PAL.warmCharcoal); }
    else { r(0 + look, ey, 1, 1, PAL.warmCharcoal); if (ch.hw > 5 || !look) r(2 + look, ey, 1, 1, PAL.warmCharcoal); }
    if (ch.tache) r(view === 'down' ? -1 : 0, hy, 3, 1, ch.tache);
    if (ch.cheeks && view !== 'down') r(2, hy, 1, 1, ch.cheeks);
  } else r(-hh2, hy, ch.hw, ch.hh - 1, ch.hair || ch.tail || ch.cap);
  if (ch.tail) { r(-hh2 - 1, hy + 1, 1, 2, ch.tail); if (walking && pass) r(-hh2 - 2, hy + 1, 1, 1, ch.tail); }
  const top = hy + ch.hh;
  if (ch.straw) { r(-hh2 - 2, top - 1, ch.hw + 4, 1, ch.cap); r(-hh2, top, ch.hw, 2, ch.cap); r(-hh2, top, ch.hw, 1, PAL.brickRed); }
  else { r(-hh2, top - 1, ch.hw, 2, ch.cap); r(-hh2 + 1, top + 1, ch.hw - 2, 1, ch.cap); r(o.flip ? -hh2 : hh2 - 1, top - 1, 1, 2, dark(ch.cap, 0.8)); if (!back && view !== 'down') r(hh2, top - 1, ch.brim, 1, ch.cap); if (view === 'down') r(-hh2, top - 1, ch.hw, 1, dark(ch.cap, 0.8)); if (ch.badge && !back) r(0, top, 1, 1, ch.badge); }
  return top + 2;
}

const WHEEL = PAL.warmCharcoal, HUB = '#8d8a84';
function wheel(r, x, y, s, phase) { r(x, y, s, s, WHEEL); const p = Math.floor(phase) & 3, hx = s > 2 ? [0, s - 1, s - 1, 0][p] : p & 1, hy = s > 2 ? [0, 0, s - 1, s - 1][p] : (p >> 1) & 1; r(x + hx, y + hy, 1, 1, HUB); }

/** Riding mower. view: 'side' | 'up' (driving away) | 'down' (driving toward the camera). Returns the seat height. */
export function drawRider(g, ox, oy, u, o = {}) {
  const vib = o.running ? (Math.sin((o.t || 0) * 75) > 0 ? 0.5 : 0) : 0, r = plotter(g, ox, oy - vib * u, u, o.flip), ph = (o.dist || 0) / 3.2;
  const body = o.pro ? '#3f7a4a' : '#b8443a', trim = o.pro ? PAL.brassYellow : PAL.vintageCream, deep = o.pro ? '#2f5d38' : '#8f3229', lite = o.pro ? '#5f9a55' : '#d0604f', deck = '#4a4743';
  if (o.view === 'side') {
    r(-5, 1, 11, 2, deck); r(-5, 1, 11, 1, dark(deck, 0.7));                          // cutting deck under the frame
    if (o.pro) r(-6, 2, 13, 1, PAL.brassYellow);
    r(0, 3, 7, 4, body); r(1, 7, 5, 1, body); r(1, 7, 5, 1, lite); r(6, 4, 1, 2, trim); r(0, 3, 7, 1, deep);   // hood with a lit top edge, headlight
    r(2, 5, 3, 1, trim);                                                                // decal
    r(-6, 3, 6, 3, body); r(-6, 3, 6, 1, deep);                                         // seat deck
    r(-6, 6, 4, 1, PAL.warmCharcoal); r(-6, 7, 2, 3, PAL.warmCharcoal);                 // seat and its back
    r(1, 8, 1, 2, PAL.warmCharcoal); r(0, 10, 3, 1, PAL.warmCharcoal);                  // steering column and wheel
    r(-3, 6, 1, 2, '#6a6763');                                                          // exhaust stub
    wheel(r, -7, 0, 4, ph); wheel(r, 4, 0, 3, ph * 1.3);
    return 6;
  }
  if (o.view === 'down') {                                                              // nose toward the camera: we see the driver's face over the hood
    r(-6, 0, 2, 3, WHEEL); r(4, 0, 2, 3, WHEEL); r(-6, 1 + (Math.floor(ph) & 1), 2, 1, HUB); r(4, 1 + (Math.floor(ph) & 1), 2, 1, HUB);
    r(-5, 0, 10, 1, deck); r(-4, 1, 8, 5, body); r(-4, 5, 8, 1, lite); r(-2, 1, 4, 2, PAL.warmCharcoal); r(-3, 4, 1, 1, trim); r(2, 4, 1, 1, trim);
    return 6;
  }
  // driving away: big rear wheels, the seat back and the driver's back
  r(-7, 0, 3, 5, WHEEL); r(4, 0, 3, 5, WHEEL); r(-7, 1 + (Math.floor(ph) & 3), 3, 1, HUB); r(4, 1 + (Math.floor(ph) & 3), 3, 1, HUB);
  r(-5, 0, 10, 1, deck); r(-4, 1, 8, 5, body); r(-4, 1, 8, 1, deep); r(-4, 5, 8, 1, lite); r(-1, 2, 2, 1, trim); r(3, 5, 1, 2, '#6a6763');
  r(-3, 6, 6, 3, PAL.warmCharcoal); return 6;
}

/** Hand equipment drawn in front of (or behind) the worker. hands: sprite-px height of the hands. */
export function drawPush(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip), ph = (o.dist || 0) / 2.2; for (let i = 0; i < 4; i++) r(5 + i, 5 - i, 1, 1, PAL.warmCharcoal); r(8, 1, 5, 2, '#b8443a'); r(8, 3, 5, 1, '#8f3229'); r(9, 0, 4, 1, HUB); wheel(r, 7, 0, 2, ph); }
export function drawChalker(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip), ph = (o.dist || 0) / 2.2; for (let i = 0; i < 3; i++) r(5 + i, 5 - i, 1, 1, PAL.warmCharcoal); r(7, 2, 5, 4, PAL.vintageCream); r(7, 4, 5, 1, PAL.fadedNavy); r(7, 6, 5, 1, PAL.fadedNavy); wheel(r, 7, 0, 2, ph); wheel(r, 10, 0, 2, ph); }
export function drawCat(g, ox, oy, u, o = {}) { const r = plotter(g, ox, oy, u, o.flip), c = '#3a3532', wh = PAL.vintageCream; if (o.sit) { r(-1, 0, 3, 3, c); r(0, 3, 2, 2, c); r(0, 5, 1, 1, c); r(1, 5, 1, 1, c); r(2, 0, 2, 1, c); r(-1, 0, 1, 1, wh); return; } const st = o.moving ? Math.floor((o.step || 0) / 1.5) & 1 : 0; r(-2, 1, 4, 2, c); r(2, 2, 2, 2, c); r(2, 4, 1, 1, c); r(3, 4, 1, 1, c); r(-3, 2 + (o.tail || 0), 1, 2, c); r(-2, 0, 1, 1 + st, c); r(1, 0, 1, 2 - st, c); r(3, 3, 1, 1, wh); }
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
