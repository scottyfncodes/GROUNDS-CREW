# GROUNDS CREW — art bible and integration spec

One document for both sides of the build: what the world looks like, and the contract the code holds it to.
The approved direction is **Tabletop Morning** (`art-direction/target/`): Cloverfield Park as a hand-built model
ballpark on a cream tabletop, chunky pixel people and machines on softly textured ground, painted ballpark
signs for every word on screen.

## The world

- **Units.** Feet. Home plate is `(0, 0)`; `+y` runs to centre field, `+x` to first base. Basepaths are 90 ft;
  the fence is 330 ft at the poles and 400 ft to centre. `src/geometry.js` is the only place geometry lives.
  Rendering, routes, masks, picking and the evening game all read it.
- **Camera.** Oblique, no perspective: `screen.x = (x - cam.x) * s`, `screen.y = -(y - cam.y) * s * 0.8 - z * s`.
  A tap maps back to an exact spot on the ground at any zoom. Portrait fits the park to the width; landscape to
  the height. Pinch 0.9x to 4.5x.
- **Scale.** One sprite pixel is 2 ft (`FEEL.SPRITE_FT`). People are deliberately giants (about 28 ft tall) so
  they read on a phone; a riding-mower stripe is 24 ft (12 sprite px, the width of the mower), a reel-mower
  stripe 12 ft.
- **Surface.** 2 texels per foot (1240 x 1040). Four state grids: `rough` (grass length), `shade` (which way it
  was cut), `scuff` (dirt), `chalk`. Tools write the grids where they touch; the shader repaints only the dirty
  rectangle. Lighting is never baked into the surface.
- **Depth.** Slab, stands, field, overlays, ground shadows, walls, then everything upright sorted far to near,
  particles, light, and last the few markers that must stay readable.

## Palette (tokens in `src/config.js`, mirrored in `styles.css`)

| Group | Tokens |
|---|---|
| Grass | deepEmerald `#2f6b45`, freshCut `#86b85c`, sunlit `#9fcb6c`, cutDark `#629c49`, mutedOlive `#6f8f42`, shadowGreen `#3f6e3a` |
| Infield | terracotta `#b8683f`, richClay `#a85a36`, dustyCinnamon `#a8623f`, groomedEarth `#cf8c5c` |
| Architecture | vintageCream `#f1e6cf`, fadedNavy `#2b3a55`, warmCharcoal `#3a3532`, weatheredWood `#8a6a48`, brickRed `#a4493d` |
| Details | chalkWhite `#f7f3e8`, brassYellow `#d9a441`, sunFadedOrange `#e08a4a`, skyBlue `#a9d0e6` |
| Tabletop | table `#e7dcc3`, lot `#cbc8a4` |

Cut grass is always one of two greens that differ in lightness, never in hue, so stripes read without going
fluorescent. Shaggy grass drifts olive; worn grass drifts dry. No neon, no gloss, no glow except floodlights.

## Light

Four states, blended over about five seconds: **morning** (cool soft-light, long shadows toward the camera,
haze at the top), **afternoon** (clear, short shadows; arrives once real work is done), **golden hour** (warm
multiply, long side shadows; when the gates open) and **game night** (dark navy surround, a lit pool over the
field that brightens as each of the four towers comes on, glowing scoreboard, lit windows).

## The crew

| | Silhouette | Colours | Idle business |
|---|---|---|---|
| **Gus** | stocky, wide torso, moustache | navy cap, cream shirt, brick braces | sips coffee, leans, looks over the field |
| **Frankie** | small, big-brimmed cap, oversized gloves, ponytail | orange cap, sky shirt | stretches, waves at the scoreboard |
| **Pearl** (hire) | tall, long legs, wide straw hat | brass hat, brick overalls | looks, stretches |

Poses are drawn from the simulation, not played as clips: legs step with distance walked, wheels turn with
distance driven, the mower shakes only while it runs, arms do what the job is (push, drag, rake, chalk, ride).

## Interface

Sign boards: cream fill, 2 px navy outline, 10 px radius, a hard 3 px navy drop edge, no blur. Primary buttons
are navy enamel plates with a brass inlay line. Display face Alfa Slab One (painted fascia lettering), body
Barlow Condensed (scorecards and ticket stubs). Spacing 4/8/12/16/24. Touch targets 44 px or more. One sheet at
a time; when one opens in portrait the park is re-framed above it so the field is never hidden.

## Camera direction

While nobody is steering, the director frames the work in progress: the active workers and where they are
heading, at up to 2.4x the whole-park scale (capped on big screens). With the crew idle it drifts back to the whole
park. One chip switches between Whole park and Follow the crew; a pan or pinch hands control to the player
until a double-tap.

## The cut

Cut grass carries blade streaks laid along the direction the mower went (lanes, diagonals, arcs), so a stripe
reads as mown, not painted. Where long grass meets a fresh cut the cut side is shaded and the long side's tips
catch the light. Regrowth shows in proportion: grass at 70% looks 70%.

## Never

A dashboard. Progress bars standing in for the work. Neon greens. Realistic tiny people. Hard 8-bit dithering.
