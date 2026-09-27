// Provider dispatch + live model catalog with prices, so the UI can show choices and estimates.
import * as venice from './venice.mjs';
import * as xai from './xai.mjs';
import * as mock from './mock.mjs';
import { hasKey } from '../lib/core.mjs';

const P = { venice, xai };
const pick = (settings, provider) => (settings.mock ? mock : P[provider]);

// Observed xAI video cost (720p): $0.85 per 6s for 1.5; base model assumed proportionally cheaper.
const VIDEO_PER_SEC = { 'grok-imagine-video-1.5': 0.142, 'grok-imagine-video': 0.09 };
const WRITER_CALL_USD = 0.05;

let cache = null, cachedAt = 0;

export async function catalog() {
  if (cache && Date.now() - cachedAt < 10 * 60 * 1000) return cache;
  const c = { keys: { venice: hasKey('VENICE_API_KEY'), xai: hasKey('XAI_API_KEY') },
    writer: { venice: [], xai: [] }, image: { venice: [], xai: [] }, imageEdit: { venice: [], xai: [] },
    video: { xai: [] }, music: { venice: [] }, sfx: { venice: [] }, errors: [] };
  const tasks = [];
  if (c.keys.venice) {
    tasks.push(venice.models('text').then(ms => { c.writer.venice = ms.map(m => ({ id: m.id, name: m.model_spec?.name || m.id })); }));
    tasks.push(venice.models('image').then(ms => {
      c.image.venice = ms.filter(m => !/bg-remover|lustify|uncensored/.test(m.id)).map(m => ({ id: m.id, name: m.model_spec?.name || m.id,
        price: m.model_spec?.pricing?.resolutions || { '1K': m.model_spec?.pricing?.generation }, resolutions: m.model_spec?.constraints?.resolutions || [] }));
    }));
    tasks.push(venice.models('inpaint').then(ms => {
      c.imageEdit.venice = ms.filter(m => !/uncensored/.test(m.id)).map(m => ({ id: m.id, name: m.model_spec?.name || m.id,
        price: m.model_spec?.pricing?.resolutions || { '1K': m.model_spec?.pricing?.inpaint } }));
    }));
    tasks.push(venice.models('music').then(ms => {
      for (const m of ms) {
        const e = { id: m.id, name: m.model_spec?.name || m.id, price: m.model_spec?.pricing };
        (m.model_spec?.pricing?.per_second ? c.sfx.venice : c.music.venice).push(e);
      }
    }));
  }
  if (c.keys.xai) {
    tasks.push(xai.listModels().then(ms => {
      c.writer.xai = ms.filter(m => /^grok-4/.test(m.id) && !/multi-agent/.test(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0)).map(m => ({ id: m.id, name: m.id }));
    }));
    tasks.push(xai.listImageModels().then(ms => {
      c.image.xai = c.imageEdit.xai = ms.map(m => ({ id: m.id, name: m.id, price: { '1K': { usd: (m.image_price || 0) / 1e10 } } }));
    }));
    tasks.push(xai.listVideoModels().then(ms => { c.video.xai = ms.map(m => ({ id: m.id, name: m.id, perSecond: VIDEO_PER_SEC[m.id] ?? 0.15 })); }));
  }
  const res = await Promise.allSettled(tasks);
  for (const r of res) if (r.status === 'rejected') c.errors.push(r.reason.message);
  cache = c; cachedAt = Date.now();
  return c;
}

// ---- estimates (USD) ----
function priceFrom(list, id, res) {
  const m = list.find(x => x.id === id);
  const p = m?.price || {};
  return p[res]?.usd ?? p['1K']?.usd ?? Object.values(p)[0]?.usd ?? 0.1;
}
export async function estimate(settings, kind, n = 1, seconds = 6) {
  if (settings.mock) return 0;
  const c = await catalog();
  switch (kind) {
    case 'writer': return WRITER_CALL_USD * n;
    case 'image': return n * priceFrom(c.image[settings.image.provider] || [], settings.image.model, settings.image.res);
    case 'edit': return n * priceFrom(c.imageEdit[settings.image.provider] || [], settings.image.editModel, settings.image.res);
    case 'sketch': return n * priceFrom(c.image[settings.sketch.provider] || [], settings.sketch.model, '1K');
    case 'video': return n * seconds * (VIDEO_PER_SEC[settings.video.model] ?? 0.15);
    case 'music': return n * (c.music.venice.find(m => m.id === settings.audio.musicModel)?.price?.generation?.usd ?? 0.1);
    case 'sfx': return n * seconds * (c.sfx.venice.find(m => m.id === settings.audio.sfxModel)?.price?.per_second?.usd ?? 0.003);
  }
  return 0;
}

// ---- calls ----
export const chat = (settings, messages, json = true) => pick(settings, settings.writer.provider).chat({ model: settings.writer.model, messages, json });

export function generateImage(settings, prompt, { aspect = settings.aspect } = {}) {
  const s = settings.image;
  return pick(settings, s.provider).generateImage({ model: s.model, prompt, aspect, res: s.res });
}
// Storyboard sketches: cheapest text-to-image at 1K.
export function sketchImage(settings, prompt) {
  const s = settings.sketch;
  return pick(settings, s.provider).generateImage({ model: s.model, prompt, aspect: settings.aspect, res: '1K' });
}
export function editImage(settings, prompt, refs, { aspect = settings.aspect } = {}) {
  const s = settings.image;
  return pick(settings, s.provider).editImage({ model: s.editModel, prompt, refs, aspect, res: s.res });
}
export function video(settings, { prompt, image, seconds }) {
  const s = settings.video;
  return pick(settings, s.provider).video({ model: s.model, prompt, image, seconds, res: s.res, aspect: settings.aspect });
}
export function audio(settings, { kind, prompt, duration, loop }) {
  const model = kind === 'music' ? settings.audio.musicModel : settings.audio.sfxModel;
  return pick(settings, 'venice').audio({ model, prompt, duration, loop });
}
