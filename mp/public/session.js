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
let myMoney=0, myGuns=[], econOnline=false;     // myGuns: owned slots, purchase order
let roomWasFull=false;                          // so the kick doesn't read as a dropout
let lastTp=-1;                                  // last forced-move stamp we obeyed
/* Passive detection, mirrored from the server. detectTarget is who your
   passive has picked out; detectUntil/detectReady are local deadlines so the
   HUD can count down smoothly between snapshots. */
let detectTarget=null, detectUntil=0, detectReady=0;
let shopPrices=[150,300,150,50,100], MAIN_SLOTS=[0,1,2], SIDE_SLOTS=[3,4];
let winsNeeded=3;            // from welcome; the snapshot no longer carries it
let myRoom=null;             // which room this client landed in
let MAX_MAIN=2, MAX_SIDE=1;
let roomMax=5;                 // room cap, so the HUD can show "3/5"
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
  { key:'hitZone',  label:'HIT MARKER', opts:[[0,'PLAIN'],[1,'SHOW ZONE']] },
  { key:'showBoxes',label:'HITBOXES',   opts:[[0,'HIDDEN'],[1,'SHOW']] },   // practice only
  { key:'infAmmo',   label:'PRACTICE AMMO',     opts:[[0,'NORMAL'],[1,'UNLIMITED']] },
  { key:'noCooldown',label:'PRACTICE COOLDOWN', opts:[[0,'NORMAL'],[1,'NONE']] },
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
  detectTarget=null; detectUntil=0; detectReady=0; revealHazards(false);
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
  showEliminated(false);
  clearFeed(); clearGroundFires();
  heroGroup.forEach(o=>o.visible=true); gun.visible=false;
  pendingRoom = null;
  showScreen('home');
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
document.getElementById('cardMp').onclick   = ()=> openLobby();

/* ---- Room browser ----
   Multiplayer no longer connects straight away: you pick a room first. The
   listing comes over plain HTTP so it works before any socket exists. */
let pendingRoom = null;              // the room startPlay('mp') should join
function showScreen(id){
  for(const s of ['home','mode','lobby']) document.getElementById(s).classList.add('hidden');
  if(id) document.getElementById(id).classList.remove('hidden');
}
function lobbySay(msg, good){
  const el = document.getElementById('lobbyMsg');
  el.textContent = msg || ''; el.style.color = good ? '#27ff9e' : '#ff9a5a';
}
function openLobby(){
  gameState = 'lobby'; showScreen('lobby');
  lobbySay(''); document.getElementById('codeInput').value = '';
  refreshRooms();
}
async function refreshRooms(){
  const host = document.getElementById('roomList');
  host.innerHTML = '<div class="empty">Loading…</div>';
  let data;
  try { data = await (await fetch('/rooms')).json(); }
  catch(e){ host.innerHTML = '<div class="empty">Could not reach the server.</div>'; return; }
  const list = data.rooms || [];
  if(!list.length){
    host.innerHTML = '<div class="empty">No rooms yet — Quick Play opens one, '
                   + 'or create a room and share the code.</div>';
    return;
  }
  host.innerHTML = '';
  for(const r of list){
    const full = r.players >= r.max;
    const row = document.createElement('div');
    row.className = 'roomrow' + (full ? ' full' : '');
    const phase = r.phase === 'live' ? 'ROUND ' + r.round
                : r.phase === 'waiting' ? 'WAITING'
                : r.phase === 'paused' ? 'PAUSED' : 'BUY WINDOW';
    row.innerHTML = '<span class="rid' + (r.named ? ' code' : '') + '">' + esc(r.id) + '</span>'
      + '<span class="rmeta"><span class="rn">' + r.players + '/' + r.max + '</span> · ' + phase + '</span>';
    if(!full) row.onclick = ()=> joinRoom(r.id);
    host.appendChild(row);
  }
}
function joinRoom(id){ pendingRoom = id; startPlay('mp'); }
/* Bounced out of a room: back to the browser with the reason, rather than
   all the way to the main menu. */
function backToLobby(msg){
  pendingRoom = null;
  gameState = 'lobby'; showScreen('lobby');
  refreshRooms(); lobbySay(msg);
}
document.getElementById('refreshBtn').onclick = refreshRooms;
document.getElementById('lobbyBack').onclick  = ()=>{ gameState='mode'; showScreen('mode'); };
document.getElementById('quickBtn').onclick   = ()=>{ pendingRoom = null; startPlay('mp'); };
document.getElementById('createBtn').onclick  = async ()=>{
  lobbySay('Creating…', true);
  try {
    const d = await (await fetch('/rooms/new')).json();
    if(!d.code){ lobbySay('The server could not open a room.'); return; }
    lobbySay('Room ' + d.code + ' — share that code', true);
    joinRoom(d.code);
  } catch(e){ lobbySay('Could not reach the server.'); }
};
document.getElementById('joinBtn').onclick = ()=>{
  const code = (document.getElementById('codeInput').value || '').trim().toUpperCase();
  if(code.length !== 5){ lobbySay('A room code is 5 letters.'); return; }
  joinRoom(code);
};
document.getElementById('codeInput').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('joinBtn').click();
});

function startPlay(mode){
  gameMode = mode; gameState='playing';
  showScreen(null);
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

/* Which room to join. Without one the server drops you into the first with a
   free slot; with one you and your friends land together. Taken from the URL
   (?room=foo) so a link is all it takes to share. */
function roomCode(){
  if(pendingRoom) return pendingRoom;
  try { return new URLSearchParams(location.search).get('room') || null; }
  catch(e){ return null; }
}

/* Identifies this browser across reconnects so the server can hand back the
   rounds we had already won. The socket id is no good for that — it is new
   every connection — and names are not unique (two tabs are both "Player"). */
function clientToken(){
  let t = null;
  try { t = localStorage.getItem('bs_tok'); } catch(e){}
  if(!t){ t = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
          try { localStorage.setItem('bs_tok', t); } catch(e){} }
  return t;
}

/* ---- Multiplayer networking ---- */
function connectMP(name){
  roomWasFull = false; lastTp = -1;
  /* Never stack connections. io() happily opens a second socket, and the
     server counts it as a whole extra player that nothing will ever clean up
     — one tab, two people in the match. Entering multiplayer twice without
     quitting in between (a double-click on the card will do it) was enough. */
  if(socket){ try{ socket.disconnect(); }catch(e){} socket=null; }
  socket = io({ auth: { tok: clientToken(), room: roomCode() } });
  socket.on('connect', ()=>{ connected=true; document.getElementById('status').textContent='connected'; socket.emit('state',{name}); });
  socket.on('disconnect', ()=>{ connected=false;
    document.getElementById('status').textContent = roomWasFull ? 'room full' : 'disconnected'; });
  /* The room is capped. The server turns the extra player away rather than
     letting them join an invisible sixth slot, so say so plainly and put
     them back on the menu instead of leaving them staring at an empty
     arena. The disconnect that follows must not look like a dropout. */
  socket.on('full', d=>{
    const max = (d && d.max) || 5;
    roomWasFull = true;
    quitToMenu();
    backToLobby((d && d.code)
      ? 'Room ' + d.code + ' is full (' + max + ' max). Pick another.'
      : 'That room is full (' + max + ' max). Pick another.');
  });
  /* A code with no room behind it — a typo, or a link to a room that has
     since emptied and been retired. Codes come from Create Room; typing one
     does not conjure a room, or every typo would strand you alone in a
     brand new one. */
  socket.on('nosuchroom', d=>{
    roomWasFull = true;                      // same flag: this is not a dropout
    quitToMenu();
    backToLobby('No room "' + ((d && d.code) || '') + '". Check the code.');
  });
  socket.on('welcome', d=>{ myId=d.id; me.x=d.spawn.x; me.z=d.spawn.z;
    /* Prices, slot lists and the caps used to ride in every snapshot, 30
       times a second, despite never changing. They come once now. An older
       server sends none of this, in which case the defaults stand. */
    myRoom = d.room || null;
    if(d.prices)     shopPrices = d.prices;
    if(d.resupply)   RESUPPLY   = d.resupply;
    if(d.mainSlots)  MAIN_SLOTS = d.mainSlots;
    if(d.sideSlots)  SIDE_SLOTS = d.sideSlots;
    if(d.maxPlayers) roomMax    = d.maxPlayers;
    if(d.maxMain)    MAX_MAIN   = d.maxMain;
    if(d.maxSide)    MAX_SIDE   = d.maxSide;
    if(d.winsNeeded) winsNeeded = d.winsNeeded;
    updateRoomHUD();
  });
  /* The roster and the slow-moving numbers. Sent only when they change, and
     always before the first frame that refers to a slot. */
  socket.on('meta', m=>{ lastMeta = m; });
  socket.on('snapshot', frame=>{
    /* socket.io hands binary over as an ArrayBuffer in the browser and as a
       typed array/Buffer elsewhere; an object means an older JSON server. */
    const raw = (frame instanceof ArrayBuffer) ? frame
              : (frame && frame.buffer instanceof ArrayBuffer)
                ? frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength)
                : null;
    const s = raw ? decodeSnapshot(raw) : frame;
    if(s) onSnapshot(s);                 // null until the roster has landed
  });
  socket.on('shot', d=> addTracer(new THREE.Vector3(d.ox,d.oy,d.oz), new THREE.Vector3(d.dx,d.dy,d.dz), d.len));
  socket.on('impact', d=> hitmark(d && d.zone));
  socket.on('groundfire', d=> spawnGroundFire(d.x, d.y||0, d.z));
  socket.on('smoke', d=> spawnSmoke(d.x, d.y||0, d.z, d.by));
  // the server decides the cash; ammo is ours to refill
  // somebody took the round's cash — tell everyone, and grey out the ring
  socket.on('claimed', d=>{
    if(d && d.name) toast(`${d.name.toUpperCase()} TOOK THE $${d.cash}`);
  });
  socket.on('resupply', d=>{
    refillAllWeapons(); updateHUD(); Sfx.swap();
    toast(d && d.cash ? `RESUPPLIED  +$${d.cash}` : 'RESUPPLIED');
  });
  socket.on('bought', d=>{ myMoney=d.money; myGuns=(d.guns||[]).slice(); Sfx.swap();
    refillWeapon(d.slot);              // you paid for it, it comes loaded
    reloading=false; clearTimeout(reloadTimer);
    switchWeapon(d.slot); updateHUD(); if(armoryOpen) renderArmory(); });
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
/* The eliminated banner: loud for a moment, then it gets out of the way so
   you can actually watch the rest of the round. */
let eliminatedTimer = 0;
function showEliminated(on){
  const el = document.getElementById('respawn');
  clearTimeout(eliminatedTimer);
  el.classList.remove('quiet');
  el.style.display = on ? 'block' : 'none';
  if(on) eliminatedTimer = setTimeout(()=> el.classList.add('quiet'), 1800);
}
/* ---- Binary snapshot ----
   The server packs each frame into bytes rather than JSON; see the layout
   comment in server.js, which this MUST stay in step with. Everything here
   exists to rebuild exactly the object onSnapshot used to be handed, so the
   rest of the client never learns the difference.

   Players arrive as a one-byte SLOT instead of a 20-character socket id, so
   nothing can be read until 'meta' has supplied the slot -> id mapping. */
const SNAP_VERSION = 1;
const PHASES = ['waiting', 'intermission', 'live', 'over', 'paused'];
let lastMeta = null, warnedVersion = false;
function decodeSnapshot(buf){
  if(!lastMeta) return null;                    // roster not here yet
  const d = new DataView(buf);
  if(d.getUint8(0) !== SNAP_VERSION){
    if(!warnedVersion){ warnedVersion = true;
      console.error('Snapshot version mismatch — this page is out of date with the server.'); }
    return null;
  }
  const bySlot = new Map();
  for(const p of lastMeta.players) bySlot.set(p.slot, p);
  const idOf = slot => { const p = bySlot.get(slot); return p ? p.id : null; };

  let o = 1;
  const phase = PHASES[d.getUint8(o++)] || 'waiting';
  const round = d.getUint8(o++);
  const endsIn = d.getUint16(o, true); o += 2;
  const roundWinner = idOf(d.getInt8(o++));
  const matchWinner = idOf(d.getInt8(o++));
  const resupplyTaken = !!d.getUint8(o++);
  const np = d.getUint8(o++), na = d.getUint8(o++);

  const players = [];
  for(let i=0;i<np;i++){
    const slot = d.getUint8(o++);
    const flags = d.getUint8(o++);
    const st = d.getUint8(o++);
    const hp = d.getUint8(o++);
    const x = d.getInt16(o,true)/100; o += 2;
    const y = d.getInt16(o,true)/100; o += 2;
    const z = d.getInt16(o,true)/100; o += 2;
    const yaw = d.getUint16(o,true)/65535*Math.PI*2; o += 2;
    const rl = d.getUint8(o++)/255;
    const tp = d.getUint8(o++);
    const mk = idOf(d.getInt8(o++));
    const dT = idOf(d.getInt8(o++));
    const dU = d.getUint16(o,true); o += 2;
    const dR = d.getUint16(o,true); o += 2;
    const meta = bySlot.get(slot);
    if(!meta) continue;                        // a join we have not been told about yet
    players.push({ id: meta.id, name: meta.name, color: meta.color,
      money: meta.money, wins: meta.wins, kills: meta.kills, guns: meta.guns,
      x, y, z, yaw, st, hp, alive: !!(flags & 1), bn: !!(flags & 2),
      rl, tp, mk, dT, dU, dR });
  }
  const arrows = [];
  for(let i=0;i<na;i++){
    const id = d.getUint16(o,true); o += 2;
    const ax = d.getInt16(o,true)/100; o += 2;
    const ay = d.getInt16(o,true)/100; o += 2;
    const az = d.getInt16(o,true)/100; o += 2;
    const vx = d.getInt16(o,true)/100; o += 2;
    const vy = d.getInt16(o,true)/100; o += 2;
    const vz = d.getInt16(o,true)/100; o += 2;
    const sm = !!d.getUint8(o++);
    arrows.push({ id, x:ax, y:ay, z:az, vx, vy, vz, sm });
  }
  return { match:{ phase, round, endsIn, roundWinner, matchWinner, resupplyTaken },
           players, arrows };
}

function onSnapshot(s){
  /* A server from before the trim still puts these in every snapshot; take
     them if they turn up, otherwise welcome has already set them. */
  if(s.prices) shopPrices = s.prices;
  if(s.resupply) RESUPPLY = s.resupply;
  if(s.mainSlots) MAIN_SLOTS = s.mainSlots;
  if(s.sideSlots) SIDE_SLOTS = s.sideSlots;
  if(s.maxPlayers) roomMax = s.maxPlayers;
  if(s.maxMain)   MAX_MAIN = s.maxMain;
  if(s.maxSide)   MAX_SIDE = s.maxSide;
  updateMatchUI(s.match, s.players);
  setResupplyClaimed(!!(s.match && s.match.resupplyTaken));
  const mine = s.players.find(p=>p.id===myId);
  if (mine){ me.hp=mine.hp;
    const incoming = mine.guns || [];
    const loadoutChanged = (myGuns.join() !== incoming.join());
    // A server from before the economy sends no money at all. Without this the
    // shop just shows $0 and silently refuses every purchase, which looks
    // exactly like a broken shop rather than a stale server.
    econOnline = (mine.money !== undefined);
    detectTarget = mine.dT || null;
    detectUntil  = mine.dU ? performance.now() + mine.dU : 0;
    detectReady  = mine.dR ? performance.now() + mine.dR : 0;
    myMoney = mine.money||0; myGuns = incoming.slice();
    // unconditional: you join holding the rifle from init, which you do not own
    ensureValidWeapon();
    if(loadoutChanged && armoryOpen) renderArmory();
    /* Movement is client-authoritative, so the server moving you does
       nothing on its own — we would just keep broadcasting the old position
       over it. That is why the round WINNER never moved at the start of the
       next round: they were alive throughout, so nothing made them accept
       the new spawn, and they stayed face to face with whoever respawned
       near them. tp is bumped by the server every time it forces a move;
       when it changes, we take the position it gives us. */
    if (mine.tp !== undefined && mine.tp !== lastTp){
      lastTp = mine.tp;
      me.x=mine.x; me.z=mine.z; me.feetY=mine.y||0; me.vy=0; me.hv.set(0,0,0);
    }
    if (me.alive && !mine.alive){ showEliminated(true); document.exitPointerLock(); }
    if (!me.alive && mine.alive) showEliminated(false);
    me.alive=mine.alive;
  }
  const seen=new Set();
  for (const p of s.players){ if(p.id===myId) continue; seen.add(p.id);
    /* o.id matters: updateMarks walks others.values(), so without the id on
       the entry itself the passive's `detectTarget === o.id` compared against
       undefined and the heard-them-shoot silhouette never drew once. The smoke
       tag was unaffected because it tests o.markedBy, which comes off the
       snapshot. */
    let o=others.get(p.id); if(!o){ const mesh=newPlayerMesh(p.color); scene.add(mesh); o={mesh,id:p.id,tx:p.x,tz:p.z,ty:p.y||0,tyaw:p.yaw}; others.set(p.id,o); }
    o.id = p.id;
    /* Velocity between snapshots, measured BEFORE the new position lands.
       animate() extrapolates with it so a moving player is drawn where they
       are now rather than where they were a snapshot ago. */
    const tAt = performance.now();
    const gap = o.tAt ? (tAt - o.tAt)/1000 : 0;
    if(gap > 0.005 && gap < 0.5){ o.vx = (p.x-o.tx)/gap; o.vz = (p.z-o.tz)/gap; }
    else if(!o.tAt){ o.vx = 0; o.vz = 0; }
    o.tAt = tAt;
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
    if(!m){ m=makeArrowMesh(); if(ar.sm) tintSmokeBolt(m); scene.add(m); arrowGfx.set(ar.id,m); }
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
