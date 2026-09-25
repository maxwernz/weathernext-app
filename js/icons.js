// Hand-built weather icons as inline SVG, composed from a few primitives.

const SUN = '#FFC940';
// Colours come from CSS custom properties so each appearance can tune them.
const MOON = 'var(--ico-moon, #E8EEF9)';
const CLOUD = 'var(--ico-cloud, #F4F7FB)';
const CLOUD_DARK = 'var(--ico-cloud-dark, #B8C4D6)';
const DROP = 'var(--ico-drop, #6BB8FF)';
const SNOW = 'var(--ico-snow, #FFFFFF)';

const sun = (cx, cy, r) => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<g stroke="${SUN}" stroke-width="3" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>`;
};

const moon = (cx, cy, r) =>
  `<path style="fill:${MOON}" d="M${cx + r * 0.35} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55} a${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.65} -${r * 1.55}z"/>`;

const cloud = (dx, dy, s, fill = CLOUD) =>
  `<path transform="translate(${dx} ${dy}) scale(${s})" style="fill:${fill}" d="M16 40h30a11 11 0 0 0 1.5-21.9A15 15 0 0 0 18.6 16 12 12 0 0 0 16 40z"/>`;

const drops = (n, heavy) => {
  let out = '';
  const xs = n === 2 ? [24, 38] : [20, 31, 42];
  for (const x of xs) {
    out += `<line x1="${x}" y1="48" x2="${x - 3}" y2="${heavy ? 60 : 56}" style="stroke:${DROP}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return out;
};

const flakes = (xs) =>
  xs.map((x) => `<g style="stroke:${SNOW}" stroke-width="2" stroke-linecap="round" transform="translate(${x} 54)"><line x1="-4" y1="0" x2="4" y2="0"/><line x1="-2" y1="-3.5" x2="2" y2="3.5"/><line x1="-2" y1="3.5" x2="2" y2="-3.5"/></g>`).join('');

const fogLines = `<g style="stroke:${CLOUD}" stroke-width="3" stroke-linecap="round" opacity=".9"><line x1="10" y1="46" x2="50" y2="46"/><line x1="16" y1="53" x2="56" y2="53"/><line x1="12" y1="60" x2="44" y2="60"/></g>`;

const body = (cond, isDay) => {
  const orb = (cx, cy, r) => (isDay ? sun(cx, cy, r) : moon(cx, cy, r));
  switch (cond) {
    case 'clear': return orb(32, 32, isDay ? 11 : 14);
    case 'mostlyClear': return orb(24, 24, 9) + cloud(14, 16, 0.85);
    case 'partly': return orb(22, 22, 9) + cloud(8, 12, 1);
    case 'mostlyCloudy': return orb(20, 18, 7) + cloud(20, 4, 0.7, CLOUD_DARK) + cloud(4, 12, 1);
    case 'overcast': return cloud(18, 2, 0.8, CLOUD_DARK) + cloud(2, 12, 1);
    case 'fog': return cloud(4, 0, 0.95) + fogLines;
    case 'drizzle': return cloud(2, 4, 1) + drops(2, false);
    case 'rain': return cloud(2, 4, 1) + drops(3, false);
    case 'heavyRain': return cloud(18, -4, 0.7, CLOUD_DARK) + cloud(2, 4, 1) + drops(3, true);
    case 'sleet': return cloud(2, 4, 1) + `<line x1="22" y1="48" x2="19" y2="56" style="stroke:${DROP}" stroke-width="3" stroke-linecap="round"/>` + flakes([38]);
    case 'snow': return cloud(2, 4, 1) + flakes([22, 40]);
    case 'heavySnow': return cloud(2, 4, 1) + flakes([18, 31, 44]);
    default: return cloud(2, 12, 1);
  }
};

export function weatherIcon(cond, isDay = true, size = 32, label = '') {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="wx-icon" viewBox="0 0 64 64" width="${size}" height="${size}" ${a11y}>${body(cond, isDay)}</svg>`;
}
