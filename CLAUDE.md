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
- **The room holds `MATCH.maxPlayers` (5).** A sixth connection is refused
  with a `full` event before it is ever added to `players`, and the client
  says so and returns to the menu rather than sitting in an empty arena.
- **Moving a player server-side does nothing on its own.** Movement is
  client-authoritative, so the client just keeps broadcasting its old
  position over the top. Every forced move bumps `p.tp`; the client adopts
  the server's position whenever that stamp changes **and echoes `tp` back in
  its state packets**, so the server can ignore position from packets already
  in flight. Both halves are needed: without the echo the teleport is undone
  for a few frames, which was long enough for someone parked on the resupply
  circle during prep to collect the cash the instant the round went live. Without it the round
  WINNER never moved between rounds — they were alive throughout, so nothing
  made them take the new spawn, and they stayed face to face with whoever
  respawned nearby.
- A round with **nobody left standing** goes to whoever died last (`diedAt`),
  not to a draw. Killing someone while you are on fire can finish you in the
  same tick, and throwing that round away felt wrong — you did outlive them.
- **Round starts use `spreadSpawns`**, which picks spots at least
  `SPAWN_APART` (22m) apart and prefers ones with geometry between them, so
  nobody can be shot before they have moved. It scores rather than rejects:
  with five people in one room a perfect no-sightline set may not exist, so
  it takes the best of a bounded search instead of looping forever.
- **The scoreboard shows rounds won only.** It used to print `wins · kills`,
  but a kill IS a round win here, so that was the same number twice. Kills
  still break ties in the sort order. Its header carries the room count
  (`#roomCount`, "3/5" against `MATCH.maxPlayers` from the snapshot), green
  until the room is full and red at the cap. Multiplayer only — the practice
  range's "players" are local targets, so it renders blank there.
- **Multiplayer is round-based.** Kill the opposition to take a round; first to
  `MATCH.winsNeeded` (3) takes the match, then it resets and runs again. Death
  inside a round is **elimination** — no respawn until the next round starts.
  Phases are `waiting` → `live` → `intermission` → … → `over`, driven entirely
  by the server and shipped in the snapshot's `match` block so every client
  agrees. Damage handlers all return early unless the phase is `live`.
- **A dropped connection PAUSES the match, it does not end it.** The room
  dipping below `minPlayers` used to throw the match away and call
  `resetEconomy`, which zeroes `wins` — so one tab losing its socket wiped
  everybody's score, and the board read 0 wins no matter how many rounds you
  had taken. Chrome throttling a background tab until socket.io's heartbeat
  times out is enough to do it, which is exactly what playing in two tabs
  does. Now the phase goes to `paused` for `MATCH.rejoinMs` (60s) with
  `round` and every `wins` left alone; enough players returning resumes the
  SAME match at a buy window, and only the grace running out abandons it.
- **A player who reconnects in time gets their own score back.** On
  disconnect their wins/money/guns are held in `parked`, keyed by a token the
  client keeps in `localStorage` (`bs_tok`, sent as socket.io `auth.tok`) —
  not by socket id, which is new on every connection, and not by name, since
  two tabs are both "Player". Rejoining inside the window restores and clears
  the entry.
- **There is an economy.** You start each match on `ECON.start` ($200) with no
  guns, take `ECON.win` ($200) for winning a round and `ECON.loss` ($100) for
  losing. Money resets **per match, never between rounds** — `resetEconomy`
  runs only at match start and match end.
- **Losing a round costs you your guns.** The round winner carries their
  loadout into the next round; everyone else has `p.guns` cleared and buys
  again out of the payout. A genuine draw strips nobody — nobody lost. The
  client needs no special handling: it takes `guns` straight off the snapshot
  and `ensureValidWeapon` drops it back to the crossbow or blade. Note the
  squeeze this creates — lose round 1 and $100 only covers a pistol.
  `PRICES` by slot: rifle 150, sniper 300, shotgun 150, pistol 50, pistol X
  100 — Pistol X hits for 40 against the Pistol's 30, so matching their
  prices left no reason to ever buy the Pistol.
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
  exist only in Target Practice now; the server has none. They carry a
  health bar (`updateBotHealthBars`) that needs **no billboard maths** —
  the bots already turn to face you every frame and a plane's normal is
  +Z, so a child with identity rotation points at you for free.
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
makes a noise (gun, crossbow bolt or smoke bolt — all three call
`noiseMade`) it picks them out through walls for `DETECT.revealMs` (4s),
then sleeps for `DETECT.cooldownMs` (30s). A blade swing is deliberately
silent. It is **hearing, so it has a range**: `DETECT.range` (40m). The
arena is 120x120, so map-wide detection meant a shot from the far corner lit
you up. Out of earshot nothing happens at all — the listener's cooldown is
not spent either, so you are not punished for a noise you could not hear.
It reveals **people only**. It used to also draw fire pools and smoke clouds
through walls, treating them as stand-ins for traps, but traps do not exist
yet — that was inventing a feature. `revealHazards` is kept as a no-op so
the call sites mark where it would go back in. Silhouettes are amber for
"heard them fire" and green for a smoke tag, and smoke wins if both apply.
Resets to ready at the start of every round.

`Q`/`E` peek left/right — hold to lean. `LEAN.angle` 0.16 rad (~9°) plus a
0.45m sideways shift of the eye, clamped by `clearLean` so you can't put your
camera through a corner. Suppressed during a roll or slide. Double jump. Sprint (Shift). Stances: `C` crouch,
`Z` prone — these shrink your server-side hitbox.
`Tab` armory, `O` graphics & HUD settings, `Esc` pause/quit.
`SETTINGS.hitZone` toggles the zone-coloured hit marker and its label back
to the plain white one. It lives in the settings panel with the graphics
options and saves with them, but the presets deliberately leave it alone —
picking PERFORMANCE shouldn't rearrange your HUD.

## Hit zones

Bullets are zoned: **head ×2.5, torso ×1.0, arms and legs ×0.65**. Each zone
is a sphere per stance in the `ZONES` table, so crouching and going prone
still shrink you. **Head and torso are exactly the old two-box model** —
head 1.70/0.30, torso the former body sphere 1.05/0.55 — so nothing that
used to connect reads differently. Arms wrap the torso and legs sit under
it, meaning limbs only ever ADD hits that previously missed. The table lives in **both** `mp/server.js` and
`mp/public/weapons.js` and must stay in step, or target practice teaches the
wrong aim.

The **head sphere is fitted to the model**: its head box is 0.26×0.28 at 1.68
with a helmet above, so the head occupies y1.54–1.87 and is 0.15 half-wide,
and the sphere is r0.19 at 1.70. It used to be r0.30 — reaching 14cm down
into the chest and 13cm of empty air above the helmet. Because it now hugs
the head, **a head hit simply wins**; that was unsafe at r0.30, which is why
the old code had to fall back on nearest-entry against the body.
An **`upper`** sphere covers the shoulders and upper arms: the torso sphere
tops out at y1.60 while the arm boxes run to 1.75, so without it the upper
arms swallowed shots entirely.
**Training aids** in the settings panel, all target-practice only via the
`training(key)` helper: `showBoxes` draws the hitboxes, `infAmmo` stops the
mag emptying, `noCooldown` stops ability charges draining and clears the roll
cooldown. They are gated to practice on purpose — ammo and charges are
client-side, so honouring them in a match would just be a cheat switch.

Turn on **HITBOXES** in the settings panel (target practice only) to see all
of this drawn on the bots. It is generated from the same `HITBOX` table that
`hitZone` tests, so the picture cannot drift from the behaviour.
A body hit is then split by **how central it is** — the perpendicular
distance from the shot line to the target's vertical axis, against `CORE_R`
(0.26). Inside that it's the torso, outside it's an arm. It is NOT a second
sphere: a sphere small enough to exclude the arms also excludes the upper
chest, so central shoulder-height shots would have scored as arm hits. The
model is only ~0.41 wide (torso to ±0.25, arms 0.27–0.41), which is why an
"arms" sphere *outside* the 0.55 body sphere never registered at all.
Legs are only consulted when neither head nor body connected.

Crossbow bolts are still flat damage, zones don't apply to them.

## Resupply crate

The big crate dead centre of the map is a pickup. Walk inside `RESUPPLY.radius`
(5m, drawn as a ring on the floor) and your ammo is topped up. In a match it
also pays `RESUPPLY.cash` ($100), but that is **one prize per round for the
whole room** — the first player to reach the crate takes it (`resupplyBy`)
and nobody else can until the next round. Everyone else still gets ammo, and
ammo refills every time anyone re-enters. The claim is broadcast so the ring
greys out and the room knows it has gone.
The server owns the money, the client owns ammo and refills its own, so target
practice does the proximity check itself in `loop.js`.

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
- **The ceiling is in `wallMeshes` / `RAY_BOXES`, never in `colliders` or
  `RECTS`.** Bullets and arrows must stop at it, but those two lists also feed
  2D movement (`resolve2D`, `insideWall`, `lineClear`), and a box spanning the
  whole arena there would shove every player sideways out of the map.
- **Only a TOP face holds a bolt.** A wall, the side of a crate or the roof
  stops it dead and it falls straight down from the point of contact,
  landing wherever it comes to rest. Nothing hangs in mid-air on a wall
  or dangles from the ceiling. Ricochet reflects exactly **once**
  (`bounces` starts at 1); after that the bolt obeys the same rule. **The
  floor is not a collider box** — it's the `a.y < 0` test — so it carries
  its own ricochet branch, or a banked shot dies on the ground.
- **A bolt that runs out of life mid-air fizzles onto the ground beneath**
  rather than vanishing. A floor ricochet lands there: it skips upward and
  the post-bounce life cap expires before it comes back down.
- **Payloads land at the height the bolt stopped**, not on the floor. `dropFire`
  / `dropSmoke` and `spawnGroundFire` / `spawnSmoke` all take a y, and "am I
  standing in it" is measured relative to the pool's own height — so a pool on
  a crate burns people on that crate, not under it.
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
