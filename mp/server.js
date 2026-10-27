/* ============================================================================
   BOT STRIKE — Multiplayer server (authoritative-ish).
   - Serves the client from /public
   - Holds ONE shared world: all connected players + server-simulated bots
   - Players own their own movement (sent to the server); the server owns
     bots, all damage, deaths, respawns and the scoreboard.
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
RECTS.push(
  { minx:-ARENA-1, minz:-ARENA-1, maxx: ARENA+1, maxz:-ARENA+1, miny:0, maxy:WALL_H },   // north
  { minx:-ARENA-1, minz: ARENA-1, maxx: ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // south
  { minx:-ARENA-1, minz:-ARENA-1, maxx:-ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // west
  { minx: ARENA-1, minz:-ARENA-1, maxx: ARENA+1, maxz: ARENA+1, miny:0, maxy:WALL_H },   // east
);

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
const bots = [];
// Crossbow ability tuning (must match the client's WEAPONS entry)
// burnMs is how long a PERSON burns. The fire left on the ground is a
// client-side visual with its own (longer) lifetime — see GFIRE in the client.
const XBOW = { dmg: 90, burnDps: 6, burnMs: 5000, charges: 2, cooldownMs: 30000, speed: 62 };
// Smoke bolt: no damage. Anyone standing in the cloud is tagged for markMs,
// and the tag renews every tick they stay in it. Must match the client's
// SMOKEFX radius/top/markMs or the cloud you see won't match the one that tags.
const SMOKE = { charges: 2, cooldownMs: 30000, speed: 52, ms: 10000,
                radius: 5.5, top: 3.4, markMs: 4000 };
const smokes = [];   // { x, z, by, until }
// Blade melee (must match the client's BLADE entry)
const MELEE = { combo: [22,22,28,28,70], windowMs: 1600, rateMs: 320, reach: 3.4, arc: 0.5 };
const arrows = [];
let arrowSeq = 0;
const BOT_COUNT = 4;
let botSeq = 0;

function spawnBot() {
  const s = randomSpawn();
  bots.push({
    id: 'bot' + (botSeq++), x: s.x, z: s.z, yaw: 0,
    hp: 100, alive: true, speed: rand(3.2, 4.6),
    target: randomSpawn(), retargetAt: 0,
    lastShot: 0, fireRate: rand(600, 1100), damage: rand(6, 12), accuracy: rand(0.5, 0.75),
    state: 'patrol',
  });
}
for (let i = 0; i < BOT_COUNT; i++) spawnBot();

const COLORS = [0x27ff9e, 0x3ad0ff, 0xffd15a, 0xff7ac2, 0xb08bff, 0x8affc1, 0xff9a5a];

/* ------------------------------ Networking -------------------------------- */
io.on('connection', (socket) => {
  const s = randomSpawn();
  const player = {
    id: socket.id, x: s.x, z: s.z, y: 0, yaw: 0, pitch: 0, st: 0,
    hp: 100, alive: true, kills: 0, deaths: 0,
    color: COLORS[players.size % COLORS.length],
    name: 'Player-' + socket.id.slice(0, 4),
    respawnAt: 0,
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
    if (typeof d.name === 'string') p.name = d.name.slice(0, 16);
  });

  // Authoritative hit detection when a player fires.
  socket.on('fire', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
    const o = { x: d.ox, y: d.oy, z: d.oz };
    const dir = normalize(d.dx, d.dy, d.dz);
    const range = d.range || 220, dmg = d.dmg || 25;
    // broadcast a tracer so others see the shot
    socket.broadcast.emit('shot', { ox:o.x, oy:o.y, oz:o.z, dx:dir.x, dy:dir.y, dz:dir.z, len: range });

    // nearest wall blocks the bullet — in 3D, so shots pass over low cover
    let wall = Infinity;
    for (const r of RECTS) {
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
    for (const b of bots) if (b.alive) consider(b.x, b.z, 0, 0, { kind:'bot', ref:b });
    for (const other of players.values())
      if (other.alive && other.id !== p.id) consider(other.x, other.z, other.y || 0, other.st || 0, { kind:'player', ref:other });

    if (best.target) {
      const dealt = best.head ? dmg*2.5 : dmg;
      const tgt = best.target.ref;
      tgt.hp -= dealt;
      io.emit('impact', { x: o.x + dir.x*best.t, y: o.y + dir.y*best.t, z: o.z + dir.z*best.t, head: best.head });
      if (tgt.hp <= 0 && tgt.alive) {
        tgt.alive = false; tgt.hp = 0;
        p.kills++;
        if (best.target.kind === 'player') { tgt.deaths++; tgt.respawnAt = Date.now() + 3000; }
        io.emit('kill', { by: p.name, victim: best.target.kind === 'bot' ? 'a bot' : tgt.name, head: best.head });
      }
    }
  });

  // ---- Smoke bolt: same flight as an arrow, leaves a tagging cloud ----
  socket.on('smokebolt', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
    const now = Date.now();
    p.smokeShots = (p.smokeShots || []).filter(t => now - t < SMOKE.cooldownMs);
    if (p.smokeShots.length >= SMOKE.charges) return;
    p.smokeShots.push(now);
    const dir = normalize(d.dx, d.dy, d.dz);
    arrows.push({ id: 'a' + (arrowSeq++), by: socket.id, smoke: true,
      x: d.ox, y: d.oy, z: d.oz,
      vx: dir.x*SMOKE.speed, vy: dir.y*SMOKE.speed, vz: dir.z*SMOKE.speed,
      bounces: 0, life: 5 });
  });

  // ---- Blade: five-hit melee combo, validated server-side ----
  socket.on('melee', (d) => {
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
    for (const b of bots) if (b.alive) tryT(b.x, 1.1, b.z, { kind:'bot', ref:b });
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
      t.alive = false; t.hp = 0; t.burnUntil = 0; p.kills++;
      if (isPlayer) { t.deaths++; t.respawnAt = now + 3000; }
      io.emit('kill', { by: p.name, victim: isPlayer ? t.name : 'a bot', head: step === MELEE.combo.length-1 });
    }
  });

  // ---- Crossbow ability: launch a flaming arrow (server-simulated) ----
  socket.on('arrow', (d) => {
    const p = players.get(socket.id); if (!p || !p.alive) return;
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
  const shooter = players.get(byId);
  io.emit('impact', { x:t.x, y:(t.y||0)+1.1, z:t.z, head:false, fire:true });
  io.emit('groundfire', { x:t.x, z:t.z });          // pool at their feet
  if (t.hp <= 0 && t.alive) {
    t.alive = false; t.hp = 0; t.burnUntil = 0;
    if (shooter) shooter.kills++;
    if (isPlayer) { t.deaths++; t.respawnAt = now + 3000; }
    io.emit('kill', { by: shooter ? shooter.name : 'fire', victim: isPlayer ? t.name : 'a bot', head:false });
  }
}

/* ------------------------------- Game loop -------------------------------- */
const TICK = 1000 / 30;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;

  // respawn dead players
  for (const p of players.values()) {
    if (!p.alive && now >= p.respawnAt) { const s = randomSpawn(); p.x=s.x; p.z=s.z; p.hp=100; p.alive=true; }
  }

  // Bots are STATIONARY targets (target-practice): they don't move or shoot.
  // (They just stand there; being shot is handled in the 'fire' handler.)

  // ---- Flaming arrows: fly, bounce off geometry, ignite what they hit ----
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.life -= dt;
    if (a.life <= 0) { arrows.splice(i, 1); continue; }
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
    for (const b of bots) if (b.alive) tryHit(b.x, b.z, 0, 0, { kind:'bot', ref:b });
    for (const pl of players.values())
      if (pl.alive && pl.id !== a.by) tryHit(pl.x, pl.z, pl.y||0, pl.st||0, { kind:'player', ref:pl });

    // nearest wall along this step, height-aware
    let wallT = Infinity, wn = null;
    for (const r of RECTS) {
      const h = rayBoxHit(o, dir, r);
      if (h && h.t < wallT && h.t <= stepLen) { wallT = h.t; wn = h; }
    }

    // where this bolt's payload lands
    const drop = (px, pz) => {
      if (a.smoke) { smokes.push({ x:px, z:pz, by:a.by, until: now + SMOKE.ms });
                     io.emit('smoke', { x:px, z:pz, by:a.by }); }
      else io.emit('groundfire', { x:px, z:pz });
    };
    if (victim && hitT <= wallT) {                      // hit someone
      if (a.smoke) drop(victim.ref.x, victim.ref.z);    // cover, not damage
      else igniteTarget(victim, a.by, now);
      arrows.splice(i, 1); continue;
    }
    if (wn && wallT <= stepLen) {
      if (a.bounces > 0) {                              // RICOCHET: reflect once
        a.bounces--;
        a.x += dirx*wallT*0.98; a.z += dirz*wallT*0.98; a.y += diry*wallT*0.98;
        if (wn.axis === 0) a.vx = -a.vx; else if (wn.axis === 1) a.vy = -a.vy; else a.vz = -a.vz;
        a.vx *= 0.85; a.vy *= 0.85; a.vz *= 0.85;
        continue;
      }
      drop(a.x + dirx*wallT, a.z + dirz*wallT);
      arrows.splice(i, 1); continue;                    // stick in the wall
    }
    a.x = nx; a.y = ny; a.z = nz;
    if (a.y < 0) { drop(a.x, a.z); arrows.splice(i, 1); }        // hit the ground
  }

  // ---- Smoke clouds: expire, and tag whoever is standing in one ----
  for (let i = smokes.length - 1; i >= 0; i--) if (smokes[i].until <= now) smokes.splice(i, 1);
  for (const pl of players.values()) {
    if (!pl.alive) { pl.markedUntil = 0; pl.markedBy = null; continue; }
    for (const sm of smokes) {
      if (sm.by === pl.id) continue;                    // your own smoke won't tag you
      if ((pl.y || 0) > SMOKE.top) continue;            // above the cloud, e.g. on a crate
      if (Math.hypot(pl.x - sm.x, pl.z - sm.z) > SMOKE.radius) continue;
      pl.markedUntil = now + SMOKE.markMs;              // renews while they stay in
      pl.markedBy = sm.by;
      break;
    }
    if (pl.markedUntil && pl.markedUntil <= now) { pl.markedUntil = 0; pl.markedBy = null; }
  }

  // ---- Burn damage over time ----
  const burnTick = (e, isPlayer) => {
    if (!e.burnUntil || !e.alive) return;
    if (now > e.burnUntil) { e.burnUntil = 0; return; }
    if (now < (e.burnNext || 0)) return;
    e.burnNext = now + 1000;
    e.hp -= XBOW.burnDps;
    if (e.hp <= 0 && e.alive) {
      e.alive = false; e.hp = 0; e.burnUntil = 0;
      const killer = players.get(e.burnBy);
      if (killer) killer.kills++;
      if (isPlayer) { e.deaths++; e.respawnAt = now + 3000; }
      io.emit('kill', { by: killer ? killer.name : 'fire', victim: isPlayer ? e.name : 'a bot', head:false });
    }
  };
  for (const b of bots) burnTick(b, false);
  for (const pl of players.values()) burnTick(pl, true);

  // respawn dead bots to keep the count constant
  for (let i = bots.length - 1; i >= 0; i--) if (!bots[i].alive) { bots.splice(i, 1); setTimeout(spawnBot, 2500); }

  // broadcast a snapshot of the whole world
  io.emit('snapshot', {
    t: now,
    players: [...players.values()].map(p => ({ id:p.id, x:p.x, z:p.z, y:p.y, yaw:p.yaw, st:p.st, hp:p.hp, alive:p.alive, kills:p.kills, deaths:p.deaths, name:p.name, color:p.color,
      mk: (p.markedUntil > now) ? p.markedBy : null })),
    bots: bots.map(b => ({ id:b.id, x:b.x, z:b.z, yaw:b.yaw, alive:b.alive, state:b.state, burning: !!b.burnUntil })),
    arrows: arrows.map(a => ({ id:a.id, x:a.x, y:a.y, z:a.z, vx:a.vx, vy:a.vy, vz:a.vz })),
  });
}, TICK);

server.listen(PORT, () => console.log(`Bot Strike MP server on http://localhost:${PORT}`));
