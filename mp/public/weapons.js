/* =============================================================
   Bot Strike — weapons.js  (4 of 9 in load order)

   Player state, ability charges, peek/roll tuning, the weapon roster and its viewmodels.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after models.js and before session.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Stance system + local player ---- */
const STANCE = { stand:{eye:1.7,spd:1.0,body:1.8}, crouch:{eye:1.05,spd:0.5,body:1.15}, prone:{eye:0.6,spd:0.3,body:0.7} };
const JUMP_V = 10.5, GRAV = 24;
const MAX_JUMPS = 2;                 // ground jump + one mid-air jump
let jumpPressed = false;             // edge-triggered by keydown

/* ---- Abilities ---- */
// lean: peak camera roll, in radians, on a pure sideways roll (0.22 ~= 12.6 deg).
// A forward/back roll scales this to 0 and only dips.
/* fov/tuck give a forward roll some punch without touching where you're
   looking. There WAS a pitch arc here that somersaulted the view; it was
   removed on Jack's call — tilting the POV on a forward roll felt bad.
   Sideways rolls still lean (ROLL.lean). */
const ROLL = { dur:0.62, speed:20, cdMs:1200, lean:0.22,
               fov:9, tuck:0.22 };                     // V — dodge roll (~7m)
/* Q/E peek. Deliberately shallow — angle is the camera roll in radians
   (0.16 ~= 9 deg), offset is how far the eye slides sideways. Enough to
   clear a corner without the horizon tipping over. */
/* Remote player smoothing. REMOTE_EASE is the ease rate in units/second (its
   reciprocal is the time constant, ~45ms); REMOTE_PREDICT caps how far ahead
   we will ever guess, so a lost packet cannot fling a body across the room. */
const REMOTE_EASE = 22, REMOTE_PREDICT = 0.22;
/* ---- Spread: OFF ----------------------------------------------------------
   Every weapon keeps its spread and adsSpread in the roster above, untouched.
   This one flag is the only thing switching them off, so putting the cone
   back is a one-word change: SPREAD_ON = true.

   What it does when on: each shot nudges its direction by a random amount
   inside a cone. Because that is an ANGLE, the miss grows with distance — a
   rifle hip-fired lands a headshot 88% of the time at 25m but 36% at 40m,
   and a sniper hip-fired is 7% at 25m. Off, every shot goes exactly through
   the crosshair at any range, and aiming down sights no longer changes
   accuracy (it still zooms).
   --------------------------------------------------------------------------- */
const SPREAD_ON = false;

const LEAN = { angle:0.16, offset:0.45, rate:9 };
// SLIDE IS CURRENTLY DISABLED — flip this to true to bring it back.
// The full implementation is kept intact below and documented in
// extras/slide-ability.md. With it off, C is always a plain crouch toggle.
const SLIDE_ENABLED = false;
const SLIDE= { dur:0.80, speed:13.0, cdMs:1500 };     // C while sprinting
let rollT=0, rollCdUntil=0, rollDir=new THREE.Vector3();
let slideT=0, slideCdUntil=0, slideDir=new THREE.Vector3(), slideSpd=0;
// Crossbow charges regenerate independently: each entry is a "ready at" time.
/* Each ability slot keeps its OWN charges and its own recharge timers, so
   firing the crossbow never eats a smoke charge. Keyed by weapon index. */
const abilityCharges = {};                // slot -> charges in hand
const abilityRecharge = {};               // slot -> [ms timestamps a charge returns]
let ricochet = false;                     // alt-fire mode for the crossbow
function abilityTick(){
  const now = performance.now();
  for(const slot of ABILITY_SLOTS){
    const q = abilityRecharge[slot] || (abilityRecharge[slot] = []);
    while(q.length && q[0] <= now){ q.shift(); abilityCharges[slot]++; }
    if(abilityCharges[slot] > WEAPONS[slot].charges) abilityCharges[slot] = WEAPONS[slot].charges;
  }
}
function resetAbilities(){
  for(const slot of ABILITY_SLOTS){ abilityCharges[slot] = WEAPONS[slot].charges; abilityRecharge[slot] = []; }
  ricochet = false;
}
const STANCE_ID = { stand:0, crouch:1, prone:2 };
const STANCE_BY_ID = ['stand','crouch','prone'];
const me = { x:0, z:44, feetY:0, eyeH:1.7, stance:'stand', yaw:0, pitch:0, vy:0, onGround:true, radius:0.4, hp:100, alive:true,
  hv:new THREE.Vector3() };     // horizontal velocity — carries momentum between abilities
let camRoll=0, camDip=0, rollLean=0, slideLean=0, leanAmt=0;   // leanAmt: -1 left .. +1 right
let rollFwd=0, rollPunch=0;      // rollFwd: +1 forward, -1 backward, 0 sideways
                                 // rollPunch: 0..1 envelope for the FOV/weapon kick
/* Weapon roster (keys 1-5, Tab shows the armory). ADS on right-click. */
const WEAPONS = [
  { name:'RIFLE',    mode:'AUTO', auto:true,  fireRate:95,   dmg:26,  recoil:0.011, spread:0.014, adsSpread:0.006,  range:240, magMax:30, reserveMax:120, reloadMs:1600, adsFov:62, scope:false },
  { name:'SNIPER',   mode:'BOLT', auto:false, fireRate:1200, dmg:110, recoil:0.045, spread:0.05,  adsSpread:0.0015, range:400, magMax:5,  reserveMax:25,  reloadMs:2400, adsFov:20, scope:true  },
  { name:'SHOTGUN',  mode:'PUMP', auto:false, fireRate:900,  dmg:12,  pellets:8, recoil:0.03,  spread:0.09, adsSpread:0.06, range:60,  magMax:6,  reserveMax:36,  reloadMs:2200, adsFov:68, scope:false },
  { name:'PISTOL',   mode:'SEMI', auto:false, fireRate:200,  dmg:30,  recoil:0.013, spread:0.010, adsSpread:0.004,  range:180, magMax:12, reserveMax:60,  reloadMs:1200, adsFov:66, scope:false },
  { name:'PISTOL X', mode:'SEMI', auto:false, fireRate:170,  dmg:40,  recoil:0.012, spread:0.012, adsSpread:0.005,  range:180, magMax:10, reserveMax:50,  reloadMs:1100, adsFov:66, scope:false },
  // ABILITY: charge-based, no magazine/reload. Each shot burns one charge that
  // regenerates on its own 30s timer. Right-click toggles RICOCHET.
  { name:'CROSSBOW', mode:'ABILITY', ability:true, kind:'xbow', auto:false, fireRate:700, dmg:90,
    // burnMs is how long a PERSON burns; the fire left on the ground is a
    // separate, longer-lived thing (GFIRE.ms).
    burnDps:12, burnMs:5000, charges:2, cooldownMs:30000, speed:62,
    recoil:0.02, spread:0.004, adsSpread:0.004, range:320, adsFov:70, scope:false },
  // ABILITY: smoke bolt. Same charge model as the crossbow, no damage. The
  // cloud is a little wider than a fire pool, and anyone who walks into it is
  // MARKED for SMOKE.markMs — the thrower then sees them through walls.
  { name:'SMOKE', mode:'ABILITY', ability:true, kind:'smoke', auto:false, fireRate:700, dmg:0,
    charges:2, cooldownMs:30000, speed:52,
    recoil:0.012, spread:0.004, adsSpread:0.004, range:320, adsFov:70, scope:false },
];
// MELEE: five-hit combo. Each landed hit within the window advances the chain,
// and the fifth is a heavy finisher. Missing or pausing resets you to hit 1.
WEAPONS.push({ name:'BLADE', mode:'MELEE', melee:true, auto:false, fireRate:360,
  combo:[22,22,28,28,70], comboWindowMs:1600, reach:3.2, arc:0.55,
  recoil:0.004, spread:0, adsSpread:0, range:3.2, adsFov:75, scope:false });
const XBOW  = WEAPONS.findIndex(w=>w.kind==='xbow');    // crossbow slot
const SMOKE = WEAPONS.findIndex(w=>w.kind==='smoke');   // smoke slot
const BLADE = WEAPONS.findIndex(w=>w.melee);            // blade slot
const ABILITY_SLOTS = WEAPONS.map((w,i)=>w.ability?i:-1).filter(i=>i>=0);
/* What the armory should print on each card. Guns are 1-5; the abilities
   and the blade have their own keys, and printing i+1 told you to press 7
   for smoke — a key that isn't bound to anything. */
const WEAPON_KEY = WEAPONS.map((w,i)=> String(i+1));
WEAPON_KEY[XBOW]='G'; WEAPON_KEY[SMOKE]='H'; WEAPON_KEY[BLADE]='F';
resetAbilities();

// One holder per WEAPONS entry (the ability/melee slots have no file model,
// so they get procedural ones below).
const weaponHolders = WEAPONS.map(()=>new THREE.Group());
weaponHolders.forEach((h,i)=>{ gun.add(h); h.visible = i===0; });

/* Procedural crossbow (ability slot) */
(function buildCrossbow(){
  const g=new THREE.Group(), dark=new THREE.MeshLambertMaterial({color:0x2a2420}),
        metal=new THREE.MeshLambertMaterial({color:0x4a4f57}),
        glow=new THREE.MeshBasicMaterial({color:0xff8a2a});
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.75),dark),0,0,-0.1));     // stock
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.62,0.045,0.07),metal),0,0.05,-0.34)); // limbs
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.09,0.16,0.1),dark),0,-0.12,0.08));  // grip
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.5),metal),0,0.09,-0.2));  // rail
  const bolt=at(new THREE.Mesh(new THREE.ConeGeometry(0.05,0.16,8),glow),0,0.09,-0.5);
  bolt.rotation.x=-Math.PI/2; g.add(bolt);                                            // loaded bolt
  g.scale.setScalar(0.62);                 // keep it in scale with the rifles
  g.position.set(0.02,-0.05,-0.08);
  weaponHolders[XBOW].add(g);
})();

/* Procedural smoke launcher (smoke ability slot) — a stubby wide-bore tube
   so it reads as nothing like the crossbow at a glance. */
(function buildSmokeLauncher(){
  const g=new THREE.Group(),
        body =new THREE.MeshLambertMaterial({color:0x37414a}),
        trim =new THREE.MeshLambertMaterial({color:0x222a31}),
        band =new THREE.MeshLambertMaterial({color:0x9aa0a8});
  const tube=at(new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.15,0.62,12),body),0,0.01,-0.3);
  tube.rotation.x=Math.PI/2; g.add(tube);                                            // barrel
  const muzzle=at(new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.16,0.07,12),trim),0,0.01,-0.6);
  muzzle.rotation.x=Math.PI/2; g.add(muzzle);                                        // flared mouth
  const ring=at(new THREE.Mesh(new THREE.CylinderGeometry(0.155,0.155,0.045,12),band),0,0.01,-0.36);
  ring.rotation.x=Math.PI/2; g.add(ring);                                            // grey ID band
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.09,0.2,0.11),trim),0,-0.16,0.0));   // grip
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.2),body),0,0.12,-0.1));   // sight rail
  const can=at(new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.16,10),band),0,0.01,-0.62);
  can.rotation.x=Math.PI/2; g.add(can);                                              // loaded canister
  g.position.set(0.02,-0.04,-0.04);
  weaponHolders[SMOKE].add(g);
})();

/* Procedural blade (melee slot) */
(function buildBlade(){
  const g=new THREE.Group(),
        steel=new THREE.MeshLambertMaterial({color:0xd8dde4, emissive:0x101418}),
        grip =new THREE.MeshLambertMaterial({color:0x1b1f25}),
        gold =new THREE.MeshLambertMaterial({color:0xd8a441});
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.055,0.012,0.62),steel),0,0,-0.3));  // blade
  const tip=at(new THREE.Mesh(new THREE.ConeGeometry(0.035,0.14,4),steel),0,0,-0.66);
  tip.rotation.x=-Math.PI/2; g.add(tip);                                              // point
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.14,0.02,0.035),gold),0,0,0.02));    // guard
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.17),grip),0,0,0.12));     // handle
  g.position.set(0.05,-0.06,0.02);
  weaponHolders[BLADE].add(g);
})();
/* Real crossbow + sword models (CreativeTrio / Quaternius, FBX).
   Both arrive as a SINGLE mesh with a SINGLE material and no usable texture —
   the sword has no maps at all, the crossbow points at a palette JPG that
   isn't in the download — so there is no material name to paint by. Instead we
   cut each one into material groups along its own long axis; the fractions
   below come from measuring where the parts actually sit in the geometry.
   Lambert throughout: no metalness, no envMap, no emissive, no extra lights,
   because there's no tone mapping or environment here to light them with.
   The procedural versions above stay on screen until these land, and remain
   the fallback if a load fails. */
const ABILITY_MODELS = [
  // Limbs are the wide end and already point -Z, so no reorientation.
  { slots:[XBOW, SMOKE], url:'assets/crossbow.fbx', len:0.70, ry:0, autoOrient:false,
    pos:[0.02,-0.05,-0.08],
    split:{ axis:'z', cuts:[0.42, Infinity], colors:[0x4a4f57, 0x3a322b] } },  // limbs | stock
  // Modelled standing upright with the tip at +Y; rx lays it forward.
  { slots:[BLADE], url:'assets/sword.fbx',  len:0.82, ry:0, rx:-Math.PI/2, autoOrient:false,
    pos:[0.05,-0.06,0.02],
    split:{ axis:'z', cuts:[0.25, 0.47, Infinity], colors:[0x1b1f25, 0xd8a441, 0xd8dde4] } },  // grip | guard | blade
];

/* Reorder a mesh's triangles into contiguous material groups, split by where
   each triangle's centre falls along `axis` as a 0..1 fraction of the model's
   own bounding box. Returns a new geometry; the caller disposes the old one. */
function splitGeometryByAxis(geo, axis, cuts){
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position, triCount = pos.count/3;
  const bb = new THREE.Box3().setFromBufferAttribute(pos);
  const lo = bb.min[axis], span = (bb.max[axis]-lo) || 1;
  const buckets = cuts.map(()=>[]);
  const v = new THREE.Vector3();
  for(let t=0;t<triCount;t++){
    let mid=0;
    for(let k=0;k<3;k++){ v.fromBufferAttribute(pos, t*3+k); mid+=v[axis]; }
    const f = ((mid/3)-lo)/span;
    let gi = cuts.findIndex(c=>f<c); if(gi<0) gi = cuts.length-1;
    buckets[gi].push(t);
  }
  const out = new THREE.BufferGeometry();
  const order = [].concat(...buckets);
  for(const name of Object.keys(src.attributes)){
    const a = src.attributes[name], n = a.itemSize;
    const arr = new a.array.constructor(order.length*3*n);
    let w = 0;
    for(const t of order) for(let k=0;k<3;k++){
      const base = (t*3+k)*n;
      for(let c=0;c<n;c++) arr[w++] = a.array[base+c];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  let at = 0;
  buckets.forEach((list,gi)=>{ out.addGroup(at, list.length*3, gi); at += list.length*3; });
  out.computeBoundingBox(); out.computeBoundingSphere();
  if(src!==geo) src.dispose();
  return out;
}

function disposeTree(obj){
  obj.traverse(o=>{
    if(!o.isMesh) return;
    if(o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material)?o.material:[o.material];
    ms.forEach(m=>{ if(!m) return; if(m.map) m.map.dispose(); m.dispose(); });
  });
}
if (THREE.FBXLoader) ABILITY_MODELS.forEach(am=>{
  const onErr=(err)=> console.warn(`[BotStrike] ${am.url} failed, keeping procedural`, err);
  try {
    new THREE.FBXLoader(fbxTexMgr).load(am.url, (model)=>{
      model.traverse(o=>{
        if(!o.isMesh) return;
        const old = o.geometry;
        o.geometry = splitGeometryByAxis(old, am.split.axis, am.split.cuts);
        if(old!==o.geometry) old.dispose();
        const prev = Array.isArray(o.material)?o.material:[o.material];
        prev.forEach(m=>{ if(!m) return; if(m.map) m.map.dispose(); m.dispose(); });
        o.material = am.split.colors.map(c=>new THREE.MeshLambertMaterial({color:c}));
      });
      const { holder, size } = fitWeaponModel(model, am);
      holder.position.set(am.pos[0], am.pos[1], am.pos[2]);
      // The first slot takes the model; any others get a clone, which shares
      // geometry and materials — so don't disposeTree a holder after this.
      am.slots.forEach((slot, n)=>{
        const h = weaponHolders[slot];
        while(h.children.length){ const c=h.children[0]; h.remove(c); disposeTree(c); }
        h.add(n === 0 ? holder : holder.clone());
      });
      console.log(`[BotStrike] ${am.url} loaded, raw size`, size.toArray().map(n=>+n.toFixed(2)));
    }, undefined, onErr);
  } catch(e){ onErr(e); }
});

// fallback box gun in slot 0 until the real model arrives
weaponHolders[0].add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1,0.13,0.6),new THREE.MeshLambertMaterial({color:0x24262b})),0,0,-0.05));
weaponHolders[0].add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,0.4),new THREE.MeshLambertMaterial({color:0x17181c})),0,0.01,-0.4));
let comboStep = 0, comboUntil = 0, swingT = 0, swingDir = 1;
let currentWeapon = 0;
let weaponAmmo = WEAPONS.map(w=>({ mag:w.magMax, reserve:w.reserveMax }));
const curW = ()=>WEAPONS[currentWeapon];
const curAmmo = ()=>weaponAmmo[currentWeapon];

/* Hit zones — the same table the server uses, and it MUST stay in step with
   mp/server.js or target practice will teach you the wrong aim. Head hurts
   most, torso is the baseline, arms and legs hurt less. Each entry is a
   sphere per stance: [height above the feet, radius], stand / crouch / prone.
   The arms sphere wraps the torso on purpose, so a shot through the middle
   reads as torso and only the outer edge of the silhouette counts as an arm;
   hitZone drops arms whenever the torso was hit too. */
/* [height above the feet, radius] per stance: stand / crouch / prone.
   head and body are EXACTLY the old two-box model, and the head-vs-body
   boundary is still decided between those two alone, so nothing that used to
   connect reads differently.
   core is the torso proper, sitting INSIDE body. A body hit is then split:
   inside the core it is a torso hit, in the ring between core and body it is
   an arm. That ring is where the model's arms actually are — the visible
   figure is only about 0.41 wide, so a 0.55 "arms" sphere outside body would
   have sat in empty air and never been hit, which is exactly what happened. */
const HITBOX = {
  /* head now matches the model: its head box is 0.26x0.28 at 1.68 with a
     helmet on top, so the head occupies y1.54-1.87 and is 0.15 half-wide.
     The old sphere was r0.30 at 1.70 — reaching 14cm down into the chest,
     13cm of empty air above the helmet, and twice as wide as the head. */
  head:  [[1.70,0.19],[1.22,0.18],[0.55,0.22]],
  body:  [[1.05,0.55],[0.70,0.50],[0.32,0.45]],
  /* shoulders and upper arms: the torso sphere stops at y1.60, but the arm
     boxes run to 1.75, so without this the upper arms were a dead zone that
     swallowed shots entirely. */
  upper: [[1.45,0.45],[1.00,0.40],[0.32,0.45]],
  legs:  [[0.32,0.34],[0.18,0.28],[0.20,0.34]],
};
/* How far off the target's centre line a body hit has to be to count as an
   arm. Measured as the perpendicular distance from the shot line to their
   vertical axis, NOT a second sphere: a sphere small enough to exclude the
   arms also excludes the upper chest, so central shots at shoulder height
   would have scored as arm hits. The model's torso is 0.5 wide and its arms
   sit between 0.27 and 0.41 out, so 0.26 separates them cleanly. */
const CORE_R = [0.26, 0.26, 0.30];
const MULT = { head:2.5, torso:1.0, arms:0.65, legs:0.65 };
function hitZone(o, dir, cx, cz, baseY, st){
  const s = Math.max(0, Math.min(2, st | 0));
  const reach = k => { const [dy, r] = HITBOX[k][s]; return raySphere(o, dir, cx, baseY + dy, cz, r); };
  /* The head sphere now hugs the model, so a hit on it really is a hit on
     the head and it simply wins. That was not safe when the sphere was r0.30
     and reached down into the chest — back then it had to lose to a nearer
     body entry, or every upper-chest shot became a headshot. */
  const th = reach('head');
  if (th < Infinity) return { t: th, zone: 'head', mult: MULT.head };
  const tb = Math.min(reach('body'), reach('upper'));
  if (tb < Infinity) {
    // A body hit, split by how central it is. The entry point stays the
    // body's, so the impact marker lands where it always did.
    const hd = Math.hypot(dir.x, dir.z);
    const lateral = hd < 1e-6
      ? Math.hypot(o.x - cx, o.z - cz)                       // straight up or down
      : Math.abs((cx - o.x) * (dir.z / hd) - (cz - o.z) * (dir.x / hd));
    const central = lateral <= CORE_R[s];
    return { t: tb, zone: central ? 'torso' : 'arms',
             mult: central ? MULT.torso : MULT.arms };
  }
  const tl = reach('legs');
  if (tl < Infinity) return { t: tl, zone: 'legs', mult: MULT.legs };
  return null;
}
/* A gun you just paid for arrives loaded — mag and reserve both full.
   Without this you could buy a rifle mid-match and get last round's
   leftovers, or three rounds later an empty one. */
function refillWeapon(i){
  const w = WEAPONS[i]; if(!w || w.magMax === undefined) return;
  weaponAmmo[i] = { mag: w.magMax, reserve: w.reserveMax };
}
/* Everything you carry, topped up — what the resupply crate hands out. */
function refillAllWeapons(){
  WEAPONS.forEach((w,i)=>{ if(w.magMax !== undefined) refillWeapon(i); });
  reloading = false; clearTimeout(reloadTimer);
}
/* The crate dead centre of the map. The server owns the cash side; the client
   owns ammo, so it refills its own. Overridden by the snapshot in a match. */
let RESUPPLY = { x:0, z:0, radius:5.0, cash:100 };
let inResupply = false;
let lastShot=0, reloading=false, reloadTimer=null;
let aiming=false, ads=0, semiQueued=false;   // ads = smoothed 0..1 aim amount
/* What you can cycle through: the guns you bought, in the order you bought
   them, then the blade on the end. The crossbow and smoke are abilities —
   they live on their own keys and are deliberately NOT in this list, so the
   scroll wheel never lands on them mid-fight.
   Target practice has no economy, so everything is yours there. */
function inventory(){
  if(gameMode !== 'mp') return [0,1,2,3,4,BLADE];
  return [...myGuns, BLADE];
}
function canEquip(i){
  const w = WEAPONS[i]; if(!w) return false;
  if(w.ability) return true;                 // crossbow and smoke, always yours
  if(gameMode !== 'mp') return true;
  return inventory().includes(i);
}
/* Called when the loadout changes: if you're holding something you no longer
   own, drop to the first thing in the list rather than leaving a phantom gun
   in hand. */
function ensureValidWeapon(){
  if(canEquip(currentWeapon)) return;
  const inv = inventory();
  switchWeapon(inv.length ? inv[0] : XBOW);
}
/* Scroll through the list. Starting from an ability (which isn't in it) we
   enter at the top rather than jumping somewhere arbitrary. */
function cycleWeapon(dir){
  const inv = inventory(); if(!inv.length) return;
  const at = inv.indexOf(currentWeapon);
  const next = at < 0 ? 0 : (at + dir + inv.length) % inv.length;
  switchWeapon(inv[next]);
}
function switchWeapon(i){
  if(i===currentWeapon || i<0 || i>=WEAPONS.length) return;
  if(!canEquip(i)){ Sfx.empty(); return; }   // you don't own that one
  currentWeapon=i; reloading=false; clearTimeout(reloadTimer); reloadSfxTimers.forEach(clearTimeout); semiQueued=false;
  weaponHolders.forEach((h,idx)=> h.visible = idx===i);
  // marks draw with depthTest off at renderOrder 900; the viewmodel has to
  // come after them or an enemy silhouette paints over your own gun
  weaponHolders[i].traverse(o=>{ o.renderOrder = 1000; });
  Sfx.swap(); updateHUD();
}
