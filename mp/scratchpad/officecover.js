/* Probe: does the offices' new furniture work as cover, on the SERVER's
   own geometry? (2026-11-23)
   1. Shots: a ray at chest-and-below height across a desk cluster, a
      filing cabinet and a chair stops on it (rayBoxes are mapRects minus
      the shots-pass kinds); a ray over the desks at head height does not.
   2. Bodies: a player's 0.4m radius cannot stand where a cabinet stands.
   3. Spawns: 3000 server spawns, none inside any furniture or any box.
   Run from mp/ with the server up:  node scratchpad/officecover.js */
const { io } = require('socket.io-client');
const { mapById, mapRects } = require('../public/maps.js');
const URL = process.env.URL || 'http://localhost:8200';
const m = mapById('works'), R = mapRects(m), rays = R.filter(r => !r.glass);
const FURN = new Set(['chair', 'chairn', 'cabinet', 'printer', 'cooler', 'plant', 'desk', 'screen']);
const furn = m.boxes.filter(b => FURN.has(b.mat));

function hit(o, d, maxT){                      // nearest box a ray o + t d (0 < t < maxT) enters
  let best = null;
  for (const r of rays){
    let t0 = 0, t1 = maxT, ok = true;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, r.minx, r.maxx], [o.y, d.y, r.miny, r.maxy], [o.z, d.z, r.minz, r.maxz]]){
      if (Math.abs(dd) < 1e-9){ if (oo < lo || oo > hi){ ok = false; break; } continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1){ ok = false; break; }
    }
    if (ok && (!best || t0 < best.t)) best = { t: t0, r };
  }
  return best;
}
const boxAt = (r) => m.boxes.find(b => Math.abs(b.x - (r.minx + r.maxx) / 2) < 0.01 && Math.abs(b.z - (r.minz + r.maxz) / 2) < 0.01 &&
                                       Math.abs((b.y || 0) - r.miny) < 0.01);
const shot = (label, a, b) => {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L = Math.hypot(d.x, d.y, d.z);
  const h = hit(a, { x: d.x / L, y: d.y / L, z: d.z / L }, L);
  const what = h ? (boxAt(h.r) || { mat: '?' }).mat : 'nothing';
  console.log(label.padEnd(58), h ? `stopped by ${what} at ${h.t.toFixed(2)}m` : 'passes');
};
console.log('furniture boxes on the server:', furn.length, '| in mapRects:', R.length, 'rects');
const F1 = 3.9;
shot('first floor, crouched shot across a desk cluster (y +0.6)', { x: 62.4, y: F1 + 0.6, z: 81.4 }, { x: 62.4, y: F1 + 0.6, z: 89.6 });
shot('first floor, standing shot over the desks (y +1.6)',      { x: 62.4, y: F1 + 1.6, z: 81.4 }, { x: 62.4, y: F1 + 1.6, z: 89.6 });
shot('ground floor, shot along the west wall at a cabinet',      { x: 59.95, y: 0.8, z: 84.0 }, { x: 59.95, y: 0.8, z: 80.6 });
shot('top floor, low shot at a chair (y +0.7)',                  { x: 60.5, y: 2 * F1 + 0.7, z: 82.05 }, { x: 65.5, y: 2 * F1 + 0.7, z: 82.05 });

// bodies: a 0.4m player at a cabinet's centre overlaps it?
const cab = furn.find(b => b.mat === 'cabinet' && !(b.y > 0));
const inside = R.some(r => !r.glass && 59.95 + 0.4 > r.minx && 59.95 - 0.4 < r.maxx && cab.z + 0.4 > r.minz && cab.z - 0.4 < r.maxz && r.miny < 1.8 && r.maxy > 0.1);
console.log('a body at a ground-floor cabinet collides:', inside);

// spawns
(async () => {
  const code = (await (await fetch(URL + '/rooms/new?map=works')).json()).code;
  let n = 0, bad = 0, inFurn = 0;
  for (let i = 0; i < 60; i++){
    const sp = await new Promise(res => {
      const s = io(URL, { auth: { tok: 'oc-' + i + '-' + Date.now(), room: code, agent: 'aseed' }, transports: ['websocket'] });
      const done = v => { try { s.close(); } catch(e){} res(v); };
      s.on('welcome', d => done(d.spawn)); setTimeout(() => done(null), 3000);
    });
    if (!sp) continue; n++;
    const y = sp.y || 0;
    if (R.some(r => sp.x + 0.4 > r.minx && sp.x - 0.4 < r.maxx && sp.z + 0.4 > r.minz && sp.z - 0.4 < r.maxz && r.miny < y + 1.7 && r.maxy > y + 0.05)) bad++;
    if (furn.some(b => Math.abs(sp.x - b.x) < b.w / 2 + 0.4 && Math.abs(sp.z - b.z) < b.d / 2 + 0.4 && (b.y || 0) <= y + 0.1 && (b.y || 0) + b.h > y)) inFurn++;
  }
  console.log(`spawns: ${n} sampled, ${bad} inside geometry, ${inFurn} inside furniture`);
  process.exit(0);
})();
