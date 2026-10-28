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
  rollDir.copy(d.normalize()); rollT=ROLL.dur; rollCdUntil=now+ROLL.cdMs;
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
    abilityCharges[currentWeapon]--; abilityRecharge[currentWeapon].push(now + w.cooldownMs);
    lastShot=now; gunKick=1; Sfx.shoot(w); updateHUD();
    me.pitch=Math.min(me.pitch + w.recoil, Math.PI/2-0.05);
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch,me.yaw,0,'YXZ'));
    dir.x+=(Math.random()-0.5)*w.spread; dir.y+=(Math.random()-0.5)*w.spread; dir.z+=(Math.random()-0.5)*w.spread;
    dir.normalize();
    const o=camera.position.clone().addScaledVector(dir,0.6);
    if(w.kind==='smoke'){
      if(gameMode==='mp' && socket) socket.emit('smokebolt',{ ox:o.x,oy:o.y,oz:o.z, dx:dir.x,dy:dir.y,dz:dir.z, ric:ricochet?1:0 });
      else spawnLocalArrow(o,dir,w,ricochet);
    } else if(gameMode==='mp' && socket)
      socket.emit('arrow',{ ox:o.x,oy:o.y,oz:o.z, dx:dir.x,dy:dir.y,dz:dir.z, ric:ricochet?1:0 });
    else spawnLocalArrow(o,dir,w,ricochet);
    return;
  }

  const a=curAmmo();
  if(a.mag<=0){ Sfx.empty(); reload(); return; }
  lastShot=now; a.mag--; updateHUD(); gunKick=1; Sfx.shoot(w);
  const spread = w.spread + (w.adsSpread - w.spread)*ads;   // ADS tightens the cone
  const o=camera.position.clone();
  const pellets = w.pellets || 1;                            // shotgun fires several
  for(let p=0;p<pellets;p++){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(me.pitch,me.yaw,0,'YXZ'));
    dir.x+=(Math.random()-0.5)*spread; dir.y+=(Math.random()-0.5)*spread; dir.z+=(Math.random()-0.5)*spread; dir.normalize();
    addTracer(o.clone(),dir,w.range);
    if(gameMode==='mp'){ socket.emit('fire',{ ox:o.x,oy:o.y,oz:o.z, dx:dir.x,dy:dir.y,dz:dir.z, dmg:w.dmg, range:w.range }); continue; }
    // local hit detection (target practice)
    _ray.set(o,dir); _ray.far=w.range; const wh=_ray.intersectObjects(wallMeshes,false); let bd=Math.min(wh.length?wh[0].distance:Infinity, w.range);
    let best=null, head=false;
    for(const b of localBots){ if(!b.alive) continue;
      const body=raySphere(o,dir,b.x,1.05,b.z,0.55), hh=raySphere(o,dir,b.x,1.70,b.z,0.30);
      let t=Infinity,hs=false; if(hh<t){t=hh;hs=true;} if(body<t){t=body;hs=false;}
      if(t<bd){ bd=t; best=b; head=hs; } }
    if(best){ best.hp-= head?w.dmg*2.5:w.dmg; hitmark(); Sfx.hit();
      if(best.hp<=0 && best.alive){ best.alive=false; best.mesh.visible=false; localKills++; updateHUD(); setTimeout(()=>respawnLocalBot(best),2000); } }
  }
  // recoil kicks in AFTER the bullet leaves — shots land where the crosshair was
  me.pitch=Math.min(me.pitch + w.recoil*(1-ads*0.5), Math.PI/2-0.05);
}
