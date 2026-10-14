'use strict';
// Vickie's Angry Cats — raccoon burglars stole the toys and treats. Fling the cats and get them back.
// Everything is drawn in code on one canvas. Physics is Matter.js 0.19 (velocities are per 60Hz step).
// The world is wider than the screen: a camera scrolls between the slingshot and the fort, like Angry Birds.

const { Engine, Bodies, Body, Composite, Constraint, Events, Vector, Sleeping } = Matter;

const W = 1600, H = 900, GROUND = 820;     // W x H is the menu/HUD design size; H is also the world height
const WORLD_W = 2500;                      // the level is this wide; the screen only shows part of it
const VIEW_H = 600;                        // world units visible top-to-bottom (smaller = more zoomed in)
const CAM_TOP = 885 - VIEW_H;              // resting camera: floor near the bottom of the screen
const FORT_X = 550;                        // level layouts are written at x 900-1400; this pushes them off-screen right
const SLING = { x: 300, y: 640 };
const MAX_PULL = 130;
const SNAP_PULL = 124;                     // CeCe is heavy: pull her right to the end and the band snaps
const POWER = 0.18;                        // launch speed per unit of pull
const STEP = 1000 / 60;
const GRAV_STEP = 0.001 * STEP * STEP;     // Matter's per-step gravity at gravity.y = 1
const MAX_SPEED = 26;                      // keeps fast cats from passing through thin blocks
const GAME_VERSION = 33;                   // bump with each release (matches the sw.js cache name)
const FONT = "Fredoka, 'Trebuchet MS', 'Segoe UI', sans-serif";

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = 1, uiScale = 1, UW = W, uiOffY = 0, worldScale = 1, viewW = W;
const cam = { x: 0, y: CAM_TOP };

// ---------------------------------------------------------------- data

const MATS = {
  wood:  { density: 0.002, health: 70,  fill: '#d0914f', edge: '#7a4a22', points: 500 },
  glass: { density: 0.001, health: 30,  fill: 'rgba(175,225,255,0.55)', edge: '#6fb6e3', points: 300 },
  stone: { density: 0.004, health: 260, fill: '#a0a6ae', edge: '#5b6068', points: 800 },
  // levels 7-10
  book:   { density: 0.0018, health: 60, fill: '#e98f8f', edge: '#8a4b4b', points: 400 },             // domino books
  catnip: { density: 0.0015, health: 22, fill: '#8fd07a', edge: '#3f7a3c', points: 300, explodes: true }, // like TNT
  decoy:  { density: 0.0008, health: 15, fill: '#d9b98c', edge: '#9a7a50', points: 3000 },           // cardboard boss
  yarnball: { density: 0.006, fill: '#7fb3e6', edge: '#4a7fb3', points: 0 },                         // rolling boulder (unbreakable)
  shelf:  { fill: '#b07d4f', edge: '#7a4f2a', points: 0 },                                           // fixed to the wall
  ramp:   { fill: '#e2c69c', edge: '#a8875a', points: 0 },                                           // fixed cardboard slide
  cage:   { density: 0.0015, health: 30, fill: 'rgba(225,235,250,0.3)', edge: '#7d8594', points: 0 },    // a kitten is locked inside
};

const CATS = {
  baby: { name: 'Baby', r: 30, density: 0.004, restitution: 0.3, friction: 0.6,
          body: '#a5a4aa', dark: '#6f6e75', belly: '#f4f4f6', eye: '#cfc77e', patch: '#cbcacf',
          power: 'split', hint: 'Tap for ninja clones!' },
  // CeCe weighs a ton: she launches weak, lands short, then rolls like a bowling ball.
  cece: { name: 'CeCe', r: 70, density: 0.00553, restitution: 0.12, friction: 0.9, frictionAir: 0.0012, launch: 0.82, pullCurve: 0.9, rollDrag: 0.98, bumpDamp: 0.55,
          body: '#93826f', dark: '#3e342c', belly: '#fbfaf7', eye: '#b9b46a', patch: '#d9984f',
          power: 'shake', hint: 'Tap for the head shake!' },
  cleo: { name: 'Cleo', r: 34, density: 0.004, restitution: 0.3, friction: 0.5,
          body: '#f0c99a', dark: '#c98f58', belly: '#fffdf8', eye: '#b5d39c', patch: '#e6ae74',
          power: 'prance', hint: 'Tap to prance!' },
};

// Which recorded cat noise plays when (clips cut from "The two talking cats"). All the clips are in sounds/ (audition them on sounds.html);
// swap names here to change a sound.
const CAT_SOUNDS = {
  launch: { baby: 'meow-7', cece: 'meow-12', cleo: 'meow-6' },
  power: { baby: 'chirp-1', cece: 'meow-9', cleo: 'chirp-5' },
  chatter: { baby: ['chirp-4', 'chirp-6', 'chirp-13'], cece: ['meow-10', 'chirp-11', 'meow-3'], cleo: ['meow-2', 'chirp-9', 'meow-4'] },
  win: 'meow-11', lose: 'meow-10', snap: 'meow-5',
};
function catSoundFiles() {
  const s = new Set();
  const add = v => { if (typeof v === 'string') s.add(v); else Object.values(v).flat().forEach(x => s.add(x)); };
  Object.values(CAT_SOUNDS).forEach(add);
  return [...s];
}
const pick = a => a[Math.floor(Math.random() * a.length)];

// Each cat's name lettering (home screen and the 'is up!' banner).
const NAME_STYLE = {
  baby: { font: 'Bangers, Impact, sans-serif', weight: 400, fill: '#e9e9ee', stroke: '#4a4856' },
  cece: { font: "Chewy, 'Comic Sans MS', cursive", weight: 400, fill: '#fff3e0', stroke: '#5a4030' },
  cleo: { font: "'Dancing Script', 'Brush Script MT', cursive", weight: 700, fill: '#ffe6c4', stroke: '#9a5a2a' },
};
function nameText(type, x, y, size, align) {
  const st = NAME_STYLE[type];
  text(CATS[type].name, x, y, size, st.fill, { font: st.font, weight: st.weight, stroke: st.stroke, strokeW: size * 0.15, align });
}

// Level building helpers. A "hut" is two posts and a beam; huts stack.
function block(lv, mat, x, y, w, h) { lv.blocks.push({ mat, x, y, w, h }); }
function hut(lv, cx, base, w, h, postMat, beamMat) {
  block(lv, postMat, cx - w / 2 + 10, base - h / 2, 20, h);
  block(lv, postMat, cx + w / 2 - 10, base - h / 2, 20, h);
  block(lv, beamMat, cx, base - h - 10, w, 20);
  return base - h - 20;
}
function coon(lv, x, base, boss, helmet) { const r = boss ? 60 : 36; lv.raccoons.push({ x, y: base - r - 1, r, boss: !!boss, helmet: !!helmet }); }
// a kitten locked in a cage: break it to rescue her
function cage(lv, x, base, size = 86) { block(lv, 'cage', x, base - size / 2, size, size); }
function loot(lv, x, base, kind) { lv.loot.push({ x, y: base - 14, kind }); }
// fixed pieces that never move or break: a wall shelf (centre x, top y) and a slide given by its corner points
function shelf(lv, x, top, w) { lv.blocks.push({ mat: 'shelf', x, y: top + 9, w, h: 18, fixed: true }); return top; }
function ramp(lv, pts) { lv.blocks.push({ mat: 'ramp', x: 0, y: 0, pts, fixed: true }); }
function yarnBall(lv, x, base, r) { lv.blocks.push({ mat: 'yarnball', x, y: base - r, r, ball: true }); }
function catnip(lv, x, base) { block(lv, 'catnip', x, base - 22, 44, 44); }
function book(lv, x, h) { block(lv, 'book', x, GROUND - h / 2, 22, h); }
function decoy(lv, x) { block(lv, 'decoy', x, GROUND - 70, 92, 140); }
// a raccoon on a plank held up by party balloons; it hovers around y until a balloon pops
function floatie(lv, x, y) { lv.floats.push({ x, y }); }

// Every level gets each cat exactly once.
const LEVELS = [
  { name: 'The Back Door', cats: ['cleo', 'baby', 'cece'], build(lv) {
    const t = hut(lv, 1150, GROUND, 160, 100, 'wood', 'wood');
    coon(lv, 1150, GROUND); coon(lv, 1150, t);
    loot(lv, 1300, GROUND, 'fish');
  } },
  { name: 'Kitchen Raid', cats: ['baby', 'cleo', 'cece'], build(lv) {
    const t1 = hut(lv, 1020, GROUND, 140, 110, 'glass', 'wood'); coon(lv, 1020, GROUND);
    const t2 = hut(lv, 1020, t1, 140, 110, 'glass', 'wood'); coon(lv, 1020, t1); coon(lv, 1020, t2);
    const t3 = hut(lv, 1300, GROUND, 170, 90, 'wood', 'glass'); coon(lv, 1300, GROUND);
    loot(lv, 1300, t3, 'yarn');
  } },
  { name: 'The Garage', cats: ['cleo', 'cece', 'baby'], build(lv) {
    const s = hut(lv, 1150, GROUND, 300, 110, 'stone', 'stone'); coon(lv, 1150, GROUND);
    loot(lv, 1060, GROUND, 'fish');
    const a = hut(lv, 1087, s, 126, 100, 'wood', 'wood'); coon(lv, 1087, s);
    hut(lv, 1213, s, 126, 100, 'wood', 'wood'); coon(lv, 1213, s);
    const c = hut(lv, 1150, a, 150, 80, 'glass', 'wood'); coon(lv, 1150, c);
  } },
  { name: 'Pyramid of Loot', cats: ['baby', 'cece', 'cleo'], build(lv) {
    const r1 = hut(lv, 980, GROUND, 124, 90, 'stone', 'wood');
    hut(lv, 1110, GROUND, 124, 90, 'stone', 'wood'); coon(lv, 1110, GROUND);
    hut(lv, 1240, GROUND, 124, 90, 'stone', 'wood'); loot(lv, 980, GROUND, 'yarn');
    const r2 = hut(lv, 1045, r1, 124, 90, 'wood', 'glass'); coon(lv, 1045, r1);
    hut(lv, 1175, r1, 124, 90, 'wood', 'glass'); coon(lv, 1175, r1);
    const r3 = hut(lv, 1110, r2, 124, 90, 'glass', 'wood'); coon(lv, 1110, r2);
    loot(lv, 1110, r3, 'fish');
  } },
  { name: 'Attic Hideout', cats: ['cece', 'cleo', 'baby'], build(lv) {
    block(lv, 'stone', 880, GROUND - 90, 30, 180);
    let t = GROUND;
    for (let i = 0; i < 3; i++) { const nt = hut(lv, 1340, t, 124, 120, i === 1 ? 'glass' : 'wood', 'wood'); coon(lv, 1340, t); t = nt; }
    coon(lv, 1340, t);
    const s = hut(lv, 1110, GROUND, 140, 80, 'wood', 'stone'); loot(lv, 1110, GROUND, 'fish'); loot(lv, 1110, s, 'yarn');
  } },
  { name: 'The Big Boss Bandit', cats: ['cleo', 'baby', 'cece'], build(lv) {
    const t = hut(lv, 1200, GROUND, 320, 150, 'stone', 'stone'); coon(lv, 1200, GROUND, true);
    const a = hut(lv, 1120, t, 140, 100, 'wood', 'glass'); coon(lv, 1120, t);
    hut(lv, 1280, t, 140, 100, 'wood', 'glass'); coon(lv, 1280, t);
    loot(lv, 1120, a, 'fish');
    hut(lv, 950, GROUND, 110, 80, 'glass', 'wood'); loot(lv, 950, GROUND, 'yarn');
  } },
  // Levels 7-10 borrow classic Angry Birds set pieces: chain-reaction dominoes, rolling boulders,
  // TNT, balloons (Danger Above) and the cardboard King Pig decoy (Mighty Hoax).
  { name: 'Bookshelf Dominoes', cats: ['cleo', 'baby', 'cece'], build(lv) {
    for (let i = 0; i < 9; i++) book(lv, 820 + i * 38, 112 + (i % 3) * 8);   // knock the first one over...
    const t = hut(lv, 1236, GROUND, 150, 100, 'glass', 'wood'); coon(lv, 1236, GROUND); loot(lv, 1236, t, 'fish');
    const s1 = shelf(lv, 1050, 610, 230); coon(lv, 1000, s1); coon(lv, 1100, s1);
    const s2 = shelf(lv, 1360, 560, 170); coon(lv, 1335, s2); loot(lv, 1410, s2, 'yarn');
  } },
  { name: 'Yarn Ball Avalanche', cats: ['baby', 'cece', 'cleo'], build(lv) {
    ramp(lv, [[880, GROUND], [880, 600], [1140, GROUND]]);
    const top = shelf(lv, 852, 584, 84); yarnBall(lv, 856, top, 44);           // nudge it down the slide
    hut(lv, 1250, GROUND, 140, 100, 'glass', 'wood'); coon(lv, 1250, GROUND);
    const t1 = hut(lv, 1390, GROUND, 140, 100, 'wood', 'glass'); coon(lv, 1390, GROUND);
    const t2 = hut(lv, 1390, t1, 120, 90, 'glass', 'wood'); coon(lv, 1390, t1);
    yarnBall(lv, 1390, t2, 36);
  } },
  { name: 'Catnip Kaboom', cats: ['cece', 'baby', 'cleo'], build(lv) {
    const s1 = hut(lv, 1050, GROUND, 170, 100, 'stone', 'stone'); coon(lv, 1050, GROUND);
    const w = hut(lv, 1050, s1, 120, 90, 'wood', 'wood'); coon(lv, 1050, s1); catnip(lv, 1050, w);
    const s2 = hut(lv, 1330, GROUND, 170, 100, 'stone', 'stone'); coon(lv, 1330, GROUND);
    coon(lv, 1300, s2); catnip(lv, 1385, s2);
    catnip(lv, 930, GROUND); catnip(lv, 1190, GROUND); catnip(lv, 1450, GROUND);
  } },
  { name: 'Balloon Getaway', cats: ['cleo', 'baby', 'cece'], build(lv) {
    floatie(lv, 1000, 570); floatie(lv, 1250, 505);
    decoy(lv, 1180);                                                        // the boss? not quite...
    block(lv, 'glass', 1325, GROUND - 60, 20, 120);
    hut(lv, 1440, GROUND, 170, 150, 'stone', 'stone'); coon(lv, 1440, GROUND, true);
    loot(lv, 1400, GROUND, 'fish');
  } },
  // Fan favourites: Rio's caged friends to set free, a Rube Goldberg chain (yarn ball, slide, catnip),
  // helmet-wearing toughies, and a hidden golden egg (here a golden fish) for the bonus hunters.
  { name: 'Kitten Rescue', cats: ['baby', 'cece', 'cleo'], build(lv) {
    ramp(lv, [[900, GROUND], [900, 600], [1110, GROUND]]);
    const top = shelf(lv, 872, 592, 80); yarnBall(lv, 875, top, 40);      // nudge it: it rolls into the catnip...
    catnip(lv, 1135, GROUND);
    cage(lv, 1220, GROUND);                                                 // ...which blows this cage open
    const t1 = hut(lv, 1360, GROUND, 170, 120, 'stone', 'wood'); coon(lv, 1360, GROUND, false, true);
    const t2 = hut(lv, 1360, t1, 140, 100, 'wood', 'glass'); coon(lv, 1360, t1);
    coon(lv, 1318, t2, false, true); cage(lv, 1400, t2, 70);
    const g = shelf(lv, 1490, 400, 70); loot(lv, 1490, g, 'goldfish');     // the secret
  } },
];

// ---------------------------------------------------------------- saved progress

const STORE_KEY = 'vickysAngryCats.stars';
let bestStars = {};
try { bestStars = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { bestStars = {}; }
function saveStars() { try { localStorage.setItem(STORE_KEY, JSON.stringify(bestStars)); } catch (e) { /* private mode */ } }
const unlocked = i => i === 0 || (bestStars[i - 1] || 0) > 0;
const GOLD_KEY = 'vickiesAngryCats.golden';
let goldenFound = {};
try { goldenFound = JSON.parse(localStorage.getItem(GOLD_KEY)) || {}; } catch (e) { goldenFound = {}; }
function saveGolden() { try { localStorage.setItem(GOLD_KEY, JSON.stringify(goldenFound)); } catch (e) { /* private mode */ } }

// ---------------------------------------------------------------- sound (synthesized, no files)

const sfx = {
  ac: null, on: true, noise: null,
  init() {
    if (!this.ac) {
      try {
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ac.sampleRate * 1.0;
        this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ac = null; }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    this.loadSample('win', 'jingle-win.ogg');
    this.loadSample('lose', 'jingle-lose.ogg');
    for (const n of catSoundFiles()) this.loadSample('cat:' + n, 'sounds/' + n + '.ogg');
  },
  ok() { return this.on && this.ac; },
  env(t, dur, vol, dest, attack = 0.02) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest || this.ac.destination);
    return g;
  },
  // crashes get their own loud channel with a limiter, so they cut through the music without distorting
  crashBus: null,
  bus() {
    if (!this.crashBus) {
      const shaper = this.ac.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x); }   // gentle grit
      shaper.curve = curve;
      const comp = this.ac.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2;
      this.crashBus = this.ac.createGain(); this.crashBus.gain.value = 2.2;
      this.crashBus.connect(shaper); shaper.connect(comp); comp.connect(this.ac.destination);
    }
    return this.crashBus;
  },
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ok()) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(this.env(t, dur, vol)); o.start(t); o.stop(t + dur + 0.05);
  },
  meow(pitch = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), f = this.ac.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 5;
    o.frequency.setValueAtTime(480 * pitch, t);
    o.frequency.linearRampToValueAtTime(860 * pitch, t + 0.14);
    o.frequency.linearRampToValueAtTime(400 * pitch, t + 0.5);
    o.connect(f); f.connect(this.env(t, 0.55, 0.16)); o.start(t); o.stop(t + 0.6);
  },
  thud(v) {
    if (!this.ok()) return;
    const t = this.ac.currentTime, s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 500;
    s.connect(f); f.connect(this.env(t, 0.18, 0.05 + 0.25 * v)); s.start(t); s.stop(t + 0.25);
  },
  // ---- crash and crumble sounds, made from filtered noise (no files), all through the loud crash bus ----
  // one burst of noise through a filter; starts at a random spot in the buffer so repeats differ
  burst(delay, dur, type, freq, q, vol) {
    const t = this.ac.currentTime + delay, s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(this.env(t, dur, vol, this.bus(), 0.003));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  ping(type, f0, f1, dur, vol, delay = 0) {
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(this.env(t, dur, vol, this.bus(), 0.003)); o.start(t); o.stop(t + dur + 0.05);
  },
  // a shower of short noise grains: debris falling over the next moments (more at the start)
  grains(n, span, fLo, fHi, dLo, dHi, vol, q = 1.2) {
    const r = Math.random;
    for (let i = 0; i < n; i++) {
      const delay = Math.pow(r(), 1.8) * span;
      this.burst(delay, dLo + r() * (dHi - dLo), 'bandpass', fLo + r() * (fHi - fLo), q, vol * (1 - 0.6 * delay / span));
    }
  },
  recent: [],
  // something just broke: a crash in the sound of what it was made of. Breaks close together pile up
  // into a bigger collapse, but each extra one is lighter so a falling tower doesn't overload the phone.
  crumble(mat) {
    if (!this.ok()) return;
    const now = this.ac.currentTime;
    this.recent = this.recent.filter(t => now - t < 0.3); this.recent.push(now);
    const busy = this.recent.length, k = busy > 6 ? 0 : busy > 3 ? 0.5 : 1;
    if (!k) return;
    const r = Math.random;
    if (mat === 'glass') {
      this.burst(0, 0.35, 'highpass', 1800, 0.5, 0.8);                               // shatter
      this.grains(Math.round(12 * k), 0.45, 3000, 7000, 0.02, 0.05, 0.35, 2);         // sparkly bits
      for (let i = 0; i < 8 * k; i++) this.ping('sine', 2400 + r() * 3200, 2200 + r() * 2600, 0.08 + r() * 0.18, 0.18, r() * 0.3);   // tinkles
    } else if (mat === 'stone') {
      this.burst(0, 0.4, 'bandpass', 750, 0.6, 1.0);                                  // the block giving way
      this.ping('sine', 170, 60, 0.3, 0.7);                                           // thump (the grit makes it audible)
      this.grains(Math.round(28 * k), 0.95, 500, 2600, 0.03, 0.09, 0.55, 1.1);        // rubble tumbling down
    } else if (mat === 'book' || mat === 'decoy') {
      this.burst(0, 0.14, 'bandpass', 1800, 0.7, 0.8);                                // papery thwap
      this.ping('sine', 320, 140, 0.12, 0.45);
      this.grains(Math.round(6 * k), 0.25, 1500, 3500, 0.02, 0.05, 0.3);
    } else {                                                                          // wood
      this.burst(0, 0.07, 'highpass', 1200, 0.7, 1.0);                                // sharp crack
      this.burst(0, 0.28, 'bandpass', 850, 0.8, 0.7);                                 // splintering body
      this.ping('triangle', 230, 90, 0.2, 0.6);                                       // woody thump
      this.grains(Math.round(16 * k), 0.55, 900, 3600, 0.02, 0.06, 0.45, 1.4);        // splinters and chunks
    }
  },
  // a solid hit that didn't break anything
  // An impact that didn't break anything. A toppling tower is mostly these, so they need real crunch.
  knock(mat, v) {
    if (!this.ok()) return;
    const r = Math.random;
    if (mat === 'glass') {
      this.ping('sine', 2000 + r() * 900, 1800, 0.12, 0.2 + 0.35 * v);
      this.burst(0, 0.09, 'highpass', 3000, 0.6, 0.15 + 0.3 * v);
    } else if (mat === 'stone') {
      this.burst(0, 0.18, 'bandpass', 600 + r() * 300, 0.8, 0.3 + 0.6 * v);
      this.ping('sine', 150, 60, 0.15, 0.4 * v);
      if (v > 0.3) this.grains(Math.round(6 * v), 0.3, 600, 2200, 0.02, 0.06, 0.35 * v);
    } else {
      this.burst(0, 0.12, 'bandpass', 700 + r() * 400, 1.0, 0.25 + 0.6 * v);
      this.ping('triangle', 200, 90, 0.1, 0.3 * v);
      if (v > 0.3) this.grains(Math.round(5 * v), 0.22, 900, 3000, 0.015, 0.04, 0.3 * v);
    }
  },
  pop() { this.tone('sine', 260, 900, 0.16, 0.2); },
  zoom() { this.tone('square', 300, 1300, 0.25, 0.05); },
  prance() { this.tone('triangle', 700, 1500, 0.14, 0.12); this.tone('triangle', 950, 1900, 0.12, 0.09, 0.07); },
  creak() {
    // a short wobbly wooden groan
    if (!this.ok()) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), f = this.ac.createBiquadFilter();
    const base = 70 + Math.random() * 30;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.06); o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.14);
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 3;
    o.connect(f); f.connect(this.env(t, 0.16, 0.14)); o.start(t); o.stop(t + 0.2);
  },
  snap() { this.tone('square', 1800, 120, 0.18, 0.12); this.thud(0.6); },
  shake() { for (let i = 0; i < 6; i++) this.tone('triangle', i % 2 ? 260 : 340, i % 2 ? 300 : 220, 0.07, 0.13, i * 0.07); },
  ding() { this.tone('triangle', 1200, 1800, 0.15, 0.12); },
  // recorded jingles (loaded after the first tap); the synth versions are the fallback
  samples: {},
  loadSample(name, url) {
    if (!this.ac || this.samples[name] !== undefined) return;
    this.samples[name] = null;
    fetch(url).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => this.ac.decodeAudioData(b, res, rej)))
      .then(buf => { this.samples[name] = buf; }).catch(() => { /* keep the synth fallback */ });
  },
  playSample(name, vol, delay = 0, rate = 1) {
    const buf = this.samples[name];
    if (!this.ok() || !buf) return false;
    const src = this.ac.createBufferSource(), g = this.ac.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = vol;
    src.connect(g); g.connect(this.ac.destination); src.start(this.ac.currentTime + delay);
    return true;
  },
  // the real cat noises (cut from Vickie's recording, files in sounds/); slight pitch wobble so repeats sound alive
  cat(name, vol = 0.6, delay = 0) { return this.playSample('cat:' + name, vol, delay, 0.95 + Math.random() * 0.1); },
  win() {
    if (this.playSample('win', 0.25)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.15, i * 0.13));
  },
  lose() {
    if (this.playSample('lose', 1)) return;
    [392, 330, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.3, 0.06, i * 0.22));
  },
};

// ---------------------------------------------------------------- music (Vickie's Gemini tracks)
// Each file plays its intro once, then loops loopStart..loopEnd. Loop points were picked by matching
// the music on both sides of the seam, and a short crossfade is baked into the file just before loopEnd.
const MUSIC = {
  menu: { url: 'music-menu.ogg', loopStart: 17.1726, loopEnd: 52.0824 },
  game: { url: 'music-game.ogg', loopStart: 36.3431, loopEnd: 116.3784 },
};
const AUDIO_KEY = 'vickiesAngryCats.audio';
const music = {
  on: true, volume: 0.35, gain: null, buffers: {}, loading: {}, current: null,
  ensure() {
    if (this.gain || !sfx.ac) return;
    this.gain = sfx.ac.createGain();
    this.gain.gain.value = this.on ? this.volume : 0;
    this.gain.connect(sfx.ac.destination);
  },
  load(name) {
    if (this.buffers[name] || this.loading[name]) return;
    this.loading[name] = fetch(MUSIC[name].url).then(r => r.arrayBuffer())
      .then(b => new Promise((res, rej) => sfx.ac.decodeAudioData(b, res, rej)))
      .then(buf => { this.buffers[name] = buf; })
      .catch(() => { /* offline or unsupported: play on without music */ });
  },
  // called every frame: switches tracks to match the screen, crossfading over about a second
  update() {
    if (!sfx.ac) return;
    this.ensure();
    const want = state === 'menu' || state === 'levels' ? 'menu' : 'game';
    this.load(want);
    if (this.buffers[want]) this.load(want === 'menu' ? 'game' : 'menu');
    if ((this.current && this.current.name === want) || !this.buffers[want]) return;
    const t = sfx.ac.currentTime;
    if (this.current) { const old = this.current; old.g.gain.setTargetAtTime(0, t, 0.25); old.src.stop(t + 1.5); }
    const src = sfx.ac.createBufferSource(), g = sfx.ac.createGain();
    src.buffer = this.buffers[want]; src.loop = true;
    src.loopStart = MUSIC[want].loopStart; src.loopEnd = MUSIC[want].loopEnd;
    g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(1, t, 0.3);
    src.connect(g); g.connect(this.gain); src.start(t);
    this.current = { name: want, src, g };
  },
  setVolume(v, tc) { if (this.gain) { const t = sfx.ac.currentTime; this.gain.gain.cancelScheduledValues(t); this.gain.gain.setTargetAtTime(v, t, tc); } },
  toggle() { this.on = !this.on; this.setVolume(this.on ? this.volume : 0, 0.1); saveAudio(); },
  // dip the music while a win/lose jingle plays
  duck(sec) {
    if (!this.gain || !this.on) return;
    const t = sfx.ac.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(this.volume * 0.25, t, 0.05);
    this.gain.gain.setTargetAtTime(this.volume, t + sec, 0.5);
  },
};
function saveAudio() { try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ music: music.on, sfx: sfx.on })); } catch (e) { /* private mode */ } }
try { const a = JSON.parse(localStorage.getItem(AUDIO_KEY)); if (a) { music.on = a.music !== false; sfx.on = a.sfx !== false; } } catch (e) { /* defaults */ }
// stop the music when the phone goes to the home screen or locks
document.addEventListener('visibilitychange', () => {
  if (!sfx.ac) return;
  if (document.hidden) sfx.ac.suspend(); else sfx.ac.resume();
});

// ---------------------------------------------------------------- game state

let engine = null;
let state = 'menu';                 // menu | levels | play | won | lost
let levelIdx = 0;
let queue = [], current = null, phase = 'aim';   // phase: aim | flying | out
let dragging = false, pull = { x: 0, y: 0 };
let flying = [], powerUsed = false, flyTimer = 0, outTimer = 0, winTimer = -1;
let settle = 0, score = 0, stars = 0, bonus = 0;
let toRemove = [], particles = [], popups = [], uiButtons = [], uiShift = 0;
let frame = 0, lastThud = 0, launchedOnce = false, snapTimer = 0, bandSnapped = false;
let panning = null, panIdle = 999, introTimer = 0, fortCenter = 1700;
// 'Baby is up!' ribbon: slides in from the left, holds, whooshes off right (t counts frames; negative = waiting)
let upBanner = null;
// The cats "plotting" before a level: each in turn hops, mews and pops a little speech bubble.
// who = place in line (0 = on the slingshot), t = frames until it happens, life = frames left on screen.
let chatter = [];
const CHATTER_LIFE = 36, CHATTER_SYMBOLS = ['!', '♥', '?!', '♪', '>:3'];
function scheduleChatter(lineup, start) {
  chatter = [];
  lineup.forEach((type, who) => chatter.push({ type, who, t: start + who * 16, life: CHATTER_LIFE, sym: CHATTER_SYMBOLS[(who * 2 + levelIdx) % CHATTER_SYMBOLS.length] }));
  chatter.push({ type: lineup[0], who: 0, t: start + lineup.length * 16 + 4, life: CHATTER_LIFE, sym: '!' });   // the leader has the last word
}
function chatterAt(who) { return chatter.find(c => c.who === who && c.t <= 0 && c.life > 0); }
function chatterHop(who) { const c = chatterAt(who); return c ? Math.sin((1 - c.life / CHATTER_LIFE) * Math.PI) * 16 : 0; }
function chatterBubble(who, x, y) {
  const c = chatterAt(who); if (!c) return;
  const a = Math.min(1, c.life / 8), s = 0.7 + 0.3 * Math.min(1, (CHATTER_LIFE - c.life) / 6);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff'; rr(-30, -26, 60, 44, 18); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(-2, 30); ctx.lineTo(8, 16); ctx.closePath(); ctx.fill();
  text(c.sym, 0, -4, 28, c.sym === '♥' ? '#e8578f' : '#3a2160');
  ctx.restore();
}
let menuHop = {};                   // home screen: when each cat was last tapped

let knocksThisFrame = 0;
let snapStrain = 0;               // frames CeCe has been held past the snap limit
const SNAP_DELAY = 40;              // about 2/3 of a second of shaking and creaking before it breaks
const BANNER_IN = 12, BANNER_HOLD = 52, BANNER_OUT = 12, BANNER_LEN = BANNER_IN + BANNER_HOLD + BANNER_OUT;

function newEngine() {
  engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  Events.on(engine, 'collisionStart', onCollide);
}

function makeBlock(b) {
  const m = MATS[b.mat];
  if (b.pts) {
    // fixed slide: build from its corner points (fromVertices recentres on the centroid)
    const cx = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length, cy = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length;
    const body = Bodies.fromVertices(cx, cy, [b.pts.map(([x, y]) => ({ x, y }))], { isStatic: true, friction: 0.5, label: 'block' });
    body.game = { kind: 'block', mat: b.mat, poly: true, seed: Math.random() * 1000 };
    return body;
  }
  if (b.ball) {
    const body = Bodies.circle(b.x, b.y, b.r, { density: m.density, friction: 0.5, frictionStatic: 0.8, restitution: 0.1, label: 'block' });
    body.game = { kind: 'block', mat: b.mat, ball: true, r: b.r, seed: Math.random() * 1000 };
    return body;
  }
  const body = Bodies.rectangle(b.x, b.y, b.w, b.h, b.fixed ? { isStatic: true, friction: 0.8, label: 'block' } : {
    density: m.density, friction: 0.8, frictionStatic: 1.2, restitution: 0.05, label: 'block' });
  const hp = b.fixed ? undefined : m.health * Math.max(0.6, Math.min(2.5, (b.w * b.h) / 2000));
  body.game = { kind: 'block', mat: b.mat, w: b.w, h: b.h, hp, maxHp: hp, seed: Math.random() * 1000, fixed: b.fixed };
  return body;
}
// party-balloon platform: a plank, a raccoon sitting on it, three balloons on strings
let floats = [];
function makeFloat(f) {
  const plank = makeBlock({ mat: 'wood', x: f.x, y: f.y, w: 150, h: 18 });
  plank.frictionAir = 0.03;
  const c = makeCoon({ x: f.x, y: f.y - 9 - 37, r: 36 });
  const group = { plank, coon: c, balloons: [], y: f.y };
  const colors = ['#ff6f91', '#ffc75f', '#6fc3ff'];
  [-58, 0, 58].forEach((off, i) => {
    const b = Bodies.circle(f.x + off * 1.25, f.y - 125 - (i === 1 ? 14 : 0), 24, { density: 0.0004, frictionAir: 0.06, restitution: 0.4, label: 'balloon' });
    b.game = { kind: 'balloon', hp: 4, maxHp: 4, color: colors[i] };
    b.game.rope = Constraint.create({ bodyA: b, bodyB: plank, pointB: { x: off, y: -9 }, length: 118 + (i === 1 ? 14 : 0), stiffness: 0.06, damping: 0.08 });
    group.balloons.push(b);
  });
  group.weight = (plank.mass + c.mass + group.balloons.reduce((s, b) => s + b.mass, 0)) * 0.001;
  return group;
}
function makeCoon(c) {
  const body = Bodies.circle(c.x, c.y, c.r, { density: 0.0025, friction: 0.7, restitution: 0.15, label: 'coon' });
  const hp = c.boss ? 320 : c.helmet ? 75 : 30;   // a colander helmet makes them much tougher
  body.game = { kind: 'coon', r: c.r, boss: c.boss, helmet: c.helmet, hp, maxHp: hp, blink: Math.random() * 200 };
  return body;
}
function makeLoot(l) {
  const body = l.kind === 'fish'
    ? Bodies.rectangle(l.x, l.y, 36, 18, { density: 0.0015, friction: 0.6, label: 'loot' })
    : Bodies.circle(l.x, l.y, 13, { density: 0.0015, friction: 0.6, label: 'loot' });
  body.game = { kind: 'loot', type: l.kind };
  if (l.kind === 'goldfish') Body.setStatic(body, true);   // waits on its hidden perch until a cat touches it
  return body;
}
function makeCat(type, x, y, r) {
  const t = CATS[type];
  const body = Bodies.circle(x, y, r || t.r, {
    density: t.density, friction: t.friction, restitution: t.restitution, frictionAir: t.frictionAir || 0.004,
    label: 'cat', collisionFilter: { group: -1 } });   // cats never hit each other (clones!)
  body.game = { kind: 'cat', type, r: r || t.r, rest: 0, mult: 1, done: false, trail: [] };
  if (type !== 'cece') Body.setInertia(body, Infinity);   // Baby and Cleo fly posed, they don't tumble (CeCe rolls)
  return body;
}

function loadLevel(i) {
  levelIdx = i;
  newEngine();
  const lv = { blocks: [], raccoons: [], loot: [], floats: [] };
  LEVELS[i].build(lv);
  for (const list of [lv.blocks, lv.raccoons, lv.loot, lv.floats]) for (const o of list) { o.x += FORT_X; if (o.pts) o.pts = o.pts.map(([x, y]) => [x + FORT_X, y]); }
  Composite.add(engine.world, Bodies.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 3, 120, { isStatic: true, friction: 0.9, label: 'ground' }));
  for (const b of lv.blocks) Composite.add(engine.world, makeBlock(b));
  for (const c of lv.raccoons) Composite.add(engine.world, makeCoon(c));
  for (const l of lv.loot) Composite.add(engine.world, makeLoot(l));
  floats = lv.floats.map(makeFloat);
  for (const f of floats) Composite.add(engine.world, [f.plank, f.coon, ...f.balloons, ...f.balloons.map(b => b.game.rope)]);
  const xs = [...lv.raccoons, ...lv.floats].map(c => c.x);
  fortCenter = xs.reduce((s, x) => s + x, 0) / xs.length;
  queue = LEVELS[i].cats.slice();
  current = queue.shift();
  phase = 'aim'; dragging = false; pull = { x: 0, y: 0 };
  flying = []; powerUsed = false; flyTimer = 0; outTimer = 0; winTimer = -1;
  settle = 90; score = 0; stars = 0; bonus = 0; snapTimer = 0; bandSnapped = false; snapStrain = 0;
  toRemove = []; particles = []; popups = [];
  // Angry Birds style intro: start looking at the fort, then glide back to the slingshot
  panning = null; panIdle = 999; introTimer = 80;
  scheduleChatter([current, ...queue], 70);   // plotting while the camera glides back from the fort
  upBanner = { type: current, t: -(70 + (queue.length + 1) * 16 + 16) };   // then whose turn it is
  cam.x = clampCamX(fortCenter - viewW / 2); cam.y = CAM_TOP;
  state = 'play';
}

// ---------------------------------------------------------------- damage

function massFactor(o) { return o.isStatic ? 2.5 : Math.max(0.4, Math.min(3, o.mass / 4)); }

function hurt(t, o, rel) {
  const g = t.game;
  if (!g || g.dead || g.hp === undefined) return;
  let d = (rel - 2) * 7 * massFactor(o);
  if (o.game && o.game.kind === 'cat') d *= o.game.mult;
  g.hp -= d;
  if (g.hp <= 0) kill(t);
}
function kill(b) { if (b.game.dead) return; b.game.dead = true; toRemove.push(b); }

function onCollide(ev) {
  for (const p of ev.pairs) {
    const a = p.bodyA, b = p.bodyB, ga = a.game, gb = b.game;
    if (ga && ga.prancing) ga.landed = true;
    for (const [c, o] of [[ga, gb], [gb, ga]]) if (c && c.kind === 'cat' && CATS[c.type].bumpDamp && o && (o.kind === 'block' || o.kind === 'coon')) c.bump = true;
    if (gb && gb.prancing) gb.landed = true;
    if (ga && gb) {
      if (ga.kind === 'cat' && gb.kind === 'loot') { gb.collected = true; kill(b); }
      else if (gb.kind === 'cat' && ga.kind === 'loot') { ga.collected = true; kill(a); }
    }
    if (settle > 0) continue;
    const rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
    if (rel < 2) continue;
    hurt(a, b, rel); hurt(b, a, rel);
    if (rel > 3) {
      // every real impact crunches in the material of the block that got hit; a few per frame,
      // and each block at most every 6 frames, so a falling tower rumbles without turning to noise
      const v = Math.min(1, (rel - 2) / 14);
      const hit = ga && ga.kind === 'block' && !ga.dead ? ga : gb && gb.kind === 'block' && !gb.dead ? gb : null;
      if (hit) {
        if (knocksThisFrame < 4 && frame - (hit.lastKnock || -99) > 6) { hit.lastKnock = frame; knocksThisFrame++; sfx.knock(hit.mat, v); }
      } else if (frame - lastThud > 4) { lastThud = frame; sfx.thud(v); }
    }
  }
}

function addScore(n, pos, label) {
  score += n;
  popups.push({ x: pos.x, y: pos.y - 20, text: label || '+' + n, life: 70, big: n >= 5000 });
}

// ---------------------------------------------------------------- effects

function rand(a, b) { return a + Math.random() * (b - a); }
function debris(b) {
  const m = MATS[b.game.mat];
  for (let i = 0; i < 10; i++) particles.push({ type: 'chip', x: b.position.x + rand(-b.game.w / 2, b.game.w / 2) * 0.8,
    y: b.position.y + rand(-b.game.h / 2, b.game.h / 2) * 0.8, vx: rand(-4, 4), vy: rand(-6, 1),
    s: rand(5, 13), rot: rand(0, 6), vr: rand(-0.3, 0.3), color: i % 3 ? m.fill : m.edge, life: 55, max: 55 });
}
function poof(pos, n = 10, size = 1) {
  for (let i = 0; i < n; i++) particles.push({ type: 'puff', x: pos.x + rand(-15, 15) * size, y: pos.y + rand(-15, 15) * size,
    vx: rand(-2, 2), vy: rand(-2.5, 0.5), s: rand(10, 22) * size, life: 40, max: 40, color: i % 2 ? '#ffffff' : '#c9c6d6' });
}
function sparkle(pos, n = 8) {
  for (let i = 0; i < n; i++) particles.push({ type: 'star', x: pos.x, y: pos.y, vx: rand(-5, 5), vy: rand(-7, -1),
    s: rand(6, 11), rot: rand(0, 6), vr: rand(-0.2, 0.2), life: 50, max: 50, color: i % 2 ? '#ffd84a' : '#ffffff' });
}

// ---------------------------------------------------------------- actions

const launchPower = type => POWER * (CATS[type].launch || 1);
// Launch speed for a pull. CeCe's power climbs steeply with the pull (pullCurve), so a half pull
// plops her short and only a near-full pull reaches the fort.
function launchVel(type, p) {
  const t = CATS[type], d = Math.hypot(p.x, p.y) || 1;
  let k = launchPower(type);
  if (t.pullCurve) k *= Math.pow(Math.min(1, d / SNAP_PULL), t.pullCurve);
  return { x: -p.x * k, y: -p.y * k };
}

function launch() {
  const body = makeCat(current, SLING.x + pull.x, SLING.y + pull.y);
  const snapped = bandSnapped;
  if (snapped) {
    // the band couldn't take her weight: she just plops forward a little and rolls from there
    const d = Math.hypot(pull.x, pull.y) || 1;
    Body.setVelocity(body, { x: Math.max(1.5, (-pull.x / d) * 2.5 + 1), y: -3.5 });
    snapTimer = 100; bandSnapped = false;
  } else {
    Body.setVelocity(body, launchVel(current, pull));
  }
  if (current === 'cece') Body.setAngularVelocity(body, snapped ? 0.02 : -pull.x * 0.0012);   // only CeCe rolls
  Composite.add(engine.world, body);
  if (!sfx.cat(CAT_SOUNDS.launch[current], 0.7)) sfx.meow(current === 'baby' ? 1.25 : current === 'cece' ? 0.75 : 1);
  flying = [body]; current = null; phase = 'flying'; powerUsed = false; flyTimer = 0;
  pull = { x: 0, y: 0 }; launchedOnce = true; snapStrain = 0;
}

function usePower() {
  if (phase !== 'flying' || powerUsed || !flying.length) return;
  const c = flying[0], g = c.game;
  if (g.done || g.dead || flyTimer < 6) return;
  const t = CATS[g.type];
  powerUsed = true;   // one power per shot
  if (t.power === 'split') {
    for (const ang of [-0.24, 0.24]) {
      const nb = makeCat('baby', c.position.x, c.position.y);
      nb.game.clone = true;
      Body.setVelocity(nb, Vector.rotate(c.velocity, ang));
      Composite.add(engine.world, nb); flying.push(nb);
    }
    poof(c.position, 6, 0.6); sfx.pop(); sfx.cat(CAT_SOUNDS.power.baby, 0.6);
  } else if (t.power === 'shake') {
    // CeCe's signature fast head shake: whatever she's touching gets wrecked outright,
    // and a blast of fur shoves and dents everything else nearby
    g.shake = 42;
    for (const b of bodies()) {
      if (b === c || b.isStatic || !b.game || b.game.kind === 'cat' || b.game.dead || b.game.hp === undefined) continue;
      const size = b.game.r || Math.max(b.game.w || 0, b.game.h || 0) / 2 || 20;
      const touching = Matter.Query.collides(c, [b]).length > 0 || Vector.magnitude(Vector.sub(b.position, c.position)) < g.r + size * 0.6 + 8;
      if (touching) { b.game.hp = 0; kill(b); sparkle(b.position, 5); }
    }
    const R = 260;
    for (const b of bodies()) {
      if (b === c || b.isStatic || !b.game || b.game.kind === 'cat' || b.game.dead) continue;
      const d = Vector.sub(b.position, c.position), dist = Vector.magnitude(d);
      if (dist > R || dist < 0.01) continue;
      const f = 1 - dist / R;
      Sleeping.set(b, false);
      Body.setVelocity(b, Vector.add(b.velocity, Vector.mult(Vector.normalise(d), 3 + 11 * f)));
      Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.3 * f);
      if (b.game.hp !== undefined) { b.game.hp -= 45 * f; if (b.game.hp <= 0) kill(b); }
    }
    particles.push({ type: 'ring', x: c.position.x, y: c.position.y, vx: 0, vy: 0, s: R, life: 24, max: 24 });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(4, 10);
      particles.push({ type: 'fur', x: c.position.x + Math.cos(a) * g.r, y: c.position.y + Math.sin(a) * g.r,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, s: rand(7, 14), rot: a, vr: rand(-0.2, 0.2), life: 45, max: 45,
        color: ['#93826f', '#fbfaf7', '#d9984f'][i % 3] });
    }
    sfx.shake(); sfx.cat(CAT_SOUNDS.power.cece, 0.55);
  } else if (t.power === 'prance') {
    // an elegant springy leap up and forward, then two more prances off whatever she lands on
    Body.setVelocity(c, { x: Math.min(10, Math.max(6, Math.abs(c.velocity.x) * 0.6)), y: -10 });
    g.mult = 1.6; g.prancing = true; g.prance = 2; g.landCool = 8;
    sparkle(c.position, 8); sfx.prance(); sfx.cat(CAT_SOUNDS.power.cleo, 0.6);
  }
}

// Push and damage everything within R of a point (catnip crates; chain reactions happen through kill()).
function blast(center, R, push, dmg) {
  for (const b of bodies()) {
    if (b.isStatic || !b.game || b.game.kind === 'cat' || b.game.dead) continue;
    const d = Vector.sub(b.position, center), dist = Vector.magnitude(d);
    if (dist > R || dist < 0.01) continue;
    const f = 1 - dist / R;
    Sleeping.set(b, false);
    Body.setVelocity(b, Vector.add(b.velocity, Vector.mult(Vector.normalise(d), 2 + push * f)));
    Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.4 * f);
    if (b.game.hp !== undefined) { b.game.hp -= dmg * f; if (b.game.hp <= 0) kill(b); }
  }
}
function catnipBoom(pos) {
  blast(pos, 230, 14, 80);
  particles.push({ type: 'ring', x: pos.x, y: pos.y, vx: 0, vy: 0, s: 230, life: 22, max: 22 });
  for (let i = 0; i < 18; i++) particles.push({ type: 'puff', x: pos.x + rand(-20, 20), y: pos.y + rand(-20, 20),
    vx: rand(-4, 4), vy: rand(-5, 1), s: rand(14, 30), life: 45, max: 45, color: i % 3 ? '#9be08a' : '#e9ffd9' });
  sparkle(pos, 8);
  sfx.thud(1); sfx.tone('sawtooth', 160, 40, 0.4, 0.18);
}

// ---------------------------------------------------------------- simulation step

function bodies() { return Composite.allBodies(engine.world); }
function coonsAlive() { let n = 0; for (const b of bodies()) if (b.game && b.game.kind === 'coon' && !b.game.dead) n++; return n; }

function step() {
  frame++;
  for (const p of particles) {
    p.life--; p.x += p.vx; p.y += p.vy; if (p.vr) p.rot += p.vr;
    if (p.type === 'puff') { p.vx *= 0.94; p.vy *= 0.94; p.s *= 1.02; }
    else if (p.type === 'fur') { p.vx *= 0.95; p.vy = p.vy * 0.95 + 0.12; }
    else if (p.type === 'heart') p.vy *= 0.98;
    else if (p.type !== 'ring' && p.type !== 'kitten') p.vy += 0.35;
  }
  particles = particles.filter(p => p.life > 0);
  for (const p of popups) { p.life--; p.y -= 0.8; }
  if (state === 'play') {
    for (const c of chatter) {
      if (c.t > 0) { if (--c.t === 0) sfx.cat(pick(CAT_SOUNDS.chatter[c.type]), 0.5); }
      else c.life--;
    }
    chatter = chatter.filter(c => c.life > 0);
  }
  if (upBanner) {
    if (upBanner.t === 0) sfx.tone('sine', 260, 1100, 0.18, 0.06);   // whoosh
    if (++upBanner.t > BANNER_LEN) upBanner = null;
  }
  popups = popups.filter(p => p.life > 0);

  if (!engine || state === 'menu' || state === 'levels') return;
  // balloons: hover their platform near its height; once any balloon pops the rest can't hold it up
  for (const f of floats) {
    if (f.plank.game.dead) {
      // the plank is gone: cut the strings and let the helium balloons drift up and away
      if (!f.freed) { f.freed = true; for (const b of f.balloons) if (!b.game.dead) Composite.remove(engine.world, b.game.rope); }
      for (const b of f.balloons) if (!b.game.dead) Body.applyForce(b, b.position, { x: 0, y: -b.mass * engine.gravity.scale * 1.6 });
      continue;
    }
    const alive = f.balloons.filter(b => !b.game.dead);
    if (!alive.length) continue;
    if (alive.length < f.balloons.length) f.broken = true;
    const k = f.broken ? 0.35 : Math.max(0.2, Math.min(1.8, 1 + (f.plank.position.y - f.y) / 50 + f.plank.velocity.y * 0.3));
    for (const b of alive) Body.applyForce(b, b.position, { x: 0, y: -f.weight / f.balloons.length * k });
    if (!f.broken) Body.setAngularVelocity(f.plank, f.plank.angularVelocity * 0.8 - f.plank.angle * 0.06);   // keep the plank level
  }
  Engine.update(engine, STEP);
  if (settle > 0) settle--;
  if (snapTimer > 0) snapTimer--;
  knocksThisFrame = 0;
  if (state === 'play' && phase === 'aim' && dragging && current === 'cece' && !bandSnapped && Math.hypot(pull.x, pull.y) > SNAP_PULL) {
    if (snapStrain % 9 === 0) sfx.creak();
    if (++snapStrain >= SNAP_DELAY) snapBand();
  } else snapStrain = 0;

  for (const b of bodies()) {
    if (b.isStatic) continue;
    const g = b.game;
    if (g && g.kind === 'cat') {
      const sp = Vector.magnitude(b.velocity);
      if (sp > MAX_SPEED) Body.setVelocity(b, Vector.mult(b.velocity, MAX_SPEED / sp));
      if (g.shake > 0) g.shake--;
      if (g.prancing) {
        // stay upright and graceful; each landing springs her into the next prance
        Body.setAngularVelocity(b, 0);
        Body.setAngle(b, Math.atan2(Math.sin(b.angle), Math.cos(b.angle)) * 0.85);
        if (g.landCool > 0) g.landCool--;
        else if (g.landed && g.prance > 0) {
          g.prance--; g.landCool = 10;
          Body.setVelocity(b, { x: Math.max(Math.abs(b.velocity.x), 7.5), y: -9.5 });
          sparkle(b.position, 6); sfx.prance();
        }
        g.landed = false;
      }
      // rolling resistance on the floor, so a weak (snapped) roll peters out short of the fort
      if (b.position.y > GROUND - g.r - 3) Body.setVelocity(b, { x: b.velocity.x * (CATS[g.type].rollDrag || 0.99), y: b.velocity.y });
      // CeCe is heavy but soft: everything she hits soaks up some of her speed, so she can't bulldoze a whole level
      if (g.bump) { Body.setVelocity(b, Vector.mult(b.velocity, CATS[g.type].bumpDamp)); g.bump = false; }
      if (frame % 2 === 0) { g.trail.push({ x: b.position.x, y: b.position.y }); if (g.trail.length > 40) g.trail.shift(); }
    }
    if (b.position.y > H + 300 || (g && g.kind === 'balloon' && b.position.y < -600) || b.position.x < -300 || b.position.x > WORLD_W + 300) {
      if (g && g.kind === 'coon') kill(b);
      else if (g && g.kind === 'cat') g.done = true;
      else Composite.remove(engine.world, b);
    }
  }

  if (toRemove.length) {
    // (explosions can add more to toRemove while this runs; for...of picks those up too)
    for (const b of toRemove) {
      Composite.remove(engine.world, b);
      const g = b.game;
      if (g.kind === 'block' && MATS[g.mat].explodes) { addScore(MATS[g.mat].points, b.position, 'KABOOM!'); catnipBoom(b.position); }
      else if (g.kind === 'block' && g.mat === 'decoy') { addScore(3000, b.position, 'It was a cardboard decoy!'); debris(b); sfx.crumble('decoy'); }
      else if (g.kind === 'balloon') { Composite.remove(engine.world, g.rope); addScore(200, b.position, 'POP!'); poof(b.position, 5, 0.5); sfx.tone('square', 900, 200, 0.08, 0.12); }
      else if (g.kind === 'block') { addScore(MATS[g.mat].points, b.position); debris(b); sfx.crumble(g.mat); }
      else if (g.kind === 'coon') { addScore(g.boss ? 20000 : 5000, b.position); poof(b.position, g.boss ? 18 : 10, g.boss ? 1.6 : 1); sparkle(b.position, 6); sfx.pop(); }
      else if (g.kind === 'loot' && g.collected && g.type === 'goldfish') {
        addScore(10000, b.position, 'GOLDEN FISH! +10000'); sparkle(b.position, 24); sfx.ding(); sfx.ding();
        goldenFound[levelIdx] = true; saveGolden();
      }
      else if (g.kind === 'loot' && g.collected) { addScore(1000, b.position, g.type === 'fish' ? 'Treat saved! +1000' : 'Yarn saved! +1000'); sparkle(b.position, 10); sfx.ding(); }
      else if (g.kind === 'block' && g.mat === 'cage') {
        // the kitten inside is free: hearts, a happy mew, and she scampers off home
        addScore(3000, b.position, 'Kitten rescued! +3000'); debris(b); sfx.crumble('glass'); sfx.cat(pick(CAT_SOUNDS.chatter.baby), 0.6, 0.15);
        for (let i = 0; i < 8; i++) particles.push({ type: 'heart', x: b.position.x + rand(-20, 20), y: b.position.y - 10, vx: rand(-1.5, 1.5), vy: rand(-3, -1.5), s: rand(9, 15), life: 60, max: 60 });
        particles.push({ type: 'kitten', x: b.position.x, y: GROUND - 22, vx: -7, vy: 0, s: 22, life: 160, max: 160 });
      }
    }
    toRemove.length = 0;
    // a removed block can leave sleeping bodies floating in mid-air
    for (const b of bodies()) if (b.isSleeping) Sleeping.set(b, false);
  }

  if (state === 'play') updatePhase();
  updateCamera();
}

function updatePhase() {
  if (winTimer < 0 && settle === 0 && coonsAlive() === 0) winTimer = 80;
  if (winTimer > 0) { if (--winTimer === 0) finishWin(); return; }

  if (phase === 'flying') {
    flyTimer++;
    let allDone = true;
    for (const c of flying) {
      const g = c.game;
      if (g.done) continue;
      g.rest = Vector.magnitude(c.velocity) < 0.4 ? g.rest + 1 : 0;
      if (g.rest > 50 || flyTimer > 60 * 10) g.done = true; else allDone = false;
    }
    if (allDone) {
      for (const c of flying) { if (c.position.y < H + 200) poof(c.position, 6, c.game.r / 26); Composite.remove(engine.world, c); }
      flying = [];
      if (queue.length) { current = queue.shift(); phase = 'aim'; panIdle = 999; upBanner = { type: current, t: 0 }; chatter = [{ type: current, who: 0, t: 8, life: CHATTER_LIFE, sym: '!' }]; }
      else { phase = 'out'; outTimer = 150; }
    }
  } else if (phase === 'out') {
    if (--outTimer <= 0) { state = 'lost'; sfx.lose(); music.duck(2.6); sfx.cat(CAT_SOUNDS.lose, 0.6, 2.2); }
  }
}

function finishWin() {
  const unused = queue.length + (current && phase === 'aim' ? 1 : 0);
  bonus = unused * 10000;
  score += bonus;
  stars = unused >= 2 ? 3 : unused === 1 ? 2 : 1;
  bestStars[levelIdx] = Math.max(bestStars[levelIdx] || 0, stars);
  saveStars();
  state = 'won';
  sfx.win(); music.duck(3.2); sfx.cat(CAT_SOUNDS.win, 0.55, 2.6);
}

// ---------------------------------------------------------------- camera

function clampCamX(x) { return Math.max(0, Math.min(Math.max(0, WORLD_W - viewW), x)); }

function updateCamera() {
  let tx = null, ty = CAM_TOP;
  if (state === 'play' && phase === 'flying') {
    // follow the cat that's furthest along
    let lead = null;
    for (const c of flying) if (!c.game.done && (!lead || c.position.x > lead.position.x)) lead = c;
    if (lead) { tx = lead.position.x - viewW * 0.4; ty = Math.max(-300, Math.min(CAM_TOP, lead.position.y - VIEW_H * 0.3)); }
  } else if (state === 'play' && phase === 'aim') {
    if (panning) tx = null;
    else if (introTimer > 0) { introTimer--; tx = fortCenter - viewW / 2; }
    else if (panIdle < 100) { panIdle++; tx = null; }   // let her look at the fort for a moment after panning
    else tx = 0;
  }
  if (tx !== null) cam.x += (clampCamX(tx) - cam.x) * (introTimer > 0 ? 0.2 : 0.07);
  cam.y += (ty - cam.y) * 0.08;
  cam.x = clampCamX(cam.x);
}

// ---------------------------------------------------------------- input

function screenPx(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
}
function toUI(e) { const p = screenPx(e); return { x: p.x / uiScale, y: p.y / uiScale - uiOffY }; }
function toWorld(e) { const p = screenPx(e); return { x: p.x / worldScale + cam.x, y: p.y / worldScale + cam.y }; }

function updatePull(p) {
  let dx = p.x - SLING.x, dy = p.y - SLING.y;
  const d = Math.hypot(dx, dy);
  if (d > MAX_PULL) { dx *= MAX_PULL / d; dy *= MAX_PULL / d; }
  const r = CATS[current].r;
  if (SLING.y + dy > GROUND - r) dy = GROUND - r - SLING.y;
  pull = { x: dx, y: dy };
}
// Over the limit with CeCe, the slingshot shakes and creaks for SNAP_DELAY frames before it gives way
// (see step()); easing off in that window saves it. Once it snaps it stays snapped: letting go just plops her out.
function snapBand() {
  bandSnapped = true; snapTimer = 100; snapStrain = 0;
  popups.push({ x: SLING.x, y: SLING.y - 110, text: 'SNAP! She\'s too heavy!', life: 90, big: true });
  sparkle({ x: SLING.x, y: SLING.y - 5 }, 8);
  sfx.snap(); sfx.cat(CAT_SOUNDS.snap, 0.7, 0.12);
}

const inButton = (u, b) => Math.abs(u.x - b.x) <= b.w / 2 && Math.abs(u.y - b.y) <= b.h / 2;
// Phones only allow full screen (and starting audio) when the finger lifts, not when it touches down,
// so buttons marked onLift fire on pointerup.
let liftButton = null;
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  sfx.init();
  const u = toUI(e);
  for (let i = uiButtons.length - 1; i >= 0; i--) {
    const b = uiButtons[i];
    if (inButton(u, b)) { if (b.onLift) liftButton = b; else b.action(); return; }
  }
  if (state !== 'play') return;
  const p = toWorld(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (phase === 'aim' && current && introTimer === 0 && Math.hypot(p.x - SLING.x - pull.x, p.y - SLING.y - pull.y) < 110) {
    dragging = true;
    if (upBanner && upBanner.t < 0) upBanner.t = 0;   // never shoot before it says who is up
    updatePull(p);
    return;
  }
  if (phase === 'flying') { usePower(); return; }
  // anywhere else: drag the background to look around
  introTimer = 0;
  panning = { sx: e.clientX, cx: cam.x };
});
canvas.addEventListener('pointermove', e => {
  if (dragging) updatePull(toWorld(e));
  else if (panning) { cam.x = clampCamX(panning.cx - (e.clientX - panning.sx) * dpr / worldScale); panIdle = 0; }
});
function release() {
  if (panning) { panning = null; return; }
  if (!dragging) return;
  dragging = false;
  if (bandSnapped || Math.hypot(pull.x, pull.y) > 25) launch(); else pull = { x: 0, y: 0 };
}
canvas.addEventListener('pointerup', e => {
  sfx.init();   // a lifted finger is what unlocks sound on phones
  if (liftButton) { const b = liftButton; liftButton = null; if (inButton(toUI(e), b)) b.action(); return; }
  release();
});
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.key === 'r' && (state === 'play' || state === 'won' || state === 'lost')) loadLevel(levelIdx);
  if (e.key === ' ' && state === 'play') usePower();
});

// ---------------------------------------------------------------- drawing helpers

function text(str, x, y, size, fill, o = {}) {
  ctx.font = `${o.weight || 700} ${size}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.strokeW || size * 0.2; ctx.strokeStyle = o.stroke; ctx.strokeText(str, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function starShape(x, y, R, fill, edge) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? R * 0.45 : R;
    ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (edge) { ctx.lineWidth = R * 0.12; ctx.strokeStyle = edge; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function button(label, x, y, w, h, color, action) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x - w / 2, y - h / 2 + 6, w, h, 18); ctx.fill();
  ctx.fillStyle = color; rr(x - w / 2, y - h / 2, w, h, 18); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
  text(label, x, y + 2, h * 0.42, '#fff', { stroke: 'rgba(0,0,0,0.25)', strokeW: 5 });
  uiButtons.push({ x: x + uiShift, y, w, h, action });
}
function iconButton(kind, x, y, action) {
  const r = 34;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x, y + 4, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#c9a77a'; ctx.stroke();
  ctx.strokeStyle = '#5b3a1e'; ctx.fillStyle = '#5b3a1e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  if (kind === 'restart') {
    ctx.beginPath(); ctx.arc(x, y, 13, -0.3, Math.PI * 1.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 15, y - 14); ctx.lineTo(x + 15, y - 1); ctx.lineTo(x + 3, y - 5); ctx.closePath(); ctx.fill();
  } else if (kind === 'levels') {
    for (const dx of [-8, 8]) for (const dy of [-8, 8]) ctx.fillRect(x + dx - 6, y + dy - 6, 12, 12);
  } else if (kind === 'sound') {
    ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x - 7, y - 6); ctx.lineTo(x + 2, y - 14); ctx.lineTo(x + 2, y + 14);
    ctx.lineTo(x - 7, y + 6); ctx.lineTo(x - 14, y + 6); ctx.closePath(); ctx.fill();
    if (sfx.on) { ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x + 4, y, 8, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 4, y, 14, -0.8, 0.8); ctx.stroke(); }
    else { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x + 17, y + 7); ctx.moveTo(x + 17, y - 7); ctx.lineTo(x + 7, y + 7); ctx.stroke(); }
  } else if (kind === 'music') {
    // two beamed notes, crossed out when the music is off
    ctx.beginPath(); ctx.ellipse(x - 9, y + 9, 6, 4.5, -0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 9, y + 5, 6, 4.5, -0.4, 0, 7); ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.lineTo(x - 4, y - 12); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x + 14, y + 4); ctx.stroke();
    if (!music.on) { ctx.strokeStyle = '#d6303c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 18, y - 18); ctx.lineTo(x + 18, y + 18); ctx.stroke(); }
  } else if (kind === 'fullscreen') {
    // four corner brackets (pointing in when already full screen)
    const on = isFullscreen(), d = 13, k = 7;
    ctx.lineWidth = 4.5;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const cx = x + sx * d, cy = y + sy * d;
      ctx.beginPath();
      if (!on) { ctx.moveTo(cx, cy - sy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * k, cy); }
      else { ctx.moveTo(cx - sx * k, cy - sy * k * 2); ctx.lineTo(cx - sx * k, cy - sy * k); ctx.lineTo(cx - sx * k * 2, cy - sy * k); }
      ctx.stroke();
    }
  } else if (kind === 'back') {
    ctx.beginPath(); ctx.moveTo(x + 9, y - 13); ctx.lineTo(x - 7, y); ctx.lineTo(x + 9, y + 13); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  uiButtons.push({ x: x + uiShift, y, w: r * 2.3, h: r * 2.3, action });
}

// Full screen (Android Chrome): also tries to lock the phone sideways while full screen.
const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFullscreen() {
  if (isFullscreen()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => { /* not allowed here; the game still works */ });
}
function fullscreenButton(x, y) { if (canFullscreen) { iconButton('fullscreen', x, y, toggleFullscreen); uiButtons[uiButtons.length - 1].onLift = true; } }
// a plain red 'Exit' button shown while in full screen
// The Full screen / Exit buttons are a real HTML <button> laid over the canvas (#fsbtn), not canvas drawing:
// Android Chrome only reliably allows full screen from a genuine button click. These just say where it goes.
let fsSlot = null;
function exitFullscreenButton(x, y, w = 170, h = 80) {
  if (!canFullscreen || !isFullscreen()) return;
  fsSlot = { x: x + uiShift, y, w, h, label: 'Exit', color: '#d0574f' };
}
// a big, can't-miss button with the words on it; once full screen, only the small exit icon remains
function bigFullscreenButton(x, y, w, h) {
  if (!canFullscreen || isFullscreen()) return false;
  fsSlot = { x: x + uiShift, y, w, h, label: 'Full screen', color: '#3d8bd9' };
  return true;
}

function hash(n) { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- characters

// ---- the three cats, drawn from Vickie's photos ----
// Shared bits: a soft scalloped outline for long fur, fur flicks, eyes with lids, nose, whiskers.

function fluffPath(R, n, bump, seed) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * R * 0.92, y = Math.sin(a) * R * 0.92;
    if (i === 0) { ctx.moveTo(x, y); continue; }
    const am = a - Math.PI / n, q = R * (0.92 + bump + 0.06 * hash(i * 3.1 + seed));
    ctx.quadraticCurveTo(Math.cos(am) * q, Math.sin(am) * q, x, y);
  }
  ctx.closePath();
}
function furFlicks(R, count, seed, light, dark, keepClear) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const a = hash(i * 7.7 + seed) * Math.PI * 2, d = R * (0.3 + 0.62 * hash(i * 3.3 + seed));
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (keepClear(x, y)) continue;
    ctx.strokeStyle = i % 2 ? light : dark; ctx.lineWidth = R * 0.035;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * R * 0.1, y + Math.sin(a) * R * 0.1 + R * 0.03, x + Math.cos(a + 0.45) * R * 0.17, y + Math.sin(a + 0.45) * R * 0.17);
    ctx.stroke();
  }
}
// lid: 0 = wide open, ~0.5 = half closed. tilt > 0 slants the lid down toward the nose (cross / unimpressed).
function catEye(ex, ey, w, h, s, color, lid, tilt, lidColor) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(ex, ey, w, h, 0, 0, 7); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(ex - w, ey - h, w * 2, h * 2);
  ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.ellipse(ex + s * w * 0.12, ey + h * 0.1, w * 0.3, h * 0.75, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - w * 0.3, ey - h * 0.25, w * 0.22, 0, 7); ctx.fill();
  if (lid === 0) { ctx.beginPath(); ctx.arc(ex + w * 0.28, ey + h * 0.35, w * 0.11, 0, 7); ctx.fill(); }   // extra sparkle for bright eyes
  if (lid > 0) {
    // upper lid in fur colour, with its lower edge slanted
    const yl = ey - h + lid * h * 2, inner = -s * w * 1.2, outer = s * w * 1.2;
    ctx.fillStyle = lidColor;
    ctx.beginPath(); ctx.moveTo(ex + outer, ey - h - 2); ctx.lineTo(ex + inner, ey - h - 2);
    ctx.lineTo(ex + inner, yl + tilt * h); ctx.lineTo(ex + outer, yl - tilt * h * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,25,0.8)'; ctx.lineWidth = h * 0.18;
    ctx.beginPath(); ctx.moveTo(ex + inner, yl + tilt * h); ctx.lineTo(ex + outer, yl - tilt * h * 0.6); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(40,30,25,0.55)'; ctx.lineWidth = h * 0.12;
  ctx.beginPath(); ctx.ellipse(ex, ey, w, h, 0, 0, 7); ctx.stroke();
}
function catNoseMouth(R, ny, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-R * 0.08, ny); ctx.lineTo(R * 0.08, ny); ctx.lineTo(0, ny + R * 0.09); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a4040'; ctx.lineWidth = R * 0.03; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, ny + R * 0.09); ctx.lineTo(0, ny + R * 0.15);
  ctx.moveTo(0, ny + R * 0.15); ctx.quadraticCurveTo(-R * 0.08, ny + R * 0.23, -R * 0.16, ny + R * 0.17);
  ctx.moveTo(0, ny + R * 0.15); ctx.quadraticCurveTo(R * 0.08, ny + R * 0.23, R * 0.16, ny + R * 0.17); ctx.stroke();
}
function whiskers(R, y, len, color) {
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, R * 0.022); ctx.lineCap = 'round';
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    ctx.beginPath(); ctx.moveTo(s * R * 0.25, y + k * R * 0.05);
    ctx.quadraticCurveTo(s * R * 0.7, y - R * 0.07 + k * R * 0.1, s * R * len, y - R * 0.1 + k * R * 0.16); ctx.stroke();
  }
}
function ear(R, s, base1, tip, base2, fur, inner, tufts) {
  ctx.fillStyle = fur; ctx.strokeStyle = 'rgba(60,50,45,0.45)'; ctx.lineWidth = R * 0.03; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(s * base1[0] * R, base1[1] * R); ctx.lineTo(s * tip[0] * R, tip[1] * R); ctx.lineTo(s * base2[0] * R, base2[1] * R); ctx.closePath(); ctx.fill(); ctx.stroke();
  // inner ear: the same triangle shrunk toward its middle, leaving a rim of fur
  const cx = (base1[0] + tip[0] + base2[0]) / 3, cy = (base1[1] + tip[1] + base2[1]) / 3 + 0.04;
  const p = v => [s * (cx + (v[0] - cx) * 0.58) * R, (cy + (v[1] - cy) * 0.58) * R];
  ctx.fillStyle = inner;
  ctx.beginPath(); ctx.moveTo(...p(base1)); ctx.lineTo(...p(tip)); ctx.lineTo(...p(base2));
  ctx.closePath(); ctx.fill();
  if (tufts) {
    ctx.strokeStyle = tufts; ctx.lineWidth = R * 0.035; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const k of [0, 1, 2]) {
      const bx = (base2[0] + (tip[0] - base2[0]) * 0.25 + k * 0.05) * R, by = (base2[1] * 0.85 + tip[1] * 0.15) * R;
      ctx.moveTo(s * bx, by); ctx.lineTo(s * (bx + 0.06 * R), by - R * 0.24);
    }
    ctx.stroke();
  }
}

// CeCe: huge long-haired calico tabby. Brown-grey tabby with black stripes, ginger patches,
// a big white bib and a white blaze down her nose, green-gold eyes, permanently unimpressed.
function drawCeCe(R, t, opts) {
  ear(R, -1, [0.8, -0.4], [0.62, -1.18], [0.16, -0.8], '#d9984f', '#f1b9a8', null);
  ear(R, 1, [0.8, -0.4], [0.62, -1.18], [0.16, -0.8], t.body, '#f1b9a8', null);
  ctx.strokeStyle = '#5a4a3c'; ctx.lineWidth = R * 0.035; ctx.lineCap = 'round';   // small lynx tips
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * R * 0.62, -R * 1.16); ctx.lineTo(s * R * 0.65, -R * 1.3); ctx.moveTo(s * R * 0.62, -R * 1.16); ctx.lineTo(s * R * 0.57, -R * 1.27); ctx.stroke(); }

  fluffPath(R, 24, 0.2, 0);
  const gr = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R * 1.1);
  gr.addColorStop(0, '#b2a08b'); gr.addColorStop(0.6, t.body); gr.addColorStop(1, '#6a5b4d');
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,40,0.4)'; ctx.lineWidth = R * 0.03; ctx.stroke();

  ctx.save(); fluffPath(R, 24, 0.2, 0); ctx.clip();
  // ginger calico patches
  ctx.fillStyle = t.patch;
  for (const [x, y, rx, ry, a] of [[-0.58, -0.02, 0.36, 0.28, 0.3], [0.42, -0.5, 0.26, 0.18, -0.4], [0.78, 0.35, 0.3, 0.26, 0.5], [-0.85, 0.55, 0.22, 0.2, 0]]) {
    ctx.beginPath(); ctx.ellipse(x * R, y * R, rx * R, ry * R, a, 0, 7); ctx.fill();
  }
  // black tabby stripes curving round the sides and across the forehead
  ctx.strokeStyle = 'rgba(45,36,30,0.75)'; ctx.lineWidth = R * 0.075; ctx.lineCap = 'round';
  for (const s of [-1, 1]) for (const k of [0, 1, 2]) {
    const y0 = -R * 0.15 + k * R * 0.28;
    ctx.beginPath(); ctx.moveTo(s * R * 1.05, y0); ctx.quadraticCurveTo(s * R * 0.82, y0 + R * 0.08, s * R * 0.7, y0 + R * 0.2); ctx.stroke();
  }
  ctx.lineWidth = R * 0.035; ctx.strokeStyle = 'rgba(45,36,30,0.55)';
  for (const dx of [-0.2, -0.07, 0.07, 0.2]) { ctx.beginPath(); ctx.moveTo(dx * R, -R * 0.92); ctx.lineTo(dx * R * 0.8, -R * 0.52); ctx.stroke(); }
  ctx.restore();
  furFlicks(R, 40, 0, 'rgba(255,245,230,0.35)', 'rgba(40,32,26,0.35)',
    (x, y) => (y > R * 0.05 && Math.abs(x) < R * 0.6) || (y > -R * 0.35 && y < R * 0.05 && Math.abs(x) < R * 0.5));

  // white blaze down the nose
  ctx.fillStyle = t.belly;
  ctx.beginPath(); ctx.moveTo(-R * 0.03, -R * 0.42);
  ctx.quadraticCurveTo(-R * 0.06, -R * 0.1, -R * 0.14, R * 0.12); ctx.lineTo(R * 0.14, R * 0.12);
  ctx.quadraticCurveTo(R * 0.06, -R * 0.1, R * 0.03, -R * 0.42); ctx.closePath(); ctx.fill();
  // big white bib
  ctx.beginPath(); ctx.moveTo(-R * 0.5, R * 0.18);
  const bumps = 7;
  for (let i = 1; i <= bumps; i++) {
    const a1 = Math.PI * (1 - i / bumps), am = Math.PI * (1 - (i - 0.5) / bumps);
    ctx.quadraticCurveTo(Math.cos(am) * R * 0.66, R * 0.18 + Math.sin(am) * R * 0.9, Math.cos(a1) * R * 0.5, R * 0.18 + Math.sin(a1) * R * 0.74);
  }
  ctx.quadraticCurveTo(R * 0.25, R * 0.02, 0, R * 0.1); ctx.quadraticCurveTo(-R * 0.25, R * 0.02, -R * 0.5, R * 0.18);
  ctx.fill();
  // cheek ruffs: ginger on her left, white on her right, poking out past the outline
  for (const s of [-1, 1]) {
    ctx.fillStyle = s < 0 ? '#e2a865' : t.belly;
    ctx.beginPath(); ctx.moveTo(s * R * 0.32, R * 0.0);
    ctx.quadraticCurveTo(s * R * 0.8, R * 0.0, s * R * 1.04, R * 0.2);
    ctx.quadraticCurveTo(s * R * 0.86, R * 0.27, s * R * 1.0, R * 0.42);
    ctx.quadraticCurveTo(s * R * 0.8, R * 0.46, s * R * 0.88, R * 0.62);
    ctx.quadraticCurveTo(s * R * 0.6, R * 0.56, s * R * 0.32, R * 0.4);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = t.belly;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * R * 0.12, R * 0.24, R * 0.14, 0, 7); ctx.fill(); }

  // that look: half-closed green-gold eyes, lids slanted (crosser when not calm)
  for (const s of [-1, 1]) catEye(s * R * 0.3, -R * 0.13, R * 0.15 * (opts.bright ? 1.22 : 1), R * 0.15 * (opts.bright ? 1.3 : 1), s, t.eye, opts.bright ? 0 : opts.calm ? 0.42 : 0.5, opts.calm ? 0.1 : 0.45, s < 0 ? '#c98a4a' : t.body);
  catNoseMouth(R, R * 0.1, '#e7a3a6');
  whiskers(R, R * 0.22, 1.12, 'rgba(255,255,255,0.9)');
}

// Baby: small, slim and all greys: soft blue-grey with a paler stripe down her face and paler cheeks,
// darker tabby lines, white chin, big ears.
function drawBaby(r, t, opts) {
  for (const s of [-1, 1]) ear(r, s, [0.95, -0.2], [0.8, -1.38], [0.12, -0.84], t.body, '#d9cfd2', null);

  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
  const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
  gr.addColorStop(0, '#bdbcc2'); gr.addColorStop(1, t.body);
  ctx.fillStyle = gr; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
  ctx.fillStyle = t.patch;
  ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.13, r * 0.55, 0, 0, 7); ctx.fill();          // peach stripe down the face
  ctx.beginPath(); ctx.ellipse(-r * 0.55, r * 0.1, r * 0.33, r * 0.26, 0.3, 0, 7); ctx.fill();  // cheeks
  ctx.beginPath(); ctx.ellipse(r * 0.52, r * 0.14, r * 0.28, r * 0.22, -0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(85,84,92,0.6)'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  for (const dx of [-0.32, -0.18, 0.18, 0.32]) { ctx.beginPath(); ctx.moveTo(dx * r, -r * 0.98); ctx.lineTo(dx * r * 0.85, -r * 0.62); ctx.stroke(); }
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 1.0, -r * 0.1); ctx.lineTo(s * r * 0.78, -r * 0.04); ctx.stroke(); }
  ctx.fillStyle = t.belly; ctx.beginPath(); ctx.ellipse(0, r * 0.52, r * 0.42, r * 0.3, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, r * 0.9, r * 0.5, r * 0.25, 0, 0, 7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = t.dark; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();

  for (const s of [-1, 1]) catEye(s * r * 0.34, -r * 0.08, r * 0.19 * (opts.bright ? 1.15 : 1), r * 0.2 * (opts.bright ? 1.2 : 1), s, t.eye, opts.bright ? 0 : opts.calm ? 0.3 : 0.38, opts.calm ? 0.05 : 0.5, t.body);
  catNoseMouth(r, r * 0.2, '#9d9aa1');
  whiskers(r, r * 0.33, 1.2, 'rgba(255,255,255,0.95)');
}

// Cleo: cream-orange and white semi-longhair, pale green eyes, big white chest ruff, quietly elegant.
function drawCleo(r, t, opts) {
  for (const s of [-1, 1]) ear(r, s, [0.92, -0.3], [0.72, -1.3], [0.16, -0.86], t.patch, '#f2b6b0', null);
  fluffPath(r, 20, 0.12, 5);
  const gr = ctx.createRadialGradient(-r * 0.25, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  gr.addColorStop(0, '#f8dcb6'); gr.addColorStop(1, t.body);
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = 'rgba(170,120,70,0.45)'; ctx.lineWidth = r * 0.035; ctx.stroke();

  ctx.save(); fluffPath(r, 20, 0.12, 5); ctx.clip();
  ctx.strokeStyle = 'rgba(214,150,90,0.6)'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  for (const dx of [-0.24, -0.08, 0.08, 0.24]) { ctx.beginPath(); ctx.moveTo(dx * r, -r * 0.95); ctx.lineTo(dx * r * 0.8, -r * 0.58); ctx.stroke(); }
  // white lower face, muzzle and a thin stripe up the nose
  ctx.fillStyle = t.belly;
  ctx.beginPath(); ctx.ellipse(0, r * 0.5, r * 0.78, r * 0.55, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.3); ctx.quadraticCurveTo(-r * 0.1, 0, -r * 0.2, r * 0.15); ctx.lineTo(r * 0.2, r * 0.15); ctx.quadraticCurveTo(r * 0.1, 0, r * 0.05, -r * 0.3); ctx.closePath(); ctx.fill();
  ctx.restore();
  furFlicks(r, 22, 5, 'rgba(255,255,255,0.5)', 'rgba(200,140,80,0.35)', (x, y) => y > -r * 0.4 && Math.abs(x) < r * 0.6);
  // big white chest ruff spilling past the outline
  ctx.fillStyle = t.belly;
  ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.3);
  for (let i = 1; i <= 7; i++) {
    const a1 = Math.PI * (1 - i / 7), am = Math.PI * (1 - (i - 0.5) / 7);
    ctx.quadraticCurveTo(Math.cos(am) * r * 0.8, r * 0.3 + Math.sin(am) * r * 0.86, Math.cos(a1) * r * 0.62, r * 0.3 + Math.sin(a1) * r * 0.7);
  }
  ctx.closePath(); ctx.fill();

  for (const s of [-1, 1]) catEye(s * r * 0.32, -r * 0.1, r * 0.17 * (opts.bright ? 1.15 : 1), r * 0.18 * (opts.bright ? 1.2 : 1), s, t.eye, opts.bright ? 0 : opts.calm ? 0.25 : 0.38, opts.calm ? -0.05 : 0.25, t.body);
  catNoseMouth(r, r * 0.17, '#eba3a0');
  whiskers(r, r * 0.29, 1.18, 'rgba(255,255,255,0.95)');
}

// Flying pose for Baby and Cleo: body stretched out behind, front paws reaching forward like Superman,
// tail streaming, speed streaks, head tilted toward where she's going. Mirrors when flying left.
function drawFlyer(x, y, r, vel, type, alpha = 1) {
  const t = CATS[type], flip = vel.x < 0, ang = Math.atan2(vel.y, Math.abs(vel.x));
  const fur = type === 'cleo' ? t.patch : t.body;
  ctx.save();
  ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.rotate(ang);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  // speed streaks
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineCap = 'round';
  for (const [dy, len, w] of [[-0.45, 1.3, 4], [0.05, 1.7, 5], [0.55, 1.2, 4]]) {
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-r * 2.3, r * dy); ctx.lineTo(-r * (2.3 + len), r * dy); ctx.stroke();
  }
  // tail streaming behind, with a little wave
  const wave = Math.sin(frame * 0.45) * r * 0.18;
  ctx.strokeStyle = fur; ctx.lineWidth = r * (type === 'cleo' ? 0.42 : 0.26);
  ctx.beginPath(); ctx.moveTo(-r * 1.7, r * 0.05); ctx.quadraticCurveTo(-r * 2.25, -r * 0.3 + wave, -r * 2.75, -r * 0.05 - wave); ctx.stroke();
  // body stretched out behind the head, back legs trailing
  ctx.fillStyle = t.body;
  ctx.beginPath(); ctx.ellipse(-r * 1.0, r * 0.18, r * 0.95, r * 0.55, 0, 0, 7); ctx.fill();
  ctx.fillStyle = t.belly;
  ctx.beginPath(); ctx.ellipse(-r * 0.95, r * 0.45, r * 0.65, r * 0.25, 0, 0, 7); ctx.fill();
  ctx.fillStyle = t.body;
  for (const k of [0, 1]) { ctx.beginPath(); ctx.ellipse(-r * (1.75 + k * 0.12), r * (0.42 + k * 0.16), r * 0.32, r * 0.14, 0.15, 0, 7); ctx.fill(); }
  // front paws reaching forward
  for (const [px, py] of [[1.12, 0.28], [1.0, 0.56]]) {
    ctx.fillStyle = t.body; ctx.beginPath(); ctx.ellipse(r * px, r * py, r * 0.27, r * 0.17, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = t.belly; ctx.beginPath(); ctx.ellipse(r * (px + 0.12), r * py, r * 0.12, r * 0.12, 0, 0, 7); ctx.fill();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  // the head on top, upright-ish and leaning into the flight
  drawCat(x, y, r, (flip ? -1 : 1) * ang * 0.5, type, { alpha });
}

function drawCat(x, y, r, ang, type, opts = {}) {
  opts = { bright: true, ...opts };   // bright, wide-open eyes everywhere
  const t = CATS[type];
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (type === 'cece') drawCeCe(r, t, opts);
  else if (type === 'baby') drawBaby(r, t, opts);
  else drawCleo(r, t, opts);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.restore();
}

function drawCoon(x, y, r, ang, g) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const lw = r * 0.08;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = '#9097a1'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#ece8df'; ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.62, r * 0.45, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#5d636b'; ctx.beginPath(); ctx.ellipse(0, -r * 0.5, r * 0.1, r * 0.28, 0, 0, 7); ctx.fill();
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = '#3f434a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  // burglar mask
  ctx.fillStyle = '#202228';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.36, -r * 0.04, r * 0.4, r * 0.24, s * 0.15, 0, 7); ctx.fill(); }
  ctx.fillRect(-r * 0.2, -r * 0.14, r * 0.4, r * 0.16);
  // shifty eyes, looking toward the slingshot
  const hurtBad = g && g.hp < g.maxHp * 0.5;
  const blink = g && (frame + g.blink) % 220 < 7;
  for (const s of [-1, 1]) {
    const ex = s * r * 0.34, ey = -r * 0.05;
    if (blink) { ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(ex - r * 0.12, ey); ctx.lineTo(ex + r * 0.12, ey); ctx.stroke(); continue; }
    if (hurtBad && s === 1) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - r * 0.1, ey - r * 0.1); ctx.lineTo(ex + r * 0.1, ey + r * 0.1); ctx.moveTo(ex + r * 0.1, ey - r * 0.1); ctx.lineTo(ex - r * 0.1, ey + r * 0.1); ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex - r * 0.05, ey + r * 0.01, r * 0.07, 0, 7); ctx.fill();
  }
  // nose + smirk
  ctx.fillStyle = '#16171b'; ctx.beginPath(); ctx.ellipse(0, r * 0.22, r * 0.13, r * 0.09, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2b30'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.45); ctx.quadraticCurveTo(r * 0.02, r * 0.55, r * 0.26, r * 0.36); ctx.stroke();
  if (g && g.boss) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(-r * 0.02, r * 0.47, r * 0.1, r * 0.1); }
  // hat: beanie for the crew, top hat for the boss, a kitchen colander for the tough ones
  if (g && g.helmet) {
    ctx.fillStyle = '#c3cad3'; ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.86, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7f8792'; ctx.lineWidth = r * 0.05; ctx.stroke();
    ctx.fillStyle = '#7f8792';
    for (const [hx, hy] of [[-0.45, -0.6], [-0.15, -0.8], [0.15, -0.8], [0.45, -0.6], [-0.3, -0.45], [0, -0.55], [0.3, -0.45]]) { ctx.beginPath(); ctx.arc(hx * r, hy * r, r * 0.05, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#9aa2ad'; ctx.fillRect(r * 0.8, -r * 0.42, r * 0.38, r * 0.1);   // handle
  } else if (g && g.boss) {
    ctx.fillStyle = '#16171b';
    ctx.fillRect(-r * 0.8, -r * 0.92, r * 1.6, r * 0.16);
    ctx.fillRect(-r * 0.48, -r * 1.65, r * 0.96, r * 0.76);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-r * 0.48, -r * 1.08, r * 0.96, r * 0.13);
  } else {
    ctx.fillStyle = '#1d1f26';
    ctx.beginPath(); ctx.arc(0, -r * 0.32, r * 0.8, Math.PI * 1.06, Math.PI * 1.94); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-r * 0.78, -r * 0.5, r * 1.56, r * 0.14);
    ctx.fillStyle = '#1d1f26'; ctx.beginPath(); ctx.arc(0, -r * 1.12, r * 0.13, 0, 7); ctx.fill();
  }
  // ears poke out through the hat
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#7b808a'; ctx.beginPath(); ctx.arc(s * r * 0.72, -r * 0.7, r * 0.26, 0, 7); ctx.fill();
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#3f434a'; ctx.stroke();
    ctx.fillStyle = '#2b2d33'; ctx.beginPath(); ctx.arc(s * r * 0.72, -r * 0.7, r * 0.13, 0, 7); ctx.fill();
  }
  if (hurtBad) {
    ctx.save(); ctx.translate(-r * 0.45, r * 0.05); ctx.rotate(-0.6);
    ctx.fillStyle = '#f2d2a9'; rr(-r * 0.28, -r * 0.08, r * 0.56, r * 0.16, r * 0.05); ctx.fill();
    ctx.restore();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  if (g && g.boss && g.hp < g.maxHp) {
    const w = 100, f = Math.max(0, g.hp / g.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(x - w / 2 - 3, y - r - 56, w + 6, 14, 7); ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#6cd46c' : f > 0.25 ? '#ffcc33' : '#ff5a4a'; rr(x - w / 2, y - r - 53, w * f, 8, 4); ctx.fill();
  }
}

function drawBlock(b) {
  const g = b.game, m = MATS[g.mat], w = g.w, h = g.h;
  if (g.poly) {
    // cardboard slide
    ctx.beginPath(); b.vertices.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath();
    ctx.fillStyle = m.fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = m.edge; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(160,120,70,0.35)'; ctx.lineWidth = 3;
    for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.moveTo(b.bounds.min.x + k * 30, b.bounds.max.y); ctx.lineTo(b.bounds.min.x + k * 30 - 200, b.bounds.min.y); ctx.stroke(); }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
  if (g.ball) {
    // giant ball of yarn: wraps turn with it as it rolls
    const r = g.r;
    ctx.fillStyle = m.fill; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = m.edge; ctx.lineWidth = r * 0.07;
    for (const [a, sx] of [[0.3, 1], [1.2, 0.8], [2.2, 0.9], [-0.7, 0.6]]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, r * sx, r * 0.35, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = m.edge; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.7); ctx.quadraticCurveTo(r * 1.3, r * 0.8, r * 1.1, r * 1.3); ctx.stroke();
    ctx.restore();
    return;
  }
  if (g.mat === 'decoy') {
    // cardboard cut-out of the boss on a little easel stand
    ctx.fillStyle = '#9a7a50'; ctx.fillRect(-4, 10, 8, h / 2 - 10); ctx.fillRect(-24, h / 2 - 6, 48, 6);
    ctx.fillStyle = m.fill; ctx.beginPath(); ctx.arc(0, -12, 52, 0, 7); ctx.fill();
    ctx.strokeStyle = m.edge; ctx.lineWidth = 3; ctx.stroke();
    drawCoon(0, -12, 46, 0, { hp: 1, maxHp: 1, blink: 0, boss: true });
    ctx.fillStyle = 'rgba(217,185,140,0.35)'; ctx.beginPath(); ctx.arc(0, -12, 52, 0, 7); ctx.fill();   // printed-on-card look
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(28, -64, 26, 10);                              // bit of tape
    ctx.restore();
    return;
  }
  ctx.fillStyle = g.mat === 'book' ? ['#e98f8f', '#8ec9e6', '#f6d27a', '#9fd3a8', '#c7a6e6'][Math.floor(g.seed) % 5] : m.fill;
  rr(-w / 2, -h / 2, w, h, 3); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = m.edge; ctx.stroke();
  if (g.mat === 'book') {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const y of [-h * 0.32, h * 0.28]) ctx.fillRect(-w / 2 + 3, y, w - 6, 5);
  } else if (g.mat === 'catnip') {
    ctx.strokeStyle = 'rgba(40,90,40,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.moveTo(w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2); ctx.stroke();
    ctx.fillStyle = '#2f7a2c'; ctx.beginPath(); ctx.ellipse(0, -3, 7, 12, 0.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2f7a2c'; ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-6, 14); ctx.stroke();
    text('CATNIP', 0, h / 2 - 8, 9, '#ffffff');
  } else if (g.mat === 'cage') {
    // a kitten peeking out from behind bars
    drawCat(0, h * 0.08, Math.min(w, h) * 0.3, 0, 'baby');
    ctx.strokeStyle = '#6f7684'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * w / 5.2, -h / 2 + 4); ctx.lineTo(k * w / 5.2, h / 2 - 4); ctx.stroke(); }
    ctx.lineCap = 'butt'; ctx.fillStyle = '#6f7684'; ctx.fillRect(-w / 2, -h / 2, w, 7); ctx.fillRect(-w / 2, h / 2 - 7, w, 7);
    ctx.fillStyle = '#e5b33a'; ctx.beginPath(); ctx.arc(w * 0.3, h * 0.12, 7, 0, 7); ctx.fill();   // padlock
  } else if (g.mat === 'shelf') {
    ctx.fillStyle = m.edge;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (w / 2 - 14), h / 2); ctx.lineTo(s * (w / 2 - 14), h / 2 + 34); ctx.lineTo(s * (w / 2 - 44), h / 2); ctx.closePath(); ctx.fill(); }
  }
  if (g.mat === 'wood') {
    ctx.strokeStyle = 'rgba(110,60,25,0.45)'; ctx.lineWidth = 1.5;
    for (const k of [-0.22, 0.18]) {
      ctx.beginPath();
      if (w >= h) { ctx.moveTo(-w / 2 + 6, k * h); ctx.quadraticCurveTo(0, k * h + 3, w / 2 - 6, k * h); }
      else { ctx.moveTo(k * w, -h / 2 + 6); ctx.quadraticCurveTo(k * w + 3, 0, k * w, h / 2 - 6); }
      ctx.stroke();
    }
  } else if (g.mat === 'glass') {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (w >= h) { ctx.moveTo(-w / 2 + 8, h / 2 - 5); ctx.lineTo(-w / 2 + 18, -h / 2 + 5); }
    else { ctx.moveTo(-w / 2 + 5, -h / 2 + 18); ctx.lineTo(w / 2 - 5, -h / 2 + 8); }
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(70,74,82,0.45)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc((hash(g.seed + i) - 0.5) * (w - 8), (hash(g.seed + i * 7) - 0.5) * (h - 8), 1.5 + hash(g.seed + i * 3) * 2, 0, 7); ctx.fill(); }
  }
  const dmg = 1 - g.hp / g.maxHp;
  if (dmg > 0.35) {
    ctx.strokeStyle = g.mat === 'glass' ? 'rgba(255,255,255,0.9)' : 'rgba(40,25,15,0.7)'; ctx.lineWidth = 1.6;
    const cracks = dmg > 0.65 ? 2 : 1;
    for (let c = 0; c < cracks; c++) {
      ctx.beginPath();
      const long = Math.max(w, h), along = w >= h;
      let p = -long / 2 + 4 + hash(g.seed + c * 11) * long * 0.3;
      ctx.moveTo(along ? p : -w / 2, along ? -h / 2 : p);
      for (let k = 1; k <= 4; k++) {
        p += long * 0.08;
        const side = (k / 4 - 0.5) * (along ? h : w), jig = (k % 2 ? 1 : -1) * 4;
        ctx.lineTo(along ? p + jig : side, along ? side : p + jig);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLoot(b) {
  ctx.save();
  ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
  const glow = 0.5 + 0.5 * Math.sin(frame * 0.08);
  ctx.shadowColor = `rgba(255,230,120,${0.5 + glow * 0.4})`; ctx.shadowBlur = 14;
  if (b.game.type === 'goldfish') {
    ctx.shadowColor = 'rgba(255,215,60,0.95)'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffcf33';
    ctx.beginPath(); ctx.ellipse(-3, 0, 17, 10, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(23, -10); ctx.lineTo(23, 10); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(-13, -2, 2.2, 0, 7); ctx.fill();
    ctx.restore();
    return;
  }
  if (b.game.type === 'fish') {
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath(); ctx.ellipse(-3, 0, 14, 8, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(19, -8); ctx.lineTo(19, 8); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-11, -2, 1.8, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c63f7f'; ctx.lineWidth = 1.8;
    for (const a of [-0.6, 0, 0.6]) { ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, a + 0.8, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(10, 8); ctx.quadraticCurveTo(20, 14, 16, 22); ctx.stroke();
  }
  ctx.restore();
}

initBackdrop();   // the room behind the action lives in backdrop.js


// ---------------------------------------------------------------- the level (world space)

function drawSlingBack() {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5a3418'; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(SLING.x, GROUND); ctx.lineTo(SLING.x, 705); ctx.lineTo(SLING.x + 26, 640); ctx.stroke();
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(SLING.x, GROUND); ctx.lineTo(SLING.x, 705); ctx.lineTo(SLING.x + 26, 640); ctx.stroke();
  ctx.lineCap = 'butt';
}
function drawSlingFront() {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(SLING.x, 712); ctx.lineTo(SLING.x - 24, 642); ctx.stroke();
  ctx.strokeStyle = '#a06a35'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(SLING.x, 712); ctx.lineTo(SLING.x - 24, 642); ctx.stroke();
  ctx.lineCap = 'butt';
}
function band(x0, y0, x1, y1, strain = 0) {
  // strain 0..1 turns the band red and thin as CeCe stretches it toward snapping
  ctx.strokeStyle = strain > 0 ? `rgb(232,${Math.round(87 - 60 * strain)},${Math.round(143 - 110 * strain)})` : '#e8578f';
  ctx.lineWidth = 8 - 4 * strain; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt';
}
function snappedBands() {
  // the two broken ends dangle and swing for a moment
  const sway = Math.sin(frame * 0.25) * 10 * (Math.max(snapTimer, bandSnapped ? 60 : 0) / 100);
  ctx.strokeStyle = '#e8578f'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (const [x0, dir] of [[SLING.x + 26, 1], [SLING.x - 24, -1]]) {
    ctx.beginPath(); ctx.moveTo(x0, 646); ctx.quadraticCurveTo(x0 + dir * 8 + sway, 670, x0 + sway * 1.5, 700); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawTrajectory() {
  const v0 = launchVel(current, pull);
  let x = SLING.x + pull.x, y = SLING.y + pull.y, vx = v0.x, vy = v0.y;
  const fa = 1 - (CATS[current].frictionAir || 0.004);
  for (let i = 1; i <= 70; i++) {
    vx *= fa; vy = vy * fa + GRAV_STEP; x += vx; y += vy;
    if (y > GROUND) break;
    if (i % 4 === 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 - i / 90})`; ctx.strokeStyle = `rgba(60,70,90,${0.5 - i / 160})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6 - i / 20, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

function drawBalloon(b) {
  const x = b.position.x, y = b.position.y;
  ctx.fillStyle = b.game.color;
  ctx.beginPath(); ctx.ellipse(x, y, 22, 27, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 30); ctx.lineTo(x + 5, y + 30); ctx.lineTo(x, y + 25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - 8, y - 10, 5, 9, -0.4, 0, 7); ctx.fill();
}

function drawWorld() {
  // while it's about to snap, the whole slingshot shakes harder and harder
  const creak = snapStrain / SNAP_DELAY;
  const sj = creak > 0 ? { x: (Math.random() - 0.5) * (3 + 8 * creak), y: (Math.random() - 0.5) * (2 + 4 * creak) } : { x: 0, y: 0 };
  ctx.save(); ctx.translate(sj.x, sj.y); drawSlingBack(); ctx.restore();
  // waiting cats sit in line behind the slingshot
  // (spaced by size, so big CeCe doesn't overlap her neighbour)
  let qx = SLING.x - 45;
  queue.forEach((type, i) => {
    const r = CATS[type].r * 0.75, bob = Math.sin(frame * 0.05 + i) * 2 - chatterHop(i + 1);
    qx -= r * 1.15;
    drawCat(qx, GROUND - r + bob, r, 0, type, { calm: !chatterAt(i + 1) });
    chatterBubble(i + 1, qx + r * 0.3, GROUND - r * 2.3 + bob);
    qx -= r * 1.15 + 6;
  });

  const loaded = phase === 'aim' && current;
  const strain = loaded && current === 'cece' && !bandSnapped
    ? Math.max(0, Math.min(1, (Math.hypot(pull.x, pull.y) - SNAP_PULL * 0.75) / (SNAP_PULL * 0.25))) : 0;
  const jig = strain > 0.5 ? (Math.random() - 0.5) * (4 * strain + 10 * creak) : 0;
  const tip = { x: SLING.x + pull.x + jig, y: SLING.y + pull.y + jig };
  if (loaded && !bandSnapped) band(SLING.x + 26 + sj.x, 646 + sj.y, tip.x + 6, tip.y, strain);
  if (snapTimer > 0 || bandSnapped) snappedBands();

  const list = bodies().filter(b => b.game);
  const order = { block: 0, loot: 1, balloon: 2, coon: 3, cat: 4 };
  // balloon strings, drawn behind everything on the platform
  ctx.strokeStyle = 'rgba(80,80,90,0.7)'; ctx.lineWidth = 2;
  for (const f of floats) for (const bl of f.balloons) {
    if (bl.game.dead || f.freed) continue;
    const r = bl.game.rope, pb = Vector.add(f.plank.position, Vector.rotate(r.pointB, f.plank.angle));
    ctx.beginPath(); ctx.moveTo(bl.position.x, bl.position.y + 24); ctx.quadraticCurveTo((bl.position.x + pb.x) / 2 + 6, (bl.position.y + pb.y) / 2, pb.x, pb.y); ctx.stroke();
  }
  list.sort((a, b) => order[a.game.kind] - order[b.game.kind]);
  for (const b of list) {
    const g = b.game;
    if (g.kind === 'block') drawBlock(b);
    else if (g.kind === 'balloon') drawBalloon(b);
    else if (g.kind === 'loot') drawLoot(b);
    else if (g.kind === 'coon') drawCoon(b.position.x, b.position.y, g.r, b.angle, g);
    else if (g.kind === 'cat') {
      const posed = g.type !== 'cece' && Vector.magnitude(b.velocity) > 2.5;
      if (g.prancing || g.clone) {
        g.trail.forEach((p, i) => { ctx.globalAlpha = (i / g.trail.length) * 0.35; drawCat(p.x, p.y, g.r * 0.9, posed ? 0 : b.angle, g.type); });
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        g.trail.forEach((p, i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); } });
      }
      if (g.shake > 0) {
        // the head shake: fast side-to-side wobble with blurry ghost copies
        const amt = g.shake / 42, w = Math.sin(g.shake * 1.6) * 0.5 * amt;
        ctx.globalAlpha = 0.3;
        drawCat(b.position.x - 10 * amt, b.position.y, g.r, b.angle - w, g.type);
        drawCat(b.position.x + 10 * amt, b.position.y, g.r, b.angle + w, g.type);
        ctx.globalAlpha = 1;
        drawCat(b.position.x + w * 16, b.position.y, g.r, b.angle + w, g.type);
      } else if (posed) {
        drawFlyer(b.position.x, b.position.y, g.r, b.velocity, g.type, g.clone ? 0.75 : 1);
      } else {
        drawCat(b.position.x, b.position.y, g.r, g.type === 'cece' ? b.angle : 0, g.type, { alpha: g.clone ? 0.75 : 1 });
      }
    }
  }

  if (loaded) {
    if (dragging && !bandSnapped) drawTrajectory();
    const hop = dragging ? 0 : chatterHop(0);
    drawCat(tip.x, tip.y - hop, CATS[current].r, 0, current);
    chatterBubble(0, tip.x + CATS[current].r * 0.4, tip.y - hop - CATS[current].r * 1.75);
    if (!bandSnapped) band(SLING.x - 24 + sj.x, 646 + sj.y, tip.x - 6, tip.y, strain);
  }
  ctx.save(); ctx.translate(sj.x, sj.y); drawSlingFront(); ctx.restore();

  for (const p of particles) {
    const a = p.life / p.max;
    ctx.globalAlpha = Math.min(1, a * 1.5);
    if (p.type === 'puff') { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); }
    else if (p.type === 'ring') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10 * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - a * 0.85), 0, 7); ctx.stroke();
    } else if (p.type === 'fur') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-p.s, 0); ctx.quadraticCurveTo(0, -p.s * 0.35, p.s, 0); ctx.quadraticCurveTo(0, p.s * 0.2, -p.s, 0); ctx.fill();
      ctx.restore();
    } else if (p.type === 'chip') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    else if (p.type === 'heart') {
      ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.moveTo(p.x, p.y + p.s * 0.6);
      ctx.bezierCurveTo(p.x - p.s * 1.2, p.y - p.s * 0.3, p.x - p.s * 0.4, p.y - p.s * 1.1, p.x, p.y - p.s * 0.35);
      ctx.bezierCurveTo(p.x + p.s * 0.4, p.y - p.s * 1.1, p.x + p.s * 1.2, p.y - p.s * 0.3, p.x, p.y + p.s * 0.6); ctx.fill();
    }
    else if (p.type === 'kitten') { ctx.globalAlpha = 1; drawCat(p.x, p.y - Math.abs(Math.sin(p.life * 0.4)) * 14, p.s, Math.sin(p.life * 0.4) * 0.15, 'baby'); }
    else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); starShape(0, 0, p.s, p.color); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    text(p.text, p.x, p.y, p.big ? 28 : 20, p.big ? '#ffd84a' : '#ffffff', { stroke: '#3a2160', strokeW: 5 });
  }
  ctx.globalAlpha = 1;

  if (state === 'play' && phase === 'aim' && current && !launchedOnce && !dragging && introTimer === 0) {
    // a little hand showing the pull gesture
    const k = (Math.sin(frame * 0.05) + 1) / 2;
    const hx = SLING.x - k * 90, hy = SLING.y + 20 + k * 40;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(hx, hy, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hx, hy, 25, 0, 7); ctx.stroke();
  }
}

// ---------------------------------------------------------------- HUD + screens (UI space: 900 tall, UW wide)

function drawHUD() {
  text('Score ' + score.toLocaleString(), 36, 46, 40, '#fff', { align: 'left', stroke: '#2a1a4a', strokeW: 8 });
  text(`Level ${levelIdx + 1}: ${LEVELS[levelIdx].name}`, 36, 92, 24, '#e7dcff', { align: 'left', stroke: '#2a1a4a', strokeW: 6, weight: 500 });
  if (state === 'play') {
    if (!bigFullscreenButton(UW - 545, 56, 260, 72) && canFullscreen) {
      // in full screen: a plain 'Exit' button to leave it
      exitFullscreenButton(UW - 432, 56, 150, 72);
    }
    iconButton('music', UW - 315, 56, () => music.toggle());
    iconButton('sound', UW - 230, 56, () => { sfx.on = !sfx.on; saveAudio(); });
    iconButton('levels', UW - 145, 56, () => { state = 'levels'; });
    iconButton('restart', UW - 60, 56, () => loadLevel(levelIdx));
  }
  let hint = null;
  if (state === 'play' && phase === 'aim' && current && !dragging) {
    // the ribbon announces whose turn it is; the hint only adds advice
    hint = !launchedOnce ? 'Pull the cat back and let go!' : current === 'cece' ? 'Careful, she\'s heavy...' : null;
    if (upBanner && upBanner.t >= 0 && launchedOnce) hint = null;
    if (panIdle < 100 || panning) hint = 'Looking around...';
  } else if (state === 'play' && phase === 'aim' && dragging && current === 'cece') {
    const d = Math.hypot(pull.x, pull.y);
    hint = bandSnapped ? 'Oops! Let go and watch her plop...' : snapStrain > 0 ? "It's creaking! Ease off!" : d > SNAP_PULL * 0.85 ? 'Easy... she\'s really heavy!' : null;
  } else if (state === 'play' && phase === 'flying' && !powerUsed && flying[0] && !flying[0].game.done) {
    hint = CATS[flying[0].game.type].hint;
  }
  if (hint) {
    ctx.font = `700 54px ${FONT}`;
    const w = ctx.measureText(hint).width + 90;
    ctx.fillStyle = 'rgba(24,14,48,0.82)'; rr(UW / 2 - w / 2, 126, w, 92, 46); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    text(hint, UW / 2, 174, 54, '#ffe14d', { stroke: '#120a26', strokeW: 10 });
  }
  drawUpBanner();
}

function drawUpBanner() {
  if (!upBanner || upBanner.t < 0 || state !== 'play') return;
  const t = upBanner.t, type = upBanner.type, far = UW + 400;
  let off;
  if (t < BANNER_IN) off = -Math.pow(1 - t / BANNER_IN, 3) * far;                    // ease in from the left
  else if (t < BANNER_IN + BANNER_HOLD) off = (t - BANNER_IN) * 0.4;                 // slow drift while it holds
  else { const k = (t - BANNER_IN - BANNER_HOLD) / BANNER_OUT; off = BANNER_HOLD * 0.4 + k * k * k * far; }   // whoosh off right
  const moving = t < BANNER_IN || t >= BANNER_IN + BANNER_HOLD;
  ctx.save();
  ctx.translate(off, 0);
  // slanted ribbon with gold edges
  ctx.fillStyle = 'rgba(24,14,48,0.86)';
  ctx.beginPath(); ctx.moveTo(-60, 385); ctx.lineTo(UW + 60, 360); ctx.lineTo(UW + 60, 540); ctx.lineTo(-60, 565); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(-60, 385); ctx.lineTo(UW + 60, 360); ctx.moveTo(-60, 565); ctx.lineTo(UW + 60, 540); ctx.stroke();
  if (moving) {
    // speed lines trailing behind
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const [y, len] of [[420, 260], [465, 380], [510, 220]]) { ctx.beginPath(); ctx.moveTo(UW / 2 - 330 - len, y); ctx.lineTo(UW / 2 - 330, y); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }
  const r = type === 'cece' ? 92 : type === 'cleo' ? 74 : 68;
  drawCat(UW / 2 - 210, 462 + Math.sin(t * 0.3) * 3, r, Math.sin(t * 0.25) * 0.08, type);
  const x0 = UW / 2 - 85, st = NAME_STYLE[type];
  nameText(type, x0, 450, 118, 'left');
  ctx.font = `${st.weight} 118px ${st.font}`;
  const w = ctx.measureText(CATS[type].name).width;
  text('is up!', x0 + w + 28, 470, 62, '#ffe14d', { align: 'left', stroke: '#120a26', strokeW: 10 });
  ctx.restore();
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(10,5,25,0.55)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(x - w / 2, y - h / 2 + 10, w, h, 30); ctx.fill();
  ctx.fillStyle = '#fff6e6'; rr(x - w / 2, y - h / 2, w, h, 30); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#e8b06a'; ctx.stroke();
}

// Screens below are laid out on the 1600-wide design and centred with uiShift.
function centred(fn) {
  uiShift = (UW - W) / 2;
  ctx.save(); ctx.translate(uiShift, 0);
  fn();
  ctx.restore();
  uiShift = 0;
}

function drawWon() {
  panel(W / 2, H / 2, 680, 470);
  text(LEVELS[levelIdx].name, W / 2, 255, 28, '#8a6a9a', { weight: 500 });
  text('Raccoons busted!', W / 2, 305, 56, '#e8578f', { stroke: '#fff', strokeW: 6 });
  for (let i = 0; i < 3; i++) {
    const on = i < stars, x = W / 2 + (i - 1) * 110, y = 410 - (i === 1 ? 18 : 0);
    starShape(x, y, i === 1 ? 52 : 44, on ? '#ffd23f' : '#e4dccd', on ? '#b8860b' : '#cfc4b1');
  }
  text('Score ' + score.toLocaleString(), W / 2, 495, 34, '#5b3a1e');
  if (bonus) text(`includes +${bonus.toLocaleString()} for cats left over`, W / 2, 530, 20, '#9a8a7a', { weight: 500 });
  const hasNext = levelIdx + 1 < LEVELS.length;
  button('Levels', W / 2 - (hasNext ? 190 : 110), 610, 170, 72, '#8e7cc3', () => { state = 'levels'; });
  button('Again', W / 2 + (hasNext ? 0 : 110), 610, 170, 72, '#f2994a', () => loadLevel(levelIdx));
  if (hasNext) button('Next', W / 2 + 190, 610, 170, 72, '#4caf6a', () => loadLevel(levelIdx + 1));
}

function drawLost() {
  panel(W / 2, H / 2, 640, 400);
  text('They got away!', W / 2, 320, 56, '#7a5a9a', { stroke: '#fff', strokeW: 6 });
  drawCoon(W / 2, 420, 46, Math.sin(frame * 0.08) * 0.15, { hp: 30, maxHp: 30, blink: 0 });
  text('The raccoons are laughing. Try again!', W / 2, 500, 24, '#9a8a7a', { weight: 500 });
  button('Levels', W / 2 - 110, 590, 180, 72, '#8e7cc3', () => { state = 'levels'; });
  button('Try again', W / 2 + 110, 590, 200, 72, '#f2994a', () => loadLevel(levelIdx));
}

// ---- home screen raccoon crime scenes (UI space; the floor line is at y = 800) ----
const MENU_FLOOR = 800;
function coonArm(x0, y0, x1, y1, w) {
  ctx.strokeStyle = '#7b808a'; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.fillStyle = '#2b2d33'; ctx.beginPath(); ctx.arc(x1, y1, w * 0.62, 0, 7); ctx.fill();
  ctx.lineCap = 'butt';
}
function menuLoot(type, x, y, a, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); ctx.scale(s || 1.6, s || 1.6);
  drawLoot({ position: { x: 0, y: 0 }, angle: 0, game: { type } });
  ctx.restore();
}
// the whole gang huddled off to the side, plotting over the boss's plan
function drawHuddle() {
  const cx = 1380, w = k => Math.sin(frame * 0.07 + k);
  const coon = (x, y, r, tilt, k, boss) => drawCoon(x, y - Math.max(0, w(k)) * 4, r, tilt + w(k) * 0.05, { hp: 30, maxHp: 30, blink: k * 53, boss });
  coon(cx - 122, 682, 46, 0.32, 1);
  coon(cx + 122, 682, 46, -0.32, 2);
  coon(cx, 612, 56, 0, 0, true);
  // the plan, held up by the boss: a blueprint of the treat jar heist
  ctx.save(); ctx.translate(cx, 708 + w(0) * 2); ctx.rotate(-0.04);
  ctx.fillStyle = '#3b6fb5'; rr(-74, -50, 148, 100, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.strokeRect(-56, -14, 34, 44); ctx.beginPath(); ctx.moveTo(-60, -18); ctx.lineTo(-18, -18); ctx.stroke();   // the jar
  ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(-12, 10); ctx.quadraticCurveTo(20, -40, 46, 0); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(38, -2); ctx.lineTo(48, 2); ctx.lineTo(44, -10); ctx.stroke();
  ctx.strokeStyle = '#ff6f6f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(40, 14); ctx.lineTo(56, 30); ctx.moveTo(56, 14); ctx.lineTo(40, 30); ctx.stroke();   // X marks the spot
  text('PLAN', 0, -34, 18, '#ffffff');
  ctx.restore();
  coonArm(cx - 30, 640, cx - 62, 672 + w(0) * 2, 11);
  coonArm(cx + 30, 640, cx + 62, 672 + w(0) * 2, 11);
  // the little ones up front, leaning in to listen
  coon(cx - 88, MENU_FLOOR - 38, 38, 0.38, 3);
  coon(cx + 92, MENU_FLOOR - 38, 38, -0.38, 4);
  // whispered schemes
  const lines = ['psst...', 'the TREATS!', 'heh heh heh', 'shhh!'];
  const li = Math.floor(frame / 110) % lines.length, fade = Math.min(1, (frame % 110) / 10, (110 - frame % 110) / 10);
  ctx.save(); ctx.globalAlpha *= fade;
  ctx.font = `700 26px ${FONT}`;
  const bw = ctx.measureText(lines[li]).width + 40, by = 500;
  ctx.fillStyle = '#ffffff'; rr(cx - bw / 2, by - 26, bw, 52, 24); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 10, by + 24); ctx.lineTo(cx - 4, by + 44); ctx.lineTo(cx + 10, by + 24); ctx.closePath(); ctx.fill();
  text(lines[li], cx, by + 1, 26, '#3a2160');
  ctx.restore();
}

// ---- title logo: chunky scuffed cartoon letters (Angry Birds logo style), drawn once to an offscreen canvas ----
let logoCanvas = null, logoBuiltWithFont = false;
const LOGO_W = 1100, LOGO_H = 470, LOGO_S = 2;
function buildLogo() {
  const fontReady = !document.fonts || document.fonts.check("40px 'Luckiest Guy'");
  if (logoCanvas && (logoBuiltWithFont || !fontReady)) return;
  logoBuiltWithFont = fontReady;
  const mk = () => { const c = document.createElement('canvas'); c.width = LOGO_W * LOGO_S; c.height = LOGO_H * LOGO_S; const g = c.getContext('2d'); g.scale(LOGO_S, LOGO_S); return [c, g]; };
  const [c, g] = mk(), [fc, fg] = mk();          // fc holds the white letter faces, textured on their own
  const font = size => `${size}px 'Luckiest Guy', Bangers, Impact, sans-serif`;
  // [char, size, tilt, bounce]: every letter a little crooked, like the Angry Birds logo
  const lines = [
    { y: 190, chars: [['A', 150, -0.07, 6], ['N', 140, 0.05, -4], ['G', 148, -0.04, 4], ['R', 138, 0.06, -6], ['Y', 150, -0.05, 2]] },
    { y: 372, chars: [['C', 172, -0.06, 2], ['A', 158, 0.04, -6], ['T', 166, -0.05, 4], ['S', 162, 0.07, -2]] },
  ];
  const placed = [];
  for (const ln of lines) {
    const widths = ln.chars.map(([ch, size]) => { g.font = font(size); return g.measureText(ch).width + 12; });   // room for the thick outlines
    let x = LOGO_W / 2 - widths.reduce((s, w) => s + w, 0) / 2;
    ln.chars.forEach(([ch, size, rot, dy], i) => { placed.push({ ch, size, rot, x: x + widths[i] / 2, y: ln.y + dy }); x += widths[i]; });
  }
  // cat ears on top of the C
  const C = placed.find(p => p.ch === 'C');
  g.font = font(C.size); const cm = g.measureText('C'), cAsc = cm.actualBoundingBoxAscent || C.size * 0.75;
  const ears = [[-0.3, -0.18], [0.14, 0.2]].map(([dx, tilt]) => ({ x: C.x + dx * cm.width, y: C.y - cAsc + 4, tilt }));
  const earPath = (k, e) => { k.save(); k.translate(e.x, e.y); k.rotate(e.tilt); k.beginPath(); k.moveTo(-26, 18); k.lineTo(0, -34); k.lineTo(26, 18); k.closePath(); k.restore(); };
  // whisker swooshes behind CATS (the logo's "wings")
  const line2 = placed.slice(5), edge = side => side < 0 ? line2[0].x - line2[0].size * 0.42 : line2[line2.length - 1].x + line2[line2.length - 1].size * 0.42;
  for (const side of [-1, 1]) for (const [dy, len, bend] of [[-36, 150, -26], [0, 175, 0], [36, 150, 26]]) {
    const x0 = edge(side) + side * 14, y0 = 335 + dy, x1 = x0 + side * len, y1 = y0 + bend * 1.4;
    for (const [w, col] of [[22, '#1f3b5a'], [14, '#8fd3ff'], [4, '#e8f8ff']]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 + bend * 0.2 - 10, x1, y1); g.stroke();
    }
  }
  const each = fn => { for (const p of placed) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.font = font(p.size); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; fn(p); g.restore(); } };
  const outline = (w, col) => { each(p => { g.strokeStyle = col; g.lineWidth = w; g.strokeText(p.ch, 0, 0); }); for (const e of ears) { earPath(g, e); g.lineWidth = w; g.strokeStyle = col; g.stroke(); } };
  g.lineJoin = 'round';
  g.save(); g.translate(7, 9); outline(30, 'rgba(40,20,10,0.35)'); g.restore();                                   // drop shadow
  for (let k = 0; k < 4; k++) { g.save(); g.translate((hash(k * 3.1) - 0.5) * 3, (hash(k * 7.3) - 0.5) * 3); outline(28, '#3b2414'); g.restore(); }   // bumpy dark edge
  outline(17, '#f2a91c'); outline(9, '#ffd34d');                                                                  // gold rim
  // white faces, cool-shaded toward the bottom, then scuffs painted only onto the letters
  const grad = fg.createLinearGradient(0, 40, 0, LOGO_H);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.55, '#f4f7fa'); grad.addColorStop(1, '#cfdbe6');
  for (const p of placed) { fg.save(); fg.translate(p.x, p.y); fg.rotate(p.rot); fg.font = font(p.size); fg.textAlign = 'center'; fg.fillStyle = grad; fg.fillText(p.ch, 0, 0); fg.restore(); }
  for (const e of ears) { earPath(fg, e); fg.fillStyle = '#ffffff'; fg.fill(); }
  fg.globalCompositeOperation = 'source-atop';
  for (const e of ears) { fg.save(); fg.translate(e.x, e.y); fg.rotate(e.tilt); fg.fillStyle = '#f7b3c2'; fg.beginPath(); fg.moveTo(-12, 12); fg.lineTo(0, -16); fg.lineTo(12, 12); fg.closePath(); fg.fill(); fg.restore(); }
  fg.strokeStyle = 'rgba(150,170,190,0.55)'; fg.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 1.7) * LOGO_W, y = 40 + hash(i * 2.9) * (LOGO_H - 80), l = 6 + hash(i * 4.1) * 22, a = (hash(i * 5.3) - 0.5) * 1.2;
    fg.lineWidth = 1.5 + hash(i * 6.7) * 2.5;
    fg.beginPath(); fg.moveTo(x, y); fg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); fg.stroke();
  }
  fg.fillStyle = 'rgba(140,160,180,0.35)';
  for (let i = 0; i < 160; i++) { fg.beginPath(); fg.arc(hash(i * 9.1) * LOGO_W, 40 + hash(i * 3.3) * (LOGO_H - 80), 1 + hash(i * 1.3) * 2.2, 0, 7); fg.fill(); }
  g.drawImage(fc, 0, 0, LOGO_W, LOGO_H);
  // "Vickie's" tag over the top-left of the logo
  g.save(); g.translate(LOGO_W / 2 - 300, 48); g.rotate(-0.12);
  g.font = "700 62px 'Dancing Script', 'Brush Script MT', cursive"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = '#3b2414'; g.lineWidth = 14; g.strokeText("Vickie's", 0, 0);
  g.strokeStyle = '#f2a91c'; g.lineWidth = 6; g.strokeText("Vickie's", 0, 0);
  g.fillStyle = '#fff6e0'; g.fillText("Vickie's", 0, 0);
  g.restore();
  logoCanvas = c;
}
function drawLogo(cx, top, scale) {
  buildLogo();
  ctx.drawImage(logoCanvas, cx - LOGO_W * scale / 2, top, LOGO_W * scale, LOGO_H * scale);
}

function drawMenu() {
  ctx.fillStyle = 'rgba(30,50,60,0.22)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  drawLogo(W / 2, -2, 0.97);
  const bob = k => Math.sin(frame * 0.05 + k) * 6;
  // the raccoon gang huddled together off to the right, away from the cats (further out on wide phones)
  const side = Math.max(0, uiShift) * 0.6;
  ctx.save(); ctx.translate(-side * 0.5 + 215, MENU_FLOOR); ctx.scale(1.08, 1.08); ctx.translate(-1380, -MENU_FLOOR); drawHuddle(); ctx.restore();
  // the tagline sits over the raccoons, who are the ones it's about
  const tx = -side * 0.5 + 215;
  for (const [i, line] of ['Raccoon burglars stole', 'the treats and toys.', 'Get them back!'].entries()) {
    text(line, tx, 296 + i * 34, i === 2 ? 30 : 26, i === 2 ? '#ffe14d' : '#ffffff', { stroke: '#3a2160', strokeW: 7, weight: i === 2 ? 700 : 500 });
  }
  // the three cats front and centre, bright-eyed
  // tap a cat and she hops and meows
  const hopOf = type => { const k = (frame - (menuHop[type] || -99)) / 24; return k >= 0 && k < 1 ? Math.sin(k * Math.PI) * 34 : 0; };
  const tapCat = type => () => {
    menuHop[type] = frame;
    if (!sfx.cat(pick(CAT_SOUNDS.chatter[type]), 0.65)) sfx.meow(type === 'baby' ? 1.25 : type === 'cece' ? 0.75 : 1);
  };
  for (const [type, x, y, r] of [['cece', 800, 612, 132], ['baby', 548, 650, 84], ['cleo', 1052, 646, 92]]) {
    uiButtons.push({ x: x + uiShift, y, w: r * 2, h: r * 2.2, action: tapCat(type) });
  }
  drawCat(800, 612 + bob(1) - hopOf('cece'), 132, 0, 'cece', { bright: true });
  drawCat(548, 650 + bob(0) - hopOf('baby'), 84, -0.08, 'baby', { bright: true });
  drawCat(1052, 646 + bob(2) - hopOf('cleo'), 92, 0.06, 'cleo', { bright: true });
  nameText('baby', 548, 774, 62);
  nameText('cece', 800, 800, 70);
  nameText('cleo', 1052, 774, 72);
  button('PLAY', side * 0.5 + 1385, 760, 340, 120, '#4caf6a', () => { state = 'levels'; });
  text('v' + GAME_VERSION, -uiShift + 30, 875, 18, 'rgba(255,255,255,0.8)', { align: 'left', stroke: 'rgba(0,0,0,0.3)', strokeW: 4, weight: 500 });
  if (!bigFullscreenButton(UW - uiShift - 200, 62, 330, 88)) exitFullscreenButton(UW - uiShift - 110, 62);
  iconButton('music', UW - uiShift - (!canFullscreen ? 60 : isFullscreen() ? 245 : 420), 60, () => music.toggle());
}

function drawLevels() {
  ctx.fillStyle = 'rgba(30,50,60,0.3)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  text('Pick a level', W / 2, 120, 64, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  iconButton('back', 80 - uiShift + 20, 80, () => { state = 'menu'; });
  if (!bigFullscreenButton(UW - uiShift - 200, 62, 330, 88)) exitFullscreenButton(UW - uiShift - 110, 62);
  iconButton('music', UW - uiShift - (!canFullscreen ? 60 : isFullscreen() ? 245 : 420), 60, () => music.toggle());
  LEVELS.forEach((lv, i) => {
    const col = i % 6, row = Math.floor(i / 6);
    const x = W / 2 + (col - 2.5) * 215, y = 335 + row * 260, w = 195, h = 210;
    const open = unlocked(i);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x - w / 2, y - h / 2 + 8, w, h, 24); ctx.fill();
    ctx.fillStyle = open ? '#fff6e6' : '#9b93ad'; rr(x - w / 2, y - h / 2, w, h, 24); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = open ? '#e8b06a' : '#7b7390'; ctx.stroke();
    if (open) {
      text(String(i + 1), x, y - 30, 70, '#ff7a59', { stroke: '#5b3a1e', strokeW: 8 });
      text(lv.name, x, y + 30, 19, '#5b3a1e', { weight: 500 });
      const s = bestStars[i] || 0;
      if (goldenFound[i]) drawLoot({ position: { x: x + 70, y: y - 78 }, angle: -0.3, game: { type: 'goldfish' } });
      for (let k = 0; k < 3; k++) starShape(x + (k - 1) * 38, y + 68, 15, k < s ? '#ffd23f' : '#e4dccd', k < s ? '#b8860b' : '#cfc4b1');
      uiButtons.push({ x: x + uiShift, y, w, h, action: () => loadLevel(i) });
    } else {
      ctx.fillStyle = '#5d566e'; rr(x - 26, y - 10, 52, 42, 8); ctx.fill();
      ctx.strokeStyle = '#5d566e'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(x, y - 12, 17, Math.PI, 0); ctx.stroke();
      text(String(i + 1), x, y + 70, 30, '#e9e4f2');
    }
  });
}

// ---------------------------------------------------------------- frame loop

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth, ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  // UI: 900 tall, as wide as the screen allows (never narrower than the 1600 design)
  uiScale = Math.min(canvas.height / H, canvas.width / W);
  UW = canvas.width / uiScale;
  uiOffY = (canvas.height / uiScale - H) / 2;
  // world: VIEW_H tall, fills the whole screen; the camera picks which slice of the level shows
  worldScale = canvas.height / VIEW_H;
  viewW = canvas.width / worldScale;
  cam.x = clampCamX(cam.x);
}
window.addEventListener('resize', resize);
resize();

function setUI() { ctx.setTransform(uiScale, 0, 0, uiScale, 0, uiOffY * uiScale); }

function render() {
  music.update();
  uiButtons = [];
  fsSlot = null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d22'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state === 'menu' || state === 'levels') {
    // the room as it looks at the start of a level, behind the menu
    ctx.setTransform(worldScale, 0, 0, worldScale, 0, -CAM_TOP * worldScale);
    drawBackdrop(0);
    setUI();
    centred(state === 'menu' ? drawMenu : drawLevels);
  } else {
    ctx.setTransform(worldScale, 0, 0, worldScale, -cam.x * worldScale, -cam.y * worldScale);
    drawBackdrop(cam.x);
    drawWorld();
    setUI();
    drawHUD();
    if (state === 'won') centred(drawWon);
    else if (state === 'lost') centred(drawLost);
  }
  if (window.innerHeight > window.innerWidth * 1.1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, window.innerWidth, 44);
    ctx.font = `600 16px ${FONT}`; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Turn your phone sideways for a bigger game', window.innerWidth / 2, 22);
  }
}

const fsBtn = document.getElementById('fsbtn');
let fsKey = '';
function placeFsButton() {
  const k = fsSlot ? [fsSlot.label, fsSlot.x, fsSlot.y, fsSlot.w, fsSlot.h, uiScale, uiOffY, dpr].join() : 'none';
  if (k === fsKey) return;
  fsKey = k;
  if (!fsSlot) { fsBtn.style.display = 'none'; return; }
  const s = uiScale / dpr;
  Object.assign(fsBtn.style, {
    display: 'block', left: (fsSlot.x - fsSlot.w / 2) * s + 'px', top: (fsSlot.y - fsSlot.h / 2 + uiOffY) * s + 'px',
    width: fsSlot.w * s + 'px', height: fsSlot.h * s + 'px', fontSize: fsSlot.h * 0.42 * s + 'px', background: fsSlot.color,
  });
  fsBtn.textContent = fsSlot.label;
}
fsBtn.addEventListener('click', () => { sfx.init(); toggleFullscreen(); });

let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= STEP) { step(); acc -= STEP; }
  render();
  placeFsButton();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// canvas text only uses a web font once it has been asked for
if (document.fonts) for (const f of ["40px Bangers", "40px Chewy", "700 40px 'Dancing Script'", "700 40px Fredoka", "40px 'Luckiest Guy'"]) document.fonts.load(f).catch(() => {});

// Handy for testing: index.html?level=3 jumps straight in.
const qLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);
if (qLevel >= 1 && qLevel <= LEVELS.length) loadLevel(qLevel - 1);
