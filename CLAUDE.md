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
│       ├── index.html # markup only (~190 lines)
│       ├── style.css  # all the styling
│       ├── core.js    # 1. scene, camera, lights, post, graphics settings
│       ├── world.js   # 2. materials, arena, floor/walls/ceiling, signage
│       ├── models.js  # 3. box humanoid, weapon models, Spartan, podium
│       ├── weapons.js # 4. player state, ability charges, roster, viewmodels
│       ├── session.js # 5. game state, menus, pause, networking, local bots
│       ├── input.js   # 6. keyboard/mouse, shooting
│       ├── effects.js # 7. fire pools, smoke, marks, arrows, burn FX
│       ├── hud.js     # 8. HUD, kill feed, audio, armory, compass
│       ├── loop.js    # 9. movement, collision, main loop
│       └── assets/    # models + textures
└── extras/            # parked features (see slide-ability.md)
```

Almost all work happens in the numbered client files above and **`mp/server.js`**.

Those nine are **classic scripts sharing one global scope**, not modules.
**The order `index.html` lists them in is the contract** — each runs after
the one before it, and anything referenced at load time must already have
run. Function declarations hoist and move freely; a top-level `const` does
not. Don't reorder the `<script>` tags, and when adding a file, put it where
its dependencies are already satisfied. Each file's header says where it sits
in the chain.

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
- Two modes: **Target Practice** (offline, client simulates, stationary bots)
  and **Multiplayer** (server simulates, **no bots** — round-based duelling).
- **Multiplayer is round-based.** Kill the opposition to take a round; first to
  `MATCH.winsNeeded` (3) takes the match, then it resets and runs again. Death
  inside a round is **elimination** — no respawn until the next round starts.
  Phases are `waiting` → `live` → `intermission` → … → `over`, driven entirely
  by the server and shipped in the snapshot's `match` block so every client
  agrees. Damage handlers all return early unless the phase is `live`.
- **There is an economy.** You start each match on `ECON.start` ($200) with no
  guns, take `ECON.win` ($200) for winning a round and `ECON.loss` ($100) for
  losing. Money resets **per match, never between rounds** — `resetEconomy`
  runs only at match start and match end.
  `PRICES` by slot: rifle 150, sniper 300, shotgun 150, pistols 50.
  You carry `MAX_MAIN` (2) mains and `MAX_SIDE` (1) side, held as an
  **ordered list** (`p.guns`, purchase order). Buying past the cap drops the
  **oldest of that category**, no refund. Number keys select by **position in
  the list**, not by weapon — first bought is 1. The mouse wheel cycles the
  same list (`cycleWeapon`), which is guns + blade and deliberately **never
  the abilities**: landing on the crossbow because you nudged the wheel would
  be miserable, so they stay on G and H.
  While the phase is `waiting` the range is a **free sandbox** — buying costs
  nothing so you can try every weapon. The cap still applies, so you cycle
  through rather than hoarding. The crossbow, smoke and blade are always yours and
  cost nothing. **Tab opens the shop**, which only trades outside a live round. A gun you
  buy arrives loaded (`refillWeapon`). `MATCH.prepMs` (30s) is the prep
  window, the same before round 1 as between rounds.
  Money and ownership are server-side: the `buy` handler re-checks phase,
  price and affordability, so a patched client can't hand itself a sniper.
  `canEquip`/`ensureValidWeapon` keep the client honest about what's in hand —
  you join holding the rifle from init, which in a match you don't own.
  If the server predates the economy it sends no `money`, and the shop says
  so (`econOnline`) rather than showing $0 and silently refusing everything. Shared gameplay numbers must be kept in
  sync between `WEAPONS` (client) and `XBOW`/`MELEE`/`STANCE_BOX` (server).
- Bots are **stationary targets** by design — they don't move or shoot. They
  exist only in Target Practice now; the server has none.
- The arena is **indoors**: flat dark backdrop, fog on the same value, a
  ceiling at `WH`, and unlit emissive panels standing in for ceiling lamps.
  There is no sky and no sun.
- **The Spartan is the player avatar**, not the bots. Bots are the cheap
  procedural box humanoids (`humanoid()`) on purpose: stationary targets
  don't earn the detail, and eight boxes cost nearly nothing.

## Features

Weapons (`1`–`5`): rifle, sniper (4× scope), shotgun (8 pellets), 2 pistols.
`G` crossbow ability — 2 charges, 30s each, flaming arrow, 90 dmg then
**12/s for 5s** on the victim. The pool it leaves burns anyone standing in it
at **18/s** — higher on purpose, because a direct hit already lands 90 up
front while a pool only hurts you for as long as you stay in it. Walk out and
you keep burning at 6/s for 5s.
Burning players show flames in multiplayer: the snapshot carries `bn` and the
client attaches the same `makeBurnFx` used on local bots.
Two separate fire lifetimes: a **person** burns for `burnMs` (5s), while the
**pool the arrow leaves on the ground** lasts `GFIRE.ms` (9s). A pool is
dropped wherever the arrow ends up — floor, foot of a wall, or under whoever
it hit. Right-click toggles ricochet on **either** ability — the crossbow
and the smoke bolt both bank off geometry once. A bounced bolt is spent:
`BOUNCE.keep` (0.55) of its speed and at most `BOUNCE.lifeS` (1.1s) left to
run, so a bank is a short shot round a corner rather than a second full
flight. Keep the client and server `BOUNCE` blocks in step.
`F` blade — 5-hit combo 22/22/28/28/70, resets on miss.
**Standing inside a cloud is handled by a veil, not by the puffs.** From the
inside the spheres cull to nothing (front-face only, you're within them) and
they're thinned near the camera to save fill rate, so the puffs alone leave
you able to see straight out. `updateSmokeVeil` draws one camera-attached
quad instead, opacity scaled by how deep you are. Deliberately **not** a
blur: `backdrop-filter` or a blur pass re-reads the framebuffer every frame,
which is the cost we're avoiding, and movement still reads through a blur.
It sits at z=-1 so your weapon stays in front, and renderOrder 850 so
detection silhouettes (900) still show — the passive works in smoke.

`H` smoke — 2 charges, 30s each, no damage. Lands a cloud (`SMOKEFX.radius`
5.5, slightly wider than a fire pool) that **tags** anyone standing in it for
4s; the thrower sees tagged opponents through walls, and the tag renews every
tick they stay in the cloud. Your own smoke can't tag you.
Both crossbow and blade use real models (`assets/crossbow.fbx`, `assets/sword.fbx`). Each
arrives as one mesh with one material, so `splitGeometryByAxis` cuts the
triangles into material groups along the model's long axis — limbs/stock for
the crossbow, grip/guard/blade for the sword. The procedural versions are
still there and stay on screen until the files load, or if a load fails.
`V` roll (~7m, 1.2s cd). Sideways rolls lean the camera (`ROLL.lean`, ~12°).
Forward/back rolls punch the FOV and tuck the weapon but **do not pitch the
view** — there was a `ROLL.arc` somersault and Jack had it removed, so don't
reintroduce camera pitch here. Other players see a full hip-pivoted tumble,
driven by roll progress sent in the state packet.
**Passive detection** — everyone has it, nothing to equip. When an opponent
makes a noise (gun, crossbow bolt or smoke bolt) it picks them out through
walls for `DETECT.revealMs` (4s), then sleeps for `DETECT.cooldownMs` (30s).
The same window also reveals **hazards** — `hazardMeshes()` currently returns
fire pools and smoke clouds as stand-ins for traps; add real traps there and
detection picks them up with no other change. Silhouettes are amber for
"heard them fire" and green for a smoke tag, and smoke wins if both apply.
Resets to ready at the start of every round.

`Q`/`E` peek left/right — hold to lean. `LEAN.angle` 0.16 rad (~9°) plus a
0.45m sideways shift of the eye, clamped by `clearLean` so you can't put your
camera through a corner. Suppressed during a roll or slide. Double jump. Sprint (Shift). Stances: `C` crouch,
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
- Character models face **+Z**, and every place we aim one already accounts
  for it: remote players get `yaw + PI`, and bots get `atan2(dx,dz)`, which
  points +Z at you. So **no extra per-model flip is needed** — `SPARTAN_FACE`
  is 0. It used to be `Math.PI`, which corrected an already-corrected angle
  and showed you the Spartan's back.
- **Replacement materials on a SkinnedMesh need `skinning: true`.** Build a
  fresh `MeshStandardMaterial` for a rigged model and it defaults to false,
  the GPU ignores the bones, and the model renders in its raw bind pose —
  standing there with its arms out. The shadow pass warns once per mesh per
  frame, which also floods the console.
- **Sketchfab FBX exports carry junk**: the Spartan ships a display
  groundplane mesh named `Floor` (drop it, or every player drags a 2.3m disc
  around) and references three `.dds` IBL cubemaps that aren't in the
  download. `fbxTexMgr` redirects those and the crossbow's missing palette
  JPG to a 1px blank so they don't 404.
- **Force `metalness = 0` on anything loaded from a file.** `fitWeaponModel`
  does this now — the sniper's GLB arrived at 0.4 and rendered dark.
- `requestPointerLock()` returns a promise that rejects in embedded frames —
  always go through `lockPointer()`.
- Viewmodel holders are built from `WEAPONS`, not the model-file list. A new
  weapon needs a holder or every model vanishes when you equip it.
- Dispose **both** geometry and material on throwaway meshes (tracer leak).
- **The global keydown handler must bail on form fields** (`typingInField`).
  It binds bare letters, and `KeyO` sits *above* the `gameState` guard and
  calls `preventDefault()` — so typing an `o` in the callsign box opened the
  graphics panel and ate the character. Any new binding inherits this; add it
  below the guard.
- **Ability charges are per-slot** (`abilityCharges` / `abilityRecharge`,
  keyed by weapon index, `ABILITY_SLOTS` lists them). They used to be two
  crossbow-only globals; with a second ability that would have meant both
  sharing one pool. Add an ability → give it `kind`, and read charges by
  `currentWeapon`, never a global.
- **Through-wall marks rely on `depthTest:false` plus `renderOrder`.** Marks
  sit at 900 and `switchWeapon` pushes the equipped viewmodel to 1000, or an
  enemy silhouette paints over your own gun. A newly loaded weapon model only
  gets that renderOrder when you next equip it.
- **Put fire out through `extinguish()`, never by zeroing `burnUntil`.** The
  burn loop skips dead bots, so a bot killed mid-burn kept its fx group
  parented to its mesh and `respawnLocalBot` made that mesh visible again —
  it came back permanently alight. Every kill path has to call it.
- **Don't let the ceiling cast shadows.** A shadow-casting lid between the key
  light and the floor drops the entire room to black.
- **Server colliders are 3D boxes (`RECTS` carry `miny`/`maxy`), and the ray
  tests must stay 3D.** They used to be full-height 2D rectangles, so you
  could never shoot over cover — and standing *on* a crate put your own muzzle
  inside a collider, which set the wall distance to 0 and made every shot you
  fired miss. `rayBoxHit` returns a true 3D distance in the same units as
  `raySphere`; the old 2D test returned a *horizontal* distance, so any angled
  shot was comparing two different scales. Keep `LAYOUT` heights in sync with
  the client's. `resolve2D`, `lineClear` and `insideWall` are still 2D on
  purpose — they only ever run at ground level.

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
- **Smoke is cosmetic cover only**: it does not block bullets or line of
  sight server-side. You can see and be shot straight through it. Making it
  actually occlude means adding the clouds to the `fire` handler's occlusion
  test, which is a real balance decision.
- The snapshot ships `mk` (who tagged you) to **every** client, and each one
  filters to `myId`. A modified client could read other people's tags — the
  same accepted tradeoff as client-authoritative movement.
- Firing while clipped **inside** a collider drops the payload at your feet,
  since the ray starts inside the box. `resolve2D` normally keeps players out
  of geometry, so it shouldn't happen in play.
- **The roll tumble pivots at the hips, and its offset must not feed back
  into the position lerp.** `animate()` keeps an interpolated base
  (`o.bx/by/bz`) and adds the tumble on top. Writing the offset straight onto
  `m.position` and lerping from it next frame compounds the error — the
  avatar ended a roll floating ~2m up and sank back down.
- Remote avatars use Euler order **`YXZ`** so `rotation.x` tips them relative
  to the way they face. With the default order it is a world-axis rotation,
  which cartwheeled anyone not facing north.
- **Peek moves the camera, not your hitbox.** The server only knows the x/z
  you send, so leaning out shows you more without exposing you. That is the
  usual lean tradeoff; closing it means sending a lean offset and applying it
  to the server's hitbox.
- **Ground fire burns whoever stands in it** — `FIRE.dps` (18), renewed every
  tick they stay. **Stepping out doesn't put you out**: you walk away alight
  at `FIRE.lingerDps` (6) for `FIRE.lingerMs` (5s). `graceMs` only covers the
  gap between ticks while you're still in it. A fiercer burn from a direct hit
  keeps precedence over the lingering rate. That is ~6s
  to kill a full-health player, in a 8.7m pool that lasts 9s: strong area
  denial, so it is the first number to turn down if the crossbow feels
  oppressive. Burns carry a per-victim `burnRate`, and walking into a pool
  takes the MAX of the two so a pool can never slow a fiercer burn. The pool's own thrower
  is immune, same rule as smoke not tagging its own thrower; drop the
  `f.by === id` check in `standingInFire` to make it burn everyone.
- **`FIRE` on the server and `GFIRE` on the client must agree** on radius and
  lifetime, or the fire you see is not the fire that hurts you. Both also
  carry `top`, the feet height above which you are clear of a pool.
- `GFIRE.radius` is 4.35 (3x `baseRadius`). Flame count and size are derived
  from that ratio, so changing the radius alone keeps the pool looking right.
- The crossbow's CreativeTrio palette texture wasn't in the download, so it's
  flat two-tone (limbs vs stock). A palette JPG would give it real colour.
- Never built: a real fail state. Bots don't shoot, so you can't lose. Wave
  survival + a difficulty toggle is the biggest remaining gameplay gap.
- Sound is synthesized; Jack finds it weak. Real `.mp3` files would help.
