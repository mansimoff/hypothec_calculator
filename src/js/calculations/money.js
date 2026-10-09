/**
 * money.js — деньги в целых копейках, форматирование и арифметика дат.
 * Публичные значения — Number (целые копейки); безопасность гарантируется
 * лимитами валидации (см. validate.js): максимум ~1e14 копеек << 2^53.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const NBSP = '\u00A0';

  function groupDigits(intString) {
    return intString.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  /**
   * Форматирует копейки в «1 234 567,89 ₽».
   * @param {number} kop целое число копеек
   * @param {{kop?: boolean, symbol?: boolean}} [opts] kop=false — без копеек (округление half up)
   */
  function formatKop(kop, opts = {}) {
    const withKop = opts.kop !== false;
    const symbol = opts.symbol !== false;
    const negative = kop < 0;
    let abs = Math.abs(Math.round(kop));
    if (!withKop) {
      abs = Math.round(abs / 100) * 100;
    }
    const rub = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    let out = groupDigits(String(rub));
    if (withKop) {
      out += ',' + frac;
    }
    if (negative && abs !== 0) {
      out = '\u2212' + out;
    }
    return symbol ? out + NBSP + '\u20BD' : out;
  }

  /** Число с запятой и фиксированным числом знаков: 12.5 → «12,50». */
  function formatNumber(value, digits = 2) {
    // Math.round(x·10^d) вместо toFixed: (7.35).toFixed(1) даёт «7.3» из-за двоичного представления
    const shifted = Math.round(Number(Math.abs(value) + 'e' + digits));
    const rounded = Number.isNaN(shifted) ? Math.abs(value) : Number(shifted + 'e-' + digits);
    const sign = value < 0 && rounded !== 0 ? '-' : '';
    return sign + rounded.toFixed(digits).replace('.', ',');
  }

  function formatPercent(value, digits = 2) {
    return formatNumber(value, digits) + NBSP + '%';
  }

  /** Копейки → строка для полей ввода: «1234567.5» → «1 234 567,5», целые без дроби. */
  function kopToInputString(kop) {
    const rub = Math.floor(kop / 100);
    const frac = kop % 100;
    const head = groupDigits(String(rub));
    if (frac === 0) {
      return head;
    }
    return head + ',' + String(frac).padStart(2, '0').replace(/0$/, '');
  }

  // ---- Даты (UTC, без часовых поясов и перехода на летнее время) ----

  function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  /** Разбор 'YYYY-MM-DD' с проверкой существования даты. */
  function parseISODate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
    if (!m) {
      return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
      return null;
    }
    return { y, m: mo, d };
  }

  function formatISODate({ y, m, d }) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** Дата + k месяцев; день «прижимается» к концу месяца (31 янв + 1 мес → 28/29 фев). */
  function addMonths({ y, m, d }, k) {
    const total = y * 12 + (m - 1) + k;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
  }

  /** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
  function formatRuDate(iso) {
    const p = parseISODate(iso);
    if (!p) {
      return String(iso);
    }
    return `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`;
  }

  /** Сегодняшняя дата (локальная) в формате ISO. */
  function todayISO(now = new Date()) {
    return formatISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
  }

  /** Склонение: plural(5, ['год','года','лет']) → 'лет'. */
  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) {
      return forms[2];
    }
    if (b > 1 && b < 5) {
      return forms[1];
    }
    if (b === 1) {
      return forms[0];
    }
    return forms[2];
  }

  /** 245 мес → «20 лет 5 месяцев». */
  function formatTerm(months) {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    const parts = [];
    if (years > 0) {
      parts.push(`${years} ${plural(years, ['год', 'года', 'лет'])}`);
    }
    if (rest > 0) {
      parts.push(`${rest} ${plural(rest, ['месяц', 'месяца', 'месяцев'])}`);
    }
    return parts.join(' ');
  }

  const api = {
    NBSP,
    formatKop,
    formatNumber,
    formatPercent,
    kopToInputString,
    parseISODate,
    formatISODate,
    addMonths,
    formatRuDate,
    todayISO,
    daysInMonth,
    plural,
    formatTerm,
  };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.money = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
