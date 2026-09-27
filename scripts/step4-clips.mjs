// Animate every v2 shot with Grok Imagine Video 1.5 (xAI). Runs scripts/xvideo.mjs in parallel batches.
import { spawn } from 'node:child_process';

// [image, clip name, seconds, motion direction]
export const SHOTS = [
  ['v2_p01_dawn.jpg', 'c01_dawn', 6, 'Dawn over the hill: long grass sways in the wind in slow waves, thin smoke curls from the chimney, the lit window glows softly, faint clouds drift, the grey sea shimmers.'],
  ['v2_p02_wake.jpg', 'c02_wake', 6, 'The old man sitting on the edge of the bed breathes slowly, then turns his head to look at the empty, neatly made other half of the bed, and lowers his gaze again. Pale light through the window. Only he moves.'],
  ['v2_p04_kitewall.jpg', 'c04_kitewall', 6, 'The old man gently lifts the patched red kite off its wall hook with both hands and holds it close for a moment, looking at it tenderly. The ribbon tail sways.'],
  ['s01_hill.jpg', 'c05_hill', 6, 'The small red kite dances high in the pale sky, its ribbon tail rippling in the wind, the long string gently swaying. The tiny old man below holds the spool and follows it with his gaze. Grass and wildflowers ripple in the wind.'],
  ['v2_p06_crash.jpg', 'c06_crash', 6, 'Strong gusting wind: the torn kite paper flutters in the old man\'s hands, the ribbon whips about, waves roll and break against the rocks below, the grass is flattened by the wind. He lowers his head in sorrow.'],
  ['v2_p07_table.jpg', 'c07_table', 6, 'Night. The oil lamp flame flickers gently. The old man slowly draws the kite string through his fingers, a small knot passing between his thumb and finger. Soft shadows move with the flame.'],
  ['v2_m1_grand.jpg', 'c08_grand', 6, 'The grandfather gently presses a small patch onto the torn kite while the little girl in the yellow raincoat sniffles and starts to smile. A soft breeze moves the grass and her hair.'],
  ['v2_m2_ana.jpg', 'c09_ana', 8, 'The frail old woman slowly paints a small red kite on the paper with a fine brush, her hand trembling slightly. The old man holds her other hand and softly strokes it with his thumb. The lace curtain moves in a gentle breeze, blossom petals drift outside.'],
  ['s05_wedding.jpg', 'c10_wedding', 6, 'Pink-white plum blossom petals drift down through the air. The young bride and groom hold hands and smile at each other. The parents in the foreground squeeze each other\'s hands. The kite in the branches sways lightly.'],
  ['v2_m4_shoulders.jpg', 'c11_shoulders', 6, 'The little girl on her father\'s shoulders laughs and waves the kite string; the bright red kite swoops and bobs high in the sky, its ribbon tail rippling. The mother laughs. Wind blows through the long grass and their hair.'],
  ['s06_young.jpg', 'c12_young', 6, 'The young couple glue newspaper onto the bamboo kite frame; she laughs, he carefully smooths the paper with concentration. Warm sunlight and dust motes float in the air.'],
  ['v2_m6_secret.jpg', 'c13_secret', 6, 'The young woman quickly paints a tiny picture inside the folded flap of newspaper with a small brush, glances over her shoulder at the young man who stays turned away searching in the box, smiles to herself and gently folds the flap closed.'],
  ['v2_p08_reveal.jpg', 'c15_reveal', 8, 'The old fingers slowly and carefully peel the torn newspaper flap further open, revealing the small faded painting of the old couple inside. The oil lamp flame flickers warmly. Very slow, delicate movement.'],
  ['v2_p09_tear.jpg', 'c16_tear', 6, 'The old man, hand over his mouth, blinks as a tear slowly rolls down his cheek; then his eyes soften and a gentle smile begins to form. The lamp flame flickers.'],
  ['v2_p10_sunset.jpg', 'c17_sunset', 6, 'At sunset the old man pours tea from the small teapot into the second teacup on the bench beside him, steam rising. The mended red kite flies high, its ribbon tail rippling. The grass sways.'],
  ['v2_p11_final.jpg', 'c18_final', 8, 'Very wide dusk landscape: the small red kite drifts and bobs high in the vast glowing sky, clouds drift slowly, the sea glimmers, the cottage window glows. Almost still, peaceful.'],
];

const run = ([img, name, secs, motion]) => new Promise(res => {
  const p = spawn('node', ['scripts/xvideo.mjs', img, name, String(secs), motion], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  p.on('close', code => { console.log(`${name}: ${code === 0 ? 'ok' : 'FAIL'} ${log.trim().split('\n').pop().slice(0, 160)}`); res(); });
});

if (process.argv[1].endsWith('step4-clips.mjs')) {
  const only = process.argv.slice(2);
  const list = only.length ? SHOTS.filter(s => only.includes(s[1])) : SHOTS;
  for (let i = 0; i < list.length; i += 5) await Promise.all(list.slice(i, i + 5).map(run));
}
