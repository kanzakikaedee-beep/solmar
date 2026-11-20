// Save and load: one versioned, atomic localStorage slot.
// The whole state is written at once or not at all; a corrupt or
// older-version save is reported, never silently loaded as if it were fine.

import { SAVE_KEY, SAVE_VERSION } from './config.js';

export function blankSave() {
  return {
    version: SAVE_VERSION,
    cash: 250,
    missionIndex: 0,
    completedMissions: [],
    packagesCollected: [],
    stats: {
      carsStolen: 0,
      faresDone: 0,
      distanceDriven: 0,
      maxWanted: 0,
      missionsDone: 0,
      shotsFired: 0,
    },
    player: { x: 780, y: 780, angle: 0 },
    savedAt: Date.now(),
  };
}

export function saveGame(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: state.cash,
      missionIndex: state.missionIndex,
      completedMissions: [...state.completedMissions],
      packagesCollected: [...state.packagesCollected],
      stats: { ...state.stats },
      player: { x: state.player.x, y: state.player.y, angle: state.player.angle },
      savedAt: Date.now(),
    };
    // Atomic in practice for localStorage: one setItem of the whole blob.
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

export function loadGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return { ok: false, error: 'storage unavailable: ' + String(err && err.message ? err.message : err) };
  }
  if (!raw) return { ok: false, error: 'no save yet' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'save is corrupt (not JSON)' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'save is corrupt (not an object)' };
  if (data.version !== SAVE_VERSION) {
    return { ok: false, error: 'save is from version ' + data.version + ', this game reads version ' + SAVE_VERSION };
  }
  if (typeof data.cash !== 'number' || !Array.isArray(data.completedMissions)) {
    return { ok: false, error: 'save is corrupt (missing fields)' };
  }
  return { ok: true, data };
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore: no save, no problem.
  }
}
