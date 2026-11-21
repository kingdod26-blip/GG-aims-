/* Build the combined map by READING the three that already exist and
   placing them, rather than re-typing their layouts. The hall and the
   substation keep their exact dimensions and their exact contents; what is
   new is the ground between them and the plant on it. */
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'public', 'maps.js');
/* The three it is built from live beside this file, not in the game's own
   map table: `works` is the only map the game ships now. */
const M = require('./retired-maps.js');

const HALL_DX = 56;     // the turbine hall, east
const SUB_DX = -62;     // the substation compound, west
const A = 120;          // half-extent: a 240m site

const out = [];
const note = (t) => out.push({ note: t });
const box = (x, z, w, d, h, mat, extra) =>
  out.push(Object.assign({ x: +x.toFixed(2), z: +z.toFixed(2), w: +w.toFixed(3), d: +d.toFixed(3), h, mat }, extra || {}));

/* ---- a circle as a staircase, the same formula lighting.js draws from -- */
function drum(x, z, R, h, mat, extra, N) {
  N = N || 9;
  for (let i = 0; i < N; i++) {
    const th = Math.asin(Math.sqrt((i + 0.5) / N));
    box(x, z, 2 * R * Math.cos(th), 2 * R * Math.sin(th), h,
        i === 0 ? mat : 'hidden', i === 0 ? Object.assign({ r: R, n: N }, extra || {}) : null);
  }
}
const RT = 7.3, YT = 26, AA = 19.6;
const shellR = (y) => RT * Math.sqrt(1 + ((y - YT) / AA) ** 2);
function coolingTower(x, z) {
  drum(x, z, 13.0, 2.6, 'mass');
  drum(x, z, +shellR(5.6).toFixed(2), 5.6, 'hidden');
}

/* ===================================================================== */
/* 1. THE TURBINE HALL, verbatim, inside a building                      */
/* ===================================================================== */
note('THE TURBINE HALL — the whole of the `powerstation` map, moved east and\n' +
     '      given walls and a roof instead of being the world. Its boxes are\n' +
     '      copied, not re-typed: reactor bay, both units, the column rows,\n' +
     '      the control rooms, all at the dimensions they already had.');
for (const b of M.MAPS.powerstation.boxes) {
  box(b.x + HALL_DX, b.z, b.w, b.d, b.h, b.mat,
      b.r != null ? { r: b.r, n: b.n } : null);
}

/* Its shell. The original's perimeter was derived from `arena`; here it is
   cladding with doors left between the segments. Interior x -3..115, z -59..59. */
const HW = 1.5, HX0 = -3, HX1 = 115, HZ0 = -59, HZ1 = 59, HH = 16;
/* Walls as FROM/TO spans, not centre-and-width. Doing the arithmetic in my
   head gave the hall an 80m west wall across its own doorway and the
   compound a north wall of negative width. */
const wallN = (z, x0, x1, h, mat) => { if (x1 - x0 > 0.01) box((x0 + x1) / 2, z, x1 - x0, HW, h, mat); };
const wallE = (x, z0, z1, h, mat) => { if (z1 - z0 > 0.01) box(x, (z0 + z1) / 2, HW, z1 - z0, h, mat); };
note('and the shell round it: cladding, 16m, with the doors left out');
/* The side walls run the FULL length and the end walls BUTT between them,
   rather than both running long and crossing at the corners. Two boxes of
   the same height overlapping by 1.5x1.5m each draw their own top over that
   square, and two coplanar faces at one depth flicker - on top of every
   corner of every building. Butting them means no shared volume at all. */
// west face, two doors onto the yard that joins it to the substation
wallE(HX0 - HW / 2, HZ0 - HW, -20, HH, 'cladding');
wallE(HX0 - HW / 2, -14, 14, HH, 'cladding');
wallE(HX0 - HW / 2, 20, HZ1 + HW, HH, 'cladding');
// east face, solid onto the service road
wallE(HX1 + HW / 2, HZ0 - HW, HZ1 + HW, HH, 'cladding');
// north face, a door toward the boiler house — between the two side walls
wallN(HZ0 - HW / 2, HX0, 46, HH, 'cladding');
wallN(HZ0 - HW / 2, 54, HX1, HH, 'cladding');
// south face, a door toward the quay
wallN(HZ1 + HW / 2, HX0, 20, HH, 'cladding');
wallN(HZ1 + HW / 2, 28, HX1, HH, 'cladding');

/* ===================================================================== */
/* 2. THE SWITCHYARD                                                     */
/* ===================================================================== */
/* It began as the `substation` map moved west - three walled lanes and four
   corner towers - and Jack sent a photograph of a real HV yard and asked for
   that instead: rows of white porcelain on galvanised racks, lattice
   transmission towers, portal gantries with the lines swept between them,
   grey kiosks, red fire cabinets, all on a concrete apron.

   The layout still has to be a place to fight, so the plant is arranged the
   way a yard actually is AND the way a map wants: four bays running
   north-south with aisles between them, which gives long lanes along the
   bays and chest-high cover across them. The old lane walls are gone; the
   bays do that job now and look like what they are.

   Everything a player can touch is a box. The porcelain above the racks, the
   crossarms and every conductor are overhead and drawn only. */
note('THE SWITCHYARD: four bays of HV plant, transmission towers at the\n' +
     '      corners, portal gantries over the top. This was the substation\n' +
     '      map; Jack sent a photograph of a real yard and asked for that.');
const SUBX = SUB_DX;
box(SUBX, 0, 11, 8, 4.5, 'control');                         // the control building
box(SUBX, -4.6, 11, 1.2, 3.0, 'step');                       // and its stair
box(SUBX, -5.8, 11, 1.2, 1.5, 'step');
for (const bx of [SUBX - 30, SUBX - 15, SUBX + 15, SUBX + 30])   // four bays of capacitor racks
  for (const bz of [-34, -22, -10, 10, 22, 34])
    box(bx, bz, 7.2, 3.2, 2.2, 'capbank');
for (const bx of [SUBX - 22.5, SUBX + 22.5])                 // breakers in the aisles between them
  for (const bz of [-28, -16, 16, 28]) box(bx, bz, 3.4, 3.0, 2.4, 'gear');
for (const k of [[SUBX - 8, -40], [SUBX + 8, -40], [SUBX - 8, 40],
                 [SUBX + 8, 40], [SUBX - 38, 0], [SUBX + 38, 0]])
  box(k[0], k[1], 4.0, 2.6, 2.6, 'kiosk');                   // marshalling kiosks
for (const f of [[SUBX - 15, 0], [SUBX + 15, 0], [SUBX - 30, -42], [SUBX + 30, 42]])
  box(f[0], f[1], 1.2, 0.9, 1.5, 'firebox');
for (const tx of [SUBX - 38, SUBX + 38]) for (const tz of [-40, 40])
  box(tx, tz, 4.2, 4.2, 26, 'hvtower');                      // the transmission towers
for (const gx of [SUBX - 40, SUBX + 40]) for (const gz of [-24, 24])
  box(gx, gz, 1.6, 1.6, 12, 'lattice');                      // the gantry legs

const SX0 = SUB_DX - 42, SX1 = SUB_DX + 42, SZ0 = -46, SZ1 = 46, SWH = 5, SW = 1.4;
const subN = (z, x0, x1) => { if (x1 - x0 > 0.01) box((x0 + x1) / 2, z, x1 - x0, SW, SWH, 'firewall'); };
const subE = (x, z0, z1) => { if (z1 - z0 > 0.01) box(x, (z0 + z1) / 2, SW, z1 - z0, SWH, 'firewall'); };
note('with a compound wall and its gates — the gates are on the centre lines\n' +
     '      of the compound, not of the map, which is where that arithmetic\n' +
     '      went wrong the first time');
subE(SX0 - SW / 2, SZ0 - SW, SZ1 + SW);                      // west, solid, full length
subE(SX1 + SW / 2, SZ0 - SW, -8);                            // east, the main gate onto the yard
subE(SX1 + SW / 2, 8, SZ1 + SW);
subN(SZ0 - SW / 2, SX0, SUB_DX - 6);                         // north, a gate, butting between them
subN(SZ0 - SW / 2, SUB_DX + 6, SX1);
subN(SZ1 + SW / 2, SX0, SUB_DX - 6);                         // south, a gate
subN(SZ1 + SW / 2, SUB_DX + 6, SX1);

/* ===================================================================== */
/* 3. THE SITE AROUND THEM                                               */
/* ===================================================================== */
note('THE COOLING TOWERS, north-west, where there is room for two of them');
coolingTower(-74, -90);
coolingTower(-24, -90);

note('THE BOILER HOUSE, against the hall\'s north wall, and its stack');
box(56, -82, 54, 28, 28, 'boiler');
drum(96, -96, 3.0, 68.0, 'mass');

note('THE SWITCHYARD, south-west: two rows of portals and the gear beneath');
for (const z of [78, 94]) for (let i = 0; i < 7; i++) box(-110 + i * 14, z, 1.4, 1.4, 13, 'lattice');
for (let i = 0; i < 6; i++) box(-104 + i * 14, 86, 3.4, 3.0, 2.4, 'gear');

note('THE OIL TANKS, the far south-west corner');
for (const [tx, tz] of [[-100, 108], [-80, 112], [-60, 106]]) drum(tx, tz, 6.0, 10.0, 'tank');

note('THE QUAY, south-east: the intake house and the screens');
box(40, 104, 30, 10, 4.0, 'intake');
box(78, 104, 14, 9, 5.0, 'shed');
box(10, 108, 8, 5, 2.2, 'gear');

note('The step-up transformers, between the hall and the compound, round the\n' +
     '      resupply — the one piece of ground every route crosses');
box(-14, -11, 7, 5.5, 3.2, 'transformer');
box(-14, 11, 7, 5.5, 3.2, 'transformer');
/* No blast wall of their own: the switchyard's east wall stands right
   behind them and is the blast wall. There used to be one at x -24, placed
   when that ground was open yard - once the compound sat over it, it stood
   4.7m INSIDE the switchyard behind its main gate and ran straight through
   a kiosk. The probe found it as a ledge beside a cabinet. */

/* Cover on ground that is ACTUALLY open. This list was written for the
   first outdoor layout, before the switchyard and the boiler house moved
   onto that ground, and it was never revisited - so pipe bridges ran
   through the compound walls, through capacitor racks, through a
   transmission tower and through the corner of the boiler house, and two
   stood inside the turbine hall. Eleven boxes interpenetrating, found by
   testing every pair of drawn boxes for overlap rather than by looking.
   Every one of these is checked against everything else on the site. */
note('and cover on the open ground, so it is crossable - checked against\n' +
     '      everything else, because the first list ran through half the site');
for (const [x, z, w, d, h] of [
  [-12, -35, 3, 12, 2.6], [-12, 35, 3, 12, 2.6],   // the yard between hall and switchyard
  [8, -75, 16, 3, 2.2],                             // north, between the towers and the boiler house
  [-62, -56, 16, 3, 2.2],                           // outside the switchyard's north gate
  [-60, 60, 7, 7, 3.0], [20, 70, 16, 3, 2.2],       // south, toward the quay
  [-50, -112, 16, 3, 2.2], [0, -112, 16, 3, 2.2],   // the north fence line
]) box(x, z, w, d, h, 'pipe');

/* STAGE 4 (2026-11-16): pipe racks from the boiler house into the cooling
   towers, as every aerial reference has them. The pipes are props at 7m,
   out of reach; the LEGS stand on the ground, so they are real boxes
   (mat 'column': footing plus steel, already known to the floor shader,
   the minimap and the flat look). Each leg was placed clear of the basins
   (18m+ from a tower's centre against a 13m basin) and of every box. */
note('pipe racks into the towers: legs are collision, the pipes overhead');
const RACK_Z = -84, RACK_Y = 6.6;
for (const x of [-56, -48, -42, -6, 2, 10, 18, 26])
  for (const dz of [-1.2, 1.2]) box(x, RACK_Z + dz, 0.45, 0.45, RACK_Y, 'column');

note('a workshop or two');
box(-100, -60, 14, 12, 7, 'shed');
box(100, 100, 14, 12, 7, 'shed');

/* ===================================================================== */
/* THE OFFICES: a real three-storey office block (2026-11-21)            */
/* ===================================================================== */
/* Jack: "a real indoor office, whereby it has three levels". Built to the
   numbers real ones are built to: a 12m-deep plan (window to window 12-15m
   is the usual range), floor to floor 3.9m with a 0.3m slab (3.6m clear,
   a little over the usual 2.75-3m, because there is no suspended ceiling
   here to hide the services in), a ribbon of glazing over a 0.9m sill, two
   switch-back escape stairs, one at each end, with 22 risers of 0.177m and
   0.28m treads a storey, a central lift and toilet core, a double-height
   lobby facing the road, glass meeting rooms and open-plan desks.

   WHERE: south of the hall, between the two busbar rows (z 78 and z 94,
   11m up, the whole width of the site) - so the block is 12m deep and the
   roof can stand higher than the conductors without touching them.

   Every box is placed by its FACES (ob), not its centre: the edges are
   what has to butt, and a centre rounded to 2 places moved them 5mm. */
note('THE OFFICES, south of the hall: three storeys, two stairs, a lobby');
const OX0 = 55, OX1 = 95, OZ0 = 80, OZ1 = 92, OT = 0.3;          // footprint, wall thickness
const FF = 3.9, SLAB = 0.3, STH = FF - SLAB;                      // floor to floor, slab, storey wall
const LV = [0, FF, 2 * FF], ROOFY = 3 * FF;                       // floor levels; top of the roof slab
const RISE = FF / 22, GOING = 0.28;
const SILL = 0.9, HEAD = 3.3, DOORH = 2.7, GT = 0.06;             // window band, door head, glass
const r4 = (v) => +v.toFixed(4);
const ob = (x0, x1, z0, z1, y0, y1, mat) => {
  if (x1 - x0 < 0.005 || z1 - z0 < 0.005 || y1 - y0 < 0.005) return;
  const o = { x: r4((x0 + x1) / 2), z: r4((z0 + z1) / 2), w: r4(x1 - x0), d: r4(z1 - z0), h: r4(y1 - y0), mat };
  if (y0 > 0.0005) o.y = r4(y0);
  out.push(o);
};

/* A rectangle minus some holes, as few boxes as a grid merge gives. */
function rectsMinus(R, holes){
  const cut = (k0, k1, lo, hi) => [...new Set([lo, hi, ...holes.flatMap(h => [h[k0], h[k1]])])]
    .filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
  const xs = cut('x0', 'x1', R.x0, R.x1), zs = cut('z0', 'z1', R.z0, R.z1);
  const solid = (x, z) => !holes.some(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  let strips = [];
  for (let j = 0; j < zs.length - 1; j++){
    const cz = (zs[j] + zs[j + 1]) / 2; let run = null;
    for (let i = 0; i < xs.length - 1; i++){
      const on = solid((xs[i] + xs[i + 1]) / 2, cz);
      if (on && !run) run = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
      else if (on) run.x1 = xs[i + 1];
      if ((!on || i === xs.length - 2) && run){ strips.push(run); run = null; }
    }
  }
  const merged = [];                                   // stack strips with the same x span
  for (const s of strips){
    const m = merged.find(q => q.x0 === s.x0 && q.x1 === s.x1 && q.z1 === s.z0);
    if (m) m.z1 = s.z1; else merged.push(Object.assign({}, s));
  }
  return merged;
}

/* The roof first, so the plan draws everything inside over it. */
ob(OX0, OX1, OZ0, OZ1, ROOFY - SLAB, ROOFY, 'roofslab');
ob(OX0, OX1, OZ0, OZ0 + OT, ROOFY, ROOFY + 0.9, 'parapet');
ob(OX0, OX1, OZ1 - OT, OZ1, ROOFY, ROOFY + 0.9, 'parapet');
ob(OX0, OX0 + OT, OZ0 + OT, OZ1 - OT, ROOFY, ROOFY + 0.9, 'parapet');
ob(OX1 - OT, OX1, OZ0 + OT, OZ1 - OT, ROOFY, ROOFY + 0.9, 'parapet');

/* A facade, one storey of it. `along` is 'x' (north and south faces) or
   'z' (the ends); t0..t1 is the wall's thickness across it. A window run
   is a sill, a head, mullions every 3m or so and glass between them, set
   in the middle of the wall. A door is just its head. */
function facade(along, t0, t1, a0, a1, kind, L){
  const B = (p0, p1, y0, y1, mat, u0, u1) => along === 'x'
    ? ob(p0, p1, u0 != null ? u0 : t0, u1 != null ? u1 : t1, y0, y1, mat)
    : ob(u0 != null ? u0 : t0, u1 != null ? u1 : t1, p0, p1, y0, y1, mat);
  if (kind === 'solid'){ B(a0, a1, L, L + STH, 'facade'); return; }
  if (kind === 'door'){ B(a0, a1, L + DOORH, L + STH, 'facade'); return; }
  B(a0, a1, L, L + SILL, 'facade');
  B(a0, a1, L + HEAD, L + STH, 'facade');
  const MW = 0.3, n = Math.max(1, Math.ceil((a1 - a0) / 3)), pw = (a1 - a0 - (n - 1) * MW) / n, mid = (t0 + t1) / 2;
  for (let i = 0; i < n; i++){
    const p0 = a0 + i * (pw + MW), p1 = p0 + pw;
    B(p0, p1, L + SILL, L + HEAD, 'glass', mid - GT / 2, mid + GT / 2);
    if (i < n - 1) B(p1, p1 + MW, L + SILL, L + HEAD, 'facade');
  }
}
const W = 'win', S = 'solid';
const NORTH = (s) => [[55, 55.6, S], [55.6, 72.7, W], [72.7, 73, S], [73, 77, s === 0 ? 'door' : W],
                      [77, 77.3, S], [77.3, 94.4, W], [94.4, 95, S]];               // the entrance, facing the road
const SOUTH = (s) => [[55, 59.55, S], [59.55, 72, W], [72, 80, S], [80, 81.9, s === 0 ? 'door' : W],
                      [81.9, 82.2, S], [82.2, 90.45, W], [90.45, 95, S]];           // a back door beside the core
const ENDS  = () => [[OZ0 + OT, 85, W], [85, OZ1 - OT, S]];                         // stairs behind the solid half

/* A switch-back stair core. `X(u0, u1)` maps the core's own across-axis
   (0 at the end wall, 4 at its inner wall) to world x, so one function
   builds both ends. Flight A climbs south from the landing, the half
   landing turns you, flight B climbs north back to the next floor. */
const CZN = 85, CZL = 86.85, CZM = CZL + 10 * GOING;   // north wall, landing edge, half landing edge (89.65)
function stairCore(X){
  const part = (u0, u1, z0, z1, y0, y1, mat) => { const [a, b] = X(u0, u1); ob(a, b, z0, z1, y0, y1, mat); };
  part(1.85, 2.15, CZL, CZM, 0, ROOFY - SLAB, 'core');                   // the wall between the flights, full height
  LV.forEach((L, s) => {
    part(0, 2.3, CZN, CZN + 0.25, L, L + STH, 'core');                   // north wall, with its door
    part(3.9, 4.25, CZN, CZN + 0.25, L, L + STH, 'core');
    part(2.3, 3.9, CZN, CZN + 0.25, L + 2.4, L + STH, 'core');
    part(4.0, 4.25, CZN + 0.25, OZ1 - OT, L, L + STH, 'core');           // inner wall
    if (s === LV.length - 1){                                            // top floor: no flight up, a rail over the drop
      part(0, 1.85, CZL - 0.1, CZL, L, L + 1.1, 'rail');
      return;
    }
    for (let k = 1; k <= 10; k++){                                       // flight A
      const top = L + k * RISE, z0 = CZL + (k - 1) * GOING;
      part(0, 1.85, z0, z0 + GOING, Math.max(L, top - 0.2), top, 'tread');
    }
    part(0, 4.0, CZM, OZ1 - OT, L + 11 * RISE - SLAB, L + 11 * RISE, 'slab');   // half landing
    for (let j = 1; j <= 10; j++){                                       // flight B
      const top = L + (11 + j) * RISE, z1 = CZM - (j - 1) * GOING;
      part(2.15, 4.0, z1 - GOING, z1, top - 0.2, top, 'tread');
    }
  });
}
stairCore((u0, u1) => [OX0 + OT + u0, OX0 + OT + u1]);                    // west
stairCore((u0, u1) => [OX1 - OT - u1, OX1 - OT - u0]);                    // east, mirrored

/* The lift and the toilets: one closed core against the back wall. */
ob(72, 80, 88.4, OZ1 - OT, 0, ROOFY - SLAB, 'core');

/* A cluster of four desks with a screen down the middle: knee-high cover,
   and the screen is a raised box standing on the desks. */
const desks = (cx, cz, L) => {
  ob(cx - 1.6, cx + 1.6, cz - 0.8, cz + 0.8, L, L + 0.75, 'desk');
  ob(cx - 1.6, cx + 1.6, cz - 0.025, cz + 0.025, L + 0.75, L + 1.25, 'screen');
};
/* A glass meeting room in the east bay, against the back wall. */
const meeting = (L) => {
  ob(82.2, 82.26, 87, OZ1 - OT, L, L + STH, 'glass');                    // west side
  ob(82.26, 83.0, 87, 87.06, L, L + STH, 'glass');                        // front, either side of the door
  ob(84.2, 90.45, 87, 87.06, L, L + STH, 'glass');
  ob(83.0, 84.2, 87, 87.06, L + 2.4, L + STH, 'glass');                   // over the door
  ob(84.2, 88.6, 88.6, 90.2, L, L + 0.75, 'desk');                         // the table
};

LV.forEach((L, s) => {
  for (const [a0, a1, k] of NORTH(s)) facade('x', OZ0, OZ0 + OT, a0, a1, k, L);
  for (const [a0, a1, k] of SOUTH(s)) facade('x', OZ1 - OT, OZ1, a0, a1, k, L);
  for (const [a0, a1, k] of ENDS())  { facade('z', OX0, OX0 + OT, a0, a1, k, L); facade('z', OX1 - OT, OX1, a0, a1, k, L); }
  if (s > 0){
    /* The floor: the whole footprint less the two stairwells, the core and
       (on the first floor) the void over the lobby. */
    const holes = [
      { x0: OX0 + OT, x1: OX0 + OT + 4, z0: CZL, z1: OZ1 - OT },
      { x0: OX1 - OT - 4, x1: OX1 - OT, z0: CZL, z1: OZ1 - OT },
      { x0: 72, x1: 80, z0: 88.4, z1: OZ1 - OT },
    ];
    if (s === 1) holes.push({ x0: 68, x1: 82, z0: OZ0 + OT, z1: 84.5 });
    for (const r of rectsMinus({ x0: OX0, x1: OX1, z0: OZ0, z1: OZ1 }, holes)) ob(r.x0, r.x1, r.z0, r.z1, L - SLAB, L, 'slab');
  }
  meeting(L);
  for (const [cx, cz] of [[62.4, 83.2], [66.2, 83.2], [62.4, 87.4], [66.2, 87.4], [84.0, 83.0], [87.8, 83.0]]) desks(cx, cz, L);
  if (s === 0){                                                          // the lobby: reception and seats
    ob(73, 77, 85.6, 86.4, 0, 1.1, 'counter');
    ob(69, 71.4, 81.4, 82, 0, 0.45, 'bench');
    ob(78.6, 81, 81.4, 82, 0, 0.45, 'bench');
  }
  if (s === 1){                                                          // a glass balustrade round the void
    ob(68, 82, 84.5, 84.56, L, L + 1.1, 'glass');
    ob(67.94, 68, OZ0 + OT, 84.5, L, L + 1.1, 'glass');
    ob(82, 82.06, OZ0 + OT, 84.5, L, L + 1.1, 'glass');
  }
  if (s === 2){ desks(71, 83.2, L); desks(77, 83.2, L); }                 // over the lobby, the top floor is floor
});

/* ===================================================================== */
const P = M.MAPS.powerstation.props.map(p => {
  const q = Object.assign({}, p);
  if (q.x != null) q.x += HALL_DX;
  if (q.kind === 'crane' || q.kind === 'truss' || q.kind === 'tray') {
    q.x0 = HX0; q.x1 = HX1; q.z0 = HZ0; q.z1 = HZ1; q.h = HH;
    if (q.kind === 'truss') q.x = (HX0 + HX1) / 2;
  }
  return q;
});
P.push({ kind: 'hallroof', x0: HX0 - HW, x1: HX1 + HW, z0: HZ0 - HW, z1: HZ1 + HW, y: HH });
P.push({ kind: 'coolingtower', x: -74, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA });
P.push({ kind: 'coolingtower', x: -24, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA });
P.push({ kind: 'stack', x: 96, z: -96, r: 3, h: 68, n: 9 });
/* Overhead plant (stage 4). The rack pipes run INTO the tower shells at 7m,
   where the shell's radius is 10.15 - so from x -15.8 / -32.2 / -65.8 at
   z -84. Two pipe bridges carry steam over the north road from the boiler
   house into the hall at 9.5m; a flue duct joins the boiler house to the
   stack at 16-20m. None of it is reachable and none of it is a floor. */
P.push({ kind: 'piperack', x0: -61, x1: -37, px0: -65.8, px1: -32.2, z: RACK_Z, y: RACK_Y, legs: [-56, -48, -42] });
P.push({ kind: 'piperack', x0: -11, x1: 29, px0: -15.8, px1: 29, z: RACK_Z, y: RACK_Y, legs: [-6, 2, 10, 18, 26] });
P.push({ kind: 'pipebridge', x: 40, z0: -68, z1: -60, y: 9.5, rise: 25 });
P.push({ kind: 'pipebridge', x: 66, z0: -68, z1: -60, y: 9.5, rise: 25 });   // between the boiler house's columns (62.75, 69.5); at 68 its risers grazed one
P.push({ kind: 'flue', x0: 83, x1: 94, z: -94.5, w: 3, y0: 16, y1: 20 });
/* The offices' ceiling lights: under the first-floor slab, the second, and
   the roof. Kept out of both stairwells and the core; the lowest also
   skips the void over the lobby (the panels there are the next ceiling up). */
P.push({ kind: 'ceilinglights', x0: OX0 + OT, x1: OX1 - OT, z0: OZ0 + OT, z1: OZ1 - OT,
         levels: [LV[1] - SLAB, LV[2] - SLAB, ROOFY - SLAB],
         holes: [[OX0 + OT, OX0 + OT + 4.25, CZN, OZ1], [OX1 - OT - 4.25, OX1 - OT, CZN, OZ1], [72, 80, 88.4, OZ1]],
         extra: [[[68, 82, OZ0, 84.5]]] });
P.push({ kind: 'busbars', z: 78 });
P.push({ kind: 'busbars', z: 94 });
/* The yard's two gantries, with the lines swept from one to the other. */
P.push({ kind: 'gantry', z: -24, y: 12, x0: SUB_DX - 40, x1: SUB_DX + 40, to: 24, sag: 3.0 });
P.push({ kind: 'gantry', z:  24, y: 12, x0: SUB_DX - 40, x1: SUB_DX + 40 });

/* ---------------------------------------------------------------- emit -- */
const lines = [];
for (const o of out) {
  if (o.note) { lines.push('\n' + o.note.split('\n').map(l => '      // ' + l.trim()).join('\n')); continue; }
  /* `y` is a raised box's base (an upper floor, a stair tread): left off
     for anything on the floor, so the existing lines are unchanged. */
  const ex = (o.r != null ? `, r: ${o.r}, n: ${o.n}` : '') + (o.y ? `, y: ${+o.y.toFixed(3)}` : '');
  lines.push(`      { x: ${String(o.x).padStart(7)}, z: ${String(o.z).padStart(7)}, w: ${String(o.w).padStart(7)}, ` +
             `d: ${String(o.d).padStart(7)}, h: ${String(o.h).padStart(4)}, mat: ${("'" + o.mat + "'").padEnd(13)}${ex} },`);
}

const body = `  /* THE WORKS — all three maps on one site.

     Jack: "combind the three map ... as big as u can and as big as u want
     as big as you need". So: 240 metres square, with the turbine hall and
     the substation at the exact dimensions they already had, and the plant
     that joins them filling the ground between.

     NOTHING HERE IS RE-TYPED. The hall's boxes are \`powerstation\`'s, moved
     ${HALL_DX}m east; the compound's are \`substation\`'s, moved ${-SUB_DX}m west. The
     generator reads the other two maps and places them, so the reactor bay,
     both turbine units, the column rows, the three lanes and the corner
     towers are exactly what they are in the maps they came from, and they
     cannot drift from them by being copied badly.

     WHAT CHANGED to make them fit together:
       - The hall's perimeter was derived from its own \`arena\`. Here it is
         cladding with doors left between the segments, and a \`roofRect\` -
         a roof stops a bullet and not a player, which is the whole trick.
       - The substation never needed a roof. It was always an outdoor shape,
         so it becomes the walled compound it always looked like.
       - The crane, the roof trusses and the cable trays take \`x0/x1/z0/z1\`
         now. Drawn to the arena, as they were, a crane on this map would
         have spanned the cooling towers.

     THE YARD between the two is the only ground every route crosses, so the
     step-up transformers and the resupply are in it.

     OPEN SKY, as \`station\`: see that map for what \`sky\`, \`skyY\` and
     \`roofY\` each do. \`roofY\` is 80 here, over the stack. */
  works: {
    id: 'works',
    name: 'POWER STATION',
    blurb: 'The whole site. Turbine hall, switchyard, cooling towers, the stack.',
    arena: ${A},
    wallH: 11,
    sky: true,
    skyY: 52,
    roofY: 80,
    gain: 1.0,
    /* The sky, as the bake sees it: 9 by 9 panels of 30m at 52m, which is
       continuous over a site this wide. */
    lamps: { spacing: 30, reach: 4, w: 30, d: 30, show: false,
             rgb: [0.74, 0.84, 1.00], refl: [1.5, 1.8, 2.3] },
    resupply: { x: -14, z: 0 },
    /* The hall's roof. Bullets only - see mapRoofRects. */
    roofRects: [
      { minx: ${HX0 - HW}, maxx: ${HX1 + HW}, minz: ${HZ0 - HW}, maxz: ${HZ1 + HW}, y: ${HH} },
    ],
    boxes: [
${lines.join('\n')}
    ],
    props: ${JSON.stringify(P, null, 6).replace(/\n/g, '\n    ').replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")},
    paint: [
      { k: 'walk',  x0: -14, z0: -116, x1: -14, z1: 116, w: 3.2 },
      { k: 'hatch', x: -14, z: -11, w: 8.6, d: 7.1 }, { k: 'hatch', x: -14, z: 11, w: 8.6, d: 7.1 },
      { k: 'hatch', x: -74, z: -90, w: 27.4, d: 27.4 },
      { k: 'hatch', x: -24, z: -90, w: 27.4, d: 27.4 },
      { k: 'text',  x: -14, z: 24, s: 2.6, t: 'HV YARD' },
      { k: 'text',  x: -62, z: 52, s: 2.6, t: 'SWITCHYARD' },
      { k: 'walk',  x0: -62, z0: -44, x1: -62, z1: 44, w: 3.0 },
      { k: 'hatch', x: -100, z: -40, w: 5.6, d: 5.6 }, { k: 'hatch', x: -24, z: -40, w: 5.6, d: 5.6 },
      { k: 'hatch', x: -100, z:  40, w: 5.6, d: 5.6 }, { k: 'hatch', x: -24, z:  40, w: 5.6, d: 5.6 },
      { k: 'text',  x: 56, z: 72, s: 2.6, t: 'TURBINE HALL' },
    ],
    /* WHAT THE GROUND IS MADE OF (stage 3, 2026-11-16), from Jack's aerial
       references: asphalt roads with kerbs and lines, gravel under the HV
       plant, grass round the towers and along the boundary; everything not
       listed stays concrete hardstanding. Painted into the floor only
       (lighting.js litGroundTexture) - no collision, no gameplay. Zones are
       x0/z0/x1/z1 rectangles; a road is a centreline with a width, and every
       road edge was checked against the collision footprints: none runs
       under anything, kerbs included (checked in code; closest is the south
       road's kerb, 0.15m off a pipe bridge).
       Drawn in this order: grass, gravel, then roads over both. */
    ground: [
      { k: 'grass',  x0: -120, z0: -120, x1: 120, z1: -113 },
      { k: 'grass',  x0: -120, z0:  113, x1: 120, z1:  120 },
      { k: 'grass',  x0: -120, z0: -120, x1: -116, z1: 120 },
      { k: 'grass',  x0: -109, z0: -113, x1:  27, z1:  -74 },
      { k: 'grass',  x0:  -19, z0:   74, x1:   5, z1:  113 },
      { k: 'gravel', x0: -104, z0:  -46, x1: -20, z1:   46 },
      { k: 'gravel', x0: -115.5, z0: 74, x1: -20, z1:  113 },
      { k: 'road', x0: -24, z0: -64,  x1: 117, z1: -64,  w: 6 },
      { k: 'road', x0: -24, z0: 65, x1: 117, z1: 65, w: 6 },
      { k: 'road', x0: -112.5, z0: -73, x1: -112.5, z1: 73, w: 6 },
      { k: 'road', x0: -115.5, z0: -70, x1: -14, z1: -70, w: 6 },
      { k: 'road', x0: -115.5, z0:  70, x1: -14, z1:  70, w: 6 },
      /* The offices: stone tiles inside on the ground floor, and a paved
         path from the south road's kerb up to the door. */
      { k: 'floor',  x0: 55.3, z0: 80.3, x1: 94.7, z1: 91.7 },
      { k: 'paving', x0: 72.5, z0: 68.35, x1: 77.5, z1: 80 },
    ],
    signs: [],
  },

`;

/* Replace the whole of `works` in maps.js, between its own comment and the
   close of MAPS. It is the only entry there, so there is no next map to
   anchor on any more. */
let src = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');   // git may hand it back with CRLF
const a = src.indexOf('  /* THE WORKS');
const b = src.indexOf('\n};\n\nconst DEFAULT_MAP');
if (a < 0 || b < a) { console.error('maps.js: cannot find where `works` starts and MAPS ends'); process.exit(1); }
fs.writeFileSync(path, src.slice(0, a) + body.replace(/\n+$/, '\n') + src.slice(b + 1));
console.log('works built:', out.filter(o => !o.note).length, 'boxes,', P.length, 'props');
