/* =============================================================
   Crimson X — drawn.js  (after weapons.js, before session.js; unnumbered)

   EVERY MODEL IN THE GAME IS BUILT HERE, IN CODE. There are no model
   files: the five guns, the arms that hold them, and the operator
   everyone plays are all assembled here.

   The first cut was boxes and tubes and looked it. What changed:
   - a gun is a SILHOUETTE. Its side view is drawn as an outline and
     pushed out to a thickness with rounded edges (`dProf`), which is how
     a receiver, a stock or a curved magazine gets its real shape. Boxes
     can only ever make a gun out of bricks.
   - a hand has FINGERS, curled round what it holds.
   - a body is made of rounded parts: capsules for limbs, a turned
     (lathe) shell for the helmet, plates laid over a suit.

   Conventions the rest of the game relies on:
   - a gun is built pointing down -Z with +Y up, in the space of its
     weapon holder, sitting at the old model offset (0.02, -0.03, 0.05)
   - its front sight is on the centre line, because aiming lifts the gun
     until `aimTop` (the highest point on that line) meets the eye
   - a body faces +Z, stands 1.9m tall with its head at 1.70, and carries
     `userData = { la, ra, ll, rl, walk }` so the loop can swing its limbs

   These files are CLASSIC scripts sharing ONE global scope.
   ============================================================= */

/* ---- materials: made once, shared by everything drawn here ---- */
const DRAWN_MATS = {};
function dmat(key, color, metalness, roughness, extra){
  if (DRAWN_MATS[key]) return DRAWN_MATS[key];
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra || {}));
  m.userData.envK = 0.85;
  /* Two personalities, like every other material: with no environment to
     reflect (LOOK: FLAT) metal renders black, so it is switched off there. */
  return (DRAWN_MATS[key] = lookTag(m, { metalness, roughness }, { metalness: 0, roughness }));
}
const M_STEEL  = () => dmat('steel',  0x4a4e55, 0.92, 0.32);
const M_DARK   = () => dmat('dark',   0x1b1d21, 0.60, 0.42);
const M_POLY   = () => dmat('poly',   0x121315, 0.00, 0.60);
const M_POLY2  = () => dmat('poly2',  0x23262b, 0.00, 0.52);
const M_TAN    = () => dmat('tan',    0x4a4234, 0.00, 0.66);
const M_WOOD   = () => dmat('wood',   0x3a2415, 0.00, 0.58);
const M_RED    = () => dmat('red',    0xa01e30, 0.10, 0.48);
const M_GLASS  = () => dmat('glass',  0x10303c, 0.80, 0.08);
const M_SLEEVE = () => dmat('sleeve', 0x1a1d21, 0.00, 0.88);
const M_GLOVE  = () => dmat('glove',  0x0d0e10, 0.00, 0.72);
const M_PAD    = () => dmat('pad',    0x2c3037, 0.35, 0.50);

const dAdd = (g, o) => { o.frustumCulled = false; g.add(o); return o; };
function dBox(g, m, w, h, d, x, y, z, rx, rz){
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; return dAdd(g, o);
}
/* A cylinder lying along Z, which is the way a barrel points. */
function dTube(g, m, r, len, x, y, z, r2, sides){
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2 || r, r, len, sides || 16), m);
  o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return dAdd(g, o);
}
/* A SILHOUETTE given thickness. `pts` is the side view as [forward, up]
   pairs, walked round its outline; it is extruded `thick` wide with its
   edges rounded by `bevel`. Forward is toward the muzzle, i.e. -Z. */
function dProf(g, m, pts, thick, bevel, x, y, z){
  const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
  const b = bevel == null ? 0.004 : bevel;
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, thick - 2 * b), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 6 });
  geo.translate(0, 0, -(thick - 2 * b) / 2);
  const o = new THREE.Mesh(geo, m); o.rotation.y = Math.PI / 2;      // the shape's x becomes -Z, its depth becomes X
  o.position.set(x || 0, y || 0, z || 0); return dAdd(g, o);
}

/* ---- the guns ----
   Each returns the group plus where the hands go and which part is the
   magazine, so the arms and the reload know the gun they are holding. */
function drawRifle(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), p2 = M_POLY2();
  // upper receiver, with the brass deflector hump
  dProf(g, dk, [[-0.13, 0.008], [0.12, 0.008], [0.12, 0.040], [0.02, 0.040], [-0.01, 0.046], [-0.05, 0.046], [-0.07, 0.040], [-0.13, 0.036]], 0.046, 0.005);
  // lower receiver: magazine well dropping at the front, trigger housing behind
  dProf(g, p2, [[-0.13, 0.010], [0.10, 0.010], [0.10, -0.034], [0.055, -0.040], [0.045, -0.018], [-0.02, -0.018], [-0.03, -0.030], [-0.075, -0.030], [-0.13, -0.006]], 0.042, 0.005);
  // free-float handguard, tapering to the muzzle end, with lightening slots
  dProf(g, p2, [[0.12, -0.022], [0.37, -0.016], [0.37, 0.036], [0.12, 0.040]], 0.044, 0.006);
  for (let i = 0; i < 5; i++){ dBox(g, po, 0.047, 0.012, 0.028, 0, 0.010, -0.155 - i * 0.043); dBox(g, po, 0.020, 0.012, 0.028, 0, -0.024, -0.155 - i * 0.043); }
  dTube(g, st, 0.0095, 0.19, 0, 0.012, -0.455);                    // barrel
  dTube(g, st, 0.013, 0.03, 0, 0.012, -0.40);                      // gas block
  dTube(g, dk, 0.0155, 0.060, 0, 0.012, -0.572, 0.013);            // muzzle brake
  for (let i = 0; i < 3; i++) dBox(g, po, 0.034, 0.006, 0.008, 0, 0.012, -0.556 - i * 0.014);
  for (let i = 0; i < 22; i++) dBox(g, dk, 0.020, 0.008, 0.012, 0, 0.049, 0.115 - i * 0.022);       // a top rail, as notches
  dProf(g, st, [[0.325, 0.046], [0.345, 0.046], [0.340, 0.078], [0.330, 0.078]], 0.007, 0.001);       // front sight, on the centre line
  dProf(g, st, [[-0.105, 0.046], [-0.070, 0.046], [-0.075, 0.074], [-0.100, 0.074]], 0.024, 0.002);   // rear sight housing
  dBox(g, po, 0.006, 0.014, 0.020, 0, 0.073, 0.0875);
  dBox(g, dk, 0.030, 0.012, 0.020, 0, 0.040, 0.122);               // charging handle
  dBox(g, st, 0.004, 0.018, 0.050, 0.0245, 0.020, 0.005);          // ejection port
  dTube(g, st, 0.012, 0.19, 0, 0.018, 0.215);                      // buffer tube
  // stock: a real profile, with the cut under it and a butt pad
  dProf(g, po, [[-0.19, 0.036], [-0.36, 0.034], [-0.375, -0.070], [-0.345, -0.074], [-0.30, -0.020], [-0.19, -0.004]], 0.038, 0.006);
  dBox(g, p2, 0.040, 0.108, 0.014, 0, -0.018, 0.375);
  // pistol grip, raked back, with a flared base
  dProf(g, po, [[-0.062, -0.026], [-0.100, -0.030], [-0.128, -0.120], [-0.086, -0.126], [-0.070, -0.060]], 0.032, 0.006);
  dProf(g, dk, [[-0.02, -0.018], [-0.062, -0.026], [-0.060, -0.054], [-0.030, -0.058], [-0.012, -0.040]], 0.006, 0.001);   // trigger guard
  dBox(g, st, 0.005, 0.022, 0.006, 0, -0.034, 0.040, 0.3);         // trigger
  // the magazine: curved, as a 30-round box is
  const mag = dProf(g, dk, [[0.092, -0.030], [0.050, -0.036], [0.030, -0.150], [0.036, -0.176], [0.080, -0.170], [0.090, -0.100]], 0.024, 0.004);
  return { g, grip: [0, -0.078, 0.094], fore: [0, -0.030, -0.245], mag, magAt: [0, -0.185, -0.055] };
}
/* A HALF-FRAME SCOPE for the rifle: a compact low-power scope held in two
   half rings - cradles round the LOWER half of the tube only, clamped to the
   rifle's existing top rail. It is a separate group in the rifle's own
   space and adds nothing to, and moves nothing on, the rifle itself.
   Fitted to what the rifle already has:
   - the rail's top is y 0.053 and it is 0.020 wide; each clamp sits ON it,
     its jaws hanging either side of the rail and stopping above the
     receiver (0.040), so nothing passes into the gun
   - the rings sit over rail notches 7 and 11 (z -0.039 and -0.127), where
     the tube is plain - clear of the turret saddle
   - the whole scope lies between the iron sights: its eyepiece ends 15mm
     in front of the rear sight housing (z 0.070) and its objective 120mm
     behind the front sight (z -0.325), so it touches neither
   - the axis is 49mm over the rail (y 0.102). 38mm, the usual AR height,
     put the bottom of the eyepiece (0.0715) under the top of the rifle's
     rear sight post (0.080), so the post sat in the lower edge of the view
     through the scope. Only the scope's mount was raised to clear it: the
     ocular's lower edge is now 0.0825, and the line from an eye on the axis
     to it passes about 7mm over the post. Note the iron-sight line (0.080)
     passes only 2.5mm under the scope: from there the view ahead is a thin
     slit, so with the scope on, aiming wants the eye on the SCOPE's axis. */
const SCOPE_FIT = { axisY: 0.102, tubeR: 0.015, ringZ: [-0.039, -0.127], railTop: 0.053 };
function drawRifleScope(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), gl = M_GLASS();
  const A = SCOPE_FIT.axisY, R = SCOPE_FIT.tubeR;
  // body, rear to front: eyepiece, magnification ring, taper, tube, saddle, taper, objective bell
  dTube(g, po, 0.0195, 0.050, 0, A, 0.030);                         // eyepiece
  dTube(g, dk, 0.0205, 0.012, 0, A, 0.002);                         // magnification ring
  dBox(g, dk, 0.010, 0.006, 0.008, 0.022, A, 0.002);                // its throw lever, to the right
  dTube(g, dk, R, 0.020, 0, A, -0.005, 0.0195);                     // eyepiece down to the tube
  dTube(g, dk, R, 0.135, 0, A, -0.0825);                            // main tube
  dTube(g, dk, 0.0175, 0.040, 0, A, -0.080);                        // turret saddle
  { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.016, 14), dk); t.position.set(0, A + 0.0255, -0.080); dAdd(g, t);   // elevation, upright
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.003, 14), st); c.position.set(0, A + 0.035, -0.080); dAdd(g, c);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.016, 14), dk); w.rotation.z = Math.PI / 2; w.position.set(0.0255, A, -0.080); dAdd(g, w); }   // windage, sideways
  dTube(g, dk, 0.0185, 0.025, 0, A, -0.1625, R);                    // tube out to the bell
  dTube(g, dk, 0.0185, 0.030, 0, A, -0.190);                        // objective bell
  dTube(g, gl, 0.0165, 0.002, 0, A, -0.2055);                       // objective lens
  dTube(g, gl, 0.0170, 0.002, 0, A, 0.0555);                        // ocular lens
  // the half rings: a cradle under the tube, a stem, and a clamp on the rail
  const ro = R + 0.0055, half = new THREE.Shape();
  half.absarc(0, 0, ro, Math.PI, Math.PI * 2, false); half.absarc(0, 0, R + 0.0002, Math.PI * 2, Math.PI, true);
  const cradle = new THREE.ExtrudeGeometry(half, { depth: 0.014, bevelEnabled: false, curveSegments: 12 }); cradle.translate(0, 0, -0.007);
  const top = SCOPE_FIT.railTop;
  for (const z of SCOPE_FIT.ringZ){
    const c = new THREE.Mesh(cradle, dk); c.position.set(0, A, z); dAdd(g, c);
    for (const sx of [-1, 1]) dBox(g, dk, 0.006, 0.004, 0.014, sx * (ro + 0.002), A - 0.002, z);   // the ring's two ears
    dBox(g, dk, 0.012, A - ro - top - 0.010 + 0.002, 0.012, 0, (A - ro + top + 0.010) / 2, z);      // stem, cradle down to clamp
    dBox(g, dk, 0.030, 0.010, 0.018, 0, top + 0.005, z);                                            // clamp, on the rail
    for (const sx of [-1, 1]) dBox(g, dk, 0.005, 0.010, 0.018, sx * 0.0125, top - 0.001, z);        // jaws either side of it
    dTube(g, st, 0.003, 0.004, 0.017, top + 0.005, z).rotation.set(0, 0, Math.PI / 2);              // cross-bolt head
  }
  return g;
}
function drawSniper(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), tn = M_TAN(), gl = M_GLASS();
  // one-piece chassis: fore-end, action bed, thumbhole grip and stock in a single outline
  dProf(g, tn, [[0.34, -0.030], [0.34, 0.006], [0.08, 0.010], [-0.10, 0.010], [-0.16, 0.034], [-0.44, 0.030], [-0.455, -0.090], [-0.42, -0.094],
               [-0.36, -0.040], [-0.24, -0.030], [-0.215, -0.120], [-0.170, -0.124], [-0.150, -0.050], [-0.06, -0.044], [0.02, -0.050]], 0.046, 0.007);
  dProf(g, dk, [[-0.12, 0.010], [0.12, 0.010], [0.12, 0.046], [-0.12, 0.046]], 0.036, 0.006);       // action
  dTube(g, st, 0.0125, 0.50, 0, 0.030, -0.37, 0.0105);                                              // tapered heavy barrel
  for (let i = 0; i < 6; i++) dTube(g, dk, 0.0128, 0.014, 0, 0.030, -0.16 - i * 0.03);              // fluting rings
  dTube(g, dk, 0.020, 0.085, 0, 0.030, -0.655);                                                     // brake
  for (let i = 0; i < 3; i++) dBox(g, po, 0.044, 0.010, 0.012, 0, 0.030, -0.63 - i * 0.022);
  // scope: tube, bells, lenses, turrets
  dTube(g, dk, 0.0155, 0.30, 0, 0.094, -0.01);
  dTube(g, dk, 0.027, 0.085, 0, 0.094, -0.185, 0.0155); dTube(g, dk, 0.027, 0.03, 0, 0.094, -0.24);
  dTube(g, dk, 0.0215, 0.075, 0, 0.094, 0.165, 0.0155);
  dTube(g, gl, 0.0245, 0.003, 0, 0.094, -0.2555); dTube(g, gl, 0.019, 0.003, 0, 0.094, 0.2035);
  { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12), dk); t.position.set(0, 0.118, -0.01); dAdd(g, t);            // elevation turret, upright
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12), dk); w.rotation.z = Math.PI / 2; w.position.set(0.026, 0.094, -0.01); dAdd(g, w); }   // windage, sideways
  dBox(g, st, 0.018, 0.034, 0.020, 0, 0.066, -0.09); dBox(g, st, 0.018, 0.034, 0.020, 0, 0.066, 0.07);   // rings
  { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.055, 10), st); h.rotation.z = Math.PI / 2 - 0.5; h.position.set(0.040, 0.020, 0.085); dAdd(g, h);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), st); k.position.set(0.064, 0.006, 0.085); dAdd(g, k); }   // bolt handle and knob
  dProf(g, po, [[-0.17, 0.034], [-0.33, 0.034], [-0.33, 0.058], [-0.18, 0.054]], 0.036, 0.005);     // cheek riser
  dBox(g, po, 0.044, 0.118, 0.016, 0, -0.030, 0.455);                                               // butt pad
  for (const sx of [-1, 1]) dBox(g, dk, 0.007, 0.13, 0.009, sx * 0.022, -0.075, -0.27, 1.25, 0);    // bipod legs, folded forward
  const mag = dProf(g, dk, [[0.05, -0.044], [-0.03, -0.044], [-0.035, -0.105], [0.045, -0.105]], 0.026, 0.004);
  return { g, grip: [0, -0.085, 0.19], fore: [0, -0.045, -0.20], mag, magAt: [0, -0.13, -0.008] };
}
function drawShotgun(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), wd = M_WOOD();
  dProf(g, dk, [[-0.10, -0.034], [0.13, -0.030], [0.13, 0.034], [-0.06, 0.034], [-0.10, 0.020]], 0.044, 0.006);   // receiver
  dBox(g, st, 0.004, 0.022, 0.085, 0.0235, 0.004, -0.02);                                           // ejection port
  dTube(g, st, 0.0125, 0.50, 0, 0.018, -0.37);                                                      // barrel
  dTube(g, st, 0.0118, 0.40, 0, -0.014, -0.32);                                                     // tube magazine
  dTube(g, dk, 0.014, 0.02, 0, -0.014, -0.525);                                                     // its cap
  dBox(g, st, 0.012, 0.046, 0.014, 0, 0.002, -0.50);                                                // barrel band
  dProf(g, st, [[0.612, 0.031], [0.620, 0.031], [0.618, 0.044], [0.614, 0.044]], 0.006, 0.001);     // bead
  dProf(g, wd, [[0.16, -0.040], [0.33, -0.036], [0.33, 0.004], [0.16, 0.004]], 0.048, 0.008);       // the pump...
  for (let i = 0; i < 6; i++) dBox(g, wd, 0.051, 0.030, 0.007, 0, -0.018, -0.175 - i * 0.026);      // ...and its ribs
  // stock and grip as one piece of wood
  dProf(g, wd, [[-0.09, 0.022], [-0.40, -0.002], [-0.415, -0.105], [-0.385, -0.110], [-0.23, -0.058], [-0.175, -0.112], [-0.135, -0.108], [-0.10, -0.034]], 0.038, 0.008);
  dBox(g, M_POLY(), 0.040, 0.110, 0.014, 0, -0.054, 0.415);                                         // recoil pad
  dProf(g, dk, [[0.00, -0.034], [-0.085, -0.036], [-0.082, -0.064], [-0.02, -0.066], [0.004, -0.05]], 0.006, 0.001);   // trigger guard
  const mag = dTube(g, M_RED(), 0.0095, 0.058, 0, -0.050, -0.02);                                   // the shell in your hand on a reload
  mag.visible = false;
  return { g, grip: [0, -0.070, 0.150], fore: [0, -0.045, -0.245], mag, magAt: [0, -0.060, -0.02], shell: true };
}
function drawPistol(heavy){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY();
  const L = heavy ? 0.125 : 0.110, sl = heavy ? st : dk;
  // slide: stepped down at the muzzle
  dProf(g, sl, [[-0.090, 0.006], [L, 0.006], [L, 0.030], [L - 0.012, 0.040], [-0.085, 0.040], [-0.090, 0.030]], 0.029, 0.004);
  for (let i = 0; i < 6; i++) dBox(g, po, 0.0305, 0.026, 0.0035, 0, 0.023, 0.045 + i * 0.007);     // rear serrations
  dBox(g, po, 0.004, 0.012, 0.040, 0.0152, 0.028, -0.02);                                           // ejection port
  dTube(g, st, 0.0065, 0.012, 0, 0.022, -L - 0.004);                                                // barrel crown
  // frame, dust cover, beavertail and raked grip, in one outline
  dProf(g, po, [[L - 0.004, 0.004], [L - 0.004, -0.014], [0.030, -0.016], [0.018, -0.040], [-0.022, -0.034], [-0.052, -0.128], [-0.098, -0.120],
               [-0.082, -0.030], [-0.110, -0.004], [-0.098, 0.006]], 0.027, 0.005);
  if (heavy){ dBox(g, dk, 0.022, 0.014, 0.050, 0, -0.022, -0.080); dTube(g, M_GLASS(), 0.008, 0.004, 0, -0.022, -0.107); }   // rail and a light
  dProf(g, dk, [[0.030, -0.016], [0.034, -0.044], [-0.012, -0.050], [-0.022, -0.034]], 0.005, 0.001);                     // trigger guard
  dBox(g, st, 0.004, 0.018, 0.005, 0, -0.026, -0.006, 0.25);                                        // trigger
  dProf(g, st, [[L - 0.022, 0.040], [L - 0.012, 0.040], [L - 0.014, 0.050], [L - 0.020, 0.050]], 0.004, 0.0008);          // front sight
  dBox(g, st, 0.020, 0.010, 0.010, 0, 0.045, 0.078); dBox(g, po, 0.006, 0.010, 0.012, 0, 0.0452, 0.078);                  // rear sight, notched
  for (let i = 0; i < 5; i++) dBox(g, M_POLY2(), 0.029, 0.004, 0.030, 0, -0.058 - i * 0.012, 0.062 + i * 0.0035, 0.20);   // grip texture
  const mag = dProf(g, dk, [[-0.058, -0.124], [-0.094, -0.118], [-0.100, -0.140], [-0.056, -0.146]], 0.024, 0.003);       // the floor plate you see
  return { g, grip: [0, -0.072, 0.066], fore: [-0.020, -0.088, 0.058], mag, magAt: [0, -0.150, 0.078], small: true };
}

/* ---- the hand and arm ----
   Origin AT THE PALM, so moving the group moves the hand and the arm
   follows. Four fingers curled round whatever is held (each two short
   segments, bent), a thumb, a padded back of the hand with knuckle
   guards, a wrist strap, then a sleeve with a forearm guard running back
   toward the elbow. `curl` closes the fingers: 1 is a fist round a grip,
   less is a hand cupped under a fore-end. `side` mirrors the thumb. */
function drawArm(elbow, side, curl){
  const g = new THREE.Group(), e = new THREE.Vector3().fromArray(elbow).normalize(), gv = M_GLOVE(), c = curl == null ? 1 : curl;
  dBox(g, gv, 0.074, 0.030, 0.084, 0, 0, 0);                                             // palm
  dBox(g, M_PAD(), 0.066, 0.012, 0.060, 0, 0.020, 0.004);                                // padded back of the hand
  for (let i = 0; i < 4; i++) dBox(g, M_RED(), 0.013, 0.008, 0.016, -0.027 + i * 0.018, 0.027, -0.030);   // knuckle guards
  for (let i = 0; i < 4; i++){                                                           // fingers, curling down and back under the palm
    const f = new THREE.Group(); f.position.set(-0.027 + i * 0.018, -0.004, -0.042); f.rotation.x = -0.9 * c - 0.2; g.add(f);
    dBox(f, gv, 0.0155, 0.016, 0.040, 0, 0, -0.018);
    const t = new THREE.Group(); t.position.set(0, 0, -0.038); t.rotation.x = -1.25 * c - 0.15; f.add(t);
    dBox(t, gv, 0.0145, 0.015, 0.034, 0, 0, -0.015);
  }
  const th = new THREE.Group(); th.position.set(side * 0.040, 0, -0.006); th.rotation.set(-0.35, side * 0.55, side * -0.5); g.add(th);
  dBox(th, gv, 0.018, 0.018, 0.046, 0, 0, -0.020);                                        // thumb
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e);
  const seg = (m, r0, r1, len, at) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 14), m); o.quaternion.copy(q); o.position.copy(e).multiplyScalar(at); return dAdd(g, o); };
  seg(gv, 0.033, 0.036, 0.05, 0.062);                                                     // wrist
  seg(M_RED(), 0.0365, 0.0375, 0.012, 0.092);                                             // strap
  seg(M_SLEEVE(), 0.036, 0.052, 0.44, 0.31);                                              // sleeve, widening to the elbow
  seg(M_PAD(), 0.041, 0.051, 0.20, 0.25).scale.set(1.03, 1, 1.03);                        // forearm guard
  return g;
}

/* Put a drawn gun, and two arms, in a weapon slot. The arm is built
   reaching along its own -Z with the palm down; `rot` turns the hand to
   suit what it holds without moving where the elbow is, because the elbow
   direction is given in the hand's own turned frame. */
const VM_RIGS = [];
function mountGun(slot, built){
  const holder = weaponHolders[slot];
  while (holder.children.length) holder.remove(holder.children[0]);
  const rig = new THREE.Group(); rig.position.set(0.02, -0.03, 0.05); rig.add(built.g); holder.add(rig);
  const right = drawArm([0.30, -0.34, 0.89], 1, 1); right.position.fromArray(built.grip); rig.add(right);
  const left = drawArm([-0.66, -0.30, 0.69], -1, built.small ? 1 : 0.5); left.position.fromArray(built.fore); rig.add(left);
  VM_RIGS[slot] = { left, right, mag: built.mag, shell: !!built.shell, grip: new THREE.Vector3().fromArray(built.grip),
    fore: new THREE.Vector3().fromArray(built.fore), magAt: new THREE.Vector3().fromArray(built.magAt),
    magHome: built.mag ? built.mag.position.clone() : null };
  WEAPONS[slot].aimTop = centrelineTop(built.g.parent, 0.03);
}
const BUILT_GUNS = [drawRifle(), drawSniper(), drawShotgun(), drawPistol(false), drawPistol(true)];
BUILT_GUNS.forEach((b, i) => mountGun(i, b));
/* The rifle's half-frame scope goes on AFTER mountGun has measured aimTop,
   so aiming lines up exactly as it did without it. Moving the aim to the
   scope's axis would sit the rifle ~22mm lower while aiming; Jack has not
   said yes to that yet. */
BUILT_GUNS[0].g.add(drawRifleScope());
/* The abilities and the blade keep their own drawn shapes (weapons.js);
   they just get a hand to be held in. */
for (let i = 5; i < weaponHolders.length; i++){
  const right = drawArm([0.30, -0.34, 0.89], 1, 1); right.position.set(0.03, -0.11, 0.14); weaponHolders[i].add(right);
}

/* The reload, as the left hand sees it: off the fore-end, down to the
   magazine, out with it, back up with a fresh one, home. The timing is a
   share of whatever the reload actually takes, so a faster reload (Blast's
   zone) is the same motion done quicker. A pump gun feeds shells one at a
   time, so its hand makes the trip three times instead. The right hand
   lifts a hair with it, as a wrist does while the other hand is working.
   Called each frame. */
const _armA = new THREE.Vector3(), _armB = new THREE.Vector3();
function armsFrame(){
  const r = VM_RIGS[currentWeapon]; if (!r) return;
  let p = -1;
  if (reloading) p = Math.min(1, (performance.now() - reloadStart) / reloadMsNow(curW()));
  if (p < 0 || p >= 1){ r.left.position.copy(r.fore); r.right.position.copy(r.grip);
    if (r.mag){ r.mag.position.copy(r.magHome); r.mag.visible = !r.shell; } return; }
  const ease = (t) => t * t * (3 - 2 * t), seg = (a, b) => ease(Math.max(0, Math.min(1, (p - a) / (b - a))));
  const down = _armB.copy(r.magAt); down.y -= 0.16; down.z += 0.03;
  r.right.position.copy(r.grip); r.right.position.y += Math.sin(p * Math.PI) * 0.006;
  if (r.shell){                                           // three shells, each: reach down, come up, push in
    const q = (p * 3) % 1, k = q < 0.5 ? ease(q * 2) : ease(2 - q * 2);
    r.left.position.copy(r.fore).lerp(down, k);
    r.mag.visible = q < 0.5; r.mag.position.copy(r.left.position); r.mag.position.y += 0.03;
    return;
  }
  const a = seg(0.00, 0.18), b = seg(0.18, 0.38), c = seg(0.62, 0.82), d = seg(0.82, 1.00);
  _armA.copy(r.fore).lerp(r.magAt, a).lerp(down, b).lerp(r.magAt, c).lerp(r.fore, d);
  r.left.position.copy(_armA);
  /* The magazine goes where the hand takes it between gripping it and
     seating the new one, and is out of sight at the bottom of the trip. */
  if (r.mag){
    const held = p > 0.18 && p < 0.82;
    r.mag.position.copy(r.magHome); if (held) r.mag.position.y += (_armA.y - r.magAt.y);
    r.mag.visible = !(p > 0.40 && p < 0.60);
  }
}

/* ---- the operator ----
   The body everyone plays: plates over a dark suit, a helmet with a lit
   visor in the player's colour, a rifle held across the chest in both
   hands. Faces +Z.
   Limbs are CAPSULES (a cylinder with a ball at each end), so a joint is
   round from every side instead of a box corner. The helmet is turned on a
   lathe from a profile. Legs are groups pivoted at the hip, which is all
   the loop needs to make it walk. The ARMS are deliberately not handed to
   the loop: it swings whatever it is given, and arms holding a rifle do
   not swing. */
const OP_MATS = {};
function opMat(key, color, metalness, roughness, extra){
  if (OP_MATS[key]) return OP_MATS[key];
  const m = rimPatch(new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra || {})));
  m.userData.envK = 0.9;
  return (OP_MATS[key] = lookTag(m, { metalness, roughness }, { metalness: 0, roughness }));
}
const OP_GEO = {};
const opGeo = (key, make) => OP_GEO[key] || (OP_GEO[key] = make());
function makeOperator(accent){
  const g = new THREE.Group();
  const suit = opMat('suit', 0x16181c, 0.0, 0.86), plate = opMat('plate', 0x3d444d, 0.50, 0.42), dark = opMat('pdark', 0x22262b, 0.45, 0.48);
  const acc = opMat('acc' + accent, accent, 0.25, 0.42), vis = opMat('vis' + accent, 0x06080a, 0.8, 0.10, { emissive: new THREE.Color(accent), emissiveIntensity: 1.1, side: THREE.DoubleSide });
  const P = (parent, m, geo, x, y, z, rx, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; parent.add(o); return o; };
  const B = (w, h, d) => opGeo('b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d));
  const C = (r0, r1, h) => opGeo('c' + r0 + '_' + r1 + '_' + h, () => new THREE.CylinderGeometry(r0, r1, h, 14));
  const S = (r) => opGeo('s' + r, () => new THREE.SphereGeometry(r, 14, 10));
  /* A limb segment hanging from (x, y, z): top radius, bottom radius, length. */
  const cap = (parent, m, rt, rb, len, x, y, z, rx, rz) => { const s = new THREE.Group(); s.position.set(x, y, z); if (rx) s.rotation.x = rx; if (rz) s.rotation.z = rz; parent.add(s);
    P(s, m, C(rt, rb, len), 0, -len / 2, 0); P(s, m, S(rt), 0, 0, 0); P(s, m, S(rb), 0, -len, 0); return s; };

  // ---- trunk
  P(g, suit, C(0.150, 0.135, 0.20), 0, 0.93, 0).scale.set(1.12, 1, 0.82);                 // pelvis
  P(g, dark, C(0.168, 0.168, 0.07), 0, 1.01, 0).scale.set(1.10, 1, 0.84);                 // belt
  for (const sx of [-1, 1]){ P(g, dark, B(0.07, 0.11, 0.05), sx * 0.155, 0.95, 0.07); P(g, dark, B(0.06, 0.09, 0.05), sx * 0.09, 0.955, 0.125); }   // pouches
  P(g, suit, C(0.175, 0.150, 0.26), 0, 1.16, 0).scale.set(1.08, 1, 0.80);                 // abdomen
  P(g, suit, C(0.215, 0.180, 0.28), 0, 1.40, 0).scale.set(1.10, 1, 0.78);                 // ribcage
  // a plate carrier: front and back plates, shoulder straps, magazine pouches
  P(g, plate, B(0.30, 0.30, 0.045), 0, 1.385, 0.150).rotation.x = -0.06;
  P(g, plate, B(0.30, 0.32, 0.045), 0, 1.385, -0.150).rotation.x = 0.05;
  for (const sx of [-1, 1]) P(g, dark, B(0.07, 0.05, 0.30), sx * 0.12, 1.545, 0);
  for (let i = -1; i <= 1; i++) P(g, dark, B(0.075, 0.11, 0.04), i * 0.088, 1.27, 0.178);
  P(g, acc, B(0.11, 0.024, 0.008), -0.085, 1.485, 0.176);                                 // the player's colour, on the chest
  P(g, dark, B(0.26, 0.30, 0.10), 0, 1.36, -0.215); P(g, plate, C(0.045, 0.045, 0.24), 0.085, 1.40, -0.275);   // pack and canister
  P(g, suit, C(0.058, 0.066, 0.10), 0, 1.60, 0.005);                                      // neck
  // ---- head: fitted to the head hitbox, a sphere of 0.19 at 1.70
  const shell = opGeo('helm', () => new THREE.LatheGeometry([[0.001, 0.165], [0.070, 0.158], [0.118, 0.128], [0.146, 0.080], [0.154, 0.020], [0.150, -0.040], [0.138, -0.085], [0.120, -0.100]]
    .map(p => new THREE.Vector2(p[0], p[1])), 22));
  P(g, plate, shell, 0, 1.715, 0).scale.set(1, 1, 1.10);
  P(g, suit, S(0.118), 0, 1.69, 0.012);                                                   // the face, in shadow
  /* The visor and jaw are open arcs wrapped round the FRONT of the shell.
     A cylinder's arc starts on its +Z side, so an arc from -0.95 to +0.95
     radians is centred on the face. */
  P(g, vis, opGeo('visor', () => new THREE.CylinderGeometry(0.158, 0.156, 0.074, 22, 1, true, -0.95, 1.9)), 0, 1.722, 0).scale.set(1, 1, 1.10);
  P(g, dark, opGeo('jaw', () => new THREE.CylinderGeometry(0.157, 0.132, 0.080, 22, 1, true, -1.05, 2.1)), 0, 1.645, 0).scale.set(1, 1, 1.10);
  dark.side = THREE.DoubleSide;
  for (const sx of [-1, 1]){ P(g, dark, C(0.046, 0.046, 0.034), sx * 0.158, 1.705, 0, 0, Math.PI / 2); P(g, acc, C(0.018, 0.018, 0.038), sx * 0.160, 1.705, 0, 0, Math.PI / 2); }   // comms
  P(g, dark, B(0.030, 0.020, 0.26), 0, 1.878, -0.010);                                    // crest rail
  P(g, dark, B(0.010, 0.11, 0.010), 0.13, 1.90, -0.07);                                   // antenna

  // ---- legs: pivoted at the hip
  const leg = (sx) => { const p = new THREE.Group(); p.position.set(sx * 0.098, 0.88, 0); g.add(p);
    cap(p, suit, 0.088, 0.066, 0.40, 0, 0, 0);                                            // thigh
    P(p, plate, B(0.12, 0.22, 0.045), sx * 0.012, -0.19, 0.070).rotation.x = -0.05;       // thigh plate
    P(p, dark, B(0.07, 0.13, 0.05), sx * 0.085, -0.16, 0);                                // holster / pouch
    P(p, plate, S(0.062), 0, -0.415, 0.030).scale.set(1.05, 1.1, 0.9);                    // knee cap
    cap(p, suit, 0.066, 0.050, 0.34, 0, -0.42, 0);                                        // shin
    P(p, plate, B(0.10, 0.25, 0.045), 0, -0.59, 0.045);                                   // greave
    P(p, dark, B(0.105, 0.085, 0.24), 0, -0.835, 0.040); P(p, dark, B(0.100, 0.050, 0.10), 0, -0.790, -0.040);   // boot and heel
    P(p, dark, B(0.108, 0.030, 0.26), 0, -0.865, 0.045);                                  // sole
    return p; };
  const ll = leg(-1), rl = leg(1);

  // ---- arms: posed on a rifle held across the chest, muzzle low and to the body's left
  for (const sx of [-1, 1]){ P(g, plate, S(0.090), sx * 0.262, 1.515, 0).scale.set(1.08, 0.86, 1.12); P(g, acc, B(0.010, 0.05, 0.11), sx * 0.356, 1.50, 0); }   // pauldrons
  cap(g, suit, 0.058, 0.048, 0.27, 0.262, 1.49, 0, 0.25, 0.10);                           // right upper arm, down and a little back
  const rf = cap(g, plate, 0.050, 0.040, 0.25, 0.235, 1.235, -0.065, -1.20, -0.42); P(rf, dark, B(0.07, 0.08, 0.08), 0, -0.285, 0);   // forearm forward to the grip
  cap(g, suit, 0.058, 0.048, 0.27, -0.262, 1.49, 0, -0.55, -0.12);                        // left upper arm, reaching forward
  const lf = cap(g, plate, 0.050, 0.040, 0.25, -0.232, 1.262, 0.142, -1.30, 0.62); P(lf, dark, B(0.07, 0.08, 0.08), 0, -0.285, 0);    // and across to the fore-end
  const rifle = new THREE.Group(); rifle.position.set(0.045, 1.185, 0.215); rifle.rotation.set(0.10, 1.12, 0.10); g.add(rifle);
  P(rifle, M_DARK(), B(0.045, 0.070, 0.30), 0, 0, 0); P(rifle, M_POLY2(), B(0.042, 0.050, 0.22), 0, 0.004, 0.25);
  P(rifle, M_STEEL(), C(0.010, 0.010, 0.17), 0, 0.010, 0.44, Math.PI / 2); P(rifle, M_DARK(), C(0.016, 0.016, 0.05), 0, 0.010, 0.54, Math.PI / 2);
  P(rifle, M_POLY(), B(0.038, 0.085, 0.17), 0, -0.012, -0.24); P(rifle, M_DARK(), B(0.024, 0.13, 0.055), 0, -0.095, 0.045, 0.16);
  P(rifle, M_POLY(), B(0.032, 0.09, 0.04), 0, -0.075, -0.07, -0.3); P(rifle, M_DARK(), B(0.020, 0.012, 0.36), 0, 0.042, 0.10);

  /* Only the big pieces cast a shadow. Seventy small parts each drawn a
     second time into the shadow map, for every body, is most of a frame;
     the trunk and the limbs make the same shadow on the floor. */
  g.traverse(o => { if (o.isMesh){ const p = o.geometry.parameters || {}; o.castShadow = (p.height || 0) >= 0.24 || (p.radius || 0) >= 0.085; } });
  const still = new THREE.Group();                 // what the loop swings in place of the arms
  g.userData = { la: still, ra: still, ll, rl, walk: 0 };
  return g;
}
/* What the rest of the game calls for a body. Players take the brand
   crimson unless they are given a colour; practice targets are amber, so a
   target is never mistaken for a person. */
newPlayerMesh = function(color){ return makeOperator(typeof color === 'number' ? color : BRAND); };
newBotMesh = function(){ return makeOperator(0xd08a1e); };
/* And the one on the podium at the menu. */
(function(){ scene.remove(hero); hero = makeOperator(BRAND); hero.position.set(0, 0.12, 32); scene.add(hero);
  heroGroup[0] = hero; spot.target = hero; scene.add(spot.target); })();
