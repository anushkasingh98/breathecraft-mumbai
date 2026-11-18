// AQI data access, CPCB conversion, factor defaults and the what-if predictor.
const D = window.AQI_DATA;
const START_MS = Date.UTC(2025, 1, 1);
const NDAYS = D.days;

const dayDate = d => new Date(START_MS + d * 864e5);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// CPCB (India) PM2.5 sub-index breakpoints
const PM25_BP = [[0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 500, 400, 500]];
function pmToAQI(c) {
  for (const [cl, ch, il, ih] of PM25_BP) if (c <= ch) return il + (ih - il) * (c - cl) / (ch - cl);
  return 500;
}

const CATS = [
  { max: 50, name: 'Good', color: '#00b050' },
  { max: 100, name: 'Satisfactory', color: '#92d050' },
  { max: 200, name: 'Moderate', color: '#f4d600' },
  { max: 300, name: 'Poor', color: '#ff9900' },
  { max: 400, name: 'Very Poor', color: '#ff2a2a' },
  { max: 9999, name: 'Severe', color: '#a00000' },
];
const category = aqi => CATS.find(c => aqi <= c.max);

// Station AQI: blend of the hour and its trailing 24h mean (CPCB uses 24h averages)
const stationAQICache = D.stations.map(() => new Map());
function stationAQI(s, i) {
  const c = stationAQICache[s];
  if (c.has(i)) return c.get(i);
  const pm = D.stations[s].pm;
  let sum = 0, n = 0;
  for (let k = Math.max(0, i - 23); k <= i; k++) { sum += pm[k]; n++; }
  const v = pmToAQI(0.5 * pm[i] + 0.5 * sum / n);
  c.set(i, v);
  return v;
}
const isImputed = (s, i) => D.stations[s].imputed[i] === '1';
const isForecast = (s, i) => D.stations[s].imputed[i] === '2';

const DIWALI_DAYS = ['2025-10-19', '2025-10-20', '2025-10-21', '2026-11-07', '2026-11-08', '2026-11-09']
  .map(s => Math.round((Date.parse(s) - START_MS) / 864e5));

// ---- Factor defaults for a given hour index (what the city actually looked like)
function trafficAt(i) {
  const h = i % 24, dow = dayDate(Math.floor(i / 24)).getUTCDay();
  let v = 12 + 70 * Math.exp(-((h - 9.5) ** 2) / 4) + 78 * Math.exp(-((h - 19) ** 2) / 5) + 25 * Math.exp(-((h - 14) ** 2) / 12);
  if (dow === 0) v *= 0.6;
  return Math.round(clamp(v, 0, 100));
}
const CONSTRUCTION_BY_MONTH = [70, 70, 68, 65, 60, 25, 15, 15, 30, 55, 65, 70]; // monsoon work bans
const HUMIDITY_BY_MONTH = [55, 58, 62, 68, 72, 84, 88, 88, 84, 74, 62, 56];

function conditionsAt(i) {
  const d = Math.floor(i / 24), h = i % 24, w = D.weather, m = dayDate(d).getUTCMonth();
  const dayCurve = Math.sin(((h - 9) / 24) * 2 * Math.PI); // peak ~15:00
  return {
    temp: Math.round((w.tavg[d] + dayCurve * (w.tmax[d] - w.tmin[d]) / 2) * 2) / 2,
    precip: Math.round(w.prcp[d]),
    wind: Math.round(w.wspd[d] * (1 + 0.35 * dayCurve)),
    humidity: Math.round(clamp(HUMIDITY_BY_MONTH[m] - 10 * dayCurve, 20, 100)),
    traffic: trafficAt(i),
    construction: CONSTRUCTION_BY_MONTH[m],
    festival: DIWALI_DAYS.includes(d) && h >= 18,
  };
}

// ---- What-if predictor: scale the recorded AQI by how far each factor is moved.
// Firecracker uplift is fitted on the station data (bake.js); the weather fit is confounded
// with season, so the other elasticities are hand-set to physically sensible values.
const COEF = {
  temp: -0.03,          // per °C: cooler air -> lower mixing height, pollution trapped
  precip: -0.25,        // per log(1+mm/day): rain washes particles out
  wind: -0.03,          // per km/h: dispersion
  humidity: 0.004,      // per %: hygroscopic growth of particles
  traffic: 0.006,       // per index point
  construction: 0.005,  // per index point (dust)
  festival: D.model.festival,
};
function predictAQI(recordedAQI, f, f0) {
  const pm0 = Math.max(1, aqiToPM(recordedAQI));
  const z =
    COEF.temp * (f.temp - f0.temp) +
    COEF.precip * (Math.log1p(f.precip) - Math.log1p(f0.precip)) +
    COEF.wind * (f.wind - f0.wind) +
    COEF.humidity * (f.humidity - f0.humidity) +
    COEF.traffic * (f.traffic - f0.traffic) +
    COEF.construction * (f.construction - f0.construction) +
    COEF.festival * ((f.festival ? 1 : 0) - (f0.festival ? 1 : 0));
  return clamp(pmToAQI(pm0 * Math.exp(z)), 0, 500);
}
function aqiToPM(aqi) {
  for (const [cl, ch, il, ih] of PM25_BP) if (aqi <= ih) return cl + (ch - cl) * (aqi - il) / (ih - il);
  return 500;
}

// Daily city mean AQI for the timeline strip
const DAILY_AQI = Array.from({ length: NDAYS }, (_, d) => {
  let s = 0;
  for (let h = 0; h < 24; h++) for (let k = 0; k < D.stations.length; k++) s += stationAQI(k, d * 24 + h);
  return s / (24 * D.stations.length);
});
