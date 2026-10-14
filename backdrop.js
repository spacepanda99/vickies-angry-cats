'use strict';
// The room behind the action, in the soft washed-out style of Angry Birds backgrounds but indoors.
// Three layers: far wall + windows (scrolls slowest), hazy furniture (middle), and the floor the game sits on.
// Each layer is painted once to an offscreen canvas; drawBackdrop() places them with horizontal parallax.
// Uses GROUND, WORLD_W and hash() from game.js (only called after game.js has loaded).

const BACKDROP = { top: -400, bottom: 1000, far: null, mid: null, front: null };
const FAR_P = 0.3, MID_P = 0.6;            // how much of the camera movement each layer follows

function makeLayer(w, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round((BACKDROP.bottom - BACKDROP.top) * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale); g.translate(0, -BACKDROP.top);   // draw in world y coordinates
  return { c, g, w, scale };
}
function haze(L, color) {
  // wash the whole layer toward the room's air colour, like distant scenery in Angry Birds
  const g = L.g;
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color;
  g.fillRect(0, BACKDROP.top, L.w, BACKDROP.bottom - BACKDROP.top); g.restore();
}
// Time of day, 0 = high noon (level 1) to 1 = sunset (level 14). Each palette is a few keyframes.
function hexMix(a, c, k) {
  const pa = parseInt(a.slice(1), 16), pc = parseInt(c.slice(1), 16), ch = (v, s) => (v >> s) & 255;
  const m = s => Math.round(ch(pa, s) + (ch(pc, s) - ch(pa, s)) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
function keyed(stops, t) {
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; return hexMix(c0, c1, (t - t0) / (t1 - t0)); }
  return stops[stops.length - 1][1];
}
const TOD = {
  skyTop:    [[0, '#7fd0f5'], [0.5, '#8cc4ec'], [0.8, '#7f9ad6'], [1, '#5560b0']],
  skyLow:    [[0, '#e2f6fb'], [0.5, '#fbeac6'], [0.8, '#ffc28c'], [1, '#ff9a62']],
  sun:       [[0, '#fff8cc'], [0.5, '#ffe58a'], [0.8, '#ffb35c'], [1, '#ff7a45']],
  cloud:     [[0, '#ffffff'], [0.6, '#fff2dc'], [1, '#ffc6b8']],
  hill:      [[0, '#b7e4cc'], [0.6, '#a9cfae'], [1, '#6f7f86']],
  hillDark:  [[0, '#8fd0ad'], [0.6, '#86b893'], [1, '#55636e']],
  palm:      [[0, '#7cc49d'], [0.6, '#79ad86'], [1, '#4b5864']],
  beam:      [[0, '#fffce1'], [0.6, '#ffefc0'], [1, '#ffb27a']],
  haze:      [[0, '#e8f6f2'], [0.6, '#f6eedd'], [1, '#ffd4b8']],
};
function blob(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function cloud(g, x, y, s) { for (const [dx, dy, r] of [[0, 0, 22], [24, -10, 26], [52, 0, 20], [26, 8, 22]]) blob(g, x + dx * s, y + dy * s, r * s); }
function palm(g, x, base, h, color) {
  g.strokeStyle = color; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + 10, base - h / 2, x + 4, base - h); g.stroke();
  g.lineWidth = 9;
  for (const a of [-2.7, -2.2, -1.6, -1.0, -0.45]) {
    g.beginPath(); g.moveTo(x + 4, base - h);
    g.quadraticCurveTo(x + 4 + Math.cos(a) * 30, base - h + Math.sin(a) * 30 - 6, x + 4 + Math.cos(a) * 52, base - h + Math.sin(a) * 30 + 16);
    g.stroke();
  }
}

function buildFar(tod = 0) {
  const L = makeLayer(1800, 1), g = L.g, W = L.w;
  // wall
  let gr = g.createLinearGradient(0, BACKDROP.top, 0, GROUND);
  gr.addColorStop(0, '#e4f4ef'); gr.addColorStop(1, '#c4e4dd');
  g.fillStyle = gr; g.fillRect(0, BACKDROP.top, W, GROUND - BACKDROP.top);
  // ceiling + crown molding
  g.fillStyle = '#f2faf7'; g.fillRect(0, BACKDROP.top, W, 150);
  g.fillStyle = '#d9ece7'; g.fillRect(0, BACKDROP.top + 150, W, 14);
  // wallpaper: faint stripes and little diamonds
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (let x = 0; x < W; x += 70) g.fillRect(x, BACKDROP.top + 164, 30, GROUND - BACKDROP.top);
  g.fillStyle = 'rgba(120,180,170,0.18)';
  for (let x = 35; x < W; x += 70) for (let y = -200; y < 560; y += 70) {
    g.beginPath(); g.moveTo(x + 50, y); g.lineTo(x + 56, y + 7); g.lineTo(x + 50, y + 14); g.lineTo(x + 44, y + 7); g.closePath(); g.fill();
  }
  // wainscoting
  g.fillStyle = '#acd6ce'; g.fillRect(0, 580, W, GROUND - 580);
  g.fillStyle = '#eef8f5'; g.fillRect(0, 572, W, 12);
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3;
  for (let x = 20; x < W; x += 150) g.strokeRect(x, 605, 120, 180);

  // big windows looking out on a sunny garden (a nod to the outdoor Angry Birds scenery)
  for (const wx of [230, 1060]) {
    const wy = 110, ww = 420, wh = 400;
    gr = g.createLinearGradient(0, wy, 0, wy + wh);
    gr.addColorStop(0, keyed(TOD.skyTop, tod)); gr.addColorStop(1, keyed(TOD.skyLow, tod));
    g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    // the sun: high in the left window at noon, sinking toward the hills by sunset (behind them at the very end)
    if (wx === 230) {
      const sx = wx + 130 - tod * 30, sy = wy + 200 + tod * 78, sr = 34 + tod * 10, sc = keyed(TOD.sun, tod);   // y range is the part of the window you can see in play
      g.save(); g.beginPath(); g.rect(wx, wy, ww, wh); g.clip();
      const sg = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * (3 + tod * 2));
      sg.addColorStop(0, sc + 'cc'); sg.addColorStop(1, sc + '00');
      g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr * (3 + tod * 2), 0, 7); g.fill();
      g.fillStyle = sc; g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
      g.restore();
    }
    g.fillStyle = keyed(TOD.cloud, tod); g.globalAlpha = 0.95;
    cloud(g, wx + 70, wy + 80, 1.1); cloud(g, wx + 260, wy + 50, 0.8); cloud(g, wx + 300, wy + 150, 0.6);
    g.globalAlpha = 1;
    g.fillStyle = keyed(TOD.hill, tod);
    g.beginPath(); g.moveTo(wx, wy + wh);
    for (let x = 0; x <= ww; x += 20) g.lineTo(wx + x, wy + wh - 120 - Math.sin(x / 60 + wx) * 30);
    g.lineTo(wx + ww, wy + wh); g.closePath(); g.fill();
    g.fillStyle = keyed(TOD.hillDark, tod);
    for (const [dx, r] of [[60, 46], [130, 34], [330, 52], [390, 30]]) blob(g, wx + dx, wy + wh - 70, r);
    palm(g, wx + 210, wy + wh - 20, 170, keyed(TOD.palm, tod));
    palm(g, wx + 280, wy + wh - 10, 120, hexMix(keyed(TOD.palm, tod), '#ffffff', 0.08));
    g.fillStyle = keyed(TOD.hill, tod); g.fillRect(wx, wy + wh - 40, ww, 40);
    // frame, bars, sill
    g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.strokeRect(wx, wy, ww, wh);
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh * 0.45); g.lineTo(wx + ww, wy + wh * 0.45); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(wx - 26, wy + wh + 6, ww + 52, 16);
    // curtains tied back
    g.fillStyle = '#f5b8a6';
    for (const [x0, dir] of [[wx - 70, 1], [wx + ww + 70, -1]]) {
      g.beginPath(); g.moveTo(x0, wy - 50); g.lineTo(x0 + dir * 90, wy - 50);
      g.quadraticCurveTo(x0 + dir * 30, wy + 220, x0 + dir * 60, wy + wh + 120);
      g.lineTo(x0, wy + wh + 120); g.closePath(); g.fill();
      g.fillStyle = '#e99e8b'; g.fillRect(Math.min(x0, x0 + dir * 50), wy + 230, 50, 12); g.fillStyle = '#f5b8a6';
    }
    g.fillStyle = '#e3c58f'; g.fillRect(wx - 100, wy - 60, ww + 200, 10);
    // soft sunbeams falling into the room
    g.fillStyle = keyed(TOD.beam, tod); g.globalAlpha = 0.18 + tod * 0.08;
    const reach = 260 + tod * 380;
    g.beginPath(); g.moveTo(wx + 20, wy + 20); g.lineTo(wx + ww - 20, wy + 20); g.lineTo(wx + ww + reach, GROUND); g.lineTo(wx + 160 + tod * 260, GROUND); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  // a couple of pastel pictures between the windows
  const pic = (x, y, w, h, sky, hill) => {
    g.fillStyle = '#f7efe1'; g.fillRect(x, y, w, h);
    g.fillStyle = sky; g.fillRect(x + 10, y + 10, w - 20, h - 20);
    g.fillStyle = hill; g.beginPath(); g.ellipse(x + w / 2, y + h - 10, w * 0.45, h * 0.3, 0, Math.PI, 0); g.fill();
  };
  pic(735, 200, 150, 120, '#ffe2c4', '#f6b48f');
  pic(760, 360, 100, 80, '#d9e8ff', '#a9c4f0');
  pic(1580, 230, 140, 170, '#ffeec9', '#a8d9a0');
  const hz = parseInt(keyed(TOD.haze, tod).slice(1), 16);
  haze(L, `rgba(${hz >> 16},${(hz >> 8) & 255},${hz & 255},0.35)`);
  return L;
}

function buildMid() {
  const L = makeLayer(2200, 1.25), g = L.g;
  const F = GROUND;
  // bookshelf
  g.fillStyle = '#c99f77'; g.fillRect(40, 440, 230, F - 440);
  g.fillStyle = '#b88c63';
  for (let i = 0; i < 4; i++) g.fillRect(52, 455 + i * 92, 206, 80);
  const bookColors = ['#f29e8e', '#8ec9e6', '#f6d27a', '#9fd3a8', '#c7a6e6', '#f7b7c8'];
  for (let i = 0; i < 4; i++) {
    let x = 58;
    for (let k = 0; x < 245; k++) {
      const w = 12 + hash(i * 31 + k) * 14, h = 50 + hash(i * 17 + k) * 22;
      g.fillStyle = bookColors[(i * 3 + k) % bookColors.length];
      g.fillRect(x, 455 + i * 92 + 80 - h, w, h); x += w + 3;
    }
  }
  // floor lamp
  g.fillStyle = '#9aa6a4'; g.fillRect(372, 520, 8, F - 520); g.fillRect(350, F - 10, 52, 10);
  g.fillStyle = '#ffe3a6'; g.beginPath(); g.moveTo(330, 525); g.lineTo(422, 525); g.lineTo(404, 450); g.lineTo(348, 450); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,240,190,0.25)'; g.beginPath(); g.ellipse(376, 560, 90, 50, 0, 0, 7); g.fill();
  // couch
  g.fillStyle = '#7fbcb2'; g.fillRect(500, 610, 420, 110);
  g.fillStyle = '#93cbc1';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect ? g.roundRect(515 + i * 132, 622, 124, 80, 16) : g.rect(515 + i * 132, 622, 124, 80); g.fill(); }
  g.fillStyle = '#6aa99f'; g.fillRect(490, 700, 440, 70);
  g.fillStyle = '#7fbcb2'; g.fillRect(470, 650, 50, 120); g.fillRect(910, 650, 50, 120);
  g.fillStyle = '#5e8f87'; g.fillRect(500, 770, 14, F - 770); g.fillRect(916, 770, 14, F - 770);
  g.fillStyle = '#f6d27a'; g.beginPath(); g.ellipse(560, 690, 34, 26, -0.3, 0, 7); g.fill();
  // potted palm (a little indoor tropical moment)
  g.fillStyle = '#e59d7f'; g.beginPath(); g.moveTo(1000, 730); g.lineTo(1080, 730); g.lineTo(1068, F); g.lineTo(1012, F); g.closePath(); g.fill();
  palm(g, 1036, 735, 210, '#72b98f');
  palm(g, 1046, 735, 150, '#82c69d');
  // cat tree
  g.fillStyle = '#e2cfae';
  g.fillRect(1205, 470, 26, F - 470); g.fillRect(1290, 600, 26, F - 600);
  g.fillStyle = '#b9a2d6';
  g.fillRect(1160, 455, 120, 22); g.fillRect(1250, 585, 110, 22); g.fillRect(1150, F - 26, 230, 26);
  g.beginPath(); g.ellipse(1220, 440, 52, 20, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#f29e8e'; blob(g, 1340, 640, 10);
  // armchair
  g.fillStyle = '#f2c48f'; g.fillRect(1440, 630, 200, 90);
  g.fillStyle = '#e6b27a'; g.fillRect(1420, 690, 240, 70); g.fillRect(1410, 660, 40, 110); g.fillRect(1630, 660, 40, 110);
  g.fillStyle = '#c49364'; g.fillRect(1440, 770, 12, F - 770); g.fillRect(1628, 770, 12, F - 770);
  // side table with a plant
  g.fillStyle = '#d1b08b'; g.fillRect(1700, 700, 110, 14); g.fillRect(1748, 714, 14, F - 714);
  g.fillStyle = '#9fd3a8'; blob(g, 1755, 672, 26); blob(g, 1735, 684, 18); blob(g, 1778, 684, 18);
  g.fillStyle = '#e59d7f'; g.fillRect(1738, 682, 34, 20);
  // kitchen at the far end
  g.fillStyle = '#efe2cb'; g.fillRect(1870, 640, 330, F - 640);
  g.fillStyle = '#fff7ea'; g.fillRect(1860, 628, 350, 16);
  g.strokeStyle = 'rgba(180,150,110,0.5)'; g.lineWidth = 3;
  for (let x = 1885; x < 2190; x += 100) g.strokeRect(x, 660, 86, F - 680);
  g.fillStyle = '#efe2cb'; g.fillRect(1870, 300, 330, 160);
  for (let x = 1885; x < 2190; x += 100) g.strokeRect(x, 312, 86, 136);
  g.fillStyle = '#9ec9e0'; g.fillRect(1960, 590, 60, 40); g.fillStyle = '#f29e8e'; blob(g, 2100, 610, 18);
  haze(L, 'rgba(232,246,242,0.42)');
  return L;
}

function buildFront() {
  // the floor the action happens on, painted for the whole level width
  const L = makeLayer(WORLD_W, 1.5), g = L.g;
  g.fillStyle = '#f7fcfa'; g.fillRect(0, GROUND - 24, WORLD_W, 24);
  g.fillStyle = 'rgba(80,120,110,0.18)'; g.fillRect(0, GROUND - 5, WORLD_W, 5);
  const gr = g.createLinearGradient(0, GROUND, 0, BACKDROP.bottom);
  gr.addColorStop(0, '#d9a874'); gr.addColorStop(0.25, '#c8935f'); gr.addColorStop(1, '#9e6c40');
  g.fillStyle = gr; g.fillRect(0, GROUND, WORLD_W, BACKDROP.bottom - GROUND);
  g.fillStyle = '#ecc293'; g.fillRect(0, GROUND, WORLD_W, 5);          // sunlit lip, like the grass edge
  g.strokeStyle = 'rgba(110,70,35,0.35)'; g.lineWidth = 2;
  for (let y = GROUND + 28, row = 0; y < BACKDROP.bottom; y += 28, row++) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD_W, y); g.stroke();
    for (let x = (row % 2) * 120; x < WORLD_W; x += 240) { g.beginPath(); g.moveTo(x, y - 28); g.lineTo(x, y); g.stroke(); }
  }
  // rugs lying flat on the floor, seen edge-on
  const rug = (x0, x1, c1, c2) => {
    g.fillStyle = c1; g.fillRect(x0, GROUND, x1 - x0, 12);
    g.fillStyle = c2; for (let x = x0 + 8; x < x1 - 8; x += 24) g.fillRect(x, GROUND + 3, 12, 5);
    g.fillStyle = '#fff3e0'; for (let x = x0; x <= x1; x += 6) { g.fillRect(x0 - 8, GROUND + 2 + (x % 12) / 6, 6, 2); g.fillRect(x1 + 2, GROUND + 2 + (x % 12) / 6, 6, 2); }
  };
  rug(120, 520, '#e98f8f', '#f7c6a5');
  rug(1380, 2150, '#8fbfe9', '#f7e7a5');
  return L;
}

// rebuild the far wall (windows, sun, sky) for a new time of day; cheap enough to do once per level
function setBackdropTime(t) {
  if (BACKDROP.far && Math.abs(t - (BACKDROP.tod || 0)) < 0.001) return;
  BACKDROP.tod = t; BACKDROP.far = buildFar(t);
}
function initBackdrop() {
  BACKDROP.tod = 0;
  BACKDROP.far = buildFar(0);
  BACKDROP.mid = buildMid();
  BACKDROP.front = buildFront();
}

// camX is the camera's left edge in world x. Call with the world transform already set.
function drawBackdrop(camX) {
  const h = BACKDROP.bottom - BACKDROP.top;
  for (const [L, p] of [[BACKDROP.far, FAR_P], [BACKDROP.mid, MID_P]]) {
    ctx.drawImage(L.c, camX * (1 - p), BACKDROP.top, L.w, h);
  }
  ctx.drawImage(BACKDROP.front.c, 0, BACKDROP.top, WORLD_W, h);
}
