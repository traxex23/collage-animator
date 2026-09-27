// Collage Animator UI: vanilla JS, one page. Server does all the work; this renders state and sends actions.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => `$${(n || 0).toFixed(2)}`;

const STAGES = [
  ['story', 'Story'], ['cast', 'Characters'], ['stills', 'Stills'], ['clips', 'Clips'], ['sound', 'Sound'], ['final', 'Final'],
];
const S = { projects: [], p: null, stage: 'story', catalog: null, presets: null, events: null, est: {}, openEditor: null };

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function toast(msg, ms = 4000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
const fileUrl = (rel, v) => `/projects/${encodeURIComponent(S.p.slug)}/${rel}?v=${Math.round(v || 0)}`;

// ---------------- boot ----------------
async function boot() {
  [S.presets, S.projects] = await Promise.all([api('/presets'), api('/projects')]);
  api('/catalog').then(c => { S.catalog = c; renderKeys(); if (!location.hash.slice(1)) renderNew(); }).catch(e => toast(e.message));
  $('#newBtn').onclick = () => { location.hash = ''; };
  window.onhashchange = route;
  route();
}
async function route() {
  const [slug, stage] = location.hash.slice(1).split('/');
  if (!slug) { S.p = null; S.events?.close(); renderSide(); renderNew(); return; }
  if (S.p?.slug !== slug) listen(slug);
  S.p = await api(`/projects/${slug}`);   // always fresh: jobs may have finished while you were elsewhere
  S.est = {};
  S.projects = await api('/projects');
  S.stage = stage || firstOpenStage();
  renderSide(); render();
}
const firstOpenStage = () => (STAGES.find(([k]) => !S.p.stages[k].approved) || ['final'])[0];
const go = stage => { location.hash = `${S.p.slug}/${stage}`; };

function listen(slug) {
  S.events?.close();
  S.events = new EventSource(`/api/projects/${slug}/events`);
  let t;
  const refresh = () => { clearTimeout(t); t = setTimeout(reload, 350); };
  S.events.onmessage = e => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'progress') { S.p.view.job = ev; renderProgress(); }
    if (ev.type === 'item') refresh();
    if (ev.type === 'done') { S.p.view.job = null; toast(`${ev.stage} finished`); reload(); }
    if (ev.type === 'error') { S.p.view.job = null; toast(`${ev.stage} failed: ${ev.message}`, 9000); reload(); }
  };
}
async function reload() { if (!S.p) return; S.p = await api(`/projects/${S.p.slug}`); S.est = {}; render(); }

async function action(fn, okMsg) {
  try { const r = await fn(); if (r?.slug) { S.p = r; render(); } if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, 8000); }
}
const run = (stage, body = {}) => action(async () => { await api(`/projects/${S.p.slug}/run/${stage}`, { method: 'POST', body }); S.p.view.job = { stage, msg: 'Starting…' }; renderProgress(); });
const patch = body => action(() => api(`/projects/${S.p.slug}`, { method: 'PATCH', body }));
const approve = (stage, approved = true) => action(async () => {
  S.p = await api(`/projects/${S.p.slug}/approve/${stage}`, { method: 'POST', body: { approved } });
  if (approved) { const i = STAGES.findIndex(([k]) => k === stage); go(STAGES[Math.min(i + 1, STAGES.length - 1)][0]); } else render();
});

// ---------------- sidebar ----------------
function renderSide() {
  $('#projects').innerHTML = S.projects.map(x => `<a href="#${x.slug}" class="${S.p?.slug === x.slug ? 'on' : ''}">${esc(x.title)}
    <small>${x.mock ? 'test mode · ' : ''}${x.stage === 'done' ? 'finished' : 'next: ' + x.stage}</small></a>`).join('') || '<div class="muted">No films yet.</div>';
}
function renderKeys() {
  const k = S.catalog?.keys || {};
  $('#keys').innerHTML = `<div><span class="dot ${k.venice ? 'ok' : ''}"></span>Venice key</div><div><span class="dot ${k.xai ? 'ok' : ''}"></span>xAI key</div>
    ${S.catalog?.errors?.length ? `<div title="${esc(S.catalog.errors.join('\n'))}">⚠ some model lists failed</div>` : ''}`;
}

// ---------------- new film ----------------
function modelOptions(list, sel) { return (list || []).map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join(''); }
function priceNote(list, id, res) { const m = (list || []).find(x => x.id === id); const u = m?.price?.[res]?.usd ?? m?.price?.['1K']?.usd; return u != null ? `~${money(u)} / image` : ''; }

function providerFields(s) {
  const c = S.catalog || { writer: {}, image: {}, imageEdit: {}, video: {}, keys: {} };
  const wp = s.writer.provider, ip = s.image.provider;
  const writerList = c.writer[wp] || [];
  if (!s.writer.model && writerList.length) s.writer.model = wp === 'venice' ? (writerList.find(m => /claude-opus-5-5/.test(m.id)) || writerList[0]).id : writerList[0].id;
  return `
  <div class="row2">
    <div><label>Writer AI</label><div class="row2">
      <select data-k="writer.provider">${['xai', 'venice'].map(x => `<option ${x === wp ? 'selected' : ''} value="${x}">${x === 'xai' ? 'xAI (Grok)' : 'Venice'}</option>`).join('')}</select>
      <select data-k="writer.model">${modelOptions(writerList, s.writer.model)}</select></div></div>
    <div><label>Image provider & model <span class="est">${priceNote(c.imageEdit[ip], s.image.editModel, s.image.res)}</span></label><div class="row3">
      <select data-k="image.provider">${['venice', 'xai'].map(x => `<option ${x === ip ? 'selected' : ''} value="${x}">${x === 'xai' ? 'xAI (Grok)' : 'Venice'}</option>`).join('')}</select>
      <select data-k="image.model" title="text-to-image (character sheets)">${modelOptions(c.image[ip], s.image.model)}</select>
      <select data-k="image.editModel" title="image+references (stills, fixes)">${modelOptions(c.imageEdit[ip], s.image.editModel)}</select></div></div>
  </div>
  <div class="row4" style="margin-top:12px">
    <div><label>Image resolution</label><select data-k="image.res">${['1K', '2K', '4K'].map(r => `<option ${r === s.image.res ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div><label>Video model</label><select data-k="video.model">${modelOptions(c.video.xai, s.video.model)}</select></div>
    <div><label>Video resolution</label><select data-k="video.res">${['480p', '720p'].map(r => `<option ${r === s.video.res ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div><label>Budget cap (USD)</label><input type="number" min="0" step="1" data-k="budget" value="${s.budget}"></div>
  </div>`;
}
function bindFields(root, s, onChange) {
  root.querySelectorAll('[data-k]').forEach(el => {
    el.onchange = () => {
      const path = el.dataset.k.split('.'), v = el.type === 'number' ? Number(el.value) : el.type === 'checkbox' ? el.checked : el.value;
      let o = s; for (const k of path.slice(0, -1)) o = o[k]; o[path.at(-1)] = v;
      if (el.dataset.k === 'writer.provider') s.writer.model = '';
      if (el.dataset.k === 'image.provider') {
        const c = S.catalog; s.image.model = c.image[v]?.find(m => /nano-banana-2$|grok-imagine-image-quality/.test(m.id))?.id || c.image[v]?.[0]?.id || '';
        s.image.editModel = c.imageEdit[v]?.find(m => /nano-banana-2-edit|grok-imagine-image-quality/.test(m.id))?.id || c.imageEdit[v]?.[0]?.id || '';
      }
      onChange();
    };
  });
}

function renderNew() {
  S.est = {};
  const s = S.newSettings ||= structuredClone(S.presets.defaults);
  const main = $('#main');
  main.innerHTML = `
  <div class="top"><h1>New film</h1></div>
  <div class="panel stack">
    <div><label>What is your film about?</label>
      <textarea id="theme" rows="3" placeholder="e.g. An old lighthouse keeper who writes a letter to the sea every night after his wife is lost at sea…">${esc(S.newTheme || '')}</textarea></div>
    <div class="row3">
      <div><label>Length</label><select data-k="length">${[30, 60, 90, 120].map(n => `<option value="${n}" ${n == s.length ? 'selected' : ''}>${n} seconds</option>`).join('')}</select></div>
      <div><label>Format</label><select data-k="aspect">${[['16:9', '16:9 landscape (YouTube)'], ['9:16', '9:16 vertical (Reels/TikTok)']].map(([v, l]) => `<option value="${v}" ${v === s.aspect ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><label style="display:flex;gap:8px;align-items:center;color:inherit;font-size:14px"><input type="checkbox" data-k="mock" ${s.mock ? 'checked' : ''}> Test mode ($0, placeholder art)</label></div>
    </div>
    <div><label>Visual style</label><div class="styles">${S.presets.styles.map(x => `<button class="style-opt ${x.id === s.style ? 'on' : ''}" data-style="${x.id}"><b>${esc(x.name)}</b><small>${esc(x.about)}</small></button>`).join('')}</div></div>
    ${S.catalog ? providerFields(s) : '<div class="muted">Loading model lists…</div>'}
    <div class="bar"><span class="spacer"></span><button class="primary" id="create">Create film</button></div>
  </div>`;
  $('#theme').oninput = e => (S.newTheme = e.target.value);
  main.querySelectorAll('[data-style]').forEach(b => (b.onclick = () => { s.style = b.dataset.style; renderNew(); }));
  bindFields(main, s, renderNew);
  $('#create').onclick = async () => {
    const r = await action(() => api('/projects', { method: 'POST', body: { theme: $('#theme').value, settings: s } }));
    if (r) { S.newTheme = ''; S.projects = await api('/projects'); location.hash = `${r.slug}/story`; }
  };
}

// ---------------- project view ----------------
function render() {
  const p = S.p, v = p.view;
  $('#main').innerHTML = `
  <div class="top">
    <h1>${esc(p.story?.title || 'Untitled film')}</h1>
    ${p.settings.mock ? '<span class="chip mock">test mode · $0</span>' : ''}
    <span class="spacer"></span>
    <span class="chip" title="${esc(Object.entries(v.costs.byProvider).map(([k, x]) => `${k}: ${money(x)}`).join('\n'))}">spent ${money(v.costs.total)} of ${money(p.settings.budget)}</span>
    <button class="small" id="settingsBtn">Settings</button>
  </div>
  <div class="steps">${STAGES.map(([k, l]) => `<button data-go="${k}" class="${S.stage === k ? 'on' : ''}">${l}${p.stages[k].approved ? '<span class="tick">✓</span>' : ''}</button>`).join('')}</div>
  <div id="progress"></div>
  <div id="stage"></div>`;
  $('#main').querySelectorAll('[data-go]').forEach(b => (b.onclick = () => go(b.dataset.go)));
  $('#settingsBtn').onclick = renderSettings;
  renderProgress();
  ({ story: renderStory, cast: renderCast, stills: renderStills, clips: renderClips, sound: renderSound, final: renderFinal })[S.stage]($('#stage'));
}

function renderProgress() {
  const el = $('#progress'); if (!el) return;
  const j = S.p.view.job, err = S.p.stages[S.stage]?.status === 'error' ? S.p.stages[S.stage].error : null;
  el.innerHTML = j ? `<div class="progress"><b>${esc(j.stage)}</b> · ${esc(j.msg || '')} ${j.total ? `(${j.done}/${j.total})` : ''}
      <div class="track"><div class="fill" style="width:${j.total ? (100 * j.done / j.total) : 8}%"></div></div></div>`
    : err ? `<div class="panel error">Last run failed:\n${esc(err)}</div>` : '';
  document.querySelectorAll('[data-needs-idle]').forEach(b => (b.disabled = Boolean(j)));
}

async function estimateInto(stage, el) {
  if (!el) return;
  try { const e = S.est[stage] ||= await api(`/projects/${S.p.slug}/estimate/${stage}`); el.textContent = `${e.note} · est. ${money(e.usd)}`; }
  catch { el.textContent = ''; }
}

function stageBar(stage, { runLabel, canApprove = true, extra = '' }) {
  const approved = S.p.stages[stage].approved;
  return `<div class="bar">
    ${runLabel ? `<button class="primary" data-needs-idle data-run="${stage}">${runLabel}</button><span class="est" data-est="${stage}"></span>` : ''}
    ${extra}<span class="spacer"></span>
    ${approved ? `<span class="chip">approved ✓</span><button class="small ghost" data-unapprove="${stage}">Reopen</button>`
      : `<button data-approve="${stage}" ${canApprove ? '' : 'disabled'}>Approve & continue →</button>`}
  </div>`;
}
function bindStageBar(el, stage, runBody = () => ({})) {
  el.querySelectorAll(`[data-run="${stage}"]`).forEach(b => (b.onclick = () => run(stage, runBody())));
  el.querySelectorAll('[data-approve]').forEach(b => (b.onclick = () => approve(b.dataset.approve)));
  el.querySelectorAll('[data-unapprove]').forEach(b => (b.onclick = () => approve(b.dataset.unapprove, false)));
  estimateInto(stage, el.querySelector(`[data-est="${stage}"]`));
  renderProgress();
}

// ---------------- story ----------------
function renderStory(el) {
  const st = S.p.story, v = S.p.view;
  if (!st) {
    el.innerHTML = `<div class="panel empty"><h2>${esc(S.p.theme)}</h2><p>The writer will turn this into a wordless screenplay: routine, an inciting accident,
      memories, planted objects that pay off, and a quiet reveal.</p>${stageBar('story', { runLabel: 'Write the screenplay', canApprove: false })}</div>`;
    return bindStageBar(el, 'story');
  }
  const variants = st.characters.flatMap(c => c.variants.map(x => x.id));
  el.innerHTML = `
  <div class="panel">
    ${stageBar('story', { runLabel: 'Rewrite', extra: '<input type="text" id="note" placeholder="Note for the rewrite (e.g. make the twist stronger, add a dog)" style="max-width:420px">' })}
    <p><i>${esc(st.logline)}</i></p>
    <p class="muted">${st.shots.length} shots · ${v.layout.duration.toFixed(0)}s with end card · music: ${esc(st.music.preset)}</p>
    ${st.plants.length ? `<p><b>Planted → paid off:</b> ${st.plants.map(x => `${esc(x.object)} (${esc(x.setup_shot)} → ${esc(x.payoff_shot)})`).join(' · ')}</p>` : ''}
    <p><b>Characters:</b> ${st.characters.map(c => `${esc(c.name)}: ${c.variants.map(x => `<span class="tag">${esc(x.id)}</span> ${esc(x.look)}`).join('; ')}`).join('<br>')}</p>
  </div>
  ${st.shots.map(s => `
  <div class="shot" data-shot="${s.id}">
    <header><b>${esc(s.id)}</b><span class="tag">act ${s.act}</span><span class="tag ${s.grade}">${s.grade}</span>
      <select data-f="transition" style="width:auto">${['fade', 'cut', 'bleed', 'knot'].map(t => `<option ${t === s.transition ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select data-f="grade" style="width:auto">${['cool', 'warm', 'none'].map(t => `<option ${t === s.grade ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="number" data-f="seconds" value="${s.seconds}" min="3" max="10" step="0.5" style="width:70px"> s
      <span class="muted">cast: ${s.cast.map(esc).join(', ') || '—'}</span></header>
    <div class="row2">
      <div><label>Beat</label><textarea data-f="beat">${esc(s.beat)}</textarea></div>
      <div><label>Motion</label><textarea data-f="motion_prompt">${esc(s.motion_prompt)}</textarea></div>
    </div>
    <div style="margin-top:8px"><label>Still prompt</label><textarea data-f="still_prompt">${esc(s.still_prompt)}</textarea></div>
  </div>`).join('')}`;
  el.querySelectorAll('[data-shot]').forEach(card => card.querySelectorAll('[data-f]').forEach(f => (f.onchange = () =>
    patch({ shot: { id: card.dataset.shot, [f.dataset.f]: f.type === 'number' ? Number(f.value) : f.value } }))));
  bindStageBar(el, 'story', () => ({ note: $('#note')?.value || '' }));
}

// ---------------- cast ----------------
function renderCast(el) {
  const st = S.p.story; if (!st) return (el.innerHTML = '<div class="panel empty">Write the story first.</div>');
  const files = Object.fromEntries(S.p.view.cast.map(c => [c.id, c.file]));
  const all = st.characters.flatMap(c => c.variants.map(x => ({ ...x, name: c.name })));
  el.innerHTML = `<div class="panel">${stageBar('cast', { runLabel: 'Draw missing sheets', canApprove: all.every(x => files[x.id]) })}
    <p class="muted">Each character (at each age) gets one reference sheet. Every still is painted from these, so faces and clothes stay consistent.</p></div>
  <div class="grid">${all.map(x => `<div class="card"><div class="media">${files[x.id] ? `<img src="${fileUrl(`cast/${x.id}.png`, files[x.id])}">` : 'not drawn yet'}</div>
    <div class="body"><b>${esc(x.name)}</b> <span class="tag">${esc(x.id)}</span><textarea data-look="${x.id}">${esc(x.look)}</textarea>
    <div class="actions"><button class="small" data-needs-idle data-regen="${x.id}">${files[x.id] ? 'Redraw' : 'Draw'}</button></div></div></div>`).join('')}</div>`;
  el.querySelectorAll('[data-look]').forEach(t => (t.onchange = () => {
    const chars = structuredClone(st.characters);
    for (const c of chars) for (const x of c.variants) if (x.id === t.dataset.look) x.look = t.value;
    patch({ story: { characters: chars } });
  }));
  el.querySelectorAll('[data-regen]').forEach(b => (b.onclick = () => run('cast', { items: [b.dataset.regen], force: true })));
  bindStageBar(el, 'cast');
}

// ---------------- stills ----------------
function renderStills(el) {
  const shots = S.p.view.shots; if (!shots.length) return (el.innerHTML = '<div class="panel empty">Write the story first.</div>');
  const vertical = S.p.settings.aspect === '9:16';
  el.innerHTML = `<div class="panel">${stageBar('stills', { runLabel: 'Paint missing stills', canApprove: shots.every(s => s.still) })}
    <p class="muted">Check each still for wrong anatomy, duplicate people, or heads and hands out of frame. Use <b>Fix</b> for small corrections (cheap) or <b>Repaint</b> to start over.</p></div>
  <div class="grid ${vertical ? 'vertical' : ''}">${shots.map(s => `<div class="card" data-shot="${s.id}">
    <div class="media">${s.still ? `<img src="${fileUrl(`stills/${s.id}.png`, s.still)}" loading="lazy">` : 'not painted yet'}</div>
    <div class="body"><div><b>${esc(s.id)}</b> <span class="tag ${s.grade}">${s.grade}</span> <span class="muted">${esc(s.beat)}</span></div>
      ${S.openEditor === s.id ? `<textarea data-prompt>${esc(s.still_prompt)}</textarea>` : ''}
      <input type="text" data-fix placeholder="Fix: e.g. only one headboard on the bed" ${s.still ? '' : 'disabled'}>
      <div class="actions">
        <button class="small" data-needs-idle data-act="fix" ${s.still ? '' : 'disabled'}>Fix</button>
        <button class="small" data-needs-idle data-act="repaint">${s.still ? 'Repaint' : 'Paint'}</button>
        <button class="small ghost" data-act="edit">${S.openEditor === s.id ? 'Save prompt' : 'Edit prompt'}</button>
        ${s.stillPrev ? '<button class="small ghost" data-act="undo">Undo</button>' : ''}
      </div></div></div>`).join('')}</div>`;
  el.querySelectorAll('[data-shot]').forEach(card => {
    const id = card.dataset.shot;
    card.querySelectorAll('[data-act]').forEach(b => (b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'repaint') run('stills', { items: [id], force: true });
      if (a === 'fix') { const t = $('[data-fix]', card).value.trim(); if (!t) return toast('Describe what to fix first'); run('fix', { id, instruction: t }); }
      if (a === 'edit') { if (S.openEditor === id) { await patch({ shot: { id, still_prompt: $('[data-prompt]', card).value } }); S.openEditor = null; } else S.openEditor = id; render(); }
      if (a === 'undo') action(() => api(`/projects/${S.p.slug}/undo`, { method: 'POST', body: { kind: 'still', id } }), 'Restored previous version');
    }));
  });
  bindStageBar(el, 'stills');
}

// ---------------- clips ----------------
function renderClips(el) {
  const shots = S.p.view.shots; if (!shots.length) return (el.innerHTML = '<div class="panel empty">Write the story first.</div>');
  const vertical = S.p.settings.aspect === '9:16';
  el.innerHTML = `<div class="panel">${stageBar('clips', { runLabel: 'Animate missing clips', canApprove: true })}
    <p class="muted">Each still becomes a ${S.p.settings.video.model} clip. Watch for warped faces or hands; regenerate only the bad ones.
    Shots without a clip will appear as still paintings in the final film.</p></div>
  <div class="grid ${vertical ? 'vertical' : ''}">${shots.map(s => `<div class="card" data-shot="${s.id}">
    <div class="media">${s.clip ? `<video src="${fileUrl(`clips/${s.id}.mp4`, s.clip)}" muted loop playsinline preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()" controls></video>`
      : s.still ? `<img src="${fileUrl(`stills/${s.id}.png`, s.still)}" style="opacity:.55">` : 'no still yet'}</div>
    ${s.clip ? `<img class="qa" src="${fileUrl(`qa/${s.id}.jpg`, s.clip)}" title="QA: first, 1/3, 2/3, last frame">` : ''}
    <div class="body"><div><b>${esc(s.id)}</b> <span class="muted">${esc(s.motion_prompt)}</span></div>
      ${s.clip && s.still > s.clip ? '<div class="est" style="color:var(--warn)">Still changed after this clip. Regenerate to match.</div>' : ''}
      <div class="actions"><button class="small" data-needs-idle data-act="regen" ${s.still ? '' : 'disabled'}>${s.clip ? 'Regenerate' : 'Animate'} (${s.clipSeconds}s)</button>
      ${s.clip ? '<button class="small ghost" data-act="undo">Undo</button>' : ''}</div></div></div>`).join('')}</div>`;
  el.querySelectorAll('[data-shot]').forEach(card => card.querySelectorAll('[data-act]').forEach(b => (b.onclick = () => {
    const id = card.dataset.shot;
    if (b.dataset.act === 'regen') run('clips', { items: [id], force: true });
    else action(() => api(`/projects/${S.p.slug}/undo`, { method: 'POST', body: { kind: 'clip', id } }), 'Restored previous clip');
  })));
  bindStageBar(el, 'clips');
}

// ---------------- sound ----------------
function renderSound(el) {
  const p = S.p, snd = p.view.sound; if (!p.story) return (el.innerHTML = '<div class="panel empty">Write the story first.</div>');
  const presets = S.presets.music, recs = p.sound.recs || [];
  const shown = recs.length ? recs.map(r => ({ ...presets.find(m => m.id === r.preset), why: r.why })) : presets.map(m => ({ ...m, why: m.about }));
  el.innerHTML = `
  <div class="panel">${stageBar('sound', { runLabel: 'Generate score & sounds', canApprove: Boolean(snd.music),
      extra: `<button data-needs-idle id="recBtn">${recs.length ? 'Recommend again' : 'Get recommendations'}</button>` })}
    <h3>Music ${recs.length ? '<span class="muted" style="font-size:13px">(recommended for your story)</span>' : ''}</h3>
    <div class="grid" style="margin-top:10px">${shown.map(m => `<button class="rec ${p.sound.preset === m.id ? 'on' : ''}" data-preset="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.why)}</small></button>`).join('')}</div>
    ${recs.length ? `<details style="margin-top:10px"><summary class="muted">All presets</summary><div class="grid" style="margin-top:10px">${presets.filter(m => !recs.some(r => r.preset === m.id)).map(m => `<button class="rec ${p.sound.preset === m.id ? 'on' : ''}" data-preset="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.about)}</small></button>`).join('')}</div></details>` : ''}
    <div style="margin-top:12px"><label>Or describe your own music (overrides the preset)</label><textarea id="customMusic" placeholder="e.g. a lone harmonica and soft rain">${esc(p.sound.customPrompt || '')}</textarea></div>
    <div class="bar" style="margin-top:10px">${snd.music ? `<audio controls src="${fileUrl('audio/music.mp3', snd.music)}"></audio>
      <span class="muted">${p.sound.musicSeconds ? p.sound.musicSeconds.toFixed(0) + 's' : ''} (film is ${p.view.layout.duration.toFixed(0)}s)</span>
      <button class="small" data-needs-idle id="regenMusic">Regenerate score</button>` : '<span class="muted">No score yet.</span>'}</div>
  </div>
  <div class="panel"><h3>Sound effects</h3><p class="muted">Suggested from the screenplay. Untick anything you don't want.</p>
    <table class="sfx">${snd.sfx.map(x => `<tr><td><input type="checkbox" data-sfx="${x.key}" ${x.on ? 'checked' : ''}></td><td class="muted">${esc(x.shot)} +${x.offset}s</td>
      <td>${esc(x.prompt)}</td><td>${x.file ? `<audio controls src="${fileUrl(`audio/sfx_${x.key}.mp3`, x.file)}"></audio>` : ''}</td>
      <td>${x.file ? `<button class="small" data-needs-idle data-regen-sfx="${x.key}">Redo</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">None suggested.</td></tr>'}</table>
    <h3 style="margin-top:16px">Ambience beds</h3>
    <table class="sfx">${snd.amb.map(x => `<tr><td><input type="checkbox" data-amb="${x.key}" ${x.on ? 'checked' : ''}></td><td class="muted">${esc(x.shots.join(', '))}</td>
      <td>${esc(x.prompt)}</td><td>${x.file ? `<audio controls src="${fileUrl(`audio/amb_${x.key}.mp3`, x.file)}"></audio>` : ''}</td>
      <td>${x.file ? `<button class="small" data-needs-idle data-regen-sfx="${x.key}">Redo</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">None suggested.</td></tr>'}</table>
  </div>`;
  el.querySelectorAll('[data-preset]').forEach(b => (b.onclick = () => patch({ sound: { preset: b.dataset.preset } })));
  $('#customMusic').onchange = e => patch({ sound: { customPrompt: e.target.value } });
  $('#recBtn').onclick = () => run('recommend');
  $('#regenMusic') && ($('#regenMusic').onclick = () => run('sound', { items: ['music'], force: true }));
  el.querySelectorAll('[data-sfx]').forEach(c => (c.onchange = () => patch({ sound: { sfx: { [c.dataset.sfx]: c.checked } } })));
  el.querySelectorAll('[data-amb]').forEach(c => (c.onchange = () => patch({ sound: { amb: { [c.dataset.amb]: c.checked } } })));
  el.querySelectorAll('[data-regen-sfx]').forEach(b => (b.onclick = () => run('sound', { items: [b.dataset.regenSfx], force: true, music: false })));
  bindStageBar(el, 'sound');
}

// ---------------- final ----------------
function renderFinal(el) {
  const p = S.p, v = p.view; if (!p.story) return (el.innerHTML = '<div class="panel empty">Write the story first.</div>');
  const missingClips = v.shots.filter(s => !s.clip).length, missingStills = v.shots.filter(s => !s.still).length;
  el.innerHTML = `<div class="panel final">
    <div class="bar"><button class="primary" data-needs-idle id="renderBtn" ${missingStills ? 'disabled' : ''}>${v.final.share ? 'Render again' : 'Render film'}</button>
      <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="fresh"> from scratch</label>
      <a href="/engine/?project=${encodeURIComponent(p.slug)}" target="_blank" class="muted">open live preview ↗</a>
      <span class="spacer"></span><span class="muted">Rendering is local and free · about ${Math.round(v.layout.duration * 3 / 60)} min</span></div>
    ${missingStills ? `<p class="error">${missingStills} shot(s) have no still yet.</p>` : missingClips ? `<p class="muted">${missingClips} shot(s) have no clip and will show as still paintings.</p>` : ''}
    ${!v.sound.music ? '<p class="muted">No score yet. The film will be silent apart from any sound effects.</p>' : ''}
    ${v.final.share ? `<video controls src="${fileUrl('out/share.mp4', v.final.share)}"></video>
      <p><a href="${fileUrl('out/share.mp4', v.final.share)}" download="${esc(p.slug)}.mp4">Download share copy</a> ·
      <a href="${fileUrl('out/final.mp4', v.final.final)}" download="${esc(p.slug)}-full.mp4">Download full quality</a></p>
      <p class="muted">Files: projects/${esc(p.slug)}/out/share.mp4 and final.mp4</p>` : ''}
    <h3>Cost</h3><p>${Object.entries(v.costs.byProvider).map(([k, x]) => `${esc(k)}: <b>${money(x)}</b>`).join(' · ') || '$0'} · total <b>${money(v.costs.total)}</b>
      <span class="muted">(xAI figures are provider-reported; Venice figures are list-price estimates)</span></p>
  </div>`;
  $('#renderBtn').onclick = () => run('final', { fresh: $('#fresh').checked });
  renderProgress();
}

// ---------------- settings ----------------
function renderSettings() {
  const s = structuredClone(S.p.settings);
  const el = $('#stage');
  const draw = () => {
    el.innerHTML = `<div class="panel stack"><h2>Settings</h2>
      <p class="muted">Changes apply to the next generation; existing stills and clips are kept.</p>
      ${providerFields(s)}
      <label style="display:flex;gap:8px;align-items:center;color:inherit;font-size:14px"><input type="checkbox" data-k="mock" ${s.mock ? 'checked' : ''}> Test mode ($0, placeholder art)</label>
      <div class="bar"><button id="cancelSet">Cancel</button><span class="spacer"></span><button class="primary" id="saveSet">Save settings</button></div></div>`;
    bindFields(el, s, draw);
    $('#cancelSet').onclick = render;
    $('#saveSet').onclick = async () => { await patch({ settings: s }); toast('Settings saved'); };
  };
  draw();
}

boot().catch(e => { $('#main').innerHTML = `<div class="panel error">${esc(e.message)}</div>`; });
