/* Probe: does a grenade stop on a PLAYER server-side, and does the zone
   shorten the server's reload clock?

   Both answers have to come from the server, not the browser: a match's
   grenades fly on the server, and its reload clock is the one that decides
   when you may fire again. The binary snapshot is not decoded here and does
   not need to be — `boom` carries where the grenade actually went off, which
   is the whole question, and `ammo` only arrives when a shot is ACCEPTED,
   which dates the reload.

   Three things this probe got wrong first time round, all of them things the
   real client does and a probe must copy:
     1. A room code must be RESERVED through /rooms/new. Joining an invented
        code returns 'nosuch' and bounces you — so both probes connected to
        nothing, no match ran, and every test read as a refusal.
     2. You BUY in the prep window. The shop shuts during a live round, so
        buying after the bell is refused and the gun you then try to fire is
        one you do not own.
     3. Probes must WALK. Movement is rate-limited (MOVE.maxSpeed 20), so
        step your own intended position forward rather than teleporting.

   Run from mp/ with the server already up:  node scratchpad/grenadebody.js
*/
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:8200';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => {
  const rooms = await (await fetch(URL + '/rooms')).json();
  const r = (rooms.rooms || rooms).find(x => x.id === code);
  return r ? r.phase : 'gone';
};

function client(name, agent, room) {
  const s = io(URL, { auth: { tok: `probe-${name}-${Date.now()}`, room, agent }, transports: ['websocket'] });
  const c = { s, name, agent, pos: { x: 0, y: 0, z: 0 }, want: null, booms: [], ammo: [], refused: [] };
  s.on('welcome', d => { c.pos = { x: d.spawn.x, y: 0, z: d.spawn.z }; c.want = { x: d.spawn.x, z: d.spawn.z }; c.joined = true; });
  s.on('nosuch', () => c.refused.push('nosuch'));
  s.on('full',   () => c.refused.push('full'));
  s.on('boom', d => c.booms.push({ x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2) }));
  s.on('ammo', d => c.ammo.push({ ...d, at: Date.now() }));
  return c;
}

/* Own the intended position and step THAT forward: stepping from the
   server-reported position re-asks for the same spot and barely moves.
   19 m/s keeps under the server's sustained ceiling of 20. */
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
  console.log('reserved room', code);

  const thrower = client('BLAST', 'blast', code);
  const victim  = client('TARGET', 'aseed', code);
  const pumps = [pump(thrower), pump(victim)];
  const stop = () => { pumps.forEach(clearInterval); thrower.s.close(); victim.s.close(); };

  await sleep(1500);
  console.log('joined:', !!thrower.joined, !!victim.joined, 'refusals:', thrower.refused, victim.refused);
  console.log('phase now:', await phaseOf(code), '- buying in the prep window');

  // The shop is open outside a live round. Buy before the bell.
  thrower.s.emit('buy', { w: 0 });            // rifle
  await sleep(500);

  // Wait out the 30s prep window.
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase now:', await phaseOf(code));

  // Open floor, 6m apart on the z axis. Give the walk time to land.
  thrower.want = { x: 20, z: 36 };
  victim.want  = { x: 20, z: 30 };
  await sleep(9000);
  console.log('positions', thrower.pos, victim.pos);

  /* A: the victim is standing in the way. Flat and fast at chest height, so
     it reaches them while still in the air. */
  thrower.booms.length = 0;
  thrower.s.emit('grenade', { ox: thrower.pos.x, oy: 1.4, oz: thrower.pos.z, vx: 0, vy: 0, vz: -17 });
  await sleep(2600);
  const withBody = thrower.booms[0];

  /* B: the same throw with nobody there — the victim steps 28m aside. */
  victim.want = { x: -8, z: 30 };
  await sleep(4000);
  thrower.booms.length = 0;
  thrower.s.emit('grenade', { ox: thrower.pos.x, oy: 1.4, oz: thrower.pos.z, vx: 0, vy: 0, vz: -17 });
  await sleep(2600);
  const noBody = thrower.booms[0];

  console.log('\n--- grenade vs a body ---');
  console.log('thrown from z', +thrower.pos.z.toFixed(2), ', victim stood at z 30');
  console.log('A, body in the way :', withBody);
  console.log('B, nobody there    :', noBody);
  if (withBody && noBody)
    console.log('VERDICT:', withBody.z > noBody.z + 1
      ? `PASS - the body stopped it ${(withBody.z - noBody.z).toFixed(2)}m short`
      : 'FAIL - it travelled as far through a player as through empty air');

  /* The zone's reload. Spend a round, reload, and fire again after 1100ms:
     inside the normal 1600ms clock, outside the zone's 960ms. An `ammo`
     event means the shot was ACCEPTED, so the magazine had refilled;
     silence means the server was still reloading. */
  async function reloadTest(useZone) {
    if (useZone) { thrower.s.emit('zone'); await sleep(500); }
    thrower.s.emit('fire', { w: 0, dx: 0, dy: 0, dz: -1, f: 1 });
    await sleep(400);
    thrower.ammo.length = 0;
    thrower.s.emit('reload', { w: 0 });
    await sleep(1100);
    thrower.s.emit('fire', { w: 0, dx: 0, dy: 0, dz: -1, f: 1 });
    await sleep(500);
    return thrower.ammo.length ? thrower.ammo[thrower.ammo.length - 1] : null;
  }
  const plain = await reloadTest(false);
  const zoned = await reloadTest(true);
  console.log('\n--- reload clock, fired 1100ms into a 1600ms reload ---');
  console.log('no zone:', plain ? 'ACCEPTED ' + JSON.stringify(plain) : 'refused - still reloading');
  console.log('in zone:', zoned ? 'ACCEPTED ' + JSON.stringify(zoned) : 'refused - still reloading');
  console.log('VERDICT:', (!plain && zoned) ? 'PASS - the zone reloads faster'
            : (plain && zoned) ? 'INCONCLUSIVE - both accepted, the window is too loose'
            : 'INCONCLUSIVE');

  stop();
  process.exit(0);
})().catch(e => { console.error('probe failed', e); process.exit(1); });
