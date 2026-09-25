// Place search (Open-Meteo geocoding) and current-location lookup.

export async function searchPlaces(query, signal) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({
    name: query,
    count: '8',
    language: (navigator.language || 'en').slice(0, 2),
    format: 'json',
  });
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Search failed');
  const data = await r.json();
  return (data.results || []).map((p) => ({
    name: p.name,
    region: [p.admin1, p.country].filter(Boolean).join(', '),
    lat: p.latitude,
    lon: p.longitude,
    tz: p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
}

function position() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not available'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 10 * 60_000,
    });
  });
}

export async function currentPlace() {
  const pos = await position();
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  let name = 'Current location';
  let region = '';
  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.search = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'en' });
    const r = await fetch(url);
    if (r.ok) {
      const d = await r.json();
      name = d.city || d.locality || name;
      region = [d.principalSubdivision, d.countryName].filter(Boolean).join(', ');
    }
  } catch { /* keep generic name */ }
  return {
    name,
    region,
    lat,
    lon,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    current: true,
  };
}
