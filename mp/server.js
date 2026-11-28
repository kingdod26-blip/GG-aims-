/* ============================================================================
   CRIMSON X — Multiplayer server (authoritative-ish).
   - Serves the client from /public
   - Holds ONE shared world of connected players. No bots: multiplayer is
     round-based duelling, and target practice is simulated on the client.
   - Players own their own movement (sent to the server); the server owns all
     damage, deaths, the round/match state machine and the scoreboard.
   Run:  npm install  &&  npm start
   ============================================================================ */
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

/* The client can now be served from somewhere else entirely — a static host
   that never sleeps, so the menu is up in a second while this box wakes. That
   makes every call cross-origin, which the browser blocks unless we say
   otherwise.

   ALLOW_ORIGINS (comma-separated env var) is the allowlist. Unset, any origin
   is accepted: there is nothing to protect with an origin check here — no
   cookies, no browser-held session, and the socket's `auth.tok` is sent
   explicitly by the client rather than attached by the browser, so a hostile
   page gains nothing it could not get by opening the game itself. Set it once
   you know your static host's URL and want the game embedded nowhere else. */
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const originAllowed = o => !ALLOW_ORIGINS.length || ALLOW_ORIGINS.includes(o);

app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && originAllowed(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');             // or a cache serves one origin's header to all
  }
  next();
});
/* Still serves the client itself, so `npm start` and the Render box on their
   own are unchanged — the static host is an addition, not a replacement. */
app.use(express.static(path.join(__dirname, 'public')));
/* The lobby reads these before joining anything, so they must work without a
   socket. Listing is the room browser; /rooms/new reserves a fresh code. */
app.get('/rooms', (_req, res) => res.json({ rooms: roomList(), max: MATCH.maxPlayers,
  maps: MAP_IDS.map(id => ({ id, name: MAPS[id].name, blurb: MAPS[id].blurb })) }));
app.get('/rooms/new', (req, res) => {
  if (rooms.size >= MAX_ROOMS)
    return res.status(503).json({ error: 'the server is full, try again shortly' });
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '?';
  if (!mayCreateRoom(ip))
    return res.status(429).json({ error: 'too many rooms too quickly' });
  const code = newRoomCode();
  if (!code) return res.status(503).json({ error: 'could not allocate a code' });
  /* The creator picks the arena. An unknown id falls back to the default
     rather than refusing, because the alternative is a dead Create button
     when an older client asks for a map this server has not got. */
  const map = mapById(req.query.map);
  rooms.set(code, makeRoom(code, 60000, map.id));   // held a minute, so it survives the trip
  console.log(`[*] room ${code} created on ${map.id} (${rooms.size} room(s))`);
  res.json({ code, map: map.id });
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (o, cb) => cb(null, originAllowed(o)) },
});

const PORT = process.env.PORT || 8200;

/* ------------------------------- Arenas ----------------------------------
   The arena is DATA, in one place: public/maps.js, which the browser loads
   as a script and this file requires. It used to be written out twice — a
   LAYOUT here as [x,z,w,d,h] and another in world.js as [x,z,w,h,d], the
   same boxes in a different argument order — with nothing but a note in
   CLAUDE.md keeping them equal. Get one height wrong and the cover you can
   see is not the cover that stops a bullet.

   EVERY ROOM HAS ITS OWN. These lists used to be module-level constants, so
   one arena served the whole server and every room played it. They live on
   the room now and every helper that tests geometry takes the room — miss
   one and that room is playing a map while the physics answers for another,
   which is invisible until someone walks through a wall that is not there.

   Heights matter: obstacles used to be treated as infinitely tall for
   line-of-sight, so you could not shoot over a crate — and standing ON one
   put your own muzzle inside a collider, which zeroed the wall distance and
   made every shot you took miss. Movement and spawn checks are still
   deliberately 2D (they only ever run at ground level). */
const { MAPS, MAP_IDS, DEFAULT_MAP, mapById,
        mapRects, mapWallRects, mapCeilingRect, mapRoofRects, mapRoofY } = require('./public/maps.js');
/* What a room gets when nobody asks for a map. The env var is a way to make
   a whole server default to something other than foundry. */
const DEFAULT_MAP_ID = mapById(process.env.MAP || DEFAULT_MAP).id;
/* Silvars' sensor, drone and dog: the same file the browser runs on the
   practice range (public/robots.js), so there is one copy of the rules. */
const ROBOTS = require('./public/robots.js');
const { SILV } = ROBOTS;
/* A room's collision, built once when the room is made. `rects` is cover
   plus the four perimeter walls, and drives movement and line of sight;
   `rayBoxes` adds the roof, for anything that flies.

   The roof is deliberately kept OUT of `rects`: that list also feeds the 2D
   tests (resolve2D, insideWall, lineClear), and a box spanning the whole
   arena there would shove every player sideways out of the map. */
function arenaOf(map) {
  const rects = mapRects(map).concat(mapWallRects(map));
  /* GLASS (mat 'glass', maps.js) stops a player and not a shot, so it is in
     `rects` and left out of `rayBoxes`. */
  return { map, arena: map.arena, wallH: map.wallH, roofY: mapRoofY(map), robotG: ROBOTS.robotGeo(map),
           resupply: { x: map.resupply.x, z: map.resupply.z },
           /* A roof stops a bullet but not a player, so it is in the ray
              list and NOT in `rects`, exactly like the ceiling. */
           rects, rayBoxes: rects.filter(r => !r.glass).concat(mapRoofRects(map), [mapCeilingRect(map)]) };
}

/* ------------------------------- Geometry --------------------------------- */
// 2D segment (from → to) vs axis-aligned rectangle. Returns nearest hit
// distance along the segment (world units) or Infinity if no hit.
function segRectDist(fx, fz, tx, tz, r) {
  const dx = tx - fx, dz = tz - fz;
  let tmin = 0, tmax = 1;
  // slab test on X then Z
  for (const [p, d, lo, hi] of [[fx, dx, r.minx, r.maxx], [fz, dz, r.minz, r.maxz]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return Infinity; }
    else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  const len = Math.hypot(dx, dz);
  return tmin * len;
}
// Is the straight line between two XZ points unobstructed by any wall?
function lineClear(room, fx, fz, tx, tz) {
  for (const r of room.rects) if (segRectDist(fx, fz, tx, tz, r) < Infinity) return false;
  return true;
}
// Push a circle (radius) out of any rectangle it overlaps, then clamp to arena.
/* ------------------------- Movement validation ----------------------------
   The server used to store whatever x/y/z a client sent. Nothing asked
   whether you could have travelled that far in that time, whether a wall was
   in the way, or whether you were inside the geometry — so a modified client
   could teleport across the map, run at any speed, walk through walls or
   hover. Movement is still simulated on the client (that has not changed),
   but what it reports is now checked before it is believed.

   Three checks, in order:
     1. Speed. The fastest legitimate movement is a dodge roll, ROLL_SPEED.
        SLACK is for network jitter and batched packets after a stall; a step
        longer than that is clamped back along its own direction rather than
        rejected, so a laggy player slides to where they claim instead of
        rubber-banding to a stop.
     2. Height. Feet stay between the floor and head-room under the ceiling,
        and cannot climb faster than a jump.
     3. Geometry. Pushed out of any box their body actually intersects.
        This MIRRORS the client's own pass, including the rule that skips a
        box you are standing on top of (maxy <= feet + 0.05) — get that wrong
        and anyone on a crate is shoved off it every tick. */
const MOVE = {
  maxSpeed: 20,        // ROLL.speed, the fastest the client can legitimately go
  burst: 2.0,          // metres of unspent credit, for jitter and batched packets
  maxRise: 16,         // vertical, a jump plus slack
  radius: 0.4,         // me.radius on the client
};
const BODY_H = [1.8, 1.15, 0.7];        // stand / crouch / prone, matching STANCE

/* Push out of boxes the body is actually inside. Height-aware on purpose:
   resolve2D below is 2D and would shove a player off the crate they are
   standing on. */
function resolveBody(room, pos, feetY, st) {
  const top = feetY + (BODY_H[st] || BODY_H[0]), r = MOVE.radius;
  for (const c of room.rects) {
    if (c.miny > top || c.maxy <= feetY + 0.05) continue;    // above us, or underfoot
    const cx = Math.max(c.minx, Math.min(pos.x, c.maxx));
    const cz = Math.max(c.minz, Math.min(pos.z, c.maxz));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { const p = r - d; pos.x += dx/d*p; pos.z += dz/d*p; }
    else if (d === 0) pos.x += r;
  }
  const b = room.arena - 1.2;
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(b, pos.z));
}

/* Returns the position the server is willing to believe. */
function vetMove(room, p, nx, ny, nz, now) {
  const dt = Math.min(Math.max((now - (p.moveAt || now)) / 1000, 0.016), 0.5);
  p.moveAt = now;

  /* A budget, not a per-packet limit. Distance accrues at the top legal
     speed and a little goes unspent, so a client whose packets batch up
     after a stall can catch up — but the SUSTAINED rate can never exceed
     maxSpeed, which a flat per-packet allowance with slack in it would
     happily permit forever. */
  p.moveBudget = Math.min((p.moveBudget || 0) + MOVE.maxSpeed * dt, MOVE.burst);
  let dx = nx - p.x, dz = nz - p.z;
  const step = Math.hypot(dx, dz);
  if (step > p.moveBudget && step > 1e-6) {     // too far: slide, don't jump
    const k = p.moveBudget / step;
    dx *= k; dz *= k;
    p.moveBudget = 0;
    p.warps = (p.warps || 0) + 1;               // for anyone watching the logs
  } else {
    p.moveBudget -= step;
  }
  const pos = { x: p.x + dx, z: p.z + dz };

  let y = typeof ny === 'number' ? ny : (p.y || 0);
  const rise = y - (p.y || 0), maxRise = MOVE.maxRise * dt;
  if (Math.abs(rise) > maxRise) y = (p.y || 0) + Math.sign(rise) * maxRise;
  /* Under the lid of the world, not under the wall height: an upper floor
     puts feet at 8.7m on a map whose walls are 11, and a jump from there
     was being pulled back down to 9.1 here while the client stood higher. */
  y = Math.max(0, Math.min(y, room.roofY - 1.9));

  resolveBody(room, pos, y, p.st || 0);
  return { x: pos.x, y, z: pos.z };
}

/* The highest top at (x, z) that is at or below `y`: the floor, or a crate,
   or an upper floor's slab. */
function floorUnder(room, x, z, y) {
  let g = 0;
  for (const r of room.rects)
    if (x > r.minx && x < r.maxx && z > r.minz && z < r.maxz && r.maxy <= y + 0.05 && r.maxy > g) g = r.maxy;
  return g;
}

/* Who last hurt a player, for crediting a fall. */
function hitBy(t, byId) { if (byId && t.id !== byId) { t.lastHitBy = byId; t.lastHitAt = Date.now(); } }
/* The highest top a body standing at (x, z) can be on: anything under its
   feet circle, as the client's own ground test does (touches / FOOT_R). */
function groundAt(room, x, z, y) {
  let g = 0; const R = FALL.footR;
  for (const r of room.rects) {
    if (r.maxy > y + 0.05 || r.maxy <= g) continue;
    const cx = Math.max(r.minx, Math.min(x, r.maxx)), cz = Math.max(r.minz, Math.min(z, r.maxz));
    if (Math.hypot(x - cx, z - cz) <= R) g = r.maxy;
  }
  return g;
}
/* One accepted position: off the ground, keep the highest point; back on
   it, the drop is that peak minus here. `fl` bits from the client: 1 on a
   ladder or mantling, 2 Blast dashing or just double-jumped, 4 a landing
   roll queued (Aseed). 1 and 2 restart the count from where you are. */
function trackFall(room, p, fl, now) {
  const y = p.y || 0;
  if (!p.alive || room.match.phase !== 'live' || (fl & 3) || p.fallPeak === undefined || p.agent === 'txf') { p.fallPeak = y; p.fallRoll = false; return; }
  const ground = groundAt(room, p.x, p.z, y);
  if (y > ground + FALL.air) { if (y > p.fallPeak) p.fallPeak = y; if (fl & 4) p.fallRoll = true; return; }
  const drop = p.fallPeak - y, rolled = p.fallRoll || !!(fl & 4);
  p.fallPeak = y; p.fallRoll = false;
  if (drop <= FALL.safe) return;
  let dmg = (drop - FALL.safe) * FALL.perM;
  if (rolled && p.agent === 'aseed') dmg *= FALL.rollMul;
  dmg = Math.round(dmg); if (dmg <= 0) return;
  p.hp -= dmg;
  io.to(p.id).emit('fell', { dmg, h: +drop.toFixed(1) });
  if (p.hp <= 0 && p.alive) {
    const room_ = room, players = room_.players;
    const k = (p.lastHitBy && now - (p.lastHitAt || 0) < FALL.creditMs) ? players.get(p.lastHitBy) : null;
    eliminate(room_, p, true); p.deaths++;
    if (k) k.kills++;
    io.to(room_.id).emit('kill', { by: k ? k.name : 'the fall', byId: k ? k.id : null, victim: p.name, head: false, via: 'fall' });
  }
}
function resolve2D(room, pos, radius) {
  for (const r of room.rects) {
    const cx = Math.max(r.minx, Math.min(pos.x, r.maxx));
    const cz = Math.max(r.minz, Math.min(pos.z, r.maxz));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d < radius && d > 1e-4) { const p = radius - d; pos.x += dx/d*p; pos.z += dz/d*p; }
    else if (d === 0) pos.x += radius;
  }
  const b = room.arena - 1.2;
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(b, pos.z));
}
// Ray (origin o, unit dir) vs a vertical sphere at (cx,cy,cz). Returns t>0 or Infinity.
function raySphere(o, dir, cx, cy, cz, radius) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox*dir.x + oy*dir.y + oz*dir.z;
  const c = ox*ox + oy*oy + oz*oz - radius*radius;
  const disc = b*b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}
/* Ray (origin o, UNIT dir) vs a box. Returns the 3D distance to the nearest
   entry face, plus which axis it was, or null. Same units as raySphere, so the
   two can be compared directly — the old 2D test returned a horizontal
   distance, which silently under-reported every angled shot.
   A ray starting inside the box returns 0 on purpose; callers that fire from
   on top of a crate sit just above it, not inside it. */
function rayBoxHit(o, dir, r) {
  let tmin = 0, tmax = Infinity, axis = -1, sign = 1;
  const slabs = [[o.x, dir.x, r.minx, r.maxx], [o.y, dir.y, r.miny, r.maxy], [o.z, dir.z, r.minz, r.maxz]];
  for (let i = 0; i < 3; i++) {
    const [p, d, lo, hi] = slabs[i];
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let t1 = (lo - p) / d, t2 = (hi - p) / d, sg = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = sg; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: tmin, axis, sign };
}
// 2D segment vs rectangle that also reports which face was hit, so arrows can
// bounce off it. Returns { t (0..1), nx, nz } or null.
function segRectHit(fx, fz, tx, tz, r) {
  const dx = tx - fx, dz = tz - fz;
  let tmin = 0, tmax = 1, axis = -1, sign = 1;
  const slabs = [[fx, dx, r.minx, r.maxx], [fz, dz, r.minz, r.maxz]];
  for (let i = 0; i < 2; i++) {
    const [p, d, lo, hi] = slabs[i];
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let t1 = (lo - p) / d, t2 = (hi - p) / d, s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  return { t: tmin, nx: axis === 0 ? sign : 0, nz: axis === 1 ? sign : 0 };
}

const rand = (a, b) => a + Math.random()*(b-a);
function randomSpawn(room) {
  const A = room.arena;
  let x, z, t = 0;
  do { x = rand(-(A-6), A-6); z = rand(-(A-6), A-6); t++; }
  while (insideWall(room, x, z) && t < 40);
  return { x, z };
}
function insideWall(room, x, z) {
  for (const r of room.rects) if (x > r.minx-1 && x < r.maxx+1 && z > r.minz-1 && z < r.maxz+1) return true;
  return false;
}

/* --------------------------------- State ---------------------------------- */
/* ---- Rooms ----------------------------------------------------------------
   This server used to BE one match: players, match, fires, smokes and arrows
   were module-level globals, so five people filled the whole game. They now
   live on a room, and the server runs as many rooms as it has players for.
   Rooms never interact, which is what makes this scale — the per-tick cost is
   driven by players-per-room (everyone's position goes to everyone in it), so
   small rooms stay cheap however many you run. */
const rooms = new Map();          // roomId -> room
/* /rooms/new is unauthenticated and every reserved room sits in memory for a
   minute, so without a ceiling a loop against that endpoint allocates rooms
   as fast as the network allows. Both limits are needed: the cap bounds the
   damage, the per-IP throttle stops one visitor reaching it. */
const MAX_ROOMS = 200;
const NEWROOM = { perMinute: 6, seen: new Map() };   // ip -> { n, resetAt }
function mayCreateRoom(ip) {
  const now = Date.now();
  let e = NEWROOM.seen.get(ip);
  if (!e || now >= e.resetAt) { e = { n: 0, resetAt: now + 60000 }; NEWROOM.seen.set(ip, e); }
  if (NEWROOM.seen.size > 5000)                      // never let the ledger itself grow
    for (const [k, v] of NEWROOM.seen) if (now >= v.resetAt) NEWROOM.seen.delete(k);
  return ++e.n <= NEWROOM.perMinute;
}
function makeRoom(id, holdMs, mapId) {
  /* The arena is fixed when the room is made and never changes under the
     people in it: the client builds geometry from the id in `welcome`, and
     swapping it mid-match would leave everyone standing in cover that is no
     longer there. */
  return { id, ...arenaOf(mapById(mapId || DEFAULT_MAP_ID)),
    players: new Map(),           // socket.id -> player
    parked: new Map(),            // token -> { wins, money, guns, name, at }
    smokes: [], fires: [], arrows: [], grenades: [], blasts: [],   // blasts: Salvo's shells and bomblets, each waiting for its moment
    robots: [],                   // Silvars' sensors, drones and dogs (robots.js)
    /* A room made by the Create button has nobody in it yet. Without a hold
       the very next tick would retire it before its creator's socket even
       connected, and their code would be dead on arrival. */
    holdUntil: Date.now() + (holdMs || 0),
    match: { phase: 'waiting', round: 0, until: 0,
             roundWinner: null, matchWinner: null, resupplyBy: null } };
}
/* Lowest free number, not an ever-climbing counter. With a counter, leaving
   an empty server and coming back put you in "r2", then "r3" — the room you
   had just left having been retired behind you. Numbers are a label people
   read, so they should start at 1 whenever 1 is free. */
function nextRoomId() {
  for (let n = 1; ; n++) { const id = 'r' + n; if (!rooms.has(id)) return id; }
}
/* Five letters, no digits, and no I or O so nobody mistypes a 1 or a 0. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newRoomCode() {
  for (let tries = 0; tries < 500; tries++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_LETTERS[Math.floor(Math.random()*CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;                    // 24^5 codes, so only if something is very wrong
}
/* Which room a connection belongs in, in priority order:

   1. The room holding your parked score, if you are coming back from a drop.
      parked is per-room now, so without this a reconnecting player could be
      dropped into a DIFFERENT room and their held score stranded in the old
      one until it expired.
   2. The room your code names — that is how friends land together. A code
      for a room that does not exist is a typo or a dead link, so it returns
      'nosuch' rather than quietly creating an empty room under that name;
      codes are handed out by /rooms/new, not invented by whoever types one.
   3. Any room that already has people in it and space for one more, so the
      population concentrates instead of scattering one-per-room.
   4. Failing that, a brand new room. Note this skips rooms that are empty but
      still holding parked scores: those belong to whoever is mid-reload, and
      a stranger joining one would sit in someone else's half-finished match. */
function roomFor(code, tok) {
  if (tok) for (const r of rooms.values())
    if (r.parked.has(tok) && r.players.size < MATCH.maxPlayers) return r;
  if (code) {
    const r = rooms.get(code);
    if (!r) return 'nosuch';
    return r.players.size < MATCH.maxPlayers ? r : null;
  }
  for (const r of rooms.values())
    if (r.players.size && r.players.size < MATCH.maxPlayers) return r;
  if (rooms.size >= MAX_ROOMS) return null;          // at capacity: turned away
  const r = makeRoom(nextRoomId());   // auto-made rooms take the server default
  rooms.set(r.id, r);
  return r;
}
/* What the lobby shows before you commit to joining anything. */
function roomList() {
  return [...rooms.values()]
    .map(r => ({ id: r.id, players: r.players.size, max: MATCH.maxPlayers,
                 phase: r.match.phase, round: r.match.round,
                 map: r.map.id, mapName: r.map.name,
                 named: !/^r[0-9]+$/.test(r.id) }))
    .sort((a, b) => b.players - a.players || (a.id < b.id ? -1 : 1));
}
/* A match used to be thrown away the moment the room dipped below two, and
   with it everyone's round wins, because resetEconomy() zeroes them. One
   backgrounded browser tab is enough to cause that: Chrome throttles it,
   socket.io times the heartbeat out, and the score you just earned is gone.
   A drop now PAUSES the match instead, and a player who comes back inside the
   grace window reclaims their own score from here. Keyed by a token the client
   keeps in localStorage, not by socket id (new on every reconnect) and not by
   name (two tabs are both "Player"). */
function sweepParked(room, now) {
  for (const [tok, v] of room.parked) if (now - v.at > MATCH.rejoinMs) room.parked.delete(tok);
}
// Crossbow ability tuning (must match the client's WEAPONS entry)
// burnMs is how long a PERSON burns. The fire left on the ground is a
// client-side visual with its own (longer) lifetime — see GFIRE in the client.
/* A bolt is worth 90 to the head and 50 to the body. It was a flat 90
   wherever it landed, which made a two-charge ability a guaranteed near-kill
   for pointing it at someone. The gun multipliers are deliberately NOT
   reused: ×2.5/×1.0/×0.65 off a 90 head gives 36 on the torso and 23 on a
   limb, which guts a 30s cooldown. The bolt has two hitboxes anyway, body
   and head — no arms or legs — so it carries its own two numbers.
   The burn rides on top of either, so head is effectively 150 and body 110.
   Keep in step with the client's CROSSBOW entry in public/weapons.js. */
const XBOW = { headDmg: 90, bodyDmg: 50, burnDps: 12, burnMs: 5000, charges: 2, cooldownMs: 30000, speed: 62 };
/* ---- Agents ----
   Picked on the client's menu and sent ONCE, in the socket handshake
   (auth.agent); anything later is ignored, so you cannot swap mid-match.
   Every ability handler checks it, so a patched client cannot throw an
   Aseed bolt as Blast or a grenade as Aseed. Must match AGENTS in
   public/weapons.js. */
const AGENT_IDS = ['aseed', 'blast', 'silvars', 'salvo', 'txf'];
/* TxF, the hidden agent (robots.js TXF): only with the secret code, and one
   per room. 500 HP, so every "back to full" goes through maxHpOf. */
const TXF = ROBOTS.TXF;
const maxHpOf = p => (p && p.agent === 'txf') ? TXF.hp : 100;
const agentOf = a => AGENT_IDS.includes(a) ? a : 'aseed';
/* Salvo's passive (robots.js SALVO): fire and explosions do blastMul of
   their damage to him. Used by every blast, every burn tick and the drone's
   dive - the things that are fire or explosion - and nothing else. */
const SALVO = ROBOTS.SALVO;
const blastMul = t => (t && t.agent === 'salvo') ? SALVO.blastMul : 1;
/* Blast's frag grenade: lobbed, bounces, goes off fuseMs after the throw.
   Full damage inside `full`, linear to nothing at `radius`, and blocked by
   geometry between the blast and the target's chest. The thrower is never
   hurt by their own. Must match GREN in public/effects.js. */
/* `bounce` is what it keeps off geometry. It was 0.42, which sent a frag
   skipping back out of the room it was thrown into; at 0.22 it stays near
   where it lands. `bodyBounce` is the same number for a PERSON, lower again
   because flesh absorbs: a grenade thrown at someone now drops at their
   feet instead of flying through them, which it used to do -- bodies were
   not in the collision test at all. `bodyR` is the half-width of the box
   that stands in for a player (see bodyBoxes). */
const GRENADE = { charges: 2, cooldownMs: 30000, fuseMs: 2000, gravity: 14, bounce: 0.22,
                  bodyBounce: 0.12, bodyR: 0.45,
                  friction: 0.62, radius: 5.5, full: 1.5, dmg: 90, maxSpeed: 26 };
/* Blast's zone: 25s of buffs, then 90s before it can be used again. Only
   the regen lives here — sprint, aim speed and spread are client feel, and
   the server's movement check already bounds sprint. */
const ZONE = { ms: 25000, cdMs: 90000, regen: 10, reloadMul: 0.6 };
/* FALL DAMAGE (Jack, 2026-11-27). Drops up to `safe` are free - a jump peaks
   at 2.3m and Blast's double jump at 4.1m, so normal movement never hurts -
   then `perM` a metre, so about 15m is lethal from full. Aseed's landing roll
   (V in the air) takes `rollMul` of it. Ladders, mantles, Blast's air dash
   and his double jump restart the count (the client says which, in `fl`). A fall death goes to
   whoever last hurt you inside `creditMs`. Must match FALL in loop.js. */
const FALL = { safe: 5, perM: 10, rollMul: 0.5, creditMs: 5000, air: 0.12, footR: 0.3 };
// Smoke bolt: no damage. Anyone standing in the cloud is tagged for markMs,
// and the tag renews every tick they stay in it. Must match the client's
// SMOKEFX radius/top/markMs or the cloud you see won't match the one that tags.
const SMOKE = { charges: 2, cooldownMs: 30000, speed: 52, ms: 10000,
                radius: 5.5, top: 3.4, markMs: 4000 };

// Ground fire was a client-only visual; the server now tracks the pools too,
// because standing in one has to actually hurt. radius/ms MUST match the
// client's GFIRE or the fire you see won't be the fire that burns you.
// top: feet height above which you are clear of it (on a crate, say).
// graceMs: how long the burn lingers after you step out.
// dps is deliberately higher than XBOW.burnDps: a direct hit already lands 50-90
// up front, whereas a pool only hurts you for as long as you choose to stand
// in it. Keep in step with the client's GFIRE.dps.
// lingerDps/lingerMs: you walk out of a pool still alight, but burning at a
// lower rate than the fire itself. graceMs only covers gaps between ticks
// while you are still standing in it.
const FIRE = { radius: 4.35, ms: 9000, top: 1.0, graceMs: 1200, dps: 18,
               lingerDps: 6, lingerMs: 5000 };

// Blade melee (must match the client's BLADE entry)
const MELEE = { combo: [22,22,28,28,70], windowMs: 1600, rateMs: 320, reach: 3.4, arc: 0.5,
  /* the charged cut: timed HERE, from 'meleeCharge' to the 'melee' that
     carries heavy - keep in step with HEAVY in public/weapons.js. `slack`
     forgives jitter between the two packets; `maxHoldMs` lets a hold go
     stale (a charge is not a cut banked for later). */
  heavy: { minMs: 250, fullMs: 1100, min: 35, max: 85, reachAdd: 0.6, slack: 60, maxHoldMs: 15000,
           speedFrom: 2, speedTo: 13, speedGain: 0.5 } };   // the stab hits harder the faster you are moving (the server's own measure of it)
let arrowSeq = 0;
/* ----------------------------- Match format ------------------------------
   Multiplayer is round-based and has no bots. Kill the opposition to take a
   round; first to MATCH.winsNeeded rounds takes the match, then everything
   resets and it runs again. Death inside a round is elimination — you sit it
   out until the next one, which is what makes a round worth winning. */
/* prepMs is the buy window, and it is the same before round 1 as it is
   between rounds — it is all "prep" to the player, so one number. */
const MATCH = { winsNeeded: 3, prepMs: 30000, endMs: 7000, minPlayers: 2, rejoinMs: 60000,
                maxPlayers: 5 };
/* Round starts must not drop two people in sight of each other. SPAWN_APART
   is the minimum separation; the picker also prefers spawns with geometry
   between them, so nobody can be shot before they have moved. */
const SPAWN_APART = 22;
/* Economy. You carry one MAIN (rifle / sniper / shotgun) and one SIDE (either
   pistol) — buying within a category replaces what you had there, no refund,
   so money is worth saving. The crossbow, smoke and blade are always yours and
   cost nothing. Money resets per MATCH, never between rounds.
   Slots match the client's WEAPONS: 0 rifle, 1 sniper, 2 shotgun, 3 pistol,
   4 pistol X. */
const ECON = { start: 200, win: 200, loss: 100 };
/* Pistol X out-damages the Pistol (40 vs 30) at the same rate class, so at a
   matched price there was never a reason to buy the Pistol. It costs double. */
const PRICES = [150, 300, 150, 50, 100];
/* What each gun actually does. This used to come from the CLIENT — the fire
   handler read d.dmg and d.range off the packet — so three lines in a browser
   console bought you a 99999-damage rifle with 400m of reach that shot
   through the map. The client now says only WHICH weapon it fired; every
   number comes from here.

   Must stay in step with WEAPONS in public/weapons.js. Index is the shop
   slot, the same one PRICES uses.
   pellets is how many 'fire' events one trigger pull is allowed to send
   (the shotgun sends one per pellet), and fireRate is the gap between pulls
   in ms — together they are the rate limit, because nothing stopped a
   patched client firing a sniper a hundred times a second. */
const GUNS = [
  { name:'RIFLE',    dmg:26,  range:240, fireRate:95,   pellets:1, magMax:30, reserveMax:120, reloadMs:1600 },
  { name:'SNIPER',   dmg:110, range:400, fireRate:1200, pellets:1, magMax:5,  reserveMax:25,  reloadMs:2400 },
  { name:'SHOTGUN',  dmg:12,  range:60,  fireRate:900,  pellets:8, magMax:6,  reserveMax:36,  reloadMs:2200 },
  { name:'PISTOL',   dmg:30,  range:180, fireRate:200,  pellets:1, magMax:12, reserveMax:60,  reloadMs:1200 },
  { name:'PISTOL X', dmg:40,  range:180, fireRate:170,  pellets:1, magMax:10, reserveMax:50,  reloadMs:1100 },
];
/* Ammunition was counted only in the browser, so a patched client simply
   never ran out. The server keeps the real magazines; the client keeps its
   own copy for the HUD and is corrected after every shot it fires. */
function ammoOf(p, slot) {
  if (!p.ammo) p.ammo = {};
  if (!p.ammo[slot]) p.ammo[slot] = { mag: GUNS[slot].magMax, reserve: GUNS[slot].reserveMax };
  return p.ammo[slot];
}
function fillAmmo(p, slot) {
  if (!p.ammo) p.ammo = {};
  p.ammo[slot] = { mag: GUNS[slot].magMax, reserve: GUNS[slot].reserveMax };
}
/* A reload started earlier may have finished by now. Resolved lazily so
   there is nothing to tick. */
function settleReload(p, now) {
  if (!p.reloadAt || now < p.reloadAt) return;
  const slot = p.reloadSlot, g = GUNS[slot];
  p.reloadAt = 0;
  if (!g) return;
  const a = ammoOf(p, slot);
  const take = Math.min(g.magMax - a.mag, a.reserve);
  a.mag += take; a.reserve -= take;
}
function sendAmmo(p, slot) {
  const a = ammoOf(p, slot);
  io.to(p.id).emit('ammo', { slot, mag: a.mag, reserve: a.reserve });
}
/* Network jitter means a burst never arrives on an exact cadence, so allow a
   shot a little early rather than eating legitimate ones. */
const RATE_SLACK = 0.75;
/* Passive detection. Everyone has it, nobody equips it. When an opponent
   makes a noise — firing a gun, loosing a bolt — it picks them out through
   walls for revealMs, then sleeps for cooldownMs. The same window also lights
   up hazards on the client: fire pools and smoke clouds stand in for traps
   until there are real ones. */
const DETECT = { revealMs: 4000, cooldownMs: 30000, range: 40 };
/* A bounced bolt is spent: it keeps BOUNCE.keep of its speed and no more
   than BOUNCE.lifeS to run, so banking one round a corner is a short, close
   shot rather than a second full-length flight. */
const BOUNCE = { keep: 0.55, lifeS: 1.1 };
/* Hitting an underside is not a landing and not a bounce: the bolt stops
   dead against the surface and drops straight down from the point of
   contact, rather than skipping along the roof. */
const MAIN_SLOTS = [0, 1, 2];
const SIDE_SLOTS = [3, 4];
const MAX_MAIN = 2, MAX_SIDE = 1;        // what you can carry at once
/* Hit zones, in the usual shooter convention: the head hurts most, the torso
   is the baseline, arms and legs hurt less. Each zone is a sphere per stance,
   [height above the feet, radius]; stance order is stand / crouch / prone, so
   crouching and going prone still shrink you.
   The arms sphere deliberately WRAPS the torso — that is how a shot near the
   edge of the silhouette reads as an arm while one through the middle reads
   as the torso. hitZone drops arms whenever the torso was also hit.
   KEEP IN SYNC with the client's copy in weapons.js. */
/* [height above the feet, radius] per stance: stand / crouch / prone.
   head and body are EXACTLY the old two-box model, and the head-vs-body
   boundary is still decided between those two alone, so nothing that used to
   connect reads differently.
   core is the torso proper, sitting INSIDE body. A body hit is then split:
   inside the core it is a torso hit, in the ring between core and body it is
   an arm. That ring is where the model's arms actually are — the visible
   figure is only about 0.41 wide, so a 0.55 "arms" sphere outside body would
   have sat in empty air and never been hit, which is exactly what happened. */
const HITBOX = {
  /* head now matches the model: its head box is 0.26x0.28 at 1.68 with a
     helmet on top, so the head occupies y1.54-1.87 and is 0.15 half-wide.
     The old sphere was r0.30 at 1.70 — reaching 14cm down into the chest,
     13cm of empty air above the helmet, and twice as wide as the head. */
  head:  [[1.70,0.19],[1.22,0.18],[0.55,0.22]],
  body:  [[1.05,0.55],[0.70,0.50],[0.32,0.45]],
  /* shoulders and upper arms: the torso sphere stops at y1.60, but the arm
     boxes run to 1.75, so without this the upper arms were a dead zone that
     swallowed shots entirely. */
  upper: [[1.45,0.45],[1.00,0.40],[0.32,0.45]],
  legs:  [[0.32,0.34],[0.18,0.28],[0.20,0.34]],
};
/* How far off the target's centre line a body hit has to be to count as an
   arm. Measured as the perpendicular distance from the shot line to their
   vertical axis, NOT a second sphere: a sphere small enough to exclude the
   arms also excludes the upper chest, so central shots at shoulder height
   would have scored as arm hits. The model's torso is 0.5 wide and its arms
   sit between 0.27 and 0.41 out, so 0.26 separates them cleanly. */
const CORE_R = [0.26, 0.26, 0.30];
/* Resupply point: the big crate dead centre of the map. Walk into it and
   your ammo is topped up (the client owns ammo, so it does that bit); in a
   match it also pays cash, but only ONCE per player per round, or standing
   on it would be an income stream. radius covers standing against the crate
   or on top of it — the crate itself is 6x6. */
/* The crate holds two separate prizes. The cash is ONE per round for the
   whole room. The ammo used to top anyone up, any time they walked in, which
   made the middle of the map a free refill station — it is now one player
   every ammoMs, shared, and only while a round is live. Outside a live round
   it is free: the buy window already hands you a full magazine with a gun. */
/* WHERE it is comes from the room's map (room.resupply); these are the
   numbers that are the same wherever it stands. */
const RESUPPLY = { radius: 5.0, cash: 100, ammoMs: 30000 };
/* Health potions. Five scattered each round, each one gone for the round
   once anybody takes it.

   heals is PER PLAYER, not per room: your first potion of the round gives
   40, your second 30, and so on. Room-wide falloff would punish the second
   player for the first one's pickup; per-player is what stops one person
   hoovering up all five and topping back to full each time. The last value
   repeats if somehow all five go to one player.

   apart keeps them from clustering, and they stay clear of the resupply
   crate so the middle of the map isn't the answer to everything. */
const POTION = { n: 5, radius: 1.7, apart: 20, clearOfCrate: 12,
                 heals: [40, 30, 20, 15, 10] };
function placePotions(room) {
  const out = [];
  for (let i = 0; i < POTION.n; i++) {
    let best = null, bestNearest = -1;
    for (let tries = 0; tries < 160; tries++) {
      const c = randomSpawn(room);
      if (Math.hypot(c.x - room.resupply.x, c.z - room.resupply.z) < POTION.clearOfCrate) continue;
      let nearest = Infinity;
      for (const o of out) nearest = Math.min(nearest, Math.hypot(c.x - o.x, c.z - o.z));
      if (nearest >= POTION.apart) { best = c; break; }      // good enough, take it
      if (nearest > bestNearest) { bestNearest = nearest; best = c; }
    }
    out.push({ x: best.x, z: best.z, taken: false });
  }
  room.potions = out;
  io.to(room.id).emit('potions', { at: out.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) });
}
/* Which are still there, as one byte — the positions only change at the
   start of a round, so they ride in their own event rather than the tick. */
function potionMask(room) {
  let m = 0;
  (room.potions || []).forEach((p, i) => { if (!p.taken) m |= (1 << i); });
  return m;
}
const MULT = { head:2.5, torso:1.0, arms:0.65, legs:0.65 };
/* Nearest zone the ray enters, or null. */
function hitZone(o, dir, cx, cz, baseY, st) {
  const s = Math.max(0, Math.min(2, st | 0));
  const reach = k => { const [dy, r] = HITBOX[k][s]; return raySphere(o, dir, cx, baseY + dy, cz, r); };
  /* The head sphere now hugs the model, so a hit on it really is a hit on
     the head and it simply wins. That was not safe when the sphere was r0.30
     and reached down into the chest — back then it had to lose to a nearer
     body entry, or every upper-chest shot became a headshot. */
  const th = reach('head');
  if (th < Infinity) return { t: th, zone: 'head', mult: MULT.head };
  const tb = Math.min(reach('body'), reach('upper'));
  if (tb < Infinity) {
    // A body hit, split by how central it is. The entry point stays the
    // body's, so the impact marker lands where it always did.
    const hd = Math.hypot(dir.x, dir.z);
    const lateral = hd < 1e-6
      ? Math.hypot(o.x - cx, o.z - cz)                       // straight up or down
      : Math.abs((cx - o.x) * (dir.z / hd) - (cz - o.z) * (dir.x / hd));
    const central = lateral <= CORE_R[s];
    return { t: tb, zone: central ? 'torso' : 'arms',
             mult: central ? MULT.torso : MULT.arms };
  }
  const tl = reach('legs');
  if (tl < Infinity) return { t: tl, zone: 'legs', mult: MULT.legs };
  return null;
}
/* Guns are held as an ORDERED list: the first you buy is position 1, the
   second position 2, and the number keys pick by position rather than by
   weapon. Buying past the limit drops the oldest of that category. */

/* Pick n spawns that are far apart and, where the arena allows, out of each
   other's line of sight. Scored rather than rejected outright: with five
   players in one room a perfect no-sightline set may not exist, so we take
   the best of a bounded search instead of looping forever. */
function spreadSpawns(room, n) {
  const chosen = [];
  for (let i = 0; i < n; i++) {
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 120; tries++) {
      const c = randomSpawn(room);
      if (!chosen.length) { best = c; break; }
      let nearest = Infinity, blocked = 0;
      for (const o of chosen) {
        const d = Math.hypot(c.x - o.x, c.z - o.z);
        if (d < nearest) nearest = d;
        if (!lineClear(room, c.x, c.z, o.x, o.z)) blocked++;   // something in the way
      }
      if (nearest < SPAWN_APART) continue;               // never spawn on top of someone
      const hidden = blocked === chosen.length;
      const score = (hidden ? 1000 : 0) + Math.min(nearest, 70);
      if (score > bestScore) { bestScore = score; best = c; }
      if (hidden && nearest > 30) break;                 // good enough
    }
    chosen.push(best || randomSpawn(room));
  }
  return chosen;
}
function respawnAll(room) {
  const players = room.players;
  const spots = spreadSpawns(room, players.size);
  let i = 0;
  for (const p of players.values()) {
    const s = spots[i++] || randomSpawn(room);
    p.x = s.x; p.z = s.z; p.y = 0; p.hp = maxHpOf(p); p.alive = true; p.laserOn = false; p.fly = false;
    p.tp = (p.tp || 0) + 1;        // force the client to accept this position
    p.burnUntil = 0; p.burnRate = 0; p.inFire = false;
    p.markedUntil = 0; p.markedBy = null; p.rl = 0; p.st = 0; p.diedAt = 0;
    p.lo = 0; p.vx = 0; p.vz = 0; p.stateAt = 0; p.moveAt = 0;   // a teleport is not travel
    p.fallPeak = undefined; p.lastHitBy = null;                    // nor is it a fall
    if (p.hist) p.hist.length = 0;                  // and nothing to rewind onto
  }
}
function clearField(room) {        // no fire, smoke or arrows carried between rounds
  room.arrows.length = 0; room.smokes.length = 0; room.fires.length = 0; room.grenades.length = 0;
  /* Robots do not carry between rounds either. A dog cleared away by the
     round ending was not DESTROYED, so its 70s does not start: it is ready
     for the next round. */
  for (const r of room.robots) if (r.kind === 'dog' || r.kind === 'drone') { const o = room.players.get(r.owner);
    if (o) { if (r.kind === 'dog') o.dogReadyAt = 0; else o.droneReadyAt = 0; } }
  room.robots.length = 0;
  for (const p of room.players.values()) if (p.linked) p.linked.clear();
  io.to(room.id).emit('fieldclear');
  io.to(room.id).emit('robots', []);
}
/* Put every player out. The round ending used to leave the field alight: the
   award branch set the phase to 'intermission' without clearing anything, and
   neither scorch() nor burnTick() looks at the phase, so last round's pools
   kept burning right through the 30s buy window — enough to take the round
   WINNER from 100 to 46 while they shopped. */
function douseAll(room) {
  for (const p of room.players.values()) {
    p.burnUntil = 0; p.burnRate = 0; p.burnNext = 0; p.inFire = false;
    p.markedUntil = 0; p.markedBy = null;
  }
}
function openBuyWindow(room, now, ms) {    // intermission doubles as the shop
  room.match.phase = 'intermission'; room.match.until = now + ms;
  clearField(room); respawnAll(room); resetDetection(room); resetResupply(room);
  for (const p of room.players.values()) p.potions = 0;
  placePotions(room);                      // visible while you shop, live at the bell
}
function resetEconomy(room) {
  for (const p of room.players.values()) {
    p.wins = 0; p.money = ECON.start; p.guns = []; p.ammo = {}; p.reloadAt = 0;
  }
}
/* Somebody just made a noise. Anyone close enough whose passive is off
   cooldown picks them out, and their own passive then sleeps for 30s. Called
   from every handler that represents a bang: gunfire, the crossbow and the
   smoke bolt. It is hearing, so it has a range — the arena is 120x120 and
   map-wide detection meant a shot fired in the far corner lit you up. Out of
   earshot nothing happens at all, cooldown included. */
function noiseMade(room, byId, now) {
  const players = room.players;
  const src = players.get(byId); if (!src) return;
  for (const p of players.values()) {
    if (p.id === byId || !p.alive) continue;
    if (p.agent !== 'aseed') continue;                // hearing is Aseed's passive
    if (now < p.detectReadyAt) continue;             // still recharging
    if (Math.hypot(p.x - src.x, p.z - src.z) > DETECT.range) continue;   // too far to hear
    p.detectUntil = now + DETECT.revealMs;
    p.detectTarget = byId;
    p.detectReadyAt = now + DETECT.cooldownMs;
  }
}
/* Being eliminated moves you to a spawn point rather than leaving your body
   where it fell. You sit the round out there — same place you'd start a round
   or a match from. Bots have no spawn to go to, so they stay put. */
function eliminate(room, e, isPlayer) {
  e.alive = false; e.hp = 0; e.laserOn = false; e.fly = false;
  e.diedAt = Date.now();        // who went down last decides a mutual kill
  e.burnUntil = 0; e.burnRate = 0; e.inFire = false;
  e.markedUntil = 0; e.markedBy = null; e.rl = 0;
  if (isPlayer) { const s = randomSpawn(room); e.x = s.x; e.z = s.z; e.y = 0; e.st = 0;
                  e.tp = (e.tp || 0) + 1; e.moveAt = 0; }
}
/* Payloads land where the bolt actually stopped, height included. These used
   to be x/z only, so a bolt that stuck in the top of a crate put its fire on
   the floor underneath. */
function dropFire(room, x, y, z, byId, now, pool) {
  const P = pool || FIRE;
  room.fires.push({ x, y, z, by: byId, until: now + P.ms, r: P.radius, dps: P.dps, lingerDps: P.lingerDps, lingerMs: P.lingerMs });
  io.to(room.id).emit('groundfire', pool ? { x, y, z, r: P.radius, ms: P.ms } : { x, y, z });
}
function dropSmoke(room, x, y, z, byId, now) {
  room.smokes.push({ x, y, z, by: byId, until: now + SMOKE.ms });
  io.to(room.id).emit('smoke', { x, y, z, by: byId });
}
/* The cash is ONE prize per round, not one each: first player to reach the
   crate takes it and nobody else can that round. Ammo is separate and still
   tops up for everyone, every time they walk in. */
function resetResupply(room) {
  room.match.resupplyBy = null;
  room.match.ammoAt = 0;                  // the ammo is there again next round
  for (const p of room.players.values()) p.inResupply = false;
}
function resetDetection(room) {
  for (const p of room.players.values()) { p.detectReadyAt = 0; p.detectUntil = 0; p.detectTarget = null;
    p.linkUntil = 0; p.linkReadyAt = 0; if (p.teamSeen) p.teamSeen.clear(); }   // Silvars' Linked Sight too
}
function startRound(room, n, resetWins) {
  if (resetWins) resetEconomy(room);
  const match = room.match;
  match.round = n; match.phase = 'live';
  match.roundWinner = null; match.matchWinner = null; match.until = 0;
  clearField(room); respawnAll(room); resetDetection(room); resetResupply(room);
  for (const p of room.players.values()) p.potions = 0;   // falloff is per round
  /* No placePotions here: openBuyWindow always runs first and has already
     put the set out. Doing it again at the bell MOVED every potion the
     instant the round went live, so the positions clients had been shown
     were stale. */
}

const COLORS = [0x27ff9e, 0x3ad0ff, 0xffd15a, 0xff7ac2, 0xb08bff, 0x8affc1, 0xff9a5a];

/* ======================= The snapshot on the wire ==========================
   The snapshot goes to everyone in the room every tick, so it is the whole
   bandwidth bill. As JSON it spelled out a field name and a decimal number
   for every value — "hp":100 is nine characters to carry one byte, and a
   20-character socket id rode along per player per tick.

   It is two messages now instead of one:

   'meta'     — JSON, sent only when it CHANGES. Socket ids, names, colours,
                money, wins, kills and owned guns. None of that changes at
                20Hz, so none of it belongs in the hot path. It also hands the
                client the slot->id mapping everything below depends on.
   'snapshot' — a packed binary frame, every tick, carrying only what moves.
                Players are identified by a one-byte SLOT, not their id.

   Layout (little-endian). Both sides must agree exactly; the version byte is
   there so a stale client fails loudly instead of misreading every field.

   HEADER  12 bytes
     u8  version              u8  phase index (PHASES below)
     u8  round                u16 endsIn ms
     i8  roundWinner slot     i8  matchWinner slot
     u8  flags: bit0 the round's cash is gone
     u8  ammo cooldown, whole seconds left (0 = ready)
     u8  potions still on the map, one bit each (positions come in 'potions')
     u8  player count         u8  arrow count
   PLAYER  22 bytes each
     u8  slot                 u8  flags: bit0 alive, bit1 burning, bit2 flying (TxF)
     u8  stance               u16 hp
     i16 x*100  i16 y*100  i16 z*100      (centimetres; the arena is +-60m)
     u16 yaw    (0..65535 across a full turn)
     u8  roll   (0..255 across 0..1)
     u8  tp     (low byte; the client only tests it for CHANGE)
     i8  lean   (centimetres out of cover, -60..60)
     i8  markedBy slot        i8  detectTarget slot
     u16 detectUntil ms       u16 detectReady ms
   ARROW   15 bytes each (grenades too)
     u16 id
     i16 x,y,z *100           i16 vx,vy,vz *100
     u8  flags: bit0 smoke bolt, bit1 grenade
   ========================================================================= */
const SNAP_VERSION = 5;          // 2 lean, 3 ammo timer, 4 potions, 5 hp u16 (TxF's 500)
const PHASES = ['waiting', 'intermission', 'live', 'over', 'paused'];
const HEAD_B = 12, PLAYER_B = 22, ARROW_B = 15;
const i16 = v => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
const u16 = v => Math.max(0, Math.min(65535, Math.round(v)));

function freeSlot(room) {
  const used = new Set([...room.players.values()].map(p => p.slot));
  for (let i = 0; ; i++) if (!used.has(i)) return i;
}
/* Everything that does NOT change every tick. Emitted only when it differs
   from last time — in practice on a join, a buy, a kill or a round ending. */
function metaOf(room) {
  return { players: [...room.players.values()].map(p => ({
    slot: p.slot, id: p.id, name: p.name, color: p.color, agent: p.agent,
    money: p.money, wins: p.wins || 0, kills: p.kills, guns: p.guns })) };
}
function sendMeta(room, force) {
  const meta = metaOf(room);
  const sig = JSON.stringify(meta);
  if (!force && sig === room.metaSig) return;
  room.metaSig = sig;
  io.to(room.id).emit('meta', meta);
}
function encodeSnapshot(room, now) {
  // grenades ride in the arrow section with flag bit1 - no layout change
  const ps = [...room.players.values()], as = room.arrows.concat(room.grenades);
  const slotOf = id => { const p = room.players.get(id); return p ? p.slot : -1; };
  const buf = Buffer.allocUnsafe(HEAD_B + ps.length*PLAYER_B + as.length*ARROW_B);
  const m = room.match;
  let o = 0;
  buf.writeUInt8(SNAP_VERSION, o++);
  buf.writeUInt8(Math.max(0, PHASES.indexOf(m.phase)), o++);
  buf.writeUInt8(Math.min(255, m.round), o++);
  buf.writeUInt16LE(u16(m.until ? Math.max(0, m.until - now) : 0), o); o += 2;
  buf.writeInt8(m.roundWinner ? slotOf(m.roundWinner) : -1, o++);
  buf.writeInt8(m.matchWinner ? slotOf(m.matchWinner) : -1, o++);
  buf.writeUInt8(m.resupplyBy ? 1 : 0, o++);
  buf.writeUInt8(Math.max(0, Math.min(255, Math.ceil(((m.ammoAt || 0) - now) / 1000))), o++);
  buf.writeUInt8(potionMask(room), o++);
  buf.writeUInt8(ps.length, o++);
  buf.writeUInt8(as.length, o++);
  for (const p of ps) {
    buf.writeUInt8(p.slot, o++);
    buf.writeUInt8((p.alive ? 1 : 0) | (p.burnUntil > now ? 2 : 0) | (p.fly ? 4 : 0), o++);
    buf.writeUInt8(p.st || 0, o++);
    buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(p.hp))), o); o += 2;
    buf.writeInt16LE(i16(p.x), o); o += 2;
    buf.writeInt16LE(i16(p.y || 0), o); o += 2;
    buf.writeInt16LE(i16(p.z), o); o += 2;
    let yaw = (p.yaw || 0) % (Math.PI*2); if (yaw < 0) yaw += Math.PI*2;
    buf.writeUInt16LE(u16(yaw / (Math.PI*2) * 65535), o); o += 2;
    buf.writeUInt8(Math.round(Math.max(0, Math.min(1, p.rl || 0)) * 255), o++);
    buf.writeUInt8((p.tp || 0) & 0xff, o++);
    buf.writeInt8(Math.max(-60, Math.min(60, Math.round((p.lo || 0) * 100))), o++);
    buf.writeInt8((p.markedUntil > now && p.markedBy) ? slotOf(p.markedBy) : -1, o++);
    buf.writeInt8(p.detectTarget ? slotOf(p.detectTarget) : -1, o++);
    buf.writeUInt16LE(u16(Math.max(0, p.detectUntil - now)), o); o += 2;
    buf.writeUInt16LE(u16(Math.max(0, p.detectReadyAt - now)), o); o += 2;
  }
  for (const a of as) {
    buf.writeUInt16LE(a.id & 0xffff, o); o += 2;
    buf.writeInt16LE(i16(a.x), o); o += 2;
    buf.writeInt16LE(i16(a.y), o); o += 2;
    buf.writeInt16LE(i16(a.z), o); o += 2;
    buf.writeInt16LE(i16(a.vx), o); o += 2;
    buf.writeInt16LE(i16(a.vy), o); o += 2;
    buf.writeInt16LE(i16(a.vz), o); o += 2;
    buf.writeUInt8((a.smoke ? 1 : 0) | (a.grenade ? 2 : 0) | (a.incen ? 4 : 0), o++);
  }
  return buf;
}

/* ------------------------------ Networking -------------------------------- */
io.on('connection', (socket) => {
  /* Pick a room first: everything below reads its state through these three
     locals, so the handlers stay room-scoped without threading it through by
     hand. A code joins friends; without one you get the first room with
     space, so the room is only ever "full" when you asked for that one. */
  const auth = socket.handshake.auth || {};
  const code = auth.room || null, tok = auth.tok || null;
  const room = roomFor(code, tok);
  if (room === 'nosuch') {
    socket.emit('nosuchroom', { code });
    console.log(`[!] refused: no room "${code}"`);
    setTimeout(() => socket.disconnect(true), 150);
    return;
  }
  if (!room) {
    socket.emit('full', { max: MATCH.maxPlayers, code });
    console.log(`[!] refused: room "${code}" is full (${MATCH.maxPlayers}/${MATCH.maxPlayers})`);
    setTimeout(() => socket.disconnect(true), 150);   // let the message land first
    return;
  }
  socket.join(room.id);
  const players = room.players, match = room.match, parked = room.parked;
  const s = randomSpawn(room);
  /* Did this browser leave an unfinished match behind a moment ago? Give it
     back rather than starting them at nothing — a reload mid-match should not
     cost you the rounds you already won. */
  const saved = tok ? parked.get(tok) : null;
  if (saved && Date.now() - saved.at > MATCH.rejoinMs) { parked.delete(tok); }
  const back = (saved && Date.now() - saved.at <= MATCH.rejoinMs) ? saved : null;
  if (back) parked.delete(tok);
  /* TxF only with the code, and only one per room: anyone else asking for
     it is given Aseed and told why. */
  let agentId = agentOf(auth.agent), txfNo = null;
  if (agentId === 'txf') {
    if (!ROBOTS.txfCodeOk(auth.txf)) txfNo = 'code';
    else if ([...players.values()].some(q => q.agent === 'txf')) txfNo = 'taken';
    if (txfNo) agentId = 'aseed';
  }
  const player = {
    id: socket.id, tok, x: s.x, z: s.z, y: 0, yaw: 0, pitch: 0, st: 0,
    /* Joining mid-round used to drop you into it alive at full health, so a
       latecomer could win a round they were not in at the start — and, with
       three or more in the room, reloading the page was a free heal. Sit the
       round out instead; respawnAll() brings you in at the next one. */
    hp: agentId === 'txf' ? TXF.hp : 100, alive: match.phase !== 'live', kills: 0, deaths: 0, wins: back ? back.wins : 0, tp: 0,
    agent: agentId,                    // locked for this connection
    teleShots: [], pulseReadyAt: 0, laserOn: false, heat: 0, overheatUntil: 0, fly: false,   // TxF
    gshots: [], zoneUntil: 0, zoneReadyAt: 0,
    sensorShots: [], droneReadyAt: 0, dogReadyAt: 0, linked: new Map(),   // Silvars
    ishots: [], barrageReadyAt: 0, missileReadyAt: 0,                    // Salvo
    teamSeen: new Map(), linkUntil: 0, linkReadyAt: 0,
    money: back ? back.money : ECON.start,
    guns: back ? back.guns : [],       // owned WEAPONS slots, in purchase order
    detectReadyAt: 0, detectUntil: 0, detectTarget: null,
    color: COLORS[players.size % COLORS.length],
    name: 'Player-' + socket.id.slice(0, 4),
  };
  if (back) player.name = back.name;
  if (agentId === 'txf') player.name = 'TxF';
  player.slot = freeSlot(room);        // one byte stands in for the socket id
  players.set(socket.id, player);
  /* Everything that never changes goes out ONCE, here, instead of riding in
     every snapshot 30 times a second. */
  socket.emit('welcome', { id: socket.id, spawn: s, color: player.color,
    arena: room.arena, map: room.map.id, mapName: room.map.name,
    room: room.id,
    prices: PRICES, mainSlots: MAIN_SLOTS, sideSlots: SIDE_SLOTS,
    resupply: { x: room.resupply.x, z: room.resupply.z,
                radius: RESUPPLY.radius, cash: RESUPPLY.cash },
    maxMain: MAX_MAIN, maxSide: MAX_SIDE, maxPlayers: MATCH.maxPlayers,
    winsNeeded: MATCH.winsNeeded });
  sendMeta(room, true);                // the roster, before any frame refers to it
  if (txfNo) socket.emit('txfno', { why: txfNo });
  if (agentId === 'txf') { socket.to(room.id).emit('txfjoin', {}); sendTxfTimers(player, Date.now()); }
  if (room.potions) socket.emit('potions',
    { at: room.potions.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) });
  if (back) console.log(`[~] ${player.name} rejoined with ${player.wins} round win(s)`);
  console.log(`[+] ${player.name} joined ${room.id} (${players.size}/${MATCH.maxPlayers}, ${rooms.size} room(s))`);

  /* Our own round-trip measurement. socket.io has a heartbeat but does not
     hand us the number, and lag compensation is only as good as this. */
  socket.on('pong2', t => {
    const rtt = Date.now() - t;
    if (rtt < 0 || rtt > 2000) return;
    /* The MINIMUM of recent samples, not an average. Latency has a floor —
       the real network time — and everything else only ever ADDS to it. A
       backgrounded browser tab is the worst offender: Chrome throttles its
       timers, so the reply can come back a second late and an averaged RTT
       would climb to something absurd. Lag compensation rewinds by that
       number, so an inflated one rewinds every target metres into the past
       and the shooter stops hitting anything. Playing in two tabs did
       exactly this. */
    (player.rttSamples || (player.rttSamples = [])).push(rtt);
    if (player.rttSamples.length > 8) player.rttSamples.shift();
    player.rtt = Math.min(...player.rttSamples);
  });

  // Client owns its movement; it streams position/orientation here.
  socket.on('state', (d) => {
    const p = players.get(socket.id); if (!p) return;
    /* Your name is not part of being alive. The whole packet used to be
       dropped while you were down, so anyone sitting a round out — eliminated,
       or joining midway — stayed "Player-a1b2" on the scoreboard until they
       next respawned. */
    /* The secret code must never become anyone's name, and TxF is always TxF. */
    if (typeof d.name === 'string') p.name = (p.agent === 'txf' || ROBOTS.txfCodeOk(d.name)) ? 'TxF' : d.name.slice(0, 16);
    if (p.agent === 'txf' && typeof d.fly === 'number') p.fly = !!d.fly;
    if (!p.alive) return;
    /* Ignore position until the client has acknowledged the last forced move.
       Packets already in flight carry the OLD position and would otherwise
       overwrite the spawn we just put them at — which is how a player parked
       on the resupply circle during prep still collected the cash a moment
       after the round started and teleported them away. */
    const settled = (d.tp === undefined) || (d.tp === p.tp);
    if (settled) {
      /* Velocity between packets. Positions arrive every ~33ms, so by the
         time a shot is tested the newest one is already up to a frame old —
         at a sprint that is a third of a metre. The client covers the same
         gap by extrapolating; this lets the server do the same, so the two
         agree about where someone is RIGHT NOW. */
      const at = Date.now(), gap = (at - (p.stateAt || 0)) / 1000;
      if (p.stateAt && gap > 0.005 && gap < 0.5 && typeof d.x === 'number') {
        const vx = (d.x - p.x) / gap, vz = (d.z - p.z) / gap;
        /* Anything faster than a dodge roll is not travel, it is a jump: a
           respawn, a forced move, or a packet arriving late after a stall.
           Trusting it would fling the hitbox tens of metres on the next
           extrapolated shot, so treat it as a standing start instead. */
        p.vx = Math.hypot(vx, vz) > 30 ? 0 : vx;
        p.vz = Math.hypot(vx, vz) > 30 ? 0 : vz;
      } else if (!p.stateAt) { p.vx = 0; p.vz = 0; }
      p.stateAt = at;
      /* What they claim, checked before it is believed. vetMove does the
         height and the geometry too, so x/y/z all come back from it. */
      if (typeof d.x === 'number' && typeof d.z === 'number') {
        const v = vetMove(room, p, d.x, typeof d.y === 'number' ? d.y : (p.y || 0), d.z, at);
        p.x = v.x; p.y = v.y; p.z = v.z;
        trackFall(room, p, d.fl | 0, at);
      }
    }
    if (typeof d.yaw === 'number') p.yaw = d.yaw;
    if (typeof d.pitch === 'number') p.pitch = d.pitch;
    if (typeof d.st === 'number') p.st = Math.max(0, Math.min(2, d.st|0));   // 0 stand 1 crouch 2 prone
    // roll progress 0..1, relayed so everyone sees the same somersault
    if (typeof d.rl === 'number') p.rl = Math.max(0, Math.min(1, d.rl));
    // How far they are leaning out of cover; the client has already clamped
    // it against walls, we only guard the range.
    if (typeof d.lo === 'number') p.lo = Math.max(-0.6, Math.min(0.6, d.lo));
  });

  // Authoritative hit detection when a player fires.
  socket.on('fire', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    /* Which gun — and nothing else about it — comes from the client. They
       must actually own it: p.guns is server-side, set by the buy handler. */
    const slot = d && (d.w | 0);
    const gun = GUNS[slot];
    if (!gun || !p.guns.includes(slot)) return;      // not a gun, or not theirs

    /* Rate limit. A trigger pull may send up to gun.pellets packets; the next
       pull cannot start until fireRate has passed. */
    const nowMs = Date.now();
    if (p.volleySlot !== slot || nowMs - (p.volleyAt || 0) >= gun.fireRate * RATE_SLACK) {
      p.volleyAt = nowMs; p.volleySlot = slot; p.volleyShots = 0;
    }
    if (++p.volleyShots > gun.pellets) return;       // firing faster than the gun can

    /* One trigger pull costs one round, however many pellets it throws. */
    settleReload(p, nowMs);
    const clip = ammoOf(p, slot);
    if (p.volleyShots === 1) {
      if (p.reloadAt || clip.mag <= 0) { sendAmmo(p, slot); return; }   // empty, or mid-reload
      clip.mag--;
      sendAmmo(p, slot);
    }

    noiseMade(room, p.id, Date.now());       // a bang: anyone listening picks it up
    const o = { x: d.ox, y: d.oy, z: d.oz };
    const dir = normalize(d.dx, d.dy, d.dz);
    const range = gun.range, dmg = gun.dmg;
    // broadcast a tracer so others see the shot
    /* `w` is the gun and `f` marks the first packet of a trigger pull, so the
       listener plays the right report once — a shotgun sends eight of these
       per shot, one per pellet, and eight overlapping blasts is just noise. */
    socket.to(room.id).emit('shot', { ox:o.x, oy:o.y, oz:o.z, dx:dir.x, dy:dir.y, dz:dir.z, len: range,
                                     w: slot, f: p.volleyShots === 1 ? 1 : 0 });

    // nearest wall blocks the bullet — in 3D, so shots pass over low cover
    let wall = Infinity;
    for (const r of room.rayBoxes) {
      const h = rayBoxHit(o, dir, r);
      if (h && h.t < wall) wall = h.t;
    }

    let best = { t: Math.min(wall, range), target: null, head: false, zone: null, mult: 1 };
    // baseY lets us model targets standing on crates (players send their feet height)
    const consider = (cx, cz, baseY, st, hitApply) => {
      const z = hitZone(o, dir, cx, cz, baseY, st);
      if (z && z.t < best.t)
        best = { t: z.t, target: hitApply, head: z.zone === 'head', zone: z.zone, mult: z.mult };
    };
    const when = Date.now() - rewindFor(p);
    for (const other of players.values()) {
      if (!other.alive || other.id === p.id) continue;
      const h = stateAt(other, when);          // where the shooter SAW them
      consider(h.x, h.z, h.y, h.st, { kind:'player', ref:other });
    }

    /* Silvars' robots stop a round too: someone else's sensor, drone or dog
       in the line of fire takes it if it is nearer than any player. */
    const rHit = robotOnRay(room, p.id, o, dir, best.t);
    if (rHit) { shootRobot(room, rHit.r, dmg, p, o.x + dir.x*rHit.t, o.y + dir.y*rHit.t, o.z + dir.z*rHit.t); return; }
    if (best.target) {
      const dealt = dmg * best.mult;
      const tgt = best.target.ref;
      tgt.hp -= dealt; hitBy(tgt, p.id);
      /* `by` says whose hit this was. The event goes to the whole room, and
         the client used to flash a hit marker on EVERY one of them — so you
         got a marker for other people's fights, and for being shot yourself.
         `hurt` goes to the victim alone and carries where it came from, which
         is what turns "the screen went red" into "from over there". */
      io.to(room.id).emit('impact', { x: o.x + dir.x*best.t, y: o.y + dir.y*best.t, z: o.z + dir.z*best.t,
                          head: best.head, zone: best.zone, by: p.id });
      if (best.target.kind === 'player') io.to(tgt.id).emit('hurt', { x: p.x, z: p.z });
      if (tgt.hp <= 0 && tgt.alive) {
        eliminate(room, tgt, best.target.kind === 'player');
        p.kills++;
        if (best.target.kind === 'player') tgt.deaths++;   // eliminated for this round
        io.to(room.id).emit('kill', { by: p.name, byId: p.id, victim: best.target.kind === 'bot' ? 'a bot' : tgt.name, head: best.head });
      }
    }
  });

  // ---- Smoke bolt: same flight as an arrow, leaves a tagging cloud ----
  socket.on('smokebolt', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive || p.agent !== 'aseed') return;
    noiseMade(room, p.id, Date.now());       // a bang: anyone listening picks it up
    const now = Date.now();
    p.smokeShots = (p.smokeShots || []).filter(t => now - t < SMOKE.cooldownMs);
    if (p.smokeShots.length >= SMOKE.charges) return;
    p.smokeShots.push(now);
    const dir = normalize(d.dx, d.dy, d.dz);
    room.arrows.push({ id: (arrowSeq = (arrowSeq + 1) & 0xffff), by: socket.id, smoke: true,
      x: d.ox, y: d.oy, z: d.oz,
      vx: dir.x*SMOKE.speed, vy: dir.y*SMOKE.speed, vz: dir.z*SMOKE.speed,
      bounces: d.ric ? 1 : 0, life: 5 });     // smoke banks off a wall too
  });

  /* ---- Buy a gun. One main and one side, never mid-round, money checked
     here so a patched client cannot hand itself a sniper. ---- */
  socket.on('buy', (d) => {
    const p = players.get(socket.id); if (!p) return;
    if (match.phase === 'live') return;              // shop shuts during a round
    const slot = d && d.slot | 0;
    if (!(slot >= 0 && slot < PRICES.length)) return;
    if (p.guns.includes(slot)) return;               // already carrying that one
    // Nobody is here yet, so the range is a sandbox: try anything, free.
    const sandbox = (match.phase === 'waiting');
    const price = sandbox ? 0 : PRICES[slot];
    if (p.money < price) return;
    const isMain = MAIN_SLOTS.includes(slot);
    const held = p.guns.filter(g => MAIN_SLOTS.includes(g) === isMain);
    const cap = isMain ? MAX_MAIN : MAX_SIDE;
    while (held.length >= cap) {                     // drop the oldest of its kind
      const drop = held.shift();
      p.guns.splice(p.guns.indexOf(drop), 1);
    }
    p.money -= price;
    p.guns.push(slot);                               // newest goes on the end
    fillAmmo(p, slot);                               // you paid for it, it comes loaded
    const bag = ammoOf(p, slot);
    socket.emit('bought', { slot, money: p.money, guns: p.guns.slice(),
                            mag: bag.mag, reserve: bag.reserve });
  });

  // ---- Blade: the charged cut starts here; 'melee' with heavy ends it ----
  socket.on('meleeCharge', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
    p.chargeAt = (d && d.off) ? 0 : Date.now();
  });
  // ---- Blade: five-hit melee combo, validated server-side ----
  socket.on('melee', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    const now = Date.now();
    if (now - (p.lastMelee || 0) < MELEE.rateMs) return;      // rate limit
    p.lastMelee = now;
    if (now > (p.comboUntil || 0)) p.comboStep = 0;           // chain timed out
    /* a charged cut: how hard is how long the SERVER saw it held */
    let heavyDmg = 0, reach = MELEE.reach;
    if (d && d.heavy){
      const H = MELEE.heavy, held = now - (p.chargeAt || 0);
      p.chargeAt = 0;
      if (held + H.slack < H.minMs || held > H.maxHoldMs) return;          // no charge it could be
      const k = Math.min(1, Math.max(0, (held - H.minMs) / (H.fullMs - H.minMs)));
      const v = Math.min(H.speedTo, Math.hypot(p.vx || 0, p.vz || 0));
      const sMul = 1 + H.speedGain * Math.max(0, (v - H.speedFrom) / (H.speedTo - H.speedFrom));
      heavyDmg = Math.round((H.min + (H.max - H.min) * k) * sMul); reach += H.reachAdd * k;
      p.comboStep = 0;
    }
    const dir = normalize(d.dx, d.dy, d.dz);
    const ox = d.ox, oy = d.oy, oz = d.oz;
    // nearest target inside the reach cone
    let best = null, bestD = Infinity;
    const tryT = (cx, cy, cz, ref) => {
      const vx = cx-ox, vy = cy-oy, vz = cz-oz;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > reach) return;
      if ((vx*dir.x + vy*dir.y + vz*dir.z)/(dist||1) < MELEE.arc) return;
      /* The blade used to check distance and angle only, so with 3.4m of
         reach you could stab someone standing on the far side of a wall.
         Gunfire has always tested geometry; melee now does the same, in 3D
         so it still works across low cover you are standing on. The t > 0.1
         guard keeps a swing from being blocked by the crate you are pressed
         against, whose box can contain the swing's own origin. */
      const to = { x: vx/dist, y: vy/dist, z: vz/dist };
      const from = { x: ox, y: oy, z: oz };
      for (const r of room.rayBoxes) {
        const h = rayBoxHit(from, to, r);
        if (h && h.t > 0.1 && h.t < dist) return;        // wall in the way
      }
      if (dist < bestD) { bestD = dist; best = ref; }
    };
    const mWhen = now - rewindFor(p);
    for (const pl of players.values()) {
      if (!pl.alive || pl.id === p.id) continue;
      const h = stateAt(pl, mWhen);
      tryT(h.x, h.y + 1.1, h.z, { kind:'player', ref:pl });
    }
    for (const r of room.robots) if (!spares(r, p.id) && r.alive)
      tryT(r.x, ROBOTS.robotCenterY(r), r.z, { kind:'robot', ref:r });
    if (best && best.kind === 'robot') {
      shootRobot(room, best.ref, heavyDmg || MELEE.combo[Math.min(p.comboStep || 0, MELEE.combo.length-1)], p, best.ref.x, ROBOTS.robotCenterY(best.ref), best.ref.z);
      p.comboStep = heavyDmg ? 0 : ((p.comboStep || 0) + 1) % MELEE.combo.length;
      p.comboUntil = heavyDmg ? 0 : now + MELEE.windowMs;
      return;
    }

    /* every swing moves the chain on, hit or miss: the five cuts are yours
       to throw anywhere (a charged cut starts it again) */
    if (!best) {
      p.comboStep = heavyDmg ? 0 : ((p.comboStep || 0) + 1) % MELEE.combo.length;
      p.comboUntil = heavyDmg ? 0 : now + MELEE.windowMs;
      return;
    }
    const step = Math.min(p.comboStep || 0, MELEE.combo.length-1);
    const t = best.ref, isPlayer = best.kind === 'player';
    t.hp -= heavyDmg || MELEE.combo[step]; hitBy(t, p.id);
    io.to(room.id).emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false, by: p.id });
    if (isPlayer) io.to(t.id).emit('hurt', { x: p.x, z: p.z });
    p.comboStep = heavyDmg ? 0 : (step + 1) % MELEE.combo.length;
    p.comboUntil = heavyDmg ? 0 : now + MELEE.windowMs;
    if (t.hp <= 0 && t.alive) {
      eliminate(room, t, isPlayer); p.kills++;
      if (isPlayer) t.deaths++;
      io.to(room.id).emit('kill', { by: p.name, byId: p.id, victim: isPlayer ? t.name : 'a bot', head: heavyDmg ? heavyDmg >= MELEE.heavy.max : step === MELEE.combo.length-1 });
    }
  });

  // ---- Crossbow ability: launch a flaming arrow (server-simulated) ----
  /* Blast's G. Charges are the server's, like the crossbow's. The throw's
     speed is capped so a patched client cannot fling one across the map. */
  socket.on('grenade', (d) => {
    if (match.phase !== 'live') return;
    const p = players.get(socket.id); if (!p || !p.alive || p.agent !== 'blast') return;
    const now = Date.now();
    p.gshots = p.gshots.filter(t => now - t < GRENADE.cooldownMs);
    if (p.gshots.length >= GRENADE.charges) return;
    p.gshots.push(now);
    let vx = +d.vx || 0, vy = +d.vy || 0, vz = +d.vz || 0;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > GRENADE.maxSpeed) { const k = GRENADE.maxSpeed / sp; vx *= k; vy *= k; vz *= k; }
    // it leaves from where they ARE, within reach of their hand
    let ox = +d.ox, oy = +d.oy, oz = +d.oz;
    if (!(Math.hypot(ox - p.x, oz - p.z) < 1.5)) { ox = p.x; oz = p.z; }
    if (!(oy > (p.y || 0) - 0.2 && oy < (p.y || 0) + 2.2)) oy = (p.y || 0) + 1.5;
    room.grenades.push({ id: (arrowSeq = (arrowSeq + 1) & 0xffff), by: socket.id, grenade: true,
      x: ox, y: oy, z: oz, vx, vy, vz, fuseAt: now + GRENADE.fuseMs });
  });

  /* ---- Salvo: G incendiary (or frag), V barrage, X missile ----
     The same server-side charges and cooldowns as everyone else's, and the
     same caps on where things may start from. */
  socket.on('incen', (d) => {
    if (match.phase !== 'live') return;
    const p = players.get(socket.id); if (!p || !p.alive || p.agent !== 'salvo') return;
    const now = Date.now(), I = SALVO.incen;
    p.ishots = p.ishots.filter(t => now - t < I.cdMs);
    if (p.ishots.length >= I.charges) { sendSalvoTimers(p, now); return; }
    p.ishots.push(now);
    let vx = +d.vx || 0, vy = +d.vy || 0, vz = +d.vz || 0;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > GRENADE.maxSpeed) { const k = GRENADE.maxSpeed / sp; vx *= k; vy *= k; vz *= k; }
    let ox = +d.ox, oy = +d.oy, oz = +d.oz;
    if (!(Math.hypot(ox - p.x, oz - p.z) < 1.5)) { ox = p.x; oz = p.z; }
    if (!(oy > (p.y || 0) - 0.2 && oy < (p.y || 0) + 2.2)) oy = (p.y || 0) + 1.5;
    const frag = !!d.frag;
    room.grenades.push({ id: (arrowSeq = (arrowSeq + 1) & 0xffff), by: socket.id, grenade: true, incen: !frag,
      cfg: frag ? SALVO.frag : null, x: ox, y: oy, z: oz, vx, vy, vz, fuseAt: now + (frag ? I.fragFuseMs : I.maxFuseMs) });
    sendSalvoTimers(p, now);
  });
  /* V: aimed and pressed on the client; here it is checked (range, cooldown)
     and the shells are laid out, each on its own moment. Everyone is told,
     so the circle and the whistle reach the people under it. */
  socket.on('barrage', (d) => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now(), B = SALVO.barrage;
    const x = +d.x, y = Math.max(0, Math.min(30, +d.y || 0)), z = +d.z;
    if (p.agent !== 'salvo' || !p.alive || match.phase !== 'live' || now < p.barrageReadyAt
        || !isFinite(x) || !isFinite(z) || Math.hypot(x - p.x, z - p.z) > B.range + 2) { sendSalvoTimers(p, now); return; }
    p.barrageReadyAt = now + B.cdMs;
    const shells = [];                                   // [dx, dz, ms from now], so every client sees each round fall
    for (let k = 0; k < B.shells; k++) {
      const a = Math.random() * Math.PI * 2, r = B.radius * Math.sqrt(Math.random()), dt = B.warnMs + (k / (B.shells - 1)) * B.spanMs;
      room.blasts.push({ at: now + dt, x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r,
                         by: socket.id, cfg: B.blast, name: 'a barrage' });
      shells.push([+(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2), Math.round(dt)]);
    }
    io.to(room.id).emit('barrage', { x, y, z, by: socket.id, ms: B.warnMs, span: B.spanMs, r: B.radius, shells });
    sendSalvoTimers(p, now);
  });
  /* X: the missile is a robot (robots.js) so shots can bring it down. The
     owner flies it and reports where it is ('mpos', checked against its top
     speed) and where it hit ('mboom'). */
  socket.on('missile', (d) => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now(), M = SALVO.missile;
    if (p.agent !== 'salvo' || !p.alive || match.phase !== 'live' || now < p.missileReadyAt
        || room.robots.some(r => r.owner === p.id && r.kind === 'missile')) { socket.emit('missile', { no: 1 }); sendSalvoTimers(p, now); return; }
    let ox = +d.ox, oy = +d.oy, oz = +d.oz;
    if (!(Math.hypot(ox - p.x, oz - p.z) < 1.5)) { ox = p.x; oz = p.z; }
    if (!(oy > (p.y || 0) - 0.2 && oy < (p.y || 0) + 2.6)) oy = (p.y || 0) + 1.8;
    const r = ROBOTS.makeRobot('missile', p.id, ox, oy, oz, { yaw: +d.yaw || 0, pitch: +d.pitch || 0, state: 'follow', movedAt: now });
    room.robots.push(r);
    p.missileReadyAt = now + M.lifeMs + M.cdMs;          // re-set to cdMs from when it is gone
    socket.emit('missile', { id: r.id });
  });
  const ownMissile = (id) => room.robots.find(r => r.id === (id | 0) && r.owner === socket.id && r.kind === 'missile' && r.alive);
  socket.on('mpos', (d) => {
    const r = ownMissile(d && d.i); if (!r) return;
    const now = Date.now(), x = +d.x, y = +d.y, z = +d.z;
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    const most = SALVO.missile.speed * SALVO.missile.boost * Math.max(0.05, (now - r.movedAt) / 1000) * 1.6 + 1.5;
    if (Math.hypot(x - r.x, y - r.y, z - r.z) > most) return;   // faster than it can fly: ignored
    r.x = x; r.y = y; r.z = z; r.yaw = +d.w || 0; r.pitch = +d.q || 0; r.movedAt = now;
  });
  socket.on('mboom', (d) => {
    const r = ownMissile(d && d.i); if (!r) return;
    const now = Date.now(); let x = +d.x, y = +d.y, z = +d.z;
    if (!isFinite(x) || Math.hypot(x - r.x, y - r.y, z - r.z) > 6) { x = r.x; y = r.y; z = r.z; }
    r.alive = false; r.why = 'boom'; r.x = x; r.y = y; r.z = z;
    missileBlast(room, x, Math.max(0, y), z, socket.id, now);
  });

  /* ---- TxF: V laser (held), G teleport, X pulse ----
     The laser is resolved every tick in tickRoom from where he looks; these
     only switch it on and off. */
  const txfOK = p => p && p.alive && p.agent === 'txf' && match.phase === 'live';
  socket.on('laser', (d) => {
    const p = players.get(socket.id); if (!p || p.agent !== 'txf') return;
    const now = Date.now();
    p.laserOn = !!(d && d.on) && txfOK(p) && now >= (p.overheatUntil || 0);
    if (p.laserOn) p.laserAcc = 0;
    sendTxfTimers(p, now);
  });
  socket.on('tele', (d) => {
    const p = players.get(socket.id); if (!p || !d) return;
    const now = Date.now(), T = TXF.tele;
    p.teleShots = (p.teleShots || []).filter(t => now - t < T.cdMs);
    const x = +d.x, y = +d.y, z = +d.z;
    const ok = txfOK(p) && p.teleShots.length < T.charges && isFinite(x) && isFinite(y) && isFinite(z)
      && Math.hypot(x - p.x, y - (p.y || 0), z - p.z) <= T.range + 2 && teleClear(room, x, y, z);
    if (!ok) { socket.emit('teleno', {}); sendTxfTimers(p, now); return; }
    p.teleShots.push(now);
    const from = { x: p.x, y: p.y || 0, z: p.z };
    p.x = x; p.y = Math.max(0, Math.min(y, room.roofY - 1.9)); p.z = z;
    p.tp = (p.tp || 0) + 1; p.moveAt = 0; p.vx = 0; p.vz = 0; p.stateAt = 0; p.fallPeak = undefined;
    if (p.hist) p.hist.length = 0;
    if (p.y > groundAt(room, p.x, p.z, p.y) + 0.3) p.fly = true;
    io.to(room.id).emit('telefx', { id: p.id, a: from, b: { x: p.x, y: p.y, z: p.z }, fly: p.fly ? 1 : 0 });
    sendTxfTimers(p, now);
  });
  socket.on('pulse', () => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now(), P = TXF.pulse;
    if (!txfOK(p) || now < (p.pulseReadyAt || 0)) { sendTxfTimers(p, now); return; }
    p.pulseReadyAt = now + P.cdMs;
    const seen = [];
    io.to(room.id).emit('pulsefx', { x: p.x, y: (p.y || 0) + 1.2, z: p.z, r: P.radius, by: p.id });
    for (const t of players.values()) {
      if (!t.alive || t.id === p.id) continue;
      if (Math.hypot(t.x - p.x, (t.y || 0) - (p.y || 0), t.z - p.z) > P.radius) continue;
      seen.push(t.id);
      io.to(t.id).emit('pulsed', { x: p.x, z: p.z, ms: P.showMs });
      txfHurt(room, t, P.dmg, p, { x: p.x, z: p.z });
    }
    socket.emit('pulse', { ids: seen, ms: P.showMs });
    sendTxfTimers(p, now);
  });

  /* Blast's X. Always answers, so the client's timers come from here: the
     zone's duration and when it is next ready, or a refusal saying when. */
  socket.on('zone', () => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now();
    if (p.agent !== 'blast' || !p.alive || match.phase !== 'live' || now < p.zoneReadyAt) {
      socket.emit('zone', { ms: Math.max(0, p.zoneUntil - now), readyIn: Math.max(0, p.zoneReadyAt - now) });
      return;
    }
    p.zoneUntil = now + ZONE.ms;
    p.zoneReadyAt = p.zoneUntil + ZONE.cdMs;
    socket.emit('zone', { ms: ZONE.ms, readyIn: ZONE.ms + ZONE.cdMs });
  });

  /* ---- Silvars: V sensor, G drone, X dog ----
     Every request is answered with the three timers (ms from now), like the
     zone, so the client's tiles come from here rather than from guessing. */
  const silvTimers = (p, now) => {
    const has = k => room.robots.some(r => r.owner === p.id && r.kind === k);
    socket.emit('silv', { sensorQ: sensorQueue(p, now), drone: has('drone') ? -1 : Math.max(0, p.droneReadyAt - now),
                          dog: has('dog') ? -1 : Math.max(0, p.dogReadyAt - now), droneOut: has('drone') ? 1 : 0 });
  };
  const silvOK = p => p && p.alive && p.agent === 'silvars' && match.phase === 'live';
  socket.on('sensor', (d) => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now();
    if (!silvOK(p) || !d) return silvTimers(p, now);
    p.sensorShots = (p.sensorShots || []).filter(t => now - t < SILV.sensor.cdMs);
    if (p.sensorShots.length >= SILV.sensor.charges) return silvTimers(p, now);     // both are recharging
    /* By hand: the point is re-found here from their eye along the direction
       they sent, within reach, on a surface - so a client cannot stick one
       inside a wall or across the map. */
    const ey = (p.y || 0) + 1.6;
    const dir = normalize(+d.dx || 0, +d.dy || 0, +d.dz || 0);
    const h = ROBOTS.robotRay(room.robotG, p.x, ey, p.z, dir.x, dir.y, dir.z, SILV.sensor.reach, 'ray');
    const t = h ? h.t : (dir.y < -0.2 ? -ey / dir.y : Infinity);        // the floor counts as a surface
    if (!(t <= SILV.sensor.reach)) return silvTimers(p, now);
    const n = h ? h : { nx: 0, ny: 1, nz: 0 };
    /* up to two out at once: a third takes the oldest away */
    const mine = room.robots.filter(r => r.owner === p.id && r.kind === 'sensor');
    while (mine.length >= SILV.sensor.maxOut) room.robots.splice(room.robots.indexOf(mine.shift()), 1);
    const k = SILV.sensor.r * 0.5;
    room.robots.push(ROBOTS.makeRobot('sensor', p.id,
      p.x + dir.x * t + n.nx * k, ey + dir.y * t + n.ny * k, p.z + dir.z * t + n.nz * k,
      { nx: n.nx, ny: n.ny, nz: n.nz, readyAt: 0 }));
    p.sensorShots.push(now);
    silvTimers(p, now);
  });
  socket.on('drone', () => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now();
    if (!silvOK(p) || now < p.droneReadyAt || room.robots.some(r => r.owner === p.id && r.kind === 'drone')) return silvTimers(p, now);
    const ey = (p.y || 0) + 1.6;
    room.robots.push(ROBOTS.makeRobot('drone', p.id, p.x, ey + 0.6, p.z, { yaw: p.yaw || 0, state: 'follow' }));
    p.droneReadyAt = Infinity;                                 // the 40s starts when it is GONE (Jack, 2026-11-27)
    silvTimers(p, now);
  });
  /* G or X again, while that robot is out: send it to guard the spot aimed
     at, within SILV.order.range; at your own feet, call it back. */
  socket.on('order', (d) => {
    const p = players.get(socket.id); if (!p || !silvOK(p) || !d) return;
    const kind = d.k === 'dog' ? 'dog' : 'drone';
    const r = room.robots.find(q => q.owner === p.id && q.kind === kind && q.alive); if (!r) return;
    const dir = normalize(+d.dx || 0, +d.dy || 0, +d.dz || 0);
    const pt = ROBOTS.robotOrderPoint(room.robotG, p.x, (p.y || 0) + 1.6, p.z, dir.x, dir.y, dir.z, p.y || 0);
    r.guard = pt; r.path = null; if (r.state === 'run') r.state = 'idle';
    socket.emit('robotfx', { k: 'order', kind, x: pt ? pt.x : p.x, y: pt ? pt.y : (p.y || 0), z: pt ? pt.z : p.z, back: pt ? 0 : 1 });
  });
  socket.on('dog', () => {
    const p = players.get(socket.id); if (!p) return;
    const now = Date.now();
    if (!silvOK(p) || now < p.dogReadyAt || room.robots.some(r => r.owner === p.id && r.kind === 'dog')) return silvTimers(p, now);
    const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0);
    room.robots.push(ROBOTS.makeRobot('dog', p.id, p.x + fx * 0.8, 0, p.z + fz * 0.8,
      { yaw: p.yaw || 0, state: 'run', rdx: fx, rdz: fz, ran: 0 }));
    p.dogReadyAt = Infinity;                                   // until it is destroyed
    silvTimers(p, now);
  });
  socket.on('silvq', () => { const p = players.get(socket.id); if (p) silvTimers(p, Date.now()); });

  socket.on('arrow', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive || p.agent !== 'aseed') return;
    noiseMade(room, p.id, Date.now());       // a bang: anyone listening picks it up
    // enforce the 2-charge / 30s budget here too, so it can't be spammed
    const now = Date.now();
    p.shots = (p.shots || []).filter(t => now - t < XBOW.cooldownMs);
    if (p.shots.length >= XBOW.charges) return;
    p.shots.push(now);
    const dir = normalize(d.dx, d.dy, d.dz);
    room.arrows.push({ id: (arrowSeq = (arrowSeq + 1) & 0xffff), by: socket.id,
      x: d.ox, y: d.oy, z: d.oz,
      vx: dir.x*XBOW.speed, vy: dir.y*XBOW.speed, vz: dir.z*XBOW.speed,
      bounces: d.ric ? 1 : 0, life: 5 });
  });

  /* The client asks; the server decides when it finishes. */
  socket.on('reload', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
    const slot = d && (d.w | 0), g = GUNS[slot];
    if (!g || !p.guns.includes(slot)) return;
    const now = Date.now();
    settleReload(p, now);
    if (p.reloadAt) return;                       // already reloading
    const a = ammoOf(p, slot);
    if (a.mag >= g.magMax || a.reserve <= 0) return;
    /* The zone reloads faster. The client shortens its own HUD copy by the
       same ZONE.reloadMul, but this is the clock that decides when you can
       fire again -- leave it out and the bar finishes early while the gun is
       still refused. */
    const rms = g.reloadMs * (p.zoneUntil > now ? ZONE.reloadMul : 1);
    p.reloadAt = now + rms; p.reloadSlot = slot;
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    /* Hold their score for a minute in case this was a reload or a throttled
       background tab rather than someone actually leaving. Nothing is held
       once the match itself is over or has not started. */
    if (p && p.tok && match.phase !== 'waiting')
      parked.set(p.tok, { wins: p.wins || 0, money: p.money, guns: p.guns,
                          name: p.name, at: Date.now() });
    players.delete(socket.id);
    for (let i = room.robots.length - 1; i >= 0; i--) if (room.robots[i].owner === socket.id) room.robots.splice(i, 1);
    console.log(`[-] ${player.name} left ${room.id} (${players.size} online)`);
  });
});
function normalize(x, y, z) { const l = Math.hypot(x, y, z) || 1; return { x:x/l, y:y/l, z:z/l }; }
/* Where a player's BODY is, which is not always where their feet are: leaning
   slides them up to 0.45m sideways. Every aim test goes through these, so a
   peeking player can be shot at where they actually appear. The right vector
   matches the client's: rgt = (cos yaw, -sin yaw). */
function aimX(p) { return p.x + Math.cos(p.yaw || 0) * (p.lo || 0); }
function aimZ(p) { return p.z - Math.sin(p.yaw || 0) * (p.lo || 0); }

/* ---------------------------- Lag compensation ----------------------------
   Shots were tested against where each player had LAST REPORTED being, but
   the shooter was aiming at where their own screen drew them, and those are
   not the same place. The client predicts a remote player forward from their
   measured velocity, while the server's copy is already one packet plus one
   network trip old — so against a sprinting target the two disagreed by
   half a metre or more and perfectly-aimed shots passed straight through.

   So each player's recent positions are kept, and a shot is tested against
   where everyone WAS at the moment the shooter saw them. Working that moment
   out: the client draws a target extrapolated to (its last snapshot + age +
   1/REMOTE_EASE), the shot then takes one trip to reach us, so what they saw
   sits REWIND_LEAD ms after a full round trip ago. The client's forward
   prediction is why we give some of the rewind back rather than rewinding by
   the whole round trip.

   Capped at 200ms: beyond that someone on a bad line would be shooting at
   ghosts, and their victims would die behind cover they reached ages ago. */
const LAGCOMP = { historyMs: 500, maxRewindMs: 200, lead: 45 };
function recordHistory(room, now) {
  for (const p of room.players.values()) {
    (p.hist || (p.hist = [])).push({ t: now, x: p.x, y: p.y || 0, z: p.z,
                                     yaw: p.yaw || 0, lo: p.lo || 0, st: p.st || 0 });
    while (p.hist.length > 1 && now - p.hist[0].t > LAGCOMP.historyMs) p.hist.shift();
  }
}
/* How far back this shooter's view of the world is. */
function rewindFor(p) {
  return Math.max(0, Math.min(LAGCOMP.maxRewindMs, (p.rtt || 0) - LAGCOMP.lead));
}
/* Where a player was at time t, interpolated between the two samples either
   side of it. Falls back to the present when we have nothing that old. */
function stateAt(p, t) {
  const h = p.hist;
  if (!h || !h.length) return { x: aimX(p), z: aimZ(p), y: p.y || 0, st: p.st || 0 };
  /* Asking for "now" or later means no rewind is wanted, so use the LIVE
     position rather than the newest sample. History is only written once a
     tick, so that sample can be 50ms stale — at a hard strafe that is over
     half a metre, and it would make a fast connection aim worse than a slow
     one, which is exactly backwards. */
  if (t >= h[h.length-1].t) {
    /* No rewind wanted, so carry the last packet forward to the instant
       asked for, capped so a dropped packet cannot fling a hitbox across the
       room. This is the mirror of the client's own prediction. */
    const ahead = Math.min(Math.max(0, (t - (p.stateAt || t)) / 1000), 0.06);
    let ex = (p.vx || 0) * ahead, ez = (p.vz || 0) * ahead;
    const far = Math.hypot(ex, ez);          // never guess further than half a metre
    if (far > 0.5) { ex *= 0.5/far; ez *= 0.5/far; }
    return { x: aimX(p) + ex, z: aimZ(p) + ez, y: p.y || 0, st: p.st || 0 };
  }
  for (let i = h.length - 1; i > 0; i--) {
    const b = h[i], a = h[i-1];
    if (t >= a.t && t <= b.t) {
      const k = (b.t - a.t) ? (t - a.t) / (b.t - a.t) : 0;
      const x = a.x + (b.x - a.x)*k, z = a.z + (b.z - a.z)*k, y = a.y + (b.y - a.y)*k;
      const yaw = a.yaw, lo = a.lo + (b.lo - a.lo)*k;
      return { x: x + Math.cos(yaw)*lo, z: z - Math.sin(yaw)*lo, y, st: a.st };
    }
  }
  const o = h[0];
  return { x: o.x + Math.cos(o.yaw)*o.lo, z: o.z - Math.sin(o.yaw)*o.lo, y: o.y, st: o.st };
}

/* A live player's body, as a box, for a grenade to bounce off. Boxes rather
   than spheres so the same rayBoxHit that handles cover handles a chest,
   and the same lean-aware aimX/aimZ the shot tests use, so what stops a
   frag is where the player actually is. The THROWER is skipped: their own
   body sits around the spawn point and would swat every throw out of the
   air as it left their hand. */
function bodyBoxes(room, exceptId) {
  const out = [], r = GRENADE.bodyR;
  for (const p of room.players.values()) {
    if (!p.alive || p.id === exceptId) continue;
    const x = aimX(p), z = aimZ(p), feet = p.y || 0;
    out.push({ minx: x-r, maxx: x+r, minz: z-r, maxz: z+r,
               miny: feet, maxy: feet + (BODY_H[p.st | 0] || BODY_H[0]) });
  }
  return out;
}

/* A grenade going off. Damage to every live player but the thrower inside
   the radius, unless geometry stands between the blast and their chest. The
   blast is a noise, so Aseeds within earshot hear who threw it. */
function explodeGrenade(room, g, now) {
  blastAt(room, g.x, g.y, g.z, g.by, g.cfg || GRENADE, now, 'a grenade');
}
/* Any explosion: Blast's frag, Salvo's frag, his shells and his missile.
   `cfg` is { radius, full, dmg }. Every live player but the thrower inside
   the radius is hurt unless geometry stands between the blast and their
   chest; robots too (Silvars' drone, dog and sensors; Salvo's missile). The
   blast is a noise, so Aseeds within earshot hear who set it off. Salvo
   takes blastMul of it. */
function blastAt(room, x, y, z, byId, cfg, now, name) {
  const players = room.players, match = room.match;
  io.to(room.id).emit('boom', { x, y, z });
  noiseMade(room, byId, now);
  if (match.phase !== 'live') return;
  const thrower = players.get(byId);
  const o = { x, y: y + 0.25, z };
  const fall = d => d <= cfg.full ? cfg.dmg : Math.round(cfg.dmg * (1 - (d - cfg.full) / (cfg.radius - cfg.full)));
  for (const r of room.robots.slice()) {
    if (spares(r, byId) || !r.alive) continue;
    const ry = ROBOTS.robotCenterY(r), d = Math.hypot(r.x - o.x, ry - o.y, r.z - o.z);
    if (d >= cfg.radius || !ROBOTS.robotLos(room.robotG, o.x, o.y, o.z, r.x, ry, r.z)) continue;
    const dmg = fall(d);
    if (dmg > 0) shootRobot(room, r, dmg, thrower, r.x, ry, r.z);
  }
  for (const t of players.values()) {
    if (!t.alive || t.id === byId) continue;
    const cx = aimX(t), cy = (t.y || 0) + 1.0, cz = aimZ(t);
    const dx = cx - o.x, dy = cy - o.y, dz = cz - o.z, d = Math.hypot(dx, dy, dz);
    if (d >= cfg.radius) continue;
    const dir = { x: dx/d, y: dy/d, z: dz/d };
    let blocked = false;
    for (const r of room.rayBoxes) { const h = rayBoxHit(o, dir, r); if (h && h.t > 0.05 && h.t < d) { blocked = true; break; } }
    if (blocked) continue;                              // cover took it
    const full = fall(d), dmg = Math.round(full * blastMul(t));
    if (dmg <= 0) continue;
    t.hp -= dmg; hitBy(t, byId);
    io.to(t.id).emit('hurt', { x, z });
    io.to(room.id).emit('impact', { x: cx, y: cy, z: cz, head: full >= cfg.dmg, by: byId,
                                    zone: full >= cfg.dmg ? 'head' : 'torso' });
    if (t.hp <= 0 && t.alive) {
      eliminate(room, t, true);
      if (thrower) thrower.kills++;
      t.deaths++;
      io.to(room.id).emit('kill', { by: thrower ? thrower.name : name, byId, victim: t.name, head: false });
    }
  }
}
/* Salvo's missile going off: the warhead, then its bomblets a moment later,
   spread around it. */
function missileBlast(room, x, y, z, byId, now) {
  const M = SALVO.missile;
  blastAt(room, x, y, z, byId, M.blast, now, 'a missile');
  for (let k = 0; k < M.bomblets; k++) {
    const a = (k / M.bomblets) * Math.PI * 2 + Math.random() * 0.6, r = M.spread * (0.6 + Math.random() * 0.4);
    room.blasts.push({ at: now + M.bombletMs + k * 60, x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, by: byId, cfg: M.bomb, name: 'a missile' });
  }
}

/* Arrow impact: big direct hit, then it burns for 9s. */
function igniteTarget(room, hit, byId, now) {
  const players = room.players;
  const t = hit.ref, isPlayer = hit.kind === 'player';
  const head = !!hit.head;
  t.hp -= head ? XBOW.headDmg : XBOW.bodyDmg; hitBy(t, byId);
  t.burnUntil = now + XBOW.burnMs; t.burnNext = now + 1000; t.burnBy = byId;
  t.burnRate = XBOW.burnDps;
  const shooter = players.get(byId);
  io.to(room.id).emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head, fire:true, by: byId });
  if (shooter && isPlayer) io.to(t.id).emit('hurt', { x: shooter.x, z: shooter.z });
  dropFire(room, t.x, t.y || 0, t.z, byId, now);   // pool at their feet
  if (t.hp <= 0 && t.alive) {
    eliminate(room, t, isPlayer);
    if (shooter) shooter.kills++;
    if (isPlayer) t.deaths++;
    io.to(room.id).emit('kill', { by: shooter ? shooter.name : 'fire', byId: byId, victim: isPlayer ? t.name : 'a bot', head });
  }
}

/* ======================= Silvars' robots, in a room ======================
   The rules are in public/robots.js; this is the room they live in. */
/* Your own drone and dog ignore your fire; your own SENSORS do not, so you
   can take one down yourself (Jack, 2026-11-27). */
const spares = (r, id) => r.owner === id && r.kind !== 'sensor';
/* The nearest robot a shot can hit along a ray, before `maxT`. */
function robotOnRay(room, shooterId, o, dir, maxT) {
  let best = null;
  for (const r of room.robots) {
    if (!r.alive || spares(r, shooterId)) continue;
    const t = ROBOTS.robotHitT(r, o.x, o.y, o.z, dir.x, dir.y, dir.z);
    if (t < maxT && (!best || t < best.t)) best = { r, t };
  }
  return best;
}
/* Damage to a robot from a player. A destroyed one is taken off on the next
   robot tick, which is where its cooldown and its wreck are handled. */
function shootRobot(room, r, dmg, by, x, y, z) {
  io.to(room.id).emit('impact', { x, y, z, head: false, zone: 'torso', by: by ? by.id : null, robot: 1 });
  ROBOTS.damageRobot(r, dmg);
}
/* Salvo's timers, for his HUD: ms until the barrage and the missile are back. */
function sendSalvoTimers(p, now) {
  const sock = io.sockets.sockets.get(p.id); if (!sock) return;
  sock.emit('salvo', { incQ: (p.ishots || []).map(t => t + SALVO.incen.cdMs - now).filter(ms => ms > 0),
                       barrage: Math.max(0, p.barrageReadyAt - now), missile: Math.max(0, p.missileReadyAt - now) });
}
/* TxF's timers, for his HUD: heat (0..1), ms of overheat left, the
   teleport's spent charges, and ms until the pulse is back. */
function sendTxfTimers(p, now) {
  const sock = io.sockets.sockets.get(p.id); if (!sock) return;
  sock.emit('txf', { heat: +(p.heat || 0).toFixed(3), hot: Math.max(0, (p.overheatUntil || 0) - now), on: p.laserOn ? 1 : 0,
                     teleQ: (p.teleShots || []).map(t => t + TXF.tele.cdMs - now).filter(ms => ms > 0),
                     pulse: Math.max(0, (p.pulseReadyAt || 0) - now) });
}
/* Damage from TxF to a player: the same bookkeeping as a gunshot. */
function txfHurt(room, t, dmg, by, from) {
  if (!t.alive || room.match.phase !== 'live' || dmg <= 0) return;
  t.hp -= dmg; hitBy(t, by.id);
  io.to(t.id).emit('hurt', { x: from.x, z: from.z });
  if (t.hp <= 0 && t.alive) {
    eliminate(room, t, true);
    by.kills++; t.deaths++;
    io.to(room.id).emit('kill', { by: by.name, byId: by.id, victim: t.name, head: false });
  }
}
/* Is there room for a body standing at (x, y, z)? Inside the map, under the
   lid, and no box between the feet and the head within the body's radius. */
function teleClear(room, x, y, z) {
  const b = room.arena - 1.2;
  if (Math.abs(x) > b || Math.abs(z) > b || y < -0.05 || y > room.roofY - 1.9) return false;
  const r = MOVE.radius - 0.05, top = y + BODY_H[0];
  for (const c of room.rects) {
    if (c.miny >= top || c.maxy <= y + 0.05) continue;
    const cx = Math.max(c.minx, Math.min(x, c.maxx)), cz = Math.max(c.minz, Math.min(z, c.maxz));
    if (Math.hypot(x - cx, z - cz) < r) return false;
  }
  return true;
}
/* One tick of TxF's laser: heat, then the beam from his eye down where he
   looks, stopped by the first wall, robot or body. Everyone is sent the
   beams so they can see them. */
function tickLasers(room, now, dt) {
  const beams = [];
  for (const p of room.players.values()) {
    if (p.agent !== 'txf') continue;
    const L = TXF.laser, firing = p.laserOn && p.alive && room.match.phase === 'live';
    if (firing) {
      p.heat = Math.min(1, (p.heat || 0) + dt * 1000 / L.heatMs);
      if (p.heat >= 1) { p.laserOn = false; p.overheatUntil = now + L.coolMs; sendTxfTimers(p, now); }
    } else if (now >= (p.overheatUntil || 0)) {
      p.heat = Math.max(0, (p.heat || 0) - dt * 1000 / L.coolMs);
    } else p.heat = (p.overheatUntil - now) / L.coolMs;        // cooling off an overheat
    if (!firing) continue;
    const eye = (p.y || 0) + [1.7, 1.05, 0.6][p.st | 0];
    const cp = Math.cos(p.pitch || 0);
    const o = { x: p.x, y: eye, z: p.z };
    const dir = { x: -Math.sin(p.yaw || 0) * cp, y: Math.sin(p.pitch || 0), z: -Math.cos(p.yaw || 0) * cp };
    let far = L.range;
    for (const r of room.rayBoxes) { const h = rayBoxHit(o, dir, r); if (h && h.t > 0.05 && h.t < far) far = h.t; }
    if (dir.y < -1e-4) far = Math.min(far, -o.y / dir.y);
    let best = null;
    for (const t of room.players.values()) {
      if (!t.alive || t.id === p.id) continue;
      const z = hitZone(o, dir, aimX(t), aimZ(t), t.y || 0, t.st || 0);
      if (z && z.t < far && (!best || z.t < best.t)) best = { t: z.t, ref: t };
    }
    const dmg = L.dps * dt;
    const rHit = robotOnRay(room, p.id, o, dir, best ? best.t : far);
    if (rHit) { far = rHit.t; shootRobot(room, rHit.r, Math.ceil(dmg), p, o.x + dir.x*far, o.y + dir.y*far, o.z + dir.z*far); }
    else if (best) {
      far = best.t;
      p.laserAcc = (p.laserAcc || 0) + dmg;                 // whole points, carried tick to tick
      const whole = Math.floor(p.laserAcc); p.laserAcc -= whole;
      if (whole > 0) {
        io.to(room.id).emit('impact', { x: o.x + dir.x*far, y: o.y + dir.y*far, z: o.z + dir.z*far, head: false, zone: 'torso', by: p.id, laser: 1 });
        txfHurt(room, best.ref, whole, p, { x: p.x, z: p.z });
      }
    }
    beams.push({ id: p.id, ox: +o.x.toFixed(2), oy: +o.y.toFixed(2), oz: +o.z.toFixed(2),
                 ex: +(o.x + dir.x*far).toFixed(2), ey: +(o.y + dir.y*far).toFixed(2), ez: +(o.z + dir.z*far).toFixed(2) });
  }
  if (beams.length || room.hadBeams) io.to(room.id).emit('lasers', beams);
  room.hadBeams = beams.length > 0;
}
/* The sensor's spent charges, as ms until each comes back. */
function sensorQueue(p, now) {
  return (p.sensorShots || []).map(t => t + SILV.sensor.cdMs - now).filter(ms => ms > 0);
}
function sendSilvTimers(room, owner, now, except) {
  const sock = io.sockets.sockets.get(owner.id); if (!sock) return;
  const has = k => room.robots.some(q => q !== except && q.alive && q.owner === owner.id && q.kind === k);
  sock.emit('silv', { sensorQ: sensorQueue(owner, now), drone: has('drone') ? -1 : Math.max(0, owner.droneReadyAt - now),
                      dog: has('dog') ? -1 : Math.max(0, owner.dogReadyAt - now), droneOut: has('drone') ? 1 : 0 });
}
/* What robots.js needs from a room. Everything a robot does is credited to
   its owner: the damage, the hit marker, the kill. Kills by a robot clear
   no cooldowns (Jack: "there is no kill cooldown"). */
function robotWorld(room, now) {
  const players = room.players;
  return {
    G: room.robotG, now,
    owner: id => players.get(id) || null,
    enemies: id => [...players.values()].filter(q => q.id !== id),
    /* what the team knows (for the robots' hunting), and what Silvars is
       SHOWN: the second opens a 2s window only when it is off cooldown */
    known: id => { const p = players.get(id); return p ? p.teamSeen : new Map(); },
    reveal: (id, tid) => {
      const p = players.get(id); if (!p) return;
      p.teamSeen.set(tid, now + SILV.linkMs);
      if (now >= p.linkUntil) {
        if (now < p.linkReadyAt) return;                      // spent: 20s before it lights anyone again
        p.linkUntil = now + SILV.linkMs; p.linkReadyAt = p.linkUntil + SILV.linkCdMs;
      }
      p.linked.set(tid, p.linkUntil);
    },
    hurt: (r, t, dmg, how) => {
      if (!t.alive || room.match.phase !== 'live') return;
      const owner = players.get(r.owner);
      if (how === 'drone') dmg = Math.round(dmg * blastMul(t));   // the dive is a blast: Salvo shrugs most of it off
      t.hp -= dmg; hitBy(t, r.owner);
      io.to(t.id).emit('hurt', { x: r.x, z: r.z });
      io.to(room.id).emit('impact', { x: t.x, y: ROBOTS.robotChestY(t), z: t.z, head: false, zone: 'torso', by: r.owner });
      if (t.hp <= 0 && t.alive) {
        eliminate(room, t, true);
        if (owner) owner.kills++;
        t.deaths++;
        io.to(room.id).emit('kill', { by: owner ? owner.name : 'a robot', byId: r.owner, victim: t.name,
                                      head: false, via: how });
      }
    },
    fx: (k, d) => io.to(room.id).emit('robotfx', Object.assign({ k }, d)),
    gone: (r, why) => {
      const owner = players.get(r.owner);
      if (r.kind === 'missile') {
        if (owner) { owner.missileReadyAt = now + SALVO.missile.cdMs; sendSalvoTimers(owner, now); }
        // out of fuel, or its pilot died: it comes down where it is
        if (why === 'expired' || why === 'owner') missileBlast(room, r.x, r.y, r.z, r.owner, now);
        else if (why === 'destroyed') io.to(room.id).emit('robotfx', { k: 'die', id: r.id, kind: r.kind, x: r.x, y: r.y, z: r.z });
        return;                                          // 'boom': it already went off where it hit
      }
      if (r.kind === 'dog' && owner) owner.dogReadyAt = now + SILV.dog.cdMs;   // 70s from when it is gone
      if (r.kind === 'drone' && owner) owner.droneReadyAt = now + SILV.drone.cdMs;   // and the drone's 40s
      if (why === 'expired') io.to(room.id).emit('robotfx', { k: 'expire', id: r.id, kind: r.kind, x: r.x, y: r.y, z: r.z });
      else if (why !== 'crash') io.to(room.id).emit('robotfx', { k: 'die', id: r.id, kind: r.kind, x: r.x, y: r.y, z: r.z });
      if (owner) sendSilvTimers(room, owner, now, r);
    },
  };
}
/* One tick of every robot, then Linked Sight from Silvars' own eyes, then
   what goes on the wire: the robots to the room, and to each Silvars his
   own list of who the team can see, with their health. */
function tickRobots(room, now, dt) {
  const players = room.players;
  if (room.match.phase !== 'live' && room.robots.length) room.robots.length = 0;
  if (room.robots.length) ROBOTS.stepRobots(robotWorld(room, now), room.robots, dt);
  for (const p of players.values()) {
    if (p.agent !== 'silvars') continue;
    if (p.alive && room.match.phase === 'live') {
      const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0), ey = (p.y || 0) + 1.6;
      for (const e of players.values()) {
        if (e === p || !e.alive) continue;
        const dx = e.x - p.x, dz = e.z - p.z, h = Math.hypot(dx, dz);
        if (h > SILV.sight || (h > 1.5 && (dx * fx + dz * fz) / h < SILV.ownCos)) continue;
        // his own eyes tell his robots, but never light anyone up for him
        if (ROBOTS.robotLos(room.robotG, p.x, ey, p.z, e.x, ROBOTS.robotChestY(e), e.z)) p.teamSeen.set(e.id, now + SILV.linkMs);
      }
    }
    const list = [];
    for (const [id, until] of p.linked) {
      const e = players.get(id);
      if (until <= now || !e || !e.alive || !p.alive) { p.linked.delete(id); continue; }
      list.push({ id, hp: Math.max(0, Math.round(e.hp)), ms: until - now });
    }
    /* the list, plus when it is ready again; every tick while someone is lit,
       otherwise four times a second so the HUD's countdown stays right */
    if (list.length || p.linkedSent || now - (p.linkSentAt || 0) > 250) {
      io.to(p.id).emit('linked', { l: list, r: Math.max(0, p.linkReadyAt - now), u: Math.max(0, p.linkUntil - now) });
      p.linkSentAt = now;
    }
    p.linkedSent = list.length > 0;
  }
  if (room.robots.length || room.robotsSent) io.to(room.id).emit('robots', room.robots.map(r => ROBOTS.robotWire(r, now)));
  room.robotsSent = room.robots.length > 0;
}

/* ------------------------------- Game loop -------------------------------- */
/* 20Hz, not 30. The tick drives hit detection, burn damage and arrow flight,
   all of which resolve the same at either rate — arrows step 3.1m instead of
   2.0m, and the ray test is continuous along the step, so nothing tunnels.
   What it buys is a third off every client's bandwidth. The client predicts
   remote players from their measured velocity, so the longer gap between
   updates barely shows; see REMOTE_EASE / REMOTE_PREDICT. */
const TICK = 1000 / 20;
let lastPing = 0;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  for (const room of rooms.values()) tickRoom(room, now, dt);
  if (now - lastPing > 1000) { lastPing = now; io.emit('ping2', now); }
  /* Retire a room once it is empty AND holds no parked scores — a player
     mid-reload still has 60s to come back to theirs. */
  for (const [id, r] of rooms)
    if (!r.players.size && !r.parked.size && now > (r.holdUntil || 0)) rooms.delete(id);
}, TICK);

/* One room's world for one tick. The locals keep the body below reading the
   way it did when there was only ever one match. */
function tickRoom(room, now, dt) {
  const { players, match, fires, smokes, arrows, parked } = room;

  /* ---- Match flow: waiting -> live -> intermission -> ... -> over ---- */
  const livePlayers = [...players.values()];
  const standing = livePlayers.filter(p => p.alive);
  sweepParked(room, now);
  if (match.phase === 'waiting') {
    if (livePlayers.length >= MATCH.minPlayers) {
      // straight into a buy window, not into a round — you start with money
      // and no gun, so you need a chance to spend it before round 1
      resetEconomy(room);
      match.round = 0; match.roundWinner = null; match.matchWinner = null;
      openBuyWindow(room, now, MATCH.prepMs);
    }
  } else if (match.phase === 'paused') {
    /* Held open for a minute after a drop. Whoever is still here keeps their
       rounds and their money; coming back resumes the SAME match at a buy
       window rather than starting a new one. */
    if (livePlayers.length >= MATCH.minPlayers) openBuyWindow(room, now, MATCH.prepMs);
    else if (now >= match.until) {                 // nobody came back: let it go
      parked.clear();
      match.phase = 'waiting'; match.round = 0;
      match.roundWinner = null; match.matchWinner = null;
      respawnAll(room);
    }
  } else if (livePlayers.length < MATCH.minPlayers) {
    /* Don't tear a match down over a dropped connection. A reload, or Chrome
       throttling a background tab until its heartbeat times out, used to be
       enough to wipe every player's round wins. */
    if (match.phase === 'over') {                  // already finished: nothing to save
      match.phase = 'waiting'; match.round = 0;
      match.roundWinner = null; match.matchWinner = null;
      respawnAll(room);
    } else {
      match.phase = 'paused'; match.until = now + MATCH.rejoinMs;
      match.roundWinner = null; match.matchWinner = null;
      respawnAll(room);                            // free roam while we wait
    }
  } else if (match.phase === 'live') {
    if (standing.length <= 1) {
      /* Normally the one left standing. If NOBODY is standing it is a mutual
         kill — you shot them while on fire and the burn finished you in the
         same tick — and the round goes to whoever went down last rather than
         being thrown away as a draw. They did outlive the other. */
      let w = standing[0] || null;
      if (!w && livePlayers.length) {
        w = livePlayers.reduce((a, b) => (b.diedAt || 0) > (a.diedAt || 0) ? b : a);
        if (!w.diedAt) w = null;                   // nobody actually died: a real draw
      }
      if (w) w.wins = (w.wins || 0) + 1;
      // payday: the round winner banks more, but losing still pays
      for (const p of players.values()) p.money += (p === w ? ECON.win : ECON.loss);
      /* Losing costs you the guns as well as the round: the winner carries
         their loadout into the next round, everyone else buys again out of
         the payout. On a genuine draw nobody lost, so nobody is stripped. */
      if (w) for (const p of players.values()) if (p !== w) { p.guns = []; p.ammo = {}; p.reloadAt = 0; }
      clearField(room); douseAll(room);  // the round is over, so is the fire
      /* A new buy window begins here — this branch sets the phase inline
         rather than going through openBuyWindow, so anything that belongs
         to the start of a round has to be done in BOTH places. */
      for (const q of players.values()) q.potions = 0;
      placePotions(room);
      match.roundWinner = w ? w.id : null;
      if (w && w.wins >= MATCH.winsNeeded) {
        match.phase = 'over'; match.matchWinner = w.id; match.until = now + MATCH.endMs;
      } else {
        match.phase = 'intermission'; match.until = now + MATCH.prepMs;
      }
    }
  } else if (now >= match.until) {
    if (match.phase === 'intermission') startRound(room, match.round + 1, false);
    else {                                         // match over -> run it again
      /* Held scores belong to the match that just finished. Without this a
         player who dropped in its closing seconds rejoined the NEXT match
         carrying their old money, guns and round wins. */
      parked.clear();
      resetEconomy(room);
      match.round = 0; match.roundWinner = null; match.matchWinner = null;
      openBuyWindow(room, now, MATCH.prepMs);
    }
  }

  // ---- Flaming arrows: fly, bounce off geometry, ignite what they hit ----
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.life -= dt;
    if (a.life <= 0) {
      // A bolt that runs out of time mid-air used to vanish leaving nothing -
      // which is where a floor ricochet ended up, since it skips upward and
      // the post-bounce life cap expires before it comes back down. It fizzles
      // onto the ground beneath instead.
      (a.smoke ? dropSmoke : dropFire)(room, a.x, 0, a.z, a.by, now);
      arrows.splice(i, 1); continue;
    }
    a.vy -= 9 * dt;                                     // slight drop
    if (a.falling) {               // stopped against something: just drop
      a.y += a.vy*dt;
      /* It lands on whatever is under it, not on the ground through it: a
         bolt stopped by a wall on an upper floor drops onto that floor. */
      const under = floorUnder(room, a.x, a.z, a.y - a.vy*dt);
      if (a.y <= under) { (a.smoke ? dropSmoke : dropFire)(room, a.x, under, a.z, a.by, now); arrows.splice(i, 1); }
      continue;
    }
    const nx = a.x + a.vx*dt, ny = a.y + a.vy*dt, nz = a.z + a.vz*dt;
    // 3D step, not horizontal: raySphere and rayBoxHit both report true 3D
    // distances, so measuring the step in XZ only made every angled shot
    // compare two different scales.
    const stepLen = Math.hypot(nx-a.x, ny-a.y, nz-a.z) || 1e-6;

    // nearest target along this step (players never cause a bounce)
    const dirx = (nx-a.x)/stepLen, diry = (ny-a.y)/stepLen, dirz = (nz-a.z)/stepLen;
    const o = { x:a.x, y:a.y, z:a.z }, dir = { x:dirx, y:diry, z:dirz };
    let hitT = Infinity, victim = null;
    /* Which sphere the bolt met is now kept rather than collapsed away — the
       two tests were always here, `Math.min` just threw the answer out.
       The head comes from HITBOX, the same one the guns use. It used to be
       r0.34, nearly double the fitted r0.19, reaching 14cm into the chest and
       well above the helmet; harmless while damage was flat, but the moment a
       head is worth 40 more it would pay out for centre-mass hits. */
    const tryHit = (cx, cz, baseY, st, ref) => {
      const box = [[1.05,0.60,1.70],[0.70,0.55,1.10],[0.32,0.50,0.50]][st] || [1.05,0.60,1.70];
      const hd = HITBOX.head[st] || HITBOX.head[0];
      const b1 = raySphere(o, dir, cx, baseY+box[0], cz, box[1]);
      const h1 = raySphere(o, dir, cx, baseY+hd[0], cz, hd[1]);
      const t = Math.min(b1, h1);
      if (t < hitT && t <= stepLen) { hitT = t; ref.head = h1 < Infinity; victim = ref; }
    };
    for (const pl of players.values())
      if (pl.alive && pl.id !== a.by) tryHit(aimX(pl), aimZ(pl), pl.y||0, pl.st||0, { kind:'player', ref:pl });
    /* someone else's robot in the bolt's path takes it, if nothing is nearer */
    let robotT = Infinity, robotV = null;
    for (const r of room.robots) {
      if (spares(r, a.by) || !r.alive) continue;
      const t = ROBOTS.robotHitT(r, o.x, o.y, o.z, dir.x, dir.y, dir.z);
      if (t <= stepLen && t < robotT) { robotT = t; robotV = r; }
    }
    if (robotV && robotT < hitT) {
      let wallBefore = false;
      for (const r of room.rayBoxes) { const h = rayBoxHit(o, dir, r); if (h && h.t < robotT) { wallBefore = true; break; } }
      if (!wallBefore) {
        if (!a.smoke) shootRobot(room, robotV, XBOW.bodyDmg, players.get(a.by), robotV.x, ROBOTS.robotCenterY(robotV), robotV.z);
        (a.smoke ? dropSmoke : dropFire)(room, robotV.x, robotV.kind === 'dog' ? 0 : floorUnder(room, robotV.x, robotV.z, robotV.y), robotV.z, a.by, now);
        arrows.splice(i, 1); continue;
      }
    }

    // nearest wall along this step, height-aware
    let wallT = Infinity, wn = null;
    for (const r of room.rayBoxes) {
      const h = rayBoxHit(o, dir, r);
      if (h && h.t < wallT && h.t <= stepLen) { wallT = h.t; wn = h; }
    }

    // where this bolt's payload lands
    const drop = (px, py, pz) => a.smoke ? dropSmoke(room, px, py, pz, a.by, now)
                                         : dropFire(room, px, py, pz, a.by, now);
    if (victim && hitT <= wallT) {                      // hit someone
      if (a.smoke) drop(victim.ref.x, victim.ref.y || 0, victim.ref.z);   // cover, not damage
      else igniteTarget(room, victim, a.by, now);
      arrows.splice(i, 1); continue;
    }
    if (wn && wallT <= stepLen) {
      if (a.bounces > 0) {                              // RICOCHET: reflect once
        a.bounces--;
        a.x += dirx*wallT*0.98; a.z += dirz*wallT*0.98; a.y += diry*wallT*0.98;
        if (wn.axis === 0) a.vx = -a.vx; else if (wn.axis === 1) a.vy = -a.vy; else a.vz = -a.vz;
        a.vx *= BOUNCE.keep; a.vy *= BOUNCE.keep; a.vz *= BOUNCE.keep;
        a.life = Math.min(a.life, BOUNCE.lifeS);        // and it doesn't fly far after
        continue;
      }
      /* Only a TOP face holds a bolt. Hit a wall, the side of a crate or the
         roof and it stops dead against the surface and falls straight down
         from the point of contact — nothing hangs in mid-air on a wall or
         dangles from the ceiling. It lands, and drops its payload, wherever
         it comes to rest. */
      if (!(wn.axis === 1 && diry < 0)) {
        const back = Math.max(0, wallT - 0.08);   // just shy of the surface
        a.x += dirx*back; a.y += diry*back; a.z += dirz*back;
        a.vx = 0; a.vy = 0; a.vz = 0;             // gravity takes it from here
        /* ...and from here it only falls. Without this it re-ran the wall
           test every tick, and a bolt fired point-blank — muzzle inside the
           crate you are pressed against — collided at t=0 forever: frozen at
           the launch point for its whole 5s life, then dropping its pool at
           your feet. Dropping straight down is what a blocked bolt is meant
           to do anyway, so stop testing geometry once it is stopped. */
        a.falling = true;
        continue;
      }
      drop(a.x + dirx*wallT, Math.max(0, a.y + diry*wallT), a.z + dirz*wallT);
      arrows.splice(i, 1); continue;                    // landed on top
    }
    a.x = nx; a.y = ny; a.z = nz;
    /* The floor is not one of the collider boxes - it is this y<0 test - so
       the ricochet branch above never saw it, and a banked shot died on the
       ground instead of skipping off it. */
    if (a.y < 0) {
      if (a.bounces > 0) {
        a.bounces--;
        a.y = 0.02;                                   // back above the floor
        a.vy = Math.abs(a.vy) * BOUNCE.keep;
        a.vx *= BOUNCE.keep; a.vz *= BOUNCE.keep;
        a.life = Math.min(a.life, BOUNCE.lifeS);
      } else { drop(a.x, 0, a.z); arrows.splice(i, 1); }
    }
  }

  // ---- Grenades: fly, bounce, and go off on the fuse ----
  const grens = room.grenades;
  for (let i = grens.length - 1; i >= 0; i--) {
    const g = grens[i];
    if (now >= g.fuseAt) {
      if (g.incen) dropFire(room, g.x, g.y, g.z, g.by, now, SALVO.incen.pool);   // never landed: it bursts where it is
      else explodeGrenade(room, g, now);
      grens.splice(i, 1); continue;
    }
    g.vy -= GRENADE.gravity * dt;
    const sx = g.vx*dt, sy = g.vy*dt, sz = g.vz*dt, len = Math.hypot(sx, sy, sz);
    if (len > 1e-6) {
      const dir = { x: sx/len, y: sy/len, z: sz/len }, o = { x: g.x, y: g.y, z: g.z };
      let best = null, onBody = false;
      for (const r of room.rayBoxes) { const h = rayBoxHit(o, dir, r); if (h && h.t <= len + 0.08 && (!best || h.t < best.t)) best = h; }
      /* Bodies too. `h.t > 0.02` matters: rayBoxHit returns t=0 with axis -1
         when the origin is already INSIDE a box, and a resting grenade under
         someone's feet would then flip its velocity every tick. */
      for (const r of bodyBoxes(room, g.by)) {
        const h = rayBoxHit(o, dir, r);
        if (h && h.t > 0.02 && h.t <= len + 0.08 && (!best || h.t < best.t)) { best = h; onBody = true; }
      }
      if (best) {
        const k = Math.max(0, best.t - 0.08);
        g.x += dir.x*k; g.y += dir.y*k; g.z += dir.z*k;
        if (g.incen) { g.fuseAt = now; continue; }      // the incendiary bursts on what it hits
        if (best.axis === 0) g.vx = -g.vx; else if (best.axis === 1) g.vy = -g.vy; else g.vz = -g.vz;
        const keep = onBody ? GRENADE.bodyBounce : GRENADE.bounce;
        g.vx *= keep; g.vy *= keep; g.vz *= keep;
      } else { g.x += sx; g.y += sy; g.z += sz; }
    }
    if (g.y < 0.08) {                                   // the floor is not a collider box
      g.y = 0.08;
      if (g.incen) { g.y = 0; g.fuseAt = now; continue; }
      if (g.vy < 0) { g.vy = -g.vy * GRENADE.bounce; g.vx *= GRENADE.friction; g.vz *= GRENADE.friction; }
      if (Math.abs(g.vy) < 0.6) g.vy = 0;
    }
  }

  // ---- Salvo's shells and bomblets, each on its own moment ----
  for (let i = room.blasts.length - 1; i >= 0; i--) {
    const b = room.blasts[i]; if (now < b.at) continue;
    room.blasts.splice(i, 1);
    blastAt(room, b.x, b.y, b.z, b.by, b.cfg, now, b.name);
  }

  // ---- TxF's laser ----
  tickLasers(room, now, dt);

  // ---- Blast's zone: regenerate while it runs ----
  for (const pl of players.values())
    if (pl.alive && pl.zoneUntil > now && pl.hp < 100) pl.hp = Math.min(100, pl.hp + ZONE.regen * dt);

  // ---- Smoke clouds: expire, and tag whoever is standing in one ----
  for (let i = smokes.length - 1; i >= 0; i--) if (smokes[i].until <= now) smokes.splice(i, 1);
  for (const pl of players.values()) {
    if (!pl.alive) { pl.markedUntil = 0; pl.markedBy = null; continue; }
    for (const sm of smokes) {
      if (sm.by === pl.id) continue;                    // your own smoke won't tag you
      const sy = sm.y || 0;                            // clouds can sit on crates now
      if ((pl.y || 0) < sy - 0.6 || (pl.y || 0) > sy + SMOKE.top) continue;
      if (Math.hypot(pl.x - sm.x, pl.z - sm.z) > SMOKE.radius) continue;
      pl.markedUntil = now + SMOKE.markMs;              // renews while they stay in
      pl.markedBy = sm.by;
      break;
    }
    if (pl.markedUntil && pl.markedUntil <= now) { pl.markedUntil = 0; pl.markedBy = null; }
  }

  // ---- Ground fire: expire pools, and set light to anyone standing in one ----
  for (let i = fires.length - 1; i >= 0; i--) if (fires[i].until <= now) fires.splice(i, 1);
  const standingInFire = (e, id, y) => {
    for (const f of fires) {
      if (f.by === id) continue;                       // your own pool won't burn you
      const fy = f.y || 0;                             // pools can sit on crates now
      if ((y || 0) < fy - 0.6 || (y || 0) > fy + FIRE.top) continue;
      if (Math.hypot(e.x - f.x, e.z - f.z) > (f.r || FIRE.radius)) continue;
      return f;
    }
    return null;
  };
  const scorch = (e, id, y) => {
    if (!e.alive) { e.inFire = false; return; }
    const f = standingInFire(e, id, y);
    if (f) {
      if (!e.burnUntil) e.burnNext = now + 1000;       // first tick a second from now
      e.burnUntil = now + FIRE.graceMs;                // renews while they stand in it
      e.burnBy = f.by;
      // never let walking into a pool slow an existing, fiercer burn
      e.burnRate = Math.max(e.burnRate || 0, f.dps || FIRE.dps);
      e.inFire = f;
    } else if (e.inFire) {
      // Just stepped out: they walk away still alight, but at the lower
      // lingering rate. A fiercer burn from a direct hit keeps precedence.
      const was = e.inFire; e.inFire = false;
      if (e.burnRate === (was.dps || FIRE.dps)) e.burnRate = was.lingerDps || FIRE.lingerDps;
      const until = now + (was.lingerMs || FIRE.lingerMs);
      if (e.burnUntil < until) e.burnUntil = until;
      if (!e.burnNext || e.burnNext > now + 1000) e.burnNext = now + 1000;
    }
  };
  for (const pl of players.values()) scorch(pl, pl.id, pl.y);

  // ---- Passive detection: let expired reveals lapse ----
  for (const p of players.values()) {
    if (p.detectUntil && now >= p.detectUntil) { p.detectUntil = 0; p.detectTarget = null; }
  }

  // ---- Resupply crate: top up ammo, and pay out once a round ----
  for (const pl of players.values()) {
    if (!pl.alive) continue;
    const near = Math.hypot(pl.x - room.resupply.x, pl.z - room.resupply.z) <= RESUPPLY.radius;
    if (!near) { pl.inResupply = false; continue; }
    if (pl.inResupply) continue;                 // already standing in it
    pl.inResupply = true;
    let paid = 0, ammo = true, waitS = 0;
    if (match.phase === 'live') {
      if (!match.resupplyBy) {
        match.resupplyBy = pl.id;                // the cash is one per round
        paid = RESUPPLY.cash; pl.money += paid;
        io.to(room.id).emit('claimed', { name: pl.name, cash: paid });
      }
      if (now >= (match.ammoAt || 0)) {          // and the ammo one per 30s
        match.ammoAt = now + RESUPPLY.ammoMs;
        io.to(room.id).emit('ammotaken', { name: pl.name, secs: RESUPPLY.ammoMs/1000 });
      } else { ammo = false; waitS = Math.ceil((match.ammoAt - now) / 1000); }
    }
    if (ammo) for (const g of pl.guns) fillAmmo(pl, g);     // the server's copy too
    io.to(pl.id).emit('resupply', { cash: paid, ammo, in: waitS,
      ammoNow: ammo ? pl.guns.map(g => ({ slot: g, mag: ammoOf(pl, g).mag,
                                          reserve: ammoOf(pl, g).reserve })) : [] });
  }

  /* ---- Health potions: one use each, and your own falloff ---- */
  if (match.phase === 'live') for (const pl of players.values()) {
    if (!pl.alive || pl.hp >= maxHpOf(pl)) continue;          // no point walking over one at full
    for (const pot of (room.potions || [])) {
      if (pot.taken) continue;
      if (Math.hypot(pl.x - pot.x, pl.z - pot.z) > POTION.radius) continue;
      const nth = Math.min(pl.potions || 0, POTION.heals.length - 1);
      const heal = POTION.heals[nth];
      pot.taken = true;
      pl.potions = (pl.potions || 0) + 1;
      pl.hp = Math.min(maxHpOf(pl), pl.hp + heal);
      io.to(pl.id).emit('healed', { heal, hp: pl.hp, nth: pl.potions, left: potionMask(room) });
      io.to(room.id).emit('potiongone', { name: pl.name });
      break;                                           // one per tick, not the whole set
    }
  }

  // ---- Burn damage over time ----
  const burnTick = (e, isPlayer) => {
    if (!e.burnUntil || !e.alive) return;
    if (now > e.burnUntil) { e.burnUntil = 0; e.burnRate = 0; return; }
    if (now < (e.burnNext || 0)) return;
    e.burnNext = now + 1000;
    e.hp -= (e.burnRate || XBOW.burnDps) * blastMul(e); hitBy(e, e.burnBy);
    if (e.hp <= 0 && e.alive) {
      eliminate(room, e, isPlayer);
      const killer = players.get(e.burnBy);
      if (killer) killer.kills++;
      if (isPlayer) e.deaths++;
      io.to(room.id).emit('kill', { by: killer ? killer.name : 'fire', byId: e.burnBy, victim: isPlayer ? e.name : 'a bot', head:false });
    }
  };
  for (const pl of players.values()) burnTick(pl, true);


  tickRobots(room, now, dt);              // Silvars' sensor, drone and dog

  // broadcast a snapshot of the whole world
  recordHistory(room, now);               // for rewinding shots onto past positions
  sendMeta(room, false);                  // only when names, money or score move
  io.to(room.id).emit('snapshot', encodeSnapshot(room, now));
}

server.listen(PORT, () => console.log(`Elite Force MP server on http://localhost:${PORT}`));
