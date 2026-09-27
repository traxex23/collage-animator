// One background job per project at a time; progress is broadcast to SSE listeners.
import { update } from './projects.mjs';

const running = new Map();      // slug -> { stage, done, total, msg }
const listeners = new Map();    // slug -> Set<res>

export function subscribe(slug, res) {
  if (!listeners.has(slug)) listeners.set(slug, new Set());
  listeners.get(slug).add(res);
  res.on('close', () => listeners.get(slug)?.delete(res));
  if (running.has(slug)) send(slug, { type: 'progress', ...running.get(slug) });
}

export function send(slug, event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of listeners.get(slug) || []) res.write(data);
}

export const status = slug => running.get(slug) || null;

export function start(slug, stage, fn) {
  if (running.has(slug)) throw Object.assign(new Error(`Already running: ${running.get(slug).stage}`), { status: 409 });
  const state = { stage, done: 0, total: 0, msg: 'Starting…' };
  running.set(slug, state);
  update(slug, p => { p.stages[stage] = { ...p.stages[stage], status: 'running', error: null }; });
  send(slug, { type: 'progress', ...state });

  const progress = (patch) => { Object.assign(state, patch); send(slug, { type: 'progress', ...state }); };
  const item = (id) => send(slug, { type: 'item', stage, id });   // tells the UI to refresh one card

  (async () => {
    try {
      await fn({ progress, item });
      update(slug, p => { p.stages[stage].status = 'done'; });
      send(slug, { type: 'done', stage });
    } catch (e) {
      console.error(`[${slug}] ${stage} failed:`, e);
      update(slug, p => { p.stages[stage].status = 'error'; p.stages[stage].error = e.message; });
      send(slug, { type: 'error', stage, message: e.message });
    } finally {
      running.delete(slug);
    }
  })();
}

// Run async tasks with limited concurrency; one failure doesn't stop the others.
export async function pool(items, limit, worker) {
  const errors = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const it = items[i++];
      try { await worker(it); } catch (e) { errors.push(`${it.id || it}: ${e.message}`); }
    }
  }));
  if (errors.length) throw new Error(errors.join('\n'));
}
