// $0 test mode: placeholder images, clips and audio made locally with ffmpeg, and a canned writer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpeg } from '../lib/core.mjs';

const tmp = ext => path.join(os.tmpdir(), `mock-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
async function readTmp(ext, args) { const f = tmp(ext); await ffmpeg([...args, f]); const b = fs.readFileSync(f); fs.unlinkSync(f); return b; }

export async function generateImage({ prompt, aspect }) {
  const [w, h] = aspect === '9:16' ? [768, 1344] : [1344, 768];
  const hh = hue(prompt);
  return { buf: await readTmp('png', ['-f', 'lavfi', '-i', `color=c=0xd9cbb0:s=${w}x${h}`, '-vf',
    `noise=alls=18:allf=t,hue=h=${hh}:s=0.6,drawbox=x=iw*0.3:y=ih*0.35:w=iw*0.4:h=ih*0.4:color=0x5a4632@0.5:t=fill,vignette`, '-frames:v', '1']) };
}
export const editImage = generateImage;

export async function video({ image, seconds, aspect }) {
  const [w, h] = aspect === '9:16' ? [704, 1280] : [1280, 704];
  return { buf: await readTmp('mp4', ['-loop', '1', '-i', image, '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='1+0.0015*on':d=${Math.round(seconds * 24)}:s=${w}x${h}:fps=24`,
    '-t', String(seconds), '-pix_fmt', 'yuv420p']) };
}

export async function audio({ prompt, duration = 60 }) {
  const music = /piano|music|score|strings|melod/i.test(prompt);
  const src = music ? `sine=f=220:d=${duration},volume=0.15` : `anoisesrc=d=${duration}:c=brown:a=0.08`;
  return { buf: await readTmp('mp3', ['-f', 'lavfi', '-i', src, '-ac', '2']) };
}

// Canned screenplay so the whole flow can be exercised without a writer API.
export async function chat({ messages }) {
  const user = messages.at(-1).content;
  if (/"recommendations"/.test(messages[0].content)) {
    return { text: JSON.stringify({ recommendations: [
      { preset: 'felt-piano-melancholy', why: 'Mock: quiet, reflective theme.' },
      { preset: 'warm-strings-hope', why: 'Mock: warm resolution.' },
      { preset: 'music-box-whimsy', why: 'Mock: gentle whimsy.' },
    ] }) };
  }
  const n = Number((user.match(/SHOT COUNT: (\d+)/) || [])[1] || 5);
  const theme = (user.match(/THEME: (.*)/) || [])[1] || 'a quiet memory';
  const shots = Array.from({ length: n }, (_, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`, act: i < 2 ? 1 : i < n - 2 ? 2 : 3, beat: `Mock beat ${i + 1} for ${theme}`, seconds: 6,
    transition: i === 0 ? 'fade' : i >= 2 && i < n - 2 ? 'knot' : 'bleed', cast: ['hero_old'],
    frame: { framing: ['wide', 'medium', 'close-up'][i % 3], subject: 'the hero at the centre of the frame', action: `mock action ${i + 1}: ${theme}`,
      setting: 'a small room by the sea, morning', light: i >= 2 && i < n - 2 ? 'warm memory' : i === n - 1 ? 'golden reveal' : 'cool present',
      camera: i % 2 ? 'slow push-in' : 'static', motion: 'gentle breeze, slow breathing' },
    sfx: i === 1 ? [{ prompt: 'a soft paper rustle', offset: 1 }] : [], ambience: 'wind',
  }));
  return { text: JSON.stringify({
    title: `Mock: ${theme.slice(0, 30)}`, logline: `A mock story about ${theme}.`,
    characters: [{ id: 'hero', name: 'Hero', variants: [{ id: 'hero_old', look: 'an old person in a yellow cardigan' }] }],
    plants: [{ object: 'a teacup', setup_shot: 's01', payoff_shot: shots.at(-1).id }],
    ambience: { wind: 'gentle wind over grass' },
    shots, music: { preset: 'felt-piano-melancholy', shape: [{ from: 0, to: n * 6, mood: 'tender' }] },
  }) };
}
