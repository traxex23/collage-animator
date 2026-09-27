// Character sheets, storyboard sketches, per-shot stills, and image-to-video clips (+ frame extraction and QA sheets).
import fs from 'node:fs';
import { ffmpeg, probeDuration } from '../lib/core.mjs';
import { dir } from '../lib/projects.mjs';
import { charge, settle, refund } from '../lib/costs.mjs';
import * as providers from '../providers/index.mjs';
import { STYLES } from './story.mjs';
import { compileStill, compileMotion, compileSketch, hash } from './prompts.mjs';

export const styleOf = p => (STYLES.find(s => s.id === p.settings.style) || STYLES[0]).style;
export const variants = p => Object.fromEntries((p.story?.characters || []).flatMap(c => c.variants.map(v => [v.id, { ...v, name: c.name, kind: c.kind || 'character' }])));

export const castFile = (p, vid) => dir(p.slug, 'cast', `${vid}.png`);
export const sketchFile = (p, sid) => dir(p.slug, 'sketches', `${sid}.png`);
export const stillFile = (p, sid) => dir(p.slug, 'stills', `${sid}.png`);
export const clipFile = (p, sid) => dir(p.slug, 'clips', `${sid}.mp4`);
export const clipSeconds = shot => Math.min(10, Math.max(5, Math.ceil(shot.seconds + 1.5)));

// The exact prompts for a shot, as the UI previews them and the models receive them.
export function promptsFor(p, shot) {
  const vs = variants(p), withRefs = shot.cast.some(id => fs.existsSync(castFile(p, id)));
  return {
    still: compileStill(shot, { variants: vs, style: styleOf(p), withRefs, palette: p.story?.palette }),
    motion: compileMotion(shot),
    sketch: compileSketch(shot, { variants: vs }),
  };
}

// A sketch/still is "stale" when its shot's template changed after it was made.
const hashFile = f => f.replace(/\.\w+$/, '.hash');
const markMade = (file, prompt) => fs.writeFileSync(hashFile(file), hash(prompt));
export function isStale(file, prompt) {
  if (!fs.existsSync(file)) return false;
  const h = hashFile(file);
  return fs.existsSync(h) && fs.readFileSync(h, 'utf8') !== hash(prompt);
}

// Keep the previous version so a regenerate can be undone.
function backup(file) { if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/(\.\w+)$/, '.prev$1')); }

async function paid(p, provider, what, usd, fn) {
  const id = charge(p.slug, provider, what, usd);
  try {
    const r = await fn();
    if (r?.usd != null) settle(p.slug, id, r.usd);
    return r;
  } catch (e) { refund(p.slug, id); throw e; }
}

// ---------- cast ----------
export async function castSheet(p, vid) {
  const v = variants(p)[vid];
  const prompt = {
    character: `Character reference sheet on plain cream paper: ${v.name}, ${v.look} Show this one character three times side by side: ` +
      'front view, three-quarter view, and side view, full body, evenly spaced, neutral pose. Only this one character.',
    place: `Location design painting for an animated film: ${v.name}. ${v.look} An empty establishing view with no people, showing the ` +
      'whole space clearly, its layout, furniture, materials and light sources, as the reference for every shot set here.',
    prop: `Prop design sheet on plain cream paper: ${v.name}. ${v.look} Show this one object three times: front, three-quarter and top view, ` +
      'evenly spaced, clear details. Only this object.',
  }[v.kind] + `\n\n${styleOf(p)}`;
  const est = await providers.estimate(p.settings, 'image');
  const r = await paid(p, p.settings.image.provider, `cast ${vid}`, est, () => providers.generateImage(p.settings, prompt, { aspect: '16:9' }));
  backup(castFile(p, vid));
  fs.writeFileSync(castFile(p, vid), r.buf);
}

// ---------- storyboard sketches (cheap, plan mode) ----------
export async function sketch(p, shot) {
  const prompt = promptsFor(p, shot).sketch;
  const est = await providers.estimate(p.settings, 'sketch');
  const r = await paid(p, p.settings.sketch.provider, `sketch ${shot.id}`, est, () => providers.sketchImage(p.settings, prompt));
  fs.writeFileSync(sketchFile(p, shot.id), r.buf);
  markMade(sketchFile(p, shot.id), prompt);
}

// ---------- stills ----------
export async function still(p, shot) {
  const refs = shot.cast.map(id => castFile(p, id)).filter(f => fs.existsSync(f));
  const prompt = promptsFor(p, shot).still;
  const est = await providers.estimate(p.settings, refs.length ? 'edit' : 'image');
  const r = await paid(p, p.settings.image.provider, `still ${shot.id}`, est, () => refs.length
    ? providers.editImage(p.settings, prompt, refs)
    : providers.generateImage(p.settings, prompt));
  backup(stillFile(p, shot.id));
  fs.writeFileSync(stillFile(p, shot.id), r.buf);
  markMade(stillFile(p, shot.id), prompt);
}

// Targeted fix of an existing still ("the bed has two headboards").
export async function fixStill(p, shot, instruction) {
  const prompt = `${instruction}\n\nKeep everything else exactly the same: composition, characters, colors and this art style: ${styleOf(p)}`;
  const est = await providers.estimate(p.settings, 'edit');
  const r = await paid(p, p.settings.image.provider, `fix ${shot.id}`, est, () => providers.editImage(p.settings, prompt, [stillFile(p, shot.id)]));
  backup(stillFile(p, shot.id));
  fs.writeFileSync(stillFile(p, shot.id), r.buf);
}

export function undo(file) {
  const prev = file.replace(/(\.\w+)$/, '.prev$1');
  if (!fs.existsSync(prev)) return false;
  const tmp = file + '.swap';
  fs.renameSync(file, tmp); fs.renameSync(prev, file); fs.renameSync(tmp, prev);
  return true;
}

// ---------- clips ----------
export async function clip(p, shot) {
  const seconds = clipSeconds(shot);
  const est = await providers.estimate(p.settings, 'video', 1, seconds);
  const r = await paid(p, p.settings.video.provider, `clip ${shot.id} (${seconds}s)`, est, () =>
    providers.video(p.settings, { prompt: promptsFor(p, shot).motion, image: stillFile(p, shot.id), seconds }));
  backup(clipFile(p, shot.id));
  fs.writeFileSync(clipFile(p, shot.id), r.buf);
  await extractFrames(p, shot.id);
}

// Frames for the engine (clips/<id>.mp4 -> frames/<id>/f0001.jpg + info.json) and a 4-frame QA sheet.
export async function extractFrames(p, sid, { fromStill = false } = {}) {
  const out = dir(p.slug, 'frames', sid);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const vertical = p.settings.aspect === '9:16';
  const scale = vertical ? 'scale=1080:-2:flags=lanczos' : 'scale=-2:1080:flags=lanczos';
  if (fromStill) {
    await ffmpeg(['-i', stillFile(p, sid), '-vf', scale, '-q:v', '2', `${out}/f0001.jpg`]);
    fs.writeFileSync(`${out}/info.json`, JSON.stringify({ frames: 1, fps: 24, still: true }));
    return;
  }
  const src = clipFile(p, sid);
  await ffmpeg(['-i', src, '-vf', scale, '-q:v', '2', `${out}/f%04d.jpg`]);
  await qaSheet(p, sid, out);
}

// Animatic frame: the best picture a shot has so far (painting, else sketch), held for the whole shot.
export async function animaticFrames(p, sid) {
  const src = [stillFile(p, sid), sketchFile(p, sid)].find(f => fs.existsSync(f));
  if (!src) throw new Error(`Shot ${sid} has no sketch yet`);
  const out = dir(p.slug, 'frames', `anim_${sid}`);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const scale = p.settings.aspect === '9:16' ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920' : 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
  await ffmpeg(['-i', src, '-vf', scale, '-q:v', '3', `${out}/f0001.jpg`]);
  fs.writeFileSync(`${out}/info.json`, JSON.stringify({ frames: 1, fps: 24, still: true }));
}

async function qaSheet(p, sid, out) {
  const vertical = p.settings.aspect === '9:16', src = clipFile(p, sid);
  const frames = fs.readdirSync(out).filter(f => f.endsWith('.jpg')).length;
  const fps = Math.round(frames / await probeDuration(src)) || 24;   // clips report a bogus 90000 r_frame_rate
  fs.writeFileSync(`${out}/info.json`, JSON.stringify({ frames, fps }));
  const pick = [0, Math.floor(frames / 3), Math.floor((2 * frames) / 3), frames - 1];
  await ffmpeg([...pick.flatMap(i => ['-i', `${out}/f${String(i + 1).padStart(4, '0')}.jpg`]),
    '-filter_complex', pick.map((_, i) => `[${i}]scale=${vertical ? 270 : 480}:-1[s${i}]`).join(';') + ';' + pick.map((_, i) => `[s${i}]`).join('') + 'hstack=inputs=4',
    dir(p.slug, 'qa', `${sid}.jpg`)]);
}
