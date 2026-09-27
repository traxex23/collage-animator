// Project store: everything for one film lives in projects/<slug>/, state in project.json.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS, slugify } from './core.mjs';

export const STAGES = ['story', 'cast', 'stills', 'clips', 'sound', 'final'];

export const DEFAULT_SETTINGS = {
  length: 60,
  aspect: '16:9',
  style: 'watercolor-storybook',
  mock: false,
  budget: 25,
  writer: { provider: 'xai', model: '' },
  image: { provider: 'venice', model: 'nano-banana-2', editModel: 'nano-banana-2-edit', res: '2K' },
  video: { provider: 'xai', model: 'grok-imagine-video-1.5', res: '720p' },
  audio: { provider: 'venice', musicModel: 'lyria-3-pro', sfxModel: 'elevenlabs-sound-effects-v2' },
};

export const dir = (slug, ...p) => path.join(PROJECTS, slug, ...p);

export function listProjects() {
  return fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(dir(d.name, 'project.json')))
    .map(d => load(d.name))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map(p => ({ slug: p.slug, title: p.story?.title || p.theme.slice(0, 60), theme: p.theme, updatedAt: p.updatedAt,
      stage: STAGES.find(s => !p.stages[s]?.approved) || 'done', mock: p.settings.mock }));
}

export function create(theme, settings = {}) {
  let slug = slugify(theme.split(/\s+/).slice(0, 5).join(' ')), n = 2;
  while (fs.existsSync(dir(slug))) slug = `${slugify(theme.split(/\s+/).slice(0, 5).join(' '))}-${n++}`;
  for (const d of ['', 'cast', 'stills', 'clips', 'frames', 'audio', 'qa', 'out', 'render']) fs.mkdirSync(dir(slug, d), { recursive: true });
  const s = merge(structuredClone(DEFAULT_SETTINGS), settings);
  const p = {
    slug, theme, createdAt: new Date().toISOString(), settings: s,
    stages: Object.fromEntries(STAGES.map(k => [k, { status: 'idle', approved: false }])),
    story: null, cast: {}, shots: {}, sound: { recs: null, preset: null, musicPrompt: '', sfx: {}, amb: {} }, final: {},
  };
  save(p);
  return p;
}

export function load(slug) {
  const f = dir(slug, 'project.json');
  if (!fs.existsSync(f)) throw Object.assign(new Error(`No project ${slug}`), { status: 404 });
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function save(p) {
  p.updatedAt = new Date().toISOString();
  const f = dir(p.slug, 'project.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(p, null, 1));
  fs.renameSync(f + '.tmp', f);
  return p;
}

// Apply a mutation to the freshest copy on disk (jobs and requests interleave).
export function update(slug, fn) {
  const p = load(slug);
  fn(p);
  return save(p);
}

export function merge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v);
    else a[k] = v;
  }
  return a;
}

// Changing an earlier stage invalidates approval of everything after it.
export function unapproveFrom(p, stage) {
  for (const s of STAGES.slice(STAGES.indexOf(stage))) p.stages[s].approved = false;
}
