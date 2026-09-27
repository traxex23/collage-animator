// Collage Animator: local web app. Run `npm run app`, open http://127.0.0.1:5177
import fs from 'node:fs';
import express from 'express';
import { ROOT, PORT, BASE_URL } from './lib/core.mjs';
import * as store from './lib/projects.mjs';
import * as costs from './lib/costs.mjs';
import * as jobs from './lib/jobs.mjs';
import * as providers from './providers/index.mjs';
import * as story from './pipeline/story.mjs';
import * as prompts from './pipeline/prompts.mjs';
import * as vis from './pipeline/visuals.mjs';
import * as sound from './pipeline/sound.mjs';
import * as timeline from './pipeline/timeline.mjs';
import * as renderer from './pipeline/render.mjs';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/projects', express.static(`${ROOT}/projects`, { etag: false, maxAge: 0 }));
app.use('/engine', express.static(`${ROOT}/engine`));
app.use('/', express.static(`${ROOT}/ui`));

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || (e instanceof costs.BudgetError ? 402 : 500)).json({ error: e.message }); }
};
const exists = f => fs.existsSync(f);
const stamp = f => (exists(f) ? fs.statSync(f).mtimeMs : 0);
const shotById = (p, id) => p.story.shots.find(s => s.id === id) || (() => { throw fail(404, `No shot ${id}`); })();
const variantIds = p => (p.story?.characters || []).flatMap(c => c.variants.map(v => v.id));

// Load + bring older stories up to the template format.
function loadP(slug) {
  const p = store.load(slug);
  if (p.story?.shots?.some(s => !s.frame)) { p.story = story.normalize(p.story, p); store.save(p); }
  return p;
}

// Per-shot file state used by the views, next-step logic and estimates.
function shotState(p) {
  return (p.story?.shots || []).map(s => {
    const pr = vis.promptsFor(p, s);
    const still = stamp(vis.stillFile(p, s.id)), clip = stamp(vis.clipFile(p, s.id));
    return {
      ...s, prompts: pr, clipSeconds: vis.clipSeconds(s),
      sketch: stamp(vis.sketchFile(p, s.id)), sketchStale: vis.isStale(vis.sketchFile(p, s.id), pr.sketch),
      still, stillStale: vis.isStale(vis.stillFile(p, s.id), pr.still), stillPrev: exists(vis.stillFile(p, s.id).replace('.png', '.prev.png')),
      clip, clipStale: Boolean(clip && still > clip),
    };
  });
}

async function costPlan(p, shots = shotState(p)) {
  const s = p.settings, est = (kind, n, secs) => providers.estimate(s, kind, n, secs);
  const castLeft = variantIds(p).filter(id => !exists(vis.castFile(p, id))).length;
  const sketchLeft = shots.filter(x => !x.sketch || x.sketchStale).length;
  const stillLeft = shots.filter(x => !x.still || x.stillStale);
  const clipLeft = shots.filter(x => !x.clip || x.clipStale), clipSecs = clipLeft.reduce((a, x) => a + x.clipSeconds, 0);
  const sug = p.story ? sound.suggestions(p) : { sfx: [], amb: [] };
  const sfxLeft = sug.sfx.filter(x => p.sound.sfx[x.key] !== false && !exists(sound.sfxFile(p, x.key))).length;
  const ambLeft = sug.amb.filter(x => p.sound.amb[x.key] !== false && !exists(sound.ambFile(p, x.key))).length;
  const rows = {
    story: { n: p.story ? 0 : 1, usd: p.story ? 0 : await est('writer') },
    cast: { n: castLeft, usd: await est('image', castLeft) },
    sketches: { n: sketchLeft, usd: await est('sketch', sketchLeft) },
    stills: { n: stillLeft.length, usd: await est('edit', stillLeft.length) },
    clips: { n: clipLeft.length, seconds: clipSecs, usd: await est('video', 1, clipSecs) },
    sound: { n: sfxLeft + ambLeft + (exists(sound.musicFile(p)) ? 0 : 1),
      usd: (exists(sound.musicFile(p)) ? 0 : await est('music')) + await est('sfx', 1, sfxLeft * 4 + ambLeft * 20) },
  };
  const remaining = Object.values(rows).reduce((a, r) => a + r.usd, 0);
  return { rows, remaining: +remaining.toFixed(2), spent: costs.summary(p.slug).total, budget: s.budget };
}

// The animatic needs (re)rendering when it's missing or older than any sketch/painting or the story timing.
function animaticStale(p, shots) {
  const a = stamp(store.dir(p.slug, 'out', 'animatic.mp4'));
  return !a || shots.some(s => Math.max(s.sketch, s.still) > a) || new Date(p.storyEditedAt || 0).getTime() > a;
}

// One obvious next action per step.
function nextStep(p, shots, plan) {
  const r = plan.rows, money = n => `~$${n.toFixed(2)}`;
  const approved = k => p.stages[k].approved;
  const renderStamp = stamp(store.dir(p.slug, 'out', 'share.mp4'));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const next = {
    plan: !p.story ? { text: 'Let the writer turn your idea into a wordless screenplay with a routine, an accident, memories and a quiet reveal.', run: 'story', label: 'Write the screenplay', usd: r.story.usd }
      : r.cast.n ? { text: `Draw ${plural(r.cast.n, 'reference sheet')} (characters, places, props) so every shot keeps the same faces, rooms and objects.`, run: 'cast', label: 'Draw characters', usd: r.cast.usd }
      : r.sketches.n ? { text: `Sketch the storyboard: ${plural(r.sketches.n, 'rough shot')} so you can check each composition cheaply.`, run: 'sketch', label: 'Sketch storyboard', usd: r.sketches.usd }
      : animaticStale(p, shots) ? { text: 'Watch the story as an animatic: the sketches cut together at the real timings. Free, rendered on this PC in a few minutes.', run: 'animatic', label: 'Make animatic', usd: 0 }
      : !approved('plan') ? { text: `Check the storyboard. Click any shot to edit it. Making the whole film will cost about ${money(r.stills.usd + r.clips.usd + r.sound.usd)}.`, approve: 'plan', label: 'Approve plan' }
      : { text: 'Plan approved.', go: 'make', label: 'Go to Make' },
    make: !approved('plan') ? { text: 'Approve the plan first. Nothing expensive runs before that.', go: 'plan', label: 'Go to Plan' }
      : shots.some(x => !x.still) ? { text: `Paint ${plural(shots.filter(x => !x.still).length, 'shot')} from the storyboard.`, run: 'stills', label: 'Paint shots', usd: r.stills.usd }
      : shots.some(x => x.stillStale) ? { text: `${plural(shots.filter(x => x.stillStale).length, 'painting')} no longer match their shot's template.`, run: 'stills', body: { items: shots.filter(x => x.stillStale).map(x => x.id), force: true }, label: 'Repaint them', usd: r.stills.usd }
      : shots.some(x => !x.clip) ? { text: `Check the paintings, then animate ${plural(shots.filter(x => !x.clip).length, 'shot')} into video clips.`, run: 'clips', label: 'Animate clips', usd: r.clips.usd }
      : shots.some(x => x.clipStale) ? { text: `${plural(shots.filter(x => x.clipStale).length, 'clip')} were made from an older painting.`, run: 'clips', body: { items: shots.filter(x => x.clipStale).map(x => x.id), force: true }, label: 'Re-animate them', usd: r.clips.usd }
      : !approved('make') ? { text: 'Watch each clip. Regenerate any with warped faces or hands, then continue.', approve: 'make', label: 'Clips look good' }
      : { text: 'All shots are made.', go: 'finish', label: 'Go to Finish' },
    finish: !p.sound.recs ? { text: 'Get music recommendations that fit your story.', run: 'recommend', label: 'Recommend music', usd: 0.05 }
      : r.sound.n ? { text: `Pick a music style below, untick sounds you don't want, then generate ${plural(r.sound.n, 'track')}.`, run: 'sound', label: 'Generate sound', usd: r.sound.usd }
      : !renderStamp ? { text: 'Everything is ready. Render the film (local and free).', run: 'final', label: 'Render film', usd: 0 }
      : { text: 'Your film is ready to watch and download. Changed something? Render again.', run: 'final', label: 'Render again', usd: 0, done: true },
  };
  return next;
}

async function view(p) {
  const shots = shotState(p), plan = await costPlan(p, shots);
  const sug = p.story ? sound.suggestions(p) : { sfx: [], amb: [] };
  return {
    ...p, view: {
      shots, plan, next: nextStep(p, shots, plan), job: jobs.status(p.slug), costs: costs.summary(p.slug),
      cast: variantIds(p).map(id => ({ id, file: stamp(vis.castFile(p, id)) })),
      layout: p.story ? { duration: timeline.layout(p).duration } : null,
      sound: {
        music: stamp(sound.musicFile(p)),
        sfx: sug.sfx.map(x => ({ ...x, on: p.sound.sfx[x.key] !== false, file: stamp(sound.sfxFile(p, x.key)) })),
        amb: sug.amb.map(x => ({ ...x, on: p.sound.amb[x.key] !== false, file: stamp(sound.ambFile(p, x.key)) })),
      },
      final: { share: stamp(store.dir(p.slug, 'out', 'share.mp4')), final: stamp(store.dir(p.slug, 'out', 'final.mp4')),
        animatic: stamp(store.dir(p.slug, 'out', 'animatic.mp4')), animaticStale: p.story ? animaticStale(p, shots) : false },
      lights: Object.keys(prompts.lights(p.story?.palette)),
    },
  };
}

// ---------- catalog / presets ----------
app.get('/api/catalog', wrap(() => providers.catalog()));
app.get('/api/presets', wrap(() => ({
  music: story.MUSIC, styles: story.STYLES, defaults: store.DEFAULT_SETTINGS,
  template: { framing: prompts.FRAMING, light: Object.keys(prompts.LIGHT), camera: Object.keys(prompts.CAMERA), transitions: story.TRANSITIONS },
})));

// ---------- projects ----------
app.get('/api/projects', wrap(() => store.listProjects()));
app.post('/api/projects', wrap(async req => {
  const { theme, settings } = req.body;
  if (!theme?.trim()) throw fail(400, 'Please describe your idea first');
  return view(store.create(theme.trim(), settings));
}));
app.get('/api/projects/:slug', wrap(req => view(loadP(req.params.slug))));
app.patch('/api/projects/:slug', wrap(req => {
  const { settings, story: st, sound: snd, shot, theme } = req.body;
  loadP(req.params.slug);
  return view(store.update(req.params.slug, p => {
    if (theme?.trim()) p.theme = theme.trim();
    if (settings) store.merge(p.settings, settings);
    if (st) {   // also used to import a hand-written screenplay (the full story JSON)
      p.story = story.normalize({ ...p.story, ...st }, p); store.unapproveFrom(p, 'plan'); p.storyEditedAt = new Date().toISOString();
      if (st.music?.prompt && !p.sound.customPrompt) p.sound.customPrompt = st.music.prompt;
      if (st.music?.preset) p.sound.preset ||= p.story.music.preset;
    }
    if (shot) {   // edit one shot: template fields, overrides, timing, cast
      const s = shotById(p, shot.id);
      if (shot.frame) s.frame = { ...s.frame, ...shot.frame };
      if (shot.override) s.override = { ...s.override, ...shot.override };
      for (const k of ['beat', 'seconds', 'transition', 'cast']) if (shot[k] !== undefined) s[k] = shot[k];
      p.story = story.normalize(p.story, p);
      if (shot.seconds !== undefined || shot.transition !== undefined) p.storyEditedAt = new Date().toISOString();   // timing changed
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
app.post('/api/projects/:slug/approve/:stage', wrap(req => {
  if (!store.STAGES.includes(req.params.stage)) throw fail(404, 'Unknown step');
  return view(store.update(req.params.slug, p => {
    if (req.body?.approved === false) store.unapproveFrom(p, req.params.stage);
    else p.stages[req.params.stage].approved = true;
  }));
}));
app.get('/api/projects/:slug/plan', wrap(req => costPlan(loadP(req.params.slug))));
app.get('/api/projects/:slug/costs', wrap(req => costs.ledger(req.params.slug)));
app.post('/api/projects/:slug/undo', wrap(req => {
  const p = loadP(req.params.slug), { kind, id } = req.body;
  const file = kind === 'clip' ? vis.clipFile(p, id) : kind === 'cast' ? vis.castFile(p, id) : vis.stillFile(p, id);
  if (!vis.undo(file)) throw fail(400, 'Nothing to undo');
  if (kind === 'clip') return vis.extractFrames(p, id).then(() => view(p));
  return view(p);
}));

// ---------- stage runners ----------
const each = async (list, limit, label, ctx, fn) => {
  let done = 0;
  ctx.progress({ total: list.length, done, msg: label });
  await jobs.pool(list, limit, async x => { await fn(x); ctx.item(x.id || x); ctx.progress({ done: ++done }); });
};
const pick = (p, { items, force }, file, stale) =>
  p.story.shots.filter(s => (!items || items.includes(s.id)) && (force || !exists(file(p, s.id)) || stale?.(s)));

const runners = {
  async story(p, { note }, ctx) {
    ctx.progress({ msg: note ? 'Revising the screenplay…' : 'Writing the screenplay (reasoning models can take 2-5 minutes)…' });
    const id = costs.charge(p.slug, p.settings.writer.provider, 'screenplay', await providers.estimate(p.settings, 'writer'));
    let r;
    try { r = await story.write(p, note); } catch (e) { costs.refund(p.slug, id); throw e; }
    if (r.usd != null) costs.settle(p.slug, id, r.usd);
    store.update(p.slug, q => { q.story = r.story; q.sound.preset ||= r.story.music.preset; store.unapproveFrom(q, 'plan'); });
  },
  async cast(p, { items, force }, ctx) {
    const ids = (items || variantIds(p)).filter(id => force || !exists(vis.castFile(p, id)));
    await each(ids, 3, 'Drawing character sheets…', ctx, id => vis.castSheet(p, id));
  },
  async sketch(p, body, ctx) {
    const shots = pick(p, body, vis.sketchFile, s => vis.isStale(vis.sketchFile(p, s.id), vis.promptsFor(p, s).sketch));
    await each(shots, 5, 'Sketching the storyboard…', ctx, s => vis.sketch(p, s));
  },
  // Plan mode in one click: screenplay (if missing) -> character sheets -> storyboard sketches.
  async plan(p, body, ctx) {
    if (!p.story) { await runners.story(p, body, ctx); p = loadP(p.slug); }
    await runners.cast(p, {}, ctx);
    await runners.sketch(loadP(p.slug), {}, ctx);
  },
  // Free local preview of the whole film from sketches/paintings, to judge story and timing before paying for video.
  async animatic(p, _, ctx) {
    ctx.progress({ msg: 'Preparing the animatic…' });
    for (const s of p.story.shots) await vis.animaticFrames(p, s.id);
    timeline.build(p, { animatic: true });
    await renderer.render(p.slug, ctx.progress, { fresh: true, kind: 'animatic' });
  },
  async stills(p, body, ctx) {
    const shots = pick(p, body, vis.stillFile, s => vis.isStale(vis.stillFile(p, s.id), vis.promptsFor(p, s).still));
    await each(shots, 4, 'Painting shots…', ctx, s => vis.still(p, s));
  },
  async fix(p, { id, instruction }, ctx) {
    await each([{ id }], 1, `Fixing ${id}…`, ctx, () => vis.fixStill(p, shotById(p, id), instruction));
  },
  async clips(p, body, ctx) {
    const shots = pick(p, body, vis.clipFile, s => stamp(vis.stillFile(p, s.id)) > stamp(vis.clipFile(p, s.id))).filter(s => exists(vis.stillFile(p, s.id)));
    await each(shots, 5, 'Animating clips (about 1-2 minutes each)…', ctx, s => vis.clip(p, s));
  },
  async make(p, body, ctx) { await runners.stills(p, body, ctx); await runners.clips(loadP(p.slug), body, ctx); },
  async recommend(p, _, ctx) {
    ctx.progress({ msg: 'Listening to your story for music ideas…' });
    const recs = await sound.recommend(p);
    store.update(p.slug, q => { q.sound.recs = recs; q.sound.preset ||= recs[0]?.preset; });
  },
  async sound(p, { items, force, music = true }, ctx) {
    const sug = sound.suggestions(p), want = x => !items || items.includes(x.key);
    const sfx = sug.sfx.filter(x => p.sound.sfx[x.key] !== false && want(x) && (force || !exists(sound.sfxFile(p, x.key))));
    const amb = sug.amb.filter(x => p.sound.amb[x.key] !== false && want(x) && (force || !exists(sound.ambFile(p, x.key))));
    const doMusic = music && (!items || items.includes('music')) && (force || !exists(sound.musicFile(p)));
    const tasks = [...(doMusic ? [{ id: 'music' }] : []), ...sfx.map(x => ({ id: x.key, x, kind: 'sfx' })), ...amb.map(x => ({ id: x.key, x, kind: 'amb' }))];
    await each(tasks, 4, 'Generating score and sound effects…', ctx, async t => {
      if (t.id !== 'music') return sound.makeSfx(p, t.x, t.kind);
      const secs = await sound.makeMusic(p);
      store.update(p.slug, q => { q.sound.musicSeconds = secs; });
    });
  },
  async final(p, { fresh }, ctx) {
    ctx.progress({ msg: 'Preparing frames…' });
    for (const s of p.story.shots) {   // shots without a clip fall back to their painting (no motion)
      const info = store.dir(p.slug, 'frames', s.id, 'info.json'), hasClip = exists(vis.clipFile(p, s.id));
      const cur = exists(info) ? JSON.parse(fs.readFileSync(info, 'utf8')) : null;
      if (hasClip && (!cur || cur.still)) await vis.extractFrames(p, s.id);
      else if (!hasClip && exists(vis.stillFile(p, s.id))) await vis.extractFrames(p, s.id, { fromStill: true });
      else if (!hasClip) throw fail(400, `Shot ${s.id} has no painting yet`);
    }
    timeline.build(p);
    const r = await renderer.render(p.slug, ctx.progress, { fresh });
    store.update(p.slug, q => { q.final = { renderedAt: new Date().toISOString(), duration: r.duration }; });
  },
};
const JOB_STEP = { story: 'plan', cast: 'plan', sketch: 'plan', plan: 'plan', animatic: 'plan', stills: 'make', fix: 'make', clips: 'make', make: 'make',
  recommend: 'finish', sound: 'finish', final: 'finish' };

app.post('/api/projects/:slug/run/:task', wrap(req => {
  const p = loadP(req.params.slug), task = req.params.task;
  if (!runners[task]) throw fail(404, `Unknown task ${task}`);
  if (!['story', 'plan'].includes(task) && !p.story) throw fail(400, 'Write the screenplay first');
  jobs.start(p.slug, JOB_STEP[task], ctx => runners[task](loadP(p.slug), req.body || {}, ctx));
  return { started: task };
}));

// Jobs live in memory; anything still "running" on disk was cut off by a restart and can simply be run again (work is cached).
for (const { slug } of store.listProjects()) {
  store.update(slug, p => {
    for (const st of Object.values(p.stages)) if (st.status === 'running') { st.status = 'error'; st.error = 'Interrupted by a server restart. Run it again to resume where it stopped.'; }
  });
}

app.listen(PORT, '127.0.0.1', () => console.log(`Collage Animator running at ${BASE_URL}`));
