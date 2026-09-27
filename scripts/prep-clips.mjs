// Extract each clip in assets/clips to film3/clips/<name>/ as 1080p JPEG frames + info.json,
// and build a QA contact sheet (first, 1/3, 2/3, last frame) at out/qa/<name>.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'assets/clips'), DST = path.join(ROOT, 'film3/clips'), QA = path.join(ROOT, 'out/qa');
fs.mkdirSync(QA, { recursive: true });

const only = process.argv.slice(2);
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.mp4'))) {
  const name = f.replace('.mp4', ''), dir = path.join(DST, name), src = path.join(SRC, f);
  if (only.length && !only.includes(name)) continue;
  if (fs.existsSync(path.join(dir, 'info.json')) && !only.length) continue;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=-2:1080:flags=lanczos', '-q:v', '2', path.join(dir, 'f%04d.jpg')]);
  const frames = fs.readdirSync(dir).filter(x => x.endsWith('.jpg')).length;
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString().trim();
  const fps = Math.round(frames / dur);
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ frames, fps }));
  const pick = [0, Math.floor(frames / 3), Math.floor(2 * frames / 3), frames - 1];
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...pick.flatMap(i => ['-i', path.join(dir, `f${String(i + 1).padStart(4, '0')}.jpg`)]),
    '-filter_complex', pick.map((_, i) => `[${i}]scale=640:-1[s${i}]`).join(';') + ';' + pick.map((_, i) => `[s${i}]`).join('') + 'hstack=inputs=4',
    path.join(QA, `${name}.jpg`)]);
  console.log(name, frames, 'frames @', fps);
}

