# GROUNDS CREW

A cozy baseball groundskeeping game. You are the head groundskeeper of Cloverfield Park: send a tiny crew to
mow, drag and chalk the field, watch it change under their tools, then open the gates and see it played on.

Mobile-first (iPhone Safari, portrait), installable as a PWA, works offline after the first visit.
GROUNDS CREW by HaveAnApp.

## Run it

It is a static site with no build step and no dependencies.

```sh
npm start          # python3 -m http.server 5173, then open http://localhost:5173
npm test           # headless simulation tests (node --test)
```

## How it is put together

| File | Job |
|---|---|
| `src/geometry.js` | The ballpark in feet: regions, work areas, chalk paths, the shed, fielding positions |
| `src/surface.js` | Field state grids (grass, cut direction, dirt, chalk), the tools that change them, the shader, wear, save packing |
| `src/routes.js` | Route planning: mower passes for each pattern, drag arcs, rake and chalk paths |
| `src/sim.js` | Fixed-step simulation: worker state machines, job and equipment ownership, economy, day loop, onboarding |
| `src/gameday.js` | The evening: crew clears, dusk, towers, crowd, a few scripted plays, the day summary |
| `src/render.js` | Oblique camera, scenery, depth sort, particles, four lighting states |
| `src/sprites.js` | Pixel people and machines drawn from the simulation state |
| `src/ui.js`, `src/input.js` | The HUD and sheets; tap, pan, pinch, double-tap |
| `src/audio.js` | Recorded ambience and one-shots plus synthesised engine, scrape, crowd and organ |
| `src/save.js` | Versioned localStorage save; an unreadable save is set aside, never trusted |
| `sw.js` | Offline support (network first, cache as fallback) |

The art direction and the integration contract are in [`docs/art-bible.md`](docs/art-bible.md).

Why no Phaser or bundler: the game is one canvas with a custom surface shader and about fifteen small modules.
A framework would add a megabyte and a build step without drawing a single stripe better.

## Testing hooks

`window.__game` exposes `state`, `day`, `bucks`, `stats` (grass, dirt, lines, field, stripes) and `test`
(`assign`, `advance`, `finishAll`, `skipGame`) for automated play and captures.
