/* DREADNOUGHT — game content & balance data.
 * Pure data (no logic): game.js interprets `kind`/reward tables.
 * Tune one number at a time (game-design-system §0.6 / §9.5). */
(function (root) {
  "use strict";

  var CFG = {
    maxHull: 100, maxOxygen: 100, maxSanity: 100,
    startHull: 100, startOxygen: 100, startSanity: 100,
    powerPerTurn: 3,
    handSize: 5,
    bands: 8,            // band 8 = the floor / the source
    descendOxygen: 8,    // O2 cost to dive a band
    holdOxygen: 3,       // O2 cost to "hold position" (end cycle, redraw, refill power)
    lowSanity: 40,       // below this the scope shows phantoms
    phantomChance: 0.5,  // chance a low-sanity band spawns a phantom contact
  };

  // ---- Card library. target: 'none' (self/board) or 'contact'. ----
  var CARDS = {
    ping:        { id:"ping",        name:"Sonar Ping",        cost:1, kind:"ping",        target:"none",    cat:"read",  desc:"Classify every contact by signature." },
    scan:        { id:"scan",        name:"Deep Scan",         cost:1, kind:"scan",        target:"contact", cat:"read",  desc:"Fully identify one contact and its threat." },
    investigate: { id:"investigate", name:"Investigate",       cost:2, kind:"investigate", target:"contact", cat:"act",   desc:"Resolve a contact for salvage. Creatures retaliate." },
    evade:       { id:"evade",       name:"Evasive Trim",      cost:1, kind:"evade",       target:"contact", cat:"act",   desc:"A creature loses our scent. It will not strike." },
    brace:       { id:"brace",       name:"Brace Hull",        cost:1, kind:"hull",        target:"none",    cat:"fix",   amount:18, desc:"Reinforce the hull. +18 HULL." },
    vent:        { id:"vent",        name:"Purge Scrubbers",   cost:1, kind:"oxygen",      target:"none",    cat:"fix",   amount:20, desc:"Restore breathable air. +20 O2." },
    steady:      { id:"steady",      name:"Steady the Crew",   cost:1, kind:"sanity",      target:"none",    cat:"fix",   amount:18, desc:"Calm the crew. +18 MIND." },

    // ---- salvageable / reward cards ----
    plating:     { id:"plating",     name:"Reinforced Plating",cost:1, kind:"hull",        target:"none",    cat:"fix",   amount:34, desc:"Welded scrap armour. +34 HULL." },
    o2cache:     { id:"o2cache",     name:"Oxygen Cache",      cost:1, kind:"oxygen",      target:"none",    cat:"fix",   amount:40, desc:"A looted air reserve. +40 O2." },
    torpedo:     { id:"torpedo",     name:"Pressure Torpedo",  cost:2, kind:"kill",        target:"contact", cat:"act",   desc:"Destroy a creature contact outright." },
    resonance:   { id:"resonance",   name:"Resonance",         cost:2, kind:"reveal",      target:"none",    cat:"read",  sanityCost:8, desc:"Identify ALL contacts. −8 MIND." },
    charts:      { id:"charts",      name:"Old Charts",        cost:0, kind:"freedescend", target:"none",    cat:"act",   once:true, desc:"Descend with no oxygen cost. One use." },
    focus:       { id:"focus",       name:"Adrenaline",        cost:0, kind:"power",       target:"none",    cat:"act",   amount:2, desc:"+2 PWR this cycle." },
    knowledge:   { id:"knowledge",   name:"Forbidden Knowledge",cost:1,kind:"reveal",      target:"none",    cat:"read",  sanityCost:14, lore:true, desc:"Identify ALL contacts and read the deep. −14 MIND." },
    madness:     { id:"madness",     name:"Intrusive Thought", cost:0, kind:"curse",       target:"none",    cat:"curse", desc:"Unplayable. −1 MIND each cycle it clogs the hand." },
  };

  var START_DECK = ["ping","ping","scan","scan","investigate","investigate","evade","brace","vent","steady"];

  // ---- Contact archetypes by category ----
  var CONTACTS = {
    wreck: [
      { name:"Sister Sub K-219" }, { name:"Trawler Morskaya" }, { name:"Cargo Hulk" },
      { name:"Drowned Bathyscaphe" }, { name:"Listing Tanker" }, { name:"Buried Pipeline" },
    ],
    artifact: [
      { name:"Black Monolith" }, { name:"Resonant Idol" }, { name:"Glyph Pillar" },
      { name:"Bonecage Shrine" }, { name:"The Antenna" },
    ],
    creature: {
      1: [ { name:"Anglerfish Horror", atk:[8,14], type:"hull" },
           { name:"Gulper Shoal",      atk:[8,12], type:"hull" },
           { name:"Hagfish Knot",      atk:[8,12], type:"sanity" } ],
      2: [ { name:"Pale Swimmer",      atk:[16,22], type:"sanity" },
           { name:"Colossal Squid",    atk:[18,24], type:"hull" },
           { name:"Bonewhale Calf",    atk:[16,22], type:"hull" } ],
      3: [ { name:"THE LEVIATHAN",     atk:[34,44], type:"hull" } ],
    },
    anomaly: [
      { name:"Whisper Rift" }, { name:"Pressure Bloom" }, { name:"Signal Ghost" },
      { name:"The Hollow" }, { name:"Static Choir" },
    ],
  };

  // ---- Reward tables (weighted). type 'card' adds a card; 'res' changes a stat; 'lore'. ----
  var REWARDS = {
    wreck: [
      { w:3, type:"card", card:"plating" },
      { w:3, type:"card", card:"o2cache" },
      { w:1, type:"card", card:"torpedo" },
      { w:2, type:"res", stat:"hull", amt:15, msg:"Salvaged hull plate. +15 HULL." },
      { w:2, type:"res", stat:"oxygen", amt:18, msg:"Tapped a live air line. +18 O2." },
    ],
    artifact: [
      { w:3, type:"card", card:"resonance" },
      { w:2, type:"card", card:"charts" },
      { w:3, type:"card", card:"focus" },
      { w:2, type:"lore" },
    ],
    anomaly: [
      { w:3, type:"card", card:"knowledge" },
      { w:2, type:"card", card:"resonance" },
      { w:3, type:"lore" },
      { w:3, type:"card", card:"madness" },
    ],
  };

  // sanity paid when you investigate these categories (creatures handled separately)
  var INVESTIGATE_SANITY = { wreck:0, artifact:8, anomaly:10 };
  var ANOMALY_DRAIN = 3; // sanity lost per held cycle while an anomaly is present

  // ---- Per-band generation config (index 0 unused; bands 1..8) ----
  // catW: category weights. cTier: allowed creature tiers (weighted by order).
  var BANDS = [
    null,
    { depth:120,  count:3, catW:{wreck:5,artifact:3,creature:2,anomaly:0}, cTier:[1] },
    { depth:380,  count:4, catW:{wreck:4,artifact:3,creature:3,anomaly:1}, cTier:[1] },
    { depth:760,  count:4, catW:{wreck:3,artifact:3,creature:4,anomaly:2}, cTier:[1,2] },
    { depth:1300, count:5, catW:{wreck:3,artifact:2,creature:4,anomaly:3}, cTier:[1,2] },
    { depth:2100, count:5, catW:{wreck:2,artifact:2,creature:5,anomaly:3}, cTier:[2,1] },
    { depth:3200, count:5, catW:{wreck:2,artifact:2,creature:5,anomaly:4}, cTier:[2] },
    { depth:4800, count:4, catW:{wreck:1,artifact:2,creature:5,anomaly:5}, cTier:[2] },
    { depth:6400, count:1, catW:{creature:1}, cTier:[3], floor:true }, // the source
  ];

  var LORE = [
    "Crew log, day 1: The Admiralty calls it a beacon. It pulses every nine seconds, from below the charted floor.",
    "Day 3: A second pulse answers the first now. We did not bring a second beacon.",
    "Sonar op: the contacts move when we don't watch them. I've stopped telling the captain.",
    "Day 6: The signal is not code. It is nine seconds of a voice, slowed until it is only weight.",
    "We found the first sub sent down. K-219. Her log ends mid-word. Her reactor is still warm.",
    "The pressure has a texture this deep. It presses thoughts flat. The men hear their mothers in the pipes.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
  ];

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.CARDS = CARDS;
  root.DN.START_DECK = START_DECK;
  root.DN.CONTACTS = CONTACTS;
  root.DN.REWARDS = REWARDS;
  root.DN.INVESTIGATE_SANITY = INVESTIGATE_SANITY;
  root.DN.ANOMALY_DRAIN = ANOMALY_DRAIN;
  root.DN.BANDS = BANDS;
  root.DN.LORE = LORE;
})(typeof window !== "undefined" ? window : this);
