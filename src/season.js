// The season: who is in town tonight, what tonight asks of the field, and the league table.
// Everything here is a pure function of the seed and the day, so a skipped evening and a watched one agree,
// and a reload gives the same schedule.

import { OPPONENTS, EVENTS, SEASON_GAMES, REQUESTABLE, PATTERNS } from './config.js';
import { mulberry } from './rng.js';

/** Season number and game number (1-based) for a day. */
export const seasonOf = (day) => ({ n: Math.floor((day - 1) / SEASON_GAMES) + 1, game: ((day - 1) % SEASON_GAMES) + 1 });

/** Tonight's opponent and card. Day 1 has no card: the first evening is about learning the park. */
const mix = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; };
const ORDER = ['pattern', 'kids', 'rain', 'scout', 'pattern', 'rivalry'];
const memo = new Map();
/** The card for a day: fireworks at midseason and the finale, a pattern request on day 2, otherwise a seeded pick that never repeats the night before. */
function eventOf(seed, day) {
  if (day <= 1) return null; const key = seed + ':' + day; if (memo.has(key)) return memo.get(key);
  const { game } = seasonOf(day); let e;
  if (day === 2) e = 'pattern'; else if (game === 6 || game === SEASON_GAMES) e = 'fireworks';
  else { e = ORDER[mix(seed, day * 3 + 1) % ORDER.length]; const prev = day > 2 ? eventOf(seed, day - 1) : null; if (e === prev) e = ORDER[(ORDER.indexOf(e) + 1 + (mix(seed, day) % (ORDER.length - 1))) % ORDER.length]; if (e === prev) e = 'kids'; }
  memo.set(key, e); return e;
}

export function tonight(seed, day) {
  const { n, game } = seasonOf(day), opp = OPPONENTS[(day * 3 + n) % OPPONENTS.length], event = eventOf(seed, day);
  const pattern = event === 'pattern' ? REQUESTABLE[(mix(seed, day * 7) + day) % REQUESTABLE.length] : null;
  return { day, season: n, game, opp, event, pattern, bonus: event ? EVENTS[event].bonus : 0, text: cardText(opp, event, pattern) };
}

export function cardText(opp, event, pattern) {
  const pn = pattern && PATTERNS.find((p) => p.id === pattern).name;
  switch (event) {
    case 'pattern': return `The ${opp.short}' manager wants ${pn} in the outfield.`;
    case 'scout': return 'A big-league scout is in the stands. A perfect field doubles the craft bonus.';
    case 'rain': return 'Rain overnight soaked the infield. Drag it dry before the gates open.';
    case 'kids': return "Kids' Day: they love bright, crisp chalk lines.";
    case 'fireworks': return 'Fireworks Night after the final out.';
    case 'rivalry': return `Rivalry game with the ${opp.short}. Expect a full house.`;
    default: return `The ${opp.name} are in town.`;
  }
}

/** Whether the field meets tonight's card, given the field condition and how the outfield was last mown today. */
export function cardMet(card, cond, patternDone) {
  switch (card.event) {
    case 'pattern': return patternDone.outfield === card.pattern && cond.areas.outfield >= 0.97;
    case 'rain': return cond.areas.skin >= 0.97;
    case 'kids': return cond.lines >= 0.97;
    case 'scout': return cond.field >= 0.95;
    case 'fireworks': case 'rivalry': return true;
    default: return false;
  }
}

/** The other clubs' records after `games` games, seeded so they never change once played. */
export function league(seed, season, games, clovers) {
  const teams = OPPONENTS.map((o, i) => { const r = mulberry(seed * 13 + season * 977 + i * 31); let w = 0; for (let g = 0; g < games; g++) if (r() < 0.32 + i * 0.045) w++; return { id: o.id, name: o.short, w, l: games - w }; });
  teams.push({ id: 'clovers', name: 'Clovers', w: clovers.w, l: clovers.l, us: true });
  return teams.sort((a, b) => b.w - a.w || a.l - b.l || (a.us ? -1 : b.us ? 1 : 0));
}
