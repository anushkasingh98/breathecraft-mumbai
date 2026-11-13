// Game loop, rendering and UI wiring.
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const off = document.createElement('canvas'), offCtx = off.getContext('2d'); // low-res map buffer
const SPRITE = 3;          // screen pixels per character pixel
const ZOOM_MIN = 11, ZOOM_MAX = 18;
let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener('resize', resize); resize();

// Latest day with any real station reading
let lastRealDay = NDAYS - 1;
while (lastRealDay > 0 && D.stations.every((_, s) => [...Array(24).keys()].every(h => isImputed(s, lastRealDay * 24 + h)))) lastRealDay--;

const startZone = ZONES.find(z => z.name === 'Bandra');
const S = {
  ch: null, day: lastRealDay - 1, hour: 9, f: null, f0: null,
  px: startZone.w[0], py: startZone.w[1], zoom: 15, pix: 2,
  moving: false, frame: 0, frameT: 0, aqi: 0, rec: 0, tier: -1, playing: null,
};
const hourIndex = () => S.day * 24 + S.hour;
const scale = () => 2 ** (S.zoom - WZ);   // screen px per world unit

// ---------- character select
const cards = $('cards');
CHARACTERS.forEach(ch => {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<canvas width="64" height="128"></canvas>
    <div class="cname">${ch.name}</div><div class="crole">${ch.role}</div>
    <div class="cdesc">${ch.desc}</div>
    <div class="csens">${ch.sens ? 'Sensitive: masks 50 AQI earlier' : 'Standard sensitivity'}</div>
    <div class="masks">${[0, 1, 2, 3].map(() => '<canvas width="64" height="72"></canvas>').join('')}</div>`;
  const cvs = el.querySelectorAll('canvas');
  drawCharacter(cvs[0].getContext('2d'), ch, 0, 0, 0, 8);
  [1, 2, 3, 4].forEach(k => drawPortrait(cvs[k].getContext('2d'), ch, k - 1, 0, 0, 2));
  el.onclick = () => {
    S.ch = ch;
    document.querySelectorAll('.card').forEach(c => c.classList.toggle('sel', c === el));
    $('startBtn').disabled = false;
    $('startBtn').textContent = `ENTER MUMBAI AS ${ch.name.toUpperCase()} ▶`;
  };
  cards.appendChild(el);
});
$('startBtn').onclick = () => {
  $('select').style.display = 'none';
  $('maskWho').textContent = `${S.ch.name.toUpperCase()}`;
  S.tier = -1;
};

// ---------- factors dropdown
const FACTORS = [
  { k: 'temp', label: '🌡 Temperature', unit: '°C', min: 10, max: 45, step: 0.5 },
  { k: 'precip', label: '🌧 Rainfall', unit: 'mm/day', min: 0, max: 150, step: 1 },
  { k: 'wind', label: '💨 Wind speed', unit: 'km/h', min: 0, max: 50, step: 1 },
  { k: 'humidity', label: '💧 Humidity', unit: '%', min: 10, max: 100, step: 1 },
  { k: 'traffic', label: '🚗 Traffic density', unit: '/100', min: 0, max: 100, step: 1 },
  { k: 'construction', label: '🏗 Construction', unit: '/100', min: 0, max: 100, step: 1 },
];
const fEls = {};
FACTORS.forEach(f => {
  const row = document.createElement('div');
  row.className = 'frow';
  row.innerHTML = `<div class="fhead"><span>${f.label}</span><span><b class="val"></b> <span class="rec"></span></span></div>
    <div class="fctl"><button class="btn minus">−</button><input type="range" min="${f.min}" max="${f.max}" step="${f.step}"><button class="btn plus">+</button></div>`;
  const input = row.querySelector('input');
  const set = v => { S.f[f.k] = clamp(+v, f.min, f.max); syncFactors(); };
  const stepBy = f.step * (f.step < 1 ? 2 : 1) * (f.max > 60 ? 5 : 1);
  input.oninput = () => set(input.value);
  input.onchange = () => input.blur();
  row.querySelector('.minus').onclick = () => set(S.f[f.k] - stepBy);
  row.querySelector('.plus').onclick = () => set(S.f[f.k] + stepBy);
  fEls[f.k] = { input, val: row.querySelector('.val'), rec: row.querySelector('.rec'), unit: f.unit };
  $('factorList').appendChild(row);
});
$('festival').onchange = e => { S.f.festival = e.target.checked; e.target.blur(); };
$('resetFactors').onclick = () => { S.f = { ...S.f0 }; syncFactors(); };
function syncFactors() {
  for (const k in fEls) {
    const e = fEls[k];
    e.input.value = S.f[k];
    e.val.textContent = `${S.f[k]} ${e.unit}`;
    e.rec.textContent = S.f[k] !== S.f0[k] ? `(rec ${S.f0[k]})` : '';
  }
  $('festival').checked = S.f.festival;
}

// ---------- time of day + date timeline
const hourEl = $('hour'), dayEl = $('day');
dayEl.max = NDAYS - 1;
const hourFromY = e => {
  const r = hourEl.getBoundingClientRect();
  return Math.round(clamp((e.clientY - r.top) / r.height, 0, 1) * 23);
};
hourEl.onpointerdown = e => { hourEl.setPointerCapture(e.pointerId); setTime(S.day, hourFromY(e)); };
hourEl.onpointermove = e => { if (hourEl.hasPointerCapture(e.pointerId)) setTime(S.day, hourFromY(e)); };
dayEl.oninput = () => setTime(+dayEl.value, S.hour);
dayEl.addEventListener('change', () => dayEl.blur());

function setTime(day, hour) {
  S.day = clamp(day, 0, NDAYS - 1); S.hour = (hour + 24) % 24;
  S.f0 = conditionsAt(hourIndex());
  S.f = { ...S.f0 };
  syncFactors();
  hourEl.querySelector('.vthumb').style.top = (S.hour / 23 * 100) + '%';
  hourEl.setAttribute('aria-valuenow', S.hour);
  dayEl.value = S.day;
  $('timeLabel').textContent = String(S.hour).padStart(2, '0') + ':00';
  $('timeIcon').textContent = S.hour >= 6 && S.hour < 18 ? (S.hour < 8 || S.hour > 16 ? '🌅' : '☀️') : '🌙';
  const dt = dayDate(S.day);
  const est = D.stations.every((_, s) => isImputed(s, hourIndex()));
  $('dateLabel').textContent = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    + (est ? '  · ESTIMATED' : '');
}

// Strip of daily city AQI behind the date slider
(function drawStrip() {
  const strip = $('strip');
  strip.width = NDAYS; strip.height = 1;
  const sctx = strip.getContext('2d');
  DAILY_AQI.forEach((a, d) => { sctx.fillStyle = category(a).color; sctx.fillRect(d, 0, 1, 1); });
  const months = $('months');
  for (let d = 0; d < NDAYS; d++) {
    const dt = dayDate(d);
    if (dt.getUTCDate() !== 1) continue;
    const s = document.createElement('span');
    s.style.left = (d / (NDAYS - 1) * 100) + '%';
    s.textContent = dt.getUTCMonth() === 0 || d === 0 ? dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    months.appendChild(s);
  }
  for (const d of [DIWALI_DAYS[1], DIWALI_DAYS[4]]) {
    const m = document.createElement('span');
    m.style.left = (d / (NDAYS - 1) * 100) + '%';
    m.textContent = '🎆'; m.title = 'Diwali';
    $('markers').appendChild(m);
  }
  $('legend').innerHTML = CATS.map(c => `<span style="--c:${c.color}">${c.name}</span>`).join('');
})();

$('play').onclick = () => {
  if (S.playing) { clearInterval(S.playing); S.playing = null; $('play').textContent = '▶ PLAY'; return; }
  if (S.day >= NDAYS - 1) setTime(0, S.hour);
  $('play').textContent = '❚❚ PAUSE';
  S.playing = setInterval(() => {
    if (S.day >= NDAYS - 1) return $('play').onclick();
    setTime(S.day + 1, S.hour);
  }, 120);
};

// ---------- zoom
function setZoom(z) {
  S.zoom = clamp(Math.round(z * 4) / 4, ZOOM_MIN, ZOOM_MAX);
  $('zoomLvl').textContent = S.zoom.toFixed(S.zoom % 1 ? 1 : 0);
}
$('zoomIn').onclick = () => setZoom(S.zoom + 1);
$('zoomOut').onclick = () => setZoom(S.zoom - 1);
$('pixBtn').onclick = () => { S.pix = S.pix % 3 + 1; };
canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(S.zoom - Math.sign(e.deltaY) * 0.25); }, { passive: false });

// ---------- input
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
  keys.add(e.key.toLowerCase());
  if (e.key === '[') setTime(S.day - 1, S.hour);
  if (e.key === ']') setTime(S.day + 1, S.hour);
  if (e.key === 'q' || e.key === 'Q') setTime(S.day, S.hour - 1);
  if (e.key === 'e' || e.key === 'E') setTime(S.day, S.hour + 1);
  if (e.key === '+' || e.key === '=') setZoom(S.zoom + 1);
  if (e.key === '-' || e.key === '_') setZoom(S.zoom - 1);
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function update(dt) {
  if (!S.ch) return;
  let vx = 0, vy = 0;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;
  S.moving = vx || vy;
  if (S.moving) {
    // constant on-screen speed, so zooming out lets you cross the city faster
    const len = Math.hypot(vx, vy), sp = (keys.has('shift') ? 420 : 200) * dt / scale();
    S.px = clamp(S.px + vx / len * sp, WMIN_X, WMAX_X);
    S.py = clamp(S.py + vy / len * sp, WMIN_Y, WMAX_Y);
    S.frameT += dt;
    if (S.frameT > 0.15) { S.frameT = 0; S.frame ^= 1; }
  } else S.frame = 0;
}

// ---------- rendering
const particles = Array.from({ length: 450 }, () => ({ x: Math.random(), y: Math.random(), s: 2 + Math.random() * 4, v: 0.5 + Math.random() }));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const lungLevel = aqi => clamp(1 - aqi / 500, 0.03, 1);

function darkness(h) {
  const sun = Math.sin((h - 6) / 12 * Math.PI);
  return clamp(0.62 - sun * 1.4, 0, 0.62);
}

function draw(t) {
  const i = hourIndex();
  S.rec = aqiAt(i, S.px, S.py);
  S.aqi = predictAQI(S.rec, S.f, S.f0);

  const sc = scale();
  const cx = S.px - W / 2 / sc, cy = S.py - H / 2 / sc;
  const toScreen = (wx, wy) => [(wx - cx) * sc, (wy - cy) * sc];

  // basemap: render at 1/pix resolution, then blow up without smoothing for the blocky look
  const ow = Math.ceil(W / S.pix), oh = Math.ceil(H / S.pix);
  if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
  offCtx.imageSmoothingEnabled = S.pix === 1;
  offCtx.fillStyle = '#aad3df'; offCtx.fillRect(0, 0, ow, oh);
  drawBasemap(offCtx, cx, cy, ow, oh, sc / S.pix);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, ow * S.pix, oh * S.pix);

  // neighbourhood monitors
  const compact = S.zoom < 13;
  ctx.font = '20px VT323, monospace';
  ctx.textAlign = 'center';
  for (const z of ZONES) {
    const [sx, sy] = toScreen(...z.w);
    if (sx < -150 || sy < -150 || sx > W + 150 || sy > H + 150) continue;
    const za = Math.round(predictAQI(z.station !== undefined ? stationAQI(z.station, i) : aqiAt(i, ...z.w), S.f, S.f0));
    const col = category(za).color;
    if (compact) {
      ctx.fillStyle = '#000'; ctx.fillRect(sx - 20, sy - 12, 40, 24);
      ctx.fillStyle = col; ctx.fillRect(sx - 17, sy - 9, 34, 18);
      ctx.fillStyle = za > 100 && za <= 300 ? '#000' : '#fff'; ctx.fillText(za, sx, sy + 6);
      continue;
    }
    ctx.fillStyle = '#333'; ctx.fillRect(sx - 3, sy - 44, 6, 44);
    ctx.fillStyle = '#000'; ctx.fillRect(sx - 11, sy - 62, 22, 20);
    ctx.fillStyle = col; ctx.fillRect(sx - 8, sy - 59, 16, 14);
    const label = `${z.name}${z.station !== undefined ? ' 📡' : ''}  AQI ${za}`;
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(sx - tw / 2, sy - 92, tw, 24);
    ctx.fillStyle = col; ctx.fillRect(sx - tw / 2, sy - 70, tw, 3);
    ctx.fillStyle = '#fff'; ctx.fillText(label, sx, sy - 74);
  }

  // player + mini oxygen tank
  const tier = maskTier(S.aqi, S.ch || CHARACTERS[0]);
  if (S.ch) {
    const [sx, sy] = toScreen(S.px, S.py);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx - 14, sy - 4, 28, 7);
    drawCharacter(ctx, S.ch, tier, sx - 12, sy - 16 * SPRITE, SPRITE, S.moving ? S.frame : 0);
    drawTank(ctx, sx + 18, sy - 44, 12, 40, lungLevel(S.aqi), category(S.aqi).color);
  }

  // night, with a pool of light around the player
  const dk = darkness(S.hour);
  if (dk > 0) {
    const [px, py] = toScreen(S.px, S.py);
    const g = ctx.createRadialGradient(px, py - 20, 40, px, py - 20, 300);
    g.addColorStop(0, `rgba(10,14,40,${dk * 0.25})`);
    g.addColorStop(1, `rgba(10,14,40,${dk})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // haze + smog particles
  const sev = clamp((S.aqi - 50) / 400, 0, 1);
  if (sev > 0) {
    const [r, g, b] = mix([185, 195, 205], [150, 105, 55], sev);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.08 + sev * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  const n = Math.floor(particles.length * clamp((S.aqi - 80) / 380, 0, 1));
  const drift = 0.00002 * (8 + S.f.wind * 3);
  ctx.fillStyle = 'rgba(90,75,55,.55)';
  for (let k = 0; k < n; k++) {
    const p = particles[k];
    p.x = (p.x + drift * p.v * 16) % 1;
    p.y = (p.y + Math.sin(t / 900 + k) * 0.0003 + 1) % 1;
    ctx.fillRect(p.x * W, p.y * H, p.s, p.s);
  }

  // rain
  if (S.f.precip > 2) {
    ctx.strokeStyle = 'rgba(170,200,255,.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    const count = Math.min(400, S.f.precip * 5);
    for (let k = 0; k < count; k++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16);
    }
    ctx.stroke();
  }

  // severe vignette
  if (S.aqi > 300) {
    const v = clamp((S.aqi - 300) / 200, 0, 1);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(60,20,0,0)');
    g.addColorStop(1, `rgba(60,20,0,${0.35 + v * 0.45})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- panels (throttled)
const maskCtx = $('maskCanvas').getContext('2d');
const tankCtx = $('tankCanvas').getContext('2d');
$('maskScale').innerHTML = MASKS.map((_, k) => `<div title="${MASKS[k].name}" style="background:${['#00b050', '#f4d600', '#ff9900', '#a00000'][k]}"></div>`).join('');
let lastUI = 0;
function updateUI() {
  const i = hourIndex();
  const zone = nearestZone(S.px, S.py);
  const near = nearestZone(S.px, S.py, z => z.station !== undefined);
  const aqi = Math.round(S.aqi), cat = category(aqi);
  $('hudPlace').textContent = '📍 ' + zone.name;
  $('hudAqiNum').textContent = 'AQI ' + aqi;
  $('hudAqiCat').textContent = cat.name;
  $('hudAqiCat').style.background = cat.color;
  $('hudSub').textContent = `Recorded here: ${Math.round(S.rec)} · PM2.5-based · nearest sensor ${near.name}${isImputed(near.station, i) ? ' (gap, estimated)' : ''}`;

  const d = aqi - Math.round(S.rec);
  $('predVal').textContent = aqi;
  $('predVal').style.color = cat.color;
  $('predCat').textContent = cat.name;
  $('predCat').style.background = cat.color;
  $('predDelta').textContent = d === 0 ? 'Matches recorded. Tweak factors ⚙' : `${d > 0 ? '▲ +' : '▼ '}${d} vs recorded (${Math.round(S.rec)})`;

  // oxygen tank: share of "clean air" left for the lungs, plus the cigarette equivalent (22 µg/m³ PM2.5 ≈ 1/day)
  const lvl = lungLevel(S.aqi);
  tankCtx.clearRect(0, 0, 44, 216);
  drawTank(tankCtx, 6, 0, 32, 216, lvl, cat.color);
  $('tankPct').textContent = Math.round(lvl * 100) + '% O₂';
  const cigs = aqiToPM(S.aqi) / 22;
  $('lungLine').textContent = `🫁 Lungs: like smoking ${cigs < 1 ? cigs.toFixed(1) : Math.round(cigs)} cigarette${cigs >= 0.95 && cigs < 1.5 ? '' : 's'}/day`;

  if (S.ch) {
    const tier = maskTier(S.aqi, S.ch);
    if (tier !== S.tier) {
      S.tier = tier;
      maskCtx.clearRect(0, 0, 192, 216);
      drawPortrait(maskCtx, S.ch, tier, 0, 0, 6);
      $('maskName').textContent = MASKS[tier].name.toUpperCase();
      $('maskAdvice').textContent = MASKS[tier].advice;
      [...$('maskScale').children].forEach((c, k) => c.classList.toggle('on', k === tier));
    }
  }
}

function loop(t) {
  const dt = Math.min(0.05, (t - (loop.last || t)) / 1000);
  loop.last = t;
  update(dt);
  draw(t);
  if (t - lastUI > 100) { lastUI = t; updateUI(); }
  requestAnimationFrame(loop);
}
setTime(S.day, S.hour);
setZoom(S.zoom);
// Demo shortcuts: ?char=0..2 skips the select screen, &day=N&hour=H jumps in time, &zoom=Z
const qs = new URLSearchParams(location.search);
if (qs.has('char')) { document.querySelectorAll('.card')[+qs.get('char')]?.click(); $('startBtn').click(); }
if (qs.has('day') || qs.has('hour')) setTime(+(qs.get('day') ?? S.day), +(qs.get('hour') ?? S.hour));
if (qs.has('zoom')) setZoom(+qs.get('zoom'));
requestAnimationFrame(loop);
