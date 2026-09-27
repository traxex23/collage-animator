// All scene art, narration, music and SFX for "The Long String".
import { image, edit, speech, audio, spent } from './gen.mjs';

const OLD = 'ref_tomas_old.png';
const YOUNG = 'ref_couple_young.png';

export const LINES = {
  n01: 'Every spring, Tomas flew the same old kite.',
  n02: 'This year, the wind grew tired... so, slowly, he began to bring it home.',
  n03: 'Every knot on the string was a year.',
  n04: 'Here... his granddaughter, learning how to run.',
  n05: 'Here, the spring Ana put down her brushes. That knot was the heaviest of all.',
  n06: 'Here, their daughter, saying yes beneath the plum tree.',
  n07: 'And at the very end... two young fools, gluing newspaper to bamboo, hoping it would fly.',
  n08: 'It did.',
  n09: 'Tomas tied one small new kite beside the old one... and let the wind carry them both.',
};

const SCENES = [
  ['s01_hill.png', [OLD],
    'Wide establishing landscape. A tiny lone old man (the old man from the reference sheet, same clothes) stands on top of a gentle grassy ' +
    'hill by a calm pale sea, holding a wooden string spool. Far above him, a small diamond-shaped red kite with a ribbon tail flies high in a vast ' +
    'pale spring sky, connected by a long thin string. A small whitewashed cottage with a crooked chimney sits behind him. The upper two thirds of ' +
    'the image is soft empty sky. Spring wildflowers dot the grass.'],
  ['s02_hands.png', [OLD],
    'Intimate close-up of the old man\'s wrinkled, spotted hands (mustard-yellow cardigan cuffs visible) slowly winding a thin kite string onto a ' +
    'worn wooden spool. The string has small neat knots tied along it at intervals. Soft out-of-focus hill and sky behind. Quiet, tender, still.'],
  ['s03_grand.png', [OLD],
    'The same old man, a few years younger, kneeling in the windy grass on the hilltop, laughing, arms open, as a small five-year-old granddaughter ' +
    'in a yellow raincoat and red rubber boots runs past him holding the kite string, the red diamond kite just lifting off behind her. Grass and ' +
    'wildflowers blown by wind. Joyful but gentle.'],
  ['s04_loss.png', [OLD],
    'A quiet cottage interior by a window with thin lace curtains, cool blue-grey morning light. An empty wooden chair with a folded pale blue shawl ' +
    'draped over it sits beside a wooden easel holding an unfinished watercolor painting of a red kite. Paintbrushes rest in a jar, one brush laid ' +
    'down across the palette. The old man from the reference, in his sixties, stands in the doorway in the soft shadow, hat in his hands, looking ' +
    'at the chair. Plum blossoms outside the window. Deep, still grief, very muted colors.'],
  ['s05_wedding.png', [OLD, YOUNG],
    'Under a large blooming plum tree on the hill, pink-white petals drifting in the air. A young bride with dark hair and a simple white cotton ' +
    'dress holds hands with her groom. In the foreground, seen from behind and slightly to the side, her parents watch holding hands: the man from ' +
    'the references in his fifties (dark hair turning grey, round spectacles, no beard, flat cap, mustard cardigan) and the woman from the references ' +
    'in her fifties (auburn hair greying, loose bun with a pencil in it, pale blue dress). A red diamond kite hangs tied in the tree branches. Warm, bittersweet.'],
  ['s06_young.png', [YOUNG],
    'The young couple from the reference sheet (young man has no glasses) sit cross-legged on the bare wooden floor of an empty sunlit room ' +
    'full of cardboard moving boxes, building a kite together: gluing sheets of old newspaper onto a thin bamboo diamond frame, a small pot of red ' +
    'paint and a brush beside them. She laughs with glue on her fingers, he concentrates, tongue out. Warm golden afternoon light through a window.'],
  ['s07_first.png', [YOUNG],
    'The young couple from the reference sheet (young man has no glasses) running up a grassy hilltop together hand in hand, laughing, as their ' +
    'freshly painted red diamond kite catches the wind and lifts into the golden evening sky for the very first time. A small unfinished cottage ' +
    'with scaffolding in the distance. Hopeful, alive, full of wind.'],
  ['s08_end.png', [OLD],
    'Sunset on the grassy hilltop by the sea, warm apricot and rose sky fading to lavender. The old man from the reference sheet, seen from behind, ' +
    'stands alone and at peace, holding one wooden spool with two strings. High above, two kites fly side by side: the old faded red diamond kite and ' +
    'a small new pale yellow diamond kite, their ribbon tails almost touching. The little whitewashed cottage glows with one lit window. Peaceful acceptance.'],
];

const COUPLE_YOUNG =
  'Young Tomas (mid twenties, slim, dark messy hair, long nose, NO glasses, clean shaven, rolled-up cream shirt sleeves, brown suspenders, dark trousers, ' +
  'work boots) and young Ana (mid twenties, freckles, auburn hair tied loosely in a bun with a pencil through it, paint-stained pale blue dress with a small white collar).';

const tasks = [];

// Music and SFX don't depend on the art, so start them first.
tasks.push(audio('music_a.mp3',
  'Solo felt piano, slow and melancholic, tender and nostalgic, sparse gentle melody in a minor key with hopeful major resolutions, soft room reverb, ' +
  'faint vintage tape hiss. Score for a hand-painted animated short film about an old man remembering his late wife. Around 55 seconds: starts ' +
  'almost silent, a soft cello and warm strings join gently in the middle, swells briefly with bittersweet warmth, then ends on a single quiet ' +
  'unresolved piano note. Instrumental only, no vocals, no drums.'));
tasks.push(audio('sfx_wind.mp3', 'Gentle breeze over a grassy seaside hilltop, soft rustling grass, very distant calm waves, a faint seagull far away. Calm, airy ambience.',
  { model: 'elevenlabs-sound-effects-v2', duration: 20, cost: 0.05, extra: { loop: true } }));
tasks.push(audio('sfx_spool.mp3', 'A thin kite string slowly winding onto an old wooden spool, soft creaks and gentle ticking of the wooden handle, close and quiet.',
  { model: 'elevenlabs-sound-effects-v2', duration: 6, cost: 0.02 }));
tasks.push(audio('sfx_flap.mp3', 'A paper kite fluttering and snapping gently in the wind, soft paper flapping.',
  { model: 'elevenlabs-sound-effects-v2', duration: 5, cost: 0.02 }));

for (const [k, text] of Object.entries(LINES)) tasks.push(speech(`${k}.wav`, text, { voice: 'Gacrux' }));

// Young couple sheet must exist before its scenes.
const art = (async () => {
  await image('ref_couple_young.png',
    `Character reference sheet on plain cream paper: ${COUPLE_YOUNG} Show the two of them standing side by side in front view, and again in ` +
    'three-quarter view laughing together. Full body, evenly spaced.');
  // Run scenes 3 at a time to be gentle on rate limits.
  for (let i = 0; i < SCENES.length; i += 3) {
    await Promise.all(SCENES.slice(i, i + 3).map(([name, refs, p]) =>
      edit(name, p, refs).then(() => console.log('done', name)).catch(e => console.log('FAIL', name, e.message))));
  }
})();
tasks.push(art);

const res = await Promise.allSettled(tasks);
for (const r of res) if (r.status === 'rejected') console.log('FAIL', r.reason?.message);
console.log('spent so far: $' + spent().total.toFixed(2));
