// Demo provider: Open-Meteo (free, no key). Used before WeatherNext access is
// set up, and always labelled as demo data in the UI.

const VARS = [
  'temperature_2m', 'dew_point_2m', 'precipitation', 'precipitation_probability',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_120m',
  'pressure_msl', 'shortwave_radiation',
];

export async function fetchOpenMeteo({ lat, lon }) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: VARS.join(','),
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    forecast_days: '15',
    past_hours: '2',
  });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo request failed (${r.status})`);
  const { hourly: h } = await r.json();

  const pct = (v) => (v == null ? null : v / 100);
  const hours = h.time.map((t, i) => ({
    t: t * 1000,
    temp: h.temperature_2m[i],
    tempLo: null,
    tempHi: null,
    dew: h.dew_point_2m[i],
    precip: h.precipitation[i],
    precipHi: null,
    pop: pct(h.precipitation_probability[i]),
    cloud: pct(h.cloud_cover[i]),
    cloudLow: pct(h.cloud_cover_low[i]),
    cloudMid: pct(h.cloud_cover_mid[i]),
    cloudHigh: pct(h.cloud_cover_high[i]),
    wind: h.wind_speed_10m[i],
    windHi: h.wind_gusts_10m[i],
    windDir: h.wind_direction_10m[i],
    wind100: h.wind_speed_120m[i],
    pressure: h.pressure_msl[i],
    solar: h.shortwave_radiation[i],
  })).filter((x) => x.temp != null);

  return { source: 'demo', runs: null, hours };
}
