/* Probe: TxF, the hidden agent, in a real room.
   TXF (with the code) and VICTIM (Blast), plus two that try to be TxF and
   must be refused: a second TxF (taken) and one with a wrong code.
   Checks: refusals, names, 500 HP on the wire, the pulse (40 to everyone
   in range, the list sent back), teleport (moves him, refuses past 200m),
   the laser (overheat after its heat, then a kill credited to TxF).
   Run from mp/ with the server up:  TXF_CODE=... URL=http://localhost:8210 node scratchpad/txfmp.js */
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:8200';
/* the secret code is never written in the repo: pass it in */
const CODE = process.env.TXF_CODE;
if (!CODE) { console.error('Set TXF_CODE to the secret code (ask Jack).'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phaseOf = async code => {
  const rooms = await (await fetch(URL + '/rooms')).json();
  const r = (rooms.rooms || rooms).find(x => x.id === code);
  return r ? r.phase : 'gone';
};
let meta = null;
function decode(buf){
  const d = new DataView(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
  if (d.getUint8(0) !== 5) return { bad: d.getUint8(0) };
  const np = d.getUint8(10); let o = 12; const out = {};
  for (let i = 0; i < np; i++){
    const slot = d.getUint8(o), flags = d.getUint8(o + 1), hp = d.getUint16(o + 3, true);
    const x = d.getInt16(o + 5, true) / 100, y = d.getInt16(o + 7, true) / 100, z = d.getInt16(o + 9, true) / 100, tp = d.getUint8(o + 14);
    const m = meta && meta.players.find(p => p.slot === slot);
    if (m) out[m.id] = { name: m.name, agent: m.agent, hp, x, y, z, tp, alive: !!(flags & 1), fly: !!(flags & 4) };
    o += 22;
  }
  return out;
}
function client(name, agent, room, txf) {
  const s = io(URL, { auth: { tok: `probe-${name}-${Date.now()}`, room, agent, txf }, transports: ['websocket'] });
  const c = { s, name, pos: { x: 0, y: 0, z: 0 }, want: null, log: [], yaw: 0, pitch: 0, tp: -1, snap: null };
  s.on('welcome', d => { c.id = d.id; c.pos = { x: d.spawn.x, y: 0, z: d.spawn.z }; c.want = { ...c.pos }; });
  s.on('meta', m => { meta = m; });
  s.on('snapshot', b => {
    const all = decode(b); c.all = all; const mine = all[c.id];
    if (mine && mine.tp !== c.tp){ c.tp = mine.tp; c.pos = { x: mine.x, y: mine.y, z: mine.z }; c.want = { ...c.pos }; }
    c.snap = mine;
  });
  for (const ev of ['txfno', 'txfjoin', 'teleno', 'telefx', 'pulse', 'pulsed', 'pulsefx'])
    s.on(ev, d => c.log.push([ev, JSON.stringify(d)]));
  s.on('txf', d => { c.timers = d; if (d.hot > 0) c.log.push(['txf timers', JSON.stringify(d)]); });
  s.on('lasers', l => { if (l.length) c.beams = (c.beams || 0) + 1; });
  s.on('hurt', () => { c.hurts = (c.hurts || 0) + 1; });
  s.on('kill', d => c.log.push(['kill', `${d.by} -> ${d.victim}`]));
  return c;
}
function pump(c, hz = 30) {
  return setInterval(() => {
    if (!c.want) return;
    const dx = c.want.x - c.pos.x, dz = c.want.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(d, 8 / hz) / d; c.pos.x += dx * k; c.pos.z += dz * k; }
    c.s.emit('state', { x: c.pos.x, z: c.pos.z, y: c.pos.y, yaw: c.yaw, pitch: c.pitch, st: 0, name: c.sendName || c.name, lo: 0, tp: c.tp });
  }, 1000 / hz);
}
const show = c => { for (const l of c.log.splice(0)) console.log(`  [${c.name}]`, ...l); };

(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const T = client('TXF', 'txf', code, CODE); T.sendName = CODE;      // the code typed as a callsign: must not become the name
  const V = client('VICTIM', 'blast', code);
  const pumps = [pump(T), pump(V)];
  await sleep(800);
  const T2 = client('TXF2', 'txf', code, CODE), W = client('WRONG', 'txf', code, 'TxF');
  await sleep(800); show(T2); show(W); show(V);
  T2.s.close(); W.s.close();
  console.log('names on the roster:', meta.players.map(p => `${p.name}(${p.agent})`).join(', '));
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase:', await phaseOf(code));
  await sleep(600);
  console.log('TxF hp on the wire:', T.snap && T.snap.hp, ' victim hp:', V.snap && V.snap.hp);

  // TELEPORT: 300m is refused; then a clear spot ~14m from the victim
  T.s.emit('tele', { x: T.pos.x + 300, y: 0, z: T.pos.z }); await sleep(300); show(T);
  const tries = [[0, 14], [0, -14], [14, 0], [-14, 0], [10, 10], [-10, 10], [10, -10], [-10, -10], [0, 20], [20, 0]];
  let moved = false;
  for (const [ax, az] of tries) {
    const before = { ...T.pos };
    T.s.emit('tele', { x: V.pos.x + ax, y: 0, z: V.pos.z + az }); await sleep(450);
    if (Math.hypot(T.pos.x - before.x, T.pos.z - before.z) > 5) { console.log('teleported', before, '->', T.pos, ' victim at', V.pos); moved = true; break; }
    show(T);
    if (T.timers && T.timers.teleQ && T.timers.teleQ.length >= 2) await sleep(8100);
  }
  if (!moved) console.log('NO TELEPORT LANDED');
  show(T);

  // PULSE: the victim is in range now
  T.s.emit('pulse'); await sleep(400); show(T); show(V);
  console.log('pulse: victim hp now', V.snap.hp, ' hurts:', V.hurts || 0);
  T.s.emit('pulse'); await sleep(300);
  console.log('second pulse at once (cooldown): victim', V.snap.hp, ' pulse timer ms', T.timers && T.timers.pulse);

  // LASER at the sky for 4.4s -> overheat, refused while hot
  T.pitch = 1.2; T.s.emit('laser', { on: 1 }); await sleep(4400); show(T);
  console.log('after 4.4s of beam: timers', JSON.stringify(T.timers));
  T.s.emit('laser', { on: 1 }); await sleep(300);
  console.log('laser while hot refused: on =', T.timers && T.timers.on);
  await sleep(6200);
  // aim at the victim's chest and burn
  const dx = V.pos.x - T.pos.x, dz = V.pos.z - T.pos.z, dist = Math.hypot(dx, dz);
  T.yaw = Math.atan2(-dx, -dz); T.pitch = Math.atan2(1.1 - 1.7, dist);
  await sleep(200);
  const hp0 = V.snap.hp; T.beams = 0;
  T.s.emit('laser', { on: 1 }); await sleep(100);
  const hp1 = V.snap.hp; await sleep(500);
  console.log(`laser on the victim at ${dist.toFixed(1)}m: hp ${hp0} -> ${hp1} after ~0.1s ->`, V.snap.hp, 'alive', V.snap.alive, ' beams:', T.beams);
  T.s.emit('laser', { on: 0 }); await sleep(200);
  show(T); show(V);
  pumps.forEach(clearInterval); T.s.close(); V.s.close(); process.exit(0);
})();
