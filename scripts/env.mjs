import fs from 'node:fs';

export const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

export const VENICE = 'https://api.venice.ai/api/v1';

export async function venice(path, body, { raw = false } = {}) {
  const r = await fetch(VENICE + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env.VENICE_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  if (raw) return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type'), headers: r.headers };
  return r.json();
}
