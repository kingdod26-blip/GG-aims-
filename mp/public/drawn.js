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
/* THE GUNS' FINISHES ARE THE PAC-9'S (2026-11-21). Jack: "improve on the
   model for other guns and refer to the rifle". Flat colours were most of
   why the drawn guns looked like toys next to it. Each finish is now a
   real one, with the PAC-9's own detail shader (pac9Detail, below: kind 0
   anodised scuffs, 1 turned steel, 2 polymer stipple), and the colours are
   LINEAR and dark the way the PAC-9's are - a black gun is black, and what
   makes it read is the sky sliding over it, not a grey base colour. */
function dmatL(key, rgb, metalness, roughness, kind, envK){
  if (DRAWN_MATS[key]) return DRAWN_MATS[key];
  const m = new THREE.MeshStandardMaterial({ metalness, roughness });
  m.color.setRGB(rgb[0], rgb[1], rgb[2]); m.userData.envK = envK == null ? 1.0 : envK;
  if (kind != null) pac9Detail(m, kind);
  return (DRAWN_MATS[key] = lookTag(m, { metalness, roughness }, { metalness: 0, roughness }));
}
const M_STEEL  = () => dmatL('steel', [0.085, 0.085, 0.088], 0.72, 0.46, 1);     // phosphated steel: barrels, pins, sights
const M_DARK   = () => dmatL('dark',  [0.030, 0.031, 0.034], 0.45, 0.40, 0);     // black anodised receivers
const M_POLY   = () => dmatL('poly',  [0.020, 0.021, 0.023], 0.00, 0.62, 2, 0.8);  // furniture
const M_POLY2  = () => dmatL('poly2', [0.036, 0.038, 0.041], 0.00, 0.58, 2, 0.8);  // a lighter grey polymer
const M_TAN    = () => dmatL('tan',   [0.105, 0.080, 0.050], 0.00, 0.62, 2, 0.8);  // the PAC-9 magazine's tan
const M_WOOD   = () => dmatL('wood',  [0.150, 0.075, 0.034], 0.00, 0.52, 2, 0.6);  // oiled walnut
const M_BRASS  = () => dmatL('brass', [0.539, 0.323, 0.0595], 1.00, 0.32, 1);
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
/* ---- detail parts, the PAC-9's vocabulary (2026-11-21) ----
   What makes the PAC-9 read as a real gun is not its outline, it is the
   small things on it: a rail with its slots, screws in the rings, knurled
   rings on the knobs, markings stencilled on the side. These put the same
   things on the drawn guns. */
/* A Picatinny rail along Z: a base strip and a crossbar every 10mm. */
function dRail(g, m, y, z0, z1, w){
  w = w || 0.021;
  dBox(g, m, w, 0.004, z1 - z0, 0, y + 0.002, (z0 + z1) / 2);
  for (let z = z0 + 0.004; z < z1 - 0.002; z += 0.01) dBox(g, m, w, 0.0032, 0.0052, 0, y + 0.0055, z);
}
/* A screw head on a side face (axis X), or on a top face (axis Y). */
function dScrew(g, x, y, z, axis, r){
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r || 0.0022, r || 0.0022, 0.0012, 8), M_STEEL());
  if (axis !== 'y') o.rotation.z = Math.PI / 2;
  o.position.set(x, y, z); return dAdd(g, o);
}
/* Knurling: a run of thin rings round a tube lying along Z. */
function dKnurl(g, m, r, y, z0, z1, x){
  for (let z = z0; z <= z1 + 1e-6; z += 0.0032) dTube(g, m, r, 0.0016, x || 0, y, z, r, 14);
}
/* An upright cylinder (a turret, a knob), with knurled bands. */
function dKnob(g, m, r, h, x, y, z, axis){
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  if (axis === 'x') grp.rotation.z = Math.PI / 2;
  const add = (rr, hh, yy) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, hh, 18), m); o.position.y = yy; grp.add(o); o.frustumCulled = false; };
  add(r, h, 0);
  for (let k = 0; k < 4; k++) add(r * 1.06, h * 0.08, -h * 0.3 + k * h * 0.2);
  add(r * 0.7, h * 0.12, h * 0.56);
  return dAdd(g, grp);
}
/* Stencilled markings: white text on a transparent plane, laid on a side
   face. side -1 is the gun's left, which is the side you see. */
const DECAL_TEX = {};
function dDecal(g, text, x, y, z, w, h, side){
  const key = text + '|' + w.toFixed(3) + '|' + h.toFixed(3);
  let t = DECAL_TEX[key];
  if (!t){
    const W = 512, H = Math.max(32, Math.round(W * h / w)), c = document.createElement('canvas'); c.width = W; c.height = H;
    const x2 = c.getContext('2d'); x2.clearRect(0, 0, W, H);
    x2.fillStyle = 'rgba(218,214,204,0.92)'; x2.textBaseline = 'middle';
    let fs = H * 0.78; x2.font = '600 ' + fs + 'px "IBM Plex Mono", Consolas, monospace';
    while (x2.measureText(text).width > W * 0.96 && fs > 6){ fs -= 1; x2.font = '600 ' + fs + 'px "IBM Plex Mono", Consolas, monospace'; }
    x2.fillText(text, 2, H / 2);
    t = DECAL_TEX[key] = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  }
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  lookTag(m, { metalness: 0, roughness: 0.7 }, { metalness: 0, roughness: 0.7 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2; o.position.set(x, y, z);
  return dAdd(g, o);
}
const M_WHITE = () => dmat('white', 0xd8d8cc, 0.0, 0.4, { emissive: new THREE.Color(0x30302a) });   // sight dots
const M_HULL  = () => dmat('hull', 0x7a1418, 0.0, 0.5);                                                 // shotgun shell hulls

function drawSniper(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), tn = M_TAN(), gl = M_GLASS();
  // one-piece chassis: fore-end, action bed, thumbhole grip and stock in a single outline
  dProf(g, tn, [[0.34, -0.030], [0.34, 0.006], [0.08, 0.010], [-0.10, 0.010], [-0.16, 0.034], [-0.44, 0.030], [-0.455, -0.090], [-0.42, -0.094],
               [-0.36, -0.040], [-0.24, -0.030], [-0.215, -0.120], [-0.170, -0.124], [-0.150, -0.050], [-0.06, -0.044], [0.02, -0.050]], 0.046, 0.007);
  // the fore-end's M-LOK slots, both sides, and a bipod stud under its nose
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) dBox(g, po, 0.002, 0.008, 0.024, sx * 0.0232, -0.012, -0.07 - i * 0.042);
  dBox(g, dk, 0.016, 0.010, 0.030, 0, -0.033, -0.31);
  dProf(g, dk, [[-0.12, 0.010], [0.12, 0.010], [0.12, 0.046], [-0.12, 0.046]], 0.036, 0.006);       // action
  dBox(g, st, 0.004, 0.016, 0.070, 0.0182, 0.032, -0.01);                                           // ejection port
  dBox(g, st, 0.010, 0.010, 0.060, 0.012, 0.032, -0.01);                                            // the bolt body seen in it
  dRail(g, dk, 0.046, -0.125, 0.125);                                                               // the scope base
  dTube(g, dk, 0.0135, 0.05, 0, 0.030, 0.145);                                                      // bolt shroud
  dTube(g, st, 0.0125, 0.50, 0, 0.030, -0.37, 0.0105);                                              // tapered heavy barrel
  for (let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2;                                       // flutes cut along it
    dBox(g, dk, 0.0035, 0.0035, 0.20, Math.cos(a) * 0.0108, 0.030 + Math.sin(a) * 0.0108, -0.27); }
  dTube(g, dk, 0.020, 0.085, 0, 0.030, -0.655);                                                     // brake
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) dBox(g, po, 0.003, 0.012, 0.010, sx * 0.0195, 0.030, -0.63 - i * 0.022);   // its ports
  dTube(g, st, 0.0065, 0.003, 0, 0.030, -0.698);                                                    // the crown
  // scope: tube, bells, lenses, turrets
  dTube(g, dk, 0.0155, 0.30, 0, 0.094, -0.01);
  dTube(g, dk, 0.027, 0.085, 0, 0.094, -0.185, 0.0155); dTube(g, dk, 0.027, 0.03, 0, 0.094, -0.24);
  dKnurl(g, dk, 0.0282, 0.094, -0.250, -0.232);                                                     // the objective's grip ring
  dTube(g, dk, 0.0215, 0.075, 0, 0.094, 0.165, 0.0155);
  dKnurl(g, dk, 0.0228, 0.094, 0.150, 0.178);                                                       // the eyepiece's focus ring
  dTube(g, gl, 0.0245, 0.003, 0, 0.094, -0.2555); dTube(g, gl, 0.019, 0.003, 0, 0.094, 0.2035);
  /* (the open flip cap that stood up off the objective is gone - Jack,
     2026-11-22: "for the little cap for the sniper remove it") */
  dKnob(g, dk, 0.012, 0.024, 0, 0.122, -0.01);                                                      // elevation turret
  dKnob(g, dk, 0.012, 0.024, 0.028, 0.094, -0.01, 'x');                                             // windage
  dKnob(g, dk, 0.010, 0.018, -0.025, 0.094, -0.01, 'x');                                            // parallax, on the left
  dTube(g, dk, 0.019, 0.026, 0, 0.094, -0.01);                                                      // the saddle the turrets sit on
  for (const z of [-0.09, 0.07]){                                                                   // rings: a clamp on the rail, a cap over the tube
    dBox(g, st, 0.026, 0.020, 0.020, 0, 0.060, z); dBox(g, st, 0.018, 0.020, 0.020, 0, 0.074, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0172, 0.0032, 8, 24), st); ring.position.set(0, 0.094, z); dAdd(g, ring);
    for (const sx of [-1, 1]) { dScrew(g, sx * 0.0215, 0.094, z - 0.006); dScrew(g, sx * 0.0215, 0.094, z + 0.006); }
    dScrew(g, 0.0132, 0.058, z, 'x', 0.003);
  }
  dDecal(g, 'CX 5-25x56  FFP', -0.0157, 0.094, -0.07, 0.11, 0.0085, -1);
  { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.055, 10), st); h.rotation.z = Math.PI / 2 - 0.5; h.position.set(0.040, 0.020, 0.085); dAdd(g, h);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), st); k.position.set(0.064, 0.006, 0.085); dAdd(g, k); }   // bolt handle and knob
  dProf(g, po, [[-0.17, 0.034], [-0.33, 0.034], [-0.33, 0.058], [-0.18, 0.054]], 0.036, 0.005);     // cheek riser
  dKnob(g, dk, 0.006, 0.010, 0.022, 0.046, 0.25, 'x');                                              // and the knob that sets it
  dBox(g, po, 0.044, 0.118, 0.016, 0, -0.030, 0.455);                                               // butt pad
  for (let i = 0; i < 6; i++) dBox(g, dk, 0.045, 0.003, 0.017, 0, -0.080 + i * 0.019, 0.456);        // its ribs
  for (const z of [-0.28, 0.33]) dScrew(g, -0.0235, -0.020, z, 'x', 0.0055);                       // sling cups
  // trigger, guard, the magazine release
  dProf(g, dk, [[-0.062, -0.046], [-0.148, -0.052], [-0.146, -0.076], [-0.074, -0.078], [-0.058, -0.064]], 0.006, 0.001);
  dBox(g, st, 0.005, 0.022, 0.006, 0, -0.058, 0.110, 0.3);
  dBox(g, st, 0.010, 0.006, 0.014, 0, -0.050, 0.050);
  dDecal(g, 'CX-L44  .338 LM', -0.0236, -0.018, 0.02, 0.10, 0.009, -1);
  for (const sx of [-1, 1]) dBox(g, dk, 0.007, 0.13, 0.009, sx * 0.022, -0.075, -0.27, 1.25, 0);    // bipod legs, folded forward
  dBox(g, dk, 0.040, 0.012, 0.022, 0, -0.040, -0.31);                                               // and its head
  const mag = dProf(g, dk, [[0.05, -0.044], [-0.03, -0.044], [-0.035, -0.105], [0.045, -0.105]], 0.026, 0.004);
  return { g, grip: [0, -0.085, 0.19], fore: [0, -0.045, -0.20], mag, magAt: [0, -0.13, -0.008],
    /* Held like the PAC-9 (see its `vm`), set back by how much further
       behind the grip this gun's stock runs. */
    vm: { x: 0.098, y: -0.122, z: -0.44, adsZ: 0.10, rx: 0.034, ry: 0.085, rz: -0.03, viewFov: 54, motion: 0.6 } };
}
function drawShotgun(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), wd = M_WOOD(), po = M_POLY();
  dProf(g, dk, [[-0.10, -0.034], [0.13, -0.030], [0.13, 0.034], [-0.06, 0.034], [-0.10, 0.020]], 0.044, 0.006);   // receiver
  dBox(g, st, 0.004, 0.022, 0.085, 0.0235, 0.004, -0.02);                                           // ejection port
  dBox(g, st, 0.006, 0.014, 0.060, 0.0215, 0.006, -0.02);                                           // the bolt face in it
  dBox(g, po, 0.030, 0.004, 0.070, 0, -0.0345, 0.0);                                                // loading port, underneath
  dRail(g, dk, 0.034, -0.10, 0.075, 0.018);                                                         // receiver rail
  dScrew(g, 0.0222, -0.012, -0.08, 'x', 0.003); dScrew(g, 0.0222, -0.012, 0.06, 'x', 0.003);        // the trigger-group pins
  dScrew(g, -0.0222, -0.012, -0.08, 'x', 0.003); dScrew(g, -0.0222, -0.012, 0.06, 'x', 0.003);
  dTube(g, st, 0.0125, 0.50, 0, 0.018, -0.37);                                                      // barrel
  /* A ventilated heat shield over the top of the barrel: a half tube with
     rows of holes, the thing that says "tactical pump" at a glance. */
  { const hsm = dmatL('darkds', [0.030, 0.031, 0.034], 0.45, 0.40, 0); hsm.side = THREE.DoubleSide;
    /* the +z half of a cylinder, turned to lie along the barrel on top */
    const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.28, 18, 1, true, -Math.PI / 2, Math.PI), hsm);
    hs.rotation.x = -Math.PI / 2; hs.position.set(0, 0.018, -0.30); dAdd(g, hs);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++){ const a = -0.9 + r * 0.9;
      dBox(g, po, 0.005, 0.0012, 0.014, Math.sin(a) * 0.0168, 0.018 + Math.cos(a) * 0.0168, -0.185 - i * 0.029, 0, -a); } }
  dTube(g, st, 0.0118, 0.40, 0, -0.014, -0.32);                                                     // tube magazine
  dTube(g, dk, 0.014, 0.02, 0, -0.014, -0.525);                                                     // its cap...
  { const loop = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 14), st); loop.position.set(0, -0.030, -0.528); dAdd(g, loop); }   // ...with a sling loop
  dBox(g, st, 0.012, 0.046, 0.014, 0, 0.002, -0.50);                                                // barrel clamp
  dScrew(g, 0.0062, 0.002, -0.50, 'x', 0.0025);
  /* Sights: just the bead at the muzzle, as it always had. A ghost ring
     and a protected post were tried (2026-11-21) and Jack had them taken
     off the next day: "make the aim flat like before" - you look straight
     down the receiver to the bead, with the red dot just over it. */
  /* Side saddle: six spare shells on the left of the receiver, red hulls
     and brass heads, standing up. */
  dBox(g, dk, 0.004, 0.040, 0.082, -0.0245, -0.002, -0.015);
  for (let i = 0; i < 6; i++){
    const z = -0.050 + i * 0.0138, sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.050, 12), M_HULL());
    sh.position.set(-0.0330, 0.002, z); dAdd(g, sh);
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.010, 12), M_BRASS()); hd.position.set(-0.0330, -0.026, z); dAdd(g, hd);
  }
  dProf(g, wd, [[0.16, -0.040], [0.33, -0.036], [0.33, 0.004], [0.16, 0.004]], 0.048, 0.008);       // the pump...
  for (let i = 0; i < 6; i++) dBox(g, wd, 0.051, 0.030, 0.007, 0, -0.018, -0.175 - i * 0.026);      // ...and its ribs
  dBox(g, st, 0.006, 0.006, 0.150, 0.010, -0.006, -0.12);                                           // the action bar under it
  // stock and grip as one piece of wood
  dProf(g, wd, [[-0.09, 0.022], [-0.40, -0.002], [-0.415, -0.105], [-0.385, -0.110], [-0.23, -0.058], [-0.175, -0.112], [-0.135, -0.108], [-0.10, -0.034]], 0.038, 0.008);
  dBox(g, po, 0.040, 0.110, 0.014, 0, -0.054, 0.415);                                               // recoil pad
  for (let i = 0; i < 6; i++) dBox(g, dk, 0.041, 0.003, 0.015, 0, -0.100 + i * 0.019, 0.416);       // its ribs
  dProf(g, dk, [[0.00, -0.034], [-0.085, -0.036], [-0.082, -0.064], [-0.02, -0.066], [0.004, -0.05]], 0.006, 0.001);   // trigger guard
  dBox(g, st, 0.005, 0.022, 0.006, 0, -0.046, 0.040, 0.3);                                          // trigger
  dScrew(g, 0.0222, -0.026, 0.010, 'x', 0.0042);                                                    // the cross-bolt safety's button
  dDecal(g, 'CX-12  12 GA  3"', 0.0225, 0.014, -0.02, 0.085, 0.008, 1);
  const mag = dTube(g, M_RED(), 0.0095, 0.058, 0, -0.050, -0.02);                                   // the shell in your hand on a reload
  mag.visible = false;
  return { g, grip: [0, -0.070, 0.150], fore: [0, -0.045, -0.245], mag, magAt: [0, -0.060, -0.02], shell: true,
    /* Aimed, it sits where the old shotgun did (0.43m out), so the flat
       down-the-rib picture is the one it always was: the bead's top on the
       eye line, the red dot sitting on it. Given outright, because the
       centreline probe misses a bead 6mm thick. */
    aimTop: 0.044,
    vm: { adsPlain: true, x: 0.098, y: -0.11, z: -0.40, adsZ: -0.03, rx: 0.034, ry: 0.085, rz: -0.03, viewFov: 54, motion: 0.6 } };
}
function drawPistol(heavy){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), p2 = M_POLY2();
  const L = heavy ? 0.125 : 0.110, sl = heavy ? st : dk;
  // slide: stepped down at the muzzle
  dProf(g, sl, [[-0.090, 0.006], [L, 0.006], [L, 0.030], [L - 0.012, 0.040], [-0.085, 0.040], [-0.090, 0.030]], 0.029, 0.004);
  for (let i = 0; i < 7; i++) dBox(g, po, 0.0305, 0.024, 0.0025, 0, 0.022, 0.048 + i * 0.006);     // rear serrations
  for (let i = 0; i < 5; i++) dBox(g, po, 0.0305, 0.016, 0.0022, 0, 0.022, -L + 0.026 + i * 0.006);   // front ones
  dBox(g, po, 0.004, 0.012, 0.040, 0.0152, 0.028, -0.02);                                           // ejection port
  dBox(g, st, 0.012, 0.006, 0.034, 0.004, 0.036, -0.020);                                           // the barrel hood showing through it
  dBox(g, st, 0.0016, 0.004, 0.022, 0.0152, 0.032, 0.010);                                          // extractor
  if (heavy) for (let i = 0; i < 3; i++) dBox(g, po, 0.012, 0.0016, 0.016, 0, 0.0403, -0.030 - i * 0.022);   // lightening cuts on top
  dTube(g, st, 0.0065, 0.012, 0, 0.022, -L - 0.004);                                                // barrel crown
  if (heavy){                                                                                       // a compensator, ported on top
    dProf(g, st, [[L, 0.006], [L + 0.030, 0.006], [L + 0.030, 0.034], [L, 0.036]], 0.029, 0.004);
    for (let i = 0; i < 3; i++) dBox(g, po, 0.012, 0.0016, 0.006, 0, 0.0345, -L - 0.006 - i * 0.008);
  }
  // frame, dust cover, beavertail and raked grip, in one outline
  dProf(g, po, [[L - 0.004, 0.004], [L - 0.004, -0.014], [0.030, -0.016], [0.018, -0.040], [-0.022, -0.034], [-0.052, -0.128], [-0.098, -0.120],
               [-0.082, -0.030], [-0.110, -0.004], [-0.098, 0.006]], 0.027, 0.005);
  for (let i = 0; i < 3; i++) dBox(g, p2, 0.0272, 0.0024, 0.006, 0, -0.0150, -0.050 - i * 0.012);  // rail slots under the dust cover
  if (heavy){ dBox(g, dk, 0.022, 0.014, 0.050, 0, -0.022, -0.080); dTube(g, M_GLASS(), 0.008, 0.004, 0, -0.022, -0.107); }   // rail and a light
  dProf(g, dk, [[0.030, -0.016], [0.034, -0.044], [-0.012, -0.050], [-0.022, -0.034]], 0.005, 0.001);                     // trigger guard
  dBox(g, st, 0.004, 0.018, 0.005, 0, -0.026, -0.006, 0.25);                                        // trigger
  dBox(g, dk, 0.003, 0.004, 0.040, -0.0148, 0.002, -0.004);                                         // slide stop, left side
  dBox(g, dk, 0.004, 0.006, 0.006, -0.0150, 0.006, 0.014);                                          // its paddle
  dBox(g, dk, 0.003, 0.004, 0.010, -0.0145, -0.004, -0.030);                                        // takedown lever
  dBox(g, dk, 0.004, 0.009, 0.009, -0.0145, -0.030, 0.026);                                         // magazine release
  dProf(g, st, [[L - 0.022, 0.040], [L - 0.012, 0.040], [L - 0.014, 0.050], [L - 0.020, 0.050]], 0.004, 0.0008);          // front sight
  dBox(g, M_WHITE(), 0.0022, 0.0022, 0.001, 0, 0.0462, -(L - 0.0215));                              // three-dot sights: the front
  dBox(g, st, 0.020, 0.010, 0.010, 0, 0.045, 0.078); dBox(g, po, 0.006, 0.010, 0.012, 0, 0.0452, 0.078);                  // rear sight, notched
  for (const sx of [-1, 1]) dBox(g, M_WHITE(), 0.0022, 0.0022, 0.001, sx * 0.0062, 0.0462, 0.0728);  // and the rear two
  // grip: stippled panels on both sides, a backstrap, a flared magwell
  for (const sx of [-1, 1]){
    dProf(g, p2, [[-0.030, -0.044], [-0.058, -0.112], [-0.088, -0.108], [-0.070, -0.040]], 0.002, 0.0004, sx * 0.0136, 0, 0);
  }
  dBox(g, p2, 0.022, 0.060, 0.006, 0, -0.072, 0.084, -0.38);                                        // backstrap
  dProf(g, dk, [[-0.050, -0.122], [-0.100, -0.116], [-0.102, -0.128], [-0.050, -0.134]], 0.030, 0.003);   // magwell flare
  dDecal(g, heavy ? 'CX-PX  10mm AUTO' : 'CX-P9  9x19', -0.0148, 0.022, -0.030, heavy ? 0.075 : 0.060, 0.0075, -1);
  const mag = dProf(g, dk, [[-0.058, -0.124], [-0.094, -0.118], [-0.100, -0.140], [-0.056, -0.146]], 0.024, 0.003);       // the floor plate you see
  return { g, grip: [0, -0.072, 0.066], fore: [-0.020, -0.088, 0.058], mag, magAt: [0, -0.150, 0.078], small: true,
    /* Held out toward arm's length with both hands in view, and through a
       gentler lens than the long guns (64, not 54): a pistol stretched as
       much as the PAC-9 filled the corner of the screen and pushed its own
       hands out of the frame. Aiming pushes it a little further out. */
    vm: { x: 0.07, y: -0.085, z: -0.38, adsZ: -0.06, rx: 0.02, ry: 0.05, rz: -0.02, viewFov: 64, motion: 0.6 } };
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
  WEAPONS[slot].aimTop = built.aimTop != null ? rig.position.y + built.aimTop : centrelineTop(built.g.parent, 0.03);
  /* Each drawn gun now carries a PAC-9-style pose and lens (2026-11-21). */
  if (built.vm) WEAPONS[slot].vm = built.vm;
}
[drawRifle(), drawSniper(), drawShotgun(), drawPistol(false), drawPistol(true)].forEach((b, i) => mountGun(i, b));
/* ---- THE PAC-9 (2026-11-21) ----
   Jack: "use that gun to replace the rifle". The rifle is now the PAC-9
   "Longshore" carbine from Saltline (Mini games/SALETINE), the browser FPS
   Claude Fable 5.2 built in one run for Felix Rieseberg (Anthropic). All
   credit for its design is that game's. Saltline builds it in code at
   start-up from about a thousand lines of hand-placed parts; what is here
   is that model's finished geometry, read out of the running game once and
   packed into assets/pac9.bin (~1MB, ~550KB gzipped): the receiver,
   handguard, holographic sight, a tan magazine with brass in it, the
   markings, and the two gloved hands posed on it.

   The file holds one mesh per finish. The finish is what makes it look
   real, so it is ported as it was: each is a dark base colour times a
   per-vertex tint (part colour plus a little noise), then a small shader
   that varies the roughness in object space - scuffs and smudges on the
   anodised aluminium, machining rings on the phosphated steel, stipple on
   the polymer - and bumps the normal by the same height, so a highlight
   breaks up as it slides along the gun the way it does on a real one.

   Until the file lands, slot 0 keeps the drawn rifle above, so the game
   never shows an empty hand. */
const PAC9 = { url: 'assets/pac9.bin', sightY: 0.069, muzzle: -0.531,
  /* Where the model sits in the rig: its bore on the gun's own axis and its
     muzzle at (0, 0, -0.55) in gun space, which is where the tracers leave
     from (muzzleWorld, effects.js) - so they still leave the barrel. */
  at: [0, 0.03, -0.069],
  /* Saltline draws its gun through a second camera at 54 degrees while the
     world uses 74, which is why the gun is large in the frame without the
     wide-angle stretch a gun close to an 80 degree lens gets. The same
     picture comes from one camera by scaling the gun's view-space x and y
     by tan(fov/2) / tan(viewFov/2) - see the viewmodel pose in loop.js. */
  vm: { x: 0.098, y: -0.122, z: -0.256, adsZ: 0.14, rx: 0.034, ry: 0.085, rz: -0.03, viewFov: 54, motion: 0.6 },
  /* The left hand's trip to the magazine, from where it holds the handguard
     to where it grips the magazine (Saltline's own two poses). */
  magTrip: [0.0015, -0.088, 0.1615] };

const PAC9_DETAIL_PARS = `
varying vec3 vObjP; varying vec3 vWNrm; varying vec3 vONrm; uniform float uKind;
float dh3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh3(i), dh3(i + vec3(1,0,0)), f.x), mix(dh3(i + vec3(0,1,0)), dh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh3(i + vec3(0,0,1)), dh3(i + vec3(1,0,1)), f.x), mix(dh3(i + vec3(0,1,1)), dh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 dBump(vec3 N, float h){ vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx); float det = dot(dpdx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - g); }
`;
const PAC9_DETAIL_ROUGH = `
vec3 dP = vObjP;
float dSm = dn3(dP * 36.0), dSm2 = dn3(dP * 150.0 + 7.0), dFine = dn3(dP * 2400.0);
float dHt = 0.0, dR = 0.0;
if (uKind < 0.5) {                       // anodised aluminium: scuffs and smudges
  float scuff = smoothstep(0.70, 0.9, dn3(dP * vec3(420.0, 420.0, 26.0) + 3.0));
  float smudge = smoothstep(0.55, 0.8, dn3(dP * 55.0 + 11.0));
  dR = (dSm - 0.5) * 0.20 + (dSm2 - 0.5) * 0.10 + (dFine - 0.5) * 0.08 + scuff * 0.18 - smudge * 0.12;
  dHt = dFine * 0.000010 - scuff * 0.000015;
} else if (uKind < 1.5) {                // phosphated steel: turned rings and streaks along the bore
  float ring = sin(dP.z * 5200.0) * 0.5 + 0.5, streak = dn3(vec3(dP.z * 950.0, 1.0, 2.0));
  dR = (streak - 0.5) * 0.26 + (dSm - 0.5) * 0.14 + (dFine - 0.5) * 0.10;
  dHt = ring * 0.000014 + dFine * 0.000010;
} else {                                 // polymer and fabric: stipple
  float st = dn3(dP * 1500.0) * 0.6 + dn3(dP * 3100.0 + 5.0) * 0.4;
  dR = (dSm - 0.5) * 0.18 + (st - 0.5) * 0.14 - smoothstep(0.6, 0.85, dSm2) * 0.10;
  dHt = st * 0.000075;
}
roughnessFactor = clamp(roughnessFactor + dR, 0.10, 1.0);
`;
function pac9Detail(m, kind){
  m.extensions = { derivatives: true };            // dFdx under WebGL1; WebGL2 has it anyway
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKind = { value: kind };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vWNrm; varying vec3 vONrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position; vONrm = normal; vWNrm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PAC9_DETAIL_PARS)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + PAC9_DETAIL_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = dBump(normal, dHt);');
  };
  m.customProgramCacheKey = () => 'pac9-detail-' + kind;
  return m;
}
/* Colours are LINEAR, as Saltline gives them: three r128 takes a number
   straight as linear, so these go in with setRGB, not as hex. */
function pac9Mats(){
  const std = (name, rgb, roughness, metalness, kind, envK) => {
    const m = new THREE.MeshStandardMaterial({ roughness, metalness, vertexColors: true });
    m.color.setRGB(rgb[0], rgb[1], rgb[2]); m.name = name; m.userData.envK = envK;
    if (kind != null) pac9Detail(m, kind);
    return lookTag(m, { metalness, roughness }, { metalness: 0, roughness });
  };
  return {
    pac9_anodised:    std('pac9_anodised',    [0.0085, 0.009, 0.0105], 0.40, 0.45, 0, 1.0),
    pac9_phosphate:   std('pac9_phosphate',   [0.016, 0.016, 0.0165],  0.50, 0.70, 1, 1.0),
    pac9_polymer:     std('pac9_polymer',     [0.0125, 0.0128, 0.0135], 0.62, 0, 2, 0.8),
    pac9_polymer_tan: std('pac9_polymer_tan', [0.105, 0.08, 0.05],     0.62, 0, 2, 0.8),
    pac9_matte:       std('pac9_matte',       [1, 1, 1],               0.92, 0, null, 0.6),
    /* These two were textured on the GPU in Saltline and cannot be read
       back, so they are plain: woven fabric is rough and dark, brass is
       brass. The glove's own vertex tint still carries its panels. */
    /* The glove's tint is its real palette - tan leather palms, blue-grey
       fabric - and in Saltline it is multiplied by a woven texture as
       well; 0.4 of the base stands in for that texture's average. */
    glove_fabric:     std('glove_fabric',     [0.0067, 0.0074, 0.0093], 0.95, 0, 2, 0.7),
    brass:            std('brass',            [0.539, 0.323, 0.0595],  0.32, 1.0, 1, 1.0),
  };
}
/* The sight's glass: a coated window that reflects the sky, and the
   holographic reticle - a 65 MOA ring with four ticks - projected along the
   bore, so it stays on the target as your eye moves behind the glass, which
   is the point of a holographic sight. Saltline's shader, with one change:
   no centre dot. The game's own red dot (weapons.js) is fixed to the camera
   because that is where the shot goes, so it sits inside this ring. */
const PAC9_LENS = {
  /* The sky the glass reflects: this game's (litSkyTexture, linear), not
     Saltline's - zenith, horizon, and the sun where the sky's break is. */
  uniforms: { uBright: { value: 7 }, uSun: { value: new THREE.Vector3().fromArray(EDGE.sun).normalize() },
              uSunCol: { value: new THREE.Vector3(1, 0.78, 0.55) }, uZen: { value: new THREE.Vector3(0.55, 0.58, 0.60) },
              uHor: { value: new THREE.Vector3(0.34, 0.37, 0.39) }, uTilt: { value: 0.1 } },
  vertexShader: `
    varying vec3 vView, vFwd, vRight, vUp, vWPos, vWN; varying vec2 vUv;
    uniform float uTilt;
    void main(){
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = mv.xyz;
      vFwd = (modelViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz; vRight = (modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vUp = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
      vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * normalize(vec3(0.0, -uTilt, 1.0)));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vView, vFwd, vRight, vUp, vWPos, vWN; varying vec2 vUv;
    uniform float uBright; uniform vec3 uSun, uSunCol, uZen, uHor;
    void main(){
      vec3 d = normalize(vView), fw = normalize(vFwd);
      float k = max(dot(d, fw), 1e-3);
      vec2 a = vec2(dot(d, normalize(vRight)), dot(d, normalize(vUp))) / k;
      float r = length(a), px = max(fwidth(r), 1e-5);
      float ringW = max(0.00045, px * 0.6);
      float ring = 1.0 - smoothstep(ringW - px * 0.5, ringW + px, abs(r - 0.0128));
      float tick = (1.0 - smoothstep(0.0, px * 1.2 + 0.0004, min(abs(a.x), abs(a.y)))) * step(0.0128, r) * (1.0 - smoothstep(0.0165, 0.0175, r));
      float ret = clamp(ring * 0.8 + tick * 0.8, 0.0, 1.0);
      vec3 retCol = vec3(1.0, 0.11, 0.045) * ret * uBright;
      vec3 wv = normalize(vWPos - cameraPosition); vec3 n = normalize(vWN); if (dot(n, wv) > 0.0) n = -n;
      vec3 rf = reflect(wv, n);
      float fres = pow(1.0 - abs(dot(wv, n)), 3.0);
      vec3 sky = mix(uHor, uZen, clamp(rf.y * 1.4 + 0.2, 0.0, 1.0));
      float sd = max(dot(rf, uSun), 0.0);
      sky += uSunCol * (pow(sd, 6.0) * 0.6 + pow(sd, 90.0) * 6.0);
      float band = smoothstep(0.25, 0.5, vUv.x * 0.6 + vUv.y) * (1.0 - smoothstep(0.62, 0.95, vUv.x * 0.6 + vUv.y));
      vec3 coat = mix(vec3(0.30, 0.50, 0.95), vec3(1.0, 0.62, 0.28), clamp(fres * 2.2 + vUv.y * 0.75 - 0.15, 0.0, 1.0));
      vec2 e = abs(vUv - 0.5) * 2.0; float edge = smoothstep(0.90, 1.0, max(e.x, e.y));
      float refl = 0.12 + 0.60 * fres + 0.07 * band;
      vec2 eg = (vUv - vec2(0.5, 0.16)) * vec2(1.0, 1.6); retCol += vec3(1.0, 0.10, 0.04) * 0.20 * exp(-dot(eg, eg) * 60.0) * (1.0 - smoothstep(0.985, 0.9995, k));
      vec3 col = (sky * 1.5 + vec3(0.03, 0.035, 0.045)) * coat * refl * (1.0 - edge) + retCol;
      float alpha = clamp(0.20 + 0.32 * fres + 0.05 * band + 0.6 * edge, 0.0, 0.94);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }` };
function pac9Lens(){
  /* The window's outline in the sight's own plane, 4cm behind the hood's
     front edge, with UVs across its bounding box as Saltline had them. */
  const w = [[-0.01616, 0.05688], [-0.01616, 0.07728], [-0.01232, 0.08112], [0.01232, 0.08112], [0.01616, 0.07728], [0.01616, 0.05688]];
  const p = [], uv = [];
  for (const [x, y] of w){ p.push(x, y, -0.031); uv.push((x + 0.01616) / 0.03232, (y - 0.05688) / 0.02424); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([1, 0, 5, 5, 4, 3, 3, 2, 1, 1, 5, 3]);
  const m = new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false, side: THREE.DoubleSide }, PAC9_LENS));
  m.extensions = { derivatives: true };
  const o = new THREE.Mesh(g, m); o.renderOrder = 5; o.frustumCulled = false;
  return o;
}
/* Unpack assets/pac9.bin: [u32 header length][header JSON][chunks], each
   mesh quantised - positions int16 across its own bounding box, normals
   int8, tints uint16 across their own range - and indexed. */
function pac9Build(buf){
  const dv = new DataView(buf), hn = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hn)));
  const base = 4 + hn + ((4 - ((4 + hn) % 4)) % 4);
  const mats = pac9Mats(), root = new THREE.Group(), groups = {};
  for (const part of head.parts){
    const nv = part.nv, g = new THREE.BufferGeometry();
    const qp = new Int16Array(buf, base + part.pos, nv * 3), pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++){ const k = i % 3; pos[i] = part.min[k] + (qp[i] + 32768) / 65535 * part.size[k]; }
    const qn = new Int8Array(buf, base + part.nrm, nv * 3), nrm = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) nrm[i] = qn[i] / 127;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (part.col >= 0){
      const qc = new Uint16Array(buf, base + part.col, nv * 3), col = new Float32Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) col[i] = qc[i] / 65535 * part.cmax;
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (part.uv >= 0) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.slice(base + part.uv, base + part.uv + nv * 8)), 2));
    const ib = buf.slice(base + part.idx, base + part.idx + part.ni * (part.big ? 4 : 2));
    g.setIndex(new THREE.BufferAttribute(part.big ? new Uint32Array(ib) : new Uint16Array(ib), 1));
    g.computeBoundingSphere();
    let m;
    if (part.mapImg){                              // the stencilled markings, as a decal over the receiver
      const img = new Image(); img.src = part.mapImg;
      const t = new THREE.Texture(img); img.onload = () => { t.needsUpdate = true; };
      t.encoding = THREE.sRGBEncoding; t.flipY = part.flipY; t.anisotropy = 4;
      m = lookTag(new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: part.rough, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { metalness: 0, roughness: part.rough }, { metalness: 0, roughness: part.rough });
    } else m = mats[part.mat];
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.castShadow = false;
    /* Parts that move (the magazine, each hand) share a group, placed by the
       matrix the part was exported with; the rest sit at the origin. */
    if (part.role === 'gun') root.add(mesh);
    else {
      let grp = groups[part.role];
      if (!grp){ grp = groups[part.role] = new THREE.Group();
        new THREE.Matrix4().fromArray(part.matrix).decompose(grp.position, grp.quaternion, grp.scale); root.add(grp); }
      grp.add(mesh);
    }
  }
  const lens = pac9Lens(); root.add(lens);
  return { root, mag: groups.g5, right: groups.g9, left: groups.g10, lens };
}
let PAC9_BUILT = null;
function mountPac9(b){
  const holder = weaponHolders[0];
  while (holder.children.length) holder.remove(holder.children[0]);
  const rig = new THREE.Group(); rig.position.set(0.02, -0.03, 0.05); holder.add(rig);
  b.root.position.fromArray(PAC9.at); rig.add(b.root);
  const fore = b.left.position.clone();
  VM_RIGS[0] = { left: b.left, right: b.right, mag: b.mag, shell: false,
    grip: b.right.position.clone(), fore, magAt: fore.clone().add(new THREE.Vector3().fromArray(PAC9.magTrip)),
    magHome: b.mag.position.clone() };
  /* Aiming brings the sight's window centre, not the hood's top, to the eye. */
  WEAPONS[0].aimTop = rig.position.y + PAC9.at[1] + PAC9.sightY;
  WEAPONS[0].vm = PAC9.vm;
  PAC9_BUILT = b;
  gloveEveryGun(b);
  if (typeof lookSoon === 'function') lookSoon();     // give the new materials the current look
}
/* THE SAME HANDS ON EVERY GUN (2026-11-21). Jack: "the hand used for rifle
   and other gun is not the same tho?" - the rifle had Saltline's gloves and
   everything else the old drawn arms. Now every slot gets the gloves.
   Saltline posed them on the PAC-9, so they are placed on another gun by
   the same two points each gun already gives its arms (drawn.js):
   - the right hand keeps its offset from the PAC-9's grip (Saltline's
     `grip`, [0, -0.1, 0.073]) and goes the same distance from that gun's
     `grip`;
   - the left keeps its offset from the bottom of the PAC-9's handguard
     under where it holds it, and goes to the bottom of that gun's fore-end
     (its `fore`, which sat a centimetre under it for the old palm).
   Same orientation: every gun points down -Z. The reload's trip is the
   old one, measured from the new resting place, so armsFrame needs no
   change. Clones share the PAC-9's geometry and materials. */
const PAC9_GRIP = [0, -0.1, 0.073], PAC9_FORE = [0, -0.021, -0.236];
function gloveEveryGun(b){
  const rOff = b.right.position.clone().sub(new THREE.Vector3().fromArray(PAC9_GRIP));
  const lOff = b.left.position.clone().sub(new THREE.Vector3().fromArray(PAC9_FORE));
  for (let i = 1; i < 5; i++){
    const r = VM_RIGS[i]; if (!r) continue;
    const parent = r.right.parent;
    const right = b.right.clone(), left = b.left.clone();
    right.position.copy(r.grip).add(rOff);
    const foreBottom = r.fore.clone(); foreBottom.y += 0.01;
    left.position.copy(foreBottom).add(lOff);
    parent.remove(r.right); parent.remove(r.left); parent.add(right, left);
    r.magAt = left.position.clone().add(r.magAt.clone().sub(r.fore));   // the same trip as before
    r.grip = right.position.clone(); r.fore = left.position.clone();
    r.right = right; r.left = left;
  }
  for (let i = 5; i < weaponHolders.length; i++){
    const old = HOLD_ARMS[i]; if (!old || !old.parent) continue;
    const right = b.right.clone(); right.position.copy(old.position).add(rOff);
    old.parent.add(right); old.parent.remove(old); HOLD_ARMS[i] = right;
  }
  /* The sword and the grenade are held, not just near a hand (THE SWORD AND
     THE GRENADE, REDRAWN). Their grip point is where the old arm's palm was. */
  const at = new THREE.Vector3(0.03, -0.11, 0.14);
  if (typeof BLADE !== 'undefined' && BLADE >= 0) { holdInGlove(BLADE, b, rOff, at, buildSword(), true, [-0.15, 0, -0.4, 1.5]);
    /* held up in guard, the hand in the lower right, not off the bottom of the screen */
    /* Lower and leaning out to the right (Jack, 2026-11-22: "the sword is
       too up right ... a bit lower, as a whole and the angle too, its
       blocking the sight too much"): the hilt low at the right edge, the
       blade tilted toward the upper right, the middle of the view clear. */
    WEAPONS[BLADE].vm = { x: 0.3, y: -0.2, z: -0.5, adsZ: 0, rx: 0, ry: 0, rz: 0, viewFov: 0 }; }
  if (typeof GRENADE !== 'undefined' && GRENADE >= 0){
    const gr = buildFragGrenade();
    gr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAC9_GRIP_AXIS);   // fuze out of the top of the fist
    gr.position.copy(PAC9_GRIP_AXIS).multiplyScalar(0.012);
    holdInGlove(GRENADE, b, rOff, at, gr, false, [0, 0, 0]);
    WEAPONS[GRENADE].vm = { x: 0.13, y: 0.0, z: -0.32, adsZ: 0, rx: 0, ry: 0, rz: 0, viewFov: 0 };   // in the hand, in view
  }
  /* Silvars' sensor, held like the grenade: the puck in the fist, face out */
  if (typeof SENSOR !== 'undefined' && SENSOR >= 0){
    const sn = new THREE.Group();
    const silver = opMat('rb_held_silver', 0x9aa1a9, 0.85, 0.32), crim = opMat('rb_held_crim', 0xc8102e, 0.3, 0.45);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.025, 18), silver); sn.add(puck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 6, 20), crim); ring.rotation.x = Math.PI / 2; ring.position.y = 0.014; sn.add(ring);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3348 })); led.position.y = 0.016; sn.add(led);
    sn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAC9_GRIP_AXIS);
    sn.position.copy(PAC9_GRIP_AXIS).multiplyScalar(0.01);
    holdInGlove(SENSOR, b, rOff, at, sn, false, [0, 0, 0]);
    WEAPONS[SENSOR].vm = { x: 0.13, y: 0.0, z: -0.32, adsZ: 0, rx: 0, ry: 0, rz: 0, viewFov: 0 };
  }
}
/* ---- THE SWORD AND THE GRENADE, REDRAWN (2026-11-22) ----
   Jack: "the sword is not held correctly, u need to go look up how a real
   sword is held" and "improve on the design of the grenade and the sword".

   HOW A SWORD IS HELD. The handshake grip: the handle runs diagonally
   across the palm and through the fist, the thumb and forefinger do the
   controlling, the other three fingers close round it, and the blade
   carries on in line with the forearm - raised a little in guard, never
   cocked at a right angle to the arm, the edge in line with the knuckles.
   The old blade lay flat along the view with the hand somewhere under its
   guard.

   So the sword is built in the HAND'S frame: the PAC-9 glove's fist is
   shaped round a pistol grip, whose line runs up and forward through it
   (PAC9_GRIP_AXIS). The sword's handle is put on exactly that line, so it
   passes through the closed fingers, guard at the top of the fist, pommel
   below the little finger. Then hand and sword are turned together about
   the grip, pitched forward until the blade stands about 30 degrees above
   the line of the forearm, which is a guard you can see past.

   The sword: a one-handed arming sword. A blade that tapers in width and
   thickness to its point, flattened-diamond in section with a fuller down
   each flat; a straight cross guard with turned finials; a leather grip
   with risers, steel ferrules at both ends; a wheel pommel.
   The grenade: a fragmentation grenade as soldiers carry them now - a
   smooth steel sphere, 64mm, in olive drab with its yellow band and
   stencil, the fuze on top, the spoon down the side under the fingers,
   the safety clip and the pull ring. The thrown one (effects.js) is the
   same model. */
const PAC9_GRIP_AXIS = new THREE.Vector3(0, 0.868, -0.496).normalize();
const M_BLADE  = () => dmatL('blade',  [0.55, 0.56, 0.58], 0.95, 0.16, 1, 1.2);   // polished steel
const M_GUARD  = () => dmatL('guard',  [0.05, 0.05, 0.055], 0.80, 0.38, 1);       // blackened steel
const M_LEATH  = () => dmatL('leath',  [0.045, 0.024, 0.012], 0.00, 0.72, 2, 0.5);
const M_OD     = () => dmatL('od',     [0.055, 0.065, 0.035], 0.20, 0.55, 2, 0.7); // olive drab paint
const M_YEL    = () => dmatL('yel',    [0.55, 0.42, 0.04], 0.10, 0.50, 2, 0.6);
/* The blade, along -Z from z0: width along Y (the edges), thickness along X
   (the flats). Flat-shaded, as a ground bevel is. */
function swordBladeGeo(len, w0, t0){
  const N = 14, ring = (s) => {
    const w = w0 * (s < 0.82 ? 1 - 0.22 * s : (1 - 0.22 * 0.82) * Math.sqrt(Math.max(0, (1 - s) / 0.18)));
    const t = t0 * (1 - 0.55 * s);
    return [[0, w], [t, w * 0.45], [t, -w * 0.45], [0, -w], [-t, -w * 0.45], [-t, w * 0.45]];
  };
  const pos = [];
  for (let i = 0; i < N; i++){
    const s0 = i / N, s1 = (i + 1) / N, A = ring(s0), B = ring(s1), z0 = -len * s0, z1 = -len * s1;
    for (let k = 0; k < 6; k++){ const k2 = (k + 1) % 6;
      const a = [A[k][0], A[k][1], z0], b = [A[k2][0], A[k2][1], z0], c = [B[k2][0], B[k2][1], z1], d = [B[k][0], B[k][1], z1];
      pos.push(...a, ...c, ...b, ...a, ...d, ...c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
/* THE LONGSWORD (2026-11-22, after the first-person longsword set Jack
   pointed at: "look at how they done the sword"). What that does, and the
   arming sword before it did not: a two-handed longsword - a long grip, a
   wide blade a metre long that runs off the top of the screen, a cross
   guard whose arms curve up toward the blade - held UPRIGHT at the right
   of the view, flat toward you, the hilt low with the hand just under the
   guard. Built along -Z with its origin where that upper hand grips:
   guard just above it, the grip running back past the second hand's place
   to the pommel. */
function buildSword(){
  const g = new THREE.Group(), bl = M_BLADE(), gd = M_GUARD(), lt = M_LEATH(), st = M_STEEL();
  /* the grip: 0.25m, a little waisted, leather over risers, ferrules */
  dTube(g, lt, 0.0158, 0.12, 0, 0, 0.025, 0.0148, 14);
  dTube(g, lt, 0.0148, 0.12, 0, 0, 0.145, 0.0162, 14);
  for (let i = 0; i < 7; i++) dTube(g, lt, 0.0168, 0.004, 0, 0, -0.025 + i * 0.033, 0.0168, 14);
  dTube(g, st, 0.0178, 0.014, 0, 0, -0.038, 0.0168, 14); dTube(g, st, 0.0168, 0.012, 0, 0, 0.212, 0.018, 14);
  /* the cross guard: a block over the blade's root, and two arms that
     sweep out and curve up toward the blade, flaring at their ends */
  dBox(g, gd, 0.028, 0.06, 0.022, 0, 0, -0.05);
  for (const sgn of [-1, 1]){
    const pts = [[0.028, -0.05], [0.065, -0.051], [0.098, -0.055], [0.124, -0.062], [0.14, -0.071]];   // [out along Y, along Z]: a gentle sweep
    for (let i = 0; i < pts.length - 1; i++){
      const a0 = new THREE.Vector3(0, sgn * pts[i][0], pts[i][1]), a1 = new THREE.Vector3(0, sgn * pts[i + 1][0], pts[i + 1][1]);
      const m = a0.clone().add(a1).multiplyScalar(0.5), len = a0.distanceTo(a1) + 0.004, th = 0.019 - i * 0.002;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(th, th, len), gd); seg.position.copy(m); seg.lookAt(a1); dAdd(g, seg);
    }
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.024), gd); tip.position.set(0, sgn * 0.143, -0.074); dAdd(g, tip);
  }
  /* the blade: a metre, wide at the guard, a long fuller each side */
  { const m = new THREE.Mesh(swordBladeGeo(0.98, 0.029, 0.0052), bl); m.position.z = -0.061; dAdd(g, m);
    for (const s of [-1, 1]){ const fl = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.011, 0.62), M_STEEL());
      fl.position.set(s * 0.0042, 0, -0.061 - 0.34); dAdd(g, fl); } }
  /* a scent-stopper pommel, and its peen */
  { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.05, 16), gd); p.rotation.x = Math.PI / 2; p.position.set(0, 0, 0.244); dAdd(g, p);
    const q = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), gd); q.position.set(0, 0, 0.272); dAdd(g, q); }
  return g;
}
/* The frag grenade, fuze up (+Y), spoon on the +Z side, centred on its body. */
function buildFragGrenade(){
  const g = new THREE.Group(), od = M_OD(), st = M_STEEL();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.032, 24, 18), od); dAdd(g, body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0306, 0.008, 24, 1, true), M_YEL()); band.position.y = 0.0135;   // the yellow band
  band.material.side = THREE.DoubleSide; dAdd(g, band);
  /* the fuze: body, the striker housing, the spoon pivot */
  const fz = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.022, 14), st); fz.position.y = 0.038; dAdd(g, fz);
  const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0105, 0.008, 14), st); hd.position.y = 0.053; dAdd(g, hd);
  /* the spoon: from the fuze head over and down the +Z side, following the body */
  const sp = new THREE.Group(); dAdd(g, sp);
  const pts = [[0.0, 0.057, 0.004], [0.0, 0.058, 0.014], [0.0, 0.046, 0.026], [0.0, 0.03, 0.034], [0.0, 0.01, 0.0365], [0.0, -0.01, 0.0355], [0.0, -0.022, 0.031]];
  for (let i = 0; i < pts.length - 1; i++){
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), m = a.clone().add(b).multiplyScalar(0.5);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0022, a.distanceTo(b) + 0.002), st);
    seg.position.copy(m); seg.lookAt(b.clone().add(sp.position)); dAdd(sp, seg);
  }
  /* the pull ring through its pin, on the -X side of the fuze, and the clip */
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 6), st); pin.rotation.z = Math.PI / 2; pin.position.set(-0.004, 0.044, 0.004); dAdd(g, pin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 6, 20), st); ring.position.set(-0.026, 0.044, 0.004); ring.rotation.y = Math.PI / 2; dAdd(g, ring);
  const clip = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0012, 5, 16, Math.PI), st); clip.position.set(0, 0.034, 0); clip.rotation.x = Math.PI / 2; dAdd(g, clip);
  /* stencilled */
  { const d = dDecal(g, 'GREN HAND FRAG', 0.0302, -0.004, 0, 0.034, 0.0055, 1); d.rotation.y = Math.PI / 2; }
  return g;
}
/* Put a held thing in the PAC-9's right glove: the glove at its offset from
   the grip, the thing on the grip line (or at the grip, for a grenade), and
   the two turned together about the grip by `turn`. */
/* How far each hand on the sword is turned round the handle (right, left),
   radians: it sets where the forearm runs, and so where the elbow is. */
const BLADE_HAND_TURN = [0, -1.2];
function holdInGlove(slot, b, rOff, at, thing, alignAxis, turn){
  const holder = weaponHolders[slot];
  while (holder.children.length) holder.remove(holder.children[0]);
  const pivot = new THREE.Group(); pivot.position.copy(at); holder.add(pivot);
  /* For a blade the glove hangs from its own WRIST group at the same grip,
     so a cut can turn the blade further than the forearm (bladeSwingFrame). */
  const wrist = alignAxis ? new THREE.Group() : pivot;
  if (alignAxis){ wrist.position.copy(at); holder.add(wrist); }
  const glove = b.right.clone(); glove.position.copy(rOff);
  /* A blade's right glove sits in a group whose origin is the fist, so it
     can be turned round the handle it holds (BLADE_HAND_TURN) - which swings
     its forearm, and so its elbow, without letting go. */
  const rgrp = alignAxis ? new THREE.Group() : wrist;
  if (alignAxis){ wrist.add(rgrp); rgrp.quaternion.setFromAxisAngle(PAC9_GRIP_AXIS, BLADE_HAND_TURN[0]); }
  rgrp.add(glove);
  if (alignAxis) thing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), PAC9_GRIP_AXIS);
  /* turned on its own axis so the flat, not the edge, faces you: the camera
     looks at a held blade from above and to its left */
  if (alignAxis && turn[3]) thing.rotateOnAxis(new THREE.Vector3(0, 0, 1), turn[3]);
  pivot.add(thing);
  pivot.rotation.set(turn[0], turn[1], turn[2]);
  if (wrist !== pivot) wrist.rotation.set(turn[0], turn[1], turn[2]);
  HOLD_ARMS[slot] = glove;
  if (alignAxis){                          // a blade: remember how it rests, for the cuts (SWORD_CUTS)
    /* BOTH HANDS ON IT (Jack, 2026-11-22: "add in both hands for the
       swinging ... when using the sword"). A longsword is held in two: the
       left hand closes on the grip just below the right, toward the pommel.
       It is the right glove MIRRORED in x - the fist closes round the same
       grip line (PAC9_GRIP_AXIS has no x) - slid 0.115m down it. Like the right hand it hangs from the WRIST group, so its forearm
       follows only part of a cut (riding the pivot swung the sleeve up across
       the view); bladeSwingFrame puts its fist back on the grip every frame.
       (three.js flips the winding itself for a negative scale.) */
    /* Mirrored as a GROUP, not the glove on its own axis: the glove model
       carries its own rotation, so flipping its local x was no mirror image
       and the forearm pointed up out of the fist. The group reflects the
       whole right hand through the grip's plane; its origin is the fist. */
    const left = new THREE.Group(); left.scale.x = -1;
    const lg = b.right.clone(); lg.position.copy(rOff); left.add(lg);
    const leftFist = new THREE.Vector3();                                 // the group's origin IS the fist
    const leftGrip = PAC9_GRIP_AXIS.clone().multiplyScalar(-0.115);       // where it holds, in the pivot's frame
    left.position.copy(leftGrip);
    /* turned 70 degrees round the handle (the fist stays on it): its
       forearm then runs down and out to the left instead of up across the
       view (Jack: "the second hand should not be blocking the screen too
       much, it should be lower") */
    left.quaternion.setFromAxisAngle(PAC9_GRIP_AXIS, BLADE_HAND_TURN[1]);
    wrist.add(left);
    pivot.updateMatrix();
    const d0 = new THREE.Vector3(0, 0, -1).applyQuaternion(thing.quaternion).applyQuaternion(pivot.quaternion).normalize();
    BLADE_RIG = { pivot, wrist, base: pivot.quaternion.clone(), thingQ: thing.quaternion.clone(), d0, off: new THREE.Vector3(), q: pivot.quaternion.clone(), from: null, lastT: 0,
                  left, leftFist, leftGrip, at: at.clone(), rgrp };
    /* JOINTED ARMS (2026-11-22). Jack: "i want you to add elbow so it looks
       more logical, for example for the fifth hit ... a human would need to
       bend his elbow to swing like that". Before this: a wrist bend (taken
       out: "not the wrist"), then sleeves stretched off-screen (a cover, not
       an arm). Now each arm is hand - forearm - ELBOW - upper arm - shoulder,
       the elbow found every frame by two-bone IK (bladeArmsFrame).
       The research (longsword cutting mechanics): the wind-up is made with
       the elbows BENT and held out from the body, the sword by the shoulder
       or over the head; the cut EXTENDS both arms forward through the
       strike; the recovery bends them again. Two-bone IK gives exactly that
       from where the hands are: hands drawn in bend the elbows, hands driven
       out straighten them. The wrist does not bend: each hand is turned
       round the handle it holds so its own forearm points at its elbow. */
    BLADE_RIG.arms = [jointedArm(holder, rgrp, glove, false, [0.21, -0.38, 0.14], [0.9, -0.8, 0.3]),
                      jointedArm(holder, left, lg, true, [-0.21, -0.38, 0.14], [-0.9, -0.8, 0.3])];
  }
}
/* The glove's long axis, measured on the model: from the fingertips at
   t -0.2 through the wrist (t 0.2, its narrowest) to the cuff at t 0.36. */
const GLOVE_C = new THREE.Vector3(0.036, 0.006, 0.002), GLOVE_V = new THREE.Vector3(0.452, 0.244, 0.858).normalize();
/* The PAC-9 glove is the hand AND the forearm (fist to cuff ~0.4m), so the
   forearm is the glove itself, rigid with the hand, and the ELBOW is at its
   cuff (t ARM.elbowT). */
const ARM = { elbowT: 0.40, upper: 0.33,                       // the elbow on the glove's axis; elbow to shoulder (m)
              tint: [5.0, 6.9, 9.0] };                        // the sleeve's own vertex tint, sampled off the glove
function jointedArm(holder, grp, glove, mirrored, shoulder, pole){
  const mat = glove.children[0].material;
  const tint = (geo) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(ARM.tint, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
  const tube = (r0, r1) => tint(new THREE.CylinderGeometry(r1, r0, 1, 16, 1, true).translate(0, 0.5, 0));
  /* smaller than the cuff, so the joint reads as an elbow and not a ball
     (Jack: "the elbow should be a smaller") */
  const upper = new THREE.Mesh(tube(0.062, 0.072), mat);
  const elbow = new THREE.Mesh(tint(new THREE.SphereGeometry(0.064, 16, 12)), mat);
  for (const m of [upper, elbow]){ m.frustumCulled = false; holder.add(m); }
  /* fist to elbow: the fist is the hand group's origin; where is it on the glove's axis? */
  glove.updateMatrix();
  const fl = new THREE.Vector3().applyMatrix4(glove.matrix.clone().invert());
  const reach = ARM.elbowT - fl.sub(GLOVE_C).dot(GLOVE_V);
  /* the glove's long axis in the hand group's frame (before the turn round
     the handle): the group is mirrored for the left hand */
  const a = GLOVE_V.clone().applyQuaternion(glove.quaternion); if (mirrored) a.x = -a.x;
  return { grp, glove, a, upper, elbow, reach, th: null,
           shoulder: new THREE.Vector3().fromArray(shoulder), pole: new THREE.Vector3().fromArray(pole).normalize() };
}
const _aF = new THREE.Vector3(), _aS = new THREE.Vector3(), _aE = new THREE.Vector3(), _aW = new THREE.Vector3(), _aU = new THREE.Vector3(),
      _aP = new THREE.Vector3(), _aD = new THREE.Vector3(), _aQ = new THREE.Quaternion(), _aY = new THREE.Vector3(0, 1, 0), _aK = new THREE.Vector3();
/* Where a segment a->b (world) leaves the view, as a share of it: an arm
   tube is cut there (a little past the edge), so nothing runs right by the
   lens - an upper arm reaching the shoulder beside the camera filled the
   corner as a flat dark slab. */
const _cV = new THREE.Vector3(), _cInv = new THREE.Matrix4();     // the camera's inverse, refreshed each frame by bladeArmsFrame
function armInView(p){
  /* a tube's surface is ~0.09 off its centre line: stopping the centre
     0.22m out keeps the whole tube clear of the near plane (0.05), which
     otherwise slices it into a flat dark slab */
  _cV.copy(p).applyMatrix4(_cInv); if (_cV.z > -0.22) return false;
  const ty = Math.tan(camera.fov * Math.PI / 360), tx = ty * camera.aspect;
  return Math.abs(_cV.x / -_cV.z) < tx * 1.25 && Math.abs(_cV.y / -_cV.z) < ty * 1.25;
}
function armClip(a, b, out){
  if (!armInView(a)) return 0;
  let t = 1;
  for (let i = 1; i <= 24; i++){ out.copy(a).lerp(b, i / 24); if (!armInView(out)){ t = i / 24; break; } }
  out.copy(a).lerp(b, t); return t;
}
const _cB = new THREE.Vector3();
/* a tube mesh from a to b (holder-local) */
function armSpan(m, a, b){
  _aD.copy(b).sub(a); const L = _aD.length() || 1e-4;
  m.position.copy(a); m.quaternion.setFromUnitVectors(_aY, _aD.divideScalar(L)); m.scale.set(1, L, 1);
}
/* Every frame with the blade out, after the viewmodel is placed. */
function bladeArmsFrame(){
  const R = BLADE_RIG; if (!R || !R.arms) return;
  const k = PAC9_GRIP_AXIS;
  camera.updateWorldMatrix(true, false); _cInv.copy(camera.matrixWorld).invert();   // (matrixWorldInverse is only refreshed at render)
  /* THE ARMS ARE FOR THE CHARGED ATTACK ONLY. Jack, after the jointed
     arms: "be like the original swing before all this, dont show too much
     arm" - "only for the swing not for the charge". So for rest and the
     five cuts the sword is held by the plain right glove (no elbow, no
     upper arm, the hand not turned on the grip), and while a charge is held
     and through the stab both hands are on it with jointed arms. */
  const both = chargeFrom > 0 || (swingT > 0 && swingCut === HEAVY.cut);
  R.left.visible = both;
  if (!both){
    for (const u of R.arms){
      u.elbow.visible = u.upper.visible = false; u.th = null;
      u.grp.quaternion.setFromAxisAngle(PAC9_GRIP_AXIS, BLADE_HAND_TURN[u.grp === R.left ? 1 : 0]);
    }
    return;
  }
  for (const u of R.arms){
    u.grp.updateWorldMatrix(true, false);
    const h = u.upper.parent;
    u.grp.getWorldPosition(_aF);                                          // the fist, on the grip
    _aS.copy(u.shoulder); camera.localToWorld(_aS);
    _aP.copy(u.pole).applyQuaternion(camera.getWorldQuaternion(_aQ));
    /* two-bone IK: the elbow where the forearm (fist to elbow) and the upper
       arm meet, pushed out and down along the pole */
    _aU.copy(_aS).sub(_aF); const d = _aU.length(); _aU.divideScalar(d || 1);
    const L1 = u.reach, L2 = ARM.upper, dd = Math.min(d, L1 + L2 - 1e-4);
    const along = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), up = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    _aP.addScaledVector(_aU, -_aP.dot(_aU)).normalize();
    _aE.copy(_aF).addScaledVector(_aU, along).addScaledVector(_aP, up);
    /* turn the hand round the handle so its forearm points at the elbow:
       the angle that best aligns the glove's axis, about the grip, with the
       fist-to-elbow line (both in the frame the hand group turns in) */
    _aD.copy(_aE).sub(_aF).normalize().applyQuaternion(u.grp.parent.getWorldQuaternion(_aQ).invert());
    const ka = k.dot(u.a);
    _aK.copy(u.a).addScaledVector(k, -ka);                                // a, across the grip
    _aW.crossVectors(k, u.a);
    const want = Math.atan2(_aW.dot(_aD), _aK.dot(_aD));
    if (u.th === null) u.th = want;
    else { let dth = want - u.th; dth -= Math.round(dth / (2 * Math.PI)) * 2 * Math.PI; u.th += dth * 0.5; }
    u.grp.quaternion.setFromAxisAngle(k, u.th);
    u.glove.updateWorldMatrix(true, false);
    /* the elbow is where the forearm - the glove - actually ends, now it
       points (as near as a turn round the handle can) at the IK elbow */
    _aE.copy(GLOVE_C).addScaledVector(GLOVE_V, ARM.elbowT); u.glove.localToWorld(_aE);
    const elbowSeen = armInView(_aE);
    u.elbow.visible = u.upper.visible = elbowSeen;
    if (elbowSeen){ armClip(_aE, _aS, _cB); h.worldToLocal(_aE); h.worldToLocal(_cB); armSpan(u.upper, _aE, _cB); u.elbow.position.copy(_aE); }
  }
}
/* THE FIVE CUTS (2026-11-22). Jack: "its the animation of the 5 swinging of
   the sword, i want you to make the swing like the video". The video's
   attacks, frame by frame: from the upright guard the sword is drawn back
   (over the right shoulder, or down to one side), then CUTS - a fast arc
   right through the view, both arms extending with it, the blade passing
   out of the frame in about a fifth of a second - holds a beat in the
   follow-through, and comes back up to the guard. Four different lines of
   cut, and here a fifth for the finisher:
     1  forehand diagonal: over the right shoulder, down to the lower left
     2  horizontal: from the left, flat across to the right
     3  rising: from low left up across to the upper right
     4  backhand diagonal: over the left shoulder, down to the lower right
     5  the finisher: raised high overhead, straight down the middle
   Each key is [time 0..1, hand offset (view space, metres), blade
   direction]. The hand moves the whole hold; the blade turns about the
   grip as a wrist does. A cut chained before the last one finished starts
   from wherever that one had got to. */
let BLADE_RIG = null;
/* EDGE FIRST, IN FRONT (2026-11-22). Jack: "it should be sideways and not
   like ur wacking it using the body, i am slicing with the blade not the
   metal, and the swinging should be swinging infront not at the side".
   The keys used to give only where the point aimed, and the roll fell
   wherever the shortest turn left it - so most cuts led with the FLAT. Now
   every key is a whole orientation: the blade along its direction and the
   EDGE turned into the way the blade is travelling there (bladeKeyQuats),
   so the cut slices. And the strikes pass through the middle of the view,
   arms out in front, not out at the right where the sword rests. */
const SWORD_CUTS = [
  /* 1 forehand diagonal: up over the right shoulder, down across to the lower left */
  [[0.20, [-0.08, 0.32, 0.04], [0.40, 0.85, 0.35]], [0.32, [-0.20, 0.24, -0.10], [0.55, 0.70, -0.45]],
   [0.44, [-0.32, 0.10, -0.14], [-0.80, -0.30, -0.50]], [0.62, [-0.42, -0.02, -0.06], [-0.85, -0.50, -0.15]]],
  /* 2 horizontal: from the left, flat across to the right */
  [[0.20, [-0.46, 0.16, 0.02], [-0.90, 0.15, 0.40]], [0.32, [-0.36, 0.16, -0.12], [-0.80, 0.12, -0.58]],
   [0.44, [-0.16, 0.16, -0.14], [0.80, 0.10, -0.58]], [0.62, [-0.02, 0.12, -0.04], [0.92, 0.05, 0.30]]],
  /* 3 rising: from low left up across to the upper right. The hands finish
     LOW and to the right (Jack: "the 3 attack is still blocking the screen":
     they used to rise to the middle with the left arm lying across the
     view); the blade still sweeps up through it. */
  [[0.20, [-0.44, -0.04, 0.02], [-0.75, -0.55, 0.35]], [0.32, [-0.34, 0.02, -0.12], [-0.75, -0.35, -0.55]],
   [0.44, [-0.10, 0.06, -0.14], [0.70, 0.55, -0.45]], [0.62, [0.02, 0.08, -0.04], [0.50, 0.84, 0.20]]],
  /* 4 backhand diagonal: up over the left shoulder, down across to the lower right */
  [[0.20, [-0.44, 0.32, 0.04], [-0.50, 0.80, 0.33]], [0.32, [-0.36, 0.24, -0.10], [-0.55, 0.70, -0.45]],
   [0.44, [-0.22, 0.10, -0.14], [0.80, -0.30, -0.50]], [0.62, [-0.10, -0.02, -0.06], [0.85, -0.50, -0.15]]],
  /* 5 the finisher: raised high overhead, straight down the middle */
  [[0.24, [-0.30, 0.36, 0.06], [0.06, 0.55, 0.83]], [0.36, [-0.30, 0.30, -0.10], [0.06, 0.95, -0.30]],
   [0.48, [-0.30, 0.14, -0.18], [-0.08, -0.35, -0.93]], [0.68, [-0.32, 0.06, -0.10], [-0.30, -0.70, -0.65]]],
  /* 6 the CHARGED STAB (right-click, HEAVY in weapons.js; Jack: "the
     charge attack for the sword should be a stab", then "charge at the
     left side and stab"). Its first key is the pose the charge draws into:
     the hilt pulled back on the LEFT, the point ON the crosshair (every
     key here is 'aim': "when charging the sword should be pointing to the
     aim"). The release drives the hand forward and in
     along that line, arm out, holds at full extension, and recovers. The
     point is aimed a little across the view rather than dead down it, or
     the blade foreshortens to a stub; its line still runs into the dot. */
  [[0.04, [-0.40, 0.0, 0.02], 'aim'], [0.14, [-0.34, 0.08, -0.20], 'aim'],
   [0.24, [-0.30, 0.12, -0.38], 'aim'], [0.55, [-0.30, 0.10, -0.32], 'aim']],
];
const _cutI = new THREE.Quaternion(), _cutQ = new THREE.Quaternion(), _cutA = new THREE.Vector3(), _cutB = new THREE.Vector3();
const _kM = new THREE.Matrix4(), _kF = new THREE.Vector3(), _kZ = new THREE.Vector3();
/* Each key of a cut as a whole pivot orientation. The sword's own frame:
   blade along -Z, edges along Y, flats facing X. The edge is set to the way
   the blade is moving at that key (from the keys either side; the wind-up
   key already faces the way the cut will go). ALWAYS the same edge: picking
   whichever edge needed less roll put opposite edges on two keys of one
   strike, and the blade rolled flat-first through the middle of it. */
function bladeKeyQuats(R, K){
  if (!R.kq) R.kq = new Map();
  if (R.kq.has(K)) return R.kq.get(K);
  const inv = R.thingQ.clone().invert(), out = [];
  let prevE = new THREE.Vector3(0, 1, 0).applyQuaternion(R.thingQ).applyQuaternion(R.base);
  /* A key's direction may be 'aim': the blade laid along the line from
     where the hand is at that key to a point 8m down the crosshair (the
     charge and the stab, Jack: "when charging the sword should be pointing
     to the aim"). The hand's place in view space is the blade's resting
     pose plus its grip point plus the key's offset. */
  const vm = WEAPONS[BLADE].vm || { x: 0, y: 0, z: 0 };
  const dirs = K.map(k => k[2] === 'aim'
    ? new THREE.Vector3(-(vm.x + R.at.x + k[1][0]), -(vm.y + R.at.y + k[1][1]), -8 - (vm.z + R.at.z + k[1][2])).normalize()
    : new THREE.Vector3(...k[2]).normalize());
  for (let i = 0; i < K.length; i++){
    const d = dirs[i].clone();
    const a = i === 0 ? d.clone() : dirs[i - 1].clone();
    const b = dirs[Math.min(K.length - 1, i + 1)].clone();
    if (i === K.length - 1) b.copy(d);
    const e = b.sub(a); e.addScaledVector(d, -e.dot(d));
    if (K[i][2] === 'aim' || e.lengthSq() < 1e-6) e.copy(prevE).addScaledVector(d, -prevE.dot(d));   // a thrust: keep the blade's roll
    e.normalize();
    prevE = e.clone();
    _kZ.copy(d).negate(); _kF.crossVectors(e, _kZ);
    _kM.makeBasis(_kF, e, _kZ);
    out.push(new THREE.Quaternion().setFromRotationMatrix(_kM).multiply(inv));
  }
  R.kq.set(K, out); return out;
}
/* Called every frame while the blade is out: returns the hand's offset to
   add to the gun's position, and turns the blade's pivot. */
function bladeSwingFrame(swingT, cut, charge){
  const R = BLADE_RIG; if (!R) return null;
  const p = 1 - swingT;
  if (swingT > R.lastT + 0.05) R.from = { off: R.off.clone(), q: R.q.clone() };   // a new cut began
  R.lastT = swingT;
  if (swingT <= 0 && charge > 0){
    /* charging: drawn back into the charged cut's first key, eased, with a
       tremble once it is full */
    const K = SWORD_CUTS[SWORD_CUTS.length - 1], q0 = bladeKeyQuats(R, K)[0];
    const e = 1 - Math.pow(1 - Math.min(1, charge * 1.6), 3);
    R.off.set(0, 0, 0).lerp(_cutA.fromArray(K[0][1]), e);
    if (charge >= 1){ const n = performance.now() * 0.05; R.off.x += Math.sin(n * 1.7) * 0.004; R.off.y += Math.sin(n * 2.3) * 0.004; }
    R.q.copy(R.base).slerp(q0, e); R.from = null;
  }
  else if (swingT <= 0){ R.off.set(0, 0, 0); R.q.copy(R.base); R.from = null; }
  else {
    const K = SWORD_CUTS[Math.max(0, Math.min(SWORD_CUTS.length - 1, cut | 0))], KQ = bladeKeyQuats(R, K);
    const keys = [[0, R.from ? R.from.off.toArray() : [0, 0, 0], R.from ? R.from.q : R.base],
                  ...K.map((k, j) => [k[0], k[1], KQ[j]]), [1, [0, 0, 0], R.base]];
    let i = 0; while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], t0 = Math.min(1, Math.max(0, (p - a[0]) / (b[0] - a[0])));
    const t = t0 * t0 * (3 - 2 * t0);
    R.off.fromArray(a[1]).lerp(_cutA.fromArray(b[1]), t);
    R.q.copy(a[2]).slerp(b[2], t);
  }
  R.pivot.quaternion.copy(R.q);
  /* the forearm follows a third of the turn; the wrist bends the rest, as
     a real one does, so a downward cut does not swing the sleeve up across
     the view */
  /* ...of the SWING only, not the edge's roll: a sleeve twisted round
     with the blade reads as a broken arm */
  _cutQ.setFromUnitVectors(R.d0, _cutA.set(0, 0, -1).applyQuaternion(R.thingQ).applyQuaternion(R.q).normalize());
  if (R.wrist !== R.pivot) R.wrist.quaternion.copy(_cutI.identity().slerp(_cutQ, 0.35)).multiply(R.base);
  /* the left hand's fist back on the grip: the grip point turned with the
     blade, taken into the wrist's frame (both groups share one origin) */
  if (R.left) R.left.position.copy(R.leftGrip).applyQuaternion(R.pivot.quaternion)
                .applyQuaternion(_cutI.copy(R.wrist.quaternion).invert()).sub(R.leftFist);
  return R.off;
}

fetch(PAC9.url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
  .then(buf => mountPac9(pac9Build(buf)))
  .catch(e => console.warn('[pac9] kept the drawn rifle: ' + e));

/* The abilities and the blade keep their own drawn shapes (weapons.js);
   they just get a hand to be held in. */
const HOLD_ARMS = [];
for (let i = 5; i < weaponHolders.length; i++){
  const right = drawArm([0.30, -0.34, 0.89], 1, 1); right.position.set(0.03, -0.11, 0.14); weaponHolders[i].add(right);
  HOLD_ARMS[i] = right;
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
/* THE AGENTS' LOOKS (2026-11-27, from Jack's character sheets in
   `Crinsome x/Pictures/character design`). One body, three outfits:
   ASEED: a grey hood with a crimson mask, a plaid poncho over
     maroon sleeves, a tattered crimson-and-grey cape, a bandolier, crimson
     armour on the forearms (with spines) and the shins, olive camo trousers.
   BLAST: a black ballistic helmet with a four-lens night-vision unit
     (red lenses), olive ear cups, an olive scarf over the face, dark camo,
     a black plate carrier with two red grenades, a big black pack.
   SILVARS: no helmet - grey hair and a face - a charcoal hooded jacket
     with the hood down, a brown vest hung with radios and green screens,
     wrist screens, knee pads, a brown pack with antennas and cable.
   No `look` (the range's targets) keeps the original plated operator. */
const OP_LOOKS = {
  base:    { suit: 0x16181c, legs: 0x16181c, plate: 0x3d444d, dark: 0x22262b, arm: 0x3d444d },
  aseed:   { suit: 0x1c1d20, legs: 0x1a1f17, plate: 0x3a141a, dark: 0x121314, arm: 0x2a1014, sleeve: 0x2e0d12 },
  blast:   { suit: 0x191a15, legs: 0x181913, plate: 0x0d0e0f, dark: 0x0b0c0d, arm: 0x191a15 },
  silvars: { suit: 0x15161a, legs: 0x1c1a17, plate: 0x2a2119, dark: 0x111110, arm: 0x15161a },
};
function makeOperator(accent, look){
  const L = OP_LOOKS[look] ? look : 'base', K = OP_LOOKS[L];
  const g = new THREE.Group();
  const suit = opMat('suit' + L, K.suit, 0.0, 0.86), plate = opMat('plate' + L, K.plate, L === 'base' ? 0.50 : 0.25, L === 'base' ? 0.42 : 0.6),
        dark = opMat('pdark' + L, K.dark, L === 'base' ? 0.45 : 0.2, L === 'base' ? 0.48 : 0.7);
  const legs = opMat('legs' + L, K.legs, 0.0, 0.9), arm = opMat('arm' + L, K.arm, L === 'base' ? 0.5 : 0.1, 0.7);
  const acc = opMat('acc' + accent, accent, 0.25, 0.42), vis = opMat('vis' + accent, 0x06080a, 0.8, 0.10, { emissive: new THREE.Color(accent), emissiveIntensity: 1.1, side: THREE.DoubleSide });
  const P = (parent, m, geo, x, y, z, rx, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; parent.add(o); return o; };
  const B = (w, h, d) => opGeo('b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d));
  const C = (r0, r1, h) => opGeo('c' + r0 + '_' + r1 + '_' + h, () => new THREE.CylinderGeometry(r0, r1, h, 14));
  const S = (r) => opGeo('s' + r, () => new THREE.SphereGeometry(r, 14, 10));
  /* A limb segment hanging from (x, y, z): top radius, bottom radius, length. */
  const cap = (parent, m, rt, rb, len, x, y, z, rx, rz) => { const s = new THREE.Group(); s.position.set(x, y, z); if (rx) s.rotation.x = rx; if (rz) s.rotation.z = rz; parent.add(s);
    P(s, m, C(rt, rb, len), 0, -len / 2, 0); P(s, m, S(rt), 0, 0, 0); P(s, m, S(rb), 0, -len, 0); return s; };

  // ---- trunk
  P(g, legs, C(0.150, 0.135, 0.20), 0, 0.93, 0).scale.set(1.12, 1, 0.82);                 // pelvis
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
  P(g, suit, C(0.058, 0.066, 0.10), 0, 1.60, 0.005);                                      // neck

  // ---- head and kit, per agent. The head stays inside the head hitbox, a sphere of 0.19 at 1.70.
  if (L === 'aseed') {
    const crim = opMat('tq_mask', 0x8a1520, 0.35, 0.45), hood = opMat('tq_hood', 0x232428, 0.0, 0.95),
          cape = opMat('tq_cape', 0x2a0a10, 0.0, 0.95, { side: THREE.DoubleSide }), capeG = opMat('tq_capeg', 0x26272b, 0.0, 0.95, { side: THREE.DoubleSide }),
          brass = opMat('tq_brass', 0xa8843e, 0.8, 0.35), shell = opMat('tq_shell', 0x8a1520, 0.3, 0.5);
    P(g, dark, S(0.135), 0, 1.70, 0);                                                        // the balaclava under the hood
    // the mask: a crimson shell over the face, eye slits, a ribbed snout
    P(g, crim, opGeo('tqmask', () => new THREE.CylinderGeometry(0.142, 0.118, 0.17, 20, 1, true, -1.0, 2.0)), 0, 1.68, 0.012).scale.set(1, 1, 1.12);
    for (const sx of [-1, 1]) P(g, dark, B(0.05, 0.014, 0.02), sx * 0.045, 1.725, 0.152);
    P(g, crim, B(0.07, 0.06, 0.05), 0, 1.635, 0.14);
    for (let i = 0; i < 3; i++) P(g, dark, B(0.05, 0.006, 0.01), 0, 1.618 + i * 0.016, 0.166);
    // the hood: a dome turned on a lathe, open across the face
    P(g, hood, opGeo('tqhood', () => new THREE.LatheGeometry([[0.001, 0.2], [0.09, 0.19], [0.15, 0.15], [0.18, 0.08], [0.185, 0.0], [0.175, -0.08], [0.16, -0.13]]
      .map(p => new THREE.Vector2(p[0], p[1])), 20, 0.85, Math.PI * 2 - 1.7)), 0, 1.70, -0.01).material.side = THREE.DoubleSide;
    // the poncho over the shoulders, and the sleeves under it
    P(g, hood, opGeo('tqponcho', () => new THREE.CylinderGeometry(0.17, 0.33, 0.24, 18, 1, true)), 0, 1.47, 0).scale.set(1.05, 1, 0.8);
    // the bandolier across the chest, with its row of shells
    const band = new THREE.Group(); band.position.set(0, 1.36, 0.185); band.rotation.z = 0.75; g.add(band);
    P(band, dark, B(0.045, 0.52, 0.012), 0, 0, 0);
    for (let i = 0; i < 7; i++){ P(band, shell, B(0.016, 0.03, 0.016), 0, -0.18 + i * 0.05, 0.012); P(band, brass, B(0.017, 0.008, 0.017), 0, -0.196 + i * 0.05, 0.012); }
    // the cape: torn strips hanging from the shoulders, crimson and grey
    const capeLen = [0.95, 0.80, 1.02, 0.88, 0.98, 0.78, 0.92, 0.85];
    capeLen.forEach((len, i) => {
      const a = -1.25 + i * (2.5 / (capeLen.length - 1));
      const strip = P(g, i % 3 === 1 ? capeG : cape, opGeo('tqstrip' + len, () => { const p = new THREE.PlaneGeometry(0.13, len); p.translate(0, -len / 2, 0); return p; }),
        Math.sin(a) * 0.26, 1.50, -Math.cos(a) * 0.2 - 0.02);
      strip.rotation.y = -a; strip.rotation.x = 0.08;
    });
  } else if (L === 'blast') {
    const olive = opMat('bl_olive', 0x2a2c1d, 0.0, 0.92), red = opMat('bl_red', 0x9a141c, 0.3, 0.45),
          lens = opMat('bl_lens', 0x1a0306, 0.6, 0.2, { emissive: new THREE.Color(0xff1e2e), emissiveIntensity: 1.3 });
    const helm = opGeo('helm', () => new THREE.LatheGeometry([[0.001, 0.165], [0.070, 0.158], [0.118, 0.128], [0.146, 0.080], [0.154, 0.020], [0.150, -0.040], [0.138, -0.085], [0.120, -0.100]]
      .map(p => new THREE.Vector2(p[0], p[1])), 22));
    P(g, dark, helm, 0, 1.745, 0).scale.set(1, 0.82, 1.10);                                 // the helmet, high cut
    P(g, olive, S(0.122), 0, 1.68, 0.005);                                                   // the scarf up over the face
    P(g, olive, opGeo('blscarf', () => new THREE.CylinderGeometry(0.13, 0.15, 0.12, 16)), 0, 1.60, 0.01);
    for (const sx of [-1, 1]) P(g, olive, C(0.05, 0.05, 0.05), sx * 0.15, 1.69, 0, 0, Math.PI / 2);   // ear cups
    // the night-vision unit: a mount on the brow, four tubes with red lenses
    P(g, dark, B(0.08, 0.05, 0.05), 0, 1.80, 0.15);
    P(g, dark, B(0.26, 0.04, 0.05), 0, 1.745, 0.175);
    for (const x of [-0.09, -0.032, 0.032, 0.09]){
      P(g, dark, C(0.026, 0.026, 0.07), x, 1.735, 0.21, Math.PI / 2);
      P(g, lens, C(0.021, 0.021, 0.006), x, 1.735, 0.247, Math.PI / 2);
    }
    P(g, red, B(0.16, 0.006, 0.01), 0, 1.80, 0.13);                                         // the red stripe on the shell
    for (const x of [-0.05, 0.03]) { P(g, red, C(0.022, 0.022, 0.09), x, 1.31, 0.2); P(g, dark, C(0.024, 0.024, 0.015), x, 1.36, 0.2); }   // two red grenades
    P(g, dark, B(0.32, 0.38, 0.16), 0, 1.33, -0.25);                                        // the big pack
    P(g, dark, C(0.012, 0.012, 0.3), 0.14, 1.62, -0.26);                                    // its antenna
  } else if (L === 'silvars') {
    const skin = opMat('sv_skin', 0x9c745d, 0.0, 0.75), hair = opMat('sv_hair', 0x6a6660, 0.0, 0.85),
          screen = opMat('sv_screen', 0x0a1410, 0.4, 0.3, { emissive: new THREE.Color(0x48e0a0), emissiveIntensity: 0.9 }),
          brown = opMat('sv_brown', 0x2b231b, 0.0, 0.9), gaiter = opMat('sv_gaiter', 0x2f2a22, 0.0, 0.95);
    P(g, skin, S(0.118), 0, 1.69, 0.01).scale.set(0.95, 1.08, 1.0);                          // the head
    P(g, hair, opGeo('svhair', () => new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), 0, 1.71, -0.005).scale.set(1, 1.05, 1.08);
    P(g, hair, B(0.17, 0.045, 0.06), 0.01, 1.80, 0.07).rotation.x = -0.4;                   // the swept fringe
    for (const sx of [-1, 1]) P(g, dark, B(0.035, 0.012, 0.01), sx * 0.04, 1.71, 0.118);   // brows and eyes, in shadow
    P(g, gaiter, opGeo('svgaiter', () => new THREE.CylinderGeometry(0.085, 0.10, 0.11, 14)), 0, 1.59, 0.01);
    P(g, suit, opGeo('svhood', () => new THREE.TorusGeometry(0.11, 0.05, 8, 16)), 0, 1.585, -0.04, Math.PI / 2 - 0.3);   // the hood, down
    // radios and screens across the vest, and one on each wrist (below)
    P(g, dark, B(0.11, 0.07, 0.04), -0.02, 1.47, 0.19); P(g, screen, B(0.08, 0.045, 0.004), -0.02, 1.47, 0.212);
    P(g, dark, B(0.05, 0.07, 0.04), 0.09, 1.47, 0.19); P(g, screen, B(0.035, 0.04, 0.004), 0.09, 1.47, 0.212);
    P(g, dark, B(0.035, 0.1, 0.03), -0.12, 1.49, 0.19); P(g, dark, C(0.004, 0.004, 0.12), -0.13, 1.58, 0.19);
    // the pack: brown, with a radio, two antennas and a loop of cable
    P(g, brown, B(0.3, 0.36, 0.14), 0, 1.36, -0.24);
    P(g, dark, B(0.06, 0.09, 0.04), 0.07, 1.42, -0.32);
    P(g, dark, C(0.005, 0.006, 0.42), 0.12, 1.66, -0.24); P(g, dark, C(0.005, 0.006, 0.3), -0.12, 1.6, -0.26);
    P(g, dark, opGeo('svcable', () => new THREE.TorusGeometry(0.1, 0.006, 4, 16)), 0, 1.32, -0.315);
  } else {
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
    P(g, dark, B(0.26, 0.30, 0.10), 0, 1.36, -0.215); P(g, plate, C(0.045, 0.045, 0.24), 0.085, 1.40, -0.275);   // pack and canister
  }

  // ---- legs: pivoted at the hip
  const legArmour = L === 'aseed' ? plate : L === 'base' ? plate : null;
  const pad = L === 'base' ? plate : opMat('kneepad' + L, 0x1a1b1d, 0.2, 0.6);
  const leg = (sx) => { const p = new THREE.Group(); p.position.set(sx * 0.098, 0.88, 0); g.add(p);
    cap(p, legs, 0.088, 0.066, 0.40, 0, 0, 0);                                            // thigh
    if (L === 'base') P(p, plate, B(0.12, 0.22, 0.045), sx * 0.012, -0.19, 0.070).rotation.x = -0.05;       // thigh plate
    else P(p, legs, B(0.07, 0.12, 0.05), sx * 0.08, -0.22, 0.02);                          // cargo pocket
    P(p, dark, B(0.07, 0.13, 0.05), sx * 0.085, -0.16, 0);                                // holster / pouch
    P(p, pad, S(0.062), 0, -0.415, 0.030).scale.set(1.05, 1.1, 0.9);                      // knee
    cap(p, legs, 0.066, 0.050, 0.34, 0, -0.42, 0);                                        // shin
    if (legArmour) P(p, legArmour, B(0.10, 0.25, 0.045), 0, -0.59, 0.045);                // greave (Aseed's crimson ones)
    P(p, dark, B(0.105, 0.085, 0.24), 0, -0.835, 0.040); P(p, dark, B(0.100, 0.050, 0.10), 0, -0.790, -0.040);   // boot and heel
    P(p, dark, B(0.108, 0.030, 0.26), 0, -0.865, 0.045);                                  // sole
    return p; };
  const ll = leg(-1), rl = leg(1);

  // ---- arms: posed on a rifle held across the chest, muzzle low and to the body's left
  const upper = L === 'aseed' ? opMat('tq_sleeve', OP_LOOKS.aseed.sleeve, 0, 0.85) : suit;
  if (L === 'base') for (const sx of [-1, 1]){ P(g, plate, S(0.090), sx * 0.262, 1.515, 0).scale.set(1.08, 0.86, 1.12); P(g, acc, B(0.010, 0.05, 0.11), sx * 0.356, 1.50, 0); }   // pauldrons
  else for (const sx of [-1, 1]) P(g, upper, S(0.082), sx * 0.255, 1.51, 0);              // a shoulder in cloth
  cap(g, upper, 0.058, 0.048, 0.27, 0.262, 1.49, 0, 0.25, 0.10);                          // right upper arm, down and a little back
  const rf = cap(g, arm, 0.050, 0.040, 0.25, 0.235, 1.235, -0.065, -1.20, -0.42); P(rf, dark, B(0.07, 0.08, 0.08), 0, -0.285, 0);   // forearm forward to the grip
  cap(g, upper, 0.058, 0.048, 0.27, -0.262, 1.49, 0, -0.55, -0.12);                       // left upper arm, reaching forward
  const lf = cap(g, arm, 0.050, 0.040, 0.25, -0.232, 1.262, 0.142, -1.30, 0.62); P(lf, dark, B(0.07, 0.08, 0.08), 0, -0.285, 0);    // and across to the fore-end
  if (L === 'aseed') for (const f of [rf, lf]) {                                          // crimson vambraces with spines
    P(f, plate, C(0.056, 0.05, 0.16), 0, -0.15, 0);
    for (let i = 0; i < 3; i++) P(f, plate, opGeo('tqspine', () => new THREE.ConeGeometry(0.015, 0.06, 5)), 0.05, -0.09 - i * 0.045, 0, 0, -1.2);
  }
  if (L === 'silvars') {                                                                  // a screen on each wrist
    const scr = opMat('sv_screen', 0x0a1410, 0.4, 0.3, { emissive: new THREE.Color(0x48e0a0), emissiveIntensity: 0.9 });
    for (const f of [rf, lf]) { P(f, dark, B(0.07, 0.07, 0.02), 0, -0.18, 0.045); P(f, scr, B(0.05, 0.05, 0.004), 0, -0.18, 0.056); }
  }
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
  g.userData = { la: still, ra: still, ll, rl, walk: 0, look: L };
  return g;
}
/* What the rest of the game calls for a body. Players take the brand
   crimson unless they are given a colour, and wear their agent's outfit;
   practice targets are amber and keep the plain plated operator, so a
   target is never mistaken for a person. */
newPlayerMesh = function(color, look){ return makeOperator(typeof color === 'number' ? color : BRAND, look); };
newBotMesh = function(){ return makeOperator(0xd08a1e); };
/* And the one on the podium at the menu, in whoever you have picked. */
function setHeroLook(look){
  const at = hero ? hero.rotation.y : 0;
  scene.remove(hero); hero = makeOperator(BRAND, look); hero.position.set(0, 0.12, 32); hero.rotation.y = at;
  hero.visible = heroGroup[1] ? heroGroup[1].visible : true;
  scene.add(hero); heroGroup[0] = hero; spot.target = hero; scene.add(spot.target);
}
setHeroLook(myAgent);
