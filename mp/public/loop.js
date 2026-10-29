/* =============================================================
   Bot Strike — loop.js  (9 of 9 in load order)

   Movement with vertical collision, and the main loop.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after hud.js and before nothing — it starts the game, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Movement + vertical collision (stand on crates) ---- */
let stepDist=0, stepLeft=false;    // footstep pacing (distance-based)
function movePlayer(dt){
  const st=STANCE[me.stance];
  me.eyeH += (st.eye-me.eyeH)*Math.min(1,dt*12);
  const fwd=new THREE.Vector3(-Math.sin(me.yaw),0,-Math.cos(me.yaw)), rgt=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
  const mv=new THREE.Vector3();
  if(keys['KeyW'])mv.add(fwd); if(keys['KeyS'])mv.sub(fwd); if(keys['KeyD'])mv.add(rgt); if(keys['KeyA'])mv.sub(rgt);
  const sprint=(keys['ShiftLeft']||keys['ShiftRight']) && me.stance==='stand' && mv.lengthSq()>0 && !aiming
               && rollT<=0 && slideT<=0;
  me.sprinting = sprint;                       // drives the FOV kick + faster bob
  const spd=(sprint?11:7)*st.spd;

  // --- Movement runs through a velocity that carries between states ---
  // Each source only says what velocity it WANTS; the real velocity eases
  // toward it. Abilities snap in hard (that's the punch), but when one ends
  // its speed bleeds off instead of dropping, so chaining sprint → slide →
  // roll → sprint stays continuous instead of stuttering between modes.
  const want=new THREE.Vector3();
  let rate=18;                                   // how quickly velocity follows
  if(rollT>0){                                   // V: dodge roll
    rollT=Math.max(0, rollT-dt);
    const k=Math.max(0.42, rollT/ROLL.dur);      // ease out, never fully stalls
    want.copy(rollDir).multiplyScalar(ROLL.speed*k); rate=24;
  } else if(slideT>0){                           // C while sprinting: slide
    slideT=Math.max(0, slideT-dt);
    slideSpd=Math.max(5, slideSpd-13*dt);        // friction
    want.copy(slideDir).multiplyScalar(slideSpd); rate=24;
    if(slideT===0) me.stance='stand';            // pop back up on your feet
  } else if(mv.lengthSq()>0){
    want.copy(mv).normalize().multiplyScalar(spd);
  } else rate=12;                                // coast to a stop
  me.hv.lerp(want, 1-Math.exp(-rate*dt));        // frame-rate independent easing
  if(me.hv.lengthSq()<4e-4) me.hv.set(0,0,0);
  me.x+=me.hv.x*dt; me.z+=me.hv.z*dt;
  // footsteps: fire on distance travelled, so pace matches actual speed/stance
  if(me.hv.lengthSq()>1 && me.onGround){
    stepDist += me.hv.length()*dt;              // paced by actual speed, not intent
    const stride = me.stance==='prone' ? 1.5 : me.stance==='crouch' ? 1.15 : (sprint ? 2.0 : 1.6);
    if(stepDist >= stride){ stepDist=0; stepLeft=!stepLeft; Sfx.step(stepLeft); }
  } else stepDist = Math.max(stepDist, 0);
  // jump — edge-triggered so holding Space can't bunny-hop, and you get a
  // second mid-air jump (MAX_JUMPS) before touching down again.
  const wasAir = !me.onGround;
  if(jumpPressed){
    jumpPressed=false;
    if(me.stance!=='stand') me.stance='stand';            // first press stands you up
    else if(me.jumpsUsed < MAX_JUMPS){
      me.vy = (me.jumpsUsed===0) ? JUMP_V : JUMP_V*0.88;  // air jump slightly weaker
      me.jumpsUsed++; me.onGround=false;
      Sfx.step(me.jumpsUsed>1);
    }
  }
  // gravity on the feet
  me.vy-=GRAV*dt; me.feetY+=me.vy*dt;
  // ground level: floor, or the top of a crate we're standing over
  let groundY=0;
  for(const c of colliders){ if(me.x>c.minx && me.x<c.maxx && me.z>c.minz && me.z<c.maxz && c.maxy<=me.feetY+0.35) groundY=Math.max(groundY,c.maxy); }
  if(me.feetY<=groundY){ const hard=me.vy<-6; me.feetY=groundY; me.vy=0; me.onGround=true;
    me.jumpsUsed=0;                                        // refill jumps on landing
    if(wasAir && hard) Sfx.land(); }
  else { me.onGround=false;
    if(me.jumpsUsed===0) me.jumpsUsed=1; }                 // walked off a ledge = no free double jump
  // horizontal walls (ignore the surface we stand on)
  const top=me.feetY+st.body;
  for(const c of colliders){ if(c.miny>top || c.maxy<=me.feetY+0.05) continue;
    const cx=Math.max(c.minx,Math.min(me.x,c.maxx)), cz=Math.max(c.minz,Math.min(me.z,c.maxz));
    const dx=me.x-cx, dz=me.z-cz, d=Math.hypot(dx,dz);
    if(d<me.radius&&d>1e-4){ const p=me.radius-d; me.x+=dx/d*p; me.z+=dz/d*p; } else if(d===0) me.x+=me.radius; }
  const b=ARENA-1.2; me.x=Math.max(-b,Math.min(b,me.x)); me.z=Math.max(-b,Math.min(b,me.z));
}

/* ---- Main loop ---- */
let last=performance.now(), sendAcc=0;
let frameGate=0, fpsAcc=0, fpsFrames=0, fpsShown=0;
function loop(){ requestAnimationFrame(loop);
  const nowMs = performance.now();
  // Don't burn GPU on a hidden tab.
  if(document.hidden) { last = nowMs; return; }
  // Frame cap: menus idle at 30fps, gameplay uses the chosen cap (0 = uncapped).
  const cap = (gameState==='playing') ? (SETTINGS.fpsCap|0) : Math.min(SETTINGS.fpsCap|0 || 30, 30);
  if(cap > 0){
    if(nowMs - frameGate < (1000/cap) - 0.6) return;    // skip this frame entirely
    frameGate = nowMs;
  }
  let dt=(performance.now()-last)/1000; last=performance.now(); dt=Math.min(dt,0.05);
  // fps readout
  fpsAcc+=dt; fpsFrames++;
  if(fpsAcc>=0.5){ fpsShown=Math.round(fpsFrames/fpsAcc); fpsAcc=0; fpsFrames=0;
    const a=document.getElementById('fpsNow'); if(a) a.textContent=fpsShown;
    const b=document.getElementById('fpsTag'); if(b) b.textContent=fpsShown+' FPS'; }

  if(gameState==='playing'){
    if(me.alive && !paused){      // frozen while the pause menu is up
      movePlayer(dt);
      // stationary targets turn to look at you (our models face +Z)
      if(gameMode==='bots') for(const b of localBots){
        if(b.alive) b.mesh.rotation.y = Math.atan2(me.x-b.x, me.z-b.z); }
      if(gameMode==='bots') updateBotHealthBars();
      updateArrows(dt);                      // flaming arrows + burn ticks
      // Resupply crate. In a match the server drives this (it also pays out);
      // in target practice there is nobody to tell us, so check it here.
      if(gameMode !== 'mp'){
        const near = Math.hypot(me.x-RESUPPLY.x, me.z-RESUPPLY.z) <= RESUPPLY.radius;
        if(near && !inResupply){ inResupply=true; refillAllWeapons(); updateHUD(); Sfx.swap(); toast('RESUPPLIED'); }
        else if(!near) inResupply=false;
      }
      abilityTick();
      if(pointerLocked){
        if(curW().auto){ if(wantFire) shoot(); }
        else if(semiQueued){ shoot(); semiQueued=false; }   // bolt/semi: one shot per click
      }
      if(gameMode==='mp' && socket){ sendAcc+=dt; if(sendAcc>0.033){ sendAcc=0; socket.emit('state',{x:me.x,z:me.z,y:me.feetY,yaw:me.yaw,pitch:me.pitch,st:STANCE_ID[me.stance],
          rl: rollT>0 ? +(1-rollT/ROLL.dur).toFixed(3) : 0});   // roll progress, so others see the tumble
      } }
    }
    if(me.hp<prevHp-0.5) dmgFlash(); prevHp=me.hp;
    drawCompass();
    updateDetectHUD();
    // Camera lean/dip during abilities — this is what sells the transition as
    // momentum rather than a teleport between movement modes.
    let wRoll=0, wDip=0, wPunch=0;
    if(rollT>0){ const p=1-rollT/ROLL.dur, s=Math.sin(p*Math.PI);
      wRoll = s*ROLL.lean*rollLean; wDip = s*0.22;
      // forward/back rolls kick the FOV and tuck the weapon, but deliberately
      // do NOT pitch the view — that tilt was removed for feeling bad
      wPunch = s*Math.abs(rollFwd); }
    else if(slideT>0){ const s=Math.min(1, slideT/0.25);
      wRoll = 0.20*slideLean*s; wDip = 0.10*s; }
    rollPunch = wPunch;                            // follows the roll exactly, no lag
    camRoll += (wRoll-camRoll)*Math.min(1,dt*12);
    camDip  += (wDip -camDip )*Math.min(1,dt*12);
    // Q/E peek: hold to lean. Suppressed mid-roll/slide, which own the camera.
    let wantLean = 0;
    if(me.alive && rollT<=0 && slideT<=0){
      if(keys['KeyQ']) wantLean -= 1;
      if(keys['KeyE']) wantLean += 1;
    }
    leanAmt += (wantLean-leanAmt)*Math.min(1,dt*LEAN.rate);
    if(Math.abs(leanAmt) < 0.001) leanAmt = 0;
    const eyeY = me.feetY+me.eyeH-camDip;
    const rgtX = Math.cos(me.yaw), rgtZ = -Math.sin(me.yaw);
    const off = leanAmt ? clearLean(me.x, me.z, eyeY, rgtX, rgtZ, leanAmt*LEAN.offset) : 0;
    camera.position.set(me.x + rgtX*off, eyeY, me.z + rgtZ*off);
    // right lean rolls negative, matching the sign the dodge roll already uses
    camera.rotation.order='YXZ'; camera.rotation.set(me.pitch,me.yaw,camRoll - leanAmt*LEAN.angle);
    // --- ADS (right-click aim): smooth zoom, tightened aim, scope on sniper ---
    ads += (((aiming && me.alive) ? 1 : 0) - ads) * Math.min(1, dt*10);
    // sprint widens the view a touch — the cue that tells you you're sprinting
    sprintAmt += ((me.sprinting ? 1 : 0) - sprintAmt) * Math.min(1, dt*6);
    const baseFov = 80 + 9*sprintAmt + ROLL.fov*rollPunch;
    const targetFov = baseFov + (curW().adsFov - baseFov) * ads;
    if (Math.abs(camera.fov - targetFov) > 0.05){ camera.fov = targetFov; camera.updateProjectionMatrix(); }
    const scoped = curW().scope && ads > 0.85;
    document.getElementById('scope').style.display = scoped ? 'block' : 'none';
    document.getElementById('crosshair').style.opacity = ads > 0.5 ? 0 : 1;
    gun.visible = !scoped;                        // scope view hides the gun

    gunKick=Math.max(0,gunKick-dt*6);
    // reload animation: gun swings down + tilts through the reload, then returns.
    let rDip=0, rRot=0, rWob=0;
    if(reloading){
      const p=Math.min(1,(performance.now()-reloadStart)/curW().reloadMs);
      const s=Math.sin(p*Math.PI);                  // 0→1→0 envelope
      rDip=s*0.22; rRot=s;
      if(p>0.3&&p<0.7) rWob=Math.sin(p*40)*0.02;    // hand jiggle mid-reload
    }
    // Stance feedback you can actually see in first person: the weapon rides
    // lower and tilts in as you crouch, more so when prone. Sprinting swings
    // the gun down and aside like you're running with it.
    stanceAmt += ((me.stance==='prone' ? 1 : me.stance==='crouch' ? 0.5 : 0) - stanceAmt) * Math.min(1, dt*10);
    // melee swing: arcs the blade across the screen, alternating each hit
    if(swingT>0) swingT=Math.max(0, swingT-dt*(1000/curW().fireRate)*0.55);
    const sw = Math.sin(swingT*Math.PI) * swingDir;
    const sp = sprintAmt*(1-ads);
    const sx = -0.06*stanceAmt + 0.10*sp;
    const sy = -0.10*stanceAmt - 0.09*sp;
    const sr =  0.30*stanceAmt + 0.45*sp;          // roll/tilt
    // base pose slides toward screen center while aiming
    const bx=0.3*(1-ads), by=-0.28+0.07*ads, bz=-0.55+0.12*ads;
    // tuck the weapon down and in while rolling — you don't run a somersault
    // with the gun still levelled at the horizon
    const tuck = ROLL.tuck*rollPunch;
    gun.position.set(bx+rWob+sx - sw*0.26, by-rDip+sy + Math.abs(sw)*0.10 - tuck, bz+gunKick*0.1 - Math.abs(sw)*0.14 + tuck*0.5);
    gun.rotation.set(gunKick*0.4*(1-ads*0.6) - rRot*0.85 - 0.18*sp - Math.abs(sw)*0.5,
                     rRot*0.3 + sw*0.9,
                     rRot*0.5 + sr + sw*1.1);
  } else {
    // menu: spatial showcase — the 3D camera parallaxes with the mouse to match
    // the CSS glass layers, and the operator can be dragged to inspect.
    if(dragging) heroSpinVel = dragDX*0.11;                  // drag drives spin
    else { heroSpinVel += (0.6 - heroSpinVel)*Math.min(1,dt*1.4); }  // ease back to idle turn
    dragDX = 0;
    hero.rotation.y += heroSpinVel*dt;
    const t = performance.now()/1000;
    // smooth the pointer so the camera glides instead of snapping
    camLerp.x += (menuMouse.x - camLerp.x)*Math.min(1,dt*4);
    camLerp.y += (menuMouse.y - camLerp.y)*Math.min(1,dt*4);
    const zoom = (gameState==='mode') ? 35.2 : 37.5;         // push in on the mode screen
    camera.position.set(Math.sin(t*0.18)*1.0 + camLerp.x*2.6,
                        1.55 + Math.sin(t*0.3)*0.1 - camLerp.y*1.1,
                        zoom);
    camera.lookAt(camLerp.x*0.7, 1.12 - camLerp.y*0.25, 32);
  }

  // interpolate + animate networked entities
  const animate=(o)=>{ const m=o.mesh;
    /* Interpolate a BASE position that the tumble offset never feeds back into.
       Writing the offset onto m.position and then lerping FROM m.position next
       frame compounds it: a roll used to end with the avatar floating ~2m up,
       sinking back down over the following second. */
    if(o.bx===undefined){ o.bx=o.tx; o.by=o.ty||0; o.bz=o.tz; }
    const px=o.bx, pz=o.bz;
    o.bx += (o.tx-o.bx)*0.2; o.by += ((o.ty||0)-o.by)*0.2; o.bz += (o.tz-o.bz)*0.2;
    const nx=o.bx, ny=o.by, nz=o.bz;
    const moved=Math.hypot(nx-px,nz-pz)>0.002; m.position.set(nx,ny,nz);
    // stance pose: crouched players squash down, prone players lie flat
    // YXZ so yaw is applied first: x then tips relative to the way they face,
    // instead of about the world axis (which cartwheeled anyone facing east)
    m.rotation.order = 'YXZ';
    if(o.tst!==undefined){
      o.sAmt = (o.sAmt||0) + ((o.tst) - (o.sAmt||0))*0.18;     // 0 stand, 1 crouch, 2 prone
      const crouch = Math.min(o.sAmt,1), prone = Math.max(0, o.sAmt-1);
      m.scale.y = 1 - 0.28*crouch;                              // squat down
      m.rotation.x = -prone*Math.PI/2;                          // tip onto the ground
      m.position.y = ny + prone*0.25;                           // keep the body on the floor
    }
    let a=m.rotation.y, da=((o.tyaw-a+Math.PI*3)%(Math.PI*2))-Math.PI; m.rotation.y=a+da*0.25;
    // A roll is a full somersault, pivoted at the hips rather than the feet —
    // spinning about the feet swings the head through a 1.9m arc and looks wrong.
    // You can't be prone and rolling (startRoll stands you up), so these don't fight.
    const rl = o.trl || 0;
    if(rl > 0){
      const th = rl*Math.PI*2, HIP = 0.95;
      const fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);   // their facing
      m.rotation.x = th;
      m.position.set(nx - fx*HIP*Math.sin(th), ny + HIP*(1-Math.cos(th)), nz - fz*HIP*Math.sin(th));
    }
    const u=m.userData; if(!u.ll) return;   // rigged soldier models have no swing-limbs
    if(moved){ u.walk+=dt*8; const s=Math.sin(u.walk)*0.5; u.ll.rotation.x=s; u.rl.rotation.x=-s; u.la.rotation.x=-s*0.6; u.ra.rotation.x=s*0.4; } else { u.ll.rotation.x*=0.8; u.rl.rotation.x*=0.8; } };
  for(const o of others.values()) animate(o);
  for(const o of serverBots.values()) animate(o);

  for(let i=tracers.length-1;i>=0;i--){ tracers[i].life-=dt; tracers[i].line.material.opacity=Math.max(0,tracers[i].life/0.06)*0.9;
    if(tracers[i].life<=0){ disposeTracer(tracers[i]); tracers.splice(i,1); } }

  // bloom off = skip the composer's extra full-screen passes entirely
  if (composer && SETTINGS.bloom) composer.render(); else renderer.render(scene,camera);
}
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); applySettings(); });
updateHUD(); loop();
