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

const LIT_NBOX = 56;       // cover plus the four perimeter walls: the shader's loops are this long
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
  bloom: [0.62, 0.72, 0.80],       // strength, radius, threshold
  dynFill: 0.62, dynKey: 1.05,     // the two real lights, which only reach moving things in this look
  rim: [0.40, 0.46, 0.56],         // the outline light on players
};

/* ---------------------------------------------------------------------
   1. THE BAKE
   --------------------------------------------------------------------- */

/* Everything the bake needs about one map, in flat typed arrays: this is
   called from the innermost loop a few million times. */
function litContext(map){
  const L = map.lamps || { spacing: 24, reach: 0, w: 6, d: 2.4 };
  const lampY = map.wallH - LIT.lampDrop;
  const lamps = [];
  /* `reachX` lets the grid be narrower than it is long: 0 is a single row
     down the middle of the hall, which is a skylight. */
  const rx = L.reachX != null ? L.reachX : L.reach;
  for (let gx = -rx; gx <= rx; gx++)
    for (let gz = -L.reach; gz <= L.reach; gz++) lamps.push(gx * L.spacing, gz * L.spacing);
  const nb = map.boxes.length, boxes = new Float32Array(nb * 5);
  map.boxes.forEach((b, i) => boxes.set([b.x - b.w/2, b.x + b.w/2, b.z - b.d/2, b.z + b.d/2, b.h], i * 5));
  /* The strip is thin and very long, so it is sampled as a row of points
     along each wall's inner face, each standing for stripStep metres. */
  const D = map.arena - 1, st = LIT.stripStep, strips = [];
  for (let t = -D + st/2; t < D; t += st){
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
           strips: Float32Array.from(strips), nStrips: strips.length / 5,
           stripDA: st * LIT.stripHalf * 2, stripCull2: 17 * 17 };
}

/* Is the straight line from p to s cut by any cover? Slab test per box, with
   a cheap reject first: most boxes are nowhere near most rays. Cover stands
   on the floor, so its y slab is [0, maxy]. */
function litBlocked(c, px, py, pz, sx, sy, sz){
  const B = c.boxes, n = c.nBoxes;
  const dx = sx - px, dy = sy - py, dz = sz - pz;
  for (let i = 0; i < n; i++){
    const o = i * 5, minx = B[o], maxx = B[o+1], minz = B[o+2], maxz = B[o+3], maxy = B[o+4];
    if ((px < minx && sx < minx) || (px > maxx && sx > maxx) ||
        (pz < minz && sz < minz) || (pz > maxz && sz > maxz) || (py > maxy && sy > maxy)) continue;
    let t0 = 0, t1 = 1, a, b, t;
    if (dx !== 0){ a = (minx - px) / dx; b = (maxx - px) / dx; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (dz !== 0){ a = (minz - pz) / dz; b = (maxz - pz) / dz; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (dy !== 0){ a = -py / dy; b = (maxy - py) / dy; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    return true;
  }
  return false;
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
    default:       m = litPatch(new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 }), 'cover', 0.3);
  }
  return (LIT_MATS[name] = m);
}
const LIT_TILE = { crate: 2.5, block: 4, pillar: 3, machine: 3 };

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
  /* A column: riveted steel on a concrete foot, the full height of the hall. */
  column(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.5, z1, { seg: 2, tile: 120, tileV: 8 });
    litBox(G('girder'), x0 + 0.1, 0.5, z0 + 0.1, x1 - 0.1, b.h, z1 - 0.1, { bevel: 0.03, seg: 1.5, tile: 2, noTop: true });
  },
};
/* What a map's `props` become. None of it is collision. */
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
  turbine(G, p, D, H){
    const s = p.dir || 1, y = 2.3, z = p.z, R = 1.7, X = (v) => p.x + v * s;
    const lo = (a, b) => Math.min(X(a), X(b)), hi = (a, b) => Math.max(X(a), X(b));
    const sec = (name, a, b, r, capA, capB) => litCyl(G(name), X(a), y, z, X(b), y, z, r, r, 24, 3, capA, capB);
    litBox(G('machine'), lo(-7.5, 2.5), 1.0, z - R, hi(-7.5, 2.5), y, z + R, { bevel: 0.03, seg: LIT.coverSeg, tile: 3, noTop: true });   // lower casing
    sec('machineR', -7.5, 2.5, R, true, false);                        // the upper halves: low, intermediate, high pressure
    for (const fx of [-7.42, -4.9, -2.5, -0.1, 2.34]) sec('steel', fx - 0.08, fx + 0.08, R + 0.07, true, true);     // the flanges between them
    for (const o of [-1, 1]){                                          // and the joint down each side
      const zf = z + o * R;
      litBox(G('steel'), lo(-7.5, 2.5), y - 0.07, Math.min(zf, zf + o * 0.07), hi(-7.5, 2.5), y + 0.07, Math.max(zf, zf + o * 0.07), { seg: 3, bottom: true });
    }
    /* The generator: the map's steps themselves, stacked rather than nested
       so no face is buried inside another. */
    const g0 = lo(2.5, 7.5), g1 = hi(2.5, 7.5), gen = { bevel: 0.035, seg: LIT.coverSeg, tile: 3 };
    litBox(G('machine'), g0, 1.0, z - 1.7, g1, 3.0, z + 1.7, gen);
    litBox(G('machine'), g0, 3.0, z - 1.3, g1, 3.6, z + 1.3, gen);
    litBox(G('machine'), g0, 3.6, z - 0.8, g1, 4.0, z + 0.8, gen);
    /* Everything from here is above the top step (4.0m) and is not collision:
       steam lines up to the roof, and the generator's output going up into a
       busduct that runs out to the nearest end wall. */
    for (const o of [-0.7, 0.7]){
      litCyl(G('bus'), X(1.2), 3.55, z + o, X(1.2), H, z + o, 0.2, 0.2, 12, 2, false, false);
      litCyl(G('steel'), X(1.2), 5.4, z + o, X(1.2), 5.52, z + o, 0.27, 0.27, 12, 2, true, true);
    }
    const xa = lo(4.3, 5.7), xb = hi(4.3, 5.7), xm = (xa + xb) / 2, far = Math.sign(z || 1) * D;
    litBox(G('steel'), xa, 4.0, z - 0.5, xb, 4.3, z + 0.5, { seg: 4 });                             // terminal box
    litBox(G('bus'), xm - 0.30, 4.3, z - 0.26, xm + 0.30, 6.6, z + 0.26, { seg: 4, noTop: true });  // riser, narrower than the duct so no two faces share a plane
    litBox(G('bus'), xm - 0.34, 6.12, Math.min(z, far), xm + 0.34, 6.6, Math.max(z, far), { seg: 6, bottom: true });
    for (let k = 1; k < 5; k++){ const hz = z + (far - z) * k / 5;                                  // hangers to the roof
      litBox(G('steel'), xm - 0.4, 6.6, hz - 0.03, xm + 0.4, 6.66, hz + 0.03, { seg: 4 });
      for (const o of [-0.38, 0.38]) litBox(G('steel'), xm + o - 0.02, 6.66, hz - 0.02, xm + o + 0.02, H, hz + 0.02, { seg: 4, noTop: true }); }
  },
  /* The overhead travelling crane every turbine hall has: two runway beams
     down the long walls, a pair of box girders bridging the hall, a trolley,
     and the hook block left hanging. All of it is 4.7m up or more. */
  crane(G, p, D, H){
    const z = p.z, up = H - 8, y0 = 5.95 + up, y1 = 6.85 + up, tx = 11;
    for (const s of [-1, 1]){
      litBox(G('steel'),  s > 0 ? D - 1.3 : -D + 0.5, 5.45 + up, -D, s > 0 ? D - 0.5 : -D + 1.3, 5.83 + up, D, { seg: 6, bottom: true });
      litBox(G('steel'),  s > 0 ? D - 1.5 : -D + 0.4, 5.83 + up, z - 1.7, s > 0 ? D - 0.4 : -D + 1.5, 6.45 + up, z + 1.7, { seg: 4, bottom: true });
      litBox(G('yellow'), -D + 0.5, y0, z + s * 0.9 - 0.25, D - 0.5, y1, z + s * 0.9 + 0.25, { seg: 6, bottom: true });
    }
    litBox(G('steel'),  tx - 1.3, y1, z - 1.25, tx + 1.3, y1 + 0.38, z + 1.25, { seg: 4, bottom: true });   // trolley
    litBox(G('steel'),  tx - 0.04, 5.15 + up, z - 0.04, tx + 0.04, y1, z + 0.04, { seg: 4, noTop: true });        // rope
    litBox(G('yellow'), tx - 0.28, 4.72 + up, z - 0.2, tx + 0.28, 5.15 + up, z + 0.2, { seg: 2, bottom: true });       // hook block
  },
  /* A cable tray the length of the hall, hung from the roof. */
  /* The side galleries: a steel deck over each aisle, carried on the column
     row, with a handrail along the open edge. 5.4m up, so out of reach and
     not collision; what holds it up IS (the columns). */
  gallery(G, p, D){
    const s = Math.sign(p.x), xi = p.x - s * 0.9, xo = s * D, x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
    litBox(G('girder'), x0, 5.4, -D, x1, 5.72, D, { seg: 5, tile: 2, bottom: true });
    litBox(G('yellow'), Math.min(xi, xi + s * 0.14), 5.25, -D, Math.max(xi, xi + s * 0.14), 5.72, D, { seg: 6, bottom: true });   // the deck's edge beam
    for (const y of [6.25, 6.8]) litBox(G('yellow'), xi - 0.03, y, -D, xi + 0.03, y + 0.06, D, { seg: 6, bottom: true });   // rails
    for (let z = -D + 1; z < D; z += 2.5) litBox(G('yellow'), xi - 0.03, 5.72, z - 0.03, xi + 0.03, 6.86, z + 0.03, { seg: 4 });   // posts
    for (let z = -D + 6.25; z < D; z += 12.5) litBox(G('girder'), x0, 5.0, z - 0.15, x1, 5.4, z + 0.15, { seg: 5, tile: 2, bottom: true });   // beams under the deck
  },
  /* The roof's open steelwork: a truss across the nave on every column
     line. Two chords and a zigzag of diagonals between them, which is what
     the eye reads as an industrial roof. The diagonals are four-sided
     tubes, because a box here can only lie along an axis. */
  truss(G, p, D, H){
    const span = p.span || 24, top = H - 0.35, bot = H - 2.7, bay = 4;
    for (let z = -Math.floor((D - 2) / 12.5) * 12.5; z <= D - 2; z += 12.5){
      litBox(G('girder'), -span, bot - 0.14, z - 0.11, span, bot + 0.14, z + 0.11, { seg: 6, tile: 2, bottom: true });
      litBox(G('girder'), -span, top - 0.14, z - 0.11, span, top + 0.14, z + 0.11, { seg: 6, tile: 2, bottom: true });
      for (let x = -span, i = 0; x < span - 0.01; x += bay, i++){
        const a = i % 2 ? top : bot, b = i % 2 ? bot : top;
        litCyl(G('steel'), x, a, z, x + bay, b, z, 0.075, 0.075, 4, 1, false, false);
        litBox(G('steel'), x - 0.05, bot, z - 0.05, x + 0.05, top, z + 0.05, { seg: 4, noTop: true });
      }
    }
  },
  tray(G, p, D, H){
    const x = p.x, up = H - 8;
    litBox(G('steel'), x - 0.36, 6.92 + up, -D, x + 0.36, 6.97 + up, D, { seg: 6, bottom: true });
    for (const o of [-0.34, 0.34]) litBox(G('steel'), x + o - 0.02, 6.97 + up, -D, x + o + 0.02, 7.07 + up, D, { seg: 6 });
    for (let z = -D + 4; z < D; z += 8) for (const o of [-0.34, 0.34])
      litBox(G('steel'), x + o - 0.015, 7.07 + up, z - 0.015, x + o + 0.015, H, z + 0.015, { seg: 4, noTop: true });
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
     it or hide a lamp, and a casing's hidden steps stand inside a pedestal
     that is already here. With all 47 in, a frame cost three times as much. */
  for (const b of map.boxes){ if (b.mat === 'column' || b.mat === 'hidden') continue;
    if (n >= LIT_NBOX - 4) break; box.set([b.x, b.z, b.w / 2, b.d / 2], n * 4); bh[n++] = b.h; }
  LITU.uLitCoverN.value = n;
  /* The perimeter joins the occlusion list (not the mirror's), with its
     height capped: at the full 8m a wall would dim the floor for eight
     metres out from it, which reads as a dirty room rather than a corner. */
  for (const w of mapWallRects(map)){
    box.set([(w.minx + w.maxx) / 2, (w.minz + w.maxz) / 2, (w.maxx - w.minx) / 2, (w.maxz - w.minz) / 2], n * 4); bh[n++] = Math.min(2.6, w.maxy); }
  LITU.uLitBoxN.value = n;
  LITU.uLitArena.value = a; LITU.uLitWallD.value = a - 1; LITU.uLitWallH.value = map.wallH;
  LITU.uLitLampY.value = map.wallH - LIT.lampDrop; LITU.uLitLampS.value = L.spacing; LITU.uLitLampK.value.set(L.reachX != null ? L.reachX : L.reach, L.reach);
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
  litUniformsFor(map);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [flatFloor.map, flatFloor.normalMap, flatFloor.roughnessMap]) if (t) t.anisotropy = aniso;

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
  litAdd(new THREE.Mesh(litGeoDone(g), litMaterial('wall')), true);

  g = litGeo();                                                         // roof
  litGrid(g, -D, H, -D,  1,0,0,  0,0,1, 2*D, 2*D,  0,-1,0, LIT.roofSeg, LIT.roofSeg, 2*D, 2*D);
  const roof = new THREE.Mesh(litGeoDone(g), litPatch(litShare(flatRoof, { roughness: 0.97, metalness: 0, color: 0x6a727c }), 'ceil', 0.15));
  roof.userData.ownMaterial = true; litAdd(roof, true);

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
  if (L){
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
  scene.fog.near = lit ? LIT.fogNear : 42; scene.fog.far = lit ? LIT.fogFar : 135;
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
  if (bloomPass){ const b = play ? LIT.bloom : [0.32, 0.55, 0.82];
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
