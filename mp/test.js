/* Headless multiplayer test: connect two clients, move them, fire, and verify
   they see each other + the shared bots, and that a hit registers a kill. */
const { io } = require('socket.io-client');
const URL = 'http://localhost:8200';

function client(name) {
  const s = io(URL);
  const state = { name, id:null, lastSnap:null };
  s.on('welcome', d => { state.id = d.id; state.spawn = d.spawn; s.emit('state',{name}); });
  s.on('snapshot', snap => state.lastSnap = snap);
  s.on('kill', k => state.lastKill = k);
  return { s, state };
}

const a = client('Alice');
const b = client('Bob');

setTimeout(() => {
  // Position them close and facing each other so a shot connects.
  a.s.emit('state', { x:45, z:0, yaw:0, pitch:0, name:'Alice' });   // open lane, no walls between
  b.s.emit('state', { x:45, z:-8, yaw:0, pitch:0, name:'Bob' });    // Bob 8 units in front of Alice (-z)
}, 600);

setTimeout(() => {
  // Alice (at x:45,z:0, eye y:1.7) fires straight down -z at Bob.
  for (let i=0;i<6;i++) a.s.emit('fire', { ox:45, oy:1.7, oz:0, dx:0, dy:0, dz:-1, dmg:26, range:220 });
}, 1200);

setTimeout(() => {
  const snap = a.state.lastSnap || {};
  const players = (snap.players||[]);
  const bob = players.find(p => p.name === 'Bob');
  const result = {
    aliceConnected: !!a.state.id,
    bobConnected: !!b.state.id,
    playersInWorld: players.length,
    botsInWorld: (snap.bots||[]).length,
    bobHpAfterFire: bob ? bob.hp : 'missing',
    someoneGotKilled: !!(a.state.lastKill || b.state.lastKill),
    killEvent: a.state.lastKill || b.state.lastKill || null,
  };
  console.log(JSON.stringify(result, null, 2));
  a.s.close(); b.s.close();
  process.exit(0);
}, 2600);
