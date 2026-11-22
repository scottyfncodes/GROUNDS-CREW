// Touch and mouse: tap to select, drag to pan, pinch or wheel to zoom, double-tap to see the whole park again.
export function bindInput(canvas, r, onTap) {
  const pts = new Map(); let moved = 0, pinch = 0, lastTap = 0, lastXY = [0, 0], downAt = 0;
  const mid = () => { const a = [...pts.values()]; return [(a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)]; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { moved = 0; downAt = performance.now(); } else if (pts.size === 2) { pinch = mid()[2]; moved = 99; } });
  canvas.addEventListener('pointermove', (e) => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pts.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 8) r.panBy(dx, dy); p.x = e.clientX; p.y = e.clientY; }
    else if (pts.size === 2) { const before = mid(); p.x = e.clientX; p.y = e.clientY; const m = mid(); if (pinch > 0) r.zoomAt(m[0], m[1], m[2] / pinch); r.panBy(m[0] - before[0], m[1] - before[1]); pinch = m[2]; } });
  const up = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pts.size) return; const now = performance.now();
    if (e.type === 'pointerup' && moved <= 8 && now - downAt < 450) { const dbl = now - lastTap < 320 && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 30; lastTap = now; lastXY = [e.clientX, e.clientY]; if (dbl) { r.reset(); lastTap = 0; } else onTap(e.clientX, e.clientY); } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); r.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault());   // iOS page zoom
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.sheet, .summary')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
