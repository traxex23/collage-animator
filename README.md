# Collage Animator

Type a theme and get a finished, wordless animated short film in the style of *The House of Small Cubes*.
You approve every stage before any more money is spent.

## Start
Double-click **Start Collage Animator.bat** (or run `npm run app`), then open http://127.0.0.1:5177.

API keys are read from `.env` (`VENICE_API_KEY`, `XAI_API_KEY`). They stay on your PC and are never sent to the browser.

## The stages
1. **Story**: the writer AI (Grok or any Venice text model, chosen per film) writes a screenplay: routine → inciting accident →
   memories → planted objects that pay off → a quiet reveal. Edit any shot, or "Rewrite" with a note.
2. **Characters**: one reference sheet per character and age, so faces and clothes stay consistent.
3. **Stills**: one painting per shot. **Fix** makes cheap targeted corrections; **Repaint** starts over; **Undo** restores the last version.
4. **Clips**: each still becomes a short video (xAI Grok Imagine). There's a QA strip per clip. Regenerate only the bad ones.
5. **Sound**: three music recommendations for your story, your own music description, and suggested SFX and ambience you can tick on or off.
6. **Final**: renders locally (free) with the watercolor engine (cool present / warm memories, knot and wash transitions), mixes audio,
   and gives you `final.mp4` plus a smaller `share.mp4`.

Every generation shows an estimate first; the budget cap per film stops spending when it's reached.
**Test mode** runs the whole flow with placeholder art for $0.

## Where things are
- `projects/<film>/`: everything for one film (story, cast, stills, clips, audio, out/final.mp4, costs.json)
- `app/`: server, providers (Venice, xAI, mock), pipeline stages, presets (music styles, visual styles)
- `engine/index.html`: the film player/renderer (`/engine/?project=<film>` gives a live preview)
- `ui/`: the web interface
- `scripts/`, `film*/`: the original hand-built pipeline for *The Long String* (kept for reference)
