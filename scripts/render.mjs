// Renders film/index.html frame-by-frame into out/video.mp4 (or stills with --stills=t1,t2,...).
// Frames are written to out/frames in chunks with a fresh browser per chunk, so a crash only
// costs one chunk and re-running resumes where it stopped.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'out');
const FILM = (process.argv.find(a => a.startsWith('--film=')) || '--film=film').slice(7);
const VARIANT = (FILM === 'film' ? '' : FILM + '-') + (process.argv.includes('--wordless') ? 'wordless' : 'narrated');
const FRAMES = path.join(OUT, 'frames-' + VARIANT);
const CHUNK = 300;
fs.mkdirSync(FRAMES, { recursive: true });

async function open() {
  const browser = await puppeteer.launch({ args: ['--allow-file-access-from-files', '--disable-web-security', '--js-flags=--max-old-space-size=4096'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('pageerror', e => console.log('[page error]', e.message));
  await page.goto((FILM === 'film3' ? 'http://localhost:5177/film3/index.html' : pathToFileURL(path.join(ROOT, FILM, 'index.html')).href) + '?render' + (VARIANT.endsWith('wordless') ? '&nosubs' : ''), { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.setupFilm());
  const grab = async t => Buffer.from(await page.evaluate(async t => {
    await window.drawFilm(t); return document.getElementById('c').toDataURL('image/jpeg', 0.95).slice(23);
  }, t), 'base64');
  return { browser, page, grab };
}

const stillsArg = process.argv.find(a => a.startsWith('--stills='));
if (process.argv.includes('--fresh')) for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));

let { browser, page, grab } = await open();
const { fps, duration, subs } = await page.evaluate(() => window.TIMELINE);

if (stillsArg) {
  for (const t of stillsArg.slice(9).split(',').map(Number)) {
    fs.writeFileSync(path.join(OUT, `still_${FILM}_${t}.jpg`), await grab(t));
    console.log('still', t);
  }
  await browser.close();
  process.exit(0);
}

// Subtitles as .srt too, for editing in CapCut etc.
const ts = s => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',');
fs.writeFileSync(path.join(OUT, VARIANT + '.srt'),
  subs.map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join('\n'));

const total = Math.round(duration * fps);
const name = f => path.join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`);
const t0 = Date.now();
for (let start = 0; start < total; start += CHUNK) {
  const end = Math.min(total, start + CHUNK);
  let f = start;
  while (f < end && fs.existsSync(name(f))) f++;
  if (f === end) continue;
  for (let attempt = 0; f < end; attempt++) {
    try {
      for (; f < end; f++) fs.writeFileSync(name(f), await grab(f / fps));
    } catch (e) {
      if (attempt > 3) throw e;
      console.log(`crash at frame ${f}, restarting browser: ${e.message}`);
    }
    await browser.close().catch(() => {});
    ({ browser, page, grab } = await open());
  }
  console.log(`frames ${end}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close().catch(() => {});

execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(FRAMES, 'f%05d.jpg'),
  '-vf', 'unsharp=5:5:0.55:5:5:0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'film',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `video-${VARIANT}.mp4`)], { stdio: 'inherit' });
console.log('video done');




