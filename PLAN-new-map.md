# Plan: the new power-station map (saved 2026-11-24)

Jack wants everything below built as a **new map**, not as more changes to
`works`. It starts from what `works` already has, fixed and finished. This
file collects everything we agreed on 2026-11-23 and 2026-11-24.

Coordinates are `works` coordinates (x east, z south; the site plan's top
is -z). Site plan grid: columns A-H are 29 m each from x -116; rows 1-8 are
29 m each from z -116.

---

## Rules learned along the way (apply everywhere)

- **Stairs must be logical.** Never run a stair into a wall or a corner
  block, and never hide one behind a wall. A flight comes off the open edge
  of the level it serves, square to it, out into open floor.
- **Leave room at the foot of every stair**, at least 1.4 m clear, so you
  can walk straight onto it.
- **Rails must not block the way.** Rails go on open edges only. Leave walk
  ends open, and leave a gap at every stair head.
- Anything you can see within reach must be what stops you (collision
  equals drawing). Detail above reach can be drawn only.
- Every new structure is real cover. Walk-test each change and check that
  no boxes overlap.
- Don't touch the bots or the gun fire.

## Already done in `works` (carry over into the new map)

- **Centre generator.** A vertical generator, built from Jack's photo:
  - a dark ribbed stator drum with access hatches
  - an upper bracket (a hub and arms on a square frame on four columns)
  - the exciter on top, oil pipes, and an air cooler on each flank
  - a round plinth with a yellow ring rail and two real stairs, west and east
- **Catwalk stairs.** Two flights per catwalk come off the open edge into
  the hall, at x 24 and x 86.5. The catwalk ends are open.
- **Control room stair.** It starts 1.4 m off the west wall.
- **Sword charged stab.** Damage scales with your speed when you release:
  x1.5 at 13 m/s. Jack is happy with the sword; leave it alone.

---

## A. Make the plant make sense (the working chain)

1. **Fuel supply.** The boilers have coal mills but there is no coal on
   site. Add a coal yard with stockpiles, a stacker and a reclaimer, plus a
   covered conveyor bridge up into the boiler house. The conveyor gallery is
   walkable, so it is also a new route.
2. **Flue gas path.** The boiler goes straight to the stack. Real order:
   boiler, then a filter house (electrostatic precipitator), then the
   induced-draught fans, then the stack, with big ducts between them.
3. **Water for the quay.** The intake building and its screens stand on dry
   ground. Add a river or channel along the south-east edge, with the
   intake on its bank.
4. **Cooling water.** At the moment the pipes to the towers come from the
   boiler house. The right loop is: intake, then the condensers in the
   turbine hall, then the cooling towers, then back. The towers need their
   ponds and channels.
5. **Oil tanks.** They sit inside the high-voltage yard. Give them their own
   compound, with a bund wall round each tank, a pump house and a pipeline.

## B. Site layout

6. **Gates** (Jack marked them on the site plan). Both are for looks and
   stay shut, because the map ends at the fence.
   - **Main gate, east edge at H7** (x about 116, z about 63-75), where the
     road south of the hall meets the east fence:
     - sliding gates with a lifting barrier
     - a security hut with a window
     - a "POWER OI" sign
     - lights and a CCTV pole
     - office parking just inside
   - **Service gate, south edge at D8** (x about -20 to -5, z about 116), by
     the laydown yard (vans, cable drums, generator):
     - a plain gate with a barrier
     - a weighbridge and a small hut
     - road markings leading in
   - Jack also drew a small black mark near H8, by the bottom-right
     building. Still to ask what he meant.
7. **Office surroundings.** A car park, paths and landscaping (see D13 for
   the building itself).
8. **Outside the fence.** A perimeter road, fence lights and CCTV, instead
   of empty grass.

## C. Leftovers from the old arena map

9. **Inside the turbine hall:**
   - The four 10x10 concrete corner blocks with steps become real
     electrical rooms.
   - The feedwater tanks standing loose on the floor get their raised
     platform.
   - The small kiosks get a real purpose, or go.
10. **Small faults the data check found:**
    - one pipe floating 1.6 m up at (-98, -54.6)
    - four tunnel wall pieces floating at 2.9 m, at (24.2, -109.2),
      (65.8, -109.2), (74.2, -105.6) and (111.8, -105.6)

## D. Buildings and detail

11. **Boiler house, inside.** Jack: "very plain".
    - Lighting: add high-bay lamps under the roof and work lamps on every
      gallery (now it reads nearly black).
    - The plain `machine` boxes become real equipment:
      - induced-draught fans (scroll housings with motors)
      - coal mills with feed pipes up to the burners
      - boiler feed pumps
      - air-heater ducting on the second gallery
    - Overhead: flue ducts to the fans, and steam pipes on hangers.
    - Walls: stencilled bay numbers, safety signs, fire points, and a
      ladder up.
12. **The two boilers** (the "two big black boxes"):
    - silver panelled lagging with seams, and buckstay bands every few
      metres
    - a steam drum across the top with safety valves
    - downcomer pipes down the corners
    - rows of burners and windboxes on the front wall, with fuel pipes
    - platforms and ladders at each gallery level
    - "BOILER 1" / "BOILER 2" stencilled on the side
13. **The office, branded "POWER OI".** Jack: it is "not done well" and
    "not like how an office would look in a power station". Confirm the
    exact spelling and logo colours with Jack.
    - **Outside:**
      - lit POWER OI letters and a logo on the roofline
      - a sign by the entrance, a canopy, logo decals on the glass
      - flagpoles
      - rooftop air-con units and a plant screen
      - cladding panels and louvres, so it isn't a flat white box
    - **Ground floor (lobby):**
      - a reception desk in front of a POWER OI logo wall
      - a sign-in barrier
      - a safety board ("days without a lost-time incident")
      - a PPE rack (hard hats, hi-vis vests)
    - **First floor (engineering):**
      - drawing desks and plan chests
      - large site drawings on the walls
      - a plant-status screen
      - a permit-to-work board
      - glass managers' offices
    - **Top floor:**
      - a shift-handover and meeting room
      - a training room
      - a break room with lockers and a kitchenette
    - **Throughout:** carpet tiles, a ceiling grid with lights, cable
      trays, notice boards.
14. **Roofs.** The hall, boiler house and generator room roofs are flat and
    bare. Add vents, air-con units, gutters, downpipes and ladders.

## Not doing

- Survival mode: Jack has his own gameplay.
- Any more sword changes.
