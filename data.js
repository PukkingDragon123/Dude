/* DREADNOUGHT v3 — Iron Lung-like deep-sea horror. Pure data/config.
 * You pilot a tiny submarine through a pitch-black abyss, navigating by RADAR:
 * ping to tell loot from monster, thrust forward through 3D water to collect it,
 * peek with the headlight, and pray the dark stays empty. No shop, no upgrades.
 * Tune one number at a time (game-design-system §0.6/§9.5). */
(function (root) {
  "use strict";

  var CFG = {
    startHull: 100, maxHull: 100,
    startOxygen: 200,        // seconds of air — the dread clock
    oxygenDrain: 1.0,        // air lost per second, baseline
    speed: 7.0,              // world units / sec at full thrust
    reverseFrac: 0.5,        // reverse thrust fraction
    turnSpeed: 1.5,          // rad / sec
    fov: 1.25,               // forward view field of view (radians)
    headlightRange: 30,      // how far the light reaches
    collectRange: 4.2,       // distance to grab loot / get struck by a monster
    maxRadar: 64,            // radar + spawn range (world units)
    pingThreat: 18,          // THREAT added by an active ping (noise)
    lightThreat: 7,          // THREAT / sec while the headlight is on
    moveThreat: 3,           // THREAT / sec while thrusting
    threatDecay: 6,          // THREAT / sec lost while running silent
    wakeThreat: 55,          // above this the nearest monster wakes and hunts
    panicThreat: 80,         // above this every monster hunts; the deep notices you
    monsterHuntSpeed: 0.62,  // fraction of sub top speed when hunting
    monsterDamage: [14, 26], // hull damage on a strike
    monsterSanity: [8, 16],
    targetContacts: 7,       // how many contacts to keep live in the field
    sourceDepth: 2400,       // reach this depth (metres) to find the Source -> win
    depthPerUnit: 0.9,       // metres of depth gained per world-unit travelled forward
  };

  // ---- loot / contact archetypes (what a non-monster blip can be) ----
  var LOOT = {
    data:     { name: "Data Cache",   kind: "data",     value: [12, 26],   shape: "data" },
    artifact: { name: "Resonant Idol",kind: "artifact", value: [70, 150],  shape: "artifact", deep: 600 },
    relic:    { name: "Glyph Pillar", kind: "artifact", value: [180, 360], shape: "artifact", deep: 1400 },
    vent:     { name: "Air Pocket",   kind: "vent",     o2: 35,            shape: "vent" },
    source:   { name: "THE SOURCE",   kind: "source",   value: [0, 0],     shape: "anomaly" },
  };

  // ---- monsters (the blips you must NOT approach). reuse existing portraits. ----
  var MONSTERS = {
    angler:    { name: "Anglerfish",     tier: 1, shape: "angler",    dmg: [14, 22], lure: true },
    swimmer:   { name: "Pale Swimmer",   tier: 2, shape: "swimmer",   dmg: [16, 24] },
    squid:     { name: "Colossal Squid", tier: 2, shape: "squid",     dmg: [22, 32] },
    leviathan: { name: "THE LEVIATHAN",  tier: 3, shape: "leviathan", dmg: [40, 60] },
  };

  // ---- depth-scaled spawn weighting. As you descend, monsters get worse and
  //      loot gets richer. Picked by `pickSpawn(depthM)` logic in game.js. ----
  var SPAWN = [
    // depth(m) at/after which this table applies; monster chance; pools
    { depth: 0,    monsterChance: 0.30, monsters: ["angler", "angler", "swimmer"], loot: ["data", "data", "data", "vent", "artifact"] },
    { depth: 600,  monsterChance: 0.40, monsters: ["angler", "swimmer", "swimmer", "squid"], loot: ["data", "data", "vent", "artifact", "artifact"] },
    { depth: 1400, monsterChance: 0.52, monsters: ["swimmer", "squid", "squid", "leviathan"], loot: ["data", "vent", "artifact", "relic"] },
    { depth: 2000, monsterChance: 0.60, monsters: ["squid", "swimmer", "leviathan", "leviathan"], loot: ["artifact", "relic", "vent"] },
  ];

  var LORE = [
    "Dive log: The Admiralty calls the signal a beacon. It pulses every nine seconds, from below the charted floor.",
    "No ports left to surface to. The hull is the world now. The radar is the only window.",
    "The contacts move when the ping fades. I have stopped telling the men what the scope shows.",
    "The signal is not code. It is nine seconds of a voice, slowed until it is only weight.",
    "We found K-219, the first sub sent down. Her log ends mid-word. Her reactor is still warm.",
    "Run silent. The light is a bell, and something down here answers bells.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
  ];

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.LOOT = LOOT;
  root.DN.MONSTERS = MONSTERS;
  root.DN.SPAWN = SPAWN;
  root.DN.LORE = LORE;
})(typeof window !== "undefined" ? window : this);
