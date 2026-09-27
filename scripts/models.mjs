// Prints the full spec (incl. pricing) for selected Venice models.
import { venice } from './env.mjs';

const want = new Set(process.argv.slice(2));
for (const type of ['image', 'tts', 'music', 'upscale', 'inpaint']) {
  try {
    const j = await venice(`/models?type=${type}`);
    for (const m of j.data) if (want.has(m.id)) console.log(type, JSON.stringify(m, null, 1).slice(0, 2500), '\n');
  } catch (e) { console.log(type, e.message); }
}
