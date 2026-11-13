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

  /* THE HALL. A two-unit station, drawn the way one is actually arranged:
     a reactor in the middle of the building, a turbine-generator each side
     of it, and everything else - condensers, feed pumps, switchgear, the
     control room - where the plant it serves is.

     THE RULE THIS MAP IS BUILT ON: if it looks like a floor, it is one.
     The hall this replaces had steel galleries drawn along both aisles at
     5.7m with handrails on them, and no collision at all: 8,780 square
     metres of walkway you could see, aim at, and fall straight through.
     Nothing is drawn here that reads as standable and is not, and the only
     geometry without collision is overhead - the crane, the roof trusses,
     the cable trays - where nothing looks like a floor in the first place.

     THE TWO LEVELS a turbine hall has. The machines sit on a raised
     OPERATING FLOOR; the GROUND FLOOR around it is where the condensers
     are and where a casing is laid down to be overturned. So the decks are
     3.2m of solid concrete, over climbing reach on purpose, and the stairs
     are how you get up - which is also the only honest way to build a
     mezzanine out of boxes that all stand on the floor.

     THE MIDDLE IS THE REACTOR. A drum on a bioshield deck, ribbed steel,
     cable looms over the top of it, a handrail round the edge. The deck is
     2.4m - one climb - and the resupply sits on it, in the walkway round
     the vessel: the thing that powers the building is the thing that
     supplies you, and it is the one piece of high ground everybody can see
     everybody else from.

     Everything is symmetric under a half turn, (x, z) -> (-x, -z).

     HOW A ROUND THING IS A BOX. Collision is boxes standing on the floor,
     and a vessel is a cylinder. So a drum is FIVE boxes, each with its
     corners exactly on the circle, which puts their union wholly inside the
     drawn surface and within 43mm of it all the way round. The obvious
     answer - two crossed boxes, one wide, one deep - is wrong by 0.92m at
     the arm corners, and that is an invisible wall standing in clear air
     beside the tank. A turbine casing is the same trick on its side: four
     steps at the widths the drum actually has at those heights, which the
     prop is drawn to and agrees with to 0.09m.
     All but the first box carry mat 'hidden': the prop draws the drum once,
     and must not also draw the staircase that stops the bullets. */
  powerstation: {
    id: 'powerstation',
    name: 'POWER STATION',
    blurb: 'Reactor hall. Two turbine floors, a shield deck in the middle, long aisles.',
    arena: 60,
    /* A turbine hall is TALL: the height, the column rows and the crane are
       what stop it reading as a warehouse with machines in it. */
    wallH: 14,
    gain: 0.95,
    /* Rooflights, in overcast daylight rather than lamp colour: this hall is
       day-lit, which is why the steel reads cold and the shadows are soft.
       FIVE BAYS ACROSS, not one. A single strip down the middle looked
       wonderful over the machines and left both aisles, and the whole roof,
       in the black - and the aisles are where half the fight happens. The
       bays are narrow (7m on a 24m pitch) so the roof still reads as a roof
       with glazing in it rather than a glass lid. lighting.js bakes from
       these; nothing here is a real light. */
    lamps: { spacing: 24, reach: 2, reachX: 2, w: 7, d: 18, show: true,
             rgb: [0.80, 0.90, 1.00], refl: [2.4, 2.8, 3.3] },
    /* On the shield deck, in the walkway round the vessel. `y` lifts the
       marker ring onto the deck; the server's 5m test is 2D, so the ring is
       exactly the ground you can take it from. */
    resupply: { x: 0, z: 0, y: 2.4 },
    boxes: [

      // the bioshield deck: a chamfered square,
      { x:      0, z:      0, w:    22, d:    16, h:  2.4, mat: 'bioshield'    },

      // two crossed boxes, climbable from any side
      { x:      0, z:      0, w:    16, d:    22, h:  2.4, mat: 'bioshield'    },

      // the reactor vessel, as boxes; the prop draws the drum
      { x:      0, z:      0, w: 6.124, d:  0.97, h:  7.0, mat: 'hidden'      , r: 3.1 },
      { x:      0, z:      0, w: 5.524, d: 2.815, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 4.384, d: 4.384, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 2.815, d: 5.524, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w:  0.97, d: 6.124, h:  7.0, mat: 'hidden'       },

      // steps up to the shield deck, east and west
      { x:  -11.6, z:      0, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:   11.6, z:      0, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:  -12.8, z:      0, w:   1.2, d:     6, h:  0.8, mat: 'step'         },
      { x:   12.8, z:      0, w:   1.2, d:     6, h:  0.8, mat: 'step'         },

      // THE OPERATING FLOOR: the deck the machine stands on
      { x:      0, z:    -33, w:    26, d:    28, h:  3.2, mat: 'deck'         },

      // the turbine-generator pedestal
      { x:      0, z:    -33, w:   7.5, d:    24, h:  4.2, mat: 'plinth'       },

      // and the casing, in four steps that follow the drum
      { x:      0, z:    -33, w:   4.4, d:    20, h:  5.6, mat: 'hidden'       },
      { x:      0, z:    -33, w:   4.0, d:    20, h:  6.3, mat: 'hidden'       },
      { x:      0, z:    -33, w:   3.4, d:    20, h:  7.0, mat: 'hidden'       },
      { x:      0, z:    -33, w:   1.9, d:    20, h:  7.6, mat: 'hidden'       },
      { x:      0, z:     33, w:    26, d:    28, h:  3.2, mat: 'deck'         },
      { x:      0, z:     33, w:   7.5, d:    24, h:  4.2, mat: 'plinth'       },
      { x:      0, z:     33, w:   4.4, d:    20, h:  5.6, mat: 'hidden'       },
      { x:      0, z:     33, w:   4.0, d:    20, h:  6.3, mat: 'hidden'       },
      { x:      0, z:     33, w:   3.4, d:    20, h:  7.0, mat: 'hidden'       },
      { x:      0, z:     33, w:   1.9, d:    20, h:  7.6, mat: 'hidden'       },

      // stairs to the operating floor
      { x:  -13.6, z:    -33, w:   1.2, d:     6, h:  2.4, mat: 'step'         },
      { x: -14.799999999999999, z:    -33, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:  -16.0, z:    -33, w:   1.2, d:     6, h:  0.8, mat: 'step'         },
      { x:   13.6, z:    -33, w:   1.2, d:     6, h:  2.4, mat: 'step'         },
      { x: 14.799999999999999, z:    -33, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:   16.0, z:    -33, w:   1.2, d:     6, h:  0.8, mat: 'step'         },
      { x:  -13.6, z:     33, w:   1.2, d:     6, h:  2.4, mat: 'step'         },
      { x: -14.799999999999999, z:     33, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:  -16.0, z:     33, w:   1.2, d:     6, h:  0.8, mat: 'step'         },
      { x:   13.6, z:     33, w:   1.2, d:     6, h:  2.4, mat: 'step'         },
      { x: 14.799999999999999, z:     33, w:   1.2, d:     6, h:  1.6, mat: 'step'         },
      { x:   16.0, z:     33, w:   1.2, d:     6, h:  0.8, mat: 'step'         },

      // the column rows: floor to roof, every 12.5m
      { x:    -26, z:  -50.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:  -50.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:  -37.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:  -37.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:  -25.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:  -25.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:  -12.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:  -12.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:    0.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:    0.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:   12.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:   12.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:   25.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:   25.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:   37.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:   37.5, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:    -26, z:   50.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },
      { x:     26, z:   50.0, w:   1.2, d:   1.2, h:   14, mat: 'column'       },

      // condensers, under the low-pressure end
      { x:  -20.5, z:    -33, w:     6, d:    14, h:  2.6, mat: 'machine'      },
      { x:   20.5, z:     33, w:     6, d:    14, h:  2.6, mat: 'machine'      },
      { x:   20.5, z:    -33, w:     6, d:    14, h:  2.6, mat: 'machine'      },
      { x:  -20.5, z:     33, w:     6, d:    14, h:  2.6, mat: 'machine'      },

      // feed pumps: waist high, shoot over them
      { x:    -21, z:    -14, w:   3.4, d:     3, h:  1.2, mat: 'machine'      },
      { x:     21, z:     14, w:   3.4, d:     3, h:  1.2, mat: 'machine'      },
      { x:     21, z:    -14, w:   3.4, d:     3, h:  1.2, mat: 'machine'      },
      { x:    -21, z:     14, w:   3.4, d:     3, h:  1.2, mat: 'machine'      },

      // control room west, electrical annexe east
      { x:    -42, z:      0, w:    16, d:    12, h:  3.6, mat: 'control'      },
      { x:     42, z:      0, w:    16, d:    12, h:  3.6, mat: 'control'      },

      // and the stair up to it
      { x:    -42, z:   -6.6, w:     6, d:   1.2, h:  2.4, mat: 'step'         },
      { x:     42, z:    6.6, w:     6, d:   1.2, h:  2.4, mat: 'step'         },
      { x:    -42, z:   -7.8, w:     6, d:   1.2, h:  1.2, mat: 'step'         },
      { x:     42, z:    7.8, w:     6, d:   1.2, h:  1.2, mat: 'step'         },

      // switchgear, in runs along the far walls
      { x:    -56, z:    -26, w:   1.6, d:    16, h:  2.2, mat: 'switch'       },
      { x:     56, z:     26, w:   1.6, d:    16, h:  2.2, mat: 'switch'       },
      { x:    -56, z:     26, w:   1.6, d:    16, h:  2.2, mat: 'switch'       },
      { x:     56, z:    -26, w:   1.6, d:    16, h:  2.2, mat: 'switch'       },

      // feedwater tanks
      { x:    -44, z:    -18, w: 6.914, d: 1.095, h:  6.5, mat: 'tank'        , r: 3.5 },
      { x:     44, z:     18, w: 6.914, d: 1.095, h:  6.5, mat: 'tank'        , r: 3.5 },
      { x:    -44, z:    -18, w: 6.237, d: 3.178, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 6.237, d: 3.178, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 3.178, d: 6.237, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 3.178, d: 6.237, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 1.095, d: 6.914, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 1.095, d: 6.914, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 6.914, d: 1.095, h:  6.5, mat: 'tank'        , r: 3.5 },
      { x:    -44, z:     18, w: 6.914, d: 1.095, h:  6.5, mat: 'tank'        , r: 3.5 },
      { x:     44, z:    -18, w: 6.237, d: 3.178, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 6.237, d: 3.178, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 3.178, d: 6.237, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 3.178, d: 6.237, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 1.095, d: 6.914, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 1.095, d: 6.914, h:  6.5, mat: 'hidden'       },

      // stair towers: the corners are the high ground
      { x:    -52, z:    -52, w:    10, d:    10, h:  4.4, mat: 'tower'        },
      { x:     52, z:     52, w:    10, d:    10, h:  4.4, mat: 'tower'        },
      { x:     52, z:    -52, w:    10, d:    10, h:  4.4, mat: 'tower'        },
      { x:    -52, z:     52, w:    10, d:    10, h:  4.4, mat: 'tower'        },

      // with a landing you can climb onto
      { x:    -52, z:  -45.5, w:    10, d:     3, h:  2.2, mat: 'step'         },
      { x:     52, z:   45.5, w:    10, d:     3, h:  2.2, mat: 'step'         },
      { x:     52, z:  -45.5, w:    10, d:     3, h:  2.2, mat: 'step'         },
      { x:    -52, z:   45.5, w:    10, d:     3, h:  2.2, mat: 'step'         },

      // the step-up transformers, in their own bay...
      { x:    -14, z:    -54, w:   5.5, d:   4.5, h:  2.8, mat: 'transformer'  },
      { x:     14, z:     54, w:   5.5, d:   4.5, h:  2.8, mat: 'transformer'  },
      { x:     14, z:    -54, w:   5.5, d:   4.5, h:  2.8, mat: 'transformer'  },
      { x:    -14, z:     54, w:   5.5, d:   4.5, h:  2.8, mat: 'transformer'  },

      // ...behind a blast wall, as they are in a real plant
      { x:    -14, z:    -50, w:     8, d:   1.2, h:    5, mat: 'firewall'     },
      { x:     14, z:     50, w:     8, d:   1.2, h:    5, mat: 'firewall'     },
      { x:     14, z:    -50, w:     8, d:   1.2, h:    5, mat: 'firewall'     },
      { x:    -14, z:     50, w:     8, d:   1.2, h:    5, mat: 'firewall'     },
    ],
    /* What the lit arena draws that is not one box: the reactor drum the
       crossed boxes stand in for, the turbine casings, and everything
       overhead. The drum and the casings are drawn where their boxes are,
       so they stop a bullet. The crane and the roof steel are at 9m and up,
       out of reach of anything but a stray round - and, unlike the galleries
       this hall used to have, nothing up there is shaped like a floor. */
    props: [
      { kind: 'reactor', x: 0, z: 0, deck: 2.4 },
      { kind: 'turbine', x: 0, z: -33, axis: 'z', dir:  1, unit: 1 },
      { kind: 'turbine', x: 0, z:  33, axis: 'z', dir: -1, unit: 2 },
      { kind: 'crane',   z: -33 }, { kind: 'crane', z: 33 },
      { kind: 'truss',   span: 26 },
      { kind: 'tray',    x: -30 }, { kind: 'tray', x: 30 },
    ],
    /* Paint on the floor, in metres. `walk` is a green pedestrian aisle,
       `hatch` a yellow keep-out border round live plant, `text` a stencil.
       The aisles run where the floor is open; none of this is cover. */
    paint: [
      { k: 'walk',  x0: -33, z0: -56, x1: -33, z1:  56, w: 2.2 },
      { k: 'walk',  x0:  33, z0: -56, x1:  33, z1:  56, w: 2.2 },
      { k: 'walk',  x0: -56, z0: -11, x1:  56, z1: -11, w: 2.2 },
      { k: 'walk',  x0: -56, z0:  11, x1:  56, z1:  11, w: 2.2 },
      { k: 'hatch', x: 0, z: 0, w: 24.6, d: 18.6 },
      { k: 'hatch', x: 0, z: -33, w: 28.6, d: 30.6 },
      { k: 'hatch', x: 0, z:  33, w: 28.6, d: 30.6 },
      { k: 'hatch', x: -14, z: -54, w: 8.1, d: 7.1 }, { k: 'hatch', x: 14, z: -54, w: 8.1, d: 7.1 },
      { k: 'hatch', x: -14, z:  54, w: 8.1, d: 7.1 }, { k: 'hatch', x: 14, z:  54, w: 8.1, d: 7.1 },
      { k: 'text',  x: 0, z: -15.5, s: 2.6, t: 'REACTOR' },
      { k: 'text',  x: 0, z:  15.5, s: 2.6, t: 'REACTOR' },
      { k: 'text',  x: 0, z: -50.5, s: 2.4, t: 'UNIT 1' },
      { k: 'text',  x: 0, z:  50.5, s: 2.4, t: 'UNIT 2' },
      { k: 'text',  x: -36, z: -18, s: 1.2, t: 'FW-1' }, { k: 'text', x: 36, z: -18, s: 1.2, t: 'FW-2' },
      { k: 'text',  x: -36, z:  18, s: 1.2, t: 'FW-3' }, { k: 'text', x: 36, z:  18, s: 1.2, t: 'FW-4' },
    ],
    /* Wall signage. `kind` picks the artwork (SIGN_ART in world.js owns the
       drawing and the panel size); `ry` is degrees, so the data stays free of
       Math.PI. The big boards hang on the END walls: the crane's runway beams
       run down the long ones and would cut across anything hung there. */
    signs: [
      { kind: 'window',  x:     0, y: 9.6,  z: -58.92, ry:   0 },
      { kind: 'window',  x:     0, y: 9.6,  z:  58.92, ry: 180 },
      { kind: 'unit1',   x:     0, y: 4.2,  z: -58.9, ry:   0 },
      { kind: 'unit2',   x:     0, y: 4.2,  z:  58.9, ry: 180 },
      { kind: 'control', x:   -34, y: 5.0,  z: -58.9, ry:   0 },
      { kind: 'mimic',   x:    34, y: 4.9,  z:  58.9, ry: 180 },
      { kind: 'hv',      x: -58.9, y: 2.12, z:   -38, ry:  90 },
      { kind: 'hv',      x: -58.9, y: 2.12, z:    38, ry:  90 },
      { kind: 'hv',      x:  58.9, y: 2.12, z:   -38, ry: -90 },
      { kind: 'hv',      x:  58.9, y: 2.12, z:    38, ry: -90 },
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
