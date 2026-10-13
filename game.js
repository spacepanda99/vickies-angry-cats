'use strict';
// Vickie's Angry Cats — raccoon burglars stole the toys and treats. Fling the cats and get them back.
// Everything is drawn in code on one canvas. Physics is Matter.js 0.19 (velocities are per 60Hz step).
// The world is wider than the screen: a camera scrolls between the slingshot and the fort, like Angry Birds.

const { Engine, Bodies, Body, Composite, Events, Vector, Sleeping } = Matter;

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
};

const CATS = {
  baby: { name: 'Baby', r: 30, density: 0.004, restitution: 0.3, friction: 0.6,
          body: '#a5a4aa', dark: '#6f6e75', belly: '#f4f4f6', eye: '#cfc77e', patch: '#cbcacf',
          power: 'split', hint: 'Tap for ninja clones!' },
  // CeCe weighs a ton: she launches weak, lands short, then rolls like a bowling ball.
  cece: { name: 'CeCe', r: 70, density: 0.00553, restitution: 0.12, friction: 0.9, frictionAir: 0.0012, launch: 0.82,
          body: '#93826f', dark: '#3e342c', belly: '#fbfaf7', eye: '#b9b46a', patch: '#d9984f',
          power: 'shake', hint: 'Tap for the head shake!' },
  cleo: { name: 'Cleo', r: 34, density: 0.004, restitution: 0.3, friction: 0.5,
          body: '#f0c99a', dark: '#c98f58', belly: '#fffdf8', eye: '#b5d39c', patch: '#e6ae74',
          power: 'pounce', hint: 'Tap to pounce!' },
};

// Level building helpers. A "hut" is two posts and a beam; huts stack.
function block(lv, mat, x, y, w, h) { lv.blocks.push({ mat, x, y, w, h }); }
function hut(lv, cx, base, w, h, postMat, beamMat) {
  block(lv, postMat, cx - w / 2 + 10, base - h / 2, 20, h);
  block(lv, postMat, cx + w / 2 - 10, base - h / 2, 20, h);
  block(lv, beamMat, cx, base - h - 10, w, 20);
  return base - h - 20;
}
function coon(lv, x, base, boss) { const r = boss ? 60 : 36; lv.raccoons.push({ x, y: base - r - 1, r, boss: !!boss }); }
function loot(lv, x, base, kind) { lv.loot.push({ x, y: base - 14, kind }); }

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
];

// ---------------------------------------------------------------- saved progress

const STORE_KEY = 'vickysAngryCats.stars';
let bestStars = {};
try { bestStars = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { bestStars = {}; }
function saveStars() { try { localStorage.setItem(STORE_KEY, JSON.stringify(bestStars)); } catch (e) { /* private mode */ } }
const unlocked = i => i === 0 || (bestStars[i - 1] || 0) > 0;

// ---------------------------------------------------------------- sound (synthesized, no files)

const sfx = {
  ac: null, on: true, noise: null,
  init() {
    if (!this.ac) {
      try {
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ac.sampleRate * 0.3;
        this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ac = null; }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    this.loadSample('win', 'jingle-win.ogg');
    this.loadSample('lose', 'jingle-lose.ogg');
  },
  ok() { return this.on && this.ac; },
  env(t, dur, vol) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.ac.destination);
    return g;
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
  pop() { this.tone('sine', 260, 900, 0.16, 0.2); },
  zoom() { this.tone('square', 300, 1300, 0.25, 0.05); },
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
  playSample(name, vol) {
    const buf = this.samples[name];
    if (!this.ok() || !buf) return false;
    const src = this.ac.createBufferSource(), g = this.ac.createGain();
    src.buffer = buf; g.gain.value = vol; src.connect(g); g.connect(this.ac.destination); src.start();
    return true;
  },
  win() {
    if (this.playSample('win', 0.45)) return;
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

function newEngine() {
  engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  Events.on(engine, 'collisionStart', onCollide);
}

function makeBlock(b) {
  const m = MATS[b.mat];
  const body = Bodies.rectangle(b.x, b.y, b.w, b.h, {
    density: m.density, friction: 0.8, frictionStatic: 1.2, restitution: 0.05, label: 'block' });
  const hp = m.health * Math.max(0.6, Math.min(2.5, (b.w * b.h) / 2000));
  body.game = { kind: 'block', mat: b.mat, w: b.w, h: b.h, hp, maxHp: hp, seed: Math.random() * 1000 };
  return body;
}
function makeCoon(c) {
  const body = Bodies.circle(c.x, c.y, c.r, { density: 0.0025, friction: 0.7, restitution: 0.15, label: 'coon' });
  const hp = c.boss ? 320 : 30;
  body.game = { kind: 'coon', r: c.r, boss: c.boss, hp, maxHp: hp, blink: Math.random() * 200 };
  return body;
}
function makeLoot(l) {
  const body = l.kind === 'fish'
    ? Bodies.rectangle(l.x, l.y, 36, 18, { density: 0.0015, friction: 0.6, label: 'loot' })
    : Bodies.circle(l.x, l.y, 13, { density: 0.0015, friction: 0.6, label: 'loot' });
  body.game = { kind: 'loot', type: l.kind };
  return body;
}
function makeCat(type, x, y, r) {
  const t = CATS[type];
  const body = Bodies.circle(x, y, r || t.r, {
    density: t.density, friction: t.friction, restitution: t.restitution, frictionAir: t.frictionAir || 0.004,
    label: 'cat', collisionFilter: { group: -1 } });   // cats never hit each other (clones!)
  body.game = { kind: 'cat', type, r: r || t.r, rest: 0, mult: 1, done: false, trail: [] };
  return body;
}

function loadLevel(i) {
  levelIdx = i;
  newEngine();
  const lv = { blocks: [], raccoons: [], loot: [] };
  LEVELS[i].build(lv);
  for (const list of [lv.blocks, lv.raccoons, lv.loot]) for (const o of list) o.x += FORT_X;
  Composite.add(engine.world, Bodies.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 3, 120, { isStatic: true, friction: 0.9, label: 'ground' }));
  for (const b of lv.blocks) Composite.add(engine.world, makeBlock(b));
  for (const c of lv.raccoons) Composite.add(engine.world, makeCoon(c));
  for (const l of lv.loot) Composite.add(engine.world, makeLoot(l));
  fortCenter = lv.raccoons.reduce((s, c) => s + c.x, 0) / lv.raccoons.length;
  queue = LEVELS[i].cats.slice();
  current = queue.shift();
  phase = 'aim'; dragging = false; pull = { x: 0, y: 0 };
  flying = []; powerUsed = false; flyTimer = 0; outTimer = 0; winTimer = -1;
  settle = 90; score = 0; stars = 0; bonus = 0; snapTimer = 0; bandSnapped = false;
  toRemove = []; particles = []; popups = [];
  // Angry Birds style intro: start looking at the fort, then glide back to the slingshot
  panning = null; panIdle = 999; introTimer = 80;
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
    if (ga && gb) {
      if (ga.kind === 'cat' && gb.kind === 'loot') { gb.collected = true; kill(b); }
      else if (gb.kind === 'cat' && ga.kind === 'loot') { ga.collected = true; kill(a); }
    }
    if (settle > 0) continue;
    const rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
    if (rel < 2) continue;
    hurt(a, b, rel); hurt(b, a, rel);
    if (rel > 4 && frame - lastThud > 4) { lastThud = frame; sfx.thud(Math.min(1, rel / 18)); }
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

function launch() {
  const body = makeCat(current, SLING.x + pull.x, SLING.y + pull.y);
  const snapped = bandSnapped;
  if (snapped) {
    // the band couldn't take her weight: she just plops forward a little and rolls from there
    const d = Math.hypot(pull.x, pull.y) || 1;
    Body.setVelocity(body, { x: Math.max(1.5, (-pull.x / d) * 2.5 + 1), y: -3.5 });
    snapTimer = 100; bandSnapped = false;
  } else {
    const k = launchPower(current);
    Body.setVelocity(body, { x: -pull.x * k, y: -pull.y * k });
  }
  Body.setAngularVelocity(body, snapped ? 0.02 : -pull.x * 0.0012);
  Composite.add(engine.world, body);
  sfx.meow(current === 'baby' ? 1.25 : current === 'cece' ? 0.75 : 1);
  flying = [body]; current = null; phase = 'flying'; powerUsed = false; flyTimer = 0;
  pull = { x: 0, y: 0 }; launchedOnce = true;
}

function usePower() {
  if (phase !== 'flying' || powerUsed || !flying.length) return;
  const c = flying[0], g = c.game;
  if (g.done || g.dead || flyTimer < 6) return;
  powerUsed = true;
  const t = CATS[g.type];
  if (t.power === 'split') {
    for (const ang of [-0.24, 0.24]) {
      const nb = makeCat('baby', c.position.x, c.position.y);
      nb.game.clone = true;
      Body.setVelocity(nb, Vector.rotate(c.velocity, ang));
      Composite.add(engine.world, nb); flying.push(nb);
    }
    poof(c.position, 6, 0.6); sfx.pop();
  } else if (t.power === 'shake') {
    // CeCe's signature fast head shake: a blast of fur that shoves and dents everything nearby
    g.shake = 42;
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
    sfx.shake();
  } else if (t.power === 'pounce') {
    const v = c.velocity, sp = Vector.magnitude(v);
    if (sp > 0.1) Body.setVelocity(c, Vector.mult(Vector.normalise(v), Math.min(MAX_SPEED, Math.max(18, sp * 1.8))));
    g.mult = 1.7; g.pounce = true;
    sparkle(c.position, 6); sfx.zoom();
  }
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
    else if (p.type !== 'ring') p.vy += 0.35;
  }
  particles = particles.filter(p => p.life > 0);
  for (const p of popups) { p.life--; p.y -= 0.8; }
  popups = popups.filter(p => p.life > 0);

  if (!engine || state === 'menu' || state === 'levels') return;
  Engine.update(engine, STEP);
  if (settle > 0) settle--;
  if (snapTimer > 0) snapTimer--;

  for (const b of bodies()) {
    if (b.isStatic) continue;
    const g = b.game;
    if (g && g.kind === 'cat') {
      const sp = Vector.magnitude(b.velocity);
      if (sp > MAX_SPEED) Body.setVelocity(b, Vector.mult(b.velocity, MAX_SPEED / sp));
      if (g.shake > 0) g.shake--;
      // rolling resistance on the floor, so a weak (snapped) roll peters out short of the fort
      if (b.position.y > GROUND - g.r - 3) Body.setVelocity(b, { x: b.velocity.x * 0.99, y: b.velocity.y });
      if (frame % 2 === 0) { g.trail.push({ x: b.position.x, y: b.position.y }); if (g.trail.length > 40) g.trail.shift(); }
    }
    if (b.position.y > H + 300 || b.position.x < -300 || b.position.x > WORLD_W + 300) {
      if (g && g.kind === 'coon') kill(b);
      else if (g && g.kind === 'cat') g.done = true;
      else Composite.remove(engine.world, b);
    }
  }

  if (toRemove.length) {
    for (const b of toRemove) {
      Composite.remove(engine.world, b);
      const g = b.game;
      if (g.kind === 'block') { addScore(MATS[g.mat].points, b.position); debris(b); }
      else if (g.kind === 'coon') { addScore(g.boss ? 20000 : 5000, b.position); poof(b.position, g.boss ? 18 : 10, g.boss ? 1.6 : 1); sparkle(b.position, 6); sfx.pop(); }
      else if (g.kind === 'loot' && g.collected) { addScore(1000, b.position, g.type === 'fish' ? 'Treat saved! +1000' : 'Yarn saved! +1000'); sparkle(b.position, 10); sfx.ding(); }
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
      if (queue.length) { current = queue.shift(); phase = 'aim'; panIdle = 999; }
      else { phase = 'out'; outTimer = 150; }
    }
  } else if (phase === 'out') {
    if (--outTimer <= 0) { state = 'lost'; sfx.lose(); music.duck(2.6); }
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
  sfx.win(); music.duck(3.2);
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
  if (current === 'cece' && !bandSnapped && Math.hypot(dx, dy) > SNAP_PULL) {
    // once it snaps it stays snapped: letting go just plops her out
    bandSnapped = true; snapTimer = 100;
    popups.push({ x: SLING.x, y: SLING.y - 110, text: 'SNAP! She\'s too heavy!', life: 90, big: true });
    sparkle({ x: SLING.x, y: SLING.y - 5 }, 8);
    sfx.snap();
  }
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  sfx.init();
  const u = toUI(e);
  for (let i = uiButtons.length - 1; i >= 0; i--) {
    const b = uiButtons[i];
    if (Math.abs(u.x - b.x) <= b.w / 2 && Math.abs(u.y - b.y) <= b.h / 2) { b.action(); return; }
  }
  if (state !== 'play') return;
  const p = toWorld(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (phase === 'aim' && current && introTimer === 0 && Math.hypot(p.x - SLING.x - pull.x, p.y - SLING.y - pull.y) < 110) {
    dragging = true;
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
canvas.addEventListener('pointerup', release);
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
function fullscreenButton(x, y) { if (canFullscreen) iconButton('fullscreen', x, y, toggleFullscreen); }

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
  ear(R, -1, [0.8, -0.4], [0.62, -1.18], [0.16, -0.8], '#d9984f', '#f1b9a8', '#fbfaf7');
  ear(R, 1, [0.8, -0.4], [0.62, -1.18], [0.16, -0.8], t.body, '#f1b9a8', '#fbfaf7');
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
  for (const s of [-1, 1]) catEye(s * R * 0.3, -R * 0.13, R * 0.15, R * 0.15, s, t.eye, opts.calm ? 0.42 : 0.5, opts.calm ? 0.1 : 0.45, s < 0 ? '#c98a4a' : t.body);
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

  for (const s of [-1, 1]) catEye(s * r * 0.34, -r * 0.08, r * 0.19, r * 0.2, s, t.eye, opts.calm ? 0.3 : 0.38, opts.calm ? 0.05 : 0.5, t.body);
  catNoseMouth(r, r * 0.2, '#9d9aa1');
  whiskers(r, r * 0.33, 1.2, 'rgba(255,255,255,0.95)');
}

// Cleo: cream-orange and white semi-longhair, pale green eyes, big white chest ruff, quietly elegant.
function drawCleo(r, t, opts) {
  for (const s of [-1, 1]) ear(r, s, [0.92, -0.3], [0.72, -1.3], [0.16, -0.86], t.patch, '#f2b6b0', '#fffdf8');
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

  for (const s of [-1, 1]) catEye(s * r * 0.32, -r * 0.1, r * 0.17, r * 0.18, s, t.eye, opts.calm ? 0.25 : 0.38, opts.calm ? -0.05 : 0.25, t.body);
  catNoseMouth(r, r * 0.17, '#eba3a0');
  whiskers(r, r * 0.29, 1.18, 'rgba(255,255,255,0.95)');
}

function drawCat(x, y, r, ang, type, opts = {}) {
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
  // hat: beanie for the crew, top hat for the boss
  if (g && g.boss) {
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
  ctx.save();
  ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
  ctx.fillStyle = m.fill; rr(-w / 2, -h / 2, w, h, 3); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = m.edge; ctx.stroke();
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
  const k = launchPower(current);
  let x = SLING.x + pull.x, y = SLING.y + pull.y, vx = -pull.x * k, vy = -pull.y * k;
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

function drawWorld() {
  drawSlingBack();
  // waiting cats sit in line behind the slingshot
  // (spaced by size, so big CeCe doesn't overlap her neighbour)
  let qx = SLING.x - 45;
  queue.forEach((type, i) => {
    const r = CATS[type].r * 0.75, bob = Math.sin(frame * 0.05 + i) * 2;
    qx -= r * 1.15;
    drawCat(qx, GROUND - r + bob, r, 0, type, { calm: true });
    qx -= r * 1.15 + 6;
  });

  const loaded = phase === 'aim' && current;
  const strain = loaded && current === 'cece' && !bandSnapped
    ? Math.max(0, Math.min(1, (Math.hypot(pull.x, pull.y) - SNAP_PULL * 0.75) / (SNAP_PULL * 0.25))) : 0;
  const jig = strain > 0.5 ? (Math.random() - 0.5) * 4 * strain : 0;     // the slingshot creaks under her
  const tip = { x: SLING.x + pull.x + jig, y: SLING.y + pull.y + jig };
  if (loaded && !bandSnapped) band(SLING.x + 26, 646, tip.x + 6, tip.y, strain);
  if (snapTimer > 0 || bandSnapped) snappedBands();

  const list = bodies().filter(b => b.game);
  const order = { block: 0, loot: 1, coon: 2, cat: 3 };
  list.sort((a, b) => order[a.game.kind] - order[b.game.kind]);
  for (const b of list) {
    const g = b.game;
    if (g.kind === 'block') drawBlock(b);
    else if (g.kind === 'loot') drawLoot(b);
    else if (g.kind === 'coon') drawCoon(b.position.x, b.position.y, g.r, b.angle, g);
    else if (g.kind === 'cat') {
      if (g.pounce || g.clone) {
        g.trail.forEach((p, i) => { ctx.globalAlpha = (i / g.trail.length) * 0.35; drawCat(p.x, p.y, g.r * 0.9, b.angle, g.type); });
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
      } else {
        drawCat(b.position.x, b.position.y, g.r, b.angle, g.type, { alpha: g.clone ? 0.75 : 1 });
      }
    }
  }

  if (loaded) {
    if (dragging && !bandSnapped) drawTrajectory();
    drawCat(tip.x, tip.y, CATS[current].r, 0, current);
    if (!bandSnapped) band(SLING.x - 24, 646, tip.x - 6, tip.y, strain);
  }
  drawSlingFront();

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
    fullscreenButton(UW - 400, 56);
    iconButton('music', UW - 315, 56, () => music.toggle());
    iconButton('sound', UW - 230, 56, () => { sfx.on = !sfx.on; saveAudio(); });
    iconButton('levels', UW - 145, 56, () => { state = 'levels'; });
    iconButton('restart', UW - 60, 56, () => loadLevel(levelIdx));
  }
  let hint = null;
  if (state === 'play' && phase === 'aim' && current && !dragging) {
    hint = !launchedOnce ? 'Pull the cat back and let go!'
      : current === 'cece' ? 'CeCe is up! Careful, she\'s heavy...' : `${CATS[current].name} is up!`;
    if (panIdle < 100 || panning) hint = 'Looking around...';
  } else if (state === 'play' && phase === 'aim' && dragging && current === 'cece') {
    const d = Math.hypot(pull.x, pull.y);
    hint = bandSnapped ? 'Oops! Let go and watch her plop...' : d > SNAP_PULL * 0.85 ? 'Easy... she\'s really heavy!' : null;
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

function drawMenu() {
  ctx.fillStyle = 'rgba(30,50,60,0.22)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  text("Vickie's", W / 2, 110, 60, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  text('ANGRY CATS', W / 2, 205, 124, '#ff7a59', { stroke: '#3a2160', strokeW: 20 });
  text('Raccoon burglars stole the treats and toys. Get them back!', W / 2, 293, 30, '#fff', { stroke: '#3a2160', strokeW: 7, weight: 500 });
  const bob = k => Math.sin(frame * 0.05 + k) * 6;
  // the raccoon gang lurks off to the sides, clutching stolen treats
  const side = Math.max(0, uiShift) * 0.6;   // on wide phones, push them further out
  const fish = (x, y, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1.6, 1.6); drawLoot({ position: { x: 0, y: 0 }, angle: 0, game: { type: 'fish' } }); ctx.restore(); };
  const yarn = (x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6); drawLoot({ position: { x: 0, y: 0 }, angle: 0, game: { type: 'yarn' } }); ctx.restore(); };
  drawCoon(150 - side, 540 + bob(3), 66, Math.sin(frame * 0.03) * 0.1, { hp: 30, maxHp: 30, blink: 50 });
  drawCoon(300 - side * 0.6, 640 + bob(4), 46, 0.12, { hp: 30, maxHp: 30, blink: 120 });
  fish(225 - side * 0.8, 620, -0.3);
  drawCoon(1450 + side, 540 + bob(5), 66, -Math.sin(frame * 0.03) * 0.1, { hp: 30, maxHp: 30, blink: 170 });
  drawCoon(1300 + side * 0.6, 640 + bob(6), 46, -0.12, { hp: 30, maxHp: 30, blink: 20 });
  yarn(1378 + side * 0.8, 618);
  // the three cats front and centre
  drawCat(800, 530 + bob(1), 132, 0, 'cece');
  drawCat(538, 568 + bob(0), 84, -0.08, 'baby');
  drawCat(1065, 565 + bob(2), 92, 0.06, 'cleo');
  text('Baby', 538, 690, 66, '#ffd9bf', { font: "Bangers, Impact, sans-serif", weight: 400, stroke: '#4a4856', strokeW: 10 });
  text('CeCe', 800, 712, 74, '#fff3e0', { font: "Chewy, 'Comic Sans MS', cursive", weight: 400, stroke: '#5a4030', strokeW: 11 });
  text('Cleo', 1065, 690, 78, '#ffe6c4', { font: "'Dancing Script', 'Brush Script MT', cursive", weight: 700, stroke: '#9a5a2a', strokeW: 10 });
  button('PLAY', W / 2, 818, 280, 84, '#4caf6a', () => { state = 'levels'; });
  fullscreenButton(UW - uiShift - 60, 60);
  iconButton('music', UW - uiShift - 145, 60, () => music.toggle());
}

function drawLevels() {
  ctx.fillStyle = 'rgba(30,50,60,0.3)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  text('Pick a level', W / 2, 120, 64, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  iconButton('back', 80 - uiShift + 20, 80, () => { state = 'menu'; });
  fullscreenButton(UW - uiShift - 60, 60);
  iconButton('music', UW - uiShift - 145, 60, () => music.toggle());
  LEVELS.forEach((lv, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 520 + col * 280, y = 330 + row * 250, w = 230, h = 200;
    const open = unlocked(i);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x - w / 2, y - h / 2 + 8, w, h, 24); ctx.fill();
    ctx.fillStyle = open ? '#fff6e6' : '#9b93ad'; rr(x - w / 2, y - h / 2, w, h, 24); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = open ? '#e8b06a' : '#7b7390'; ctx.stroke();
    if (open) {
      text(String(i + 1), x, y - 30, 70, '#ff7a59', { stroke: '#5b3a1e', strokeW: 8 });
      text(lv.name, x, y + 30, 20, '#5b3a1e', { weight: 500 });
      const s = bestStars[i] || 0;
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

let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= STEP) { step(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// canvas text only uses a web font once it has been asked for
if (document.fonts) for (const f of ["40px Bangers", "40px Chewy", "700 40px 'Dancing Script'", "700 40px Fredoka"]) document.fonts.load(f).catch(() => {});

// Handy for testing: index.html?level=3 jumps straight in.
const qLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);
if (qLevel >= 1 && qLevel <= LEVELS.length) loadLevel(qLevel - 1);
