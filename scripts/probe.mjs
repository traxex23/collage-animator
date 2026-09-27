// Lists which image / voice models each API key can access. Never prints the keys.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

async function get(label, url, key) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const body = await r.text();
    if (!r.ok) return console.log(`${label}: HTTP ${r.status} ${body.slice(0, 200)}`);
    const j = JSON.parse(body);
    const ids = (j.data || j.models || []).map(m => m.id || m.name);
    console.log(`${label}: ${ids.length} models\n  ${ids.join('\n  ')}`);
  } catch (e) {
    console.log(`${label}: ${e.message}`);
  }
}

if (env.XAI_API_KEY) {
  await get('xAI all', 'https://api.x.ai/v1/models', env.XAI_API_KEY);
  await get('xAI image', 'https://api.x.ai/v1/image-generation-models', env.XAI_API_KEY);
}
if (env.VENICE_API_KEY) {
  await get('Venice image', 'https://api.venice.ai/api/v1/models?type=image', env.VENICE_API_KEY);
  await get('Venice tts', 'https://api.venice.ai/api/v1/models?type=tts', env.VENICE_API_KEY);
  await get('Venice music', 'https://api.venice.ai/api/v1/models?type=music', env.VENICE_API_KEY);
}
