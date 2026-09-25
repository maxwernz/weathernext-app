// Default settings. The OAuth client ID and Cloud project are not secrets
// (they only identify the app); fill them in here so every device you open
// the app on is preconfigured, or enter them in the in-app Settings sheet.

export const DEFAULTS = {
  source: 'weathernext', // 'weathernext' | 'demo'
  clientId: '',          // e.g. '1234-abc.apps.googleusercontent.com'
  project: '',           // Google Cloud project registered for Earth Engine
  temp: 'c',             // 'c' | 'f'
  wind: 'kmh',           // 'kmh' | 'ms' | 'mph' | 'kn'
  precip: 'mm',          // 'mm' | 'in'
  appearance: 'sky',     // 'sky' | 'clean'
  theme: 'auto',         // 'auto' | 'light' | 'dark' (Clean appearance only)
};

// Used when no place is saved and geolocation is unavailable.
export const FALLBACK_PLACE = {
  name: 'Tübingen',
  region: 'Baden-Württemberg, Germany',
  lat: 48.5216,
  lon: 9.0576,
  tz: 'Europe/Berlin',
};

export const WEATHERNEXT = {
  collection: 'projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg',
  scope: 'https://www.googleapis.com/auth/earthengine',
  eeScript: 'https://cdn.jsdelivr.net/npm/@google/earthengine@1.7.45/build/ee_api_js.js',
};
