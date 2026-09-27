# Collage Animator

Type a theme and get a finished, wordless animated short film in the style of *The House of Small Cubes*.
You approve every stage before any more money is spent.

## Start
Double-click **Start Collage Animator.bat** (or run `npm run app`), then open http://127.0.0.1:5177.

API keys are read from `.env` (`VENICE_API_KEY`, `XAI_API_KEY`). They stay on your PC and are never sent to the browser.

## Four steps
Every screen has a **Next step** card with one button and its cost. Follow it.

1. **Idea**: what the film is about, length, format (16:9 or 9:16), look, AI models and budget cap.
2. **Plan** (nothing expensive runs yet): the writer AI (Grok or any Venice text model) writes a wordless screenplay:
   routine → inciting accident → memories → planted objects that pay off → a quiet reveal. It draws a character sheet per character
   and age, and sketches a rough **storyboard** (~$0.02 per shot). Click any shot to edit its **template**: framing, subject,
   action, setting, light, camera, motion, timing, cast. You can see the exact prompts it will send, and an advanced override.
   Changed shots are flagged for re-sketching. The **cost plan** shows what the rest of the film will cost. Approve the plan.
3. **Make**: each shot row shows sketch → painting → clip. **Fix** makes cheap targeted corrections to a painting, **Repaint**
   starts over, **Re-animate** redoes a clip, and **Undo** restores the last version. There's a QA strip under every clip.
4. **Finish**: three music recommendations for your story (or describe your own), suggested SFX and ambience to tick on or off,
   then a free local render with the watercolor engine. You get `final.mp4` plus a smaller `share.mp4`.

The budget cap per film stops spending when it's reached. **Test mode** runs everything with placeholder art for $0.

## Where things are
- `projects/<film>/`: everything for one film (story, cast, stills, clips, audio, out/final.mp4, costs.json)
- `app/`: server, providers (Venice, xAI, mock), pipeline stages, presets (music styles, visual styles)
- `engine/index.html`: the film player/renderer (`/engine/?project=<film>` gives a live preview)
- `ui/`: the web interface
- `scripts/`, `film*/`: the original hand-built pipeline for *The Long String* (kept for reference)
