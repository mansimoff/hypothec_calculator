'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../src/js/calculations/mortgage');

const base = {
  price: '6 000 000',
  downPayment: { mode: 'rub', value: '1200000' },
  rate: '12',
  term: { value: '20', unit: 'years' },
  type: 'annuity',
  startDate: '2026-11-05',
};

test('по стоимости: аннуитет 4,8 млн, 12 %, 20 лет — эталонные значения', () => {
  const out = calculate(base, 'cost');
  assert.equal(out.ok, true);
  const r = out.result;
  assert.equal(r.loanKop, 480_000_000);
  assert.equal(r.firstPaymentKop, 5_285_213);
  assert.equal(r.lastPaymentKop, 5_285_637);
  assert.equal(r.interestKop, 788_451_544);
  assert.equal(r.totalPaidKop, 480_000_000 + 788_451_544);
  assert.equal(r.totalWithDownKop, r.totalPaidKop + 120_000_000);
  assert.equal(r.schedule.length, 240);
  assert.equal(r.schedule[0].date, '2026-11-05');
  assert.equal(r.schedule[239].date, '2046-10-05');
  assert.equal(r.schedule[239].balance, 0);
});

test('по стоимости: взнос в процентах эквивалентен взносу в рублях', () => {
  const a = calculate(base, 'cost').result;
  const b = calculate({ ...base, downPayment: { mode: 'pct', value: '20' } }, 'cost').result;
  assert.equal(b.downKop, a.downKop);
  assert.equal(b.firstPaymentKop, a.firstPaymentKop);
});

test('дифференцированный: первый платёж = долг/n + проценты, проценты по формуле арифметической прогрессии', () => {
  const r = calculate({ ...base, type: 'differentiated', downPayment: { mode: 'pct', value: '20' } }, 'cost').result;
  assert.equal(r.firstPaymentKop, 2_000_000 + 4_800_000);
  assert.equal(r.lastPaymentKop, 2_000_000 + 20_000);
  // сумма процентов = S·i·(n+1)/2
  assert.equal(r.interestKop, (480_000_000 * (240 + 1) * 1) / 2 / 100);
  assert.equal(r.avgPaymentKop, Math.round(r.totalPaidKop / 240));
});

test('агрегация по годам совпадает с помесячным графиком', () => {
  const r = calculate({ ...base, startDate: '2026-11-30' }, 'cost').result;
  const sum = (arr, key) => arr.reduce((s, x) => s + x[key], 0);
  assert.equal(sum(r.yearly, 'payment'), sum(r.schedule, 'payment'));
  assert.equal(sum(r.yearly, 'interest'), r.interestKop);
  assert.equal(sum(r.yearly, 'principal'), r.loanKop);
  assert.equal(sum(r.yearly, 'count'), 240);
  assert.equal(r.yearly[0].year, 2026);
  assert.equal(r.yearly[0].count, 2, 'ноябрь и декабрь первого года');
  assert.equal(r.yearly[r.yearly.length - 1].balance, 0);
});

test('необходимый доход: платёж / 0,4 с округлением вверх', () => {
  const r = calculate(base, 'cost').result;
  assert.equal(r.requiredIncomeKop, Math.ceil((5_285_637 * 5) / 2));
});

test('по платежу: максимальная стоимость; платёж не превышает заданный', () => {
  const out = calculate(
    { payment: '52 853,58', downPayment: { mode: 'rub', value: '1 200 000' }, rate: '12', term: { value: '20', unit: 'years' }, type: 'annuity', startDate: '2026-11-05' },
    'payment',
  );
  assert.equal(out.ok, true);
  const r = out.result;
  assert.equal(r.priceKop, r.loanKop + r.downKop);
  assert.equal(r.downKop, 120_000_000);
  assert.ok(r.firstPaymentKop <= 5_285_358);
  assert.ok(5_285_358 - r.firstPaymentKop <= 1, 'платёж отличается от цели не более чем на копейку');
  assert.equal(r.loanKop, 480_013_174);
});

test('по платежу: взнос в % — цена и взнос согласованы, кредит = цена − взнос', () => {
  const r = calculate(
    { payment: '80000', downPayment: { mode: 'pct', value: '15' }, rate: '10.5', term: { value: '25', unit: 'years' }, type: 'annuity', startDate: '2026-12-01' },
    'payment',
  ).result;
  assert.equal(r.loanKop, r.priceKop - r.downKop);
  assert.ok(Math.abs(r.downKop / r.priceKop - 0.15) < 1e-6);
  assert.ok(r.firstPaymentKop <= 8_000_000);
});

test('по платежу и дифференцированный: платёж — это первый (наибольший)', () => {
  const r = calculate(
    { payment: '100 000', downPayment: { mode: 'rub', value: '0' }, rate: '12', term: { value: '10', unit: 'years' }, type: 'differentiated', startDate: '2026-12-01' },
    'payment',
  ).result;
  assert.ok(r.firstPaymentKop <= 10_000_000);
  assert.equal(r.firstPaymentKop, Math.max(...r.schedule.map((x) => x.payment)));
});

test('ошибки: взнос ≥ стоимости, кредит < 1 ₽, слишком малый платёж', () => {
  assert.equal(calculate({ ...base, downPayment: { mode: 'rub', value: '6000000' } }, 'cost').errors.downPayment.length > 0, true);
  assert.equal(calculate({ ...base, downPayment: { mode: 'rub', value: '5999999.5' } }, 'cost').ok, false);
  const tiny = calculate({ ...base, payment: '0,01', term: { value: '1', unit: 'months' } }, 'payment');
  assert.equal(tiny.ok, false);
  assert.ok(tiny.errors.payment);
});

test('срок в месяцах и годах дают один результат', () => {
  const y = calculate(base, 'cost').result;
  const m = calculate({ ...base, term: { value: '240', unit: 'months' } }, 'cost').result;
  assert.equal(m.firstPaymentKop, y.firstPaymentKop);
});

test('экстремальные границы: 100 млрд ₽, 100 %, 50 лет — без исключений и в безопасных целых', () => {
  for (const type of ['annuity', 'differentiated']) {
    const r = calculate(
      { price: '100000000000', downPayment: { mode: 'rub', value: '0' }, rate: '100', term: { value: '50', unit: 'years' }, type, startDate: '2026-01-01' },
      'cost',
    );
    assert.equal(r.ok, true, type);
    assert.ok(Number.isSafeInteger(r.result.totalWithDownKop));
    assert.equal(r.result.schedule[599].balance, 0);
  }
  const p = calculate(
    { payment: '1000000000', downPayment: { mode: 'rub', value: '0' }, rate: '0', term: { value: '50', unit: 'years' }, type: 'annuity', startDate: '2026-01-01' },
    'payment',
  );
  assert.equal(p.ok, false, 'цена 600 млрд ₽ выходит за лимит');
  assert.ok(p.errors.payment);
});

test('минимальный кредит 1 ₽ на 1 месяц', () => {
  const r = calculate({ ...base, price: '1', downPayment: { mode: 'rub', value: '0' }, term: { value: '1', unit: 'months' } }, 'cost').result;
  assert.equal(r.loanKop, 100);
  assert.equal(r.firstPaymentKop, 101);
});
