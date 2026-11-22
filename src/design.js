// Outfield designs: what the player draws, and the crew mows in. A design is a grid of 16 ft cells over the
// outfield; a painted cell is mown a second time in the opposite direction, which lays the blades the other way
// and inverts the stripe there, the way logos are mown into real outfields.

import { region, RG } from './geometry.js';

export const CELL = 16, DX0 = -256, DY0 = 112, COLS = 32, ROWS = 19;
export const cellCenter = (c, r) => [DX0 + (c + 0.5) * CELL, DY0 + (r + 0.5) * CELL];
export const cellAt = (x, y) => { const c = Math.floor((x - DX0) / CELL), r = Math.floor((y - DY0) / CELL); return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : r * COLS + c; };

/** Cells that lie (mostly) on outfield grass: only these can be painted. */
export const PAINTABLE = (() => { const ok = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const [x, y] = cellCenter(c, r); let n = 0; for (const [dx, dy] of [[0, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]]) if (region(x + dx, y + dy) === RG.OUTFIELD) n++; ok[r * COLS + c] = n >= 4 ? 1 : 0; }
  return ok; })();

export const emptyDesign = () => new Uint8Array(COLS * ROWS);
export const countCells = (d) => { let n = 0; for (let i = 0; i < d.length; i++) n += d[i] && PAINTABLE[i] ? 1 : 0; return n; };
/** A mask function for the surface and the router: is the point under a painted cell? */
export const maskOf = (d) => (x, y) => { const i = cellAt(x, y); return i >= 0 && d[i] === 1 && PAINTABLE[i] === 1; };

const C = [0, 268];
const inPoly = (pts, x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const star = (() => { const p = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 46 : 118; p.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); } return p; })();

/** Stamps to start from. Each is a test in world feet; the grid samples it. */
export const STAMPS = {
  clover: { name: 'Clover', test: (x, y) => { const lx = x - C[0], ly = y - C[1]; for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) if (Math.hypot(lx - Math.cos(a) * 50, ly - Math.sin(a) * 50) < 46) return true; return lx > -9 && lx < 9 && ly < -30 && ly > -118; } },
  heart: { name: 'Heart', test: (x, y) => { const u = (x - C[0]) / 88, v = (y - C[1]) / 88 + 0.1, t = u * u + v * v - 1; return t * t * t - u * u * v * v * v <= 0; } },
  star: { name: 'Star', test: (x, y) => inPoly(star, x, y) },
  ball: { name: 'Baseball', test: (x, y) => { const d = Math.hypot(x - C[0], y - C[1]); if (d > 104) return false; const seam = (sx) => Math.abs(Math.hypot(x - (C[0] + sx), y - C[1]) - 74) < 13; return !(seam(-118) || seam(118)); } },
  c: { name: 'Big C', test: (x, y) => { const d = Math.hypot(x - C[0], y - C[1]), a = Math.atan2(y - C[1], x - C[0]); return d > 58 && d < 112 && Math.abs(a) > 0.75; } },
};
export function stamp(id) { const d = emptyDesign(), t = STAMPS[id].test; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const i = r * COLS + c; if (PAINTABLE[i] && t(...cellCenter(c, r))) d[i] = 1; } return d; }

/** Save packing: one bit per cell, base64. */
export function packDesign(d) { const b = new Uint8Array(Math.ceil(d.length / 8)); for (let i = 0; i < d.length; i++) if (d[i]) b[i >> 3] |= 1 << (i & 7); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
export function unpackDesign(s) { const d = emptyDesign(); if (typeof s !== 'string' || s.length > 200) return d; let raw; try { raw = atob(s); } catch { return d; } for (let i = 0; i < d.length; i++) { const byte = raw.charCodeAt(i >> 3) || 0; if (byte & (1 << (i & 7)) && PAINTABLE[i]) d[i] = 1; } return d; }
