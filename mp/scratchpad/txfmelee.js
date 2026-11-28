/* Probe: TxF's INFERNO and ARC BLADES in a real room.
   TXF and VICTIM (Blast). Checks: TxF cannot buy or fire a normal gun; the
   minigun hits for 20 a round and keeps its rate; three missiles then a
   refusal; a missile at the victim's feet kills from 100 HP and spares TxF.
   Run from mp/ with the server up:
     TXF_CODE=... URL=http://localhost:8210 node scratchpad/txfarms.js */
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:8200';
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
  if (d.getUint8(0) !== 5) return {};
  const np = d.getUint8(10), na = d.getUint8(11); let o = 12; const out = { arrows: [] };
  for (let i = 0; i < np; i++){
    const slot = d.getUint8(o), flags = d.getUint8(o + 1), hp = d.getUint16(o + 3, true);
    const x = d.getInt16(o + 5, true) / 100, y = d.getInt16(o + 7, true) / 100, z = d.getInt16(o + 9, true) / 100, tp = d.getUint8(o + 14);
    const m = meta && meta.players.find(p => p.slot === slot);
    if (m) out[m.id] = { hp, x, y, z, tp, alive: !!(flags & 1) };
    o += 22;
  }
  for (let i = 0; i < na; i++){ out.arrows.push({ fl: d.getUint8(o + 14) }); o += 15; }
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
    if (all.arrows && all.arrows.some(a => a.fl & 8)) c.sawMissile = true;
  });
  s.on('txf', d => { c.timers = d; });
  s.on('txfboom', d => c.log.push(['txfboom', JSON.stringify(d)]));
  s.on('bought', d => c.log.push(['bought', JSON.stringify(d)]));
  s.on('kill', d => c.log.push(['kill', `${d.by} -> ${d.victim}`]));
  return c;
}
function pump(c, hz = 30) {
  return setInterval(() => {
    if (!c.want) return;
    c.s.emit('state', { x: c.pos.x, z: c.pos.z, y: c.pos.y, yaw: c.yaw, pitch: c.pitch, st: 0, name: c.name, lo: 0, tp: c.tp });
  }, 1000 / hz);
}
const show = c => { for (const l of c.log.splice(0)) console.log(`  [${c.name}]`, ...l); };

(async () => {
  const code = (await (await fetch(URL + '/rooms/new')).json()).code;
  const T = client('TXF', 'txf', code, CODE), V = client('VICTIM', 'blast', code);
  const pumps = [pump(T), pump(V)];
  await sleep(800);
  T.s.emit('buy', { slot: 0 }); await sleep(300); show(T);
  console.log('TxF tried to buy a rifle (no "bought" line above = refused)');
  for (let i = 0; i < 50; i++) { if (await phaseOf(code) === 'live') break; await sleep(1000); }
  console.log('phase:', await phaseOf(code)); await sleep(500);
  // get next to the victim
  // hop along the line to the victim (200m a teleport), then land ~14m off them
  for (let hop = 0; hop < 6 && Math.hypot(T.pos.x - V.pos.x, T.pos.z - V.pos.z) > 20; hop++) {
    const ddx = V.pos.x - T.pos.x, ddz = V.pos.z - T.pos.z, d = Math.hypot(ddx, ddz);
    const go = Math.min(d - 14, 180);
    let landed = false;
    for (const side of [0, 3, -3, 6, -6, 9, -9]) {
      const x = T.pos.x + ddx / d * go - ddz / d * side, z = T.pos.z + ddz / d * go + ddx / d * side;
      const before = { ...T.pos };
      T.s.emit('tele', { x, y: 0, z }); await sleep(450);
      if (Math.hypot(T.pos.x - before.x, T.pos.z - before.z) > 5) { landed = true; break; }
      if (T.timers && T.timers.teleQ && T.timers.teleQ.length >= 2) await sleep(8100);
    }
    if (!landed) break;
  }
  const dx = V.pos.x - T.pos.x, dz = V.pos.z - T.pos.z, dist = Math.hypot(dx, dz);
  T.yaw = Math.atan2(-dx, -dz); await sleep(200);
  const eye = { x: T.pos.x, y: T.pos.y + 1.7, z: T.pos.z };
  const aim = (ty) => { const ddx = V.pos.x - eye.x, ddy = ty - eye.y, ddz = V.pos.z - eye.z, L = Math.hypot(ddx, ddy, ddz); return { dx: ddx / L, dy: ddy / L, dz: ddz / L }; };
  console.log(`TxF at ${dist.toFixed(1)}m from the victim; victim hp`, V.snap.hp);
  // INFERNO: the victim is ~14m off, past its 12m: seven pulls test the magazine only
  for (let i = 0; i < 7; i++) { T.s.emit('inferno', { ...aim(1.1) }); await sleep(700); }
  console.log('INFERNO after 7 pulls: mag', T.timers && T.timers.infMag, ' reload ms', T.timers && T.timers.infReload, ' victim hp', V.snap.hp);
  // close in to ~2.5m for the blades
  const before = { ...T.pos };
  T.s.emit('tele', { x: V.pos.x + 2.5, y: 0, z: V.pos.z }); await sleep(500);
  console.log('teleported next to the victim:', Math.hypot(T.pos.x - V.pos.x, T.pos.z - V.pos.z).toFixed(1), 'm');
  const ddx = V.pos.x - T.pos.x, ddz = V.pos.z - T.pos.z, L = Math.hypot(ddx, ddz); T.yaw = Math.atan2(-ddx, -ddz); await sleep(150);
  T.s.emit('arcslash', { dx: ddx / L, dy: -0.15, dz: ddz / L }); await sleep(300);
  console.log('ARC slash: victim hp', V.snap.hp);
  T.s.emit('arcburst'); await sleep(300);
  console.log('ARC burst: victim alive', V.snap.alive, 'hp', V.snap.hp, ' burst cooldown ms', T.timers && T.timers.arcBurst);
  show(T); show(V);
  pumps.forEach(clearInterval); T.s.close(); V.s.close(); process.exit(0);
})();
