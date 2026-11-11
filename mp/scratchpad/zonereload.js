/* Probe: does Blast's zone shorten the SERVER's reload clock?

   The client's own copy only drives the bar and the magazine sounds; the
   server's `p.reloadAt` is what refuses a shot, so that is what has to move.
   A reload is invisible from outside except through its effects, so this
   dates it two ways at once:
     - an `ammo` event only arrives when a shot is ACCEPTED, and
     - a completed reload moves rounds out of the RESERVE.
   Fire at 1050ms, inside the normal 1600ms clock and outside the zone's
   960ms: refused plain, accepted in the zone.

   The first run of this was inconclusive because it never checked that the
   shots it fired were landing — it read one ammo event at the end and could
   not tell a finished reload from a reload that never started (a full
   magazine makes the handler return early). Everything is logged now.

   Run from mp/ with the server up:  node scratchpad/zonereload.js
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
  const c = { s, name, pos: { x: 0, z: 0 }, want: null, ammo: [], zone: [] };
  s.on('welcome', d => { c.pos = { x: d.spawn.x, z: d.spawn.z }; c.want = { ...c.pos }; c.joined = true; });
  s.on('ammo', d => c.ammo.push({ ...d, at: Date.now() }));
  s.on('zone', d => c.zone.push(d));
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
  const a = client('BLAST', 'blast', code);
  const b = client('FILLER', 'aseed', code);          // a room needs two to run
  const pumps = [pump(a), pump(b)];
  await sleep(1200);

  a.s.emit('buy', { w: 0 });                          // rifle, while the shop is open
  await sleep(500);
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase:', await phaseOf(code));
  a.want = { x: 20, z: 36 }; b.want = { x: -20, z: -36 };   // apart, so nobody dies
  await sleep(6000);

  const fire = () => a.s.emit('fire', { w: 0, dx: 0, dy: 0, dz: -1, f: 1 });

  async function run(label, useZone) {
    if (useZone) { a.s.emit('zone'); await sleep(600); console.log(label, 'zone says', a.zone[a.zone.length-1]); }
    // spend three rounds so the magazine is genuinely short
    a.ammo.length = 0;
    for (let i = 0; i < 3; i++) { fire(); await sleep(200); }
    const spent = a.ammo.map(x => `${x.mag}/${x.reserve}`);
    const magBefore = a.ammo.length ? a.ammo[a.ammo.length - 1].mag : null;
    const resBefore = a.ammo.length ? a.ammo[a.ammo.length - 1].reserve : null;

    a.ammo.length = 0;
    const t0 = Date.now();
    a.s.emit('reload', { w: 0 });
    await sleep(1050);
    fire();                                    // inside 1600, outside 960
    await sleep(450);
    const early = a.ammo.length ? a.ammo[a.ammo.length - 1] : null;
    await sleep(900);                          // now past 1600 either way
    fire();
    await sleep(450);
    const late = a.ammo.length ? a.ammo[a.ammo.length - 1] : null;

    /* An `ammo` event is NOT proof the shot landed: the server sends one to
       CORRECT the client when it REFUSES a shot too, so from outside a
       refusal and a hit look identical. That is what made the first run of
       this read INCONCLUSIVE while the numbers underneath said PASS. The
       RESERVE is the honest signal — it only moves when a reload actually
       completes and pushes rounds up into the magazine. */
    const doneEarly = !!early && resBefore !== null && early.reserve < resBefore;
    const doneLate  = !!late  && resBefore !== null && late.reserve  < resBefore;
    console.log(`\n--- ${label} ---`);
    console.log('three shots landed:', spent.join(' -> '), '(mag/reserve)');
    console.log(`at 1050ms: mag ${early ? early.mag : '?'} reserve ${early ? early.reserve : '?'} ->`,
                doneEarly ? 'the reload had FINISHED' : 'still reloading, so the shot was refused');
    console.log(`at 2400ms: mag ${late ? late.mag : '?'} reserve ${late ? late.reserve : '?'} ->`,
                doneLate ? 'finished' : 'STILL not finished');
    return { doneEarly, doneLate, magBefore, resBefore };
  }

  const plain = await run('no zone, 1600ms expected', false);
  const zoned = await run('in the zone, 960ms expected', true);

  console.log('\nVERDICT:', (!plain.doneEarly && plain.doneLate && zoned.doneEarly)
    ? "PASS - at 1050ms the normal reload is still running and the zone's is already done"
    : `FAIL - plain finished by 1050ms: ${plain.doneEarly} (want false), `
      + `plain finished by 2400ms: ${plain.doneLate} (want true), `
      + `zoned finished by 1050ms: ${zoned.doneEarly} (want true)`);

  pumps.forEach(clearInterval); a.s.close(); b.s.close();
  process.exit(0);
})().catch(e => { console.error('probe failed', e); process.exit(1); });
