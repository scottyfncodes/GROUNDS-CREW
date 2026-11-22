// A postcard of tonight's field, seen straight down from the blimp: something to keep, or to send to a friend.
import { PAL } from './config.js';
import { BOUNDS, RES, FIRST, SECOND, THIRD, MOUND } from './geometry.js';

const W = 1080, H = 1350;

/** Draws the card and resolves with a PNG blob. */
export function makePostcard(surface, s) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = PAL.vintageCream; g.fillRect(0, 0, W, H);
  g.strokeStyle = PAL.fadedNavy; g.lineWidth = 10; g.strokeRect(28, 28, W - 56, H - 56); g.strokeStyle = PAL.brassYellow; g.lineWidth = 3; g.strokeRect(46, 46, W - 92, H - 92);
  // header
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = PAL.brickRed; g.font = '600 30px "Barlow Condensed", sans-serif'; g.fillText(spaced(`CLOVERFIELD PARK · SEASON ${s.season} · GAME ${s.game}`), W / 2, 112);
  const title = s.designed && s.look === 'Your design' ? 'A Cloverfield Original' : s.look; g.fillStyle = PAL.fadedNavy; g.font = `${fit(g, title, 92, W - 180)}px "Alfa Slab One", serif`; g.fillText(title, W / 2, 210);
  g.fillStyle = PAL.brassYellow; g.font = '58px "Barlow Condensed", sans-serif'; g.fillText('★'.repeat(s.stars) + '☆'.repeat(3 - s.stars), W / 2, 280);
  // the field, straight down: centre field at the top, home plate at the bottom
  const x0 = -262, x1 = 262, y0 = -34, y1 = 424, fw = W - 220, fh = fw * (y1 - y0) / (x1 - x0), fx = 110, fy = 316;
  const si = (x0 - BOUNDS.x0) * RES, sj = (BOUNDS.y1 - y1) * RES, sw = (x1 - x0) * RES, sh = (y1 - y0) * RES;
  g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip(); g.fillStyle = '#cbc8a4'; g.fillRect(fx, fy, fw, fh); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(surface.canvas, si, sj, sw, sh, fx, fy, fw, fh);
  const P = (x, y) => [fx + (x - x0) / (x1 - x0) * fw, fy + (y1 - y) / (y1 - y0) * fh], k = fw / (x1 - x0);
  g.fillStyle = PAL.chalkWhite; for (const b of [FIRST, SECOND, THIRD]) { const [px, py] = P(b[0], b[1]); g.save(); g.translate(px, py); g.rotate(Math.PI / 4); g.fillRect(-2.2 * k, -2.2 * k, 4.4 * k, 4.4 * k); g.restore(); }
  { const [px, py] = P(0, 0); g.fillRect(px - 2 * k, py - 2 * k, 4 * k, 4 * k); const [mx, my] = P(MOUND[0], MOUND[1]); g.fillRect(mx - 1.6 * k, my - 0.5 * k, 3.2 * k, 1 * k); }
  g.restore(); g.strokeStyle = PAL.fadedNavy; g.lineWidth = 4; g.strokeRect(fx, fy, fw, fh);
  // footer
  const fy2 = fy + fh + 72; g.fillStyle = PAL.fadedNavy; g.font = '600 44px "Barlow Condensed", sans-serif'; g.fillText(`Clovers ${s.home}, ${s.opp.short} ${s.away}`, W / 2, fy2);
  g.fillStyle = '#5a6478'; g.font = '400 34px "Barlow Condensed", sans-serif'; g.fillText(s.by ? `Mown by ${s.by} · Day ${s.day}` : `Day ${s.day}`, W / 2, fy2 + 50);
  g.fillStyle = PAL.fadedNavy; g.font = '600 26px "Barlow Condensed", sans-serif'; g.fillText(spaced('GROUNDS CREW by HaveAnApp'), W / 2, H - 78);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not draw the postcard'))), 'image/png'));
}

const spaced = (t) => t.split('').join(' ');
function fit(g, text, size, max) { for (let n = size; n > 30; n -= 4) { g.font = `${n}px "Alfa Slab One", serif`; if (g.measureText(text).width <= max) return n; } return 30; }

/** Share the card where the device can (iPhone: the share sheet, including Save Image), or download it. */
export async function sharePostcard(blob, name) {
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Cloverfield Park' }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; } }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return 'saved';
}
