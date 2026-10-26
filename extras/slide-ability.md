# Slide ability (disabled, kept for later)

The slide is **switched off**, not deleted. With it off, `C` is always a plain
crouch toggle.

## Turning it back on

One line, in `mp/public/index.html`:

```js
const SLIDE_ENABLED = false;   // -> true
```

Everything else is still in place and will start working again immediately.

## What it did

Pressing `C` while sprinting (or while still carrying speed, e.g. coming out of
a roll) launched a slide: you kept your momentum, bled it off with friction,
dropped to crouch height for a low profile, and popped back up standing at the
end.

| Setting | Value |
|---|---|
| Duration | 0.80 s |
| Entry speed | 13.0 m/s (or your current speed, whichever is higher) |
| Friction | −13 m/s² |
| Floor speed | 5 m/s |
| Cooldown | 1.5 s |
| Distance | ~6 m |

It also leaned and dipped the camera, and could be cancelled early by rolling.

## The pieces involved

All of these are still in `mp/public/index.html`:

- `SLIDE` — the tuning table above
- `startSlide()` — picks the direction, inherits your current speed, sets the
  camera lean, drops you to crouch
- the `slideT > 0` branch in `movePlayer()` — applies friction and stands you
  back up when it ends
- the `KeyC` handler — chooses slide vs crouch, gated on `SLIDE_ENABLED`
- the `slideT > 0` branch in the camera lean/dip code
- `slideT`, `slideCdUntil`, `slideDir`, `slideSpd`, `slideLean` state

## Why it was turned off

It didn't feel good to play. If you revisit it, the things most likely worth
changing are the entry speed (13 m/s may be too fast to control), the 0.80 s
duration, and whether it should keep you crouched at the end instead of
standing you up.
