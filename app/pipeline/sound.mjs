// Music recommendations + score generation, and per-shot SFX / ambience beds.
import fs from 'node:fs';
import { extractJson, probeDuration } from '../lib/core.mjs';
import { dir } from '../lib/projects.mjs';
import { charge, settle, refund } from '../lib/costs.mjs';
import * as providers from '../providers/index.mjs';
import { MUSIC } from './story.mjs';
import { layout } from './timeline.mjs';

export const musicFile = p => dir(p.slug, 'audio', 'music.mp3');
export const sfxFile = (p, key) => dir(p.slug, 'audio', `sfx_${key}.mp3`);
export const ambFile = (p, key) => dir(p.slug, 'audio', `amb_${key}.mp3`);

// Keyword fallback when the writer model is unavailable.
function scorePresets(text) {
  const t = text.toLowerCase();
  return MUSIC.map(m => ({ preset: m.id, score: m.moods.reduce((s, w) => s + (t.includes(w) ? 2 : 0), 0) + (m.id === 'felt-piano-melancholy' ? 1 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(x => ({ preset: x.preset, why: 'Matches the mood words in your theme.' }));
}

export async function recommend(p) {
  const st = p.story;
  const sys = `You are a film music supervisor. Given a short film, pick the 3 best music presets from the list, best first, and say why in one
sentence each (mention specific moments). Reply ONLY with JSON: {"recommendations":[{"preset":"id","why":"..."}]}\n\nPRESETS:\n` +
    MUSIC.map(m => `- ${m.id}: ${m.name}. ${m.about} Moods: ${m.moods.join(', ')}`).join('\n');
  const user = `THEME: ${p.theme}\nTITLE: ${st.title}\nLOGLINE: ${st.logline}\nBEATS:\n${st.shots.map(s => `- ${s.beat}`).join('\n')}`;
  try {
    const est = await providers.estimate(p.settings, 'writer');
    const id = charge(p.slug, p.settings.writer.provider, 'music recommendations', est);
    const r = await providers.chat(p.settings, [{ role: 'system', content: sys }, { role: 'user', content: user }]);
    if (r.usd != null) settle(p.slug, id, r.usd);
    const recs = (extractJson(r.text).recommendations || []).filter(x => MUSIC.some(m => m.id === x.preset)).slice(0, 3);
    if (recs.length) return recs;
  } catch (e) { console.warn('recommend fallback:', e.message); }
  return scorePresets(`${p.theme} ${st.logline} ${st.shots.map(s => s.beat).join(' ')}`);
}

// Describe the score's emotional shape in time, so the music turns where the story turns.
export function musicPrompt(p) {
  const { duration, scenes } = layout(p);
  const preset = MUSIC.find(m => m.id === p.sound.preset) || MUSIC[0];
  const base = p.sound.customPrompt?.trim() || preset.prompt;
  const shape = (p.story.music?.shape?.length ? p.story.music.shape : scenes.map(s => ({ from: s.at, to: s.at + s.shot.seconds, mood: s.shot.grade === 'warm' ? 'warm, nostalgic' : 'quiet, sparse' })))
    .map(x => `${Math.round(x.from)}-${Math.round(x.to)}s ${x.mood}`).join('; ');
  return `${base} Total length about ${Math.round(duration)} seconds with this exact emotional shape: ${shape}. End on a single soft note.`;
}

export async function makeMusic(p) {
  const est = await providers.estimate(p.settings, 'music');
  const id = charge(p.slug, 'venice', 'music score', est);
  try {
    const r = await providers.audio(p.settings, { kind: 'music', prompt: musicPrompt(p), duration: Math.round(layout(p).duration) });
    fs.writeFileSync(musicFile(p), r.buf);
  } catch (e) { refund(p.slug, id); throw e; }
  return probeDuration(musicFile(p));
}

// Everything the story suggests, keyed so the UI can tick them on and off.
export function suggestions(p) {
  const sfx = p.story.shots.flatMap(s => s.sfx.map((x, k) => ({ key: `${s.id}_${k}`, shot: s.id, prompt: x.prompt, offset: x.offset })));
  const amb = Object.entries(p.story.ambience || {}).map(([key, prompt]) => ({ key, prompt, shots: p.story.shots.filter(s => s.ambience === key).map(s => s.id) }))
    .filter(a => a.shots.length);
  return { sfx, amb };
}

export async function makeSfx(p, item, kind) {
  const seconds = kind === 'amb' ? 20 : 4;
  const est = await providers.estimate(p.settings, 'sfx', 1, seconds);
  const id = charge(p.slug, 'venice', `${kind} ${item.key}`, est);
  try {
    const r = await providers.audio(p.settings, { kind: 'sfx', prompt: item.prompt, duration: seconds, loop: kind === 'amb' });
    fs.writeFileSync(kind === 'amb' ? ambFile(p, item.key) : sfxFile(p, item.key), r.buf);
  } catch (e) { refund(p.slug, id); throw e; }
}
