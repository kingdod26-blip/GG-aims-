/* ============================================================================
   BOT STRIKE — Multiplayer server (authoritative-ish).
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
app.use(express.static(path.join(__dirname, 'public')));
/* The lobby reads these before joining anything, so they must work without a
   socket. Listing is the room browser; /rooms/new reserves a fresh code. */
app.get('/rooms', (_req, res) => res.json({ rooms: roomList(), max: MATCH.maxPlayers }));
app.get('/rooms/new', (req, res) => {
  if (rooms.size >= MAX_ROOMS)
    return res.status(503).json({ error: 'the server is full, try again shortly' });
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '?';
  if (!mayCreateRoom(ip))
    return res.status(429).json({ error: 'too many rooms too quickly' });
  const code = newRoomCode();
  if (!code) return res.status(503).json({ error: 'could not allocate a code' });
  rooms.set(code, makeRoom(code, 60000));     // held for a minute so it survives the trip
  console.log(`[*] room ${code} created (${rooms.size} room(s))`);
  res.json({ code });
});
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8200;

/* ----------------------------- Shared arena ------------------------------- */
/* Must match the client's arena. Heights matter: obstacles used to be treated
   as infinitely tall for line-of-sight, so you could not shoot over a crate —
   and standing ON one put your own muzzle inside a collider, which zeroed the
   wall distance and made every shot you took miss. Movement and spawn checks
   are still deliberately 2D (they only ever run at ground level). */
const ARENA = 60;
const WALL_H = 8;                 // perimeter wall height (client's WH)
const LAYOUT = [ // [x, z, w, d, h]
  [0,0,6,6,3],
  [-18,-12,4,4,2.5],[18,-12,4,4,2.5],[-18,12,4,4,2.5],[18,12,4,4,2.5],
  [0,-24,12,2,4],[0,24,12,2,4],[-30,0,2,12,4],[30,0,2,12,4],
  [-10,-30,3,3,2],[10,30,3,3,2],[-34,-30,5,5,3],[34,30,5,5,3],
  [24,-28,3,3,2],[-24,28,3,3,2],[12,8,2.5,2.5,1.5],[-12,-8,2.5,2.5,1.5],
];
// Boxes as {minx,minz,maxx,maxz,miny,maxy}; they all sit on the floor.
const RECTS = LAYOUT.map(([x,z,w,d,h]) => ({ minx:x-w/2, minz:z-d/2, maxx:x+w/2, maxz:z+d/2, miny:0, maxy:h }));
// The perimeter walls are collidable on the client, so the server needs them
// too — otherwise bullets and ricocheting arrows fly straight through them.
/* The roof. It is deliberately NOT in RECTS: that list also drives resolve2D,
   insideWall and lineClear, which are all 2D, so a box covering the whole
   arena would shove every player sideways out of the map. It belongs only to
   the 3D ray tests, hence a separate list. */
const CEILING = { minx:-ARENA-1, minz:-ARENA-1, maxx:ARENA+1, maxz:ARENA+1,
                  miny:WALL_H, maxy:WALL_H+1 };
RECTS.push(
  { minx:-ARENA-1, minz:-ARENA-1, maxx: ARENA+1, maxz:-ARENA+1, miny:0, maxy:WALL_H },   // north
  { minx:-ARENA-1, minz: ARENA-1, maxx: ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // south
  { minx:-ARENA-1, minz:-ARENA-1, maxx:-ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // west
  { minx: ARENA-1, minz:-ARENA-1, maxx: ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // east
);
// what bullets and arrows collide with: the walls plus the roof
const RAY_BOXES = RECTS.concat([CEILING]);

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
function lineClear(fx, fz, tx, tz) {
  for (const r of RECTS) if (segRectDist(fx, fz, tx, tz, r) < Infinity) return false;
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
function resolveBody(pos, feetY, st) {
  const top = feetY + (BODY_H[st] || BODY_H[0]), r = MOVE.radius;
  for (const c of RECTS) {
    if (c.miny > top || c.maxy <= feetY + 0.05) continue;    // above us, or underfoot
    const cx = Math.max(c.minx, Math.min(pos.x, c.maxx));
    const cz = Math.max(c.minz, Math.min(pos.z, c.maxz));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { const p = r - d; pos.x += dx/d*p; pos.z += dz/d*p; }
    else if (d === 0) pos.x += r;
  }
  const b = ARENA - 1.2;
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(b, pos.z));
}

/* Returns the position the server is willing to believe. */
function vetMove(p, nx, ny, nz, now) {
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
  y = Math.max(0, Math.min(y, WALL_H - 1.9));

  resolveBody(pos, y, p.st || 0);
  return { x: pos.x, y, z: pos.z };
}

function resolve2D(pos, radius) {
  for (const r of RECTS) {
    const cx = Math.max(r.minx, Math.min(pos.x, r.maxx));
    const cz = Math.max(r.minz, Math.min(pos.z, r.maxz));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d < radius && d > 1e-4) { const p = radius - d; pos.x += dx/d*p; pos.z += dz/d*p; }
    else if (d === 0) pos.x += radius;
  }
  const b = ARENA - 1.2;
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
function randomSpawn() {
  let x, z, t = 0;
  do { x = rand(-(ARENA-6), ARENA-6); z = rand(-(ARENA-6), ARENA-6); t++; }
  while (insideWall(x, z) && t < 40);
  return { x, z };
}
function insideWall(x, z) {
  for (const r of RECTS) if (x > r.minx-1 && x < r.maxx+1 && z > r.minz-1 && z < r.maxz+1) return true;
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
function makeRoom(id, holdMs) {
  return { id,
    players: new Map(),           // socket.id -> player
    parked: new Map(),            // token -> { wins, money, guns, name, at }
    smokes: [], fires: [], arrows: [],
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
  const r = makeRoom(nextRoomId());
  rooms.set(r.id, r);
  return r;
}
/* What the lobby shows before you commit to joining anything. */
function roomList() {
  return [...rooms.values()]
    .map(r => ({ id: r.id, players: r.players.size, max: MATCH.maxPlayers,
                 phase: r.match.phase, round: r.match.round,
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
const XBOW = { dmg: 90, burnDps: 12, burnMs: 5000, charges: 2, cooldownMs: 30000, speed: 62 };
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
// dps is deliberately higher than XBOW.burnDps: a direct hit already lands 90
// up front, whereas a pool only hurts you for as long as you choose to stand
// in it. Keep in step with the client's GFIRE.dps.
// lingerDps/lingerMs: you walk out of a pool still alight, but burning at a
// lower rate than the fire itself. graceMs only covers gaps between ticks
// while you are still standing in it.
const FIRE = { radius: 4.35, ms: 9000, top: 1.0, graceMs: 1200, dps: 18,
               lingerDps: 6, lingerMs: 5000 };

// Blade melee (must match the client's BLADE entry)
const MELEE = { combo: [22,22,28,28,70], windowMs: 1600, rateMs: 320, reach: 3.4, arc: 0.5 };
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
  { name:'RIFLE',    dmg:26,  range:240, fireRate:95,   pellets:1 },
  { name:'SNIPER',   dmg:110, range:400, fireRate:1200, pellets:1 },
  { name:'SHOTGUN',  dmg:12,  range:60,  fireRate:900,  pellets:8 },
  { name:'PISTOL',   dmg:30,  range:180, fireRate:200,  pellets:1 },
  { name:'PISTOL X', dmg:40,  range:180, fireRate:170,  pellets:1 },
];
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
const RESUPPLY = { x: 0, z: 0, radius: 5.0, cash: 100, ammoMs: 30000 };
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
      const c = randomSpawn();
      if (Math.hypot(c.x - RESUPPLY.x, c.z - RESUPPLY.z) < POTION.clearOfCrate) continue;
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
function spreadSpawns(n) {
  const chosen = [];
  for (let i = 0; i < n; i++) {
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 120; tries++) {
      const c = randomSpawn();
      if (!chosen.length) { best = c; break; }
      let nearest = Infinity, blocked = 0;
      for (const o of chosen) {
        const d = Math.hypot(c.x - o.x, c.z - o.z);
        if (d < nearest) nearest = d;
        if (!lineClear(c.x, c.z, o.x, o.z)) blocked++;   // something in the way
      }
      if (nearest < SPAWN_APART) continue;               // never spawn on top of someone
      const hidden = blocked === chosen.length;
      const score = (hidden ? 1000 : 0) + Math.min(nearest, 70);
      if (score > bestScore) { bestScore = score; best = c; }
      if (hidden && nearest > 30) break;                 // good enough
    }
    chosen.push(best || randomSpawn());
  }
  return chosen;
}
function respawnAll(room) {
  const players = room.players;
  const spots = spreadSpawns(players.size);
  let i = 0;
  for (const p of players.values()) {
    const s = spots[i++] || randomSpawn();
    p.x = s.x; p.z = s.z; p.y = 0; p.hp = 100; p.alive = true;
    p.tp = (p.tp || 0) + 1;        // force the client to accept this position
    p.burnUntil = 0; p.burnRate = 0; p.inFire = false;
    p.markedUntil = 0; p.markedBy = null; p.rl = 0; p.st = 0; p.diedAt = 0;
    p.lo = 0; p.vx = 0; p.vz = 0; p.stateAt = 0; p.moveAt = 0;   // a teleport is not travel
    if (p.hist) p.hist.length = 0;                  // and nothing to rewind onto
  }
}
function clearField(room) {        // no fire, smoke or arrows carried between rounds
  room.arrows.length = 0; room.smokes.length = 0; room.fires.length = 0;
  io.to(room.id).emit('fieldclear');
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
  for (const p of room.players.values()) { p.wins = 0; p.money = ECON.start; p.guns = []; }
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
function eliminate(e, isPlayer) {
  e.alive = false; e.hp = 0;
  e.diedAt = Date.now();        // who went down last decides a mutual kill
  e.burnUntil = 0; e.burnRate = 0; e.inFire = false;
  e.markedUntil = 0; e.markedBy = null; e.rl = 0;
  if (isPlayer) { const s = randomSpawn(); e.x = s.x; e.z = s.z; e.y = 0; e.st = 0;
                  e.tp = (e.tp || 0) + 1; e.moveAt = 0; }
}
/* Payloads land where the bolt actually stopped, height included. These used
   to be x/z only, so a bolt that stuck in the top of a crate put its fire on
   the floor underneath. */
function dropFire(room, x, y, z, byId, now) {
  room.fires.push({ x, y, z, by: byId, until: now + FIRE.ms });
  io.to(room.id).emit('groundfire', { x, y, z });
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
  for (const p of room.players.values()) { p.detectReadyAt = 0; p.detectUntil = 0; p.detectTarget = null; }
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
   PLAYER  21 bytes each
     u8  slot                 u8  flags: bit0 alive, bit1 burning
     u8  stance               u8  hp
     i16 x*100  i16 y*100  i16 z*100      (centimetres; the arena is +-60m)
     u16 yaw    (0..65535 across a full turn)
     u8  roll   (0..255 across 0..1)
     u8  tp     (low byte; the client only tests it for CHANGE)
     i8  lean   (centimetres out of cover, -60..60)
     i8  markedBy slot        i8  detectTarget slot
     u16 detectUntil ms       u16 detectReady ms
   ARROW   15 bytes each
     u16 id
     i16 x,y,z *100           i16 vx,vy,vz *100
     u8  flags: bit0 smoke
   ========================================================================= */
const SNAP_VERSION = 4;          // 2 lean, 3 ammo timer, 4 potions
const PHASES = ['waiting', 'intermission', 'live', 'over', 'paused'];
const HEAD_B = 12, PLAYER_B = 21, ARROW_B = 15;
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
    slot: p.slot, id: p.id, name: p.name, color: p.color,
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
  const ps = [...room.players.values()], as = room.arrows;
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
    buf.writeUInt8((p.alive ? 1 : 0) | (p.burnUntil > now ? 2 : 0), o++);
    buf.writeUInt8(p.st || 0, o++);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(p.hp))), o++);
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
    buf.writeUInt8(a.smoke ? 1 : 0, o++);
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
  const s = randomSpawn();
  /* Did this browser leave an unfinished match behind a moment ago? Give it
     back rather than starting them at nothing — a reload mid-match should not
     cost you the rounds you already won. */
  const saved = tok ? parked.get(tok) : null;
  if (saved && Date.now() - saved.at > MATCH.rejoinMs) { parked.delete(tok); }
  const back = (saved && Date.now() - saved.at <= MATCH.rejoinMs) ? saved : null;
  if (back) parked.delete(tok);
  const player = {
    id: socket.id, tok, x: s.x, z: s.z, y: 0, yaw: 0, pitch: 0, st: 0,
    /* Joining mid-round used to drop you into it alive at full health, so a
       latecomer could win a round they were not in at the start — and, with
       three or more in the room, reloading the page was a free heal. Sit the
       round out instead; respawnAll() brings you in at the next one. */
    hp: 100, alive: match.phase !== 'live', kills: 0, deaths: 0, wins: back ? back.wins : 0, tp: 0,
    money: back ? back.money : ECON.start,
    guns: back ? back.guns : [],       // owned WEAPONS slots, in purchase order
    detectReadyAt: 0, detectUntil: 0, detectTarget: null,
    color: COLORS[players.size % COLORS.length],
    name: 'Player-' + socket.id.slice(0, 4),
  };
  if (back) player.name = back.name;
  player.slot = freeSlot(room);        // one byte stands in for the socket id
  players.set(socket.id, player);
  /* Everything that never changes goes out ONCE, here, instead of riding in
     every snapshot 30 times a second. */
  socket.emit('welcome', { id: socket.id, spawn: s, color: player.color, arena: ARENA,
    room: room.id,
    prices: PRICES, mainSlots: MAIN_SLOTS, sideSlots: SIDE_SLOTS, resupply: RESUPPLY,
    maxMain: MAX_MAIN, maxSide: MAX_SIDE, maxPlayers: MATCH.maxPlayers,
    winsNeeded: MATCH.winsNeeded });
  sendMeta(room, true);                // the roster, before any frame refers to it
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
    if (typeof d.name === 'string') p.name = d.name.slice(0, 16);
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
        const v = vetMove(p, d.x, typeof d.y === 'number' ? d.y : (p.y || 0), d.z, at);
        p.x = v.x; p.y = v.y; p.z = v.z;
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

    noiseMade(room, p.id, Date.now());       // a bang: anyone listening picks it up
    const o = { x: d.ox, y: d.oy, z: d.oz };
    const dir = normalize(d.dx, d.dy, d.dz);
    const range = gun.range, dmg = gun.dmg;
    // broadcast a tracer so others see the shot
    socket.to(room.id).emit('shot', { ox:o.x, oy:o.y, oz:o.z, dx:dir.x, dy:dir.y, dz:dir.z, len: range });

    // nearest wall blocks the bullet — in 3D, so shots pass over low cover
    let wall = Infinity;
    for (const r of RAY_BOXES) {
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

    if (best.target) {
      const dealt = dmg * best.mult;
      const tgt = best.target.ref;
      tgt.hp -= dealt;
      io.to(room.id).emit('impact', { x: o.x + dir.x*best.t, y: o.y + dir.y*best.t, z: o.z + dir.z*best.t,
                          head: best.head, zone: best.zone });
      if (tgt.hp <= 0 && tgt.alive) {
        eliminate(tgt, best.target.kind === 'player');
        p.kills++;
        if (best.target.kind === 'player') tgt.deaths++;   // eliminated for this round
        io.to(room.id).emit('kill', { by: p.name, victim: best.target.kind === 'bot' ? 'a bot' : tgt.name, head: best.head });
      }
    }
  });

  // ---- Smoke bolt: same flight as an arrow, leaves a tagging cloud ----
  socket.on('smokebolt', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
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
    socket.emit('bought', { slot, money: p.money, guns: p.guns.slice() });
  });

  // ---- Blade: five-hit melee combo, validated server-side ----
  socket.on('melee', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    const now = Date.now();
    if (now - (p.lastMelee || 0) < MELEE.rateMs) return;      // rate limit
    p.lastMelee = now;
    if (now > (p.comboUntil || 0)) p.comboStep = 0;           // chain timed out
    const dir = normalize(d.dx, d.dy, d.dz);
    const ox = d.ox, oy = d.oy, oz = d.oz;
    // nearest target inside the reach cone
    let best = null, bestD = Infinity;
    const tryT = (cx, cy, cz, ref) => {
      const vx = cx-ox, vy = cy-oy, vz = cz-oz;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > MELEE.reach) return;
      if ((vx*dir.x + vy*dir.y + vz*dir.z)/(dist||1) < MELEE.arc) return;
      /* The blade used to check distance and angle only, so with 3.4m of
         reach you could stab someone standing on the far side of a wall.
         Gunfire has always tested geometry; melee now does the same, in 3D
         so it still works across low cover you are standing on. The t > 0.1
         guard keeps a swing from being blocked by the crate you are pressed
         against, whose box can contain the swing's own origin. */
      const to = { x: vx/dist, y: vy/dist, z: vz/dist };
      const from = { x: ox, y: oy, z: oz };
      for (const r of RAY_BOXES) {
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

    if (!best) { p.comboStep = 0; return; }                   // a miss breaks the chain
    const step = Math.min(p.comboStep || 0, MELEE.combo.length-1);
    const t = best.ref, isPlayer = best.kind === 'player';
    t.hp -= MELEE.combo[step];
    io.to(room.id).emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false });
    p.comboStep = (step + 1) % MELEE.combo.length;
    p.comboUntil = now + MELEE.windowMs;
    if (t.hp <= 0 && t.alive) {
      eliminate(t, isPlayer); p.kills++;
      if (isPlayer) t.deaths++;
      io.to(room.id).emit('kill', { by: p.name, victim: isPlayer ? t.name : 'a bot', head: step === MELEE.combo.length-1 });
    }
  });

  // ---- Crossbow ability: launch a flaming arrow (server-simulated) ----
  socket.on('arrow', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
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

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    /* Hold their score for a minute in case this was a reload or a throttled
       background tab rather than someone actually leaving. Nothing is held
       once the match itself is over or has not started. */
    if (p && p.tok && match.phase !== 'waiting')
      parked.set(p.tok, { wins: p.wins || 0, money: p.money, guns: p.guns,
                          name: p.name, at: Date.now() });
    players.delete(socket.id);
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

/* Arrow impact: big direct hit, then it burns for 9s. */
function igniteTarget(room, hit, byId, now) {
  const players = room.players;
  const t = hit.ref, isPlayer = hit.kind === 'player';
  t.hp -= XBOW.dmg;
  t.burnUntil = now + XBOW.burnMs; t.burnNext = now + 1000; t.burnBy = byId;
  t.burnRate = XBOW.burnDps;
  const shooter = players.get(byId);
  io.to(room.id).emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false, fire:true });
  dropFire(room, t.x, t.y || 0, t.z, byId, now);   // pool at their feet
  if (t.hp <= 0 && t.alive) {
    eliminate(t, isPlayer);
    if (shooter) shooter.kills++;
    if (isPlayer) t.deaths++;
    io.to(room.id).emit('kill', { by: shooter ? shooter.name : 'fire', victim: isPlayer ? t.name : 'a bot', head:false });
  }
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
      if (w) for (const p of players.values()) if (p !== w) p.guns = [];
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
      if (a.y <= 0) { (a.smoke ? dropSmoke : dropFire)(room, a.x, 0, a.z, a.by, now); arrows.splice(i, 1); }
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
    const tryHit = (cx, cz, baseY, st, ref) => {
      const box = [[1.05,0.60,1.70],[0.70,0.55,1.10],[0.32,0.50,0.50]][st] || [1.05,0.60,1.70];
      const b1 = raySphere(o, dir, cx, baseY+box[0], cz, box[1]);
      const h1 = raySphere(o, dir, cx, baseY+box[2], cz, 0.34);
      const t = Math.min(b1, h1);
      if (t < hitT && t <= stepLen) { hitT = t; victim = ref; }
    };
    for (const pl of players.values())
      if (pl.alive && pl.id !== a.by) tryHit(aimX(pl), aimZ(pl), pl.y||0, pl.st||0, { kind:'player', ref:pl });

    // nearest wall along this step, height-aware
    let wallT = Infinity, wn = null;
    for (const r of RAY_BOXES) {
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
      if (Math.hypot(e.x - f.x, e.z - f.z) > FIRE.radius) continue;
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
      e.burnRate = Math.max(e.burnRate || 0, FIRE.dps);
      e.inFire = true;
    } else if (e.inFire) {
      // Just stepped out: they walk away still alight, but at the lower
      // lingering rate. A fiercer burn from a direct hit keeps precedence.
      e.inFire = false;
      if (e.burnRate === FIRE.dps) e.burnRate = FIRE.lingerDps;
      const until = now + FIRE.lingerMs;
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
    const near = Math.hypot(pl.x - RESUPPLY.x, pl.z - RESUPPLY.z) <= RESUPPLY.radius;
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
    io.to(pl.id).emit('resupply', { cash: paid, ammo, in: waitS });
  }

  /* ---- Health potions: one use each, and your own falloff ---- */
  if (match.phase === 'live') for (const pl of players.values()) {
    if (!pl.alive || pl.hp >= 100) continue;          // no point walking over one at full
    for (const pot of (room.potions || [])) {
      if (pot.taken) continue;
      if (Math.hypot(pl.x - pot.x, pl.z - pot.z) > POTION.radius) continue;
      const nth = Math.min(pl.potions || 0, POTION.heals.length - 1);
      const heal = POTION.heals[nth];
      pot.taken = true;
      pl.potions = (pl.potions || 0) + 1;
      pl.hp = Math.min(100, pl.hp + heal);
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
    e.hp -= (e.burnRate || XBOW.burnDps);
    if (e.hp <= 0 && e.alive) {
      eliminate(e, isPlayer);
      const killer = players.get(e.burnBy);
      if (killer) killer.kills++;
      if (isPlayer) e.deaths++;
      io.to(room.id).emit('kill', { by: killer ? killer.name : 'fire', victim: isPlayer ? e.name : 'a bot', head:false });
    }
  };
  for (const pl of players.values()) burnTick(pl, true);


  // broadcast a snapshot of the whole world
  recordHistory(room, now);               // for rewinding shots onto past positions
  sendMeta(room, false);                  // only when names, money or score move
  io.to(room.id).emit('snapshot', encodeSnapshot(room, now));
}

server.listen(PORT, () => console.log(`Bot Strike MP server on http://localhost:${PORT}`));
