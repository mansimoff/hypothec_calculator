'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/js/calculations/decimal');

test('parseDecimal: целые, дроби, запятая, пробелы', () => {
  assert.deepEqual(d.parseDecimal('12'), { num: 12n, scale: 0 });
  assert.deepEqual(d.parseDecimal('12.5'), { num: 125n, scale: 1 });
  assert.deepEqual(d.parseDecimal('12,50'), { num: 125n, scale: 1 }, 'хвостовые нули отбрасываются');
  assert.deepEqual(d.parseDecimal(' 1 234\u00A0567,89 '), { num: 123456789n, scale: 2 });
  assert.deepEqual(d.parseDecimal('0'), { num: 0n, scale: 0 });
  assert.deepEqual(d.parseDecimal('5.'), { num: 5n, scale: 0 });
  assert.deepEqual(d.parseDecimal(7.25), { num: 725n, scale: 2 });
});

test('parseDecimal: мусор и лишние знаки отклоняются', () => {
  for (const bad of ['', ' ', 'abc', '-1', '1e5', '1.2.3', '12,345', '--', '+5', '1 2 a', null, undefined, {}, NaN, -3, Infinity, 1e21]) {
    assert.equal(d.parseDecimal(bad), null, `должно отклоняться: ${String(bad)}`);
  }
  assert.deepEqual(d.parseDecimal('12.345', 3), { num: 12345n, scale: 3 });
});

test('parseInteger: только целые', () => {
  assert.equal(d.parseInteger('20'), 20n);
  assert.equal(d.parseInteger('20.5'), null);
  assert.equal(d.parseInteger('0'), 0n);
});

test('divRound: half up на границах', () => {
  assert.equal(d.divRound(5n, 2n), 3n);
  assert.equal(d.divRound(4n, 2n), 2n);
  assert.equal(d.divRound(1n, 3n), 0n);
  assert.equal(d.divRound(2n, 3n), 1n);
  assert.equal(d.divRound(0n, 7n), 0n);
  assert.equal(d.divRound(15n, 10n), 2n);
  assert.throws(() => d.divRound(1n, 0n), RangeError);
  assert.throws(() => d.divRound(-1n, 2n), RangeError);
});

test('divCeil и gcd', () => {
  assert.equal(d.divCeil(7n, 2n), 4n);
  assert.equal(d.divCeil(8n, 2n), 4n);
  assert.equal(d.divCeil(0n, 5n), 0n);
  assert.equal(d.gcd(12n, 18n), 6n);
  assert.equal(d.gcd(7n, 0n), 7n);
});
