/* =============================================================
   Crimson X — models.js  (4 of 10 in load order)

   Everything with a body: box humanoid, weapon-model loading, the Spartan, podium hero.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after world.js and before weapons.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ---- Humanoid (players, bots, and the home-page character) ---- */
function limb(w,h,d,c){ const p=new THREE.Group(); const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:c})); m.position.y=-h/2; m.castShadow=true; p.add(m); return p; }
function humanoid(uniform){ const g=new THREE.Group();
  const dk = new THREE.Color(uniform).multiplyScalar(0.55).getHex();   // darker shade of the uniform
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.28),new THREE.MeshLambertMaterial({color:uniform})); torso.position.y=1.15; torso.castShadow=true; g.add(torso);
  // chest rig + belt details
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4,0.3,0.06),new THREE.MeshLambertMaterial({color:0x23272e})),0,1.22,0.15));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.05),new THREE.MeshLambertMaterial({color:dk})),-0.12,1.22,0.19));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.05),new THREE.MeshLambertMaterial({color:dk})),0.12,1.22,0.19));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.52,0.08,0.3),new THREE.MeshLambertMaterial({color:0x1c1f24})),0,0.86,0));
  // shoulder pads
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,0.2),new THREE.MeshLambertMaterial({color:dk})),-0.34,1.56,0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,0.2),new THREE.MeshLambertMaterial({color:dk})),0.34,1.56,0));
  // hips, head, visor, helmet
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.46,0.2,0.26),new THREE.MeshLambertMaterial({color:0x2f3238})),0,0.78,0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.26,0.28,0.26),new THREE.MeshLambertMaterial({color:0xe8b48c})),0,1.68,0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.24,0.09,0.04),new THREE.MeshLambertMaterial({color:0x101418, emissive:0x1a3a4a})),0,1.7,0.14));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.14,0.3),new THREE.MeshLambertMaterial({color:0x33383f})),0,1.8,0));
  const la=limb(0.14,0.6,0.14,uniform); la.position.set(-0.34,1.45,0); g.add(la);
  const ra=limb(0.14,0.6,0.14,uniform); ra.position.set(0.34,1.45,0.06); g.add(ra);
  ra.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.55),new THREE.MeshLambertMaterial({color:0x17181c})),0,-0.5,0.16));
  const ll=limb(0.17,0.75,0.17,0x394048); ll.position.set(-0.13,0.7,0); g.add(ll);
  const rl=limb(0.17,0.75,0.17,0x394048); rl.position.set(0.13,0.7,0); g.add(rl);
  // boots
  [ll,rl].forEach(L=> L.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.19,0.12,0.26),new THREE.MeshLambertMaterial({color:0x14161a})),0,-0.72,0.04)));
  g.userData={la,ra,ll,rl,walk:0}; return g; }

/* ---- First-person gun ---- */
const gun = new THREE.Group();
// five viewmodel slots (keys 1-5): rifle, sniper, shotgun, pistol, animated pistol
const WEAPON_MODELS = [
  { url:'assets/rifle.fbx',   type:'fbx', len:0.60, ry:0 },
  { url:'assets/sniper.glb',  type:'glb', len:0.85, ry:Math.PI },   // flipped — faced backwards
  { url:'assets/shotgun.fbx', type:'fbx', len:0.55, ry:0 },
  { url:'assets/pistol2.fbx', type:'fbx', len:0.35, ry:0 },
  { url:'assets/pistol.fbx',  type:'fbx', len:0.35, ry:0 },
];
gun.position.set(0.3,-0.28,-0.55); camera.add(gun); scene.add(camera); gun.visible=false;
let gunKick=0, sprintAmt=0, stanceAmt=0;

/* Several of these FBX exports reference textures that aren't in the download:
   the crossbow wants a CreativeTrio palette JPG, and the Sketchfab Spartan asks
   for three .dds IBL cubemaps. We re-material the first and deliberately run
   with no environment map at all (no tone mapping here, so an envMap would
   only blow things out), and the browser was 404ing on all of them. Point those
   lookups at a 1px blank instead. */
const BLANK_PX='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const MISSING_TEX=/(\.fbm[\/]|\.dds(\?|$))/i;
const fbxTexMgr=new THREE.LoadingManager();
fbxTexMgr.setURLModifier(u=> MISSING_TEX.test(u) ? BLANK_PX : u);

/* Generic weapon-model loader: normalize size, center, auto-orient long axis
   forward (plus per-model ry flip, and an optional rx to lay an upright model
   down), then drop into its slot. */
/* Highest vertex within `band` metres of the holder's centreline, in the
   space of the holder's parent (the weapon slot, which sits at the gun
   origin). Falls back when a model has no vertices in the slice. */
function centrelineTop(holder, fallback, band = 0.004){
  holder.updateMatrixWorld(true);
  const toSlot = new THREE.Matrix4().copy(holder.parent.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const cx = holder.position.x; let top = -Infinity;
  holder.traverse(o=>{
    const pos = o.isMesh && o.geometry && o.geometry.attributes.position;
    if(!pos) return;
    m.multiplyMatrices(toSlot, o.matrixWorld);
    for(let k = 0; k < pos.count; k++){
      v.fromBufferAttribute(pos, k).applyMatrix4(m);
      if(Math.abs(v.x - cx) < band && v.y > top) top = v.y;
    }
  });
  return top > -Infinity ? top : fallback;
}
function fitWeaponModel(model, tune){
  model.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.frustumCulled=false;
    // There is no environment map in this scene by design, and metal with
    // nothing to reflect renders black. The sniper's GLB shipped at
    // metalness 0.4, which left its receiver dark no matter the lighting.
    /* The file's own metalness is remembered rather than thrown away: with
       an environment to reflect it is correct, and without one it is black.
       lookTag keeps both and applyLook picks. */
    const ms=Array.isArray(o.material)?o.material:[o.material];
    ms.forEach(m=>{ if(m && m.metalness){
      lookTag(m, { metalness:m.metalness }, { metalness:0, roughness:m.roughness });
      m.metalness=0; m.needsUpdate=true; } });
  } });
  const bbox=new THREE.Box3().setFromObject(model);
  const size=new THREE.Vector3(); bbox.getSize(size);
  const center=new THREE.Vector3(); bbox.getCenter(center);
  const s=tune.len/(Math.max(size.x,size.y,size.z)||1);
  model.scale.setScalar(s);
  model.position.copy(center).multiplyScalar(-s);
  let ry=tune.ry; if(tune.autoOrient!==false && size.x>size.z) ry+=Math.PI/2;
  const holder=new THREE.Group(); holder.add(model);
  holder.rotation.set(tune.rx||0, ry, 0);
  holder.position.set(0.02,-0.03,0.05);
  return { holder, size };
}
/* ---- The viewmodel's second skin ----
   The gun is the one object on screen in every frame, and it was the last
   thing in the room still drawn the old way. The weapon files ship as Phong
   materials that are almost black with a pure white highlight, which under
   one directional light gives exactly two tones: black, and wherever the
   highlight happens to land. That is why the rifle read as a black-and-
   white placeholder however the arena around it was lit.

   So each of those gets a physically-based twin, built from the material's
   NAME where the file has a meaningful one (the Quaternius guns call theirs
   Metal, DarkMetal, Wood, Main…) and from its colour where it does not (the
   crossbow, grenade and blade are built in code with no names). Steel is
   metal and fairly smooth, so it shows the room's lamps sliding over it as
   you turn; the furniture is a dark polymer that is no longer pure black,
   so the gun has a shape; wood is wood.

   Both skins are kept on the mesh (`userData.lookMats`) and applyLook picks
   one. LOOK: FLAT therefore draws the original materials, untouched. */
const VM_NAMED = [      // first match wins, so the more specific names come first
  [/dark(er)?metal/i, 0x26282c, 0.90, 0.38],
  [/lightmetal/i,     0x7b7e84, 0.95, 0.30],
  [/metal/i,          0x484b50, 0.92, 0.34],
  [/darkwood/i,       0x2a180e, 0.00, 0.60],
  [/wood/i,           0x3d2413, 0.00, 0.56],
  [/maindark/i,       0x0c0d0f, 0.00, 0.54],
  [/mainlight/i,      0x1a1c1f, 0.00, 0.50],
  [/main/i,           0x121416, 0.00, 0.52],
  [/magazine/i,       0x17181b, 0.55, 0.44],
  [/black/i,          0x09090b, 0.00, 0.64],
];
const VM_CACHE = new Map();
function vmLitMaterial(src){
  let spec = null;
  for(const [re, color, metalness, roughness] of VM_NAMED)
    if(re.test(src.name || '')){ spec = { color, metalness, roughness }; break; }
  if(!spec){
    /* No name to go on. Near-neutral and not warm is bare metal, brighter
       meaning more polished; a saturated yellow is brass; anything else is
       paint, wood or rubber. */
    const c = src.color, hsl = {}; c.getHSL(hsl);
    const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b), warm = hsl.h < 0.17;
    if(chroma < 0.075 && !warm) spec = { color:c.getHex(), metalness: hsl.l > 0.5 ? 0.92 : 0.70, roughness: hsl.l > 0.5 ? 0.25 : 0.42 };
    else if(warm && hsl.h > 0.09 && chroma > 0.3) spec = { color:c.getHex(), metalness:0.90, roughness:0.35 };
    else spec = { color:c.getHex(), metalness:0, roughness:0.58 };
  }
  const m = new THREE.MeshStandardMaterial(spec);
  m.name = src.name; m.side = src.side; m.transparent = src.transparent; m.opacity = src.opacity;
  if(src.map) m.map = src.map;
  if(src.emissive) m.emissive.copy(src.emissive);
  m.skinning = !!src.skinning;
  /* At 1.3 the room's cool shell washed over everything and a black rifle
     came out an even blue-grey, like a toy. The furniture has to stay dark
     for the steel to read against it. */
  m.userData.envK = 0.8;
  return m;
}
/* Safe to call again: a mesh that already has both skins is skipped, so
   this is run on the whole viewmodel every time the look is applied and
   simply picks up whatever has loaded since. */
function lookifyViewmodel(root){
  const old = m => m && (m.isMeshPhongMaterial || m.isMeshLambertMaterial);
  root.traverse(o=>{
    if(!o.isMesh || o.userData.lookMats) return;
    const many = Array.isArray(o.material), src = many ? o.material : [o.material];
    if(!src.some(old)) return;
    const lit = src.map(m=>{ if(!old(m)) return m;
      if(!VM_CACHE.has(m)) VM_CACHE.set(m, vmLitMaterial(m));
      return VM_CACHE.get(m); });
    o.userData.lookMats = { flat:o.material, lit: many ? lit : lit[0] };
  });
}

/* The guns are drawn in code now (drawn.js); nothing is loaded here. */

/* The Spartan is the PLAYER avatar — it's what you are, and what everyone
   else sees of you. Bots deliberately stay as the cheap box humanoids: they're
   stationary targets, so the detail would be wasted, and boxes keep eight of
   them nearly free. Falls back to a box player until the FBX arrives. */
let spartanTpl = null;
function makeSpartan(){
  return (THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(spartanTpl) : spartanTpl.clone());
}
function newPlayerMesh(color){ return spartanTpl ? makeSpartan() : humanoid(color); }
function newBotMesh(){ return humanoid(0x8a3030); }
/* Spartan Armour MKV (Halo Reach) by McCarthy3D — Sketchfab, CC-BY.
   FBX ships with detached PBR textures; we attach them by material name. */
// Facing correction for the Spartan model. It faces +Z, and so does the box
// humanoid, and every place we aim an avatar (atan2(dx,dz) for bots, yaw+PI
// for players) already points +Z the right way — so no correction is needed.
// This was Math.PI, which spun him a second time and showed you his back.
const SPARTAN_FACE = 0;
/* A rim of light round a player's outline. Dark armour in front of a dark
   barrier is a shape you find late, and in a duel that is the whole game:
   the edge of a body, where its surface turns away from you, picks up a
   cool highlight, strongest on what faces up, so a figure separates from
   whatever is behind it without being lit any brighter overall.
   One uniform shared by every player material. lighting.js sets it for the
   arena and zeroes it at the menu and in the flat look, so neither changes. */
const RIMU = { uRim: { value: new THREE.Vector3(0, 0, 0) } };
function rimPatch(m){
  m.onBeforeCompile = (shader)=>{
    shader.uniforms.uRim = RIMU.uRim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\nuniform vec3 uRim;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float rimK = pow( 1.0 - clamp( dot( geometry.normal, geometry.viewDir ), 0.0, 1.0 ), 3.0 );
          reflectedLight.indirectSpecular += uRim * rimK * ( 0.55 + 0.45 * inverseTransformDirection( geometry.normal, viewMatrix ).y ); }`);
  };
  return m;
}
const SPARTAN_MATS = ['ODST_Shoulder_Mat','Spartan_Arms_Mat','Spartan_Chest_Mat','Spartan_Ears_Mat','Spartan_Helmet_Mat','Spartan_Legs_Mat','Spartan_Undersuit_Mat'];
const SPARTAN_ALIASES = { 'spartan_ear_mat':'Spartan_Ears_Mat', 'spartan_shoulders_mat':'ODST_Shoulder_Mat' };
function spartanMaterial(name){
  const aliased = name && SPARTAN_ALIASES[name.toLowerCase().trim()];
  const prefix = aliased || SPARTAN_MATS.find(p => name && name.toLowerCase().includes(p.toLowerCase()));
  if (prefix){
    const L=(suf,srgb)=>{ const t=texLoader.load(`assets/spartan_tex/${prefix}_${suf}.jpg`); if(srgb) t.encoding=THREE.sRGBEncoding; return t; };
    return lookTag(rimPatch(new THREE.MeshStandardMaterial({ map:L('BaseColor',1), normalMap:L('Normal'),
      roughnessMap:L('Roughness'), metalness:0.0, roughness:1.0 })),
      { metalness:0.40, roughness:0.95 }, { metalness:0, roughness:1.0 });   // painted armour, not chrome
  }
  if (name && name.toLowerCase().includes('lambert')){   // visor / misc with opacity
    const t=texLoader.load('assets/spartan_tex/lambert1_Colour-Opacity.png'); t.encoding=THREE.sRGBEncoding;
    return lookTag(new THREE.MeshStandardMaterial({ map:t, transparent:true, roughness:0.5, metalness:0.0 }),
      { metalness:0.72, roughness:0.22 }, { metalness:0, roughness:0.5 });   // the visor
  }
  return null;
}
/* The operator is drawn in code now (drawn.js), which replaces
   newPlayerMesh and newBotMesh; no model file is loaded. */

/* ---- Health bars over the practice bots ----
   Two unlit planes above the head. The bots keep their own heading now, so
   the bar turns itself to face the camera each frame: it is a child of the
   bot, so its local yaw is the world yaw to the camera MINUS the bot's own.
   Being a child also means it is disposed along with the bot's mesh. */
const BAR_W = 1.0, BAR_H = 0.12;
function makeHealthBar(){
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, BAR_H),
    new THREE.MeshBasicMaterial({ color:0x0d1117, transparent:true, opacity:0.8, depthWrite:false }));
  const fw = BAR_W - 0.06, fh = BAR_H - 0.05;
  const fillGeo = new THREE.PlaneGeometry(fw, fh);
  fillGeo.translate(fw/2, 0, 0);                  // pivot on the left, so it drains rightward
  const fill = new THREE.Mesh(fillGeo,
    new THREE.MeshBasicMaterial({ color:0x27ff9e, depthWrite:false }));
  fill.position.set(-fw/2, 0, 0.002);
  g.add(back); g.add(fill);
  g.userData = { fill };
  g.position.y = 2.15;                            // just above a 1.9m bot
  return g;
}
/* Called each frame while in target practice. */
function updateBotHealthBars(){
  for(const b of localBots){
    if(!b.mesh) continue;
    if(!b.bar){ b.bar = makeHealthBar(); b.mesh.add(b.bar); }
    const frac = Math.max(0, Math.min(1, (b.hp||0)/100));
    const fill = b.bar.userData.fill;
    fill.scale.x = frac;
    fill.visible = frac > 0;
    fill.material.color.setHex(frac > 0.5 ? 0x27ff9e : frac > 0.25 ? 0xffb648 : 0xff4d4d);
    b.bar.visible = !!b.alive;
    b.bar.rotation.y = Math.atan2(camera.position.x - b.x, camera.position.z - b.z) - b.mesh.rotation.y;
  }
}

/* ---- Hitbox overlay (target practice only) ----
   Draws the actual spheres hitZone tests against, so you can see where the
   head ends and the torso begins rather than inferring it from damage
   numbers. Colours match the hit marker: red head, white torso, blue limbs,
   plus an amber cylinder at CORE_R showing where a body hit stops being the
   torso and becomes an arm. Built from the same HITBOX table, so it cannot
   drift away from what actually gets tested. */
const BOX_COLOR = { head:0xff5a5a, body:0xffffff, upper:0xffffff, legs:0x7fc4ff };
function makeHitboxOverlay(){
  const g = new THREE.Group();
  const wire = c => new THREE.MeshBasicMaterial({ color:c, wireframe:true,
    transparent:true, opacity:0.35, depthWrite:false });
  for(const key of ['head','body','upper','legs']){
    const [dy, r] = HITBOX[key][0];                 // standing
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), wire(BOX_COLOR[key]));
    m.position.y = dy; g.add(m);
  }
  // the torso / arm split is a distance from the spine, not a sphere
  const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R[0], CORE_R[0], 1.6, 16, 1, true),
    wire(0xffb648));
  core.position.y = 1.05; g.add(core);
  g.traverse(o=>{ o.renderOrder = 870; });
  return g;
}
function updateHitboxOverlay(){
  const on = !!SETTINGS.showBoxes && gameMode !== 'mp';
  for(const b of localBots){
    if(!b.mesh) continue;
    if(on && !b.boxes){ b.boxes = makeHitboxOverlay(); b.mesh.add(b.boxes); }
    if(b.boxes) b.boxes.visible = on && !!b.alive;
  }
}

/* ---- Home-page character: podium + spotlight showcase ---- */
const BRAND = 0xff2d4a;                 // matches --ac in style.css
let hero = humanoid(BRAND); hero.position.set(0,0.12,32); scene.add(hero);
const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,0.12,32),
  new THREE.MeshLambertMaterial({ color:0x1a1013 })); podium.position.set(0,0.06,32); podium.receiveShadow=true; scene.add(podium);
const podiumRing = new THREE.Mesh(new THREE.TorusGeometry(1.12,0.03,8,40),
  new THREE.MeshBasicMaterial({ color:BRAND })); podiumRing.rotation.x=Math.PI/2; podiumRing.position.set(0,0.13,32); scene.add(podiumRing);
const spot = new THREE.SpotLight(0xffffff, 1.6, 30, 0.5, 0.5); spot.position.set(2,7,36); spot.castShadow=true;
spot.target = hero; scene.add(spot); scene.add(spot.target);
const heroGroup = [hero, podium, podiumRing, spot];   // hidden when the match starts
