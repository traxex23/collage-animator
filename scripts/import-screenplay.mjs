// Create a film from a hand-written screenplay JSON.
// Usage: node scripts/import-screenplay.mjs story/your-move.json "<theme>" [story/your-move.settings.json]
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:5177/api';
const [file, theme, settingsFile] = process.argv.slice(2);
const settingsJson = settingsFile ? fs.readFileSync(settingsFile, 'utf8') : '{}';
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};
const story = JSON.parse(fs.readFileSync(file, 'utf8'));
const p = await api('/projects', { theme, settings: JSON.parse(settingsJson) });
const q = await api(`/projects/${p.slug}`, { story }, 'PATCH');
console.log('slug:', q.slug);
console.log('shots:', q.story.shots.length, '| duration:', q.view.layout.duration, 's | references:', q.view.cast.length);
console.log('lights:', q.view.lights.join(', '));
console.log('cost plan:', JSON.stringify(q.view.plan.rows), '| remaining $' + q.view.plan.remaining);
console.log('next:', q.view.next.plan.text);
