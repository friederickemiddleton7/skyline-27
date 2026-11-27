# Skyline 27

A complete, original flight game that plays offline in desktop Chrome from its own static files.

You fly a light turboprop out of a steppe airfield over a seeded procedural landscape: sand and ochre
mesas, olive flats, a slate lake, a few towns, and the runway with its tower and hangars. Chase and
cockpit views (press `V`), a flight model with throttle, pitch, bank-and-turn, stall, drag, fuel burn,
damage and gear, three missions (ring run, precision landing, strike run), and a full HUD: altitude and
speed tapes, a heading ribbon, fuel / damage / throttle gauges, target bearing and mission line.

## Play

```
node serve.ts          # serves game/ at http://localhost:8080
```

Controls: `W`/`S` throttle · `↑`/`↓` pitch · `A`/`D` bank and turn · `G` gear · `V` view · `M` mission ·
`Enter` start / next · `R` restart.

## Files

- `main.ts` — the hand-in: copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`)
  and writes `dossier.json` with `buildDossier`.
- `game/index.html` — the page; loads `game/src/main.js` as a module. No network requests.
- `game/src/config.js` — tuning constants, palettes and the mission table.
- `game/src/flight.js` — the flight model: lift, drag, throttle, stall, fuel, damage, gear, touchdown.
- `game/src/terrain.js` — seeded heightfield, landmarks, runway and target ring geometry.
- `game/src/camera.js` — chase and cockpit camera with blending and no fighting.
- `game/src/hud.js` — altitude/speed tapes, heading ribbon, gauges, mission and debrief text.
- `game/src/render.js` — sky, terrain quads, aircraft, rings, runway, effects, cockpit panel.
- `game/src/mission.js` — objectives, scoring, win/lose per mission.
- `game/src/input.js` — keyboard and mouse state.
- `game/src/mathx.js` — vector, angle and projection helpers.
- `game/src/audio.js` — WebAudio engine, wind and warning tones, synthesised (no files).
- `game/src/shots.js` — deterministic states for the four screenshot modes (`?shot=…`).
- `game/src/main.js` — the loop and the state machine.

## Screenshots

`screenshots/` holds four real renders of the game's own code, captured from a desktop Chromium at
1280×720 through the `?shot=` modes listed in `shots.json`.

## License

MIT.
