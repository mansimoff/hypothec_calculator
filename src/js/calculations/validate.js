/**
 * validate.js — разбор и проверка полей формы. Возвращает нормализованные
 * значения (BigInt-копейки, рациональная ставка) либо словарь ошибок
 * вида { имя_поля: 'сообщение' }.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const dec = isNode ? require('./decimal') : root.MortgageCalc.decimal;
  const money = isNode ? require('./money') : root.MortgageCalc.money;
  const math = isNode ? require('./mortgageMath') : root.MortgageCalc.mortgageMath;

  const LIMITS = Object.freeze({
    MAX_PRICE_RUB: 100000000000n, // 100 млрд ₽ — гарантирует Number.isSafeInteger для всех сумм
    MAX_PAYMENT_RUB: 1000000000n, // 1 млрд ₽ в месяц
    MIN_LOAN_KOP: 100n, // кредит не меньше 1 ₽
    MAX_RATE_PERCENT: 100n,
    MAX_MONTHS: 600,
    MAX_YEARS: 50,
  });

  const MODE = Object.freeze({ BY_COST: 'cost', BY_PAYMENT: 'payment' });
  const DOWN_MODE = Object.freeze({ RUB: 'rub', PERCENT: 'pct' });

  function fmtLimit(rub) {
    return money.formatKop(Number(rub) * 100, { kop: false });
  }

  function parseMoney(raw, errors, field, { label, maxRub, allowZero }) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors[field] = `Укажите ${label}`;
      return null;
    }
    const d = dec.parseDecimal(raw, 2);
    if (!d) {
      errors[field] = `${label[0].toUpperCase()}${label.slice(1)}: введите неотрицательное число, не более 2 знаков после запятой`;
      return null;
    }
    const kop = (d.num * 100n) / dec.pow10(d.scale);
    if (kop === 0n && !allowZero) {
      errors[field] = `${label[0].toUpperCase()}${label.slice(1)} должна быть больше нуля`;
      return null;
    }
    if (kop > maxRub * 100n) {
      errors[field] = `Не больше ${fmtLimit(maxRub)}`;
      return null;
    }
    return kop;
  }

  function parseRate(raw, errors) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors.rate = 'Укажите процентную ставку';
      return null;
    }
    const d = dec.parseDecimal(raw, 2);
    if (!d) {
      errors.rate = 'Ставка: число от 0 до 100, не более 2 знаков после запятой';
      return null;
    }
    if (d.num > LIMITS.MAX_RATE_PERCENT * dec.pow10(d.scale)) {
      errors.rate = 'Ставка не может превышать 100 %';
      return null;
    }
    return d;
  }

  function parseTerm(raw, errors) {
    const term = raw || {};
    const value = dec.parseInteger(term.value);
    const unit = term.unit === 'months' ? 'months' : 'years';
    if (term.value === undefined || term.value === null || String(term.value).trim() === '') {
      errors.term = 'Укажите срок кредита';
      return null;
    }
    if (value === null || value === 0n) {
      errors.term = 'Срок: целое число больше нуля';
      return null;
    }
    const months = unit === 'years' ? value * 12n : value;
    if (months > BigInt(LIMITS.MAX_MONTHS)) {
      errors.term = `Срок не более ${LIMITS.MAX_YEARS} лет (${LIMITS.MAX_MONTHS} месяцев)`;
      return null;
    }
    return Number(months);
  }

  function parseDownPayment(raw, errors) {
    const down = raw || {};
    const mode = down.mode === DOWN_MODE.PERCENT ? DOWN_MODE.PERCENT : DOWN_MODE.RUB;
    if (mode === DOWN_MODE.RUB) {
      const kop = parseMoney(down.value, errors, 'downPayment', {
        label: 'первоначальный взнос',
        maxRub: LIMITS.MAX_PRICE_RUB,
        allowZero: true,
      });
      return kop === null ? null : { mode, kop };
    }
    if (down.value === undefined || down.value === null || String(down.value).trim() === '') {
      errors.downPayment = 'Укажите первоначальный взнос';
      return null;
    }
    const pct = dec.parseDecimal(down.value, 2);
    if (!pct || pct.num >= 100n * dec.pow10(pct.scale)) {
      errors.downPayment = 'Взнос в процентах: от 0 до 99,99';
      return null;
    }
    return { mode, pct };
  }

  /**
   * @param {object} raw сырые значения формы
   * @param {'cost'|'payment'} mode режим расчёта
   * @returns {{ok: true, values: object} | {ok: false, errors: Object<string,string>}}
   */
  function validate(raw, mode) {
    const errors = {};
    const input = raw || {};
    const values = { mode };

    if (mode === MODE.BY_COST) {
      values.priceKop = parseMoney(input.price, errors, 'price', {
        label: 'стоимость недвижимости',
        maxRub: LIMITS.MAX_PRICE_RUB,
        allowZero: false,
      });
    } else if (mode === MODE.BY_PAYMENT) {
      values.paymentKop = parseMoney(input.payment, errors, 'payment', {
        label: 'ежемесячный платёж',
        maxRub: LIMITS.MAX_PAYMENT_RUB,
        allowZero: false,
      });
    } else {
      throw new RangeError(`Неизвестный режим расчёта: ${mode}`);
    }

    values.down = parseDownPayment(input.downPayment, errors);
    values.rate = parseRate(input.rate, errors);
    values.months = parseTerm(input.term, errors);

    values.type = input.type === math.PAYMENT_TYPE.DIFFERENTIATED
      ? math.PAYMENT_TYPE.DIFFERENTIATED
      : math.PAYMENT_TYPE.ANNUITY;

    const start = money.parseISODate(input.startDate);
    if (!start) {
      errors.startDate = 'Укажите дату первого платежа';
    }
    values.start = start;

    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }
    return { ok: true, values };
  }

  const api = { LIMITS, MODE, DOWN_MODE, validate };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.validate = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
