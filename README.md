# Bot Strike

A browser-based first-person shooter built with **Three.js** — no engine, no install, runs from a URL.
Comes in two flavours: a self-contained single-player range, and a multiplayer deathmatch with an
authoritative Node + Socket.IO server.

![status](https://img.shields.io/badge/status-playable-27ff9e)
![three.js](https://img.shields.io/badge/three.js-r128-blue)
![license](https://img.shields.io/badge/code-MIT-lightgrey)

---

## Quick start

### Multiplayer / main game (recommended)

```bash
cd mp
npm install
npm start
```

Then open <http://localhost:8200>. Open the same URL in a second tab (or another device on your
network) to play with more people.

### Single-player range

A single HTML file — but it needs to be served over HTTP, not opened directly, so the browser
allows pointer-lock and model loading:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123/fps-game.html>.

---

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| `Mouse` | Look |
| `Left click` | Fire |
| `Right click` | Aim down sights / sniper scope |
| `Space` | Jump — press again mid-air to double jump (you can land on crates) |
| `Shift` | Sprint (hold while moving; widens the view) |
| `C` | Crouch |
| `Z` | Prone |
| `R` | Reload |
| `1` – `5` | Switch weapon |
| `G` | Crossbow ability — flaming bolt, leaves fire on the ground |
| `H` | Smoke ability — cloud that tags anyone inside it for 4s |
| `F` | Blade — five-hit melee combo |
| `V` | Dodge roll |
| `Q` / `E` | Peek left / right (hold) |
| `Tab` | Armory |
| `O` | Graphics settings |
| `Esc` | Release mouse |

---

## Features

**Gameplay**
- Five weapons — auto rifle, bolt-action sniper (4× scope), 8-pellet shotgun, two pistols — each
  with its own ammo pool, recoil, spread, reload time and ADS zoom
- Three stances (stand / crouch / prone) that change view height, movement speed and profile
- Vertical collision — jump onto crates and shoot from elevation
- Stationary targets for aim practice; you and the other players are Spartans
- Hitscan combat with headshot multipliers and wall occlusion

**Multiplayer**
- Authoritative Node + Socket.IO server: hits, deaths and scores are decided server-side
- Round-based duelling: kill the opposition to take a round, first to 3 wins the match,
  then it resets and runs again. Death in a round means sitting it out.
- Shared world — all players see the same targets and each other
- Player elevation is networked, so someone on a crate is shot at the right height
- Live scoreboard and kill feed

**Presentation**
- Photoscanned PBR materials (colour + normal + roughness)
- Indoor arena: ceiling, lamp panels, and a dark backdrop with matched fog
- Bloom post-processing and soft shadows
- Flaming crossbow bolts that leave a burning pool on the ground
- Smoke bolts that tag opponents caught inside, shown through walls to the thrower
- Spatial glass UI homepage with mouse parallax driving both the CSS layers and the 3D camera
- Drag-to-inspect character showcase
- Procedural audio (gunfire, reloads with a spoken call-out, distance-paced footsteps)

**Performance**
- Graphics settings panel (`O`) with Performance / Balanced / Quality presets
- Frame cap, resolution scale, shadow quality and bloom toggles
- Menus idle at 30fps; rendering pauses on hidden tabs

---

## Project layout

```
.
├── fps-game.html                     # standalone single-player range
├── models/                           # model(s) used by the single-player build
├── guns_explosives_batch_convert.py  # Blender script: batch FBX → textured GLB
└── mp/                               # multiplayer game
    ├── server.js                     # authoritative game server
    ├── package.json
    └── public/
        ├── index.html                # the client (renderer, UI, netcode)
        └── assets/                   # models and textures
```

---

## Credits

Code is MIT (see `LICENSE`). Third-party assets keep their own licences:

| Asset | Author | Licence |
|---|---|---|
| Weapon models (rifle, sniper, shotgun, pistols, sword) | [Quaternius](https://quaternius.com) | CC0 |
| Crossbow | CreativeTrio | see source |
| Textures | [Poly Haven](https://polyhaven.com) | CC0 |
| Soldier model | Manaos | CC0 |
| **Spartan Armour MKV (Halo Reach)** | **McCarthy3D (Sketchfab)** | **CC-BY 4.0 — attribution required** |

> The Spartan model is fan art depicting characters owned by Microsoft / 343 Industries. It is
> included here for a non-commercial hobby project only.

Built with [Three.js](https://threejs.org).
