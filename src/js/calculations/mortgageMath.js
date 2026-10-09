/**
 * mortgageMath.js — математическое ядро ипотечного калькулятора.
 *
 * Модель (как в банковских графиках платежей РФ):
 *   i = ставка_год% / 100 / 12   — номинальная месячная ставка (не эффективная!)
 *   проценты за месяц = round(остаток · i), округление до копейки half up
 *   аннуитет:          A = S · i(1+i)^n / ((1+i)^n − 1)
 *   дифф. платёж k:    S/n + остаток_{k-1} · i
 *
 * Вся арифметика — целые BigInt: ставка i = p/q хранится дробью, поэтому
 * (1+i)^n считается точно, без накопления ошибки float. Последний платёж
 * закрывает остаток ровно до копейки.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const dec = isNode ? require('./decimal') : root.MortgageCalc.decimal;
  const { divRound, gcd, pow10 } = dec;

  const PAYMENT_TYPE = Object.freeze({
    ANNUITY: 'annuity',
    DIFFERENTIATED: 'differentiated',
  });

  /**
   * Месячная ставка как несократимая дробь p/q.
   * @param {{num: bigint, scale: number}} ratePercent годовая ставка в процентах
   */
  function monthlyRate(ratePercent) {
    const p = ratePercent.num;
    if (p === 0n) {
      return { p: 0n, q: 1n };
    }
    const q = pow10(ratePercent.scale) * 1200n;
    const g = gcd(p, q);
    return { p: p / g, q: q / g };
  }

  /** Проценты за месяц с округлением до копейки. */
  function interestFor(balance, rate) {
    return divRound(balance * rate.p, rate.q);
  }

  /**
   * Множитель аннуитета как дробь num/den: A = round(S · num / den).
   * При i = 0 — S/n.
   */
  function annuityFactor(rate, n) {
    const N = BigInt(n);
    if (rate.p === 0n) {
      return { num: 1n, den: N };
    }
    const pow = (rate.q + rate.p) ** N; // (q+p)^n  ~ (1+i)^n · q^n
    const qn = rate.q ** N;
    return { num: rate.p * pow, den: rate.q * (pow - qn) };
  }

  /** Аннуитетный платёж в копейках, округлённый half up. */
  function annuityPayment(loan, rate, n) {
    const f = annuityFactor(rate, n);
    return divRound(loan * f.num, f.den);
  }

  /** Основной долг в дифф. платеже k (1..n): равномерная раздача остатка по копейке. */
  function differentiatedPrincipal(loan, n, k) {
    const N = BigInt(n);
    const K = BigInt(k);
    return (loan * K) / N - (loan * (K - 1n)) / N;
  }

  /**
   * Первый (максимальный для дифф.) платёж по кредиту.
   * @returns {bigint}
   */
  function firstPayment(loan, rate, n, type) {
    if (type === PAYMENT_TYPE.DIFFERENTIATED) {
      return differentiatedPrincipal(loan, n, 1) + interestFor(loan, rate);
    }
    return annuityPayment(loan, rate, n);
  }

  /**
   * Полный график платежей.
   * @param {bigint} loan сумма кредита, копейки
   * @param {{p: bigint, q: bigint}} rate месячная ставка
   * @param {number} n срок в месяцах
   * @param {string} type PAYMENT_TYPE
   * @returns {{payment: bigint, principal: bigint, interest: bigint, balance: bigint}[]}
   */
  function buildSchedule(loan, rate, n, type) {
    const rows = [];
    let balance = loan;
    const annuity = type === PAYMENT_TYPE.ANNUITY ? annuityPayment(loan, rate, n) : 0n;

    for (let k = 1; k <= n; k++) {
      const interest = interestFor(balance, rate);
      let principal;
      if (k === n) {
        principal = balance; // последний платёж закрывает кредит ровно
      } else if (type === PAYMENT_TYPE.DIFFERENTIATED) {
        principal = differentiatedPrincipal(loan, n, k);
      } else {
        principal = annuity - interest;
        if (principal < 0n) {
          principal = 0n;
        }
        if (principal > balance) {
          principal = balance;
        }
      }
      balance -= principal;
      rows.push({ payment: principal + interest, principal, interest, balance });
    }
    return rows;
  }

  /**
   * Наибольшее целое x ∈ [lo, hi], для которого predicate(x) истинен.
   * predicate должен быть монотонным: true…true, false…false.
   */
  function largestSatisfying(lo, hi, predicate) {
    let a = lo;
    let b = hi;
    while (a < b) {
      const mid = (a + b + 1n) / 2n;
      if (predicate(mid)) {
        a = mid;
      } else {
        b = mid - 1n;
      }
    }
    return a;
  }

  /**
   * Обратная задача: максимальная сумма кредита, при которой первый платёж ≤ target.
   * Точно по копейкам: firstPayment(S) ≤ target < firstPayment(S + 1).
   */
  function maxLoanForPayment(target, rate, n, type) {
    const N = BigInt(n);
    // верхняя граница с запасом: при S = target·n + n платёж гарантированно > target
    const hi = target * N + N;
    if (type === PAYMENT_TYPE.DIFFERENTIATED) {
      return largestSatisfying(0n, hi, (s) => firstPayment(s, rate, n, type) <= target);
    }
    const f = annuityFactor(rate, n);
    return largestSatisfying(0n, hi, (s) => divRound(s * f.num, f.den) <= target);
  }

  /** Первоначальный взнос в процентах от цены: round(price · pct / 100). */
  function downPaymentFromPercent(price, pct) {
    return divRound(price * pct.num, 100n * pow10(pct.scale));
  }

  /**
   * Максимальная цена объекта, при которой кредит (цена − взнос в %) ≤ loanCap.
   * @param {bigint} loanCap
   * @param {{num: bigint, scale: number}} pct процент взноса, 0 ≤ pct < 100
   */
  function maxPriceForLoanCap(loanCap, pct) {
    const D = 100n * pow10(pct.scale);
    const hi = ((loanCap + 1n) * D) / (D - pct.num) + 2n;
    return largestSatisfying(0n, hi, (price) => price - downPaymentFromPercent(price, pct) <= loanCap);
  }

  const api = {
    PAYMENT_TYPE,
    monthlyRate,
    interestFor,
    annuityFactor,
    annuityPayment,
    differentiatedPrincipal,
    firstPayment,
    buildSchedule,
    largestSatisfying,
    maxLoanForPayment,
    downPaymentFromPercent,
    maxPriceForLoanCap,
  };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.mortgageMath = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
