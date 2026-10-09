'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const math = require('../src/js/calculations/mortgageMath');
const dec = require('../src/js/calculations/decimal');
const golden = require('./golden/golden.json');
const { prng, randInt, randRate, rateOf } = require('./helpers');

const { ANNUITY, DIFFERENTIATED } = math.PAYMENT_TYPE;

test('golden: график платежей совпадает с независимым эталоном (Python Fraction) до копейки', () => {
  for (const g of golden.schedules) {
    const rows = math.buildSchedule(BigInt(g.loan), rateOf(g.rate), g.n, g.type);
    const label = `${g.type} ${g.loan} ${g.rate}% ${g.n}м`;
    assert.equal(rows.length, g.n, label);
    assert.equal(rows[0].payment, BigInt(g.firstPayment), `${label}: первый платёж`);
    assert.equal(rows[g.n - 1].payment, BigInt(g.lastPayment), `${label}: последний платёж`);
    assert.equal(rows.reduce((s, r) => s + r.interest, 0n), BigInt(g.totalInterest), `${label}: сумма процентов`);
    const mid = Math.floor(g.n / 2);
    assert.deepEqual([rows[0].payment, rows[mid].payment, rows[g.n - 1].payment], g.payments.map(BigInt), `${label}: платежи`);
    assert.deepEqual([rows[0].balance, rows[mid].balance, rows[g.n - 1].balance], g.balances.map(BigInt), `${label}: остатки`);
  }
});

test('golden: максимальный кредит по платежу совпадает с эталоном', () => {
  for (const g of golden.maxLoan) {
    const got = math.maxLoanForPayment(BigInt(g.target), rateOf(g.rate), g.n, g.type);
    assert.equal(got, BigInt(g.loan), `${g.type} платёж=${g.target} ${g.rate}% ${g.n}м`);
  }
});

test('аннуитет совпадает с формулой на double (относительная погрешность < 1e-9)', () => {
  const rand = prng(42);
  for (let t = 0; t < 200; t++) {
    const loan = randInt(rand, 1_000_00, 5_000_000_00);
    const n = randInt(rand, 1, 480);
    const rate = randRate(rand);
    if (Number(rate) === 0) {
      continue;
    }
    const i = Number(rate) / 1200;
    const ref = (loan * i * (1 + i) ** n) / ((1 + i) ** n - 1);
    const got = Number(math.annuityPayment(BigInt(loan), rateOf(rate), n));
    assert.ok(Math.abs(got - ref) <= 0.5 + ref * 1e-9, `${loan} ${rate}% ${n}: ${got} vs ${ref}`);
  }
});

test('инварианты графика на случайных входах (аннуитет и дифф.)', () => {
  const rand = prng(2026);
  for (let t = 0; t < 300; t++) {
    const loan = BigInt(randInt(rand, 100, 9_000_000_000));
    const n = randInt(rand, 1, 600);
    const rate = randRate(rand);
    const type = rand() < 0.5 ? ANNUITY : DIFFERENTIATED;
    const rows = math.buildSchedule(loan, rateOf(rate), n, type);
    const label = `${type} ${loan} ${rate}% ${n}м`;

    assert.equal(rows.length, n, label);
    assert.equal(rows[n - 1].balance, 0n, `${label}: кредит закрыт ровно`);
    assert.equal(rows.reduce((s, r) => s + r.principal, 0n), loan, `${label}: сумма основного долга = кредит`);

    let prev = loan;
    for (const r of rows) {
      assert.equal(r.payment, r.principal + r.interest, `${label}: платёж = долг + проценты`);
      assert.ok(r.principal >= 0n && r.interest >= 0n, `${label}: неотрицательные части`);
      assert.ok(r.balance >= 0n && r.balance <= prev, `${label}: остаток не растёт`);
      prev = r.balance;
    }

    if (type === ANNUITY && n > 1) {
      const a = rows[0].payment;
      for (let k = 1; k < n - 1; k++) {
        // исключения — только вырожденные случаи: платёж меньше процентов (долг не гасится)
        // или кредит закрылся на месяц раньше из-за накопленного округления
        assert.ok(rows[k].payment === a || rows[k].principal === 0n || rows[k].balance === 0n, `${label}: платёж постоянен (мес. ${k + 1})`);
      }
      // Округление платежа и процентов до копейки (ошибка ≤ 0.5 коп на шаг) копится с коэффициентом
      // (1+i)^k, поэтому последний платёж отличается от регулярного не более чем на ((1+i)^n − 1)/i коп.
      const i = Number(rate) / 1200;
      const bound = i > 0 ? ((1 + i) ** n - 1) / i : n;
      const drift = Number(rows[n - 1].payment - a);
      assert.ok(Math.abs(drift) <= bound + 2, `${label}: |последний − обычный| = ${drift} коп > границы ${bound.toFixed(1)}`);
    }
    if (type === DIFFERENTIATED) {
      assert.ok(rows[0].payment >= rows[n - 1].payment, `${label}: платежи не растут`);
    }
  }
});

test('нулевая ставка: аннуитет = кредит / срок, проценты = 0', () => {
  const rows = math.buildSchedule(1_200_000n, rateOf('0'), 12, ANNUITY);
  assert.ok(rows.every((r) => r.interest === 0n && r.payment === 100_000n));
  assert.equal(math.annuityPayment(1000n, rateOf('0'), 3), 333n);
});

test('срок 1 месяц: единственный платёж = кредит + проценты за месяц', () => {
  const rows = math.buildSchedule(1_000_000n, rateOf('12'), 1, ANNUITY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payment, 1_010_000n);
});

test('maxLoanForPayment: firstPayment(S) ≤ target < firstPayment(S+1) на случайных входах', () => {
  const rand = prng(7);
  for (let t = 0; t < 150; t++) {
    const target = BigInt(randInt(rand, 100_00, 2_000_000_00));
    const n = randInt(rand, 1, 600);
    const rate = randRate(rand);
    const type = rand() < 0.5 ? ANNUITY : DIFFERENTIATED;
    const r = rateOf(rate);
    const s = math.maxLoanForPayment(target, r, n, type);
    assert.ok(math.firstPayment(s, r, n, type) <= target, `${type} ${target} ${rate}% ${n}м: платёж(S) ≤ цель`);
    assert.ok(math.firstPayment(s + 1n, r, n, type) > target, `${type} ${target} ${rate}% ${n}м: платёж(S+1) > цели`);
  }
});

test('обратимость: расчёт по платежу → платёж по стоимости не превышает цель и отличается ≤ нескольких копеек', () => {
  const r = rateOf('9.5');
  const target = 8_500_000n;
  const s = math.maxLoanForPayment(target, r, 300, ANNUITY);
  const back = math.annuityPayment(s, r, 300);
  assert.ok(back <= target && target - back <= 1n);
});

test('maxPriceForLoanCap: price − взнос(price) ≤ cap < (price+1) − взнос(price+1)', () => {
  const rand = prng(99);
  for (let t = 0; t < 200; t++) {
    const cap = BigInt(randInt(rand, 100, 2_000_000_000));
    const pct = dec.parseDecimal(String((randInt(rand, 0, 9999) / 100).toFixed(2)), 2);
    const price = math.maxPriceForLoanCap(cap, pct);
    const loanAt = (p) => p - math.downPaymentFromPercent(p, pct);
    assert.ok(loanAt(price) <= cap, `cap=${cap} pct=${pct.num}/${10 ** pct.scale}`);
    assert.ok(loanAt(price + 1n) > cap, `cap=${cap} pct=${pct.num}/${10 ** pct.scale}: следующая копейка превышает кап`);
  }
});

test('monthlyRate: несократимая дробь; точное значение, а не /12 на float', () => {
  assert.deepEqual(math.monthlyRate({ num: 12n, scale: 0 }), { p: 1n, q: 100n });
  assert.deepEqual(math.monthlyRate({ num: 599n, scale: 2 }), { p: 599n, q: 120000n });
  assert.deepEqual(math.monthlyRate({ num: 0n, scale: 0 }), { p: 0n, q: 1n });
});
