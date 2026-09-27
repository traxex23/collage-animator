// Image edit with xAI Grok Imagine. Usage: node scripts/ximage.mjs <src in film2/img> <out name> "<edit prompt>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [src, name, prompt] = process.argv.slice(2);
const MODEL = process.env.XMODEL || 'grok-imagine-image-quality';
const b64 = fs.readFileSync(path.join(ROOT, 'film2/img', src)).toString('base64');
const r = await fetch('https://api.x.ai/v1/images/edits', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: MODEL, prompt, image: { url: `data:image/jpeg;base64,${b64}`, type: 'image_url' }, response_format: 'b64_json' }),
});
const j = await r.json();
if (!r.ok) { console.log('ERR', r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
const d = j.data[0];
const buf = d.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url)).arrayBuffer());
const out = path.join(ROOT, 'assets', `${name}.png`);
fs.writeFileSync(out, buf);
console.log('saved', out, 'usage', JSON.stringify(j.usage || {}));
