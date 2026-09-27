// End-to-end test of the app API (4-step flow). Usage: node scripts/e2e-mock.mjs [slug]  (creates a test-mode film if no slug)
const BASE = 'http://127.0.0.1:5177/api';
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};
let slug = process.argv[2];
if (!slug) slug = (await api('/projects', { theme: 'A boy and his grandfather repair an old radio every Sunday', settings: { length: 30, mock: true } })).slug;
const STEP = { story: 'plan', cast: 'plan', sketch: 'plan', plan: 'plan', stills: 'make', fix: 'make', clips: 'make', make: 'make', recommend: 'finish', sound: 'finish', final: 'finish' };

async function task(name, body = {}) {
  const t0 = Date.now();
  await api(`/projects/${slug}/run/${name}`, body);
  for (;;) {
    await new Promise(r => setTimeout(r, 1000));
    const p = await api(`/projects/${slug}`);
    if (!p.view.job) {
      const st = p.stages[STEP[name]];
      console.log(`${name}: ${st.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s ${st.error || ''}`);
      if (st.status === 'error') process.exit(1);
      return p;
    }
  }
}
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) process.exitCode = 1; };

const p0 = await api(`/projects/${slug}`);
if (!p0.settings.mock) throw new Error('not a test-mode project');
let p = await task('plan');
check('story has frame templates', p.story.shots.every(s => s.frame?.framing && s.frame?.light));
check('all sketched', p.view.shots.every(s => s.sketch));
check('next step = approve plan', p.view.next.plan.approve === 'plan');
console.log('cost plan:', JSON.stringify(p.view.plan.rows));

// edit a template field -> sketch becomes stale -> re-sketch clears it
const s1 = p.story.shots[0].id;
p = await api(`/projects/${slug}`, { shot: { id: s1, frame: { framing: 'extreme close-up', camera: 'tilt up' } } }, 'PATCH');
check('edit marks sketch stale', p.view.shots[0].sketchStale === true);
check('compiled prompt uses new framing', p.view.shots[0].prompts.still.includes('Extreme close-up shot.'));
p = await task('sketch', { items: [s1], force: true });
check('re-sketch clears stale', p.view.shots[0].sketchStale === false);

await api(`/projects/${slug}/approve/plan`, {});
p = await task('make');
check('all painted + animated', p.view.shots.every(s => s.still && s.clip));
p = await task('fix', { id: s1, instruction: 'warmer light' });
await api(`/projects/${slug}/approve/make`, {});
p = await task('recommend');
check('3 music recs', p.sound.recs.length === 3);
p = await task('sound');
check('score generated', Boolean(p.view.sound.music));
p = await task('final');
check('rendered', Boolean(p.view.final.share));
check('next step says done', p.view.next.finish.done === true);
console.log('slug:', slug, '| costs:', JSON.stringify(p.view.costs));
