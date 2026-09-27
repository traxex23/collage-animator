// Small REAL-provider check (~$0.40): writer + character sheets + one still + one fix. Budget capped at $1.
const BASE = 'http://127.0.0.1:5177/api';
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};
async function stage(slug, run, stageName = run, body = {}) {
  const t0 = Date.now();
  await api(`/projects/${slug}/run/${run}`, body);
  for (;;) {
    await new Promise(r => setTimeout(r, 2000));
    const p = await api(`/projects/${slug}`);
    if (!p.view.job) {
      const st = p.stages[stageName];
      console.log(`${run}: ${st.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s ${st.error || ''} | spent $${p.view.costs.total}`);
      if (st.status === 'error') process.exit(1);
      return p;
    }
  }
}
const p0 = await api('/projects', {
  theme: 'A retired tailor keeps sewing a coat for a grandson who moved to another country, one stitch each evening',
  settings: { length: 30, budget: 1, mock: false, writer: { provider: 'xai', model: 'grok-4.7' },
    image: { provider: 'venice', model: 'nano-banana-2', editModel: 'nano-banana-2-edit', res: '1K' } },
});
const slug = p0.slug;
console.log('project', slug);
let p = await stage(slug, 'story');
console.log('title:', p.story.title, '|', p.story.logline);
console.log('characters:', p.story.characters.map(c => `${c.name}[${c.variants.map(v => v.id).join(',')}]`).join('; '));
console.log('plants:', JSON.stringify(p.story.plants));
for (const s of p.story.shots) console.log(` ${s.id} a${s.act} ${s.grade}/${s.transition} ${s.seconds}s cast=${s.cast.join(',')} :: ${s.beat}`);
p = await stage(slug, 'cast');
const first = p.story.shots.find(s => s.cast.length) || p.story.shots[0];
p = await stage(slug, 'stills', 'stills', { items: [first.id] });
p = await stage(slug, 'fix', 'stills', { id: first.id, instruction: 'make the lamp light a little warmer' });
console.log('ledger:', JSON.stringify((await api(`/projects/${slug}/costs`)).items.map(i => [i.provider, i.what, i.usd, i.estimated])));
