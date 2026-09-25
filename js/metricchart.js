// Single-metric chart for the day detail view: a line (optionally with an
// uncertainty band) or bars, one y-axis, with a crosshair tooltip.

const PAD_L = 40;
const PAD_R = 10;
const PAD_T = 14;
const PLOT_H = 180;
const AXIS_H = 24;

function niceStep(span) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * cfg: {
 *   value(h) -> number|null, lo?(h), hi?(h), type: 'line'|'bar'|'area',
 *   min?, max?, minSpan?, tick(v) -> string, tip(h) -> html
 * }
 */
export function renderMetricChart(root, hours, cfg, { hourLabel, hourOf, nowT }) {
  const width = Math.max(280, root.clientWidth);
  const height = PAD_T + PLOT_H + AXIS_H;
  const innerW = width - PAD_L - PAD_R;
  const n = hours.length;
  const slot = innerW / n;
  const x = (i) => PAD_L + slot * (i + 0.5);

  const vals = hours.map(cfg.value);
  const los = hours.map((h, i) => (cfg.lo ? cfg.lo(h) ?? vals[i] : vals[i]));
  const his = hours.map((h, i) => (cfg.hi ? cfg.hi(h) ?? vals[i] : vals[i]));
  const present = (a) => a.filter((v) => v != null && Number.isFinite(v));
  let yMin = cfg.min ?? Math.min(...present(los));
  let yMax = cfg.max ?? Math.max(...present(his));
  if (cfg.type !== 'line') yMin = cfg.min ?? 0;
  const minSpan = cfg.minSpan ?? 1;
  if (yMax - yMin < minSpan) {
    if (cfg.min != null || cfg.type !== 'line') yMax = yMin + minSpan;
    else { const mid = (yMax + yMin) / 2; yMin = mid - minSpan / 2; yMax = mid + minSpan / 2; }
  }
  const step = niceStep(yMax - yMin);
  if (cfg.min == null) yMin = Math.floor(yMin / step) * step;
  if (cfg.max == null) yMax = Math.ceil(yMax / step) * step;
  const y = (v) => PAD_T + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${cfg.label || 'Chart'}">`;
  for (let v = yMin; v <= yMax + step / 1000; v += step) {
    svg += `<line class="gridline" x1="${PAD_L}" x2="${width - PAD_R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${PAD_L - 6}" y="${y(v) + 4}" text-anchor="end">${cfg.tick(v)}</text>`;
  }

  const every = n > 30 ? 6 : 3;
  hours.forEach((h, i) => {
    if (hourOf(h.t) % every === 0) {
      svg += `<text class="axis" x="${x(i)}" y="${height - 6}" text-anchor="middle">${hourLabel(h.t)}</text>`;
    }
  });

  if (nowT != null && nowT >= hours[0].t && nowT <= hours[n - 1].t) {
    const k = (nowT - hours[0].t) / (hours[n - 1].t - hours[0].t || 1);
    const nx = x(0) + k * (x(n - 1) - x(0));
    svg += `<line class="now-line" x1="${nx}" x2="${nx}" y1="${PAD_T}" y2="${PAD_T + PLOT_H}"/>`;
    svg += `<text class="axis now-label" x="${nx}" y="${PAD_T - 3}" text-anchor="middle">Now</text>`;
  }

  if (cfg.type === 'bar') {
    const bw = Math.max(2, slot - 3);
    hours.forEach((h, i) => {
      const v = vals[i];
      if (v == null || v <= 0) return;
      const bh = Math.max(2, PAD_T + PLOT_H - y(v));
      const op = cfg.opacity ? cfg.opacity(h) : 1;
      svg += `<rect class="metric-bar" x="${(x(i) - bw / 2).toFixed(1)}" y="${(PAD_T + PLOT_H - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, bw / 2)}" opacity="${op.toFixed(2)}"/>`;
    });
  } else {
    if (cfg.lo || cfg.hi) {
      const idx = hours.map((_, i) => i).filter((i) => los[i] != null && his[i] != null);
      if (idx.length > 1 && idx.some((i) => his[i] !== los[i])) {
        const top = idx.map((i) => `${x(i).toFixed(1)},${y(his[i]).toFixed(1)}`);
        const bot = idx.map((i) => `${x(i).toFixed(1)},${y(los[i]).toFixed(1)}`).reverse();
        svg += `<polygon class="band" points="${top.concat(bot).join(' ')}"/>`;
      }
    }
    const pts = hours.map((_, i) => i).filter((i) => vals[i] != null);
    const d = pts.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join('');
    if (cfg.type === 'area' && pts.length) {
      svg += `<path class="metric-area" d="${d}L${x(pts[pts.length - 1]).toFixed(1)},${PAD_T + PLOT_H}L${x(pts[0]).toFixed(1)},${PAD_T + PLOT_H}Z"/>`;
    }
    svg += `<path class="temp-line" d="${d}"/>`;
  }

  svg += `<g class="crosshair" visibility="hidden"><line class="cross-line" y1="${PAD_T}" y2="${PAD_T + PLOT_H}"/><circle class="cross-dot" r="5"/></g>`;
  svg += `<rect class="hit" x="${PAD_L}" y="0" width="${innerW}" height="${height}" fill="transparent"/></svg>`;
  root.innerHTML = `${svg}<div class="chart-tip" hidden></div>`;

  const el = root.querySelector('svg');
  const cross = el.querySelector('.crosshair');
  const line = cross.querySelector('line');
  const dot = cross.querySelector('circle');
  const tip = root.querySelector('.chart-tip');

  const show = (clientX) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - PAD_L) / slot)));
    const cx = x(i);
    cross.setAttribute('visibility', 'visible');
    line.setAttribute('x1', cx);
    line.setAttribute('x2', cx);
    const v = vals[i];
    dot.setAttribute('visibility', v == null || cfg.type === 'bar' ? 'hidden' : 'visible');
    if (v != null) { dot.setAttribute('cx', cx); dot.setAttribute('cy', y(v)); }
    tip.innerHTML = cfg.tip(hours[i]);
    tip.hidden = false;
    const scale = rect.width / width;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, cx * scale - w / 2), rect.width - w)}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
  root.addEventListener('touchend', () => setTimeout(hide, 1800), { passive: true });
}
