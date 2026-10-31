/* =============================================================
   Bot Strike — input.js  (6 of 9 in load order)

   Keyboard and mouse, and firing every weapon.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after session.js and before effects.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Input ---- */
const keys={}; let pointerLocked=false, wantFire=false;
/* Keystrokes aimed at a form field must never reach the game bindings.
   'o' was the visible one — it sits above the gameState guard below, so
   typing it opened the graphics panel AND preventDefault ate the character,
   making it impossible to put an o in your callsign. Every other bound
   letter (r, g, h, f, v, c, z) was being swallowed the same way, and Tab
   jumped to the armory instead of the next field. */
function typingInField(t){
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
addEventListener('keydown',e=>{
  if(typingInField(e.target)) return;            // let the field have it
  keys[e.code]=true;
  if(e.code==='KeyO'){ e.preventDefault();
    document.getElementById('settings').classList.contains('hidden') ? openSettings() : closeSettings(); return; }
  if(gameState!=='playing') return;
  if(e.code==='Tab'){ e.preventDefault(); toggleArmory(); return; }
  if(e.code==='KeyR') reload();
  // Number keys select by POSITION in your list: whatever you bought first is
  // 1, the next is 2, and the blade sits on the end. They are not tied to a
  // particular weapon any more.
  const digit = /^Digit([1-9])$/.exec(e.code);
  if(digit){ const inv = inventory(), at = +digit[1] - 1;
             if(at < inv.length) switchWeapon(inv[at]); }
  if(e.code==='Space' && !e.repeat) jumpPressed=true;   // edge, so holding won't spam
  if(e.code==='KeyG') switchWeapon(XBOW);               // equip the crossbow ability
  if(e.code==='KeyH') switchWeapon(SMOKE);              // equip the smoke ability
  if(e.code==='KeyF') switchWeapon(BLADE);              // equip the blade
  if(e.code==='KeyV' && !e.repeat) startRoll();
  if(e.code==='KeyC'){
    // sprinting -> slide; otherwise it's the normal crouch toggle
    // slide if you're sprinting OR still carrying speed (e.g. out of a roll)
    if(SLIDE_ENABLED && (me.sprinting || me.hv.length()>8.5) && me.onGround && slideT<=0) startSlide();
    else me.stance = me.stance==='crouch' ? 'stand' : 'crouch';
  }
  if(e.code==='KeyZ') me.stance = me.stance==='prone'  ? 'stand' : 'prone'; });

function startRoll(){
  const now=performance.now();
  // a roll may cancel a slide — that chain is the whole point
  if(gameState!=='playing' || !me.alive || rollT>0 || now<rollCdUntil || !me.onGround) return;
  slideT=0;
  // roll the way you're moving; straight ahead if you're standing still
  const fwd=new THREE.Vector3(-Math.sin(me.yaw),0,-Math.cos(me.yaw));
  const rgt=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
  const d=new THREE.Vector3();
  if(keys['KeyW'])d.add(fwd); if(keys['KeyS'])d.sub(fwd); if(keys['KeyD'])d.add(rgt); if(keys['KeyA'])d.sub(rgt);
  if(d.lengthSq()===0) d.copy(fwd);
  rollDir.copy(d.normalize()); rollT=ROLL.dur;
  rollCdUntil = training('noCooldown') ? 0 : now+ROLL.cdMs;
  // lean the camera the way we're rolling, and pitch it the way we're going:
  // sideways rolls lean, forward/back rolls somersault
  rollLean = -rollDir.dot(new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw)));
  rollFwd  =  rollDir.dot(fwd);
  // velocity ramps in via the rate-30 easing below — punchy but not a jump
  me.stance='stand'; Sfx.land();
}
function startSlide(){
  const now=performance.now();
  if(now<slideCdUntil || !me.alive) return;
  const fwd=new THREE.Vector3(-Math.sin(me.yaw),0,-Math.cos(me.yaw));
  const rgt=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
  const d=new THREE.Vector3();
  if(keys['KeyW'])d.add(fwd); if(keys['KeyS'])d.sub(fwd); if(keys['KeyD'])d.add(rgt); if(keys['KeyA'])d.sub(rgt);
  if(d.lengthSq()===0) d.copy(fwd);
  slideDir.copy(d.normalize()); slideT=SLIDE.dur;
  // keep whatever speed you already had, so a slide out of a roll stays fast
  slideSpd=Math.max(SLIDE.speed, me.hv.length());
  slideLean = -slideDir.dot(new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw)));
  slideCdUntil=now+SLIDE.cdMs; me.stance='crouch'; Sfx.step(true);
}
addEventListener('keyup',e=> keys[e.code]=false);
addEventListener('mousemove',e=>{ if(!pointerLocked) return;
  const sens = 0.0022*(1 - ads*0.65);            // slower, steadier aim while ADS
  me.yaw-=e.movementX*sens; me.pitch-=e.movementY*sens;
  const l=Math.PI/2-0.05; me.pitch=Math.max(-l,Math.min(l,me.pitch)); });
addEventListener('mousedown',e=>{
  if(e.button===0){ wantFire=true; semiQueued=true; }
  // crossbow: right-click switches fire mode instead of aiming
  if(e.button===2){ if(curW().ability && !curW().melee){ ricochet=!ricochet; Sfx.swap(); updateHUD(); }
                    else if(!curW().ability) aiming=true; } });   // abilities don't ADS
addEventListener('mouseup',e=>{
  if(e.button===0) wantFire=false;
  if(e.button===2) aiming=false; });
/* Scroll to change weapon: through your guns and the blade, never onto the
   crossbow or smoke — landing on an ability mid-fight because you nudged the
   wheel would be miserable. They stay on G and H. */
addEventListener('wheel', e=>{
  if(gameState!=='playing' || !pointerLocked || paused) return;
  if(Math.abs(e.deltaY) < 1) return;
  e.preventDefault();
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive:false });

addEventListener('contextmenu',e=> e.preventDefault());   // right-click = aim, not menu
document.addEventListener('pointerlockchange',()=>{
  pointerLocked = document.pointerLockElement===canvas;
  // Esc releases the mouse — treat that as "pause", unless another panel
  // (armory / settings) is what deliberately released it.
  if(!pointerLocked && gameState==='playing' && !paused && !armoryOpen
     && document.getElementById('settings').classList.contains('hidden')){
    openPause();
  }
});
canvas.addEventListener('click',()=>{ if(gameState==='playing' && me.alive && !pointerLocked) lockPointer(); });

/* ---- Shooting ---- */
const _ray = new THREE.Raycaster();
function raySphere(o,dir,cx,cy,cz,r){ const ox=o.x-cx,oy=o.y-cy,oz=o.z-cz; const b=ox*dir.x+oy*dir.y+oz*dir.z; const c=ox*ox+oy*oy+oz*oz-r*r; const disc=b*b-c; if(disc<0) return Infinity; const t=-b-Math.sqrt(disc); return t>0?t:Infinity; }
let reloadStart=0;
const RELOAD_LINES=['Reloading!','Reloading, cover me!','Changing mags!'];
function reload(){ const w=curW();
  if(w.ability) return;                       // the crossbow recharges, it doesn't reload
  const a=curAmmo();
  if(reloading||a.mag===w.magMax||a.reserve<=0) return; reloading=true;
  reloadStart=performance.now(); updateHUD();
  // voice call-out + timed magazine sounds across the reload
  Voice.say(RELOAD_LINES[Math.floor(Math.random()*RELOAD_LINES.length)]);
  Sfx.magOut();
  const t1=setTimeout(()=>Sfx.magIn(), w.reloadMs*0.55);
  const t2=setTimeout(()=>Sfx.bolt(),  w.reloadMs*0.85);
  reloadTimer=setTimeout(()=>{ const need=w.magMax-a.mag, take=Math.min(need,a.reserve); a.mag+=take; a.reserve-=take; reloading=false; updateHUD(); }, w.reloadMs);
  reloadSfxTimers=[t1,t2]; }
let reloadSfxTimers=[];
function shoot(){
  const now=performance.now(), w=curW();
  if(reloading||now-lastShot<w.fireRate||!me.alive) return;

  // --- BLADE: five-hit melee combo, cone hit test in front of you ---
  if(w.melee){
    lastShot=now;
    if(now>comboUntil) comboStep=0;                 // chain timed out
    swingT=1; swingDir=-swingDir;                   // alternate slash direction
    Sfx.swap();
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch,me.yaw,0,'YXZ'));
    const o=camera.position.clone();
    const dmg=w.combo[Math.min(comboStep, w.combo.length-1)];
    const finisher = comboStep===w.combo.length-1;

    if(gameMode==='mp' && socket){
      socket.emit('melee',{ ox:o.x,oy:o.y,oz:o.z, dx:dir.x,dy:dir.y,dz:dir.z });
      comboStep=(comboStep+1)%w.combo.length; comboUntil=now+w.comboWindowMs; updateHUD();
      return;
    }
    // local (target practice): nearest target inside the reach cone
    let best=null, bestD=Infinity;
    for(const b of localBots){ if(!b.alive) continue;
      const to=new THREE.Vector3(b.x-o.x, 1.1-o.y, b.z-o.z); const d=to.length();
      if(d>w.reach) continue;
      if(to.normalize().dot(dir) < w.arc) continue;  // outside the swing arc
      if(d<bestD){ bestD=d; best=b; } }
    if(best){
      best.hp-=dmg; hitmark(); Sfx.hit();
      comboStep=(comboStep+1)%w.combo.length; comboUntil=now+w.comboWindowMs;
      if(finisher){ gunKick=1; Sfx.land(); }
      if(best.hp<=0 && best.alive){ best.alive=false; best.mesh.visible=false; extinguish(best);
        localKills++; setTimeout(()=>respawnLocalBot(best),2000); }
    } else { comboStep=0; }                          // a miss breaks the chain
    updateHUD();
    return;
  }

  // --- CROSSBOW ability: spends a charge, launches a real flaming arrow ---
  if(w.ability){
    abilityTick();
    if(abilityCharges[currentWeapon]<=0){ Sfx.empty(); return; }
    if(!training('noCooldown')){                 // practice: charges never run down
      abilityCharges[currentWeapon]--; abilityRecharge[currentWeapon].push(now + w.cooldownMs);
    }
    lastShot=now; gunKick=1; Sfx.shoot(w); updateHUD();
    /* Aim FIRST, kick after. This kicked the view up before working out
       where the bolt was going, so every bolt left along the post-recoil
       angle rather than the one you aimed — 0.6m high at 30m on the
       crossbow. The gun path has done it in this order for ages; the
       abilities were simply never given the same treatment. */
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch,me.yaw,0,'YXZ'));
    if(!training('noSpread')){ dir.x+=(Math.random()-0.5)*w.spread; dir.y+=(Math.random()-0.5)*w.spread; dir.z+=(Math.random()-0.5)*w.spread; }
    dir.normalize();
    /* Out of the crossbow, and AT the crosshair.

       Leaving the muzzle was the easy half: it used to start 0.6m in front
       of the camera, so the bolt appeared to come from the bridge of your
       nose. But the muzzle sits ~0.3m right and ~0.28m below the eye, so
       firing it along the camera's direction sent it on a line PARALLEL to
       where you were aiming — permanently off to one side, never crossing
       the crosshair at any range. Same mistake the sniper tracer made.

       So: find where the aim ray actually lands, and point the bolt at that
       instead of merely copying the camera's heading. Distance is clamped —
       too near and a bolt fired against a wall would set off sideways, too
       far and the convergence stops mattering. The drop from gravity is
       unchanged; the crossbow is still an arcing weapon. */
    const sight = camera.position.clone().addScaledVector(dir, 0.4);
    const o = muzzleWorld().clone().lerp(sight, ads).addScaledVector(dir, 0.15);

    const aimTargets = wallMeshes.slice();
    if(gameMode==='mp') for(const ot of others.values()) if(ot.mesh.visible) aimTargets.push(ot.mesh);
    _ray.set(camera.position, dir); _ray.far = w.range;
    const ah = _ray.intersectObjects(aimTargets, true);
    const aimAt = Math.max(3, Math.min(ah.length ? ah[0].distance : 45, 80));
    const bdir = camera.position.clone().addScaledVector(dir, aimAt).sub(o).normalize();

    if(w.kind==='smoke'){
      if(gameMode==='mp' && socket) socket.emit('smokebolt',{ ox:o.x,oy:o.y,oz:o.z, dx:bdir.x,dy:bdir.y,dz:bdir.z, ric:ricochet?1:0 });
      else spawnLocalArrow(o,bdir,w,ricochet);
    } else if(gameMode==='mp' && socket)
      socket.emit('arrow',{ ox:o.x,oy:o.y,oz:o.z, dx:bdir.x,dy:bdir.y,dz:bdir.z, ric:ricochet?1:0 });
    else spawnLocalArrow(o,bdir,w,ricochet);
    me.pitch=Math.min(me.pitch + w.recoil, Math.PI/2-0.05);   // kick, now it has left
    return;
  }

  const a=curAmmo();
  if(a.mag<=0){ Sfx.empty(); reload(); return; }
  lastShot=now; if(!training('infAmmo')) a.mag--;   // practice: the mag never empties
  updateHUD(); gunKick=1; Sfx.shoot(w);
  /* Tighten to the full ADS cone by the time you are actually AIMING, not
     at the very end of the zoom. The scope overlay appears at ads 0.85, and
     at that point the old linear blend still left the sniper at 0.0088 — six
     times its aimed spread — so the first shot after the scope came up was
     far less accurate than the scope implied. */
  const aimK = Math.min(1, ads / 0.85);
  /* Each shot is nudged inside a cone, and because that is an ANGLE the miss
     grows with range: a rifle hip-fired lands a headshot 88% of the time at
     25m but 36% at 40m. The practice range can switch it off to see exactly
     where a shot goes; multiplayer always has it. */
  const spread = training('noSpread') ? 0 : w.spread + (w.adsSpread - w.spread)*aimK;
  const o=camera.position.clone();
  const pellets = w.pellets || 1;                            // shotgun fires several
  for(let p=0;p<pellets;p++){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch,me.yaw,0,'YXZ'));
    dir.x+=(Math.random()-0.5)*spread; dir.y+=(Math.random()-0.5)*spread; dir.z+=(Math.random()-0.5)*spread; dir.normalize();
    /* End the line where the shot actually stops, not at the weapon's full
       240m range. A tracer drawn from the muzzle only meets the aim ray at
       its far END, so running it to maximum range left it passing a quarter
       of a metre to the RIGHT of whatever you were shooting at — it looked
       like the bullet was landing nowhere near the crosshair. Ending it on
       the first wall makes it converge there instead. */
    const tTargets = wallMeshes.slice();
    if(gameMode==='mp') for(const ot of others.values()) if(ot.mesh.visible) tTargets.push(ot.mesh);
    _ray.set(o,dir); _ray.far=w.range;
    const twh=_ray.intersectObjects(tTargets,true);   // players too, so it meets THEM
    const tlen=Math.min(twh.length?twh[0].distance:Infinity, w.range);
    /* Down the sight line once you are aiming. Hip-fired, starting at the
       barrel looks right. Aiming, the gun is tucked under your eye (and on
       the sniper it is hidden entirely), and the zoom magnifies the offset:
       at the sniper's 20 degree FOV that same 0.3m muzzle offset lands the
       tracer ~590px right and ~550px below a centred reticle on a 1024-wide
       screen. It read as the shot going nowhere near where you aimed. */
    const sight = o.clone().addScaledVector(dir, 0.4);   // just ahead of the eye
    addTracer(o,dir,tlen,muzzleWorld().clone().lerp(sight,ads));
    // damage and range are the SERVER's to decide; we only say which gun
    if(gameMode==='mp'){ socket.emit('fire',{ ox:o.x,oy:o.y,oz:o.z, dx:dir.x,dy:dir.y,dz:dir.z, w:currentWeapon }); continue; }
    // local hit detection (target practice)
    _ray.set(o,dir); _ray.far=w.range; const wh=_ray.intersectObjects(wallMeshes,false); let bd=Math.min(wh.length?wh[0].distance:Infinity, w.range);
    let best=null, mult=1, zone=null;
    for(const b of localBots){ if(!b.alive) continue;
      const z = hitZone(o, dir, b.x, b.z, 0, 0);     // bots always stand
      if(z && z.t<bd){ bd=z.t; best=b; mult=z.mult; zone=z.zone; } }
    if(best){ best.hp-= w.dmg*mult; hitmark(zone); Sfx.hit();
      if(best.hp<=0 && best.alive){ best.alive=false; best.mesh.visible=false; localKills++; updateHUD(); setTimeout(()=>respawnLocalBot(best),2000); } }
  }
  // recoil kicks in AFTER the bullet leaves — shots land where the crosshair was
  me.pitch=Math.min(me.pitch + w.recoil*(1-ads*0.5), Math.PI/2-0.05);
}
