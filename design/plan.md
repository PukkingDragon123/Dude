# DREADNOUGHT — Design Plan (v2: SOUNDINGS)

A horror **deduction-salvage** game. You pilot a small Russian submarine, the *Dreadnought*,
into an abyssal trench to trace a strange signal. The sonar scope is a **Minesweeper-style
grid**: probe cells, read the **numbers** (how many monsters lurk adjacent), and *deduce* the
safe path to the loot. Harvest **data** and rare **artifacts**, surface, **sell** them for
money, buy upgrades, and dive **deeper** — where the grids are bigger, the monsters worse, and
the rewards richer. (v1 was a card deckbuilder; v2 removes cards entirely per the new
direction: a smart, mind-based logic game built on an earn-and-spend economy.)

Inspirations: the deductive tension of *Minesweeper*/*Hexcells*; the identify-before-you-touch
dread of *Iron Lung*; the salvage-sell-upgrade loop and ocean horror of *DREDGE*.

## Profile (axes)
- **Time** turn-free / your-own-pace (each probe is an action; oxygen is the clock).
- **Space** discrete 2D grid (the sonar field) + a surface port meta-screen.
- **Agency** one vessel and its crew.
- **Conflict** vs system (the trench, monsters, attrition) + vs self (greed, sanity, risk).
- **Content** procedural seeded grids over an authored signal mystery + authored economy.
- **Outcome** earn-and-spend loop; win = breach the Source at the trench floor. Lose a dive =
  lose its hold (not the save) — persistent rig upgrades (roguelite, DREDGE-style stakes).
- **Players** solo. **Session** ~3–8 min per dive, many dives per run.
- **Engagement** discovery + **calculation/deduction** (primary) + accumulation + dread.

## Experience formula
The player feels *sharp dread* because the game constantly forces them to deduce the safe path
through the dark with too little air — every probe spends oxygen and might wake something, and
the richest loot is always ringed by the most monsters.

## Core loop
1. **SURFACE (port):** see cash + rig stats; buy upgrades (O2, hull, sanity, sonar tools, zone
   unlocks); sell cargo (artifacts); pick a depth zone; **DIVE**.
2. **DIVE (one seeded grid):**
   - **PROBE** a cell (the core verb). First probe of a dive is always safe and flood-opens a
     pocket. A safe cell shows a **number** = count of monsters in its 8 neighbours; a **0**
     flood-fills open like classic Minesweeper.
   - Safe cells may hold **loot**: data motes (auto-cash), wreck caches (open a safe pocket),
     artifacts (high-value cargo), air vents (refill O2/hull), or **Source shards**.
   - **FLAG** suspected monster cells (free, pure deduction aid). **Chord** satisfied numbers
     (upgrade) to clear fast.
   - Each manual probe costs **oxygen**. You can't reveal everything — partial information is
     the game. Hitting a monster damages **hull** or **sanity**.
3. **ASCEND** any time (or forced at 0 oxygen) to bank the hold → cash + cargo.
4. **Sell, upgrade, dive deeper.** Deeper zones: bigger grids, denser & nastier monsters,
   faster sanity drain — but rarer artifacts and far higher value.
5. The trench floor is **THE SOURCE**: a Leviathan-guarded grid and the truth behind the signal.

## Verbs
PROBE (reveal+deduce), FLAG (mark danger), CHORD (auto-clear a satisfied number — upgrade),
PEEK (Probe-Sonar: safely identify one cell — upgrade), ASCEND (bank & surface), and the
surface verbs BUY / SELL / CHOOSE-DEPTH. Strong verbs: PROBE resolves differently per cell
content (number / data / artifact / wreck / vent / monster).

## Information map
Cells start fogged. A revealed number is an **honest** count of adjacent monsters — the whole
puzzle is solvable by logic with calculated risk where ambiguous (classic Minesweeper). Monster
*type* (hull-threat vs mind-threat) is hidden until revealed or PEEKed. At **low sanity** the
scope **corrupts** — a few numbers glitch and phantom flags appear — but the game *warns* you
("MIND FAILING — readings unreliable"); never silent cheating. Multi-cell monsters each count
per occupied cell, so their footprint is deducible from the number halo around them.

## Monsters (escalating; reuse existing PS1 portraits)
Anglerfish (T1, hull) · Hagfish Knot (T1, **mind**) · Gulper Shoal (T1, hull; clumps deep) ·
Pale Swimmer (T2, mind + ambient drain aura) · Colossal Squid (T2–3, **multi-cell**, hull) ·
Bonewhale (T3, **multi-cell** line, hull+mind) · **THE LEVIATHAN** (T4 boss, **2×2**, Zone 6,
near-lethal, guards the Source). All static; variety from damage type, footprint and auras —
keeps deduction fair.

## Economy & progression
Data motes auto-bank to cash on ascend; artifacts go to the **hold** (lost on death) and are
**sold** at port. Value scales with zone depth (×1 shallow → ×8 at the Source). Shop: O2
Scrubbers, Hull Plating, Sanity Stabilizers, Probe-Sonar, Auto-Chord, Salvage Tongs (keep one
artifact on death), Depth Charters (zone unlocks — the progression spine). Sources and sinks
balanced so there are no dead ends; a bad dive costs the hold, never the rig.

## Visual style
Unchanged PS1-era low-poly look delivered as procedural canvas art + CRT FX. The sonar **grid**
is drawn as a phosphor-green CRT readout (crisp numbers over the dithered low-res water/cockpit
buffer); monster reveals pop the existing low-poly portraits. Single STYLE FORMULA below,
embedded byte-identical in every procedural asset.

## STYLE FORMULA (locked, unchanged from v1)
Low-poly PS1-era 3D render look: chunky flat-shaded polygons, low-res warped textures, heavy
dithering. Blocky faceted silhouettes, hard polygon edges, no anti-aliasing. Environment in
near-black abyssal blues and rusted iron-grey with charcoal shadows; submarine and crew in cold
steel green-grey contrasting the void; creatures, hazards and anomalies marked with sickly
bioluminescent acid-green and warning-amber glow; sonar in phosphor green. Claustrophobic
deep-sea darkness, weak flickering cabin light and cold sonar glow, oppressive and dread-soaked.
High contrast between glowing subjects and black water, clean bold silhouettes, consistent flat
frontal perspective across all assets.

## Assets
See `design/assets.csv`. All procedural (canvas + WebAudio) — no generated image/audio files.
Reused from v1: monster portraits, cockpit frame, water/fog, scanlines/vignette/grain overlay,
gauges, title. New procedural: the Minesweeper sonar grid + cell/loot/flag iconography, the
surface port/shop screen.
