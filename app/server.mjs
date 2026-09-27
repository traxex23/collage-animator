// Collage Animator: local web app. Run `npm run app`, open http://127.0.0.1:5177
import fs from 'node:fs';
import express from 'express';
import { ROOT, PORT, BASE_URL, probeDuration } from './lib/core.mjs';
import * as store from './lib/projects.mjs';
import * as costs from './lib/costs.mjs';
import * as jobs from './lib/jobs.mjs';
import * as providers from './providers/index.mjs';
import * as story from './pipeline/story.mjs';
import * as vis from './pipeline/visuals.mjs';
import * as sound from './pipeline/sound.mjs';
import * as timeline from './pipeline/timeline.mjs';
import * as renderer from './pipeline/render.mjs';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/projects', express.static(`${ROOT}/projects`, { etag: false, maxAge: 0 }));
app.use('/engine', express.static(`${ROOT}/engine`));
app.use('/', express.static(`${ROOT}/ui`));

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || (e instanceof costs.BudgetError ? 402 : 500)).json({ error: e.message }); }
};
const exists = f => fs.existsSync(f);
const shotById = (p, id) => p.story.shots.find(s => s.id === id) || (() => { throw Object.assign(new Error(`No shot ${id}`), { status: 404 }); })();
const variantIds = p => (p.story?.characters || []).flatMap(c => c.variants.map(v => v.id));
const stamp = f => (exists(f) ? fs.statSync(f).mtimeMs : 0);

// Everything the UI needs to draw a project, including which files exist.
function view(p) {
  const shots = (p.story?.shots || []).map(s => ({
    ...s, still: stamp(vis.stillFile(p, s.id)), clip: stamp(vis.clipFile(p, s.id)),
    stillPrev: exists(vis.stillFile(p, s.id).replace('.png', '.prev.png')), clipSeconds: vis.clipSeconds(s),
  }));
  const cast = variantIds(p).map(id => ({ id, file: stamp(vis.castFile(p, id)) }));
  const sug = p.story ? sound.suggestions(p) : { sfx: [], amb: [] };
  return {
    ...p, view: {
      shots, cast, job: jobs.status(p.slug), costs: costs.summary(p.slug),
      layout: p.story ? { duration: timeline.layout(p).duration } : null,
      sound: {
        music: stamp(sound.musicFile(p)),
        sfx: sug.sfx.map(x => ({ ...x, on: p.sound.sfx[x.key] !== false, file: stamp(sound.sfxFile(p, x.key)) })),
        amb: sug.amb.map(x => ({ ...x, on: p.sound.amb[x.key] !== false, file: stamp(sound.ambFile(p, x.key)) })),
      },
      final: { share: stamp(store.dir(p.slug, 'out', 'share.mp4')), final: stamp(store.dir(p.slug, 'out', 'final.mp4')) },
    },
  };
}

// ---------- catalog / presets ----------
app.get('/api/catalog', wrap(() => providers.catalog()));
app.get('/api/presets', wrap(() => ({ music: story.MUSIC, styles: story.STYLES, defaults: store.DEFAULT_SETTINGS })));

// ---------- projects ----------
app.get('/api/projects', wrap(() => store.listProjects()));
app.post('/api/projects', wrap(req => {
  const { theme, settings } = req.body;
  if (!theme?.trim()) throw Object.assign(new Error('Please describe a theme'), { status: 400 });
  return view(store.create(theme.trim(), settings));
}));
app.get('/api/projects/:slug', wrap(req => view(store.load(req.params.slug))));
app.patch('/api/projects/:slug', wrap(req => {
  const { settings, story: st, sound: snd, shot } = req.body;
  return view(store.update(req.params.slug, p => {
    if (settings) store.merge(p.settings, settings);
    if (st) { p.story = story.normalize({ ...p.story, ...st }, p); store.unapproveFrom(p, 'story'); }
    if (shot) {   // edit one shot card
      const s = shotById(p, shot.id);
      Object.assign(s, Object.fromEntries(Object.entries(shot).filter(([k]) => ['beat', 'seconds', 'still_prompt', 'motion_prompt', 'grade', 'transition', 'cast'].includes(k))));
      p.story = story.normalize(p.story, p);
    }
    if (snd) store.merge(p.sound, snd);
  }));
}));
app.get('/api/projects/:slug/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  jobs.subscribe(req.params.slug, res);
});

app.post('/api/projects/:slug/approve/:stage', wrap(req => view(store.update(req.params.slug, p => {
  p.stages[req.params.stage].approved = req.body?.approved !== false;
}))));

// ---------- estimates ----------
app.get('/api/projects/:slug/estimate/:stage', wrap(async req => {
  const p = store.load(req.params.slug), s = p.settings, stage = req.params.stage;
  const todo = (list, file) => list.filter(x => !exists(file(x)));
  switch (stage) {
    case 'story': return { usd: await providers.estimate(s, 'writer'), note: 'one writer call' };
    case 'cast': { const n = todo(variantIds(p), id => vis.castFile(p, id)).length; return { usd: await providers.estimate(s, 'image', n), note: `${n} character sheets` }; }
    case 'stills': { const n = todo(p.story.shots, x => vis.stillFile(p, x.id)).length; return { usd: await providers.estimate(s, 'edit', n), note: `${n} stills` }; }
    case 'clips': {
      const left = todo(p.story.shots, x => vis.clipFile(p, x.id)), secs = left.reduce((a, x) => a + vis.clipSeconds(x), 0);
      return { usd: await providers.estimate(s, 'video', 1, secs), note: `${left.length} clips, ${secs}s of video` };
    }
    case 'sound': {
      const sug = sound.suggestions(p);
      const sfx = sug.sfx.filter(x => p.sound.sfx[x.key] !== false && !exists(sound.sfxFile(p, x.key))).length;
      const amb = sug.amb.filter(x => p.sound.amb[x.key] !== false && !exists(sound.ambFile(p, x.key))).length;
      const music = exists(sound.musicFile(p)) ? 0 : await providers.estimate(s, 'music');
      return { usd: music + await providers.estimate(s, 'sfx', 1, sfx * 4 + amb * 20), note: `${music ? 'score + ' : ''}${sfx} SFX + ${amb} ambience beds` };
    }
    default: return { usd: 0, note: 'rendering is local and free' };
  }
}));

// ---------- stage runners ----------
const runners = {
  async story(p, { note }, { progress }) {
    progress({ msg: note ? 'Revising the screenplayâ€¦' : 'Writing the screenplayâ€¦' });
    const est = await providers.estimate(p.settings, 'writer');
    const id = costs.charge(p.slug, p.settings.writer.provider, 'screenplay', est);
    let r;
    try { r = await story.write(p, note); } catch (e) { costs.refund(p.slug, id); throw e; }
    if (r.usd != null) costs.settle(p.slug, id, r.usd);
    store.update(p.slug, q => { q.story = r.story; q.sound.preset = q.sound.preset || r.story.music.preset; store.unapproveFrom(q, 'story'); });
  },
  async cast(p, { items, force }, { progress, item }) {
    const ids = (items || variantIds(p)).filter(id => force || !exists(vis.castFile(p, id)));
    let done = 0;
    progress({ total: ids.length, done, msg: 'Drawing character sheetsâ€¦' });
    await jobs.pool(ids, 3, async id => { await vis.castSheet(p, id); item(id); progress({ done: ++done }); });
  },
  async stills(p, { items, force }, { progress, item }) {
    const shots = p.story.shots.filter(s => (!items || items.includes(s.id)) && (force || !exists(vis.stillFile(p, s.id))));
    let done = 0;
    progress({ total: shots.length, done, msg: 'Painting stillsâ€¦' });
    await jobs.pool(shots, 4, async s => { await vis.still(p, s); item(s.id); progress({ done: ++done }); });
  },
  async fix(p, { id, instruction }, { progress, item }) {
    progress({ total: 1, done: 0, msg: `Fixing ${id}â€¦` });
    await vis.fixStill(p, shotById(p, id), instruction);
    item(id); progress({ done: 1 });
  },
  async clips(p, { items, force }, { progress, item }) {
    const shots = p.story.shots.filter(s => (!items || items.includes(s.id)) && (force || !exists(vis.clipFile(p, s.id))) && exists(vis.stillFile(p, s.id)));
    let done = 0;
    progress({ total: shots.length, done, msg: 'Animating clips (about 1-2 min each)â€¦' });
    await jobs.pool(shots, 5, async s => { await vis.clip(p, s); item(s.id); progress({ done: ++done }); });
  },
  async recommend(p, _, { progress }) {
    progress({ msg: 'Listening to your story for music ideasâ€¦' });
    const recs = await sound.recommend(p);
    store.update(p.slug, q => { q.sound.recs = recs; q.sound.preset ||= recs[0]?.preset; });
  },
  async sound(p, { items, force, music = true }, { progress, item }) {
    const sug = sound.suggestions(p);
    const sfx = sug.sfx.filter(x => p.sound.sfx[x.key] !== false && (!items || items.includes(x.key)) && (force || !exists(sound.sfxFile(p, x.key))));
    const amb = sug.amb.filter(x => p.sound.amb[x.key] !== false && (!items || items.includes(x.key)) && (force || !exists(sound.ambFile(p, x.key))));
    const doMusic = music && (!items || items.includes('music')) && (force || !exists(sound.musicFile(p)));
    let done = 0; const total = sfx.length + amb.length + (doMusic ? 1 : 0);
    progress({ total, done, msg: 'Generating score and sound effectsâ€¦' });
    const tasks = [...(doMusic ? [{ id: 'music' }] : []), ...sfx.map(x => ({ id: x.key, x, kind: 'sfx' })), ...amb.map(x => ({ id: x.key, x, kind: 'amb' }))];
    await jobs.pool(tasks, 4, async t => {
      if (t.id === 'music') {
        const secs = await sound.makeMusic(p);
        store.update(p.slug, q => { q.sound.musicSeconds = secs; });
      } else await sound.makeSfx(p, t.x, t.kind);
      item(t.id); progress({ done: ++done });
    });
  },
  async final(p, { fresh }, { progress }) {
    progress({ msg: 'Preparing framesâ€¦' });
    for (const s of p.story.shots) {   // shots without a clip fall back to their still (no motion)
      const info = store.dir(p.slug, 'frames', s.id, 'info.json');
      const hasClip = exists(vis.clipFile(p, s.id));
      if (hasClip && (!exists(info) || JSON.parse(fs.readFileSync(info, 'utf8')).still)) await vis.extractFrames(p, s.id);
      else if (!hasClip && exists(vis.stillFile(p, s.id))) await vis.extractFrames(p, s.id, { fromStill: true });
      else if (!hasClip) throw new Error(`Shot ${s.id} has no still or clip yet`);
    }
    timeline.build(p);
    const r = await renderer.render(p.slug, progress, { fresh });
    store.update(p.slug, q => { q.final = { renderedAt: new Date().toISOString(), duration: r.duration }; });
  },
};

app.post('/api/projects/:slug/run/:stage', wrap(req => {
  const p = store.load(req.params.slug), stage = req.params.stage;
  if (!runners[stage]) throw Object.assign(new Error(`Unknown stage ${stage}`), { status: 404 });
  if (stage !== 'story' && !p.story) throw Object.assign(new Error('Write the story first'), { status: 400 });
  const jobStage = { fix: 'stills', recommend: 'sound' }[stage] || stage;
  jobs.start(p.slug, jobStage, ctx => runners[stage](store.load(p.slug), req.body || {}, ctx));
  return { started: stage };
}));

app.post('/api/projects/:slug/undo', wrap(req => {
  const p = store.load(req.params.slug), { kind, id } = req.body;
  const file = kind === 'clip' ? vis.clipFile(p, id) : kind === 'cast' ? vis.castFile(p, id) : vis.stillFile(p, id);
  if (!vis.undo(file)) throw Object.assign(new Error('Nothing to undo'), { status: 400 });
  return view(p);
}));

app.get('/api/projects/:slug/costs', wrap(req => costs.ledger(req.params.slug)));

// Jobs live in memory; anything still "running" on disk was cut off by a restart and can simply be run again (work is cached).
for (const { slug } of store.listProjects()) {
  store.update(slug, p => {
    for (const st of Object.values(p.stages)) if (st.status === 'running') { st.status = 'error'; st.error = 'Interrupted by a server restart. Run it again to resume where it stopped.'; }
  });
}

app.listen(PORT, '127.0.0.1', () => console.log(`Collage Animator running at ${BASE_URL}`));
