# Plan: the characters (started 2026-11-27)

Jack's character roster for Crimson X. **Characters first, nothing else for
now**: story, missions, NPCs and bosses come after the roster is settled.
Every character goes in this file, including the two already in the game.

## The template every agent follows

| Part | What it is |
|---|---|
| Name | shown on the OPERATORS card and the AGENT card |
| Role | one word for the job (new: not in the game yet) |
| Passive | always on, nothing to press |
| V | movement / utility, short cooldown |
| G | aimed or thrown ability, charges |
| X | utility or ultimate |
| Backstory | two or three lines (new: not in the game yet) |
| Look | their own operator variant: helmet, plates, accent colour (new: today every agent shares one model) |
| Voice | one line of how they talk, for radio chatter later (new) |

In code an agent is `AGENTS` in `mp/public/weapons.js` + `AGENT_IDS` in
`mp/server.js` (must match), a card in `index.html`, strings in `i18n.js`
(EN + 简体中文), three cooldown icons `assets/cd-*.png` (Jack's art), and a
server check on every ability (`p.agent`).

**Polish rule (Jack, 2026-11-28): every agent ships finished.** The
abilities must play well: tuned, with clear effects, sounds and feedback,
and checked by playing them. The model and every piece of gear (held
devices, thrown items, launchers, placed objects) must be detailed drawn
models like the guns, crossbow, sensor and grenade, never placeholder
boxes. Each piece also gets its entry on the weapons and agents pages.

---

## 1. ASEED (in the game)

| | |
|---|---|
| Name | **Aseed** |
| Role | *to decide* |
| Passive | **Hearing**: an enemy who fires a gun, bolt or smoke bolt within 40m is shown through walls for 4s; then 30s before it can trigger again. Blade swings are silent. |
| Passive (new, planned) | **Trap sense**: Aseed can see enemy TRAPS through walls, the same see-through outline he gets on a heard player. First trap: Silvars' sensor. |
| V | **Roll**: ~7.4m in 0.62s, 1.2s cooldown. **Jump roll** (added 2026-11-27): press V in the air after a jump and the roll fires on landing, ~10.2m in 0.87s. |
| G | **Flaming crossbow**: 2 charges, 30s each. 90 head / 50 body, then burns 12/s for 5s; leaves a fire pool (18/s while inside, 9s). Right-click: ricochet once. |
| X | **Smoke tag**: 2 charges, 30s each. A cloud (5.5m radius) that marks anyone inside it for 4s, seen through walls by Aseed. |
| Jumps | one |
| Backstory | *to decide* |
| Look | *to decide* |
| Voice | *to decide* |

## 2. BLAST (in the game)

| | |
|---|---|
| Role | *to decide* |
| Passive | **Double jump** (second jump slightly weaker). Single jump 2.3m high; double jump up to ~4.1m. |
| V | **Dash**: ~9m in 0.45s, works in the air, 5s cooldown, reset by a kill. |
| G | **Frag grenade**: 2 charges, 30s each. Bounces, explodes after 2s; 90 within 1.5m, falling to 0 at 5.5m; cover blocks it; never hurts the thrower. |
| X | **The Zone**: 25s buff, then 90s cooldown. Sprint 12 m/s (everyone else 8.4), faster ADS, tighter aim (x0.55 spread), +10 HP/s, reloads in 60% of the time. |
| Jumps | two |
| Backstory | *to decide* |
| Look | *to decide* |
| Voice | *to decide* |

## 3. SILVARS (new, Jack's design; BUILT 2026-11-27)

| | |
|---|---|
| Role | Recon / robotics (*suggested*) |
| Passive | **Linked Sight**: Silvars and his own robots share what they see. An enemy seen by any of them is shown to Silvars for 2s, with **a health bar above their head** for that time. |
| V | **Sensor**: placed **by hand** on the surface of an object. It must sit ON the surface and stay visible to opponents (never sunk into the wall). When a player enters its small area it detects them and lets Silvars see them through walls for ~2s. **30s cooldown, for both placing and re-scanning**: it scans only when it detects someone, then needs 30s before it can trigger again (not a fixed 30s pulse). It makes a small sound that **everyone can hear**; Aseed can also SEE it through walls with his trap sense. It is destroyed when it takes damage. |
| G | **Drone**: summons one flying drone; only one at a time. **60 HP** (can be shot down). It hunts enemies, and after looking at a player for 1s it crashes into them for **40 damage** and is **destroyed by the crash**. **40s cooldown, starting when the ability is used.** |
| X | **Dog Bot**: a robot dog with **200 HP**, close-combat attack and a small gun that deals **10 damage per shot**. **Stays until destroyed**; **70s cooldown** after that. It hunts **near Silvars**, within a range it must stay inside. **When first released it runs 10m forward** (no damage from the run itself); if it detects a player on the way it pounces on them. |
| Bots | Both the drone and the dog find the enemy, track and attack them. Both feed Linked Sight. |
| Credit | Everything the drone and dog do is credited to Silvars (damage, kills, money, round wins). **No kill-resets-cooldown** for Silvars. |
| Death | When Silvars dies, his drone and dog die with him. |
| Backstory | *suggested*: the station's robotics technician, who built the inspection drones for the boiler flues and the robot dog for the cable tunnels. |
| Look | *to decide* |
| Voice | *to decide* |

Agreed with Jack 2026-11-27: health bar above the head; sensor by hand,
visible on the surface; 30s for placing and re-scanning, triggered by
detection; drone 60 HP, 40 crash damage, destroyed on crash, cooldown from
use; dog until destroyed, 70s cooldown, stays near Silvars, 10m dash on
release.

**Suggested numbers (not agreed yet):**
- Sensor: scans an 8m radius; one out at a time.
- Drone: dodge it by breaking line of sight before the 1s lock.
- Dog: stays within ~15m of Silvars; bite 25; gun fires every 0.5s out to 20m; about sprint speed.

**Multiplayer:** the same numbers everywhere; bots are not weakened for multiplayer (Jack, 2026-11-27).

**Still open:**
1. Dog leash range, bite damage, gun fire rate (suggested above).
2. Sensor scan radius (suggested 8m).
3. One sensor at a time, or several?

**Reference: Saltline's Gull and Hound** (Jack, 2026-11-27: "refer to the
design for Saltline ... not just the design but generally"). Saltline
(`Mini games/SALETINE`) has exactly these two robots as its enemies: the
drone is the **Gull**, the robot dog is the **Hound**. Silvars' bots take
their look AND their behaviour from them. What Saltline does, read from its
code and its showcase (`Saltline.html?show=enemies&eshow=gull|hound`):

*Gull -> Silvars' drone*
- Look: a quad-rotor with four ducted fans (white shells, orange rims,
  yellow/black hazard tabs), a small central pod, two whip antennas, a chin
  sensor/gun with a searchlight that throws a visible beam where it looks,
  a stencilled ID ("G-11").
- Flight: hovers and orbits at 4-8m, up to 8 m/s, eases in and out; banks
  and pitches as it moves.
- Warning before it attacks: a 0.55s "telegraph" - the lens glows brighter
  and a warning sound plays - then it fires. **Use this for the 1s lock**:
  the lens and beam brighten over the second, so the target can see and hear
  it coming and break line of sight.
- Damaged: trails smoke and sparks. Destroyed: spins, falls, crashes with
  debris. Saltline's Gull also has a 3m blast (30 damage) - our drone's
  40-damage crash plays like that.
- Sound: a rotor whine whose pitch rises with speed (3D-placed), a cry, a
  death sound.

*Hound -> Silvars' dog*
- Look: a four-legged robot dog: white/grey body panels with orange stripes,
  black jointed legs with round knee joints and feet, a sensor block for a
  head, an antenna, an amber beacon, a stencilled ID.
- Movement: a real walking gait - feet planted on the ground and stepped in
  diagonal pairs, body pitching and rolling with the ground and with
  speed-ups and turns, a footstep sound on every step, a servo whine.
  Speeds: patrol 1.5, stalk 2, run 4.5 m/s. Hounds push apart so they do
  not stack.
- Fighting: picks a firing spot using cover, keeps 8-18m away, turns to
  face, 0.5s telegraph, then a 4-shot burst. **Lunge**: within 3m it winds
  up (0.28s warning), then leaps at 9.5 m/s for a hit; 3.5s before the next.
  **This is the pounce** (release run, and its close-combat attack).
- Destroyed: sparks, collapses, bounces, lies as a wreck, sinks away.
- Senses (both robots): sight 45m in a 200-degree cone, lose a target after
  4s unseen, search 8s, hear gunfire within 45m. Only two robots may attack
  at the same moment, 1.25s apart, so attacks never all land at once.

*Our numbers stay Jack's*: drone 60 HP / 40 crash; dog 200 HP, gun 10 a
shot, 70s cooldown. Saltline's speeds need one change: its Hound runs 4.5
m/s, slower than our 5.6 walk, so **our dog must run at least sprint speed
(8.4)** to keep up with Silvars and catch players.

**Decided (Jack, 2026-11-27, changed from "copy"): our OWN versions,
modified from Saltline's Gull and Hound.** Drawn in code in `drawn.js` like
the rest of the game's models, following the Gull's and Hound's shape,
parts and behaviour above, but made Crimson X's own - not a copy of
Saltline's models. Credit Saltline as the reference.

**Paint (Jack, 2026-11-27): more SILVER.** The drone and dog are mostly
silver metal rather than Saltline's white-and-orange panels. **Trim is crimson** (stripes, rims, hazard tabs, lights) to tie them to Crimson X.

**Build note:** the drone and dog are real AI units that must find their way
round the map and be run by the server. This is separate from the practice
bots, which stay untouched (Jack's rule).

---

## 4. SALVO (new, Jack's design; BUILT 2026-11-28)

Jack: an explosives agent modelled on Delta Force's **Uluru (乌鲁鲁)**:
his Composite Incendiary (复合型燃烧弹) for G and his Loitering Munition
(巡飞弹) for X. Uluru's own passive is "Battle Hardened" (resists being
slowed); Salvo's is Jack's own.

| Part | Salvo |
|---|---|
| Name | **SALVO** (Jack picked it from suggestions: a volley of shells fired together) |
| Role | *to decide* |
| Passive | **Fire- and blast-proof**: takes **75% less** fire and explosive damage, his own and the enemy's (grenades, fire pools and burning, the drone's dive, his own G/V/X). A grenade's 90 becomes about 22. |
| G | **Composite Incendiary**, thrown. **2 charges, 30s each.** Bursts on landing into a fire pool that is **stronger than Aseed's**: wider, burns harder and longer. **Right-click switches** it to a **frag grenade**: **1s fuse, 90 at the centre** (Blast's is 2s, 90). |
| V | **Shell barrage**, called by **aim and press**: press V, a target circle shows where you aim (up to **60m**), press again or left-click to confirm. After a **2s** warning, **6 shells** land at random inside a **~10m circle** over **3s**, each up to **60**. Enemies hear a whistle and see the circle. **50s** cooldown. |
| X | **Missile launcher**, like Uluru's loitering munition: X takes it out; **click from the hip** and it flies straight on its own while you keep moving; **right-click to aim, then click**, and you fly it **through its own camera** with the mouse for up to **8s**; on impact **75** plus **4 bomblets of 25**. You stand still and exposed while steering. **Can be shot down** (a few rifle hits). **60s** cooldown after it lands. |
| Jumps | 1 (no movement ability: his V is the barrage) |
| Backstory / Look / Voice | *to decide* (look: from Jack's character sheet, like the others) |

**Standard set with Salvo (Jack, 2026-11-28): any agent ability that targets a
spot uses AIM AND PRESS**: press the key, a marker shows where you aim (within
range), press again or left-click to confirm. Silvars' G/X orders already work
this way.

**Notes for building it:** fire pools, burning and grenades already exist
(effects.js, the GREN and GFIRE blocks; server.js), so G is mostly those with
Salvo's numbers. The 75% cut goes where the SERVER applies fire and blast
damage. V and X are new: a server-timed barrage, and a missile the server
moves and the client steers (a new camera mode). Each needs a `cd-*.png` icon
from Jack.

---

## 5. BEACON (信标) (new, Jack's design, 2026-11-28; PLANNED, not built)

He is the Beacon of the background story: the G.T.I. deep-cover spy who was
killed on Hudson's orders. References: Delta Force's **D-Wolf (红狼)** for the
slide, and **Tempest (疾风)**'s ultimate, 紧急回避装置, for X.

| Part | Beacon |
|---|---|
| Name | **BEACON** / 信标 |
| Passive | **Slide, D-Wolf style.** Press crouch (C) while sprinting to slide about 5 m. You get a small speed boost that fades smoothly, with no hard stop, and you can shoot at once with no delay to raise the gun. The slide runs longer downhill. **Slide-jump**: Space during or at the end of a slide keeps its speed. Cooldown about 1 s. The old slide code (off since it "didn't feel good") is the starting point, retuned: entry speed about sprint plus 25%, not 13 m/s. |
| V | **Grappling hook** from the wrist launcher. **2 charges, 12 s each.** Range about 30 m. **On an enemy**: pulls them a few metres toward Beacon and staggers them; they cannot shoot for about 0.5 s. **On a wall, ceiling or object** (pipes, rails, the crane): **hold V** to hang on the rope and swing like a pendulum, WASD steers a little, Space reels in, up to 4 s; **let go of V** to fly off with your speed. **No aiming while swinging** (hip fire only). |
| G | **Stun bomb**, thrown. 1.5 s fuse, 6 m radius, blocked by walls, **30 damage**. For 2.5 s it dazes anyone caught, Beacon included: half speed, blurred and shaky aim, no sprint, jump or abilities, ears ringing. 1 charge, 25 s. |
| X | **Beacon recall** (Tempest's 紧急回避装置, changed by Jack). **No cooldown.** Press X to plant the beacon where you stand. It stays until you **hold X** to take it back. **Tap X** to teleport back to it, **at least 5 s between teleports**. It stays planted after a teleport, so you can go out and come back again. It **does not save you**: no pull-back when you are killed ("you die you die"). Enemies can shoot it (60 HP), and it breaks if you go more than 40 m away. If it breaks, X plants a new one. |
| Jumps | 1 (the slide-jump and the hook are his movement) |
| Look | Jack's sheets `信标.jpg` / `信标 模型.jpg`: short black hair, a dark worn field jacket over a grey-and-black panelled suit with silver chevrons, a black turtleneck, a chest rig with three pouches, an ID badge on a lanyard, fingerless gloves, a **wrist screen on the left arm** (where the hook launcher goes), a radio pack on his back with a coiled cable to the collar, a thigh holster, combat boots. |
| Backstory / Voice | From the story bible (the Beacon). *To decide* |

**Notes for building it:**
- Slide: `SLIDE_ENABLED`, `SLIDE`, `startSlide()` and the loop.js branches,
  turned on for Beacon only; `extras/slide-ability.md` holds the lessons.
- Hook: the server checks the hook's ray (`rayBoxes`) and any pull on a
  player; the swing is client movement, so `vetMove` must allow its speed
  (keep it under `MOVE.maxSpeed` 20), and `fl` must reset fall tracking when
  the rope is let go.
- Recall: a forced move, so it bumps `p.tp`. The beacon is a server object
  with HP.
- Each part needs a `cd-*.png` icon from Jack.

---

## 6. SINEVA (the young 教官) (new, Jack's design, 2026-11-28; PLANNED, not built)

He is Alexei Petrov (阿列克谢·彼得罗夫, born 1990): the young version of
Delta Force's **深蓝 (Sineva)**, whom players call **教官 (Instructor)**. He
keeps the Delta Force name, SINEVA (Jack). His story is in the story bible
(`Elite force/story/Elite Force background.html`). His early life comes
from fan write-ups of 深蓝, not official text. The rest is our own draft:
he is an army bomb-disposal engineer, his love dies in the hospital on
Blackout Night, and he is HALBERD's training instructor from 2025.
References: Delta Force's **Uluru (乌鲁鲁)** 速凝掩体 for G.

| Part | Sineva |
|---|---|
| Name | **SINEVA** (深蓝 / 教官 in the story) |
| Passive | **Athlete**: walk and sprint **+15%** (6.4 / 9.7 m/s; Blast's zone sprint stays his own), a jump about **30% higher** (~1.55 m, onto waist-high crates without climbing), **aim down sights 40% faster**. Stays under the server's `MOVE.maxSpeed` 20. |
| V | **Chest shield**: he punches the button on his chest (~0.6 s, he can't shoot during the press) and a **50-point shield** wraps his body. It takes damage before HP and stays **until it is shot off**. There is a blue shimmer on the body and a blue bar above HP. **30 s cooldown, starting when it breaks.** |
| G | **Wall gear**, thrown, like Uluru's 速凝掩体: where it lands it sets into a **3 m wide, 1.5 m high** wall facing the thrower (crouch behind it or shoot over it). **Two halves of 225 HP** break separately. It stops bullets and blasts; fire and explosives eat it faster. It lasts **60 s**. **2 charges, 35 s each**, at most 2 walls up. The server owns the wall (collision, HP). |
| X | **Rage**, **30 s**. **+75 HP**, **30% less damage taken**. Guns still fire on left-click. **Right-click becomes close combat**: **tap** = **gun strike** (hits with the gun itself), **double-tap** = **kick**, **hold** = aim as normal. The gun strike is always weaker than the kick. **Gun strike** 25, 1 m knockback, 0.3 s stagger. **Kick** 30, **0.6 s stun, 2 m knockback**. **With a jump**: a **flying gun strike** (40, 1.5 m) and a **flying kick** (50, 1 s stun, **4 m knockback**). Reach 2.2 m. **He senses every hit**: a big red arrow points at the shooter and the shooter is outlined through walls for 1 s. Afterwards he is winded for 2 s (slower). **90 s cooldown** (to re-check in play now that rage lasts 30 s). |
| Jumps | 1 (higher, from the passive) |
| Look | *Jack's picture to come.* 深蓝 is a very big man (198 cm). The bomb suit and shield are his Delta Force kit. |
| Backstory | Grew up under shelling in a cold country, became an army bomb-disposal engineer, came to Calderhaven to study, and lost the woman he loved on Blackout Night with the ring still in his pocket. He joined HALBERD in 2025 to guard other people's happiness. The rage is that grief let loose. |

**Notes for building it:**
- The kick and gun strike are new melee hits the server resolves
  (`MELEE`-style, line-of-sight through `RAY_BOXES`). Knockback is a forced
  move (bumps `p.tp`), and the stun reuses Beacon's daze where it can.
- The hit-direction arrow already exists (`hurtFrom` in hud.js). Rage makes
  it bigger and adds the outline.
- The 50 shield is server HP that soaks damage first. It goes in the
  snapshot/meta so others see the shimmer.
- The wall is a server collider that can break, so it must stay in step on
  both sides, like the drone and dog.
- Every piece of gear is a detailed model (the polish rule above): the
  chest button rig, the thrown gear, and the wall as it sets.

---

## 7. TxF, THE HIDDEN AGENT (Jack's design, 2026-11-28; BUILT 2026-11-28)

A secret agent that only a code typed in the CALLSIGN box can summon.

| Part | Hidden agent |
|---|---|
| Unlock | **Typed every time.** While the secret code is in the CALLSIGN box (`#nameInput`), the agent shows on the AGENTS page and can be picked. Clear it and the agent is gone. Jack chooses the code. The **server checks the code** and keeps only a scrambled (hashed) copy, so reading the game files does not reveal it. The code is **never shown as the player's name**: the server swaps it for the agent's name in the feed, the scoreboard and the nameplate. |
| Where | The **practice range** and **matches, one per room** (the server refuses a second one). Any **future modes** too. In a match the feed warns everyone when it joins. |
| Name / look | **TxF** (Jack). Jack chose the code; it is stored only as a hash, never written down. Look: black suit, hazard-yellow plates, amber visor, danger signs, jet pack, shoulder emitter. |
| Passive | **Flight** and **500 HP**. Double-tap Space to take off, and again to land. In the air, Space goes up, Ctrl/C goes down, and WASD moves where you look at **12 m/s (Shift 18)**. Capped by the roof and the map's sky lid. **No fall damage.** The server's `vetMove` must allow its flying (`MOVE.maxSpeed` 20 still holds). |
| V | **Laser beam**: **hold V** to fire a continuous beam down the crosshair. **120 m** range, **300 damage a second** (a 100 HP player dies in about 0.3 s), stopped by walls. A **heat bar** allows **4 s** of firing, then it overheats and takes **6 s** to cool. A bright beam that everyone sees, with a hum. The server resolves the hits every tick. |
| G | **Teleport**, by **aim and press**: press G and a marker shows where the crosshair hits, **up to 200 m** away (a floor, a roof, or in front of a wall face). Press again or left-click to go. A flash shows where you leave and where you land. **2 charges, 8 s each.** The server checks that the spot is free and inside the map, and bumps `p.tp`. |
| X | **Pulse**: every player within **200 m** takes **40 damage** and is **outlined in red through walls for 8 s**, with distance tags, and shows on the minimap. The targets hear a ping and see **DETECTED**. **25 s cooldown.** |
| Jumps | none needed (it flies) |

**Notes for building it:**
- The polish rule applies: a detailed model, beam and teleport effects, and
  sounds.
- It is deliberately overpowered (a boss to hunt). The one-per-room cap and
  the feed warning are what keep a match playable.

## Looks (Jack's sheets, `Crinsome x/Pictures/character design`) - built 2026-11-27

- **Aseed**: grey hood, crimson mask, plaid poncho over maroon
  sleeves, tattered crimson-and-grey cape, bandolier, crimson spined
  vambraces and greaves, olive camo trousers.
- **Blast**: black helmet with a four-lens night-vision unit (red lenses),
  olive scarf and ear cups, dark camo, black plate carrier with two red
  grenades, big black pack.
- **Silvars**: grey hair, no helmet, charcoal hooded jacket (hood down),
  brown vest with radios and green screens, wrist screens, knee pads, brown
  pack with antennas and cable. (The sheet has a hawk on his pack; not built.)
- **Ashara** (boss sheet): skull-faced metal mask, scarf, dark camo, tattered
  cloak, bandolier. Saved for the story; not built yet.

Built numbers used where Jack had not set one: dog leash 15m, bite and
pounce 25, dog gun every 0.5s to 20m, sensor radius 8m, one sensor at a
time, Aseed's trap sense 40m.

**Changes 2026-11-27 (Jack):** V now puts the sensor in your hand like the
grenade and left-click places it; it holds **two charges** (30s each) and two
can be out at once. The drone and dog stay **around** Silvars instead of
always behind him.

**Linked Sight (Jack, 2026-11-27):** only his robots light someone up (not his
own eyes): see-through outline and health bar for 2s, then a **20s cooldown**.

**Dog (Jack, 2026-11-27):** **120 HP**; lasts **120 seconds**, then disappears; the 70s
cooldown starts after that (or after it is destroyed, if sooner).

**Orders (Jack, 2026-11-27):** press X (dog) or G (drone) again while it is out
to send it to **guard** the spot you aim at, up to **20m** away. It stays
there and fights anyone who comes near; aim at your feet to call it back, and
it comes back by itself if you go more than 20m from the spot. Both abilities
stay "on" while the robot is out; the cooldown (dog 70s, drone 40s) starts
when it is gone.

**Drone (Jack, 2026-11-27):** lasts **20 seconds**, then disappears; the 40s cooldown starts after.
