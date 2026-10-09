/**
 * excelExport.js — книга Excel: «Расчёт», «График по месяцам», «По годам».
 * Суммы записываются числами (₽, формат #,##0.00), а не строками —
 * с ними можно работать формулами.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const money = isNode ? require('../calculations/money') : root.MortgageCalc.money;

  const FMT_MONEY = '#,##0.00';
  const FMT_PERCENT = '0.00';

  const rub = (kop) => kop / 100;

  /** Применяет числовой формат к диапазону ячеек колонок (0-based) в строках rowStart..rowEnd. */
  function formatColumns(XLSX, ws, cols, rowStart, rowEnd, fmt) {
    for (let r = rowStart; r <= rowEnd; r++) {
      cols.forEach((c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') {
          cell.z = fmt;
        }
      });
    }
  }

  function buildWorkbook(XLSX, report) {
    const { result, params } = report;
    const wb = XLSX.utils.book_new();

    // --- Лист 1: сводка ---
    const summary = [
      ['Параметр', 'Значение'],
      ['Режим расчёта', params.modeLabel],
      ['Тип платежей', params.typeLabel],
      ['Стоимость недвижимости, ₽', rub(result.priceKop)],
      ['Первоначальный взнос, ₽', rub(result.downKop)],
      ['Сумма кредита, ₽', rub(result.loanKop)],
      ['Ставка', params.rateText],
      ['Срок', params.termText],
      ['Дата первого платежа', money.formatRuDate(params.startDate)],
      [],
      ['Результат', 'Значение'],
      [result.type === 'differentiated' ? 'Первый платёж, ₽' : 'Ежемесячный платёж, ₽', rub(result.firstPaymentKop)],
      ['Последний платёж, ₽', rub(result.lastPaymentKop)],
      ['Проценты (переплата), ₽', rub(result.interestKop)],
      ['Переплата, % от кредита', Math.round(result.overpaymentPercent * 100) / 100],
      ['Всего выплачено банку, ₽', rub(result.totalPaidKop)],
      ['Полная стоимость с взносом, ₽', rub(result.totalWithDownKop)],
      ['Необходимый доход (платёж ≤ 40 %), ₽', rub(result.requiredIncomeKop)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    wsSummary['!cols'] = [{ wch: 40 }, { wch: 26 }];
    formatColumns(XLSX, wsSummary, [1], 1, summary.length - 1, FMT_MONEY);
    const pctRow = summary.findIndex((r) => r[0] === 'Переплата, % от кредита');
    formatColumns(XLSX, wsSummary, [1], pctRow, pctRow, FMT_PERCENT);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Расчёт');

    // --- Лист 2: помесячный график ---
    const monthly = [['№', 'Дата', 'Платёж, ₽', 'Основной долг, ₽', 'Проценты, ₽', 'Остаток долга, ₽']];
    result.schedule.forEach((r) => {
      monthly.push([r.n, money.formatRuDate(r.date), rub(r.payment), rub(r.principal), rub(r.interest), rub(r.balance)]);
    });
    const wsMonthly = XLSX.utils.aoa_to_sheet(monthly);
    wsMonthly['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }];
    wsMonthly['!freeze'] = { xSplit: 0, ySplit: 1 };
    formatColumns(XLSX, wsMonthly, [2, 3, 4, 5], 1, monthly.length - 1, FMT_MONEY);
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'График по месяцам');

    // --- Лист 3: по годам ---
    const yearly = [['Год', 'Платежей', 'Выплачено, ₽', 'Основной долг, ₽', 'Проценты, ₽', 'Остаток на конец года, ₽']];
    result.yearly.forEach((r) => {
      yearly.push([r.year, r.count, rub(r.payment), rub(r.principal), rub(r.interest), rub(r.balance)]);
    });
    const wsYearly = XLSX.utils.aoa_to_sheet(yearly);
    wsYearly['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 26 }];
    formatColumns(XLSX, wsYearly, [2, 3, 4, 5], 1, yearly.length - 1, FMT_MONEY);
    XLSX.utils.book_append_sheet(wb, wsYearly, 'По годам');

    return wb;
  }

  const api = { buildWorkbook };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.excelExport = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
