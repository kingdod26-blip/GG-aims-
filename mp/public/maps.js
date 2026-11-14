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
    name: 'THE WORKS',
    blurb: 'The whole site. Turbine hall, substation compound, cooling towers, the stack.',
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

      // THE SUBSTATION — the whole of that map, moved west. It was always an
      // outdoor shape (three walled lanes, four corner towers, a core), so
      // it needs no roof: it becomes the compound it always looked like.
      { x:     -62, z:       0, w:       7, d:       7, h:    3, mat: 'pillar'      },
      { x:     -78, z:       0, w:       2, d:      26, h:    4, mat: 'block'       },
      { x:     -46, z:       0, w:       2, d:      26, h:    4, mat: 'block'       },
      { x:     -62, z:     -26, w:      26, d:       2, h:    4, mat: 'block'       },
      { x:     -62, z:      26, w:      26, d:       2, h:    4, mat: 'block'       },
      { x:     -92, z:     -30, w:       6, d:       6, h:    4, mat: 'pillar'      },
      { x:     -32, z:      30, w:       6, d:       6, h:    4, mat: 'pillar'      },
      { x:     -32, z:     -30, w:       6, d:       6, h:    4, mat: 'pillar'      },
      { x:     -92, z:      30, w:       6, d:       6, h:    4, mat: 'pillar'      },
      { x:     -86, z:       0, w:       4, d:       4, h:  2.4, mat: 'crate'       },
      { x:     -38, z:       0, w:       4, d:       4, h:  2.4, mat: 'crate'       },
      { x:     -71, z:      -9, w:       3, d:       3, h:  1.6, mat: 'crate'       },
      { x:     -53, z:       9, w:       3, d:       3, h:  1.6, mat: 'crate'       },
      { x:     -53, z:      -9, w:       3, d:       3, h:  1.6, mat: 'crate'       },
      { x:     -71, z:       9, w:       3, d:       3, h:  1.6, mat: 'crate'       },
      { x:     -62, z:     -13, w:       5, d:       2, h:    2, mat: 'crate'       },
      { x:     -62, z:      13, w:       5, d:       2, h:    2, mat: 'crate'       },

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

      // THE BOILER HOUSE, against the hall's north wall, and its stack
      { x:      56, z:     -82, w:      54, d:      28, h:   28, mat: 'boiler'      },
      { x:      96, z:     -96, w:   5.831, d:   1.414, h:   68, mat: 'mass'       , r: 3, n: 9 },
      { x:      96, z:     -96, w:   5.477, d:   2.449, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   5.099, d:   3.162, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:    4.69, d:   3.742, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   4.243, d:   4.243, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   3.742, d:    4.69, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   3.162, d:   5.099, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   2.449, d:   5.477, h:   68, mat: 'hidden'      },
      { x:      96, z:     -96, w:   1.414, d:   5.831, h:   68, mat: 'hidden'      },

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
      { x:      40, z:     104, w:      30, d:      10, h:    4, mat: 'intake'      },
      { x:      78, z:     104, w:      14, d:       9, h:    5, mat: 'shed'        },
      { x:      10, z:     108, w:       8, d:       5, h:  2.2, mat: 'gear'        },

      // The step-up transformers, between the hall and the compound, round the
      // resupply — the one piece of ground every route crosses
      { x:     -14, z:     -11, w:       7, d:     5.5, h:  3.2, mat: 'transformer' },
      { x:     -14, z:      11, w:       7, d:     5.5, h:  3.2, mat: 'transformer' },
      { x:     -24, z:       0, w:     1.4, d:      16, h:    5, mat: 'firewall'    },

      // and cover on the open ground, so the yard is crossable
      { x:     -40, z:     -40, w:       3, d:      16, h:  2.6, mat: 'pipe'        },
      { x:     -40, z:      40, w:       3, d:      16, h:  2.6, mat: 'pipe'        },
      { x:     -14, z:     -40, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:     -14, z:      40, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:      30, z:     -70, w:       7, d:       7, h:    3, mat: 'pipe'        },
      { x:     -60, z:      60, w:       7, d:       7, h:    3, mat: 'pipe'        },
      { x:      20, z:      70, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:     -96, z:     -30, w:       6, d:      14, h:  3.4, mat: 'pipe'        },
      { x:     -96, z:      30, w:       6, d:      14, h:  3.4, mat: 'pipe'        },
      { x:      96, z:      40, w:       6, d:      14, h:  3.4, mat: 'pipe'        },
      { x:      96, z:     -40, w:       6, d:      14, h:  3.4, mat: 'pipe'        },
      { x:     -50, z:    -112, w:      16, d:       3, h:  2.2, mat: 'pipe'        },
      { x:       0, z:    -112, w:      16, d:       3, h:  2.2, mat: 'pipe'        },

      // a workshop or two
      { x:    -100, z:     -60, w:      14, d:      12, h:    7, mat: 'shed'        },
      { x:     100, z:     100, w:      14, d:      12, h:    7, mat: 'shed'        },
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
                z: -96,
                r: 3,
                h: 68,
                n: 9
          },
          {
                kind: 'busbars',
                z: 78
          },
          {
                kind: 'busbars',
                z: 94
          }
    ],
    paint: [
      { k: 'walk',  x0: -14, z0: -116, x1: -14, z1: 116, w: 3.2 },
      { k: 'walk',  x0: -116, z0: 0, x1: -106, z1: 0, w: 3.2 },
      { k: 'walk',  x0: -14, z0: -66, x1: 110, z1: -66, w: 3.2 },
      { k: 'walk',  x0: -14, z0: 66, x1: 110, z1: 66, w: 3.2 },
      { k: 'hatch', x: -14, z: -11, w: 8.6, d: 7.1 }, { k: 'hatch', x: -14, z: 11, w: 8.6, d: 7.1 },
      { k: 'hatch', x: -74, z: -90, w: 27.4, d: 27.4 },
      { k: 'hatch', x: -24, z: -90, w: 27.4, d: 27.4 },
      { k: 'text',  x: -14, z: 24, s: 2.6, t: 'HV YARD' },
      { k: 'text',  x: -62, z: 52, s: 2.6, t: 'SUBSTATION' },
      { k: 'text',  x: 56, z: 70, s: 2.6, t: 'TURBINE HALL' },
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
  module.exports = { MAPS, MAP_IDS, DEFAULT_MAP, mapById, mapRects, mapWallRects, mapCeilingRect, mapRoofY, mapRoofRects };
}
