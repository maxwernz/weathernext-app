// WeatherNext 3 forecasts from the Earth Engine collection
// projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg.
//
// One Earth Engine request does everything server-side:
//   1. find the newest complete run (any hourly init, 48 h horizon)
//   2. find the newest complete 6-hourly run (00/06/12/18 UTC, 15-day horizon)
//   3. sample both at the point for every forecast hour
// The client then stitches them: the fresher hourly run for the first two
// days, the long 6-hourly run for the rest.

import { WEATHERNEXT } from '../config.js';
import { popFromQuantiles, windDirection } from '../weather.js';

const BANDS = [
  'temperature_2m_mean', 'temperature_2m_p10', 'temperature_2m_p90',
  'dewpoint_temperature_2m_mean',
  'imerg_tp_1hr_mean', 'imerg_tp_1hr_p10', 'imerg_tp_1hr_p25',
  'imerg_tp_1hr_p50', 'imerg_tp_1hr_p75', 'imerg_tp_1hr_p90',
  'total_cloud_cover_mean', 'low_cloud_cover_mean',
  'medium_cloud_cover_mean', 'high_cloud_cover_mean',
  'u_component_of_wind_10m_mean', 'v_component_of_wind_10m_mean',
  'wind_speed_10m_mean', 'wind_speed_10m_p90', 'wind_speed_100m_mean',
  'mean_sea_level_pressure_mean',
  'surface_solar_radiation_downwards_1hr_mean',
];

const HOUR = 3_600_000;

let eeLoading = null;
function loadEE() {
  if (window.ee) return Promise.resolve(window.ee);
  eeLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = WEATHERNEXT.eeScript;
    s.onload = () => resolve(window.ee);
    s.onerror = () => {
      eeLoading = null;
      reject(new Error('Could not load the Earth Engine library. Check your connection.'));
    };
    document.head.append(s);
  });
  return eeLoading;
}

let initializedProject = null;
async function initEE({ token, clientId, project }) {
  const ee = await loadEE();
  const expiresIn = Math.max(60, Math.round((token.expiresAt - Date.now()) / 1000));
  ee.data.setAuthToken(clientId, 'Bearer', token.accessToken, expiresIn, [], null, false);
  if (initializedProject !== project) {
    await new Promise((resolve, reject) =>
      ee.initialize(null, null, resolve, (e) => reject(new Error(String(e))), null, project));
    initializedProject = project;
  }
  return ee;
}

function isoHour(ms) {
  return new Date(ms).toISOString().slice(0, 13) + ':00:00Z';
}

function candidateInits(now, stepHours, lookbackHours) {
  const base = Math.floor(now / (stepHours * HOUR)) * stepHours * HOUR;
  const out = [];
  for (let t = base; t >= now - lookbackHours * HOUR; t -= stepHours * HOUR) out.push(isoHour(t));
  return out;
}

function buildQuery(ee, lat, lon) {
  const now = Date.now();
  // system:time_start is the run's init time, so only recent inits are scanned.
  const col = ee.ImageCollection(WEATHERNEXT.collection)
    .filterDate(new Date(now - 60 * HOUR), new Date(now + HOUR));

  // Newest init time among candidates whose final lead time exists
  // ('' when none, which then just yields an empty sample).
  const newest = (lastHour, candidates) =>
    ee.List(col
      .filter(ee.Filter.eq('forecast_hour', lastHour))
      .filter(ee.Filter.inList('start_time', candidates))
      .aggregate_array('start_time'))
      .sort().reverse().add('').get(0);

  const hourlyInit = newest(48, candidateInits(now, 1, 24));
  const synopticInit = newest(360, candidateInits(now, 6, 48));
  // An older 6-hourly run that still covers the earlier hours of today.
  const earlierInit = newest(360, candidateInits(now - 24 * HOUR, 6, 12));

  const point = ee.Geometry.Point([lon, lat]);
  // Returned as a plain list of dictionaries: a collection nested inside a
  // Dictionary comes back from evaluate() without its features.
  const sample = (init, maxHour = 360) => col
    .filter(ee.Filter.eq('start_time', init))
    .filter(ee.Filter.lte('forecast_hour', maxHour))
    .select(BANDS)
    .toList(400)
    .map((img) => ee.Image(img)
      .reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 11132 })
      .set('valid', ee.Image(img).get('end_time')));

  return ee.Dictionary({
    hourlyInit,
    synopticInit,
    hourly: sample(hourlyInit),
    synoptic: sample(synopticInit),
    earlier: sample(earlierInit, 48),
  });
}

function evaluate(obj) {
  return new Promise((resolve, reject) =>
    obj.evaluate((res, err) => (err ? reject(new Error(err)) : resolve(res))));
}

function toHour(p) {
  const k = (v) => (v == null ? null : v - 273.15);
  const mm = (v) => (v == null ? null : Math.max(0, v * 1000));
  const q = [p.imerg_tp_1hr_p10, p.imerg_tp_1hr_p25, p.imerg_tp_1hr_p50,
    p.imerg_tp_1hr_p75, p.imerg_tp_1hr_p90].map(mm);
  return {
    t: Date.parse(p.valid),
    temp: k(p.temperature_2m_mean),
    tempLo: k(p.temperature_2m_p10),
    tempHi: k(p.temperature_2m_p90),
    dew: k(p.dewpoint_temperature_2m_mean),
    precip: mm(p.imerg_tp_1hr_mean),
    precipHi: q[4],
    pop: q.every((v) => v != null) ? popFromQuantiles(q, 0.1) : null,
    cloud: p.total_cloud_cover_mean,
    cloudLow: p.low_cloud_cover_mean,
    cloudMid: p.medium_cloud_cover_mean,
    cloudHigh: p.high_cloud_cover_mean,
    wind: p.wind_speed_10m_mean,
    windHi: p.wind_speed_10m_p90,
    windDir: windDirection(p.u_component_of_wind_10m_mean, p.v_component_of_wind_10m_mean),
    wind100: p.wind_speed_100m_mean,
    pressure: p.mean_sea_level_pressure_mean == null ? null : p.mean_sea_level_pressure_mean / 100,
    solar: p.surface_solar_radiation_downwards_1hr_mean == null
      ? null : Math.max(0, p.surface_solar_radiation_downwards_1hr_mean / 3600),
  };
}

function friendlyError(message) {
  const m = message || '';
  if (/not (been )?registered|register.*earth engine|serviceusage|USER_PROJECT_DENIED/i.test(m)) {
    return 'Your Cloud project is not set up for Earth Engine yet. Register it at code.earthengine.google.com/register and enable the Earth Engine API. ' + m;
  }
  if (/permission|denied|not found|does not exist|access/i.test(m)) {
    return 'Your Google account cannot read WeatherNext 3 yet. Access approval usually takes 5–7 business days after the data request form. ' + m;
  }
  if (/401|unauthenticated|invalid.*credential|token/i.test(m)) {
    return 'Your sign-in expired. Please sign in again.';
  }
  return m;
}

export async function fetchWeatherNext({ lat, lon, token, clientId, project }) {
  let res;
  try {
    const ee = await initEE({ token, clientId, project });
    res = await evaluate(buildQuery(ee, lat, lon));
  } catch (e) {
    const err = new Error(friendlyError(e.message));
    err.auth = /expired|401|unauthenticated/i.test(e.message);
    throw err;
  }

  const hourly = (res.hourly || []).map(toHour);
  const synoptic = (res.synoptic || []).map(toHour);
  const earlier = (res.earlier || []).map(toHour);
  if (!hourly.length && !synoptic.length) {
    throw new Error('No recent WeatherNext 3 run was found for this location.');
  }
  if (hourly.every((h) => h.temp == null) && synoptic.every((h) => h.temp == null)) {
    throw new Error('WeatherNext 3 has no data at this point.');
  }

  // Prefer the fresher run for every valid time it covers.
  const byTime = new Map();
  for (const h of earlier) byTime.set(h.t, h);
  for (const h of synoptic) byTime.set(h.t, h);
  for (const h of hourly) byTime.set(h.t, h);
  const cutoff = Date.now() - 24 * HOUR; // keeps the earlier hours of today
  const hours = [...byTime.values()].filter((h) => h.t >= cutoff).sort((a, b) => a.t - b.t);

  return {
    source: 'weathernext',
    runs: {
      latest: res.hourlyInit || null,
      extended: res.synopticInit || null,
    },
    hours,
  };
}
