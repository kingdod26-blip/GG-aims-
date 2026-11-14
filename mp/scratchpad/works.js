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
const note = (t) => out.push({ note: t });
const box = (x, z, w, d, h, mat, extra) =>
  out.push(Object.assign({ x: +x.toFixed(2), z: +z.toFixed(2), w: +w.toFixed(3), d: +d.toFixed(3), h, mat }, extra || {}));

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
for (const b of M.MAPS.powerstation.boxes) {
  box(b.x + HALL_DX, b.z, b.w, b.d, b.h, b.mat,
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
// west face, two doors onto the yard that joins it to the substation
wallE(HX0 - HW / 2, HZ0 - HW, -20, HH, 'cladding');
wallE(HX0 - HW / 2, -14, 14, HH, 'cladding');
wallE(HX0 - HW / 2, 20, HZ1 + HW, HH, 'cladding');
// east face, solid onto the service road
wallE(HX1 + HW / 2, HZ0 - HW, HZ1 + HW, HH, 'cladding');
// north face, a door toward the boiler house
wallN(HZ0 - HW / 2, HX0 - HW, 46, HH, 'cladding');
wallN(HZ0 - HW / 2, 54, HX1 + HW, HH, 'cladding');
// south face, a door toward the quay
wallN(HZ1 + HW / 2, HX0 - HW, 20, HH, 'cladding');
wallN(HZ1 + HW / 2, 28, HX1 + HW, HH, 'cladding');

/* ===================================================================== */
/* 2. THE SUBSTATION, verbatim, as a walled compound                     */
/* ===================================================================== */
note('THE SUBSTATION — the whole of that map, moved west. It was always an\n' +
     '      outdoor shape (three walled lanes, four corner towers, a core), so\n' +
     '      it needs no roof: it becomes the compound it always looked like.');
for (const b of M.MAPS.substation.boxes) box(b.x + SUB_DX, b.z, b.w, b.d, b.h, b.mat);

const SX0 = SUB_DX - 42, SX1 = SUB_DX + 42, SZ0 = -46, SZ1 = 46, SWH = 5, SW = 1.4;
const subN = (z, x0, x1) => { if (x1 - x0 > 0.01) box((x0 + x1) / 2, z, x1 - x0, SW, SWH, 'firewall'); };
const subE = (x, z0, z1) => { if (z1 - z0 > 0.01) box(x, (z0 + z1) / 2, SW, z1 - z0, SWH, 'firewall'); };
note('with a compound wall and its gates — the gates are on the centre lines\n' +
     '      of the compound, not of the map, which is where that arithmetic\n' +
     '      went wrong the first time');
subE(SX0 - SW / 2, SZ0 - SW, SZ1 + SW);                      // west, solid
subE(SX1 + SW / 2, SZ0 - SW, -8);                            // east, the main gate onto the yard
subE(SX1 + SW / 2, 8, SZ1 + SW);
subN(SZ0 - SW / 2, SX0 - SW, SUB_DX - 6);                    // north, a gate
subN(SZ0 - SW / 2, SUB_DX + 6, SX1 + SW);
subN(SZ1 + SW / 2, SX0 - SW, SUB_DX - 6);                    // south, a gate
subN(SZ1 + SW / 2, SUB_DX + 6, SX1 + SW);

/* ===================================================================== */
/* 3. THE SITE AROUND THEM                                               */
/* ===================================================================== */
note('THE COOLING TOWERS, north-west, where there is room for two of them');
coolingTower(-74, -90);
coolingTower(-24, -90);

note('THE BOILER HOUSE, against the hall\'s north wall, and its stack');
box(56, -82, 54, 28, 28, 'boiler');
drum(96, -96, 3.0, 68.0, 'mass');

note('THE SWITCHYARD, south-west: two rows of portals and the gear beneath');
for (const z of [78, 94]) for (let i = 0; i < 7; i++) box(-110 + i * 14, z, 1.4, 1.4, 13, 'lattice');
for (let i = 0; i < 6; i++) box(-104 + i * 14, 86, 3.4, 3.0, 2.4, 'gear');

note('THE OIL TANKS, the far south-west corner');
for (const [tx, tz] of [[-100, 108], [-80, 112], [-60, 106]]) drum(tx, tz, 6.0, 10.0, 'tank');

note('THE QUAY, south-east: the intake house and the screens');
box(40, 104, 30, 10, 4.0, 'intake');
box(78, 104, 14, 9, 5.0, 'shed');
box(10, 108, 8, 5, 2.2, 'gear');

note('The step-up transformers, between the hall and the compound, round the\n' +
     '      resupply — the one piece of ground every route crosses');
box(-14, -11, 7, 5.5, 3.2, 'transformer');
box(-14, 11, 7, 5.5, 3.2, 'transformer');
box(-24, 0, 1.4, 16, 5, 'firewall');

note('and cover on the open ground, so the yard is crossable');
for (const [x, z, w, d, h] of [
  [-40, -40, 3, 16, 2.6], [-40, 40, 3, 16, 2.6],
  [-14, -40, 16, 3, 2.2], [-14, 40, 16, 3, 2.2],
  [30, -70, 7, 7, 3.0], [-60, 60, 7, 7, 3.0], [20, 70, 16, 3, 2.2],
  [-96, -30, 6, 14, 3.4], [-96, 30, 6, 14, 3.4],
  [96, 40, 6, 14, 3.4], [96, -40, 6, 14, 3.4],
  [-50, -112, 16, 3, 2.2], [0, -112, 16, 3, 2.2],
]) box(x, z, w, d, h, 'pipe');

note('a workshop or two');
box(-100, -60, 14, 12, 7, 'shed');
box(100, 100, 14, 12, 7, 'shed');

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
P.push({ kind: 'coolingtower', x: -74, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA });
P.push({ kind: 'coolingtower', x: -24, z: -90, basin: 13, basinH: 2.6, beam: +shellR(5.6).toFixed(2), n: 9, y0: 5.6, y1: 33, rt: RT, yt: YT, a: AA });
P.push({ kind: 'stack', x: 96, z: -96, r: 3, h: 68, n: 9 });
P.push({ kind: 'busbars', z: 78 });
P.push({ kind: 'busbars', z: 94 });

/* ---------------------------------------------------------------- emit -- */
const lines = [];
for (const o of out) {
  if (o.note) { lines.push('\n' + o.note.split('\n').map(l => '      // ' + l.trim()).join('\n')); continue; }
  const ex = (o.r != null ? `, r: ${o.r}, n: ${o.n}` : '');
  lines.push(`      { x: ${String(o.x).padStart(7)}, z: ${String(o.z).padStart(7)}, w: ${String(o.w).padStart(7)}, ` +
             `d: ${String(o.d).padStart(7)}, h: ${String(o.h).padStart(4)}, mat: ${("'" + o.mat + "'").padEnd(13)}${ex} },`);
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
    name: 'THE WORKS',
    blurb: 'The whole site. Turbine hall, substation compound, cooling towers, the stack.',
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

`;

/* Replace the whole of `works` in maps.js, between its own comment and the
   close of MAPS. It is the only entry there, so there is no next map to
   anchor on any more. */
let src = fs.readFileSync(path, 'utf8');
const a = src.indexOf('  /* THE WORKS');
const b = src.indexOf('\n};\n\nconst DEFAULT_MAP');
if (a < 0 || b < a) { console.error('maps.js: cannot find where `works` starts and MAPS ends'); process.exit(1); }
fs.writeFileSync(path, src.slice(0, a) + body.replace(/\n+$/, '\n') + src.slice(b + 1));
console.log('works built:', out.filter(o => !o.note).length, 'boxes,', P.length, 'props');
