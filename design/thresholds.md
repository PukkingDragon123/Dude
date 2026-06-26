# DREADNOUGHT v2 — Frozen numbers (agency metrics, budgets, tolerances)

Frozen before content. All balance numbers live in `data.js`; tune one at a time (§9.5).

## Vitals
- **Hull** start/max 100 (upgradable to 200). 0 = implosion → death, lose the hold.
- **Oxygen** per-dive budget, base 100 (upgradable to 220). Each manual **probe costs 2 O2**.
  Flood-filled cells are free. 0 O2 → forced safe **ascend** (hold kept, dive ends).
- **Sanity** start/max 100. Ambient drain per dive scales with depth (4 → 18). Monster mind-hits
  and carried artifacts drain more. < 40 (raisable to 25) = **scope corruption** (signposted).
  0 = crew breaks → death, lose the hold.
- **Money (₽)** meta currency. Start 0. Earned: data auto-banked on ascend + artifacts sold at
  port. Spent: shop upgrades. Persists across dives and deaths.

## Grid & deduction
- Square grid, 8-neighbour adjacency. Number = count of monster cells in the 8 neighbours.
  0 → flood-fill. **First probe of a dive is always safe** (monsters placed after, excluding the
  clicked cell + its neighbours). Flags free. Chording (upgrade) clears satisfied numbers.
- Multi-cell monsters: each occupied cell counts independently (footprint deducible from numbers).

## Zones (shallow → deep)  [name, depth m, grid, monsters, data, artifacts, wrecks, vents, value×, sanity drain]
1. Continental Shelf — 120m  — 6×6  — 5  — 6  — 0–1 — 1 — 1 — ×1.0 — 4
2. The Twilight      — 600m  — 7×7  — 8  — 7  — 1   — 1 — 1 — ×1.6 — 7
3. The Midnight      — 1500m — 8×8  — 13 — 8  — 1–2 — 2 — 1 — ×2.5 — 10
4. The Abyss         — 3200m — 9×9  — 19 — 9  — 2   — 2 — 2 — ×4.0 — 14
5. The Hadal Trench  — 5400m — 10×10— 27 — 10 — 2–3 — 2 — 2 — ×6.0 — 18
6. THE SOURCE        — 6800m — 10×10— 30 — 8  — 1(shard)+Leviathan — 1 — 2 — ×8.0 — 22
- Densities ~14% (Z1) → ~28% (Z5/6). First-safe + tools keep it fair; deep guesses are
  deliberate calculated risk (designs embrace this).

## Monster damage (on reveal)
- T1 Anglerfish 10–16 HULL · Hagfish 12–16 SANITY · Gulper 8–12 HULL (clumps in Z3+)
- T2 Pale Swimmer 18–24 SANITY (+ambient aura) · Colossal Squid 18–26 HULL (multi-cell Z3+)
- T3 Bonewhale 24–34 HULL + 10 SANITY (multi-cell line)
- T4 THE LEVIATHAN 40+ HULL (2×2, Z6 only)

## Loot (base value × zone mult)
- Data Mote 8–16 (auto-cash) · Wreck Cache (opens safe 3×3 pocket + 2–3 motes) ·
  Resonant Idol 120–260 (artifact, cargo, −1 sanity/tick carried) ·
  Glyph Pillar 350–600 (artifact Z3+, −2 sanity) · Source Shard (Z4–6, win key) ·
  Air Vent +20 O2 / +8 HULL (not money).

## Shop (cash costs)
- O2 Scrubbers I–IV: max O2 100/130/160/190/220 — ₽150/400/900/2000
- Hull Plating I–IV: max hull 100/125/150/175/200 — ₽200/500/1100/2400
- Sanity Stabilizers I–II: −50% ambient drain / corruption threshold 40→25 — ₽350/900
- Probe-Sonar I–III: +1 safe-peek charge per dive — ₽400/900/1800
- Auto-Chord Relay: enable chording — ₽300 (one-time)
- Salvage Tongs: keep highest artifact on death — ₽600 (one-time)
- Depth Charter: unlock Z2/Z3/Z4/Z5/Z6 — ₽250/700/1600/3500/8000

## Win / lose
- **Win** reveal & ascend with the Source artifact from Zone 6 (survive the Leviathan grid).
- **Lose a dive** hull or sanity ≤ 0 → lose the hold (Salvage Tongs keeps one artifact); keep
  cash + rig. **Soft-lock guard**: a free emergency dive is always affordable (Zone 1 free).

## Determinism / performance / input
- Seeded RNG (mulberry32). Grid, monsters, loot, draws reproduce from the seed.
- Fixed-timestep 60Hz for FX; logic event-driven on player actions. DPR cap 1.5; particles ≤ 80;
  cached offscreen layers; no per-frame allocations in the draw loop.
- Click/tap = probe; long-press / right-click / FLAG-mode = flag. Keyboard cursor (arrows) +
  Enter probe + F flag + A ascend, physical `event.code`. Gamepad mapped to the same. All
  strings external in `strings.js`.
