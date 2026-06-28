/* DREADNOUGHT v5 — Minesweeper-deduction fused into first-person submarine survival.
 * The CRT monitor IS a top-down minesweeper grid; the sub is one cell. Driving into a cell
 * reveals it (numbers = adjacent MINES). One wrong cell DETONATES — instant death.
 * Air only ever drains. The deep crushes the hull: PRESSURE springs LEAKS you can only find by
 * LOOKING OUT the window — and you cannot read the radar while your face is at the glass.
 * Diegetic horror UI. No shop, no economy, no refills. Just the descent, or the dark keeps you. */
(function (root) {
  "use strict";

  var CFG = {
    startHull: 100, maxHull: 100,
    startOxygen: 180,        // seconds of air — the ONLY resource, and it never refills
    idleDrain: 0.8,          // air lost per second while you think
    moveCost: 5,             // air spent per completed drive
    moveGlide: 0.30,         // seconds the sub glides between cells
    pingsStart: 3,           // sonar pings per layer
    pingCone: 3,             // cells deep a ping reveals
    threatPing: 18, threatLight: 7, threatMove: 2.5, threatDecay: 6, // noise -> ambient dread + faster pressure
    wake: 55, panic: 82,
    layers: 6,               // descend 6 layers; the deepest holds the Source
    // ---- PRESSURE: the deep crushes the hull. Leaks spring on a timer that tightens with depth.
    //      A leak floods until you LOOK OUT, locate it, and PATCH it. Patching is free — the cost is
    //      the air you burn at the glass, blind to the mines on the radar. ----
    leakIntervalBase: 19,    // seconds between leaks in the shallows
    leakIntervalMin: 5.5,    // ...down to this at crush depth
    leakFlood: 5.2,          // hull lost per second per unpatched leak
    leakBurst: 20,           // a leak left this long BURSTS (its flood doubles)
    pressureAirBoost: 0.55,  // extra air/sec drain at full depth (the crush makes you breathe harder)
  };

  // ---- per-layer grid config (index 1..6). `mines` = hidden-mine cell count.
  //      A safe corridor start->hatch is always carved, so every layer is solvable; the danger is
  //      that a single mistaken cell ends the run, the air never stops, and the hull keeps splitting. ----
  var LAYERS = [
    null,
    { gw: 7,  gh: 7,  mines: 7,  depth: 240,  pool: ["mine"] },
    { gw: 8,  gh: 8,  mines: 12, depth: 640,  pool: ["mine"] },
    { gw: 8,  gh: 8,  mines: 15, depth: 1200, pool: ["mine"] },
    { gw: 9,  gh: 9,  mines: 21, depth: 2100, pool: ["mine"] },
    { gw: 9,  gh: 9,  mines: 25, depth: 3400, pool: ["mine"] },
    { gw: 9,  gh: 10, mines: 24, depth: 5200, pool: ["mine"], source: true },
  ];

  // ---- the hidden hazard: a PRESSURE MINE on the trench floor. Single-cell so the deduction +
  //      safe-path guarantee + numbers stay clean. Contact = detonation = death. No variety needed. ----
  var MINES = {
    mine: { name: "Pressure Mine", shape: "mine" },
  };

  // ---- cell contents. Only the descent HATCH and (on the floor) THE SOURCE matter now. ----
  var LOOT = {
    source: { name: "THE SOURCE", kind: "source", shape: "anomaly" },
  };

  var LORE = [
    "The Admiralty calls the signal a beacon. It pulses every nine seconds, from below the charted floor.",
    "No ports left to surface to. The hull is the world now. The monitor is the only window.",
    "Run silent. Read the numbers. One wrong cell and the iron finds you.",
    "K-219 is on the scope. The first sub sent down. Her log ends mid-word.",
    "The pressure has a texture this deep. It presses thoughts flat, and finds the seams.",
    "It is not a beacon and not a creature. It is a door — and it has been knocking.",
  ];

  // ---- RADIO: the only voice down here. Command up top; static, the dead crew of K-219,
  //      and THE SOURCE (wearing Sergey's own voice) below. Carries the tutorial + the lore. ----
  var RADIO = {
    briefing: [
      { speaker: "КОМАНДА", line: "Волков. Comrade Volkov. Comms check — do you read?" },
      { speaker: "СЕРГЕЙ",  line: "Da. DN-7 reads. Air is green. I'm at the thermocline." },
      { speaker: "КОМАНДА", line: "The trench floor is sown with iron. Pressure mines. K-219's, or older." },
      { speaker: "КОМАНДА", line: "Read your sonar. Numbers count the mines beside a cell. One mistake is the last." },
      { speaker: "КОМАНДА", line: "Find the Source. That is the mission. The Motherland watches." },
      { speaker: "КОМАНДА", line: "The cable is cut at the cline. No winch back. Understood?" },
      { speaker: "СЕРГЕЙ",  line: "...Understood. There is no turning back." },
      { speaker: "КОМАНДА", line: "Then descend. God keep you. We cannot." }
    ],
    tutorial: {
      idle:        { speaker: "КОМАНДА", line: "That screen is your sonar. The lit cell is you. DRIVE — one cell." },
      firstDrive:  { speaker: "КОМАНДА", line: "Good. Entering a cell shows what waits beside it." },
      firstNumber: { speaker: "КОМАНДА", line: "A number = MINES in the eight tiles around it. Read it. Deduce. Do not guess." },
      firstPing:   { speaker: "КОМАНДА", line: "PING sounds the dark ahead without moving. Safe cells only — mines stay dark." },
      firstFlag:   { speaker: "СЕРГЕЙ",  line: "Marked it. The boat won't drive a flag unless I insist." },
      firstLeak:   { speaker: "КОМАНДА", line: "Pressure's found a seam. LOOK OUT the window — find the leak — PATCH it. Fast." },
      lookOut:     { speaker: "СЕРГЕЙ",  line: "Can't see the sonar with my face at the glass. And the air doesn't wait." },
      lowAir:      { speaker: "КОМАНДА", line: "Air's low, Volkov. Nothing refills it down here. Reach the hatch." },
      foundHatch:  { speaker: "КОМАНДА", line: "The descent hatch. Reach it, then CRANK the valve to go down." },
      firstCrank:  { speaker: "КОМАНДА", line: "Wheel's turning. Down you go. We'll be here." }
    },
    layer: {
      1: [ { speaker: "СЕРГЕЙ", line: "240 metres. Light still reaches. Still feels like the sea." } ],
      2: [ { speaker: "КОМАНДА", line: "Six forty metres. Pressure climbing. Signal's [помехи]... holding." },
           { speaker: "СЕРГЕЙ",  line: "The pulse is louder than my own heart now." } ],
      3: [ { speaker: "КОМАНДА", line: "...Volkov, repeat — [помехи] — say again your dep—" },
           { speaker: "K-219",   line: "...this is K-219... do not answer the bell... do not..." },
           { speaker: "СЕРГЕЙ",  line: "That was a Russian voice. K-219 sank in '86." } ],
      4: [ { speaker: "КОМАНДА", line: "[помехи] ...Sergey... are you... [помехи] ...alone down..." },
           { speaker: "K-219",   line: "We turned the valve. We all turned the valve. It opened." },
           { speaker: "СЕРГЕЙ",   line: "Forty-one names on the hull outside my window. I counted." } ],
      5: [ { speaker: "ИСТОЧНИК", line: "СЕРГЕЙ. (Sergey.) — in his own voice." },
           { speaker: "K-219",    line: "The pressure does the work. It opens the hull, then opens the man." },
           { speaker: "СЕРГЕЙ",   line: "Command stopped replying at 3000. I keep talking anyway." } ],
      6: [ { speaker: "ИСТОЧНИК", line: "Ты почти дома. (You are almost home.)" },
           { speaker: "ИСТОЧНИК", line: "The door was never locked, Sergey. You were." },
           { speaker: "СЕРГЕЙ",   line: "...Da. Da. I'm coming down. There was never any back." } ]
    },
    ambient: {
      leak: [
        { speaker: "СЕРГЕЙ",   line: "Water. I can hear water. Where is it coming in?" },
        { speaker: "СЕРГЕЙ",   line: "A seam's gone somewhere. Have to look out and find it." },
        { speaker: "K-219",    line: "The sea always finds the seam. Always." }
      ],
      flood: [
        { speaker: "СЕРГЕЙ",   line: "It's filling. The water's at my boots." },
        { speaker: "КОМАНДА",  line: "Patch it, Volkov — patch it before the monitor drowns." },
        { speaker: "ИСТОЧНИК", line: "Let it in. The cold is only the door opening." }
      ],
      threat: [
        { speaker: "КОМАНДА",  line: "[помехи] you're making noise — the hull's straining — [помехи]" },
        { speaker: "СЕРГЕЙ",   line: "Too loud. The pressure heard me." }
      ],
      deepIdle: [
        { speaker: "СЕРГЕЙ",   line: "The pressure presses my thoughts flat." },
        { speaker: "ИСТОЧНИК", line: "Why have you stopped? Keep coming down." },
        { speaker: "ИСТОЧНИК", line: "Stop swimming, Sergey. Let the cold finish. It's almost done." },
        { speaker: "K-219",    line: "Don't sit still. The mines listen for a still boat." }
      ]
    },
    signals: [
      { speaker: "[помехи]", line: "\"...сорок один. forty-one. all accounted for. all... down here.\"" },
      { speaker: "[помехи]", line: "\"depth log K-219: the floor has a pulse. the floor has a do—\"" },
      { speaker: "[помехи]", line: "\"it is not sonar. it is breathing. nine seconds. in. out.\"" },
      { speaker: "[помехи]", line: "\"we drilled the floor and the floor blinked.\"" },
      { speaker: "[помехи]", line: "\"air is a leash. when it ends, you stay. we all stayed.\"" }
    ],
    source: [
      { speaker: "ИСТОЧНИК", line: "Здравствуй. (Hello.) I have your voice now." },
      { speaker: "ИСТОЧНИК", line: "Turn the wheel. The crew is so glad you came." },
      { speaker: "СЕРГЕЙ",   line: "For the Motherland. For K-219. ...For nothing. Crank." }
    ],
    win:       { speaker: "ИСТОЧНИК", line: "Добро пожаловать домой, Сергей. Welcome home." },
    deathHull: { speaker: "СЕРГЕЙ",   line: "Seam's gone — water — [помехи] — tell them I reached—" },
    deathMine: { speaker: "КОМАНДА",  line: "—detonation— Volkov? VOLKOV? ...DN-7, respond. ...DN-7." },
    deathAir:  [ { speaker: "СЕРГЕЙ", line: "No air. The cold gets in. My mouth... why does my mouth feel wide." },
                 { speaker: "K-219",  line: "Now you stay. Now you keep the valve warm." } ],
    seal:      { speaker: "КОМАНДА", line: "Clang. Hatch sealed. No way up now, Sergey. Only down." },
    noway:     { speaker: "СЕРГЕЙ",  line: "There's no surface to run to. Find the hatch. Go down." }
  };

  root.DN = root.DN || {};
  root.DN.CFG = CFG;
  root.DN.LAYERS = LAYERS;
  root.DN.MONSTERS = MINES;   // kept as DN.MONSTERS so game.js's MON alias is unchanged
  root.DN.LOOT = LOOT;
  root.DN.LORE = LORE;
  root.DN.RADIO = RADIO;
})(typeof window !== "undefined" ? window : this);
