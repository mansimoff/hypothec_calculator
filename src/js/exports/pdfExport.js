/**
 * pdfExport.js — PDF-отчёт. Графики рисуются векторно средствами jsPDF
 * (не растровым скриншотом canvas): чёткие при печати и не зависят от тёмной темы.
 *
 * buildPdf(jsPDFCtor, fonts, report) → экземпляр jsPDF; сохранение — снаружи.
 * report = { result, params: { modeLabel, typeLabel, rateText, termText, startDate }, generatedAt }
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const money = isNode ? require('../calculations/money') : root.MortgageCalc.money;
  const charts = isNode ? require('../charts/mortgageCharts') : root.MortgageCalc.charts;

  const COLORS = {
    ink: [23, 32, 43],
    muted: [91, 103, 118],
    line: [217, 223, 231],
    principal: [35, 70, 201],
    interest: [209, 139, 0],
    down: [170, 180, 195],
    head: [238, 241, 245],
  };

  const PAGE = { w: 210, h: 297, margin: 15 };

  /** Деньги для PDF: неразрывные пробелы → обычные (надёжнее в шрифте). */
  function rub(kop, withKop = true) {
    return money.formatKop(kop, { kop: withKop }).replace(/\u00A0/g, ' ');
  }

  function registerFonts(doc, fonts) {
    doc.addFileToVFS('Plex-Regular.ttf', fonts.regular);
    doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
    doc.addFileToVFS('Plex-SemiBold.ttf', fonts.bold);
    doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
  }

  function text(doc, str, x, y, { size = 10, bold = false, color = COLORS.ink, align = 'left' } = {}) {
    doc.setFont('Plex', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(str), x, y, { align });
  }

  function hr(doc, y) {
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
  }

  function keyValueBlock(doc, title, rows, y) {
    text(doc, title, PAGE.margin, y, { size: 12, bold: true });
    y += 3;
    rows.forEach(([k, v]) => {
      y += 6.5;
      hr(doc, y - 4.6);
      text(doc, k, PAGE.margin, y, { color: COLORS.muted });
      text(doc, v, PAGE.w - PAGE.margin, y, { bold: true, align: 'right' });
    });
    hr(doc, y + 2);
    return y + 8;
  }

  /** Линейный график остатка долга и накопленных процентов. */
  function drawBalanceChart(doc, result, y, h) {
    const x0 = PAGE.margin + 16;
    const x1 = PAGE.w - PAGE.margin;
    const w = x1 - x0;
    const rows = result.schedule;
    const n = rows.length;
    const maxV = Math.max(result.loanKop, result.interestKop, 1);

    text(doc, 'Остаток долга и выплаченные проценты', PAGE.margin, y, { size: 12, bold: true });
    const top = y + 6;

    doc.setLineWidth(0.15);
    for (let g = 0; g <= 4; g++) {
      const gy = top + h - (h * g) / 4;
      doc.setDrawColor(...COLORS.line);
      doc.line(x0, gy, x1, gy);
      text(doc, charts.compactRub((maxV * g) / 4), x0 - 2, gy + 1.2, { size: 7, color: COLORS.muted, align: 'right' });
    }

    const px = (i) => x0 + (w * i) / n;
    const py = (v) => top + h - (h * v) / maxV;

    doc.setLineWidth(0.5);
    doc.setDrawColor(...COLORS.principal);
    let prevX = px(0);
    let prevY = py(result.loanKop);
    rows.forEach((r, i) => {
      const cx = px(i + 1);
      const cy = py(r.balance);
      doc.line(prevX, prevY, cx, cy);
      prevX = cx;
      prevY = cy;
    });

    doc.setDrawColor(...COLORS.interest);
    prevX = px(0);
    prevY = py(0);
    let cum = 0;
    rows.forEach((r, i) => {
      cum += r.interest;
      const cx = px(i + 1);
      const cy = py(cum);
      doc.line(prevX, prevY, cx, cy);
      prevX = cx;
      prevY = cy;
    });

    // подписи по оси X: первый и последний год + середина
    const firstYear = rows[0].date.slice(0, 4);
    const lastYear = rows[n - 1].date.slice(0, 4);
    text(doc, firstYear, x0, top + h + 5, { size: 7, color: COLORS.muted });
    text(doc, lastYear, x1, top + h + 5, { size: 7, color: COLORS.muted, align: 'right' });

    // легенда
    const ly = top + h + 11;
    doc.setFillColor(...COLORS.principal);
    doc.rect(x0, ly - 2.4, 3, 3, 'F');
    text(doc, 'Остаток долга', x0 + 5, ly, { size: 8, color: COLORS.muted });
    doc.setFillColor(...COLORS.interest);
    doc.rect(x0 + 38, ly - 2.4, 3, 3, 'F');
    text(doc, 'Выплачено процентов', x0 + 43, ly, { size: 8, color: COLORS.muted });
    return ly + 8;
  }

  /** Столбчатая диаграмма платежей по годам (долг + проценты). */
  function drawYearsChart(doc, result, y, h) {
    const x0 = PAGE.margin + 16;
    const x1 = PAGE.w - PAGE.margin;
    const w = x1 - x0;
    const years = result.yearly;
    const maxV = Math.max(...years.map((r) => r.payment), 1);

    text(doc, 'Платежи по годам', PAGE.margin, y, { size: 12, bold: true });
    const top = y + 6;

    doc.setLineWidth(0.15);
    for (let g = 0; g <= 4; g++) {
      const gy = top + h - (h * g) / 4;
      doc.setDrawColor(...COLORS.line);
      doc.line(x0, gy, x1, gy);
      text(doc, charts.compactRub((maxV * g) / 4), x0 - 2, gy + 1.2, { size: 7, color: COLORS.muted, align: 'right' });
    }

    const slot = w / years.length;
    const barW = Math.max(slot * 0.7, 0.4);
    const labelEvery = Math.ceil(years.length / 10);
    years.forEach((r, i) => {
      const bx = x0 + slot * i + (slot - barW) / 2;
      const hp = (h * r.principal) / maxV;
      const hi = (h * r.interest) / maxV;
      doc.setFillColor(...COLORS.principal);
      doc.rect(bx, top + h - hp, barW, hp, 'F');
      doc.setFillColor(...COLORS.interest);
      doc.rect(bx, top + h - hp - hi, barW, hi, 'F');
      if (i % labelEvery === 0) {
        text(doc, String(r.year), bx + barW / 2, top + h + 5, { size: 7, color: COLORS.muted, align: 'center' });
      }
    });
    return top + h + 12;
  }

  function drawYearTable(doc, result, y) {
    const cols = [
      { title: 'Год', x: PAGE.margin, align: 'left' },
      { title: 'Платежей', x: PAGE.margin + 30, align: 'right' },
      { title: 'Выплачено', x: PAGE.margin + 70, align: 'right' },
      { title: 'Основной долг', x: PAGE.margin + 112, align: 'right' },
      { title: 'Проценты', x: PAGE.margin + 148, align: 'right' },
      { title: 'Остаток долга', x: PAGE.w - PAGE.margin, align: 'right' },
    ];
    const header = (yy) => {
      doc.setFillColor(...COLORS.head);
      doc.rect(PAGE.margin, yy - 5, PAGE.w - 2 * PAGE.margin, 7, 'F');
      cols.forEach((c) => text(doc, c.title, c.x, yy, { size: 8, bold: true, align: c.align }));
      return yy + 7;
    };

    let cy = header(y);
    result.yearly.forEach((r) => {
      if (cy > PAGE.h - 20) {
        doc.addPage();
        cy = header(PAGE.margin + 6);
      }
      const cells = [String(r.year), String(r.count), rub(r.payment, false), rub(r.principal, false), rub(r.interest, false), rub(r.balance, false)];
      cells.forEach((v, i) => text(doc, v, cols[i].x, cy, { size: 8, align: cols[i].align }));
      hr(doc, cy + 2);
      cy += 6.2;
    });
    return cy;
  }

  function buildPdf(JsPDF, fonts, report) {
    const { result, params } = report;
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    registerFonts(doc, fonts);
    doc.setProperties({ title: 'Расчёт ипотеки', subject: 'Ипотечный калькулятор', creator: 'mortgage_calculator' });

    let y = PAGE.margin + 4;
    text(doc, 'Расчёт ипотеки', PAGE.margin, y, { size: 20, bold: true });
    y += 6;
    text(doc, `${params.modeLabel} · ${params.typeLabel}${report.generatedAt ? ' · ' + report.generatedAt : ''}`, PAGE.margin, y, {
      size: 9,
      color: COLORS.muted,
    });
    y += 12;

    y = keyValueBlock(
      doc,
      'Параметры',
      [
        ['Стоимость недвижимости', rub(result.priceKop)],
        ['Первоначальный взнос', rub(result.downKop)],
        ['Ставка', params.rateText],
        ['Срок', params.termText],
        ['Дата первого платежа', money.formatRuDate(params.startDate)],
      ],
      y,
    );

    const paymentRows =
      result.type === 'differentiated'
        ? [
            ['Первый платёж', rub(result.firstPaymentKop)],
            ['Последний платёж', rub(result.lastPaymentKop)],
          ]
        : [['Ежемесячный платёж', rub(result.firstPaymentKop)]];

    y = keyValueBlock(
      doc,
      'Результаты',
      [
        ...paymentRows,
        ['Сумма кредита', rub(result.loanKop)],
        ['Проценты (переплата)', `${rub(result.interestKop)} (${money.formatNumber(result.overpaymentPercent, 1)} %)`],
        ['Всего выплачено банку', rub(result.totalPaidKop)],
        ['Полная стоимость с взносом', rub(result.totalWithDownKop)],
        ['Необходимый доход (платёж ≤ 40 %)', rub(result.requiredIncomeKop, false)],
      ],
      y,
    );

    y = drawBalanceChart(doc, result, y + 2, 50);
    if (y + 70 > PAGE.h - PAGE.margin) {
      doc.addPage();
      y = PAGE.margin + 4;
    }
    y = drawYearsChart(doc, result, y + 2, 45);

    if (y + 30 > PAGE.h - PAGE.margin) {
      doc.addPage();
      y = PAGE.margin + 4;
    }
    text(doc, 'График по годам', PAGE.margin, y, { size: 12, bold: true });
    drawYearTable(doc, result, y + 8);

    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      text(doc, 'Модельный расчёт: без страховок, комиссий и досрочных погашений. Не является офертой.', PAGE.margin, PAGE.h - 8, {
        size: 7,
        color: COLORS.muted,
      });
      text(doc, `${p} / ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 8, { size: 7, color: COLORS.muted, align: 'right' });
    }
    return doc;
  }

  const api = { buildPdf };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.pdfExport = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
