/* =============================================================
   Elite Force — salvo.js  (unnumbered: after silvars.js, before hud.js)

   SALVO on the client (Jack, 2026-11-28; PLAN-characters.md section 4).
   The rules and numbers are SALVO in robots.js, shared with the server.

   - G, the composite incendiary, is a WEAPONS slot (INCEN) and is thrown by
     the grenade code in input.js / effects.js; right-click (the `ricochet`
     flag) switches it to a frag. This file only builds its look.
   - V, the shell barrage, is AIM AND PRESS: V shows a ring where you aim,
     V again or left-click calls it in, right-click or Esc calls it off.
     Everyone sees the circle and hears the whistle for SALVO.barrage.warnMs.
   - X, the missile: you fly it through its own camera with the mouse for up
     to lifeMs, standing still meanwhile. In a match it is a robot on the
     server (so it can be shot down) and you report where it is; on the
     range it is all here.
   - The passive (blast- and fireproof) is the server's (blastMul).
   ============================================================= */

const salvo = { barrageAt: 0, missileAt: 0, aiming: false, aimOk: false, aimPt: null, missile: null };
function salvoReset(){
  salvo.barrageAt = 0; salvo.missileAt = 0; salvoAimOff(); missileEnd(true);
  for(const w of barrageWarns) scene.remove(w.g); barrageWarns.length = 0;
  for(const b of barrageShells) scene.remove(b.mesh); barrageShells.length = 0;
}
/* the server's word on Salvo's timers (ms from now) */
function onSalvoTimers(d){
  const now = performance.now();
  if(d && d.barrage !== undefined) salvo.barrageAt = now + d.barrage;
  if(d && d.missile !== undefined && !salvo.missile) salvo.missileAt = now + d.missile;
}
const cdFree = () => training('noCooldown');

/* ---------- looks ---------- */
const SALVO_RED = 0xd8361a, SALVO_DARK = 0x2a2522;
/* The gear is drawn like the guns (drawn.js, 2026-11-28, Jack: "improve the
   model for the vgx ... to be more detailed and look better"): the PAC-9's
   finishes and detail shader, profiles given thickness, screws, stencils,
   real sizes. */
const M_INCGREY = () => dmatL('incgrey', [0.070, 0.073, 0.074], 0.35, 0.50, 0);   // painted steel can
const M_LRED    = () => dmatL('lred',    [0.42, 0.045, 0.02], 0.05, 0.52, 2, 0.6);   // incendiary red
const M_MSL     = () => dmatL('msl',     [0.17, 0.18, 0.18], 0.30, 0.46, 0);      // the missile's light grey
/* G: a composite incendiary, AN-M14 style. Real size (63mm across, 120mm
   tall), fuze up (+Y), spoon down the +Z side, centred on its body - the
   frag's own conventions, so it is held and thrown the same way. */
function makeIncenMesh(){
  const g = new THREE.Group(), can = M_INCGREY(), st = M_STEEL(), red = M_LRED(), dk = M_DARK();
  const R = 0.0315, H = 0.118;
  dAdd(g, new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 30), can));
  for (const y of [H / 2, -H / 2]){                                     // rolled seams top and bottom
    const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.0006, 0.0018, 6, 30), st); t.rotation.x = Math.PI / 2; t.position.y = y; dAdd(g, t); }
  for (const y of [0.026, -0.036]){                                     // the two red bands
    const b = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0006, R + 0.0006, 0.013, 30, 1, true), red); b.position.y = y; b.material.side = THREE.DoubleSide; dAdd(g, b); }
  /* the top: a recessed lid, four sealed filler vents round the fuze */
  { const lid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.004, R - 0.004, 0.003, 28), st); lid.position.y = H / 2 + 0.0005; dAdd(g, lid); }
  for (let k = 0; k < 4; k++){
    const a = k * Math.PI / 2 + Math.PI / 4, v = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.0016, 10), red);
    v.position.set(Math.cos(a) * 0.019, H / 2 + 0.0022, Math.sin(a) * 0.019); dAdd(g, v); }
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.003, R - 0.003, 0.002, 28), dk); base.position.y = -H / 2 - 0.0008; dAdd(g, base); }
  /* the fuze: body, striker housing, the spoon's pivot lugs */
  const top = H / 2;
  { const fz = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0125, 0.020, 14), st); fz.position.y = top + 0.011; dAdd(g, fz);
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0105, 0.008, 14), st); hd.position.y = top + 0.025; dAdd(g, hd);
    for (const s of [-1, 1]) dBox(g, st, 0.002, 0.008, 0.008, s * 0.0075, top + 0.026, 0.006); }
  /* the spoon: over the fuze head and straight down the +Z side */
  { const pts = [[0, top + 0.029, 0.003], [0, top + 0.030, 0.012], [0, top + 0.018, 0.026], [0, top + 0.004, R + 0.003], [0, -0.01, R + 0.0035], [0, -0.03, R + 0.003]];
    for (let i = 0; i < pts.length - 1; i++){
      const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0022, a.distanceTo(b) + 0.002), st);
      seg.position.copy(a).add(b).multiplyScalar(0.5); seg.lookAt(b); dAdd(g, seg); } }
  /* pin and pull ring on the -X side, the safety clip */
  { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 6), st); pin.rotation.z = Math.PI / 2; pin.position.set(-0.004, top + 0.017, 0.004); dAdd(g, pin);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 6, 20), st); ring.position.set(-0.026, top + 0.017, 0.004); ring.rotation.y = Math.PI / 2; dAdd(g, ring);
    const clip = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0012, 5, 16, Math.PI), st); clip.position.set(0, top + 0.006, 0); clip.rotation.x = Math.PI / 2; dAdd(g, clip); }
  /* stencils, running up the side */
  { const d = dDecal(g, 'GRENADE INCEN TH3', R + 0.0004, -0.004, -0.004, 0.072, 0.0075, 1); d.rotation.set(0, Math.PI / 2, Math.PI / 2);
    const e = dDecal(g, 'AN-M14  LOT EF-28', 0.0012, -0.004, -R - 0.0004, 0.072, 0.0062, 1); e.rotation.set(0, Math.PI, Math.PI / 2); }
  return g;
}
/* X's round in flight: a loitering munition. Points down -Z like everything
   that flies; about 0.9m long, which is what the server's hit sphere fits. */
function makeMissileMesh(){
  const g = new THREE.Group(), body = M_MSL(), dk = M_DARK(), st = M_STEEL(), red = M_LRED();
  const R = 0.075, Z0 = -0.30, Z1 = 0.40;                                // body from the nose join to the tail
  dTube(g, body, R, Z1 - Z0, 0, 0, (Z0 + Z1) / 2, R, 24);
  /* an ogive nose, a glass seeker in its tip */
  { const pts = []; for (let i = 0; i <= 10; i++){ const t = i / 10; pts.push(new THREE.Vector2(R * Math.sqrt(1 - t * t) + 0.0001, t * 0.2)); }
    const n = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), body); n.rotation.x = -Math.PI / 2; n.position.z = Z0; dAdd(g, n);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), M_GLASS()); s.position.z = Z0 - 0.17; dAdd(g, s); }
  /* bands: red behind the nose (live warhead), a dark joint, the tail ring */
  dTube(g, red, R + 0.001, 0.035, 0, 0, Z0 + 0.03, R + 0.001, 24);
  for (const z of [Z0 + 0.16, Z0 + 0.42]) dTube(g, dk, R + 0.0015, 0.008, 0, 0, z, R + 0.0015, 24);
  for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4; dScrew(g, Math.cos(a) * (R + 0.001), Math.sin(a) * (R + 0.001), Z0 + 0.15, 'x', 0.004).rotation.set(0, 0, a - Math.PI / 2); }
  /* fins: four canards, two long scissor wings, four swept tail fins */
  const fin = (pts, z, k, th) => { const f = new THREE.Group(); f.rotation.z = k; f.position.z = z; dProf(f, dk, pts, th, 0.002, 0, 0, 0); dAdd(g, f); };
  for (let k = 0; k < 4; k++) fin([[0.02, R], [-0.03, R], [-0.04, R + 0.055], [0.0, R + 0.055]], Z0 + 0.07, k * Math.PI / 2 + Math.PI / 4, 0.006);
  for (const s of [-1, 1]){ const w = new THREE.Group(); w.rotation.z = s * Math.PI / 2; w.position.z = -0.02; dAdd(g, w);
    dProf(w, body, [[0.05, R - 0.01], [-0.05, R - 0.01], [-0.10, R + 0.36], [-0.03, R + 0.36]], 0.008, 0.002, 0, 0, 0); }
  for (let k = 0; k < 4; k++) fin([[0.02, R], [-0.10, R], [-0.12, R + 0.11], [-0.07, R + 0.11]], Z1 - 0.02, k * Math.PI / 2 + Math.PI / 4, 0.007);
  /* the motor: a steel nozzle, dark inside */
  dTube(g, st, 0.05, 0.07, 0, 0, Z1 + 0.035, 0.042, 18);
  dTube(g, dk, 0.039, 0.002, 0, 0, Z1 + 0.071, 0.039, 18);
  dDecal(g, 'EF LM-2  LOITERING MUNITION', -R - 0.0015, 0.02, 0.06, 0.26, 0.022, -1);
  /* its flame: a hot core inside a long soft plume */
  const flame = new THREE.Group(); flame.position.z = Z1 + 0.07; g.add(flame);
  { const o = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    o.rotation.x = Math.PI / 2; o.position.z = 0.3; flame.add(o);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.24, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    c.rotation.x = Math.PI / 2; c.position.z = 0.12; flame.add(c); }
  g.userData = { kind: 'missile', flame };
  return g;
}
/* V's shells, seen coming in: a 155mm high-explosive round, nose down -Z,
   drawn at 1.3x so it reads from across the site in the second it falls. */
function makeShellMesh(){
  const g = new THREE.Group(), od = M_OD(), st = M_STEEL(), br = M_BRASS(), dk = M_DARK();
  const R = 0.078, Z0 = -0.16, Z1 = 0.26;
  dTube(g, od, R, Z1 - Z0, 0, 0, (Z0 + Z1) / 2, R, 24);
  { const pts = []; for (let i = 0; i <= 10; i++){ const t = i / 10; pts.push(new THREE.Vector2(R * Math.sqrt(1 - t * t) * (1 - 0.72 * t * t) + 0.012 * t, t * 0.26)); }
    const n = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), od); n.rotation.x = -Math.PI / 2; n.position.z = Z0; dAdd(g, n); }
  dTube(g, st, 0.016, 0.05, 0, 0, Z0 - 0.275, 0.006, 14);              // the fuze
  dTube(g, M_YEL(), R + 0.0008, 0.03, 0, 0, Z0 + 0.03, R + 0.0008, 24); // HE: a yellow band
  dTube(g, br, R + 0.004, 0.03, 0, 0, Z1 - 0.05, R + 0.004, 24);       // the driving band
  dTube(g, od, R, 0.06, 0, 0, Z1 + 0.03, R * 0.82, 24);                // boat tail
  dTube(g, dk, R * 0.8, 0.003, 0, 0, Z1 + 0.061, R * 0.8, 20);
  dDecal(g, '155MM HE M107', -R - 0.001, 0, 0.06, 0.16, 0.024, -1);
  /* a faint trail of hot air behind it */
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 4, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xd8d0c4, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  trail.rotation.x = Math.PI / 2; trail.position.z = Z1 + 2.1; g.add(trail);
  g.scale.setScalar(1.3);
  return g;
}
const barrageShells = [], SHELL_FALL_MS = 1100;
/* one round on its way: seen for the last SHELL_FALL_MS, from high up and
   off to one side, to the spot it lands on at `at` */
function addBarrageShell(x, y, z, at, from){
  const a = from + (Math.random() - 0.5) * 0.6, mesh = makeShellMesh(); mesh.visible = false; scene.add(mesh);
  barrageShells.push({ mesh, x, y, z, sx: x + Math.cos(a) * 22, sy: y + 70, sz: z + Math.sin(a) * 22, t0: at - SHELL_FALL_MS, t1: at });
}
function updateBarrageShells(now){
  for (let i = barrageShells.length - 1; i >= 0; i--){
    const s = barrageShells[i];
    if (now >= s.t1){ scene.remove(s.mesh); barrageShells.splice(i, 1); continue; }
    if (now < s.t0) continue;
    const k = (now - s.t0) / (s.t1 - s.t0);
    s.mesh.visible = true;
    s.mesh.position.set(s.sx + (s.x - s.sx) * k, s.sy + (s.y - s.sy) * k, s.sz + (s.z - s.sz) * k);
    s.mesh.lookAt(s.sx, s.sy, s.sz);                                    // +Z back up the path: the nose leads
  }
}

/* ---------- blasts on the range ----------
   The same falloff as the server (robots.js blastDamage), the same rule
   that a wall between the blast and a chest stops it. */
const _sray = new THREE.Raycaster();
function localBlast(x, y, z, cfg){
  boom(x, y, z);
  const o = new THREE.Vector3(x, y + 0.25, z);
  for(const b of localBots){
    if(!b.alive) continue;
    const chest = new THREE.Vector3(b.x, 1.05, b.z), d = chest.distanceTo(o);
    const dmg = blastDamage(cfg, d); if(!dmg) continue;
    _sray.set(o, chest.clone().sub(o).normalize()); _sray.far = d;
    if(_sray.intersectObjects(wallMeshes, false).length) continue;      // cover took it
    b.hp -= dmg; hitmark(dmg >= cfg.dmg ? 'head' : 'torso'); Sfx.hit(dmg >= cfg.dmg ? 'head' : 'torso');
    if(b.hp <= 0 && b.alive){ b.alive = false; b.mesh.visible = false; extinguish(b);
      localKills++; creditKill(); updateHUD(); setTimeout(() => respawnLocalBot(b), 2000); }
  }
}
function localMissileBlast(x, y, z){
  const M = SALVO.missile;
  localBlast(x, y, z, M.blast);
  for(let k = 0; k < M.bomblets; k++){
    const a = (k / M.bomblets) * Math.PI * 2 + Math.random() * 0.6, r = M.spread * (0.6 + Math.random() * 0.4);
    setTimeout(() => localBlast(x + Math.cos(a) * r, y, z + Math.sin(a) * r, M.bomb), M.bombletMs + k * 60);
  }
}

/* ---------- V: the barrage, aimed and pressed ---------- */
let barrageRing = null;
function barrageAimPoint(){
  /* where the crosshair meets the world: the nearest of the map's surfaces
     and the floor, within the barrage's range of where you stand */
  const o = camera.position.clone(), dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(me.pitch, me.yaw, 0, 'YXZ'));
  _sray.set(o, dir); _sray.far = SALVO.barrage.range + 40;
  const hit = _sray.intersectObjects(wallMeshes, false)[0];
  let p = hit ? hit.point.clone() : null;
  if(dir.y < -0.01){ const t = -o.y / dir.y; if(!p || t < hit.distance) p = o.clone().addScaledVector(dir, t); }
  if(!p) return { ok: false, p: o.clone().addScaledVector(dir, 20) };
  return { ok: Math.hypot(p.x - me.x, p.z - me.z) <= SALVO.barrage.range, p };
}
function barrageKey(){
  if(gameState !== 'playing' || !me.alive) return;
  const now = performance.now();
  if(salvo.aiming){ salvoAimOff(); Sfx.swap(); return; }   // V again calls it off (Jack, 2026-11-28); left-click calls it in
  if(now < salvo.barrageAt && !cdFree()){ Sfx.empty(); return; }
  salvo.aiming = true;
  if(!barrageRing){
    barrageRing = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(SALVO.barrage.radius - 0.25, SALVO.barrage.radius, 64),
      new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; barrageRing.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), ring.material); dot.rotation.x = -Math.PI / 2; barrageRing.add(dot);
    barrageRing.userData.mat = ring.material; barrageRing.renderOrder = 10;
  }
  scene.add(barrageRing); Sfx.swap();
}
function salvoAimOff(){ salvo.aiming = false; if(barrageRing) scene.remove(barrageRing); }
function barrageConfirm(){
  const a = barrageAimPoint(); salvoAimOff();
  if(!a.ok){ Sfx.empty(); return; }
  const B = SALVO.barrage, now = performance.now();
  salvo.barrageAt = cdFree() ? 0 : now + B.cdMs;
  if(gameMode === 'mp'){ if(socket) socket.emit('barrage', { x: a.p.x, y: a.p.y, z: a.p.z }); return; }
  // the range: the same warning and the same six shells, here
  const shells = [];
  for(let k = 0; k < B.shells; k++){
    const ang = Math.random() * Math.PI * 2, r = B.radius * Math.sqrt(Math.random());
    shells.push([Math.cos(ang) * r, Math.sin(ang) * r, B.warnMs + (k / (B.shells - 1)) * B.spanMs]);
  }
  onBarrage({ x: a.p.x, y: a.p.y, z: a.p.z, ms: B.warnMs, span: B.spanMs, r: B.radius, by: 'me', shells });
  for(const sh of shells) setTimeout(() => localBlast(a.p.x + sh[0], a.p.y, a.p.z + sh[1], B.blast), sh[2]);
}
/* everyone's warning: a pulsing circle where it will land, and the whistle */
const barrageWarns = [];
function onBarrage(d){
  if(!d) return;
  const g = new THREE.Group(); g.position.set(d.x, (d.y || 0) + 0.06, d.z);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(d.r - 0.35, d.r, 64), mat); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(d.r, 48), new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.12, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; g.add(fill);
  scene.add(g);
  const until = performance.now() + d.ms + d.span + 300;
  barrageWarns.push({ g, mat, fill, until });
  Sfx.whistle({ x: d.x, z: d.z });
  /* the shells themselves, each seen falling in the second before it lands */
  const t0 = performance.now(), from = Math.random() * Math.PI * 2;
  for(const sh of (d.shells || [])) addBarrageShell(d.x + sh[0], d.y || 0, d.z + sh[1], t0 + sh[2], from);
  if(d.by === myId || d.by === 'me'){ if(d.by === myId) salvo.barrageAt = cdFree() ? 0 : performance.now() + SALVO.barrage.cdMs; }
}

/* ---------- X: the missile ----------
   Like Uluru's loitering munition (Jack, 2026-11-28): X takes the LAUNCHER
   out (a WEAPONS slot, MISSILE). Fired from the hip it flies straight down
   your aim on its own ("preset guidance") and you keep moving; right-click
   to aim first and it is guided - you fly it through its own camera and
   stand still while you do. Either way it is the same missile (a robot on
   the server, so it can be shot down). */
const missileOn = () => !!(salvo.missile && salvo.missile.guided);   // camera, mouse and feet belong to it
const missileReady = () => !salvo.missile && (performance.now() >= salvo.missileAt || cdFree());
/* X: the shoulder launcher, drawn like a gun and mounted like one
   (mountGun), so it is held in both gloves and aimed through its sight.
   The SIGHT is on the gun's centreline (x 0), where the eye looks when
   aiming; the tube rides to its right, as a real shoulder launcher's does
   (the eye beside the tube, not on it). Points down -Z. */
function drawLauncher(){
  const g = new THREE.Group(), od = M_OD(), dk = M_DARK(), po = M_POLY(), p2 = M_POLY2(), red = M_LRED();
  const TX = 0.068, TY = -0.045, R = 0.045;
  const t = new THREE.Group(); t.position.set(TX, TY, 0); dAdd(g, t);   // the tube's own frame: its axis is x 0, y 0
  dTube(t, od, R, 0.96, 0, 0, -0.07, R, 28);                            // the launch tube, z -0.55 .. 0.41
  for (const z of [-0.47, -0.30, -0.02, 0.22]){                         // reinforcing bands, screwed on
    dTube(t, dk, R + 0.003, 0.022, 0, 0, z, R + 0.003, 28);
    dScrew(t, -R - 0.0032, 0, z, 'x', 0.0026); dScrew(t, R + 0.0032, 0, z, 'x', 0.0026); }
  dTube(t, M_YEL(), R + 0.001, 0.012, 0, 0, -0.40, R + 0.001, 28);      // a live round inside
  dTube(t, red, R + 0.001, 0.03, 0, 0, 0.35, R + 0.001, 28);             // the backblast band
  /* the muzzle, and the round's seeker looking out of it */
  dTube(t, dk, R + 0.006, 0.04, 0, 0, -0.53, R + 0.006, 28);
  dTube(t, po, R - 0.003, 0.002, 0, 0, -0.507, R - 0.003, 24);
  dTube(t, red, 0.036, 0.012, 0, 0, -0.512, 0.036, 20);
  { const s = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 10), M_GLASS()); s.position.z = -0.52; s.scale.z = 0.7; dAdd(t, s); }
  /* the venturi at the back, flared, dark inside */
  dTube(t, dk, R + 0.002, 0.11, 0, 0, 0.46, 0.062, 28);
  dTube(t, po, 0.056, 0.002, 0, 0, 0.513, 0.056, 24);
  /* a rail on top at the front, a carry handle at the back */
  dRail(t, dk, R - 0.003, -0.36, -0.20);
  dProf(t, dk, [[-0.06, R - 0.004], [-0.07, R + 0.024], [-0.17, R + 0.024], [-0.18, R - 0.004], [-0.164, R - 0.004],
                [-0.157, R + 0.013], [-0.083, R + 0.013], [-0.076, R - 0.004]], 0.014, 0.003);
  /* under the tube: trigger housing, pistol grip (the rifle's, set lower),
     guard and trigger, a ribbed fore pad, the shoulder rest behind */
  dProf(t, p2, [[0.07, -R + 0.006], [-0.08, -R + 0.006], [-0.08, -R - 0.025], [0.07, -R - 0.025]], 0.036, 0.004);
  dProf(t, po, [[-0.002, -0.07], [-0.04, -0.074], [-0.068, -0.164], [-0.026, -0.17], [-0.01, -0.104]], 0.032, 0.006);
  dProf(t, dk, [[0.04, -0.07], [-0.002, -0.078], [0.0, -0.106], [0.03, -0.11], [0.048, -0.092]], 0.006, 0.001);
  dBox(t, M_STEEL(), 0.005, 0.022, 0.006, 0, -0.084, -0.02, 0.3);
  dProf(t, po, [[0.31, -R + 0.006], [0.19, -R + 0.006], [0.19, -R - 0.012], [0.31, -R - 0.012]], 0.05, 0.005);
  for (let i = 0; i < 6; i++) dBox(t, p2, 0.052, 0.004, 0.006, 0, -R - 0.012, -0.205 - i * 0.019);
  dProf(t, po, [[-0.12, -R + 0.006], [-0.30, -R + 0.006], [-0.31, -R - 0.03], [-0.27, -R - 0.042], [-0.14, -R - 0.028]], 0.05, 0.008);
  /* the fire-control unit on the left of the tube, its little screen lit */
  dBox(t, p2, 0.018, 0.046, 0.08, R + 0.007, 0.004, 0.08);
  dBox(t, new THREE.MeshBasicMaterial({ color: 0xff8a3a }), 0.0012, 0.018, 0.03, R + 0.0165, 0.012, 0.07);
  for (const z of [0.105, 0.115]) dKnob(t, dk, 0.003, 0.004, R + 0.017, -0.01, z, 'x');
  /* stencils */
  dDecal(t, 'EF LM-2  LAUNCHER', -R - 0.0015, -0.024, -0.12, 0.17, 0.011, -1);
  dDecal(t, 'BACKBLAST AREA', -R - 0.0015, 0.024, 0.30, 0.10, 0.009, -1);
  /* THE SIGHT: a reflex window on a bracket off the tube's left side. The
     game's own red dot (camera-fixed, where the shot goes) sits in it. */
  const SY = 0.024;                                                     // the sight rides high, so you look over the tube
  dBox(g, dk, 0.03, 0.044, 0.05, 0.012, -0.018, -0.125);               // riser bracket off the tube
  dScrew(g, -0.0032, -0.02, -0.11, 'x'); dScrew(g, -0.0032, -0.02, -0.14, 'x');
  dBox(g, dk, 0.036, 0.009, 0.064, 0, -0.019 + SY, -0.13);              // base
  dBox(g, dk, 0.036, 0.008, 0.026, 0, -0.011 + SY, -0.135);             // the emitter housing
  for (const s of [-1, 1]) dBox(g, dk, 0.004, 0.034, 0.026, s * 0.016, 0.003 + SY, -0.135);
  dBox(g, dk, 0.036, 0.005, 0.026, 0, 0.0215 + SY, -0.135);
  { const m = new THREE.MeshStandardMaterial({ color: 0x6a8a90, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.6, depthWrite: false });
    lookTag(m, { metalness: 0.6, roughness: 0.05 }, { metalness: 0, roughness: 0.05 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.026), m); pane.position.set(0, 0.006 + SY, -0.147); dAdd(g, pane); }
  dKnob(g, dk, 0.006, 0.009, -0.022, -0.012 + SY, -0.12, 'x');          // brightness
  dKnob(g, dk, 0.005, 0.007, 0, 0.028 + SY, -0.125);                    // and its elevation
  dScrew(g, -0.0182, -0.019 + SY, -0.105, 'x'); dScrew(g, -0.0182, -0.019 + SY, -0.155, 'x');
  return { g, grip: [TX, TY - 0.122, 0.034], fore: [TX, TY - 0.065, -0.25], mag: null, magAt: [TX, -0.2, -0.1],
           aimTop: 0.030,
           vm: { x: 0.11, y: -0.1, z: -0.36, adsZ: 0.1, rx: 0.03, ry: 0.06, rz: -0.03, viewFov: 62, motion: 0.6 } };
}
function makeLauncherMesh(){ return drawLauncher().g; }
mountGun(MISSILE, drawLauncher());
WEAPONS[MISSILE].redDot = true;       // aimed, you look through its sight
/* the held incendiary (G) until the gloves load, where the frag sits */
(function buildIncenHeld(){
  const m = makeIncenMesh(); m.position.set(0, 0, -0.28);
  const g = new THREE.Group(); g.add(m); g.position.set(0.02, -0.04, 0.02);
  weaponHolders[INCEN].add(g);
})();
/* When the PAC-9's gloves arrive (drawn.js gloveEveryGun), Salvo's gear is
   held in them too: the incendiary in the fist like the frag, the launcher
   in both hands like a gun. */
function salvoGlove(b){
  const rOff = b.right.position.clone().sub(new THREE.Vector3().fromArray(PAC9_GRIP));
  const lOff = b.left.position.clone().sub(new THREE.Vector3().fromArray(PAC9_FORE));
  const r = VM_RIGS[MISSILE];
  if (r && r.right.parent){
    const parent = r.right.parent, right = b.right.clone(), left = b.left.clone();
    right.position.copy(r.grip).add(rOff);
    const foreBottom = r.fore.clone(); foreBottom.y += 0.01;
    left.position.copy(foreBottom).add(lOff);
    parent.remove(r.right); parent.remove(r.left); parent.add(right, left);
    r.grip = right.position.clone(); r.fore = left.position.clone(); r.right = right; r.left = left;
  }
  const inc = makeIncenMesh();
  inc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAC9_GRIP_AXIS);   // fuze out of the top of the fist
  inc.position.copy(PAC9_GRIP_AXIS).multiplyScalar(0.032);   // up out of the fist: the can is twice a frag's height
  holdInGlove(INCEN, b, rOff, new THREE.Vector3(0.03, -0.11, 0.14), inc, false, [0, 0, 0]);
  WEAPONS[INCEN].vm = { x: 0.13, y: 0.0, z: -0.32, adsZ: 0, rx: 0, ry: 0, rz: 0, viewFov: 0 };
}
{ const _glove = gloveEveryGun;
  gloveEveryGun = function(b){ _glove(b); salvoGlove(b); };
  if (PAC9_BUILT) salvoGlove(PAC9_BUILT); }
/* the trigger (input.js): aimed means guided */
function missileFire(guided){
  if(gameState !== 'playing' || !me.alive || salvo.missile) return false;
  salvoAimOff();
  const now = performance.now();
  if(now < salvo.missileAt && !cdFree()){ Sfx.empty(); return false; }
  const rgt = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const o = camera.position.clone().addScaledVector(rgt, 0.3); o.y += 0.1;
  const mesh = makeMissileMesh(); scene.add(mesh);
  salvo.missile = { pos: o, yaw: me.yaw, pitch: guided ? Math.max(-0.6, me.pitch) : me.pitch, t: 0, mesh, id: null, sendAcc: 0, seen: false, guided: !!guided };
  salvo.missileAt = now + SALVO.missile.lifeMs + SALVO.missile.cdMs;
  if(guided) document.body.classList.add('missilecam');
  Sfx.launch();
  if(gameMode === 'mp' && socket) socket.emit('missile', { ox: o.x, oy: o.y, oz: o.z, yaw: me.yaw, pitch: me.pitch });
  return true;
}
function onMissileStart(d){
  if(!salvo.missile || !d) return;
  if(d.no){ missileEnd(true); Sfx.empty(); return; }   // the server said no (still on cooldown): it never left
  salvo.missile.id = d.id;
}
/* the mouse flies it while it is out (input.js hands the movement here) */
function steerMissile(dx, dy){
  const m = salvo.missile; if(!m || !m.guided) return;
  const s = 0.0022 * (SETTINGS.sens || 1);
  m.yaw -= dx * s; m.pitch = Math.max(-1.45, Math.min(1.2, m.pitch - dy * s));
}
function missileEnd(quiet){
  const m = salvo.missile; if(!m) return;
  scene.remove(m.mesh); salvo.missile = null;
  document.body.classList.remove('missilecam');
  const lbl = document.getElementById('missileHud'); if(lbl) lbl.style.display = 'none';
  salvo.missileAt = cdFree() ? 0 : performance.now() + SALVO.missile.cdMs;
  if(!quiet) Sfx.swap();
}
function missileDetonate(p){
  const m = salvo.missile; if(!m) return;
  if(gameMode === 'mp'){ if(socket && m.id != null) socket.emit('mboom', { i: m.id, x: p.x, y: p.y, z: p.z }); }
  else localMissileBlast(p.x, p.y, p.z);
  missileEnd(true);
}
function missileBodyHit(o, dir, far){
  /* range targets, or other players' stand-in boxes, stop it too */
  const bodies = gameMode === 'mp' ? [...others.values()].filter(q => q.alive).map(q => q.mesh.position) : localBots.filter(b => b.alive).map(b => ({ x: b.x, y: 0, z: b.z }));
  let best = null;
  for(const p of bodies){
    const h = segBoxHit(o, dir, far, { minx: p.x - 0.45, maxx: p.x + 0.45, miny: (p.y || 0), maxy: (p.y || 0) + 1.8, minz: p.z - 0.45, maxz: p.z + 0.45 });
    if(h && (!best || h.t < best.t)) best = h;
  }
  return best;
}
function updateMissile(dt){
  const m = salvo.missile; if(!m) return;
  const M = SALVO.missile;
  if(!me.alive || gameState !== 'playing'){ missileEnd(); return; }
  // in a match: if the server has dropped it (shot down), it is over
  if(gameMode === 'mp' && m.id != null){
    const there = robotGfx.has(m.id);
    if(there) m.seen = true; else if(m.seen){ missileEnd(); return; }
    const r = robotGfx.get(m.id); if(r) r.mesh.visible = false;   // you fly your own; the copy from the server is hidden
  }
  m.t += dt;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(m.pitch, m.yaw, 0, 'YXZ'));
  /* W speeds it up while you fly it (Jack, 2026-11-28), to speed x boost;
     let go and it eases back to cruise */
  const want = m.guided && keys['KeyW'] ? M.speed * M.boost : M.speed;
  if(m.spd === undefined) m.spd = M.speed;
  m.spd += Math.sign(want - m.spd) * Math.min(Math.abs(want - m.spd), M.boostAcc * dt);
  const step = m.spd * dt;
  _sray.set(m.pos, dir); _sray.far = step + 0.3;
  const hit = _sray.intersectObjects(wallMeshes, false)[0];
  const body = missileBodyHit(m.pos, dir, step + 0.3);
  if(body && (!hit || body.t < hit.distance)){ missileDetonate(m.pos.clone().addScaledVector(dir, body.t)); return; }
  if(hit){ missileDetonate(hit.point.clone().addScaledVector(dir, -0.2)); return; }
  m.pos.addScaledVector(dir, step);
  if(m.pos.y <= 0.05){ m.pos.y = 0.05; missileDetonate(m.pos.clone()); return; }
  /* NO COOLDOWN on the range (Jack, 2026-11-28) also means no fuel limit: it
     flies until it hits something, right over the site's edge if you like
     (Jack: "fly past the edge"); left-click sets it off in the air (input.js).
     training() is off in a match, where the server's lifeMs stands. */
  if(!cdFree() && m.t * 1000 >= M.lifeMs){ missileDetonate(m.pos.clone()); return; }
  m.mesh.position.copy(m.pos); m.mesh.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
  if(m.mesh.userData.flame) m.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
  if(gameMode === 'mp' && socket && m.id != null){
    m.sendAcc += dt;
    if(m.sendAcc > 0.05){ m.sendAcc = 0; socket.emit('mpos', { i: m.id, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), w: +m.yaw.toFixed(3), q: +m.pitch.toFixed(3) }); }
  }
  let lbl = document.getElementById('missileHud');
  if(!m.guided){ if(lbl) lbl.style.display = 'none'; return; }   // a straight shot needs no readout: you are still looking through your own eyes
  if(!lbl){ lbl = document.createElement('div'); lbl.id = 'missileHud'; document.body.appendChild(lbl); }
  lbl.style.display = ''; lbl.textContent = (m.spd > M.speed + 1 ? 'BOOST · ' : 'MISSILE · ') + (cdFree() ? '∞' : Math.max(0, (M.lifeMs / 1000 - m.t)).toFixed(1) + 's');
}
/* loop.js: while it flies, the camera rides it */
/* 0 at cruise, 1 at full boost (loop.js widens the missile's view with it) */
function missileBoostK(){
  const m = salvo.missile, M = SALVO.missile; if(!m || !m.spd) return 0;
  return Math.max(0, Math.min(1, (m.spd - M.speed) / (M.speed * (M.boost - 1))));
}
function missileCamera(){
  const m = salvo.missile; if(!m || !m.guided) return false;
  const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(m.pitch, m.yaw, 0, 'YXZ'));
  camera.position.copy(m.pos).addScaledVector(back, -0.75);   // just ahead of the nose: its own camera
  camera.rotation.order = 'YXZ'; camera.rotation.set(m.pitch, m.yaw, 0);
  return true;
}

/* ---------- the frame ---------- */
function updateSalvo(dt){
  const now = performance.now();
  if(salvo.aiming && barrageRing){
    if(!me.alive || gameState !== 'playing'){ salvoAimOff(); }
    else { const a = barrageAimPoint(); barrageRing.position.set(a.p.x, a.p.y + 0.08, a.p.z);
           barrageRing.userData.mat.color.setHex(a.ok ? 0xff5a2a : 0x777777); salvo.aimOk = a.ok; }
  }
  for(let i = barrageWarns.length - 1; i >= 0; i--){
    const w = barrageWarns[i], left = w.until - now;
    if(left <= 0){ scene.remove(w.g); barrageWarns.splice(i, 1); continue; }
    w.mat.opacity = 0.35 + 0.35 * Math.abs(Math.sin(now / 120));
  }
  updateBarrageShells(now);
  updateMissile(dt);
}
/* Esc or right-click calls the aim off (right-click is in input.js) */
addEventListener('keydown', e => { if(e.code === 'Escape' && salvo.aiming) salvoAimOff(); });
/* V and X go through useAgentKey (silvars.js) like Silvars' instant keys */
{ const _useAgentKey = useAgentKey;
  useAgentKey = function(k){ if(k === 'barrage') return barrageKey(); return _useAgentKey(k); }; }
