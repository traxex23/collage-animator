// One-off: derive engine/index.html (project-driven) from film3/index.html. Fails loudly if a patch doesn't apply.
import fs from 'node:fs';

let h = fs.readFileSync('film3/index.html', 'utf8');
const patch = (from, to) => {
  if (typeof from === 'string' ? !h.includes(from) : !from.test(h)) throw new Error('patch not found: ' + String(from).slice(0, 80));
  h = h.replace(from, to);
};

patch(/const TIMELINE = \{[\s\S]*?\n\};\nwindow\.TIMELINE = TIMELINE;/,
  `// The timeline is loaded per project: /engine/?project=<slug>
const PROJECT = new URLSearchParams(location.search).get('project');
const BASE = \`/projects/\${encodeURIComponent(PROJECT)}/\`;
let TIMELINE = null;`);
patch('const W = 1920, H = 1080;', 'let W = 1920, H = 1080;');
patch('async function setup() {\n',
  `async function setup() {
  const variant = new URLSearchParams(location.search).get('timeline');   // e.g. "animatic"
  TIMELINE = window.TIMELINE = await (await fetch(BASE + (variant ? \`timeline-\${variant}.json\` : 'timeline.json') + '?' + Date.now())).json();
  W = TIMELINE.width; H = TIMELINE.height; cv.width = W; cv.height = H; cv.style.aspectRatio = \`\${W} / \${H}\`;
`);
patch("await (await fetch(`clips/${s.clip}/info.json`)).json()", "await (await fetch(`${BASE}frames/${s.clip}/info.json`)).json()");
patch("loadImage(`clips/${clip}/f${", "loadImage(`${BASE}frames/${clip}/f${");
patch("drawTitle(ctx, 'The Long String', t, T.in, T.out, H * 0.6, 128);", "drawTitle(ctx, TIMELINE.titleText, t, T.in, T.out, H * 0.6, 128);");
patch("drawTitle(ctx, 'The Long String', t, E.in, 0, H * 0.46, 92, '', '236,222,196');",
  "drawTitle(ctx, TIMELINE.titleText, t, E.in, 0, H * 0.46, Math.min(92, W * 0.06), '', '236,222,196');");
patch("new Audio('../out/v2-mix.m4a')", "new Audio(BASE + 'out/mix.m4a')");
patch('<title>The Long String</title>', '<title>Film preview</title>');
patch('if (FRAME_CACHE.size > 90)', 'if (FRAME_CACHE.size > 16)');   // 1080p frames are ~8 MB decoded each
patch('  const rate = Math.min(1, avail / (b - a));', '  // Play near real speed (heavy slow-motion stutters), then hold the last frame; the camera push keeps a hold alive.\n  const rate = Math.max(0.85, Math.min(1, avail / (b - a)));');

fs.mkdirSync('engine', { recursive: true });
fs.writeFileSync('engine/index.html', h);
console.log('engine/index.html written');
