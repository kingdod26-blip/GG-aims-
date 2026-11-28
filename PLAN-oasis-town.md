# Plan: Oasis Town (绿洲镇), the Hamke map (Jack, 2026-11-28)

Elite Force's second map, alongside the Power Station (`works`). This file
is the plan only; nothing has been built yet.

## Story

- Oasis Town in Ahsarah's eastern desert, in **2026**, our story's year.
  Hamke is a young warlord, and his lab under the town is new and running.
- In Delta Force (Season 12, 2035) this is where Hamke's secret lab is
  exposed by the 亚尼 brothers: scrap brain-machines refurbished and sold to
  the poor, and 静息片, which is really a narcotic. G.T.I. destroys it, and
  Hamke escapes. In our 2026 that lab has only just started.
- It ties to our story: in Delta Force's timeline Hamke massacres the
  village of Aseed's family in 2029.

## Size and look

- **300 m across** (half-extent 150). The Power Station is 240 m. The hard
  limit is about 640 m: positions travel as 16-bit centimetres.
- **Late afternoon**: a low warm sun, long shadows down the alleys,
  sand-gold walls against a hazy blue sky.

## Above ground (all four, Jack)

1. **The oasis and palm grove**: the pool at the heart of the town, a ring
   of date palms, an irrigation channel, a pump house.
2. **The old town and souk**: mud-brick houses with flat roofs you can walk
   on, narrow alleys, a covered market with stalls, and a minaret or water
   tower as the landmark.
3. **Hamke's clinic**: the front where the "repaired" brain-machines and
   静息片 are sold. Its back stair is **the one way down** to the lab.
4. **The edges**: the road in with Hamke's militia checkpoint, a truck
   depot / garage, and dunes and ruined walls round the rim.

## The lab

- **Jack already has the underground laboratory** and will provide it.
  Build the town around it; do not design a new lab.
- Engine note: the floor cannot go below y = 0, so "underground" means the
  town is raised over the lab (raised boxes, `y:`), or the lab is built to
  sit at ground level under it. Fit this to Jack's lab when it arrives.

## The mission and the objective (Jack's choices)

- **The lab door behind the clinic is shut until the mission is done:
  power the door.** Three **fuse boxes** round the town, shown on the map.
  Hold **E for 5 s** at each to switch it on.
- **Contested**: anyone can switch a fuse back **off (3 s)** until all
  three are on. When all three are on, the door opens for everyone for the
  rest of the round.
- **The objective in the lab is intel: Hamke's drive.** Pick it up in the
  lab and carry it out to the road. **Reaching the road with it wins the
  round outright.** The carrier is shown to everyone and moves a little
  slower. If the carrier dies, the drive drops where they fell.
- Everything (fuses, door, drive) **resets each round**.
- The server owns all of it: fuse states, the door, who holds the drive,
  and the win. It goes on the wire like the potions (a mask in the snapshot
  header or a small event), not per tick.

## Building it (when Jack says go)

- A new map id (e.g. `oasis`) in `maps.js`, added to `MAP_IDS` so the MAP
  card cycles again. The generator would follow `scratchpad/works.js`.
- Lit look: a desert sky, a sun low in the west, sand and mud-brick
  materials, palms (round trunks drawn as their own collision, like the
  drums), stalls and awnings (out of reach, or real boxes: the rule "if it
  looks like a floor, it is one").
- Interaction: a new hold-E use for the fuse boxes and the drive. Nothing
  in the game uses E yet; Q/E peek is taken by E, so the key needs settling
  (F is the blade). Ask Jack.
- The polish rule applies: detailed fuse boxes, door, drive, clinic.
- Check after building: the drawn-vs-collision probe, pairwise overlaps,
  spawns, and a real match with the mission played through.

## Still open

- Jack's lab: the files or pictures.
- Which key powers a fuse (E is peek-right).
- Whether the map has Hamke or his militia in it as NPCs (bots are off
  limits: Jack's rule), or only the story in the set dressing.
