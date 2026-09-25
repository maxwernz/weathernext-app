// Temperature chart with the ensemble p10–p90 band, plus a separate
// precipitation panel on the same time axis. Plain SVG, with a crosshair
// tooltip that works for mouse and touch.

import { escapeHtml } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const TEMP_H = 170;
const GAP = 22;
const PRECIP_H = 48;
const AXIS_H = 22;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 12;

export function renderChart(root, hours, fmt, { tz }) {
  const width = Math.max(280, root.clientWidth);
  const height = PAD_T + TEMP_H + GAP + PRECIP_H + AXIS_H;
  const innerW = width - PAD_L - PAD_R;
  const t0 = hours[0].t;
  const t1 = hours[hours.length - 1].t;
  const x = (t) => PAD_L + ((t - t0) / (t1 - t0 || 1)) * innerW;

  const hasBand = hours.some((h) => h.tempLo != null && h.tempHi != null);
  const lows = hours.map((h) => fmt.tempVal(h.tempLo ?? h.temp));
  const highs = hours.map((h) => fmt.tempVal(h.tempHi ?? h.temp));
  let yMin = Math.min(...lows);
  let yMax = Math.max(...highs);
  const span = Math.max(4, yMax - yMin);
  const step = span > 30 ? 10 : span > 12 ? 5 : 2;
  yMin = Math.floor((yMin - span * 0.08) / step) * step;
  yMax = Math.ceil((yMax + span * 0.08) / step) * step;
  const y = (v) => PAD_T + TEMP_H - ((v - yMin) / (yMax - yMin)) * TEMP_H;

  const pTop = PAD_T + TEMP_H + GAP;
  const pMax = Math.max(2, ...hours.map((h) => h.precip ?? 0));
  const py = (mm) => (mm / pMax) * PRECIP_H;

  let svg = `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Temperature and precipitation chart">`;

  // Grid + y labels.
  for (let v = yMin; v <= yMax; v += step) {
    svg += `<line class="gridline" x1="${PAD_L}" x2="${width - PAD_R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${PAD_L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}°</text>`;
  }
  svg += `<line class="gridline" x1="${PAD_L}" x2="${width - PAD_R}" y1="${pTop + PRECIP_H}" y2="${pTop + PRECIP_H}"/>`;
  svg += `<text class="axis" x="${PAD_L - 6}" y="${pTop + 10}" text-anchor="end">${fmt.precip(pMax).split(' ')[0]}</text>`;
  svg += `<text class="axis" x="${PAD_L - 6}" y="${pTop + PRECIP_H}" text-anchor="end">${fmt.precip(0).split(' ')[1]}</text>`;

  // Day boundaries / time labels.
  const hoursSpan = (t1 - t0) / 3_600_000;
  const dayFmt = new Intl.DateTimeFormat(navigator.language || 'en', { weekday: 'short', timeZone: tz });
  const hourOf = (t) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(t));
  const labelEvery = hoursSpan <= 50 ? 6 : 24;
  for (const h of hours) {
    const hr = hourOf(h.t);
    if (hr === 0) {
      svg += `<line class="day-line" x1="${x(h.t)}" x2="${x(h.t)}" y1="${PAD_T}" y2="${pTop + PRECIP_H}"/>`;
    }
    if (labelEvery === 6 && hr % 6 === 0 && x(h.t) > PAD_L + 12 && x(h.t) < width - PAD_R - 12) {
      svg += `<text class="axis" x="${x(h.t)}" y="${height - 6}" text-anchor="middle">${hr === 0 ? dayFmt.format(h.t) : escapeHtml(fmt.hour(h.t))}</text>`;
    } else if (labelEvery === 24 && hr === 12 && x(h.t) > PAD_L + 10 && x(h.t) < width - PAD_R - 10) {
      svg += `<text class="axis" x="${x(h.t)}" y="${height - 6}" text-anchor="middle">${dayFmt.format(h.t)}</text>`;
    }
  }

  // Ensemble band.
  if (hasBand) {
    const top = hours.map((h, i) => `${x(h.t).toFixed(1)},${y(highs[i]).toFixed(1)}`);
    const bottom = hours.map((h, i) => `${x(h.t).toFixed(1)},${y(lows[i]).toFixed(1)}`).reverse();
    svg += `<polygon class="band" points="${top.concat(bottom).join(' ')}"/>`;
  }

  // Temperature line.
  const line = hours.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(fmt.tempVal(h.temp)).toFixed(1)}`).join('');
  svg += `<path class="temp-line" d="${line}"/>`;

  // Precipitation bars (only where there is some).
  const barW = Math.max(1, innerW / hours.length - (hours.length > 100 ? 0.5 : 2));
  for (const h of hours) {
    const mm = h.precip ?? 0;
    if (mm < 0.05) continue;
    const bh = Math.max(2, py(mm));
    const op = h.pop == null ? 0.9 : 0.35 + 0.6 * h.pop;
    svg += `<rect class="precip-bar" x="${(x(h.t) - barW / 2).toFixed(1)}" y="${(pTop + PRECIP_H - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(2, barW / 2)}" opacity="${op.toFixed(2)}"/>`;
  }

  // Crosshair layer.
  svg += `<g class="crosshair" visibility="hidden"><line class="cross-line" y1="${PAD_T}" y2="${pTop + PRECIP_H}"/><circle class="cross-dot" r="5"/></g>`;
  svg += `<rect class="hit" x="${PAD_L}" y="0" width="${innerW}" height="${height}" fill="transparent"/>`;
  svg += '</svg>';

  root.innerHTML = `${svg}<div class="chart-tip" hidden></div>`;

  const el = root.querySelector('svg');
  const cross = el.querySelector('.crosshair');
  const crossLine = cross.querySelector('line');
  const dot = cross.querySelector('circle');
  const tip = root.querySelector('.chart-tip');

  const show = (clientX) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const t = t0 + ((px - PAD_L) / innerW) * (t1 - t0);
    let i = Math.round(((t - t0) / (t1 - t0)) * (hours.length - 1));
    i = Math.max(0, Math.min(hours.length - 1, i));
    // Hours are evenly spaced, but refine in case of gaps.
    while (i > 0 && Math.abs(hours[i - 1].t - t) < Math.abs(hours[i].t - t)) i--;
    while (i < hours.length - 1 && Math.abs(hours[i + 1].t - t) < Math.abs(hours[i].t - t)) i++;
    const h = hours[i];
    const cx = x(h.t);
    cross.setAttribute('visibility', 'visible');
    crossLine.setAttribute('x1', cx);
    crossLine.setAttribute('x2', cx);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', y(fmt.tempVal(h.temp)));

    const range = h.tempLo != null ? `<div class="tip-sub">Likely ${fmt.temp(h.tempLo)} – ${fmt.temp(h.tempHi)}</div>` : '';
    const rain = (h.precip ?? 0) >= 0.05 || (h.pop ?? 0) >= 0.1
      ? `<div class="tip-sub">${fmt.precip(h.precip)}${h.pop != null ? ` · ${Math.round(h.pop * 100)}% chance` : ''}</div>` : '';
    tip.innerHTML = `<div class="tip-time">${escapeHtml(fmt.date(h.t))}, ${escapeHtml(fmt.time(h.t))}</div><div class="tip-temp">${fmt.temp(h.temp)}</div>${range}${rain}`;
    tip.hidden = false;
    const scale = rect.width / width;
    const left = cx * scale;
    const tipW = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, left - tipW / 2), rect.width - tipW)}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };

  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
  root.addEventListener('touchend', () => setTimeout(hide, 1800), { passive: true });
}
