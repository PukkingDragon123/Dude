/* DREADNOUGHT v3 — Iron-Lung-style deep-sea horror.
 * Trapped in a tiny sub in the black. Navigate by RADAR: ping to classify contacts,
 * thrust through 3D water toward loot, peek with the headlight, avoid the things below.
 * Depends (load order): strings.js, rng.js, data.js, audio.js, art.js. No shop, no upgrades. */
(function () {
  "use strict";
  var CFG = DN.CFG, LOOT = DN.LOOT, MON = DN.MONSTERS, SPAWN = DN.SPAWN, LORE = DN.LORE;
  var Art = DN.Art, Audio = DN.Audio, S = window.STR, PAL = Art.PAL;

  // ---------------- options ----------------
  var OPT = { sound: true, shake: true, scanlines: true };
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
    SCALE = Math.max(2, Math.round(L.scene.w / 460));
    var bw = Math.max(180, Math.round(L.scene.w / SCALE)), bh = Math.max(120, Math.round(L.scene.h / SCALE));
    buf.width = bw; buf.height = bh; Art.rebake(bw, bh);
  }
  window.addEventListener("resize", resize); window.addEventListener("orientationchange", resize);

  // ---------------- layout ----------------
  var L = { scene: {}, top: {}, bottom: {}, btn: {} };
  function layout() {
    var portrait = H > W * 1.04;
    var topH = clamp(H * 0.10, 42, 64);
    var bottomH = portrait ? clamp(H * 0.30, 165, 300) : clamp(H * 0.30, 150, 232);
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.scene = { x: 0, y: topH, w: W, h: H - topH - bottomH };
    L.bottom = { x: 0, y: H - bottomH, w: W, h: bottomH };
    // radar scope, bottom-left
    var rsz = Math.min(L.bottom.h * 0.46, L.bottom.w * 0.20);
    L.radar = { cx: L.bottom.x + rsz + 14, cy: L.bottom.y + L.bottom.h * 0.5, r: rsz };
    // drive cluster bottom-right
    var bs = clamp(L.bottom.h * 0.30, 42, 66);
    var rEdge = W - 12, driveW = clamp(W * 0.30, 150, 300);
    L.btn.thrust = { x: rEdge - driveW, y: L.bottom.y + 12, w: driveW, h: bs };
    L.btn.left = { x: rEdge - driveW, y: L.bottom.y + 12 + bs + 8, w: driveW * 0.48, h: bs };
    L.btn.right = { x: rEdge - driveW * 0.48, y: L.bottom.y + 12 + bs + 8, w: driveW * 0.48, h: bs };
    // ping / light, center
    var cx0 = L.radar.cx + L.radar.r + 16, cw = clamp(W * 0.18, 96, 168);
    if (cx0 + cw > L.btn.thrust.x - 8) cw = Math.max(80, L.btn.thrust.x - 8 - cx0);
    L.btn.ping = { x: cx0, y: L.bottom.y + 12, w: cw, h: bs };
    L.btn.light = { x: cx0, y: L.bottom.y + 12 + bs + 8, w: cw, h: bs };
    L.btn.brief = { x: cx0, y: L.bottom.y + 12 + (bs + 8) * 2, w: cw, h: clamp(bs * 0.6, 26, 38) };
  }
  function inside(r, p) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  // ---------------- state ----------------
  var G = null;
  function newRun(seed) {
    var rng = new RNG(seed);
    G = {
      scene: "titlemenu", seedStr: rng.seedStr, rng: rng, idc: 1, time: 0,
      x: 0, z: 0, heading: 0, vel: 0, depth: 0,
      hull: CFG.startHull, oxygen: CFG.startOxygen, threat: 0, haul: 0,
      lightOn: false, contacts: [], snow: [],
      sourceSpawned: false, log: [], loreSeen: [], lastLoreDepth: 0,
      sweep: 0, pingFlash: 0, flash: 0, flashCol: "180,40,40", shake: 0,
      heartbeat: 0, hbT: 0, woke: false, endKind: null, won: false,
      menuSel: 0, padActive: false,
    };
  }
  function pushLog(m) { if (!m) return; G.log.push(m); if (G.log.length > 18) G.log.shift(); }
  function fmt(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, key) { return o && o[key] != null ? o[key] : ""; }); }
  function revealLore() { for (var i = 0; i < LORE.length; i++) if (G.loreSeen.indexOf(i) < 0) { G.loreSeen.push(i); return LORE[i]; } return ""; }

  function startDive() {
    G.x = 0; G.z = 0; G.heading = 0; G.vel = 0; G.depth = 0;
    G.hull = CFG.startHull; G.oxygen = CFG.startOxygen; G.threat = 0; G.haul = 0;
    G.lightOn = false; G.contacts = []; G.sourceSpawned = false; G.woke = false;
    G.log = []; G.endKind = null; G.won = false; G.lastLoreDepth = 0;
    G.snow = []; for (var i = 0; i < 150; i++) G.snow.push(newSnow(true));
    for (var c = 0; c < CFG.targetContacts; c++) spawnContact();
    G.scene = "dive"; pushLog(S.log_dive); pushLog(revealLore());
    Audio.setMusic("ambient");
  }
  function newSnow(initial) {
    var rz = initial ? G.rng.range(1, 42) : G.rng.range(30, 46);
    return { rx: G.rng.range(-22, 22), ry: G.rng.range(-16, 16), rz: rz };
  }

  // ---------------- spawn ----------------
  function spawnTable() { var t = SPAWN[0]; for (var i = 0; i < SPAWN.length; i++) if (G.depth >= SPAWN[i].depth) t = SPAWN[i]; return t; }
  function spawnContact(forceLoot) {
    var tbl = spawnTable();
    var bearing = G.heading + G.rng.range(-1.15, 1.15);
    var dist = G.rng.range(CFG.maxRadar * 0.72, CFG.maxRadar * 1.04);
    var c = { id: G.idc++, x: G.x + Math.sin(bearing) * dist, z: G.z + Math.cos(bearing) * dist, vy: G.rng.range(-4, 4), known: false, alive: true };
    if (!forceLoot && G.rng.chance(tbl.monsterChance)) {
      c.type = "monster"; c.monId = G.rng.pick(tbl.monsters); c.hunting = false; c.struck = 0;
    } else {
      c.type = "loot"; var lk = G.rng.pick(tbl.loot);
      if (LOOT[lk].deep && G.depth < LOOT[lk].deep) lk = "data";
      c.lootId = lk; c.kind = LOOT[lk].kind;
      c.value = LOOT[lk].value ? G.rng.int(LOOT[lk].value[0], LOOT[lk].value[1]) : 0;
      c.o2 = LOOT[lk].o2 || 0;
    }
    G.contacts.push(c);
  }
  function spawnSource() {
    var dist = CFG.maxRadar * 0.9;
    G.contacts.push({ id: G.idc++, type: "loot", kind: "source", lootId: "source", x: G.x + Math.sin(G.heading) * dist, z: G.z + Math.cos(G.heading) * dist, vy: 0, known: true, alive: true, value: 0, source: true });
    G.sourceSpawned = true; pushLog(S.log_source_near); Audio.setMusic("threat");
  }

  // ---------------- relative geometry ----------------
  function rel(c) {
    var dx = c.x - G.x, dz = c.z - G.z;
    var sh = Math.sin(G.heading), ch = Math.cos(G.heading);
    return { rx: dx * ch - dz * sh, rz: dx * sh + dz * ch, range: Math.sqrt(dx * dx + dz * dz) };
  }

  // ---------------- actions ----------------
  function ping() {
    if (G.scene !== "dive") return; Audio.init();
    G.threat = clamp(G.threat + CFG.pingThreat, 0, 100); G.pingFlash = 1; G.sweep = 0;
    var n = 0; for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i]; if (rel(c).range <= CFG.maxRadar) { c.known = true; n++; } }
    Audio.ping(); pushLog(S.log_ping); pushLog(fmt(S.log_classify, { n: n }));
    if (G.threat >= CFG.panicThreat) { wakeAll(); pushLog(S.log_panic); }
  }
  function toggleLight() { if (G.scene !== "dive") return; Audio.init(); G.lightOn = !G.lightOn; pushLog(G.lightOn ? S.log_light_on : S.log_light_off); Audio.vent(); }
  function wakeNearest() {
    var best = null, bd = 1e9; for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i]; if (c.type === "monster" && !c.hunting) { var d = rel(c).range; if (d < bd) { bd = d; best = c; } } }
    if (best) { best.hunting = true; if (!G.woke) { G.woke = true; pushLog(S.log_wake); Audio.alert(); } }
  }
  function wakeAll() { for (var i = 0; i < G.contacts.length; i++) if (G.contacts[i].type === "monster") G.contacts[i].hunting = true; if (!G.woke) { G.woke = true; Audio.alert(); } }

  // ---------------- update ----------------
  function update(dt) {
    G.time += dt / 1000; var s = dt / 1000;
    if (G.pingFlash > 0) G.pingFlash = Math.max(0, G.pingFlash - s * 1.4);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 600);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 60);
    G.sweep = (G.sweep + s * 2.2) % (Math.PI * 2);
    if (G.scene !== "dive") return;

    // --- controls -> motion ---
    var h = controls();
    var dHead = 0;
    if (h.left) dHead -= CFG.turnSpeed * s; if (h.right) dHead += CFG.turnSpeed * s;
    G.heading += dHead;
    var targetVel = h.thrust ? CFG.speed : (h.reverse ? -CFG.speed * CFG.reverseFrac : 0);
    G.vel += (targetVel - G.vel) * Math.min(1, s * 3.5);
    if (Math.abs(G.vel) < 0.02) G.vel = 0;
    var fwd = G.vel * s;
    G.x += Math.sin(G.heading) * fwd; G.z += Math.cos(G.heading) * fwd;
    if (fwd > 0) G.depth += fwd * CFG.depthPerUnit;

    // --- snow (relative frustum) ---
    var cdh = Math.cos(-dHead), sdh = Math.sin(-dHead);
    for (var i = 0; i < G.snow.length; i++) {
      var p = G.snow[i];
      var nrx = p.rx * cdh - p.rz * sdh, nrz = p.rx * sdh + p.rz * cdh; p.rx = nrx; p.rz = nrz;
      p.rz -= fwd;
      if (p.rz < 0.5 || p.rz > 52 || Math.abs(p.rx) > 40) { var ns = newSnow(false); p.rx = ns.rx; p.ry = ns.ry; p.rz = ns.rz; }
    }

    // --- air clock ---
    G.oxygen -= CFG.oxygenDrain * s;
    if (G.oxygen <= 0) { G.oxygen = 0; pushLog(S.log_no_air); return end("oxygen"); }

    // --- threat ---
    var add = 0; if (G.lightOn) add += CFG.lightThreat * s; if (h.thrust || h.reverse) add += CFG.moveThreat * s;
    G.threat = clamp(G.threat + add - CFG.threatDecay * s, 0, 100);
    if (G.threat >= CFG.wakeThreat) wakeNearest();
    if (G.threat >= CFG.panicThreat) wakeAll();

    // --- contacts: monster AI, proximity, collect ---
    var nearestMon = 1e9;
    for (var c = 0; c < G.contacts.length; c++) {
      var k = G.contacts[c]; if (!k.alive) continue; var r = rel(k);
      if (k.type === "monster") {
        if (k.hunting) { var ux = (G.x - k.x) / (r.range || 1), uz = (G.z - k.z) / (r.range || 1); var ms = CFG.speed * CFG.monsterHuntSpeed * s; k.x += ux * ms; k.z += uz * ms; }
        if (r.range < nearestMon) nearestMon = r.range;
        if (k.struck > 0) k.struck -= s;
        if (r.range < CFG.collectRange && k.struck <= 0) { strike(k); k.struck = 1.4; }
      } else {
        if (r.range < CFG.collectRange) { collect(k); }
        else if (k.source && r.range < CFG.collectRange * 1.4) { collect(k); }
      }
    }
    G.heartbeat = nearestMon < 26 ? clamp(1 - nearestMon / 26, 0, 1) : 0;
    heartbeatAudio(dt);

    // --- despawn behind / far, keep field populated ---
    for (var d = G.contacts.length - 1; d >= 0; d--) { var cc = G.contacts[d]; var rr = rel(cc);
      if (!cc.alive || (!cc.source && (rr.rz < -CFG.maxRadar * 0.5 || rr.range > CFG.maxRadar * 1.5))) G.contacts.splice(d, 1); }
    var live = 0; for (var e = 0; e < G.contacts.length; e++) if (G.contacts[e].type !== "monster" || !G.contacts[e].hunting) live++;
    while (G.contacts.length < CFG.targetContacts) spawnContact();

    // --- source / depth lore ---
    if (!G.sourceSpawned && G.depth >= CFG.sourceDepth) spawnSource();
    if (G.depth - G.lastLoreDepth > 420) { G.lastLoreDepth = G.depth; pushLog(revealLore()); }

    // --- music ---
    var wantThreat = G.threat >= CFG.wakeThreat || G.heartbeat > 0.3 || G.sourceSpawned;
    if (Audio._which !== (wantThreat ? "threat" : "ambient")) Audio.setMusic(wantThreat ? "threat" : "ambient");
  }

  function heartbeatAudio(dt) {
    if (G.heartbeat <= 0.05) { G.hbT = 0; return; }
    var interval = 1.1 - G.heartbeat * 0.7; G.hbT -= dt / 1000;
    if (G.hbT <= 0) { G.hbT = interval; Audio.heartbeat ? Audio.heartbeat(G.heartbeat) : Audio.alert(); if (OPT.shake) G.shake = Math.max(G.shake, G.heartbeat * 3); }
  }

  function strike(k) {
    var def = MON[k.monId];
    var dmg = G.rng.int(def.dmg[0], def.dmg[1]);
    G.hull = clamp(G.hull - dmg, 0, CFG.maxHull);
    G.flash = 0.7; G.flashCol = "180,40,40"; if (OPT.shake) G.shake = def.tier >= 3 ? 14 : 9;
    Audio.roar(); Audio.damage(); pushLog(fmt(S.log_strike, { name: def.name, dmg: dmg }));
    G.encounter = { shape: def.shape, name: def.name, until: G.time + 1.8 };
    // shove the sub back a little
    G.x -= Math.sin(G.heading) * 3; G.z -= Math.cos(G.heading) * 3;
    if (G.hull <= 0) end("hull");
  }
  function collect(k) {
    k.alive = false;
    if (k.source) { winRun(); return; }
    if (k.kind === "vent") { G.oxygen = clamp(G.oxygen + k.o2, 0, CFG.startOxygen); pushLog(fmt(S.log_collect_vent, { o2: k.o2 })); Audio.vent(); G.flash = 0.25; G.flashCol = "40,240,170"; }
    else if (k.kind === "artifact") { G.haul += k.value; pushLog(fmt(S.log_collect_art, { name: LOOT[k.lootId].name, v: k.value })); Audio.good(); G.flash = 0.3; G.flashCol = "70,240,200"; }
    else { G.haul += k.value; pushLog(fmt(S.log_collect_data, { v: k.value })); Audio.scan(); }
  }
  function end(kind) { if (G.scene === "end") return true; G.scene = "end"; G.endKind = kind; G.won = false; Audio.setMusic("none"); Audio.lose(); return true; }
  function winRun() { G.scene = "end"; G.endKind = "win"; G.won = true; Audio.setMusic("none"); Audio.win(); }

  // ---------------- render ----------------
  function render() {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#020407"; ctx.fillRect(0, 0, W, H);
    if (!G) return;
    if (UI.overlay === "help") return renderHelp();
    if (UI.overlay === "options") return renderOptions();
    if (G.scene === "dive") return renderDive();
    if (G.scene === "end") return renderEnd();
    return renderTitle();
  }

  function renderForwardBuffer() {
    var bw = buf.width, bh = buf.height;
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    var fc = []; for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i]; if (!c.alive) continue; var r = rel(c); if (r.rz <= 0.6) continue;
      fc.push({ rx: r.rx, ry: c.vy, rz: r.rz, isMonster: c.type === "monster", monShape: c.monId ? MON[c.monId].shape : null, kind: c.kind }); }
    Art.drawForward(bctx, bw, bh, { contacts: fc, snow: G.snow, lightOn: G.lightOn, threat: G.threat / 100, time: G.time, fov: CFG.fov, headlightRange: CFG.headlightRange });
    var inset = Math.max(6, Math.round(8 / SCALE) + 4);
    Art.drawCockpit(bctx, bw, bh, { x: inset, y: inset, w: bw - inset * 2, h: bh - inset * 2 });
  }

  function renderDive() {
    renderForwardBuffer();
    var shx = G.shake ? (Math.random() - 0.5) * G.shake : 0, shy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, L.scene.x + shx, L.scene.y + shy, L.scene.w, L.scene.h);
    drawTopBar();
    drawRadar();
    drawControls();
    if (G.encounter && G.time < G.encounter.until) drawEncounter();
    // horror tint when something is close
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, sanity: 1 - G.heartbeat * 0.7, flash: G.flash, flashCol: G.flashCol });
    if (G.heartbeat > 0.25) { ctx.fillStyle = "rgba(150,20,30," + (G.heartbeat * 0.18).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
  }

  function drawTopBar() {
    ctx.fillStyle = PAL.panel; ctx.fillRect(0, 0, W, L.top.h);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, L.top.h - 3, W, 3);
    var pad = 10, gw = clamp((W - 250) / 3, 78, 210), gh = clamp(L.top.h - 14, 26, 46), y = 7;
    Art.gauge(ctx, { x: pad, y: y, w: gw, h: gh }, S.hud_hull, G.hull, CFG.maxHull, "hull");
    Art.gauge(ctx, { x: pad + gw + 8, y: y, w: gw, h: gh }, S.hud_oxygen, G.oxygen, CFG.startOxygen, "oxygen");
    Art.gauge(ctx, { x: pad + (gw + 8) * 2, y: y, w: gw, h: gh }, S.hud_threat, G.threat, 100, G.threat >= CFG.wakeThreat ? "hull" : "sanity");
    Art.text(ctx, S.hud_depth + " " + Math.floor(G.depth) + S.hud_meters, W - 12, y + gh * 0.42, Math.round(gh * 0.42), PAL.amberHi, "right");
    Art.text(ctx, S.hud_haul + " ₽" + G.haul, W - 12, y + gh * 0.92, Math.round(gh * 0.34), PAL.bioHi, "right");
  }

  function drawRadar() {
    var rr = L.radar;
    var contacts = [];
    for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i]; if (!c.alive) continue; var r = rel(c); if (r.range > CFG.maxRadar) continue;
      var bearing = Math.atan2(r.rx, r.rz);
      contacts.push({ angle: bearing - Math.PI / 2, dist: clamp(r.range / CFG.maxRadar, 0, 1),
        known: c.known, category: c.type === "monster" ? "creature" : c.kind === "vent" ? "artifact" : c.kind === "source" ? "anomaly" : "wreck",
        threat: c.type === "monster" ? (MON[c.monId].tier >= 3 ? 3 : 2) : 0, phantom: false, resolved: !c.known && false, selected: false }); }
    Art.drawSonar(ctx, rr.cx, rr.cy, rr.r, { time: G.time, sweep: G.sweep, sanity: 1 - G.threat / 160, contacts: contacts });
    Art.text(ctx, "RADAR", rr.cx, rr.cy + rr.r + 14, 11, PAL.textDim, "center");
  }

  function drawControls() {
    var h = controls();
    Art.button(ctx, L.btn.thrust, S.btn_thrust + (G.vel > 0.1 ? " ▲" : ""), { primary: h.thrust, hover: UI.hover === "thrust" });
    Art.button(ctx, L.btn.left, S.btn_left, { primary: h.left, hover: UI.hover === "left" });
    Art.button(ctx, L.btn.right, S.btn_right, { primary: h.right, hover: UI.hover === "right" });
    Art.button(ctx, L.btn.ping, S.btn_ping, { primary: G.pingFlash > 0.4, hover: UI.hover === "ping" });
    Art.button(ctx, L.btn.light, S.btn_light + (G.lightOn ? " •" : ""), { primary: G.lightOn, hover: UI.hover === "light" });
    Art.button(ctx, L.btn.brief, S.menu_help, { hover: UI.hover === "brief" });
    // a log line above the controls
    var idx = G.log.length - 1; if (idx >= 0) Art.text(ctx, "› " + G.log[idx], L.radar.cx + L.radar.r + 16, L.bottom.y + L.bottom.h - 8, clamp(W * 0.016, 10, 14), PAL.phosHi, "left");
  }

  function drawEncounter() {
    var alpha = clamp((G.encounter.until - G.time) / 1.8, 0, 1);
    ctx.save(); ctx.globalAlpha = Math.min(1, alpha * 2);
    Art.text(ctx, G.encounter.name.toUpperCase(), W / 2, L.scene.y + L.scene.h * 0.5, clamp(W * 0.05, 22, 46), PAL.bloodHi, "center");
    ctx.restore();
  }

  function renderSceneBackground() {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawTitle(bctx, bw, bh, G ? G.time : 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W, H);
  }
  function renderTitle() {
    renderSceneBackground();
    var cy = H * 0.28; Art.text(ctx, S.title, W / 2, cy, clamp(W * 0.11, 38, 96), PAL.phosHi, "center");
    Art.text(ctx, S.subtitle.toUpperCase(), W / 2, cy + clamp(W * 0.04, 18, 34), clamp(W * 0.022, 12, 22), PAL.bio, "center");
    Art.text(ctx, S.tagline, W / 2, cy + clamp(W * 0.066, 30, 56), clamp(W * 0.016, 10, 16), PAL.textDim, "center");
    UI.menu = []; var bw = clamp(W * 0.4, 220, 340), bh = clamp(H * 0.075, 44, 62), bx = (W - bw) / 2, by = H * 0.5, gap = 14;
    var labels = [[S.menu_dive, "dive", true], [S.menu_help, "help", false], [S.menu_options, "options", false]];
    for (var i = 0; i < labels.length; i++) { var r = { x: bx, y: by + i * (bh + gap), w: bw, h: bh }; Art.button(ctx, r, labels[i][0], { primary: labels[i][2], hover: UI.hover === "m" + i || (G.padActive && G.menuSel === i) }); UI.menu.push({ r: r, act: labels[i][1] }); }
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderHelp() {
    renderSceneBackground();
    var x = clamp(W * 0.1, 20, 200), y = clamp(H * 0.09, 36, 100), w = W - x * 2;
    Art.text(ctx, S.help_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var fs = clamp(W * 0.016, 11, 16), yy = y + fs * 2.4;
    for (var i = 0; i < S.help_lines.length; i++) yy += Art.wrapText(ctx, "• " + S.help_lines[i], W / 2, yy, w, fs, PAL.text) * (fs + 4) + 6;
    yy += 6; Art.wrapText(ctx, S.help_controls, W / 2, yy, w, fs * 0.92, PAL.amber);
    UI.backBtn = { x: W / 2 - 90, y: H - clamp(H * 0.12, 56, 110), w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderOptions() {
    renderSceneBackground();
    var y = clamp(H * 0.16, 50, 140); Art.text(ctx, S.options_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var rows = [[S.opt_sound, "sound"], [S.opt_shake, "shake"], [S.opt_scanlines, "scanlines"]];
    UI.optHit = []; var rw = clamp(W * 0.6, 280, 460), rx = (W - rw) / 2, rh = 54, ry = y + 40;
    for (var i = 0; i < rows.length; i++) { var r = { x: rx, y: ry + i * (rh + 12), w: rw, h: rh };
      ctx.fillStyle = "rgba(10,14,20,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.strokeStyle = "rgba(90,100,114,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      Art.text(ctx, rows[i][0], r.x + 14, r.y + r.h / 2 + 6, 16, PAL.text, "left");
      var on = OPT[rows[i][1]], tr = { x: r.x + r.w - 86, y: r.y + 11, w: 72, h: 32 }; Art.button(ctx, tr, on ? S.opt_on : S.opt_off, { primary: on }); UI.optHit.push({ r: tr, key: rows[i][1] }); }
    UI.backBtn = { x: W / 2 - 90, y: ry + rows.length * (rh + 12) + 16, w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderEnd() {
    renderSceneBackground(); ctx.fillStyle = "rgba(2,4,8,0.74)"; ctx.fillRect(0, 0, W, H);
    var win = G.won; var title = win ? S.win_title : G.endKind === "hull" ? S.lose_hull : S.lose_oxygen;
    var body = win ? S.win_body : G.endKind === "hull" ? S.lose_hull_body : S.lose_oxygen_body;
    var y = clamp(H * 0.2, 70, 190); Art.text(ctx, title, W / 2, y, clamp(W * 0.06, 28, 56), win ? PAL.bioHi : PAL.bloodHi, "center");
    Art.wrapText(ctx, body, W / 2, y + clamp(W * 0.05, 34, 56), clamp(W * 0.7, 280, 720), clamp(W * 0.018, 13, 19), PAL.text);
    Art.text(ctx, fmt(S.end_depth, { d: Math.floor(G.depth), haul: G.haul }), W / 2, y + clamp(W * 0.05, 34, 56) + 104, 14, PAL.amber, "center");
    Art.text(ctx, "Lore recovered: " + G.loreSeen.length + "/" + LORE.length, W / 2, y + clamp(W * 0.05, 34, 56) + 126, 13, PAL.textDim, "center");
    UI.contBtn = { x: W / 2 - 120, y: H - clamp(H * 0.16, 84, 140), w: 240, h: 52 };
    Art.button(ctx, UI.contBtn, S.again, { primary: true, hover: UI.hover === "cont" }); Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }

  // ---------------- input ----------------
  var UI = { overlay: null, hover: null, menu: [], optHit: [] };
  var kb = { thrust: false, reverse: false, left: false, right: false };
  var pad = { thrust: false, reverse: false, left: false, right: false };
  var pointers = {}; // id -> {x,y}
  function controls() {
    var ptrHeld = { thrust: false, reverse: false, left: false, right: false };
    for (var id in pointers) { var p = pointers[id];
      if (inside(L.btn.thrust, p)) ptrHeld.thrust = true; if (inside(L.btn.left, p)) ptrHeld.left = true; if (inside(L.btn.right, p)) ptrHeld.right = true; }
    return { thrust: kb.thrust || pad.thrust || ptrHeld.thrust, reverse: kb.reverse || pad.reverse || ptrHeld.reverse,
      left: kb.left || pad.left || ptrHeld.left, right: kb.right || pad.right || ptrHeld.right };
  }
  function pt(e) { var rect = canvas.getBoundingClientRect(); var s = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e; return { x: s.clientX - rect.left, y: s.clientY - rect.top }; }

  function tapAt(p) { // discrete buttons; returns true if handled
    if (!G) return false; Audio.init();
    if (UI.overlay) { if (UI.overlay === "options" && UI.optHit) for (var i = 0; i < UI.optHit.length; i++) if (inside(UI.optHit[i].r, p)) { OPT[UI.optHit[i].key] = !OPT[UI.optHit[i].key]; saveOpt(); Audio.setEnabled(OPT.sound); Audio.card(); return true; } if (inside(UI.backBtn, p)) { UI.overlay = null; Audio.card(); } return true; }
    if (G.scene === "dive") {
      if (inside(L.btn.ping, p)) { ping(); return true; }
      if (inside(L.btn.light, p)) { toggleLight(); return true; }
      if (inside(L.btn.brief, p)) { UI.overlay = "help"; return true; }
      return false; // thrust/turn handled as holds
    }
    if (G.scene === "end") { if (inside(UI.contBtn, p)) { Audio.card(); startDive(); } return true; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) { var act = UI.menu[m].act; Audio.card(); if (act === "dive") startDive(); else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; return true; }
    return true;
  }

  canvas.addEventListener("mousedown", function (e) { pointers["m"] = pt(e); tapAt(pt(e)); });
  canvas.addEventListener("mousemove", function (e) { var p = pt(e); if (pointers["m"]) pointers["m"] = p; onHover(p); });
  window.addEventListener("mouseup", function () { delete pointers["m"]; });
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) { var tt = e.changedTouches[i]; var p = ptTouch(tt); pointers[tt.identifier] = p; tapAt(p); } }, { passive: false });
  canvas.addEventListener("touchmove", function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) { var tt = e.changedTouches[i]; if (pointers[tt.identifier]) pointers[tt.identifier] = ptTouch(tt); } }, { passive: false });
  canvas.addEventListener("touchend", function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) delete pointers[e.changedTouches[i].identifier]; }, { passive: false });
  canvas.addEventListener("touchcancel", function (e) { for (var i = 0; i < e.changedTouches.length; i++) delete pointers[e.changedTouches[i].identifier]; });
  function ptTouch(tt) { var rect = canvas.getBoundingClientRect(); return { x: tt.clientX - rect.left, y: tt.clientY - rect.top }; }
  function onHover(p) { UI.hover = null; if (!G) return;
    if (UI.overlay) { if (inside(UI.backBtn, p)) UI.hover = "back"; return; }
    if (G.scene === "dive") { var b = L.btn; if (inside(b.thrust, p)) UI.hover = "thrust"; else if (inside(b.left, p)) UI.hover = "left"; else if (inside(b.right, p)) UI.hover = "right"; else if (inside(b.ping, p)) UI.hover = "ping"; else if (inside(b.light, p)) UI.hover = "light"; else if (inside(b.brief, p)) UI.hover = "brief"; return; }
    if (G.scene === "end") { if (inside(UI.contBtn, p)) UI.hover = "cont"; return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) UI.hover = "m" + m;
  }

  window.addEventListener("keydown", function (e) {
    var code = e.code; if (!G) return;
    if (UI.overlay) { if (code === "Escape" || code === "Enter" || code === "Space" || code === "KeyH") { UI.overlay = null; e.preventDefault(); } return; }
    if (code === "KeyH") { UI.overlay = "help"; e.preventDefault(); return; }
    if (G.scene === "dive") {
      if (code === "KeyW" || code === "ArrowUp") { kb.thrust = true; e.preventDefault(); }
      else if (code === "KeyS" || code === "ArrowDown") { kb.reverse = true; e.preventDefault(); }
      else if (code === "KeyA" || code === "ArrowLeft") { kb.left = true; e.preventDefault(); }
      else if (code === "KeyD" || code === "ArrowRight") { kb.right = true; e.preventDefault(); }
      else if (code === "Space") { ping(); e.preventDefault(); }
      else if (code === "KeyL") { toggleLight(); e.preventDefault(); }
      else if (code === "Escape") { UI.overlay = "options"; }
    } else if (G.scene === "end") { if (code === "Enter" || code === "Space") { startDive(); e.preventDefault(); } }
    else { if (code === "Enter" || code === "Space") { startDive(); e.preventDefault(); } }
  });
  window.addEventListener("keyup", function (e) {
    var code = e.code;
    if (code === "KeyW" || code === "ArrowUp") kb.thrust = false;
    else if (code === "KeyS" || code === "ArrowDown") kb.reverse = false;
    else if (code === "KeyA" || code === "ArrowLeft") kb.left = false;
    else if (code === "KeyD" || code === "ArrowRight") kb.right = false;
  });

  // gamepad
  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : []; if (!G) return;
    for (var g = 0; g < pads.length; g++) { var gp = pads[g]; if (!gp) continue; var b = gp.buttons, ax = gp.axes || []; G.padActive = true;
      function pressed(i) { return b[i] && b[i].pressed && !padPrev[i]; }
      var ly = ax[1] || 0, lx = ax[0] || 0;
      pad.thrust = (b[12] && b[12].pressed) || ly < -0.4;
      pad.reverse = (b[13] && b[13].pressed) || ly > 0.5;
      pad.left = (b[14] && b[14].pressed) || lx < -0.4;
      pad.right = (b[15] && b[15].pressed) || lx > 0.4;
      if (UI.overlay) { if (pressed(0) || pressed(1) || pressed(9)) UI.overlay = null; }
      else if (G.scene === "dive") { if (pressed(0)) ping(); if (pressed(2)) toggleLight(); if (pressed(3) || pressed(9)) UI.overlay = "help"; }
      else if (G.scene === "end") { if (pressed(0) || pressed(9)) startDive(); }
      else { if (pressed(12)) G.menuSel = (G.menuSel + UI.menu.length - 1) % (UI.menu.length || 1); if (pressed(13)) G.menuSel = (G.menuSel + 1) % (UI.menu.length || 1);
        if (pressed(0) || pressed(9)) { var act = UI.menu[G.menuSel] ? UI.menu[G.menuSel].act : "dive"; if (act === "dive") startDive(); else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; } }
      for (var i = 0; i < b.length; i++) padPrev[i] = b[i] && b[i].pressed;
    }
  }

  // ---------------- loop ----------------
  var STEP = 1000 / 60, acc = 0, last = perfTime(), paused = false, frames = 0, fpsAt = last, fpsv = 0;
  function perfTime() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  window.addEventListener("blur", function () { paused = true; for (var key in kb) kb[key] = false; });
  window.addEventListener("focus", function () { paused = false; last = perfTime(); });
  document.addEventListener("visibilitychange", function () { paused = document.hidden; if (!paused) last = perfTime(); });
  function frame() {
    requestAnimationFrame(frame);
    var now = perfTime(); if (paused) { last = now; return; }
    acc += now - last; last = now; if (acc > 200) acc = 200;
    pollPad();
    while (acc >= STEP) { if (G) update(STEP); acc -= STEP; }
    render();
    if (dev) { frames++; if (now - fpsAt >= 500) { fpsv = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; document.getElementById("dev").textContent = fpsv + " fps  " + (G ? G.scene + " d" + Math.floor(G.depth) + " c" + G.contacts.length : ""); } }
  }

  newRun(randomSeed());
  resize();
  requestAnimationFrame(frame);
  window.DREADNOUGHT = { G: function () { return G; }, newRun: newRun, startDive: startDive, ping: ping, toggleLight: toggleLight, OPT: OPT,
    setHeld: function (o) { for (var key in o) kb[key] = o[key]; } };
})();
