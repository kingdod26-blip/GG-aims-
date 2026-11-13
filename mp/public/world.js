/* =============================================================
   Crimson X — world.js  (3 of 10 in load order)

   The arena: procedural + photoscanned materials, floor, walls, ceiling, signage.

   WHERE THE ARENA COMES FROM: the numbers all live in maps.js, which the
   SERVER reads too. This file only turns one of those map definitions into
   geometry, through `buildArena(map)` — which can run again, so the arena
   is swappable at runtime rather than welded in place at page load. The
   server names the map in its `welcome`, and `ensureMap()` rebuilds if it is
   not the one already standing.

   Three things a rebuild has to get right, all of them learned here:
   materials are CACHED by name (a rebuild must not re-download the
   photoscans), geometry that is thrown away is DISPOSED, and `colliders` /
   `wallMeshes` are emptied in place rather than reassigned — other files
   hold a reference to those same two arrays.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after maps.js and core.js and before models.js, and
   anything it references at load time must already have run. Function
   declarations hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Procedural textures (no asset files needed) ---- */
function canvasTex(draw, w=128, h=128, rx=1, ry=1){
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); return t; }
function speckle(g,w,h,n,alpha){ for(let i=0;i<n;i++){ g.fillStyle=`rgba(${Math.random()<0.5?0:255},${Math.random()<0.5?0:255},${Math.random()<0.5?0:255},${alpha})`;
  g.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5); } }
const floorTex = canvasTex((g,w,h)=>{ g.fillStyle='#94947f'; g.fillRect(0,0,w,h); speckle(g,w,h,500,0.05);
  g.strokeStyle='rgba(60,60,50,0.35)'; g.lineWidth=2; g.strokeRect(1,1,w-2,h-2); }, 128,128, 30,30);
const crateTex = canvasTex((g,w,h)=>{ g.fillStyle='#8a6b45'; g.fillRect(0,0,w,h);
  for(let i=0;i<4;i++){ g.fillStyle=i%2?'#82653f':'#8f7049'; g.fillRect(0,i*h/4,w,h/4);
    g.strokeStyle='rgba(40,25,10,0.5)'; g.lineWidth=2; g.strokeRect(0,i*h/4,w,h/4); }
  g.strokeStyle='rgba(30,20,8,0.7)'; g.lineWidth=5; g.strokeRect(2,2,w-4,h-4);
  g.strokeStyle='rgba(255,220,160,0.12)'; g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h); g.stroke(); }, 128,128, 1,1);
const wallTex = canvasTex((g,w,h)=>{ g.fillStyle='#5a6472'; g.fillRect(0,0,w,h); speckle(g,w,h,400,0.05);
  g.strokeStyle='rgba(25,30,38,0.5)'; g.lineWidth=2;
  for(let y=0;y<h;y+=32) for(let x=0;x<w;x+=64) g.strokeRect(x+((y/32)%2)*32-32, y, 64, 32); }, 128,128, 10,2);
const blockTex = canvasTex((g,w,h)=>{ g.fillStyle='#6b7280'; g.fillRect(0,0,w,h); speckle(g,w,h,350,0.06);
  g.strokeStyle='rgba(30,34,42,0.5)'; g.lineWidth=3; g.strokeRect(3,3,w-6,h-6);
  g.fillStyle='rgba(255,209,90,0.55)'; g.fillRect(0,h-10,w,4); }, 128,128, 2,1);
const pillarTex = canvasTex((g,w,h)=>{ g.fillStyle='#707a88'; g.fillRect(0,0,w,h); speckle(g,w,h,300,0.05);
  g.strokeStyle='rgba(35,40,50,0.6)'; g.lineWidth=2;
  g.strokeRect(6,6,w-12,h-12); g.strokeRect(14,14,w-28,h-28);
  g.fillStyle='rgba(20,24,30,0.5)'; [16,w-20].forEach(x=>[16,h-20].forEach(y=>g.fillRect(x,y,5,5))); }, 128,128, 1,1);
/* Photoscanned PBR materials (Poly Haven, CC0): color + normal + roughness maps */
const texLoader = new THREE.TextureLoader();
function pbr(prefix, rx, ry, extra={}){
  const d=texLoader.load(`assets/${prefix}_diff.jpg`), n=texLoader.load(`assets/${prefix}_nor_gl.jpg`), r=texLoader.load(`assets/${prefix}_rough.jpg`);
  [d,n,r].forEach(t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); });
  d.encoding = THREE.sRGBEncoding;
  return new THREE.MeshStandardMaterial(Object.assign({ map:d, normalMap:n, roughnessMap:r }, extra));
}

/* ---- Materials by NAME, built once and kept ----
   Boxes in maps.js name their material ('crate', 'block', 'pillar', 'wall')
   instead of carrying a hex colour the client used to look a material up by.
   The cache matters on a rebuild: pbr() starts three texture downloads per
   call, so building the arena twice without it would fetch every photoscan
   again. Textures tile by WORLD metre (see `texRepeat`), so a map of a
   different size keeps the same grain rather than stretching it. */
const MAT_CACHE = {};
/* Every arena material is STANDARD now, including the two that were Lambert.
   Lambert cannot see `scene.environment` at all — no envMap, no specular — so
   with the graded look on, the painted blocks and pillars were the only
   things in the room that stayed flat, which read as a bug rather than a
   style. The cost is a slightly heavier shader on a handful of boxes.
   `lookTag` carries each material's two personalities: the graded figures
   (real roughness, some metal on the painted steel) and the flat ones, which
   are the old values with metalness pinned at 0. */
function arenaMat(name){
  if (MAT_CACHE[name]) return MAT_CACHE[name];
  let m;
  switch (name) {
    case 'crate':  m = lookTag(pbr('crate', 1, 1),                          // real worn wood planks
                     { metalness:0,    roughness:0.82 }, { metalness:0, roughness:1 }); break;
    case 'block':  m = lookTag(new THREE.MeshStandardMaterial({ map: blockTex, roughness:0.95, metalness:0 }),
                     { metalness:0.35, roughness:0.55 }, { metalness:0, roughness:0.95 }); break;
    case 'pillar': m = lookTag(new THREE.MeshStandardMaterial({ map: pillarTex, roughness:0.95, metalness:0 }),
                     { metalness:0.25, roughness:0.62 }, { metalness:0, roughness:0.95 }); break;
    case 'wall':   m = lookTag(pbr('wall', 12, 1.2),                        // real scanned concrete
                     { metalness:0,    roughness:0.88 }, { metalness:0, roughness:1 }); break;
    /* The power station's kinds. Only the FLAT look reads these: it draws
       every box as a plain box and has no plant to put on it, so concrete
       is the wall's concrete and everything else is one of the two painted
       steels. The lit arena builds each kind properly (LIT_DRAW). */
    case 'plinth': case 'firewall':                    m = arenaMat('wall');   break;
    case 'transformer': case 'switch': case 'machine': m = arenaMat('pillar'); break;
    case 'hidden': case 'column':                      m = arenaMat('block');  break;
    default:       m = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
  }
  return (MAT_CACHE[name] = m);
}

/* ---- The arena ----
   ARENA and WH are read by loop.js (the position clamp) and session.js (bot
   placement), so they stay globals — but they are `let`, because a map may
   be a different size. Both are rewritten by buildArena.
   `colliders` and `wallMeshes` are emptied in place and never reassigned:
   effects.js, input.js, loop.js and session.js all hold this same array. */
let ARENA = 60;
let WH = 8;
let currentMap = null;
const colliders = [], wallMeshes = [];
const arenaParts = [];            // everything buildArena made, so it can be undone
let floor = null, ceiling = null;
let resupplyRing = null;

/* `userData.flat` marks the ORIGINAL arena: what LOOK: FLAT draws, and what
   every ray is tested against in either look. `userData.lit` (lighting.js)
   marks its lit twin, which is only ever looked at. arenaVis() shows one
   set or the other; anything carrying neither flag is in both. */
function addBox(x,y,z,w,h,d,matName){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), arenaMat(matName));
  m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; scene.add(m);
  m.userData.flat = true;
  wallMeshes.push(m); arenaParts.push(m);
  colliders.push({minx:x-w/2,minz:z-d/2,maxx:x+w/2,maxz:z+d/2,miny:y-h/2,maxy:y+h/2}); return m; }

/* Tiling in world metres, so the photoscans look the same on any map size.
   Foundry is 120m across and was authored at 16 repeats, hence 7.5m a tile. */
function texRepeat(metres, metresPerTile){ return metres / metresPerTile; }

/* Throw the current arena away. Geometry is per-build so it is disposed;
   MATERIALS are cached and shared, so they are deliberately left alone —
   except a sign's, which owns a canvas texture built for that one sign. */
function clearArena(){
  for (const o of arenaParts) {
    scene.remove(o);
    if (o.geometry) o.geometry.dispose();
    if (o.userData.ownMaterial && o.material) {
      /* All three maps, not just the colour: the floor and roof are
         photoscans built per map, and their normal and roughness textures
         were left on the GPU by every rebuild. The lit floor shares these
         with the flat one, so each is disposed twice, which is harmless. */
      for (const k of ['map', 'normalMap', 'roughnessMap']) if (o.material[k]) o.material[k].dispose();
      o.material.dispose();
    }
  }
  arenaParts.length = 0;
  colliders.length = 0;
  wallMeshes.length = 0;
  floor = ceiling = resupplyRing = null;
}

/* Build one map's geometry. Safe to call again: it clears first. */
function buildArena(map){
  clearArena();
  currentMap = map;
  ARENA = map.arena; WH = map.wallH;
  const span = ARENA * 2;

  /* Floor. Photoscanned concrete; metalness stays 0 because there is no
     environment map to reflect (see the Gotchas in CLAUDE.md). */
  floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span),
    lookTag(pbr('floor', texRepeat(span, 7.5), texRepeat(span, 7.5), { roughness:0.9, metalness:0.0 }),
      { metalness:0.08, roughness:0.62 }, { metalness:0, roughness:0.9 }));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
  floor.userData.ownMaterial = true;      // its repeat is map-sized, so not cacheable
  floor.userData.flat = true;
  scene.add(floor); arenaParts.push(floor);

  /* Perimeter: four 2m-thick walls on the boundary, built from the SAME
     mapWallRects() the server builds its collision from rather than from four
     addBox calls carrying their own numbers. Those two agreed everywhere
     except the CORNERS — the server's walls ran a metre past each end and the
     client's stopped dead — so there was a metre of wall at each corner that
     stopped a bullet on one side and not the other. Deriving the mesh from
     the rect means the box you see is the box that is tested, by
     construction. These ARE colliders, unlike the roof. */
  for (const w of mapWallRects(map)) {
    addBox((w.minx + w.maxx)/2, (w.miny + w.maxy)/2, (w.minz + w.maxz)/2,
           w.maxx - w.minx, w.maxy - w.miny, w.maxz - w.minz, 'wall');
  }

  /* Roof. castShadow is deliberately left OFF — a shadow-casting lid between
     the key light and the arena would drop the whole room into black. It is the
     walls and crates that cast, not the ceiling. */
  ceiling = new THREE.Mesh(new THREE.PlaneGeometry(span, span),
    pbr('wall', texRepeat(span, 6), texRepeat(span, 6), { roughness:0.95, metalness:0.0, color:0x6a7079 }));
  ceiling.rotation.x = Math.PI/2; ceiling.position.y = WH;
  ceiling.userData.ownMaterial = true;
  ceiling.userData.flat = true;
  scene.add(ceiling); arenaParts.push(ceiling);
  // arrows and bullets have to stop at the roof like anything else; it is in
  // wallMeshes (3D raycasts only) but NOT in colliders, which is 2D movement
  wallMeshes.push(ceiling);

  /* Ceiling lamps: unlit geometry, not lights. They read as the source of the
     room's light without adding a single real light to the scene — which is the
     point, because with no tone mapping a grid of point lights would burn the
     floor to white. */
  const L = map.lamps;
  if (L) {
    const lampMat = MAT_CACHE.lamp || (MAT_CACHE.lamp = new THREE.MeshBasicMaterial({ color:0xffe8cc }));
    const lampGeo = new THREE.PlaneGeometry(L.w, L.d);
    for(let gx=-L.reach; gx<=L.reach; gx++) for(let gz=-L.reach; gz<=L.reach; gz++){
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.rotation.x = Math.PI/2;
      lamp.position.set(gx*L.spacing, WH-0.06, gz*L.spacing);
      lamp.userData.flat = true;
      scene.add(lamp); arenaParts.push(lamp);
    }
  }

  /* Cover. Every box sits on the floor, so y is half its height. */
  for (const b of map.boxes) addBox(b.x, b.h/2, b.z, b.w, b.h, b.d, b.mat);

  /* Resupply marker: a ring on the floor around the centre crate, so the
     pickup is somewhere you can see rather than a secret radius. Unlit and
     flat, like the fire pools. */
  const rs = map.resupply || { x:0, z:0 };
  resupplyRing = new THREE.Mesh(new THREE.RingGeometry(4.5, 5.0, 48),
    new THREE.MeshBasicMaterial({ color:0x27ff9e, transparent:true, opacity:0.35,
      side:THREE.DoubleSide, depthWrite:false }));
  resupplyRing.rotation.x = -Math.PI/2; resupplyRing.position.set(rs.x, 0.03, rs.z);
  resupplyRing.userData.ownMaterial = true;
  scene.add(resupplyRing); arenaParts.push(resupplyRing);

  for (const s of (map.signs || [])) addSign(s);
  /* The lit twin of everything above (lighting.js). It is handed the flat
     floor and roof materials so it can reuse their textures, which already
     carry this map's tiling. */
  litBuildArena(map, floor.material, ceiling.material);
  /* A rebuild makes fresh meshes, which default to visible — so a map
     change from the menu would drop the arena back in behind the panels
     unless this has the last word. */
  arenaVis();
}

/* Which arena is on screen: none at the menu, otherwise the flat one or the
   lit one according to LOOK. Hidden is not the same as gone — a hidden mesh
   is still ray-tested, which is exactly what the flat boxes are for while
   the lit ones are drawn. */
function arenaVis(){
  const lit = !!SETTINGS.look && LIT_OK;
  for (const o of arenaParts) {
    const u = o.userData;
    o.visible = !menuBackdropOn && (u.lit ? lit : u.flat ? !lit : true);
  }
}

/* The server names the map it is simulating; only rebuild when it differs
   from what is already standing, because a rebuild costs every box's
   geometry. Target practice never connects, so it keeps the default. */
function ensureMap(id){
  const m = mapById(id);
  if (currentMap && currentMap.id === m.id) return false;
  buildArena(m);
  return true;
}


/* ---- The menu's own set ----
   The menu used to be staged in the ARENA: you stood in the map you were
   about to play, which made the backdrop busy, lit it like a warehouse and
   meant the screen changed character every time the map did. This is a
   small studio built for the one job — a lit backdrop, a floor pad to stand
   the operator on and two strip lights to edge him — and it swaps in for the
   arena whenever a menu is up.

   Everything here is UNLIT (MeshBasic) except the floor pad, which is
   Lambert so the spotlight's shadow actually lands on it. No new lights:
   with no tone mapping, another real light in here would blow the floor out
   the way the ceiling lamps would in the arena. The glow is painted into
   the textures instead. */
const menuSet = new THREE.Group();
menuSet.position.set(0, 0, 32);              // the podium's own spot
(function buildMenuSet(){
  /* Backdrop: nearly black, with one pool of crimson low behind the
     character and the corners pulled down. The first cut lit the whole wall
     and the operator had nothing to stand out against — he was exactly as
     bright as the room. Contrast is the job here, not detail. */
  const back = canvasTex((g,w,h)=>{
    const sky = g.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'#05060a'); sky.addColorStop(0.6,'#0c0f16'); sky.addColorStop(1,'#050608');
    g.fillStyle=sky; g.fillRect(0,0,w,h);
    const glow = g.createRadialGradient(w*0.5,h*0.76,8, w*0.5,h*0.76,w*0.30);
    glow.addColorStop(0,'rgba(255,45,74,0.30)'); glow.addColorStop(0.45,'rgba(255,45,74,0.09)');
    glow.addColorStop(1,'rgba(255,45,74,0)');
    g.fillStyle=glow; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(255,255,255,0.030)'; g.lineWidth=2;      // faint panel seams
    for(let x=0;x<w;x+=72){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); }
    /* Vignette, painted in rather than lit: the frame has to fall off at the
       edges or the wall competes with the UI panels sitting on top of it. */
    const vig = g.createRadialGradient(w*0.5,h*0.6,w*0.18, w*0.5,h*0.6,w*0.62);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.92)');
    g.fillStyle=vig; g.fillRect(0,0,w,h);
  }, 512, 256, 1, 1);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 15),
    new THREE.MeshBasicMaterial({ map: back, fog:false }));
  wall.position.set(0, 5.6, -7.2); menuSet.add(wall);

  /* Floor pad: bright under the podium, black by the edges, so he stands on
     something without a room having to exist around him. Lambert and
     receiveShadow, or the spotlight would throw his shadow onto nothing. */
  const pad = canvasTex((g,w,h)=>{
    g.fillStyle='#000'; g.fillRect(0,0,w,h);
    const r = g.createRadialGradient(w/2,h/2,8, w/2,h/2,w*0.42);
    r.addColorStop(0,'#2b2f37'); r.addColorStop(0.40,'#14161b');
    r.addColorStop(1,'#000'); g.fillStyle=r; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(255,255,255,0.040)'; g.lineWidth=2;       // a light floor grid
    for(let i=0;i<=8;i++){ const t=i*w/8;
      g.beginPath(); g.moveTo(t,0); g.lineTo(t,h); g.stroke();
      g.beginPath(); g.moveTo(0,t); g.lineTo(w,t); g.stroke(); }
    g.strokeStyle='rgba(255,45,74,0.26)'; g.lineWidth=5;          // and a ring round the stand
    g.beginPath(); g.arc(w/2,h/2,w*0.21,0,Math.PI*2); g.stroke();
  }, 512, 512, 1, 1);
  const floorPad = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
    new THREE.MeshLambertMaterial({ map: pad }));
  floorPad.rotation.x = -Math.PI/2; floorPad.position.set(0, 0.012, 0);
  floorPad.receiveShadow = true; menuSet.add(floorPad);

  /* Two short strips at his shoulders, and nothing else. They are geometry,
     not lights, exactly like the arena's ceiling panels — what they are for
     is the bloom pass, which is where the sheen along the armour comes from.
     They were twice this long and ran above his head, which read as
     scaffolding rather than lighting. */
  const strip = (x, y, z, w, h, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, fog:false }));
    m.position.set(x, y, z); menuSet.add(m); return m;
  };
  strip(-3.6, 1.5, -4.2, 0.09, 2.6, 0xd8324a);
  strip( 3.6, 1.5, -4.2, 0.09, 2.6, 0xd8324a);
})();
scene.add(menuSet);

/* Which world is on screen. The menu's set and the arena are never both up:
   buildArena() has to honour this too, or changing map from the menu puts
   the arena back on screen behind the panels. */
let menuBackdropOn = true;
function setMenuBackdrop(on){
  menuBackdropOn = on;
  menuSet.visible = on;
  arenaVis();
  litLights();        // the studio and the arena light their figures differently (lighting.js)
  /* Walking into the arena: whatever is left of the light bake has to be
     done before the first frame of it, not finished behind your back. */
  if (!on) litBakeFinishNow();
}

/* ---- Health potions ----
   Five a round, scattered, each gone once anybody takes it. The server owns
   where they are and whether they are still there; this only draws them.
   A floor ring like the resupply marker so it reads at a distance, plus a
   small bobbing vial so it is obvious what it is. Unlit and depthWrite off,
   matching the other pickups.
   Not part of the arena: they survive a map rebuild, since the server places
   them per round and nothing about them is map geometry. */
const potionFX = [];
function makePotion(){
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 28),
    new THREE.MeshBasicMaterial({ color:0xff5a7a, transparent:true, opacity:0.45,
      side:THREE.DoubleSide, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.03; g.add(ring);
  const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 10),
    new THREE.MeshBasicMaterial({ color:0xff3d63, transparent:true, opacity:0.92 }));
  vial.position.y = 0.75; g.add(vial);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8),
    new THREE.MeshBasicMaterial({ color:0xeaf0f5 }));
  cap.position.y = 1.02; g.add(cap);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.01),
    new THREE.MeshBasicMaterial({ color:0xffffff }));
  cross.position.set(0, 0.76, 0.2); g.add(cross);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.01),
    new THREE.MeshBasicMaterial({ color:0xffffff }));
  cross2.position.set(0, 0.76, 0.2); g.add(cross2);
  g.traverse(o => { o.renderOrder = 860; });
  g.visible = false; scene.add(g);
  return g;
}
/* Server says where. Reuses the meshes rather than rebuilding each round. */
function setPotions(at){
  while (potionFX.length < at.length) potionFX.push(makePotion());
  potionFX.forEach((g, i) => {
    if (i < at.length) { g.position.set(at[i].x, 0, at[i].z); g.userData.live = true; }
    else { g.visible = false; g.userData.live = false; }
  });
  if (!at.length) potionFX.forEach(g => { g.visible = false; g.userData.live = false; });
}
/* One bit per potion: still there, or taken for the round. */
function updatePotions(mask){
  potionFX.forEach((g, i) => { g.visible = !!g.userData.live && !!(mask & (1 << i)); });
}
/* A slow bob and spin, so they catch the eye across the arena. */
function animatePotions(t){
  for (const g of potionFX) {
    if (!g.visible) continue;
    g.rotation.y = t * 0.8;
    g.children[1].position.y = 0.75 + Math.sin(t * 2 + g.position.x) * 0.07;
  }
}

/* Three states, because the crate holds two prizes on different timers.
   Bright green: cash still there. Dimmer green: cash gone but the ammo is
   up. Grey: the ammo is on its 30s cooldown and there is nothing to come
   for. */
function setResupplyState(cashTaken, ammoIn){
  if(!resupplyRing) return;
  const ready = !ammoIn;
  resupplyRing.material.color.setHex(ready ? 0x27ff9e : 0x5a636e);
  resupplyRing.material.opacity = !ready ? 0.14 : (cashTaken ? 0.26 : 0.4);
}
function setResupplyClaimed(taken){ setResupplyState(taken, 0); }   // older callers

/* ---- Range signage (canvas-drawn planes on the walls) ----
   A map's `signs` entry names the artwork and says where to hang it; the
   drawing and the panel size live here, with the rest of the look. */
function signMesh(draw, w, h, cw=512, ch=256){
  const c=document.createElement('canvas'); c.width=cw; c.height=ch; draw(c.getContext('2d'),cw,ch);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding;
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshLambertMaterial({ map:t }));
}
const SIGN_ART = {
  rules: { w:7, h:3.5, draw:(g,w,h)=>{
    g.fillStyle='#1c1e22'; g.fillRect(0,0,w,h);
    g.strokeStyle='#3a3e46'; g.lineWidth=10; g.strokeRect(5,5,w-10,h-10);
    g.fillStyle='#f2f4f6'; g.font='bold 52px Arial'; g.fillText('LIVE FIRE RANGE', 30, 70);
    g.font='26px Arial'; g.fillStyle='#c9ced6';
    ['• KEEP FIREARMS POINTED DOWNRANGE','• FINGER OFF TRIGGER UNTIL READY','• KNOW YOUR TARGET AND BEYOND']
      .forEach((s,i)=> g.fillText(s, 34, 125+i*42));
  }},
  dist: { w:4, h:2, draw:(g,w,h)=>{
    g.fillStyle='#4a4f58'; g.fillRect(0,0,w,h);
    g.strokeStyle='#2a2d33'; g.lineWidth=14; g.strokeRect(7,7,w-14,h-14);
    g.fillStyle='#f2f4f6'; g.font='bold 150px Arial'; g.textAlign='center'; g.fillText('10M', w/2, h/2+55);
  }},
  b2: { w:3, h:1.5, transparent:true, draw:(g,w,h)=>{
    g.clearRect(0,0,w,h); g.fillStyle='#d9b23a'; g.font='bold 170px Arial'; g.textAlign='center'; g.fillText('B-2 →', w/2, h/2+60);
  }},

  /* ---- The power station's ---- */
  /* The end window: a wall of small panes in a steel grid, daylight behind
     it. It is drawn unlit and bright, so the bloom makes it glare the way a
     window at the end of a dark hall does. */
  window: { w:44, h:8, cw:1024, ch:256, glow:true, draw:(g,w,h)=>{
    const sky=g.createLinearGradient(0,0,0,h); sky.addColorStop(0,'#f4f8ff'); sky.addColorStop(0.7,'#cfdcec'); sky.addColorStop(1,'#93a6ba');
    g.fillStyle=sky; g.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){ g.fillStyle=`rgba(40,52,66,${Math.random()*0.22})`; g.fillRect(((Math.random()*44)|0)*w/44, ((Math.random()*10)|0)*h/10, w/44, h/10); }   // dirty and replaced panes
    g.fillStyle='#0c0e11'; for(let i=0;i<=44;i++) g.fillRect(i*w/44-1,0,2,h); for(let j=0;j<=10;j++) g.fillRect(0,j*h/10-1,w,2);
    for(let i=0;i<=44;i+=4) g.fillRect(i*w/44-4,0,8,h); g.fillRect(0,0,w,6); g.fillRect(0,h-6,w,6); g.fillRect(0,h/2-3,w,6);
  }},
  unit1: unitBoard(1), unit2: unitBoard(2),
  /* The sign every substation fence carries. */
  hv: { w:1.5, h:1.5, cw:256, ch:256, draw:(g,w,h)=>{
    g.fillStyle='#14161a'; g.fillRect(0,0,w,h);
    g.fillStyle='#d2a51f'; g.fillRect(8,8,w-16,h-16);
    g.fillStyle='#14161a'; g.beginPath(); g.moveTo(w/2,26); g.lineTo(w-52,150); g.lineTo(52,150); g.closePath(); g.fill();
    g.fillStyle='#d2a51f'; g.beginPath();                                    // the bolt
    g.moveTo(w/2+10,52); g.lineTo(w/2-20,104); g.lineTo(w/2-2,104); g.lineTo(w/2-14,140); g.lineTo(w/2+22,90); g.lineTo(w/2+4,90); g.closePath(); g.fill();
    g.fillStyle='#14161a'; g.textAlign='center'; g.font='bold 34px Arial'; g.fillText('DANGER', w/2, 192);
    g.font='bold 21px Arial'; g.fillText('HIGH VOLTAGE', w/2, 222);
  }},
  /* The control room, seen from the hall floor as a band of lit windows high
     on the wall. `glow` draws it unlit, at its own brightness: a window is a
     light, not something the hall's lamps shine on. */
  control: { w:18, h:2.8, cw:1024, ch:160, glow:true, draw:(g,w,h)=>{
    g.fillStyle='#07080a'; g.fillRect(0,0,w,h);
    const bays=6, bw=(w-20)/bays;
    for(let i=0;i<bays;i++){ const x=10+i*bw+5, ww=bw-10;
      const room=g.createLinearGradient(0,14,0,h-14);
      room.addColorStop(0,'#7b6a4a'); room.addColorStop(0.55,'#4f4634'); room.addColorStop(1,'#1c1a16');
      g.fillStyle=room; g.fillRect(x,14,ww,h-28);
      g.fillStyle='rgba(255,236,190,0.55)'; g.fillRect(x+ww*0.12,18,ww*0.76,5);            // a strip light in the ceiling
      for(let m=0;m<3;m++){ const mx=x+ww*(0.12+m*0.28), my=h*0.42;                         // monitors on the desk
        g.fillStyle='#08090b'; g.fillRect(mx-2,my-2,ww*0.22+4,30+4);
        g.fillStyle = (i+m)%3===0 ? '#2fc7a0' : (i+m)%3===1 ? '#3aa0d8' : '#c9a23a'; g.fillRect(mx,my,ww*0.22,30);
        g.fillStyle='rgba(0,0,0,0.35)'; for(let r=0;r<4;r++) g.fillRect(mx+3,my+4+r*7,ww*0.22-6-(r*9%17),2); }
      g.fillStyle='#0b0c0e'; g.fillRect(x,h-14-34,ww,34);                                   // the desk, in silhouette
      g.fillStyle='rgba(255,255,255,0.05)'; g.fillRect(x,14,ww*0.35,h-28);                  // a reflection in the glass
    }
    g.fillStyle='#101216'; for(let i=0;i<=bays;i++) g.fillRect(10+i*bw-5,0,10,h);          // mullions
    g.fillRect(0,0,w,14); g.fillRect(0,h-14,w,14);
  }},
  /* The mimic board: the station's single-line diagram, lit. Generators on
     the left, their transformers, a double busbar, feeders out to the four
     yard transformers. A closed breaker is red and an open one green, which
     is the convention, and the reverse of what anyone expects. */
  mimic: { w:14, h:3.5, cw:1024, ch:256, glow:true, draw:(g,w,h)=>{
    g.fillStyle='#090b0e'; g.fillRect(0,0,w,h);
    g.strokeStyle='#2a2f37'; g.lineWidth=6; g.strokeRect(3,3,w-6,h-6);
    g.fillStyle='#8a94a2'; g.font='bold 15px Arial'; g.fillText('STATION SINGLE-LINE DIAGRAM  ·  220 / 15.75 kV', 22, 28);
    const line=(x0,y0,x1,y1,c,lw)=>{ g.strokeStyle=c; g.lineWidth=lw||3; g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke(); };
    const brk=(x,y,closed)=>{ g.fillStyle=closed?'#ff3b30':'#30e070'; g.fillRect(x-7,y-7,14,14); };
    const B1=96, B2=126;                                                       // the two busbars
    line(250,B1,w-40,B1,'#e8a020',5); line(250,B2,w-40,B2,'#e8a020',5);
    g.fillStyle='#e8a020'; g.font='bold 12px Arial'; g.fillText('BUS A', w-88, B1-9); g.fillText('BUS B', w-88, B2+20);
    [[70,'G1',B1],[190,'G2',B2]].forEach(([y,name,bus],i)=>{                   // generator, its transformer, onto a bus
      const gy = i ? 200 : 62;
      g.strokeStyle='#dfe6ee'; g.lineWidth=3; g.beginPath(); g.arc(60,gy,20,0,7); g.stroke();
      g.fillStyle='#dfe6ee'; g.font='bold 16px Arial'; g.fillText(name,49,gy+6);
      line(80,gy,128,gy,'#dfe6ee'); g.beginPath(); g.arc(142,gy,14,0,7); g.stroke(); g.beginPath(); g.arc(160,gy,14,0,7); g.stroke();
      line(174,gy,214,gy,'#dfe6ee'); brk(214,gy,true); line(221,gy,268+i*26,gy,'#dfe6ee'); line(268+i*26,gy,268+i*26,bus,'#dfe6ee');
    });
    for(let i=0;i<4;i++){ const x=380+i*150, up=i%2===0, y=up?40:212;         // four feeders to the yard
      line(x,up?B1:B2,x,y+(up?34:-34),'#dfe6ee'); brk(x,up?B1-28:B2+28,i!==2);
      g.strokeStyle='#dfe6ee'; g.lineWidth=3; g.beginPath(); g.arc(x,y+(up?22:-22),12,0,7); g.stroke(); g.beginPath(); g.arc(x,y+(up?6:-6),12,0,7); g.stroke();
      g.fillStyle='#8a94a2'; g.font='bold 13px Arial'; g.fillText('TX-'+(i+1), x+20, y+(up?12:-4));
      g.fillStyle='#3aa0d8'; g.font='12px Arial'; g.fillText(i===2?'0 MW':(48+i*7)+' MW', x+20, y+(up?28:12));
    }
    line(330,B1,330,B2,'#dfe6ee'); brk(330,(B1+B2)/2,true);                    // bus coupler
  }},
};
/* A unit's name board, hung on the end wall behind its machine. */
function unitBoard(n){
  return { w:10, h:2.5, cw:1024, ch:256, draw:(g,w,h)=>{
    g.fillStyle='#14171b'; g.fillRect(0,0,w,h);
    g.strokeStyle='#2c313a'; g.lineWidth=10; g.strokeRect(5,5,w-10,h-10);
    g.fillStyle='#c0263c'; g.fillRect(34,40,14,h-80);
    g.fillStyle='#f0f3f6'; g.font='bold 150px Arial'; g.fillText('UNIT '+n, 70, 178);
    g.fillStyle='#aeb6c0'; g.font='bold 30px Arial'; g.fillText('TURBINE-GENERATOR SET', 600, 100);
    g.font='26px Arial'; g.fillStyle='#8a94a2';
    g.fillText('220 MW  ·  3000 RPM', 600, 146); g.fillText('15.75 kV  ·  50 Hz', 600, 184);
  }};
}
function addSign(s){
  const art = SIGN_ART[s.kind]; if (!art) return;
  const m = signMesh(art.draw, art.w, art.h, art.cw, art.ch);
  if (art.glow) {                                  // self-lit: swap the lit material for an unlit one on the same picture
    const lit = m.material; m.material = new THREE.MeshBasicMaterial({ map: lit.map, fog: false }); lit.dispose();
  }
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = (s.ry || 0) * Math.PI / 180;
  if (art.transparent) m.material.transparent = true;
  m.userData.ownMaterial = true;          // its canvas texture is this sign's alone
  scene.add(m); arenaParts.push(m);
}

/* Stand the default arena up at load, so the menu has a world behind it and
   target practice is playable without ever talking to a server. */
buildArena(mapById(DEFAULT_MAP));
