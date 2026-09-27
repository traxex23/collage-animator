// Shared paths, .env loading, small helpers.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PROJECTS = path.join(ROOT, 'projects');
export const PORT = Number(process.env.PORT || 5177);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(PROJECTS, { recursive: true });

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}
export const env = { ...loadEnv(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.endsWith('_API_KEY'))) };
export const hasKey = name => Boolean(env[name]);

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
    err ? reject(new Error(`${cmd} failed: ${stderr || err.message}`.slice(0, 1500))) : resolve(stdout.toString())));
}
export const ffmpeg = args => run('ffmpeg', ['-v', 'error', '-y', ...args]);
export async function probeDuration(file) {
  return Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim());
}

export function slugify(s) {
  return (s || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'film';
}

// Pull the first JSON object out of an LLM reply (tolerates ```json fences and chatter).
export function extractJson(text) {
  const t = String(text).replace(/```(?:json)?/g, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('No JSON in model reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('Unterminated JSON in model reply');
}

export const fileToDataUrl = (file, mime = 'image/png') => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
export const mimeOf = f => f.endsWith('.jpg') || f.endsWith('.jpeg') ? 'image/jpeg' : f.endsWith('.webp') ? 'image/webp' : 'image/png';
