// Finds a seamless loop for a generated track, bakes a short crossfade into the file just before loopEnd
// (so jumping loopEnd -> loopStart is continuous), and writes an .ogg. Usage: node loopify.mjs <level> [outDir]
// The loop points are chosen by comparing the sound in the second before each candidate point (and the second after).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const level = +process.argv[2];
const outDir = process.argv[3] || path.join(dir, 'music');
const src = path.join(dir, 'music', `level${level}.mp3`);
const SR = 44100;
function decode(args, bytes) { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', src, ...args, '-f', 'f32le', '-'], { maxBuffer: 1 << 29 }); if (r.status) throw new Error(String(r.stderr)); return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength)); }
const stereo = decode(['-ar', String(SR), '-ac', '2']);
const frames = stereo.length / 2, dur = frames / SR;
const mono = decode(['-ar', '22050', '-ac', '1']);

// ---- features: 24 log-spaced band energies per 50 ms
const N = 2048, HOP = 1102, FSR = 22050, NB = 24;
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const edges = Array.from({ length: NB + 1 }, (_, i) => Math.round(60 * Math.pow(8000 / 60, i / NB) / (FSR / N)));
const F = []; const rms = [];
for (let s = 0; s + N <= mono.length; s += HOP) {
  const re = new Float32Array(N), im = new Float32Array(N); let e = 0;
  for (let i = 0; i < N; i++) { re[i] = mono[s + i] * hann[i]; e += mono[s + i] ** 2; }
  fft(re, im); const f = new Float32Array(NB);
  for (let b = 0; b < NB; b++) { let sum = 0; for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) sum += re[k] ** 2 + im[k] ** 2; f[b] = Math.log(1e-6 + sum); }
  F.push(f); rms.push(Math.sqrt(e / N));
}
const fps = FSR / HOP, W = Math.round(fps * 1.0);
const dist = (a, b) => { let d = 0; for (let k = 0; k < NB; k++) { const x = a[k] - b[k]; d += x * x; } return d; };
const seam = (s, e) => { let d = 0; for (let k = 1; k <= W; k++) d += dist(F[s - k], F[e - k]); for (let k = 0; k < W; k++) d += dist(F[s + k], F[e + k]); return d / (2 * W); };
// candidates: start 4-45 s in, end in the last 20 s (and at least 40 s of loop)
const sLo = Math.round(4 * fps), sHi = Math.round(45 * fps), eLo = Math.max(Math.round((dur - 22) * fps), 0), eHi = F.length - W - 1;
let best = { d: Infinity }; let sumD = 0, cnt = 0;
for (let s = sLo; s < sHi; s++) for (let e = eLo; e < eHi; e++) {
  if (e - s < 40 * fps) continue;
  const d = seam(s, e) * (1 - 0.0004 * (e - s) / fps); sumD += d; cnt++;
  if (d < best.d) best = { d, s, e };
}
const loopStart = best.s / fps + N / 2 / FSR, loopEnd = best.e / fps + N / 2 / FSR;   // frame centres
// ---- bake a crossfade into the last X seconds before loopEnd
const X = 0.35, xs = Math.round(X * SR), sS = Math.round(loopStart * SR), eS = Math.round(loopEnd * SR);
const out = new Float32Array(stereo);
for (let i = 0; i < xs; i++) {
  const a = Math.sin((i / xs) * Math.PI / 2) ** 2;                        // 0 -> 1, equal-power-ish
  for (let c = 0; c < 2; c++) { const di = (eS - xs + i) * 2 + c, si = (sS - xs + i) * 2 + c; out[di] = (1 - a) * stereo[di] + a * stereo[si]; }
}
// mild peak safety
let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
const g = peak > 0.97 ? 0.97 / peak : 1; if (g < 1) for (let i = 0; i < out.length; i++) out[i] *= g;
const tmp = path.join(dir, 'music', `level${level}.loop.f32`);
fs.writeFileSync(tmp, Buffer.from(out.buffer));
fs.mkdirSync(outDir, { recursive: true });
const oggPath = path.join(outDir, `music-lv${level}.ogg`);
const enc = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '3', oggPath]);
if (enc.status) throw new Error(String(enc.stderr));
fs.unlinkSync(tmp);
// the loud-start / fade-out check (RMS of the first and last 3 s vs the whole)
const meanRms = rms.reduce((s, v) => s + v, 0) / rms.length, seg = (a, b) => { const r = rms.slice(Math.round(a * fps), Math.round(b * fps)); return r.reduce((s, v) => s + v, 0) / r.length / meanRms; };
console.log(JSON.stringify({ level, dur: +dur.toFixed(2), loopStart: +loopStart.toFixed(4), loopEnd: +loopEnd.toFixed(4), seamDist: +best.d.toFixed(2), avgPairDist: +(sumD / cnt).toFixed(2), first3s: +seg(0, 3).toFixed(2), last3s: +seg(dur - 3, dur - 0.2).toFixed(2), bytes: fs.statSync(oggPath).size }));
