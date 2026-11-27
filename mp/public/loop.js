/* =============================================================
   Crimson X — loop.js  (10 of 10 in load order)

   Movement with vertical collision, and the main loop.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after hud.js and before nothing — it starts the game, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Movement + vertical collision (stand on crates) ---- */
let stepDist=0, stepLeft=false;    // footstep pacing (distance-based)
/* How hard you stop when the keys come up. This was rate 12 with a snap at
   0.02 m/s: from a 7 m/s run you coasted 0.58m over half a second, which read
   as sliding on ice — and since a `steady` weapon is only pinpoint once you
   are under STEADY_SPEED, it also kept the pistols inaccurate for that whole
   half second after you had let go. At 28 with a snap at 0.2 m/s the same
   stop is 0.25m in about 0.13s. Still an ease, so it does not feel like
   hitting a wall; just one you can count on. */
const COAST_RATE = 28, STOP_SNAP = 0.2;
const AIM_GAP = 0;                 // metres the gun's top sits below the eye line at full ADS: none, the tip meets the dot
/* Where a gun rests at the hip unless its weapon says otherwise (`vm`). */
const VM_POSE = { x:0.3, y:-0.225, z:-0.55, adsZ:0.12, rx:0, ry:0, rz:0, viewFov:0 };
const REMOTE_STRIDE = 2.3;         // metres between another player's audible footsteps
/* ---- Climb ----
   Press jump facing a ledge between CLIMB.minRise and CLIMB.maxRise above
   your feet and you pull up onto it instead of jumping into its side. It
   works from the ground or from the air, so Blast can double-jump to a lip
   and still mantle it, and it is nobody's ability: all agents climb.

   Nothing here is new trust for the server to grant. A mantle rises about
   8 m/s and slides forward about 7, both well under MOVE.maxRise (16) and
   MOVE.maxSpeed (20), so vetMove passes it like any other movement.

   The perimeter walls are 7-8m, far over maxRise, so you cannot climb out
   of the arena. */
/* How high a box can be and still be a step you walk onto rather than a
   wall you are stopped by. The ground test has always taken a top up to
   this far above the feet; a real stair riser is about 0.175. */
const STEP_UP = 0.35;
/* What the feet stand on: a circle this wide, inside the body's 0.4. It has
   to reach the tread below the one the body touches (see movePlayer). */
const FOOT_R = 0.25;
/* Does the body's circle overlap this box's footprint? */
function touches(c, x, z, r){
  const cx=Math.max(c.minx,Math.min(x,c.maxx)), cz=Math.max(c.minz,Math.min(z,c.maxz));
  return (x-cx)*(x-cx)+(z-cz)*(z-cz) < r*r;
}
/* Is there room to stand with the feet at `y` here: nothing OVERHEAD within
   a body's height? Used before stepping up or climbing onto something, so
   neither can put your head into a slab. Overhead means its underside is
   more than a step up: the next tread of a stair is not over your head,
   it is the next thing you walk onto. */
function headroom(x, z, y, body){
  for(const c of colliders){
    if(c.miny<=y+STEP_UP || c.miny>=y+body) continue;
    if(touches(c, x, z, me.radius)) return false;
  }
  return true;
}
/* Does the flat segment (x0,z0)-(x1,z1) pass through this box's footprint? */
function segCrossesRect(x0, z0, x1, z1, c){
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x0, x1 - x0, c.minx, c.maxx], [z0, z1 - z0, c.minz, c.maxz]]){
    if (Math.abs(d) < 1e-9){ if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d; if (a > b){ const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
  }
  return true;
}
/* ---- LADDERS (2026-11-21) ----
   Jack: "i want to be able to climb the ladders". A ladder is a climb line
   (mapLadders, maps.js): where your feet go, from y0 to y1, `n` out from the
   wall and `e` the step off the top. FACE it and press W to take hold; on it,
   W climbs (or descends, if you are looking down - so from the top you look
   down the ladder and walk onto it), S descends, Space lets go and pushes
   you off backwards. At the top you step off onto the floor there; at the
   foot, S puts you back on the ground. No gravity, no wall push while on it:
   the line is placed clear of everything solid. */
const LADDER = { reach: 0.55, reachTop: 1.25, speed: 3.2, face: 0.35, rung: 0.55 };
let ladderStep = 0;
function ladderAt(L, y){
  if (!L.path) return [L.x, L.z];
  const P = L.path;
  if (y <= P[0][1]) return [P[0][0], P[0][2]];
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]){
    const t = (y - P[i-1][1]) / ((P[i][1] - P[i-1][1]) || 1);
    return [P[i-1][0] + (P[i][0] - P[i-1][0]) * t, P[i-1][2] + (P[i][2] - P[i-1][2]) * t];
  }
  const q = P[P.length - 1]; return [q[0], q[2]];
}
function ladderGrab(){
  if (!keys['KeyW'] && !keys['KeyS']) return null;
  if (me.stance !== 'stand' || !me.alive || !currentMap) return null;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  for (const L of mapLadders(currentMap)){
    if (me.feetY < L.y0 - 0.5 || me.feetY > L.y1 + 0.3) continue;
    const atTop = me.feetY >= L.y1 - 0.3;
    const [lx, lz] = ladderAt(L, Math.max(L.y0, Math.min(L.y1, me.feetY)));
    if (Math.hypot(lx - me.x, lz - me.z) > (atTop ? LADDER.reachTop : LADDER.reach)) continue;
    const el = Math.hypot(L.ex, L.ez) || 1;
    const facing = atTop ? fx * (-L.ex / el) + fz * (-L.ez / el) : fx * (-L.nx) + fz * (-L.nz);
    if (facing > LADDER.face) return L;
  }
  return null;
}
function updateLadder(dt){
  const L = me.ladder;
  if (jumpPressed){                                   // let go, backwards
    jumpPressed = false; me.ladder = null;
    me.hv.set(L.nx * 4, 0, L.nz * 4); me.vy = 4; me.onGround = false; me.jumpsUsed = 1;
    return;
  }
  let dir = 0;
  if (keys['KeyW']) dir += me.pitch < -0.45 ? -1 : 1;
  if (keys['KeyS']) dir -= 1;
  me.feetY += dir * LADDER.speed * dt;
  me.hv.set(0, 0, 0); me.vy = 0; me.jumpsUsed = 0;
  if (me.feetY >= L.y1){                              // over the top: step off, as a short pull-up
    me.feetY = L.y1; me.ladder = null;
    const [lx, lz] = ladderAt(L, L.y1);
    startClimb({ x: lx + L.ex, z: lz + L.ez, y: L.y1 });
    return;
  }
  if (me.feetY <= L.y0){                              // at the foot
    me.feetY = L.y0;
    if (dir < 0){ me.ladder = null; me.onGround = true; return; }
  }
  me.onGround = false;
  const [lx, lz] = ladderAt(L, me.feetY), k = Math.min(1, dt * 14);
  me.x += (lx - me.x) * k; me.z += (lz - me.z) * k;
  ladderStep += Math.abs(dir) * LADDER.speed * dt;
  if (ladderStep >= LADDER.rung){ ladderStep = 0; stepLeft = !stepLeft; Sfx.step(stepLeft); }
}
function findLedge(){
  if(climbT>0 || rollT>0 || dashT>0 || slideT>0) return null;
  if(me.stance!=='stand' || !me.alive) return null;
  const fx=-Math.sin(me.yaw), fz=-Math.cos(me.yaw);
  const px=me.x+fx*(me.radius+CLIMB.reach), pz=me.z+fz*(me.radius+CLIMB.reach);
  let best=null;
  for(const c of colliders){
    if(px<c.minx||px>c.maxx||pz<c.minz||pz>c.maxz) continue;    // not what we are facing
    const rise=c.maxy-me.feetY;
    if(rise<CLIMB.minRise||rise>CLIMB.maxRise) continue;        // beneath notice, or out of reach
    if(!best||c.maxy>best.maxy) best=c;                         // the highest lip we can still reach
  }
  if(!best) return null;
  const topY=best.maxy, b=ARENA-1.2;
  const dx=Math.max(-b,Math.min(b, me.x+fx*(me.radius+CLIMB.land)));
  const dz=Math.max(-b,Math.min(b, me.z+fz*(me.radius+CLIMB.land)));
  /* Refuse if something taller stands where we would land. Every box in a
     map sits on the floor, so "taller than the lip at that spot" is the
     whole test — it catches both a wall to climb into and a crate stacked
     on the one we are climbing. */
  /* With raised boxes, "taller" is not enough: a slab overhead is above the
     lip too, and was what stopped every climb under an upper floor. What
     matters is whether anything stands in the BODY's space where it lands,
     and on the way up from where it is now. */
  for(const c of colliders){
    if(dx<c.minx-0.05||dx>c.maxx+0.05||dz<c.minz-0.05||dz>c.maxz+0.05) continue;
    if(c.maxy>topY+0.05 && c.miny<topY+STANCE.stand.body) return null;
  }
  if(!headroom(me.x, me.z, me.feetY, topY-me.feetY+STANCE.stand.body)) return null;
  /* And nothing ACROSS the way. A window sill is a 0.9m lip with glass
     standing on it: the landing spot is outside, clear, and the climb
     carried you straight through the pane. Anything standing above the lip
     and across the line from here to the landing refuses the climb. */
  for(const c of colliders){
    if(c.maxy<=topY+0.05 || c.miny>=topY+STANCE.stand.body) continue;
    if(segCrossesRect(me.x, me.z, dx, dz, c)) return null;
  }
  return { x:dx, z:dz, y:topY };
}
function startClimb(l){
  climbT=CLIMB.dur; climbFrom={ x:me.x, z:me.z, y:me.feetY }; climbTo=l;
  me.hv.set(0,0,0); me.vy=0; me.onGround=false;
  me.jumped=false; rollQueued=false;  // a mantle ends the jump: no jump roll off the top
  stepDist=0;                       // the pull-up is not a stride
  Sfx.step(true);
}
function updateClimb(dt){
  climbT=Math.max(0, climbT-dt);
  const k=1-climbT/CLIMB.dur;                                   // 0..1 through the pull-up
  const up =Math.min(1, k/CLIMB.upPart);                        // up first...
  const fwd=Math.max(0, (k-CLIMB.upPart)/(1-CLIMB.upPart));     // ...then over the edge
  const ease=t=>t*t*(3-2*t);
  me.feetY=climbFrom.y+(climbTo.y-climbFrom.y)*ease(up);
  me.x    =climbFrom.x+(climbTo.x-climbFrom.x)*ease(fwd);
  me.z    =climbFrom.z+(climbTo.z-climbFrom.z)*ease(fwd);
  me.vy=0;
  if(climbT<=0){
    me.feetY=climbTo.y; me.x=climbTo.x; me.z=climbTo.z;
    me.onGround=true; me.jumpsUsed=0;        // you are standing on it; jumps come back
    Sfx.land();
  }
}
function movePlayer(dt){
  const st=STANCE[me.stance];
  me.eyeH += (st.eye-me.eyeH)*Math.min(1,dt*12);
  /* A climb owns the frame: no input, no gravity, no wall push — it is
     moving you along a path it already checked. */
  if(climbT>0){ updateClimb(dt); return; }
  if(!me.alive) me.ladder = null;
  if(me.ladder){ updateLadder(dt); return; }
  { const L = ladderGrab(); if(L){ me.ladder = L; ladderStep = 0; me.hv.set(0,0,0); me.vy = 0; updateLadder(dt); return; } }
  if(jumpPressed){
    const ledge=findLedge();
    if(ledge){ jumpPressed=false; startClimb(ledge); return; }   // climb beats jump
  }
  const fwd=new THREE.Vector3(-Math.sin(me.yaw),0,-Math.cos(me.yaw)), rgt=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
  const mv=new THREE.Vector3();
  if(keys['KeyW'])mv.add(fwd); if(keys['KeyS'])mv.sub(fwd); if(keys['KeyD'])mv.add(rgt); if(keys['KeyA'])mv.sub(rgt);
  // Sprint is everyone's: hold Shift, standing, moving, not aiming. Blast in
  // the zone sprints FASTER than that rather than being the only one who can.
  const sprint=(keys['ShiftLeft']||keys['ShiftRight']) && me.stance==='stand' && mv.lengthSq()>0 && !aiming
               && rollT<=0 && slideT<=0;
  me.sprinting = sprint;                       // drives the FOV kick + faster bob
  const spd=(sprint ? (zoneOn() ? MOVE_SPD.zoneSprint : MOVE_SPD.sprint) : MOVE_SPD.walk)*st.spd*(curW().melee ? MOVE_SPD.bladeMul : 1);

  // --- Movement runs through a velocity that carries between states ---
  // Each source only says what velocity it WANTS; the real velocity eases
  // toward it. Abilities snap in hard (that's the punch), but when one ends
  // its speed bleeds off instead of dropping, so chaining sprint → slide →
  // roll → sprint stays continuous instead of stuttering between modes.
  const want=new THREE.Vector3();
  let rate=18;                                   // how quickly velocity follows
  if(rollT>0){                                   // V: dodge roll
    rollT=Math.max(0, rollT-dt);
    const k=Math.max(0.42, rollT/rollDur);      // ease out, never fully stalls
    want.copy(rollDir).multiplyScalar(ROLL.speed*k); rate=24;
  } else if(dashT>0){                            // V as Blast: dash
    dashT=Math.max(0, dashT-dt);
    want.copy(dashDir).multiplyScalar(DASH.speed); rate=40;
    if(!me.onGround) me.vy=Math.max(me.vy, 0);   // an air dash holds you level
  } else if(slideT>0){                           // C while sprinting: slide
    slideT=Math.max(0, slideT-dt);
    slideSpd=Math.max(5, slideSpd-13*dt);        // friction
    want.copy(slideDir).multiplyScalar(slideSpd); rate=24;
    if(slideT===0) me.stance='stand';            // pop back up on your feet
  } else if(mv.lengthSq()>0){
    want.copy(mv).normalize().multiplyScalar(spd);
  } else rate=COAST_RATE;                        // keys released: stop
  me.hv.lerp(want, 1-Math.exp(-rate*dt));        // frame-rate independent easing
  /* Stopping is an exponential ease, so its tail never truly ends by itself;
     this is where it gets cut off. It only applies while you are trying to
     stop (nothing wanted), or it would fight the first frames of pulling
     away from a standstill. */
  if(want.lengthSq()===0 && me.hv.lengthSq()<STOP_SNAP*STOP_SNAP) me.hv.set(0,0,0);
  /* Where the feet were before this frame moved them. Footsteps are paced on
     the distance ACTUALLY covered, so they are counted at the end of this
     function — after collision has had its say. */
  const px = me.x, pz = me.z;
  me.x+=me.hv.x*dt; me.z+=me.hv.z*dt;
  // jump — edge-triggered so holding Space can't bunny-hop, and you get a
  // second mid-air jump (an agent with jumps:2, i.e. Blast) before touching down again.
  const wasAir = !me.onGround;
  if(jumpPressed){
    jumpPressed=false;
    if(me.stance!=='stand') me.stance='stand';            // first press stands you up
    else if(me.jumpsUsed < agent().jumps){        // Blast's passive is the second one
      me.vy = (me.jumpsUsed===0) ? JUMP_V : JUMP_V*0.88;  // air jump slightly weaker
      me.jumpsUsed++; me.onGround=false; me.jumped=true;
      Sfx.step(me.jumpsUsed>1);
    }
  }
  // gravity on the feet
  me.vy-=GRAV*dt; me.feetY+=me.vy*dt;
  // ground level: floor, or the top of a crate we're standing over
  let groundY=0;
  /* The feet stand on a small CIRCLE (FOOT_R), not on the centre point. With
     a point, a stair could not be climbed: a tread is 28cm deep and the body
     40cm round, so the body reaches the second tread before the centre is
     over the first, and the second is two risers up - a wall. */
  for(const c of colliders){ if(c.maxy<=me.feetY+STEP_UP && touches(c, me.x, me.z, FOOT_R)) groundY=Math.max(groundY,c.maxy); }
  /* STEP DOWN. Walking off a stair tread used to be a fall: 17cm of air,
     a few frames off the ground, no footsteps and no double jump, on every
     step. If you were on the ground last frame and did not jump, a drop no
     bigger than a step is just the next step down. */
  if(me.onGround && me.vy<=0 && me.feetY>groundY && me.feetY-groundY<=STEP_UP) me.feetY=groundY;
  if(me.feetY<=groundY){ const hard=me.vy<-6; me.feetY=groundY; me.vy=0; me.onGround=true;
    me.jumpsUsed=0;                                        // refill jumps on landing
    if(wasAir && me.jumped){ me.jumped=false; jumpLandAt=performance.now();
      if(rollQueued) startRoll(); }                        // the jump roll (ROLL.jumpMul)
    if(wasAir && hard) Sfx.land(); }
  else { me.onGround=false;
    if(me.jumpsUsed===0) me.jumpsUsed=1; }                 // walked off a ledge = no free double jump
  /* HEAD BUMP. A box with air under it (an upper floor's slab, a stair
     flight overhead) can be jumped into from below. Without this the head
     went into the slab and the push below shoved you sideways out of it.
     Rising into one stops the rise at its underside instead. */
  if(me.vy>0) for(const c of colliders){
    if(c.miny<=me.feetY+0.05 || c.miny>=me.feetY+st.body) continue;   // not over our head, or clear of it
    if(!touches(c, me.x, me.z, me.radius)) continue;
    me.feetY=c.miny-st.body; me.vy=0;
  }
  // horizontal walls (ignore the surface we stand on)
  const top=me.feetY+st.body;
  for(const c of colliders){ if(c.miny>=top-1e-3 || c.maxy<=me.feetY+0.05) continue;
    /* STEP UP. Something no taller than a step, with room for the body on
       top of it, is not pushed against: you walk onto it, and the ground
       test above lifts you once your centre is over it. */
    if(me.onGround && c.maxy-me.feetY<=STEP_UP && headroom(me.x, me.z, c.maxy, st.body)) continue;
    const cx=Math.max(c.minx,Math.min(me.x,c.maxx)), cz=Math.max(c.minz,Math.min(me.z,c.maxz));
    const dx=me.x-cx, dz=me.z-cz, d=Math.hypot(dx,dz);
    if(d<me.radius&&d>1e-4){ const p=me.radius-d; me.x+=dx/d*p; me.z+=dz/d*p; } else if(d===0) me.x+=me.radius; }
  const b=ARENA-1.2; me.x=Math.max(-b,Math.min(b,me.x)); me.z=Math.max(-b,Math.min(b,me.z));

  /* Footsteps, paced by the distance actually COVERED rather than the speed
     you asked for. In the open those are the same number; with something in
     the way they are nothing alike. Walking into a wall or a crate leaves
     me.hv sitting at full speed forever — collision moves you back out, it
     does not slow you down — so the old test (me.hv.lengthSq()>1, distance
     from me.hv.length()*dt) kept laying down a step every 1.6m of travel you
     never made. Measured: six footsteps while moving 10cm into a wall, and
     they carry on for as long as you hold the key, which is also why they
     seemed to follow the mouse rather than the legs.
     Measuring here costs nothing — the remote-player footsteps a few hundred
     lines down have always been paced this way, off the drawn delta.
     A jump of over a metre is a respawn or a teleport, not a stride. */
  const gone = Math.hypot(me.x - px, me.z - pz);
  if(me.onGround && gone < 1){
    stepDist += gone;
    const stride = me.stance==='prone' ? 1.5 : me.stance==='crouch' ? 1.15 : (sprint ? 2.0 : 1.6);
    if(stepDist >= stride){ stepDist=0; stepLeft=!stepLeft; Sfx.step(stepLeft); }
  }
}

/* ---- Main loop ---- */
let last=performance.now(), sendAcc=0;
let frameGate=0, fpsAcc=0, fpsFrames=0, fpsShown=0;
function loop(){ requestAnimationFrame(loop);
  const nowMs = performance.now();
  // Don't burn GPU on a hidden tab.
  if(document.hidden) { last = nowMs; return; }
  /* The canvas MUST match the viewport, every frame. Shots go through the
     centre of the CANVAS; the crosshair and the scope are position:fixed, so
     they sit at the centre of the VIEWPORT. Let those two drift apart and
     your aim is silently wrong — at 1514x1123 with a stale 1024x768 canvas
     the reticle sat 245px right and 177px below where the bullet actually
     went, which reads as "it lands above where I am aiming". There is a
     resize listener, but it cannot catch every case (a resize while the tab
     is hidden, a zoom change, a device-pixel-ratio switch), so this checks
     and self-heals rather than trusting the event. */
  const cvs = renderer.domElement;
  if(cvs.clientWidth !== innerWidth || cvs.clientHeight !== innerHeight){
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    applySettings();
  }
  // Frame cap: menus idle at 30fps, gameplay uses the chosen cap (0 = uncapped).
  const cap = (gameState==='playing') ? (SETTINGS.fpsCap|0) : Math.min(SETTINGS.fpsCap|0 || 30, 30);
  if(cap > 0){
    if(nowMs - frameGate < (1000/cap) - 0.6) return;    // skip this frame entirely
    frameGate = nowMs;
  }
  let dt=(performance.now()-last)/1000; last=performance.now(); dt=Math.min(dt,0.05);
  // the cooldown tiles tick down between events, so they are a frame job
  if(gameState==='playing'){ updateCooldowns(); sizeReticle(); updateHurtMarks(); }
  // fps readout
  fpsAcc+=dt; fpsFrames++;
  if(fpsAcc>=0.5){ fpsShown=Math.round(fpsFrames/fpsAcc); fpsAcc=0; fpsFrames=0;
    const a=document.getElementById('fpsNow'); if(a) a.textContent=fpsShown;
    const b=document.getElementById('fpsTag'); if(b) b.textContent=fpsShown+' FPS'; }

  if(gameState==='playing'){
    revealHazards(gameMode === 'mp' && detectUntil > performance.now());
    animatePotions(nowMs / 1000);        // bob and spin the health pickups
    if(me.alive && !paused){      // frozen while the pause menu is up
      movePlayer(dt);
      // Targets keep the heading they spawned with; they used to turn to
      // face you every frame (Jack asked for that gone, 2026-11-15).
      if(gameMode==='bots'){ updateBotHealthBars(); updateHitboxOverlay(); }
      updateArrows(dt);                      // flaming arrows + burn ticks
      updateGrenades(dt);                    // the range's grenades; a match's are in the snapshot
      updateBooms(dt);                       // explosions, either mode
      /* The resupply is a MATCH thing (the server drives it and pays out).
         The range has none (Jack, 2026-11-22: "remove the resupply in
         training, ammo in training should be unlimited" - training('infAmmo')
         is always on there), so its ring only shows in a match. */
      if(resupplyRing) resupplyRing.visible = gameMode === 'mp';
      abilityTick();
      if(pointerLocked){
        if(curW().auto){ if(wantFire) shoot(); }
        else if(semiQueued){ shoot(); semiQueued=false; }   // bolt/semi: one shot per click
      }
      if(gameMode==='mp' && socket){ sendAcc+=dt; if(sendAcc>0.033){ sendAcc=0; socket.emit('state',{x:me.x,z:me.z,y:me.feetY,yaw:me.yaw,pitch:me.pitch,st:STANCE_ID[me.stance],
          tp: lastTp,          // the forced move we've accepted; stale ones are ignored
          lo: +(me.lean||0).toFixed(2),   // lean offset in metres, already wall-clamped
          rl: rollT>0 ? +(1-rollT/rollDur).toFixed(3) : 0});   // roll progress, so others see the tumble
      } }
    }
    if(!paused) updateSilvars(dt);           // Silvars' robots and Linked Sight, alive or spectating
    /* The snapshot writes me.hp straight from the server and never tells the
       HUD, so the number and the bar sat at whatever they last showed until
       something else happened to call updateHUD() — a weapon switch, a buy, a
       reload. The red flash came from here and worked, which is what made it
       look like only the bar was broken. This is the one place that already
       knows hp moved, so it refreshes from here; guarded on an actual change,
       because updateHUD does real work and this runs every frame. */
    if(me.hp<prevHp-0.5) dmgFlash();
    if(me.hp!==prevHp) updateHUD();
    prevHp=me.hp;
    drawCompass();
    updateDetectHUD();
    // Camera lean/dip during abilities — this is what sells the transition as
    // momentum rather than a teleport between movement modes.
    let wRoll=0, wDip=0, wPunch=0;
    if(rollT>0){ const p=1-rollT/rollDur, s=Math.sin(p*Math.PI);
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
    /* clearLean has already pulled this in if a wall is in the way, so it is
       the real offset — which is exactly what the server needs. Leaning used
       to be camera-only: your view slid up to 0.45m out from cover while your
       hitbox and your model stayed put, so you could shoot from around a
       corner and nobody could shoot back. */
    const off = leanAmt ? clearLean(me.x, me.z, eyeY, rgtX, rgtZ, leanAmt*LEAN.offset) : 0;
    me.lean = off;
    camera.position.set(me.x + rgtX*off, eyeY, me.z + rgtZ*off);
    // right lean rolls negative, matching the sign the dodge roll already uses
    camera.rotation.order='YXZ'; camera.rotation.set(me.pitch,me.yaw,camRoll - leanAmt*LEAN.angle);
    // eliminated in a match: ride behind a survivor instead (session.js)
    if(gameMode==='mp' && !me.alive) spectateCamera(dt); else spectateOff();
    // --- ADS (right-click aim): smooth zoom, tightened aim, scope on sniper ---
    ads += (((aiming && me.alive) ? 1 : 0) - ads) * Math.min(1, dt*(zoneOn() ? ZONE.aimRate : 10));
    // the zone: regen on the range (a match's hp is the server's), and the edge glow
    if(gameMode!=='mp' && zoneOn() && me.alive && me.hp < 100) me.hp = Math.min(100, me.hp + ZONE.regen*dt);
    const inZone = zoneOn(); if(inZone !== document.body.classList.contains('inzone')) document.body.classList.toggle('inzone', inZone);
    // sprint widens the view a touch — the cue that tells you you're sprinting
    sprintAmt += ((me.sprinting ? 1 : 0) - sprintAmt) * Math.min(1, dt*6);
    const baseFov = 80 + 9*sprintAmt + ROLL.fov*rollPunch;
    const targetFov = baseFov + (curW().adsFov - baseFov) * ads;
    if (Math.abs(camera.fov - targetFov) > 0.05){ camera.fov = targetFov; camera.updateProjectionMatrix(); }
    const scoped = curW().scope && ads > 0.85;
    document.getElementById('scope').style.display = scoped ? 'block' : 'none';
    document.getElementById('crosshair').style.opacity = ads > 0.5 ? 0 : 1;
    gun.visible = !scoped && !specOn;             // scope view hides the gun; so does watching someone else
    redDot.visible = !!curW().redDot && ads > 0.82 && !reloading && rollT <= 0 && !specOn;

    gunKick=Math.max(0,gunKick-dt*6);
    // reload animation: gun swings down + tilts through the reload, then returns.
    let rDip=0, rRot=0, rWob=0;
    if(reloading){
      const p=Math.min(1,(performance.now()-reloadStart)/reloadMsNow(curW()));
      const s=Math.sin(p*Math.PI);                  // 0→1→0 envelope
      rDip=s*0.05; rRot=s*0.30;       // a tilt, not a plunge: the hands do the reload now (drawn.js) and have to stay in view
      if(p>0.3&&p<0.7) rWob=Math.sin(p*40)*0.02;    // hand jiggle mid-reload
    }
    // Stance feedback you can actually see in first person: the weapon rides
    // lower and tilts in as you crouch, more so when prone. Sprinting swings
    // the gun down and aside like you're running with it.
    stanceAmt += ((me.stance==='prone' ? 1 : me.stance==='crouch' ? 0.5 : 0) - stanceAmt) * Math.min(1, dt*10);
    // melee swing: arcs the blade across the screen, alternating each hit
    if(swingT>0) swingT=Math.max(0, swingT-dt*(1000/curW().fireRate)*0.55);
    /* The longsword cuts with its own keyframed arcs (drawn.js SWORD_CUTS),
       so the generic swing - a sine of the whole viewmodel - is for nothing
       else now: with the blade out, `sw` is zero and the cut moves the hand. */
    if (chargeFrom && (!curW().melee || !me.alive || paused)) chargeFrom = 0;   // switched, died or paused mid-charge
    const bladeOut = curW().melee && typeof bladeSwingFrame === 'function' && BLADE_RIG;
    const sw = bladeOut ? 0 : Math.sin(swingT*Math.PI) * swingDir;
    const sp = sprintAmt*(1-ads);
    // stance and sprint poses give way while aiming: you shoulder the gun
    const sx = (-0.06*stanceAmt + 0.10*sp)*(1-ads);
    const sy = (-0.10*stanceAmt - 0.09*sp)*(1-ads);
    const sr = ( 0.30*stanceAmt + 0.45*sp)*(1-ads); // roll/tilt
    /* Base pose slides toward the screen centre while aiming. A red-dot gun
       comes all the way up to the eye: centred on its own centreline, with
       its top AIM_GAP below the eye line, so you look straight down the
       barrel and the dot sits just above the far end of it, like the tip of
       a front sight. A horizontal line just below the eye projects closest to
       centre at its far end, which is what gives the down-the-barrel look.
       Everything else keeps the old, lower pose. */
    const w = curW();
    const adsX = w.redDot ? -0.02 : 0;                       // the model sits 0.02 right of the holder
    const adsY = w.redDot ? -((w.aimTop !== undefined ? w.aimTop : 0.06) + AIM_GAP) : -0.21;
    /* A weapon may carry its own pose (`vm`): where it rests at the hip, how
       far it comes toward the eye when aimed, a small resting cant, and the
       lens it is drawn through. Only the PAC-9 has one (drawn.js); every
       other gun keeps the numbers it always had. */
    const V = w.vm || VM_POSE;
    const bx = V.x + (adsX - V.x)*ads, by = V.y + (adsY - V.y)*ads, bz = V.z + V.adsZ*ads;
    // tuck the weapon down and in while rolling — you don't run a somersault
    // with the gun still levelled at the horizon
    const tuck = ROLL.tuck*rollPunch;
    // recoil is gentler at full ADS, so the gun does not leap across the view every shot
    /* The viewmodel's own lens (V.viewFov): drawing the gun as if through a
       narrower camera is the same as scaling its view-space x and y by the
       ratio of the two lenses' half-widths. Only the RESTING pose and the
       model are scaled - not the motion. Scaling the motion too (as the
       first cut did) made every reload dip and sway 1.65x larger than any
       other gun's, and Jack saw it: "the rifle is moving more than the aim
       itself, like the little dot" - the dot is fixed to the camera.
       `V.motion` then scales what moves: a gun drawn this close to the eye
       swings its sight further across the screen for the same angle, so
       the PAC-9 moves at 0.6 to match the others on screen. The kick
       itself (gunKick, the camera's recoil) is untouched. */
    let vk = V.viewFov ? Math.tan(camera.fov*Math.PI/360) / Math.tan(V.viewFov*Math.PI/360) : 1;
    /* `adsPlain`: the lens fades out as the gun comes up, so the aimed
       picture is exactly the old one (the shotgun, 2026-11-22: "make the
       aim flat like before"). */
    if (V.adsPlain) vk = 1 + (vk - 1) * (1 - ads);
    const mk = V.motion != null ? V.motion : 1;
    gun.position.set(bx*vk + (rWob+sx - sw*0.26)*mk,
                     by*vk + (-rDip+sy + Math.abs(sw)*0.10 - tuck)*mk,
                     bz + (gunKick*(0.1-0.06*ads) - Math.abs(sw)*0.14 + tuck*0.5)*mk);
    /* Aimed through a red dot the gun does NOT tip with the kick (Jack,
       2026-11-22: "the actual position the bullet lands is suppose to be the
       same as what is shown on the scopes aim"). The dot is camera-fixed and
       is where the shot goes; a gun tipping 2 degrees on its own put the
       sight's window above it, aiming 1.8m high at 50m. The camera's recoil
       (unchanged) lifts the view, so window, dot and shot rise together. The
       kick back along the barrel stays - it moves nothing off the line. */
    const adsTip = w.redDot ? 1 : 0.85;
    gun.rotation.set((gunKick*0.4*(1-ads*adsTip) - rRot*0.85 - 0.18*sp - Math.abs(sw)*0.5)*mk + V.rx*(1-ads),
                     (rRot*0.3 + sw*0.9)*mk + V.ry*(1-ads),
                     (rRot*0.5 + sr + sw*1.1)*mk + V.rz*(1-ads));
    gun.scale.set(vk, vk, 1);
    if (bladeOut){ const o = bladeSwingFrame(swingT, swingCut, heavyCharge(performance.now())); if (o) gun.position.add(o);
                   gun.updateMatrix(); bladeArmsFrame(); }      // the elbows and upper arms (drawn.js)
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
    /* One menu screen now, and the operator is its centrepiece, so the
       camera sits at what used to be the mode screen's closer framing. */
    const zoom = 35.2;
    camera.position.set(Math.sin(t*0.18)*1.0 + camLerp.x*2.6,
                        1.55 + Math.sin(t*0.3)*0.1 - camLerp.y*1.1,
                        zoom);
    camera.lookAt(camLerp.x*0.7, 1.12 - camLerp.y*0.25, 32);
    /* A portrait lens for the menu. The operator is the centrepiece of the
       deployment screen, and at the playing FOV of 80 he is a small figure in
       a wide room. Narrowing the LENS rather than walking the camera in keeps
       him clear of the podium and compresses the arena behind him, which is
       what makes it read as a backdrop. startPlay puts it back to 80. */
    const MENU_FOV = 52;
    if(Math.abs(camera.fov - MENU_FOV) > 0.01){
      camera.fov += (MENU_FOV - camera.fov) * Math.min(1, dt*6);
      camera.updateProjectionMatrix();
    }
  }

  // interpolate + animate networked entities
  const animate=(o)=>{ const m=o.mesh;
    /* Interpolate a BASE position that the tumble offset never feeds back into.
       Writing the offset onto m.position and then lerping FROM m.position next
       frame compounds it: a roll used to end with the avatar floating ~2m up,
       sinking back down over the following second. */
    if(o.bx===undefined){ o.bx=o.tx; o.by=o.ty||0; o.bz=o.tz; }
    const px=o.bx, pz=o.bz;
    /* Where they are NOW, not where the last snapshot put them. Two separate
       lags used to stack up here and both are fixed:

       - the ease ran at a flat 0.2 PER FRAME, so it was frame-rate dependent
         (worse the lower your fps) and left a permanent trailing error;
       - nothing extrapolated, so the drawn position was always a snapshot or
         more behind the position the SERVER hit-tests shots against.

       Together they drew a sprinting opponent roughly 0.7m behind their real
       position at 60fps — nearly two body widths — so you had to lead a
       strafing player to hit them. We extrapolate by the age of the snapshot
       PLUS the ease's own time constant (1/REMOTE_EASE), which cancels the
       trailing error instead of merely shrinking it. Capped so a dropped
       packet slides the body a little rather than flinging it across the map. */
    const age  = Math.min((performance.now() - (o.tAt||0))/1000, REMOTE_PREDICT);
    const lead = Math.min(age + 1/REMOTE_EASE, REMOTE_PREDICT);
    const gx = o.tx + (o.vx||0)*lead, gz = o.tz + (o.vz||0)*lead;
    const k = 1 - Math.exp(-REMOTE_EASE*dt);        // frame-rate independent
    o.bx += (gx-o.bx)*k; o.by += ((o.ty||0)-o.by)*k; o.bz += (gz-o.bz)*k;
    const nx=o.bx, ny=o.by, nz=o.bz;
    /* Peeking slides the body sideways, the same offset the server now uses
       for hit tests — so what you see is what you can shoot. */
    o.lo = (o.lo||0) + (((o.tlo||0) - (o.lo||0)) * Math.min(1, dt*LEAN.rate));
    const lx = Math.cos(o.tyaw - Math.PI) * o.lo, lz = -Math.sin(o.tyaw - Math.PI) * o.lo;
    const gone=Math.hypot(nx-px,nz-pz), moved=gone>0.002; m.position.set(nx+lx,ny,nz+lz);
    /* Footsteps you can hear coming. Paced by distance actually covered, like
       your own, and only while they are upright: crouching and going prone
       are how you move quietly. A single jump of over a metre is a respawn
       or a correction, not a stride. */
    if(o.alive && !o.tst && gone < 1){
      o.stepAcc = (o.stepAcc||0) + gone;
      if(o.stepAcc >= REMOTE_STRIDE){ o.stepAcc = 0; o.stepL = !o.stepL; Sfx.step(o.stepL, { x:nx, z:nz }); }
    }
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
  /* The composer carries the bloom AND the grade, so it runs when either
     is on; with both off this falls back to the plain render, which is
     what the Performance preset is for. */
  litFrame();                                                      // the shadow box rides with the camera (lighting.js)
  drawMinimap(nowMs);                                              // where you are (hud.js); throttles itself
  if (!byId('bigmap').classList.contains('hidden')) drawBigMap();
  if (gameState === 'playing') armsFrame();                       // the hands, and the reload (drawn.js)
  stationHum(dt);                                                  // the plant, by how near you are to it (hud.js)
  ambience(dt);                                                    // wind or room tone, and things far off (hud.js)
  if (gradePass) gradePass.uniforms.uTime.value = nowMs * 0.001;   // the grain has to move
  if (composer && (SETTINGS.bloom || SETTINGS.look)) composer.render(); else renderer.render(scene,camera);
}
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); applySettings(); });
updateHUD();
/* Once more now that the world, the models and the viewmodels all exist:
   the first call ran from core.js, when the scene held almost nothing. */
applyLook();
loop();
