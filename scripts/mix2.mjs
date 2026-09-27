// Wordless mix for film2: score + ambience beds + spot SFX, then mux with the rendered video.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const A = f => path.join(ROOT, 'assets', f + '.mp3');
const OUT = path.join(ROOT, 'out');

const html = fs.readFileSync(path.join(ROOT, 'film2/index.html'), 'utf8');
const TL = new Function(`${html.match(/const TIMELINE = (\{[\s\S]*?\n\});/)[0]}; return TIMELINE;`)();
const D = TL.duration;
const ms = s => Math.round(s * 1000);

const inputs = [], filters = [], labels = [];
const add = f => (inputs.push('-i', f), inputs.length / 2 - 1);
const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';

const m = add(A(TL.music));
filters.push(`[${m}]${fmt},atrim=0:${D},afade=t=in:d=1.0,afade=t=out:st=${D - 4}:d=4,volume=0.9[mus]`);
labels.push('[mus]');

TL.amb.forEach(([name, from, to, vol], k) => {
  const i = add(A(name)), len = to - from;
  filters.push(`[${i}]${fmt},aloop=loop=-1:size=${48000 * 22},atrim=0:${len},volume=${vol},` +
    `afade=t=in:d=${Math.min(1.5, len / 3)},afade=t=out:st=${len - Math.min(1.5, len / 3)}:d=${Math.min(1.5, len / 3)},adelay=${ms(from)}|${ms(from)}[a${k}]`);
  labels.push(`[a${k}]`);
});

TL.sfx.forEach(([name, at, vol], k) => {
  const i = add(A(name));
  filters.push(`[${i}]${fmt},volume=${vol},adelay=${ms(at)}|${ms(at)}[s${k}]`);
  labels.push(`[s${k}]`);
});

filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${D},atrim=0:${D},` +
  `alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

const mix = path.join(OUT, 'v2-mix.m4a');
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', mix], { stdio: 'inherit' });
console.log('mix done');

const video = path.join(OUT, 'video-film2-wordless.mp4');
if (fs.existsSync(video)) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest',
    path.join(OUT, 'the-long-string-v2.mp4')], { stdio: 'inherit' });
  console.log('final: out/the-long-string-v2.mp4');
}
