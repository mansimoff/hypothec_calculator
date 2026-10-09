/**
 * mortgage.js — два режима расчёта ипотеки поверх точного ядра:
 *   calcByCost    — известна стоимость и взнос → платёж, переплата;
 *   calcByPayment — известен посильный платёж → максимальная стоимость.
 * Результат — обычные Number (целые копейки), готовые для UI, графиков и экспорта.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const dec = isNode ? require('./decimal') : root.MortgageCalc.decimal;
  const money = isNode ? require('./money') : root.MortgageCalc.money;
  const math = isNode ? require('./mortgageMath') : root.MortgageCalc.mortgageMath;
  const val = isNode ? require('./validate') : root.MortgageCalc.validate;

  /** Допустимая доля платежа в доходе для оценки «необходимого дохода». */
  const PAYMENT_TO_INCOME = { num: 2n, den: 5n }; // 40 %

  function toNum(big) {
    const n = Number(big);
    if (!Number.isSafeInteger(n)) {
      throw new RangeError('Сумма выходит за допустимый диапазон');
    }
    return n;
  }

  /** Строки графика с датами и номерами + агрегация по календарным годам. */
  function decorateSchedule(rawRows, start) {
    const rows = rawRows.map((r, idx) => ({
      n: idx + 1,
      date: money.formatISODate(money.addMonths(start, idx)),
      payment: toNum(r.payment),
      principal: toNum(r.principal),
      interest: toNum(r.interest),
      balance: toNum(r.balance),
    }));

    const yearly = [];
    for (const row of rows) {
      const year = Number(row.date.slice(0, 4));
      let bucket = yearly[yearly.length - 1];
      if (!bucket || bucket.year !== year) {
        bucket = { year, payment: 0, principal: 0, interest: 0, balance: 0, count: 0 };
        yearly.push(bucket);
      }
      bucket.payment += row.payment;
      bucket.principal += row.principal;
      bucket.interest += row.interest;
      bucket.balance = row.balance;
      bucket.count += 1;
    }
    return { rows, yearly };
  }

  function assemble({ mode, type, months, rate, start, priceKop, downKop, loanKop }) {
    const mRate = math.monthlyRate(rate);
    const raw = math.buildSchedule(loanKop, mRate, months, type);
    const { rows, yearly } = decorateSchedule(raw, start);

    const first = rows[0].payment;
    const last = rows[rows.length - 1].payment;
    const interest = rows.reduce((s, r) => s + r.interest, 0);
    const paid = toNum(loanKop) + interest;
    const maxPayment = Math.max(...rows.map((r) => r.payment));
    const income = toNum(
      dec.divCeil(BigInt(maxPayment) * PAYMENT_TO_INCOME.den, PAYMENT_TO_INCOME.num),
    );

    return {
      mode,
      type,
      months,
      priceKop: toNum(priceKop),
      downKop: toNum(downKop),
      loanKop: toNum(loanKop),
      firstPaymentKop: first,
      lastPaymentKop: last,
      avgPaymentKop: Math.round(paid / months),
      interestKop: interest,
      totalPaidKop: paid,
      totalWithDownKop: paid + toNum(downKop),
      overpaymentPercent: toNum(loanKop) > 0 ? (interest / toNum(loanKop)) * 100 : 0,
      requiredIncomeKop: income,
      schedule: rows,
      yearly,
    };
  }

  /** Режим «по стоимости». */
  function calcByCost(values) {
    const price = values.priceKop;
    const down = values.down.mode === val.DOWN_MODE.PERCENT
      ? math.downPaymentFromPercent(price, values.down.pct)
      : values.down.kop;

    if (down >= price) {
      return { ok: false, errors: { downPayment: 'Первоначальный взнос должен быть меньше стоимости' } };
    }
    const loan = price - down;
    if (loan < val.LIMITS.MIN_LOAN_KOP) {
      return { ok: false, errors: { downPayment: 'Сумма кредита должна быть не меньше 1 ₽' } };
    }
    return {
      ok: true,
      result: assemble({ ...values, mode: val.MODE.BY_COST, priceKop: price, downKop: down, loanKop: loan }),
    };
  }

  /** Режим «по платежу»: для дифф. платежа target — это первый (наибольший) платёж. */
  function calcByPayment(values) {
    const rate = math.monthlyRate(values.rate);
    const cap = math.maxLoanForPayment(values.paymentKop, rate, values.months, values.type);
    if (cap < val.LIMITS.MIN_LOAN_KOP) {
      return { ok: false, errors: { payment: 'При таком платеже, сроке и ставке кредит не набирается — увеличьте платёж' } };
    }

    let price;
    let down;
    let loan;
    if (values.down.mode === val.DOWN_MODE.PERCENT) {
      price = math.maxPriceForLoanCap(cap, values.down.pct);
      down = math.downPaymentFromPercent(price, values.down.pct);
      loan = price - down;
    } else {
      down = values.down.kop;
      loan = cap;
      price = loan + down;
    }
    if (loan < val.LIMITS.MIN_LOAN_KOP) {
      return { ok: false, errors: { payment: 'При таком платеже, сроке и ставке кредит не набирается — увеличьте платёж' } };
    }
    if (price > val.LIMITS.MAX_PRICE_RUB * 100n) {
      return { ok: false, errors: { payment: 'Стоимость недвижимости превышает допустимый максимум' } };
    }
    return {
      ok: true,
      result: assemble({ ...values, mode: val.MODE.BY_PAYMENT, priceKop: price, downKop: down, loanKop: loan }),
    };
  }

  /**
   * Единая точка входа для UI.
   * @param {object} raw значения формы; @param {'cost'|'payment'} mode
   */
  function calculate(raw, mode) {
    const checked = val.validate(raw, mode);
    if (!checked.ok) {
      return checked;
    }
    return mode === val.MODE.BY_COST ? calcByCost(checked.values) : calcByPayment(checked.values);
  }

  const api = { PAYMENT_TO_INCOME, calculate, calcByCost, calcByPayment, decorateSchedule };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.mortgage = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
