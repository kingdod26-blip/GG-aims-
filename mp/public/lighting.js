/* =============================================================
   Crimson X — lighting.js  (after maps.js, before world.js)

   THE LIT ARENA. The light in the room is worked out from the fixtures
   that are actually in it, instead of one even wash over everything.

   It sits outside the numbering, like config.js and i18n.js, so the ten
   numbered files keep their numbers. Nothing here runs at load except
   definitions: world.js calls `litBuildArena()` from `buildArena()`, and
   by then both files have been read.

   WHY THIS EXISTS. The arena was lit by a hemisphere and one directional
   key. That lights every square metre of floor identically, so there was
   nothing for a grade to work with: no pool under a lamp, no shadow
   behind a crate, no reason for the eye to read depth. The lamps on the
   ceiling were pictures of lamps. They are emitters now.

   THE THREE PARTS
   1. A BAKE (CPU, once per map). Each ceiling panel and each wall strip
      is an area light. The floor gets a lightmap; cover, walls and roof
      get the same light per vertex. Area lights are sampled at several
      points each and every sample is tested against the cover, which is
      what gives soft-edged shadows whose width depends on how far the
      thing casting them is from the floor — the look a point light and a
      shadow map cannot produce.
   2. A SHADER PATCH. MeshStandardMaterial with the room's directional key
      removed and its ambient term replaced by the bake. Point lights
      (a flaming bolt) still land on these surfaces. The key's SHADOW MAP
      is still read, so a player's shadow falls on baked ground.
   3. THE FLOOR'S MIRROR. A polished floor shows the lamps in it. Those are
      rectangles on a grid at a known height, so the reflection is solved
      exactly per pixel — reflect the eye ray, meet the lamp plane, see
      whether it landed on a panel — and blurred by the surface roughness.
      No second render of the scene.

   THE OLD ARENA IS STILL THERE. With LOOK set to FLAT the original meshes
   draw exactly as they always did, and they stay in `wallMeshes` in both
   looks: every bullet, bolt and grenade is still ray-tested against the
   same plain boxes the server collides with. The lit meshes are only ever
   LOOKED at. That is why a bevelled crate cannot change what stops a shot.

   These files are CLASSIC scripts sharing ONE global scope.
   ============================================================= */

const LIT_NBOX = 44;       // cover plus the four perimeter walls: the shader's loops are this long
const LIT_DIR_OPEN  = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const LIT_RECT_OPEN = '#if ( NUM_RECT_AREA_LIGHTS > 0 )';
/* The patch below rewrites one of Three's own shader chunks by finding two
   lines in it. If a different Three build ever moves them, or the browser
   only has WebGL1 (the loops want GLSL 3), the lit arena simply never
   builds and LOOK falls back to grading the old one. */
const LIT_OK = (() => {
  try {
    /* `?nolit` forces that fallback, so the path a WebGL1 browser takes can
       be looked at on a machine that would never take it. */
    if (/[?&]nolit\b/.test(location.search)) return false;
    const c = THREE.ShaderChunk.lights_fragment_begin;
    const a = c.indexOf(LIT_DIR_OPEN), b = c.indexOf(LIT_RECT_OPEN);
    return !!renderer.capabilities.isWebGL2 && a >= 0 && b > a;
  } catch (e) { return false; }
})();

/* Every number that decides how the room looks. `gain`, `ambient`,
   `shadow`, `refl` and the *Show / *Refl colours are uniforms, so they can
   be changed live from the console (LITU.uLitGain.value = ...) without a
   re-bake; the rest are read by the bake. */
const LIT = {
  /* ceiling panels */
  lampDrop: 0.36,                  // metres the lit face hangs under the roof (the housing's depth)
  lampRGB:  [1.00, 0.90, 0.76],    // warm white
  lampShow: [5.6, 4.9, 4.0],       // the panel as DRAWN: far over 1, so the tone curve leaves it white-hot
  lampRefl: [3.4, 3.0, 2.45],      // what the floor's mirror sees
  /* wall strips: the crimson line round the room */
  stripY: 3.0, stripHalf: 0.06, stripStep: 1.5,
  stripRGB:  [1.00, 0.10, 0.19],
  stripL:    15,                   // thin, so it needs far more radiance than a panel to reach the floor
  stripRoof: 0.22,                 // how much of it the roof takes: it sits in a channel that shades it upward
  stripShow: [7.5, 0.55, 1.10],
  stripRefl: [4.2, 0.34, 0.66],
  stripGlow: [0.24, 0.020, 0.042], // the wash it throws up and down its own wall
  dado: 1.25,                      // height of the darker painted band along the foot of the wall
  /* fill */
  ambient:   [0.170, 0.190, 0.230],
  bounce:    0.32,                 // how much of the floor's light comes back up onto what faces it
  bounceRGB: [0.95, 0.96, 1.00],
  /* response */
  gain:   5.5,                     // bake units -> light. 1.0 is the floor directly under one panel
  shadow: 0.40,                    // what a player's shadow leaves of the baked light
  refl:   0.85,
  envKeep: 0.10,                   // how much of the generic room reflection the floor keeps
  aoK:    0.80,
  /* geometry */
  bevel: 0.045, coverSeg: 0.75, wallSegU: 2, wallSegV: 1, roofSeg: 3,
  /* the key light only draws dynamic shadows now, so it follows the camera */
  shadowHalf: 34,
  fogNear: 58, fogFar: 205,
  /* Outdoors you can see a long way and the haze is bright, not dark. The
     colour is the bottom stop of the sky gradient, so the two meet cleanly. */
  skyFogNear: 90, skyFogFar: 420, fogSky: 0xdfe4e7,
  bloom: [0.62, 0.72, 0.80],       // strength, radius, threshold
  /* OUTDOORS THE BLOOM HAS TO BE RE-AIMED. Indoors the only thing over the
     threshold is a ceiling panel: a few hundred bright pixels in a dark
     room, which is what a bloom is for. Open the roof and half the screen is
     sky, all of it over that threshold, and the pass lays a flat glow over
     the whole frame - measured, 100% of pixels clipped to white with bloom
     on and none with it off. Above the sky's own brightness it goes back to
     doing the job it was added for: the rooflights, the plume, a flash. */
  bloomSky: [0.15, 0.80, 1.75],
  dynFill: 0.62, dynKey: 1.05,     // the two real lights, which only reach moving things in this look
  rim: [0.40, 0.46, 0.56],         // the outline light on players
};

/* ---------------------------------------------------------------------
   1. THE BAKE
   --------------------------------------------------------------------- */

/* Everything the bake needs about one map, in flat typed arrays: this is
   called from the innermost loop a few million times. */
/* OUTDOORS the sky is the light. There is no second machinery for it: an
   overcast sky IS a very large, very broad, very high panel, so it is baked
   as the same grid of rectangles the roof uses, just lifted to `skyY` and
   spread wide enough to be continuous. What that buys is the thing a
   directional light cannot give — real contact darkening under and inside
   everything on the site, and soft-edged shadows that widen with distance
   from whatever casts them. The sun on top of it is the ordinary
   directional light, with its own shadow map, exactly as indoors. */
function litContext(map){
  const L = map.lamps || { spacing: 24, reach: 0, w: 6, d: 2.4 };
  const lampY = map.skyY != null ? map.skyY : map.wallH - LIT.lampDrop;
  const lamps = [];
  /* `reachX` lets the grid be narrower than it is long: 0 is a single row
     down the middle of the hall, which is a skylight. */
  const rx = L.reachX != null ? L.reachX : L.reach;
  for (let gx = -rx; gx <= rx; gx++)
    for (let gz = -L.reach; gz <= L.reach; gz++) lamps.push(gx * L.spacing, gz * L.spacing);
  const nb = map.boxes.length, boxes = new Float32Array(nb * 5);
  map.boxes.forEach((b, i) => boxes.set([b.x - b.w/2, b.x + b.w/2, b.z - b.d/2, b.z + b.d/2, b.h], i * 5));
  /* A BROADPHASE over the boxes, because `litBlocked` is the whole cost of
     the bake and it used to try every box in the map against every shadow
     ray. The early reject is five comparisons, which sounds free until you
     count: a 120-box map fires something like ten million rays, so that is
     six billion comparisons and about eight seconds of a frozen tab.

     So the site is cut into cells and each cell is told which boxes overlap
     it. A ray then walks the cells it actually crosses and tests six boxes
     instead of a hundred and twenty. Stored CSR-style in two typed arrays -
     `cellAt[c]` is where cell c's indices start in `cellBox` - because a
     hundred small arrays allocate and this is the hot path.

     The one subtlety is that a ray must not test the same box twice when it
     crosses two of that box's cells; `seen` is a stamp buffer for that, and
     it is per-context rather than per-call so it is not reallocated ten
     million times. */
  const cs = 10, gw = Math.max(1, Math.ceil(2 * map.arena / cs) + 2), g0 = -map.arena - cs;
  const cellN = new Int32Array(gw * gw);
  const cellOf = (v) => Math.max(0, Math.min(gw - 1, Math.floor((v - g0) / cs)));
  for (let i = 0; i < nb; i++){ const o = i * 5;
    for (let cx = cellOf(boxes[o]); cx <= cellOf(boxes[o+1]); cx++)
      for (let cz = cellOf(boxes[o+2]); cz <= cellOf(boxes[o+3]); cz++) cellN[cz * gw + cx]++; }
  const cellAt = new Int32Array(gw * gw + 1);
  for (let c = 0; c < gw * gw; c++) cellAt[c + 1] = cellAt[c] + cellN[c];
  const cellBox = new Int32Array(cellAt[gw * gw]), fill = new Int32Array(gw * gw);
  for (let i = 0; i < nb; i++){ const o = i * 5;
    for (let cx = cellOf(boxes[o]); cx <= cellOf(boxes[o+1]); cx++)
      for (let cz = cellOf(boxes[o+2]); cz <= cellOf(boxes[o+3]); cz++){
        const c = cz * gw + cx; cellBox[cellAt[c] + fill[c]++] = i; } }
  /* The strip is thin and very long, so it is sampled as a row of points
     along each wall's inner face, each standing for stripStep metres. */
  /* The crimson wall strips are a room's accent: a site boundary is an
     embankment with trees on it, and lighting that red would be absurd. */
  const D = map.arena - 1, st = LIT.stripStep, strips = [];
  for (let t = -D + st/2; !map.sky && t < D; t += st){
    strips.push( t, LIT.stripY, -D,  0,  1);     // north wall, facing +z
    strips.push( t, LIT.stripY,  D,  0, -1);     // south
    strips.push(-D, LIT.stripY,  t,  1,  0);     // west
    strips.push( D, LIT.stripY,  t, -1,  0);     // east
  }
  const hx = L.w / 2, hz = L.d / 2, area = L.w * L.d;
  /* ONE UNIT of baked light is the floor directly under a single panel.
     Measuring it rather than assuming it keeps a map with a lower roof or
     a bigger panel at the same exposure as every other. */
  let e0 = 0;
  for (let a = 0; a < 6; a++) for (let q = 0; q < 3; q++){
    const sx = ((a + 0.5) / 6 * 2 - 1) * hx, sz = ((q + 0.5) / 3 * 2 - 1) * hz;
    const r2 = sx*sx + lampY*lampY + sz*sz; e0 += lampY * lampY / (r2 * r2);
  }
  e0 = e0 * area / 18;
  return { lamps: Float32Array.from(lamps), nLamps: lamps.length / 2, lampY, lampHx: hx, lampHz: hz,
           lampArea: area, lampL: 1 / e0, cull2: 38 * 38, lampRGB: L.rgb || LIT.lampRGB,
           boxes, nBoxes: nb,
           cs, gw, g0, cellAt, cellBox, seen: new Int32Array(nb), stamp: 0,
           strips: Float32Array.from(strips), nStrips: strips.length / 5,
           stripDA: st * LIT.stripHalf * 2, stripCull2: 17 * 17 };
}

/* Is the straight line from p to s cut by any cover? A slab test per box,
   but only against the boxes in the grid cells the ray actually crosses -
   walked with a DDA, which is the same march a software rasteriser does
   along a line. Cover stands on the floor, so its y slab is [0, maxy]. */
function litBlocked(c, px, py, pz, sx, sy, sz){
  const B = c.boxes;
  const dx = sx - px, dy = sy - py, dz = sz - pz;
  const gw = c.gw, cs = c.cs, g0 = c.g0, cellAt = c.cellAt, cellBox = c.cellBox, seen = c.seen;
  const stamp = ++c.stamp;
  /* The cells, from p to s. Step one axis at a time, whichever boundary is
     nearer, exactly as a line walk does. */
  let cx = Math.floor((px - g0) / cs), cz = Math.floor((pz - g0) / cs);
  const ex = Math.floor((sx - g0) / cs), ez = Math.floor((sz - g0) / cs);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(cs / dx) : Infinity, tdz = dz !== 0 ? Math.abs(cs / dz) : Infinity;
  let tmx = dx !== 0 ? Math.abs(((dx > 0 ? (cx + 1) * cs + g0 : cx * cs + g0) - px) / dx) : Infinity;
  let tmz = dz !== 0 ? Math.abs(((dz > 0 ? (cz + 1) * cs + g0 : cz * cs + g0) - pz) / dz) : Infinity;
  for (let guard = 0; guard < 96; guard++){
    if (cx >= 0 && cx < gw && cz >= 0 && cz < gw){
      const cell = cz * gw + cx, end = cellAt[cell + 1];
      for (let k = cellAt[cell]; k < end; k++){
        const i = cellBox[k];
        if (seen[i] === stamp) continue;
        seen[i] = stamp;
        if (litBlockedBox(B, i, px, py, pz, dx, dy, dz, sx, sz)) return true;
      }
    }
    if (cx === ex && cz === ez) break;
    if (tmx < tmz){ cx += stepX; tmx += tdx; } else { cz += stepZ; tmz += tdz; }
  }
  return false;
}
/* One box against the ray. Lifted out of the loop above so the grid walk
   reads as a grid walk; the slab test itself is unchanged. */
function litBlockedBox(B, i, px, py, pz, dx, dy, dz, sx, sz){
  {
    const o = i * 5, minx = B[o], maxx = B[o+1], minz = B[o+2], maxz = B[o+3], maxy = B[o+4];
    if ((px < minx && sx < minx) || (px > maxx && sx > maxx) ||
        (pz < minz && sz < minz) || (pz > maxz && sz > maxz) || (py > maxy && py + dy > maxy)) return false;
    let t0 = 0, t1 = 1, a, b, t;
    if (dx !== 0){ a = (minx - px) / dx; b = (maxx - px) / dx; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
    if (dz !== 0){ a = (minz - pz) / dz; b = (maxz - pz) / dz; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
    if (dy !== 0){ a = -py / dy; b = (maxy - py) / dy; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
    return true;
  }
}

/* Light arriving at a point with normal n, straight from the fixtures.
   `seed` non-zero jitters each sample inside its cell: the floor uses that
   and blurs the result, which turns the banding a regular grid would leave
   in a penumbra into noise fine enough to blur away. Vertices pass 0 and
   get fixed samples — per-vertex noise has nothing to blur it.

   A panel faces straight down, so the cosine at the lamp is just the
   upward part of the direction: cs/r at the surface, vy/r at the lamp,
   over r squared. */
function litDirect(c, px, py, pz, nx, ny, nz, seed, out){
  let r = 0, g = 0, b = 0;
  const ox = px + nx * 0.03, oy = py + ny * 0.03, oz = pz + nz * 0.03;
  const lamps = c.lamps, nl = c.nLamps, hx = c.lampHx, hz = c.lampHz, ly = c.lampY;
  const vy = ly - oy;
  if (vy > 0.05){
    for (let l = 0; l < nl; l++){
      const lx = lamps[l*2], lz = lamps[l*2+1];
      const ddx = lx - ox, ddz = lz - oz, hd2 = ddx*ddx + ddz*ddz;
      if (hd2 > c.cull2) continue;
      /* More samples where the lamp matters most. The nearest panel sets
         the shadow you actually see; one 30m away only adds a little fill. */
      let nu, nv;
      if (hd2 < 196){ nu = 6; nv = 3; } else if (hd2 < 676){ nu = 4; nv = 2; } else { nu = 2; nv = 1; }
      if (!seed && nu > 4){ nu = 4; nv = 2; }
      let acc = 0;
      for (let a = 0; a < nu; a++) for (let q = 0; q < nv; q++){
        let fu = 0.5, fv = 0.5;
        if (seed){ seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; fu = seed / 4294967296;
                   seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; fv = seed / 4294967296; }
        const sx = lx + (((a + fu) / nu) * 2 - 1) * hx, sz = lz + (((q + fv) / nv) * 2 - 1) * hz;
        const vx = sx - ox, vz = sz - oz;
        const cs = nx*vx + ny*vy + nz*vz; if (cs <= 0) continue;
        const r2 = vx*vx + vy*vy + vz*vz;
        if (litBlocked(c, ox, oy, oz, sx, ly, sz)) continue;
        acc += cs * vy / (r2 * r2);
      }
      const w = acc * c.lampArea / (nu * nv) * c.lampL;
      r += w * c.lampRGB[0]; g += w * c.lampRGB[1]; b += w * c.lampRGB[2];
    }
  }
  /* The strip is an ACCENT. Left at full strength on what faces down it
     turned the whole roof red for ten metres in from every wall, and the
     room stopped having a colour of its own. */
  const S = c.strips, ns = c.nStrips, sw = c.stripDA * LIT.stripL * (ny < -0.5 ? LIT.stripRoof : 1);
  for (let s = 0; s < ns; s++){
    const o = s * 5, vx = S[o] - ox, vz = S[o+2] - oz;
    const hd2 = vx*vx + vz*vz; if (hd2 > c.stripCull2) continue;
    const cl = -(S[o+3] * vx + S[o+4] * vz); if (cl <= 0) continue;     // behind the strip's own wall
    const vy2 = S[o+1] - oy;
    const cs = nx*vx + ny*vy2 + nz*vz; if (cs <= 0) continue;
    const r2 = hd2 + vy2*vy2;
    if (litBlocked(c, ox, oy, oz, S[o], S[o+1], S[o+2])) continue;
    const w = cs * cl / (r2 * r2) * sw;
    r += w * LIT.stripRGB[0]; g += w * LIT.stripRGB[1]; b += w * LIT.stripRGB[2];
  }
  out[0] = r; out[1] = g; out[2] = b;
}

/* The floor lightmap is baked a row at a time so it can be spread over
   frames. A whole map is a second or so of work: fine behind the menu,
   where the arena is not even on screen, and not fine as a freeze every
   time someone clicks the MAP card. */
let litJob = null, litGen = 0, litTex = null;
const litMeshes = [];                 // what the vertex pass has to visit

function litBakeRow(job, j){
  const W = job.W, A = job.A, c = job.ctx, data = job.data, valid = job.valid, B = c.boxes, nb = c.nBoxes;
  const z = -A + (j + 0.5) / W * 2 * A, inner = A - 1, out = job.tmp;
  for (let i = 0; i < W; i++){
    const x = -A + (i + 0.5) / W * 2 * A, k = j * W + i;
    let ok = Math.abs(x) < inner && Math.abs(z) < inner;
    for (let q = 0; ok && q < nb; q++){ const o = q * 5;
      if (x > B[o] && x < B[o+1] && z > B[o+2] && z < B[o+3]) ok = false; }   // under a crate
    valid[k] = ok ? 1 : 0;
    if (!ok) continue;
    litDirect(c, x, 0, z, 0, 1, 0, ((k + 1) * 2654435761) >>> 0 || 1, out);
    data[k*3] = out[0]; data[k*3+1] = out[1]; data[k*3+2] = out[2];
  }
}

function litBakeStart(map){
  const A = map.arena, W = A > 50 ? 256 : 192;
  const job = litJob = { gen: ++litGen, map, A, W, ctx: litContext(map), row: 0, tmp: [0, 0, 0],
                         data: new Float32Array(W * W * 3), valid: new Uint8Array(W * W), done: false };
  /* Standing in the arena already (a multiplayer join names the map after
     play has begun): there is nothing to hide behind, so do it now. */
  if (!menuBackdropOn) { litBakeFinishNow(); return; }
  const tick = () => {
    if (litJob !== job || job.done) return;            // superseded by another map, or finished early
    const t0 = performance.now();
    while (job.row < job.W && performance.now() - t0 < 7) litBakeRow(job, job.row++);
    if (job.row >= job.W) litBakeDone(job); else setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
function litBakeFinishNow(){
  const job = litJob; if (!job || job.done) return;
  while (job.row < job.W) litBakeRow(job, job.row++);
  litBakeDone(job);
}

function litBakeDone(job){
  if (job.done) return; job.done = true;
  const W = job.W, n = W * W, data = job.data;
  /* 1. Texels the bake could not reach — under cover, inside the walls —
     take their neighbours' light. They are never seen, but the texture is
     filtered, and a black texel next to a crate would smear a dark edge
     onto the floor beside it, in a different place for every crate
     depending on how its edge happens to fall on the grid. */
  let cur = job.valid, nxt = new Uint8Array(n);
  for (let pass = 0; pass < 5; pass++){
    nxt.set(cur);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++){
      const k = j * W + i; if (cur[k]) continue;
      let r = 0, g = 0, b = 0, cnt = 0, q;
      if (i > 0     && cur[q = k - 1]){ r += data[q*3]; g += data[q*3+1]; b += data[q*3+2]; cnt++; }
      if (i < W - 1 && cur[q = k + 1]){ r += data[q*3]; g += data[q*3+1]; b += data[q*3+2]; cnt++; }
      if (j > 0     && cur[q = k - W]){ r += data[q*3]; g += data[q*3+1]; b += data[q*3+2]; cnt++; }
      if (j < W - 1 && cur[q = k + W]){ r += data[q*3]; g += data[q*3+1]; b += data[q*3+2]; cnt++; }
      if (cnt){ data[k*3] = r/cnt; data[k*3+1] = g/cnt; data[k*3+2] = b/cnt; nxt[k] = 1; }
    }
    const s = cur; cur = nxt; nxt = s;
  }
  /* 2. Blur the sampling noise out: [1 4 6 4 1] each way, over reached texels only. */
  const K = [1, 4, 6, 4, 1], tmp = new Float32Array(n * 3);
  for (let pass = 0; pass < 2; pass++){
    const src = pass ? tmp : data, dst = pass ? data : tmp, step = pass ? W : 1;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++){
      const k = j * W + i; let r = 0, g = 0, b = 0, ws = 0;
      for (let t = -2; t <= 2; t++){
        const ii = pass ? i : i + t, jj = pass ? j + t : j;
        if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue;
        const q = k + t * step; if (!cur[q]) continue;
        const w = K[t + 2]; r += src[q*3] * w; g += src[q*3+1] * w; b += src[q*3+2] * w; ws += w;
      }
      if (ws){ dst[k*3] = r/ws; dst[k*3+1] = g/ws; dst[k*3+2] = b/ws; } else { dst[k*3] = dst[k*3+1] = dst[k*3+2] = 0; }
    }
  }
  /* 3. Pack. Square-root encoded into 8 bits: light is wanted most finely in
     the dark, and a straight 0..255 would band there. The shader squares it
     back. Range is 0..4 units. */
  const px = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++){
    for (let ch = 0; ch < 3; ch++)
      px[k*4 + ch] = Math.round(Math.sqrt(Math.min(4, Math.max(0, data[k*3 + ch])) / 4) * 255);
    px[k*4 + 3] = 255;
  }
  if (litTex) litTex.dispose();
  litTex = new THREE.DataTexture(px, W, W, THREE.RGBAFormat);
  litTex.magFilter = THREE.LinearFilter; litTex.minFilter = THREE.LinearMipmapLinearFilter;
  litTex.generateMipmaps = true; litTex.needsUpdate = true;
  LITU.uLitTex.value = litTex;

  /* 4. What the floor throws back up. A quarter-size, heavily blurred copy:
     bounce light has no edges, and the vertex pass samples it per vertex. */
  const bn = job.bn = W >> 2, bounce = job.bounce = new Float32Array(bn * bn * 3);
  for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++){
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const q = ((j*4 + y) * W + i*4 + x) * 3;
      r += data[q]; g += data[q+1]; b += data[q+2]; }
    const o = (j * bn + i) * 3; bounce[o] = r/16; bounce[o+1] = g/16; bounce[o+2] = b/16;
  }
  const bt = new Float32Array(bn * bn * 3);
  for (let rep = 0; rep < 3; rep++) for (let pass = 0; pass < 2; pass++){
    const src = pass ? bt : bounce, dst = pass ? bounce : bt, step = pass ? bn : 1;
    for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++){
      const k = j * bn + i; let r = 0, g = 0, b = 0, ws = 0;
      for (let t = -2; t <= 2; t++){
        const ii = pass ? i : i + t, jj = pass ? j + t : j;
        if (ii < 0 || jj < 0 || ii >= bn || jj >= bn) continue;
        const q = (k + t * step) * 3, w = K[t + 2];
        r += src[q] * w; g += src[q+1] * w; b += src[q+2] * w; ws += w;
      }
      dst[k*3] = r/ws; dst[k*3+1] = g/ws; dst[k*3+2] = b/ws;
    }
  }
  /* 5. Now everything that is not the floor, per vertex. */
  for (const m of litMeshes) litBakeMesh(job, m);
}

function litBounceAt(job, x, z, out){
  const n = job.bn, A = job.A, B = job.bounce;
  let fx = (x + A) / (2 * A) * n - 0.5, fz = (z + A) / (2 * A) * n - 0.5;
  fx = Math.max(0, Math.min(n - 1.001, fx)); fz = Math.max(0, Math.min(n - 1.001, fz));
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = (j * n + i) * 3, b = a + 3, c = a + n * 3, d = c + 3;
  for (let ch = 0; ch < 3; ch++)
    out[ch] = (B[a+ch] * (1 - tx) + B[b+ch] * tx) * (1 - tz) + (B[c+ch] * (1 - tx) + B[d+ch] * tx) * tz;
}

/* Direct light plus the floor's bounce, written into the `cxBake`
   attribute. Ambient is NOT baked: it is a uniform, so it can be tuned
   without doing this again. What faces down sees the whole lit floor, a
   wall sees half of it, a top sees none. */
function litBakeMesh(job, mesh){
  const g = mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array;
  const C = g.attributes.cxBake.array, d = [0, 0, 0], bn = [0, 0, 0], br = LIT.bounceRGB;
  for (let v = 0, n = P.length; v < n; v += 3){
    const x = P[v], y = P[v+1], z = P[v+2], ny = N[v+1];
    litDirect(job.ctx, x, y, z, N[v], ny, N[v+2], 0, d);
    litBounceAt(job, x, z, bn);
    const f = LIT.bounce * Math.max(0, 0.55 - 0.45 * ny) / (1 + y * 0.05);
    C[v] = d[0] + bn[0] * f * br[0]; C[v+1] = d[1] + bn[1] * f * br[1]; C[v+2] = d[2] + bn[2] * f * br[2];
  }
  g.attributes.cxBake.needsUpdate = true;
}

/* ---------------------------------------------------------------------
   2. GEOMETRY — built in WORLD space, so a vertex's position is where it
   is and its normal is which way it faces; the bake needs both.
   --------------------------------------------------------------------- */
function litGeo(){ return { p: [], n: [], uv: [], i: [] }; }

/* A subdivided rectangle. `u` and `v` are its two edge directions and must
   satisfy u x v = n, or it faces the wrong way and is culled. */
function litGrid(g, ox, oy, oz, ux, uy, uz, vx, vy, vz, lu, lv, nx, ny, nz, segU, segV, tu, tv, u0, v0){
  if (lu <= 0 || lv <= 0) return;
  const su = Math.max(1, Math.ceil(lu / segU)), sv = Math.max(1, Math.ceil(lv / segV));
  const base = g.p.length / 3;
  for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++){
    const a = lu * i / su, b = lv * j / sv;
    g.p.push(ox + ux*a + vx*b, oy + uy*a + vy*b, oz + uz*a + vz*b);
    g.n.push(nx, ny, nz);
    g.uv.push(((u0 || 0) + a) / tu, ((v0 || 0) + b) / tv);
  }
  for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++){
    const q = base + j * (su + 1) + i;
    g.i.push(q, q + 1, q + su + 1,  q + 1, q + su + 2, q + su + 1);
  }
}
/* A bevel: a thin band joining the edges of two faces. Each side keeps the
   normal of the face it touches, so the band shades as a ROUNDED edge
   though it is one flat strip. Winding is worked out, not assumed.
   `du`/`dv` carry line B's texture coordinates on past the face's edge by
   the bevel's own width. With both lines on the SAME coordinates the band
   showed one column of the texture stretched across it, which on a crate
   read as a strip of something else nailed down the corner. */
function litStrip(g, a0, a1, na, b0, b1, nb, segs, ua0, va0, ua1, va1, du, dv){
  const base = g.p.length / 3;
  for (let i = 0; i <= segs; i++){ const t = i / segs, u = ua0 + (ua1 - ua0) * t, v = va0 + (va1 - va0) * t;
    g.p.push(a0[0] + (a1[0]-a0[0])*t, a0[1] + (a1[1]-a0[1])*t, a0[2] + (a1[2]-a0[2])*t); g.n.push(na[0], na[1], na[2]); g.uv.push(u, v);
    g.p.push(b0[0] + (b1[0]-b0[0])*t, b0[1] + (b1[1]-b0[1])*t, b0[2] + (b1[2]-b0[2])*t); g.n.push(nb[0], nb[1], nb[2]); g.uv.push(u + du, v + dv);
  }
  const e1 = [a1[0]-a0[0], a1[1]-a0[1], a1[2]-a0[2]], e2 = [b0[0]-a0[0], b0[1]-a0[1], b0[2]-a0[2]];
  const cx = e1[1]*e2[2] - e1[2]*e2[1], cy = e1[2]*e2[0] - e1[0]*e2[2], cz = e1[0]*e2[1] - e1[1]*e2[0];
  const out = cx*(na[0]+nb[0]) + cy*(na[1]+nb[1]) + cz*(na[2]+nb[2]) > 0;
  for (let i = 0; i < segs; i++){ const q = base + i * 2;
    if (out) g.i.push(q, q + 2, q + 1,  q + 2, q + 3, q + 1);
    else     g.i.push(q, q + 1, q + 2,  q + 2, q + 1, q + 3);
  }
}
function litTri(g, p0, n0, p1, n1, p2, n2, u, v){
  const base = g.p.length / 3;
  g.p.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  g.n.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
  g.uv.push(u, v, u, v, u, v);
  const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]], e2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
  const cx = e1[1]*e2[2] - e1[2]*e2[1], cy = e1[2]*e2[0] - e1[0]*e2[2], cz = e1[0]*e2[1] - e1[1]*e2[0];
  const out = cx*(n0[0]+n1[0]+n2[0]) + cy*(n0[1]+n1[1]+n2[1]) + cz*(n0[2]+n1[2]+n2[2]) > 0;
  if (out) g.i.push(base, base + 1, base + 2); else g.i.push(base, base + 2, base + 1);
}
/* A box. With a bevel its top edges and its four upright edges are cut and
   rounded; the foot is left square, since it meets the floor. The outer
   faces stay on exactly the planes the collision box has — a bevel only
   removes a few centimetres of corner. */
function litBox(g, x0, y0, z0, x1, y1, z1, o){
  /* `tile` is metres per repeat of the texture; `tileV` lets the upright
     repeat differ, for art drawn to a set height (a 2.2m cabinet door). */
  const b = o.bevel || 0, s = o.seg || 1, t = o.tile || 1, tv = o.tileV || t;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  if (!o.noTop)  litGrid(g, x0 + b, y1, z0 + b,  0,0,1,  1,0,0,  dz - 2*b, dx - 2*b,  0,1,0,  s, s, t, tv, z0 + b, x0 + b);
  if (o.bottom)  litGrid(g, x0, y0, z0,          1,0,0,  0,0,1,  dx, dz,              0,-1,0, s, s, t, tv, x0, z0);
  if (o.noSides) return;
  litGrid(g, x1, y0, z1 - b,  0,0,-1,  0,1,0,  dz - 2*b, dy - b,   1,0,0,  s, s, t, tv, 0, y0);
  litGrid(g, x0, y0, z0 + b,  0,0,1,   0,1,0,  dz - 2*b, dy - b,  -1,0,0,  s, s, t, tv, 0, y0);
  litGrid(g, x0 + b, y0, z1,  1,0,0,   0,1,0,  dx - 2*b, dy - b,   0,0,1,  s, s, t, tv, 0, y0);
  litGrid(g, x1 - b, y0, z0,  -1,0,0,  0,1,0,  dx - 2*b, dy - b,   0,0,-1, s, s, t, tv, 0, y0);
  if (b <= 0) return;
  const yt = y1 - b, vt = yt / tv, sz = Math.max(1, Math.ceil((dz - 2*b) / s)), sx = Math.max(1, Math.ceil((dx - 2*b) / s)),
        sy = Math.max(1, Math.ceil((dy - b) / s)), X = [1,0,0], XN = [-1,0,0], Y = [0,1,0], Z = [0,0,1], ZN = [0,0,-1];
  // the four top edges
  litStrip(g, [x1, yt, z1 - b], [x1, yt, z0 + b], X,  [x1 - b, y1, z1 - b], [x1 - b, y1, z0 + b], Y, sz, 0, vt, (dz - 2*b) / t, vt, 0, b / tv);
  litStrip(g, [x0, yt, z0 + b], [x0, yt, z1 - b], XN, [x0 + b, y1, z0 + b], [x0 + b, y1, z1 - b], Y, sz, 0, vt, (dz - 2*b) / t, vt, 0, b / tv);
  litStrip(g, [x0 + b, yt, z1], [x1 - b, yt, z1], Z,  [x0 + b, y1, z1 - b], [x1 - b, y1, z1 - b], Y, sx, 0, vt, (dx - 2*b) / t, vt, 0, b / tv);
  litStrip(g, [x1 - b, yt, z0], [x0 + b, yt, z0], ZN, [x1 - b, y1, z0 + b], [x0 + b, y1, z0 + b], Y, sx, 0, vt, (dx - 2*b) / t, vt, 0, b / tv);
  // the four uprights
  const v0 = y0 / tv;
  litStrip(g, [x1, y0, z1 - b], [x1, yt, z1 - b], X,  [x1 - b, y0, z1], [x1 - b, yt, z1], Z,  sy, 0, v0, 0, vt, -b / t, 0);
  litStrip(g, [x1, y0, z0 + b], [x1, yt, z0 + b], X,  [x1 - b, y0, z0], [x1 - b, yt, z0], ZN, sy, 0, v0, 0, vt, -b / t, 0);
  litStrip(g, [x0, y0, z1 - b], [x0, yt, z1 - b], XN, [x0 + b, y0, z1], [x0 + b, yt, z1], Z,  sy, 0, v0, 0, vt, -b / t, 0);
  litStrip(g, [x0, y0, z0 + b], [x0, yt, z0 + b], XN, [x0 + b, y0, z0], [x0 + b, yt, z0], ZN, sy, 0, v0, 0, vt, -b / t, 0);
  // and the four top corners, one triangle each
  for (const ex of [-1, 1]) for (const ez of [-1, 1]){
    const xo = ex > 0 ? x1 : x0, xi = ex > 0 ? x1 - b : x0 + b, zo = ez > 0 ? z1 : z0, zi = ez > 0 ? z1 - b : z0 + b;
    litTri(g, [xo, yt, zi], [ex, 0, 0], [xi, y1, zi], Y, [xi, yt, zo], [0, 0, ez], 0, vt);
  }
}
/* A vertical pipe at a point on a machine's own along/across frame. Only
   the turbine wants it, and only for the steam lines. */
function CYL2(G, az, p, s, a, y0, c, y1, r){
  const x = az ? (p.x + c) : (p.x + a * s), z = az ? (p.z + a * s) : (p.z + c);
  litCyl(G('bus'), x, y0, z, x, y1, z, r, r, 12, 2, false, false);
}
/* ---------------------------------------------------------------------
   A DRUM, DRAWN AS EXACTLY THE BOXES THAT STOP YOU
   ---------------------------------------------------------------------
   A collision box is axis-aligned, so a circle has to be approximated by a
   staircase of them. The tempting measurement is the staircase's OUTER
   corners, which sit exactly on the circle - and that is what made the
   power station claim 43mm. It is the wrong corners. Between two outer
   corners the boundary steps INWARD, and that inner corner is the error:

        5 uniform steps     R=3.1 vessel 0.50m    R=13 tower 2.08m
        5 equal-area steps  R=3.1 vessel 0.33m    R=13 tower 1.37m
        9 equal-area steps  R=3.1 vessel 0.18m    R=13 tower 0.74m

   Half a metre of drum you can walk into, at eight places round it. On a
   26m cooling tower, two.

   More steps will not fix it: the error falls as 1/N, so a tower would want
   twenty-odd boxes per band. The answer is to stop approximating. Within
   reach of a player, a drum is DRAWN as the rectilinear prism its own
   collision boxes make - a 36-sided concrete shape that reads as round from
   two metres away and IS the collision, exactly, by construction. Above
   reach it goes back to being a smooth cylinder, where nothing can touch it.

   `litDrumSteps` is the one place the staircase is defined. The map's boxes
   are generated from the same formula, so the two cannot drift.           */
function litDrumSteps(R, N){
  const e = [];
  for (let i = 0; i < N; i++){
    /* Equal-area spacing: the error is worst at 45 degrees and zero on the
       axes, so the steps are packed toward the diagonal rather than spread
       evenly round the quadrant. That alone is a third off the worst case. */
    const th = Math.asin(Math.sqrt((i + 0.5) / N));
    e.push([R * Math.cos(th), R * Math.sin(th)]);
  }
  return e;                                     // [[hx, hz], ...] hx falling, hz rising
}
/* The outline of that staircase, as a closed loop of axis-aligned segments,
   walked anticlockwise from (hx0, 0). */
function litDrumOutline(e){
  const q = [[e[0][0], 0]];
  for (let i = 0; i < e.length; i++){
    q.push([e[i][0], e[i][1]]);
    if (i + 1 < e.length) q.push([e[i+1][0], e[i][1]]);
  }
  q.push([0, e[e.length-1][1]]);
  const out = q.slice();
  for (let i = q.length - 2; i >= 0; i--) out.push([-q[i][0],  q[i][1]]);   // quadrant 2
  for (let i = 1;             i < q.length; i++) out.push([-q[i][0], -q[i][1]]);  // 3
  for (let i = q.length - 2; i >= 1; i--) out.push([ q[i][0], -q[i][1]]);   // 4
  return out;
}
/* The prism itself: the wall all the way round, and optionally the top,
   which is cut into disjoint bands so no two coplanar faces overlap and
   fight. `inner` leaves the middle of the top open, for a basin whose shell
   stands in it. */
function litDrumPrism(g, cx, cz, R, N, y0, y1, o){
  o = o || {};
  const e = litDrumSteps(R, N), loop = litDrumOutline(e), dy = y1 - y0;
  const tile = o.tile || 4, tv = o.tileV || tile;
  for (let i = 0; i < loop.length; i++){
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.abs(dx) + Math.abs(dz);
    if (len < 1e-6) continue;
    /* WINDING, THEN NORMAL - and in that order, because they are not the
       same decision and getting them confused is what made every drum in
       the game half transparent.

       `litGrid` winds its triangles from u CROSS v. With u along the
       segment and v straight up, that cross product is (-uz, 0, ux). The
       first version passed (uz, 0, -ux) - exactly the opposite - and then
       "corrected" it by flipping the normal whenever it pointed inward.
       Flipping a normal does not flip a winding, so every facet whose
       normal needed no flip was left facing INWARDS and was culled: a ring
       of alternating visible panels and see-through gaps, on the reactor
       deck, both cooling towers, the stack, the vessel and every tank.
       It reads exactly like holes in the geometry, which is what it is.

       So: if the winding's own normal points inward, reverse the DIRECTION
       OF TRAVEL, which flips the winding with it. Then, for shading only,
       hand it the RADIAL normal - a staircase has four face normals, so
       under a sky the +-x and +-z facets take very different light and the
       ring stripes; aiming each facet's normal at the circle it stands for
       makes the shading sweep round like a cylinder's while the surface
       stays exactly the boxes that stop you. */
    let p0 = a, p1 = b, ux = dx / len, uz = dz / len;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if ((-uz) * mx + ux * mz < 0){ p0 = b; p1 = a; ux = -ux; uz = -uz; }
    const ml = Math.hypot(mx, mz) || 1, nx = mx / ml, nz = mz / ml;
    litGrid(g, cx + p0[0], y0, cz + p0[1], ux, 0, uz, 0, 1, 0, len, dy,
            nx, 0, nz, o.seg || LIT.coverSeg, o.seg || LIT.coverSeg, tile, tv, 0, y0);
  }
  if (!o.top) return;
  const r0 = o.inner || 0;
  for (let i = 0; i < e.length; i++){
    const z0 = i ? e[i-1][1] : 0, z1 = e[i][1], hx = e[i][0];
    if (z1 - z0 < 1e-6) continue;
    for (const sgn of (i ? [1, -1] : [1])){
      const za = i ? (sgn > 0 ? z0 : -z1) : -z1, zb = i ? (sgn > 0 ? z1 : -z0) : z1;
      /* u is +z and v is +x, NOT the other way round: for an upward normal
         the winding has to be z-then-x, as litBox's own top face is. With
         the two swapped every drum's top came out inside-out - invisible
         from above, and the probe read the basins and ring beams as 5.6m of
         collision standing under nothing at all. */
      litGrid(g, cx - hx, y1, cz + za, 0,0,1, 1,0,0, zb - za, 2*hx, 0,1,0,
              o.seg || LIT.coverSeg, o.seg || LIT.coverSeg, tile, tile, cz + za, cx - hx);
    }
  }
}

/* A cylinder from point A to point B, with a radius at each end so it can
   taper. The casing of a turbine, a bushing, a pipe. `capA` / `capB` close
   the ends; most are left open because they sit against something.
   The basis is built so that u x v points along the axis, which is what
   makes the winding below come out facing outward rather than in. */
function litCyl(g, ax, ay, az, bx, by, bz, r0, r1, sides, tile, capA, capB){
  let dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  // u = h x d for a helper h that is not parallel to the axis; v = d x u
  let ux, uy, uz;
  if (Math.abs(dy) < 0.9){ ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = dy*uz - dz*uy, vy = dz*ux - dx*uz, vz = dx*uy - dy*ux;
  const base = g.p.length / 3, t = tile || 1, round = Math.PI * (r0 + r1);
  for (let i = 0; i <= sides; i++){
    const th = i / sides * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const nx = ux*c + vx*s, ny = uy*c + vy*s, nz = uz*c + vz*s, u = i / sides * round / t;
    g.p.push(ax + nx*r0, ay + ny*r0, az + nz*r0); g.n.push(nx, ny, nz); g.uv.push(u, 0);
    g.p.push(bx + nx*r1, by + ny*r1, bz + nz*r1); g.n.push(nx, ny, nz); g.uv.push(u, len / t);
  }
  for (let i = 0; i < sides; i++){ const q = base + i * 2;      // q: a_i, q+1: b_i, q+2: a_i+1, q+3: b_i+1
    g.i.push(q, q + 2, q + 1,  q + 2, q + 3, q + 1); }
  const cap = (px, py, pz, r, sgn) => {
    const c0 = g.p.length / 3;
    g.p.push(px, py, pz); g.n.push(dx*sgn, dy*sgn, dz*sgn); g.uv.push(0.5, 0.5);
    for (let i = 0; i <= sides; i++){ const th = i / sides * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      g.p.push(px + (ux*c + vx*s)*r, py + (uy*c + vy*s)*r, pz + (uz*c + vz*s)*r);
      g.n.push(dx*sgn, dy*sgn, dz*sgn); g.uv.push(0.5 + c*0.5, 0.5 + s*0.5); }
    for (let i = 0; i < sides; i++) if (sgn > 0) g.i.push(c0, c0 + 1 + i, c0 + 2 + i); else g.i.push(c0, c0 + 2 + i, c0 + 1 + i);
  };
  if (capA) cap(ax, ay, az, r0, -1);
  if (capB) cap(bx, by, bz, r1, 1);
}
function litGeoDone(g){
  const geo = new THREE.BufferGeometry(), n = g.p.length / 3;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(g.n, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('cxBake',   new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.4), 3));
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(g.i, 1) : new THREE.Uint16BufferAttribute(g.i, 1));
  return geo;
}

/* ---------------------------------------------------------------------
   3. SURFACES — painted steel for the barriers and the housings, and the
   markings on the floor. All drawn here; there are no new asset files.
   --------------------------------------------------------------------- */
function litCanvas(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function litTexOf(canvas, srgb){
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
/* A height picture to a normal map: the slope between each texel's
   neighbours, wrapped at the edges so the result still tiles. */
function litNormalFrom(hc, strength){
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  return litTexOf(litCanvas(w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data, H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const sx = (H(x + 1, y) - H(x - 1, y)) * strength, sy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const il = 1 / Math.sqrt(sx*sx + sy*sy + 1), k = (y * w + x) * 4;
      d[k] = (-sx * il * 0.5 + 0.5) * 255; d[k+1] = (sy * il * 0.5 + 0.5) * 255; d[k+2] = (il * 0.5 + 0.5) * 255; d[k+3] = 255;
    }
    g.putImageData(img, 0, 0);
  }), false);
}
/* Draw something at every wrap of a tiling canvas, so a blotch that runs
   off one edge comes back in on the other and the tile has no seam. */
function litWrap(S, x, y, r, fn){
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S])
    if (x + ox + r > 0 && x + ox - r < S && y + oy + r > 0 && y + oy - r < S) fn(x + ox, y + oy);
}
function litGrime(g, S, n, rnd){
  for (let i = 0; i < n; i++){
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 120, dark = rnd() < 0.6, a = 0.04 + rnd() * 0.07;
    litWrap(S, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, dark ? `rgba(6,8,12,${a})` : `rgba(170,185,205,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
  }
}
/* A seeded generator: the textures must be the same on every load, or two
   players would see different scuffs on the same wall. */
function litRand(seed){ let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/* The long barriers. One tile is 4m: panel seams every 2m, a hazard band
   along the foot, a dark cap. Height and roughness are drawn alongside the
   colour so a seam is a groove that catches light, not a grey line. */
function litBlockTextures(o){
  /* `o` re-skins the same panelled steel for other plant: the base paint,
     whether it wears a hazard band along the foot, what is stencilled on. */
  o = o || {};
  const S = 512, m = S / 4, rnd = litRand(o.seed || 7), band = o.band !== false;
  const text = o.text || ['CX', 'BALLISTIC BARRIER  ·  TYPE 4', 'DO NOT CLIMB'];
  const alb = litCanvas(S, S, (g) => {
    /* Nearly neutral on purpose. These colours are decoded from sRGB, which
       stretches the gap between channels: a paint that reads as slate in a
       colour picker (65,75,89) came out royal blue in the room. */
    g.fillStyle = o.base || '#4b4f56'; g.fillRect(0, 0, S, S);
    litGrime(g, S, 46, rnd);
    for (let i = 0; i < 110; i++){                                   // run-off streaks
      const x = rnd() * S, y = rnd() * S * 0.7, h = 30 + rnd() * 200;
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(6,8,11,0.22)'); gr.addColorStop(1, 'rgba(6,8,11,0)');
      g.fillStyle = gr; g.fillRect(x, y, 1 + rnd() * 2.5, h);
    }
    g.fillStyle = o.cap || '#24272c'; g.fillRect(0, 0, S, 20);      // cap
    const by = band ? S - 0.44 * m : S + 8;                          // hazard band, 0.44m tall (or none)
    g.save(); g.beginPath(); g.rect(0, by, S, S - by); g.clip();
    g.fillStyle = '#14161a'; g.fillRect(0, by, S, S - by);
    g.fillStyle = '#b9811f';
    for (let x = -S; x < S * 2; x += 64){ g.beginPath(); g.moveTo(x, S); g.lineTo(x + 32, S); g.lineTo(x + 32 + (S - by), by); g.lineTo(x + (S - by), by); g.closePath(); g.fill(); }
    for (let i = 0; i < 260; i++){ g.fillStyle = `rgba(16,18,22,${0.25 + rnd() * 0.5})`; g.fillRect(rnd() * S, by + rnd() * (S - by), 1 + rnd() * 9, 1 + rnd() * 2); }
    g.restore();
    g.fillStyle = 'rgba(8,10,13,0.9)'; g.fillRect(0, by - 3, S, 3);
    for (const x of [0, S / 2]){                                     // seams
      g.fillStyle = 'rgba(7,9,12,0.95)'; g.fillRect(x - 1.5, 0, 3, S);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 1.5, 0, 1, S);
    }
    g.fillStyle = 'rgba(7,9,12,0.9)'; g.fillRect(0, S / 2 - 1.5, S, 3);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, S / 2 + 1.5, S, 1);
    for (const px of [0, S / 2]) for (const py of [20, S / 2]){     // bolts and a stencil per panel
      for (const [bx, by2] of [[14, 14], [S / 2 - 14, 14], [14, S / 2 - 34], [S / 2 - 14, S / 2 - 34]]){
        g.fillStyle = '#12161b'; g.beginPath(); g.arc(px + bx, py + by2, 4.2, 0, 7); g.fill();
        g.fillStyle = 'rgba(210,220,235,0.28)'; g.beginPath(); g.arc(px + bx - 1, py + by2 - 1, 1.6, 0, 7); g.fill();
      }
    }
    g.font = '700 30px "Arial Narrow", Arial, sans-serif'; g.fillStyle = 'rgba(214,222,232,0.50)';
    g.fillText(text[0], 30, 78); g.fillText(text[0], S / 2 + 30, 78);
    g.font = '700 13px Arial, sans-serif'; g.fillStyle = 'rgba(214,222,232,0.36)';
    g.fillText(text[1], 30, 98); g.fillText(text[2], S / 2 + 30, 98);
    for (let i = 0; i < 520; i++){                                   // fine scratches
      const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 22, a = rnd() * 6.28;
      g.strokeStyle = rnd() < 0.5 ? `rgba(200,212,228,${0.04 + rnd() * 0.10})` : `rgba(4,6,9,${0.08 + rnd() * 0.16})`;
      g.lineWidth = 0.6 + rnd() * 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
  const rough = litCanvas(S, S, (g) => {
    g.fillStyle = 'rgb(0,150,0)'; g.fillRect(0, 0, S, S);
    const r2 = litRand(11);
    for (let i = 0; i < 60; i++){ const x = r2() * S, y = r2() * S, r = 20 + r2() * 90, v = 105 + r2() * 110;
      litWrap(S, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(0,${v | 0},0,0.5)`); gr.addColorStop(1, 'rgba(0,150,0,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
    if (band){ g.fillStyle = 'rgb(0,120,0)'; g.fillRect(0, S - 0.44 * m, S, 0.44 * m); }
    g.fillStyle = 'rgb(0,235,0)'; for (const x of [0, S / 2]) g.fillRect(x - 2, 0, 4, S); g.fillRect(0, S / 2 - 2, S, 4);
  });
  const height = litCanvas(S, S, (g) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(40,40,40)'; for (const x of [0, S / 2]){ g.fillRect(x - 2, 0, 4, S); } g.fillRect(0, S / 2 - 2, S, 4);
    if (band) g.fillRect(0, S - 0.44 * m - 3, S, 3);
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, S, 20);
    g.fillStyle = 'rgb(225,225,225)';
    for (const px of [0, S / 2]) for (const py of [20, S / 2])
      for (const [bx, by2] of [[14, 14], [S / 2 - 14, 14], [14, S / 2 - 34], [S / 2 - 14, S / 2 - 34]]){ g.beginPath(); g.arc(px + bx, py + by2, 4.2, 0, 7); g.fill(); }
  });
  return { map: litTexOf(alb, true), roughnessMap: litTexOf(rough, false), normalMap: litNormalFrom(height, 2.2) };
}
/* The square housings: the resupply core and the corner blocks. One tile is
   3m. A framed panel, a bank of vent slats up top, an access hatch below. */
function litPillarTextures(){
  const S = 512, rnd = litRand(23);
  const frame = (g, fill, line) => {
    g.fillStyle = fill; g.fillRect(0, 0, S, S);
    return line;
  };
  const alb = litCanvas(S, S, (g) => {
    g.fillStyle = '#3d4046'; g.fillRect(0, 0, S, S);
    litGrime(g, S, 40, rnd);
    g.fillStyle = '#292b30'; g.fillRect(0, 0, S, 16); g.fillRect(0, S - 30, S, 30);        // cap and kick plate
    g.strokeStyle = 'rgba(6,8,11,0.95)'; g.lineWidth = 3;
    for (const x of [0, S / 2]){ g.strokeRect(x + 18, 34, S / 2 - 36, S - 86); }           // two panels a tile
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (const x of [0, S / 2]){ g.strokeRect(x + 20.5, 36.5, S / 2 - 41, S - 91); }
    for (const x of [0, S / 2]){
      for (let y = 62; y < 170; y += 13){ g.fillStyle = '#0b0d10'; g.fillRect(x + 44, y, S / 2 - 88, 6);    // vent slats
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 44, y + 6, S / 2 - 88, 1); }
      g.fillStyle = '#474a51'; g.fillRect(x + 44, 250, S / 2 - 88, 150);                    // hatch
      g.strokeStyle = 'rgba(6,8,11,0.9)'; g.lineWidth = 2; g.strokeRect(x + 44, 250, S / 2 - 88, 150);
      g.fillStyle = '#0f1216'; g.fillRect(x + S / 4 - 22, 318, 44, 9);                      // handle
      g.fillStyle = '#b9811f'; g.fillRect(x + 54, 262, 26, 26);                             // warning plate
      g.fillStyle = '#14161a'; g.beginPath(); g.moveTo(x + 67, 266); g.lineTo(x + 77, 284); g.lineTo(x + 57, 284); g.closePath(); g.fill();
      g.font = '700 12px Arial, sans-serif'; g.fillStyle = 'rgba(214,222,232,0.40)'; g.fillText('SERVICE ACCESS', x + 88, 279);
      for (const [bx, by2] of [[30, 46], [S / 2 - 30, 46], [30, S - 64], [S / 2 - 30, S - 64]]){
        g.fillStyle = '#0d1014'; g.beginPath(); g.arc(x + bx, by2, 3.8, 0, 7); g.fill();
        g.fillStyle = 'rgba(210,220,235,0.26)'; g.beginPath(); g.arc(x + bx - 1, by2 - 1, 1.4, 0, 7); g.fill();
      }
    }
    g.fillStyle = 'rgba(214,40,62,0.85)'; g.fillRect(0, S - 34, S, 4);                     // a crimson line above the kick plate
    for (let i = 0; i < 420; i++){
      const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 18, a = rnd() * 6.28;
      g.strokeStyle = rnd() < 0.5 ? `rgba(200,212,228,${0.04 + rnd() * 0.09})` : `rgba(4,6,9,${0.08 + rnd() * 0.15})`;
      g.lineWidth = 0.6 + rnd() * 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
  const rough = litCanvas(S, S, (g) => {
    const r2 = litRand(29);
    frame(g, 'rgb(0,128,0)');
    for (let i = 0; i < 60; i++){ const x = r2() * S, y = r2() * S, r = 20 + r2() * 90, v = 90 + r2() * 110;
      litWrap(S, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(0,${v | 0},0,0.5)`); gr.addColorStop(1, 'rgba(0,128,0,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
    g.fillStyle = 'rgb(0,230,0)'; for (const x of [0, S / 2]) for (let y = 62; y < 170; y += 13) g.fillRect(x + 44, y, S / 2 - 88, 6);
  });
  const height = litCanvas(S, S, (g) => {
    frame(g, 'rgb(128,128,128)');
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, S, 16); g.fillRect(0, S - 30, S, 30);
    g.strokeStyle = 'rgb(36,36,36)'; g.lineWidth = 4;
    for (const x of [0, S / 2]){ g.strokeRect(x + 18, 34, S / 2 - 36, S - 86);
      g.fillStyle = 'rgb(30,30,30)'; for (let y = 62; y < 170; y += 13) g.fillRect(x + 44, y, S / 2 - 88, 6);
      g.fillStyle = 'rgb(150,150,150)'; g.fillRect(x + 44, 250, S / 2 - 88, 150);
      g.strokeStyle = 'rgb(36,36,36)'; g.lineWidth = 3; g.strokeRect(x + 44, 250, S / 2 - 88, 150); g.lineWidth = 4;
      g.fillStyle = 'rgb(230,230,230)'; g.fillRect(x + S / 4 - 22, 318, 44, 9);
      for (const [bx, by2] of [[30, 46], [S / 2 - 30, 46], [30, S - 64], [S / 2 - 30, S - 64]]){ g.beginPath(); g.arc(x + bx, by2, 3.8, 0, 7); g.fill(); }
    }
  });
  return { map: litTexOf(alb, true), roughnessMap: litTexOf(rough, false), normalMap: litNormalFrom(height, 2.4) };
}

/* Switchgear: a row of cabinets. One tile is three doors, 2.4m wide and
   drawn to a 2.2m cabinet. Each door has a meter window, a label plate,
   a handle, louvres at the foot — and three status lamps, which are also
   drawn into a fourth picture, the EMISSIVE one, so they are the only part
   of the cabinet that makes its own light. A hall full of small coloured
   lamps is most of what says "this plant is running". Which lamps are lit
   comes from the seeded generator, so every player sees the same board. */
function litSwitchTextures(){
  const S = 512, D = S / 3, rnd = litRand(41);
  const lamps = [];                                   // [x, y, colour] for both pictures
  for (let d = 0; d < 3; d++) for (let k = 0; k < 3; k++){
    const on = rnd() < 0.72, col = k === 0 ? '#ff3b30' : k === 1 ? '#30e070' : '#ffb020';
    lamps.push([d * D + D * 0.30 + k * 26, 150, on ? col : null]);
  }
  const doors = (g, body, line, hi) => {
    g.fillStyle = body; g.fillRect(0, 0, S, S);
    for (let d = 0; d < 3; d++){ const x = d * D;
      g.fillStyle = line; g.fillRect(x - 1.5, 0, 3, S);                               // the gap between doors
      if (hi){ g.fillStyle = hi; g.fillRect(x + 1.5, 0, 1, S); }
    }
    g.fillStyle = line; g.fillRect(0, 0, S, 14); g.fillRect(0, S - 26, S, 26);        // top rail and plinth
  };
  const alb = litCanvas(S, S, (g) => {
    doors(g, '#5a5d61', 'rgba(8,9,11,0.95)', 'rgba(255,255,255,0.08)');
    litGrime(g, S, 30, rnd);
    for (let d = 0; d < 3; d++){ const x = d * D;
      g.fillStyle = '#0b0d10'; g.fillRect(x + 28, 44, D - 56, 70);                    // meter window
      g.strokeStyle = 'rgba(190,200,214,0.5)'; g.lineWidth = 1.5; g.strokeRect(x + 28, 44, D - 56, 70);
      g.strokeStyle = 'rgba(120,200,220,0.55)'; g.lineWidth = 2;                       // the dial's arc and needle
      g.beginPath(); g.arc(x + D / 2, 118, 44, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
      const a = Math.PI * (1.28 + rnd() * 0.44);
      g.strokeStyle = 'rgba(240,244,250,0.8)'; g.beginPath(); g.moveTo(x + D / 2, 118); g.lineTo(x + D / 2 + Math.cos(a) * 46, 118 + Math.sin(a) * 46); g.stroke();
      g.fillStyle = '#c9ccd1'; g.fillRect(x + 30, 176, D - 60, 20);                   // label plate
      g.fillStyle = '#1a1c20'; g.font = '700 12px Arial, sans-serif'; g.fillText('BAY ' + (d + 1) + '  ·  11 kV', x + 36, 190);
      g.fillStyle = '#0d0f12'; g.fillRect(x + D - 34, 232, 9, 78);                    // handle
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + D - 34, 232, 2, 78);
      for (let y = 400; y < 470; y += 11){ g.fillStyle = '#0a0b0d'; g.fillRect(x + 30, y, D - 60, 5);      // louvres
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 30, y + 5, D - 60, 1); }
      g.fillStyle = '#b9811f'; g.beginPath(); g.moveTo(x + 46, 250); g.lineTo(x + 62, 278); g.lineTo(x + 30, 278); g.closePath(); g.fill();   // a warning triangle
      g.fillStyle = '#14161a'; g.fillRect(x + 44.5, 259, 3, 11); g.fillRect(x + 44.5, 272, 3, 3);
    }
    for (const [x, y, col] of lamps){                                                  // lamp bezels, and the lamp if lit
      g.fillStyle = '#0c0d10'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
      g.fillStyle = col || '#2a2c30'; g.beginPath(); g.arc(x, y, 5.2, 0, 7); g.fill();
    }
    for (let i = 0; i < 300; i++){ const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 16, a = rnd() * 6.28;
      g.strokeStyle = rnd() < 0.5 ? `rgba(220,226,236,${0.03 + rnd() * 0.07})` : `rgba(4,6,9,${0.06 + rnd() * 0.12})`;
      g.lineWidth = 0.6 + rnd() * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  });
  const glow = litCanvas(S, S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (const [x, y, col] of lamps) if (col){
      const gr = g.createRadialGradient(x, y, 0, x, y, 11); gr.addColorStop(0, col); gr.addColorStop(0.45, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - 12, y - 12, 24, 24); }
    for (let d = 0; d < 3; d++){ g.fillStyle = 'rgba(40,110,130,0.55)'; g.fillRect(d * D + 30, 46, D - 60, 66); }   // the meters' own backlight
  });
  const rough = litCanvas(S, S, (g) => {
    doors(g, 'rgb(0,118,0)', 'rgb(0,230,0)', null);
    for (let d = 0; d < 3; d++){ g.fillStyle = 'rgb(0,30,0)'; g.fillRect(d * D + 28, 44, D - 56, 70); }              // glass is smooth
  });
  const height = litCanvas(S, S, (g) => {
    doors(g, 'rgb(132,132,132)', 'rgb(34,34,34)', null);
    for (let d = 0; d < 3; d++){ const x = d * D;
      g.fillStyle = 'rgb(96,96,96)'; g.fillRect(x + 28, 44, D - 56, 70);
      g.fillStyle = 'rgb(224,224,224)'; g.fillRect(x + D - 34, 232, 9, 78);
      g.fillStyle = 'rgb(40,40,40)'; for (let y = 400; y < 470; y += 11) g.fillRect(x + 30, y, D - 60, 5); }
    g.fillStyle = 'rgb(210,210,210)'; for (const [x, y] of lamps){ g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
  });
  return { map: litTexOf(alb, true), emissiveMap: litTexOf(glow, true), roughnessMap: litTexOf(rough, false), normalMap: litNormalFrom(height, 2.2) };
}
/* Yellow and black, at 45 degrees. One tile is 0.8m; it wraps both ways. */
/* The sky: a vertical gradient on a tall thin canvas, stretched round the
   box. The bottom of it is LIT.fogSky, the same colour the fog is set to for
   an outdoor map, so the haze and the horizon are the same colour and there
   is no seam where one stops. The band of cloud is there to stop a clear
   gradient banding on an 8-bit display; the grade's dither finishes the job. */
function litSkyTexture(){
  const c = litCanvas(8, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#8fb4d8');          // overhead
    sky.addColorStop(0.42, '#b9cfe2');
    sky.addColorStop(0.62, '#d4dee6');
    sky.addColorStop(0.78, '#dfe4e7');          // the horizon, = LIT.fogSky
    sky.addColorStop(1.00, '#dfe4e7');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++){               // a little cloud, to break the ramp
      const y = 20 + Math.random() * 150;
      g.fillStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
      g.fillRect(0, y, w, 2 + Math.random() * 9);
    }
  });
  const t = litTexOf(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
/* The site boundary: an embankment of trees, which is what is actually round
   a station of this kind and is the one honest way to make a 10m wall nobody
   questions. Drawn as a silhouette band rather than trees — at the distance
   you ever see it from, a ragged dark edge against the sky is all that
   reads, and anything more detailed is tiling you can count. */
function litTreeTexture(){
  return litCanvas(512, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2e3b2b'); sky.addColorStop(0.55, '#1d2a1d'); sky.addColorStop(1, '#141d14');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const rnd = litRand(7);
    for (let i = 0; i < 150; i++){               // crowns against the top edge
      const x = rnd() * w, r = 10 + rnd() * 30, y = 18 + rnd() * 44;
      g.fillStyle = 'rgba(10,18,10,' + (0.25 + rnd() * 0.5).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 220; i++){               // and foliage noise below
      const x = rnd() * w, y = 30 + rnd() * (h - 30), r = 4 + rnd() * 16;
      g.fillStyle = (rnd() < 0.5 ? 'rgba(52,70,44,' : 'rgba(12,20,12,') + (0.10 + rnd() * 0.25).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#20251f'; g.fillRect(0, h - 26, w, 26);     // the foot of the bank
  });
}
/* Profiled sheet: a flat colour with a ribbed normal and a little streaking.
   `litNormalFrom` turns a height canvas into the normal map, so the ribs cost
   one more canvas and no geometry at all. */
function litCladTextures(base, dirt){
  const S = 256;
  const col = litCanvas(S, S, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rnd = litRand(31);
    for (let x = 0; x < w; x += 16){                       // the shadow in each rib
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 7, 0, 2, h);
    }
    for (let i = 0; i < 70; i++){                          // weather streaks, downward
      const x = rnd() * w, y = rnd() * h, l = 12 + rnd() * 70;
      g.fillStyle = 'rgba(40,46,52,' + (0.02 + rnd() * 0.05 * dirt).toFixed(3) + ')';
      g.fillRect(x, y, 1 + rnd() * 2, l);
    }
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, S - 10, w, 10);   // the dirty bottom edge
  });
  const hgt = litCanvas(S, S, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16){
      const r = g.createLinearGradient(x, 0, x + 16, 0);
      r.addColorStop(0, '#303030'); r.addColorStop(0.45, '#d8d8d8'); r.addColorStop(1, '#303030');
      g.fillStyle = r; g.fillRect(x, 0, 16, h);
    }
  });
  return { map: litTexOf(col, true), normalMap: litNormalFrom(hgt, 1.1) };
}
/* A cooling tower shell. Precast panels in courses, every one of them
   streaked: that staining is most of what makes the thing read as concrete
   a hundred metres tall rather than a grey cone. */
function litTowerTexture(){
  return litCanvas(512, 512, (g, w, h) => {
    g.fillStyle = '#9ea099'; g.fillRect(0, 0, w, h);
    const rnd = litRand(11);
    for (let y = 0; y < h; y += 32){                        // the lift joints
      g.fillStyle = 'rgba(60,62,58,0.30)'; g.fillRect(0, y, w, 2);
      for (let x = (y / 32 % 2) * 24; x < w; x += 48){      // and the panel joints, staggered
        g.fillStyle = 'rgba(60,62,58,0.18)'; g.fillRect(x, y, 1.5, 32); }
    }
    for (let i = 0; i < 260; i++){                          // staining, always downward
      const x = rnd() * w, y = rnd() * h * 0.8, l = 20 + rnd() * 180;
      g.fillStyle = (rnd() < 0.45 ? 'rgba(74,76,68,' : 'rgba(176,178,170,') + (0.03 + rnd() * 0.10).toFixed(3) + ')';
      g.fillRect(x, y, 1 + rnd() * 4, l);
    }
    litGrime(g, w, 90, rnd);
  });
}
/* The stack: white and aviation red, in bands, with the dirt a stack gets. */
function litStackTexture(){
  return litCanvas(64, 512, (g, w, h) => {
    const band = h / 7;
    for (let i = 0; i < 7; i++){
      g.fillStyle = i % 2 ? '#a8392c' : '#d8d8d2';
      g.fillRect(0, h - (i + 1) * band, w, band + 1);
    }
    const rnd = litRand(5);
    for (let i = 0; i < 90; i++){
      const y = rnd() * h;
      g.fillStyle = 'rgba(40,36,34,' + (0.02 + rnd() * 0.07).toFixed(3) + ')';
      g.fillRect(rnd() * w, y, 1 + rnd() * 3, 10 + rnd() * 60);
    }
    g.fillStyle = 'rgba(30,28,26,0.35)'; g.fillRect(0, 0, w, 22);     // soot at the top
  });
}
function litHazardTexture(){
  const S = 128;
  return litTexOf(litCanvas(S, S, (g) => {
    g.fillStyle = '#15161a'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#b9811f';
    for (let x = -S; x < S * 2; x += S / 2){ g.beginPath(); g.moveTo(x, S); g.lineTo(x + S / 4, S); g.lineTo(x + S / 4 + S, 0); g.lineTo(x + S, 0); g.closePath(); g.fill(); }
    const rnd = litRand(5);
    for (let i = 0; i < 90; i++){ g.fillStyle = `rgba(18,19,22,${0.2 + rnd() * 0.45})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 7, 1 + rnd() * 2); }
  }), true);
}

/* What is painted on the floor, as one picture laid over the whole arena.
   The grid of labels is the useful part: a lamp sits at the middle of every
   cell, so "C3" names a pool of light two players can both see. Drawn
   north-up; canvas x is world x and canvas y is world z (flipY off). */
const LIT_MARKS = {};
function litMarksTexture(map){
  if (LIT_MARKS[map.id]) return LIT_MARKS[map.id];
  const a = map.arena, S = a > 50 ? 2048 : 1024, k = S / (2 * a), D = a - 1, L = map.lamps;
  const X = (x) => (x + a) * k, Z = (z) => (z + a) * k;
  const c = litCanvas(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(4,5,7,0.30)'; g.lineWidth = Math.max(1, 0.035 * k);          // slab joints, every 6m
    for (let v = -Math.floor(D / 6) * 6; v <= D; v += 6){
      g.beginPath(); g.moveTo(X(v), Z(-D)); g.lineTo(X(v), Z(D)); g.stroke();
      g.beginPath(); g.moveTo(X(-D), Z(v)); g.lineTo(X(D), Z(v)); g.stroke();
    }
    const m = 2.6;                                                                    // the boundary line
    g.strokeStyle = 'rgba(206,36,58,0.80)'; g.lineWidth = 0.20 * k; g.setLineDash([6 * k, 0.9 * k]);
    g.strokeRect(X(-D + m), Z(-D + m), (2 * D - 2 * m) * k, (2 * D - 2 * m) * k); g.setLineDash([]);
    /* A map's own paint (`paint` in maps.js), laid in an order that reads
       right where things cross: aisles first, then the trench covers that
       cut through them, then the keep-out borders, then lettering on top. */
    const P = map.paint || [], of = (kind) => P.filter(p => p.k === kind);
    const run = (p, fn) => {                    // a straight run as a rectangle: x, z, width, depth in px
      const horiz = Math.abs(p.x1 - p.x0) > Math.abs(p.z1 - p.z0);
      const x = Math.min(p.x0, p.x1) - (horiz ? 0 : p.w / 2), z = Math.min(p.z0, p.z1) - (horiz ? p.w / 2 : 0);
      const w = horiz ? Math.abs(p.x1 - p.x0) : p.w, d = horiz ? p.w : Math.abs(p.z1 - p.z0);
      fn(X(x), Z(z), w * k, d * k, horiz);
    };
    /* An aisle is a yellow bar with its middle cut out and filled green.
       Cutting ALL the middles after ALL the bars is what makes a crossing
       clean: drawn one aisle at a time, each one's edge lines ran straight
       across the other and every junction was a noughts-and-crosses board.
       The green is kept grey and thin on purpose. The crosshair is green,
       and a floor of the same green under it is a floor you cannot aim at. */
    const edge = 0.10 * k;
    for (const p of of('walk')) run(p, (x, z, w, d) => { g.fillStyle = 'rgba(160,124,36,0.56)'; g.fillRect(x, z, w, d); });
    for (const p of of('walk')) run(p, (x, z, w, d, horiz) => {
      const ix = horiz ? x : x + edge, iz = horiz ? z + edge : z, iw = horiz ? w : w - 2 * edge, id = horiz ? d - 2 * edge : d;
      g.clearRect(ix, iz, iw, id); g.fillStyle = 'rgba(44,80,68,0.27)'; g.fillRect(ix, iz, iw, id); });
    for (const p of of('trench')) run(p, (x, z, w, d, horiz) => {
      g.fillStyle = 'rgba(46,50,56,0.94)'; g.fillRect(x, z, w, d);                    // steel covers...
      g.fillStyle = 'rgba(150,160,172,0.30)'; const e = 0.06 * k;                     // ...in a lighter angle frame...
      if (horiz){ g.fillRect(x, z, w, e); g.fillRect(x, z + d - e, w, e); } else { g.fillRect(x, z, e, d); g.fillRect(x + w - e, z, e, d); }
      g.fillStyle = 'rgba(8,9,11,0.80)';                                               // ...one plate a metre
      for (let t = k; t < (horiz ? w : d); t += k){ if (horiz) g.fillRect(x + t, z, 1.5, d); else g.fillRect(x, z + t, w, 1.5); }
      g.fillStyle = 'rgba(190,198,208,0.16)';                                          // and a lifting slot in each
      for (let t = k / 2; t < (horiz ? w : d); t += k){ if (horiz) g.fillRect(x + t - 2, z + d / 2 - 0.09 * k, 4, 0.18 * k); else g.fillRect(x + w / 2 - 0.09 * k, z + t - 2, 0.18 * k, 4); }
    });
    for (const p of of('hatch')){                                                      // a striped border round live plant
      const x0 = X(p.x - p.w / 2), z0 = Z(p.z - p.d / 2), w = p.w * k, d = p.d * k, t = 0.42 * k;
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.rect(x0 + t, z0 + t, w - 2 * t, d - 2 * t); g.clip('evenodd');
      g.fillStyle = 'rgba(16,17,20,0.88)'; g.fillRect(x0, z0, w, d);
      g.fillStyle = 'rgba(196,148,30,0.90)'; const s = 0.4 * k;
      for (let q = -d; q < w + d; q += s * 2){ g.beginPath(); g.moveTo(x0 + q, z0 + d); g.lineTo(x0 + q + s, z0 + d); g.lineTo(x0 + q + s + d, z0); g.lineTo(x0 + q + d, z0); g.closePath(); g.fill(); }
      g.restore();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of of('text')){
      g.font = `700 ${(p.s * k) | 0}px "Arial Narrow", Arial, sans-serif`; g.fillStyle = 'rgba(226,231,238,0.62)';
      g.fillText(p.t, X(p.x), Z(p.z));
    }
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    /* A keep-clear line round ordinary cover. Not round the plant that has a
       striped border of its own, and not round the 'hidden' steps of a
       casing, which would draw four boxes inside each other on the floor. */
    g.strokeStyle = 'rgba(214,220,228,0.30)'; g.lineWidth = 0.07 * k;
    for (const b of map.boxes){ if (b.mat === 'hidden' || b.mat === 'plinth' || b.mat === 'transformer' || b.mat === 'column') continue;
      g.strokeRect(X(b.x - b.w / 2 - 0.5), Z(b.z - b.d / 2 - 0.5), (b.w + 1) * k, (b.d + 1) * k); }
    const rs = map.resupply || { x: 0, z: 0 }, core = map.boxes[0];                   // hazard frame round the resupply core
    if (core){
      const o = core.w / 2 + 1.1, i = core.w / 2 + 0.62;
      g.save(); g.beginPath(); g.rect(X(rs.x - o), Z(rs.z - o), o * 2 * k, o * 2 * k);
      g.rect(X(rs.x - i), Z(rs.z - i), i * 2 * k, i * 2 * k); g.clip('evenodd');
      g.fillStyle = 'rgba(16,17,20,0.9)'; g.fillRect(X(rs.x - o), Z(rs.z - o), o * 2 * k, o * 2 * k);
      g.fillStyle = 'rgba(190,134,34,0.92)'; const w = 0.42 * k, x0 = X(rs.x - o), z0 = Z(rs.z - o), e = o * 2 * k;
      for (let t = -e; t < e * 2; t += w * 2){ g.beginPath(); g.moveTo(x0 + t, z0 + e); g.lineTo(x0 + t + w, z0 + e); g.lineTo(x0 + t + w + e, z0); g.lineTo(x0 + t + e, z0); g.closePath(); g.fill(); }
      g.restore();
    }
    if (L){                                                                           // cell labels
      g.font = `700 ${(2.1 * k) | 0}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let gx = -L.reach; gx <= L.reach; gx++) for (let gz = -L.reach; gz <= L.reach; gz++){
        const lx = gx * L.spacing + L.spacing * 0.30, lz = gz * L.spacing + L.spacing * 0.27;
        if (Math.abs(lx) > D - 4 || Math.abs(lz) > D - 4) continue;
        if (map.boxes.some(b => Math.abs(lx - b.x) < b.w / 2 + 2.6 && Math.abs(lz - b.z) < b.d / 2 + 1.8)) continue;
        g.fillStyle = 'rgba(218,224,232,0.40)';
        g.fillText(String.fromCharCode(65 + gx + L.reach) + (gz + L.reach + 1), X(lx), Z(lz));
        g.fillStyle = 'rgba(206,36,58,0.55)'; g.fillRect(X(lx - 1.9), Z(lz + 1.35), 3.8 * k, 0.10 * k);
      }
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.premultiplyAlpha = true;          // filtered as light, so a paint edge has no dark fringe
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return (LIT_MARKS[map.id] = t);
}

/* ---------------------------------------------------------------------
   4. THE SHADER PATCH
   --------------------------------------------------------------------- */
const LIT_BLANK = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255]), 1, 1, THREE.RGBAFormat);
LIT_BLANK.needsUpdate = true;
/* One set of uniform objects, handed to every lit material: writing a
   value here reaches all of them, which is what lets a rebuilt arena or a
   finished bake update the whole room in one assignment. */
const LITU = {
  uLitTex:   { value: LIT_BLANK }, uLitMarks: { value: null }, uLitArena: { value: 60 },
  uLitGain:  { value: LIT.gain }, uLitAmb: { value: new THREE.Vector3().fromArray(LIT.ambient) },
  uLitShadow:{ value: LIT.shadow },
  uLitBox:   { value: new Float32Array(LIT_NBOX * 4) }, uLitBoxH: { value: new Float32Array(LIT_NBOX) },
  uLitBoxN:  { value: 0 }, uLitCoverN: { value: 0 },
  uLitLampY: { value: 7.6 }, uLitLampS: { value: 24 }, uLitLampK: { value: new THREE.Vector2(2, 2) },
  uLitLampHalf: { value: new THREE.Vector2(3, 1.2) }, uLitLampCol: { value: new THREE.Vector3().fromArray(LIT.lampRefl) },
  uLitWallD: { value: 59 }, uLitWallH: { value: 8 }, uLitDado: { value: LIT.dado },
  uLitStripY:{ value: LIT.stripY }, uLitStripHalf: { value: LIT.stripHalf },
  uLitStripCol:  { value: new THREE.Vector3().fromArray(LIT.stripRefl) },
  uLitStripShow: { value: new THREE.Vector3().fromArray(LIT.stripShow) },
  uLitStripGlow: { value: new THREE.Vector3().fromArray(LIT.stripGlow) },
  uLitRefl:  { value: LIT.refl }, uLitEnvKeep: { value: LIT.envKeep }, uLitAOK: { value: LIT.aoK },
};

const LIT_VERT_PARS = `
#ifdef CX_LIT
  varying vec3 vLitW;
  #ifdef CX_VBAKE
    attribute vec3 cxBake;
    varying vec3 vLitBake; varying vec3 vLitN; varying float vLitAlong;
  #endif
#endif`;
const LIT_VERT_MAIN = `
#ifdef CX_LIT
  vLitW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  #ifdef CX_VBAKE
    vLitBake = cxBake; vLitN = normal;
    vLitAlong = mix( position.x, position.z, step( 0.5, abs( normal.x ) ) );
  #endif
#endif`;

const LIT_FRAG_PARS = `
#ifdef CX_LIT
  varying vec3 vLitW;
  uniform float uLitGain, uLitShadow, uLitWallD, uLitWallH, uLitStripY, uLitStripHalf;
  uniform vec3 uLitAmb, uLitStripCol, uLitStripShow, uLitStripGlow;
  #ifdef CX_VBAKE
    varying vec3 vLitBake; varying vec3 vLitN; varying float vLitAlong;
  #endif
  #ifdef CX_WALL
    uniform float uLitDado;
  #endif
  #ifdef CX_FLOOR
    uniform sampler2D uLitTex; uniform sampler2D uLitMarks; uniform float uLitArena;
    uniform vec4 uLitBox[ CX_NBOX ]; uniform float uLitBoxH[ CX_NBOX ];
    uniform int uLitBoxN; uniform int uLitCoverN;
    uniform float uLitLampY, uLitLampS, uLitRefl, uLitEnvKeep, uLitAOK;
    uniform vec2 uLitLampHalf, uLitLampK; uniform vec3 uLitLampCol;
    /* How much of the sky a point on the floor has lost to the boxes round
       it. For an endless wall of height h at distance d that is
       (1 - d/sqrt(d2+h2))/2; a short box blocks less, in proportion to how
       wide it looks from there. Exact to the pixel, which a lightmap texel
       half a metre across could never be at the foot of a crate. */
    float litBoxAO( vec3 p ) {
      float ao = 1.0;
      for ( int i = 0; i < CX_NBOX; i ++ ) {
        if ( i >= uLitBoxN ) break;
        vec4 b = uLitBox[ i ];
        vec2 q = max( abs( p.xz - b.xy ) - b.zw, 0.0 );
        float d = length( q ), h = uLitBoxH[ i ];
        float occ = 0.5 * ( 1.0 - d / sqrt( d * d + h * h ) );
        /* How wide the box looks from here: its z extent seen from beside
           it in x, its x extent from beside it in z, and a BLEND off the
           corners. Picking one or the other there drew a faint straight
           line across the floor from every corner of every long barrier. */
        float wide = ( q.x + q.y > 0.0 ) ? ( b.w * q.x + b.z * q.y ) / ( q.x + q.y ) : max( b.z, b.w );
        occ *= clamp( 2.0 * wide / ( d + 0.5 ), 0.0, 1.0 );
        ao *= 1.0 - occ * uLitAOK;
      }
      return ao;
    }
    /* Distance along a ray to the first piece of cover, or a very large
       number. The mirror uses it: a lamp hidden behind a crate must not
       show in the floor in front of that crate. */
    float litRayBoxes( vec3 o, vec3 d ) {
      float best = 1.0e9;
      vec3 inv = 1.0 / ( d + vec3( 1.0e-6 ) );
      for ( int i = 0; i < CX_NBOX; i ++ ) {
        if ( i >= uLitCoverN ) break;
        vec4 b = uLitBox[ i ];
        vec3 t0 = ( vec3( b.x - b.z, 0.0, b.y - b.w ) - o ) * inv;
        vec3 t1 = ( vec3( b.x + b.z, uLitBoxH[ i ], b.y + b.w ) - o ) * inv;
        vec3 a = min( t0, t1 ), c = max( t0, t1 );
        float tn = max( max( a.x, a.y ), a.z ), tf = min( min( c.x, c.y ), c.z );
        if ( tn < tf && tn > 0.0 ) best = min( best, tn );
      }
      return best;
    }
    /* The wall strip in the mirror. p/r are the position and ray along the
       axis the wall faces; o/oR along the other. Only the wall the ray
       really meets passes the bounds test, so calling this once per axis
       covers all four walls. */
    float litStripHit( float p, float r, float o, float oR, vec3 P, vec3 R, float rough, float tBox ) {
      if ( abs( r ) < 1.0e-4 ) return 0.0;
      float t = ( sign( r ) * uLitWallD - p ) / r;
      if ( t <= 0.0 || t > tBox || abs( o + oR * t ) > uLitWallD ) return 0.0;
      float blur = 0.035 + rough * rough * t * 0.55;
      float q = abs( P.y + R.y * t - uLitStripY ) - uLitStripHalf;
      return clamp( 0.5 - q / ( 2.0 * blur ), 0.0, min( 1.0, uLitStripHalf / blur ) );
    }
  #endif
#endif`;

/* Albedo: what is painted on the surface, before any light. */
const LIT_FRAG_ALBEDO = `
#ifdef CX_LIT
  float litY = vLitW.y;
  float litAA = fwidth( litY ) + 0.0005;
  #ifdef CX_FLOOR
    vec2 litUv = vLitW.xz / ( 2.0 * uLitArena ) + 0.5;
    vec4 litMk = texture2D( uLitMarks, litUv );                       // premultiplied
    #ifdef USE_ROUGHNESSMAP
      litMk *= 0.55 + 0.45 * smoothstep( 0.30, 0.62, texture2D( roughnessMap, vUv * 2.7 ).g );   // paint wears unevenly
    #endif
    vec3 litPaint = pow( litMk.rgb / max( litMk.a, 0.001 ), vec3( 2.2 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, litPaint, litMk.a );
  #endif
  #ifdef CX_WALL
    /* The scan is a warm tan. Under crimson light that goes salmon, so most
       of its colour is taken out and what is left leans cool: the wall
       keeps its panels and tie holes and stops arguing with the strip. */
    float litWl = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, litWl * vec3( 0.90, 0.97, 1.08 ), 0.78 );
    float litDado = smoothstep( uLitDado - litAA, uLitDado + litAA, litY );
    diffuseColor.rgb *= mix( vec3( 0.30, 0.33, 0.38 ), vec3( 1.0 ), litDado );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.012 ), 1.0 - smoothstep( 0.03, 0.03 + litAA * 2.0, abs( litY - uLitDado ) ) );
    float litOff = abs( litY - uLitStripY );
    diffuseColor.rgb *= mix( 0.16, 1.0, smoothstep( uLitStripHalf + 0.035, uLitStripHalf + 0.045 + litAA, litOff ) );   // the strip's dark channel
    float litGap = smoothstep( 0.12, 0.17, abs( fract( vLitAlong / 9.0 ) - 0.5 ) * 9.0 );                               // a short break every 9m
    totalEmissiveRadiance += uLitStripShow * ( 1.0 - smoothstep( uLitStripHalf - litAA, uLitStripHalf + litAA, litOff ) ) * litGap;
  #endif
  #ifdef CX_CEIL
    /* The roof is the same tan scan as the walls and went olive in the dark
       for the same reason; it gets the same treatment. */
    float litCl = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, litCl * vec3( 0.90, 0.97, 1.08 ), 0.85 );
  #endif
  #if defined( CX_PLAINTOP ) && defined( USE_MAP )
    /* The side art — stencils, vents, the hazard band — makes no sense on a
       lid, where it showed up sideways. A top takes the texture's AVERAGE
       colour instead, read from its smallest mip, so each material's lid
       matches its own paint without a second texture. */
    vec3 litLid = mapTexelToLinear( texture2D( map, vUv, 9.0 ) ).rgb * diffuse;
    diffuseColor.rgb = mix( diffuseColor.rgb, litLid * 0.9, smoothstep( 0.6, 0.9, vLitN.y ) );
  #endif
  #ifdef CX_GREY
    float litGl = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) );                  // poured concrete: the wall's scan, greyed like the wall
    diffuseColor.rgb = mix( diffuseColor.rgb, litGl * vec3( 0.90, 0.97, 1.08 ), 0.80 );
  #endif
  #if defined( CX_COVER ) && ! defined( CX_ROUND )
    /* A bevel's normal sits between two axes, so this is zero on a face
       and rises across the edge: paint rubbed thin where things get knocked.
       Not on anything round, where EVERY normal sits between two axes. */
    float litEdge = 1.0 - max( max( abs( vLitN.x ), abs( vLitN.y ) ), abs( vLitN.z ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.7 + 0.035, smoothstep( 0.03, 0.24, litEdge ) * 0.6 );
  #endif
#endif`;

/* Light: the bake stands in for the ambient term. The room's directional
   key is skipped for these surfaces (see litLightsBegin), but its shadow
   map is still read, so a player's shadow falls on the baked floor. */
const LIT_FRAG_LIGHT = `
#ifdef CX_LIT
  float litSh = 1.0;
  #if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
    litSh = receiveShadow ? getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
  #endif
  vec3 litNw = inverseTransformDirection( geometry.normal, viewMatrix );
  float litAo = 1.0;
  vec3 litE;
  #ifdef CX_FLOOR
    litAo = litBoxAO( vLitW );
    vec3 litT = texture2D( uLitTex, litUv ).rgb * 2.0;                 // square-root packed, 0..4
    litE = litT * litT * mix( 1.0, litAo, 0.55 ) + uLitAmb * litAo;
  #else
    litE = vLitBake + uLitAmb * ( 0.62 + 0.38 * litNw.y );
    #ifdef CX_WALL
      litE *= mix( 0.45, 1.0, smoothstep( 0.0, 1.0, litY ) ) * mix( 0.60, 1.0, smoothstep( 0.0, 1.7, uLitWallH - litY ) );
      litE += uLitStripGlow * exp( - abs( litY - uLitStripY ) * 1.6 );
    #endif
    #ifdef CX_COVER
      litE *= mix( 1.0, mix( 0.46, 1.0, smoothstep( 0.0, 0.85, litY ) ), clamp( 1.0 - abs( vLitN.y ) * 1.5, 0.0, 1.0 ) );
    #endif
  #endif
  irradiance = litE * uLitGain * mix( uLitShadow, 1.0, litSh ) * PI;
#endif`;

/* Reflection. The floor swaps most of the generic room reflection for the
   real fixtures; everything else just stops reflecting a bright room from
   a corner the bake says is dark. */
const LIT_FRAG_SPEC = `
#ifdef CX_LIT
  #ifdef CX_FLOOR
    vec3 litV = normalize( cameraPosition - vLitW );
    vec3 litNr = normalize( vec3( litNw.x * 0.35, 1.0, litNw.z * 0.35 ) );
    vec3 litR = reflect( - litV, litNr );
    /* Mostly one roughness for the whole floor, with a little of the
       photoscan's let through. Used raw, every scratch in the texture
       switched the mirror on and off and a reflected lamp came out as a
       patch of chalk rather than a soft-edged rectangle. */
    float litRough = mix( 0.40, material.specularRoughness, 0.30 );
    float litFres = 0.04 + 0.96 * pow( 1.0 - clamp( dot( litNr, litV ), 0.0, 1.0 ), 5.0 );
    float litGloss = 1.0 - smoothstep( 0.30, 0.95, litRough );
    float litTB = litRayBoxes( vLitW + vec3( 0.0, 0.03, 0.0 ), litR );
    vec3 litRefl = vec3( 0.0 );
    if ( litR.y > 0.003 ) {
      float litT2 = ( uLitLampY - vLitW.y ) / litR.y;
      vec2 litHit = vLitW.xz + litR.xz * litT2;
      vec2 litCell = clamp( floor( litHit / uLitLampS + 0.5 ), - uLitLampK, uLitLampK );
      vec2 litQ = abs( litHit - litCell * uLitLampS ) - uLitLampHalf;
      /* A rough floor smears a reflection TOWARD you far more than across:
         the lower the ray leaves the floor, the longer the streak. So the
         blur is stretched along the ray's own heading by how shallow it is. */
      float litStretch = clamp( 1.0 / max( litR.y, 0.10 ) - 1.0, 0.0, 7.0 ) * 0.55;
      vec2 litBlur = ( 0.12 + litRough * litRough * litT2 * 0.6 ) * ( 1.0 + litStretch * abs( normalize( litR.xz + vec2( 1.0e-5 ) ) ) );
      vec2 litCov = clamp( 0.5 - litQ / ( 2.0 * litBlur ), vec2( 0.0 ), min( vec2( 1.0 ), uLitLampHalf / litBlur ) );
      litRefl += uLitLampCol * litCov.x * litCov.y * step( litT2, litTB );
    }
    litRefl += uLitStripCol * ( litStripHit( vLitW.x, litR.x, vLitW.z, litR.z, vLitW, litR, litRough, litTB )
                              + litStripHit( vLitW.z, litR.z, vLitW.x, litR.x, vLitW, litR, litRough, litTB ) );
    reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * uLitEnvKeep
      + litRefl * litFres * litGloss * uLitRefl * mix( 0.35, 1.0, litAo );
  #else
    reflectedLight.indirectSpecular *= clamp( dot( litE, vec3( 0.3, 0.55, 0.15 ) ) * uLitGain * 0.55, 0.10, 1.0 );
  #endif
#endif`;

/* Three's own light loop, with the directional block fenced off for lit
   surfaces. Done by cutting the chunk at two known lines rather than
   pasting a copy of it here, so the rest stays whatever this Three build
   ships. LIT_OK has already checked both lines are there. */
function litLightsBegin(){
  const c = THREE.ShaderChunk.lights_fragment_begin;
  const a = c.indexOf(LIT_DIR_OPEN), b = c.indexOf(LIT_RECT_OPEN);
  return c.slice(0, a) + '#ifndef CX_LIT\n' + c.slice(a, b) + '#endif\n' + c.slice(b);
}
function litCompile(shader){
  Object.assign(shader.uniforms, LITU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + LIT_VERT_PARS)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + LIT_VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + LIT_FRAG_PARS)
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + LIT_FRAG_ALBEDO)
    .replace('#include <lights_fragment_begin>', litLightsBegin() + '\n' + LIT_FRAG_LIGHT)
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LIT_FRAG_SPEC);
}
/* `kind` is floor | wall | cover | ceil. The defines are part of the
   program's cache key, so each kind compiles once and is shared. */
function litPatch(m, kind, envK){
  m.defines = Object.assign({}, m.defines, { CX_LIT: '', CX_NBOX: LIT_NBOX, ['CX_' + kind.toUpperCase()]: '' });
  if (kind !== 'floor') m.defines.CX_VBAKE = '';
  m.onBeforeCompile = litCompile;
  m.userData.envK = envK;
  /* applyLook pins metalness to 0 on anything without a recorded look, and
     would leave these flat the next time the switch came back on. */
  return lookTag(m, { metalness: m.metalness, roughness: m.roughness }, { metalness: 0, roughness: m.roughness });
}
/* A new material on the SAME textures as an old one: the lit arena never
   downloads a photoscan the flat one already has. */
function litShare(src, extra){
  return new THREE.MeshStandardMaterial(Object.assign(
    { map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap }, extra));
}
const LIT_MATS = {};
function litMaterial(name){
  if (LIT_MATS[name]) return LIT_MATS[name];
  let m, t;
  switch (name){
    case 'crate':  m = litPatch(litShare(arenaMat('crate'), { roughness: 0.92, metalness: 0, color: 0xc9c2b8 }), 'cover', 0.30); break;
    case 'block':  t = litBlockTextures();
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 1, metalness: 0.30 })), 'cover', 0.90);
                   m.defines.CX_PLAINTOP = ''; break;
    case 'pillar': t = litPillarTextures();
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 1, metalness: 0.45 })), 'cover', 1.00);
                   m.defines.CX_PLAINTOP = ''; break;
    case 'wall':   m = litPatch(litShare(arenaMat('wall'), { roughness: 0.96, metalness: 0, color: 0x9aa1aa }), 'wall', 0.20); break;
    case 'fixture':m = litPatch(new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.65 }), 'ceil', 0.70); break;
    case 'lamp':   m = new THREE.MeshBasicMaterial({ color: new THREE.Color().fromArray(LIT.lampShow), fog: false }); break;
    case 'sky':    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.6, 5.4, 6.4), fog: false }); break;   // a skylight: overcast daylight, not a lamp
    /* The power station's plant. `machine` is the block's panelled steel in
       a machinery green with no hazard band and no stencil. */
    case 'machine':t = litBlockTextures({ base: '#4e5650', cap: '#272c29', band: false, seed: 17, text: ['', '', ''] });
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 1, metalness: 0.35 })), 'cover', 0.90);
                   m.defines.CX_PLAINTOP = ''; break;
    /* The same paint on something ROUND. It has to be its own material: on a
       box a normal that sits between two axes means a worn edge, and on a
       cylinder every normal does, so the edge wear striped the whole casing. */
    case 'machineR': t = litMaterial('machine');
                   m = litPatch(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0.35 }), 'cover', 0.90);
                   m.defines.CX_ROUND = ''; break;
    case 'switch': t = litSwitchTextures();
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 1, metalness: 0.40, emissive: 0xffffff, emissiveIntensity: 2.4 })), 'cover', 0.90);
                   m.defines.CX_PLAINTOP = ''; break;
    /* Poured concrete: the wall's own scan, greyed the way the wall is. Its
       texture carries the wall's repeat (12 by 1.2), so a tile of 120 by 8
       metres here comes out at the same ten metres a panel as the walls. */
    case 'concrete': m = litPatch(litShare(arenaMat('wall'), { roughness: 0.95, metalness: 0, color: 0x848a92 }), 'cover', 0.15);
                   m.defines.CX_GREY = ''; break;
    /* Structural steel: the block's riveted plate, darker, no band, a plate a metre. */
    case 'girder': t = litBlockTextures({ base: '#6a6e75', cap: '#3a3d42', band: false, seed: 29, text: ['', '', ''] });
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 1, metalness: 0.25 })), 'cover', 0.80); break;
    case 'hazard': m = litPatch(new THREE.MeshStandardMaterial({ map: litHazardTexture(), roughness: 0.62, metalness: 0.1 }), 'cover', 0.40); break;
    /* Plain paints and metals, for the parts too small to want a texture.
       All round or thin, so none of them takes the edge wear. */
    case 'steel':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0x363b42, roughness: 0.48, metalness: 0.70 }), 'cover', 0.90); m.defines.CX_ROUND = ''; break;
    /* Safety yellow, kept dull. At a brighter value the crane bridge was one
       unbroken bar of pure colour across every view of the hall and nothing
       else in the room could compete with it. */
    case 'yellow': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x584610, roughness: 0.58, metalness: 0.10 }), 'cover', 0.45); m.defines.CX_ROUND = ''; break;
    case 'porcelain': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x33170e, roughness: 0.20, metalness: 0 }), 'cover', 1.20); m.defines.CX_ROUND = ''; break;
    case 'bus':    m = litPatch(new THREE.MeshStandardMaterial({ color: 0x70767e, roughness: 0.38, metalness: 0.85 }), 'cover', 1.00); m.defines.CX_ROUND = ''; break;
    /* The reactor: BRUSHED stainless, not polished. Polished (roughness
       0.17, env at 1.35) made a mirror of a six-metre drum standing under
       a rooflight, and the whole vessel came back as a white silhouette
       with the shape burnt out of it — the same failure the armour had on
       the menu. Rougher, darker and reflecting less, it reads as the heavy
       steel it is and the ribs come back. */
    case 'vessel': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x79828c, roughness: 0.34, metalness: 0.88 }), 'cover', 0.55); m.defines.CX_ROUND = ''; break;
    /* The cable looms over it. Insulation, so matte and not metal at all —
       and the only saturated colour in the room, which is why the eye goes
       to the middle of the hall. */
    case 'loomg': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x1d6e2e, roughness: 0.62, metalness: 0 }), 'cover', 0.25); m.defines.CX_ROUND = ''; break;
    case 'loomr': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x7a1722, roughness: 0.62, metalness: 0 }), 'cover', 0.25); m.defines.CX_ROUND = ''; break;
    /* Control room glazing: dark, smooth and quite reflective, so it reads
       as glass by what it mirrors rather than by anything behind it. */
    case 'glass':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0x0d151c, roughness: 0.08, metalness: 0.42 }), 'cover', 1.60); break;
    /* The sky. Painted, not lit: a vertical gradient from a pale hazy
       horizon to a deeper blue overhead, with the horizon band matching the
       fog colour so the two meet without a seam. */
    case 'skydome': m = new THREE.MeshBasicMaterial({ map: litSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }); break;
    /* The boundary. Nearly matte, barely reflective: a treeline that caught
       the sky the way the concrete does read as a painted backdrop. */
    case 'treeline': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litTreeTexture(), true), roughness: 1, metalness: 0 }), 'wall', 0.06); break;
    /* Profiled metal sheet, which is what every building on a site like this
       is clad in. The ribs are in the normal map rather than the geometry:
       a 48m wall of real ribs is forty thousand triangles for something you
       read as a texture from five metres away. */
    case 'cladding': t = litCladTextures('#a8b2bb', 0.55);
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 0.62, metalness: 0.42 })), 'cover', 0.75);
                   m.defines.CX_PLAINTOP = ''; break;
    case 'roofblue': t = litCladTextures('#2d5f93', 0.75);
                   m = litPatch(new THREE.MeshStandardMaterial(Object.assign(t, { roughness: 0.55, metalness: 0.38 })), 'cover', 0.85);
                   m.defines.CX_PLAINTOP = ''; break;
    /* The cooling tower's shell: weathered precast concrete, streaked down
       the way every one of them is. Round, so it needs CX_ROUND. */
    case 'towerskin': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litTowerTexture(), true), roughness: 0.94, metalness: 0 }), 'wall', 0.10);
                   m.defines.CX_ROUND = ''; break;
    /* The stack, in its aviation bands. */
    case 'stackband': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litStackTexture(), true), roughness: 0.82, metalness: 0.05 }), 'wall', 0.12);
                   m.defines.CX_ROUND = ''; break;
    /* The plume. Painted, not lit, and it takes the fog so it sits in the
       same air as everything else. */
    case 'plume':  m = new THREE.MeshBasicMaterial({ color: 0xf2f6f8, transparent: true, opacity: 0.30,
                       depthWrite: false, side: THREE.DoubleSide }); break;
    default:       m = litPatch(new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 }), 'cover', 0.3);
  }
  return (LIT_MATS[name] = m);
}
const LIT_TILE = { crate: 2.5, block: 4, pillar: 3, machine: 3 };
let LIT_H = 14;                   // the roof of the map being built, for LIT_DRAW

/* ---------------------------------------------------------------------
   4b. THE PLANT — what a box becomes when it is a piece of a power station
   --------------------------------------------------------------------- */
/* A transformer, grown from its collision box so the two cannot differ:
   the tank fills the middle, the radiator banks take the last 0.55m on two
   sides and stop exactly at the box's faces, the lid is the box's top.
   What rises above the lid — the bushings and the conservator — is thin,
   is over head height, and is NOT collision; it is not shaped like cover
   and should not be mistaken for it.
   `face: 'z'` in the map turns the banks to the other pair of sides. A box
   stays a box when its axes are swapped, so that is all a turn has to do. */
function litTransformer(G, b){
  const swap = b.face === 'z';
  const hw = (swap ? b.d : b.w) / 2, hd = (swap ? b.w : b.d) / 2, H = b.h;
  const box = (name, ax, y0, az, bx, y1, bz, o) => swap
    ? litBox(G(name), b.x + az, y0, b.z + ax, b.x + bz, y1, b.z + bx, o)
    : litBox(G(name), b.x + ax, y0, b.z + az, b.x + bx, y1, b.z + bz, o);
  const cyl = (name, ax, ay, az, bx, by, bz, r0, r1, sides, capA, capB) => swap
    ? litCyl(G(name), b.x + az, ay, b.z + ax, b.x + bz, by, b.z + bx, r0, r1, sides, 1, capA, capB)
    : litCyl(G(name), b.x + ax, ay, b.z + az, b.x + bx, by, b.z + bz, r0, r1, sides, 1, capA, capB);
  const tw = hw - 0.55;                                                              // the tank's half-width
  box('steel',   -tw - 0.1, 0, -hd, tw + 0.1, 0.16, hd, { seg: 4 });                 // skid
  box('machine', -tw, 0.16, -hd, tw, H - 0.12, hd, { bevel: 0.03, seg: LIT.coverSeg, tile: 3, noTop: true });
  box('steel',   -tw - 0.06, H - 0.12, -hd, tw + 0.06, H, hd, { seg: 4 });           // lid
  for (const s of [-1, 1]){                                                           // a radiator bank each side
    const xa = s > 0 ? tw + 0.06 : -hw + 0.02, xb = s > 0 ? hw - 0.02 : -tw - 0.06, span = 2 * hd - 0.3;
    const n = Math.max(3, Math.floor(span / 0.2));
    for (let i = 0; i < n; i++){ const z = -hd + 0.15 + span * (i + 0.5) / n;
      box('steel', xa, 0.44, z - 0.025, xb, H - 0.44, z + 0.025, { seg: 9, bottom: true }); }
    const xm = (xa + xb) / 2;                                                        // the headers they hang between
    box('steel', xm - 0.09, H - 0.44, -hd + 0.08, xm + 0.09, H - 0.30, hd - 0.08, { seg: 4, bottom: true });
    box('steel', xm - 0.09, 0.30, -hd + 0.08, xm + 0.09, 0.44, hd - 0.08, { seg: 4, bottom: true });
  }
  for (const k of [-1, 0, 1]){                                                        // three high-voltage bushings
    const x = -tw * 0.45, z = hd * 0.55 * k;
    cyl('steel', x, H, z, x, H + 0.2, z, 0.20, 0.17, 10, false, true);
    cyl('porcelain', x, H + 0.2, z, x, H + 1.25, z, 0.125, 0.08, 10, false, false);
    /* The skirts ("sheds") that make an insulator look like one: each a
       shallow cone, widest at the bottom, getting smaller up the stack. */
    for (let j = 0; j < 6; j++){ const y = H + 0.30 + j * 0.155, r = 0.215 - j * 0.014;
      cyl('porcelain', x, y, z, x, y + 0.05, z, r, r * 0.72, 10, true, true); }
    cyl('steel', x, H + 1.25, z, x, H + 1.40, z, 0.06, 0.06, 8, false, true);
  }
  for (const k of [-1, 0, 1]){                                                        // and three low-voltage, smaller
    const x = tw * 0.52, z = hd * 0.38 * k;
    cyl('porcelain', x, H, z, x, H + 0.5, z, 0.075, 0.05, 8, false, true);
    for (let j = 0; j < 3; j++){ const y = H + 0.10 + j * 0.13, r = 0.125 - j * 0.012;
      cyl('porcelain', x, y, z, x, y + 0.04, z, r, r * 0.72, 8, true, true); }
  }
  const cy = H + 1.02, cl = hd * 0.68;                                                // the conservator, on two posts
  cyl('machineR', tw * 0.03, cy, -cl, tw * 0.03, cy, cl, 0.33, 0.33, 14, true, true);
  for (const s of [-1, 1]) box('steel', tw * 0.03 - 0.04, H, s * hd * 0.5 - 0.04, tw * 0.03 + 0.04, cy - 0.26, s * hd * 0.5 + 0.04, { seg: 4 });
}
/* How each kind of box in a map is drawn. A kind not listed here is a plain
   bevelled box in the material of the same name. */
const LIT_DRAW = {
  hidden(){},                                   // collision only: a prop draws what stands here
  /* Poured concrete with a yellow nosing round the top edge. The nosing is
     the upper 13cm of the SAME footprint in another material, not a strip
     stuck on the face: two faces in one plane flicker. */
  plinth(G, b, x0, z0, x1, z1){
    const n = 0.13;
    litBox(G('concrete'), x0, 0, z0, x1, b.h - n, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8, noTop: true });
    litBox(G('yellow'),   x0, b.h - n, z0, x1, b.h, z1, { seg: 3, noTop: true });
    litBox(G('concrete'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8, noSides: true });
  },
  firewall(G, b, x0, z0, x1, z1){
    litBox(G('hazard'),   x0, 0, z0, x1, 0.4, z1, { seg: 3, tile: 0.8 });
    litBox(G('concrete'), x0, 0.4, z0, x1, b.h, z1, { bevel: LIT.bevel, seg: LIT.coverSeg, tile: 120, tileV: 8 });
  },
  switch(G, b, x0, z0, x1, z1){
    litBox(G('switch'), x0, 0, z0, x1, b.h, z1, { bevel: 0.03, seg: LIT.coverSeg, tile: 2.4, tileV: 2.2 });
  },
  transformer: litTransformer,
  /* Collision and floor-shading only; a prop draws what stands here. The
     difference from `hidden` is that the floor shader is TOLD about these -
     a cooling tower shades the ground round it and hides a whole panel of
     sky, and `hidden` exists to keep a casing step inside its own pedestal
     out of that list. */
  mass(){},
  /* A clad building: profiled sheet, a plinth it stands on, and a parapet.
     The hall's walls are these, with the doors simply left out of the map. */
  cladding(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.9, z1, { seg: 3, tile: 120, tileV: 8, noTop: true });
    litBox(G('cladding'), x0, 0.9, z0, x1, b.h - 0.5, z1, { seg: LIT.coverSeg, tile: 3.2, tileV: 3.2, noTop: true });
    litBox(G('girder'),   x0 - 0.08, b.h - 0.5, z0 - 0.08, x1 + 0.08, b.h, z1 + 0.08, { seg: 3, tile: 2 });
  },
  /* The boiler house: the same sheet, but banded by its floor levels and
     with a frame showing at the corners, which is what stops a 28m box
     reading as a 28m box. */
  boiler(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 1.4, z1, { seg: 3, tile: 120, tileV: 8, noTop: true });
    litBox(G('cladding'), x0, 1.4, z0, x1, b.h - 0.6, z1, { seg: LIT.coverSeg, tile: 3.2, tileV: 3.2, noTop: true });
    for (let y = 7; y < b.h - 2; y += 7)                                   // the floor bands
      litBox(G('girder'), x0 - 0.1, y, z0 - 0.1, x1 + 0.1, y + 0.45, z1 + 0.1, { seg: 4, tile: 2 });
    litBox(G('girder'), x0 - 0.1, b.h - 0.6, z0 - 0.1, x1 + 0.1, b.h, z1 + 0.1, { seg: 4, tile: 2 });
    for (const ex of [-1, 1]) for (const ez of [-1, 1]){                   // corner columns
      const cx = ex > 0 ? x1 : x0, cz = ez > 0 ? z1 : z0;
      litBox(G('girder'), cx - 0.45, 1.4, cz - 0.45, cx + 0.45, b.h, cz + 0.45, { seg: 3, tile: 2, noTop: true });
    }
  },
  /* A workshop or a screen house: clad walls, blue roof. Every low building
     in the photograph has one. */
  shed(G, b, x0, z0, x1, z1){
    litBox(G('cladding'), x0, 0, z0, x1, b.h - 0.45, z1, { seg: LIT.coverSeg, tile: 3.2, tileV: 3.2, noTop: true });
    litBox(G('roofblue'), x0 - 0.35, b.h - 0.45, z0 - 0.35, x1 + 0.35, b.h, z1 + 0.35, { seg: 3, tile: 3.2, tileV: 3.2 });
  },
  /* A switchyard portal leg: four angles and a zigzag of bracing, which is
     all a lattice tower is. Thin enough that the bracing is the shape. */
  lattice(G, b, x0, z0, x1, z1){
    const i = 0.07;
    for (const ex of [-1, 1]) for (const ez of [-1, 1]){
      const cx = ex > 0 ? x1 - i : x0 + i, cz = ez > 0 ? z1 - i : z0 + i;
      litBox(G('girder'), cx - i, 0, cz - i, cx + i, b.h, cz + i, { seg: 2, tile: 2, noTop: true });
    }
    for (let y = 0.5; y < b.h - 0.4; y += 1.6){                            // the bracing, both faces
      for (const ez of [z0 + i, z1 - i])
        litCyl(G('steel'), x0 + i, y, ez, x1 - i, y + 1.6, ez, 0.05, 0.05, 4, 1, false, false);
      for (const ex of [x0 + i, x1 - i])
        litCyl(G('steel'), ex, y, z0 + i, ex, y + 1.6, z1 - i, 0.05, 0.05, 4, 1, false, false);
    }
  },
  /* Switchyard gear: a plinth, a steel frame and three insulator stacks -
     a circuit breaker, more or less, and the thing the yard is full of. */
  gear(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.35, z1, { seg: 2, tile: 120, tileV: 8 });
    /* To b.h, not b.h - 0.5: the cabinet is what stops you, so its top has
       to be the box's top. The insulators above it are thin and round and
       nobody reads them as standing room. */
    /* Filling the box, not inset 0.3m inside it: the inset left a border of
       collision all round each cabinet standing over nothing but the plinth,
       which is the same mistake the columns made. */
    litBox(G('machine'), x0, 0.35, z0, x1, b.h, z1, { bevel: 0.05, seg: LIT.coverSeg, tile: 2 });
    const cx = b.x, cz = b.z;
    for (const o of [-1, 0, 1]){
      const px = cx + o * (b.w / 2 - 0.5);
      litCyl(G('porcelain'), px, b.h, cz, px, b.h + 1.1, cz, 0.13, 0.10, 10, 1, false, true);
      for (let j = 0; j < 5; j++){ const y = b.h + 0.15 + j * 0.26, r = 0.23 - j * 0.015;
        litCyl(G('porcelain'), px, y, cz, px, y + 0.07, cz, r, r * 0.7, 10, 1, true, true); }
    }
  },
  /* The intake house on the quay: concrete, with the screen gates in it. */
  intake(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, b.h, z1, { bevel: LIT.bevel, seg: LIT.coverSeg, tile: 120, tileV: 8 });
    for (let x = x0 + 3; x < x1 - 2; x += 6)                               // gate openings on the water face
      litBox(G('steel'), x, 0.5, z1 - 0.06, x + 3.4, b.h - 0.9, z1 + 0.04, { seg: 3, noTop: true });
    litBox(G('yellow'), x0, b.h, z0, x1, b.h + 0.12, z1, { seg: 3 });      // the handrail kerb
  },
  /* A pipe bridge: a concrete plinth with lagged pipes lying along its
     longer axis. Cover on open ground, and the only cover in the yard. */
  pipe(G, b, x0, z0, x1, z1){
    /* The plinth's top IS the box's top. It used to stop 0.5m short and let
       the pipes make up the difference, which left half a metre of collision
       standing in clear air all along it. */
    /* The pipes' CROWNS are the box's top, and the plinth stops a pipe's
       diameter below. Sat on top of a full-height plinth they stood 0.39m
       proud of their own collision - which is what you would walk through. */
    const alongZ = (z1 - z0) >= (x1 - x0), r = 0.2;
    litBox(G('concrete'), x0, 0, z0, x1, b.h - 2 * r, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8 });
    const n = 3, span = alongZ ? (x1 - x0) : (z1 - z0);
    for (let i = 0; i < n; i++){
      const t = span * (i + 0.5) / n;
      if (alongZ) litCyl(G('bus'), x0 + t, b.h - r, z0, x0 + t, b.h - r, z1, r, r, 10, 2, false, false);
      else        litCyl(G('bus'), x0, b.h - r, z0 + t, x1, b.h - r, z0 + t, r, r, 10, 2, false, false);
    }
  },
  /* The operating floor, the shield deck, the stair treads and the towers
     are all the same thing: a slab of concrete with a yellow nosing round
     the top edge, at different sizes. `plinth` already draws exactly that,
     so they share it rather than each growing a near-copy. */
  deck: null, step: null, tower: null,          // filled in below from plinth
  /* The bioshield: a hazard band at the foot, concrete, a yellow nosing.
     It is ONE DRUM, and it used to be two crossed boxes of the same height.
     Two boxes at the same height each draw their own top, so over the 16x16
     where they overlapped there were two coplanar faces fighting for the
     same depth - 256 square metres of flicker in the middle of the hall,
     which is the thing you stand on to take the resupply. A drum draws one
     top, and `litDrumPrism` makes that top out of disjoint bands for the
     same reason. */
  bioshield(G, b, x0, z0, x1, z1){
    if (!b.r) {       // an old two-box deck: draw it as before rather than nothing
      litBox(G('concrete'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8 });
      return;
    }
    const n = 0.14, N = b.n || 9;
    litDrumPrism(G('hazard'),   b.x, b.z, b.r,        N, 0, 0.45,      { tile: 0.8 });
    litDrumPrism(G('concrete'), b.x, b.z, b.r,        N, 0.45, b.h - n, { tile: 6 });
    litDrumPrism(G('yellow'),   b.x, b.z, b.r,        N, b.h - n, b.h, { tile: 2 });
    litDrumPrism(G('concrete'), b.x, b.z, b.r - 0.02, N, 0, b.h,       { tile: 6, top: true, seg: 3 });
  },
  /* A feedwater tank: a drum on a skirt, with a FLAT top.
     It had a dished top, and a dome is a lie of the other kind: collision
     is a box of one height, so the whole drum stopped you at 6.5m while the
     dome had already sloped away to 5.4 — an invisible wall a metre deep,
     all round the top. The roof is now a 0.18m taper, inside the tolerance,
     and the surface you can see at the top of the tank is the surface you
     stand on. The vent carries on to the roof for the same reason: a pipe
     that stops in mid-air at 7.6m reads as a ledge, and a pipe that runs
     into the roof reads as a pipe. */
  tank(G, b, x0, z0, x1, z1){
    /* `r` from the map, not w/2: the box this draws from is the widest of
       the five that make the drum's collision, and its own half-width is a
       touch under the radius. */
    const R = b.r || b.w / 2, N = b.n || 9, x = b.x, z = b.z, sk = 0.55, body = b.h - 0.18;
    litDrumPrism(G('steel'), x, z, R * 0.88, N, 0, sk, { tile: 2 });                          // skirt
    /* The drum itself is the STAIRCASE its collision boxes make, not a
       cylinder standing in for them - see litDrumSteps. Thirty-six sides
       reads as round from two metres, and it is exactly what stops you. */
    litDrumPrism(G('machine'), x, z, R, N, sk, body, { tile: 2.6 });
    litCyl(G('machineR'), x, body, z, x, b.h, z, R, R * 0.93, 16, 2.4, false, true);         // and its roof, near enough flat
    for (const y of [sk + 0.08, b.h * 0.42, body - 0.26]) litCyl(G('steel'), x, y, z, x, y + 0.16, z, R + 0.05, R + 0.05, 16, 1, false, false);
    litCyl(G('bus'), x, b.h, z, x, LIT_H, z, 0.22, 0.22, 10, 2, false, false);               // the vent, all the way to the roof
  },
  /* The control room and, facing it across the hall, the electrical annexe:
     a concrete base, a band of glazing at standing height so there is a
     lit face looking into the hall, and a parapet. The parapet's top IS
     the box's top, so the roof you can see is the roof you stand on. */
  control(G, b, x0, z0, x1, z1){
    const g0 = 1.15, g1 = 2.95, i = 0.09;
    litBox(G('concrete'), x0, 0, z0, x1, g0, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8, noTop: true });
    litBox(G('glass'),    x0 + i, g0, z0 + i, x1 - i, g1, z1 - i, { seg: 2, noTop: true });
    for (let x = x0 + 2; x < x1 - 0.5; x += 2)                                  // mullions
      litBox(G('steel'), x - 0.07, g0, z0 - 0.02, x + 0.07, g1, z1 + 0.02, { seg: 3, noTop: true });
    for (let z = z0 + 2; z < z1 - 0.5; z += 2)
      litBox(G('steel'), x0 - 0.02, g0, z - 0.07, x1 + 0.02, g1, z + 0.07, { seg: 3, noTop: true });
    litBox(G('concrete'), x0, g1, z0, x1, b.h, z1, { bevel: LIT.bevel, seg: LIT.coverSeg, tile: 120, tileV: 8 });
  },
  /* A column: riveted steel on a concrete foot, the full height of the hall.
     The steel used to be drawn 0.1m inside its box on every side, which left
     a shell of collision standing round thin air — only 100mm of it, but a
     column is something you hug, so it is the 100mm you feel. It fills the
     box now, and the bevel does the softening the inset was there for. */
  column(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.5, z1, { seg: 2, tile: 120, tileV: 8 });
    litBox(G('girder'), x0, 0.5, z0, x1, b.h, z1, { bevel: 0.05, seg: 1.5, tile: 2, noTop: true });
  },
};
LIT_DRAW.deck = LIT_DRAW.step = LIT_DRAW.tower = LIT_DRAW.plinth;

/* What a map's `props` become. None of it is collision — so nothing in here
   may be shaped like a floor. The hall used to have `gallery`, a steel deck
   with handrails drawn along each aisle at 5.7m, and it was the one thing in
   the room that looked walkable and was not. It is gone rather than fixed:
   a walkway you can stand on has to be a box standing on the floor, which is
   a solid mezzanine, and that is what the operating decks are. */
const LIT_PROP = {
  /* A turbine-generator set, lying along x with its generator toward `dir`.
     It is drawn to the map's three 'hidden' steps, and the first cut of it
     was not: a plain cylinder, which is 0.6m narrower than the bottom step
     where it meets the pedestal. You walked into nothing a pace short of
     the casing, and a shot stopped in mid-air beside it.

     So the shape is the one a real casing has, which happens to be the one
     boxes can follow. BELOW the centre line it is a square-sided lower
     casing, exactly as wide as the bottom step. ABOVE it the turbine is a
     half-cylinder of radius 1.7 — the three steps stand inside that arc and
     agree with it to within 0.15m, measured — and the generator is drawn AS
     the three steps, a stepped enclosure, so there it is exact. The split
     between the halves is the bolted flange a turbine has anyway. */
  /* A turbine-generator set, standing on its pedestal on the operating
     floor. `axis: 'z'` lays it down the hall rather than across it, which
     is how units are actually arranged — in a row, with the crane running
     parallel to them — and all a turn costs is swapping which coordinate
     is "along the machine". Everything below is written in that frame:
     `a` runs along the set toward `dir`, `c` across it.

     IT IS DRAWN TO THE MAP'S FOUR 'hidden' STEPS. The casing is a cylinder
     of radius 2.2 about an axis at 5.6m, and the steps are the widths that
     cylinder actually has at their heights: 2.2, 2.0, 1.7, 0.95. Measured,
     the drawn surface and the boxes agree to within 0.09m anywhere you can
     put a crosshair — bar the crown, where 0.2m of casing sits above the
     top step, because a box cannot be round. The generator end is drawn AS
     those steps, so there it is exact. */
  turbine(G, p, D, H){
    const az = p.axis === 'z', s = p.dir || 1, R = 2.2, yAx = 5.6, ped = 4.2;
    const A = (v) => (az ? p.z : p.x) + v * s, C = (v) => (az ? p.x : p.z) + v;
    const BOX = (name, a0, y0, c0, a1, y1, c1, o) => {
      const p0 = Math.min(A(a0), A(a1)), p1 = Math.max(A(a0), A(a1));
      const q0 = Math.min(C(c0), C(c1)), q1 = Math.max(C(c0), C(c1));
      az ? litBox(G(name), q0, y0, p0, q1, y1, p1, o) : litBox(G(name), p0, y0, q0, p1, y1, q1, o);
    };
    const CYL = (name, a0, y0, a1, y1, r0, r1, sides, tile, capA, capB) =>
      az ? litCyl(G(name), C(0), y0, A(a0), C(0), y1, A(a1), r0, r1, sides, tile, capA, capB)
         : litCyl(G(name), A(a0), y0, C(0), A(a1), y1, C(0), r0, r1, sides, tile, capA, capB);
    /* The casing: square-sided below the joint, a half-drum above it. The
       split is the bolted flange a real casing has there anyway. */
    BOX('machine', -10, ped, -R, 1.5, yAx, R, { bevel: 0.03, seg: LIT.coverSeg, tile: 3, noTop: true });
    CYL('machineR', -10, yAx, 1.5, yAx, R, R, 24, 3, true, false);
    for (const f of [-9.9, -6.6, -3.4, -0.2, 1.4])                       // the flanges between the cylinders
      CYL('steel', f - 0.09, yAx, f + 0.09, yAx, R + 0.08, R + 0.08, 24, 1, true, true);
    for (const o of [-1, 1])                                             // and the joint down each side
      BOX('steel', -10, yAx - 0.08, o * R, 1.5, yAx + 0.08, o * (R + 0.08), { seg: 3, bottom: true });
    /* The generator: the map's own steps, stacked rather than nested so no
       face is buried inside another. */
    const gen = { bevel: 0.035, seg: LIT.coverSeg, tile: 3 };
    BOX('machine', 1.5, ped, -2.2, 10, 5.6, 2.2, gen);
    BOX('machine', 1.5, 5.6, -2.0, 10, 6.3, 2.0, gen);
    BOX('machine', 1.5, 6.3, -1.7, 10, 7.0, 1.7, gen);
    BOX('machine', 1.5, 7.0, -0.95, 10, 7.6, 0.95, gen);
    /* Above the top step, and therefore not collision: the steam lines to
       the roof and the generator's output going up into a busduct. */
    for (const o of [-1.1, 1.1]){
      CYL2(G, az, p, s, -7.5, 7.0, o, H, 0.24);
      CYL2(G, az, p, s, -3.0, 7.0, o, H, 0.24);
    }
    BOX('steel', 3.4, 7.6, -0.6, 5.2, 7.9, 0.6, { seg: 4 });             // terminal box
    BOX('bus',   3.7, 7.9, -0.32, 4.9, 10.2, 0.32, { seg: 4, noTop: true });
    const far = (az ? Math.sign(p.x || 1) : Math.sign(p.z || 1)) * D;
    const c0 = Math.min(C(0.6), far), c1 = Math.max(C(0.6), far);
    az ? litBox(G('bus'), c0, 9.7, A(3.7), c1, 10.2, A(4.9), { seg: 6, bottom: true })
       : litBox(G('bus'), A(3.7), 9.7, c0, A(4.9), 10.2, c1, { seg: 6, bottom: true });
  },
  /* The overhead travelling crane every turbine hall has: two runway beams
     down the long walls, a pair of box girders bridging the hall, a trolley,
     and the hook block left hanging. All of it is 4.7m up or more. */
  crane(G, p, D, H){
    /* `x0/x1/z0/z1` bound it to a BUILDING. Without them it is drawn to the
       arena, which is right for a map that is one hall and absurd for one
       where the hall is a shed on a 240m site. */
    const xa = p.x0 != null ? p.x0 : -D, xb = p.x1 != null ? p.x1 : D;
    const za = p.z0 != null ? p.z0 : -D, zb = p.z1 != null ? p.z1 : D;
    const hh = p.h != null ? p.h : H;
    const z = p.z, up = hh - 8, y0 = 5.95 + up, y1 = 6.85 + up, tx = (xa + xb) / 2 + 11;
    for (const s of [-1, 1]){
      litBox(G('steel'),  s > 0 ? xb - 1.3 : xa + 0.5, 5.45 + up, za, s > 0 ? xb - 0.5 : xa + 1.3, 5.83 + up, zb, { seg: 6, bottom: true });
      litBox(G('steel'),  s > 0 ? xb - 1.5 : xa + 0.4, 5.83 + up, z - 1.7, s > 0 ? xb - 0.4 : xa + 1.5, 6.45 + up, z + 1.7, { seg: 4, bottom: true });
      litBox(G('yellow'), xa + 0.5, y0, z + s * 0.9 - 0.25, xb - 0.5, y1, z + s * 0.9 + 0.25, { seg: 6, bottom: true });
    }
    litBox(G('steel'),  tx - 1.3, y1, z - 1.25, tx + 1.3, y1 + 0.38, z + 1.25, { seg: 4, bottom: true });   // trolley
    litBox(G('steel'),  tx - 0.04, 5.15 + up, z - 0.04, tx + 0.04, y1, z + 0.04, { seg: 4, noTop: true });        // rope
    litBox(G('yellow'), tx - 0.28, 4.72 + up, z - 0.2, tx + 0.28, 5.15 + up, z + 0.2, { seg: 2, bottom: true });       // hook block
  },
  /* A cable tray the length of the hall, hung from the roof. */
  /* The roof's open steelwork: a truss across the nave on every column
     line. Two chords and a zigzag of diagonals between them, which is what
     the eye reads as an industrial roof. The diagonals are four-sided
     tubes, because a box here can only lie along an axis. */
  truss(G, p, D, H){
    const cx = p.x != null ? p.x : 0, hh = p.h != null ? p.h : H;
    const za = p.z0 != null ? p.z0 : -D, zb = p.z1 != null ? p.z1 : D;
    const span = p.span || 24, top = hh - 0.35, bot = hh - 2.7, bay = 4;
    for (let z = Math.ceil((za + 2) / 12.5) * 12.5; z <= zb - 2; z += 12.5){
      litBox(G('girder'), cx - span, bot - 0.14, z - 0.11, cx + span, bot + 0.14, z + 0.11, { seg: 6, tile: 2, bottom: true });
      litBox(G('girder'), cx - span, top - 0.14, z - 0.11, cx + span, top + 0.14, z + 0.11, { seg: 6, tile: 2, bottom: true });
      for (let x = cx - span, i = 0; x < cx + span - 0.01; x += bay, i++){
        const a = i % 2 ? top : bot, b = i % 2 ? bot : top;
        litCyl(G('steel'), x, a, z, x + bay, b, z, 0.075, 0.075, 4, 1, false, false);
        litBox(G('steel'), x - 0.05, bot, z - 0.05, x + 0.05, top, z + 0.05, { seg: 4, noTop: true });
      }
    }
  },
  /* THE REACTOR, and the reason the middle of this map is worth crossing.
     A stainless drum on the bioshield deck, ribbed the way a wound vessel
     is, with a flanged lid overhanging it and cable looms sweeping down off
     the lid to the deck.

     WHAT IS COLLISION AND WHAT IS NOT. The drum is: the map carries it as
     two crossed boxes whose union is the octagon this circle is drawn
     inside. Everything above the lid at 7m is not, and cannot be mistaken
     for standing room — it is 4.6m over your head on a deck you are stood
     on. The looms arc from 1.2m above the deck outward and up, so the only
     part of them within reach is over the vessel's own footprint, which is
     already solid.

     NO HANDRAIL round the deck edge, though the photographs all have one.
     A rail is a thing you cannot walk through, and this deck has to be
     climbable from any side — so a drawn rail would be exactly the lie the
     galleries used to tell. The yellow nosing on the deck does that job
     instead, and it is paint. */
  reactor(G, p, D, H){
    const x = p.x || 0, z = p.z || 0, y0 = p.deck || 2.4, R = 3.1, top = 7.0;
    /* The drum is the staircase its boxes make, not a cylinder standing in
       for them: the whole of it is within reach from the deck, so the
       surface you see has to BE the surface that stops you. */
    litDrumPrism(G('vessel'), x, z, R, p.n || 9, y0, top, { tile: 2.2 });
    const steps = litDrumSteps(R, p.n || 9);
    for (const e of steps) for (const sx of [-1, 1]) for (const sz of [-1, 1]){   // ribs, on the staircase corners
      const rx = x + sx * e[0], rz = z + sz * e[1];
      litCyl(G('vessel'), rx, y0 + 0.15, rz, rx, top - 0.15, rz, 0.085, 0.085, 6, 1, false, false);
    }
    for (const y of [y0 + 0.5, (y0 + top) / 2, top - 0.5])          // and its hoops
      litCyl(G('steel'), x, y - 0.07, z, x, y + 0.07, z, R + 0.06, R + 0.06, 16, 1, false, false);
    litCyl(G('steel'),  x, top, z, x, top + 0.22, z, R + 0.18, R + 0.18, 16, 1, false, false);   // the lid's flange...
    litCyl(G('vessel'), x, top + 0.22, z, x, top + 0.80, z, 4.5, 4.3, 16, 2, false, true);       // ...and the lid, overhanging
    for (const o of [-1.75, 1.75]){                                 // the two ports on top of it
      litCyl(G('steel'),  x + o, top + 0.80, z, x + o, top + 0.95, z, 0.62, 0.62, 12, 1, false, false);
      litCyl(G('vessel'), x + o, top + 0.95, z, x + o, top + 2.30, z, 0.52, 0.52, 12, 1.6, false, true);
    }
    /* The looms. Each is a chain of straight segments following a quarter
       sweep from the deck out at 6m radius up to the top of the lid, which
       is the shape a heavy cable bundle actually hangs in. A box cannot lie
       at an angle; a cylinder can, so these are cylinders. */
    for (let i = 0; i < 8; i++){
      const a = i / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const name = i % 2 ? 'loomr' : 'loomg', segs = 7;
      const pt = (t) => { const r = 6.0 + (1.5 - 6.0) * t, y = y0 + 1.2 + (top + 1.9 - y0 - 1.2) * Math.sin(t * Math.PI / 2);
                          return [x + ca * r, y, z + sa * r]; };
      for (let k = 0; k < segs; k++){
        const A0 = pt(k / segs), A1 = pt((k + 1) / segs);
        litCyl(G(name), A0[0], A0[1], A0[2], A1[0], A1[1], A1[2], 0.17, 0.17, 8, 1, k === 0, k === segs - 1);
      }
      /* the bracket that carries it off the deck */
      litCyl(G('steel'), x + ca * 6.0, y0, z + sa * 6.0, x + ca * 6.0, y0 + 1.25, z + sa * 6.0, 0.13, 0.13, 8, 1, false, true);
    }
  },
  /* A NATURAL-DRAUGHT COOLING TOWER, and the biggest single thing on the
     site. Three parts, and the first two are drawn from exactly the profile
     the map's collision boxes were generated from:

       r(y) = rt * sqrt(1 + ((y - yt) / a)^2)

     a hyperboloid of one sheet, which is what the shell of one of these
     actually is - the reason it is that shape is that it can be built from
     straight bars, and the reason it is drawn from the same equation the
     boxes came from is that otherwise the two drift apart and you get an
     invisible wall round the base.

     The BASIN is a ring wall you can climb (2.6m, one climb) and the 2m of
     rim left outside the shell is a walkway all the way round. That rim is
     real floor: the basin's collision drum is wider than the shell's.

     The X-BRACED INLET at the foot is what the air goes through. It is drawn
     and it is not collision, which is the one liberty taken here - but it is
     a diagonal lattice in front of a solid shell, and nobody mistakes a strut
     for a doorway.

     The PLUME is painted, not lit, and takes the fog like everything else. */
  coolingtower(G, p, D, H){
    const x = p.x, z = p.z, y1 = p.y1, rt = p.rt, yt = p.yt, a = p.a;
    const rb = p.basin, bh = p.basinH, rk = p.beam, yk = p.y0, N = p.n || 9;
    const R = (y) => rt * Math.sqrt(1 + ((y - yt) / a) * ((y - yt) / a));
    /* EVERYTHING A PLAYER CAN TOUCH IS DRAWN AS ITS OWN COLLISION BOXES.
       The basin wall and the ring beam are the two staircase drums the map
       carries; thirty-six sides apiece, which from the ground reads as a
       round concrete structure and from the physics is exactly itself.
       Only above the ring beam - 5.6m, and the rim you would stand on is
       2.6m with a 2.7m climb - does it become a smooth hyperboloid, where
       nothing can reach it to find out. */
    litDrumPrism(G('concrete'), x, z, rb, N, 0, bh, { tile: 6, top: true });
    litDrumPrism(G('yellow'),   x, z, rb + 0.05, N, bh, bh + 0.12, { tile: 2 });   // the rim's kerb
    /* `top` because the beam is SOLID: its boxes fill the disc from the
       floor up, so there is a concrete surface at 5.6m whether or not
       anything can reach it, and the basin floor drawn underneath is inside
       the solid and must not be what a ray down the throat finds. */
    litDrumPrism(G('towerskin'), x, z, rk, N, bh, yk, { tile: 6, top: true });     // the ring beam
    /* The shell above: a stack of frusta following the curve. Twelve is
       enough that the silhouette reads as a curve and not a cone. */
    const segs = 12;
    for (let i = 0; i < segs; i++){
      const ya = yk + (y1 - yk) * i / segs, yb = yk + (y1 - yk) * (i + 1) / segs;
      litCyl(G('towerskin'), x, ya, z, x, yb, z, R(ya), R(yb), 28, 6, false, false);
    }
    litCyl(G('concrete'), x, y1, z, x, y1 + 0.5, z, R(y1) + 0.22, R(y1) + 0.22, 28, 3, false, false);  // the cap ring
    /* Buttresses up the ring beam, on the staircase's own corners so they
       sit on the surface rather than hovering off it. */
    for (const e of litDrumSteps(rk, N)) for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const bx = x + sx * e[0], bz = z + sz * e[1];
      litCyl(G('concrete'), bx, bh, bz, bx, yk, bz, 0.3, 0.24, 5, 2, false, false);
    }
    /* The plume, leaning with the wind. Widening, rising, fading. */
    const pl = G('plume'), drift = 0.55;
    for (let i = 0; i < 7; i++){
      const ya = y1 + i * 4.6, yb = ya + 4.6, f = i / 7;
      const ra = R(y1) * (0.92 + f * 1.5), rbb = R(y1) * (0.92 + (f + 0.14) * 1.5);
      litCyl(pl, x + f * drift * 10, ya, z + f * drift * 6,
                 x + (f + 0.14) * drift * 10, yb, z + (f + 0.14) * drift * 6,
                 ra, rbb, 14, 1, false, false);
    }
  },
  /* The stack. Its collision is 68m of boxes, so the drawn surface simply
     follows them: a straight shell in aviation bands, a cap, and the
     platforms a real one carries. No taper, deliberately - a taper would
     have to be matched band for band in the collision and buys nothing you
     can see from the ground. */
  stack(G, p, D, H){
    const x = p.x, z = p.z, r = p.r, h = p.h, N = p.n || 9;
    litDrumPrism(G('stackband'), x, z, r, N, 0, h, { tile: 2, tileV: h / 7 });
    litCyl(G('concrete'), x, 0, z, x, 2.2, z, r + 0.5, r + 0.35, 20, 2, false, false);   // the foot
    for (let y = 12; y < h - 6; y += 13)                                                  // maintenance platforms
      litCyl(G('girder'), x, y, z, x, y + 0.22, z, r + 0.85, r + 0.85, 20, 2, true, true);
    litCyl(G('steel'), x, h, z, x, h + 0.6, z, r + 0.15, r + 0.15, 20, 1, false, false);   // the cap
  },
  /* The busbars: the beam across each row of portals and the conductors
     strung between them. All of it 11m up, and none of it collision - the
     legs that hold it up are. */
  busbars(G, p, D, H){
    const z = p.z, y = 11.4;
    litBox(G('girder'), -D + 4, y, z - 0.32, D - 4, y + 0.7, z + 0.32, { seg: 5, tile: 2, bottom: true });
    for (const o of [-1.4, 0, 1.4])                       // three phases
      litCyl(G('bus'), -D + 4, y - 1.0, z + o * 0.55, D - 4, y - 1.0, z + o * 0.55, 0.11, 0.11, 8, 2, false, false);
    for (let x = -D + 6; x < D - 4; x += 13)              // and the insulators they hang from
      for (const o of [-1.4, 0, 1.4]){
        const px = x, pz = z + o * 0.55;
        for (let j = 0; j < 4; j++){ const yy = y - 0.9 + j * 0.2;
          litCyl(G('porcelain'), px, yy, pz, px, yy + 0.06, pz, 0.17 - j * 0.012, 0.12, 8, 1, true, true); }
      }
  },
  /* The hall's roof, from the outside and from underneath. It is a
     `roofRect`, so it stops a bullet and not a player; what is drawn here is
     the slab, the glazing that explains why the inside is daylit, and the
     steel under it. */
  hallroof(G, p, D, H){
    const { x0, x1, z0, z1, y } = p;
    /* Blue on top, grey decking underneath. One box with `bottom` painted
       the inside of the hall the colour of the outside of the roof, which
       no building has. */
    /* The slab starts 50mm ABOVE the walls, not 10mm inside them. The
       cladding's parapet band tops out at exactly `y`, and an underside
       drawn at y-0.01 put the ceiling a centimetre below it - so every wall
       poked through the roof along its whole length. Nothing here is within
       reach, so the gap is never seen; the overlap was. */
    const ry = y + 0.05;
    litBox(G('roofblue'), x0, ry, z0, x1, ry + 0.55, z1, { seg: 4, tile: 3.2, tileV: 3.2 });
    litGrid(G('cladding'), x0, ry, z0, 1,0,0, 0,0,1, x1 - x0, z1 - z0, 0,-1,0, 4, 4, 3.2, 3.2, x0, z0);
    for (let x = x0 + 8; x < x1 - 6; x += 12){            // rooflight strips, both sides of the slab
      litGrid(G('sky'), x, ry + 0.57, z0 + 3, 1,0,0, 0,0,1, 5, (z1 - z0) - 6, 0,1,0, 99, 99, 1, 1);
      litGrid(G('sky'), x + 5, ry - 0.01, z0 + 3, -1,0,0, 0,0,1, 5, (z1 - z0) - 6, 0,-1,0, 99, 99, 1, 1);
    }
    for (let z = z0 + 6; z < z1 - 4; z += 9)              // the trusses you see from inside
      litBox(G('girder'), x0 + 1, ry - 1.5, z - 0.16, x1 - 1, ry - 1.2, z + 0.16, { seg: 5, tile: 2, bottom: true });
    litBox(G('girder'), x0 - 0.3, ry + 0.55, z0 - 0.3, x1 + 0.3, ry + 0.95, z1 + 0.3, { seg: 4, tile: 2 });
  },
  tray(G, p, D, H){
    const x = p.x, hh = p.h != null ? p.h : H, up = hh - 8;
    const za = p.z0 != null ? p.z0 : -D, zb = p.z1 != null ? p.z1 : D;
    litBox(G('steel'), x - 0.36, 6.92 + up, za, x + 0.36, 6.97 + up, zb, { seg: 6, bottom: true });
    for (const o of [-0.34, 0.34]) litBox(G('steel'), x + o - 0.02, 6.97 + up, za, x + o + 0.02, 7.07 + up, zb, { seg: 6 });
    for (let z = za + 4; z < zb; z += 8) for (const o of [-0.34, 0.34])
      litBox(G('steel'), x + o - 0.015, 7.07 + up, z - 0.015, x + o + 0.015, hh, z + 0.015, { seg: 4, noTop: true });
  },
};

/* ---------------------------------------------------------------------
   5. BUILDING IT
   --------------------------------------------------------------------- */
function litAdd(mesh, baked){
  mesh.userData.lit = true; mesh.castShadow = false; mesh.receiveShadow = true;
  scene.add(mesh); arenaParts.push(mesh);
  if (baked) litMeshes.push(mesh);
  return mesh;
}
function litUniformsFor(map){
  const a = map.arena, L = map.lamps || { spacing: 24, reach: 0, w: 6, d: 2.4 };
  const box = LITU.uLitBox.value, bh = LITU.uLitBoxH.value; box.fill(0); bh.fill(0);
  let n = 0;
  /* Not every box goes to the floor shader, which loops over this list twice
     for every pixel of floor. A column is too thin to shade the floor round
     it or hide a lamp, a casing's hidden steps stand inside a pedestal that
     is already here, and a stair tread is 1.2m of concrete 0.8m tall. With
     all 47 of the old map in, a frame cost three times as much.
     This matters more than it reads: the loop STOPS at the budget, so a map
     over it does not slow down, it quietly drops its last few boxes out of
     the floor's shading. The power station has 107 boxes and offers 60 — the
     treads alone were 24 of them, which would have pushed the real plant off
     the end of the list. Without them it offers 36. */
  const SKIP_FLOOR = { column: 1, hidden: 1, step: 1, lattice: 1 };   // too thin to shade the floor or hide a panel
  /* THE BIGGEST ONES, not the first ones. The loop used to take boxes in map
     order and stop at the budget, so a map that offered more than it could
     hold silently dropped whatever happened to be written last - on the
     station that was the yard's pipe bridges one run and the cooling towers
     the next, depending on nothing but the order of the file. Sorting by
     footprint first makes the choice mean something: a tower shades the
     ground round it and hides a whole panel of sky, a 3m plinth does
     neither, and if something has to go it should be the plinth. */
  const floorBoxes = map.boxes.filter(b => !SKIP_FLOOR[b.mat])
    .sort((p, q) => (q.w * q.d) - (p.w * p.d)).slice(0, LIT_NBOX - 4);
  for (const b of floorBoxes){ box.set([b.x, b.z, b.w / 2, b.d / 2], n * 4); bh[n++] = b.h; }
  LITU.uLitCoverN.value = n;
  /* The perimeter joins the occlusion list (not the mirror's), with its
     height capped: at the full 8m a wall would dim the floor for eight
     metres out from it, which reads as a dirty room rather than a corner. */
  for (const w of mapWallRects(map)){
    box.set([(w.minx + w.maxx) / 2, (w.minz + w.maxz) / 2, (w.maxx - w.minx) / 2, (w.maxz - w.minz) / 2], n * 4); bh[n++] = Math.min(2.6, w.maxy); }
  LITU.uLitBoxN.value = n;
  LITU.uLitArena.value = a; LITU.uLitWallD.value = a - 1; LITU.uLitWallH.value = map.wallH;
  LITU.uLitLampY.value = map.skyY != null ? map.skyY : map.wallH - LIT.lampDrop; LITU.uLitLampS.value = L.spacing; LITU.uLitLampK.value.set(L.reachX != null ? L.reachX : L.reach, L.reach);
  LITU.uLitLampCol.value.fromArray(L.refl || LIT.lampRefl);
  LITU.uLitLampHalf.value.set(L.w / 2, L.d / 2);
  /* A taller hall has more panels in reach of every point, so the same unit
     of light adds up to more. `gain` in the map trims it back. */
  LITU.uLitGain.value = LIT.gain * (map.gain || 1);
  LITU.uLitMarks.value = litMarksTexture(map);
  LITU.uLitTex.value = LIT_BLANK;                      // until this map's bake lands
}

/* `flatFloor` and `flatRoof` are the old arena's floor and ceiling
   materials: their textures already carry this map's tiling. */
function litBuildArena(map, flatFloor, flatRoof){
  litMeshes.length = 0;
  if (!LIT_OK) return;
  const a = map.arena, H = map.wallH, D = a - 1, L = map.lamps;
  LIT_H = H;                      // a box's draw gets no H; the ones that run pipework to the roof need it
  litUniformsFor(map);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [flatFloor.map, flatFloor.normalMap, flatFloor.roughnessMap]) if (t) t.anisotropy = aniso;

  const sky = !!map.sky;
  const fm = litPatch(litShare(flatFloor, { roughness: 0.66, metalness: 0, color: 0xd6d9dc }), 'floor', 1);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(a * 2, a * 2), fm);
  fl.rotation.x = -Math.PI / 2; fl.userData.ownMaterial = true; litAdd(fl, false);

  /* Perimeter: only the faces that look into the room. UVs run 0..1 along
     each wall so the photoscan keeps the tiling its texture already has. */
  let g = litGeo();
  litGrid(g, -D, 0, -D,  1,0,0,  0,1,0, 2*D, H,  0,0,1,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g,  D, 0,  D, -1,0,0,  0,1,0, 2*D, H,  0,0,-1, LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g, -D, 0,  D,  0,0,-1, 0,1,0, 2*D, H,  1,0,0,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g,  D, 0, -D,  0,0,1,  0,1,0, 2*D, H, -1,0,0,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litAdd(new THREE.Mesh(litGeoDone(g), litMaterial(sky ? 'treeline' : 'wall')), true);

  if (!sky){
    g = litGeo();                                                       // roof
    litGrid(g, -D, H, -D,  1,0,0,  0,0,1, 2*D, 2*D,  0,-1,0, LIT.roofSeg, LIT.roofSeg, 2*D, 2*D);
    const roof = new THREE.Mesh(litGeoDone(g), litPatch(litShare(flatRoof, { roughness: 0.97, metalness: 0, color: 0x6a727c }), 'ceil', 0.15));
    roof.userData.ownMaterial = true; litAdd(roof, true);
  } else {
    /* The sky, as a box the site sits inside: a dome would be nicer and is
       not worth the geometry, because the only part of it ever on screen is
       a band above the boundary. Unlit, unfogged, drawn first and never
       written to the depth buffer, so everything else is simply in front of
       it however big the site gets. */
    const sg = new THREE.BoxGeometry(2*a + 40, 150, 2*a + 40);
    const dome = new THREE.Mesh(sg, litMaterial('skydome'));
    dome.position.y = 50; dome.renderOrder = -1; dome.frustumCulled = false;
    dome.userData.ownMaterial = true;
    /* `false`: it is painted, not lit, so the vertex pass must not visit it
       — it has no `cxBake` attribute to write into and the bake dies on it. */
    litAdd(dome, false);
    dome.receiveShadow = false;
  }

  /* Cover and plant. Everything is gathered by MATERIAL, so a whole map is
     one mesh and one draw call per material however many pieces it has.
     `G(name)` is that material's geometry, made the first time it is asked
     for. A box is drawn by its kind (LIT_DRAW), or as a plain bevelled box. */
  const geos = {}, G = (name) => geos[name] || (geos[name] = litGeo());
  for (const b of map.boxes){
    const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2, x1 = b.x + b.w / 2, z1 = b.z + b.d / 2, draw = LIT_DRAW[b.mat];
    if (draw) draw(G, b, x0, z0, x1, z1);
    else litBox(G(b.mat), x0, 0, z0, x1, b.h, z1, { bevel: LIT.bevel, seg: LIT.coverSeg, tile: LIT_TILE[b.mat] || 3 });
  }
  for (const p of (map.props || [])){ const draw = LIT_PROP[p.kind]; if (draw) draw(G, p, D, H); }
  for (const name in geos) litAdd(new THREE.Mesh(litGeoDone(geos[name]), litMaterial(name)), true);

  /* Fixtures. Each panel gets a housing to hang in, and the roof gets a
     grid of girders between the rows of lamps: without structure up there
     a ceiling is a flat lid and the room has no scale. */
  if (L && !sky){
    const fx = litGeo(), em = litGeo(), y0 = H - LIT.lampDrop;
    const rx = L.reachX != null ? L.reachX : L.reach;
    for (let gx = -rx; gx <= rx; gx++) for (let gz = -L.reach; gz <= L.reach; gz++){
      const x = gx * L.spacing, z = gz * L.spacing, w = L.w / 2 + 0.22, d = L.d / 2 + 0.22;
      litBox(fx, x - w, y0, z - d, x + w, H, z + d, { seg: 3, noTop: true, bottom: true });
      litGrid(em, x - L.w / 2, y0 - 0.012, z - L.d / 2,  1,0,0,  0,0,1, L.w, L.d,  0,-1,0, 99, 99, 1, 1);
    }
    for (let k = -L.reach - 1; k <= L.reach; k++){
      const c = (k + 0.5) * L.spacing; if (Math.abs(c) > D - 1) continue;
      litBox(fx, c - 0.24, H - 0.72, -D, c + 0.24, H, D, { seg: 4, noTop: true, bottom: true });     // girders, north-south
      litBox(fx, -D, H - 0.42, c - 0.15, D, H, c + 0.15, { seg: 4, noTop: true, bottom: true });     // purlins, east-west
    }
    litAdd(new THREE.Mesh(litGeoDone(fx), litMaterial('fixture')), true);
    const lampMesh = litAdd(new THREE.Mesh(litGeoDone(em), litMaterial(L.show ? 'sky' : 'lamp')), false);
    lampMesh.receiveShadow = false;
  }
  litBakeStart(map);
}

/* ---------------------------------------------------------------------
   6. THE LOOK SWITCH, AND THE ONE THING THAT RUNS EVERY FRAME
   --------------------------------------------------------------------- */
/* Called from applyLook. In the lit look nothing static casts a shadow —
   the bake has those — so the key's shadow map only has to hold players,
   and can be a tight box round the camera instead of the whole arena:
   the same texture over a quarter of the area. */
function litApplyLook(on){
  const lit = on && LIT_OK, sc = sun.shadow.camera, R = lit ? LIT.shadowHalf : 70;
  if (sc.right !== R){ sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
  litLights();
  /* An outdoor map takes the sky's haze in BOTH looks: with the flat look
     and an indoor fog, the site vanished into a dark grey wall forty metres
     out and the far half of it could not be seen at all. */
  const out = !!(currentMap && currentMap.sky);
  scene.fog.color.setHex(out ? LIT.fogSky : BACKDROP);
  scene.background.setHex(out ? LIT.fogSky : BACKDROP);
  scene.fog.near = out ? LIT.skyFogNear : (lit ? LIT.fogNear : 42);
  scene.fog.far  = out ? LIT.skyFogFar  : (lit ? LIT.fogFar  : 135);
  if (typeof arenaVis === 'function') arenaVis();
}
/* The hemisphere and the key no longer touch the room at all — a lit surface
   skips the directional light and replaces the ambient with the bake — so
   in the arena they light only what MOVES: players, targets, the gun in
   your hand. That lets them be set for those alone. A room lit by panels
   everywhere overhead has no dark side, so the fill is high and the key
   comes almost straight down; with the old slanted key anyone facing away
   from it was a black cut-out.
   At the MENU none of this applies: the operator on the podium was lit and
   graded with the old figures, so those come back whenever the studio does.
   Called on a look change and again on walking in or out of the arena. */
function litLights(){
  const on = !!SETTINGS.look, play = on && LIT_OK && !menuBackdropOn;
  hemi.intensity = play ? LIT.dynFill : (on ? LOOK.hemi : LOOK.flatHemi);
  sun.intensity  = play ? LIT.dynKey  : (on ? LOOK.sun  : LOOK.flatSun);
  hemi.groundColor.setHex(play ? 0x3b3e44 : 0x1b1e24);
  if (!play){ sun.position.set(25, 55, 18); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); }
  /* A panel that is the only thing in the room over white should glow like
     it. The menu and the flat look keep the gentler bloom they were tuned
     with. */
  if (bloomPass){
    const out = !!(currentMap && currentMap.sky && !menuBackdropOn);
    const b = out ? LIT.bloomSky : (play ? LIT.bloom : [0.32, 0.55, 0.82]);
    bloomPass.strength = b[0]; bloomPass.radius = b[1]; bloomPass.threshold = b[2]; }
  /* The outline light on players (models.js): on in the arena only. */
  if (typeof RIMU !== 'undefined'){ if (play) RIMU.uRim.value.fromArray(LIT.rim); else RIMU.uRim.value.set(0, 0, 0); }
}
/* Steep, but not straight down: at 23 degrees off vertical a standing
   figure throws a shadow that reaches most of a metre past their feet,
   which is enough to see one coming round a corner before its owner does.
   Dead overhead, the shadow hides under the body that casts it. */
const _litDir = new THREE.Vector3(20, 55, 13).normalize();
const _litRgt = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), _litDir).normalize();
const _litUp  = new THREE.Vector3().crossVectors(_litDir, _litRgt).normalize();
const _litF   = new THREE.Vector3();
/* Keep the shadow box on the camera. The focus is snapped to whole shadow
   texels in the LIGHT's own frame: move it by fractions of one and every
   shadow edge in view crawls as you walk. */
function litFrame(){
  if (!SETTINGS.look || !LIT_OK || menuBackdropOn) return;
  const texel = LIT.shadowHalf * 2 / ((SETTINGS.shadows | 0) || 1024);
  _litF.set(camera.position.x, 0, camera.position.z);
  const r = Math.round(_litF.dot(_litRgt) / texel) * texel, u = Math.round(_litF.dot(_litUp) / texel) * texel, d = _litF.dot(_litDir);
  _litF.set(0, 0, 0).addScaledVector(_litRgt, r).addScaledVector(_litUp, u).addScaledVector(_litDir, d);
  sun.target.position.copy(_litF); sun.target.updateMatrixWorld();
  sun.position.copy(_litF).addScaledVector(_litDir, 80);
}
