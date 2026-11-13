// Bakes station PM2.5 + Open-Meteo weather into game/data.js and fits the what-if model.
// Run: node game/tools/bake.js   (from the AQI_Hackathon folder)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const START = Date.UTC(2025, 1, 1);
const now = new Date();
const TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const NDAYS = Math.round((TODAY - START) / 864e5) + 1;
const NH = NDAYS * 24;

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const out = []; let cur = '', q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    rows.push(out);
  }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const dayIdx = s => Math.round((Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - START) / 864e5);

// ---- stations
const stations = parseCSV(fs.readFileSync(path.join(ROOT, 'Data/Stations.csv'), 'utf8'));
const sIndex = {};
stations.forEach((s, i) => { sIndex[s.location_id] = i; });
const sum = stations.map(() => new Float64Array(NH));
const cnt = stations.map(() => new Uint16Array(NH));

for (const r of parseCSV(fs.readFileSync(path.join(ROOT, 'Data/Train.csv'), 'utf8'))) {
  const pm = parseFloat(r.pm25);
  if (!(pm >= 0) || pm > 1000 || r.flag_high_1000 === 'True') continue;
  let d = dayIdx(r.timestamp_ist), h = +r.timestamp_ist.slice(11, 13) - 1; // hour-ending -> hour-starting
  if (h < 0) { h = 23; d -= 1; }
  const i = d * 24 + h, s = sIndex[r.location_id];
  if (s === undefined || i < 0 || i >= NH) continue;
  sum[s][i] += pm; cnt[s][i]++;
}

const monthOf = i => new Date(START + Math.floor(i / 24) * 864e5).getUTCMonth();
const median = a => { if (!a.length) return NaN; a.sort((x, y) => x - y); return a[a.length >> 1]; };

const outStations = stations.map((s, k) => {
  const pm = new Array(NH).fill(NaN);
  const buckets = {};
  for (let i = 0; i < NH; i++) if (cnt[k][i]) {
    pm[i] = sum[k][i] / cnt[k][i];
    (buckets[monthOf(i) * 24 + (i % 24)] ||= []).push(pm[i]);
  }
  const clim = {};
  for (const key in buckets) clim[key] = median(buckets[key]);
  let imputed = '';
  for (let i = 0; i < NH; i++) {
    if (Number.isNaN(pm[i])) { pm[i] = clim[monthOf(i) * 24 + (i % 24)] ?? 40; imputed += '1'; }
    else imputed += '0';
  }
  return {
    name: s.station_name.replace(', Mumbai', '').replace(/ - (IITM|BMC)/, ''),
    lat: +s.latitude, lon: +s.longitude,
    pm: pm.map(v => Math.round(v * 10) / 10),
    imputed,
  };
});

// ---- weather (daily)
const wx = { tavg: [], tmin: [], tmax: [], prcp: [], wspd: [] };
const wrows = {};
for (const r of parseCSV(fs.readFileSync(path.join(ROOT, 'Data/OtherData/openmeteo_daily.csv'), 'utf8'))) wrows[r.date] = r;
let last = null;
for (let d = 0; d < NDAYS; d++) {
  const r = wrows[new Date(START + d * 864e5).toISOString().slice(0, 10)] || last;
  last = r;
  wx.tavg.push(+r.temperature_2m_mean); wx.tmin.push(+r.temperature_2m_min); wx.tmax.push(+r.temperature_2m_max);
  wx.prcp.push(+r.precipitation_sum); wx.wspd.push(+r.wind_speed_10m_mean);
}

// ---- proxies shared with the game (keep in sync with game/js/data.js)
const DIWALI = ['2025-10-19', '2025-10-20', '2025-10-21', '2026-11-07', '2026-11-08', '2026-11-09'].map(dayIdx);
function traffic(i) {
  const h = i % 24, dow = new Date(START + Math.floor(i / 24) * 864e5).getUTCDay();
  let v = 12 + 70 * Math.exp(-((h - 9.5) ** 2) / 4) + 78 * Math.exp(-((h - 19) ** 2) / 5) + 25 * Math.exp(-((h - 14) ** 2) / 12);
  if (dow === 0) v *= 0.6;
  return Math.min(100, v);
}
const fire = i => (DIWALI.includes(Math.floor(i / 24)) && i % 24 >= 18 ? 1 : 0);

// ---- fit log(PM2.5) ~ weather + traffic + firecrackers + season (least squares)
const X = [], Y = [];
for (let i = 0; i < NH; i++) {
  let s = 0, n = 0;
  for (let k = 0; k < stations.length; k++) if (cnt[k][i]) { s += sum[k][i] / cnt[k][i]; n++; }
  if (!n) continue;
  const d = Math.floor(i / 24), doy = (d + 31) / 365 * 2 * Math.PI;
  X.push([1, wx.tavg[d], Math.log1p(wx.prcp[d]), wx.wspd[d], traffic(i) / 100, fire(i), Math.sin(doy), Math.cos(doy)]);
  Y.push(Math.log(Math.max(3, s / n)));
}
const p = X[0].length;
const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
X.forEach((x, r) => {
  for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += x[a] * x[b]; A[a][p] += x[a] * Y[r]; }
});
for (let a = 1; a < p; a++) A[a][a] += 1e-3 * X.length; // light ridge
for (let c = 0; c < p; c++) { // gauss-jordan
  let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
  [A[c], A[piv]] = [A[piv], A[c]];
  for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; }
}
const beta = A.map((row, i) => row[p] / row[i]);
const pred = X.map(x => x.reduce((s, v, i) => s + v * beta[i], 0));
const my = Y.reduce((a, b) => a + b) / Y.length;
const r2 = 1 - Y.reduce((s, y, i) => s + (y - pred[i]) ** 2, 0) / Y.reduce((s, y) => s + (y - my) ** 2, 0);
const model = {
  temp: beta[1], precip: beta[2], wind: beta[3], traffic: beta[4] / 100, festival: beta[5],
  r2: Math.round(r2 * 100) / 100, n: Y.length,
};
console.log('model', model);

const out = { start: '2025-02-01', days: NDAYS, stations: outStations, weather: wx, model };
fs.writeFileSync(path.join(__dirname, '../data.js'), 'window.AQI_DATA = ' + JSON.stringify(out) + ';\n');
console.log('days', NDAYS, 'stations', outStations.map(s => s.name + ' imputed ' + [...s.imputed].filter(c => c === '1').length));
