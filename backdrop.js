'use strict';
// The room behind the action, in the soft washed-out style of Angry Birds backgrounds but indoors.
// Three layers: far wall + windows (scrolls slowest), hazy furniture (middle), and the floor the game sits on.
// Each layer is painted once to an offscreen canvas; drawBackdrop() places them with horizontal parallax.
// Uses GROUND, WORLD_W and hash() from game.js (only called after game.js has loaded).

const BACKDROP = { top: -400, bottom: 1000, far: null, mid: null, front: null };
const FAR_P = 1, MID_P = 0.985;                // how much of the camera movement each layer follows: 1 = fixed in the room (the wall, windows and portraits stay put; the furniture and plants, which stand right against the wall, drift by a hair)

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
  const L = makeLayer(WORLD_W, 1), g = L.g, W = L.w;
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
    g.clearRect(wx, wy, ww, wh);   // a hole: the view outside is drawn behind the wall (drawOutsideDay)
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
  pic(1580, 230, 140, 170, '#ffeec9', '#a8d9a0');
  // framed portraits of the family's own cats, hung on the clear wall between the windows (which ones depends on the level)
  const hz = parseInt(keyed(TOD.haze, tod).slice(1), 16);
  haze(L, `rgba(${hz >> 16},${(hz >> 8) & 255},${hz & 255},0.35)`);
  portraitRects().forEach(p => paintPortrait(g, p.x, p.y, p.w, p.h, p.kind));   // centred between the top of the screen and the sofa   // mid-wall, clear of the hint pill and the sofa
  return L;
}

// ---- portraits of the family's cats. They don't have to be accurate: a framed cartoon face with a name plate.
let PORTRAITS_NOW = [];
// where the portraits hang (world coords): a lone one centred in the gap between the curtains (x 720-990), a pair
// side by side, centred between the top of the screen and the sofa
function portraitRects() {
  const pn = PORTRAITS_NOW.slice(0, 2);
  return pn.map((kind, i) => ({ kind, x: 855 - (pn.length * 128 + (pn.length - 1) * 4) / 2 + i * 132, y: 375, w: 128, h: 160 }));
}   // the kinds hung on the wall for the current level (set by game.js before the far wall is rebuilt)
const PORTRAIT_CATS = {
  pumpkin: { name: 'Pumpkin', bg: '#cfe3d2', fur: '#e8933f', mark: '#b9631f', light: '#f9dcae', eye: '#8fc96a', rx: 1.0, stripes: true },
  stubby:  { name: 'Stubby',  bg: '#e6d8ef', fur: '#f0a752', mark: '#cf8330', light: '#fce3bb', eye: '#d9a33a', rx: 1.1, stripes: true, flat: true, fluff: true },
  hope:    { name: 'Hope',    bg: '#d6e4f3', fur: '#26262d', mark: '#0e0e12', light: '#4a4a56', eye: '#e8a92e', rx: 1.2, black: true, chubby: true },
  lucky:   { name: 'Lucky',   bg: '#f1e2cf', fur: '#2a2a31', mark: '#0e0e12', light: '#4f4f5b', eye: '#d6c93e', rx: 0.98, black: true },
  romeo:   { name: 'Romeo',   bg: '#dbe9d6', fur: '#202026', mark: '#0e0e12', light: '#4a4a56', eye: '#a9cf5c', rx: 1.24, tux: true, chubby: true },
};
function paintPortrait(g, x, y, w, h, kind) {
  const c = PORTRAIT_CATS[kind];
  if (!c) return;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 4, y + 5, w, h);                       // soft shadow on the wall
  g.fillStyle = '#7a5230'; g.fillRect(x, y, w, h);                                       // frame
  g.fillStyle = '#9b6c40'; g.fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = '#f7efe1'; g.fillRect(x + 8, y + 8, w - 16, h - 52);                     // mat
  const px = x + 13, py = y + 13, pw = w - 26, ph = h - 62;                              // the picture itself
  g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  g.fillStyle = c.bg; g.fillRect(px, py, pw, ph);
  const cx = x + w / 2, cy = py + ph * 0.54, r = Math.min(pw, ph) * 0.36;
  portraitCat(g, cx, cy, r, c);
  g.restore();
  // brass name plate
  g.fillStyle = '#e6c264'; g.fillRect(x + 8, y + h - 38, w - 16, 30);
  g.strokeStyle = '#7a5a18'; g.lineWidth = 2; g.strokeRect(x + 8, y + h - 38, w - 16, 30);
  g.fillStyle = '#3a280a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 26; g.font = "800 " + fs + "px 'Trebuchet MS', 'Segoe UI', sans-serif";
  while (g.measureText(c.name).width > w - 28 && fs > 14) { fs--; g.font = "800 " + fs + "px 'Trebuchet MS', 'Segoe UI', sans-serif"; }
  g.fillText(c.name, x + w / 2, y + h - 22);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}
function portraitCat(g, cx, cy, r, c) {
  const rx = r * c.rx, ry = r * (c.chubby ? 0.95 : 0.9);
  const ell = (x, y, a, b, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, a, b, 0, 0, 7); g.fill(); };
  // shoulders (chubby cats show more of them)
  ell(cx, cy + ry * 1.05, rx * (c.chubby ? 1.25 : 0.9), ry * 0.7, c.fur);
  if (c.tux) ell(cx, cy + ry * 1.0, rx * 0.5, ry * 0.55, '#f7f5ef');                       // white bib
  // ears
  for (const sg of [-1, 1]) {
    g.fillStyle = c.fur; g.beginPath(); g.moveTo(cx + sg * rx * 0.28, cy - ry * 0.72); g.lineTo(cx + sg * rx * 0.86, cy - ry * 1.34); g.lineTo(cx + sg * rx * 0.98, cy - ry * 0.3); g.closePath(); g.fill();
    g.fillStyle = c.black || c.tux ? '#7a4a58' : '#f2a7a0'; g.beginPath(); g.moveTo(cx + sg * rx * 0.4, cy - ry * 0.74); g.lineTo(cx + sg * rx * 0.78, cy - ry * 1.12); g.lineTo(cx + sg * rx * 0.86, cy - ry * 0.45); g.closePath(); g.fill();
  }
  // head (a fluffy cat gets a scalloped, fuzzy edge)
  if (c.fluff) for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; ell(cx + Math.cos(a) * rx * 0.97, cy + Math.sin(a) * ry * 0.97, r * 0.16, r * 0.16, c.fur); }
  ell(cx, cy, rx, ry, c.fur);
  if (c.chubby) { ell(cx - rx * 0.62, cy + ry * 0.32, rx * 0.4, ry * 0.46, c.fur); ell(cx + rx * 0.62, cy + ry * 0.32, rx * 0.4, ry * 0.46, c.fur); }   // round cheeks
  // markings
  if (c.stripes) {
    g.strokeStyle = c.mark; g.lineWidth = r * 0.07; g.lineCap = 'round';
    for (const dx of [-0.2, 0, 0.2]) { g.beginPath(); g.moveTo(cx + dx * rx, cy - ry * 0.95); g.lineTo(cx + dx * rx * 0.9, cy - ry * 0.5); g.stroke(); }
    for (const sg of [-1, 1]) for (const dy of [0.05, 0.25]) { g.beginPath(); g.moveTo(cx + sg * rx * 0.98, cy + ry * dy); g.lineTo(cx + sg * rx * 0.72, cy + ry * (dy + 0.04)); g.stroke(); }
  }
  if (c.tux) {
    ell(cx, cy + ry * 0.42, rx * 0.5, ry * 0.46, '#f7f5ef');                               // white muzzle and chin
    g.fillStyle = '#f7f5ef'; g.beginPath(); g.moveTo(cx - rx * 0.1, cy - ry * 0.9); g.lineTo(cx + rx * 0.1, cy - ry * 0.9); g.lineTo(cx + rx * 0.22, cy + ry * 0.3); g.lineTo(cx - rx * 0.22, cy + ry * 0.3); g.closePath(); g.fill();   // the blaze
  } else if (c.black) {
    g.strokeStyle = c.light; g.lineWidth = r * 0.07; g.lineCap = 'round'; g.beginPath(); g.ellipse(cx, cy, rx * 0.72, ry * 0.7, 0, Math.PI * 1.15, Math.PI * 1.55); g.stroke();   // glossy sheen
  } else {
    ell(cx, cy + ry * 0.4, rx * 0.5, ry * 0.4, c.light);                                   // pale muzzle
  }
  // eyes: a flat-faced cat's sit lower and closer together
  const ex = rx * (c.flat ? 0.36 : 0.4), ey = cy - ry * (c.flat ? 0.0 : 0.12), ew = r * (c.black ? 0.24 : 0.2), eh = r * (c.black ? 0.26 : 0.22);
  for (const sg of [-1, 1]) {
    ell(cx + sg * ex, ey, ew, eh, c.eye);
    ell(cx + sg * ex, ey, ew * (c.black ? 0.5 : 0.32), eh * 0.92, '#111');
    ell(cx + sg * ex + ew * 0.25, ey - eh * 0.3, ew * 0.2, ew * 0.2, '#fff');
  }
  // nose and mouth (tiny and squashed for the flat face)
  const ny = cy + ry * (c.flat ? 0.2 : 0.26), ns = r * (c.flat ? 0.1 : 0.14);
  g.fillStyle = c.black ? '#3b2a30' : c.tux ? '#f08aa8' : '#f08a8a';
  g.beginPath(); g.moveTo(cx - ns, ny); g.lineTo(cx + ns, ny); g.lineTo(cx, ny + ns * 0.9); g.closePath(); g.fill();
  g.strokeStyle = c.black && !c.tux ? '#777' : '#6b4a3a'; g.lineWidth = r * 0.04; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, ny + ns * 0.9); g.quadraticCurveTo(cx - ns * 0.9, ny + ns * 2, cx - ns * 1.8, ny + ns * 1.4); g.moveTo(cx, ny + ns * 0.9); g.quadraticCurveTo(cx + ns * 0.9, ny + ns * 2, cx + ns * 1.8, ny + ns * 1.4); g.stroke();
  // whiskers
  g.strokeStyle = c.black && !c.tux ? 'rgba(220,220,230,0.75)' : 'rgba(255,255,255,0.85)'; g.lineWidth = r * 0.025;
  for (const sg of [-1, 1]) for (const dy of [-0.05, 0.08]) { g.beginPath(); g.moveTo(cx + sg * rx * 0.5, ny + ry * dy); g.lineTo(cx + sg * rx * 1.15, ny + ry * (dy * 3 - 0.05)); g.stroke(); }
  g.lineCap = 'butt';
}

// The cabinet's top doors (world coords of the opening behind them). They look like any other cupboard, but tap them
// and they swing open on a secret stash (an Easter egg: nothing hints that they open). k: 0 shut .. 1 wide open.
const CABINET = { x: 52, y: 376, w: 206, h: 132, bong: { x: 76, y: 386, w: 70, h: 122 } };
function cabinetDoor(g, x, y, w, h) {
  g.fillStyle = '#b88c63'; g.fillRect(x + 2, y, w - 4, h);
  g.fillStyle = '#c99f77'; g.fillRect(x + 14, y + 12, w - 28, h - 24);
  g.strokeStyle = 'rgba(120,85,55,0.35)'; g.lineWidth = 2; g.strokeRect(x + 14, y + 12, w - 28, h - 24);
}
function paintCabinetTop(g, k, jig = 0) {
  const { x, y, w, h } = CABINET, dw = w / 2;
  if (k <= 0) {
    for (const dx of [0, dw]) cabinetDoor(g, x + dx, y, dw, h);
    g.fillStyle = '#e8d2a8'; blob(g, x + dw - 12, y + h / 2, 4); blob(g, x + dw + 12, y + h / 2, 4);   // knobs
    return;
  }
  // inside: a dark cupboard with the stash on the floor of it
  g.fillStyle = '#5c3f2b'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let bx = x + 26; bx < x + w; bx += 34) g.fillRect(bx, y, 3, h);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y, w, 10);
  g.fillStyle = '#7a5538'; g.fillRect(x, y + h - 6, w, 6);
  // the bong rattles on its base while it bubbles (jig: 0 still .. 1 shaking hard)
  const bx = CABINET.bong.x + 30, by = y + h - 6;
  g.save(); g.translate(bx + (Math.random() - 0.5) * 3 * jig, by); g.rotate((Math.random() - 0.5) * 0.12 * jig); paintBong(g, 0, 0); g.restore();
  paintStashBag(g, x + 118, y + h - 66, 70, 60);
  // the doors swing out toward the room: foreshortened, their free edges a touch taller as they come nearer
  const th = k * 1.4, grow = 7 * Math.sin(th);
  for (const [hx, dir] of [[x, 1], [x + w, -1]]) {
    const fx = hx + dir * dw * Math.cos(th), pt = (u, v) => [hx + (fx - hx) * u, y - grow * u + (h + 2 * grow * u) * v];
    const quad = (u0, v0, u1, v1) => { g.beginPath(); for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) g.lineTo(...pt(u, v)); g.closePath(); };
    g.fillStyle = '#a97e57'; quad(0, 0, 1, 1); g.fill();
    g.fillStyle = '#bb9068'; quad(0.13, 0.09, 0.87, 0.91); g.fill();
    g.fillStyle = '#e8d2a8'; const [kx, ky] = pt(0.88, 0.5); blob(g, kx, ky, 3.5);
    const e = 5 * Math.sin(th);
    g.fillStyle = '#8a6342'; g.fillRect(dir > 0 ? fx : fx - e, y - grow, e, h + 2 * grow);   // the door's edge
  }
}
// a glass bong standing on the cupboard floor at (cx, base)
function paintBong(g, cx, base) {
  const glass = 'rgba(160,225,215,0.6)', rim = 'rgba(235,255,250,0.95)';
  g.lineWidth = 2; g.strokeStyle = rim; g.fillStyle = glass;
  g.beginPath(); g.ellipse(cx, base - 18, 22, 18, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = 'rgba(80,165,140,0.65)'; g.beginPath(); g.ellipse(cx, base - 18, 22, 18, 0, 0.15, Math.PI - 0.15); g.fill();   // water
  g.fillStyle = glass; g.beginPath();
  g.moveTo(cx - 9, base - 34); g.lineTo(cx - 9, base - 98); g.lineTo(cx - 15, base - 112); g.lineTo(cx + 15, base - 112); g.lineTo(cx + 9, base - 98); g.lineTo(cx + 9, base - 34);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#5fb37a'; g.fillRect(cx - 9, base - 70, 18, 5);                                   // a band of coloured glass
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(cx - 5, base - 40); g.lineTo(cx - 5, base - 96); g.stroke();
  g.strokeStyle = rim; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + 12, base - 22); g.lineTo(cx + 30, base - 40); g.stroke(); g.lineCap = 'butt';   // downstem
  g.fillStyle = '#9aa6a4'; g.beginPath(); g.moveTo(cx + 22, base - 42); g.lineTo(cx + 42, base - 48); g.lineTo(cx + 35, base - 36); g.closePath(); g.fill();   // the bowl
}
// a little zip bag with a pot leaf printed on it, top-left corner at (x, y)
function paintStashBag(g, x, y, w, h) {
  g.fillStyle = '#efe7d0'; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 5); else g.rect(x, y, w, h); g.fill();
  g.fillStyle = '#c64a4a'; g.fillRect(x, y + 5, w, 4);                                              // the zip
  const cx = x + w / 2, cy = y + h - 12;
  g.fillStyle = '#3f9a4a';
  for (const [deg, len] of [[-90, 30], [-62, 25], [-118, 25], [-32, 18], [-148, 18], [-8, 11], [-172, 11]]) {
    const a = deg * Math.PI / 180;
    g.beginPath(); g.ellipse(cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2, len / 2, len * 0.15, a, 0, 7); g.fill();
  }
  g.fillRect(cx - 1, cy, 2, 7);
}
// the top of the cabinet while it's open (shut, it's just part of the furniture layer); hazed to match the furniture
let cabinetCache = { k: -1, c: null };
function drawCabinetTop(k, camX, jig = 0) {
  if (k <= 0) return;
  const { x, y, w, h } = CABINET, pad = 12, sc = 1.25;
  if (cabinetCache.k !== k || jig > 0) {
    const c = cabinetCache.c || document.createElement('canvas');
    c.width = Math.round((w + pad * 2) * sc); c.height = Math.round((h + pad * 2) * sc);
    const g = c.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0); g.translate(pad - x, pad - y);
    paintCabinetTop(g, k, jig);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(232,246,242,0.42)'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    cabinetCache = { k: jig > 0 ? -1 : k, c };
  }
  ctx.drawImage(cabinetCache.c, x - pad + camX * (1 - MID_P), y - pad, w + pad * 2, h + pad * 2);
}

function buildMid() {
  const L = makeLayer(WORLD_W, 1.25), g = L.g;
  const F = GROUND;
  // tall cabinet: plain doors up top, an open shelf of books in the middle, more doors below
  g.fillStyle = '#b88c63'; g.fillRect(32, 350, 246, 14);                 // cornice
  g.fillStyle = '#c99f77'; g.fillRect(40, 364, 230, F - 364);
  paintCabinetTop(g, 0);
  g.fillStyle = '#b88c63'; g.fillRect(52, 522, 206, 110);                // the open shelf
  const bookColors = ['#f29e8e', '#8ec9e6', '#f6d27a', '#9fd3a8', '#c7a6e6', '#f7b7c8'];
  for (let x = 58, k = 0; x < 200; k++) {
    const w = 12 + hash(31 + k) * 14, h = 54 + hash(17 + k) * 22;
    g.fillStyle = bookColors[(3 + k) % bookColors.length];
    g.fillRect(x, 632 - h, w, h); x += w + 3;
  }
  g.fillStyle = '#e59d7f'; g.fillRect(218, 610, 26, 22); g.fillStyle = '#9fd3a8'; blob(g, 231, 598, 16);   // a little pot plant
  for (const x of [52, 155]) cabinetDoor(g, x, 646, 103, F - 666);       // the lower doors (they stay shut)
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

// rebuild the far wall (windows, sun, sky, portraits) for a new time of day or a new set of portraits; cheap enough to do once per level
function setBackdropTime(t, key = '') {
  if (BACKDROP.far && Math.abs(t - (BACKDROP.tod || 0)) < 0.001 && key === BACKDROP.key) return;
  BACKDROP.tod = t; BACKDROP.key = key; BACKDROP.far = buildFar(t);
}
function initBackdrop() {
  BACKDROP.tod = 0;
  BACKDROP.far = buildFar(0);
  BACKDROP.mid = buildMid();
  BACKDROP.front = buildFront();
}

// The view outside the windows. The room (walls, windows, furniture) stays fixed in the world; only what's out there slides
// as the camera moves, each layer at its own slow speed (the distant sun and clouds drift a touch more than the nearer palms).
// OUT_Q is how much of the camera's movement a layer follows (1 = fixed in the world like the wall; the lower, the more it slides).
const OUT_Q = { sun: 0.9, cloud: 0.92, hill: 0.94, palm: 0.96 };   // very subtle: a few percent of the camera's movement
function drawOutsideDay(camX) {
  const tod = BACKDROP.tod || 0, wy = 110, ww = 420, wh = 400, shift = q => (1 - q) * camX;
  const palmCol = keyed(TOD.palm, tod), palmCol2 = hexMix(palmCol, '#ffffff', 0.08);
  for (const wx of [230, 1060]) {
    const tiles = (sh, P, fn) => { const k0 = Math.floor((wx - 230 - sh - 140) / P), k1 = Math.floor((wx + ww - 230 - sh) / P); for (let k = k0; k <= k1; k++) fn(230 + k * P + sh); };
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    const gr = ctx.createLinearGradient(0, wy, 0, wy + wh);
    gr.addColorStop(0, keyed(TOD.skyTop, tod)); gr.addColorStop(1, keyed(TOD.skyLow, tod));
    ctx.fillStyle = gr; ctx.fillRect(wx, wy, ww, wh);
    // the sun: high at noon, sinking toward the hills by sunset; it hardly moves, so the windows slide past it
    const sx = 360 - tod * 30 + shift(OUT_Q.sun), sy = wy + 200 + tod * 78, sr = 34 + tod * 10, sc = keyed(TOD.sun, tod);
    const sg = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * (3 + tod * 2));
    sg.addColorStop(0, sc + 'cc'); sg.addColorStop(1, sc + '00');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr * (3 + tod * 2), 0, 7); ctx.fill();
    ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    ctx.fillStyle = keyed(TOD.cloud, tod); ctx.globalAlpha = 0.95;
    tiles(shift(OUT_Q.cloud), 830, ox => { cloud(ctx, ox + 70, wy + 80, 1.1); cloud(ctx, ox + 260, wy + 50, 0.8); cloud(ctx, ox + 300, wy + 150, 0.6); cloud(ctx, ox + 560, wy + 110, 0.9); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = keyed(TOD.hill, tod);
    const hs = shift(OUT_Q.hill);
    ctx.beginPath(); ctx.moveTo(wx, wy + wh);
    for (let x = 0; x <= ww; x += 20) ctx.lineTo(wx + x, wy + wh - 120 - Math.sin((wx + x - hs - 230) / 60 + 230) * 30);
    ctx.lineTo(wx + ww, wy + wh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = keyed(TOD.hillDark, tod);
    tiles(hs, 630, ox => { for (const [dx, r] of [[60, 46], [130, 34], [330, 52], [390, 30]]) blob(ctx, ox + dx, wy + wh - 70, r); });
    tiles(shift(OUT_Q.palm), 900, ox => {
      palm(ctx, ox + 210, wy + wh - 20, 170, palmCol); palm(ctx, ox + 280, wy + wh - 10, 120, palmCol2);
      palm(ctx, ox + 640, wy + wh - 16, 140, palmCol); palm(ctx, ox + 710, wy + wh - 8, 100, palmCol2);
    });
    ctx.fillStyle = keyed(TOD.hill, tod); ctx.fillRect(wx, wy + wh - 40, ww, 40);
    ctx.restore();
  }
}

// camX is the camera's left edge in world x. Call with the world transform already set.
function drawBackdrop(camX) {
  const h = BACKDROP.bottom - BACKDROP.top;
  drawOutsideDay(camX);   // behind the wall: it shows through the window holes
  for (const [L, p] of [[BACKDROP.far, FAR_P], [BACKDROP.mid, MID_P]]) {
    ctx.drawImage(L.c, camX * (1 - p), BACKDROP.top, L.w, h);
  }
  ctx.drawImage(BACKDROP.front.c, 0, BACKDROP.top, WORLD_W, h);
}
