'use strict';
// Vickie's Angry Cats — raccoon burglars stole the toys and treats. Fling the cats and get them back.
// Everything is drawn in code on one canvas. Physics is Matter.js 0.19 (velocities are per 60Hz step).

const { Engine, Bodies, Body, Composite, Events, Vector, Sleeping } = Matter;

const W = 1600, H = 900, GROUND = 820;
const SLING = { x: 300, y: 640 };
const MAX_PULL = 130;
const SNAP_PULL = 98;                      // CeCe is too heavy: pull her further than this and the band snaps
const POWER = 0.165;                       // launch speed per pixel of pull
const STEP = 1000 / 60;
const GRAV_STEP = 0.001 * STEP * STEP;     // Matter's per-step gravity at gravity.y = 1
const MAX_SPEED = 26;                      // keeps fast cats from passing through thin blocks
const FONT = "Fredoka, 'Trebuchet MS', 'Segoe UI', sans-serif";

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = 1, scale = 1, offX = 0, offY = 0;

// ---------------------------------------------------------------- data

const MATS = {
  wood:  { density: 0.002, health: 70,  fill: '#d0914f', edge: '#7a4a22', points: 500 },
  glass: { density: 0.001, health: 30,  fill: 'rgba(175,225,255,0.55)', edge: '#6fb6e3', points: 300 },
  stone: { density: 0.004, health: 260, fill: '#a0a6ae', edge: '#5b6068', points: 800 },
};

const CATS = {
  baby: { name: 'Baby', r: 26, density: 0.004, restitution: 0.3, friction: 0.6,
          body: '#9a9ea6', dark: '#5f636b', belly: '#d9dbe0', eye: '#b8e04a',
          power: 'split', hint: 'Tap for ninja clones!' },
  // CeCe weighs a ton: she launches weak, lands short, then rolls like a bowling ball.
  cece: { name: 'CeCe', r: 38, density: 0.014, restitution: 0.12, friction: 0.9, frictionAir: 0.0012, launch: 0.82,
          body: '#9097a0', dark: '#5c626b', belly: '#eceef1', eye: '#e8b33a',
          power: 'shake', hint: 'Tap for the head shake!' },
  cleo: { name: 'Cleo', r: 30, density: 0.004, restitution: 0.3, friction: 0.5,
          body: '#fbf8f2', dark: '#b9ad9c', belly: '#ffffff', eye: '#5aa9e6', patch: '#d49a5c',
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
function coon(lv, x, base, boss) { const r = boss ? 52 : 31; lv.raccoons.push({ x, y: base - r - 1, r, boss: !!boss }); }
function loot(lv, x, base, kind) { lv.loot.push({ x, y: base - 14, kind }); }

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
  { name: 'Pyramid of Loot', cats: ['baby', 'cleo', 'cece', 'baby'], build(lv) {
    const r1 = hut(lv, 980, GROUND, 124, 90, 'stone', 'wood');
    hut(lv, 1110, GROUND, 124, 90, 'stone', 'wood'); coon(lv, 1110, GROUND);
    hut(lv, 1240, GROUND, 124, 90, 'stone', 'wood'); loot(lv, 980, GROUND, 'yarn');
    const r2 = hut(lv, 1045, r1, 124, 90, 'wood', 'glass'); coon(lv, 1045, r1);
    hut(lv, 1175, r1, 124, 90, 'wood', 'glass'); coon(lv, 1175, r1);
    const r3 = hut(lv, 1110, r2, 124, 90, 'glass', 'wood'); coon(lv, 1110, r2);
    loot(lv, 1110, r3, 'fish');
  } },
  { name: 'Attic Hideout', cats: ['cece', 'cleo', 'baby', 'cece'], build(lv) {
    block(lv, 'stone', 880, GROUND - 90, 30, 180);
    let t = GROUND;
    for (let i = 0; i < 3; i++) { const nt = hut(lv, 1340, t, 124, 120, i === 1 ? 'glass' : 'wood', 'wood'); coon(lv, 1340, t); t = nt; }
    coon(lv, 1340, t);
    const s = hut(lv, 1110, GROUND, 140, 80, 'wood', 'stone'); loot(lv, 1110, GROUND, 'fish'); loot(lv, 1110, s, 'yarn');
  } },
  { name: 'The Big Boss Bandit', cats: ['cleo', 'baby', 'cece', 'cleo', 'cece'], build(lv) {
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
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.15, i * 0.13)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.3, 0.06, i * 0.22)); },
};

// ---------------------------------------------------------------- game state

let engine = null;
let state = 'menu';                 // menu | levels | play | won | lost
let levelIdx = 0;
let queue = [], current = null, phase = 'aim';   // phase: aim | flying | out
let dragging = false, pull = { x: 0, y: 0 };
let flying = [], powerUsed = false, flyTimer = 0, outTimer = 0, winTimer = -1;
let settle = 0, score = 0, stars = 0, bonus = 0;
let toRemove = [], particles = [], popups = [], uiButtons = [];
let frame = 0, lastThud = 0, launchedOnce = false, snapTimer = 0, bandSnapped = false;

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
  Composite.add(engine.world, Bodies.rectangle(W / 2, GROUND + 60, W * 4, 120, { isStatic: true, friction: 0.9, label: 'ground' }));
  for (const b of lv.blocks) Composite.add(engine.world, makeBlock(b));
  for (const c of lv.raccoons) Composite.add(engine.world, makeCoon(c));
  for (const l of lv.loot) Composite.add(engine.world, makeLoot(l));
  queue = LEVELS[i].cats.slice();
  current = queue.shift();
  phase = 'aim'; dragging = false; pull = { x: 0, y: 0 };
  flying = []; powerUsed = false; flyTimer = 0; outTimer = 0; winTimer = -1;
  settle = 90; score = 0; stars = 0; bonus = 0; snapTimer = 0; bandSnapped = false;
  toRemove = []; particles = []; popups = [];
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
const willSnap = () => bandSnapped;

function launch() {
  const body = makeCat(current, SLING.x + pull.x, SLING.y + pull.y);
  if (willSnap()) {
    // the band can't take her weight: she just plops forward a little and rolls from there
    const d = Math.hypot(pull.x, pull.y);
    Body.setVelocity(body, { x: Math.max(1.5, (-pull.x / d) * 2.5 + 1), y: -3.5 });
    snapTimer = 100; bandSnapped = false;
  } else {
    const k = launchPower(current);
    Body.setVelocity(body, { x: -pull.x * k, y: -pull.y * k });
  }
  Body.setAngularVelocity(body, snapTimer === 100 ? 0.02 : -pull.x * 0.0012);
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
    const R = 220;
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
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, s: rand(6, 12), rot: a, vr: rand(-0.2, 0.2), life: 45, max: 45,
        color: i % 3 ? '#9097a0' : '#eceef1' });
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
    if (b.position.y > H + 300 || b.position.x < -300 || b.position.x > W + 300) {
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
      if (g.rest > 50 || flyTimer > 60 * 9) g.done = true; else allDone = false;
    }
    if (allDone) {
      for (const c of flying) { if (c.position.y < H + 200) poof(c.position, 6, c.game.r / 26); Composite.remove(engine.world, c); }
      flying = [];
      if (queue.length) { current = queue.shift(); phase = 'aim'; }
      else { phase = 'out'; outTimer = 150; }
    }
  } else if (phase === 'out') {
    if (--outTimer <= 0) { state = 'lost'; sfx.lose(); }
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
  sfx.win();
}

// ---------------------------------------------------------------- input

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * dpr - offX) / scale, y: ((e.clientY - r.top) * dpr - offY) / scale };
}
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
    popups.push({ x: SLING.x, y: SLING.y - 90, text: 'SNAP! She\'s too heavy!', life: 90, big: true });
    sparkle({ x: SLING.x, y: SLING.y - 5 }, 8);
    sfx.snap();
  }
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  sfx.init();
  const p = toWorld(e);
  for (let i = uiButtons.length - 1; i >= 0; i--) {
    const b = uiButtons[i];
    if (Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) { b.action(); return; }
  }
  if (state !== 'play') return;
  if (phase === 'aim' && current && Math.hypot(p.x - SLING.x - pull.x, p.y - SLING.y - pull.y) < 95) {
    dragging = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    updatePull(p);
    return;
  }
  if (phase === 'flying') usePower();
});
canvas.addEventListener('pointermove', e => { if (dragging) updatePull(toWorld(e)); });
function release() {
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
  ctx.font = `${o.weight || 700} ${size}px ${FONT}`;
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
  uiButtons.push({ x, y, w, h, action });
}
function iconButton(kind, x, y, action) {
  const r = 30;
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
  } else if (kind === 'back') {
    ctx.beginPath(); ctx.moveTo(x + 9, y - 13); ctx.lineTo(x - 7, y); ctx.lineTo(x + 9, y + 13); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  uiButtons.push({ x, y, w: r * 2.2, h: r * 2.2, action });
}

// ---------------------------------------------------------------- characters

function drawCat(x, y, r, ang, type, opts = {}) {
  const t = CATS[type];
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

  if (type === 'cece') {
    // CeCe is mostly fluff: three layers of spiky long fur, then a smaller face sits inside it
    const R = r;
    // soft cloud of fur: rings of overlapping puffs, darkest outside, lightest inside
    const cloud = (dist, ball, n, color, phase) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + phase, q = ball * (0.85 + 0.3 * hash(i * 2.3 + phase * 17));
        ctx.beginPath(); ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, q, 0, 7); ctx.fill();
      }
    };
    cloud(R * 0.84, R * 0.3, 18, t.dark, 0);
    cloud(R * 0.8, R * 0.28, 18, t.body, 0.17);
    cloud(R * 0.7, R * 0.27, 15, '#a6adb6', 0.05);
    ctx.fillStyle = '#a6adb6'; ctx.beginPath(); ctx.arc(0, 0, R * 0.75, 0, 7); ctx.fill();
    // wispy strands poking out of the fluff
    ctx.strokeStyle = '#b9bfc7'; ctx.lineWidth = Math.max(1, R * 0.045); ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3, d0 = R * 0.95, d1 = R * (1.12 + 0.08 * hash(i));
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
      ctx.quadraticCurveTo(Math.cos(a + 0.12) * d1, Math.sin(a + 0.12) * d1, Math.cos(a + 0.2) * d1, Math.sin(a + 0.2) * d1);
      ctx.stroke();
    }
    // big white fluffy chest bib and cheek puffs
    ctx.fillStyle = t.belly;
    for (const [x0, y0, q] of [[0, 0.62, 0.34], [-0.28, 0.55, 0.28], [0.28, 0.55, 0.28], [-0.5, 0.36, 0.24], [0.5, 0.36, 0.24], [0, 0.85, 0.24]]) {
      ctx.beginPath(); ctx.arc(x0 * R, y0 * R, q * R, 0, 7); ctx.fill();
    }
    r = R * 0.7;
  }
  const lw = Math.max(1.5, r * 0.09);

  // ears (CeCe gets big Maine Coon tufts, Cleo's are tan)
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * r * 0.95, -r * 0.25); ctx.lineTo(s * r * 0.72, -r * 1.22); ctx.lineTo(s * r * 0.12, -r * 0.84); ctx.closePath();
    ctx.fillStyle = type === 'cleo' ? t.patch : t.body; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = t.dark; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * r * 0.78, -r * 0.45); ctx.lineTo(s * r * 0.69, -r * 1.0); ctx.lineTo(s * r * 0.34, -r * 0.76); ctx.closePath();
    ctx.fillStyle = '#f5a3b7'; ctx.fill();
    if (type === 'cece') {
      ctx.strokeStyle = t.dark; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [dx, len] of [[0, 0.32], [0.09, 0.26], [-0.09, 0.24]]) { ctx.moveTo(s * r * 0.72, -r * 1.2); ctx.lineTo(s * r * (0.72 + dx), -r * (1.2 + len)); }
      ctx.stroke();
      ctx.strokeStyle = '#f4f5f7'; ctx.lineWidth = r * 0.05;   // fur sticking out of the ears
      ctx.beginPath(); ctx.moveTo(s * r * 0.55, -r * 0.7); ctx.lineTo(s * r * 0.62, -r * 0.98); ctx.moveTo(s * r * 0.5, -r * 0.72); ctx.lineTo(s * r * 0.5, -r * 0.95); ctx.stroke();
    }
  }

  // head / body
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = t.body; ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
  if (type === 'baby' || type === 'cece') {
    // tabby stripes
    ctx.strokeStyle = t.dark; ctx.lineWidth = r * 0.11; ctx.lineCap = 'round';
    for (const dx of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(dx * r, -r * 0.98); ctx.lineTo(dx * r * 0.75, -r * 0.62); ctx.stroke(); }
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.98, -r * 0.05); ctx.lineTo(s * r * 0.72, r * 0.02); ctx.moveTo(s * r * 0.98, r * 0.18); ctx.lineTo(s * r * 0.7, r * 0.2); ctx.stroke(); }
  }
  if (type === 'cleo') {
    // Turkish Van: white with tan patches on top of the head
    ctx.fillStyle = t.patch;
    ctx.beginPath(); ctx.ellipse(-r * 0.62, -r * 0.78, r * 0.55, r * 0.42, 0.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, -r * 0.78, r * 0.55, r * 0.42, -0.5, 0, 7); ctx.fill();
  }
  ctx.fillStyle = t.belly; ctx.beginPath(); ctx.ellipse(0, r * 0.48, r * 0.55, r * 0.4, 0, 0, 7); ctx.fill();
  if (type === 'cece') {
    // fluffy cheeks
    ctx.fillStyle = t.belly;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.55, r * 0.42, r * 0.32, 0, 7); ctx.fill(); }
  }
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = t.dark; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();

  // ninja headband for Baby
  if (type === 'baby') {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
    ctx.fillStyle = '#d6303c'; ctx.fillRect(-r, -r * 0.62, r * 2, r * 0.26);
    ctx.restore();
    ctx.fillStyle = '#d6303c';
    ctx.beginPath(); ctx.moveTo(r * 0.92, -r * 0.5); ctx.lineTo(r * 1.55, -r * 0.85); ctx.lineTo(r * 1.45, -r * 0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.92, -r * 0.45); ctx.lineTo(r * 1.6, -r * 0.3); ctx.lineTo(r * 1.4, -r * 0.12); ctx.closePath(); ctx.fill();
  }

  // eyes
  const angry = !opts.calm;
  for (const s of [-1, 1]) {
    const ex = s * r * 0.36, ey = -r * 0.08;
    ctx.fillStyle = t.eye; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.21, r * 0.24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(ex + r * 0.05, ey + r * 0.02, r * 0.07, r * 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - r * 0.05, ey - r * 0.08, r * 0.05, 0, 7); ctx.fill();
    if (type === 'cleo') {
      // elegant: half-closed lids and lashes
      ctx.fillStyle = t.body; ctx.beginPath(); ctx.ellipse(ex, ey - r * 0.14, r * 0.26, r * 0.17, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - r * 0.22, ey - r * 0.12); ctx.lineTo(ex + r * 0.22, ey - r * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + s * r * 0.2, ey - r * 0.12); ctx.lineTo(ex + s * r * 0.33, ey - r * 0.24); ctx.stroke();
    } else if (angry) {
      ctx.strokeStyle = type === 'baby' ? '#1a1a1a' : '#3a2512'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * r * 0.62, -r * 0.4); ctx.lineTo(s * r * 0.14, -r * 0.24); ctx.stroke();
    }
  }
  // nose + mouth
  ctx.fillStyle = '#f06d8f';
  ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.22); ctx.lineTo(r * 0.1, r * 0.22); ctx.lineTo(0, r * 0.33); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.33); ctx.quadraticCurveTo(-r * 0.12, r * 0.48, -r * 0.22, r * 0.4);
  ctx.moveTo(0, r * 0.33); ctx.quadraticCurveTo(r * 0.12, r * 0.48, r * 0.22, r * 0.4);
  ctx.stroke();
  // whiskers
  ctx.strokeStyle = 'rgba(40,30,30,0.55)'; ctx.lineWidth = Math.max(1, r * 0.035);
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    ctx.beginPath(); ctx.moveTo(s * r * 0.32, r * 0.32 + k * r * 0.07); ctx.lineTo(s * r * 1.18, r * 0.24 + k * r * 0.17); ctx.stroke();
  }
  // Cleo's little bow
  if (type === 'cleo') {
    ctx.fillStyle = '#e8578f';
    const bx = r * 0.5, by = -r * 0.95;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - r * 0.3, by - r * 0.18); ctx.lineTo(bx - r * 0.3, by + r * 0.18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + r * 0.3, by - r * 0.18); ctx.lineTo(bx + r * 0.3, by + r * 0.18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, r * 0.09, 0, 7); ctx.fill();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
}

function drawCoon(x, y, r, ang, g) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const lw = r * 0.08;
  // head
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
    // bandage
    ctx.save(); ctx.translate(-r * 0.45, r * 0.05); ctx.rotate(-0.6);
    ctx.fillStyle = '#f2d2a9'; rr(-r * 0.28, -r * 0.08, r * 0.56, r * 0.16, r * 0.05); ctx.fill();
    ctx.restore();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  if (g && g.boss && g.hp < g.maxHp) {
    const w = 90, f = Math.max(0, g.hp / g.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(x - w / 2 - 3, y - r - 50, w + 6, 14, 7); ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#6cd46c' : f > 0.25 ? '#ffcc33' : '#ff5a4a'; rr(x - w / 2, y - r - 47, w * f, 8, 4); ctx.fill();
  }
}

function hash(n) { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }

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

// ---------------------------------------------------------------- background (drawn once)

function buildBackground() {
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  let gr = g.createLinearGradient(0, 0, 0, GROUND);
  gr.addColorStop(0, '#2c2350'); gr.addColorStop(1, '#4e3c76');
  g.fillStyle = gr; g.fillRect(0, 0, W, GROUND);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 28, GROUND);

  // the window the raccoons broke in through
  const wx = 470, wy = 120, ww = 300, wh = 280;
  gr = g.createLinearGradient(0, wy, 0, wy + wh);
  gr.addColorStop(0, '#0a1838'); gr.addColorStop(1, '#22406f');
  g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) { g.globalAlpha = 0.4 + hash(i * 3) * 0.6; g.beginPath(); g.arc(wx + hash(i) * ww, wy + hash(i + 50) * wh * 0.8, 0.8 + hash(i + 9) * 1.6, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  g.shadowColor = 'rgba(255,245,200,0.8)'; g.shadowBlur = 30;
  g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(wx + 205, wy + 80, 36, 0, 7); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(200,190,140,0.5)';
  for (const [dx, dy, r] of [[-10, -8, 7], [12, 10, 5], [-6, 16, 4]]) { g.beginPath(); g.arc(wx + 205 + dx, wy + 80 + dy, r, 0, 7); g.fill(); }
  // broken pane
  g.fillStyle = '#071029';
  g.beginPath(); g.moveTo(wx + ww / 2 + 30, wy + wh); g.lineTo(wx + ww / 2 + 55, wy + wh / 2 + 40); g.lineTo(wx + ww / 2 + 80, wy + wh / 2 + 75);
  g.lineTo(wx + ww / 2 + 110, wy + wh / 2 + 50); g.lineTo(wx + ww - 20, wy + wh); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(wx + ww / 2 + 55, wy + wh / 2 + 40); g.lineTo(wx + ww / 2 + 40, wy + wh / 2 + 10);
  g.moveTo(wx + ww / 2 + 110, wy + wh / 2 + 50); g.lineTo(wx + ww - 8, wy + wh / 2 + 20); g.stroke();
  g.strokeStyle = '#e8dcc0'; g.lineWidth = 14; g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
  g.fillStyle = '#e8dcc0'; g.fillRect(wx - 22, wy + wh + 4, ww + 44, 16);
  // muddy paw prints from the sill down the wall
  g.fillStyle = 'rgba(30,20,15,0.35)';
  for (let i = 0; i < 6; i++) {
    const px = wx + ww + 30 + i * 70, py = wy + wh + 60 + i * 55 + (i % 2) * 18;
    g.beginPath(); g.ellipse(px, py, 8, 6, 0, 0, 7); g.fill();
    for (const [dx, dy] of [[-8, -9], [-2, -12], [5, -11], [10, -6]]) { g.beginPath(); g.arc(px + dx, py + dy, 2.6, 0, 7); g.fill(); }
  }
  // curtains
  g.fillStyle = '#b8324f';
  for (const [x0, dir] of [[wx - 55, 1], [wx + ww - 5, -1]]) {
    g.beginPath(); g.moveTo(x0, wy - 35);
    g.lineTo(x0 + 60, wy - 35);
    g.quadraticCurveTo(x0 + 30 + dir * 25, wy + wh / 2, x0 + 60, wy + wh + 70);
    g.lineTo(x0, wy + wh + 70); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3;
    for (const k of [15, 32, 47]) { g.beginPath(); g.moveTo(x0 + k, wy - 30); g.lineTo(x0 + k, wy + wh + 65); g.stroke(); }
  }
  g.fillStyle = '#d4a537'; g.fillRect(wx - 75, wy - 44, ww + 150, 8);

  // framed fish picture
  const fx = 1010, fy = 150;
  g.fillStyle = '#d4a537'; g.fillRect(fx, fy, 180, 130);
  g.fillStyle = '#bfe6f5'; g.fillRect(fx + 12, fy + 12, 156, 106);
  g.fillStyle = '#ff9a3c';
  g.beginPath(); g.ellipse(fx + 85, fy + 65, 40, 22, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(fx + 120, fy + 65); g.lineTo(fx + 148, fy + 45); g.lineTo(fx + 148, fy + 85); g.closePath(); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.arc(fx + 62, fy + 60, 4, 0, 7); g.fill();
  // a cat-shaped clock
  g.fillStyle = '#1b1b22'; g.beginPath(); g.arc(1380, 200, 42, 0, 7); g.fill();
  g.beginPath(); g.moveTo(1345, 178); g.lineTo(1352, 135); g.lineTo(1375, 160); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(1415, 178); g.lineTo(1408, 135); g.lineTo(1385, 160); g.closePath(); g.fill();
  g.fillStyle = '#fff6e6'; g.beginPath(); g.arc(1380, 205, 28, 0, 7); g.fill();
  g.strokeStyle = '#1b1b22'; g.lineWidth = 3; g.beginPath(); g.moveTo(1380, 205); g.lineTo(1380, 186); g.moveTo(1380, 205); g.lineTo(1393, 212); g.stroke();

  // baseboard + floor
  g.fillStyle = '#d8c6a2'; g.fillRect(0, GROUND - 22, W, 22);
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, GROUND - 4, W, 4);
  g.fillStyle = '#8a5a33'; g.fillRect(0, GROUND, W, H - GROUND);
  g.strokeStyle = '#6e4424'; g.lineWidth = 2;
  for (let y = GROUND + 26, row = 0; y < H; y += 26, row++) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  for (let row = 0; row < 4; row++) for (let x = (row % 2) * 110; x < W; x += 220) {
    g.beginPath(); g.moveTo(x, GROUND + row * 26); g.lineTo(x, GROUND + row * 26 + 26); g.stroke();
  }
  return c;
}
const bg = buildBackground();

// ---------------------------------------------------------------- screens

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
  ctx.strokeStyle = strain > 0 ? `rgb(${232},${Math.round(87 - 60 * strain)},${Math.round(143 - 110 * strain)})` : '#e8578f';
  ctx.lineWidth = 8 - 4 * strain; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt';
}
function snappedBands() {
  // the two broken ends dangle and swing for a moment
  const sway = Math.sin(frame * 0.25) * 10 * (snapTimer / 100);
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
      ctx.fillStyle = `rgba(255,255,255,${0.85 - i / 90})`;
      ctx.beginPath(); ctx.arc(x, y, 5 - i / 25, 0, 7); ctx.fill();
    }
  }
}

function drawPlay() {
  drawSlingBack();
  // waiting cats sit in line behind the slingshot
  queue.forEach((type, i) => {
    const r = CATS[type].r * 0.72, x = SLING.x - 72 - i * 60, bob = Math.sin(frame * 0.05 + i) * 2;
    drawCat(x, GROUND - r + bob, r, 0, type, { calm: true });
  });

  const loaded = phase === 'aim' && current;
  const strain = loaded && current === 'cece' && !bandSnapped ? Math.max(0, Math.min(1, (Math.hypot(pull.x, pull.y) - SNAP_PULL * 0.6) / (SNAP_PULL * 0.4))) : 0;
  const snapping = loaded && dragging && willSnap();
  const jig = strain > 0.6 ? (Math.random() - 0.5) * 4 * strain : 0;     // the slingshot creaks under her
  const tip = { x: SLING.x + pull.x + jig, y: SLING.y + pull.y + jig };
  if (loaded && !snapping) band(SLING.x + 26, 646, tip.x + 6, tip.y, strain);
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
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        g.trail.forEach((p, i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); } });
      }
      if (g.shake > 0) {
        // the head shake: fast side-to-side wobble with blurry ghost copies
        const amt = g.shake / 42, w = Math.sin(g.shake * 1.6) * 0.5 * amt;
        ctx.globalAlpha = 0.3;
        drawCat(b.position.x - 9 * amt, b.position.y, g.r, b.angle - w, g.type);
        drawCat(b.position.x + 9 * amt, b.position.y, g.r, b.angle + w, g.type);
        ctx.globalAlpha = 1;
        drawCat(b.position.x + w * 14, b.position.y, g.r, b.angle + w, g.type);
      } else {
        drawCat(b.position.x, b.position.y, g.r, b.angle, g.type, { alpha: g.clone ? 0.75 : 1 });
      }
    }
  }

  if (loaded) {
    if (dragging && !snapping) drawTrajectory();
    drawCat(tip.x, tip.y, CATS[current].r, 0, current);
    if (!snapping) band(SLING.x - 24, 646, tip.x - 6, tip.y, strain);
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
    }
    else if (p.type === 'chip') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); starShape(0, 0, p.s, p.color); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    text(p.text, p.x, p.y, p.big ? 34 : 24, p.big ? '#ffd84a' : '#ffffff', { stroke: '#3a2160', strokeW: 6 });
  }
  ctx.globalAlpha = 1;

  // HUD
  text('Score ' + score.toLocaleString(), 40, 48, 38, '#fff', { align: 'left', stroke: '#2a1a4a', strokeW: 8 });
  text(`Level ${levelIdx + 1}: ${LEVELS[levelIdx].name}`, 40, 92, 22, '#e7dcff', { align: 'left', stroke: '#2a1a4a', strokeW: 6, weight: 500 });
  if (state === 'play') {
    iconButton('sound', 1380, 52, () => { sfx.on = !sfx.on; });
    iconButton('levels', 1460, 52, () => { state = 'levels'; });
    iconButton('restart', 1540, 52, () => loadLevel(levelIdx));
  }

  let hint = null;
  if (state === 'play' && phase === 'aim' && current && !dragging) {
    hint = !launchedOnce ? 'Pull the cat back and let go!'
      : current === 'cece' ? 'CeCe is up! Careful, she\'s heavy...' : `${CATS[current].name} is up!`;
  } else if (state === 'play' && phase === 'aim' && dragging && current === 'cece') {
    hint = bandSnapped ? 'Oops! Let go and watch her plop...' : strain > 0.4 ? 'Easy... she\'s really heavy!' : null;
  } else if (state === 'play' && phase === 'flying' && !powerUsed && flying[0] && !flying[0].game.done) {
    hint = CATS[flying[0].game.type].hint;
  }
  if (hint) text(hint, W / 2, 150, 34, '#ffe9a8', { stroke: '#2a1a4a', strokeW: 8 });
  if (state === 'play' && phase === 'aim' && current && !launchedOnce && !dragging) {
    // little hand showing the pull gesture
    const k = (Math.sin(frame * 0.05) + 1) / 2;
    const hx = SLING.x - k * 90, hy = SLING.y + 20 + k * 40;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(hx, hy, 14, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hx, hy, 22, 0, 7); ctx.stroke();
  }
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(10,5,25,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(x - w / 2, y - h / 2 + 10, w, h, 30); ctx.fill();
  ctx.fillStyle = '#fff6e6'; rr(x - w / 2, y - h / 2, w, h, 30); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#e8b06a'; ctx.stroke();
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
  ctx.fillStyle = 'rgba(10,5,25,0.35)'; ctx.fillRect(0, 0, W, H);
  text("Vickie's", W / 2, 150, 64, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  text('ANGRY CATS', W / 2, 250, 130, '#ff7a59', { stroke: '#3a2160', strokeW: 20 });
  text('Raccoon burglars stole the treats and toys. Get them back!', W / 2, 345, 30, '#fff', { stroke: '#3a2160', strokeW: 7, weight: 500 });
  const bob = k => Math.sin(frame * 0.05 + k) * 6;
  drawCat(330, 560 + bob(0), 46, -0.1, 'baby');
  drawCat(470, 540 + bob(1), 80, 0, 'cece');
  drawCat(615, 560 + bob(2), 52, 0.08, 'cleo');
  text('Baby', 330, 640, 24, '#fff', { stroke: '#3a2160', strokeW: 6 });
  text('CeCe', 470, 640, 24, '#fff', { stroke: '#3a2160', strokeW: 6 });
  text('Cleo', 615, 640, 24, '#fff', { stroke: '#3a2160', strokeW: 6 });
  drawCoon(1130, 560 + bob(3), 64, Math.sin(frame * 0.03) * 0.1, { hp: 30, maxHp: 30, blink: 50 });
  drawCoon(1290, 575 + bob(4), 46, 0.1, { hp: 30, maxHp: 30, blink: 120 });
  ctx.save(); ctx.translate(1215, 640); ctx.rotate(-0.2);
  drawLoot({ position: { x: 0, y: 0 }, angle: 0, game: { type: 'fish' } });
  ctx.restore();
  button('PLAY', W / 2, 760, 280, 96, '#4caf6a', () => { state = 'levels'; });
}

function drawLevels() {
  ctx.fillStyle = 'rgba(10,5,25,0.5)'; ctx.fillRect(0, 0, W, H);
  text('Pick a level', W / 2, 120, 64, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  iconButton('back', 80, 80, () => { state = 'menu'; });
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
      uiButtons.push({ x, y, w, h, action: () => loadLevel(i) });
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
  scale = Math.min(cw / W, ch / H) * dpr;
  offX = (canvas.width - W * scale) / 2; offY = (canvas.height - H * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

function render() {
  uiButtons = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d22'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.drawImage(bg, 0, 0, W, H);
  if (state === 'menu') drawMenu();
  else if (state === 'levels') drawLevels();
  else { drawPlay(); if (state === 'won') drawWon(); else if (state === 'lost') drawLost(); }
  ctx.restore();
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

// Handy for testing: game.html?level=3 jumps straight in.
const qLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);
if (qLevel >= 1 && qLevel <= LEVELS.length) loadLevel(qLevel - 1);
