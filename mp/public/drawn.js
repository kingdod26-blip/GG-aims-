/* =============================================================
   Crimson X — drawn.js  (after weapons.js, before session.js; unnumbered)

   EVERY MODEL IN THE GAME IS BUILT HERE, IN CODE. There are no model
   files any more: the five guns, the arms that hold them, and the
   operator everyone plays are all assembled from boxes and cylinders.

   Why: the downloaded guns were someone else's low-poly set that never
   matched the room, and the player model was fan art of a character
   another company owns. Drawn here they are the game's own, they load
   with the page instead of after it, and they can be animated — which a
   static file with no rig could not.

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
const M_STEEL  = () => dmat('steel',  0x3c4046, 0.90, 0.36);
const M_DARK   = () => dmat('dark',   0x17191c, 0.55, 0.46);
const M_POLY   = () => dmat('poly',   0x101113, 0.00, 0.58);
const M_POLY2  = () => dmat('poly2',  0x1c1e22, 0.00, 0.50);
const M_BRASS  = () => dmat('brass',  0x8a6a2a, 0.90, 0.38);
const M_WOOD   = () => dmat('wood',   0x3a2415, 0.00, 0.62);
const M_RED    = () => dmat('red',    0x9a1c2c, 0.10, 0.50);
const M_GLASS  = () => dmat('glass',  0x0a1a22, 0.60, 0.12);
const M_SLEEVE = () => dmat('sleeve', 0x14171a, 0.00, 0.85);
const M_GLOVE  = () => dmat('glove',  0x0e0f11, 0.00, 0.70);

function dBox(g, m, w, h, d, x, y, z, rx, rz){
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz;
  o.frustumCulled = false; g.add(o); return o;
}
/* A cylinder lying along Z, which is the way a barrel points. */
function dTube(g, m, r, len, x, y, z, r2){
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2 || r, r, len, 14), m);
  o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.frustumCulled = false; g.add(o); return o;
}

/* ---- the guns ----
   Each returns the group plus where the hands go and which part is the
   magazine, so the arms and the reload know the gun they are holding. */
function drawRifle(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), p2 = M_POLY2();
  dBox(g, dk, 0.046, 0.062, 0.24, 0, 0.006, 0.00);                 // upper and lower receiver
  dBox(g, po, 0.040, 0.034, 0.10, 0, -0.036, 0.04);
  dBox(g, p2, 0.044, 0.050, 0.23, 0, 0.004, -0.235);               // handguard
  for (let i = 0; i < 5; i++) dBox(g, po, 0.046, 0.030, 0.012, 0, 0.004, -0.15 - i * 0.042);   // its vents
  dTube(g, st, 0.010, 0.17, 0, 0.008, -0.43);                      // barrel
  dTube(g, dk, 0.016, 0.055, 0, 0.008, -0.525);                    // muzzle brake
  dBox(g, dk, 0.020, 0.012, 0.42, 0, 0.042, -0.10);                // top rail
  dBox(g, st, 0.006, 0.030, 0.008, 0, 0.060, -0.325);              // front sight post
  dBox(g, st, 0.022, 0.024, 0.014, 0, 0.056, 0.085);               // rear sight
  dBox(g, po, 0.006, 0.014, 0.016, 0, 0.074, 0.085);
  dTube(g, st, 0.013, 0.20, 0, 0.012, 0.21);                       // buffer tube
  dBox(g, po, 0.040, 0.085, 0.16, 0, -0.006, 0.26);                // stock
  dBox(g, po, 0.042, 0.020, 0.05, 0, -0.050, 0.32);
  dBox(g, po, 0.034, 0.095, 0.042, 0, -0.078, 0.075, 0.30);        // grip
  dBox(g, dk, 0.006, 0.030, 0.050, 0, -0.045, 0.030);              // trigger guard
  dBox(g, dk, 0.012, 0.016, 0.040, 0.028, 0.012, 0.06);            // ejection port cover
  const mag = dBox(g, dk, 0.026, 0.14, 0.060, 0, -0.105, -0.045, -0.16);
  return { g, grip: [0, -0.085, 0.085], fore: [0, -0.035, -0.24], mag, magAt: [0, -0.18, -0.03] };
}
function drawSniper(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY(), gl = M_GLASS();
  dBox(g, po, 0.046, 0.060, 0.50, 0, -0.012, 0.05);                // chassis
  dBox(g, dk, 0.040, 0.044, 0.20, 0, 0.022, 0.00);                 // action
  dTube(g, st, 0.012, 0.46, 0, 0.022, -0.33);                      // heavy barrel
  dTube(g, dk, 0.019, 0.07, 0, 0.022, -0.585);                     // brake
  dTube(g, dk, 0.026, 0.26, 0, 0.082, -0.02);                      // scope tube
  dTube(g, dk, 0.034, 0.07, 0, 0.082, -0.17);
  dTube(g, dk, 0.031, 0.05, 0, 0.082, 0.12);
  dTube(g, gl, 0.030, 0.004, 0, 0.082, -0.206);                    // objective lens
  dBox(g, dk, 0.016, 0.030, 0.022, 0, 0.050, -0.08); dBox(g, dk, 0.016, 0.030, 0.022, 0, 0.050, 0.06);   // rings
  dTube(g, st, 0.007, 0.05, 0.036, 0.022, 0.07); dTube(g, st, 0.012, 0.016, 0.062, 0.016, 0.07);          // bolt handle
  dBox(g, po, 0.042, 0.095, 0.20, 0, -0.022, 0.38);                // stock
  dBox(g, po, 0.036, 0.022, 0.12, 0, 0.034, 0.36);                 // cheek rest
  dBox(g, po, 0.034, 0.10, 0.042, 0, -0.085, 0.14, 0.28);          // grip
  dBox(g, dk, 0.006, 0.060, 0.006, -0.02, -0.07, -0.30, 0, 0.25); dBox(g, dk, 0.006, 0.060, 0.006, 0.02, -0.07, -0.30, 0, -0.25);   // bipod, folded
  const mag = dBox(g, dk, 0.028, 0.075, 0.075, 0, -0.075, 0.01);
  return { g, grip: [0, -0.09, 0.15], fore: [0, -0.05, -0.16], mag, magAt: [0, -0.12, 0.01] };
}
function drawShotgun(){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY2(), wd = M_WOOD();
  dBox(g, dk, 0.044, 0.062, 0.22, 0, 0.000, 0.02);                 // receiver
  dTube(g, st, 0.013, 0.44, 0, 0.016, -0.30);                      // barrel
  dTube(g, st, 0.012, 0.36, 0, -0.016, -0.26);                     // tube magazine under it
  dBox(g, st, 0.010, 0.040, 0.012, 0, 0.000, -0.43);               // the band that joins them
  dBox(g, wd, 0.046, 0.044, 0.15, 0, -0.018, -0.20);               // pump
  for (let i = 0; i < 4; i++) dBox(g, po, 0.048, 0.008, 0.012, 0, -0.018, -0.15 - i * 0.03);
  dBox(g, st, 0.006, 0.014, 0.006, 0, 0.034, -0.51);               // bead
  dBox(g, wd, 0.038, 0.070, 0.24, 0, -0.022, 0.26, -0.10);         // stock
  dBox(g, wd, 0.034, 0.085, 0.040, 0, -0.060, 0.11, 0.42);         // grip
  dBox(g, dk, 0.006, 0.028, 0.050, 0, -0.045, 0.055);
  const mag = dBox(g, M_RED(), 0.018, 0.018, 0.055, 0, -0.050, -0.02);   // the shell in your hand on a reload
  mag.visible = false;
  return { g, grip: [0, -0.07, 0.12], fore: [0, -0.045, -0.20], mag, magAt: [0, -0.05, -0.02], shell: true };
}
function drawPistol(heavy){
  const g = new THREE.Group(), st = M_STEEL(), dk = M_DARK(), po = M_POLY();
  const L = heavy ? 0.21 : 0.19;
  dBox(g, heavy ? st : dk, 0.030, 0.034, L, 0, 0.022, -0.02);      // slide
  for (let i = 0; i < 5; i++) dBox(g, po, 0.032, 0.026, 0.004, 0, 0.022, 0.040 + i * 0.008);   // its serrations
  dBox(g, po, 0.028, 0.026, L - 0.03, 0, -0.006, -0.03);           // frame
  dTube(g, st, 0.007, 0.03, 0, 0.022, -0.02 - L / 2);              // barrel, just showing
  if (heavy) dBox(g, dk, 0.024, 0.018, 0.05, 0, -0.022, -0.085);   // a rail under the heavy one
  dBox(g, st, 0.005, 0.012, 0.006, 0, 0.045, -0.105);              // front sight
  dBox(g, st, 0.020, 0.012, 0.008, 0, 0.045, 0.065);               // rear sight
  dBox(g, po, 0.029, 0.105, 0.045, 0, -0.065, 0.040, 0.20);        // grip
  dBox(g, po, 0.005, 0.026, 0.045, 0, -0.030, -0.005);             // trigger guard
  const mag = dBox(g, dk, 0.022, 0.10, 0.034, 0, -0.068, 0.041, 0.20);
  return { g, grip: [0, -0.07, 0.045], fore: [-0.012, -0.085, 0.035], mag, magAt: [0, -0.13, 0.05] };
}

/* ---- the arms ----
   A glove and a forearm running back out of view toward where the elbow
   would be. Built with its origin AT THE HAND, so moving the group moves
   the hand and the arm follows. */
function drawArm(elbow){
  const g = new THREE.Group(), e = new THREE.Vector3().fromArray(elbow).normalize();
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.050, 0.082), M_GLOVE()); hand.frustumCulled = false; g.add(hand);
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.018, 0.030), M_RED()); knuckle.position.set(0, 0.022, -0.02); knuckle.frustumCulled = false; g.add(knuckle);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.031, 0.46, 10), M_SLEEVE());
  fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e); fore.position.copy(e).multiplyScalar(0.25); fore.frustumCulled = false; g.add(fore);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), M_GLOVE());
  cuff.quaternion.copy(fore.quaternion); cuff.position.copy(e).multiplyScalar(0.05); cuff.frustumCulled = false; g.add(cuff);
  return g;
}

/* Put a drawn gun, and two arms, in a weapon slot. */
const VM_RIGS = [];
function mountGun(slot, built){
  const holder = weaponHolders[slot];
  while (holder.children.length) holder.remove(holder.children[0]);
  const rig = new THREE.Group(); rig.position.set(0.02, -0.03, 0.05); rig.add(built.g); holder.add(rig);
  const right = drawArm([0.30, -0.34, 0.89]); right.position.fromArray(built.grip); rig.add(right);
  const left  = drawArm([-0.66, -0.30, 0.69]); left.position.fromArray(built.fore); rig.add(left);
  VM_RIGS[slot] = { left, mag: built.mag, shell: !!built.shell,
    fore: new THREE.Vector3().fromArray(built.fore), magAt: new THREE.Vector3().fromArray(built.magAt),
    magHome: built.mag ? built.mag.position.clone() : null };
  WEAPONS[slot].aimTop = centrelineTop(rig, 0.03);
}
[drawRifle(), drawSniper(), drawShotgun(), drawPistol(false), drawPistol(true)].forEach((b, i) => mountGun(i, b));
/* The abilities and the blade keep their own drawn shapes (weapons.js);
   they just get a hand to be held in. */
for (let i = 5; i < weaponHolders.length; i++){
  const right = drawArm([0.42, -0.50, 0.76]); right.position.set(0.03, -0.11, 0.14); weaponHolders[i].add(right);
}

/* The reload, as the left hand sees it: off the fore-end, down to the
   magazine, out with it, back up with a fresh one, home. The timing is a
   share of whatever the reload actually takes, so a faster reload (Blast's
   zone) is the same motion done quicker. A pump gun feeds shells one at a
   time, so its hand makes the trip three times instead. Called each frame. */
const _armA = new THREE.Vector3(), _armB = new THREE.Vector3();
function armsFrame(){
  const r = VM_RIGS[currentWeapon]; if (!r) return;
  let p = -1;
  if (reloading) p = Math.min(1, (performance.now() - reloadStart) / reloadMsNow(curW()));
  if (p < 0 || p >= 1){ r.left.position.copy(r.fore); if (r.mag){ r.mag.position.copy(r.magHome); r.mag.visible = !r.shell; } return; }
  const ease = (t) => t * t * (3 - 2 * t), seg = (a, b) => ease(Math.max(0, Math.min(1, (p - a) / (b - a))));
  const down = _armB.copy(r.magAt); down.y -= 0.16; down.z += 0.03;
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
   The body everyone plays: armour over a dark undersuit, a helmet with a
   lit visor in the player's colour. Faces +Z. The four limbs are groups
   pivoted at the shoulder and the hip, which is all the loop needs to make
   it walk — the old model was one rigid statue that slid across the floor. */
const OP_MATS = {};
function opMat(key, color, metalness, roughness, extra){
  if (OP_MATS[key]) return OP_MATS[key];
  const m = rimPatch(new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra || {})));
  m.userData.envK = 0.9;
  return (OP_MATS[key] = lookTag(m, { metalness, roughness }, { metalness: 0, roughness }));
}
function makeOperator(accent){
  const g = new THREE.Group();
  const suit = opMat('suit', 0x1a1d21, 0.0, 0.82), plate = opMat('plate', 0x3a4048, 0.45, 0.48), dark = opMat('pdark', 0x23272c, 0.4, 0.5);
  const acc = opMat('acc' + accent, accent, 0.2, 0.45), vis = opMat('vis' + accent, 0x0a0c0f, 0.7, 0.15, { emissive: new THREE.Color(accent), emissiveIntensity: 0.9 });
  const P = (parent, m, geo, x, y, z, rx, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; parent.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (r0, r1, h, n) => new THREE.CylinderGeometry(r0, r1, h, n || 10);
  // trunk
  P(g, suit, C(0.165, 0.150, 0.26), 0, 0.92, 0);                       // hips
  P(g, dark, B(0.36, 0.085, 0.24), 0, 0.99, 0);                        // belt
  for (const sx of [-1, 1]) P(g, dark, B(0.075, 0.10, 0.06), sx * 0.15, 0.95, 0.12);   // pouches
  P(g, suit, C(0.205, 0.165, 0.34), 0, 1.20, 0);                       // waist to ribs
  P(g, plate, B(0.40, 0.30, 0.25), 0, 1.40, 0.012);                    // chest plate
  P(g, plate, B(0.30, 0.16, 0.05), 0, 1.36, 0.145);                    // its front panel
  P(g, acc, B(0.10, 0.022, 0.012), -0.09, 1.47, 0.172);                // a stripe of the player's colour
  P(g, dark, B(0.30, 0.34, 0.11), 0, 1.36, -0.165);                    // pack
  P(g, dark, C(0.05, 0.05, 0.26, 8), 0.10, 1.52, -0.19);               // and its canister
  P(g, suit, C(0.062, 0.070, 0.09), 0, 1.585, 0);                      // neck
  // head: fitted to the head hitbox, a sphere of 0.19 at 1.70
  P(g, plate, new THREE.SphereGeometry(0.150, 18, 12), 0, 1.71, 0).scale.set(1, 1.08, 1.12);
  P(g, vis, B(0.200, 0.078, 0.10), 0, 1.722, 0.135);                   // visor: proud of the helmet, or the shell swallows its middle and leaves two eyes
  P(g, dark, B(0.215, 0.050, 0.24), 0, 1.650, 0.035);                  // jaw guard
  P(g, dark, B(0.035, 0.10, 0.11), -0.150, 1.70, 0); P(g, dark, B(0.035, 0.10, 0.11), 0.150, 1.70, 0);   // ear pieces
  P(g, dark, B(0.05, 0.03, 0.22), 0, 1.865, -0.01);                    // crest
  // limbs, each a group pivoted at its joint with the limb hanging below
  const limbG = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
  const arm = (sx) => { const p = limbG(sx * 0.255, 1.50, 0);
    P(p, plate, new THREE.SphereGeometry(0.092, 12, 8), 0, 0, 0).scale.set(1.05, 0.85, 1.1);     // pauldron
    P(p, acc, B(0.012, 0.05, 0.10), sx * 0.094, -0.01, 0);
    P(p, suit, C(0.060, 0.052, 0.30), 0, -0.17, 0);                    // upper arm
    P(p, plate, C(0.058, 0.050, 0.25), 0, -0.44, 0.02);                // forearm guard
    P(p, dark, B(0.075, 0.085, 0.085), 0, -0.60, 0.03);                // glove
    return p; };
  const leg = (sx) => { const p = limbG(sx * 0.105, 0.86, 0);
    P(p, suit, C(0.092, 0.075, 0.42), 0, -0.21, 0);                    // thigh
    P(p, plate, B(0.13, 0.20, 0.05), 0, -0.20, 0.075);                 // thigh plate
    P(p, dark, new THREE.SphereGeometry(0.070, 10, 8), 0, -0.44, 0.03);// knee
    P(p, plate, C(0.072, 0.058, 0.36), 0, -0.63, 0);                   // shin
    P(p, dark, B(0.115, 0.095, 0.27), 0, -0.815, 0.045);               // boot
    return p; };
  const la = arm(-1), ra = arm(1), ll = leg(-1), rl = leg(1);
  // a rifle in the right hand, carried low
  const rifle = new THREE.Group(); rifle.position.set(0, -0.58, 0.16); ra.add(rifle);
  P(rifle, M_DARK(), B(0.05, 0.075, 0.42), 0, 0, 0.05); P(rifle, M_POLY(), B(0.04, 0.09, 0.16), 0, -0.01, -0.22);
  P(rifle, M_STEEL(), C(0.012, 0.012, 0.22, 8), 0, 0.01, 0.36, Math.PI / 2); P(rifle, M_DARK(), B(0.026, 0.12, 0.05), 0, -0.09, 0.08);
  ra.rotation.x = -0.28; la.rotation.x = -0.10;
  /* Only the big pieces cast a shadow. Forty small parts each drawn a second
     time into the shadow map, for eight bodies, is most of a frame; the
     trunk and the limbs make the same shadow on the floor. */
  g.traverse(o => { if (o.isMesh){ const p = o.geometry.parameters || {}; o.castShadow = (p.height || p.radius || 0) >= 0.25; } });
  g.userData = { la, ra, ll, rl, walk: 0 };
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
