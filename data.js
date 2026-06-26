/* DREADNOUGHT v4 — Minesweeper-deduction fused into first-person submarine navigation.
 * The CRT monitor IS a top-down minesweeper grid; the sub is one cell. Driving into a cell
 * reveals it (numbers = adjacent monsters). Deduce the safe path down to the descent hatch.
 * Diegetic horror UI (oxygen tank + flooding cabin). No shop, no text HUD.
 * Tune one number at a time (game-design-system §0.6/§9.5). */
(function (root) {
  "use strict";

  var CFG = {
    startHull: 100, maxHull: 100,
    startOxygen: 210,        // seconds of air (the dread clock) — tighter
    idleDrain: 0.65,         // air lost per second while thinking — harsher
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
    startPatches: 2,         // hull patch kits carried (hands-on leak repair)
    patchAmount: 32,         // hull restored per patch
    tetherCells: 0,          // 0 = whole grid is the winch reach (the grid IS the tether radius)
  };

  // ---- oil-rig OUTFITTER: equipment upgrades (persistent) bought with banked haul ----
  var SHOP = [
    { id: "hull",  name: "Reinforced Hull",  costs: [120, 300, 650],  vals: [130, 165, 200], unit: "max hull", desc: "Welded pressure plating. Survive deeper strikes." },
    { id: "o2",    name: "O₂ Scrubbers",     costs: [120, 300, 650],  vals: [260, 320, 380], unit: "max air",  desc: "Bigger tanks. More air per descent." },
    { id: "pings", name: "Sonar Capacitor",  costs: [150, 420],       vals: [4, 5],          unit: "pings/layer", desc: "More sounding charges to deduce at range." },
    { id: "patch", name: "Patch Kits ×2",    costs: [80],             vals: [2],             unit: "", repeat: true, desc: "Two more hull patches. Seal a leak by hand mid-dive." },
    { id: "bilge", name: "Bilge Pump",       costs: [260],            vals: [1],             unit: "", desc: "Pumps the cabin: flooding rises far slower." },
    { id: "light", name: "Floodlight",       costs: [200],            vals: [1],             unit: "", desc: "Brighter beam, quieter rig — the dark sees you less." },
  ];

  // ---- cute cabin DECORATIONS (cosmetic morale; shown hanging in the cockpit) ----
  var PLUSHIES = [
    { id: "duck",  name: "Rubber Duck",      cost: 40, col: "#e0a32e" },
    { id: "bear",  name: "Teddy Bear",       cost: 55, col: "#b8703a" },
    { id: "angler",name: "Plush Anglerfish", cost: 70, col: "#46f0c8" },
    { id: "squid", name: "Plush Squid",      cost: 70, col: "#c3aeff" },
    { id: "jelly", name: "Plush Jellyfish",  cost: 80, col: "#9cffe6" },
  ];

  // ---- per-layer grid config (index 1..6). monsters/loot/vents are cell counts. ----
  var LAYERS = [
    null,
    { gw: 7,  gh: 7,  monsters: 6,  loot: 7, vents: 3, depth: 240,  pool: ["angler", "angler", "hagfish"], lootPool: ["data", "data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 10, loot: 8, vents: 3, depth: 640,  pool: ["angler", "hagfish", "swimmer"], lootPool: ["data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 13, loot: 8, vents: 3, depth: 1200, pool: ["swimmer", "squid", "angler"],   lootPool: ["data", "artifact", "relic"] },
    { gw: 9,  gh: 9,  monsters: 19, loot: 9, vents: 4, depth: 2100, pool: ["swimmer", "squid", "squid", "bonewhale"], lootPool: ["artifact", "relic", "data"] },
    { gw: 9,  gh: 9,  monsters: 22, loot: 9, vents: 4, depth: 3400, pool: ["squid", "bonewhale", "bonewhale", "bloop"], lootPool: ["relic", "artifact"] },
    { gw: 9,  gh: 10, monsters: 20, loot: 8, vents: 5, depth: 5200, pool: ["bonewhale", "bloop", "bloop"], lootPool: ["relic", "artifact"], source: true },
  ];

  // ---- monsters (the mines). single-cell so the deduction + safe-path guarantee stay clean;
  //      variety from damage, tier and portrait. reuse existing drawPortrait shapes. ----
  var MONSTERS = {
    angler:    { name: "Anglerfish",     tier: 1, shape: "angler",    dmg: [14, 22] },
    hagfish:   { name: "Hagfish Knot",   tier: 1, shape: "hagfish",   dmg: [12, 18] },
    swimmer:   { name: "Pale Swimmer",   tier: 2, shape: "swimmer",   dmg: [16, 24] },
    squid:     { name: "Colossal Squid", tier: 2, shape: "squid",     dmg: [22, 32] },
    bonewhale: { name: "Bonewhale",      tier: 3, shape: "whale",     dmg: [26, 38] },
    bloop:     { name: "THE BLOOP",      tier: 4, shape: "bloop",     dmg: [50, 82] }, // colossal; the deep horror
  };

  // ---- loot / cell contents (safe; NOT counted in numbers). ----
  // SIGNALS you intercept (secured via the radar mini-game). `need` = locks required.
  var LOOT = {
    data:     { name: "Faint Signal",     kind: "signal", value: [14, 30],   shape: "signal", need: 2 },
    artifact: { name: "Encrypted Signal", kind: "signal", value: [80, 170],  shape: "signal", need: 3 },
    relic:    { name: "Distress Beacon",  kind: "signal", value: [200, 400], shape: "signal", need: 4 },
    vent:     { name: "Thermal Vent",     kind: "vent",   o2: 34,            shape: "vent" },
    source:   { name: "THE SOURCE",       kind: "source", value: [0, 0],     shape: "anomaly" },
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
  root.DN.SHOP = SHOP;
  root.DN.PLUSHIES = PLUSHIES;
  root.DN.LORE = LORE;
})(typeof window !== "undefined" ? window : this);
