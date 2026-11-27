/* =============================================================
   Crimson X — silvars.js  (unnumbered: loads after effects.js, before hud.js)

   SILVARS on the client: his three abilities on V / G / X, the robots
   drawn and animated, Linked Sight (enemies his team sees, outlined with
   a health bar over the head), Tariq's trap sense, and the practice
   range, where the same robots.js runs locally against the targets.

   The rules live in robots.js. In a match the SERVER runs them and this
   file only draws what arrives ('robots', 'robotfx', 'linked', 'silv');
   on the range this file runs them itself.

   Like the numbered files this is a classic script in the one shared
   scope: it only DEFINES things at load, and everything it calls from
   hud.js (Sfx) is called at run time, after hud.js has loaded.
   ============================================================= */

/* ---- cooldowns: when each is next ready (performance.now) ---- */
const silv = { sensorQ: [], droneAt: 0, dogAt: 0, dogOut: false, droneOut: false, dogHp: 0 };
/* The sensor holds two charges; `sensorQ` is when each spent one comes back. */
function sensorHave(now){ silv.sensorQ = silv.sensorQ.filter(t => t > now); return SILV.sensor.charges - silv.sensorQ.length; }
function sensorNext(now){ return silv.sensorQ.length ? Math.min(...silv.sensorQ) - now : 0; }
function silvReset(){
  silv.sensorQ = []; silv.droneAt = 0; silv.dogAt = 0; silv.dogOut = false; silv.droneOut = false; silv.dogHp = 0;
  clearRobots(); linkedNow.clear(); localLinked.clear(); localTeam.clear(); silv.linkUntil = 0; silv.linkReadyAt = 0;
}
/* The server's answer to every request: ms from now, -1 for "the dog is out". */
function onSilvTimers(d){
  if(!d) return;
  const now = performance.now();
  silv.sensorQ  = (d.sensorQ || []).map(ms => now + ms);
  silv.droneAt  = now + (d.drone || 0);
  silv.dogOut   = d.dog < 0;
  silv.dogAt    = d.dog < 0 ? Infinity : now + (d.dog || 0);
  silv.droneOut = !!d.droneOut;
}
function silvLook(){ return new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch, me.yaw, 0, 'YXZ')); }

/* V: put the sensor on the surface in front of you, within reach. */
function useSensor(){
  const now = performance.now();
  if(gameState!=='playing' || !me.alive) return false;
  if(sensorHave(now) <= 0){ Sfx.empty(); return false; }
  const d = silvLook(), e = camera.position;
  const spot = sensorSpot();
  if(!spot){ Sfx.empty(); return false; }                          // nothing within reach to stick it on
  if(gameMode === 'mp'){ if(socket) socket.emit('sensor', { dx: d.x, dy: d.y, dz: d.z });
    silv.sensorQ.push(now + SILV.sensor.cdMs); Sfx.swap(); return true; }      // the server's answer corrects this
  const n = spot.n, t = spot.t, k = SILV.sensor.r * 0.5;
  const mine = localRobots.filter(r => r.kind === 'sensor');            // two out at most: a third takes the oldest
  while(mine.length >= SILV.sensor.maxOut) localRobots.splice(localRobots.indexOf(mine.shift()), 1);
  localRobots.push(makeRobot('sensor', 'me', e.x + d.x*t + n.nx*k, e.y + d.y*t + n.ny*k, e.z + d.z*t + n.nz*k,
                             { nx: n.nx, ny: n.ny, nz: n.nz, readyAt: 0 }));
  if(!training('noCooldown')) silv.sensorQ.push(now + SILV.sensor.cdMs);
  Sfx.swap();
  return true;
}
/* Where the sensor would go: the surface (or floor) along your look, within
   reach. The server re-casts the same ray, so this is what it will accept. */
function sensorSpot(){
  const d = silvLook(), e = camera.position;
  const h = robotRay(robotGeo(currentMap), e.x, e.y, e.z, d.x, d.y, d.z, SILV.sensor.reach, 'ray');
  const t = h ? h.t : (d.y < -0.2 ? -e.y / d.y : Infinity);
  if(!(t <= SILV.sensor.reach)) return null;
  const n = h || { nx: 0, ny: 1, nz: 0 };
  return { t, n, x: e.x + d.x * t, y: e.y + d.y * t, z: e.z + d.z * t };
}
/* While the sensor is in your hand, a ghost of it shows where it will stick,
   and nothing shows where it cannot go. */
let sensorGhost = null;
function updateSensorGhost(){
  const holding = gameState === 'playing' && me.alive && curW().kind === 'sensor';
  const spot = holding ? sensorSpot() : null;
  if(!spot){ if(sensorGhost) sensorGhost.visible = false; return; }
  if(!sensorGhost){
    sensorGhost = makeSensorMesh();
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffd0d6, transparent: true, opacity: 0.45, depthWrite: false });
    sensorGhost.traverse(o => { if(o.isMesh){ o.material = ghostMat; o.castShadow = false; } });
    scene.add(sensorGhost);
  }
  const k = SILV.sensor.r * 0.5;
  sensorGhost.position.set(spot.x + spot.n.nx * k, spot.y + spot.n.ny * k, spot.z + spot.n.nz * k);
  sensorGhost.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(spot.n.nx, spot.n.ny, spot.n.nz));
  sensorGhost.visible = true;
}
/* G: send the drone. */
function useDrone(){
  const now = performance.now();
  if(gameState!=='playing' || !me.alive) return;
  if(now < silv.droneAt || silv.droneOut){ Sfx.empty(); return; }
  if(gameMode === 'mp'){ if(socket) socket.emit('drone'); return; }
  localRobots.push(makeRobot('drone', 'me', me.x, me.feetY + me.eyeH + 0.6, me.z, { yaw: me.yaw, state: 'follow' }));
  silv.droneAt = training('noCooldown') ? 0 : now + SILV.drone.cdMs;
  Sfx.lock();
}
/* X: release the dog. It runs 10m the way you face. */
function useDog(){
  const now = performance.now();
  if(gameState!=='playing' || !me.alive) return;
  if(now < silv.dogAt || silv.dogOut){ Sfx.empty(); return; }
  if(gameMode === 'mp'){ if(socket) socket.emit('dog'); return; }
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  localRobots.push(makeRobot('dog', 'me', me.x + fx*0.8, 0, me.z + fz*0.8, { yaw: me.yaw, state: 'run', rdx: fx, rdz: fz, ran: 0 }));
  silv.dogOut = true; silv.dogAt = Infinity;
  Sfx.dash();
}
function useAgentKey(k){
  if(k === 'sensor') useSensor(); else if(k === 'drone') useDrone(); else if(k === 'dog') useDog();
}

/* =================== The models: Saltline's Gull and Hound, ours ===================
   Silver, with crimson trim (Jack, 2026-11-27). Both face -Z, so a robot's
   yaw is used exactly like a player's. */
const SILVER = 0x9aa1a9, CRIMSON = 0xc8102e;
function robotMats(){
  if(robotMats.m) return robotMats.m;
  return (robotMats.m = {
    silver: opMat('rb_silver', SILVER, 0.85, 0.32),
    steel:  opMat('rb_steel', 0x5c636b, 0.8, 0.4),
    dark:   opMat('rb_dark', 0x1c1f23, 0.4, 0.6),
    crimson: opMat('rb_crimson', CRIMSON, 0.3, 0.45),
    rubber: opMat('rb_rubber', 0x111214, 0, 0.9),
    lens:   new THREE.MeshBasicMaterial({ color: 0xff2a3c }),
    led:    new THREE.MeshBasicMaterial({ color: 0xff3348 }),
  });
}
const RG = {};
const rgeo = (k, f) => RG[k] || (RG[k] = f());
function rmesh(parent, geo, mat, x, y, z, rx, ry, rz){
  const m = new THREE.Mesh(geo, mat); m.position.set(x||0, y||0, z||0);
  if(rx) m.rotation.x = rx; if(ry) m.rotation.y = ry; if(rz) m.rotation.z = rz;
  m.castShadow = true; parent.add(m); return m;
}
/* THE DRONE (after the Gull): a pod on four arms, each ending in a ducted
   fan with a crimson rim and hazard tabs, two whip antennas, and a chin
   gimbal whose lens and searchlight brighten through the 1s lock. */
function makeDroneMesh(){
  const M = robotMats(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  rmesh(body, rgeo('dpod', () => new THREE.SphereGeometry(0.16, 16, 12)), M.silver, 0, 0, 0).scale.set(1, 0.75, 1.35);
  rmesh(body, rgeo('dspine', () => new THREE.BoxGeometry(0.1, 0.05, 0.36)), M.dark, 0, 0.11, 0);
  const fans = [];
  for(const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const ax = sx * 0.3, az = sz * 0.28;
    const arm = rmesh(body, rgeo('darm', () => new THREE.BoxGeometry(0.05, 0.03, 0.42)), M.steel, ax/2, 0.02, az/2);
    arm.rotation.y = Math.atan2(ax, az);
    const duct = rmesh(body, rgeo('dduct', () => new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20, 1, true)), M.silver, ax, 0.03, az);
    duct.material = M.silver; duct.geometry = RG.dduct;
    const inner = new THREE.Mesh(RG.dduct, M.dark); inner.scale.set(0.97, 1, 0.97); inner.position.set(ax, 0.03, az); body.add(inner);
    inner.material = new THREE.MeshStandardMaterial({ color: 0x1c1f23, side: THREE.BackSide });
    rmesh(body, rgeo('drim', () => new THREE.TorusGeometry(0.16, 0.012, 6, 24)), M.crimson, ax, 0.075, az, Math.PI/2);
    rmesh(body, rgeo('dtab', () => new THREE.BoxGeometry(0.05, 0.05, 0.012)), M.crimson, ax + sx*0.16, 0.03, az, 0, Math.PI/2);
    const rotor = new THREE.Group(); rotor.position.set(ax, 0.03, az); body.add(rotor);
    rmesh(rotor, rgeo('dblade', () => new THREE.BoxGeometry(0.28, 0.006, 0.03)), M.dark, 0, 0, 0);
    rmesh(rotor, RG.dblade, M.dark, 0, 0, 0, 0, Math.PI/2);
    rmesh(rotor, rgeo('dhub', () => new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8)), M.steel, 0, 0, 0);
    fans.push(rotor);
  }
  for(const sx of [-1, 1]) rmesh(body, rgeo('dant', () => new THREE.CylinderGeometry(0.004, 0.006, 0.34, 4)), M.dark, sx*0.05, 0.27, 0.12);
  const gimbal = new THREE.Group(); gimbal.position.set(0, -0.13, -0.12); body.add(gimbal);
  rmesh(gimbal, rgeo('dgim', () => new THREE.SphereGeometry(0.06, 12, 10)), M.dark, 0, 0, 0);
  const lens = rmesh(gimbal, rgeo('dlens', () => new THREE.SphereGeometry(0.03, 10, 8)), M.lens.clone(), 0, -0.01, -0.05);
  /* the searchlight: an additive cone forward and down, like the Gull's */
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3048, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(rgeo('dbeam', () => { const c = new THREE.ConeGeometry(1.2, 8, 20, 1, true); c.translate(0, -4, 0); return c; }), beamMat);
  beam.rotation.x = Math.PI/2 + 0.5; beam.position.set(0, -0.02, -0.06); gimbal.add(beam);
  g.userData = { kind: 'drone', body, fans, lens, beam };
  return g;
}
/* THE DOG (after the Hound): a long silver body with crimson stripes, a
   sensor-block head, an antenna, a crimson beacon, a small gun on its
   back, and four jointed legs that step in diagonal pairs. */
function makeDogMesh(){
  const M = robotMats(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  body.position.y = 0.62;
  rmesh(body, rgeo('gbody', () => new THREE.BoxGeometry(0.34, 0.22, 0.86)), M.silver, 0, 0, 0);
  rmesh(body, rgeo('gtop', () => new THREE.BoxGeometry(0.3, 0.05, 0.7)), M.dark, 0, 0.13, 0.02);
  for(const sx of [-1, 1]) rmesh(body, rgeo('gstripe', () => new THREE.BoxGeometry(0.006, 0.04, 0.62)), M.crimson, sx*0.172, 0.02, 0.02);
  rmesh(body, rgeo('gplate', () => new THREE.BoxGeometry(0.28, 0.1, 0.012)), M.crimson, 0, 0.01, 0.434);
  const head = new THREE.Group(); head.position.set(0, 0.03, -0.5); body.add(head);
  rmesh(head, rgeo('ghead', () => new THREE.BoxGeometry(0.26, 0.15, 0.16)), M.steel, 0, 0, 0);
  rmesh(head, rgeo('gface', () => new THREE.BoxGeometry(0.2, 0.08, 0.02)), M.dark, 0, 0, -0.085);
  const eye = rmesh(head, rgeo('geye', () => new THREE.BoxGeometry(0.12, 0.025, 0.01)), M.lens.clone(), 0, 0.005, -0.097);
  rmesh(body, rgeo('gant', () => new THREE.CylinderGeometry(0.004, 0.007, 0.6, 4)), M.dark, 0.1, 0.45, 0.3);
  const beacon = rmesh(body, rgeo('gbeac', () => new THREE.SphereGeometry(0.03, 8, 6)), M.led.clone(), -0.1, 0.18, 0.28);
  /* the gun: a short barrel on a mount, over the shoulders */
  rmesh(body, rgeo('gmount', () => new THREE.BoxGeometry(0.1, 0.07, 0.16)), M.dark, 0, 0.19, -0.18);
  rmesh(body, rgeo('gbarrel', () => new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8)), M.steel, 0, 0.2, -0.36, Math.PI/2);
  const legs = [];
  /* legs: front-left, front-right, back-left, back-right; hips at the body's corners */
  for(const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const hip = new THREE.Group(); hip.position.set(sx*0.2, -0.06, sz*0.33); body.add(hip);
    rmesh(hip, rgeo('ghip', () => new THREE.SphereGeometry(0.06, 10, 8)), M.steel, 0, 0, 0);
    const thigh = new THREE.Group(); hip.add(thigh);
    rmesh(thigh, rgeo('gthigh', () => { const b = new THREE.BoxGeometry(0.07, 0.3, 0.09); b.translate(0, -0.15, 0); return b; }), M.silver, 0, 0, 0);
    rmesh(thigh, rgeo('gtstripe', () => { const b = new THREE.BoxGeometry(0.075, 0.08, 0.02); b.translate(0, -0.12, 0.046); return b; }), M.crimson, 0, 0, 0);
    const knee = new THREE.Group(); knee.position.y = -0.3; thigh.add(knee);
    rmesh(knee, rgeo('gknee', () => new THREE.SphereGeometry(0.045, 10, 8)), M.dark, 0, 0, 0);
    const shin = new THREE.Group(); knee.add(shin);
    rmesh(shin, rgeo('gshin', () => { const b = new THREE.BoxGeometry(0.045, 0.3, 0.05); b.translate(0, -0.15, 0); return b; }), M.dark, 0, 0, 0);
    rmesh(shin, rgeo('gfoot', () => new THREE.SphereGeometry(0.04, 8, 6)), M.rubber, 0, -0.3, 0);
    legs.push({ thigh, shin, phase: (sx * sz > 0) ? 0 : Math.PI });       // diagonal pairs step together
  }
  g.userData = { kind: 'dog', body, legs, eye, beacon, head };
  return g;
}
/* THE SENSOR: a puck on the surface, a crimson light and a stub antenna.
   It sits proud of the wall so anyone can see it, and shoot it. */
function makeSensorMesh(){
  const M = robotMats(), g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  rmesh(inner, rgeo('spuck', () => new THREE.CylinderGeometry(0.11, 0.13, 0.05, 16)), M.silver, 0, 0.025, 0);
  rmesh(inner, rgeo('sring', () => new THREE.TorusGeometry(0.1, 0.008, 6, 20)), M.crimson, 0, 0.052, 0, Math.PI/2);
  const led = rmesh(inner, rgeo('sled', () => new THREE.SphereGeometry(0.022, 8, 6)), M.led.clone(), 0, 0.06, 0);
  rmesh(inner, rgeo('sant', () => new THREE.CylinderGeometry(0.003, 0.005, 0.14, 4)), M.dark, 0.06, 0.1, 0);
  g.userData = { kind: 'sensor', led, inner };
  return g;
}

/* =================== Drawing what the robots are doing =================== */
const robotGfx = new Map();          // id -> { mesh, kind, target pose, animation state }
function clearRobots(){
  for(const r of robotGfx.values()){ scene.remove(r.mesh); clearTrapMark(r); }
  robotGfx.clear();
  localRobots.length = 0;
  silv.dogOut = false; silv.droneOut = false;
}
/* The robots, as the wire carries them (robotWire in robots.js). */
function onRobots(list){
  const seen = new Set(), now = performance.now();
  for(const w of (list || [])){
    seen.add(w.i);
    let r = robotGfx.get(w.i);
    if(!r){
      const mesh = w.k === 'd' ? makeDroneMesh() : w.k === 'g' ? makeDogMesh() : makeSensorMesh();
      mesh.position.set(w.x, w.y, w.z); mesh.rotation.y = w.w;
      scene.add(mesh);
      r = { mesh, kind: w.k, x: w.x, y: w.y, z: w.z, yaw: w.w, gait: 0, bob: Math.random()*6 };
      robotGfx.set(w.i, r);
      if(w.k === 's'){                            // sensors do not move: face the surface once
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(w.n[0], w.n[1], w.n[2]));
      }
    }
    r.tx = w.x; r.ty = w.y; r.tz = w.z; r.tyaw = w.w; r.hp = w.h; r.state = w.s; r.lock = w.l || 0;
    r.owner = w.o; r.v = w.v || 0; r.lunge = !!w.u; r.ping = w.p;
    if(w.k === 'g' && (w.o === myId || w.o === 'me')) silv.dogHp = w.h;
  }
  for(const [id, r] of robotGfx) if(!seen.has(id)){ scene.remove(r.mesh); clearTrapMark(r); robotGfx.delete(id); }
  // what is out tells the tiles too (the range has no server to say so)
  const mine = [...robotGfx.values()].filter(r => r.owner === myId || r.owner === 'me');
  silv.dogOut = mine.some(r => r.kind === 'g');
  silv.droneOut = mine.some(r => r.kind === 'd');
}
function updateRobotGfx(dt){
  const t = performance.now() / 1000;
  for(const r of robotGfx.values()){
    if(r.tx === undefined) continue;
    const k = 1 - Math.exp(-14 * dt);
    const px = r.x, pz = r.z;
    r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.z += (r.tz - r.z) * k;
    const dy = Math.atan2(Math.sin(r.tyaw - r.yaw), Math.cos(r.tyaw - r.yaw)); r.yaw += dy * k;
    const m = r.mesh, u = m.userData;
    if(r.kind === 's'){
      m.position.set(r.x, r.y, r.z);
      // a slow blink, faster just after it has pinged someone
      u.led.material.color.setHex(Math.sin(t * (r.ping > 0 ? 9 : 2.5)) > 0.2 ? 0xff3348 : 0x40070d);
      updateTrapMark(r);                       // Tariq sees it through walls
      continue;
    }
    m.position.set(r.x, r.y, r.z); m.rotation.y = r.yaw;
    const vx = (r.x - px) / Math.max(dt, 1e-3), vz = (r.z - pz) / Math.max(dt, 1e-3);
    if(r.kind === 'd'){
      // hover bob, fans spinning, a tilt into the direction it flies
      for(const f of u.fans) f.rotation.y += dt * 60;
      const fwd = -(vx * Math.sin(r.yaw) + vz * Math.cos(r.yaw)), side = vx * Math.cos(r.yaw) - vz * Math.sin(r.yaw);
      u.body.rotation.x += (-Math.max(-0.5, Math.min(0.5, fwd * 0.05)) - u.body.rotation.x) * k;
      u.body.rotation.z += (-Math.max(-0.4, Math.min(0.4, side * 0.05)) - u.body.rotation.z) * k;
      u.body.position.y = Math.sin(t * 2.3 + r.bob) * 0.04;
      // the lock: the lens and the searchlight brighten over the second, then glare on the dive
      const L = r.state === 4 ? 1 : r.lock;
      u.lens.material.color.setRGB(1, 0.15 + 0.6 * L, 0.2 + 0.6 * L);
      u.beam.material.opacity = 0.06 + 0.3 * L + (r.state === 3 ? 0.08 * Math.sin(t * 30) : 0);
    } else {
      // the gait: speed drives the phase; each diagonal pair swings together
      const spd = r.lunge ? 9 : Math.hypot(vx, vz);
      r.gait += dt * (2 + spd * 1.7);
      const amp = Math.min(0.7, spd * 0.09);
      for(const L of u.legs){
        const s = Math.sin(r.gait + L.phase);
        L.thigh.rotation.x = s * amp - 0.25;
        L.shin.rotation.x = 0.55 + Math.max(0, -Math.cos(r.gait + L.phase)) * amp * 0.9;
      }
      u.body.position.y = 0.62 + Math.abs(Math.sin(r.gait)) * amp * 0.04 - (r.lunge ? 0.05 : 0);
      u.body.rotation.x = r.lunge ? -0.25 : -Math.min(0.08, spd * 0.006);
      u.beacon.material.color.setHex(Math.sin(t * 6) > 0 ? 0xff3348 : 0x40070d);
    }
    updateTrapMark(r);
  }
}

/* What the robots do, to see and to hear. */
function onRobotFx(d){
  if(!d) return;
  const at = { x: d.x, z: d.z };
  if(d.k === 'beep') Sfx.beep(at);
  else if(d.k === 'lock' || d.k === 'dogtele') Sfx.lock(at);
  else if(d.k === 'dive') Sfx.dash();
  else if(d.k === 'crash'){ boom(d.x, Math.max(0, d.y - 0.3), d.z); }
  else if(d.k === 'bite') Sfx.bite(at);
  else if(d.k === 'dogshot'){
    const o = new THREE.Vector3(d.x, d.y, d.z), e = new THREE.Vector3(d.ex, d.ey, d.ez);
    const len = o.distanceTo(e) || 0.01;
    addTracer(o, e.clone().sub(o).divideScalar(len), len);
    Sfx.shoot(WEAPONS[3], at);
  }
  else if(d.k === 'die'){
    if(d.kind !== 'sensor') boom(d.x, Math.max(0, (d.y || 0)), d.z);
    else Sfx.hit();
  }
}

/* =================== Linked Sight ===================
   Who the team can see right now, and their health: an outline through
   walls and a bar over the head, for as long as the server says (2s,
   renewed while they stay seen). On the range it is the targets. */
const MARK_LINK = 0x9fd8ff;          // silver-blue: not the smoke's green or the hearing's amber
const linkedNow = new Map();         // player id -> { hp, until }
const localLinked = new Map();       // range target -> until (what he is shown)
const localTeam = new Map();         // range target -> until (what his robots know)
function onLinked(d){
  const now = performance.now(), list = Array.isArray(d) ? d : (d && d.l) || [];
  linkedNow.clear();
  for(const e of list) linkedNow.set(e.id, { hp: e.hp, until: now + e.ms });
  if(d && !Array.isArray(d)){ silv.linkReadyAt = now + (d.r || 0); silv.linkUntil = now + (d.u || 0); }
}
function isLinked(o){
  if(gameMode === 'mp'){ const e = linkedNow.get(o.id); return !!e && e.until > performance.now(); }
  return (localLinked.get(o) || 0) > performance.now();
}
/* the bar over a head: two quads, drawn through walls, turned to the camera */
const HPBAR = {};
function hpBar(parent){
  if(!HPBAR.geo){
    HPBAR.geo = new THREE.PlaneGeometry(0.8, 0.09);
    HPBAR.back = new THREE.MeshBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
    HPBAR.fill = new THREE.MeshBasicMaterial({ color: MARK_LINK, depthTest: false, depthWrite: false });
  }
  const g = new THREE.Group(), back = new THREE.Mesh(HPBAR.geo, HPBAR.back), fill = new THREE.Mesh(HPBAR.geo, HPBAR.fill);
  fill.scale.y = 0.6; fill.position.z = 0.001;
  back.renderOrder = 905; fill.renderOrder = 906;
  g.add(back); g.add(fill); g.position.y = 2.15; g.userData.fill = fill;
  parent.add(g); return g;
}
function setHpBar(bar, hp){
  const f = Math.max(0, Math.min(1, hp / 100)), fill = bar.userData.fill;
  fill.scale.x = Math.max(0.001, f); fill.position.x = -0.4 * (1 - f);
  const q = new THREE.Quaternion(); bar.parent.getWorldQuaternion(q);
  bar.quaternion.copy(q.invert().multiply(camera.quaternion));
}
function updateLinked(){
  if(gameMode === 'mp'){
    for(const o of others.values()){
      const on = o.mesh.visible && isLinked(o);
      if(on && !o.hpBar) o.hpBar = hpBar(o.mesh);
      else if(!on && o.hpBar){ o.mesh.remove(o.hpBar); o.hpBar = null; }
      if(o.hpBar) setHpBar(o.hpBar, linkedNow.get(o.id).hp);
    }
  }
}

/* =================== Tariq's trap sense ===================
   Aseed (Tariq) sees enemy traps through walls within his hearing's 40m,
   the same see-through outline a heard player gets. The sensor is the
   first trap. */
const TRAP_RANGE = 40;
let TRAP_MAT = null;
function updateTrapMark(r){
  const want = r.kind === 's' && myAgent === 'aseed' && r.owner !== myId && r.owner !== 'me'
    && Math.hypot(r.x - camera.position.x, r.z - camera.position.z) <= TRAP_RANGE;
  if(want && !r.trap){
    TRAP_MAT = TRAP_MAT || new THREE.MeshBasicMaterial({ color: MARK_HEARD, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false });
    r.trap = new THREE.Mesh(rgeo('trapball', () => new THREE.SphereGeometry(0.2, 10, 8)), TRAP_MAT);
    r.trap.renderOrder = 900; r.mesh.add(r.trap);
  } else if(!want && r.trap) clearTrapMark(r);
}
function clearTrapMark(r){ if(r.trap){ r.mesh.remove(r.trap); r.trap = null; } }

/* =================== The range: the same robots, run here =================== */
const localRobots = [];
function localRobotWorld(now){
  return {
    G: robotGeo(currentMap), now,
    owner: id => id === 'me' ? { id: 'me', x: me.x, y: me.feetY, z: me.z, yaw: me.yaw, alive: me.alive } : null,
    enemies: () => localBots.map(b => ({ id: b, x: b.x, y: 0, z: b.z, st: 0, alive: b.alive, ref: b })),
    known: () => localTeam,
    reveal: (o, id) => {                         // the same rule as the server's
      localTeam.set(id, now + SILV.linkMs);
      if(now >= (silv.linkUntil || 0)){
        if(now < (silv.linkReadyAt || 0)) return;
        silv.linkUntil = now + SILV.linkMs; silv.linkReadyAt = silv.linkUntil + SILV.linkCdMs;
      }
      localLinked.set(id, silv.linkUntil);
    },
    hurt: (r, t, dmg) => {
      const b = t.ref; if(!b.alive) return;
      b.hp -= dmg; hitmark('torso'); Sfx.hit('torso');
      if(b.hp <= 0){ b.alive = false; b.mesh.visible = false; extinguish(b);
        localKills++; updateHUD(); setTimeout(() => respawnLocalBot(b), 2000); }   // no cooldowns cleared: Silvars has no kill reset
    },
    fx: (k, d) => onRobotFx(Object.assign({ k }, d)),
    gone: (r) => { if(r.kind === 'dog'){ silv.dogOut = false; silv.dogAt = training('noCooldown') ? 0 : performance.now() + SILV.dog.cdMs; }
                   if(r.why !== 'crash') onRobotFx({ k: 'die', kind: r.kind, x: r.x, y: r.y, z: r.z }); },
  };
}
function stepLocalRobots(dt){
  if(gameMode !== 'bots') return;
  const now = performance.now();
  if(localRobots.length) stepRobots(localRobotWorld(now), localRobots, dt);
  /* Silvars' own eyes tell his robots who is there, but light nobody up */
  if(myAgent === 'silvars' && me.alive){
    const G = robotGeo(currentMap), e = camera.position, fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    for(const b of localBots){
      if(!b.alive) continue;
      const dx = b.x - e.x, dz = b.z - e.z, h = Math.hypot(dx, dz);
      if(h > SILV.sight || (h > 1.5 && (dx*fx + dz*fz) / h < SILV.ownCos)) continue;
      if(robotLos(G, e.x, e.y, e.z, b.x, 1.1, b.z)) localTeam.set(b, now + SILV.linkMs);
    }
  }
  onRobots(localRobots.map(r => robotWire(r, now)));
}

/* On the range: your own sensor along a shot, nearer than `maxT`, if any.
   (In a match the server decides, robotOnRay.) */
function shotSensor(o, dir, maxT){
  let best = null;
  for(const r of localRobots){
    if(r.kind !== 'sensor' || !r.alive) continue;
    const t = robotHitT(r, o.x, o.y, o.z, dir.x, dir.y, dir.z);
    if(t < maxT && (!best || t < best.t)) best = { r, t };
  }
  return best;
}
/* One call a frame from loop.js. */
function updateSilvars(dt){
  stepLocalRobots(dt);
  updateRobotGfx(dt);
  updateLinked();
  updateSensorGhost();
}
