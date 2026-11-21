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

/* ONE MAP. `works` is the three that came before it on a single site, and
   Jack asked for the list trimmed to it. The other three are not gone -
   they are in mp/scratchpad/retired-maps.js, which the generator still
   builds this one from and which the game never loads.
   `mapById` falls back to the default for an id it does not know, so a
   saved `cx.map` of 'powerstation', an old link or MAP=substation all land
   here rather than on nothing. */
const MAPS = {

  /* THE WORKS — all three maps on one site.

     Jack: "combind the three map ... as big as u can and as big as u want
     as big as you need". So: 240 metres square, with the turbine hall and
     the substation at the exact dimensions they already had, and the plant
     that joins them filling the ground between.

     NOTHING HERE IS RE-TYPED. The hall's boxes are `powerstation`'s, moved
     56m east; the compound's are `substation`'s, moved 62m west. The
     generator reads the other two maps and places them, so the reactor bay,
     both turbine units, the column rows, the three lanes and the corner
     towers are exactly what they are in the maps they came from, and they
     cannot drift from them by being copied badly.

     WHAT CHANGED to make them fit together:
       - The hall's perimeter was derived from its own `arena`. Here it is
         cladding with doors left between the segments, and a `roofRect` -
         a roof stops a bullet and not a player, which is the whole trick.
       - The substation never needed a roof. It was always an outdoor shape,
         so it becomes the walled compound it always looked like.
       - The crane, the roof trusses and the cable trays take `x0/x1/z0/z1`
         now. Drawn to the arena, as they were, a crane on this map would
         have spanned the cooling towers.

     THE YARD between the two is the only ground every route crosses, so the
     step-up transformers and the resupply are in it.

     OPEN SKY, as `station`: see that map for what `sky`, `skyY` and
     `roofY` each do. `roofY` is 80 here, over the stack. */
  works: {
    id: 'works',
    name: 'POWER STATION',
    blurb: 'The whole site. Turbine hall, switchyard, cooling towers, the stack.',
    arena: 120,
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
      { minx: -4.5, maxx: 116.5, minz: -60.5, maxz: 60.5, y: 16 },
    ],
    boxes: [

      // THE TURBINE HALL — the whole of the `powerstation` map, moved east and
      // given walls and a roof instead of being the world. Its boxes are
      // copied, not re-typed: reactor bay, both units, the column rows,
      // the control rooms, all at the dimensions they already had.
      { x:      56, z:       0, w:   21.38, d:   5.185, h:  2.4, mat: 'bioshield'  , r: 11, n: 9 },
      { x:      56, z:       0, w:  20.083, d:   8.981, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:  18.696, d:  11.595, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:  17.198, d:  13.719, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:  15.556, d:  15.556, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:  13.719, d:  17.198, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:  11.595, d:  18.696, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:   8.981, d:  20.083, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:   5.185, d:   21.38, h:  2.4, mat: 'hidden'      },
      { x:      56, z:       0, w:   6.025, d:   1.461, h:    7, mat: 'hidden'     , r: 3.1, n: 9 },
      { x:      56, z:       0, w:    5.66, d:   2.531, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   5.269, d:   3.268, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   4.847, d:   3.866, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   4.384, d:   4.384, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   3.866, d:   4.847, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   3.268, d:   5.269, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   2.531, d:    5.66, h:    7, mat: 'hidden'      },
      { x:      56, z:       0, w:   1.461, d:   6.025, h:    7, mat: 'hidden'      },
      { x:    44.4, z:       0, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:    67.6, z:       0, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:    43.2, z:       0, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:    68.8, z:       0, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:      56, z:     -33, w:      26, d:      28, h:  3.2, mat: 'deck'        },
      { x:      56, z:     -33, w:     7.5, d:      24, h:  4.2, mat: 'plinth'      },
      { x:      56, z:     -33, w:     4.4, d:      20, h:  5.6, mat: 'hidden'      },
      { x:      56, z:     -33, w:       4, d:      20, h:  6.3, mat: 'hidden'      },
      { x:      56, z:     -33, w:     3.4, d:      20, h:    7, mat: 'hidden'      },
      { x:      56, z:     -33, w:     1.9, d:      20, h:  7.6, mat: 'hidden'      },
      { x:      56, z:      33, w:      26, d:      28, h:  3.2, mat: 'deck'        },
      { x:      56, z:      33, w:     7.5, d:      24, h:  4.2, mat: 'plinth'      },
      { x:      56, z:      33, w:     4.4, d:      20, h:  5.6, mat: 'hidden'      },
      { x:      56, z:      33, w:       4, d:      20, h:  6.3, mat: 'hidden'      },
      { x:      56, z:      33, w:     3.4, d:      20, h:    7, mat: 'hidden'      },
      { x:      56, z:      33, w:     1.9, d:      20, h:  7.6, mat: 'hidden'      },
      { x:    42.4, z:     -33, w:     1.2, d:       6, h:  2.4, mat: 'step'        },
      { x:    41.2, z:     -33, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:      40, z:     -33, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:    69.6, z:     -33, w:     1.2, d:       6, h:  2.4, mat: 'step'        },
      { x:    70.8, z:     -33, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:      72, z:     -33, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:    42.4, z:      33, w:     1.2, d:       6, h:  2.4, mat: 'step'        },
      { x:    41.2, z:      33, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:      40, z:      33, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:    69.6, z:      33, w:     1.2, d:       6, h:  2.4, mat: 'step'        },
      { x:    70.8, z:      33, w:     1.2, d:       6, h:  1.6, mat: 'step'        },
      { x:      72, z:      33, w:     1.2, d:       6, h:  0.8, mat: 'step'        },
      { x:      30, z:     -50, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:     -50, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:   -37.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:   -37.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:     -25, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:     -25, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:   -12.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:   -12.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:       0, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:       0, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:    12.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:    12.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:      25, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:      25, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:    37.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:    37.5, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      30, z:      50, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:      82, z:      50, w:     1.2, d:     1.2, h:   14, mat: 'column'      },
      { x:    35.5, z:     -33, w:       6, d:      14, h:  2.6, mat: 'machine'     },
      { x:    76.5, z:      33, w:       6, d:      14, h:  2.6, mat: 'machine'     },
      { x:    76.5, z:     -33, w:       6, d:      14, h:  2.6, mat: 'machine'     },
      { x:    35.5, z:      33, w:       6, d:      14, h:  2.6, mat: 'machine'     },
      { x:      35, z:     -14, w:     3.4, d:       3, h:  1.2, mat: 'machine'     },
      { x:      77, z:      14, w:     3.4, d:       3, h:  1.2, mat: 'machine'     },
      { x:      77, z:     -14, w:     3.4, d:       3, h:  1.2, mat: 'machine'     },
      { x:      35, z:      14, w:     3.4, d:       3, h:  1.2, mat: 'machine'     },
      { x:      14, z:       0, w:      16, d:      12, h:  3.6, mat: 'control'     },
      { x:      98, z:       0, w:      16, d:      12, h:  3.6, mat: 'control'     },
      { x:      14, z:    -6.6, w:       6, d:     1.2, h:  2.4, mat: 'step'        },
      { x:      98, z:     6.6, w:       6, d:     1.2, h:  2.4, mat: 'step'        },
      { x:      14, z:    -7.8, w:       6, d:     1.2, h:  1.2, mat: 'step'        },
      { x:      98, z:     7.8, w:       6, d:     1.2, h:  1.2, mat: 'step'        },
      { x:       0, z:     -26, w:     1.6, d:      16, h:  2.2, mat: 'switch'      },
      { x:     112, z:      26, w:     1.6, d:      16, h:  2.2, mat: 'switch'      },
      { x:       0, z:      26, w:     1.6, d:      16, h:  2.2, mat: 'switch'      },
      { x:     112, z:     -26, w:     1.6, d:      16, h:  2.2, mat: 'switch'      },
      { x:      12, z:     -18, w:   6.803, d:    1.65, h:  6.5, mat: 'tank'       , r: 3.5, n: 9 },
      { x:     100, z:      18, w:   6.803, d:    1.65, h:  6.5, mat: 'tank'       , r: 3.5, n: 9 },
      { x:      12, z:     -18, w:    6.39, d:   2.858, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:    6.39, d:   2.858, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:   5.949, d:   3.689, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:   5.949, d:   3.689, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:   5.472, d:   4.365, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:   5.472, d:   4.365, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:    4.95, d:    4.95, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:    4.95, d:    4.95, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:   4.365, d:   5.472, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:   4.365, d:   5.472, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:   3.689, d:   5.949, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:   3.689, d:   5.949, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:   2.858, d:    6.39, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:   2.858, d:    6.39, h:  6.5, mat: 'hidden'      },
      { x:      12, z:     -18, w:    1.65, d:   6.803, h:  6.5, mat: 'hidden'      },
      { x:     100, z:      18, w:    1.65, d:   6.803, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   6.803, d:    1.65, h:  6.5, mat: 'tank'       , r: 3.5, n: 9 },
      { x:      12, z:      18, w:   6.803, d:    1.65, h:  6.5, mat: 'tank'       , r: 3.5, n: 9 },
      { x:     100, z:     -18, w:    6.39, d:   2.858, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:    6.39, d:   2.858, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   5.949, d:   3.689, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:   5.949, d:   3.689, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   5.472, d:   4.365, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:   5.472, d:   4.365, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:    4.95, d:    4.95, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:    4.95, d:    4.95, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   4.365, d:   5.472, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:   4.365, d:   5.472, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   3.689, d:   5.949, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:   3.689, d:   5.949, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:   2.858, d:    6.39, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:   2.858, d:    6.39, h:  6.5, mat: 'hidden'      },
      { x:     100, z:     -18, w:    1.65, d:   6.803, h:  6.5, mat: 'hidden'      },
      { x:      12, z:      18, w:    1.65, d:   6.803, h:  6.5, mat: 'hidden'      },
      { x:       4, z:     -52, w:      10, d:      10, h:  4.4, mat: 'tower'       },
      { x:     108, z:      52, w:      10, d:      10, h:  4.4, mat: 'tower'       },
      { x:     108, z:     -52, w:      10, d:      10, h:  4.4, mat: 'tower'       },
      { x:       4, z:      52, w:      10, d:      10, h:  4.4, mat: 'tower'       },
      { x:       4, z:   -45.5, w:      10, d:       3, h:  2.2, mat: 'step'        },
      { x:     108, z:    45.5, w:      10, d:       3, h:  2.2, mat: 'step'        },
      { x:     108, z:   -45.5, w:      10, d:       3, h:  2.2, mat: 'step'        },
      { x:       4, z:    45.5, w:      10, d:       3, h:  2.2, mat: 'step'        },
      { x:      42, z:     -54, w:     5.5, d:     4.5, h:  2.8, mat: 'transformer' },
      { x:      70, z:      54, w:     5.5, d:     4.5, h:  2.8, mat: 'transformer' },
      { x:      70, z:     -54, w:     5.5, d:     4.5, h:  2.8, mat: 'transformer' },
      { x:      42, z:      54, w:     5.5, d:     4.5, h:  2.8, mat: 'transformer' },
      { x:      42, z:     -50, w:       8, d:     1.2, h:    5, mat: 'firewall'    },
      { x:      70, z:      50, w:       8, d:     1.2, h:    5, mat: 'firewall'    },
      { x:      70, z:     -50, w:       8, d:     1.2, h:    5, mat: 'firewall'    },
      { x:      42, z:      50, w:       8, d:     1.2, h:    5, mat: 'firewall'    },

      // and the shell round it: cladding, 16m, with the doors left out
      { x:   -3.75, z:  -40.25, w:     1.5, d:    40.5, h:   16, mat: 'cladding'    },
      { x:   -3.75, z:       0, w:     1.5, d:      28, h:   16, mat: 'cladding'    },
      { x:   -3.75, z:   40.25, w:     1.5, d:    40.5, h:   16, mat: 'cladding'    },
      { x:  115.75, z:       0, w:     1.5, d:     121, h:   16, mat: 'cladding'    },
      { x:    21.5, z:  -59.75, w:      49, d:     1.5, h:   16, mat: 'cladding'    },
      { x:    84.5, z:  -59.75, w:      61, d:     1.5, h:   16, mat: 'cladding'    },
      { x:     8.5, z:   59.75, w:      23, d:     1.5, h:   16, mat: 'cladding'    },
      { x:    71.5, z:   59.75, w:      87, d:     1.5, h:   16, mat: 'cladding'    },

      // THE SWITCHYARD: four bays of HV plant, transmission towers at the
      // corners, portal gantries over the top. This was the substation
      // map; Jack sent a photograph of a real yard and asked for that.
      { x:     -62, z:       0, w:      11, d:       8, h:  4.5, mat: 'control'     },
      { x:     -62, z:    -4.6, w:      11, d:     1.2, h:    3, mat: 'step'        },
      { x:     -62, z:    -5.8, w:      11, d:     1.2, h:  1.5, mat: 'step'        },
      { x:     -92, z:     -34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -92, z:     -22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -92, z:     -10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -92, z:      10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -92, z:      22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -92, z:      34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:     -34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:     -22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:     -10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:      10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:      22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -77, z:      34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:     -34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:     -22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:     -10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:      10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:      22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -47, z:      34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:     -34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:     -22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:     -10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:      10, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:      22, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:     -32, z:      34, w:     7.2, d:     3.2, h:  2.2, mat: 'capbank'     },
      { x:   -84.5, z:     -28, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -84.5, z:     -16, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -84.5, z:      16, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -84.5, z:      28, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -39.5, z:     -28, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -39.5, z:     -16, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -39.5, z:      16, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:   -39.5, z:      28, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -70, z:     -40, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:     -54, z:     -40, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:     -70, z:      40, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:     -54, z:      40, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:    -100, z:       0, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:     -24, z:       0, w:       4, d:     2.6, h:  2.6, mat: 'kiosk'       },
      { x:     -77, z:       0, w:     1.2, d:     0.9, h:  1.5, mat: 'firebox'     },
      { x:     -47, z:       0, w:     1.2, d:     0.9, h:  1.5, mat: 'firebox'     },
      { x:     -92, z:     -42, w:     1.2, d:     0.9, h:  1.5, mat: 'firebox'     },
      { x:     -32, z:      42, w:     1.2, d:     0.9, h:  1.5, mat: 'firebox'     },
      { x:    -100, z:     -40, w:     4.2, d:     4.2, h:   26, mat: 'hvtower'     },
      { x:    -100, z:      40, w:     4.2, d:     4.2, h:   26, mat: 'hvtower'     },
      { x:     -24, z:     -40, w:     4.2, d:     4.2, h:   26, mat: 'hvtower'     },
      { x:     -24, z:      40, w:     4.2, d:     4.2, h:   26, mat: 'hvtower'     },
      { x:    -102, z:     -24, w:     1.6, d:     1.6, h:   12, mat: 'lattice'     },
      { x:    -102, z:      24, w:     1.6, d:     1.6, h:   12, mat: 'lattice'     },
      { x:     -22, z:     -24, w:     1.6, d:     1.6, h:   12, mat: 'lattice'     },
      { x:     -22, z:      24, w:     1.6, d:     1.6, h:   12, mat: 'lattice'     },

      // with a compound wall and its gates — the gates are on the centre lines
      // of the compound, not of the map, which is where that arithmetic
      // went wrong the first time
      { x:  -104.7, z:       0, w:     1.4, d:    94.8, h:    5, mat: 'firewall'    },
      { x:   -19.3, z:   -27.7, w:     1.4, d:    39.4, h:    5, mat: 'firewall'    },
      { x:   -19.3, z:    27.7, w:     1.4, d:    39.4, h:    5, mat: 'firewall'    },
      { x:     -86, z:   -46.7, w:      36, d:     1.4, h:    5, mat: 'firewall'    },
      { x:     -38, z:   -46.7, w:      36, d:     1.4, h:    5, mat: 'firewall'    },
      { x:     -86, z:    46.7, w:      36, d:     1.4, h:    5, mat: 'firewall'    },
      { x:     -38, z:    46.7, w:      36, d:     1.4, h:    5, mat: 'firewall'    },

      // THE COOLING TOWERS, north-west, where there is room for two of them
      { x:     -74, z:     -90, w:  25.267, d:   6.128, h:  2.6, mat: 'mass'       , r: 13, n: 9 },
      { x:     -74, z:     -90, w:  23.735, d:  10.614, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  22.096, d:  13.703, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  20.325, d:  16.214, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  18.385, d:  18.385, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  16.214, d:  20.325, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  13.703, d:  22.096, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  10.614, d:  23.735, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:   6.128, d:  25.267, h:  2.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  20.486, d:   4.969, h:  5.6, mat: 'hidden'     , r: 10.54, n: 9 },
      { x:     -74, z:     -90, w:  19.243, d:   8.606, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  17.915, d:   11.11, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  16.479, d:  13.146, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  14.906, d:  14.906, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:  13.146, d:  16.479, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:   11.11, d:  17.915, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:   8.606, d:  19.243, h:  5.6, mat: 'hidden'      },
      { x:     -74, z:     -90, w:   4.969, d:  20.486, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  25.267, d:   6.128, h:  2.6, mat: 'mass'       , r: 13, n: 9 },
      { x:     -24, z:     -90, w:  23.735, d:  10.614, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  22.096, d:  13.703, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  20.325, d:  16.214, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  18.385, d:  18.385, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  16.214, d:  20.325, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  13.703, d:  22.096, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  10.614, d:  23.735, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:   6.128, d:  25.267, h:  2.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  20.486, d:   4.969, h:  5.6, mat: 'hidden'     , r: 10.54, n: 9 },
      { x:     -24, z:     -90, w:  19.243, d:   8.606, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  17.915, d:   11.11, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  16.479, d:  13.146, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  14.906, d:  14.906, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:  13.146, d:  16.479, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:   11.11, d:  17.915, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:   8.606, d:  19.243, h:  5.6, mat: 'hidden'      },
      { x:     -24, z:     -90, w:   4.969, d:  20.486, h:  5.6, mat: 'hidden'      },

      // THE BOILER HOUSE, against the hall's north wall: a hollow steel hall
      { x:      56, z:  -95.75, w:      54, d:     0.5, h:  9.4, mat: 'bwall'       },
      { x:    29.5, z:  -95.75, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:    82.5, z:  -95.75, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:      56, z:  -95.75, w:      54, d:     0.5, h:  4.8, mat: 'bwall'      , y: 11.6 },
      { x:    29.5, z:  -95.75, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:    82.5, z:  -95.75, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:      56, z:  -95.75, w:      54, d:     0.5, h:  4.8, mat: 'bwall'      , y: 18.6 },
      { x:    29.5, z:  -95.75, w:       1, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:    82.5, z:  -95.75, w:       1, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:      56, z:  -95.75, w:      54, d:     0.5, h:  2.4, mat: 'bwall'      , y: 25.2 },
      { x:      56, z:  -95.75, w:      52, d:    0.06, h:  2.2, mat: 'glass'      , y: 9.4 },
      { x:      56, z:  -95.75, w:      52, d:    0.06, h:  2.2, mat: 'glass'      , y: 16.4 },
      { x:      56, z:  -95.75, w:      52, d:    0.06, h:  1.8, mat: 'glass'      , y: 23.4 },
      { x:    39.5, z:  -68.25, w:      21, d:     0.5, h:    5, mat: 'bwall'       },
      { x:   69.25, z:  -68.25, w:    27.5, d:     0.5, h:    5, mat: 'bwall'       },
      { x:      56, z:  -68.25, w:      54, d:     0.5, h:  4.4, mat: 'bwall'      , y: 5 },
      { x:    29.5, z:  -68.25, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:    82.5, z:  -68.25, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:      56, z:  -68.25, w:      54, d:     0.5, h:  4.8, mat: 'bwall'      , y: 11.6 },
      { x:    29.5, z:  -68.25, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:    82.5, z:  -68.25, w:       1, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:      56, z:  -68.25, w:      54, d:     0.5, h:  4.8, mat: 'bwall'      , y: 18.6 },
      { x:    29.5, z:  -68.25, w:       1, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:    82.5, z:  -68.25, w:       1, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:      56, z:  -68.25, w:      54, d:     0.5, h:  2.4, mat: 'bwall'      , y: 25.2 },
      { x:      56, z:  -68.25, w:      52, d:    0.06, h:  2.2, mat: 'glass'      , y: 9.4 },
      { x:      56, z:  -68.25, w:      52, d:    0.06, h:  2.2, mat: 'glass'      , y: 16.4 },
      { x:      56, z:  -68.25, w:      52, d:    0.06, h:  1.8, mat: 'glass'      , y: 23.4 },
      { x:   29.25, z:     -82, w:     0.5, d:      27, h:  7.6, mat: 'bwall'       },
      { x:   29.25, z:  -90.35, w:     0.5, d:    10.3, h:  1.8, mat: 'bwall'      , y: 7.6 },
      { x:   29.25, z:  -75.55, w:     0.5, d:    14.1, h:  1.8, mat: 'bwall'      , y: 7.6 },
      { x:   29.25, z:  -95.25, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:   29.25, z:  -68.75, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:   29.25, z:     -82, w:     0.5, d:      27, h:  4.8, mat: 'bwall'      , y: 11.6 },
      { x:   29.25, z:  -95.25, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:   29.25, z:  -68.75, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:   29.25, z:     -82, w:     0.5, d:      27, h:  4.8, mat: 'bwall'      , y: 18.6 },
      { x:   29.25, z:  -95.25, w:     0.5, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:   29.25, z:  -68.75, w:     0.5, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:   29.25, z:     -82, w:     0.5, d:      27, h:  2.4, mat: 'bwall'      , y: 25.2 },
      { x:   29.25, z:   -90.1, w:    0.06, d:     9.8, h:  2.2, mat: 'glass'      , y: 9.4 },
      { x:   29.25, z:   -75.8, w:    0.06, d:    13.6, h:  2.2, mat: 'glass'      , y: 9.4 },
      { x:   29.25, z:     -82, w:    0.06, d:      26, h:  2.2, mat: 'glass'      , y: 16.4 },
      { x:   29.25, z:     -82, w:    0.06, d:      26, h:  1.8, mat: 'glass'      , y: 23.4 },
      { x:   82.75, z:   -92.5, w:     0.5, d:       6, h:  3.5, mat: 'bwall'       },
      { x:   82.75, z:   -77.5, w:     0.5, d:      18, h:  3.5, mat: 'bwall'       },
      { x:   82.75, z:     -82, w:     0.5, d:      27, h:  5.9, mat: 'bwall'      , y: 3.5 },
      { x:   82.75, z:  -95.25, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:   82.75, z:  -68.75, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 9.4 },
      { x:   82.75, z:     -82, w:     0.5, d:      27, h:  2.4, mat: 'bwall'      , y: 11.6 },
      { x:   82.75, z:   -92.5, w:     0.5, d:       6, h:  2.4, mat: 'bwall'      , y: 14 },
      { x:   82.75, z:   -77.5, w:     0.5, d:      18, h:  2.4, mat: 'bwall'      , y: 14 },
      { x:   82.75, z:  -95.25, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:   82.75, z:  -68.75, w:     0.5, d:     0.5, h:  2.2, mat: 'bwall'      , y: 16.4 },
      { x:   82.75, z:     -88, w:     0.5, d:       3, h:  1.1, mat: 'bwall'      , y: 17.5 },
      { x:   82.75, z:     -82, w:     0.5, d:      27, h:  4.8, mat: 'bwall'      , y: 18.6 },
      { x:   82.75, z:  -95.25, w:     0.5, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:   82.75, z:  -68.75, w:     0.5, d:     0.5, h:  1.8, mat: 'bwall'      , y: 23.4 },
      { x:   82.75, z:     -82, w:     0.5, d:      27, h:  2.4, mat: 'bwall'      , y: 25.2 },
      { x:   82.75, z:     -82, w:    0.06, d:      26, h:  2.2, mat: 'glass'      , y: 9.4 },
      { x:   82.75, z:  -92.25, w:    0.06, d:     5.5, h:  2.2, mat: 'glass'      , y: 16.4 },
      { x:   82.75, z:  -77.75, w:    0.06, d:    17.5, h:  2.2, mat: 'glass'      , y: 16.4 },
      { x:   82.75, z:     -82, w:    0.06, d:      26, h:  1.8, mat: 'glass'      , y: 23.4 },
      { x:      56, z:     -82, w:      54, d:      28, h:  0.4, mat: 'boilerroof' , y: 27.6 },
      { x:    41.5, z:     -82, w:      11, d:      14, h:   24, mat: 'boilerunit'  },
      { x:    57.5, z:     -82, w:      11, d:      14, h:   24, mat: 'boilerunit'  },
      { x:    30.4, z: -94.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.04 },
      { x:    30.4, z: -94.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.23 },
      { x:    30.4, z: -94.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.42 },
      { x:    30.4, z: -94.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.61 },
      { x:    30.4, z: -93.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.8 },
      { x:    30.4, z: -93.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 0.99 },
      { x:    30.4, z: -93.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 1.18 },
      { x:    30.4, z: -93.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 1.37 },
      { x:    30.4, z: -92.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 1.56 },
      { x:    30.4, z: -92.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 1.75 },
      { x:    30.4, z: -92.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 1.94 },
      { x:    30.4, z: -92.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 2.13 },
      { x:    30.4, z: -91.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 2.32 },
      { x:    30.4, z: -91.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 2.51 },
      { x:    30.4, z: -91.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 2.7 },
      { x:    30.4, z: -91.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 2.89 },
      { x:    30.4, z: -90.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 3.08 },
      { x:    30.4, z: -90.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 3.27 },
      { x:    30.4, z: -90.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 3.46 },
      { x:    30.4, z: -90.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 3.65 },
      { x:    30.4, z: -89.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 3.84 },
      { x:    30.4, z: -89.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.03 },
      { x:    30.4, z: -89.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.22 },
      { x:    30.4, z: -89.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.41 },
      { x:    30.4, z: -88.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.6 },
      { x:    30.4, z: -88.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.79 },
      { x:    30.4, z: -88.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 4.98 },
      { x:    30.4, z: -88.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 5.17 },
      { x:    30.4, z: -87.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 5.36 },
      { x:    30.4, z: -87.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 5.55 },
      { x:    30.4, z: -87.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 5.74 },
      { x:    30.4, z: -87.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 5.93 },
      { x:    30.4, z: -86.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 6.12 },
      { x:    30.4, z: -86.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 6.31 },
      { x:    30.4, z: -86.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 6.5 },
      { x:    30.4, z: -86.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 6.69 },
      { x:    30.4, z: -85.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 6.88 },
      { x:    30.4, z: -85.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 7.07 },
      { x:    30.4, z: -85.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 7.26 },
      { x:    32.6, z: -85.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 7.638 },
      { x:    32.6, z: -85.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 7.827 },
      { x:    32.6, z: -85.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.015 },
      { x:    32.6, z: -86.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.203 },
      { x:    32.6, z: -86.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.391 },
      { x:    32.6, z: -86.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.579 },
      { x:    32.6, z: -86.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.768 },
      { x:    32.6, z: -87.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 8.956 },
      { x:    32.6, z: -87.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 9.144 },
      { x:    32.6, z: -87.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 9.332 },
      { x:    32.6, z: -87.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 9.521 },
      { x:    32.6, z: -88.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 9.709 },
      { x:    32.6, z: -88.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 9.897 },
      { x:    32.6, z: -88.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 10.085 },
      { x:    32.6, z: -88.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 10.274 },
      { x:    32.6, z: -89.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 10.462 },
      { x:    32.6, z: -89.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 10.65 },
      { x:    32.6, z: -89.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 10.838 },
      { x:    32.6, z: -89.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.027 },
      { x:    32.6, z: -90.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.215 },
      { x:    32.6, z: -90.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.403 },
      { x:    32.6, z: -90.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.591 },
      { x:    32.6, z: -90.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.779 },
      { x:    32.6, z: -91.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 11.968 },
      { x:    32.6, z: -91.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 12.156 },
      { x:    32.6, z: -91.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 12.344 },
      { x:    32.6, z: -91.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 12.532 },
      { x:    32.6, z: -92.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 12.721 },
      { x:    32.6, z: -92.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 12.909 },
      { x:    32.6, z: -92.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 13.097 },
      { x:    32.6, z: -92.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 13.285 },
      { x:    32.6, z: -93.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 13.473 },
      { x:    32.6, z: -93.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 13.662 },
      { x:    30.4, z: -93.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.039 },
      { x:    30.4, z: -93.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.228 },
      { x:    30.4, z: -92.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.418 },
      { x:    30.4, z: -92.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.607 },
      { x:    30.4, z: -92.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.796 },
      { x:    30.4, z: -92.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 14.985 },
      { x:    30.4, z: -91.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 15.174 },
      { x:    30.4, z: -91.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 15.364 },
      { x:    30.4, z: -91.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 15.553 },
      { x:    30.4, z: -91.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 15.742 },
      { x:    30.4, z: -90.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 15.931 },
      { x:    30.4, z: -90.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 16.12 },
      { x:    30.4, z: -90.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 16.309 },
      { x:    30.4, z: -90.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 16.499 },
      { x:    30.4, z: -89.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 16.688 },
      { x:    30.4, z: -89.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 16.877 },
      { x:    30.4, z: -89.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 17.066 },
      { x:    30.4, z: -89.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 17.255 },
      { x:    30.4, z: -88.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 17.445 },
      { x:    30.4, z: -88.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 17.634 },
      { x:    30.4, z: -88.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 17.823 },
      { x:    30.4, z: -88.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.012 },
      { x:    30.4, z: -87.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.201 },
      { x:    30.4, z: -87.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.39 },
      { x:    30.4, z: -87.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.58 },
      { x:    30.4, z: -87.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.769 },
      { x:    30.4, z: -86.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 18.958 },
      { x:    30.4, z: -86.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 19.147 },
      { x:    30.4, z: -86.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 19.337 },
      { x:    30.4, z: -86.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 19.526 },
      { x:    30.4, z: -85.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 19.715 },
      { x:    30.4, z: -85.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 19.904 },
      { x:    30.4, z: -85.375, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 20.093 },
      { x:    30.4, z: -85.125, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 20.282 },
      { x:    30.4, z: -84.875, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 20.472 },
      { x:    30.4, z: -84.625, w:     1.8, d:    0.25, h: 0.15, mat: 'steptread'  , y: 20.661 },
      { x:      56, z:  -95.25, w:      53, d:     0.5, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:    56.9, z:  -93.75, w:    51.2, d:     2.5, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:    32.4, z: -88.875, w:     2.2, d:    7.25, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:    49.5, z:     -82, w:       2, d:      21, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:   74.25, z:     -82, w:    16.5, d:      21, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:    31.5, z: -78.375, w:       4, d:   13.75, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:      56, z:     -70, w:      53, d:       3, h:  0.2, mat: 'grating'    , y: 7.4 },
      { x:      41, z:  -92.45, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:      41, z:  -71.55, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   33.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   48.45, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   58.25, z:  -92.45, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   58.25, z:  -71.55, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   50.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:   65.95, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 7.4 },
      { x:      56, z:   -94.5, w:      53, d:       2, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:    30.6, z: -89.375, w:     2.2, d:    8.25, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:      58, z:     -93, w:      49, d:       1, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:    49.5, z:     -82, w:       2, d:      21, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:   74.25, z:     -82, w:    16.5, d:      21, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:    31.5, z: -78.375, w:       4, d:   13.75, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:      56, z:     -70, w:      53, d:       3, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:      41, z:  -92.45, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:      41, z:  -71.55, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   33.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   48.45, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   58.25, z:  -92.45, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   58.25, z:  -71.55, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   50.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:   65.95, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 13.8 },
      { x:      56, z:   -94.5, w:      53, d:       2, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:    56.9, z:     -93, w:    51.2, d:       1, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:    32.4, z:   -88.5, w:     2.2, d:       8, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:    49.5, z:     -82, w:       2, d:      21, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:   74.25, z:     -82, w:    16.5, d:      21, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:    31.5, z:     -78, w:       4, d:      13, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:      56, z:     -70, w:      53, d:       3, h:  0.2, mat: 'grating'    , y: 20.8 },
      { x:      41, z:  -92.45, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:      41, z:  -71.55, w:      15, d:     0.1, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   33.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   48.45, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   58.25, z:  -92.45, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   58.25, z:  -71.55, w:    15.5, d:     0.1, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   50.55, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   65.95, z:     -82, w:     0.1, d:    20.8, h:  1.1, mat: 'handrail'   , y: 20.8 },
      { x:   31.35, z: -90.125, w:     0.1, d:    9.75, h:  1.1, mat: 'handrail'   , y: 7.6 },
      { x:    30.4, z:  -95.05, w:     1.8, d:     0.1, h:  1.1, mat: 'handrail'   , y: 7.6 },
      { x:   31.65, z: -89.375, w:     0.1, d:    8.25, h:  1.1, mat: 'handrail'   , y: 14 },
      { x:    32.6, z:   -85.2, w:     1.8, d:     0.1, h:  1.1, mat: 'handrail'   , y: 14 },
      { x:   31.35, z:     -89, w:     0.1, d:       9, h:  1.1, mat: 'handrail'   , y: 21 },
      { x:    30.4, z:  -93.55, w:     1.8, d:     0.1, h:  1.1, mat: 'handrail'   , y: 21 },
      { x:      73, z:  -90.75, w:       6, d:     4.5, h:  3.2, mat: 'machine'     },
      { x:      73, z:   -73.5, w:       6, d:       5, h:  3.2, mat: 'machine'     },
      { x:      79, z:   -81.5, w:       4, d:       5, h:  4.5, mat: 'machine'     },
      { x:    41.5, z:   -72.8, w:       9, d:     1.2, h:  1.2, mat: 'machine'     },
      { x:    57.5, z:   -72.8, w:       9, d:     1.2, h:  1.2, mat: 'machine'     },
      { x:      74, z:     -77, w:       8, d:       6, h:    3, mat: 'machine'    , y: 14 },
      { x:      74, z:   -92.5, w:       4, d:       3, h:  2.2, mat: 'machine'    , y: 21 },

      // THE LINK TO THE STACK: a corridor on the ground, the flue duct at 14m
      { x:  88.075, z:  -89.65, w:   10.15, d:     0.3, h:  3.5, mat: 'shedwall'    },
      { x:  88.075, z:  -86.35, w:   10.15, d:     0.3, h:  3.5, mat: 'shedwall'    },
      { x:  88.075, z:     -88, w:   10.15, d:     3.6, h:  0.3, mat: 'shedroof'   , y: 3.5 },
      { x:  88.075, z:     -88, w:   10.15, d:     3.6, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:  88.075, z:  -89.65, w:   10.15, d:     0.3, h:  3.5, mat: 'duct'       , y: 14 },
      { x:  88.075, z:  -86.35, w:   10.15, d:     0.3, h:  3.5, mat: 'duct'       , y: 14 },
      { x:  88.075, z:     -88, w:   10.15, d:     3.6, h:  0.3, mat: 'duct'       , y: 17.5 },
      { x:  93.425, z:     -88, w:    0.55, d:     1.5, h:  0.2, mat: 'grating'    , y: 13.8 },
      { x:   95.15, z:     -88, w:     2.9, d:     1.5, h:  0.2, mat: 'grating'    , y: 13.8 },

      // THE STACK: hollow, a door at its foot and the flue opening at 14m
      { x:  98.731, z: -87.7395, w:   0.538, d:  0.5209, h:   68, mat: 'stackwall'   },
      { x: 98.6518, z: -87.2699, w:  0.6052, d:  0.5919, h:   68, mat: 'stackwall'   },
      { x: 98.4921, z: -86.8225, w:   0.654, d:  0.6449, h:   68, mat: 'stackwall'   },
      { x: 98.2566, z: -86.4108, w:   0.683, d:  0.6784, h:   68, mat: 'stackwall'   },
      { x: 97.9526, z: -86.0474, w:  0.6912, d:  0.6912, h:   68, mat: 'stackwall'   },
      { x: 97.5892, z: -85.7434, w:  0.6784, d:   0.683, h:   68, mat: 'stackwall'   },
      { x: 97.1775, z: -85.5079, w:  0.6449, d:   0.654, h:   68, mat: 'stackwall'   },
      { x: 96.7301, z: -85.3482, w:  0.5919, d:  0.6052, h:   68, mat: 'stackwall'   },
      { x: 96.2605, z: -85.269, w:  0.5209, d:   0.538, h:   68, mat: 'stackwall'   },
      { x: 95.7395, z: -85.269, w:  0.5209, d:   0.538, h:   68, mat: 'stackwall'   },
      { x: 95.2699, z: -85.3482, w:  0.5919, d:  0.6052, h:   68, mat: 'stackwall'   },
      { x: 94.8225, z: -85.5079, w:  0.6449, d:   0.654, h:   68, mat: 'stackwall'   },
      { x: 94.4108, z: -85.7434, w:  0.6784, d:   0.683, h:   68, mat: 'stackwall'   },
      { x: 94.0474, z: -86.0474, w:  0.6912, d:  0.6912, h:   68, mat: 'stackwall'   },
      { x: 93.7434, z: -86.4108, w:   0.683, d:  0.6784, h:   68, mat: 'stackwall'   },
      { x: 93.5079, z: -86.8225, w:   0.654, d:  0.6449, h:   68, mat: 'stackwall'   },
      { x: 93.3482, z: -87.2699, w:  0.6052, d:  0.5919, h:   10, mat: 'stackwall'  , y: 3.8 },
      { x: 93.3482, z: -87.2699, w:  0.6052, d:  0.5919, h: 50.2, mat: 'stackwall'  , y: 17.8 },
      { x:  93.269, z: -87.7395, w:   0.538, d:  0.5209, h:   10, mat: 'stackwall'  , y: 3.8 },
      { x:  93.269, z: -87.7395, w:   0.538, d:  0.5209, h: 50.2, mat: 'stackwall'  , y: 17.8 },
      { x:  93.269, z: -88.2605, w:   0.538, d:  0.5209, h:   10, mat: 'stackwall'  , y: 3.8 },
      { x:  93.269, z: -88.2605, w:   0.538, d:  0.5209, h: 50.2, mat: 'stackwall'  , y: 17.8 },
      { x: 93.3482, z: -88.7301, w:  0.6052, d:  0.5919, h:   10, mat: 'stackwall'  , y: 3.8 },
      { x: 93.3482, z: -88.7301, w:  0.6052, d:  0.5919, h: 50.2, mat: 'stackwall'  , y: 17.8 },
      { x: 93.5079, z: -89.1775, w:   0.654, d:  0.6449, h:   68, mat: 'stackwall'   },
      { x: 93.7434, z: -89.5892, w:   0.683, d:  0.6784, h:   68, mat: 'stackwall'   },
      { x: 94.0474, z: -89.9526, w:  0.6912, d:  0.6912, h:   68, mat: 'stackwall'   },
      { x: 94.4108, z: -90.2566, w:  0.6784, d:   0.683, h:   68, mat: 'stackwall'   },
      { x: 94.8225, z: -90.4921, w:  0.6449, d:   0.654, h:   68, mat: 'stackwall'   },
      { x: 95.2699, z: -90.6518, w:  0.5919, d:  0.6052, h:   68, mat: 'stackwall'   },
      { x: 95.7395, z: -90.731, w:  0.5209, d:   0.538, h:   68, mat: 'stackwall'   },
      { x: 96.2605, z: -90.731, w:  0.5209, d:   0.538, h:   68, mat: 'stackwall'   },
      { x: 96.7301, z: -90.6518, w:  0.5919, d:  0.6052, h:   68, mat: 'stackwall'   },
      { x: 97.1775, z: -90.4921, w:  0.6449, d:   0.654, h:   68, mat: 'stackwall'   },
      { x: 97.5892, z: -90.2566, w:  0.6784, d:   0.683, h:   68, mat: 'stackwall'   },
      { x: 97.9526, z: -89.9526, w:  0.6912, d:  0.6912, h:   68, mat: 'stackwall'   },
      { x: 98.2566, z: -89.5892, w:   0.683, d:  0.6784, h:   68, mat: 'stackwall'   },
      { x: 98.4921, z: -89.1775, w:   0.654, d:  0.6449, h:   68, mat: 'stackwall'   },
      { x: 98.6518, z: -88.7301, w:  0.6052, d:  0.5919, h:   68, mat: 'stackwall'   },
      { x:  98.731, z: -88.2605, w:   0.538, d:  0.5209, h:   68, mat: 'stackwall'   },

      // THE SWITCHYARD, south-west: two rows of portals and the gear beneath
      { x:    -110, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -96, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -82, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -68, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -54, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -40, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -26, z:      78, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:    -110, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -96, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -82, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -68, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -54, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -40, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:     -26, z:      94, w:     1.4, d:     1.4, h:   13, mat: 'lattice'     },
      { x:    -104, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -90, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -76, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -62, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -48, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },
      { x:     -34, z:      86, w:     3.4, d:       3, h:  2.4, mat: 'gear'        },

      // THE OIL TANKS, the far south-west corner
      { x:    -100, z:     108, w:  11.662, d:   2.828, h:   10, mat: 'tank'       , r: 6, n: 9 },
      { x:    -100, z:     108, w:  10.954, d:   4.899, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:  10.198, d:   6.325, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   9.381, d:   7.483, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   8.485, d:   8.485, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   7.483, d:   9.381, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   6.325, d:  10.198, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   4.899, d:  10.954, h:   10, mat: 'hidden'      },
      { x:    -100, z:     108, w:   2.828, d:  11.662, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:  11.662, d:   2.828, h:   10, mat: 'tank'       , r: 6, n: 9 },
      { x:     -80, z:     112, w:  10.954, d:   4.899, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:  10.198, d:   6.325, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   9.381, d:   7.483, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   8.485, d:   8.485, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   7.483, d:   9.381, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   6.325, d:  10.198, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   4.899, d:  10.954, h:   10, mat: 'hidden'      },
      { x:     -80, z:     112, w:   2.828, d:  11.662, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:  11.662, d:   2.828, h:   10, mat: 'tank'       , r: 6, n: 9 },
      { x:     -60, z:     106, w:  10.954, d:   4.899, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:  10.198, d:   6.325, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   9.381, d:   7.483, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   8.485, d:   8.485, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   7.483, d:   9.381, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   6.325, d:  10.198, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   4.899, d:  10.954, h:   10, mat: 'hidden'      },
      { x:     -60, z:     106, w:   2.828, d:  11.662, h:   10, mat: 'hidden'      },

      // THE QUAY, south-east: the intake house and the screens
      { x:    31.5, z:   99.15, w:      13, d:     0.3, h:  2.6, mat: 'shedwall'    },
      { x:    47.7, z:   99.15, w:    14.6, d:     0.3, h:  2.6, mat: 'shedwall'    },
      { x:      40, z:   99.15, w:      30, d:     0.3, h:  0.2, mat: 'shedwall'   , y: 2.6 },
      { x:    25.5, z:   99.15, w:       1, d:     0.3, h:  0.6, mat: 'shedwall'   , y: 2.8 },
      { x:    39.2, z:   99.15, w:     4.4, d:     0.3, h:  0.6, mat: 'shedwall'   , y: 2.8 },
      { x:    54.5, z:   99.15, w:       1, d:     0.3, h:  0.6, mat: 'shedwall'   , y: 2.8 },
      { x:      40, z:   99.15, w:      30, d:     0.3, h:  0.3, mat: 'shedwall'   , y: 3.4 },
      { x:    31.5, z:   99.15, w:      11, d:    0.06, h:  0.6, mat: 'glass'      , y: 2.8 },
      { x:    47.7, z:   99.15, w:    12.6, d:    0.06, h:  0.6, mat: 'glass'      , y: 2.8 },
      { x:      40, z:  108.85, w:      30, d:     0.3, h:  2.8, mat: 'shedwall'    },
      { x:    25.5, z:  108.85, w:       1, d:     0.3, h:  0.6, mat: 'shedwall'   , y: 2.8 },
      { x:    54.5, z:  108.85, w:       1, d:     0.3, h:  0.6, mat: 'shedwall'   , y: 2.8 },
      { x:      40, z:  108.85, w:      30, d:     0.3, h:  0.3, mat: 'shedwall'   , y: 3.4 },
      { x:      40, z:  108.85, w:      28, d:    0.06, h:  0.6, mat: 'glass'      , y: 2.8 },
      { x:   25.15, z:     104, w:     0.3, d:     9.4, h:  3.7, mat: 'shedwall'    },
      { x:   54.85, z:  100.65, w:     0.3, d:     2.7, h:  2.6, mat: 'shedwall'    },
      { x:   54.85, z:  106.55, w:     0.3, d:     4.3, h:  2.6, mat: 'shedwall'    },
      { x:   54.85, z:     104, w:     0.3, d:     9.4, h:  1.1, mat: 'shedwall'   , y: 2.6 },
      { x:      40, z:     104, w:      30, d:      10, h:  0.3, mat: 'intakeroof' , y: 3.7 },
      { x:      30, z:   105.4, w:     2.4, d:     1.6, h:  1.4, mat: 'machine'     },
      { x:      36, z:   105.4, w:     2.4, d:     1.6, h:  1.4, mat: 'machine'     },
      { x:      44, z:   105.4, w:     2.4, d:     1.6, h:  1.4, mat: 'machine'     },
      { x:      50, z:   105.4, w:     2.4, d:     1.6, h:  1.4, mat: 'machine'     },
      { x:      40, z:   107.8, w:      26, d:     1.2, h:  1.2, mat: 'pipe'        },
      { x:      73, z:   99.65, w:       4, d:     0.3, h:  2.4, mat: 'shedwall'    },
      { x:      82, z:   99.65, w:       6, d:     0.3, h:  2.4, mat: 'shedwall'    },
      { x:    71.5, z:   99.65, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.4 },
      { x:    74.5, z:   99.65, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.4 },
      { x:    79.5, z:   99.65, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.4 },
      { x:    84.5, z:   99.65, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.4 },
      { x:      78, z:   99.65, w:      14, d:     0.3, h:  1.1, mat: 'shedwall'   , y: 3.6 },
      { x:      73, z:   99.65, w:       2, d:    0.06, h:  1.2, mat: 'glass'      , y: 2.4 },
      { x:      82, z:   99.65, w:       4, d:    0.06, h:  1.2, mat: 'glass'      , y: 2.4 },
      { x:      78, z:  108.35, w:      14, d:     0.3, h:  2.6, mat: 'shedwall'    },
      { x:    71.5, z:  108.35, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.6 },
      { x:    84.5, z:  108.35, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 2.6 },
      { x:      78, z:  108.35, w:      14, d:     0.3, h:  0.9, mat: 'shedwall'   , y: 3.8 },
      { x:      78, z:  108.35, w:      12, d:    0.06, h:  1.2, mat: 'glass'      , y: 2.6 },
      { x:   71.15, z:     104, w:     0.3, d:     8.4, h:  4.7, mat: 'shedwall'    },
      { x:   84.85, z:     104, w:     0.3, d:     8.4, h:  4.7, mat: 'shedwall'    },
      { x:      78, z:     104, w:      14, d:       9, h:  0.3, mat: 'shedroof'   , y: 4.7 },
      { x:    71.8, z:   104.6, w:       1, d:     7.2, h:  2.4, mat: 'machine'     },
      { x:    80.5, z:   107.4, w:       5, d:     1.6, h:  0.9, mat: 'desk'        },
      { x:    80.6, z:   102.6, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'       },
      { x:      82, z:   102.6, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'       },
      { x:      10, z:     108, w:       8, d:       5, h:  2.2, mat: 'gear'        },

      // The step-up transformers, between the hall and the compound, round the
      // resupply — the one piece of ground every route crosses
      { x:     -14, z:     -11, w:       7, d:     5.5, h:  3.2, mat: 'transformer' },
      { x:     -14, z:      11, w:       7, d:     5.5, h:  3.2, mat: 'transformer' },

      // and cover on the open ground, so it is crossable - checked against
      // everything else, because the first list ran through half the site
      { x:     -12, z:     -35, w:       3, d:      12, h:  2.6, mat: 'pipe'        },
      { x:     -12, z:      35, w:       3, d:      12, h:  2.6, mat: 'pipe'        },
      { x:       8, z:     -75, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:     -62, z:     -56, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:     -60, z:      60, w:       7, d:       7, h:    3, mat: 'pipe'        },
      { x:      20, z:      70, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:     -50, z:    -112, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:       0, z:    -112, w:      16, d:       3, h:  2.2, mat: 'pipe'        },

      // pipe racks into the towers: legs are collision, the pipes overhead
      { x:     -56, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -56, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -48, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -48, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -42, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -42, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      -6, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      -6, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:       2, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:       2, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      10, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      10, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      18, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      18, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      26, z:   -85.2, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:      26, z:   -82.8, w:    0.45, d:    0.45, h:  6.6, mat: 'column'      },
      { x:     -49, z:     -84, w:    33.2, d:     2.8, h:    1, mat: 'pipewalk'   , y: 6.6 },
      { x:     6.7, z:     -84, w:    44.6, d:     2.8, h:    1, mat: 'pipewalk'   , y: 6.6 },
      { x:      40, z:  -64.25, w:     2.9, d:     7.5, h: 1.07, mat: 'pipewalk'   , y: 8.75 },
      { x:      66, z:  -64.25, w:     2.9, d:     7.5, h: 1.07, mat: 'pipewalk'   , y: 8.75 },

      // a workshop or two
      { x:  -104.5, z:  -65.85, w:       5, d:     0.3, h:  3.6, mat: 'shedwall'    },
      { x:   -95.5, z:  -65.85, w:       5, d:     0.3, h:  3.6, mat: 'shedwall'    },
      { x:    -100, z:  -65.85, w:      14, d:     0.3, h:  0.8, mat: 'shedwall'   , y: 3.6 },
      { x:  -106.5, z:  -65.85, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x:    -100, z:  -65.85, w:       6, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x:   -93.5, z:  -65.85, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x:    -100, z:  -65.85, w:      14, d:     0.3, h:  1.1, mat: 'shedwall'   , y: 5.6 },
      { x:  -104.5, z:  -65.85, w:       3, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.4 },
      { x:   -95.5, z:  -65.85, w:       3, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.4 },
      { x:    -100, z:  -54.15, w:      14, d:     0.3, h:  4.4, mat: 'shedwall'    },
      { x:  -106.5, z:  -54.15, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x:   -93.5, z:  -54.15, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x:    -100, z:  -54.15, w:      14, d:     0.3, h:  1.1, mat: 'shedwall'   , y: 5.6 },
      { x:    -100, z:  -54.15, w:      12, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.4 },
      { x: -106.85, z:     -60, w:     0.3, d:    11.4, h:  4.4, mat: 'shedwall'    },
      { x: -106.85, z:  -64.85, w:     0.3, d:     1.7, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x: -106.85, z:  -55.15, w:     0.3, d:     1.7, h:  1.2, mat: 'shedwall'   , y: 4.4 },
      { x: -106.85, z:     -60, w:     0.3, d:    11.4, h:  1.1, mat: 'shedwall'   , y: 5.6 },
      { x: -106.85, z:     -60, w:    0.06, d:       8, h:  1.2, mat: 'glass'      , y: 4.4 },
      { x:  -93.15, z:  -63.45, w:     0.3, d:     4.5, h:  2.6, mat: 'shedwall'    },
      { x:  -93.15, z:  -56.55, w:     0.3, d:     4.5, h:  2.6, mat: 'shedwall'    },
      { x:  -93.15, z:     -60, w:     0.3, d:    11.4, h:  4.1, mat: 'shedwall'   , y: 2.6 },
      { x:    -100, z:     -60, w:      14, d:      12, h:  0.3, mat: 'shedroof'   , y: 6.7 },
      { x: -104.55, z:  -55.45, w:     4.3, d:     2.3, h: 0.45, mat: 'concrete'    },
      { x:  -105.5, z:   -55.4, w:     1.8, d:     1.6, h: 2.15, mat: 'machine'    , y: 0.45 },
      { x:  -103.5, z:   -55.4, w:     1.6, d:     1.6, h: 2.15, mat: 'machine'    , y: 0.45 },
      { x:   -99.5, z:   -55.3, w:     1.4, d:     1.4, h:  1.2, mat: 'machine'     },
      { x:   -96.5, z:   -55.3, w:     1.4, d:     1.4, h:  1.2, mat: 'machine'     },
      { x:     -98, z:   -54.6, w:     5.2, d:     0.6, h:  0.6, mat: 'pipe'       , y: 1.6 },
      { x:  -106.3, z:  -61.25, w:     0.8, d:     4.5, h:  2.2, mat: 'switch'      },
      { x:  -97.75, z:   -65.3, w:     4.5, d:     0.8, h:  0.9, mat: 'desk'        },
      { x:   -96.4, z:   -61.9, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'       },
      { x:    95.5, z:   94.15, w:       5, d:     0.3, h:  4.5, mat: 'shedwall'    },
      { x:   104.5, z:   94.15, w:       5, d:     0.3, h:  4.5, mat: 'shedwall'    },
      { x:     100, z:   94.15, w:      14, d:     0.3, h:  0.1, mat: 'shedwall'   , y: 4.5 },
      { x:    93.5, z:   94.15, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.6 },
      { x:     100, z:   94.15, w:       6, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.6 },
      { x:   106.5, z:   94.15, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.6 },
      { x:     100, z:   94.15, w:      14, d:     0.3, h:  0.9, mat: 'shedwall'   , y: 5.8 },
      { x:    95.5, z:   94.15, w:       3, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.6 },
      { x:   104.5, z:   94.15, w:       3, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.6 },
      { x:     100, z:  105.85, w:      14, d:     0.3, h:  4.6, mat: 'shedwall'    },
      { x:    93.5, z:  105.85, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.6 },
      { x:   106.5, z:  105.85, w:       1, d:     0.3, h:  1.2, mat: 'shedwall'   , y: 4.6 },
      { x:     100, z:  105.85, w:      14, d:     0.3, h:  0.9, mat: 'shedwall'   , y: 5.8 },
      { x:     100, z:  105.85, w:      12, d:    0.06, h:  1.2, mat: 'glass'      , y: 4.6 },
      { x:   93.15, z:     100, w:     0.3, d:    11.4, h:  6.7, mat: 'shedwall'    },
      { x:  106.85, z:     100, w:     0.3, d:    11.4, h:  6.7, mat: 'shedwall'    },
      { x:     100, z:     100, w:      14, d:      12, h:  0.3, mat: 'shedroof'   , y: 6.7 },
      { x:   96.65, z:  103.35, w:     6.7, d:     4.7, h:  0.2, mat: 'grating'    , y: 3 },
      { x:   94.65, z:  100.95, w:     2.7, d:     0.1, h:  1.1, mat: 'handrail'   , y: 3.2 },
      { x:    98.5, z:  100.95, w:       3, d:     0.1, h:  1.1, mat: 'handrail'   , y: 3.2 },
      { x:  100.05, z:   103.3, w:     0.1, d:     4.8, h:  1.1, mat: 'handrail'   , y: 3.2 },
      { x:    94.6, z:   103.6, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'      , y: 3.2 },
      { x:    96.2, z:   104.1, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'      , y: 3.2 },
      { x:   104.8, z:   104.5, w:     3.6, d:     2.2, h:  0.9, mat: 'desk'        },
      { x:   101.6, z:    96.6, w:     1.2, d:     1.2, h:  1.2, mat: 'crate'       },
      { x:   105.3, z:    97.5, w:     2.6, d:       2, h:  1.6, mat: 'machine'     },

      // THE OFFICES, south of the hall: three storeys, two stairs, a lobby
      { x:      75, z:      86, w:      40, d:      12, h:  0.3, mat: 'roofslab'   , y: 11.4 },
      { x:      75, z:   80.15, w:      40, d:     0.3, h:  0.9, mat: 'parapet'    , y: 11.7 },
      { x:      75, z:   91.85, w:      40, d:     0.3, h:  0.9, mat: 'parapet'    , y: 11.7 },
      { x:   55.15, z:      86, w:     0.3, d:    11.4, h:  0.9, mat: 'parapet'    , y: 11.7 },
      { x:   94.85, z:      86, w:     0.3, d:    11.4, h:  0.9, mat: 'parapet'    , y: 11.7 },
      { x:    57.3, z:   88.25, w:     0.3, d:     2.8, h: 11.4, mat: 'core'        },
      { x:   56.45, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'        },
      { x:  59.375, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'        },
      { x:    58.4, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 2.4 },
      { x:  59.425, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'        },
      { x:  56.225, z:   86.99, w:    1.85, d:    0.28, h: 0.1773, mat: 'tread'       },
      { x:  56.225, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.154 },
      { x:  56.225, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.332 },
      { x:  56.225, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.509 },
      { x:  56.225, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.686 },
      { x:  56.225, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.864 },
      { x:  56.225, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.041 },
      { x:  56.225, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.218 },
      { x:  56.225, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.395 },
      { x:  56.225, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.573 },
      { x:    57.3, z:  90.675, w:       4, d:    2.05, h:  0.3, mat: 'slab'       , y: 1.65 },
      { x:  58.375, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.927 },
      { x:  58.375, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.104 },
      { x:  58.375, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.282 },
      { x:  58.375, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.459 },
      { x:  58.375, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.636 },
      { x:  58.375, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.814 },
      { x:  58.375, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.991 },
      { x:  58.375, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.168 },
      { x:  58.375, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.345 },
      { x:  58.375, z:   86.99, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.523 },
      { x:   56.45, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:  59.375, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:    58.4, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 6.3 },
      { x:  59.425, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:  56.225, z:   86.99, w:    1.85, d:    0.28, h: 0.1773, mat: 'tread'      , y: 3.9 },
      { x:  56.225, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.054 },
      { x:  56.225, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.232 },
      { x:  56.225, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.409 },
      { x:  56.225, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.586 },
      { x:  56.225, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.764 },
      { x:  56.225, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.941 },
      { x:  56.225, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.118 },
      { x:  56.225, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.295 },
      { x:  56.225, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.473 },
      { x:    57.3, z:  90.675, w:       4, d:    2.05, h:  0.3, mat: 'slab'       , y: 5.55 },
      { x:  58.375, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.827 },
      { x:  58.375, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.005 },
      { x:  58.375, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.182 },
      { x:  58.375, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.359 },
      { x:  58.375, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.536 },
      { x:  58.375, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.714 },
      { x:  58.375, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.891 },
      { x:  58.375, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.068 },
      { x:  58.375, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.245 },
      { x:  58.375, z:   86.99, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.423 },
      { x:   56.45, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:  59.375, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:    58.4, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 10.2 },
      { x:  59.425, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:  56.225, z:    86.8, w:    1.85, d:     0.1, h:  1.1, mat: 'rail'       , y: 7.8 },
      { x:    92.7, z:   88.25, w:     0.3, d:     2.8, h: 11.4, mat: 'core'        },
      { x:   93.55, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'        },
      { x:  90.625, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'        },
      { x:    91.6, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 2.4 },
      { x:  90.575, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'        },
      { x:  93.775, z:   86.99, w:    1.85, d:    0.28, h: 0.1773, mat: 'tread'       },
      { x:  93.775, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.154 },
      { x:  93.775, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.332 },
      { x:  93.775, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.509 },
      { x:  93.775, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.686 },
      { x:  93.775, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 0.864 },
      { x:  93.775, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.041 },
      { x:  93.775, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.218 },
      { x:  93.775, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.395 },
      { x:  93.775, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.573 },
      { x:    92.7, z:  90.675, w:       4, d:    2.05, h:  0.3, mat: 'slab'       , y: 1.65 },
      { x:  91.625, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 1.927 },
      { x:  91.625, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.104 },
      { x:  91.625, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.282 },
      { x:  91.625, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.459 },
      { x:  91.625, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.636 },
      { x:  91.625, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.814 },
      { x:  91.625, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 2.991 },
      { x:  91.625, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.168 },
      { x:  91.625, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.345 },
      { x:  91.625, z:   86.99, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 3.523 },
      { x:   93.55, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:  90.625, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:    91.6, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 6.3 },
      { x:  90.575, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'       , y: 3.9 },
      { x:  93.775, z:   86.99, w:    1.85, d:    0.28, h: 0.1773, mat: 'tread'      , y: 3.9 },
      { x:  93.775, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.054 },
      { x:  93.775, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.232 },
      { x:  93.775, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.409 },
      { x:  93.775, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.586 },
      { x:  93.775, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.764 },
      { x:  93.775, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 4.941 },
      { x:  93.775, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.118 },
      { x:  93.775, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.295 },
      { x:  93.775, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.473 },
      { x:    92.7, z:  90.675, w:       4, d:    2.05, h:  0.3, mat: 'slab'       , y: 5.55 },
      { x:  91.625, z:   89.51, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 5.827 },
      { x:  91.625, z:   89.23, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.005 },
      { x:  91.625, z:   88.95, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.182 },
      { x:  91.625, z:   88.67, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.359 },
      { x:  91.625, z:   88.39, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.536 },
      { x:  91.625, z:   88.11, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.714 },
      { x:  91.625, z:   87.83, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 6.891 },
      { x:  91.625, z:   87.55, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.068 },
      { x:  91.625, z:   87.27, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.245 },
      { x:  91.625, z:   86.99, w:    1.85, d:    0.28, h:  0.2, mat: 'tread'      , y: 7.423 },
      { x:   93.55, z:  85.125, w:     2.3, d:    0.25, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:  90.625, z:  85.125, w:    0.35, d:    0.25, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:    91.6, z:  85.125, w:     1.6, d:    0.25, h:  1.2, mat: 'core'       , y: 10.2 },
      { x:  90.575, z:  88.475, w:    0.25, d:    6.45, h:  3.6, mat: 'core'       , y: 7.8 },
      { x:  93.775, z:    86.8, w:    1.85, d:     0.1, h:  1.1, mat: 'rail'       , y: 7.8 },
      { x:      76, z:   90.05, w:       8, d:     3.3, h: 11.4, mat: 'core'        },
      { x:    55.3, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'      },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:    56.9, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   58.35, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    59.8, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   61.25, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    62.7, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   64.15, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    65.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   67.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    68.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   69.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    71.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   72.85, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:      75, z:   80.15, w:       4, d:     0.3, h:  0.9, mat: 'facade'     , y: 2.7 },
      { x:   77.15, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'      },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:    78.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   80.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    81.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   82.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    84.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   85.85, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    87.3, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   88.75, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    90.2, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   91.65, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:    93.1, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:    94.7, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:  57.275, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.9, mat: 'facade'      },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:  60.675, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   61.95, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  63.225, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:    64.5, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  65.775, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   67.05, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  68.325, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:    69.6, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  70.875, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:      76, z:   91.85, w:       8, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:   80.95, z:   91.85, w:     1.9, d:     0.3, h:  0.9, mat: 'facade'     , y: 2.7 },
      { x:   82.05, z:   91.85, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.9, mat: 'facade'      },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:  83.475, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:    84.9, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  86.325, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   87.75, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:  89.175, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:  92.725, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'      },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'      },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:   55.15, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   55.15, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:   55.15, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'      },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 3.3 },
      { x:   94.85, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   94.85, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 0.9 },
      { x:   94.85, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 0.9 },
      { x:   55.15, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'      },
      { x:   94.85, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'      },
      { x:   82.23, z:   89.35, w:    0.06, d:     4.7, h:  3.6, mat: 'glass'       },
      { x:   82.63, z:   87.03, w:    0.74, d:    0.06, h:  3.6, mat: 'glass'       },
      { x:  87.325, z:   87.03, w:    6.25, d:    0.06, h:  3.6, mat: 'glass'       },
      { x:    83.6, z:   87.03, w:     1.2, d:    0.06, h:  1.2, mat: 'glass'      , y: 2.4 },
      { x:    86.4, z:    89.4, w:     4.4, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    62.4, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    62.4, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:    66.2, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    66.2, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:    62.4, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    62.4, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:    66.2, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    66.2, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:      84, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:      84, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:    87.8, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'        },
      { x:    87.8, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 0.75 },
      { x:      75, z:      86, w:       4, d:     0.8, h:  1.1, mat: 'counter'     },
      { x:    70.2, z:    81.7, w:     2.4, d:     0.6, h: 0.45, mat: 'bench'       },
      { x:    79.8, z:    81.7, w:     2.4, d:     0.6, h: 0.45, mat: 'bench'       },
      { x:    55.3, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:    56.9, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   58.35, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    59.8, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   61.25, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    62.7, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   64.15, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    65.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   67.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    68.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   69.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    71.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   72.85, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:      75, z:   80.15, w:       4, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:      75, z:   80.15, w:       4, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:  73.925, z:   80.15, w:    1.85, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:      75, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  76.075, z:   80.15, w:    1.85, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   77.15, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:    78.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   80.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    81.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   82.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    84.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   85.85, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    87.3, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   88.75, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    90.2, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   91.65, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:    93.1, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:    94.7, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:  57.275, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:  60.675, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   61.95, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  63.225, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:    64.5, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  65.775, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   67.05, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  68.325, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:    69.6, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  70.875, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:      76, z:   91.85, w:       8, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:   80.95, z:   91.85, w:     1.9, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:   80.95, z:   91.85, w:     1.9, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:   80.95, z:   91.85, w:     1.9, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   82.05, z:   91.85, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:  83.475, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:    84.9, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  86.325, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   87.75, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:  89.175, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:  92.725, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:   55.15, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   55.15, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:   55.15, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'     , y: 3.9 },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 7.2 },
      { x:   94.85, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   94.85, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 4.8 },
      { x:   94.85, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 4.8 },
      { x:   55.15, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:   94.85, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'     , y: 3.9 },
      { x:      75, z:   80.15, w:      40, d:     0.3, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:    61.5, z:    82.4, w:      13, d:     4.2, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:    88.5, z:    82.4, w:      13, d:     4.2, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:      75, z:  85.675, w:      40, d:    2.35, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:   55.15, z:  89.275, w:     0.3, d:    4.85, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:      75, z:  87.625, w:    31.4, d:    1.55, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:   94.85, z:  89.275, w:     0.3, d:    4.85, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:   65.65, z:   90.05, w:    12.7, d:     3.3, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:   85.35, z:   90.05, w:    10.7, d:     3.3, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:      75, z:   91.85, w:      40, d:     0.3, h:  0.3, mat: 'slab'       , y: 3.6 },
      { x:   82.23, z:   89.35, w:    0.06, d:     4.7, h:  3.6, mat: 'glass'      , y: 3.9 },
      { x:   82.63, z:   87.03, w:    0.74, d:    0.06, h:  3.6, mat: 'glass'      , y: 3.9 },
      { x:  87.325, z:   87.03, w:    6.25, d:    0.06, h:  3.6, mat: 'glass'      , y: 3.9 },
      { x:    83.6, z:   87.03, w:     1.2, d:    0.06, h:  1.2, mat: 'glass'      , y: 6.3 },
      { x:    86.4, z:    89.4, w:     4.4, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    62.4, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    62.4, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:    66.2, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    66.2, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:    62.4, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    62.4, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:    66.2, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    66.2, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:      84, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:      84, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:    87.8, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 3.9 },
      { x:    87.8, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 4.65 },
      { x:      75, z:   84.53, w:      14, d:    0.06, h:  1.1, mat: 'glass'      , y: 3.9 },
      { x:   67.97, z:    82.4, w:    0.06, d:     4.2, h:  1.1, mat: 'glass'      , y: 3.9 },
      { x:   82.03, z:    82.4, w:    0.06, d:     4.2, h:  1.1, mat: 'glass'      , y: 3.9 },
      { x:    55.3, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:   64.15, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:    56.9, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   58.35, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    59.8, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   61.25, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    62.7, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   64.15, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    65.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   67.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    68.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   69.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    71.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   72.85, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:      75, z:   80.15, w:       4, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:      75, z:   80.15, w:       4, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:  73.925, z:   80.15, w:    1.85, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:      75, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  76.075, z:   80.15, w:    1.85, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   77.15, z:   80.15, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:   85.85, z:   80.15, w:    17.1, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:    78.6, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   80.05, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    81.5, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   82.95, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    84.4, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   85.85, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    87.3, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   88.75, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    90.2, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   91.65, z:   80.15, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:    93.1, z:   80.15, w:     2.6, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:    94.7, z:   80.15, w:     0.6, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:  57.275, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:  65.775, z:   91.85, w:   12.45, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:  60.675, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   61.95, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  63.225, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:    64.5, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  65.775, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   67.05, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  68.325, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:    69.6, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  70.875, z:   91.85, w:    2.25, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:      76, z:   91.85, w:       8, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:   80.95, z:   91.85, w:     1.9, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:   80.95, z:   91.85, w:     1.9, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:   80.95, z:   91.85, w:     1.9, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   82.05, z:   91.85, w:     0.3, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:  86.325, z:   91.85, w:    8.25, d:     0.3, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:  83.475, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:    84.9, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  86.325, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   87.75, z:   91.85, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:  89.175, z:   91.85, w:    2.55, d:    0.06, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:  92.725, z:   91.85, w:    4.55, d:     0.3, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:   55.15, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:   55.15, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   55.15, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:   55.15, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.9, mat: 'facade'     , y: 7.8 },
      { x:   94.85, z:   82.65, w:     0.3, d:     4.7, h:  0.3, mat: 'facade'     , y: 11.1 },
      { x:   94.85, z:    81.4, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   94.85, z:   82.65, w:     0.3, d:     0.3, h:  2.4, mat: 'facade'     , y: 8.7 },
      { x:   94.85, z:    83.9, w:    0.06, d:     2.2, h:  2.4, mat: 'glass'      , y: 8.7 },
      { x:   55.15, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:   94.85, z:   88.35, w:     0.3, d:     6.7, h:  3.6, mat: 'facade'     , y: 7.8 },
      { x:      75, z:  83.425, w:      40, d:    6.85, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:   55.15, z:  89.275, w:     0.3, d:    4.85, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:      75, z:  87.625, w:    31.4, d:    1.55, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:   94.85, z:  89.275, w:     0.3, d:    4.85, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:   65.65, z:   90.05, w:    12.7, d:     3.3, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:   85.35, z:   90.05, w:    10.7, d:     3.3, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:      75, z:   91.85, w:      40, d:     0.3, h:  0.3, mat: 'slab'       , y: 7.5 },
      { x:   82.23, z:   89.35, w:    0.06, d:     4.7, h:  3.6, mat: 'glass'      , y: 7.8 },
      { x:   82.63, z:   87.03, w:    0.74, d:    0.06, h:  3.6, mat: 'glass'      , y: 7.8 },
      { x:  87.325, z:   87.03, w:    6.25, d:    0.06, h:  3.6, mat: 'glass'      , y: 7.8 },
      { x:    83.6, z:   87.03, w:     1.2, d:    0.06, h:  1.2, mat: 'glass'      , y: 10.2 },
      { x:    86.4, z:    89.4, w:     4.4, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    62.4, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    62.4, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:    66.2, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    66.2, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:    62.4, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    62.4, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:    66.2, z:    87.4, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    66.2, z:    87.4, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:      84, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:      84, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:    87.8, z:      83, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:    87.8, z:      83, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:      71, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:      71, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:      77, z:    83.2, w:     3.2, d:     1.6, h: 0.75, mat: 'desk'       , y: 7.8 },
      { x:      77, z:    83.2, w:     3.2, d:    0.05, h:  0.5, mat: 'screen'     , y: 8.55 },
      { x:  -71.33, z: -83.103, w:     1.8, d:     1.2, h:  0.2, mat: 'grating'    , y: 33.3 },
      { x:  -21.33, z: -83.103, w:     1.8, d:     1.2, h:  0.2, mat: 'grating'    , y: 33.3 },
    ],
    props: [
          {
                kind: 'reactor',
                x: 56,
                z: 0,
                deck: 2.4,
                n: 9
          },
          {
                kind: 'turbine',
                x: 56,
                z: -33,
                axis: 'z',
                dir: 1,
                unit: 1
          },
          {
                kind: 'turbine',
                x: 56,
                z: 33,
                axis: 'z',
                dir: -1,
                unit: 2
          },
          {
                kind: 'crane',
                z: -33,
                x0: -3,
                x1: 115,
                z0: -59,
                z1: 59,
                h: 16
          },
          {
                kind: 'crane',
                z: 33,
                x0: -3,
                x1: 115,
                z0: -59,
                z1: 59,
                h: 16
          },
          {
                kind: 'truss',
                span: 26,
                x0: -3,
                x1: 115,
                z0: -59,
                z1: 59,
                h: 16,
                x: 56
          },
          {
                kind: 'tray',
                x: 26,
                x0: -3,
                x1: 115,
                z0: -59,
                z1: 59,
                h: 16
          },
          {
                kind: 'tray',
                x: 86,
                x0: -3,
                x1: 115,
                z0: -59,
                z1: 59,
                h: 16
          },
          {
                kind: 'hallroof',
                x0: -4.5,
                x1: 116.5,
                z0: -60.5,
                z1: 60.5,
                y: 16
          },
          {
                kind: 'coolingtower',
                x: -74,
                z: -90,
                basin: 13,
                basinH: 2.6,
                beam: 10.54,
                n: 9,
                y0: 5.6,
                y1: 33,
                rt: 7.3,
                yt: 26,
                a: 19.6
          },
          {
                kind: 'coolingtower',
                x: -24,
                z: -90,
                basin: 13,
                basinH: 2.6,
                beam: 10.54,
                n: 9,
                y0: 5.6,
                y1: 33,
                rt: 7.3,
                yt: 26,
                a: 19.6
          },
          {
                kind: 'stack',
                x: 96,
                z: -88,
                r: 3,
                ri: 2.5,
                h: 68,
                n: 9,
                doors: [
                      [
                            160,
                            200,
                            0,
                            3.8
                      ],
                      [
                            160,
                            200,
                            13.8,
                            17.8
                      ]
                ]
          },
          {
                kind: 'piperack',
                x0: -61,
                x1: -37,
                px0: -65.8,
                px1: -32.2,
                z: -84,
                y: 6.6,
                legs: [
                      -56,
                      -48,
                      -42
                ]
          },
          {
                kind: 'piperack',
                x0: -11,
                x1: 29,
                px0: -15.8,
                px1: 29,
                z: -84,
                y: 6.6,
                legs: [
                      -6,
                      2,
                      10,
                      18,
                      26
                ]
          },
          {
                kind: 'pipebridge',
                x: 40,
                z0: -68,
                z1: -60,
                y: 9.5,
                rise: 25
          },
          {
                kind: 'pipebridge',
                x: 66,
                z0: -68,
                z1: -60,
                y: 9.5,
                rise: 25
          },
          {
                kind: 'ceilinglights',
                x0: 55.3,
                x1: 94.7,
                z0: 80.3,
                z1: 91.7,
                levels: [
                      3.6,
                      7.5,
                      11.399999999999999
                ],
                holes: [
                      [
                            55.3,
                            59.55,
                            85,
                            92
                      ],
                      [
                            90.45,
                            94.7,
                            85,
                            92
                      ],
                      [
                            72,
                            80,
                            88.4,
                            92
                      ]
                ],
                extra: [
                      [
                            [
                                  68,
                                  82,
                                  80,
                                  84.5
                            ]
                      ]
                ]
          },
          {
                kind: 'ladder',
                x: -48,
                z: -82.075,
                nx: 0,
                nz: 1,
                y0: 0,
                y1: 7.6,
                ex: 0,
                ez: -1
          },
          {
                kind: 'ladder',
                x: 10,
                z: -82.075,
                nx: 0,
                nz: 1,
                y0: 0,
                y1: 7.6,
                ex: 0,
                ez: -1
          },
          {
                kind: 'ladder',
                x: 42.3,
                z: -61,
                nx: 0,
                nz: -1,
                y0: 0,
                y1: 9.82,
                ex: -1.6,
                ez: 0
          },
          {
                kind: 'ladder',
                x: 68.3,
                z: -61,
                nx: 0,
                nz: -1,
                y0: 0,
                y1: 9.82,
                ex: -1.6,
                ez: 0
          },
          {
                kind: 'ladder',
                x: 97.95,
                z: -88,
                nx: -1,
                nz: 0,
                y0: 0,
                y1: 14,
                ex: -1.6,
                ez: 0
          },
          {
                kind: 'ladder',
                x: 96.5,
                z: 100.5,
                nx: 0,
                nz: -1,
                y0: 0,
                y1: 3.2,
                ex: 0,
                ez: 1.2,
                free: true
          },
          {
                kind: 'ladder',
                path: [
                      [
                            -69.937,
                            2.6,
                            -79.504
                      ],
                      [
                            -69.937,
                            4.1,
                            -79.504
                      ],
                      [
                            -69.937,
                            5.6,
                            -79.504
                      ],
                      [
                            -70.079,
                            7.1,
                            -79.871
                      ],
                      [
                            -70.216,
                            8.6,
                            -80.224
                      ],
                      [
                            -70.346,
                            10.1,
                            -80.561
                      ],
                      [
                            -70.469,
                            11.6,
                            -80.878
                      ],
                      [
                            -70.584,
                            13.1,
                            -81.175
                      ],
                      [
                            -70.69,
                            14.6,
                            -81.449
                      ],
                      [
                            -70.786,
                            16.1,
                            -81.697
                      ],
                      [
                            -70.871,
                            17.6,
                            -81.916
                      ],
                      [
                            -70.944,
                            19.1,
                            -82.105
                      ],
                      [
                            -71.004,
                            20.6,
                            -82.261
                      ],
                      [
                            -71.05,
                            22.1,
                            -82.38
                      ],
                      [
                            -71.082,
                            23.6,
                            -82.463
                      ],
                      [
                            -71.099,
                            25.1,
                            -82.506
                      ],
                      [
                            -71.101,
                            26.6,
                            -82.51
                      ],
                      [
                            -71.087,
                            28.1,
                            -82.475
                      ],
                      [
                            -71.058,
                            29.6,
                            -82.4
                      ],
                      [
                            -71.014,
                            31.1,
                            -82.287
                      ],
                      [
                            -70.957,
                            32.6,
                            -82.139
                      ],
                      [
                            -70.916,
                            33.5,
                            -82.033
                      ]
                ],
                nx: 0.36,
                nz: 0.93,
                y0: 2.6,
                y1: 33.5,
                ex: -0.396,
                ez: -1.0230000000000001,
                draw: false
          },
          {
                kind: 'ladder',
                path: [
                      [
                            -19.937,
                            2.6,
                            -79.504
                      ],
                      [
                            -19.937,
                            4.1,
                            -79.504
                      ],
                      [
                            -19.937,
                            5.6,
                            -79.504
                      ],
                      [
                            -20.079,
                            7.1,
                            -79.871
                      ],
                      [
                            -20.216,
                            8.6,
                            -80.224
                      ],
                      [
                            -20.346,
                            10.1,
                            -80.561
                      ],
                      [
                            -20.469,
                            11.6,
                            -80.878
                      ],
                      [
                            -20.584,
                            13.1,
                            -81.175
                      ],
                      [
                            -20.69,
                            14.6,
                            -81.449
                      ],
                      [
                            -20.786,
                            16.1,
                            -81.697
                      ],
                      [
                            -20.871,
                            17.6,
                            -81.916
                      ],
                      [
                            -20.944,
                            19.1,
                            -82.105
                      ],
                      [
                            -21.004,
                            20.6,
                            -82.261
                      ],
                      [
                            -21.05,
                            22.1,
                            -82.38
                      ],
                      [
                            -21.082,
                            23.6,
                            -82.463
                      ],
                      [
                            -21.099,
                            25.1,
                            -82.506
                      ],
                      [
                            -21.101,
                            26.6,
                            -82.51
                      ],
                      [
                            -21.087,
                            28.1,
                            -82.475
                      ],
                      [
                            -21.058,
                            29.6,
                            -82.4
                      ],
                      [
                            -21.014,
                            31.1,
                            -82.287
                      ],
                      [
                            -20.957,
                            32.6,
                            -82.139
                      ],
                      [
                            -20.916,
                            33.5,
                            -82.033
                      ]
                ],
                nx: 0.36,
                nz: 0.93,
                y0: 2.6,
                y1: 33.5,
                ex: -0.396,
                ez: -1.0230000000000001,
                draw: false
          },
          {
                kind: 'ceilinglights',
                x0: 29.5,
                x1: 82.5,
                z0: -95.5,
                z1: -68.5,
                levels: [
                      7.3999999999999995,
                      13.8,
                      20.8,
                      27.6
                ],
                holes: [
                      [
                            33.5,
                            48.5,
                            -92.5,
                            -71.5
                      ],
                      [
                            50.5,
                            66,
                            -92.5,
                            -71.5
                      ],
                      [
                            29.5,
                            33.5,
                            -95.5,
                            -68.5
                      ]
                ],
                extra: []
          },
          {
                kind: 'ceilinglights',
                x0: 25.3,
                x1: 54.7,
                z0: 99.3,
                z1: 108.7,
                levels: [
                      3.7
                ],
                holes: [],
                extra: []
          },
          {
                kind: 'ceilinglights',
                x0: 71.3,
                x1: 84.7,
                z0: 99.8,
                z1: 108.2,
                levels: [
                      4.7
                ],
                holes: [],
                extra: []
          },
          {
                kind: 'ceilinglights',
                x0: 93.3,
                x1: 106.7,
                z0: 94.3,
                z1: 105.7,
                levels: [
                      6.7
                ],
                holes: [],
                extra: []
          },
          {
                kind: 'ceilinglights',
                x0: -106.7,
                x1: -93.3,
                z0: -65.7,
                z1: -54.3,
                levels: [
                      6.7
                ],
                holes: [],
                extra: []
          },
          {
                kind: 'busbars',
                z: 78
          },
          {
                kind: 'busbars',
                z: 94
          },
          {
                kind: 'gantry',
                z: -24,
                y: 12,
                x0: -102,
                x1: -22,
                to: 24,
                sag: 3
          },
          {
                kind: 'gantry',
                z: 24,
                y: 12,
                x0: -102,
                x1: -22
          }
    ],
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
};

const DEFAULT_MAP = 'works';
const MAP_IDS = Object.keys(MAPS);

/* Never return undefined: an unknown id (an older client, a typo in an env
   var, a room from a newer server) falls back to the default rather than
   leaving one side with no arena at all. */
function mapById(id) {
  return (id && MAPS[id]) || MAPS[DEFAULT_MAP];
}

/* Collision boxes in the form both sides want: {minx,minz,maxx,maxz,miny,maxy}.
   A box is {x, z, w, d, h, y?}: it spans y..y+h, and `y` defaults to 0, so a
   box with no `y` stands on the floor as every box always has. A raised box
   is an upper floor's slab, a stair tread, anything with air under it.
   The server calls this for RECTS; the client's addBox builds the same thing
   per mesh.
   `glass: true` (mat 'glass') stops a player and NOT a shot: it stays in the
   movement tests and is left out of everything that flies (see arenaOf in
   server.js, and wallMeshes in world.js). */
function boxY(b) { return b.y || 0; }
/* What stops a player and NOT a shot: glass, and a handrail - a shot goes
   between the rails. Both carry `glass: true` on their rect. */
const MOVE_ONLY = { glass: 1, handrail: 1 };
/* The ladders on a map (props of kind 'ladder'). See works.js. */
function mapLadders(map) { return (map.props || []).filter(p => p.kind === 'ladder'); }
function mapRects(map) {
  return map.boxes.map(b => {
    const r = {
      minx: b.x - b.w / 2, maxx: b.x + b.w / 2,
      minz: b.z - b.d / 2, maxz: b.z + b.d / 2,
      miny: boxY(b),       maxy: boxY(b) + b.h,
    };
    if (MOVE_ONLY[b.mat]) r.glass = true;     // `glass` means "shots pass": a rail too
    return r;
  });
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
   it, so it belongs to the 3D ray tests only.

   OUTDOORS it is the lid of the world rather than a ceiling: `roofY` puts it
   well above the tallest thing on the site, so a shot arcing over a cooling
   tower behaves, and nothing is drawn there. Without it the lid would sit at
   `wallH` — the height of the site's own boundary — and every long shot would
   stop dead in clear air. */
function mapRoofY(map) { return map.roofY != null ? map.roofY : map.wallH; }

/* ROOFS OVER WALKABLE SPACE. A collision box stands on the floor, so a box
   can never be a roof: give the turbine hall's roof a box and the hall fills
   up solid. But a roof does not need to stop a PLAYER - you walk under it,
   never on it - it only needs to stop a BULLET. And the arena has had exactly
   that for as long as it has had a ceiling: a rect with its own miny and maxy
   that joins the 3D ray tests and stays out of the 2D movement tests.
   `roofRects` is that, generalised, which is the whole of what it takes to
   put a building you can walk into on an outdoor map.
   Each is { minx, maxx, minz, maxz, y } - `y` being its underside. */
function mapRoofRects(map) {
  return (map.roofRects || []).map(r => ({
    minx: r.minx, maxx: r.maxx, minz: r.minz, maxz: r.maxz,
    miny: r.y,    maxy: r.y + 1,
  }));
}
function mapCeilingRect(map) {
  const a = map.arena, y = mapRoofY(map);
  return { minx: -a-1, minz: -a-1, maxx: a+1, maxz: a+1, miny: y, maxy: y + 1 };
}

/* Node (the server) takes these by require; the browser just gets the globals
   from the script tag. Guarded so the same file works as both. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MAPS, MAP_IDS, DEFAULT_MAP, mapById, boxY, MOVE_ONLY, mapLadders, mapRects, mapWallRects, mapCeilingRect, mapRoofY, mapRoofRects };
}
