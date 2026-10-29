/* =============================================================
   Bot Strike — world.js  (2 of 9 in load order)

   The arena: procedural + photoscanned materials, floor, walls, ceiling, signage.

   These files are CLASSIC scripts sharing ONE global scope, loaded in
   the order index.html lists them. That order is the whole contract:
   this file runs after core.js and before models.js, and anything it
   references at load time must already have run. Function declarations
   hoist and are safe anywhere; a top-level const is not.
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
const MAT_BY_COLOR = {
  0x8a6b45: pbr('crate', 1, 1),                     // real worn wood planks
  0x6b7280: new THREE.MeshLambertMaterial({ map: blockTex }),
  0x707a88: new THREE.MeshLambertMaterial({ map: pillarTex }),
  0x5a6472: pbr('wall', 12, 1.2),                   // real scanned concrete wall
};

/* ---- Arena (identical to the server) ---- */
const ARENA = 60;
const colliders = [], wallMeshes = [];
function addBox(x,y,z,w,h,d,color){
  const mat = MAT_BY_COLOR[color] || new THREE.MeshLambertMaterial({color});
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; scene.add(m); wallMeshes.push(m);
  colliders.push({minx:x-w/2,minz:z-d/2,maxx:x+w/2,maxz:z+d/2,miny:y-h/2,maxy:y+h/2}); return m; }
/* Wet, sky-reflecting concrete floor: photoscanned maps + strong reflections */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2,ARENA*2),
  pbr('floor', 16, 16, { roughness:0.9, metalness:0.0 }));
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
/* Resupply marker: a ring on the floor around the centre crate, so the
   pickup is somewhere you can see rather than a secret radius. Unlit and
   flat, like the fire pools. */
let resupplyRing = null;
(function makeResupplyRing(){
  resupplyRing = new THREE.Mesh(new THREE.RingGeometry(4.5, 5.0, 48),
    new THREE.MeshBasicMaterial({ color:0x27ff9e, transparent:true, opacity:0.35,
      side:THREE.DoubleSide, depthWrite:false }));
  resupplyRing.rotation.x = -Math.PI/2; resupplyRing.position.set(0, 0.03, 0);
  scene.add(resupplyRing);
})();
/* Green while the round's cash is still there, grey once somebody has taken
   it — ammo still works, but there is no longer a reason to race for it. */
function setResupplyClaimed(taken){
  if(!resupplyRing) return;
  resupplyRing.material.color.setHex(taken ? 0x5a636e : 0x27ff9e);
  resupplyRing.material.opacity = taken ? 0.18 : 0.35;
}
const WH=8;
addBox(0,WH/2,-ARENA,ARENA*2,WH,2,0x5a6472); addBox(0,WH/2,ARENA,ARENA*2,WH,2,0x5a6472);
addBox(-ARENA,WH/2,0,2,WH,ARENA*2,0x5a6472); addBox(ARENA,WH/2,0,2,WH,ARENA*2,0x5a6472);
/* Roof. castShadow is deliberately left OFF — a shadow-casting lid between
   the key light and the arena would drop the whole room into black. It is the
   walls and crates that cast, not the ceiling. */
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2, ARENA*2),
  pbr('wall', 20, 20, { roughness:0.95, metalness:0.0, color:0x6a7079 }));
ceiling.rotation.x = Math.PI/2; ceiling.position.y = WH; scene.add(ceiling);
// arrows and bullets have to stop at the roof like anything else; it is in
// wallMeshes (3D raycasts only) but NOT in colliders, which is 2D movement
wallMeshes.push(ceiling);
/* Ceiling lamps: unlit geometry, not lights. They read as the source of the
   room's light without adding a single real light to the scene — which is the
   point, because with no tone mapping a grid of point lights would burn the
   floor to white. */
const lampMat = new THREE.MeshBasicMaterial({ color:0xffe8cc });
const lampGeo = new THREE.PlaneGeometry(6, 2.4);
for(let gx=-2; gx<=2; gx++) for(let gz=-2; gz<=2; gz++){
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.rotation.x = Math.PI/2;
  lamp.position.set(gx*24, WH-0.06, gz*24);
  scene.add(lamp);
}
const LAYOUT=[[0,0,6,3,6,0x707a88],[-18,-12,4,2.5,4,0x8a6b45],[18,-12,4,2.5,4,0x8a6b45],[-18,12,4,2.5,4,0x8a6b45],[18,12,4,2.5,4,0x8a6b45],
 [0,-24,12,4,2,0x6b7280],[0,24,12,4,2,0x6b7280],[-30,0,2,4,12,0x6b7280],[30,0,2,4,12,0x6b7280],
 [-10,-30,3,2,3,0x8a6b45],[10,30,3,2,3,0x8a6b45],[-34,-30,5,3,5,0x707a88],[34,30,5,3,5,0x707a88],
 [24,-28,3,2,3,0x8a6b45],[-24,28,3,2,3,0x8a6b45],[12,8,2.5,1.5,2.5,0x8a6b45],[-12,-8,2.5,1.5,2.5,0x8a6b45]];
LAYOUT.forEach(([x,z,w,h,d,c])=>addBox(x,h/2,z,w,h,d,c));

/* ---- Range signage (canvas-drawn planes on the walls) ---- */
function signMesh(draw, w, h, cw=512, ch=256){
  const c=document.createElement('canvas'); c.width=cw; c.height=ch; draw(c.getContext('2d'),cw,ch);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding;
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshLambertMaterial({ map:t }));
}
const rulesSign = signMesh((g,w,h)=>{
  g.fillStyle='#1c1e22'; g.fillRect(0,0,w,h);
  g.strokeStyle='#3a3e46'; g.lineWidth=10; g.strokeRect(5,5,w-10,h-10);
  g.fillStyle='#f2f4f6'; g.font='bold 52px Arial'; g.fillText('LIVE FIRE RANGE', 30, 70);
  g.font='26px Arial'; g.fillStyle='#c9ced6';
  ['• KEEP FIREARMS POINTED DOWNRANGE','• FINGER OFF TRIGGER UNTIL READY','• KNOW YOUR TARGET AND BEYOND']
    .forEach((s,i)=> g.fillText(s, 34, 125+i*42));
}, 7, 3.5);
rulesSign.position.set(-58.9, 3.4, 30); rulesSign.rotation.y = Math.PI/2; scene.add(rulesSign);
const distSign = signMesh((g,w,h)=>{
  g.fillStyle='#4a4f58'; g.fillRect(0,0,w,h);
  g.strokeStyle='#2a2d33'; g.lineWidth=14; g.strokeRect(7,7,w-14,h-14);
  g.fillStyle='#f2f4f6'; g.font='bold 150px Arial'; g.textAlign='center'; g.fillText('10M', w/2, h/2+55);
}, 4, 2);
distSign.position.set(20, 4, -58.9); scene.add(distSign);
const b2Sign = signMesh((g,w,h)=>{
  g.clearRect(0,0,w,h); g.fillStyle='#d9b23a'; g.font='bold 170px Arial'; g.textAlign='center'; g.fillText('B-2 →', w/2, h/2+60);
}, 3, 1.5);
b2Sign.position.set(-58.9, 4.5, 10); b2Sign.rotation.y = Math.PI/2; b2Sign.material.transparent = true; scene.add(b2Sign);
