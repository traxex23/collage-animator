// Venice API: text, images (generate + multi-edit), music/SFX (async queue).
import fs from 'node:fs';
import { env, sleep, fileToDataUrl, ffmpeg } from '../lib/core.mjs';

const BASE = 'https://api.venice.ai/api/v1';
const headers = () => ({ Authorization: `Bearer ${env.VENICE_API_KEY}`, 'Content-Type': 'application/json' });

async function call(path, body, { raw = false } = {}) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Venice ${path} HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return raw ? r : r.json();
}

export async function models(type) {
  return (await call(`/models?type=${type}`)).data;
}

export async function chat({ model, messages, json }) {
  const body = { model, messages, temperature: 0.8, ...(json ? { response_format: { type: 'json_object' } } : {}) };
  let j;
  try { j = await call('/chat/completions', body); }
  catch (e) { if (!json) throw e; delete body.response_format; j = await call('/chat/completions', body); }
  return { text: j.choices[0].message.content, usage: j.usage };
}

export async function generateImage({ model, prompt, aspect, res }) {
  const j = await call('/image/generate', { model, prompt, aspect_ratio: aspect, resolution: res, format: 'png', safe_mode: false });
  return { buf: Buffer.from(j.images[0], 'base64') };
}

// Full-size PNG references (~8 MB each) overflow Venice's request limit when 3 are sent,
// so a 1536px JPEG copy is cached next to each reference and sent instead.
async function compact(file) {
  const out = file.replace(/\.\w+$/, '.ref.jpg');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(file).mtimeMs) {
    await ffmpeg(['-i', file, '-vf', "scale='min(1536,iw)':-2", '-q:v', '3', out]);
  }
  return out;
}

export async function editImage({ model, prompt, refs, aspect, res }) {
  const images = await Promise.all(refs.slice(0, 3).map(async f => fileToDataUrl(await compact(f), 'image/jpeg')));
  const r = await call('/image/multi-edit', { modelId: model, prompt, images, aspect_ratio: aspect, resolution: res, output_format: 'png', safe_mode: false }, { raw: true });
  return { buf: Buffer.from(await r.arrayBuffer()) };
}

// Music and sound effects share the async audio queue.
export async function audio({ model, prompt, duration, loop }) {
  const q = await call('/audio/queue', { model, prompt, ...(duration ? { duration_seconds: duration } : {}), ...(loop ? { loop: true } : {}) });
  for (let i = 0; i < 180; i++) {
    await sleep(5000);
    const r = await fetch(`${BASE}/audio/retrieve`, { method: 'POST', headers: headers(), body: JSON.stringify({ model, queue_id: q.queue_id }) });
    if (!r.ok) throw new Error(`Venice audio retrieve HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const type = r.headers.get('content-type') || '';
    let buf;
    if (type.startsWith('audio/')) buf = Buffer.from(await r.arrayBuffer());
    else {
      const j = await r.json();
      if (j.status === 'FAILED') throw new Error(`Venice audio failed: ${JSON.stringify(j).slice(0, 300)}`);
      const url = j.audio_url || j.url || j.audio?.url, b64 = typeof j.audio === 'string' ? j.audio : j.audio?.data;
      if (url) buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      else if (b64 && b64.length > 1000) buf = Buffer.from(b64, 'base64');
    }
    if (buf) {
      await call('/audio/complete', { model, queue_id: q.queue_id }).catch(() => {});
      return { buf };
    }
  }
  throw new Error('Venice audio timed out');
}

export const saveTo = (file, buf) => fs.writeFileSync(file, buf);
