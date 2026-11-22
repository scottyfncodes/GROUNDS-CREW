// The interface: a compact top bar, a bottom bar, one small sheet at a time. The stadium stays the subject.
import { UPGRADES, PATTERNS, PAY, SEASON_GAMES } from './config.js';
import { AREAS } from './geometry.js';
import { JOBS, JOB_OF_AREA, ST } from './sim.js';
import { STAMPS, stamp, emptyDesign, countCells, PAINTABLE, COLS, ROWS, cellCenter } from './design.js';
import { region, RG } from './geometry.js';
import { makePostcard, sharePostcard } from './postcard.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const X = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15"/></svg>';
const gem = '<i class="gem" aria-hidden="true"></i>';
const word = (kind, c) => (c >= 0.97 ? (kind === 'grass' ? 'Fresh cut' : kind === 'dirt' ? 'Smooth' : 'Crisp') : c >= 0.6 ? (kind === 'grass' ? 'Growing out' : kind === 'dirt' ? 'Scuffed' : 'Fading') : kind === 'grass' ? 'Shaggy' : kind === 'dirt' ? 'Torn up' : 'Faint');
const pips = (c) => `<span class="pips" aria-hidden="true">${[0.2, 0.4, 0.6, 0.8, 0.97].map((t) => `<i class="${c >= t ? 'on' : ''}"></i>`).join('')}</span>`;

export class UI {
  constructor(game) {
    this.game = game; this.kind = null; this.ctx = null; this.cache = {}; this.tick = 0; this.toastT = 0; this.promptKey = '';
    const g = game, click = (id, fn) => $(id).addEventListener('click', (e) => { g.sound.unlock(); g.sound.click(); fn(e); });
    click('start', () => g.start());
    click('tab-crew', () => this.toggle('crew')); click('tab-tasks', () => this.toggle('tasks')); click('tab-shop', () => this.toggle('shop')); click('chip-field', () => this.toggle('tasks'));
    click('settings', () => this.toggle('settings')); click('pause', () => g.togglePause()); click('speed', () => g.cycleSpeed());
    click('open-gates', () => this.gates()); click('today', () => { this.hideCard(); this.open('tasks'); }); click('skip', () => g.skipGame()); click('recenter', () => { const m = $('recenter').dataset.mode; if (m === 'wide') g.setDirector(false); else if (m === 'follow') g.setDirector(true); else g.renderer.reset(); });
    $('sheet').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; g.sound.unlock(); g.sound.click(); this.act(b.dataset.act, b.dataset.arg); });
    $('sheet').addEventListener('input', (e) => { if (e.target.id === 'volume') g.setVolume(e.target.value / 100); });
    $('summary').addEventListener('click', (e) => { if (e.target.closest('#next-day')) { g.sound.click(); g.nextDay(); } else if (e.target.closest('#postcard')) { g.sound.click(); this.postcard(); } });
    this.bindPad();
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; const k = e.key;
      if (g.sim.mode === 'title' && (k === ' ' || k === 'Enter')) { e.preventDefault(); g.sound.unlock(); g.start(); return; }
      if (k === 'Escape') this.close(); else if (k === ' ') { e.preventDefault(); g.togglePause(); } else if (k === '1' || k === '2' || k === '4') g.setSpeed(+k); else if (k === '0') g.renderer.reset();
      else if (g.sim.mode === 'day' && !e.target.closest('button, a')) { const kk = k.toLowerCase(); if (k === 'Enter' || kk === 't') this.toggle('tasks'); else if (kk === 'c') this.toggle('crew'); else if (kk === 's') this.toggle('shop'); else if (kk === 'g') this.gates(); }
      else if (g.sim.mode === 'summary' && k === 'Enter') g.nextDay(); else if (g.sim.mode === 'gameday' && k === 'Enter') g.skipGame(); });
  }

  // ---- sheets ------------------------------------------------------------------------------------------

  toggle(kind) { if (this.kind === kind) this.close(); else this.open(kind); }
  open(kind, ctx = {}) { this.kind = kind; this.ctx = ctx; this.render(); const s = $('sheet'); s.hidden = false; s.dataset.kind = kind; s.scrollTop = 0; this.sync(); this.game.reframe(); }
  close() { if (!this.kind) return; this.kind = null; this.ctx = null; $('sheet').hidden = true; delete $('sheet').dataset.kind; this.sync(); this.game.reframe(); }
  /** How much of the bottom of the screen the open sheet covers (portrait), so the park can be framed above it. */
  cover() { const s = $('sheet'); if (s.hidden || innerWidth > innerHeight) return 0; return innerHeight - s.getBoundingClientRect().top; }
  sync() {
    const r = this.game.renderer, k = this.kind, c = this.ctx || {};
    r.selected = k === 'area' ? c.area : k === 'worker' ? c.id : c.worker || null; r.preview = k === 'design' ? { area: 'outfield', pattern: 'design' } : k === 'area' && JOBS[JOB_OF_AREA[c.area]].patterned ? { area: c.area, pattern: c.pattern } : null; if (k === 'design') r.selected = null;
    for (const t of ['crew', 'tasks', 'shop']) $('tab-' + t).setAttribute('aria-expanded', String(k === t));
  }
  openArea(areas, worker) { const area = areas[0], sim = this.game.sim; this.open('area', { area, areas, worker: worker || null, pattern: sim.patterns[area] || 'classic' }); }
  openWorker(id) { this.open('worker', { id }); }

  head(title, sub) { return `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div><button class="x" type="button" data-act="close" aria-label="Close">${X}</button></div>`; }

  render() {
    const sim = this.game.sim, c = this.ctx, el = $('sheet'), cond = sim.cond || sim.refresh(); let h = '';
    if (this.kind === 'area') {
      const key = JOB_OF_AREA[c.area], def = JOBS[key], a = AREAS[c.area], v = cond.areas[c.area], active = sim.jobs[key];
      const who = c.worker ? sim.worker(c.worker) : sim.freeWorker(), why = sim.blocked(key, c.worker || undefined);
      h += this.head(a.label, `${word(a.kind, v)} · ${Math.round(v * 100)}%`);
      if (c.areas.length > 1) h += `<div class="tabs" role="tablist">${c.areas.map((k) => `<button class="opt" type="button" role="tab" aria-selected="${k === c.area}" data-act="area" data-arg="${k}">${esc(AREAS[k].label)}</button>`).join('')}</div>`;
      if (def.patterned && !active) { const req = c.area === 'outfield' && sim.card.event === 'pattern' ? sim.card.pattern : null; h += `<div class="opts" role="group" aria-label="Mowing pattern">${sim.patternsOwned(c.area).map((p) => p.id === 'design' ? `<button class="opt" type="button" data-act="draw" aria-pressed="${c.pattern === 'design'}"><i class="swatch swatch--design"></i>${countCells(sim.design) ? esc(sim.designName) : 'Draw your own'}${sim.card.event === 'art' ? '<span class="tag">ASKED</span>' : !sim.designsMowed ? '<span class="tag">NEW</span>' : ''}</button>` : `<button class="opt" type="button" aria-pressed="${p.id === c.pattern}" data-act="pattern" data-arg="${p.id}"><i class="swatch swatch--${p.id}"></i>${esc(p.name)}${p.id === req ? '<span class="tag">ASKED</span>' : ''}</button>`).join('')}</div>`; }
      if (active) h += `<p class="sub">${esc(sim.statusOf(active.worker))} (${esc(active.worker.name)})</p><div class="actions"><button class="enamel enamel--quiet" type="button" data-act="watch" data-arg="${active.worker.id}">Watch</button><button class="enamel enamel--quiet" type="button" data-act="cancel" data-arg="${active.worker.id}">Call it off</button></div>`;
      else { h += `<button class="enamel" type="button" data-act="assign" ${why ? 'disabled' : ''}>${why || !who ? esc(def.label) : `Send ${esc(who.name)}`}</button>`; if (why) h += `<p class="why">${esc(why)}.</p>`; else if (sim.paid[key]) h += `<p class="sub" style="text-align:center;margin-top:8px">Already paid for today. Do it again for the love of it.</p>`; }
    } else if (this.kind === 'design') {
      const n = countCells(sim.design), who = c.worker ? sim.worker(c.worker) : sim.freeWorker(), why = sim.blocked('mow:outfield', c.worker || undefined);
      h += this.head('Draw for the blimp', 'Paint with a finger. Pinch to zoom in.') + `<div class="padview" id="padview"><canvas class="pad" id="pad" width="${COLS * 20}" height="${ROWS * 20}" aria-label="Outfield drawing pad. Pinch to zoom."></canvas><div class="padzoom"><button type="button" class="pz" data-act="padzoom" data-arg="out" aria-label="Zoom out">−</button><button type="button" class="pz" data-act="padzoom" data-arg="in" aria-label="Zoom in">+</button></div></div>`;
      h += `<div class="opts" role="group" aria-label="Brush"><button class="opt" type="button" data-act="tool" data-arg="paint" aria-pressed="${c.tool !== 'erase'}">Paint</button><button class="opt" type="button" data-act="tool" data-arg="erase" aria-pressed="${c.tool === 'erase'}">Erase</button>${Object.entries(STAMPS).map(([id, st]) => `<button class="opt" type="button" data-act="stamp" data-arg="${id}">${esc(st.name)}</button>`).join('')}<button class="opt" type="button" data-act="clear">Clear</button></div>`;
      h += `<div class="actions"><button class="enamel enamel--quiet" type="button" data-act="back">Back</button><button class="enamel" type="button" data-act="mow-design" ${why || !n ? 'disabled' : ''}>${!n ? 'Draw first' : why ? esc(why) : `Send ${esc(who.name)}`}</button></div>`;
    } else if (this.kind === 'worker') {
      const w = sim.worker(c.id); h += this.head(w.name, w.bio) + `<p class="set"><span id="w-status">${esc(sim.statusOf(w))}</span></p>`;
      h += `<div class="actions"><button class="enamel enamel--quiet" type="button" data-act="watch" data-arg="${w.id}">${this.game.renderer.follow === w.id ? 'Stop watching' : 'Watch'}</button>${w.job ? `<button class="enamel enamel--quiet" type="button" data-act="cancel" data-arg="${w.id}">Call it off</button>` : ''}</div>`;
      if (w.state === ST.IDLE && sim.mode === 'day') h += `<p class="sub" style="text-align:center;margin-top:12px">Tap part of the field to give ${esc(w.name)} a job.</p>`;
    } else if (this.kind === 'crew') {
      h += this.head('The crew', `${sim.workers.length} on the clock`) + `<div class="rows">${sim.workers.map((w) => `<button class="row" type="button" data-act="worker" data-arg="${w.id}"><span><b>${esc(w.name)}</b><span data-status="${w.id}">${esc(sim.statusOf(w))}</span></span><span class="state">${w.job ? Math.round(sim.jobProgress(w.job) * 100) + '%' : 'Free'}</span></button>`).join('')}</div>`;
    } else if (this.kind === 'tasks') {
      h += this.head("Today's work", `Field is at ${Math.round(cond.field * 100)}%`) + this.tonightBlock() + `<p class="field-line"><span>Grass <b>${Math.round(cond.grass * 100)}%</b></span><span>Dirt <b>${Math.round(cond.dirt * 100)}%</b></span><span>Lines <b>${Math.round(cond.lines * 100)}%</b></span></p><div class="rows">`;
      for (const key in JOBS) { const def = JOBS[key], v = cond.areas[def.area], job = sim.jobs[key], done = v >= 0.97;
        h += `<button class="row" type="button" data-act="goto" data-arg="${def.area}"><span><b>${esc(def.label)}</b><span>${pips(v)}${esc(word(AREAS[def.area].kind, v))}</span></span><span class="state ${done && !job ? 'ok' : ''}">${job ? `${esc(job.worker.name)} · ${Math.round(sim.jobProgress(job) * 100)}%` : done ? 'Done' : sim.paid[key] ? 'Touch up' : `${gem}${PAY[key]}`}</span></button>`; }
      h += '</div>';
    } else if (this.kind === 'shop') {
      const item = (u) => { const own = sim.upgrades[u.id], can = sim.bucks >= u.cost; return `<button class="row" type="button" data-act="buy" data-arg="${u.id}" ${own || !can ? 'disabled' : ''}><span><b>${esc(u.name)}</b><span>${esc(u.blurb)}</span></span><span class="state ${own ? 'ok' : 'price'}">${own ? 'Owned' : gem + u.cost}</span></button>`; };
      h += this.head('Equipment shed', `You have ${sim.bucks} Grounds Bucks`) + `<p class="group">Equipment</p><div class="rows">${UPGRADES.filter((u) => u.kind === 'equipment').map(item).join('')}</div><p class="group">The ballpark</p><div class="rows">${UPGRADES.filter((u) => u.kind === 'ballpark').map(item).join('')}</div>`; if (false) h += `<div class="rows">${UPGRADES.map((u) => { const own = sim.upgrades[u.id], can = sim.bucks >= u.cost; return `<button class="row" type="button" data-act="buy" data-arg="${u.id}" ${own || !can ? 'disabled' : ''}><span><b>${esc(u.name)}</b><span>${esc(u.blurb)}</span></span><span class="state ${own ? 'ok' : 'price'}">${own ? 'Owned' : gem + u.cost}</span></button>`; }).join('')}</div>`;
    } else if (this.kind === 'settings') {
      const st = this.game.settings; h += this.head('Settings', `Season ${sim.card.season}, game ${sim.card.game} · all-time ${sim.record.w}–${sim.record.l}`);
      h += `<div class="set"><span>Sound</span><button class="opt" type="button" data-act="mute" aria-pressed="${!st.muted}">${st.muted ? 'Off' : 'On'}</button></div><label class="set"><span>Volume</span><input id="volume" type="range" min="0" max="100" value="${Math.round(st.volume * 100)}" aria-label="Volume"></label>`;
      h += `<div class="set"><span>Camera</span><button class="opt" type="button" data-act="recenter">Whole park</button></div><div class="set"><span>Progress</span><button class="opt" type="button" data-act="${c.confirm ? 'reset-yes' : 'reset'}">${c.confirm ? 'Yes, start over' : 'Start over'}</button></div>`;
      if (c.confirm) h += `<p class="why">This clears your days, bucks, upgrades and the field. Tap again to confirm.</p>`;
      if (this.game.logo) h += `<div class="logo" role="img" aria-label="GROUNDS CREW, Cloverfield Park">${this.game.logo}</div>`;
      h += `<p class="about">Tap the field or a groundskeeper. Drag to look around, pinch to zoom, double-tap to see the whole park. Keys: Enter or T tasks, C crew, S shop, G gates, Space pause, 1/2/4 speed.<br><span class="haveanapp-byline" data-haveanapp>GROUNDS CREW <a class="haveanapp-byline__by" href="https://haveanapp.com" rel="noopener" target="_blank">by HaveAnApp</a></span></p>`;
    } else if (this.kind === 'unfinished') {
      const pct = Math.round(c.check.field * 100); h += this.head('Open the gates?', c.check.busy ? 'The crew is still out there.' : `The field is at ${pct}%.`);
      h += `<p class="sub">${c.check.busy ? 'They will put their gear away and clear the field first. ' : ''}${pct < 90 ? 'A rougher field means a smaller craftsmanship bonus, nothing worse.' : 'Looks ready.'}</p><div class="actions"><button class="enamel enamel--quiet" type="button" data-act="close">Keep working</button><button class="enamel" type="button" data-act="gates-yes">Open them</button></div>`;
    }
    el.innerHTML = h; if (this.kind === 'design') { this.drawPad(); this.applyPadZoom(); }
  }

  act(act, arg) {
    const g = this.game, sim = g.sim, c = this.ctx;
    switch (act) {
      case 'close': this.close(); break;
      case 'area': c.area = arg; c.pattern = sim.patterns[arg] || 'classic'; this.render(); this.sync(); g.reframe(); break;
      case 'pattern': c.pattern = arg; this.render(); this.sync(); break;
      case 'draw': this.padZ = { s: 1, x: 0, y: 0 }; this.open('design', { worker: c.worker, tool: 'paint', from: c }); g.renderer.focus([0, 250]); g.renderer.userMoved = false; break;
      case 'tool': c.tool = arg; this.render(); this.drawPad(); break;
      case 'padzoom': { const v = $('padview'); if (v) this.zoomPad(arg === 'in' ? 1.6 : 1 / 1.6, v.clientWidth / 2, v.clientHeight / 2); break; }
      case 'stamp': sim.setDesign(stamp(arg), STAMPS[arg].name); this.render(); this.drawPad(); this.sync(); break;
      case 'clear': sim.setDesign(emptyDesign(), 'Your design'); this.render(); this.drawPad(); this.sync(); break;
      case 'back': { const from = c.from || { areas: ['outfield'], area: 'outfield' }; this.open('area', { ...from, pattern: countCells(sim.design) ? 'design' : sim.patterns.outfield }); break; }
      case 'mow-design': { const res = sim.assign(c.worker || (sim.freeWorker() || {}).id, 'mow:outfield', 'design'); if (res.ok) { this.close(); g.saveSoon(); } else this.toast(res.reason); break; }
      case 'assign': { const key = JOB_OF_AREA[c.area], res = sim.assign(c.worker || (sim.freeWorker() || {}).id, key, c.pattern); if (res.ok) { this.close(); g.saveSoon(); } else { this.toast(res.reason); this.render(); } break; }
      case 'cancel': sim.cancel(arg); this.render(); break;
      case 'watch': g.renderer.follow = g.renderer.follow === arg ? null : arg; if (g.renderer.follow) { g.renderer.userMoved = true; this.close(); } else { g.renderer.reset(); this.render(); } break;
      case 'worker': g.renderer.focus([sim.worker(arg).x, sim.worker(arg).y]); this.openWorker(arg); break;
      case 'goto': g.renderer.focus(AREAS[arg].focus); this.openArea([arg]); break;
      case 'buy': if (sim.buy(arg)) { this.render(); g.saveSoon(); this.toast(`${UPGRADES.find((u) => u.id === arg).name} is yours.`); if (arg !== 'patterns') { this.close(); const at = { bunting: [0, -90], flowers: [0, -120], ivy: [0, 330], crew3: [-205, 80] }[arg] || [-215, 96]; g.renderer.focus(at, g.renderer.home.s * 1.7); } } break;
      case 'mute': g.setMuted(!g.settings.muted); this.render(); break;
      case 'recenter': g.renderer.reset(); this.close(); break;
      case 'reset': c.confirm = true; this.render(); break;
      case 'reset-yes': g.resetProgress(); break;
      case 'gates-yes': this.close(); g.openGates(); break;
    }
  }

  tonightBlock() { const sim = this.game.sim, c = sim.card; if (!c.event) return `<p class="tonight"><b>Tonight:</b> the ${esc(c.opp.name)}. Game ${c.game} of ${SEASON_GAMES}.</p>`; const met = sim.cardMet();
    return `<p class="tonight"><b>Tonight, ${esc(c.opp.short)}:</b> ${esc(c.text)}${c.bonus ? ` <span class="${met ? 'ok' : 'no'}">${met ? `✓ +${c.bonus}` : `+${c.bonus} if done`}</span>` : met ? ' <span class="ok">✓</span>' : ''}</p>`; }
  /** Show tonight's card for a few seconds at the start of a day. */
  showCard() { const sim = this.game.sim, c = sim.card, el = $('today'); el.innerHTML = `<b>vs ${esc(c.opp.name)} <span>GAME ${c.game} OF ${SEASON_GAMES}</span></b><p>${esc(c.text)}${c.bonus ? ` <strong>+${c.bonus}</strong>` : ''}</p>`; el.hidden = false; this.cardT = 9; }
  hideCard() { $('today').hidden = true; this.cardT = 0; }
  /** The drawing pad: the outfield seen straight down, one square per 16 ft; drag to paint or erase. */
  drawPad() {
    const cv = $('pad'); if (!cv) return; const g = cv.getContext('2d'), d = this.game.sim.design, z = 20; g.clearRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const i = r * COLS + c, [x, y] = cellCenter(c, r), rg = region(x, y), px = c * z, py = (ROWS - 1 - r) * z;
      let col = null; if (PAINTABLE[i]) col = d[i] ? '#4b8a3e' : ((c + r) & 1 ? '#9fcb6c' : '#95c264'); else if (rg === RG.TRACK) col = '#a8623f'; else if (rg === RG.SKIN || rg === RG.MOUND) col = '#cf8c5c'; else if (rg === RG.INFIELD || rg === RG.FOUL || rg === RG.OUTFIELD) col = '#86b85c';
      if (!col) continue; g.fillStyle = col; g.fillRect(px, py, z, z); if (PAINTABLE[i] && d[i]) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(px, py + z - 3, z, 3); } }
    g.strokeStyle = 'rgba(43,58,85,.12)'; g.lineWidth = 1; for (let c = 1; c < COLS; c++) { g.beginPath(); g.moveTo(c * z + 0.5, 0); g.lineTo(c * z + 0.5, cv.height); g.stroke(); } for (let r = 1; r < ROWS; r++) { g.beginPath(); g.moveTo(0, r * z + 0.5); g.lineTo(cv.width, r * z + 0.5); g.stroke(); }
    const sub = $('sheet').querySelector('.sub'); if (sub) sub.textContent = countCells(d) ? `${countCells(d)} square${countCells(d) === 1 ? '' : 's'}. Pinch to zoom in.` : 'Paint with a finger. Pinch to zoom in.';
  }
  /** Zoom the pad around a point in the viewport (px), keeping that point under the finger; the pad always fills the view. */
  zoomPad(f, px, py) {
    const z = this.padZ || (this.padZ = { s: 1, x: 0, y: 0 }), v = $('padview'); if (!v) return; const s2 = Math.min(4, Math.max(1, z.s * f)), k = s2 / z.s;
    z.x = px - (px - z.x) * k; z.y = py - (py - z.y) * k; z.s = s2; this.applyPadZoom();
  }
  applyPadZoom() {
    const z = this.padZ || (this.padZ = { s: 1, x: 0, y: 0 }), v = $('padview'), cv = $('pad'); if (!v || !cv) return; const w = v.clientWidth, h = v.clientHeight;
    z.x = Math.min(0, Math.max(w - w * z.s, z.x)); z.y = Math.min(0, Math.max(h - h * z.s, z.y)); cv.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`; v.dataset.zoomed = z.s > 1.01 ? '1' : '';
  }
  /** One finger paints; two fingers pinch to zoom and drag to pan; the wheel zooms on a desktop. */
  bindPad() {
    const sheet = $('sheet'), pts = new Map(); let painting = null, before = null, pinch = null;
    const at = (e) => { const cv = $('pad'), b = cv.getBoundingClientRect(), c = Math.floor((e.clientX - b.left) / b.width * COLS), r = ROWS - 1 - Math.floor((e.clientY - b.top) / b.height * ROWS); return c >= 0 && r >= 0 && c < COLS && r < ROWS ? r * COLS + c : -1; };
    const paint = (e) => { const i = at(e), sim = this.game.sim; if (i < 0 || !PAINTABLE[i] || sim.design[i] === painting) return; const d = sim.design.slice(); d[i] = painting; sim.setDesign(d, countCells(d) ? (sim.designName === 'Your design' || !sim.designName ? 'Your design' : sim.designName) : 'Your design'); this.drawPad(); this.dirtyPad = true; };
    const local = (p) => { const b = $('padview').getBoundingClientRect(); return [p.x - b.left, p.y - b.top]; };
    const two = () => { const [a, b] = [...pts.values()]; return { mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const inPad = (e) => e.target.closest && e.target.closest('#padview') && !e.target.closest('.padzoom');
    sheet.addEventListener('pointerdown', (e) => { if (!inPad(e)) return; e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.game.sound.unlock();
      if (pts.size === 1) { painting = this.ctx && this.ctx.tool === 'erase' ? 0 : 1; before = this.game.sim.design.slice(); paint(e); }
      else if (pts.size === 2) { // a second finger: this is a pinch, not a stroke; take back anything the first finger painted
        if (painting !== null && before) { this.game.sim.setDesign(before, this.game.sim.designName); this.drawPad(); } painting = null; this.dirtyPad = false; pinch = two(); } });
    sheet.addEventListener('pointermove', (e) => { const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2 && pinch) { const now = two(), z = this.padZ || (this.padZ = { s: 1, x: 0, y: 0 }); this.zoomPad(now.d / Math.max(1, pinch.d), pinch.mid[0], pinch.mid[1]); z.x += now.mid[0] - pinch.mid[0]; z.y += now.mid[1] - pinch.mid[1]; this.applyPadZoom(); pinch = now; }
      else if (painting !== null) paint(e); });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (painting === null || pts.size) return; painting = null; before = null; if (this.dirtyPad) { this.dirtyPad = false; this.render(); this.drawPad(); this.sync(); } };
    sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('wheel', (e) => { if (!inPad(e)) return; e.preventDefault(); const [x, y] = local({ x: e.clientX, y: e.clientY }); this.zoomPad(Math.exp(-e.deltaY * 0.002), x, y); }, { passive: false });
  }
  async postcard() {
    const s = this.game.sim.summary; if (!s) return; const b = $('postcard'); b.disabled = true;
    try { const blob = await makePostcard(this.game.sim.surface, s), how = await sharePostcard(blob, `cloverfield-day-${s.day}.png`); if (how === 'saved') this.toast('Postcard saved.'); else if (how === 'shared') this.toast('Postcard sent.'); }
    catch { this.toast('Could not make the postcard.'); } finally { b.disabled = false; }
  }
  gates() { const g = this.game, check = g.sim.gateCheck(); if (check.unfinished) this.open('unfinished', { check }); else g.openGates(); }
  toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; this.toastT = 2.6; }
  set(id, text) { if (this.cache[id] !== text) { this.cache[id] = text; $(id).textContent = text; } }

  /** Called every frame; touches the DOM only when something it shows has changed. */
  update(dt) {
    const g = this.game, sim = g.sim, cond = sim.cond, body = document.body;
    if (body.dataset.mode !== sim.mode && body.dataset.mode !== 'loading') { body.dataset.mode = sim.mode; if (sim.mode !== 'day' && this.kind && this.kind !== 'settings') this.close(); this.onMode(); }
    this.set('chip-day', `DAY ${sim.day}`); this.set('bucks', String(sim.bucks)); if (cond) this.set('field', `${Math.round(cond.field * 100)}%`);
    this.set('speed', `${g.speed}×`); const paused = g.paused; if (this.cache.paused !== paused) { this.cache.paused = paused; $('pause').setAttribute('aria-pressed', String(paused)); $('pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause'); }
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').hidden = true;
    if (this.cardT > 0 && ((this.cardT -= dt) <= 0 || this.kind)) this.hideCard();
    { const on = sim.mode === 'gameday' && sim.gameday && sim.gameday.phase === 'blimp'; if (this.cache.bc !== on) { this.cache.bc = on; const b = $('broadcast'); b.hidden = !on; if (on) { $('bc-look').textContent = sim.gameday.look; const st = sim.gameday.stars; $('bc-stars').textContent = '★'.repeat(st) + '☆'.repeat(3 - st); $('bc-stars').setAttribute('aria-label', `${st} of 3 stars`); } } }
    const gd = sim.gameday, cap = sim.mode === 'gameday' && gd && gd.phase !== 'blimp' ? gd.caption : ''; if (this.cache.cap !== cap) { this.cache.cap = cap; $('caption').textContent = cap; $('caption').hidden = !cap; }
    // one camera chip: back to the whole park, or back to following the crew
    { const r = g.renderer, working = sim.workers.some((w) => w.job), zoomed = r.cam.s > r.home.s * 1.12; let mode = '';
      if (sim.mode === 'day' || sim.mode === 'gameday') { if (r.userMoved || r.follow) mode = 'park'; else if (sim.mode === 'day' && r.director && zoomed) mode = 'wide'; else if (sim.mode === 'day' && !r.director && working) mode = 'follow'; }
      if (cap || this.toastT > 0 || this.cardT > 0) mode = ''; if (this.cache.cam !== mode) { this.cache.cam = mode; const b = $('recenter'); b.hidden = !mode; b.textContent = mode === 'follow' ? 'Follow the crew' : 'Whole park'; b.dataset.mode = mode; } }
    // onboarding prompts: one line, tied to what is on the field
    let prompt = '', hint = null;
    if (sim.mode === 'day' && !this.kind && !paused && !(this.cardT > 0)) {
      if (sim.tutorial === 0) { prompt = 'Tap the outfield to get it mowed.'; hint = 'outfield'; }
      else if (sim.tutorial === 2) { const f = sim.freeWorker(); if (f) { prompt = `${f.name} is free. The infield dirt could use a drag.`; hint = 'skin'; } }
      else if (sim.tutorial === 3 && sim.doneToday >= 2 && !Object.keys(sim.jobs).length) prompt = 'Open the gates whenever the park looks right.';
      else if (sim.tutorial >= 4 && sim.designsOpen() && !sim.designsMowed && !sim.jobs['mow:outfield'] && sim.freeWorker()) { prompt = 'New: draw something for the blimp. Tap the outfield.'; hint = 'outfield'; }
    } else if (paused && sim.mode === 'day' && !this.kind) prompt = 'Paused. The grass will wait.';
    if (this.promptKey !== prompt) { this.promptKey = prompt; const p = $('prompt'); p.textContent = prompt; p.hidden = !prompt; }
    g.renderer.hint = this.kind ? null : hint;
    if ((this.tick -= dt) <= 0) { this.tick = 0.4; if (this.kind === 'worker') { const s = $('w-status'); if (s) s.textContent = sim.statusOf(sim.worker(this.ctx.id)); } else if (this.kind === 'tasks' || this.kind === 'crew' || (this.kind === 'area' && sim.jobs[JOB_OF_AREA[this.ctx.area]])) this.render(); }
  }

  onMode() {
    const sim = this.game.sim; $('skip').hidden = sim.mode !== 'gameday'; const sum = $('summary');
    if (sim.mode === 'summary') { const s = sim.summary, row = (r) => `<div><span>${esc(r.label)}</span><b>${gem}${r.v}</b></div>`, ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0] || 'th');
      const table = s.table.map((t, i) => `<div class="${t.us ? 'us' : ''}"><span>${i + 1}</span><span>${esc(t.name)}</span><span>${t.w}–${t.l}</span></div>`).join('');
      const nx = s.next, nextLine = s.seasonOver ? `Next: Season ${s.season + 1} opens against the ${esc(nx.opp.name)}.` : `Tomorrow: the ${esc(nx.opp.name)}${nx.event ? ` · ${esc(nx.text)}` : '.'}`;
      sum.innerHTML = `<small>SEASON ${s.season} · GAME ${s.game} OF ${SEASON_GAMES}</small><h2>${s.win ? 'Clovers win' : `${esc(s.opp.short)} win`}</h2><p class="score">Clovers ${s.home}, ${esc(s.opp.short)} ${s.away} · ${s.record.w}–${s.record.l}, ${ord(s.place)} of 6</p>${s.seasonOver ? `<p class="pennant">${s.pennant ? 'Pennant! A banner goes up on the wall.' : `Season over: ${ord(s.place)} place.`}</p><div class="table">${table}</div>` : ''}<div class="ledger">${s.rows.map(row).join('')}<div class="total"><span>Today</span><b>${gem}${s.total}</b></div></div><p class="next">${nextLine}</p><div class="actions"><button class="enamel enamel--quiet" id="postcard" type="button">Postcard</button><button class="enamel" id="next-day" type="button">Next morning</button></div>`;
      sum.hidden = false; requestAnimationFrame(() => { sum.dataset.ready = '1'; });
    } else { sum.hidden = true; delete sum.dataset.ready; }
    this.game.reframe();
  }
}
