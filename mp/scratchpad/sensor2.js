/* Probe: Silvars' sensor holds two charges on the server, and a third is refused.
   node scratchpad/sensor2.js (server up) */
const { io } = require('socket.io-client');
const URL = 'http://localhost:8200', sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => { const j = await (await fetch(URL + '/rooms')).json(); const r = (j.rooms || j).find(x => x.id === code); return r ? r.phase : 'gone'; };
(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const mk = (n, a) => io(URL, { auth: { tok: 'p-' + n + Date.now(), room: code, agent: a }, transports: ['websocket'] });
  const S = mk('S', 'silvars'), V = mk('V', 'blast'); let last = null, robots = [];
  S.on('silv', d => last = d); S.on('robots', l => robots = l);
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  const place = async () => { S.emit('sensor', { dx: 0, dy: -1, dz: -0.2 }); await sleep(250); return { q: last && last.sensorQ.length, out: robots.filter(r => r.k === 's').length }; };
  console.log('1st', await place()); console.log('2nd', await place()); console.log('3rd (refused)', await place());
  S.close(); V.close(); process.exit(0);
})();
