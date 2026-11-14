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

**The maps.** `powerstation` (below; it replaced `foundry`) is 120m across, open, long sightlines
down both axes, which is what a scoped sniper wants. `substation` is 88m with
the middle walled into three lanes — the two long dividers and two cross
walls break every diagonal, the corner towers are the only high ground, and
the core is where the lanes meet. It is symmetric under a 180-degree turn so
neither spawn half owns a better angle.

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
  **Saltline is in `SALETINE/` to be read, not shipped** — techniques only,
  never its code, its level or its look; Crimson X's look is its own menu's
  crimson on near-black. Done so far: the lit arena on Foundry, the gun's
  second skin, the rim light. What is left, in the order it would show:
  1. **Feel.** The viewmodel has no spring to it: recoil, sway and landing are
     eased, not sprung. No muzzle-flash LIGHT (a point light reaches lit
     surfaces now, so one would), no impact sparks or dust, no shell casings.
  2. **The room in the sound.** Everything is dry. One generated impulse
     response on a convolver would put every shot in the hall it is fired in.
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
