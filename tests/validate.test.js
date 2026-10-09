'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, LIMITS } = require('../src/js/calculations/validate');

const ok = {
  price: '8 000 000',
  payment: '80 000',
  downPayment: { mode: 'pct', value: '20' },
  rate: '12,5',
  term: { value: '20', unit: 'years' },
  type: 'annuity',
  startDate: '2026-11-05',
};

test('валидный ввод: нормализация в копейки и рациональную ставку', () => {
  const r = validate(ok, 'cost');
  assert.equal(r.ok, true);
  assert.equal(r.values.priceKop, 800_000_000n);
  assert.deepEqual(r.values.rate, { num: 125n, scale: 1 });
  assert.equal(r.values.months, 240);
  assert.deepEqual(r.values.start, { y: 2026, m: 11, d: 5 });
  assert.equal(validate(ok, 'payment').values.paymentKop, 8_000_000n);
});

test('режим «по стоимости» не требует платёж, и наоборот', () => {
  assert.equal(validate({ ...ok, payment: '' }, 'cost').ok, true);
  assert.equal(validate({ ...ok, price: '' }, 'payment').ok, true);
  assert.ok(validate({ ...ok, price: '' }, 'cost').errors.price);
  assert.ok(validate({ ...ok, payment: '' }, 'payment').errors.payment);
});

test('ошибки по каждому полю', () => {
  const cases = [
    [{ price: 'abc' }, 'price'],
    [{ price: '0' }, 'price'],
    [{ price: '-5' }, 'price'],
    [{ price: '1,234' }, 'price'],
    [{ price: '100 000 000 001' }, 'price'],
    [{ downPayment: { mode: 'rub', value: '' } }, 'downPayment'],
    [{ downPayment: { mode: 'pct', value: '100' } }, 'downPayment'],
    [{ downPayment: { mode: 'pct', value: '12,345' } }, 'downPayment'],
    [{ rate: '' }, 'rate'],
    [{ rate: '100,01' }, 'rate'],
    [{ rate: '1,234' }, 'rate'],
    [{ rate: 'x' }, 'rate'],
    [{ term: { value: '0', unit: 'years' } }, 'term'],
    [{ term: { value: '51', unit: 'years' } }, 'term'],
    [{ term: { value: '601', unit: 'months' } }, 'term'],
    [{ term: { value: '2,5', unit: 'years' } }, 'term'],
    [{ term: { value: '', unit: 'years' } }, 'term'],
    [{ startDate: '2026-02-30' }, 'startDate'],
    [{ startDate: '' }, 'startDate'],
  ];
  for (const [patch, field] of cases) {
    const r = validate({ ...ok, ...patch }, 'cost');
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors[field], `ожидалась ошибка в поле ${field} для ${JSON.stringify(patch)}`);
  }
});

test('граничные допустимые значения', () => {
  for (const patch of [
    { rate: '0' },
    { rate: '100' },
    { rate: '0,01' },
    { price: '100000000000' },
    { price: '0,01' },
    { term: { value: '50', unit: 'years' } },
    { term: { value: '600', unit: 'months' } },
    { term: { value: '1', unit: 'months' } },
    { downPayment: { mode: 'pct', value: '99,99' } },
    { downPayment: { mode: 'rub', value: '0' } },
  ]) {
    assert.equal(validate({ ...ok, ...patch }, 'cost').ok, true, JSON.stringify(patch));
  }
  assert.equal(LIMITS.MAX_MONTHS, 600);
});

test('несколько ошибок возвращаются сразу; неизвестный режим — исключение; тип по умолчанию — аннуитет', () => {
  const r = validate({ ...ok, price: '', rate: '', startDate: '' }, 'cost');
  assert.deepEqual(Object.keys(r.errors).sort(), ['price', 'rate', 'startDate']);
  assert.throws(() => validate(ok, 'bogus'), RangeError);
  assert.equal(validate({ ...ok, type: 'weird' }, 'cost').values.type, 'annuity');
  assert.equal(validate({ ...ok, type: 'differentiated' }, 'cost').values.type, 'differentiated');
  assert.equal(validate(undefined, 'cost').ok, false);
});
