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
/* Must match the client's arena. Obstacles are treated as full-height 2D
   rectangles for line-of-sight, bullets and movement (simple + good enough). */
const ARENA = 60;
const LAYOUT = [ // [x, z, w, d]
  [0,0,6,6],
  [-18,-12,4,4],[18,-12,4,4],[-18,12,4,4],[18,12,4,4],
  [0,-24,12,2],[0,24,12,2],[-30,0,2,12],[30,0,2,12],
  [-10,-30,3,3],[10,30,3,3],[-34,-30,5,5],[34,30,5,5],
  [24,-28,3,3],[-24,28,3,3],[12,8,2.5,2.5],[-12,-8,2.5,2.5],
];
// Rectangles as {minx,minz,maxx,maxz}
const RECTS = LAYOUT.map(([x,z,w,d]) => ({ minx:x-w/2, minz:z-d/2, maxx:x+w/2, maxz:z+d/2 }));

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
    id: socket.id, x: s.x, z: s.z, y: 0, yaw: 0, pitch: 0,
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

    // nearest wall blocks the bullet
    let wall = Infinity;
    for (const r of RECTS) wall = Math.min(wall, segRectDist(o.x, o.z, o.x + dir.x*range, o.z + dir.z*range, r));

    let best = { t: Math.min(wall, range), target: null, head: false };
    // baseY lets us model targets standing on crates (players send their feet height)
    const consider = (cx, cz, baseY, hitApply) => {
      const body = raySphere(o, dir, cx, baseY + 1.05, cz, 0.55);
      const head = raySphere(o, dir, cx, baseY + 1.70, cz, 0.30);
      let t = Infinity, hs = false;
      if (head < t) { t = head; hs = true; }
      if (body < t) { t = body; hs = false; }
      if (t < best.t) best = { t, target: hitApply, head: hs };
    };
    for (const b of bots) if (b.alive) consider(b.x, b.z, 0, { kind:'bot', ref:b });
    for (const other of players.values())
      if (other.alive && other.id !== p.id) consider(other.x, other.z, other.y || 0, { kind:'player', ref:other });

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

  socket.on('disconnect', () => {
    players.delete(socket.id);
    console.log(`[-] ${player.name} left (${players.size} online)`);
  });
});
function normalize(x, y, z) { const l = Math.hypot(x, y, z) || 1; return { x:x/l, y:y/l, z:z/l }; }

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

  // respawn dead bots to keep the count constant
  for (let i = bots.length - 1; i >= 0; i--) if (!bots[i].alive) { bots.splice(i, 1); setTimeout(spawnBot, 2500); }

  // broadcast a snapshot of the whole world
  io.emit('snapshot', {
    t: now,
    players: [...players.values()].map(p => ({ id:p.id, x:p.x, z:p.z, y:p.y, yaw:p.yaw, hp:p.hp, alive:p.alive, kills:p.kills, deaths:p.deaths, name:p.name, color:p.color })),
    bots: bots.map(b => ({ id:b.id, x:b.x, z:b.z, yaw:b.yaw, alive:b.alive, state:b.state })),
  });
}, TICK);

server.listen(PORT, () => console.log(`Bot Strike MP server on http://localhost:${PORT}`));
