// Saving: one versioned JSON document in localStorage. A save that cannot be read is set aside, never trusted.
import { SAVE_KEY, SAVE_VERSION } from './config.js';

const SETTINGS_KEY = SAVE_KEY + '-settings';
const store = () => { try { return window.localStorage; } catch { return null; } };

export function loadSave() {
  const ls = store(); if (!ls) return { data: null, error: null };
  let raw = null;
  try { raw = ls.getItem(SAVE_KEY); if (!raw) return { data: null, error: null };
    const doc = JSON.parse(raw); if (!doc || typeof doc !== 'object' || doc.v !== SAVE_VERSION || !doc.game || !doc.game.field) throw new Error('unrecognised save');
    return { data: doc.game, error: null };
  } catch (err) { try { if (raw) ls.setItem(SAVE_KEY + '-unreadable', raw); ls.removeItem(SAVE_KEY); } catch { /* storage full or blocked */ } return { data: null, error: err }; }
}
export function writeSave(game) { const ls = store(); if (!ls) return false; try { ls.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, at: Date.now(), game })); return true; } catch { return false; } }
export function clearSave() { const ls = store(); if (ls) try { ls.removeItem(SAVE_KEY); } catch { /* nothing to clear */ } }
export function loadSettings() { const d = { volume: 0.7, muted: false }; const ls = store(); if (!ls) return d; try { const s = JSON.parse(ls.getItem(SETTINGS_KEY) || '{}'); return { volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : d.volume, muted: s.muted === true }; } catch { return d; } }
export function writeSettings(s) { const ls = store(); if (ls) try { ls.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* not saved */ } }
