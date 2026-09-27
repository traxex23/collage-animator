// Per-shot prompt template: structured fields -> the exact prompts sent to image, sketch and video models.
import crypto from 'node:crypto';

export const FRAMING = ['wide', 'medium', 'close-up', 'extreme close-up', 'over-the-shoulder'];

// light -> engine grade + wording for the image model
export const LIGHT = {
  'cool present': { grade: 'cool', words: 'PRESENT DAY: cool, quiet, grey-blue muted near-monochrome palette, soft overcast light, a lonely stillness.' },
  'warm memory': { grade: 'warm', words: 'MEMORY: warm glowing golden-hour palette, honey, apricot and rose tones, soft light bloom, tender and alive.' },
  'golden reveal': { grade: 'none', words: 'Golden sunset light, warm apricot, rose and lavender sky, a peaceful glow.' },
  'night lamplight': { grade: 'cool', words: 'Night: deep blue-grey darkness lit only by a small warm oil lamp, a pool of warm light.' },
};

export const CAMERA = {
  'static': 'Locked-off static camera.',
  'slow push-in': 'Very slow, gentle push-in toward the subject.',
  'slow pull-back': 'Very slow, gentle pull-back revealing more of the scene.',
  'slow pan left': 'Very slow, gentle pan to the left.',
  'slow pan right': 'Very slow, gentle pan to the right.',
  'tilt up': 'Very slow, gentle tilt upward toward the sky.',
};

export const RULES = 'Each character appears only once. Keep all heads, hands and key objects fully inside the frame. Correct anatomy and perspective.';
export const MOTION_GUARD = 'Keep the exact hand-painted art style, paper texture and colors of the image. Gentle, slow, subtle natural motion like a ' +
  'hand-drawn 2D animated short film. Keep faces, hands and anatomy stable and correct. No new people or objects, no morphing, no text.';

const legacyLight = grade => (grade === 'warm' ? 'warm memory' : grade === 'cool' ? 'cool present' : 'golden reveal');
const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const sentence = s => { const t = clean(s); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

// Validate a frame (from the writer or the UI); old shots with free-text prompts are migrated.
export function normalizeFrame(f, legacy = {}) {
  f = f && typeof f === 'object' ? f : {};
  return {
    framing: FRAMING.includes(f.framing) ? f.framing : 'medium',
    subject: clean(f.subject),
    action: clean(f.action || legacy.beat),
    setting: clean(f.setting),
    light: LIGHT[f.light] ? f.light : legacyLight(legacy.grade),
    camera: CAMERA[f.camera] ? f.camera : 'static',
    motion: clean(f.motion || legacy.motion_prompt || 'Gentle, subtle natural motion.'),
  };
}

export const gradeOf = shot => LIGHT[shot.frame.light].grade;

function castLines(shot, variants, withRefs) {
  return shot.cast.filter(id => variants[id]).map((id, i) => withRefs
    ? `Reference image ${i + 1} shows ${variants[id].name}: ${variants[id].look}`
    : `${variants[id].name}: ${variants[id].look}`).join('. ');
}

function scene(f) {
  return [`${f.framing[0].toUpperCase()}${f.framing.slice(1)} shot.`, sentence(f.subject), sentence(f.action), f.setting ? `Setting: ${sentence(f.setting)}` : '']
    .filter(Boolean).join(' ');
}

export function compileStill(shot, { variants, style, withRefs }) {
  const f = shot.frame, cast = castLines(shot, variants, withRefs);
  return [
    cast && withRefs ? `Use the reference images ONLY for the characters' exact appearance and clothing; draw a brand-new scene. ${cast}.` : cast ? `Characters: ${cast}.` : '',
    shot.override?.still?.trim() || scene(f),
    RULES, LIGHT[f.light].words, style,
  ].filter(Boolean).join('\n\n');
}

export function compileMotion(shot) {
  const f = shot.frame;
  return `${shot.override?.motion?.trim() || sentence(f.motion)} ${CAMERA[f.camera]}\n\n${MOTION_GUARD}`;
}

export function compileSketch(shot, { variants }) {
  const cast = castLines(shot, variants, false);
  // Style words in an override ("watercolor", "palette"...) would win over "no color", so they're stripped for sketches.
  const body = (shot.override?.still?.trim() || scene(shot.frame))
    .replace(/[^.]*\b(watercolou?r|palette|painted|painting|paint|colou?rs?|hues?|tones?|saturat\w*|paper texture)\b[^.]*\.?/gi, '').trim();
  return ['BLACK-AND-WHITE STORYBOARD SKETCH. A rough, quick graphite pencil storyboard frame for an animated short film: loose confident lines, ' +
    'simple grey pencil shading, plain white paper.', body || scene(shot.frame), cast ? `Characters: ${cast}.` : '', RULES,
    'Monochrome graphite pencil only: absolutely no color, no watercolor, no paint, no text, no captions, no frame border.'].filter(Boolean).join('\n\n');
}

export const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
