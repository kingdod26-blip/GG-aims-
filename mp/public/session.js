/* =============================================================
   Bot Strike — session.js  (5 of 9 in load order)

   Game state and flow: menus, settings panel, pause, networking, local bots.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after weapons.js and before input.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Game state ---- */
let gameState='home', gameMode=null, myId=null, connected=false, localKills=0;
/* Economy, mirrored from the server — never trusted as the source of truth,
   it only drives what the shop shows and what you're allowed to equip. */
let myMoney=0, myGun=null, shopPrices=[150,300,150,50,50];
let socket=null;
const others = new Map();     // networked players
const serverBots = new Map(); // networked bots (mp)
const localBots = [];         // { mesh,x,z,hp,alive } (bots mode)
const tracers = [];

/* ---- Spatial menu interaction: mouse parallax + drag-to-inspect ----
   The pointer feeds BOTH the CSS glass layers (via --mx/--my custom props)
   and the real 3D camera, so the flat UI and the 3D scene move together. */
const menuMouse = { x:0, y:0 };
const camLerp = { x:0, y:0 };
let dragging=false, dragDX=0, heroSpinVel=0.6, lastDragX=0;
const rootEl = document.documentElement;
addEventListener('mousemove', (e)=>{
  if(gameState==='playing') return;                 // in-game look is pointer-locked
  const w=innerWidth||1, h=innerHeight||1;          // guard: never divide by zero
  const nx=e.clientX/w-0.5, ny=e.clientY/h-0.5;
  if(!isFinite(nx)||!isFinite(ny)) return;          // never let NaN reach the camera
  menuMouse.x=nx; menuMouse.y=ny;
  rootEl.style.setProperty('--mx', nx.toFixed(4));
  rootEl.style.setProperty('--my', ny.toFixed(4));
  if(dragging){ dragDX = e.clientX - lastDragX; lastDragX = e.clientX; }
});
addEventListener('mousedown', (e)=>{
  if(gameState==='playing' || e.button!==0) return;
  const t=e.target;
  if(t && t.closest && t.closest('button, input, .card')) return;   // don't hijack UI clicks
  dragging=true; lastDragX=e.clientX||0; document.body.style.cursor='grabbing';
});
addEventListener('mouseup', ()=>{ if(dragging){ dragging=false; document.body.style.cursor=''; } });

/* ---- Graphics settings panel ---- */
const SET_DEFS = [
  { key:'fpsCap',   label:'FRAME CAP',  opts:[[30,'30'],[60,'60'],[120,'120'],[0,'UNCAPPED']] },
  { key:'resScale', label:'RESOLUTION', opts:[[0.75,'75%'],[1,'100%'],[1.5,'150%'],[2,'200%']] },
  { key:'shadows',  label:'SHADOWS',    opts:[[0,'OFF'],[1024,'MEDIUM'],[2048,'HIGH']] },
  { key:'bloom',    label:'BLOOM GLOW', opts:[[0,'OFF'],[1,'ON']] },
];
function renderSettingsUI(){
  const host=document.getElementById('setRows'); if(!host) return;
  host.innerHTML = SET_DEFS.map(d=>`<div class="srow"><label>${d.label}</label><div class="seg" data-key="${d.key}">`+
    d.opts.map(([v,l])=>`<button data-v="${v}" class="${Number(SETTINGS[d.key])===Number(v)?'on':''}">${l}</button>`).join('')+
    `</div></div>`).join('');
  host.querySelectorAll('.seg button').forEach(btn=>{
    btn.onclick = ()=>{ SETTINGS[btn.closest('.seg').dataset.key] = Number(btn.dataset.v); applySettings(); renderSettingsUI(); };
  });
}
/* ---- Pause menu + quit to menu ---- */
let paused=false;
function openPause(){
  if(gameState!=='playing' || paused) return;
  paused=true;
  document.getElementById('pauseMode').textContent = (gameMode==='mp') ? 'Multiplayer' : 'Target Practice';
  document.getElementById('pause').classList.remove('hidden');
  document.exitPointerLock();
  wantFire=false; aiming=false;            // don't keep firing/aiming while paused
}
function closePause(resume){
  paused=false;
  document.getElementById('pause').classList.add('hidden');
  if(resume && gameState==='playing') lockPointer();
}
/* Full teardown back to the home screen — leaves no timers, sockets or
   leftover meshes behind, so starting a new match is a clean slate. */
function quitToMenu(){
  closePause(false);
  toggleArmory(false);
  document.getElementById('settings').classList.add('hidden');
  // stop the match
  gameState='home';
  document.exitPointerLock();
  // drop the multiplayer connection and everyone it spawned
  if(socket){ try{ socket.disconnect(); }catch(e){} socket=null; }
  myId=null; connected=false;
  for(const o of others.values()) scene.remove(o.mesh); others.clear();
  for(const o of serverBots.values()) scene.remove(o.mesh); serverBots.clear();
  // clear local targets
  localBots.forEach(b=>scene.remove(b.mesh)); localBots.length=0;
  // clear tracers (frees their GPU resources too)
  while(tracers.length) disposeTracer(tracers.pop());
  // clear arrows in flight + reset ability state
  while(arrows.length) removeArrow(arrows[0]);
  for(const [id,m] of arrowGfx) scene.remove(m); arrowGfx.clear();
  rollT=0; slideT=0; leanAmt=0; resetAbilities(); clearSmoke();
  me.hv.set(0,0,0); camRoll=0; camDip=0; comboStep=0; swingT=0;
  // stop timers / audio / input state
  clearTimeout(reloadTimer); reloadSfxTimers.forEach(clearTimeout); reloadSfxTimers=[];
  reloading=false; wantFire=false; semiQueued=false; aiming=false; ads=0;
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
  // restore the menu presentation
  camera.fov=80; camera.updateProjectionMatrix();
  document.body.classList.remove('playing');
  document.getElementById('crosshair').style.display='none';
  document.getElementById('scope').style.display='none';
  document.getElementById('respawn').style.display='none';
  clearFeed(); clearGroundFires();
  heroGroup.forEach(o=>o.visible=true); gun.visible=false;
  document.getElementById('mode').classList.add('hidden');
  document.getElementById('home').classList.remove('hidden');
}
document.getElementById('resumeBtn').onclick   = ()=> closePause(true);
document.getElementById('quitBtn').onclick     = quitToMenu;
document.getElementById('exitHud').onclick     = openPause;
document.getElementById('pauseSettings').onclick = ()=>{
  document.getElementById('pause').classList.add('hidden');   // keep paused underneath
  openSettings();
};

let settingsReturnToPlay=false;
function openSettings(){
  settingsReturnToPlay = (gameState==='playing');
  if(settingsReturnToPlay) document.exitPointerLock();
  renderSettingsUI();
  document.getElementById('settings').classList.remove('hidden');
}
function closeSettings(){
  document.getElementById('settings').classList.add('hidden');
  // opened from the pause menu? go back to it rather than straight into the game
  if(paused){ document.getElementById('pause').classList.remove('hidden'); return; }
  if(settingsReturnToPlay && gameState==='playing') lockPointer();
}
document.getElementById('gearBtn').onclick = openSettings;
document.getElementById('setClose').onclick = closeSettings;
document.querySelectorAll('.preset').forEach(p=> p.onclick = ()=> applyPreset(p.dataset.preset));
renderSettingsUI();

/* ---- Menu wiring ---- */
document.getElementById('startBtn').onclick = ()=>{ gameState='mode';
  document.getElementById('home').classList.add('hidden'); document.getElementById('mode').classList.remove('hidden'); };
document.getElementById('backBtn').onclick = ()=>{ gameState='home';
  document.getElementById('mode').classList.add('hidden'); document.getElementById('home').classList.remove('hidden'); };
document.getElementById('cardBots').onclick = ()=> startPlay('bots');
document.getElementById('cardMp').onclick   = ()=> startPlay('mp');

function startPlay(mode){
  gameMode = mode; gameState='playing';
  document.getElementById('mode').classList.add('hidden');
  document.body.classList.add('playing');
  document.getElementById('crosshair').style.display='block';
  document.getElementById('board').style.display = (mode==='mp') ? 'block' : 'none';
  document.getElementById('banner').style.display = 'none';
  document.getElementById('feed').style.display  = (mode==='mp') ? 'block' : 'none';
  Sfx.resume();                       // unlock audio (browsers require a user gesture)
  if(window.speechSynthesis) speechSynthesis.getVoices();   // warm up voice list
  heroGroup.forEach(o=>o.visible=false); gun.visible=true;
  const nm = (document.getElementById('nameInput').value.trim()) || (mode==='bots'?'You':'Player');
  // reset player + weapons
  me.x=0; me.z=44; me.feetY=0; me.eyeH=1.7; me.stance='stand'; me.vy=0; me.hp=100; me.alive=true;
  weaponAmmo = WEAPONS.map(w=>({ mag:w.magMax, reserve:w.reserveMax }));
  currentWeapon=0; weaponHolders.forEach((h,i)=>h.visible=i===0);
  reloading=false; clearTimeout(reloadTimer); aiming=false; ads=0; semiQueued=false; paused=false;
  camera.fov=80; camera.updateProjectionMatrix();
  localKills=0; updateHUD();
  if (mode==='mp'){ connectMP(nm); document.getElementById('status').textContent='connecting…'; }
  else { spawnLocalBots(8); document.getElementById('status').textContent='Target Practice — offline'; }
  lockPointer();
}

/* ---- Multiplayer networking ---- */
function connectMP(name){
  socket = io();
  socket.on('connect', ()=>{ connected=true; document.getElementById('status').textContent='connected'; socket.emit('state',{name}); });
  socket.on('disconnect', ()=>{ connected=false; document.getElementById('status').textContent='disconnected'; });
  socket.on('welcome', d=>{ myId=d.id; me.x=d.spawn.x; me.z=d.spawn.z; });
  socket.on('snapshot', onSnapshot);
  socket.on('shot', d=> addTracer(new THREE.Vector3(d.ox,d.oy,d.oz), new THREE.Vector3(d.dx,d.dy,d.dz), d.len));
  socket.on('impact', ()=> hitmark());
  socket.on('groundfire', d=> spawnGroundFire(d.x, d.z));
  socket.on('smoke', d=> spawnSmoke(d.x, d.z, d.by));
  socket.on('bought', d=>{ myGun=d.slot; myMoney=d.money; Sfx.swap();
    switchWeapon(d.slot); if(armoryOpen) renderArmory(); });
  // the server wipes fire, smoke and arrows between rounds — follow it, or
  // last round's pools keep burning on screen over the new one
  socket.on('fieldclear', ()=>{
    clearGroundFires(); clearSmoke();
    for(const [id,m] of arrowGfx){ scene.remove(m); disposeTree(m); }
    arrowGfx.clear();
    for(const o of others.values()){ clearBurnFx(o); clearMark(o); }
  });
  socket.on('kill', addFeed);
}
function onSnapshot(s){
  if(s.prices) shopPrices = s.prices;
  updateMatchUI(s.match, s.players);
  const mine = s.players.find(p=>p.id===myId);
  if (mine){ me.hp=mine.hp;
    const gunChanged = (myGun !== (mine.gun===undefined?null:mine.gun));
    myMoney = mine.money||0; myGun = (mine.gun===undefined?null:mine.gun);
    // unconditional: you join holding the rifle from init, which you do not own
    ensureValidWeapon();
    if(gunChanged && armoryOpen) renderArmory();
    if (me.alive && !mine.alive) { document.getElementById('respawn').style.display='flex';
      document.getElementById('respawnMsg').textContent = 'Out for this round — watch it play out';
      document.exitPointerLock(); }
    if (!me.alive && mine.alive){ me.x=mine.x; me.z=mine.z; me.feetY=0; document.getElementById('respawn').style.display='none'; }
    me.alive=mine.alive;
  }
  const seen=new Set();
  for (const p of s.players){ if(p.id===myId) continue; seen.add(p.id);
    let o=others.get(p.id); if(!o){ const mesh=newPlayerMesh(p.color); scene.add(mesh); o={mesh,tx:p.x,tz:p.z,ty:p.y||0,tyaw:p.yaw}; others.set(p.id,o); }
    // +PI: our character models face +Z, but a player's yaw describes a -Z
    // look direction — without this, remote players appear to run backwards.
    o.tx=p.x; o.tz=p.z; o.ty=p.y||0; o.tyaw=p.yaw+Math.PI; o.tst=p.st||0; o.trl=p.rl||0;
    o.tburn=!!p.bn; o.mesh.visible=p.alive;
    o.wins=p.wins||0;
    o.markedBy = p.mk || null; }       // set only while the tag is live
  for (const [id,o] of others){ if(!seen.has(id)){ clearMark(o); clearBurnFx(o); scene.remove(o.mesh); others.delete(id); } }
  const bseen=new Set();
  for (const b of (s.bots||[])){ bseen.add(b.id);   // no bots in MP any more
    let o=serverBots.get(b.id); if(!o){ const mesh=newBotMesh(); scene.add(mesh); o={mesh,tx:b.x,tz:b.z,ty:0,tyaw:b.yaw}; serverBots.set(b.id,o); }
    // server bots are stationary with a fixed yaw — turn them to face you instead
    o.tx=b.x; o.tz=b.z; o.tyaw=Math.atan2(me.x-b.x, me.z-b.z); o.mesh.visible=b.alive; }
  for (const [id,o] of serverBots){ if(!bseen.has(id)){ scene.remove(o.mesh); serverBots.delete(id); } }
  // arrows in flight (server-simulated) — spawn/move/retire their meshes
  const aseen=new Set();
  for(const ar of (s.arrows||[])){ aseen.add(ar.id);
    let m=arrowGfx.get(ar.id);
    if(!m){ m=makeArrowMesh(); scene.add(m); arrowGfx.set(ar.id,m); }
    m.position.set(ar.x,ar.y,ar.z);
    m.lookAt(ar.x+ar.vx, ar.y+ar.vy, ar.z+ar.vz);
    flickerArrow(m, performance.now());
  }
  for(const [id,m] of arrowGfx){ if(!aseen.has(id)){ scene.remove(m); arrowGfx.delete(id); } }
  updateBoard(s.players);
}

/* ---- Local target bots (bots mode) ---- */
function openSpot(){ let x,z,t=0; do{ x=(Math.random()*2-1)*(ARENA-8); z=(Math.random()*2-1)*(ARENA-8); t++; }
  while(insideWall(x,z) && t<50); return {x,z}; }
function insideWall(x,z){ for(const c of colliders) if(x>c.minx-1&&x<c.maxx+1&&z>c.minz-1&&z<c.maxz+1) return true; return false; }
function spawnLocalBots(n){ localBots.forEach(b=>scene.remove(b.mesh)); localBots.length=0;
  for(let i=0;i<n;i++){ const s=openSpot(); const mesh=newBotMesh(); mesh.position.set(s.x,0,s.z); mesh.rotation.y=Math.random()*6.28; scene.add(mesh);
    localBots.push({mesh,x:s.x,z:s.z,hp:100,alive:true}); } }
function respawnLocalBot(b){ extinguish(b); const s=openSpot(); b.x=s.x; b.z=s.z; b.hp=100; b.alive=true; b.mesh.position.set(s.x,0,s.z); b.mesh.visible=true; }

/* A peek must not put your eye through a corner. Tries the full offset, then
   shorter ones, and takes the first that is clear of geometry at eye height.
   Height matters: you can lean out over a low crate. */
function clearLean(x, z, y, rx, rz, want){
  const blocked = (px, pz)=>{
    for(const c of colliders){
      if(y < c.miny || y > c.maxy) continue;
      if(px > c.minx-0.12 && px < c.maxx+0.12 && pz > c.minz-0.12 && pz < c.maxz+0.12) return true;
    }
    return false;
  };
  for(const f of [1, 0.66, 0.33]){
    const o = want*f;
    if(!blocked(x + rx*o, z + rz*o)) return o;
  }
  return 0;
}
