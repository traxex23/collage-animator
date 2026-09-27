// Character reference sheets + narrator voice auditions.
import { image, speech, spent } from './gen.mjs';

const TOMAS_OLD =
  'Tomas: a slight, gentle old man in his late seventies, round wire spectacles, white wispy hair and a short white beard, ' +
  'long nose, kind tired eyes, wearing a faded mustard-yellow knitted cardigan over a white shirt, brown trousers, and a soft grey flat cap.';
const COUPLE_YOUNG =
  'Young Tomas (mid twenties, slim, dark messy hair, long nose, round wire spectacles, rolled-up white shirt sleeves, suspenders) and ' +
  'young Ana (mid twenties, freckles, auburn hair tied loosely in a bun with a pencil through it, paint-stained pale blue dress with a small white collar).';

await Promise.all([
  image('ref_tomas_old.png',
    `Character turnaround reference sheet on plain cream paper: ${TOMAS_OLD} Show him three times side by side: front view standing, ` +
    'three-quarter view holding a wooden kite-string spool, and side view. He also holds a small diamond-shaped red paper kite with a long ribbon tail. Full body, evenly spaced.'),
  image('ref_couple_young.png',
    `Character reference sheet on plain cream paper: ${COUPLE_YOUNG} Show the two of them standing side by side in front view, and again in ` +
    'three-quarter view laughing together. Full body, evenly spaced.'),
]);

const line = 'Every spring, Tomas flew the same old kite. This year, the wind grew tired... so, slowly, he began to bring it home.';
for (const v of ['Sulafat', 'Gacrux', 'Charon', 'Vindemiatrix', 'Algenib']) await speech(`voice_test_${v}.wav`, line, { voice: v });

console.log('spent so far: $' + spent().total.toFixed(2));
