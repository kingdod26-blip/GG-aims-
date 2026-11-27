/* Probe: Linked Sight lights an enemy only through Silvars' robots, for 2s,
   then 20s before it can again. node scratchpad/linkcd.js (server up) */
const { io } = require('socket.io-client');
const URL = 'http://localhost:8200', sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => { const j = await (await fetch(URL + '/rooms')).json(); const r = (j.rooms || j).find(x => x.id === code); return r ? r.phase : 'gone'; };
(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const mk = (n, a) => io(URL, { auth: { tok: 'p-' + n + Date.now(), room: code, agent: a }, transports: ['websocket'] });
  const S = mk('S', 'silvars'), V = mk('V', 'blast'); let link = null; const log = [];
  let sp = null, vp = null;
  S.on('welcome', d => sp = d.spawn); V.on('welcome', d => vp = d.spawn);
  S.on('linked', d => { link = d; });
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  // both walk to a clear lane: Silvars at (-100,19) facing -z, victim at (-100,9)
  const walk = (s, from, to, yaw) => new Promise(res => { let p = { ...from }; const t = setInterval(() => {
    const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz), k = Math.min(d, 0.6) / (d || 1);
    p.x += dx * k; p.z += dz * k; s.emit('state', { x: p.x, z: p.z, y: 0, yaw, pitch: 0, st: 0 });
    if (d < 0.05) { clearInterval(t); res(); } }, 33); });
  await sleep(500);
  await Promise.all([walk(S, sp, { x: -100, z: 19 }, 0), walk(V, vp, { x: -100, z: 9 }, 0)]);
  await sleep(1500);
  console.log('Silvars looking at the victim, no robots -> lit:', link && link.l.length, 'readyIn', link && link.r);
  S.emit('drone'); await sleep(1200);
  console.log('drone out -> lit:', link && link.l.length, 'until', link && link.u, 'readyIn', link && link.r);
  await sleep(2500);
  console.log('3.7s later -> lit:', link && link.l.length, 'readyIn', link && link.r, '(expect 0 lit, ~18-19s)');
  S.close(); V.close(); process.exit(0);
})();
