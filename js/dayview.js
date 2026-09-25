// Day detail view: day switcher, headline, metric chart with a written
// summary, key numbers and an hour-by-hour table.

import { humidity, feelsLike, CONDITION_LABELS } from './weather.js';
import { weatherIcon } from './icons.js';
import { escapeHtml } from './format.js';
import { renderMetricChart } from './metricchart.js';

export const METRICS = [
  { id: 'temp', label: 'Temperature' },
  { id: 'precip', label: 'Precipitation' },
  { id: 'wind', label: 'Wind' },
  { id: 'humidity', label: 'Humidity' },
  { id: 'clouds', label: 'Clouds' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'sun', label: 'Sun' },
];

const WET = new Set(['drizzle', 'rain', 'heavyRain', 'sleet', 'snow', 'heavySnow']);

function argmax(hours, f) {
  let best = null;
  for (const h of hours) { const v = f(h); if (v != null && (best == null || v > f(best))) best = h; }
  return best;
}
function argmin(hours, f) {
  let best = null;
  for (const h of hours) { const v = f(h); if (v != null && (best == null || v < f(best))) best = h; }
  return best;
}
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function dayStats(day) {
  const hs = day.hours;
  const rh = hs.map((h) => humidity(h.temp, h.dew));
  const feels = hs.map((h) => feelsLike(h.temp, h.dew, h.wind));
  const windMax = argmax(hs, (h) => h.wind);
  return {
    hi: argmax(hs, (h) => h.temp),
    lo: argmin(hs, (h) => h.temp),
    feelsMax: Math.max(...feels.filter((v) => v != null)),
    feelsMin: Math.min(...feels.filter((v) => v != null)),
    rhAvg: avg(rh),
    rhMin: Math.min(...rh.filter((v) => v != null)),
    rhMax: Math.max(...rh.filter((v) => v != null)),
    windMax,
    windHiMax: Math.max(...hs.map((h) => h.windHi ?? 0)),
    wettest: argmax(hs, (h) => h.precip),
    precipHi: hs.reduce((a, h) => a + (h.precipHi ?? 0), 0),
    cloudDay: avg(hs.filter((h) => h.isDay).map((h) => h.cloud)) ?? avg(hs.map((h) => h.cloud)),
    solarPeak: argmax(hs, (h) => h.solar),
  };
}

function metricConfig(id, fmt, wn) {
  const time = (h) => `<div class="tip-time">${escapeHtml(fmt.time(h.t))}</div>`;
  const pctVal = (x) => (x == null ? null : x * 100);
  switch (id) {
    case 'precip':
      return {
        label: 'Precipitation', type: 'bar', min: 0, minSpan: fmt.precipVal(1),
        value: (h) => fmt.precipVal(h.precip ?? 0),
        opacity: (h) => (h.pop == null ? 1 : 0.35 + 0.65 * h.pop),
        tick: (v) => fmt.precipTick(v),
        tip: (h) => `${time(h)}<div class="tip-temp">${fmt.precip(h.precip)}</div>${h.pop != null ? `<div class="tip-sub">${Math.round(h.pop * 100)}% chance</div>` : ''}${wn && h.precipHi != null ? `<div class="tip-sub">Wet case ${fmt.precip(h.precipHi)}</div>` : ''}`,
      };
    case 'wind':
      return {
        label: 'Wind', type: 'line', min: 0, minSpan: 10,
        value: (h) => fmt.windVal(h.wind), lo: (h) => fmt.windVal(h.wind), hi: (h) => fmt.windVal(h.windHi),
        tick: (v) => `${Math.round(v)}`,
        tip: (h) => `${time(h)}<div class="tip-temp">${fmt.wind(h.wind)} ${fmt.windUnit} ${fmt.compass(h.windDir)}</div>${h.windHi != null ? `<div class="tip-sub">${wn ? 'Up to' : 'Gusts'} ${fmt.wind(h.windHi)} ${fmt.windUnit}</div>` : ''}${h.wind100 != null ? `<div class="tip-sub">${fmt.wind(h.wind100)} ${fmt.windUnit} at ${wn ? 100 : 120} m</div>` : ''}`,
      };
    case 'humidity':
      return {
        label: 'Humidity', type: 'line', min: 0, max: 100,
        value: (h) => pctVal(humidity(h.temp, h.dew)),
        tick: (v) => `${Math.round(v)}%`,
        tip: (h) => `${time(h)}<div class="tip-temp">${fmt.pct(humidity(h.temp, h.dew))}</div><div class="tip-sub">Dew point ${fmt.temp(h.dew)}</div>`,
      };
    case 'clouds':
      return {
        label: 'Cloud cover', type: 'area', min: 0, max: 100,
        value: (h) => pctVal(h.cloud),
        tick: (v) => `${Math.round(v)}%`,
        tip: (h) => `${time(h)}<div class="tip-temp">${fmt.pct(h.cloud)}</div><div class="tip-sub">Low ${fmt.pct(h.cloudLow)} · Mid ${fmt.pct(h.cloudMid)} · High ${fmt.pct(h.cloudHigh)}</div>`,
      };
    case 'pressure':
      return {
        label: 'Pressure', type: 'line', minSpan: 6,
        value: (h) => h.pressure,
        tick: (v) => `${Math.round(v)}`,
        tip: (h) => `${time(h)}<div class="tip-temp">${h.pressure == null ? '–' : Math.round(h.pressure)} hPa</div>`,
      };
    case 'sun':
      return {
        label: 'Solar radiation', type: 'area', min: 0, minSpan: 100,
        value: (h) => h.solar ?? 0,
        tick: (v) => `${Math.round(v)}`,
        tip: (h) => `${time(h)}<div class="tip-temp">${Math.round(h.solar ?? 0)} W/m²</div><div class="tip-sub">Cloud cover ${fmt.pct(h.cloud)}</div>`,
      };
    default:
      return {
        label: 'Temperature', type: 'line', minSpan: 6,
        value: (h) => (h.temp == null ? null : fmt.tempVal(h.temp)),
        lo: (h) => (h.tempLo == null ? null : fmt.tempVal(h.tempLo)),
        hi: (h) => (h.tempHi == null ? null : fmt.tempVal(h.tempHi)),
        tick: (v) => `${Math.round(v)}°`,
        tip: (h) => `${time(h)}<div class="tip-temp">${fmt.temp(h.temp)}</div>${h.tempLo != null ? `<div class="tip-sub">Likely ${fmt.temp(h.tempLo)} – ${fmt.temp(h.tempHi)}</div>` : ''}<div class="tip-sub">Feels like ${fmt.temp(feelsLike(h.temp, h.dew, h.wind))}</div>`,
      };
  }
}

function metricSummary(id, day, s, fmt, wn) {
  const t = (h) => fmt.time(h.t);
  switch (id) {
    case 'precip': {
      if (day.precip < 0.1 && (day.pop ?? 0) < 0.2) return 'No precipitation expected.';
      const kind = day.hours.some((h) => ['snow', 'heavySnow'].includes(h.cond)) ? 'snow' : 'rain';
      let txt = `${fmt.precip(day.precip)} of ${kind} expected in total, most around ${t(s.wettest)}.`;
      if (day.pop != null) txt += ` Highest hourly chance ${Math.round(day.pop * 100)}%.`;
      if (wn && s.precipHi > day.precip + 0.5) txt += ` In the wettest 10% of ensemble members it could reach ${fmt.precip(s.precipHi)}.`;
      return txt;
    }
    case 'wind':
      return `Strongest around ${t(s.windMax)} at ${fmt.wind(s.windMax.wind)} ${fmt.windUnit} from the ${fmt.compass(s.windMax.windDir)}.${s.windHiMax > 0 ? ` ${wn ? 'Stronger ensemble members reach' : 'Gusts up to'} ${fmt.wind(s.windHiMax)} ${fmt.windUnit}.` : ''}`;
    case 'humidity':
      return `Average humidity ${fmt.pct(s.rhAvg)}, ranging from ${fmt.pct(s.rhMin)} to ${fmt.pct(s.rhMax)}.`;
    case 'clouds': {
      const c = s.cloudDay;
      const word = c < 0.2 ? 'Mostly clear' : c < 0.5 ? 'A mix of sun and cloud' : c < 0.8 ? 'Mostly cloudy' : 'Overcast';
      return `${word} during daylight, averaging ${fmt.pct(c)} cloud cover.`;
    }
    case 'pressure': {
      const a = day.hours[0].pressure;
      const b = day.hours[day.hours.length - 1].pressure;
      if (a == null || b == null) return '';
      const d = b - a;
      return Math.abs(d) < 1.5 ? `Steady near ${Math.round(a)} hPa.` : `${d > 0 ? 'Rising' : 'Falling'} from ${Math.round(a)} to ${Math.round(b)} hPa${d > 0 ? ', usually a sign of settling weather' : ', often ahead of unsettled weather'}.`;
    }
    case 'sun': {
      const sun = day.sun;
      if (sun.polar) return sun.polar === 'day' ? 'The sun stays up all day.' : 'The sun stays below the horizon.';
      const len = (sun.set - sun.rise) / 3_600_000;
      return `${Math.floor(len)} h ${Math.round((len % 1) * 60)} min of daylight. ${day.solar.toFixed(1)} kWh/m² of solar energy${s.solarPeak && s.solarPeak.solar > 0 ? `, peaking around ${t(s.solarPeak)}` : ''}.`;
    }
    default: {
      let txt = `High of ${fmt.temp(s.hi.temp)} around ${t(s.hi)}, low of ${fmt.temp(s.lo.temp)} around ${t(s.lo)}.`;
      if (s.hi.tempLo != null) txt += ` The ensemble puts the high between ${fmt.temp(s.hi.tempLo)} and ${fmt.temp(s.hi.tempHi)}.`;
      return txt;
    }
  }
}

export function renderDayView(root, { data, key, metric, fmt, place, nowT }) {
  const wn = data.source === 'weathernext';
  const di = Math.max(0, data.days.findIndex((d) => d.key === key));
  const day = data.days[di];
  const s = dayStats(day);
  const isToday = di === 0;

  const chips = data.days.map((d, i) => `
    <button class="dv-chip" data-open-day="${d.key}" aria-selected="${i === di}">
      <span>${i === 0 ? 'Today' : escapeHtml(fmt.dayShort(d.noon))}</span>
      <strong>${escapeHtml(fmt.dayNum(d.noon))}</strong>
      ${weatherIcon(d.cond, true, 22)}
    </button>`).join('');

  const tabs = METRICS.map((m) =>
    `<button role="tab" data-day-metric="${m.id}" aria-selected="${m.id === metric}">${m.label}</button>`).join('');

  const sun = day.sun;
  const sunTxt = sun.polar === 'day' ? 'Polar day' : 'Polar night';
  const dayLen = sun.polar ? 0 : (sun.set - sun.rise) / 3_600_000;
  const daylight = `${Math.floor(dayLen)} h ${Math.round((dayLen % 1) * 60)} min`;

  const stat = (label, value, sub = '') =>
    `<div class="dv-stat"><span class="dv-stat-label">${label}</span><span class="dv-stat-value">${value}</span>${sub ? `<span class="dv-stat-sub">${sub}</span>` : ''}</div>`;

  const spread = s.hi.tempHi != null ? (s.hi.tempHi - s.hi.tempLo) / 2 : null;
  const stats = [
    stat('High / low', `${fmt.temp(s.hi.temp)} / ${fmt.temp(s.lo.temp)}`, s.hi.tempLo != null ? `High likely ${fmt.temp(s.hi.tempLo)}–${fmt.temp(s.hi.tempHi)}` : ''),
    stat('Feels like', `${fmt.temp(s.feelsMax)} / ${fmt.temp(s.feelsMin)}`),
    stat('Precipitation', fmt.precip(day.precip), day.pop == null ? '' : day.pop < 0.05 ? 'Dry' : `Up to ${Math.round(day.pop * 100)}% chance`),
    stat('Wind', `${fmt.wind(s.windMax.wind)} <small>${fmt.windUnit}</small>`, `${fmt.compass(s.windMax.windDir)} · ${wn ? 'up to' : 'gusts'} ${fmt.wind(s.windHiMax)}`),
    stat('Humidity', fmt.pct(s.rhAvg), `${fmt.pct(s.rhMin)} – ${fmt.pct(s.rhMax)}`),
    stat('Cloud cover', fmt.pct(s.cloudDay), 'Daytime average'),
    sun.polar ? stat('Daylight', sunTxt) : stat('Sunrise', escapeHtml(fmt.time(sun.rise))),
    sun.polar ? '' : stat('Sunset', escapeHtml(fmt.time(sun.set)), `${daylight} of daylight`),
    stat('Solar energy', `${day.solar.toFixed(1)} <small>kWh/m²</small>`),
    wn && spread != null ? stat('Confidence', spread < 1.5 ? 'High' : spread < 3 ? 'Medium' : 'Low', `High ±${fmt.tempDelta(spread)}`) : '',
  ].join('');

  const rows = day.hours.map((h) => {
    const rh = humidity(h.temp, h.dew);
    const past = nowT != null && h.t < nowT - 30 * 60_000;
    return `<tr class="${past ? 'past' : ''}">
      <td class="dv-t">${escapeHtml(fmt.hour(h.t))}</td>
      <td class="dv-i">${weatherIcon(h.cond, h.isDay, 26, CONDITION_LABELS[h.cond])}</td>
      <td class="dv-temp">${fmt.temp(h.temp)}${h.tempLo != null ? `<small>${fmt.temp(h.tempLo)}–${fmt.temp(h.tempHi)}</small>` : ''}</td>
      <td class="dv-rain">${(h.precip ?? 0) >= 0.05 ? fmt.precip(h.precip) : '–'}${h.pop != null && h.pop >= 0.1 ? `<small>${Math.round(h.pop * 100)}%</small>` : ''}</td>
      <td class="dv-wind"><span class="arrow" style="transform:rotate(${Math.round((h.windDir ?? 0) + 180)}deg)" aria-hidden="true">↑</span>${fmt.wind(h.wind)}<small>${fmt.windUnit}</small></td>
      <td class="dv-rh">${fmt.pct(rh)}</td>
    </tr>`;
  }).join('');

  const dryHours = day.hours.filter((h) => !WET.has(h.cond)).length;
  const headline = WET.has(day.cond)
    ? `${CONDITION_LABELS[day.cond]}${day.pop != null ? `, ${Math.round(day.pop * 100)}% chance` : ''}. ${dryHours} of ${day.hours.length} hours dry.`
    : `${CONDITION_LABELS[day.cond]}.`;

  root.innerHTML = `
    <div class="dv-inner">
      <header class="dv-top">
        <button class="icon-btn" data-action="close-day" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>
        </button>
        <div class="dv-heading">
          <h2 id="dayTitle">${isToday ? 'Today' : escapeHtml(fmt.weekday(day.noon))}</h2>
          <span class="muted">${escapeHtml(fmt.monthDay(day.noon))} · ${escapeHtml(place.name)}</span>
        </div>
        <span class="dv-nav">
          <button class="icon-btn" data-open-day="${data.days[di - 1]?.key || ''}" ${di === 0 ? 'disabled' : ''} aria-label="Previous day">‹</button>
          <button class="icon-btn" data-open-day="${data.days[di + 1]?.key || ''}" ${di === data.days.length - 1 ? 'disabled' : ''} aria-label="Next day">›</button>
        </span>
      </header>

      <nav class="dv-chips" aria-label="Choose day">${chips}</nav>

      <section class="dv-hero" id="dvHero">
        ${weatherIcon(day.cond, true, 72, CONDITION_LABELS[day.cond])}
        <div>
          <div class="dv-hl"><span class="dv-hi">${fmt.temp(day.tempMax)}</span><span class="dv-lo">${fmt.temp(day.tempMin)}</span></div>
          <p class="dv-headline">${escapeHtml(headline)}</p>
        </div>
      </section>

      <section class="card">
        <div class="dv-tabs seg small" role="tablist" aria-label="Metric">${tabs}</div>
        <p class="dv-summary">${escapeHtml(metricSummary(metric, day, s, fmt, wn))}</p>
        <div class="chart" id="dayChart"></div>
        ${metric === 'temp' && wn ? '<p class="chart-note"><span class="swatch-band"></span> Band: 80% of the 64 ensemble members (p10–p90)</p>' : ''}
      </section>

      <section class="card">
        <h3 class="card-title">Day overview</h3>
        <div class="dv-stats">${stats}</div>
      </section>

      <section class="card">
        <h3 class="card-title">Hour by hour</h3>
        <table class="dv-table">
          <thead><tr><th>Time</th><th></th><th>Temp</th><th>Precip</th><th>Wind</th><th>Hum.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </div>`;

  drawDayChart(root, { data, key, metric, fmt, nowT });
  root.querySelector('.dv-chip[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

export function drawDayChart(root, { data, key, metric, fmt, nowT }) {
  const el = root.querySelector('#dayChart');
  const day = data.days.find((d) => d.key === key);
  if (!el || !day || day.hours.length < 2) return;
  renderMetricChart(el, day.hours, metricConfig(metric, fmt, data.source === 'weathernext'), {
    hourLabel: fmt.hourShort,
    hourOf: fmt.hourOf,
    nowT,
  });
}
