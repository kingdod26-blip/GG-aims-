/* =============================================================
   Crimson X — robots.js  (unnumbered: loads right after maps.js)

   SILVARS' ROBOTS: the sensor (V), the drone (G) and the dog (X).
   Designed 2026-11-27 with Jack (PLAN-characters.md); the drone and dog
   look and behave after Saltline's Gull and Hound, Crimson X's own
   versions, silver with crimson trim.

   Like maps.js this file is pure logic: no THREE, no document. The
   server REQUIRES it and runs it for every room; the browser loads it
   and runs the very same code on the practice range. One copy of the
   rules, so the range cannot teach you a robot the match does not have.

   Everything that touches the world goes through a small adapter `W`
   that each side builds (server.js `robotWorld`, session.js
   `localRobotWorld`):
     W.G                 robotGeo(map): collision for flying, rays, the
                         dog's ground grid
     W.now               ms
     W.owner(id)         { x, y, z, yaw, alive } or null
     W.enemies(ownerId)  [{ id, x, y, z, st, alive }]   who it may hurt
     W.known(ownerId)    Map id -> until: Linked Sight, what the team sees
     W.reveal(ownerId, id)          put someone in Linked Sight
     W.hurt(robot, target, dmg, how)   damage, credited to the owner
     W.fx(kind, data)    something to see or hear (shots, beeps, crashes)
     W.gone(robot, why)  a robot has been removed ('destroyed' / 'crash' / 'owner')
   ============================================================= */

const SILV = {
  /* Linked Sight: an enemy seen by Silvars or any of his robots is shown
     to him, with a health bar over the head, for `linkMs`. */
  linkMs: 2000,
  /* Only his ROBOTS light someone up for him, never his own eyes; and once
     they have, Linked Sight is spent for `linkCdMs` (Jack, 2026-11-27). The
     robots still share what they (and he) see with each other, cooldown or
     not: that is how the drone knows whom to hunt. */
  linkCdMs: 20000,
  sight: 45,               // how far a robot (or Silvars) can see someone
  coneCos: Math.cos(100 * Math.PI / 180),   // robots: a 200-degree cone, as Saltline's
  ownCos: Math.cos(50 * Math.PI / 180),     // Silvars himself: what is on his screen, roughly
  /* V. Placed by hand on a surface (within `reach`), it sits proud of it
     and is visible to everyone. It scans only when someone walks into its
     radius, then needs `rescanMs` before it can trigger again; placing a
     new one is on `cdMs`, per charge (Jack, 2026-11-27: two of them).
     Any damage destroys it. */
  /* Two charges, each back 30s after it is used, like the grenade's; two
     can be out at once, and placing a third takes the oldest away. */
  sensor: { charges: 2, maxOut: 2, cdMs: 30000, rescanMs: 30000, radius: 8, reach: 2.6, hp: 1, r: 0.16 },
  /* G. One drone at a time, 60 HP. It hunts what the team can see; once it
     has had its own eyes on someone for `lockMs` it dives, hits for `dmg`
     and is destroyed by the crash. The cooldown starts when it is SENT. */
  drone: { lifeMs: 20000, cdMs: 40000, hp: 60, dmg: 40, lockMs: 1000, speed: 9, diveSpeed: 22, diveMs: 2200,
           lockRange: 22, standOff: 9, alt: 3.2, hitR: 0.95, r: 0.5, follow: 2.6 },
  /* X. The dog, 200 HP, until it is destroyed; then `cdMs`. It stays within
     `leash` of Silvars. Released, it RUNS `runDist` the way he faces and
     pounces on anyone it meets; after that it follows, shoots (`gunDmg`
     every `gunMs` out to `gunRange`, with a `teleMs` warning first) and
     bites anyone who comes close. Speed is sprint speed: Saltline's Hound
     runs 4.5, slower than our walk, which could never keep up. */
  /* ORDERS (Jack, 2026-11-27): pressing X (dog) or G (drone) again while it
     is out sends it to the spot you aim at, up to `orderRange` from you, to
     GUARD it: it stays there and fights anyone who comes near (the dog
     within `guardLeash` of the spot). An order at your own feet (within
     `recallR`) calls it back; so does walking more than `orderRange` from
     the spot. */
  order: { range: 20, recallR: 3 },
  /* The dog is 50 HP behind a 40 shield (Jack, 2026-11-28). The shield takes
     every hit first, and a hit bigger than what is left of it (a sniper
     round) only breaks the shield: nothing carries through, so no single
     shot kills the dog. */
  dog: { lifeMs: 120000, cdMs: 70000, hp: 50, shield: 40, leash: 15, guardLeash: 8, speed: 8.4, gunDmg: 10, gunMs: 500, gunRange: 20,
         spread: 0.045, teleMs: 400, bite: 25, biteRange: 2.1, biteMs: 1200, lunge: 0.28,
         runDist: 10, runSpeed: 9.5, pounceR: 3.5, r: 0.5, eye: 0.75, follow: 2.4 },
};

/* SALVO (Jack, 2026-11-28; PLAN-characters.md section 4): the fire-and-
   explosives agent, after Delta Force's Uluru. Lives here, not in server.js
   or the client, because both sides need the same numbers and this is the
   one file both load.
   - passive: `blastMul` of all fire and explosive damage reaches him.
   - G: the composite incendiary. Bursts on its first impact into a fire pool
     stronger than Aseed's (`pool`); right-click makes it a frag with a 1s fuse.
   - V: a shell barrage, aimed and pressed: `warnMs` of warning, then
     `shells` shells at random in `radius` over `spanMs`, up to `dmg` each.
   - X: a missile he flies through its own camera for up to `lifeMs`; on
     impact `dmg`, then `bomblets` smaller blasts around it. It is a robot
     (kind 'missile') so the gun code that hits Silvars' drone hits it too:
     `hp` is a few rifle hits. */
const SALVO = {
  blastMul: 0.25,
  incen: { charges: 2, cdMs: 30000, speed: 17, fragFuseMs: 1000, maxFuseMs: 4000,
           pool: { radius: 5.5, ms: 12000, dps: 26, lingerDps: 8, lingerMs: 6000 } },
  frag: { radius: 8, full: 2, dmg: 90, fx: 1.45 },   // wider than Blast's (5.5); fx scales the explosion to match
  barrage: { range: 60, cdMs: 50000, warnMs: 2000, spanMs: 3000, shells: 6, radius: 10,
             blast: { radius: 4.5, full: 1.2, dmg: 60 } },
  missile: { cdMs: 60000, lifeMs: 8000, speed: 22, boost: 2.5, boostAcc: 40, turn: 2.2,   // boost: W while flying it, up to speed x boost hp: 40, r: 0.4,
             blast: { radius: 4.5, full: 1.2, dmg: 75 },
             bomblets: 4, spread: 2.6, bombletMs: 350, bomb: { radius: 2.8, full: 0.6, dmg: 25 } },
};
/* Damage from a blast at distance d: full inside `full`, linear to nothing
   at `radius`. Shared so the range and the match cannot disagree. */
function blastDamage(cfg, d){
  if (d >= cfg.radius) return 0;
  if (d <= cfg.full) return cfg.dmg;
  return Math.round(cfg.dmg * (1 - (d - cfg.full) / (cfg.radius - cfg.full)));
}

/* TxF, THE HIDDEN AGENT (Jack, 2026-11-28; PLAN-characters.md section 7).
   Summoned only by a secret code in the CALLSIGN box, typed every time.
   One per room. Numbers shared by the server and the range, like SALVO.
   - passive: flies (double-tap Space), `hp` 500, no fall damage.
   - V: a laser held down the crosshair: `dps` to `range`, walls stop it,
     `heatMs` of firing then an overheat that takes `coolMs` to clear.
   - G: teleport, aimed and pressed, up to `range`; 2 charges.
   - X: a pulse: everyone within `radius` takes `dmg` and is shown to him
     through walls for `showMs`. */
const TXF = {
  hp: 500,
  fly: { speed: 12, fast: 18, up: 8, accel: 10 },
  laser: { dps: 300, range: 120, heatMs: 4000, coolMs: 6000, tickMs: 50 },
  tele: { range: 200, charges: 2, cdMs: 8000 },
  pulse: { radius: 200, dmg: 40, showMs: 8000, cdMs: 25000 },
  /* HIS OWN WEAPONS (Jack, 2026-11-28): TxF carries no normal gun and no
     blade. 1 the minigun: spins up, then 20 a round at 20 a second; no
     magazine, it overheats after heatMs of firing and takes coolMs.
     2 the missile: 200 at the centre falling to nothing at 75m, walls
     block it, he is immune to his own; 3 charges, 20s each. */
  mg: { dmg: 20, rateMs: 50, spinMs: 400, heatMs: 6000, coolMs: 3000, range: 300, spread: 0.05, adsSpread: 0.012, recoil: 0.0035 },
  /* 3 INFERNO (Jack's HP210 picture): a fire shotgun. One cone of fire a
     shot: `dmg` inside `full`, falling to nothing at `range`, inside a cone
     of `cone` radians each side; walls block it. It sets the target burning
     at `burnDps` for `burnMs`. `rateMs` between shots, `mag` then `reloadMs`. */
  inferno: { dmg: 120, full: 7, range: 20, cone: 0.22, burnDps: 8, burnMs: 4000, rateMs: 200, mag: 20, reloadMs: 2500 },   // 300 RPM semi-auto, 20m, 20 a magazine (Jack)
  /* F ARC BLADES (Jack's picture): twin energy blades. Left-click slashes
     for `dmg` within `reach` (the sword's arc and pace); right-click lets
     the lightning out in a `burstR` burst round him for `burstDmg`, then
     `burstCdMs`. Walls block the burst. */
  arc: { dmg: 50, reach: 5, arc: 0.55,   // reach 3.5 -> 5 with the longer blades (Jack, 2026-11-29)
          rateMs: 360, burstR: 4, burstDmg: 80, burstCdMs: 8000,
          /* THE THREE-HIT COMBO (Jack's storyboard, 2026-11-29). Left-click walks
             the chain; stop for windowMs and it starts again. `ms` is how long
             that swing takes before the next may start; `arc` the cosine of
             its half-width (smaller is wider); `lunge` a step forward in s at
             dash speed; `cleave` hits everyone in the arc, not just the
             nearest. No swing explodes: the blast is the right-click's alone. */
          combo: [
            { id: 'cross',    dmg: 40, reach: 5,   arc: 0.55, ms: 300, lunge: 0.12 },   // 01 Cross Cut: fast forehand diagonal, steps you in
            { id: 'sweep',    dmg: 55, reach: 5,   arc: 0.15, ms: 380, cleave: true }, // 02 Pivot Sweep: wide backhand, low to high, both blades through all in front
            { id: 'overhead', dmg: 90, reach: 5.5, arc: 0.80, ms: 560 },               // 03 Overhead Finisher: both hands, straight down
          ],
          windowMs: 1200,
          knock: 3 },                          // the right-click shockwave throws everyone it hits this far back
  missile: { charges: 3, cdMs: 20000, speed: 45, lifeMs: 6000, r: 0.35,
             blast: { radius: 75, full: 6, dmg: 200 } },   // 75m (Jack: 75% of the first 100m)
};
/* The code is never written down anywhere in the game: only a hash of it.
   Spaces, emoji variation marks and letter case do not matter, and the
   danger sign may go first or last. */
const TXF_HASHES = ['2dq6mkd6ga0', 'ktk1gcs6zc'];
function txfHash(str){
  let h1 = 0xdeadbeef ^ 0x7f1, h2 = 0x41c6ce57 ^ 0x7f1;
  for (let i = 0, ch; i < str.length; i++){ ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function txfCodeOk(s){
  if (typeof s !== 'string' || s.length > 32) return false;
  const n = s.normalize('NFC').replace(/[\s️︎]/g, '').toLowerCase();
  return TXF_HASHES.includes(txfHash(n));
}

/* ---------------------------------------------------------------
   Geometry. Built once per map and cached, on either side.
   `move` stops a flying body (glass and rails too), `ray` stops a shot
   or a look (glass and rails let them through, the roof does not).
   --------------------------------------------------------------- */
const ROBOT_GEO = {};
function robotGeo(map){
  if (ROBOT_GEO[map.id]) return ROBOT_GEO[map.id];
  /* the browser has maps.js's functions as globals; Node asks for them */
  const M = (typeof mapRects !== 'undefined')
    ? { mapRects, mapWallRects, mapRoofRects, mapCeilingRect, mapRoofY } : require('./maps.js');
  const move = M.mapRects(map).concat(M.mapWallRects(map));
  const ray = move.filter(r => !r.glass).concat(M.mapRoofRects(map), [M.mapCeilingRect(map)]);
  const a = map.arena + 2;
  const G = { id: map.id, arena: map.arena, move, ray, all: move.concat(M.mapRoofRects(map), [M.mapCeilingRect(map)]),
              roofY: M.mapRoofY(map), stamp: 1 };
  /* a coarse 2D bucket grid over both lists, so a ray only tests the boxes
     in the cells it passes through rather than all two thousand */
  const CELL = 8, N = Math.ceil(2 * a / CELL);
  G.cell = CELL; G.n = N; G.o = -a;
  const buckets = list => {
    const b = Array.from({ length: N * N }, () => []);
    list.forEach((r, i) => {
      const x0 = Math.max(0, Math.floor((r.minx - G.o) / CELL)), x1 = Math.min(N - 1, Math.floor((r.maxx - G.o) / CELL));
      const z0 = Math.max(0, Math.floor((r.minz - G.o) / CELL)), z1 = Math.min(N - 1, Math.floor((r.maxz - G.o) / CELL));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) b[z * N + x].push(i);
    });
    return b;
  };
  G.rayB = buckets(G.ray); G.allB = buckets(G.all);
  G.rayMark = new Uint32Array(G.ray.length); G.allMark = new Uint32Array(G.all.length);
  /* The dog's ground: a grid of cells a body 0.4m round can stand in at
     floor level. Anything that reaches below 0.85m and above 0.3m blocks
     (a stair's first tread does not; a slab overhead does not). */
  const GC = 0.75, GN = Math.ceil(2 * a / GC), R = 0.4;
  const grid = new Uint8Array(GN * GN);
  for (const r of move) {
    if (r.miny > 0.85 || r.maxy < 0.3) continue;
    const x0 = Math.max(0, Math.floor((r.minx - R - G.o) / GC)), x1 = Math.min(GN - 1, Math.floor((r.maxx + R - G.o) / GC));
    const z0 = Math.max(0, Math.floor((r.minz - R - G.o) / GC)), z1 = Math.min(GN - 1, Math.floor((r.maxz + R - G.o) / GC));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * GN + x] = 1;
  }
  G.gc = GC; G.gn = GN; G.grid = grid;
  return (ROBOT_GEO[map.id] = G);
}

/* slab test: entry t along a ray, the face's axis, or null */
function robotRayBox(ox, oy, oz, dx, dy, dz, r){
  let t0 = -Infinity, t1 = Infinity, axis = -1;
  const P = [ox, oy, oz], D = [dx, dy, dz], MN = [r.minx, r.miny, r.minz], MX = [r.maxx, r.maxy, r.maxz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(D[k]) < 1e-9) { if (P[k] < MN[k] || P[k] > MX[k]) return null; continue; }
    let a = (MN[k] - P[k]) / D[k], b = (MX[k] - P[k]) / D[k];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) { t0 = a; axis = k; }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return { t: Math.max(0, t0), axis, inside: t0 < 0 };
}
/* Nearest hit along o + dir*t for t in (0, maxT], against `which` ('ray'
   or 'all'). Returns { t, axis, nx, ny, nz } or null. */
function robotRay(G, ox, oy, oz, dx, dy, dz, maxT, which){
  const list = which === 'all' ? G.all : G.ray, B = which === 'all' ? G.allB : G.rayB;
  const mark = which === 'all' ? G.allMark : G.rayMark;
  const stamp = (G.stamp = (G.stamp + 1) >>> 0) || (G.stamp = 1);
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const cx0 = Math.max(0, Math.floor((Math.min(ox, ex) - G.o) / G.cell)), cx1 = Math.min(G.n - 1, Math.floor((Math.max(ox, ex) - G.o) / G.cell));
  const cz0 = Math.max(0, Math.floor((Math.min(oz, ez) - G.o) / G.cell)), cz1 = Math.min(G.n - 1, Math.floor((Math.max(oz, ez) - G.o) / G.cell));
  let best = null;
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    for (const i of B[cz * G.n + cx]) {
      if (mark[i] === stamp) continue; mark[i] = stamp;
      const h = robotRayBox(ox, oy, oz, dx, dy, dz, list[i]);
      if (!h || h.inside || h.t > maxT || h.t < 1e-4) continue;
      if (!best || h.t < best.t) best = h;
    }
  }
  if (!best) return null;
  const s = [dx, dy, dz][best.axis] > 0 ? -1 : 1;
  best.nx = best.axis === 0 ? s : 0; best.ny = best.axis === 1 ? s : 0; best.nz = best.axis === 2 ? s : 0;
  return best;
}
/* Can a look (or a shot) get from a to b? */
function robotLos(G, ax, ay, az, bx, by, bz){
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 0.05) return true;
  const h = robotRay(G, ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, 'ray');
  return !h;
}
/* A target's chest, and whether it is still a target. */
const robotChestY = e => (e.y || 0) + ([1.1, 0.75, 0.35][e.st | 0] || 1.1);
const robotBodyTop = e => (e.y || 0) + ([1.8, 1.15, 0.7][e.st | 0] || 1.8);

/* ---------------------------------------------------------------
   The dog's ground: A* on the grid, then string-pulled.
   --------------------------------------------------------------- */
function gridCell(G, x, z){ return [Math.floor((x - G.o) / G.gc), Math.floor((z - G.o) / G.gc)]; }
function gridFree(G, cx, cz){ return cx >= 0 && cz >= 0 && cx < G.gn && cz < G.gn && !G.grid[cz * G.gn + cx]; }
function gridNearestFree(G, cx, cz, maxR){
  if (gridFree(G, cx, cz)) return [cx, cz];
  for (let r = 1; r <= (maxR || 6); r++)
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (gridFree(G, cx + dx, cz + dz)) return [cx + dx, cz + dz];
    }
  return null;
}
function gridLine(G, ax, az, bx, bz){        // every cell on the way is free (a supercover walk)
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (G.gc * 0.4)) + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, c = gridCell(G, ax + (bx - ax) * t, az + (bz - az) * t);
    if (!gridFree(G, c[0], c[1])) return false;
  }
  return true;
}
function gridPath(G, sx, sz, gx, gz, maxNodes){
  const s = gridNearestFree(G, ...gridCell(G, sx, sz), 3), g = gridNearestFree(G, ...gridCell(G, gx, gz), 8);
  if (!s || !g) return null;
  const N = G.gn, start = s[1] * N + s[0], goal = g[1] * N + g[0];
  if (start === goal) return [[gx, gz]];
  const open = [], came = new Map(), gs = new Map([[start, 0]]), closed = new Set();
  const hx = i => { const x = i % N, z = (i / N) | 0; return Math.hypot(x - g[0], z - g[1]); };
  const push = (i, f) => { open.push([f, i]); let k = open.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0], last = open.pop();
    if (open.length) { open[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } }
    return top; };
  push(start, hx(start));
  let n = 0, found = false;
  while (open.length && n++ < (maxNodes || 5000)) {
    const [, cur] = pop();
    if (cur === goal) { found = true; break; }
    if (closed.has(cur)) continue; closed.add(cur);
    const cx = cur % N, cz = (cur / N) | 0, gc = gs.get(cur);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!gridFree(G, nx, nz)) continue;
      if (dx && dz && (!gridFree(G, cx + dx, cz) || !gridFree(G, cx, cz + dz))) continue;   // no corner cutting
      const ni = nz * N + nx, ng = gc + (dx && dz ? 1.4142 : 1);
      if (ng < (gs.has(ni) ? gs.get(ni) : Infinity)) { gs.set(ni, ng); came.set(ni, cur); push(ni, ng + hx(ni)); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = goal; c !== undefined && c !== start; c = came.get(c)) cells.push(c);
  cells.reverse();
  const pts = cells.map(c => [G.o + ((c % N) + 0.5) * G.gc, G.o + (((c / N) | 0) + 0.5) * G.gc]);
  pts[pts.length - 1] = [gx, gz];
  // string-pull: from each kept point, skip ahead to the furthest one in a straight free line
  const out = []; let from = [sx, sz], i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !gridLine(G, from[0], from[1], pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); from = pts[j]; i = j + 1;
  }
  return out;
}

/* ---------------------------------------------------------------
   Making and breaking robots
   --------------------------------------------------------------- */
let robotSeq = 0;
function makeRobot(kind, owner, x, y, z, extra){
  const S = SILV[kind] || SALVO[kind];
  return Object.assign({ id: (robotSeq = (robotSeq + 1) & 0xffff), kind, owner, x, y, z, vx: 0, vy: 0, vz: 0,
                         yaw: 0, hp: S.hp, maxHp: S.hp, shield: S.shield || 0, state: 'idle', t: 0, lock: 0, alive: true }, extra || {});
}
/* Is this robot hit by a ray? Returns t or Infinity. */
function robotHitT(r, ox, oy, oz, dx, dy, dz){
  const c = r.kind === 'dog' ? [r.x, (r.y || 0) + 0.55, r.z, 0.55]
          : r.kind === 'drone' ? [r.x, r.y, r.z, 0.55]
          : r.kind === 'missile' ? [r.x, r.y, r.z, SALVO.missile.r + 0.15]
          : [r.x, r.y, r.z, 0.22];
  const lx = c[0] - ox, ly = c[1] - oy, lz = c[2] - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > c[3] * c[3]) return Infinity;
  const t = tca - Math.sqrt(c[3] * c[3] - d2);
  return t >= 0 ? t : (tca >= 0 ? 0 : Infinity);
}
function robotCenterY(r){ return r.kind === 'dog' ? (r.y || 0) + 0.55 : r.y; }
/* Damage to a robot. Returns true when that destroyed it. */
function damageRobot(r, dmg){
  if (!r.alive) return false;
  if (r.shield > 0) { r.shield = Math.max(0, r.shield - dmg); return false; }   // the shield eats the whole hit
  r.hp -= dmg;
  if (r.hp <= 0) { r.hp = 0; r.alive = false; r.why = 'destroyed'; return true; }
  return false;
}

/* ---------------------------------------------------------------
   Seeing
   --------------------------------------------------------------- */
function robotSees(W, r, e, eyeY, fwdX, fwdZ, cos){
  const ey = robotChestY(e), dx = e.x - r.x, dz = e.z - r.z, dy = ey - eyeY, d = Math.hypot(dx, dy, dz);
  if (d > SILV.sight) return false;
  // within 6m it notices you whichever way it faces
  if (fwdX !== undefined && d > 6) { const h = Math.hypot(dx, dz) || 1; if ((dx * fwdX + dz * fwdZ) / h < cos) return false; }
  return robotLos(W.G, r.x, eyeY, r.z, e.x, ey, e.z) || robotLos(W.G, r.x, eyeY, r.z, e.x, robotBodyTop(e) - 0.15, e.z);
}
/* The live enemy this robot should be after: one IT can see first, then the
   nearest the team can see (Linked Sight). */
function robotPick(W, r, enemies, eyeY, maxFromOwner, owner){
  const known = W.known(r.owner);
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (maxFromOwner && owner && Math.hypot(e.x - owner.x, e.z - owner.z) > maxFromOwner) continue;
    const own = r.seen && r.seen.has(e.id);
    const kn = own || (known.get(e.id) || 0) > W.now;
    if (!kn) continue;
    const d = Math.hypot(e.x - r.x, (e.y || 0) - (r.y || 0), e.z - r.z) - (own ? 1000 : 0);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/* ---------------------------------------------------------------
   One tick for every robot in `list` (removes the dead).
   --------------------------------------------------------------- */
function stepRobots(W, list, dt){
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    const owner = W.owner(r.owner);
    if (!owner || !owner.alive) { r.alive = false; r.why = 'owner'; }
    if (r.alive) {
      const enemies = W.enemies(r.owner);
      if (r.kind === 'sensor') stepSensor(W, r, enemies);
      else if (r.kind === 'drone') stepDrone(W, r, owner, enemies, dt);
      else if (r.kind === 'dog') stepDog(W, r, owner, enemies, dt);
      /* Salvo's missile is flown by its owner (the client sends where it is);
         here it only ages, and runs out of fuel at lifeMs */
      else if (r.kind === 'missile'){ r.t += dt * 1000; if (r.t >= SALVO.missile.lifeMs){ r.alive = false; r.why = 'expired'; } }
    }
    if (!r.alive) { list.splice(i, 1); W.gone(r, r.why || 'destroyed'); }
  }
}

function stepSensor(W, r, enemies){
  if (W.now < (r.readyAt || 0)) return;
  const R = SILV.sensor.radius;
  let hit = false;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.x - r.x, robotChestY(e) - r.y, e.z - r.z) > R) continue;
    if (!robotLos(W.G, r.x + r.nx * 0.2, r.y + r.ny * 0.2, r.z + r.nz * 0.2, e.x, robotChestY(e), e.z)) continue;
    W.reveal(r.owner, e.id); hit = true;
  }
  if (hit) {
    r.readyAt = W.now + SILV.sensor.rescanMs; r.pinged = W.now;
    W.fx('beep', { x: r.x, y: r.y, z: r.z, id: r.id });
  }
}

/* Fly toward (gx, gy, gz) at up to `spd`, never through anything solid. */
function droneFly(W, r, gx, gy, gz, spd, dt){
  const dx = gx - r.x, dy = gy - r.y, dz = gz - r.z, d = Math.hypot(dx, dy, dz);
  const want = Math.min(spd, d * 2.2);
  const tx = d > 0.01 ? dx / d * want : 0, ty = d > 0.01 ? dy / d * want : 0, tz = d > 0.01 ? dz / d * want : 0;
  const k = 1 - Math.exp(-6 * dt);                      // eases in and out, like the Gull
  r.vx += (tx - r.vx) * k; r.vy += (ty - r.vy) * k; r.vz += (tz - r.vz) * k;
  const sx = r.vx * dt, sy = r.vy * dt, sz = r.vz * dt, len = Math.hypot(sx, sy, sz);
  if (len < 1e-5) return true;
  const h = robotRay(W.G, r.x, r.y, r.z, sx / len, sy / len, sz / len, len + SILV.drone.r, 'all');
  if (!h) { r.x += sx; r.y += sy; r.z += sz; r.stuck = 0; return true; }
  // blocked: slide along the face it met, and lift over it if that is what is in the way
  if (h.axis !== 0) r.x += sx; if (h.axis !== 1) r.y += sy; if (h.axis !== 2) r.z += sz;
  if (h.axis === 0) r.vx = 0; else if (h.axis === 1) r.vy = 0; else r.vz = 0;
  r.stuck = (r.stuck || 0) + dt;
  if (r.stuck > 0.4 && !robotRay(W.G, r.x, r.y, r.z, 0, 1, 0, 1.2, 'all')) r.y += Math.min(4, spd) * dt;
  return false;
}

function stepDrone(W, r, owner, enemies, dt){
  const D = SILV.drone;
  r.t += dt * 1000;
  /* It lasts 20s (Jack, 2026-11-27), then powers down - unless it is already
     diving, which it finishes. The 40s starts when it is gone. */
  if (r.t >= D.lifeMs && r.state !== 'dive') { r.alive = false; r.why = 'expired'; return; }
  // what its own camera sees (the cone is about the way it is heading)
  const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
  r.seen = new Set();
  for (const e of enemies) if (e.alive && robotSees(W, r, e, r.y, fx, fz, SILV.coneCos)) { r.seen.add(e.id); W.reveal(r.owner, e.id); }

  if (r.state === 'dive') {
    const e = enemies.find(q => q.id === r.target && q.alive);
    if (e) { r.ax = e.x; r.ay = robotChestY(e); r.az = e.z; }
    const dx = r.ax - r.x, dy = r.ay - r.y, dz = r.az - r.z, d = Math.hypot(dx, dy, dz) || 1;
    r.vx = dx / d * D.diveSpeed; r.vy = dy / d * D.diveSpeed; r.vz = dz / d * D.diveSpeed;
    r.yaw = Math.atan2(-dx, -dz);
    const step = D.diveSpeed * dt;
    // reaching them is the hit; meeting a wall first is a crash with nothing to show for it
    const h = robotRay(W.G, r.x, r.y, r.z, dx / d, dy / d, dz / d, Math.min(step, d), 'all');
    if (e && d <= D.hitR + step && (!h || h.t >= d - D.hitR)) {
      W.hurt(r, e, D.dmg, 'drone');
      W.fx('crash', { x: e.x, y: robotChestY(e), z: e.z, id: r.id, hit: 1 });
      r.alive = false; r.why = 'crash'; return;
    }
    if (h || W.now - r.diveAt > D.diveMs || r.y < 0.2) {
      const t = h ? h.t : step;
      W.fx('crash', { x: r.x + dx / d * t, y: r.y + dy / d * t, z: r.z + dz / d * t, id: r.id, hit: 0 });
      r.alive = false; r.why = 'crash'; return;
    }
    r.x += dx / d * step; r.y += dy / d * step; r.z += dz / d * step;
    return;
  }

  guardCheck(r, owner);
  const e = robotPick(W, r, enemies, r.y);
  if (!e && r.guard) {
    /* guarding: hover over the spot, turning slowly to watch round it */
    r.state = 'guard'; r.lock = 0; r.target = null;
    droneFly(W, r, r.guard.x, (r.guard.y || 0) + D.alt + Math.sin(r.t / 600) * 0.15, r.guard.z, D.speed, dt);
    r.yaw += dt * 0.6;
    return;
  }
  if (!e) {
    /* Nothing to hunt: it hangs BEHIND Silvars, over his right shoulder
       (Jack, 2026-11-27, after trying an orbit: "just make it stay behind
       me"), and looks the way HE is looking rather than back at him. */
    r.state = 'follow'; r.lock = 0; r.target = null;
    const ox = owner.x + Math.cos(owner.yaw) * 1.2 + Math.sin(owner.yaw) * D.follow;
    const oz = owner.z - Math.sin(owner.yaw) * 1.2 + Math.cos(owner.yaw) * D.follow;
    droneFly(W, r, ox, (owner.y || 0) + D.alt - 0.6 + Math.sin(r.t / 600) * 0.15, oz, D.speed, dt);
    const tyaw = owner.yaw;
    r.yaw += Math.atan2(Math.sin(tyaw - r.yaw), Math.cos(tyaw - r.yaw)) * Math.min(1, dt * 3);
    return;
  }
  r.target = e.id;
  const dx = e.x - r.x, dz = e.z - r.z, hd = Math.hypot(dx, dz) || 1;
  const tyaw = Math.atan2(-dx, -dz);
  r.yaw += Math.atan2(Math.sin(tyaw - r.yaw), Math.cos(tyaw - r.yaw)) * Math.min(1, dt * 6);
  const ownEyes = r.seen.has(e.id);
  const dist = Math.hypot(dx, robotChestY(e) - r.y, dz);
  if (ownEyes && dist <= D.lockRange) {
    // the lock: a full second of its own eyes on them, and they can see and hear it coming
    if (r.state !== 'lock') { r.state = 'lock'; r.lock = 0; W.fx('lock', { x: r.x, y: r.y, z: r.z, id: r.id }); }
    r.lock += dt * 1000;
    droneFly(W, r, r.x, Math.max(r.y, robotChestY(e) + 1.2), r.z, D.speed * 0.4, dt);   // hold position while it locks
    if (r.lock >= D.lockMs) { r.state = 'dive'; r.diveAt = W.now; r.ax = e.x; r.ay = robotChestY(e); r.az = e.z; W.fx('dive', { x: r.x, y: r.y, z: r.z, id: r.id }); }
    return;
  }
  // hunting: close in to a stand-off above them, the lock starts again from nothing
  r.state = 'hunt'; r.lock = 0;
  const k = Math.max(0, hd - D.standOff) / hd;
  droneFly(W, r, r.x + dx * k, Math.max((e.y || 0) + D.alt, robotChestY(e) + 1.6), r.z + dz * k, D.speed, dt);
}

function dogMoveTo(W, r, gx, gz, spd, dt){
  const G = W.G;
  if (!r.path || Math.hypot(gx - (r.pgx || 1e9), gz - (r.pgz || 1e9)) > 1.5 || W.now - (r.planAt || 0) > 1200) {
    r.path = gridLine(G, r.x, r.z, gx, gz) ? [[gx, gz]] : gridPath(G, r.x, r.z, gx, gz, 4000);
    r.pgx = gx; r.pgz = gz; r.planAt = W.now;
  }
  if (!r.path || !r.path.length) { r.speed = 0; return false; }
  const p = r.path[0], dx = p[0] - r.x, dz = p[1] - r.z, d = Math.hypot(dx, dz);
  if (d < 0.25) { r.path.shift(); if (!r.path.length) { r.speed = 0; return true; } return false; }
  const step = Math.min(d, spd * dt);
  const nx = r.x + dx / d * step, nz = r.z + dz / d * step;
  const c = gridCell(G, nx, nz);
  if (!gridFree(G, c[0], c[1]) && gridFree(G, ...gridCell(G, r.x, r.z))) { r.path = null; r.speed = 0; return false; }
  r.x = nx; r.z = nz; r.speed = step / dt;
  const tyaw = Math.atan2(-dx, -dz);
  r.yaw += Math.atan2(Math.sin(tyaw - r.yaw), Math.cos(tyaw - r.yaw)) * Math.min(1, dt * 8);
  return false;
}
function dogFace(r, x, z, dt){
  const tyaw = Math.atan2(-(x - r.x), -(z - r.z));
  r.yaw += Math.atan2(Math.sin(tyaw - r.yaw), Math.cos(tyaw - r.yaw)) * Math.min(1, dt * 7);
  return Math.abs(Math.atan2(Math.sin(tyaw - r.yaw), Math.cos(tyaw - r.yaw)));
}
function dogBite(W, r, e){
  r.biteAt = W.now; r.lungeT = SILV.dog.lunge;
  W.hurt(r, e, SILV.dog.bite, 'bite');
  W.fx('bite', { x: e.x, y: robotChestY(e), z: e.z, id: r.id });
}

function stepDog(W, r, owner, enemies, dt){
  const S = SILV.dog;
  r.t += dt * 1000;
  r.y = 0;
  /* It lasts 120s, then powers down and is gone; the 70s starts then, the
     same as if it had been destroyed (Jack, 2026-11-27). */
  if (r.t >= S.lifeMs) { r.alive = false; r.why = 'expired'; return; }
  if (r.lungeT > 0) r.lungeT = Math.max(0, r.lungeT - dt);
  const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw), eye = S.eye;
  r.seen = new Set();
  for (const e of enemies) if (e.alive && robotSees(W, r, e, eye, fx, fz, SILV.coneCos)) { r.seen.add(e.id); W.reveal(r.owner, e.id); }

  /* Released: run the way Silvars faced, and pounce on anyone met */
  if (r.state === 'run') {
    for (const e of enemies) {
      if (!e.alive || !r.seen.has(e.id)) continue;
      if (Math.hypot(e.x - r.x, e.z - r.z) <= S.pounceR) { dogBite(W, r, e); r.state = 'idle'; r.path = null; return; }
    }
    const step = S.runSpeed * dt;
    const nx = r.x + r.rdx * step, nz = r.z + r.rdz * step;
    const c = gridCell(W.G, nx, nz);
    r.ran += step;
    if (!gridFree(W.G, c[0], c[1]) || r.ran >= S.runDist) { r.state = 'idle'; r.speed = 0; r.path = null; return; }
    r.x = nx; r.z = nz; r.speed = S.runSpeed;
    return;
  }

  guardCheck(r, owner);
  const anchor = r.guard || owner, leash = r.guard ? S.guardLeash : S.leash;
  const leashOK = (x, z) => Math.hypot(x - anchor.x, z - anchor.z) <= leash;
  const e = robotPick(W, r, enemies, eye, leash + S.gunRange, anchor);
  if (!e && r.guard) {
    /* guarding: go to the spot and hold it, watching away from where he is */
    r.state = 'guard'; r.aimFrom = 0;
    if (Math.hypot(r.x - r.guard.x, r.z - r.guard.z) > 0.8) dogMoveTo(W, r, r.guard.x, r.guard.z, S.speed, dt);
    else { r.speed = 0; dogFace(r, r.x + (r.x - owner.x), r.z + (r.z - owner.z), dt); }
    return;
  }
  if (!e) {
    /* Heel: it stays NEAR Silvars, on whichever side it already is, and only
       moves when he gets more than a few metres away - turning on the spot
       does not send it running round behind him (Jack, 2026-11-27). */
    r.state = 'follow'; r.aimFrom = 0;
    const od = Math.hypot(r.x - owner.x, r.z - owner.z);
    if (od > S.follow + 2 || r.heeling) {
      r.heeling = true;
      const k = od > 0.01 ? S.follow / od : 0;
      const bx = owner.x + (r.x - owner.x) * k, bz = owner.z + (r.z - owner.z) * k;   // the near point on its own side
      if (dogMoveTo(W, r, bx, bz, od > 7 ? S.speed : S.speed * 0.6, dt) || od <= S.follow + 0.3) r.heeling = false;
    } else {
      r.speed = 0;
      dogFace(r, r.x + (r.x - owner.x), r.z + (r.z - owner.z), dt);   // facing outward, on watch
    }
    return;
  }
  r.state = 'engage'; r.target = e.id;
  const dx = e.x - r.x, dz = e.z - r.z, d = Math.hypot(dx, dz);
  const own = r.seen.has(e.id);
  // close: bite
  if (d <= S.biteRange && Math.abs((e.y || 0) - r.y) < 1.2) {
    r.speed = 0; dogFace(r, e.x, e.z, dt);
    if (W.now - (r.biteAt || 0) >= S.biteMs) dogBite(W, r, e);
    return;
  }
  // in sight and in range: plant and shoot, after a short warning
  if (own && d <= S.gunRange) {
    r.speed = 0;
    const off = dogFace(r, e.x, e.z, dt);
    if (!r.aimFrom) { r.aimFrom = W.now; W.fx('dogtele', { x: r.x, y: eye, z: r.z, id: r.id }); }
    // close the gap to bite range if the target is near and the leash allows
    if (d < 6 && leashOK(e.x, e.z)) { dogMoveTo(W, r, e.x, e.z, S.speed, dt); }
    if (off < 0.25 && W.now - r.aimFrom >= S.teleMs && W.now - (r.shotAt || 0) >= S.gunMs) {
      r.shotAt = W.now;
      const ox = r.x - Math.sin(r.yaw) * 0.45, oz = r.z - Math.cos(r.yaw) * 0.45, oy = eye + 0.1;
      const tx = e.x, ty = robotChestY(e), tz = e.z;
      let ddx = tx - ox, ddy = ty - oy, ddz = tz - oz; const L = Math.hypot(ddx, ddy, ddz) || 1;
      ddx = ddx / L + (Math.random() * 2 - 1) * S.spread; ddy = ddy / L + (Math.random() * 2 - 1) * S.spread * 0.6; ddz = ddz / L + (Math.random() * 2 - 1) * S.spread;
      const n = Math.hypot(ddx, ddy, ddz); ddx /= n; ddy /= n; ddz /= n;
      // does the round meet their body (a column 0.35 round) before a wall?
      const wall = robotRay(W.G, ox, oy, oz, ddx, ddy, ddz, S.gunRange + 2, 'ray');
      const lx = tx - ox, lz = tz - oz, along = lx * ddx + (ty - oy) * ddy + lz * ddz;
      const px = ox + ddx * along, py = oy + ddy * along, pz = oz + ddz * along;
      const miss = Math.hypot(px - tx, pz - tz), hitBody = along > 0 && miss < 0.36 && py > (e.y || 0) && py < robotBodyTop(e);
      const landed = hitBody && (!wall || wall.t > along);
      const endT = landed ? along : (wall ? wall.t : S.gunRange);
      W.fx('dogshot', { x: ox, y: oy, z: oz, ex: ox + ddx * endT, ey: oy + ddy * endT, ez: oz + ddz * endT, id: r.id, hit: landed ? 1 : 0 });
      if (landed) W.hurt(r, e, S.gunDmg, 'dog');
    }
    return;
  }
  // otherwise hunt toward them, but never past the leash
  r.aimFrom = 0;
  let gx = e.x, gz = e.z;
  const od = Math.hypot(gx - anchor.x, gz - anchor.z);
  if (od > leash) { gx = anchor.x + (gx - anchor.x) / od * leash; gz = anchor.z + (gz - anchor.z) / od * leash; }
  dogMoveTo(W, r, gx, gz, S.speed, dt);
}

/* A guard order lapses when Silvars is more than the order range from the
   spot: the robot comes back to him. */
function guardCheck(r, owner){
  if (r.guard && Math.hypot(r.guard.x - owner.x, r.guard.z - owner.z) > SILV.order.range) { r.guard = null; r.path = null; }
}
/* Where an order sends a robot: what the look meets within range (a wall, a
   crate, the floor), or the end of the range along it. Returns { x, y, z }
   (y the floor under it), or null for "come back" (aimed at your own feet). */
function robotOrderPoint(G, ex, ey, ez, dx, dy, dz, feetY){
  const R = SILV.order.range;
  const h = robotRay(G, ex, ey, ez, dx, dy, dz, R, 'ray');
  let t = h ? h.t : (dy < -0.05 ? Math.min(R, (ey - (feetY || 0)) / -dy) : R);
  // stop just short of a wall so the spot is in front of it, not inside it
  if (h && h.axis !== 1) t = Math.max(0, t - 0.6);
  const x = ex + dx * t, z = ez + dz * t;
  if (Math.hypot(x - ex, z - ez) <= SILV.order.recallR) return null;
  return { x, y: h && h.axis === 1 && dy < 0 ? ey + dy * t : (feetY || 0), z };
}

/* What goes on the wire for each robot, and back. Short keys: this is
   sent to the room every tick while any robot is out. */
const ROBOT_STATES = ['idle', 'follow', 'hunt', 'lock', 'dive', 'run', 'engage', 'guard'];
function robotWire(r, now){
  return { i: r.id, k: r.kind === 'dog' ? 'g' : r.kind === 'drone' ? 'd' : r.kind === 'missile' ? 'm' : 's', o: r.owner,
           x: +r.x.toFixed(2), y: +(r.y || 0).toFixed(2), z: +r.z.toFixed(2), w: +(r.yaw || 0).toFixed(2),
           h: Math.round(r.hp), sh: r.shield ? Math.round(r.shield) : undefined, s: Math.max(0, ROBOT_STATES.indexOf(r.state)),
           l: r.kind === 'drone' ? +Math.min(1, (r.lock || 0) / SILV.drone.lockMs).toFixed(2) : 0,
           q: r.kind === 'missile' ? +(r.pitch || 0).toFixed(2) : undefined,
           n: r.kind === 'sensor' ? [+r.nx.toFixed(2), +r.ny.toFixed(2), +r.nz.toFixed(2)] : undefined,
           p: r.kind === 'sensor' ? Math.max(0, Math.round(((r.readyAt || 0) - now) / 1000)) : undefined,
           v: r.kind === 'dog' ? +(r.speed || 0).toFixed(1) : undefined,
           u: r.kind === 'dog' && r.lungeT > 0 ? 1 : undefined,
           e: r.kind === 'dog' || r.kind === 'drone' ? Math.max(0, Math.round((SILV[r.kind].lifeMs - r.t) / 1000)) : undefined };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SILV, SALVO, TXF, txfCodeOk, blastDamage, robotGeo, robotRay, robotLos, makeRobot, stepRobots, damageRobot, robotHitT, robotOrderPoint,
                     robotCenterY, robotWire, ROBOT_STATES, robotChestY };
}
