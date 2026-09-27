// Theme -> screenplay JSON. Encodes the craft rules we learned from The House of Small Cubes.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, extractJson } from '../lib/core.mjs';
import * as providers from '../providers/index.mjs';
import { normalizeFrame, gradeOf, GRADES } from './prompts.mjs';

export const MUSIC = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/presets/music.json'), 'utf8'));
export const STYLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/presets/styles.json'), 'utf8'));
export const TRANSITIONS = ['fade', 'cut', 'bleed', 'knot'];

const RULES = `You are a screenwriter and storyboard artist for short, WORDLESS animated films in the tradition of Kunio Kato's
"The House of Small Cubes" (Oscar 2009). Write for adults who want to reminisce. Your films must:
- Establish the main character's present-day ROUTINE first, before anything happens (who they are, shown not told).
- Show character only through behaviour, gestures and objects. No dialogue, no narration, no on-screen text.
- Have a small, ordinary INCITING ACCIDENT that forces a physical journey which mirrors an emotional one.
- Move through memories (usually in reverse chronology, deepest = earliest). Present day is cool grey-blue; memories are warm and glowing.
- PLANT objects early (e.g. two teacups, one taken) and PAY THEM OFF at the end (the second cup is poured).
- End with a quiet REVEAL or turn that reframes everything, followed by a small gesture of acceptance. Bittersweet, never melodramatic.
- Every shot is a single held illustration that will be animated with gentle image-to-video motion (5-10 s). Keep each shot to ONE clear action.
- Keep everything visually consistent: define each character (and each age they appear at), each recurring PLACE and each hero PROP
  once, with a precise visual description, and list in each shot's "cast" which of them appear (max 3 per shot: usually the
  characters plus the place). Define a colour script in "palette": one light per story world (e.g. today, memory, the reveal).
  Keep screen direction consistent (who is on the left/right).
- Describe each shot with the "frame" template: framing, subject (who is in frame and exactly where), the ONE action, setting
  (place, time of day, weather), light, camera, and motion (only subtle, physically plausible movement: breathing, a hand lifting a
  cup, grass in wind). Keep heads, hands and key objects inside the frame. Never put two copies of the same person in one shot.`;

const SCHEMA = `Return ONLY a JSON object with exactly this shape:
{
  "title": "short evocative title",
  "logline": "one sentence",
  "characters": [
    { "id": "tomas", "name": "Tomas", "kind": "character", "variants": [ { "id": "tomas_old", "look": "precise visual description at this age" } ] },
    { "id": "cottage", "name": "the cottage kitchen", "kind": "place", "variants": [ { "id": "kitchen", "look": "layout, furniture, materials, where the window and door are" } ] },
    { "id": "kite", "name": "the red kite", "kind": "prop", "variants": [ { "id": "kite_patched", "look": "exact design of the object" } ] }
  ],
  "palette": { "cool present": { "grade": "cool", "words": "how today looks" }, "warm memory": { "grade": "warm", "words": "how memories look" } },
  "plants": [ { "object": "two teacups", "setup_shot": "s03", "payoff_shot": "s17" } ],
  "ambience": { "hill_wind": "prompt for a looping ambience bed", "night_room": "..." },
  "shots": [ {
      "id": "s01", "act": 1, "beat": "what happens and why it matters (1 sentence)", "seconds": 6,
      "transition": "fade | cut | bleed | knot", "cast": ["tomas_old"],
      "frame": {
        "framing": "wide | medium | close-up | extreme close-up | over-the-shoulder",
        "subject": "Tomas stands alone at the right third of the frame, facing the sea",
        "action": "he lifts the patched red kite off its hook with both hands",
        "setting": "narrow cottage hallway, grey early morning",
        "light": "cool present | warm memory | golden reveal | night lamplight",
        "camera": "static | slow push-in | slow pull-back | slow pan left | slow pan right | tilt up",
        "motion": "the kite's ribbon tail sways; he breathes slowly"
      },
      "sfx": [ { "prompt": "short sound effect description", "offset": 1.0 } ],
      "ambience": "hill_wind or null"
  } ],
  "music": { "preset": "one preset id", "shape": [ { "from": 0, "to": 28, "mood": "sparse, lonely" }, { "from": 30, "to": 33, "mood": "silence" } ] }
}
Transitions: "fade" soft dissolve; "cut" hard cut for shocks; "bleed" watercolor wash between places/times; "knot" = entering a memory
(use for each shot that begins a memory). The first shot's transition is ignored. Light: "cool present" for today, "warm memory"
for memories, "night lamplight" for night interiors, "golden reveal" for the reveal and the final shots.`;

const EXAMPLE = `EXAMPLE (abridged) of the level expected - "The Long String": a widower's daily ritual with a patched kite; the shelf holds two
teacups and he takes one; the kite crashes and tears (inciting accident, music drops to silence); mending it at night he unwinds the
string and each knot is a memory in reverse (granddaughter, his wife painting while frail, daughter's wedding, daughter on his shoulders,
the young couple building the kite as she secretly paints something inside a fold); he peels back the torn layer and finds her hidden
painting of the two of them OLD, flying this kite (the twist: she planned to grow old with him); at sunset he pours the second cup.`;

export function shotCount(length) { return Math.max(4, Math.round(length / 6)); }

export function messages(p, note) {
  const s = p.settings, style = STYLES.find(x => x.id === s.style) || STYLES[0];
  const user = [
    `THEME: ${p.theme}`,
    `TARGET LENGTH: ${s.length} seconds. SHOT COUNT: ${shotCount(s.length)} (seconds per shot 4-9, sum close to ${s.length}).`,
    `ASPECT: ${s.aspect}. VISUAL STYLE: ${style.name} - ${style.about}`,
    `MUSIC PRESETS (pick one id): ${MUSIC.map(m => `${m.id} (${m.moods.join(', ')})`).join('; ')}`,
    p.story && note ? `CURRENT DRAFT:\n${JSON.stringify(p.story)}\n\nREVISE IT according to this note from the director: ${note}` : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: `${RULES}\n\n${SCHEMA}\n\n${EXAMPLE}` }, { role: 'user', content: user }];
}

// Make whatever the model returned safe for the pipeline.
export function normalize(raw, p) {
  const st = { ...raw };
  st.title = String(st.title || 'Untitled').slice(0, 80);
  st.logline = String(st.logline || '');
  // "characters" holds every reference: characters (per age), places and props.
  st.characters = (st.characters || []).map(c => ({ id: String(c.id), name: String(c.name || c.id),
    kind: ['character', 'place', 'prop'].includes(c.kind) ? c.kind : 'character',
    variants: (c.variants || []).map(v => ({ id: String(v.id), look: String(v.look || '') })) }));
  const variantIds = new Set(st.characters.flatMap(c => c.variants.map(v => v.id)));
  // Per-film colour script: { key: { grade: cool|warm|none, words } }.
  st.palette = Object.fromEntries(Object.entries(st.palette || {}).filter(([, v]) => v && v.words)
    .map(([k, v]) => [String(k), { grade: GRADES.includes(v.grade) ? v.grade : 'none', words: String(v.words) }]));
  st.ambience = Object.fromEntries(Object.entries(st.ambience || {}).map(([k, v]) => [k.replace(/[^\w-]/g, '_'), String(v)]));
  const seen = new Set();
  st.shots = (st.shots || []).map((sh, i) => {
    let id = String(sh.id || `s${String(i + 1).padStart(2, '0')}`).replace(/[^\w-]/g, '_');
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const amb = sh.ambience ? String(sh.ambience).replace(/[^\w-]/g, '_') : null;
    const shot = {
      id, act: Number(sh.act) || 1, beat: String(sh.beat || ''),
      seconds: Math.min(10, Math.max(3, Number(sh.seconds) || 6)),
      transition: TRANSITIONS.includes(sh.transition) ? sh.transition : 'fade',
      cast: (sh.cast || []).map(String).filter(v => variantIds.has(v)).slice(0, 3),
      frame: normalizeFrame(sh.frame, sh, st.palette),   // old free-text shots are migrated into the template
      // Shots written before templates existed keep their exact old prompts as overrides.
      override: { still: String(sh.override?.still || (!sh.frame && sh.still_prompt) || ''), motion: String(sh.override?.motion || (!sh.frame && sh.motion_prompt) || '') },
      sfx: (sh.sfx || []).slice(0, 3).map(x => ({ prompt: String(x.prompt || x), offset: Math.max(0, Number(x.offset) || 0) })),
      ambience: amb && st.ambience[amb] ? amb : null,
    };
    shot.grade = gradeOf(shot, st.palette);   // derived from light; the engine uses it for the cool/warm look
    return shot;
  });
  if (!st.shots.length) throw new Error('The writer returned no shots. Try again or pick another writer model.');
  st.music = { preset: MUSIC.some(m => m.id === st.music?.preset) ? st.music.preset : MUSIC[0].id,
    prompt: String(st.music?.prompt || ''),   // a screenplay can specify its own score description
    shape: Array.isArray(st.music?.shape) ? st.music.shape.map(x => ({ from: +x.from || 0, to: +x.to || 0, mood: String(x.mood || '') })) : [] };
  st.plants = (st.plants || []).map(x => ({ object: String(x.object || ''), setup_shot: String(x.setup_shot || ''), payoff_shot: String(x.payoff_shot || '') }));
  return st;
}

export async function write(p, note) {
  const r = await providers.chat(p.settings, messages(p, note), true);
  return { story: normalize(extractJson(r.text), p), usd: r.usd };
}
