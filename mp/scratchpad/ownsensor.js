/* Probe: Silvars can shoot his OWN sensor; his own dog still ignores his fire.
   node scratchpad/ownsensor.js (server up) */
const { io } = require('socket.io-client');
const URL = 'http://localhost:8200', sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => { const j = await (await fetch(URL + '/rooms')).json(); const r = (j.rooms || j).find(x => x.id === code); return r ? r.phase : 'gone'; };
(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const mk = (n, a) => io(URL, { auth: { tok: 'p-' + n + Date.now(), room: code, agent: a }, transports: ['websocket'] });
  const S = mk('S', 'silvars'), V = mk('V', 'blast'); let robots = [], pos = null;
  S.on('robots', l => robots = l); S.on('welcome', d => pos = d.spawn);
  await sleep(1000); S.emit('buy', { w: 0 });
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  await sleep(300);
  S.emit('sensor', { dx: 0, dy: -1, dz: -0.2 }); await sleep(300);
  const s = robots.find(r => r.k === 's'); console.log('sensor placed:', !!s);
  if (s) {
    // shoot it from 1.6m up where Silvars stands, straight at it
    const me = robots.length && { x: s.x, z: s.z + 0.3 };
    const ox = s.x, oy = s.y + 1.2, oz = s.z + 0.5, dx = s.x - ox, dy = s.y - oy, dz = s.z - oz, L = Math.hypot(dx, dy, dz);
    S.emit('fire', { w: 0, ox, oy, oz, dx: dx / L, dy: dy / L, dz: dz / L }); await sleep(400);
    console.log('sensor after own shot:', robots.filter(r => r.k === 's').length);
  }
  S.emit('dog'); await sleep(600);
  const g = robots.find(r => r.k === 'g');
  if (g) { const ox = g.x + 2, oy = 1.4, oz = g.z, dx = g.x - ox, dy = 0.55 - oy, dz = g.z - oz, L = Math.hypot(dx, dy, dz);
    await sleep(200); S.emit('fire', { w: 0, ox, oy, oz, dx: dx / L, dy: dy / L, dz: dz / L }); await sleep(400);
    console.log('own dog hp after own shot:', (robots.find(r => r.k === 'g') || {}).h); }
  S.close(); V.close(); process.exit(0);
})();
