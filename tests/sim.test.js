// Headless tests of the simulation: the field changes only where tools go, jobs complete, the day turns over, saves round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../src/surface.js';
import { Sim, ST, JOBS } from '../src/sim.js';
import { region, RG, chalkPaths, AREAS } from '../src/geometry.js';
import { FEEL } from '../src/config.js';

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');

function fresh() { const surface = new Surface(null); surface.initWorn(1948); const events = []; const sim = new Sim(surface, (t, d) => events.push([t, d])); sim.refresh(); sim.start(); return { sim, surface, events }; }
const run = (sim, secs) => { for (let i = 0; i < secs / FEEL.SIM_DT; i++) sim.step(FEEL.SIM_DT); };
const until = (sim, fn, max = 900) => { let t = 0; while (!fn() && t < max) { sim.step(FEEL.SIM_DT); t += FEEL.SIM_DT; } return t; };

test('the diamond is where a diamond should be', () => {
  assert.equal(region(0, 0), RG.PLATE); assert.equal(region(0, 60.5), RG.MOUND); assert.equal(region(0, 64), RG.MOUND);
  assert.equal(region(0, 40), RG.INFIELD); assert.equal(region(63.64, 63.64), RG.SKIN); assert.equal(region(0, 127), RG.SKIN);
  assert.equal(region(0, 250), RG.OUTFIELD); assert.equal(region(0, 395), RG.TRACK); assert.equal(region(0, 405), RG.OUT); assert.equal(region(60, 20), RG.FOUL);
  assert.equal(chalkPaths().length, 7);
});

test('a worn field starts in poor but not hopeless shape', () => {
  const { sim } = fresh(); assert.ok(sim.cond.field > 0.15 && sim.cond.field < 0.45, `field ${sim.cond.field}`);
});

test('mowing is progressive, local, and never touches dirt', () => {
  const { sim, surface, events } = fresh(); const before = sim.refresh();
  const r = sim.assign('gus', 'mow:outfield', 'classic'); assert.ok(r.ok); const gus = sim.worker('gus');
  assert.equal(gus.state, ST.ASSIGNED); until(sim, () => gus.state === ST.WORKING, 60); assert.equal(gus.equip, 'rider');
  run(sim, 20); const mid = sim.refresh();
  assert.ok(mid.areas.outfield > before.areas.outfield + 0.05 && mid.areas.outfield < 0.9, 'partly mown');
  assert.equal(mid.areas.infield, before.areas.infield); assert.equal(mid.dirt, before.dirt); assert.equal(mid.lines, before.lines);
  const t = until(sim, () => !sim.jobs['mow:outfield']); assert.ok(t > 30 && t < 200, `took ${t}s`);
  assert.ok(sim.refresh().areas.outfield > 0.995); assert.ok(sim.stripes >= 15); assert.ok(events.some((e) => e[0] === 'stripe')); assert.equal(sim.bucks, 40);
  until(sim, () => gus.state === ST.IDLE && !gus.path, 60); assert.equal(sim.equip.rider, null); assert.equal(region(gus.x, gus.y), RG.OUT);
});

test('all patterns finish and leave two shades', () => {
  for (const p of ['classic', 'diagonal', 'checker']) { const { sim, surface } = fresh(); assert.ok(sim.assign('gus', 'mow:infield', p).ok); until(sim, () => !sim.jobs['mow:infield']);
    let a = 0, b = 0; for (let q = 0; q < surface.area.length; q++) if (surface.area[q] === AREAS.infield.id) { assert.equal(surface.rough[q], 0); (surface.shade[q] & 1) ? a++ : b++; }
    assert.ok(a > 400 && b > 400, `${p}: ${a}/${b}`); }
});

test('two workers at once; one job per area; equipment is shared honestly', () => {
  const { sim } = fresh(); assert.ok(sim.assign('gus', 'mow:outfield', 'classic').ok); assert.ok(sim.assign('frankie', 'drag:skin').ok);
  assert.match(sim.blocked('mow:outfield'), /Gus is on it/); assert.match(sim.blocked('mow:foul'), /Gus has the riding mower/); assert.match(sim.blocked('chalk:lines'), /busy/i);
  run(sim, 40); assert.equal(sim.worker('gus').state, ST.WORKING); assert.equal(sim.worker('frankie').state, ST.WORKING);
  until(sim, () => !sim.jobs['drag:skin']); assert.ok(sim.refresh().areas.skin > 0.995);
});

test('rake and chalk complete; cancel is safe', () => {
  const { sim } = fresh(); sim.assign('gus', 'chalk:lines'); sim.assign('frankie', 'rake:mound');
  until(sim, () => !sim.jobs['chalk:lines'] && !sim.jobs['rake:mound']); const c = sim.refresh(); assert.ok(c.lines > 0.995, `lines ${c.lines}`); assert.ok(c.areas.mound > 0.995);
  until(sim, () => sim.worker('gus').state === ST.IDLE, 80); sim.assign('gus', 'mow:foul'); run(sim, 30); assert.ok(sim.cancel('gus')); assert.equal(sim.jobs['mow:foul'], undefined);
  until(sim, () => sim.worker('gus').state === ST.IDLE && !sim.worker('gus').path, 80); assert.equal(sim.equip.rider, null);
  assert.ok(sim.assign('gus', 'mow:foul').ok, 'the job can be picked up again');
});

test('a full day: gates, game, summary, next morning with new wear, upgrades, save', () => {
  const { sim, surface } = fresh(); surface.finishAll(); sim.bucks = 1000;
  assert.equal(sim.gateCheck().unfinished, false); assert.ok(sim.openGates()); assert.equal(sim.mode, 'gameday');
  until(sim, () => sim.gameday.lights >= 1, 60); assert.equal(sim.light, 'night');
  const t = until(sim, () => sim.mode === 'summary', 120); assert.ok(t < 90, `vignette ${t}s`);
  assert.ok(sim.summary.total >= 100); assert.equal(sim.summary.craft, 70);
  assert.ok(sim.buy('mower') && sim.buy('crew3')); assert.equal(sim.workers.length, 3); assert.equal(sim.buy('mower'), false);
  assert.ok(sim.nextDay()); assert.equal(sim.day, 2); const c = sim.refresh(); assert.ok(c.field > 0.4 && c.field < 0.8, `morning field ${c.field}`);
  const saved = JSON.parse(JSON.stringify(sim.toSave())); const s2 = new Surface(null), sim2 = new Sim(s2); sim2.fromSave(saved);
  assert.equal(sim2.day, 2); assert.equal(sim2.bucks, sim.bucks); assert.equal(sim2.workers.length, 3); assert.ok(Math.abs(sim2.cond.field - c.field) < 0.02);
  assert.throws(() => new Sim(new Surface(null)).fromSave({ day: 2, field: { g: 'AAAA', d: 'AAAA', c: 'AAAA' } }));
});

test('skipping the game pays the same', () => {
  const a = fresh(), b = fresh(); for (const s of [a, b]) { s.surface.finishAll(); s.sim.openGates(); }
  until(a.sim, () => a.sim.mode === 'summary', 120); b.sim.gameday.skip(); assert.deepEqual(a.sim.summary, b.sim.summary);
});
