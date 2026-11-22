# Crimson X — project context

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
│       ├── config.js  # 0. WHERE THE SERVER IS (runs before core.js)
│       ├── i18n.js    # 0. EN / 简体中文 strings and t() (also before core.js)
│       ├── core.js    # 1. scene, camera, lights, post, graphics settings
│       ├── maps.js    # 2. THE ARENAS AS DATA — the server requires this too
│       ├── lighting.js#    THE LIT ARENA — baked light, the floor's mirror (unnumbered, see below)
│       ├── world.js   # 3. materials, arena geometry, floor/walls/ceiling, signage
│       ├── models.js  # 4. box humanoid, weapon models, Spartan, podium
│       ├── weapons.js # 5. player state, movement speeds, abilities, roster, viewmodels
│       ├── session.js # 6. game state, menus, pause, networking, local bots
│       ├── input.js   # 7. keyboard/mouse, shooting
│       ├── effects.js # 8. fire pools, smoke, marks, arrows, grenades, burn FX
│       ├── hud.js     # 9. HUD, kill feed, audio, armory, compass
│       ├── loop.js    # 10. movement, collision, main loop
│       └── assets/    # models + textures
└── extras/            # parked features (see slide-ability.md)
```

Almost all work happens in the numbered client files above and **`mp/server.js`**.

Those ten are **classic scripts sharing one global scope**, not modules.
`maps.js` is the exception that proves the rule: it is pure data with no
THREE and no `document`, because **the Node server requires that same file**.
Keep it that way or the server stops booting. `i18n.js` sits outside the
numbering with config.js for the opposite reason: it depends on nothing and
everything after it wants `t()` at load time. `lighting.js` is unnumbered
too, so the ten keep their numbers: it loads between maps.js and world.js,
runs nothing at load but definitions, and is called from `buildArena`.
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

The project lives at `C:\Self\Self projects\Game project\GG aims` (it moved from
`Self game project`; probe scripts that hardcode the old path need `mpclient.js`
repointed). Kill a stuck server with `taskkill //F //IM node.exe`. The server can take
~5s to bind; the first `curl` often returns 000 — retry before assuming failure.

## Deployment

- GitHub: https://github.com/kingdod26-blip/GG-aims- (private)
- Live: https://crimson-x.onrender.com
- `render.yaml` is a Render blueprint; **`git push` auto-deploys**.
- Free tier sleeps after ~15 min idle (first load ~30-60s).
- **The client can be hosted apart from the server, and should be.** It used
  to be inseparable: `index.html` pulled `/socket.io/socket.io.js` out of the
  Node process and `io()` connected same-origin, so a sleeping server was not
  a slow game, it was a BLANK WHITE PAGE — nothing to render, because the
  thing serving the page is the thing asleep. On a host that idles after 15
  minutes nearly every new visitor got that, and a blank tab for 30-60s with
  no spinner reads as a dead link.
  `public/config.js` now owns the server address. `MP_SERVER` is `''`
  (same-origin) on localhost and when the page's HOST equals `SERVER_URL`'s
  host, so `npm start` and the Node box serving the client on its own are
  both unchanged; anywhere else it is `SERVER_URL`, the one line to edit.
  **That test matches the host exactly, never the domain.** It was
  `/\.onrender\.com$/`, which held while Render ran only the Node box — but a
  Render STATIC SITE is also `*.onrender.com`, so the client would read its
  own address, decide the server was right there, and open a socket against
  a host that only serves files. The flip side is that `SERVER_URL` must be
  right: rename the service and the live client points at an address that no
  longer answers. `scratchpad/configcases.js` runs the resolver against a
  stubbed `location` for all seven cases, including the two Render ones that
  cannot be reached from a dev machine. Every call goes through `mpUrl()`, socket.io comes from a CDN
  pinned to the server's version, and `?server=` overrides the address on a
  LOCAL page only — on a real one a crafted link could aim a player's client,
  and the reconnect token it sends, at someone else's server.
  **`render.yaml` now declares both**: the `crimson-x` web service (the
  server, `rootDir: mp`) and a `crimson-x-play` static site publishing
  `./mp/public`. One blueprint, both deploy on push. A Render static site
  suits this repo because it is PRIVATE — GitHub Pages wants a paid plan for
  that — and Render is already connected. Cloudflare Pages works too. The menu is
  then up in about a second and target practice — which is entirely
  client-side — is playable while the server wakes behind it.
  The server allows any origin by default (`ALLOW_ORIGINS`, comma-separated,
  narrows it). There is nothing an origin check protects here: no cookies, no
  browser-held session, and `auth.tok` is sent explicitly by the client
  rather than attached by the browser.
  `refreshRooms` knocks on `/rooms` at page LOAD rather than on click, and
  shares the in-flight request, so pressing REFRESH does not queue a second
  60s wait behind the first. While it is waking the lobby says so with a
  running count instead of "No rooms yet", which during a cold start
  describes a game nobody plays rather than a wait that ends.
- **The service name in `render.yaml` is what the URL is built from, and
  changing it here does not rename the service Render is already running** —
  Render matches blueprint entries by name, so a new name reads as a new
  service and the old one keeps serving the old URL. Rename it in the Render
  dashboard (service > Settings > Name) and keep `render.yaml` in step; the
  old address stops resolving the moment it changes.

## Architecture

- **A shot names its gun; the server supplies every number.** The fire
  handler used to read `d.dmg` and `d.range` straight off the packet, so
  three lines in a browser console bought a 99999-damage rifle with 400m of
  reach. The client now sends only `w`, the shop slot, and must actually own
  it (`p.guns`, which the buy handler owns). Damage, range, fire rate and
  pellet count all come from `GUNS` in `server.js`, **which must stay in step
  with `WEAPONS` in `public/weapons.js`**.
  Shots are also rate-limited server-side, which they never were: a trigger
  pull may send up to `pellets` packets (the shotgun sends one per pellet)
  and the next pull waits `fireRate * RATE_SLACK` (0.75, for jitter).
  Measured: a spoofed `dmg:99999` deals 26, a gun you do not own deals
  nothing, 20 packets at once land one shot, and three properly spaced
  rounds all land.
  **Test probes must buy a gun before they can shoot** — `arm()` and
  `shoot()` in `scratchpad/mpclient.js`. Probes still sending `dmg` are
  silently ignored, which looks exactly like a broken game.
- **Room creation is capped and throttled.** `/rooms/new` is unauthenticated
  and holds each reserved room for 60s, so a loop against it allocated rooms
  as fast as the network allowed. `MAX_ROOMS` (200) bounds it and
  `NEWROOM.perMinute` (6 per IP) stops one visitor reaching the cap; the
  auto-create path in `roomFor` returns null at the cap and the joiner is
  told the server is full.
- **Movement is still simulated on the client, but no longer believed on
  faith.** The server stored whatever x/y/z arrived, so a modified client
  could teleport, run at any speed, walk through walls or hover. `vetMove`
  now checks every state packet: a **token bucket** (`MOVE.maxSpeed` 20, the
  roll speed, with `MOVE.burst` 2m of unspent credit) so a stalled client can
  catch up while the SUSTAINED rate can never exceed what the game allows — a
  flat per-packet allowance with slack in it permits the slack forever, which
  is the mistake to avoid; a vertical cap and a floor/ceiling clamp; and
  `resolveBody`, which pushes you out of any box your body intersects.
  `resolveBody` is height-aware on purpose: plain `resolve2D` is 2D and would
  shove a player off the crate they are standing on, so it skips boxes under
  your feet exactly as the client does. Over-reach is CLAMPED along its own
  direction rather than rejected, so a laggy player slides instead of
  freezing. `moveAt` resets on every forced move, or the teleport itself
  looks like a speed hack.
  Measured: a 91m teleport moves you 9.8m at 19.2 m/s and never arrives, a
  5m-per-packet speed hack holds at 19.5 m/s, walking into the centre crate
  pushes you out, and a normal 7 m/s run is delivered in full.
  **Probes must walk** — `goTo()` in `mpclient.js`, which owns its intended
  position and steps that forward. Stepping from the server-reported position
  does not work: that updates at 20Hz, so it re-asks for the same spot and
  barely moves. It also strafes when it stops making progress, or it jams
  against a crate forever.
- **Ammunition is the server’s too.** It used to be counted only in the
  browser, so a patched client simply never ran out. `GUNS` now carries
  `magMax`/`reserveMax`/`reloadMs` and the server keeps `p.ammo[slot]`. One
  trigger pull costs one round however many pellets it throws — the shotgun
  sends eight `fire` packets, so the magazine is only decremented on the
  FIRST packet of a volley, reusing the rate limiter’s grouping.
  Reloads are requested by the client and timed by the server (`p.reloadAt`,
  resolved lazily in `settleReload`, so there is nothing to tick); firing is
  refused while one is in flight, and spamming the request cannot shorten
  it. The client keeps its own copy purely so the HUD ticks down instantly,
  and is corrected by an `ammo` event after every shot, buy and resupply.
  Measured: a pistol arrives with 12, twelve shots empty it, eight more
  change nothing, firing 300ms into a 1200ms reload is refused, and the
  reload lands 12 rounds taking 12 off the reserve.
- **Stopping is `COAST_RATE` 28 with a snap at `STOP_SNAP` 0.2 m/s**
  (`loop.js`). It was rate 12 with a snap at 0.02: a 7 m/s run coasted 0.58m
  over half a second, which read as ice, and kept the `steady` pistols
  inaccurate for that half second after letting go. Now 0.19m in 0.13s. The
  snap only applies while nothing is wanted, or it eats the first frames of
  pulling away from rest.
- **Damage has a direction.** The server sends the victim alone a `hurt`
  event with the attacker's position (hitscan, blade, bolt; burn ticks have
  none), and `hurtFrom`/`updateHurtMarks` in `hud.js` draw an arc round the
  crosshair for `HURT.ms`. The angle is recomputed every frame from where you
  stand and face NOW — an arc frozen at the angle it was hit from points at
  nothing the moment you turn toward it.
  **`impact` goes to the whole room, so it carries `by`**, and only the
  shooter flashes a hit marker. It used to mark every impact for everyone:
  other people's fights, and your own wounds. `kill` carries `byId` for the
  same reason (names are not unique — two tabs are both "Player").
- **Eliminated players spectate.** `spectateCamera` (`session.js`, called
  from `loop()` while `gameMode==='mp' && !me.alive`) rides behind a survivor;
  a click cycles. It is a CHASE camera on purpose: the snapshot carries yaw
  but not pitch, so first person would stare at the horizon while they aimed
  above or below it, and pitch costs a byte per player per tick plus a
  `SNAP_VERSION` bump. It is eased (its target is itself a predicted remote
  player) and pulled in along its own line when a wall is in the way.
  `specOn` hides the viewmodel; the `spectating` body class hides the
  reticle. With only two players a kill ends the round at once, so there is
  nothing to watch — testing it needs three (`scratchpad/spec3.js`).
- **A snapshot moving `me.hp` does not refresh the HUD by itself.** The
  snapshot handler writes `me.hp = mine.hp` and nothing else, so the number
  and the bar sat at whatever they last showed until something unrelated
  happened to call `updateHUD()` - a weapon switch, a buy, a reload. In
  multiplayer that is every point of damage you take: the red `dmgFlash()`
  fired from `loop()` and worked, which made it look as though only the bar
  was broken. `loop()` now calls `updateHUD()` when `me.hp` differs from
  `prevHp`, which it already tracked for the flash - the one place that
  knows hp moved. Guarded on an actual change, because `updateHUD` does real
  work and this runs every frame. Note it sits after the `document.hidden`
  early return, so a hidden tab heals on its first visible frame, same as the
  canvas check.
- **Damage is server-authoritative** (hitscan, arrows, melee all resolved in
  `server.js`). Movement is client-authoritative — cheatable, accepted tradeoff.
- **Remote players are predicted, not just smoothed.** The server hit-tests
  shots against a player's latest reported position, so whatever the client
  DRAWS has to match that or you cannot hit a moving target. The old ease was
  `o.bx += (o.tx-o.bx)*0.2` — per FRAME, so frame-rate dependent, and with no
  extrapolation at all, which left a permanent trailing error: a sprinting
  opponent was drawn 0.82m behind their true position at 60fps and 1.47m at
  30fps, against a model only ~0.41m wide. You had to lead a strafing player
  by two body widths. `session.js` now measures each remote player's velocity
  between snapshots (before overwriting `o.tx`) and `animate()` extrapolates
  by the snapshot's age PLUS `1/REMOTE_EASE` — adding the ease's own time
  constant is what CANCELS the trailing error rather than just shrinking it —
  then eases with `1-Math.exp(-REMOTE_EASE*dt)`. Error drops to 0.09m at
  60fps and 0.16m at 30fps. `REMOTE_PREDICT` (0.22s) caps the guess so a lost
  packet slides a body slightly instead of flinging it across the map; the
  cost is ~0.27m of momentary overshoot when someone stops dead, which beats
  a permanent 0.82m lag. If you change `TICK` or the client's 33ms send rate,
  re-measure.
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
- **The server runs many rooms, not one match.** `players`, `match`,
  `fires`, `smokes` and `arrows` used to be module-level globals, so five
  people filled the entire game. They live on a room now (`makeRoom`), the
  tick runs `tickRoom` per room, and every broadcast is `io.to(room.id)`
  rather than `io.emit` — miss one of those and rooms leak into each other.
  Handlers take `players`/`match`/`parked` as locals from the room at
  connection time, which is why most handler bodies read unchanged.
  `roomFor(code, tok)` picks in priority order: the room holding your parked
  score (per-room now, so without this a reconnecting player's score would be
  stranded in a room they no longer rejoin), then the room your `?room=` code
  names, then any room with people and space, then a new one. It deliberately
  skips rooms that are empty but still hold parked scores — those belong to
  someone mid-reload, and a stranger joining one would sit in a stranger's
  half-finished match. Rooms are retired when empty with nothing parked.
  Scaling follows from rooms never interacting: cost is driven by
  players-per-room, so small rooms stay cheap however many run.
- **There is a lobby, and rooms have codes.** Multiplayer no longer connects
  on click: `openLobby()` shows the room browser, which reads `GET /rooms`
  over plain HTTP (it must work before any socket exists). `GET /rooms/new`
  reserves a unique 5-letter code — no digits, and no I or O so nobody
  mistypes a 1 or a 0 — and holds that room for 60s so it survives the trip
  before its creator connects. Typing a code does NOT create a room: an
  unknown code returns `'nosuch'` and the client is bounced back to the
  browser, because otherwise every typo would strand someone alone in a new
  room. `?room=CODE` still works as a shareable link.
- **Auto room ids take the lowest free number, never a counter.** With a
  counter, leaving an empty server and coming back put you in "r2", then
  "r3", the room you had just left having been retired behind you. Note a
  room is NOT retired while it holds parked scores, so returning after a
  match was running puts you back in the room your score is in — which is
  the point of the token lookup in `roomFor`.
- **Tracers run from the muzzle when hip-firing and down the SIGHT LINE
  when aiming.** `muzzleWorld()` reads the viewmodel group's world matrix, which
  the bob/sway/recoil code rewrites every frame, so the line leaves the
  barrel and follows the weapon as it moves. The shot itself still starts at
  the camera — that is what the crosshair points at and what the server
  tests — and the tracer is drawn from the muzzle to the far end of that same
  ray, so it converges on the aim point instead of running parallel to it.
  The start blends toward the sight line as `ads` rises, because zoom
  magnifies the muzzle offset: at the sniper's 20-degree ADS FOV the same
  0.3m put the tracer ~590px right and ~550px below a dead-centre reticle on
  a 1024-wide screen, which read as the shot going nowhere near where you
  aimed. The shot itself was always exact — verified by projecting the fired
  ray back to screen space, hip and scoped, where it lands at (0,0).
- **A bolt FLIES along the aim line; only its look starts at the barrel.**
  There is no single launch direction from an offset muzzle that meets the
  crosshair at every range — aim at a convergence point and the bolt sits on
  one side of the aim line before it and the other side after. Choosing that
  point from “whatever the aim ray hits” was worse still: it jumped between
  23m, 36m and 45m depending on what happened to be BEHIND the target, so
  the bolt drifted left or right unpredictably. Before that, copying the
  camera direction from an offset muzzle sent it parallel to the aim line,
  a constant 0.41m to one side forever.
  So the simulated bolt flies straight down the aim line — measured within
  0.1° at every pitch, with zero sideways offset — and spawns ON it, 0.9m
  forward. It used to spawn `BOLT_DROP` (0.3m) below the crosshair along the
  camera up vector, because dead on the axis it appeared in the middle of
  your view and read as coming out of your face. **That cost 30cm of
  vertical aim on every shot**, which was invisible while bolt damage was
  flat and the bolt's head sphere was a fat r0.34 (0.34 > 0.30, so a bolt
  aimed at a head still clipped the bottom of it). Fitting that sphere to
  the model at r0.19 made it fatal: aiming dead at a head put the bolt 11cm
  outside it EVERY time, so the head became unhittable and every shot read
  as a torso hit. `BOLT_DROP` is gone.
  The muzzle offset is applied to the RENDERED arrow instead and decays over
  `BOLT_SHOW` (0.18s, `effects.js`), so it still leaves the crossbow to look
  at — server-driven arrows get that in `session.js`, and local ones through
  `placeArrow` / `a.vis` in `effects.js`, which is the half that did NOT
  exist and was the whole reason the drop was there. Only your own bolts get
  it; everyone else’s already look right from a distance.
  Gravity is untouched — the crossbow still arcs, and that arc is why aiming
  DEAD at a head only scores a head hit inside ~13m: the drop is
  ½·9·(d/62)², which reaches the 0.19 sphere radius at 12.7m. Measured on
  the range: head at 5m and 10m scores 90, at 15m and 20m it scores 50. Past
  that you aim above the head, as you would for any arcing shot.
- **Ability recoil must be applied AFTER the bolt leaves.** The gun path has
  always done this — there is a comment saying so — but the ability branch
  kicked `me.pitch` up BEFORE computing the direction, so every bolt left
  along the post-recoil angle: 0.6m high at 30m on the crossbow. Combined
  with the parallel-offset bug above, the crossbow was 0.74m out at 30m and
  smoke 1.11m. Both are now ~0.12m, which is just the 0.004 spread cone.
- **Both pistols are pinpoint while PLANTED, and keep their cone the moment
  you move.** They carry `steady:true`; `shoot()` treats you as planted when
  `me.hv` is under `STEADY_SPEED` (0.1 m/s), you are on the ground, and you
  are not mid-roll or slide. **Peeking with Q/E still counts as planted** —
  leaning shifts the body sideways but never writes `me.hv` (only the
  movement easing in `loop.js` does), so that requirement falls out for free
  rather than needing a special case. Standing, peeking and ADS give 0;
  walking, jumping and rolling give the normal 0.010/0.012. Every other
  weapon ignores `steady` and keeps its cone always.
- **Spread can be switched off in the practice range only**, via the
  `noSpread` setting and `training()`, which already refuses practice flags
  in multiplayer. Multiplayer always has the cone. Off, every shot goes
  exactly through the crosshair at any range and aiming only zooms. Note the
  shotgun becomes a rifle with it off — all 8 pellets land on one point, 96
  damage at any range — which is fine on a range and is the reason it is not
  a global switch.
- **The menu palette lives in four tokens at the top of `style.css`.** The
  name and the icon are crimson on near-black, so the chrome is: `--ac`
  (#ff2d4a) for borders, glows and fills, `--ac-soft` (#ff6274) for small
  accent TEXT because the saturated crimson is only ~4:1 on the background,
  `--ac2` (ember) as the far end of every gradient and `--ac-deep` so white
  on a filled button clears 4.5:1. Text is three tiers, `--t1/--t2/--t3`,
  and the dimmest is still 74% white: the old slate greys (#7f8c9a, #9aa6b2,
  #5a6472) were set against a flat mock, not against the LIVE 3D arena that
  shows through the glass panels, and OPEN ROOMS / REFRESH / BACK were close
  to invisible over a lit wall.
  **Colours that signal state are deliberately NOT themed**: the win banner's
  green reads against the lose banner's red, `#detect`'s dot is a
  green/amber/grey traffic light, the bot health bar is green/amber/red, the
  hit marker is red/white/blue by zone, and the room count flips green to red
  at the cap. Recolour any of those to crimson and a pair collapses into one
  colour. The crosshair stays green for the same reason — it has to read
  against fire pools, which are crimson and orange.
  `#lobby` was missing from the `::before` readability veil that `#home`
  has, so PICK A ROOM was white text on a white wall; both share the rule
  now. (`#mode` had it too, until that screen was folded into the menu.)
- **Practice-only settings are hidden in multiplayer.** Rows marked
  `practice:true` in `SET_DEFS` are filtered out when `gameMode === 'mp'`,
  and `renderSettingsUI()` re-runs on every open so the panel is right for
  the mode you are in. `training()` already refused to honour them there, so
  showing them only advertised options that quietly did nothing.
- **The canvas must match the viewport, every frame.** Shots go through the
  centre of the CANVAS; `#crosshair` and `#scope` are `position:fixed`, so
  they sit at the centre of the VIEWPORT. If those drift apart your aim is
  silently wrong and nothing looks broken — at 1514x1123 with a stale
  1024x768 canvas the reticle sat 245px right and 177px BELOW where the
  bullet went, which reads as "it lands above where I am aiming", and the
  error grows with how far the two sizes differ. There is a `resize`
  listener, but it cannot catch everything (a resize the page never hears
  about, a zoom change, a device-pixel-ratio switch), so `loop()` compares
  `renderer.domElement.clientWidth/Height` against `innerWidth/Height` each
  frame and re-runs `applySettings()` when they differ. Do not assume the
  listener is enough. Note the check sits after the `document.hidden` early
  return, so a hidden tab heals on its first visible frame.
- **The reticle is four arms round a dot, and the GAP is the cone.** Every
  weapon except a pellet gun fires one round down the middle, so it keeps a
  point of aim and the spread is shown by how far the arms sit off it:
  `--gap` is the cone RADIUS in pixels plus a 3px floor, so the arms never
  close into a solid plus and swallow the dot. Nothing is exaggerated. A
  planted pistol sits at the floor (3px), walking opens it to 5, a rifle hip
  is 6 against 5 scoped, and a hip-fired sniper yawns to 14 before the scope
  shuts it to 5 — which is the honest picture of a weapon that is 0.05 rad
  from the hip and 0.0015 scoped. A pellet gun still gets the ring instead,
  because eight pellets land ANYWHERE in the cone and a point of aim would
  be a lie.
  `currentCone(w, aimK)` in `weapons.js` is the ONE definition, used by the
  shot and by the reticle. It was written twice — `shoot()` had its own
  `planted` test and spread blend — and two copies of a rule like that drift;
  a reticle that disagrees with the bullet is worse than none, because you
  cannot see it lying, you just miss. Measured after the merge: the max
  deviation of 400 shots lands on the square's corner (half-cone x sqrt2) for
  every weapon and state, and a planted pistol is exactly 0.
- **The shotgun ring IS the cone, measured, not a constant.** It was a flat
  34px. Spread is an ANGLE, so how wide it lands on screen scales with the
  window height and shrinks as the FOV narrows — 34px was tuned while ADS at
  768p and is right nowhere else: hip-firing it understates the cone by 17%
  at 768p, 41% at 1080p and 56% at 1440p, so pellets land outside a ring
  that says they shouldn't and the gun reads as missing. `sizeReticle()`
  (hud.js, called from `loop()`) projects it the same way the shots are:
  half-angle over tan(fov/2) against half the viewport, reading `camera.fov`
  live so ADS and the sprint widening are both already in it, and blending
  the cone with `ads` exactly as `shoot()` does, `/0.85` included. It is the
  circle INSIDE the pattern, not around it: each axis is nudged
  independently so the pellets form a SQUARE, and the inscribed circle holds
  about 79% of them while the circumscribed one is 41% wider and mostly
  empty. Measured by wrapping `addTracer` and projecting 3200 real shots:
  76-79% land inside at hip, sprint-FOV and full ADS, max radius exactly the
  square's corner. The CSS keeps 34px as the `var(--ring)` fallback.
  **No cone means no ring.** Spread switched off in the practice range
  makes the shotgun pinpoint, and sizing a zero cone pinned the ring to
  its lower bound — a ~6px circle that reads as a broken reticle, not as
  "this gun has no spread". `reticleCone()` returns 0 for that (and for
  any weapon without `pellets`), and `sizeReticle` then drops the `spread`
  class so you get the ordinary cross, which is what every other pinpoint
  weapon shows. It owns that class for this reason; `updateCrosshair` only
  clears `ringOn` to force a re-test after a weapon change. The floor is
  14px, so a real but tight cone still reads as a ring.
- **The rifle, shotgun and both pistols show a red dot when aiming**
  (`redDot:true` in `WEAPONS`); the sniper keeps its 4x scope. There was a
  modelled tube sight round the dot and Jack had it removed — just the dot.
  `redDot` is a camera child at (0,0,-0.32), dead on the axis, because every
  shot starts at the camera, not the barrel; a dot riding the gun would move
  with recoil and sway and mark somewhere the bullet is not. Shown only when
  `ads > 0.82` and not reloading, rolling or spectating. Stance and sprint
  poses give way while aiming, and ADS recoil is gentler (rotation
  `1-ads*0.85`, kick-back `0.1-0.06*ads`).
  **Aiming is iron-sight style:** a red-dot gun comes all the way up to the
  eye, so you look straight down the barrel and the front sight's tip meets
  the dot. `aimTop` is the gun's top ALONG ITS CENTRELINE — the highest
  vertex within 4mm of it, found by `centrelineTop` in `models.js` at load.
  A point lands on the screen's centre row exactly when it is level with the
  eye, whatever its distance, so the right number is the top of the slice
  the centre column looks down — not the bounding box, which a lever or a
  rear sight off to the side can set. `AIM_GAP` is 0: a 6mm gap plus the box
  top left the tip 7-9px under the dot on every gun. Measured by marching
  rays down the centre column: 0.5px on all four now.
- **ADS accuracy arrives when the scope does.** The spread blended linearly
  with `ads`, but the scope overlay appears at `ads > 0.85`, where the sniper
  was still at 0.0088 — six times its aimed cone. Scoped HEADSHOTS were 59%
  at 50m and 30% at 70m while the scope said otherwise. The blend now uses
  `min(1, ads/0.85)`, so seeing the scope means having scope accuracy: 100%
  at both. Hip-firing a sniper remains deliberately awful (15% body, 2% head
  at 50m) — that is what the scope is for.
- **Leaning moves your body, not just your camera.** Q/E slid the camera up
  to `LEAN.offset` (0.45m) sideways but the client never told anyone, so your
  hitbox and your model stayed in cover: you could shoot from around a corner
  and nothing could shoot back. The client now sends `lo`, the offset
  `clearLean` actually allowed (already clamped against walls), and every aim
  test goes through `aimX()`/`aimZ()`, which apply it along the player's
  right vector `(cos yaw, -sin yaw)`. The remote renderer applies the same
  offset, so what you see is what you can hit — the two formulas are checked
  against each other, not just written to look alike.
- **Shots are lag-compensated.** The server tested where a player had LAST
  REPORTED being, while the shooter was aiming at what their own screen drew,
  and against a sprinting target those differ by half a metre or more — which
  is why perfectly-aimed shots passed through people. Each player's recent
  positions are kept in `p.hist` (`LAGCOMP.historyMs`, 500ms) and hitscan and
  melee rewind to `now - (rtt - LAGCOMP.lead)`, capped at 200ms so nobody on
  a bad line is shooting at ghosts. The lead term (45ms, `1/REMOTE_EASE`)
  gives some of the rewind back because the CLIENT already predicts forward.
  RTT comes from our own `ping2`/`pong2` pair — socket.io has a heartbeat but
  does not hand us the number — and is the **minimum** of the last 8 samples,
  never an average. Latency has a floor, the real network time, and
  everything else only ADDS to it. A backgrounded browser tab is the worst
  offender: Chrome throttles its timers, the reply comes back up to a second
  late, an averaged RTT climbs to something absurd, and the rewind then drags
  every target metres into the past so the shooter hits nothing. Playing in
  two tabs did exactly that: measured 1/12 shots landing with an average,
  12/12 with the minimum. The window takes ~10s to follow a genuine latency
  change, which is the right way to be wrong — under-rewinding costs a little
  accuracy, over-rewinding costs every shot.
  **Faking latency in a test by delaying only the pong does not validate the
  rewind**: the packets still arrive instantly, so it measures pure overshoot.
  It is good for proving a WRONG latency number hurts, nothing more. Arrows do not rewind: they fly on the server,
  in the present, so there is no stale view to correct.
  When no rewind is wanted the server uses the LIVE position and extrapolates
  it from `p.vx/p.vz` by up to 60ms (and never more than 0.5m), because
  history is only sampled once a tick and a 50ms-old sample is over half a
  metre at a hard strafe — which made a fast connection aim WORSE than a slow
  one. **That velocity must reject jumps**: a step implying over 30 m/s is a
  respawn or a late packet, not travel, and trusting it threw the hitbox tens
  of metres. Measured: on a fast link, 1/10 perfect shots landed before, 10/10
  after; at a simulated 150ms, 8/10 land where the shooter saw the target and
  1/10 where the server last heard it.
- **The snapshot is the entire bandwidth bill.** It goes to everyone in the
  room every tick, so anything added to it is paid per player per tick. The
  static config — `prices`, slot lists, `resupply`, the carry caps, the room
  cap, `winsNeeded` — is sent once in `welcome`; it used to ride along 30
  times a second. Positions are rounded to 2dp (centimetres, well under the
  client's own ~9cm prediction error) because `"x":12.344999999999999` costs
  20 bytes to say 12.34. With `TICK` at 20Hz instead of 30 — the client
  predicts remote players, so the longer gap barely shows — a 5-player room
  went from 249 to 131 KB/s, measured against the previous server.
  The client still accepts the static fields from a snapshot if an older
  server sends them.
- **The snapshot is binary, and split in two.** JSON spelled out a field name
  and a decimal for every value — `"hp":100` is nine characters for one byte,
  and a 20-character socket id rode along per player per tick. Now:
  `'meta'` is JSON sent only when it CHANGES (ids, names, colours, money,
  wins, kills, guns — none of which move at 20Hz) and carries the slot->id
  mapping; `'snapshot'` is a packed frame every tick holding only what moves,
  with players keyed by a one-byte SLOT. A 5-player frame went from 1337 to
  110 bytes — 130.6 to 10.7 KB/s per room, 12x less.
  **The layout comment in `server.js` and the decoder in `session.js` must
  stay in step**, which is what `SNAP_VERSION` guards: a stale client logs
  once and stops rather than misreading every field. Nothing downstream
  changed — `decodeSnapshot` rebuilds exactly the object `onSnapshot` used
  to be handed. Arrow ids are u16 now rather than `'a'+n` strings.
  Test probes share `scratchpad/mpclient.js`, which mirrors the decoder;
  change the layout and that has to change too.
- **Multiplayer is round-based.** Kill the opposition to take a round; first to
  `MATCH.winsNeeded` (3) takes the match, then it resets and runs again. Death
  inside a round is **elimination** — no respawn until the next round starts.
  Phases are `waiting` → `live` → `intermission` → … → `over`, driven entirely
  by the server and shipped in the snapshot's `match` block so every client
  agrees. Damage handlers all return early unless the phase is `live`.
- **A round ending puts the field out.** The award branch used to set
  `intermission` without `clearField()`, and neither `scorch()` nor
  `burnTick()` looks at the phase, so last round's pools burned right through
  the 30s buy window — enough to take the round WINNER from 100 to 46 while
  they shopped. It now calls `clearField()` and `douseAll()` at round end.
- **Melee tests geometry, like gunfire does.** The blade checked distance and
  cone only, so 3.4m of reach stabbed clean through a wall. It now ray-tests
  `RAY_BOXES` toward the target, in 3D so it still works over low cover you
  are standing on; hits closer than 0.1 are ignored so the crate you are
  pressed against does not block your own swing.
- **A bolt stopped by geometry falls, and nothing re-tests it.** Zeroing its
  velocity was not enough: it re-ran the wall test every tick, and a bolt
  fired point-blank — muzzle inside the crate you are flush against —
  collided at t=0 forever, hanging at the launch point for its whole 5s life
  before dropping its pool at your feet. It now sets `a.falling` and only
  gravity applies.
- **You join between rounds, never into one.** A mid-round joiner used to
  arrive alive at full health and could win a round they were not in at the
  start; with 3+ in the room, reloading was a free heal. They now arrive
  `alive: false` during a live round and `respawnAll()` brings them in at
  the next one. Note `state` still applies the `name` field while you are
  down — it used to drop the whole packet, leaving anyone sitting a round out
  as "Player-a1b2" on the scoreboard.
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
  the entry, and `parked.clear()` runs when a match restarts — held scores
  belong to the match that produced them, and without it a player who dropped
  in a match's closing seconds rejoined the NEXT one still carrying their old
  money, guns and round wins.
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
  be miserable, so they stay on G and X.
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
  exist only in Target Practice now; the server has none. **They keep the
  random heading they spawn with** (a new one on each respawn); they used
  to turn to face you every frame and Jack asked for that gone
  (2026-11-15). Facing does not change what you can hit: every hitbox is a
  sphere or the vertical `CORE_R` axis. Their health bar
  (`updateBotHealthBars`) is a child of the bot, so it turns ITSELF to the
  camera: local yaw = world yaw to the camera minus the bot's own yaw.
- The arena is **indoors**: flat dark backdrop, fog on the same value, a
  ceiling at `WH`, and unlit emissive panels standing in for ceiling lamps.
  There is no sky and no sun.
- **The Spartan is the player avatar**, not the bots. Bots are the cheap
  procedural box humanoids (`humanoid()`) on purpose: stationary targets
  don't earn the detail, and eight boxes cost nearly nothing.

## Arenas

**The arena is data, in one place: `public/maps.js`.** The browser loads it as
a script and `server.js` requires it, so there is exactly one copy of the
numbers. It used to be written out twice — a `LAYOUT` in world.js as
`[x,z,w,h,d,colour]` and another in server.js as `[x,z,w,d,h]`, the same boxes
in a DIFFERENT argument order — with nothing but a note in this file keeping
them equal. Get one height wrong and the cover you can see is not the cover
that stops a bullet. A box is an object now (`{x,z,w,d,h,mat}`), so there is no
order to get wrong.

- `arena` is a HALF-extent (60 -> a 120x120 room). The four perimeter walls,
  the roof and the lamp grid are all DERIVED from it, so a different-sized map
  changes one number rather than four wall entries. Floor, wall and ceiling
  textures tile by world metre (`texRepeat`), so a smaller map keeps the same
  grain instead of stretching it.
- Materials are NAMED (`crate`, `block`, `pillar`, `wall`), not hex colours.
  The client used to key its material table off the colour in the layout, so
  the colour was really an id and two boxes could not share a look without
  sharing a number.
- `mapRects` / `mapWallRects` / `mapCeilingRect` are in maps.js so both sides
  build their collision boxes from one function. The ceiling stays out of the
  wall rects for the old reason: that list also drives the 2D movement tests,
  and a box over the whole arena would shove every player sideways out of the
  map.

**`buildArena(map)` in world.js can run again** — the arena is no longer
welded in at page load. Three things that makes necessary, all of them
learned here: materials are CACHED by name (`arenaMat`), or a rebuild
re-downloads every photoscan; discarded geometry is DISPOSED; and
`colliders` / `wallMeshes` are emptied IN PLACE, never reassigned, because
effects.js, input.js, loop.js and session.js all hold that same array.
Measured: rebuilding foundry leaves the collider count, the wallMesh count
and `scene.children` all unchanged (21 / 22 / 59).

**Every ROOM has its own arena.** The collision lists used to be module-level
constants, so one arena served the whole server. `makeRoom` now spreads
`arenaOf(map)` onto the room — `rects` (cover plus the four perimeter walls,
for movement and line of sight), `rayBoxes` (those plus the roof, for
anything that flies), `arena`, `wallH` and `resupply` — and **every helper
that tests geometry takes the room**: `lineClear`, `resolveBody`, `vetMove`,
`resolve2D`, `randomSpawn`, `insideWall`, `spreadSpawns` and `eliminate`.
Miss one and that room is playing a map while the physics answers for
another, which is invisible until someone walks through a wall that is not
there. There is no module-level `RECTS`, `RAY_BOXES`, `ARENA` or `WALL_H`
left; if you find yourself reaching for one, you want the room.

The arena is fixed when the room is made and never changes under the people
in it — swapping it mid-match would leave everyone standing in cover that is
no longer there.

**How a map gets chosen.** `GET /rooms/new?map=<id>` creates on that arena
(an unknown id falls back to the default rather than refusing, so an older
client cannot get a dead Create button); `GET /rooms` lists every room's map
and advertises what the server has; `welcome` carries `map`, `mapName` and
`arena`, and the client calls `ensureMap(id)` — a no-op when it already
matches. `process.env.MAP` still sets what a server defaults to.

On the client the MAP card in the menu cycles through `MAP_IDS` (remembered
as `cx.map`) and builds the arena as you click — not to show it off (the menu
stands in its own set now, see The menu) but because the card's plan is drawn
from whatever is built and the range wants it standing anyway.
That pick is what CREATE ROOM asks for and what the practice range builds;
joining someone else's room adopts theirs instead. Note `startPlay` clamps
the range's spawn to `ARENA-8`: z=44 is a corner of Foundry and the WALL of
anything smaller.

**The client builds its perimeter from `mapWallRects()` too**, rather than
from four `addBox` calls carrying their own numbers. Those two agreed
everywhere except the CORNERS — the server's walls ran a metre past each end
and the client's stopped dead — so there was a metre of wall at each corner
that stopped a bullet on one side and not the other. Deriving the mesh from
the rect makes the box you see the box that is tested, by construction.
Measured: all 21 rects match on both maps, where four did not before.

**THE GAME SHIPS ONE MAP: `works`.** Jack asked for the list trimmed to it
(2026-11-14) once it combined the other three. `MAP_IDS` therefore has one
entry, `DEFAULT_MAP` is `works`, and the MAP card returns early rather than
cycling to itself — a card that rebuilds the same arena and plays the swap
sound reads as a broken button.

**The other three are not deleted: they are in
`mp/scratchpad/retired-maps.js`.** That file is outside `mp/public`, so it is
never served to a browser and never required by the server; nothing in it has
any effect until `scratchpad/works.js` reads it. Two reasons to keep it: the
combined map is BUILT from those boxes, so without the file it could only be
hand-edited, never regenerated; and they are three finished maps, a paste
from bringing one back.

`mapById` falls back to the default for an id it does not know, which is what
makes the trim safe: a saved `cx.map` of `powerstation`, an old `?room=` link
on another arena, or `MAP=substation` all land on `works` rather than on
nothing. Verified by setting `cx.map` to `powerstation` and reloading.

The three, for reference: `powerstation` is the 120m turbine hall (its own
section below), `substation` is 88m with the middle walled into three lanes,
and `station` is the first outdoor site. All three now exist inside `works` —
the hall and the compound as themselves, the site as the ground between.

`scratchpad/permap.js` is the proof that a room really simulates its own
arena rather than just reporting its name: it samples twenty spawns per room
and checks each against that map's own bound and geometry, which a server
holding one global arena would fail. Measured: 20/20 inside the bound and
none inside geometry, on both maps.

### The power station (was Foundry)

The main arena, id `powerstation`. Rebuilt from the floor up on 2026-11-13
after Jack played it: *"remove all the obstacle and build it like how a
logical power station would be like"*, with a photograph of a tokamak in its
pit for the middle — *"such a big thing would give u supplies and all"*. The
id `foundry` no longer exists; `mapById` falls back to the default, so an old
link, a saved `cx.map` or `MAP=foundry` lands here.

**THE RULE THE MAP IS BUILT ON: if it looks like a floor, it is one.** What
Jack actually reported was *"a lot of them is not able to allow me to stand
on, basically they are visually there but they are not physically there"*. A
raycast of the whole hall against `colliders` found the cause exactly: below
head height there was no mismatch anywhere, and all 8,780 mismatched square
metres sat at 5.7m — the `gallery` prop, a steel walkway with handrails drawn
along each aisle with no collision at all. It is deleted, not fixed: a
walkway you stand on has to be a box standing on the floor, which means a
solid mezzanine, and that is what the operating decks are. **Keep that probe
in your pocket** — rasterising the drawn geometry and differencing it against
`colliders` is the only way to catch this class of bug, and it caught four
more during the rebuild.

- **A turbine hall has two levels, and so does this.** The machines stand on
  an OPERATING FLOOR (`deck`, 3.2m, one per unit); the GROUND FLOOR around it
  carries the condensers and is where a casing is laid down. 3.2 is over
  `CLIMB.maxRise` (2.7) **on purpose**: the stairs are the way up, which is
  both how a real hall works and the only honest way to build a mezzanine out
  of boxes that all stand on the floor. The condensers beside each deck are
  2.6, so there is also a climb-climb route up for anyone who knows it.
- **The middle is the reactor.** A bioshield deck (2.4 — one climb, from any
  side), a ribbed stainless drum on it, a flanged lid, eight cable looms
  sweeping off the lid to the deck. The resupply sits on that deck in the
  walkway round the vessel: `resupply.y` lifts the marker ring (world.js), the
  server's 5m test is 2D and unchanged. The vessel's radius is 3.1 so the
  whole walkway falls inside that 5m — a fatter drum and the pickup would be
  unreachable.
- **NO HANDRAIL on the shield deck**, though every photograph has one. A rail
  is a thing you cannot walk through, and the deck has to be climbable from
  any side, so a drawn rail would be exactly the lie the galleries told. The
  yellow nosing does that job and it is paint.
- **A ROUND THING IS A STAIRCASE — AND IT IS DRAWN AS ONE.** ~~43mm~~. That
  figure, in the commit that introduced it, was wrong, and it is worth
  keeping the mistake written down because it is so easy to make again: the
  staircase's OUTER corners do sit exactly on the circle, and those are what
  I measured. The INNER corners between them do not, and those are the
  error. Measured properly:

  | | reactor R=3.1 | feedwater R=3.5 | cooling tower R=13 |
  |---|---|---|---|
  | 5 steps, uniform | 0.50m | 0.56m | 2.08m |
  | 5 steps, equal-area | 0.33m | 0.37m | 1.37m |
  | 9 steps, equal-area | 0.18m | 0.20m | 0.74m |

  Half a metre of vessel you could walk into, at eight places round each.
  More steps only buy a smaller fraction of the same mistake — the error
  falls as 1/N, so a cooling tower would want twenty-odd boxes a band. So
  the drums stopped being approximated: **within reach of a player a drum is
  DRAWN as the rectilinear prism its own collision boxes make** (`litDrumPrism`),
  36 sides, which reads as round from two metres and *is* the collision, by
  construction. Above reach it goes back to a smooth cylinder, where nothing
  can touch it to find out. `litDrumSteps` holds the step formula and the
  map generator uses the same one, so the two cannot drift.
  Equal-area spacing (`θ = asin √((i+½)/N)`) packs the steps toward the
  diagonal, where the error is, rather than spreading them evenly — a third
  off the worst case for nothing.
  All but the first box carry mat `hidden`; the first carries `r` and `n`.
- **A dome on a box is an invisible wall.** The feedwater tanks had dished
  tops: collision is a box of one height, so the drum stopped you at 6.5m
  where the dome had already sloped away to 5.4. Flat-topped now, with a
  0.18m taper. The vent runs all the way to the roof for the same reason — a
  pipe that stops in mid-air reads as a ledge.
- **Draw a box's FULL footprint.** The columns drew their steel 0.1m inside
  the collision box on each side. Only 100mm, but a column is something you
  hug, so it is the 100mm you feel.
- **`axis: 'z'` lays a turbine down the hall** rather than across it, which is
  how units are actually arranged (in a row, crane travelling parallel to
  them). The prop is written in an along/across frame and the axis just
  swaps which world coordinate is which. The casing is a cylinder of radius
  2.2 about an axis at 5.6m and the map's four `hidden` steps are the widths
  that cylinder really has at their heights — measured agreement 0.09m, bar
  0.2m of crown above the top step, because a box cannot be round.
- **Everything else in `props` is overhead** (crane, trusses, trays, steam
  lines, busducts) at 9m and up, and **nothing up there is shaped like a
  floor**. That is the test to apply before adding a prop.
- **Five bays of rooflight, not one.** `lamps.reachX: 2`, 7m panels on a 24m
  pitch, overcast daylight (`rgb`, `refl`, `show`), `gain: 0.95`. One strip
  down the nave looked wonderful over the machines and left both aisles and
  the entire roof in the black — and the aisles are where half the fight is.
- **`LIT_NBOX` is 44, and `litUniformsFor` now skips `step` as well as
  `column` and `hidden`.** The loop STOPS at the budget, so a map over it
  does not slow down, it quietly drops its last boxes out of the floor's
  shading. 107 boxes offer 60; the 24 stair treads alone would have pushed
  the real plant off the end. Without them it offers 36 (+4 walls = 40).
- **`mat` names what a box IS** and `LIT_DRAW` builds each kind: `deck` /
  `step` / `tower` share `plinth` (concrete with a yellow nosing),
  `bioshield` adds a hazard band, `tank` is a drum, `control` is a concrete
  base with a glazing band and a parapet whose top IS the box's top,
  `transformer` grows fins and bushings, `switch` is a cabinet row with
  emissive status lamps. FLAT draws them all as plain boxes (`arenaMat`).
- **Round geometry needs its own material** (`machineR`, `vessel`, define
  `CX_ROUND`): the edge-wear shader treats a normal between two axes as a
  worn bevel, and on a cylinder every normal is one.
- **Brushed, not polished.** The vessel at roughness 0.17 / env 1.35 was a
  mirror six metres across under a rooflight and came back as a white
  silhouette with the shape burnt out of it — the same failure the Spartan
  had on the menu. 0.34 / 0.88 / env 0.55 reads as heavy steel.
- **The plant hums** (`Sfx.plant`, `stationHum` in hud.js): transformers at
  100Hz and harmonics, turbines a low roar, by distance from the camera,
  silent at the menu and on a hidden tab. The level was chosen on paper, NOT
  measured, and nobody has listened to it yet.
- Measured after the rebuild: 107 boxes, half-turn symmetry exact (every box
  has its `(-x,-z)` twin), 62.5% of the floor clear for spawns, and the
  drawn-vs-collision probe clean over the whole hall — **0** surfaces that
  look standable and are not, **0** invisible collision bar the full-height
  columns, whose tops are at the roof and have no drawn top face to see. Not
  checked: a real multiplayer match, the frame cost, or the hum by ear.
- Re-probed after the drum fix above: **0 and 0** over the whole hall, at 1m
  spacing, with 127 boxes.

## The station (`station`) — the site, outdoors

Jack sent an aerial photograph of a two-unit thermal station and asked for it
as a map; then, while it was being built, said what he actually wanted was
the two put together — *"what you already build is for indoors, and the map
is to help you build the outdoor part"*. So `station` is one map with both:
two natural-draught cooling towers, a switchyard, the boiler house and its
stack, an oil tank farm, a quay — and a turbine hall in the middle of it that
you walk into through a door.

`powerstation` is untouched and still the full-size indoor hall. This one's
hall is smaller, because it has to fit on a site.

### A roof over walkable space (`roofRects`)

This is the piece that makes a building you can enter possible at all. A
collision box stands on the floor, so **no box can ever be a roof** — give
the hall's roof one and the hall fills up solid. But a roof never has to stop
a *player*: you walk under it, not on it. It only has to stop a *bullet*. And
the arena has had exactly that primitive since it has had a ceiling — a rect
with its own `miny`, in the 3D ray tests and out of the 2D movement tests.

`mapRoofRects(map)` generalises it. The server concatenates them into
`rayBoxes` and nowhere else; the client draws a slab and pushes it into
`wallMeshes` only. The walls are ordinary boxes with the doors simply left
out of the map.

### Open sky

Three flags, and nothing else in the engine knows or cares:

- **`sky: true`** — no roof drawn, no light fittings, a sky box instead, the
  perimeter drawn as a treeline, and the outdoor haze (`skyFogNear/Far`,
  `fogSky`). The sky box is unlit, unfogged, `depthWrite: false`,
  `renderOrder -1`, and deliberately NOT in `litMeshes`: it has no `cxBake`
  attribute and the vertex pass dies on it.
- **`skyY`** — where the bake puts its light. An overcast sky **is** one
  enormous soft source, so it is baked as the very same grid of rectangles a
  roof uses, lifted to 46m and spread wide enough to be continuous (7×7 of
  26m). That buys the thing a directional light cannot: real contact
  darkening under the pipe bridges and inside the tower basins. No new
  machinery at all.
- **`roofY`** — the lid a bullet stops at, at 76m, over the stack. Without it
  every long shot would stop dead at the height of the site fence, because
  the ceiling rect used to sit at `wallH`.

**The bloom has to be re-aimed outdoors**, in `litLights`. Indoors the only
thing over the threshold is a ceiling panel: a few hundred bright pixels in a
dark room, which is what a bloom is for. Open the roof and half the screen is
sky, all of it over that threshold, and the pass lays a flat glow over
everything — measured, **100% of pixels clipped to white with bloom on and
none with it off**. `LIT.bloomSky` puts the threshold above the sky's own
brightness. This cost an hour of chasing the wrong thing, because the first
symptom looks exactly like over-exposure.

**`buildArena` now calls `applySettings()` at the end.** The look and the post
chain depend on which map is up, and nothing re-applied them on a map change
— only on a settings click.

### The bake got a broadphase

`litBlocked` is the whole cost of the bake and it used to try every box
against every shadow ray. The early reject is five comparisons, which sounds
free until you count: ten million rays against a hundred-odd boxes is six
billion comparisons. The site is cut into 10m cells, each told which boxes
overlap it (CSR-style, two typed arrays), and a ray walks only the cells it
crosses with a DDA. **8.3s → 2.5s** on the station, and it is what makes a
143-box outdoor map affordable at all.

`litUniformsFor` also picks **the biggest** boxes for the floor shader rather
than the first ones — the loop stops at the budget, so map order silently
decided which plant got to shade the ground.

### The site

- **Cooling towers.** A hyperboloid of one sheet, `r(y) = rt·√(1+((y−yt)/a)²)`,
  which is what one actually is. Two drums of collision, not five: the
  **basin** (R 13, 2.6m — one climb, and the 2.5m of rim left outside the
  shell is a walkway all the way round) and the **ring beam** above it
  (R 10.54 to 5.6m, a straight section where the shell leaves the basin,
  which a real tower has there anyway). Both drawn as exactly their own
  boxes. The hyperboloid starts at 5.6m, out of reach from a 2.6m rim with a
  2.7m climb, so above the ring beam it can be a smooth curve safely.
- **The stack** is 68m of collision box. A box standing on the floor may be
  as tall as it likes, so there is no height at which it stops being there.
- **The hall** is 48×50 inside, two units on 3.0m operating floors with 12m
  of laydown bay between them. At 20m deep the decks left 4m and the bay came
  out a corridor.
- Switchyard portals are `lattice` (four angles and a zigzag of bracing);
  `gear` is a breaker with insulator stacks; `pipe` bridges are the only
  cover on open ground.
- **Not symmetric, and it does not need to be**: spawns are random and spread,
  there are no sides, so the map can be the shape the photograph is.

### Measured

143 boxes, 147 colliders, 127k triangles, bake 2.5–3.1s, 72% of the floor
clear for spawns. Drawn-vs-collision probe over the whole site at 2m spacing:
**2** surfaces that look standable and are not (both insulator stacks on top
of switchgear — thin, round, and nobody reads porcelain as a floor), and
**27** cells of invisible collision, all of them the 0.4m gaps *between* the
three pipes on a pipe bridge, where you stand on the pipes. Nothing else.
Four real faults it caught on the way, all fixed: drum tops wound inside-out
(u and v swapped — for an upward normal the winding is z-then-x, as
`litBox`'s own top face is), switchgear and pipe bridges drawn 0.5m short of
their collision, the switchgear cabinet inset 0.3m inside its box, and the
ring beam's top left undrawn.

Not checked: a real multiplayer match, and the frame cost.

## The works (`works`, shown as POWER STATION) — all three maps on one site

**Renamed POWER STATION on the card (2026-11-14); the id stays `works`.** Ids
are internal and stable — saved `cx.map` values, room links and `MAP=` all
key off them — so the display name changed and nothing else did.

Jack: *"combind the three map ... as big as u can and as big as u want as big
as you need"*. So 240 metres square, with the turbine hall and the substation
at the exact dimensions they already had.

**Nothing in it is re-typed.** `scratchpad/works.js` **reads** maps.js and
places the other two maps' boxes: the hall's are `powerstation`'s moved 56m
east, the compound's are `substation`'s moved 62m west. The reactor bay, both
turbine units, the column rows, the three lanes and the corner towers are
therefore exactly what they are in the maps they came from, and cannot drift
from them by being copied badly. Regenerate with
`node scratchpad/works.js` — it is idempotent, and it reads the file it
rewrites, so **repair maps.js before re-running it if it has left the file
broken** (it cannot parse its own bad output).

What had to change for them to fit together:

- **The hall's perimeter was derived from its own `arena`.** Here it is
  `cladding` with the doors left out between segments, plus a `roofRect`.
  Two doors west onto the yard, one north to the boiler house, one south to
  the quay; the east face is solid onto the service road.
- **The substation never needed a roof.** It was always an outdoor shape, so
  it becomes the walled compound it always looked like — `firewall` at 5m,
  with a gate on each of three sides.
- **`crane`, `truss` and `tray` take `x0/x1/z0/z1` and `h` now.** Drawn to
  the arena, as they were, the hall's crane would have spanned the cooling
  towers.
- **Walls are written as FROM/TO spans, not centre-and-width.** Doing that
  arithmetic in my head first time gave the hall an 80m west wall straight
  across its own doorway, and the compound a north wall of *negative* width.
  The probe for "is this doorway open" caught both.
- **`gain` is 1.0, not the station's 0.75.** The sky panels are higher (52m)
  and further apart (30m) because the site is wider, so fewer fall inside the
  bake's 38m cull radius and every surface gets less light. Measure per map;
  never inherit it.

**The yard between the two is the only ground every route crosses**, so the
step-up transformers and the resupply are in it.

### Map improvement, stage 1 (2026-11-15)

Jack supplied reference photos (`Icon Images/Pictures for power station`)
and `3D_Power_Station_Master_Prompts.md` (Prompt B: audit, plan, then
stages). Plan agreed: 1 broken-looking structures, 2 light and sky, 3 ground,
4 industrial detail, 5 checks. Stage 1, all in lighting.js, no collision
change:

- **Steam** (`litSteam`): the plume was seven stacked translucent cylinders
  and read as a glass funnel on each tower. It is now camera-facing puffs
  that rise, swell, drift and fade, animated in the vertex shader off one
  shared clock (`STEAMU.uTime`, set in `litFrame`). The two materials are
  cached in `STEAM_MATS` and never disposed - one per build would compile
  per build. Measured: 0 programs linked while playing, ~0.5ms a frame with
  the towers filling the view.
- **Tower shell**: vertical panel joints like the KKP-URA photo, no
  `litGrime` (its blotches repeat with the 6m tile and printed a grid of
  patches), a caged ladder up the curve from 5.6m (out of reach) and a hut at
  the lip.
- **Stack**: one texture tile for its whole height; concrete, with red and
  white bands only round the top fifth, soot at the lip.
- **Tower and stack shade as `cover`, not `wall`.** The wall kind strips 78%
  of the colour and adds the crimson strip's glow; it turned the aviation
  red navy.
- **`LIT_RING_BAKE`**: towerskin and stackband have their vertex bake
  averaged per 1m band (and facing), so a drum is lit evenly round under the
  sky grid instead of in patches.

Not done yet: everything outdoors is still overexposed into beige haze
(stage 2), which also tints the steam from the ground.

### Map improvement, stage 2: light and sky (2026-11-15)

The outdoor site was a beige haze: measured mean luminance 0.65-0.71 and
saturation ~0.10 (a well-exposed outdoor frame is ~0.5; the references are
0.25-0.35 saturated). Four causes, four fixes:

- **Exposure and grade are per-sky now.** `litLights` sets
  `renderer.toneMappingExposure` to `LIT.skyExposure` (1.0, against the
  hall-tuned 1.45) and the grade's new `uWarm` to `LIT.skyWarm` (0.3) and
  `uSat` to `LIT.skySat` (1.15) under an open sky in play; the menu and
  indoor maps keep 1.45 / 1.0 / 1.12. The split tone warms HIGHLIGHTS, and
  outdoors most of the screen is highlight.
- **The sky is a sphere that follows the camera** (`LIT_DOME`, moved in
  `litFrame`). It was a 280m box: the gradient streaked across its ceiling,
  and an aerial camera stood outside it. The texture is painted for a sphere:
  zenith, clouds, a hill line at the horizon, hazy fields below.
- **The haze is pale blue** (`fogSky` 0xc8d6e1, 120-640m), matching the
  horizon stop.
- **The treeline shades as `cover`**: the wall kind drew it black with the
  crimson strip.
- Steam colours run above 1: mid-grey steam beside saturated blue reads TAN
  (a contrast illusion; sampled pixels were neutral grey).

Measured after: luminance 0.49-0.59, saturation 0.20-0.29, near-white
pixels down from up to 9.4% to 3.6%.

### Map improvement, stage 3: the ground (2026-11-16)

`map.ground` (written by `scratchpad/works.js`) says what the floor is made
of: `grass` and `gravel` rectangles, and `road`s as a centreline plus width.
Anything not listed stays concrete. It is paint only - no collision, no
gameplay - and the roads replace the two yellow aisles at z = +-66.

- **Its own texture, `uLitGround`** (`litGroundTexture`), sampled before the
  markings. The markings are deliberately WORN by the roughness map, and
  grass worn like paint showed bare concrete in patches. A map with no
  `ground` gets `LIT_NOGROUND`, a transparent pixel, so indoor maps are
  untouched.
- **Ground colours are scaled into the concrete's range.** The concrete is a
  dark scan (linear 0.063 after its tint) that the site's light multiplies
  up to a light grey, so the canvas colours mean "how it looks beside that
  grey" and the shader multiplies by 0.063 / 0.53. Unscaled, gravel came out
  white and grass pale yellow. Each colour is also multiplied by the scan's
  own grain (squared), so every surface keeps texture up close.
- Grass and gravel lose 90% of the floor's mirror (`1 - 0.9 * litGround`).
- Roads draw kerbs, then asphalt, then lines, then asphalt again over every
  junction, so no kerb or line crosses a crossing road's mouth.
- Slab joints are cleared out of ground zones in the markings, and the
  crimson boundary line is indoors only now.
- **Every road edge, kerb included, is checked against the collision
  footprints in code: 0 overlaps.** The first south road ran its kerb 0.6m
  under a pipe bridge (it starts at z 68.5, not the 69 the rounded listing
  showed); it is 6m wide at z 65 now.
- Cost: lost in measurement noise (one texture read per floor pixel).

### Map improvement, stage 4: industrial detail (2026-11-16)

The rule held throughout, because it is what Jack's first complaint was
about: **anything a player can touch is a collision box, or sits closer to a
wall than a body's 0.4m radius; everything else is overhead. No walkways or
galleries** - they look standable.

- **Boiler house** (`LIT_DRAW.boiler`): a steel column every ~6.8m on every
  face (0.25m proud - inside the 0.4m a body keeps off a wall), window bands
  at three levels, louvres low down, fans/air handler/vents on the roof.
- **Pipe racks** (`piperack` prop) from the boiler house into tower 2 and
  between the towers, pipes at 7m running INTO the shells (radius 10.15 at
  that height). **The legs are 16 real boxes** of mat `column` (already
  handled by the floor shader, minimap and flat look), each 18.6m+ from a
  tower centre and overlapping nothing. 310 -> 326 boxes.
- **Pipe bridges** (`pipebridge`) carry three lagged steam lines over the
  north road at 9.5m, rising up the boiler face; placed between its columns
  (at x 68 the risers grazed one).
- **Flue** (`flue`): a ribbed duct from the boiler house to the stack, 16-20m.
- New material `lagging`: aluminium-clad insulation, the silver runs in the
  references. Transformers already had fins, bushings and a conservator.
- Lit triangles 318k -> 330k. **The server needs a restart to collide with
  the new legs** (it reads maps.js at boot; a deploy does this).

### Map improvement, stage 5: checks (2026-11-16)

- **Box overlaps: 0** across 326 boxes once concentric structures (a drum's
  own steps, the reactor's deck and vessel, a turbine's deck/pedestal/
  casing) are set aside - those share a centre by design.
- **Drawn-vs-collision probe at 0.5m (230,400 cells), in reach (< 5.6m).**
  Use ASYMMETRIC margins or thin boxes produce noise: a drawn top counts as
  supported against colliders EXPANDED 0.15m; a collision top counts as
  drawn against colliders SHRUNK 0.15m. At a 1m grid with one margin, every
  1.2m firewall, step and column showed up as a fake floor. What is left:
  - "invisible" tops: the 8 pipe-bridge covers only - documented design,
    you stand on the pipe crowns.
  - fake floors: transformer bushings/conservators (4.1-4.5m, on 3m boxes
    nobody can climb), the reactor's cable looms over the shield deck
    (3.6m, 8 cells - original art, not changed), and the 5m shed's roof
    eave, which overhung 0.35m. **Fixed: eaves overhang 0.12m now.**
- Server restart: boots on the new map, room created, a client joined and
  loaded 330 colliders including the 16 rack legs, no errors.
- Frame (whole loop, 1024x768, this machine): 4.8-9.6ms median at six
  ground viewpoints, against 16.6 for 60fps.
- Before/after at the 7 audit viewpoints. The hall interior now reads cooler
  than it did: it takes the outdoor exposure and grade, since it is on the
  sky map. Neutral, like the Vespa hall reference; not changed.

### The switchyard

The west compound was the `substation` map moved over: three walled lanes and
four corner towers. Jack sent a photograph of a real HV yard and asked for
that instead, so it is one now — four bays of `capbank` (galvanised racks
with white porcelain insulator stacks: the thing a yard is recognised by),
`gear` breakers in the aisles, grey `kiosk`s, red `firebox`es, an `hvtower`
transmission tower at each corner and two `gantry` props carrying the lines
across, with the conductors drawn as a catenary because a cylinder can only
be straight. The bays run north-south with aisles between, which is how a
yard is actually laid out and also what a map wants: long lanes along the
bays, chest-high cover across them. The old lane walls are gone; the bays do
that job and look like what they are.

- **Porcelain is white here, not brown** (`hvwhite`). Transformer bushings
  are glazed brown; outdoor HV insulators are white or pale grey, and that
  colour is most of why the photo reads as a switchyard.
- **An `hvtower` is ONE box and its steel stays inside it** at every height:
  legs splayed to the box's corners at the foot, drawing in to a narrow mast.
  The crossarms reach outside the box, at 16m and up, where nothing stands.
  It is skipped by the floor shader (`SKIP_FLOOR`): a 4m footprint that is
  four legs and some bracing would otherwise lay a solid shadow nothing casts.

## The map on screen (hud.js)

Jack: *"add a map for inside the map, so I can see where I am located"*,
then *"make the map smaller and make it extendable"*, and to keep the bots on
it. `#mapPanel` is a **150px** plan in the top-left while playing, and **M
steps it up**: small → large (340px, labelled) → the whole site (`#bigmap`)
→ back to small. One key, three answers, from a glance to a plan. The corner
size is remembered (`cx.mapsize`); the site plan never reopens on its own.
**Both corner sizes draw at the same scale** (~1.8px a metre), so growing it
shows more ground round you instead of zooming the same ground — you keep
your bearings through the change. The canvas is sized to the panel in real
pixels (capped at 2x) and drawn through a transform, so it is sharp at either
size and `drawMapPlan` keeps working in CSS pixels. The resize is a CSS
transition, which **freezes in a pane that is not painting** — measure the
size with the transition switched off, or it reads the old width. One function, `drawMapPlan`, draws
both from `currentMap` — the data the geometry and the server's collision are
built from — so neither can show a room the match is not playing.

- **North-up, not rotating.** The compass already says which way you face,
  and a plan that spins under you is much harder to read a POSITION off,
  which is the question being asked. The arrow turns instead: north is -z
  (what the compass calls N) and the canvas has +z downward, so they agree by
  construction; the forward vector for yaw is `(-sin, -cos)`, which makes the
  canvas rotation `-yaw`.
- The full map shows the whole site with the floor stencils as labels, so the
  names on the plan are the names painted on the ground.
- **Under a roof is tinted** (from `roofRects`), which is the one cue that
  says you are inside the hall.
- **It shows everyone**, the bots on the range and the room in a match.
  Asked whether a match should hide opponents, Jack said keep them
  (2026-11-14). That is information the game does not otherwise give, so it
  is a balance decision that has been made, not an oversight.
- Throttled to ~11Hz: canvas 2D over three hundred boxes, and nothing on it
  moves fast enough to want 60.
- Strings `map.title` / `map.close` are in both language packs. Adding markup
  with `data-i18n` and no strings shows the raw keys, which it did at first.

### The site plan is a blueprint (2026-11-21)

Jack sent a reference: a dark blueprint of the whole site, lettered A-H
across the top and numbered 1-8 down both sides, buildings light grey, the
big ones as an outline you can see into, area names in capitals, a legend,
YOU as a yellow arrow with a soft view cone, a green ring and red dots.
`drawSitePlan` (hud.js) draws the M view; the corner sizes still use
`drawMapPlan`. Both read `currentMap`.

- **The grid is the site cut into 8 x 8** (30m squares on `works`), so the
  references land on the site edge, not on round metres. Under the legend it
  says which square you are in ("YOU ARE IN D5"); a grid that cannot answer
  that is decoration.
- **The game has no objectives**, so the green ring is the RESUPPLY and the
  legend says RESUPPLY. Red is anyone else (range bots, or the room in a
  match) and hazards: a fire pool is an orange glow with a red dot in it,
  smoke a grey disc, both at their real radius.
- **The legend is in its own strip, left of the plan, not on it.** On the
  plan, top-left as in the reference, it covered the west cooling tower. The
  canvas is 13:10 for that strip.
- **Round plant is drawn round.** Cooling towers and the stack collide as
  rings of `hidden` boxes, which the plan skips, so they were missing from
  the plan entirely. They come from `props` now (`coolingtower` basin and
  throat, `stack`).
- **Names**: the ground stencils, plus buildings named by what the map
  already calls them (`PLAN_BOX_NAMES` by box `mat`, `PLAN_PROP_NAMES` by prop
  kind, one name under the middle of a group). A name on a light building is
  written in dark ink. The stencils stay English in Chinese: they are what is
  painted on the ground. The office (Task B) gets its name here.
- **Your arrow is yellow on every size now**, and others red, so the corner
  map and the legend agree.
- The M view is throttled to ~11Hz like the corner map, and sized to its box
  in real pixels. `cycleMap` zeroes `bigAt` so opening it draws at once.

### Three things that were clipping (2026-11-14)

Jack: *"fix the things that is clipping"*. Found by differencing the map
rather than by looking: box pairs whose footprints overlap **and whose
heights match**, which is exactly where two coplanar faces fight for one
depth.

- **A WINDING IS NOT A NORMAL, and confusing them made every drum in the
  game half transparent.** `litGrid` winds its triangles from `u × v`. With
  `u` along a wall segment and `v` straight up, that is `(-uz, 0, ux)`.
  `litDrumPrism` passed `(uz, 0, -ux)` — exactly the opposite — and then
  "corrected" it by flipping the NORMAL whenever it pointed inward. Flipping
  a normal does not flip a winding: every facet that needed no flip was left
  facing inwards and was culled. The reactor deck, both cooling towers, the
  stack, the vessel and all four tanks were rings of alternating visible
  panels and see-through gaps. It reads as holes in the geometry, because it
  is. The fix reverses the direction of TRAVEL when the winding's own normal
  points inward, which flips the winding with it.
  **Probe it from OUTSIDE.** The first test fired rays outward from inside
  each drum and reported everything missing — correctly, since the facets are
  backfaces from in there. Cast inward from outside and check the hit lands
  at the radius: 0 missed facets on all six drums, at 72 angles each.
- **The facets take a RADIAL normal, not their own.** A staircase has four
  face normals, so under a sky the ±x and ±z facets take very different
  light and the ring stripes bright/dark. Aiming each facet's normal at the
  circle it stands for makes the shading sweep round like a cylinder's while
  the surface stays exactly the boxes that stop you.
- **The shield deck is one drum, not two crossed boxes.** Two boxes of the
  same height each draw their own top, so over the 16×16 where they
  overlapped there were two coplanar faces — 256m² of flicker on the thing
  you stand on to resupply.
- **Walls BUTT, they do not cross.** Running both the side and end walls
  long gave every building corner a 1.5×1.5m overlap of two same-height
  boxes: eight more coplanar tops. End walls now span between the side
  walls' faces.
- **The hall roof sits 50mm above the walls.** Its underside was drawn at
  `y - 0.01` while the cladding's parapet tops out at exactly `y`, so every
  wall poked a centimetre through the ceiling along its whole length.

Re-checked after: **0** coplanar drawn tops anywhere in the map.

**Then a wider test, and it found more.** Same-height overlap is only one
kind of clipping; any two drawn boxes standing through each other is
another. Testing every pair found eleven: the yard's pipe bridges had been
placed as cover on the first outdoor layout's open ground, and when the
switchyard and the boiler house moved onto that ground the list was never
revisited — so pipes ran through compound walls, through capacitor racks,
through a transmission tower and the corner of the boiler house, and two
stood inside the turbine hall. A blast wall placed the same way stood 4.7m
inside the switchyard's main gate and through a kiosk. All replaced or
removed; **the only interpenetrating pairs left are the two turbine
pedestals standing on their operating floors, which is the design.**
**Run the pairwise overlap test after any layout change**, not just the
same-height one — a generator that composes old layouts will keep placing
things on ground that is no longer empty. And the new plant was drawn flush
to its boxes from the start: the capacitor racks were inset 6cm and the
cabinet lids overhung by 5-7cm, both the column mistake again.

### Measured

280 boxes, 284 colliders, build+bake **1.5s** (the broadphase
is doing the work — this is a bigger map than the station and bakes faster
than the station did before it), 73.7% of the floor clear for spawns. Every
door and gate probed open and every wall probed solid. Drawn-vs-collision
over the whole site at 3m spacing: **0** surfaces that look standable and are
not, and **4** cells of invisible collision — all four the same box corner,
where a ray hits the edge exactly and misses.

Not checked: a real multiplayer match, and the frame cost at 270k triangles.

## Upper floors: raised boxes, stairs and glass (2026-11-21)

Groundwork for a three-storey office (Task B in the handoff). Until now every
box stood on the floor: `mapRects` hard-coded `miny: 0` and the client built
the same. Nothing on any current map uses what follows yet, so **the live
site is unchanged**; it is the engine an upper floor needs.

- **A box may have a base: `{x, z, w, d, h, y?}` spans `y..y+h`.** `boxY(b)`
  (maps.js) is `b.y || 0`, so every existing box means what it meant. Carried
  through `mapRects` (server collision), `buildArena` (mesh + collider), the
  `works.js` emitter (writes `y:` only when set, so regenerating changed no
  lines), the lit arena and both map plans.
- **Lit arena:** the LIT_DRAW drawers all build from y = 0, so a raised box is
  drawn as if on the floor and the vertices it added are lifted afterwards,
  rather than teaching forty drawers about a base. **No drawer gives a box a
  bottom face** (a box on the floor never shows one), so a raised box also
  gets a concrete underside; without it you looked up through the slab. The
  bake's box list is six numbers a box now (`miny` too), so a slab shades
  the floor under it; a floor texel is only "under a crate" for a box ON the
  floor; the floor shader's contact list skips raised boxes and glass.
- **Client movement (loop.js):**
  - **Step up:** a box no more than `STEP_UP` (0.35) above the feet, with
    headroom on top, is not pushed against; you walk onto it.
  - **The feet stand on a circle (`FOOT_R` 0.25), not the centre point.**
    With a point, stairs could not be climbed: a tread is 28cm deep and the
    body 40cm round, so the body touches tread 2 (two risers up, a wall)
    before the centre is over tread 1. Side effect, accepted: you stay on a
    crate's top until your centre is 25cm past its edge.
  - **Step down:** grounded, not jumping, and the drop is no more than a
    step, the feet follow it. Before this each tread was a 17cm fall: a few
    frames in the air, no footsteps, no double jump.
  - **Head bump:** rising into a box with air under it stops at its
    underside. A jump reaches 2.2m feet / 4.0m head, so under a 4.2m slab it
    never touches; under a stair flight or a lower ceiling it does. The push
    loop skips a box whose underside is exactly at head height, or the bump
    would be undone sideways.
  - `headroom()` treats only boxes whose underside is more than a step up as
    overhead: the next tread is not over your head. `findLedge` refuses a
    climb with no room for the body where it lands, or on the way up.
- **Server:** `resolveBody` already skipped boxes above the head, so raised
  rects just work. The height clamp is `mapRoofY - 1.9` (the lid of the
  world) instead of `wallH - 1.9`: a third floor puts feet at 8.7m and a jump
  from there was pulled back to 9.1. `floorUnder()` gives the highest top
  under a point; a bolt stopped by a wall falls onto it, where it used to
  fall through everything to the ground.
- **Glass, `mat: 'glass'`: stops a player, not a shot.** It is a collider
  (movement, leaning, spawning) but NOT in `wallMeshes` on the client, and its
  rect carries `glass: true` so `arenaOf` leaves it out of `rayBoxes` on the
  server. One faint unlit mesh (`addGlass`, world.js) drawn in both looks,
  no shadow, not baked. On the plans it is a pale line; a raised box is an
  outline (`planRaised`), because a filled slab would cover its building.
- **Measured** on a temporary rig (25 treads of 0.18/0.28 up to a 20x10 slab
  at 4.2, a glass pane, a slab at 3.0), injected in the browser and never
  saved: up and down the flight walking and sprinting, **0 frames off the
  ground**; head bump stops feet at exactly 1.20 under the 3.0 slab with no
  sideways shift; can walk under the high end of a flight, not the low end;
  glass stops you 0.4 from its face; climb refused under a slab, allowed in
  the open. Server functions run in Node against the same rig: glass in
  rects, not rays; a shot passes through it; a shot up stops at 4.2.
  An MP join on the restarted server, no errors.
- **Build + bake is ~2.6s on this machine, before AND after** (timed with
  the changes stashed): the 1.5s in "The works" was a faster machine.

## The offices: a three-storey office block (2026-11-21)

Jack: *"a real indoor office, whereby it has three levels, you can search
online on how it looks like"*. Built in `scratchpad/works.js` ("THE
OFFICES") on the raised-box engine above, to the numbers real ones use:

- **Where:** x 55..95, z 80..92, south of the hall. The busbars (z 78 and
  z 94, 11m up, the full width of the site) fix the depth: 12m between them,
  which is inside the usual 12-15m window-to-window plan. Roof slab top
  11.7, parapet to 12.6; the conductors pass 1.2m clear of either face.
- **Storeys:** floors at 0 / 3.9 / 7.8, slabs 0.3 (3.6 clear: a real office
  is 2.75-3m under a suspended ceiling, and there is none here). A jump
  indoors meets the ceiling (feet stop at 1.8 above the floor, tested).
- **Facades:** a ribbon of glass (sill 0.9, head 3.3) over a render sill,
  mullions every ~3m, solid where the stairs and the core are. Entrance
  (4m, no door leaf) facing the road, a back door beside the core, a paved
  path to the kerb. Glass is `mat: 'glass'`: stops you, not a shot.
- **Two switch-back stairs**, one at each end (`stairCore`, mirrored):
  22 risers of 0.177 and 0.28 treads a storey, 1.85m flights either side of
  a full-height wall, half landing at +1.95. Treads are thin raised boxes, so
  there is a nook under the first flight. A rail on the top floor guards the
  drop over the last flight.
- **Inside:** a central lift and toilet core (closed), a double-height
  lobby with a reception counter and benches, a glass balustrade round the
  void on the first floor, a glass meeting room in the east bay on every
  floor, and desk clusters (four desks, a raised screen down the middle:
  knee-high cover with a head-high screen).
- **Slabs** are the footprint minus the stairwells, the core and (first
  floor) the lobby void, cut into the fewest boxes by `rectsMinus`.
- **Placed by faces, not centres** (`ob`): `box()` rounds a centre to 2
  places, which moved butting edges by 5mm and made overlaps.
- **Lit look:** new plain paints (`render`, `mullion`, `paint`, `carpet`,
  `desk`, `carcass`, `fabric`, `nosing`) and drawers for each office kind,
  all flush to their boxes. Ceiling light panels are a prop
  (`ceilinglights`), unlit and not baked, like the hall's. The ground floor
  is a `floor` ground zone (1.2m stone tiles: 0.6m was a moire grid at 8.5
  texels a metre), the path a `paving` zone.
- **The yard's keep-clear lines are not painted round office boxes**
  (`LIT_INDOOR`) or any raised box. They were, and drew a bright grid of
  outlines over the whole ground floor - every slab strip and tread.
- **Climbing checks the PATH now** (`segCrossesRect`): a sill is a 0.9m lip
  with glass standing on it, the landing spot beyond is clear, and the climb
  carried you through the pane.
- **Plan:** the roof slab is drawn as an outline you can see into, labelled
  OFFICES; floor slabs are not drawn; treads and screens are outlines.
- **The generator reads maps.js with CRLF tolerated**: git hands the file
  back with CRLF after a stash, and the anchor search then failed.

**Measured:** 406 boxes (map 732). Pairwise 3D overlap: 0 new pairs (only
the two turbine pedestals, by design). Walked by script: ground to top floor
up the west stair, top to first down the east, every step "ok", 0 frames
off the ground; window sill stops you 0.4 off; balustrade and top-floor rail
hold; climbing onto a sill refused; meeting-room door and back door open.
Server, in Node against the real map: a shot passes through the windows and
the meeting-room glass, stops at a sill and at a slab's underside; 0 of
2000 random spawns inside the block. MP join, standing on the first floor:
connected, no errors either side. Build + bake 1.55s; a frame inside the
office 10.0ms against 10.5ms elsewhere.

**Not done:** the ground floor is dimmer than the upper floors - the slabs
block the sky in the bake, and the ceiling panels add no light to it.

## Ladders, the pipes, and the indoor plant (2026-11-21)

Jack, in one go: *"i want to be able to climb the ladders and stand on the
pips"*, *"i wanted there to be a indoor at the boiler house too"*, *"i want to
be able to go inside the stack from the boiler house"*, *"the three buildings
behind the office i want those to have indoors too"*.

### Ladders (loop.js, `mapLadders` in maps.js)

- **A ladder is a prop of kind `ladder`: a climb line.** `x, z` (or `path`
  [[x,y,z]...] for one that follows a curve), `y0..y1`, `nx, nz` out from the
  wall toward where you hang, `ex, ez` the step off the top. `draw: false`
  when something else draws it (the cooling towers draw their own caged one).
- **Controls:** face it and press W to take hold. On it, W climbs, or
  descends if you are looking down (pitch < -0.45), so from the top you look
  down the ladder and walk onto it; S descends; Space lets go and pushes you
  off backwards. At the top the step off is a `startClimb`, a short pull-up
  (no 1.6m teleport the server would have to swallow). At the foot S releases.
- **From the top**, the grab reach is 1.25m (0.55 elsewhere) and you must
  face back along `-e`; otherwise walking off the platform edge toward the
  ladder would drop you before you came within reach.
- **No gravity and no wall push on a ladder**: every climb line is placed
  0.5m clear of solid boxes, so the server's `resolveBody` never moves you.
- Where they are: up a leg of each pipe rack (x -48 and 10), up the hall's
  north wall beside each pipe bridge (x 42.3 and 68.3), inside the stack (to
  the flue at 14m), the tall workshop's mezzanine, and both cooling towers
  (2.6m basin rim to the 33.5m lip, about 10s, to a grating landing where
  the hut used to be drawn). **The tower top is a 33.5m vantage over the whole
  site.** That is what was asked for, but it is a balance decision, so flag
  it if play says otherwise.

### Standing on the pipes

`pipewalk` boxes (drawn by nothing: the rack or bridge draws the pipes) the
width of each frame. Racks: 6.6..7.6 from where the pipes leave one tower
shell to where they enter the next, or the boiler house wall. Bridges:
8.75..9.82 between the boiler house and hall walls. They stop shots and
cast bake shadow like the pipes they stand for.

### Hollow buildings (`building()` in works.js)

`building(B, openings, wallMat, roofMat)`: four walls cut into boxes around
their openings by `rectsMinus` (in along/height space), a pane in each glazed
opening, a roof slab on top. N and S walls run the full length; W and E run
between them. `steelStair()` builds straight steel flights (risers <= 0.19,
goings 0.25). `rail()` is a 1.1m `handrail`.

- **`handrail` is MOVE_ONLY like glass** (maps.js `MOVE_ONLY`): a collider, not
  in `wallMeshes`, `glass: true` on its rect so the server leaves it out of
  `rayBoxes`. A shot goes between the rails.
- **The boiler house** (x 29..83, z -96..-68, 28m): two boiler casings through
  the middle (to 24m), steel grating galleries at 7.6 / 14 / 21 round an open
  middle with a walkway bridge between the boilers, yellow handrails on every
  edge, two straight flights up the west end (A then B then A, side by side),
  fans and mills on the ground. Window bands are real glazed openings at the
  heights the facade always drew them. Doors: 5.5m roll-up door south, a door
  onto the east pipe rack from the first gallery (west wall), a ground door
  east to the stack corridor, and the flue duct door on the second gallery.
  The roof drawer (`boilerroof`) draws what the old solid box drew outside -
  floor bands, frame columns, corner columns, roof plant - left out wherever
  it would cross a doorway (`LIT_BOILER_DOORS`; keep it in step with `bOps`).
  **The west stairs start 2m further north than first built:** at first the
  rack door opened straight onto the first flight's stairwell.
- **The stack moved from z -96 to z -88**, onto the line of the boiler house's
  east doors, and is hollow: 36 boxes, each the bounding box of a 10-degree
  piece of the ring (r 2.5..3), with the four west pieces cut away for the
  ground doorway (0..3.8) and the flue opening (13.8..17.8). The bounding
  boxes overlap each other (collision only, never drawn) and reach a quarter
  metre inward at the diagonals. The stack prop draws the ring as curved
  panels with RADIAL normals per vertex (flat panels striped like a fan),
  jambs, heads and sills at the doorways, a rim, and platform rings that are
  rings now, not discs. Open to the sky: look up from inside.
  A corridor (ground) and the flue duct (walkable, 14m) run from the boiler
  house's east wall to it; a ladder inside goes from the floor to a landing at
  the flue. Loop: boiler ground, corridor, stack, ladder, duct, second gallery.
- **Intake house**: four pumps and their header, doors north and east.
  **Workshop (78,104)**: racking, a workbench, crates. **Tall workshop
  (100,100)**: a grating mezzanine at 3.2 on a ladder, rails, crates, a lathe.
- Ceiling light panels (`ceilinglights`) under every new roof and gallery.

### Measured

Map 1077 boxes, 8 ladders. Pairwise overlap: 0 new pairs (stack ring pieces
excluded, like `hidden`). Walked by script, every leg "ok": rack ladder (2.8s)
-> along the pipes -> rack door -> down the stairs -> across the ground ->
corridor -> stack -> ladder up (4.9s) -> duct -> second gallery -> up to 21;
down the stack ladder looking down; pipe bridge up and across; tower to 33.5;
mezzanine; intake and workshop doors. Server in Node against the real map:
a shot crosses a void rail and the window bands, stops at a gallery's
underside and at the stack wall; floor under the rack is 7.6; 0 of 3000
spawns inside the boiler house or the stack. MP join: standing on the pipes
and hanging on the stack ladder, no errors. Frame 5.5-6.4ms.
**Build + bake is ~2.4s now** (1.5s vertex bake, 0.7s floor bake): it runs in
slices behind the menu, so it is not felt, but it grows with every surface.
New building surfaces use 3m tessellation, not the cover's 0.75m, which
brought it down from 3.5s.

**Not done:** the boiler house's machines read near black indoors (the vertex
bake only sees sky through the windows), and the flat look has no ladders.

## The PAC-9, the overcast, and the edge of the world (2026-11-21)

Jack, after playing Saltline (`Mini games/SALETINE`): "improve my game base
off this, as in the game looks and feel and especially the gun, just use
that gun to replace the rifle if u can, and the graphic and how it took
cared of the boarders are good, but i dont want you to add the bots, thats
a strict no". So: no enemies, no new bots, and per his standing rule nothing
about firing (shoot(), tracers, recoil, spread, sounds, stats) was touched.

**This reverses "Saltline is to be read, not shipped" for ONE thing, at his
request: the rifle IS Saltline's PAC-9.** Saltline has no licence; it is
Claude Fable 5.2's game for Felix Rieseberg (Anthropic), credited in the
README and in drawn.js. Everything else below is technique, written here.

### The rifle (drawn.js, `PAC9`)
- `assets/pac9.bin` (980KB, ~550KB gzipped) is the model's finished geometry,
  read out of the running Saltline once: a copy of its page with
  `window.__vm=e` after `e.name="viewmodel-pac9"`, then an exporter that
  walked the group. 11 meshes: 4 finishes of the gun (anodised, phosphate,
  polymer, matte), the bolt, the tan magazine + brass (one group), the
  stencil markings (a decal with its own PNG in the header), the right hand +
  index finger, the left hand. Quantised: int16 positions per mesh bbox,
  int8 normals, uint16 tints, indexed. `pac9Build` unpacks it.
- **Colours are linear** and go in with `setRGB`; the per-vertex tint is a
  MULTIPLIER (up to ~40 on the gloves), not a colour. The finish shader
  (`pac9Detail`) is Saltline's: object-space noise varies roughness and bumps
  the normal - scuffs on aluminium, turned rings on steel, stipple on
  polymer. Rain was taken out. The brass and glove textures lived on the GPU
  in Saltline and could not be read back, so those two are plain (glove base
  x0.4 stands in for its weave).
- **Placement keeps the tracer honest**: the model sits at `PAC9.at` in the
  rig so its muzzle lands on (0, 0, -0.55) in gun space, which is exactly
  where `muzzleWorld()` (effects.js) starts tracers. effects.js unchanged.
- **The viewmodel lens.** Saltline draws its gun through a second camera at
  54 degrees. Here a weapon may carry `vm` (hip pose, ADS distance, cant,
  `viewFov`); loop.js scales the gun's view-space x and y by
  tan(fov/2)/tan(viewFov/2) - the same picture with one camera. Only the
  PAC-9 has `vm`; every other gun takes `VM_POSE`, the old numbers, and
  `gun.scale` goes back to 1 on a switch (checked).
- **The sight**: Saltline's coated-glass shader with the sky it reflects set
  to ours, and its centre dot removed - the game's own red dot (camera-fixed,
  where the shot goes) sits inside the 65 MOA ring. `aimTop` is the window's
  centre (0.069), so ADS looks through the glass.
- **Hands**: Saltline's gloves replace drawArm for slot 0. `VM_RIGS[0]` maps
  them for `armsFrame`: left hand = the handguard pose, magAt = that plus
  `PAC9.magTrip` (Saltline's own mag-grab pose), mag = the magazine group.
- Until the file loads (or if it fails), slot 0 keeps `drawRifle`.

### The overcast (lighting.js, core.js)
- The bake always lit the site as an overcast sky; the sky is now painted as
  one. **Overcast is brightest at the zenith** (CIE: horizon ~1/3), so the
  gradient runs bright overhead to a grey-blue horizon = `LIT.fogSky`
  (0x9da4a8), with darker cloud masses and a small warm break at `EDGE.sun`.
- **The dome's material colour is x1.8.** r128 takes the fog's hex as linear
  and decodes the sky texture from sRGB, so the same stop came out 0.34 in
  the sky and 0.62 in the haze. At 1.8 they meet, and the far world fades
  INTO the sky instead of sitting on a pale band.
- Haze: `skyFogNear 18, skyFogFar 430` (was 120/640). Outdoors only:
  `skyGain 0.55` on the bake, exposure 0.95, saturation 0.85, contrast 0.32.
  Outdoor slab 0xa9adb0 (indoors unchanged). Grass muted to an olive verge.
- `_litDir` = `EDGE.sun`, 25 degrees up in the south-west: the key only
  lights moving things, so this is longer player shadows, nothing else.
- **Metal reflects the sky outdoors**: `litSkyEnv()` is a PMREM of the
  overcast (bright top, grey horizon, warm sun lobe, dull ground);
  `litLights` swaps `scene.environment` to it in play outdoors and back to
  the hall's room at the menu. This is what makes the gun read as metal.
- Grain used a sine hash on the screen UV that drew a faint lattice over a
  smooth grey sky; it is Hoskins' hash12 on whole pixels now. (A grid you
  still see in the PANE's screenshots is the pane shrinking 1024px to 800 -
  read the canvas itself to judge.)

### The edge of the world (lighting.js, `EDGE`, `litBoundary`, `litFarWorld`)
- The treeline wall is gone outdoors. The boundary is a 3.6m precast wall
  (inner and outer faces, piers every 6m, coping, baked as `concrete`) with
  a palisade to 6.2m (alpha-tested texture, posts, unbaked). The server's
  11m collision wall is unchanged; above 6.2m it is air you cannot pass.
- Past it, ONE unlit mesh with shading baked into vertex colours
  (MeshBasic + fog): fields, tree belts (puff-cluster broadleaf, tiered
  conifers) at r 200-290, three corridors of lattice pylons leaving the
  site with catenary conductors (LineSegments), a town NE with a church and
  two towers, a neighbouring works NW with two banded chimneys, a gas holder
  and tanks, a second station's cooling towers far S, and a hill ring at
  455. Red aviation lights (Points, unfogged) flash in `litFrame`.
- Everything is inside ~460m because the camera's far plane is 500 and the
  haze is total by 430, so nothing pops.
- Lit look only; the flat look keeps its walls.

Measured: lit 3.0ms / flat 2.1ms a frame (forced finish), no console errors,
ADS / reload / switching checked in the pane.

### Same day, Jack's follow-ups
- **The LIGHTING row is gone** ("does not make sense"): FLAT was never a
  lighting choice, it swapped in the old arena - on the power station, bare
  grey boxes and a beige wall. core.js forces `SETTINGS.look = 1` after
  loading saved settings, so nobody is left stuck in FLAT; a machine where
  `LIT_OK` fails still falls back by itself. The flat code paths remain.
- **Every gun wears the PAC-9's gloves** (`gloveEveryGun`, drawn.js), placed
  by each gun's own `grip` and `fore`: the right hand keeps its offset from
  the PAC-9 grip [0,-0.1,0.073], the left its offset from the handguard
  bottom [0,-0.021,-0.236] (a drawn gun's fore-end bottom is `fore.y + 0.01`).
  The reload trip is the old one measured from the new spot. Slots 5+ (the
  abilities and the blade) swap their right drawArm too (`HOLD_ARMS`).
  drawArm is only seen until pac9.bin loads.
- **The rifle no longer moves more than the dot.** The lens stretch (vk)
  applies to the resting pose and the model only, not to the motion; and
  `vm.motion` (0.6 on the PAC-9) scales the reload/stance/sprint offsets and
  the kick's ROTATION of the viewmodel, because a gun drawn twice as close
  to the eye swings its sight ~1.5x further for the same angle. gunKick
  itself and the camera's recoil are unchanged.
- **The dosing house** (the 14x12x7 shed at -100,-60 by the cooling towers)
  is hollow: `building()` with a 4m door north toward the towers, a door
  east, window bands, a bunded pair of tanks, two dosing pumps on a header,
  a panel, a bench, ceiling lights. 0 overlaps, 0 of 5000 spawns inside.
  `shedwall` and `bwall` joined `LIT_INDOOR`, which had been drawing a
  keep-clear outline round every wall piece on the floor INSIDE the hollow
  sheds.
- **The other guns, brought up to the PAC-9** ("improve on the model for
  other guns and refer to the rifle"). Three things, in order of effect:
  1. *Finish*: `M_STEEL/M_DARK/M_POLY/M_POLY2/M_TAN/M_WOOD` are now `dmatL`
     materials - dark LINEAR colours and the PAC-9's `pac9Detail` shader
     (kind 0 anodised, 1 steel, 2 polymer). The operator's third-person
     rifle shares them.
  2. *Pose*: every drawn gun returns a `vm` (mountGun copies it to
     WEAPONS[slot].vm): the long guns use the PAC-9's lens (54) set back by
     how far behind the grip their stocks run; the pistols use 64 and sit
     out at arm's length with both hands in view. All have `motion: 0.6`.
  3. *Detail* (helpers `dRail`, `dScrew`, `dKnurl`, `dKnob`, `dDecal`):
     sniper - scope rail, ring caps and screws, knurled objective and
     eyepiece, open flip cap, three turrets, bolt shroud, fluted barrel,
     ported brake, M-LOK slots, trigger and guard, sling cups, butt ribs,
     markings; shotgun - receiver rail, ghost-ring rear and protected post
     with a dot, vented heat shield, a six-shell side saddle (red hulls,
     brass heads), sling loop, loading port, pins, markings; pistols -
     front and rear serrations, barrel hood and extractor, three-dot
     sights, slide stop, takedown and mag release, rail slots, stippled
     panels, magwell, markings; the heavy one adds a ported compensator and
     lightening cuts.
  `built.aimTop` overrides the centreline probe where the highest point on
  the line is not the sight line (the shotgun's ghost ring). Checked by
  projecting the sights at full ADS: shotgun post (0, 0), ring on the same
  line; pistols front/rear within 0.006 NDC of centre.

## The cooling tower tops (2026-11-22)

Jack: "make the full top of the tower and not just a little platform, just
make it like how the top of a real cooling tower would look like". The 1.8m
grating landing is gone. What a real natural-draught shell has up there,
and what is now drawn (`litTowerTop`, lighting.js, from the prop's `rim`):
- the shell's INSIDE face (`litCylIn`: litCyl with normals and winding
  turned round), in its own darker material `towerin` - on the outside
  colour the bake, seeing only sky over the lip, made it nearly white;
- the cap ring (cornice) at the lip;
- an inspection gallery the whole way round: galvanised grating 1.4m wide
  centred on the lip (r = R(33) +/- 0.7), cantilevered both sides on
  brackets every 10 degrees, toe boards, and a yellow two-rail railing on
  each edge; the outer railing has a 1.5m gate where the caged ladder
  arrives (the ladder's own angle, atan2(0.93, 0.36));
- four steady red aviation lights (`redlamp`, MeshBasic over 1 so the bloom
  holds them) and eight lightning rods on the outer rail, with two
  down-conductors running down the outside of the shell beside the ladder;
- down the throat, on the ring beam's top at 5.6m: the cooling deck - a
  dark eliminator floor, 24 radial distribution headers, a ring main and a
  central riser.

Collision (works.js, THE TOWER TOPS): 72 `ringdeck` boxes per tower, each
the bounding box of a 5-degree sector of the annulus (33.3-33.5), and
`ringrail` posts every 0.6m on both edges (1.1m, gaps of 0.52 - a 0.8m body
cannot pass), skipped across the gate. `ringrail` is in MOVE_ONLY (maps.js):
shots pass, players do not. Both draw nothing themselves (LIT_DRAW) and are
left off the site plan. The map went from 1108 to 1570 boxes.

Checked: client - walking inward stops at r 7.46, outward at 8.04, a 600-
degree lap never leaves 33.5, walking out of the gate takes the ladder.
Server - floor 33.5 round the rim (an exact sector seam samples 5.6 for the
bolt's floorUnder, harmless), the throat open to 5.6, a shot passes the
rail and stops on the deck, 210 move packets round the ring, none refused.

**The shotgun's sights went back to flat** the same day ("make the aim flat
like before"): the ghost ring and protected post are gone, the bead is the
sight again (`aimTop: 0.044` given outright - the centreline probe misses a
6mm bead), it aims at the old 0.43m, and `vm.adsPlain` fades its lens out as
it comes up, so the aimed picture is exactly the old one.

## Clutter and wear, first pass (2026-11-22)

From the Saltline comparison: its port carries 7.7 loose objects per 100 m2,
about half turned off the grid; the works carried 0.4 and none. Jack: "Yes,
start it".

- **The kit** (lighting.js, THE CLUTTER KIT; `LIT_KIT` merged into
  LIT_DRAW): drum, drums4 (on a pallet, strapped), ibc, barrier (jersey),
  pallets (stack, each a little off true), palletload (boxed, wrapped,
  strapped), gascage, reel (cable drum, axle along X), skip, van, forklift,
  toolcart, bin, gen, cabin, lighttower. Each is a real box kind with
  collision - cover, and shots stop on it. Paints are `LIT_KIT_MATS`
  (muted on purpose: a drum a year in the weather is not catalogue blue).
- **Turned boxes.** A box may carry `ry` with its footprint `fw` x `fd`:
  the build loop draws it about that footprint and rotates the new vertices
  and normals about the box centre; its collision `w` x `d` is the turned
  footprint's bounding box (a few cm generous at the corners, never short).
  The emitter writes `ry, fw, fd`. Only kit boxes are turned. The grime
  pass skips turned boxes, and kit boxes get no keep-clear outline
  (LIT_INDOOR).
- **Placing** (works.js, CLUTTER AND WEAR): `kit(kind, x, z, ry, h)` refuses
  anything that would overlap an existing box at a shared height and
  prints what it hit, so clusters are written by eye and kept honest.
  Clusters: a contractors' laydown yard SW (cabin, skip, three cable drums,
  pallets, a drum pallet, barrier line, generator cabled to a lighting
  tower, van, gas cage, cones), the dosing house's chemical store, a pipe and
  drum yard north of the boiler house, loading at the boiler house's south
  and west doors (forklift), cable drums in the HV yard, drums and bins at
  the quay and workshops, stock and tool carts along the turbine hall's
  walls with a coned-off job and a hose, and drums on the boiler house
  floor. 72 items, 63 turned, 0 refused.
- **Loose things** (no collision): the `clutter` prop's `items` - cones,
  cable runs, hoses, signs (`LIT_SIGNS`: hv, ppe, chem, nosmk, fork, site;
  canvas-painted and weathered, on posts or flat on a wall), and `oil`
  stains, which litGroundTexture paints into the ground.
- **Ground**: the yard east of the laydown gravel is concrete hardstanding
  now (grass x -19..-5 removed) and the north drum yard has a gravel pad.
- **Wear**: `litFootGrime` lays a black decal strip (alphaMap - read from
  GREEN, so the gradient is white to black) round the foot of every box on
  the floor, 0.55 of its height up to 0.9m. NOTE the name: there was
  already a `litGrime(g, S, n, rnd)` for block textures, and a second
  function declaration of the same name silently replaced it.

Checked: 0 of 4000 server spawns touch a kit box; a shot along the
barrier line stops on the first barrier; frame ~4.5-5ms at the spawn view
(the grime layer is ~0.6ms of it). Not done yet from the comparison list:
rust runs, more signs and painted markings, wet ground and puddles,
dressing the office interiors, ambient sound.

## Jack's six fixes, and two more (2026-11-22)

- **No push on spawning.** Practice spawned at (0, 44), inside the turbine
  hall's corner tower, so collision shoved you out on the first frame.
  `clearSpawnSpot` (session.js) moves the spawn to the nearest point where
  no box stands between the floor and head height within the body's radius
  (rings of 1m, 16 bearings, up to 40m). Spawns now at (-0.7, 43.3), still.
- **The busbars are gone.** Two `busbars` props at z 78 and 94 ran three
  conductors 11.4m up across the whole site, over the offices, connected to
  nothing: leftovers from the old hall, where they hung inside it.
- **The cooling towers are solid, with a way out.** The shell above the ring
  beam had no collision: from the cooling deck you walked through it, and
  shots passed through the whole tower. `towerShell` (works.js) adds bands
  of `towerwall` sector boxes - 72 to the ring in the two bands reachable
  from the deck (inner face at the band's narrowest), 36 above - and a box
  round the central riser. A doorway faces east at deck level (the first
  shell course, drawn with `litCylArc` leaving it out, its reveals and head
  drawn), onto a railed grating landing at 5.6 and a steel stair to the
  basin rim. Checked: inside, the wall stops you at r 9.24; out of the door,
  down the stair, off the basin to the ground. Shots across the shell stop
  on it (a ray EXACTLY on z = tz threads the seam between two sectors - the
  slab test is open at the faces - so test off the seam).
- **The sword is held.** Researched: the handshake grip - handle across the
  palm and through the fist, thumb and forefinger controlling, edge in line
  with the knuckles, the blade continuing the forearm's line. The sword is
  built on the PAC-9 glove's own grip line (`PAC9_GRIP_AXIS`, the line the
  fist closes round), guard at the top of the fist, pommel under the little
  finger, then glove and sword pitched forward together (-0.5 rad) to a
  guard about 30 degrees above the forearm, and rolled on its axis so the
  flat and fuller face you. Its own pose (`WEAPONS[BLADE].vm`).
- **The sword is a LONGSWORD now, held upright** (same day, after the video
  Jack sent - a first-person longsword set for UE4, `tSYZoErN2fA`). Frames
  from it: idle is the sword nearly vertical at the right of the view, flat
  toward you, a wide blade running off the top, a cross guard curving up,
  the hilt low with the hand just under the guard. `buildSword` is a
  two-handed longsword (0.25m grip, 0.98m blade, curved quillons,
  scent-stopper pommel) built with its origin at the upper hand; held with
  pivot turn [0.35, 0, 0.12] and roll 1.5, pose x .2 y -.12 z -.52. The
  existing melee swing (loop.js) sweeps it across as a cut and was left as
  it is. Not done: their second hand on the grip during cuts (the PAC-9
  left glove is posed for a handguard, not a sword grip).
  **Lowered and leaned out** (Jack: "the sword is too up right ... a bit
  lower, as a whole and the angle too, its blocking the sight too much"):
  turn [-0.15, 0, -0.4] roll 1.5, pose x .3 y -.2 z -.5. The hilt sits low
  at the right edge and the blade leans toward the upper right corner,
  clear of the centre. The five cuts start from it unchanged.
  **Edge first, in front** (Jack: "i am slicing with the blade not the
  metal, and the swinging should be swinging infront not at the side").
  The keys only aimed the point and the roll fell wherever the shortest
  turn left it, so most cuts led with the flat. Each key is now a whole
  orientation (`bladeKeyQuats`): blade along its direction, the sword's
  +Y edge turned into the direction of travel there, and the keys are
  slerped. ALWAYS the same edge - choosing whichever edge needed less roll
  put opposite edges on two keys of one strike and it rolled flat-first
  through the middle. The forearm follows only the swing, not the roll.
  The strikes are moved to the middle of the view, arms out, angled across
  the screen (a blade aimed at the camera shrinks to a stub). Measured:
  the edge's share of the tip's motion through each strike is 0.98-1.00.
- **The charged cut** (Jack: "the right click aim should allow me to use a
  charge up swing"). With the blade out right-click no longer zooms: HOLD
  it and the sword is drawn back over the shoulder (SWORD_CUTS' sixth
  entry's first key, trembling when full), RELEASE and it comes down as one
  cut. `HEAVY` (weapons.js) and `MELEE.heavy` (server.js) - keep in step:
  under 250ms it is called off; 35 rising to 85 damage at 1.1s; +0.6m
  reach at full; resets the combo. **The server times the hold itself**
  (`meleeCharge` -> `melee` with `heavy`, 60ms slack, stale after 15s), so
  a client cannot claim a full charge. Left-click does nothing while
  charging; a weapon switch, death or pause drops the charge.
- **The five cuts are yours anytime** (Jack: "i can do it anytime anywhere
  it doesnt have to be only when i hit someone"): every swing moves the
  chain on, hit or miss, client and server; stop swinging for
  `comboWindowMs` and it restarts. Before, a miss reset it to cut 1.
  `scratchpad/meleeheavy.js` checks both on the server: heavy refused
  without a charge and after a 100ms tap; four misses then a hit lands the
  70 finisher; a 320ms charge then kills.
- **The charged attack is a STAB, charged on the left** (Jack: "the charge
  attack for the sword should be a stab", "charge at the left side and
  stab"). SWORD_CUTS' sixth entry: the charge draws the hilt back on the
  left with the point levelled in across the view, the release drives the
  hand forward to the middle along the line to the dot, holds at full
  reach, recovers. Damage, reach and the server's timing are unchanged.
- **Both hands on the sword** ("add in both hands for the swinging ...
  when using the sword"): the left hand is the right glove reflected
  through the grip's plane - a GROUP with scale.x -1 holding a clone of the
  right glove, because the glove model carries its own rotation and
  flipping its own x left the forearm pointing up out of the fist. It
  hangs from the wrist group like the right (its forearm follows a third
  of a cut) and bladeSwingFrame puts its origin, the fist, on the grip
  0.115m below the right hand every frame. Measured: 0.000mm off the grip
  through all six moves.
- **The left hand lower, the arms whole, the charge on the aim** (Jack:
  "the second hand should not be blocking the screen too much, it should be
  lower", "the main thing is not to make the whole model of the arm be
  shown", "only the elbow is allowed to be bend", "when charging the sword
  should be pointing to the aim"):
  - the left hand is turned 70 degrees round the handle (fist kept on it),
    so its forearm runs down-left instead of up across the view;
  - **Arms: the plain glove** (final, Jack: "be like the original swing
    before all this, dont show too much arm"). Jointed arms were built the
    same day - two-bone IK, an upper arm to each shoulder, an elbow joint,
    the hand turning on the grip to meet its forearm - and taken out with
    everything that led to them (a wrist bend, stretched sleeves, a
    separate forearm tube). What stays: the PAC-9 glove alone, ONE hand on
    the sword at rest and through the five cuts, the left hand on the grip
    only while a charge is held (`chargeFrom`) and through the stab
    (`swingCut === HEAVY.cut`) - `bladeArmsFrame` sets that each frame -
    and cut 3's lowered finish. Lesson: in first person, every bit of arm
    added is screen taken; the glove alone is what Jack wants.
  - the charge and the stab keys are `'aim'`: the blade laid along the line
    from the hand at that key to 8m down the crosshair (bladeKeyQuats).
    Measured: the blade's line at 8m lands at NDC (0.001, 0.002).

**The range has unlimited ammo and no resupply** (2026-11-22, Jack: "remove
the resupply in training, ammo in training should be unlimited").
`training('infAmmo')` (core.js) is always true off a match, so the magazine
never counts down there; the PRACTICE AMMO settings row is gone (nothing
left to choose). The range's local resupply check (loop.js) is gone, its
ring is hidden off a match, and both plans leave the ring and its legend row
out. A match is unchanged: the server's ammo and resupply rules stand.
Checked: 60 rifle shots on the range leave it at 30/120.

**The red dot and the sight agree under recoil** (2026-11-22, Jack: "the
actual position the bullet lands is suppose to be the same as what is
shown on the scopes aim"). Aimed, the viewmodel still TIPPED with the kick
(15% of the hip rotation, x0.6 motion: ~2 degrees on the PAC-9), so the
sight's window rose off the camera-fixed dot and aimed ~1.8m high at 50m.
loop.js now removes the tip entirely at full ADS on red-dot guns
(`adsTip`); the camera's recoil, the shot, spread and the kick back along
the barrel are untouched, so window, dot and shot rise together. Measured
with gunKick 1 at full ADS: barrel 0.00 degrees off the shot line, the
sight's aim 0.0px from the dot at 50m. **The sniper's open flip cap is
gone** (Jack asked).

## The switchyard rebuilt (2026-11-22)

Jack, with a screenshot of the south-west yard: "why does this look so
empty, where are the wires on top". Fourteen lattice legs held nothing: the
conductors over them were the `busbars` runs taken out that morning because
they also crossed the site over the offices. works.js THE SWITCHYARD and
lighting.js `LIT_PROP.switchyard` now make it a working outdoor yard:
- **Portals**: each leg pair (rows z 78 / 94, x -110..-26 every 14m) has a
  lattice beam across at 12.3-13m; earth peaks on every leg, an earth wire
  along each row.
- **Three phases** (z 82 / 86 / 90) on insulator strings under every beam,
  sagging beam to beam. **Every bay**: disconnector (`hviso`), three-pole
  breaker (`breaker`, poles along z), CTs (`hvct`), each phase dropped from
  the bus and jumpered through and back up.
- **Lines that go somewhere**: IN from the HV compound's corner tower
  (-24, 40; its arms are `HVT_ARMS`, shared with `hvtower`) onto an entry
  beam along the north row; OUT from the west portal to a terminal tower at
  (-150, 86) beyond the wall, and on west on pylons (`litFarWorld`, from the
  prop's `exit`).
- **Ground**: palisade fence (`palisade`, MOVE_ONLY - stops players, not
  shots; drawn by the prop with the boundary's cut-out material, now
  `litPalisadeMat()`), gates to the road (two), the HV strip and the
  laydown yard, DANGER signs, two floodlight `mast`s, two kiosks. The
  laydown barrier line and its sign moved outside the fence.
- **`galv` reads near white under the open sky** - the yard's steel is
  `girder`, like the legs. Flat steel trench covers read as a white stripe
  and were taken out. No keep-clear outlines on the gravel (LIT_INDOOR).
Checked: 0 overlaps among the new boxes; walking - in through the north and
east gates, stopped 0.4m off the fence and by the breakers; the server marks
the fence shots-pass; frame 2.5-5.4ms in the yard. Map 2532 boxes.
- **The five cuts** (Jack: "its the animation of the 5 swinging of the
  sword, i want you to make the swing like the video"). The video's attacks,
  read at 0.05s steps: from the upright guard the sword is drawn back (over
  a shoulder or down to one side), then CUTS in about 0.2s - an arc right
  through the view, both arms extending, the blade leaving the frame -
  holds in the follow-through and comes back up to the guard. Seen: 18.8s
  forehand diagonal, 21.1s left-to-right horizontal, 26.8/32.2s rising cut;
  35-57s is a held blocking guard, 0-4s and 23.6-25s draw/put away.
  `SWORD_CUTS` (drawn.js) is five keyframed cuts, one per combo hit: 1
  forehand diagonal, 2 horizontal, 3 rising, 4 backhand diagonal, 5 the
  finisher straight down from overhead. Each key is [time, hand offset in
  view space, blade direction]; `bladeSwingFrame` (called from loop.js when
  the blade is out, where the generic sine swing `sw` is now zero) moves
  the hand and turns the blade about the grip; the glove hangs from its
  own WRIST group and follows only 35% of the turn, so a downward cut does
  not swing the sleeve up across the view. A cut chained before the last
  one ended starts from where that one had got to. `swingCut` (input.js,
  set at the swing) picks the cut - nothing about damage, reach, timing or
  the hit test changed. Keep blade directions mostly ACROSS the screen: a
  blade pointed at the camera foreshortens to a stub.
  To read a YouTube video's frames: seek the <video>, draw it into a canvas,
  show it as a fixed <img> sized to `innerWidth` (the pane's page is 400 CSS
  px wide - an 800px overlay showed only the left half), and screenshot.
  YouTube's CSP blocks posting frames to the local receiver.
- **The sword and grenade redrawn** (drawn.js `buildSword`,
  `buildFragGrenade`, placed by `holdInGlove`): an arming sword - a blade
  tapering in width and thickness, flattened-diamond section, fullers, a
  cross guard with finials, a leather grip with risers and ferrules, a wheel
  pommel; and a modern frag - a 64mm olive steel sphere, yellow band,
  stencil, fuze, spoon down the side, clip, pin and ring. The THROWN grenade
  (effects.js makeGrenadeMesh) is the same model at 1.6x, visual only.
- **The boilers are furnaces you can enter.** The two solid 11x14x24 blocks
  are `building()`s of `boilerwall` with a door at the foot of the side
  facing the walkway, drawn by the `boiler` prop (`litBoiler`): lagged
  casing, buckstays every 3m, nine burners on the front, inspection ports,
  soot blowers, the steam drum on saddles with risers, four downcomers,
  main steam leads, a nameplate; inside, tube walls (`tubewall`: NOT
  litPatch'd - the lit look replaces lighting, emissive included, and the
  bake sees nothing in a closed box - a plain material with an emissive copy
  of its texture), burner throats glowing, platens under the roof, an ash
  floor, a work lamp. Feed pumps, a panel and instrument racks on the floor.
- **Signs on their walls**, not in front of them (the hall's hard-hat sign
  stood 0.8m off its wall; the forklift sign faced into the boiler house).
- **The site cabin is indoors**: a hollow 3.2 x 9.8m office cabin, door and
  windows toward the yard, desks, plan chest, lockers, a kettle bench, a
  ceiling light.
- **Faster with the sword**: `MOVE_SPD.bladeMul` 1.25 (walk 7.0, sprint 10.5,
  zone sprint 15 - inside the server's 20 m/s MOVE.maxSpeed).

Map: 2441 boxes (714 tower-wall sectors). 0 of 4000 server spawns inside
anything. Frame time: the pane measured ~10ms at every spot - and the
previous commit, run beside it in a worktree, measured the same, so that
is the pane's state (hidden), not this work. **Two lessons:** a `const`
touched at the top level before its declaration in the same file kills the
whole script (TDZ) - LIT_PROP, LIT_NOGRIME here; and close any other game
tab (Saltline) before timing anything.

## Lighting that makes sense (2026-11-22)

Jack: "look into the game and see the lighting, fix all the lighting that
does not make sense ... the lighting inside the main building, there isnt
any light but the whole building is very bright ... mabey its the roof not
real ... doesnt block the light comming from on top". Toured 16 spots:
- **The hall's roof was not real to the bake.** It is a `roofRect` (stops
  bullets, not players), and `litContext` only took boxes as occluders, so
  the hall was baked as open sky. The roof slab is an occluder now LESS its
  rooflight strips (`litRooflights`, the same 5m strips every 12m hallroof
  draws), and those strips are drawn on the UNDERSIDE too, glowing, so the
  daylight comes from glazing you can see.
- **No fitting lit anything.** Every `ceilinglights` panel and the new
  hall `highbay` lamps (works.js, every 12m at HH-1.2) are area lights in
  the bake (`litPanelLights` -> ctx.panels, six floats each; summed in
  `litDirect`). Office panels are binned into 4.8m cells, radiance scaled
  by how much of the cell is panel - hundreds of separate lights would be
  hundreds of shadow rays a point. Each boiler's work lamp is one too.
  `LIT.panelL 3.6, highbayL 90, worklampL 60, panelRGB` warm white. 322
  lights on works; the bake finishes ~7s after load (behind the menu).
- **Moving things are lit by where you stand** (`litDynamicLight`, in
  `litFrame`): every 6 frames `litDirect` at the camera against the
  brightest open ground sets the fill (hemi), and a ray toward the sun
  (`litBlocked`) whether the key can reach you; both ease. They are global
  lights, so other players are lit by where YOU stand.
- **Eye adaptation**: exposure rises indoors (up to `adaptMax` 1.9x,
  `adaptRate` 0.025 a frame) from that same measurement, so a lit room
  reads as lit (it is a fifth of the yard's light) and the door back out is
  bright.
- The furnace tube walls glow more (emissive 0.95/0.66/0.46); the office's
  ground-floor tiles are lighter (it shares the darkened outdoor slab).
- Measured floor light: yard ~3, hall ~1.4, office ~0.6, under the boiler
  house galleries ~0.15 (it gets exposure). Frame 6.4ms.
- A "shade" found in the open at (-30, 80) was real: a 13m lamp post's
  shadow. Check what blocks before calling a sun test wrong.

## The hall roof is walkable (2026-11-22)

Jack: "i want to be able to stand on the roof". The turbine hall's roof was
a `roofRect` only (stops bullets, not players). works.js THE HALL ROOF adds
a deck: the slab as `hallroof` boxes (HH+0.05..HH+0.6 = 16.6 top; drawn by
the hallroof prop, so LIT_DRAW draws nothing, LIT_UNDER null, off the plan)
split round the rooflight strips, which are `glass` boxes flush with the
deck - you stand on them, shots pass them, daylight passes them (glass is
MOVE_ONLY, so out of the bake's occluders and the roofRect still stops
shots from above). A rail 0.3m in from every edge, open 1.6m where each
ladder arrives; ladders up the west wall at z -40 (by the HV yard) and the
south wall at x 40 (by the road). Checked: climb, top-out at 16.6, walk
over a rooflight without dropping, rails stop you at the north and west
edges; server floorUnder 16.6 everywhere on it. (Testing note: `vetMove`
RETURNS the accepted position, it does not move `p`; feed packets at a
real running speed or the budget clips them.)

## Agents

You play an **agent**, picked in the menu's OPERATORS tab (`#agentRow`,
remembered in `localStorage` as `cx.agent`) and **locked for the match**: `startPlay` reads
it, and the server takes it once from the socket handshake (`auth.agent`) and
never again. The double jump used to be everybody's; it is Blast's
passive now. `AGENTS` in `weapons.js` and `AGENT_IDS` in `server.js` must
agree.

**Sprint belongs to everyone, and the zone makes Blast's faster.** It was
briefly Blast-in-the-zone only, which left every other agent with one speed.
`MOVE_SPD` (weapons.js) is the whole ladder: `walk` 5.6, `sprint` 8.4 on
Shift, `zoneSprint` 12 for Blast while the zone runs. Walk is deliberately
below the old flat 7 — everyone is heavier now, so holding Shift is a
decision rather than the speed you simply always have. All three stay under
`MOVE.maxSpeed` (20) on the server, which is the sustained ceiling its token
bucket allows; go past it and the server clamps you, which reads as
rubber-banding rather than speed. Measured in the range: 5.6 walking, 8.4 on
Shift, 12 on Shift in the zone, 2.8 crouched, and aiming still refuses to
sprint.

- **Aseed** (the original kit). Passive: **hearing** (the detection passive —
  the server skips non-Aseed listeners in `noiseMade`, and `#detect` is
  hidden for anyone else). V roll · G flaming crossbow · X smoke tag. One
  jump, no sprint.
- **Blast**. Passive: **double jump** (`jumps:2`). V **dash** · G **frag
  grenade** · X **the zone**.

`AGENTS[...].g` / `.x` name a WEAPONS slot when the ability is aimed and fired
like a weapon (crossbow, smoke, grenade) or a string when it is instant
(`'zone'`). `canEquip` only lets you equip your own agent's ability slots, the
armory hides the other agent's, and the three cooldown tiles are re-pointed
per agent by `configureTiles()` (`CD_ART` maps kind to icon). **Every ability
handler on the server checks `p.agent`**, so a patched client cannot throw a
grenade as Aseed or a bolt as Blast — measured both refused.

**Dash** (`DASH`): 0.45s at 20 m/s, about 9m, 5s cooldown, works in the air
and holds you level while it runs. Kept at 20 m/s because that is the
server's sustained movement limit; a faster dash would just be clamped back —
so a longer dash buys its distance with TIME, which is also what makes it
committal. It was 0.3s (~6.3m), too short to break an angle with.
**A kill clears the cooldown.** Five seconds is a long wait for an engage
tool, so winning the fight buys you the way back out. `creditKill()` in
weapons.js does it, called from everywhere a kill is credited to you: the
server's `kill` event when `byId` is yours, and each local bot death on the
range. The cooldown lives on the CLIENT — dash is client-authoritative
movement like everything else about where you stand — so there is nothing for
the server to send and nothing new to trust. It reads `agent().v`, so Aseed
is untouched by it. Measured: 9.05m travelled, a 5.0s cooldown, zero after a
kill, and Aseed's own timer left alone.

**Grenade** (`GRENADE` server, `GREN` client — keep in step): 2 charges, 30s
each, server-owned like the crossbow's (`p.gshots`). Lobbed (view direction
x17 m/s plus 3.5 up, plus half your run), gravity 14, bounces off boxes and
the floor at `bounce` 0.22, explodes 2s after the throw. It was 0.42, which
sent a frag skipping back out of the room it was thrown into.
**A BODY stops a grenade.** Players were not in the flight test at all, so one
thrown straight at someone flew through them and went off behind. They are
boxes now (`bodyBoxes`, `bodyR` 0.45 half-width, the stance's own `BODY_H`),
tested with the same `rayBoxHit` that handles cover and placed with the same
lean-aware `aimX`/`aimZ` the shots use — so what stops a frag is where the
player actually is. A body ABSORBS: it keeps `bodyBounce` 0.12 rather than
the wall figure, so the grenade drops at their feet. Two details matter. The
THROWER is skipped, or their own body swats every throw out of the air as it
leaves their hand. And a body hit must require `h.t > 0.02`, because
`rayBoxHit` returns `t: 0` with `axis: -1` when the origin is already inside
a box — a grenade resting under someone's feet would otherwise flip its
velocity every tick. Measured on the range: a live bot stops it at their feet
with 0.3 m/s left, while a dead one lets the same throw sail 4.7m further;
floor restitution measures 0.224 against the 0.22 asked for.
Measured on the server with `scratchpad/grenadebody.js`:
thrown flat at a player 6m away it goes off at z 31.3, just in front of
them, while the identical throw through empty air carries on to z 25.5 --
5.8m further. 90 inside 1.5m, linear to 0
at 5.5m, measured to the chest; geometry between blast and chest blocks it
entirely; the thrower is never hurt by their own. The explosion is a noise,
so Aseeds in earshot hear who threw it. **Grenades ride the snapshot's arrow
section with flag bit1** — no layout change, no `SNAP_VERSION` bump — and the
server clamps throw speed to 26 and the origin to within reach of the
thrower. Measured: 90 / 63 / 31 / 0 at the feet / 2.5m / 4m / 6m, and 0 with
a crate between.

**The zone** (`ZONE`): a buff on Blast himself for 25s, then 90s before it is
ready. A faster sprint (`MOVE_SPD.zoneSprint` 12 against everyone's 8.4), ADS
comes up at rate 18 instead of 10, every cone x0.55 through `currentCone`
(shot and reticle alike), +10 HP/s, and a reload at `ZONE.reloadMul` (0.6) of
its usual length.
**The reload multiplier has to be applied on BOTH sides.** The server owns
the clock that decides when you may fire again (`p.reloadAt`); the client
owns the magazine sounds and the progress bar, all of which go through one
`reloadMsNow(w)` in weapons.js so the bar, the two mag sounds and the refill
timer cannot drift apart. Shorten only the client and the bar finishes early
while the gun is still refused. Measured: a rifle's 1600ms becomes 960ms in the
client, and on the server (`scratchpad/zonereload.js`) a shot fired 1050ms
into a reload is refused normally -- the magazine is still three rounds
down -- and lands in the zone, where the reload has already pushed four
rounds up out of the reserve.
**Note what an `ammo` event does NOT prove.** The server sends one to
correct the client when it REFUSES a shot as well as when it lands one,
so from outside the two look identical; the probe reads the RESERVE
instead, which only moves when a reload really completes. **Regen is the server's** (hp is server-owned; the range
does it locally), and the server ANSWERS every `zone` request with the timers
— the duration and readiness, or a refusal saying when — so the client's
tile and `zoneUntil` come from it, not from guessing. Measured on the server:
30 -> 40 -> 50 -> 60 -> 70 over four seconds. A crimson edge glow
(`#zoneFx`, body class `inzone`) shows while it runs, and its tile is lit and
counts the 25s down before it starts the cooldown.

Probing as an agent: `client(name, tok, code, port, agent)` in
`scratchpad/mpclient.js`. Note a crossbow bolt and the pool it leaves burn at
12 + 18/s, which outpaces the zone's regen — killing the target in a regen
test is the test's fault, not the regen's.

## Features

Weapons (`1`–`5`): rifle, sniper (4× scope), shotgun (8 pellets), 2 pistols.
`G` crossbow ability — 2 charges, 30s each, flaming arrow, 90 to the head /
50 to the body, then
**12/s for 5s** on the victim. The pool it leaves burns anyone standing in it
at **18/s** — higher on purpose, because a direct hit already lands 90 up
front while a pool only hurts you for as long as you stay in it. Walk out and
you keep burning at 6/s for 5s.
Burning players show flames in multiplayer: the snapshot carries `bn` and the
client attaches the same `makeBurnFx` used on local bots.
Two separate fire lifetimes: a **person** burns for `burnMs` (5s), while the
- **Health potions: five a round, scattered, one use each.** `placePotions`
  scatters `POTION.n` (5) at least `POTION.apart` (20m) from each other and
  `clearOfCrate` (12m) from the resupply ring, so the middle of the map is
  not the answer to everything. Each is gone for the round once anybody
  takes it.
  The falloff is **per player, not per room**: your first potion of the round
  gives 40, then 30, 20, 15, 10. Room-wide falloff would punish the second
  player for the first one’s pickup; per-player is what stops one person
  hoovering all five and topping back to full each time. Picking up requires
  `hp < 100` and a live round.
  **Anything that belongs to the start of a round has to be done in BOTH
  `openBuyWindow` AND the round-award branch**, because that branch sets the
  phase to `intermission` inline rather than calling `openBuyWindow` — miss
  it and potions never come back after round 1. They are deliberately NOT
  re-placed in `startRound`: doing that moved every potion at the bell, so
  the positions clients had been shown were already stale.
  Positions ride in their own `potions` event (round start, and on join)
  while the snapshot header carries a one-byte mask of which are still
  there — the positions only change once a round, so they do not belong in
  the tick.
- **The resupply crate holds two prizes on different timers.** The cash is
  one per round for the whole room (`match.resupplyBy`). The ammo used to top
  anyone up every time they walked in, which made the middle of the map a
  free refill station; it is now one player every `RESUPPLY.ammoMs` (30s),
  shared, and only while a round is LIVE — outside one it is free, since the
  buy window already hands you a loaded gun. `match.ammoAt` holds when it is
  next available and resets with the round. The seconds remaining ride in the
  snapshot header so the ring can grey out, and the client only plays the
  refill when the server actually gave it: walking in on cooldown says when
  it is back instead of pretending.

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

`X` smoke — 2 charges, 30s each, no damage. Lands a cloud (`SMOKEFX.radius`
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
Entries in `others` must carry `o.id`. `updateMarks` walks
`others.values()`, so the id has to live on the entry, not just the Map key —
it did not, so `detectTarget === o.id` tested against `undefined` and the
heard-them-shoot silhouette **never drew once**. The smoke tag hid the bug by
still working: it tests `o.markedBy`, which comes straight off the snapshot.
The server side was fine throughout, which is why it looked like a render
problem and not a detection one.
It reveals **people only**. It used to also draw fire pools and smoke clouds
through walls, treating them as stand-ins for traps, but traps do not exist
yet — that was inventing a feature. `revealHazards` is kept as a no-op so
the call sites mark where it would go back in. Silhouettes are amber for
"heard them fire" and green for a smoke tag, and smoke wins if both apply.
Resets to ready at the start of every round.

**Roll, crossbow and smoke each have a cooldown tile** in the ammo corner
(`#cdRow`, above the magazine). A tile is READY (bright glyph, charge count)
or SPENT (greyed and darkened, the seconds left over the top, a conic wipe
draining round it - darkened rather than blanked, because a full-bleed card
hidden outright reads as a broken tile instead of a busy ability); an ability holding one charge while the second regenerates is
READY with a thin bar for the one coming back, because dimming something you
can still throw reads as "no". Short cooldowns show a decimal — the roll is
1.2s, and in whole seconds it reads "2" for most of its life.
The glyphs are Jack's artwork (`assets/cd-roll.png`, `cd-fire.png`,
`cd-smoke.png`), painted cards rather than pictograms, so they FILL the tile
via `object-fit:cover` and round with it through `border-radius:inherit` -
`overflow:hidden` is not an option, since the key and charge badges hang
outside the edge on purpose. All three are now white marks keyed off their own
background by luminance and recomposited on one card black (21,23,20), each
scaled to fill 104 of its 128px square so they read as the same weight. Two
of the sources carry a frame around the art; crop inside it with a margin,
or an edge of it survives the downscale as a stray line.
`updateCooldowns()` is called from `loop()`, **not** `updateHUD()`: that one
is event-driven and a countdown hung off it sits frozen between shots. It
therefore runs every frame, so every write is guarded on the value actually
changing, or it dirties layout 60 times a second for text that changes once.

**You are never left holding a spent ability.** `abilitySpent` is an ability
at zero charges (never true in practice with `noCooldown`, where charges do
not run down). Firing the last charge calls `dropSpentAbility()`, and
`switchWeapon` refuses to equip a spent one — otherwise the fire button just
beeps and you find out mid-fight. `fallbackWeapon()` is the first GUN in
`inventory()`, which is purchase order, so it is the one you bought first;
the blade is the floor, since a lost round strips your guns and it is the
one thing you always have.

**Climb is everyone's, and it is movement rather than kit.** Press jump
facing a ledge between `CLIMB.minRise` (0.5m) and `CLIMB.maxRise` (2.7m)
above your feet and you pull up onto it instead of jumping into its side;
it works from the ground or from the air, so Blast can double-jump to a
lip and still mantle it. 2.7 is chosen to clear the **2.5m crates, which
a jump cannot** — `JUMP_V` 10.5 against `GRAV` 24 tops out at 2.3m, so
those were cover nobody could ever get onto. The 3m centre block stays
out of reach on purpose: that is the resupply crate, and a new perch over
the middle of the map is a balance decision rather than a movement one.
The perimeter walls are 7-8m, so you cannot climb out of the arena.
**The pull-up goes UP before it goes OVER** (`CLIMB.upPart`, 62% of its
0.42s), and that ordering is the whole trick: while your feet are below
the ledge you have to stay out of the box's footprint, or the client's
wall push and the server's `resolveBody` both shove you straight back
off it. It refuses while rolling, dashing, sliding, crouched or dead, and
refuses when anything taller stands where you would land.
Nothing about it asks the server for new trust: it rises at 9.6 m/s and
slides forward at 8.5, against `MOVE.maxRise` 16 and `MOVE.maxSpeed` 20,
so `vetMove` passes it like any other movement. Measured on the range:
the 2.5m, 2.0m and 1.5m crates all climbable, the 3m block and the
perimeter wall both refused, a mantle started mid-jump lands on top, and
open air does nothing.

`Q`/`E` peek left/right — hold to lean. `LEAN.angle` 0.16 rad (~9°) plus a
0.45m sideways shift of the eye, clamped by `clearLean` so you can't put your
camera through a corner. Suppressed during a roll or slide. (Double jump and sprint are agent kit now — see
Agents.) Stances: `C` crouch,
`Z` prone — these shrink your server-side hitbox.
`Tab` armory, `O` graphics & HUD settings, `Esc` pause/quit.
The home page's top nav had three dead words (RANGE / ARMORY /
MULTIPLAYER) that were never links — removed, along with `.navlinks`.
`SETTINGS.hitZone` toggles the zone-coloured hit marker and its label back
to the plain white one. It lives in the settings panel with the graphics
options and saves with them, but the presets deliberately leave it alone —
picking PERFORMANCE shouldn't rearrange your HUD.

## The menu

**One screen, not three.** There used to be a splash page (`#home`) with a
START button that led to a mode screen (`#mode`) that led to the room browser.
`#mode` is gone; `#home` is a deployment terminal modelled on a shooter lobby,
and `#lobby` (the room browser) is still the one step after it, for
multiplayer only.

- **Top bar**: the UID chip (the tail of the reconnect token, so it is the id
  the server already knows you by rather than a number invented for the
  screen), four tabs, the language switch, and SETTINGS.
- **Tabs** swap the left column only: START (the pitch), OPERATORS (callsign
  + the agent cards, which used to live on `#mode`), ARSENAL, CONTROLS. `Tab`
  cycles them, which is what the footer claims.
- **The middle column is deliberately EMPTY** — that is where the 3D Spartan
  stands. `.lobby-ui` is `pointer-events:none` and only the controls take the
  pointer back, so dragging to spin him still works anywhere over the layout.
  Get that backwards and the one interaction the screen advertises is dead.
- **The right column** is what you are about to drop into: agent, mode
  (click to flip between multiplayer and the range, remembered as `cx.mode`),
  the map, and PREPARE, which either starts the range or opens the room
  browser.
- **The map card draws the arena from `maps.js`**, the same data the game
  builds geometry from, so it cannot show a plan the match is not playing.
  Crates orange, blocks crimson, the resupply ring green.
- **The menu runs a 52° lens** (`MENU_FOV` in loop.js) rather than the 80° the
  game plays at. The operator is the centrepiece and at 80 he is a small
  figure in a wide room; narrowing the LENS instead of walking the camera in
  keeps him clear of the podium and compresses what is behind him into a
  backdrop. `startPlay` puts it back to 80.
- **The menu has its own SET, and the arena is hidden behind it.** It used to
  be staged in the map you were about to play, which made the backdrop busy,
  lit the screen like a warehouse and changed its character every time the
  map did. `menuSet` in world.js is a small studio for the one job — a
  vignetted backdrop with a crimson pool low behind the character, a floor pad
  to stand him on, and two short strips at his shoulders — and
  `setMenuBackdrop(on)` swaps it for the arena, called from `startPlay` and
  from the quit path. Everything in it is UNLIT except the floor pad, which is
  Lambert so the podium spotlight's shadow lands on something; the glow is
  painted into the textures rather than lit, because with no tone mapping
  another real light in here would blow the floor out the way the ceiling
  lamps would in the arena.
  Two things the first cut got wrong, both worth keeping in mind: the wall was
  lit evenly, so the operator was exactly as bright as the room and had
  nothing to stand against — contrast is the job, not detail; and the strips
  ran long and above his head, which read as scaffolding rather than lighting.
  **`buildArena()` has to honour `menuBackdropOn`**: a rebuild makes fresh
  meshes, which default to visible, so changing map from the menu would
  otherwise drop the arena back in behind the panels. Measured: 0 of 52 arena
  parts visible at the menu, all 52 in game, 0 again on quitting, and 0 after
  a map change.

- **`.overlay` is `overflow:clip`, not `hidden`, and that matters.** The
  ambient orbs bleed past the edges on purpose, which gives the overlay a
  scrollable overflow area — and `hidden` still scrolls PROGRAMMATICALLY.
  Once the menu had buttons near the edges, the browser scrolling a newly
  focused one into view dragged the whole screen 90px sideways and cut the
  brand off; `getBoundingClientRect` showed every child at -90 while the
  parent sat at 0, which reads like a transform bug and is not one. `clip`
  means there is no scroll container to scroll.

## The tactical look (style.css, last section)

Jack: *"i want the ui ... to be more hard core looking like a real fps
game"* (2026-11-14), across the settings, the home page and the weapon
system. **Everything above the `THE TACTICAL LAYER` comment in style.css is
the old look and stays as the base; that one section overrides it**, so the
look can be read, tuned or reverted as a unit.

- **Type:** Barlow Condensed for labels and headings, JetBrains Mono for
  every NUMBER (ammo, health, keys, ids) so counts never shift width, and a
  system sans for running text. Loaded from Google Fonts with
  `display=swap`, so a slow or blocked font never holds anything up. Chinese
  falls back per glyph to YaHei / PingFang through the same stacks.
- **Shape:** 2px corners, 1px rules, corner brackets on panels (`::before`/
  `::after` - only on elements that were not already using them), and the
  primary button NOTCHED on two corners with `clip-path`, not rounded.
- **Colour:** crimson only as an accent - an edge bar, a bracket, a fill.
  The state colours (win green, lose red, crosshair, resupply green) are
  deliberately untouched.
- **Settings** is laid out the way shooters lay theirs out: a numbered
  vertical rail, label-left / `< value >` rows with one pip per option, and
  an INFO pane describing the row you are on (`setd.<key>` in both language
  packs). The arrows stop at the ends rather than wrapping. Esc backs out,
  up/down move between rows, left/right step. Research behind the vertical
  rail: Modern Warfare II's horizontal tile menus were the most criticised
  UI in the series, and what players asked for was the vertical list.
- **HUD:** health is a mono number over a ten-cell bar (the fill is MASKED
  into cells, so `updateHUD` still sets one width and one colour), the ammo
  is a big mono count over a magazine bar that goes red at a quarter, and a
  slot strip over it shows what you carry keyed the way the number keys
  select it (`renderSlots`, rebuilt only when the list or selection changes).
  **Match only**: on the range you hold every gun at once and the strip was
  six boxes saying "everything" (Jack asked for it gone there).
- **Armory** is a loadout screen: a card per weapon tagged PRIMARY /
  SIDEARM / ABILITY / MELEE, and for guns five bars (damage per shot, fire
  rate, range, accuracy, magazine) each against the best gun on that axis
  (`gunBars`). Accuracy is the AIMED cone on a LOG scale: the cones run forty
  to one, and on a straight scale every gun but the sniper read empty.
- **Never give a button a 3D transform AND a clip-path/filter.** The old
  look floated every `.btn` 40px forward with `translateZ` inside the menus'
  perspective stage; this layer added a notched `clip-path` and a
  drop-shadow `filter`. Together the button was DRAWN in one place and
  HIT-TESTED in another - clicking the middle of RESUME landed on the
  container behind it, so resume did nothing. `.btn` is `transform:none`
  now. Check a button with `document.elementFromPoint` at its centre and
  edges, not by looking at it: it looked perfect.
- **A trap this hit:** `byId` is a `const` declared ~line 310 of session.js,
  and the settings renderer runs at load from ~line 240. The new settings
  code called `byId` and threw, which aborted the rest of session.js and
  with it the whole startup - a black screen with an empty menu. Code that
  runs during session.js's own load uses `document.getElementById`.

## Settings (O)

**SETTINGS, in three categories** (2026-11-14; restyled as a rail - see The tactical look). It was one list headed GRAPHICS &
HUD with gameplay and practice rows mixed in under the frame cap; Jack asked
for it to be split into graphics, gameplay and abilities. Each `SET_DEFS` row
carries a `tab`; the last tab you used is remembered (`cx.settab`).

- **GRAPHICS** — presets, frame cap, resolution, shadows, bloom, look, the FPS
  readout and the heat notes.
- **GAMEPLAY** — **sensitivity** (new: `SETTINGS.sens` scales the 0.0022
  rad/count that mouse look always used, so 1x is exactly the old feel), hit
  marker, map size, and on the range only the practice aids.
- **ABILITIES** — **bolts start straight/ricochet** (new: `ricochetStart`,
  applied in `resetAbilities`; right-click still flips it in play; shown only
  to Aseed, because Blast's grenade bounces regardless), practice cooldown,
  and a card per ability for BOTH agents, yours first and marked YOU. **The
  card numbers are read live** from `ROLL`, `DASH`, `ZONE` and each ability
  weapon's own `charges` / `cooldownMs`, so the page cannot advertise a
  cooldown the game does not have. Hearing's 40m / 4s / 30s are written into
  the copy, because those live on the server.
- **A row can be backed by something other than SETTINGS** via `get`/`set`.
  The MAP row reads and writes `mapSize` through `setMapSize`, the same path
  the M key takes, so the panel and the key cannot disagree.
- The tab labels and ability cards are in both language packs. The row
  labels are still English-only, as they were before.

## Language

English and 简体中文, picked in the top bar and remembered as `cx.lang`;
with nothing remembered it follows `navigator.language`, so a `zh-*` browser
opens in Chinese. `i18n.js` owns both packs and `t(key)`.

Two ways in, and they cover different problems. **Markup** carries
`data-i18n` (plus `data-i18n-ph` for placeholders) and `applyLang()` rewrites
the text — the English stays in the HTML as the fallback and as the thing you
read while editing, so a missing key degrades to English rather than to an
empty element. **Code** calls `t()` for anything built at runtime.

**`applyLang()` must re-run every renderer that writes text**, because a
language switch has to repaint what is ALREADY on screen, not just what is
drawn next: `renderSettingsUI`, `renderLobbyCards` (which covers the agent,
mode and map cards and the arsenal list), `updateHUD`, `updateStanceLabel`,
and the armory only while it is open. Add a renderer and add it there, or it
sits in the old language until something unrelated redraws it. The first call
is deferred to `DOMContentLoaded` because those renderers live further down
the load chain.

`t()` falls back to English and then to the key itself. Not translated on
purpose: player names and room codes (data, not copy), and the in-play kill
feed and toasts, which are assembled from fragments at a dozen call sites.

## The look (merged to main 2026-11-13)

Behind `SETTINGS.look` (LOOK: FLAT / LIT in the settings panel), so the two
can be compared in one session rather than from memory, and `main` is
untouched. **FLAT is the game exactly as it was**: the original arena
meshes, the original gun materials, no tone mapping. LIT is everything in
this section and the next.

It began as an experiment after reading Saltline — an environment to
reflect, a filmic curve and a grade, laid over the SAME evenly lit arena
(the switch read GRADED then). What that taught is at the end of this
section: a grade cannot find contrast the lights never made. The lit arena
in the next section is the answer, and the two now arrive under one switch.
If the lit arena cannot build (`LIT_OK` false: WebGL1, or a Three build
whose light chunk has moved), LIT falls back to exactly that older graded
look over the flat arena. `?nolit` in the URL forces the fallback so it can
be looked at; measured there: no lit meshes, 48 flat parts drawn, lights at
0.22 / 1.55, no errors.

It deliberately reverses the rule in Gotchas — no tone mapping, no envMap,
`metalness` pinned at 0. That rule is correct *for a scene with no
environment*; give it one and the constraint lifts, which is why all three
arrive and leave together. **The Gotchas still describe FLAT**, and still
hold there.

- **The environment is a small ROOM baked into a PMREM**, not a sky: Crimson X
  is indoors, so what the armour should pick up is a dim cool shell, a floor
  that bounces and warm panels overhead.
- **ACES tone mapping** with exposure 1.45. The graded figures for the two
  real lights — hemisphere down from 0.55 to 0.22, key up from 0.85 to 1.55
  and warmer — now apply **at the menu only**, where the operator on the
  podium was tuned with them. In the arena those lights are reset for moving
  things alone (`litLights`, next section).
- **One grade pass** after the bloom: split tone (teal shadows, warm
  highlights), S-curve, lifted blacks, saturation, vignette, animated grain
  weighted to the shadows, ordered dither against banding in the gradients.
  **It also smooths edges (FXAA).** `antialias:true` only covers the canvas;
  the moment a composer is in the chain the scene is drawn into a render
  target that has none, so with bloom or the look on every crate edge was a
  staircase. `uPx` is one pixel of the target and is set in `applySettings`.
- **Every FLAT arena material is Standard now**, including the two that were
  Lambert — Lambert cannot see `scene.environment` at all, so with the look on
  the blocks and pillars were the only flat things in the room.
- **`lookTag(m, graded, flat)`** records a material's two personalities where
  the numbers are known, at creation. Reading the flat values back off the
  material at toggle time does not work: by then they are whatever the last
  toggle left. `userData.envK` is a material's own share of the room's
  reflection; without it everything took `LOOK.envIntensity`, which was too
  much for a wall and too little for bare steel.
- **BLOOM GLOW used to decide whether the composer ran at all** (loop.js fell
  back to a direct render), which would have taken the grade with it. It
  switches its own pass now and the loop uses the composer when either wants
  it.
- **Models that load late need the look applied again: `lookSoon()`.** Their
  graded metalness is only RECORDED by lookTag, not set, and files arrive
  after `applyLook` ran at boot — so a freshly loaded Spartan or sniper sat at
  metalness 0 until something unrelated (a resize, a settings click)
  re-applied it. Every model loader calls `lookSoon()`, which waits 80ms so
  several files landing together cost one pass.
- **The gun has two skins** (`lookMats` on each viewmodel mesh, models.js).
  The weapon files ship as Phong, nearly black with a pure white highlight,
  which under one directional light gives exactly two tones — that is why the
  rifle read as a black-and-white placeholder. `vmLitMaterial` builds a
  physically-based twin from the material's NAME where the file has one (the
  Quaternius guns: Metal, DarkMetal, Wood, Main…) and from its colour where it
  does not (crossbow, grenade, blade). `applyLook` picks a skin; FLAT draws
  the originals. Two traps: `envK` at 1.3 washed the room's cool shell over
  the whole gun and a black rifle came out an even blue-grey, like a toy (it
  is 0.8, and the furniture has no metal); and **`Object3D.clone()` copies
  `userData` through JSON**, which would turn `lookMats` into garbage — the
  ability models are cloned BEFORE `lookSoon()` for that reason.

Two things learned the hard way, both the same lesson one step on from the
old one. **Metal is only as bright as what it reflects**: at metalness 0.70
against the first, dim capture the Spartan went to a silhouette on the menu.
The capture is brighter now (panel AREA, since a colour is clamped at 1) and
the armour sits at 0.40 — painted, not chrome. And **the arena was evenly lit
by design**, so the grade did far less for it than for the character; a real
jump there meant redesigning the map's lighting, not grading it harder. That
is the next section.

## The lit arena (`lighting.js`)

The room's light is worked out from the fixtures that are in it. The old
arena had a hemisphere and one directional key, which light every square
metre of floor identically: no pool under a lamp, no shadow behind a crate.
The ceiling panels were pictures of lamps. They are emitters now, and so is
a crimson strip round the walls at 3m — the menu's colour, brought into the
arena, which until now looked like a different game from its own front page.

**There are two arenas, and only one is ever looked at.** Everything
`buildArena` used to make carries `userData.flat`; its lit twin from
`litBuildArena` carries `userData.lit`; `arenaVis()` shows one set by LOOK
(neither at the menu). **The flat boxes stay in `wallMeshes` in both looks**,
hidden but still ray-tested — a hidden mesh is skipped by the renderer, not
by `Raycaster` — so every bullet, bolt and grenade meets the same plain boxes
the server collides with. No lit mesh is in `wallMeshes` or `colliders`. That
is what lets the lit cover have bevels, and the walls be one merged mesh,
without the picture and the physics being able to disagree. Measured: a ray
north from (0, 1.5, 44) stops at 19.00m on a box reporting `visible:false`;
`wallMeshes` / `colliders` are still 22 / 21; a rebuild leaves the scene's
child count unchanged, and GPU geometries and textures were steady at
162 / 69 across ten rebuilds.

- **The bake.** Each panel and each stretch of strip is an AREA light,
  sampled at several points (18 on the nearest panel, fewer with distance),
  each sample tested against the cover. That is where soft-edged shadows come
  from, with a penumbra that widens the further the caster stands from the
  floor — what one point light and a shadow map cannot do. The floor gets a
  lightmap (256² on Foundry, about 0.47m a texel), jittered then blurred so a
  regular grid's banding becomes noise fine enough to blur away, and packed
  SQUARE-ROOT into 8 bits because light is wanted most finely in the dark.
  Cover, walls, roof and fixtures take the same light per vertex in a
  `cxBake` attribute, plus what the floor throws back up. Ambient is NOT
  baked: it is a uniform, so it tunes without a re-bake.
  **One unit of baked light is the floor directly under a single panel**,
  measured per map rather than assumed, so a lower roof or a bigger panel
  lands at the same exposure.
- **It is spread over frames behind the menu, and finished at the door.** A
  whole map is about half a second of work (Foundry 367-475ms for rebuild
  plus bake). Behind the menu that is free, because the arena is not on
  screen; done in one go it would freeze the MAP card on every click.
  `setMenuBackdrop(false)` calls `litBakeFinishNow()` so the first frame of
  the arena is never an unlit one, and a build that happens while already
  playing (a multiplayer `welcome` naming another map) bakes synchronously.
- **Texels the bake cannot reach are filled from their neighbours** — under
  cover, inside the walls. They are never seen, but the texture is filtered,
  and a black texel beside a crate smeared a dark edge onto the floor in a
  different place for every crate, depending on how it fell on the grid.
- **The shader patch** (`litPatch`, kinds floor / wall / cover / ceil) is
  `MeshStandardMaterial` with Three's own light loop cut at two known lines so
  the directional block is fenced off, and the ambient term replaced by the
  bake. **Point lights still land on these surfaces** (a flaming bolt), which
  is why the key is skipped rather than all direct light zeroed. **The key's
  shadow map is still read by hand**, so a player's shadow falls on baked
  ground. Nothing static casts in this look, so the shadow box is 68m round
  the camera instead of 140m round the arena — the same texture over a
  quarter of the area — and its focus is snapped to whole texels in the
  LIGHT's frame, or every shadow edge crawls as you walk.
- **Contact shadow at the foot of cover is computed, not baked**: how much of
  the sky a point on the floor has lost to each box, per pixel. A lightmap
  texel half a metre across could never be crisp there. The perimeter walls
  join that list with their height capped at 2.6m; at the full 8m they dimmed
  the floor for eight metres out, which read as a dirty room.
- **The floor's mirror is solved, not rendered.** The panels are rectangles
  on a grid at a known height, so the reflection is exact per pixel: reflect
  the eye ray, meet the lamp plane, see whether it landed on a panel, blur by
  roughness, and test the ray against the cover so a lamp behind a crate does
  not show in the floor in front of it. The wall strip is done the same way
  against the four wall planes. No second render of the scene. It keeps only
  a tenth of the generic PMREM reflection, which is what made the old graded
  floor milky at a distance.
- **`LIT` holds every number; `LITU` holds the uniforms**, one set of objects
  shared by every lit material, so `LITU.uLitGain.value = 6` in the console
  retunes the whole room live. Gain, ambient, shadow depth, reflection
  strength and the strip colours need no re-bake.
- **The two real lights only reach what moves.** A lit surface skips the key
  and replaces the ambient, so in the arena the hemisphere and the key light
  players, targets and the gun and nothing else, and are set for those:
  fill 0.62, key 1.05, coming down 23° off vertical. With the old slanted key
  and 0.22 fill anyone facing away from it was a black cut-out. `litLights()`
  switches these on entering the arena and back at the menu.
- **Players carry a rim light** (`rimPatch` / `RIMU`, models.js): a cool edge
  highlight, strongest on what faces up. Dark armour in front of a dark
  barrier was a shape found late. Zero at the menu and in FLAT.
- **The floor is labelled A1 to E5**, one cell per lamp, as callouts two
  players can both see. All markings are one canvas laid over the arena,
  drawn north-up, premultiplied so paint edges have no dark fringe.

Learned here, each of them the hard way:
- **The strip is an accent.** At full strength on what faces down it turned
  the roof red for ten metres in from every wall and the room stopped having
  a colour of its own. It is `stripRoof` (0.22) on the roof, and the tan wall
  scan is mostly desaturated in the shader, because tan under crimson is
  salmon.
- **A canvas colour is decoded from sRGB, which stretches the gap between
  channels.** A slate picked as (65, 75, 89) came out royal blue in the room.
  Paint for these textures is chosen nearly neutral.
- **Used raw, the photoscan's roughness chopped the mirror into chalk.** Every
  scratch switched the reflection on and off. The mirror takes 70% of one
  fixed roughness and 30% of the texture.
- **Picking one of two box extents for the contact shadow drew a straight
  line from every corner of every long barrier.** It blends between them.
- **A bevel given one texture coordinate along its width** showed a single
  column of the texture stretched across it — on a crate, a strip of
  something else nailed down the corner. Its far edge carries the UVs on by
  the bevel's own width.

**Frame cost, measured** on Intel Arc integrated graphics (ANGLE, D3D11) by
running the whole `loop()` 40 times at each of five viewpoints and forcing
the GPU to finish with a one-pixel `readPixels`: at 1280×720, LIT 3.2-3.6ms
against FLAT 2.6-2.8ms; at 1920×1080, 5.05ms against 3.3-3.5ms. Both leave a
60fps budget of 16.6ms mostly unused on that machine. Lit geometry on Foundry
is 8 meshes, 11,684 vertices, 15,522 triangles.

Checked: the menu keeps its lights (0.22 / 1.55) and its bloom; FLAT draws 48
flat parts and no lit ones with the Phong rifle back; LIT draws 8 lit and no
flat; quitting restores the studio and the sun at (25, 55, 18). Two clients
joined one room on Foundry with no console errors and saw each other.

Not checked: a real match played by people, a phone, or a machine weaker than
the one above. **Substation gets all of this for free and has not been tuned**
— Jack considers that map badly made and wants it left alone for now
(2026-11-13), so nothing here should be read as a judgement that it looks
right.

## Every model is drawn in code (`drawn.js`)

Jack, 2026-11-15: remove every downloaded model, draw them, show the hands in
first person and move them on a reload. Loaded after weapons.js, unnumbered.
The FBX/GLB files and the Spartan textures are deleted from the repo; the
loaders in models.js and weapons.js are gone. This also ends the problem that
the player model was fan art of a character another company owns.

- **Except the rifle**, which since 2026-11-21 is Saltline's PAC-9 loaded from
  `assets/pac9.bin` (see The PAC-9, above); `drawRifle` is its fallback.
- **Guns** (`drawRifle` etc.) are boxes and tubes built pointing down -Z in
  the holder at the old offset (0.02, -0.03, 0.05). The front sight must be on
  the centre line: `aimTop` is still found by `centrelineTop`.
- **Arms** (`drawArm`) have their origin AT THE HAND. `armsFrame()` (called
  from `feelFrame`) walks the left hand fore-end -> magazine -> down -> back,
  timed as a share of `reloadMsNow`, with the magazine following the hand.
  The shotgun feeds three shells instead.
- **loop.js used to plunge the gun out of view on a reload** (`rDip` 0.22,
  full `rRot`), which hid all of it; it is a slight tilt now (0.05, 0.30),
  and the hip pose is raised from -0.28 to -0.225 so the hands are in frame.
- **The operator** (`makeOperator`) replaces `newPlayerMesh` / `newBotMesh`
  and the menu hero. Limbs are groups pivoted at the joint, so `animate()`
  in loop.js makes remote players WALK; the Spartan was a rigid statue.
  Practice targets are amber so a target is never mistaken for a person.
  Only parts 0.25m or bigger cast shadows.
- **The crossbow is Jack's MODEL again, not drawn** (2026-11-15: he did not
  like the drawn one). `assets/crossbow.fbx` was restored from git and loads
  into both ability slots, fire (G) and smoke (X), through the old
  `ABILITY_MODELS` entry. The loader swaps out only the parts tagged
  `userData.drawn` - drawn.js puts a hand in the same holders. The blade is
  still drawn.
- **The rifle has NO scope, by Jack's choice** (2026-11-15). A tube scope and
  then an open reflex sight with a close aim (`adsZ`) were built and he had
  them removed: the rifle aims on its iron sights and red dot, as before.
- **The muzzle flash has no real light.** One PointLight in the scene, even at
  intensity 0, made every lit pixel compute it: an idle frame went from about
  5ms to 9-11ms and Jack felt it as lag on the trigger. Do not add one back.
- Seen in captured frames: rifle idle with the left arm, a mid-reload frame,
  the pistol, the menu operator (before its visor fix). NOT seen: the fixed
  visor, sniper, shotgun, the abilities with a hand, a remote player walking.

## Feel was removed (2026-11-15)

There was a `feel.js` (muzzle flash sprite, impact sparks, a camera kick on
your own shots, a spring on the weapon, patrolling practice targets) and a
16% convolution reverb in the audio graph. **Jack had all six removed.** Do
not bring any of them back unasked. What remains of that file is one line in
`loop()`: `armsFrame()` (drawn.js) is called directly while playing, because
feel.js was what drove the hands and the reload animation.

- Practice targets are **stationary again**, as Architecture says.
- The view still rises on each shot: that is the gun's own recoil, applied to
  `me.pitch` in `shoot()`, not the removed kick.
- Checked by driving frames: no sprite or Points object in the scene, all 8
  targets unmoved over 120 frames, the left hand 38cm off its rest pose
  halfway through a reload, no console errors.

## Firing lag: shader programs (2026-11-15)

Jack: *"why is it so laggy when i open fire"*. `shoot()` itself costs ~0.6ms.
The lag came from **shader programs being built mid-fight**, measured by
wrapping `gl.linkProgram` / `gl.deleteProgram`: idle frames build none, 20
rifle shots built 20 and deleted 20, and **one crossbow bolt built 16**.

- **Three deletes a program when the last material using it is disposed.**
  Every tracer made a `LineBasicMaterial` and disposed it 60ms later, so the
  program died and the NEXT shot compiled it again. Tracers are now a pool
  (`tracerPool` in effects.js): hidden and reused, never disposed.
- **Changing the number of lights recompiles EVERY material in the scene.**
  Each bolt carried its own `PointLight`, so firing one rebuilt every lit
  material, and so did it going out. The bolt has no light now (the faint glow
  on nearby walls is gone). **Never add or remove a light per event.**
- **Per-event materials are shared and flagged `userData.keep`** (arrow and
  smoke-bolt parts `ARROW_MAT`/`ARROW_GEO`, mark silhouettes `MARK_MAT`).
  `disposeTree` in weapons.js skips anything flagged, so clearing one arrow
  cannot delete the program every other arrow uses.
- **`renderer.compile()` does not warm what the composer draws.** It built a
  program under a different key and the first real shot still compiled.
  `warmTracers()` (called first thing in `startPlay`) warms through the REAL
  render path: one zero-length live tracer in front of the camera,
  `frustumCulled = false` because the camera has not reached the spawn yet.
- Measured after: a 30-round burst builds **0** programs and deletes 0, the
  shotgun 0, a repeat bolt 0, a repeat smoke 0. The first shot of a session
  and the first bolt still build **1** each, once — a single hitch, not one
  per shot. Not fixed: the baseline frame (~318k lit triangles, ~173 draws).

## Sound

All of it is synthesised in `Sfx` (`hud.js`); there are no audio files. The
first version was one oscillator or one noise burst per event, which is why
it read as a toy. A gunshot is now four layers — crack (ms of high noise),
body (band-passed noise, the weapon's size), thump (a sine dropping in
pitch) and tail (low noise, the room answering) — weighted per weapon in the
`GUN` table.

**Footsteps are paced by the distance you actually COVERED**, measured at
the end of `movePlayer` after collision has had its say — not by the
velocity you asked for. In the open the two are the same number; with
something in the way they are nothing alike. Collision moves you back out
of a wall, it does not slow you down, so `me.hv` sits at full walking
speed for as long as you hold the key while you go nowhere — and the old
test (`me.hv.lengthSq()>1`, distance from `me.hv.length()*dt`) laid down a
step every 1.6m of travel that never happened. Measured: six footsteps
while moving 10cm into a wall, now zero, with open-ground pacing
unchanged (3 steps per 5.6m walking, 7 per 15.6m sprinting, 4 per 5.25m
crouched). Remote players' footsteps a few hundred lines down have always
been paced this way, off the drawn delta. `gone < 1` guards it: a jump of
over a metre is a respawn or a teleport, not a stride.

**Sounds can be placed.** Pass `at` ({x,z}) and `bus()` attenuates, low-passes
and pans it relative to where you stand and face. `ref` is the distance at
which it is half as loud: 11m for a footstep, 30 for a gunshot, 16 for a pool
or a cloud. This is what makes other players audible at all — their shots
used to draw a tracer and play nothing, and their footsteps did not exist.
The server's `shot` event carries `w` (the gun) and `f` (first packet of a
trigger pull), because a shotgun sends eight packets per shot and eight
reports is just noise. Remote footsteps are paced by distance covered
(`REMOTE_STRIDE`) and only while upright — crouch or go prone to move quietly.

**Levels were measured, not guessed**, by rendering each sound through an
`OfflineAudioContext` (`Sfx._use(ctx)` exists for exactly that). The first
cut peaked at 0.13 of full scale for a rifle, quieter than the beeps it
replaced: filtered noise loses most of its level. `MASTER` (2.4) is makeup
gain before a compressor, and a tanh shaper sits last as a ceiling — a
compressor only leans on peaks, and the worst stack (sniper, shotgun, four
rifles, a hit and a kill at one instant) overshot to 1.04 through its
attack. Measured now: own rifle ~0.36, sniper ~0.49, that stack 0.79-0.84.
Envelopes fall to `FLOOR` (3%) by the end of their duration and then cut;
decaying exponentially all the way to silence spends most of the stated
length inaudible.

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

**Crossbow bolts are zoned now, with their own two numbers.** `XBOW.headDmg`
90 and `XBOW.bodyDmg` 50, not the gun multipliers: ×2.5/×1.0/×0.65 off a 90
head gives 36 on the torso and 23 on a limb, which guts a 30s cooldown. The
bolt only has two hitboxes anyway, body and head - no arms or legs. The burn
rides on top of either, so a head hit is effectively 150 and a body hit 110.
Two things this needed beyond the numbers. The arrow loop already fired both
`raySphere` tests and threw the answer away with `Math.min`, so it just had
to keep which one it met. And **a head hit WINS, it is not the nearest
entry**: the body sphere runs to 1.65 while the head starts at 1.51, and
nearest-entry hands that 14cm band to the bigger sphere - a bolt straight
through the head scored 50 unless it cleared 1.65. Same rule `hitZone` uses,
and safe for the same reason: the bolt's head sphere is now `HITBOX.head`
(r0.19 fitted) rather than the old r0.34, which reached 14cm into the chest
and would have paid out for centre mass. The `impact` and `kill` events
carried a hardcoded `head:false`; they report it properly now, so the marker
and the kill feed agree with the damage.
Measured on the server at 4m: head 100->10, body 100->50, and a shot at 1.58
in the overlap band 100->10. On the range the boundary sits exactly on the
sphere - 1.55 gives 90, 1.50 gives 50.
**One shot per round when probing this**: 90 plus the burn kills, and a
second reading off a corpse, or off hp clamped at 0, says nothing. Note too
that (0,0) is the resupply crate, so a target sent there is pushed onto it
and bolts bury themselves in its side - the 18 damage you see is the pool
burning, not a hit (`scratchpad/bolthead.js`).

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
- **An empty gun clicks ONCE per trigger pull.** An auto weapon calls
  `shoot()` every frame while the button is held, and the empty-magazine
  branch returns before `lastShot` is touched — so the fire-rate gate at
  the top of `shoot()` never throttled it and `Sfx.empty()` fired 60 times
  a second. `dryClicked` latches after the first one and is released by
  mouseup, by switching weapon, or by actually firing a round. The reload
  attempt still runs every frame, which is what makes an empty gun reload
  itself the moment it is able to. Measured: 1 click while holding the
  trigger for 120 frames, against 120 before.
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
- **`loop()` re-arms itself, so calling it by hand starts a SECOND loop** that
  never stops: every manual call leaves another `requestAnimationFrame` chain
  running and the game does its work twice, then three times. Stub it for the
  call: `const raf=requestAnimationFrame; requestAnimationFrame=()=>0;
  try{ loop(); } finally { requestAnimationFrame=raf; }`.
- **`applySettings()` saves.** Setting `SETTINGS.fpsCap = 0` or a resolution
  scale for a test and then calling it writes that to `localStorage`
  (`botstrike.gfx`). Put the values back and call it again when done.
- **To look at a frame, capture the canvas rather than the pane.** The Browser
  pane's own screenshot returned only the top-left quarter of the page at
  device-pixel-ratio 2, and nothing renders at all while the pane is hidden.
  `renderer.domElement.toDataURL()` works, but only in the SAME task as the
  render — the drawing buffer is cleared once the frame is presented — so
  drive `loop()` by hand as above, read the canvas straight after, and send
  the result somewhere it can be opened (a throwaway local receiver that
  writes the POST body to a file does it). That is how every lit-arena frame
  was judged. The HUD is HTML and is not in such a capture, which for judging
  the 3D is an advantage.
- **Time a frame with a forced finish**, not with `rAF`: run `loop()` N times,
  then `gl.readPixels` one pixel so the GPU has to complete, and divide.
  `rAF` in the pane is throttled whenever the pane is not in view.

## Parked / possible next

- **The push toward a AAA standard** (Jack's ask, 2026-11-12). He pointed at
  Saltline as the bar. The framing agreed with him: a literal AAA game is
  hundreds of people's models, animation and recorded sound, which code
  cannot make; what code CAN close is lighting, materials, feel and sound.
  **Saltline is in `SALETINE/` to be read, not shipped** (one exception, at
  Jack's request on 2026-11-21: the rifle is its PAC-9) — techniques only,
  never its code, its level or its look; Crimson X's look is its own menu's
  crimson on near-black. Done so far: the lit arena on Foundry, the gun's
  second skin, the rim light. What is left, in the order it would show:
  1. ~~Feel~~ and 2. ~~the room in the sound~~ were built (flash, sparks,
     kick, weapon spring, reverb) and **Jack had them removed** (2026-11-15).
     Not a to-do any more; see Feel was removed.
  3. **Moving things lit by where they stand.** The gun and the players are
     as bright in a shadow as under a lamp. `litBounceAt` already samples the
     floor's light on the CPU at any point; it is not yet used for this.
  4. **Air.** Dust in the pools of light, shafts under the panels — additive
     blending works now the room is dark, which it never did before.
  5. **The operator.** He is fan art of a character Microsoft owns (see the
     README: hobby use only), he has no animation at all — he stands in one
     pose and slides — and nothing above fixes either. An original, animated
     operator is the largest single gap left and is not a code problem.
  6. **Substation**, when Jack wants it: he considers the map itself badly
     made, so the lit look there is untuned by request.
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
- Sound is still synthesised (no audio files), but layered and placed now —
  see the Sound section. Recorded samples would be the next step up; they
  need files Jack supplies or approves a source for.
