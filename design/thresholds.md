# DREADNOUGHT — Frozen numbers (agency metrics, budgets, tolerances)

Frozen before content. Balance numbers live in `data.js` and are tuned one change at a time.

## Vitals (run start)
- Hull 100 (max 100) — lose at 0.
- Oxygen 100 (max 100) — lose at 0; **−8 per descent**, plus action costs.
- Sanity 100 (max 100) — lose at 0; drains near creatures/anomalies and in the dark.
- Power 3 per turn (the action/energy budget); unspent power is not banked.

## Deck & hand
- Starting deck 10 cards: 2 PING, 2 SCAN, 2 INVESTIGATE, 1 EVADE, 1 BRACE(repair),
  1 VENT(oxygen), 1 STEADY(sanity).
- Hand size 5; draw to 5 at the start of each turn; discard→reshuffle when deck empties.
- Card costs (power): PING 1, SCAN 1, INVESTIGATE 2, EVADE 1, BRACE 1, VENT 1, STEADY 1.

## Run structure
- Depth bands to the floor: **8** (band 8 = the Leviathan / signal source).
- Contacts per band: 3–5 (seeded). Each band: a mix of wreck/artifact/creature/anomaly.
- Threat tiers: I (minor), II (serious), III (boss). Tier scales with depth.
- Creature damage on a failed/ignored encounter: tier I 8–14 hull or 10 sanity;
  tier II 16–24; tier III 30+ (the Leviathan). Scanning reveals the safe response.

## Win / lose
- **Win** reach band 8 and survive the source encounter.
- **Lose** hull ≤ 0 (implosion), oxygen ≤ 0 (suffocation), or sanity ≤ 0 (the crew breaks).
- Roguelike: death ends the run; a new dive reseeds.

## Determinism
- Seeded RNG (mulberry32) drives the descent map, contact identities and draws.
- Randomness resolves BEFORE the player commits (you see/scan the blip, then choose).
- Fixed-timestep loop (60 Hz) for FX/animation; game logic is event-driven on player actions.

## Performance budget (weakest target = mid mobile browser)
- ≥ 60 fps; frame ≤ 16 ms. DPR capped at 1.5.
- Particles (marine snow) capped at 80, drawn in one pass; no per-frame allocations in the
  draw loop; offscreen layers (vignette, static cockpit) cached, not redrawn each frame.
- Total asset payload kept lean (PS1 look tolerates 1k textures downscaled / crunchy).

## Input tolerance
- Card targeting forgiving: tap blip OR tap card-then-blip both work; mis-taps cancel, never
  commit. Confirm step on irreversible INVESTIGATE of an unscanned contact.
- Keyboard bound to physical `event.code`; all strings external in `strings.js`.
