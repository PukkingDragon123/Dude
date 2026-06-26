/* DREADNOUGHT v2 — game content & balance data (deduction-salvage roguelite).
 * Pure data (no logic): game.js interprets ids/footprints/shop effects.
 * Tune one number at a time (game-design-system §0.6 / §9.5). Numbers frozen in thresholds.md. */
(function (root) {
  "use strict";

  var CFG = {
    startHull: 100, baseMaxHull: 100,
    startSanity: 100, baseMaxSanity: 100,
    baseOxygen: 100,
    probeCost: 2,            // oxygen per MANUAL probe (flood-filled cells are free)
    startMoney: 0,
    baseCorruptThreshold: 40,// sanity below this -> scope corruption (raisable by upgrade to 25)
  };

  // ---- Monster archetypes. dmgType hull|sanity. footprint resolved in game.js. ----
  // aura: extra ambient sanity drain per probe while this monster is unrevealed.
  // multiZone/clumpZone: zone index at/after which the bigger footprint kicks in.
  var MONSTERS = {
    angler:    { name: "Anglerfish",     tier: 1, dmgType: "hull",   dmg: [10, 16], sanity: 0,  shape: "angler",    footprint: "single" },
    hagfish:   { name: "Hagfish Knot",   tier: 1, dmgType: "sanity", dmg: [12, 16], sanity: 0,  shape: "hagfish",   footprint: "single" },
    gulper:    { name: "Gulper Shoal",   tier: 1, dmgType: "hull",   dmg: [8, 12],  sanity: 0,  shape: "shoal",     footprint: "single" },
    swimmer:   { name: "Pale Swimmer",   tier: 2, dmgType: "sanity", dmg: [18, 24], sanity: 0,  shape: "swimmer",   footprint: "single", aura: 1 },
    squid:     { name: "Colossal Squid", tier: 2, dmgType: "hull",   dmg: [18, 26], sanity: 0,  shape: "squid",     footprint: "single", multiZone: 3, multiFootprint: "pair" },
    bonewhale: { name: "Bonewhale",      tier: 3, dmgType: "hull",   dmg: [24, 34], sanity: 10, shape: "whale",     footprint: "line3" },
    leviathan: { name: "THE LEVIATHAN",  tier: 4, dmgType: "hull",   dmg: [40, 52], sanity: 20, shape: "leviathan", footprint: "box2x2" },
  };

  // ---- Loot archetypes. kind data|wreck|artifact|shard|vent. ----
  var LOOT = {
    data:  { name: "Data Mote",      kind: "data",     value: [8, 16],    shape: "data" },
    wreck: { name: "Wreck Cache",    kind: "wreck",    value: [25, 55],   shape: "wreck" },     // also opens a safe pocket
    idol:  { name: "Resonant Idol",  kind: "artifact", value: [120, 260], shape: "artifact", carrySanity: 1 },
    glyph: { name: "Glyph Pillar",   kind: "artifact", value: [350, 600], shape: "artifact", carrySanity: 2, minZone: 3 },
    shard: { name: "Source Shard",   kind: "shard",    value: [500, 900], shape: "anomaly" },
    vent:  { name: "Air Vent",       kind: "vent",     o2: 20, hull: 8,   shape: "anomaly" },
  };

  // ---- Depth zones (index 1..6). pool = weighted monster id bag. ----
  var ZONES = [
    null,
    { name: "Continental Shelf", depth: 120,  w: 6,  h: 6,  monsters: 5,  data: 6,  artifacts: 0, wrecks: 1, vents: 1, valueMult: 1.0, sanityDrain: 4,
      pool: ["angler", "angler", "angler", "gulper", "gulper"], artifactPool: ["idol"] },
    { name: "The Twilight",      depth: 600,  w: 7,  h: 7,  monsters: 8,  data: 7,  artifacts: 1, wrecks: 1, vents: 1, valueMult: 1.6, sanityDrain: 7,
      pool: ["angler", "angler", "gulper", "gulper", "hagfish", "swimmer"], artifactPool: ["idol"] },
    { name: "The Midnight",      depth: 1500, w: 8,  h: 8,  monsters: 13, data: 8,  artifacts: 2, wrecks: 2, vents: 1, valueMult: 2.5, sanityDrain: 10,
      pool: ["angler", "gulper", "hagfish", "hagfish", "swimmer", "squid"], artifactPool: ["idol", "glyph"] },
    { name: "The Abyss",         depth: 3200, w: 9,  h: 9,  monsters: 19, data: 9,  artifacts: 2, wrecks: 2, vents: 2, valueMult: 4.0, sanityDrain: 14,
      pool: ["angler", "gulper", "hagfish", "swimmer", "swimmer", "squid", "squid", "bonewhale"], artifactPool: ["idol", "glyph"], shard: 1 },
    { name: "The Hadal Trench",  depth: 5400, w: 10, h: 10, monsters: 27, data: 10, artifacts: 3, wrecks: 2, vents: 2, valueMult: 6.0, sanityDrain: 18,
      pool: ["gulper", "hagfish", "swimmer", "swimmer", "squid", "squid", "bonewhale", "bonewhale"], artifactPool: ["glyph", "glyph", "idol"], shard: 1 },
    { name: "THE SOURCE",        depth: 6800, w: 10, h: 10, monsters: 26, data: 8,  artifacts: 1, wrecks: 1, vents: 2, valueMult: 8.0, sanityDrain: 22,
      pool: ["swimmer", "squid", "squid", "bonewhale", "bonewhale", "hagfish"], artifactPool: ["glyph"], shard: 1, leviathan: true, source: true },
  ];

  // ---- Shop. game.js interprets effects by id. vals indexed by (level-1). ----
  var SHOP = [
    { id: "o2",     name: "O2 Scrubbers",       costs: [150, 400, 900, 2000], vals: [130, 160, 190, 220], unit: "max O₂",
      desc: "Bigger tanks. More air = more probes per dive = more loot reach." },
    { id: "hull",   name: "Hull Plating",       costs: [200, 500, 1100, 2400], vals: [125, 150, 175, 200], unit: "max hull",
      desc: "Welded pressure plating. Survive deeper monster strikes." },
    { id: "sanity", name: "Sanity Stabilizers", costs: [350, 900], vals: [1, 2], unit: "tier",
      desc: "Sedatives & damping. Halve mind drain, then hold the scope steady far deeper." },
    { id: "peek",   name: "Probe-Sonar",        costs: [400, 900, 1800], vals: [1, 2, 3], unit: "peeks / dive",
      desc: "A directed pulse: safely identify one cell's contents without triggering it." },
    { id: "chord",  name: "Auto-Chord Relay",   costs: [300], vals: [1], unit: "",
      desc: "Tap a satisfied number to auto-probe its un-flagged neighbours. Clears board fast." },
    { id: "tongs",  name: "Salvage Tongs",      costs: [600], vals: [1], unit: "",
      desc: "Reinforced grapple. Keep your single best artifact even if a dive is lost." },
    { id: "depth",  name: "Depth Charter",      costs: [250, 700, 1600, 3500, 8000], vals: [2, 3, 4, 5, 6], unit: "unlock zone",
      desc: "Charter pressure clearance for the next trench zone down. The way to the Source." },
  ];

  var LORE = [
    "Crew log, day 1: The Admiralty calls it a beacon. It pulses every nine seconds, from below the charted floor.",
    "Day 3: A second pulse answers the first now. We did not bring a second beacon.",
    "Sonar op: the contacts move when we don't watch them. I've stopped telling the captain.",
    "Day 6: The signal is not code. It is nine seconds of a voice, slowed until it is only weight.",
    "We found the first sub sent down. K-219. Her log ends mid-word. Her reactor is still warm.",
    "The pressure has a texture this deep. It presses thoughts flat. The men hear their mothers in the pipes.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
    "The shards sing to each other in the hold. When all are gathered, the trench floor will open.",
  ];

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.MONSTERS = MONSTERS;
  root.DN.LOOT = LOOT;
  root.DN.ZONES = ZONES;
  root.DN.SHOP = SHOP;
  root.DN.LORE = LORE;
})(typeof window !== "undefined" ? window : this);
