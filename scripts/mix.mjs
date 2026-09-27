// Mixes narration, piano score, ambience and SFX to out/mix.m4a using the film's timeline,
// then muxes with out/video.mp4 into out/the-long-string.mp4 if the video exists.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const A = f => path.join(ROOT, 'assets', f);
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

// Pull the TIMELINE object literal out of the page.
const html = fs.readFileSync(path.join(ROOT, 'film/index.html'), 'utf8');
const TL = new Function(`${html.match(/const TIMELINE = (\{[\s\S]*?\n\});/)[0]}; return TIMELINE;`)();
const D = TL.duration;

const WORDLESS = process.argv.includes('--wordless');
const inputs = [], filters = [], voiceLabels = [], fxLabels = [];
const add = f => (inputs.push('-i', f), inputs.length / 2 - 1);

// Narration: warm it slightly, a touch of room, place on the timeline.
if (!WORDLESS) TL.voice.forEach(([name, at], k) => {
  const i = add(A(`${name}.wav`));
  filters.push(`[${i}]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=70,equalizer=f=220:t=q:w=1:g=2,` +
    `aecho=0.8:0.5:38|61:0.12|0.07,adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)}[v${k}]`);
  voiceLabels.push(`[v${k}]`);
});
if (!WORDLESS) filters.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0,volume=1.35,apad=whole_dur=${D},asplit=2[voice][vkey]`);

// Piano score, ducked under the voice.
const m = add(A('music_b.mp3'));
filters.push(`[${m}]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${D},afade=t=in:d=1.5,afade=t=out:st=${D - 3.5}:d=3.5,volume=${WORDLESS ? 0.9 : 0.62}[mus]`);
filters.push(WORDLESS ? '[mus]anull[musd]' : '[mus][vkey]sidechaincompress=threshold=0.05:ratio=3:attack=60:release=700:makeup=1[musd]');

// Hilltop wind ambience, looped, quieter during the indoor memories.
const w = add(A('sfx_wind.mp3'));
filters.push(`[${w}]aformat=sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=${48000 * 20},atrim=0:${D},` +
  `volume='if(between(t,27.8,37.6)+between(t,44.8,55),0.05,0.2)':eval=frame,afade=t=in:d=2,afade=t=out:st=${D - 3}:d=3[wind]`);
fxLabels.push('[wind]');

TL.sfx.forEach(([name, at, vol], k) => {
  const i = add(A(`${name}.mp3`));
  filters.push(`[${i}]aformat=sample_rates=48000:channel_layouts=stereo,volume=${vol},afade=t=out:st=3:d=2,adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)}[s${k}]`);
  fxLabels.push(`[s${k}]`);
});

filters.push(`${WORDLESS ? '' : '[voice]'}[musd]${fxLabels.join('')}amix=inputs=${(WORDLESS ? 1 : 2) + fxLabels.length}:normalize=0,atrim=0:${D},` +
  `alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

const mix = path.join(OUT, WORDLESS ? 'mix-wordless.m4a' : 'mix.m4a');
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', mix], { stdio: 'inherit' });
console.log('mix done');

const final = WORDLESS ? 'the-long-string-wordless.mp4' : 'the-long-string.mp4';
const video = [WORDLESS ? 'video-wordless.mp4' : 'video-narrated.mp4', WORDLESS ? '' : 'video.mp4'].filter(Boolean).map(f => path.join(OUT, f)).find(f => fs.existsSync(f));
if (video) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest',
    path.join(OUT, final)], { stdio: 'inherit' });
  console.log('final: out/' + final);
}

