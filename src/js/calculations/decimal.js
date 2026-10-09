/**
 * decimal.js — точный разбор десятичных чисел и целочисленное округление.
 *
 * Все деньги в проекте хранятся целыми копейками, а ставки — рациональными
 * дробями на BigInt. Бинарная плавающая точка в математике расчёта
 * не участвует, поэтому 0.1 + 0.2 здесь всегда ровно 0.3.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const DECIMAL_RE = /^(\d+)(?:[.,](\d*))?$/;

  /**
   * Разбирает неотрицательное десятичное число из строки или number.
   * Пробелы, неразрывные пробелы и запятая как разделитель допускаются.
   * @param {string|number} value
   * @param {number} [maxScale=2] максимум знаков после запятой (после отбрасывания хвостовых нулей)
   * @returns {{num: bigint, scale: number}|null} значение = num / 10^scale; null при ошибке
   */
  function parseDecimal(value, maxScale = 2) {
    let text;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0) {
        return null;
      }
      text = String(value);
      if (/e/i.test(text)) {
        return null;
      }
    } else if (typeof value === 'string') {
      text = value.replace(/[\s\u00A0\u202F]/g, '');
    } else {
      return null;
    }

    const match = DECIMAL_RE.exec(text);
    if (!match) {
      return null;
    }
    const intPart = match[1];
    const fracPart = (match[2] || '').replace(/0+$/, '');
    if (fracPart.length > maxScale) {
      return null;
    }
    return { num: BigInt(intPart + fracPart), scale: fracPart.length };
  }

  /** Целая часть: разбор неотрицательного целого (без дробной части). */
  function parseInteger(value) {
    const d = parseDecimal(value, 0);
    return d ? d.num : null;
  }

  /** Деление с округлением «half up» для неотрицательных a и положительного b. */
  function divRound(a, b) {
    if (b <= 0n) {
      throw new RangeError('divRound: делитель должен быть положительным');
    }
    if (a < 0n) {
      throw new RangeError('divRound: делимое должно быть неотрицательным');
    }
    return (2n * a + b) / (2n * b);
  }

  /** Деление с округлением вверх для неотрицательных a и положительного b. */
  function divCeil(a, b) {
    if (b <= 0n || a < 0n) {
      throw new RangeError('divCeil: ожидаются a >= 0 и b > 0');
    }
    return (a + b - 1n) / b;
  }

  function gcd(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
      [x, y] = [y, x % y];
    }
    return x;
  }

  function pow10(n) {
    return 10n ** BigInt(n);
  }

  const api = { parseDecimal, parseInteger, divRound, divCeil, gcd, pow10 };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.decimal = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
