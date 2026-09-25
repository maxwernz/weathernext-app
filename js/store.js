// Small localStorage wrapper. Every access is guarded: storage can be
// unavailable (private mode, blocked site data) and the app must still work.

import { DEFAULTS } from './config.js';

const PREFIX = 'skycast:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable - ignore */
  }
}

export function getSettings() {
  return { ...DEFAULTS, ...load('settings', {}) };
}

export function updateSettings(patch) {
  const next = { ...getSettings(), ...patch };
  save('settings', next);
  return next;
}

// ---- Places ---------------------------------------------------------------

export function getPlaces() {
  return load('places', []);
}

export function savePlaces(places) {
  save('places', places);
}

export function placeKey(p) {
  return `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
}

// ---- Forecast cache (per place + source) ----------------------------------

const CACHE_LIMIT = 6;

export function getCachedForecast(key) {
  const all = load('forecasts', {});
  return all[key] || null;
}

export function setCachedForecast(key, forecast) {
  const all = load('forecasts', {});
  all[key] = forecast;
  const keys = Object.keys(all).sort((a, b) => all[b].fetchedAt - all[a].fetchedAt);
  for (const k of keys.slice(CACHE_LIMIT)) delete all[k];
  save('forecasts', all);
}
