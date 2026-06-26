/* DREADNOUGHT — procedural audio (WebAudio). No asset files, no network.
 * Ambient drone + threat layer + one-shot SFX, all synthesized.
 * Master chain ends in a compressor/limiter for ear-safety (mix true-peak low). */
(function (root) {
  "use strict";

  var A = {
    ctx: null, master: null, limiter: null,
    musicBus: null, sfxBus: null,
    ambient: null, threat: null,        // sustained music voices
    enabled: true, started: false,
    _groanTimer: null, _which: "none",
  };

  function now() { return A.ctx.currentTime; }

  function noiseBuffer(seconds) {
    var len = Math.floor(A.ctx.sampleRate * seconds);
    var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  A.init = function () {
    if (A.started) { try { if (A.ctx && A.ctx.state === "suspended") A.ctx.resume(); } catch (e) {} return; }
    try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { A.enabled = false; A.started = true; return; }
    A.ctx = new Ctx();
    A.started = true;

    A.master = A.ctx.createGain();
    A.master.gain.value = A.enabled ? 0.85 : 0.0001;
    A.limiter = A.ctx.createDynamicsCompressor();
    A.limiter.threshold.value = -6; A.limiter.knee.value = 6;
    A.limiter.ratio.value = 12; A.limiter.attack.value = 0.003; A.limiter.release.value = 0.18;
    A.master.connect(A.limiter); A.limiter.connect(A.ctx.destination);

    A.musicBus = A.ctx.createGain(); A.musicBus.gain.value = 0.55; A.musicBus.connect(A.master);
    A.sfxBus = A.ctx.createGain(); A.sfxBus.gain.value = 1.0; A.sfxBus.connect(A.master);

    buildMusic();
    A.setMusic("ambient");
    scheduleGroans();
    } catch (e) { A.enabled = false; A.started = true; if (window.console) console.warn("audio disabled:", e && e.message); }
  };

  // ---- sustained music voices ----
  function buildMusic() {
    // shared cavern delay for spaciousness
    var delay = A.ctx.createDelay(1.0); delay.delayTime.value = 0.33;
    var fb = A.ctx.createGain(); fb.gain.value = 0.32;
    delay.connect(fb); fb.connect(delay);
    var wet = A.ctx.createGain(); wet.gain.value = 0.4; delay.connect(wet); wet.connect(A.musicBus);
    A._delay = delay;

    // AMBIENT: low detuned drone + airy noise bed
    var ag = A.ctx.createGain(); ag.gain.value = 0; ag.connect(A.musicBus); ag.connect(delay);
    var freqs = [41.2, 55, 61.7]; // low E / A-ish cluster
    for (var i = 0; i < freqs.length; i++) {
      var o = A.ctx.createOscillator(); o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = freqs[i]; o.detune.value = (i - 1) * 7;
      var g = A.ctx.createGain(); g.gain.value = 0.12 / (i + 1);
      o.connect(g); g.connect(ag); o.start();
      // slow tremor
      var lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
      var ld = A.ctx.createGain(); ld.gain.value = 0.04; lfo.connect(ld); ld.connect(g.gain); lfo.start();
    }
    var nb = A.ctx.createBufferSource(); nb.buffer = noiseBuffer(3); nb.loop = true;
    var nf = A.ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 220; nf.Q.value = 2;
    var ng = A.ctx.createGain(); ng.gain.value = 0.05;
    nb.connect(nf); nf.connect(ng); ng.connect(ag); nb.start();
    A.ambient = ag;

    // THREAT: dissonant pulsing low cluster.
    // tg = on/off envelope (driven by setMusic); inner = LFO-pulsed motion.
    var tg = A.ctx.createGain(); tg.gain.value = 0; tg.connect(A.musicBus); tg.connect(delay);
    var inner = A.ctx.createGain(); inner.gain.value = 0.5; inner.connect(tg);
    var tfreqs = [49, 52, 73.5]; // minor-second tension
    for (var k = 0; k < tfreqs.length; k++) {
      var to = A.ctx.createOscillator(); to.type = "sawtooth"; to.frequency.value = tfreqs[k]; to.detune.value = k * 5;
      var tf = A.ctx.createBiquadFilter(); tf.type = "lowpass"; tf.frequency.value = 320; tf.Q.value = 4;
      var tgg = A.ctx.createGain(); tgg.gain.value = 0.07;
      to.connect(tf); tf.connect(tgg); tgg.connect(inner); to.start();
    }
    var pulse = A.ctx.createOscillator(); pulse.type = "sine"; pulse.frequency.value = 1.6;
    var pd = A.ctx.createGain(); pd.gain.value = 0.35; pulse.connect(pd); pd.connect(inner.gain); pulse.start();
    A.threat = tg;
  }

  A.setMusic = function (which) {
    if (!A.started || !A.enabled) { A._which = which; return; }
    A._which = which;
    var t = now();
    rampTo(A.ambient.gain, which === "ambient" ? 1 : 0.0001, 2.5);
    rampTo(A.threat.gain, which === "threat" ? 1 : 0.0001, which === "threat" ? 0.6 : 2.5);
  };

  function rampTo(param, v, secs) {
    try { param.cancelScheduledValues(now()); param.setTargetAtTime(v, now(), secs / 3); } catch (e) {}
  }

  function scheduleGroans() {
    if (A._groanTimer) clearInterval(A._groanTimer);
    A._groanTimer = setInterval(function () {
      if (!A.started || !A.enabled || A.ctx.state !== "running") return;
      if (Math.random() < 0.55) A.groan();
    }, 6500 + Math.random() * 4000);
  }

  // ---- one-shot helpers ----
  function osc(type, freq, dest) {
    var o = A.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(dest); return o;
  }
  function env(param, t0, a, peak, d, end) {
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, end == null ? 0.0001 : end), t0 + a + d);
  }

  A.groan = function () {
    if (!ok()) return;
    var t = now(), g = A.ctx.createGain(); g.connect(A.musicBus);
    var bp = A.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 120; bp.Q.value = 3;
    var oo = A.ctx.createOscillator(); oo.type = "sawtooth";
    oo.frequency.setValueAtTime(64 + Math.random() * 16, t);
    oo.frequency.exponentialRampToValueAtTime(32, t + 2.6);
    oo.connect(bp); bp.connect(g);
    env(g.gain, t, 0.8, 0.16, 2.2, 0.0001);
    oo.start(t); oo.stop(t + 3.2); cleanup(oo, g, t + 3.4);
  };

  function ok() { return A.started && A.enabled && A.ctx; }
  function cleanup(node, g, when) {
    setTimeout(function () { try { node.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} },
      Math.max(0, (when - now()) * 1000) + 60);
  }

  // ---- SFX ----
  A.ping = function () {
    if (!ok()) return;
    var t = now();
    var delay = A.ctx.createDelay(0.6); delay.delayTime.value = 0.18;
    var fb = A.ctx.createGain(); fb.gain.value = 0.4; delay.connect(fb); fb.connect(delay);
    var g = A.ctx.createGain(); g.connect(A.sfxBus); delay.connect(A.sfxBus);
    var o = osc("sine", 760, g); o.frequency.exponentialRampToValueAtTime(420, t + 0.18);
    g.connect(delay);
    env(g.gain, t, 0.005, 0.5, 0.32, 0.0001);
    o.start(t); o.stop(t + 0.5); cleanup(o, g, t + 1.2);
  };

  A.alert = function () {
    if (!ok()) return;
    var t = now();
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.18;
      var g = A.ctx.createGain(); g.connect(A.sfxBus);
      var o = osc("square", 300, g);
      env(g.gain, tt, 0.004, 0.28, 0.12, 0.0001);
      o.start(tt); o.stop(tt + 0.16); cleanup(o, g, tt + 0.3);
    }
  };

  A.scan = function () {
    if (!ok()) return;
    var t = now();
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(0.5);
    var bp = A.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 6;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
    var g = A.ctx.createGain(); src.connect(bp); bp.connect(g); g.connect(A.sfxBus);
    env(g.gain, t, 0.01, 0.3, 0.4, 0.0001);
    src.start(t); src.stop(t + 0.45); cleanup(src, g, t + 0.6);
  };

  A.card = function () {
    if (!ok()) return;
    var t = now();
    var g = A.ctx.createGain(); g.connect(A.sfxBus);
    var o = osc("square", 180, g); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    env(g.gain, t, 0.002, 0.3, 0.06, 0.0001);
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(0.05);
    var hp = A.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2000;
    var ng = A.ctx.createGain(); ng.gain.value = 0.2; src.connect(hp); hp.connect(ng); ng.connect(A.sfxBus);
    o.start(t); o.stop(t + 0.08); src.start(t); src.stop(t + 0.05); cleanup(o, g, t + 0.2);
  };

  A.damage = function () {
    if (!ok()) return;
    var t = now();
    var g = A.ctx.createGain(); g.connect(A.sfxBus);
    var o = osc("sine", 90, g); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    env(g.gain, t, 0.004, 0.7, 0.45, 0.0001);
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(0.4);
    var lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    var ng = A.ctx.createGain(); ng.gain.value = 0.5; src.connect(lp); lp.connect(ng); ng.connect(A.sfxBus);
    env(ng.gain, t, 0.004, 0.5, 0.4, 0.0001);
    o.start(t); o.stop(t + 0.5); src.start(t); src.stop(t + 0.4); cleanup(o, g, t + 0.7);
  };

  A.roar = function () {
    if (!ok()) return;
    var t = now();
    var delay = A._delay || A.sfxBus;
    var g = A.ctx.createGain(); g.connect(A.sfxBus); if (A._delay) g.connect(A._delay);
    var lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.5); lp.frequency.exponentialRampToValueAtTime(120, t + 2.2);
    lp.connect(g);
    var fr = [44, 47, 66];
    for (var i = 0; i < fr.length; i++) {
      var o = A.ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(fr[i] * 0.8, t); o.frequency.exponentialRampToValueAtTime(fr[i] * 1.4, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(fr[i] * 0.7, t + 2.2); o.detune.value = i * 6;
      o.connect(lp); o.start(t); o.stop(t + 2.4); cleanup(o, g, t + 3.2);
    }
    env(g.gain, t, 0.15, 0.6, 2.1, 0.0001);
  };

  A.good = function () { // steady / positive
    if (!ok()) return;
    var t = now(), notes = [196, 261.6, 329.6];
    for (var i = 0; i < notes.length; i++) {
      var g = A.ctx.createGain(); g.connect(A.sfxBus);
      var o = osc("triangle", notes[i], g);
      var tt = t + i * 0.05;
      env(g.gain, tt, 0.04, 0.18, 0.5, 0.0001);
      o.start(tt); o.stop(tt + 0.6); cleanup(o, g, tt + 0.8);
    }
  };

  A.vent = function () {
    if (!ok()) return;
    var t = now();
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(0.8);
    var bp = A.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    var g = A.ctx.createGain(); src.connect(bp); bp.connect(g); g.connect(A.sfxBus);
    env(g.gain, t, 0.02, 0.32, 0.7, 0.0001);
    src.start(t); src.stop(t + 0.8); cleanup(src, g, t + 1);
  };

  A.descend = function () {
    if (!ok()) return;
    var t = now();
    var g = A.ctx.createGain(); g.connect(A.sfxBus);
    var o = osc("sine", 70, g); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    env(g.gain, t, 0.2, 0.5, 1.3, 0.0001);
    o.start(t); o.stop(t + 1.6); cleanup(o, g, t + 1.8);
  };

  A.win = function () {
    if (!ok()) return;
    var t = now(), notes = [55, 82.4, 110, 164.8];
    for (var i = 0; i < notes.length; i++) {
      var g = A.ctx.createGain(); g.connect(A.sfxBus);
      var o = osc(i % 2 ? "triangle" : "sine", notes[i], g);
      env(g.gain, t, 0.6, 0.22, 3.5, 0.0001);
      o.start(t); o.stop(t + 4.2); cleanup(o, g, t + 4.5);
    }
  };

  A.lose = function () {
    if (!ok()) return;
    var t = now();
    var g = A.ctx.createGain(); g.connect(A.sfxBus);
    var o = osc("sawtooth", 110, g); o.frequency.exponentialRampToValueAtTime(28, t + 2.2);
    var lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    o.disconnect(); o.connect(lp); lp.connect(g);
    env(g.gain, t, 0.05, 0.45, 2.2, 0.0001);
    o.start(t); o.stop(t + 2.4); cleanup(o, g, t + 2.6);
  };

  A.setEnabled = function (on) {
    A.enabled = on;
    if (A.master) rampTo(A.master.gain, on ? 0.85 : 0.0001, 0.2);
  };

  root.DN = root.DN || {};
  root.DN.Audio = A;
})(typeof window !== "undefined" ? window : this);
