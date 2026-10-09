'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/js/calculations/money');

const N = '\u00A0';

test('formatKop: группировка, копейки, знак', () => {
  assert.equal(m.formatKop(123456789), `1${N}234${N}567,89${N}₽`);
  assert.equal(m.formatKop(0), `0,00${N}₽`);
  assert.equal(m.formatKop(5), `0,05${N}₽`);
  assert.equal(m.formatKop(100), `1,00${N}₽`);
  assert.equal(m.formatKop(123456789, { kop: false }), `1${N}234${N}568${N}₽`);
  assert.equal(m.formatKop(-150), `\u22121,50${N}₽`);
  assert.equal(m.formatKop(50, { symbol: false }), '0,50');
  assert.equal(m.formatKop(49, { kop: false }), `0${N}₽`);
  assert.equal(m.formatKop(50, { kop: false }), `1${N}₽`);
});

test('kopToInputString', () => {
  assert.equal(m.kopToInputString(800000000), `8${N}000${N}000`);
  assert.equal(m.kopToInputString(8000050), `80${N}000,5`);
  assert.equal(m.kopToInputString(8000005), `80${N}000,05`);
});

test('даты: разбор, валидация, addMonths с прижиманием к концу месяца', () => {
  assert.deepEqual(m.parseISODate('2026-11-05'), { y: 2026, m: 11, d: 5 });
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '26-01-01', '', 'abc', '2026-11-5', '1800-01-01']) {
    assert.equal(m.parseISODate(bad), null, bad);
  }
  assert.equal(m.parseISODate('2024-02-29') !== null, true, 'високосный год');
  assert.equal(m.parseISODate('2100-02-29'), null, '2100 не високосный');
  assert.equal(m.formatISODate(m.addMonths({ y: 2026, m: 1, d: 31 }, 1)), '2026-02-28');
  assert.equal(m.formatISODate(m.addMonths({ y: 2024, m: 1, d: 31 }, 1)), '2024-02-29');
  assert.equal(m.formatISODate(m.addMonths({ y: 2026, m: 11, d: 15 }, 2)), '2027-01-15');
  assert.equal(m.formatISODate(m.addMonths({ y: 2026, m: 12, d: 31 }, 12)), '2027-12-31');
  assert.equal(m.formatISODate(m.addMonths({ y: 2026, m: 3, d: 31 }, 240)), '2046-03-31');
  assert.equal(m.formatRuDate('2026-11-05'), '05.11.2026');
  assert.equal(m.todayISO(new Date(2026, 9, 6)), '2026-10-06');
});

test('plural и formatTerm', () => {
  assert.equal(m.plural(1, ['год', 'года', 'лет']), 'год');
  assert.equal(m.plural(2, ['год', 'года', 'лет']), 'года');
  assert.equal(m.plural(5, ['год', 'года', 'лет']), 'лет');
  assert.equal(m.plural(11, ['год', 'года', 'лет']), 'лет');
  assert.equal(m.plural(21, ['год', 'года', 'лет']), 'год');
  assert.equal(m.plural(112, ['год', 'года', 'лет']), 'лет');
  assert.equal(m.formatTerm(245), '20 лет 5 месяцев');
  assert.equal(m.formatTerm(12), '1 год');
  assert.equal(m.formatTerm(3), '3 месяца');
  assert.equal(m.formatTerm(600), '50 лет');
});

test('formatNumber / formatPercent', () => {
  assert.equal(m.formatNumber(12.5), '12,50');
  assert.equal(m.formatPercent(7.35, 1), `7,4${N}%`);
});

test('formatNumber: округление half up без артефактов float', () => {
  assert.equal(m.formatNumber(7.35, 1), '7,4');
  assert.equal(m.formatNumber(1.005, 2), '1,01');
  assert.equal(m.formatNumber(0, 2), '0,00');
  assert.equal(m.formatNumber(99.995, 2), '100,00');
  assert.equal(m.formatNumber(-2.5, 0), '-3');
  assert.equal(m.formatNumber(1e-9, 2), '0,00');
});
