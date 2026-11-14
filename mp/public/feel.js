/* =============================================================
   Crimson X — feel.js  (after hud.js, before loop.js; unnumbered)

   What a shot FEELS like, as opposed to what it does. Nothing in here
   changes a hit, a number or a packet: it is all drawn or shaken on top.

   - a muzzle flash: a burst of light that really lights the room (point
     lights reach the lit arena's surfaces) and a flare at the barrel
   - sparks where a round lands
   - a kick in the camera on your own shots
   - a SPRING on the weapon, so it lags a turn and settles instead of
     being bolted to the view
   - practice targets that walk a beat instead of standing still

   It hooks addTracer, which every shot already calls with where the round
   started and how far it went, so there is one place to keep in step.

   These files are CLASSIC scripts sharing ONE global scope.
   ============================================================= */

const FEEL = { flashMs: 55, flashLight: 2.6, sparks: 9, sparkLife: 0.42, kick: 0.012,
               swayK: 90, swayDamp: 13, swayGain: 0.9, patrol: 3.2, patrolSpeed: 1.3 };

/* ---- Muzzle flash ----
   ONE light, made now and left in the scene at zero. Adding a light per
   shot would change the scene's light count, and Three recompiles every
   material when that changes: a hitch on the first round of every burst. */
const flashLight = new THREE.PointLight(0xffc27a, 0, 14, 2);
scene.add(flashLight);
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,244,210,1)'); r.addColorStop(0.25, 'rgba(255,190,90,0.8)'); r.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending,
  depthWrite: false, transparent: true, opacity: 0 }));
flashSprite.renderOrder = 1001; scene.add(flashSprite);
let flashT = 0;

/* ---- Sparks ----
   A fixed pool drawn as one Points object. A spark is a position, a
   velocity and a life; dead ones are parked far below the floor. */
const SPARK_N = 160;
const sparkPos = new Float32Array(SPARK_N * 3).fill(-999), sparkVel = new Float32Array(SPARK_N * 3), sparkLife = new Float32Array(SPARK_N);
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc66a, size: 0.07, map: flashTex,
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sparks.frustumCulled = false; scene.add(sparks);
let sparkNext = 0;
function spawnSparks(x, y, z, dx, dy, dz){
  for (let i = 0; i < FEEL.sparks; i++){
    const k = sparkNext = (sparkNext + 1) % SPARK_N, s = 2.5 + Math.random() * 4.5;
    sparkPos[k*3] = x; sparkPos[k*3+1] = y; sparkPos[k*3+2] = z;
    // back the way the round came, spread wide, with a little lift
    sparkVel[k*3]   = (-dx + (Math.random() - 0.5) * 1.6) * s;
    sparkVel[k*3+1] = (-dy + (Math.random() - 0.2) * 1.4) * s;
    sparkVel[k*3+2] = (-dz + (Math.random() - 0.5) * 1.6) * s;
    sparkLife[k] = FEEL.sparkLife * (0.5 + Math.random() * 0.5);
  }
}

/* ---- The hook ---- */
let camKick = 0;
const baseAddTracer = addTracer;
addTracer = function(o, dir, len, from){
  baseAddTracer(o, dir, len, from);
  const start = from || o;
  flashLight.position.copy(start); flashSprite.position.copy(start).addScaledVector(dir, 0.12);
  flashSprite.material.rotation = Math.random() * 6.28; flashSprite.scale.setScalar(0.34 + Math.random() * 0.14);
  flashT = FEEL.flashMs / 1000;
  /* The floor is not one of the meshes a shot is ray-tested against, so a
     round fired into it reports its full range. Meet the floor here. */
  const hit = dir.y < -0.001 ? Math.min(len, -o.y / dir.y) : len;
  if (hit < 180) spawnSparks(o.x + dir.x * hit, Math.max(0.03, o.y + dir.y * hit), o.z + dir.z * hit, dir.x, dir.y, dir.z);   // it stopped on something
  // only your own shots kick your view: they are the ones that start at your eye
  if (o.distanceToSquared(camera.position) < 0.01) camKick = Math.min(1, camKick + 0.55);
};

/* ---- The spring on the weapon ---- */
let swayX = 0, swayY = 0, swayVX = 0, swayVY = 0, lastYaw = 0, lastPitch = 0;

/* Called once a frame from loop(), after it has posed the camera and gun,
   so everything here is an offset laid over this frame's pose. */
function feelFrame(dt){
  // flash: gone in a twentieth of a second
  if (flashT > 0){ flashT = Math.max(0, flashT - dt); const k = flashT / (FEEL.flashMs / 1000);
    flashLight.intensity = FEEL.flashLight * k; flashSprite.material.opacity = k; }
  else if (flashLight.intensity){ flashLight.intensity = 0; flashSprite.material.opacity = 0; }

  let live = false;
  for (let k = 0; k < SPARK_N; k++){ if (sparkLife[k] <= 0) continue; live = true;
    sparkLife[k] -= dt; sparkVel[k*3+1] -= 12 * dt;
    sparkPos[k*3] += sparkVel[k*3] * dt; sparkPos[k*3+1] += sparkVel[k*3+1] * dt; sparkPos[k*3+2] += sparkVel[k*3+2] * dt;
    if (sparkPos[k*3+1] < 0.02){ sparkPos[k*3+1] = 0.02; sparkVel[k*3+1] *= -0.35; }       // they skip on the floor
    if (sparkLife[k] <= 0) sparkPos[k*3+1] = -999; }
  if (live || sparks.userData.dirty){ sparkGeo.attributes.position.needsUpdate = true; sparks.userData.dirty = live; }

  if (gameState !== 'playing') return;

  // camera kick: a snap up and a hair of roll, decaying fast. The aim itself
  // (me.pitch) is untouched; loop() rebuilds the camera from it next frame.
  if (camKick > 0.001){ camera.rotation.x += camKick * FEEL.kick; camera.rotation.z += camKick * FEEL.kick * 0.35 * Math.sin(performance.now() * 0.09);
    camKick *= Math.exp(-18 * dt); }

  // the spring: turning the view pushes the weapon the other way, and it
  // swings back and settles. Less of it while aiming down the sight.
  let dyaw = me.yaw - lastYaw, dp = me.pitch - lastPitch; lastYaw = me.yaw; lastPitch = me.pitch;
  if (Math.abs(dyaw) > 1) dyaw = 0;                                 // a respawn or a wrap, not a turn
  swayVX += (dyaw * FEEL.swayGain / Math.max(dt, 0.004) * 0.016 - swayX * FEEL.swayK * dt) ; swayVX *= Math.exp(-FEEL.swayDamp * dt);
  swayVY += (dp   * FEEL.swayGain / Math.max(dt, 0.004) * 0.016 - swayY * FEEL.swayK * dt) ; swayVY *= Math.exp(-FEEL.swayDamp * dt);
  swayX = Math.max(-0.12, Math.min(0.12, swayX + swayVX * dt * 6)); swayY = Math.max(-0.1, Math.min(0.1, swayY + swayVY * dt * 6));
  const a = 1 - (typeof ads !== 'undefined' ? ads : 0) * 0.8;
  gun.position.x += swayX * 0.22 * a; gun.position.y -= swayY * 0.18 * a;
  gun.rotation.y += swayX * 0.9 * a;  gun.rotation.x -= swayY * 0.7 * a; gun.rotation.z += swayX * 0.5 * a;

  // practice targets walk a beat: out and back along one line, turning at
  // anything in the way. A standing target teaches aim; a moving one
  // teaches leading, which is the half of shooting the range never had.
  if (gameMode === 'bots' && !paused) for (const b of localBots){
    if (!b.alive) continue;
    if (b.ox === undefined || Math.hypot(b.x - b.ox, b.z - b.oz) > FEEL.patrol + 1.5){     // new, or respawned somewhere else
      b.ox = b.x; b.oz = b.z; b.pa = Math.random() * 6.28; b.pd = 1; }
    const nx = b.x + Math.cos(b.pa) * FEEL.patrolSpeed * b.pd * dt, nz = b.z + Math.sin(b.pa) * FEEL.patrolSpeed * b.pd * dt;
    if (Math.hypot(nx - b.ox, nz - b.oz) > FEEL.patrol || insideWall(nx, nz) || Math.abs(nx) > ARENA - 3 || Math.abs(nz) > ARENA - 3) b.pd = -b.pd;
    else { b.x = nx; b.z = nz; b.mesh.position.x = nx; b.mesh.position.z = nz;
      const u = b.mesh.userData; if (u && u.ll){ u.walk += dt * 7; const s = Math.sin(u.walk) * 0.45;
        u.ll.rotation.x = s; u.rl.rotation.x = -s; u.la.rotation.x = -s * 0.6; } }
  }
}
