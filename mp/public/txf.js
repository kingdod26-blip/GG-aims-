/* =============================================================
   Elite Force — txf.js  (unnumbered: after salvo.js, before hud.js)

   TxF, THE HIDDEN AGENT (Jack, 2026-11-28; PLAN-characters.md section 7).
   The rules and numbers are TXF in robots.js, shared with the server.

   - Unlock: only while the secret code is in the CALLSIGN box. The code is
     never written in the game, only its hash (robots.js txfCodeOk), and it
     is never sent as a name: callsignName() turns it into "TxF".
   - Passive: flight (double-tap Space), 500 HP, no fall damage.
   - V, the laser: held. In a match the server resolves it every tick from
     where you look and sends everyone the beams; on the range it is here.
   - G, teleport: aim and press, up to 200m, 2 charges.
   - X, the pulse: everyone within 200m takes 40 and is shown to you
     through walls for 8s.
   The look (a danger-yellow and black flight suit, jet pack, shoulder
   emitter) is drawn.js makeOperator 'txf'; the gear in view is built here.
   ============================================================= */

const TXF_YEL = 0xffb300, TXF_HOT = 0xfff1c4, MARK_TXF = 0xffb300;
const txf = { flying: false, lastSpace: 0, vel: new THREE.Vector3(),
              laserOn: false, heat: 0, hotUntil: 0, acc: 0, hitAt: 0,
              teleQ: [], pulseAt: 0, aiming: false, aimOk: false, aimFeet: null,
              seen: new Map(), pulsedUntil: 0, beams: new Map(), fx: [], prevAgent: 'aseed', unlocked: false };

/* ---------- the code in the CALLSIGN box ---------- */
function txfUnlocked(){ const el = document.getElementById('nameInput'); return !!el && txfCodeOk(el.value); }
/* the name to send: never the code itself */
function callsignName(){
  const el = document.getElementById('nameInput'), v = el ? el.value.trim() : '';
  return txfCodeOk(v) ? 'TxF' : v;
}
(function watchCallsign(){
  const el = document.getElementById('nameInput'); if(!el) return;
  txf.unlocked = txfUnlocked();
  if(myAgent === 'txf' && !txf.unlocked) myAgent = 'aseed';
  el.addEventListener('input', () => {
    const now = txfUnlocked(); if(now === txf.unlocked) return;
    txf.unlocked = now;
    if(now){ toastHome(t('txf.unlocked')); Sfx.teleport(); }
    else if(myAgent === 'txf'){                     // code cleared: the agent goes with it
      myAgent = AGENTS[txf.prevAgent] && !AGENTS[txf.prevAgent].hidden ? txf.prevAgent : 'aseed';
      try{ localStorage.setItem('cx.agent', myAgent); }catch(e){}
      setHeroLook(myAgent);
    }
    if(typeof renderLobbyCards === 'function') renderLobbyCards();
    if(typeof pageOpen !== 'undefined' && pageOpen === 'agents') renderAgentsPage();
  });
})();
/* a note on the menu (the in-game toast is hidden there) */
function toastHome(msg){
  let el = document.getElementById('txfNote');
  if(!el){ el = document.createElement('div'); el.id = 'txfNote'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastHome.t); toastHome.t = setTimeout(() => el.classList.remove('on'), 2600);
}
function onTxfRefused(d){
  myAgent = 'aseed'; configureTiles(); ensureValidWeapon(); updateHUD();
  toast(t(d && d.why === 'taken' ? 'txf.refused.taken' : 'txf.refused.code'));
}

/* ---------- reset, and the server's timers ---------- */
function txfReset(){
  txf.flying = false; txf.vel.set(0, 0, 0); laserKey(false, true);
  txf.heat = 0; txf.hotUntil = 0; txf.teleQ = []; txf.pulseAt = 0; txf.pulsedUntil = 0;
  teleAimOff();
  for(const [, b] of txf.beams) scene.remove(b.g); txf.beams.clear();
  for(const f of txf.fx) scene.remove(f.g); txf.fx.length = 0;
  txf.seen.clear(); clearTxfMarks();
  const d = document.getElementById('txfDetected'); if(d) d.classList.remove('on');
  const h = document.getElementById('txfHeat'); if(h) h.style.display = 'none';
  const n = document.getElementById('txfNote'); if(n) n.classList.remove('on');
  if(txfEmitter){ txfEmitter.visible = false; txfEmitter.userData.k = 0; }
  Sfx.laserHum(0);
}
function onTxfTimers(d){
  if(!d) return;
  const now = performance.now();
  if(d.heat !== undefined) txf.heat = d.heat;
  if(d.hot !== undefined) txf.hotUntil = d.hot > 0 ? now + d.hot : 0;
  if(d.on === 0 && txf.laserOn && d.hot > 0){ txf.laserOn = false; Sfx.overheat(); }
  if(d.teleQ) txf.teleQ = d.teleQ.map(ms => now + ms);
  if(d.pulse !== undefined) txf.pulseAt = now + d.pulse;
}
const txfFree = () => training('noCooldown');

/* ---------- PASSIVE: flight ---------- */
function txfFlying(){ return myAgent === 'txf' && txf.flying && me.alive && gameState === 'playing'; }
/* Space, from input.js. A second tap inside 300ms takes off or lands; while
   flying Space is "up" and never a jump. Returns true when it used the key. */
function txfSpace(){
  if(myAgent !== 'txf' || gameState !== 'playing' || !me.alive) return false;
  const now = performance.now();
  if(now - txf.lastSpace < 300){
    txf.lastSpace = 0;
    txf.flying = !txf.flying;
    if(txf.flying){ txf.vel.set(me.hv.x, Math.max(0, me.vy), me.hv.z); me.vy = 0; me.onGround = false; me.stance = 'stand'; Sfx.thrust(); }
    else { me.vy = Math.min(0, txf.vel.y); Sfx.swap(); }
    return true;
  }
  txf.lastSpace = now;
  return txf.flying;
}
/* One frame of flying: where you look is where W goes, Space up, C down. */
const _tf = new THREE.Vector3(), _tr = new THREE.Vector3(), _tw = new THREE.Vector3(), _te = new THREE.Euler(0, 0, 0, 'YXZ');
function txfFlyStep(dt){
  const F = TXF.fly, st = STANCE.stand;
  me.stance = 'stand'; me.eyeH += (st.eye - me.eyeH) * Math.min(1, dt * 12);
  const fast = keys['ShiftLeft'] || keys['ShiftRight'];
  _tf.set(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0));
  _tr.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  _tw.set(0, 0, 0);
  if(keys['KeyW']) _tw.add(_tf); if(keys['KeyS']) _tw.sub(_tf);
  if(keys['KeyD']) _tw.add(_tr); if(keys['KeyA']) _tw.sub(_tr);
  const moving = _tw.lengthSq() > 0;
  if(moving) _tw.normalize().multiplyScalar(fast ? F.fast : F.speed);
  if(keys['Space']) _tw.y += F.up; if(keys['KeyC']) _tw.y -= F.up;
  /* the server allows 20 m/s across the ground: keep under it */
  const h = Math.hypot(_tw.x, _tw.z); if(h > 19){ _tw.x *= 19 / h; _tw.z *= 19 / h; }
  txf.vel.lerp(_tw, 1 - Math.exp(-F.accel * dt));
  if(!moving && !keys['Space'] && !keys['KeyC'] && txf.vel.lengthSq() < 0.01) txf.vel.set(0, 0, 0);
  me.sprinting = fast && moving;
  me.x += txf.vel.x * dt; me.z += txf.vel.z * dt; me.feetY += txf.vel.y * dt;
  me.hv.set(txf.vel.x, 0, txf.vel.z);
  /* the ground under you, and the lid of the world over you */
  let ground = 0;
  for(const c of colliders){ if(c.maxy <= me.feetY + 0.05 && touches(c, me.x, me.z, FOOT_R)) ground = Math.max(ground, c.maxy); }
  if(me.feetY < ground){ me.feetY = ground; if(txf.vel.y < 0) txf.vel.y = 0; }
  const lid = mapRoofY(currentMap) - 1.9;
  if(me.feetY > lid){ me.feetY = lid; if(txf.vel.y > 0) txf.vel.y = 0; }
  /* a slab over your head stops the climb */
  if(txf.vel.y > 0) for(const c of colliders){
    if(c.miny <= me.feetY + 0.05 || c.miny >= me.feetY + st.body) continue;
    if(!touches(c, me.x, me.z, me.radius)) continue;
    me.feetY = c.miny - st.body; txf.vel.y = 0;
  }
  /* walls: the same push as walking, for everything the body spans */
  const top = me.feetY + st.body;
  for(const c of colliders){
    if(c.miny >= top - 1e-3 || c.maxy <= me.feetY + 0.05) continue;
    const cx = Math.max(c.minx, Math.min(me.x, c.maxx)), cz = Math.max(c.minz, Math.min(me.z, c.maxz));
    const dx = me.x - cx, dz = me.z - cz, d = Math.hypot(dx, dz);
    if(d < me.radius && d > 1e-4){ const p = me.radius - d; me.x += dx / d * p; me.z += dz / d * p; }
    else if(d === 0) me.x += me.radius;
  }
  const b = ARENA - 1.2; me.x = Math.max(-b, Math.min(b, me.x)); me.z = Math.max(-b, Math.min(b, me.z));
  me.onGround = false; me.vy = 0; me.jumpsUsed = 1; me.fallPeak = me.feetY;
}

/* ---------- the gear you see: a shoulder emitter, out while the laser fires ---------- */
const M_TXFY = () => dmatL('txfy', [0.50, 0.30, 0.0], 0.05, 0.42, 2, 0.7);   // danger yellow
let txfEmitter = null;
function makeEmitterMesh(){
  const g = new THREE.Group(), dk = M_DARK(), st = M_STEEL(), y = M_TXFY(), poly = M_POLY();
  /* the housing: a squared body along -Z, a barrel out of its front */
  dBox(g, dk, 0.070, 0.062, 0.20, 0, 0, 0.02);
  dBox(g, poly, 0.074, 0.018, 0.16, 0, 0.034, 0.03);                       // top cover
  for(let k = 0; k < 6; k++) dBox(g, st, 0.078, 0.004, 0.006, 0, 0.045, -0.04 + k * 0.022);   // cooling ribs
  dBox(g, y, 0.0715, 0.016, 0.05, 0, -0.012, 0.09);                         // the hazard band
  for(let k = 0; k < 4; k++) for(const sx of [-1, 1])                        // black chevrons on both faces of the band
    dBox(g, dk, 0.002, 0.02, 0.008, sx * 0.0362, -0.012, 0.071 + k * 0.013, 0.6);
  dTube(g, st, 0.018, 0.12, 0, 0.004, -0.13, 0.016, 18);                    // barrel
  for(let k = 0; k < 4; k++) dTube(g, dk, 0.024, 0.008, 0, 0.004, -0.10 - k * 0.022, 0.024, 18);   // focusing coils
  dTube(g, y, 0.026, 0.01, 0, 0.004, -0.19, 0.022, 18);                     // the muzzle ring
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 18), new THREE.MeshBasicMaterial({ color: TXF_YEL }));
  lens.position.set(0, 0.004, -0.196); lens.rotation.y = Math.PI; g.add(lens);
  for(const sx of [-1, 1]) dScrew(g, sx * 0.036, 0.0, -0.05, 'x', 0.004);
  dBox(g, dk, 0.03, 0.05, 0.05, 0.03, -0.045, 0.09);                         // the mount
  { const c = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI * 1.3), dk); c.position.set(0.02, -0.03, 0.13); c.rotation.y = Math.PI / 2; g.add(c); }   // the feed cable
  dDecal(g, 'TxF  L-9 EMITTER', 0.0365, 0.0, 0.0, 0.16, 0.014, 1);
  g.userData = { lens };
  return g;
}
function emitterFrame(dt){
  if(!txfEmitter){ txfEmitter = makeEmitterMesh(); txfEmitter.visible = false; camera.add(txfEmitter);
    txfEmitter.traverse(o => { o.renderOrder = 1001; }); }
  const want = myAgent === 'txf' && txf.laserOn && me.alive && gameState === 'playing' ? 1 : 0;
  txfEmitter.userData.k = (txfEmitter.userData.k || 0) + (want - (txfEmitter.userData.k || 0)) * Math.min(1, dt * 14);
  const k = txfEmitter.userData.k;
  txfEmitter.visible = k > 0.02;
  /* over the right shoulder, clear of the gun, angled in toward the crosshair */
  txfEmitter.position.set(0.30 + (1 - k) * 0.2, -0.085 + (1 - k) * 0.15, -0.62);
  txfEmitter.rotation.set(0.0, 0.09, 0);
  const lens = txfEmitter.userData.lens;
  if(lens) lens.material.color.setHex(txf.heat > 0.8 ? 0xff4a1a : TXF_YEL);
}
/* where your own beam starts: the emitter's muzzle */
function emitterMuzzle(){
  if(!txfEmitter) return camera.position.clone();
  txfEmitter.updateMatrixWorld(true);
  return new THREE.Vector3(0, 0.004, -0.2).applyMatrix4(txfEmitter.matrixWorld);
}

/* ---------- V: the laser ---------- */
function laserKey(on, quiet){
  if(on){
    if(gameState !== 'playing' || !me.alive || txf.laserOn) return;
    if(performance.now() < txf.hotUntil && !txfFree()){ Sfx.empty(); return; }
    teleAimOff();
    txf.laserOn = true; txf.acc = 0;
    if(gameMode === 'mp' && socket) socket.emit('laser', { on: 1 });
    return;
  }
  if(!txf.laserOn) return;
  txf.laserOn = false;
  if(!quiet && gameMode === 'mp' && socket) socket.emit('laser', { on: 0 });
}
/* a beam: a white-hot core in a yellow glow, and a bloom where it lands */
const BEAM = {};
function beamGroup(){
  if(!BEAM.core){
    /* runs along +Z from 0 to 1, thin at the emitter and full where it lands,
       so the glow does not fill the screen right in front of you */
    BEAM.geo = new THREE.CylinderGeometry(1, 0.3, 1, 10, 1, true); BEAM.geo.translate(0, 0.5, 0); BEAM.geo.rotateX(Math.PI / 2);
    BEAM.core = new THREE.MeshBasicMaterial({ color: TXF_HOT, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    BEAM.glow = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    BEAM.hit = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    BEAM.ball = new THREE.SphereGeometry(1, 12, 8);
  }
  const g = new THREE.Group();
  const core = new THREE.Mesh(BEAM.geo, BEAM.core), glow = new THREE.Mesh(BEAM.geo, BEAM.glow), hit = new THREE.Mesh(BEAM.ball, BEAM.hit);
  for(const m of [core, glow, hit]){ m.frustumCulled = false; m.renderOrder = 950; g.add(m); }
  g.userData = { core, glow, hit };
  scene.add(g);
  return g;
}
const _bz = new THREE.Vector3(0, 0, 1);
function placeBeam(g, a, b){
  const d = b.clone().sub(a), len = Math.max(0.01, d.length());
  g.position.copy(a); g.quaternion.setFromUnitVectors(_bz, d.divideScalar(len));
  const w = 1 + Math.sin(performance.now() / 23) * 0.18;
  g.userData.core.scale.set(0.011 * w, 0.011 * w, len);
  g.userData.glow.scale.set(0.045 * w, 0.045 * w, len);
  g.userData.hit.position.set(0, 0, len); g.userData.hit.scale.setScalar(0.22 * w);
}
/* where your look meets the world: walls, the floor, or a body */
const _lr = new THREE.Raycaster();
function laserTrace(){
  const o = camera.position.clone(), dir = new THREE.Vector3(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0));
  let far = TXF.laser.range;
  _lr.set(o, dir); _lr.far = far;
  const hit = _lr.intersectObjects(wallMeshes, false)[0]; if(hit) far = hit.distance;
  if(dir.y < -1e-4) far = Math.min(far, -o.y / dir.y);
  let body = null;
  const list = gameMode === 'mp' ? [...others.values()].filter(q => q.alive && q.mesh.visible).map(q => ({ ref: q, x: q.mesh.position.x, y: q.mesh.position.y, z: q.mesh.position.z }))
                                 : localBots.filter(b => b.alive).map(b => ({ ref: b, x: b.x, y: 0, z: b.z }));
  for(const p of list){
    const h = segBoxHit(o, dir, far, { minx: p.x - 0.42, maxx: p.x + 0.42, miny: p.y, maxy: p.y + 1.85, minz: p.z - 0.42, maxz: p.z + 0.42 });
    if(h && h.t < far){ far = h.t; body = p.ref; }
  }
  return { o, dir, far, end: o.clone().addScaledVector(dir, far), body };
}
function localLaserHurt(b, dt){
  txf.acc += TXF.laser.dps * dt;
  const whole = Math.floor(txf.acc); txf.acc -= whole;
  if(whole <= 0) return;
  b.hp -= whole;
  const now = performance.now();
  if(now - txf.hitAt > 110){ txf.hitAt = now; hitmark('torso'); Sfx.hit('torso'); }
  if(b.hp <= 0 && b.alive) localKillBot(b);
}
function localKillBot(b){
  b.alive = false; b.mesh.visible = false; extinguish(b);
  localKills++; creditKill(); updateHUD(); setTimeout(() => respawnLocalBot(b), 2000);
}
/* everyone's beams, from the server (a match) */
function onLasers(list){
  const now = performance.now(), live = new Set();
  for(const L of (list || [])){
    live.add(L.id);
    if(L.id === myId) continue;                    // yours is drawn from your own emitter
    let b = txf.beams.get(L.id);
    if(!b){ b = { g: beamGroup() }; txf.beams.set(L.id, b); }
    b.a = new THREE.Vector3(L.ox, L.oy - 0.25, L.oz); b.b = new THREE.Vector3(L.ex, L.ey, L.ez); b.at = now;
  }
  for(const [id, b] of txf.beams) if(id !== 'me' && !live.has(id)){ scene.remove(b.g); txf.beams.delete(id); }
}
function laserFrame(dt){
  const now = performance.now(), L = TXF.laser;
  /* the heat, mirrored here so the bar moves every frame; the server's word corrects it */
  if(txf.laserOn){
    txf.heat = Math.min(1, txf.heat + (txfFree() ? 0 : dt * 1000 / L.heatMs));
    if(txf.heat >= 1){ txf.laserOn = false; txf.hotUntil = now + L.coolMs; Sfx.overheat(); }
  } else if(now >= txf.hotUntil) txf.heat = Math.max(0, txf.heat - dt * 1000 / L.coolMs);
  else txf.heat = (txf.hotUntil - now) / L.coolMs;
  if(txf.laserOn && (!me.alive || gameState !== 'playing' || paused)) laserKey(false);
  /* your own beam */
  let mine = txf.beams.get('me');
  if(txf.laserOn && myAgent === 'txf'){
    const tr = laserTrace();
    if(!mine){ mine = { g: beamGroup() }; txf.beams.set('me', mine); }
    placeBeam(mine.g, emitterMuzzle(), tr.end);
    if(gameMode !== 'mp' && tr.body) localLaserHurt(tr.body, dt);
  } else if(mine){ scene.remove(mine.g); txf.beams.delete('me'); }
  /* others' beams, held for a moment between server ticks */
  let nearest = Infinity;
  for(const [id, b] of txf.beams){
    if(id === 'me') continue;
    if(now - b.at > 160){ scene.remove(b.g); txf.beams.delete(id); continue; }
    placeBeam(b.g, b.a, b.b);
    nearest = Math.min(nearest, camera.position.distanceTo(b.a));
  }
  const hum = txf.laserOn ? 1 : nearest < 80 ? Math.max(0, 1 - nearest / 80) * 0.7 : 0;
  Sfx.laserHum(hum);
}

/* ---------- G: teleport, aimed and pressed ---------- */
let teleMark = null;
function teleHave(now){ txf.teleQ = txf.teleQ.filter(t => t > now); return TXF.tele.charges - txf.teleQ.length; }
function teleClearLocal(x, y, z){
  const b = ARENA - 1.2;
  if(Math.abs(x) > b || Math.abs(z) > b || y < -0.05 || y > mapRoofY(currentMap) - 1.9) return false;
  const r = me.radius - 0.05, top = y + STANCE.stand.body;
  for(const c of colliders){
    if(c.miny >= top || c.maxy <= y + 0.05) continue;
    const cx = Math.max(c.minx, Math.min(x, c.maxx)), cz = Math.max(c.minz, Math.min(z, c.maxz));
    if(Math.hypot(x - cx, z - cz) < r) return false;
  }
  return true;
}
/* Where you would land: on a floor or a roof you point at, in front of a
   wall, or in the air at the end of the range. Nudged up, then back toward
   you, until a body fits. */
function teleAimPoint(){
  const o = camera.position.clone(), dir = new THREE.Vector3(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0));
  const R = TXF.tele.range;
  _lr.set(o, dir); _lr.far = R;
  const hit = _lr.intersectObjects(wallMeshes, false)[0];
  let p, n = null, dist = R;
  if(hit){ p = hit.point.clone(); dist = hit.distance; if(hit.face) n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); }
  if(dir.y < -1e-4){ const t = -o.y / dir.y; if(t < dist){ p = o.clone().addScaledVector(dir, t); n = new THREE.Vector3(0, 1, 0); dist = t; } }
  let feet;
  if(!p){ feet = o.clone().addScaledVector(dir, R); feet.y -= 1.0; }            // the open air
  else if(n && n.y > 0.6) feet = p.clone().setY(p.y + 0.02);                     // a floor or a roof
  else if(n && n.y < -0.6) feet = p.clone().setY(p.y - STANCE.stand.body - 0.1); // a ceiling: hang under it
  else { const h = n ? new THREE.Vector3(n.x, 0, n.z).normalize() : dir.clone().setY(0).normalize().negate();
         feet = p.clone().addScaledVector(h, 0.6); feet.y = p.y - 1.0; }        // a wall: in front of it
  feet.y = Math.max(0, feet.y);
  let ok = false;
  for(let back = 0; back <= 4 && !ok; back++){
    const base = feet.clone().addScaledVector(dir, -back * 0.6); base.y = Math.max(0, base.y);
    for(let up = 0; up <= 8; up++){
      const y = base.y + up * 0.25;
      if(teleClearLocal(base.x, y, base.z)){ feet = new THREE.Vector3(base.x, y, base.z); ok = true; break; }
    }
  }
  ok = ok && Math.hypot(feet.x - me.x, feet.y - me.feetY, feet.z - me.z) <= R;
  return { ok, feet };
}
function makeTeleMark(){
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const tri = new THREE.Shape(); tri.moveTo(0, 0.34); tri.lineTo(0.3, -0.18); tri.lineTo(-0.3, -0.18); tri.lineTo(0, 0.34);   // the danger sign, on the floor
  const t3 = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat); t3.rotation.x = -Math.PI / 2; t3.position.y = 0.045; g.add(t3);
  const ghost = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.18, depthTest: false, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 1.4, 14, 1, true), ghost); body.position.y = 0.85; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), ghost); head.position.y = 1.72; g.add(head);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 30, 6, 1, true), ghost); beam.position.y = 15; g.add(beam);
  g.traverse(o => { o.renderOrder = 960; o.frustumCulled = false; });
  g.userData = { mat, ghost };
  return g;
}
function teleKey(){
  if(gameState !== 'playing' || !me.alive) return;
  if(txf.aiming){ teleConfirm(); return; }
  if(teleHave(performance.now()) <= 0 && !txfFree()){ Sfx.empty(); return; }
  txf.aiming = true;
  if(!teleMark) teleMark = makeTeleMark();
  scene.add(teleMark); Sfx.swap();
}
function teleAimOff(){ txf.aiming = false; if(teleMark) scene.remove(teleMark); }
function teleConfirm(){
  const a = teleAimPoint(); teleAimOff();
  if(!a.ok){ Sfx.empty(); return; }
  const now = performance.now();
  if(!txfFree()) txf.teleQ.push(now + TXF.tele.cdMs);
  if(gameMode === 'mp'){ if(socket) socket.emit('tele', { x: +a.feet.x.toFixed(2), y: +a.feet.y.toFixed(2), z: +a.feet.z.toFixed(2) }); return; }
  const from = { x: me.x, y: me.feetY, z: me.z };
  teleportMe(a.feet);
  onTeleFx({ id: 'me', a: from, b: { x: a.feet.x, y: a.feet.y, z: a.feet.z } });
}
function teleportMe(p){
  me.x = p.x; me.z = p.z; me.feetY = p.y; me.vy = 0; me.hv.set(0, 0, 0); txf.vel.set(0, 0, 0); me.fallPeak = p.y;
  let ground = 0;
  for(const c of colliders){ if(c.maxy <= p.y + 0.05 && touches(c, p.x, p.z, FOOT_R)) ground = Math.max(ground, c.maxy); }
  if(p.y > ground + 0.3) txf.flying = true;        // landed in the air: keep flying
}
function onTeleRefused(){ Sfx.empty(); }
/* both ends: a column of light, a ring, a flash for the one who went */
function onTeleFx(d){
  if(!d) return;
  for(const [p, k] of [[d.a, 0], [d.b, 1]]){
    const g = new THREE.Group(); g.position.set(p.x, p.y || 0, p.z);
    const mat = new THREE.MeshBasicMaterial({ color: k ? TXF_HOT : TXF_YEL, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 18, 1, true), mat); col.position.y = 1.3; g.add(col);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 32), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    scene.add(g); txf.fx.push({ g, mat, t0: performance.now(), ms: 650, kind: 'tele', ring, col });
  }
  const mine = d.id === myId || d.id === 'me';
  if(mine && d.fly && myAgent === 'txf') txf.flying = true;
  if(mine){ const f = document.getElementById('txfFlash'); if(f){ f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } }
  Sfx.teleport(mine ? null : { x: d.b.x, z: d.b.z });
}

/* ---------- X: the pulse ---------- */
function pulseKey(){
  if(gameState !== 'playing' || !me.alive) return;
  const now = performance.now();
  if(now < txf.pulseAt && !txfFree()){ Sfx.empty(); return; }
  const P = TXF.pulse;
  txf.pulseAt = txfFree() ? 0 : now + P.cdMs;
  if(gameMode === 'mp'){ if(socket) socket.emit('pulse'); return; }
  onPulseFx({ x: me.x, y: me.feetY + 1.2, z: me.z, r: P.radius, by: 'me' });
  const seen = [];
  for(const b of localBots){
    if(!b.alive || Math.hypot(b.x - me.x, b.z - me.z, me.feetY) > P.radius) continue;
    seen.push(b); b.hp -= P.dmg;
    if(b.hp <= 0) localKillBot(b);
  }
  if(seen.length){ hitmark('torso'); Sfx.hit('torso'); }
  for(const b of seen) if(b.alive) txf.seen.set(b, now + P.showMs);
}
/* the wave everyone sees: a shell of light racing out to the radius */
function onPulseFx(d){
  if(!d) return;
  const g = new THREE.Group(); g.position.set(d.x, d.y, d.z);
  const mat = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: true });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat); g.add(shell);
  const ringMat = new THREE.MeshBasicMaterial({ color: TXF_YEL, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = -d.y + 0.1; g.add(ring);
  for(const m of [shell, ring]){ m.frustumCulled = false; m.renderOrder = 940; }
  scene.add(g); txf.fx.push({ g, mat, ringMat, t0: performance.now(), ms: 1400, kind: 'pulse', r: d.r, shell, ring });
  Sfx.pulse(d.by === myId || d.by === 'me' ? null : { x: d.x, z: d.z });
}
/* TxF: who the pulse found */
function onPulseSeen(d){
  const until = performance.now() + ((d && d.ms) || TXF.pulse.showMs);
  for(const id of (d && d.ids) || []){ const o = others.get(id); if(o) txf.seen.set(o, until); }
  if(d && d.ids && d.ids.length){ hitmark('torso'); Sfx.hit('torso'); }
}
/* the ones it found: a warning, and a ping */
function onPulsed(d){
  txf.pulsedUntil = performance.now() + ((d && d.ms) || TXF.pulse.showMs);
  let el = document.getElementById('txfDetected');
  if(!el){ el = document.createElement('div'); el.id = 'txfDetected'; document.body.appendChild(el); }
  el.textContent = t('txf.detected'); el.classList.add('on');
  Sfx.ping();
}
function clearTxfMarks(){
  for(const e of [...others.values(), ...localBots]) if(e.txfMark){ e.mesh.remove(e.txfMark); e.txfMark = null; }
  const tags = document.getElementById('txfTags'); if(tags) tags.innerHTML = '';
}
const _tp = new THREE.Vector3();
function marksFrame(){
  const now = performance.now();
  let tags = document.getElementById('txfTags');
  if(!tags){ tags = document.createElement('div'); tags.id = 'txfTags'; document.body.appendChild(tags); }
  const want = new Set();
  for(const [e, until] of txf.seen){
    if(until <= now || !e.alive || !e.mesh.visible){ txf.seen.delete(e); continue; }
    want.add(e);
    if(!e.txfMark) e.txfMark = makeMarkFx(e.mesh, MARK_TXF);
  }
  let html = '';
  for(const e of [...others.values(), ...localBots]){
    if(e.txfMark && !want.has(e)){ e.mesh.remove(e.txfMark); e.txfMark = null; }
    if(!want.has(e)) continue;
    _tp.copy(e.mesh.position); _tp.y += 2.2;
    const dist = camera.position.distanceTo(_tp);
    _tp.project(camera);
    if(_tp.z > 1 || _tp.z < -1) continue;
    const sx = (_tp.x * 0.5 + 0.5) * innerWidth, sy = (-_tp.y * 0.5 + 0.5) * innerHeight;
    html += `<span style="left:${sx.toFixed(0)}px;top:${sy.toFixed(0)}px">⚠ ${Math.round(dist)}m</span>`;
  }
  if(tags.innerHTML !== html) tags.innerHTML = html;
  const det = document.getElementById('txfDetected');
  if(det && det.classList.contains('on') && now > txf.pulsedUntil) det.classList.remove('on');
}

/* ---------- the frame ---------- */
function fxFrame(now){
  for(let i = txf.fx.length - 1; i >= 0; i--){
    const f = txf.fx[i], k = (now - f.t0) / f.ms;
    if(f.kind === 'boom') continue;                    // drawn by the weapons' own pass below
    if(k >= 1){ scene.remove(f.g); f.g.traverse(o => { if(o.geometry && o.geometry !== BEAM.geo) o.geometry.dispose(); }); txf.fx.splice(i, 1); continue; }
    if(f.kind === 'tele'){ f.mat.opacity = 0.85 * (1 - k); f.col.scale.set(1 - k * 0.7, 1 + k * 0.6, 1 - k * 0.7); f.ring.scale.setScalar(1 + k * 3); }
    else if(f.kind === 'pulse'){ const r = Math.max(1, f.r * (1 - Math.pow(1 - k, 3))); f.shell.scale.setScalar(r); f.ring.scale.setScalar(r); f.mat.opacity = 0.45 * (1 - k); f.ringMat.opacity = 0.7 * (1 - k); }
  }
}
function hudFrame(){
  let el = document.getElementById('txfHeat');
  const show = myAgent === 'txf' && gameState === 'playing' && me.alive;
  if(!el){ if(!show) return;
    el = document.createElement('div'); el.id = 'txfHeat'; el.innerHTML = '<b></b><i><u></u></i><em></em>'; document.body.appendChild(el); }
  el.style.display = show ? '' : 'none'; if(!show) return;
  const now = performance.now(), hot = now < txf.hotUntil;
  el.classList.toggle('hot', hot); el.classList.toggle('firing', txf.laserOn);
  el.querySelector('b').textContent = hot ? t('txf.overheat') + ' ' + Math.ceil((txf.hotUntil - now) / 1000) + 's' : t('txf.heat');
  el.querySelector('u').style.width = Math.round(txf.heat * 100) + '%';
  el.querySelector('em').textContent = txf.flying ? t('txf.flying') + ' · ' + me.feetY.toFixed(0) + 'm' : '';
}
/* the jet pack burns on anyone flying as TxF */
function thrustFrame(){
  const now = performance.now();
  for(const o of others.values()){
    const th = o.mesh.userData && o.mesh.userData.thrust; if(!th) continue;
    th.visible = !!o.fly && o.alive;
    if(th.visible) th.scale.set(1, 0.8 + Math.random() * 0.4, 1);
  }
  if(hero && hero.userData && hero.userData.thrust) hero.userData.thrust.visible = false;
}
function updateTxf(dt){
  const now = performance.now();
  if(myAgent === 'txf'){
    if(!me.alive || gameState !== 'playing'){ txf.flying = false; if(txf.aiming) teleAimOff(); }
    if(txf.aiming && teleMark){
      const a = teleAimPoint(); txf.aimOk = a.ok;
      teleMark.position.copy(a.feet);
      teleMark.userData.mat.color.setHex(a.ok ? TXF_YEL : 0x777777);
      teleMark.userData.ghost.color.setHex(a.ok ? TXF_YEL : 0x777777);
    }
  }
  laserFrame(dt); emitterFrame(dt); fxFrame(now); marksFrame(); hudFrame(); thrustFrame();
}
/* Esc calls the teleport aim off (right-click is in input.js) */
addEventListener('keydown', e => { if(e.code === 'Escape' && txf.aiming) teleAimOff(); });
/* V, G and X go through useAgentKey (silvars.js) like the other instant keys */
{ const _useAgentKey = useAgentKey;
  useAgentKey = function(k){
    if(k === 'laser') return laserKey(true);
    if(k === 'tele') return teleKey();
    if(k === 'pulse') return pulseKey();
    return _useAgentKey(k);
  }; }

/* =================== HIS OWN WEAPONS (Jack, 2026-11-28) ===================
   TxF carries no normal gun and no blade: 1 is the minigun, 2 the missile
   launcher (weapons.js MINIGUN / TXFMSL; numbers TXF.mg / TXF.missile).
   Both are drawn like the guns: the PAC-9's finishes, real sizes, details. */
txf.spin = 0; txf.mgHeat = 0; txf.mgHotUntil = 0; txf.mslQ = []; txf.msls = [];
function txfMslHave(now){ txf.mslQ = txf.mslQ.filter(t => t > now); return TXF.missile.charges - txf.mslQ.length; }

/* An open tube along Z (a sight's housing): no end caps, so you can look
   through it. dTube's cylinders are capped, which turned the window black. */
function txfSightTube(g, m, r, len, x, y, z){
  const mat = m.clone(); mat.side = THREE.DoubleSide;
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true), mat);
  o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return dAdd(g, o);
}
function txfSightRing(g, m, r, x, y, z){
  const o = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0025, 6, 24), m); o.position.set(x, y, z); return dAdd(g, o);
}
/* 1: a six-barrel rotary gun. Bore on the gun's own axis, muzzles at -0.55
   (where the tracers leave from), the barrel cluster turning as it spins. */
function drawMinigun(){
  const g = new THREE.Group(), dk = M_DARK(), st = M_STEEL(), y = M_TXFY(), poly = M_POLY();
  /* the motor housing and receiver */
  dBox(g, dk, 0.10, 0.11, 0.24, 0, -0.005, 0.0);
  dBox(g, poly, 0.104, 0.03, 0.2, 0, 0.055, 0.0);
  for (let k = 0; k < 7; k++) dBox(g, st, 0.106, 0.004, 0.008, 0, 0.073, -0.08 + k * 0.026);   // cooling fins on top
  dTube(g, dk, 0.05, 0.06, 0, 0, 0.14, 0.04, 20);                         // the drive motor at the back
  dTube(g, y, 0.051, 0.012, 0, 0, 0.118, 0.051, 20);
  /* the barrel cluster: a rotor turning six barrels about the bore */
  const rotor = new THREE.Group(); g.add(rotor);
  for (let k = 0; k < 6; k++){
    const a = k * Math.PI / 3, bx = Math.cos(a) * 0.024, by = Math.sin(a) * 0.024;
    dTube(rotor, st, 0.0075, 0.43, bx, by, -0.335, 0.0075, 10);
    dTube(rotor, dk, 0.0045, 0.003, bx, by, -0.551, 0.0045, 8);            // the bore, dark at the muzzle
  }
  dTube(rotor, dk, 0.012, 0.43, 0, 0, -0.335, 0.012, 12);                  // the spindle
  for (const z of [-0.2, -0.38, -0.53]) dTube(rotor, dk, 0.04, 0.014, 0, 0, z, 0.04, 20);   // barrel clamps
  dTube(g, y, 0.043, 0.01, 0, 0, -0.545, 0.043, 22);                       // the hazard ring at the muzzle
  dTube(g, dk, 0.045, 0.05, 0, 0, -0.14, 0.045, 22);                        // the front bearing housing
  /* the ammo can on the left, and the feed chute over to the receiver */
  dBox(g, y, 0.075, 0.12, 0.15, -0.11, -0.06, 0.02);
  dBox(g, dk, 0.077, 0.02, 0.152, -0.11, -0.005, 0.02);
  for (let k = 0; k < 3; k++) dBox(g, dk, 0.077, 0.012, 0.02, -0.11, -0.09 + k * 0.03, -0.045, 0, 0.5);   // black chevrons
  dDecal(g, '7.62 LINKED', -0.1485, -0.06, 0.03, 0.1, 0.016, -1);
  { const chute = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 18, Math.PI / 2), dk);
    chute.position.set(-0.055, 0.0, 0.0); chute.rotation.set(0, Math.PI / 2, Math.PI / 2); dAdd(g, chute); }
  for (let k = 0; k < 5; k++) dBox(g, M_BRASS(), 0.006, 0.006, 0.03, -0.06 - k * 0.004, 0.045 - k * 0.012, -0.02 + k * 0.004);   // rounds on the belt
  /* carry handle, grips, a spade-switch trigger */
  dBox(g, dk, 0.02, 0.012, 0.18, 0, 0.11, -0.02);
  for (const z of [-0.09, 0.05]) dBox(g, dk, 0.016, 0.04, 0.016, 0, 0.085, z);
  dProf(g, poly, [[0.035, -0.055], [0.005, -0.055], [-0.005, -0.16], [0.04, -0.16]], 0.03, 0.004, 0, 0, 0.09);   // rear grip
  dProf(g, poly, [[0.02, -0.055], [-0.02, -0.055], [-0.025, -0.15], [0.02, -0.15]], 0.032, 0.004, 0, 0, -0.17);   // front grip
  dBox(g, st, 0.008, 0.018, 0.012, 0, -0.07, 0.07);
  dDecal(g, 'TxF  RG-6  ROTARY', 0.0505, 0.01, -0.02, 0.17, 0.016, 1);
  for (const z of [-0.08, 0.02, 0.09]) dScrew(g, 0.0505, -0.04, z, 'x', 0.003);
  g.userData = { rotor };
  return { g, grip: [0, -0.115, 0.07], fore: [0, -0.07, -0.17], mag: null, magAt: [-0.1, -0.06, 0.02],
           aimTop: 0.12,
           vm: { x: 0.13, y: -0.14, z: -0.36, adsZ: 0.09, rx: 0.03, ry: 0.07, rz: -0.02, viewFov: 62, motion: 0.6 } };
}
/* 2: the drum launcher, rebuilt (2026-11-28) from Jack's HAZARD BLASTER
   picture: a revolver grenade launcher in worn steel, black and danger
   yellow with dark-blue trim. A big hazard-striped drum on the bore's axis
   line (three chambers, the top one in line with the bore; one round a
   missile, so it turns a third per shot), held between a heavy front yoke
   and a rear hub, a spine tube over it; in front, a squared barrel shroud
   with ribbed top and side rails, orange-lit slits, a warning sticker and a
   copper sling ring, ending in a flared yellow muzzle; under it a fore grip
   wound in copper wire on a blue foot; behind, the receiver, a black
   pistol grip with blue panels, the trigger guard, and the box stock with
   its yellow skeleton, orange light strips and a ribbed butt. No sight:
   Jack took it off (aimed by the red dot alone). The bore is on the gun's
   axis and the muzzle at -0.55, where shots leave from. */
const M_TXFORG = () => dmatL('txforg', [0.55, 0.16, 0.02], 0.25, 0.45, 2, 0.6);   // orange trim
const M_TXFBLU = () => dmatL('txfblu', [0.03, 0.05, 0.16], 0.4, 0.4, 0, 0.8);     // dark blue anodised
const M_TXFSTL = () => dmatL('txfstl', [0.16, 0.16, 0.17], 0.85, 0.42, 1);        // worn bright steel
function drawTxfLauncher(){
  const g = new THREE.Group(), dk = M_DARK(), st = M_TXFSTL(), org = M_TXFORG(), blu = M_TXFBLU(), poly = M_POLY(), yl = M_TXFY();
  const blk = dmatL('mlblk', [0.028, 0.028, 0.030], 0.5, 0.5, 0);                   // the worn black of the stock and shroud
  const cop = dmatL('mlcop', [0.30, 0.12, 0.04], 0.9, 0.38, 1);                     // copper wire and the sling ring
  const lit = new THREE.MeshBasicMaterial({ color: 0xff9a26 });                     // the orange light strips
  const hzTex = new THREE.CanvasTexture(txfHazardTex().image);                     // the drum's stripes, wrapped five times round
  hzTex.encoding = THREE.sRGBEncoding; hzTex.wrapS = hzTex.wrapT = THREE.RepeatWrapping; if (hzTex.repeat) hzTex.repeat.set(5, 1);
  const hz = DRAWN_MATS.mlhaz || (DRAWN_MATS.mlhaz = lookTag(Object.assign(new THREE.MeshStandardMaterial({ map: hzTex, metalness: 0.25, roughness: 0.6 }), { userData: { envK: 0.7 } }),
                                                           { metalness: 0.25, roughness: 0.6 }, { metalness: 0, roughness: 0.6 }));
  const warn = (x, y, z, s, side) => {                                              // a yellow warning triangle sticker
    const t = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.0015, 3), yl); t.rotation.set(0, 0, Math.PI / 2); t.position.set(x, y, z); dAdd(g, t);
    dBox(g, dk, 0.0018, s * 0.55, s * 0.16, x + side * 0.0008, y + s * 0.05, z);
  };

  // ---- the drum: hazard yellow, blue bands, steel end rings, three chambers ----
  const drum = new THREE.Group(); drum.position.set(0, -0.045, -0.050); g.add(drum);
  dTube(drum, hz, 0.082, 0.150, 0, 0, 0, 0.082, 40);
  for (const z of [-0.068, 0.068]) dTube(drum, blu, 0.0835, 0.012, 0, 0, z, 0.0835, 40);
  for (const z of [-0.078, 0.078]) dTube(drum, st, 0.080, 0.008, 0, 0, z, 0.080, 40);
  for (let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2 + Math.PI / 6;        // flutes between the chambers
    dBox(drum, blk, 0.010, 0.010, 0.110, Math.cos(a) * 0.0815, Math.sin(a) * 0.0815, 0, 0, a); }
  const noses = [];
  for (let k = 0; k < 3; k++){
    const a = k * Math.PI * 2 / 3 + Math.PI / 2, cx = Math.cos(a) * 0.045, cy = Math.sin(a) * 0.045;
    dTube(drum, dk, 0.025, 0.004, cx, cy, -0.0825, 0.025, 18);                      // a chamber mouth on the front face
    const r = new THREE.Group(); r.position.set(cx, cy, 0.083); drum.add(r);        // the round's base at the back: shows it is loaded
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 18), M_BRASS()); base.rotation.x = Math.PI / 2; r.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.002, 6, 18), M_BRASS()); r.add(rim);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 12), org); cap.rotation.x = Math.PI / 2; cap.position.z = 0.002; r.add(cap);
    noses.push(r);
  }
  dTube(g, dk, 0.012, 0.230, 0, -0.045, -0.050, 0.012, 14);                          // the drum's axle

  // ---- front yoke and rear hub, the spine tube over the drum ----
  { const s = new THREE.Shape(); s.moveTo(-0.038, 0.050); s.lineTo(0.038, 0.050); s.lineTo(0.040, -0.040);
    s.absarc(0, -0.045, 0.040, 0, -Math.PI, true); s.lineTo(-0.038, 0.050);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.020, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 10 });
    const o = new THREE.Mesh(geo, st); o.position.set(0, 0, -0.152); dAdd(g, o); }
  dBox(g, st, 0.020, 0.016, 0.026, 0, 0.060, -0.142);                                // its lug on top
  { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.030, 10), dk); pin.rotation.z = Math.PI / 2; pin.position.set(0, 0.062, -0.142); dAdd(g, pin); }
  for (const sx of [-1, 1]) for (const yy of [0.030, -0.070]) dScrew(g, sx * 0.0415, yy, -0.140, 'x', 0.0035);
  dTube(g, st, 0.030, 0.020, 0, -0.045, 0.040, 0.030, 24);                           // rear hub
  dBox(g, st, 0.024, 0.090, 0.020, 0, 0.008, 0.040);                                 // and its bar up to the spine
  dTube(g, st, 0.016, 0.205, 0, 0.060, -0.045, 0.016, 18);                           // the spine
  for (const z of [-0.115, 0.020]) dTube(g, dk, 0.018, 0.010, 0, 0.060, z, 0.018, 18);
  dDecal(g, 'HAZARD BLASTER  ·  ML-3', -0.0165, 0.060, -0.045, 0.10, 0.0085, -1);

  // ---- barrel shroud: ribbed rails, lit slits, a sticker, the sling ring ----
  dBox(g, blk, 0.074, 0.072, 0.300, 0, 0.000, -0.310);
  dBox(g, dk, 0.040, 0.010, 0.300, 0, 0.041, -0.310);                                // top rail
  for (let k = 0; k < 14; k++) dBox(g, st, 0.044, 0.006, 0.009, 0, 0.049, -0.450 + k * 0.021);
  for (const sx of [-1, 1]){
    dBox(g, dk, 0.006, 0.040, 0.200, sx * 0.040, 0.000, -0.360);                     // side rail
    for (let k = 0; k < 12; k++) dBox(g, st, 0.008, 0.044, 0.008, sx * 0.043, 0.000, -0.450 + k * 0.018);   // its fins
    for (const [yy, z, l] of [[-0.028, -0.250, 0.060], [-0.028, -0.345, 0.030], [0.026, -0.215, 0.022]])
      dBox(g, lit, 0.002, 0.004, l, sx * 0.0375, yy, z);                             // orange light slits
    for (const z of [-0.180, -0.440]) dScrew(g, sx * 0.0375, -0.026, z, 'x', 0.004);
  }
  warn(-0.0378, 0.024, -0.190, 0.010, -1);
  dBox(g, cop, 0.006, 0.014, 0.030, -0.046, 0.022, -0.272);                          // the sling swivel's base
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0032, 8, 18), cop); ring.position.set(-0.050, 0.022, -0.272); ring.rotation.y = Math.PI / 2; ring.rotation.x = 0.3; dAdd(g, ring); }

  // ---- the barrel and its flared yellow muzzle ----
  dTube(g, st, 0.034, 0.060, 0, 0.000, -0.480, 0.034, 28);
  dTube(g, yl, 0.046, 0.070, 0, 0.000, -0.515, 0.036, 30);                           // the flare
  dTube(g, st, 0.0465, 0.006, 0, 0.000, -0.548, 0.0465, 30);                         // its worn lip
  for (let k = 0; k < 4; k++){ const r = 0.0386 + k * 0.0016; dTube(g, blk, r, 0.003, 0, 0, -0.492 - k * 0.011, r, 30); }   // turned grooves
  dTube(g, dk, 0.030, 0.004, 0, 0.000, -0.551, 0.030, 24);                           // dark inside the muzzle

  // ---- fore grip: copper wire wound round it, a blue foot ----
  dBox(g, dk, 0.030, 0.014, 0.036, 0, -0.042, -0.330);
  { const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.0150, 0.0140, 0.100, 18), blk); fg.position.set(0, -0.098, -0.330); dAdd(g, fg);
    for (let k = 0; k < 14; k++){ const c = new THREE.Mesh(new THREE.TorusGeometry(0.0168, 0.0019, 6, 16), cop);
      c.rotation.set(Math.PI / 2 + 0.16 * (k % 2 ? 1 : -1), 0, 0); c.position.set(0, -0.060 - k * 0.0052, -0.330); dAdd(g, c); }
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0160, 0.022, 18), blu); foot.position.set(0, -0.146, -0.330); dAdd(g, foot);
    const loose = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0016, 5, 18, Math.PI * 1.2), cop);   // a loose end of the wire
    loose.position.set(0.006, -0.118, -0.322); loose.rotation.set(0.4, 0.9, 0); dAdd(g, loose); }

  // ---- receiver, pistol grip with blue panels, trigger guard ----
  dBox(g, blk, 0.060, 0.080, 0.120, 0, -0.010, 0.110);
  dBox(g, blu, 0.062, 0.016, 0.120, 0, -0.052, 0.110);
  dBox(g, dk, 0.062, 0.004, 0.120, 0, 0.022, 0.110);                                 // a panel line
  for (const sx of [-1, 1]) for (const z of [0.065, 0.155]) dScrew(g, sx * 0.0305, 0.010, z, 'x', 0.0035);
  dDecal(g, 'TxF ORDNANCE', -0.0306, -0.012, 0.110, 0.085, 0.010, -1);
  dProf(g, poly, [[-0.050, -0.058], [-0.098, -0.058], [-0.124, -0.172], [-0.084, -0.180], [-0.060, -0.110]], 0.034, 0.006);
  for (const sx of [-1, 1]){ const pan = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.070, 0.026), blu);
    pan.position.set(sx * 0.0172, -0.118, 0.090); pan.rotation.x = -0.24; dAdd(g, pan); }
  dProf(g, dk, [[-0.026, -0.050], [-0.024, -0.094], [-0.070, -0.098], [-0.072, -0.088], [-0.034, -0.084], [-0.034, -0.050]], 0.010, 0.002);   // guard, between drum and grip
  dBox(g, st, 0.006, 0.022, 0.007, 0, -0.068, 0.046, 0.25);                          // trigger
  dKnob(g, org, 0.006, 0.006, -0.032, -0.030, 0.140, 'x');                           // the safety, orange

  // ---- the tube back to the stock, the box stock and its yellow skeleton ----
  dTube(g, st, 0.017, 0.060, 0, 0.030, 0.190, 0.017, 18);
  dBox(g, blk, 0.062, 0.068, 0.150, 0, 0.028, 0.270);                                // the stock's box
  dBox(g, dk, 0.064, 0.004, 0.150, 0, 0.0, 0.270);
  { const s = new THREE.Shape(), O = [[0.0, -0.006], [0.150, -0.006], [0.150, -0.100], [0.120, -0.104], [0.020, -0.040], [0.0, -0.034]];
    O.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    for (const H of [[[0.040, -0.020], [0.070, -0.020], [0.070, -0.040]], [[0.085, -0.020], [0.132, -0.020], [0.132, -0.080], [0.115, -0.082]]]){
      const h = new THREE.Path(); H.forEach((p, i) => i ? h.lineTo(p[0], p[1]) : h.moveTo(p[0], p[1])); s.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.040, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -0.020);
    const o = new THREE.Mesh(geo, yl); o.rotation.y = -Math.PI / 2; o.position.set(0, 0, 0.195); dAdd(g, o); }   // its x runs back along +z
  for (const sx of [-1, 1]) for (const z of [0.215, 0.300]) dBox(g, lit, 0.002, 0.004, 0.036, sx * 0.0315, 0.002, z);   // light strips
  warn(-0.0315, 0.040, 0.250, 0.014, -1);
  dBox(g, M_RUBBERISH(), 0.066, 0.172, 0.022, 0, -0.016, 0.356);                     // butt pad
  for (let k = 0; k < 10; k++) dBox(g, dk, 0.067, 0.003, 0.023, 0, -0.094 + k * 0.017, 0.357);
  dBox(g, st, 0.050, 0.010, 0.010, 0, 0.066, 0.335);                                 // its top plate

  g.userData = { noses, drum };
  return { g, grip: [0, -0.125, 0.085], fore: [0, -0.08, -0.33], mag: null, magAt: [0, -0.2, -0.06],
           aimTop: 0.05,
           vm: { x: 0.15, y: -0.15, z: -0.52, adsZ: 0.2, rx: 0.03, ry: 0.08, rz: -0.03, viewFov: 62, motion: 0.6 } };
}
/* What it fires (the same reference): a swirling ball of fire, white-hot in
   the middle, two arms of flame curling round it, a trail of fire behind.
   Its front is +Z, since it is turned with lookAt. */
function makeTxfMissileMesh(){
  const g = new THREE.Group();
  const add = (geo, color, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; g.add(m); return m; };
  add(new THREE.SphereGeometry(0.16, 16, 12), 0xfff4d2, 0.95);               // the white-hot core
  add(new THREE.SphereGeometry(0.3, 18, 14), 0xffa030, 0.55);                // the fire round it
  add(new THREE.SphereGeometry(0.48, 18, 14), 0xff5a14, 0.22);               // and its glow
  const swirl = new THREE.Group(); g.add(swirl);
  for (let k = 0; k < 2; k++){
    const pts = []; for (let i = 0; i <= 40; i++){ const t = i / 40, a = t * Math.PI * 3 + k * Math.PI, r = 0.42 - t * 0.12;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (t - 0.5) * 0.6)); }
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.045, 8, false),
      new THREE.MeshBasicMaterial({ color: k ? 0xffc040 : 0xff7a20, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    arm.frustumCulled = false; swirl.add(arm);
  }
  /* the trail: fire streaming out behind */
  const trail = add(new THREE.ConeGeometry(0.32, 2.4, 14, 1, true), 0xff6a1a, 0.35); trail.rotation.x = -Math.PI / 2; trail.position.z = -1.25;
  const trail2 = add(new THREE.ConeGeometry(0.14, 1.4, 12, 1, true), 0xffd080, 0.6); trail2.rotation.x = -Math.PI / 2; trail2.position.z = -0.75;
  swirl.onBeforeRender = () => { swirl.rotation.z = performance.now() / 70; };
  g.userData = { flame: swirl };
  return g;
}
/* the shot leaving: lightning crackling out of the muzzle and a flash */
function txfMuzzleArcs(at){
  const g = new THREE.Group(); g.position.copy(at);
  const mat = new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 7; k++){
    const pts = [new THREE.Vector3()], dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
    let p = new THREE.Vector3();
    for (let i = 0; i < 6; i++){ p = p.clone().addScaledVector(dir, 0.06 + Math.random() * 0.06);
      p.add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)); pts.push(p); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); l.frustumCulled = false; l.renderOrder = 1002; g.add(l);
  }
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), flashMat); flash.renderOrder = 1002; g.add(flash);
  scene.add(g);
  const t0 = performance.now();
  (function fade(){ const k = (performance.now() - t0) / 220;
    if (k >= 1){ scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); return; }
    mat.opacity = 1 - k; flashMat.opacity = 0.9 * (1 - k); flash.scale.setScalar(1 + k * 3); requestAnimationFrame(fade); })();
}
const TXF_MG_BUILT = drawMinigun(), TXF_ML_BUILT = drawTxfLauncher();
mountGun(MINIGUN, TXF_MG_BUILT);
mountGun(TXFMSL, TXF_ML_BUILT);
WEAPONS[TXFMSL].redDot = true; WEAPONS[TXFMSL].dotOnly = true;   // aimed like the minigun (Jack): the gun stays low, just the red dot
/* Aiming the minigun (Jack): exactly as it first was - right-click brings it
   in and zooms a little - plus the red dot in the middle, as the shotgun
   and the launcher have, so you see where the rounds go. */
WEAPONS[MINIGUN].redDot = true; WEAPONS[MINIGUN].dotOnly = true;
/* When the PAC-9's gloves arrive they hold these too (as salvo.js does). */
function txfGlove(b){
  const rOff = b.right.position.clone().sub(new THREE.Vector3().fromArray(PAC9_GRIP));
  const lOff = b.left.position.clone().sub(new THREE.Vector3().fromArray(PAC9_FORE));
  for (const slot of [MINIGUN, TXFMSL]){
    const r = VM_RIGS[slot]; if (!r || !r.right.parent) continue;
    const parent = r.right.parent, right = b.right.clone(), left = b.left.clone();
    right.position.copy(r.grip).add(rOff);
    const foreBottom = r.fore.clone(); foreBottom.y += 0.01;
    left.position.copy(foreBottom).add(lOff);
    parent.remove(r.right); parent.remove(r.left); parent.add(right, left);
    r.grip = right.position.clone(); r.fore = left.position.clone(); r.right = right; r.left = left;
  }
}
{ const _glove = gloveEveryGun;
  gloveEveryGun = function(b){ _glove(b); txfGlove(b); };
  if (PAC9_BUILT) txfGlove(PAC9_BUILT); }

/* the trigger (input.js shoot) */
const _tx = new THREE.Raycaster();
function txfWeaponShot(w, now){
  const look = () => new THREE.Vector3(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0));
  if (w.kind === 'minigun'){
    const M = TXF.mg;
    if (txf.spin < 1) return;                                                // still spinning up
    if (now < txf.mgHotUntil){ if (!dryClicked){ dryClicked = true; Sfx.empty(); } return; }
    lastShot = now; dryClicked = false;
    if (!txfFree()){ txf.mgHeat += M.rateMs / M.heatMs;
      if (txf.mgHeat >= 1){ txf.mgHeat = 0; txf.mgHotUntil = now + M.coolMs; Sfx.overheat(); } }
    const spread = currentCone(w, Math.min(1, ads / 0.85));
    const dir = look(); dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
    const o = camera.position.clone();
    const tt = wallMeshes.slice(); if (gameMode === 'mp') for (const q of others.values()) if (q.mesh.visible) tt.push(q.mesh);
    _tx.set(o, dir); _tx.far = M.range;
    const th = _tx.intersectObjects(tt, true), tlen = Math.min(th.length ? th[0].distance : Infinity, M.range);
    addTracer(o, dir, tlen, muzzleWorld().clone().lerp(o.clone().addScaledVector(dir, 0.4), ads));
    Sfx.minigun(); gunKick = 0.3;
    if (gameMode === 'mp'){ if (socket) socket.emit('mg', { ox: o.x, oy: o.y, oz: o.z, dx: dir.x, dy: dir.y, dz: dir.z }); }
    else {
      _tx.set(o, dir); _tx.far = M.range;
      const wh = _tx.intersectObjects(wallMeshes, false); let bd = Math.min(wh.length ? wh[0].distance : Infinity, M.range), best = null, mult = 1, zone = null;
      for (const b of localBots){ if (!b.alive) continue; const z = hitZone(o, dir, b.x, b.z, 0, 0); if (z && z.t < bd){ bd = z.t; best = b; mult = z.mult; zone = z.zone; } }
      if (best){ best.hp -= M.dmg * mult; hitmark(zone); Sfx.hit(zone); if (best.hp <= 0 && best.alive) localKillBot(best); }
    }
    me.pitch = Math.min(me.pitch + M.recoil * (1 - ads * 0.5), Math.PI / 2 - 0.05);
    me.yaw += (Math.random() - 0.5) * M.recoil * 0.6;
    return;
  }
  /* the missile */
  const MS = TXF.missile;
  if (txfMslHave(now) <= 0 && !txfFree()){ Sfx.empty(); return; }
  lastShot = now;
  if (!txfFree()) txf.mslQ.push(now + MS.cdMs);
  const dir = look(), o = camera.position.clone().addScaledVector(dir, 1.0);
  gunKick = 1; Sfx.txfLaunch(); updateHUD();
  txfMuzzleArcs(muzzleWorld().clone());
  txf.drumTo = (txf.drumTo || 0) + Math.PI * 2 / 3;                   // the drum turns to the next chamber
  if (gameMode === 'mp'){ if (socket) socket.emit('txfmsl', { ox: o.x, oy: o.y, oz: o.z, dx: dir.x, dy: dir.y, dz: dir.z }); }
  else {
    const mesh = makeTxfMissileMesh(); scene.add(mesh);
    txf.msls.push({ pos: o, vel: dir.clone().multiplyScalar(MS.speed), mesh, born: now });
  }
  me.pitch = Math.min(me.pitch + w.recoil * (1 - ads * 0.5), Math.PI / 2 - 0.05);
}
/* the range's missiles: straight; the first wall, target or the floor sets them off */
function localMissilesFrame(dt){
  const MS = TXF.missile, now = performance.now();
  for (let i = txf.msls.length - 1; i >= 0; i--){
    const m = txf.msls[i], step = MS.speed * dt, dir = m.vel.clone().normalize();
    _tx.set(m.pos, dir); _tx.far = step + 0.3;
    let hit = Infinity; const wh = _tx.intersectObjects(wallMeshes, false)[0]; if (wh) hit = wh.distance;
    for (const b of localBots){ if (!b.alive) continue;
      const h = segBoxHit(m.pos, dir, step + 0.3, { minx: b.x - 0.45, maxx: b.x + 0.45, miny: 0, maxy: 1.8, minz: b.z - 0.45, maxz: b.z + 0.45 });
      if (h && h.t < hit) hit = h.t; }
    if (dir.y < -1e-6){ const tf = -m.pos.y / dir.y; if (tf >= 0 && tf < hit) hit = tf; }
    if (hit <= step + 0.3 || now - m.born > MS.lifeMs){
      const p = m.pos.clone().addScaledVector(dir, Math.max(0, Math.min(hit, step) - 0.25)); p.y = Math.max(0, p.y);
      scene.remove(m.mesh); txf.msls.splice(i, 1);
      onTxfBoom({ x: p.x, y: p.y, z: p.z, r: MS.blast.radius });
      localBlast(p.x, p.y, p.z, MS.blast);
      continue;
    }
    m.pos.addScaledVector(dir, step);
    m.mesh.position.copy(m.pos); m.mesh.lookAt(m.pos.x + dir.x, m.pos.y + dir.y, m.pos.z + dir.z);
  }
}
/* the 75m blast, for everyone: a fireball, a shock ring racing out to the
   edge of the blast, a flash if you are inside it */
function onTxfBoom(d){
  if (!d) return;
  boom(d.x, d.y, d.z);
  const g = new THREE.Group(); g.position.set(d.x, d.y, d.z);
  const fire = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fire); g.add(ball);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), coreMat); g.add(core);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = -d.y + 0.15; g.add(ring);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), shellMat); g.add(shell);
  for (const m of [ball, core, ring, shell]){ m.frustumCulled = false; m.renderOrder = 945; }
  scene.add(g);
  txf.fx.push({ g, t0: performance.now(), ms: 1800, kind: 'boom', r: d.r || 100, ball, core, ring, shell, fire, coreMat, ringMat, shellMat });
  const dist = Math.hypot(camera.position.x - d.x, camera.position.y - d.y, camera.position.z - d.z);
  if (dist < (d.r || 100)){ const f = document.getElementById('txfFlash'); if (f){ f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } }
  Sfx.bigBoom(dist < 12 ? null : { x: d.x, z: d.z });
}
/* the frame: spin-up and heat, the barrels turning, the noses in the tubes */
function weaponsFrame(dt){
  const now = performance.now(), M = TXF.mg, w = curW();
  const want = myAgent === 'txf' && w.kind === 'minigun' && wantFire && me.alive && gameState === 'playing' && !paused;
  txf.spin = want ? Math.min(1, txf.spin + dt * 1000 / M.spinMs) : Math.max(0, txf.spin - dt * 1.6);
  if (now - lastShot > M.rateMs * 3 && now >= txf.mgHotUntil) txf.mgHeat = Math.max(0, txf.mgHeat - dt * 1000 / M.coolMs);
  const rotor = TXF_MG_BUILT.g.userData.rotor; if (rotor) rotor.rotation.z += txf.spin * dt * 45;
  Sfx.mgSpin(myAgent === 'txf' && w.kind === 'minigun' && gameState === 'playing' ? txf.spin : 0);
  const have = txfFree() ? TXF.missile.charges : txfMslHave(now);
  TXF_ML_BUILT.g.userData.noses.forEach((n, i) => { n.visible = i < have; });
  { const dr = TXF_ML_BUILT.g.userData.drum; if (dr) dr.rotation.z += ((txf.drumTo || 0) - dr.rotation.z) * Math.min(1, dt * 14); }
  if (myAgent === 'txf' && w.txf && gameState === 'playing') updateHUD();
  localMissilesFrame(dt);
}
{ const _upd = updateTxf; updateTxf = function(dt){ _upd(dt); weaponsFrame(dt); }; }
{ const _fx = fxFrame; fxFrame = function(now){
    for (let i = txf.fx.length - 1; i >= 0; i--){
      const f = txf.fx[i]; if (f.kind !== 'boom') continue;
      const k = (now - f.t0) / f.ms;
      if (k >= 1){ scene.remove(f.g); txf.fx.splice(i, 1); continue; }
      const fb = Math.min(1, k * 3);                                         // the fireball swells in the first third
      f.ball.scale.setScalar(2 + 22 * (1 - Math.pow(1 - fb, 2))); f.fire.opacity = 0.85 * (1 - k);
      f.core.scale.setScalar(1 + 10 * fb); f.coreMat.opacity = 0.9 * Math.max(0, 1 - k * 2.5);
      const rr = Math.max(1, f.r * (1 - Math.pow(1 - k, 3)));
      f.ring.scale.setScalar(rr); f.ringMat.opacity = 0.8 * (1 - k);
      f.shell.scale.setScalar(rr * 0.9); f.shellMat.opacity = 0.25 * (1 - k);
    }
    _fx(now);
  }; }
{ const _timers = onTxfTimers; onTxfTimers = function(d){ _timers(d); if (!d) return;
    const now = performance.now();
    if (d.mslQ) txf.mslQ = d.mslQ.map(ms => now + ms);
    if (d.mgHot !== undefined && d.mgHot > 0) txf.mgHotUntil = now + d.mgHot; }; }
{ const _reset = txfReset; txfReset = function(){ _reset();
    txf.spin = 0; txf.mgHeat = 0; txf.mgHotUntil = 0; txf.mslQ = [];
    for (const m of txf.msls) scene.remove(m.mesh); txf.msls.length = 0; Sfx.mgSpin(0); }; }

/* =================== INFERNO and ARC BLADES (Jack's pictures, 2026-11-28) ===================
   3: INFERNO, a fire shotgun (TXF.inferno): one cone of fire a shot.
   F: ARC BLADES, twin energy blades (TXF.arc): slash, and a lightning burst
   on right-click. Both drawn from Jack's reference pictures. */
txf.infMag = TXF.inferno.mag; txf.infReloadAt = 0; txf.arcBurstAt = 0; txf.arcSwing = 0; txf.arcSide = 1;

/* INFERNO, rebuilt (2026-11-28, Jack: "improve on the model design and
   details"), from his HP210 pictures: a long, chamfered gunmetal receiver
   with worn edges, panel lines, vent cut-outs and screws; a top rail with a
   raised front sight and an aperture rear; the big round disc on its side
   (a segmented bezel, a face plate with the HP210 name plate, warning
   marks and a latch); the fuel canister under the barrel with its
   checkered button and bolt; a labelled block under the muzzle and an
   angled fore grip; the skeleton thumbhole stock with its pistol grip, a
   yellow trigger, a sling strap and buckle round it, a sling loop and a
   ribbed butt; and a hot glow deep in the mouth. The side you see is the
   left (-x). */
function txfHazardTex(){
  if (txfHazardTex.t) return txfHazardTex.t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#c99a12'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#141414';
  for (let k = -4; k < 8; k++){ x.beginPath(); x.moveTo(k * 32, 0); x.lineTo(k * 32 + 16, 0); x.lineTo(k * 32 + 16 + 128, 128); x.lineTo(k * 32 + 128, 128); x.closePath(); x.fill(); }
  x.globalAlpha = 0.25; x.fillStyle = '#000';                                   // grime
  for (let k = 0; k < 140; k++) x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 4, 1 + Math.random() * 2);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (txfHazardTex.t = t);
}
function M_TXFHAZ(){
  if (DRAWN_MATS.txfhaz) return DRAWN_MATS.txfhaz;
  const m = new THREE.MeshStandardMaterial({ map: txfHazardTex(), metalness: 0.2, roughness: 0.55 });
  m.userData.envK = 0.7;
  return (DRAWN_MATS.txfhaz = lookTag(m, { metalness: 0.2, roughness: 0.55 }, { metalness: 0, roughness: 0.55 }));
}
const M_TXFGLOW = () => DRAWN_MATS.txfglow || (DRAWN_MATS.txfglow = new THREE.MeshBasicMaterial({ color: 0xff8a1c }));
function M_RUBBERISH(){ return dmatL('txfstrap', [0.02, 0.02, 0.018], 0.0, 0.9, 2); }
function drawInferno(){
  const g = new THREE.Group(), dk = M_DARK(), poly = M_POLY(), org = M_TXFORG(), yl = M_TXFY();
  const st = dmatL('infgun', [0.105, 0.105, 0.112], 0.78, 0.44, 1);            // worn gunmetal
  const edge = dmatL('infedge', [0.30, 0.29, 0.28], 0.9, 0.36, 1);             // bright worn edges
  const strap = dmatL('infstrap', [0.055, 0.060, 0.040], 0.0, 0.88, 2);        // olive webbing
  const L = -1, X = 0.040;                                                      // the left face, and the receiver's half-width

  // ---- receiver: chamfered top front and back, a step down at the rear ----
  dProf(g, st, [[0.515, -0.032], [0.515, 0.036], [0.495, 0.056], [0.12, 0.056], [0.10, 0.048], [-0.05, 0.048], [-0.05, -0.032]], 0.080, 0.006);
  for (const sx of [-1, 1]){
    dBox(g, edge, 0.002, 0.003, 0.37, sx * (X + 0.0005), 0.051, -0.31);                     // the worn top edges
    dBox(g, dk, 0.002, 0.002, 0.52, sx * (X + 0.001), -0.002, -0.23);                         // a panel line along the side
    dBox(g, dk, 0.002, 0.040, 0.002, sx * (X + 0.001), 0.018, -0.215);                       // and two across
    dBox(g, dk, 0.002, 0.040, 0.002, sx * (X + 0.001), 0.018, -0.455);
    for (let k = 0; k < 4; k++) dBox(g, dk, 0.003, 0.012, 0.034, sx * (X + 0.001), 0.030, -0.255 - k * 0.055);   // vent cut-outs
    dBox(g, dk, 0.003, 0.016, 0.050, sx * (X + 0.001), 0.024, -0.485);
    for (const [y, z] of [[0.040, -0.50], [-0.020, -0.50], [0.040, -0.20], [-0.020, -0.235], [0.036, 0.03], [-0.022, 0.03]]) dScrew(g, sx * (X + 0.0008), y, z, 'x', 0.0034);
    dBox(g, dk, 0.004, 0.010, 0.030, sx * (X + 0.001), -0.020, -0.14);                       // the charging slot
  }
  dBox(g, edge, 0.010, 0.010, 0.022, -(X + 0.006), -0.020, -0.14);                             // its handle (left)
  for (let k = 0; k < 5; k++) dBox(g, dk, 0.011, 0.0015, 0.020, -(X + 0.006), -0.0145, -0.149 + k * 0.0045);

  // ---- top rail, front sight ears and post, aperture rear sight ----
  dBox(g, dk, 0.034, 0.008, 0.40, 0, 0.060, -0.275);
  for (let k = 0; k < 19; k++) dBox(g, dk, 0.036, 0.004, 0.009, 0, 0.066, -0.465 + k * 0.021);
  dBox(g, st, 0.044, 0.012, 0.03, 0, 0.062, -0.495);                                          // front sight block
  for (const sx of [-1, 1]) dBox(g, st, 0.006, 0.030, 0.022, sx * 0.016, 0.080, -0.495);
  dBox(g, org, 0.004, 0.020, 0.004, 0, 0.078, -0.495);                                         // the post, orange-tipped
  dBox(g, st, 0.040, 0.016, 0.034, 0, 0.064, -0.02);                                           // rear sight base
  for (const sx of [-1, 1]) dBox(g, st, 0.010, 0.022, 0.020, sx * 0.012, 0.081, -0.02);
  dBox(g, org, 0.012, 0.004, 0.010, 0, 0.074, -0.02);
  { const sl = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 14), edge);            // sling loop up at the back
    sl.position.set(0, 0.062, 0.30); dAdd(g, sl); }

  // ---- the lower frame behind the canister, holding the disc ----
  dProf(g, st, [[0.22, -0.030], [0.22, -0.062], [0.19, -0.105], [-0.04, -0.105], [-0.05, -0.030]], 0.074, 0.005);
  dBox(g, edge, 0.002, 0.003, 0.20, -(0.037 + 0.0005), -0.103, -0.09);

  // ---- the disc: bezel, segments, face plate, the HP210 plate, a latch ----
  { const d = new THREE.Group(); d.position.set(0, -0.032, -0.105); g.add(d);
    const R = 0.088;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.092, 48), st); body.rotation.z = Math.PI / 2; dAdd(d, body);
    for (const sx of [-1, 1]){
      const bez = new THREE.Mesh(new THREE.TorusGeometry(R - 0.002, 0.006, 10, 48), edge); bez.rotation.y = Math.PI / 2; bez.position.x = sx * 0.046; dAdd(d, bez);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.008, R - 0.008, 0.004, 48), dk); ring.rotation.z = Math.PI / 2; ring.position.x = sx * 0.047; dAdd(d, ring);
      for (let k = 0; k < 12; k++){ const a = k / 12 * Math.PI * 2;                                // the segments round the bezel
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.010, 0.020), k % 3 ? st : org);
        s.position.set(sx * 0.049, Math.cos(a) * 0.072, Math.sin(a) * 0.072); s.rotation.x = -a; dAdd(d, s); }
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.060, 0.006, 40), st); face.rotation.z = Math.PI / 2; face.position.x = sx * 0.0495; dAdd(d, face);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.060, 0.0022, 6, 40), edge); lip.rotation.y = Math.PI / 2; lip.position.x = sx * 0.0525; dAdd(d, lip);
    }
    dBox(d, dk, 0.004, 0.026, 0.094, L * 0.0535, 0.006, 0);                                   // name plate
    dDecal(d, 'HP210', L * 0.0558, 0.006, 0.0, 0.078, 0.022, L);
    dDecal(d, 'TxF ORDNANCE  ·  INFERNO', L * 0.0532, 0.038, 0.0, 0.070, 0.0065, L);
    dDecal(d, 'HOT  ·  PRESSURISED  ·  DO NOT OPEN', L * 0.0532, -0.026, 0.0, 0.074, 0.0055, L);
    for (const z of [-0.036, 0.036]){ const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 3), org);   // warning marks
      tri.rotation.set(0, 0, Math.PI / 2); tri.position.set(L * 0.0535, 0.036, z); dAdd(d, tri); }
    dBox(d, edge, 0.008, 0.014, 0.010, L * 0.054, -0.045, 0);                                  // the latch
    dKnob(d, dk, 0.004, 0.008, L * 0.058, -0.045, 0, 'x');
    for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2 + 0.2; dScrew(d, L * 0.053, Math.cos(a) * 0.052, Math.sin(a) * 0.052, 'x', 0.0026); } }

  // ---- the canister under the barrel: bands, a checkered button, a bolt ----
  dTube(g, st, 0.033, 0.25, 0, -0.064, -0.345, 0.033, 28);
  for (const z of [-0.235, -0.30, -0.44]) dTube(g, edge, 0.0345, 0.008, 0, -0.064, z, 0.0345, 28);
  dTube(g, dk, 0.0352, 0.03, 0, -0.064, -0.48, 0.0352, 28);                                    // the front ring
  dTube(g, dk, 0.026, 0.006, 0, -0.064, -0.497, 0.026, 22);
  dBox(g, dk, 0.010, 0.020, 0.044, -0.031, -0.046, -0.37);                                     // checkered button, on the left
  for (let k = 0; k < 9; k++) dBox(g, edge, 0.011, 0.0012, 0.042, -0.031, -0.055 + k * 0.0022, -0.37);
  { const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), edge);
    bolt.scale.set(1, 1, 2.4); bolt.position.set(-0.033, -0.064, -0.285); dAdd(g, bolt); }
  dDecal(g, 'FUEL  ·  CELL 3', -0.0335, -0.074, -0.40, 0.06, 0.008, L);

  // ---- the block under the muzzle, its label; an angled fore grip ----
  dProf(g, st, [[0.505, -0.100], [0.505, -0.060], [0.405, -0.060], [0.392, -0.082], [0.405, -0.118], [0.49, -0.118]], 0.066, 0.005);
  for (const sx of [-1, 1]){ dBox(g, dk, 0.002, 0.020, 0.060, sx * 0.0335, -0.090, -0.455); dScrew(g, sx * 0.034, -0.072, -0.415, 'x', 0.003); }
  dDecal(g, 'IGNITER  ·  STAGE 2', -0.0345, -0.090, -0.455, 0.055, 0.0075, L);
  dProf(g, poly, [[0.335, -0.096], [0.265, -0.096], [0.250, -0.196], [0.310, -0.200]], 0.034, 0.006);
  for (let k = 0; k < 6; k++) dBox(g, dk, 0.0355, 0.004, 0.050, 0, -0.115 - k * 0.014, -0.292 + k * 0.0022);

  // ---- the mouth: a dark opening with a hot glow inside ----
  dBox(g, dk, 0.058, 0.052, 0.006, 0, 0.004, -0.5165);
  dBox(g, edge, 0.064, 0.004, 0.008, 0, 0.032, -0.516); dBox(g, edge, 0.064, 0.004, 0.008, 0, -0.024, -0.516);
  { const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 20), M_TXFGLOW()); glow.rotation.x = Math.PI / 2; glow.position.set(0, 0.004, -0.5185); dAdd(g, glow); }
  for (let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2;                                   // the nozzle's petals
    dBox(g, edge, 0.004, 0.010, 0.006, Math.cos(a) * 0.021, 0.004 + Math.sin(a) * 0.021, -0.5195, 0, a); }

  // ---- trigger group: guard, a yellow trigger and safety ----
  dProf(g, dk, [[0.040, -0.032], [0.044, -0.100], [-0.060, -0.104], [-0.062, -0.092], [0.030, -0.088], [0.028, -0.032]], 0.008, 0.001);
  dBox(g, yl, 0.006, 0.030, 0.008, 0, -0.068, -0.005, 0.25);
  dKnob(g, yl, 0.006, 0.006, -0.040, -0.050, 0.025, 'x');

  // ---- the skeleton stock: thumbhole, pistol grip, a strap, the butt ----
  { const s = new THREE.Shape(), P = [[-0.05, 0.048], [-0.33, 0.046], [-0.36, 0.036], [-0.36, -0.118], [-0.33, -0.128], [-0.25, -0.094],
      [-0.16, -0.094], [-0.125, -0.178], [-0.078, -0.180], [-0.060, -0.104], [-0.05, -0.104]];
    P.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    const h = new THREE.Path(), H = [[-0.118, 0.010], [-0.205, 0.010], [-0.226, -0.014], [-0.212, -0.058], [-0.128, -0.058], [-0.112, -0.030]];
    H.forEach((p, i) => i ? h.lineTo(p[0], p[1]) : h.moveTo(p[0], p[1])); s.holes.push(h);
    const h2 = new THREE.Path(), H2 = [[-0.255, 0.012], [-0.320, 0.012], [-0.330, -0.020], [-0.318, -0.080], [-0.262, -0.060]];
    H2.forEach((p, i) => i ? h2.lineTo(p[0], p[1]) : h2.moveTo(p[0], p[1])); s.holes.push(h2);
    const b = 0.006, thick = 0.064;
    const geo = new THREE.ExtrudeGeometry(s, { depth: thick - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -(thick - 2 * b) / 2);
    const o = new THREE.Mesh(geo, st); o.rotation.y = Math.PI / 2; dAdd(g, o); }
  for (let k = 0; k < 7; k++) dBox(g, poly, 0.066, 0.0035, 0.012, 0, -0.112 - k * 0.0095, 0.095 + k * 0.0035, 0.4);   // the grip's texture
  dBox(g, yl, 0.002, 0.012, 0.040, -0.0335, 0.030, 0.17);                                     // a yellow label on the stock
  dDecal(g, 'TxF  •  FIRE', -0.0345, 0.030, 0.17, 0.038, 0.008, L);
  dBox(g, strap, 0.074, 0.060, 0.026, 0, 0.018, 0.27);                                         // the sling strap round the stock
  dBox(g, edge, 0.008, 0.026, 0.020, -0.041, 0.012, 0.27);                                     // its buckle
  dBox(g, dk, 0.009, 0.016, 0.012, -0.042, 0.012, 0.27);
  dBox(g, strap, 0.004, 0.012, 0.15, -0.0335, -0.098, 0.225, -0.32);                           // the strap running down the lower bar
  dBox(g, M_RUBBERISH(), 0.068, 0.170, 0.016, 0, -0.040, 0.366);                                 // butt pad
  for (let k = 0; k < 9; k++) dBox(g, dk, 0.069, 0.003, 0.017, 0, -0.115 + k * 0.019, 0.367);
  for (const sx of [-1, 1]) dScrew(g, sx * 0.0325, -0.040, 0.335, 'x', 0.0035);

  return { g, grip: [0, -0.115, 0.08], fore: [0, -0.1, -0.3], mag: null, magAt: [0, -0.2, -0.1], aimTop: 0.1,
           vm: { x: 0.15, y: -0.15, z: -0.5, adsZ: 0.15, rx: 0.03, ry: 0.07, rz: -0.03, viewFov: 62, motion: 0.6 } };
}

/* ARC BLADES, rebuilt again (2026-11-29, Jack: "the sword should look like
   this"), laid out on his picture. Seen broadside (+z toward you):
   - two WIDE blades side by side across the head with a gap between them,
     both leaning the same way; each rises from a short neck into a big
     hooked tang whose spur points back and down, pinches in at a notch,
     then runs long and slightly curved to the point, glowing orange with
     a white-hot core and lightning crawling over it;
   - a chunky head wider than the grip: riveted plates, a glowing danger
     triangle on its face, a round pod on each top corner, copper pipes
     looping down its sides, and a forked clamp outside each blade;
   - the grip wrapped in dark leather strips on the slant;
   - a big square hazard-striped pommel block, and the knuckle guard: an
     angled bracket from the pommel out to the blade side, then a
     hazard-striped bar up to the head. */
function arcBladeShape(len){
  /* Jack's screenshot (2026-11-29) showed thin slivers with a long needle
     sticking out at the base. In his picture each blade is broad, and the
     hook at its root is a chunky beard: from a short neck the lower edge
     runs out and down to a spur pointing back, the upper edge climbs back
     to the blade in one diagonal, then the blade runs long to the point. */
  const s = new THREE.Shape(), L = len;
  s.moveTo(-0.011, 0);
  s.lineTo(-0.013, 0.032);                                                      // the neck
  s.lineTo(-0.064, 0.024);                                                      // the beard's lower edge, out and down
  s.lineTo(-0.086, 0.004);                                                      // the spur
  s.lineTo(-0.074, 0.044);
  s.lineTo(-0.040, 0.104);                                                      // the beard's top, back up to the blade
  s.lineTo(-0.026, 0.124);
  /* STRAIGHT (Jack, 2026-11-29: "the blade need to be straight"): both
     edges run straight up, the point on the blade's centre line */
  s.lineTo(-0.020, L * 0.78);                                                   // the back edge
  s.lineTo(0.012, L);                                                           // to the point
  s.lineTo(0.044, L * 0.78);                                                    // the cutting edge
  s.lineTo(0.040, 0.090);
  s.lineTo(0.022, 0.036);
  s.lineTo(0.013, 0);
  s.lineTo(-0.011, 0);
  return s;
}
/* The blade's face: molten orange, hotter toward the middle, with bright
   cracks of lightning frozen into it (the picture's look). ShapeGeometry
   gives each vertex its own x,y as uv, so the texture is scaled onto the
   blade's real size (x -0.088 .. 0.052, y 0 .. 0.62). */
function arcBladeTex(){
  if (arcBladeTex.t) return arcBladeTex.t;
  const W = 128, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0.00, '#7a1c00'); gr.addColorStop(0.42, '#e85a0c'); gr.addColorStop(0.62, '#ffb43a'); gr.addColorStop(0.78, '#ff8a1e'); gr.addColorStop(1.00, '#9a2a04');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const crack = (x0, y0, steps, w, col) => {                                    // a jagged crack climbing the blade
    x.strokeStyle = col; x.lineWidth = w; x.shadowColor = '#ffd27a'; x.shadowBlur = 6;
    x.beginPath(); x.moveTo(x0, y0); let px = x0, py = y0;
    for (let i = 0; i < steps; i++){ px += (Math.random() - 0.5) * 26; py -= 10 + Math.random() * 22; px = Math.max(8, Math.min(W - 8, px)); x.lineTo(px, py);
      if (Math.random() < 0.3){ x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 30, py - Math.random() * 18); x.moveTo(px, py); } }
    x.stroke(); };
  for (let k = 0; k < 7; k++) crack(30 + Math.random() * 70, H - Math.random() * 120, 14 + (Math.random() * 10 | 0), 1.6, 'rgba(255,236,170,0.95)');
  for (let k = 0; k < 10; k++) crack(20 + Math.random() * 90, H - Math.random() * H * 0.8, 6, 0.9, 'rgba(255,214,120,0.7)');
  const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
  if (tx.repeat){ tx.repeat.set(1 / 0.140, 1 / 0.62); tx.offset.set(0.088 / 0.140, 0); }
  return (arcBladeTex.t = tx);
}
/* A leather-wrapped grip as a texture: overlapping strips on the slant,
   each with a darker edge where it laps the next. */
function arcWrapTex(){
  if (arcWrapTex.t) return arcWrapTex.t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#1b1917'; x.fillRect(0, 0, 128, 256);
  for (let k = -3; k < 12; k++){
    const y = k * 28;
    x.fillStyle = k % 2 ? '#2e2a26' : '#26231f';
    x.beginPath(); x.moveTo(0, y); x.lineTo(128, y + 40); x.lineTo(128, y + 64); x.lineTo(0, y + 24); x.closePath(); x.fill();
    x.strokeStyle = '#0c0b0a'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, y + 24); x.lineTo(128, y + 64); x.stroke();
    x.strokeStyle = 'rgba(120,104,88,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, y + 2); x.lineTo(128, y + 42); x.stroke();
  }
  const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return (arcWrapTex.t = tx);
}
function drawArcBlades(){
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const dk = M_DARK(), st = M_TXFSTL(), hz = M_TXFHAZ();
  const iron = dmatL('arciron2', [0.034, 0.033, 0.032], 0.70, 0.55, 0);        // the head's worn dark steel
  const leather = dmatL('arcleather', [0.032, 0.030, 0.028], 0.0, 0.80, 2);
  const cop = dmatL('archose', [0.20, 0.085, 0.03], 0.55, 0.45, 1);           // copper-brown pipes
  const V = (r0, r1, h, m, x, yy, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 20), m); o.position.set(x, yy, z); return dAdd(g, o); };
  const rivet = (x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0014, 8), M_STEEL()); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return dAdd(g, o); };   // facing you

  // ---- grip: wrapped in leather strips on the slant (a texture, plus the lapped edges in relief) ----
  { const wrap = DRAWN_MATS.arcwrap || (DRAWN_MATS.arcwrap = lookTag(Object.assign(new THREE.MeshStandardMaterial({ map: arcWrapTex(), metalness: 0, roughness: 0.82 }), { userData: { envK: 0.5 } }),
                                                                    { metalness: 0, roughness: 0.82 }, { metalness: 0, roughness: 0.82 }));
    V(0.0185, 0.0185, 0.132, wrap, 0, -0.003, 0);
    for (let k = 0; k < 6; k++){ const w = new THREE.Mesh(new THREE.TorusGeometry(0.0186, 0.0011, 4, 24), leather);   // the lapped edges, shallow
      w.rotation.set(Math.PI / 2 + 0.30, 0, 0); w.position.y = -0.050 + k * 0.019; dAdd(g, w); } }
  V(0.0195, 0.0195, 0.016, hz, 0, 0.068, 0);                                   // a hazard band under the head

  // ---- pommel: a big square hazard block with screws ----
  dBox(g, hz, 0.050, 0.046, 0.044, 0, -0.095, 0);
  dBox(g, iron, 0.054, 0.008, 0.048, 0, -0.072, 0);
  dBox(g, iron, 0.054, 0.010, 0.048, 0, -0.121, 0);
  for (const sx of [-1, 1]) for (const yy of [-0.084, -0.106]) rivet(sx * 0.018, yy, 0.0225);

  // ---- knuckle guard: a bracket out to the blade side, a striped bar up to the head ----
  { const s = new THREE.Shape(); s.moveTo(0.022, -0.125); s.lineTo(0.072, -0.108); s.lineTo(0.072, -0.082); s.lineTo(0.022, -0.090); s.lineTo(0.022, -0.125);
    const o = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 }), iron);
    o.position.z = -0.009; dAdd(g, o); }
  rivet(0.060, -0.098, 0.011);
  dBox(g, iron, 0.018, 0.020, 0.022, 0.066, -0.080, 0);                         // the bar's foot
  /* the bar's stripes run on the slant as in the picture: its own copy of
     the hazard texture, repeated down its length so they are not stretched */
  const hzBar = DRAWN_MATS.txfhazbar || (DRAWN_MATS.txfhazbar = (() => { const tx = new THREE.CanvasTexture(txfHazardTex().image);
    tx.encoding = THREE.sRGBEncoding; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; if (tx.repeat) tx.repeat.set(1, 7);
    const m = new THREE.MeshStandardMaterial({ map: tx, metalness: 0.2, roughness: 0.55 }); m.userData.envK = 0.7;
    return lookTag(m, { metalness: 0.2, roughness: 0.55 }, { metalness: 0, roughness: 0.55 }); })());
  { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.150, 0.016), hzBar); bar.position.set(0.060, -0.002, 0); bar.rotation.z = 0.07; dAdd(g, bar);
    for (const sx of [-1, 1]){ const e = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.150, 0.018), iron); e.position.set(0.060 + sx * 0.0095, -0.002, 0); e.rotation.z = 0.07; dAdd(g, e); } }
  dBox(g, iron, 0.020, 0.018, 0.022, 0.054, 0.076, 0);                          // and its head end
  rivet(0.054, 0.076, 0.0115);

  // ---- the head: riveted block, the danger sign, pods, pipes ----
  dBox(g, iron, 0.134, 0.064, 0.050, 0.005, 0.112, 0);
  dBox(g, dk, 0.136, 0.008, 0.052, 0.005, 0.142, 0);                            // the top plate
  dBox(g, dk, 0.060, 0.044, 0.004, 0.004, 0.110, 0.026);                        // the front plate
  for (const [x, y] of [[-0.022, 0.128], [0.030, 0.128], [-0.022, 0.092], [0.030, 0.092]]) rivet(x + 0.004, y, 0.0285);
  for (const [x, y] of [[-0.040, 0.130], [-0.040, 0.094], [0.048, 0.130], [0.048, 0.094]]) rivet(x, y, 0.0255);
  { const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.0150, 0.0150, 0.003, 3), M_TXFGLOW());     // the danger sign, lit
    tri.rotation.set(Math.PI / 2, 0, 0); tri.position.set(0.004, 0.109, 0.0295); g.add(tri);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.0150, 0.0016, 4, 3), iron); frame.rotation.z = Math.PI / 2; frame.position.set(0.004, 0.109, 0.0305); g.add(frame);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0085, 0.002), dk); mark.position.set(0.004, 0.1105, 0.0315); g.add(mark);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.002), dk); dot.position.set(0.004, 0.1025, 0.0315); g.add(dot); }
  for (const sx of [-1, 1]){
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.040, 18), st);              // round pods on the top corners
    pod.rotation.x = Math.PI / 2; pod.position.set(0.005 + sx * 0.052, 0.150, -0.004); dAdd(g, pod);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 14), dk); cap.rotation.x = Math.PI / 2; cap.position.set(0.005 + sx * 0.052, 0.150, 0.017); dAdd(g, cap);
    for (const dz of [0.012, -0.012]){                                          // two hoses a side, hugging the body
      const end = sx < 0 ? [-0.020, 0.064, dz * 0.6] : [0.052, 0.070, dz * 0.6];   // left: into the grip's top; right: the guard bar
      const pts = [[0.005 + sx * 0.068, 0.130, dz], [0.005 + sx * 0.078, 0.112, dz], [0.005 + sx * 0.072, 0.088, dz], [end[0] + sx * 0.012, end[1] + 0.006, dz], end]
        .map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, dz > 0 ? 0.0032 : 0.0026, 8, false), cop); dAdd(g, hose);
      for (const p of [pts[0], pts[4]]){ const fit = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.008, 10), st); fit.position.copy(p); dAdd(g, fit); }   // brass fittings
    }
  }
  // the forked clamps outside each blade
  for (const [cx, ang] of [[-0.070, 0.35], [0.080, -0.35]]){
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.048, 0.020), iron); arm.position.set(cx, 0.168, 0); arm.rotation.z = ang; dAdd(g, arm);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.010, 0.022), dk); tip.position.set(cx + (ang > 0 ? -0.008 : 0.008), 0.190, 0); dAdd(g, tip);
    rivet(cx, 0.160, 0.0105);
  }
  for (const bx of [-0.054, 0.064]){ dBox(g, iron, 0.030, 0.014, 0.024, bx, 0.153, 0); dBox(g, M_TXFGLOW(), 0.022, 0.003, 0.016, bx, 0.1615, 0); }   // the blade sockets, glowing at the lip

  // ---- the blades: molten face with frozen lightning, a soft halo, a hot edge, live lightning ----
  const face = new THREE.MeshBasicMaterial({ map: arcBladeTex(), transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.MeshBasicMaterial({ color: 0xff6a14, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo2 = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const bolts = [];
  /* MIRRORED (Jack, 2026-11-29: "the two blades face different directions"):
     the second blade is flipped, so each hook points outward, away from the
     other, and the cutting edges face each other across the gap. */
  for (const [bx, lean, len, flip] of [[-0.054, 0, 0.56, 1], [0.064, 0, 0.60, -1]]){
    const b = new THREE.Group(); b.position.set(bx, 0.160, 0.0); b.rotation.z = lean; b.scale.x = flip; g.add(b);
    const shape = arcBladeShape(len);
    { const h = new THREE.Mesh(new THREE.ShapeGeometry(shape, 18), halo); h.scale.set(1.16, 1.02, 1); h.position.set(0.002, -0.006, -0.002); b.add(h); h.renderOrder = 1001; }
    const body = new THREE.Mesh(new THREE.ShapeGeometry(shape, 18), face); b.add(body); body.renderOrder = 1001;
    const em = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const edgeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shape.getPoints(18).map(p => new THREE.Vector3(p.x, p.y, 0.0015))), em);
    edgeLine.frustumCulled = false; edgeLine.renderOrder = 1001; b.add(edgeLine);
    const lm = new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(new THREE.BufferGeometry(), lm); line.frustumCulled = false; b.add(line);
    bolts.push({ line, len });
  }
  root.userData = { blades: g, bolts };
  g.rotation.set(-0.35, 0, -0.25);
  g.position.set(0, -0.11, 0.07);
  return { g: root, grip: [0, -0.115, 0.075], fore: [0, -0.115, 0.075], mag: null, magAt: [0, -0.2, 0.0], aimTop: 0.1,
           vm: { x: 0.26, y: -0.1, z: -0.5, adsZ: 0, rx: 0, ry: 0, rz: 0, viewFov: 0 } };
}
/* lightning crawling over the blades: a new jagged line every few frames,
   following each blade's middle as it curves toward the point */
function arcBoltsFrame(b){
  for (const L of b.userData.bolts){
    const pts = [];
    for (let i = 0; i <= 14; i++){ const t = i / 14, mid = t < 0.17 ? 0.0 : 0.012;
      pts.push(new THREE.Vector3(mid + (Math.random() - 0.5) * 0.034, (0.05 + t * 0.92) * L.len, 0.002)); }
    L.line.geometry.dispose(); L.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
}
const TXF_INF_BUILT = drawInferno(), TXF_ARC_BUILT = drawArcBlades();
mountGun(INFERNO, TXF_INF_BUILT);
mountGun(ARCBLADES, TXF_ARC_BUILT);
WEAPONS[INFERNO].redDot = true; WEAPONS[INFERNO].dotOnly = true;      // aimed like his others: the red dot
/* the blades are held in the right hand only */
{ const r = VM_RIGS[ARCBLADES]; if (r && r.left && r.left.parent) r.left.parent.remove(r.left); }
{ const _tg = txfGlove; txfGlove = function(b){
    _tg(b);
    const rOff = b.right.position.clone().sub(new THREE.Vector3().fromArray(PAC9_GRIP));
    const lOff = b.left.position.clone().sub(new THREE.Vector3().fromArray(PAC9_FORE));
    const r = VM_RIGS[INFERNO];
    if (r && r.right.parent){
      const parent = r.right.parent, right = b.right.clone(), left = b.left.clone();
      right.position.copy(r.grip).add(rOff); const fb = r.fore.clone(); fb.y += 0.01; left.position.copy(fb).add(lOff);
      parent.remove(r.right); if (r.left.parent) parent.remove(r.left); parent.add(right, left);
      r.grip = right.position.clone(); r.fore = left.position.clone(); r.right = right; r.left = left;
    }
    const a = VM_RIGS[ARCBLADES];
    if (a && a.right.parent){
      const parent = a.right.parent, right = b.right.clone();
      right.position.copy(a.grip).add(rOff);
      parent.remove(a.right); if (a.left && a.left.parent) a.left.parent.remove(a.left); parent.add(right);
      a.grip = right.position.clone(); a.right = right;
    }
  }; }
if (PAC9_BUILT) txfGlove(PAC9_BUILT);        // gloveEveryGun already calls txfGlove (rewrapped above)

/* the trigger, for these two (txfWeaponShot hands them here) */
{ const _shot = txfWeaponShot; txfWeaponShot = function(w, now){
    if (w.kind === 'inferno') return infernoShot(w, now);
    if (w.kind === 'arc') return arcSlash(w, now);
    return _shot(w, now);
  }; }
function infernoReload(){
  const now = performance.now();
  if (now < txf.infReloadAt || txf.infMag >= TXF.inferno.mag) return;
  txf.infReloadAt = now + TXF.inferno.reloadMs; Sfx.magOut();
  if (gameMode === 'mp' && socket) socket.emit('infreload');
}
function infernoShot(w, now){
  const F = TXF.inferno;
  if (txf.infReloadAt && now >= txf.infReloadAt){ txf.infMag = F.mag; txf.infReloadAt = 0; Sfx.magIn(); }
  if (now < txf.infReloadAt) return;
  if (txf.infMag <= 0){ infernoReload(); return; }
  lastShot = now;
  if (!training('infAmmo')){ txf.infMag--; if (txf.infMag <= 0) infernoReload(); }
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0)), o = camera.position.clone();
  gunKick = 1; updateHUD();
  onInfernoFx({ x: o.x, y: o.y, z: o.z, dx: dir.x, dy: dir.y, dz: dir.z, by: 'me' });
  if (gameMode === 'mp'){ if (socket) socket.emit('inferno', { dx: dir.x, dy: dir.y, dz: dir.z }); }
  else {
    let any = false;
    for (const b of localBots){
      if (!b.alive) continue;
      const c = new THREE.Vector3(b.x, 1.1, b.z), v = c.clone().sub(o), dist = v.length();
      if (dist > F.range || v.normalize().dot(dir) < Math.cos(F.cone)) continue;
      _tx.set(o, v); _tx.far = dist; if (_tx.intersectObjects(wallMeshes, false).length) continue;
      const dmg = Math.round(dist <= F.full ? F.dmg : F.dmg * (1 - (dist - F.full) / (F.range - F.full)));
      if (dmg <= 0) continue;
      b.hp -= dmg; any = true;
      b.burnUntil = now + F.burnMs; b.burnNext = now + 1000; b.burnDps = Math.max(b.burnDps || 0, F.burnDps);
      if (!b.fire) b.fire = makeBurnFx(b.mesh);
      if (b.hp <= 0 && b.alive) localKillBot(b);
    }
    if (any){ hitmark('torso'); Sfx.hit('torso'); }
  }
  me.pitch = Math.min(me.pitch + w.recoil, Math.PI / 2 - 0.05);
}
/* everyone's fire blast: a cone of fire rolling out to the range */
function onInfernoFx(d){
  if (!d) return;
  const mine = d.by === myId || d.by === 'me';
  const from = mine ? muzzleWorld().clone() : new THREE.Vector3(d.x, d.y - 0.25, d.z);
  const dir = new THREE.Vector3(d.dx, d.dy, d.dz).normalize();
  const g = new THREE.Group(); scene.add(g);
  const puffs = [];
  for (let k = 0; k < 14; k++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: k % 3 ? 0xd8420c : 0xff9a30, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = 946; g.add(m);
    const spread = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.35);
    puffs.push({ m, v: dir.clone().add(spread).normalize(), far: TXF.inferno.range * (0.55 + Math.random() * 0.45), d0: Math.random() * 0.1 });
  }
  txf.fx.push({ g, t0: performance.now(), ms: 420, kind: 'inferno', from, puffs });
  Sfx.inferno(mine ? null : { x: d.x, z: d.z });
}
/* ARC BLADES: a slash, and the lightning burst */
function arcSlash(w, now){
  const A = TXF.arc;
  lastShot = now; txf.arcSwing = 1; txf.arcSide = -txf.arcSide; Sfx.arcSlash();
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(_te.set(me.pitch, me.yaw, 0)), o = camera.position.clone();
  if (gameMode === 'mp'){ if (socket) socket.emit('arcslash', { dx: dir.x, dy: dir.y, dz: dir.z }); return; }
  let best = null, bestD = Infinity;
  for (const b of localBots){ if (!b.alive) continue;
    const to = new THREE.Vector3(b.x - o.x, 1.1 - o.y, b.z - o.z), d = to.length();
    if (d > A.reach || to.normalize().dot(dir) < A.arc) continue;
    if (d < bestD){ bestD = d; best = b; } }
  if (best){ best.hp -= A.dmg; hitmark('torso'); Sfx.hit('torso'); if (best.hp <= 0 && best.alive) localKillBot(best); }
}
function arcBurst(){
  if (gameState !== 'playing' || !me.alive) return;
  const A = TXF.arc, now = performance.now();
  if (now < txf.arcBurstAt && !txfFree()){ Sfx.empty(); return; }
  txf.arcBurstAt = txfFree() ? 0 : now + A.burstCdMs;
  txf.arcSwing = 1;
  if (gameMode === 'mp'){ if (socket) socket.emit('arcburst'); return; }
  onArcBurstFx({ x: me.x, y: me.feetY + 1.1, z: me.z, r: A.burstR, by: 'me' });
  let any = false;
  for (const b of localBots){ if (!b.alive) continue;
    const c = new THREE.Vector3(b.x, 1.1, b.z), o = new THREE.Vector3(me.x, me.feetY + 1.1, me.z), v = c.clone().sub(o), d = v.length();
    if (d > A.burstR) continue;
    _tx.set(o, v.normalize()); _tx.far = d; if (d > 0.2 && _tx.intersectObjects(wallMeshes, false).length) continue;
    b.hp -= A.burstDmg; any = true; if (b.hp <= 0 && b.alive) localKillBot(b); }
  if (any){ hitmark('torso'); Sfx.hit('torso'); }
}
/* everyone's burst: lightning out to the radius, and a flash */
function onArcBurstFx(d){
  if (!d) return;
  const g = new THREE.Group(); g.position.set(d.x, d.y, d.z); scene.add(g);
  const lm = new THREE.LineBasicMaterial({ color: 0xffc860, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 16; k++){
    const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.4) * 0.6, Math.random() - 0.5).normalize();
    const pts = [new THREE.Vector3()]; let p = new THREE.Vector3();
    for (let i = 0; i < 8; i++){ p = p.clone().addScaledVector(dir, d.r / 8); p.add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35)); pts.push(p); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm); l.frustumCulled = false; l.renderOrder = 947; g.add(l);
  }
  const fm = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fm); ball.frustumCulled = false; g.add(ball);
  txf.fx.push({ g, t0: performance.now(), ms: 450, kind: 'arcburst', lm, fm, ball, r: d.r });
  Sfx.arcBurst(d.by === myId || d.by === 'me' ? null : { x: d.x, z: d.z });
}
/* the frame: their effects, the slash swing, the lightning on the blades, the reload */
{ const _wf = weaponsFrame; weaponsFrame = function(dt){
    _wf(dt);
    const now = performance.now();
    if (txf.infReloadAt && now >= txf.infReloadAt){ txf.infMag = TXF.inferno.mag; txf.infReloadAt = 0; Sfx.magIn(); if (curW().kind === 'inferno') updateHUD(); }
    txf.arcSwing = Math.max(0, txf.arcSwing - dt / 0.32);
    const bl = TXF_ARC_BUILT.g.userData.blades, s = Math.sin((1 - txf.arcSwing) * Math.PI) * (txf.arcSwing > 0 ? 1 : 0);
    bl.rotation.set(-0.35 - s * 0.9, 0, -0.25 + txf.arcSide * s * 1.1);
    if (curW().kind === 'arc' && (txf.boltT = (txf.boltT || 0) + dt) > 0.07){ txf.boltT = 0; arcBoltsFrame(TXF_ARC_BUILT.g); }
    for (let i = txf.fx.length - 1; i >= 0; i--){
      const f = txf.fx[i]; if (f.kind !== 'inferno' && f.kind !== 'arcburst') continue;
      const k = (now - f.t0) / f.ms;
      if (k >= 1){ scene.remove(f.g); f.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); txf.fx.splice(i, 1); continue; }
      if (f.kind === 'inferno') for (const p of f.puffs){
        const t = Math.max(0, k - p.d0), dd = p.far * (1 - Math.pow(1 - Math.min(1, t * 1.4), 2));
        p.m.position.copy(f.from).addScaledVector(p.v, dd); p.m.scale.setScalar(0.15 + dd * 0.12); p.m.material.opacity = 0.55 * (1 - k);
      } else { f.ball.scale.setScalar(0.3 + f.r * k); f.fm.opacity = 0.5 * (1 - k); f.lm.opacity = 1 - k; }
    }
  }; }
{ const _timers = onTxfTimers; onTxfTimers = function(d){ _timers(d); if (!d) return;
    const now = performance.now();
    if (d.infMag !== undefined) txf.infMag = d.infMag;
    if (d.infReload !== undefined) txf.infReloadAt = d.infReload > 0 ? now + d.infReload : 0;
    if (d.arcBurst !== undefined) txf.arcBurstAt = now + d.arcBurst; }; }
{ const _reset = txfReset; txfReset = function(){ _reset();
    txf.infMag = TXF.inferno.mag; txf.infReloadAt = 0; txf.arcBurstAt = 0; txf.arcSwing = 0; }; }
