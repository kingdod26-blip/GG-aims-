/* Unit test of server.js's fall logic (FALL, groundAt, trackFall), lifted
   out of the file and run against the real works map. node scratchpad/fallunit.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const grab = (start, endMark) => { const a = src.indexOf(start); const b = src.indexOf(endMark, a); return src.slice(a, b); };
const code = grab('const FALL = ', '\n') + '\n' + grab('/* Who last hurt a player', 'function resolve2D(');
const { MAPS, mapRects, mapWallRects } = require('../public/maps.js');
const room = { id: 'r', rects: mapRects(MAPS.works).concat(mapWallRects(MAPS.works)), match: { phase: 'live' }, players: new Map() };
const events = [];
const io = { to: () => ({ emit: (k, d) => events.push([k, d]) }) };
const eliminate = (r, p) => { p.alive = false; };
const f = new Function('io', 'eliminate', code + '\nreturn { trackFall, groundAt, FALL };')(io, eliminate);
function run(agent, from, roll, flags){
  const p = { id: agent, name: agent, agent, x: -100, z: 12, y: 0, hp: 100, alive: true, deaths: 0 }; room.players.set(p.id, p);
  events.length = 0; f.trackFall(room, p, 0, 0);
  for (let y = 0; y <= from; y += 0.4){ p.y = y; f.trackFall(room, p, flags.up, 0); }
  for (let y = from; y >= 0; y -= 0.45){ p.y = Math.max(0, y); f.trackFall(room, p, roll ? 4 : 0, 0); }
  p.y = 0; f.trackFall(room, p, 0, 0);
  return { hp: p.hp, alive: p.alive, ev: events.map(e => e[0] + ':' + JSON.stringify(e[1])).join(' ') };
}
console.log('4.8m jump-height drop  ', run('blast', 4.8, false, { up: 0 }));
console.log('12m fall               ', run('blast', 12, false, { up: 1 }));
console.log('12m fall, Aseed rolls  ', run('aseed', 12, true, { up: 1 }));
console.log('12m fall, Blast "rolls"', run('blast', 12, true, { up: 1 }), '(no halving: not his)');
console.log('16.6m roof             ', run('blast', 16.6, false, { up: 1 }));

console.log('ground at test spot', f.groundAt(room, -100, 12, 20));
// down a ladder: flagged the whole way (fl=1), so nothing
{ const p = { id: 'L', name: 'L', agent: 'blast', x: -100, z: 12, y: 12, hp: 100, alive: true, deaths: 0 }; events.length = 0;
  f.trackFall(room, p, 1, 0); for (let y = 12; y >= 0; y -= 0.3){ p.y = Math.max(0, y); f.trackFall(room, p, 1, 0); } p.y = 0; f.trackFall(room, p, 0, 0);
  console.log('down a ladder          ', { hp: p.hp, ev: events.length }); }
// pushed: lethal, credited to the last attacker
{ const k = { id: 'K', name: 'KILLER', kills: 0 }; room.players.set('K', k);
  const p = { id: 'V', name: 'V', agent: 'blast', x: -100, z: 12, y: 0, hp: 40, alive: true, deaths: 0, lastHitBy: 'K', lastHitAt: Date.now() }; events.length = 0;
  f.trackFall(room, p, 0, Date.now()); for (let y = 0; y <= 12; y += 0.4){ p.y = y; f.trackFall(room, p, 1, Date.now()); }
  for (let y = 12; y >= 0; y -= 0.45){ p.y = Math.max(0, y); f.trackFall(room, p, 0, Date.now()); } p.y = 0; f.trackFall(room, p, 0, Date.now());
  console.log('pushed off at 40 HP    ', { alive: p.alive, killerKills: k.kills, ev: events.map(e => e[0] + ':' + JSON.stringify(e[1])).join(' ') }); }
