/* =============================================================
   Crimson X — i18n.js  (loaded with config.js, ahead of core.js)

   Language. English and 简体中文, picked in the top bar and remembered.

   It sits outside the numbered 1..10 chain for the same reason config.js
   does: it depends on nothing, and everything after it may want `t()` at
   load time — session.js builds the settings rows and the armory while it
   runs, not on a click.

   Two ways to translate, and they cover different problems:

   - MARKUP carries `data-i18n="key"` and `applyLang()` rewrites the text.
     The English in the HTML stays put as the fallback and as the thing you
     read while editing the file, so a missing key degrades to English
     rather than to an empty element.
   - CODE calls `t('key')` for anything built at runtime.

   `applyLang()` re-runs every re-renderable piece of UI, because a language
   switch has to repaint what is already on screen, not just what is drawn
   next. Anything that renders text from JS must be called from there or it
   will sit in the old language until something else happens to redraw it.

   NOT translated, on purpose: player names and room codes (they are data,
   not copy), and the in-play kill feed and toasts, which are assembled from
   fragments at a dozen call sites. The menus, the HUD labels and the pause
   and settings panels are.
   ============================================================= */

const STRINGS = {
  en: {
    'tab.start':'START', 'tab.operators':'OPERATORS', 'tab.arsenal':'ARSENAL', 'tab.controls':'CONTROLS',
    'top.settings':'SETTINGS',
    'card.agent':'AGENT', 'card.mode':'MODE', 'card.map':'MAP',
    'btn.prepare':'PREPARE',
    'mode.mp':'MULTIPLAYER', 'mode.mp.sub':'Round-based duelling · first to 3',
    'mode.bots':'TARGET PRACTICE', 'mode.bots.sub':'Offline range · nothing shoots back',
    'start.tagline':'Step onto the live-fire range. Five weapons, a scoped sniper, and an arena built for peeking, perching and precision.',
    'start.hint':'drag to inspect your operator · move the mouse to look around',
    'start.ready':'READY TO DEPLOY',
    'op.callsign':'CALLSIGN',
    'op.lead':'Pick who you drop in as. Locked once the match starts.',
    'op.passive':'Passive',
    'aseed.passive':'hears gunfire through walls',
    'aseed.kit':'roll · fire bolt · smoke tag',
    'blast.passive':'double jump',
    'blast.kit':'dash · grenade ×2 · the zone',
    'arsenal.lead':'Everything you can carry. Guns are bought in the shop between rounds.',
    'controls.lead':'Mouse to look, left click to fire, right click to aim.',
    'foot.switch':'switch tab', 'foot.armory':'armory', 'foot.online':'online',
    'w.rifle':'RIFLE', 'w.sniper':'SNIPER', 'w.shotgun':'SHOTGUN', 'w.pistol':'PISTOL',
    'w.pistolx':'PISTOL X', 'w.crossbow':'CROSSBOW', 'w.smoke':'SMOKE', 'w.blade':'BLADE',
    'w.grenade':'GRENADE', 'w.zone':'THE ZONE',
    'wm.auto':'AUTO', 'wm.scope':'4× SCOPE', 'wm.pellet':'8 PELLET', 'wm.semi':'SEMI',
    'wm.fire':'G · FIRE', 'wm.tag':'X · TAG', 'wm.combo':'F · COMBO',
    'k.move':'move', 'k.jump':'jump / climb', 'k.crouch':'crouch', 'k.prone':'prone', 'k.reload':'reload',
    'k.weapons':'weapons', 'k.ability1':'ability 1', 'k.ability2':'ability 2', 'k.blade':'blade',
    'k.move2':'dash / roll', 'k.peekl':'peek left', 'k.peekr':'peek right', 'k.sprint':'sprint',
    'k.armory':'armory', 'k.aim':'aim',
    'lobby.title':'PICK A ROOM',
    'lobby.lead':'Drop into any room with space, or make one and share the code.',
    'lobby.quick':'QUICK PLAY', 'lobby.create':'CREATE ROOM', 'lobby.join':'JOIN',
    'lobby.code':'CODE', 'lobby.open':'OPEN ROOMS', 'lobby.refresh':'↻ REFRESH', 'lobby.back':'← BACK',
    'lobby.none':'No rooms yet — Quick Play opens one, or create a room and share the code.',
    'lobby.creating':'Creating…',
    'lobby.nocode':'The server could not open a room.',
    'lobby.shared':'share that code',
    'lobby.unreachable':'Could not reach the server.',
    'lobby.fiveletters':'A room code is 5 letters.',
    'lobby.waking':'Waking the server up…',
    'room.waiting':'WAITING', 'room.paused':'PAUSED', 'room.buy':'BUY WINDOW', 'room.round':'ROUND',
    'pause.title':'PAUSED', 'pause.resume':'RESUME',
    'pause.quit':'✕ QUIT TO MENU',
    'pause.mp':'Multiplayer', 'pause.bots':'Target Practice',
    'set.title':'SETTINGS', 'set.lead':'Lower settings = cooler machine and quieter fans.',
    'set.tab.graphics':'GRAPHICS', 'set.tab.gameplay':'GAMEPLAY', 'set.tab.abilities':'ABILITIES',
    'pause.graphics':'SETTINGS', 'set.back':'BACK', 'set.change':'CHANGE', 'set.info':'INFO', 'set.practice':'RANGE',
    'set.sec.preset':'QUICK PRESET', 'set.sec.display':'DISPLAY', 'set.sec.controls':'CONTROLS & HUD',
    'set.sec.options':'OPTIONS', 'set.sec.kits':'AGENT KITS',
    'setl.fpsCap':'FRAME CAP', 'setl.resScale':'RESOLUTION', 'setl.shadows':'SHADOWS', 'setl.bloom':'BLOOM',
    'setl.look':'LIGHTING', 'setl.sens':'SENSITIVITY', 'setl.hitZone':'HIT MARKER', 'setl.mapSize':'MINIMAP',
    'setl.showBoxes':'HITBOXES', 'setl.infAmmo':'UNLIMITED AMMO', 'setl.noSpread':'NO SPREAD',
    'setl.ricochetStart':'BOLTS START', 'setl.noCooldown':'NO COOLDOWN',
    'setd.fpsCap':'How many frames are drawn each second. The biggest heat saver there is: 60 looks smooth and halves the work of an uncapped 144Hz.',
    'setd.resScale':'The resolution the game renders at. 200% draws four times the pixels; 100% usually looks nearly the same.',
    'setd.shadows':'Detail of the shadows cast by players and moving things. The map\'s own shadows are baked and cost nothing either way.',
    'setd.bloom':'Glow around bright light: the rooflights, muzzle flashes, a burning pool.',
    'setd.look':'LIT works the light out from the fixtures and the sky, with real soft shadows. FLAT is the original even lighting, and a little faster.',
    'setd.sens':'Mouse look speed. 1x is the original feel; aiming down sights slows it further on top of this.',
    'setd.hitZone':'Colour the hit marker by where the round landed - head, body or limb - and name it under the crosshair.',
    'setd.mapSize':'The size the corner map starts at. M cycles it in play: small, large, then the whole site.',
    'setd.showBoxes':'Draw the hit zones on the practice targets, exactly as the game tests them.',
    'setd.infAmmo':'Magazines never run dry. Practice range only - it never applies in a match.',
    'setd.noSpread':'Every round goes exactly through the crosshair at any range. Practice range only.',
    'setd.ricochetStart':'Whether Aseed\'s crossbow and smoke bolts start each round banking off walls. Right-click still switches it mid-fight.',
    'setd.noCooldown':'Abilities never run out of charges. Practice range only.',
    'set.lead.gameplay':'How it handles. Practice rows only appear on the range.',
    'set.lead.abilities':'What each agent carries. Change agent in OPERATORS.',
    'ab.you':'YOU', 'ab.passive':'PASS',
    'ab.hearing':'HEARING', 'ab.hearing.d':'An enemy who fires within 40m shows through walls for 4s. Then 30s before it can happen again.',
    'ab.roll':'ROLL', 'ab.roll.d':'A fast ~7m roll in any direction. {cd}s cooldown.',
    'ab.xbow':'FLAMING CROSSBOW', 'ab.xbow.d':'90 to the head, 50 to the body, then a burn and a fire pool. {n} charges, {cd}s each. Right-click to ricochet.',
    'ab.smoke':'SMOKE TAG', 'ab.smoke.d':'A cloud that marks anyone inside it for you, through walls. {n} charges, {cd}s each. Right-click to ricochet.',
    'ab.djump':'DOUBLE JUMP', 'ab.djump.d':'A second jump in the air.',
    'ab.dash':'DASH', 'ab.dash.d':'A ~9m burst, on the ground or in the air. {cd}s cooldown, reset by a kill.',
    'ab.gren':'FRAG GRENADE', 'ab.gren.d':'Lobbed, bounces, goes off after 2s: 90 at the centre. {n} charges, {cd}s each.',
    'ab.zone':'THE ZONE', 'ab.zone.d':'{dur}s of faster sprint, steadier aim, quicker reloads and +{hp} HP a second. {cd}s cooldown.',
    'set.performance':'PERFORMANCE', 'set.balanced':'BALANCED', 'set.quality':'QUALITY',
    'set.current':'CURRENT:', 'set.done':'DONE',
    'hud.health':'HEALTH', 'hud.stance':'STANCE:', 'hud.detect':'DETECT',
    'map.title':'SITE PLAN', 'map.close':'M to close',
    'hud.board':'Scoreboard', 'hud.armory':'ARMORY',
    'hud.armoryhint':'Click a weapon or press its number · Tab to close',
    'hud.eliminated':'ELIMINATED', 'hud.watching':'watching until the next round',
    'stance.stand':'STANDING', 'stance.crouch':'CROUCHING', 'stance.prone':'PRONE',
    'status.offline':'Target Practice — offline', 'status.connecting':'connecting…',
  },

  zh: {
    'tab.start':'开始', 'tab.operators':'干员', 'tab.arsenal':'军械库', 'tab.controls':'操作',
    'top.settings':'设置',
    'card.agent':'干员', 'card.mode':'模式', 'card.map':'地图',
    'btn.prepare':'准备出战',
    'mode.mp':'多人对战', 'mode.mp.sub':'回合制对决 · 先胜三局',
    'mode.bots':'靶场训练', 'mode.bots.sub':'离线靶场 · 目标不会还手',
    'start.tagline':'进入实弹靶场。五把枪械、一把带瞄准镜的狙击枪，以及一座为探头、架点与精准射击而生的竞技场。',
    'start.hint':'拖动可查看你的干员 · 移动鼠标环顾四周',
    'start.ready':'可以出战',
    'op.callsign':'代号',
    'op.lead':'选择你要使用的干员。比赛开始后不可更改。',
    'op.passive':'被动',
    'aseed.passive':'可隔墙听到枪声',
    'aseed.kit':'翻滚 · 火焰弩箭 · 烟雾标记',
    'blast.passive':'二段跳',
    'blast.kit':'冲刺 · 手雷 ×2 · 领域',
    'arsenal.lead':'你能携带的全部装备。枪械在回合之间于商店购买。',
    'controls.lead':'鼠标控制视角，左键射击，右键瞄准。',
    'foot.switch':'切换标签', 'foot.armory':'军械库', 'foot.online':'在线',
    'w.rifle':'步枪', 'w.sniper':'狙击枪', 'w.shotgun':'霰弹枪', 'w.pistol':'手枪',
    'w.pistolx':'手枪 X', 'w.crossbow':'弩', 'w.smoke':'烟雾弹', 'w.blade':'近战刀',
    'w.grenade':'手雷', 'w.zone':'领域',
    'wm.auto':'全自动', 'wm.scope':'4× 倍镜', 'wm.pellet':'8 弹丸', 'wm.semi':'半自动',
    'wm.fire':'G · 燃烧', 'wm.tag':'X · 标记', 'wm.combo':'F · 连击',
    'k.move':'移动', 'k.jump':'跳跃 / 攀爬', 'k.crouch':'蹲伏', 'k.prone':'卧倒', 'k.reload':'换弹',
    'k.weapons':'切换武器', 'k.ability1':'技能一', 'k.ability2':'技能二', 'k.blade':'近战',
    'k.move2':'冲刺 / 翻滚', 'k.peekl':'左探头', 'k.peekr':'右探头', 'k.sprint':'疾跑',
    'k.armory':'军械库', 'k.aim':'瞄准',
    'lobby.title':'选择房间',
    'lobby.lead':'加入任意有空位的房间，或开一个房间把房间码分享出去。',
    'lobby.quick':'快速游戏', 'lobby.create':'创建房间', 'lobby.join':'加入',
    'lobby.code':'房间码', 'lobby.open':'公开房间', 'lobby.refresh':'↻ 刷新', 'lobby.back':'← 返回',
    'lobby.none':'暂时没有房间——快速游戏会开一个，或者创建房间后分享房间码。',
    'lobby.creating':'正在创建…',
    'lobby.nocode':'服务器无法开启房间。',
    'lobby.shared':'把这个房间码分享出去',
    'lobby.unreachable':'无法连接服务器。',
    'lobby.fiveletters':'房间码是 5 个字母。',
    'lobby.waking':'正在唤醒服务器…',
    'room.waiting':'等待中', 'room.paused':'已暂停', 'room.buy':'购买阶段', 'room.round':'第',
    'pause.title':'已暂停', 'pause.resume':'继续游戏',
    'pause.quit':'✕ 退出到主菜单',
    'pause.mp':'多人对战', 'pause.bots':'靶场训练',
    'set.title':'设置', 'set.lead':'画质越低，机器越凉，风扇越安静。',
    'set.tab.graphics':'画面', 'set.tab.gameplay':'玩法', 'set.tab.abilities':'技能',
    'pause.graphics':'设置', 'set.back':'返回', 'set.change':'调整', 'set.info':'说明', 'set.practice':'练习',
    'set.sec.preset':'快速预设', 'set.sec.display':'显示', 'set.sec.controls':'操作与界面',
    'set.sec.options':'选项', 'set.sec.kits':'特工技能',
    'setl.fpsCap':'帧率上限', 'setl.resScale':'渲染分辨率', 'setl.shadows':'阴影', 'setl.bloom':'泛光',
    'setl.look':'光照', 'setl.sens':'灵敏度', 'setl.hitZone':'命中提示', 'setl.mapSize':'小地图',
    'setl.showBoxes':'显示判定框', 'setl.infAmmo':'无限弹药', 'setl.noSpread':'无散布',
    'setl.ricochetStart':'弩箭初始', 'setl.noCooldown':'无冷却',
    'setd.fpsCap':'每秒绘制的帧数。最省发热的一项：60 帧已经流畅，工作量只有 144Hz 不限帧的一半。',
    'setd.resScale':'游戏渲染的分辨率。200% 绘制四倍像素，100% 通常几乎看不出区别。',
    'setd.shadows':'玩家与移动物体投下的阴影精度。地图本身的阴影已预先烘焙，开关都不耗性能。',
    'setd.bloom':'强光周围的光晕：顶灯、枪口火焰、燃烧的火池。',
    'setd.look':'"光照"会根据灯具与天空计算真实的光与柔和阴影；"平光"是原始的均匀光照，略快一些。',
    'setd.sens':'鼠标视角速度。1x 为原始手感；开镜瞄准时还会在此基础上再降低。',
    'setd.hitZone':'按命中部位（头部、躯干、四肢）为命中提示着色，并在准星下方显示部位。',
    'setd.mapSize':'角落小地图的初始大小。游戏中按 M 循环：小、大、全图。',
    'setd.showBoxes':'在练习靶上画出判定区域，与游戏实际检测完全一致。',
    'setd.infAmmo':'弹匣永不打空。仅限练习场，对战中从不生效。',
    'setd.ricochetStart':'Aseed 的火焰弩与烟雾弹每回合开始时是否默认反弹。战斗中仍可右键切换。',
    'setd.noSpread':'任何距离每一发都精确穿过准星。仅限练习场。',
    'setd.noCooldown':'技能充能永不耗尽。仅限练习场。',
    'set.lead.gameplay':'操作手感。练习专用项只在练习场显示。',
    'set.lead.abilities':'每位特工的技能。更换特工请到"特工"页。',
    'ab.you':'当前', 'ab.passive':'被动',
    'ab.hearing':'听觉', 'ab.hearing.d':'40 米内开火的敌人会透墙显示 4 秒，之后 30 秒内不会再次触发。',
    'ab.roll':'翻滚', 'ab.roll.d':'向任意方向快速翻滚约 7 米。冷却 {cd} 秒。',
    'ab.xbow':'火焰弩', 'ab.xbow.d':'爆头 90、身体 50，随后燃烧并留下火池。{n} 次充能，每次 {cd} 秒。右键切换反弹。',
    'ab.smoke':'烟雾标记', 'ab.smoke.d':'烟雾中的敌人会被你透墙标记。{n} 次充能，每次 {cd} 秒。右键切换反弹。',
    'ab.djump':'二段跳', 'ab.djump.d':'在空中再跳一次。',
    'ab.dash':'冲刺', 'ab.dash.d':'地面或空中冲刺约 9 米。冷却 {cd} 秒，击杀后立即重置。',
    'ab.gren':'破片手雷', 'ab.gren.d':'抛出后可反弹，2 秒后爆炸，中心伤害 90。{n} 次充能，每次 {cd} 秒。',
    'ab.zone':'领域', 'ab.zone.d':'{dur} 秒内冲刺更快、瞄准更稳、换弹更快，每秒回复 {hp} 生命。冷却 {cd} 秒。',
    'set.performance':'流畅', 'set.balanced':'均衡', 'set.quality':'画质',
    'set.current':'当前：', 'set.done':'完成',
    'hud.health':'生命值', 'hud.stance':'姿态：', 'hud.detect':'感知',
    'map.title':'厂区平面图', 'map.close':'按 M 关闭',
    'hud.board':'计分板', 'hud.armory':'军械库',
    'hud.armoryhint':'点击武器或按它的数字键 · 按 Tab 关闭',
    'hud.eliminated':'已阵亡', 'hud.watching':'观战至下一回合',
    'stance.stand':'站立', 'stance.crouch':'蹲伏', 'stance.prone':'卧倒',
    'status.offline':'靶场训练 — 离线', 'status.connecting':'连接中…',
  },
};

/* The remembered choice, else the browser's own language, else English.
   `zh` covers zh-CN, zh-TW and friends: the copy is Simplified, and showing
   it to a Traditional reader is far better than showing them English. */
let LANG = (() => {
  try { const s = localStorage.getItem('cx.lang'); if (STRINGS[s]) return s; } catch (e) {}
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
})();

/* Falls back to English, then to the key itself — a missing translation
   should read as English, never as a blank space on the screen. */
function t(key, fallback) {
  const pack = STRINGS[LANG] || STRINGS.en;
  if (pack[key] != null) return pack[key];
  if (STRINGS.en[key] != null) return STRINGS.en[key];
  return fallback != null ? fallback : key;
}

/* Rewrite everything on screen. `data-i18n` sets text, `data-i18n-ph` sets a
   placeholder, `data-i18n-title` a tooltip. Then every renderer that builds
   text from JS is re-run, because switching language must repaint what is
   ALREADY drawn and not just the next thing drawn. */
function applyLang() {
  document.documentElement.lang = (LANG === 'zh') ? 'zh-CN' : 'en';
  document.body.classList.toggle('lang-zh', LANG === 'zh');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('#langSw button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  /* Re-render the pieces that are built in JS. Each is guarded: this runs at
     load time too, before some of them are defined. */
  if (typeof renderSettingsUI === 'function') renderSettingsUI();
  if (typeof renderLobbyCards === 'function') renderLobbyCards();
  if (typeof renderArsenal === 'function') renderArsenal();
  if (typeof updateHUD === 'function' && typeof me !== 'undefined') updateHUD();
  if (typeof updateStanceLabel === 'function') updateStanceLabel();
  /* The armory grid is only rebuilt when it is OPEN: renderArmory() reads
     live match state (money, what you own) and calling it from here at
     load time would run before any of that exists. */
  if (typeof renderArmory === 'function' && typeof armoryOpen !== 'undefined' && armoryOpen) renderArmory();
}

/* First paint of the chosen language. Deferred to DOMContentLoaded because
   the renderers applyLang() re-runs live further down the load chain —
   hud.js and loop.js have not executed yet while this file is parsed, and
   the scripts sit at the end of <body>, so this fires after all of them. */
addEventListener('DOMContentLoaded', applyLang);

function setLang(code) {
  if (!STRINGS[code] || code === LANG) return;
  LANG = code;
  try { localStorage.setItem('cx.lang', code); } catch (e) {}
  applyLang();
}
