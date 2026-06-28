/* DREADNOUGHT v4 — Minesweeper-deduction fused into first-person submarine navigation.
 * The CRT monitor is a top-down sonar grid; the sub is one cell. Drive (W/A/S/D) to move —
 * entering a cell reveals it (numbers = adjacent monsters). PING reveals numbers in a cone.
 * Drive into a monster = jumpscare + hull breach; hull shows as the cabin FLOODING. No text HUD.
 * Depends (load order): strings.js, rng.js, data.js, audio.js, art.js. */
(function () {
  "use strict";
  var CFG = DN.CFG, LAYERS = DN.LAYERS, MON = DN.MONSTERS, LOOT = DN.LOOT, LORE = DN.LORE, RADIO = DN.RADIO;
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
    computeStationAnchors();
  }
  function inside(r, p) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function dpadRects() { var s = L.dpad.s, cx = L.dpad.cx, cy = L.dpad.cy; return {
    up: { x: cx - s / 2, y: cy - s * 1.5, w: s, h: s }, down: { x: cx - s / 2, y: cy + s / 2, w: s, h: s },
    left: { x: cx - s * 1.5, y: cy - s / 2, w: s, h: s }, right: { x: cx + s / 2, y: cy - s / 2, w: s, h: s } }; }

  // ---------------- 3D CABIN: look-around camera + diegetic UI stations ----------------
  // The dive scene is a cylindrical submarine tube you look around in. Each UI panel is a "station"
  // anchored in tube-space; camProject() maps an anchor to an axis-aligned screen rect (translate +
  // uniform scale, NO skew) so the existing rect-based hit-testing stays exact. layoutStations()
  // rewrites L.* once per render frame from the projected anchors; input reads L.* (never re-projects).
  var FOV = 1.16;
  // station rest framing: fx,fy = rest screen position (fraction of W,H); z = tube depth; pw/ph = rest
  // size (fraction of W,H); pr = radius / ps = cell size (fraction of min(W,H)). Anchors keep the
  // familiar layout at rest (window top, monitor centre, instruments left, controls bottom).
  var STA = {
    window:  { fx: 0.575, fy: 0.27, pw: 0.56, ph: 0.34, z: 1.70 },
    monitor: { fx: 0.575, fy: 0.635, pw: 0.56, ph: 0.34, z: 1.30 },
    tank:    { fx: 0.072, fy: 0.39, pw: 0.085, ph: 0.44, z: 1.10 },
    depth:   { fx: 0.085, fy: 0.83, pr: 0.052, z: 1.05 },
    bank:    { fx: 0.255, fy: 0.905, pw: 0.42, ph: 0.135, z: 1.02 },
    dpad:    { fx: 0.865, fy: 0.90, ps: 0.05, z: 1.02 },
    valve:   { fx: 0.935, fy: 0.55, pr: 0.075, z: 0.98 },
    brief:   { fx: 0.965, fy: 0.09, pw: 0.05, ph: 0.06, z: 1.45 }
  };
  function computeStationAnchors() { // back out tube-space anchors from the rest screen framing (aspect-robust)
    var focal = (W * 0.5) / Math.tan(FOV / 2), m = Math.min(W, H);
    var small = m < 760; // phones / small tablets -> bigger fingertip controls
    STA.dpad.ps = small ? 0.085 : 0.05; STA.bank.ph = small ? 0.175 : 0.135; STA.valve.pr = small ? 0.095 : 0.075;
    STA.brief.pw = small ? 0.07 : 0.05; STA.brief.ph = small ? 0.085 : 0.06;
    for (var k in STA) { var S = STA[k]; var sx = S.fx * W, sy = S.fy * H, z = S.z;
      S.a = [(sx - W / 2) * z / focal, (H / 2 - sy) * z / focal, z]; S.restScale = focal / z;
      S.rw = (S.pw || 0) * W; S.rh = (S.ph || 0) * H; S.rr = (S.pr || 0) * m; S.rsz = (S.ps || 0) * m; }
  }
  // project a tube-space anchor through the look camera (inverse-camera rotation -> correct parallax)
  function camProject(ax, ay, az) {
    var c = G.cam, yaw = c.yaw + c._swayY, pitch = c.pitch + c._swayP;
    var cyw = Math.cos(yaw), syw = Math.sin(yaw);
    var x = ax * cyw - az * syw, z = ax * syw + az * cyw;          // yaw about Y (look right -> world slides left)
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y = ay * cp + z * sp; z = -ay * sp + z * cp;                // pitch about X (look down -> forward rises)
    if (z < 0.06) return { visible: false, z: z };
    var focal = (W * 0.5) / Math.tan(FOV / 2), f = focal / z;
    return { visible: true, sx: W / 2 + x * f, sy: H / 2 - y * f, scale: f, z: z };
  }
  var OFF = { x: -99999, y: -99999, w: 0, h: 0 };
  function layoutStations() {
    var c = G.cam;
    c._swayY = 0; c._swayP = 0; // FIXED camera: no breathing sway, no look-around — the view never moves
    for (var k in STA) { var S = STA[k]; var pr = camProject(S.a[0], S.a[1], S.a[2]); S.scr = pr; S.mul = pr.visible ? pr.scale / S.restScale : 0; }
    function rectOf(S) { if (!S.scr.visible) return { x: OFF.x, y: OFF.y, w: 0, h: 0 }; var w = S.rw * S.mul, h = S.rh * S.mul; return { x: S.scr.sx - w / 2, y: S.scr.sy - h / 2, w: w, h: h }; }
    L.porthole = rectOf(STA.window);
    // monitor: clamp on-screen width so minesweeper cells stay tappable
    var mr = rectOf(STA.monitor);
    if (mr.w > 4) { var cw = clamp(mr.w, W * 0.30, W * 0.94), f2 = cw / mr.w; var ncx = mr.x + mr.w / 2, ncy = mr.y + mr.h / 2; mr = { x: ncx - cw / 2, y: ncy - mr.h * f2 / 2, w: cw, h: mr.h * f2 }; }
    L.monitor = mr;
    L.tank = rectOf(STA.tank);
    L.depth = STA.depth.scr.visible ? { cx: STA.depth.scr.sx, cy: STA.depth.scr.sy, r: STA.depth.rr * STA.depth.mul } : { cx: OFF.x, cy: OFF.y, r: 1 };
    // button bank -> 2x2 (ping/light | secure/patch)
    var b = rectOf(STA.bank), sc = STA.bank.mul || 0, gap = 7 * sc;
    if (b.w > 4) { var bw2 = (b.w - gap) / 2, bh2 = (b.h - gap) / 2;
      L.btn.ping = { x: b.x, y: b.y, w: bw2, h: bh2 };
      L.btn.light = { x: b.x, y: b.y + bh2 + gap, w: bw2, h: bh2 };
      L.btn.excavate = { x: b.x + bw2 + gap, y: b.y, w: bw2, h: bh2 };
      L.btn.patch = { x: b.x + bw2 + gap, y: b.y + bh2 + gap, w: bw2, h: bh2 };
    } else { L.btn.ping = L.btn.light = L.btn.excavate = L.btn.patch = OFF; }
    // crank = the valve wheel (hit rect = wheel bbox)
    if (STA.valve.scr.visible) { var vr = STA.valve.rr * STA.valve.mul, vc = STA.valve.scr; L.btn.crank = { x: vc.sx - vr, y: vc.sy - vr, w: 2 * vr, h: 2 * vr }; } else L.btn.crank = OFF;
    L.btn.brief = rectOf(STA.brief);
    L.dpad = STA.dpad.scr.visible ? { cx: STA.dpad.scr.sx, cy: STA.dpad.scr.sy, s: STA.dpad.rsz * STA.dpad.mul } : { cx: OFF.x, cy: OFF.y, s: 1 };
  }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  // ---------------- cinematic timeline (intro cutscene + descent + reveal) ----------------
  function easeInOut(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function easeIn(x) { x = clamp(x, 0, 1); return x * x * x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function camAt(keys, t) { if (t <= keys[0].t) return keys[0];
    for (var i = 0; i < keys.length - 1; i++) { var a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) { var u = (b.t - a.t) > 0 ? (t - a.t) / (b.t - a.t) : 1, e = (b.ease || easeInOut)(u);
        return { eye: lerp3(a.eye, b.eye, e), tgt: lerp3(a.tgt, b.tgt, e), fov: lerp(a.fov, b.fov, e), roll: lerp(a.roll || 0, b.roll || 0, e) }; } }
    return keys[keys.length - 1]; }
  function makeCam(eye, tgt, fov, roll, w, h) { var d = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
    var yaw = Math.atan2(d[0], d[2]), pitch = -Math.atan2(d[1], Math.sqrt(d[0] * d[0] + d[2] * d[2])), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0), focal = (w * 0.5) / Math.tan((fov || 1.2) / 2);
    return function (p) { var rx = p[0] - eye[0], ry = p[1] - eye[1], rz = p[2] - eye[2];
      var cy = Math.cos(-yaw), sy = Math.sin(-yaw), x = rx * cy + rz * sy, z = -rx * sy + rz * cy, cp = Math.cos(-pitch), sp = Math.sin(-pitch), y = ry * cp - z * sp; z = ry * sp + z * cp;
      if (z < 0.05) return { v: false, z: z }; var f = focal / z, sx = x * f, sy2 = -y * f, rxp = sx * cr - sy2 * sr, ryp = sx * sr + sy2 * cr;
      return { v: true, x: w / 2 + rxp, y: h / 2 + ryp, z: z, s: f }; }; }
  function cineStart(o) { G.cine = { keys: o.keys, beats: (o.beats || []).map(function (b) { return { t: b.t, fn: b.fn, done: false }; }), t: 0, dur: o.dur, onEnd: o.onEnd, skip: o.skippable !== false }; }
  function cineUpdate(s) { var C = G.cine; if (!C) return; C.t += s;
    for (var i = 0; i < C.beats.length; i++) { var b = C.beats[i]; if (!b.done && C.t >= b.t) { b.done = true; b.fn(); } }
    if (C.t >= C.dur) { var f = C.onEnd; G.cine = null; if (f) f(); } }
  function cineSkip() { if (!G.cine || !G.cine.skip) return; var f = G.cine.onEnd; G.cine = null; if (f) f(); }
  function press(id) { UI.pressed[id] = G.time; }
  function btnDepth(id) { var t0 = UI.pressed[id]; if (t0 == null) return 4; return 4 * clamp((G.time - t0) / 0.12, 0, 1); }
  function toggleView() { // swap between the RADAR (navigate) and the WINDOW (look out for leaks) — fixed camera
    if (G.scene !== "dive" || G.detonate || G.descentFx) return; press("light"); Audio.init();
    G.view = (G.view === "radar") ? "window" : "radar"; G.lightOn = (G.view === "window"); // floodlight on at the glass
    if (G.view === "window") { radioTutorial("lookOut"); if (Audio.vent) Audio.vent(); } else { if (Audio.card) Audio.card(); }
    clearDirs(); G.confirmDir = null;
  }

  // ---- the intro cutscene: storm rig -> lower DN-7 -> cut cable -> plunge into the trench ----
  function beginIntro() { G.scene = "intro"; if (Audio.init) Audio.init(); if (Audio.setMusic) Audio.setMusic("ambient"); radioInit(); G._introPlayed = true;
    // the cutscene's climax lines (5-7) play over the cable-cut + plunge; the rest plays in the sub
    var K = [
      { t: 0.0, eye: [14, 30, -26], tgt: [0, 14, 0], fov: 1.10, roll: 0, ease: easeInOut },
      { t: 3.2, eye: [9, 16, -16], tgt: [0, 9, 0], fov: 1.16, roll: 0.02, ease: easeInOut },
      { t: 6.0, eye: [4.5, 7.5, -9], tgt: [0.2, 2.5, 0], fov: 1.22, roll: -0.015, ease: easeInOut },
      { t: 8.6, eye: [3.0, 2.6, -6], tgt: [0, 0.2, 0], fov: 1.28, roll: 0, ease: easeInOut },
      { t: 10.2, eye: [1.6, -1.4, -4], tgt: [0, -3.0, 0], fov: 1.34, roll: 0.04, ease: easeInOut },
      { t: 13.5, eye: [0.2, -9.0, -2.6], tgt: [0, -26.0, 0], fov: 1.62, roll: -0.06, ease: easeIn }
    ];
    cineStart({ keys: K, dur: 13.5, skippable: true, onEnd: startRun, beats: [
      { t: 8.6, fn: function () { if (Audio.descend) Audio.descend(); if (OPT.shake) G.shake = 4; G.flash = Math.max(G.flash, 0.18); G.flashCol = "120,160,170"; radioQueue(RADIO.briefing[5]); } },
      { t: 10.2, fn: function () { if (Audio.roar) Audio.roar(); if (OPT.shake) G.shake = 10; G.flash = Math.max(G.flash, 0.5); G.flashCol = "200,210,215"; radioQueue(RADIO.briefing[6]); } },
      { t: 12.4, fn: function () { radioQueue(RADIO.briefing[7]); if (Audio.setMusic) Audio.setMusic("ambient"); } }
    ] }); }
  function updateIntro(s) { var C = G.cine, pl = C ? clamp((C.t - 10.2) / 3.3, 0, 1) : 0; if (OPT.shake && pl > 0) G.shake = Math.max(G.shake, pl * pl * 8); cineUpdate(s); G.glitch = Math.max(G.glitch, 0.04); }
  function drawIntroSky(uw, pl) {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, Art.mix("#0a1018", "#03101a", uw)); g.addColorStop(0.6, Art.mix("#0c1622", "#05202a", uw)); g.addColorStop(1, Art.mix("#040810", "#020a12", uw));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (uw < 0.6 && Math.sin(G.time * 0.7) * Math.sin(G.time * 0.31) > 0.93) { ctx.fillStyle = "rgba(150,170,205," + (0.18 * (1 - uw)).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H * 0.55); }
    if (uw > 0.05) { ctx.save(); ctx.globalAlpha = 0.10 * (1 - pl); for (var r = 0; r < 5; r++) { var rx = W * (0.1 + r * 0.2), rg = ctx.createLinearGradient(rx, 0, rx - W * 0.1, H); rg.addColorStop(0, "rgba(150,200,210,0.5)"); rg.addColorStop(1, "rgba(150,200,210,0)"); ctx.fillStyle = rg; ctx.fillRect(rx - W * 0.04, 0, W * 0.08, H); } ctx.restore(); } }
  function drawIntroPlunge(proj, uw, pl) { ctx.save();
    for (var i = 0; i < 60; i++) { var sd = i * 0.137, by = ((G.time * 4 + i * 0.7) % 30) - 4, p = proj([Math.sin(sd * 9) * 2.4, -6 + by, Math.cos(sd * 5) * 2.0]); if (!p.v) continue;
      var sz = clamp(p.s * 0.02, 0.6, 5) * (0.5 + pl); ctx.fillStyle = "rgba(190,220,225," + (0.10 + 0.25 * pl).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, 7); ctx.fill(); }
    ctx.restore();
    var m = proj([0, -26, 0]); if (m.v) { var rr = Math.max(W, H) * (0.18 + pl * 0.7), mg = ctx.createRadialGradient(m.x, m.y, rr * 0.1, m.x, m.y, rr); mg.addColorStop(0, "rgba(0,0,0,0.96)"); mg.addColorStop(0.7, "rgba(2,6,10,0.7)"); mg.addColorStop(1, "rgba(2,6,10,0)"); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(m.x, m.y, rr, 0, 7); ctx.fill(); } }
  function drawIntroRain(uw) {
    if (uw > 0.85) return; var a = (1 - uw);
    ctx.save(); ctx.strokeStyle = "rgba(170,195,210," + (0.20 * a).toFixed(2) + ")"; ctx.lineWidth = 1;
    for (var i = 0; i < 110; i++) { var sx = (i * 53) % W, sy = ((i * 97 + G.time * 1300) % (H + 40)) - 20; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 7, sy + 24); ctx.stroke(); }
    ctx.restore();
    // a forked lightning bolt + sky flash, rare and brief
    if (Math.sin(G.time * 0.9) * Math.sin(G.time * 0.37) > 0.95) {
      ctx.save(); ctx.fillStyle = "rgba(180,200,230," + (0.4 * a).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H * 0.7);
      ctx.strokeStyle = "rgba(225,238,255,0.92)"; ctx.lineWidth = 2.5; ctx.beginPath();
      var lx = W * (0.28 + 0.44 * ((G.time * 7) % 1)); ctx.moveTo(lx, 0);
      for (var s = 1; s <= 6; s++) ctx.lineTo(lx + Math.sin(s * 9.3 + G.time) * 34, s / 6 * H * 0.62); ctx.stroke(); ctx.restore();
    }
  }
  function renderIntro() {
    var C = G.cine, kf = C ? camAt(C.keys, C.t) : { eye: [0, 8, -12], tgt: [0, 2, 0], fov: 1.2, roll: 0 };
    var pl = C ? clamp((C.t - 10.2) / 3.3, 0, 1) : 0, uw = C ? clamp((C.t - 8.6) / 1.6, 0, 1) : 0;
    var shx = 0, shy = 0; if (OPT.shake && G.shake > 0) { shx = (Math.random() - 0.5) * G.shake; shy = (Math.random() - 0.5) * G.shake; }
    ctx.save(); ctx.translate(shx, shy);
    var proj = makeCam(kf.eye, kf.tgt, kf.fov, kf.roll, W, H);
    drawIntroSky(uw, pl);
    if (uw < 0.92) Art.drawOcean(ctx, proj, G.time, { amp: 1.0 + uw * 0.8 });   // the storm sea (waves grow as we drop in)
    Art.drawRigMesh(ctx, proj, G.time, uw); Art.drawCableSub(ctx, proj, G.time, C ? C.t : 0); if (uw > 0) drawIntroPlunge(proj, uw, pl);
    ctx.restore();
    drawIntroRain(uw);   // driving rain + the odd lightning fork (screen-space, over the scene)
    var bar = clamp(H * 0.10, 28, 90); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    var iT = C ? C.t : 0;
    if (iT < 3.0) { ctx.save(); ctx.globalAlpha = clamp(1 - iT / 3, 0, 1) * Art.bootFlicker(iT + 0.3, 1.0);
      Art.text(ctx, "ПРОЕКТ «ДРЕДНОУТ»", W / 2, bar + clamp(H * 0.07, 26, 54), clamp(W * 0.03, 16, 30), PAL.amberHi, "center");
      Art.text(ctx, "СЕВ. ФЛОТ · 1986 · −5200 М", W / 2, bar + clamp(H * 0.07, 26, 54) + clamp(W * 0.022, 12, 22), clamp(W * 0.016, 10, 16), PAL.amber, "center"); ctx.restore(); }
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, flash: G.flash, flashCol: G.flashCol, time: G.time, glitch: G.glitch + pl * 0.3, pixel: 2.4 + pl * 1.6 });
    drawRadioPanel();   // crisp comms + skip control over the pixelated cutscene
    UI.skipBtn = { x: W - clamp(W * 0.18, 120, 180) - 14, y: H - bar - clamp(H * 0.07, 40, 58) - 10, w: clamp(W * 0.18, 120, 180), h: clamp(H * 0.07, 40, 58) };
    Art.button(ctx, UI.skipBtn, "SKIP ▸", { hover: UI.hover === "skip", depth: 3 });
  }
  function drawDescentFx() { var k = clamp(G.descentFx.t / G.descentFx.dur, 0, 1), e = easeInOut(k);
    ctx.fillStyle = "rgba(2,7,11," + (0.55 + e * 0.4).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
    ctx.save(); for (var i = 0; i < 70; i++) { var sd = i * 0.173, by = H - ((G.time * 600 + i * 97) % (H * 1.4)), bx = W * ((sd * 7) % 1), sz = 1 + (i % 3); ctx.fillStyle = "rgba(190,220,225," + (0.10 + 0.3 * Math.sin(k * Math.PI)).toFixed(2) + ")"; ctx.fillRect(bx, by, sz, sz * 2.4); } ctx.restore();
    ctx.globalAlpha = Math.sin(k * Math.PI); Art.text(ctx, "↓ " + Math.floor(G.depth) + " М ↓", W / 2, H * 0.5, clamp(W * 0.04, 18, 40), PAL.bioHi, "center"); ctx.globalAlpha = 1; }
  function updateCamera(s) { var c = G.cam; c.yaw = c.pitch = c.vYaw = c.vPitch = c.tgtYaw = c.tgtPitch = 0; } // FIXED forward
  // ---- PRESSURE: spring a leak somewhere on the hull. Located ONLY by looking out the window. ----
  function depthFrac() { return clamp(G.depth / 5200, 0, 1); }
  function spawnLeak() {
    var side = G.rng.chance(0.5) ? 1 : -1;
    G.leaks.push({ x: 0.18 + G.rng.range(0, 0.64), y: 0.22 + G.rng.range(0, 0.5), born: G.time, side: side, sev: G.rng.range(0.8, 1.2) });
    G.lamp.hull = 1; Audio.alert(); if (Audio.groan) Audio.groan();
    G.flash = Math.max(G.flash, 0.16); G.flashCol = "120,160,170"; if (OPT.shake) G.shake = Math.max(G.shake, 4);
    radioTutorial("firstLeak"); radioAmbient("leak", 0.6, 1);
  }

  // ---------------- state ----------------
  var G = null;
  function newRun(seed) {
    var rng = new RNG(seed);
    G = { scene: "titlemenu", seedStr: rng.seedStr, rng: rng, time: 0,
      layer: 1, gw: 7, gh: 7, cells: [], sub: { cx: 0, cy: 0 }, facing: { dx: 0, dy: 1 },
      hull: CFG.startHull, oxygen: CFG.startOxygen, pings: CFG.pingsStart, threat: 0, depth: 0,
      patches: 0, onLoot: false,
      lightOn: false, transit: null, stalker: null, woke: false, confirmDir: null,
      leak: 0, scare: null, snow: [], flash: 0, flashCol: "180,40,40", shake: 0, hbT: 0, heartbeat: 0,
      lamp: { o2: 0, hull: 0, wake: 0 }, endKind: null, won: false, menuSel: 0, padActive: false,
      hatch: { x: 0, y: 0 }, start: { x: 0, y: 0 }, loreSeen: [], pingFlash: 0, sweep: 0,
      // full-horror state: sanity ("the dark notices you"), CRT glitch pulse, the radio, idle clock
      sanity: 1, glitch: 0, radio: null, idleT: 0, srcSaid: false, flare: 0,
      cine: null, descentFx: null, detonate: null, hands: { lx: 0, ly: 0, rx: 0, ry: 0, lR: 0, rR: 0, grip: 0 },
      // FIXED camera now: angles stay 0, no look-around. Kept as an object so old call sites are harmless.
      cam: { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0, tgtYaw: 0, tgtPitch: 0, idle: 0, active: 0, lastLook: -9, _swayY: 0, _swayP: 0 },
      valveAngle: 0, valveSpin: 0, leakStep: 0,
      // SURVIVAL: which fixed view you're in, the crushing pressure, and the leaks it springs
      view: "radar", pressure: 0, leaks: [], leakT: CFG.leakIntervalBase, flood: 0 };
    radioInit();
  }
  function fmt(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, key) { return o && o[key] != null ? o[key] : ""; }); }
  function cell(x, y) { return (x < 0 || y < 0 || x >= G.gw || y >= G.gh) ? null : G.cells[y * G.gw + x]; }
  function curCell() { return cell(G.sub.cx, G.sub.cy); }
  // fixed stats (no upgrades). Kept as functions so every call site stays unchanged.
  function effMaxHull() { return CFG.maxHull; }
  function effMaxOxygen() { return CFG.startOxygen; }
  function effPings() { return CFG.pingsStart; }
  function lightRange() { return 30; }
  function lightThreatRate() { return CFG.threatLight; }
  function bilgeMult() { return 1; }

  // ---------------- RADIO: the only voice down here (tutorial + lore + dread) ----------------
  function radioInit() { G.radio = { cur: null, t: 0, q: [], fired: {}, sigSeen: [], ambCool: 0 }; }
  function radioHold(line) { return Math.max(3.0, Math.min(7, 1.6 + line.length * 0.05)); }
  function radioQueue(m) { if (!m || !G.radio) return; G.radio.q.push({ speaker: m.speaker, line: m.line, hold: radioHold(m.line) }); }
  function radioQueueAll(a) { if (!a) return; for (var i = 0; i < a.length; i++) radioQueue(a[i]); }
  function radioOnce(key, m) { if (G.radio && !G.radio.fired[key]) { G.radio.fired[key] = true; radioQueue(m); } }
  function radioTutorial(key) { if (G.layer === 1) radioOnce("tut_" + key, RADIO.tutorial[key]); }
  function radioAmbient(bucket, chance, minLayer) { var R = G.radio; if (!R || G.layer < (minLayer || 1) || R.ambCool > 0) return;
    if (!G.rng.chance(chance)) return; var pool = RADIO.ambient[bucket]; if (!pool || !pool.length) return; radioQueue(pool[G.rng.int(0, pool.length - 1)]); R.ambCool = 16; }
  function radioSignal() { var R = G.radio; if (!R) return; var idx = [], i;
    for (i = 0; i < RADIO.signals.length; i++) if (R.sigSeen.indexOf(i) < 0) idx.push(i);
    if (!idx.length) idx = [G.rng.int(0, RADIO.signals.length - 1)];
    var pick = idx[G.rng.int(0, idx.length - 1)]; R.sigSeen.push(pick); radioQueue(RADIO.signals[pick]); }
  function radioUpdate(s) { var R = G.radio; if (!R) return; if (R.ambCool > 0) R.ambCool -= s;
    if (!R.cur && R.q.length) { R.cur = R.q.shift(); R.t = 0; if (Audio.scan) Audio.scan(); }
    if (R.cur) { R.t += s; if (R.t >= R.cur.hold) { R.cur = null; if (R.q.length) { R.cur = R.q.shift(); R.t = 0; if (Audio.scan) Audio.scan(); } } } }

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
    // MINES on non-safe cells (single-cell; numbers count them; the carved corridor stays clear)
    var free = []; for (var c = 0; c < G.cells.length; c++) if (!safe[c]) free.push(G.cells[c]);
    rng.shuffle(free);
    var mc = Math.min(Lc.mines, free.length);
    for (var m = 0; m < mc; m++) { var mm = free[m]; mm.mon = true; mm.monId = rng.pick(Lc.pool); }
    // hatch / source
    var hatchC = cell(hx, hy); hatchC.hatch = true; if (Lc.source) { hatchC.source = true; hatchC.kind = "source"; }
    // numbers
    for (var y2 = 0; y2 < G.gh; y2++) for (var x2 = 0; x2 < G.gw; x2++) { var t = cell(x2, y2); if (t.mon) continue; var cnt = 0; for (var ny = -1; ny <= 1; ny++) for (var nx = -1; nx <= 1; nx++) { if (!nx && !ny) continue; var nb = cell(x2 + nx, y2 + ny); if (nb && nb.mon) cnt++; } t.n = cnt; }
    // reveal start (it is a 0 — flood its pocket)
    var startC = cell(sx, sy); seeCell(startC);
    G.pings = effPings(); G.stalker = null; G.woke = false; G.confirmDir = null; G.transit = null; G.onLoot = false; clearDirs();
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
  function moveAnglers() { return false; } // mines are STATIC now (no twist) — kept as a no-op for the export/tests

  function startRun() { G.layer = 1; G.hull = effMaxHull(); G.oxygen = effMaxOxygen(); G.threat = 0; G.lightOn = false; G.flare = 0; G.leak = 0; G.leakStep = 0; G.detonate = null; G.won = false; G.endKind = null;
    G.sanity = 1; G.glitch = 0; G.idleT = 0; G.srcSaid = false; G.loreSeen = [];
    G.valveAngle = 0; G.valveSpin = 0;
    G.view = "radar"; G.pressure = 0; G.leaks = []; G.leakT = CFG.leakIntervalBase; G.flood = 0;
    G.cam.yaw = G.cam.pitch = G.cam.vYaw = G.cam.vPitch = G.cam.tgtYaw = G.cam.tgtPitch = 0; G.cam.active = 0;
    G.descentFx = null; G.cine = null;
    radioInit(); genLayer(1); G.scene = "dive"; Audio.setMusic("ambient");
    // after the intro cutscene, only play the un-heard half of the briefing; a cold retry plays it all
    if (G._introPlayed) { G._introPlayed = false; radioQueueAll(RADIO.briefing.slice(0, 5)); } else radioQueueAll(RADIO.briefing);
    radioQueueAll(RADIO.layer[1]); }
  function descend() { Audio.descend(); if (OPT.shake) G.shake = 8; var nl = G.layer + 1; if (nl > CFG.layers) { winRun(); return; }
    radioTutorial("firstCrank"); radioQueue(RADIO.seal); G.flash = Math.max(G.flash, 0.4); G.flashCol = "120,160,170";
    G.descentFx = { t: 0, dur: 1.15 }; // a brief plunge transition
    genLayer(nl); G.threat = clamp(G.threat - 20, 0, 100); G.sanity = clamp(G.sanity + 0.08, 0, 1); G.srcSaid = false;
    G.view = "radar"; G.leaks = []; G.flood = 0; G.leakT = lerp(CFG.leakIntervalBase, CFG.leakIntervalMin, depthFrac()) * 0.8; // deeper -> leaks come sooner
    radioQueueAll(RADIO.layer[nl] || RADIO.layer[CFG.layers]); }
  function winRun() { G.scene = "end"; G.won = true; G.endKind = "win"; Audio.setMusic("none"); Audio.win(); radioQueue(RADIO.win); }
  function die(kind) { if (G.scene !== "dive") return; G.scene = "end"; G.won = false; G.endKind = kind; Audio.setMusic("none"); Audio.lose();
    if (kind === "hull") radioQueue(RADIO.deathHull); else if (kind === "mine") radioQueue(RADIO.deathMine); else radioQueueAll(RADIO.deathAir); }

  // ---------------- actions ----------------
  function tryDrive(dx, dy) {
    if (G.scene !== "dive" || G.view !== "radar" || G.transit || G.detonate || G.descentFx) return; Audio.init();
    press(dy < 0 ? "up" : dy > 0 ? "down" : dx < 0 ? "left" : "right");
    var tx = G.sub.cx + dx, ty = G.sub.cy + dy, c = cell(tx, ty); if (!c) return;
    G.facing = { dx: dx, dy: dy };
    if (c.flagged && !c.triggered) {   // flagged cell: demand a confirming second press (the only guard against fatal slips)
      if (G.confirmDir && G.confirmDir.dx === dx && G.confirmDir.dy === dy) { G.confirmDir = null; }
      else { G.confirmDir = { dx: dx, dy: dy, t: G.time }; G.lamp.hull = 0.6; Audio.alert(); return; }
    } else G.confirmDir = null;
    G.transit = { dx: dx, dy: dy, target: c, t: 0, isMine: !!c.mon, fromX: G.sub.cx, fromY: G.sub.cy };
  }
  function resolveArrive(tr) {
    var c = tr.target; G.transit = null; G.oxygen -= CFG.moveCost;
    if (c.mon) { G.sub = { cx: c.x, cy: c.y }; detonate(c); return; }   // a MINE — instant death after the blast
    G.sub = { cx: c.x, cy: c.y };
    seeCell(c);
    radioTutorial("firstDrive"); if (c.n > 0) radioTutorial("firstNumber");
    afterMove();
  }
  function afterMove() {
    G.idleT = 0;
    G.threat = clamp(G.threat + CFG.threatMove, 0, 100);
    if (G.oxygen <= 0) { G.oxygen = 0; return die("oxygen"); }
    if (G.hull <= 0) return die("hull");
  }
  // PATCH: seal the leak you located by LOOKING OUT — only works at the glass; free, but the cost is the air you burn there
  function patch() {
    if (G.scene !== "dive" || G.transit || G.detonate || G.descentFx) return; press("patch");
    if (G.view !== "window") { radioTutorial("lookOut"); G.lamp.hull = 0.4; return; }   // must be at the window to find it
    if (!G.leaks.length) { G.lamp.hull = 0.3; return; }
    var idx = 0, worst = -1; for (var i = 0; i < G.leaks.length; i++) { var age = G.time - G.leaks[i].born; if (age > worst) { worst = age; idx = i; } }
    G.leaks.splice(idx, 1); G.hands.grip = 1;                                   // seal the oldest seam
    G.hull = clamp(G.hull + 16, 0, effMaxHull());                               // the patch holds back a little water
    Audio.vent(); G.flash = 0.18; G.flashCol = "40,240,170"; if (OPT.shake) G.shake = Math.max(G.shake, 2);
  }
  function crank() { // the winch: breach on the Source, descend on the hatch — NEVER surfaces (no way back)
    if (G.scene !== "dive" || G.view !== "radar" || G.transit || G.detonate || G.descentFx) return; var c = curCell();
    press("crank");
    if (c && c.source) { G.valveSpin = 9; winRun(); return; }
    if (c && c.hatch) { G.valveSpin = 9; descend(); return; }
    G.valveSpin = -7; Audio.alert(); radioQueue(RADIO.noway); // denied — there is no surface to return to
  }
  // a MINE detonates: white blast + hull rupture, then death. No creature — pure ordnance and pressure.
  function detonate(c) {
    c.seen = true; c.triggered = true; c.flagged = true;
    G.flash = 1; G.flashCol = "255,214,150"; if (OPT.shake) G.shake = 28;
    G.glitch = 1; G.lamp.hull = 1; Audio.damage(); if (Audio.roar) Audio.roar();
    for (var i = 0; i < G.cells.length; i++) if (G.cells[i].mon) G.cells[i].seen = true; // the scope reveals every mine you skirted
    G.detonate = { t0: G.time, until: G.time + 1.25, cx: c.x, cy: c.y };
    clearDirs(); Audio.setMusic("none");
  }
  function ping() {
    if (G.scene !== "dive" || G.view !== "radar" || G.transit || G.detonate || G.descentFx || G.pings <= 0) { if (G.pings <= 0) G.lamp.o2 = 0.4; return; }
    Audio.init(); press("ping"); G.pings--; G.pingFlash = 1; G.sweep = 0; G.threat = clamp(G.threat + CFG.threatPing, 0, 100);
    var fx = G.facing.dx, fy = G.facing.dy;
    for (var d = 1; d <= CFG.pingCone; d++) { for (var l = -(d - 1); l <= d - 1; l++) {
      var cx = G.sub.cx + fx * d - fy * l, cy = G.sub.cy + fy * d + fx * l; var c = cell(cx, cy);
      if (c && !c.mon && !c.seen) seeCell(c); // ping reveals numbers of SAFE cells only; mines stay dark (deduce them)
    } }
    Audio.ping(); radioTutorial("firstPing");
  }
  var toggleLight = toggleView; // legacy name for the key/pad/touch bindings — now toggles RADAR <-> WINDOW
  function flagFaced() { if (G.scene !== "dive" || G.view !== "radar" || G.transit) return; var c = cell(G.sub.cx + G.facing.dx, G.sub.cy + G.facing.dy); flagCell(c); }
  function flagCell(c) { if (!c || c.seen) return; c.flagged = !c.flagged; G.confirmDir = null; Audio.card(); if (c.flagged) radioTutorial("firstFlag"); }

  // (the old "stalker" hunter is replaced by moveAnglers(): the mines themselves relocate.)

  // ---------------- update ----------------
  function update(dt) {
    G.time += dt / 1000; var s = dt / 1000;
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 600);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 60);
    if (G.pingFlash > 0) G.pingFlash = Math.max(0, G.pingFlash - s * 1.3);
    radioUpdate(s);                                              // the radio drips its queue (all scenes)
    if (G.glitch > 0) { G.glitch -= s * 4; if (G.glitch < 0) G.glitch = 0; } // CRT tear decays
    G.sweep = (G.sweep + s * 2.2) % (Math.PI * 2);
    for (var key in G.lamp) if (G.lamp[key] > 0) G.lamp[key] = Math.max(0, G.lamp[key] - s * 0.4);
    if (G.detonate && G.time > G.detonate.until) { G.detonate = null; die("mine"); return; } // the blast finishes -> death
    // snow drift (gentle when idle, rush during transit)
    var rush = G.transit ? 14 : 1.5;
    for (var i = 0; i < G.snow.length; i++) { var p = G.snow[i]; p.rz -= rush * s; if (p.rz < 0.5) { var ns = newSnow(false); p.rx = ns.rx; p.ry = ns.ry; p.rz = ns.rz; } }
    if (G.scene === "intro") { updateIntro(s); return; }
    if (G.scene !== "dive") return;
    updateCamera(s); // FIXED view (no look-around)
    if (G.descentFx) { G.descentFx.t += s; if (G.descentFx.t >= G.descentFx.dur) G.descentFx = null; }
    G.lightOn = (G.view === "window"); // the floodlight is on only when you're at the glass looking out
    if (G.hands.grip > 0) G.hands.grip = Math.max(0, G.hands.grip - s * 2.2); // patch-grip relaxes
    if (G.detonate) return; // the blast plays out; the sim is frozen until death
    G.valveAngle += G.valveSpin * s; G.valveSpin += (0 - G.valveSpin) * Math.min(1, s * 4);
    if (G.confirmDir && G.time - (G.confirmDir.t || 0) > 1.5) G.confirmDir = null; // a stale "confirm" must not carry into a later slip

    if (G.transit) { G.transit.t += s / CFG.moveGlide; if (G.transit.t >= 1) resolveArrive(G.transit); }
    else pumpHeldDrive();   // held WSAD/d-pad keeps driving cell-to-cell once the glide lands (steady 0.34s cadence)

    // air clock — the crush makes you breathe harder the deeper you are; nothing ever refills it
    var pf = depthFrac();
    G.oxygen -= (CFG.idleDrain + CFG.pressureAirBoost * pf) * s; if (G.oxygen <= 0) { G.oxygen = 0; return die("oxygen"); }
    if (G.oxygen < effMaxOxygen() * 0.2) G.lamp.o2 = Math.max(G.lamp.o2, 0.5 + 0.5 * Math.sin(G.time * 5));
    // threat / noise (feeds ambient + tightens the leak cadence; no longer wakes a creature)
    var add = 0; if (G.view === "window") add += lightThreatRate() * s * 0.5;
    G.threat = clamp(G.threat + add - CFG.threatDecay * s, 0, 100);
    G.pressure += (pf - G.pressure) * Math.min(1, s * 0.6);
    // ---- PRESSURE springs LEAKS on a timer that tightens with depth + noise ----
    G.leakT -= s;
    if (G.leakT <= 0 && G.leaks.length < (2 + Math.round(pf * 2))) {
      spawnLeak();
      var iv = lerp(CFG.leakIntervalBase, CFG.leakIntervalMin, pf) - (G.threat >= CFG.wake ? 3 : 0);
      G.leakT = Math.max(CFG.leakIntervalMin, iv) * G.rng.range(0.8, 1.25);
    }
    // unpatched leaks flood the hull; an old seam BURSTS and floods twice as fast
    var floodRate = 0;
    for (var li = 0; li < G.leaks.length; li++) { var lk = G.leaks[li]; var burst = (G.time - lk.born) > CFG.leakBurst; floodRate += CFG.leakFlood * lk.sev * (burst ? 2 : 1); }
    if (floodRate > 0) { G.hull = clamp(G.hull - floodRate * s, 0, effMaxHull()); if (G.hull <= 0) return die("hull"); }
    // the visible flood level eases toward the hull damage (drives the cabin-flooding overlay + seam audio)
    var target = (1 - G.hull / effMaxHull()); G.leak += (target - G.leak) * Math.min(1, s * 2);
    var lstep = Math.floor(G.leak * 10); if (lstep > G.leakStep) { if (OPT.shake) G.shake = Math.max(G.shake, 3); G.flash = Math.max(G.flash, 0.18); G.flashCol = "120,160,170"; } G.leakStep = lstep;
    // heartbeat from a nearby (unrevealed) mine / heavy flood / low air
    var nd = nearestMonDist(); var hbMine = nd <= 2 ? clamp(1 - (nd - 1) / 2, 0, 1) * 0.7 : 0;
    G.heartbeat = Math.max(hbMine, G.leak > 0.6 ? G.leak : 0, G.oxygen < effMaxOxygen() * 0.12 ? 0.6 : 0);
    if (G.heartbeat > 0.06) { var iv2 = 1.1 - G.heartbeat * 0.7; G.hbT -= s; if (G.hbT <= 0) { G.hbT = iv2; Audio.heartbeat(G.heartbeat); } } else G.hbT = 0;
    // RADIO cadence
    G.idleT += s;
    if (G.layer === 1) {
      if (G.idleT > 4) radioTutorial("idle");
      if (G.oxygen < effMaxOxygen() * 0.25) radioTutorial("lowAir");
      var hcl = cell(G.hatch.x, G.hatch.y);
      if (hcl && (hcl.seen || Math.abs(G.hatch.x - G.sub.cx) + Math.abs(G.hatch.y - G.sub.cy) === 1)) radioTutorial("foundHatch");
    }
    if (G.leak > 0.45) radioAmbient("flood", 0.018, 1);   // (the initial leak line fires at spawn)
    if (G.threat >= CFG.wake) radioAmbient("threat", 0.30, 1);
    if (G.idleT > 12) { radioAmbient("deepIdle", 0.5, 4); G.idleT = 0; }
    // THE SOURCE speaks when you reach the floor
    var occ = curCell(); if (occ && occ.source && !G.srcSaid) { G.srcSaid = true; radioQueueAll(RADIO.source); }
    // SANITY — the deep presses on the mind (never lethal; only corrupts perception)
    var drain = 0.004 + (G.depth > 1000 ? 0.004 : 0) + (nd <= 2 ? 0.010 : 0) + (G.oxygen < effMaxOxygen() * 0.15 ? 0.010 : 0) + (G.leak > 0.5 ? 0.008 : 0);
    G.sanity = clamp(G.sanity - drain * s, 0, 1);
    if (G.sanity < 0.30 && G.rng.chance(0.4 * s)) { Audio.heartbeat(0.5); G.flash = Math.max(G.flash, 0.10); G.flashCol = "120,40,160"; }
    if (G.rng.chance(0.05 * s)) G.glitch = Math.max(G.glitch, 0.4); // the comms feed pops unreliably
    if (G.leak > 0.25 && Math.sin(G.time * 0.7) > 0.995) Audio.groan && Audio.groan();
    var wantThreat = G.leaks.length > 0 || G.hull < 40 || pf > 0.6 || G.oxygen < effMaxOxygen() * 0.2;
    if (Audio._which !== (wantThreat ? "threat" : "ambient")) Audio.setMusic(wantThreat ? "threat" : "ambient");
  }

  // ---------------- render ----------------
  function render() {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#05080c"; ctx.fillRect(0, 0, W, H); if (!G) return;
    if (UI.overlay === "help") return renderHelp();
    if (UI.overlay === "options") return renderOptions();
    if (G.scene === "intro") return renderIntro();
    if (G.scene === "dive") return renderDive();
    if (G.scene === "end") return renderEnd();
    return renderTitle();
  }

  function renderForwardBuffer() {
    var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh);
    Art.drawForward(bctx, bw, bh, { contacts: forwardContacts(), snow: G.snow, lightOn: G.lightOn, threat: G.threat / 100, time: G.time, fov: 1.2, headlightRange: lightRange() });
  }
  function forwardContacts() {
    // mines are invisible in the water (you deduce them on the scope). Only the descent hatch glows ahead.
    var out = [], sp = 6.5, tp = G.transit ? G.transit.t : 0;
    for (var d = 1; d <= 4; d++) {
      var rz = Math.max(0.8, d * sp - tp * sp * 0.92);
      var tx = G.sub.cx + G.facing.dx * d, ty = G.sub.cy + G.facing.dy * d; var c = cell(tx, ty); if (!c) continue;
      if (c.hatch) out.push({ rx: 0, ry: 0, rz: rz, kind: c.source ? "source" : "vent", isMonster: false });
    }
    return out;
  }

  // the cylindrical steel cabin: projected rib rings + shaded wall strips + pipes + grating + caged lamps
  var TUBE_Z = [0.30, 0.55, 0.9, 1.4, 2.0, 2.8, 3.8, 5.2], TUBE_R = 1.44, TUBE_NS = 11;
  function drawTube(yaw, pitch) {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#10161d"); g.addColorStop(0.5, "#0a0f15"); g.addColorStop(1, "#05080c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var focal = (W * 0.5) / Math.tan(FOV / 2), cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    function proj(a, zc) { var wx = Math.cos(a) * TUBE_R, wy = Math.sin(a) * TUBE_R;
      var x = wx * cyw - zc * syw, z = wx * syw + zc * cyw; var y = wy * cp + z * sp; z = -wy * sp + z * cp;
      if (z < 0.06) z = 0.06; var f = focal / z; return [W / 2 + x * f, H / 2 - y * f, z]; }
    function fog(z) { return clamp(1 - (z - 0.3) / 5.2, 0.1, 1); }
    var amb = G.lightOn ? 1.0 : 0.6;
    // wall strips far -> near (painter)
    for (var ri = TUBE_Z.length - 2; ri >= 0; ri--) { var zN = TUBE_Z[ri], zF = TUBE_Z[ri + 1], fg = fog(zF);
      for (var j = 0; j < TUBE_NS; j++) { var a0 = j / TUBE_NS * Math.PI * 2, a1 = (j + 1) / TUBE_NS * Math.PI * 2, am = (a0 + a1) / 2;
        var p0 = proj(a0, zN), p1 = proj(a1, zN), p2 = proj(a1, zF), p3 = proj(a0, zF);
        var nb = Math.max(0, -Math.sin(am)); // 1 at floor (bottom) lit by the ceiling lamp
        // low-poly faceted panel: stepped flat shade + a darker crease stroke (chunky steel hull)
        var floor = nb > 0.5;
        Art.facetQuad(ctx, p0, p1, p2, p3, floor ? [18, 28, 24] : [24, 30, 36], floor ? [62, 84, 70] : [70, 84, 96], 0.25 + nb * 0.75, fg * amb); } }
    // rib rings + rivets
    for (var ki = 0; ki < TUBE_Z.length; ki++) { var zc = TUBE_Z[ki], fr = fog(zc);
      ctx.strokeStyle = "rgba(120,200,205," + (0.05 + fr * 0.20).toFixed(3) + ")"; ctx.lineWidth = 1; ctx.beginPath();
      for (var jr = 0; jr <= TUBE_NS; jr++) { var pp = proj(jr % TUBE_NS / TUBE_NS * Math.PI * 2, zc); if (jr === 0) ctx.moveTo(pp[0], pp[1]); else ctx.lineTo(pp[0], pp[1]); } ctx.stroke();
      if (zc < 3) { ctx.fillStyle = "rgba(150,160,170," + (fr * 0.5).toFixed(3) + ")"; for (var jv = 0; jv < TUBE_NS; jv += 2) { var pv = proj(jv / TUBE_NS * Math.PI * 2, zc); ctx.beginPath(); ctx.arc(pv[0], pv[1], Math.max(0.8, 2 * fr), 0, 7); ctx.fill(); } } }
    // ceiling pipes (longitudinal)
    var pipes = [Math.PI / 2 - 0.34, Math.PI / 2, Math.PI / 2 + 0.34];
    for (var pi = 0; pi < pipes.length; pi++) { var pa = pipes[pi];
      ctx.strokeStyle = PAL.steel; ctx.lineWidth = 2; ctx.beginPath();
      for (var zi = 0; zi < TUBE_Z.length; zi++) { var pp2 = proj(pa, TUBE_Z[zi]); if (zi === 0) ctx.moveTo(pp2[0], pp2[1]); else ctx.lineTo(pp2[0], pp2[1]); } ctx.stroke();
      ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1; ctx.beginPath();
      for (var zi2 = 0; zi2 < TUBE_Z.length; zi2++) { var pp3 = proj(pa, TUBE_Z[zi2]); if (zi2 === 0) ctx.moveTo(pp3[0], pp3[1] - 1); else ctx.lineTo(pp3[0], pp3[1] - 1); } ctx.stroke(); }
    // floor grating rungs
    ctx.strokeStyle = "rgba(70,92,80,0.45)"; ctx.lineWidth = 1;
    for (var zg = 1; zg < TUBE_Z.length; zg++) { var bl = proj(-Math.PI / 2 - 0.55, TUBE_Z[zg]), br = proj(-Math.PI / 2 + 0.55, TUBE_Z[zg]); ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.stroke(); }
    // caged ceiling lamps (the light sources)
    var lampZ = [1.0, 2.5];
    for (var li = 0; li < lampZ.length; li++) { var lp = proj(Math.PI / 2, lampZ[li]), lr = Math.max(4, 22 / lampZ[li]);
      Art.glowDot(ctx, lp[0], lp[1], lr * 1.6, PAL.amberHi, G.lightOn ? 0.7 : 0.4);
      ctx.fillStyle = G.lightOn ? "#ffe6a8" : "#5c5230"; ctx.beginPath(); ctx.arc(lp[0], lp[1], lr * 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(20,24,28,0.7)"; ctx.lineWidth = 1; for (var cg = -1; cg <= 1; cg++) { ctx.beginPath(); ctx.moveTo(lp[0] + cg * lr * 0.4, lp[1] - lr * 0.4); ctx.lineTo(lp[0] + cg * lr * 0.4, lp[1] + lr * 0.4); ctx.stroke(); } }
    // murk swallowing the far end of the tube
    var fcp = proj(0, TUBE_Z[TUBE_Z.length - 1]); var hz = ctx.createRadialGradient(fcp[0], fcp[1], 2, fcp[0], fcp[1], H * 0.45);
    hz.addColorStop(0, "rgba(5,11,15,0.88)"); hz.addColorStop(1, "rgba(5,11,15,0)"); ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
    // ---- little riveted portholes set into the tube wall (parallax with the look camera) ----
    var PORTS = [{ a: 0.55, z: 1.15 }, { a: 2.55, z: 1.55 }, { a: 0.30, z: 2.6 }, { a: 2.85, z: 2.9 }];
    var ndp = nearestMonDist(), shapeOp = clamp((G.threat / 100) * 0.5 + (ndp <= 3 ? 0.4 : 0) + (1 - G.sanity) * 0.3, 0, 1);
    for (var ppi = 0; ppi < PORTS.length; ppi++) {
      var P = PORTS[ppi], pc = proj(P.a, P.z);
      if (pc[2] > 5 || pc[2] < 0.4 || pc[0] < -120 || pc[0] > W + 120 || pc[1] < -120 || pc[1] > H + 120) continue;
      var pr = clamp(focal / pc[2] * 0.16, 8, 80), fr = fog(pc[2]), lit = (G.lightOn ? 0.9 : 0.55) * fr, pcx = pc[0], pcy = pc[1];
      var wg = ctx.createRadialGradient(pcx - pr * 0.3, pcy - pr * 0.3, pr * 0.1, pcx, pcy, pr);
      wg.addColorStop(0, "rgba(10,40,48," + lit.toFixed(2) + ")"); wg.addColorStop(1, "rgba(2,10,14," + (lit * 0.6).toFixed(2) + ")");
      ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.clip();
      ctx.strokeStyle = "rgba(120,200,205," + (0.10 * fr).toFixed(3) + ")"; ctx.lineWidth = 1;
      for (var ca2 = 0; ca2 < 2; ca2++) { var cph = G.time * (0.4 + ca2 * 0.2) + ppi; ctx.beginPath(); ctx.arc(pcx + Math.cos(cph) * pr * 0.3, pcy + Math.sin(cph) * pr * 0.3, pr * (0.5 + ca2 * 0.25), 0, Math.PI * 1.3); ctx.stroke(); }
      var phase = (G.time * 0.08 + ppi * 0.37) % 1, op = shapeOp * Math.max(0, Math.sin(phase * Math.PI)) * 0.7;
      if (op > 0.04) { var sxp = pcx + (phase - 0.5) * pr * 3.2, syp = pcy + Math.sin(G.time * 0.6 + ppi) * pr * 0.3;
        var sg2 = ctx.createRadialGradient(sxp, syp, 0, sxp, syp, pr * 0.9); sg2.addColorStop(0, "rgba(0,0,0," + op.toFixed(3) + ")"); sg2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg2; ctx.beginPath(); ctx.ellipse(sxp, syp, pr * 0.9, pr * 0.45, 0.2, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(180,210,215," + (0.18 * fr).toFixed(3) + ")"; for (var cs2 = 0; cs2 < 5; cs2++) { var ang2 = ppi * 1.7 + cs2 * 1.3, rr2 = pr * (0.3 + (cs2 % 3) * 0.22); ctx.fillRect(pcx + Math.cos(ang2) * rr2, pcy + Math.sin(ang2) * rr2, 1.4, 1.4); }
      ctx.restore();
      ctx.lineWidth = Math.max(3, pr * 0.22); ctx.strokeStyle = Art.mix("#0d1116", PAL.steelLo, 0.4 + lit * 0.4); ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.stroke();
      ctx.lineWidth = Math.max(1, pr * 0.06); ctx.strokeStyle = PAL.steelHi; ctx.beginPath(); ctx.arc(pcx, pcy, pr - pr * 0.10, -0.8, 0.7); ctx.stroke();
      ctx.fillStyle = PAL.rivet; var nb2 = pr > 26 ? 8 : 6; for (var rb = 0; rb < nb2; rb++) { var rba = rb / nb2 * Math.PI * 2; ctx.beginPath(); ctx.arc(pcx + Math.cos(rba) * pr, pcy + Math.sin(rba) * pr, Math.max(1, pr * 0.07), 0, 7); ctx.fill(); }
    }
  }
  // a creature swimming PAST the window glass — sneaky, lit at centre, lost in murk at the frame edges
  // window contact is ONLY a dark silhouette lost in murk — never the creature mesh ("did I see something?")
  // a high-pressure LEAK jet on the window glass — the ONLY place a leak's position is visible (look-out view)
  function drawLeakJet(L0, win) {
    var lx = win.x + L0.x * win.w, ly = win.y + L0.y * win.h, age = G.time - L0.born, burst = age > CFG.leakBurst;
    var jet = (burst ? 1.6 : 1) * (0.7 + 0.3 * Math.sin(G.time * 22 + L0.x * 30));
    ctx.save();
    ctx.strokeStyle = "rgba(150,210,225,0.5)"; ctx.lineWidth = 2;   // the fracture
    ctx.beginPath(); ctx.moveTo(lx - 14, ly - 10); ctx.lineTo(lx, ly); ctx.lineTo(lx + 11, ly - 15); ctx.moveTo(lx, ly); ctx.lineTo(lx + 6, ly + 17); ctx.stroke();
    var grd = ctx.createRadialGradient(lx, ly, 2, lx, ly, 62 * jet);   // the spray
    grd.addColorStop(0, "rgba(205,232,242," + (0.5 * jet).toFixed(2) + ")"); grd.addColorStop(0.5, "rgba(120,170,190,0.22)"); grd.addColorStop(1, "rgba(120,170,190,0)");
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(lx, ly, 62 * jet, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(195,228,238,0.6)";   // droplets streaking inward
    for (var i = 0; i < 9; i++) { var dph = (G.time * 1.6 + i * 0.5) % 1, dxp = lx + (i - 4) * 5 + Math.sin(i + L0.y) * 6, dyp = ly + dph * 72 * jet; ctx.fillRect(dxp, dyp, 1.6, 7 * jet); }
    ctx.strokeStyle = burst ? "rgba(255,90,70,0.85)" : "rgba(255,210,120,0.7)"; ctx.lineWidth = 2;   // patch-aim ring
    ctx.beginPath(); ctx.arc(lx, ly, 22 + Math.sin(G.time * 6) * 3, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function drawShutter(ph) { // RADAR view: a sealed blast-shutter over the porthole — no water visible from here
    if (ph.w < 4) return;
    ctx.save(); ctx.beginPath(); Art.rrect(ctx, ph.x, ph.y, ph.w, ph.h, 10); ctx.clip();
    var g = ctx.createLinearGradient(ph.x, ph.y, ph.x, ph.y + ph.h); g.addColorStop(0, "#1a1f26"); g.addColorStop(0.5, "#10141a"); g.addColorStop(1, "#0a0d11");
    ctx.fillStyle = g; ctx.fillRect(ph.x, ph.y, ph.w, ph.h);
    var step = Math.max(11, ph.h / 9);
    for (var sy = ph.y + step; sy < ph.y + ph.h; sy += step) { ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ph.x, sy); ctx.lineTo(ph.x + ph.w, sy); ctx.stroke();
      ctx.strokeStyle = "rgba(90,104,120,0.16)"; ctx.beginPath(); ctx.moveTo(ph.x, sy + 1.6); ctx.lineTo(ph.x + ph.w, sy + 1.6); ctx.stroke(); }
    Art.text(ctx, "ОБЗОР ЗАКРЫТ", ph.x + ph.w / 2, ph.y + ph.h / 2, Math.max(9, ph.h * 0.085), "rgba(150,170,180,0.45)", "center");
    if (G.leaks.length) { var a = clamp(0.2 + G.leak * 0.5, 0, 0.7);   // water seeps at the sill: you feel a leak, not WHERE
      var sg = ctx.createLinearGradient(ph.x, ph.y + ph.h, ph.x, ph.y + ph.h - 32); sg.addColorStop(0, "rgba(90,150,170," + a.toFixed(2) + ")"); sg.addColorStop(1, "rgba(90,150,170,0)");
      ctx.fillStyle = sg; ctx.fillRect(ph.x, ph.y + ph.h - 32, ph.w, 32); }
    ctx.restore();
    portholeBezel(ph);
  }
  function drawLookOutScene(win) {
    renderForwardBuffer();
    ctx.save(); ctx.beginPath(); Art.rrect(ctx, win.x, win.y, win.w, win.h, 14); ctx.clip();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, win.x, win.y, win.w, win.h);
    var cg = ctx.createRadialGradient(win.x + win.w / 2, win.y + win.h * 0.42, 10, win.x + win.w / 2, win.y + win.h * 0.5, win.w * 0.7);
    cg.addColorStop(0, "rgba(40,90,90,0.16)"); cg.addColorStop(1, "rgba(2,6,8,0)"); ctx.fillStyle = cg; ctx.fillRect(win.x, win.y, win.w, win.h);
    for (var i = 0; i < G.leaks.length; i++) drawLeakJet(G.leaks[i], win);
    var vg = ctx.createRadialGradient(win.x + win.w / 2, win.y + win.h / 2, Math.min(win.w, win.h) * 0.2, win.x + win.w / 2, win.y + win.h / 2, Math.max(win.w, win.h) * 0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(6,16,20,0.5)"); ctx.fillStyle = vg; ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.restore();
    portholeBezel({ x: win.x + 6, y: win.y + 6, w: win.w - 12, h: win.h - 12 });
  }

  function renderDive() {
    layoutStations();
    if (G.view === "window") L._grid = null;   // at the glass you cannot read OR tap the radar — split attention
    var sh = OPT.shake ? G.shake : 0, F = 38;
    var shx = sh ? (Math.sin(G.time * F) * 0.6 + (Math.random() - 0.5)) * sh * 0.8 : 0;
    var shy = sh ? (Math.cos(G.time * F * 0.9) * 0.6 + (Math.random() - 0.5)) * sh * 0.8 : 0;
    ctx.save(); ctx.translate(shx, shy);
    if (G.view === "window") {
      drawTube(0, 0.05);
      drawLookOutScene({ x: L.col.w * 0.2, y: L.top.h, w: W - L.col.w * 0.4, h: H - L.top.h - L.bottom.h * 0.92 });
    } else {
      drawTube(0, 0);
      drawShutter(L.porthole);                          // window is shuttered in radar view
      drawMonitor();
      if (L.tank.w > 2) Art.drawOxygenTank(ctx, L.tank.x, L.tank.y, L.tank.w, L.tank.h, G.oxygen / CFG.startOxygen, G.time);
      if (L.depth.r > 2 && L.depth.cx > -9000) Art.drawDepthGauge(ctx, L.depth.cx, L.depth.cy, L.depth.r, clamp(G.layer / CFG.layers, 0, 1), G.time);
      var vc = STA.valve.scr;
      if (vc && vc.visible) { var oc0 = curCell(); Art.drawValveWheel(ctx, vc.sx, vc.sy, STA.valve.rr * STA.valve.mul, { ang: G.valveAngle, t: G.time, lit: 0.85, active: !!(oc0 && (oc0.hatch || oc0.source)) }); }
    }
    drawLamps(); drawControls();
    poseHands();
    ctx.restore();
    if (G.detonate) drawDetonation();
    else if (G.descentFx) drawDescentFx();
    else Art.drawLeak(ctx, W, H, clamp(G.leak, 0, 1), G.time);   // cabin flooding overlay
    var pxBase = 3 + G.pressure * 1.6 + (G.detonate ? 2 : 0);     // scene coarsens WITH depth (text drawn crisp, after)
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, flash: G.flash, flashCol: G.flashCol, sanity: G.sanity, time: G.time, glitch: G.glitch, pixel: pxBase });
    if (G.heartbeat > 0.25) { ctx.fillStyle = "rgba(150,20,30," + (G.heartbeat * 0.16).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
    if (!G.detonate) { drawRadioPanel(); if (G.view === "window") drawLookOutHUD(); }   // crisp comms/HUD over the pixelated frame
  }
  function poseHands() {
    var h = G.hands, win = (G.view === "window");
    var restY = win ? H * 0.9 : H * 0.95, lipL = W * 0.2, lipR = W * 0.8;
    var crankAct = Math.abs(G.valveSpin) > 0.05, vc2 = STA.valve.scr, ltx, lty, rtx, rty, lR, rR;
    if (win) { // both hands up at the glass; the right reaches the patch toward the leak being sealed
      ltx = W * 0.30; lty = H * 0.66; rtx = W * 0.70; rty = H * 0.66;
      var pat = UI.pressed["patch"], patching = pat != null && G.time - pat < 0.5 && G.leaks.length;
      if (patching) { var lk = G.leaks[G.leaks.length - 1]; rtx = lerp(W * 0.3, W * 0.7, lk.x); rty = H * (0.28 + lk.y * 0.42); }
      lR = 1; rR = patching ? 1 : 0.45;
    } else {
      ltx = (vc2 && vc2.visible) ? vc2.sx : lipL; lty = (vc2 && vc2.visible && crankAct) ? vc2.sy : restY;
      rtx = lipR; rty = restY; var freshest = -1, pick = null, ids = ["ping", "light", "excavate", "patch", "up", "down", "left", "right", "brief"];
      for (var i = 0; i < ids.length; i++) { var t0 = UI.pressed[ids[i]]; if (t0 != null && G.time - t0 < 0.45 && t0 > freshest) { freshest = t0; pick = ids[i]; } }
      if (pick) { var rr = (pick === "up" || pick === "down" || pick === "left" || pick === "right") ? dpadRects()[pick] : L.btn[pick]; if (rr && rr.w > 0) { rtx = rr.x + rr.w / 2; rty = rr.y + rr.h / 2; } }
      lR = crankAct ? 1 : 0; rR = pick ? 1 : 0;
    }
    var sp = 0.18; h.lx += (ltx - h.lx) * sp; h.ly += (lty - h.ly) * sp; h.rx += (rtx - h.rx) * sp; h.ry += (rty - h.ry) * sp;
    h.lR += (lR - h.lR) * sp; h.rR += (rR - h.rR) * sp;
    Art.drawBody(ctx, { t: G.time, w: W, h: H, sanity: G.sanity });
    Art.drawHands(ctx, { lx: h.lx, ly: h.ly, rx: h.rx, ry: h.ry, lReach: h.lR, rReach: h.rR, t: G.time, sanity: G.sanity, restY: restY, w: W, grip: G.hands.grip, pressure: G.pressure });
  }
  function drawLookOutHUD() {
    var y0 = clamp(H * 0.11, 38, 78);
    Art.text(ctx, "ОБЗОР · LOOK-OUT", W * 0.5, y0, clamp(W * 0.02, 13, 20), PAL.bioHi, "center");
    Art.text(ctx, Math.floor(G.depth) + " М   ДАВЛЕНИЕ " + Math.round(G.pressure * 100) + "%", W * 0.5, y0 + clamp(W * 0.022, 16, 24), clamp(W * 0.015, 10, 15), PAL.amber, "center");
    var msg = G.leaks.length ? (G.leaks.length + (G.leaks.length > 1 ? " LEAKS" : " LEAK") + " — PATCH (P)") : "hull holding — back to RADAR (Q)";
    Art.text(ctx, msg, W * 0.5, H - L.bottom.h - 14, clamp(W * 0.016, 11, 16), G.leaks.length ? PAL.bloodHi : PAL.textDim, "center");
  }
  // screen-fixed comms readout (drawn beneath the CRT grade so it reads as a tube)
  function drawRadioPanel() {
    var R = G.radio; if (!R || !R.cur) return;
    var w = clamp(W * 0.62, 280, 760), x = (W - w) / 2, h = clamp(H * 0.10, 52, 86), y = clamp(H * 0.022, 8, 22);
    var sig = clamp(1 - G.threat / 130, 0.25, 1) * (G.sanity < 0.5 ? 0.55 + G.sanity : 1);
    var reveal = clamp(R.t * 32, 0, R.cur.line.length);
    Art.drawRadio(ctx, { x: x, y: y, w: w, h: h }, { speaker: R.cur.speaker, line: R.cur.line, reveal: reveal, t: G.time, live: true, sig: sig });
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

  function drawMonitor() {
    var m = L.monitor, cx0 = m.x + m.w / 2, cy0 = m.y + m.h / 2;
    // riveted steel sonar bezel + engraved labels
    ctx.fillStyle = PAL.steelLo; Art.rrect(ctx, m.x - 8, m.y - 8, m.w + 16, m.h + 16, 12); ctx.fill();
    ctx.strokeStyle = "#05080c"; ctx.lineWidth = 2; Art.rrect(ctx, m.x - 8, m.y - 8, m.w + 16, m.h + 16, 12); ctx.stroke();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1.5; Art.rrect(ctx, m.x - 6, m.y - 6, m.w + 12, m.h + 12, 10); ctx.stroke();
    ctx.fillStyle = PAL.rivet; for (var rv = 0; rv < 16; rv++) { var ra = rv / 16 * Math.PI * 2; ctx.beginPath(); ctx.arc(cx0 + Math.cos(ra) * (m.w / 2 + 7), cy0 + Math.sin(ra) * (m.h / 2 + 7), 1.8, 0, 7); ctx.fill(); }
    Art.text(ctx, "СОНАР / SONAR", cx0, m.y - 11, Math.max(8, m.h * 0.05), PAL.amber, "center");
    Art.text(ctx, "ПР-7", m.x - 2, m.y + m.h + 16, Math.max(7, m.h * 0.042), PAL.textDim, "left");
    Art.text(ctx, "−5200М", m.x + m.w + 2, m.y + m.h + 16, Math.max(7, m.h * 0.042), PAL.textDim, "right");
    // phosphor scope face
    var fg = ctx.createRadialGradient(cx0, cy0, 4, cx0, cy0, m.w * 0.7);
    fg.addColorStop(0, "#06241a"); fg.addColorStop(0.7, "#03160e"); fg.addColorStop(1, "#02100a"); ctx.fillStyle = fg; Art.rrect(ctx, m.x, m.y, m.w, m.h, 6); ctx.fill();
    // grid geometry
    var gap = 2, cellSz = Math.floor(Math.min((m.w - 12 - (G.gw - 1) * gap) / G.gw, (m.h - 12 - (G.gh - 1) * gap) / G.gh));
    cellSz = clamp(cellSz, 6, 56);
    var fullW = G.gw * cellSz + (G.gw - 1) * gap, fullH = G.gh * cellSz + (G.gh - 1) * gap;
    var gx = m.x + (m.w - fullW) / 2, gy = m.y + (m.h - fullH) / 2;
    // ---- sonar scope under the cells: range rings, bearing scale, sweep (reuses G.sweep) ----
    (function sonarScope() {
      var R = Math.min(m.w, m.h) * 0.46, sccx = cx0, sccy = cy0;
      ctx.save(); ctx.beginPath(); Art.rrect(ctx, m.x, m.y, m.w, m.h, 6); ctx.clip();
      ctx.lineWidth = 1;
      for (var rg = 1; rg <= 4; rg++) { var rr = R * rg / 4; ctx.strokeStyle = "rgba(40,150,110," + (0.20 - rg * 0.02).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(sccx, sccy, rr, 0, 7); ctx.stroke();
        ctx.fillStyle = "rgba(70,210,150,0.32)"; ctx.font = Math.max(7, R * 0.05) + "px 'Courier New', monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText((rg * 0.5).toFixed(1), sccx + 2, sccy - rr + R * 0.05); }
      ctx.strokeStyle = "rgba(40,150,110,0.16)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sccx - R, sccy); ctx.lineTo(sccx + R, sccy); ctx.moveTo(sccx, sccy - R); ctx.lineTo(sccx, sccy + R); ctx.stroke();
      for (var bt = 0; bt < 36; bt++) { var ba = bt * 10 * Math.PI / 180 - Math.PI / 2, maj = (bt % 3) === 0, tl = maj ? R * 0.10 : R * 0.05;
        ctx.strokeStyle = "rgba(60,190,135," + (maj ? 0.45 : 0.22) + ")"; ctx.lineWidth = maj ? 1.3 : 1; ctx.beginPath(); ctx.moveTo(sccx + Math.cos(ba) * R, sccy + Math.sin(ba) * R); ctx.lineTo(sccx + Math.cos(ba) * (R - tl), sccy + Math.sin(ba) * (R - tl)); ctx.stroke(); }
      var sw = G.sweep || 0;
      ctx.save(); ctx.beginPath(); ctx.moveTo(sccx, sccy); ctx.arc(sccx, sccy, R, sw - 1.4, sw); ctx.closePath();
      var wg = ctx.createRadialGradient(sccx, sccy, 0, sccx, sccy, R); wg.addColorStop(0, "rgba(80,255,180,0.10)"); wg.addColorStop(1, "rgba(80,255,180,0)"); ctx.fillStyle = wg; ctx.fill(); ctx.restore();
      ctx.strokeStyle = "rgba(140,255,205,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sccx, sccy); ctx.lineTo(sccx + Math.cos(sw) * R, sccy + Math.sin(sw) * R); ctx.stroke();
      ctx.restore(); ctx.textBaseline = "alphabetic";
    })();
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
    var scx = G.sub.cx, scy = G.sub.cy; if (G.transit) { scx += G.transit.dx * G.transit.t * (G.transit.isMine ? 0.5 : 1); scy += G.transit.dy * G.transit.t * (G.transit.isMine ? 0.5 : 1); }
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
    var pb = L.btn.ping;
    // 3D console housing behind the 2x2 button bank
    if (pb.w > 2 && L.btn.patch.w > 2) { var bx0 = Math.min(pb.x, L.btn.light.x), by0 = Math.min(pb.y, L.btn.excavate.y),
      bx1 = Math.max(L.btn.excavate.x + L.btn.excavate.w, L.btn.patch.x + L.btn.patch.w), by1 = Math.max(L.btn.light.y + L.btn.light.h, L.btn.patch.y + L.btn.patch.h);
      if (bx1 > bx0) Art.consoleHousing(ctx, { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }, { inset: 9 }); }
    for (var i = 0; i < effPings(); i++) { var on = i < G.pings; var dx = pb.x + 8 + i * 12, dy = pb.y - 8; ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, 7); ctx.fillStyle = on ? PAL.bioHi : "#13201a"; ctx.fill(); ctx.strokeStyle = PAL.phosLo; ctx.lineWidth = 1; ctx.stroke(); }
    var radar = G.view === "radar", win = !radar, narrow = L.btn.excavate.w < 88;
    Art.button(ctx, pb, "PING", { primary: G.pingFlash > 0.4, hover: UI.hover === "ping", disabled: !radar || G.pings <= 0, depth: btnDepth("ping") });
    Art.button(ctx, L.btn.light, win ? "▣ RADAR" : "◉ LOOK", { primary: win, hover: UI.hover === "light", depth: btnDepth("light") });
    Art.button(ctx, L.btn.excavate, narrow ? "FLAG" : "FLAG ⚑", { hover: UI.hover === "excavate", disabled: !radar, depth: btnDepth("excavate") });
    Art.button(ctx, L.btn.patch, "PATCH", { primary: win && G.leaks.length > 0, hover: UI.hover === "patch", disabled: !win || G.leaks.length === 0, depth: btnDepth("patch") });
    // crank is the diegetic VALVE WHEEL (drawn in renderDive); no flat crank button here.
    Art.button(ctx, L.btn.brief, "?", { hover: UI.hover === "brief", depth: btnDepth("brief") });
    var d = dpadRects();
    if (d.up.w > 2) Art.consoleHousing(ctx, { x: d.left.x, y: d.up.y, w: (d.right.x + d.right.w) - d.left.x, h: (d.down.y + d.down.h) - d.up.y }, { inset: 7 });
    Art.button(ctx, d.up, "▲", { hover: UI.hover === "up", depth: btnDepth("up") }); Art.button(ctx, d.down, "▼", { hover: UI.hover === "down", depth: btnDepth("down") });
    Art.button(ctx, d.left, "◄", { hover: UI.hover === "left", depth: btnDepth("left") }); Art.button(ctx, d.right, "►", { hover: UI.hover === "right", depth: btnDepth("right") });
  }

  // a MINE goes off: white-hot bloom, rupture shake, glass shatter, then the cabin floods black. No creature.
  function drawDetonation() {
    var dt = G.detonate, dur = Math.max(0.3, dt.until - dt.t0), k = clamp((G.time - dt.t0) / dur, 0, 1);
    var seed = (dt.t0 * 1000) | 0;
    function nz(i) { var s = (seed ^ (i * 2654435761)) >>> 0; s = Math.imul(s ^ (s >>> 15), 1 | s); s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s; return ((s ^ (s >>> 14)) >>> 0) / 4294967296; }
    ctx.fillStyle = "#020305"; ctx.fillRect(0, 0, W, H);
    // (1) white-hot blast bloom from the detonation point, fast falloff
    if (k < 0.4) { var bk = 1 - k / 0.4, bg = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * (0.3 + k));
      bg.addColorStop(0, "rgba(255,235,180," + (0.95 * bk).toFixed(2) + ")"); bg.addColorStop(0.4, "rgba(255,150,60," + (0.6 * bk).toFixed(2) + ")"); bg.addColorStop(1, "rgba(40,10,4,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    // (2) violent rupture shake
    var shk = (1 - clamp(k / 0.55, 0, 1)) * 30, jx = (Math.random() - 0.5) * shk, jy = (Math.random() - 0.5) * shk;
    ctx.save(); ctx.translate(jx, jy);
    // (3) the glass SHATTERS — white fractures spider out, grow with k
    if (k > 0.04) {
      var grow = clamp((k - 0.04) / 0.22, 0, 1), ix = W * (0.5 + (nz(0) - 0.5) * 0.2), iy = H * (0.46 + (nz(1) - 0.5) * 0.2);
      ctx.save(); ctx.globalAlpha = clamp(1 - (k - 0.5) / 0.45, 0, 1); ctx.strokeStyle = "rgba(228,240,244,0.9)"; ctx.lineJoin = "round";
      for (var a = 0; a < 9; a++) { var ang = a / 9 * Math.PI * 2 + nz(a + 5) * 0.6, len = (Math.max(W, H) * (0.2 + nz(a + 9) * 0.4)) * grow;
        ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ix, iy);
        for (var sgi = 1; sgi <= 4; sgi++) { var f = sgi / 4; ctx.lineTo(ix + Math.cos(ang + (nz(a * 9 + sgi) - 0.5) * 0.6) * len * f, iy + Math.sin(ang + (nz(a * 9 + sgi + 1) - 0.5) * 0.6) * len * f); }
        ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore(); // end shake
    // (4) black water floods up and swallows the frame
    if (k > 0.22) { var fk = clamp((k - 0.22) / 0.78, 0, 1), fy = H - H * (0.18 + fk * 1.1);
      var fg = ctx.createLinearGradient(0, fy, 0, H); fg.addColorStop(0, "rgba(6,12,16," + (0.4 + fk * 0.4).toFixed(2) + ")"); fg.addColorStop(1, "rgba(1,3,5," + (0.8 + fk * 0.2).toFixed(2) + ")");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(0, fy); for (var x2 = 0; x2 <= W; x2 += W / 14) ctx.lineTo(x2, fy + Math.sin(x2 * 0.02 + G.time * 3) * (6 + fk * 6)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); }
    if (k > 0.6) { ctx.fillStyle = "rgba(1,3,5," + (((k - 0.6) / 0.4) * 0.85).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
  }

  // ---------------- title / help / options / end ----------------
  function renderSceneBackground() { var bw = buf.width, bh = buf.height; bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bw, bh); Art.drawTitle(bctx, bw, bh, G ? G.time : 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W, H); }
  function renderTitle() {
    renderSceneBackground();
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, time: G.time, glitch: (G.time < 1.4 ? 0.6 : 0), pixel: 2.6 }); // pixelate the backdrop; UI stays crisp on top
    Art.drawTitleStamp(ctx, W, H, G.time); // Cyrillic stencil + recorder OSD + boot flicker
    Art.wrapText(ctx, S.tagline, W / 2, H * 0.37, clamp(W * 0.5, 280, 640), clamp(W * 0.016, 10, 16), PAL.textDim);
    UI.menu = []; var bw = clamp(W * 0.4, 220, 340), bh = clamp(H * 0.075, 44, 62), bx = (W - bw) / 2, by = H * 0.52, gap = 14;
    var labels = [[S.menu_dive, "dive", true], [S.menu_help, "help", false], [S.menu_options, "options", false]];
    for (var i = 0; i < labels.length; i++) { var r = { x: bx, y: by + i * (bh + gap), w: bw, h: bh }; Art.button(ctx, r, labels[i][0], { primary: labels[i][2], hover: UI.hover === "m" + i || (G.padActive && G.menuSel === i) }); UI.menu.push({ r: r, act: labels[i][1] }); }
  }
  function renderHelp() {
    renderSceneBackground();
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, time: G.time, pixel: 2.6 });
    var x = clamp(W * 0.08, 18, 180), y = clamp(H * 0.07, 30, 90), w = W - x * 2;
    Art.text(ctx, S.help_title, W / 2, y, clamp(W * 0.045, 22, 40), PAL.phosHi, "center");
    var fs = clamp(W * 0.015, 11, 15), yy = y + fs * 2.2;
    for (var i = 0; i < S.help_lines.length; i++) yy += Art.wrapText(ctx, "• " + S.help_lines[i], W / 2, yy, w, fs, PAL.text) * (fs + 4) + 5;
    yy += 6; Art.wrapText(ctx, S.help_controls, W / 2, yy, w, fs * 0.92, PAL.amber);
    UI.backBtn = { x: W / 2 - 90, y: H - clamp(H * 0.11, 54, 100), w: 180, h: 46 }; Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
  }
  function renderOptions() {
    renderSceneBackground();
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, time: G.time, pixel: 2.6 });
    var y = clamp(H * 0.16, 50, 140); Art.text(ctx, S.options_title, W / 2, y, clamp(W * 0.05, 24, 44), PAL.phosHi, "center");
    var rows = [[S.opt_sound, "sound"], [S.opt_shake, "shake"], [S.opt_scanlines, "scanlines"]]; UI.optHit = [];
    var rw = clamp(W * 0.6, 280, 460), rx = (W - rw) / 2, rh = 54, ry = y + 40;
    for (var i = 0; i < rows.length; i++) { var r = { x: rx, y: ry + i * (rh + 12), w: rw, h: rh }; ctx.fillStyle = "rgba(10,14,20,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.strokeStyle = "rgba(90,100,114,0.5)"; Art.rrect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
      Art.text(ctx, rows[i][0], r.x + 14, r.y + r.h / 2 + 6, 16, PAL.text, "left"); var on = OPT[rows[i][1]], tr = { x: r.x + r.w - 86, y: r.y + 11, w: 72, h: 32 }; Art.button(ctx, tr, on ? S.opt_on : S.opt_off, { primary: on }); UI.optHit.push({ r: tr, key: rows[i][1] }); }
    UI.backBtn = { x: W / 2 - 90, y: ry + rows.length * (rh + 12) + 16, w: 180, h: 48 }; Art.button(ctx, UI.backBtn, S.menu_back, { hover: UI.hover === "back" });
  }
  function renderEnd() {
    renderSceneBackground(); ctx.fillStyle = "rgba(2,4,8,0.8)"; ctx.fillRect(0, 0, W, H);
    Art.overlay(ctx, W, H, { scanlines: OPT.scanlines, time: G.time, glitch: G.won ? 0 : 0.3, pixel: 2.6 }); // pixelate the backdrop; text stays crisp on top
    var win = G.won;
    var title = win ? S.win_title : G.endKind === "hull" ? S.lose_hull : G.endKind === "mine" ? S.lose_mine : S.lose_oxygen;
    var body = win ? S.win_body : G.endKind === "hull" ? S.lose_hull_body : G.endKind === "mine" ? S.lose_mine_body : S.lose_oxygen_body;
    var y = clamp(H * 0.2, 70, 190); Art.text(ctx, title, W / 2, y, clamp(W * 0.06, 28, 56), win ? PAL.bioHi : PAL.bloodHi, "center");
    Art.wrapText(ctx, body, W / 2, y + clamp(W * 0.05, 34, 56), clamp(W * 0.7, 280, 720), clamp(W * 0.018, 13, 19), PAL.text);
    Art.text(ctx, fmt(S.end_depth, { d: Math.floor(G.depth) }), W / 2, y + clamp(W * 0.05, 34, 56) + 104, 14, PAL.amber, "center");
    UI.contBtn = { x: W / 2 - 120, y: H - clamp(H * 0.16, 84, 140), w: 240, h: 52 }; Art.button(ctx, UI.contBtn, S.again, { primary: true, hover: UI.hover === "cont" });
    drawRadioPanel(); // Sergey's last words land on the comms readout
  }

  // ---------------- input ----------------
  var UI = { overlay: null, hover: null, menu: [], optHit: [], pressed: {} };
  var holdTimer = null, holdFired = false, holdCell = null;
  // ---- continuous drive: held WSAD / arrows / d-pad re-pump cell-to-cell at the transit cadence ----
  var heldDirs = [], padHeld = null;
  var DIR_OF = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  function pushDir(dx, dy) { for (var i = heldDirs.length - 1; i >= 0; i--) if (heldDirs[i].dx === dx && heldDirs[i].dy === dy) heldDirs.splice(i, 1); heldDirs.push({ dx: dx, dy: dy }); }
  function popDir(dx, dy) { for (var i = heldDirs.length - 1; i >= 0; i--) if (heldDirs[i].dx === dx && heldDirs[i].dy === dy) heldDirs.splice(i, 1); }
  function clearDirs() { heldDirs.length = 0; padHeld = null; }
  function pumpHeldDrive() { if (!heldDirs.length || G.scene !== "dive" || G.view !== "radar" || G.transit || G.detonate || G.descentFx) return; var d = heldDirs[heldDirs.length - 1]; tryDrive(d.dx, d.dy); }
  function dpadDirAt(p) { var d = dpadRects(); if (inside(d.up, p)) return [0, -1]; if (inside(d.down, p)) return [0, 1]; if (inside(d.left, p)) return [-1, 0]; if (inside(d.right, p)) return [1, 0]; return null; }
  function pt(e) { var rect = canvas.getBoundingClientRect(); var s = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e; return { x: s.clientX - rect.left, y: s.clientY - rect.top }; }
  function gridCellAt(p) { if (!L._grid) return null; var g = L._grid; var cx = Math.floor((p.x - g.gx) / (g.cell + g.gap)), cy = Math.floor((p.y - g.gy) / (g.cell + g.gap)); if (cx < 0 || cy < 0 || cx >= G.gw || cy >= G.gh) return null; return { x: cx, y: cy }; }

  function onDown(p) {
    Audio.init(); if (!G) return;
    if (UI.overlay) { if (UI.overlay === "options" && UI.optHit) for (var i = 0; i < UI.optHit.length; i++) if (inside(UI.optHit[i].r, p)) { OPT[UI.optHit[i].key] = !OPT[UI.optHit[i].key]; saveOpt(); Audio.setEnabled(OPT.sound); Audio.card(); return; } if (inside(UI.backBtn, p)) { UI.overlay = null; Audio.card(); } return; }
    if (G.scene === "intro") { if (Audio.card) Audio.card(); cineSkip(); return; } // tap anywhere skips the cutscene
    if (G.scene === "dive") return onDiveDown(p);
    if (G.scene === "end") { if (inside(UI.contBtn, p)) { Audio.card(); beginIntro(); } return; } // retry replays the descent
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) { var act = UI.menu[m].act; Audio.card(); if (act === "dive") beginIntro(); else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; return; }
  }
  function onDiveDown(p) {
    G.idleT = 0; // any cabin interaction breaks the "idle" tutorial/whisper timer
    if (inside(L.btn.light, p)) { toggleLight(); return; }   // LOOK OUT / RADAR toggle works in both views
    if (inside(L.btn.patch, p)) { patch(); return; }
    if (inside(L.btn.ping, p)) { ping(); return; }
    if (inside(L.btn.excavate, p)) { flagFaced(); return; }
    if (inside(L.btn.crank, p)) { crank(); return; }
    if (inside(L.btn.brief, p)) { UI.overlay = "help"; return; }
    var pd = dpadDirAt(p);
    if (pd) { padHeld = pd; pushDir(pd[0], pd[1]); if (!G.transit && !G.detonate) tryDrive(pd[0], pd[1]); return; } // press-and-hold = continuous drive
    var gc = gridCellAt(p);   // tap a grid cell: adjacent -> drive into it (only meaningful in radar view; L._grid is null at the glass)
    if (gc) { var ddx = gc.x - G.sub.cx, ddy = gc.y - G.sub.cy; if (Math.abs(ddx) + Math.abs(ddy) === 1) tryDrive(ddx, ddy); }
  }
  function onHover(p) { UI.hover = null; if (!G) return;
    if (UI.overlay) { if (inside(UI.backBtn, p)) UI.hover = "back"; return; }
    if (G.scene === "intro") { UI.hover = (UI.skipBtn && inside(UI.skipBtn, p)) ? "skip" : null; return; }
    if (G.scene === "dive") { var bb = L.btn; if (inside(bb.ping, p)) UI.hover = "ping"; else if (inside(bb.light, p)) UI.hover = "light"; else if (inside(bb.excavate, p)) UI.hover = "excavate"; else if (inside(bb.patch, p)) UI.hover = "patch"; else if (inside(bb.crank, p)) UI.hover = "crank"; else if (inside(bb.brief, p)) UI.hover = "brief"; else { var d = dpadRects(); for (var key in d) if (inside(d[key], p)) { UI.hover = key; break; } } return; }
    if (G.scene === "end") { if (inside(UI.contBtn, p)) UI.hover = "cont"; return; }
    for (var m = 0; m < UI.menu.length; m++) if (inside(UI.menu[m].r, p)) UI.hover = "m" + m;
  }

  // look-around: dragging an EMPTY part of the cabin pans the camera; pressing a control still acts.
  var drag = { down: false, look: false, lx: 0, ly: 0, moved: 0 };
  function overControl(p) { // is this point on an interactive station? (then it's a tap, never a look-drag)
    if (!G || G.scene !== "dive" || UI.overlay) return false;
    var b = L.btn; if (inside(b.ping, p) || inside(b.light, p) || inside(b.excavate, p) || inside(b.patch, p) || inside(b.crank, p) || inside(b.brief, p)) return true;
    var d = dpadRects(); for (var k in d) if (inside(d[k], p)) return true;
    return false;
  }
  function applyLook(dx, dy) {} // FIXED camera now — drag never pans the view
  function canLook(p) { return false; } // no free-look; the camera is fixed (toggle RADAR/WINDOW instead)

  canvas.addEventListener("mousedown", function (e) { var p = pt(e); drag.down = true; drag.lx = p.x; drag.ly = p.y; drag.moved = 0;
    if (canLook(p)) drag.look = true; else { drag.look = false; onDown(p); } });
  canvas.addEventListener("mousemove", function (e) { var p = pt(e);
    if (drag.down && drag.look) { var dx = p.x - drag.lx, dy = p.y - drag.ly; drag.lx = p.x; drag.ly = p.y; drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 8) applyLook(dx, dy); }
    else onHover(p); });
  canvas.addEventListener("mouseup", function () { drag.down = false; drag.look = false; if (padHeld) { popDir(padHeld[0], padHeld[1]); padHeld = null; } });
  canvas.addEventListener("mouseleave", function () { drag.down = false; drag.look = false; if (padHeld) { popDir(padHeld[0], padHeld[1]); padHeld = null; } });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); if (G && G.scene === "dive" && !UI.overlay) { var gc = gridCellAt(pt(e)); if (gc) flagCell(cell(gc.x, gc.y)); } });

  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); var p = pt(e); holdFired = false;
    drag.down = true; drag.look = false; drag.acted = false; drag.lx = p.x; drag.ly = p.y; drag.moved = 0;
    holdCell = (G && G.scene === "dive" && !UI.overlay) ? gridCellAt(p) : null;
    if (holdCell) { var hc = holdCell; holdTimer = setTimeout(function () { holdFired = true; flagCell(cell(hc.x, hc.y)); }, 380); }
    else if (canLook(p)) drag.look = true;       // empty cabin -> look candidate (acts on touchend if no drag)
    else { onDown(p); drag.acted = true; }        // a control -> act immediately
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) { e.preventDefault(); var p = pt(e);
    if (padHeld && !dpadDirAt(p)) { popDir(padHeld[0], padHeld[1]); padHeld = null; } // finger slid off the d-pad -> stop
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (drag.down && drag.look) { var dx = p.x - drag.lx, dy = p.y - drag.ly; drag.lx = p.x; drag.ly = p.y; drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 12) applyLook(dx, dy); }
  }, { passive: false });
  canvas.addEventListener("touchend", function (e) { e.preventDefault(); if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    var wasLook = drag.look && drag.moved > 12, acted = drag.acted; drag.down = false; drag.look = false; drag.acted = false; holdCell = null;
    if (padHeld) { popDir(padHeld[0], padHeld[1]); padHeld = null; } // release held d-pad drive
    if (holdFired || wasLook || acted) return;   // flagged / looked / control already acted
    onDown(pt(e));                                // grid-cell tap drives; empty tap is a harmless no-op
  }, { passive: false });
  canvas.addEventListener("touchcancel", function () { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } clearDirs(); drag.down = false; drag.look = false; drag.acted = false; holdCell = null; }, { passive: false });

  window.addEventListener("keydown", function (e) {
    var code = e.code; if (!G) return;
    if (UI.overlay) { if (code === "Escape" || code === "Enter" || code === "Space" || code === "KeyH") { UI.overlay = null; e.preventDefault(); } return; }
    if (code === "KeyH") { UI.overlay = "help"; e.preventDefault(); return; }
    if (G.scene === "dive") {
      if (DIR_OF[code]) { if (!e.repeat) { var dd = DIR_OF[code]; pushDir(dd[0], dd[1]); G.idleT = 0; if (!G.transit && !G.detonate) tryDrive(dd[0], dd[1]); } e.preventDefault(); }
      else if (code === "Space") { ping(); e.preventDefault(); }
      else if (code === "KeyF") { flagFaced(); e.preventDefault(); }
      else if (code === "KeyL" || code === "KeyQ") { toggleLight(); e.preventDefault(); } // LOOK OUT / RADAR toggle
      else if (code === "KeyC") { crank(); e.preventDefault(); }
      else if (code === "KeyP") { patch(); e.preventDefault(); }
      else if (code === "Escape") { UI.overlay = "options"; }
    }
    else if (G.scene === "intro") { if (code === "Escape" || code === "Enter" || code === "Space") { cineSkip(); e.preventDefault(); } }
    else if (G.scene === "end") { if (code === "Enter" || code === "Space") { beginIntro(); e.preventDefault(); } }
    else { if (code === "Enter" || code === "Space") { beginIntro(); e.preventDefault(); } } // title -> intro cutscene -> dive
  });
  window.addEventListener("keyup", function (e) { var d = DIR_OF[e.code]; if (d) { popDir(d[0], d[1]); e.preventDefault(); } });

  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : []; if (!G) return;
    for (var g = 0; g < pads.length; g++) { var gp = pads[g]; if (!gp) continue; var b = gp.buttons, ax = gp.axes || []; G.padActive = true;
      function pressed(i) { return b[i] && b[i].pressed && !padPrev[i]; }
      if (UI.overlay) { if (pressed(0) || pressed(1) || pressed(9)) UI.overlay = null; }
      else if (G.scene === "dive") {
        if (pressed(12) || (ax[1] < -0.5 && !padPrev._u)) tryDrive(0, -1); if (pressed(13) || (ax[1] > 0.5 && !padPrev._d)) tryDrive(0, 1);
        if (pressed(14) || (ax[0] < -0.5 && !padPrev._l)) tryDrive(-1, 0); if (pressed(15) || (ax[0] > 0.5 && !padPrev._r)) tryDrive(1, 0);
        if (pressed(0)) ping(); if (pressed(2)) flagFaced(); if (pressed(1) || pressed(6) || pressed(7)) toggleLight(); if (pressed(4)) patch(); if (pressed(5)) crank(); if (pressed(9)) UI.overlay = "help";
        padPrev._u = ax[1] < -0.5; padPrev._d = ax[1] > 0.5; padPrev._l = ax[0] < -0.5; padPrev._r = ax[0] > 0.5;
      } else if (G.scene === "intro") { if (pressed(0) || pressed(9) || pressed(1)) cineSkip(); }
      else if (G.scene === "end") { if (pressed(0) || pressed(9)) beginIntro(); }
      else { if (pressed(12)) G.menuSel = (G.menuSel + UI.menu.length - 1) % (UI.menu.length || 1); if (pressed(13)) G.menuSel = (G.menuSel + 1) % (UI.menu.length || 1);
        if (pressed(0) || pressed(9)) { var act = UI.menu[G.menuSel] ? UI.menu[G.menuSel].act : "dive"; if (act === "dive") beginIntro(); else if (act === "help") UI.overlay = "help"; else if (act === "options") UI.overlay = "options"; } }
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
  window.DREADNOUGHT = { G: function () { return G; }, newRun: newRun, startRun: startRun, drive: tryDrive, ping: ping, flagFaced: flagFaced, toggleView: toggleView, toggleLight: toggleLight, patch: patch, crank: crank, moveAnglers: moveAnglers, descend: descend, spawnLeak: spawnLeak, radioQueue: radioQueue, OPT: OPT };
})();
