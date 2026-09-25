// Unit conversion and display formatting. Internal units are SI-ish:
// °C, m/s, mm, hPa, W/m².

export function makeFormat(settings, tz) {
  const locale = navigator.language || 'en';
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: tz });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: tz });
  const dateFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  const utcFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' });
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(Date.now());

  const tempVal = (c) => (settings.temp === 'f' ? c * 9 / 5 + 32 : c);
  const windFactor = { kmh: 3.6, ms: 1, mph: 2.23694, kn: 1.94384 }[settings.wind];
  const windUnit = { kmh: 'km/h', ms: 'm/s', mph: 'mph', kn: 'kn' }[settings.wind];

  return {
    tempVal,
    temp: (c) => (c == null ? '–' : `${Math.round(tempVal(c))}°`),
    tempDelta: (d) => (d == null ? '–' : `${Math.round(settings.temp === 'f' ? d * 9 / 5 : d)}°`),
    wind: (ms) => (ms == null ? '–' : `${Math.round(ms * windFactor)}`),
    windUnit,
    precip: (mm) => {
      if (mm == null) return '–';
      if (settings.precip === 'in') return `${(mm / 25.4).toFixed(mm < 25 ? 2 : 1)} in`;
      return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
    },
    pct: (x) => (x == null ? '–' : `${Math.round(x * 100)}%`),
    pop: (x) => (x == null ? '' : x < 0.1 ? '' : `${Math.round(x * 10) * 10}%`),
    hour: (ms) => hourFmt.format(ms),
    time: (ms) => timeFmt.format(ms),
    day: (ms, key) => (key === todayKey ? 'Today' : dayFmt.format(ms)),
    date: (ms) => dateFmt.format(ms),
    utc: (iso) => `${utcFmt.format(Date.parse(iso))} UTC`,
    compass: (deg) => {
      if (deg == null) return '';
      const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    },
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
