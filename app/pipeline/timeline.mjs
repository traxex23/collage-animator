// Story shots -> timeline.json for the engine and the mixer.
import fs from 'node:fs';
import { dir } from '../lib/projects.mjs';

// Short transitions: long dissolves stack two shots on top of each other and read as blurry "ghost" frames.
const TRANS_DUR = { none: 0, fade: 0.6, cut: 0.15, bleed: 0.9, knot: 1.2 };
const TAIL = 4.5;   // end-card on black

// Shot i starts at the sum of the previous shots' seconds; its entry transition overlaps the previous shot.
export function layout(p) {
  let at = 0;
  const scenes = p.story.shots.map((shot, i) => {
    const s = { shot, at: +at.toFixed(2), in: i === 0 ? 'none' : shot.transition, dur: i === 0 ? 0 : TRANS_DUR[shot.transition] };
    at += shot.seconds;
    return s;
  });
  return { scenes, duration: +(at + TAIL).toFixed(2) };
}

// animatic: sketches/paintings as held frames (frames/anim_<id>), 12 fps, written to timeline-animatic.json.
export function build(p, { animatic = false } = {}) {
  const { scenes, duration } = layout(p);
  const vertical = p.settings.aspect === '9:16';
  const has = f => fs.existsSync(dir(p.slug, f));
  const sfx = [], amb = [];
  for (const s of scenes) {
    s.shot.sfx.forEach((x, k) => {
      const key = `${s.shot.id}_${k}`;
      if (p.sound.sfx[key] !== false && has(`audio/sfx_${key}.mp3`)) sfx.push([`audio/sfx_${key}.mp3`, +(s.at + x.offset).toFixed(2), 0.7]);
    });
  }
  // Merge consecutive shots sharing an ambience into one looping bed.
  let run = null;
  for (const [i, s] of scenes.entries()) {
    const key = s.shot.ambience;
    const ok = key && p.sound.amb[key] !== false && has(`audio/amb_${key}.mp3`);
    const end = i + 1 < scenes.length ? scenes[i + 1].at + scenes[i + 1].dur : duration;
    if (ok && run?.key === key) run.to = end;
    else { if (run) amb.push([`audio/amb_${run.key}.mp3`, run.from, run.to, 0.3]); run = ok ? { key, from: s.at, to: end } : null; }
  }
  if (run) amb.push([`audio/amb_${run.key}.mp3`, run.from, run.to, 0.3]);

  const t = {
    fps: animatic ? 12 : 30, duration, width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, titleText: p.story.title,
    scenes: scenes.map(s => ({ clip: `${animatic ? 'anim_' : ''}${s.shot.id}`, at: s.at, in: s.in, dur: s.dur, grade: s.shot.grade === 'none' ? undefined : s.shot.grade })),
    voice: [], subs: [], sfx, amb, music: has('audio/music.mp3') ? 'audio/music.mp3' : null,
    title: { in: -10, out: -9 }, endTitle: { in: duration - 3.6, fadeBlack: duration - 4.4 },
  };
  fs.writeFileSync(dir(p.slug, animatic ? 'timeline-animatic.json' : 'timeline.json'), JSON.stringify(t, null, 1));
  return t;
}
