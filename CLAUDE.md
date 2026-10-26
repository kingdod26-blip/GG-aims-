# Bot Strike — project context

Browser FPS built with Three.js. No game engine: the browser is the runtime,
Three.js does rendering, and physics/collision/netcode are hand-written.

**Owner:** Jack. Address him as Jack.

## Layout

```
GG aims/
├── fps-game.html      # standalone single-player range (older, less featured)
├── mp/                # THE MAIN GAME — work here
│   ├── server.js      # Node + Socket.IO authoritative server
│   └── public/
│       ├── index.html # the whole client (render, UI, netcode, gameplay)
│       └── assets/    # models + textures
└── extras/            # parked features (see slide-ability.md)
```

Almost all work happens in **`mp/public/index.html`** and **`mp/server.js`**.

## Running it

```bash
cd mp
npm install        # first time only
npm start          # http://localhost:8200
```

Kill a stuck server with `taskkill //F //IM node.exe`. The server can take
~5s to bind; the first `curl` often returns 000 — retry before assuming failure.

## Deployment

- GitHub: https://github.com/kingdod26-blip/GG-aims- (private)
- Live: https://bot-strike.onrender.com
- `render.yaml` is a Render blueprint; **`git push` auto-deploys**.
- Free tier sleeps after ~15 min idle (first load ~30–60s).

## Architecture

- **Damage is server-authoritative** (hitscan, arrows, melee all resolved in
  `server.js`). Movement is client-authoritative — cheatable, accepted tradeoff.
- Client sends `state {x,z,y,yaw,pitch,st}` at ~30Hz; server broadcasts a
  snapshot of players, bots and arrows at 30Hz.
- Two modes: **Target Practice** (offline, client simulates) and
  **Multiplayer** (server simulates). Shared gameplay numbers must be kept in
  sync between `WEAPONS` (client) and `XBOW`/`MELEE`/`STANCE_BOX` (server).
- Bots are **stationary targets** by design — they don't move or shoot.

## Features

Weapons (`1`–`5`): rifle, sniper (4× scope), shotgun (8 pellets), 2 pistols.
`G` crossbow ability — 2 charges, 30s each, flaming arrow, 90 dmg + 6/s burn
for 9s, right-click toggles ricochet (bounces off geometry once).
`F` blade — 5-hit combo 22/22/28/28/70, resets on miss.
`V` roll (~7m, 1.2s cd). Double jump. Sprint (Shift). Stances: `C` crouch,
`Z` prone — these shrink your server-side hitbox.
`Tab` armory, `O` graphics settings, `Esc` pause/quit.

## Gotchas discovered the hard way

- **`object.position` is read-only** in this Three.js build —
  `Object.assign(mesh,{position:...})` throws. Use `.position.set()`.
- **Additive blending is invisible** against bright backgrounds. The fire bug
  was exactly this. Use solid materials with opacity.
- **Tone mapping and the HDR environment were deliberately removed** (Jack's
  call). Because of that, **metalness must stay at 0** — metal with nothing to
  reflect renders black. Don't reintroduce `envMap`/`metalness` without an env.
- **Don't add point lights casually** — with no tone mapping they blow the
  ground out to white discs.
- Character models face **+Z**; a player's yaw describes a **−Z** look
  direction, so remote avatars need `yaw + PI`. The Spartan has its own 180°
  correction (`SPARTAN_FACE`) on an inner pivot.
- `requestPointerLock()` returns a promise that rejects in embedded frames —
  always go through `lockPointer()`.
- Viewmodel holders are built from `WEAPONS`, not the model-file list. A new
  weapon needs a holder or every model vanishes when you equip it.
- Dispose **both** geometry and material on throwaway meshes (tracer leak).

## Testing notes

Verify in the browser via `javascript_tool`, not by eyeballing. Two traps:
- Calling `loop()` synchronously gives `dt ≈ 0`, so anything time-smoothed
  (FOV, stance, velocity) won't move. Force a timestep:
  `frameGate=0; last=performance.now()-16; loop();`
- Set `SETTINGS.fpsCap = 0` first or the frame limiter skips your frames.
- Reset ability state (`rollT`, `slideT`, cooldowns) between checks — leftover
  state silently invalidates results.

## Parked / possible next

- **Slide is disabled** behind `SLIDE_ENABLED` — see `extras/slide-ability.md`.
- Jack may supply better `.glb` weapon models to swap in (procedural crossbow
  and blade are placeholders).
- Never built: a real fail state. Bots don't shoot, so you can't lose. Wave
  survival + a difficulty toggle is the biggest remaining gameplay gap.
- Sound is synthesized; Jack finds it weak. Real `.mp3` files would help.
