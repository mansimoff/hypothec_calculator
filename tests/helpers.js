'use strict';

const dec = require('../src/js/calculations/decimal');
const math = require('../src/js/calculations/mortgageMath');

/** Детерминированный ГПСЧ (mulberry32) — тесты воспроизводимы. */
function prng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand, lo, hi) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Случайная ставка в процентах с ≤ 2 знаками: '7.35'. */
function randRate(rand) {
  const hundredths = randInt(rand, 0, 10000);
  return (hundredths / 100).toFixed(2);
}

function rateOf(text) {
  return math.monthlyRate(dec.parseDecimal(text, 2));
}

module.exports = { prng, randInt, randRate, rateOf };
