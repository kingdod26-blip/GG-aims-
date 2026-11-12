/* =============================================================
   Crimson X — maps.js  (2 of 10 in load order)

   THE ARENAS, as data. One definition, read by both sides: the browser
   builds the geometry from it (`buildArena` in world.js) and the server
   builds its collision rects from the same numbers (`require` at the top
   of server.js).

   That sharing is the whole point. The layout used to be written TWICE —
   here as `[x,z,w,h,d,colour]` and in server.js as `[x,z,w,d,h]`, two
   different argument orders for the same boxes — and the only thing
   keeping them in step was a warning in CLAUDE.md. Get one height wrong
   and the cover you can see is not the cover that stops a bullet. A box
   is an OBJECT now, so there is no argument order to get wrong and no
   second copy to forget.

   Materials are NAMED, not hex colours. The client used to key its
   material table off the colour in the layout, so the colour was really
   an id and two boxes could not share a look without sharing a number.
   `mat` is one of: 'crate' (photoscanned wood), 'block', 'pillar',
   'wall' (the scanned concrete the perimeter is made of).

   `arena` is a HALF-extent: 60 means the floor runs -60..60 on both axes,
   a 120x120 room. The perimeter walls, the roof and the lamp grid are all
   derived from it rather than written out, so a smaller map needs one
   number changed and not four wall entries.

   PURE DATA. No THREE, no document, no require, no window — the server
   loads this exact file, so anything browser-only in here breaks it.
   ============================================================= */

const MAPS = {

  /* The original arena: an indoor range, lamps on the ceiling, a big crate
     dead centre that doubles as the resupply pickup. */
  foundry: {
    id: 'foundry',
    name: 'FOUNDRY',
    blurb: 'Indoor range. Long sightlines down both axes, cover in the middle.',
    arena: 60,
    wallH: 8,
    /* Ceiling lamps: unlit emissive panels on a grid, `reach` steps out from
       the centre in each direction (2 -> a 5x5 grid at 24m spacing). */
    lamps: { spacing: 24, reach: 2, w: 6, d: 2.4 },
    /* The resupply crate's floor ring. The box it sits on is the first entry
       in `boxes`; this is where the pickup is tested from, and the server's
       RESUPPLY uses it too. */
    resupply: { x: 0, z: 0 },
    boxes: [
      { x:   0, z:   0, w:   6, d:   6, h: 3,   mat: 'pillar' },   // centre crate / resupply
      { x: -18, z: -12, w:   4, d:   4, h: 2.5, mat: 'crate'  },
      { x:  18, z: -12, w:   4, d:   4, h: 2.5, mat: 'crate'  },
      { x: -18, z:  12, w:   4, d:   4, h: 2.5, mat: 'crate'  },
      { x:  18, z:  12, w:   4, d:   4, h: 2.5, mat: 'crate'  },
      { x:   0, z: -24, w:  12, d:   2, h: 4,   mat: 'block'  },   // long walls, north/south
      { x:   0, z:  24, w:  12, d:   2, h: 4,   mat: 'block'  },
      { x: -30, z:   0, w:   2, d:  12, h: 4,   mat: 'block'  },   // and east/west
      { x:  30, z:   0, w:   2, d:  12, h: 4,   mat: 'block'  },
      { x: -10, z: -30, w:   3, d:   3, h: 2,   mat: 'crate'  },
      { x:  10, z:  30, w:   3, d:   3, h: 2,   mat: 'crate'  },
      { x: -34, z: -30, w:   5, d:   5, h: 3,   mat: 'pillar' },
      { x:  34, z:  30, w:   5, d:   5, h: 3,   mat: 'pillar' },
      { x:  24, z: -28, w:   3, d:   3, h: 2,   mat: 'crate'  },
      { x: -24, z:  28, w:   3, d:   3, h: 2,   mat: 'crate'  },
      { x:  12, z:   8, w: 2.5, d: 2.5, h: 1.5, mat: 'crate'  },   // low, shoot over these
      { x: -12, z:  -8, w: 2.5, d: 2.5, h: 1.5, mat: 'crate'  },
    ],
    /* Wall signage. `kind` picks the artwork (SIGN_ART in world.js owns the
       drawing and the panel size); `ry` is degrees, so the data stays free of
       Math.PI. x of ±58.9 is just inside the wall at ±60. */
    signs: [
      { kind: 'rules', x: -58.9, y: 3.4, z: 30, ry: 90 },
      { kind: 'dist',  x:    20, y: 4,   z: -58.9, ry: 0 },
      { kind: 'b2',    x: -58.9, y: 4.5, z: 10, ry: 90 },
    ],
  },

  /* A second arena, and a deliberately different fight. Foundry is 120m
     across and open, which rewards a scoped sniper down either axis.
     Substation is 88m with the middle walled into THREE LANES, so a sightline
     is something you commit to rather than something you are handed: the two
     long dividers and the two cross walls break every diagonal, the corner
     towers are the only high ground, and the core in the middle is the one
     place all three lanes meet. Everything is symmetric under a 180-degree
     turn, so neither spawn half owns a better angle. */
  substation: {
    id: 'substation',
    name: 'SUBSTATION',
    blurb: 'Tighter, three lanes and a walled core. No long diagonal.',
    arena: 44,
    wallH: 7,
    lamps: { spacing: 20, reach: 2, w: 5, d: 2.2 },
    resupply: { x: 0, z: 0 },
    boxes: [
      { x:   0, z:   0, w: 7, d: 7, h: 3,   mat: 'pillar' },   // the core / resupply
      { x: -16, z:   0, w: 2, d: 26, h: 4,  mat: 'block'  },   // the two lane dividers
      { x:  16, z:   0, w: 2, d: 26, h: 4,  mat: 'block'  },
      { x:   0, z: -26, w: 26, d: 2, h: 4,  mat: 'block'  },   // and the cross walls
      { x:   0, z:  26, w: 26, d: 2, h: 4,  mat: 'block'  },
      { x: -30, z: -30, w: 6, d: 6, h: 4,   mat: 'pillar' },   // corner towers: the high ground
      { x:  30, z:  30, w: 6, d: 6, h: 4,   mat: 'pillar' },
      { x:  30, z: -30, w: 6, d: 6, h: 4,   mat: 'pillar' },
      { x: -30, z:  30, w: 6, d: 6, h: 4,   mat: 'pillar' },
      { x: -24, z:   0, w: 4, d: 4, h: 2.4, mat: 'crate'  },   // outer lane cover
      { x:  24, z:   0, w: 4, d: 4, h: 2.4, mat: 'crate'  },
      { x:  -9, z:  -9, w: 3, d: 3, h: 1.6, mat: 'crate'  },   // low: shoot over, or stand on
      { x:   9, z:   9, w: 3, d: 3, h: 1.6, mat: 'crate'  },
      { x:   9, z:  -9, w: 3, d: 3, h: 1.6, mat: 'crate'  },
      { x:  -9, z:   9, w: 3, d: 3, h: 1.6, mat: 'crate'  },
      { x:   0, z: -13, w: 5, d: 2, h: 2,   mat: 'crate'  },   // cover on the way into the core
      { x:   0, z:  13, w: 5, d: 2, h: 2,   mat: 'crate'  },
    ],
    signs: [],
  },

};

const DEFAULT_MAP = 'foundry';
const MAP_IDS = Object.keys(MAPS);

/* Never return undefined: an unknown id (an older client, a typo in an env
   var, a room from a newer server) falls back to the default rather than
   leaving one side with no arena at all. */
function mapById(id) {
  return (id && MAPS[id]) || MAPS[DEFAULT_MAP];
}

/* Collision boxes in the form both sides want: {minx,minz,maxx,maxz,miny,maxy}.
   They all sit ON the floor, so miny is 0 and maxy is the height. The server
   calls this for RECTS; the client's addBox builds the same thing per mesh. */
function mapRects(map) {
  return map.boxes.map(b => ({
    minx: b.x - b.w / 2, maxx: b.x + b.w / 2,
    minz: b.z - b.d / 2, maxz: b.z + b.d / 2,
    miny: 0,             maxy: b.h,
  }));
}

/* The four perimeter walls, derived from `arena` rather than written out.
   2m thick, centred on the boundary, exactly as the client builds them. */
function mapWallRects(map) {
  const a = map.arena, h = map.wallH;
  return [
    { minx: -a-1, minz: -a-1, maxx:  a+1, maxz: -a+1, miny: 0, maxy: h },   // north
    { minx: -a-1, minz:  a-1, maxx:  a+1, maxz:  a+1, miny: 0, maxy: h },   // south
    { minx: -a-1, minz: -a-1, maxx: -a+1, maxz:  a+1, miny: 0, maxy: h },   // west
    { minx:  a-1, minz: -a-1, maxx:  a+1, maxz:  a+1, miny: 0, maxy: h },   // east
  ];
}

/* The roof. Deliberately kept apart from the wall rects: those also drive the
   2D movement tests, and a box covering the whole arena there would shove
   every player sideways out of the map. Bullets and arrows must still stop at
   it, so it belongs to the 3D ray tests only. */
function mapCeilingRect(map) {
  const a = map.arena;
  return { minx: -a-1, minz: -a-1, maxx: a+1, maxz: a+1,
           miny: map.wallH, maxy: map.wallH + 1 };
}

/* Node (the server) takes these by require; the browser just gets the globals
   from the script tag. Guarded so the same file works as both. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MAPS, MAP_IDS, DEFAULT_MAP, mapById, mapRects, mapWallRects, mapCeilingRect };
}
