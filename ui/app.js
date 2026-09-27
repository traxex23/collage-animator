// Collage Animator UI (vanilla JS). The server does the work; this renders state and sends actions.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => `$${(n || 0).toFixed(2)}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const STEPS = [['idea', 'Idea'], ['plan', 'Plan'], ['make', 'Make'], ['finish', 'Finish']];
const S = { projects: [], p: null, step: 'plan', catalog: null, presets: null, events: null, editing: null, newSettings: null, newTheme: '' };

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function toast(msg, ms = 4000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
const fileUrl = (rel, v) => `/projects/${encodeURIComponent(S.p.slug)}/${rel}?v=${Math.round(v || 0)}`;
const busy = () => Boolean(S.p?.view.job);

// ---------------- boot & routing ----------------
async function boot() {
  [S.presets, S.projects] = await Promise.all([api('/presets'), api('/projects')]);
  api('/catalog').then(c => { S.catalog = c; renderKeys(); if (!location.hash.slice(1)) renderNew(); else if (S.step === 'idea') render(); }).catch(e => toast(e.message));
  $('#newBtn').onclick = () => { location.hash = ''; };
  window.onhashchange = route;
  route();
}
async function route() {
  const [slug, step] = location.hash.slice(1).split('/');
  if (!slug) { S.p = null; S.events?.close(); S.events = null; renderSide(); renderNew(); return; }
  if (S.p?.slug !== slug) { listen(slug); S.editing = null; }
  try { S.p = await api(`/projects/${slug}`); } catch (e) { toast(e.message); location.hash = ''; return; }
  S.projects = await api('/projects');
  S.step = STEPS.some(([k]) => k === step) ? step : currentStep();
  renderSide(); render();
}
const currentStep = () => (['plan', 'make', 'finish'].find(k => !S.p.stages[k].approved) || 'finish');
const go = step => { location.hash = `${S.p.slug}/${step}`; };

function listen(slug) {
  S.events?.close();
  S.events = new EventSource(`/api/projects/${slug}/events`);
  let t;
  const refresh = () => { clearTimeout(t); t = setTimeout(reload, 400); };
  S.events.onmessage = e => {
    const ev = JSON.parse(e.data);
    if (!S.p) return;
    if (ev.type === 'progress') { S.p.view.job = ev; renderJob(); }
    if (ev.type === 'item') refresh();
    if (ev.type === 'done') { S.p.view.job = null; toast('Done'); reload(); }
    if (ev.type === 'error') { S.p.view.job = null; toast(`Something went wrong: ${ev.message}`, 9000); reload(); }
  };
}
async function reload() { if (!S.p) return; S.p = await api(`/projects/${S.p.slug}`); render(); }

async function action(fn, okMsg) {
  try { const r = await fn(); if (r?.slug) { S.p = r; render(); } if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, 8000); }
}
const run = (task, body = {}) => action(async () => {
  await api(`/projects/${S.p.slug}/run/${task}`, { method: 'POST', body });
  S.p.view.job = { stage: task, msg: 'Starting…' }; render();
});
const patch = body => action(() => api(`/projects/${S.p.slug}`, { method: 'PATCH', body }));
const approve = (step, approved = true) => action(async () => {
  S.p = await api(`/projects/${S.p.slug}/approve/${step}`, { method: 'POST', body: { approved } });
  if (approved) go({ plan: 'make', make: 'finish', finish: 'finish' }[step]); else render();
});

// ---------------- sidebar ----------------
function renderSide() {
  $('#projects').innerHTML = S.projects.map(x => `<a href="#${x.slug}" class="${S.p?.slug === x.slug ? 'on' : ''}">${esc(x.title)}
    <small>${x.mock ? 'test mode · ' : ''}${x.stage === 'done' ? 'finished' : x.stage}</small></a>`).join('') || '<div class="muted small">No films yet.</div>';
}
function renderKeys() {
  const k = S.catalog?.keys || {};
  $('#keys').innerHTML = `<div><span class="dot ${k.venice ? 'ok' : ''}"></span>Venice key</div><div><span class="dot ${k.xai ? 'ok' : ''}"></span>xAI key</div>
    ${S.catalog?.errors?.length ? `<div title="${esc(S.catalog.errors.join('\n'))}">⚠ some model lists failed</div>` : ''}`;
}

// ---------------- shared form bits ----------------
const opt = (v, sel, label = v) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
const modelOptions = (list, sel) => (list || []).map(m => opt(m.id, sel, m.name || m.id)).join('');
const priceOf = (list, id, res) => { const m = (list || []).find(x => x.id === id); return m?.price?.[res]?.usd ?? m?.price?.['1K']?.usd; };

function providerFields(s) {
  const c = S.catalog;
  if (!c) return '<div class="muted">Loading model lists…</div>';
  const wp = s.writer.provider, ip = s.image.provider, sp = s.sketch.provider;
  const writers = c.writer[wp] || [];
  if (!s.writer.model && writers.length) s.writer.model = (wp === 'venice' ? writers.find(m => /claude-opus-5-5/.test(m.id)) : null)?.id || writers[0].id;
  const provSel = (k, v) => `<select data-k="${k}">${opt('xai', v, 'xAI (Grok)')}${opt('venice', v, 'Venice')}</select>`;
  const editPrice = priceOf(c.imageEdit[ip], s.image.editModel, s.image.res), sketchPrice = priceOf(c.image[sp], s.sketch.model, '1K');
  return `
  <details class="advanced" ${S.showModels ? 'open' : ''}><summary>AI models & budget</summary>
  <div class="form-grid">
    <div><label>Writer</label><div class="pair">${provSel('writer.provider', wp)}<select data-k="writer.model">${modelOptions(writers, s.writer.model)}</select></div></div>
    <div><label>Storyboard sketches <span class="est">${sketchPrice != null ? `~${money(sketchPrice)} each` : ''}</span></label>
      <div class="pair">${provSel('sketch.provider', sp)}<select data-k="sketch.model">${modelOptions(c.image[sp], s.sketch.model)}</select></div></div>
    <div><label>Paintings <span class="est">${editPrice != null ? `~${money(editPrice)} each` : ''}</span></label>
      <div class="pair">${provSel('image.provider', ip)}<select data-k="image.editModel" title="paints each shot from the character sheets">${modelOptions(c.imageEdit[ip], s.image.editModel)}</select></div></div>
    <div><label>Character sheets</label><div class="pair"><select data-k="image.model">${modelOptions(c.image[ip], s.image.model)}</select>
      <select data-k="image.res">${['1K', '2K', '4K'].map(r => opt(r, s.image.res)).join('')}</select></div></div>
    <div><label>Video clips</label><div class="pair"><select data-k="video.model">${modelOptions(c.video.xai, s.video.model)}</select>
      <select data-k="video.res">${['480p', '720p'].map(r => opt(r, s.video.res)).join('')}</select></div></div>
    <div><label>Budget cap (USD)</label><input type="number" min="0" step="1" data-k="budget" value="${s.budget}"></div>
  </div></details>`;
}
function bindFields(root, s, redraw) {
  const d = $('details.advanced', root); if (d) d.ontoggle = () => (S.showModels = d.open);
  $$('[data-k]', root).forEach(el => (el.onchange = () => {
    const path = el.dataset.k.split('.'), v = el.type === 'number' ? Number(el.value) : el.type === 'checkbox' ? el.checked : el.value;
    let o = s; for (const k of path.slice(0, -1)) o = o[k]; o[path.at(-1)] = v;
    const c = S.catalog;
    if (el.dataset.k === 'writer.provider') s.writer.model = '';
    if (el.dataset.k === 'image.provider') {
      s.image.model = c.image[v]?.find(m => /nano-banana-2$|grok-imagine-image-quality/.test(m.id))?.id || c.image[v]?.[0]?.id || '';
      s.image.editModel = c.imageEdit[v]?.find(m => /nano-banana-2-edit|grok-imagine-image-quality/.test(m.id))?.id || c.imageEdit[v]?.[0]?.id || '';
    }
    if (el.dataset.k === 'sketch.provider') s.sketch.model = c.image[v]?.find(m => /^grok-imagine-image$|z-image-turbo/.test(m.id))?.id || c.image[v]?.[0]?.id || '';
    redraw();
  }));
}
function ideaFields(s, theme) {
  return `
    <div><label>What is your film about?</label>
      <textarea id="theme" rows="3" placeholder="e.g. An old lighthouse keeper writes a letter to the sea every night after his wife is lost at sea">${esc(theme)}</textarea></div>
    <div class="form-grid three">
      <div><label>Length</label><select data-k="length">${[30, 60, 90, 120].map(n => `<option value="${n}" ${n == s.length ? 'selected' : ''}>${n} seconds (~${Math.round(n / 6)} shots)</option>`).join('')}</select></div>
      <div><label>Format</label><select data-k="aspect">${opt('16:9', s.aspect, '16:9 landscape (YouTube)')}${opt('9:16', s.aspect, '9:16 vertical (Reels, TikTok)')}</select></div>
      <div><label>&nbsp;</label><label class="check"><input type="checkbox" data-k="mock" ${s.mock ? 'checked' : ''}> Test mode ($0, placeholder art)</label></div>
    </div>
    <div><label>Look</label><div class="styles">${S.presets.styles.map(x => `<button class="style-opt ${x.id === s.style ? 'on' : ''}" data-style="${x.id}"><b>${esc(x.name)}</b><small>${esc(x.about)}</small></button>`).join('')}</div></div>
    ${providerFields(s)}`;
}

// ---------------- new film ----------------
function renderNew() {
  const s = S.newSettings ||= structuredClone(S.presets.defaults);
  const main = $('#main');
  main.innerHTML = `
  <header class="head"><div><div class="eyebrow">New film</div><h1>What's the story?</h1></div></header>
  <section class="card pad stack">${ideaFields(s, S.newTheme)}
    <div class="row end"><button class="primary big" id="create">Create film →</button></div></section>
  <p class="muted small">Next you'll get a screenplay, character sheets and a cheap sketched storyboard to approve before anything expensive runs.</p>`;
  $('#theme').oninput = e => (S.newTheme = e.target.value);
  $$('[data-style]', main).forEach(b => (b.onclick = () => { s.style = b.dataset.style; renderNew(); }));
  bindFields(main, s, renderNew);
  $('#create').onclick = async () => {
    const r = await action(() => api('/projects', { method: 'POST', body: { theme: $('#theme').value, settings: s } }));
    if (r) { S.newTheme = ''; S.newSettings = null; S.projects = await api('/projects'); location.hash = `${r.slug}/plan`; }
  };
}

// ---------------- project shell ----------------
function stepStatus(k) {
  const v = S.p.view, sh = v.shots, n = sh.length;
  if (k === 'idea') return S.p.settings.mock ? 'test mode' : `${S.p.settings.length}s · ${S.p.settings.aspect}`;
  if (k === 'plan') return !S.p.story ? 'not started' : `${sh.filter(x => x.sketch).length}/${n} sketched`;
  if (k === 'make') return `${sh.filter(x => x.still).length}/${n} painted · ${sh.filter(x => x.clip).length}/${n} animated`;
  return v.final.share ? 'rendered' : v.sound.music ? 'score ready' : 'no sound yet';
}

function render() {
  if (!S.p) return;
  const p = S.p, v = p.view;
  $('#main').innerHTML = `
  <header class="head">
    <div><div class="eyebrow">${p.settings.mock ? '<span class="chip warn">test mode · $0</span> ' : ''}${esc(p.theme.slice(0, 90))}</div>
      <h1>${esc(p.story?.title || 'Untitled film')}</h1></div>
    <div class="spend" title="${esc(Object.entries(v.costs.byProvider).map(([k, x]) => `${k}: ${money(x)}`).join('\n'))}">
      <b>${money(v.costs.total)}</b> spent<br><span class="muted">cap ${money(p.settings.budget)}</span></div>
  </header>
  <nav class="stepper">${STEPS.map(([k, l], i) => `<button data-go="${k}" class="${S.step === k ? 'on' : ''} ${k !== 'idea' && p.stages[k]?.approved ? 'done' : ''}">
    <span class="num">${k !== 'idea' && p.stages[k]?.approved ? '✓' : i + 1}</span><span><b>${l}</b><small>${esc(stepStatus(k))}</small></span></button>`).join('')}</nav>
  <div id="next"></div>
  <div id="step"></div>
  <aside id="drawer" class="${S.editing ? 'open' : ''}"></aside>`;
  $$('[data-go]').forEach(b => (b.onclick = () => go(b.dataset.go)));
  renderNext();
  ({ idea: renderIdea, plan: renderPlan, make: renderMake, finish: renderFinish })[S.step]($('#step'));
  renderDrawer();
}

// The one obvious next action, with its cost; becomes a progress bar while a job runs.
function renderNext() {
  const el = $('#next'); if (!el) return;
  if (S.step === 'idea') { el.innerHTML = ''; return; }
  const n = S.p.view.next[S.step], err = S.p.stages[S.step]?.status === 'error' ? S.p.stages[S.step].error : null;
  el.innerHTML = `<section class="next ${n.done ? 'done' : ''}">
    <div class="next-text"><div class="eyebrow">Next step</div><p>${esc(n.text)}</p>
      ${err ? `<p class="err">Last run failed: ${esc(err)}</p>` : ''}</div>
    <div class="next-act" id="jobBox"></div></section>`;
  renderJob();
}
function renderJob() {
  const box = $('#jobBox'); if (!box) return;
  const j = S.p.view.job, n = S.p.view.next[S.step];
  if (j) {
    box.innerHTML = `<div class="job"><div class="small"><b>Working…</b> ${esc(j.msg || '')} ${j.total ? `(${j.done}/${j.total})` : ''}</div>
      <div class="track"><div class="fill ${j.total ? '' : 'indeterminate'}" style="width:${j.total ? Math.max(4, 100 * j.done / j.total) : 30}%"></div></div></div>`;
  } else if (n) {
    box.innerHTML = `<button class="primary big" id="nextBtn">${esc(n.label)}</button>${n.usd != null && n.run ? `<div class="est">${n.usd ? `about ${money(n.usd)}` : 'free'}</div>` : ''}`;
    $('#nextBtn').onclick = () => n.run ? run(n.run, n.run === 'final' ? { fresh: $('#fresh')?.checked || false } : (n.body || {}))
      : n.approve ? approve(n.approve) : go(n.go);
  }
  $$('[data-needs-idle]').forEach(b => (b.disabled = Boolean(j)));
}

// ---------------- 1. idea ----------------
function renderIdea(el) {
  const s = S.ideaDraft && S.ideaDraft.slug === S.p.slug ? S.ideaDraft.s : structuredClone(S.p.settings);
  S.ideaDraft = { slug: S.p.slug, s, theme: S.ideaDraft?.slug === S.p.slug ? S.ideaDraft.theme : S.p.theme };
  el.innerHTML = `<section class="card pad stack">${ideaFields(s, S.ideaDraft.theme)}
    <div class="row end"><button id="cancelIdea" class="ghost">Discard changes</button><button class="primary" id="saveIdea">Save</button></div></section>
    <p class="muted small">Changing the idea doesn't rewrite the screenplay by itself. Use <b>Rewrite</b> in Plan for that. New settings apply to the next generation.</p>`;
  $('#theme').oninput = e => (S.ideaDraft.theme = e.target.value);
  $$('[data-style]', el).forEach(b => (b.onclick = () => { s.style = b.dataset.style; render(); }));
  bindFields(el, s, render);
  $('#cancelIdea').onclick = () => { S.ideaDraft = null; render(); };
  $('#saveIdea').onclick = async () => { await patch({ settings: s, theme: S.ideaDraft.theme }); S.ideaDraft = null; toast('Saved'); };
}

// ---------------- 2. plan ----------------
function thumb(src, stamp, empty, cls = '') {
  return stamp ? `<img class="${cls}" src="${src}" loading="lazy" onload="this.classList.add('loaded')">` : `<div class="placeholder">${empty}</div>`;
}
function chips(s) {
  return `<span class="tag">${esc(s.frame.framing)}</span><span class="tag ${s.grade}">${esc(s.frame.light)}</span>${s.frame.camera !== 'static' ? `<span class="tag">${esc(s.frame.camera)}</span>` : ''}`;
}
function renderPlan(el) {
  const p = S.p, st = p.story, v = p.view;
  if (!st) { el.innerHTML = `<section class="card pad empty"><h2>Your idea</h2><p>${esc(p.theme)}</p></section>`; return; }
  const cast = st.characters.flatMap(c => c.variants.map(x => ({ ...x, name: c.name })));
  const files = Object.fromEntries(v.cast.map(c => [c.id, c.file]));
  const plan = v.plan, row = (l, r) => `<tr><td>${l}</td><td>${r.n ? plural(r.n, 'item') : '<span class="muted">done</span>'}</td><td class="num">${money(r.usd)}</td></tr>`;
  el.innerHTML = `
  <section class="card pad">
    <div class="row"><h2>${esc(st.title)}</h2><span class="spacer"></span><span class="muted small">${st.shots.length} shots · ${v.layout.duration.toFixed(0)}s</span></div>
    <p class="logline">${esc(st.logline)}</p>
    ${st.plants.length ? `<p class="small"><b>Planted → paid off:</b> ${st.plants.map(x => `${esc(x.object)} <span class="muted">(${esc(x.setup_shot)} → ${esc(x.payoff_shot)})</span>`).join(' · ')}</p>` : ''}
    <div class="row"><input type="text" id="note" placeholder="Want changes? e.g. make the twist stronger, add a dog, shorter memories"><button data-needs-idle id="rewrite">Rewrite</button></div>
  </section>

  <h3 class="section">Characters</h3>
  <div class="cast">${cast.map(x => `<div class="card cast-card">${thumb(fileUrl(`cast/${x.id}.png`, files[x.id]), files[x.id], 'not drawn yet')}
    <div class="body"><b>${esc(x.name)}</b> <span class="tag">${esc(x.id)}</span><textarea data-look="${x.id}" rows="3">${esc(x.look)}</textarea>
    <button class="small" data-needs-idle data-redraw="${x.id}">${files[x.id] ? 'Redraw' : 'Draw'}</button></div></div>`).join('')}</div>

  <h3 class="section">Storyboard <span class="muted small">click a shot to edit it</span></h3>
  <div class="board ${p.settings.aspect === '9:16' ? 'vertical' : ''}">${v.shots.map((s, i) => `<button class="card shot-card ${S.editing === s.id ? 'on' : ''}" data-edit="${s.id}">
    <div class="media">${thumb(fileUrl(`sketches/${s.id}.png`, s.sketch), s.sketch, 'not sketched')}${s.sketchStale ? '<span class="badge warn">changed · re-sketch</span>' : ''}
      <span class="badge num">${i + 1}</span></div>
    <div class="body"><div class="chips">${chips(s)}<span class="spacer"></span><span class="muted small">${s.seconds}s · ${esc(s.transition)}</span></div>
      <p class="beat">${esc(s.beat)}</p></div></button>`).join('')}</div>

  <h3 class="section">Cost plan <span class="muted small">what's left to make, at list prices</span></h3>
  <section class="card pad"><table class="costs">
    ${row('Character sheets', plan.rows.cast)}${row('Storyboard sketches', plan.rows.sketches)}${row('Paintings', plan.rows.stills)}
    ${row(`Video clips${plan.rows.clips.seconds ? ` (${plan.rows.clips.seconds}s)` : ''}`, plan.rows.clips)}${row('Music & sound', plan.rows.sound)}
    <tr class="total"><td>Remaining</td><td></td><td class="num">${money(plan.remaining)}</td></tr>
    <tr><td class="muted">Already spent · budget cap</td><td></td><td class="num muted">${money(plan.spent)} · ${money(plan.budget)}</td></tr>
  </table>${plan.spent + plan.remaining > plan.budget ? '<p class="err small">This is more than your budget cap. Raise it in Idea → AI models & budget.</p>' : ''}</section>`;
  $('#rewrite').onclick = () => run('story', { note: $('#note').value });
  $$('[data-look]', el).forEach(t => (t.onchange = () => {
    const chars = structuredClone(st.characters);
    for (const c of chars) for (const x of c.variants) if (x.id === t.dataset.look) x.look = t.value;
    patch({ story: { characters: chars } });
  }));
  $$('[data-redraw]', el).forEach(b => (b.onclick = () => run('cast', { items: [b.dataset.redraw], force: true })));
  $$('[data-edit]', el).forEach(b => (b.onclick = () => { S.editing = b.dataset.edit; render(); }));
  renderJob();
}

// Shot editor drawer: the prompt template, compiled preview, advanced override.
function renderDrawer() {
  const d = $('#drawer'); if (!d) return;
  const s = S.editing && S.p.view.shots.find(x => x.id === S.editing);
  if (!s) { d.innerHTML = ''; d.classList.remove('open'); return; }
  const T = S.presets.template, f = s.frame;
  const variants = S.p.story.characters.flatMap(c => c.variants.map(x => ({ id: x.id, name: c.name })));
  const sel = (k, list) => `<select data-f="${k}">${list.map(x => opt(x, f[k])).join('')}</select>`;
  d.innerHTML = `
  <div class="drawer-head"><b>Shot ${esc(s.id)}</b><span class="spacer"></span><button class="ghost" id="closeDrawer">✕</button></div>
  <div class="drawer-body stack">
    ${s.sketch ? `<img class="drawer-img" src="${fileUrl(`sketches/${s.id}.png`, s.sketch)}">` : ''}
    <div><label>Beat: what happens and why it matters</label><textarea data-s="beat" rows="2">${esc(s.beat)}</textarea></div>
    <div class="form-grid three">
      <div><label>Framing</label>${sel('framing', T.framing)}</div><div><label>Light</label>${sel('light', T.light)}</div><div><label>Camera</label>${sel('camera', T.camera)}</div>
    </div>
    <div><label>Subject: who is in frame and where</label><input type="text" data-f="subject" value="${esc(f.subject)}"></div>
    <div><label>Action: the one thing that happens</label><input type="text" data-f="action" value="${esc(f.action)}"></div>
    <div><label>Setting: place, time, weather</label><input type="text" data-f="setting" value="${esc(f.setting)}"></div>
    <div><label>Motion: what moves in the clip</label><input type="text" data-f="motion" value="${esc(f.motion)}"></div>
    <div class="form-grid three">
      <div><label>Seconds</label><input type="number" data-s="seconds" min="3" max="10" step="0.5" value="${s.seconds}"></div>
      <div><label>Transition in</label><select data-s="transition">${T.transitions.map(x => opt(x, s.transition)).join('')}</select></div>
      <div><label>Characters</label><div class="checks">${variants.map(x => `<label class="check"><input type="checkbox" data-cast="${x.id}" ${s.cast.includes(x.id) ? 'checked' : ''}> ${esc(x.id)}</label>`).join('')}</div></div>
    </div>
    <details><summary>Advanced: write the prompt yourself</summary>
      <label>Painting prompt override (replaces framing/subject/action/setting)</label><textarea data-o="still" rows="3">${esc(s.override?.still)}</textarea>
      <label>Motion prompt override</label><textarea data-o="motion" rows="2">${esc(s.override?.motion)}</textarea></details>
    <details><summary>Exact prompts sent to the models</summary>
      <label>Painting</label><pre>${esc(s.prompts.still)}</pre><label>Clip motion</label><pre>${esc(s.prompts.motion)}</pre></details>
  </div>
  <div class="drawer-foot"><button data-needs-idle id="resketch">${s.sketch ? 'Re-sketch' : 'Sketch'}</button><span class="spacer"></span>
    <button class="primary" id="saveShot">Save shot</button></div>`;
  d.classList.add('open');
  const collect = () => {
    const shot = { id: s.id, frame: {}, override: {} };
    $$('[data-f]', d).forEach(x => (shot.frame[x.dataset.f] = x.value));
    $$('[data-o]', d).forEach(x => (shot.override[x.dataset.o] = x.value));
    $$('[data-s]', d).forEach(x => (shot[x.dataset.s] = x.type === 'number' ? Number(x.value) : x.value));
    shot.cast = $$('[data-cast]', d).filter(x => x.checked).map(x => x.dataset.cast);
    return shot;
  };
  $('#closeDrawer').onclick = () => { S.editing = null; render(); };
  $('#saveShot').onclick = async () => { await patch({ shot: collect() }); toast('Shot saved'); };
  $('#resketch').onclick = async () => { await patch({ shot: collect() }); run('sketch', { items: [s.id], force: true }); };
  renderJob();
}

// ---------------- 3. make ----------------
function renderMake(el) {
  const p = S.p, shots = p.view.shots; if (!p.story) return (el.innerHTML = '<section class="card pad empty">Plan the film first.</section>');
  el.innerHTML = `<div class="make-head"><span>Sketch</span><span>Painting</span><span>Clip</span></div>
  ${shots.map((s, i) => `<section class="card make-row ${p.settings.aspect === '9:16' ? 'vertical' : ''}" data-shot="${s.id}">
    <div class="make-info"><b>${i + 1}. ${esc(s.id)}</b><div class="chips">${chips(s)}</div><p class="beat">${esc(s.beat)}</p></div>
    <div class="make-cols">
      <div class="col"><div class="media">${thumb(fileUrl(`sketches/${s.id}.png`, s.sketch), s.sketch, 'no sketch')}</div></div>
      <div class="col"><div class="media">${thumb(fileUrl(`stills/${s.id}.png`, s.still), s.still, 'not painted')}${s.stillStale ? '<span class="badge warn">shot changed</span>' : ''}</div>
        <div class="acts"><button class="small" data-needs-idle data-act="paint">${s.still ? 'Repaint' : 'Paint'}</button>
          ${s.stillPrev ? '<button class="small ghost" data-act="undo-still">Undo</button>' : ''}</div>
        ${s.still ? `<div class="fix"><input type="text" data-fix placeholder="Fix: e.g. only one headboard"><button class="small" data-needs-idle data-act="fix">Fix</button></div>` : ''}</div>
      <div class="col"><div class="media">${s.clip ? `<video src="${fileUrl(`clips/${s.id}.mp4`, s.clip)}" muted loop playsinline preload="metadata" controls></video>` : '<div class="placeholder">not animated</div>'}
        ${s.clipStale ? '<span class="badge warn">older painting</span>' : ''}</div>
        ${s.clip ? `<img class="qa" src="${fileUrl(`qa/${s.id}.jpg`, s.clip)}" title="QA strip: first, 1/3, 2/3 and last frame">` : ''}
        <div class="acts"><button class="small" data-needs-idle data-act="animate" ${s.still ? '' : 'disabled'}>${s.clip ? 'Re-animate' : 'Animate'} · ${s.clipSeconds}s</button>
          ${s.clip ? '<button class="small ghost" data-act="undo-clip">Undo</button>' : ''}</div></div>
    </div></section>`).join('')}
  <div class="row end"><button data-needs-idle id="makeAll">Paint + animate everything missing</button></div>`;
  $$('[data-shot]', el).forEach(card => {
    const id = card.dataset.shot;
    $$('[data-act]', card).forEach(b => (b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'paint') run('stills', { items: [id], force: true });
      if (a === 'animate') run('clips', { items: [id], force: true });
      if (a === 'fix') { const t = $('[data-fix]', card).value.trim(); if (!t) return toast('Describe what to fix first'); run('fix', { id, instruction: t }); }
      if (a === 'undo-still') action(() => api(`/projects/${S.p.slug}/undo`, { method: 'POST', body: { kind: 'still', id } }), 'Restored the previous painting');
      if (a === 'undo-clip') action(() => api(`/projects/${S.p.slug}/undo`, { method: 'POST', body: { kind: 'clip', id } }), 'Restored the previous clip');
    }));
  });
  $('#makeAll').onclick = () => run('make');
  renderJob();
}

// ---------------- 4. finish ----------------
function renderFinish(el) {
  const p = S.p, v = p.view, snd = v.sound; if (!p.story) return (el.innerHTML = '<section class="card pad empty">Plan the film first.</section>');
  const presets = S.presets.music, recs = p.sound.recs || [];
  const recCards = recs.map(r => ({ ...presets.find(m => m.id === r.preset), why: r.why }));
  const others = presets.filter(m => !recs.some(r => r.preset === m.id));
  const card = m => `<button class="rec ${p.sound.preset === m.id && !p.sound.customPrompt ? 'on' : ''}" data-preset="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.why || m.about)}</small></button>`;
  const soundRows = (list, kind) => list.map(x => `<tr><td><input type="checkbox" data-${kind}="${x.key}" ${x.on ? 'checked' : ''}></td>
    <td class="muted small">${esc(kind === 'sfx' ? `${x.shot} +${x.offset}s` : x.shots.join(', '))}</td><td>${esc(x.prompt)}</td>
    <td>${x.file ? `<audio controls src="${fileUrl(`audio/${kind}_${x.key}.mp3`, x.file)}"></audio>` : ''}</td>
    <td>${x.file ? `<button class="small" data-needs-idle data-redo="${x.key}">Redo</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">None suggested.</td></tr>';
  el.innerHTML = `
  <h3 class="section">Music ${recs.length ? '<span class="muted small">recommended for your story</span>' : ''}</h3>
  <div class="recs">${(recs.length ? recCards : presets).map(card).join('')}</div>
  ${recs.length ? `<details class="more"><summary>All styles</summary><div class="recs">${others.map(card).join('')}</div></details>` : ''}
  <section class="card pad stack">
    <div><label>Or describe your own music (overrides the style above)</label><textarea id="customMusic" rows="2" placeholder="e.g. a lone harmonica and soft rain">${esc(p.sound.customPrompt || '')}</textarea></div>
    <div class="row">${snd.music ? `<audio controls src="${fileUrl('audio/music.mp3', snd.music)}"></audio>
      <span class="muted small">${p.sound.musicSeconds ? `${p.sound.musicSeconds.toFixed(0)}s score` : ''} · film is ${v.layout.duration.toFixed(0)}s</span>
      <span class="spacer"></span><button class="small" data-needs-idle id="regenMusic">Regenerate score</button>` : '<span class="muted small">No score yet. Generate it with the button above.</span>'}</div>
  </section>
  <h3 class="section">Sound effects <span class="muted small">suggested from the screenplay; untick what you don't want</span></h3>
  <section class="card pad"><table class="sfx">${soundRows(snd.sfx, 'sfx')}</table>
    <h4>Ambience</h4><table class="sfx">${soundRows(snd.amb, 'amb')}</table></section>
  <h3 class="section">Film</h3>
  <section class="card pad final">
    ${v.shots.some(s => !s.clip) ? `<p class="muted small">${plural(v.shots.filter(s => !s.clip).length, 'shot')} without a clip will appear as still paintings.</p>` : ''}
    ${v.final.share ? `<video controls src="${fileUrl('out/share.mp4', v.final.share)}"></video>
      <div class="row"><a class="btn" href="${fileUrl('out/share.mp4', v.final.share)}" download="${esc(p.slug)}.mp4">Download share copy</a>
      <a class="btn ghost" href="${fileUrl('out/final.mp4', v.final.final)}" download="${esc(p.slug)}-full.mp4">Full quality</a>
      <span class="spacer"></span><label class="check"><input type="checkbox" id="fresh"> re-render from scratch</label></div>`
      : `<div class="placeholder tall">Not rendered yet</div>`}
    <p class="muted small"><a href="/engine/?project=${encodeURIComponent(p.slug)}" target="_blank">Open live preview ↗</a> ·
      spent ${Object.entries(v.costs.byProvider).map(([k, x]) => `${esc(k)} ${money(x)}`).join(' · ') || '$0'}
      (xAI figures are provider-reported; Venice figures are list-price estimates)</p>
  </section>`;
  $$('[data-preset]', el).forEach(b => (b.onclick = () => patch({ sound: { preset: b.dataset.preset, customPrompt: '' } })));
  $('#customMusic').onchange = e => patch({ sound: { customPrompt: e.target.value } });
  $('#regenMusic') && ($('#regenMusic').onclick = () => run('sound', { items: ['music'], force: true }));
  $$('[data-sfx]', el).forEach(c => (c.onchange = () => patch({ sound: { sfx: { [c.dataset.sfx]: c.checked } } })));
  $$('[data-amb]', el).forEach(c => (c.onchange = () => patch({ sound: { amb: { [c.dataset.amb]: c.checked } } })));
  $$('[data-redo]', el).forEach(b => (b.onclick = () => run('sound', { items: [b.dataset.redo], force: true, music: false })));
  renderJob();
}

boot().catch(e => { $('#main').innerHTML = `<section class="card pad err">${esc(e.message)}</section>`; });
