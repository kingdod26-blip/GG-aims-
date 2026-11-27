/* Probe: fall damage on the server. A Blast and an Aseed each "climb" to 12m
   (fl=1, as on a ladder: no count) in open air, then drop to the ground.
   Expect 70 for a plain 12m fall and 35 for Aseed with a landing roll (fl=4).
   node scratchpad/falldmg.js (server up) */
const { io } = require('socket.io-client');
const URL = 'http://localhost:8200', sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => { const j = await (await fetch(URL + '/rooms')).json(); const r = (j.rooms || j).find(x => x.id === code); return r ? r.phase : 'gone'; };
(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const mk = (n, a) => { const s = io(URL, { auth: { tok: 'p-' + n + Date.now(), room: code, agent: a }, transports: ['websocket'] });
    const c = { s, n, fell: [], hp: null, tp: undefined }; s.on('fell', d => c.fell.push(d)); s.on('kill', d => c.kill = d); return c; };
  const A = mk('A', 'blast'), B = mk('B', 'aseed');
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  await sleep(300);
  // walk each to a clear lane (x -100) far apart, then do the climb and the drop there
  const send = (c, x, y, z, fl) => c.s.emit('state', { x, y, z, yaw: 0, pitch: 0, st: 0, fl });
  async function goto(c, from, to){ let p = { ...from }; for (let i = 0; i < 400; i++){ const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz); if (d < 0.1) break;
    const k = Math.min(d, 0.5) / d; p.x += dx * k; p.z += dz * k; send(c, p.x, 0, p.z, 0); await sleep(33); } return p; }
  // the server put them somewhere at round start; find it from a snapshot-free route: just start where the server says by asking for a forced position (ignore) - use spawn guess
  async function fall(c, x, z, roll){
    for (let y = 0; y <= 12; y += 0.4){ send(c, x, y, z, 1); await sleep(33); }     // up, as on a ladder
    for (let i = 0; i < 5; i++){ send(c, x, 12, z, 0); await sleep(33); }            // let go
    for (let y = 12; y >= 0; y -= 0.45){ send(c, x, y, z, roll ? 4 : 0); await sleep(33); }   // ~13.5 m/s down
    for (let i = 0; i < 6; i++){ send(c, x, 0, z, 0); await sleep(33); }
    await sleep(300);
  }
  // they have to be where the server thinks they are, so walk from where we claim, slowly enough to be believed
  A.p = await goto(A, { x: -100, z: 0 }, { x: -100, z: 0 }); B.p = await goto(B, { x: -100, z: -40 }, { x: -100, z: -40 });
  await sleep(4000);       // the server's position catches up with ours at its own speed limit
  await fall(A, -100, 0, false); await fall(B, -100, -40, true);
  console.log('Blast 12m fall ->', JSON.stringify(A.fell), ' Aseed with landing roll ->', JSON.stringify(B.fell));
  A.s.close(); B.s.close(); process.exit(0);
})();
