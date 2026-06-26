/* DREADNOUGHT v4 — Minesweeper-deduction fused into first-person submarine navigation.
 * The CRT monitor is a top-down sonar grid; the sub is one cell. Drive (W/A/S/D) to move —
 * entering a cell reveals it (numbers = adjacent monsters). PING reveals numbers in a cone.
 * Drive into a monster = jumpscare + hull breach; hull shows as the cabin FLOODING. No text HUD.
 * Depends (load order): strings.js, rng.js, data.js, audio.js, art.js. */
(function () {
  "use strict";
  var CFG = DN.CFG, LAYERS = DN.LAYERS, MON = DN.MONSTERS, LOOT = DN.LOOT, LORE = DN.LORE, SHOP = DN.SHOP, PLUSHIES = DN.PLUSHIES;
  var Art = DN.Art, Audio = DN.Audio, S = window.STR, PAL = Art.PAL;

  var OPT = { sound: true, shake: true, scanlines: true };
  try { var o = JSON.parse(localStorage.getItem("dn_opt") || "{}"); for (var k in o) OPT[k] = o[k]; } catch (e) {}
  function saveOpt() { try { localStorage.setItem("dn_opt", JSON.stringify(OPT)); } catch (e) {} }

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
    var bw = Math.max(160, Math.round(L.porthole.w / SCALE2())), bh = Math.max(110, Math.round(L.porthole.h / SCALE2()));
    buf.width = bw; buf.height = bh; Art.rebake(bw, bh);
  }
  function SCALE2() { SCALE = clamp(L.porthole.w / 600, 1.4, 2.2); return SCALE; }
  window.addEventListener("resize", resize); window.addEventListener("orientationchange", resize);

  // ---------------- layout ----------------
  var L = { top: {}, col: {}, porthole: {}, monitor: {}, bottom: {}, btn: {}, tank: {}, depth: {}, dpad: {} };
  function layout() {
    var portrait = H > W * 1.05;
    var topH = clamp(H * 0.07, 28, 50);
    var colW = clamp(W * 0.15, 84, 190);
    var botH = portrait ? clamp(H * 0.20, 116, 220) : clamp(H * 0.19, 104, 184);
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.col = { x: 0, y: topH, w: colW, h: H - topH - botH };
    var mainX = colW, mainW = W - colW, mainY = topH, mainH = H - topH - botH;
    var phH = mainH * (portrait ? 0.34 : 0.40);
    L.porthole = { x: mainX + 8, y: mainY + 8, w: mainW - 16, h: phH - 10 };
    L.monitor = { x: mainX + 8, y: mainY + phH + 2, w: mainW - 16, h: mainH - phH - 10 };
    L.bottom = { x: 0, y: H - botH, w: W, h: botH };
    L.tank = { x: L.col.x + L.col.w * 0.30, y: L.col.y + 14, w: L.col.w * 0.40, h: L.col.h * 0.60 };
    L.depth = { cx: L.col.x + L.col.w * 0.5, cy: L.col.y + L.col.h * 0.82, r: Math.min(L.col.w * 0.32, 38) };
    var bs = clamp(L.bottom.h * 0.30, 30, 48), ds = clamp(L.bottom.h * 0.28, 28, 44);
    L.dpad = { cx: W - ds * 1.85, cy: L.bottom.y + L.bottom.h * 0.52, s: ds };
    var bw = clamp(W * 0.125, 60, 128), gap = 7, x0 = 12, y0 = L.bottom.y + 12, y1 = y0 + bs + 7;
    L.btn.ping = { x: x0, y: y0, w: bw, h: bs };
    L.btn.light = { x: x0, y: y1, w: bw, h: bs };
    L.btn.excavate = { x: x0 + bw + gap, y: y0, w: bw, h: bs };
    L.btn.patch = { x: x0 + bw + gap, y: y1, w: bw, h: bs };
    L.btn.crank = { x: x0 + (bw + gap) * 2, y: y0, w: bw, h: bs };
    L.btn.brief = { x: x0 + (bw + gap) * 2, y: y1, w: bw, h: bs };
  }
  function inside(r, p) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function dpadRects() { var s = L.dpad.s, cx = L.dpad.cx, cy = L.dpad.cy; return {
    up: { x: cx - s / 2, y: cy - s * 1.5, w: s, h: s }, down: { x: cx - s / 2, y: cy + s / 2, w: s, h: s },
    left: { x: cx - s * 1.5, y: cy - s / 2, w: s, h: s }, right: { x: cx + s / 2, y: cy - s / 2, w: s, h: s } }; }

  // ---------------- state ----------------
  var G = null;
  function newRun(seed) {
    var rng = new RNG(seed);
    G = { scene: "titlemenu", seedStr: rng.seedStr, rng: rng, time: 0,
      layer: 1, gw: 7, gh: 7, cells: [], sub: { cx: 0, cy: 0 }, facing: { dx: 0, dy: 1 },
      hull: CFG.startHull, oxygen: CFG.startOxygen, pings: CFG.pingsStart, threat: 0, haul: 0, depth: 0,
      money: 0, up: { hull: 0, o2: 0, pings: 0, bilge: 0, light: 0 }, patches: CFG.startPatches, plushies: [], onLoot: false, portMsg: "", portMsgT: 0, shopFocus: 0,
      lightOn: false, transit: null, stalker: null, woke: false, confirmDir: null,
      leak: 0, scare: null, snow: [], flash: 0, flashCol: "180,40,40", shake: 0, hbT: 0, heartbeat: 0,
      lamp: { o2: 0, hull: 0, wake: 0 }, endKind: null, won: false, menuSel: 0, padActive: false,
      hatch: { x: 0, y: 0 }, start: { x: 0, y: 0 }, loreSeen: [], pingFlash: 0, sweep: 0 };
  }
  function fmt(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, key) { return o && o[key] != null ? o[key] : ""; }); }
  function cell(x, y) { return (x < 0 || y < 0 || x >= G.gw || y >= G.gh) ? null : G.cells[y * G.gw + x]; }
  function curCell() { return cell(G.sub.cx, G.sub.cy); }
  function shopItem(id) { for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) return SHOP[i]; return null; }
  function shopVal(id, lvl) { var it = shopItem(id); return it.vals[lvl - 1]; }
  function effMaxHull() { return G.up.hull ? shopVal("hull", G.up.hull) : CFG.maxHull; }
  function effMaxOxygen() { return G.up.o2 ? shopVal("o2", G.up.o2) : CFG.startOxygen; }
  function effPings() { return G.up.pings ? shopVal("pings", G.up.pings) : CFG.pingsStart; }
  function lightRange() { return G.up.light ? 44 : 30; }
  function lightThreatRate() { return CFG.threatLight * (G.up.light ? 0.5 : 1); }
  function bilgeMult() { return G.up.bilge ? 0.62 : 1; }
  function portMsg(m) { G.portMsg = m; G.portMsgT = 2.6; }

  // ---------------- layer generation (first 3x3 safe + carved monster-free path to hatch) ----------------
  function genLayer(layer) {
    var Lc = LAYERS[layer], rng = G.rng; G.layer = layer; G.gw = Lc.gw; G.gh = Lc.gh;
    G.cells = []; for (var i = 0; i < G.gw * G.gh; i++) G.cells.push({ x: i % G.gw, y: Math.floor(i / G.gw), mon: false, monId: null, lootId: null, kind: null, loot: null, value: 0, o2: 0, hatch: false, source: false, n: 0, seen: false, flagged: false, triggered: false, collected: false });
    var sx = Math.floor(G.gw / 2), sy = 0;
    var hx = clamp(rng.int(1, G.gw - 2), 0, G.gw - 1), hy = G.gh - 1;
    G.sub = { cx: sx, cy: sy }; G.start = { x: sx, y: sy }; G.hatch = { x: hx, y: hy }; G.facing = { dx: 0, dy: 1 };
    var safe = {};
    function mark(x, y) { var c = cell(x, y); if (c) safe[y * G.gw + x] = true; }
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) mark(sx + dx, sy + dy);
    // carve a monster-free corridor start -> hatch
    var px = sx, py = sy, guard = 0;
    while ((px !== hx || py !== hy) && guard++ < 600) {
      var opts = []; if (px < hx) opts.push([1, 0]); if (px > hx) opts.push([-1, 0]); if (py < hy) opts.push([0, 1]); if (py > hy) opts.push([0, -1]);
      if (rng.chance(0.3)) opts.push(rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]));
      var st = rng.pick(opts); px = clamp(px + st[0], 0, G.gw - 1); py = clamp(py + st[1], 0, G.gh - 1); mark(px, py);
    }
    mark(hx, hy);
    // monsters on non-safe cells
    var free = []; for (var c = 0; c < G.cells.length; c++) if (!safe[c]) free.push(G.cells[c]);
    rng.shuffle(free);
    var mc = Math.min(Lc.monsters, free.length);
    for (var m = 0; m < mc; m++) { var mm = free[m]; mm.mon = true; mm.monId = rng.pick(Lc.pool); }
    // hatch / source
    var hatchC = cell(hx, hy); hatchC.hatch = true; if (Lc.source) { hatchC.source = true; hatchC.kind = "source"; }
    // loot + vents on remaining non-monster, non-hatch, non-start cells
    var open = []; for (var d = 0; d < G.cells.length; d++) { var cc = G.cells[d]; if (!cc.mon && !cc.hatch && !(cc.x === sx && cc.y === sy)) open.push(cc); }
    rng.shuffle(open); var oi = 0;
    for (var v = 0; v < (Lc.vents || 0) && oi < open.length; v++, oi++) { open[oi].lootId = "vent"; open[oi].kind = "vent"; open[oi].o2 = LOOT.vent.o2; }
    for (var lt = 0; lt < (Lc.loot || 0) && oi < open.length; lt++, oi++) { var lk = rng.pick(Lc.lootPool); open[oi].lootId = lk; open[oi].kind = LOOT[lk].kind; open[oi].value = LOOT[lk].value ? rng.int(LOOT[lk].value[0], LOOT[lk].value[1]) : 0; }
    // numbers
    for (var y2 = 0; y2 < G.gh; y2++) for (var x2 = 0; x2 < G.gw; x2++) { var t = cell(x2, y2); if (t.mon) continue; var cnt = 0; for (var ny = -1; ny <= 1; ny++) for (var nx = -1; nx <= 1; nx++) { if (!nx && !ny) continue; var nb = cell(x2 + nx, y2 + ny); if (nb && nb.mon) cnt++; } t.n = cnt; }
    // reveal start (it is a 0 — flood its pocket)
    var startC = cell(sx, sy); seeCell(startC);
    G.pings = effPings(); G.stalker = null; G.woke = false; G.confirmDir = null; G.transit = null; G.onLoot = false;
    G.depth = Lc.depth;
    G.snow = []; for (var sN = 0; sN < 120; sN++) G.snow.push(newSnow(true));
  }
  function newSnow(initial) { return { rx: G.rng.range(-20, 20), ry: G.rng.range(-14, 14), rz: initial ? G.rng.range(1, 40) : G.rng.range(28, 44) }; }

  function seeCell(c) { // mark a cell's number visible; flood across 0-regions (classic cascade, visual only)
    if (!c || c.seen || c.mon) return; c.seen = true;
    if (c.n === 0) { for (var ny = -1; ny <= 1; ny++) for (var nx = -1; nx <= 1; nx++) { if (!nx && !ny) continue; var nb = cell(c.x + nx, c.y + ny); if (nb && !nb.mon && !nb.seen) seeCell(nb); } }
  }
  function recomputeNumbers() {
    for (var y = 0; y < G.gh; y++) for (var x = 0; x < G.gw; x++) { var t = cell(x, y); if (t.mon) { t.n = 0; continue; } var cnt = 0; for (var ny = -1; ny <= 1; ny++) for (var nx = -1; nx <= 1; nx++) { if (!nx && !ny) continue; var nb = cell(x + nx, y + ny); if (nb && nb.mon) cnt++; } t.n = cnt; }
  }
  function nearestMonDist() { var best = 99; for (var i = 0; i < G.cells.length; i++) { var c = G.cells[i]; if (c.mon && !c.triggered) { var d = Math.abs(c.x - G.sub.cx) + Math.abs(c.y - G.sub.cy); if (d < best) best = d; } } return best; }
  // THE TWIST: the Angler moves. It slips to an adjacent FOG cell, clearing the flag you set on its
  // old tile (your mark is now a lie) and re-arming an unmarked one. Numbers shift; a solved board lies.
  function moveAnglers() {
    var chance = Math.min(0.5, (G.threat >= CFG.wake ? 0.4 : 0.1) + (G.layer - 1) * 0.04);
    var moved = false, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < G.cells.length; i++) {
      var c = G.cells[i]; if (!c.mon || c.triggered) continue; if (!G.rng.chance(chance)) continue;
      var cands = [];
      for (var d = 0; d < 4; d++) { var nx = c.x + dirs[d][0], ny = c.y + dirs[d][1], tc = cell(nx, ny);
        if (!tc || tc.mon || tc.seen || tc.hatch || tc.source) continue;
        if (nx === G.sub.cx && ny === G.sub.cy) continue; // never slide onto the sub (no free kill)
        cands.push(tc); }
      if (!cands.length) continue;
      var dest = G.rng.pick(cands);
      c.mon = false; var mid = c.monId; c.monId = null; c.flagged = false; // the mark on the old tile is cleared — it lied
      dest.mon = true; dest.monId = mid; dest.flagged = false;
      moved = true;
    }
    if (moved) { recomputeNumbers(); G.lamp.wake = Math.max(G.lamp.wake, 0.7); Audio.alert(); G.flash = Math.max(G.flash, 0.16); G.flashCol = "120,40,160"; }
    return moved;
  }

  function startRun() { G.layer = 1; G.hull = effMaxHull(); G.oxygen = effMaxOxygen(); G.haul = 0; G.threat = 0; G.lightOn = false; G.leak = 0; G.scare = null; G.won = false; G.endKind = null; genLayer(1); G.scene = "dive"; Audio.setMusic("ambient"); }
  function descend() { Audio.descend(); if (OPT.shake) G.shake = 6; var nl = G.layer + 1; if (nl > CFG.layers) { winRun(); return; } genLayer(nl); G.threat = clamp(G.threat - 20, 0, 100); }
  function surface() { if (G.scene !== "dive") return; G.money += G.haul; G.haul = 0; Audio.ascend(); G.scene = "rig"; Audio.setMusic("none"); }
  function winRun() { G.money += G.haul; G.scene = "end"; G.won = true; G.endKind = "win"; Audio.setMusic("none"); Audio.win(); }
  function die(kind) { if (G.scene !== "dive") return; G.scene = "end"; G.won = false; G.endKind = kind; Audio.setMusic("none"); Audio.lose(); }

  // ---------------- actions ----------------
  function tryDrive(dx, dy) {
    if (G.scene !== "dive" || G.transit || G.scare) return; Audio.init();
    var tx = G.sub.cx + dx, ty = G.sub.cy + dy, c = cell(tx, ty); if (!c) return;
    G.facing = { dx: dx, dy: dy };
    if (c.flagged && !c.triggered) {
      if (G.confirmDir && G.confirmDir.dx === dx && G.confirmDir.dy === dy) { G.confirmDir = null; }
      else { G.confirmDir = { dx: dx, dy: dy }; G.lamp.hull = 0.6; Audio.alert(); return; }
    } else G.confirmDir = null;
    G.transit = { dx: dx, dy: dy, target: c, t: 0, isMonster: !!c.mon, shape: c.mon ? MON[c.monId].shape : null, fromX: G.sub.cx, fromY: G.sub.cy };
  }
  function resolveArrive(tr) {
    var c = tr.target; G.transit = null; G.oxygen -= CFG.moveCost;
    if (c.mon) { strike(c); afterMove(); return; }
    G.sub = { cx: c.x, cy: c.y };
    seeCell(c);
    if (c.lootId && !c.collected && c.kind === "vent") collect(c);       // thermal air is automatic
    G.onLoot = !!(c.lootId && !c.collected && c.kind !== "vent");        // data/artifacts await EXCAVATE
    afterMove();
  }
  function afterMove() {
    G.threat = clamp(G.threat + CFG.threatMove, 0, 100);
    moveAnglers();
    if (G.oxygen <= 0) { G.oxygen = 0; return die("oxygen"); }
    if (G.hull <= 0) return die("hull");
  }
  function collect(c) {
    c.collected = true;
    if (c.kind === "vent") { G.oxygen = clamp(G.oxygen + c.o2, 0, effMaxOxygen() + 40); G.lamp.o2 = 0; Audio.vent(); G.flash = 0.2; G.flashCol = "40,240,170"; }
    else if (c.kind === "artifact") { G.haul += c.value; Audio.good(); G.flash = 0.25; G.flashCol = "70,240,200"; }
    else { G.haul += c.value; Audio.scan(); }
  }
  function excavate() { // haul the data/artifact on the current cell (a deliberate, slightly loud dig)
    if (G.scene !== "dive" || G.transit || G.scare) return; var c = curCell();
    if (!c || !c.lootId || c.collected || c.kind === "vent") return;
    collect(c); G.onLoot = false; G.oxygen -= 2; G.threat = clamp(G.threat + 6, 0, 100);
    if (G.threat >= CFG.wake) moveAnglers();
  }
  function patch() { // hands-on leak repair
    if (G.scene !== "dive" || G.transit) return;
    if (G.patches <= 0) { G.lamp.hull = 0.4; return; }
    if (G.hull >= effMaxHull()) return;
    G.patches--; G.hull = clamp(G.hull + CFG.patchAmount, 0, effMaxHull());
    G.leak = (1 - G.hull / effMaxHull()) * bilgeMult();
    Audio.vent(); G.flash = 0.2; G.flashCol = "40,240,170";
  }
  function crank() { // the winch: descend on the hatch, breach on the Source, otherwise reel UP to the rig
    if (G.scene !== "dive" || G.transit || G.scare) return; var c = curCell();
    if (c && c.source) { winRun(); return; }
    if (c && c.hatch) { descend(); return; }
    surface();
  }
  function strike(c) {
    var def = MON[c.monId], dmg = G.rng.int(def.dmg[0], def.dmg[1]);
    G.hull = clamp(G.hull - dmg, 0, CFG.maxHull);
    c.seen = true; c.triggered = true; c.flagged = true; // sub is shoved back; the cell is now KNOWN + flagged
    G.flash = 0.8; G.flashCol = "190,30,30"; if (OPT.shake) G.shake = def.tier >= 3 ? 16 : 11;
    G.lamp.hull = 1; Audio.roar(); Audio.damage();
    G.scare = { shape: def.shape, name: def.name, until: G.time + (def.tier >= 3 ? 1.6 : 1.1), t0: G.time, tier: def.tier };
    Audio.setMusic("threat");
  }
  function ping() {
    if (G.scene !== "dive" || G.transit || G.scare || G.pings <= 0) { if (G.pings <= 0) G.lamp.o2 = 0.4; return; }
    Audio.init(); G.pings--; G.pingFlash = 1; G.sweep = 0; G.threat = clamp(G.threat + CFG.threatPing, 0, 100);
    var fx = G.facing.dx, fy = G.facing.dy;
    for (var d = 1; d <= CFG.pingCone; d++) { for (var l = -(d - 1); l <= d - 1; l++) {
      var cx = G.sub.cx + fx * d - fy * l, cy = G.sub.cy + fy * d + fx * l; var c = cell(cx, cy);
      if (c && !c.mon && !c.seen) seeCell(c); // ping reveals numbers of SAFE cells only; monsters stay fog (deduce them)
    } }
    Audio.ping();
    if (G.threat >= CFG.wake) moveAnglers(); // a loud ping makes the Anglers shift
  }
  function toggleLight() { if (G.scene !== "dive") return; Audio.init(); G.lightOn = !G.lightOn; Audio.vent(); }
  function flagFaced() { if (G.scene !== "dive" || G.transit) return; var c = cell(G.sub.cx + G.facing.dx, G.sub.cy + G.facing.dy); flagCell(c); }
  function flagCell(c) { if (!c || c.seen) return; c.flagged = !c.flagged; G.confirmDir = null; Audio.card(); }

  // (the old "stalker" hunter is replaced by moveAnglers(): the mines themselves relocate.)

  // ---------------- update ----------------
  function update(dt) {
    G.time += dt / 1000; var s = dt / 1000;
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 600);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 60);
    if (G.pingFlash > 0) G.pingFlash = Math.max(0, G.pingFlash - s * 1.3);
    G.sweep = (G.sweep + s * 2.2) % (Math.PI * 2);
    for (var key in G.lamp) if (G.lamp[key] > 0) G.lamp[key] = Math.max(0, G.lamp[key] - s * 0.4);
    if (G.scare && G.time > G.scare.until) G.scare = null;
    // snow drift (gentle when idle, rush during transit)
    var rush = G.transit ? 14 : 1.5;
    for (var i = 0; i < G.snow.length; i++) { var p = G.snow[i]; p.rz -= rush * s; if (p.rz < 0.5) { var ns = newSnow(false); p.rx = ns.rx; p.ry = ns.ry; p.rz = ns.rz; } }
    if (G.scene !== "dive") return;

    if (G.transit) { G.transit.t += s / CFG.moveGlide; if (G.transit.t >= 1) resolveArrive(G.transit); }

    // air clock
    G.oxygen -= CFG.idleDrain * s; if (G.oxygen <= 0) { G.oxygen = 0; return die("oxygen"); }
    if (G.oxygen < effMaxOxygen() * 0.2) G.lamp.o2 = Math.max(G.lamp.o2, 0.5 + 0.5 * Math.sin(G.time * 5));
    // threat
    var add = 0; if (G.lightOn) add += lightThreatRate() * s;
    G.threat = clamp(G.threat + add - CFG.threatDecay * s, 0, 100);
    if (G.threat >= CFG.wake) G.lamp.wake = Math.max(G.lamp.wake, 0.5);
    // smooth leak severity toward hull damage (bilge pump keeps the cabin drier)
    var target = (1 - G.hull / effMaxHull()) * bilgeMult(); G.leak += (target - G.leak) * Math.min(1, s * 2);
    // heartbeat from a nearby (unrevealed) Angler / low hull / low air
    var nd = nearestMonDist(); var hbScare = nd <= 3 ? clamp(1 - (nd - 1) / 3, 0, 1) : 0;
    G.heartbeat = Math.max(hbScare, G.leak > 0.7 ? G.leak : 0, G.oxygen < effMaxOxygen() * 0.12 ? 0.6 : 0);
    if (G.heartbeat > 0.06) { var iv = 1.1 - G.heartbeat * 0.7; G.hbT -= s; if (G.hbT <= 0) { G.hbT = iv; Audio.heartbeat(G.heartbeat); } } else G.hbT = 0;
    // ambient groan/drip when flooding & quiet
    if (G.leak > 0.25 && Math.sin(G.time * 0.7) > 0.995) Audio.groan && Audio.groan();
    var wantThreat = G.threat >= CFG.wake || nd <= 2 || G.leak > 0.6;
    if (Audio._which !== (wantThreat ? "threat" : "ambient")) Audio.setMusic(wantThreat ? "threat" : "ambient");
  }

  // ---------------- render ----------------
  function render() {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#05080c"; ctx.fillRect(0, 0, W, H); if (!G) return;
    if (UI.overlay === "help") return renderHelp();
    if (UI.overlay === "options") return renderOptions();
    if (G.scene === "dive") return renderDive();
    if (G.scene === "rig") return renderRig();
    if (G.scene === "end") return renderEnd();
    return renderTitle();
  }

  function renderForwardBuffer() {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawForward(bctx, bw, bh, { contacts: forwardContacts(), snow: G.snow, lightOn: G.lightOn, threat: G.threat / 100, time: G.time, fov: 1.2, headlightRange: lightRange() });
  }
  function forwardContacts() {
    var out = [], mons = [], sp = 6.5, tp = G.transit ? G.transit.t : 0;
    for (var d = 1; d <= 4; d++) {
      var rz = Math.max(0.8, d * sp - tp * sp * 0.92);
      for (var lat = -1; lat <= 1; lat++) {
        if (lat !== 0 && d < 2) continue; // straight ahead near; widen the cone with distance
        var tx = G.sub.cx + G.facing.dx * d - G.facing.dy * lat, ty = G.sub.cy + G.facing.dy * d + G.facing.dx * lat; var c = cell(tx, ty); if (!c) continue;
        var rx = lat * 3.2;
        if (c.mon && !c.triggered) mons.push({ rx: rx, ry: 0.05, rz: rz, isMonster: true, monShape: MON[c.monId].shape });
        else if (lat === 0 && c.hatch) out.push({ rx: 0, ry: 0, rz: rz, kind: c.source ? "source" : "vent", isMonster: false });
        else if (c.seen && c.lootId && !c.collected) out.push({ rx: rx, ry: 0, rz: rz, kind: c.kind, isMonster: false });
      }
    }
    // cap full 3D Anglers to the nearest 2 (perf); the rest are implied by the radar/numbers
    mons.sort(function (a, b) { return a.rz - b.rz; });
    for (var m = 0; m < Math.min(2, mons.length); m++) out.push(mons[m]);
    if (G.transit && G.transit.isMonster) out.push({ rx: 0, ry: 0.05, rz: Math.max(0.8, 6.5 - G.transit.t * 5.8), isMonster: true, monShape: G.transit.shape });
    return out;
  }

  function renderDive() {
    drawCockpitBG();
    // forward porthole
    renderForwardBuffer();
    var shx = G.shake ? (Math.random() - 0.5) * G.shake : 0, shy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    var ph = L.porthole; ctx.save(); ctx.beginPath(); Art.rrect(ctx, ph.x, ph.y, ph.w, ph.h, 10); ctx.clip();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, ph.x + shx, ph.y + shy, ph.w, ph.h); ctx.restore();
    portholeBezel(ph);
    drawCabinPlushies();
    // monitor grid
    drawMonitor();
    // instruments
    Art.drawOxygenTank(ctx, L.tank.x, L.tank.y, L.tank.w, L.tank.h, G.oxygen / CFG.startOxygen, G.time);
    Art.drawDepthGauge(ctx, L.depth.cx, L.depth.cy, L.depth.r, clamp(G.layer / CFG.layers, 0, 1), G.time);
    drawLamps(); drawControls();
    // jumpscare on top
    if (G.scare) drawScare();
    // diegetic hull = flooding cabin (drawn over everything except scanlines)
    Art.drawLeak(ctx, W, H, clamp(G.leak, 0, 1), G.time);
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, flash: G.flash, flashCol: G.flashCol });
    if (G.heartbeat > 0.25) { ctx.fillStyle = "rgba(150,20,30," + (G.heartbeat * 0.16).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
  }

  function drawCockpitBG() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#161b22"); g.addColorStop(0.5, PAL.panel); g.addColorStop(1, "#0c0f14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // riveted seams + pipes
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2; ctx.strokeRect(L.col.w, L.top.h, W - L.col.w, H - L.top.h - L.bottom.h);
    ctx.fillStyle = PAL.rivet; for (var x = 12; x < W; x += 28) { ctx.beginPath(); ctx.arc(x, L.top.h - 4, 2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, H - L.bottom.h + 4, 2, 0, 7); ctx.fill(); }
    ctx.strokeStyle = PAL.steel; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(L.col.w * 0.5, L.top.h); ctx.lineTo(L.col.w * 0.5, L.col.y + L.col.h); ctx.stroke();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L.col.w * 0.5 - 2, L.top.h); ctx.lineTo(L.col.w * 0.5 - 2, L.col.y + L.col.h); ctx.stroke();
  }
  function portholeBezel(ph) {
    ctx.lineWidth = 7; ctx.strokeStyle = PAL.steelLo; Art.rrect(ctx, ph.x - 3, ph.y - 3, ph.w + 6, ph.h + 6, 12); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = PAL.steelHi; Art.rrect(ctx, ph.x - 5, ph.y - 5, ph.w + 10, ph.h + 10, 14); ctx.stroke();
    ctx.fillStyle = PAL.rivet; var n = 8; for (var i = 0; i <= n; i++) { var t = i / n; ctx.beginPath(); ctx.arc(ph.x + ph.w * t, ph.y - 8, 2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(ph.x + ph.w * t, ph.y + ph.h + 8, 2, 0, 7); ctx.fill(); }
  }
  function plushDef(id) { for (var i = 0; i < PLUSHIES.length; i++) if (PLUSHIES[i].id === id) return PLUSHIES[i]; return null; }
  function drawCabinPlushies() {
    if (!G.plushies.length) return; var ph = L.porthole, n = G.plushies.length;
    var sz = clamp(Math.min(ph.h * 0.12, ph.w / (n + 1) * 0.45), 8, 22);
    for (var i = 0; i < n; i++) { var pl = plushDef(G.plushies[i]); if (!pl) continue; Art.drawPlushie(ctx, ph.x + ph.w * ((i + 1) / (n + 1)), ph.y + sz * 1.9, sz, pl.id, pl.col, G.time); }
  }

  function drawMonitor() {
    var m = L.monitor;
    // CRT housing
    ctx.fillStyle = PAL.steelLo; Art.rrect(ctx, m.x - 6, m.y - 6, m.w + 12, m.h + 12, 10); ctx.fill();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1.5; Art.rrect(ctx, m.x - 6, m.y - 6, m.w + 12, m.h + 12, 10); ctx.stroke();
    var fg = ctx.createRadialGradient(m.x + m.w / 2, m.y + m.h / 2, 4, m.x + m.w / 2, m.y + m.h / 2, m.w * 0.7);
    fg.addColorStop(0, "#06241a"); fg.addColorStop(1, "#02110b"); ctx.fillStyle = fg; Art.rrect(ctx, m.x, m.y, m.w, m.h, 6); ctx.fill();
    // grid geometry
    var gap = 2, cellSz = Math.floor(Math.min((m.w - 12 - (G.gw - 1) * gap) / G.gw, (m.h - 12 - (G.gh - 1) * gap) / G.gh));
    cellSz = clamp(cellSz, 6, 56);
    var fullW = G.gw * cellSz + (G.gw - 1) * gap, fullH = G.gh * cellSz + (G.gh - 1) * gap;
    var gx = m.x + (m.w - fullW) / 2, gy = m.y + (m.h - fullH) / 2;
    // prep cells for drawCell
    for (var i = 0; i < G.cells.length; i++) { var c = G.cells[i]; c.revealed = c.seen; c.dnum = c.n; c.cor = false; c.loot = (c.seen && c.lootId && !c.collected && c.kind !== "source") ? c.kind : null; }
    Art.drawGrid(ctx, { cells: G.cells, gw: G.gw, gh: G.gh, cell: cellSz, gap: gap, x: gx, y: gy, time: G.time, cursor: null });
    // hatch / source marker
    var hc = cell(G.hatch.x, G.hatch.y); if (hc) { var hxp = gx + hc.x * (cellSz + gap), hyp = gy + hc.y * (cellSz + gap);
      if (hc.source) { Art.lootGlyph(ctx, hxp + cellSz / 2, hyp + cellSz / 2, cellSz * 0.4, "shard", G.time); }
      else { ctx.strokeStyle = PAL.bioHi; ctx.lineWidth = 2; var hs = cellSz * 0.3, mcx = hxp + cellSz / 2, mcy = hyp + cellSz / 2;
        ctx.beginPath(); ctx.moveTo(mcx - hs, mcy - hs * 0.5); ctx.lineTo(mcx, mcy + hs * 0.6); ctx.lineTo(mcx + hs, mcy - hs * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(mcx, mcy, hs * 0.9, 0, 7); ctx.globalAlpha = 0.4 + 0.3 * Math.sin(G.time * 3); ctx.stroke(); ctx.globalAlpha = 1; } }
    // sub marker (lerp during transit) + facing
    var scx = G.sub.cx, scy = G.sub.cy; if (G.transit) { scx += G.transit.dx * G.transit.t * (G.transit.isMonster ? 0.5 : 1); scy += G.transit.dy * G.transit.t * (G.transit.isMonster ? 0.5 : 1); }
    var sxp2 = gx + scx * (cellSz + gap) + cellSz / 2, syp2 = gy + scy * (cellSz + gap) + cellSz / 2;
    ctx.save(); Art.glowDot(ctx, sxp2, syp2, cellSz * 0.55, PAL.phosHi, 1);
    ctx.fillStyle = PAL.phosHi; ctx.strokeStyle = "#04120c"; ctx.lineWidth = 1;
    var a = Math.atan2(G.facing.dy, G.facing.dx); ctx.translate(sxp2, syp2); ctx.rotate(a);
    var r = cellSz * 0.32; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // confirm-override prompt (a pulsing ring on the flagged target) — diegetic, no text
    if (G.confirmDir) { var fcx = gx + (G.sub.cx + G.confirmDir.dx) * (cellSz + gap) + cellSz / 2, fcy = gy + (G.sub.cy + G.confirmDir.dy) * (cellSz + gap) + cellSz / 2; ctx.strokeStyle = PAL.bloodHi; ctx.lineWidth = 2; ctx.globalAlpha = 0.4 + 0.5 * Math.sin(G.time * 10); ctx.beginPath(); ctx.arc(fcx, fcy, cellSz * 0.6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    // scanline glare over the monitor
    ctx.save(); ctx.beginPath(); Art.rrect(ctx, m.x, m.y, m.w, m.h, 6); ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.16)"; for (var ys = 0; ys < m.h; ys += 3) ctx.fillRect(m.x, m.y + ys, m.w, 1);
    var gl = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h); gl.addColorStop(0, "rgba(120,255,210,0.05)"); gl.addColorStop(0.5, "rgba(0,0,0,0)"); ctx.fillStyle = gl; ctx.fillRect(m.x, m.y, m.w, m.h); ctx.restore();
    L._grid = { gx: gx, gy: gy, cell: cellSz, gap: gap };
  }

  function drawLamps() {
    var y = L.top.h * 0.5, x = W - 24;
    Art.drawWarnLamp(ctx, x, y, clamp(L.top.h * 0.22, 5, 9), G.lamp.hull > 0.05, PAL.bloodHi, G.time); x -= 28;
    Art.drawWarnLamp(ctx, x, y, clamp(L.top.h * 0.22, 5, 9), G.lamp.o2 > 0.05, PAL.amberHi, G.time); x -= 28;
    Art.drawWarnLamp(ctx, x, y, clamp(L.top.h * 0.22, 5, 9), G.lamp.wake > 0.05, "#ff6452", G.time);
  }

  function drawControls() {
    var pb = L.btn.ping; for (var i = 0; i < effPings(); i++) { var on = i < G.pings; var dx = pb.x + 8 + i * 12, dy = pb.y - 8; ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, 7); ctx.fillStyle = on ? PAL.bioHi : "#13201a"; ctx.fill(); ctx.strokeStyle = PAL.phosLo; ctx.lineWidth = 1; ctx.stroke(); }
    Art.button(ctx, pb, "PING", { primary: G.pingFlash > 0.4, hover: UI.hover === "ping", disabled: G.pings <= 0 });
    Art.button(ctx, L.btn.light, "LIGHT" + (G.lightOn ? " •" : ""), { primary: G.lightOn, hover: UI.hover === "light" });
    var narrow = L.btn.excavate.w < 88;
    Art.button(ctx, L.btn.excavate, narrow ? "DIG" : "EXCAVATE", { primary: G.onLoot, hover: UI.hover === "excavate", disabled: !G.onLoot });
    Art.button(ctx, L.btn.patch, (narrow ? "FIX " : "PATCH ") + G.patches, { hover: UI.hover === "patch", disabled: G.patches <= 0 || G.hull >= effMaxHull() });
    var oc = curCell(); var cl = (oc && oc.source) ? "BREACH" : (oc && oc.hatch) ? "DIVE ▼" : "RISE ▲";
    Art.button(ctx, L.btn.crank, cl, { primary: !!(oc && (oc.hatch || oc.source)), hover: UI.hover === "crank" });
    Art.button(ctx, L.btn.brief, "?", { hover: UI.hover === "brief" });
    var d = dpadRects();
    Art.button(ctx, d.up, "▲", { hover: UI.hover === "up" }); Art.button(ctx, d.down, "▼", { hover: UI.hover === "down" });
    Art.button(ctx, d.left, "◄", { hover: UI.hover === "left" }); Art.button(ctx, d.right, "►", { hover: UI.hover === "right" });
  }

  function drawScare() { // full-screen takeover: the Angler rushes the glass and fills your view
    var sc = G.scare, dur = Math.max(0.3, sc.until - sc.t0), k = clamp((G.time - sc.t0) / dur, 0, 1), lung = k * k;
    ctx.fillStyle = "#04080c"; ctx.fillRect(0, 0, W, H);
    var sz = Math.max(W, H) * (0.34 + lung * 0.95);
    var jx = (Math.random() - 0.5) * 22 * (1 - k * 0.35), jy = (Math.random() - 0.5) * 22 * (1 - k * 0.35);
    Art.drawAngler3D(ctx, W / 2 + jx, H * 0.47 + jy, sz, { yaw: Math.sin(G.time * 26) * 0.14, pitch: -0.03, mouth: clamp(0.3 + lung * 1.05, 0, 1), t: G.time, lit: 1, boss: sc.tier >= 3 });
    if (k < 0.18) { ctx.fillStyle = "rgba(240,245,245," + (0.7 * (1 - k / 0.18)).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = "rgba(150,18,22," + (0.3 * (1 - k)).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
  }

  // ---------------- title / help / options / end ----------------
  function renderSceneBackground() { var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh); Art.drawTitle(bctx, bw, bh, G ? G.time : 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W, H); }
  function renderTitle() {
    renderSceneBackground(); var cy = H * 0.27; Art.text(ctx, S.title, W / 2, cy, clamp(W * 0.11, 38, 96), PAL.phosHi, "center");
    Art.text(ctx, S.subtitle.toUpperCase(), W / 2, cy + clamp(W * 0.04, 18, 34), clamp(W * 0.022, 12, 22), PAL.bio, "center");
    Art.wrapText(ctx, S.tagline, W / 2, cy + clamp(W * 0.07, 32, 56), clamp(W * 0.5, 280, 640), clamp(W * 0.016, 10, 16), PAL.textDim);
    UI.menu = []; var bw = clamp(W * 0.4, 220, 340), bh = clamp(H * 0.075, 44, 62), bx = (W - bw) / 2, by = H * 0.52, gap = 14;
    var labels = [[S.menu_dive, "dive", true], [S.menu_help, "help", false], [S.menu_options, "options", false]];
    for (var i = 0; i < labels.length; i++) { var r = { x: bx, y: by + i * (bh + gap), w: bw, h: bh }; Art.button(ctx, r, labels[i][0], { primary: labels[i][2], hover: UI.hover === "m" + i || (G.padActive && G.menuSel === i) }); UI.menu.push({ r: r, act: labels[i][1] }); }
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderHelp() {
    renderSceneBackground(); var x = clamp(W * 0.08, 18, 180), y = clamp(H * 0.07, 30, 90), w = W - x * 2;
    Art.text(ctx, S.help_title, W / 2, y, clamp(W * 0.045, 22, 40), PAL.phosHi, "center");
    var fs = clamp(W * 0.015, 11, 15), yy = y + fs * 2.2;
    for (var i = 0; i < S.help_lines.length; i++) yy += Art.wrapText(ctx, "• " + S.help_lines[i], W / 2, yy, w, fs, PAL.text) * (fs + 4) + 5;
    yy += 6; Art.wrapText(ctx, S.help_controls, W / 2, yy, w, fs * 0.92, PAL.amber);
    UI.backBtn = { x: W / 2 - 90, y: H - clamp(H * 0.11, 54, 100), w: 180, h: 46 }; Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderOptions() {
    renderSceneBackground(); var y = clamp(H * 0.16, 50, 140); Art.text(ctx, S.options_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var rows = [[S.opt_sound, "sound"], [S.opt_shake, "shake"], [S.opt_scanlines, "scanlines"]]; UI.optHit = [];
    var rw = clamp(W * 0.6, 280, 460), rx = (W - rw) / 2, rh = 54, ry = y + 40;
    for (var i = 0; i < rows.length; i++) { var r = { x: rx, y: ry + i * (rh + 12), w: rw, h: rh }; ctx.fillStyle = "rgba(10,14,20,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.strokeStyle = "rgba(90,100,114,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      Art.text(ctx, rows[i][0], r.x + 14, r.y + r.h / 2 + 6, 16, PAL.text, "left"); var on = OPT[rows[i][1]], tr = { x: r.x + r.w - 86, y: r.y + 11, w: 72, h: 32 }; Art.button(ctx, tr, on ? S.opt_on : S.opt_off, { primary: on }); UI.optHit.push({ r: tr, key: rows[i][1] }); }
    UI.backBtn = { x: W / 2 - 90, y: ry + rows.length * (rh + 12) + 16, w: 180, h: 48 }; Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderEnd() {
    renderSceneBackground(); ctx.fillStyle = "rgba(2,4,8,0.76)"; ctx.fillRect(0, 0, W, H);
    var win = G.won, title = win ? S.win_title : G.endKind === "hull" ? S.lose_hull : S.lose_oxygen, body = win ? S.win_body : G.endKind === "hull" ? S.lose_hull_body : S.lose_oxygen_body;
    var y = clamp(H * 0.2, 70, 190); Art.text(ctx, title, W / 2, y, clamp(W * 0.06, 28, 56), win ? PAL.bioHi : PAL.bloodHi, "center");
    Art.wrapText(ctx, body, W / 2, y + clamp(W * 0.05, 34, 56), clamp(W * 0.7, 280, 720), clamp(W * 0.018, 13, 19), PAL.text);
    Art.text(ctx, fmt(S.end_depth, { d: Math.floor(G.depth), haul: G.haul }), W / 2, y + clamp(W * 0.05, 34, 56) + 104, 14, PAL.amber, "center");
    UI.contBtn = { x: W / 2 - 120, y: H - clamp(H * 0.16, 84, 140), w: 240, h: 52 }; Art.button(ctx, UI.contBtn, S.again, { primary: true, hover: UI.hover === "cont" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  // ---------------- oil-rig surface base (the hub: bank haul, buy equipment + plushies, descend) ----------------
  function renderRig() {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh); Art.drawRig(bctx, bw, bh, G.time);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W, H);
    Art.text(ctx, "RIG DELTA-9", W / 2, clamp(H * 0.075, 30, 60), clamp(W * 0.032, 18, 30), PAL.phosHi, "center");
    Art.text(ctx, "₽" + G.money + "    " + G.patches + " PATCH KITS", W / 2, clamp(H * 0.075, 30, 60) + clamp(W * 0.026, 15, 26), clamp(W * 0.02, 12, 18), PAL.amberHi, "center");
    var twoCol = W > 760, topY = clamp(H * 0.16, 72, 140);
    var leftX = clamp(W * 0.05, 14, 60), colW = twoCol ? clamp(W * 0.44, 280, 480) : W - clamp(W * 0.05, 14, 60) * 2;
    Art.text(ctx, "OUTFIT — EQUIPMENT", leftX + 2, topY - 8, clamp(W * 0.02, 12, 16), PAL.bio, "left");
    UI.shopHit = [];
    var rowH = clamp((H - topY - 168) / SHOP.length, 36, 56), ry = topY;
    for (var i = 0; i < SHOP.length; i++) {
      var it = SHOP[i], lvl = G.up[it.id] || 0, repeat = it.repeat, maxed = !repeat && lvl >= it.costs.length;
      var r = { x: leftX, y: ry, w: colW, h: rowH - 6 };
      ctx.fillStyle = "rgba(10,14,20,0.55)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 5); ctx.fill();
      ctx.strokeStyle = (G.padActive && G.shopFocus === i) ? PAL.phosHi : "rgba(90,100,114,0.5)"; ctx.lineWidth = (G.padActive && G.shopFocus === i) ? 2 : 1; Art.rrect(ctx, r.x, r.y, r.w, r.h, 5); ctx.stroke();
      var label = it.name + (!repeat && it.costs.length > 1 ? "  [" + lvl + "/" + it.costs.length + "]" : (lvl && !repeat ? "  ✓" : ""));
      Art.text(ctx, label, r.x + 10, r.y + 17, clamp(r.w * 0.04, 11, 15), maxed ? PAL.textDim : PAL.text, "left");
      Art.wrapText(ctx, it.desc, r.x + r.w * 0.42, r.y + r.h - 8, r.w * 0.54, clamp(r.w * 0.028, 9, 12), PAL.textDim);
      var btn = { x: r.x + r.w - 86, y: r.y + 6, w: 78, h: clamp(r.h - 12, 22, 32) };
      if (maxed) Art.button(ctx, btn, "MAX", { disabled: true });
      else { var cost = it.costs[repeat ? 0 : lvl]; Art.button(ctx, btn, "₽" + cost, { primary: G.money >= cost, hover: UI.hover === "buy" + it.id, disabled: G.money < cost }); UI.shopHit.push({ r: btn, id: it.id }); }
      ry += rowH;
    }
    var rx = twoCol ? (W - leftX - colW) : leftX, rw = colW, ryy = twoCol ? topY : ry + 8;
    Art.text(ctx, "MORALE — CABIN DECOR (PLUSHIES)", rx + 2, ryy - 8, clamp(W * 0.02, 12, 16), PAL.violetHi, "left");
    UI.plushHit = [];
    var pCols = PLUSHIES.length, pw = (rw - (pCols - 1) * 8) / pCols, ph = clamp(pw * 1.2, 46, 92);
    for (var p = 0; p < PLUSHIES.length; p++) {
      var pl = PLUSHIES[p], owned = G.plushies.indexOf(pl.id) >= 0, pr = { x: rx + p * (pw + 8), y: ryy, w: pw, h: ph };
      ctx.fillStyle = owned ? "rgba(28,22,40,0.6)" : "rgba(10,14,20,0.55)"; Art.rrect(ctx, pr.x, pr.y, pr.w, pr.h, 5); ctx.fill();
      ctx.strokeStyle = owned ? PAL.violetHi : "rgba(90,100,114,0.5)"; Art.rrect(ctx, pr.x, pr.y, pr.w, pr.h, 5); ctx.stroke();
      Art.drawPlushie(ctx, pr.x + pr.w / 2, pr.y + pr.h * 0.40, Math.min(pr.w, pr.h) * 0.26, pl.id, pl.col, G.time);
      Art.text(ctx, owned ? "✓" : "₽" + pl.cost, pr.x + pr.w / 2, pr.y + pr.h - 7, clamp(pw * 0.18, 9, 14), owned ? PAL.violetHi : (G.money >= pl.cost ? PAL.amberHi : PAL.textDim), "center");
      if (!owned) UI.plushHit.push({ r: pr, id: pl.id, cost: pl.cost });
    }
    UI.diveBtn = { x: W / 2 - clamp(W * 0.22, 130, 220), y: H - clamp(H * 0.13, 70, 116), w: clamp(W * 0.44, 260, 440), h: clamp(H * 0.07, 44, 58) };
    Art.button(ctx, UI.diveBtn, "▼  DESCEND  ▼", { primary: true, hover: UI.hover === "dive" });
    UI.backBtn = { x: 12, y: H - 42, w: 108, h: 32 }; Art.button(ctx, UI.backBtn, S.menu_options, { hover: UI.hover === "back" });
    UI.briefBtn = { x: 128, y: H - 42, w: 108, h: 32 }; Art.button(ctx, UI.briefBtn, S.menu_help, { hover: UI.hover === "brief" });
    if (G.portMsgT > 0) { ctx.globalAlpha = clamp(G.portMsgT, 0, 1); Art.text(ctx, G.portMsg, W / 2, UI.diveBtn.y - 12, clamp(W * 0.02, 12, 17), PAL.amberHi, "center"); ctx.globalAlpha = 1; }
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function buy(id) {
    var it = shopItem(id), lvl = G.up[id] || 0;
    if (id === "patch") { if (G.money < it.costs[0]) { portMsg("Not enough ₽."); Audio.alert(); return; } G.money -= it.costs[0]; G.patches += it.vals[0]; Audio.good(); portMsg("Patch kits stocked."); return; }
    if (lvl >= it.costs.length) { portMsg("Already maxed."); return; }
    var cost = it.costs[lvl]; if (G.money < cost) { portMsg("Not enough ₽."); Audio.alert(); return; }
    G.money -= cost; G.up[id] = lvl + 1; Audio.good(); portMsg("Installed " + it.name + ".");
  }
  function buyPlushie(id, cost) { if (G.plushies.indexOf(id) >= 0) return; if (G.money < cost) { portMsg("Not enough ₽."); Audio.alert(); return; } G.money -= cost; G.plushies.push(id); Audio.good(); portMsg("A little friend for the cabin."); }
  function onRigDown(p) {
    for (var i = 0; i < UI.shopHit.length; i++) if (inside(UI.shopHit[i].r, p)) { buy(UI.shopHit[i].id); return; }
    for (var j = 0; j < UI.plushHit.length; j++) if (inside(UI.plushHit[j].r, p)) { buyPlushie(UI.plushHit[j].id, UI.plushHit[j].cost); return; }
    if (inside(UI.diveBtn, p)) { Audio.card(); startRun(); return; }
    if (inside(UI.briefBtn, p)) { UI.overlay = "help"; return; }
    if (inside(UI.backBtn, p)) { UI.overlay = "options"; return; }
  }

  // ---------------- input ----------------
  var UI = { overlay: null, hover: null, menu: [], optHit: [] };
  var holdTimer = null, holdFired = false, holdCell = null;
  function pt(e) { var rect = canvas.getBoundingClientRect(); var s = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e; return { x: s.clientX - rect.left, y: s.clientY - rect.top }; }
  function gridCellAt(p) { if (!L._grid) return null; var g = L._grid; var cx = Math.floor((p.x - g.gx) / (g.cell + g.gap)), cy = Math.floor((p.y - g.gy) / (g.cell + g.gap)); if (cx < 0 || cy < 0 || cx >= G.gw || cy >= G.gh) return null; return { x: cx, y: cy }; }

  function onDown(p) {
    Audio.init(); if (!G) return;
    if (UI.overlay) { if (UI.overlay === "options" && UI.optHit) for (var i = 0; i < UI.optHit.length; i++) if (inside(UI.optHit[i].r, p)) { OPT[UI.optHit[i].key] = !OPT[UI.optHit[i].key]; saveOpt(); Audio.setEnabled(OPT.sound); Audio.card(); return; } if (inside(UI.backBtn, p)) { UI.overlay = null; Audio.card(); } return; }
    if (G.scene === "dive") return onDiveDown(p);
    if (G.scene === "rig") return onRigDown(p);
    if (G.scene === "end") { if (inside(UI.contBtn, p)) { Audio.card(); G.scene = "rig"; } return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) { var act = UI.menu[m].act; Audio.card(); if (act === "dive") G.scene = "rig"; else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; return; }
  }
  function onDiveDown(p) {
    if (inside(L.btn.ping, p)) { ping(); return; }
    if (inside(L.btn.light, p)) { toggleLight(); return; }
    if (inside(L.btn.excavate, p)) { excavate(); return; }
    if (inside(L.btn.patch, p)) { patch(); return; }
    if (inside(L.btn.crank, p)) { crank(); return; }
    if (inside(L.btn.brief, p)) { UI.overlay = "help"; return; }
    var d = dpadRects();
    if (inside(d.up, p)) { tryDrive(0, -1); return; } if (inside(d.down, p)) { tryDrive(0, 1); return; }
    if (inside(d.left, p)) { tryDrive(-1, 0); return; } if (inside(d.right, p)) { tryDrive(1, 0); return; }
    // tap a grid cell: adjacent -> drive into it; (hold handled separately -> flag)
    var gc = gridCellAt(p);
    if (gc) { var ddx = gc.x - G.sub.cx, ddy = gc.y - G.sub.cy; if (Math.abs(ddx) + Math.abs(ddy) === 1) tryDrive(ddx, ddy); }
  }
  function onHover(p) { UI.hover = null; if (!G) return;
    if (UI.overlay) { if (inside(UI.backBtn, p)) UI.hover = "back"; return; }
    if (G.scene === "dive") { var bb = L.btn; if (inside(bb.ping, p)) UI.hover = "ping"; else if (inside(bb.light, p)) UI.hover = "light"; else if (inside(bb.excavate, p)) UI.hover = "excavate"; else if (inside(bb.patch, p)) UI.hover = "patch"; else if (inside(bb.crank, p)) UI.hover = "crank"; else if (inside(bb.brief, p)) UI.hover = "brief"; else { var d = dpadRects(); for (var key in d) if (inside(d[key], p)) { UI.hover = key; break; } } return; }
    if (G.scene === "rig") { for (var si = 0; si < UI.shopHit.length; si++) if (inside(UI.shopHit[si].r, p)) { UI.hover = "buy" + UI.shopHit[si].id; return; } if (inside(UI.diveBtn, p)) UI.hover = "dive"; else if (inside(UI.briefBtn, p)) UI.hover = "brief"; else if (inside(UI.backBtn, p)) UI.hover = "back"; return; }
    if (G.scene === "end") { if (inside(UI.contBtn, p)) UI.hover = "cont"; return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) UI.hover = "m" + m;
  }

  canvas.addEventListener("mousedown", function (e) { onDown(pt(e)); });
  canvas.addEventListener("mousemove", function (e) { onHover(pt(e)); });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); if (G && G.scene === "dive" && !UI.overlay) { var gc = gridCellAt(pt(e)); if (gc) flagCell(cell(gc.x, gc.y)); } });
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); var p = pt(e); holdFired = false; holdCell = (G && G.scene === "dive" && !UI.overlay) ? gridCellAt(p) : null;
    if (holdCell) { var hc = holdCell; holdTimer = setTimeout(function () { holdFired = true; flagCell(cell(hc.x, hc.y)); }, 380); }
    if (!holdCell) onDown(p); }, { passive: false });
  canvas.addEventListener("touchmove", function (e) { e.preventDefault(); if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } }, { passive: false });
  canvas.addEventListener("touchend", function (e) { e.preventDefault(); if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } if (holdFired) return; onDown(pt(e)); }, { passive: false });

  window.addEventListener("keydown", function (e) {
    var code = e.code; if (!G) return;
    if (UI.overlay) { if (code === "Escape" || code === "Enter" || code === "Space" || code === "KeyH") { UI.overlay = null; e.preventDefault(); } return; }
    if (code === "KeyH") { UI.overlay = "help"; e.preventDefault(); return; }
    if (G.scene === "dive") {
      if (code === "KeyW" || code === "ArrowUp") { tryDrive(0, -1); e.preventDefault(); }
      else if (code === "KeyS" || code === "ArrowDown") { tryDrive(0, 1); e.preventDefault(); }
      else if (code === "KeyA" || code === "ArrowLeft") { tryDrive(-1, 0); e.preventDefault(); }
      else if (code === "KeyD" || code === "ArrowRight") { tryDrive(1, 0); e.preventDefault(); }
      else if (code === "Space") { ping(); e.preventDefault(); }
      else if (code === "KeyF") { flagFaced(); e.preventDefault(); }
      else if (code === "KeyL") { toggleLight(); e.preventDefault(); }
      else if (code === "KeyE") { excavate(); e.preventDefault(); }
      else if (code === "KeyC") { crank(); e.preventDefault(); }
      else if (code === "KeyP") { patch(); e.preventDefault(); }
      else if (code === "Escape") { UI.overlay = "options"; }
    } else if (G.scene === "rig") { if (code === "Enter" || code === "Space") { startRun(); e.preventDefault(); } else if (code === "Escape") { UI.overlay = "options"; } }
    else if (G.scene === "end") { if (code === "Enter" || code === "Space") { G.scene = "rig"; e.preventDefault(); } }
    else { if (code === "Enter" || code === "Space") { G.scene = "rig"; e.preventDefault(); } }
  });

  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : []; if (!G) return;
    for (var g = 0; g < pads.length; g++) { var gp = pads[g]; if (!gp) continue; var b = gp.buttons, ax = gp.axes || []; G.padActive = true;
      function pressed(i) { return b[i] && b[i].pressed && !padPrev[i]; }
      if (UI.overlay) { if (pressed(0) || pressed(1) || pressed(9)) UI.overlay = null; }
      else if (G.scene === "dive") {
        if (pressed(12) || (ax[1] < -0.5 && !padPrev._u)) tryDrive(0, -1); if (pressed(13) || (ax[1] > 0.5 && !padPrev._d)) tryDrive(0, 1);
        if (pressed(14) || (ax[0] < -0.5 && !padPrev._l)) tryDrive(-1, 0); if (pressed(15) || (ax[0] > 0.5 && !padPrev._r)) tryDrive(1, 0);
        padPrev._u = ax[1] < -0.5; padPrev._d = ax[1] > 0.5; padPrev._l = ax[0] < -0.5; padPrev._r = ax[0] > 0.5;
        if (pressed(0)) ping(); if (pressed(2)) flagFaced(); if (pressed(1)) toggleLight(); if (pressed(3)) excavate(); if (pressed(4)) patch(); if (pressed(5)) crank(); if (pressed(9)) UI.overlay = "help";
      } else if (G.scene === "rig") {
        if (pressed(12)) G.shopFocus = (G.shopFocus + SHOP.length - 1) % SHOP.length; if (pressed(13)) G.shopFocus = (G.shopFocus + 1) % SHOP.length;
        if (pressed(0)) buy(SHOP[G.shopFocus].id); if (pressed(9)) startRun(); if (pressed(1)) UI.overlay = "options"; if (pressed(3)) UI.overlay = "help";
      } else if (G.scene === "end") { if (pressed(0) || pressed(9)) G.scene = "rig"; }
      else { if (pressed(12)) G.menuSel = (G.menuSel + UI.menu.length - 1) % (UI.menu.length || 1); if (pressed(13)) G.menuSel = (G.menuSel + 1) % (UI.menu.length || 1);
        if (pressed(0) || pressed(9)) { var act = UI.menu[G.menuSel] ? UI.menu[G.menuSel].act : "dive"; if (act === "dive") G.scene = "rig"; else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; } }
      for (var i = 0; i < b.length; i++) padPrev[i] = b[i] && b[i].pressed;
    }
  }

  // ---------------- loop ----------------
  var STEP = 1000 / 60, acc = 0, last = perfTime(), paused = false, frames = 0, fpsAt = last, fpsv = 0;
  function perfTime() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  window.addEventListener("blur", function () { paused = true; });
  window.addEventListener("focus", function () { paused = false; last = perfTime(); });
  document.addEventListener("visibilitychange", function () { paused = document.hidden; if (!paused) last = perfTime(); });
  function frame() {
    requestAnimationFrame(frame); var now = perfTime(); if (paused) { last = now; return; }
    acc += now - last; last = now; if (acc > 200) acc = 200; pollPad();
    while (acc >= STEP) { if (G) update(STEP); acc -= STEP; } render();
    if (dev) { frames++; if (now - fpsAt >= 500) { fpsv = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; document.getElementById("dev").textContent = fpsv + " fps  " + (G ? G.scene + " L" + G.layer + " hull" + Math.round(G.hull) : ""); } }
  }

  newRun(randomSeed()); resize(); requestAnimationFrame(frame);
  window.DREADNOUGHT = { G: function () { return G; }, newRun: newRun, startRun: startRun, drive: tryDrive, ping: ping, flagFaced: flagFaced, toggleLight: toggleLight, excavate: excavate, patch: patch, crank: crank, surface: surface, buy: buy, buyPlushie: buyPlushie, moveAnglers: moveAnglers, OPT: OPT };
})();
