// GROUNDS CREW — design tokens and feel numbers (art-direction: "Tabletop Morning").
// One place for every colour and every tuning value; nothing else hard-codes them.

export const PAL = {
  // grass
  deepEmerald: '#2f6b45', freshCut: '#86b85c', sunlit: '#9fcb6c', cutDark: '#629c49', mutedOlive: '#6f8f42', shadowGreen: '#3f6e3a', dryGrass: '#9a9a52',
  // infield
  terracotta: '#b8683f', richClay: '#a85a36', dustyCinnamon: '#a8623f', groomedEarth: '#cf8c5c', scuffDark: '#7c4a30',
  // architecture
  vintageCream: '#f1e6cf', fadedNavy: '#2b3a55', warmCharcoal: '#3a3532', weatheredWood: '#8a6a48', brickRed: '#a4493d', seatBlue: '#35506e',
  // details
  chalkWhite: '#f7f3e8', brassYellow: '#d9a441', sunFadedOrange: '#e08a4a', skyBlue: '#a9d0e6',
  // the tabletop and the slab the park stands on
  table: '#e7dcc3', tableDeep: '#d9cba9', lot: '#cbc8a4', lotEdge: '#9a9779', path: '#d8cfb0',
  tree: '#3f7a4a', treeHi: '#5f9a55', treeDeep: '#2f6b45',
  skin: '#e9b98c', skinDeep: '#c98f64',
};

// play.feel — world units are feet, time is simulation seconds.
export const FEEL = {
  SIM_DT: 1 / 30,              // fixed timestep
  WALK_SPEED: 34,              // ft/s on foot
  CARRY_SPEED: 30,             // on foot with hand equipment
  RIDER_SPEED: 46,             // riding mower, cutting or travelling
  RIDER_PRO_MULT: 1.5,         // Better Mower upgrade
  PUSH_SPEED: 22,              // walk-behind reel mower
  TURN_SLOW: 0.55,             // speed factor on the short link between two passes
  MAT_SPEED: 24,               // drag mat
  MAT_PRO_MULT: 1.6,           // Professional Drag Mat upgrade
  RAKE_SPEED: 9,
  CHALK_SPEED: 16,
  RIDER_WIDTH: 24,             // stripe width, ft
  PUSH_WIDTH: 12,
  MAT_RADIUS: 5, MAT_PRO_RADIUS: 6.5, MAT_STEP: 6.5,
  ASSIGN_HOP: 0.4, COLLECT_TIME: 1.1, FINISH_TIME: 1.3, RETURN_TIME: 0.7,
  SPRITE_FT: 2,                // one sprite pixel is two feet of world
  PANEL_IN_MS: 160, CAMERA_EASE: 0.12, LIGHT_SECONDS: 5,
  ZOOM_MAX: 4.5,
};

export const PAY = { 'mow:outfield': 40, 'mow:infield': 15, 'mow:foul': 20, 'drag:skin': 25, 'rake:mound': 10, 'chalk:lines': 20, gate: 30, craft: 70 };

export const UPGRADES = [
  { id: 'mower', name: 'Better Mower', cost: 300, blurb: 'A green pro rider. Cuts half again as fast.' },
  { id: 'mat', name: 'Pro Drag Mat', cost: 220, blurb: 'A wide steel mat. Faster, smoother infield.' },
  { id: 'patterns', name: 'Pattern Book', cost: 180, blurb: 'Adds the Diamonds cut to every mower.' },
  { id: 'crew3', name: 'Hire Pearl', cost: 450, blurb: 'A third pair of hands, straw hat included.' },
];

export const PATTERNS = [
  { id: 'classic', name: 'Classic Stripes' },
  { id: 'diagonal', name: 'Diagonal Stripes' },
  { id: 'checker', name: 'Checkerboard' },
  { id: 'diamonds', name: 'Diamonds', needs: 'patterns' },
];

export const SAVE_KEY = 'grounds-crew-save';
export const SAVE_VERSION = 1;
