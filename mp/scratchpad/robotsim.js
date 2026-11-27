/* Headless check of public/robots.js on the real map: a Silvars, one
   enemy, and his drone / dog / sensor. Prints what each robot does.
   node scratchpad/robotsim.js */
const R = require('../public/robots.js');
const { MAPS } = require('../public/maps.js');
const G = R.robotGeo(MAPS.works);

function run(name, setup, secs, enemyMove) {
  const owner = { id: 'S', x: -100, y: 0, z: 19, yaw: 0, alive: true };
  const enemy = { id: 'E', x: -100, y: 0, z: 5, st: 0, alive: true, hp: 100 };
  const linked = new Map(); const log = []; let now = 0;
  const list = [];
  const W = {
    G, get now() { return now; },
    owner: id => id === 'S' ? owner : null,
    enemies: () => [enemy],
    known: () => linked,
    reveal: (o, id) => linked.set(id, now + R.SILV.linkMs),
    hurt: (r, t, dmg, how) => { t.hp -= dmg; log.push(`${(now/1000).toFixed(2)}s ${r.kind} ${how} -${dmg} -> ${t.hp}`); if (t.hp <= 0) t.alive = false; },
    fx: (k, d) => { if (k !== 'dogshot' || d.hit) log.push(`${(now/1000).toFixed(2)}s fx ${k}${d.hit !== undefined ? ' hit=' + d.hit : ''}`); },
    gone: (r, why) => log.push(`${(now/1000).toFixed(2)}s ${r.kind} gone (${why})`),
  };
  setup(list, owner, enemy);
  let lastState = {};
  for (let i = 0; i < secs * 20; i++) {
    now += 50;
    if (enemyMove) enemyMove(enemy, now);
    R.stepRobots(W, list, 0.05);
    for (const r of list) if (lastState[r.id] !== r.state) { log.push(`${(now/1000).toFixed(2)}s ${r.kind} -> ${r.state} at (${r.x.toFixed(1)},${(r.y||0).toFixed(1)},${r.z.toFixed(1)})`); lastState[r.id] = r.state; }
  }
  console.log('==== ' + name); console.log(log.slice(0, 40).join('\n'));
  for (const r of list) console.log(`  end ${r.kind} ${r.state} (${r.x.toFixed(1)},${(r.y||0).toFixed(1)},${r.z.toFixed(1)}) hp ${r.hp}`);
}

run('drone vs enemy in the open 13m ahead', (L, o) => L.push(R.makeRobot('drone', 'S', o.x, 2.2, o.z, { yaw: 0, state: 'follow' })), 6);
run('dog released toward enemy 13m ahead', (L, o) => L.push(R.makeRobot('dog', 'S', o.x, 0, o.z - 0.8, { yaw: 0, state: 'run', rdx: 0, rdz: -1, ran: 0 })), 8);
run('dog, enemy 5m behind a wall (hidden)', (L, o, e) => { o.x = -38; o.z = 68; e.x = -38; e.z = 58; L.push(R.makeRobot('dog', 'S', o.x, 0, o.z, { yaw: 0, state: 'idle' })); }, 6);
run('sensor on a wall, enemy walks past', (L, o, e) => { e.x = -80; e.z = 10; L.push(R.makeRobot('sensor', 'S', -100, 1.4, 12, { nx: 0, ny: 0, nz: 1, readyAt: 0 })); }, 8,
    (e, now) => { e.x = -80 - now / 1000 * 4; });
run('owner dies: robots go', (L, o) => { L.push(R.makeRobot('dog', 'S', o.x, 0, o.z, { state: 'idle' })); L.push(R.makeRobot('drone', 'S', o.x, 2, o.z, { state: 'follow' })); setTimeout(() => {}, 0); o.alive = false; }, 0.2);
// path timing
console.time('gridPath 60m'); const t0 = Date.now();
const dog = R.makeRobot('dog', 'S', 0, 0, 43, {});
console.timeEnd('gridPath 60m');
run('dog at heel, enemy 14m off: shoots', (L, o) => L.push(R.makeRobot('dog', 'S', o.x + 1, 0, o.z + 1, { yaw: 0, state: 'idle' })), 6);
run('drone, enemy behind the dog-test wall', (L, o, e) => { o.x = -38; o.z = 68; e.x = -38; e.z = 56; L.push(R.makeRobot('drone', 'S', o.x, 2.2, o.z, { state: 'follow' })); }, 8);
