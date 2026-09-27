// Image-to-video with xAI Grok Imagine. Usage: node scripts/xvideo.mjs <image in film2/img> <out name> <seconds> "<motion prompt>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [img, name, secs = '6', motion] = process.argv.slice(2);
const MODEL = process.env.XMODEL || 'grok-imagine-video-1.5';
const outDir = path.join(ROOT, 'assets', 'clips');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${name}.mp4`);
if (fs.existsSync(out)) { console.log('exists', out); process.exit(0); }

const STYLE = 'Keep the exact hand-painted watercolor and pencil storybook art style, paper texture and colors of the image. ' +
  'Gentle, slow, subtle natural motion like a hand-drawn 2D animated short film. Locked-off camera or a very slow push-in. ' +
  'Keep faces, hands and anatomy stable and correct. No new people or objects, no morphing, no text.';

const headers = { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' };
const b64 = fs.readFileSync(path.join(ROOT, 'film2/img', img)).toString('base64');
const r = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST', headers,
  body: JSON.stringify({ model: MODEL, prompt: `${motion}\n\n${STYLE}`, image: { url: `data:image/jpeg;base64,${b64}` },
    duration: Number(secs), resolution: '720p', aspect_ratio: '16:9' }),
});
const j = await r.json();
if (!r.ok) { console.log('ERR', r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
const id = j.request_id || j.id;
console.log('queued', id);
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const p = await (await fetch(`https://api.x.ai/v1/videos/${id}`, { headers })).json();
  if (p.status === 'done' || p.video?.url) {
    fs.writeFileSync(out, Buffer.from(await (await fetch(p.video.url)).arrayBuffer()));
    console.log('saved', out, JSON.stringify({ ...p, video: { ...p.video, url: '…' } }).slice(0, 400));
    process.exit(0);
  }
  if (['failed', 'expired'].includes(p.status)) { console.log('FAILED', JSON.stringify(p).slice(0, 600)); process.exit(1); }
}
console.log('timeout');
