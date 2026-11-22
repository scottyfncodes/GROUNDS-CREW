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
| `src/gameday.js` | The evening: crew clears, fans walk in, dusk, towers, crowd, a few scripted plays, fireworks, the day summary |
| `src/design.js` | Outfield designs: the 16 ft drawing grid, stamps, save packing |
| `src/postcard.js` | The postcard of the night's field, shared or saved |
| `src/season.js` | The 12-game season: tonight's opponent and card, whether the field meets it, the league table |
| `src/render.js` | Oblique camera and the director that frames the work, scenery, decor, depth sort, particles, four lighting states |
| `src/sprites.js` | Pixel people and machines drawn from the simulation state |
| `src/ui.js`, `src/input.js` | The HUD and sheets; tap, pan, pinch, double-tap |
| `src/audio.js` | Recorded ambience and one-shots (Ogg, MP3 for Safari) plus synthesised engine, reel, rake, crowd and an organ stinger library |
| `src/save.js` | Versioned localStorage save; an unreadable save is set aside, never trusted |
| `sw.js` | Offline support (network first, cache as fallback) |

The art direction and the integration contract are in [`docs/art-bible.md`](docs/art-bible.md).

Why no Phaser or bundler: the game is one canvas with a custom surface shader and about fifteen small modules.
A framework would add a megabyte and a build step without drawing a single stripe better.

## The hook: draw it, mow it, show it

From day 2 you can draw your own design for the outfield (or start from a stamp: Clover, Heart, Star, Baseball,
Big C). The crew mows the outfield one way for a solid ground, then mows your design back the other way so it
lies dark, the way logos are mown into real outfields. On game night the Cloverfield blimp goes up and the
broadcast shows your field with a star rating (three stars needs a design on a near-perfect field), and the
summary gives you a postcard of the field from above to save or share.

## The season

Each in-game day is one home game in a 12-game season against five rival clubs. Every night after the first has a
card: a pattern the visiting manager wants, rain overnight, a scout, Kids' Day, Fireworks Night or a rivalry game.
Meeting it pays at the gate. How good the field looks raises the Clovers' chance of winning; finish first and a
pennant banner goes up on the outfield wall for good.

## Testing hooks

`window.__game` exposes `state`, `day`, `bucks`, `stats` (grass, dirt, lines, field, stripes) and `test`
(`assign`, `advance`, `finishAll`, `skipGame`) for automated play and captures.
