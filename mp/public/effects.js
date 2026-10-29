/* =============================================================
   Bot Strike — effects.js  (7 of 9 in load order)

   Fire pools, smoke clouds, through-wall marks, arrows and burn FX.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after input.js and before hud.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Ground fire: the pool an arrow leaves where it lands ----
   Solid, unlit discs plus a few tongues — NOT additive, which is invisible
   against a bright floor, and no point light, which would blow the ground out
   to a white disc. This is the fire you actually see; a person only burns for
   WEAPONS[XBOW].burnMs, but the pool stays for GFIRE.ms. */
/* radius is 3x the original 1.45. tongueCount/tongueScale follow it, or a
   wide pool is just a flat orange disc with a few specks on it. */
/* top/graceMs mirror the server's FIRE block — standing in a pool burns you.
   Keep radius and ms in step with the server or the fire you see won't be
   the fire that hurts. */
/* Mirrors the server's BOUNCE: a reflected bolt is spent, keeping little of
   its speed and only a short time to run. */
const BOUNCE = { keep:0.55, lifeS:1.1 };

const GFIRE = { ms:9000, radius:4.35, baseRadius:1.45, max:14, fadeMs:1200,
                top:1.0, graceMs:1200, dps:18,     // dps must match the server's FIRE.dps
                lingerDps:6, lingerMs:5000 };      // still alight after stepping out
const groundFires = [];
function spawnGroundFire(x, y, z){
  while(groundFires.length >= GFIRE.max) removeGroundFire(groundFires[0]);
  const g = new THREE.Group(); g.position.set(x, y||0, z);   // sits where the bolt stopped
  const flat = (r, color, opacity, y)=>{
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthWrite:false }));
    m.rotation.x = -Math.PI/2; m.position.y = y; g.add(m); return m;
  };
  const disc  = flat(GFIRE.radius,      0xff4a08, 0.55, 0.02);   // outer pool
  const inner = flat(GFIRE.radius*0.55, 0xffb020, 0.75, 0.03);   // hot centre
  const grow  = GFIRE.radius/GFIRE.baseRadius;
  const count = Math.max(7, Math.round(7*grow));       // keep the pool populated
  const ts    = Math.sqrt(grow);                       // flames grow, but slower
  const tongues = [];
  for(let i=0;i<count;i++){
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.17*ts, 0.62*ts, 6),
      new THREE.MeshBasicMaterial({ color:i%2?0xff8a12:0xff3d05, transparent:true, opacity:0.8, depthWrite:false }));
    // golden-angle spread so they scatter instead of forming a visible ring
    const ang = i*2.39996, r = GFIRE.radius*Math.sqrt((i+0.5)/count)*0.85;
    m.position.set(Math.cos(ang)*r, 0.31*ts, Math.sin(ang)*r);
    g.add(m); tongues.push(m);
  }
  scene.add(g);
  const f = { g, disc, inner, tongues, until:performance.now()+GFIRE.ms, t:Math.random()*10 };
  groundFires.push(f);
  return f;
}
function removeGroundFire(f){
  scene.remove(f.g);
  f.g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  const i = groundFires.indexOf(f); if(i>=0) groundFires.splice(i,1);
}
function clearGroundFires(){ while(groundFires.length) removeGroundFire(groundFires[0]); }
function updateGroundFires(dt){
  const now = performance.now();
  for(let i=groundFires.length-1;i>=0;i--){
    const f = groundFires[i], left = f.until-now;
    if(left <= 0){ removeGroundFire(f); continue; }
    f.t += dt*7;
    const fade = Math.min(1, left/GFIRE.fadeMs);       // ease out at the end
    f.tongues.forEach((m,k)=>{
      const sc = 0.7+Math.sin(f.t+k*1.9)*0.3;
      m.scale.set(sc, 1+Math.sin(f.t*1.4+k)*0.45, sc);
      m.material.opacity = (0.55+Math.sin(f.t*1.7+k)*0.25)*fade;
    });
    f.disc.material.opacity  = (0.45+Math.sin(f.t*0.9)*0.12)*fade;
    f.inner.material.opacity = (0.65+Math.sin(f.t*1.2)*0.15)*fade;
  }
}

/* ---- Smoke cloud: the smoke bolt's payload ----
   Deliberately cheap. The expensive way to do smoke is hundreds of large
   transparent sprites, and the cost lands exactly when you stand inside it —
   the screen fills with overlapping transparent layers. This is a couple of
   dozen low-opacity spheres instead, no particle system and no lights, and
   they thin out as the camera gets close so being inside is cheaper than
   looking at it from outside.
   Anyone who walks in is MARKED for markMs: the thrower sees them through
   walls, and the timer renews for as long as they stay in the cloud. */
const SMOKEFX = { ms:10000, radius:5.5, puffs:22, fadeMs:1500, markMs:4000, top:3.4 };
const smokes = [];
function spawnSmoke(x, y, z, byId){
  while(smokes.length >= 8) removeSmoke(smokes[0]);
  const g = new THREE.Group(); g.position.set(x, y||0, z);   // sits where the bolt stopped
  const puffs = [];
  for(let i=0;i<SMOKEFX.puffs;i++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25+Math.random()*0.75, 8, 8),
      new THREE.MeshLambertMaterial({ color:0x9aa0a8, transparent:true, opacity:0.0, depthWrite:false }));
    // golden angle, packed low and wide so it reads as a ground cloud
    const ang = i*2.39996, r = SMOKEFX.radius*Math.sqrt((i+0.5)/SMOKEFX.puffs)*0.8;
    m.position.set(Math.cos(ang)*r, 0.5+Math.random()*1.9, Math.sin(ang)*r);
    m.userData.baseY = m.position.y;
    m.userData.spin = (Math.random()-0.5)*0.5;
    g.add(m); puffs.push(m);
  }
  scene.add(g);
  const sm = { g, puffs, x, y:y||0, z, by:byId||null, born:performance.now(),
               until:performance.now()+SMOKEFX.ms, t:Math.random()*10 };
  smokes.push(sm);
  return sm;
}
function removeSmoke(sm){
  scene.remove(sm.g);
  sm.g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  const i = smokes.indexOf(sm); if(i>=0) smokes.splice(i,1);
}
function clearSmoke(){ while(smokes.length) removeSmoke(smokes[0]); }
/* Is this point inside any cloud? Height matters, so someone on top of a
   crate above the smoke is not tagged. Returns the cloud, or null. */
/* Is this point standing in a fire pool? Mirrors smokeAt, including the
   height check so someone up on a crate is clear of it. */
function fireAt(x, y, z){
  for(const f of groundFires){
    const fy = f.g.position.y;                    // a pool can sit on a crate
    if(y < fy - 0.6 || y > fy + GFIRE.top) continue;
    if(Math.hypot(x-f.g.position.x, z-f.g.position.z) <= GFIRE.radius) return f;
  }
  return null;
}
function smokeAt(x, y, z){
  for(const sm of smokes){
    const sy = sm.y || 0;                         // a cloud can sit on a crate
    if(y < sy - 0.6 || y > sy + SMOKEFX.top) continue;
    if(Math.hypot(x-sm.x, z-sm.z) <= SMOKEFX.radius) return sm;
  }
  return null;
}
function updateSmoke(dt){
  const now = performance.now();
  for(let i=smokes.length-1;i>=0;i--){
    const sm = smokes[i], left = sm.until-now;
    if(left <= 0){ removeSmoke(sm); continue; }
    sm.t += dt;
    const grow = Math.min(1, (now-sm.born)/900);                  // billow out
    const fade = Math.min(1, left/SMOKEFX.fadeMs) * grow;
    // thin the cloud out when the camera is inside it: fill rate is the only
    // real cost here, and that is when it bites
    const d = Math.hypot(camera.position.x-sm.x, camera.position.z-sm.z);
    const near = Math.max(0.35, Math.min(1, (d-1.5)/(SMOKEFX.radius*0.8)));
    sm.g.scale.setScalar(0.55+0.45*grow);
    sm.puffs.forEach((m,k)=>{
      m.position.y = m.userData.baseY + Math.sin(sm.t*0.6+k)*0.12;
      m.rotation.y += m.userData.spin*dt;
      m.material.opacity = 0.24*fade*near;
    });
  }
  updateSmokeVeil();      // runs with no clouds too, so it can ease back out
}

/* ---- Standing inside the smoke ----
   From the inside the puffs give you nothing: you are inside those spheres,
   which are front-face only and so cull to nothing, and they are thinned down
   near the camera anyway to save fill rate. Rather than fight that with more
   geometry, draw a flat veil across the view — ONE camera-attached quad.
   Deliberately not a blur: backdrop-filter or a blur pass re-reads the whole
   framebuffer every frame, which is the exact cost we are avoiding, and a
   blur hides people worse because movement still reads through it.
   It sits at z=-1 so your own weapon (at ~0.55) stays in front of it, and at
   renderOrder 850 so detection silhouettes (900) still show through — your
   passive keeps working in smoke. */
let smokeVeil = null;
function ensureSmokeVeil(){
  if(smokeVeil) return smokeVeil;
  smokeVeil = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({ color:0x9aa0a8, transparent:true, opacity:0,
      depthTest:false, depthWrite:false }));
  smokeVeil.position.z = -1;
  smokeVeil.renderOrder = 850;
  smokeVeil.frustumCulled = false;
  smokeVeil.visible = false;
  camera.add(smokeVeil);
  return smokeVeil;
}
function updateSmokeVeil(){
  const v = ensureSmokeVeil(), mat = v.material;
  // 0 at the edge of a cloud, 1 dead centre; the deepest cloud wins
  let depth = 0;
  for(const sm of smokes){
    const sy = sm.y || 0;
    if(camera.position.y < sy - 0.6 || camera.position.y > sy + SMOKEFX.top) continue;
    const d = Math.hypot(camera.position.x - sm.x, camera.position.z - sm.z);
    if(d < SMOKEFX.radius) depth = Math.max(depth, 1 - d/SMOKEFX.radius);
  }
  const target = Math.min(1, depth*1.6) * 0.94;   // near-opaque before the centre
  mat.opacity += (target - mat.opacity) * 0.18;   // ease, so walking in isn't a snap
  if(mat.opacity < 0.004) mat.opacity = 0;
  v.visible = mat.opacity > 0;
  if(!v.visible) return;
  // fill the frustum at whatever FOV we are on (ADS and sprint both move it)
  const h = 2 * Math.tan(camera.fov * Math.PI/360);
  v.scale.set(h * camera.aspect * 1.15, h * 1.15, 1);
}

/* ---- Marked opponents: drawn through walls, for the thrower only ----
   depthTest:false is what puts the silhouette over the geometry; renderOrder
   keeps it behind your own viewmodel (switchWeapon pushes that to 1000). */
const MARK_SMOKE = 0x27ff9e;     // you tagged them by walking them through smoke
const MARK_HEARD = 0xffd15a;     // your passive heard them open fire
function makeMarkFx(parent, color){
  const mat = new THREE.MeshBasicMaterial({ color: color||MARK_SMOKE, transparent:true,
    opacity:0.5, depthTest:false, depthWrite:false });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,1.45,10), mat);
  body.position.y = 0.82;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29,10,10), mat);
  head.position.y = 1.76;
  g.add(body); g.add(head);
  g.traverse(o=>{ o.renderOrder = 900; o.frustumCulled = false; });
  parent.add(g);
  return g;
}
function clearMark(e){
  if(!e.mark) return;
  e.mesh.remove(e.mark);
  e.mark.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  e.mark = null;
}
/* One place decides who is lit up: local bots are tested against the clouds
   here, networked players arrive already marked by the server. */
/* The passive reveals PEOPLE who make a noise, and nothing else. It used to
   also draw fire pools and smoke clouds through walls, on the reading that
   those stand in for "traps" — but traps are not in the game yet, so that was
   inventing a feature. Kept as a no-op rather than deleted so the call sites
   stay honest about where it would go back in. */
function revealHazards(on){ /* intentionally does nothing: no traps yet */ }
function updateMarks(){
  const now = performance.now();
  for(const b of localBots){
    // stationary targets, so a pool landing on one keeps burning it
    if(b.alive && fireAt(b.x, 0, b.z)){
      if(!b.burnUntil) b.burnNext = now + 1000;
      b.burnUntil = now + GFIRE.graceMs;               // renews while it stands in it
      b.burnDps = Math.max(b.burnDps||0, GFIRE.dps);   // a pool never slows a fiercer burn
      if(!b.fire) b.fire = makeBurnFx(b.mesh);
      b.inFire = true;
    } else if(b.inFire){
      // walked out still alight, at the lower lingering rate
      b.inFire = false;
      if(b.burnDps === GFIRE.dps) b.burnDps = GFIRE.lingerDps;
      const until = now + GFIRE.lingerMs;
      if((b.burnUntil||0) < until) b.burnUntil = until;
      if(!b.burnNext || b.burnNext > now + 1000) b.burnNext = now + 1000;
    }
    if(b.alive && smokeAt(b.x, 0, b.z)) b.markedUntil = now + SMOKEFX.markMs;
    const on = b.alive && (b.markedUntil||0) > now;
    if(on && !b.mark) b.mark = makeMarkFx(b.mesh);
    else if(!on && b.mark) clearMark(b);
  }
  for(const o of others.values()){
    // two ways to see someone through a wall: you smoked them, or your passive
    // heard them shoot. Smoke wins the colour if both are true.
    const smoked = o.mesh.visible && o.markedBy && o.markedBy === myId;
    const heard  = o.mesh.visible && detectTarget === o.id;
    const want   = smoked ? MARK_SMOKE : heard ? MARK_HEARD : null;
    if(want && (!o.mark || o.markColor !== want)){
      clearMark(o); o.mark = makeMarkFx(o.mesh, want); o.markColor = want;
    } else if(!want && o.mark){ clearMark(o); o.markColor = null; }
    // someone who is alight should look it — the server tells us who is
    const lit = o.mesh.visible && o.tburn;
    if(lit && !o.fire) o.fire = makeBurnFx(o.mesh);
    else if(!lit && o.fire) clearBurnFx(o);
    if(o.fire) updateBurnFx(o.fire, 1/60);
  }
}

/* ===================== FLAMING ARROWS (crossbow) =====================
   Real projectiles, not hitscan. In target practice the client simulates
   them; in multiplayer the server does, and we just render what it sends. */
const arrows = [];                 // locally simulated (target practice)
const arrowGfx = new Map();        // id -> mesh, for server-driven arrows
function makeArrowMesh(){
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.75,6),
    new THREE.MeshBasicMaterial({color:0x2a2018}));
  shaft.rotation.x=Math.PI/2; g.add(shaft);
  const head=new THREE.Mesh(new THREE.ConeGeometry(0.075,0.22,8),
    new THREE.MeshBasicMaterial({color:0xffd9a0}));
  head.rotation.x=-Math.PI/2; head.position.z=-0.45; g.add(head);
  // Flame built from SOLID layers, not additive — additive orange is invisible
  // against a bright sky/floor, which is why the fire couldn't be seen.
  const flame=new THREE.Mesh(new THREE.SphereGeometry(0.3,10,10),
    new THREE.MeshBasicMaterial({color:0xff5a05, transparent:true, opacity:0.8, depthWrite:false}));
  flame.position.z=-0.18; g.add(flame);
  const core=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,10),
    new THREE.MeshBasicMaterial({color:0xffe9a0}));
  core.position.z=-0.2; g.add(core);
  // a short trail of shrinking embers so it reads as a streak in flight
  const trail=[];
  for(let i=0;i<4;i++){
    const t=new THREE.Mesh(new THREE.SphereGeometry(0.2-i*0.04,8,8),
      new THREE.MeshBasicMaterial({color:i<2?0xff7a16:0xcf3a06, transparent:true, opacity:0.55-i*0.11, depthWrite:false}));
    t.position.z = 0.18 + i*0.22; g.add(t); trail.push(t);
  }
  const light=new THREE.PointLight(0xff7a1a, 0.7, 3.5); g.add(light);   // subtle, won't wash out the floor
  g.userData={flame,core,trail,light};
  return g;
}
function aimArrow(mesh,vel){ const p=mesh.position;
  mesh.lookAt(p.x+vel.x, p.y+vel.y, p.z+vel.z); }      // model points -Z
function flickerArrow(mesh,t){ const u=mesh.userData; if(!u||!u.flame) return;
  const f=0.85+Math.sin(t*0.04)*0.18;
  u.flame.scale.setScalar(f);
  if(u.core) u.core.scale.setScalar(0.9+Math.sin(t*0.07)*0.15);
  if(u.trail) u.trail.forEach((s,i)=> s.scale.setScalar(0.8+Math.sin(t*0.05+i)*0.22));
  u.light.intensity=0.55+f*0.3; }
/* Flames that engulf a burning target: several solid tongues of fire up the
   body plus a light, so it's unmistakable even against a bright background. */
function makeBurnFx(parent){
  const g=new THREE.Group();
  const tongues=[];
  for(let i=0;i<6;i++){
    const m=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.44,6),
      new THREE.MeshBasicMaterial({ color:i%2?0xff8a12:0xff3d05, transparent:true, opacity:0.8, depthWrite:false }));
    const ang=(i/6)*Math.PI*2;
    // kept around the torso/legs so the head stays clear for headshots
    m.position.set(Math.cos(ang)*0.22, 0.5+(i%3)*0.27, Math.sin(ang)*0.22);
    g.add(m); tongues.push(m);
  }
  // no point light here: without tone mapping it just blows the ground out
  // to a white disc. The flame meshes themselves read fine on their own.
  g.userData={tongues, t:Math.random()*10};
  parent.add(g);
  return g;
}
function updateBurnFx(fx,dt){
  const u=fx.userData; if(!u||!u.tongues) return;
  u.t+=dt*9;
  u.tongues.forEach((m,i)=>{
    const f=0.75+Math.sin(u.t+i*1.7)*0.35;
    m.scale.set(f,1.1+Math.sin(u.t*1.3+i)*0.4,f);
    m.material.opacity=0.6+Math.sin(u.t*1.6+i)*0.28;
  });
}
/* A smoke bolt is the same mesh as a fire bolt, just cold: grey canister, no
   flame colour, no light. Every arrow builds its own materials, so tinting one
   never touches another. Used by the local sim AND by server-driven arrows —
   without the latter, smoke bolts arrived looking like they were on fire. */
function tintSmokeBolt(mesh){
  const u = mesh.userData; if(!u || !u.flame) return;
  u.flame.material.color.set(0x8d939b);
  u.core.material.color.set(0xd7dbe0);
  u.trail.forEach(t=>t.material.color.set(0x7c828a));
  if(u.light) u.light.intensity = 0;
}
function spawnLocalArrow(origin,dir,w,ric){
  const mesh=makeArrowMesh(); mesh.position.copy(origin); scene.add(mesh);
  if(w.kind==='smoke') tintSmokeBolt(mesh);
  const a={ mesh, pos:origin.clone(), vel:dir.clone().multiplyScalar(w.speed),
            bounces: ric?1:0, life:5, dmg:w.dmg, w };
  aimArrow(mesh,a.vel); arrows.push(a); return a;
}
function removeArrow(a){ scene.remove(a.mesh); const i=arrows.indexOf(a); if(i>=0) arrows.splice(i,1); }
/* Step locally-simulated arrows: gravity, wall bounce, target hits. */
const _aray = new THREE.Raycaster();
function updateArrows(dt){
  const t=performance.now();
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i];
    // out of time mid-air: fizzle onto the ground beneath rather than vanish
    a.life-=dt;
    if(a.life<=0){
      if(a.w.kind==='smoke') spawnSmoke(a.pos.x, 0, a.pos.z, myId);
      else spawnGroundFire(a.pos.x, 0, a.pos.z);
      removeArrow(a); continue;
    }
    a.vel.y -= 9*dt;                                  // slight drop
    const step=a.vel.clone().multiplyScalar(dt);
    const dist=step.length();
    const dir=step.clone().normalize();
    // walls first
    _aray.set(a.pos, dir); _aray.far=dist;
    const hit=_aray.intersectObjects(wallMeshes,false)[0];
    // the floor, as a distance along this step (it was never tested before —
    // arrows simply fell through and expired, leaving nothing behind)
    let floorT = Infinity;
    if(step.y < 0 && a.pos.y > 0.02) floorT = ((a.pos.y-0.02)/(-step.y))*dist;
    // targets (local bots)
    let bestT=Infinity, bestBot=null, head=false;
    for(const b of localBots){ if(!b.alive) continue;
      const body=raySphere(a.pos,dir,b.x,1.05,b.z,0.6), hh=raySphere(a.pos,dir,b.x,1.70,b.z,0.34);
      let tt=Infinity,hs=false; if(hh<tt){tt=hh;hs=true;} if(body<tt){tt=body;hs=false;}
      if(tt<bestT){bestT=tt;bestBot=b;head=hs;} }
    // what this bolt leaves behind where it lands
    const payload = (px,py,pz)=> a.w.kind==='smoke' ? spawnSmoke(px,py,pz,myId) : spawnGroundFire(px,py,pz);
    if(bestBot && bestT<=dist && bestT<=floorT && (!hit || bestT<hit.distance)){
      if(a.w.kind==='smoke') payload(bestBot.x, 0, bestBot.z);   // no damage, just cover
      else igniteLocalBot(bestBot, a.dmg, a.w);
      removeArrow(a); continue;
    }
    if(hit && hit.distance<=floorT){
      if(a.bounces>0 && hit.face){                    // RICOCHET: reflect once
        a.bounces--;
        const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        a.vel.reflect(n).multiplyScalar(BOUNCE.keep);
        a.life = Math.min(a.life, BOUNCE.lifeS);      // spent after the bank
        a.pos.copy(hit.point).addScaledVector(n,0.06);
        a.mesh.position.copy(a.pos); aimArrow(a.mesh,a.vel);
        Sfx.hit();
        continue;
      }
      /* Only a TOP face holds a bolt. A wall, the side of a crate or the roof
         stops it dead and it falls straight down from there — nothing hangs
         in mid-air. */
      const n2 = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
      if(!(n2 && n2.y > 0.5)){
        a.pos.copy(hit.point).addScaledVector(dir, -0.08);
        a.vel.set(0,0,0);                     // gravity takes it from here
        a.mesh.position.copy(a.pos); aimArrow(a.mesh, new THREE.Vector3(0,-1,0));
        continue;
      }
      payload(hit.point.x, Math.max(0, hit.point.y), hit.point.z);   // landed on top
      removeArrow(a); continue;
    }
    if(floorT <= dist){                               // reached the floor
      const fx = a.pos.x + dir.x*floorT, fz = a.pos.z + dir.z*floorT;
      // the floor is this test rather than a collider box, so it needs its
      // own ricochet branch or a banked shot dies on the ground
      if(a.bounces > 0){
        a.bounces--;
        a.pos.set(fx, 0.02, fz);
        a.vel.y = Math.abs(a.vel.y)*BOUNCE.keep;
        a.vel.x *= BOUNCE.keep; a.vel.z *= BOUNCE.keep;
        a.life = Math.min(a.life, BOUNCE.lifeS);
        a.mesh.position.copy(a.pos); aimArrow(a.mesh,a.vel);
        Sfx.hit();
        continue;
      }
      payload(fx, 0, fz);
      removeArrow(a); continue;
    }
    a.pos.add(step); a.mesh.position.copy(a.pos); aimArrow(a.mesh,a.vel); flickerArrow(a.mesh,t);
  }
  // burn damage on local targets
  for(const b of localBots){
    if(!b.alive || !b.burnUntil) continue;
    if(t>b.burnUntil){ extinguish(b); continue; }
    if(b.fire) updateBurnFx(b.fire, dt);              // flicker the flames
    if(t>=(b.burnNext||0)){
      b.burnNext=t+1000; b.hp-=b.burnDps||6;
      if(b.hp<=0 && b.alive){ b.alive=false; b.mesh.visible=false; extinguish(b);
        localKills++; updateHUD(); setTimeout(()=>respawnLocalBot(b),2000); }
    }
  }
  updateGroundFires(dt);
  updateSmoke(dt);
  updateMarks();
}
/* Kill the flames AND drop the reference. Without this a bot that dies while
   burning keeps the fx group parented to its mesh, and respawnLocalBot makes
   that mesh visible again — so it comes back permanently on fire. */
function clearBurnFx(e){
  if(!e.fire) return;
  e.mesh.remove(e.fire);
  e.fire.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  e.fire = null;
}
function extinguish(b){
  clearMark(b);
  clearBurnFx(b);
  b.burnDps = 0; b.burnUntil = 0; b.inFire = false;
}
function igniteLocalBot(b,dmg,w){
  b.hp-=dmg; hitmark(); Sfx.hit();
  spawnGroundFire(b.x, 0, b.z);                       // the pool it leaves underfoot
  b.burnUntil=performance.now()+w.burnMs; b.burnNext=performance.now()+1000; b.burnDps=w.burnDps;
  if(!b.fire) b.fire = makeBurnFx(b.mesh);            // visible flames on the target
  if(b.hp<=0 && b.alive){ b.alive=false; b.mesh.visible=false; extinguish(b);
    localKills++; updateHUD(); setTimeout(()=>respawnLocalBot(b),2000); }
}

const MAX_TRACERS = 48;   // hard cap so a stuck frame can never grow this unbounded
function addTracer(o,dir,len){ const end=o.clone().add(dir.clone().multiplyScalar(len));
  // retire the oldest if we somehow hit the cap (e.g. held trigger + 8-pellet shotgun)
  if(tracers.length >= MAX_TRACERS) disposeTracer(tracers.shift());
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([o.clone(),end]), new THREE.LineBasicMaterial({color:0xffee88,transparent:true,opacity:0.9}));
  scene.add(line); tracers.push({line,life:0.06}); }
// free BOTH the geometry and the material — leaking materials fills GPU memory
function disposeTracer(t){ if(!t) return; scene.remove(t.line);
  if(t.line.geometry) t.line.geometry.dispose();
  if(t.line.material) t.line.material.dispose(); }
