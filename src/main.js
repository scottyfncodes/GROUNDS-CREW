// GROUNDS CREW — boot, the fixed-step loop, saving, and the small API the page and the tests drive.
import { FEEL } from './config.js';
import { AREAS, areaAt, dist } from './geometry.js';
import { Surface, gx, gy } from './surface.js';
import { Sim, ST, JOBS } from './sim.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { bindInput } from './input.js';
import { loadSave, writeSave, clearSave, loadSettings, writeSettings } from './save.js';

const errorBox = document.getElementById('error');
const fail = (msg) => { errorBox.textContent = `Something went wrong: ${msg}. Reloading usually fixes it.`; errorBox.hidden = false; };
addEventListener('error', (e) => fail(e.message || 'unknown error'));
addEventListener('unhandledrejection', (e) => fail((e.reason && e.reason.message) || 'unknown error'));

function boot() {
  const canvas = document.getElementById('game');
  const surface = new Surface((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const game = { settings: loadSettings(), speed: 1, paused: false, saveT: 0 };
  const sim = game.sim = new Sim(surface, (type, data) => { game.renderer && game.renderer.on(type, data); game.sound.on(type, data); if (type === 'jobdone' || type === 'buy' || type === 'newday' || type === 'summary') game.saveSoon(); });
  game.sound = new Sound(game.settings);
  const saved = loadSave(); let restored = false;
  if (saved.data) { try { sim.fromSave(saved.data); restored = true; } catch (err) { saved.error = err; clearSave(); } }
  if (!restored) { surface.initWorn(sim.seed); sim.refresh(); }
  surface.flush(true);
  const r = game.renderer = new Renderer(canvas, sim, surface);
  const ui = game.ui = new UI(game);

  const insets = () => { const land = innerWidth > innerHeight, sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
    if (sim.mode === 'title') return land ? { top: 30, bottom: 30 } : { top: Math.min(210, innerHeight * 0.3), bottom: Math.min(150, innerHeight * 0.2) };
    const cover = game.ui ? game.ui.cover() : 0; return { top: 54 + sat, bottom: cover ? cover + 8 : land && innerHeight < 520 ? 20 : 78 }; };
  const layout = () => { r.resize(); r.frame(insets()); };
  game.reframe = () => r.frame(insets());
  addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120)); if (window.visualViewport) visualViewport.addEventListener('resize', layout);

  game.start = () => { if (sim.mode !== 'title') return; sim.start(); r.userMoved = false; r.frame(insets()); if (restored && sim.day > 1) ui.toast(`Welcome back. Day ${sim.day}.`); };
  game.setSpeed = (n) => { game.speed = n; game.paused = false; };
  game.cycleSpeed = () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1; game.paused = false; };
  game.togglePause = () => { if (sim.mode === 'title' || sim.mode === 'summary') return; game.paused = !game.paused; };
  game.setVolume = (v) => { game.settings.volume = v; game.sound.applyVolume(); writeSettings(game.settings); };
  game.setMuted = (m) => { game.settings.muted = m; game.sound.applyVolume(); writeSettings(game.settings); };
  game.save = () => { if (sim.mode === 'title' && !restored) return; writeSave(sim.toSave()); game.saveT = 0; };
  game.saveSoon = () => { game.saveT = Math.max(game.saveT, 19.2); };
  game.openGates = () => { r.reset(); sim.openGates(); game.paused = false; };
  game.skipGame = () => { if (sim.gameday) sim.gameday.skip(); };
  game.nextDay = () => { sim.nextDay(); game.speed = 1; r.reset(); game.save(); };
  game.resetProgress = () => { clearSave(); location.reload(); };

  /** A tap on the world: a groundskeeper first, then whatever part of the field is under the finger. */
  game.tap = (px, py) => {
    game.sound.unlock(); if (sim.mode !== 'day') { if (sim.mode === 'gameday') return; return; }
    let best = null, bd = 30; for (const w of sim.workers) { const b = r.workerBox(w), dx = Math.max(b.x0 - px, 0, px - b.x1), dy = Math.max(b.y0 - py, 0, py - b.y1), d = Math.hypot(dx, dy); if (d < 14 && d < bd) { bd = d; best = w; } }
    if (best) { game.sound.click(); ui.openWorker(best.id); return; }
    const found = [], add = (a) => { if (a && !found.includes(a)) found.push(a); }, rad = 16, [x0, y0] = r.toWorld(px, py); add(areaAt(x0, y0));
    let chalk = false; for (let a = 0; a < 8; a++) { const [x, y] = r.toWorld(px + Math.cos(a * 0.785) * rad, py + Math.sin(a * 0.785) * rad); add(areaAt(x, y)); }
    const R = Math.ceil(rad / r.cam.s * 2), ci = gx(x0), cj = gy(y0); for (let dj = -R; dj <= R && !chalk; dj += 2) for (let di = -R; di <= R; di += 2) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < surface.canvas.width && j < surface.canvas.height && di * di + dj * dj <= R * R && surface.chalkM[j * surface.canvas.width + i]) { chalk = true; break; } }
    if (chalk) add('lines');
    if (!found.length) { ui.close(); return; }
    game.sound.click(); const sel = ui.kind === 'worker' && sim.worker(ui.ctx.id).state === ST.IDLE ? ui.ctx.id : null; ui.openArea(found, sel);
  };
  bindInput(canvas, r, game.tap);

  document.addEventListener('visibilitychange', () => { if (document.hidden) { game.save(); game.sound.suspend(true); } else { game.sound.suspend(false); last = performance.now(); } });
  addEventListener('pagehide', () => game.save());

  // ---- the loop: real time in, fixed simulation steps out -------------------------------------------------
  let last = performance.now(), acc = 0;
  const stepSim = (n) => { for (let i = 0; i < n; i++) sim.step(FEEL.SIM_DT); };
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    const running = sim.mode !== 'title' && sim.mode !== 'summary' && !game.paused, simDt = running ? dt * game.speed : 0;
    acc += simDt; let n = Math.floor(acc / FEEL.SIM_DT); if (n > 14) { n = 14; acc = n * FEEL.SIM_DT; } acc -= n * FEEL.SIM_DT; stepSim(n);
    r.draw(running ? acc / FEEL.SIM_DT : 1, dt, simDt); ui.update(dt); game.sound.update(sim, dt, !running);
    if (sim.mode !== 'title' && (game.saveT += dt) > 20) game.save();
    requestAnimationFrame(frame);
  }

  // ---- state for tests, captures and PLAYCRAFT ---------------------------------------------------------------
  const test = {
    assign: (who, type, pattern) => { const key = Object.keys(JOBS).find((k) => k === type || k.startsWith(type + ':')); return sim.assign(who, key, pattern).ok; },
    advance: (secs) => stepSim(Math.round(secs / FEEL.SIM_DT)),
    advanceTo: (what) => { for (let i = 0; i < 9000; i++) { const j = sim.jobs['mow:outfield'], seg = j && j.segs[j.si]; if (what === 'before-first-stripe' && seg && j.worker.state === ST.WORKING && seg.work && dist(seg.a, seg.b) >= 140 && dist(seg.a, seg.b) - j.sd < 70) break; sim.step(FEEL.SIM_DT); } },
    finishAll: () => { sim.workers.forEach((w) => { if (w.job) sim.cancel(w.id); }); surface.finishAll(); sim.refresh(); },
    skipGame: () => game.skipGame(), give: (n) => { sim.bucks += n; }, game,
  };
  window.__game = {
    get state() { return sim.mode; }, get playing() { return sim.mode === 'day' || sim.mode === 'gameday'; }, get day() { return sim.day; }, get score() { return sim.bucks; }, get bucks() { return sim.bucks; }, get time() { return sim.time; }, get speed() { return game.paused ? 0 : game.speed; },
    get stats() { const c = sim.cond || sim.refresh(); return { grass: c.grass, dirt: c.dirt, lines: c.lines, field: c.field, stripes: sim.stripes, firstStripe: sim.firstStripe, jobsDone: sim.doneToday, areas: c.areas }; },
    get gameday() { const g = sim.gameday; return g ? { phase: g.phase, lights: g.lights, crowd: g.crowd, home: g.board.home, away: g.board.away } : null; },
    get workers() { return sim.workers.map((w) => ({ id: w.id, state: w.state, x: w.x, y: w.y, equip: w.equip, job: w.job ? w.job.key : null })); },
    test,
  };

  // identity: the approved palette drives the page chrome, the logo is shown in Settings
  fetch('assets/brand/palette.json').then((res) => (res.ok ? res.json() : null)).then((pal) => { if (!pal) return; const ok = (v) => /^#[0-9a-f]{6}$/i.test(v), root = document.documentElement.style;
    if (ok(pal.background)) { root.setProperty('--table', pal.background); const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = pal.background; } if (ok(pal.primary)) root.setProperty('--navy', pal.primary); if (ok(pal.accent)) root.setProperty('--brass', pal.accent); }).catch(() => {});
  fetch('assets/brand/logo.svg').then((res) => (res.ok ? res.text() : '')).then((svg) => { if (svg.includes('<svg') && !/<script|onload=|javascript:/i.test(svg)) game.logo = svg; }).catch(() => {});

  document.body.dataset.mode = 'title'; layout();
  if (saved.error) ui.toast('Your saved park could not be read, so this is a fresh one.');
  const ready = () => { document.getElementById('title').dataset.ready = '1'; };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(ready)));
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

try { boot(); } catch (err) { fail(err.message); throw err; }
