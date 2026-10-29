/* =============================================================
   Bot Strike — core.js  (1 of 9 in load order)

   Boot: scene, backdrop, camera, lights, post-processing, graphics settings.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after the Three.js bundles and before world.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ==================== Bot Strike — unified client ====================
   States: 'home' → 'mode' → 'playing'. Modes: 'bots' (local, stationary
   targets, offline) or 'mp' (networked, shared world). New movement:
   jump onto crates, crouch (C), prone (Z). */

const canvas = document.getElementById('game');
// requestPointerLock() returns a promise that rejects if the document can't
// take the lock (embedded/unfocused frames) — swallow it so it doesn't spam.
function lockPointer(){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
/* Indoors. No sky at all: the backdrop is a flat dark colour and the fog is
   on the SAME value, so distance just falls off into unlit depth with no
   horizon line. Change BACKDROP alone to retint it — if the fog and the
   background ever differ you get a visible seam where the fog stops.
   Everything is lit as a hall: a dim cool bounce plus one warm overhead key.
   Still no tone mapping and no envMap, so keep intensities modest and leave
   metalness at 0 — and do NOT add point lights for the ceiling lamps; the
   glowing panels below are unlit geometry precisely so they can't blow the
   floor out to white discs. */
const BACKDROP = 0x0e1116;
scene.background = new THREE.Color(BACKDROP);
scene.fog = new THREE.Fog(BACKDROP, 42, 135);
const camera = new THREE.PerspectiveCamera(80, innerWidth/innerHeight, 0.05, 500);
scene.add(new THREE.HemisphereLight(0x8c9bb0, 0x1b1e24, 0.55));
const sun = new THREE.DirectionalLight(0xffeccf, 0.85); sun.position.set(25,55,18); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,far:170}); scene.add(sun);

/* Post-processing: subtle bloom for sun glare / highlight glow (AAA "graded" feel) */
let composer = null;
try {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.82);
  composer.addPass(bloom);
} catch(e){ console.warn('[BotStrike] post-processing unavailable, falling back to direct render', e); composer = null; }

/* ===================== GRAPHICS SETTINGS =====================
   Everything that costs GPU heat is adjustable here. Defaults to
   "Balanced" so the game is cool and quiet out of the box. */
// hitZone is a HUD preference rather than a graphics one, but this is the
// only settings panel, and it saves with the rest. The presets below leave
// it alone on purpose — picking PERFORMANCE shouldn't change your HUD.
const SET_DEFAULTS = { fpsCap:60, resScale:1, bloom:1, shadows:1024, hitZone:1 };
const SET_PRESETS = {
  performance: { fpsCap:30, resScale:0.75, bloom:0, shadows:0    },
  balanced:    { fpsCap:60, resScale:1,    bloom:1, shadows:1024 },
  quality:     { fpsCap:0,  resScale:2,    bloom:1, shadows:2048 },
};
let SETTINGS = Object.assign({}, SET_DEFAULTS);
try { const s=JSON.parse(localStorage.getItem('botstrike.gfx')||'null'); if(s) Object.assign(SETTINGS, s); } catch(e){}

function applySettings(){
  // resolution scale — the biggest heat lever (2x = 4x the pixels)
  const pr = Math.max(0.5, Math.min(SETTINGS.resScale, devicePixelRatio||1));
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if(composer){
    if(composer.setPixelRatio) composer.setPixelRatio(pr);
    composer.setSize(innerWidth, innerHeight);
  }
  // shadows: off / 1024 / 2048
  const q = SETTINGS.shadows|0;
  const wasEnabled = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = q > 0;
  if(q > 0){
    sun.shadow.mapSize.set(q,q);
    if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }   // force rebuild at new size
  }
  // toggling shadowMap.enabled needs materials recompiled
  if(wasEnabled !== renderer.shadowMap.enabled){
    scene.traverse(o=>{ if(o.isMesh && o.material)
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ if(m) m.needsUpdate=true; }); });
  }
  try { localStorage.setItem('botstrike.gfx', JSON.stringify(SETTINGS)); } catch(e){}
}
function applyPreset(name){ Object.assign(SETTINGS, SET_PRESETS[name]); applySettings(); renderSettingsUI(); }
applySettings();
function at(o,x,y,z){ o.position.set(x,y,z); return o; }   // position is read-only, use .set()
