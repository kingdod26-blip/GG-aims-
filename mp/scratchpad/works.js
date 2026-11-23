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
const BUILT = [];                    // every building()'s footprint (THE WET GROUND keeps puddles out of them)
const P_LATE = [];                   // props written before P exists (the hall's cooling-water runs), added to P with BOILERS
const GROUND_MORE = [];              // ground zones added by later sections (the generator room's chequer plate)
const PAINT_EXTRA_LATE = [];         // paint added by later sections (the substation room's keep-clear boxes)
const note = (t) => out.push({ note: t });
const box = (x, z, w, d, h, mat, extra) =>
  out.push(Object.assign({ x: +x.toFixed(2), z: +z.toFixed(2), w: +w.toFixed(3), d: +d.toFixed(3), h, mat }, extra || {}));

/* ---- boxes placed by their FACES, and rectangles with holes in them ----
   (moved up from the offices so every building can use them) */
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


/* A HOLLOW BUILDING: four walls with openings, and a roof slab on them.
   B = { x0, x1, z0, z1, t (wall), h (top of roof), rt (roof thickness) }.
   An opening is { face: 'N'|'S'|'W'|'E', a0, a1 (along the face), y0, y1,
   glass? }. North and south walls run the full length; west and east run
   between them, so the corners butt. Each wall is the face's rectangle
   (along x height) less its openings, cut by rectsMinus; a glazed opening
   gets a pane in the middle of the wall. */
function building(B, openings, wallMat, roofMat){
  BUILT.push([B.x0, B.x1, B.z0, B.z1]);
  const t = B.t, top = B.h - B.rt;
  const span = { N: [B.x0, B.x1], S: [B.x0, B.x1], W: [B.z0 + t, B.z1 - t], E: [B.z0 + t, B.z1 - t] };
  const thick = { N: [B.z0, B.z0 + t], S: [B.z1 - t, B.z1], W: [B.x0, B.x0 + t], E: [B.x1 - t, B.x1] };
  for (const f of ['N', 'S', 'W', 'E']){
    const ops = openings.filter(o => o.face === f), [c0, c1] = thick[f];
    const put = (a0, a1, y0, y1, mat, pane) => {
      const m = (c0 + c1) / 2, u0 = pane ? m - 0.03 : c0, u1 = pane ? m + 0.03 : c1;
      if (f === 'N' || f === 'S') ob(a0, a1, u0, u1, y0, y1, mat); else ob(u0, u1, a0, a1, y0, y1, mat);
    };
    for (const r of rectsMinus({ x0: span[f][0], x1: span[f][1], z0: 0, z1: top },
                               ops.map(o => ({ x0: o.a0, x1: o.a1, z0: o.y0, z1: o.y1 }))))
      put(r.x0, r.x1, r.z0, r.z1, wallMat);
    for (const o of ops) if (o.glass) put(o.a0, o.a1, o.y0, o.y1, 'glass', true);
  }
  ob(B.x0, B.x1, B.z0, B.z1, top, B.h, roofMat);
}
/* A straight steel stair, `dir` +1 / -1 along z, from yFrom to yTo:
   risers no taller than 0.19, goings of 0.25 (an industrial stair is
   steeper than an office one). Returns where it arrives. */
function steelStair(xa, xb, zStart, dir, yFrom, yTo){
  const n = Math.ceil((yTo - yFrom) / 0.19 - 1e-9), rise = (yTo - yFrom) / n, G = 0.25;
  for (let k = 1; k < n; k++){
    const top = yFrom + k * rise, za = zStart + dir * (k - 1) * G, zb = za + dir * G;
    ob(xa, xb, Math.min(za, zb), Math.max(za, zb), Math.max(yFrom, top - 0.15), top, 'steptread');
  }
  return zStart + dir * (n - 1) * G;
}
/* A handrail (1.1m, movement only: shots go through a rail). */
const rail = (x0, x1, z0, z1, y) => ob(x0, x1, z0, z1, y, y + 1.1, 'handrail');

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
/* (2026-11-23, the indoors brief) the hall's condensers and cooling-water
   pumps are their own kinds now, drawn as what they are (lighting.js). */
const hallKind = (b) => b.mat !== 'machine' ? b.mat : (b.w === 6 && b.d === 14) ? 'condenser' : (b.w === 3.4 && b.d === 3) ? 'pumpset' : b.mat;
for (const b of M.MAPS.powerstation.boxes) {
  if (b.mat === 'control' && b.x + HALL_DX < 30) continue;          // the west control room is built hollow below (THE CONTROL ROOM)
  box(b.x + HALL_DX, b.z, b.w, b.d, b.h, hallKind(b),
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

/* THE TURBINE HALL, FITTED OUT (2026-11-23). Jack's brief for the indoors
   ("multiple levels of elevated metal walkways, staircases, platforms,
   railings, and maintenance bridges", "Upper Catwalks: elevated walkways
   overlooking the main turbine hall") and his reference picture (decks
   edged in yellow rail, cooling-water pipes from the pumps to the
   condensers, blue generators):
   - a CATWALK along each long wall at 6.4m, a steel stair down at each end,
     and two BRIDGES across the hall (x 20 and x 92) joining them: a second
     level over the whole floor;
   - yellow RAILS round both turbine operating decks, open at their stairs;
   - COOLING WATER: from each pump a pipe rises to 9m, runs over to its
     condenser and drops into it - the risers and drops are collision, the
     runs are out of reach. */
{
  const CY = 6.4, CT = 0.2;                                        // catwalk deck top, thickness
  for (const s of [1, -1]){
    const z0 = s > 0 ? HZ1 - 2 : -HZ1, z1 = z0 + 2;                // against the wall's inner face
    ob(9.5, 103, z0, z1, CY - CT, CY, 'grating');
    const ze = s > 0 ? z0 : z1;                                    // the open edge
    for (const [a, b] of (s > 0 ? [[9.5, 19], [21, 91], [93, 101]] : [[9.5, 19], [21, 91], [93, 103]])) rail(a, b, ze - 0.03, ze + 0.03, CY);
    // the stairs: in line with the walk, down to the floor at each end
    const n = Math.ceil(CY / 0.19), rise = CY / n, G = 0.25;
    for (let k = 1; k < n; k++){ const top = k * rise;
      ob(103 + (n - 1 - k) * G, 103 + (n - k) * G, z0, z1, Math.max(0, top - 0.15), top, 'steptread');      // east: down toward +x
      ob(9.5 - (n - k) * G, 9.5 - (n - 1 - k) * G, z0, z1, Math.max(0, top - 0.15), top, 'steptread'); }    // west: down toward -x
  }
  for (const bx of [20, 92]){                                       // the bridges, wall to wall
    ob(bx - 1, bx + 1, -HZ1 + 2, HZ1 - 2, CY - CT, CY, 'grating');
    rail(bx - 1.03, bx - 0.97, -HZ1 + 2, HZ1 - 2, CY); rail(bx + 0.97, bx + 1.03, -HZ1 + 2, HZ1 - 2, CY);
  }
  // rails round the two turbine decks (x 43..69), open where their stairs come up (z +-30..+-36)
  for (const s of [1, -1]){
    const zc = 33 * s, za = zc - 14, zb = zc + 14, y = 3.2;
    rail(43, 69, za, za + 0.06, y); rail(43, 69, zb - 0.06, zb, y);
    for (const x of [43, 68.94]){ rail(x, x + 0.06, za + 0.06, zc - 3, y); rail(x, x + 0.06, zc + 3, zb - 0.06, y); }
  }
  // cooling water: pump riser, a run at 9m, a drop into the condenser's end
  for (const [px, pz, cx, cz] of [[35, -14, 35.5, -27.2], [35, 14, 35.5, 27.2], [77, -14, 76.5, -27.2], [77, 14, 76.5, 27.2]]){
    ob(px - 0.35, px + 0.35, pz - 0.35, pz + 0.35, 1.2, 9.4, 'cwpipe');
    ob(cx - 0.35, cx + 0.35, cz - 0.35, cz + 0.35, 2.6, 9.4, 'cwpipe');
  }
  P_LATE.push({ kind: 'cwruns', runs: [[35, -14, 35.5, -27.2], [35, 14, 35.5, 27.2], [77, -14, 76.5, -27.2], [77, 14, 76.5, 27.2]], y: 9 });
}

/* THE CONTROL ROOM (2026-11-23, the indoors brief, room 2: "a modern
   industrial control room with multiple computer monitors, control panels,
   switches, emergency buttons, desks, and large glass windows overlooking
   the turbine hall"). Jack wanted the rooms IN the hall: the west control
   block (x 6..22, z -6..6) is now a two-storey building you walk into -
   the shift office on the ground floor, and up a stair the control room,
   glazed all round from 3.9m so it overlooks the whole hall. It stays
   under the x 20 bridge (roof top 6.1, the bridge's underside 6.2). */
{
  const CR = { x0: 6, x1: 22, z0: -6, z1: 6, t: 0.3, h: 6.1, rt: 0.2 }, UP = 3.0;
  building(CR, [
    { face: 'E', a0: -1.2, a1: 1.2, y0: 0, y1: 2.4 }, { face: 'W', a0: -1.2, a1: 1.2, y0: 0, y1: 2.4 },     // ground floor doors
    { face: 'N', a0: 12, a1: 20, y0: 1.0, y1: 2.2, glass: true }, { face: 'S', a0: 12, a1: 20, y0: 1.0, y1: 2.2, glass: true },
    { face: 'N', a0: 6.3, a1: 21.7, y0: 3.9, y1: 5.6, glass: true }, { face: 'S', a0: 6.3, a1: 21.7, y0: 3.9, y1: 5.6, glass: true },
    { face: 'E', a0: -5.7, a1: 5.7, y0: 3.9, y1: 5.6, glass: true }, { face: 'W', a0: -5.7, a1: 5.7, y0: 3.9, y1: 5.6, glass: true },
  ], 'shedwall', 'shedroof');
  const ix0 = CR.x0 + CR.t, ix1 = CR.x1 - CR.t, iz0 = CR.z0 + CR.t, iz1 = CR.z1 - CR.t;
  // the upper floor, less the stairwell along the north wall
  for (const r of rectsMinus({ x0: ix0, x1: ix1, z0: iz0, z1: iz1 }, [{ x0: ix0, x1: 11.0, z0: iz0, z1: -4.0 }])) ob(r.x0, r.x1, r.z0, r.z1, UP - 0.2, UP, 'slab');
  { const n = Math.ceil(UP / 0.19), rise = UP / n, G = 0.28;                       // the stair: up toward +x
    for (let k = 1; k < n; k++){ const top = k * rise, x = ix0 + 0.2 + (k - 1) * G; ob(x, x + G, iz0, -4.1, Math.max(0, top - 0.15), top, 'steptread'); } }
  rail(ix0, 11.0, -4.03, -3.97, UP);                                                // round the stairwell, upstairs
  // ground floor: the shift office
  for (const [x, z] of [[14.5, 2.6], [18.5, 2.6]]) ob(x - 1.4, x + 1.4, z - 0.7, z + 0.7, 0, 0.75, 'desk');
  for (const [x, z, n] of [[14.5, 1.45, 1], [18.5, 1.45, 1], [14.5, 3.75, 0], [18.5, 3.75, 0]]) ob(x - 0.27, x + 0.27, z - 0.27, z + 0.27, 0, 0.95, n ? 'chairn' : 'chair');
  for (const z of [-5.15, -4.6]) ob(20.6, 21.6, z - 0.27, z + 0.27, 0, 1.32, 'cabinet');
  ob(12.2, 12.9, -5.65, -5.1, 0, 1.0, 'printer'); ob(21.15, 21.6, 5.1, 5.6, 0, 1.15, 'cooler');
  // upstairs: the control room - a U of consoles facing the glass, the plant's mimic panels, the shift supervisor's desk
  ob(12.0, 21.0, 4.3, 5.2, UP, UP + 0.8, 'console');                                // along the south glass
  ob(20.1, 21.0, -3.0, 4.3, UP, UP + 0.8, 'console');                               // along the east glass, facing the turbines
  ob(12.0, 20.1, -5.6, -4.7, UP, UP + 0.8, 'console');                              // along the north glass
  for (const [x, z, n] of [[14, 3.6, 1], [17, 3.6, 1], [19.4, 0, 0], [19.4, -2.4, 0], [15, -4.0, 0], [18, -4.0, 0]]) ob(x - 0.27, x + 0.27, z - 0.27, z + 0.27, UP, UP + 0.95, n ? 'chairn' : 'chair');
  ob(ix0, ix0 + 0.6, -3.0, 5.0, UP, UP + 2.4, 'switch');                            // mimic / relay panels on the west wall
  ob(13.0, 15.6, -1.2, 0.2, UP, UP + 0.75, 'desk');                                 // the supervisor's desk
  P_LATE.push({ kind: 'ceilinglights', x0: ix0, x1: ix1, z0: iz0, z1: iz1, levels: [UP - 0.25, CR.h - CR.rt - 0.05], holes: [[ix0, 11.0, iz0, -4.0]], extra: [] });
  GROUND_MORE.push({ k: 'floor', x0: ix0, z0: iz0, x1: ix1, z1: iz1 });             // the office's tiled floor
}

/* THE HALL OFFICE, LEVEL TWO (2026-11-23). Jack: "the office should be at
   the bottom right of the room looking from the map ... at level two". On
   the plan (north up) that is the hall's south-east corner: the office
   stands on the corner block there (x 103..113, z 47..57), its floor at the
   catwalk's 6.4m, raised on a concrete base over the block. A landing off
   the end of the south catwalk leads to its door in the west wall; it is
   glazed north and west, over the turbines and down the hall. */
{
  const X0 = 103, X1 = 113, Z0 = 47, Z1 = 57, F = 6.4, T = 0.3, TOP = 9.4, SILL = 7.3, HEAD = 8.9;
  ob(X0, X1, Z0, Z1, 4.4, F, 'core');                                              // the base, on the corner block (4.4 high)
  ob(X0, X1, Z0, Z1, TOP, TOP + 0.2, 'shedroof');
  const band = (axis, t0, t1, a0, a1) => {                                         // a window band: sill, glass, head
    const B = (p0, p1, y0, y1, mat, u0, u1) => axis === 'x' ? ob(p0, p1, u0, u1, y0, y1, mat) : ob(u0, u1, p0, p1, y0, y1, mat);
    B(a0, a1, F, SILL, 'shedwall', t0, t1); B(a0, a1, HEAD, TOP, 'shedwall', t0, t1);
    B(a0, a1, SILL, HEAD, 'glass', (t0 + t1) / 2 - 0.03, (t0 + t1) / 2 + 0.03);
  };
  band('x', Z0, Z0 + T, X0, X1);                                                   // north: over the turbines
  band('z', X0, X0 + T, Z0 + T, 55.0);                                             // west: down the hall
  ob(X0, X0 + T, 55.0, 55.3, F, TOP, 'shedwall'); ob(X0, X0 + T, 56.7, Z1 - T, F, TOP, 'shedwall');
  ob(X0, X0 + T, 55.3, 56.7, F + 2.2, TOP, 'shedwall');                            // over the door
  ob(X1 - T, X1, Z0 + T, Z1 - T, F, TOP, 'shedwall');                              // east
  ob(X0, X1, Z1 - T, Z1, F, TOP, 'shedwall');                                      // south, over the stair
  // the landing off the catwalk's end, and its rails
  ob(101, X0, 55.0, Z1, F - 0.2, F, 'grating');
  rail(100.97, 101.03, 55.0, Z1, F); rail(101.03, X0, 54.97, 55.03, F);
  // inside: two desks with their chairs, the manager's desk, a small meeting table, filing, a plant
  const ix0 = X0 + T, ix1 = X1 - T, iz0 = Z0 + T, iz1 = Z1 - T;
  for (const z of [49.4, 52.4]){ ob(105.0, 107.8, z - 0.7, z + 0.7, F, F + 0.75, 'desk'); ob(105.0, 107.8, z - 0.025, z + 0.025, F + 0.75, F + 1.2, 'screen');
    for (const [x, n] of [[105.8, 1], [107.0, 1]]) { ob(x - 0.27, x + 0.27, z - 1.25, z - 0.71, F, F + 0.95, 'chairn'); ob(x - 0.27, x + 0.27, z + 0.71, z + 1.25, F, F + 0.95, 'chair'); } }
  ob(109.8, 112.4, 47.7, 49.0, F, F + 0.75, 'desk'); ob(110.8, 111.35, 49.05, 49.6, F, F + 0.95, 'chair');   // the manager's desk, by the north glass
  ob(109.6, 111.6, 52.6, 54.0, F, F + 0.75, 'desk');                                // meeting table
  for (const x of [110.0, 111.2]){ ob(x - 0.25, x + 0.25, 52.05, 52.55, F, F + 0.95, 'chairn'); ob(x - 0.25, x + 0.25, 54.05, 54.55, F, F + 0.95, 'chair'); }
  for (const x of [110.6, 111.2, 111.8]) ob(x - 0.28, x + 0.28, iz1 - 0.6, iz1, F, F + 1.32, 'cabinet');
  ob(ix0 + 0.1, ix0 + 0.6, iz0 + 0.1, iz0 + 0.6, F, F + 1.25, 'plant');
  P_LATE.push({ kind: 'ceilinglights', x0: ix0, x1: ix1, z0: iz0, z1: iz1, levels: [TOP - 0.05], holes: [], extra: [] });
}

/* THE MAINTENANCE WORKSHOP (2026-11-23, the indoors brief, room 5: "a
   realistic repair area containing workbenches, toolboxes, spare machinery
   parts, welding equipment, storage cabinets, and industrial equipment").
   In the hall, as Jack wants the rooms: an enclosed shop in its north-east
   corner (top right on the plan), x 88..109, z -44..-27, 4.5m. A roll-up
   door west onto the hall floor, a door north, windows west. Benches with
   a pegboard of tools along the north wall, red tool chests, a pillar
   drill, a welding bay behind screens with its set and gas bottles, a
   spare turbine rotor on stands in the middle, spares on pallets, tall
   storage cabinets along the south wall. */
{
  const WS = { x0: 88, x1: 109, z0: -44, z1: -27, t: 0.3, h: 4.5, rt: 0.3 };
  building(WS, [
    { face: 'W', a0: -37.5, a1: -33.5, y0: 0, y1: 3.6 },                              // roll-up door to the hall
    { face: 'N', a0: 99, a1: 101, y0: 0, y1: 2.4 },
    { face: 'W', a0: -43, a1: -39, y0: 1.1, y1: 2.2, glass: true }, { face: 'W', a0: -32, a1: -28, y0: 1.1, y1: 2.2, glass: true },
  ], 'shedwall', 'shedroof');
  const iz0 = WS.z0 + WS.t, iz1 = WS.z1 - WS.t, ix1 = WS.x1 - WS.t;
  ob(89.0, 91.6, iz0, iz0 + 0.8, 0, 0.92, 'workbench'); ob(92.0, 94.6, iz0, iz0 + 0.8, 0, 0.92, 'workbench');
  ob(95.2, 95.9, iz0, iz0 + 0.6, 0, 1.1, 'toolchest'); ob(96.0, 96.7, iz0, iz0 + 0.6, 0, 1.1, 'toolchest');
  ob(97.3, 97.9, iz0, iz0 + 0.7, 0, 1.8, 'drillpress');
  // the welding bay, east end, screened off
  ob(101.97, 102.03, iz0, -39.4, 0, 1.9, 'weldscreen'); ob(102.03, 105.2, -37.03, -36.97, 0, 1.9, 'weldscreen');
  ob(106.0, 107.0, iz0, iz0 + 0.6, 0, 0.9, 'welder');
  ob(104.4, 106.6, -41.2, -40.2, 0, 0.85, 'workbench');
  box(108.0, -38.6, 0.8, 1.3, 1.9, 'gascage');                                       // (kit() is defined later in the file: plain boxes here)
  // the spare rotor on its stands, spares on pallets
  ob(91.5, 98.5, -35.4, -34.0, 0, 1.5, 'rotor');
  box(99.2, -30.6, 1.2, 1.0, 1.35, 'palletload'); box(101.0, -30.4, 1.2, 1.0, 0.86, 'pallets'); box(91.4, -28.7, 1.22, 1.22, 1.08, 'drums4'); box(96.8, -31.2, 0.5, 0.9, 1.0, 'toolcart');
  for (let i = 0; i < 5; i++) ob(103.0 + i * 0.82, 103.8 + i * 0.82, iz1 - 0.6, iz1, 0, 1.9, 'cabinet');   // tall storage cabinets
  PAINT_EXTRA_LATE.push({ k: 'keep', x: 95, z: -34.7, w: 8.4, d: 2.8 });
  P_LATE.push({ kind: 'ceilinglights', x0: WS.x0 + WS.t, x1: ix1, z0: iz0, z1: iz1, levels: [WS.h - WS.rt - 0.05], holes: [], extra: [] });
  P_LATE.push({ kind: 'pegboard', x0: 89.0, x1: 94.6, z: iz0 + 0.01, y0: 1.2, y1: 2.4 });
}

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

note('THE BOILER HOUSE, against the hall\'s north wall: a hollow steel hall');
/* Jack: "i wanted there to be a indoor at the boiler house too". What a
   real one is inside: a tall steel-framed shed round the boilers, with steel
   grating galleries at each working level, straight steel stairs between
   them, handrails round the open middle, and the fans and mills on the
   ground. The galleries sit where the facade's floor bands and window
   bands always said they were: 7.6, 14 and 21, windows 1.8-2.4m above each.
   Doors: a 5.5m roll-up door south (toward the hall's north door), a door
   onto the pipe rack from the first gallery (west), a ground door and the
   flue duct east, to the stack. */
const BH = { x0: 29, x1: 83, z0: -96, z1: -68, t: 0.5, h: 28, rt: 0.4 };
const BOILERS = [];                 // the boilers' props, added to P once it exists
const BGAL = [7.6, 14, 21];
const BAND = [[9.4, 11.6], [16.4, 18.6], [23.4, 25.2]];
/* The stack moved 8m south (z -96 -> -88), onto the line of a door in the
   boiler house's east wall, so a corridor and the flue duct run straight
   into it. Jack: "i want to be able to go inside the stack from the
   boiler house". */
const STK = { x: 96, z: -88, ro: 3, ri: 2.5, h: 68 };
const LINK = { z0: -89.5, z1: -86.5 };                        // the ground corridor and the flue duct, 3m wide
const bOps = [
  { face: 'S', a0: 50, a1: 55.5, y0: 0, y1: 5 },                         // the roll-up door
  { face: 'W', a0: -85.2, a1: -82.6, y0: BGAL[0], y1: 11.6 },            // onto the pipe rack
  { face: 'E', a0: LINK.z0, a1: LINK.z1, y0: 0, y1: 3.5 },               // to the stack, on the ground
  { face: 'E', a0: LINK.z0, a1: LINK.z1, y0: BGAL[1], y1: 17.5 },        // and through the flue duct
];
for (const [y0, y1] of BAND){
  bOps.push({ face: 'N', a0: BH.x0 + 1, a1: BH.x1 - 1, y0, y1, glass: true });
  bOps.push({ face: 'S', a0: BH.x0 + 1, a1: BH.x1 - 1, y0, y1, glass: true });
  /* the ends' bands stop either side of a door that reaches into them */
  const W = y0 === 9.4 ? [[BH.z0 + 1, -85.2], [-82.6, BH.z1 - 1]] : [[BH.z0 + 1, BH.z1 - 1]];
  const E = y0 === 16.4 ? [[BH.z0 + 1, LINK.z0], [LINK.z1, BH.z1 - 1]] : [[BH.z0 + 1, BH.z1 - 1]];
  for (const [a0, a1] of W) bOps.push({ face: 'W', a0, a1, y0, y1, glass: true });
  for (const [a0, a1] of E) bOps.push({ face: 'E', a0, a1, y0, y1, glass: true });
}
building(BH, bOps, 'bwall', 'boilerroof');
{
  const ix0 = BH.x0 + BH.t, ix1 = BH.x1 - BH.t, iz0 = BH.z0 + BH.t, iz1 = BH.z1 - BH.t;
  /* THE TWO BOILERS (2026-11-22). They were two solid 11 x 14 x 24 m
     blocks. Jack: "the main issue is the two big blocks that doesnt resemble
     or do anything nor can i go inside". A utility boiler is a furnace: a
     tall box of water-wall tubes, clad outside in aluminium lagging and held
     by buckstays - steel bands round it every few metres - with the burners
     on its front wall, the steam drum across the top and the downcomers
     down its corners. Each is now hollow, with the furnace's access door at
     the foot of the side facing the walkway between them: inside, tube
     walls, burner throats glowing on the front wall, the superheater platens
     hanging under the roof, an ash hopper floor - the furnace as it is
     during an outage. Collision is its walls and roof (`boilerwall`, drawn
     by the `boiler` prop). */
  for (const [bx0, bx1, face] of [[36, 47, 'E'], [52, 63, 'W']]){
    const B = { x0: bx0, x1: bx1, z0: -89, z1: -75, t: 0.4, h: 24, rt: 0.6 }, door = { face, a0: -83.2, a1: -80.8, y0: 0, y1: 2.4 };
    building(B, [door], 'boilerwall', 'boilerwall');
    BOILERS.push({ kind: 'boiler', x0: bx0, x1: bx1, z0: -89, z1: -75, h: 24, t: 0.4, rt: 0.6, door });   // props are gathered later (P)
  }
  /* The open middle round them, either side of a walkway bridge between. */
  const voidA = { x0: 33.5, x1: 48.5, z0: -92.5, z1: -71.5 }, voidB = { x0: 50.5, x1: 66, z0: -92.5, z1: -71.5 };
  /* Stairs up the west end, two flights side by side (A west, B east). */
  const A = [ix0, 31.3], Bs = [31.7, 33.5];
  const a0end = steelStair(A[0], A[1], -95, 1, 0, BGAL[0]);              // ground -> 7.6, arriving at -85.25
  const b1end = steelStair(Bs[0], Bs[1], a0end, -1, BGAL[0], BGAL[1]);   // 7.6 -> 14, back to -93.5
  const a2end = steelStair(A[0], A[1], b1end, 1, BGAL[1], BGAL[2]);      // 14 -> 21, out to -84.5
  const stairHole = [
    { x0: A[0], x1: A[1], z0: -95, z1: a0end },
    { x0: Bs[0], x1: Bs[1], z0: b1end, z1: a0end },
    { x0: A[0], x1: A[1], z0: b1end, z1: a2end },
  ];
  BGAL.forEach((L, i) => {
    for (const r of rectsMinus({ x0: ix0, x1: ix1, z0: iz0, z1: iz1 }, [voidA, voidB, stairHole[i]]))
      ob(r.x0, r.x1, r.z0, r.z1, L - 0.2, L, 'grating');
    /* Rails round the open middle, standing just inside its edge. */
    for (const v of [voidA, voidB]){
      rail(v.x0, v.x1, v.z0, v.z0 + 0.1, L - 0.2);
      rail(v.x0, v.x1, v.z1 - 0.1, v.z1, L - 0.2);
      rail(v.x0, v.x0 + 0.1, v.z0 + 0.1, v.z1 - 0.1, L - 0.2);
      rail(v.x1 - 0.1, v.x1, v.z0 + 0.1, v.z1 - 0.1, L - 0.2);
    }
  });
  /* Rails round each stairwell on the floor it comes up through, open on
     the side you step off. Flight A arrives at its north end, B at its south. */
  rail(A[1], A[1] + 0.1, -95, a0end, BGAL[0]);     rail(A[0], A[1], -95.1, -95, BGAL[0]);
  rail(Bs[0] - 0.1, Bs[0], b1end, a0end, BGAL[1]); rail(Bs[0], Bs[1], a0end, a0end + 0.1, BGAL[1]);
  rail(A[1], A[1] + 0.1, b1end, a2end, BGAL[2]);   rail(A[0], A[1], b1end - 0.1, b1end, BGAL[2]);
  /* The ground floor: induced-draught fans and the coal mills, east, and
     the burner feed in front of each boiler. */
  ob(70, 76, -93, -88.5, 0, 3.2, 'machine');
  ob(70, 76, -76, -71, 0, 3.2, 'machine');
  ob(77, 81, -84, -79, 0, 4.5, 'machine');
  ob(37, 46, -73.4, -72.2, 0, 1.2, 'machine');
  ob(53, 62, -73.4, -72.2, 0, 1.2, 'machine');
  /* (2026-11-22) and the rest of what stands on a boiler house floor: the
     boiler feed pumps along the north wall, their control panel, the local
     instrument racks, a cable drum and a hose by the walkway. */
  for (const x of [39, 44.5, 54.5, 60]) ob(x - 1.4, x + 1.4, -94.2, -92.4, 0, 1.7, 'machine');
  ob(49, 51, -95.4, -94.6, 0, 2.2, 'switch');
  ob(47.6, 48.4, -91, -90, 0, 1.9, 'switch'); ob(50.6, 51.4, -91, -90, 0, 1.9, 'switch');
  /* On the galleries: an air heater on the second, fans on the third. */
  ob(70, 78, -80, -74, BGAL[1], BGAL[1] + 3, 'machine');
  ob(72, 76, -94, -91, BGAL[2], BGAL[2] + 2.2, 'machine');
}

note('THE LINK TO THE STACK: a corridor on the ground, the flue duct at 14m');
ob(BH.x1, 93.15, LINK.z0 - 0.3, LINK.z0, 0, 3.5, 'shedwall');
ob(BH.x1, 93.15, LINK.z1, LINK.z1 + 0.3, 0, 3.5, 'shedwall');
ob(BH.x1, 93.15, LINK.z0 - 0.3, LINK.z1 + 0.3, 3.5, 3.8, 'shedroof');
/* The flue duct: you walk in it, from the second gallery into the stack. */
ob(BH.x1, 93.15, LINK.z0 - 0.3, LINK.z1 + 0.3, 13.8, 14, 'grating');
ob(BH.x1, 93.15, LINK.z0 - 0.3, LINK.z0, 14, 17.5, 'duct');
ob(BH.x1, 93.15, LINK.z1, LINK.z1 + 0.3, 14, 17.5, 'duct');
ob(BH.x1, 93.15, LINK.z0 - 0.3, LINK.z1 + 0.3, 17.5, 17.8, 'duct');
ob(93.15, 93.7, -88.75, -87.25, 13.8, 14, 'grating');                    // over the stack's wall
ob(93.7, 96.6, -88.75, -87.25, 13.8, 14, 'grating');                    // the landing inside

note('THE STACK: hollow, a door at its foot and the flue opening at 14m');
/* A round wall can only be AXIS-ALIGNED BOXES here, so it is 36 of them,
   each the bounding box of one 10-degree piece of the ring (r 2.5..3). They
   overlap inward by at most a quarter metre at the diagonals, which the
   body's 0.4m never reaches. The four west pieces (160..200 degrees) leave
   the two doorways out. */
for (let i = 0; i < 36; i++){
  const a0 = i * 10 * Math.PI / 180, a1 = (i + 1) * 10 * Math.PI / 180, mid = i * 10 + 5;
  const xs = [], zs = [];
  for (const r of [STK.ri, STK.ro]) for (const a of [a0, a1]){ xs.push(STK.x + r * Math.cos(a)); zs.push(STK.z + r * Math.sin(a)); }
  const ys = (mid > 160 && mid < 200) ? [[3.8, 13.8], [17.8, STK.h]] : [[0, STK.h]];
  for (const [y0, y1] of ys) ob(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), y0, y1, 'stackwall');
}

note('THE SWITCHYARD, south-west: seven portals, a bay of gear under each span, fenced');
/* (2026-11-22) Jack: "why does this look so empty, where are the wires on
   top". It was fourteen lattice legs holding nothing - the conductors over
   them were the `busbars` that also ran on across the site and were taken
   out. Rebuilt as a working outdoor yard:
   - each pair of legs (north row z 78, south row z 94) is a PORTAL: a
     lattice beam across at 12.3-13m, an earth peak on every leg;
   - three phase conductors (z 82 / 86 / 90) run the length of the yard on
     insulator strings under the beams, an earth wire along each row;
   - under every span a BAY: disconnector, three-pole breaker, current
     transformers, each phase dropped from the bus and jumpered through;
   - the line comes IN at the east end from the HV compound's corner tower
     (-24, 40) onto an entry beam along the north row, and goes OUT at the
     west end to a terminal tower outside the wall and on west on pylons;
   - a palisade fence (stops a player, not a shot: MOVE_ONLY), gates to the
     road, the laydown yard and the HV strip, danger signs, two floodlight
     masts, kiosks, cable trench covers.
   Everything overhead is drawn by the `switchyard` prop and is not
   collision. What stands on the ground is a box. */
const SY = { xs: [-110, -96, -82, -68, -54, -40, -26], zN: 78, zS: 94, ph: [82, 86, 90],
             fence: { x0: -114.5, x1: -21.5, z0: 75, z1: 97 },
             gates: { N: [[-112.8, -108.8], [-63, -59]], S: [[-30.5, -26.5]], W: [], E: [[84, 88]] } };
for (const z of [SY.zN, SY.zS]) for (const x of SY.xs) box(x, z, 1.4, 1.4, 13, 'lattice');
for (let i = 0; i < SY.xs.length - 1; i++){
  const xc = (SY.xs[i] + SY.xs[i + 1]) / 2;
  box(xc, 86, 2.2, 8.6, 2.4, 'breaker');                                   // three poles along z, one per phase
  for (const z of SY.ph){ box(xc - 4.2, z, 0.5, 0.5, 2.6, 'hviso'); box(xc + 4.2, z, 0.5, 0.5, 2.6, 'hvct'); }
}
box(-89, 76.45, 2.4, 1.1, 2.2, 'kiosk'); box(-47, 76.45, 2.4, 1.1, 2.2, 'kiosk');
box(-113.2, 95.6, 0.6, 0.6, 16, 'mast'); box(-22.8, 76.4, 0.6, 0.6, 16, 'mast');
{ const F = SY.fence, FH = 2.6, t = 0.05, runs = (a0, a1, gs) => {
    const o = []; let a = a0; for (const [g0, g1] of gs.slice().sort((p, q) => p[0] - q[0])){ o.push([a, g0]); a = g1; } o.push([a, a1]); return o; };
  SY.runs = [];
  for (const [a, b] of runs(F.x0, F.x1, SY.gates.N)){ ob(a, b, F.z0 - t, F.z0 + t, 0, FH, 'palisade'); SY.runs.push([a, F.z0, b, F.z0]); }
  for (const [a, b] of runs(F.x0, F.x1, SY.gates.S)){ ob(a, b, F.z1 - t, F.z1 + t, 0, FH, 'palisade'); SY.runs.push([a, F.z1, b, F.z1]); }
  for (const [a, b] of runs(F.z0 + t, F.z1 - t, SY.gates.W)){ ob(F.x0 - t, F.x0 + t, a, b, 0, FH, 'palisade'); SY.runs.push([F.x0, a, F.x0, b]); }
  for (const [a, b] of runs(F.z0 + t, F.z1 - t, SY.gates.E)){ ob(F.x1 - t, F.x1 + t, a, b, 0, FH, 'palisade'); SY.runs.push([F.x1, a, F.x1, b]); }
  SY.fh = FH;
}
BOILERS.push({ kind: 'switchyard', xs: SY.xs, zN: SY.zN, zS: SY.zS, ph: SY.ph, fh: SY.fh, runs: SY.runs,
  kiosks: [[-89, 77.0], [-47, 77.0]],
  /* in from the compound's north-east corner tower, onto a beam along the
     north row between the last two portals; out from the west portal to a
     terminal tower 40m beyond the wall (lighting.js draws that tower and
     the pylons after it in the far world from these same numbers) */
  entry: { tx: -24, tz: 40, th: 26, xs: [-37, -33, -29], x0: -40, x1: -26 },
  exit: { x: -150, z: 86, y: 17.6, peak: 21.5 } });

note('THE OIL TANKS, the far south-west corner');
for (const [tx, tz] of [[-100, 108], [-80, 112], [-60, 106]]) drum(tx, tz, 6.0, 10.0, 'tank');

note('THE QUAY, south-east: the intake house and the screens');
/* Jack: "the three buildings behind the office i want those to have
   indoors too". The intake house (the pumps that draw cooling water) and
   two workshops, now hollow: clad walls on a concrete base, a door facing
   the office, a high window band, and what each would hold. */
building({ x0: 25, x1: 55, z0: 99, z1: 109, t: 0.3, h: 4, rt: 0.3 }, [
  { face: 'N', a0: 38, a1: 40.4, y0: 0, y1: 2.6 },
  { face: 'E', a0: 102, a1: 104.4, y0: 0, y1: 2.6 },
  { face: 'N', a0: 26, a1: 37, y0: 2.8, y1: 3.4, glass: true }, { face: 'N', a0: 41.4, a1: 54, y0: 2.8, y1: 3.4, glass: true },
  { face: 'S', a0: 26, a1: 54, y0: 2.8, y1: 3.4, glass: true },
], 'shedwall', 'intakeroof');
for (const x of [30, 36, 44, 50]) ob(x - 1.2, x + 1.2, 104.6, 106.2, 0, 1.4, 'machine');   // the pumps
ob(27, 53, 107.2, 108.4, 0, 1.2, 'pipe');                                                  // and their header
building({ x0: 71, x1: 85, z0: 99.5, z1: 108.5, t: 0.3, h: 5, rt: 0.3 }, [
  { face: 'N', a0: 75, a1: 79, y0: 0, y1: 3.6 },
  { face: 'N', a0: 72, a1: 74, y0: 2.4, y1: 3.6, glass: true }, { face: 'N', a0: 80, a1: 84, y0: 2.4, y1: 3.6, glass: true },
  { face: 'S', a0: 72, a1: 84, y0: 2.6, y1: 3.8, glass: true },
], 'shedwall', 'shedroof');
ob(71.3, 72.3, 101, 108.2, 0, 2.4, 'machine');                                             // racking along the west wall
ob(78, 83, 106.6, 108.2, 0, 0.9, 'desk');                                                  // the workbench
ob(80, 81.2, 102, 103.2, 0, 1.2, 'crate'); ob(81.4, 82.6, 102, 103.2, 0, 1.2, 'crate');
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
/* STANDING ON THE PIPES (2026-11-21). Jack: "i want to be able to climb the
   ladders and stand on the pips". Each rack gets a walking surface the
   width of its frame, from the beams (6.6) to the crowns of the pipes
   (7.6 - the biggest lagged line stands 12cm proud of it), stopping where
   the pipes enter the tower shells and, for the east rack, at the boiler
   house wall - where a door on the first gallery opens onto it. Drawn by
   the rack itself, so the box is `pipewalk`, which draws nothing. */
ob(-65.6, -32.4, RACK_Z - 1.4, RACK_Z + 1.4, RACK_Y, RACK_Y + 1.0, 'pipewalk');
ob(-15.6, 29, RACK_Z - 1.4, RACK_Z + 1.4, RACK_Y, RACK_Y + 1.0, 'pipewalk');
/* And the two pipe bridges over the north road: three lagged lines at
   9.5m, crowns at 9.82, truss under them - from the boiler house wall to
   the hall's. */
for (const bx of [40, 66]) ob(bx - 1.45, bx + 1.45, -68, -60.5, 8.75, 9.82, 'pipewalk');

note('a workshop or two');
/* Jack (2026-11-21): "for that one small room beside the cooling towers i
   want that to be indoors". It is the cooling water's dosing house - what
   stands next to a real tower: dosing pumps, chemical tanks in a bund, a
   panel, a bench. Hollow now, the same way as the quay buildings: a door
   north toward the towers, a door east toward the site, a high window
   band, the same 14 x 12 x 7 footprint it always had. */
building({ x0: -107, x1: -93, z0: -66, z1: -54, t: 0.3, h: 7, rt: 0.3 }, [
  { face: 'N', a0: -102, a1: -98, y0: 0, y1: 3.6 },
  { face: 'E', a0: -61.2, a1: -58.8, y0: 0, y1: 2.6 },
  { face: 'N', a0: -106, a1: -103, y0: 4.4, y1: 5.6, glass: true }, { face: 'N', a0: -97, a1: -94, y0: 4.4, y1: 5.6, glass: true },
  { face: 'S', a0: -106, a1: -94, y0: 4.4, y1: 5.6, glass: true },
  { face: 'W', a0: -64, a1: -56, y0: 4.4, y1: 5.6, glass: true },
], 'shedwall', 'shedroof');
ob(-106.7, -102.4, -56.6, -54.3, 0, 0.45, 'concrete');                                       // the bund...
ob(-106.4, -104.6, -56.2, -54.6, 0.45, 2.6, 'machine'); ob(-104.3, -102.7, -56.2, -54.6, 0.45, 2.6, 'machine');   // ...and its two tanks
for (const x of [-99.5, -96.5]) ob(x - 0.7, x + 0.7, -56, -54.6, 0, 1.2, 'machine');        // the dosing pumps
ob(-100.6, -95.4, -54.9, -54.3, 1.6, 2.2, 'pipe');                                           // and their header
ob(-106.7, -105.9, -63.5, -59, 0, 2.2, 'switch');                                            // the panel, on the west wall
ob(-100, -95.5, -65.7, -64.9, 0, 0.9, 'desk');                                               // a bench under the north windows
ob(-97, -95.8, -62.5, -61.3, 0, 1.2, 'crate');
/* The tall workshop: a mezzanine store at 3.2m, up a ladder. */
building({ x0: 93, x1: 107, z0: 94, z1: 106, t: 0.3, h: 7, rt: 0.3 }, [
  { face: 'N', a0: 98, a1: 102, y0: 0, y1: 4.5 },
  { face: 'N', a0: 94, a1: 97, y0: 4.6, y1: 5.8, glass: true }, { face: 'N', a0: 103, a1: 106, y0: 4.6, y1: 5.8, glass: true },
  { face: 'S', a0: 94, a1: 106, y0: 4.6, y1: 5.8, glass: true },
], 'shedwall', 'shedroof');
ob(93.3, 100, 101, 105.7, 3.0, 3.2, 'grating');                                            // the mezzanine
rail(93.3, 96, 100.9, 101, 3.2); rail(97, 100, 100.9, 101, 3.2);                           // with a gap at the ladder
rail(100, 100.1, 100.9, 105.7, 3.2);
ob(94, 95.2, 103, 104.2, 3.2, 4.4, 'crate'); ob(95.6, 96.8, 103.5, 104.7, 3.2, 4.4, 'crate');
ob(103, 106.6, 103.4, 105.6, 0, 0.9, 'desk');                                               // workbench
ob(101, 102.2, 96, 97.2, 0, 1.2, 'crate'); ob(104, 106.6, 96.5, 98.5, 0, 1.6, 'machine');   // a lathe

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
/* DRESSING THE OFFICES (2026-11-23, the Saltline list): what an open-plan
   floor actually holds besides desks - a chair at every place, the meeting
   table's chairs, filing cabinets, a printer and a water cooler by the
   core, plants. Placed by `place`, which refuses anything that would stand
   in another box at a shared height and says so. */
let PLACED = 0, REFUSED = 0;
function place(kind, x0, x1, z0, z1, y0, h){
  for (const o of out){
    if (o.note) continue;
    const oy = o.y || 0;
    if (x1 > o.x - o.w / 2 + 0.01 && x0 < o.x + o.w / 2 - 0.01 && z1 > o.z - o.d / 2 + 0.01 && z0 < o.z + o.d / 2 - 0.01 &&
        y0 < oy + o.h - 0.01 && oy < y0 + h - 0.01){
      console.log(`  office refused: ${kind} at ${((x0 + x1) / 2).toFixed(1)},${((z0 + z1) / 2).toFixed(1)} y${y0} hits ${o.mat} at ${o.x},${o.z}`); REFUSED++; return false; }
  }
  ob(x0, x1, z0, z1, y0, y0 + h, kind); PLACED++; return true;
}
const sq = (kind, x, z, w, d, y0, h) => place(kind, x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, h);
LV.forEach((L, s) => {
  const clusters = [[62.4, 83.2], [66.2, 83.2], [62.4, 87.4], [66.2, 87.4], [84.0, 83.0], [87.8, 83.0]];
  if (s === 2) clusters.push([71, 83.2], [77, 83.2]);
  /* 'chairn' has its back to the north (-z): the chairs on a desk's north side face south, into it */
  for (const [cx, cz] of clusters) for (const dx of [-0.8, 0.8]) for (const dz of [-1.15, 1.15]) sq(dz < 0 ? 'chairn' : 'chair', cx + dx, cz + dz, 0.55, 0.55, L, 0.95);
  for (const x of [85.0, 86.4, 87.8]) for (const z of [88.12, 90.66]) sq(z < 89 ? 'chairn' : 'chair', x, z, 0.5, 0.5, L, 0.95);   // the meeting table
  for (const z of [81.0, 81.55]) sq('cabinet', 59.95, z, 0.5, 0.55, L, 1.32);                                  // filing, west bay
  for (const z of [81.0, 81.55]) sq('cabinet', 90.7, z, 0.5, 0.55, L, 1.32);                                   // and east
  sq('printer', 71.0, 89.9, 0.7, 0.55, L, 1.0);                                                               // by the core
  sq('cooler', 80.55, 88.9, 0.36, 0.36, L, 1.15);
  for (const [x, z] of [[56.0, 80.95], [94.0, 80.95], [69.0, 91.2], [82.6, 86.5]]) sq('plant', x, z, 0.5, 0.5, L, 1.25);
});
console.log(`  office dressing: ${PLACED} placed, ${REFUSED} refused`);

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
P.push(...BOILERS, ...P_LATE);                 // the two furnaces (THE TWO BOILERS), and the switchyard's overhead (THE SWITCHYARD)
/* The hall's own light (2026-11-22): high-bay lamps every 12m under the
   roof, where the crane leaves room. Until now the hall had no fittings at
   all and was lit, unseen, by the sky through a roof the bake could not
   see; now its roof is solid to the light but for the rooflights, and
   these light it (lighting.js litPanelLights). */
P.push({ kind: 'highbay', x0: HX0 + 6, x1: HX1 - 6, z0: HZ0 + 6, z1: HZ1 - 6, y: HH - 1.2, step: 12 });
P.push({ kind: 'coolingtower', x: -74, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA ,
         door: { a: 0, half: 0.95 },
         rim: { y: 33.5, half: 0.7, rail: 1.1, gateA: +Math.atan2(0.93, 0.36).toFixed(4), gate: 0.75 } });
P.push({ kind: 'coolingtower', x: -24, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA ,
         door: { a: 0, half: 0.95 },
         rim: { y: 33.5, half: 0.7, rail: 1.1, gateA: +Math.atan2(0.93, 0.36).toFixed(4), gate: 0.75 } });
/* The stack, hollow (see THE STACK above): its wall is drawn as a ring
   with the two west doorways left out, matching the 36 boxes. */
P.push({ kind: 'stack', x: STK.x, z: STK.z, r: STK.ro, ri: STK.ri, h: STK.h, n: 9,
         doors: [[160, 200, 0, 3.8], [160, 200, 13.8, 17.8]] });
/* Overhead plant (stage 4). The rack pipes run INTO the tower shells at 7m,
   where the shell's radius is 10.15 - so from x -15.8 / -32.2 / -65.8 at
   z -84. Two pipe bridges carry steam over the north road from the boiler
   house into the hall at 9.5m; a flue duct joins the boiler house to the
   stack at 16-20m. None of it is reachable and none of it is a floor. */
P.push({ kind: 'piperack', x0: -61, x1: -37, px0: -65.8, px1: -32.2, z: RACK_Z, y: RACK_Y, legs: [-56, -48, -42] });
P.push({ kind: 'piperack', x0: -11, x1: 29, px0: -15.8, px1: 29, z: RACK_Z, y: RACK_Y, legs: [-6, 2, 10, 18, 26] });
P.push({ kind: 'pipebridge', x: 40, z0: -68, z1: -60, y: 9.5, rise: 25 });
P.push({ kind: 'pipebridge', x: 66, z0: -68, z1: -60, y: 9.5, rise: 25 });   // between the boiler house's columns (62.75, 69.5); at 68 its risers grazed one
/* The offices' ceiling lights: under the first-floor slab, the second, and
   the roof. Kept out of both stairwells and the core; the lowest also
   skips the void over the lobby (the panels there are the next ceiling up). */
P.push({ kind: 'ceilinglights', x0: OX0 + OT, x1: OX1 - OT, z0: OZ0 + OT, z1: OZ1 - OT,
         levels: [LV[1] - SLAB, LV[2] - SLAB, ROOFY - SLAB],
         holes: [[OX0 + OT, OX0 + OT + 4.25, CZN, OZ1], [OX1 - OT - 4.25, OX1 - OT, CZN, OZ1], [72, 80, 88.4, OZ1]],
         extra: [[[68, 82, OZ0, 84.5]]] });
/* LADDERS (2026-11-21). A ladder is a climb line: where your feet go as
   you climb (x, z, or `path` [[x, y, z], ...] for one that follows a
   curve), from y0 to y1; `n` points out from the wall, toward where you
   hang; `e` is the step you take off the top onto the floor there. The
   two on the cooling towers are drawn by the towers themselves
   (`draw: false`); the rest draw their own rails and rungs. */
const LAD = (o) => P.push(Object.assign({ kind: 'ladder' }, o));
for (const x of [-48, 10])                                              // up a rack leg to the pipes
  LAD({ x, z: RACK_Z + 1.2 + 0.225 + 0.5, nx: 0, nz: 1, y0: 0, y1: RACK_Y + 1.0, ex: 0, ez: -1.0 });
for (const bx of [40, 66])                                              // up the hall wall, beside a pipe bridge
  LAD({ x: bx + 2.3, z: -61.0, nx: 0, nz: -1, y0: 0, y1: 9.82, ex: -1.6, ez: 0 });
LAD({ x: STK.x + STK.ri - 0.55, z: STK.z, nx: -1, nz: 0, y0: 0, y1: 14, ex: -1.6, ez: 0 });   // inside the stack
LAD({ x: 96.5, z: 100.5, nx: 0, nz: -1, y0: 0, y1: 3.2, ex: 0, ez: 1.2, free: true });     // the workshop mezzanine
/* The cooling towers' caged ladders, now climbable: from the basin rim
   (2.6) up the ring beam and the shell to the lip, to a grating landing
   inside it. The climb line is 0.75m off the shell, inside the cage. */
const TLX = 0.36, TLZ = 0.93;
for (const [tx, tz] of [[-74, -90], [-24, -90]]){
  const at = (y, off) => { const r = (y < 5.6 ? shellR(5.6) : shellR(y)) + off; return [+(tx + TLX * r).toFixed(3), +y.toFixed(3), +(tz + TLZ * r).toFixed(3)]; };
  const path = [];
  for (let y = 2.6; y < 33.5; y += 1.5) path.push(at(y, 0.75));
  path.push(at(33.5, 0.75));
  LAD({ path, nx: TLX, nz: TLZ, y0: 2.6, y1: 33.5, ex: -1.1 * TLX, ez: -1.1 * TLZ, draw: false });
}
/* THE TOWER TOPS (2026-11-22). Jack: "make the full top of the tower and
   not just a little platform ... like how the top of a real cooling tower
   would look like". A real natural-draught shell ends in a thickened
   stiffening ring, and on it runs an inspection gallery the whole way
   round - grating, a railing on both edges - which is how anyone gets to
   the aviation lights and the lightning rods on the rim. The caged ladder
   arrives through a gate in its outer rail. Inside the rail the shell is
   empty all the way down to the cooling deck.

   Collision: the deck is 72 boxes ('ringdeck', drawn by the tower), each
   the bounding box of a 5-degree sector of the annulus, so the walkable
   ring is a hair wider than the drawn one at the diagonals and never
   narrower. The rails are posts ('ringrail', movement only, like every
   handrail: shots go through) every 0.6m, which leaves gaps of 0.52 - too
   narrow for a 0.8m body - so the rail is continuous to a player. */
/* THE SHELL IS SOLID NOW, AND HAS A WAY OUT (2026-11-22). Jack: "the
   cooling tower i can just go through it, make it solid and at the bottom
   i want to be able to come out if i drop inside". Above the ring beam
   (5.6) the shell had no collision at all: you could walk off the cooling
   deck straight through it, and shots went through the whole tower. It is
   bands of boxes now, each band a ring of sector bounding boxes between the
   shell's inner face (at its narrowest in the band) and its outer face:
   72 to the ring in the two bands you can reach from the deck, 36 above,
   where only a shot or a fall touches it. A real shell has access doors at
   its foot; this one has a doorway on the east side at deck level, onto a
   grating platform outside, and a steel stair down to the basin rim. */
const TOWER_DOOR = { a: 0, half: 0.95, h: 2.28 };     // east; half-width in metres; to the first shell course
function towerShell(tx, tz){
  const segTop = 5.6 + (33 - 5.6) / 12;
  const bands = [[5.6, segTop, 72, true], [segTop, 10.6, 72, false], [10.6, 14, 36], [14, 17.5, 36], [17.5, 21, 36],
                 [21, 24.5, 36], [24.5, 28, 36], [28, 33.2, 36]];
  for (const [ya, yb, n, door] of bands){
    const rin = Math.min(shellR(ya), shellR(yb), ya < YT && yb > YT ? shellR(YT) : 1e9) - 0.27, rout = Math.max(shellR(ya), shellR(yb));
    for (let i = 0; i < n; i++){
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, ac = (a0 + a1) / 2;
      if (door && Math.abs(Math.atan2(Math.sin(ac - TOWER_DOOR.a), Math.cos(ac - TOWER_DOOR.a))) * rin < TOWER_DOOR.half + Math.PI / n * rin) continue;
      const xs = [], zs = [];
      for (const r of [rin, rout]) for (const a of [a0, a1]){ xs.push(r * Math.cos(a)); zs.push(r * Math.sin(a)); }
      ob(tx + Math.min(...xs), tx + Math.max(...xs), tz + Math.min(...zs), tz + Math.max(...zs), ya, yb, 'towerwall');
    }
  }
  ob(tx - 1.05, tx + 1.05, tz - 1.05, tz + 1.05, 5.6, 8.2, 'towerwall');              // the riser in the middle of the deck
  /* outside the doorway: a grating landing, railed, and a stair down to the basin rim */
  const px0 = tx + shellR(5.6) - 0.15, px1 = tx + 12.4;
  ob(px0, px1, tz - 1.2, tz + 1.2, 5.4, 5.6, 'grating');
  rail(px1 - 0.1, px1, tz - 1.2, tz + 1.2, 5.6); rail(px0 + 0.4, px1 - 0.1, tz + 1.1, tz + 1.2, 5.6);
  const sx0 = tx + 10.9, sx1 = tx + 11.9, run = (Math.ceil(3 / 0.19 - 1e-9) - 1) * 0.25;
  steelStair(sx0, sx1, tz - 1.2 - run, 1, 2.6, 5.6);
  rail(sx1, sx1 + 0.1, tz - 1.2 - run, tz - 1.2, 2.6 + 1.6);
}
towerShell(-74, -90); towerShell(-24, -90);
const RIM = { y0: 33.3, y1: 33.5, half: 0.7, n: 72, post: 0.6, gate: 0.75, rail: 1.1 };
const RIM_R = shellR(33), RIM_GATE = Math.atan2(TLZ, TLX);
for (const [tx, tz] of [[-74, -90], [-24, -90]]){
  const r0 = RIM_R - RIM.half, r1 = RIM_R + RIM.half;
  for (let i = 0; i < RIM.n; i++){
    const a0 = i / RIM.n * Math.PI * 2, a1 = (i + 1) / RIM.n * Math.PI * 2;
    const xs = [], zs = [];
    for (const r of [r0, r1]) for (const a of [a0, a1]){ xs.push(r * Math.cos(a)); zs.push(r * Math.sin(a)); }
    ob(tx + Math.min(...xs), tx + Math.max(...xs), tz + Math.min(...zs), tz + Math.max(...zs), RIM.y0, RIM.y1, 'ringdeck');
  }
  for (const [r, gate] of [[r0 + 0.06, false], [r1 - 0.06, true]]){
    const n = Math.ceil(2 * Math.PI * r / RIM.post);
    for (let k = 0; k < n; k++){
      const a = k / n * Math.PI * 2, d = Math.abs(Math.atan2(Math.sin(a - RIM_GATE), Math.cos(a - RIM_GATE))) * r;
      if (gate && d < RIM.gate) continue;
      const px = tx + r * Math.cos(a), pz = tz + r * Math.sin(a);
      ob(px - 0.04, px + 0.04, pz - 0.04, pz + 0.04, RIM.y1, RIM.y1 + RIM.rail, 'ringrail');
    }
  }
}
/* Light panels in the new interiors, under each roof and gallery. */
P.push({ kind: 'ceilinglights', x0: BH.x0 + BH.t, x1: BH.x1 - BH.t, z0: BH.z0 + BH.t, z1: BH.z1 - BH.t,
         levels: [BGAL[0] - 0.2, BGAL[1] - 0.2, BGAL[2] - 0.2, BH.h - BH.rt],
         holes: [[33.5, 48.5, -92.5, -71.5], [50.5, 66, -92.5, -71.5], [29.5, 33.5, -95.5, -68.5]], extra: [] });
for (const b of [[25.3, 54.7, 99.3, 108.7, 3.7], [71.3, 84.7, 99.8, 108.2, 4.7], [93.3, 106.7, 94.3, 105.7, 6.7], [-106.7, -93.3, -65.7, -54.3, 6.7]])
  P.push({ kind: 'ceilinglights', x0: b[0], x1: b[1], z0: b[2], z1: b[3], levels: [b[4]], holes: [], extra: [] });
/* (2026-11-22) Two `busbars` runs used to be pushed here, at z 78 and 94:
   three conductors on insulators 11.4m up, the full width of the site. They
   came from the old hall, where they hung inside it; out here they crossed
   the offices and connected nothing at either end. Jack: "the pips
   connected beside the office is just hanging there, its not logical".
   Gone. The drawer stays in lighting.js. */
/* The yard's two gantries, with the lines swept from one to the other. */
P.push({ kind: 'gantry', z: -24, y: 12, x0: SUB_DX - 40, x1: SUB_DX + 40, to: 24, sag: 3.0 });
P.push({ kind: 'gantry', z:  24, y: 12, x0: SUB_DX - 40, x1: SUB_DX + 40 });

/* ===================================================================== */
/* CLUTTER AND WEAR (2026-11-22)                                         */
/* ===================================================================== */
/* Jack, after the Saltline comparison: "Yes, start it" - the clutter and
   wear pass. Saltline's port carries 7.7 loose objects per 100 m2, about
   half of them turned off the grid; the works carried 0.4 and none. So:
   the things people bring to a power station and leave, in the places
   they would leave them, in clusters that tell you what happens there -
   a contractors' laydown yard, a drum store by the dosing house, loading
   at the boiler house doors, cable drums in the HV yard, tool carts and
   stock along the hall's walls.

   `kit(kind, x, z, ry)` places one: its collision is the turned
   footprint's bounding box, and it REFUSES to go where anything already
   stands (any box, at any height it would share), printing what it hit -
   so a cluster can be written by eye and the generator keeps it honest.
   `CL` is what has no collision: cones, cable runs, hoses, signs, and the
   oil stains painted into the ground. */
const KIT = {           // footprint across (x), along (z), height
  drum: [0.6, 0.6, 0.92], drums4: [1.22, 1.22, 1.08], ibc: [1.0, 1.2, 1.16], barrier: [2.0, 0.62, 0.82],
  pallets: [1.2, 1.0, 0.86], palletload: [1.2, 1.0, 1.35], gascage: [1.3, 0.8, 1.9], reel: [1.0, 1.6, 1.6],
  skip: [1.8, 3.7, 1.5], van: [2.0, 5.2, 2.45], forklift: [1.2, 2.4, 2.15], toolcart: [0.5, 0.9, 1.0],
  bin: [0.62, 0.72, 1.08], gen: [1.1, 2.4, 1.45], cabin: [2.5, 6.0, 2.65], lighttower: [1.2, 2.0, 1.4],
  scaffold: [1.3, 5.0, 4.2],
};
const CL = [];
let KIT_PLACED = 0, KIT_REFUSED = 0;
function kit(kind, x, z, ry, h){
  ry = ry || 0;
  const [fw, fd, hh] = KIT[kind], H = h || hh, c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const w = fw * c + fd * s, d = fw * s + fd * c;
  for (const o of out){
    if (o.note || o.mat === 'ringrail') continue;
    const oy = o.y || 0;
    if (Math.abs(o.x - x) < (o.w + w) / 2 - 0.01 && Math.abs(o.z - z) < (o.d + d) / 2 - 0.01 && oy < H - 0.01 && oy + o.h > 0.01){
      console.log(`  clutter refused: ${kind} at ${x.toFixed(1)},${z.toFixed(1)} hits ${o.mat} at ${o.x},${o.z}`); KIT_REFUSED++; return false; }
  }
  const o = { x: r4(x), z: r4(z), w: r4(w), d: r4(d), h: r4(H), mat: kind };
  if (ry) Object.assign(o, { ry: r4(ry), fw, fd });
  out.push(o); KIT_PLACED++; return true;
}
const rowOf = (kind, x, z, dx, dz, n, jit, seed) => {
  let r = seed || 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) kit(kind, x + dx * i + (rnd() - 0.5) * jit, z + dz * i + (rnd() - 0.5) * jit, (rnd() - 0.5) * 0.3);
};
const cone = (x, z) => CL.push({ k: 'cone', x: r4(x), z: r4(z) });
const oil = (x, z, r) => CL.push({ k: 'oil', x: r4(x), z: r4(z), r: r || 1.2 });
const cable = (...pts) => CL.push({ k: 'cable', pts: pts.map(p => [r4(p[0]), r4(p[1])]) });
const sign = (t, x, z, ry, post, y) => CL.push(Object.assign({ k: 'sign', t, x: r4(x), z: r4(z), ry: r4(ry), post: !!post }, y != null ? { y } : {}));

note('THE GENERATOR ROOM, south of the hall across the road');
/* (2026-11-23, the indoors brief, room 3: "a room containing massive
   cylindrical generators, electrical cables, cooling pipes, ventilation
   equipment, and metal flooring"). A 40 x 22m clad house, 12m to the roof,
   across the south road from the hall's south door: a roll-up door facing
   the hall, side doors east and west, a band of high windows. Inside, two
   standby generator sets (blue drums on plinths, 4m - cover nobody climbs),
   their exciter cabinet, a mezzanine along the back wall at 4m on a steel
   stair with the switchgear under it, cooling water dropping into the
   generators from a main at 9m, a ventilation duct and cable trays up in
   the roof, high-bay lights, chequer-plate floor. */
const GR = { x0: 10, x1: 50, z0: 74, z1: 96, t: 0.3, h: 12, rt: 0.4 };
building(GR, [
  { face: 'N', a0: 26, a1: 31, y0: 0, y1: 5 },                                   // the roll-up door, facing the hall
  { face: 'W', a0: 83, a1: 86, y0: 0, y1: 2.6 }, { face: 'E', a0: 83, a1: 86, y0: 0, y1: 2.6 },
  { face: 'N', a0: 12, a1: 24, y0: 7, y1: 9, glass: true }, { face: 'N', a0: 33, a1: 48, y0: 7, y1: 9, glass: true },
  { face: 'S', a0: 12, a1: 48, y0: 7, y1: 9, glass: true },
], 'shedwall', 'shedroof');
box(22, 80, 14, 3.6, 4.0, 'genset'); box(38, 80, 14, 3.6, 4.0, 'genset');
box(12.3, 80, 2.4, 3.0, 2.2, 'switch');                                           // the exciter / control cubicle
ob(12, 48, GR.z1 - GR.t - 3.7, GR.z1 - GR.t, 3.8, 4.0, 'grating');                // the mezzanine (z 92..95.7)
const GRM = GR.z1 - GR.t - 3.7;
steelStair(46.0, 47.6, GRM - 5.5, 1, 0, 4.0);
rail(12, 46.0, GRM - 0.03, GRM + 0.03, 4.0); rail(47.6, 48, GRM - 0.03, GRM + 0.03, 4.0);
rail(11.97, 12.03, GRM + 0.03, GR.z1 - GR.t, 4.0);
for (const x of [14.2, 17.4, 20.6, 23.8, 27.0, 30.2, 33.4, 36.6, 39.8]) box(x + 1.5, GR.z1 - GR.t - 0.85, 3.0, 1.6, 2.2, 'switch');   // switchgear under it
ob(28.05, 28.75, 79.65, 80.35, 4.0, 9.4, 'cwpipe'); ob(44.05, 44.75, 79.65, 80.35, 4.0, 9.4, 'cwpipe');   // cooling water into each set
P.push({ kind: 'cwruns', runs: [[28.4, 80, 49.6, 80], [44.4, 80, 49.6, 80.0001]], y: 9 });
P.push({ kind: 'genroom', x0: GR.x0 + GR.t, x1: GR.x1 - GR.t, z0: GR.z0 + GR.t, z1: GR.z1 - GR.t, h: GR.h - GR.rt });
P.push({ kind: 'highbay', x0: 16, x1: 44, z0: 78, z1: 90, y: 11.2, step: 12 });
GROUND_MORE.push({ k: 'plate', x0: GR.x0 + GR.t, z0: GR.z0 + GR.t, x1: GR.x1 - GR.t, z1: GR.z1 - GR.t });

note('THE SUBSTATION ROOM, between the HV compound and the switchyard road');
/* (2026-11-23, the indoors brief, room 4: "a technical area filled with
   transformers, switchgear cabinets, electrical control panels, insulated
   cables, and warning signs"). A closed 26 x 13 x 7m house on the strip
   between the HV compound's north wall and the switchyard road, where an
   indoor substation would stand: a transformer door and a personnel door
   onto the road, a door east. Inside: two transformers in bays split by a
   blast wall, a line of switchgear along the back, a free-standing control
   panel island, cable trays overhead with cables dropping to the gear,
   cables on the floor, keep-clear hatching, DANGER signs. */
const SR = { x0: -52, x1: -26, z0: 51, z1: 64, t: 0.3, h: 7, rt: 0.3 };
building(SR, [
  { face: 'S', a0: -48.5, a1: -44, y0: 0, y1: 4 },                               // the transformer door
  { face: 'S', a0: -34, a1: -31.5, y0: 0, y1: 2.5 },                             // personnel door
  { face: 'E', a0: 56, a1: 58.5, y0: 0, y1: 2.5 },
], 'shedwall', 'shedroof');
box(-47.6, 54.0, 5.5, 4.2, 2.8, 'transformer'); box(-37.4, 54.0, 5.5, 4.2, 2.8, 'transformer');
box(-42.5, 53.9, 0.5, 4.6, 3.6, 'firewall');                                      // the blast wall between the bays
for (const x of [-42.2, -39.5, -36.8, -28.6]) box(x, SR.z1 - SR.t - 0.8, 2.6, 1.6, 2.2, 'switch');   // switchgear along the back, clear of both doors
box(-30.5, 57.5, 1.2, 6, 2.0, 'switch');                                         // the control panel island
P.push({ kind: 'subroom', x0: SR.x0 + SR.t, x1: SR.x1 - SR.t, z0: SR.z0 + SR.t, z1: SR.z1 - SR.t, h: SR.h - SR.rt,
         drops: [[-47.6, 54.0], [-37.4, 54.0], [-42.2, 62.9], [-39.5, 62.9], [-36.8, 62.9], [-28.6, 62.9], [-30.5, 57.5]] });
P.push({ kind: 'ceilinglights', x0: SR.x0 + SR.t, x1: SR.x1 - SR.t, z0: SR.z0 + SR.t, z1: SR.z1 - SR.t, levels: [SR.h - SR.rt - 0.05], holes: [], extra: [] });
PAINT_EXTRA_LATE.push({ k: 'keep', x: -47.6, z: 54.0, w: 7.0, d: 5.4 }, { k: 'keep', x: -37.4, z: 54.0, w: 7.0, d: 5.4 });

note('CLUTTER AND WEAR: the things people bring to a site and leave (kit)');
/* 1. THE LAYDOWN YARD, south-west: a contractors' compound on the open
   ground below the tank farm - cabin, skip, cable drums waiting to go in,
   barriers, a generator feeding a lighting tower, the van they came in. */
/* The site office (2026-11-22, Jack: "the building u added at bottom left
   i want it to be indoors"): a 32ft steel cabin, hollow - a door and a
   window toward the yard, a window behind, and inside what a site office
   holds: desks along the back wall, a plan chest, lockers, a kettle bench. */
building({ x0: -41.6, x1: -38.4, z0: 104.4, z1: 114.2, t: 0.12, h: 2.75, rt: 0.15 }, [
  { face: 'E', a0: 108.1, a1: 109.1, y0: 0, y1: 2.15 },
  { face: 'E', a0: 105.2, a1: 107.4, y0: 1.0, y1: 1.9, glass: true }, { face: 'E', a0: 110.2, a1: 113.4, y0: 1.0, y1: 1.9, glass: true },
  { face: 'W', a0: 106, a1: 112.6, y0: 1.0, y1: 1.9, glass: true },
  { face: 'N', a0: -40.8, a1: -39.2, y0: 1.0, y1: 1.9, glass: true },
], 'shedwall', 'shedroof');
ob(-41.48, -40.7, 105.2, 108.2, 0, 0.75, 'desk'); ob(-41.48, -40.7, 110.4, 113.4, 0, 0.75, 'desk');
ob(-41.48, -40.9, 108.8, 109.6, 0, 1.0, 'carcass');                                              // plan chest
ob(-39.2, -38.52, 113.3, 114.08, 0, 1.9, 'machine'); ob(-39.2, -38.52, 112.4, 113.2, 0, 1.9, 'machine');   // lockers
ob(-39.0, -38.52, 104.55, 105.8, 0, 0.9, 'desk');                                                // the kettle bench
P.push({ kind: 'ceilinglights', x0: -41.48, x1: -38.52, z0: 104.52, z1: 114.08, levels: [2.55], holes: [], extra: [] });
kit('bin', -37.6, 105.4, 0.1); kit('bin', -36.8, 105.5, -0.08);
kit('skip', -28.5, 111.5, 0.12);
kit('reel', -21, 100, 0.08); kit('reel', -18.6, 100.4, -0.06); kit('reel', -16.2, 100.1, 0.1);
kit('pallets', -46, 100.5, 0.06); kit('pallets', -44.4, 101.6, -0.25, 1.15); kit('palletload', -34.5, 100.4, 0.1);
kit('drums4', -32.6, 100.2, -0.12);
rowOf('barrier', -48, 98.6, 2.15, 0, 5, 0.12, 7);              // outside the switchyard fence (z 97)
kit('gen', -24.5, 104.5, 1.62); kit('lighttower', -21.8, 108.4, 0.4);
kit('van', -11, 108, 0.32);
kit('gascage', -45.8, 114.2, 0);
cable([-24.5, 103.2], [-23.2, 104.8], [-22.4, 107.4]); cable([-24.5, 105.6], [-30, 106.4], [-36.5, 110.2], [-38.3, 110.2]);
for (const [x, z] of [[-30.8, 109], [-26.4, 109.4], [-31, 114.2], [-26.2, 114.4], [-14, 104.6], [-8.6, 111.6]]) cone(x, z);
oil(-11, 108.6, 1.4); oil(-24.5, 104.6, 0.9); oil(-32.6, 100.2, 1.0); oil(-29, 111.5, 1.6);
/* the switchyard fence: DANGER signs facing out beside every gate, and along it */
for (const x of [-114.9 + 4.6, -65.4, -56.6, -88, -36]) sign('hv', x, 74.92, Math.PI, false, 1.5);
for (const z of [81.6, 90.4]) sign('hv', -21.42, z, Math.PI / 2, false, 1.5);
for (const x of [-33, -24, -70, -100]) sign('hv', x, 97.08, 0, false, 1.5);
sign('hv', -114.58, 86, -Math.PI / 2, false, 1.5);
/* More signs (2026-11-23, the Saltline list): the muster point, hearing
   protection at the plant doors, fire exits, site speed on the roads. */
sign('ear', 32.6, 73.92, Math.PI, false, 1.6); sign('hv', 24.4, 73.92, Math.PI, false, 1.6);   // the generator room's door
cable([13.5, 81.6], [16, 83.2], [27, 83.4], [30, 82.2]); cable([13.5, 78.4], [15, 77], [31, 76.8], [33, 77.9]);
sign('hv', -46.25, 64.08, 0, false, 1.6); sign('hv', -29.6, 64.08, 0, false, 1.6); sign('hv', -25.92, 59.6, Math.PI / 2, false, 1.6);   // the substation room's doors
sign('hv', -42.5, 51.32, 0, false, 2.2);                                          // inside, over the bays
cable([-44.6, 56.6], [-44.2, 59.5], [-40.5, 60.4], [-33, 60.2], [-31.3, 58.8]); cable([-36.5, 56.4], [-36.2, 60.8], [-34.6, 61.6]);
sign('assembly', 84, 72, Math.PI, true); sign('assembly', -8.6, -40, -Math.PI / 2, true);
sign('ear', -4.52, -21.6, -Math.PI / 2, false, 1.6); sign('ear', -4.52, 21.6, -Math.PI / 2, false, 1.6);
sign('ear', 47.4, -67.98, 0, false, 1.6);
sign('exit', 83.2, 92.02, 0, false, 1.5); sign('exit', 29.6, 60.52, 0, false, 1.6);
sign('slow', 8, 61.0, -Math.PI / 2, true); sign('slow', -100, 73.8, Math.PI / 2, true); sign('slow', 30, -59.6, -Math.PI / 2, true);
sign('site', -50.9, 98.5, Math.PI, true); sign('ppe', -38.38, 107.8, Math.PI / 2, false, 1.25);   // between the window (to 107.4) and the door (from 108.1)

/* 2. THE DOSING HOUSE: its chemical store outside the east door - totes,
   a pallet of drums, the gas cage - kept clear of the door itself. */
kit('ibc', -90.6, -65.4, 0.05); kit('ibc', -90.6, -67, -0.04); kit('drums4', -88.6, -65.9, 0.1);
kit('gascage', -91.4, -52.4, 0);
oil(-89.6, -66.2, 1.1);
sign('chem', -92.98, -63.4, Math.PI / 2, false, 1.4); sign('nosmk', -92.98, -56.6, Math.PI / 2, false, 1.4);

/* 3. THE PIPE AND DRUM YARD, north, between the towers and the boiler
   house: cable drums, a skip, stacked pallets, a van, barriers along the
   road edge. */
kit('reel', -1, -100, 0.1); kit('reel', 1.5, -100.6, -0.12); kit('reel', 0.4, -103.2, 0.05);
kit('pallets', 7.6, -104.2, 0.2); kit('palletload', 9.4, -102.6, -0.1);
kit('skip', 14, -92, 0.1); kit('van', 19, -104, -0.42);
rowOf('barrier', -6, -79.2, 2.15, 0, 4, 0.15, 11);
kit('drums4', 4.8, -96.5, 0.3); kit('drum', 6.4, -95.4, 0); kit('drum', 6.6, -94.6, 0);
for (const [x, z] of [[12, -95.3], [16.2, -95.1], [12.2, -88.8]]) cone(x, z);
oil(19, -104, 1.5); oil(5, -96, 1.0); oil(14, -92, 1.4);

/* 4. THE BOILER HOUSE DOORS: loading on the apron by the south roll-up
   door, drums and a tote by the west door. */
kit('forklift', 44.6, -66.8, Math.PI / 2 + 0.08); kit('palletload', 57.6, -66.9, 0.05); kit('drums4', 59.9, -66.95, -0.06);
kit('pallets', 40.8, -66.95, 0.1);
kit('ibc', 26.4, -88.4, 0.06); kit('drum', 26.6, -79.4, 0); kit('drum', 25.9, -78.7, 0); kit('drum', 26.9, -78.4, 0);
oil(44.6, -66.6, 1.2); oil(26.4, -79, 0.9);
sign('fork', 57.6, -67.98, 0, false, 1.6);

/* 5. THE HV YARD strip between the switchyard and the hall: cable drums
   waiting for the next job, a barrier line. */
kit('reel', -8.2, -52.6, 0.08); kit('reel', -8.1, -50.2, -0.1); kit('reel', -8.4, 52.4, 0.12);
kit('barrier', -8.4, -56.4, Math.PI / 2 + 0.06);
sign('hv', -12.6, -0.2, -Math.PI / 2, true);
oil(-8.2, -51, 1.0);

/* 6. THE QUAY AND THE WORKSHOPS: a drum store by the intake house, bins and
   pallets at the workshops. */
kit('drums4', 21.2, 100.6, 0.12); kit('ibc', 22.8, 103.2, -0.08); kit('drum', 21.3, 102.6, 0);
kit('pallets', 69.6, 97.2, 0.15); kit('bin', 86.4, 97, 0.1); kit('bin', 87.2, 97.1, -0.1);
kit('toolcart', 91, 96.6, 0.4);
oil(21.4, 101.2, 1.1); oil(73, 97.6, 0.8);

/* 7. THE TURBINE HALL, along its walls: tool carts, stock on pallets,
   drums, a cable drum, cones round a job. */
kit('toolcart', 10.4, -41.8, 0.25); kit('palletload', 14, -44.2, 0.08); kit('drums4', 16.6, -44.4, -0.1);
kit('palletload', 14.2, 44.2, -0.06); kit('toolcart', 10.6, 41.6, -0.3); kit('reel', 17, 44.6, 0.1);
/* (the stock and tool cart that stood in the hall's north-east corner are in the maintenance workshop now) */
kit('drums4', 105, 34, -0.08); kit('ibc', 105.1, 31.4, 0.06);
for (const [x, z] of [[20.5, -40], [23.5, -40], [20.5, -37], [23.5, -37]]) cone(x, z);
CL.push({ k: 'hose', x: 22, z: -38.5, c: 'orange' });
oil(16.6, -44.4, 0.9); oil(105, 34, 0.9);
sign('ppe', 44.5, -58.98, 0, false, 1.6);      // beside the north door (x 48-54), on the wall - not in the doorway

/* 8. THE BOILER HOUSE FLOOR, east side: drums, a tote, a tool cart. */
kit('drums4', 78.2, -92, 0.06); kit('ibc', 78.4, -89.4, -0.05); kit('toolcart', 79.2, -75, 0.3); kit('pallets', 79.8, -71.3, 0.12);
oil(78.2, -91.4, 0.9);

/* 9. THE MAP'S SHAPE (2026-11-23, the last of the Saltline list): the long
   open roads and the yard between the switchyard and the hall were sight
   lines with nothing on them. Cover that belongs on a working site, set
   along and partly on them: vans parked half on the road, skips, cable
   drums, pallets, barriers, and scaffold towers against the buildings
   (4.2m: a wall to break a line, too tall to climb). */
// the south road (z 65)
kit('van', 60, 63.4, Math.PI / 2 + 0.03); kit('van', 35, 70.4, Math.PI / 2 - 0.05);
kit('skip', 100, 70.7, Math.PI / 2 + 0.08); kit('reel', 8, 70.4, 0.1); kit('reel', 9.7, 70.6, -0.15);
rowOf('barrier', 86, 66.8, 0, 0, 1, 0.1, 3); kit('barrier', 88.2, 66.6, 0.12);
// the north road (z -64)
kit('van', 70, -65.4, Math.PI / 2 + 0.04); kit('skip', 8, -62.6, Math.PI / 2 - 0.06);
kit('palletload', 100, -62.4, 0.2); kit('pallets', 101.6, -62.6, -0.1);
// the switchyard road (z 70) and the towers road (z -70)
kit('van', -36, 68.6, Math.PI / 2 - 0.03); kit('skip', -92, 71.6, Math.PI / 2 + 0.05);
kit('skip', -50, -68.6, Math.PI / 2 + 0.04); kit('reel', -82, -71.8, 0.08); kit('reel', -80.4, -71.9, -0.1); kit('reel', -83.6, -71.8, 0.2);
// the west road (x -112.5)
kit('van', -111.0, -14, 0.05); kit('reel', -110.6, 30, 0.1); kit('reel', -110.7, 31.8, -0.12); kit('palletload', -114.2, 46, 0.15);
// the yard between the switchyard and the hall
kit('van', -8.5, -36, 0.08); kit('skip', -18.2, -50, 0.1); kit('reel', -10.4, 40, 0.05); kit('reel', -10.2, 42.0, -0.1);
kit('palletload', -8.5, 46, 0.12); kit('pallets', -8.2, 47.8, -0.06); kit('drums4', -10.4, 26, 0.2);
rowOf('barrier', -9.6, -24, 0, 2.15, 3, 0.15, 13);
// scaffold towers against the walls
kit('scaffold', -5.25, -38, 0); kit('scaffold', -5.25, 38, 0); kit('scaffold', 28.3, -84, 0); kit('scaffold', 95.7, 86, 0);
console.log(`  clutter: ${KIT_PLACED} placed, ${KIT_REFUSED} refused, ${CL.length} loose items`);
/* LAMP POSTS (2026-11-23, the Saltline list: "lights in the world"):
   post-top lanterns along every road, 6.5m, one about every 30m, on the
   side with room. Each is a thin collision box (`lamppost`) and a light in
   the bake (litPanelLights), as are the switchyard's floodlight masts. A
   post that would stand in anything is refused and named. */
{
  let placed = 0, refused = 0;
  const post = (x, z) => {
    for (const o of out){ if (o.note) continue;
      if (Math.abs(o.x - x) < o.w / 2 + 0.35 && Math.abs(o.z - z) < o.d / 2 + 0.35 && (o.y || 0) < 6.5){
        console.log(`  lamp post refused at ${x},${z}: ${o.mat} at ${o.x},${o.z}`); refused++; return; } }
    box(x, z, 0.3, 0.3, 6.5, 'lamppost'); placed++;
  };
  for (const x of [-8, 22, 52, 82, 110]) post(x, 69.3);          // the south road (z 65), quay side
  for (const x of [-8, 18, 92, 110]) post(x, -67.7);             // the north road (z -64), boiler house side
  for (const x of [-105, -80, -50, -26]) post(x, 73.9);          // the switchyard road (z 70)
  for (const x of [-100, -66, -36]) post(x, -73.8);              // the towers road (z -70)
  for (const z of [-58, -28, 2, 32, 60]) post(-116.2, z);        // the west road (x -112.5)
  console.log(`  lamp posts: ${placed} placed, ${refused} refused`);
}
/* THE WET GROUND (2026-11-23, the Saltline list): puddles where rain
   stands - out in the open, never in a building, never against anything
   (0.8m clear of every box on the ground), not on the grass. Painted into
   the ground texture (litGroundTexture): a dark damp margin and a sheen of
   the overcast in the middle. */
{
  let r = 20231123; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const indoor = BUILT.concat([[HX0 - HW, HX1 + HW, HZ0 - HW, HZ1 + HW], [OX0, OX1, OZ0, OZ1], [-5, 5, 74, 113], [-109, 27, -113, -74]]);
  const ground = out.filter(o => !o.note && (o.y || 0) < 0.3);
  let n = 0;
  for (let tries = 0; tries < 6000 && n < 46; tries++){
    const x = -112 + rnd() * 224, z = -112 + rnd() * 224, rr = 0.6 + rnd() * 1.6;
    if (indoor.some(q => x > q[0] - rr && x < q[1] + rr && z > q[2] - rr && z < q[3] + rr)) continue;
    if (ground.some(o => Math.abs(x - o.x) < o.w / 2 + rr + 0.8 && Math.abs(z - o.z) < o.d / 2 + rr + 0.8)) continue;
    if (Math.hypot(x + 74, z + 90) < 16 || Math.hypot(x + 24, z + 90) < 16) continue;   // the tower basins
    CL.push({ k: 'puddle', x: r4(x), z: r4(z), r: r4(rr), e: r4(0.45 + rnd() * 0.5), a: r4(rnd() * Math.PI) }); n++;
  }
  console.log(`  puddles: ${n}`);
}
P.push({ kind: 'clutter', items: CL });

/* ===================================================================== */
/* ON THE HALL ROOF (2026-11-22)                                          */
/* ===================================================================== */
/* Jack: "i want to be able to stand on the roof". The turbine hall's roof
   was a `roofRect` only - it stopped a bullet and not a player - so there
   was nothing up there to stand on. It is a deck now: the slab as
   `hallroof` boxes (drawn by the hallroof prop, so they draw nothing) and
   the rooflight strips as GLASS, which you can stand on, which a shot goes
   through and which daylight still comes through (glass is MOVE_ONLY, out
   of the bake's occluders). A rail runs round the edge, 16.6m up, with a
   gap where each ladder arrives; two caged ladders come up the outside,
   one on the west wall by the HV yard, one on the south wall by the road. */
note('THE HALL ROOF: a deck you can stand on, a rail round it, two ladders up');
{
  const rx0 = HX0 - HW, rx1 = HX1 + HW, rz0 = HZ0 - HW, rz1 = HZ1 + HW, y0 = HH + 0.05, y1 = HH + 0.6;
  const strips = []; for (let x = rx0 + 8; x < rx1 - 6; x += 12) strips.push(x);     // the rooflights hallroof draws
  let x = rx0;
  for (const sx of strips){
    ob(x, sx, rz0, rz1, y0, y1, 'hallroof');
    ob(sx, sx + 5, rz0, rz0 + 3, y0, y1, 'hallroof'); ob(sx, sx + 5, rz1 - 3, rz1, y0, y1, 'hallroof');
    ob(sx, sx + 5, rz0 + 3, rz1 - 3, y1 - 0.1, y1, 'glass');                     // the glazing, flush with the deck
    x = sx + 5;
  }
  ob(x, rx1, rz0, rz1, y0, y1, 'hallroof');
  /* the ladders: [x, z, outward normal, step onto the roof] */
  const LW = { x: rx0 - 0.5, z: -40 }, LS = { x: 40, z: rz1 + 0.5 };
  LAD({ x: LW.x, z: LW.z, nx: -1, nz: 0, y0: 0, y1: y1, ex: 1.6, ez: 0 });
  LAD({ x: LS.x, z: LS.z, nx: 0, nz: 1, y0: 0, y1: y1, ex: 0, ez: -1.6 });
  /* the rail round the edge, 0.3m in, open 1.6m where each ladder arrives */
  const e = 0.3, gap = 0.8;
  rail(rx0 + e, rx1 - e, rz0 + e, rz0 + e + 0.1, y1);                                           // north
  rail(rx0 + e, LS.x - gap, rz1 - e - 0.1, rz1 - e, y1); rail(LS.x + gap, rx1 - e, rz1 - e - 0.1, rz1 - e, y1);   // south, the ladder's gap
  rail(rx0 + e, rx0 + e + 0.1, rz0 + e + 0.1, LW.z - gap, y1); rail(rx0 + e, rx0 + e + 0.1, LW.z + gap, rz1 - e - 0.1, y1);   // west, the gap
  rail(rx1 - e - 0.1, rx1 - e, rz0 + e + 0.1, rz1 - e - 0.1, y1);                               // east
}

/* ROAD AND YARD MARKINGS (2026-11-23, the Saltline list): zebra crossings
   where people cross to a door, SLOW and lane arrows on the roads, and
   yellow keep-clear boxes in front of the doors that open onto the yard. */
const PAINT_MORE = [...PAINT_EXTRA_LATE,
  { k: 'zebra', x: 75, z: 65, horiz: true, w: 6 }, { k: 'zebra', x: 24, z: 65, horiz: true, w: 6 },
  { k: 'zebra', x: 51, z: -64, horiz: true, w: 6 }, { k: 'zebra', x: -61, z: 70, horiz: true, w: 6 },
  { k: 'text', x: 96, z: 65, s: 1.6, t: 'SLOW' }, { k: 'text', x: 4, z: -64, s: 1.6, t: 'SLOW' },
  { k: 'text', x: -88, z: 70, s: 1.6, t: 'SLOW' }, { k: 'text', x: -112.5, z: -24, s: 1.6, t: 'SLOW' },
  { k: 'arrow', x: 40, z: 66.5, a: 0 }, { k: 'arrow', x: 60, z: 63.5, a: Math.PI },
  { k: 'arrow', x: 18, z: -62.5, a: 0 }, { k: 'arrow', x: 34, z: -65.5, a: Math.PI },
  { k: 'arrow', x: -80, z: 71.5, a: 0 }, { k: 'arrow', x: -40, z: 68.5, a: Math.PI },
  { k: 'arrow', x: -111, z: -44, a: Math.PI / 2 }, { k: 'arrow', x: -114, z: 30, a: -Math.PI / 2 },
  { k: 'keep', x: -7, z: -17, w: 5, d: 6 }, { k: 'keep', x: -7, z: 17, w: 5, d: 6 },
  { k: 'keep', x: -61, z: 74, w: 4, d: 1.9 },
];
/* ---------------------------------------------------------------- emit -- */
const lines = [];
for (const o of out) {
  if (o.note) { lines.push('\n' + o.note.split('\n').map(l => '      // ' + l.trim()).join('\n')); continue; }
  /* `y` is a raised box's base (an upper floor, a stair tread): left off
     for anything on the floor, so the existing lines are unchanged. */
  const ex = (o.r != null ? `, r: ${o.r}, n: ${o.n}` : '') + (o.y ? `, y: ${+o.y.toFixed(3)}` : '');
  /* a turned box (the clutter kit): its angle and the footprint it was turned from */
  const exr = o.ry ? `, ry: ${o.ry}, fw: ${o.fw}, fd: ${o.fd}` : '';
  lines.push(`      { x: ${String(o.x).padStart(7)}, z: ${String(o.z).padStart(7)}, w: ${String(o.w).padStart(7)}, ` +
             `d: ${String(o.d).padStart(7)}, h: ${String(o.h).padStart(4)}, mat: ${("'" + o.mat + "'").padEnd(13)}${ex}${exr} },`);
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
      { k: 'walk',  x0: 25, z0: -55, x1: 25, z1: 55, w: 2.4 }, { k: 'walk', x0: 87, z0: -55, x1: 87, z1: 55, w: 2.4 },
${PAINT_MORE.map(q => '      ' + JSON.stringify(q).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'") + ',').join('\n')}
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
      /* (2026-11-22) the verge east of the laydown yard was grass from
         -19; the yard's van and generator stand on it, so it is concrete
         hardstanding now from -19 to -5, and the yard's drum store north of
         the towers gets a gravel pad of its own. */
      { k: 'grass',  x0:   -5, z0:   74, x1:   5, z1:  113 },
      { k: 'gravel', x0: -104, z0:  -46, x1: -20, z1:   46 },
      { k: 'gravel', x0: -115.5, z0: 74, x1: -20, z1:  113 },
      { k: 'gravel', x0:   -9, z0: -108, x1:  23, z1:  -82 },
      { k: 'road', x0: -24, z0: -64,  x1: 117, z1: -64,  w: 6 },
      { k: 'road', x0: -24, z0: 65, x1: 117, z1: 65, w: 6 },
      { k: 'road', x0: -112.5, z0: -73, x1: -112.5, z1: 73, w: 6 },
      { k: 'road', x0: -115.5, z0: -70, x1: -14, z1: -70, w: 6 },
      { k: 'road', x0: -115.5, z0:  70, x1: -14, z1:  70, w: 6 },
      /* The offices: stone tiles inside on the ground floor, and a paved
         path from the south road's kerb up to the door. */
      { k: 'floor',  x0: 55.3, z0: 80.3, x1: 94.7, z1: 91.7 },
      { k: 'paving', x0: 72.5, z0: 68.35, x1: 77.5, z1: 80 },
${GROUND_MORE.map(q => '      ' + JSON.stringify(q).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'") + ',').join('\n')}
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
