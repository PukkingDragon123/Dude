/* DREADNOUGHT — game state, rules, input and rendering orchestration.
 * Depends (load order): strings.js, rng.js, data.js, audio.js, art.js. */
(function () {
  "use strict";
  var CFG = DN.CFG, CARDS = DN.CARDS, Art = DN.Art, Audio = DN.Audio, S = window.STR;
  var PAL = Art.PAL;

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

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    // low-res scene buffer
    SCALE = Math.max(2, Math.round(L.scene.w / 440));
    var bw = Math.max(160, Math.round(L.scene.w / SCALE)), bh = Math.max(120, Math.round(L.scene.h / SCALE));
    buf.width = bw; buf.height = bh;
    Art.rebake(bw, bh);
    seedParticles();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  // ---------------- layout ----------------
  var L = { scene: { x: 0, y: 0, w: 1, h: 1 }, sonar: { cx: 0, cy: 0, r: 1 }, cards: [], buttons: {}, detail: {} };
  function layout() {
    var portrait = H > W * 1.05;
    var topH = clamp(H * 0.11, 46, 74);
    var bottomH = portrait ? clamp(H * 0.26, 120, 210) : clamp(H * 0.27, 132, 196);
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.scene = { x: 0, y: topH, w: W, h: H - topH - bottomH };
    L.bottom = { x: 0, y: H - bottomH, w: W, h: bottomH };
    // sonar in scene (left in landscape, centered-upper in portrait)
    if (portrait) {
      L.sonar.r = Math.min(L.scene.h * 0.34, L.scene.w * 0.40);
      L.sonar.cx = L.scene.x + L.scene.w * 0.5;
      L.sonar.cy = L.scene.y + L.scene.h * 0.36;
      L.detail = { x: L.scene.x + 10, y: L.scene.y + L.scene.h * 0.66, w: L.scene.w - 20, h: L.scene.h * 0.32 };
      L.portrait = { cx: L.scene.x + L.scene.w * 0.5, cy: L.scene.y + L.scene.h * 0.36, s: L.sonar.r * 0.8 };
    } else {
      L.sonar.r = Math.min(L.scene.h * 0.42, L.scene.w * 0.24);
      L.sonar.cx = L.scene.x + L.scene.w * 0.27;
      L.sonar.cy = L.scene.y + L.scene.h * 0.52;
      L.detail = { x: L.scene.x + L.scene.w * 0.55, y: L.scene.y + 14, w: L.scene.w * 0.42, h: L.scene.h - 28 };
      L.portrait = { cx: L.detail.x + L.detail.w * 0.5, cy: L.detail.y + L.detail.h * 0.42, s: Math.min(L.detail.w * 0.42, L.detail.h * 0.34) };
    }
    // buttons (descend / hold) in bottom-right
    var bw = clamp(W * 0.17, 110, 190), bh2 = clamp(L.bottom.h * 0.34, 40, 60);
    L.buttons.descend = { x: W - bw - 12, y: L.bottom.y + 12, w: bw, h: bh2 };
    L.buttons.hold = { x: W - bw - 12, y: L.bottom.y + 12 + bh2 + 8, w: bw, h: bh2 };
    // cards row (fills remaining bottom width)
    var areaX = 12, areaW = (W - bw - 36) - areaX, n = CFG.handSize;
    var cw = clamp(areaW / n - 8, 64, 132), ch = clamp(L.bottom.h - 24, 96, 168);
    var gap = 8, totalW = n * cw + (n - 1) * gap, startX = areaX + Math.max(0, (areaW - totalW) / 2);
    L.cardSlot = { w: cw, h: ch, gap: gap, startX: startX, y: L.bottom.y + (L.bottom.h - ch) / 2 };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function cardRect(i) {
    var cs = L.cardSlot;
    return { x: cs.startX + i * (cs.w + cs.gap), y: cs.y, w: cs.w, h: cs.h };
  }

  // ---------------- game state ----------------
  var G = null;
  function newGame(seed) {
    var rng = new RNG(seed);
    G = {
      scene: "play", endKind: null, seed: rng.seedStr, rng: rng,
      band: 1, hull: CFG.startHull, oxygen: CFG.startOxygen, sanity: CFG.startSanity, power: CFG.powerPerTurn,
      deck: rng.shuffle(DN.START_DECK.slice()), hand: [], discard: [],
      contacts: [], selCard: -1, selContact: -1,
      log: [], loreSeen: [], pending: null,
      flash: 0, flashCol: "180,40,40", shake: 0, time: 0, idc: 1,
      music: "ambient", justBand: 0,
    };
    pushLog(S.log_dive_start);
    revealLore();
    genBand(1);
    drawTo(CFG.handSize);
    updateMusic();
  }

  function pushLog(msg) { G.log.push(msg); if (G.log.length > 24) G.log.shift(); }
  function fmt(t, o) { return t.replace(/\{(\w+)\}/g, function (m, k) { return o && o[k] != null ? o[k] : ""; }); }

  // ---------------- deck ----------------
  function drawOne() {
    if (!G.deck.length) {
      if (!G.discard.length) return false;
      G.deck = G.rng.shuffle(G.discard); G.discard = []; pushLog(S.log_reshuffle);
    }
    G.hand.push(G.deck.pop()); return true;
  }
  function drawTo(n) { var guard = 0; while (G.hand.length < n && guard++ < 99) { if (!drawOne()) break; } }
  function addCard(id) { G.discard.push(id); }

  // ---------------- band generation ----------------
  function genBand(b) {
    var cfg = DN.BANDS[b]; G.contacts = []; G.selContact = -1;
    if (cfg.floor) {
      G.contacts.push(makeCreature(3));
      pushLog(fmt(S.log_band_enter, { d: cfg.depth }));
      return;
    }
    var cats = [], cw = cfg.catW;
    for (var c in cw) for (var i = 0; i < cw[c]; i++) cats.push(c);
    var used = [];
    for (var n = 0; n < cfg.count; n++) {
      var cat = G.rng.pick(cats);
      var contact = cat === "creature" ? makeCreature(pickTier(cfg.cTier)) : makeNonCreature(cat);
      placeBlip(contact, used);
      G.contacts.push(contact);
    }
    // phantom at low sanity
    if (G.sanity < CFG.lowSanity && G.rng.chance(CFG.phantomChance)) {
      var ph = makeNonCreature(G.rng.pick(["anomaly", "creature", "wreck"]));
      ph.phantom = true; ph.name = S.unknown; placeBlip(ph, used); G.contacts.push(ph);
      pushLog(S.log_low_sanity);
    }
    pushLog(fmt(S.log_band_enter, { d: cfg.depth }));
  }
  function pickTier(tiers) { // weighted toward first listed
    var pool = []; for (var i = 0; i < tiers.length; i++) for (var w = 0; w < (tiers.length - i); w++) pool.push(tiers[i]);
    return G.rng.pick(pool);
  }
  function makeCreature(tier) {
    var def = G.rng.pick(DN.CONTACTS.creature[tier]);
    return { id: G.idc++, category: "creature", name: def.name, threat: tier, atk: def.atk, atkType: def.type,
      known: false, pinged: false, resolved: false, evaded: false, phantom: false, rewardTaken: false };
  }
  function makeNonCreature(cat) {
    var def = G.rng.pick(DN.CONTACTS[cat]);
    return { id: G.idc++, category: cat, name: def.name, threat: 0, atk: [0, 0], atkType: "hull",
      known: false, pinged: false, resolved: false, evaded: false, phantom: false, rewardTaken: false };
  }
  function placeBlip(c, used) {
    var tries = 0, a, d;
    do { a = G.rng.range(0, Math.PI * 2); d = G.rng.range(0.26, 0.92); tries++; }
    while (tries < 12 && tooClose(a, d, used));
    used.push([a, d]); c.angle = a; c.dist = d;
  }
  function tooClose(a, d, used) {
    for (var i = 0; i < used.length; i++) {
      var dx = Math.cos(a) * d - Math.cos(used[i][0]) * used[i][1];
      var dy = Math.sin(a) * d - Math.sin(used[i][0]) * used[i][1];
      if (Math.sqrt(dx * dx + dy * dy) < 0.18) return true;
    }
    return false;
  }

  // ---------------- rewards ----------------
  function grantReward(cat) {
    var table = DN.REWARDS[cat]; if (!table) return;
    var pick = G.rng.weighted(table.map(function (e) { return { w: e.w, value: e }; }));
    if (pick.type === "card") { addCard(pick.card); pushLog(fmt(S.log_reward_card, { name: CARDS[pick.card].name })); }
    else if (pick.type === "res") { changeStat(pick.stat, pick.amt); pushLog(pick.msg || ""); }
    else if (pick.type === "lore") { pushLog(revealLore()); }
  }
  function revealLore() {
    var idx = -1;
    for (var i = 0; i < DN.LORE.length; i++) if (G.loreSeen.indexOf(i) < 0) { idx = i; break; }
    if (idx < 0) idx = G.rng.int(0, DN.LORE.length - 1);
    if (G.loreSeen.indexOf(idx) < 0) G.loreSeen.push(idx);
    return DN.LORE[idx];
  }

  // ---------------- stats / death ----------------
  function changeStat(stat, amt) {
    if (stat === "hull") G.hull = clamp(G.hull + amt, 0, CFG.maxHull);
    else if (stat === "oxygen") G.oxygen = clamp(G.oxygen + amt, 0, CFG.maxOxygen);
    else if (stat === "sanity") G.sanity = clamp(G.sanity + amt, 0, CFG.maxSanity);
    if (amt < 0 && (stat === "hull")) { G.flash = 0.6; G.flashCol = "180,40,40"; if (OPT.shake) G.shake = 8; }
    if (amt < 0 && (stat === "sanity")) { G.flash = 0.45; G.flashCol = "120,40,160"; }
  }
  function checkDeath() {
    if (G.scene !== "play") return true;
    if (G.hull <= 0) return end("hull");
    if (G.oxygen <= 0) return end("oxygen");
    if (G.sanity <= 0) return end("sanity");
    return false;
  }
  function end(kind) {
    G.scene = "end"; G.endKind = kind;
    Audio.setMusic("none");
    if (kind === "win") Audio.win(); else Audio.lose();
    return true;
  }

  // ---------------- music ----------------
  function updateMusic() {
    var threat = DN.BANDS[G.band] && DN.BANDS[G.band].floor;
    for (var i = 0; i < G.contacts.length; i++) {
      var c = G.contacts[i];
      if (c.category === "creature" && !c.resolved && !c.phantom && (c.known || c.pinged) && c.threat >= 2) threat = true;
    }
    var want = threat ? "threat" : "ambient";
    if (want !== G.music) { G.music = want; Audio.setMusic(want); }
  }

  // ---------------- actions ----------------
  function contactHint(c) {
    if (!c) return "";
    if (c.phantom && c.resolved) return S.log_scan_phantom;
    if (c.known) {
      var cat = S["cat_" + c.category], th = c.threat >= 3 ? S.threat_t3 : c.threat === 2 ? S.threat_t2 : c.threat === 1 ? S.threat_t1 : S.threat_safe;
      var hint = cat + " — " + th + ".";
      if (c.resolved) hint += c.evaded ? " (evaded)" : " (resolved)";
      else if (c.category === "creature") hint += " EVADE or TORPEDO before you descend.";
      else if (c.category === "anomaly") hint += " INVESTIGATE for the deep — it costs the crew.";
      else hint += " INVESTIGATE to salvage.";
      return hint;
    }
    if (c.pinged) return S["cat_" + c.category] + " — " + S.unknown + ". SCAN to identify.";
    return S.unknown + " contact. PING or SCAN.";
  }

  function selectCard(i) {
    if (i < 0 || i >= G.hand.length) return;
    var def = CARDS[G.hand[i]];
    Audio.init();
    if (def.kind === "curse") { tryCurse(i); return; }
    if (def.target === "none") { playCard(i, -1); return; }
    G.selCard = (G.selCard === i) ? -1 : i; // toggle
  }
  function tryCurse(i) {
    if (G.power < 1) { pushLog(S.log_no_power); return; }
    G.power -= 1; G.discard.push(G.hand.splice(i, 1)[0]); Audio.card();
    pushLog("Forced the thought away. (−1 PWR)");
    if (G.selCard === i) G.selCard = -1; else if (G.selCard > i) G.selCard--;
  }

  function clickContact(ci) {
    if (ci < 0 || ci >= G.contacts.length) return;
    Audio.init();
    if (G.selCard >= 0 && CARDS[G.hand[G.selCard]].target === "contact") { playCard(G.selCard, ci); }
    else { G.selContact = ci; }
  }

  function playCard(i, ci) {
    if (i < 0 || i >= G.hand.length) return;
    var def = CARDS[G.hand[i]];
    if (def.kind === "curse") { tryCurse(i); return; }
    if (G.power < def.cost) { pushLog(S.log_no_power); return; }
    var contact = ci >= 0 ? G.contacts[ci] : null;
    if (def.target === "contact") {
      if (!contact) { return; }
      // validation per kind
      if ((def.kind === "evade" || def.kind === "kill") && contact.category !== "creature") { pushLog("That works only on a creature."); return; }
      if (contact.resolved) { pushLog("Already dealt with."); return; }
      if (def.kind === "investigate" && !contact.known && !contact.phantom && !G.pending) {
        G.pending = { kind: "blind", card: i, contact: ci }; return; // confirm modal
      }
    }
    // commit
    G.power -= def.cost;
    G.hand.splice(i, 1);
    if (!def.once) G.discard.push(def.id);
    G.selCard = -1;
    applyEffect(def, contact, ci);
    if (G.selContact >= G.contacts.length) G.selContact = -1;
    updateMusic();
    checkDeath();
  }

  function applyEffect(def, c, ci) {
    switch (def.kind) {
      case "ping":
        for (var i = 0; i < G.contacts.length; i++) G.contacts[i].pinged = true;
        Audio.ping(); pushLog(S.log_ping); break;
      case "scan":
        if (!c) break;
        if (c.phantom) { c.resolved = true; c.known = true; Audio.scan(); pushLog(S.log_scan_phantom); }
        else { c.known = true; c.pinged = true; Audio.scan();
          var th = c.threat >= 3 ? S.threat_t3 : c.threat === 2 ? S.threat_t2 : c.threat === 1 ? S.threat_t1 : S.threat_safe;
          pushLog(fmt(S.log_scan, { name: c.name, threat: (S["cat_" + c.category] + ", " + th) }));
          if (c.category === "creature" && c.threat >= 2) Audio.alert();
        }
        G.selContact = ci; break;
      case "reveal":
        for (var j = 0; j < G.contacts.length; j++) { if (G.contacts[j].phantom) { G.contacts[j].resolved = true; } G.contacts[j].known = true; G.contacts[j].pinged = true; }
        if (def.sanityCost) changeStat("sanity", -def.sanityCost);
        Audio.scan(); pushLog(S.log_reveal_all); if (def.lore) pushLog(revealLore()); break;
      case "investigate":
        if (!c) break;
        if (c.phantom) { c.resolved = true; Audio.scan(); pushLog(S.log_scan_phantom); break; }
        pushLog(fmt(S.log_investigate, { name: c.name }));
        if (c.category === "creature") { creatureStrike(c, " as you close in"); /* not resolved: punished */ }
        else { if (DN.INVESTIGATE_SANITY[c.category]) changeStat("sanity", -DN.INVESTIGATE_SANITY[c.category]);
          grantReward(c.category); c.resolved = true; c.rewardTaken = true; Audio.good(); }
        break;
      case "evade":
        if (!c) break; c.evaded = true; c.resolved = true; Audio.vent(); pushLog(fmt(S.log_evade, { name: c.name })); break;
      case "kill":
        if (!c) break; c.resolved = true; c.evaded = true; Audio.damage(); pushLog("Torpedo away. " + c.name + " is destroyed."); break;
      case "hull": changeStat("hull", def.amount); Audio.good(); pushLog(S.log_brace); break;
      case "oxygen": changeStat("oxygen", def.amount); Audio.vent(); pushLog(S.log_vent); break;
      case "sanity": changeStat("sanity", def.amount); Audio.good(); pushLog(S.log_steady); break;
      case "power": G.power += def.amount; Audio.card(); pushLog("Adrenaline floods the crew. +" + def.amount + " PWR."); break;
      case "freedescend": G.freeDescend = true; Audio.card(); pushLog("Old charts unrolled. The next dive costs no air."); break;
    }
  }

  function creatureStrike(c, suffix) {
    var dmg = G.rng.int(c.atk[0], c.atk[1]);
    changeStat(c.atkType === "sanity" ? "sanity" : "hull", -dmg);
    Audio.roar();
    pushLog(fmt(S.log_creature_attack, { name: c.name }) + (suffix || "") + " (−" + dmg + " " + (c.atkType === "sanity" ? S.hud_sanity : S.hud_hull) + ")");
  }

  function doHold() {
    if (G.scene !== "play") return; Audio.init();
    G.selCard = -1;
    changeStat("oxygen", -CFG.holdOxygen);
    // anomalies drain
    for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i];
      if (c.category === "anomaly" && !c.resolved && !c.phantom) changeStat("sanity", -DN.ANOMALY_DRAIN); }
    // curses in hand bite
    for (var h = 0; h < G.hand.length; h++) if (CARDS[G.hand[h]].kind === "curse") changeStat("sanity", -1);
    if (anomalyPresent()) pushLog(S.log_anomaly_drain);
    G.power = CFG.powerPerTurn; drawTo(CFG.handSize);
    Audio.vent(); updateMusic(); checkDeath();
  }
  function anomalyPresent() { for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i]; if (c.category === "anomaly" && !c.resolved && !c.phantom) return true; } return false; }

  function doDescend() {
    if (G.scene !== "play") return; Audio.init();
    G.selCard = -1;
    var floor = DN.BANDS[G.band] && DN.BANDS[G.band].floor;
    // un-evaded creatures strike
    var struck = false;
    for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i];
      if (c.category === "creature" && !c.resolved && !c.evaded && !c.phantom) { creatureStrike(c, " as the Dreadnought dives"); struck = true; if (checkDeath()) return; } }
    if (floor) { // breaching the source
      if (!checkDeath()) end("win");
      return;
    }
    if (!G.freeDescend) changeStat("oxygen", -CFG.descendOxygen); else { G.freeDescend = false; pushLog("Old charts guide the dive — no air spent."); }
    Audio.descend(); if (OPT.shake) G.shake = 5;
    pushLog(S.log_descend);
    G.band++; G.justBand = 1.2;
    if ([2, 4, 6, 7].indexOf(G.band) >= 0) pushLog(revealLore());
    genBand(G.band);
    G.power = CFG.powerPerTurn; drawTo(CFG.handSize);
    updateMusic(); checkDeath();
  }

  // ---------------- particles (marine snow, buffer space) ----------------
  var snow = [];
  function seedParticles() {
    snow = []; var n = 70;
    for (var i = 0; i < n; i++) snow.push({ x: Math.random() * buf.width, y: Math.random() * buf.height, s: 0.4 + Math.random() * 1.2, v: 0.1 + Math.random() * 0.4 });
  }
  function stepParticles(dt) {
    for (var i = 0; i < snow.length; i++) { var p = snow[i]; p.y += p.v * dt * 0.06 * p.s; p.x += Math.sin((p.y + i) * 0.02) * 0.04 * dt;
      if (p.y > buf.height) { p.y = -2; p.x = Math.random() * buf.width; } }
  }
  function drawParticles(c) {
    c.fillStyle = "rgba(170,210,200,0.5)";
    for (var i = 0; i < snow.length; i++) { var p = snow[i]; c.globalAlpha = 0.15 + p.s * 0.18; c.fillRect(p.x, p.y, p.s, p.s); }
    c.globalAlpha = 1;
  }

  // ---------------- update loop ----------------
  function update(dt) {
    G.time += dt / 1000;
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 600);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 60);
    if (G.justBand > 0) G.justBand = Math.max(0, G.justBand - dt / 1000);
    stepParticles(dt);
  }

  // ---------------- render ----------------
  function depthT() { var cfg = DN.BANDS[G.band]; return clamp((cfg ? cfg.depth : 0) / 6400, 0, 1); }

  function renderScene() {
    var bw = buf.width, bh = buf.height;
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawWater(bctx, bw, bh, depthT());
    drawParticles(bctx);
    // sonar in buffer space
    var sx = (L.sonar.cx - L.scene.x) / SCALE, sy = (L.sonar.cy - L.scene.y) / SCALE, sr = L.sonar.r / SCALE;
    var sweep = G.time * 1.1 % (Math.PI * 2);
    Art.drawSonar(bctx, sx, sy, sr, { time: G.time, sweep: sweep, sanity: G.sanity / CFG.maxSanity, contacts: scopeContacts() });
    // portrait of selected/known contact
    var sel = G.selContact >= 0 ? G.contacts[G.selContact] : null;
    if (sel && (sel.known || sel.phantom && sel.resolved)) {
      var px = (L.portrait.cx - L.scene.x) / SCALE, py = (L.portrait.cy - L.scene.y) / SCALE, ps = L.portrait.s / SCALE;
      if (!(sel.phantom)) Art.drawPortrait(bctx, px, py, ps, sel, G.time);
    }
    // cockpit frame over the viewport
    var inset = Math.max(8, Math.round(10 / SCALE) + 6);
    Art.drawCockpit(bctx, bw, bh, { x: inset, y: inset, w: bw - inset * 2, h: bh - inset * 2 });
  }
  function scopeContacts() {
    var out = [];
    for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i];
      out.push({ angle: c.angle, dist: c.dist, known: c.known, category: c.category, threat: c.threat,
        phantom: c.phantom, resolved: c.resolved, selected: i === G.selContact }); }
    return out;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#04060a"; ctx.fillRect(0, 0, W, H);
    if (G && G.scene === "play") return renderPlay();
    if (G && G.scene === "end") return renderEnd();
    if (UI.scene === "help") return renderHelp();
    if (UI.scene === "options") return renderOptions();
    return renderTitle();
  }

  function renderPlay() {
    // scene buffer (low-res crunch) -> display
    renderScene();
    var shx = G.shake ? (Math.random() - 0.5) * G.shake : 0, shy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, L.scene.x + shx, L.scene.y + shy, L.scene.w, L.scene.h);
    // ---- crisp UI ----
    drawTopBar();
    drawDetail();
    drawLog();
    drawHand();
    // buttons
    var floor = DN.BANDS[G.band] && DN.BANDS[G.band].floor;
    Art.button(ctx, L.buttons.descend, floor ? "BREACH SOURCE" : S.hud_descend, { primary: true, hover: UI.hover === "descend" });
    Art.button(ctx, L.buttons.hold, S.hud_endturn, { hover: UI.hover === "hold" });
    if (G.pending) drawConfirm();
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, sanity: G.sanity / CFG.maxSanity, flash: G.flash, flashCol: G.flashCol });
  }

  function drawTopBar() {
    ctx.fillStyle = PAL.panel; ctx.fillRect(0, 0, W, L.top.h);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, L.top.h - 3, W, 3);
    var pad = 10, gw = clamp((W - 220) / 3, 90, 240), gh = clamp(L.top.h - 14, 30, 50), y = 7;
    Art.gauge(ctx, { x: pad, y: y, w: gw, h: gh }, S.hud_hull, G.hull, CFG.maxHull, "hull");
    Art.gauge(ctx, { x: pad + gw + 8, y: y, w: gw, h: gh }, S.hud_oxygen, G.oxygen, CFG.maxOxygen, "oxygen");
    Art.gauge(ctx, { x: pad + (gw + 8) * 2, y: y, w: gw, h: gh }, S.hud_sanity, G.sanity, CFG.maxSanity, "sanity");
    // power pips + depth (right)
    var px = pad + (gw + 8) * 3 + 6;
    Art.text(ctx, S.hud_power, px, y + gh * 0.45, Math.round(gh * 0.34), PAL.textDim, "left");
    for (var i = 0; i < Math.max(G.power, CFG.powerPerTurn); i++) {
      var on = i < G.power; ctx.beginPath(); ctx.arc(px + 40 + i * 16, y + gh * 0.4, 6, 0, 7);
      ctx.fillStyle = on ? PAL.amberHi : "#2a2410"; ctx.fill(); ctx.strokeStyle = PAL.amberLo; ctx.lineWidth = 1; ctx.stroke();
    }
    var cfg = DN.BANDS[G.band];
    Art.text(ctx, S.hud_depth + " " + (cfg ? cfg.depth : 0) + S.hud_meters, W - 12, y + gh * 0.42, Math.round(gh * 0.36), PAL.amber, "right");
    Art.text(ctx, S.hud_band + " " + G.band + "/" + CFG.bands + "   " + S.hud_deck + " " + G.deck.length + "  " + S.hud_discard + " " + G.discard.length,
      W - 12, y + gh * 0.92, Math.round(gh * 0.30), PAL.textDim, "right");
  }

  function drawDetail() {
    var d = L.detail;
    var sel = G.selContact >= 0 ? G.contacts[G.selContact] : null;
    // panel backing (semi)
    ctx.fillStyle = "rgba(8,12,18,0.45)"; Art.rrect(ctx, d.x, d.y, d.w, d.h, 6); ctx.fill();
    ctx.strokeStyle = "rgba(90,100,114,0.5)"; ctx.lineWidth = 1; Art.rrect(ctx, d.x, d.y, d.w, d.h, 6); ctx.stroke();
    var fs = clamp(d.w * 0.05, 11, 17) * OPT.textScale;
    if (sel) {
      var nm = sel.known ? sel.name : (sel.pinged ? S["cat_" + sel.category] : S.unknown);
      Art.text(ctx, nm.toUpperCase(), d.x + 12, d.y + d.h - fs * 3.4, fs, sel.known ? Art.catColor(sel.category, sel.threat) : PAL.amber, "left");
      Art.wrapText(ctx, contactHint(sel), d.x + d.w / 2, d.y + d.h - fs * 1.9, d.w - 20, fs * 0.82, PAL.text);
    } else {
      var left = CFG.bands - G.band;
      var obj = DN.BANDS[G.band] && DN.BANDS[G.band].floor ? "You have reached the source. Breach it — if the crew dares." :
        "Descend to the source. " + left + " zone" + (left === 1 ? "" : "s") + " below. Select a contact to inspect.";
      Art.wrapText(ctx, obj, d.x + d.w / 2, d.y + d.h - fs * 2.2, d.w - 20, fs * 0.9, PAL.textDim);
    }
  }

  function drawLog() {
    var n = 3, fs = clamp(L.scene.w * 0.016, 10, 14) * OPT.textScale;
    var x = L.scene.x + 16, y0 = L.scene.y + L.scene.h - 12;
    for (var i = 0; i < n; i++) { var idx = G.log.length - 1 - i; if (idx < 0) break;
      ctx.globalAlpha = 1 - i * 0.3; Art.text(ctx, "› " + G.log[idx], x, y0 - i * (fs + 3), fs, i === 0 ? PAL.phosHi : PAL.textDim, "left", "bold"); }
    ctx.globalAlpha = 1;
  }

  function drawHand() {
    UI.cardHit = [];
    for (var i = 0; i < G.hand.length; i++) {
      var r = cardRect(i), def = CARDS[G.hand[i]];
      var playable = def.kind === "curse" ? G.power >= 1 : G.power >= def.cost;
      var opts = { playable: playable, disabled: !playable, hover: UI.hover === "card" + i, selected: G.selCard === i };
      Art.card(ctx, r, def, opts);
      UI.cardHit.push({ r: r, i: i });
    }
  }

  function drawConfirm() {
    ctx.fillStyle = "rgba(2,4,8,0.7)"; ctx.fillRect(0, 0, W, H);
    var bw = clamp(W * 0.6, 280, 460), bh = 170, x = (W - bw) / 2, y = (H - bh) / 2;
    ctx.fillStyle = PAL.panel; Art.rrect(ctx, x, y, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = PAL.blood; ctx.lineWidth = 2; Art.rrect(ctx, x, y, bw, bh, 8); ctx.stroke();
    Art.text(ctx, S.confirm_blind, x + bw / 2, y + 44, 18, PAL.bloodHi, "center");
    Art.wrapText(ctx, "An unscanned contact could be anything. The deep does not forgive guesses.", x + bw / 2, y + 74, bw - 36, 13, PAL.textDim);
    var bwid = (bw - 48) / 2;
    UI.confirmYes = { x: x + 16, y: y + bh - 58, w: bwid, h: 42 };
    UI.confirmNo = { x: x + bw - 16 - bwid, y: y + bh - 58, w: bwid, h: 42 };
    Art.button(ctx, UI.confirmYes, S.yes, { primary: true, hover: UI.hover === "cyes" });
    Art.button(ctx, UI.confirmNo, S.no, { hover: UI.hover === "cno" });
  }

  // ---------------- title / help / options / end ----------------
  function renderTitle() {
    renderSceneBackground(0.55);
    var cy = H * 0.30;
    ctx.textAlign = "center";
    Art.text(ctx, S.title, W / 2, cy, clamp(W * 0.11, 38, 96), PAL.phosHi, "center");
    Art.text(ctx, S.subtitle.toUpperCase(), W / 2, cy + clamp(W * 0.04, 18, 34), clamp(W * 0.022, 12, 22), PAL.bio, "center");
    Art.text(ctx, S.tagline, W / 2, cy + clamp(W * 0.07, 34, 60), clamp(W * 0.016, 10, 16), PAL.textDim, "center");
    UI.menu = []; var bw = clamp(W * 0.4, 220, 340), bh = clamp(H * 0.075, 44, 62), bx = (W - bw) / 2, by = H * 0.5, gap = 14;
    var labels = [[S.menu_dive, "dive", true], [S.menu_help, "help", false], [S.menu_options, "options", false]];
    for (var i = 0; i < labels.length; i++) { var r = { x: bx, y: by + i * (bh + gap), w: bw, h: bh };
      Art.button(ctx, r, labels[i][0], { primary: labels[i][2], hover: UI.hover === "m" + i }); UI.menu.push({ r: r, act: labels[i][1] }); }
    Art.text(ctx, S.menu_seed + ": " + UI.seed, W / 2, by + 3 * (bh + gap) + 24, 14, PAL.amber, "center");
    Art.text(ctx, "tap SEED to reroll", W / 2, by + 3 * (bh + gap) + 42, 11, PAL.textDim, "center");
    UI.seedHit = { x: W / 2 - 90, y: by + 3 * (bh + gap) + 8, w: 180, h: 26 };
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderSceneBackground(t) {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawTitle(bctx, bw, bh, G ? G.time : (perfTime() / 1000)); drawParticles(bctx);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, L.scene.x, L.scene.y, L.scene.w, L.scene.h);
    // also fill top/bottom bands with water tint for full-screen feel
    ctx.drawImage(buf, 0, 0, bw, 6, 0, 0, W, L.scene.y + 2);
    ctx.drawImage(buf, 0, bh - 6, bw, 6, 0, L.scene.y + L.scene.h - 2, W, H - (L.scene.y + L.scene.h) + 2);
  }
  function renderHelp() {
    renderSceneBackground(0.5);
    var x = clamp(W * 0.1, 20, 200), y = clamp(H * 0.12, 40, 120), w = W - x * 2;
    Art.text(ctx, S.help_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var fs = clamp(W * 0.018, 12, 18) * OPT.textScale, yy = y + fs * 2.4;
    for (var i = 0; i < S.help_lines.length; i++) yy += Art.wrapText(ctx, "• " + S.help_lines[i], W / 2, yy, w, fs, PAL.text) * (fs + 4) + 6;
    yy += 6; Art.wrapText(ctx, S.help_controls, W / 2, yy, w, fs * 0.92, PAL.amber);
    UI.backBtn = { x: W / 2 - 90, y: H - clamp(H * 0.12, 56, 110), w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderOptions() {
    renderSceneBackground(0.5);
    var y = clamp(H * 0.16, 50, 140);
    Art.text(ctx, S.options_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var rows = [[S.opt_sound, "sound"], [S.opt_shake, "shake"], [S.opt_scanlines, "scanlines"]];
    UI.optHit = []; var rw = clamp(W * 0.6, 280, 460), rx = (W - rw) / 2, rh = 54, ry = y + 40;
    for (var i = 0; i < rows.length; i++) { var r = { x: rx, y: ry + i * (rh + 12), w: rw, h: rh };
      ctx.fillStyle = "rgba(10,14,20,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
      ctx.strokeStyle = "rgba(90,100,114,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      Art.text(ctx, rows[i][0], r.x + 14, r.y + r.h / 2 + 6, 16, PAL.text, "left");
      var on = OPT[rows[i][1]]; var tr = { x: r.x + r.w - 86, y: r.y + 11, w: 72, h: 32 };
      Art.button(ctx, tr, on ? S.opt_on : S.opt_off, { primary: on });
      UI.optHit.push({ r: tr, key: rows[i][1] });
    }
    UI.backBtn = { x: W / 2 - 90, y: ry + rows.length * (rh + 12) + 16, w: 180, h: 48 };
    Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines });
  }
  function renderEnd() {
    renderScene(); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, L.scene.x, L.scene.y, L.scene.w, L.scene.h);
    ctx.fillStyle = "rgba(2,4,8,0.78)"; ctx.fillRect(0, 0, W, H);
    var win = G.endKind === "win";
    var title = win ? S.win_title : G.endKind === "hull" ? S.lose_hull : G.endKind === "oxygen" ? S.lose_oxygen : S.lose_sanity;
    var body = win ? S.win_body : G.endKind === "hull" ? S.lose_hull_body : G.endKind === "oxygen" ? S.lose_oxygen_body : S.lose_sanity_body;
    var y = clamp(H * 0.22, 70, 200);
    Art.text(ctx, title, W / 2, y, clamp(W * 0.06, 30, 60), win ? PAL.bioHi : PAL.bloodHi, "center");
    Art.wrapText(ctx, body, W / 2, y + clamp(W * 0.05, 34, 56), clamp(W * 0.7, 280, 720), clamp(W * 0.018, 13, 19) * OPT.textScale, PAL.text);
    Art.text(ctx, S.hud_depth + " " + (DN.BANDS[G.band] ? DN.BANDS[G.band].depth : 0) + S.hud_meters + "   ·   " + S.menu_seed + " " + G.seed,
      W / 2, y + clamp(W * 0.05, 34, 56) + 110, 13, PAL.textDim, "center");
    Art.text(ctx, "Lore recovered: " + G.loreSeen.length + "/" + DN.LORE.length, W / 2, y + clamp(W * 0.05, 34, 56) + 132, 13, PAL.amber, "center");
    UI.againBtn = { x: W / 2 - 110, y: H - clamp(H * 0.18, 90, 150), w: 220, h: 54 };
    Art.button(ctx, UI.againBtn, S.again, { primary: true, hover: UI.hover === "again" });
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, flash: 0 });
  }

  // ---------------- input ----------------
  var UI = { scene: "title", hover: null, seed: randomSeed(), cardHit: [], menu: [], optHit: [] };

  function pt(e) {
    var rect = canvas.getBoundingClientRect();
    var src = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function inside(r, p) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function onDown(p) {
    Audio.init();
    if (G && G.scene === "play") return onPlayDown(p);
    if (G && G.scene === "end") { if (inside(UI.againBtn, p)) { UI.scene = "title"; newGame(UI.seed); } return; }
    if (UI.scene === "help" || UI.scene === "options") {
      if (UI.scene === "options" && UI.optHit) for (var i = 0; i < UI.optHit.length; i++) if (inside(UI.optHit[i].r, p)) { OPT[UI.optHit[i].key] = !OPT[UI.optHit[i].key]; saveOpt(); Audio.setEnabled(OPT.sound); Audio.card(); return; }
      if (inside(UI.backBtn, p)) { UI.scene = "title"; Audio.card(); } return;
    }
    // title
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) {
      var act = UI.menu[m].act; Audio.card();
      if (act === "dive") { UI.scene = "play"; newGame(UI.seed); }
      else if (act === "help") UI.scene = "help";
      else if (act === "options") UI.scene = "options";
      return;
    }
    if (inside(UI.seedHit, p)) { UI.seed = randomSeed(); Audio.card(); }
  }

  function onPlayDown(p) {
    if (G.pending) {
      if (inside(UI.confirmYes, p)) { var pc = G.pending; G.pending = null; var ci = pc.contact; // force investigate
          G.power -= CARDS[G.hand[pc.card]] ? CARDS[G.hand[pc.card]].cost : 0; var def = CARDS[G.hand[pc.card]];
          G.hand.splice(pc.card, 1); if (!def.once) G.discard.push(def.id); G.selCard = -1; applyEffect(def, G.contacts[ci], ci); updateMusic(); checkDeath(); }
      else if (inside(UI.confirmNo, p)) { G.pending = null; }
      return;
    }
    if (inside(L.buttons.descend, p)) { doDescend(); return; }
    if (inside(L.buttons.hold, p)) { doHold(); return; }
    for (var i = 0; i < UI.cardHit.length; i++) if (inside(UI.cardHit[i].r, p)) { selectCard(UI.cardHit[i].i); return; }
    // contacts on sonar (display space)
    var hit = pickContact(p); if (hit >= 0) { clickContact(hit); return; }
    // tapping empty scene deselects card
    if (inside(L.scene, p)) { G.selCard = -1; }
  }

  function pickContact(p) {
    var best = -1, bestD = 18;
    for (var i = 0; i < G.contacts.length; i++) { var c = G.contacts[i];
      var x = L.sonar.cx + Math.cos(c.angle) * c.dist * L.sonar.r, y = L.sonar.cy + Math.sin(c.angle) * c.dist * L.sonar.r;
      var d = Math.hypot(p.x - x, p.y - y); if (d < bestD) { bestD = d; best = i; } }
    return best;
  }

  function onMove(p) {
    UI.hover = null;
    if (G && G.scene === "play") {
      if (inside(L.buttons.descend, p)) UI.hover = "descend";
      else if (inside(L.buttons.hold, p)) UI.hover = "hold";
      else if (G.pending && inside(UI.confirmYes, p)) UI.hover = "cyes";
      else if (G.pending && inside(UI.confirmNo, p)) UI.hover = "cno";
      else for (var i = 0; i < UI.cardHit.length; i++) if (inside(UI.cardHit[i].r, p)) { UI.hover = "card" + UI.cardHit[i].i; break; }
      return;
    }
    if (G && G.scene === "end") { if (inside(UI.againBtn, p)) UI.hover = "again"; return; }
    if (UI.scene === "help" || UI.scene === "options") { if (inside(UI.backBtn, p)) UI.hover = "back"; return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) UI.hover = "m" + m;
  }

  canvas.addEventListener("mousedown", function (e) { onDown(pt(e)); });
  canvas.addEventListener("mousemove", function (e) { onMove(pt(e)); });
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); onDown(pt(e)); }, { passive: false });
  canvas.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

  // keyboard (physical codes)
  window.addEventListener("keydown", function (e) {
    var code = e.code;
    if (G && G.scene === "play") {
      if (code.indexOf("Digit") === 0) { var n = parseInt(code.slice(5), 10) - 1; if (n >= 0 && n < G.hand.length) { selectCard(n); e.preventDefault(); } return; }
      if (code === "KeyD") { doDescend(); e.preventDefault(); }
      else if (code === "Space") { doHold(); e.preventDefault(); }
      else if (code === "KeyH") { /* in-play briefing toggle */ }
      else if (code === "ArrowRight" || code === "ArrowLeft") { cycleContact(code === "ArrowRight" ? 1 : -1); e.preventDefault(); }
      else if (code === "Enter") { if (G.selCard >= 0 && G.selContact >= 0) clickContact(G.selContact); e.preventDefault(); }
      else if (code === "Escape") { G.selCard = -1; G.pending = null; }
    } else if (G && G.scene === "end") { if (code === "Space" || code === "Enter") { UI.scene = "title"; newGame(UI.seed); } }
    else { if (code === "Enter" || code === "Space") { UI.scene = "play"; newGame(UI.seed); e.preventDefault(); }
      else if (code === "KeyH") UI.scene = "help"; else if (code === "Escape") UI.scene = "title"; }
  });
  function cycleContact(dir) {
    var n = G.contacts.length; if (!n) return;
    var i = G.selContact; for (var k = 0; k < n; k++) { i = (i + dir + n) % n; if (!G.contacts[i].resolved) { G.selContact = i; return; } }
    G.selContact = (G.selContact + dir + n) % n;
  }

  // gamepad
  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var g = 0; g < pads.length; g++) { var gp = pads[g]; if (!gp) continue;
      var b = gp.buttons; function pressed(i) { return b[i] && b[i].pressed && !padPrev[i]; }
      if (G && G.scene === "play") {
        if (pressed(15)) cycleContact(1); if (pressed(14)) cycleContact(-1);
        if (pressed(0)) { if (G.pending) { G.pending = null; } else if (G.selCard >= 0 && G.selContact >= 0) clickContact(G.selContact); else if (G.selContact >= 0) clickContact(G.selContact); }
        if (pressed(1)) { G.selCard = -1; G.pending = null; }
        if (pressed(3)) doHold(); if (pressed(2)) doDescend();
        if (pressed(12)) selectCard((G.selCard + 1) % Math.max(1, G.hand.length));
        if (pressed(13)) selectCard((G.selCard <= 0 ? G.hand.length - 1 : G.selCard - 1));
      } else if (pressed(0) || pressed(9)) { if (G && G.scene === "end") { UI.scene = "title"; newGame(UI.seed); } else { UI.scene = "play"; newGame(UI.seed); } }
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
    var now = perfTime();
    if (paused) { last = now; return; }
    acc += now - last; last = now;
    if (acc > 200) acc = 200;
    pollPad();
    while (acc >= STEP) { if (G && (G.scene === "play")) update(STEP); else if (G) G.time += STEP / 1000; acc -= STEP; }
    render();
    if (dev) { frames++; if (now - fpsAt >= 500) { fpsv = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now;
      document.getElementById("dev").textContent = fpsv + " fps  " + buf.width + "x" + buf.height + "  c:" + (G ? G.contacts.length : 0); } }
  }
  // boot
  resize();
  requestAnimationFrame(frame);

  // expose for debugging
  window.DREADNOUGHT = { G: function () { return G; }, newGame: newGame, OPT: OPT };
})();
