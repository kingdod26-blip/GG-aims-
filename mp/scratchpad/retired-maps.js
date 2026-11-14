/* =============================================================
   THE THREE MAPS `works` WAS BUILT FROM.

   Jack asked for one map, so the game ships one: `works`, which is these
   three on a single site. They are kept here rather than deleted for two
   reasons. The first is that `works.js` BUILDS from them - the hall's boxes
   are powerstation's and the compound's are substation's, read and placed
   rather than re-typed - so without this file the combined map could not be
   regenerated, only edited by hand. The second is that they are three
   finished maps, and bringing one back is a paste away.

   NOT LOADED BY THE GAME. It lives in mp/scratchpad, which is not under
   mp/public, so it is never served to a browser and never required by the
   server. Nothing here has any effect until works.js reads it.
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
    /* ONE row of rooflights down the middle, in overcast daylight rather
       than lamp colour, so the machines are lit and the aisles under the
       column rows fall away into shade. lighting.js bakes from these. */
    lamps: { spacing: 24, reach: 2, reachX: 0, w: 10, d: 20, show: true,
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
      { x:      0, z:      0, w: 6.025, d: 1.461, h:  7.0, mat: 'hidden'      , r: 3.1, n: 9 },
      { x:      0, z:      0, w:  5.66, d: 2.531, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 5.269, d: 3.268, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 4.847, d: 3.866, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 4.384, d: 4.384, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 3.866, d: 4.847, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 3.268, d: 5.269, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 2.531, d:  5.66, h:  7.0, mat: 'hidden'       },
      { x:      0, z:      0, w: 1.461, d: 6.025, h:  7.0, mat: 'hidden'       },

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
      { x:    -44, z:    -18, w: 6.803, d:  1.65, h:  6.5, mat: 'tank'        , r: 3.5, n: 9 },
      { x:     44, z:     18, w: 6.803, d:  1.65, h:  6.5, mat: 'tank'        , r: 3.5, n: 9 },
      { x:    -44, z:    -18, w:  6.39, d: 2.858, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w:  6.39, d: 2.858, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 5.949, d: 3.689, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 5.949, d: 3.689, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 5.472, d: 4.365, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 5.472, d: 4.365, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 4.365, d: 5.472, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 4.365, d: 5.472, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 3.689, d: 5.949, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 3.689, d: 5.949, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w: 2.858, d:  6.39, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w: 2.858, d:  6.39, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:    -18, w:  1.65, d: 6.803, h:  6.5, mat: 'hidden'       },
      { x:     44, z:     18, w:  1.65, d: 6.803, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 6.803, d:  1.65, h:  6.5, mat: 'tank'        , r: 3.5, n: 9 },
      { x:    -44, z:     18, w: 6.803, d:  1.65, h:  6.5, mat: 'tank'        , r: 3.5, n: 9 },
      { x:     44, z:    -18, w:  6.39, d: 2.858, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w:  6.39, d: 2.858, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 5.949, d: 3.689, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 5.949, d: 3.689, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 5.472, d: 4.365, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 5.472, d: 4.365, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w:  4.95, d:  4.95, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 4.365, d: 5.472, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 4.365, d: 5.472, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 3.689, d: 5.949, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 3.689, d: 5.949, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w: 2.858, d:  6.39, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w: 2.858, d:  6.39, h:  6.5, mat: 'hidden'       },
      { x:     44, z:    -18, w:  1.65, d: 6.803, h:  6.5, mat: 'hidden'       },
      { x:    -44, z:     18, w:  1.65, d: 6.803, h:  6.5, mat: 'hidden'       },

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
      { kind: 'reactor', x: 0, z: 0, deck: 2.4, n: 9 },
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

  /* THE WHOLE STATION: the site, and the turbine hall standing on it.
     Jack sent an aerial photograph of a two-unit thermal station - two
     natural-draught cooling towers steaming, a switchyard, the boiler house
     and its stack, an oil tank farm - and then said what he actually wanted
     was the two put together: "what you already build is for indoors, and
     the map is to help you build the outdoor part". So this is one map. You
     walk out of the hall into the yard.

     A ROOF OVER WALKABLE SPACE, which is the thing that makes it possible.
     A collision box stands on the floor, so no box can ever be a roof - give
     the hall's roof one and the hall fills up solid. But a roof only has to
     stop a BULLET, never a player, and the arena has had exactly that since
     it has had a ceiling: a rect with its own miny that joins the 3D ray
     tests and stays out of the 2D movement tests. `roofRects` is that,
     generalised. The walls are ordinary boxes with doors left between them.

     IT IS OPEN TO THE SKY outside, which no arena here has been:
       `sky: true`   no roof drawn, no light fittings, a sky box instead, a
                     treeline for the boundary, and the outdoor haze.
       `skyY`        where the bake puts its light. An overcast sky IS one
                     enormous soft source, so it is baked as the same grid of
                     panels a roof uses, lifted to 46m and spread wide enough
                     to be continuous. That is what darkens the ground under
                     the pipe bridges and inside the tower basins, which a
                     directional light cannot do at all.
       `roofY`       the lid a bullet stops at, at 76m - over the stack.
                     Without it every long shot would stop dead at the height
                     of the site fence.
     The hall's roof is NOT in the bake's occluder list (that list is boxes,
     and a roof is not a box), so the inside is lit as though the roof were
     glazed - which is why it is drawn glazed. A daylit turbine hall is what
     the indoor map already is.

     NOT SYMMETRIC, and it does not need to be: spawns are random and spread
     (`randomSpawn`, `spreadSpawns`), there are no sides, so the map can be
     the shape the photograph is rather than the shape fairness would demand.

     THE SAME RULE AS INDOORS: if it looks like a floor, it is one. The tower
     basins are 2.6m - one climb - and the walkway round each is the 2m of
     rim left outside the shell. The shell above is four bands of boxes whose
     radius is the hyperboloid's radius at the TOP of each band, so collision
     is never wider than the surface you can see. */
  station: {
    id: 'station',
    name: 'STATION',
    blurb: 'The whole site. Cooling towers, switchyard, the stack - and the hall to fight inside.',
    arena: 78,
    /* The boundary is an embankment of trees, which is what is actually round
       a site like this and the one honest way to build a wall this tall that
       nobody questions. */
    wallH: 11,
    sky: true,
    skyY: 46,
    roofY: 76,
    gain: 0.45,
    /* The sky as the bake sees it: 7 by 7 panels of 26m at 46m, continuous
       from anywhere on the ground. `show` is off - there is a sky box to look
       at, and a grid of glowing rectangles over the site is not it. */
    lamps: { spacing: 26, reach: 3, w: 26, d: 26, show: false,
             rgb: [0.74, 0.84, 1.00], refl: [1.5, 1.8, 2.3] },
    /* In the yard between the step-up transformers, out in the open between
       the towers and the hall: the one place every route meets. */
    resupply: { x: 0, z: 0 },
    /* The hall's roof. Bullets only - see mapRoofRects. */
    roofRects: [
      { minx: 24, maxx: 72, minz: -25, maxz: 25, y: 16 },
    ],
    boxes: [

      // THE HALL ITSELF: cladding, with doors left in it
      { x:   24.6, z:  -19.5, w:    1.2, d:   11.0, h: 16.0, mat: 'cladding'    },
      { x:   24.6, z:    0.0, w:    1.2, d:   16.0, h: 16.0, mat: 'cladding'    },
      { x:   24.6, z:   19.5, w:    1.2, d:   11.0, h: 16.0, mat: 'cladding'    },
      { x:   71.4, z:    0.0, w:    1.2, d:   50.0, h: 16.0, mat: 'cladding'    },
      { x:   35.0, z:  -24.4, w:   22.0, d:    1.2, h: 16.0, mat: 'cladding'    },
      { x:   63.0, z:  -24.4, w:   18.0, d:    1.2, h: 16.0, mat: 'cladding'    },
      { x:   31.0, z:   24.4, w:   14.0, d:    1.2, h: 16.0, mat: 'cladding'    },
      { x:   57.0, z:   24.4, w:   30.0, d:    1.2, h: 16.0, mat: 'cladding'    },

      // the operating floors, inside
      { x:     48, z:    -14, w:     22, d:     16, h:  3.0, mat: 'deck'        },
      { x:     48, z:    -14, w:      7, d:     14, h:  4.0, mat: 'plinth'      },
      { x:     48, z:    -14, w:    4.4, d:     12, h:  5.4, mat: 'hidden'      },
      { x:     48, z:    -14, w:    4.0, d:     12, h:  6.1, mat: 'hidden'      },
      { x:     48, z:    -14, w:    3.4, d:     12, h:  6.8, mat: 'hidden'      },
      { x:     48, z:    -14, w:    1.9, d:     12, h:  7.4, mat: 'hidden'      },

      // and the stairs up to them
      { x:   36.4, z:    -14, w:    1.2, d:      6, h:  2.4, mat: 'step'        },
      { x:   35.2, z:    -14, w:    1.2, d:      6, h:  1.6, mat: 'step'        },
      { x:   34.0, z:    -14, w:    1.2, d:      6, h:  0.8, mat: 'step'        },

      // condensers at ground level
      { x:     64, z:    -14, w:      5, d:     12, h:  2.6, mat: 'machine'     },
      { x:     48, z:     14, w:     22, d:     16, h:  3.0, mat: 'deck'        },
      { x:     48, z:     14, w:      7, d:     14, h:  4.0, mat: 'plinth'      },
      { x:     48, z:     14, w:    4.4, d:     12, h:  5.4, mat: 'hidden'      },
      { x:     48, z:     14, w:    4.0, d:     12, h:  6.1, mat: 'hidden'      },
      { x:     48, z:     14, w:    3.4, d:     12, h:  6.8, mat: 'hidden'      },
      { x:     48, z:     14, w:    1.9, d:     12, h:  7.4, mat: 'hidden'      },
      { x:   36.4, z:     14, w:    1.2, d:      6, h:  2.4, mat: 'step'        },
      { x:   35.2, z:     14, w:    1.2, d:      6, h:  1.6, mat: 'step'        },
      { x:   34.0, z:     14, w:    1.2, d:      6, h:  0.8, mat: 'step'        },
      { x:     64, z:     14, w:      5, d:     12, h:  2.6, mat: 'machine'     },

      // the laydown bay between the units
      { x:     48, z:      0, w:      6, d:      4, h:  1.2, mat: 'machine'     },

      // COOLING TOWER 1: basin you can climb, then the shell in four bands
      { x:    -40, z:    -20, w: 25.267, d:  6.128, h:  2.6, mat: 'mass'       , r: 13.0, n: 9 },
      { x:    -40, z:    -20, w: 23.735, d: 10.614, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 22.096, d: 13.703, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 20.325, d: 16.214, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 18.385, d: 18.385, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 16.214, d: 20.325, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 13.703, d: 22.096, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 10.614, d: 23.735, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w:  6.128, d: 25.267, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 20.486, d:  4.969, h:  5.6, mat: 'hidden'     , r: 10.54, n: 9 },
      { x:    -40, z:    -20, w: 19.243, d:  8.606, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 17.915, d:  11.11, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 16.479, d: 13.146, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 14.906, d: 14.906, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w: 13.146, d: 16.479, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w:  11.11, d: 17.915, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w:  8.606, d: 19.243, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:    -20, w:  4.969, d: 20.486, h:  5.6, mat: 'hidden'      },

      // COOLING TOWER 2
      { x:    -40, z:     22, w: 25.267, d:  6.128, h:  2.6, mat: 'mass'       , r: 13.0, n: 9 },
      { x:    -40, z:     22, w: 23.735, d: 10.614, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 22.096, d: 13.703, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 20.325, d: 16.214, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 18.385, d: 18.385, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 16.214, d: 20.325, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 13.703, d: 22.096, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 10.614, d: 23.735, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w:  6.128, d: 25.267, h:  2.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 20.486, d:  4.969, h:  5.6, mat: 'hidden'     , r: 10.54, n: 9 },
      { x:    -40, z:     22, w: 19.243, d:  8.606, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 17.915, d:  11.11, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 16.479, d: 13.146, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 14.906, d: 14.906, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w: 13.146, d: 16.479, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w:  11.11, d: 17.915, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w:  8.606, d: 19.243, h:  5.6, mat: 'hidden'      },
      { x:    -40, z:     22, w:  4.969, d: 20.486, h:  5.6, mat: 'hidden'      },

      // THE BOILER HOUSE, north of the hall and taller than it
      { x:     50, z:    -42, w:     40, d:     24, h:   28, mat: 'boiler'      },

      // THE STACK. 68m of box, so there is no height at which it stops being there.
      { x:     68, z:    -64, w:  5.831, d:  1.414, h: 68.0, mat: 'mass'       , r: 3.0, n: 9 },
      { x:     68, z:    -64, w:  5.477, d:  2.449, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  5.099, d:  3.162, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:   4.69, d:  3.742, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  4.243, d:  4.243, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  3.742, d:   4.69, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  3.162, d:  5.099, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  2.449, d:  5.477, h: 68.0, mat: 'hidden'      },
      { x:     68, z:    -64, w:  1.414, d:  5.831, h: 68.0, mat: 'hidden'      },

      // the oil tanks
      { x:    -68, z:     48, w: 11.662, d:  2.828, h: 10.0, mat: 'tank'       , r: 6, r: 6.0, n: 9 },
      { x:    -68, z:     48, w: 10.954, d:  4.899, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w: 10.198, d:  6.325, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  9.381, d:  7.483, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  8.485, d:  8.485, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  7.483, d:  9.381, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  6.325, d: 10.198, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  4.899, d: 10.954, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     48, w:  2.828, d: 11.662, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w: 11.662, d:  2.828, h: 10.0, mat: 'tank'       , r: 6, r: 6.0, n: 9 },
      { x:    -68, z:     62, w: 10.954, d:  4.899, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w: 10.198, d:  6.325, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  9.381, d:  7.483, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  8.485, d:  8.485, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  7.483, d:  9.381, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  6.325, d: 10.198, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  4.899, d: 10.954, h: 10.0, mat: 'hidden'      },
      { x:    -68, z:     62, w:  2.828, d: 11.662, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w: 11.662, d:  2.828, h: 10.0, mat: 'tank'       , r: 6, r: 6.0, n: 9 },
      { x:    -54, z:     58, w: 10.954, d:  4.899, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w: 10.198, d:  6.325, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  9.381, d:  7.483, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  8.485, d:  8.485, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  7.483, d:  9.381, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  6.325, d: 10.198, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  4.899, d: 10.954, h: 10.0, mat: 'hidden'      },
      { x:    -54, z:     58, w:  2.828, d: 11.662, h: 10.0, mat: 'hidden'      },

      // the step-up transformers; the resupply sits between them
      { x:    -10, z:      0, w:      7, d:    5.5, h:  3.2, mat: 'transformer' },
      { x:     10, z:      0, w:      7, d:    5.5, h:  3.2, mat: 'transformer' },

      // and their blast wall
      { x:      0, z:     -9, w:     16, d:    1.4, h:    5, mat: 'firewall'    },

      // SWITCHYARD: two rows of portals...
      { x:    -62, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -49, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -36, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -23, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -10, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:      3, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:     16, z:    -62, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -62, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -49, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -36, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -23, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:    -10, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:      3, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },
      { x:     16, z:    -48, w:    1.4, d:    1.4, h:   13, mat: 'lattice'     },

      // ...and the gear in rows beneath them
      { x:    -60, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },
      { x:    -47, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },
      { x:    -34, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },
      { x:    -21, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },
      { x:     -8, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },
      { x:      5, z:    -55, w:    3.4, d:    3.0, h:  2.4, mat: 'gear'        },

      // the switchyard control room
      { x:    -20, z:    -40, w:     11, d:      8, h:  4.5, mat: 'control'     },
      { x:    -20, z:  -35.4, w:     11, d:    1.2, h:  3.0, mat: 'step'        },
      { x:    -20, z:  -34.2, w:     11, d:    1.2, h:  1.5, mat: 'step'        },

      // THE INTAKE HOUSE on the quay
      { x:      6, z:     68, w:     26, d:      9, h:  4.0, mat: 'intake'      },
      { x:    -22, z:     70, w:      8, d:      5, h:  2.2, mat: 'gear'        },
      { x:     34, z:     70, w:      8, d:      5, h:  2.2, mat: 'gear'        },

      // the screen house
      { x:    -50, z:     70, w:     12, d:      8, h:  5.0, mat: 'shed'        },

      // the workshops
      { x:     60, z:     46, w:     14, d:     10, h:  6.0, mat: 'shed'        },
      { x:    -66, z:    -10, w:     12, d:     10, h:  6.0, mat: 'shed'        },

      // pipe bridges and plinths: cover on open ground
      { x:    -18, z:    -30, w:      3, d:     16, h:  2.6, mat: 'pipe'        },
      { x:     14, z:    -30, w:      3, d:     16, h:  2.6, mat: 'pipe'        },
      { x:    -14, z:     40, w:     16, d:      3, h:  2.2, mat: 'pipe'        },
      { x:     14, z:     40, w:     16, d:      3, h:  2.2, mat: 'pipe'        },
      { x:      0, z:     52, w:      7, d:      7, h:  3.0, mat: 'pipe'        },
      { x:    -24, z:      6, w:      4, d:      4, h:  1.4, mat: 'pipe'        },
      { x:     24, z:      8, w:      4, d:      4, h:  1.4, mat: 'pipe'        },
      { x:     -4, z:    -22, w:      5, d:      5, h:  1.8, mat: 'pipe'        },
      { x:    -62, z:     26, w:      6, d:     14, h:  3.4, mat: 'pipe'        },
    ],
    /* Overhead, and none of it collision: the plumes over the towers, the
       busbars strung between the switchyard portals, the hall's own roof.
       Nothing up there is shaped like a floor. */
    props: [
      /* The towers, drawn from the profile their collision boxes were
         generated from: a hyperboloid of one sheet, r = rt*sqrt(1+((y-yt)/a)^2),
         which is what a natural-draught tower actually is. */
      { kind: 'coolingtower', x: -40, z: -20, basin: 13, basinH: 2.6, beam: 10.54, n: 9,
        y0: 5.6, y1: 33, rt: 7.3, yt: 26, a: 19.6 },
      { kind: 'coolingtower', x: -40, z:  22, basin: 13, basinH: 2.6, beam: 10.54, n: 9,
        y0: 5.6, y1: 33, rt: 7.3, yt: 26, a: 19.6 },
      { kind: 'stack',   x: 68, z: -64, r: 3, h: 68, n: 9 },
      { kind: 'busbars', z: -62 }, { kind: 'busbars', z: -48 },
      { kind: 'hallroof', x0: 24, x1: 72, z0: -25, z1: 25, y: 16 },
    ],
    paint: [
      { k: 'walk',  x0: -74, z0: -33, x1:  20, z1: -33, w: 3.0 },
      { k: 'walk',  x0: -74, z0:  36, x1:  74, z1:  36, w: 3.0 },
      { k: 'walk',  x0:  18, z0: -74, x1:  18, z1:  74, w: 3.0 },
      { k: 'walk',  x0: -74, z0: -74, x1: -74, z1:  74, w: 3.0 },
      { k: 'hatch', x: -10, z: 0, w: 8.6, d: 7.1 }, { k: 'hatch', x: 10, z: 0, w: 8.6, d: 7.1 },
      { k: 'hatch', x: -40, z: -20, w: 27.4, d: 27.4 },
      { k: 'hatch', x: -40, z:  22, w: 27.4, d: 27.4 },
      { k: 'text',  x: 0, z: 12, s: 2.4, t: 'HV YARD' },
      { k: 'text',  x: -40, z: 1, s: 2.2, t: 'CT 1' },
      { k: 'text',  x: 10, z: 30, s: 2.0, t: 'TURBINE HALL' },
    ],
    signs: [],
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

module.exports = { MAPS };
