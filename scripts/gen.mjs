// Venice asset helpers: images, edits, bg removal, speech, music. Logs estimated spend to assets/spend.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, VENICE, venice } from './env.mjs';

export const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));
fs.mkdirSync(ASSETS, { recursive: true });

const SPEND = path.join(ASSETS, 'spend.json');
export const BUDGET = 15;

export function spent() {
  return fs.existsSync(SPEND) ? JSON.parse(fs.readFileSync(SPEND, 'utf8')) : { total: 0, items: [] };
}
function charge(what, usd) {
  const s = spent();
  if (s.total + usd > BUDGET) throw new Error(`Budget cap: $${s.total.toFixed(2)} spent, ${what} would exceed $${BUDGET}`);
  s.total = +(s.total + usd).toFixed(4);
  s.items.push({ what, usd, at: new Date().toISOString() });
  fs.writeFileSync(SPEND, JSON.stringify(s, null, 1));
}

export const STYLE =
  'Hand-painted storybook illustration in the style of a vintage European picture book: soft faded watercolor washes, ' +
  'delicate graphite pencil linework visible under the paint, grainy textured cold-press paper, muted desaturated palette of ' +
  'sepia, dusty teal, pale ochre and faint rose, gentle melancholic nostalgic mood, lots of quiet negative space, ' +
  'hand-drawn imperfection. No text, no letters, no words, no watermark, no border.';

const RES_PRICE = { '1K': 0.18, '2K': 0.23, '4K': 0.35 };

export async function image(name, prompt, { aspect = '16:9', res = '2K', model = 'nano-banana-pro' } = {}) {
  const out = path.join(ASSETS, name);
  if (fs.existsSync(out)) return out;
  charge(`image ${name}`, RES_PRICE[res]);
  const j = await venice('/image/generate', {
    model, prompt: `${prompt}\n\n${STYLE}`, aspect_ratio: aspect, resolution: res, format: 'png', safe_mode: false,
  });
  fs.writeFileSync(out, Buffer.from(j.images[0], 'base64'));
  return out;
}

// Generate a new image guided by reference images (character consistency).
export async function edit(name, prompt, refs, { aspect = '16:9', res = '2K', model = 'nano-banana-pro-edit' } = {}) {
  const out = path.join(ASSETS, name);
  if (fs.existsSync(out)) return out;
  charge(`edit ${name}`, RES_PRICE[res]);
  const images = refs.map(r => 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, r)).toString('base64'));
  const { buf } = await venice('/image/multi-edit', {
    modelId: model, prompt: `${prompt}\n\n${STYLE}`, images, aspect_ratio: aspect, resolution: res, output_format: 'png', safe_mode: false,
  }, { raw: true });
  fs.writeFileSync(out, buf);
  return out;
}

export async function cutout(name, src) {
  const out = path.join(ASSETS, name);
  if (fs.existsSync(out)) return out;
  charge(`bg-remove ${name}`, 0.03);
  const { buf } = await venice('/image/background-remove', {
    image: fs.readFileSync(path.join(ASSETS, src)).toString('base64'),
  }, { raw: true });
  fs.writeFileSync(out, buf);
  return out;
}

export async function speech(name, input, { voice = 'Sulafat', model = 'tts-gemini-3-1-flash', speed = 1 } = {}) {
  const out = path.join(ASSETS, name);
  if (fs.existsSync(out)) return out;
  charge(`tts ${name}`, Math.max(0.01, (input.length / 1e6) * 187.5));
  const { buf } = await venice('/audio/speech', { model, input, voice, response_format: 'wav', speed }, { raw: true });
  fs.writeFileSync(out, buf);
  return out;
}

// Music / sound effects via the async audio queue.
export async function audio(name, prompt, { model = 'lyria-3-pro', duration, cost = 0.1, extra = {} } = {}) {
  const out = path.join(ASSETS, name);
  if (fs.existsSync(out)) return out;
  charge(`audio ${name}`, cost);
  const q = await venice('/audio/queue', { model, prompt, ...(duration ? { duration_seconds: duration } : {}), ...extra });
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const r = await fetch(`${VENICE}/audio/retrieve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.VENICE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, queue_id: q.queue_id }),
    });
    const type = r.headers.get('content-type') || '';
    if (!r.ok) throw new Error(`retrieve HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (type.startsWith('audio/')) {
      fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      break;
    }
    const j = await r.json();
    if (j.status === 'FAILED') throw new Error(`audio failed: ${JSON.stringify(j).slice(0, 300)}`);
    const url = j.audio_url || j.url || j.audio?.url;
    const b64 = j.audio || j.data || j.audio?.data;
    if (url) { fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer())); break; }
    if (typeof b64 === 'string' && b64.length > 1000) { fs.writeFileSync(out, Buffer.from(b64, 'base64')); break; }
    if (i % 4 === 0) console.log(`  ${name}: ${j.status || JSON.stringify(j).slice(0, 120)}`);
  }
  if (!fs.existsSync(out)) throw new Error(`audio ${name} timed out`);
  await venice('/audio/complete', { model, queue_id: q.queue_id }).catch(() => {});
  return out;
}


