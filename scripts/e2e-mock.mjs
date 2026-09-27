// End-to-end test of the app API. Usage: node scripts/e2e-mock.mjs <slug>  (project must be in test mode unless --real)
const BASE = 'http://127.0.0.1:5177/api';
const slug = process.argv[2];
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};
async function stage(run, stageName = run, body = {}) {
  const t0 = Date.now();
  await api(`/projects/${slug}/run/${run}`, body);
  for (;;) {
    await new Promise(r => setTimeout(r, 1000));
    const p = await api(`/projects/${slug}`);
    if (!p.view.job) {
      const st = p.stages[stageName];
      console.log(`${run}: ${st.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s ${st.error || ''}`);
      if (st.status === 'error') process.exit(1);
      return p;
    }
  }
}
const p0 = await api(`/projects/${slug}`);
if (!p0.settings.mock && !process.argv.includes('--real')) throw new Error('not a test-mode project');
let p = await stage('story');
console.log('title:', p.story.title, '| shots:', p.story.shots.length, '| duration:', p.view.layout.duration);
await api(`/projects/${slug}/approve/story`, {});
p = await stage('cast'); await api(`/projects/${slug}/approve/cast`, {});
p = await stage('stills');
console.log('stills:', p.view.shots.filter(s => s.still).length, '/', p.view.shots.length);
p = await stage('fix', 'stills', { id: p.story.shots[0].id, instruction: 'make the sky a little warmer' });
await api(`/projects/${slug}/approve/stills`, {});
p = await stage('clips');
console.log('clips:', p.view.shots.filter(s => s.clip).length);
await api(`/projects/${slug}/approve/clips`, {});
p = await stage('recommend', 'sound');
console.log('recs:', p.sound.recs.map(r => r.preset).join(', '));
p = await stage('sound');
console.log('music:', Boolean(p.view.sound.music), 'sfx:', p.view.sound.sfx.filter(x => x.file).length, 'amb:', p.view.sound.amb.filter(x => x.file).length);
await api(`/projects/${slug}/approve/sound`, {});
p = await stage('final');
console.log('final:', p.final, 'costs:', JSON.stringify(p.view.costs));
