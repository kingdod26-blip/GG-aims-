/* Probe: does each ROOM really simulate its own arena?

   Reporting the map id in `welcome` is cheap; the question is whether the
   collision the server tests against is that room's. The spawn in `welcome`
   answers it, because randomSpawn(room) does two things with the room's
   geometry: it keeps inside `arena - 6`, and it rejects anything inside a
   wall. Substation is 44 to Foundry's 60 and has two long lane dividers
   where Foundry has open floor — so a server still holding one global arena
   would hand out spawns past 38, or standing inside a divider, or both.

   Run from mp/ with the server up:  node scratchpad/permap.js
*/
const { io } = require('socket.io-client');
const { mapById, mapRects, mapWallRects } = require('../public/maps.js');

const URL = process.env.URL || 'http://localhost:8200';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const newRoom = async map =>
  (await (await fetch(`${URL}/rooms/new?map=${map}`)).json()).code;

/* One connection, one spawn, then get out of the way. */
function spawnFrom(room, i) {
  return new Promise(res => {
    const s = io(URL, { auth: { tok: `permap-${i}-${Date.now()}`, room, agent: 'aseed' },
                        transports: ['websocket'] });
    const done = v => { try { s.close(); } catch(e){} res(v); };
    s.on('welcome', d => done({ spawn: d.spawn, map: d.map, arena: d.arena }));
    s.on('nosuch', () => done(null));
    s.on('full', () => done(null));
    setTimeout(() => done(null), 4000);
  });
}

const insideAny = (rects, x, z) =>
  rects.some(r => x > r.minx - 1 && x < r.maxx + 1 && z > r.minz - 1 && z < r.maxz + 1);

(async () => {
  for (const id of ['foundry', 'substation']) {
    const map = mapById(id);
    const rects = mapRects(map).concat(mapWallRects(map));
    const bound = map.arena - 6;
    const code = await newRoom(id);
    const spawns = [];
    /* Five at a time: the room holds MATCH.maxPlayers, and these connect only
       long enough to be told where they start. */
    for (let batch = 0; batch < 4; batch++) {
      const got = await Promise.all([0,1,2,3,4].map(k => spawnFrom(code, `${batch}-${k}`)));
      spawns.push(...got.filter(Boolean));
      await sleep(300);
    }
    const idsWrong = spawns.filter(s => s.map !== id).length;
    const arenaWrong = spawns.filter(s => s.arena !== map.arena).length;
    const outside = spawns.filter(s => Math.abs(s.spawn.x) > bound || Math.abs(s.spawn.z) > bound);
    const inWall = spawns.filter(s => insideAny(rects, s.spawn.x, s.spawn.z));
    const far = Math.max(...spawns.map(s => Math.max(Math.abs(s.spawn.x), Math.abs(s.spawn.z))));
    console.log(`\n--- room ${code} on ${id} (arena ${map.arena}, spawns must be inside ${bound}) ---`);
    console.log(`samples ${spawns.length}, furthest coordinate ${far.toFixed(1)}`);
    console.log(`welcome said the wrong map: ${idsWrong}, the wrong arena size: ${arenaWrong}`);
    console.log(`spawned beyond the bound: ${outside.length}, spawned inside geometry: ${inWall.length}`);
    console.log('VERDICT:', (!idsWrong && !arenaWrong && !outside.length && !inWall.length)
      ? 'PASS - this room is simulating its own arena'
      : 'FAIL - ' + JSON.stringify({ idsWrong, arenaWrong, outside: outside.slice(0,3), inWall: inWall.slice(0,3) }));
  }
  process.exit(0);
})().catch(e => { console.error('probe failed', e); process.exit(1); });
