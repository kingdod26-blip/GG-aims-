/* =============================================================
   Bot Strike — hud.js  (8 of 9 in load order)

   HUD, kill feed, audio, armory and compass.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after effects.js and before loop.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- HUD ---- */
function updateHUD(){ document.getElementById('hpNum').textContent=Math.max(0,Math.round(me.hp));
  document.getElementById('hpFill').style.width=Math.max(0,me.hp)+'%';
  document.getElementById('hpFill').style.background = me.hp>50 ? '#fff' : me.hp>25 ? '#ffb648' : '#ff4d4d';
  const w=curW();
  if(w.melee){                                     // combo chain, no ammo
    if(performance.now()>comboUntil && comboStep!==0) comboStep=0;
    document.getElementById('magNum').textContent = (comboStep||0)+1;
    document.getElementById('reserveNum').textContent = '/ '+w.combo.length;
    const nextDmg = w.combo[Math.min(comboStep,w.combo.length-1)];
    document.getElementById('modeLbl').textContent =
      'BLADE · HIT '+((comboStep||0)+1)+'/'+w.combo.length+
      (comboStep===w.combo.length-1 ? ' · FINISHER' : '')+' · '+nextDmg+' DMG';
  } else if(w.ability){                            // charges, not magazines
    abilityTick();
    const q = abilityRecharge[currentWeapon] || [];
    document.getElementById('magNum').textContent = abilityCharges[currentWeapon];
    document.getElementById('reserveNum').textContent = '/ '+w.charges;
    const next = q.length ? Math.max(0,Math.ceil((q[0]-performance.now())/1000)) : 0;
    const label = (w.kind==='xbow') ? 'CROSSBOW · '+(ricochet?'RICOCHET':'DIRECT')
                : 'SMOKE · ' + (ricochet?'RICOCHET':'DIRECT');
    document.getElementById('modeLbl').textContent = label + (next?(' · '+next+'s'):'');
  } else {
    document.getElementById('magNum').textContent=reloading?'--':curAmmo().mag;
    document.getElementById('reserveNum').textContent='/ '+curAmmo().reserve;
    document.getElementById('modeLbl').textContent = w.name+' · '+w.mode;
  }
  document.getElementById('stanceVal').textContent = me.stance.toUpperCase().replace('STAND','STANDING').replace('CROUCH','CROUCHING').replace('PRONE','PRONE'); }
let hmT; function hitmark(){ const h=document.getElementById('hitmarker'); h.style.opacity=1; clearTimeout(hmT); hmT=setTimeout(()=>h.style.opacity=0,90); }
let dmgT; function dmgFlash(){ const d=document.getElementById('dmg'); d.style.opacity=1; clearTimeout(dmgT); dmgT=setTimeout(()=>d.style.opacity=0,120); }
/* Kill feed: each entry lives briefly, fades out, then removes itself so the
   feed never stays cluttered. */
const FEED_LIFE_MS = 4500, FEED_FADE_MS = 600;
function addFeed(d){
  const host = document.getElementById('feed'); if(!host) return;
  const el = document.createElement('div');
  el.innerHTML = `<b>${esc(d.by)}</b> ${d.head?'<span class="hs">⚡</span>':'✖'} ${esc(d.victim)}`;
  host.prepend(el);                                   // newest first
  while(host.children.length > 5) host.lastChild.remove();
  el._fadeT = setTimeout(()=>{
    el.classList.add('fade');
    el._killT = setTimeout(()=>el.remove(), FEED_FADE_MS);
  }, FEED_LIFE_MS);
}
function clearFeed(){
  const host = document.getElementById('feed'); if(!host) return;
  [...host.children].forEach(el=>{ clearTimeout(el._fadeT); clearTimeout(el._killT); });
  host.innerHTML='';
}
/* Rounds won is what decides the match, so it leads; kills are the tiebreak. */
/* Passive detection readout. Three states: listening, something heard (and
   for how much longer), or recharging. Multiplayer only — there is nothing to
   hear in target practice. */
function updateDetectHUD(){
  const el = document.getElementById('detect');
  if(!el) return;
  if(gameMode !== 'mp' || gameState !== 'playing'){ el.style.display='none'; return; }
  const now = performance.now();
  const active = detectUntil > now, cooling = !active && detectReady > now;
  el.style.display = 'block';
  el.className = active ? 'active' : cooling ? 'cooling' : 'ready';
  document.getElementById('detectTxt').textContent =
      active  ? 'CONTACT ' + Math.ceil((detectUntil-now)/1000) + 's'
    : cooling ? 'DETECT ' + Math.ceil((detectReady-now)/1000) + 's'
    :           'DETECT READY';
}
function updateBoard(pl){ document.getElementById('rows').innerHTML=[...pl]
  .sort((a,b)=>(b.wins||0)-(a.wins||0) || b.kills-a.kills).map(p=>
  `<div class="row ${p.id===myId?'me':''}"><span>${esc(p.name)}</span>` +
  `<span class="k">${p.wins||0} · ${p.kills}</span></div>`).join(''); }

/* The round/match banner. Everything it shows comes from the server's match
   block, so every client agrees on the score and the countdown. */
let matchState = null;
function updateMatchUI(m, players){
  matchState = m;
  const el = document.getElementById('banner');
  if(!m || gameMode !== 'mp'){ el.style.display='none'; return; }
  const nameOf = id => { const p = players.find(p=>p.id===id); return p ? p.name : 'nobody'; };
  const secs = Math.ceil(m.endsIn/1000);
  let big='', sub='', cls='';
  if(m.phase === 'waiting'){
    big = 'WAITING FOR AN OPPONENT';
    sub = 'first to ' + m.winsNeeded + ' rounds wins';
  } else if(m.phase === 'live'){
    big = ''; sub = 'ROUND ' + m.round;
  } else if(m.phase === 'intermission'){
    const won = m.roundWinner === myId;
    big = m.roundWinner ? (won ? 'ROUND WON' : 'ROUND LOST') : 'DRAW';
    cls = m.roundWinner ? (won ? 'win' : 'lose') : '';
    sub = m.roundWinner && !won ? nameOf(m.roundWinner).toUpperCase() + ' TAKES IT · NEXT IN ' + secs
                                : 'NEXT ROUND IN ' + secs;
  } else {                                   // over
    const won = m.matchWinner === myId;
    big = won ? 'YOU WIN THE MATCH' : nameOf(m.matchWinner).toUpperCase() + ' WINS THE MATCH';
    cls = won ? 'win' : 'lose';
    sub = 'RESTARTING IN ' + secs;
  }
  el.className = cls;
  el.style.display = 'block';
  document.getElementById('bannerBig').textContent = big;
  document.getElementById('bannerSub').textContent = sub;
}
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* ================= AUDIO =================
   All SFX are synthesized with Web Audio (no asset files). The reload
   call-out uses the browser's speech synthesis so the character speaks. */
const Sfx = (()=>{
  let ctx=null;
  const ensure = ()=> (ctx = ctx || new (window.AudioContext||window.webkitAudioContext)());
  function noise(dur, vol, cutoff, type='lowpass'){
    const c=ensure(); const buf=c.createBuffer(1, Math.max(1,c.sampleRate*dur), c.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length, 2);
    const src=c.createBufferSource(); src.buffer=buf;
    const g=c.createGain(); g.gain.value=vol;
    const f=c.createBiquadFilter(); f.type=type; f.frequency.value=cutoff;
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
  function tone(freq, dur, type, vol, slideTo){
    const c=ensure(); const o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(freq, c.currentTime);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime+dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+dur);
  }
  return {
    resume(){ try{ const c=ensure(); if(c.state==='suspended') c.resume(); }catch(e){} },
    // Each weapon gets a distinct report: punchy body + tail
    shoot(w){ try{
      const p = { RIFLE:{d:0.09,v:0.34,f:1400,t:150}, SNIPER:{d:0.34,v:0.5,f:900,t:70},
                  SHOTGUN:{d:0.26,v:0.46,f:1100,t:90}, PISTOL:{d:0.11,v:0.32,f:1700,t:200},
                  'PISTOL X':{d:0.09,v:0.3,f:1800,t:220} }[w.name] || {d:0.1,v:0.32,f:1500,t:170};
      noise(p.d, p.v, p.f);                         // the crack
      tone(p.t, p.d*1.4, 'sawtooth', p.v*0.5, p.t*0.4);   // low thump tail
    }catch(e){} },
    magOut(){ try{ tone(220,0.05,'square',0.18); noise(0.05,0.12,2500,'highpass'); }catch(e){} },
    magIn(){  try{ tone(150,0.07,'square',0.22); noise(0.06,0.15,1800); }catch(e){} },
    bolt(){   try{ tone(320,0.05,'square',0.16); setTimeout(()=>tone(260,0.05,'square',0.14),70); }catch(e){} },
    empty(){  try{ tone(110,0.05,'square',0.18); }catch(e){} },
    hit(){    try{ tone(950,0.035,'sine',0.22); }catch(e){} },
    step(left){ try{ noise(0.07, left?0.10:0.085, 620); tone(left?95:88, 0.05,'sine',0.07); }catch(e){} },
    land(){   try{ noise(0.12,0.18,450); tone(70,0.1,'sine',0.12); }catch(e){} },
    swap(){   try{ tone(520,0.04,'square',0.14); setTimeout(()=>tone(700,0.04,'square',0.12),50); }catch(e){} },
  };
})();

/* Character voice line — speaks "Reloading!" on reload. */
const Voice = (()=>{
  let pick=null;
  function voice(){
    if(pick!==null) return pick;
    const vs = speechSynthesis.getVoices();
    if(!vs.length) return null;
    // prefer a deeper English male voice for the operator
    pick = vs.find(v=>/en(-|_)?(US|GB)?/i.test(v.lang) && /david|male|daniel|george|mark/i.test(v.name))
        || vs.find(v=>/^en/i.test(v.lang)) || vs[0];
    return pick;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = ()=>{ pick=null; voice(); };
  return { say(text, {rate=1.05, pitch=0.75, volume=0.9}={}){
    try{ if(!window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      const v=voice(); if(v) u.voice=v;
      u.rate=rate; u.pitch=pitch; u.volume=volume;
      speechSynthesis.speak(u);
    }catch(e){}
  } };
})();

/* ---- Armory (Tab) ----
   In target practice this is a rack: click anything, equip it. In multiplayer
   it is the SHOP — you hold one bought gun at a time plus the free abilities,
   and it only opens its till between rounds. Prices and money come from the
   server; clicking sends a 'buy' and the server decides. ---- */
let armoryOpen=false;
function renderArmory(){
  const shop = (gameMode === 'mp');
  const canBuy = shop && matchState && matchState.phase !== 'live';
  // nobody to fight yet: the range is a sandbox, take anything
  const sandbox = shop && matchState && matchState.phase === 'waiting';
  const stale = shop && !econOnline;      // server is older than the economy
  const head = document.querySelector('#armory h2');
  if(head) head.textContent = !shop ? 'ARMORY'
    : stale ? 'ARMORY — shop unavailable'
    : sandbox ? 'ARMORY — FREE RANGE'
    : `ARMORY — $${myMoney}` + (canBuy ? '' : '  (shop shut during a round)');

  const hint = document.querySelector('#armory .armHint');
  if(hint) hint.textContent = !shop
    ? 'Click a weapon or press its number · Tab to close'
    : stale ? 'This server is running an older build with no economy — restart it · Tab to close'
    : sandbox ? 'No opponent yet — try anything, free. Scroll or 1-9 to switch · Tab to close'
    : canBuy ? `Click to buy — ${MAX_MAIN} mains and ${MAX_SIDE} side, abilities free · Tab to close`
             : 'Shop opens between rounds · Tab to close';

  document.getElementById('armGrid').innerHTML = WEAPONS.map((w,i)=>{
    const free  = w.ability || w.melee;
    const price = free ? 0 : (shopPrices[i] || 0);
    const isMain = MAIN_SLOTS.includes(i), isSide = SIDE_SLOTS.includes(i);
    const owned = free || !shop || myGuns.includes(i);
    const afford = sandbox || myMoney >= price;
    // at the cap, buying drops the OLDEST of that kind — say which
    const sameKind = myGuns.filter(g => MAIN_SLOTS.includes(g) === isMain);
    const cap = isMain ? MAX_MAIN : MAX_SIDE;
    const heldInSlot = (!owned && sameKind.length >= cap) ? sameKind[0] : null;
    // where it sits in your list, which is what the number keys select
    const invPos = shop ? inventory().indexOf(i) : i;
    const stats = w.ability
      ? `${w.dmg?('DMG '+w.dmg):'NO DAMAGE'}<br>CHARGES ${w.charges} · ${Math.round(w.cooldownMs/1000)}s`
      : w.melee
      ? `COMBO ${w.combo.join('/')}<br>REACH ${w.reach}m`
      : `DMG ${w.dmg}${w.pellets?'×'+w.pellets:''}<br>MAG ${w.magMax} / ${w.reserveMax}`;
    let tag;
    if(!shop)      tag = i===currentWeapon ? '<b style="color:#27ff9e">EQUIPPED</b>' : '&nbsp;';
    else if(free)  tag = i===currentWeapon ? '<b style="color:#27ff9e">EQUIPPED</b>' : '<span style="opacity:.6">FREE</span>';
    else if(owned) tag = i===currentWeapon ? '<b style="color:#27ff9e">EQUIPPED</b>' : '<b style="color:#27ff9e">OWNED</b>';
    else if(!canBuy) tag = `<span style="opacity:.45">$${price}</span>`;
    else if(sandbox) tag = '<b style="color:#27ff9e">TAKE IT</b>';
    else {
      const swaps = heldInSlot !== null && heldInSlot !== undefined;
      tag = `<b style="color:${afford?'#ffd15a':'#ff6a6a'}">$${price}</b>` +
            (swaps && afford ? `<br><span style="opacity:.55;font-size:10px">replaces ${WEAPONS[heldInSlot].name}</span>` : '');
    }
    // label the category so the two-gun rule is visible rather than guessed at
    const slotLbl = !shop ? '' : isMain ? ' · MAIN' : isSide ? ' · SIDE' : '';
    const dim = (shop && !owned && (!canBuy || !afford)) ? 'opacity:.45;' : '';
    return `<div class="wcard ${i===currentWeapon?'equipped':''}" data-i="${i}" style="${dim}">
      <div class="wkey">[ ${w.ability ? WEAPON_KEY[i] : (invPos >= 0 ? invPos+1 : '–')} ]</div>
      <div class="wname">${w.name}</div>
      <div class="wmode">${w.mode}${slotLbl}${w.scope?' · SCOPE':''}${w.pellets?' · '+w.pellets+' PELLETS':''}</div>
      <div class="wstats">${stats}<br>${tag}</div>
    </div>`;
  }).join('');

  [...document.querySelectorAll('.wcard')].forEach(el=> el.onclick=()=>{
    const i = +el.dataset.i, w = WEAPONS[i];
    const free = w.ability || w.melee;
    if(shop && !free && !myGuns.includes(i)){
      if(!canBuy || (!sandbox && myMoney < (shopPrices[i]||0))){ Sfx.empty(); return; }
      socket.emit('buy', { slot:i });     // server confirms with 'bought'
      return;
    }
    switchWeapon(i); toggleArmory(false);
  });
}
function toggleArmory(force){
  const want = (force!==undefined) ? force : !armoryOpen;
  armoryOpen = want;
  document.getElementById('armory').classList.toggle('hidden', !want);
  if(want){ renderArmory(); document.exitPointerLock(); }
  else if(gameState==='playing') lockPointer();
}

/* ---- Compass strip (bearing ticks like AAA shooters) ---- */
const cmp = document.getElementById('compass'), cg = cmp.getContext('2d');
const CARDINALS = { 0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW' };
function drawCompass(){
  const W=cmp.width, H=cmp.height, pxPerDeg = W/120;             // 120° field of view
  const heading = (((-me.yaw)*180/Math.PI)%360+360)%360;
  cg.clearRect(0,0,W,H);
  cg.fillStyle='rgba(0,0,0,0.25)'; cg.fillRect(0,0,W,H);
  cg.textAlign='center'; cg.textBaseline='top';
  for(let d=-65; d<=65; d++){
    const deg = ((Math.round(heading)+d)%360+360)%360;
    if(deg%5!==0) continue;
    const x = W/2 + (deg - heading + ((deg-heading>180)?-360:(deg-heading<-180)?360:0))*pxPerDeg;
    if(x<4||x>W-4) continue;
    const card = CARDINALS[deg];
    if(card){ cg.fillStyle='rgba(255,255,255,0.95)'; cg.font='bold 12px Segoe UI'; cg.fillText(card, x, 3);
      cg.fillRect(x-0.5, 18, 1.5, 8); }
    else if(deg%15===0){ cg.fillStyle='rgba(255,255,255,0.6)'; cg.fillRect(x-0.5, 20, 1, 6); }
    else { cg.fillStyle='rgba(255,255,255,0.3)'; cg.fillRect(x-0.5, 22, 1, 4); }
  }
  // center marker
  cg.fillStyle='#fff'; cg.beginPath(); cg.moveTo(W/2,26); cg.lineTo(W/2-4,30); cg.lineTo(W/2+4,30); cg.closePath(); cg.fill();
}
let prevHp=100;
