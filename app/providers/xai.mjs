// xAI API: Grok text, Grok Imagine images (generate + edit) and image-to-video.
// Costs come back as usage.cost_in_usd_ticks (1 tick = 1e-10 USD).
import { env, sleep, fileToDataUrl, mimeOf } from '../lib/core.mjs';

const BASE = 'https://api.x.ai/v1';
const headers = () => ({ Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' });
const usd = usage => usage?.cost_in_usd_ticks != null ? usage.cost_in_usd_ticks / 1e10 : null;

async function call(path, body) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`xAI ${path} HTTP ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export const listModels = () => call('/models').then(j => j.data);
export const listImageModels = () => call('/image-generation-models').then(j => j.models);
export const listVideoModels = () => call('/video-generation-models').then(j => j.models);

export async function chat({ model, messages, json }) {
  const body = { model, messages, temperature: 0.8, ...(json ? { response_format: { type: 'json_object' } } : {}) };
  let j;
  try { j = await call('/chat/completions', body); }
  catch (e) { if (!json) throw e; delete body.response_format; j = await call('/chat/completions', body); }
  return { text: j.choices[0].message.content, usage: j.usage, usd: usd(j.usage) };
}

async function imageResult(j) {
  const d = j.data[0];
  const buf = d.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url)).arrayBuffer());
  return { buf, usd: usd(j.usage) };
}

export async function generateImage({ model, prompt, aspect }) {
  return imageResult(await call('/images/generations', { model, prompt, n: 1, response_format: 'b64_json', ...(aspect ? { aspect_ratio: aspect } : {}) }));
}

// Grok image edit takes a single source image; the first reference is used.
export async function editImage({ model, prompt, refs }) {
  const src = refs[0];
  return imageResult(await call('/images/edits', { model, prompt, response_format: 'b64_json', image: { url: fileToDataUrl(src, mimeOf(src)), type: 'image_url' } }));
}

export async function video({ model, prompt, image, seconds, res = '720p', aspect = '16:9' }) {
  const j = await call('/videos/generations', {
    model, prompt, image: { url: fileToDataUrl(image, mimeOf(image)) }, duration: seconds, resolution: res, aspect_ratio: aspect,
  });
  const id = j.request_id || j.id;
  for (let i = 0; i < 180; i++) {
    await sleep(5000);
    const p = await call(`/videos/${id}`);
    if (p.status === 'done' || p.video?.url) {
      return { buf: Buffer.from(await (await fetch(p.video.url)).arrayBuffer()), usd: usd(p.usage) };
    }
    if (['failed', 'expired'].includes(p.status)) throw new Error(`xAI video ${p.status}: ${JSON.stringify(p).slice(0, 300)}`);
  }
  throw new Error('xAI video timed out');
}
