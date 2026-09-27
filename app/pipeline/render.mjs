// Render the engine page frame-by-frame (chunked + resumable), encode, mix audio, mux, and make a share copy.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { BASE_URL, ffmpeg, probeDuration } from '../lib/core.mjs';
import { dir } from '../lib/projects.mjs';

const CHUNK = 300;

// A crashed browser can ignore close(); make sure its processes are gone so they don't eat memory.
async function closeHard(browser) {
  const proc = browser.process();
  await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
  if (proc && proc.exitCode === null) proc.kill('SIGKILL');
}

async function openPage(slug, t, kind = 'film') {
  const browser = await puppeteer.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: t.width, height: t.height });
    await page.goto(`${BASE_URL}/engine/?project=${encodeURIComponent(slug)}&render${kind === 'animatic' ? '&timeline=animatic' : ''}`, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluate(() => window.setupFilm());
    return { browser, grab: grabber(page) };
  } catch (e) { await closeHard(browser); throw e; }
}

function grabber(page) {
  return async s => Buffer.from(await page.evaluate(async s => {
    await window.drawFilm(s); return document.getElementById('c').toDataURL('image/jpeg', 0.95).slice(23);
  }, s), 'base64');
}

export async function stills(slug, times) {
  const t = JSON.parse(fs.readFileSync(dir(slug, 'timeline.json'), 'utf8'));
  const { browser, grab } = await openPage(slug, t);
  const out = [];
  for (const s of times) { const f = dir(slug, 'render', `preview_${s}.jpg`); fs.writeFileSync(f, await grab(s)); out.push(f); }
  await closeHard(browser);
  return out;
}

// kind 'animatic': sketch/painting frames at 12 fps -> out/animatic.mp4 (quick, free, for judging story and timing).
export async function render(slug, progress, { fresh = false, kind = 'film' } = {}) {
  const A = kind === 'animatic';
  const t = JSON.parse(fs.readFileSync(dir(slug, A ? 'timeline-animatic.json' : 'timeline.json'), 'utf8'));
  const frames = dir(slug, 'render', A ? 'animatic_frames' : 'frames');
  if (fresh) fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const total = Math.round(t.duration * t.fps);
  const name = f => path.join(frames, `f${String(f).padStart(5, '0')}.jpg`);
  let s = null;
  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(total, start + CHUNK);
    let f = start;
    while (f < end && fs.existsSync(name(f))) f++;
    for (let attempt = 0; f < end; attempt++) {
      try {
        s ||= await openPage(slug, t, kind);
        for (; f < end; f++) { fs.writeFileSync(name(f), await s.grab(f / t.fps)); if (f % 30 === 0) progress({ done: f, total, msg: `Rendering frame ${f}/${total}` }); } }
      catch (e) { if (attempt > 3) throw e; console.warn('render crash, restarting browser:', e.message); await new Promise(r => setTimeout(r, 2000)); }
      if (s) await closeHard(s.browser);
      s = null;   // fresh browser per chunk keeps memory flat
    }
  }
  progress({ done: total, total, msg: 'Encoding video…' });
  const video = dir(slug, 'out', A ? 'animatic-video.mp4' : 'video.mp4');
  await ffmpeg(['-framerate', String(t.fps), '-i', path.join(frames, 'f%05d.jpg'), ...(A ? [] : ['-vf', 'unsharp=5:5:0.55:5:5:0']),
    '-c:v', 'libx264', '-preset', A ? 'veryfast' : 'slow', '-crf', A ? '24' : '18', '-tune', 'film', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);

  progress({ msg: 'Mixing audio…' });
  const mix = await mixAudio(slug, t, A ? 'mix-animatic.m4a' : 'mix.m4a');
  if (A) {
    const out = dir(slug, 'out', 'animatic.mp4');
    await ffmpeg(['-i', video, ...(mix ? ['-i', mix, '-map', '0:v', '-map', '1:a', '-c:a', 'copy'] : []), '-c:v', 'copy', '-shortest', out]);
    return { final: out, duration: await probeDuration(out) };
  }
  const final = dir(slug, 'out', 'final.mp4'), share = dir(slug, 'out', 'share.mp4');
  await ffmpeg(['-i', video, ...(mix ? ['-i', mix, '-map', '0:v', '-map', '1:a', '-c:a', 'copy'] : []), '-c:v', 'copy', '-shortest', final]);
  progress({ msg: 'Making share copy…' });
  await ffmpeg(['-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-tune', 'film', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', share]);
  return { final, share, duration: await probeDuration(final) };
}

// Music + ambience beds + spot SFX, loudness-normalised (port of scripts/mix2.mjs).
export async function mixAudio(slug, t, outName = 'mix.m4a') {
  const D = t.duration, ms = s => Math.round(s * 1000), fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
  const inputs = [], filters = [], labels = [];
  const add = f => (inputs.push('-i', dir(slug, f)), inputs.length / 2 - 1);
  if (t.music) {
    const m = add(t.music);
    filters.push(`[${m}]${fmt},atrim=0:${D},afade=t=in:d=1.0,afade=t=out:st=${Math.max(0, D - 4)}:d=4,volume=0.9[mus]`); labels.push('[mus]');
  }
  t.amb.forEach(([f, from, to, vol], k) => {
    const i = add(f), len = Math.max(0.5, to - from), fd = Math.min(1.5, len / 3);
    filters.push(`[${i}]${fmt},aloop=loop=-1:size=${48000 * 22},atrim=0:${len},volume=${vol},afade=t=in:d=${fd},afade=t=out:st=${len - fd}:d=${fd},adelay=${ms(from)}|${ms(from)}[a${k}]`);
    labels.push(`[a${k}]`);
  });
  t.sfx.forEach(([f, at, vol], k) => {
    const i = add(f);
    filters.push(`[${i}]${fmt},volume=${vol},adelay=${ms(at)}|${ms(at)}[s${k}]`); labels.push(`[s${k}]`);
  });
  if (!labels.length) return null;
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${D},atrim=0:${D},alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11[out]`);
  const out = dir(slug, 'out', outName);
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', out]);
  return out;
}
