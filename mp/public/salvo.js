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
function makeIncenMesh(){
  /* a stubby canister: dark body, a red band and a red cap, so it never reads as Blast's frag */
  const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: SALVO_DARK }), red = new THREE.MeshLambertMaterial({ color: SALVO_RED });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 14), body); g.add(can);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 14), red); g.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 12), red); cap.position.y = 0.08; g.add(cap);
  return g;
}
function makeMissileMesh(){
  /* points down -Z like everything else that flies */
  const g = new THREE.Group(), grey = new THREE.MeshLambertMaterial({ color: 0x5d6168 }), red = new THREE.MeshLambertMaterial({ color: SALVO_RED });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 14), grey); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 14), red); nose.rotation.x = -Math.PI / 2; nose.position.z = -0.59; g.add(nose);
  for(let k = 0; k < 4; k++){
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.2), grey);
    fin.position.set(0, 0, 0.36); fin.rotation.z = k * Math.PI / 2; fin.translateY(0.14); g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 10), new THREE.MeshBasicMaterial({ color: 0xffa13a, transparent: true, opacity: 0.85 }));
  flame.rotation.x = -Math.PI / 2; flame.position.z = 0.7; g.add(flame);
  g.userData = { kind: 'missile', flame };
  return g;
}
/* the held incendiary (G), in the same place as the held frag */
(function buildIncenHeld(){
  const m = makeIncenMesh(); m.position.set(0, 0, -0.28);
  const g = new THREE.Group(); g.add(m); g.position.set(0.02, -0.04, 0.02);
  weaponHolders[INCEN].add(g);
})();

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
  if(salvo.aiming){ barrageConfirm(); return; }
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
  onBarrage({ x: a.p.x, y: a.p.y, z: a.p.z, ms: B.warnMs, span: B.spanMs, r: B.radius, by: 'me' });
  for(let k = 0; k < B.shells; k++){
    const ang = Math.random() * Math.PI * 2, r = B.radius * Math.sqrt(Math.random());
    setTimeout(() => localBlast(a.p.x + Math.cos(ang) * r, a.p.y, a.p.z + Math.sin(ang) * r, B.blast), B.warnMs + (k / (B.shells - 1)) * B.spanMs);
  }
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
function makeLauncherMesh(){
  /* a shoulder launcher: olive tube, a sight block, a grip and a red-tipped
     round showing at the muzzle; points down -Z */
  const g = new THREE.Group(), olive = new THREE.MeshLambertMaterial({ color: 0x3f4630 }), dark = new THREE.MeshLambertMaterial({ color: SALVO_DARK }),
        red = new THREE.MeshLambertMaterial({ color: SALVO_RED });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.95, 16), olive); tube.rotation.x = Math.PI / 2; g.add(tube);
  for(const z of [-0.47, 0.47]){ const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 16), dark); ring.rotation.x = Math.PI / 2; ring.position.z = z; g.add(ring); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 12), red); nose.rotation.x = -Math.PI / 2; nose.position.z = -0.53; g.add(nose);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.12), dark); sight.position.set(-0.07, 0.05, -0.1); g.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.05), dark); grip.position.set(0, -0.11, 0.05); grip.rotation.x = 0.25; g.add(grip);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), dark); fore.position.set(0, -0.1, -0.22); g.add(fore);
  return g;
}
(function buildLauncherHeld(){
  const m = makeLauncherMesh(); m.position.set(0.02, -0.02, -0.25);
  const g = new THREE.Group(); g.add(m); g.position.set(0.04, -0.03, 0.02);
  weaponHolders[MISSILE].add(g);
})();
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
  const step = M.speed * dt;
  _sray.set(m.pos, dir); _sray.far = step + 0.3;
  const hit = _sray.intersectObjects(wallMeshes, false)[0];
  const body = missileBodyHit(m.pos, dir, step + 0.3);
  if(body && (!hit || body.t < hit.distance)){ missileDetonate(m.pos.clone().addScaledVector(dir, body.t)); return; }
  if(hit){ missileDetonate(hit.point.clone().addScaledVector(dir, -0.2)); return; }
  m.pos.addScaledVector(dir, step);
  if(m.pos.y <= 0.05){ m.pos.y = 0.05; missileDetonate(m.pos.clone()); return; }
  if(m.t * 1000 >= M.lifeMs){ missileDetonate(m.pos.clone()); return; }
  m.mesh.position.copy(m.pos); m.mesh.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
  if(m.mesh.userData.flame) m.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
  if(gameMode === 'mp' && socket && m.id != null){
    m.sendAcc += dt;
    if(m.sendAcc > 0.05){ m.sendAcc = 0; socket.emit('mpos', { i: m.id, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), w: +m.yaw.toFixed(3), q: +m.pitch.toFixed(3) }); }
  }
  let lbl = document.getElementById('missileHud');
  if(!m.guided){ if(lbl) lbl.style.display = 'none'; return; }   // a straight shot needs no readout: you are still looking through your own eyes
  if(!lbl){ lbl = document.createElement('div'); lbl.id = 'missileHud'; document.body.appendChild(lbl); }
  lbl.style.display = ''; lbl.textContent = 'MISSILE · ' + Math.max(0, (M.lifeMs / 1000 - m.t)).toFixed(1) + 's';
}
/* loop.js: while it flies, the camera rides it */
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
  updateMissile(dt);
}
/* Esc or right-click calls the aim off (right-click is in input.js) */
addEventListener('keydown', e => { if(e.code === 'Escape' && salvo.aiming) salvoAimOff(); });
/* V and X go through useAgentKey (silvars.js) like Silvars' instant keys */
{ const _useAgentKey = useAgentKey;
  useAgentKey = function(k){ if(k === 'barrage') return barrageKey(); return _useAgentKey(k); }; }
