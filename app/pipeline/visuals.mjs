// Character sheets, per-shot stills, and image-to-video clips (+ frame extraction and QA sheets).
import fs from 'node:fs';
import { ffmpeg, probeDuration } from '../lib/core.mjs';
import { dir } from '../lib/projects.mjs';
import { charge, settle, refund } from '../lib/costs.mjs';
import * as providers from '../providers/index.mjs';
import { STYLES } from './story.mjs';

const GRADE = {
  cool: 'PRESENT DAY: cool, quiet, grey-blue muted near-monochrome palette, soft overcast light, a lonely stillness.',
  warm: 'MEMORY: warm glowing golden-hour palette, honey, apricot and rose tones, soft light bloom, tender and alive.',
  none: '',
};
const styleOf = p => (STYLES.find(s => s.id === p.settings.style) || STYLES[0]).style;
const variants = p => Object.fromEntries((p.story?.characters || []).flatMap(c => c.variants.map(v => [v.id, { ...v, name: c.name }])));

export const castFile = (p, vid) => dir(p.slug, 'cast', `${vid}.png`);
export const stillFile = (p, sid) => dir(p.slug, 'stills', `${sid}.png`);
export const clipFile = (p, sid) => dir(p.slug, 'clips', `${sid}.mp4`);
export const clipSeconds = shot => Math.min(10, Math.max(5, Math.ceil(shot.seconds + 1.5)));

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
  const prompt = `Character reference sheet on plain cream paper: ${v.name}, ${v.look} Show this one character three times side by side: ` +
    `front view, three-quarter view, and side view, full body, evenly spaced, neutral pose. Only this one character.\n\n${styleOf(p)}`;
  const est = await providers.estimate(p.settings, 'image');
  const r = await paid(p, p.settings.image.provider, `cast ${vid}`, est, () => providers.generateImage(p.settings, prompt, { aspect: '16:9' }));
  backup(castFile(p, vid));
  fs.writeFileSync(castFile(p, vid), r.buf);
}

// ---------- stills ----------
export function stillPrompt(p, shot) {
  const vs = variants(p);
  const cast = shot.cast.map((id, i) => `Reference image ${i + 1} shows ${vs[id].name}: ${vs[id].look}`).join('. ');
  return [
    cast ? `Use the reference images ONLY for the characters' exact appearance and clothing; draw a brand-new scene. ${cast}.` : '',
    shot.still_prompt,
    'Each character appears only once. Keep all heads, hands and key objects fully inside the frame. Correct anatomy and perspective.',
    GRADE[shot.grade], styleOf(p),
  ].filter(Boolean).join('\n\n');
}

export async function still(p, shot) {
  const refs = shot.cast.map(id => castFile(p, id)).filter(f => fs.existsSync(f));
  const kind = refs.length ? 'edit' : 'image';
  const est = await providers.estimate(p.settings, kind);
  const r = await paid(p, p.settings.image.provider, `still ${shot.id}`, est, () => refs.length
    ? providers.editImage(p.settings, stillPrompt(p, shot), refs)
    : providers.generateImage(p.settings, stillPrompt(p, shot)));
  backup(stillFile(p, shot.id));
  fs.writeFileSync(stillFile(p, shot.id), r.buf);
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
const MOTION_GUARD = 'Keep the exact hand-painted art style, paper texture and colors of the image. Gentle, slow, subtle natural motion like a ' +
  'hand-drawn 2D animated short film. Locked-off camera or a very slow push-in. Keep faces, hands and anatomy stable and correct. ' +
  'No new people or objects, no morphing, no text.';

export async function clip(p, shot) {
  const seconds = clipSeconds(shot);
  const est = await providers.estimate(p.settings, 'video', 1, seconds);
  const r = await paid(p, p.settings.video.provider, `clip ${shot.id} (${seconds}s)`, est, () =>
    providers.video(p.settings, { prompt: `${shot.motion_prompt}\n\n${MOTION_GUARD}`, image: stillFile(p, shot.id), seconds }));
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
  const frames = fs.readdirSync(out).filter(f => f.endsWith('.jpg')).length;
  const fps = Math.round(frames / await probeDuration(src)) || 24;   // clips report a bogus 90000 r_frame_rate
  fs.writeFileSync(`${out}/info.json`, JSON.stringify({ frames, fps }));
  const pick = [0, Math.floor(frames / 3), Math.floor((2 * frames) / 3), frames - 1];
  await ffmpeg([...pick.flatMap(i => ['-i', `${out}/f${String(i + 1).padStart(4, '0')}.jpg`]),
    '-filter_complex', pick.map((_, i) => `[${i}]scale=${vertical ? 270 : 480}:-1[s${i}]`).join(';') + ';' + pick.map((_, i) => `[s${i}]`).join('') + 'hstack=inputs=4',
    dir(p.slug, 'qa', `${sid}.jpg`)]);
}
