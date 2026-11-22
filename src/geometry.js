// World geometry for Cloverfield Park. Units are feet; home plate is (0,0); +y runs to centre field.
// Everything that needs to know where something is — rendering, routes, masks, picking — reads it from here.

export const S2 = Math.SQRT1_2;
export const BASE = 63.64;                    // 90 ft basepaths, rotated 45 degrees
export const HOME = [0, 0], FIRST = [BASE, BASE], SECOND = [0, 2 * BASE], THIRD = [-BASE, BASE], MOUND = [0, 60.5];
export const BOUNDS = { x0: -310, x1: 310, y0: -90, y1: 430 };
export const RES = 2;                         // surface texels per foot
export const GW = (BOUNDS.x1 - BOUNDS.x0) * RES, GH = (BOUNDS.y1 - BOUNDS.y0) * RES;
export const SKIN_R = 95, WALL_H = 11;

export const RG = { OUT: 0, OUTFIELD: 1, INFIELD: 2, FOUL: 3, SKIN: 4, MOUND: 5, PLATE: 6, TRACK: 7 };

/** distance from home to the outfield fence at angle th from the centre-field line (330 at the poles, 400 to centre) */
export const fenceR = (th) => 330 + 70 * Math.cos(2 * th);
/** width of foul territory beside a foul line, t feet up the line from home */
export const foulW = (t) => (t < 110 ? 62 : 62 - ((t - 110) / 220) * 48);
/** a point given along-line distance t and foul-side offset d from a foul line (side +1 first base, -1 third base) */
export const linePt = (side, t, d) => [side * (t + d) * S2, (t - d) * S2];

export function region(x, y) {
  const r = Math.hypot(x, y), ax = Math.abs(x), t = (ax + y) * S2, d = (ax - y) * S2;
  if (d <= 0) { const F = fenceR(Math.atan2(x, y)); if (r > F) return RG.OUT; if (r > F - 16) return RG.TRACK; }
  else if (t < 0) { if (r > 62) return RG.OUT; if (r > 53) return RG.TRACK; }
  else { if (t > 330) return RG.OUT; const w = foulW(t); if (d > w) return RG.OUT; if (d > w - 9) return RG.TRACK; }
  if (r <= 13) return RG.PLATE;
  const dm = Math.hypot(x - MOUND[0], y - MOUND[1]);
  if (dm <= 9) return RG.MOUND;
  const b1 = Math.hypot(ax - BASE, y - BASE) <= 13, b2 = Math.hypot(x, y - 2 * BASE) <= 13;
  if (ax + Math.abs(y - BASE) <= BASE - 6 && !b1 && !b2) return RG.INFIELD;
  if ((dm <= SKIN_R && d <= 3) || b1) return RG.SKIN;
  return d <= 0 ? RG.OUTFIELD : RG.FOUL;
}

// Work areas: what a job is assigned to. id is what the surface's area grid stores.
export const AREAS = {
  outfield: { id: 1, label: 'Outfield', kind: 'grass', focus: [0, 250] },
  infield: { id: 2, label: 'Infield grass', kind: 'grass', focus: [0, 64] },
  foul: { id: 3, label: 'Foul territory', kind: 'grass', focus: [0, 40] },
  skin: { id: 4, label: 'Infield dirt', kind: 'dirt', focus: [0, 90] },
  mound: { id: 5, label: 'Mound & plate', kind: 'dirt', focus: [0, 30] },
  lines: { id: 6, label: 'Chalk lines', kind: 'chalk', focus: [0, 60] },
};
export const AREA_BY_ID = Object.fromEntries(Object.entries(AREAS).map(([k, a]) => [a.id, k]));
export const areaIdOf = (rg) => (rg === RG.OUTFIELD ? 1 : rg === RG.INFIELD ? 2 : rg === RG.FOUL ? 3 : rg === RG.SKIN ? 4 : rg === RG.MOUND || rg === RG.PLATE ? 5 : 0);
export const areaAt = (x, y) => AREA_BY_ID[areaIdOf(region(x, y))] || null;

/** Chalk markings as polylines, in the order a groundskeeper lays them. Stylised sizes so they read on a phone. */
export function chalkPaths() {
  const box = (cx, cy, hw, hh) => [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]];
  const coach = (s) => [linePt(s, 60, 22), linePt(s, 60, 14), linePt(s, 80, 14), linePt(s, 80, 22)];
  const pole = 329.2 * S2;
  return [
    { id: 'catcher', pts: [[-4.5, -5], [-4.5, -11.5], [4.5, -11.5], [4.5, -5]] },
    { id: 'box-l', pts: box(-7, 0.5, 2.6, 4.2) },
    { id: 'box-r', pts: box(7, 0.5, 2.6, 4.2) },
    { id: 'line-r', pts: [[3.4, 3.4], [pole, pole]] },
    { id: 'coach-r', pts: coach(1) },
    { id: 'coach-l', pts: coach(-1) },
    { id: 'line-l', pts: [[-3.4, 3.4], [-pole, pole]] },
  ];
}
export const CHALK_HALF = 1.0;                 // half-width of a painted line, ft

// Places off the grass. The shed stands outside the third-base wall; the crew comes through a gate beside it.
export const SHED = { x: -236, y: 104, w: 34, d: 22, h: 17 };
export const GATE_T = 205;                    // where on the third-base wall the gate is (feet up the line)
export const NAV = {
  door: [-219, 99], gateOut: [-185, 106], gateIn: [-165, 125],
  idle: [[-199, 74], [-183, 68], [-214, 62]],
  park: { rider: [-256, 90], push: [-243, 76], mat: [-196, 100], rake: [-199, 107], chalker: [-228, 88] },
};

// Fielding positions for the evening game.
export const FIELDERS = { P: [0, 60.5], C: [0, -8], '1B': [58, 78], '2B': [28, 136], SS: [-30, 140], '3B': [-58, 78], LF: [-150, 245], CF: [0, 315], RF: [150, 245] };
export const DUGOUT = { home: [-70, 16], away: [70, 16] };

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
