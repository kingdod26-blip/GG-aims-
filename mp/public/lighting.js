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
  skyFogNear: 18, skyFogFar: 430, fogSky: 0x9da4a8,
  /* The open sky's own exposure and grade (stage 2, 2026-11-15). 1.45 and a
     full warm split were tuned for the dark hall; outdoors they put the mean
     luminance near 0.7 and the saturation near 0.1 - a beige haze. */
  skyExposure: 0.95, skyWarm: 0.35, skySat: 0.85,      // was 1.0 / 0.3 / 1.15 for the clear day
  /* 2026-11-21, after Saltline: the site under an overcast sky, graded the
     way Saltline grades its port - the bake's light down to a little over
     half (a sky that is a lid of cloud, not a summer noon), a touch more
     contrast, and the colour pulled back until a painted thing is muted
     rather than bright. The sky, unlit, stays where it is, which is what
     makes it read as the brightest thing out there. */
  skyGain: 0.55, skyContrast: 0.32,
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
  /* the fittings (litPanelLights): an office ceiling's panels, a hall's
     high-bays, warm white */
  panelL: 3.6, highbayL: 90, worklampL: 60, panelRGB: [1.0, 0.9, 0.76],
  postL: 45, mastL: 70,             // the outdoor lamp posts and floodlight masts (2026-11-23)
  /* eye adaptation: how far exposure may rise indoors, and how fast */
  adaptMax: 1.9, adaptRate: 0.025,
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
  /* Six numbers a box: its footprint, then its base and top. The base is
     what lets an upper floor's slab shade the floor under it without
     standing on that floor (boxY, maps.js). Glass is left out: light goes
     through a window. */
  const occ = map.boxes.filter(b => !MOVE_ONLY[b.mat]).map(b => [b.x - b.w/2, b.x + b.w/2, b.z - b.d/2, b.z + b.d/2, boxY(b), boxY(b) + b.h]);
  /* THE ROOF IS REAL TO THE LIGHT NOW (2026-11-22). Jack: "the lighting
     inside the main building, there isnt any light but the whole building
     is very bright ... mabey its the roof not real ... doesnt block the
     light comming from on top". It was not: the turbine hall's roof is a
     `roofRect` - it stops a bullet and not a player - and the bake only
     knew about boxes, so the hall was baked as open sky and came out lit
     like the yard. The roof's slab is an occluder here, LESS its rooflight
     strips (the same strips hallroof draws), so daylight reaches the hall
     floor only through the glazing you can see. */
  for (const p of (map.props || [])) if (p.kind === 'hallroof'){
    const y0 = p.y + 0.05, y1 = p.y + 0.6, sz0 = p.z0 + 3, sz1 = p.z1 - 3;
    let x = p.x0;
    for (const sx of litRooflights(p)){
      occ.push([x, sx, p.z0, p.z1, y0, y1]);                                   // the slab between two strips
      occ.push([sx, sx + 5, p.z0, sz0, y0, y1], [sx, sx + 5, sz1, p.z1, y0, y1]);   // and at each strip's ends
      x = sx + 5;
    }
    occ.push([x, p.x1, p.z0, p.z1, y0, y1]);
  }
  const nb = occ.length, boxes = new Float32Array(nb * 6);
  occ.forEach((r, i) => boxes.set(r, i * 6));
  const panels = litPanelLights(map);
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
  for (let i = 0; i < nb; i++){ const o = i * 6;
    for (let cx = cellOf(boxes[o]); cx <= cellOf(boxes[o+1]); cx++)
      for (let cz = cellOf(boxes[o+2]); cz <= cellOf(boxes[o+3]); cz++) cellN[cz * gw + cx]++; }
  const cellAt = new Int32Array(gw * gw + 1);
  for (let c = 0; c < gw * gw; c++) cellAt[c + 1] = cellAt[c] + cellN[c];
  const cellBox = new Int32Array(cellAt[gw * gw]), fill = new Int32Array(gw * gw);
  for (let i = 0; i < nb; i++){ const o = i * 6;
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
           panels: Float32Array.from(panels), nPanels: panels.length / 6,
           stripDA: st * LIT.stripHalf * 2, stripCull2: 17 * 17 };
}

/* Is the straight line from p to s cut by any cover? A slab test per box,
   but only against the boxes in the grid cells the ray actually crosses -
   walked with a DDA, which is the same march a software rasteriser does
   along a line. A box's y slab is [miny, maxy]: the floor for most, higher
   for a raised one. */
/* Where hallroof's rooflight strips are: 5m wide, every 12m. */
function litRooflights(p){ const xs = []; for (let x = p.x0 + 8; x < p.x1 - 6; x += 12) xs.push(x); return xs; }
/* Every light fitting as an area light facing down: [x, y, z, half-x,
   half-z, radiance], six numbers each. The office-style panels (the
   `ceilinglights` props) are binned into 4.8m cells - the cell is the
   light, its radiance scaled by how much of it is panel - because hundreds
   of 1.2 x 0.6m lights would be hundreds of shadow rays a point. The
   high-bays are one light each. */
function litPanelLights(map){
  const out = [], CELL = 4.8;
  for (const p of (map.props || [])){
    if (p.kind === 'ceilinglights'){
      p.levels.forEach((y, li) => {
        const holes = p.holes.concat(p.extra[li] || []), cells = new Map();
        for (let x = p.x0 + 1.2; x + 0.6 <= p.x1 - 0.6; x += 2.4)
          for (let z = p.z0 + 1.2; z + 0.3 <= p.z1 - 0.6; z += 2.4){
            const a0 = x - 0.6, a1 = x + 0.6, b0 = z - 0.3, b1 = z + 0.3;
            if (holes.some(h => a1 > h[0] - 0.3 && a0 < h[1] + 0.3 && b1 > h[2] - 0.3 && b0 < h[3] + 0.3)) continue;
            const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
            const c = cells.get(k) || [1e9, -1e9, 1e9, -1e9, 0];
            c[0] = Math.min(c[0], a0); c[1] = Math.max(c[1], a1); c[2] = Math.min(c[2], b0); c[3] = Math.max(c[3], b1); c[4]++;
            cells.set(k, c);
          }
        for (const c of cells.values()){
          const hx = (c[1] - c[0]) / 2, hz = (c[3] - c[2]) / 2, cover = c[4] * 0.72 / (4 * hx * hz);
          out.push((c[0] + c[1]) / 2, y - 0.01, (c[2] + c[3]) / 2, hx, hz, LIT.panelL * cover);
        }
      });
    } else if (p.kind === 'boiler'){
      /* the work lamp on its stand inside each furnace (litBoiler draws it) */
      const d = p.door, ix0 = p.x0 + p.t, ix1 = p.x1 - p.t, lx = d.face === 'E' ? ix1 - 1.4 : ix0 + 1.4, lz = (d.a0 + d.a1) / 2 - 2.6;
      out.push(lx, 2.74, lz, 0.25, 0.1, LIT.worklampL);
    } else if (p.kind === 'highbay'){
      for (const [x, z] of litHighbays(p)) out.push(x, p.y - 0.4, z, 0.3, 0.3, LIT.highbayL);
    }
  }
  /* Lights in the world (2026-11-23, the Saltline list): every lamp post's
     lantern and every floodlight mast's head lights the ground round it. */
  for (const b of map.boxes){
    if (b.mat === 'lamppost') out.push(b.x, b.h + 0.05, b.z, 0.22, 0.22, LIT.postL);
    else if (b.mat === 'mast') out.push(b.x, b.h - 0.3, b.z, 0.95, 0.18, LIT.mastL);
  }
  return out;
}
function litHighbays(p){ const o = []; for (let x = p.x0; x <= p.x1 + 0.01; x += p.step) for (let z = p.z0; z <= p.z1 + 0.01; z += p.step) o.push([x, z]); return o; }
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
    const o = i * 6, minx = B[o], maxx = B[o+1], minz = B[o+2], maxz = B[o+3], miny = B[o+4], maxy = B[o+5];
    if ((px < minx && sx < minx) || (px > maxx && sx > maxx) ||
        (pz < minz && sz < minz) || (pz > maxz && sz > maxz) ||
        (py > maxy && py + dy > maxy) || (py < miny && py + dy < miny)) return false;
    let t0 = 0, t1 = 1, a, b, t;
    if (dx !== 0){ a = (minx - px) / dx; b = (maxx - px) / dx; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
    if (dz !== 0){ a = (minz - pz) / dz; b = (maxz - pz) / dz; if (a > b){ t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
    if (dy !== 0){ a = (miny - py) / dy; b = (maxy - py) / dy; if (a > b){ t = a; a = b; b = t; }
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
  /* THE LIGHT FITTINGS (2026-11-22). Every ceiling panel and high-bay lamp
     in the interiors was drawn and lit nothing: an office was a ceiling of
     glowing panels over a floor lit only by its windows. They are area
     lights now, facing down, gathered into cells (litPanelLights). */
  const Pn = c.panels, np = c.nPanels, PR = LIT.panelRGB;
  for (let l = 0; l < np; l++){
    const o = l * 6, lx = Pn[o], ly2 = Pn[o+1], lz = Pn[o+2], phx = Pn[o+3], phz = Pn[o+4], L = Pn[o+5];
    const vyp = ly2 - oy; if (vyp < 0.05) continue;
    const ddx = lx - ox, ddz = lz - oz, hd2 = ddx*ddx + ddz*ddz; if (hd2 > 400) continue;
    const n2 = (seed && hd2 < 64) ? 2 : 1;
    let acc = 0;
    for (let a = 0; a < n2; a++) for (let q = 0; q < n2; q++){
      let fu = 0.5, fv = 0.5;
      if (seed){ seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; fu = seed / 4294967296;
                 seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; fv = seed / 4294967296; }
      const sx = lx + (((a + fu) / n2) * 2 - 1) * phx, sz = lz + (((q + fv) / n2) * 2 - 1) * phz;
      const vx = sx - ox, vz = sz - oz, cs = nx*vx + ny*vyp + nz*vz; if (cs <= 0) continue;
      const r2 = vx*vx + vyp*vyp + vz*vz;
      if (litBlocked(c, ox, oy, oz, sx, ly2 - 0.03, sz)) continue;
      acc += cs * vyp / (r2 * r2);
    }
    const w = acc * (4 * phx * phz) / (n2 * n2) * L;
    r += w * PR[0]; g += w * PR[1]; b += w * PR[2];
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
    for (let q = 0; ok && q < nb; q++){ const o = q * 6;
      if (B[o+4] < 0.05 && x > B[o] && x < B[o+1] && z > B[o+2] && z < B[o+3]) ok = false; }   // under a crate (one ON the floor: a slab overhead is a ceiling, not a crate)
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
/* ROUND THINGS UNDER AN OPEN SKY ARE LIT IN RINGS. The sky is baked as a
   grid of 26m panels, so each vertex of a tall shell sits a different
   distance from its nearest panel and the bake comes out as a patchwork -
   blue-grey blotches in the tower's own mesh grid. Under an even overcast
   sky a drum is lit the same all the way round at any height, so for these
   kinds the bake is averaged per 1m band (and per facing: up, side, down). */
const LIT_RING_BAKE = { towerskin: true, stackband: true };
function litRingBake(mesh){
  const g = mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.cxBake.array;
  const key = (v) => Math.round(P[v+1]) * 3 + (N[v+1] > 0.7 ? 2 : N[v+1] < -0.7 ? 0 : 1);
  const sum = new Map();
  for (let v = 0; v < P.length; v += 3){ const k = key(v), a = sum.get(k) || [0, 0, 0, 0];
    a[0] += C[v]; a[1] += C[v+1]; a[2] += C[v+2]; a[3]++; sum.set(k, a); }
  for (let v = 0; v < P.length; v += 3){ const a = sum.get(key(v)); C[v] = a[0] / a[3]; C[v+1] = a[1] / a[3]; C[v+2] = a[2] / a[3]; }
}
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
  if (mesh.userData.bakeRings) litRingBake(mesh);
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
/* A flat ring (annulus) facing up (sgn 1) or down (-1), N segments. */
function litAnnulus(g, cx, y, cz, r0, r1, N, sgn){
  const base = g.p.length / 3;
  for (let i = 0; i <= N; i++){ const a = i / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    g.p.push(cx + r0 * c, y, cz + r0 * s, cx + r1 * c, y, cz + r1 * s); g.n.push(0, sgn, 0, 0, sgn, 0);
    g.uv.push(r0 * c / 2, r0 * s / 2, r1 * c / 2, r1 * s / 2); }
  /* (inner_a, outer_a, inner_b) winds DOWN, so it is swapped for up */
  for (let i = 0; i < N; i++){ const q = base + i * 2;
    if (sgn > 0) g.i.push(q, q + 2, q + 1,  q + 1, q + 2, q + 3); else g.i.push(q, q + 1, q + 2,  q + 1, q + 3, q + 2); }
}
/* litCyl seen from INSIDE: the same tube, normals and winding turned round. */
function litCylIn(g, ax, ay, az, bx, by, bz, r0, r1, sides, tile){
  const v0 = g.p.length / 3, i0 = g.i.length;
  litCyl(g, ax, ay, az, bx, by, bz, r0, r1, sides, tile, false, false);
  for (let v = v0; v < g.p.length / 3; v++){ g.n[v*3] *= -1; g.n[v*3+1] *= -1; g.n[v*3+2] *= -1; }
  for (let k = i0; k < g.i.length; k += 3){ const t = g.i[k + 1]; g.i[k + 1] = g.i[k + 2]; g.i[k + 2] = t; }
}
/* A ring of tube: N straight pieces round a circle, skipping any piece
   whose middle is within `gap` metres (along the arc) of angle `gapA`. */
function litRingTube(g, cx, y, cz, r, rr, N, gapA, gap){
  for (let i = 0; i < N; i++){
    const a = (i + 0.5) / N * Math.PI * 2;
    if (gap && Math.abs(Math.atan2(Math.sin(a - gapA), Math.cos(a - gapA))) * r < gap) continue;
    const b0 = i / N * Math.PI * 2, b1 = (i + 1) / N * Math.PI * 2;
    litCyl(g, cx + r * Math.cos(b0), y, cz + r * Math.sin(b0), cx + r * Math.cos(b1), y, cz + r * Math.sin(b1), rr, rr, 5, 1, false, false);
  }
}
/* Part of a tube about a vertical axis, from angle a0 to a1 (radians,
   a0 < a1), radius ra at ya to rb at yb; facing out, or in. */
function litCylArc(g, x, z, ya, yb, ra, rb, sides, tile, a0, a1, inward){
  const n = Math.max(2, Math.ceil(sides * (a1 - a0) / (Math.PI * 2))), base = g.p.length / 3, len = Math.hypot(rb - ra, yb - ya);
  for (let i = 0; i <= n; i++){
    const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a), sg = inward ? -1 : 1;
    g.p.push(x + ra * c, ya, z + ra * s, x + rb * c, yb, z + rb * s);
    g.n.push(c * sg, 0, s * sg, c * sg, 0, s * sg);
    const u = a * (ra + rb) / 2 / tile; g.uv.push(u, 0, u, len / tile);
  }
  for (let i = 0; i < n; i++){ const q = base + i * 2;
    if (!inward) g.i.push(q, q + 1, q + 2,  q + 2, q + 1, q + 3); else g.i.push(q, q + 2, q + 1,  q + 2, q + 3, q + 1); }
}
/* THE BOILERS (2026-11-22): a furnace you can walk into. Outside: the
   aluminium-lagged casing in panels, a buckstay - a steel band - round it
   every 3m, the burners on the front (south) wall in three rows, the steam
   drum across the top on its saddles, four downcomers down the corners,
   risers from the roof to the drum, the lagged main steam leads going off
   south, soot blowers, inspection ports, a nameplate. Inside: the water
   walls (tubes), the burner throats glowing on the front wall, the ash
   hopper floor, the superheater platens hanging from the roof, a work lamp.
   The walls and roof are the map's `boilerwall` boxes; this draws them. */
function litBoilerTexture(){
  return litCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#2a2d30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8){                      // tubes: a dark gap, a rounded highlight
      const gr = g.createLinearGradient(x, 0, x + 8, 0);
      gr.addColorStop(0, '#111315'); gr.addColorStop(0.45, '#5a5f63'); gr.addColorStop(0.7, '#3a3e41'); gr.addColorStop(1, '#111315');
      g.fillStyle = gr; g.fillRect(x, 0, 8, h);
    }
    const r = litRand(5);
    for (let i = 0; i < 90; i++){ g.fillStyle = r() < 0.5 ? 'rgba(120,60,30,0.18)' : 'rgba(10,8,6,0.25)'; g.fillRect(r() * w, r() * h, 2 + r() * 14, 10 + r() * 60); }
  });
}
function litBoiler(G, p){
  const { x0, x1, z0, z1, h, t, rt } = p, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = p.door;
  const lag = G('lagging'), stl = G('girder');
  /* outer casing, face by face, the door's face in three pieces */
  const face = (fx, fz, ux, uz, nx, nz, L, cut) => {
    if (!cut){ litGrid(lag, fx, 0, fz, ux, 0, uz, 0, 1, 0, L, h - 0.02, nx, 0, nz, 3, 3, 1.5, 1.5); return; }
    const [c0, c1, ch] = cut;                              // along-face span of the door, and its height
    litGrid(lag, fx, 0, fz, ux, 0, uz, 0, 1, 0, c0, h - 0.02, nx, 0, nz, 3, 3, 1.5, 1.5);
    litGrid(lag, fx + ux * c1, 0, fz + uz * c1, ux, 0, uz, 0, 1, 0, L - c1, h - 0.02, nx, 0, nz, 3, 3, 1.5, 1.5);
    litGrid(lag, fx + ux * c0, ch, fz + uz * c0, ux, 0, uz, 0, 1, 0, c1 - c0, h - 0.02 - ch, nx, 0, nz, 3, 3, 1.5, 1.5);
  };
  /* winding: u x up must be the face's normal */
  face(x0, z1, 1, 0, 0, 1, x1 - x0, null);                                            // south (front)
  face(x1, z0, -1, 0, 0, -1, x1 - x0, null);                                          // north
  face(x0, z0, 0, 1, -1, 0, z1 - z0, d.face === 'W' ? [d.a0 - z0, d.a1 - z0, d.y1] : null);   // west
  face(x1, z1, 0, -1, 1, 0, z1 - z0, d.face === 'E' ? [z1 - d.a1, z1 - d.a0, d.y1] : null);   // east
  litGrid(lag, x0, h, z0, 0, 0, 1, 1, 0, 0, z1 - z0, x1 - x0, 0, 1, 0, 3, 3, 2, 2);  // the roof
  /* the door: a steel frame round the opening, and the opened hatch folded back */
  { const fx = d.face === 'E' ? x1 : x0, sg = d.face === 'E' ? 1 : -1;
    litBox(stl, fx - 0.08, 0, d.a0 - 0.12, fx + 0.08, d.y1 + 0.12, d.a0, { seg: 2, tile: 1 });
    litBox(stl, fx - 0.08, 0, d.a1, fx + 0.08, d.y1 + 0.12, d.a1 + 0.12, { seg: 2, tile: 1 });
    litBox(stl, fx - 0.08, d.y1, d.a0 - 0.12, fx + 0.08, d.y1 + 0.12, d.a1 + 0.12, { seg: 2, tile: 1 });
    litBox(G('steel'), fx + sg * 0.05, 0.05, d.a1 + 0.12, fx + sg * 0.1, d.y1, d.a1 + 0.12 + (d.a1 - d.a0), { seg: 2, tile: 1 }); }
  /* buckstays: a steel band round the casing every 3m, standing proud */
  for (let y = 3; y < h - 0.5; y += 3){
    const yb = y + 0.35, o = 0.18;
    litBox(stl, x0 - o, y, z1, x1 + o, yb, z1 + o, { seg: 4, tile: 2 });
    litBox(stl, x0 - o, y, z0 - o, x1 + o, yb, z0, { seg: 4, tile: 2 });
    if (!(d.face === 'W' && y < d.y1 + 0.5)) litBox(stl, x0 - o, y, z0, x0, yb, z1, { seg: 4, tile: 2 });
    if (!(d.face === 'E' && y < d.y1 + 0.5)) litBox(stl, x1, y, z0, x1 + o, yb, z1, { seg: 4, tile: 2 });
  }
  /* burners on the front wall: three rows of three, each a windbox register
     ringed in steel with a sight glass glowing */
  for (const y of [4.5, 7.0, 9.5]) for (const f of [0.22, 0.5, 0.78]){
    const bx = x0 + (x1 - x0) * f;
    litCyl(G('steel'), bx, y, z1, bx, y, z1 + 0.55, 0.62, 0.62, 18, 1, false, true);
    litCyl(G('girder'), bx, y, z1 + 0.55, bx, y, z1 + 0.75, 0.42, 0.36, 14, 1, false, true);
    litCyl(G('glow'), bx + 0.2, y + 0.2, z1 + 0.75, bx + 0.2, y + 0.2, z1 + 0.78, 0.06, 0.06, 8, 1, false, true);
    litCyl(G('lagging'), bx - 0.5, y + 0.6, z1 + 0.3, bx - 0.5, h - 2, z1 + 0.3, 0.12, 0.12, 8, 1, false, false);   // its air/fuel pipe
  }
  /* inspection ports and soot blowers up the sides */
  for (let y = 5; y < h - 3; y += 4) for (const z of [z0 + 3, z1 - 3]){
    litCyl(G('steel'), x0, y, z, x0 - 0.5, y, z, 0.12, 0.12, 8, 1, false, true);
    litCyl(G('steel'), x1, y + 1.5, z, x1 + 0.9, y + 1.5, z, 0.08, 0.08, 6, 1, false, true);
  }
  /* the steam drum across the top, on saddles, with domed ends; risers up
     to it from the roof, and the downcomers down the four corners */
  const dy = h + 1.6, dr = 0.95;
  litCyl(G('lagging'), x0 + 0.6, dy, cz, x1 - 0.6, dy, cz, dr, dr, 20, 2, false, false);
  for (const ex of [x0 + 0.6, x1 - 0.6]){ const sg = ex < cx ? -1 : 1;
    litCyl(G('lagging'), ex, dy, cz, ex + sg * 0.45, dy, cz, dr, 0.35, 20, 1, false, true); }
  for (const f of [0.25, 0.75]) litBox(stl, x0 + (x1 - x0) * f - 0.3, h, cz - 0.9, x0 + (x1 - x0) * f + 0.3, dy - 0.6, cz + 0.9, { seg: 2, tile: 1 });
  for (let k = 0; k < 6; k++){ const rx = x0 + 1.2 + k * (x1 - x0 - 2.4) / 5;
    litCyl(G('steel'), rx, h, cz - 1.6, rx, dy - 0.3, cz - 0.6, 0.12, 0.12, 8, 1, false, false);
    litCyl(G('steel'), rx, h, cz + 1.6, rx, dy - 0.3, cz + 0.6, 0.12, 0.12, 8, 1, false, false); }
  for (const [qx, qz] of [[x0 - 0.5, z0 - 0.5], [x1 + 0.5, z0 - 0.5], [x0 - 0.5, z1 + 0.5], [x1 + 0.5, z1 + 0.5]]){
    litCyl(G('lagging'), qx, 0.4, qz, qx, dy - 0.2, qz, 0.32, 0.32, 14, 2, false, false);
    litCyl(G('steel'), qx, dy - 0.2, qz, qx + (cx - qx) * 0.25, dy, qz + (cz - qz) * 0.25, 0.3, 0.3, 12, 1, false, false);
    litCyl(G('girder'), qx, 0, qz, qx, 0.4, qz, 0.5, 0.5, 14, 1, false, true);           // the lower header's foot
  }
  /* the main steam leads: two lagged pipes off the drum, south over the
     galleries toward the pipe bridges */
  for (const sg of [-1, 1]){ const px = cx + sg * 2.2;
    litCyl(G('lagging'), px, dy, cz + 0.6, px, dy, z1 + 4.5, 0.38, 0.38, 14, 2, false, false);
    litCyl(G('lagging'), px, dy - 0.38, z1 + 4.5, px, 10.4, z1 + 4.5, 0.38, 0.38, 14, 2, false, true); }
  /* a nameplate */
  litGrid(G('steel'), cx - 1.2, 3.0, z1 + 0.01, 1, 0, 0, 0, 1, 0, 2.4, 0.5, 0, 0, 1, 1, 1, 1, 1);
  /* INSIDE: the water walls, the hopper, the throats, the platens */
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t, ih = h - rt, tw = G('tubewall');
  litGrid(tw, ix1, 0, iz1, -1, 0, 0, 0, 1, 0, ix1 - ix0, ih, 0, 0, -1, 3, 3, 2, 2);   // front wall, inside
  litGrid(tw, ix0, 0, iz0, 1, 0, 0, 0, 1, 0, ix1 - ix0, ih, 0, 0, 1, 3, 3, 2, 2);     // back wall
  const sideIn = (fx, fz, uz, nx, cut) => {
    const L = iz1 - iz0;
    if (!cut){ litGrid(tw, fx, 0, fz, 0, 0, uz, 0, 1, 0, L, ih, nx, 0, 0, 3, 3, 2, 2); return; }
    const [c0, c1, ch] = cut;
    litGrid(tw, fx, 0, fz, 0, 0, uz, 0, 1, 0, c0, ih, nx, 0, 0, 3, 3, 2, 2);
    litGrid(tw, fx, 0, fz + uz * c1, 0, 0, uz, 0, 1, 0, L - c1, ih, nx, 0, 0, 3, 3, 2, 2);
    litGrid(tw, fx, ch, fz + uz * c0, 0, 0, uz, 0, 1, 0, c1 - c0, ih - ch, nx, 0, 0, 3, 3, 2, 2);
  };
  sideIn(ix0, iz1, -1, 1, d.face === 'W' ? [iz1 - d.a1, iz1 - d.a0, d.y1] : null);
  sideIn(ix1, iz0, 1, -1, d.face === 'E' ? [d.a0 - iz0, d.a1 - iz0, d.y1] : null);
  litGrid(tw, ix0, ih, iz0, 1, 0, 0, 0, 0, 1, ix1 - ix0, iz1 - iz0, 0, -1, 0, 3, 3, 2, 2);   // the roof, from below
  /* the door's reveals through the casing */
  { const fx0 = d.face === 'E' ? ix1 : x0, fx1 = d.face === 'E' ? x1 : ix0;
    for (const zz of [d.a0, d.a1]) litBox(G('girder'), fx0, 0, zz - 0.01, fx1, d.y1, zz + 0.01, { seg: 1, tile: 1 });
    litBox(G('girder'), fx0, d.y1 - 0.01, d.a0, fx1, d.y1 + 0.01, d.a1, { seg: 1, tile: 1 }); }
  /* the hopper floor: ash and clinker, sloping sides at the foot of the walls */
  litBox(G('rubble'), ix0, 0, iz0, ix1, 0.04, iz1, { seg: 3, tile: 2 });
  litBox(G('girder'), ix0, 0, iz0, ix1, 0.9, iz0 + 0.5, { seg: 3, tile: 2 });
  litBox(G('girder'), ix0, 0, iz1 - 0.5, ix1, 0.9, iz1, { seg: 3, tile: 2 });
  /* the burner throats, from the inside: dark refractory rings, glowing */
  for (const y of [4.5, 7.0, 9.5]) for (const f of [0.22, 0.5, 0.78]){
    const bx = x0 + (x1 - x0) * f;
    litCyl(G('rubble'), bx, y, iz1, bx, y, iz1 - 0.25, 0.65, 0.5, 16, 1, false, false);
    litCylIn(G('rubble'), bx, y, iz1, bx, y, iz1 - 0.25, 0.42, 0.42, 16, 1);
    litCyl(G('glow'), bx, y, iz1 - 0.02, bx, y, iz1 - 0.03, 0.42, 0.42, 16, 1, false, true);
  }
  /* superheater platens hanging under the roof */
  for (let k = 1; k < 9; k++){ const px = ix0 + (ix1 - ix0) * k / 9;
    litBox(G('steel'), px - 0.06, ih - 7, iz0 + 1.5, px + 0.06, ih, iz1 - 1.5, { seg: 3, tile: 2, bottom: true }); }
  /* a temporary work lamp on a stand, as there is in any furnace on outage */
  { const lx = (d.face === 'E' ? ix1 - 1.4 : ix0 + 1.4), lz = (d.a0 + d.a1) / 2 - 2.6;
    litCyl(G('steel'), lx, 0, lz, lx, 2.4, lz, 0.03, 0.03, 6, 1, false, true);
    litBox(G('lamp'), lx - 0.25, 2.4, lz - 0.1, lx + 0.25, 2.75, lz + 0.1, { seg: 1, tile: 1 }); }
}
/* THE TOP OF A COOLING TOWER (2026-11-22). Jack: "make the full top of the
   tower and not just a little platform, just make it like how the top of a
   real cooling tower would look like". What is up there on a real
   natural-draught shell:
   - the shell's own thickness, which you see the moment you look over the
     edge, and its INSIDE face, bare concrete running down into the throat;
   - the stiffening ring at the lip (the existing cap ring: the cornice);
   - an inspection gallery all the way round: galvanised grating on the lip,
     cantilevered both sides on brackets, toe boards, and a two-rail yellow
     railing on each edge, with a gate where the caged ladder arrives;
   - steady red aviation obstruction lights on the rim, and lightning rods
     tied into down-conductors that run down the outside of the shell;
   - and 28m down the throat, the cooling deck: drift eliminators across
     the whole shell, the hot-water distribution headers on them, a ring
     main and the riser that feeds them.
   The deck and rails are the map's `ringdeck` / `ringrail` boxes; this
   draws them at the same radii (p.rim). */
function litTowerTop(G, p, R){
  const x = p.x, z = p.z, y1 = p.y1, rim = p.rim, Rt = R(y1), yk = p.y0;
  const shell = 0.25, yd = rim.y, r0 = Rt - rim.half, r1 = Rt + rim.half, N = 72;
  const segs = 12;
  for (let i = 0; i < segs; i++){
    const ya = yk + (y1 - yk) * i / segs, yb = yk + (y1 - yk) * (i + 1) / segs;
    if (i === 0 && p.door){
      const hw = p.door.half / R(ya), a0 = p.door.a - hw, a1 = p.door.a + hw;
      litCylArc(G('towerin'), x, z, ya, yb, R(ya) - shell, R(yb) - shell, 28, 6, a1, a0 + Math.PI * 2, true);
      /* the doorway's reveals and its head: the shell's thickness, seen */
      for (const a of [a0, a1]){ const c = Math.cos(a), sn = Math.sin(a), sg = a === a0 ? 1 : -1;
        const P0 = [x + (R(ya) - shell) * c, ya, z + (R(ya) - shell) * sn], P1 = [x + R(ya) * c, ya, z + R(ya) * sn];
        const P2 = [x + R(yb) * c, yb, z + R(yb) * sn], P3 = [x + (R(yb) - shell) * c, yb, z + (R(yb) - shell) * sn];
        const n = [-sn * sg, 0, c * sg];
        litTri(G('concrete'), P0, n, P1, n, P2, n, 0, 0); litTri(G('concrete'), P0, n, P2, n, P3, n, 0, 0); }
      { const am = p.door.a, rr = R(yb) - shell / 2;
        litBox(G('concrete'), x + rr * Math.cos(am) - shell / 2, yb - 0.05, z + rr * Math.sin(am) - p.door.half, x + rr * Math.cos(am) + shell / 2, yb, z + rr * Math.sin(am) + p.door.half, { seg: 2, tile: 2 }); }
      continue;
    }
    litCylIn(G('towerin'), x, ya, z, x, yb, z, R(ya) - shell, R(yb) - shell, 28, 6);
  }
  litCylIn(G('concrete'), x, y1, z, x, yd - 0.2, z, Rt - shell, Rt - shell, 28, 3);
  /* the gallery: grating on top, its underside, toe boards on both edges */
  litAnnulus(G('galv'), x, yd, z, r0, r1, N, 1);
  litAnnulus(G('galv'), x, yd - 0.2, z, r0, r1, N, -1);
  litCyl(G('galv'), x, yd - 0.2, z, x, yd + 0.12, z, r1, r1, N, 1, false, false);
  litCylIn(G('galv'), x, yd - 0.2, z, x, yd + 0.12, z, r0, r0, N, 1);
  litCyl(G('galv'), x, yd, z, x, yd + 0.12, z, r0 + 0.02, r0 + 0.02, N, 1, false, false);
  litCylIn(G('galv'), x, yd, z, x, yd + 0.12, z, r1 - 0.02, r1 - 0.02, N, 1);
  /* brackets under the cantilevers, every 10 degrees, in and out */
  for (let k = 0; k < 36; k++){
    const a = k / 36 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), yb = yd - 0.2;
    for (const [ro, ri] of [[r1 - 0.05, Rt + 0.22], [r0 + 0.05, Rt - shell]])
      litCyl(G('girder'), x + ro * c, yb, z + ro * s, x + ri * c, yb - 0.9, z + ri * s, 0.04, 0.04, 4, 1, false, false);
  }
  /* the railings: posts every ~1.5m, a top rail and a knee rail, both
     edges; the outer one opens for the ladder */
  for (const [r, gap] of [[r0 + 0.06, 0], [r1 - 0.06, rim.gate]]){
    for (const h of [rim.rail, rim.rail * 0.5]) litRingTube(G('yellow'), x, yd + h, z, r, 0.025, 64, rim.gateA, gap);
    const n = Math.ceil(2 * Math.PI * r / 1.5);
    for (let k = 0; k < n; k++){
      const a = k / n * Math.PI * 2;
      if (gap && Math.abs(Math.atan2(Math.sin(a - rim.gateA), Math.cos(a - rim.gateA))) * r < gap + 0.1) continue;
      litCyl(G('yellow'), x + r * Math.cos(a), yd, z + r * Math.sin(a), x + r * Math.cos(a), yd + rim.rail, z + r * Math.sin(a), 0.022, 0.022, 5, 1, false, false);
    }
    if (gap) for (const sg of [-1, 1]){
      const a = rim.gateA + sg * (gap + 0.04) / r;
      litCyl(G('yellow'), x + r * Math.cos(a), yd, z + r * Math.sin(a), x + r * Math.cos(a), yd + rim.rail + 0.05, z + r * Math.sin(a), 0.03, 0.03, 6, 1, false, true);
    }
  }
  /* aviation lights (4) and lightning rods (8) on the outer rail */
  for (let k = 0; k < 8; k++){
    const a = rim.gateA + Math.PI / 8 + k / 8 * Math.PI * 2, r = r1 - 0.06, px = x + r * Math.cos(a), pz = z + r * Math.sin(a);
    litCyl(G('steel'), px, yd + rim.rail, pz, px, yd + rim.rail + 2.0, pz, 0.018, 0.008, 5, 1, false, true);
    if (k % 2 === 0){
      litBox(G('girder'), px - 0.12, yd + rim.rail, pz - 0.12, px + 0.12, yd + rim.rail + 0.18, pz + 0.12, { seg: 1, tile: 1 });
      litCyl(G('redlamp'), px, yd + rim.rail + 0.18, pz, px, yd + rim.rail + 0.42, pz, 0.1, 0.08, 10, 1, false, true);
    }
  }
  /* down-conductors: tapes down the outside of the shell either side of the ladder */
  for (const sg of [-1, 1]){
    const a = rim.gateA + sg * 0.35, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 12; i++){
      const ya = yk + (y1 - yk) * i / 12, yb = yk + (y1 - yk) * (i + 1) / 12, ra = R(ya) + 0.04, rb = R(yb) + 0.04;
      litCyl(G('steel'), x + ra * c, ya, z + ra * s, x + rb * c, yb, z + rb * s, 0.02, 0.02, 4, 1, false, false);
    }
  }
  /* down the throat: the cooling deck on the ring beam's top */
  const rd = R(yk) - shell - 0.05;
  litAnnulus(G('girder'), x, yk + 0.06, z, 0.0, rd, 48, 1);
  for (let k = 0; k < 24; k++){
    const a = k / 24 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    litCyl(G('lagging'), x + 1.6 * c, yk + 0.45, z + 1.6 * s, x + (rd - 0.4) * c, yk + 0.45, z + (rd - 0.4) * s, 0.16, 0.16, 8, 2, false, true);
  }
  litRingTube(G('lagging'), x, yk + 0.45, z, rd * 0.55, 0.22, 36);
  litCyl(G('lagging'), x, yk, z, x, yk + 2.6, z, 1.5, 1.5, 20, 3, false, true);
}
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
  /* Painted for a SPHERE (canvas top = zenith, middle = horizon, bottom =
     nadir). It was a clear blue day with a painted line of hills; it is now
     an overcast afternoon (2026-11-21, after Saltline), which is also what
     the bake has always lit the site as: an even, high, grey sky. A low
     warm break in the cloud sits where the sun is (EDGE.sun), and the
     horizon is LIT.fogSky, so the haze, the far world and the sky meet with
     no seam. The hills are geometry now (litFarWorld), not paint. */
  const c = litCanvas(1024, 512, (g, w, h) => {
    const H = h * 0.5;
    const sky = g.createLinearGradient(0, 0, 0, H);
    /* An overcast sky is brightest straight up and about a third of that
       at the horizon (the CIE overcast sky) - the opposite of a clear one.
       Darker masses of cloud give it structure; the haze at the horizon is
       a grey-blue, which is what the far world fades into. */
    sky.addColorStop(0.00, '#c3c8cb');          // zenith
    sky.addColorStop(0.45, '#b1b7bb');
    sky.addColorStop(0.80, '#a3aaae');
    sky.addColorStop(1.00, '#9da4a8');          // the horizon, = LIT.fogSky
    g.fillStyle = sky; g.fillRect(0, 0, w, H);
    g.fillStyle = '#9da4a8'; g.fillRect(0, H, w, H);
    /* Where the sun is, in this canvas: SphereGeometry puts azimuth phi at
       x = -cos(phi), z = sin(phi), and phi runs with the canvas's x. */
    const sd = EDGE.sun, su = (Math.atan2(sd[2], -sd[0]) / (Math.PI * 2) + 1) % 1, sx = su * w;
    const rnd = litRand(31);
    /* The cloud deck: big soft blobs, darker and lighter, flattened harder
       toward the horizon where a layer is seen edge-on. Drawn three times
       across the seam so it wraps. */
    const blob = (x, y, r, flat, rgba) => {
      for (const xx of [x, x - w, x + w]){
        const gr = g.createRadialGradient(xx, y, 0, xx, y, r);
        gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
        g.save(); g.translate(xx, y); g.scale(1, flat); g.translate(-xx, -y);
        g.fillStyle = gr; g.fillRect(xx - r, y - r, r * 2, r * 2); g.restore();
      }
    };
    for (let k = 0; k < 260; k++){
      const y = H * (0.04 + Math.pow(rnd(), 0.8) * 0.9), flat = 0.25 + 0.5 * (1 - y / H), r = 30 + rnd() * 90 * (1.2 - y / H);
      const dark = rnd() < 0.55;
      blob(rnd() * w, y, r, flat, dark ? 'rgba(92,100,110,' + (0.10 + rnd() * 0.18).toFixed(3) + ')' : 'rgba(214,218,221,' + (0.08 + rnd() * 0.12).toFixed(3) + ')');
    }
    /* The break: warm light low in the sky, brightest just over the
       horizon, with the cloud edges above it lit from below. */
    blob(sx, H * 0.90, 120, 0.28, 'rgba(226,196,160,0.30)');
    blob(sx, H * 0.94, 60, 0.30, 'rgba(250,226,196,0.40)');
    for (let k = 0; k < 18; k++){
      const x = sx + (rnd() - 0.5) * 220, y = H * (0.74 + rnd() * 0.16), fall = Math.exp(-Math.pow((x - sx) / 100, 2));
      blob(x, y, 14 + rnd() * 30, 0.2, 'rgba(232,204,170,' + (0.16 * fall).toFixed(3) + ')');
    }
    /* A low band of haze over the horizon all round, so the far world's
       tops go soft into it. */
    const band = g.createLinearGradient(0, H * 0.82, 0, H);
    band.addColorStop(0, 'rgba(157,164,168,0)'); band.addColorStop(1, 'rgba(157,164,168,0.85)');
    g.fillStyle = band; g.fillRect(0, H * 0.82, w, H * 0.18);
  });
  const t = litTexOf(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
/* ---------------------------------------------------------------------
   THE EDGE OF THE WORLD (2026-11-21)
   Jack, after playing Saltline: "the graphic and how it took cared of the
   boarders are good". What Saltline does at its edge is refuse to have
   one. The level stops at a fence, and past the fence the world keeps
   going - cranes, ships, a town, masts with red lights - each thing a
   little paler than the one in front of it until it is the colour of the
   sky. You never see where it ends because the haze takes it first.

   Here: the treeline wall is gone. The site is closed by what really
   closes a power station - a precast concrete wall with a steel palisade
   on it - and over the fence are fields and tree belts, the station's own
   power lines marching away on lattice pylons, a town, a neighbouring
   works with two banded chimneys, and hills. All of it is cheap: one
   unlit mesh with its shading baked into vertex colours, one set of
   lines for the conductors, and the fog does the rest.

   The collision wall is still 11m (the server's, maps.js). Only its lower
   6.2m is drawn; above that it is air you cannot pass, as it always was.
   --------------------------------------------------------------------- */
const EDGE = {
  wallH: 3.6, coping: 0.16, pierEvery: 6.0,      // precast panels between piers
  fenceTop: 6.2,                                  // palisade from the coping to here
  /* The sun the far world is shaded by: low in the south-west, the same
     direction the key light now comes from (_litDir) and the sky's warm
     break is painted at. */
  sun: [-0.55, 0.42, 0.72],
};
/* A palisade panel: D-section pales with the triple-pointed head, on two
   rails. Alpha-tested, so it is cut out rather than blended and needs no
   sorting. One texture tile is 1.2m wide, five pales. */
function litPalisadeTexture(){
  return litCanvas(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const pale = w / 5;
    for (let i = 0; i < 5; i++){
      const x = i * pale + pale * 0.22, pw = pale * 0.56, top = 40;
      const gr = g.createLinearGradient(x, 0, x + pw, 0);
      gr.addColorStop(0, '#5c646b'); gr.addColorStop(0.45, '#8d969d'); gr.addColorStop(1, '#4a5157');
      g.fillStyle = gr;
      g.fillRect(x, top, pw, h - top);
      g.beginPath();                                  // the triple point
      g.moveTo(x, top); g.lineTo(x + pw * 0.17, top - 26); g.lineTo(x + pw * 0.33, top - 6);
      g.lineTo(x + pw * 0.5, top - 38); g.lineTo(x + pw * 0.67, top - 6); g.lineTo(x + pw * 0.83, top - 26);
      g.lineTo(x + pw, top); g.closePath(); g.fill();
      g.fillStyle = 'rgba(60,40,28,0.35)';            // rust bleeding from the bolt heads
      g.fillRect(x + pw * 0.3, 112, pw * 0.4, 30); g.fillRect(x + pw * 0.3, 420, pw * 0.4, 30);
    }
    g.fillStyle = '#4c5359';                          // the two rails
    g.fillRect(0, 100, w, 18); g.fillRect(0, 410, w, 18);
  });
}
/* One palisade material for every fence (the boundary's and the
   switchyard's): alpha-tested, both sides, lit only by the moving-things
   lights (the bake cannot know which texels are holes). Cached. */
let LIT_PALISADE_MAT = null;
function litPalisadeMat(){
  if (LIT_PALISADE_MAT) return LIT_PALISADE_MAT;
  const fm = new THREE.MeshStandardMaterial({ map: litTexOf(litPalisadeTexture(), true), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.35 });
  lookTag(fm, { metalness: 0.35, roughness: 0.6 }, { metalness: 0, roughness: 0.6 });
  fm.userData.envK = 0.5;
  return (LIT_PALISADE_MAT = fm);
}
/* The wall, the piers, the coping and the fence, round all four sides.
   Inner faces only on the concrete (that is all you can stand in front
   of), but the coping and the outside are there for anyone on a roof. */
function litBoundary(D){
  const E = EDGE, g = litGeo(), H = E.wallH, T = 0.25;
  const sides = [  // origin, along, inward normal
    { o: [-D, -D], u: [1, 0],  n: [0, 1] },
    { o: [ D,  D], u: [-1, 0], n: [0, -1] },
    { o: [-D,  D], u: [0, -1], n: [1, 0] },
    { o: [ D, -D], u: [0, 1],  n: [-1, 0] },
  ];
  const L = 2 * D;
  for (const s of sides){
    const [ox, oz] = s.o, [ux, uz] = s.u, [nx, nz] = s.n;
    /* the panels' inner face; u x v must equal the normal, so for each side
       the grid runs along the wall with v = up */
    const cr = (ax, ay, az, bx, by, bz) => [ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx];
    let c = cr(ux, 0, uz, 0, 1, 0);
    const flip = (c[0]*nx + c[2]*nz) < 0;
    const sx = flip ? ox + ux * L : ox, sz = flip ? oz + uz * L : oz, du = flip ? -1 : 1;
    litGrid(g, sx, 0, sz,  ux*du, 0, uz*du,  0, 1, 0,  L, H,  nx, 0, nz,  3, 1.2, 3, 3);
    /* the outer face, a wall's thickness behind */
    const bx = sx - nx * T + ux * du * L, bz = sz - nz * T + uz * du * L;
    litGrid(g, bx, 0, bz,  -ux*du, 0, -uz*du,  0, 1, 0,  L, H,  -nx, 0, -nz,  3, 1.2, 3, 3);
    /* piers, standing proud of the panels on the inside */
    for (let a = E.pierEvery; a < L - 0.5; a += E.pierEvery){
      const px = ox + ux * a, pz = oz + uz * a;             // on the wall's inner face
      const x0 = ux ? px - 0.22 : Math.min(px, px + nx * 0.2), x1 = ux ? px + 0.22 : Math.max(px, px + nx * 0.2);
      const z0 = uz ? pz - 0.22 : Math.min(pz, pz + nz * 0.2), z1 = uz ? pz + 0.22 : Math.max(pz, pz + nz * 0.2);
      litBox(g, x0, 0, z0, x1, H + E.coping, z1, { bevel: 0.03, seg: 2, tile: 3 });
    }
    /* the coping: a capping strip a little wider than the wall */
    const cx0 = Math.min(ox, ox + ux * L) - (nx ? 0 : 0), cz0 = Math.min(oz, oz + uz * L);
    const cx1 = Math.max(ox, ox + ux * L), cz1 = Math.max(oz, oz + uz * L);
    const ix0 = nx ? Math.min(ox + nx * 0.06, ox - nx * (T + 0.06)) : cx0, ix1 = nx ? Math.max(ox + nx * 0.06, ox - nx * (T + 0.06)) : cx1;
    const iz0 = nz ? Math.min(oz + nz * 0.06, oz - nz * (T + 0.06)) : cz0, iz1 = nz ? Math.max(oz + nz * 0.06, oz - nz * (T + 0.06)) : cz1;
    litBox(g, ix0, H, iz0, ix1, H + E.coping, iz1, { bevel: 0.02, seg: 3, tile: 3 });
  }
  litAdd(new THREE.Mesh(litGeoDone(g), litMaterial('concrete')), true);

  /* The palisade: one quad per side on the wall's centre line, and a post
     at every pier. Lit by the moving-things lights, not baked: it is a
     cut-out, and the bake has no idea which texels are holes. */
  const f = litGeo(), y0 = H + E.coping, fh = E.fenceTop - y0;
  for (const s of sides){
    const [ox, oz] = s.o, [ux, uz] = s.u, [nx, nz] = s.n;
    const mx = ox - nx * T * 0.5, mz = oz - nz * T * 0.5;
    litGrid(f, mx, y0, mz,  ux, 0, uz,  0, 1, 0,  L, fh,  nx, 0, nz,  L, fh, 1.2, fh);
  }
  litAdd(new THREE.Mesh(litGeoDone(f), litPalisadeMat()), false);
  const posts = litGeo();
  for (const s of sides){
    const [ox, oz] = s.o, [ux, uz] = s.u, [nx, nz] = s.n;
    for (let a = 0; a <= L + 0.01; a += EDGE.pierEvery){
      const px = ox + ux * a - nx * T * 0.5, pz = oz + uz * a - nz * T * 0.5;
      litBox(posts, px - 0.05, y0, pz - 0.05, px + 0.05, E.fenceTop + 0.1, pz + 0.05, { seg: 3, tile: 1 });
    }
  }
  const pm = lookTag(new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.55, metalness: 0.5 }), { metalness: 0.5, roughness: 0.55 }, { metalness: 0, roughness: 0.55 });
  litAdd(new THREE.Mesh(litGeoDone(posts), pm), false);
}
/* Everything past the fence. Built with the same geometry helpers as the
   site, then each vertex is given its colour times a simple sky-and-sun
   shading, so the material can be unlit (MeshBasic, with fog). Points and
   lines for the bits too thin for triangles. */
function litFarWorld(map){
  const A = map.arena, rnd = litRand(2111), g = litGeo(), col = [];
  const sun = new THREE.Vector3().fromArray(EDGE.sun).normalize();
  const paint = (from, c) => {                    // shade the vertices added since `from`
    for (let i = from; i < g.p.length / 3; i++){
      const nx = g.n[i*3], ny = g.n[i*3+1], nz = g.n[i*3+2];
      const k = 0.50 + 0.30 * Math.max(0, ny) + 0.32 * Math.max(0, nx*sun.x + ny*sun.y + nz*sun.z);
      col.push(c[0] * k, c[1] * k, c[2] * k);
    }
  };
  const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const box = (x0, y0, z0, x1, y1, z1, c) => { const m = g.p.length / 3; litBox(g, x0, y0, z0, x1, y1, z1, { seg: 1e9, tile: 1e9 }); paint(m, c); };
  const cyl = (x, z, y0, y1, r0, r1, sides, c, cap) => { const m = g.p.length / 3; litCyl(g, x, y0, z, x, y1, z, r0, r1, sides, 1e9, false, cap); paint(m, c); };
  const rod = (a, b, r, c) => { const m = g.p.length / 3; litCyl(g, a[0], a[1], a[2], b[0], b[1], b[2], r, r, 4, 1e9, false, false); paint(m, c); };
  const polar = (r, az) => [Math.sin(az) * r, Math.cos(az) * r];
  const lines = [], beacons = [];

  /* The ground out to the haze: fields in strips, a little darker under
     the tree belts. A ring of quads from just outside the wall. */
  { const m = g.p.length / 3, R0 = A + 0.5, R1 = 470, NA = 96, NR = 10;
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++){
      const r = R0 + (R1 - R0) * Math.pow(j / NR, 1.6), a = i / NA * Math.PI * 2;
      /* the square site inside a round ring: clamp the inner edge to the wall */
      let x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (j === 0){ const s = R0 / Math.max(Math.abs(x), Math.abs(z)); x *= s; z *= s; }
      g.p.push(x, -0.03, z); g.n.push(0, 1, 0); g.uv.push(0, 0);
      const field = Math.floor((a * 7 + r * 0.013) * 1.3) % 3;
      const c = field === 0 ? hex(0x4a5240) : field === 1 ? hex(0x5b5c47) : hex(0x434b3c);
      col.push(c[0] * 0.95, c[1] * 0.95, c[2] * 0.95);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++){
      const q = m + j * (NA + 1) + i;
      g.i.push(q, q + NA + 1, q + 1,  q + 1, q + NA + 1, q + NA + 2);
    }
  }
  /* Tree belts: field boundaries of mixed broadleaf (squat cones, wide) and
     conifer (tall, thin), broken into stretches so the line is ragged. */
  /* A broadleaf crown is a cluster of puffs (two cones base to base), so
     its outline is lumpy the way a tree's is; a conifer is two tiers of
     cone. Belts are broken into stretches so the line is ragged. */
  const puff = (x, y, z, r, hh, c) => { cyl(x, z, y - hh, y, r * 0.35, r, 6, c, false); cyl(x, z, y, y + hh, r, r * 0.3, 6, c, false); };
  const trees = (r, az0, az1, n) => {
    for (let i = 0; i < n; i++){
      const az = az0 + (az1 - az0) * (i + rnd() * 0.6) / n, rr = r + (rnd() - 0.5) * 14, [x, z] = polar(rr, az);
      const conifer = rnd() < 0.18, h = conifer ? 13 + rnd() * 9 : 9 + rnd() * 8;
      cyl(x, z, 0, h * 0.4, 0.35, 0.25, 4, hex(0x2b2620), false);       // trunk
      if (conifer){
        const c = hex(0x262f22);
        /* tiers of drooping boughs, each narrower, so the outline steps
           in the way a spruce's does instead of running straight as a cone */
        const r0 = 2.6 + rnd() * 0.8;
        for (let k = 0; k < 4; k++){ const y0 = h * (0.14 + k * 0.2), r = r0 * (1 - k * 0.22);
          cyl(x, z, y0, y0 + h * 0.3, r, r * 0.25, 7, c, false); }
      } else {
        const c = rnd() < 0.5 ? hex(0x363f2c) : hex(0x414830), w = 3.2 + rnd() * 2.6;
        for (let k = 0; k < 4; k++)
          puff(x + (rnd() - 0.5) * w, h * (0.55 + rnd() * 0.3), z + (rnd() - 0.5) * w, w * (0.6 + rnd() * 0.4), h * (0.16 + rnd() * 0.1), c);
      }
    }
  };
  for (const [r, a0, a1, n] of [[205, 0.10, 1.25, 74], [212, 1.55, 2.6, 64], [200, 2.95, 4.0, 66], [216, 4.3, 5.2, 56], [208, 5.45, 6.2, 50],
                                [270, 0.4, 1.9, 60], [280, 3.3, 4.6, 56], [292, 5.0, 6.0, 36]]) trees(r, a0, a1, n);

  /* The station's own power lines, leaving on lattice pylons. Each pylon:
     four legs drawn in to a waist, a mast, three cross-arms, bracing;
     conductors swing in a catenary between the arm tips. Three corridors,
     leaving the site where its transformers are. */
  const steel = hex(0x777d82);
  const pylon = (x, z, az) => {
    const ca = Math.cos(az), sa = Math.sin(az);                         // arms run ACROSS the line
    const P = (u, y, v) => [x + u * ca + v * sa, y, z - u * sa + v * ca];
    const base = 4.2, waist = 1.3, wy = 27, top = 41;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
      rod(P(su * base, 0, sv * base), P(su * waist, wy, sv * waist), 0.22, steel);
      rod(P(su * waist, wy, sv * waist), P(su * 0.6, top, sv * 0.6), 0.16, steel);
    }
    for (const [y, lu, lv] of [[9, 3.3, 3.3], [18, 2.3, 2.3]])             // a couple of bracing rings
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]])
        rod(P(a[0] * lu, y, a[1] * lv), P(b[0] * lu, y, b[1] * lv), 0.1, steel);
    const tips = [];
    for (const [y, w] of [[26, 7.5], [32, 6.2], [38, 5.0]]){
      rod(P(-w, y, 0), P(w, y, 0), 0.18, steel);
      rod(P(-w, y, 0), P(0, y + 2.2, 0), 0.08, steel); rod(P(w, y, 0), P(0, y + 2.2, 0), 0.08, steel);
      tips.push(P(-w, y - 2.2, 0), P(w, y - 2.2, 0));                   // insulator strings hang 2.2m
    }
    tips.push(P(0, top + 0.5, 0));                                      // the earth wire
    return tips;
  };
  const corridor = (az, r0, r1, step) => {
    let prev = null;
    for (let r = r0; r <= r1; r += step){
      const [x, z] = polar(r, az + (rnd() - 0.5) * 0.01), tips = pylon(x, z, az);
      if (prev) for (let k = 0; k < tips.length; k++){                // catenary, 8 pieces a span
        const a = prev[k], b = tips[k], sag = Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.035;
        for (let s = 0; s < 8; s++){
          const t0 = s / 8, t1 = (s + 1) / 8, y = (t) => a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
          lines.push(a[0] + (b[0] - a[0]) * t0, y(t0), a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, y(t1), a[2] + (b[2] - a[2]) * t1);
        }
      }
      prev = tips;
    }
  };
  corridor(0.55, 140, 430, 62); corridor(2.45, 138, 430, 66); corridor(4.95, 142, 430, 60);
  /* THE SWITCHYARD'S LINE (2026-11-22): it leaves the yard's west portal
     for a terminal tower 40m beyond the wall - the switchyard prop strings
     its conductors to this tower's arm from the same numbers (p.exit) - and
     goes on west on ordinary pylons. */
  { const sy = (map.props || []).find(p => p.kind === 'switchyard');
    if (sy){
      const T = sy.exit, tx = T.x, tz = T.z, zs = sy.ph;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
        rod([tx + su * 2.6, 0, tz + sv * 2.6], [tx + su * 0.9, T.y - 1, tz + sv * 0.9], 0.2, steel);
        rod([tx + su * 0.9, T.y - 1, tz + sv * 0.9], [tx + su * 0.45, T.peak, tz + sv * 0.45], 0.14, steel);
      }
      for (const [y, l] of [[5, 2.1], [10, 1.6]])
        for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]])
          rod([tx + a[0] * l, y, tz + a[1] * l], [tx + b[0] * l, y, tz + b[1] * l], 0.1, steel);
      const arm = Math.max(...zs.map(z => Math.abs(z - tz))) + 2;
      rod([tx, T.y, tz - arm], [tx, T.y, tz + arm], 0.22, steel);                   // the crossarm, along the line's width
      rod([tx, T.y, tz - arm], [tx, T.y + 2.4, tz], 0.08, steel); rod([tx, T.y, tz + arm], [tx, T.y + 2.4, tz], 0.08, steel);
      let prev = [...zs.map(z => [tx, T.y - 0.4, z]), [tx, T.peak + 0.3, tz]];
      for (let x = tx - 62; x >= -430; x -= 62){
        const tips = pylon(x, tz, Math.PI / 2), use = [tips[0], tips[2], tips[4], tips[6]];   // one circuit + the earth
        for (let k = 0; k < use.length; k++){
          const a = prev[k], b = use[k], sag = Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.035;
          for (let s = 0; s < 8; s++){
            const t0 = s / 8, t1 = (s + 1) / 8, y = (t) => a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
            lines.push(a[0] + (b[0] - a[0]) * t0, y(t0), a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, y(t1), a[2] + (b[2] - a[2]) * t1);
          }
        }
        prev = use;
      }
    }
  }

  /* A town to the north-east: terraces and low blocks, a church spire,
     two towers. Pale render, dark roofs. */
  for (let i = 0; i < 90; i++){
    const az = 0.95 + rnd() * 1.05, r = 300 + rnd() * 110, [x, z] = polar(r, az);
    const w = 8 + rnd() * 18, d = 8 + rnd() * 14, h = 6 + Math.pow(rnd(), 2.2) * 26;
    const c = rnd() < 0.6 ? hex(0x8e8a82) : (rnd() < 0.5 ? hex(0x6f6a62) : hex(0x7d8288));
    box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, c);
    if (h < 14) box(x - w / 2 - 0.3, h, z - d * 0.25, x + w / 2 + 0.3, h + 2.6, z + d * 0.25, hex(0x3b3a38));   // a ridged roof's bulk
  }
  for (const [r, az, h] of [[340, 1.35, 58], [372, 1.62, 72]]){
    const [x, z] = polar(r, az); box(x - 9, 0, z - 9, x + 9, h, z + 9, hex(0x7a7f85));
    beacons.push([x, h + 1.2, z]);
  }
  { const [x, z] = polar(318, 1.18); box(x - 4, 0, z - 9, x + 4, 14, z + 9, hex(0x8a857c)); box(x - 2.5, 0, z + 9, x + 2.5, 24, z + 14, hex(0x8a857c));
    cyl(x, z + 11.5, 24, 40, 2.6, 0.1, 4, hex(0x55524d), false); }            // the church and its spire

  /* The neighbouring works to the north-west: two banded chimneys, a
     boiler house, a gas holder and tanks. */
  { const [cx, cz] = polar(330, 5.55);
    box(cx - 30, 0, cz - 18, cx + 30, 34, cz + 18, hex(0x6c7177));
    box(cx - 30, 34, cz - 18, cx + 30, 37, cz + 18, hex(0x4c5055));
    for (const [dx, dz, h] of [[-12, 30, 120], [14, 32, 104]]){
      cyl(cx + dx, cz + dz, 0, h, 4.6, 3.0, 14, hex(0xa9aaa6), true);
      for (const f of [0.82, 0.92]) cyl(cx + dx, cz + dz, h * f, h * f + h * 0.05, 3.0 + 1.6 * (1 - f) + 0.08, 3.0 + 1.6 * (1 - f - 0.05) + 0.08, 14, hex(0x8a2b20), false);
      beacons.push([cx + dx, h + 1.5, cz + dz], [cx + dx, h * 0.55, cz + dz]);
    }
    const [gx, gz] = polar(285, 5.25);
    cyl(gx, gz, 0, 30, 21, 21, 20, hex(0x5d6a64), true);
    for (let k = 0; k < 4; k++){ const [tx, tz] = polar(300, 5.9 + k * 0.05); cyl(tx, tz, 0, 14, 8, 8, 14, hex(0x9a9d9c), true); }
  }
  /* And a second station far off to the south, its cooling towers just
     shapes in the haze - an echo of the one you are standing in. */
  for (const [r, az] of [[400, 3.55], [415, 3.68]]){
    const [x, z] = polar(r, az), prof = [[0, 34], [30, 25], [60, 20], [82, 21.5], [95, 23.5]];
    for (let k = 0; k < prof.length - 1; k++) cyl(x, z, prof[k][0], prof[k + 1][0], prof[k][1], prof[k + 1][1], 18, hex(0x9da3a6), false);
  }
  /* Hills, last and furthest: a ragged ring that the haze nearly takes. */
  { const m = g.p.length / 3, N = 120, R = 455;
    for (let i = 0; i <= N; i++){
      const a = i / N * Math.PI * 2, h = 16 + 22 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3)) * (0.6 + 0.4 * Math.sin(a * 7.7)) + rnd() * 4;
      g.p.push(Math.sin(a) * R, -1, Math.cos(a) * R, Math.sin(a) * R, h, Math.cos(a) * R);
      g.n.push(-Math.sin(a), 0.3, -Math.cos(a), -Math.sin(a), 0.6, -Math.cos(a)); g.uv.push(0, 0, 0, 0);
      const c = hex(0x56604f); col.push(c[0], c[1], c[2], c[0] * 1.05, c[1] * 1.05, c[2] * 1.05);
    }
    for (let i = 0; i < N; i++){ const q = m + i * 2; g.i.push(q, q + 1, q + 2,  q + 1, q + 3, q + 2); }
  }

  const geo = litGeoDone(g);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }));
  mesh.frustumCulled = false; litAdd(mesh, false); mesh.receiveShadow = false;
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const wires = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2e33, fog: true, transparent: true, opacity: 0.75 }));
  wires.frustumCulled = false; litAdd(wires, false);
  /* Aviation lights: red, slow, and seen through the haze, which is what
     they are for - so not fogged, but sized by distance like any point. */
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons.flat(), 3));
  EDGE_BEACON = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xff2a1a, size: 3.2, sizeAttenuation: true, fog: false, transparent: true, depthWrite: false }));
  EDGE_BEACON.frustumCulled = false; litAdd(EDGE_BEACON, false);
}
let EDGE_BEACON = null;

/* The site boundary: an embankment of trees, which is what is actually round
   a station of this kind and is the one honest way to make a 10m wall nobody
   questions. Drawn as a silhouette band rather than trees — at the distance
   you ever see it from, a ragged dark edge against the sky is all that
   reads, and anything more detailed is tiling you can count. */
function litTreeTexture(){
  /* Greener and lighter than the first one, which was nearly black: under
     'cover' shading it now takes the sky's light like the site does. */
  return litCanvas(512, 256, (g, w, h) => {
    const bank = g.createLinearGradient(0, 0, 0, h);
    bank.addColorStop(0, '#3a4c31'); bank.addColorStop(0.55, '#2c3b26'); bank.addColorStop(1, '#212c1d');
    g.fillStyle = bank; g.fillRect(0, 0, w, h);
    const rnd = litRand(7);
    for (let i = 0; i < 170; i++){               // crowns, lit from above
      const x = rnd() * w, r = 10 + rnd() * 30, y = 18 + rnd() * 50;
      const gr = g.createRadialGradient(x, y - r * 0.4, 0, x, y, r);
      gr.addColorStop(0, 'rgba(84,104,64,0.50)'); gr.addColorStop(1, 'rgba(24,34,20,0.0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 260; i++){               // foliage below
      const x = rnd() * w, y = 30 + rnd() * (h - 30), r = 4 + rnd() * 16;
      g.fillStyle = (rnd() < 0.5 ? 'rgba(66,84,50,' : 'rgba(22,30,20,') + (0.12 + rnd() * 0.25).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#3a4430'; g.fillRect(0, h - 22, w, 22);     // the foot of the bank
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
  /* Precast shell, read from Jack's KKP-URA photograph: long VERTICAL panel
     joints running the whole height, faint horizontal lift lines, and rain
     staining down. The first version staggered short joints in a brick bond,
     which at this scale came out as a field of dots. 512px is 6m of shell. */
  return litCanvas(512, 512, (g, w, h) => {
    g.fillStyle = '#a4a59f'; g.fillRect(0, 0, w, h);
    const rnd = litRand(11);
    for (let x = 0; x < w; x += 32){                         // a joint every 0.375m, a heavier one every 0.75m
      const heavy = (x / 32) % 2 === 0;
      g.fillStyle = heavy ? 'rgba(58,60,56,0.34)' : 'rgba(58,60,56,0.16)'; g.fillRect(x, 0, heavy ? 2 : 1, h);
      g.fillStyle = 'rgba(214,216,208,0.18)'; g.fillRect(x + (heavy ? 2 : 1), 0, 1, h);   // the lit lip of the joint
    }
    for (let y = 0; y < h; y += 128){ g.fillStyle = 'rgba(60,62,58,0.10)'; g.fillRect(0, y, w, 1); }   // lift lines, 1.5m
    for (let i = 0; i < 300; i++){                          // staining, always downward
      const x = rnd() * w, y = rnd() * h * 0.85, l = 30 + rnd() * 240;
      g.fillStyle = (rnd() < 0.55 ? 'rgba(70,72,66,' : 'rgba(180,182,174,') + (0.03 + rnd() * 0.09).toFixed(3) + ')';
      g.fillRect(x, y, 1 + rnd() * 5, l);
    }
    /* No litGrime here: its blotches repeat with the 6m tile and on a shell
       this big they printed a grid of patches. Rain streaks only. */
  });
}
/* The stack: white and aviation red, in bands, with the dirt a stack gets. */
function litStackTexture(){
  /* ONE tile for the stack's whole height (the prop passes tileV = h). A
     real chimney is grey concrete for most of its height, with its aviation
     bands - red and white - only round the top, then soot. It used to repeat
     seven bands every 9.7m from the foot to the cap. */
  return litCanvas(64, 1024, (g, w, h) => {
    g.fillStyle = '#b3b2ab'; g.fillRect(0, 0, w, h);
    const rnd = litRand(5);
    for (let y = 0; y < h; y += 23){ g.fillStyle = 'rgba(70,68,62,0.10)'; g.fillRect(0, y, w, 1); }   // slipform lifts, ~1.5m
    const top = Math.round(h * 0.20), band = top / 5;         // the top fifth: red, white, red, white, red
    for (let i = 0; i < 5; i++){ g.fillStyle = i % 2 ? '#dcdcd6' : '#a8392c'; g.fillRect(0, i * band, w, band + 1); }
    for (let i = 0; i < 140; i++){
      const y = rnd() * h;
      g.fillStyle = 'rgba(40,36,34,' + (0.02 + rnd() * 0.07).toFixed(3) + ')';
      g.fillRect(rnd() * w, y, 1 + rnd() * 3, 14 + rnd() * 90);
    }
    const sg = g.createLinearGradient(0, 0, 0, 60);              // soot at the lip, fading down
    sg.addColorStop(0, 'rgba(26,24,22,0.75)'); sg.addColorStop(1, 'rgba(26,24,22,0)');
    g.fillStyle = sg; g.fillRect(0, 0, w, 60);
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
    /* Slab joints belong to concrete: take them back out of anything the
       ground layer paints as road, gravel or grass. */
    for (const q of (map.ground || [])){ const r = litGroundRect(q, 0.3); g.clearRect(X(r[0]), Z(r[1]), (r[2] - r[0]) * k, (r[3] - r[1]) * k); }
    if (!map.sky){                                                                    // the boundary line, indoors only
      const m = 2.6;
      g.strokeStyle = 'rgba(206,36,58,0.80)'; g.lineWidth = 0.20 * k; g.setLineDash([6 * k, 0.9 * k]);
      g.strokeRect(X(-D + m), Z(-D + m), (2 * D - 2 * m) * k, (2 * D - 2 * m) * k); g.setLineDash([]);
    }
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
    /* 2026-11-23, the Saltline list: zebra crossings, lane arrows, and
       yellow keep-clear boxes in front of doors. */
    for (const p of of('zebra')){                // stripes run WITH the traffic (3m long), stacked across the road's width
      g.fillStyle = 'rgba(236,236,230,0.82)';
      const h = p.w / 2 - 0.45;
      for (let o = -h + 0.25; o <= h - 0.25 + 1e-6; o += 0.9){
        if (p.horiz) g.fillRect(X(p.x - 1.5), Z(p.z + o - 0.25), 3 * k, 0.5 * k); else g.fillRect(X(p.x + o - 0.25), Z(p.z - 1.5), 0.5 * k, 3 * k);
      }
    }
    for (const p of of('arrow')){
      g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(p.a); g.fillStyle = 'rgba(236,236,230,0.80)';
      g.fillRect(-1.6 * k, -0.11 * k, 2.2 * k, 0.22 * k);
      g.beginPath(); g.moveTo(1.6 * k, 0); g.lineTo(0.6 * k, -0.55 * k); g.lineTo(0.6 * k, 0.55 * k); g.closePath(); g.fill();
      g.restore();
    }
    for (const p of of('keep')){
      const x0 = X(p.x - p.w / 2), z0 = Z(p.z - p.d / 2), w = p.w * k, d = p.d * k, lw = 0.12 * k;
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.clip();
      g.strokeStyle = 'rgba(210,164,40,0.70)'; g.lineWidth = lw;
      for (let q = -d; q < w; q += 0.9 * k){ g.beginPath(); g.moveTo(x0 + q, z0 + d); g.lineTo(x0 + q + d, z0); g.stroke(); }
      g.restore();
      g.strokeStyle = 'rgba(210,164,40,0.85)'; g.lineWidth = lw * 1.4; g.strokeRect(x0, z0, w, d);
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
    /* Nor round anything raised (a slab, a tread: there is no floor under
       it to paint), nor round an office's walls and furniture, which stand
       on a tiled floor, not on the yard - drawn round those, the lines made
       a bright grid across the office's ground floor. */
    for (const b of map.boxes){ if (b.mat === 'hidden' || b.mat === 'plinth' || b.mat === 'transformer' || b.mat === 'column') continue;
      if (boxY(b) > 0.05 || LIT_INDOOR[b.mat]) continue;
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

/* THE GROUND (stage 3): a second picture over the whole floor, drawn from
   `map.ground` - grass and gravel zones, then roads with kerbs, edge lines and
   a dashed centre. Same mapping as the markings (canvas x = world x, canvas y
   = world z, flipY off). Colours are the MEAN look; the shader multiplies in
   the concrete photoscan's grain, so up close every surface keeps texture. */
const LIT_GROUND = {};
/* The office's kinds (works.js): indoors, on a tiled floor, so the yard's
   keep-clear lines are not painted round them. */
/* What a raised box shows from below, by kind: a material, or null for a
   kind that draws itself (or nothing). Anything not listed is concrete. */
const LIT_UNDER = { grating: 'galv', steptread: 'galv', handrail: null, pipewalk: null, stackwall: null, ringdeck: null, ringrail: null, towerwall: null, boilerwall: null, hallroof: null,
                    shedroof: 'cladding', intakeroof: 'cladding', boilerroof: 'girder', duct: 'cladding' };
const LIT_INDOOR = { facade: 1, core: 1, desk: 1, screen: 1, counter: 1, bench: 1, tread: 1, slab: 1,
                     roofslab: 1, parapet: 1, rail: 1, glass: 1,
                     /* the walls of the hollow sheds and the boiler house: a
                        keep-clear line round a wall drew a white outline on
                        the floor INSIDE the dosing house (2026-11-21) */
                     shedwall: 1, bwall: 1,
                     /* the switchyard stands on gravel: no painted outlines
                        round its legs, posts, masts or fence (2026-11-22) */
                     lattice: 1, breaker: 1, hviso: 1, hvct: 1, mast: 1, palisade: 1 };
function litGroundRect(q, kerb){                 // a zone or a road as [x0, z0, x1, z1]
  if (q.k !== 'road') return [Math.min(q.x0, q.x1), Math.min(q.z0, q.z1), Math.max(q.x0, q.x1), Math.max(q.z0, q.z1)];
  const h = q.w / 2 + (kerb || 0), horiz = Math.abs(q.x1 - q.x0) > Math.abs(q.z1 - q.z0);
  return horiz ? [Math.min(q.x0, q.x1), q.z0 - h, Math.max(q.x0, q.x1), q.z0 + h]
               : [q.x0 - h, Math.min(q.z0, q.z1), q.x0 + h, Math.max(q.z0, q.z1)];
}
function litGroundTexture(map){
  const G = map.ground || [];
  if (!G.length) return LIT_NOGROUND;
  if (LIT_GROUND[map.id]) return LIT_GROUND[map.id];
  const a = map.arena, S = a > 50 ? 2048 : 1024, k = S / (2 * a);
  const X = (x) => (x + a) * k, Z = (z) => (z + a) * k;
  const rnd = litRand(57), of = (kind) => G.filter(q => q.k === kind);
  const box = (r, col) => { g.fillStyle = col; g.fillRect(X(r[0]), Z(r[1]), (r[2] - r[0]) * k, (r[3] - r[1]) * k); };
  let g;
  const c = litCanvas(S, S, (gg) => {
    g = gg; g.clearRect(0, 0, S, S);
    /* Grass: a mid green with darker and drier patches, then a scatter of
       single-pixel blades so it is not a flat wash from above. */
    for (const q of of('grass')){
      const r = litGroundRect(q), x0 = X(r[0]), z0 = Z(r[1]), w = (r[2] - r[0]) * k, d = (r[3] - r[1]) * k;
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.clip();
      g.fillStyle = '#56603f'; g.fillRect(x0, z0, w, d);             // a worn verge under a grey sky, not a lawn
      const n = Math.ceil(w * d / 900);
      for (let i = 0; i < n; i++){
        const x = x0 + rnd() * w, z = z0 + rnd() * d, rr = 6 + rnd() * 28, t = rnd();
        const col = t < 0.45 ? 'rgba(66,78,46,' : t < 0.8 ? 'rgba(100,110,70,' : 'rgba(132,124,92,';
        const gr = g.createRadialGradient(x, z, 0, x, z, rr);
        gr.addColorStop(0, col + (0.25 + rnd() * 0.3).toFixed(2) + ')'); gr.addColorStop(1, col + '0)');
        g.fillStyle = gr; g.fillRect(x - rr, z - rr, rr * 2, rr * 2);
      }
      for (let i = 0, m = Math.ceil(w * d / 6); i < m; i++){
        g.fillStyle = rnd() < 0.5 ? 'rgba(46,56,34,0.35)' : 'rgba(118,128,88,0.30)';
        g.fillRect(x0 + rnd() * w, z0 + rnd() * d, 1, 1);
      }
      g.restore();
    }
    /* Gravel: grey stone, speckled light and dark at every pixel scale. */
    for (const q of of('gravel')){
      const r = litGroundRect(q), x0 = X(r[0]), z0 = Z(r[1]), w = (r[2] - r[0]) * k, d = (r[3] - r[1]) * k;
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.clip();
      g.fillStyle = '#9a978f'; g.fillRect(x0, z0, w, d);
      for (let i = 0, m = Math.ceil(w * d / 2.2); i < m; i++){
        const t = rnd(); g.fillStyle = t < 0.5 ? 'rgba(98,96,90,0.5)' : t < 0.85 ? 'rgba(196,193,184,0.45)' : 'rgba(140,126,108,0.5)';
        g.fillRect(x0 + rnd() * w, z0 + rnd() * d, 1 + (rnd() < 0.2 ? 1 : 0), 1);
      }
      g.restore();
    }
    /* Tiles: the offices' ground floor (pale stone, 1.2m) and the path to
       its door (paving slabs, 0.9m). A grid of thin joints over a wash with
       a little variation per tile, so it reads as laid, not printed. */
    const tiles = (kind, col, joint, size, vary) => { for (const q of of(kind)){
      const r = litGroundRect(q), x0 = X(r[0]), z0 = Z(r[1]), w = (r[2] - r[0]) * k, d = (r[3] - r[1]) * k, t = size * k;
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.clip();
      g.fillStyle = col; g.fillRect(x0, z0, w, d);
      for (let x = x0; x < x0 + w; x += t) for (let z = z0; z < z0 + d; z += t){
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + (rnd() * vary).toFixed(3) + ')' : 'rgba(0,0,0,' + (rnd() * vary).toFixed(3) + ')';
        g.fillRect(x, z, t, t); }
      g.fillStyle = joint;
      for (let x = x0; x <= x0 + w; x += t) g.fillRect(x, z0, 1, d);
      for (let z = z0; z <= z0 + d; z += t) g.fillRect(x0, z, w, 1);
      g.restore();
    } };
    tiles('floor',  '#dcd9d0', 'rgba(70,68,64,0.28)', 1.2, 0.05);   // 1.2m: at 8.5px a metre, 0.6m tiles were a moire grid. Lighter (2026-11-22): the office's ground floor shares the outdoor slab, darkened for the overcast, and read a shade darker than the floors above it
    tiles('paving', '#a9a59b', 'rgba(60,58,54,0.35)', 0.9, 0.08);
    /* Roads: every kerb, then every asphalt bed, then every line - and last,
       the asphalt again over each junction, so no kerb or line runs across
       the mouth of a crossing road. */
    const roads = of('road');
    for (const q of roads) box(litGroundRect(q, 0.35), '#cfcec6');
    const tar = (r) => { box(r, '#56585c');
      const x0 = X(r[0]), z0 = Z(r[1]), w = (r[2] - r[0]) * k, d = (r[3] - r[1]) * k;
      for (let i = 0, m = Math.ceil(w * d / 14); i < m; i++){ g.fillStyle = rnd() < 0.5 ? 'rgba(34,35,38,0.30)' : 'rgba(128,128,128,0.22)'; g.fillRect(x0 + rnd() * w, z0 + rnd() * d, 1, 1); } };
    for (const q of roads) tar(litGroundRect(q));
    for (const q of roads){
      const horiz = Math.abs(q.x1 - q.x0) > Math.abs(q.z1 - q.z0), r = litGroundRect(q), e = q.w / 2 - 0.45, lw = 0.15;
      g.fillStyle = 'rgba(232,232,226,0.85)';                                        // edge lines
      if (horiz){ g.fillRect(X(r[0]), Z(q.z0 - e - lw / 2), (r[2] - r[0]) * k, lw * k); g.fillRect(X(r[0]), Z(q.z0 + e - lw / 2), (r[2] - r[0]) * k, lw * k); }
      else      { g.fillRect(X(q.x0 - e - lw / 2), Z(r[1]), lw * k, (r[3] - r[1]) * k); g.fillRect(X(q.x0 + e - lw / 2), Z(r[1]), lw * k, (r[3] - r[1]) * k); }
      g.fillStyle = 'rgba(236,236,230,0.80)';                                        // a dashed centre: 3m on, 3m off
      const len = horiz ? r[2] - r[0] : r[3] - r[1];
      for (let t = 1.5; t < len - 1.5; t += 6){
        if (horiz) g.fillRect(X(r[0] + t), Z(q.z0 - 0.07), 3 * k, 0.14 * k); else g.fillRect(X(q.x0 - 0.07), Z(r[1] + t), 0.14 * k, 3 * k);
      }
    }
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++){
      const A = litGroundRect(roads[i]), B = litGroundRect(roads[j]);
      const r = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.min(A[2], B[2]), Math.min(A[3], B[3])];
      if (r[2] > r[0] && r[3] > r[1]) tar(r);
    }
    /* Oil and leak stains (the clutter list, 2026-11-22): a dark core, a
       softer rim, a few drips leading off it. Saltline puts one under
       every vehicle and every drum store, and so does a real site. */
    const srnd = litRand(91);
    /* Puddles (2026-11-23, the Saltline list): a dark damp margin, then the
       water, which under an overcast is the sky's pale grey - lighter than
       the wet concrete round it - with a brighter streak of sheen. */
    for (const p of (map.props || [])) if (p.kind === 'clutter') for (const it of p.items){
      if (it.k !== 'puddle') continue;
      const cx = X(it.x), cz = Z(it.z), r = it.r * k;
      g.save(); g.translate(cx, cz); g.rotate(it.a || 0); g.scale(1, it.e || 0.7);
      for (let n = 0; n < 4; n++){                                                    // damp, ragged margin
        const ox = (srnd() - 0.5) * r * 0.7, oz = (srnd() - 0.5) * r * 0.7, rr = r * (1.05 + srnd() * 0.35);
        const gr = g.createRadialGradient(ox, oz, rr * 0.5, ox, oz, rr);
        gr.addColorStop(0, 'rgba(70,72,74,0.28)'); gr.addColorStop(1, 'rgba(70,72,74,0)');
        g.fillStyle = gr; g.fillRect(ox - rr, oz - rr, rr * 2, rr * 2);
      }
      const gw = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.85);                     // the water
      gw.addColorStop(0, 'rgba(226,232,238,0.72)'); gw.addColorStop(0.7, 'rgba(206,214,222,0.62)'); gw.addColorStop(1, 'rgba(150,156,162,0)');   // overcast sky, lighter than wet concrete
      g.fillStyle = gw; g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(246,248,250,0.45)'; g.fillRect(-r * 0.5, -r * 0.08, r * 0.8, r * 0.1);   // sheen
      g.restore();
    }
    for (const p of (map.props || [])) if (p.kind === 'clutter') for (const it of p.items){
      if (it.k !== 'oil') continue;
      const cx = X(it.x), cz = Z(it.z), r = it.r * k;
      for (let n = 0; n < 5; n++){
        const ox = cx + (srnd() - 0.5) * r, oz = cz + (srnd() - 0.5) * r, rr = r * (0.35 + srnd() * 0.6);
        const gr = g.createRadialGradient(ox, oz, 0, ox, oz, rr);
        gr.addColorStop(0, 'rgba(18,16,14,' + (0.45 + srnd() * 0.25).toFixed(2) + ')'); gr.addColorStop(0.6, 'rgba(24,22,20,0.22)'); gr.addColorStop(1, 'rgba(24,22,20,0)');
        g.save(); g.translate(ox, oz); g.scale(1, 0.6 + srnd() * 0.6); g.translate(-ox, -oz);
        g.fillStyle = gr; g.fillRect(ox - rr, oz - rr, rr * 2, rr * 2); g.restore();
      }
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.premultiplyAlpha = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return (LIT_GROUND[map.id] = t);
}

/* ---------------------------------------------------------------------
   4. THE SHADER PATCH
   --------------------------------------------------------------------- */
const LIT_BLANK = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255]), 1, 1, THREE.RGBAFormat);
LIT_BLANK.needsUpdate = true;
const LIT_NOGROUND = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
LIT_NOGROUND.needsUpdate = true;
/* One set of uniform objects, handed to every lit material: writing a
   value here reaches all of them, which is what lets a rebuilt arena or a
   finished bake update the whole room in one assignment. */
const LITU = {
  uLitTex:   { value: LIT_BLANK }, uLitMarks: { value: null }, uLitGround: { value: LIT_NOGROUND }, uLitArena: { value: 60 },
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
    uniform sampler2D uLitTex; uniform sampler2D uLitMarks; uniform sampler2D uLitGround; uniform float uLitArena;
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
    /* THE GROUND first: road, gravel, grass. Its own layer because the
       markings are worn by the roughness map below, and grass worn like
       paint showed bare concrete in patches. Each colour keeps the
       photoscan's grain: multiplied by the scan's brightness over its mean
       (0.0916 linear x the floor's 0.69 tint = 0.063), squared to double it. */
    vec4 litGd = texture2D( uLitGround, litUv );                     // premultiplied
    float litGround = litGd.a;
    if ( litGround > 0.002 ) {
      float litGrain = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) ) / 0.063;
      /* The canvas colours are how a surface should LOOK beside concrete that
         reads about #c4c4c4 (0.53 linear). The concrete itself is a dark scan
         (0.063) that the site's lighting multiplies up to that, so a ground
         colour is scaled by 0.063 / 0.53 into the same range first - unscaled,
         gravel came out white and grass a pale yellow. */
      vec3 litGc = pow( litGd.rgb / litGround, vec3( 2.2 ) ) * 0.119 * clamp( litGrain * litGrain, 0.55, 1.6 );
      diffuseColor.rgb = mix( diffuseColor.rgb, litGc, litGround );
    }
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
      + litRefl * litFres * litGloss * uLitRefl * mix( 0.35, 1.0, litAo ) * ( 1.0 - 0.9 * litGround );   // grass and gravel do not mirror the sky
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
/* name: [colour, roughness, metalness, envK, round]. Muted on purpose: a
   drum that has stood in the weather a year is not catalogue blue. */
const LIT_KIT_MATS = {
  drumblue: [0x243552, 0.5, 0.3, 0.5, 1], drumred: [0x652219, 0.5, 0.3, 0.5, 1], drumgrey: [0x55595c, 0.55, 0.35, 0.5, 1],
  drumgreen: [0x31422f, 0.55, 0.3, 0.5, 1], hdpe: [0xb9b5a6, 0.55, 0, 0.3, 0], pallet: [0x725637, 0.92, 0, 0.1, 0],
  cardboard: [0x8c6b48, 0.95, 0, 0.1, 0], wrap: [0xaeb3b8, 0.22, 0, 0.8, 0], cable: [0x111214, 0.6, 0, 0.3, 1],
  bottlemaroon: [0x5a1414, 0.45, 0.3, 0.6, 1], bottleblack: [0x161718, 0.45, 0.3, 0.6, 1], bottlegrey: [0x6a6e70, 0.45, 0.3, 0.6, 1],
  brasskit: [0x9a7a30, 0.35, 0.9, 0.9, 1], skip: [0x87681c, 0.7, 0.2, 0.35, 0], rubble: [0x4a4744, 1, 0, 0.05, 0],
  vanwhite: [0xc2c4c2, 0.32, 0.25, 0.8, 0], vanstripe: [0x9c1828, 0.4, 0.2, 0.6, 0], tyre: [0x141414, 0.9, 0, 0.1, 1],
  forkyellow: [0xa6821e, 0.5, 0.2, 0.5, 0], bingreen: [0x2a4630, 0.7, 0, 0.3, 0], gengreen: [0x394837, 0.6, 0.2, 0.4, 0],
  orange: [0xd0511a, 0.6, 0, 0.3, 1], white: [0xd8d8d4, 0.5, 0, 0.4, 1],
  /* the offices' dressing (2026-11-23) */
  chairblack: [0x1c1d20, 0.7, 0, 0.3, 1], cabgrey: [0x7d8287, 0.45, 0.4, 0.6, 0], leaf: [0x2f4a26, 0.8, 0, 0.2, 0],
  pot: [0x38393b, 0.6, 0, 0.3, 0], water: [0x6f93b8, 0.15, 0, 0.9, 0],
};
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
    case 'redlamp': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 0.35, 0.22) }); break;   // aviation lights: over 1, so the bloom holds them
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
    /* x1.8 (2026-11-21): the fog's colour is a hex three r128 takes as
       LINEAR, the sky's is an sRGB texture it decodes, so the same stop in
       both came out 0.34 in the sky and 0.62 in the haze - a dark sky with
       a pale band where the far world met it. At 1.8 the two agree, and the
       far world fades INTO the sky. */
    case 'skydome': m = new THREE.MeshBasicMaterial({ map: litSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }); m.color.setScalar(1.8); break;
    /* Not 'wall': that kind strips 78% of the colour and adds the hall's
       crimson strip, which drew the site boundary as a black band with a red
       line round it. */
    /* The boundary. Nearly matte, barely reflective: a treeline that caught
       the sky the way the concrete does read as a painted backdrop. */
    case 'treeline': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litTreeTexture(), true), roughness: 1, metalness: 0 }), 'cover', 0.06); break;
    /* Switchyard porcelain is WHITE, not the brown of a transformer bushing:
       outdoor HV insulators are glazed white or pale grey, and they are the
       thing that makes a yard read as a yard from across the site. */
    case 'hvwhite': m = litPatch(new THREE.MeshStandardMaterial({ color: 0xd4d7d6, roughness: 0.28, metalness: 0 }), 'cover', 0.85); m.defines.CX_ROUND = ''; break;
    /* Galvanised steel: the lattice, the racks, the gantries. Brighter and
       less blue than `steel`, which is a dark machined grey. */
    /* Lagged pipe: insulation under thin aluminium sheet, the bright silver
       runs of Jack's references. Round, so CX_ROUND. */
    case 'lagging': m = litPatch(new THREE.MeshStandardMaterial({ color: 0xc4c8cd, roughness: 0.34, metalness: 0.72 }), 'cover', 0.95); m.defines.CX_ROUND = ''; break;
    case 'galv':   m = litPatch(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.52, metalness: 0.55 }), 'cover', 0.80); m.defines.CX_ROUND = ''; break;
    /* The fire cabinets. The one saturated colour in the yard, which is
       exactly what it is for. */
    case 'firered': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x8c1a18, roughness: 0.6, metalness: 0.1 }), 'cover', 0.45); break;
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
    case 'towerskin': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litTowerTexture(), true), roughness: 0.94, metalness: 0 }), 'cover', 0.10);
                   m.defines.CX_ROUND = ''; break;
    /* The INSIDE of a tower's shell (litTowerTop): the same panels, but
       wet, stained and in its own shadow - the bake only sees the sky over
       the lip, so on the outside colour it came out nearly white. */
    /* Inside a closed furnace the bake finds no light at all, and it read as
       black. The tubes carry a little of their own - the glow off the burner
       throats and the work lamps - through an emissive copy of their texture. */
    case 'tubewall': { const tt = litTexOf(litBoilerTexture(), true);
                   /* Not litPatch'd: the lit look replaces a material's lighting with
                      the bake, emissive and all, and the bake sees nothing in here. A
                      plain material takes the moving-things lights and its own glow. */
                   m = lookTag(new THREE.MeshStandardMaterial({ map: tt, emissiveMap: tt, emissive: new THREE.Color(0.95, 0.66, 0.46), roughness: 0.75, metalness: 0.3 }), { metalness: 0.3, roughness: 0.75 }, { metalness: 0, roughness: 0.75 });
                   m.userData.envK = 0.3; break; }
    case 'glow':    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 1.5, 0.45) }); break;   // a burner seen through its sight glass
    case 'towerin': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litTowerTexture(), true), color: 0x4f5558, roughness: 0.9, metalness: 0 }), 'cover', 0.06);
                   m.defines.CX_ROUND = ''; break;
    /* The stack, in its aviation bands. Both of these are 'cover', not
       'wall': the wall kind is for the hall's perimeter - it strips 78% of
       the colour (for the tan scan under the crimson strip), darkens the
       foot and adds the strip's glow, which turned the aviation red navy. */
    case 'stackband': m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litStackTexture(), true), roughness: 0.82, metalness: 0.05 }), 'cover', 0.12);
                   m.defines.CX_ROUND = ''; break;
    /* THE OFFICES. Plain paints: an office is smooth painted surfaces, and
       the bake and the grade do the work a texture would. */
    case 'render':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.86, metalness: 0 }), 'cover', 0.25); break;   // the facade
    case 'mullion': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x30353b, roughness: 0.45, metalness: 0.6 }), 'cover', 0.7); break;   // window frames
    case 'paint':   m = litPatch(new THREE.MeshStandardMaterial({ color: 0xb4b8bc, roughness: 0.9, metalness: 0 }), 'cover', 0.2); break;    // inside walls
    case 'carpet':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 1, metalness: 0 }), 'cover', 0.05); break;      // upper floors
    case 'desk':    m = litPatch(new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.6, metalness: 0 }), 'cover', 0.35); break;    // a light oak laminate
    case 'carcass': m = litPatch(new THREE.MeshStandardMaterial({ color: 0x5e646b, roughness: 0.7, metalness: 0.2 }), 'cover', 0.4); break;   // desk pedestals
    case 'fabric':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0x2f5a63, roughness: 1, metalness: 0 }), 'cover', 0.1); break;       // screens, seats
    case 'nosing':  m = litPatch(new THREE.MeshStandardMaterial({ color: 0x1e2227, roughness: 0.5, metalness: 0.3 }), 'cover', 0.5); break;   // stair nosings, rails
    default:
      /* The clutter kit's paints (2026-11-22), and its signs. */
      if (LIT_KIT_MATS[name]){ const [c, r, mt, k, round] = LIT_KIT_MATS[name];
        m = litPatch(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt }), 'cover', k);
        if (round) m.defines.CX_ROUND = ''; break; }
      if (name.startsWith('sign_')){ m = litPatch(new THREE.MeshStandardMaterial({ map: litTexOf(litSignTexture(name.slice(5)), true), roughness: 0.55, metalness: 0 }), 'cover', 0.3); break; }
      m = litPatch(new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 }), 'cover', 0.3);
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
    /* STAGE 4: the steel frame showing through on every face, a column every
       ~6.8m, with window bands at two levels and louvres low down - Jack's
       references (200430, 200504) are steel structure, not a sealed box.
       Everything here stands at most 0.25m proud of the box, inside the 0.4m
       a player's body keeps off a wall, so none of it can be walked into. */
    const P = 0.25, faces = [                                             // [along x?, fixed coord, outward sign]
      [true, z0, -1], [true, z1, 1], [false, x0, -1], [false, x1, 1]];
    for (const [ax, c, s] of faces){
      const a0 = ax ? x0 : z0, a1 = ax ? x1 : z1, n = Math.max(2, Math.round((a1 - a0) / 6.8));
      const slab = (u0, u1, y0, y1, out, mat) => ax
        ? litBox(G(mat), u0, y0, Math.min(c, c + s * out), u1, y1, Math.max(c, c + s * out), { seg: 3, tile: 2 })
        : litBox(G(mat), Math.min(c, c + s * out), y0, u0, Math.max(c, c + s * out), y1, u1, { seg: 3, tile: 2 });
      for (const [y0, y1] of [[9.4, 11.6], [16.4, 18.6], [23.4, 25.2]]) slab(a0 + 1, a1 - 1, y0, y1, 0.04, 'glass');   // window bands
      slab(a0 + 1.2, a1 - 1.2, 2.2, 4.6, 0.03, 'steel');                                                     // louvres
      for (let i = 1; i < n; i++){ const u = a0 + (a1 - a0) * i / n; slab(u - 0.2, u + 0.2, 1.4, b.h - 0.6, P, 'girder'); }
    }
    /* Roof plant, 28m up: fan stacks, an air handler, vent stubs. */
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = b.h;
    for (const dx of [-14, -4, 6]){ litCyl(G('galv'), cx + dx, H, cz - 6, cx + dx, H + 1.1, cz - 6, 1.5, 1.5, 16, 1, false, true);
      litCyl(G('steel'), cx + dx, H + 1.1, cz - 6, cx + dx, H + 1.25, cz - 6, 1.55, 1.55, 16, 1, false, true); }
    litBox(G('galv'), cx + 8, H, cz + 2, cx + 18, H + 2.6, cz + 8, { seg: 3, tile: 2 });
    for (const dx of [-16, -10, -2]) litCyl(G('steel'), cx + dx, H, cz + 6, cx + dx, H + 3.2, cz + 6, 0.35, 0.35, 10, 1, false, true);
  },
  /* A workshop or a screen house: clad walls, blue roof. Every low building
     in the photograph has one. */
  shed(G, b, x0, z0, x1, z1){
    litBox(G('cladding'), x0, 0, z0, x1, b.h - 0.45, z1, { seg: LIT.coverSeg, tile: 3.2, tileV: 3.2, noTop: true });
    /* The eave overhangs 0.12m, not 0.35: the 5m shed's eave was a 35cm
       strip of roof with no collision under it, which the stage 5 probe
       flagged as the one fake floor in reach that was not porcelain. */
    litBox(G('roofblue'), x0 - 0.12, b.h - 0.45, z0 - 0.12, x1 + 0.12, b.h, z1 + 0.12, { seg: 3, tile: 3.2, tileV: 3.2 });
  },
  /* A CAPACITOR / CVT BAY - the rows of white porcelain stacks that fill a
     real switchyard and are the first thing you recognise in a photograph
     of one. A galvanised rack the height of the box, and three insulator
     columns standing on it. The RACK is the box: it is what stops you, and
     its top is the box's top. The columns are thin, round and over head
     height, so they are drawn and not collided - the same rule the
     transformer bushings and the breaker stacks already follow. */
  capbank(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.35, z1, { seg: 2, tile: 120, tileV: 8 });
    /* Flush to the box, not inset: an inset leaves a band of collision
       standing round the rack in clear air, which is the column mistake. */
    litBox(G('galv'), x0, 0.35, z0, x1, b.h, z1, { bevel: 0.04, seg: LIT.coverSeg, tile: 1.6 });
    const n = 3, span = (x1 - x0) - 0.9;
    for (let i = 0; i < n; i++){
      const px = x0 + 0.45 + span * (i + 0.5) / n, pz = b.z;
      litCyl(G('galv'), px, b.h, pz, px, b.h + 0.22, pz, 0.17, 0.15, 10, 1, false, true);
      /* A stack of sheds, widest at the bottom - an insulator's silhouette
         is the sheds, not the column. */
      for (let j = 0; j < 9; j++){ const y = b.h + 0.3 + j * 0.19, r = 0.30 - j * 0.009;
        litCyl(G('hvwhite'), px, y, pz, px, y + 0.07, pz, r, r * 0.70, 10, 1, true, true); }
      litCyl(G('hvwhite'), px, b.h + 0.22, pz, px, b.h + 2.1, pz, 0.14, 0.12, 10, 1.4, false, false);
      litCyl(G('galv'), px, b.h + 2.1, pz, px, b.h + 2.3, pz, 0.2, 0.2, 10, 1, true, true);
    }
  },
  /* A control or marshalling kiosk: the grey cabinets standing between the
     bays. Louvred doors, a lid with a lip. */
  kiosk(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.25, z1, { seg: 2, tile: 120, tileV: 8 });
    litBox(G('machine'), x0, 0.25, z0, x1, b.h - 0.12, z1, { bevel: 0.03, seg: LIT.coverSeg, tile: 2 });
    litBox(G('galv'), x0, b.h - 0.12, z0, x1, b.h, z1, { seg: 3, tile: 2 });   // flush: a lip is a ledge you can't stand on
  },
  /* A fire cabinet. Small, red, and everywhere in the photographs. */
  firebox(G, b, x0, z0, x1, z1){
    /* The lid is the top 10cm of the box, flush - it overhung by 5cm and
       sat above the collision, which the probe found as four cabinets with
       a ledge round them that was not there. */
    litBox(G('firered'), x0, 0, z0, x1, b.h - 0.1, z1, { bevel: 0.03, seg: LIT.coverSeg, tile: 1.2, noTop: true });
    litBox(G('galv'), x0, b.h - 0.1, z0, x1, b.h, z1, { seg: 2, tile: 1 });
  },
  /* A TRANSMISSION TOWER. One box, and the steel stays inside it at every
     height: four legs splayed to the box's own corners at the bottom,
     drawing in to a narrow mast, with bracing between. The crossarms reach
     outside the box - they are at 16m and up, which is nothing anybody
     stands on, and they are what makes the silhouette read. */
  hvtower(G, b, x0, z0, x1, z1){
    const cx = b.x, cz = b.z, H = b.h, hw = b.w / 2, hd = b.d / 2;
    const waist = 0.42, legR = 0.13;
    const at = (y) => {           // half-width of the tower body at height y
      const t = Math.min(1, y / (H * 0.62));
      return { x: hw * (1 - t) + waist * t, z: hd * (1 - t) + waist * t };
    };
    litBox(G('concrete'), x0, 0, z0, x1, 0.5, z1, { seg: 2, tile: 120, tileV: 8 });
    const STEP = 12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      for (let i = 0; i < STEP; i++){
        const ya = 0.5 + (H - 0.5) * i / STEP, yb = 0.5 + (H - 0.5) * (i + 1) / STEP;
        const a = at(ya), c = at(yb);
        litCyl(G('galv'), cx + sx * (a.x - legR), ya, cz + sz * (a.z - legR),
                          cx + sx * (c.x - legR), yb, cz + sz * (c.z - legR), legR, legR, 4, 2, false, false);
      }
    }
    /* Bracing: a zigzag across each face, which is the whole of what a
       lattice looks like from any distance. */
    for (let i = 0; i < STEP; i++){
      const ya = 0.5 + (H - 0.5) * i / STEP, yb = 0.5 + (H - 0.5) * (i + 1) / STEP;
      const a = at(ya), c = at(yb), f = i % 2 ? -1 : 1;
      for (const s of [-1, 1]){
        litCyl(G('galv'), cx - f * a.x, ya, cz + s * a.z, cx + f * c.x, yb, cz + s * c.z, 0.055, 0.055, 4, 1, false, false);
        litCyl(G('galv'), cx + s * a.x, ya, cz - f * a.z, cx + s * c.x, yb, cz + f * c.z, 0.055, 0.055, 4, 1, false, false);
      }
    }
    /* Crossarms, and the insulator strings hanging off them. */
    for (const [f, reach] of HVT_ARMS){ const y = H * f;
      for (const s of [-1, 1]){
        litCyl(G('galv'), cx, y, cz, cx + s * reach, y + 0.5, cz, 0.13, 0.09, 4, 2, false, false);
        litCyl(G('galv'), cx, y + 0.9, cz, cx + s * reach, y + 0.5, cz, 0.07, 0.05, 4, 2, false, false);
        for (let j = 0; j < 7; j++)   // the string
          litCyl(G('hvwhite'), cx + s * reach, y + 0.42 - j * 0.17, cz,
                               cx + s * reach, y + 0.36 - j * 0.17, cz, 0.15, 0.15, 8, 1, true, true);
      }
    }
    litCyl(G('galv'), cx, H, cz, cx, H + 1.6, cz, 0.08, 0.05, 4, 1, false, true);   // the earth peak
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

/* A WALL PIECE of a hollow building: a concrete base course up to `baseH`
   (only on a piece that starts below it) and clad sheet above. Its own
   y0 is boxY(b): the drawer works from 0 and is lifted. */
function litWallPiece(G, b, x0, z0, x1, z1, baseH){
  const y = boxY(b), c = Math.max(0, Math.min(b.h, baseH - y));
  /* 3m panels, not the cover's fine grid: a hollow building is hundreds of
     wall pieces, and the vertex bake pays for every vertex (a 1077-box map
     took 3.5s to build at cover density). */
  if (c > 0) litBox(G('concrete'), x0, 0, z0, x1, c, z1, { seg: 3, tile: 120, tileV: 8, noTop: c < b.h });
  if (c < b.h) litBox(G('cladding'), x0, c, z0, x1, b.h, z1, { seg: 3, tile: 3.2, tileV: 3.2 });
}
/* The boiler house's doorways (works.js bOps), so the outside steel the
   roof drawer puts on each face never crosses one. */
const LIT_BOILER_DOORS = [
  { face: 'S', a0: 50, a1: 55.5, y0: 0, y1: 5 }, { face: 'W', a0: -85.2, a1: -82.6, y0: 7.6, y1: 11.6 },
  { face: 'E', a0: -89.8, a1: -86.2, y0: 0, y1: 3.8 }, { face: 'E', a0: -89.8, a1: -86.2, y0: 13.8, y1: 17.8 },
];

/* THE OFFICES (works.js). Every one of these is drawn flush to its box: the
   top you see is the top you stand on. Raised ones are lifted and given an
   underside by the loop in litBuildArena. */
Object.assign(LIT_DRAW, {
  /* HOLLOW BUILDINGS (works.js `building`). A wall piece is clad sheet on a
     concrete base course, the base only where the piece reaches the ground. */
  shedwall(G, b, x0, z0, x1, z1){ litWallPiece(G, b, x0, z0, x1, z1, 0.9); },
  bwall(G, b, x0, z0, x1, z1){ litWallPiece(G, b, x0, z0, x1, z1, 1.4); },
  duct(G, b, x0, z0, x1, z1){ litBox(G('cladding'), x0, 0, z0, x1, b.h, z1, { seg: 3, tile: 3.2, tileV: 3.2 }); },
  shedroof(G, b, x0, z0, x1, z1){ litBox(G('roofblue'), x0, 0, z0, x1, b.h, z1, { seg: 3, tile: 3.2, tileV: 3.2 }); },
  intakeroof(G, b, x0, z0, x1, z1){ litBox(G('roofblue'), x0, 0, z0, x1, b.h, z1, { seg: 3, tile: 3.2, tileV: 3.2 }); },
  /* The boiler house's roof carries what the old solid box used to draw on
     the OUTSIDE: the floor bands, the corner columns, the steel frame on each
     face and the roof plant. This drawer's vertices are lifted to the roof
     (raised-box loop), so everything below the roof is drawn at y - base.
     Nothing crosses a doorway: a column or a band that would is left out. */
  boilerroof(G, b, x0, z0, x1, z1){
    const base = boxY(b), H = base + b.h, Y = (y) => y - base;
    litBox(G('girder'), x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, b.h, z1 + 0.1, { seg: 4, tile: 2 });   // the eaves band, flush with the roof's top
    const doors = LIT_BOILER_DOORS;
    const clear = (face, u0, u1, y0, y1) => !doors.some(d => d.face === face && u1 > d.a0 - 0.3 && u0 < d.a1 + 0.3 && y1 > d.y0 && y0 < d.y1);
    const faces = [['N', true, z0, -1], ['S', true, z1, 1], ['W', false, x0, -1], ['E', false, x1, 1]];
    for (const [f, ax, c, sg] of faces){
      const a0 = ax ? x0 : z0, a1 = ax ? x1 : z1, n = Math.max(2, Math.round((a1 - a0) / 6.8));
      const slab = (u0, u1, y0, y1, out, mat) => ax
        ? litBox(G(mat), u0, Y(y0), Math.min(c, c + sg * out), u1, Y(y1), Math.max(c, c + sg * out), { seg: 3, tile: 2 })
        : litBox(G(mat), Math.min(c, c + sg * out), Y(y0), u0, Math.max(c, c + sg * out), Y(y1), u1, { seg: 3, tile: 2 });
      for (const y of [7, 14, 21]){                                       // floor bands, broken at a door
        let u = a0;
        for (const d of doors.filter(d => d.face === f && y + 0.45 > d.y0 && y < d.y1).sort((p, q) => p.a0 - q.a0)){
          if (d.a0 > u) slab(u, d.a0, y, y + 0.45, 0.1, 'girder'); u = Math.max(u, d.a1);
        }
        if (u < a1) slab(u, a1, y, y + 0.45, 0.1, 'girder');
      }
      for (let i = 1; i < n; i++){ const u = a0 + (a1 - a0) * i / n;
        if (clear(f, u - 0.2, u + 0.2, 1.4, H)) slab(u - 0.2, u + 0.2, 1.4, H - 0.6, 0.25, 'girder'); }
    }
    for (const ex of [-1, 1]) for (const ez of [-1, 1]){                 // corner columns
      const cx = ex > 0 ? x1 : x0, cz = ez > 0 ? z1 : z0;
      litBox(G('girder'), cx - 0.45, Y(1.4), cz - 0.45, cx + 0.45, 0, cz + 0.45, { seg: 3, tile: 2, noTop: true });
    }
    /* Roof plant, on top: fan stacks, an air handler, vent stubs. */
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, T = b.h;
    for (const dx of [-14, -4, 6]){ litCyl(G('galv'), cx + dx, T, cz - 6, cx + dx, T + 1.1, cz - 6, 1.5, 1.5, 16, 1, false, true);
      litCyl(G('steel'), cx + dx, T + 1.1, cz - 6, cx + dx, T + 1.25, cz - 6, 1.55, 1.55, 16, 1, false, true); }
    litBox(G('galv'), cx + 8, T, cz + 2, cx + 18, T + 2.6, cz + 8, { seg: 3, tile: 2 });
    for (const dx of [-16, -10, -2]) litCyl(G('steel'), cx + dx, T, cz + 6, cx + dx, T + 3.2, cz + 6, 0.35, 0.35, 10, 1, false, true);
  },
  /* A boiler: an insulated casing in aluminium sheet, stiffener bands every
     3m, a row of burner throats low on the front, and the steam drum lying
     across the top (over head height on the top gallery, not collision). */
  boilerunit(G, b, x0, z0, x1, z1){
    litBox(G('lagging'), x0, 0, z0, x1, b.h, z1, { seg: 3, tile: 2 });
    for (let y = 3; y < b.h - 0.5; y += 3) litBox(G('girder'), x0 - 0.06, y, z0 - 0.06, x1 + 0.06, y + 0.25, z1 + 0.06, { seg: 4, tile: 2 });
    for (let i = 0; i < 4; i++){ const x = x0 + (x1 - x0) * (i + 0.5) / 4;
      litCyl(G('steel'), x, 2.4, z1, x, 2.4, z1 + 0.06, 0.55, 0.55, 14, 1, false, true); }
    const cz = (z0 + z1) / 2;
    litCyl(G('lagging'), x0 + 0.5, b.h + 1.3, cz, x1 - 0.5, b.h + 1.3, cz, 1.1, 1.1, 18, 3, true, true);
    for (const x of [x0 + 2, x1 - 2]) litBox(G('girder'), x - 0.2, b.h, cz - 0.6, x + 0.2, b.h + 0.4, cz + 0.6, { seg: 2, tile: 2 });
  },
  /* Steel grating floors and stair treads: galvanised, flush to the box. */
  grating(G, b, x0, z0, x1, z1){
    litBox(G('galv'), x0, 0, z0, x1, b.h, z1, { seg: 3, tile: 1 });
  },
  steptread(G, b, x0, z0, x1, z1){
    litBox(G('galv'), x0, 0, z0, x1, b.h, z1, { seg: 2, tile: 1 });
  },
  /* A handrail: posts every 1.5m, a top rail and a knee rail, yellow. The
     box is the rail's whole extent; what is drawn is thin. */
  handrail(G, b, x0, z0, x1, z1){
    const alongX = (x1 - x0) >= (z1 - z0), L = alongX ? x1 - x0 : z1 - z0, m = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const bar = (a0, a1, y0, y1, w) => alongX
      ? litBox(G('yellow'), x0 + a0, y0, m - w, x0 + a1, y1, m + w, { seg: 3, tile: 1 })
      : litBox(G('yellow'), m - w, y0, z0 + a0, m + w, y1, z0 + a1, { seg: 3, tile: 1 });
    bar(0, L, b.h - 0.05, b.h, 0.03);
    bar(0, L, 0.5, 0.54, 0.02);
    const n = Math.max(1, Math.round(L / 1.5));
    for (let i = 0; i <= n; i++){ const a = Math.min(L - 0.04, Math.max(0, L * i / n - 0.02)); bar(a, a + 0.04, 0, b.h - 0.05, 0.02); }
  },
  pipewalk(){},                                 // the pipes are drawn by their rack or bridge
  ringdeck(){}, ringrail(){},                   // the towers' rim gallery is drawn by the tower
  towerwall(){}, boilerwall(){},                // the shell's collision bands; a boiler's casing (drawn by their props)
  hallroof(){},                                 // the hall roof's deck: the hallroof prop draws the slab
  stackwall(){},                                // the ring is drawn by the stack prop
  /* The office facade: rendered walls. A thin piece - a mullion between two panes -
     is a dark metal frame, as glazing bars are; everything else is render. */
  facade(G, b, x0, z0, x1, z1){
    const thin = Math.min(b.w, b.d) < 0.5 && Math.max(b.w, b.d) <= 0.31 && b.h < 2.5;
    litBox(G(thin ? 'mullion' : 'render'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 3 });
  },
  parapet(G, b, x0, z0, x1, z1){
    litBox(G('render'), x0, 0, z0, x1, b.h - 0.06, z1, { seg: LIT.coverSeg, tile: 3, noTop: true });
    litBox(G('mullion'), x0, b.h - 0.06, z0, x1, b.h, z1, { seg: 4, tile: 2 });   // the coping, flush: an overhang laps the next one at the corners
  },
  core(G, b, x0, z0, x1, z1){ litBox(G('paint'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 3 }); },
  /* A floor slab: concrete edge, carpet on top (the underside comes from
     the raised-box loop). The roof's top is the concrete it is. */
  slab(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8, noTop: true });
    litBox(G('carpet'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 2, noSides: true });
  },
  roofslab(G, b, x0, z0, x1, z1){ litBox(G('concrete'), x0, 0, z0, x1, b.h, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8 }); },
  /* A stair tread: concrete with a dark nosing along its top, flush. */
  tread(G, b, x0, z0, x1, z1){
    const n = 0.04;
    litBox(G('concrete'), x0, 0, z0, x1, b.h - n, z1, { seg: LIT.coverSeg, tile: 120, tileV: 8, noTop: true });
    litBox(G('nosing'), x0, b.h - n, z0, x1, b.h, z1, { seg: 2, tile: 1 });
  },
  rail(G, b, x0, z0, x1, z1){ litBox(G('nosing'), x0, 0, z0, x1, b.h, z1, { seg: 2, tile: 1 }); },
  /* A desk: a laminate top on a dark pedestal, flush with the box. */
  desk(G, b, x0, z0, x1, z1){
    const t = 0.04;
    litBox(G('carcass'), x0, 0, z0, x1, b.h - t, z1, { seg: LIT.coverSeg, tile: 2, noTop: true });
    litBox(G('desk'), x0, b.h - t, z0, x1, b.h, z1, { seg: 2, tile: 2 });
  },
  counter(G, b, x0, z0, x1, z1){
    const t = 0.05;
    litBox(G('render'), x0, 0, z0, x1, b.h - t, z1, { seg: LIT.coverSeg, tile: 3, noTop: true });
    litBox(G('desk'), x0, b.h - t, z0, x1, b.h, z1, { seg: 2, tile: 2 });
  },
  screen(G, b, x0, z0, x1, z1){ litBox(G('fabric'), x0, 0, z0, x1, b.h, z1, { seg: 2, tile: 1 }); },
  bench(G, b, x0, z0, x1, z1){ litBox(G('fabric'), x0, 0, z0, x1, b.h, z1, { bevel: 0.04, seg: 2, tile: 1 }); },
});

/* What a map's `props` become. None of it is collision — so nothing in here
   may be shaped like a floor. The hall used to have `gallery`, a steel deck
   with handrails drawn along each aisle at 5.7m, and it was the one thing in
   the room that looked walkable and was not. It is gone rather than fixed:
   a walkway you can stand on has to be a box standing on the floor, which is
   a solid mezzanine, and that is what the operating decks are. */
const LIT_PROP = {
  /* A LADDER (works.js): two rails and rungs every 0.3m in the plane 0.45m
     behind the climb line (toward the wall), running a metre past the top as
     handholds. A ladder on a tower draws itself (`draw: false`). */
  ladder(G, p){
    if (p.draw === false) return;
    const g = G('galv'), tx = -p.nz, tz = p.nx, bx = p.x - p.nx * 0.45, bz = p.z - p.nz * 0.45;
    for (const sd of [-0.25, 0.25])
      litCyl(g, bx + tx * sd, p.y0, bz + tz * sd, bx + tx * sd, p.y1 + 1.0, bz + tz * sd, 0.03, 0.03, 6, 1, false, true);
    for (let y = p.y0 + 0.3; y <= p.y1 + 0.01; y += 0.3)
      litCyl(g, bx - tx * 0.25, y, bz - tz * 0.25, bx + tx * 0.25, y, bz + tz * 0.25, 0.018, 0.018, 5, 1, false, false);
  },
  /* Recessed light panels in an office's ceilings (works.js): 1.2 x 0.6,
     on a 2.4m grid, 1cm under each slab's underside, kept out of the
     stairwells, the core and the lobby void (`holes`, per level). Unlit
     and not baked, as the hall's panels are: they show where the light
     comes from without adding a light. */
  ceilinglights(G, p){
    const g = G('lamp');
    p.levels.forEach((y, li) => {
      const holes = p.holes.concat(p.extra[li] || []);
      for (let x = p.x0 + 1.2; x + 0.6 <= p.x1 - 0.6; x += 2.4)
        for (let z = p.z0 + 1.2; z + 0.3 <= p.z1 - 0.6; z += 2.4){
          const a0 = x - 0.6, a1 = x + 0.6, b0 = z - 0.3, b1 = z + 0.3;
          if (holes.some(h => a1 > h[0] - 0.3 && a0 < h[1] + 0.3 && b1 > h[2] - 0.3 && b0 < h[3] + 0.3)) continue;
          litGrid(g, a0, y - 0.01, b0,  1,0,0,  0,0,1,  1.2, 0.6,  0,-1,0,  9, 9, 1, 1);
        }
    });
  },
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
      /* the first course has the doorway in it (p.door: east, at deck level) */
      if (i === 0 && p.door){ const hw = p.door.half / R(ya);
        litCylArc(G('towerskin'), x, z, ya, yb, R(ya), R(yb), 28, 6, p.door.a + hw, p.door.a - hw + Math.PI * 2, false); }
      else litCyl(G('towerskin'), x, ya, z, x, yb, z, R(ya), R(yb), 28, 6, false, false);
    }
    litCyl(G('concrete'), x, y1, z, x, y1 + 0.5, z, R(y1) + 0.22, R(y1) + 0.22, 28, 3, false, false);  // the cap ring
    /* Buttresses up the ring beam, on the staircase's own corners so they
       sit on the surface rather than hovering off it. */
    for (const e of litDrumSteps(rk, N)) for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const bx = x + sx * e[0], bz = z + sz * e[1];
      litCyl(G('concrete'), bx, bh, bz, bx, yk, bz, 0.3, 0.24, 5, 2, false, false);
    }
    /* The caged access ladder up the outside, as on every real shell (the
       KKP-URA photograph): it follows the curve from the ring beam to the
       lip, on the face toward the site. It starts at 5.6m, out of reach of
       the rim (2.6m plus a 2.7m climb), and nothing on it is a floor. */
    const lx = 0.36, lz = 0.93, tx = -lz, tz = lx, st = G('steel');
    /* It now starts on the basin rim (2.6) and goes up the ring beam, so it
       can be climbed (works.js LADDERS): below the beam's top the shell's
       radius is the beam's. */
    const Rl = (y) => y < yk ? rk : R(y);
    const at = (y, off, side) => { const r = Rl(y) + off; return [x + lx * r + tx * side, y, z + lz * r + tz * side]; };
    for (let y = bh; y < y1 - 0.01; y += 1.5){
      const yb = Math.min(y1 + 0.5, y + 1.5);
      for (const [off, side] of [[0.3, -0.3], [0.3, 0.3], [1.0, -0.38], [1.0, 0.38], [1.2, 0]]){
        const A = at(y, off, side), B = at(yb, off, side);
        litCyl(st, A[0], A[1], A[2], B[0], B[1], B[2], 0.035, 0.035, 4, 1, false, false);
      }
      for (let k = 0; k < 3; k++){ const yr = y + k * 0.5, A = at(yr, 0.3, -0.3), B = at(yr, 0.3, 0.3);   // rungs
        litCyl(st, A[0], A[1], A[2], B[0], B[1], B[2], 0.02, 0.02, 4, 1, false, false); }
    }
    if (p.rim) litTowerTop(G, p, R);
    /* Steam: soft billows rolling off the lip and drifting downwind. */
    litSteam(x, y1 + 0.6, z, R(y1), 'tower');
  },
  /* A PIPE RACK (stage 4): portal frames on the map's `column` legs, two
     runs of steel along the top, and four pipes on it - two lagged, one
     green cooling water, one bare steel. The pipes run past the frame's
     ends (px0..px1) into the tower shells. All of it at 6.6m and up. */
  piperack(G, p){
    const z = p.z, y = p.y, dz = 1.2;
    for (const s of [-1, 1]) litBox(G('girder'), p.x0, y, z + s * dz - 0.18, p.x1, y + 0.4, z + s * dz + 0.18, { seg: 4, tile: 2, bottom: true });
    for (const x of p.legs) litBox(G('girder'), x - 0.18, y, z - dz - 0.25, x + 0.18, y + 0.4, z + dz + 0.25, { seg: 3, tile: 2, bottom: true });
    for (const [o, r, mat] of [[-0.85, 0.36, 'lagging'], [-0.1, 0.26, 'loomg'], [0.55, 0.30, 'lagging'], [1.05, 0.16, 'steel']])
      litCyl(G(mat), p.px0, y + 0.4 + r, z + o, p.px1, y + 0.4 + r, z + o, r, r, 14, 2, true, true);
  },
  /* A PIPE BRIDGE over the road (stage 4): three lagged steam lines leave
     the boiler house at 9.5m, cross to the hall and enter its wall, with a
     light truss under them; on the boiler house they rise up the face to
     `rise`, where they turn back in. Overhead from end to end. */
  pipebridge(G, p){
    const y = p.y, r = 0.32;
    for (const i of [-1, 0, 1]){ const x = p.x + i * 1.1;
      litCyl(G('lagging'), x, y, p.z0 + 0.5, x, y, p.z1, r, r, 14, 2, false, false);               // across the road
      litCyl(G('lagging'), x, y - r, p.z0 + 0.5, x, p.rise, p.z0 + 0.5, r, r, 14, 2, false, false);   // up the boiler house
      litCyl(G('lagging'), x, p.rise, p.z0 + 0.5, x, p.rise, p.z0, r, r, 14, 2, false, false);     // and back into it
      for (const zz of [p.z0 + 0.5, p.z1 - 0.15]) litCyl(G('steel'), x, y - 0.42, zz, x, y + 0.42, zz, r + 0.06, r + 0.06, 14, 1, true, true);   // collars
    }
    for (const s of [-1, 1]) litBox(G('galv'), p.x + s * 1.75 - 0.08, y - 0.75, p.z0, p.x + s * 1.75 + 0.08, y - 0.45, p.z1, { seg: 3, tile: 2, bottom: true });
    for (let zz = p.z0 + 1; zz < p.z1; zz += 2) litBox(G('galv'), p.x - 1.85, y - 0.75, zz - 0.06, p.x + 1.85, y - 0.6, zz + 0.06, { seg: 3, tile: 2, bottom: true });
  },
  /* The flue: a rectangular duct from the boiler house to the stack, ribbed
     with stiffener frames. 16-20m up. */
  flue(G, p){
    const z0 = p.z - p.w / 2, z1 = p.z + p.w / 2;
    litBox(G('cladding'), p.x0, p.y0, z0, p.x1, p.y1, z1, { seg: 3, tile: 3.2, tileV: 3.2, bottom: true });
    for (let x = p.x0 + 1.5; x < p.x1; x += 2.2)
      litBox(G('girder'), x - 0.12, p.y0 - 0.12, z0 - 0.12, x + 0.12, p.y1 + 0.12, z1 + 0.12, { seg: 3, tile: 2, bottom: true });
  },
  /* The stack. Its collision is 68m of boxes, so the drawn surface simply
     follows them: a straight shell in aviation bands, a cap, and the
     platforms a real one carries. No taper, deliberately - a taper would
     have to be matched band for band in the collision and buys nothing you
     can see from the ground. */
  stack(G, p, D, H){
    /* HOLLOW (works.js "THE STACK"): a ring wall r..ri, drawn as 36 flat
       pieces to match the 36 boxes, outside and in, with the west doorways
       (`doors`: [deg0, deg1, y0, y1]) left open and their jambs, heads and
       sills closed. Open to the sky at the top - look up from inside. */
    const x = p.x, z = p.z, ro = p.r, ri = p.ri || p.r - 0.5, h = p.h, doors = p.doors || [];
    const tex = G('stackband'), inner = G('concrete');
    const P = (r, a) => [x + r * Math.cos(a), z + r * Math.sin(a)];
    const quad = (g, A, B, y0, y1, out, tv) => {                    // a vertical panel from A to B, facing in or out
      let a = A, b = B; const mx = (A[0] + B[0]) / 2 - x, mz = (A[1] + B[1]) / 2 - z;
      let ux = b[0] - a[0], uz = b[1] - a[1]; const L = Math.hypot(ux, uz); ux /= L; uz /= L;
      const nIn = (-uz) * mx + ux * mz < 0;                           // u x up points inward?
      if (nIn === out){ a = B; b = A; ux = -ux; uz = -uz; }
      const ml = Math.hypot(mx, mz) || 1, s = out ? 1 : -1;
      litGrid(g, a[0], y0, a[1], ux, 0, uz, 0, 1, 0, L, y1 - y0, s * mx / ml, 0, s * mz / ml, 2, 4, 1, tv, 0, y0);
    };
    /* A curved panel of the ring, with a RADIAL normal at each corner so
       the shading sweeps round like a cylinder's instead of striping per
       panel. Winding: (v0,v2,v1),(v1,v2,v3) faces out, the reverse in. */
    const panel = (g, a0, a1, r, y0, y1, out, tv) => {
      const b = g.p.length / 3, s = out ? 1 : -1, round = 2 * Math.PI * r;
      for (const [a, y] of [[a0, y0], [a1, y0], [a0, y1], [a1, y1]]){
        const c = Math.cos(a), sn = Math.sin(a);
        g.p.push(x + r * c, y, z + r * sn); g.n.push(s * c, 0, s * sn); g.uv.push(a / (2 * Math.PI) * round / 3, y / tv);
      }
      if (out) g.i.push(b, b + 2, b + 1,  b + 1, b + 2, b + 3); else g.i.push(b, b + 1, b + 2,  b + 1, b + 3, b + 2);
    };
    const spans = (deg) => {                                          // the y ranges of wall at this sector
      const ds = doors.filter(d => deg > d[0] && deg < d[1]).sort((a, b) => a[2] - b[2]);
      const out = []; let y = 0;
      for (const d of ds){ if (d[2] > y) out.push([y, d[2]]); y = Math.max(y, d[3]); }
      if (y < h) out.push([y, h]); return out;
    };
    for (let i = 0; i < 36; i++){
      const a0 = i * Math.PI / 18, a1 = (i + 1) * Math.PI / 18, deg = i * 10 + 5;
      for (const [y0, y1] of spans(deg)){
        panel(tex, a0, a1, ro, y0, y1, true, h);
        panel(inner, a0, a1, ri, y0, y1, false, 3);
        if (y1 < h){ const A = P(ri, a0), B = P(ro, a1);                  // the head over a doorway: underside
          litGrid(inner, Math.min(A[0], B[0]), y1, Math.min(A[1], B[1]), 1,0,0, 0,0,1, Math.abs(B[0] - A[0]) || 0.01, Math.abs(B[1] - A[1]) || 0.01, 0,-1,0, 2, 2, 1, 1); }
        if (y0 > 0){ const A = P(ri, a0), B = P(ro, a1);                  // and the sill: top
          litGrid(inner, Math.min(A[0], B[0]), y0, Math.min(A[1], B[1]), 0,0,1, 1,0,0, Math.abs(B[1] - A[1]) || 0.01, Math.abs(B[0] - A[0]) || 0.01, 0,1,0, 2, 2, 1, 1); }
      }
      { const A = P(ri, a0), B = P(ro, a1);                             // the rim at the top
        litGrid(inner, Math.min(A[0], B[0]), h, Math.min(A[1], B[1]), 0,0,1, 1,0,0, Math.abs(B[1] - A[1]) || 0.01, Math.abs(B[0] - A[0]) || 0.01, 0,1,0, 2, 2, 1, 1); }
    }
    for (const d of doors) for (const deg of [d[0], d[1]]){               // jambs: the wall's thickness at each side of a door
      const a = deg * Math.PI / 180, A = P(ri, a), B = P(ro, a), sgn = deg === d[0] ? -1 : 1;
      const tnx = -Math.sin(a) * sgn, tnz = Math.cos(a) * sgn;            // facing into the doorway
      const ux = B[0] - A[0], uz = B[1] - A[1], L = Math.hypot(ux, uz);
      const cr = (-uz) * tnx + ux * tnz > 0;                              // u x up along the facing?
      const o = cr ? A : B, uu = cr ? [ux / L, uz / L] : [-ux / L, -uz / L];
      litGrid(inner, o[0], d[2], o[1], uu[0], 0, uu[1], 0, 1, 0, L, d[3] - d[2], tnx, 0, tnz, 2, 2, 1, 1, 0, d[2]);
    }
    for (let y = 12; y < h - 6; y += 13)                                  // maintenance platforms: a ring, not a disc
      litCyl(G('girder'), x, y, z, x, y + 0.22, z, ro + 0.85, ro + 0.85, 24, 2, false, false);
    litCyl(G('steel'), x, h, z, x, h + 0.6, z, ro + 0.15, ro + 0.15, 24, 1, false, false);   // the cap
    litSteam(x, h + 0.8, z, ro * 0.85, 'stack');
  },
  /* A PORTAL GANTRY across the yard, and the conductors it carries. The
     beam is a lattice box girder at `y`; the lines sag from it in a
     catenary, which is drawn as a chain of straight segments because that
     is what a cylinder can be. All of it is overhead and none of it is
     collision - the legs under it are boxes in the map. */
  gantry(G, p, D, H){
    const z = p.z, y = p.y || 12, x0 = p.x0, x1 = p.x1;
    litBox(G('galv'), x0, y, z - 0.9, x1, y + 1.5, z + 0.9, { seg: 5, tile: 2, bottom: true });
    for (let x = x0 + 2; x < x1 - 1; x += 4){        // the beam's own bracing
      litCyl(G('galv'), x, y, z - 0.9, x + 2, y + 1.5, z - 0.9, 0.07, 0.07, 4, 1, false, false);
      litCyl(G('galv'), x, y + 1.5, z + 0.9, x + 2, y, z + 0.9, 0.07, 0.07, 4, 1, false, false);
    }
    /* Three phases, hanging from strings, sagging to the next gantry. */
    for (const o of [-1, 0, 1]){
      const px = (x0 + x1) / 2 + o * (x1 - x0) * 0.3;
      for (let j = 0; j < 5; j++)
        litCyl(G('hvwhite'), px, y - 0.1 - j * 0.18, z, px, y - 0.16 - j * 0.18, z, 0.16, 0.16, 8, 1, true, true);
    }
    if (p.to == null) return;
    const sag = p.sag || 2.6, za = z, zb = p.to, segs = 9, yTop = y - 1.1;
    for (const o of [-1, 0, 1]){
      const px = (x0 + x1) / 2 + o * (x1 - x0) * 0.3;
      for (let i = 0; i < segs; i++){
        const t0 = i / segs, t1 = (i + 1) / segs;
        const yy = (t) => yTop - sag * 4 * t * (1 - t);
        litCyl(G('steel'), px, yy(t0), za + (zb - za) * t0,
                           px, yy(t1), za + (zb - za) * t1, 0.055, 0.055, 6, 1, false, false);
      }
    }
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
    /* ...and from INSIDE the hall, the same strips as glowing glazing in
       the ceiling: the light the bake now lets through them has to come
       from somewhere you can see (2026-11-22). */
    for (const x of litRooflights(p)) litGrid(G('sky'), x, ry - 0.02, z0 + 3, 0,0,1, 1,0,0, (z1 - z0) - 6, 5, 0,-1,0, 99, 99, 1, 1);
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
   THE CLUTTER KIT (2026-11-22)
   Jack asked for the first item of the Saltline comparison: "clutter and
   wear". Saltline's port is 7.7 loose objects per 100 m2, about half of
   them turned off the grid; the works was 0.4 and none. A real site is
   full of the things people bring to it and leave: drums on pallets,
   chemical totes, cable drums, gas bottles in a cage, jersey barriers, a
   skip, a van, a forklift, a site cabin. These draw them.

   Each is a map box of its own kind (works.js `kit`), so it is cover with
   real collision. A box may be TURNED (`ry`): it is drawn about its own
   footprint (`fw` x `fd`) and rotated, and its collision is the footprint's
   bounding box - a few centimetres generous at the corners, never short.
   Every drawer works in the footprint's frame, long side along Z unless
   said otherwise, and never draws below 0 or a collision face above b.h.
   --------------------------------------------------------------------- */
const LIT_KIT_COLOURS = ['drumblue', 'drumred', 'drumgrey', 'drumblue', 'drumgreen'];
const litHash = (b) => Math.abs(Math.round(b.x * 7.3 + b.z * 13.1));
/* A drum: rolling hoops, a top with its two bungs. */
function litDrum(G, mat, cx, y0, cz, r, h){
  litCyl(G(mat), cx, y0, cz, cx, y0 + h, cz, r, r, 16, 1.2, false, true);
  for (const f of [0.33, 0.66]) litCyl(G(mat), cx, y0 + h * f - 0.012, cz, cx, y0 + h * f + 0.012, cz, r + 0.012, r + 0.012, 16, 1, false, false);
  litCyl(G('steel'), cx, y0 + h - 0.01, cz, cx, y0 + h + 0.008, cz, r + 0.006, r + 0.006, 16, 1, false, false);    // the chime
  litCyl(G('steel'), cx + r * 0.55, y0 + h, cz, cx + r * 0.55, y0 + h + 0.018, cz, 0.03, 0.03, 8, 1, false, true);
  litCyl(G('steel'), cx - r * 0.6, y0 + h, cz + r * 0.1, cx - r * 0.6, y0 + h + 0.012, cz + r * 0.1, 0.02, 0.02, 8, 1, false, true);
}
/* A wooden pallet: three runners, deck boards over them. 0.144 tall. */
function litPallet(G, x0, y0, z0, x1, z1){
  const w = x1 - x0;
  for (const f of [0.04, 0.5, 0.96]){ const x = x0 + w * f; litBox(G('pallet'), x - 0.05, y0, z0, x + 0.05, y0 + 0.1, z1, { seg: 2, tile: 1 }); }
  const n = 7, d = z1 - z0;
  for (let i = 0; i < n; i++){ const z = z0 + d * (i + 0.5) / n; litBox(G('pallet'), x0, y0 + 0.1, z - 0.05, x1, y0 + 0.144, z + 0.05, { seg: 2, tile: 1 }); }
}
const LIT_KIT = {
  drum(G, b, x0, z0, x1, z1){
    litDrum(G, LIT_KIT_COLOURS[litHash(b) % LIT_KIT_COLOURS.length], (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.min(x1 - x0, z1 - z0) / 2 - 0.01, b.h - 0.02);
  },
  /* four drums on a pallet, strapped */
  drums4(G, b, x0, z0, x1, z1){
    litPallet(G, x0, 0, z0, x1, z1);
    const mat = LIT_KIT_COLOURS[litHash(b) % LIT_KIT_COLOURS.length], r = (x1 - x0) / 4 - 0.015, h = b.h - 0.17;
    for (const fx of [0.25, 0.75]) for (const fz of [0.25, 0.75]) litDrum(G, mat, x0 + (x1 - x0) * fx, 0.144, z0 + (z1 - z0) * fz, r, h);
    litCyl(G('cable'), x0 + 0.02, 0.144 + h * 0.5, (z0 + z1) / 2, x1 - 0.02, 0.144 + h * 0.5, (z0 + z1) / 2, 0.012, 0.012, 4, 1, false, false);
  },
  /* an IBC: a white bottle in a galvanised cage on a steel pallet */
  ibc(G, b, x0, z0, x1, z1){
    const h = b.h;
    litBox(G('galv'), x0, 0, z0, x1, 0.14, z1, { seg: 2, tile: 1 });
    litBox(G('hdpe'), x0 + 0.05, 0.14, z0 + 0.05, x1 - 0.05, h - 0.06, z1 - 0.05, { bevel: 0.06, seg: 2, tile: 1 });
    for (let k = 0; k <= 5; k++){                                             // the cage's uprights round the sides
      const fx = k / 5;
      for (const z of [z0 + 0.03, z1 - 0.03]) litBox(G('galv'), x0 + (x1 - x0) * fx - 0.012, 0.14, z - 0.012, x0 + (x1 - x0) * fx + 0.012, h - 0.02, z + 0.012, { seg: 2, tile: 1 });
      for (const x of [x0 + 0.03, x1 - 0.03]) litBox(G('galv'), x - 0.012, 0.14, z0 + (z1 - z0) * fx - 0.012, x + 0.012, h - 0.02, z0 + (z1 - z0) * fx + 0.012, { seg: 2, tile: 1 });
    }
    for (const y of [0.45, 0.75, h - 0.04]){                                  // and its rails
      litBox(G('galv'), x0 + 0.02, y - 0.012, z0 + 0.02, x1 - 0.02, y + 0.012, z0 + 0.045, { seg: 3, tile: 1 });
      litBox(G('galv'), x0 + 0.02, y - 0.012, z1 - 0.045, x1 - 0.02, y + 0.012, z1 - 0.02, { seg: 3, tile: 1 });
      litBox(G('galv'), x0 + 0.02, y - 0.012, z0 + 0.02, x0 + 0.045, y + 0.012, z1 - 0.02, { seg: 3, tile: 1 });
      litBox(G('galv'), x1 - 0.045, y - 0.012, z0 + 0.02, x1 - 0.02, y + 0.012, z1 - 0.02, { seg: 3, tile: 1 });
    }
    const cx = (x0 + x1) / 2;
    litCyl(G('drumgrey'), cx, h - 0.06, (z0 + z1) / 2, cx, h + 0.0, (z0 + z1) / 2, 0.075, 0.075, 12, 1, false, true);      // the filler cap
    litCyl(G('drumgrey'), cx, 0.22, z1 - 0.04, cx, 0.22, z1 + 0.06, 0.04, 0.04, 8, 1, false, true);                       // the valve
  },
  /* a jersey barrier: wide foot, sloping face, narrow top, lifting slots */
  barrier(G, b, x0, z0, x1, z1){
    const cz = (z0 + z1) / 2, d = z1 - z0;
    litBox(G('concrete'), x0, 0, z0, x1, 0.26, z1, { bevel: 0.02, seg: 2, tile: 2 });
    litBox(G('concrete'), x0, 0.26, cz - d * 0.36, x1, 0.46, cz + d * 0.36, { bevel: 0.03, seg: 2, tile: 2 });
    litBox(G('concrete'), x0, 0.46, cz - d * 0.2, x1, b.h, cz + d * 0.2, { bevel: 0.03, seg: 2, tile: 2 });
    for (const f of [0.2, 0.8]) litBox(G('cable'), x0 + (x1 - x0) * f - 0.12, 0, cz - d / 2 - 0.002, x0 + (x1 - x0) * f + 0.12, 0.08, cz + d / 2 + 0.002, { seg: 2, tile: 1 });
  },
  /* a stack of empty pallets, each a little off true */
  pallets(G, b, x0, z0, x1, z1){
    const n = Math.max(1, Math.round(b.h / 0.144)), r = litRand(litHash(b) + 3);
    for (let i = 0; i < n; i++){ const ox = (r() - 0.5) * 0.06, oz = (r() - 0.5) * 0.06;
      litPallet(G, x0 + 0.03 + ox, i * 0.144, z0 + 0.03 + oz, x1 - 0.03 + ox, z1 - 0.03 + oz); }
  },
  /* a pallet of boxed stock, shrink-wrapped, two straps */
  palletload(G, b, x0, z0, x1, z1){
    litPallet(G, x0, 0, z0, x1, z1);
    litBox(G('cardboard'), x0 + 0.03, 0.144, z0 + 0.03, x1 - 0.03, b.h - 0.01, z1 - 0.03, { bevel: 0.015, seg: 2, tile: 0.6 });
    litBox(G('wrap'), x0 + 0.02, 0.18, z0 + 0.02, x1 - 0.02, b.h, z1 - 0.02, { bevel: 0.03, seg: 2, tile: 1 });
    for (const f of [0.3, 0.7]){ const z = z0 + (z1 - z0) * f;
      litBox(G('cable'), x0 + 0.015, 0.144, z - 0.018, x1 - 0.015, b.h + 0.005, z + 0.018, { seg: 2, tile: 1, noTop: false }); }
  },
  /* a gas bottle cage: galvanised frame and mesh, a roof sheet, bottles inside */
  gascage(G, b, x0, z0, x1, z1){
    const h = b.h, cx = (x0 + x1) / 2;
    litBox(G('concrete'), x0, 0, z0, x1, 0.1, z1, { seg: 2, tile: 2 });
    for (const x of [x0 + 0.03, x1 - 0.03]) for (const z of [z0 + 0.03, z1 - 0.03])
      litBox(G('galv'), x - 0.025, 0.1, z - 0.025, x + 0.025, h - 0.05, z + 0.025, { seg: 2, tile: 1 });
    litBox(G('galv'), x0 - 0.04, h - 0.05, z0 - 0.04, x1 + 0.04, h, z1 + 0.04, { seg: 2, tile: 1 });
    for (let k = 1; k < 12; k++){ const x = x0 + (x1 - x0) * k / 12;                         // mesh on the back and the ends
      litBox(G('galv'), x - 0.006, 0.1, z0 + 0.02, x + 0.006, h - 0.05, z0 + 0.032, { seg: 2, tile: 1 }); }
    for (let y = 0.3; y < h - 0.1; y += 0.3) litBox(G('galv'), x0, y - 0.01, z0 + 0.015, x1, y + 0.01, z0 + 0.035, { seg: 2, tile: 1 });
    const cols = ['bottlemaroon', 'bottleblack', 'bottlemaroon', 'bottlegrey', 'bottleblack'];
    for (let i = 0; i < 5; i++){ const x = x0 + 0.15 + i * (x1 - x0 - 0.3) / 4, z = (z0 + z1) / 2 - 0.05, top = 0.1 + 1.35;
      litCyl(G(cols[i]), x, 0.1, z, x, top, z, 0.11, 0.11, 12, 1, false, false);
      litCyl(G(cols[i]), x, top, z, x, top + 0.12, z, 0.11, 0.05, 12, 1, false, true);
      litCyl(G('brasskit'), x, top + 0.12, z, x, top + 0.2, z, 0.03, 0.03, 8, 1, false, true); }
    litBox(G('galv'), x0, 0.9, z1 - 0.04, x1, 0.94, z1 - 0.01, { seg: 2, tile: 1 });             // the chain across the front
  },
  /* a cable drum on its side: two wooden flanges, black cable wound on.
     Axle along X. */
  reel(G, b, x0, z0, x1, z1){
    const R = b.h / 2, cz = (z0 + z1) / 2, y = R;
    for (const x of [x0 + 0.03, x1 - 0.03]) litCyl(G('pallet'), x - 0.03, y, cz, x + 0.03, y, cz, R, R, 18, 1, true, true);
    litCyl(G('cable'), x0 + 0.06, y, cz, x1 - 0.06, y, cz, R * 0.72, R * 0.72, 18, 1, false, false);
    litCyl(G('pallet'), x0 - 0.02, y, cz, x1 + 0.02, y, cz, 0.08, 0.08, 10, 1, true, true);
    litCyl(G('cable'), x1 - 0.2, y + R * 0.7, cz, x1 - 0.2, 0.02, cz + R * 0.9, 0.035, 0.035, 6, 1, false, false);   // a tail off it
  },
  /* a builder's skip: tapered steel body, the lifting lugs, rubble in it.
     Long side along Z. */
  skip(G, b, x0, z0, x1, z1){
    const h = b.h, cx = (x0 + x1) / 2, w = x1 - x0;
    const tiers = 4;
    for (let i = 0; i < tiers; i++){                    // narrower at the floor: a skip's ends rake out
      const y0 = h * i / tiers, y1 = h * (i + 1) / tiers, inset = (1 - (i + 1) / tiers) * 0.45;
      litBox(G('skip'), x0, y0, z0 + inset, x1, y1, z1 - inset, { seg: 2, tile: 2, noTop: i < tiers - 1 });
    }
    litBox(G('rubble'), x0 + 0.08, h - 0.25, z0 + 0.12, x1 - 0.08, h - 0.02, z1 - 0.12, { seg: 2, tile: 2 });
    for (const z of [z0 + 0.9, z1 - 0.9]) for (const x of [x0 - 0.06, x1 + 0.01])
      litBox(G('skip'), x, h * 0.55, z - 0.1, x + 0.05, h * 0.85, z + 0.1, { seg: 1, tile: 1 });
    litBox(G('skip'), x0 + 0.05, h, z0 + 0.02, x1 - 0.05, h + 0.04, z0 + 0.08, { seg: 2, tile: 1 });
    litBox(G('skip'), x0 + 0.05, h, z1 - 0.08, x1 - 0.05, h + 0.04, z1 - 0.02, { seg: 2, tile: 1 });
  },
  /* a panel van: box body, sloped cab at the -Z end, glass, four wheels,
     the works' crimson stripe. Long side along Z. */
  van(G, b, x0, z0, x1, z1){
    const h = b.h, cx = (x0 + x1) / 2, w = x1 - x0, L = z1 - z0, wr = 0.34;
    litBox(G('vanwhite'), x0, 0.36, z0 + 1.05, x1, h, z1, { bevel: 0.1, seg: 2, tile: 3 });          // the load box
    litBox(G('vanwhite'), x0, 0.36, z0 + 0.05, x1, 1.15, z0 + 1.1, { bevel: 0.1, seg: 2, tile: 3 });  // the bonnet
    litBox(G('vanwhite'), x0 + 0.03, 1.15, z0 + 0.55, x1 - 0.03, h - 0.12, z0 + 1.1, { bevel: 0.08, seg: 2, tile: 3 });
    litBox(G('glass'), x0 + 0.1, 1.2, z0 + 0.52, x1 - 0.1, h - 0.2, z0 + 0.6, { seg: 2, tile: 3 });   // the windscreen
    for (const x of [x0 - 0.005, x1 - 0.005]) litBox(G('glass'), x, 1.25, z0 + 0.7, x + 0.01, h - 0.25, z0 + 1.6, { seg: 2, tile: 3 });   // door windows
    litBox(G('vanstripe'), x0 - 0.004, 0.95, z0 + 1.7, x1 + 0.004, 1.12, z1 - 0.2, { seg: 2, tile: 3 });
    litBox(G('cable'), x0 - 0.01, 0.3, z0 + 0.02, x1 + 0.01, 0.55, z0 + 0.12, { seg: 2, tile: 1 });   // the front bumper
    litBox(G('cable'), x0 - 0.01, 0.3, z1 - 0.1, x1 + 0.01, 0.5, z1 + 0.01, { seg: 2, tile: 1 });
    for (const x of [x0 + 0.25, x1 - 0.25]) litBox(G('white'), x - 0.15, 0.78, z0 + 0.04, x + 0.15, 0.9, z0 + 0.06, { seg: 1, tile: 1 });   // headlamps, off
    for (const z of [z0 + 0.8, z1 - 0.85]) for (const [xa, xb] of [[x0 - 0.02, x0 + 0.24], [x1 - 0.24, x1 + 0.02]]){
      litCyl(G('tyre'), xa, wr, z, xb, wr, z, wr, wr, 16, 1, true, true);
      litCyl(G('steel'), xa - 0.005, wr, z, xb + 0.005, wr, z, wr * 0.5, wr * 0.5, 12, 1, true, true);
    }
  },
  /* a counterbalance forklift: body and counterweight, the overhead guard,
     the mast and forks at the -Z end. Long side along Z. */
  forklift(G, b, x0, z0, x1, z1){
    const h = b.h, cx = (x0 + x1) / 2, wr = 0.3;
    litBox(G('forkyellow'), x0 + 0.05, 0.25, z0 + 0.7, x1 - 0.05, 1.05, z1 - 0.1, { bevel: 0.06, seg: 2, tile: 2 });
    litBox(G('cable'), x0 + 0.08, 0.3, z1 - 0.45, x1 - 0.08, 1.2, z1, { bevel: 0.08, seg: 2, tile: 2 });   // counterweight
    for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [z0 + 0.85, z1 - 0.5])
      litBox(G('cable'), x - 0.03, 1.05, z - 0.03, x + 0.03, h - 0.06, z + 0.03, { seg: 2, tile: 1 });
    litBox(G('cable'), x0 + 0.05, h - 0.06, z0 + 0.8, x1 - 0.05, h, z1 - 0.45, { seg: 2, tile: 1 });       // the guard's roof
    litBox(G('cable'), cx - 0.25, 1.05, z1 - 1.05, cx + 0.25, 1.25, z1 - 0.65, { bevel: 0.04, seg: 2, tile: 1 });   // seat
    for (const x of [cx - 0.3, cx + 0.3]) litBox(G('steel'), x - 0.05, 0.1, z0 + 0.5, x + 0.05, h + 0.05, z0 + 0.6, { seg: 2, tile: 1 });   // mast
    litBox(G('steel'), cx - 0.4, 0.15, z0 + 0.45, cx + 0.4, 0.45, z0 + 0.5, { seg: 2, tile: 1 });          // carriage
    for (const x of [cx - 0.25, cx + 0.25]) litBox(G('steel'), x - 0.05, 0.06, z0, x + 0.05, 0.11, z0 + 0.5, { seg: 2, tile: 1 });   // forks
    for (const z of [z0 + 0.85, z1 - 0.45]) for (const [xa, xb] of [[x0, x0 + 0.22], [x1 - 0.22, x1]])
      litCyl(G('tyre'), xa, wr, z, xb, wr, z, wr, wr, 14, 1, true, true);
  },
  /* a roller tool cabinet: drawers, a tray top, a push handle */
  toolcart(G, b, x0, z0, x1, z1){
    const h = b.h;
    litBox(G('firered'), x0, 0.1, z0, x1, h - 0.06, z1, { bevel: 0.015, seg: 2, tile: 1 });
    for (let i = 0; i < 5; i++){ const y = 0.2 + i * (h - 0.4) / 5;
      litBox(G('steel'), x1 - 0.002, y + 0.06, z0 + 0.12, x1 + 0.012, y + 0.08, z1 - 0.12, { seg: 1, tile: 1 }); }   // drawer handles
    litBox(G('cable'), x0 - 0.01, h - 0.06, z0 - 0.01, x1 + 0.01, h, z1 + 0.01, { seg: 2, tile: 1 });
    litBox(G('steel'), x0 + 0.05, h - 0.02, z1 + 0.02, x1 - 0.05, h + 0.02, z1 + 0.06, { seg: 1, tile: 1 });
    for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06])
      litCyl(G('tyre'), x, 0.05, z - 0.02, x, 0.05, z + 0.02, 0.05, 0.05, 8, 1, true, true);
  },
  /* a wheelie bin */
  bin(G, b, x0, z0, x1, z1){
    const h = b.h, m = litHash(b) % 2 ? 'bingreen' : 'drumgrey';
    litBox(G(m), x0 + 0.04, 0.08, z0 + 0.06, x1 - 0.04, h - 0.06, z1, { bevel: 0.03, seg: 2, tile: 1 });
    litBox(G(m), x0, h - 0.06, z0, x1, h, z1 + 0.02, { bevel: 0.015, seg: 2, tile: 1 });
    for (const x of [x0 + 0.03, x1 - 0.1]) litCyl(G('tyre'), x, 0.1, z1 - 0.08, x + 0.07, 0.1, z1 - 0.08, 0.1, 0.1, 10, 1, true, true);
  },
  /* a generator set: a sound-proofed canopy on a skid, an exhaust stack */
  gen(G, b, x0, z0, x1, z1){
    const h = b.h, cx = (x0 + x1) / 2;
    litBox(G('steel'), x0, 0, z0, x1, 0.15, z1, { seg: 2, tile: 1 });
    litBox(G('gengreen'), x0 + 0.04, 0.15, z0 + 0.04, x1 - 0.04, h, z1 - 0.04, { bevel: 0.04, seg: 2, tile: 2 });
    for (let i = 0; i < 6; i++){ const z = z0 + 0.4 + i * 0.12; litBox(G('cable'), x1 - 0.045, 0.6, z, x1 - 0.03, h - 0.25, z + 0.06, { seg: 1, tile: 1 }); }   // louvres
    litCyl(G('steel'), cx, h, z1 - 0.35, cx, h + 0.35, z1 - 0.35, 0.06, 0.06, 8, 1, false, true);
  },
  /* a portable site cabin: ribbed steel, a window band, a door, steps, skids.
     Long side along Z. */
  cabin(G, b, x0, z0, x1, z1){
    const h = b.h;
    for (const x of [x0 + 0.2, x1 - 0.2]) litBox(G('steel'), x - 0.08, 0, z0, x + 0.08, 0.18, z1, { seg: 2, tile: 1 });
    litBox(G('cladding'), x0, 0.18, z0, x1, h, z1, { bevel: 0.04, seg: 2, tile: 3.2, tileV: 3.2 });
    litBox(G('glass'), x1 - 0.002, 1.2, z0 + 0.6, x1 + 0.012, 1.9, z0 + 2.6, { seg: 2, tile: 3 });
    litBox(G('glass'), x1 - 0.002, 1.2, z1 - 1.6, x1 + 0.012, 1.9, z1 - 0.6, { seg: 2, tile: 3 });
    litBox(G('nosing'), x1 - 0.002, 0.2, z0 + 3.0, x1 + 0.014, 2.25, z0 + 3.9, { seg: 2, tile: 3 });   // the door
    litBox(G('galv'), x1, 0, z0 + 2.95, x1 + 0.5, 0.18, z0 + 3.95, { seg: 2, tile: 1 });                 // its step
  },
  /* a mobile lighting tower: a trailer base, a mast, four lamp heads */
  lighttower(G, b, x0, z0, x1, z1){
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, mast = 7.0;
    litBox(G('forkyellow'), x0 + 0.05, 0.35, z0 + 0.1, x1 - 0.05, b.h, z1 - 0.1, { bevel: 0.04, seg: 2, tile: 2 });
    for (const x of [x0, x1 - 0.16]) litCyl(G('tyre'), x, 0.3, cz, x + 0.16, 0.3, cz, 0.3, 0.3, 12, 1, true, true);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])                    // outriggers
      litBox(G('steel'), cx + dx * 0.9 - 0.05, 0, cz + dz * 1.2 - 0.05, cx + dx * 0.9 + 0.05, 0.4, cz + dz * 1.2 + 0.05, { seg: 1, tile: 1 });
    litCyl(G('steel'), cx, b.h, cz, cx, mast, cz, 0.07, 0.05, 8, 1, false, true);
    litBox(G('steel'), cx - 0.8, mast - 0.05, cz - 0.05, cx + 0.8, mast + 0.05, cz + 0.05, { seg: 2, tile: 1 });
    for (const dx of [-0.6, -0.2, 0.2, 0.6]){
      litBox(G('cable'), cx + dx - 0.16, mast + 0.05, cz - 0.08, cx + dx + 0.16, mast + 0.35, cz + 0.08, { seg: 1, tile: 1 });
      litBox(G('lamp'), cx + dx - 0.13, mast + 0.08, cz - 0.085, cx + dx + 0.13, mast + 0.32, cz - 0.08, { seg: 1, tile: 1 });
    }
  },
};
Object.assign(LIT_DRAW, LIT_KIT);
LIT_PROP.boiler = litBoiler;          // the furnaces (THE BOILERS)
/* High-bay lamps: a hall's real lighting, a spun reflector on a drop rod
   with the lamp glowing in its mouth. They are lights in the bake
   (litPanelLights), and these are what you see of them. */
/* ---- THE SWITCHYARD (2026-11-22) ----
   Jack: "why does this look so empty, where are the wires on top". The
   ground gear are boxes (works.js THE SWITCHYARD); everything overhead is
   the `switchyard` prop and is not collision. */
const HVT_ARMS = [[0.62, 5.2], [0.78, 4.4], [0.92, 3.2]];   // a transmission tower's crossarms: height share, reach (hvtower)
Object.assign(LIT_DRAW, {
  palisade(){},                                  // the fence: drawn by the switchyard prop, as a cut-out
  /* A three-pole circuit breaker on a common frame: plinth, the mechanism
     cabinet, the galvanised support on it - that is the box - and one
     pole per phase along z: a porcelain column with the interrupter head. */
  breaker(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0, 0, z0, x1, 0.3, z1, { seg: 2, tile: 120, tileV: 8 });
    litBox(G('machine'), x0, 0.3, z0, x1, 1.6, z1, { bevel: 0.04, seg: LIT.coverSeg, tile: 2 });
    litBox(G('girder'), x0, 1.6, z0, x1, b.h, z1, { bevel: 0.03, seg: LIT.coverSeg, tile: 1.6 });
    for (const o of [-1, 0, 1]){
      const pz = b.z + o * (b.d / 2 - 0.3), cx = b.x, y = b.h;
      litCyl(G('hvwhite'), cx, y, pz, cx, y + 1.45, pz, 0.15, 0.12, 10, 1.4, false, false);
      for (let j = 0; j < 6; j++){ const yy = y + 0.12 + j * 0.22, r = 0.27 - j * 0.012;
        litCyl(G('hvwhite'), cx, yy, pz, cx, yy + 0.06, pz, r, r * 0.7, 10, 1, true, true); }
      litCyl(G('girder'), cx - 0.55, y + 1.6, pz, cx + 0.55, y + 1.6, pz, 0.17, 0.17, 12, 1, true, true);   // the interrupter
      for (const s of [-1, 1]) litBox(G('girder'), cx + s * 0.55 - 0.06, y + 1.72, pz - 0.06, cx + s * 0.55 + 0.06, y + 1.82, pz + 0.06, { seg: 1 });
    }
  },
  /* A disconnector: a galvanised post (the box) and on it two porcelain
     columns with the blade across their tops. */
  hviso(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, 0.25, z1 + 0.1, { seg: 1, tile: 120, tileV: 8 });
    litBox(G('girder'), x0, 0.25, z0, x1, b.h, z1, { bevel: 0.02, seg: 2, tile: 1.6 });
    const y = b.h, cx = b.x, cz = b.z;
    litBox(G('girder'), cx - 0.6, y, cz - 0.1, cx + 0.6, y + 0.12, cz + 0.1, { seg: 1 });
    for (const s of [-1, 1]){
      const px = cx + s * 0.45;
      litCyl(G('hvwhite'), px, y + 0.12, cz, px, y + 1.6, cz, 0.1, 0.08, 10, 1.4, false, false);
      for (let j = 0; j < 6; j++){ const yy = y + 0.2 + j * 0.23, r = 0.19 - j * 0.008;
        litCyl(G('hvwhite'), px, yy, cz, px, yy + 0.05, cz, r, r * 0.7, 10, 1, true, true); }
      litBox(G('girder'), px - 0.08, y + 1.6, cz - 0.08, px + 0.08, y + 1.75, cz + 0.08, { seg: 1 });
    }
    litCyl(G('steel'), cx - 0.45, y + 1.72, cz, cx + 0.45, y + 1.72, cz, 0.04, 0.04, 6, 1, false, false);   // the blade, closed
  },
  /* A current transformer: a post, one fat porcelain column, the tank head. */
  hvct(G, b, x0, z0, x1, z1){
    litBox(G('concrete'), x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, 0.25, z1 + 0.1, { seg: 1, tile: 120, tileV: 8 });
    litBox(G('girder'), x0, 0.25, z0, x1, b.h, z1, { bevel: 0.02, seg: 2, tile: 1.6 });
    const y = b.h, cx = b.x, cz = b.z;
    litCyl(G('girder'), cx, y, cz, cx, y + 0.15, cz, 0.3, 0.3, 12, 1, true, true);
    litCyl(G('hvwhite'), cx, y + 0.15, cz, cx, y + 1.55, cz, 0.16, 0.13, 12, 1.4, false, false);
    for (let j = 0; j < 6; j++){ const yy = y + 0.22 + j * 0.22, r = 0.29 - j * 0.012;
      litCyl(G('hvwhite'), cx, yy, cz, cx, yy + 0.06, cz, r, r * 0.7, 12, 1, true, true); }
    litCyl(G('girder'), cx, y + 1.55, cz, cx, y + 2.0, cz, 0.3, 0.32, 14, 1, true, true);       // the head
    litCyl(G('steel'), cx, y + 2.0, cz, cx, y + 2.12, cz, 0.18, 0.1, 10, 1, false, true);     // the bellows dome
    for (const s of [-1, 1]) litBox(G('girder'), cx + s * 0.3 - 0.05, y + 1.9, cz - 0.05, cx + s * 0.42, y + 1.98, cz + 0.05, { seg: 1 });
  },
  /* A floodlight mast: a tapered pole and a head of three lamps looking down. */
  mast(G, b, x0, z0, x1, z1){
    const x = b.x, z = b.z, h = b.h;
    litBox(G('concrete'), x0, 0, z0, x1, 0.4, z1, { seg: 1, tile: 120, tileV: 8 });
    litCyl(G('girder'), x, 0.4, z, x, h - 0.3, z, 0.2, 0.11, 10, 2, false, false);
    litBox(G('girder'), x - 0.95, h - 0.4, z - 0.12, x + 0.95, h - 0.28, z + 0.12, { seg: 1 });
    for (const o of [-0.65, 0, 0.65]){
      litBox(G('steel'), x + o - 0.24, h - 0.28, z - 0.18, x + o + 0.24, h + 0.05, z + 0.18, { seg: 1 });
      litBox(G('lamp'), x + o - 0.2, h - 0.3, z - 0.14, x + o + 0.2, h - 0.28, z + 0.14, { seg: 1 });
    }
  },
});
/* The overhead: portal beams, earth peaks and wires, the three phase
   conductors on their strings, every bay's droppers and jumpers, the line
   in from the HV compound's corner tower and out to the terminal tower, the
   palisade fence. (Trench covers were tried and taken out: a flat plate
   in the open yard read as a white stripe under the sky.) */
LIT_PROP.switchyard = function(G, p){
  const { xs, zN, zS, ph } = p, bY = 12.3, tY = 13.0, sY = 10.95, SAG = 0.35, PK = 15.1;
  const cat = (g, a, b, sag, r, n) => {
    n = n || 8;
    for (let i = 0; i < n; i++){
      const f = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      const A = f(i / n), B = f((i + 1) / n);
      litCyl(g, A[0], A[1], A[2], B[0], B[1], B[2], r, r, 6, 1, false, false);
    }
  };
  const discs = (ax, ay, az, bx, by, bz, n) => {                 // an insulator string from a to b
    for (let j = 0; j < n; j++){
      const t0 = (j + 0.2) / n, t1 = (j + 0.55) / n;
      litCyl(G('hvwhite'), ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0,
                           ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1, 0.14, 0.14, 8, 1, true, true);
    }
    litCyl(G('girder'), ax, ay, az, bx, by, bz, 0.025, 0.025, 4, 1, false, false);
  };
  const busY = (x) => {                                          // the conductor's height at x (it sags between beams)
    for (let i = 0; i < xs.length - 1; i++) if (x >= xs[i] && x <= xs[i + 1]){ const t = (x - xs[i]) / (xs[i + 1] - xs[i]); return sY - SAG * 4 * t * (1 - t); }
    return sY;
  };
  const brace = (ax, az, bx, bz, w, along) => {                 // a lattice girder's zigzag on both faces
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 1.6)), nx = along === 'z' ? 1 : 0, nz = along === 'z' ? 0 : 1;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++){
      const t0 = i / n, t1 = (i + 1) / n, up = i % 2 ? 1 : 0;
      litCyl(G('girder'), ax + (bx - ax) * t0 + s * w * nx, up ? tY : bY, az + (bz - az) * t0 + s * w * nz,
                        ax + (bx - ax) * t1 + s * w * nx, up ? bY : tY, az + (bz - az) * t1 + s * w * nz, 0.04, 0.04, 4, 1, false, false);
    }
  };
  /* the portal beams across each pair of legs, and the entry beam along the north row */
  for (const x of xs){
    litBox(G('girder'), x - 0.35, bY, zN, x + 0.35, bY + 0.12, zS, { seg: 4, tile: 2, bottom: true });
    litBox(G('girder'), x - 0.35, tY - 0.12, zN, x + 0.35, tY, zS, { seg: 4, tile: 2, bottom: true });
    brace(x, zN, x, zS, 0.33, 'z');
  }
  const E = p.entry;
  litBox(G('girder'), E.x0 + 0.35, bY + 0.05, zN - 0.33, E.x1 - 0.35, bY + 0.17, zN + 0.33, { seg: 4, tile: 2, bottom: true });
  litBox(G('girder'), E.x0 + 0.35, tY - 0.17, zN - 0.33, E.x1 - 0.35, tY - 0.05, zN + 0.33, { seg: 4, tile: 2, bottom: true });
  brace(E.x0 + 0.35, zN, E.x1 - 0.35, zN, 0.31, 'x');
  /* earth peaks on every leg, and an earth wire along each row */
  for (const z of [zN, zS]){
    for (const x of xs) litCyl(G('girder'), x, 13, z, x, PK + 0.1, z, 0.1, 0.05, 4, 1, false, true);
    for (let i = 0; i < xs.length - 1; i++) cat(G('steel'), [xs[i], PK, z], [xs[i + 1], PK, z], 0.25, 0.022, 6);
    cat(G('steel'), [xs[0], PK, z], [p.exit.x, p.exit.peak + 0.3, p.exit.z], 1.0, 0.022, 10);
  }
  cat(G('steel'), [xs[xs.length - 1], PK, zN], [E.tx, E.th + 1.6, E.tz], 1.0, 0.022, 10);
  /* the three phases: a string under every beam, the conductor sagging beam to beam */
  for (const z of ph){
    for (const x of xs) discs(x, bY, z, x, sY, z, 6);
    for (let i = 0; i < xs.length - 1; i++) cat(G('bus'), [xs[i], sY, z], [xs[i + 1], sY, z], SAG, 0.045, 8);
  }
  /* every bay: down from the bus to the disconnector, across through the
     breaker and the CTs, and back up to the bus */
  for (let i = 0; i < xs.length - 1; i++){
    const xc = (xs[i] + xs[i + 1]) / 2, iso = xc - 4.2, ct = xc + 4.2;
    for (const z of ph){
      const w = G('bus'), r = 0.035;
      cat(w, [iso - 0.45, busY(iso - 0.45) - 0.05, z], [iso - 0.45, 4.42, z], 0.0, r, 1);
      cat(w, [iso + 0.45, 4.42, z], [xc - 0.55, 4.25, z], 0.12, r, 5);
      cat(w, [xc + 0.55, 4.25, z], [ct - 0.36, 4.55, z], 0.12, r, 5);
      cat(w, [ct + 0.36, 4.55, z], [ct + 0.36, busY(ct + 0.36) - 0.05, z], 0.0, r, 1);
    }
  }
  /* OUT, west: strain strings off the west portal, the span to the terminal
     tower, and a jumper loop from the strain to the bus */
  const X = p.exit;
  for (const z of ph){
    discs(xs[0] - 0.35, 12.05, z, xs[0] - 1.9, 12.05, z, 7);
    cat(G('bus'), [xs[0] - 1.9, 12.05, z], [X.x, X.y - 0.4, z], 1.3, 0.04, 14);
    cat(G('bus'), [xs[0] - 1.9, 12.0, z], [xs[0], sY, z], 0.45, 0.035, 5);
  }
  /* IN, east: from the compound tower's west arms, strain strings off the
     entry beam, then a jumper down under the beam to each phase's bus */
  for (let k = 0; k < 3; k++){
    const [f, reach] = HVT_ARMS[k], tip = [E.tx - reach, E.th * f - 0.66, E.tz], xe = E.xs[k], z = ph[k];
    discs(xe, 12.05, zN - 0.33, xe, 12.05, zN - 1.9, 7);
    cat(G('bus'), [xe, 12.05, zN - 1.9], tip, 1.0, 0.04, 14);
    cat(G('bus'), [xe, 12.0, zN - 1.9], [xe, busY(xe), z], 0.9, 0.035, 8);
  }
  /* the palisade: one cut-out quad per run, posts every 2.4m, gate posts */
  const f = litGeo(), H = p.fh;
  for (const [ax, az, bx, bz] of p.runs){
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    litGrid(f, ax, 0, az, ux, 0, uz, 0, 1, 0, L, H, uz, 0, -ux, Math.max(1, Math.round(L)), 1, 1.2, H);
    for (let a = 0; a <= L + 0.01; a += 2.4){ const px = ax + ux * Math.min(a, L), pz = az + uz * Math.min(a, L);
      litBox(G('steel'), px - 0.05, 0, pz - 0.05, px + 0.05, H + 0.08, pz + 0.05, { seg: 1, tile: 1 }); }
    for (const [px, pz] of [[ax, az], [bx, bz]]) litBox(G('steel'), px - 0.09, 0, pz - 0.09, px + 0.09, H + 0.15, pz + 0.09, { seg: 1, tile: 1 });
  }
  litAdd(new THREE.Mesh(litGeoDone(f), litPalisadeMat()), false);
};
/* ---- THE OFFICES, DRESSED (2026-11-23, the Saltline list) ----
   Each piece is its own collision box (works.js `place`); these draw them,
   flush to the box. */
Object.assign(LIT_DRAW, {
  chair(G, b, x0, z0, x1, z1){
    const cx = b.x, cz = b.z, w = b.w / 2, d = b.d / 2;
    litCyl(G('chairblack'), cx, 0.06, cz, cx, 0.42, cz, 0.03, 0.03, 8, 1, false, false);           // the gas column
    for (let i = 0; i < 5; i++){ const a = i * Math.PI * 2 / 5;                                        // five-star base
      litCyl(G('chairblack'), cx, 0.07, cz, cx + Math.cos(a) * w * 0.9, 0.04, cz + Math.sin(a) * d * 0.9, 0.018, 0.018, 4, 1, false, false); }
    litBox(G('fabric'), x0 + 0.02, 0.42, z0 + 0.02, x1 - 0.02, 0.5, z1 - 0.02, { bevel: 0.02, seg: 1, tile: 0.5 });   // the seat
    const n = b.mat === 'chairn', bz0 = n ? z0 : z1 - 0.07, bz1 = n ? z0 + 0.07 : z1, bc = n ? z0 + 0.04 : z1 - 0.04;   // the back: south, or north for 'chairn'
    litBox(G('fabric'), x0 + 0.04, 0.56, bz0, x1 - 0.04, b.h, bz1, { bevel: 0.02, seg: 1, tile: 0.5 });
    litCyl(G('chairblack'), cx, 0.5, bc, cx, 0.58, bc, 0.02, 0.02, 4, 1, false, false);
  },
  cabinet(G, b, x0, z0, x1, z1){
    litBox(G('cabgrey'), x0, 0, z0, x1, b.h, z1, { bevel: 0.01, seg: 1, tile: 0.6 });
    for (let i = 0; i < 4; i++){ const y = 0.18 + i * (b.h - 0.12) / 4;                                // drawer pulls
      litBox(G('chairblack'), b.x - 0.08, y, z0 - 0.012, b.x + 0.08, y + 0.025, z0, { seg: 1 }); }
  },
  printer(G, b, x0, z0, x1, z1){
    litBox(G('cabgrey'), x0, 0, z0, x1, 0.62, z1, { bevel: 0.02, seg: 1, tile: 0.6 });                // the stand
    litBox(G('white'), x0 + 0.02, 0.62, z0 + 0.02, x1 - 0.02, b.h, z1 - 0.02, { bevel: 0.03, seg: 1, tile: 0.6 });
    litBox(G('chairblack'), x0 + 0.08, b.h - 0.02, z0 + 0.06, x0 + 0.3, b.h, z0 + 0.2, { seg: 1 });   // the panel
  },
  cooler(G, b, x0, z0, x1, z1){
    litBox(G('white'), x0, 0, z0, x1, b.h - 0.38, z1, { bevel: 0.02, seg: 1, tile: 0.5 });
    litCyl(G('water'), b.x, b.h - 0.38, b.z, b.x, b.h, b.z, 0.15, 0.13, 14, 1, false, true);           // the bottle
  },
  plant(G, b, x0, z0, x1, z1){
    const cx = b.x, cz = b.z, r = b.w / 2;
    litCyl(G('pot'), cx, 0, cz, cx, 0.42, cz, r * 0.62, r * 0.75, 12, 1, false, true);
    for (let i = 0; i < 7; i++){                                                                       // foliage: a cluster of leaves
      const a = i * 2.39, rr = r * (0.25 + (i % 3) * 0.22), y = 0.55 + (i % 4) * 0.17;
      const lx = cx + Math.cos(a) * rr, lz = cz + Math.sin(a) * rr;
      litCyl(G('leaf'), cx, 0.42, cz, lx, Math.min(b.h - 0.12, y + 0.25), lz, 0.02, 0.12, 6, 1, false, true);
    }
  },
});
LIT_DRAW.chairn = LIT_DRAW.chair;
Object.assign(LIT_INDOOR, { chair: 1, chairn: 1, cabinet: 1, printer: 1, cooler: 1, plant: 1, lamppost: 1 });
/* A lamp post: a tapered steel pole on a footing, a post-top lantern -
   a dark housing with its glowing glass under a little cap. Lit by the
   bake (litPanelLights). */
LIT_DRAW.lamppost = function(G, b, x0, z0, x1, z1){
  const x = b.x, z = b.z, h = b.h;
  litBox(G('concrete'), x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, 0.3, z1 + 0.1, { seg: 1, tile: 120, tileV: 8 });
  litCyl(G('steel'), x, 0.3, z, x, h - 0.45, z, 0.1, 0.06, 10, 2, false, false);
  litCyl(G('steel'), x, h - 0.45, z, x, h - 0.3, z, 0.07, 0.16, 10, 1, false, false);
  litCyl(G('lamp'), x, h - 0.3, z, x, h + 0.02, z, 0.17, 0.2, 10, 1, false, false);
  litCyl(G('steel'), x, h + 0.02, z, x, h + 0.18, z, 0.26, 0.05, 10, 1, true, true);
};
Object.assign(LIT_UNDER, { chair: null, chairn: null, cabinet: null, printer: null, cooler: null, plant: null });
LIT_PROP.highbay = function(G, p){
  for (const [x, z] of litHighbays(p)){
    litCyl(G('steel'), x, p.y - 0.15, z, x, p.y + 1.2, z, 0.02, 0.02, 5, 1, false, false);
    litCyl(G('steel'), x, p.y - 0.4, z, x, p.y - 0.15, z, 0.34, 0.12, 14, 1, false, true);
    litCyl(G('lamp'), x, p.y - 0.41, z, x, p.y - 0.4, z, 0.3, 0.3, 14, 1, true, false);
  }
};
/* Loose clutter gets no keep-clear outline painted round it: that line is
   for plant, and round a drum or a cone it read as a level editor. */
for (const k in LIT_KIT) LIT_INDOOR[k] = 1;
/* A scaffold tower against a wall (2026-11-23, the map's shape): four
   standards, ledgers every 2m, a brace on each long face, boarded lifts at
   2m and at the top with a toe board and a guard rail. The box is the
   tower: cover you cannot see through at the boards, nor climb (4.2m). */
LIT_DRAW.scaffold = function(G, b, x0, z0, x1, z1){
  const h = b.h, t = 0.025, ST = 'steel';
  const corners = [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05], [x1 - 0.05, z1 - 0.05], [x0 + 0.05, z1 - 0.05]];
  for (const [x, z] of corners){ litCyl(G(ST), x, 0, z, x, h, z, t, t, 6, 1, false, true); litBox(G(ST), x - 0.08, 0, z - 0.08, x + 0.08, 0.02, z + 0.08, { seg: 1 }); }
  for (const y of [0.15, 1.0, 2.0, 3.1, h - 0.05]) for (let i = 0; i < 4; i++){ const a = corners[i], c = corners[(i + 1) % 4];
    litCyl(G(ST), a[0], y, a[1], c[0], y, c[1], t, t, 6, 1, false, false); }
  for (const x of [x0 + 0.05, x1 - 0.05]) litCyl(G(ST), x, 0.15, z0 + 0.05, x, h - 0.05, z1 - 0.05, t, t, 6, 1, false, false);   // the braces
  for (const y of [2.0, h - 1.1]){
    litBox(G('pallet'), x0 + 0.06, y, z0 + 0.06, x1 - 0.06, y + 0.05, z1 - 0.06, { seg: 2, tile: 1 });                // the boards
    litBox(G('pallet'), x0 + 0.06, y + 0.05, z0 + 0.06, x0 + 0.08, y + 0.2, z1 - 0.06, { seg: 2, tile: 1 });           // toe boards
    litBox(G('pallet'), x1 - 0.08, y + 0.05, z0 + 0.06, x1 - 0.06, y + 0.2, z1 - 0.06, { seg: 2, tile: 1 });
  }
};
LIT_INDOOR.scaffold = 1;
LIT_INDOOR.towerwall = LIT_INDOOR.boilerwall = LIT_INDOOR.hallroof = 1;
LIT_UNDER.drum = LIT_UNDER.drums4 = LIT_UNDER.ibc = LIT_UNDER.barrier = LIT_UNDER.pallets = LIT_UNDER.palletload = null;
LIT_UNDER.gascage = LIT_UNDER.reel = LIT_UNDER.skip = LIT_UNDER.van = LIT_UNDER.forklift = LIT_UNDER.toolcart = null;
LIT_UNDER.bin = LIT_UNDER.gen = LIT_UNDER.cabin = LIT_UNDER.lighttower = null;

/* ---- the loose things on the ground: no collision ----
   `clutter` is a prop holding a list: traffic cones, cable runs across the
   floor, coiled hoses, signs. (Oil and leak stains are in the same list
   but are painted into the ground, litGroundTexture.) */
const LIT_SIGNS = {
  hv:    { bg: '#f2c400', fg: '#111', title: 'DANGER', lines: ['HIGH VOLTAGE', 'KEEP OUT'], bolt: true },
  ppe:   { bg: '#1f5fa8', fg: '#fff', title: 'HARD HATS', lines: ['AND HI-VIS', 'MUST BE WORN'] },
  chem:  { bg: '#f2c400', fg: '#111', title: 'CAUTION', lines: ['CHEMICAL', 'STORE'] },
  nosmk: { bg: '#e8e6df', fg: '#b0161b', title: 'NO SMOKING', lines: ['OR NAKED', 'FLAMES'] },
  fork:  { bg: '#f2c400', fg: '#111', title: 'WARNING', lines: ['FORK LIFT', 'TRUCKS'] },
  site:  { bg: '#1d2b22', fg: '#e8e6df', title: 'COMPOUND B', lines: ['CONTRACTORS', 'ONLY'] },
  /* 2026-11-23, the Saltline list */
  assembly: { bg: '#1b7a3a', fg: '#ffffff', title: 'ASSEMBLY', lines: ['POINT', '1'] },
  ear:   { bg: '#1f5fa8', fg: '#ffffff', title: 'EAR', lines: ['PROTECTION', 'MUST BE WORN'] },
  exit:  { bg: '#1b7a3a', fg: '#ffffff', title: 'FIRE EXIT', lines: ['KEEP', 'CLEAR'] },
  slow:  { bg: '#e8e6df', fg: '#b0161b', title: 'SLOW', lines: ['SITE SPEED', '10 MPH'] },
};
function litSignTexture(key){
  const s = LIT_SIGNS[key];
  return litCanvas(256, 320, (g, w, h) => {
    g.fillStyle = s.bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = s.fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = s.fg; g.textAlign = 'center'; g.font = '700 40px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText(s.title, w / 2, 70);
    if (s.bolt){ g.beginPath(); g.moveTo(140, 95); g.lineTo(100, 175); g.lineTo(130, 175); g.lineTo(112, 235); g.lineTo(160, 150); g.lineTo(130, 150); g.closePath(); g.fill(); }
    g.font = '600 32px "Barlow Condensed", "Arial Narrow", sans-serif';
    s.lines.forEach((l, i) => g.fillText(l, w / 2, (s.bolt ? 270 : 150) + i * 38 - (s.bolt ? 0 : 0)));
    const rnd = litRand(key.length * 31);                     // weathering
    for (let i = 0; i < 60; i++){ g.fillStyle = 'rgba(60,40,20,' + (rnd() * 0.12).toFixed(3) + ')'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 10, 2 + rnd() * 30); }
  });
}
LIT_PROP.clutter = function(G, p){
  for (const it of p.items){
    if (it.k === 'cone'){
      const x = it.x, z = it.z;
      litBox(G('cable'), x - 0.19, 0, z - 0.19, x + 0.19, 0.04, z + 0.19, { seg: 1, tile: 1 });
      litCyl(G('orange'), x, 0.04, z, x, 0.72, z, 0.15, 0.025, 12, 1, false, true);
      litCyl(G('white'), x, 0.36, z, x, 0.5, z, 0.096, 0.072, 12, 1, false, false);
    } else if (it.k === 'cable'){
      const P = it.pts;
      for (let i = 0; i < P.length - 1; i++) litCyl(G('cable'), P[i][0], 0.03, P[i][1], P[i + 1][0], 0.03, P[i + 1][1], 0.028, 0.028, 5, 1, false, false);
    } else if (it.k === 'hose'){
      for (let k = 0; k < 4; k++) litRingTube(G(it.c || 'orange'), it.x, 0.03 + k * 0.045, it.z, 0.32 - k * 0.012, 0.022, 16);
    } else if (it.k === 'sign'){
      /* a plate on two posts (it.post) or flat on a wall, facing angle it.ry */
      const c = Math.cos(it.ry), s = Math.sin(it.ry), W = 0.5, H = 0.62, y0 = it.y != null ? it.y : 1.1;
      const nx = s, nz = c, ux = c, uz = -s;                              // face normal and the plate's own right
      const ox = it.x - ux * W / 2, oz = it.z - uz * W / 2;
      litGrid(G('sign_' + it.t), ox, y0, oz, ux, 0, uz, 0, 1, 0, W, H, nx, 0, nz, 1, 1, W, H);
      litGrid(G('galv'), ox + ux * W, y0, oz + uz * W, -ux, 0, -uz, 0, 1, 0, W, H, -nx, 0, -nz, 1, 1, 1, 1);   // its back
      if (it.post) for (const f of [0.15, 0.85]){ const px = ox + ux * W * f - nx * 0.03, pz = oz + uz * W * f - nz * 0.03;
        litCyl(G('galv'), px, 0, pz, px, y0 + H, pz, 0.025, 0.025, 6, 1, false, true); }
    }
  }
};

/* ---- WEAR: grime at the foot of everything ----
   Saltline darkens the bottom of every wall, plinth and machine, where
   splash and dirt collect; here nothing met the floor except cleanly. One
   mesh of thin decal strips round the foot of every box on the floor:
   black, fading out upward, drawn over the surface (a dark wash darkens in
   any light, so it needs no lighting of its own). */
const LIT_NOGRIME = { hidden: 1, glass: 1, handrail: 1, ringrail: 1, ringdeck: 1, pipewalk: 1, grating: 1, steptread: 1, tread: 1,
                      step: 1, slab: 1, roofslab: 1, stackwall: 1, deck: 1, towerwall: 1, palisade: 1,
                      chair: 1, chairn: 1, cabinet: 1, printer: 1, cooler: 1, plant: 1, lamppost: 1, scaffold: 1 };   // the offices' furniture stands on a clean floor
function litGrimeTexture(){
  return litCanvas(8, 64, (g, w, h) => {
    /* an alphaMap is read from the GREEN channel: white is opaque */
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#8c8c8c'); gr.addColorStop(1, '#000000');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/* RUST RUNS (2026-11-23, the Saltline list): the orange-brown streaks
   that weather down outdoor walls from every fixing, flashing and sill.
   Decal strips a fraction off the face, MULTIPLIED over the wall (white
   leaves it as it is), so they tint in any light without a light of their
   own. Seeded, so every build is the same. */
const LIT_RUSTY = { cladding: 1, shedwall: 1, bwall: 1, boilerwall: 1, firewall: 1, intake: 1, kiosk: 1 };
function litRustTexture(){
  return litCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const rnd = litRand(404);
    for (let v = 0; v < 4; v++){                                       // four variants side by side, 64px each
      const x0 = v * 64;
      for (let i = 0; i < 6 + v * 2; i++){
        const x = x0 + 8 + rnd() * 48, wd = 1.5 + rnd() * 5, len = h * (0.35 + rnd() * 0.65);
        const gr = g.createLinearGradient(0, 0, 0, len);
        const a = 0.18 + rnd() * 0.3;
        gr.addColorStop(0, 'rgba(122,66,30,' + a.toFixed(2) + ')'); gr.addColorStop(0.5, 'rgba(150,92,52,' + (a * 0.55).toFixed(2) + ')');
        gr.addColorStop(1, 'rgba(170,120,80,0)');
        g.fillStyle = gr; g.fillRect(x, 0, wd, len);
      }
      for (let i = 0; i < 3; i++){                                     // the stain at the source: soft blots, not a bar
        const cx = x0 + 14 + rnd() * 36, rr = 6 + rnd() * 8, gr = g.createRadialGradient(cx, 4, 0, cx, 4, rr);
        gr.addColorStop(0, 'rgba(110,60,28,0.35)'); gr.addColorStop(1, 'rgba(110,60,28,0)');
        g.fillStyle = gr; g.fillRect(cx - rr, 0, rr * 2, rr + 4);
      }
    }
  });
}
function litRust(map){
  const g = litGeo(), rnd = litRand(2311), e = 0.016;
  for (const b of map.boxes){
    if (!LIT_RUSTY[b.mat] || boxY(b) > 0.05 || b.h < 2.4 || b.ry) continue;
    const X0 = b.x - b.w / 2, X1 = b.x + b.w / 2, Z0 = b.z - b.d / 2, Z1 = b.z + b.d / 2;
    const faces = [[X0, Z1 + e, 1, 0, b.w, 0, 0, 1], [X1, Z0 - e, -1, 0, b.w, 0, 0, -1],
                   [X0 - e, Z0, 0, 1, b.d, -1, 0, 0], [X1 + e, Z1, 0, -1, b.d, 1, 0, 0]];
    for (const [ox, oz, ux, uz, L, nx, ny, nz] of faces){
      if (L < 1.2) continue;
      const n = Math.floor(L / 4 * (0.5 + rnd()));
      for (let i = 0; i < n; i++){
        const wd = 0.35 + rnd() * 0.6, at = rnd() * (L - wd), len = Math.min(b.h - 0.3, 0.8 + rnd() * 2.8);
        const top = rnd() < 0.55 ? b.h - 0.12 : Math.max(len + 0.2, 1.4 + rnd() * (b.h - 1.6));
        const v = Math.floor(rnd() * 4) / 4, sx = ox + ux * at, sz = oz + uz * at, base = g.p.length / 3;
        for (const [du, y, tu, tv] of [[0, top, v, 1], [wd, top, v + 0.25, 1], [0, top - len, v, 0], [wd, top - len, v + 0.25, 0]]){   // flipY: v 1 is the canvas top, where a run starts
          g.p.push(sx + ux * du, y, sz + uz * du); g.n.push(nx, ny, nz); g.uv.push(tu, tv);
        }
        g.i.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  if (!g.p.length) return;
  const t = litTexOf(litRustTexture(), true); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshBasicMaterial({ map: t, blending: THREE.MultiplyBlending, transparent: true, premultipliedAlpha: true,
                                          depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
                                          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(litGeoDone(g), m); mesh.renderOrder = 1;
  litAdd(mesh, false); mesh.receiveShadow = false;
}
function litFootGrime(map){
  const g = litGeo();
  for (const b of map.boxes){
    if (LIT_NOGRIME[b.mat] || boxY(b) > 0.05 || b.h < 0.4 || b.r != null || b.ry) continue;
    const gh = Math.min(0.9, b.h * 0.55), e = 0.012;
    const x0 = b.x - b.w / 2 - e, x1 = b.x + b.w / 2 + e, z0 = b.z - b.d / 2 - e, z1 = b.z + b.d / 2 + e;
    litGrid(g, x0, 0, z1,  1, 0, 0,  0, 1, 0,  x1 - x0, gh,  0, 0, 1,   99, 99, 1, gh);
    litGrid(g, x1, 0, z0, -1, 0, 0,  0, 1, 0,  x1 - x0, gh,  0, 0, -1,  99, 99, 1, gh);
    litGrid(g, x0, 0, z0,  0, 0, 1,  0, 1, 0,  z1 - z0, gh, -1, 0, 0,   99, 99, 1, gh);
    litGrid(g, x1, 0, z1,  0, 0, -1, 0, 1, 0,  z1 - z0, gh,  1, 0, 0,   99, 99, 1, gh);
  }
  const t = litTexOf(litGrimeTexture(), false); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.5, depthWrite: false,
                                          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(litGeoDone(g), m); mesh.renderOrder = 1;
  litAdd(mesh, false); mesh.receiveShadow = false;
}


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
  const SKIP_FLOOR = { column: 1, hidden: 1, step: 1, lattice: 1, hvtower: 1, hviso: 1, hvct: 1, mast: 1, palisade: 1, lamppost: 1 };
  /* ^ too thin to shade the floor or hide a panel. A transmission tower
     has a 4m footprint but is four legs and some bracing: treating it as
     a solid 4m block would lay a shadow under it that nothing casts. */
  /* THE BIGGEST ONES, not the first ones. The loop used to take boxes in map
     order and stop at the budget, so a map that offered more than it could
     hold silently dropped whatever happened to be written last - on the
     station that was the yard's pipe bridges one run and the cooling towers
     the next, depending on nothing but the order of the file. Sorting by
     footprint first makes the choice mean something: a tower shades the
     ground round it and hides a whole panel of sky, a 3m plinth does
     neither, and if something has to go it should be the plinth. */
  /* Only what stands ON the floor darkens it: a slab overhead is a ceiling,
     and glass casts nothing. */
  const floorBoxes = map.boxes.filter(b => !SKIP_FLOOR[b.mat] && !MOVE_ONLY[b.mat] && boxY(b) < 0.05)
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
  LITU.uLitGain.value = LIT.gain * (map.gain || 1) * (map.sky ? LIT.skyGain : 1);
  LITU.uLitMarks.value = litMarksTexture(map);
  LITU.uLitGround.value = litGroundTexture(map);
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
  /* Outdoors the slab is weathered concrete under a grey sky, a step darker
     than the hall's painted floor; brighter than the sky, nothing reads as
     overcast (2026-11-21). */
  const fm = litPatch(litShare(flatFloor, { roughness: 0.66, metalness: 0, color: sky ? 0xa9adb0 : 0xd6d9dc }), 'floor', 1);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(a * 2, a * 2), fm);
  fl.rotation.x = -Math.PI / 2; fl.userData.ownMaterial = true; litAdd(fl, false);

  /* Perimeter: only the faces that look into the room. UVs run 0..1 along
     each wall so the photoscan keeps the tiling its texture already has. */
  let g = litGeo();
  litGrid(g, -D, 0, -D,  1,0,0,  0,1,0, 2*D, H,  0,0,1,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g,  D, 0,  D, -1,0,0,  0,1,0, 2*D, H,  0,0,-1, LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g, -D, 0,  D,  0,0,-1, 0,1,0, 2*D, H,  1,0,0,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  litGrid(g,  D, 0, -D,  0,0,1,  0,1,0, 2*D, H, -1,0,0,  LIT.wallSegU, LIT.wallSegV, 2*D, H);
  /* Outdoors the edge is a site boundary with the world past it (THE EDGE
     OF THE WORLD, above); indoors it is the hall's own wall. */
  if (sky){ litBoundary(D); litFarWorld(map); }
  else litAdd(new THREE.Mesh(litGeoDone(g), litMaterial('wall')), true);

  if (!sky){
    g = litGeo();                                                       // roof
    litGrid(g, -D, H, -D,  1,0,0,  0,0,1, 2*D, 2*D,  0,-1,0, LIT.roofSeg, LIT.roofSeg, 2*D, 2*D);
    const roof = new THREE.Mesh(litGeoDone(g), litPatch(litShare(flatRoof, { roughness: 0.97, metalness: 0, color: 0x6a727c }), 'ceil', 0.15));
    roof.userData.ownMaterial = true; litAdd(roof, true);
  } else {
    /* The sky, as a SPHERE that rides with the camera. It was a box: the
       gradient stretched across its ceiling as streaks converging overhead,
       and at 280m wide anything outside it (an aerial view) saw it inside
       out. A sphere maps the gradient the way a sky works - zenith at the
       pole, horizon at the equator, land below - and following the camera
       keeps it inside the far plane (500) wherever you stand. Unlit,
       unfogged, drawn first, never written to depth, so everything else is
       simply in front of it. */
    const sg = new THREE.SphereGeometry(440, 48, 24);
    const dome = new THREE.Mesh(sg, litMaterial('skydome'));
    dome.renderOrder = -1; dome.frustumCulled = false; LIT_DOME = dome;
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
  /* A RAISED box (boxY, maps.js) is drawn exactly as if it stood on the
     floor and then lifted: every drawer works from y = 0, so rather than
     teach forty of them about a base, the vertices each one adds are moved
     up afterwards. Glass is not drawn here: it is one plain mesh in both
     looks (addGlass, world.js). */
  for (const b of map.boxes){
    if (b.mat === 'glass') continue;
    const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2, x1 = b.x + b.w / 2, z1 = b.z + b.d / 2, draw = LIT_DRAW[b.mat];
    const y = boxY(b), mark = {}, ry = b.ry || 0;
    if (y || ry) for (const k in geos) mark[k] = geos[k].p.length;
    /* A TURNED box (the clutter kit) is drawn about its own footprint and
       then rotated about its centre; its collision is that footprint's
       bounding box (works.js `kit`). */
    const fx0 = ry ? b.x - b.fw / 2 : x0, fx1 = ry ? b.x + b.fw / 2 : x1, fz0 = ry ? b.z - b.fd / 2 : z0, fz1 = ry ? b.z + b.fd / 2 : z1;
    if (draw) draw(G, b, fx0, fz0, fx1, fz1);
    else litBox(G(b.mat), fx0, 0, fz0, fx1, b.h, fz1, { bevel: LIT.bevel, seg: LIT.coverSeg, tile: LIT_TILE[b.mat] || 3 });
    if (ry){ const c = Math.cos(ry), sn = Math.sin(ry);
      for (const k in geos){ const P = geos[k].p, Nn = geos[k].n;
        for (let i = (mark[k] || 0); i < P.length; i += 3){
          const dx = P[i] - b.x, dz = P[i + 2] - b.z; P[i] = b.x + dx * c - dz * sn; P[i + 2] = b.z + dx * sn + dz * c;
          const nx = Nn[i], nz = Nn[i + 2]; Nn[i] = nx * c - nz * sn; Nn[i + 2] = nx * sn + nz * c; } } }
    if (y){
      for (const k in geos){ const p = geos[k].p; for (let i = (mark[k] || 0) + 1; i < p.length; i += 3) p[i] += y; }
      /* And an UNDERSIDE. No drawer gives a box a bottom face, because a box
         on the floor never shows one; a slab or a stair tread is seen from
         below, and without this you looked up through a ceiling. Concrete,
         as a slab's soffit is. u x v = (0,-1,0), so it faces down. */
      /* Steel underneath steel; nothing under what draws nothing. */
      const under = LIT_UNDER[b.mat] !== undefined ? LIT_UNDER[b.mat] : 'concrete';
      if (under) litGrid(G(under), x0, y, z0,  1,0,0,  0,0,1,  b.w, b.d,  0,-1,0,
                         LIT.coverSeg, LIT.coverSeg, 3, 3);
    }
  }
  for (const p of (map.props || [])){ const draw = LIT_PROP[p.kind]; if (draw) draw(G, p, D, H); }
  if (sky) litFootGrime(map);  // the dirt at the foot of everything (THE CLUTTER KIT)
  if (sky) litRust(map);       // rust runs down the outdoor walls (RUST RUNS)
  for (const name in geos){
    /* A lamp is painted, not lit: the vertex bake must not visit it (it
       would have no use for the light it computed, and an unlit material
       has nothing to put it in). */
    const m = litAdd(new THREE.Mesh(litGeoDone(geos[name]), litMaterial(name)), name !== 'lamp');
    if (name === 'lamp') m.receiveShadow = false;
    if (LIT_RING_BAKE[name]) m.userData.bakeRings = true;
  }

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
/* What metal reflects outdoors. The environment was always the hall's
   ROOM (core.js) - right inside, and right for the menu's studio - but
   under an open sky a rifle, a helmet, a steel rail all held a warm-lit
   ceiling that is not there. This is the overcast instead: bright
   overhead, grey at the horizon, the warm break where the sun is, a dull
   ground below. Saltline's gun looks like metal mostly because of what it
   reflects; this is the same idea for this sky. Made once. */
let LIT_SKY_ENV = null;
function litSkyEnv(){
  if (LIT_SKY_ENV) return LIT_SKY_ENV.texture;
  const env = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 32, 16), col = [];
  const sun = new THREE.Vector3().fromArray(EDGE.sun).normalize(), v = new THREE.Vector3();
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++){
    v.fromBufferAttribute(P, i).normalize();
    let c = v.y > 0 ? [0.55 + 0.45 * v.y, 0.58 + 0.44 * v.y, 0.60 + 0.42 * v.y] : [0.20, 0.21, 0.20];
    const s = Math.pow(Math.max(0, v.dot(sun)), 8) * 0.9;
    c = [c[0] + s, c[1] + s * 0.82, c[2] + s * 0.6];
    col.push(c[0], c[1], c[2]);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer);
  LIT_SKY_ENV = pm.fromScene(env, 0.04); pm.dispose(); geo.dispose();
  return LIT_SKY_ENV.texture;
}
function litLights(){
  const on = !!SETTINGS.look, play = on && LIT_OK && !menuBackdropOn;
  {
    const outside = !!(currentMap && currentMap.sky && !menuBackdropOn);
    if (on) scene.environment = (outside && play) ? litSkyEnv() : environmentTexture();
  }
  hemi.intensity = play ? LIT.dynFill : (on ? LOOK.hemi : LOOK.flatHemi);
  sun.intensity  = play ? LIT.dynKey  : (on ? LOOK.sun  : LOOK.flatSun);
  hemi.groundColor.setHex(play ? 0x3b3e44 : 0x1b1e24);
  if (!play){ sun.position.set(25, 55, 18); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); }
  /* A panel that is the only thing in the room over white should glow like
     it. The menu and the flat look keep the gentler bloom they were tuned
     with. */
  const out = !!(currentMap && currentMap.sky && !menuBackdropOn);
  if (bloomPass){
    const b = out ? LIT.bloomSky : (play ? LIT.bloom : [0.32, 0.55, 0.82]);
    bloomPass.strength = b[0]; bloomPass.radius = b[1]; bloomPass.threshold = b[2]; }
  /* Under an open sky: less exposure, less warmth, a little more colour.
     The menu and the hall keep the figures they were tuned with. */
  if (on) renderer.toneMappingExposure = (out && play) ? LIT.skyExposure : LOOK.exposure;
  if (typeof gradePass !== 'undefined' && gradePass){
    gradePass.uniforms.uWarm.value = (out && play) ? LIT.skyWarm : 1.0;
    gradePass.uniforms.uSat.value  = (out && play) ? LIT.skySat  : 1.12;
    gradePass.uniforms.uContrast.value = (out && play) ? LIT.skyContrast : 0.26; }
  /* The outline light on players (models.js): on in the arena only. */
  if (typeof RIMU !== 'undefined'){ if (play) RIMU.uRim.value.fromArray(LIT.rim); else RIMU.uRim.value.set(0, 0, 0); }
}
/* Steep, but not straight down: at 23 degrees off vertical a standing
   figure throws a shadow that reaches most of a metre past their feet,
   which is enough to see one coming round a corner before its owner does.
   Dead overhead, the shadow hides under the body that casts it. */
/* 2026-11-21: and outdoors, low. The sky now has a sun in it (a warm break
   low in the south-west, EDGE.sun), and a key from straight overhead under
   it read as two different days. At 25 degrees up a figure's shadow runs
   four metres across the ground toward you - more warning round a corner,
   not less. Indoors nothing changes: the hall's panels are baked, and
   this light only ever reaches what moves. */
const _litDir = (typeof EDGE !== 'undefined' ? new THREE.Vector3().fromArray(EDGE.sun) : new THREE.Vector3(20, 55, 13)).normalize();
const _litRgt = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), _litDir).normalize();
const _litUp  = new THREE.Vector3().crossVectors(_litDir, _litRgt).normalize();
const _litF   = new THREE.Vector3();
/* Keep the shadow box on the camera. The focus is snapped to whole shadow
   texels in the LIGHT's own frame: move it by fractions of one and every
   shadow edge in view crawls as you walk. */
/* STEAM. One mesh per source: a few dozen camera-facing quads, each a puff
   that rises from the lip, swells, drifts downwind and fades, on its own
   phase, so the column is always full and never visibly loops. All of the
   motion is in the vertex shader off one shared clock, so a frame costs one
   uniform write in JS. The two materials are made ONCE and cached - a
   material made per build would be compiled per build, and one made per
   puff would be the shader churn that made firing lag.
   It replaced seven stacked translucent cylinders, which read as a glass
   funnel standing on each tower. Not baked, not in wallMeshes: nothing
   stops at it, and it hides nothing a bullet can see. */
const STEAMU = { uTime: { value: 0 } };
/* Colours run above 1 on purpose: real steam in daylight is brighter than
   the sky behind it, and through the tone curve 1.38 lands near white. At
   0.97 it came out a mid grey, which beside a saturated blue reads TAN. */
const STEAM_KIND = {
  tower: { n: 30, life: 16, rise: 34, wind: [9, 0, 5], grow: 1.9, opacity: 0.66, dark: [0.92, 0.94, 0.97], light: [1.38, 1.38, 1.36] },
  stack: { n: 16, life: 11, rise: 26, wind: [14, 0, 6], grow: 2.6, opacity: 0.42, dark: [0.62, 0.63, 0.65], light: [1.05, 1.05, 1.04] },
};
const STEAM_MATS = {};
let STEAM_TEX = null;
function litSteamTexture(){
  /* A cauliflower puff: overlapping soft blobs inside a round falloff, so
     the edge is lumpy the way a billow's is, not a clean disc. */
  if (STEAM_TEX) return STEAM_TEX;
  const c = litCanvas(128, 128, (g, w, h) => {
    const rnd = litRand(23);
    for (let i = 0; i < 26; i++){
      const a = rnd() * Math.PI * 2, d = rnd() * 30, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.9, r = 18 + rnd() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
  STEAM_TEX = new THREE.CanvasTexture(c); return STEAM_TEX;
}
function litSteamMaterial(kind){
  if (STEAM_MATS[kind]) return STEAM_MATS[kind];
  const K = STEAM_KIND[kind];
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLife: { value: K.life }, uRise: { value: K.rise }, uWind: { value: new THREE.Vector3(K.wind[0], K.wind[1], K.wind[2]) },
      uGrow: { value: K.grow }, uOpacity: { value: K.opacity },
      uDark: { value: new THREE.Color(K.dark[0], K.dark[1], K.dark[2]) },
      uLight: { value: new THREE.Color(K.light[0], K.light[1], K.light[2]) }, uMap: { value: null } }]),
    vertexShader: [
      'attribute vec2 aCorner; attribute vec4 aSeed; attribute float aR0;',
      'uniform float uTime, uLife, uRise, uGrow; uniform vec3 uWind;',
      'varying vec2 vUv; varying float vA, vShade;',
      '#include <fog_pars_vertex>',
      'void main(){',
      '  float t = fract(uTime / uLife + aSeed.x);',
      '  float ang = aSeed.z * 6.2832;',
      '  vec3 c = position + vec3(cos(ang), 0.0, sin(ang)) * aR0 * 0.55 * aSeed.w',
      '         + vec3(0.0, t * uRise, 0.0) + uWind * t * t;',
      '  float size = aR0 * (0.75 + uGrow * t) * (0.8 + 0.4 * aSeed.y);',
      '  float rot = aSeed.y * 6.2832 + t * 0.6, cr = cos(rot), sr = sin(rot);',
      '  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);',
      '  mvPosition.xy += vec2(aCorner.x * cr - aCorner.y * sr, aCorner.x * sr + aCorner.y * cr) * size;',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  vUv = aCorner * 0.5 + 0.5;',
      '  vA = smoothstep(0.0, 0.10, t) * pow(1.0 - t, 1.4);',
      '  vShade = clamp(0.55 + 0.45 * aCorner.y, 0.0, 1.0);',
      '  #include <fog_vertex>',
      '}'].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uDark, uLight;',
      'varying vec2 vUv; varying float vA, vShade;',
      '#include <fog_pars_fragment>',
      'void main(){',
      '  float a = texture2D(uMap, vUv).a * vA * uOpacity;',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(mix(uDark, uLight, vShade), a);',
      '  #include <tonemapping_fragment>',
      '  #include <encodings_fragment>',
      '  #include <fog_fragment>',
      '}'].join('\n'),
    transparent: true, depthWrite: false, fog: true,
  });
  m.uniforms.uMap.value = litSteamTexture();
  m.uniforms.uTime = STEAMU.uTime;                          // one clock for every source
  return (STEAM_MATS[kind] = m);
}
function litSteam(x, y, z, r0, kind){
  const K = STEAM_KIND[kind], rnd = litRand(kind === 'tower' ? Math.round(Math.abs(x * 7 + z)) + 1 : 97);
  const pos = [], corner = [], seed = [], rr = [], idx = [];
  for (let i = 0; i < K.n; i++){
    const s = [i / K.n + rnd() * 0.02, rnd(), rnd(), rnd()];
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ pos.push(x, y, z); corner.push(c[0], c[1]); seed.push(s[0], s[1], s[2], s[3]); rr.push(r0); }
    const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  geo.setAttribute('aR0', new THREE.Float32BufferAttribute(rr, 1));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, litSteamMaterial(kind));
  m.frustumCulled = false; m.renderOrder = 2;
  litAdd(m, false); m.receiveShadow = false;
  return m;
}
let LIT_DOME = null;
function litFrame(){
  STEAMU.uTime.value = performance.now() / 1000;
  if (LIT_DOME && LIT_DOME.parent) LIT_DOME.position.copy(camera.position);
  /* Aviation lights on the far chimneys and towers: a slow red flash. */
  if (EDGE_BEACON) EDGE_BEACON.material.opacity = (STEAMU.uTime.value % 1.6) < 0.8 ? 1 : 0.12;
  if (!SETTINGS.look || !LIT_OK || menuBackdropOn) return;
  const texel = LIT.shadowHalf * 2 / ((SETTINGS.shadows | 0) || 1024);
  _litF.set(camera.position.x, 0, camera.position.z);
  const r = Math.round(_litF.dot(_litRgt) / texel) * texel, u = Math.round(_litF.dot(_litUp) / texel) * texel, d = _litF.dot(_litDir);
  _litF.set(0, 0, 0).addScaledVector(_litRgt, r).addScaledVector(_litUp, u).addScaledVector(_litDir, d);
  sun.target.position.copy(_litF); sun.target.updateMatrixWorld();
  sun.position.copy(_litF).addScaledVector(_litDir, 80);
  litDynamicLight();
}
/* MOVING THINGS ARE LIT BY WHERE YOU STAND (2026-11-22). The gun in your
   hand and the bodies on the map are lit by the two real lights, which
   were the same everywhere: the rifle was as bright in a shut furnace as in
   the yard, and the sun shone on it through every roof. Every few frames
   the bake's own light is measured at the camera - the sky and the
   fittings, with their shadows - against the brightest open ground, and
   the fill follows it; and a ray toward the sun says whether it can reach
   you at all. Both ease, so walking through a door is a transition, not a
   switch. (They are global lights, so other players are lit by where YOU
   stand: right indoors, where you see them; a known limit.) */
const LIT_DYN = { n: 0, ref: 0, refGen: -1, fill: 1, sun: 1, tFill: 1, tSun: 1, out: [0, 0, 0] };
function litDynamicLight(){
  const J = litJob; if (!J || !J.ctx || !(currentMap && currentMap.sky)) return;
  const c = J.ctx, o = LIT_DYN.out, lum = () => 0.3 * o[0] + 0.6 * o[1] + 0.1 * o[2];
  if (LIT_DYN.refGen !== J.gen){                 // the open-ground reference, once per bake
    let best = 0;
    for (const [x, z] of [[-30, 80], [0, -112], [-100, 10], [-60, 70]]){ litDirect(c, x, 1.5, z, 0, 1, 0, 0, o); best = Math.max(best, lum()); }
    LIT_DYN.ref = best || 1; LIT_DYN.refGen = J.gen;
  }
  if ((LIT_DYN.n++ % 6) === 0){
    const p = camera.position;
    litDirect(c, p.x, p.y, p.z, 0, 1, 0, 0, o);
    const k = Math.max(0, Math.min(1, lum() / LIT_DYN.ref));
    LIT_DYN.tFill = 0.22 + 0.78 * Math.pow(k, 0.7);
    LIT_DYN.tSun = litBlocked(c, p.x, p.y, p.z, p.x + _litDir.x * 90, p.y + _litDir.y * 90, p.z + _litDir.z * 90) ? 0 : 1;
  }
  LIT_DYN.fill += (LIT_DYN.tFill - LIT_DYN.fill) * 0.12;
  LIT_DYN.sun  += (LIT_DYN.tSun  - LIT_DYN.sun)  * 0.12;
  hemi.intensity = LIT.dynFill * LIT_DYN.fill;
  sun.intensity  = LIT.dynKey  * LIT_DYN.sun;
  /* EYE ADAPTATION. A lit office is a fifth as bright as an overcast yard,
     which is true and which a fixed exposure shows as a dim room. An eye
     (and every camera) opens up indoors: exposure rises as the light where
     you stand falls, slowly, so stepping inside is a moment of dark and
     looking back out through the door is a bright frame. */
  const tExp = LIT.skyExposure * Math.min(LIT.adaptMax, 1 / (0.4 + 0.6 * LIT_DYN.fill));
  LIT_DYN.exp = (LIT_DYN.exp || tExp) + (tExp - (LIT_DYN.exp || tExp)) * LIT.adaptRate;
  renderer.toneMappingExposure = LIT_DYN.exp;
}
