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
  myAgent = 'aseed'; configureTiles(); updateHUD();
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
    if(k >= 1){ scene.remove(f.g); f.g.traverse(o => { if(o.geometry && o.geometry !== BEAM.geo) o.geometry.dispose(); }); txf.fx.splice(i, 1); continue; }
    if(f.kind === 'tele'){ f.mat.opacity = 0.85 * (1 - k); f.col.scale.set(1 - k * 0.7, 1 + k * 0.6, 1 - k * 0.7); f.ring.scale.setScalar(1 + k * 3); }
    else { const r = Math.max(1, f.r * (1 - Math.pow(1 - k, 3))); f.shell.scale.setScalar(r); f.ring.scale.setScalar(r); f.mat.opacity = 0.45 * (1 - k); f.ringMat.opacity = 0.7 * (1 - k); }
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
