// Blocky 8x16 characters and the mask overlays.
// extra: outfit detail ('tie' | 'bag' | 'band'); longHair, bindi, clip, mustache: face/hair details.
const CHARACTERS = [
  { id: 'sandhya', name: 'Sandhya', role: 'Marine Drive jogger', sens: 50, extra: 'band', longHair: true, bindi: true,
    hair: '#1f1410', skin: '#c68642', shirt: '#8e3b8a', pants: '#2d2d3a', shoes: '#f2f2f2',
    desc: 'Runs 5 km along the Queen\'s Necklace every morning. Heavy breathing means more exposure.' },
  { id: 'anushka', name: 'Anushka', role: 'School girl', sens: 50, extra: 'bag', longHair: true, clip: true,
    hair: '#1a1110', skin: '#d19a6a', shirt: '#f2f2f2', pants: '#1f3c88', shoes: '#5a3a1a',
    desc: 'Walks to school in Dadar. Kids breathe faster, so masks kick in earlier.' },
  { id: 'himank', name: 'Himank', role: 'School boy', sens: 50, extra: 'bag',
    hair: '#2b1d14', skin: '#b97a48', shirt: '#7fb3e0', pants: '#8a7650', shoes: '#1a1a1a',
    desc: 'Plays gully cricket in Bandra after school. Kids breathe faster, so masks kick in earlier.' },
  { id: 'dheeraj', name: 'Dheeraj', role: 'Local-train commuter', sens: 0, extra: 'tie', mustache: true,
    hair: '#2b1d14', skin: '#a86b3c', shirt: '#3a6ea5', pants: '#2d2d3a', shoes: '#1a1a1a',
    desc: 'Rides the Western line to Churchgate every day. Average sensitivity.' },
];

const MASKS = [
  { name: 'No mask', advice: 'Air is fine. Enjoy the outdoors!' },
  { name: 'Cloth / surgical mask', advice: 'Sensitive people should cut down long outdoor exertion.' },
  { name: 'N95 respirator', advice: 'Wear an N95 outdoors. Avoid heavy exercise outside.' },
  { name: 'Gas mask (respirator)', advice: 'Hazardous air. Stay indoors, run a purifier, seal windows.' },
];
// Mask tier for an AQI; sensitive characters move up a tier 50 points earlier.
function maskTier(aqi, ch) {
  const a = aqi + ch.sens;
  return a <= 100 ? 0 : a <= 200 ? 1 : a <= 300 ? 2 : 3;
}

// 32x36 close-up portrait (fine pixels) so the masks read clearly.
// Shapes are rasterised onto the grid: each cell is filled when its centre is inside the shape.
function drawPortrait(ctx, ch, tier, x, y, s) {
  const fill = (test, col) => {
    ctx.fillStyle = col;
    for (let cy = 0; cy < 36; cy++) for (let cx = 0; cx < 32; cx++)
      if (test(cx + 0.5, cy + 0.5)) ctx.fillRect(x + cx * s, y + cy * s, s, s);
  };
  const ell = (ex, ey, rx, ry) => (px, py) => ((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 <= 1;
  const rect = (x0, y0, x1, y1) => (px, py) => px >= x0 && px < x1 + 1 && py >= y0 && py < y1 + 1;
  const and = (...f) => (px, py) => f.every(g => g(px, py));
  const not = f => (px, py) => !f(px, py);
  const shade = '#00000026';

  // hair behind (long hair), shirt, neck, ears, face
  if (ch.longHair) fill(and(ell(16, 18, 12.5, 15), (px, py) => py >= 8), ch.hair);
  fill((px, py) => py >= 30 && Math.abs(px - 16) <= 9 + (py - 30) * 1.5, ch.shirt);
  fill(rect(13, 25, 18, 31), ch.skin);
  fill(rect(13, 26, 18, 27), shade);
  fill(ell(5.8, 17, 2, 3), ch.skin); fill(ell(26.2, 17, 2, 3), ch.skin);
  fill(ell(16, 16, 10, 12.5), ch.skin);
  // hair cap
  fill(and(ell(16, 13, 11, 10.5), (px, py) => py < 8.5 || (py < 12 && Math.abs(px - 16) > 8)), ch.hair);
  if (ch.extra === 'band') fill(and(ell(16, 13, 11.2, 10.7), rect(0, 8, 31, 9)), '#d62828');
  // face details
  fill(rect(9, 11, 13, 11), ch.hair); fill(rect(18, 11, 22, 11), ch.hair);
  fill(rect(9, 13, 13, 14), '#ffffff'); fill(rect(18, 13, 22, 14), '#ffffff');
  fill(rect(11, 13, 12, 14), '#2a2a5a'); fill(rect(19, 13, 20, 14), '#2a2a5a');
  fill(rect(11, 13, 11, 13), '#ffffff'); fill(rect(19, 13, 19, 13), '#ffffff');
  fill(rect(15, 16, 16, 19), shade);
  fill(rect(14, 19, 14, 19), '#00000040'); fill(rect(17, 19, 17, 19), '#00000040');
  fill(rect(13, 22, 18, 22), '#8a3f2c'); fill(rect(14, 23, 17, 23), '#b5563c');
  if (ch.mustache) fill(rect(12, 20, 19, 21), ch.hair);
  if (ch.bindi) fill(rect(15, 9, 16, 10), '#c8102e');
  if (ch.clip) { fill(ell(23, 6, 2.2, 1.6), '#ff5fa2'); fill(ell(23, 6, 0.8, 0.8), '#ffd1e6'); }
  // outfit details
  if (ch.extra === 'tie') { fill(rect(12, 30, 13, 31), '#ffffff'); fill(rect(18, 30, 19, 31), '#ffffff'); fill(rect(15, 31, 16, 35), '#a0202a'); }
  if (ch.extra === 'bag') { fill(rect(8, 31, 9, 35), '#7a4a1a'); fill(rect(22, 31, 23, 35), '#7a4a1a'); }
  if (ch.extra === 'band') { fill(rect(12, 32, 19, 35), '#ffffff'); fill(rect(15, 33, 16, 34), '#222222'); }

  if (tier === 1) {            // surgical mask: pleats, nose wire, ear loops
    const m = and(ell(16, 16, 10.6, 12.5), rect(5, 17, 26, 27));
    fill(m, '#a8d8ea');
    fill(and(m, rect(0, 17, 31, 17)), '#e8f6fb');
    fill(and(m, rect(0, 20, 31, 20)), '#7fbcd2'); fill(and(m, rect(0, 23, 31, 23)), '#7fbcd2');
    for (const ex of [5.8, 26.2]) fill(and(ell(ex, 18.5, 2.6, 4.5), not(ell(ex, 18.5, 1.6, 3.5))), '#ffffff');
  } else if (tier === 2) {     // N95: cup, nose clip, valve, straps
    const cup = ell(16, 21.5, 8.5, 6.5);
    fill(and(ell(16, 13, 11.2, 10.7), rect(0, 9, 31, 9)), '#f5a623');
    fill(rect(6, 10, 6, 21), '#f5a623'); fill(rect(25, 10, 25, 21), '#f5a623');
    fill(cup, '#f4f4f4');
    fill(and(cup, not(ell(16, 20.8, 8, 5.8))), '#cfcfcf');
    fill(and(cup, rect(12, 16, 19, 16)), '#9a9a9a');
    fill(ell(20, 23, 2.2, 2.2), '#2f6fd0'); fill(ell(20, 23, 1, 1), '#1d4f9a');
  } else if (tier === 3) {     // gas mask: full face, goggles, snout, twin filters
    fill(and(ell(16, 16.5, 10.8, 12.8), (px, py) => py >= 6), '#4a5a3a');
    fill(and(ell(16, 13, 11.5, 11), rect(0, 5, 31, 6)), '#1c1c1c');
    for (const gx of [11, 21]) {
      fill(ell(gx, 14, 3.8, 3.8), '#1c1c1c');
      fill(ell(gx, 14, 2.6, 2.6), '#7fe0ff');
      fill(ell(gx - 1, 13, 0.9, 0.9), '#ffffff');
    }
    fill(rect(10, 25, 12, 26), '#2b2b2b'); fill(rect(20, 25, 22, 26), '#2b2b2b');
    fill(ell(16, 23.5, 4, 4.5), '#2b2b2b');
    fill(rect(14, 23, 18, 23), '#6a6a6a'); fill(rect(14, 25, 18, 25), '#6a6a6a');
    for (const fx of [7, 25]) {
      fill(ell(fx, 26, 3.6, 3.6), '#3a3a3a');
      fill(ell(fx, 26, 2.6, 2.6), '#8a8a8a');
      fill(ell(fx, 26, 1.2, 1.2), '#5a5a5a');
    }
  }
}

// Oxygen tank gauge: `level` 0..1 of clean air left for the lungs.
function drawTank(ctx, x, y, w, h, level, color) {
  const r = Math.round(w / 2);
  ctx.fillStyle = '#444'; ctx.fillRect(x + w / 2 - 4, y, 8, 8);           // valve
  ctx.fillStyle = '#222'; ctx.fillRect(x + w / 2 - 9, y + 6, 18, 6);
  const by = y + 12, bh = h - 12;
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.roundRect(x - 2, by - 2, w + 4, bh + 4, r); ctx.fill();
  ctx.fillStyle = '#2c3138';
  ctx.beginPath(); ctx.roundRect(x, by, w, bh, r); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, by, w, bh, r); ctx.clip();
  const fh = Math.round(bh * clamp(level, 0, 1));
  ctx.fillStyle = color; ctx.fillRect(x, by + bh - fh, w, fh);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 3, by, 3, bh); // shine
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  for (let k = 1; k < 5; k++) ctx.fillRect(x, by + bh * k / 5, w * 0.35, 2);  // ticks
  ctx.restore();
}

function drawCharacter(ctx, ch, tier, x, y, s, frame = 0) {
  const p = (cx, cy, col) => { ctx.fillStyle = col; ctx.fillRect(x + cx * s, y + cy * s, s, s); };
  const row = (cy, x0, x1, col) => { for (let cx = x0; cx <= x1; cx++) p(cx, cy, col); };
  // head
  row(0, 0, 7, ch.hair); row(1, 0, 7, ch.hair);
  for (let cy = 2; cy <= 7; cy++) row(cy, 0, 7, ch.skin);
  p(0, 2, ch.hair); p(7, 2, ch.hair); p(1, 2, ch.hair); p(6, 2, ch.hair);
  if (ch.longHair) for (let cy = 2; cy <= 6; cy++) { p(0, cy, ch.hair); p(7, cy, ch.hair); }
  if (ch.extra === 'band') row(2, 0, 7, '#d62828');
  p(1, 4, '#ffffff'); p(2, 4, '#2a2a5a'); p(5, 4, '#2a2a5a'); p(6, 4, '#ffffff');
  p(3, 5, '#00000022'); p(4, 5, '#00000022');
  row(6, 2, 5, '#7a3b2a');
  // body
  for (let cy = 8; cy <= 12; cy++) row(cy, 1, 6, ch.shirt);
  for (const ax of [0, 7]) { p(ax, 8, ch.shirt); p(ax, 9, ch.shirt); for (let cy = 10; cy <= 12; cy++) p(ax, cy, ch.skin); }
  if (ch.extra === 'tie') { p(3, 8, '#ffffff'); p(4, 8, '#ffffff'); for (let cy = 9; cy <= 11; cy++) p(3, cy, '#a0202a'); }
  if (ch.extra === 'bag') for (let cy = 8; cy <= 12; cy++) { p(1, cy, '#7a4a1a'); p(6, cy, '#7a4a1a'); }
  if (ch.extra === 'band') { row(10, 2, 5, '#ffffff'); p(3, 10, '#222'); p(4, 10, '#222'); }
  // legs (frame 1 lifts the left leg)
  const lift = frame ? 1 : 0;
  for (let cy = 13; cy <= 14 - lift; cy++) row(cy, 1, 3, ch.pants);
  row(15 - lift, 1, 3, ch.shoes);
  for (let cy = 13; cy <= 14; cy++) row(cy, 4, 6, ch.pants);
  row(15, 4, 6, ch.shoes);

  // masks
  if (tier === 1) {
    for (let cy = 5; cy <= 7; cy++) row(cy, 1, 6, '#9fd3e6');
    row(6, 1, 6, '#c4e6f2');
    p(0, 5, '#ffffff'); p(7, 5, '#ffffff');
  } else if (tier === 2) {
    row(5, 2, 5, '#e2e2e2');
    for (let cy = 6; cy <= 7; cy++) row(cy, 1, 6, '#f6f6f6');
    p(4, 6, '#8899aa');
    p(0, 4, '#dddddd'); p(7, 4, '#dddddd');
  } else if (tier === 3) {
    row(2, 0, 7, '#222222');
    for (let cy = 3; cy <= 7; cy++) row(cy, 0, 7, '#3a3f3a');
    for (const ex of [1, 2, 5, 6]) { p(ex, 3, '#7fe0ff'); p(ex, 4, '#4fb8e0'); }
    for (let cy = 6; cy <= 8; cy++) row(cy, 2, 5, '#262626');
    p(3, 7, '#777777'); p(4, 7, '#777777');
  }
}
