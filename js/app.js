import { FALLBACK_PLACE } from './config.js';
import * as store from './store.js';
import * as auth from './auth.js';
import { fetchWeatherNext } from './providers/weathernext.js';
import { fetchOpenMeteo } from './providers/openmeteo.js';
import { searchPlaces, currentPlace } from './geo.js';
import { analyse, nowIndex, summary, humidity, feelsLike, CONDITION_LABELS } from './weather.js';
import { makeFormat, escapeHtml } from './format.js';
import { weatherIcon } from './icons.js';
import { renderChart } from './chart.js';
import { renderDayView, drawDayChart } from './dayview.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  settings: store.getSettings(),
  places: store.getPlaces(),
  active: store.load('activePlace', null),
  data: null,        // analysed forecast for the active place
  chartRange: store.load('chartRange', 48),
  loadingKey: null,
  notice: null,      // { kind, text, action? } shown above the content
  dayView: null,     // { key, metric } while the day detail is open
};

// ---- Boot ----------------------------------------------------------------------

async function boot() {
  const redirect = auth.consumeRedirect();
  if (redirect?.error && redirect.error !== 'state_mismatch') {
    const silent = ['interaction_required', 'login_required', 'consent_required'].includes(redirect.error);
    state.notice = silent
      ? { kind: 'info', text: 'Your WeatherNext session ended.', action: 'sign-in', actionLabel: 'Sign in' }
      : { kind: 'error', text: `Google sign-in failed (${redirect.error}).`, action: 'sign-in', actionLabel: 'Try again' };
  }

  applyAppearance();
  bindEvents();
  registerServiceWorker();

  if (!state.active) {
    state.active = state.places[0] || null;
  }
  if (!state.active) {
    try {
      state.active = await currentPlace();
    } catch {
      state.active = FALLBACK_PLACE;
    }
    addPlace(state.active);
  }
  refresh();
}

// ---- Data loading ----------------------------------------------------------------

function cacheKey(place, source) {
  return `${source}|${store.placeKey(place)}`;
}

function effectiveSource() {
  const s = state.settings;
  if (s.source === 'demo') return { source: 'demo' };
  if (!s.clientId || !s.project) return { source: 'demo', reason: 'setup' };
  const token = auth.currentToken();
  if (!token) return { source: 'demo', reason: 'signin' };
  return { source: 'weathernext', token };
}

async function refresh({ force = false } = {}) {
  const place = state.active;
  $('#placeName').textContent = place.name;
  renderSidebar();

  const s = state.settings;
  // Token expired but the user has signed in before: renew silently via redirect.
  if (s.source === 'weathernext' && s.clientId && s.project && !auth.currentToken()
      && auth.hasSignedInBefore() && auth.canTrySilent() && !state.notice) {
    showCachedIfAny(place, 'weathernext');
    auth.signIn(s.clientId, { silent: true });
    return;
  }

  const eff = effectiveSource();
  const key = cacheKey(place, eff.source);
  const cached = store.getCachedForecast(key);
  const fresh = cached && Date.now() - cached.fetchedAt < 20 * 60_000;

  if (eff.reason === 'setup' && !state.notice) {
    state.notice = { kind: 'info', text: 'Showing demo data. Connect WeatherNext 3 in Settings to use Google DeepMind forecasts.', action: 'open-settings', actionLabel: 'Set up' };
  } else if (eff.reason === 'signin' && !state.notice) {
    state.notice = { kind: 'info', text: 'Showing demo data. Sign in to load WeatherNext 3.', action: 'sign-in', actionLabel: 'Sign in' };
  }
  renderNotice();

  if (cached) show(cached, place);
  if (fresh && !force) return;
  if (!cached) renderLoading();

  state.loadingKey = key;
  document.body.classList.add('is-loading');
  try {
    const raw = eff.source === 'weathernext'
      ? await fetchWeatherNext({ lat: place.lat, lon: place.lon, token: eff.token, clientId: s.clientId, project: s.project })
      : await fetchOpenMeteo({ lat: place.lat, lon: place.lon });
    raw.fetchedAt = Date.now();
    store.setCachedForecast(key, raw);
    if (state.loadingKey === key) show(raw, place);
  } catch (e) {
    console.error(e);
    if (state.loadingKey !== key) return;
    state.notice = e.auth
      ? { kind: 'error', text: e.message, action: 'sign-in', actionLabel: 'Sign in' }
      : { kind: 'error', text: e.message || 'Could not load the forecast.', action: 'refresh', actionLabel: 'Retry' };
    renderNotice();
    if (!cached) renderEmpty();
  } finally {
    if (state.loadingKey === key) document.body.classList.remove('is-loading');
  }
}

function showCachedIfAny(place, source) {
  const cached = store.getCachedForecast(cacheKey(place, source));
  if (cached) show(cached, place);
}

function show(raw, place) {
  state.data = analyse(raw, place);
  render();
}

// ---- Rendering -------------------------------------------------------------------

function renderLoading() {
  $('#content').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading forecast…</p></div>';
}

function renderEmpty() {
  $('#content').innerHTML = '<div class="loading-state"><p>No forecast available.</p></div>';
}

function renderNotice() {
  const el = $('#banner');
  const n = state.notice;
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `banner banner-${n.kind}`;
  el.innerHTML = `<span>${escapeHtml(n.text)}</span>${n.action ? `<button class="pill-btn small" data-action="${n.action}">${escapeHtml(n.actionLabel)}</button>` : ''}<button class="icon-btn small" data-action="dismiss" aria-label="Dismiss">✕</button>`;
}

function setSky(cond, isDay) {
  const sky = $('#sky');
  const group = ['drizzle', 'rain', 'heavyRain', 'sleet'].includes(cond) ? 'rain'
    : ['snow', 'heavySnow'].includes(cond) ? 'snow'
      : ['overcast', 'mostlyCloudy', 'fog'].includes(cond) ? 'cloudy' : 'clear';
  sky.dataset.sky = `${group}-${isDay ? 'day' : 'night'}`;
  updateThemeColor();
}

function updateThemeColor() {
  const clean = state.settings.appearance === 'clean';
  const color = clean
    ? getComputedStyle(document.body).backgroundColor
    : getComputedStyle($('#sky')).getPropertyValue('--sky-top').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color || '#0f2742');
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.appearance = state.settings.appearance;
  root.dataset.theme = state.settings.theme;
  updateThemeColor();
}

function render() {
  const d = state.data;
  const place = state.active;
  const fmt = makeFormat(state.settings, place.tz);
  const i0 = nowIndex(d.hours);
  const now = d.hours[i0];
  const today = d.days.find((x) => x.hours.includes(now)) || d.days[0];
  setSky(now.cond, now.isDay);

  const wn = d.source === 'weathernext';
  const sourceBadge = wn
    ? `<span class="badge">WeatherNext 3</span><span class="muted">Run ${escapeHtml(fmt.utc(d.runs.latest || d.runs.extended))} · 64-member ensemble</span>`
    : '<span class="badge badge-demo">Demo</span><span class="muted">Open-Meteo data</span>';

  const range = now.tempLo != null
    ? `<div class="hero-range">Likely ${fmt.temp(now.tempLo)} – ${fmt.temp(now.tempHi)}</div>` : '';

  // Hourly strip: next 48 h.
  const dayOfHour = (h) => d.days.find((x) => x.hours.includes(h))?.key || '';
  const strip = d.hours.slice(i0, i0 + 48).map((h, k) => `
    <li><button class="hour" data-open-day="${dayOfHour(h)}">
      <span class="hour-time">${k === 0 ? 'Now' : escapeHtml(fmt.hour(h.t))}</span>
      ${weatherIcon(h.cond, h.isDay, 30, CONDITION_LABELS[h.cond])}
      <span class="hour-pop">${fmt.pop(h.pop)}</span>
      <span class="hour-temp">${fmt.temp(h.temp)}</span>
    </button></li>`).join('');

  // Daily list with range bars on a shared scale.
  const lo = Math.min(...d.days.map((x) => x.tempMinLo ?? x.tempMin));
  const hi = Math.max(...d.days.map((x) => x.tempMaxHi ?? x.tempMax));
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const days = d.days.map((x) => {
    const ens = x.tempMinLo != null
      ? `<span class="bar-ens" style="left:${pos(x.tempMinLo)}%;width:${pos(x.tempMaxHi) - pos(x.tempMinLo)}%"></span>` : '';
    const nowDot = x === today ? `<span class="bar-now" style="left:${pos(now.temp)}%"></span>` : '';
    return `
      <li><button class="day" data-open-day="${x.key}">
        <span class="day-name">${escapeHtml(fmt.day(x.noon, x.key))}<small class="day-date">${escapeHtml(fmt.shortDate(x.noon))}</small></span>
        <span class="day-icon">${weatherIcon(x.cond, true, 28, CONDITION_LABELS[x.cond])}<span class="day-pop">${fmt.pop(x.pop)}</span></span>
        <span class="day-cond">${CONDITION_LABELS[x.cond]}${x.precip >= 0.1 ? `<small>${fmt.precip(x.precip)}</small>` : ''}</span>
        <span class="day-lo">${fmt.temp(x.tempMin)}</span>
        <span class="day-bar" title="${x.tempMinLo != null ? `Ensemble range ${fmt.temp(x.tempMinLo)} – ${fmt.temp(x.tempMaxHi)}` : ''}">
          ${ens}<span class="bar-fill" style="left:${pos(x.tempMin)}%;width:${Math.max(2, pos(x.tempMax) - pos(x.tempMin))}%"></span>${nowDot}
        </span>
        <span class="day-hi">${fmt.temp(x.tempMax)}</span>
        <svg class="day-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z"/></svg>
      </button></li>`;
  }).join('');

  // Detail tiles.
  const rh = humidity(now.temp, now.dew);
  const next24 = d.hours.slice(i0, i0 + 24);
  const rain24 = next24.reduce((a, h) => a + (h.precip ?? 0), 0);
  const rainHi24 = wn ? next24.reduce((a, h) => a + (h.precipHi ?? 0), 0) : null;
  const sun = today.sun;
  const sunLine = sun.polar
    ? (sun.polar === 'day' ? 'Sun up all day' : 'Sun down all day')
    : `${escapeHtml(fmt.time(sun.rise))} – ${escapeHtml(fmt.time(sun.set))}`;
  const tomorrow = d.days[d.days.indexOf(today) + 1];
  const spread = tomorrow && tomorrow.tempMaxHi != null ? tomorrow.tempMaxHi - tomorrow.tempMinLo - (tomorrow.tempMax - tomorrow.tempMin) : null;

  const tile = (title, value, sub, extra = '') =>
    `<section class="tile"><h3>${title}</h3><div class="tile-value">${value}</div>${extra}<p class="tile-sub">${sub}</p></section>`;

  const layer = (label, v) => `<div class="layer"><span>${label}</span><span class="layer-bar"><span style="width:${Math.round((v ?? 0) * 100)}%"></span></span><span>${fmt.pct(v)}</span></div>`;

  const compass = now.windDir != null ? `
    <svg class="compass" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" class="compass-ring"/>
      <text x="32" y="11" text-anchor="middle">N</text>
      <g transform="rotate(${Math.round(now.windDir + 180)} 32 32)"><path d="M32 12 L38 30 L32 26 L26 30 Z" class="compass-arrow"/><line x1="32" y1="26" x2="32" y2="50" class="compass-tail"/></g>
    </svg>` : '';

  const tiles = [
    tile('Wind', `${fmt.wind(now.wind)} <small>${fmt.windUnit}</small>`,
      `${fmt.compass(now.windDir)}${now.windHi != null ? ` · ${wn ? 'up to' : 'gusts'} ${fmt.wind(now.windHi)} ${fmt.windUnit}` : ''}${now.wind100 != null ? `<br>${fmt.wind(now.wind100)} ${fmt.windUnit} at ${wn ? '100' : '120'} m` : ''}`,
      compass),
    tile('Feels like', fmt.temp(feelsLike(now.temp, now.dew, now.wind)),
      'Accounts for humidity and wind'),
    tile('Humidity', fmt.pct(rh), `Dew point ${fmt.temp(now.dew)}`),
    tile('Precipitation', fmt.precip(rain24),
      `Next 24 h${rainHi24 != null && rainHi24 > rain24 + 0.2 ? ` · wet case up to ${fmt.precip(rainHi24)}` : ''}`),
    tile('Clouds', fmt.pct(now.cloud), 'Total cover',
      `<div class="layers">${layer('High', now.cloudHigh)}${layer('Mid', now.cloudMid)}${layer('Low', now.cloudLow)}</div>`),
    tile('Pressure', `${now.pressure == null ? '–' : Math.round(now.pressure)} <small>hPa</small>`, pressureTrend(d.hours, i0)),
    tile('Sun', `${Math.round(now.solar ?? 0)} <small>W/m²</small>`,
      `${sunLine}<br>${today.solar.toFixed(1)} kWh/m² today`),
    wn && spread != null
      ? tile('Confidence', spread < 3 ? 'High' : spread < 6 ? 'Medium' : 'Low',
        `Tomorrow's 80% range is ±${fmt.tempDelta(spread / 2 + 0.01)} around the mean`)
      : '',
  ].join('');

  const nowStat = (label, value) => `<li><span>${label}</span><strong>${value}</strong></li>`;
  const nowStats = [
    nowStat('Feels like', fmt.temp(feelsLike(now.temp, now.dew, now.wind))),
    nowStat('Wind', `${fmt.compass(now.windDir)} ${fmt.wind(now.wind)} ${fmt.windUnit}`),
    nowStat(wn ? 'Wind up to' : 'Gusts', `${fmt.wind(now.windHi)} ${fmt.windUnit}`),
    nowStat('Humidity', fmt.pct(rh)),
    nowStat('Dew point', fmt.temp(now.dew)),
    nowStat('Pressure', `${now.pressure == null ? '–' : Math.round(now.pressure)} hPa`),
    nowStat('Cloud cover', fmt.pct(now.cloud)),
    nowStat('Rain next 24 h', fmt.precip(rain24)),
  ].join('');

  $('#content').innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <h2 class="hero-label">Current weather</h2>
        <span class="hero-time">${escapeHtml(fmt.time(Date.now()))}</span>
      </div>
      <div class="hero-meta">${sourceBadge}</div>
      <div class="hero-main">
        <div class="hero-temp">${fmt.temp(now.temp)}</div>
        <div class="hero-icon">${weatherIcon(now.cond, now.isDay, 88, CONDITION_LABELS[now.cond])}</div>
      </div>
      <div class="hero-cond">${CONDITION_LABELS[now.cond]}</div>
      <div class="hero-hl">H ${fmt.temp(today.tempMax)} · L ${fmt.temp(today.tempMin)}</div>
      ${range}
      <ul class="now-stats">${nowStats}</ul>
      <p class="hero-summary">${escapeHtml(summary(d.hours, i0, fmt.time, fmt.temp))}</p>
    </section>

    <div class="grid">
      <div class="col">
        <section class="card">
          <h2 class="card-title">Hourly</h2>
          <ul class="hours" tabindex="0" aria-label="Hourly forecast">${strip}</ul>
        </section>

        <section class="card">
          <h2 class="card-title">${d.days.length}-day forecast</h2>
          <ul class="days">${days}</ul>
        </section>
      </div>

      <div class="col">
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Temperature & rain</h2>
            <div class="seg small" role="tablist" aria-label="Chart range">
              ${[48, 168, 360].map((r) => `<button role="tab" aria-selected="${state.chartRange === r}" data-range="${r}">${r === 48 ? '48 h' : r === 168 ? '7 days' : '15 days'}</button>`).join('')}
            </div>
          </div>
          <div class="chart" id="chart"></div>
          ${wn ? '<p class="chart-note"><span class="swatch-band"></span> Shaded band: 80% of the 64 ensemble members fall inside it (p10–p90)</p>' : ''}
        </section>

        <div class="tiles">${tiles}</div>
      </div>
    </div>`;

  drawChart();
  if (state.dayView) renderDay();

  $('#footer').innerHTML = wn
    ? 'Forecast data: WeatherNext 3 via Google Earth Engine. © 2024-6 Google LLC, whose machine learning models were used to create the experimental data made available under the following licence terms <a href="https://storage.googleapis.com/weathernext-public/terms-of-use.pdf" target="_blank" rel="noopener">terms of use</a>. This data is intended for experimental modelling only and is not intended, validated, or approved for real world use. Place search: Open-Meteo.'
    : 'Demo data: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0). Switch to WeatherNext 3 in Settings.';
}

function pressureTrend(hours, i0) {
  const a = hours[i0]?.pressure;
  const b = hours[Math.min(hours.length - 1, i0 + 6)]?.pressure;
  if (a == null || b == null) return 'Sea level';
  const d = b - a;
  return Math.abs(d) < 1 ? 'Steady over the next 6 h' : d > 0 ? `Rising ${d.toFixed(1)} hPa in 6 h` : `Falling ${(-d).toFixed(1)} hPa in 6 h`;
}

function drawChart() {
  const el = $('#chart');
  if (!el || !state.data) return;
  const i0 = nowIndex(state.data.hours);
  const hours = state.data.hours.slice(i0, i0 + state.chartRange + 1);
  if (hours.length < 2) return;
  renderChart(el, hours, makeFormat(state.settings, state.active.tz), { tz: state.active.tz });
}

// ---- Day detail ----------------------------------------------------------------------

function dayViewOptions() {
  return {
    data: state.data,
    key: state.dayView.key,
    metric: state.dayView.metric,
    fmt: makeFormat(state.settings, state.active.tz),
    place: state.active,
    nowT: Date.now(),
  };
}

function renderDay() {
  if (!state.data.days.some((x) => x.key === state.dayView.key)) state.dayView.key = state.data.days[0].key;
  renderDayView($('#dayView'), dayViewOptions());
}

function openDay(key) {
  if (!key || !state.data) return;
  const wasOpen = !!state.dayView;
  state.dayView = { key, metric: state.dayView?.metric || 'temp' };
  const el = $('#dayView');
  if (!wasOpen) {
    history.pushState({ dayView: true }, '');
    el.hidden = false;
    document.body.classList.add('day-open');
    requestAnimationFrame(() => el.classList.add('open'));
  }
  renderDay();
  if (!wasOpen) el.scrollTop = 0;
}

function closeDay({ fromHistory = false } = {}) {
  if (!state.dayView) return;
  state.dayView = null;
  const el = $('#dayView');
  el.classList.remove('open');
  el.hidden = true;
  document.body.classList.remove('day-open');
  if (!fromHistory && history.state?.dayView) history.back();
}

function bindSwipe(el) {
  let x0 = null;
  let y0 = null;
  el.addEventListener('touchstart', (e) => {
    if (e.target.closest('.chart, .dv-chips, .dv-tabs')) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null || !state.dayView) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const days = state.data.days;
    const i = days.findIndex((x) => x.key === state.dayView.key);
    const next = days[i + (dx < 0 ? 1 : -1)];
    if (next) openDay(next.key);
  }, { passive: true });
}

// ---- Places ------------------------------------------------------------------------

function addPlace(place) {
  const key = store.placeKey(place);
  state.places = [place, ...state.places.filter((p) => store.placeKey(p) !== key && !(place.current && p.current))];
  store.savePlaces(state.places);
}

function selectPlace(place) {
  state.active = place;
  store.save('activePlace', place);
  state.notice = state.notice?.kind === 'error' ? null : state.notice;
  renderNotice();
  closeSheets();
  refresh();
}

function placeItem(p, { removable }) {
  const active = state.active && store.placeKey(p) === store.placeKey(state.active);
  return `<li class="place${active ? ' active' : ''}">
    <button class="place-pick" data-place="${escapeHtml(JSON.stringify(p))}">
      <span class="place-name">${p.current ? '📍 ' : ''}${escapeHtml(p.name)}</span>
      <span class="place-region">${escapeHtml(p.region || '')}</span>
    </button>
    ${removable ? `<button class="icon-btn small" data-remove="${escapeHtml(store.placeKey(p))}" aria-label="Remove ${escapeHtml(p.name)}">✕</button>` : ''}
  </li>`;
}

function renderSidebar() {
  $('#sidebarPlaces').innerHTML = state.places.map((p) => placeItem(p, { removable: false })).join('');
  $('#savedPlaces').innerHTML = state.places.map((p) => placeItem(p, { removable: true })).join('');
  $('#savedTitle').hidden = state.places.length === 0;
}

let searchAbort = null;
let searchTimer = null;
function onSearchInput(e) {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) { $('#searchResults').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    searchAbort?.abort();
    searchAbort = new AbortController();
    try {
      const results = await searchPlaces(q, searchAbort.signal);
      $('#searchResults').innerHTML = results.length
        ? results.map((p) => placeItem(p, { removable: false })).join('')
        : '<li class="empty">No places found</li>';
    } catch (err) {
      if (err.name !== 'AbortError') $('#searchResults').innerHTML = '<li class="empty">Search failed</li>';
    }
  }, 250);
}

// ---- Sheets & settings -------------------------------------------------------------

function openSheet(id) {
  closeSheets();
  const el = $(id);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
}

function closeSheets() {
  document.querySelectorAll('.sheet-backdrop').forEach((el) => {
    el.classList.remove('open');
    el.hidden = true;
  });
}

function fillSettings() {
  const f = $('#settingsForm');
  const s = state.settings;
  f.source.value = s.source;
  f.clientId.value = s.clientId;
  f.project.value = s.project;
  f.temp.value = s.temp;
  f.wind.value = s.wind;
  f.precip.value = s.precip;
  f.appearance.value = s.appearance;
  f.theme.value = s.theme;
  updateAuthStatus();
}

function updateAuthStatus() {
  const s = state.settings;
  const token = auth.currentToken();
  $('#wnFields').classList.toggle('disabled', s.source !== 'weathernext');
  $('#themeSeg').classList.toggle('disabled', s.appearance !== 'clean');
  $('#authStatus').textContent = token
    ? `Signed in · session valid for ${Math.round((token.expiresAt - Date.now()) / 60_000)} min`
    : 'Not signed in';
  $('#signInBtn').hidden = !!token;
  $('#signOutBtn').hidden = !token && !auth.hasSignedInBefore();
  $('#signInBtn').disabled = !s.clientId || !s.project;
}

function onSettingsChange() {
  const f = $('#settingsForm');
  const prev = state.settings;
  state.settings = store.updateSettings({
    source: f.source.value,
    clientId: f.clientId.value.trim(),
    project: f.project.value.trim(),
    temp: f.temp.value,
    wind: f.wind.value,
    precip: f.precip.value,
    appearance: f.appearance.value,
    theme: f.theme.value,
  });
  applyAppearance();
  updateAuthStatus();
  const dataChanged = ['source', 'clientId', 'project'].some((k) => prev[k] !== state.settings[k]);
  if (dataChanged) {
    state.notice = null;
    refresh();
  } else if (state.data) {
    render();
  }
}

function startSignIn() {
  const s = state.settings;
  if (!s.clientId || !s.project) {
    fillSettings();
    openSheet('#settingsSheet');
    return;
  }
  if (s.source !== 'weathernext') state.settings = store.updateSettings({ source: 'weathernext' });
  auth.signIn(s.clientId);
}

// ---- Events -----------------------------------------------------------------------

function bindEvents() {
  document.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-place]');
    if (pick) {
      const place = JSON.parse(pick.dataset.place);
      addPlace(place);
      selectPlace(place);
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      state.places = state.places.filter((p) => store.placeKey(p) !== remove.dataset.remove);
      store.savePlaces(state.places);
      renderSidebar();
      return;
    }
    const dayBtn = e.target.closest('[data-open-day]');
    if (dayBtn) {
      openDay(dayBtn.dataset.openDay);
      return;
    }
    const metricBtn = e.target.closest('[data-day-metric]');
    if (metricBtn && state.dayView) {
      state.dayView.metric = metricBtn.dataset.dayMetric;
      renderDay();
      return;
    }
    const rangeBtn = e.target.closest('[data-range]');
    if (rangeBtn) {
      state.chartRange = Number(rangeBtn.dataset.range);
      store.save('chartRange', state.chartRange);
      document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-selected', b === rangeBtn));
      drawChart();
      return;
    }
    if (e.target.classList.contains('sheet-backdrop')) { closeSheets(); return; }

    const action = e.target.closest('[data-action]')?.dataset.action;
    switch (action) {
      case 'open-search':
        openSheet('#searchSheet');
        renderSidebar();
        setTimeout(() => $('#searchInput').focus(), 50);
        break;
      case 'open-settings':
        fillSettings();
        openSheet('#settingsSheet');
        break;
      case 'close-sheet':
        closeSheets();
        break;
      case 'close-day':
        closeDay();
        break;
      case 'refresh':
        state.notice = null;
        renderNotice();
        refresh({ force: true });
        break;
      case 'dismiss':
        state.notice = null;
        renderNotice();
        break;
      case 'sign-in':
        startSignIn();
        break;
      case 'sign-out':
        auth.signOut();
        updateAuthStatus();
        state.notice = null;
        refresh();
        break;
      case 'use-location': {
        const btn = e.target.closest('button');
        btn.disabled = true;
        try {
          const place = await currentPlace();
          addPlace(place);
          selectPlace(place);
        } catch (err) {
          $('#searchResults').innerHTML = `<li class="empty">${escapeHtml(err.message || 'Location unavailable')}</li>`;
        } finally {
          btn.disabled = false;
        }
        break;
      }
      default:
    }
  });

  $('#searchInput').addEventListener('input', onSearchInput);
  $('#settingsForm').addEventListener('change', onSettingsChange);
  $('#settingsForm').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.sheet-backdrop:not([hidden])')) closeSheets();
      else closeDay();
    }
    if (state.dayView && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input')) {
      const days = state.data.days;
      const i = days.findIndex((x) => x.key === state.dayView.key);
      const next = days[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) openDay(next.key);
    }
  });
  window.addEventListener('popstate', () => { if (state.dayView) closeDay({ fromHistory: true }); });
  bindSwipe($('#dayView'));

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawChart();
      if (state.dayView) drawDayChart($('#dayView'), dayViewOptions());
    }, 120);
  });

  // Refresh when the app returns to the foreground after a while.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 15 * 60_000) refresh();
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
