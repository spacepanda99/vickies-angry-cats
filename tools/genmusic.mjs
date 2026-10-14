// Generates one level's music with Lyria via the Gemini API. Usage: node genmusic.mjs <level 2-14> [model]
// Saves the FULL raw response (CLAUDE.md: archive raw results of paid calls) plus the audio file. Never prints the key.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const out = path.join(dir, 'music'); fs.mkdirSync(out, { recursive: true });
const key = fs.readFileSync('C:/Mikes Stuff/Gemini api.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => /^AQ\./.test(s));

const BASE = 'Playful, mischievous instrumental cartoon music for a casual mobile slingshot game about three house cats chasing raccoon burglars who stole their treats. Bouncy pizzicato strings, marimba, light ukulele, soft brushed drums and a cheeky clarinet or bassoon melody, like a heist caper for cats. Bright, happy, a little sneaky. Around 110 BPM, steady tempo, major key. No vocals. Seamless loop: no intro, no fade-in or fade-out, and it ends right where it began so it can repeat endlessly.';
// each level keeps the same family of instruments and mood, with its own flavour on top
const FLAVOUR = {
  2: 'Level flavour: a kitchen raid. Clattery pots, spoons and a wooden-spoon-on-a-pan percussion groove, a busy bouncy bassoon line.',
  3: 'Level flavour: a garage workshop. A swaggering walking-bass groove, ratchet and tool-clank percussion, a cheeky muted-trumpet melody.',
  4: 'Level flavour: a pyramid of loot. A playful desert-caper feel with a snake-charmer clarinet melody in a minor-flavoured scale that still resolves to a happy major.',
  5: 'Level flavour: a dusty attic hideout. Cute-spooky, a music box and celesta, a tiptoeing harpsichord and pizzicato, mysterious but still bouncy.',
  6: 'Level flavour: the big boss bandit. Bigger and bolder, a mock-menacing tuba and bassoon theme with timpani hits and brass stabs, still comedic and light-hearted.',
  7: 'Level flavour: bookshelf dominoes. A ragtime upright piano with plinking, falling-domino marimba runs, a jaunty chain-reaction feel.',
  8: 'Level flavour: a giant yarn ball avalanche. Rolling cascading marimba and pizzicato arpeggios that tumble downhill, a playful building energy.',
  9: 'Level flavour: catnip kaboom. A woozy, giddy surf-guitar twang with bouncy bass, a silly wobbly clarinet, explosive cymbal pops.',
  10: 'Level flavour: a balloon getaway. Airy and floaty, glockenspiel, flute and light harp over bouncy ukulele, a carefree floating melody.',
  11: 'Level flavour: a kitten rescue. Warm and heroic, rising strings and a brave clarinet melody, a caring adventurous caper.',
  12: 'Level flavour: zero gravity zoomies. A spacey retro theremin and bubbly synth arpeggios mixed with the pizzicato and marimba, floaty and fun.',
  13: 'Level flavour: magic cat flaps. Shimmering harp glissandos, celesta sparkles and a mysterious-but-playful clarinet, a feeling of magic portals.',
  14: 'Level flavour: robo-vac rodeo. A cartoon western: twangy guitar, a galloping brushed-drum rhythm, whirring robotic bleeps, a rodeo-showdown fanfare feel.',
};
const level = +process.argv[2], model = process.argv[3] || 'lyria-3.5';
if (!FLAVOUR[level]) throw new Error('level must be 2-14');
const prompt = BASE + ' ' + FLAVOUR[level];
const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO', 'TEXT'] } };
const tag = `level${level}-${model}-${Date.now()}`;
fs.writeFileSync(path.join(out, tag + '.prompt.txt'), prompt);
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const raw = await r.text();
fs.writeFileSync(path.join(out, tag + '.raw.json'), raw.split(key).join('[key]'));
console.log('status', r.status, 'bytes', raw.length);
let j; try { j = JSON.parse(raw); } catch { console.log(raw.slice(0, 300).split(key).join('[key]')); process.exit(1); }
if (j.error) { console.log('ERR', j.error.code, j.error.status, String(j.error.message).slice(0, 300)); process.exit(1); }
let n = 0;
for (const c of j.candidates || []) for (const p of c.content?.parts || []) {
  if (p.text) console.log('text:', p.text.slice(0, 200));
  if (p.inlineData) { const ext = /mpeg|mp3/.test(p.inlineData.mimeType) ? 'mp3' : /wav/.test(p.inlineData.mimeType) ? 'wav' : /ogg/.test(p.inlineData.mimeType) ? 'ogg' : 'bin'; const f = path.join(out, `level${level}.${ext}`); fs.writeFileSync(f, Buffer.from(p.inlineData.data, 'base64')); console.log('saved', f, p.inlineData.mimeType, fs.statSync(f).size); n++; }
}
console.log('usage', JSON.stringify(j.usageMetadata || {}));
if (!n) console.log('no audio in response');
