/* DREADNOUGHT — deterministic seeded RNG (mulberry32).
 * Same seed -> same descent, contacts and draws (game-design-system §12.1). */
(function (root) {
  "use strict";

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // RNG object: seedable, with handy helpers used across the game.
  function RNG(seed) {
    var seedStr = String(seed == null ? "DREADNOUGHT" : seed);
    var seedFn = xmur3(seedStr);
    this.seedStr = seedStr;
    this._next = mulberry32(seedFn());
  }
  RNG.prototype.float = function () { return this._next(); };
  RNG.prototype.range = function (min, max) { return min + (max - min) * this._next(); };
  RNG.prototype.int = function (min, max) { // inclusive
    return Math.floor(min + (max - min + 1) * this._next());
  };
  RNG.prototype.chance = function (p) { return this._next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this._next() * arr.length)]; };
  RNG.prototype.shuffle = function (arr) { // Fisher-Yates, in place
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this._next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.weighted = function (items) { // [{w, value}] -> value
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += items[i].w;
    var r = this._next() * total;
    for (i = 0; i < items.length; i++) { r -= items[i].w; if (r <= 0) return items[i].value; }
    return items[items.length - 1].value;
  };

  // A short, human-friendly random seed for "new dive".
  function randomSeed() {
    var s = "";
    var chars = "ABCDEFGHJKLMNPRSTUVWXYZ23456789";
    var t = (Date.now() % 100000) + Math.floor(Math.random() * 100000);
    for (var i = 0; i < 6; i++) { s += chars[t % chars.length]; t = Math.floor(t / chars.length) + i * 7 + 1; }
    return s;
  }

  root.RNG = RNG;
  root.randomSeed = randomSeed;
})(typeof window !== "undefined" ? window : this);
