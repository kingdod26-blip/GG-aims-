/* =============================================================
   Elite Force — pages.js  (after hud.js, before loop.js)

   THE WEAPONS AND AGENTS PAGES (Jack, 2026-11-28: "add a weapon system page
   in the main page, and add a agents page too ... individual pages for the
   weapon and the agents"). They replace the menu's ARSENAL list and the
   OPERATORS pane: each is a full page of its own, opened from the top bar,
   with one page per weapon and one per agent inside it.

   WEAPONS: the list down the left, grouped as the armory is; the weapon
   itself in the middle, turning, built by the same functions that build
   the one in your hands (drawn.js, silvars.js), so the page cannot show a
   gun the game does not have; its numbers down the right, read live from
   WEAPONS. Nothing here changes how a gun fires.

   AGENTS: the list on the left, the agent standing on the podium in the
   middle (the lobby's own 3D hero, wearing whoever you are looking at),
   and their kit on the right with the cooldowns read from the same
   constants the abilities page uses. SELECT makes them yours, as clicking
   a card in OPERATORS used to.

   Esc, or BACK, returns to the lobby. Pure UI: it reads game state, the
   only thing it writes is the agent you pick.
   ============================================================= */

/* ---------- shared ---------- */
let pageOpen = null;                          // 'weapons' | 'agents' | null
const pgSec = ms => (ms / 1000 % 1 ? (ms / 1000).toFixed(1) : String(ms / 1000));
const pgFill = (k, o) => Object.keys(o).reduce((s, n) => s.split('{' + n + '}').join(o[n]), t(k));
const pgEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- the weapons ---------- */
/* The rifle is the PAC-9 once it has loaded. Its gloves are part of that
   model (b.left / b.right), so the copy shown here drops them: walk the
   original and the copy side by side and remove what corresponds. */
function pac9Bare(){
  const b = PAC9_BUILT, copy = b.root.clone(true), A = [], B = [];
  b.root.traverse(o => A.push(o)); copy.traverse(o => B.push(o));
  const drop = new Set([b.left, b.right]);
  A.forEach((o, i) => { if (drop.has(o) && B[i].parent) B[i].parent.remove(B[i]); });
  return copy;
}
const WPN = [
  { id: 'rifle',    slot: 0,       grp: 'primary', key: '1', model: () => (typeof PAC9_BUILT !== 'undefined' && PAC9_BUILT) ? pac9Bare() : drawRifle().g },
  { id: 'sniper',   slot: 1,       grp: 'primary', key: '2', model: () => drawSniper().g },
  { id: 'shotgun',  slot: 2,       grp: 'primary', key: '3', model: () => drawShotgun().g },
  { id: 'pistol',   slot: 3,       grp: 'sidearm', key: '4', model: () => drawPistol(false).g },
  { id: 'pistolx',  slot: 4,       grp: 'sidearm', key: '5', model: () => drawPistol(true).g },
  { id: 'blade',    slot: BLADE,   grp: 'melee',   key: 'F', model: () => buildSword() },
  /* one crossbow fires both of Aseed's bolts (Jack, 2026-11-28: "the cross bow is the same so the smoke is not
     necessary"), so it has one page, and its description covers both */
  { id: 'crossbow', slot: XBOW,    grp: 'gear', agent: 'aseed',   key: 'G · X', model: () => drawCrossbow('fire').g },
  { id: 'grenade',  slot: GRENADE, grp: 'gear', agent: 'blast',   key: 'G', model: () => buildFragGrenade() },
  { id: 'sensor',   slot: SENSOR,  grp: 'gear', agent: 'silvars', key: 'V', model: () => makeSensorMesh() },
  { id: 'incen',    slot: INCEN,   grp: 'gear', agent: 'salvo',   key: 'G', model: () => makeIncenMesh() },
  { id: 'missile',  slot: MISSILE, grp: 'gear', agent: 'salvo',   key: 'X', model: () => makeLauncherMesh() },
  /* TxF's own two (txf.js). Shown only when TxF is your agent, and then
     they are the only weapons shown: he carries nothing else (Jack). */
  { id: 'minigun',  slot: MINIGUN, grp: 'txf', agent: 'txf', key: '1', model: () => drawMinigun().g },
  { id: 'txfmsl',   slot: TXFMSL,  grp: 'txf', agent: 'txf', key: '2', model: () => drawTxfLauncher().g },
  { id: 'inferno',  slot: INFERNO, grp: 'txf', agent: 'txf', key: '3', model: () => drawInferno().g },
  { id: 'arcblades', slot: ARCBLADES, grp: 'txf', agent: 'txf', key: 'F', model: () => drawArcBlades().g },
];
/* What the page lists for the agent you are playing. */
function wpnList(){ return myAgent === 'txf' ? WPN.filter(x => x.agent === 'txf') : WPN.filter(x => x.agent !== 'txf'); }
/* the guns' bars are each gun against the best of the five */
const GUNS = WPN.filter(w => w.slot <= 4).map(w => WEAPONS[w.slot]);
const BAR = {
  dmg:   w => w.dmg * (w.pellets || 1),
  rate:  w => 60000 / w.fireRate,
  range: w => w.range,
  acc:   w => 1 / w.adsSpread,
  ctrl:  w => 1 / w.recoil,
  hand:  w => 1 / w.reloadMs,
};
const BAR_MAX = Object.fromEntries(Object.entries(BAR).map(([k, f]) => [k, Math.max(...GUNS.map(f))]));
let wpnSel = 'rifle';

function wpnStats(e){
  const w = WEAPONS[e.slot], rows = [], bars = [];
  if (e.slot <= 4){
    for (const k of Object.keys(BAR)) bars.push([t('wp.bar.' + k), BAR[k](w) / BAR_MAX[k]]);
    rows.push([t('wp.s.dmg'), w.pellets ? `${w.dmg} × ${w.pellets}` : String(w.dmg)],
              [t('wp.s.head'), '×' + MULT.head],
              [t('wp.s.rpm'), String(Math.round(60000 / w.fireRate))],
              [t('wp.s.mag'), `${w.magMax} / ${w.reserveMax}`],
              [t('wp.s.reload'), pgSec(w.reloadMs) + 's'],
              [t('wp.s.range'), w.range + 'm']);
  } else if (w.txf){
    if (w.kind === 'inferno') rows.push([t('wp.s.dmg'), TXF.inferno.dmg + ' → 0'], [t('wp.s.range'), TXF.inferno.range + 'm'],
      [t('wp.s.mag'), String(TXF.inferno.mag)], [t('wp.s.reload'), pgSec(TXF.inferno.reloadMs) + 's']);
    else if (w.kind === 'arc') rows.push([t('wp.s.dmg'), String(TXF.arc.dmg)], [t('wp.s.reach'), TXF.arc.reach + 'm'],
      [t('wp.s.burst'), TXF.arc.burstDmg + ' · ' + TXF.arc.burstR + 'm · ' + pgSec(TXF.arc.burstCdMs) + 's']);
    else if (w.kind === 'minigun') rows.push([t('wp.s.dmg'), String(TXF.mg.dmg)], [t('wp.s.rpm'), String(Math.round(60000 / TXF.mg.rateMs))],
      [t('wp.s.heat'), pgSec(TXF.mg.heatMs) + 's / ' + pgSec(TXF.mg.coolMs) + 's'], [t('wp.s.range'), TXF.mg.range + 'm']);
    else rows.push([t('wp.s.dmg'), String(TXF.missile.blast.dmg)], [t('wp.s.blast'), TXF.missile.blast.radius + 'm'],
      [t('wp.s.charges'), String(TXF.missile.charges)], [t('wp.s.cd'), pgSec(TXF.missile.cdMs) + 's']);
  } else if (w.melee){
    rows.push([t('wp.s.combo'), w.combo.join(' · ')],
              [t('wp.s.heavy'), `${HEAVY.min}–${HEAVY.max}`],
              [t('wp.s.reach'), w.reach + 'm']);
  } else {
    rows.push([t('wp.s.charges'), String(w.charges)], [t('wp.s.cd'), pgSec(w.cooldownMs) + 's']);
    if (w.headDmg) rows.push([t('wp.s.dmg'), `${w.headDmg} / ${w.bodyDmg}`]);
    else if (w.dmg) rows.push([t('wp.s.dmg'), String(w.dmg)]);
  }
  return { rows, bars };
}
function wpnDesc(e){
  const w = WEAPONS[e.slot], ch = { n: w.charges, cd: w.cooldownMs ? pgSec(w.cooldownMs) : '' };
  const both = (LANG === 'zh' ? '同一把弩发射 Aseed 的两种弩箭。' : 'One crossbow fires both of Aseed’s bolts.')
    + ` ${t('ab.xbow')} (G): ${pgFill('ab.xbow.d', ch)} ${t('ab.smoke')} (X): ${pgFill('ab.smoke.d', { n: WEAPONS[SMOKE].charges, cd: pgSec(WEAPONS[SMOKE].cooldownMs) })}`;
  return { crossbow: both, grenade: pgFill('ab.gren.d', ch),
           missile: pgFill('ab.missile.d', { life: pgSec(SALVO.missile.lifeMs), dmg: SALVO.missile.blast.dmg, n: SALVO.missile.bomblets, bd: SALVO.missile.bomb.dmg, hp: SALVO.missile.hp, cd: pgSec(SALVO.missile.cdMs) }),
           incen: pgFill('ab.incen.d', { n: SALVO.incen.charges, cd: pgSec(SALVO.incen.cdMs), fuse: pgSec(SALVO.incen.fragFuseMs), dmg: SALVO.frag.dmg }),
           minigun: pgFill('wp.minigun.d', { dmg: TXF.mg.dmg, rpm: Math.round(60000 / TXF.mg.rateMs), spin: pgSec(TXF.mg.spinMs), heat: pgSec(TXF.mg.heatMs), cool: pgSec(TXF.mg.coolMs) }),
           inferno: pgFill('wp.inferno.d', { dmg: TXF.inferno.dmg, full: TXF.inferno.full, r: TXF.inferno.range, bd: TXF.inferno.burnDps, bs: pgSec(TXF.inferno.burnMs), n: TXF.inferno.mag, rl: pgSec(TXF.inferno.reloadMs) }),
           arcblades: pgFill('wp.arcblades.d', { dmg: TXF.arc.dmg, reach: TXF.arc.reach, bd: TXF.arc.burstDmg, br: TXF.arc.burstR, cd: pgSec(TXF.arc.burstCdMs) }),
           txfmsl: pgFill('wp.txfmsl.d', { dmg: TXF.missile.blast.dmg, r: TXF.missile.blast.radius, n: TXF.missile.charges, cd: pgSec(TXF.missile.cdMs) }),
           sensor: pgFill('ab.sensor.d', { n: SILV.sensor.charges, r: SILV.sensor.radius, s: pgSec(SILV.linkMs), cd: pgSec(SILV.sensor.cdMs) }) }[e.id] || t('wp.' + e.id + '.d');
}

/* the turning model in the middle of the weapons page: its own small
   renderer, started on first open and only drawn while the page is up */
const WV = { r: null, scene: null, cam: null, holder: null, spin: 0.5, drag: null, yaw: Math.PI / 2, pitch: 0.18, raf: 0 };
function wvInit(canvas){
  if (WV.r) return;
  WV.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  WV.r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  /* LIGHTING (2026-11-28, Jack: "the lighting in the weapon page is a bit
     bad"). The guns are PBR metal and polymer made for the game's own look:
     filmic tone mapping and a room to reflect. Without that, metal has
     nothing to mirror and renders black, which is what this page showed.
     So the page gets the same: ACES at the game's exposure, its own PMREM of
     the game's environment room (a texture belongs to one renderer, so the
     game's cannot be borrowed), and a photo-studio rig - a warm key high on
     the left, a soft cool fill, a crimson rim behind and a white kicker
     from below so the underside of a gun is not lost in the dark. */
  WV.r.outputEncoding = THREE.sRGBEncoding;
  WV.r.toneMapping = THREE.ACESFilmicToneMapping;
  WV.r.toneMappingExposure = 0.85;
  WV.scene = new THREE.Scene();
  try {
    const pm = new THREE.PMREMGenerator(WV.r), envScene = buildEnvScene();
    WV.scene.environment = pm.fromScene(envScene, (typeof LOOK !== 'undefined' && LOOK.pmremSigma) || 0.04).texture;
    pm.dispose(); envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  } catch (err) { console.warn('[pages] no environment for the weapon view', err); }
  WV.cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50); WV.cam.position.set(0, 0.05, 2.4);
  WV.scene.add(new THREE.HemisphereLight(0xdde6f2, 0x2a1a1c, 0.25));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.25); key.position.set(-1.6, 2.2, 2.4); WV.scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.3); fill.position.set(2.2, 0.6, 1.8); WV.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff4a60, 1.1); rim.position.set(0.4, 1.2, -2.6); WV.scene.add(rim);
  const kick = new THREE.DirectionalLight(0xffffff, 0.15); kick.position.set(0, -2, 1); WV.scene.add(kick);
  WV.holder = new THREE.Group(); WV.scene.add(WV.holder);
  canvas.addEventListener('pointerdown', e => { WV.drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!WV.drag) return;
    WV.yaw += (e.clientX - WV.drag[0]) * 0.01; WV.pitch = Math.max(-0.9, Math.min(0.9, WV.pitch + (e.clientY - WV.drag[1]) * 0.006));
    WV.drag = [e.clientX, e.clientY]; WV.spin = 0; });
  canvas.addEventListener('pointerup', () => { WV.drag = null; WV.spin = 0.35; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); WV.cam.position.z = Math.max(1.2, Math.min(4, WV.cam.position.z + e.deltaY * 0.002)); }, { passive: false });
}
function wvShow(e){
  while (WV.holder.children.length) WV.holder.remove(WV.holder.children[0]);
  if (!e.model) return false;
  let m; try { m = e.model(); } catch (err) { console.warn('[pages] no model for ' + e.id, err); return false; }
  /* centre it and size it to the frame, whatever it was built at */
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const s = 1.15 / Math.max(size.x, size.y, size.z, 1e-3);
  const wrap = new THREE.Group(); m.position.sub(mid); wrap.add(m); wrap.scale.setScalar(s);
  m.traverse(o => { o.frustumCulled = false; });
  WV.holder.add(wrap);
  WV.yaw = Math.PI / 2; WV.pitch = 0.18; WV.spin = 0.35;
  return true;
}
function wvLoop(){
  if (pageOpen !== 'weapons'){ WV.raf = 0; return; }
  WV.raf = requestAnimationFrame(wvLoop);
  const c = WV.r.domElement, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * WV.r.getPixelRatio()) || c.height !== Math.round(h * WV.r.getPixelRatio())){ WV.r.setSize(w, h, false); WV.cam.aspect = w / Math.max(1, h); WV.cam.updateProjectionMatrix(); }
  WV.yaw += WV.spin * 0.016;
  WV.holder.rotation.set(WV.pitch, WV.yaw, 0);
  WV.r.render(WV.scene, WV.cam);
}

function renderWeaponsPage(){
  const pg = byId('wpnPage'); if (!pg) return;
  const list = wpnList();
  const e = list.find(x => x.id === wpnSel) || list[0], w = WEAPONS[e.slot], st = wpnStats(e);
  wpnSel = e.id;
  const groups = ['primary', 'sidearm', 'melee', 'gear', 'txf'].filter(g => list.some(x => x.grp === g));
  pg.querySelector('.pg-list').innerHTML = groups.map(g => `<div class="pg-grp">${t('wp.grp.' + g)}</div>` +
    list.filter(x => x.grp === g).map(x => `<button class="pg-item ${x.id === e.id ? 'on' : ''}" data-w="${x.id}">
      <b>${t('w.' + x.id)}</b><i>${x.agent ? AGENTS[x.agent].name : WEAPONS[x.slot].mode === 'MELEE' ? t('wp.mode.melee') : pgEsc(WEAPONS[x.slot].mode)}</i></button>`).join('')).join('');
  const i = list.indexOf(e);
  pg.querySelector('.pg-info').innerHTML = `
    <div class="pg-kicker">${t('wp.grp.' + e.grp)} · ${t('wp.key')} ${e.key}${e.agent ? ' · ' + AGENTS[e.agent].name : ''}</div>
    <h2>${t('w.' + e.id)}</h2>
    <div class="pg-mode">${w.melee ? t('wp.mode.melee') : w.ability ? t('wp.mode.gear') : pgEsc(w.mode)}${w.scope ? ' · ' + t('wm.scope') : w.redDot ? ' · ' + t('wp.reddot') : ''}</div>
    <p class="pg-desc">${pgEsc(wpnDesc(e))}</p>
    ${st.bars.length ? `<div class="pg-bars">${st.bars.map(([n, v]) => `<div class="pg-bar"><span>${n}</span><i><em style="width:${Math.round(v * 100)}%"></em></i></div>`).join('')}</div>` : ''}
    <div class="pg-stats">${st.rows.map(([n, v]) => `<div><span>${n}</span><b>${pgEsc(v)}</b></div>`).join('')}</div>
    ${e.agent ? `<button class="pg-link" data-agent="${e.agent}">${t('wp.seeagent')} ${AGENTS[e.agent].name} →</button>` : ''}
    <div class="pg-nav"><button data-step="-1">← ${t('pg.prev')}</button><span>${i + 1} / ${list.length}</span><button data-step="1">${t('pg.next')} →</button></div>`;
  const has = WV.r ? wvShow(e) : false;
  const ic = pg.querySelector('.pg-icon'); ic.hidden = has || !e.icon; if (e.icon) ic.src = e.icon;
  pg.querySelector('.pg-stage canvas').style.visibility = has ? 'visible' : 'hidden';
}

/* ---------- the agents ---------- */
const AG_ICON = { roll: 'cd-roll', xbow: 'cd-fire', smoke: 'cd-smoke', dash: 'cd-dash', gren: 'cd-grenade', zone: 'cd-zone',
                  sensor: 'cd-sensor', drone: 'cd-drone', dog: 'cd-dog', barrage: 'cd-fire', incen: 'cd-grenade', missile: 'cd-drone',
                  laser: 'cd-laser', tele: 'cd-tele', pulse: 'cd-pulse' };
/* the same kit, with the same live numbers, as the abilities page */
function agentKit(a){
  const ch = slot => ({ n: WEAPONS[slot].charges, cd: pgSec(WEAPONS[slot].cooldownMs) });
  return {
    aseed: [['P', 'hearing', {}], ['V', 'roll', { cd: pgSec(ROLL.cdMs) }], ['G', 'xbow', ch(XBOW)], ['X', 'smoke', ch(SMOKE)]],
    blast: [['P', 'djump', {}], ['V', 'dash', { cd: pgSec(DASH.cdMs) }], ['G', 'gren', ch(GRENADE)], ['X', 'zone', { dur: pgSec(ZONE.ms), cd: pgSec(ZONE.cdMs), hp: ZONE.regen }]],
    silvars: [['P', 'linked', { s: pgSec(SILV.linkMs), cd: pgSec(SILV.linkCdMs) }],
      ['V', 'sensor', { n: SILV.sensor.charges, r: SILV.sensor.radius, s: pgSec(SILV.linkMs), cd: pgSec(SILV.sensor.cdMs) }],
      ['G', 'drone', { life: pgSec(SILV.drone.lifeMs), or: SILV.order.range, lock: pgSec(SILV.drone.lockMs), dmg: SILV.drone.dmg, hp: SILV.drone.hp, cd: pgSec(SILV.drone.cdMs) }],
      ['X', 'dog', { sh: SILV.dog.shield, or: SILV.order.range, life: pgSec(SILV.dog.lifeMs), leash: SILV.dog.leash, gun: SILV.dog.gunDmg, bite: SILV.dog.bite, hp: SILV.dog.hp, cd: pgSec(SILV.dog.cdMs) }]],
    salvo: [['P', 'blastproof', { pct: Math.round((1 - SALVO.blastMul) * 100) }],
      ['V', 'barrage', { range: SALVO.barrage.range, warn: pgSec(SALVO.barrage.warnMs), n: SALVO.barrage.shells, r: SALVO.barrage.radius, dmg: SALVO.barrage.blast.dmg, cd: pgSec(SALVO.barrage.cdMs) }],
      ['G', 'incen', { n: SALVO.incen.charges, cd: pgSec(SALVO.incen.cdMs), fuse: pgSec(SALVO.incen.fragFuseMs), dmg: SALVO.frag.dmg }],
      ['X', 'missile', { life: pgSec(SALVO.missile.lifeMs), dmg: SALVO.missile.blast.dmg, n: SALVO.missile.bomblets, bd: SALVO.missile.bomb.dmg, hp: SALVO.missile.hp, cd: pgSec(SALVO.missile.cdMs) }]],
    txf: [['P', 'flight', { spd: TXF.fly.speed, fast: TXF.fly.fast, hp: TXF.hp }],
      ['V', 'laser', { dps: TXF.laser.dps, range: TXF.laser.range, heat: pgSec(TXF.laser.heatMs), cool: pgSec(TXF.laser.coolMs) }],
      ['G', 'tele', { range: TXF.tele.range, n: TXF.tele.charges, cd: pgSec(TXF.tele.cdMs) }],
      ['X', 'pulse', { r: TXF.pulse.radius, dmg: TXF.pulse.dmg, s: pgSec(TXF.pulse.showMs), cd: pgSec(TXF.pulse.cdMs) }]],
  }[a].map(([k, id, o]) => ({ k, id, name: t('ab.' + id), d: pgFill('ab.' + id + '.d', o) }));
}
/* which weapon page each piece of gear opens */
const AG_GEAR = { xbow: 'crossbow', smoke: 'crossbow', gren: 'grenade', sensor: 'sensor', incen: 'incen', missile: 'missile' };
let agSel = myAgent;
function renderAgentsPage(){
  const pg = byId('agPage'); if (!pg) return;
  const ids = agentIds(), a = ids.includes(agSel) ? agSel : myAgent, i = ids.indexOf(a), mine = a === myAgent;
  pg.querySelector('.pg-list').innerHTML = `<div class="pg-grp">${t('ag.roster')}</div>` + ids.map(id => `
    <button class="pg-item ag ${id === a ? 'on' : ''}" data-a="${id}"><b>${AGENTS[id].name}</b>
      <i>${id === myAgent ? t('ag.yours') : pgEsc(t(id + '.kit'))}</i></button>`).join('');
  pg.querySelector('.pg-info').innerHTML = `
    <div class="pg-kicker">${t('ag.agent')} ${i + 1} / ${ids.length}${mine ? ' · ' + t('ag.yours') : ''}</div>
    <h2>${AGENTS[a].name}</h2>
    <div class="pg-mode">${pgEsc(t(a + '.passive'))}</div>
    <div class="pg-facts"><div><span>${t('ag.jumps')}</span><b>${AGENTS[a].jumps}</b></div><div><span>${t('ag.move')}</span><b>${t('ab.' + agentKit(a)[1].id)}</b></div></div>
    <div class="pg-kit">${agentKit(a).map(r => `<div class="pg-ab">
      ${AG_ICON[r.id] ? `<img src="assets/${AG_ICON[r.id]}.png" alt="">` : '<span class="pg-pass">P</span>'}
      <div><div class="pg-abh"><kbd>${r.k === 'P' ? t('ab.passive') : r.k}</kbd><b>${r.name}</b>${AG_GEAR[r.id] ? `<button class="pg-mini" data-wpn="${AG_GEAR[r.id]}">${t('ag.seeweapon')}</button>` : ''}</div>
      <p>${pgEsc(r.d)}</p></div></div>`).join('')}</div>
    <button class="pg-select ${mine ? 'done' : ''}" ${mine ? 'disabled' : ''}>${mine ? t('ag.selected') : t('ag.select') + ' ' + AGENTS[a].name}</button>
    <div class="pg-nav"><button data-step="-1">← ${t('pg.prev')}</button><span>${i + 1} / ${ids.length}</span><button data-step="1">${t('pg.next')} →</button></div>`;
  setHeroLook(a);                              // the podium wears whoever you are looking at
}
function agentChoose(a){
  if (myAgent !== 'txf') txf.prevAgent = myAgent;     // where clearing TxF's code puts you back
  myAgent = a;
  try { localStorage.setItem('cx.agent', myAgent); } catch (e) {}
  renderLobbyCards(); renderAgentsPage(); Sfx.swap();
}

/* ---------- opening and closing ---------- */
function openPage(name){
  if (gameState !== 'home') return;
  closePage(true);
  pageOpen = name;
  document.body.classList.add('page-on', 'page-' + name);
  const pg = byId(name === 'weapons' ? 'wpnPage' : 'agPage'); pg.classList.remove('hidden');
  if (name === 'weapons'){ wvInit(pg.querySelector('.pg-stage canvas')); renderWeaponsPage(); if (!WV.raf) wvLoop(); }
  else { agSel = myAgent; renderAgentsPage(); }
  document.querySelectorAll('#lbTabs .lb-tab').forEach(b => b.classList.toggle('on', b.dataset.page === name));
  Sfx.swap();
}
function closePage(quiet){
  if (!pageOpen) return;
  const was = pageOpen; pageOpen = null;
  document.body.classList.remove('page-on', 'page-weapons', 'page-agents');
  byId('wpnPage').classList.add('hidden'); byId('agPage').classList.add('hidden');
  if (was === 'agents') setHeroLook(myAgent);  // put your own agent back on the podium
  const on = document.querySelector('.lb-pane.on');
  document.querySelectorAll('#lbTabs .lb-tab').forEach(b => b.classList.toggle('on', !!on && b.dataset.tab === on.dataset.pane));
  if (!quiet) Sfx.swap();
}

/* ---------- the markup, built once ---------- */
(function buildPages(){
  const home = byId('home'); if (!home) return;
  const shell = (id, stage) => `<div class="mpage hidden" id="${id}">
    <header class="pg-top"><button class="pg-back">← <span data-i18n="pg.back">BACK</span></button>
      <h1 data-i18n="${id === 'wpnPage' ? 'pg.weapons' : 'pg.agents'}"></h1><span class="pg-esc">Esc</span></header>
    <nav class="pg-list"></nav>${stage}<section class="pg-info"></section></div>`;
  home.insertAdjacentHTML('beforeend',
    shell('wpnPage', '<div class="pg-stage"><canvas></canvas><img class="pg-icon" alt="" hidden><div class="pg-hint" data-i18n="pg.drag">drag to turn · scroll to zoom</div></div>') +
    shell('agPage', '<div class="pg-stage pg-clear"><div class="pg-hint" data-i18n="pg.drag2">drag the agent to turn them</div></div>'));
  for (const el of home.querySelectorAll('.mpage [data-i18n]')) el.textContent = t(el.dataset.i18n);
  home.querySelectorAll('.mpage .pg-back').forEach(b => b.onclick = () => closePage());
  /* one click handler per page, reading what was clicked */
  byId('wpnPage').addEventListener('click', ev => {
    const it = ev.target.closest('[data-w]'), st = ev.target.closest('[data-step]'), ag = ev.target.closest('[data-agent]');
    if (it){ wpnSel = it.dataset.w; renderWeaponsPage(); Sfx.swap(); }
    if (st){ const L = wpnList(), i = L.findIndex(x => x.id === wpnSel); wpnSel = L[(i + +st.dataset.step + L.length) % L.length].id; renderWeaponsPage(); Sfx.swap(); }
    if (ag){ openPage('agents'); agSel = ag.dataset.agent; renderAgentsPage(); }
  });
  byId('agPage').addEventListener('click', ev => {
    const it = ev.target.closest('[data-a]'), st = ev.target.closest('[data-step]'), sel = ev.target.closest('.pg-select'), wp = ev.target.closest('[data-wpn]');
    const ids = agentIds();
    if (it){ agSel = it.dataset.a; renderAgentsPage(); Sfx.swap(); }
    if (st){ agSel = ids[(ids.indexOf(agSel) + +st.dataset.step + ids.length) % ids.length]; renderAgentsPage(); Sfx.swap(); }
    if (sel && !sel.disabled) agentChoose(agSel);
    if (wp){ wpnSel = wp.dataset.wpn; openPage('weapons'); }
  });
  /* the top bar: AGENTS and WEAPONS open their pages (session.js wires the
     panes; these two are pages, so they get their own handler) */
  document.querySelectorAll('#lbTabs .lb-tab[data-page]').forEach(b => b.onclick = () => openPage(b.dataset.page));
  document.querySelectorAll('#lbTabs .lb-tab[data-tab]').forEach(b => { const go = b.onclick; b.onclick = () => { closePage(true); go(); }; });
  byId('cardAgent').onclick = () => openPage('agents');
  addEventListener('keydown', e => {
    if (!pageOpen) return;
    if (typeof typingInField === 'function' && typingInField(e.target)) return;
    if (e.code === 'Escape'){ e.preventDefault(); closePage(); }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'ArrowRight'){
      const step = (e.code === 'ArrowDown' || e.code === 'ArrowRight') ? 1 : -1; e.preventDefault();
      const b = byId(pageOpen === 'weapons' ? 'wpnPage' : 'agPage').querySelector(`[data-step="${step}"]`); if (b) b.click();
    }
  });
})();
/* a language switch re-renders whichever page is up */
const _pgApplyLang = applyLang;
applyLang = function(){
  _pgApplyLang();
  document.querySelectorAll('.mpage [data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  if (pageOpen === 'weapons') renderWeaponsPage();
  if (pageOpen === 'agents') renderAgentsPage();
};
