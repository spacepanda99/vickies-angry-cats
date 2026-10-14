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
const GAME_VERSION = 64;                   // bump with each release (matches the sw.js cache name)
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
  book:   { density: 0.0018, health: 60, friction: 0.3, fill: '#e98f8f', edge: '#8a4b4b', points: 400 },             // domino books (slippery, so the chain falls all the way)
  catnip: { density: 0.0015, health: 22, fill: '#8fd07a', edge: '#3f7a3c', points: 300, explodes: true }, // like TNT
  decoy:  { density: 0.0008, health: 15, fill: '#d9b98c', edge: '#9a7a50', points: 3000 },           // cardboard boss
  yarnball: { density: 0.006, fill: '#7fb3e6', edge: '#4a7fb3', points: 0 },                         // rolling boulder (unbreakable)
  shelf:  { fill: '#b07d4f', edge: '#7a4f2a', points: 0 },                                           // fixed to the wall
  ramp:   { fill: '#e2c69c', edge: '#a8875a', points: 0 },                                           // fixed cardboard slide
  cage:   { density: 0.0015, health: 30, fill: 'rgba(225,235,250,0.3)', edge: '#7d8594', points: 0 },    // a kitten is locked inside
  mug:    { density: 0.0012, health: 14, fill: '#f7f3ea', edge: '#8f8676', points: 250 },              // Easter egg: swipe it off yourself
  robovac: { density: 0.01, health: 220, fill: '#3b3f4a', edge: '#1d2027', points: 3000 },            // level 14: the hijacked robot vacuum
  basket:   { fill: '#c8925a', edge: '#7a5230', points: 0 },                                          // level 14: hanging basket (unbreakable)
  cucumber: { density: 0.0012, fill: '#5aa846', edge: '#2f6b28', points: 0 },                         // Easter egg: cats vs cucumbers (unbreakable)
  toymouse: { density: 0.0008, fill: '#b9b2c8', edge: '#6e6682', points: 0 },                         // Easter egg: a toy mouse (unbreakable)
  lamp:     { fill: '#3b3a52', edge: '#1d1c2b', points: 0 },                                          // level 16: a lamp a cat can switch on (fixed)
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
// a zero-gravity bubble (Angry Birds Space): anything inside floats; knock it out and it falls
function bubble(lv, x, y, r) { lv.bubbles.push({ x, y, r }); }
// a mug sitting on something. Cats knock things off tables, and so can you: swipe it off with a finger
// for a small secret bonus (a cat knocking it over doesn't count)
function mug(lv, x, base) { block(lv, 'mug', x, base - 15, 26, 30); }
// later-level Easter eggs: a cucumber on the floor (a cat that touches it leaps in fright),
// and a patch of sunshine where a cat that comes to rest curls up for a nap
function cucumber(lv, x) { block(lv, 'cucumber', x, GROUND - 10, 70, 20); }
// a toy mouse: a cat that bumps it squeaks and pounces (Easter egg)
function toyMouse(lv, x, y = GROUND - 13) { block(lv, 'toymouse', x, y, 54, 26); }
function sunbeam(lv, x, w) { lv.sunbeam = { x, w }; }
// Moving targets (level 14). A robot vacuum the raccoons have hijacked: it drives back and forth between
// x0 and x1 with a raccoon riding on top. Hit it hard and it stalls for a moment.
function robovac(lv, x0, x1) { lv.vacs.push({ x0, x1 }); }
// a raccoon in a basket swinging from a hook in the ceiling. A cat that flies through the rope claws it
// in two and the basket drops.
function swingBasket(lv, ax, ay, len) { lv.swings.push({ x: ax, y: ay, len }); }
// Level 16 (night): a lamp a cat switches on by touching it. The raccoons wear night-vision goggles and shrug off
// nearly everything in the dark; a lit lamp blinds the goggles of every raccoon near it (so does a catnip blast).
// A tall floor lamp, or a short table lamp (give h) on a shelf.
const LAMP_R = 340;
function lamp(lv, x, base, h = 120) { lv.blocks.push({ mat: 'lamp', x, y: base - h / 2, w: 34, h, fixed: true }); }
// Level 15 (night): lookout() puts a raccoon with a sweeping flashlight on top of the fort.
function lookout(lv, x, base) { lv.raccoons.push({ x, y: base - 37, r: 36, flashlight: true }); }
// a pair of magic cat flaps (Angry Birds Seasons' portals): whatever goes in one comes out the other,
// same speed, same heading
const PORTAL_R = 52;
function portal(lv, ax, ay, bx, by) {
  const n = lv.portals.length;
  lv.portals.push({ x: ax, y: ay, link: n + 1, color: '#b06cff', glow: '176,108,255' }, { x: bx, y: by, link: n, color: '#ff9a3c', glow: '255,154,60' });
}

// Every level gets each cat exactly once.
const LEVELS = [
  { name: 'The Back Door', cats: ['cleo', 'baby', 'cece'], build(lv) {
    const t = hut(lv, 1150, GROUND, 160, 100, 'wood', 'wood');
    coon(lv, 1150, GROUND); coon(lv, 1150, t); mug(lv, 1205, t);
    loot(lv, 1300, GROUND, 'fish');
  } },
  { name: 'Kitchen Raid', cats: ['baby', 'cleo', 'cece'], build(lv) {
    const t1 = hut(lv, 1020, GROUND, 140, 110, 'glass', 'wood'); coon(lv, 1020, GROUND);
    const t2 = hut(lv, 1020, t1, 140, 110, 'glass', 'wood'); coon(lv, 1020, t1); coon(lv, 1020, t2);
    const t3 = hut(lv, 1300, GROUND, 170, 90, 'wood', 'glass'); coon(lv, 1300, GROUND);
    loot(lv, 1300, t3, 'yarn'); mug(lv, 1360, t3);
  } },
  { name: 'The Garage', bird: true, cats: ['cleo', 'cece', 'baby'], build(lv) {
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
  // CeCe's first turn up front: she can't fly this far, but she bowls into the tower's stone footing and a
  // well-timed shake brings the whole thing down. The rafter raccoon is out of her reach: that's for the flyers.
  { name: 'Attic Hideout', cats: ['cece', 'cleo', 'baby'], intro: 'Roll CeCe into the tower, then tap to shake!', build(lv) {
    let t = GROUND;
    for (let i = 0; i < 3; i++) { const nt = hut(lv, 1430, t, 124, 120, i === 0 ? 'stone' : i === 1 ? 'glass' : 'wood', 'wood'); coon(lv, 1430, t, false, i > 0); t = nt; }
    coon(lv, 1430, t);
    const r = shelf(lv, 1080, 650, 120); coon(lv, 1060, r); loot(lv, 1118, r, 'yarn');   // up in the rafters
    loot(lv, 1250, GROUND, 'fish');
  } },
  { name: 'The Big Boss Bandit', cats: ['cleo', 'baby', 'cece'], build(lv) {
    const t = hut(lv, 1200, GROUND, 320, 150, 'stone', 'stone'); coon(lv, 1200, GROUND, true);
    const a = hut(lv, 1120, t, 140, 100, 'wood', 'glass'); coon(lv, 1120, t);
    hut(lv, 1280, t, 140, 100, 'wood', 'glass'); coon(lv, 1280, t);
    loot(lv, 1120, a, 'fish');
    hut(lv, 950, GROUND, 110, 80, 'glass', 'wood'); loot(lv, 950, GROUND, 'yarn');
    toyMouse(lv, 700);                                                      // a toy mouse someone left out
  } },
  // Levels 7-10 borrow classic Angry Birds set pieces: chain-reaction dominoes, rolling boulders,
  // TNT, balloons (Danger Above) and the cardboard King Pig decoy (Mighty Hoax).
  { name: 'Bookshelf Dominoes', cats: ['cleo', 'baby', 'cece'], build(lv) {
    for (let i = 0; i < 7; i++) book(lv, 820 + i * 50, 120 + (i % 3) * 8);   // knock the first one over...
    book(lv, 1185, 150); catnip(lv, 1185, GROUND - 150);                     // ...and the last one drops the catnip
    const t = hut(lv, 1340, GROUND, 150, 100, 'glass', 'wood'); coon(lv, 1340, GROUND); loot(lv, 1340, t, 'fish');
    const s1 = shelf(lv, 1050, 610, 230); coon(lv, 1000, s1); coon(lv, 1100, s1); mug(lv, 1152, s1);
    const s2 = shelf(lv, 1360, 560, 170); coon(lv, 1335, s2); loot(lv, 1410, s2, 'yarn');
  } },
  { name: 'Yarn Ball Avalanche', bird: true, cats: ['baby', 'cece', 'cleo'], build(lv) {
    // a cardboard hill low enough for CeCe to bowl up: she shoves the yarn ball off the top
    ramp(lv, [[720, GROUND], [860, GROUND - 130], [920, GROUND - 130], [1140, GROUND]]);
    yarnBall(lv, 890, GROUND - 130, 44);                                    // nudge it down the slide
    hut(lv, 1250, GROUND, 140, 100, 'glass', 'wood'); coon(lv, 1250, GROUND);
    const t1 = hut(lv, 1390, GROUND, 140, 100, 'wood', 'glass'); coon(lv, 1390, GROUND);
    const t2 = hut(lv, 1390, t1, 120, 90, 'glass', 'wood'); coon(lv, 1390, t1);
    yarnBall(lv, 1390, t2, 36);
  } },
  // CeCe goes last here: one shake on the floor crates set off the whole chain, so she's the closer
  { name: 'Catnip Kaboom', cats: ['baby', 'cleo', 'cece'], build(lv) {
    const s1 = hut(lv, 1050, GROUND, 170, 100, 'stone', 'stone'); coon(lv, 1050, GROUND, false, true);
    const w = hut(lv, 1050, s1, 120, 90, 'wood', 'wood'); coon(lv, 1050, s1); catnip(lv, 1050, w);
    const s2 = hut(lv, 1330, GROUND, 170, 100, 'stone', 'stone'); coon(lv, 1330, GROUND, false, true);
    coon(lv, 1300, s2); catnip(lv, 1385, s2);
    catnip(lv, 930, GROUND); catnip(lv, 1190, GROUND); catnip(lv, 1450, GROUND);
    cucumber(lv, 850);                                                      // who left that there?
  } },
  // The boss up on the shelf is a cardboard decoy; the real one hides on the floor underneath. Only a
  // shake from CeCe, rolled right up against him, takes him out, so she goes first while the lane is clear.
  { name: 'Balloon Getaway', cats: ['cece', 'cleo', 'baby'], build(lv) {
    floatie(lv, 1000, 570); floatie(lv, 1250, 505);
    const s = shelf(lv, 1420, 640, 220); block(lv, 'decoy', 1420, s - 70, 92, 140);   // the boss? not quite...
    coon(lv, 1420, GROUND, true);
    block(lv, 'stone', 1560, GROUND - 90, 30, 180);
    loot(lv, 1520, GROUND, 'fish');
  } },
  // Fan favourites: Rio's caged friends to set free, a Rube Goldberg chain (yarn ball, slide, catnip),
  // helmet-wearing toughies, and a hidden golden egg (here a golden fish) for the bonus hunters.
  { name: 'Kitten Rescue', cats: ['baby', 'cece', 'cleo'], build(lv) {
    sunbeam(lv, 640, 160);                                                  // a warm spot for a nap
    ramp(lv, [[900, GROUND], [900, 600], [1110, GROUND]]);
    const top = shelf(lv, 872, 592, 80); yarnBall(lv, 875, top, 40);      // nudge it: it rolls into the catnip...
    catnip(lv, 1135, GROUND);
    cage(lv, 1220, GROUND);                                                 // ...which blows this cage open
    const t1 = hut(lv, 1360, GROUND, 170, 120, 'stone', 'wood'); coon(lv, 1360, GROUND, false, true);
    const t2 = hut(lv, 1360, t1, 140, 100, 'wood', 'glass'); coon(lv, 1360, t1);
    coon(lv, 1318, t2, false, true); cage(lv, 1400, t2, 70);
    const g = shelf(lv, 1490, 400, 70); loot(lv, 1490, g, 'goldfish');     // the secret
  } },
  // Angry Birds Space's zero-gravity bubbles, the most-loved spin-off mechanic: the kids' science-fair
  // anti-gravity bubbles. Inside one nothing falls, so shots fly dead straight and raccoons drift.
  { name: 'Zero-G Zoomies', bird: true, cats: ['cleo', 'cece', 'baby'], build(lv) {
    bubble(lv, 1060, 560, 160);
    toyMouse(lv, 1010, 660);                                                // a toy mouse, floating in the bubble
    coon(lv, 1060, 597);                                                    // floating in the middle
    block(lv, 'wood', 985, 520, 20, 100); block(lv, 'glass', 1135, 600, 20, 100); block(lv, 'wood', 1060, 478, 110, 18);
    catnip(lv, 1000, 660); loot(lv, 1120, 520, 'yarn');
    bubble(lv, 1330, 460, 115);
    coon(lv, 1330, 497, false, true); mug(lv, 1268, 430);
    hut(lv, 900, GROUND, 110, 80, 'glass', 'wood'); coon(lv, 900, GROUND);
    const t = hut(lv, 1330, GROUND, 170, 110, 'stone', 'wood'); coon(lv, 1330, GROUND); coon(lv, 1330, t);
    bubble(lv, 1490, 330, 50); loot(lv, 1490, 344, 'goldfish');            // the secret, up in its own bubble
  } },
  // Magic portals from Angry Birds Seasons, done as a pair of cat flaps. The raccoons are holed up behind
  // tall stone walls; fly through the purple flap and burst out of the orange one inside their fort.
  { name: 'Magic Cat Flaps', cats: ['baby', 'cleo', 'cece'], build(lv) {
    // the purple flap sits on the floor (even a rolling CeCe drops in); the orange one is way up high,
    // pointing straight at a lookout perched above the walls
    portal(lv, 760, 742, 1090, 360);
    block(lv, 'stone', 1010, GROUND - 150, 30, 300);                        // the walls: too tough to bash through
    block(lv, 'stone', 1480, GROUND - 150, 30, 300);
    const p = shelf(lv, 1200, 410, 110); coon(lv, 1200, p);
    hut(lv, 1110, GROUND, 120, 100, 'wood', 'glass'); coon(lv, 1110, GROUND);
    catnip(lv, 1215, GROUND);
    const t = hut(lv, 1340, GROUND, 150, 120, 'glass', 'wood'); coon(lv, 1340, GROUND, false, true); coon(lv, 1340, t);
    loot(lv, 1440, GROUND, 'fish');
    const g = shelf(lv, 1420, 390, 70); loot(lv, 1420, g, 'goldfish');     // the secret: roll CeCe through the flap just right
  } },
  // Moving targets, the next step up: the raccoons have hijacked the robot vacuum (cats' sworn enemy) and
  // ride it back and forth, and one swings overhead in a laundry basket. Time your shots, or claw the rope.
  { name: 'Robo-Vac Rodeo', cats: ['cece', 'baby', 'cleo'], intro: 'Claw through the rope to drop the basket!', build(lv) {
    robovac(lv, 960, 1290);
    swingBasket(lv, 1170, 300, 240);
    const t = hut(lv, 1440, GROUND, 130, 160, 'wood', 'wood'); coon(lv, 1440, GROUND, false, true);
    coon(lv, 1410, t); catnip(lv, 1472, t);
    const g = shelf(lv, 1530, 430, 60); loot(lv, 1530, g, 'goldfish');     // the secret, high on the wall past the dresser
  } },
  // Night. The cats wait in the soft glow of a night light; the raccoons' fort is in the dark kitchen,
  // just faint outlines. A raccoon at the fridge flings the door open for a moment when the camera first
  // pans over, and again after every shot: memorise the fort, then see what your shot did.
  { name: 'Midnight Snack', cats: ['baby', 'cleo', 'cece'], night: true, fridge: true, intro: 'Watch closely when the fridge opens!', build(lv) {
    const t1 = hut(lv, 1080, GROUND, 140, 120, 'stone', 'wood'); coon(lv, 1080, GROUND);
    const t2 = hut(lv, 1080, t1, 120, 100, 'wood', 'glass'); coon(lv, 1080, t1);
    coon(lv, 1080, t2);
    catnip(lv, 1230, GROUND); block(lv, 'glass', 1180, GROUND - 25, 30, 50); block(lv, 'glass', 1280, GROUND - 25, 30, 50);
    const t3 = hut(lv, 1390, GROUND, 160, 140, 'wood', 'stone'); coon(lv, 1390, GROUND, false, true);
    const t4 = hut(lv, 1390, t3, 120, 90, 'glass', 'wood'); loot(lv, 1390, t3, 'fish');
    catnip(lv, 1360, t4); mug(lv, 1425, t4);
    loot(lv, KITCHEN.fridge.x + 85 - FORT_X, KITCHEN.fridge.top, 'goldfish');   // on top of the fridge: only seen when it opens
  } },
  // Lights Out: the last night level. Combines the cat flaps, balloons and catnip with lighting. The raccoons wear
  // night-vision goggles, so in the dark they barely feel a hit. Touch a lamp with a cat and every raccoon near it is
  // blinded. The floor lamp can be lobbed at; the table lamp sits high on a shelf, and the flap is the way up there.
  { name: 'Lights Out', cats: ['baby', 'cece', 'cleo'], night: true, goggles: true, intro: 'Switch on the lamps to blind their goggles!', build(lv) {
    portal(lv, 600, 742, 1060, 320);
    lamp(lv, 800, GROUND);
    const t1 = hut(lv, 940, GROUND, 130, 110, 'wood', 'wood'); coon(lv, 940, GROUND); coon(lv, 940, t1);
    const sb = shelf(lv, 1260, 400, 100); lamp(lv, 1270, sb, 80);
    floatie(lv, 1380, 540);
    const t2 = hut(lv, 1130, GROUND, 130, 110, 'wood', 'glass'); coon(lv, 1130, GROUND); loot(lv, 1130, t2, 'fish');
    const g = shelf(lv, 1200, 330, 70); loot(lv, 1200, g, 'goldfish');     // the secret: a perfect CeCe roll through the flap
  } },
];

// ---------------------------------------------------------------- saved progress

const STORE_KEY = 'vickysAngryCats.stars';
let bestStars = {};
try { bestStars = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { bestStars = {}; }
function saveStars() { try { localStorage.setItem(STORE_KEY, JSON.stringify(bestStars)); } catch (e) { /* private mode */ } }
// Tap a locked level and enter the code to play it; the code then stays entered on this device.
const UNLOCK_CODE = '7272', CODE_KEY = 'vickiesAngryCats.code';
let codeEntered = false;
try { codeEntered = localStorage.getItem(CODE_KEY) === UNLOCK_CODE; } catch (e) { /* private mode */ }
const unlocked = i => i === 0 || codeEntered || (bestStars[i - 1] || 0) > 0;
let codePad = null;                 // { level, entry, shake } while the code keypad is open
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
  game: { url: 'music-game.ogg', loopStart: 36.3431, loopEnd: 116.3784 },       // level 1
  // levels 2-14: generated per level (same prompt, each with its own flavour); loop points found by matching the sound either side of the seam
  lv2: { url: 'music-lv2.ogg', loopStart: 24.8852, loopEnd: 104.1492 },
  lv3: { url: 'music-lv3.ogg', loopStart: 17.3886, loopEnd: 104.649 },
  lv4: { url: 'music-lv4.ogg', loopStart: 35.1805, loopEnd: 96.2528 },
  lv5: { url: 'music-lv5.ogg', loopStart: 25.8847, loopEnd: 95.703 },
  lv6: { url: 'music-lv6.ogg', loopStart: 32.1819, loopEnd: 102.0002 },
  lv7: { url: 'music-lv7.ogg', loopStart: 39.1787, loopEnd: 108.3473 },
  lv8: { url: 'music-lv8.ogg', loopStart: 41.9774, loopEnd: 120.5418 },
  lv9: { url: 'music-lv9.ogg', loopStart: 26.5344, loopEnd: 87.6067 },
  lv10: { url: 'music-lv10.ogg', loopStart: 6.0437, loopEnd: 148.0293 },
  lv11: { url: 'music-lv11.ogg', loopStart: 4.3445, loopEnd: 108.997 },
  lv12: { url: 'music-lv12.ogg', loopStart: 27.0342, loopEnd: 88.1065 },
  lv13: { url: 'music-lv13.ogg', loopStart: 43.8266, loopEnd: 96.2028 },
  lv14: { url: 'music-lv14.ogg', loopStart: 36.6798, loopEnd: 115.3441 },
  lv15: { url: 'music-lv15.ogg', loopStart: 20.1873, loopEnd: 107.4477 },        // cool late-night vibe
  lv16: { url: 'music-lv16.ogg', loopStart: 43.6267, loopEnd: 96.0029 },         // stealthy lamp-lit night heist
};
// Level 1 keeps the original gameplay track; every other level has its own (music-lvN.ogg), same style and instruments.
const levelTrack = () => MUSIC['lv' + (levelIdx + 1)] && levelIdx > 0 ? 'lv' + (levelIdx + 1) : 'game';
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
    const want = state === 'menu' || state === 'levels' ? 'menu' : levelTrack();
    this.load(want);
    if (this.buffers[want]) this.load(want === 'menu' ? levelTrack() : 'menu');
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
// the face that goes with each chatter bubble
const CHATTER_MOOD = { '♥': { mood: 'happy' }, '♪': { mood: 'happy' }, '!': { mood: 'fierce', k: 0.6 }, '>:3': { mood: 'fierce', k: 0.9 }, '?!': { mood: 'scared' } };
function chatterMood(who) { const c = chatterAt(who); return c ? CHATTER_MOOD[c.sym] || {} : {}; }
// a cat in play: scared just after the cucumber, yowling while she flies, dizzy once a hard crash stops her
function flightMood(b) {
  const g = b.game;
  if (g.scare > 0) return 'scared';
  if (Vector.magnitude(b.velocity) > 2.5) return 'yowl';
  return g.bonked ? 'dizzy' : null;
}
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
let bubbles = [];                   // zero-gravity zones in this level
let portals = [];                   // magic cat flaps in this level
let vacs = [], swings = [];         // level 14's moving machines
const VAC_SPEED = 2.2;
// Easter eggs on every level: a cardboard box to sit in, and a red laser dot that shows up while you aim
const BOX = { x: 1000, w: 110, h: 64 };
let boxCat = null;                  // which cat climbed into the box ("if I fits, I sits")
let laser = null, laserWait = 0, laserCaught = false;
let cucumberScare = false, sun = null, napCat = null;
let eggFlags = {}, bird = null, moonCat = 0, petHold = null, hairball = null, hairCount = 0;   // the cat Easter eggs
let eggBanner = null;               // the big 'you found an Easter egg' badge
const EGG_LEN = 140;

let knocksThisFrame = 0;
let snapStrain = 0;               // frames CeCe has been held past the snap limit
const SNAP_DELAY = 20;              // a third of a second of shaking and creaking before it breaks
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
    density: m.density, friction: m.friction || 0.8, frictionStatic: m.friction ? m.friction * 1.5 : 1.2, restitution: 0.05, label: 'block' });
  const hp = b.fixed || m.health === undefined ? undefined : m.health * Math.max(0.6, Math.min(2.5, (b.w * b.h) / 2000));
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
function makeVac(v) {
  // it runs on rails: it skips the floor (no floor friction fighting its motor) and its height is held fixed
  const body = Bodies.rectangle(v.x0, GROUND - 16, 120, 30, { chamfer: { radius: 13 }, density: MATS.robovac.density, friction: 1, frictionStatic: 2, label: 'block',
    collisionFilter: { category: 0x0001, mask: 0xFFFF & ~0x0004 } });
  Body.setInertia(body, Infinity);                                          // it never tips over
  body.game = { kind: 'block', mat: 'robovac', w: 120, h: 30, hp: MATS.robovac.health, maxHp: MATS.robovac.health, seed: Math.random() * 1000 };
  const rider = makeCoon({ x: v.x0, y: GROUND - 30 - 37, r: 36, helmet: true });
  Body.setInertia(rider, Infinity);                                         // slides with it instead of rolling off
  Composite.add(engine.world, [body, rider]);
  return { body, rider, x0: v.x0, x1: v.x1, dir: 1, stun: 0, cmd: null, vx: 0 };
}
function makeSwing(w) {
  const by = w.y + w.len, opts = { density: 0.002, friction: 0.8 };
  const basket = Body.create({ parts: [Bodies.rectangle(w.x, by, 100, 12, opts), Bodies.rectangle(w.x - 44, by - 26, 12, 52, opts), Bodies.rectangle(w.x + 44, by - 26, 12, 52, opts)],
    frictionAir: 0.002, label: 'block' });
  const handle = { x: w.x, y: by - 90 };                                    // where the rope ties on, above the rim
  basket.game = { kind: 'block', mat: 'basket', handle: Vector.sub(handle, basket.position), seed: Math.random() * 1000 };
  const rope = Constraint.create({ pointA: { x: w.x, y: w.y }, bodyB: basket, pointB: basket.game.handle, length: handle.y - w.y, stiffness: 0.9, damping: 0.02 });
  const rider = makeCoon({ x: w.x, y: by - 6 - 31, r: 30 });
  Composite.add(engine.world, [basket, rope, rider]);
  Body.setVelocity(basket, { x: 4.5, y: 0 }); Body.setVelocity(rider, { x: 4.5, y: 0 });
  return { basket, rope, ax: w.x, ay: w.y, cut: false };
}
function makeCoon(c) {
  const body = Bodies.circle(c.x, c.y, c.r, { density: 0.0025, friction: 0.7, restitution: 0.15, label: 'coon' });
  const hp = c.boss ? 320 : c.helmet ? 75 : 30;   // a colander helmet makes them much tougher
  body.game = { kind: 'coon', r: c.r, boss: c.boss, helmet: c.helmet, hp, maxHp: hp, blink: Math.random() * 200,
    act: c.flashlight ? null : c.boss ? 'fish' : pick(COON_ACTS), flashlight: !!c.flashlight };   // what it's doing with the loot
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

// the day goes by as you play: high noon on level 1, sunset by level 14, night after that
const levelTime = i => LEVELS[i].night ? 1 : Math.min(1, i / 13);
// portraits of the family's own cats on the wall, rotating so everyone gets a turn
const PORTRAIT_LEVELS = [['pumpkin', 'hope'], ['lucky', 'stubby'], ['romeo'], ['pumpkin', 'hope'], ['lucky', 'stubby'], ['romeo'], ['pumpkin', 'hope'], ['lucky', 'stubby'], ['romeo'], ['pumpkin', 'hope'], ['lucky', 'stubby'], ['romeo'], ['pumpkin', 'hope'], ['lucky', 'stubby'], ['romeo'], ['pumpkin', 'hope']];   // Pumpkin and Hope always hang together, as do Lucky and Stubby; Romeo hangs alone
function loadLevel(i) {
  levelIdx = i; finale = null;
  PORTRAITS_NOW = PORTRAIT_LEVELS[i] || [];
  setBackdropTime(levelTime(i), PORTRAITS_NOW.join());
  newEngine();
  const lv = { blocks: [], raccoons: [], loot: [], floats: [], bubbles: [], portals: [], vacs: [], swings: [] };
  LEVELS[i].build(lv);
  for (const v of lv.vacs) { v.x0 += FORT_X; v.x1 += FORT_X; }
  for (const list of [lv.blocks, lv.raccoons, lv.loot, lv.floats, lv.bubbles, lv.portals, lv.swings]) for (const o of list) { o.x += FORT_X; if (o.pts) o.pts = o.pts.map(([x, y]) => [x + FORT_X, y]); }
  Composite.add(engine.world, Bodies.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 3, 120, { isStatic: true, friction: 0.9, label: 'ground', collisionFilter: { category: 0x0004 } }));
  for (const b of lv.blocks) Composite.add(engine.world, makeBlock(b));
  for (const c of lv.raccoons) Composite.add(engine.world, makeCoon(c));
  for (const l of lv.loot) Composite.add(engine.world, makeLoot(l));
  floats = lv.floats.map(makeFloat);
  vacs = lv.vacs.map(makeVac); swings = lv.swings.map(makeSwing);
  for (const f of floats) Composite.add(engine.world, [f.plank, f.coon, ...f.balloons, ...f.balloons.map(b => b.game.rope)]);
  if (LEVELS[i].goggles) for (const b of bodies()) if (b.game && b.game.kind === 'coon') b.game.goggles = true;   // night-vision goggles on every raccoon
  const xs = [...lv.raccoons, ...lv.floats, ...lv.swings, ...lv.vacs.map(v => ({ x: (v.x0 + v.x1) / 2 }))].map(c => c.x);
  fortCenter = xs.reduce((s, x) => s + x, 0) / xs.length;
  queue = LEVELS[i].cats.slice();
  current = queue.shift();
  phase = 'aim'; dragging = false; pull = { x: 0, y: 0 };
  flying = []; powerUsed = false; flyTimer = 0; outTimer = 0; winTimer = -1;
  settle = 90; score = 0; stars = 0; bonus = 0; snapTimer = 0; bandSnapped = false; snapStrain = 0;
  toRemove = []; particles = []; popups = [];
  sun = lv.sunbeam ? { x: lv.sunbeam.x + FORT_X, w: lv.sunbeam.w } : null; napCat = null; cucumberScare = false; eggBanner = null;
  eggFlags = {}; hairCount = 0; hairball = null; petHold = null; moonCat = 0;
  bird = LEVELS[i].bird ? { ox: 0, oy: 0, flee: 0, seed: Math.random() * 100 } : null;
  portals = lv.portals.map(q => ({ ...q, flap: 0 }));
  if (LEVELS[i].intro) popups.push({ x: fortCenter, y: 590, text: LEVELS[i].intro, life: 200, tip: true });
  if (portals.length) popups.push({ x: fortCenter, y: LEVELS[i].intro ? 500 : 590, text: 'Magic cat flaps: in one, out the other!', life: 200, tip: true });
  bubbles = lv.bubbles; boxCat = null; laser = null; laserCaught = false; laserWait = 500 + Math.random() * 500;
  if (bubbles.length) popups.push({ x: fortCenter, y: 590, text: 'Zero gravity inside the bubbles!', life: 200, tip: true });
  // Angry Birds style intro: start looking at the fort, then glide back to the slingshot
  panning = null; panIdle = 999; introTimer = 80;
  reveal = null; shotRevealed = false;
  const tip = !!LEVELS[i].intro && !LEVELS[i].fridge;      // levels with a tip: the camera stays on the fort long enough to read it
  if (tip) introTimer = 200;
  if (LEVELS[i].fridge) { introTimer = 150; startReveal(35); }   // the camera lingers on the dark fort while the fridge opens
  scheduleChatter([current, ...queue], LEVELS[i].fridge ? 140 : tip ? 200 : 70);   // plotting while the camera glides back from the fort
  upBanner = { type: current, t: -((tip ? 200 : 70) + (queue.length + 1) * 16 + 16) };   // then whose turn it is
  cam.x = clampCamX(fortCenter - viewW / 2); cam.y = CAM_TOP;
  state = 'play';
}

// ---------------------------------------------------------------- damage

function massFactor(o) { return o.isStatic ? 2.5 : Math.max(0.4, Math.min(3, o.mass / 4)); }

// raccoons in night-vision goggles take about a tenth of the damage until a lamp or a flash blinds them
const gogglesK = t => t.game && t.game.goggles && !t.game.blind ? 0.12 : 1;
function blindCoon(b) {
  const g = b.game;
  if (!g || g.blind || g.dead) return;
  g.blind = true; g.blindT = 80;
  popups.push({ x: b.position.x, y: b.position.y - g.r - 30, text: 'Blinded!', life: 60 });
  sparkle(b.position, 6);
}
function switchLamp(b) {
  const g = b.game;
  if (g.on) return;
  g.on = true; g.onT = 0;
  popups.push({ x: b.position.x, y: b.position.y - g.h / 2 - 40, text: 'Lights on!', life: 70, big: true });
  sparkle({ x: b.position.x, y: b.position.y - g.h / 2 }, 10);
  sfx.tone('square', 900, 1400, 0.06, 0.1); sfx.thud(0.4);
}
function updateLamps() {
  const on = bodies().filter(b => b.game && b.game.mat === 'lamp' && b.game.on);
  for (const l of on) l.game.onT++;
  if (!LEVELS[levelIdx].goggles) return;
  for (const b of bodies()) {
    const g = b.game;
    if (!g || g.kind !== 'coon' || !g.goggles) continue;
    if (g.blindT > 0) g.blindT--;
    if (!g.blind && on.some(l => Vector.magnitude(Vector.sub(l.position, b.position)) < LAMP_R)) blindCoon(b);
  }
}
function hurt(t, o, rel) {
  const g = t.game;
  if (!g || g.dead || g.hp === undefined) return;
  let d = (rel - 2) * 7 * massFactor(o) * gogglesK(t);
  if (o.game && o.game.kind === 'cat') d *= o.game.mult;
  g.hp -= d;
  if (g.hp <= 0) kill(t);
}
function kill(b) { if (b.game.dead) return; b.game.dead = true; toRemove.push(b); }

function onCollide(ev) {
  for (const p of ev.pairs) {
    const a = p.bodyA, b = p.bodyB, ga = a.game, gb = b.game;
    if (ga && ga.prancing) ga.landed = true;
    if (settle === 0) for (const [c, o] of [[a, b], [b, a]]) if (c.game && c.game.kind === 'cat' && Vector.magnitude(Vector.sub(c.velocity, o.velocity)) > 6) c.game.bonked = true;
    for (const [c, o] of [[ga, gb], [gb, ga]]) if (c && c.kind === 'cat' && CATS[c.type].bumpDamp && o && (o.kind === 'block' || o.kind === 'coon') && !o.fixed && !o.poly && o.mat !== 'toymouse') c.bump = true;   // shelves and slides don't soak it up
    if (gb && gb.prancing) gb.landed = true;
    if (ga && gb) {
      if (ga.kind === 'cat' && gb.mat === 'lamp') switchLamp(b); else if (gb.kind === 'cat' && ga.mat === 'lamp') switchLamp(a);
      if (ga.kind === 'cat' && gb.kind === 'loot') { gb.collected = true; kill(b); }
      else if (gb.kind === 'cat' && ga.kind === 'loot') { ga.collected = true; kill(a); }
      if (!eggFlags.mouse && settle === 0) {
        if (ga.kind === 'cat' && gb.mat === 'toymouse') squeakMouse(b);
        else if (gb.kind === 'cat' && ga.mat === 'toymouse') squeakMouse(a);
      }
      if (!cucumberScare && settle === 0) {
        if (ga.kind === 'cat' && gb.mat === 'cucumber') scareCat(a, b);
        else if (gb.kind === 'cat' && ga.mat === 'cucumber') scareCat(b, a);
      }
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
    snapTimer = 100; bandSnapped = false; body.game.snapped = true;
  } else {
    Body.setVelocity(body, launchVel(current, pull));
  }
  if (current === 'cece') Body.setAngularVelocity(body, snapped ? 0.02 : -pull.x * 0.0012);   // only CeCe rolls
  Composite.add(engine.world, body);
  if (!sfx.cat(CAT_SOUNDS.launch[current], 0.7)) sfx.meow(current === 'baby' ? 1.25 : current === 'cece' ? 0.75 : 1);
  flying = [body]; current = null; phase = 'flying'; powerUsed = false; flyTimer = 0; shotRevealed = false;
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
      if (touching && gogglesK(b) < 1) { b.game.hp -= 18; sparkle(b.position, 3); if (b.game.hp <= 0) kill(b); }   // goggles shrug off the instant wreck
      else if (touching) { b.game.hp = 0; kill(b); sparkle(b.position, 5); }
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
      if (b.game.hp !== undefined) { b.game.hp -= 45 * f * gogglesK(b); if (b.game.hp <= 0) kill(b); }
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
  for (const b of bodies()) if (b.game && b.game.goggles && Vector.magnitude(Vector.sub(b.position, pos)) < 260) blindCoon(b);   // the flash blinds their goggles
  particles.push({ type: 'ring', x: pos.x, y: pos.y, vx: 0, vy: 0, s: 230, life: 22, max: 22 });
  for (let i = 0; i < 18; i++) particles.push({ type: 'puff', x: pos.x + rand(-20, 20), y: pos.y + rand(-20, 20),
    vx: rand(-4, 4), vy: rand(-5, 1), s: rand(14, 30), life: 45, max: 45, color: i % 3 ? '#9be08a' : '#e9ffd9' });
  sparkle(pos, 8);
  sfx.thud(1); sfx.tone('sawtooth', 160, 40, 0.4, 0.18);
}

// ---------------------------------------------------------------- simulation step

function bodies() { return Composite.allBodies(engine.world); }
const inZone = (z, x, y) => (x - z.x) * (x - z.x) + (y - z.y) * (y - z.y) < z.r * z.r;
const inBubble = (x, y) => bubbles.some(z => inZone(z, x, y));

// ---- Easter eggs

// "If I fits, I sits": a cat that ends up in the cardboard box climbs in and stays there
function sitInBox(b) {
  const g = b.game;
  boxCat = g.type; g.done = true; g.boxed = true;
  Composite.remove(engine.world, b);
  eggBonus(g.type === 'cece' ? 'If I fits... I sits!' : 'If I fits, I sits!', 2500, { x: BOX.x, y: GROUND - BOX.h - 20 }, g.type === 'cece' ? '(barely)' : null);
  sfx.cat(pick(CAT_SOUNDS.chatter[g.type]), 0.6, 0.1);
}
// The robot vacuum drives itself (easing into each turn so its rider stays on); a hard hit stalls it.
// The basket gets a tiny push each time it passes the bottom so it keeps swinging, and a flying cat
// that crosses the rope claws it in two.
function updateMachines() {
  for (const v of vacs) {
    const b = v.body;
    b.game.stunned = v.stun > 0;
    if (b.game.dead) continue;
    Sleeping.set(b, false); if (!v.rider.game.dead) Sleeping.set(v.rider, false);
    Body.setPosition(b, { x: b.position.x, y: GROUND - 16 });
    if (v.stun > 0) { v.stun--; v.cmd = null; v.vx = b.velocity.x * 0.95; Body.setVelocity(b, { x: v.vx, y: 0 }); continue; }
    if (b.position.x > v.x1) v.dir = -1; else if (b.position.x < v.x0) v.dir = 1;
    v.vx += (v.dir * VAC_SPEED - v.vx) * 0.05;
    Body.setVelocity(b, { x: v.vx, y: 0 }); v.cmd = v.vx;
    // the rider holds on while it's sitting up top; knock it off and it's on its own
    const r = v.rider, dx = b.position.x - r.position.x, dy = b.position.y - r.position.y;
    if (!r.game.dead && Math.abs(dx) < 60 && dy > 35 && dy < 75) Body.setVelocity(r, { x: v.vx + dx * 0.08, y: r.velocity.y });
  }
  for (const w of swings) {
    if (w.cut) continue;
    const b = w.basket, hp = Vector.add(b.position, Vector.rotate(b.game.handle, b.angle));
    Sleeping.set(b, false);
    if (Math.abs(b.position.x - w.ax) < 12 && Math.abs(b.velocity.x) < 4.5 && Math.abs(b.velocity.x) > 0.2) Body.setVelocity(b, { x: Math.sign(b.velocity.x) * 4.5, y: b.velocity.y });
    for (const c of flying) {
      if (c.game.done) continue;
      if (distToSegment(c.position, { x: w.ax, y: w.ay }, hp) < c.game.r * 0.7) {
        w.cut = true; Composite.remove(engine.world, w.rope);
        addScore(500, c.position, 'Snip!'); sparkle(c.position, 8);
        sfx.tone('square', 1400, 300, 0.12, 0.08); sfx.snap();
        break;
      }
    }
  }
}
function distToSegment(p, a, b) {
  const ab = Vector.sub(b, a), t = Math.max(0, Math.min(1, Vector.dot(Vector.sub(p, a), ab) / (Vector.dot(ab, ab) || 1)));
  return Vector.magnitude(Vector.sub(p, Vector.add(a, Vector.mult(ab, t))));
}

// Magic cat flaps: anything that moves into one pops out of its partner at the same speed and heading.
// It can't go back in the flap it came out of until it has left it, so nothing ping-pongs.
function updatePortals() {
  for (const q of portals) if (q.flap > 0) q.flap--;
  if (!portals.length) return;
  for (const b of bodies()) {
    const g = b.game;
    if (b.isStatic || b.isSleeping || !g || g.kind === 'balloon') continue;
    if (g.portalOut != null) {
      const o = portals[g.portalOut];
      if (Math.hypot(b.position.x - o.x, b.position.y - o.y) > PORTAL_R + 6) g.portalOut = null;
    }
    for (let i = 0; i < portals.length; i++) {
      const q = portals[i];
      if (i === g.portalOut || Math.hypot(b.position.x - q.x, b.position.y - q.y) > PORTAL_R * 0.8) continue;
      const out = portals[q.link], v = { x: b.velocity.x, y: b.velocity.y };
      sparkle({ x: q.x, y: q.y }, 8);
      Body.setPosition(b, { x: out.x, y: out.y }); Body.setVelocity(b, v);
      g.portalOut = q.link; q.flap = out.flap = 24;
      sparkle({ x: out.x, y: out.y }, 10);
      if (g.trail) g.trail.length = 0;
      sfx.tone('sine', 380, 1500, 0.22, 0.09); sfx.tone('triangle', 1500, 600, 0.18, 0.05, 0.12);
      break;
    }
  }
}

// Every Easter egg: points, a big '+' over the spot, and a badge across the screen with a happy jingle
function eggBonus(title, pts, pos, sub) {
  score += pts;
  popups.push({ x: pos.x, y: pos.y - 20, text: '+' + pts.toLocaleString(), life: 100, egg: true });
  eggBanner = { title, sub: sub || null, pts, t: 0 };
  sparkle(pos, 16);
  [784, 988, 1175, 1568].forEach((f, i) => sfx.tone('triangle', f, f, 0.16, 0.13, i * 0.08));
}
// a cat that touches the cucumber jumps sky high
function scareCat(cat, cuc) {
  cucumberScare = true;
  Body.setVelocity(cat, { x: -4, y: -17 }); cat.game.rest = 0; cat.game.scare = 70;
  eggBonus('CUCUMBER!!', 2000, cuc.position, 'Who put that there?!');
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(3, 8), t = CATS[cat.game.type];
    particles.push({ type: 'fur', x: cat.position.x, y: cat.position.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, s: rand(7, 13), rot: a, vr: rand(-0.2, 0.2), life: 40, max: 40, color: i % 2 ? t.body : t.belly });
  }
  sfx.cat(CAT_SOUNDS.snap, 0.75);
}
// a cat that comes to rest in the sunbeam curls up and goes to sleep there
function takeNap(b) {
  const g = b.game;
  napCat = { type: g.type, x: b.position.x }; g.done = true; g.boxed = true;
  Composite.remove(engine.world, b);
  eggBonus('Sunbeam nap', 2000, { x: napCat.x, y: GROUND - 60 }, 'Zzz...');
  sfx.cat(pick(CAT_SOUNDS.chatter[g.type]), 0.4, 0.2);
}
// the red laser dot: now and then while aiming it skitters around the floor near the slingshot
function updateLaser() {
  if (state !== 'play') return;
  if (laser) {
    if (--laser.life <= 0 || phase !== 'aim') { laser = null; return; }
    if (--laser.hop <= 0) { laser.tx = rand(60, 720); laser.ty = Math.random() < 0.7 ? GROUND - 3 : rand(560, 760); laser.hop = 18 + Math.random() * 40; }
    laser.x += (laser.tx - laser.x) * 0.22; laser.y += (laser.ty - laser.y) * 0.22;
  } else if (!laserCaught && phase === 'aim' && current && introTimer === 0 && !dragging && --laserWait <= 0) {
    laser = { x: rand(100, 600), y: GROUND - 3, tx: 0, ty: 0, hop: 0, life: 360 };
    laserWait = 900 + Math.random() * 900;
  }
}
function catchLaser() {
  laserCaught = true;
  eggBonus('Got the red dot!', 500, laser, 'Pounce!');
  [current, ...queue].forEach((type, who) => chatter.push({ type, who, t: 1 + who * 6, life: CHATTER_LIFE, sym: '!' }));
  laser = null;
}
// ---- cat Easter eggs: a bird at the window, a hairball, a purr, a toy mouse, a cat in the moon
const BIRD = { x: 520, y: 500 };   // perched on the first window's sill (that layer scrolls slower than the room)
const birdPos = () => ({ x: cam.x * (1 - FAR_P) + BIRD.x + bird.ox, y: BIRD.y + bird.oy });
const moonPos = () => ({ x: cam.x * (1 - FAR_P) + WINDOWS[0].wx + 300, y: WINDOWS[0].wy + 265 });
function chatterAll(sym) { [current, ...queue].filter(Boolean).forEach((type, who) => chatter.push({ type, who, t: 1 + who * 6, life: CHATTER_LIFE, sym })); }
function squeakMouse(m) {
  eggFlags.mouse = true;
  Sleeping.set(m, false); Body.setVelocity(m, { x: m.velocity.x, y: -7 }); Body.setAngularVelocity(m, 0.25);
  [0, 1].forEach(k => sfx.tone('square', 1700 + k * 500, 2700, 0.07, 0.09, k * 0.09));
  eggBonus('Toy mouse!', 500, m.position, 'Squeak!');
}
// taps on the window bird or the moon; true if it used the tap
function eggTap(p) {
  if (bird && !bird.flee) {
    const b = birdPos();
    if (Math.hypot(p.x - b.x, p.y - b.y) < 60) {
      bird.flee = 1; chatterAll('?!');
      [0, 1, 2, 3].forEach(k => sfx.tone('sine', 2400 + k * 160, 3300, 0.05, 0.08, k * 0.07));
      eggBonus('Ek ek ek ek!', 750, b);
      return true;
    }
  }
  if (isNight() && !moonCat) {
    const m = moonPos();
    if (Math.hypot(p.x - m.x, p.y - m.y) < 64) {
      moonCat = 420; sfx.cat(pick(CAT_SOUNDS.chatter.cleo), 0.5, 0.1);
      eggBonus('The moon is a cat?!', 1000, m, 'Mew.');
      return true;
    }
  }
  return false;
}
function updateEggs() {
  if (bird && bird.flee) { bird.flee++; bird.ox += 4.5; bird.oy -= 3.2 + Math.sin(bird.flee * 0.35); if (bird.flee > 150) bird = null; }
  if (moonCat > 0) moonCat--;
  if (petHold) {
    // hold a waiting cat: she purrs
    const sp = queueSpots()[petHold.who];
    if (!sp || phase === 'flying') petHold = null;
    else {
      petHold.t++;
      if (petHold.t > 20 && petHold.t % 22 === 0) {
        sfx.tone('triangle', 62, 54, 0.3, 0.05);
        particles.push({ type: 'heart', x: sp.x + rand(-12, 12), y: sp.y - sp.r, vx: rand(-0.6, 0.6), vy: rand(-2, -1), s: rand(6, 9), life: 46, max: 46 });
      }
      if (petHold.t === 90 && !eggFlags['purr' + sp.type]) { eggFlags['purr' + sp.type] = true; eggBonus('Purrrrr...', 300, { x: sp.x, y: sp.y - sp.r }, 'Best human'); }
    }
  }
}
function hairballTime(spot) {
  eggFlags.hair = true; hairball = { x: spot.x + spot.r + 34, y: GROUND - 16 };
  for (let i = 0; i < 8; i++) particles.push({ type: 'puff', x: spot.x + spot.r * 0.7, y: spot.y, vx: rand(1, 4), vy: rand(-3, -0.5), s: rand(6, 11), life: 36, max: 36, color: i % 2 ? '#8a6a4a' : '#b08a62' });
  sfx.tone('sawtooth', 120, 70, 0.4, 0.1); sfx.thud(0.5);
  eggBonus('Hairball!', 300, { x: spot.x, y: spot.y - spot.r }, 'Ew, CeCe...');
}
// the cats waiting their turn, lined up behind the slingshot (spaced by size, so big CeCe doesn't overlap)
function queueSpots() {
  const out = []; let qx = SLING.x - 45;
  queue.forEach(type => { const r = CATS[type].r * 0.75; qx -= r * 1.15; out.push({ type, x: qx, y: GROUND - r, r }); qx -= r * 1.15 + 6; });
  return out;
}
// tap a waiting cat to pet her: a hop, a happy noise and some hearts
function petCat(i, spot) {
  if (spot.type === 'cece' && !eggFlags.hair) {
    // pet CeCe too much and she coughs up a hairball
    hairCount++;
    if (hairCount === 4) popups.push({ x: spot.x, y: spot.y - spot.r - 40, text: 'Hurk... hurk...', life: 70 });
    if (hairCount >= 6) { hairballTime(spot); return; }
  }
  if (chatter.some(c => c.who === i + 1)) return;
  chatter.push({ type: spot.type, who: i + 1, t: 1, life: CHATTER_LIFE, sym: '♥' });
  for (let k = 0; k < 4; k++) particles.push({ type: 'heart', x: spot.x + rand(-15, 15), y: spot.y - spot.r, vx: rand(-1, 1), vy: rand(-2.5, -1.2), s: rand(7, 11), life: 50, max: 50 });
}

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
  for (const p of popups) { p.life--; if (!p.tip) p.y -= 0.8; }   // level tips stay put
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
  if (eggBanner && ++eggBanner.t > EGG_LEN) eggBanner = null;
  if (reveal && state === 'play') {
    if (reveal.t === 0) { sfx.thud(0.5); sfx.tone('sine', 110, 120, 1.2, 0.04); }   // door clunk and a fridge hum
    if (++reveal.t > REVEAL_LEN) reveal = null;
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
  // zero-gravity bubbles: inside one, gravity is cancelled and things slowly drift to a stop
  for (const z of bubbles) for (const b of bodies()) {
    if (b.isStatic || b.isSleeping || !inZone(z, b.position.x, b.position.y)) continue;
    Body.applyForce(b, b.position, { x: 0, y: -b.mass * engine.gravity.scale * engine.gravity.y });
    Body.setVelocity(b, Vector.mult(b.velocity, b.game && b.game.kind === 'cat' ? 0.996 : 0.99));
    Body.setAngularVelocity(b, b.angularVelocity * 0.98);
  }
  updateMachines();
  updatePortals();
  updateLamps();
  updateEggs();
  updateLaser();
  if (frame % 6 === 0) for (const b of bodies()) {
    const g = b.game;
    if (g && g.kind === 'coon' && !g.dead && coonChewing(g, frame + g.blink))
      particles.push({ type: 'chip', x: b.position.x + rand(-6, 6), y: b.position.y + g.r * 0.5, vx: rand(-1, 1), vy: rand(-1, 0.5), s: rand(3, 5), rot: rand(0, 6), vr: rand(-0.3, 0.3), color: g.act === 'fish' ? '#ffb46b' : '#b5773a', life: 22, max: 22 });
  }
  Engine.update(engine, STEP);
  for (const v of vacs) if (!v.stun && v.cmd !== null && !v.body.game.dead && Math.abs(v.body.velocity.x - v.cmd) > 3) { v.stun = 90; sparkle(v.body.position, 6); }
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
      if (g.scare > 0) g.scare--;
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
      if (sun && !napCat && !g.done && g.rest > 15 && Math.abs(b.position.x - sun.x) < sun.w / 2 && b.position.y > GROUND - g.r - 8) { takeNap(b); continue; }
      if (!boxCat && !g.done && Math.abs(b.position.x - BOX.x) < BOX.w / 2 - 8 && b.position.y > GROUND - BOX.h - g.r && Vector.magnitude(b.velocity) < 6) { sitInBox(b); continue; }
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
      else if (g.kind === 'block' && g.mat === 'mug') {
        debris(b); sfx.crumble('glass');
        if (g.swiped) { eggBonus('You knocked it off!', MATS.mug.points, b.position, 'Very cat of you'); sfx.cat(pick(CAT_SOUNDS.chatter.cleo), 0.5, 0.2); }
      }
      else if (g.kind === 'block' && g.mat === 'decoy') { addScore(3000, b.position, 'It was a cardboard decoy!'); debris(b); sfx.crumble('decoy'); }
      else if (g.kind === 'balloon') { Composite.remove(engine.world, g.rope); addScore(200, b.position, 'POP!'); poof(b.position, 5, 0.5); sfx.tone('square', 900, 200, 0.08, 0.12); }
      else if (g.kind === 'block') { addScore(MATS[g.mat].points, b.position); debris(b); sfx.crumble(g.mat); }
      else if (g.kind === 'coon') { addScore(g.boss ? 20000 : 5000, b.position); poof(b.position, g.boss ? 18 : 10, g.boss ? 1.6 : 1); sparkle(b.position, 6); sfx.pop(); }
      else if (g.kind === 'loot' && g.collected && g.type === 'goldfish') {
        eggBonus('GOLDEN FISH!', 10000, b.position, 'You found the secret!'); sparkle(b.position, 24); sfx.ding();
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
    // at night, hold on the fort while the fridge opens and shows what the shot did
    if (allDone && hasFridge() && !shotRevealed) { shotRevealed = true; startReveal(10); return; }
    if (allDone && reveal) return;
    if (allDone) {
      for (const c of flying) { if (c.position.y < H + 200 && !c.game.boxed) poof(c.position, 6, c.game.r / 26); Composite.remove(engine.world, c); }
      flying = [];
      if (queue.length) { current = queue.shift(); phase = 'aim'; panIdle = 999; upBanner = { type: current, t: 0 }; chatter = [{ type: current, who: 0, t: 8, life: CHATTER_LIFE, sym: '!' }]; }
      else { phase = 'out'; outTimer = 150; }
    }
  } else if (phase === 'out') {
    if (--outTimer <= 0) { state = 'lost'; sfx.lose(); music.duck(2.6); sfx.cat(CAT_SOUNDS.lose, 0.6, 2.2); }
  }
}

let finale = null;                // after the last level: the level picker shows a congratulations ribbon
function finishWin() {
  const unused = queue.length + (current && phase === 'aim' ? 1 : 0);
  bonus = unused * 10000;
  score += bonus;
  stars = unused >= 2 ? 3 : unused === 1 ? 2 : 1;
  bestStars[levelIdx] = Math.max(bestStars[levelIdx] || 0, stars);
  saveStars();
  // the last level goes straight back to the level picker, with a congratulations ribbon across the top
  if (levelIdx === LEVELS.length - 1) { state = 'levels'; finale = { t: 0 }; codePad = null; }
  else state = 'won';
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
  if (reveal && state === 'play') tx = fortCenter + 120 - viewW / 2;            // look at the fort while the fridge is open
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
  if (state === 'menu') menuPointer = { ...u, f: frame };
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
  if (laser && Math.hypot(p.x - laser.x, p.y - laser.y) < 55) { catchLaser(); return; }
  if (eggTap(p)) return;
  if (phase !== 'flying') {
    const spots = queueSpots(), i = spots.findIndex(q => Math.hypot(p.x - q.x, p.y - q.y) < q.r + 10);
    if (i >= 0) { petCat(i, spots[i]); petHold = { who: i, t: 0 }; return; }
  }
  if (phase === 'flying') { usePower(); return; }
  if (grabMug(e, p)) return;
  // anywhere else: drag the background to look around
  introTimer = 0;
  panning = { sx: e.clientX, cx: cam.x };
});
// put a finger on a mug and flick it sideways: it gets batted off whatever it's sitting on, the way a cat would
let mugGrab = null;
function grabMug(e, p) {
  const m = bodies().find(b => b.game && b.game.mat === 'mug' && !b.game.dead && Vector.magnitude(Vector.sub(b.position, p)) < 34);
  if (!m) return false;
  mugGrab = { m, x: e.clientX };
  return true;
}
function flickMug(e) {
  const dx = (e.clientX - mugGrab.x) * dpr / worldScale;
  if (Math.abs(dx) < 8) return;
  const m = mugGrab.m; mugGrab = null;
  if (m.game.dead) return;
  Sleeping.set(m, false);
  Body.setVelocity(m, { x: dx > 0 ? 6 : -6, y: -3 });
  Body.setAngularVelocity(m, dx > 0 ? 0.2 : -0.2);
  m.game.swiped = true;
}
let menuPointer = null;             // home screen: last finger/mouse spot, so the cats can look at it
canvas.addEventListener('pointermove', e => {
  if (state === 'menu') menuPointer = { ...toUI(e), f: frame };
  if (mugGrab) { flickMug(e); return; }
  if (dragging) updatePull(toWorld(e));
  else if (panning) { cam.x = clampCamX(panning.cx - (e.clientX - panning.sx) * dpr / worldScale); panIdle = 0; }
});
function release() {
  mugGrab = null; petHold = null;
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
  if (codePad && state === 'levels') { if (/^[0-9]$/.test(e.key)) codeKey(e.key); else if (e.key === 'Backspace') codePad.entry = codePad.entry.slice(0, -1); else if (e.key === 'Escape') codePad = null; return; }
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
let sleepyEyes = false;            // set while drawing a sleeping cat: lids all the way down
// set by catLife() for the cat being drawn: a blink in progress, and where she's looking (-1..1 each way)
let blinkNow = false, eyeLook = { x: 0, y: 0 };
function catEye(ex, ey, w, h, s, color, lid, tilt, lidColor) {
  if (sleepyEyes || blinkNow) { lid = 0.92; tilt = 0; }
  const lx = eyeLook.x * w * 0.4, ly = eyeLook.y * h * 0.35;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(ex, ey, w, h, 0, 0, 7); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(ex - w, ey - h, w * 2, h * 2);
  ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.ellipse(ex + s * w * 0.12 * (1 - Math.abs(eyeLook.x)) + lx, ey + h * 0.1 + ly, w * 0.3, h * 0.75, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - w * 0.3 + lx * 0.5, ey - h * 0.25 + ly * 0.5, w * 0.22, 0, 7); ctx.fill();
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
function catNose(R, ny, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-R * 0.08, ny); ctx.lineTo(R * 0.08, ny); ctx.lineTo(0, ny + R * 0.09); ctx.closePath(); ctx.fill();
}
function catNoseMouth(R, ny, color) {
  catNose(R, ny, color);
  ctx.strokeStyle = '#5a4040'; ctx.lineWidth = R * 0.03; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, ny + R * 0.09); ctx.lineTo(0, ny + R * 0.15);
  ctx.moveTo(0, ny + R * 0.15); ctx.quadraticCurveTo(-R * 0.08, ny + R * 0.23, -R * 0.16, ny + R * 0.17);
  ctx.moveTo(0, ny + R * 0.15); ctx.quadraticCurveTo(R * 0.08, ny + R * 0.23, R * 0.16, ny + R * 0.17); ctx.stroke();
}
// Facial expressions. Each cat passes where her eyes and nose sit (f, in units of her radius); opts.mood
// picks the look and opts.k (0-1) how strong it is:
//   fierce  aiming: narrowed eyes and angry brows, a fang showing (stronger the further she's pulled back)
//   yowl    flying: angry brows and a wide-open battle cry
//   scared  the slingshot creaking or snapping, the cucumber: huge eyes, tiny pupils, raised brows, sweat drop
//   dizzy   after a hard crash: spiral eyes, wobbly mouth, stars going round
//   happy   petted, winning, sitting in the box: ^ ^ eyes, blush, open smile
//   sad     losing: droopy eyes, worried brows, frown, a tear
// No mood keeps each cat's own resting face.
function catFace(R, f, opts) {
  const mood = sleepyEyes ? null : opts.mood, k = opts.k == null ? 1 : opts.k;
  const ew = R * f.w * (opts.bright ? f.wb : 1), eh = R * f.h * (opts.bright ? f.hb : 1), ey = R * f.y, ny = R * f.ny;
  const ex = s => s * R * f.x;
  const ink = '#3a2a26', mouthDark = '#7a3040';
  const brow = (s, x0, y0, x1, y1, w = 0.06) => { ctx.strokeStyle = 'rgba(50,35,30,0.85)'; ctx.lineWidth = R * w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex(s) + s * R * x0, ey + y0); ctx.lineTo(ex(s) + s * R * x1, ey + y1); ctx.stroke(); };
  if (!mood) { for (const s of [-1, 1]) catEye(ex(s), ey, ew, eh, s, f.eye, f.l0, f.t0, f.lid(s)); catNoseMouth(R, ny, f.nose); return; }
  if (mood === 'happy') {
    ctx.strokeStyle = ink; ctx.lineWidth = R * 0.055; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(ex(s), ey + eh * 0.45, ew * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,110,140,0.35)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(ex(s) + s * R * 0.06, ey + R * 0.2, R * 0.11, R * 0.06, 0, 0, 7); ctx.fill(); }
    catNose(R, ny, f.nose);
    ctx.fillStyle = mouthDark; ctx.beginPath(); ctx.moveTo(-R * 0.18, ny + R * 0.12); ctx.quadraticCurveTo(0, ny + R * 0.46, R * 0.18, ny + R * 0.12); ctx.quadraticCurveTo(0, ny + R * 0.18, -R * 0.18, ny + R * 0.12); ctx.fill();
    ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.ellipse(0, ny + R * 0.28, R * 0.08, R * 0.045, 0, 0, 7); ctx.fill();
    return;
  }
  if (mood === 'fierce' || mood === 'yowl') {
    for (const s of [-1, 1]) catEye(ex(s), ey, ew, eh, s, f.eye, 0.12 + 0.28 * k, 0.45 + 0.45 * k, f.lid(s));
    for (const s of [-1, 1]) brow(s, 0.2, -eh * (1.45 + 0.1 * k), -0.12, -eh * (0.85 + 0.15 * k), 0.05 + 0.025 * k);
    catNose(R, ny, f.nose);
    if (mood === 'yowl') {
      ctx.fillStyle = mouthDark; ctx.beginPath(); ctx.ellipse(0, ny + R * 0.28, R * 0.17, R * 0.18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.ellipse(0, ny + R * 0.38, R * 0.1, R * 0.06, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * R * 0.1, ny + R * 0.14); ctx.lineTo(sg * R * 0.04, ny + R * 0.15); ctx.lineTo(sg * R * 0.07, ny + R * 0.23); ctx.closePath(); ctx.fill(); }
    } else {
      ctx.strokeStyle = '#5a4040'; ctx.lineWidth = R * 0.03; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, ny + R * 0.09); ctx.lineTo(0, ny + R * 0.15); ctx.moveTo(-R * 0.16, ny + R * 0.2); ctx.quadraticCurveTo(0, ny + R * 0.12, R * 0.16, ny + R * 0.2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(R * 0.05, ny + R * 0.16); ctx.lineTo(R * 0.11, ny + R * 0.17); ctx.lineTo(R * 0.08, ny + R * 0.25); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (mood === 'scared') {
    for (const s of [-1, 1]) {
      const x = ex(s), w = ew * 1.3, h = eh * 1.3;
      ctx.fillStyle = f.eye; ctx.beginPath(); ctx.ellipse(x, ey, w, h, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,25,0.6)'; ctx.lineWidth = h * 0.12; ctx.stroke();
      ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(x + (Math.random() - 0.5) * w * 0.15, ey, w * 0.2, 0, 7); ctx.fill();   // tiny, trembling pupils
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - w * 0.35, ey - h * 0.35, w * 0.18, 0, 7); ctx.fill();
      brow(s, 0.18, -h * 1.5, -0.12, -h * 1.9);
    }
    catNose(R, ny, f.nose);
    ctx.fillStyle = mouthDark; ctx.beginPath(); ctx.ellipse(0, ny + R * 0.22, R * 0.06, R * 0.085, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,210,255,0.9)';                                // sweat drop
    ctx.beginPath(); ctx.moveTo(R * 0.62, -R * 0.62); ctx.quadraticCurveTo(R * 0.72, -R * 0.42, R * 0.62, -R * 0.38); ctx.quadraticCurveTo(R * 0.52, -R * 0.42, R * 0.62, -R * 0.62); ctx.fill();
    return;
  }
  if (mood === 'dizzy') {
    ctx.strokeStyle = ink; ctx.lineWidth = R * 0.035; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) { const a = i * 0.45 + frame * 0.25 * s, rr2 = ew * 1.05 * i / 28; i ? ctx.lineTo(ex(s) + Math.cos(a) * rr2, ey + Math.sin(a) * rr2) : ctx.moveTo(ex(s), ey); }
      ctx.stroke();
    }
    catNose(R, ny, f.nose);
    ctx.strokeStyle = '#5a4040'; ctx.lineWidth = R * 0.035; ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const x = -R * 0.15 + i * R * 0.0375, y = ny + R * 0.2 + Math.sin(i * 1.6 + frame * 0.3) * R * 0.03; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    for (let i = 0; i < 3; i++) {                                           // little stars circling her head
      const a = frame * 0.08 + i * Math.PI * 2 / 3;
      starShape(Math.cos(a) * R * 0.75, -R * 0.95 + Math.sin(a) * R * 0.18, R * 0.12, '#ffd84a', '#b8860b');
    }
    return;
  }
  if (mood === 'sad') {
    for (const s of [-1, 1]) catEye(ex(s), ey, ew, eh, s, f.eye, 0.32, -0.5, f.lid(s));
    for (const s of [-1, 1]) brow(s, 0.2, -eh * 1.2, -0.1, -eh * 1.75, 0.045);
    catNose(R, ny, f.nose);
    ctx.strokeStyle = '#5a4040'; ctx.lineWidth = R * 0.035; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-R * 0.13, ny + R * 0.25); ctx.quadraticCurveTo(0, ny + R * 0.13, R * 0.13, ny + R * 0.25); ctx.stroke();
    const tk = (frame % 90) / 90;                                           // a tear rolling down
    ctx.globalAlpha *= 1 - tk * 0.7;
    ctx.fillStyle = 'rgba(150,210,255,0.95)'; ctx.beginPath(); ctx.ellipse(ex(1) - R * 0.04, ey + eh + tk * R * 0.35, R * 0.04, R * 0.06, 0, 0, 7); ctx.fill();
    return;
  }
}
function whiskers(R, y, len, color) {
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, R * 0.022); ctx.lineCap = 'round';
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    ctx.beginPath(); ctx.moveTo(s * R * 0.25, y + k * R * 0.05);
    ctx.quadraticCurveTo(s * R * 0.7, y - R * 0.07 + k * R * 0.1, s * R * len, y - R * 0.1 + k * R * 0.16); ctx.stroke();
  }
}
let earTwitch = { side: 0, amt: 0 };   // set by catLife(): which ear flicks, and how far
function ear(R, s, base1, tip, base2, fur, inner, tufts) {
  const tw = earTwitch.side === s ? earTwitch.amt : 0;
  if (tw) { ctx.save(); const px = s * base2[0] * R, py = base2[1] * R; ctx.translate(px, py); ctx.rotate(s * 0.35 * tw); ctx.translate(-px, -py); }
  earInner(R, s, base1, tip, base2, fur, inner, tufts);
  if (tw) ctx.restore();
}
function earInner(R, s, base1, tip, base2, fur, inner, tufts) {
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
  catFace(R, { x: 0.3, y: -0.13, w: 0.15, h: 0.15, wb: 1.22, hb: 1.3, eye: t.eye, lid: s => s < 0 ? '#c98a4a' : t.body,
    l0: opts.bright ? 0 : opts.calm ? 0.42 : 0.5, t0: opts.calm ? 0.1 : 0.45, ny: 0.1, nose: '#e7a3a6' }, opts);
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

  catFace(r, { x: 0.34, y: -0.08, w: 0.19, h: 0.2, wb: 1.15, hb: 1.2, eye: t.eye, lid: () => t.body,
    l0: opts.bright ? 0 : opts.calm ? 0.3 : 0.38, t0: opts.calm ? 0.05 : 0.5, ny: 0.2, nose: '#9d9aa1' }, opts);
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

  catFace(r, { x: 0.32, y: -0.1, w: 0.17, h: 0.18, wb: 1.15, hb: 1.2, eye: t.eye, lid: () => t.body,
    l0: opts.bright ? 0 : opts.calm ? 0.25 : 0.38, t0: opts.calm ? -0.05 : 0.25, ny: 0.17, nose: '#eba3a0' }, opts);
  whiskers(r, r * 0.29, 1.18, 'rgba(255,255,255,0.95)');
}

// Flying pose for Baby and Cleo: body stretched out behind, front paws reaching forward like Superman,
// tail streaming, speed streaks, head tilted toward where she's going. Mirrors when flying left.
function drawFlyer(x, y, r, vel, type, alpha = 1, mood = 'yowl') {
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
  drawCat(x, y, r, (flip ? -1 : 1) * ang * 0.5, type, { alpha, mood });
}

// Little signs of life on every cat: she blinks (now and then a double blink), her eyes drift and glance
// around, she breathes, her head tilts a touch, and an ear flicks once in a while. Each cat has her own
// rhythm. opts.lookX/lookY (-1..1) make her look at something; opts.still turns it all off.
const CAT_LIFE = { baby: { seed: 0, blink: 170, breathe: 0.055 }, cleo: { seed: 61, blink: 215, breathe: 0.045 }, cece: { seed: 137, blink: 260, breathe: 0.032 } };
function catLife(type, opts) {
  const L = CAT_LIFE[type], t = frame + L.seed + (opts.seed || 0), m = opts.mood;
  const idle = !opts.still && !sleepyEyes;
  const c = t % L.blink, cyc = Math.floor(t / L.blink);
  blinkNow = idle && (!m || m === 'fierce' || m === 'sad') && (c < 6 || (hash(cyc * 1.7) > 0.6 && c > 10 && c < 16));
  if (opts.lookX != null || opts.lookY != null) eyeLook = { x: opts.lookX || 0, y: opts.lookY || 0 };
  else if (idle && !m) {
    // hold a gaze for a couple of seconds, then flick to a new spot
    const seg = Math.floor(t / 150), k = Math.min(1, (t % 150) / 10), e = k * k * (3 - 2 * k);
    const gx = q => (hash(q * 3.1 + L.seed) - 0.5) * 1.6, gy = q => (hash(q * 5.7 + L.seed) - 0.5) * 0.9;
    eyeLook = { x: gx(seg - 1) + (gx(seg) - gx(seg - 1)) * e, y: gy(seg - 1) + (gy(seg) - gy(seg - 1)) * e };
  } else eyeLook = { x: 0, y: 0 };
  const tc = t % 330;
  earTwitch = idle && m !== 'yowl' && tc < 14 ? { side: hash(Math.floor(t / 330) * 2.3) > 0.5 ? 1 : -1, amt: Math.sin(tc / 14 * Math.PI) } : { side: 0, amt: 0 };
  const calmish = idle && m !== 'yowl' && m !== 'dizzy';
  return { breath: calmish ? Math.sin(t * L.breathe) : 0, tilt: idle && !m ? Math.sin(t * 0.011 + L.seed) * 0.05 : 0 };
}
function drawCat(x, y, r, ang, type, opts = {}) {
  opts = { bright: true, ...opts };   // bright, wide-open eyes everywhere
  const t = CATS[type], life = catLife(type, opts);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang + life.tilt);
  if (life.breath) { ctx.translate(0, r * 0.9); ctx.scale(1 - 0.012 * life.breath, 1 + 0.022 * life.breath); ctx.translate(0, -r * 0.9); }   // breathing: she rises a little from the bottom
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (type === 'cece') drawCeCe(r, t, opts);
  else if (type === 'baby') drawBaby(r, t, opts);
  else drawCleo(r, t, opts);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.restore();
  blinkNow = false; eyeLook = { x: 0, y: 0 }; earTwitch = { side: 0, amt: 0 };
}

// The raccoons enjoy what they stole while they wait: nibbling a fish treat, munching from a bag of
// cat treats, juggling a ball of yarn, or swinging a toy mouse by its tail.
const COON_ACTS = ['fish', 'treats', 'yarn', 'mouse'];
function coonChewing(g, t) {
  if (g.act === 'fish') return t % 120 < 42 && Math.floor(t / 5) % 2 === 0;
  if (g.act === 'treats') { const c = (t % 90) / 90; return c > 0.5 && c < 0.8 && Math.floor(t / 5) % 2 === 0; }
  return false;
}
function coonPaw(x, y, r) { ctx.fillStyle = '#5d636b'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.15, r * 0.12, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#3f434a'; ctx.lineWidth = r * 0.04; ctx.stroke(); }
function drawCoonToy(r, g, t) {
  // drawn bigger than life so it reads at phone size
  ctx.save(); ctx.translate(0, r * 0.6); ctx.scale(1.6, 1.6); ctx.translate(0, -r * 0.6);
  if (g.act === 'fish') {
    // holds a fish treat up to its mouth and takes quick nibbles
    const nib = t % 120 < 42, lift = nib ? Math.abs(Math.sin(t * 0.6)) * r * 0.08 : 0, y = r * 0.6 - lift;
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath(); ctx.ellipse(-r * 0.04, y, r * 0.26, r * 0.13, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.18, y); ctx.lineTo(r * 0.38, y - r * 0.13); ctx.lineTo(r * 0.38, y + r * 0.13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-r * 0.2, y - r * 0.03, r * 0.03, 0, 7); ctx.fill();
    coonPaw(-r * 0.3, y + r * 0.08, r); coonPaw(r * 0.22, y + r * 0.08, r);
  } else if (g.act === 'treats') {
    // a bag of cat treats: paw in, treat to mouth, munch
    const c = (t % 90) / 90, bx = r * 0.5, by = r * 0.62;
    ctx.fillStyle = '#7fb3e6'; rr(bx - r * 0.2, by - r * 0.26, r * 0.4, r * 0.52, r * 0.06); ctx.fill();
    ctx.strokeStyle = '#4a7fb3'; ctx.lineWidth = r * 0.04; ctx.stroke();
    ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.ellipse(bx - r * 0.02, by + r * 0.04, r * 0.1, r * 0.06, 0, 0, 7); ctx.fill();   // fish on the label
    ctx.beginPath(); ctx.moveTo(bx + r * 0.06, by + r * 0.04); ctx.lineTo(bx + r * 0.13, by - r * 0.01); ctx.lineTo(bx + r * 0.13, by + r * 0.09); ctx.closePath(); ctx.fill();
    const k = c < 0.5 ? Math.sin(c / 0.5 * Math.PI / 2) : c < 0.8 ? 1 : 1 - (c - 0.8) / 0.2;   // 0 = in the bag, 1 = at the mouth
    const px = bx - r * 0.05 - k * r * 0.45, py = by - r * 0.3 - k * r * 0.0 + Math.sin(k * Math.PI) * -r * 0.15;
    if (c < 0.6) { ctx.fillStyle = '#b5773a'; ctx.beginPath(); ctx.arc(px - r * 0.06, py - r * 0.06, r * 0.06, 0, 7); ctx.fill(); }
    coonPaw(px, py, r); coonPaw(bx + r * 0.05, by + r * 0.2, r);
  } else if (g.act === 'yarn') {
    // juggling a little ball of yarn from paw to paw
    const a = t * 0.06, sx = Math.sin(a), bx = sx * r * 0.5, by = r * 0.62 - Math.abs(Math.cos(a)) * r * 0.42;
    const catchL = sx < -0.8, catchR = sx > 0.8;
    ctx.strokeStyle = '#c63f7f'; ctx.lineWidth = r * 0.03;
    ctx.beginPath(); ctx.moveTo(bx, by + r * 0.1); ctx.quadraticCurveTo(bx * 0.5, r * 0.8, -r * 0.1, r * 0.82); ctx.stroke();
    ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.arc(bx, by, r * 0.15, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c63f7f';
    for (const e of [-0.6, 0.6]) { ctx.beginPath(); ctx.ellipse(bx, by, r * 0.15, r * 0.06, e + a, 0, 7); ctx.stroke(); }
    coonPaw(-r * 0.5, r * 0.72 - (catchL ? r * 0.06 : 0), r); coonPaw(r * 0.5, r * 0.72 - (catchR ? r * 0.06 : 0), r);
  } else if (g.act === 'mouse') {
    // swinging a toy mouse by its tail
    const sw = Math.sin(t * 0.07) * 0.7, hx = r * 0.55, hy = r * 0.08;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sw);
    ctx.strokeStyle = '#d98fa8'; ctx.lineWidth = r * 0.035;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.06, r * 0.2, 0, r * 0.34); ctx.stroke();
    ctx.fillStyle = '#b9b2c8'; ctx.beginPath(); ctx.ellipse(0, r * 0.5, r * 0.12, r * 0.18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2a7c0'; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(e * r * 0.08, r * 0.62, r * 0.06, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, r * 0.68, r * 0.025, 0, 7); ctx.fill();
    ctx.restore();
    coonPaw(hx, hy, r); coonPaw(-r * 0.35, r * 0.7, r);
  }
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
  const blink = g && ((frame + g.blink) % 220 < 7 || g.blindT > 0);
  for (const s of [-1, 1]) {
    const ex = s * r * 0.34, ey = -r * 0.05;
    if (blink) { ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(ex - r * 0.12, ey); ctx.lineTo(ex + r * 0.12, ey); ctx.stroke(); continue; }
    if (hurtBad && s === 1) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - r * 0.1, ey - r * 0.1); ctx.lineTo(ex + r * 0.1, ey + r * 0.1); ctx.moveTo(ex + r * 0.1, ey - r * 0.1); ctx.lineTo(ex - r * 0.1, ey + r * 0.1); ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.13, 0, 7); ctx.fill();
    const look = g && g.act === 'yarn' ? Math.sin((frame + g.blink) * 0.06) * r * 0.05 : -r * 0.05;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + look, ey + r * 0.01, r * 0.07, 0, 7); ctx.fill();
  }
  if (g && g.goggles && !g.blind) {
    // night-vision goggles: two dark green lenses over the eyes, joined by a bridge
    ctx.fillStyle = '#26332a'; ctx.fillRect(-r * 0.2, -r * 0.1, r * 0.4, r * 0.07);
    for (const sg of [-1, 1]) {
      ctx.fillStyle = '#16251b'; ctx.beginPath(); ctx.arc(sg * r * 0.34, -r * 0.05, r * 0.22, 0, 7); ctx.fill();
      ctx.lineWidth = r * 0.06; ctx.strokeStyle = '#59c878'; ctx.stroke();
      ctx.fillStyle = '#7dffa0'; ctx.beginPath(); ctx.arc(sg * r * 0.34, -r * 0.05, r * 0.1, 0, 7); ctx.fill();
    }
  }
  // nose + smirk
  ctx.fillStyle = '#16171b'; ctx.beginPath(); ctx.ellipse(0, r * 0.22, r * 0.13, r * 0.09, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2b30'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  const t = frame + (g && g.blink || 0), chew = g && g.act && coonChewing(g, t);
  if (chew) { ctx.fillStyle = '#2a2b30'; ctx.beginPath(); ctx.ellipse(0, r * 0.44, r * 0.12, r * 0.08, 0, 0, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.45); ctx.quadraticCurveTo(r * 0.02, r * 0.55, r * 0.26, r * 0.36); ctx.stroke(); }
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
  if (g && g.act) drawCoonToy(r, g, t);
  if (g && g.flashlight) {
    // the lookout's flashlight, pointing wherever he's sweeping (independent of how he's tilted)
    ctx.save(); ctx.rotate(flashAngle(g) - ang);
    ctx.fillStyle = '#3a3f4a'; rr(r * 0.25, -r * 0.13, r * 0.75, r * 0.26, r * 0.08); ctx.fill();
    ctx.fillStyle = '#5a606c'; rr(r * 0.9, -r * 0.19, r * 0.22, r * 0.38, r * 0.06); ctx.fill();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(r * 1.12, 0, r * 0.05, r * 0.16, 0, 0, 7); ctx.fill();
    coonPaw(r * 0.42, r * 0.06, r); coonPaw(r * 0.7, r * 0.1, r);
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
  if (g.mat === 'basket') {
    // woven laundry basket: its three parts, a weave, and a handle up to where the rope ties on
    for (const part of b.parts.slice(1)) {
      ctx.beginPath(); part.vertices.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath();
      ctx.fillStyle = m.fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = m.edge; ctx.stroke();
    }
    const L = b.parts[2].position, R = b.parts[3].position, H = Vector.add(b.position, Vector.rotate(g.handle, b.angle));
    ctx.strokeStyle = m.edge; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(L.x, L.y - 22); ctx.quadraticCurveTo(H.x, H.y - 30, R.x, R.y - 22); ctx.stroke();
    return;
  }
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
  if (g.mat === 'lamp') {
    const k = g.on ? Math.min(1, (g.onT + 1) / 20) : 0;
    ctx.fillStyle = m.edge; ctx.fillRect(-3, -h / 2 + 22, 6, h - 22); rr(-w / 2 + 2, h / 2 - 9, w - 4, 9, 3); ctx.fill();
    ctx.fillStyle = `rgb(${Math.round(110 + 145 * k)},${Math.round(104 + 121 * k)},${Math.round(128 - 38 * k)})`;
    ctx.beginPath(); ctx.moveTo(-w / 2 - 2, -h / 2 + 26); ctx.lineTo(-w / 2 + 7, -h / 2); ctx.lineTo(w / 2 - 7, -h / 2); ctx.lineTo(w / 2 + 2, -h / 2 + 26); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = m.edge; ctx.stroke();
    ctx.restore();
    return;
  }
  if (g.mat === 'robovac') {
    ctx.fillStyle = m.fill; rr(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = m.edge; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#5b6170'; rr(-w / 2 + 12, -h / 2 + 3, w - 24, 8, 4); ctx.fill();
    ctx.fillStyle = g.stunned ? (frame % 10 < 5 ? '#ff4a4a' : '#7a1a1a') : (frame % 40 < 20 ? '#5cff7a' : '#1f7a33');
    ctx.beginPath(); ctx.arc(w * 0.28, -h / 2 + 7, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c9cdd6'; ctx.lineWidth = 2;                         // spinning side brushes
    for (const sg of [-1, 1]) {
      ctx.save(); ctx.translate(sg * (w / 2 - 10), h / 2 - 3); ctx.rotate(g.stunned ? 0 : frame * 0.5 * sg);
      for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 0); ctx.stroke(); }
      ctx.restore();
    }
    const dmg = 1 - g.hp / g.maxHp;
    if (dmg > 0.4) { ctx.fillStyle = 'rgba(255,200,80,' + (0.5 + 0.5 * Math.sin(frame * 0.7)) + ')'; ctx.beginPath(); ctx.arc(-w * 0.2, -h / 2, 3, 0, 7); ctx.fill(); }   // sparking
    ctx.restore();
    return;
  }
  if (g.mat === 'toymouse') {
    ctx.strokeStyle = '#d98fa8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.4, 4); ctx.quadraticCurveTo(-w * 0.62, 6, -w * 0.58, -8); ctx.stroke();   // tail
    ctx.fillStyle = m.fill; ctx.beginPath(); ctx.ellipse(0, 2, w * 0.42, h * 0.45, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = m.edge; ctx.stroke();
    ctx.fillStyle = '#f2a7c0'; ctx.beginPath(); ctx.arc(w * 0.14, -h * 0.34, 7, 0, 7); ctx.fill(); ctx.stroke();                                                    // ear
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(w * 0.26, -1, 2.2, 0, 7); ctx.fill();                                                                          // eye
    ctx.fillStyle = '#f08aa8'; ctx.beginPath(); ctx.arc(w * 0.42, 3, 3, 0, 7); ctx.fill();                                                                        // nose
    ctx.restore();
    return;
  }
  if (g.mat === 'cucumber') {
    ctx.fillStyle = m.fill; rr(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = m.edge; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(190,230,150,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 10, -h * 0.15); ctx.lineTo(w / 2 - 10, -h * 0.15); ctx.stroke();
    ctx.fillStyle = m.edge; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-w / 2 + 10 + i * 10, (i % 2 ? 1 : -1) * h * 0.22 + h * 0.08, 1.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(w / 2 - 2, -2, 5, 4);         // stem
    ctx.restore();
    return;
  }
  if (g.mat === 'mug') {
    // a mug, sitting right where a cat can bat it off
    ctx.fillStyle = m.fill; rr(-w / 2, -h / 2, w - 5, h, 4); ctx.fill();
    ctx.strokeStyle = m.edge; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(w / 2 - 5, 0, 7, -1.3, 1.3); ctx.stroke();
    text('♥', -2.5, 1, 14, '#e8578f');
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
  let warped = false;
  for (let i = 1; i <= 70; i++) {
    if (!warped) {
      const q = portals.find(o => Math.hypot(x - o.x, y - o.y) < PORTAL_R * 0.8);
      if (q) { x = portals[q.link].x; y = portals[q.link].y; warped = true; }
    }
    const z = inBubble(x, y);
    if (z) { vx *= 0.996; vy *= 0.996; }
    vx *= fa; vy = vy * fa + (z ? 0 : GRAV_STEP); x += vx; y += vy;
    if (y > GROUND) break;
    if (i % 4 === 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 - i / 90})`; ctx.strokeStyle = `rgba(60,70,90,${0.5 - i / 160})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6 - i / 20, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

function drawBubbles() {
  for (const z of bubbles) {
    const gr = ctx.createRadialGradient(z.x - z.r * 0.3, z.y - z.r * 0.3, z.r * 0.1, z.x, z.y, z.r);
    gr.addColorStop(0, 'rgba(190,170,255,0.08)'); gr.addColorStop(0.8, 'rgba(140,120,255,0.16)'); gr.addColorStop(1, 'rgba(205,195,255,0.4)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(235,230,255,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -frame * 0.4; ctx.stroke(); ctx.setLineDash([]);
    // twinkling specks drifting round inside
    for (let i = 0; i < 7; i++) {
      const a = hash(i + z.x) * 7 + frame * 0.004 * (i % 2 ? 1 : -1), d = z.r * (0.25 + 0.65 * hash(i * 3 + z.y));
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(frame * 0.07 + i); starShape(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 4, '#ffffff');
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(z.x - z.r * 0.45, z.y - z.r * 0.5, z.r * 0.18, z.r * 0.08, -0.7, 0, 7); ctx.fill();
  }
}
// the cardboard box (and whoever has climbed into it)
function drawBox() {
  const x = BOX.x, w = BOX.w, top = GROUND - BOX.h;
  ctx.fillStyle = '#b98a55';                                              // back flap
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 6, top); ctx.lineTo(x - w / 2 + 16, top - 24); ctx.lineTo(x + w / 2 - 16, top - 24); ctx.lineTo(x + w / 2 - 6, top); ctx.closePath(); ctx.fill();
  if (boxCat) drawCat(x, top - 8 - Math.abs(Math.sin(frame * 0.03)) * 3, 30, 0, boxCat, { mood: 'happy' });
  ctx.fillStyle = '#d9a86c'; ctx.fillRect(x - w / 2, top, w, BOX.h);
  ctx.strokeStyle = '#8a6136'; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2, top, w, BOX.h);
  ctx.fillStyle = '#c9965b';                                              // side flaps flopped open
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sgn * w / 2, top); ctx.lineTo(x + sgn * (w / 2 + 30), top - 12); ctx.lineTo(x + sgn * (w / 2 + 26), top + 12); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = 'rgba(240,225,190,0.7)'; ctx.fillRect(x - 6, top, 12, BOX.h);   // tape
  text('FRAGILE', x, top + BOX.h * 0.6, 13, '#b0473a', { weight: 700 });
}
// ---------------------------------------------------------------- night (level 15)
// The room is darkened with an overlay that has the light sources cut out of it, then the lights add
// their colour on top. Particles and score pop-ups are drawn after, so they stay bright.
const flashAngle = g => Math.PI - 0.22 + 0.36 * Math.sin((frame + g.blink) * 0.011);   // sweeps from down at the floor up to level
const FAIRY = ['#ff6b6b', '#ffd93d', '#6bcbff', '#c49bff', '#7dff9a'];
const WINDOWS = [230, 1060].map(wx => ({ wx, wy: 110, ww: 420, wh: 400 }));
let nightCanvas = null;
const isNight = () => LEVELS[levelIdx] && LEVELS[levelIdx].night;
const hasFridge = () => LEVELS[levelIdx] && LEVELS[levelIdx].fridge;
// window glass at night: deep blue sky, the moon, twinkling stars, a dark garden and a few fireflies
function nightWindows() {
  for (const [i, w] of WINDOWS.entries()) {
    const x = cam.x * (1 - FAR_P) + w.wx, y = w.wy;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w.ww, w.wh); ctx.clip();
    const gr = ctx.createLinearGradient(0, y, 0, y + w.wh);
    gr.addColorStop(0, '#0b1240'); gr.addColorStop(1, '#2b3a7a');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w.ww, w.wh);
    for (let k = 0; k < 26; k++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(frame * 0.03 + k * 7 + i)); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + hash(k * 3 + i) * w.ww, y + hash(k * 7 + i) * w.wh * 0.6, 2, 2); }
    ctx.globalAlpha = 1;
    if (i === 0) {
      const mx = x + 300, my = y + 265;
      const mg = ctx.createRadialGradient(mx, my, 20, mx, my, 120); mg.addColorStop(0, 'rgba(220,235,255,0.45)'); mg.addColorStop(1, 'rgba(220,235,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 120, 0, 7); ctx.fill();
      ctx.fillStyle = '#f4f1dc'; ctx.beginPath(); ctx.arc(mx, my, 42, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(190,190,170,0.45)'; for (const [dx, dy, rr2] of [[-12, -8, 8], [10, 10, 6], [14, -14, 4]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rr2, 0, 7); ctx.fill(); }
      if (moonCat > 0) drawMoonCat(mx, my);
    }
    ctx.fillStyle = '#101a33'; ctx.beginPath(); ctx.moveTo(x, y + w.wh);
    for (let k = 0; k <= w.ww; k += 20) ctx.lineTo(x + k, y + w.wh - 110 - Math.sin(k / 60 + w.wx) * 28);
    ctx.lineTo(x + w.ww, y + w.wh); ctx.closePath(); ctx.fill();
    for (let k = 0; k < 6; k++) {                                           // fireflies
      const fx = x + (hash(k * 11 + i) * w.ww + Math.sin(frame * 0.01 + k) * 30), fy = y + w.wh - 60 - hash(k * 5 + i) * 120 + Math.cos(frame * 0.013 + k) * 15;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frame * 0.05 + k * 2);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 10); fg.addColorStop(0, '#f6ff9a'); fg.addColorStop(1, 'rgba(246,255,154,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 10, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#c9d3e6'; ctx.lineWidth = 18; ctx.strokeRect(x, y, w.ww, w.wh);
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x + w.ww / 2, y); ctx.lineTo(x + w.ww / 2, y + w.wh); ctx.moveTo(x, y + w.wh * 0.45); ctx.lineTo(x + w.ww, y + w.wh * 0.45); ctx.stroke();
    ctx.restore();
  }
}
// The kitchen fills the right of the room on this level (world coords, drawn over the backdrop):
// tiled floor, cabinets, a counter, a clock at midnight, and the fridge with a raccoon helping himself.
const KITCHEN = { x: 1380, fridge: { x: 2170, w: 170, top: 420 } };
// the fridge reveal: t counts frames (negative = waiting), len its length. k() is how far the door is open.
let reveal = null, shotRevealed = false;
const REVEAL_LEN = 95;
function revealK() {
  if (!reveal || reveal.t < 0) return 0;
  const t = reveal.t;
  return t < 8 ? t / 8 : t > REVEAL_LEN - 14 ? Math.max(0, (REVEAL_LEN - t) / 14) : 1;
}
function startReveal(delay = 0) {
  reveal = { t: -delay };
}
function drawKitchen() {
  const K = KITCHEN.x, R = WORLD_W + 200;
  // wall and the archway from the living room
  ctx.fillStyle = '#d7e6e0'; ctx.fillRect(K, -400, R - K, GROUND + 400);
  ctx.fillStyle = '#e9e4d8'; ctx.fillRect(K - 22, 150, 30, GROUND - 150); ctx.fillRect(K - 22, 130, 60, 26);
  // backsplash tiles
  ctx.fillStyle = '#eef3f1'; ctx.fillRect(K + 10, 560, KITCHEN.fridge.x - K - 30, 130);
  ctx.strokeStyle = 'rgba(150,170,165,0.5)'; ctx.lineWidth = 1.5;
  for (let y = 560; y <= 690; y += 26) { ctx.beginPath(); ctx.moveTo(K + 10, y); ctx.lineTo(KITCHEN.fridge.x - 20, y); ctx.stroke(); }
  for (let y = 560, row = 0; y < 690; y += 26, row++) for (let x = K + 10 + (row % 2) * 26; x < KITCHEN.fridge.x - 20; x += 52) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 26); ctx.stroke(); }
  // upper cabinets
  for (let x = K + 40; x + 120 < KITCHEN.fridge.x - 10; x += 128) {
    ctx.fillStyle = '#b98f66'; rr(x, 330, 120, 190, 6); ctx.fill();
    ctx.strokeStyle = '#8a6545'; ctx.lineWidth = 3; ctx.strokeRect(x + 12, 344, 96, 162);
    ctx.fillStyle = '#d9c29a'; ctx.beginPath(); ctx.arc(x + 98, 480, 5, 0, 7); ctx.fill();
  }
  // a clock stopped at midnight, and a rail of hanging pans
  ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.arc(K + 120, 230, 42, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = 5; ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(K + 120, 230); ctx.lineTo(K + 120, 198); ctx.moveTo(K + 120, 230); ctx.lineTo(K + 122, 206); ctx.stroke();
  ctx.fillStyle = '#9a9fa8'; ctx.fillRect(K + 260, 200, 360, 6);
  for (const [dx, r] of [[300, 30], [390, 24], [470, 34], [560, 26]]) {
    ctx.strokeStyle = '#7d828b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(K + dx, 206); ctx.lineTo(K + dx, 226); ctx.stroke();
    ctx.fillStyle = '#5d636e'; ctx.beginPath(); ctx.arc(K + dx, 226 + r, r, 0, 7); ctx.fill();
  }
  // counter and lower cabinets
  ctx.fillStyle = '#8f9aa6'; ctx.fillRect(K, 690, KITCHEN.fridge.x - K - 10, 16);
  for (let x = K + 6; x + 110 < KITCHEN.fridge.x - 10; x += 116) {
    ctx.fillStyle = '#c49a70'; ctx.fillRect(x, 706, 110, GROUND - 706);
    ctx.strokeStyle = '#8a6545'; ctx.lineWidth = 3; ctx.strokeRect(x + 10, 716, 90, GROUND - 726);
    ctx.fillStyle = '#d9c29a'; ctx.fillRect(x + 46, 728, 18, 5);
  }
  // checkered tile floor
  for (let x = K, i = 0; x < R; x += 50, i++) for (let y = GROUND, j = 0; y < GROUND + 120; y += 30, j++) {
    ctx.fillStyle = (i + j) % 2 ? '#e8e2d6' : '#b9c4c8'; ctx.fillRect(x, y, 50, 30);
  }
  drawFridge();
}
// the fridge, its door swinging open by revealK(), and the raccoon helping himself
function drawFridge() {
  const F = KITCHEN.fridge, k = revealK(), h = GROUND - F.top;
  ctx.fillStyle = '#e3e8ec'; rr(F.x, F.top, F.w, h, 12); ctx.fill();
  ctx.strokeStyle = '#9aa6b1'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(F.x, F.top + 120); ctx.lineTo(F.x + F.w, F.top + 120); ctx.stroke();   // freezer line
  if (k > 0) {
    // the lit inside, with shelves of food
    const gr = ctx.createLinearGradient(0, F.top + 124, 0, GROUND);
    gr.addColorStop(0, '#fbfeff'); gr.addColorStop(1, '#cfe6f2');
    ctx.fillStyle = gr; ctx.fillRect(F.x + 8, F.top + 126, F.w - 16, h - 132);
    const cols = ['#e8726b', '#7fc4e8', '#f6d27a', '#9fd3a8'];
    for (let r2 = 0; r2 < 3; r2++) {
      const y = F.top + 200 + r2 * 85;
      ctx.fillStyle = 'rgba(160,190,210,0.7)'; ctx.fillRect(F.x + 8, y, F.w - 16, 5);
      for (let b = 0; b < 4; b++) { ctx.fillStyle = cols[(r2 + b) % 4]; rr(F.x + 18 + b * 36, y - 40, 26, 40, 5); ctx.fill(); }
    }
  }
  // the door: closed it covers the front; opening, it swings out to the right on its right-hand hinge
  const yt = F.top + 122, hx = F.x + F.w, xr = F.x + (F.w + 75) * k;
  ctx.fillStyle = '#eef2f5';
  ctx.beginPath(); ctx.moveTo(hx, yt); ctx.lineTo(xr, yt - 16 * k); ctx.lineTo(xr, GROUND + 10 * k - 2); ctx.lineTo(hx, GROUND - 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9aa6b1'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#b9c3cc'; ctx.fillRect(xr + (k > 0.5 ? -12 : 14), F.top + 175, 6, 80);   // handle
  ctx.fillRect(F.x + 20, F.top + 40, 6, 60);                               // freezer handle
  // the raccoon who opens it, standing just past the fridge, munching what he found
  drawCoon(hx + 40 + 70 * k, GROUND - 35, 34, -0.1, { hp: 30, maxHp: 30, blink: 9, act: 'fish' });
}

// plug-in night lights along the wall: each a little glowing shape, with its own hue and a gentle breathe
const NIGHT_LIGHTS = [
  { x: SLING.x - 175, shape: 'dome', rgb: '255,190,110', r: 560 },          // warm amber by the cats (the biggest glow)
  { x: 760, shape: 'star', rgb: '255,120,190', r: 380 },                    // pink star
  { x: 1160, shape: 'moon', rgb: '110,230,220', r: 300 },                   // teal moon by the kitchen door
].map((l, i) => ({ ...l, y: 712, ph: i * 1.3 }));
const nlPulse = l => 0.9 + 0.1 * Math.sin(frame * 0.03 + l.ph);
function nlShape(l, x, y) {
  ctx.beginPath();
  if (l.shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 6 : 14; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); }
  else if (l.shape === 'moon') { ctx.arc(x, y, 13, 0.6, Math.PI * 2 - 0.6); ctx.arc(x + 7, y, 10, Math.PI * 2 - 0.9, 0.9, true); ctx.closePath(); }
  else if (l.shape === 'mushroom') { ctx.arc(x, y - 2, 14, Math.PI, 0); ctx.lineTo(x + 5, y - 2); ctx.lineTo(x + 5, y + 12); ctx.lineTo(x - 5, y + 12); ctx.lineTo(x - 5, y - 2); ctx.closePath(); }
  else if (l.shape === 'heart') { ctx.moveTo(x, y + 12); ctx.bezierCurveTo(x - 18, y, x - 10, y - 14, x, y - 5); ctx.bezierCurveTo(x + 10, y - 14, x + 18, y, x, y + 12); }
  else { ctx.arc(x, y - 2, 13, Math.PI, 0); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x - 13, y + 10); ctx.closePath(); }
}
function drawNightLights() {
  for (const l of NIGHT_LIGHTS) {
    ctx.fillStyle = '#e9e3d6'; rr(l.x - 13, l.y - 4, 26, 30, 6); ctx.fill();   // the plug
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(l.x - 5, l.y + 12, 3, 6); ctx.fillRect(l.x + 2, l.y + 12, 3, 6);
    nlShape(l, l.x, l.y - 16); ctx.fillStyle = `rgba(${l.rgb},1)`; ctx.fill();
  }
}
// the night-light shapes again after the darkness, so they glow in their own colour with a pale core
function drawNightLightFaces() {
  for (const l of NIGHT_LIGHTS) {
    nlShape(l, l.x, l.y - 16); ctx.fillStyle = `rgba(${l.rgb},0.95)`; ctx.fill();
    ctx.save(); ctx.translate(l.x, l.y - 16); ctx.scale(0.5, 0.5); nlShape(l, 0, 0); ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  }
}
// fairy lights strung in swags along the ceiling
function fairyBulbs() {
  const out = [], x0 = 260, x1 = KITCHEN.x - 60, span = 300;
  for (let x = x0; x <= x1; x += 38) {
    const f = ((x - x0) % span) / span, y = 318 + Math.sin(f * Math.PI) * 46;
    const k = Math.round((x - x0) / 38);
    out.push({ x, y, c: FAIRY[k % FAIRY.length], a: 0.55 + 0.45 * Math.sin(frame * 0.06 + k * 1.7) });
  }
  return out;
}
function drawFairyWire(bulbs) {
  ctx.strokeStyle = 'rgba(40,40,50,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
  bulbs.forEach((b, i) => i ? ctx.lineTo(b.x, b.y - 4) : ctx.moveTo(b.x, b.y - 4)); ctx.stroke();
  for (const b of bulbs) { ctx.fillStyle = b.c; ctx.beginPath(); ctx.ellipse(b.x, b.y + 3, 4.5, 6.5, 0, 0, 7); ctx.fill(); }
}
// a soft round light: cut out of the darkness (ctxN) or added as colour (ctx with 'lighter')
function softLight(g, x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
function lookouts() { return bodies().filter(b => b.game && b.game.kind === 'coon' && b.game.flashlight && !b.game.dead); }
// everything that gives off light this frame, as shapes that can be drawn into either canvas
function nightLights() {
  const L = [];
  // the windows give off just a soft cool glow (no beams)
  for (const w of WINDOWS) { const x = cam.x * (1 - FAR_P) + w.wx; if (x + w.ww > KITCHEN.x) continue; L.push({ kind: 'round', x: x + w.ww / 2, y: w.wy + w.wh * 0.6, r: 330, rgb: '150,180,255', cut: 0.35, glow: 0.05 }); }
  // the night lights: a big soft glow each, plus a brighter pool where it lights the floor
  for (const l of NIGHT_LIGHTS) {
    const k = nlPulse(l);
    L.push({ kind: 'round', x: l.x, y: l.y - 16, r: l.r * 0.72 * k, rgb: l.rgb, cut: 0.62 * k, glow: 0.16 * k });
    L.push({ kind: 'pool', x: l.x, y: GROUND + 4, rx: l.r * 0.45, ry: 22, rgb: l.rgb, cut: 0.4 * k, glow: 0.18 * k });
  }
  // the fridge flinging its light across the kitchen when it opens
  const fk = revealK();
  if (fk > 0) {
    const F = KITCHEN.fridge;
    L.push({ kind: 'rect', x: F.x, y: F.top + 120, w: F.w, h: GROUND - F.top - 120, cut: 0.97 * fk, glow: 0 });
    L.push({ kind: 'round', x: F.x + 20, y: GROUND - 200, r: 950, rgb: '200,235,255', cut: 0.93 * fk, glow: 0.16 * fk });
  }
  // lamps: dim bulb glow until switched on, then a big warm pool of light
  for (const b of bodies()) {
    const g = b.game;
    if (!g || g.mat !== 'lamp') continue;
    const x = b.position.x, y = b.position.y - g.h / 2 + 12, k = g.on ? Math.min(1, (g.onT + 1) / 20) : 0;
    if (k > 0) {
      L.push({ kind: 'round', x, y, r: 420 * k, rgb: '255,225,160', cut: 0.98 * k, glow: 0.2 * k });
      L.push({ kind: 'pool', x, y: GROUND + 4, rx: 300 * k, ry: 26, rgb: '255,225,160', cut: 0.5 * k, glow: 0.2 * k });
    } else L.push({ kind: 'round', x, y, r: 80, rgb: '255,225,160', cut: 0.3, glow: 0.12 + 0.07 * Math.sin(frame * 0.08) });
  }
  // a lookout's flashlight cone (if any)
  for (const b of lookouts()) {
    const a = flashAngle(b.game), r = b.game.r, ox = b.position.x + Math.cos(a) * r * 1.15, oy = b.position.y + Math.sin(a) * r * 1.15;
    L.push({ kind: 'cone', x: ox, y: oy, a, spread: 0.2, len: 700, rgb: '255,236,170', cut: 0.22, glow: 0.04 });
    L.push({ kind: 'round', x: ox + Math.cos(a) * 430, y: oy + Math.sin(a) * 430, r: 150, rgb: '255,236,170', cut: 0.75, glow: 0.16 });
  }
  // fairy lights, and flashes from explosions
  for (const b of fairyBulbs()) L.push({ kind: 'round', x: b.x, y: b.y + 3, r: 46, rgb: hexRgb(b.c), cut: 0.35 * b.a, glow: 0.35 * b.a });
  for (const p of particles) if (p.type === 'ring') L.push({ kind: 'round', x: p.x, y: p.y, r: p.s * 1.4, rgb: '255,210,140', cut: 0.9 * p.life / p.max, glow: 0.4 * p.life / p.max });
  return L;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; }
function paintLight(g, l, alpha, rgb) {
  if (l.kind === 'round') softLight(g, l.x, l.y, l.r, rgb, alpha);
  else if (l.kind === 'pool') { g.save(); g.translate(l.x, l.y); g.scale(1, l.ry / l.rx); softLight(g, 0, 0, l.rx, rgb, alpha); g.restore(); }
  else if (l.kind === 'rect') { g.fillStyle = `rgba(${rgb},${alpha})`; g.fillRect(l.x, l.y, l.w, l.h); }
  else if (l.kind === 'poly') {
    const gr = g.createLinearGradient(0, l.y0, 0, l.y1); gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(1, `rgba(${rgb},${alpha * 0.3})`);
    g.fillStyle = gr; g.beginPath(); l.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  } else if (l.kind === 'cone') {
    const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.len); gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(0.6, `rgba(${rgb},${alpha * 0.55})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(l.x, l.y); g.arc(l.x, l.y, l.len, l.a - l.spread, l.a + l.spread); g.closePath(); g.fill();
    softLight(g, l.x, l.y, 40, rgb, alpha);                                 // the bright lens
  }
}
function drawNight() {
  const W = canvas.width, H = canvas.height;
  if (!nightCanvas || nightCanvas.width !== W || nightCanvas.height !== H) { nightCanvas = document.createElement('canvas'); nightCanvas.width = W; nightCanvas.height = H; }
  const n = nightCanvas.getContext('2d'), lights = nightLights();
  n.setTransform(1, 0, 0, 1, 0, 0); n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, W, H);
  n.fillStyle = 'rgba(6,8,30,0.93)'; n.fillRect(0, 0, W, H);
  n.setTransform(ctx.getTransform());
  if (hasFridge() && revealK() < 1) {
    // with the fridge shut the kitchen is nearly pitch black: only the eyeshine and the flashes give anything away
    const gr = n.createLinearGradient(KITCHEN.x - 200, 0, KITCHEN.x + 60, 0);
    gr.addColorStop(0, 'rgba(2,3,12,0)'); gr.addColorStop(1, `rgba(2,3,12,${0.88 * (1 - revealK())})`);
    n.fillStyle = gr; n.fillRect(KITCHEN.x - 200, -800, WORLD_W + 600, 2000);
  }
  n.globalCompositeOperation = 'destination-out';
  for (const l of lights) paintLight(n, l, l.cut, '0,0,0');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(nightCanvas, 0, 0); ctx.restore();
  drawNightLightFaces();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) if (l.glow) paintLight(ctx, l, l.glow, l.rgb);
  // eyeshine: cats' eyes catch the light in the dark
  const eyes = [];
  const add = (x, y, r, type) => { const e = type === 'cece' ? [0.3, -0.13] : type === 'baby' ? [0.34, -0.08] : [0.32, -0.1]; for (const sg of [-1, 1]) eyes.push([x + sg * e[0] * r, y + e[1] * r, r]); };
  queueSpots().forEach(q => add(q.x, q.y, q.r, q.type));
  if (phase === 'aim' && current) add(SLING.x + pull.x, SLING.y + pull.y, CATS[current].r, current);
  for (const c of flying) if (!c.game.done) add(c.position.x, c.position.y, c.game.r, c.game.type);
  for (const [x, y, r] of eyes) softLight(ctx, x, y, r * 0.22, '200,255,150', 0.55);
  for (const b of fairyBulbs()) softLight(ctx, b.x, b.y + 3, 9, hexRgb(b.c), b.a);
  // night-vision goggles glow green in the dark: that's how you spot a raccoon nobody has lit up
  for (const b of bodies()) {
    const g = b.game;
    if (!g || g.kind !== 'coon' || !g.goggles || g.blind || g.dead) continue;
    const c = Math.cos(b.angle), sn = Math.sin(b.angle);
    for (const sg of [-1, 1]) { const px = sg * g.r * 0.34, py = -g.r * 0.05; softLight(ctx, b.position.x + px * c - py * sn, b.position.y + px * sn + py * c, g.r * 0.5, '90,255,130', 0.7); }
  }
  for (const l of NIGHT_LIGHTS) softLight(ctx, l.x, l.y - 16, 30, l.rgb, 0.45 * nlPulse(l));
  ctx.restore();
}

function drawPortals() {
  for (const q of portals) {
    const r = PORTAL_R;
    ctx.save(); ctx.translate(q.x, q.y);
    const gr = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
    gr.addColorStop(0, `rgba(${q.glow},0.35)`); gr.addColorStop(1, `rgba(${q.glow},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(30,18,50,0.55)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r, 0, 0, 7); ctx.fill();
    // the flap swings when something goes through, and sways a little otherwise
    const sw = q.flap > 0 ? Math.sin(q.flap * 0.55) * (q.flap / 24) * 1.2 : Math.sin(frame * 0.05 + q.x) * 0.08;
    ctx.save(); ctx.translate(0, -r * 0.62); ctx.scale(1, Math.max(0.15, Math.cos(sw)));
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(-r * 0.46, 0, r * 0.92, r * 1.2, r * 0.25); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = q.color;                                                // paw print on the flap
    ctx.beginPath(); ctx.ellipse(0, r * 0.72, r * 0.18, r * 0.14, 0, 0, 7); ctx.fill();
    for (const [tx, ty] of [[-0.2, 0.46], [-0.07, 0.4], [0.07, 0.4], [0.2, 0.46]]) { ctx.beginPath(); ctx.arc(tx * r, ty * r, r * 0.065, 0, 7); ctx.fill(); }
    ctx.restore();
    // glowing frame with a slow swirl of dashes
    ctx.strokeStyle = q.color; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]); ctx.lineDashOffset = -frame * 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.84, r * 1.12, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
}
function drawSunbeam() {
  if (!sun) return;
  const x0 = sun.x - sun.w / 2, x1 = sun.x + sun.w / 2, sh = 260;          // slants down from the window, top left
  ctx.fillStyle = 'rgba(255,236,160,0.16)';
  ctx.beginPath(); ctx.moveTo(x0 - sh, 300); ctx.lineTo(x1 - sh, 300); ctx.lineTo(x1, GROUND); ctx.lineTo(x0, GROUND); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,140,0.4)'; ctx.beginPath(); ctx.ellipse(sun.x, GROUND - 2, sun.w / 2, 9, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 6; i++) {                                           // dust motes
    const k = (frame * 0.002 + hash(i) ) % 1;
    ctx.fillStyle = 'rgba(255,250,220,' + (0.6 * Math.sin(k * Math.PI)) + ')';
    ctx.beginPath(); ctx.arc(x0 - sh * (1 - k) + hash(i * 5) * sun.w, 300 + k * (GROUND - 300), 2.5, 0, 7); ctx.fill();
  }
  if (napCat) {
    sleepyEyes = true;
    drawCat(napCat.x, GROUND - 26 + Math.sin(frame * 0.05) * 1.5, 26, 0, napCat.type, { calm: true });
    sleepyEyes = false;
    for (let i = 0; i < 3; i++) {
      const k = (frame * 0.012 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      text('z', napCat.x + 22 + k * 34, GROUND - 58 - k * 60, 16 + k * 16, '#ffffff', { stroke: '#3a2160', strokeW: 4 });
    }
    ctx.globalAlpha = 1;
  }
}
function drawBird() {
  if (!bird) return;
  const b = birdPos(), t = frame + bird.seed, fl = bird.flee > 0;
  ctx.save(); ctx.translate(b.x, b.y); if (fl) ctx.rotate(-0.3);
  if (!fl) { ctx.strokeStyle = '#b57a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(-4, 24); ctx.moveTo(6, 14); ctx.lineTo(6, 24); ctx.stroke(); }
  ctx.fillStyle = '#3f6fb5'; ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(-42, 12); ctx.lineTo(-40, -4); ctx.closePath(); ctx.fill();   // tail
  ctx.fillStyle = '#6fa8e8'; ctx.beginPath(); ctx.ellipse(0, 0, 23, 17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f7fb'; ctx.beginPath(); ctx.ellipse(5, 7, 14, 9, 0, 0, 7); ctx.fill();
  const wf = fl ? Math.sin(t * 0.9) * 1 : 0;
  ctx.save(); ctx.translate(-4, -3); ctx.rotate(-0.3 + wf); ctx.fillStyle = '#4a82cc'; ctx.beginPath(); ctx.ellipse(-7, 0, 17, 7, 0, 0, 7); ctx.fill(); ctx.restore();
  const hy = -13 + (fl ? 0 : Math.sin(t * 0.045) * 2);
  ctx.fillStyle = '#6fa8e8'; ctx.beginPath(); ctx.arc(17, hy, 12, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.moveTo(27, hy - 3); ctx.lineTo(38, hy + 1); ctx.lineTo(27, hy + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(21, hy - 3, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22, hy - 4, 0.9, 0, 7); ctx.fill();
  ctx.restore();
}
function drawHairball() {
  if (!hairball) return;
  const { x, y } = hairball;
  ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.ellipse(x, y, 20, 14, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#b08a62'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (const [dx, dy, ex, ey] of [[-14, -4, -22, -9], [-8, -10, -10, -17], [4, -12, 8, -19], [14, -6, 23, -10], [16, 4, 25, 7], [-16, 5, -24, 8]]) { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + ex, y + ey); ctx.stroke(); }
  ctx.lineCap = 'butt';
}
// the moon grows cat ears, eyes and whiskers when you tap it (drawn inside the window)
function drawMoonCat(mx, my) {
  const c = '#f4f1dc';
  for (const sg of [-1, 1]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(mx + sg * 14, my - 38); ctx.lineTo(mx + sg * 36, my - 64); ctx.lineTo(mx + sg * 41, my - 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2a7c0'; ctx.beginPath(); ctx.moveTo(mx + sg * 21, my - 38); ctx.lineTo(mx + sg * 34, my - 56); ctx.lineTo(mx + sg * 37, my - 30); ctx.closePath(); ctx.fill();
  }
  const blink = moonCat % 110 < 7;
  for (const sg of [-1, 1]) {
    const ex = mx + sg * 15, ey = my - 6;
    if (blink) { ctx.strokeStyle = '#555'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex - 6, ey); ctx.lineTo(ex + 6, ey); ctx.stroke(); continue; }
    ctx.fillStyle = '#9fd36a'; ctx.beginPath(); ctx.ellipse(ex, ey, 7, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(ex, ey, 2.4, 8, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#f08aa8'; ctx.beginPath(); ctx.moveTo(mx - 5, my + 6); ctx.lineTo(mx + 5, my + 6); ctx.lineTo(mx, my + 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, my + 12); ctx.quadraticCurveTo(mx - 6, my + 20, mx - 12, my + 15); ctx.moveTo(mx, my + 12); ctx.quadraticCurveTo(mx + 6, my + 20, mx + 12, my + 15); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
  for (const sg of [-1, 1]) for (const dy of [-2, 5]) { ctx.beginPath(); ctx.moveTo(mx + sg * 20, my + 10 + dy * 0.5); ctx.lineTo(mx + sg * 58, my + 6 + dy * 2.5); ctx.stroke(); }
}
function drawLaser() {
  if (!laser) return;
  ctx.globalAlpha = Math.min(1, laser.life / 20);
  const gr = ctx.createRadialGradient(laser.x, laser.y, 0, laser.x, laser.y, 16);
  gr.addColorStop(0, 'rgba(255,40,40,0.9)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(laser.x, laser.y, 16, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd6d6'; ctx.beginPath(); ctx.arc(laser.x, laser.y, 3.5, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBalloon(b) {
  const x = b.position.x, y = b.position.y;
  ctx.fillStyle = b.game.color;
  ctx.beginPath(); ctx.ellipse(x, y, 22, 27, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 30); ctx.lineTo(x + 5, y + 30); ctx.lineTo(x, y + 25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - 8, y - 10, 5, 9, -0.4, 0, 7); ctx.fill();
}

function drawWorld() {
  drawBird();
  if (isNight()) { nightWindows(); drawKitchen(); drawNightLights(); drawFairyWire(fairyBulbs()); }
  // while it's about to snap, the whole slingshot shakes harder and harder
  const creak = snapStrain / SNAP_DELAY;
  const sj = creak > 0 ? { x: (Math.random() - 0.5) * (3 + 8 * creak), y: (Math.random() - 0.5) * (2 + 4 * creak) } : { x: 0, y: 0 };
  ctx.save(); ctx.translate(sj.x, sj.y); drawSlingBack(); ctx.restore();
  drawSunbeam();
  drawBox();
  // waiting cats sit in line behind the slingshot
  queueSpots().forEach((q, i) => {
    const bob = Math.sin(frame * 0.05 + i) * 2 - chatterHop(i + 1);
    const lead = flying.find(c => !c.game.done), watch = lead && !chatterAt(i + 1)
      ? { lookX: Math.max(-1, Math.min(1, (lead.position.x - q.x) / 400)), lookY: Math.max(-1, Math.min(1, (lead.position.y - q.y) / 300)) } : {};
    drawCat(q.x, q.y + bob, q.r, 0, q.type, { calm: !chatterAt(i + 1), ...watch, ...(winTimer > 0 ? { mood: 'happy' } : chatterMood(i + 1)) });
    chatterBubble(i + 1, q.x + q.r * 0.3, GROUND - q.r * 2.3 + bob);
  });
  drawLaser();
  drawHairball();

  const loaded = phase === 'aim' && current;
  const strain = loaded && current === 'cece' && !bandSnapped
    ? Math.max(0, Math.min(1, (Math.hypot(pull.x, pull.y) - SNAP_PULL * 0.75) / (SNAP_PULL * 0.25))) : 0;
  const jig = strain > 0.5 ? (Math.random() - 0.5) * (4 * strain + 10 * creak) : 0;
  const tip = { x: SLING.x + pull.x + jig, y: SLING.y + pull.y + jig };
  if (loaded && !bandSnapped) band(SLING.x + 26 + sj.x, 646 + sj.y, tip.x + 6, tip.y, strain);
  if (snapTimer > 0 || bandSnapped) snappedBands();

  const list = bodies().filter(b => b.game);
  const order = { block: 0, loot: 1, balloon: 2, coon: 3, cat: 4 };
  drawBubbles();
  drawPortals();
  // basket ropes, from the ceiling hook down to the handle
  for (const w of swings) {
    ctx.fillStyle = '#8a8f99'; ctx.beginPath(); ctx.arc(w.ax, w.ay, 7, 0, 7); ctx.fill();
    ctx.fillRect(w.ax - 14, w.ay - 12, 28, 6);
    if (w.cut) continue;
    const hp = Vector.add(w.basket.position, Vector.rotate(w.basket.game.handle, w.basket.angle));
    ctx.strokeStyle = '#9a7b52'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w.ax, w.ay); ctx.lineTo(hp.x, hp.y); ctx.stroke();
  }
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
        g.trail.forEach((p, i) => { ctx.globalAlpha = (i / g.trail.length) * 0.35; drawCat(p.x, p.y, g.r * 0.9, posed ? 0 : b.angle, g.type, { mood: 'yowl', still: true }); });
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        g.trail.forEach((p, i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); } });
      }
      if (g.shake > 0) {
        // the head shake: fast side-to-side wobble with blurry ghost copies
        const amt = g.shake / 42, w = Math.sin(g.shake * 1.6) * 0.5 * amt;
        ctx.globalAlpha = 0.3;
        drawCat(b.position.x - 10 * amt, b.position.y, g.r, b.angle - w, g.type, { mood: 'yowl' });
        drawCat(b.position.x + 10 * amt, b.position.y, g.r, b.angle + w, g.type, { mood: 'yowl' });
        ctx.globalAlpha = 1;
        drawCat(b.position.x + w * 16, b.position.y, g.r, b.angle + w, g.type, { mood: 'yowl' });
      } else if (posed) {
        drawFlyer(b.position.x, b.position.y, g.r, b.velocity, g.type, g.clone ? 0.75 : 1, g.scare > 0 ? 'scared' : 'yowl');
      } else {
        drawCat(b.position.x, b.position.y, g.r, g.type === 'cece' ? b.angle : 0, g.type, { alpha: g.clone ? 0.75 : 1, mood: flightMood(b) });
      }
    }
  }

  if (loaded) {
    if (dragging && !bandSnapped) drawTrajectory();
    const hop = dragging ? 0 : chatterHop(0);
    // her face: scared when the band creaks or snaps, fiercer the further she's pulled, else her chatter face
    const face = bandSnapped || snapStrain > 0 || strain > 0.5 ? { mood: 'scared' }
      : dragging ? { mood: 'fierce', k: Math.min(1, Math.hypot(pull.x, pull.y) / MAX_PULL), lookX: 0.75, lookY: -0.2 } : chatterMood(0);
    drawCat(tip.x, tip.y - hop, CATS[current].r, 0, current, face);
    chatterBubble(0, tip.x + CATS[current].r * 0.4, tip.y - hop - CATS[current].r * 1.75);
    if (!bandSnapped) band(SLING.x - 24 + sj.x, 646 + sj.y, tip.x - 6, tip.y, strain);
  }
  ctx.save(); ctx.translate(sj.x, sj.y); drawSlingFront(); ctx.restore();
  if (isNight()) drawNight();

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
    else if (p.type === 'kitten') { ctx.globalAlpha = 1; drawCat(p.x, p.y - Math.abs(Math.sin(p.life * 0.4)) * 14, p.s, Math.sin(p.life * 0.4) * 0.15, 'baby', { mood: 'happy' }); }
    else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); starShape(0, 0, p.s, p.color); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    if (p.tip) {
      // a level tip: big, on a dark pill, parked near the middle of the screen so it can be read
      ctx.font = `700 40px ${FONT}`;
      const tw = ctx.measureText(p.text).width + 70;
      ctx.fillStyle = 'rgba(24,14,48,0.85)'; rr(p.x - tw / 2, p.y - 40, tw, 80, 40); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      text(p.text, p.x, p.y + 2, 40, '#ffe14d', { stroke: '#120a26', strokeW: 8 });
    } else if (p.egg) text(p.text, p.x, p.y, 46, '#ffe14d', { font: "'Luckiest Guy', " + FONT, weight: 400, stroke: '#e8578f', strokeW: 8 });
    else text(p.text, p.x, p.y, p.big ? 28 : 20, p.big ? '#ffd84a' : '#ffffff', { stroke: '#3a2160', strokeW: 5 });
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
    if (introTimer > 0) hint = null;   // the camera is still on the fort: don't cover the level's tip until it swings back
  } else if (state === 'play' && phase === 'aim' && dragging && current === 'cece') {
    const d = Math.hypot(pull.x, pull.y);
    hint = bandSnapped ? 'Oops! Let go and watch her plop...' : snapStrain > 0 ? "It's creaking! Ease off!" : d > SNAP_PULL * 0.85 ? 'Easy... she\'s really heavy!' : null;
  } else if (state === 'play' && phase === 'flying' && !powerUsed && flying[0] && !flying[0].game.done) {
    hint = flying[0].game.snapped ? "We're gonna need a stronger slingshot." : CATS[flying[0].game.type].hint;
  }
  if (hint) {
    ctx.font = `700 54px ${FONT}`;
    const w = ctx.measureText(hint).width + 90;
    ctx.fillStyle = 'rgba(24,14,48,0.82)'; rr(UW / 2 - w / 2, 126, w, 92, 46); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    text(hint, UW / 2, 174, 54, '#ffe14d', { stroke: '#120a26', strokeW: 10 });
  }
  drawUpBanner();
  drawEggBanner();
}

// the Easter egg badge: pops in with an overshoot, sunburst behind, fades out
function drawEggBanner() {
  if (!eggBanner || (state !== 'play' && state !== 'won')) return;
  const t = eggBanner.t, cy = upBanner && upBanner.t >= 0 ? 700 : 370;
  const sc = t < 8 ? 0.3 + 0.9 * t / 8 : t < 14 ? 1.2 - 0.2 * (t - 8) / 6 : 1;
  ctx.save();
  ctx.globalAlpha = t > EGG_LEN - 20 ? (EGG_LEN - t) / 20 : 1;
  ctx.translate(UW / 2, cy); ctx.scale(sc, sc); ctx.rotate(Math.sin(t * 0.08) * 0.02);
  ctx.save(); ctx.rotate(t * 0.01); ctx.fillStyle = 'rgba(255,225,120,0.28)';
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-45, -260); ctx.lineTo(45, -260); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const tf = "'Luckiest Guy', " + FONT;
  ctx.font = `400 76px ${tf}`;
  const w = Math.max(560, ctx.measureText(eggBanner.title).width + 130);
  ctx.fillStyle = 'rgba(24,14,48,0.92)'; rr(-w / 2, -100, w, 200, 44); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#ff8fb8'; ctx.stroke();
  text(eggBanner.title, 0, -30, 76, '#ffe14d', { font: tf, weight: 400, stroke: '#e8578f', strokeW: 10 });
  text('+' + eggBanner.pts.toLocaleString() + (eggBanner.sub ? '  ' + eggBanner.sub : ''), 0, 50, 46, '#ffffff', { stroke: '#120a26', strokeW: 8 });
  for (const sg of [-1, 1]) { ctx.save(); ctx.translate(sg * (w / 2 - 6), -96); ctx.rotate(t * 0.05 * sg); starShape(0, 0, 30, '#ffd23f', '#b8860b'); ctx.restore(); }
  ctx.restore();
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
  drawCat(UW / 2 - 210, 462 + Math.sin(t * 0.3) * 3, r, Math.sin(t * 0.25) * 0.08, type, { mood: 'fierce', k: 0.7 });
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

// the three cats flanking the result panel: bouncing and beaming on a win, slumped and teary on a loss
function resultCats(mood) {
  const happy = mood === 'happy';
  for (const [type, x, y, r, ph] of [['cleo', W / 2 - 450, 470, 72, 0], ['baby', W / 2 - 430, 660, 60, 1.7], ['cece', W / 2 + 470, 570, 100, 0.8]]) {
    const hop = happy ? Math.abs(Math.sin(frame * 0.09 + ph)) * 26 : 0;
    drawCat(x, y - hop + (happy ? 0 : 10), r, happy ? Math.sin(frame * 0.09 + ph) * 0.1 : (x < W / 2 ? 0.12 : -0.12), type, { mood });
  }
}
function drawWon() {
  panel(W / 2, H / 2, 680, 470);
  resultCats('happy');
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
  resultCats('sad');
  text('They got away!', W / 2, 320, 56, '#7a5a9a', { stroke: '#fff', strokeW: 6 });
  drawCoon(W / 2, 420, 46, Math.sin(frame * 0.08) * 0.15, { hp: 30, maxHp: 30, blink: 0, act: 'fish' });
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
const LOGO_W = 1100, LOGO_H = 552, LOGO_S = 2, LOGO_PAD = 82;   // LOGO_PAD: headroom above ANGRY for the big "Vickie's"
function buildLogo() {
  const fontReady = !document.fonts || document.fonts.check("40px 'Luckiest Guy'");
  if (logoCanvas && (logoBuiltWithFont || !fontReady)) return;
  logoBuiltWithFont = fontReady;
  const mk = () => { const c = document.createElement('canvas'); c.width = LOGO_W * LOGO_S; c.height = LOGO_H * LOGO_S; const g = c.getContext('2d'); g.scale(LOGO_S, LOGO_S); g.translate(0, LOGO_PAD); return [c, g]; };
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
  g.drawImage(fc, 0, -LOGO_PAD, LOGO_W, LOGO_H);
  // "Vickie's" tag over the top-left of the logo
  // big and purple so it stands out from the white-and-gold letters
  g.save(); g.translate(LOGO_W / 2, 0);                                  // centred and level above ANGRY
  g.font = "700 122px 'Dancing Script', 'Brush Script MT', cursive"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 22; g.strokeText("Vickie's", 5, 6);
  g.strokeStyle = '#3b2414'; g.lineWidth = 20; g.strokeText("Vickie's", 0, 0);
  g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.strokeText("Vickie's", 0, 0);
  const vg = g.createLinearGradient(0, -45, 0, 40); vg.addColorStop(0, '#c58cff'); vg.addColorStop(1, '#7a2fd6');
  g.fillStyle = vg; g.fillText("Vickie's", 0, 0);
  g.restore();
  logoCanvas = c;
}
function drawLogo(cx, top, scale) {
  buildLogo();
  ctx.drawImage(logoCanvas, cx - LOGO_W * scale / 2, top, LOGO_W * scale, LOGO_H * scale);
}

function drawMenu() {
  ctx.fillStyle = 'rgba(30,50,60,0.22)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  drawLogo(W / 2, 0, 1.0);
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
    uiButtons.push({ x: x + uiShift, y: y + 36, w: r * 2, h: r * 2.2, action: tapCat(type) });
  }
  const lookAt = (x, y) => menuPointer && frame - menuPointer.f < 180
    ? { lookX: Math.max(-1, Math.min(1, (menuPointer.x - uiShift - x) / 350)), lookY: Math.max(-1, Math.min(1, (menuPointer.y - y) / 300)) } : {};
  const menuFace = type => hopOf(type) > 0 ? { mood: 'happy' } : lookAt(type === 'baby' ? 548 : type === 'cece' ? 800 : 1052, 660);
  drawCat(800, 648 + bob(1) - hopOf('cece'), 132, 0, 'cece', menuFace('cece'));
  drawCat(548, 686 + bob(0) - hopOf('baby'), 84, -0.08, 'baby', menuFace('baby'));
  drawCat(1052, 682 + bob(2) - hopOf('cleo'), 92, 0.06, 'cleo', menuFace('cleo'));
  nameText('baby', 548, 808, 62);
  nameText('cece', 800, 836, 70);
  nameText('cleo', 1052, 808, 72);
  button('PLAY', side * 0.5 + 1385, 760, 340, 120, '#4caf6a', () => { state = 'levels'; });
  text('v' + GAME_VERSION, -uiShift + 30, 872, 48, '#ffffff', { align: 'left', stroke: 'rgba(0,0,0,0.55)', strokeW: 8, weight: 700 });
  if (!bigFullscreenButton(UW - uiShift - 200, 62, 330, 88)) exitFullscreenButton(UW - uiShift - 110, 62);
  iconButton('music', UW - uiShift - (!canFullscreen ? 60 : isFullscreen() ? 245 : 420), 60, () => music.toggle());
}

// the code keypad over the level picker
function codeKey(d) {
  if (!codePad || codePad.entry.length >= 4) return;
  codePad.entry += d; sfx.tone('triangle', 900, 900, 0.05, 0.08);
  if (codePad.entry.length === 4) {
    if (codePad.entry === UNLOCK_CODE) {
      codeEntered = true; try { localStorage.setItem(CODE_KEY, UNLOCK_CODE); } catch (e) { /* private mode */ }
      const lv = codePad.level; codePad = null; sfx.ding(); loadLevel(lv);
    } else { codePad.shake = 20; sfx.tone('sawtooth', 220, 150, 0.25, 0.08); setTimeout(() => { if (codePad) codePad.entry = ''; }, 350); }
  }
}
function drawCodePad() {
  const cx = W / 2, cy = H / 2 + 20, sh = codePad.shake > 0 ? Math.sin(codePad.shake * 1.5) * codePad.shake * 0.8 : 0;
  if (codePad.shake > 0) codePad.shake--;
  uiButtons.push({ x: UW / 2, y: H / 2, w: UW * 3, h: H * 3, action: () => { codePad = null; } });   // tap outside to close
  panel(cx, cy, 460, 620);
  uiButtons.push({ x: cx + uiShift, y: cy, w: 460, h: 620, action: () => {} });                      // taps on the panel itself do nothing
  text(`Level ${codePad.level + 1} is locked`, cx, cy - 255, 34, '#7a5a9a');
  text('Enter the code', cx, cy - 215, 24, '#9a8a7a', { weight: 500 });
  for (let k = 0; k < 4; k++) {
    const bx = cx + sh + (k - 1.5) * 70;
    ctx.fillStyle = '#ffffff'; rr(bx - 27, cy - 185, 54, 62, 12); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = codePad.shake > 0 ? '#e8578f' : '#e8b06a'; ctx.stroke();
    if (codePad.entry[k]) text(codePad.entry[k], bx, cy - 152, 38, '#5b3a1e');
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].forEach((d, k) => {
    const bx = cx + (k % 3 - 1) * 112, by = cy - 50 + Math.floor(k / 3) * 86;
    button(d, bx, by, 96, 72, d === 'C' ? '#c98a8a' : d === '←' ? '#8e7cc3' : '#f2994a', () => {
      if (!codePad) return;
      if (d === 'C') codePad.entry = '';
      else if (d === '←') codePad.entry = codePad.entry.slice(0, -1);
      else codeKey(d);
    });
  });
}
function drawLevels() {
  ctx.fillStyle = 'rgba(30,50,60,0.3)'; ctx.fillRect(-uiShift - 50, -500, UW + 100, H + 1000);
  text('Pick a level', W / 2, 120, 64, '#ffe9a8', { stroke: '#3a2160', strokeW: 12 });
  iconButton('back', 80 - uiShift + 20, 80, () => { state = 'menu'; });
  if (!bigFullscreenButton(UW - uiShift - 200, 62, 330, 88)) exitFullscreenButton(UW - uiShift - 110, 62);
  iconButton('music', UW - uiShift - (!canFullscreen ? 60 : isFullscreen() ? 245 : 420), 60, () => music.toggle());
  if (finale) {
    // the finale ribbon: pops in
    finale.t++;
    const k = Math.min(1, finale.t / 14), pop = 1 + 0.12 * Math.sin(k * Math.PI) * (1 - k), msg = 'Congratulations, you saved the treats and toys.';
    ctx.save(); ctx.translate(W / 2, 222); ctx.scale(pop * k, pop * k);
    ctx.font = `700 42px ${FONT}`;
    const bw = ctx.measureText(msg).width + 130;
    ctx.fillStyle = 'rgba(24,14,48,0.9)'; rr(-bw / 2, -40, bw, 80, 40); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    text(msg, 0, 2, 42, '#ffe14d', { stroke: '#120a26', strokeW: 9 });
    starShape(-bw / 2 + 36, 0, 20, '#ffd23f', '#b8860b'); starShape(bw / 2 - 36, 0, 20, '#ffd23f', '#b8860b');
    ctx.restore();
  }
  const PER_ROW = 8;
  LEVELS.forEach((lv, i) => {
    const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
    const x = W / 2 + (col - (PER_ROW - 1) / 2) * 192, y = 440 + row * 235, w = 176, h = 210;
    const open = unlocked(i);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x - w / 2, y - h / 2 + 8, w, h, 24); ctx.fill();
    ctx.fillStyle = open ? '#fff6e6' : '#9b93ad'; rr(x - w / 2, y - h / 2, w, h, 24); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = open ? '#e8b06a' : '#7b7390'; ctx.stroke();
    if (open) {
      text(String(i + 1), x, y - 48, 64, '#ff7a59', { stroke: '#5b3a1e', strokeW: 8 });
      // long names wrap onto two lines so they fit the narrower card
      ctx.font = `500 18px ${FONT}`;
      const words = lv.name.split(' ');
      let lines = [lv.name];
      if (ctx.measureText(lv.name).width > w - 24) {
        let best = 1, bestD = 1e9;
        for (let k = 1; k < words.length; k++) { const d = Math.abs(ctx.measureText(words.slice(0, k).join(' ')).width - ctx.measureText(words.slice(k).join(' ')).width); if (d < bestD) { bestD = d; best = k; } }
        lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
      }
      lines.forEach((ln, li) => text(ln, x, y + 14 + (lines.length === 1 ? 10 : li * 24), 18, '#5b3a1e', { weight: 500 }));
      const s = bestStars[i] || 0;
      if (goldenFound[i]) drawLoot({ position: { x: x + 62, y: y - 80 }, angle: -0.3, game: { type: 'goldfish' } });
      for (let k = 0; k < 3; k++) starShape(x + (k - 1) * 36, y + 72, 14, k < s ? '#ffd23f' : '#e4dccd', k < s ? '#b8860b' : '#cfc4b1');
      uiButtons.push({ x: x + uiShift, y, w, h, action: () => loadLevel(i) });
    } else {
      ctx.fillStyle = '#5d566e'; rr(x - 26, y - 10, 52, 42, 8); ctx.fill();
      ctx.strokeStyle = '#5d566e'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(x, y - 12, 17, Math.PI, 0); ctx.stroke();
      text(String(i + 1), x, y + 70, 30, '#e9e4f2');
      uiButtons.push({ x: x + uiShift, y, w, h, action: () => { codePad = { level: i, entry: '', shake: 0 }; } });
    }
  });
  if (codePad) drawCodePad();
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
    const tod = levelTime(levelIdx);
    if (!isNight() && tod > 0.4) { ctx.fillStyle = `rgba(255,140,70,${(0.09 * (tod - 0.4) / 0.6).toFixed(3)})`; ctx.fillRect(cam.x - 50, BACKDROP.top, viewW + 100, BACKDROP.bottom - BACKDROP.top); }
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
