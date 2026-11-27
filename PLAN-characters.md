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

---

## 1. ASEED (in the game)

| | |
|---|---|
| Role | *to decide* |
| Passive | **Hearing**: an enemy who fires a gun, bolt or smoke bolt within 40m is shown through walls for 4s; then 30s before it can trigger again. Blade swings are silent. |
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

## 3. SILVARS (new, Jack's design, draft)

| | |
|---|---|
| Role | Recon / robotics (*suggested*) |
| Passive | **Linked Sight**: Silvars and his own robots share what they see. An enemy seen by any of them is shown to Silvars, **with their current health**, for 2s. |
| V | **Sensor**: sticks a small device on the surface of an object. It detects players in a small area and lets Silvars see them through walls for ~2s. 30s cooldown. It makes a small sound, can be detected by special means such as Aseed's hearing, and is destroyed when it takes damage. |
| G | **Drone**: summons one flying drone; only one at a time; 40s cooldown. It hunts enemies, and after looking at a player for 1s it crashes into them and deals damage. |
| X | **Dog Bot**: a robot dog with 200 HP, close-combat attack and a small gun that deals 10 damage per shot. Hunts and attacks enemies on its own. |
| Bots | Both the drone and the dog go out, find the enemy, track them and attack. Both feed Linked Sight. |
| Backstory | *suggested*: the station's robotics technician, who built the inspection drones for the boiler flues and the robot dog for the cable tunnels. |
| Look | *to decide* |
| Voice | *to decide* |

**Suggested numbers (not agreed yet):**
- Sensor: placed up to 6m away, scans an 8m radius, one out at a time.
- Drone: 30 HP (can be shot down); dodge it by breaking line of sight before the 1s lock.
- Dog: bite 25; gun fires every 0.5s out to 20m; about sprint speed; one at a time; 90s cooldown after it dies.

**Open questions for Jack:**
1. Sensor: is the 30s cooldown for placing a new one, or does a placed sensor stay and scan every 30s until destroyed?
2. Drone crash damage: 50 (softens) or 100 (a kill)?
3. Dog: stays until killed, or expires after a set time (e.g. 40s)?
4. Multiplayer balance: rounds are often 1v1; should bots be weaker in multiplayer than in story missions?

**Build note:** the drone and dog are real AI units that must find their way
round the map and be run by the server. This is separate from the practice
bots, which stay untouched (Jack's rule).
