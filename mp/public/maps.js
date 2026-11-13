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
   `mat` names what a box IS: 'crate' (photoscanned wood), 'block',
   'pillar', 'wall' (the scanned concrete the perimeter is made of), and the
   power station's own kinds, which are described where that map is.

   `arena` is a HALF-extent: 60 means the floor runs -60..60 on both axes,
   a 120x120 room. The perimeter walls, the roof and the lamp grid are all
   derived from it rather than written out, so a smaller map needs one
   number changed and not four wall entries.

   PURE DATA. No THREE, no document, no require, no window — the server
   loads this exact file, so anything browser-only in here breaks it.
   ============================================================= */

const MAPS = {

  /* The turbine hall of a power station, and the main arena. It is the old
     Foundry rebuilt on its own skeleton: 120m across, open, long sightlines
     down both axes, cover in a ring round a core that doubles as the
     resupply pickup. What stood there as anonymous crates and walls is now
     the plant: two turbine-generator units north and south, four
     transformers round the core with a blast wall behind each pair,
     switchgear in rows, the auxiliaries in two corners.

     Everything is symmetric under a half turn, (x, z) -> (-x, -z), so
     neither end of the hall owns a better angle.

     HOW A ROUND THING IS A BOX. Collision here is boxes that stand on the
     floor, and a turbine casing is a cylinder. So a unit is FOUR boxes on
     one footprint: the concrete pedestal, then three narrower, taller ones
     inside it that step in the way the casing curves. Every box still
     starts at the floor, which is all the server asks of one, and their
     union follows the drawn cylinder to within about 0.2m. Those three
     carry mat 'hidden': the lit arena draws the casing itself (the
     `turbine` prop below) and must not also draw the staircase that stops
     the bullets. The flat look, which has no props, draws the staircase.

     `mat` names what a box IS, and the lit arena builds each kind its own
     way: 'transformer' grows cooling fins and bushings from the box's own
     size, 'switch' is a row of cabinets, 'plinth' and 'firewall' are
     concrete, 'machine' is a painted steel enclosure. */
  powerstation: {
    id: 'powerstation',
    name: 'POWER STATION',
    blurb: 'Turbine hall. Two generator units, a transformer yard, long lines down both axes.',
    arena: 60,
    wallH: 8,
    /* High-bay panels on a grid, `reach` steps out from the centre in each
       direction (2 -> a 5x5 grid at 24m spacing). They are the room's light:
       lighting.js bakes from them. */
    lamps: { spacing: 24, reach: 2, w: 6, d: 2.4 },
    /* The resupply ring. The box it sits on is the first entry in `boxes`;
       the server's RESUPPLY tests from here too. */
    resupply: { x: 0, z: 0 },
    boxes: [
      { x:   0, z:   0, w:   6, d:   6, h: 3,   mat: 'pillar' },        // the control core / resupply

      { x:   0, z: -25, w:  18, d:   5, h: 1.0, mat: 'plinth' },        // UNIT 1: pedestal...
      { x:   0, z: -25, w:  15, d: 3.4, h: 3.0, mat: 'hidden' },        // ...and the casing, in three steps
      { x:   0, z: -25, w:  15, d: 2.6, h: 3.6, mat: 'hidden' },
      { x:   0, z: -25, w:  15, d: 1.6, h: 4.0, mat: 'hidden' },
      { x:   0, z:  25, w:  18, d:   5, h: 1.0, mat: 'plinth' },        // UNIT 2
      { x:   0, z:  25, w:  15, d: 3.4, h: 3.0, mat: 'hidden' },
      { x:   0, z:  25, w:  15, d: 2.6, h: 3.6, mat: 'hidden' },
      { x:   0, z:  25, w:  15, d: 1.6, h: 4.0, mat: 'hidden' },

      { x: -18, z: -12, w:   4, d:   4, h: 2.5, mat: 'transformer' },   // the transformer yard: climbable,
      { x:  18, z: -12, w:   4, d:   4, h: 2.5, mat: 'transformer' },   // as the crates here always were
      { x: -18, z:  12, w:   4, d:   4, h: 2.5, mat: 'transformer' },
      { x:  18, z:  12, w:   4, d:   4, h: 2.5, mat: 'transformer' },
      { x: -30, z:   0, w:   2, d:  12, h: 4,   mat: 'firewall' },      // blast walls, east and west
      { x:  30, z:   0, w:   2, d:  12, h: 4,   mat: 'firewall' },

      { x:  12, z:   8, w: 2.5, d: 2.5, h: 1.5, mat: 'crate'  },        // low, by the core: shoot over these
      { x: -12, z:  -8, w: 2.5, d: 2.5, h: 1.5, mat: 'crate'  },

      { x: -34, z: -30, w:   5, d:   5, h: 3,   mat: 'pillar' },        // auxiliary housings, two corners
      { x:  34, z:  30, w:   5, d:   5, h: 3,   mat: 'pillar' },
      { x:  36, z: -36, w:  10, d: 1.4, h: 2.2, mat: 'switch' },        // switchgear: head-high, and a ledge
      { x: -36, z:  36, w:  10, d: 1.4, h: 2.2, mat: 'switch' },
      { x: -44, z:   0, w: 1.4, d:  10, h: 2.2, mat: 'switch' },
      { x:  44, z:   0, w: 1.4, d:  10, h: 2.2, mat: 'switch' },

      { x: -14, z: -33, w:   3, d:   2, h: 1.2, mat: 'machine' },       // pump enclosures by each unit: waist-high
      { x:  14, z:  33, w:   3, d:   2, h: 1.2, mat: 'machine' },
      { x:  40, z: -22, w: 2.6, d: 2.6, h: 1.6, mat: 'crate'  },        // spares, crated
      { x: -40, z:  22, w: 2.6, d: 2.6, h: 1.6, mat: 'crate'  },
      { x:  -9, z: -42, w:   3, d:   3, h: 2,   mat: 'crate'  },
      { x:   9, z:  42, w:   3, d:   3, h: 2,   mat: 'crate'  },
    ],
    /* What the lit arena draws that is NOT one box: the turbine casings that
       the 'hidden' steps above stand in for, and everything overhead. None
       of it is collision. A casing is drawn where its steps are, so it stops
       a bullet; the crane, the ducts and the trays hang at 4.6m and up, out
       of reach of anything but a stray round, like the roof girders.
       `dir` is which way a unit's generator end points along x. */
    props: [
      { kind: 'turbine', x: 0, z: -25, dir:  1, unit: 1 },
      { kind: 'turbine', x: 0, z:  25, dir: -1, unit: 2 },
      { kind: 'crane',   z: -8 },
      { kind: 'tray',    x: -20 }, { kind: 'tray', x: 20 },
    ],
    /* Paint on the floor, in metres. `walk` is a green pedestrian aisle,
       `trench` a run of steel cable-trench covers, `hatch` a yellow keep-out
       border round live plant, `text` a stencil. The aisles are routed
       through open floor; nothing here is cover. */
    paint: [
      { k: 'trench', x0:   0, z0: -22.5, x1:   0, z1:  -3,   w: 1.4 },
      { k: 'trench', x0:   0, z0:   3,   x1:   0, z1:  22.5, w: 1.4 },
      { k: 'trench', x0: -29, z0:   0,   x1:  -3, z1:   0,   w: 1.4 },
      { k: 'trench', x0:   3, z0:   0,   x1:  29, z1:   0,   w: 1.4 },
      { k: 'walk',   x0: -26, z0: -56,   x1: -26, z1:  56,   w: 2.2 },
      { k: 'walk',   x0:  26, z0: -56,   x1:  26, z1:  56,   w: 2.2 },
      { k: 'walk',   x0: -56, z0: -17,   x1:  56, z1: -17,   w: 2.2 },
      { k: 'walk',   x0: -56, z0:  17,   x1:  56, z1:  17,   w: 2.2 },
      { k: 'hatch',  x: -18, z: -12, w: 6.6, d: 6.6 }, { k: 'hatch', x: 18, z: -12, w: 6.6, d: 6.6 },
      { k: 'hatch',  x: -18, z:  12, w: 6.6, d: 6.6 }, { k: 'hatch', x: 18, z:  12, w: 6.6, d: 6.6 },
      { k: 'hatch',  x:   0, z: -25, w: 20.6, d: 7.6 }, { k: 'hatch', x:  0, z: 25, w: 20.6, d: 7.6 },
      { k: 'text',   x:   0, z: -19.6, s: 2.4, t: 'UNIT 1' },
      { k: 'text',   x:   0, z:  19.6, s: 2.4, t: 'UNIT 2' },
      { k: 'text',   x: -18, z: -16.6, s: 1.2, t: 'TX-1' }, { k: 'text', x: 18, z: -16.6, s: 1.2, t: 'TX-2' },
      { k: 'text',   x: -18, z:  16.6, s: 1.2, t: 'TX-3' }, { k: 'text', x: 18, z:  16.6, s: 1.2, t: 'TX-4' },
    ],
    /* Wall signage. `kind` picks the artwork (SIGN_ART in world.js owns the
       drawing and the panel size); `ry` is degrees, so the data stays free of
       Math.PI. ±58.9 is just inside the wall at ±59. The two big boards hang
       on the END walls: the crane's runway beams run down the long ones at
       5.5m and would cut straight across anything hung there. */
    signs: [
      { kind: 'unit1',   x:     0, y: 5.0,  z: -58.9, ry:   0 },
      { kind: 'unit2',   x:     0, y: 5.0,  z:  58.9, ry: 180 },
      { kind: 'control', x:   -29, y: 5.0,  z: -58.9, ry:   0 },
      { kind: 'mimic',   x:   -28, y: 4.9,  z:  58.9, ry: 180 },
      { kind: 'hv',      x: -58.9, y: 2.12, z:   -30, ry:  90 },
      { kind: 'hv',      x: -58.9, y: 2.12, z:    30, ry:  90 },
      { kind: 'hv',      x:  58.9, y: 2.12, z:   -30, ry: -90 },
      { kind: 'hv',      x:  58.9, y: 2.12, z:    30, ry: -90 },
    ],
  },

  /* A second arena, and a deliberately different fight. The power station is 120m
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

const DEFAULT_MAP = 'powerstation';
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
