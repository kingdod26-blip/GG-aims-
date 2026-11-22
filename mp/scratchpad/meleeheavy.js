/* Probe: the charged cut and the always-advancing combo, on the server.

   B stands 2m in front of A on open ground; nobody else in the room. HP is
   not read directly (the snapshot is binary), so the checks are built so a
   KILL or its absence tells which damage landed:
     1  'melee' heavy with no 'meleeCharge' first       -> refused, no impact
     2  charge held 100ms, then heavy                    -> refused, no impact
     3  four swings aimed AWAY (misses), then one at B   -> impact; with the
        chain moving on through misses that is cut 5 = 70, so B is on 30
     4  charge held ~320ms (a light heavy, ~39), at B    -> KILL. If the misses
        had reset the chain, step 3 was 22 (B on 78) and this would not kill.
   Run from mp/ with the server up:  node scratchpad/meleeheavy.js
*/
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:8200';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => {
  const rooms = await (await fetch(URL + '/rooms')).json();
  const r = (rooms.rooms || rooms).find(x => x.id === code);
  return r ? r.phase : 'gone';
};
function client(name, room) {
  const s = io(URL, { auth: { tok: `probe-${name}-${Date.now()}`, room, agent: 'aseed' }, transports: ['websocket'] });
  const c = { s, name, pos: { x: 0, z: 0 }, want: null, impacts: 0, kills: [] };
  s.on('welcome', d => { c.pos = { x: d.spawn.x, z: d.spawn.z }; c.want = { ...c.pos }; });
  s.on('impact', d => { if (d.by === s.id) c.impacts++; });
  s.on('kill', d => c.kills.push(d));
  return c;
}
function pump(c, hz = 30) {
  return setInterval(() => {
    if (!c.want) return;
    const dx = c.want.x - c.pos.x, dz = c.want.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(d, 19 / hz) / d; c.pos.x += dx * k; c.pos.z += dz * k; }
    c.s.emit('state', { x: c.pos.x, z: c.pos.z, y: 0, yaw: 0, pitch: 0, st: 0, name: c.name, lo: 0 });
  }, 1000 / hz);
}
(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const a = client('A', code), b = client('B', code);
  const pumps = [pump(a), pump(b)];
  await sleep(1200);
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase:', await phaseOf(code));
  a.want = { x: -50, z: 60 }; b.want = { x: -50, z: 58 };
  await sleep(9000);
  console.log('A at', a.pos, 'B at', b.pos);
  const at = (x) => Object.assign({ ox: a.pos.x, oy: 1.6, oz: a.pos.z, dx: 0, dy: -0.2, dz: -1 }, x);
  const away = { dx: 0, dy: 0, dz: 1 };
  const check = async (label, fn, wait = 450) => { const i0 = a.impacts, k0 = a.kills.length; await fn(); await sleep(wait);
    console.log(label.padEnd(44), 'impacts +' + (a.impacts - i0), ' kills +' + (a.kills.length - k0), a.kills.slice(k0).map(k => 'head=' + k.head).join(' ')); };

  await check('1 heavy with no charge', () => a.s.emit('melee', at({ heavy: true })));
  await check('2 heavy after a 100ms hold', async () => { a.s.emit('meleeCharge'); await sleep(100); a.s.emit('melee', at({ heavy: true })); });
  for (let i = 0; i < 4; i++) await check('3 miss ' + (i + 1) + ' (aimed away)', () => a.s.emit('melee', at(away)));
  await check('3 swing at B (cut 5 if misses advanced)', () => a.s.emit('melee', at({})));
  await check('4 heavy after a 320ms hold, at B', async () => { a.s.emit('meleeCharge'); await sleep(320); a.s.emit('melee', at({ heavy: true })); });

  pumps.forEach(clearInterval); a.s.close(); b.s.close(); process.exit(0);
})();
