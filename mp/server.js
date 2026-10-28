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
const players = new Map(); // socket.id -> player
// Crossbow ability tuning (must match the client's WEAPONS entry)
// burnMs is how long a PERSON burns. The fire left on the ground is a
// client-side visual with its own (longer) lifetime — see GFIRE in the client.
const XBOW = { dmg: 90, burnDps: 12, burnMs: 5000, charges: 2, cooldownMs: 30000, speed: 62 };
// Smoke bolt: no damage. Anyone standing in the cloud is tagged for markMs,
// and the tag renews every tick they stay in it. Must match the client's
// SMOKEFX radius/top/markMs or the cloud you see won't match the one that tags.
const SMOKE = { charges: 2, cooldownMs: 30000, speed: 52, ms: 10000,
                radius: 5.5, top: 3.4, markMs: 4000 };
const smokes = [];   // { x, z, by, until }
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
const fires = [];    // { x, z, by, until }
// Blade melee (must match the client's BLADE entry)
const MELEE = { combo: [22,22,28,28,70], windowMs: 1600, rateMs: 320, reach: 3.4, arc: 0.5 };
const arrows = [];
let arrowSeq = 0;
/* ----------------------------- Match format ------------------------------
   Multiplayer is round-based and has no bots. Kill the opposition to take a
   round; first to MATCH.winsNeeded rounds takes the match, then everything
   resets and it runs again. Death inside a round is elimination — you sit it
   out until the next one, which is what makes a round worth winning. */
/* prepMs is the buy window, and it is the same before round 1 as it is
   between rounds — it is all "prep" to the player, so one number. */
const MATCH = { winsNeeded: 3, prepMs: 30000, endMs: 7000, minPlayers: 2 };
/* Economy. You carry one MAIN (rifle / sniper / shotgun) and one SIDE (either
   pistol) — buying within a category replaces what you had there, no refund,
   so money is worth saving. The crossbow, smoke and blade are always yours and
   cost nothing. Money resets per MATCH, never between rounds.
   Slots match the client's WEAPONS: 0 rifle, 1 sniper, 2 shotgun, 3 pistol,
   4 pistol X. */
const ECON = { start: 200, win: 200, loss: 100 };
const PRICES = [150, 300, 150, 50, 50];
/* Passive detection. Everyone has it, nobody equips it. When an opponent
   makes a noise — firing a gun, loosing a bolt — it picks them out through
   walls for revealMs, then sleeps for cooldownMs. The same window also lights
   up hazards on the client: fire pools and smoke clouds stand in for traps
   until there are real ones. */
const DETECT = { revealMs: 4000, cooldownMs: 30000 };
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
/* Guns are held as an ORDERED list: the first you buy is position 1, the
   second position 2, and the number keys pick by position rather than by
   weapon. Buying past the limit drops the oldest of that category. */
const match = { phase: 'waiting', round: 0, until: 0, roundWinner: null, matchWinner: null };

function respawnAll() {
  for (const p of players.values()) {
    const s = randomSpawn();
    p.x = s.x; p.z = s.z; p.y = 0; p.hp = 100; p.alive = true;
    p.burnUntil = 0; p.burnRate = 0; p.inFire = false;
    p.markedUntil = 0; p.markedBy = null; p.rl = 0; p.st = 0;
  }
}
function clearField() {            // no fire, smoke or arrows carried between rounds
  arrows.length = 0; smokes.length = 0; fires.length = 0;
  io.emit('fieldclear');
}
function openBuyWindow(now, ms) {          // intermission doubles as the shop
  match.phase = 'intermission'; match.until = now + ms;
  clearField(); respawnAll(); resetDetection();
}
function resetEconomy() {
  for (const p of players.values()) { p.wins = 0; p.money = ECON.start; p.guns = []; }
}
/* Somebody just made a noise. Anyone whose passive is off cooldown picks them
   out, and their own passive then sleeps for 30s. Called from every handler
   that represents a bang. */
function noiseMade(byId, now) {
  for (const p of players.values()) {
    if (p.id === byId || !p.alive) continue;
    if (now < p.detectReadyAt) continue;             // still recharging
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
  e.burnUntil = 0; e.burnRate = 0; e.inFire = false;
  e.markedUntil = 0; e.markedBy = null; e.rl = 0;
  if (isPlayer) { const s = randomSpawn(); e.x = s.x; e.z = s.z; e.y = 0; e.st = 0; }
}
/* Payloads land where the bolt actually stopped, height included. These used
   to be x/z only, so a bolt that stuck in the top of a crate put its fire on
   the floor underneath. */
function dropFire(x, y, z, byId, now) {
  fires.push({ x, y, z, by: byId, until: now + FIRE.ms });
  io.emit('groundfire', { x, y, z });
}
function dropSmoke(x, y, z, byId, now) {
  smokes.push({ x, y, z, by: byId, until: now + SMOKE.ms });
  io.emit('smoke', { x, y, z, by: byId });
}
function resetDetection() {
  for (const p of players.values()) { p.detectReadyAt = 0; p.detectUntil = 0; p.detectTarget = null; }
}
function startRound(n, resetWins) {
  if (resetWins) resetEconomy();
  match.round = n; match.phase = 'live';
  match.roundWinner = null; match.matchWinner = null; match.until = 0;
  clearField(); respawnAll(); resetDetection();     // everyone starts a round with it ready
}

const COLORS = [0x27ff9e, 0x3ad0ff, 0xffd15a, 0xff7ac2, 0xb08bff, 0x8affc1, 0xff9a5a];

/* ------------------------------ Networking -------------------------------- */
io.on('connection', (socket) => {
  const s = randomSpawn();
  const player = {
    id: socket.id, x: s.x, z: s.z, y: 0, yaw: 0, pitch: 0, st: 0,
    hp: 100, alive: true, kills: 0, deaths: 0, wins: 0,
    money: ECON.start, guns: [],       // owned WEAPONS slots, in purchase order
    detectReadyAt: 0, detectUntil: 0, detectTarget: null,
    color: COLORS[players.size % COLORS.length],
    name: 'Player-' + socket.id.slice(0, 4),
  };
  players.set(socket.id, player);
  socket.emit('welcome', { id: socket.id, spawn: s, color: player.color, arena: ARENA });
  console.log(`[+] ${player.name} connected (${players.size} online)`);

  // Client owns its movement; it streams position/orientation here.
  socket.on('state', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
    if (typeof d.x === 'number') p.x = d.x;
    if (typeof d.z === 'number') p.z = d.z;
    if (typeof d.y === 'number') p.y = d.y;
    if (typeof d.yaw === 'number') p.yaw = d.yaw;
    if (typeof d.pitch === 'number') p.pitch = d.pitch;
    if (typeof d.st === 'number') p.st = Math.max(0, Math.min(2, d.st|0));   // 0 stand 1 crouch 2 prone
    // roll progress 0..1, relayed so everyone sees the same somersault
    if (typeof d.rl === 'number') p.rl = Math.max(0, Math.min(1, d.rl));
    if (typeof d.name === 'string') p.name = d.name.slice(0, 16);
  });

  // Authoritative hit detection when a player fires.
  socket.on('fire', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    noiseMade(p.id, Date.now());             // a bang: anyone listening picks it up
    const o = { x: d.ox, y: d.oy, z: d.oz };
    const dir = normalize(d.dx, d.dy, d.dz);
    const range = d.range || 220, dmg = d.dmg || 25;
    // broadcast a tracer so others see the shot
    socket.broadcast.emit('shot', { ox:o.x, oy:o.y, oz:o.z, dx:dir.x, dy:dir.y, dz:dir.z, len: range });

    // nearest wall blocks the bullet — in 3D, so shots pass over low cover
    let wall = Infinity;
    for (const r of RAY_BOXES) {
      const h = rayBoxHit(o, dir, r);
      if (h && h.t < wall) wall = h.t;
    }

    let best = { t: Math.min(wall, range), target: null, head: false };
    // Hitboxes shrink with stance, so crouching and going prone genuinely make
    // you a smaller target. [body height, body radius, head height]
    const STANCE_BOX = [ [1.05, 0.55, 1.70],    // standing
                         [0.70, 0.50, 1.10],    // crouched
                         [0.32, 0.45, 0.50] ];  // prone
    // baseY lets us model targets standing on crates (players send their feet height)
    const consider = (cx, cz, baseY, st, hitApply) => {
      const [bh, br, hh] = STANCE_BOX[st] || STANCE_BOX[0];
      const body = raySphere(o, dir, cx, baseY + bh, cz, br);
      const head = raySphere(o, dir, cx, baseY + hh, cz, 0.30);
      let t = Infinity, hs = false;
      if (head < t) { t = head; hs = true; }
      if (body < t) { t = body; hs = false; }
      if (t < best.t) best = { t, target: hitApply, head: hs };
    };
    for (const other of players.values())
      if (other.alive && other.id !== p.id) consider(other.x, other.z, other.y || 0, other.st || 0, { kind:'player', ref:other });

    if (best.target) {
      const dealt = best.head ? dmg*2.5 : dmg;
      const tgt = best.target.ref;
      tgt.hp -= dealt;
      io.emit('impact', { x: o.x + dir.x*best.t, y: o.y + dir.y*best.t, z: o.z + dir.z*best.t, head: best.head });
      if (tgt.hp <= 0 && tgt.alive) {
        eliminate(tgt, best.target.kind === 'player');
        p.kills++;
        if (best.target.kind === 'player') tgt.deaths++;   // eliminated for this round
        io.emit('kill', { by: p.name, victim: best.target.kind === 'bot' ? 'a bot' : tgt.name, head: best.head });
      }
    }
  });

  // ---- Smoke bolt: same flight as an arrow, leaves a tagging cloud ----
  socket.on('smokebolt', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    noiseMade(p.id, Date.now());             // a bang: anyone listening picks it up
    const now = Date.now();
    p.smokeShots = (p.smokeShots || []).filter(t => now - t < SMOKE.cooldownMs);
    if (p.smokeShots.length >= SMOKE.charges) return;
    p.smokeShots.push(now);
    const dir = normalize(d.dx, d.dy, d.dz);
    arrows.push({ id: 'a' + (arrowSeq++), by: socket.id, smoke: true,
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
      if (dist < bestD) { bestD = dist; best = ref; }
    };
    for (const pl of players.values())
      if (pl.alive && pl.id !== p.id) tryT(pl.x, (pl.y||0)+1.1, pl.z, { kind:'player', ref:pl });

    if (!best) { p.comboStep = 0; return; }                   // a miss breaks the chain
    const step = Math.min(p.comboStep || 0, MELEE.combo.length-1);
    const t = best.ref, isPlayer = best.kind === 'player';
    t.hp -= MELEE.combo[step];
    io.emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false });
    p.comboStep = (step + 1) % MELEE.combo.length;
    p.comboUntil = now + MELEE.windowMs;
    if (t.hp <= 0 && t.alive) {
      eliminate(t, isPlayer); p.kills++;
      if (isPlayer) t.deaths++;
      io.emit('kill', { by: p.name, victim: isPlayer ? t.name : 'a bot', head: step === MELEE.combo.length-1 });
    }
  });

  // ---- Crossbow ability: launch a flaming arrow (server-simulated) ----
  socket.on('arrow', (d) => {
    if (match.phase !== 'live') return;      // only during a live round
    const p = players.get(socket.id); if (!p || !p.alive) return;
    noiseMade(p.id, Date.now());             // a bang: anyone listening picks it up
    // enforce the 2-charge / 30s budget here too, so it can't be spammed
    const now = Date.now();
    p.shots = (p.shots || []).filter(t => now - t < XBOW.cooldownMs);
    if (p.shots.length >= XBOW.charges) return;
    p.shots.push(now);
    const dir = normalize(d.dx, d.dy, d.dz);
    arrows.push({ id: 'a' + (arrowSeq++), by: socket.id,
      x: d.ox, y: d.oy, z: d.oz,
      vx: dir.x*XBOW.speed, vy: dir.y*XBOW.speed, vz: dir.z*XBOW.speed,
      bounces: d.ric ? 1 : 0, life: 5 });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    console.log(`[-] ${player.name} left (${players.size} online)`);
  });
});
function normalize(x, y, z) { const l = Math.hypot(x, y, z) || 1; return { x:x/l, y:y/l, z:z/l }; }

/* Arrow impact: big direct hit, then it burns for 9s. */
function igniteTarget(hit, byId, now) {
  const t = hit.ref, isPlayer = hit.kind === 'player';
  t.hp -= XBOW.dmg;
  t.burnUntil = now + XBOW.burnMs; t.burnNext = now + 1000; t.burnBy = byId;
  t.burnRate = XBOW.burnDps;
  const shooter = players.get(byId);
  io.emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false, fire:true });
  dropFire(t.x, t.y || 0, t.z, byId, now);         // pool at their feet
  if (t.hp <= 0 && t.alive) {
    eliminate(t, isPlayer);
    if (shooter) shooter.kills++;
    if (isPlayer) t.deaths++;
    io.emit('kill', { by: shooter ? shooter.name : 'fire', victim: isPlayer ? t.name : 'a bot', head:false });
  }
}

/* ------------------------------- Game loop -------------------------------- */
const TICK = 1000 / 30;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;

  /* ---- Match flow: waiting -> live -> intermission -> ... -> over ---- */
  const livePlayers = [...players.values()];
  const standing = livePlayers.filter(p => p.alive);
  if (match.phase === 'waiting') {
    if (livePlayers.length >= MATCH.minPlayers) {
      // straight into a buy window, not into a round — you start with money
      // and no gun, so you need a chance to spend it before round 1
      resetEconomy();
      match.round = 0; match.roundWinner = null; match.matchWinner = null;
      openBuyWindow(now, MATCH.prepMs);
    }
  } else if (livePlayers.length < MATCH.minPlayers) {
    match.phase = 'waiting'; match.round = 0;
    match.roundWinner = null; match.matchWinner = null;
    respawnAll();                                  // free roam until someone joins
  } else if (match.phase === 'live') {
    if (standing.length <= 1) {
      const w = standing[0] || null;               // nobody standing = a draw
      if (w) w.wins = (w.wins || 0) + 1;
      // payday: the round winner banks more, but losing still pays
      for (const p of players.values()) p.money += (p === w ? ECON.win : ECON.loss);
      match.roundWinner = w ? w.id : null;
      if (w && w.wins >= MATCH.winsNeeded) {
        match.phase = 'over'; match.matchWinner = w.id; match.until = now + MATCH.endMs;
      } else {
        match.phase = 'intermission'; match.until = now + MATCH.prepMs;
      }
    }
  } else if (now >= match.until) {
    if (match.phase === 'intermission') startRound(match.round + 1, false);
    else {                                         // match over -> run it again
      resetEconomy();
      match.round = 0; match.roundWinner = null; match.matchWinner = null;
      openBuyWindow(now, MATCH.prepMs);
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
      (a.smoke ? dropSmoke : dropFire)(a.x, 0, a.z, a.by, now);
      arrows.splice(i, 1); continue;
    }
    a.vy -= 9 * dt;                                     // slight drop
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
      if (pl.alive && pl.id !== a.by) tryHit(pl.x, pl.z, pl.y||0, pl.st||0, { kind:'player', ref:pl });

    // nearest wall along this step, height-aware
    let wallT = Infinity, wn = null;
    for (const r of RAY_BOXES) {
      const h = rayBoxHit(o, dir, r);
      if (h && h.t < wallT && h.t <= stepLen) { wallT = h.t; wn = h; }
    }

    // where this bolt's payload lands
    const drop = (px, py, pz) => a.smoke ? dropSmoke(px, py, pz, a.by, now)
                                         : dropFire(px, py, pz, a.by, now);
    if (victim && hitT <= wallT) {                      // hit someone
      if (a.smoke) drop(victim.ref.x, victim.ref.y || 0, victim.ref.z);   // cover, not damage
      else igniteTarget(victim, a.by, now);
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
      io.emit('kill', { by: killer ? killer.name : 'fire', victim: isPlayer ? e.name : 'a bot', head:false });
    }
  };
  for (const pl of players.values()) burnTick(pl, true);


  // broadcast a snapshot of the whole world
  io.emit('snapshot', {
    t: now,
    prices: PRICES, mainSlots: MAIN_SLOTS, sideSlots: SIDE_SLOTS,
    maxMain: MAX_MAIN, maxSide: MAX_SIDE,
    match: { phase: match.phase, round: match.round, winsNeeded: MATCH.winsNeeded,
             endsIn: match.until ? Math.max(0, match.until - now) : 0,
             roundWinner: match.roundWinner, matchWinner: match.matchWinner },
    players: [...players.values()].map(p => ({ id:p.id, x:p.x, z:p.z, y:p.y, yaw:p.yaw, st:p.st, hp:p.hp, alive:p.alive, kills:p.kills, deaths:p.deaths, wins:p.wins||0, money:p.money,
      guns:p.guns,
      name:p.name, color:p.color,
      mk: (p.markedUntil > now) ? p.markedBy : null, rl: p.rl || 0,
      dT: p.detectTarget, dU: Math.max(0, p.detectUntil - now),
      dR: Math.max(0, p.detectReadyAt - now),
      bn: p.burnUntil > now })),      // on fire, so others can see it
    arrows: arrows.map(a => ({ id:a.id, x:a.x, y:a.y, z:a.z, vx:a.vx, vy:a.vy, vz:a.vz,
      sm: !!a.smoke })),      // smoke bolts render cold grey, not aflame
  });
}, TICK);

server.listen(PORT, () => console.log(`Bot Strike MP server on http://localhost:${PORT}`));
