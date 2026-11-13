// Real Mumbai basemap (Esri World Street Map tiles, keyless), drawn pixelated in Web Mercator.
// World units = pixels at zoom 17.
const WZ = 17;
const TILE_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
const BOUNDS = { latMin: 18.89, latMax: 19.29, lonMin: 72.77, lonMax: 73.02 };

const toWorld = (lat, lon) => {
  const n = 256 * 2 ** WZ, r = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
};
const toLatLon = (x, y) => {
  const n = 256 * 2 ** WZ;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, x / n * 360 - 180];
};
const [WMIN_X, WMIN_Y] = toWorld(BOUNDS.latMax, BOUNDS.lonMin);
const [WMAX_X, WMAX_Y] = toWorld(BOUNDS.latMin, BOUNDS.lonMax);

// Neighbourhoods. `station` = index into AQI_DATA.stations (real sensor); others are interpolated.
const ZONES = [
  ...D.stations.map((s, i) => ({ name: s.name, station: i, ll: [s.lat, s.lon] })),
  { name: 'Goregaon', ll: [19.165, 72.849] },
  { name: 'Andheri', ll: [19.119, 72.847] },
  { name: 'Juhu', ll: [19.099, 72.827] },
  { name: 'Powai', ll: [19.118, 72.906] },
  { name: 'Ghatkopar', ll: [19.086, 72.908] },
  { name: 'Mulund', ll: [19.172, 72.956] },
  { name: 'Bandra', ll: [19.0596, 72.8295] },
  { name: 'BKC', ll: [19.066, 72.865] },
  { name: 'Kurla', ll: [19.07, 72.88] },
  { name: 'Chembur', ll: [19.062, 72.9] },
  { name: 'Dadar', ll: [19.02, 72.843] },
  { name: 'Worli', ll: [19.01, 72.818] },
  { name: 'Fort / CSMT', ll: [18.94, 72.835] },
  { name: 'Colaba', ll: [18.915, 72.826] },
].map(z => ({ ...z, w: toWorld(...z.ll) }));

// ---- tile cache
const tiles = new Map();
function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  let t = tiles.get(k);
  if (!t) {
    t = new Image();
    t.onerror = () => { t.failed = true; };
    t.src = TILE_URL(z, x, y);
    tiles.set(k, t);
  }
  return t;
}
const ready = t => t.complete && t.naturalWidth > 0;

// Draw the map for a view: world top-left (cx, cy), `scale` destination px per world unit.
function drawBasemap(g, cx, cy, w, h, scale) {
  const z = clamp(Math.round(WZ + Math.log2(scale)), 10, 18);
  const tws = 256 * 2 ** (WZ - z);           // tile size in world units
  const x0 = Math.floor(cx / tws), y0 = Math.floor(cy / tws);
  const x1 = Math.floor((cx + w / scale) / tws), y1 = Math.floor((cy + h / scale) / tws);
  const size = tws * scale;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const dx = Math.floor((tx * tws - cx) * scale), dy = Math.floor((ty * tws - cy) * scale);
    const ds = Math.ceil(size) + 1;
    const t = tile(z, tx, ty);
    if (ready(t)) { g.drawImage(t, dx, dy, ds, ds); continue; }
    // fall back to a loaded ancestor tile while this one loads
    for (let up = 1; up <= 4; up++) {
      const pz = z - up, f = 2 ** up, p = tiles.get(`${pz}/${Math.floor(tx / f)}/${Math.floor(ty / f)}`);
      if (p && ready(p)) {
        const sub = 256 / f;
        g.drawImage(p, (tx % f) * sub, (ty % f) * sub, sub, sub, dx, dy, ds, ds);
        break;
      }
    }
  }
}

// AQI at a world position: inverse-distance weighting over the real stations
function aqiAt(i, wx, wy) {
  let ws = 0, s = 0;
  for (const z of ZONES) {
    if (z.station === undefined) continue;
    const d2 = (z.w[0] - wx) ** 2 + (z.w[1] - wy) ** 2;
    if (d2 < 1) return stationAQI(z.station, i);
    const w = 1 / d2;
    ws += w; s += w * stationAQI(z.station, i);
  }
  return s / ws;
}
const dist2 = (z, wx, wy) => (z.w[0] - wx) ** 2 + (z.w[1] - wy) ** 2;
const nearestZone = (wx, wy, filter = () => true) =>
  ZONES.filter(filter).reduce((b, z) => (dist2(z, wx, wy) < dist2(b, wx, wy) ? z : b));
