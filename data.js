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

  // (Economy removed — full psychological horror. No shop, no upgrades, no surfacing.
  //  One way: down to THE SOURCE, or the trench keeps you. Signals now pay AIR + lore.)

  // ---- per-layer grid config (index 1..6). monsters/loot/vents are cell counts.
  //      Fewer, riskier signals now: each SECURE is a real air-vs-danger gamble. ----
  var LAYERS = [
    null,
    { gw: 7,  gh: 7,  monsters: 6,  loot: 2, vents: 3, depth: 240,  pool: ["angler", "angler", "hagfish"], lootPool: ["data", "data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 10, loot: 2, vents: 3, depth: 640,  pool: ["angler", "hagfish", "swimmer"], lootPool: ["data", "data", "artifact"] },
    { gw: 8,  gh: 8,  monsters: 13, loot: 3, vents: 3, depth: 1200, pool: ["swimmer", "squid", "angler"],   lootPool: ["data", "artifact", "relic"] },
    { gw: 9,  gh: 9,  monsters: 19, loot: 3, vents: 4, depth: 2100, pool: ["swimmer", "squid", "squid", "bonewhale"], lootPool: ["artifact", "relic", "data"] },
    { gw: 9,  gh: 9,  monsters: 22, loot: 2, vents: 4, depth: 3400, pool: ["squid", "bonewhale", "bonewhale", "bloop"], lootPool: ["relic", "artifact"] },
    { gw: 9,  gh: 10, monsters: 20, loot: 2, vents: 5, depth: 5200, pool: ["bonewhale", "bloop", "bloop"], lootPool: ["relic", "artifact"], source: true },
  ];

  // ---- monsters (the mines). single-cell so the deduction + safe-path guarantee stay clean;
  //      variety from damage, tier and portrait. reuse existing drawPortrait shapes. ----
  // every contact is now a MUTATION — a drowned man's face grafted to an eel body. Tiers/dmg unchanged
  // so the minesweeper math + safe-path guarantee + numbers are identical; only the horror reskins.
  var MONSTERS = {
    angler:    { name: "Mutation (drifter)",   tier: 1, shape: "mutation",     dmg: [14, 22] },
    hagfish:   { name: "Mutation (knotted)",   tier: 1, shape: "mutation",     dmg: [12, 18] },
    swimmer:   { name: "Mutation (reacher)",   tier: 2, shape: "mutation",     dmg: [16, 24] },
    squid:     { name: "Mutation (many-armed)",tier: 2, shape: "mutation",     dmg: [22, 32] },
    bonewhale: { name: "Mutation (the host)",  tier: 3, shape: "mutation",     dmg: [26, 38] },
    bloop:     { name: "THE DOORMAN",          tier: 4, shape: "mutationKing", dmg: [50, 82] }, // many crews fused
  };

  // ---- loot / cell contents (safe; NOT counted in numbers). ----
  // SIGNALS you intercept (secured via the radar mini-game). `need` = locks required.
  // No money now: securing a signal vents an AIR cache and decodes a lore transmission.
  var LOOT = {
    data:     { name: "Faint Signal",     kind: "signal", o2: 30, shape: "signal", need: 2 },
    artifact: { name: "Encrypted Signal", kind: "signal", o2: 55, shape: "signal", need: 3 },
    relic:    { name: "Distress Beacon",  kind: "signal", o2: 85, shape: "signal", need: 4 },
    vent:     { name: "Thermal Vent",     kind: "vent",   o2: 34,                shape: "vent" },
    source:   { name: "THE SOURCE",       kind: "source", o2: 0,                 shape: "anomaly" },
  };

  var LORE = [
    "The Admiralty calls the signal a beacon. It pulses every nine seconds, from below the charted floor.",
    "No ports left to surface to. The hull is the world now. The monitor is the only window.",
    "Run silent. The ping is a bell, and something down here answers bells.",
    "K-219 is on the scope. The first sub sent down. Her log ends mid-word.",
    "The pressure has a texture this deep. It presses thoughts flat.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
  ];

  // ---- RADIO: the only voice down here. Command up top; static, the dead crew of K-219,
  //      and THE SOURCE (wearing Sergey's own voice) below. Carries the tutorial + the lore. ----
  var RADIO = {
    briefing: [
      { speaker: "КОМАНДА", line: "Волков. Comrade Volkov. Comms check — do you read?" },
      { speaker: "СЕРГЕЙ",  line: "Da. DN-7 reads. Air is green. I'm at the thermocline." },
      { speaker: "КОМАНДА", line: "Below you is the pulse. Every nine seconds. From under the floor." },
      { speaker: "КОМАНДА", line: "K-219 went down to it. Forty-one men. Her log ends mid-word." },
      { speaker: "КОМАНДА", line: "Find the Source. That is the mission. The Motherland watches." },
      { speaker: "КОМАНДА", line: "The cable is cut at the cline. No winch back. Understood?" },
      { speaker: "СЕРГЕЙ",  line: "...Understood. There is no turning back." },
      { speaker: "КОМАНДА", line: "Then descend. God keep you. We cannot." }
    ],
    tutorial: {
      idle:        { speaker: "КОМАНДА", line: "That screen is your sonar. The lit cell is you. DRIVE — one cell." },
      firstDrive:  { speaker: "КОМАНДА", line: "Good. Entering a cell shows what swims beside it." },
      firstNumber: { speaker: "КОМАНДА", line: "A number = anglers in the eight tiles around it. Read it. Deduce." },
      firstPing:   { speaker: "КОМАНДА", line: "PING sounds the dark ahead without moving. But it is LOUD." },
      firstFlag:   { speaker: "СЕРГЕЙ",  line: "Marked it. The boat won't drive a flag unless I insist." },
      firstMove:   { speaker: "КОМАНДА", line: "...the contact moved. They don't hold still down here. Re-read." },
      onSignal:    { speaker: "КОМАНДА", line: "A signal. SECURE it — lock the dial. It buys air. And answers." },
      lowAir:      { speaker: "КОМАНДА", line: "Air's low, Volkov. Find a vent, or the screen goes dark." },
      foundHatch:  { speaker: "КОМАНДА", line: "The descent hatch. Reach it, then CRANK the valve to go down." },
      firstCrank:  { speaker: "КОМАНДА", line: "Wheel's turning. Down you go. We'll be here." }
    },
    layer: {
      1: [ { speaker: "СЕРГЕЙ", line: "240 metres. Light still reaches. Still feels like the sea." } ],
      2: [ { speaker: "КОМАНДА", line: "Six forty metres. Pressure climbing. Signal's [помехи]... holding." },
           { speaker: "СЕРГЕЙ",  line: "The pulse is louder than my own heart now." } ],
      3: [ { speaker: "КОМАНДА", line: "...Volkov, repeat — [помехи] — say again your dep—" },
           { speaker: "K-219",   line: "...this is K-219... do not answer the bell... do not..." },
           { speaker: "СЕРГЕЙ",  line: "That was a Russian voice. K-219 sank in '86." },
           { speaker: "K-219",   line: "We called the first face the Seqkrey. Then it wore Petrov. Then us." } ],
      4: [ { speaker: "КОМАНДА", line: "[помехи] ...Sergey... are you... [помехи] ...alone down..." },
           { speaker: "K-219",   line: "We turned the valve. We all turned the valve. It opened." },
           { speaker: "СЕРГЕЙ",  line: "Forty-one names on the hull outside my window. I counted." } ],
      5: [ { speaker: "ИСТОЧНИК", line: "СЕРГЕЙ. (Sergey.) — in his own voice." },
           { speaker: "K-219",    line: "It learns the voice. Then it wears it. Then you answer." },
           { speaker: "СЕРГЕЙ",   line: "Command stopped replying at 3000. I keep talking anyway." } ],
      6: [ { speaker: "ИСТОЧНИК", line: "Ты почти дома. (You are almost home.)" },
           { speaker: "ИСТОЧНИК", line: "The door was never locked, Sergey. You were." },
           { speaker: "СЕРГЕЙ",   line: "...Da. Da. I'm coming down. There was never any back." } ]
    },
    signals: [
      { speaker: "[помехи]", line: "\"...сорок один. forty-one. all accounted for. all... down here.\"" },
      { speaker: "[помехи]", line: "\"depth log K-219: the floor has a pulse. the floor has a do—\"" },
      { speaker: "[помехи]", line: "\"tell my wife the ice — [помехи] — tell her I went quiet.\"" },
      { speaker: "[помехи]", line: "\"it is not sonar. it is breathing. nine seconds. in. out.\"" },
      { speaker: "[помехи]", line: "\"we drilled the floor and the floor blinked.\"" },
      { speaker: "[помехи]", line: "\"do not flag the dark. it sees the flag. it moves.\"" },
      { speaker: "[помехи]", line: "\"Москва, this is K-219. we are not sinking. we are being let in.\"" },
      { speaker: "[помехи]", line: "\"the last man kept the valve warm for whoever came after.\"" },
      { speaker: "[помехи]", line: "\"Sergey. it spelled your name in the static before you launched.\"" },
      { speaker: "[помехи]", line: "\"air is a leash. when it ends, you stay. we all stayed.\"" },
      { speaker: "[помехи]", line: "\"the Bloop is not the monster. it is the lock. you are the key.\"" },
      { speaker: "[помехи]", line: "\"...home. home. home. home. ho—\" [signal lost]" }
    ],
    ambient: {
      move: [
        { speaker: "СЕРГЕЙ",   line: "It's not where I left it." },
        { speaker: "СЕРГЕЙ",   line: "Something just changed on the glass." },
        { speaker: "K-219",    line: "They only move when you stop looking." },
        { speaker: "[помехи]", line: "...closer... [помехи]" }
      ],
      nearMiss: [
        { speaker: "СЕРГЕЙ",   line: "It's against the hull. I can hear it breathe." },
        { speaker: "СЕРГЕЙ",   line: "It's pressing its face to the glass. Still smiling." },
        { speaker: "K-219",    line: "Run silent. Run silent. Run sil—" },
        { speaker: "ИСТОЧНИК", line: "One cell. Один. So close, Sergey." }
      ],
      threat: [
        { speaker: "КОМАНДА",  line: "[помехи] you're making noise — they're awake — [помехи]" },
        { speaker: "СЕРГЕЙ",   line: "Too loud. I was too loud." }
      ],
      deepIdle: [
        { speaker: "СЕРГЕЙ",   line: "The pressure presses my thoughts flat." },
        { speaker: "ИСТОЧНИК", line: "Why have you stopped? Keep coming down." },
        { speaker: "ИСТОЧНИК", line: "Stop swimming, Sergey. Let the face finish forming. It's almost yours." },
        { speaker: "K-219",    line: "Don't sit still. Sitting still is how it finds the face." }
      ]
    },
    source: [
      { speaker: "ИСТОЧНИК", line: "Здравствуй. (Hello.) I have your voice now." },
      { speaker: "ИСТОЧНИК", line: "Turn the wheel. The crew is so glad you came." },
      { speaker: "СЕРГЕЙ",   line: "For the Motherland. For K-219. ...For nothing. Crank." }
    ],
    win:       { speaker: "ИСТОЧНИК", line: "Добро пожаловать домой, Сергей. Welcome home." },
    deathHull: { speaker: "СЕРГЕЙ",   line: "Seam's gone — water — [помехи] — tell them I reached—" },
    deathAir:  [ { speaker: "СЕРГЕЙ", line: "No air. The cold gets in. My mouth... why does my mouth feel wide." },
                 { speaker: "K-219",  line: "Now you stay. Now you smile. Now you keep the valve warm." } ],
    seal:      { speaker: "КОМАНДА", line: "Clang. Hatch sealed. No way up now, Sergey. Only down." },
    noway:     { speaker: "СЕРГЕЙ",  line: "There's no surface to run to. Find the hatch. Go down." },
    // the MUTATION reveal — the lost crew, wearing the faces they drowned in
    reveal: [
      { speaker: "СЕРГЕЙ", line: "It came up to the glass. It... it has a face. A man's face." },
      { speaker: "СЕРГЕЙ", line: "It's smiling at me. Too wide. Why is it smiling." },
      { speaker: "K-219",  line: "Don't look away. It only smiles wider when you look away." },
      { speaker: "СЕРГЕЙ", line: "Those are faces. Those are the crew. God — that's Antonov." }
    ]
  };

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.LAYERS = LAYERS;
  root.DN.MONSTERS = MONSTERS;
  root.DN.LOOT = LOOT;
  root.DN.LORE = LORE;
  root.DN.RADIO = RADIO;
})(typeof window !== "undefined" ? window : this);
