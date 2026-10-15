// Generates one 30-second music clip with Lyria 3 Clip ($0.04 each) for a cut scene.
// Usage: node genclip.mjs <name> "<prompt>"   ->  tools/music/<name>.mp3 (+ the raw response, key scrubbed)
// Uses the prepaid key ("Gemini api2.txt") and logs the spend in C:\Mikes Stuff\gemini-tools\ledger.json. Never prints the key.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));
const out = path.join(dir, 'music'); fs.mkdirSync(out, { recursive: true });
const key = fs.readFileSync('C:/Mikes Stuff/Gemini api2.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => /^AQ\./.test(s));
const LEDGER = 'C:/Mikes Stuff/gemini-tools/ledger.json', MODEL = 'lyria-3-clip-preview', COST = 0.04;
const [name, prompt] = process.argv.slice(2);
if (!name || !prompt) throw new Error('usage: node genclip.mjs <name> "<prompt>"');
const tag = `${name}-${MODEL}-${Date.now()}`;
fs.writeFileSync(path.join(out, tag + '.prompt.txt'), prompt);
const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO', 'TEXT'] } };
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const raw = await r.text();
fs.writeFileSync(path.join(out, tag + '.raw.json'), raw.split(key).join('[key]'));
console.log('status', r.status, 'bytes', raw.length);
let j; try { j = JSON.parse(raw); } catch { console.log(raw.slice(0, 300).split(key).join('[key]')); process.exit(1); }
if (j.error) { console.log('ERR', j.error.code, j.error.status, String(j.error.message).slice(0, 300)); process.exit(1); }
// log the spend (Lyria bills per clip, not per token)
try {
  const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  l.entries.push({ t: new Date().toISOString(), model: MODEL, inTok: 0, outTok: 0, costUsd: COST, note: 'clip: ' + name });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
} catch (e) { console.log('ledger not updated:', e.message); }
let n = 0;
for (const c of j.candidates || []) for (const p of c.content?.parts || []) {
  if (p.inlineData) { const ext = /mpeg|mp3/.test(p.inlineData.mimeType) ? 'mp3' : /wav/.test(p.inlineData.mimeType) ? 'wav' : 'bin'; const f = path.join(out, `${name}.${ext}`); fs.writeFileSync(f, Buffer.from(p.inlineData.data, 'base64')); console.log('saved', f, p.inlineData.mimeType, fs.statSync(f).size); n++; }
}
if (!n) console.log('no audio in response');
