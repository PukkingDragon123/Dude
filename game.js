/* DREADNOUGHT v2 — deduction-salvage roguelite: state, rules, input, rendering.
 * Depends (load order): strings.js, rng.js, data.js, audio.js, art.js.
 * The sonar scope is a Minesweeper grid; the meta loop is dive -> bank -> outfit -> dive deeper. */
(function () {
  "use strict";
  var CFG = DN.CFG, MON = DN.MONSTERS, LOOT = DN.LOOT, ZONES = DN.ZONES, SHOP = DN.SHOP, LORE = DN.LORE;
  var Art = DN.Art, Audio = DN.Audio, S = window.STR, PAL = Art.PAL;

  // ---------------- options (persisted) ----------------
  var OPT = { sound: true, shake: true, scanlines: true, textScale: 1 };
  try { var o = JSON.parse(localStorage.getItem("dn_opt") || "{}"); for (var k in o) OPT[k] = o[k]; } catch (e) {}
  function saveOpt() { try { localStorage.setItem("dn_opt", JSON.stringify(OPT)); } catch (e) {} }

  // ---------------- canvas ----------------
  var canvas = document.getElementById("c"), ctx = canvas.getContext("2d");
  var buf = document.createElement("canvas"), bctx = buf.getContext("2d");
  var W = 0, H = 0, DPR_CAP = 1.5, dpr = 1, SCALE = 3;
  var dev = new URLSearchParams(location.search).has("dev");
  if (dev) document.getElementById("dev").style.display = "block";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    SCALE = Math.max(2, Math.round(L.scene.w / 440));
    var bw = Math.max(160, Math.round(L.scene.w / SCALE)), bh = Math.max(120, Math.round(L.scene.h / SCALE));
    buf.width = bw; buf.height = bh;
    Art.rebake(bw, bh);
    seedParticles();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  // ---------------- layout ----------------
  var L = { scene: { x: 0, y: 0, w: 1, h: 1 }, top: {}, bottom: {}, buttons: {} };
  function layout() {
    var topH = clamp(H * 0.10, 44, 70);
    var bottomH = clamp(H * 0.17, 92, 158);
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.scene = { x: 0, y: topH, w: W, h: H - topH - bottomH };
    L.bottom = { x: 0, y: H - bottomH, w: W, h: bottomH };
    var bw = clamp(W * 0.17, 96, 168), bh = clamp(L.bottom.h * 0.40, 34, 52), gap = 8;
    var bx = W - bw - 12, by = L.bottom.y + 12;
    L.buttons.ascend = { x: bx, y: by, w: bw, h: bh };
    L.buttons.flag = { x: bx - bw - gap, y: by, w: bw, h: bh };
    L.buttons.peek = { x: bx - bw - gap, y: by + bh + 8, w: bw, h: bh };
    L.buttons.menu = { x: bx, y: by + bh + 8, w: bw, h: bh };
  }

  function gridGeom() {
    var pad = clamp(L.scene.w * 0.03, 8, 32);
    var availW = L.scene.w - pad * 2, availH = L.scene.h - pad * 2;
    var gap = 2;
    var cell = Math.floor(Math.min((availW - (G.gw - 1) * gap) / G.gw, (availH - (G.gh - 1) * gap) / G.gh));
    cell = clamp(cell, 8, 70);
    var fullW = G.gw * cell + (G.gw - 1) * gap, fullH = G.gh * cell + (G.gh - 1) * gap;
    var x = L.scene.x + (L.scene.w - fullW) / 2, y = L.scene.y + (L.scene.h - fullH) / 2;
    return { x: x, y: y, cell: cell, gap: gap, fullW: fullW, fullH: fullH };
  }
  function cellAtPoint(p) {
    var g = gridGeom();
    var cx = Math.floor((p.x - g.x) / (g.cell + g.gap)), cy = Math.floor((p.y - g.y) / (g.cell + g.gap));
    if (cx < 0 || cy < 0 || cx >= G.gw || cy >= G.gh) return null;
    return { x: cx, y: cy };
  }

  // ---------------- game state ----------------
  var G = null;
  function newRun(seed) {
    var rng = new RNG(seed);
    G = {
      scene: "port", seedStr: rng.seedStr, masterSeed: rng.seedStr, diveCount: 0,
      money: CFG.startMoney, up: { o2: 0, hull: 0, sanity: 0, peek: 0, chord: 0, tongs: 0, depth: 0 },
      cargo: [], shards: 0, loreSeen: [], selZone: 1,
      log: [], portMsg: "", portMsgT: 0, time: 0,
      // dive transient (set in startDive):
      zone: 1, gw: 6, gh: 6, cells: [], hull: 100, oxygen: 100, sanity: 100,
      maxHull: 100, maxOxygen: 100, maxSanity: 100, corruptThr: 40,
      hold: { data: 0, items: [] }, firstProbe: true, flagMode: false, peekArmed: false, peeksLeft: 0,
      cursor: { x: 0, y: 0 }, encounter: null, ascendConfirm: false, shopFocus: 0, menuSel: 0, padActive: false,
      flash: 0, flashCol: "180,40,40", shake: 0, threatUntil: 0,
      endKind: null, won: false, lastBank: null, tongsSaved: null,
    };
    revealLore();
  }

  function pushLog(m) { if (!m) return; G.log.push(m); if (G.log.length > 24) G.log.shift(); }
  function portMsg(m) { G.portMsg = m; G.portMsgT = 3; }
  function fmt(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, key) { return o && o[key] != null ? o[key] : ""; }); }
  function money() { return Math.floor(G.money); }

  // ---------------- upgrade-derived values ----------------
  function shopItem(id) { for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) return SHOP[i]; return null; }
  function shopVal(id, lvl) { var it = shopItem(id); return it.vals[lvl - 1]; }
  function effMaxHull() { return G.up.hull ? shopVal("hull", G.up.hull) : CFG.baseMaxHull; }
  function effMaxOxygen() { return G.up.o2 ? shopVal("o2", G.up.o2) : CFG.baseOxygen; }
  function effMaxSanity() { return CFG.baseMaxSanity; }
  function corruptThreshold() { return G.up.sanity >= 2 ? 25 : CFG.baseCorruptThreshold; }
  function sanityDrainMult() { return G.up.sanity >= 1 ? 0.5 : 1; }
  function peeksMax() { return G.up.peek; }
  function maxZone() { return clamp(1 + G.up.depth, 1, ZONES.length - 1); }

  function revealLore() {
    var idx = -1;
    for (var i = 0; i < LORE.length; i++) if (G.loreSeen.indexOf(i) < 0) { idx = i; break; }
    if (idx < 0) return "";
    G.loreSeen.push(idx);
    return LORE[idx];
  }

  // ---------------- dive setup ----------------
  function startDive(zone) {
    zone = clamp(zone, 1, maxZone());
    var Z = ZONES[zone];
    G.diveCount++;
    G.diveRng = new RNG(G.masterSeed + "#" + zone + "#" + G.diveCount);
    G.zone = zone; G.gw = Z.w; G.gh = Z.h;
    G.maxHull = effMaxHull(); G.maxOxygen = effMaxOxygen(); G.maxSanity = effMaxSanity();
    G.hull = G.maxHull; G.oxygen = G.maxOxygen; G.sanity = G.maxSanity;
    G.corruptThr = corruptThreshold(); G.peeksLeft = peeksMax();
    G.hold = { data: 0, items: [] }; G.firstProbe = true; G.flagMode = false; G.peekArmed = false;
    G.encounter = null; G.ascendConfirm = false; G.threatUntil = 0;
    G.cursor = { x: Math.floor(G.gw / 2), y: Math.floor(G.gh / 2) };
    G.cells = [];
    for (var i = 0; i < G.gw * G.gh; i++) G.cells.push(makeCell(i % G.gw, Math.floor(i / G.gw)));
    G.scene = "dive";
    pushLog(fmt(S.log_dive_start, { zone: Z.name, d: Z.depth }));
    Audio.setMusic(Z.source ? "threat" : "ambient");
  }
  function makeCell(x, y) { return { x: x, y: y, mon: false, monRef: null, lootId: null, loot: null, n: 0, revealed: false, flagged: false, peek: false, triggered: false, collected: false, dnum: 0, cor: false }; }
  function cell(x, y) { return (x < 0 || y < 0 || x >= G.gw || y >= G.gh) ? null : G.cells[y * G.gw + x]; }
  function forEachNbr(x, y, fn) { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var c = cell(x + dx, y + dy); if (c) fn(c); } }

  // ---------------- grid generation (after first probe; first cell safe) ----------------
  function footprint(shape, ox, oy, rng) {
    var s;
    if (shape === "pair") s = rng.chance(0.5) ? [[0, 0], [1, 0]] : [[0, 0], [0, 1]];
    else if (shape === "line3") s = rng.chance(0.5) ? [[0, 0], [1, 0], [2, 0]] : [[0, 0], [0, 1], [0, 2]];
    else if (shape === "box2x2") s = [[0, 0], [1, 0], [0, 1], [1, 1]];
    else s = [[0, 0]];
    var out = []; for (var i = 0; i < s.length; i++) out.push([ox + s[i][0], oy + s[i][1]]);
    return out;
  }
  function genGrid(sx, sy) {
    var Z = ZONES[G.zone], rng = G.diveRng;
    var safe = {};
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var c = cell(sx + dx, sy + dy); if (c) safe[c.y * G.gw + c.x] = true; }

    function tryPlace(id) {
      var def = MON[id];
      var shape = (def.multiZone && G.zone >= def.multiZone && def.multiFootprint) ? def.multiFootprint : def.footprint;
      for (var attempt = 0; attempt < 30; attempt++) {
        var ox = rng.int(0, G.gw - 1), oy = rng.int(0, G.gh - 1);
        var fp = footprint(shape, ox, oy, rng), ok = true;
        for (var i = 0; i < fp.length; i++) { var cc = cell(fp[i][0], fp[i][1]); if (!cc || cc.mon || safe[cc.y * G.gw + cc.x]) { ok = false; break; } }
        if (!ok) continue;
        var monObj = { id: id };
        for (var j = 0; j < fp.length; j++) { var c2 = cell(fp[j][0], fp[j][1]); c2.mon = true; c2.monRef = monObj; }
        return fp.length;
      }
      return 0;
    }

    // Z.monsters is a budget of OCCUPIED CELLS (multi-cell bodies count by their footprint),
    // so occupied-cell density tracks the frozen ~14%->28% targets regardless of footprint mix.
    var placed = 0, guard = 0;
    if (Z.leviathan) { placed += tryPlace("leviathan"); }
    while (placed < Z.monsters && guard++ < 3000) { placed += tryPlace(rng.pick(Z.pool)); }

    // ---- loot on safe (non-monster) cells, none on the first-probe pocket edge is fine ----
    function freeCells() { var f = []; for (var i = 0; i < G.cells.length; i++) { var c = G.cells[i]; if (!c.mon && !c.lootId) f.push(c); } return f; }
    function placeLoot(id, count) { for (var n = 0; n < count; n++) { var f = freeCells(); if (!f.length) return; var c = rng.pick(f); c.lootId = id; c.loot = LOOT[id].kind; } }

    if (Z.shard) placeLoot("shard", Z.shard);
    var arts = Z.artifacts || 0;
    for (var a = 0; a < arts; a++) {
      var apool = Z.artifactPool.filter(function (id) { return !(LOOT[id].minZone && G.zone < LOOT[id].minZone); });
      if (!apool.length) apool = ["idol"];
      placeLoot(rng.pick(apool), 1);
    }
    placeLoot("wreck", Z.wrecks || 0);
    placeLoot("vent", Z.vents || 0);
    placeLoot("data", Z.data || 0);

    // ---- numbers ----
    for (var yy = 0; yy < G.gh; yy++) for (var xx = 0; xx < G.gw; xx++) {
      var cc = cell(xx, yy); if (cc.mon) { cc.n = 0; continue; }
      var cnt = 0; forEachNbr(xx, yy, function (nb) { if (nb.mon) cnt++; }); cc.n = cnt;
    }
  }

  // ---------------- probing / deduction ----------------
  function probe(x, y) {
    if (G.scene !== "dive") return;
    var c = cell(x, y); if (!c) return;
    Audio.init();
    // The first meaningful action generates the grid with (x,y) as the guaranteed-safe pocket.
    // A first action always reveals (never a false-safe peek on an ungenerated grid, and never
    // a wasted peek charge on the always-safe first cell).
    if (G.firstProbe && !G.flagMode) {
      G.peekArmed = false;
      genGrid(x, y); G.firstProbe = false; pushLog(S.log_first_probe); Audio.ping();
      reveal(x, y); checkDeath(); return;
    }
    if (G.peekArmed) { doPeek(x, y); return; }
    if (G.flagMode) { toggleFlag(x, y); return; }
    if (c.revealed) { if (G.up.chord && !c.mon && c.n > 0) chord(x, y); return; }
    if (c.flagged) return;
    spendOxygen(); if (G.scene !== "dive") return; ambientMindDrain(); Audio.ping();
    reveal(x, y);
    checkDeath();
  }
  function spendOxygen() {
    G.oxygen = Math.max(0, G.oxygen - CFG.probeCost);
    if (G.oxygen <= 0 && G.scene === "dive") { pushLog(S.log_no_o2); forceAscend(); }
  }
  function carriedDrain() { var d = 0; for (var i = 0; i < G.hold.items.length; i++) { var L2 = LOOT[G.hold.items[i].id]; if (L2 && L2.carrySanity) d += L2.carrySanity; } return d; }
  function swimmerAura() { var n = 0; for (var i = 0; i < G.cells.length; i++) { var c = G.cells[i]; if (c.mon && !c.revealed && c.monRef && MON[c.monRef.id].aura) n++; } return n; }
  function ambientMindDrain() {
    var base = ZONES[G.zone].sanityDrain / 25;
    var drain = (base + carriedDrain() * 0.6 + swimmerAura() * 0.4) * sanityDrainMult();
    if (drain > 0) changeStat("sanity", -drain);
  }

  function reveal(x, y) {
    var c = cell(x, y); if (!c || c.revealed) return;
    c.revealed = true; c.flagged = false; c.peek = false;
    if (c.mon) { triggerMonster(c); return; }
    if (c.lootId) collectLoot(c);
    if (c.n === 0) floodFrom(x, y);
  }
  function floodFrom(x, y) {
    var stack = [[x, y]], opened = 0;
    while (stack.length) {
      var p = stack.pop();
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var c = cell(p[0] + dx, p[1] + dy);
        if (!c || c.revealed || c.mon) continue;
        c.revealed = true; c.flagged = false; c.peek = false; opened++;
        if (c.lootId) collectLoot(c);
        if (c.n === 0) stack.push([c.x, c.y]);
      }
    }
    if (opened > 2) pushLog(S.log_flood);
  }

  function triggerMonster(c) {
    var m = c.monRef, def = MON[m.id];
    for (var i = 0; i < G.cells.length; i++) { var cc = G.cells[i]; if (cc.monRef === m) { cc.revealed = true; cc.triggered = true; cc.flagged = false; cc.peek = false; } }
    var dmg = G.diveRng.int(def.dmg[0], def.dmg[1]);
    if (def.dmgType === "sanity") { var sd = Math.round(dmg * sanityDrainMult()); changeStat("sanity", -sd); pushLog(fmt(S.log_monster_mind, { name: def.name, dmg: "−" + sd + " " + S.hud_sanity })); }
    else { changeStat("hull", -dmg); pushLog(fmt(S.log_monster, { name: def.name, dmg: "−" + dmg + " " + S.hud_hull })); }
    if (def.sanity) changeStat("sanity", -Math.round(def.sanity * sanityDrainMult()));
    Audio.roar(); Audio.damage();
    if (OPT.shake) G.shake = def.tier >= 3 ? 12 : 8;
    G.encounter = { shape: def.shape, name: def.name, until: G.time + 2.6, id: m.id };
    G.threatUntil = G.time + (def.tier >= 2 ? 7 : 3); updateMusic();
  }

  function collectLoot(c) {
    if (c.collected || !c.lootId) return; c.collected = true;
    var def = LOOT[c.lootId], Z = ZONES[G.zone];
    if (def.kind === "data") { var v = Math.round(G.diveRng.int(def.value[0], def.value[1]) * Z.valueMult); G.hold.data += v; pushLog(fmt(S.log_data, { amt: v })); Audio.scan(); }
    else if (def.kind === "vent") { changeStat("oxygen", def.o2); changeStat("hull", def.hull); pushLog(fmt(S.log_vent, { o2: def.o2, hull: def.hull })); Audio.vent(); }
    else if (def.kind === "wreck") { var wv = Math.round(G.diveRng.int(def.value[0], def.value[1]) * Z.valueMult); G.hold.data += wv; openWreck(c); pushLog(S.log_wreck); Audio.good(); }
    else if (def.kind === "artifact") { var val = Math.round(G.diveRng.int(def.value[0], def.value[1]) * Z.valueMult); G.hold.items.push({ id: c.lootId, name: def.name, value: val, kind: "artifact" }); pushLog(fmt(S.log_artifact, { name: def.name })); Audio.good(); G.flash = 0.3; G.flashCol = "70,240,200"; }
    else if (def.kind === "shard") { var sv = Math.round(G.diveRng.int(def.value[0], def.value[1]) * Z.valueMult); G.hold.items.push({ id: "shard", name: def.name, value: sv, kind: "shard" }); pushLog(S.log_shard); Audio.good(); G.flash = 0.4; G.flashCol = "120,110,220"; }
  }
  function openWreck(c) { // reveal a safe 3x3 pocket of nearby non-monster cells (deduction relief)
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var nb = cell(c.x + dx, c.y + dy); if (!nb || nb.revealed || nb.mon) continue;
      nb.revealed = true; nb.flagged = false; nb.peek = false; if (nb.lootId) collectLoot(nb);
    }
  }

  function toggleFlag(x, y) {
    if (G.scene !== "dive") return;
    var c = cell(x, y); if (!c || c.revealed) return;
    c.flagged = !c.flagged; pushLog(c.flagged ? S.log_flag : S.log_unflag); Audio.card();
  }
  function doPeek(x, y) {
    var c = cell(x, y); G.peekArmed = false;
    if (!c || c.revealed) { pushLog(S.log_no_peek_target); return; }
    if (G.peeksLeft <= 0) { pushLog(S.log_peek_none); return; }
    G.peeksLeft--; c.peek = true; Audio.scan();
    var what = c.mon ? S.cat_monster + " (" + (MON[c.monRef.id].dmgType === "sanity" ? S.threat_mind : S.threat_hull) + ")" : (c.lootId ? S["cat_" + LOOT[c.lootId].kind] : S.safe_cell);
    pushLog(fmt(S.log_peek, { what: what }));
  }
  function chord(x, y) {
    var c = cell(x, y); if (!c || !c.revealed || c.mon) return;
    var flags = 0; forEachNbr(x, y, function (nb) { if (nb.flagged) flags++; });
    if (flags !== c.n) return; // only chord a satisfied number
    var toProbe = []; forEachNbr(x, y, function (nb) { if (!nb.revealed && !nb.flagged) toProbe.push(nb); });
    if (!toProbe.length) return;
    spendOxygen(); Audio.ping();
    for (var i = 0; i < toProbe.length; i++) { if (G.scene !== "dive") break; reveal(toProbe[i].x, toProbe[i].y); }
    checkDeath();
  }

  // ---------------- stats / death / ascend ----------------
  function changeStat(stat, amt) {
    if (stat === "hull") G.hull = clamp(G.hull + amt, 0, G.maxHull);
    else if (stat === "oxygen") G.oxygen = clamp(G.oxygen + amt, 0, G.maxOxygen);
    else if (stat === "sanity") G.sanity = clamp(G.sanity + amt, 0, G.maxSanity);
    if (amt < 0 && stat === "hull") { G.flash = Math.max(G.flash, 0.55); G.flashCol = "180,40,40"; }
    if (amt < 0 && stat === "sanity" && amt <= -2) { G.flash = Math.max(G.flash, 0.4); G.flashCol = "120,40,160"; }
  }
  function checkDeath() {
    if (G.scene !== "dive") return false;
    if (G.hull <= 0) { death("hull"); return true; }
    if (G.sanity <= 0) { death("sanity"); return true; }
    return false;
  }
  function death(kind) {
    G.endKind = kind; G.won = false; G.tongsSaved = null;
    if (G.up.tongs && G.hold.items.length) {
      var best = G.hold.items.slice().sort(function (a, b) { return b.value - a.value; })[0];
      G.cargo.push(best); G.tongsSaved = best;
    }
    G.hold = { data: 0, items: [] };
    G.scene = "end"; Audio.setMusic("none"); Audio.lose();
  }
  function ascend() {
    if (G.scene !== "dive") return;
    G.ascendConfirm = false;
    // bank
    var gotSourceShard = false;
    G.money += G.hold.data;
    for (var i = 0; i < G.hold.items.length; i++) { var it = G.hold.items[i]; if (it.id === "shard") { G.shards++; if (ZONES[G.zone].source) gotSourceShard = true; } G.cargo.push(it); }
    G.lastBank = { data: G.hold.data, items: G.hold.items.slice(), zone: G.zone };
    Audio.ascend(); Audio.setMusic("none");
    if (gotSourceShard) { winRun(); return; }
    G.hold = { data: 0, items: [] };
    G.scene = "result";
  }
  function forceAscend() { G.ascendConfirm = false; ascend(); }
  function winRun() { G.scene = "end"; G.won = true; G.endKind = "win"; Audio.win(); }

  function backToPort() {
    G.scene = "port";
    G.hull = effMaxHull(); G.sanity = effMaxSanity(); // refit
    Audio.setMusic("none");
  }
  function sellCargo() {
    if (!G.cargo.length) { portMsg(S.port_sell_none); return; }
    var total = 0; for (var i = 0; i < G.cargo.length; i++) total += G.cargo[i].value;
    G.money += total; G.cargo = []; portMsg(fmt(S.port_sold, { amt: total })); Audio.good();
  }
  function buy(id) {
    var it = shopItem(id), lvl = G.up[id] || 0;
    if (lvl >= it.costs.length) { portMsg(S.port_max); return; }
    var cost = it.costs[lvl];
    if (G.money < cost) { portMsg(S.port_cant_afford); Audio.alert(); return; }
    G.money -= cost; G.up[id] = lvl + 1; Audio.good();
    portMsg(fmt(S.port_bought, { name: it.name }));
    if (id === "depth" && G.selZone < maxZone()) { /* allow choosing newly unlocked */ }
  }

  // ---------------- music ----------------
  function updateMusic() {
    var want = (G.time < G.threatUntil || ZONES[G.zone].source) ? "threat" : "ambient";
    Audio.setMusic(want);
  }

  // ---------------- particles ----------------
  var snow = [];
  function seedParticles() { snow = []; for (var i = 0; i < 60; i++) snow.push({ x: Math.random() * buf.width, y: Math.random() * buf.height, s: 0.4 + Math.random() * 1.2, v: 0.1 + Math.random() * 0.4 }); }
  function stepParticles(dt) { for (var i = 0; i < snow.length; i++) { var p = snow[i]; p.y += p.v * dt * 0.06 * p.s; p.x += Math.sin((p.y + i) * 0.02) * 0.04 * dt; if (p.y > buf.height) { p.y = -2; p.x = Math.random() * buf.width; } } }
  function drawParticles(c) { c.fillStyle = "rgba(170,210,200,0.5)"; for (var i = 0; i < snow.length; i++) { var p = snow[i]; c.globalAlpha = 0.15 + p.s * 0.18; c.fillRect(p.x, p.y, p.s, p.s); } c.globalAlpha = 1; }

  // ---------------- update ----------------
  function update(dt) {
    G.time += dt / 1000;
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 600);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 60);
    if (G.portMsgT > 0) G.portMsgT = Math.max(0, G.portMsgT - dt / 1000);
    if (G.scene === "dive" && G.time > G.threatUntil && !ZONES[G.zone].source) { if (Audio._which === "threat" && G.time - G.threatUntil < dt / 1000 + 0.1) updateMusic(); }
    stepParticles(dt);
  }

  // ---------------- render: scene buffer ----------------
  function depthT() { return clamp(ZONES[G.zone].depth / 6800, 0, 1); }
  function renderDiveBuffer() {
    var bw = buf.width, bh = buf.height;
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawWater(bctx, bw, bh, depthT());
    drawParticles(bctx);
    var inset = Math.max(6, Math.round(8 / SCALE) + 4);
    Art.drawCockpit(bctx, bw, bh, { x: inset, y: inset, w: bw - inset * 2, h: bh - inset * 2 });
  }

  // ---------------- render dispatch ----------------
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#04060a"; ctx.fillRect(0, 0, W, H);
    if (!G) return;
    if (UI.overlay === "help") return renderHelp();
    if (UI.overlay === "options") return renderOptions();
    if (G.scene === "dive") return renderDive();
    if (G.scene === "port") return renderPort();
    if (G.scene === "result") return renderResult();
    if (G.scene === "end") return renderEnd();
    return renderTitle();
  }

  function drawTopBar() {
    ctx.fillStyle = PAL.panel; ctx.fillRect(0, 0, W, L.top.h);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, L.top.h - 3, W, 3);
    var pad = 10, gw = clamp((W - 260) / 3, 80, 220), gh = clamp(L.top.h - 14, 28, 48), y = 7;
    Art.gauge(ctx, { x: pad, y: y, w: gw, h: gh }, S.hud_hull, G.hull, G.maxHull, "hull");
    Art.gauge(ctx, { x: pad + gw + 8, y: y, w: gw, h: gh }, S.hud_oxygen, G.oxygen, G.maxOxygen, "oxygen");
    Art.gauge(ctx, { x: pad + (gw + 8) * 2, y: y, w: gw, h: gh }, S.hud_sanity, G.sanity, G.maxSanity, "sanity");
    var Z = ZONES[G.zone];
    Art.text(ctx, S.hud_money + money(), W - 12, y + gh * 0.42, Math.round(gh * 0.42), PAL.amberHi, "right");
    Art.text(ctx, Z.name + "  ·  " + Z.depth + S.hud_meters + "  ·  " + S.hud_zone + " " + G.zone + "/" + (ZONES.length - 1),
      W - 12, y + gh * 0.92, Math.round(gh * 0.30), PAL.textDim, "right");
  }

  function updateCellDisplay() {
    var corrupt = G.sanity < G.corruptThr, salt = Math.floor(G.time / 1.4);
    for (var i = 0; i < G.cells.length; i++) {
      var c = G.cells[i]; c.dnum = c.n; c.cor = false;
      if (corrupt && c.revealed && !c.mon && !c.lootId && c.n > 0) {
        var h = (i * 2654435761 ^ (salt * 40503)) >>> 0;
        if (h % 5 === 0) { c.dnum = clamp(c.n + ((h >> 3) % 2 ? 1 : -1), 0, 8); c.cor = true; }
      }
    }
  }

  function renderDive() {
    renderDiveBuffer();
    var shx = G.shake ? (Math.random() - 0.5) * G.shake : 0, shy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, L.scene.x + shx, L.scene.y + shy, L.scene.w, L.scene.h);
    drawTopBar();
    updateCellDisplay();
    var g = gridGeom();
    Art.drawGrid(ctx, { cells: G.cells, gw: G.gw, gh: G.gh, cell: g.cell, gap: g.gap, x: g.x, y: g.y, time: G.time, cursor: G.cursor });
    drawDiveBottom();
    if (G.encounter && G.time < G.encounter.until) drawEncounter();
    if (G.ascendConfirm) drawAscendConfirm();
    if (G.sanity < G.corruptThr) Art.text(ctx, S.log_low_sanity, W / 2, L.scene.y + 18, clamp(W * 0.02, 11, 16), PAL.violetHi, "center");
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, sanity: G.sanity / G.maxSanity, flash: G.flash, flashCol: G.flashCol });
  }

  function drawDiveBottom() {
    ctx.fillStyle = PAL.panel; ctx.fillRect(0, L.bottom.y, W, L.bottom.h);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, L.bottom.y, W, 3);
    // hold readout + log (left) — clipped to the space left of the buttons so nothing overlaps on narrow screens
    var x = 14, y = L.bottom.y + 22, fs = clamp(W * 0.018, 11, 16) * OPT.textScale;
    ctx.save(); ctx.beginPath(); ctx.rect(0, L.bottom.y, Math.max(60, L.buttons.flag.x - 18), L.bottom.h); ctx.clip();
    var arts = G.hold.items.length;
    Art.text(ctx, S.hud_hold + ": ₽" + G.hold.data + " " + S.hud_data + (arts ? "  +" + arts + " " + (arts === 1 ? "artifact" : "artifacts") : ""), x, y, fs, PAL.bioHi, "left");
    if (peeksMax() > 0) Art.text(ctx, S.hud_peeks + ": " + G.peeksLeft + "/" + peeksMax(), x, y + fs + 6, fs * 0.9, PAL.amber, "left");
    var ly = L.bottom.y + L.bottom.h - 10;
    for (var i = 0; i < 2; i++) { var idx = G.log.length - 1 - i; if (idx < 0) break; ctx.globalAlpha = 1 - i * 0.4; Art.text(ctx, "› " + G.log[idx], x, ly - i * (fs + 3), fs * 0.92, i === 0 ? PAL.phosHi : PAL.textDim, "left"); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // buttons (right)
    Art.button(ctx, L.buttons.ascend, S.btn_ascend, { primary: true, hover: UI.hover === "ascend" });
    Art.button(ctx, L.buttons.flag, G.flagMode ? S.flag_on : S.flag_off, { primary: G.flagMode, hover: UI.hover === "flag" });
    if (peeksMax() > 0) Art.button(ctx, L.buttons.peek, S.btn_peek + (G.peekArmed ? " •" : ""), { primary: G.peekArmed, hover: UI.hover === "peek", disabled: G.peeksLeft <= 0 });
    Art.button(ctx, L.buttons.menu, S.menu_help, { hover: UI.hover === "menu" });
  }

  function drawEncounter() {
    var alpha = clamp((G.encounter.until - G.time) / 2.6, 0, 1);
    var pw = clamp(W * 0.34, 200, 360), ph = pw * 0.86, px = W / 2, py = L.scene.y + L.scene.h * 0.42;
    ctx.save(); ctx.globalAlpha = Math.min(1, alpha * 1.6);
    ctx.fillStyle = "rgba(2,4,8,0.55)"; Art.rrect(ctx, px - pw / 2, py - ph / 2, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = PAL.blood; ctx.lineWidth = 2; Art.rrect(ctx, px - pw / 2, py - ph / 2, pw, ph, 8); ctx.stroke();
    Art.drawPortrait(ctx, px, py - ph * 0.06, pw * 0.34, { category: "creature", name: G.encounter.name, id: 99 }, G.time);
    Art.text(ctx, G.encounter.name.toUpperCase(), px, py + ph * 0.40, clamp(pw * 0.07, 14, 24), PAL.bloodHi, "center");
    ctx.restore();
  }

  function drawAscendConfirm() {
    ctx.fillStyle = "rgba(2,4,8,0.7)"; ctx.fillRect(0, 0, W, H);
    var bw = clamp(W * 0.6, 280, 460), bh = 180, x = (W - bw) / 2, y = (H - bh) / 2;
    ctx.fillStyle = PAL.panel; Art.rrect(ctx, x, y, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = PAL.amber; ctx.lineWidth = 2; Art.rrect(ctx, x, y, bw, bh, 8); ctx.stroke();
    Art.text(ctx, S.confirm_ascend, x + bw / 2, y + 42, 18, PAL.amberHi, "center");
    Art.wrapText(ctx, "Hold: ₽" + G.hold.data + " data, " + G.hold.items.length + " artifact(s). Banked on the surface — lost if you die below.", x + bw / 2, y + 72, bw - 36, 13, PAL.textDim);
    var bwid = (bw - 48) / 2;
    UI.ascYes = { x: x + 16, y: y + bh - 58, w: bwid, h: 42 };
    UI.ascNo = { x: x + bw - 16 - bwid, y: y + bh - 58, w: bwid, h: 42 };
    Art.button(ctx, UI.ascYes, S.yes, { primary: true, hover: UI.hover === "ascyes" });
    Art.button(ctx, UI.ascNo, S.no, { hover: UI.hover === "ascno" });
  }

  // ---------------- render: port / shop ----------------
  function renderPort() {
    renderSceneBackground();
    Art.text(ctx, S.port_title, W / 2, clamp(H * 0.08, 34, 70), clamp(W * 0.034, 18, 34), PAL.phosHi, "center");
    Art.text(ctx, S.hud_money + money(), W / 2, clamp(H * 0.08, 34, 70) + clamp(W * 0.03, 18, 30), clamp(W * 0.03, 16, 28), PAL.amberHi, "center");

    var col1x = clamp(W * 0.06, 16, W * 0.5 - 280), colW = clamp(W * 0.44, 260, 460);
    var twoCol = W > 720;
    var shopX = col1x, shopW = twoCol ? colW : W - col1x * 2;
    var topY = clamp(H * 0.18, 80, 150);

    // ---- shop ----
    Art.text(ctx, S.port_shop, shopX + 4, topY - 8, 16, PAL.bio, "left");
    UI.shopHit = [];
    var rowH = clamp((H - topY - 120) / SHOP.length, 40, 66), ry = topY;
    for (var i = 0; i < SHOP.length; i++) {
      var it = SHOP[i], lvl = G.up[it.id] || 0, maxed = lvl >= it.costs.length;
      var r = { x: shopX, y: ry, w: shopW, h: rowH - 6 };
      ctx.fillStyle = "rgba(10,14,20,0.55)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 5); ctx.fill();
      ctx.strokeStyle = (G.padActive && G.shopFocus === i) ? PAL.phosHi : "rgba(90,100,114,0.5)"; ctx.lineWidth = (G.padActive && G.shopFocus === i) ? 2 : 1; Art.rrect(ctx, r.x, r.y, r.w, r.h, 5); ctx.stroke();
      var label = it.name + (it.costs.length > 1 ? "  [" + lvl + "/" + it.costs.length + "]" : (lvl ? "  ✓" : ""));
      Art.text(ctx, label, r.x + 10, r.y + 18, clamp(r.w * 0.045, 12, 16), maxed ? PAL.textDim : PAL.text, "left");
      Art.wrapText(ctx, it.desc, r.x + r.w * 0.40, r.y + r.h - 9, r.w * 0.52, clamp(r.w * 0.032, 9, 12), PAL.textDim);
      // buy button
      var btn = { x: r.x + r.w - 92, y: r.y + 8, w: 84, h: clamp(r.h - 16, 22, 34) };
      if (maxed) Art.button(ctx, btn, S.port_max, { disabled: true });
      else { var cost = it.costs[lvl]; Art.button(ctx, btn, "₽" + cost, { primary: G.money >= cost, hover: UI.hover === "buy" + it.id, disabled: G.money < cost }); UI.shopHit.push({ r: btn, id: it.id }); }
      ry += rowH;
    }

    // ---- depth dial + cargo + dive (right col or below) ----
    var rx = twoCol ? (W - col1x - colW) : col1x, rw = twoCol ? colW : (W - col1x * 2), ryy = topY;
    if (!twoCol) ryy = ry + 8;
    Art.text(ctx, S.port_depth_pick, rx + 4, ryy - 8, 16, PAL.bio, "left");
    UI.zoneHit = [];
    var zCols = Math.min(ZONES.length - 1, 6), zw = (rw - (zCols - 1) * 8) / zCols, zh = clamp(zw * 0.9, 40, 70);
    for (var z = 1; z <= ZONES.length - 1; z++) {
      var unlocked = z <= maxZone();
      var zr = { x: rx + (z - 1) * (zw + 8), y: ryy, w: zw, h: zh };
      var sel = G.selZone === z;
      ctx.fillStyle = sel ? "#1c2a22" : "rgba(10,14,20,0.55)"; Art.rrect(ctx, zr.x, zr.y, zr.w, zr.h, 5); ctx.fill();
      ctx.strokeStyle = sel ? PAL.phosHi : (unlocked ? "rgba(90,100,114,0.6)" : "rgba(60,40,40,0.6)"); ctx.lineWidth = sel ? 2 : 1; Art.rrect(ctx, zr.x, zr.y, zr.w, zr.h, 5); ctx.stroke();
      Art.text(ctx, "" + z, zr.x + zr.w / 2, zr.y + zr.h * 0.42, clamp(zw * 0.4, 16, 30), unlocked ? PAL.amberHi : PAL.textDim, "center");
      Art.text(ctx, unlocked ? ZONES[z].depth + "m" : S.port_locked, zr.x + zr.w / 2, zr.y + zr.h * 0.82, clamp(zw * 0.16, 8, 12), unlocked ? PAL.textDim : "#7a4a4a", "center");
      if (unlocked) UI.zoneHit.push({ r: zr, z: z });
    }
    var zoneName = ZONES[G.selZone].name;
    Art.text(ctx, zoneName, rx + rw / 2, ryy + zh + 22, clamp(rw * 0.045, 13, 20), PAL.phosHi, "center");

    // cargo
    var cy2 = ryy + zh + 40;
    var cval = 0; for (var ci = 0; ci < G.cargo.length; ci++) cval += G.cargo[ci].value;
    Art.text(ctx, S.port_cargo + ": " + G.cargo.length + " items  ·  ₽" + cval + (G.shards ? "  ·  shards " + G.shards : ""), rx + 4, cy2, clamp(rw * 0.04, 12, 16), PAL.bioHi, "left");
    UI.sellBtn = { x: rx, y: cy2 + 12, w: clamp(rw * 0.46, 120, 220), h: 40 };
    Art.button(ctx, UI.sellBtn, S.port_sell, { hover: UI.hover === "sell", disabled: !G.cargo.length });

    // dive
    UI.diveBtn = { x: rx + rw - clamp(rw * 0.46, 130, 240), y: cy2 + 12, w: clamp(rw * 0.46, 130, 240), h: 40 };
    Art.button(ctx, UI.diveBtn, S.port_dive + " →", { primary: true, hover: UI.hover === "dive" });

    if (G.portMsgT > 0) { ctx.globalAlpha = clamp(G.portMsgT, 0, 1); Art.text(ctx, G.portMsg, W / 2, H - 22, clamp(W * 0.022, 12, 18), PAL.amberHi, "center"); ctx.globalAlpha = 1; }
    // menu/back
    UI.backBtn = { x: 12, y: H - 46, w: 120, h: 36 };
    Art.button(ctx, UI.backBtn, S.menu_options, { hover: UI.hover === "back" });
    UI.briefBtn = { x: 140, y: H - 46, w: 120, h: 36 };
    Art.button(ctx, UI.briefBtn, S.menu_help, { hover: UI.hover === "brief" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  function renderResult() {
    renderSceneBackground();
    var b = G.lastBank || { data: 0, items: [] };
    Art.text(ctx, S.btn_ascend + "ED", W / 2, clamp(H * 0.2, 70, 180), clamp(W * 0.05, 26, 50), PAL.bioHi, "center");
    var y = clamp(H * 0.2, 70, 180) + clamp(W * 0.06, 36, 70);
    Art.text(ctx, "Banked ₽" + b.data + " in data", W / 2, y, clamp(W * 0.03, 15, 24), PAL.amberHi, "center");
    Art.text(ctx, b.items.length + " artifact(s) to the hold", W / 2, y + 30, clamp(W * 0.022, 12, 18), PAL.text, "center");
    if (G.loreSeen.length && G.diveCount % 1 === 0) { var lore = LORE[clamp(G.loreSeen[G.loreSeen.length - 1], 0, LORE.length - 1)]; Art.wrapText(ctx, lore, W / 2, y + 64, clamp(W * 0.6, 280, 640), clamp(W * 0.016, 11, 15), PAL.textDim); }
    UI.contBtn = { x: W / 2 - 120, y: H - clamp(H * 0.18, 90, 150), w: 240, h: 52 };
    Art.button(ctx, UI.contBtn, "TO PORT →", { primary: true, hover: UI.hover === "cont" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  function renderEnd() {
    renderSceneBackground();
    ctx.fillStyle = "rgba(2,4,8,0.7)"; ctx.fillRect(0, 0, W, H);
    var win = G.won;
    var title = win ? S.win_title : G.endKind === "hull" ? S.lose_hull : S.lose_sanity;
    var body = win ? S.win_body : G.endKind === "hull" ? S.lose_hull_body : S.lose_sanity_body;
    var y = clamp(H * 0.2, 70, 190);
    Art.text(ctx, title, W / 2, y, clamp(W * 0.06, 28, 56), win ? PAL.bioHi : PAL.bloodHi, "center");
    Art.wrapText(ctx, body, W / 2, y + clamp(W * 0.05, 34, 56), clamp(W * 0.7, 280, 720), clamp(W * 0.018, 13, 19) * OPT.textScale, PAL.text);
    if (!win) Art.text(ctx, G.tongsSaved ? fmt(S.dive_lost_tongs, { name: G.tongsSaved.name }) : S.dive_lost, W / 2, y + clamp(W * 0.05, 34, 56) + 96, clamp(W * 0.02, 12, 17), PAL.amber, "center");
    Art.text(ctx, "Lore recovered: " + G.loreSeen.length + "/" + LORE.length + "   ·   ₽" + money() + " banked", W / 2, y + clamp(W * 0.05, 34, 56) + 122, 13, PAL.textDim, "center");
    UI.contBtn = { x: W / 2 - 120, y: H - clamp(H * 0.16, 84, 140), w: 240, h: 52 };
    Art.button(ctx, UI.contBtn, win ? "DIVE AGAIN" : S.again, { primary: true, hover: UI.hover === "cont" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  // ---------------- title / help / options ----------------
  function renderSceneBackground() {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawTitle(bctx, bw, bh, G ? G.time : 0); drawParticles(bctx);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W, H);
  }
  function renderTitle() {
    renderSceneBackground();
    var cy = H * 0.28; ctx.textAlign = "center";
    Art.text(ctx, S.title, W / 2, cy, clamp(W * 0.11, 38, 96), PAL.phosHi, "center");
    Art.text(ctx, S.subtitle.toUpperCase(), W / 2, cy + clamp(W * 0.04, 18, 34), clamp(W * 0.022, 12, 22), PAL.bio, "center");
    Art.text(ctx, S.tagline, W / 2, cy + clamp(W * 0.07, 34, 60), clamp(W * 0.016, 10, 16), PAL.textDim, "center");
    UI.menu = []; var bw = clamp(W * 0.4, 220, 340), bh = clamp(H * 0.075, 44, 62), bx = (W - bw) / 2, by = H * 0.5, gap = 14;
    var labels = [[S.menu_dive, "dive", true], [S.menu_help, "help", false], [S.menu_options, "options", false]];
    for (var i = 0; i < labels.length; i++) { var r = { x: bx, y: by + i * (bh + gap), w: bw, h: bh }; Art.button(ctx, r, labels[i][0], { primary: labels[i][2], hover: UI.hover === "m" + i || (G.padActive && G.menuSel === i) }); UI.menu.push({ r: r, act: labels[i][1] }); }
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderHelp() {
    renderSceneBackground();
    var x = clamp(W * 0.1, 20, 200), y = clamp(H * 0.1, 40, 110), w = W - x * 2;
    Art.text(ctx, S.help_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var fs = clamp(W * 0.016, 11, 16) * OPT.textScale, yy = y + fs * 2.4;
    for (var i = 0; i < S.help_lines.length; i++) yy += Art.wrapText(ctx, "• " + S.help_lines[i], W / 2, yy, w, fs, PAL.text) * (fs + 4) + 6;
    yy += 6; Art.wrapText(ctx, S.help_controls, W / 2, yy, w, fs * 0.92, PAL.amber);
    UI.backBtn = { x: W / 2 - 90, y: H - clamp(H * 0.12, 56, 110), w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderOptions() {
    renderSceneBackground();
    var y = clamp(H * 0.16, 50, 140);
    Art.text(ctx, S.options_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var rows = [[S.opt_sound, "sound"], [S.opt_shake, "shake"], [S.opt_scanlines, "scanlines"]];
    UI.optHit = []; var rw = clamp(W * 0.6, 280, 460), rx = (W - rw) / 2, rh = 54, ry = y + 40;
    for (var i = 0; i < rows.length; i++) { var r = { x: rx, y: ry + i * (rh + 12), w: rw, h: rh };
      ctx.fillStyle = "rgba(10,14,20,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
      ctx.strokeStyle = "rgba(90,100,114,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      Art.text(ctx, rows[i][0], r.x + 14, r.y + r.h / 2 + 6, 16, PAL.text, "left");
      var on = OPT[rows[i][1]], tr = { x: r.x + r.w - 86, y: r.y + 11, w: 72, h: 32 };
      Art.button(ctx, tr, on ? S.opt_on : S.opt_off, { primary: on });
      UI.optHit.push({ r: tr, key: rows[i][1] });
    }
    UI.backBtn = { x: W / 2 - 90, y: ry + rows.length * (rh + 12) + 16, w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  // ---------------- input ----------------
  var UI = { scene: "title", overlay: null, hover: null, menu: [], shopHit: [], zoneHit: [], optHit: [] };
  function pt(e) { var rect = canvas.getBoundingClientRect(); var src = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e; return { x: src.clientX - rect.left, y: src.clientY - rect.top }; }
  function inside(r, p) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function onDown(p, flagIntent) {
    Audio.init();
    if (!G) return;
    if (UI.overlay) { // help / options overlay sits on top of any scene; BACK just closes it
      if (UI.overlay === "options" && UI.optHit) for (var i = 0; i < UI.optHit.length; i++) if (inside(UI.optHit[i].r, p)) { OPT[UI.optHit[i].key] = !OPT[UI.optHit[i].key]; saveOpt(); Audio.setEnabled(OPT.sound); Audio.card(); return; }
      if (inside(UI.backBtn, p)) { UI.overlay = null; Audio.card(); } return;
    }
    if (G.scene === "dive") return onDiveDown(p, flagIntent);
    if (G.scene === "port") return onPortDown(p);
    if (G.scene === "result") { if (inside(UI.contBtn, p)) { Audio.card(); backToPort(); } return; }
    if (G.scene === "end") { if (inside(UI.contBtn, p)) { Audio.card(); backToPort(); } return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) { var act = UI.menu[m].act; Audio.card();
      if (act === "dive") G.scene = "port"; else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; return; }
  }

  function onDiveDown(p, flagIntent) {
    if (G.ascendConfirm) { if (inside(UI.ascYes, p)) ascend(); else if (inside(UI.ascNo, p)) G.ascendConfirm = false; return; }
    if (inside(L.buttons.ascend, p)) { if (G.hold.data > 0 || G.hold.items.length) G.ascendConfirm = true; else ascend(); return; }
    if (inside(L.buttons.flag, p)) { G.flagMode = !G.flagMode; G.peekArmed = false; Audio.card(); return; }
    if (peeksMax() > 0 && inside(L.buttons.peek, p)) { if (G.peeksLeft > 0) { G.peekArmed = !G.peekArmed; G.flagMode = false; Audio.card(); } else pushLog(S.log_peek_none); return; }
    if (inside(L.buttons.menu, p)) { UI.overlay = "help"; return; }
    var hit = cellAtPoint(p);
    if (hit) { if (flagIntent) toggleFlag(hit.x, hit.y); else probe(hit.x, hit.y); G.cursor = { x: hit.x, y: hit.y }; }
  }

  function onPortDown(p) {
    for (var i = 0; i < UI.shopHit.length; i++) if (inside(UI.shopHit[i].r, p)) { buy(UI.shopHit[i].id); return; }
    for (var z = 0; z < UI.zoneHit.length; z++) if (inside(UI.zoneHit[z].r, p)) { G.selZone = UI.zoneHit[z].z; Audio.card(); return; }
    if (inside(UI.sellBtn, p)) { sellCargo(); return; }
    if (inside(UI.diveBtn, p)) { Audio.card(); startDive(G.selZone); return; }
    if (inside(UI.briefBtn, p)) { UI.overlay = "help"; Audio.card(); return; }
    if (inside(UI.backBtn, p)) { UI.overlay = "options"; Audio.card(); return; }
  }

  function onMove(p) {
    UI.hover = null; if (!G) return;
    if (UI.overlay) { UI.hover = inside(UI.backBtn, p) ? "back" : null; return; }
    if (G.scene === "dive") {
      if (G.ascendConfirm) { if (inside(UI.ascYes, p)) UI.hover = "ascyes"; else if (inside(UI.ascNo, p)) UI.hover = "ascno"; return; }
      if (inside(L.buttons.ascend, p)) UI.hover = "ascend"; else if (inside(L.buttons.flag, p)) UI.hover = "flag";
      else if (peeksMax() > 0 && inside(L.buttons.peek, p)) UI.hover = "peek"; else if (inside(L.buttons.menu, p)) UI.hover = "menu";
      return;
    }
    if (G.scene === "port") {
      for (var i = 0; i < UI.shopHit.length; i++) if (inside(UI.shopHit[i].r, p)) { UI.hover = "buy" + UI.shopHit[i].id; return; }
      if (inside(UI.sellBtn, p)) UI.hover = "sell"; else if (inside(UI.diveBtn, p)) UI.hover = "dive"; else if (inside(UI.briefBtn, p)) UI.hover = "brief"; else if (inside(UI.backBtn, p)) UI.hover = "back"; return;
    }
    if (G.scene === "result" || G.scene === "end") { if (inside(UI.contBtn, p)) UI.hover = "cont"; return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) UI.hover = "m" + m;
  }

  canvas.addEventListener("mousedown", function (e) { onDown(pt(e), e.button === 2); });
  canvas.addEventListener("mousemove", function (e) { onMove(pt(e)); });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); }); // flag is routed via mousedown button 2 (flagIntent)
  var touchStart = 0, touchPt = null, longTimer = null, longFired = false;
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); touchPt = pt(e); touchStart = perfTime(); longFired = false;
    if (G && G.scene === "dive") { var h = cellAtPoint(touchPt); if (h) { longTimer = setTimeout(function () { longFired = true; toggleFlag(h.x, h.y); G.cursor = { x: h.x, y: h.y }; }, 380); } }
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) { e.preventDefault(); if (longTimer) { clearTimeout(longTimer); longTimer = null; } }, { passive: false });
  canvas.addEventListener("touchend", function (e) { e.preventDefault(); if (longTimer) { clearTimeout(longTimer); longTimer = null; } if (longFired) return; if (touchPt) onDown(touchPt, false); }, { passive: false });

  // keyboard (physical codes)
  window.addEventListener("keydown", function (e) {
    var code = e.code; if (!G) return;
    if (UI.overlay) { if (code === "Escape" || code === "Enter" || code === "Space" || code === "KeyH") { UI.overlay = null; e.preventDefault(); } return; }
    if (code === "KeyH") { UI.overlay = "help"; e.preventDefault(); return; }
    if (G.scene === "dive") {
      if (code === "ArrowUp") { G.cursor.y = clamp(G.cursor.y - 1, 0, G.gh - 1); e.preventDefault(); }
      else if (code === "ArrowDown") { G.cursor.y = clamp(G.cursor.y + 1, 0, G.gh - 1); e.preventDefault(); }
      else if (code === "ArrowLeft") { G.cursor.x = clamp(G.cursor.x - 1, 0, G.gw - 1); e.preventDefault(); }
      else if (code === "ArrowRight") { G.cursor.x = clamp(G.cursor.x + 1, 0, G.gw - 1); e.preventDefault(); }
      else if (code === "Space" || code === "Enter") { probe(G.cursor.x, G.cursor.y); e.preventDefault(); }
      else if (code === "KeyF") { toggleFlag(G.cursor.x, G.cursor.y); e.preventDefault(); }
      else if (code === "KeyP") { if (peeksMax() > 0 && G.peeksLeft > 0) { G.peekArmed = !G.peekArmed; G.flagMode = false; } e.preventDefault(); }
      else if (code === "KeyA") { if (G.hold.data > 0 || G.hold.items.length) G.ascendConfirm = true; else ascend(); e.preventDefault(); }
      else if (code === "Escape") { G.ascendConfirm = !G.ascendConfirm; }
    } else if (G.scene === "port") { if (code === "Enter" || code === "Space") { startDive(G.selZone); e.preventDefault(); }
      else if (code === "ArrowRight") { G.selZone = clamp(G.selZone + 1, 1, maxZone()); }
      else if (code === "ArrowLeft") { G.selZone = clamp(G.selZone - 1, 1, maxZone()); } }
    else if (G.scene === "result" || G.scene === "end") { if (code === "Enter" || code === "Space") { backToPort(); e.preventDefault(); } }
    else { if (code === "Enter" || code === "Space") { G.scene = "port"; e.preventDefault(); } }
  });

  // gamepad
  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : []; if (!G) return;
    for (var g = 0; g < pads.length; g++) { var gp = pads[g]; if (!gp) continue; var b = gp.buttons; G.padActive = true;
      function pressed(i) { return b[i] && b[i].pressed && !padPrev[i]; }
      if (UI.overlay) {
        if (pressed(0) || pressed(1) || pressed(9)) UI.overlay = null;
      } else if (G.scene === "dive") {
        if (G.ascendConfirm) { if (pressed(0)) ascend(); else if (pressed(1)) G.ascendConfirm = false; }
        else {
          if (pressed(12)) G.cursor.y = clamp(G.cursor.y - 1, 0, G.gh - 1); if (pressed(13)) G.cursor.y = clamp(G.cursor.y + 1, 0, G.gh - 1);
          if (pressed(14)) G.cursor.x = clamp(G.cursor.x - 1, 0, G.gw - 1); if (pressed(15)) G.cursor.x = clamp(G.cursor.x + 1, 0, G.gw - 1);
          if (pressed(0)) probe(G.cursor.x, G.cursor.y);
          if (pressed(2)) toggleFlag(G.cursor.x, G.cursor.y);
          if (pressed(3)) { if (G.hold.data > 0 || G.hold.items.length) G.ascendConfirm = true; else ascend(); }
          if (pressed(4) || pressed(5)) { if (peeksMax() > 0 && G.peeksLeft > 0) { G.peekArmed = !G.peekArmed; G.flagMode = false; } }
          if (pressed(9)) UI.overlay = "help";
        }
      } else if (G.scene === "port") {
        if (pressed(12)) G.shopFocus = (G.shopFocus + SHOP.length - 1) % SHOP.length;
        if (pressed(13)) G.shopFocus = (G.shopFocus + 1) % SHOP.length;
        if (pressed(14)) G.selZone = clamp(G.selZone - 1, 1, maxZone()); if (pressed(15)) G.selZone = clamp(G.selZone + 1, 1, maxZone());
        if (pressed(0)) buy(SHOP[G.shopFocus].id);
        if (pressed(2)) sellCargo();
        if (pressed(3) || pressed(9)) startDive(G.selZone);
      } else if (G.scene === "result" || G.scene === "end") { if (pressed(0) || pressed(9)) backToPort(); }
      else { // title menu
        if (pressed(12)) G.menuSel = (G.menuSel + UI.menu.length - 1) % (UI.menu.length || 1);
        if (pressed(13)) G.menuSel = (G.menuSel + 1) % (UI.menu.length || 1);
        if (pressed(0) || pressed(9)) { var act = UI.menu[G.menuSel] ? UI.menu[G.menuSel].act : "dive"; if (act === "dive") G.scene = "port"; else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; }
      }
      for (var i = 0; i < b.length; i++) padPrev[i] = b[i] && b[i].pressed;
    }
  }

  // ---------------- main loop ----------------
  var STEP = 1000 / 60, acc = 0, last = perfTime(), paused = false, frames = 0, fpsAt = last, fpsv = 0;
  function perfTime() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  window.addEventListener("blur", function () { paused = true; });
  window.addEventListener("focus", function () { paused = false; last = perfTime(); });
  document.addEventListener("visibilitychange", function () { paused = document.hidden; if (!paused) last = perfTime(); });

  function frame() {
    requestAnimationFrame(frame);
    var now = perfTime(); if (paused) { last = now; return; }
    acc += now - last; last = now; if (acc > 200) acc = 200;
    pollPad();
    while (acc >= STEP) { if (G) update(STEP); acc -= STEP; }
    render();
    if (dev) { frames++; if (now - fpsAt >= 500) { fpsv = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now;
      document.getElementById("dev").textContent = fpsv + " fps  " + (G ? G.scene : "") + "  " + buf.width + "x" + buf.height; } }
  }

  // boot
  newRun(randomSeed());
  G.scene = "titlemenu"; // start at title; render() falls through to title when scene not handled
  resize();
  requestAnimationFrame(frame);

  // expose for debugging / verification harness
  window.DREADNOUGHT = { G: function () { return G; }, startDive: startDive, newRun: newRun, OPT: OPT,
    probe: function (x, y) { probe(x, y); }, ascend: ascend, buy: buy };
})();
