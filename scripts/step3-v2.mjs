// v2 "The Long String" — wordless. New scene art, score and sound effects.
import { edit, audio, spent } from './gen.mjs';

const OLD = 'ref_tomas_old.png';
const YOUNG = 'ref_couple_young.png';

const PRESENT = ' PRESENT DAY: cool, quiet, grey-blue muted near-monochrome palette, soft overcast light, a lonely stillness.';
const MEMORY = ' MEMORY: warm glowing golden-hour palette, honey, apricot and rose tones, soft light bloom, tender and alive.';
const KITE = 'a red diamond-shaped paper kite with a long rose-pink ribbon tail';

const SCENES = [
  ['v2_p01_dawn.png', [OLD],
    'Wide establishing shot at dawn. A small whitewashed stone cottage with a crooked chimney alone on top of a grassy hill above a calm grey sea. ' +
    'One window is softly lit. Wind bends the long grass. Enormous pale sky, faint last stars. Tiny, lonely, beautiful.' + PRESENT],
  ['v2_p02_wake.png', [OLD],
    'Inside a small simple bedroom at early morning. The old man from the reference sheet, in a plain white nightshirt, sits on the edge of a ' +
    'double bed, hands on his knees, looking at the floor. His side of the bed is rumpled; the OTHER side is perfectly made, its pillow untouched. ' +
    'A pair of round spectacles on the bedside table. Pale window light.' + PRESENT],
  ['v2_p03_cups.png', [OLD],
    'A small cottage kitchen. On a wooden wall shelf stand TWO identical small white teacups with a faded rose pattern, side by side. The old man\'s ' +
    'wrinkled hand (mustard cardigan cuff) reaches up and takes only ONE of them. In the background corner, a wooden painter\'s easel is covered by a ' +
    'grey dust sheet. A kettle steams on an old stove.' + PRESENT],
  ['v2_p04_kitewall.png', [OLD],
    `A narrow cottage hallway with a coat hook by the front door. On the wall hangs ${KITE}, old and lovingly repaired: covered in many careful ` +
    'patches of old newspaper and small hand-painted paper squares, glued over years. The old man from the reference (mustard cardigan, flat cap) ' +
    'lifts it down gently with both hands, like something precious. Grey morning light through the door\'s glass.' + PRESENT],
  ['v2_p06_crash.png', [OLD],
    `At the rocky edge of the grassy clifftop above the grey sea. ${KITE}, patched, has crashed onto the rocks: its thin bamboo spine snapped, ` +
    'the paper torn open in a long rip. The old man from the reference kneels beside it in the wind, holding the broken kite in both hands, ' +
    'shoulders fallen, his flat cap blown off onto the grass. Heavy grey sky.' + PRESENT],
  ['v2_p07_table.png', [OLD],
    `Night. A wooden worktable by a dark window, lit only by a small brass oil lamp casting a warm pool of light in the cool blue darkness. ` +
    `On the table lies the torn, patched ${KITE}, with a glue pot, needle and thread, scissors, and a wooden string spool. The old man from the ` +
    'reference sheet, spectacles on, slowly unwinds the kite string between his fingers; a small knot on the string rests between his thumb and finger. ' +
    'Quiet, concentrated, tender. Cool blue-grey night palette except the lamplight.'],
  ['v2_m1_grand.png', [OLD],
    `On the grassy hilltop. A five-year-old granddaughter in a yellow raincoat and red boots cries, holding ${KITE} with a fresh small tear in it. ` +
    'The old man from the reference sheet (a few years younger), kneeling down to her height, gently shows her how to glue a small patch of ' +
    'newspaper over the tear, smiling kindly. She is starting to stop crying.' + MEMORY],
  ['v2_m2_ana.png', [OLD, YOUNG],
    'By a sunny cottage window with lace curtains and plum blossoms outside. Ana, now an old woman in her late sixties (the young woman from the ' +
    'reference, aged: grey-auburn hair in a loose bun with a pencil through it, freckles, thin and frail, a pale blue knitted shawl over her ' +
    'shoulders) sits in a wooden chair painting a small square of paper with a fine brush: a tiny red kite. Beside her, the old man from the reference ' +
    'sits close and holds her other hand in both of his, watching her face. Deep love, quiet sorrow.' + MEMORY],
  ['v2_m4_shoulders.png', [OLD, YOUNG],
    `On the grassy hilltop by the sea, windy spring day. A man in his forties (the man from the references in middle age: dark hair, round spectacles, ` +
    `flat cap, mustard cardigan, clean shaven) carries his laughing five-year-old daughter (dark hair in pigtails, white dress) on his shoulders; she ` +
    `holds the string of ${KITE} flying high, NEW and bright with no patches. Beside them, his wife in her forties (the woman from the references: ` +
    'auburn bun with a pencil, freckles, pale blue dress) laughs with her head thrown back.' + MEMORY],
  ['v2_m6_secret.png', [YOUNG],
    'Close shot in a sunlit empty room with moving boxes. Young Ana from the reference sheet kneels on the wooden floor over a half-built kite of old ' +
    'newspaper glued onto a thin bamboo frame. With a small brush she is secretly painting a tiny picture on the INSIDE of a folded flap of the ' +
    'newspaper, biting her lip with a mischievous, loving smile, glancing sideways. In the soft background, young Tomas (from the reference, no glasses) ' +
    'has his back turned, searching through a cardboard box. Golden afternoon light.' + MEMORY],
  ['v2_p08_reveal.png', [OLD, YOUNG],
    'Extreme close-up at night under warm oil-lamp light. Old wrinkled fingers gently peel back a torn flap of yellowed old newspaper inside a red paper kite. ' +
    'Hidden on the inside of the flap is a small, faded, delicate watercolor painting by Ana: an OLD man with a white beard and flat cap and an OLD woman ' +
    'with a grey bun, sitting together on a grassy hill by the sea, flying a little red diamond kite, holding hands. The painted figures clearly resemble ' +
    'the characters in the references, but elderly. The painting is simple, tender, childlike, clearly hand-painted decades ago.'],
  ['v2_p09_tear.png', [OLD],
    'Close-up portrait at night, warm oil lamp light from below-left, cool blue darkness behind. The old man from the reference sheet, spectacles on, ' +
    'one hand over his mouth, eyes glistening with a single tear running down his cheek, and the very beginning of a gentle smile in his eyes. ' +
    'Deeply moving, restrained.'],
  ['v2_p10_sunset.png', [OLD],
    `Sunset on the grassy hilltop by the sea, warm apricot, rose and lavender sky. The old man from the reference sits on a simple wooden bench, ` +
    `holding the kite string tied around the bench arm; high above flies the mended ${KITE}, and on its face a small painted square is visible. ` +
    'On the bench beside him stand TWO small white teacups with a rose pattern; he is pouring tea from a small teapot into the SECOND cup. Peaceful.'],
  ['v2_p11_final.png', [OLD],
    `Very wide final shot at dusk: an immense warm sky of apricot, rose and lavender over a calm sea. On the dark hilltop, a tiny cottage with one lit ` +
    `window and a tiny figure of an old man on a bench. High above, ${KITE} flies small and bright against the vast sky. The upper half is open sky. Serene.`],
];

const tasks = [];
tasks.push(audio('v2_music.mp3',
  'Wordless animated short film score, solo felt piano with soft cello and warm strings, melancholic, tender, nostalgic, soft room reverb, faint vintage ' +
  'tape hiss, slow tempo around 58 bpm, no drums, no vocals. About 110 seconds with this exact shape: 0-28s a sparse, lonely, simple piano motif ' +
  'in a minor key, like a quiet morning routine; around 30s the music suddenly stops for a moment of silence; 36-70s the motif returns warmer and ' +
  'fuller, cello joins, nostalgic and bittersweet, with a very quiet fragile passage around 50-57s; 72-80s gentle anticipation; around 82s the full theme ' +
  'blooms with strings, emotional and hopeful; 95-110s calm peaceful resolution ending on a single soft piano note.'));

const SFX = [
  ['v2_sfx_sea', 'Calm dawn by the sea on a hilltop: soft distant waves, gentle breeze in grass, a faraway seagull. Quiet and lonely.', 20],
  ['v2_sfx_crash', 'A sudden gust of wind then a paper kite crashing onto rocks: sharp paper crumple, small bamboo stick snapping.', 3],
  ['v2_sfx_tear', 'Very slow, careful peeling of old dry paper and glue, close and delicate.', 4],
  ['v2_sfx_night', 'Quiet night indoors in a countryside cottage: faint crickets outside, the soft hiss of an oil lamp, an old clock ticking slowly.', 20],
  ['v2_sfx_pour', 'Tea being gently poured from a small ceramic teapot into a porcelain cup outdoors, with a light breeze.', 5],
  ['v2_sfx_cup', 'A small porcelain teacup lifted from a wooden shelf, a soft ceramic clink.', 2],
];
for (const [n, p, d] of SFX) tasks.push(audio(`${n}.mp3`, p, { model: 'elevenlabs-sound-effects-v2', duration: d, cost: 0.0023 * d + 0.005, extra: d >= 20 ? { loop: true } : {} }));

tasks.push((async () => {
  for (let i = 0; i < SCENES.length; i += 4) {
    await Promise.all(SCENES.slice(i, i + 4).map(([name, refs, p]) =>
      edit(name, p, refs).then(() => console.log('done', name)).catch(e => console.log('FAIL', name, e.message))));
  }
})());

const res = await Promise.allSettled(tasks);
for (const r of res) if (r.status === 'rejected') console.log('FAIL', r.reason?.message);
console.log('spent so far: $' + spent().total.toFixed(2));
