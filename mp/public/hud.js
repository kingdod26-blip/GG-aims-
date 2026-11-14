/* =============================================================
   Crimson X — hud.js  (9 of 10 in load order)

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
  updateCrosshair();                               // ring for the shotgun, cross otherwise
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
  /* The magazine as a bar under the number: rounds left for a gun, charges
     left for an ability, the step of the combo for the blade. Low is red
     from a quarter down, which is when you want to be reloading. */
  const mb = document.querySelector('#magBar i');
  if (mb){
    const f = w.melee ? ((comboStep||0)+1) / w.combo.length
            : w.ability ? abilityCharges[currentWeapon] / w.charges
            : reloading ? 0 : curAmmo().mag / w.magMax;
    mb.style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    mb.classList.toggle('low', !w.melee && f <= 0.25);
  }
  renderSlots();
  updateStanceLabel(); }
/* The weapon strip over the ammo: everything you carry, keyed the way the
   number keys select it - by POSITION in your list, the blade on F - with
   the one in your hands lit. Abilities are not on it; they have their own
   tiles. Rebuilt only when the list or the selection actually changes. */
let slotSig = '';
function renderSlots(){
  const host = document.getElementById('slotRow'); if (!host) return;
  const inv = inventory(), sig = inv.join(',') + '|' + currentWeapon;
  if (sig === slotSig) return; slotSig = sig;
  host.innerHTML = inv.map((i, k) => {
    const key = i === BLADE ? 'F' : String(k + 1);
    return `<span class="slot${i === currentWeapon ? ' on' : ''}"><b>${key}</b>${WEAPONS[i].name}</span>`;
  }).join('');
}
/* Its own function so the language switch can repaint it: applyLang()
   calls this, and updateHUD() is event-driven and may not run again for
   a while. */
function updateStanceLabel(){
  const el = document.getElementById('stanceVal'); if(!el) return;
  el.textContent = t('stance.' + (me.stance === 'crouch' ? 'crouch' : me.stance === 'prone' ? 'prone' : 'stand'));
}
/* Damage direction. The server tells the victim where each hit came from;
   an arc round the crosshair points that way and fades over HURT.ms.

   The angle is recomputed every frame from where you are and which way you
   are facing NOW, so the arc stays pinned to the attacker as you turn toward
   them — a mark that froze at the angle it was hit from would point at
   nothing the moment you reacted. A second hit from about the same place
   refreshes its arc instead of stacking another on top. */
const HURT = { ms: 1500, max: 3, same: 4 };
const hurtMarks = [];                       // { x, z, until, el }
function hurtFrom(x, z){
  const now = performance.now();
  let m = hurtMarks.find(h => Math.hypot(h.x - x, h.z - z) < HURT.same);
  if(!m){
    if(hurtMarks.length < HURT.max){
      const el = document.createElement('div'); el.className = 'hurtarc';
      document.getElementById('hurtDir').appendChild(el);
      m = { el }; hurtMarks.push(m);
    } else m = hurtMarks.reduce((a, b) => a.until < b.until ? a : b);   // reuse the oldest
  }
  m.x = x; m.z = z; m.until = now + HURT.ms;
}
function updateHurtMarks(){
  if(!hurtMarks.length) return;
  const now = performance.now();
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  for(const m of hurtMarks){
    const left = m.until - now;
    if(left <= 0 || !me.alive){ if(m.shown !== 0){ m.el.style.opacity = 0; m.shown = 0; } continue; }
    const dx = m.x - me.x, dz = m.z - me.z;
    // forward is (-sin, -cos), right is (cos, -sin); clockwise from straight ahead
    const ang = Math.atan2(dx*cos - dz*sin, -dx*sin - dz*cos);
    m.el.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)';
    m.el.style.opacity = Math.min(1, left / 500).toFixed(2);   // hold, then fade the last half second
    m.shown = 1;
  }
}

/* The three ability tiles beside the ammo.

   Driven from loop() rather than updateHUD(), which only runs on events -
   a countdown hung off it would sit frozen between shots. That means this
   runs every frame, so every write is guarded on the value actually
   changing; setting .textContent unconditionally would dirty layout 60
   times a second for text that changes once a second.

   "Spent" is nothing left to use: the roll past its cooldown, an ability at
   zero charges. An ability holding one charge while the second regenerates
   is usable, so it stays bright and shows the thin bar instead. */
const CD_TILES = [
  { id:'cdRoll',  kind:'roll'  },
  { id:'cdXbow',  kind:'xbow'  },
  { id:'cdSmoke', kind:'smoke' },
];
/* The three tiles are V, G and X, so what they show depends on the agent. */
const CD_ART = { roll:'cd-roll', xbow:'cd-fire', smoke:'cd-smoke', dash:'cd-dash', grenade:'cd-grenade', zone:'cd-zone' };
function configureTiles(){
  const a = agent();
  const kinds = [a.v, a.g === XBOW ? 'xbow' : 'grenade', a.x === 'zone' ? 'zone' : 'smoke'];
  CD_TILES.forEach((t, k) => {
    t.kind = kinds[k];
    const box = document.getElementById(t.id), img = box.querySelector('.cdico');
    img.src = 'assets/' + CD_ART[t.kind] + '.png'; img.alt = t.kind;
    const n = box.querySelector('.cdn'); if(n) n.style.display = (t.kind === 'xbow' || t.kind === 'smoke' || t.kind === 'grenade') ? '' : 'none';
  });
  cdEls = null;
}
let cdEls = null;
function cdCache(){
  if(cdEls) return cdEls;
  cdEls = CD_TILES.map(t => {
    const box = document.getElementById(t.id);
    return { ...t, box, sweep:box.querySelector('.cdsweep'), time:box.querySelector('.cdtime'),
             bar:box.querySelector('.cdbar i'), n:box.querySelector('.cdn'),
             last:{} };
  });
  return cdEls;
}
/* remain/total in ms for one tile, plus how many uses are in hand. */
function cdState(kind, now){
  if(kind === 'roll'){
    const remain = Math.max(0, rollCdUntil - now);
    return { remain, total:ROLL.cdMs, have:remain > 0 ? 0 : 1, max:1 };
  }
  if(kind === 'dash'){
    const remain = Math.max(0, dashCdUntil - now);
    return { remain, total:DASH.cdMs, have:remain > 0 ? 0 : 1, max:1 };
  }
  if(kind === 'zone'){
    // while it runs the tile counts the 25s DOWN, lit; then the cooldown
    if(now < zoneUntil) return { live:true, remain: zoneUntil - now, total:ZONE.ms, have:1, max:1 };
    const remain = Math.max(0, zoneReadyAt - now);
    return { remain, total:ZONE.cdMs, have:remain > 0 ? 0 : 1, max:1 };
  }
  const slot = kind === 'xbow' ? XBOW : kind === 'grenade' ? GRENADE : SMOKE, w = WEAPONS[slot];
  const q = abilityRecharge[slot] || [];
  return { remain: q.length ? Math.max(0, q[0] - now) : 0, total:w.cooldownMs,
           have: abilityCharges[slot] | 0, max:w.charges };
}
function updateCooldowns(){
  const now = performance.now();
  abilityTick();
  for(const t of cdCache()){
    const st = cdState(t.kind, now), L = t.last;
    const live = !!st.live;
    const cool = !live && st.have <= 0, regen = !live && !cool && st.remain > 0;
    if(L.live !== live){ t.box.classList.toggle('live', live); L.live = live; }
    if(L.cool !== cool){ t.box.classList.toggle('cool', cool); L.cool = cool; }
    if(L.regen !== regen){ t.box.classList.toggle('regen', regen); L.regen = regen; }
    if(live){
      const secs = String(Math.ceil(st.remain / 1000));
      if(L.secs !== secs){ t.time.textContent = secs; L.secs = secs; }
    } else if(cool){
      /* A 1.2s roll counted in whole seconds reads "2" for most of its life
         and never shows 1 for long, which looks broken. Short cooldowns get
         a decimal; a 30s ability does not need one. */
      const secs = st.total < 3000 ? (Math.ceil(st.remain / 100) / 10).toFixed(1)
                                   : String(Math.ceil(st.remain / 1000));
      if(L.secs !== secs){ t.time.textContent = st.remain > 0 ? secs : ''; L.secs = secs; }
      // the dark wedge covers what is LEFT, so it drains anticlockwise to nothing
      const deg = Math.round(360 * Math.min(1, st.remain / st.total));
      if(L.deg !== deg){
        t.sweep.style.background =
          'conic-gradient(rgba(0,0,0,.78) ' + deg + 'deg, rgba(0,0,0,.1) 0)';
        L.deg = deg;
      }
    } else if(regen){
      const pct = Math.round(100 * (1 - st.remain / st.total));
      if(L.pct !== pct){ t.bar.style.width = pct + '%'; L.pct = pct; }
    }
    if(t.n && L.have !== st.have){ t.n.textContent = st.have; L.have = st.have; }
  }
}

/* The hit marker now says WHERE you hit: red and bigger for a head, white
   for the torso, small and blue for a limb, with the word underneath. Without
   this the zones only existed in the damage numbers, which you cannot read
   mid-fight. */
let hmT, hzT;
function hitmark(zone){
  const h=document.getElementById('hitmarker'), z=document.getElementById('hitzone');
  // SETTINGS.hitZone off = the old plain white marker, no colour and no word
  if(!SETTINGS.hitZone) zone = null;
  const kind = zone==='head' ? 'head' : (zone==='arms'||zone==='legs') ? 'limb'
             : zone==='torso' ? 'torso' : '';
  h.className = kind;
  h.style.opacity=1; clearTimeout(hmT); hmT=setTimeout(()=>h.style.opacity=0, kind==='head'?150:90);
  if(z){
    if(zone){ z.textContent = zone.toUpperCase(); z.className = kind; z.style.opacity=1;
              clearTimeout(hzT); hzT=setTimeout(()=>z.style.opacity=0, 500); }
    else { z.style.opacity=0; }
  }
}
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
/* Rounds won is all the board shows. A kill IS a round win here, so printing
   both was the same number twice over. Kills still break ties in the order. */
/* Passive detection readout. Three states: listening, something heard (and
   for how much longer), or recharging. Multiplayer only — there is nothing to
   hear in target practice. */
function updateDetectHUD(){
  const el = document.getElementById('detect');
  if(!el) return;
  if(gameMode !== 'mp' || gameState !== 'playing' || !agent().hearing){ el.style.display='none'; return; }
  const now = performance.now();
  const active = detectUntil > now, cooling = !active && detectReady > now;
  el.style.display = 'block';
  el.className = active ? 'active' : cooling ? 'cooling' : 'ready';
  document.getElementById('detectTxt').textContent =
      active  ? 'CONTACT ' + Math.ceil((detectUntil-now)/1000) + 's'
    : cooling ? 'DETECT ' + Math.ceil((detectReady-now)/1000) + 's'
    :           'DETECT READY';
}
/* The reticle follows the weapon: a ring for the shotgun's cone, a cross for
   anything that shoots a point. Driven from updateHUD so it changes the
   instant you switch. */
/* The ring belongs to a weapon that HAS a cone. Switch spread off in the
   practice range and the shotgun is pinpoint, so there is none to draw —
   and sizing a zero cone just pinned the ring to its lower bound, a ~6px
   circle that reads as a broken reticle rather than as "this gun has no
   spread". It falls back to the ordinary cross, which is what every other
   pinpoint weapon already shows. `sizeReticle` owns the class for that
   reason; `updateCrosshair` only forces a re-test after a weapon change. */
function updateCrosshair(){ ringOn = null; sizeReticle(); }
/* The shotgun ring has to BE the cone, not a guess at it.

   It was a flat 34px, which is only honest at one FOV and one window
   height: spread is an ANGLE, so how wide it lands on screen scales with
   the window and shrinks as the FOV narrows. 34px was tuned while ADS at
   768p and is right nowhere else — hip-firing at 768p it understates the
   cone by 17%, at 1080p by 41%, at 1440p by 56%. You aim with a ring that
   says the pellets are tighter than they are, and the ones that land
   outside it read as the gun missing.

   Same projection the shots use: half-angle over tan(fov/2), against half
   the viewport. `camera.fov` is read live, so ADS and the sprint widening
   are both already in it, and the cone blends with `ads` exactly as
   `shoot()` blends it — including the /0.85, so the ring tightens when the
   accuracy does rather than a moment later. Drawn at the spread's half
   width: the pellet pattern is a SQUARE (each axis is nudged
   independently), and this is the circle inside it, which holds about 79%
   of them. The circle round the outside would be 41% wider and mostly
   empty. */
let ringPx = -1, gapPx = -1, ringOn = null;
/* Half the cone, in screen pixels: the same projection the shots use, so
   whatever is drawn is the angle actually being fired. `camera.fov` is read
   live, which folds in ADS and the sprint widening for free. */
function conePx(cone){
  return (innerHeight / 2) * (cone / 2) / Math.tan(camera.fov * Math.PI / 360);
}
function sizeReticle(){
  const el = document.getElementById('crosshair'); if(!el) return;
  const w = curW();
  const cone = currentCone(w, Math.min(1, ads / 0.85));
  /* A pellet gun gets a ring: eight pellets land ANYWHERE in the cone, so a
     point of aim would be a lie. Everything else fires one round down the
     middle, so it keeps a cross and the cone becomes the gap around it.
     With spread switched off on the range there is no cone to draw at all,
     and sizing a zero one just pinned the ring to its floor — a ~6px circle
     that reads as a broken reticle rather than "this gun has no spread". */
  const ring = !!w.pellets && cone > 0;
  if(ring !== ringOn){ el.classList.toggle('spread', ring); ringOn = ring; }

  if(ring){
    // a real but tight cone is still a ring; below this it stops reading as one
    const px = Math.max(14, Math.round(conePx(cone) * 2));
    if(px === ringPx) return;                   // runs every frame; don't thrash layout
    ringPx = px; el.style.setProperty('--ring', px + 'px');
    return;
  }
  /* The gap from the centre to each arm IS the cone radius, with a 3px floor
     so the arms never close into a solid plus and swallow the dot. Nothing is
     exaggerated: a planted pistol sits at the floor, a hip-fired sniper opens
     to ~14px, and scoping it shuts again. */
  const px = Math.round(3 + conePx(cone));
  if(px === gapPx) return;
  gapPx = px; el.style.setProperty('--gap', px + 'px');
}
let toastT;
function toast(msg){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg; el.style.opacity=1;
  clearTimeout(toastT); toastT=setTimeout(()=>el.style.opacity=0, 1400);
}
function updateBoard(pl){ document.getElementById('rows').innerHTML=[...pl]
  .sort((a,b)=>(b.wins||0)-(a.wins||0) || b.kills-a.kills).map(p=>
  `<div class="row ${p.id===myId?'me':''}"><span>${esc(p.name)}</span>` +
  `<span class="k">${p.wins||0}</span></div>`).join('');
  renderRoomCount(pl.length);
}
/* How busy YOUR room is, against the cap the server enforces — the server
   runs many rooms now, so this is never the whole player base. Multiplayer
   only: the practice range's "players" are local targets. */
function renderRoomCount(n){
  const rc = document.getElementById('roomCount');
  if(!rc) return;
  const show = gameMode === 'mp';
  rc.textContent = show ? (myRoom ? myRoom + ' · ' : '') + n + '/' + roomMax : '';
  rc.classList.toggle('full', show && n >= roomMax);
}
function updateRoomHUD(){ renderRoomCount(others.size + 1); }

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
    sub = 'first to ' + (m.winsNeeded || winsNeeded) + ' rounds wins';
  } else if(m.phase === 'paused'){
    big = 'OPPONENT DISCONNECTED';
    sub = 'SCORES HELD · MATCH RESUMES IF THEY RETURN IN ' + secs + 's';
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
/* ---- Sound ----
   Everything is synthesised in the browser; there are no audio files. The
   first version was single beeps — one oscillator or one noise burst per
   event — which is why it read as a toy. Real impulsive sounds are layered:
   a gunshot is a crack (a few milliseconds of high noise), a body (band-
   passed noise that carries the weapon's size), a thump (a sine dropping in
   pitch, the part you feel) and a tail (low noise decaying over a fraction of
   a second, which is the room answering). Each weapon is those four layers
   with different weights, so a pistol snaps and a sniper booms rather than
   all of them being the same hiss at different lengths.

   Sounds can be PLACED. Pass `at` ({x,z}) and the sound is attenuated and
   muffled by distance and panned to the side it is on, relative to where you
   stand and face. That is what makes other players audible at all: their
   shots used to draw a tracer and play nothing, and their footsteps did not
   exist. Without `at` a sound is yours and plays dead centre.

   One shared noise buffer is read from random offsets instead of building a
   fresh buffer per sound — a rifle fires every 95ms and each shot is four
   layers. Everything runs through a compressor, so several loud things at
   once squash rather than clip. */
const Sfx = (()=>{
  let ctx=null, master=null, noiseBuf=null;
  const MASTER = 2.4;                      // makeup before the compressor, see build()
  /* Envelopes fall to this fraction of their level by the end of `dur`,
     then cut. Decaying all the way to silence exponentially spends most of
     the duration inaudible — a 0.28s tail was over in 0.1 — so the stated
     length would be a third of what you hear. */
  const FLOOR = 0.03;
  function build(c){
    ctx = c;
    const comp = c.createDynamicsCompressor();
    /* Gain staging, measured rather than guessed. Rendered offline, the first
       cut of these peaked at 0.13 of full scale for a rifle — quieter than
       the beeps it replaced — because filtered noise loses most of its level
       and a -14dB threshold then sat on what was left. So: push everything up
       before the compressor, and let it catch only the genuinely loud stack. */
    comp.threshold.value = -7; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.001; comp.release.value = 0.15;
    master = c.createGain(); master.gain.value = MASTER;
    // the worst stack measured (sniper, shotgun, three rifles and a hit at one
    // instant) overshot to 1.04 through the compressor's attack, and scaling down did not cure it...
    // ...so a tanh shaper sits last as a ceiling. A compressor only leans on
    // peaks; this cannot emit more than 1.0 whatever arrives.
    const post = c.createWaveShaper();
    const curve = new Float32Array(2049);
    for(let i=0;i<curve.length;i++) curve[i] = Math.tanh((i/1024 - 1) * 3);   // input spans -3..3
    post.curve = curve; post.oversample = '2x';
    const pre = c.createGain(); pre.gain.value = 1/3;                        // map +-3 onto the curve
    master.connect(comp).connect(pre).connect(post).connect(c.destination);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
    plant = null;                            // it belonged to the context this one replaces
  }
  /* The plant's own noise: the one sound here that never stops, so it is
     built once and only its LEVEL is moved.
     A transformer hums at twice the mains frequency, because the core is
     squeezed once on each half of the wave: 100Hz for a 50Hz grid, with
     its harmonics, and a second 100Hz a fraction off so the two beat slowly
     the way two real units side by side do. A turbine is a low roar with a
     thin whine riding it, and the shaft itself at 50 turns a second.
     The fundamentals are below what a laptop speaker can make, so most of
     what carries on one is the 200 to 400Hz partials and the whine. */
  let plant = null;
  function plantBuild(){
    const c = ensure(), tx = c.createGain(), tb = c.createGain();
    tx.gain.value = 0; tb.gain.value = 0; tx.connect(master); tb.connect(master);
    [[100,1],[200,0.5],[300,0.26],[400,0.1],[100.6,0.5]].forEach(([f,a])=>{
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = a*0.3; o.connect(g).connect(tx); o.start(); });
    const n = c.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 9;
    const gw = c.createGain(); gw.gain.value = 0.10;
    n.connect(lp).connect(tb); n.connect(bp).connect(gw).connect(tb); n.start();
    const so = c.createOscillator(), sg = c.createGain();
    so.frequency.value = 50; sg.gain.value = 0.35; so.connect(sg).connect(tb); so.start();
    plant = { tx, tb };
  }
  const ensure = ()=>{ if(!ctx) build(new (window.AudioContext||window.webkitAudioContext)()); return ctx; };

  /* Where a sound enters the graph. Null means too faint to bother. */
  /* `ref` is how far a sound carries: the distance at which it is half as
     loud. A footstep is 11m; a gunshot is 30, because at 11 a rifle 40m off
     measured 0.02 of full scale — inaudible, in a game whose passive lets you
     hear a shot from exactly that far. */
  function bus(at, ref){
    const c = ensure();
    if(!at) return master;
    ref = ref || 11;
    const dx = at.x - me.x, dz = at.z - me.z, d = Math.hypot(dx, dz);
    const vol = 1 / (1 + Math.pow(d / ref, 1.7));
    if(vol < 0.012) return null;
    const g = c.createGain(); g.gain.value = vol;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = Math.max(650, 18000 / (1 + d / (ref * 0.75)));   // distance eats the highs first
    lp.connect(g);
    if(c.createStereoPanner){
      const pan = c.createStereoPanner();
      // right is (cos yaw, -sin yaw); fully to one side is softened so it never hard-pans
      pan.pan.value = d < 0.6 ? 0 : Math.max(-1, Math.min(1, (dx*Math.cos(me.yaw) - dz*Math.sin(me.yaw)) / d)) * 0.8;
      g.connect(pan).connect(master);
    } else g.connect(master);
    return lp;
  }
  /* A burst of filtered noise with a fast attack and an exponential decay. */
  function nz(dest, type, freq, dur, vol, q, sweepTo){
    if(!dest) return;
    const c = ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if(q) f.Q.value = q;
    if(sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(vol * FLOOR, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.025);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.2, dur + 0.08);
  }
  /* An oscillator sliding from f0 to f1, same envelope. */
  function osc(dest, type, f0, f1, dur, vol, delay){
    if(!dest) return;
    const c = ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(vol * FLOOR, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.025);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  /* crack: [highpass Hz, seconds, level]   body: [bandpass Hz, seconds, level]
     thump: [start Hz, seconds, level]      tail: [lowpass Hz, seconds, level] */
  const GUN = {
    RIFLE:      { crack:[2200,0.018,0.50], body:[700,0.09,0.55],  thump:[160,0.07,0.50], tail:[1100,0.28,0.16] },
    SNIPER:     { crack:[1600,0.025,0.70], body:[420,0.22,0.80],  thump:[110,0.16,0.90], tail:[800,0.90,0.30] },
    SHOTGUN:    { crack:[1400,0.030,0.60], body:[320,0.20,0.90],  thump:[95,0.15,0.85],  tail:[700,0.60,0.26] },
    PISTOL:     { crack:[2600,0.014,0.55], body:[900,0.07,0.45],  thump:[200,0.055,0.40], tail:[1300,0.22,0.12] },
    'PISTOL X': { crack:[2300,0.015,0.60], body:[760,0.085,0.55], thump:[170,0.065,0.50], tail:[1200,0.26,0.14] },
  };
  function gunshot(p, dest){
    const v = 0.96 + Math.random()*0.08;          // no two shots identical, or auto fire drones
    nz(dest, 'highpass', p.crack[0]*v, p.crack[1], p.crack[2]);
    nz(dest, 'bandpass', p.body[0]*v,  p.body[1],  p.body[2], 0.8);
    osc(dest, 'sine',    p.thump[0]*v, p.thump[0]*0.35, p.thump[1], p.thump[2]);
    nz(dest, 'lowpass',  p.tail[0],    p.tail[1],  p.tail[2]);
  }
  const safe = fn => (...a)=>{ try{ ensure(); return fn(...a); }catch(e){} };

  return {
    resume(){ try{ const c=ensure(); if(c.state==='suspended') c.resume(); }catch(e){} },
    /* A gun's report, or an ability's launch. `at` places someone else's. */
    shoot: safe((w, at)=>{
      const dest = bus(at, 30); if(!dest) return;
      if(w.kind === 'xbow'){                       // string snap, then the bolt leaving
        osc(dest, 'sawtooth', 240, 85, 0.16, 0.30); nz(dest, 'highpass', 2600, 0.03, 0.30);
        nz(dest, 'bandpass', 900, 0.22, 0.16, 1.2, 2400);
      } else if(w.kind === 'smoke'){               // a hollow launcher thump
        osc(dest, 'sine', 130, 55, 0.18, 0.55); nz(dest, 'lowpass', 900, 0.20, 0.35);
      } else if(w.kind === 'grenade'){             // the pin, then the throw
        osc(dest, 'triangle', 2400, 1800, 0.03, 0.18); nz(dest, 'bandpass', 700, 0.22, 0.22, 0.8, 1500);
      } else gunshot(GUN[w.name] || GUN.RIFLE, dest);
    }),
    magOut: safe(()=>{ nz(master,'highpass',3000,0.022,0.28); osc(master,'triangle',1700,800,0.035,0.10); }),
    magIn:  safe(()=>{ nz(master,'bandpass',1300,0.045,0.34,1.5); osc(master,'sine',240,150,0.07,0.22); }),
    bolt:   safe(()=>{ nz(master,'highpass',2400,0.02,0.26); osc(master,'triangle',900,500,0.04,0.10);
                       nz(master,'bandpass',1500,0.035,0.26,2); osc(master,'triangle',700,420,0.05,0.10,0.07); }),
    empty:  safe(()=>{ nz(master,'highpass',3200,0.012,0.22); osc(master,'square',150,110,0.025,0.05); }),
    /* Landing a hit: a dry tick on the body, a brighter two-note ring on the head. */
    hit: safe((zone)=>{
      // has to cut through your own gunfire, so it sits well above its natural level
      if(zone === 'head'){ osc(master,'sine',2100,2100,0.10,0.34); osc(master,'sine',3150,3150,0.08,0.18);
                           nz(master,'highpass',4000,0.012,0.24); }
      else { osc(master,'sine',1350,950,0.04,0.32); nz(master,'highpass',3000,0.010,0.22); }
    }),
    /* Being hit: low and dull, so it can never be mistaken for landing one. */
    hurt: safe(()=>{ osc(master,'sine',150,70,0.13,0.42); nz(master,'lowpass',700,0.09,0.30); }),
    kill: safe(()=>{ osc(master,'sine',660,660,0.09,0.10); osc(master,'sine',990,990,0.14,0.10,0.08); }),
    step: safe((left, at)=>{ const dest = bus(at); if(!dest) return;
      nz(dest,'lowpass', left ? 520 : 460, 0.07, at ? 0.46 : 0.30); osc(dest,'sine', left ? 95 : 86, 60, 0.05, at ? 0.22 : 0.14); }),
    land: safe(()=>{ nz(master,'lowpass',420,0.13,0.26); osc(master,'sine',85,45,0.12,0.22); }),
    roll: safe(()=>{ nz(master,'bandpass',420,0.30,0.22,0.9,1500); }),
    dash: safe(()=>{ nz(master,'bandpass',900,0.22,0.30,0.9,3200); osc(master,'sine',180,90,0.12,0.18); }),
    /* Blast's zone coming on: a rising swell and a heartbeat thump. */
    zone: safe(()=>{ osc(master,'sawtooth',110,330,0.45,0.10); osc(master,'sine',60,48,0.30,0.40,0.05);
                     nz(master,'highpass',2600,0.35,0.10); }),
    /* A grenade: the biggest sound in the game, and it carries. */
    boom: safe((at)=>{ const dest = bus(at, 40); if(!dest) return;
      nz(dest,'highpass',1800,0.04,0.80); osc(dest,'sine',95,28,0.55,1.10);
      nz(dest,'lowpass',520,0.45,0.95); nz(dest,'lowpass',260,1.40,0.40); }),
    swap: safe(()=>{ nz(master,'bandpass',2100,0.03,0.16,1.4); osc(master,'triangle',520,420,0.03,0.05); }),
    /* A pool catching, and a cloud bursting — heard from where they land. */
    ignite: safe((at)=>{ const dest = bus(at, 16); if(!dest) return;
      nz(dest,'lowpass',500,0.55,0.34,0,1400); osc(dest,'sine',90,60,0.25,0.22); }),
    hiss: safe((at)=>{ const dest = bus(at, 16); if(!dest) return;
      nz(dest,'highpass',1700,0.75,0.20); osc(dest,'sine',120,70,0.12,0.25); }),
    /* How loud the plant is from where you stand, 0..1 for each of its two
       voices. Nothing is built until there is something to hear, so a map
       with no plant costs nothing. The levels glide: this is called a few
       times a second, and a hum that steps is a hum you notice. */
    plant: safe((tx, turbine)=>{
      if(!plant){ if(!(tx > 0.003 || turbine > 0.003)) return; plantBuild(); }
      const t = ctx.currentTime;
      plant.tx.gain.setTargetAtTime(Math.max(0, tx) * 0.05, t, 0.3);
      plant.tb.gain.setTargetAtTime(Math.max(0, turbine) * 0.055, t, 0.3);
    }),
    /* For tests only: swap in another context (an OfflineAudioContext, say)
       so a sound can be rendered and measured instead of merely not throwing. */
    _use(c){ build(c); },
  };
})();

/* ---- The plant, heard from where you stand ----
   A map's transformers and turbines are found in its own data (a box with
   mat 'transformer', a prop of kind 'turbine'), so a map with neither is
   silent without being told to be. Each adds by distance; a turbine is
   measured to the nearest point of its 15m length, not to its middle, or
   walking along one would make it fade and swell.
   It listens from the CAMERA, so someone watching a match after being
   eliminated hears the hall the player they are following is standing in.
   Called every frame and does its work about eight times a second. */
let humAcc = 0, humMap = null, humTx = [], humTb = [], humOn = false;
function stationHum(dt){
  humAcc += dt; if(humAcc < 0.12) return; humAcc = 0;
  if(humMap !== currentMap){ humMap = currentMap;
    humTx = ((currentMap && currentMap.boxes) || []).filter(b => b.mat === 'transformer');
    humTb = ((currentMap && currentMap.props) || []).filter(p => p.kind === 'turbine'); }
  let tx = 0, tb = 0;
  if(gameState === 'playing' && !paused){
    const px = camera.position.x, pz = camera.position.z;
    for(const b of humTx) tx += 1 / (1 + Math.pow(Math.hypot(px - b.x, pz - b.z) / 9, 2));
    for(const p of humTb) tb += 1 / (1 + Math.pow(Math.hypot(Math.max(0, Math.abs(px - p.x) - 7.5), pz - p.z) / 15, 2));
  }
  /* Nothing to play and nothing playing: do not touch the audio at all. At
     the menu this would otherwise open an AudioContext before the first
     click, which the browser refuses and complains about. */
  const want = tx > 0.003 || tb > 0.003;
  if(!want && !humOn) return;
  humOn = want;
  Sfx.plant(Math.min(1, tx), Math.min(1, tb));
}
/* A hidden tab stops running the loop above, and a hum that was playing
   would simply carry on at whatever level it had. */
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && humOn){ humOn = false; Sfx.plant(0, 0); } });

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
    if(w.ability && !agentHas(i)) return '';      // another agent's kit
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
    /* Guns get STAT BARS, normalised against the other guns, the way a
       loadout screen compares them; abilities and the blade are not on that
       scale and get spec lines instead. */
    const line = (k, v) => `<div class="wl"><span>${k}</span><b>${v}</b></div>`;
    const stats = w.ability
      ? line('DAMAGE', w.headDmg ? (w.headDmg+' HEAD / '+w.bodyDmg+' BODY') : (w.dmg ? String(w.dmg) : 'NONE'))
        + line('CHARGES', w.charges) + line('RECHARGE', Math.round(w.cooldownMs/1000)+'s')
      : w.melee
      ? line('COMBO', w.combo.join(' / ')) + line('REACH', w.reach+'m')
      : gunBars(w);
    let tag;
    if(!shop)      tag = i===currentWeapon ? '<b style="color:var(--ac-soft)">EQUIPPED</b>' : '&nbsp;';
    else if(free)  tag = i===currentWeapon ? '<b style="color:var(--ac-soft)">EQUIPPED</b>' : '<span style="opacity:.6">FREE</span>';
    else if(owned) tag = i===currentWeapon ? '<b style="color:var(--ac-soft)">EQUIPPED</b>' : '<b style="color:var(--ac-soft)">OWNED</b>';
    else if(!canBuy) tag = `<span style="opacity:.45">$${price}</span>`;
    else if(sandbox) tag = '<b style="color:var(--ac-soft)">TAKE IT</b>';
    else {
      const swaps = heldInSlot !== null && heldInSlot !== undefined;
      tag = `<b style="color:${afford?'#ffd15a':'#ff6a6a'}">$${price}</b>` +
            (swaps && afford ? `<br><span style="opacity:.55;font-size:10px">replaces ${WEAPONS[heldInSlot].name}</span>` : '');
    }
    // label the category so the two-gun rule is visible rather than guessed at
    const slotLbl = !shop ? '' : isMain ? ' · MAIN' : isSide ? ' · SIDE' : '';
    const dim = (shop && !owned && (!canBuy || !afford)) ? 'opacity:.45;' : '';
    const cat = w.ability ? 'ABILITY' : w.melee ? 'MELEE' : isMain ? 'PRIMARY' : isSide ? 'SIDEARM' : '';
    const key = w.ability || w.melee ? WEAPON_KEY[i] : (invPos >= 0 ? String(invPos+1) : '–');
    return `<div class="wcard ${i===currentWeapon?'equipped':''}" data-i="${i}" style="${dim}">
      <div class="wc-top"><span class="wkey">${key}</span><span class="wcat">${cat}</span></div>
      <div class="wname">${w.name}</div>
      <div class="wmode">${w.mode}${w.scope?' · SCOPE':''}${w.pellets?' · '+w.pellets+' PELLETS':''}${!w.ability && !w.melee ? ' · '+w.magMax+'/'+w.reserveMax : ''}</div>
      <div class="wstats">${stats}</div>
      <div class="wtag">${tag}</div>
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
/* Five bars for a gun, each against the best gun on that axis. Accuracy is
   its AIMED cone on a log scale: the cones run from 0.0015 to 0.06, forty
   to one, and on a straight scale every gun but the sniper would read empty. */
function gunBars(w){
  const guns = WEAPONS.filter(g => !g.ability && !g.melee);
  const dpsh = g => g.dmg * (g.pellets || 1), rpm = g => 60000 / g.fireRate;
  const max = f => Math.max(...guns.map(f));
  const lo = Math.min(...guns.map(g => g.adsSpread)), hi = Math.max(...guns.map(g => g.adsSpread));
  const acc = g => Math.log(hi / g.adsSpread) / Math.log(hi / lo);
  const rows = [
    ['DAMAGE',   dpsh(w) / max(dpsh), dpsh(w)],
    ['FIRE RATE', rpm(w) / max(rpm), Math.round(rpm(w))],
    ['RANGE',    w.range / max(g => g.range), w.range + 'm'],
    ['ACCURACY', acc(w), Math.round(acc(w) * 100)],
    ['MAGAZINE', w.magMax / max(g => g.magMax), w.magMax],
  ];
  return rows.map(([k, f, v]) =>
    `<div class="wb"><span>${k}</span><em>${v}</em><i><u style="width:${Math.max(4, f * 100).toFixed(0)}%"></u></i></div>`).join('');
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
    if(card){ cg.fillStyle='rgba(255,255,255,0.95)'; cg.font="700 13px 'Barlow Condensed','Segoe UI',sans-serif"; cg.fillText(card, x, 3);
      cg.fillRect(x-0.5, 18, 1.5, 8); }
    else if(deg%15===0){ cg.fillStyle='rgba(255,255,255,0.6)'; cg.fillRect(x-0.5, 20, 1, 6); }
    else { cg.fillStyle='rgba(255,255,255,0.3)'; cg.fillRect(x-0.5, 22, 1, 4); }
  }
  // center marker
  cg.fillStyle='#fff'; cg.beginPath(); cg.moveTo(W/2,26); cg.lineTo(W/2-4,30); cg.lineTo(W/2+4,30); cg.closePath(); cg.fill();
}
let prevHp=100;


/* =======================================================================
   WHERE YOU ARE  —  the corner map, and the whole site on M
   =======================================================================
   Both are drawn by ONE function from `currentMap`, the same data the
   arena's geometry and the server's collision are built from, so the plan
   cannot show a room the match is not playing. The lobby's map card
   (drawMapThumb, session.js) draws from it too; this is the in-play twin.

   NORTH-UP, not rotating. The compass already says which way you face, and
   a plan that spins under you is much harder to read a POSITION off —
   which is what Jack asked for. The arrow turns instead.

   North is -z, which is what the compass already calls N, and the canvas
   has +z downward, so -z is up and the two agree by construction.          */
const MAPC = {
  floor:  '#13161a',
  indoor: 'rgba(120,140,170,.11)',    // under a roof
  wall:   '#aeb6bf',                  // buildings and barriers
  plant:  '#737c88',                  // machinery
  thin:   '#4e555f',                  // lattice, steps, columns
  grid:   'rgba(255,255,255,.045)',
  you:    '#ff2d4a',
  them:   '#ff6274',
  supply: '#27ff9e',
};
/* Which of those three a box is drawn in. A kind not named here is plant,
   which is the right default: most of a power station is machinery. */
const MAPC_WALL = { cladding:1, firewall:1, block:1, wall:1, boiler:1, shed:1,
                    hall:1, control:1, intake:1, tower:1, annex:1, pillar:1 };
const MAPC_THIN = { lattice:1, column:1, step:1, hvtower:1, firebox:1 };

/* `o` = { cx, cz, span, labels }. Everything else is read live. */
function drawMapPlan(g, W, H, o){
  const map = (typeof currentMap !== 'undefined') ? currentMap : null;
  if (!map) return;
  const A = map.arena, span = o.span, s = Math.min(W, H) / span;
  const px = x => W / 2 + (x - o.cx) * s, pz = z => H / 2 + (z - o.cz) * s;

  g.clearRect(0, 0, W, H);
  g.fillStyle = MAPC.floor; g.fillRect(0, 0, W, H);

  /* A 20m grid, so distance on the plan means something. */
  g.strokeStyle = MAPC.grid; g.lineWidth = 1;
  g.beginPath();
  for (let x = Math.ceil((o.cx - span) / 20) * 20; x <= o.cx + span; x += 20){
    g.moveTo(px(x), 0); g.lineTo(px(x), H); }
  for (let z = Math.ceil((o.cz - span) / 20) * 20; z <= o.cz + span; z += 20){
    g.moveTo(0, pz(z)); g.lineTo(W, pz(z)); }
  g.stroke();

  /* Under a roof. Drawn first and faint: it is a region, not a thing, and
     it is the one cue that says "you are inside the hall". */
  for (const r of (map.roofRects || [])){
    g.fillStyle = MAPC.indoor;
    g.fillRect(px(r.minx), pz(r.minz), (r.maxx - r.minx) * s, (r.maxz - r.minz) * s);
  }

  /* The site boundary. */
  g.strokeStyle = 'rgba(255,255,255,.17)'; g.lineWidth = 1.5;
  g.strokeRect(px(-A), pz(-A), A * 2 * s, A * 2 * s);

  /* The plant. `hidden` boxes are skipped: they stand inside something the
     prop already draws, so on a plan they only thicken what is there. */
  for (const b of map.boxes){
    if (b.mat === 'hidden') continue;
    const x0 = px(b.x - b.w / 2), z0 = pz(b.z - b.d / 2), w = b.w * s, d = b.d * s;
    if (x0 + w < 0 || z0 + d < 0 || x0 > W || z0 > H) continue;     // off this view
    g.fillStyle = MAPC_WALL[b.mat] ? MAPC.wall : MAPC_THIN[b.mat] ? MAPC.thin : MAPC.plant;
    g.fillRect(x0, z0, Math.max(1, w), Math.max(1, d));
  }

  /* The resupply, in the green it has everywhere else. */
  const rs = map.resupply || { x: 0, z: 0 };
  g.strokeStyle = MAPC.supply; g.lineWidth = 1.5;
  g.beginPath(); g.arc(px(rs.x), pz(rs.z), Math.max(3, 5 * s), 0, Math.PI * 2); g.stroke();

  /* Labels, from the map's own floor stencils — so the names on the plan
     are the names painted on the ground. */
  if (o.labels){
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.font = '600 11px ui-monospace,monospace'; g.textAlign = 'center';
    for (const p of (map.paint || [])) if (p.k === 'text')
      g.fillText(p.t, px(p.x), pz(p.z));
    g.textAlign = 'left';
  }

  /* Everyone else. Bots in the range are local; in a match `others` is the
     room. Nobody is drawn through anything — this is a plan, not a radar,
     and it shows what the map shows, not what you can see. */
  const dot = (x, z, col, r) => { g.fillStyle = col; g.beginPath();
    g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill(); };
  if (typeof others !== 'undefined' && others)
    for (const p of others.values()) if (p.alive !== false) dot(p.bx != null ? p.bx : p.tx, p.bz != null ? p.bz : p.tz, MAPC.them, 3);
  if (typeof localBots !== 'undefined' && localBots)
    for (const b of localBots) if (b.alive) dot(b.x, b.z, MAPC.them, 3);

  /* You, as an arrow. Base points up (north); canvas rotate is clockwise,
     and the forward vector for yaw is (-sin, -cos), so the angle is -yaw. */
  g.save(); g.translate(px(me.x), pz(me.z)); g.rotate(-me.yaw);
  g.fillStyle = MAPC.you;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6);
  g.closePath(); g.fill();
  g.restore();
}

/* The corner map, centred on you, at two sizes. Jack: "make the map
   smaller and make it extendable". It starts SMALL, and M steps it up:
   small -> large -> the whole site -> back to small. One key, three answers
   to "where am I", from glance to plan.

   Both corner sizes draw at the SAME SCALE (about 1.8px a metre), so
   growing it shows more ground round you rather than zooming in on the
   same ground - you keep your bearings through the change.

   The canvas is sized to the panel in real pixels (capped at 2x) and drawn
   with a transform, so it stays sharp on a high-DPI screen at either size
   and drawMapPlan can keep working in CSS pixels. Throttled: canvas 2D over
   three hundred boxes, and nothing on it moves fast enough to want 60Hz. */
const MAP_SIZES = [ { px: 150, span: 84 }, { px: 340, span: 190 } ];
let mapSize = (() => { try { return localStorage.getItem('cx.mapsize') === '1' ? 1 : 0; } catch (e) { return 0; } })();
let mapAt = 0;
function setMapSize(i){
  mapSize = i; mapAt = 0;                                   // redraw on the next frame, not in 90ms
  const p = byId('mapPanel'); if (p) p.classList.toggle('big', i === 1);
  try { localStorage.setItem('cx.mapsize', String(i)); } catch (e) {}
}
/* A remembered LARGE map has to be large from the first frame. */
{ const p = byId('mapPanel'); if (p) p.classList.toggle('big', mapSize === 1); }
function drawMinimap(now){
  const c = byId('minimap'); if (!c || gameState !== 'playing') return;
  if (now - mapAt < 90) return; mapAt = now;
  const sz = MAP_SIZES[mapSize], r = Math.min(2, window.devicePixelRatio || 1);
  const want = Math.round(sz.px * r);
  if (c.width !== want){ c.width = want; c.height = want; }
  const g = c.getContext('2d');
  g.setTransform(want / sz.px, 0, 0, want / sz.px, 0, 0);
  drawMapPlan(g, sz.px, sz.px, { cx: me.x, cz: me.z, span: sz.span, labels: mapSize === 1 });
  g.setTransform(1, 0, 0, 1, 0, 0);
}
/* M: small -> large -> the whole site -> small. The site plan is centred on
   the arena rather than on you, because the question it answers is "where
   am I in all this". Leaving it drops back to the SMALL map, so the cycle
   always comes round to where it started. */
function cycleMap(){
  const big = byId('bigmap'); if (!big) return;
  if (!big.classList.contains('hidden')){ big.classList.add('hidden'); setMapSize(0); return; }
  if (mapSize === 0){ setMapSize(1); return; }
  big.classList.remove('hidden'); drawBigMap();
}
function drawBigMap(){
  const c = byId('bigmapCv'); if (!c || typeof currentMap === 'undefined' || !currentMap) return;
  drawMapPlan(c.getContext('2d'), c.width, c.height,
              { cx: 0, cz: 0, span: currentMap.arena * 2 + 8, labels: true });
}
