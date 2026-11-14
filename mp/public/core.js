/* =============================================================
   Crimson X — core.js  (1 of 10 in load order)

   Boot: scene, backdrop, camera, lights, post-processing, graphics settings.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after the Three.js bundles and before world.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
   ============================================================= */

/* ==================== Crimson X — unified client ====================
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
const hemi = new THREE.HemisphereLight(0x8c9bb0, 0x1b1e24, 0.55);
const sun = new THREE.DirectionalLight(0xffeccf, 0.85); sun.position.set(25,55,18); sun.castShadow = true;
scene.add(hemi);
sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,far:170}); scene.add(sun);


/* ===================== THE LOOK (branch: jack/lighting) =====================
   An environment to reflect, a filmic curve, and a grade — the three things
   that separate this from a lit-but-flat browser scene, and the three that
   Saltline spends most of its shader budget on.

   This reverses a deliberate decision, so it is behind a switch. CLAUDE.md
   records that tone mapping and the HDR environment were REMOVED, and that
   `metalness` has to stay at 0 as a consequence: metal with nothing to
   reflect renders black. That is true — of a scene with no environment. Give
   it one and the constraint lifts, which is why these three arrive together
   and leave together. `SETTINGS.look` is 0 for the old flat look and 1 for
   this, so the two can be compared in the same session rather than from
   memory.

   What this is NOT: Saltline's PCSS shadows, its volumetrics, or its
   procedural material library. Those are most of its 1,500 shader lines and
   they are not free on a frame budget shared with five players and a server.
   ------------------------------------------------------------------------ */
/* The grade can only grade what the lights give it. A flat 0.55 hemisphere
   against a 0.85 key lights every face of every crate to nearly the same
   value, and no curve recovers contrast that was never there — which is
   why the first pass with tone mapping alone barely read. The graded look
   therefore drops the ambient, raises and warms the key, and buys the
   brightness back with exposure. The environment then fills the shadows,
   which is the job it is actually for. */
const LOOK = { exposure: 1.45, envIntensity: 1.6, pmremSigma: 0.04,
               hemi: 0.22, sun: 1.55, sunColor: 0xffe2b4,
               flatHemi: 0.55, flatSun: 0.85, flatSunColor: 0xffeccf };

/* The environment is a tiny ROOM, rendered once into a PMREM — not a sky.
   Crimson X is indoors: a grey-blue hall with warm panels overhead. What the
   armour should pick up is that room, so the capture is a box with a dim
   cool shell, a floor that bounces, and a grid of warm ceiling panels at the
   same spacing the arena uses. Three colours and nine quads is enough; what
   matters for reflections is the broad distribution of light, not detail. */
function buildEnvScene(){
  const env = new THREE.Scene();
  /* Bright enough to be worth reflecting. The first capture was the arena's
     own dim slate and the Spartan went to a silhouette the moment he had
     metal — polished metal is only as bright as its surroundings, which is
     the same trap as the old "metal renders black with no env", one step on.
     A panel's colour is clamped at 1, so AREA is the only way to make the
     capture brighter: big quads, and a bright band round the top of the
     walls standing in for the room's bounce. */
  const shell = new THREE.Mesh(new THREE.BoxGeometry(26, 13, 26),
    new THREE.MeshBasicMaterial({ color:0x39424e, side:THREE.BackSide }));
  env.add(shell);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26),
    new THREE.MeshBasicMaterial({ color:0x55554a }));
  floor.rotation.x = -Math.PI/2; floor.position.y = -6.4; env.add(floor);
  const lamp = new THREE.MeshBasicMaterial({ color:0xfff4e4 });
  const lampGeo = new THREE.PlaneGeometry(7.5, 3.4);
  for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){
    const p = new THREE.Mesh(lampGeo, lamp);
    p.rotation.x = Math.PI/2; p.position.set(i*8, 6.3, j*8); env.add(p);
  }
  const bandMat = new THREE.MeshBasicMaterial({ color:0x9aa6b4, side:THREE.BackSide });
  const band = new THREE.Mesh(new THREE.BoxGeometry(25.6, 2.6, 25.6), bandMat);
  band.position.y = 4.2; env.add(band);
  return env;
}
/* A material has TWO looks, and this records both at the point the
   material is made, where the numbers are actually known. Reading the
   'flat' values back off the material at toggle time does not work: by
   then they are whatever the last toggle left behind. */
function lookTag(m, graded, flat){
  if(!m) return m;
  m.userData.look = graded;
  m.userData.flat = flat || { metalness:0, roughness:m.roughness };
  return m;
}
let envRT = null;
function environmentTexture(){
  if(envRT) return envRT.texture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildEnvScene();
  envRT = pmrem.fromScene(envScene, LOOK.pmremSigma);
  pmrem.dispose();
  /* The capture scene is thrown away, but its geometry and materials are
     not disposed by anyone else. */
  envScene.traverse(o => { if(o.geometry) o.geometry.dispose();
                           if(o.material) o.material.dispose(); });
  return envRT.texture;
}

/* Turning the look on or off changes how every standard material compiles
   (an env map is a #define), so they all need `needsUpdate`. Missing that
   leaves the old shader in place and the change only appears on whatever
   happens to be rebuilt next. */
function applyLook(){
  const on = !!SETTINGS.look;
  renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = on ? LOOK.exposure : 1;
  scene.environment = on ? environmentTexture() : null;
  hemi.intensity = on ? LOOK.hemi : LOOK.flatHemi;
  sun.intensity  = on ? LOOK.sun  : LOOK.flatSun;
  sun.color.setHex(on ? LOOK.sunColor : LOOK.flatSunColor);
  if(typeof gradePass !== 'undefined' && gradePass) gradePass.enabled = on;
  /* The viewmodel keeps two skins per mesh (models.js); give anything that
     has loaded since last time its second one before choosing. */
  if(typeof lookifyViewmodel === 'function' && typeof gun !== 'undefined') lookifyViewmodel(gun);
  scene.traverse(o => {
    if(!o.isMesh || !o.material) return;
    if(o.userData.lookMats) o.material = on ? o.userData.lookMats.lit : o.userData.lookMats.flat;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if(!m || !m.isMeshStandardMaterial) return;
      /* A lit-arena material sets its own share of the room's reflection
         (userData.envK, lighting.js): a wall wants almost none of it, bare
         steel wants most of it, and one number for everything was wrong
         for both. */
      m.envMapIntensity = on ? (m.userData.envK != null ? m.userData.envK : LOOK.envIntensity) : 1;
      /* Metal is the whole reason the environment is here. A material that
         declares a graded look gets it; anything else is forced to
         metalness 0, which is the old rule and still right with no env. */
      const g = m.userData.look, f = m.userData.flat;
      if(g && f){
        m.metalness = on ? (g.metalness != null ? g.metalness : m.metalness) : f.metalness;
        if(g.roughness != null) m.roughness = on ? g.roughness : f.roughness;
      } else if(!on) m.metalness = 0;
      m.needsUpdate = true;
    });
  });
  /* The lit arena swaps in with the look: which set of meshes is drawn, the
     shadow box, the fog. Guarded because this first runs from the bottom of
     this file, before lighting.js has been read. */
  if(typeof litApplyLook === 'function') litApplyLook(on);
}

/* Models arrive whenever their download finishes, which is after the look
   was applied at boot. Their graded metalness is only recorded by lookTag,
   not set, so without another pass a freshly loaded Spartan or sniper sat at
   metalness 0 until something unrelated (a resize, a settings click) happened
   to re-apply it. Several files land close together, so this waits a moment
   and does it once. */
let lookTimer = 0;
function lookSoon(){ clearTimeout(lookTimer); lookTimer = setTimeout(applyLook, 80); }

/* The grade, as one pass after the bloom. Everything here is a display-space
   tweak of what the renderer already produced: no extra geometry, no second
   scene render, one full-screen triangle's worth of work.
   Split tone first (teal in the shadows, warm in the highlights) because it
   is what makes a flat grey room read as a lit photograph; then an S-curve
   for contrast, lifted blacks so the darks are not dead, saturation, a
   vignette, animated grain weighted toward the shadows (bright pixels do not
   look noisy), and a last ordered dither against banding in the gradients —
   which is where 8-bit output shows first. */
/* It also smooths edges. `antialias:true` on the renderer only covers the
   canvas itself, and the moment a composer is in the chain the scene is
   drawn into a render target that has none — so with bloom or the look on,
   every crate edge was a staircase. This is FXAA: find where brightness
   steps sharply, work out which way the edge runs from the four diagonal
   neighbours, and blend ALONG it. One pass, and flat areas return after
   five samples. `uPx` is one pixel of the target, set in applySettings. */
const GradeShader = {
  uniforms: { tDiffuse:{ value:null }, uTime:{ value:0 },
              uPx:{ value:new THREE.Vector2(1/1280, 1/720) },
              uVig:{ value:0.62 }, uGrain:{ value:0.04 },
              uSat:{ value:1.12 }, uContrast:{ value:0.26 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uSat, uContrast; uniform vec2 uPx;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 smoothEdges(){
      vec3 m  = texture2D(tDiffuse, vUv).rgb;
      float lNW = luma(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uPx).rgb);
      float lNE = luma(texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * uPx).rgb);
      float lSW = luma(texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * uPx).rgb);
      float lSE = luma(texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * uPx).rgb);
      float lM = luma(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;          // no edge here
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float damp = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + damp), -8.0, 8.0) * uPx;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb
                    + texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb
                               + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = luma(b);
      return (lB < lMin || lB > lMax) ? a : b;                        // the wide blend left the edge: use the narrow one
    }
    void main(){
      vec3 c = smoothEdges();
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.88, 1.0, 1.07), vec3(1.07, 1.0, 0.91), smoothstep(0.12, 0.78, l));
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);     // gentle S-curve
      c += vec3(0.004, 0.008, 0.012);                      // lifted, slightly teal blacks
      c = mix(vec3(l), c, uSat);
      vec2 q = vUv - 0.5;
      c *= clamp(1.0 - uVig * dot(q, q) * 1.5, 0.0, 1.0);
      float n = hash(vUv * vec2(1.0, 1.31) + fract(uTime));
      c += (n - 0.5) * uGrain * (0.3 + 0.7 * (1.0 - l));
      c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;          // dither the gradients
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};
let gradePass = null;

/* Post-processing: subtle bloom for sun glare / highlight glow (AAA "graded" feel) */
let composer = null, bloomPass = null;
try {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.82);
  composer.addPass(bloomPass);
  /* Last, so it grades the finished frame rather than something the
     bloom then smears. It is disabled with the look, not removed, so the
     chain's length never changes under the composer. */
  gradePass = new THREE.ShaderPass(GradeShader);
  composer.addPass(gradePass);
} catch(e){ console.warn('[CrimsonX] post-processing unavailable, falling back to direct render', e); composer = null; }

/* ===================== GRAPHICS SETTINGS =====================
   Everything that costs GPU heat is adjustable here. Defaults to
   "Balanced" so the game is cool and quiet out of the box. */
// hitZone is a HUD preference rather than a graphics one, but this is the
// only settings panel, and it saves with the rest. The presets below leave
// it alone on purpose — picking PERFORMANCE shouldn't change your HUD.
const SET_DEFAULTS = { fpsCap:60, resScale:1, bloom:1, shadows:1024, hitZone:1, look:1,
                       showBoxes:0, infAmmo:0, noCooldown:0, noSpread:0 };
/* Training aids. Gated to target practice on purpose — ammo and ability
   charges are client-side, so honouring these in a match would just be a
   cheat switch. */
const training = key => gameMode !== 'mp' && !!SETTINGS[key];
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
  // one pixel of the composer's target, for the edge smoothing in the grade
  if(gradePass) gradePass.uniforms.uPx.value.set(1/Math.max(1, innerWidth*pr), 1/Math.max(1, innerHeight*pr));
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
  /* BLOOM GLOW used to decide whether the composer ran AT ALL (loop.js
     fell back to a direct render), which would silently take the grade
     with it. It switches its own pass now, and the loop uses the composer
     when either wants it. */
  /* Only whether it runs. What it is AIMED AT belongs to litLights(), which
     sets strength/radius/threshold per look and per map and would otherwise
     overwrite anything decided here. */
  if(bloomPass) bloomPass.enabled = !!SETTINGS.bloom;
  applyLook();
  try { localStorage.setItem('botstrike.gfx', JSON.stringify(SETTINGS)); } catch(e){}
}
function applyPreset(name){ Object.assign(SETTINGS, SET_PRESETS[name]); applySettings(); renderSettingsUI(); }
applySettings();
function at(o,x,y,z){ o.position.set(x,y,z); return o; }   // position is read-only, use .set()
