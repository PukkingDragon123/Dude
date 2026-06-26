/* DREADNOUGHT v4 — Minesweeper-deduction fused into first-person submarine navigation.
 * The CRT monitor IS a top-down minesweeper grid; the sub is one cell. Driving into a cell
 * reveals it (numbers = adjacent monsters). Deduce the safe path down to the descent hatch.
 * Diegetic horror UI (oxygen tank + flooding cabin). No shop, no text HUD.
 * Tune one number at a time (game-design-system §0.6/§9.5). */
(function (root) {
  "use strict";

  var CFG = {
    startHull: 100, maxHull: 100,
    startOxygen: 220,        // seconds of air (the dread clock)
    idleDrain: 0.55,         // air lost per second while thinking
    moveCost: 4,             // air spent per completed drive into a new cell
    ventRefill: 34,          // air refunded by a thermal vent cell
    moveGlide: 0.34,         // seconds the sub glides between cells (the "transit" + scare window)
    pingsStart: 3,           // sonar pings granted at the start of each layer
    pingCone: 3,             // how many cells deep a ping reveals numbers
    threatPing: 18, threatLight: 7, threatMove: 2.5, threatDecay: 6,
    wake: 55,                // threat at which the nearest monster wakes into a STALKER
    panic: 82,               // threat at which the deep fully notices you
    stalkerStep: 1,          // cells a stalker closes per player move
    layers: 6,               // descend 6 layers; the deepest holds the Source
  };

  // ---- per-layer grid config (index 1..6). monsters/loot/vents are cell counts. ----
  var LAYERS = [
    null,
    { gw: 7,  gh: 7,  monsters: 6,  loot: 7, vents: 3, depth: 240,  pool: ["angler", "angler", "hagfish"], lootPool: ["data", "data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 10, loot: 8, vents: 3, depth: 640,  pool: ["angler", "hagfish", "swimmer"], lootPool: ["data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 13, loot: 8, vents: 3, depth: 1200, pool: ["swimmer", "squid", "angler"],   lootPool: ["data", "artifact", "relic"] },
    { gw: 9,  gh: 9,  monsters: 17, loot: 9, vents: 4, depth: 2100, pool: ["swimmer", "squid", "squid"],    lootPool: ["artifact", "relic", "data"] },
    { gw: 9,  gh: 9,  monsters: 20, loot: 9, vents: 4, depth: 3400, pool: ["squid", "swimmer", "bonewhale"],lootPool: ["relic", "artifact"] },
    { gw: 9,  gh: 10, monsters: 18, loot: 8, vents: 5, depth: 5200, pool: ["squid", "bonewhale", "leviathan"], lootPool: ["relic", "artifact"], source: true },
  ];

  // ---- monsters (the mines). single-cell so the deduction + safe-path guarantee stay clean;
  //      variety from damage, tier and portrait. reuse existing drawPortrait shapes. ----
  var MONSTERS = {
    angler:    { name: "Anglerfish",     tier: 1, shape: "angler",    dmg: [14, 22] },
    hagfish:   { name: "Hagfish Knot",   tier: 1, shape: "hagfish",   dmg: [12, 18] },
    swimmer:   { name: "Pale Swimmer",   tier: 2, shape: "swimmer",   dmg: [16, 24] },
    squid:     { name: "Colossal Squid", tier: 2, shape: "squid",     dmg: [22, 32] },
    bonewhale: { name: "Bonewhale",      tier: 3, shape: "whale",     dmg: [26, 38] },
    leviathan: { name: "THE LEVIATHAN",  tier: 4, shape: "leviathan", dmg: [40, 60] },
  };

  // ---- loot / cell contents (safe; NOT counted in numbers). ----
  var LOOT = {
    data:     { name: "Data Cache",    kind: "data",     value: [12, 26],   shape: "data" },
    artifact: { name: "Resonant Idol", kind: "artifact", value: [70, 150],  shape: "artifact" },
    relic:    { name: "Glyph Pillar",  kind: "artifact", value: [180, 360], shape: "artifact" },
    vent:     { name: "Thermal Vent",  kind: "vent",     o2: 34,            shape: "vent" },
    source:   { name: "THE SOURCE",    kind: "source",   value: [0, 0],     shape: "anomaly" },
  };

  var LORE = [
    "The Admiralty calls the signal a beacon. It pulses every nine seconds, from below the charted floor.",
    "No ports left to surface to. The hull is the world now. The monitor is the only window.",
    "Run silent. The ping is a bell, and something down here answers bells.",
    "K-219 is on the scope. The first sub sent down. Her log ends mid-word.",
    "The pressure has a texture this deep. It presses thoughts flat.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
  ];

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.LAYERS = LAYERS;
  root.DN.MONSTERS = MONSTERS;
  root.DN.LOOT = LOOT;
  root.DN.LORE = LORE;
})(typeof window !== "undefined" ? window : this);
