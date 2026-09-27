// "Your Move" revision 2: stronger build-up, a clear death, longer memories, slower pacing.
// Rewrites story/your-move.json and pushes it to the app project (existing shots keep their paintings and clips).
import fs from 'node:fs';

const FILE = 'story/your-move.json', SLUG = 'your-move-a-filipino-lolo';
const st = JSON.parse(fs.readFileSync(FILE, 'utf8'));
// Existing shots come from the live project (it has edits made in the app, e.g. the shot 2 board fix),
// so their templates are unchanged and their paintings/clips stay valid.
const live = await (await fetch(`http://127.0.0.1:5177/api/projects/${SLUG}`)).json();
const byId = Object.fromEntries(live.story.shots.map(({ grade, ...s }) => [s.id, s]));
st.characters = live.story.characters;   // includes the redrawn younger-Lolo description

// New references
const migo = st.characters.find(c => c.id === 'migo');
const addVariant = (v) => { if (!migo.variants.some(x => x.id === v.id)) migo.variants.push(v); };
addVariant({ id: 'migo_11', look: 'The same Filipino boy at 11: short messy black hair, light brown skin, a bright open smile, a plain white t-shirt with a small blue print, khaki shorts.' });
addVariant({ id: 'migo_2', look: 'The same Filipino boy as a chubby toddler of 2: soft fine black hair, round cheeks, a tiny white sando and small cloth shorts, barefoot.' });

// New lights
st.palette['ambulance night'] = { grade: 'cool', words: 'Night: a dark bedroom lit by the cold screen, while slow pulses of red and blue emergency light sweep across the wall, the ceiling and the gap under the door.' };
st.palette['wake'] = { grade: 'none', words: 'A Filipino wake (lamay) at night inside the home: dim warm candlelight and soft yellow bulbs, white flowers, hushed heavy stillness, faces in soft shadow.' };
st.ambience.wake_night = 'A Filipino wake at night: hushed murmuring voices far off, crickets outside, a ceiling fan, the soft crackle of candles.';
st.ambience.night_room = 'A quiet bedroom at night: a wall clock ticking, geckos chirping outside, very faint crickets.';

const shot = (id, o) => ({ id, act: o.act, seconds: o.seconds, transition: o.transition, cast: o.cast, beat: o.beat, frame: o.frame, sfx: o.sfx || [], ambience: o.ambience || null });
const NEW = {
  s02a: shot('s02a', { act: 1, seconds: 5, transition: 'fade', cast: ['lolo_room', 'lolo_now', 'tin'], ambience: 'house_quiet',
    beat: 'His other daily ritual: one coin into the blue tin.',
    frame: { framing: 'close-up', subject: "Lolo's hand on the LEFT dropping a single coin into the open royal-blue cookie tin that sits on the small wooden altar shelf, beside a Santo Niño figure", action: 'he drops one coin into the tin, already half full of coins', setting: "Lolo's bedroom, afternoon light through the capiz window", light: 'lolo afternoon', camera: 'static', motion: 'the coin falls from his fingers into the tin and settles; his hand rests on the lid for a moment' },
    sfx: [{ prompt: 'a single coin dropped into a metal cookie tin full of coins, a small bright clink', offset: 1.2 }] }),
  s04a: shot('s04a', { act: 1, seconds: 4, transition: 'cut', cast: ['migo_13', 'migo_room'], ambience: 'gaming_room',
    beat: "Migo's headset is broken, held together with tape.",
    frame: { framing: 'extreme close-up', subject: "The band of Migo's black gaming headset on his head, cracked and wrapped with grey tape, seen from the side, his messy black hair around it", action: 'he presses the loose ear cup against his ear because the sound keeps cutting out', setting: 'his dark bedroom, the monitor glow behind', light: 'screen glow', camera: 'static', motion: 'his fingers press the ear cup, the taped band flexes slightly, screen light flickers' } }),
  s05a: shot('s05a', { act: 1, seconds: 7, transition: 'bleed', cast: ['lolo_room', 'lolo_frail', 'phone'], ambience: 'night_room',
    beat: "Night: Lolo, alone, lit blue by his phone like his grandson. (We don't know yet what he's doing.)",
    frame: { framing: 'medium', subject: 'Frail Lolo sitting up in his bed on the LEFT, reading glasses on the tip of his nose, holding his old phone close to his face with both hands', action: 'he slowly pokes the screen with one finger, squinting, concentrating', setting: 'his dark bedroom at night, only the altar candle and the phone light', light: 'screen glow', camera: 'slow push-in', motion: 'his finger taps the screen slowly, he squints and leans closer, the phone light flickers on his face' } }),
  s06a: shot('s06a', { act: 1, seconds: 5, transition: 'cut', cast: ['migo_room', 'migo_13'], ambience: 'gaming_room',
    beat: 'The near-miss: he almost goes to the door.',
    frame: { framing: 'medium', subject: 'Migo at his desk on the RIGHT, the door behind him on the LEFT', action: 'he lifts the headset off one ear and half-turns toward the door, hesitates, then turns back to the screen and puts the headset back on', setting: 'his dark bedroom, the monitor glowing', light: 'screen glow', camera: 'static', motion: 'his hand lifts the ear cup, his head half-turns toward the door, pauses, then he turns back to the screen' } }),
  s06b: shot('s06b', { act: 2, seconds: 6, transition: 'cut', cast: ['migo_room', 'migo_13'], ambience: 'gaming_room',
    beat: 'The night Lolo is taken away. Migo, headset on, never notices.',
    frame: { framing: 'wide', subject: 'Migo seated at his desk on the RIGHT with the headset on, absorbed in the glowing monitor; the closed door on the LEFT', action: 'he keeps playing while red and blue emergency lights pulse through the curtains and under the door behind him', setting: 'his dark bedroom late at night', light: 'ambulance night', camera: 'static', motion: 'slow pulses of red and blue light sweep across the walls and under the door, Migo keeps playing, unaware' },
    sfx: [{ prompt: 'a distant ambulance siren heard muffled through closed windows, fading away', offset: 0.5 }] }),
  s07a: shot('s07a', { act: 2, seconds: 8, transition: 'fade', cast: ['migo_13', 'lolo_now'], ambience: 'wake_night',
    beat: 'The wake. There is no doubt now: Lolo is gone.',
    frame: { framing: 'medium', subject: "Migo in a plain black t-shirt standing in the RIGHT third, seen from behind at a slight angle, holding his headset limply in one hand; in front of him on a small table, a framed photograph of Lolo smiling with a black ribbon across the frame's corner", action: 'he stands very still in front of the photo', setting: 'the living room of the old house at night during a wake: two tall white candles and white chrysanthemums beside the photo, the edge of a simple white casket behind the table, a few blurred mourners in white seated far in the background', light: 'wake', camera: 'slow push-in', motion: 'the candle flames flicker, Migo stays still, his hand holding the headset trembles slightly' } }),
  s08a: shot('s08a', { act: 2, seconds: 6, transition: 'bleed', cast: ['porch', 'lolo_memory', 'migo_11'], ambience: 'street_afternoon',
    beat: 'Memory, age 11: Lolo gave him his first tablet. Migo hugged him.',
    frame: { framing: 'medium', subject: "Lolo seated in his rattan chair on the LEFT; 11-year-old Migo standing on the RIGHT holding an unwrapped new tablet, newspaper wrapping torn open on the floor", action: 'Migo throws his arms around Lolo in a big happy hug, the tablet still in one hand', setting: 'the same front porch, a bright afternoon', light: 'memory haze', camera: 'static', motion: 'Migo hugs Lolo tightly, Lolo laughs and pats his back' } }),
  s09a: shot('s09a', { act: 2, seconds: 6, transition: 'bleed', cast: ['house_ext', 'lolo_memory', 'migo_8'], ambience: 'street_afternoon',
    beat: 'Memory, age 7: Lolo running behind his first bicycle.',
    frame: { framing: 'wide', subject: 'On the quiet street in front of the house, young Migo riding a small red bicycle in the centre, Lolo just behind him holding the back of the seat, both moving toward the RIGHT', action: 'Lolo lets go of the seat and Migo pedals on alone for the first time, Lolo raising his hands in joy', setting: 'the barangay street in front of the house, golden afternoon, bougainvillea at the gate', light: 'memory haze', camera: 'static', motion: 'the bicycle rolls slowly forward, Lolo lets go and lifts his hands, the boy wobbles then keeps going' } }),
  s10a: shot('s10a', { act: 2, seconds: 6, transition: 'bleed', cast: ['porch', 'lolo_memory', 'migo_2'], ambience: 'house_quiet',
    beat: 'Memory, age 2: his first steps, holding Lolo\'s fingers.',
    frame: { framing: 'medium', subject: "On the porch floorboards, toddler Migo in the centre taking wobbly steps, each tiny hand holding one of Lolo's fingers; Lolo crouching behind him, beaming", action: 'the toddler takes a few careful steps forward', setting: 'the same front porch, a soft warm morning', light: 'memory haze', camera: 'static', motion: 'the toddler takes small wobbly steps, Lolo shuffles behind holding his hands, both smiling' } }),
};

// New order: build-up, a clear death, longer memories.
const ORDER = ['s01', 's02', 's02a', 's03', 's04', 's04a', 's05', 's05a', 's06', 's06a', 's06b', 's07', 's07a', 's08',
  's08a', 's09', 's09a', 's10', 's10a', 's11', 's12', 's13', 's14', 's15', 's16'];
// Slower pacing: let the emotional shots breathe.
const SECONDS = { s01: 7, s02: 6, s03: 6, s04: 6, s05: 6, s06: 6, s07: 8, s08: 7, s09: 6, s10: 6, s11: 6, s12: 7, s13: 8, s14: 7, s15: 9, s16: 8 };
st.shots = ORDER.map(id => NEW[id] || { ...byId[id], seconds: SECONDS[id] ?? byId[id].seconds });
st.shots.find(s => s.id === 's07').act = 2;

st.plants.push(
  { object: 'one coin into the blue tin each day', setup_shot: 's02a', payoff_shot: 's12' },
  { object: "Migo's cracked, taped headset", setup_shot: 's04a', payoff_shot: 's12' },
  { object: 'Lolo at night, lit blue by his phone', setup_shot: 's05a', payoff_shot: 's13' },
  { object: 'Lolo gave Migo his first tablet', setup_shot: 's08a', payoff_shot: 's13' },
);
st.music.shape = [
  { from: 0, to: 36, mood: 'a light playful four-note motif, the knock theme, warm and gentle, repeating' },
  { from: 36, to: 62, mood: 'the motif slower and sparser, rain, lonely; a quiet uneasy note at night' },
  { from: 62, to: 70, mood: 'the music drops away to near silence as the emergency lights pulse' },
  { from: 70, to: 90, mood: 'silence, then a single low sustained piano note at the wake' },
  { from: 90, to: 128, mood: 'memories: the motif as a warm glowing lullaby with strings, building gently' },
  { from: 128, to: 150, mood: 'the reveal: fragile solo piano, the motif returns slowly and breaks' },
  { from: 150, to: 172, mood: 'the move: gentle resolution, strings swell softly, ends on one sustained piano note' },
];
fs.writeFileSync(FILE, JSON.stringify(st, null, 2));

const r = await fetch(`http://127.0.0.1:5177/api/projects/${SLUG}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: st }) });
const p = await r.json();
if (!r.ok) throw new Error(p.error);
console.log('shots:', p.story.shots.length, '| duration:', p.view.layout.duration, 's | refs:', p.view.cast.length);
console.log('missing refs:', p.view.cast.filter(c => !c.file).map(c => c.id).join(', '));
console.log('need painting:', p.view.shots.filter(s => !s.still || s.stillStale).map(s => s.id).join(', '));
console.log('need clip:', p.view.shots.filter(s => !s.clip).map(s => s.id).join(', '));
console.log('remaining est: $' + p.view.plan.remaining, JSON.stringify(p.view.plan.rows));
