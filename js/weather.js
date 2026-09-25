// Pure weather logic: derived quantities, conditions, sun position, daily
// aggregation and a plain-language summary. No DOM access here.

const RAD = Math.PI / 180;
const DAY = 86_400_000;

/** Meteorological wind direction (degrees the wind blows FROM). */
export function windDirection(u, v) {
  if (u == null || v == null) return null;
  return (Math.atan2(-u, -v) / RAD + 360) % 360;
}

/**
 * Chance that hourly precipitation exceeds `threshold` mm, estimated from the
 * ensemble quantiles [p10, p25, p50, p75, p90] by interpolating the CDF.
 */
export function popFromQuantiles(q, threshold) {
  const probs = [0.1, 0.25, 0.5, 0.75, 0.9];
  if (q[4] <= threshold) {
    // Only the top tail can reach it; fade from 10% towards 0.
    return q[4] <= 0 ? 0 : Math.max(0, 0.1 * (q[4] / threshold) ** 2);
  }
  if (q[0] > threshold) return 0.9 + 0.1 * Math.min(1, (q[0] - threshold) / q[0]);
  for (let i = 0; i < 4; i++) {
    if (q[i] <= threshold && q[i + 1] > threshold) {
      const f = (threshold - q[i]) / (q[i + 1] - q[i]);
      return 1 - (probs[i] + f * (probs[i + 1] - probs[i]));
    }
  }
  return 0;
}

/** Relative humidity (0..1) from temperature and dew point in °C (Magnus). */
export function humidity(temp, dew) {
  if (temp == null || dew == null) return null;
  const e = (t) => Math.exp((17.625 * t) / (243.04 + t));
  return Math.min(1, e(dew) / e(temp));
}

/** Apparent ("feels like") temperature, Steadman / BoM formula. */
export function feelsLike(temp, dew, wind) {
  if (temp == null) return null;
  const rh = humidity(temp, dew) ?? 0.6;
  const vapour = rh * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  return temp + 0.33 * vapour - 0.7 * (wind ?? 0) - 4;
}

// ---- Sun ---------------------------------------------------------------------

function solarParams(ms) {
  const d = ms / DAY - 10957.5; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const eqTime = (((q - ra) % 360) + 540) % 360 - 180; // degrees
  return { decl, eqTime };
}

/** Solar elevation in degrees. */
export function sunElevation(ms, lat, lon) {
  const { decl, eqTime } = solarParams(ms);
  const utcHours = (ms % DAY) / 3_600_000;
  const hourAngle = (utcHours * 15 + lon + eqTime - 180) * RAD;
  const phi = lat * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(decl)
    + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle)) / RAD;
}

/** Sunrise/sunset (ms) for the UTC day containing `noonMs` around local noon. */
export function sunTimes(noonMs, lat, lon) {
  const { decl, eqTime } = solarParams(noonMs);
  const phi = lat * RAD;
  const h0 = -0.833 * RAD;
  const cosH = (Math.sin(h0) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  if (cosH > 1) return { polar: 'night' };
  if (cosH < -1) return { polar: 'day' };
  const H = Math.acos(cosH) / RAD; // degrees
  const dayStart = Math.floor(noonMs / DAY) * DAY;
  const solarNoon = dayStart + ((180 - lon - eqTime) / 15) * 3_600_000;
  // Keep solar noon on the same local day as noonMs.
  const shift = Math.round((noonMs - solarNoon) / DAY) * DAY;
  const noon = solarNoon + shift;
  return { rise: noon - (H / 15) * 3_600_000, set: noon + (H / 15) * 3_600_000 };
}

// ---- Conditions ----------------------------------------------------------------

export const CONDITION_LABELS = {
  clear: 'Clear',
  mostlyClear: 'Mostly clear',
  partly: 'Partly cloudy',
  mostlyCloudy: 'Mostly cloudy',
  overcast: 'Overcast',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  heavyRain: 'Heavy rain',
  sleet: 'Sleet',
  snow: 'Snow',
  heavySnow: 'Heavy snow',
};

function wetKind(temp, amount) {
  if (temp != null && temp <= 0.5) return amount >= 1.5 ? 'heavySnow' : 'snow';
  if (temp != null && temp <= 2) return 'sleet';
  if (amount >= 4) return 'heavyRain';
  if (amount >= 0.5) return 'rain';
  return 'drizzle';
}

function skyKind(cloud) {
  if (cloud == null) return 'partly';
  if (cloud < 0.15) return 'clear';
  if (cloud < 0.35) return 'mostlyClear';
  if (cloud < 0.65) return 'partly';
  if (cloud < 0.88) return 'mostlyCloudy';
  return 'overcast';
}

export function hourCondition(h) {
  const wet = (h.pop ?? (h.precip > 0.1 ? 0.6 : 0)) >= 0.45 && (h.precip ?? 0) >= 0.08;
  if (wet) return wetKind(h.temp, h.precip);
  const rh = humidity(h.temp, h.dew);
  if (rh != null && rh > 0.97 && (h.wind ?? 5) < 2.5 && (h.cloudLow ?? 0) > 0.7) return 'fog';
  return skyKind(h.cloud);
}

// ---- Aggregation -----------------------------------------------------------------

function dayKey(ms, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ms);
}

function mean(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function minOf(xs) { const v = xs.filter((x) => x != null); return v.length ? Math.min(...v) : null; }
function maxOf(xs) { const v = xs.filter((x) => x != null); return v.length ? Math.max(...v) : null; }

/** Enriches hours with condition/day flags and builds daily summaries. */
export function analyse(forecast, place) {
  const { lat, lon, tz } = place;
  const hours = forecast.hours.map((h) => {
    const elev = sunElevation(h.t, lat, lon);
    return { ...h, isDay: elev > -0.833, cond: hourCondition(h) };
  });

  const groups = new Map();
  for (const h of hours) {
    const k = dayKey(h.t, tz);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(h);
  }

  const days = [];
  for (const [key, hs] of groups) {
    // Skip fragments (e.g. the last day of the horizon with a few hours).
    if (hs.length < 6 && days.length > 0) continue;
    const daytime = hs.filter((h) => h.isDay);
    const precip = hs.reduce((a, h) => a + (h.precip ?? 0), 0);
    const pop = maxOf(hs.map((h) => h.pop));
    const tempMin = minOf(hs.map((h) => h.temp));
    const tempMax = maxOf(hs.map((h) => h.temp));
    let cond;
    if (precip >= 1 && (pop ?? 1) >= 0.4) {
      cond = wetKind(mean(hs.map((h) => h.temp)), precip / 6);
    } else {
      cond = skyKind(mean((daytime.length ? daytime : hs).map((h) => h.cloud)));
    }
    const noon = hs[Math.floor(hs.length / 2)].t;
    days.push({
      key,
      t: hs[0].t,
      noon,
      tempMin,
      tempMax,
      tempMinLo: minOf(hs.map((h) => h.tempLo)),
      tempMaxHi: maxOf(hs.map((h) => h.tempHi)),
      precip,
      pop,
      cond,
      wind: maxOf(hs.map((h) => h.wind)),
      solar: hs.reduce((a, h) => a + (h.solar ?? 0), 0) / 1000, // kWh/m²
      sun: sunTimes(noon, lat, lon),
      hours: hs,
    });
  }
  return { ...forecast, hours, days: days.slice(0, 15) };
}

/** Index of the hour that represents "now". */
export function nowIndex(hours, now = Date.now()) {
  let best = 0;
  for (let i = 0; i < hours.length; i++) {
    if (Math.abs(hours[i].t - now) < Math.abs(hours[best].t - now)) best = i;
  }
  return best;
}

/** One-sentence outlook for the next 24 hours. */
export function summary(hours, start, fmtTime, fmtTemp) {
  const next = hours.slice(start, start + 24);
  if (!next.length) return '';
  const wetIdx = next.findIndex((h) => ['drizzle', 'rain', 'heavyRain', 'sleet', 'snow', 'heavySnow'].includes(h.cond));
  const hi = maxOf(next.map((h) => h.temp));
  const lo = minOf(next.map((h) => h.temp));
  const parts = [];
  if (wetIdx === 0) {
    const dryIdx = next.findIndex((h, i) => i > 0 && !['drizzle', 'rain', 'heavyRain', 'sleet', 'snow', 'heavySnow'].includes(h.cond));
    const kind = CONDITION_LABELS[next[0].cond].toLowerCase();
    parts.push(dryIdx > 0 ? `${cap(kind)} easing around ${fmtTime(next[dryIdx].t)}.` : `${cap(kind)} continuing for the next day.`);
  } else if (wetIdx > 0) {
    const kind = CONDITION_LABELS[next[wetIdx].cond].toLowerCase();
    parts.push(`${cap(kind)} likely from around ${fmtTime(next[wetIdx].t)}.`);
  } else {
    const cloud = mean(next.map((h) => h.cloud));
    parts.push(cloud < 0.3 ? 'Dry with plenty of sun.' : cloud < 0.7 ? 'Dry with a mix of sun and cloud.' : 'Dry but mostly cloudy.');
  }
  parts.push(`Temperatures between ${fmtTemp(lo)} and ${fmtTemp(hi)}.`);
  const windy = maxOf(next.map((h) => h.wind));
  if (windy != null && windy >= 10) parts.push('Windy at times.');
  return parts.join(' ');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
