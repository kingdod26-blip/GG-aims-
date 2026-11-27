/* Probe: Silvars in a real room. Two clients: SILVARS and a VICTIM (Blast).
   Waits for the round, walks the victim up to Silvars, then: sensor on the
   floor, drone, dog. Logs the timers, the robots the room is sent, what
   they do, and the damage and kill credited to Silvars. Then the victim
   shoots the dog to check a robot takes a bullet.
   Run from mp/ with the server up:  node scratchpad/silvarsmp.js */
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
  const c = { s, name, pos: { x: 0, z: 0 }, want: null, log: [], robots: [], yaw: 0 };
  s.on('welcome', d => { c.id = d.id; c.pos = { x: d.spawn.x, z: d.spawn.z }; c.want = { ...c.pos }; });
  s.on('silv', d => c.log.push(['silv', JSON.stringify(d)]));
  s.on('robots', l => { c.robots = l; });
  s.on('robotfx', d => { if (d.k !== 'dogshot' || d.hit) c.log.push(['fx', d.k + (d.hit !== undefined ? ' hit=' + d.hit : '')]); });
  s.on('hurt', () => c.log.push(['hurt']));
  s.on('kill', d => c.log.push(['kill', `${d.by} -> ${d.victim} via ${d.via || '-'}`]));
  s.on('linked', l => { if (l.length) c.linked = l; });
  s.on('impact', d => { if (d.robot) c.log.push(['robot hit']); });
  s.on('snapshot', () => {});
  return c;
}
function pump(c, hz = 30) {
  return setInterval(() => {
    if (!c.want) return;
    const dx = c.want.x - c.pos.x, dz = c.want.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(d, 8 / hz) / d; c.pos.x += dx * k; c.pos.z += dz * k; }
    c.s.emit('state', { x: c.pos.x, z: c.pos.z, y: 0, yaw: c.yaw, pitch: 0, st: 0, name: c.name, lo: 0 });
  }, 1000 / hz);
}
const show = c => { for (const l of c.log.splice(0)) console.log(`  [${c.name}]`, ...l); };

(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const S = client('SILVARS', 'silvars', code), V = client('VICTIM', 'blast', code);
  const pumps = [pump(S), pump(V)];
  await sleep(1200);
  V.s.emit('buy', { w: 0 });
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase:', await phaseOf(code));
  await sleep(500);
  // where everyone really is now (round start moved them)
  console.log('silvars at', S.pos, 'victim at', V.pos);
  // a refused request still answers with the timers
  S.s.emit('silvq'); await sleep(200); show(S);
  // V: the floor at his feet
  S.s.emit('sensor', { dx: 0, dy: -1, dz: -0.3 }); await sleep(300); show(S);
  console.log('robots after sensor:', S.robots.map(r => r.k + '@' + r.x + ',' + r.y + ',' + r.z));
  // bring the victim to 12m in front of Silvars, facing him
  V.want = { x: S.pos.x, z: S.pos.z - 12 }; S.yaw = 0;
  for (let i = 0; i < 40 && Math.hypot(V.pos.x - V.want.x, V.pos.z - V.want.z) > 0.5; i++) await sleep(500);
  console.log('victim now at', V.pos);
  if (!process.env.DOGSHOT) { S.s.emit('drone'); await sleep(300); show(S); }
  for (let i = 0; i < 8; i++) { await sleep(500); console.log('  robots:', S.robots.map(r => `${r.k} s${r.s} l${r.l} (${r.x},${r.y},${r.z}) hp${r.h}`).join(' | ')); }
  show(S); show(V);
  console.log('linked seen by silvars:', JSON.stringify(S.linked));
  S.s.emit('dog'); await sleep(300); show(S);
  for (let i = 0; i < (process.env.DOGSHOT ? 2 : 10); i++) { await sleep(600); console.log('  robots:', S.robots.map(r => `${r.k} s${r.s} (${r.x},${r.z}) hp${r.h}`).join(' | ')); }
  show(S); show(V);
  // the victim shoots the dog
  const dog = S.robots.find(r => r.k === 'g');
  if (dog) {
    const ox = V.pos.x, oy = 1.6, oz = V.pos.z, dx = dog.x - ox, dy = 0.55 - oy, dz = dog.z - oz, L = Math.hypot(dx, dy, dz);
    for (let i = 0; i < 3; i++) { V.s.emit('fire', { w: 0, ox, oy, oz, dx: dx / L, dy: dy / L, dz: dz / L }); await sleep(150); }
    await sleep(300);
    console.log('dog hp after 3 shots:', (S.robots.find(r => r.k === 'g') || {}).h);
  }
  show(S); show(V);
  pumps.forEach(clearInterval); S.s.close(); V.s.close(); process.exit(0);
})();
