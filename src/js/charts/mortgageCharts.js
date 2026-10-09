/**
 * mortgageCharts.js — три графика на Chart.js. Цвета берутся из CSS-переменных,
 * поэтому тема (светлая/тёмная) подхватывается при перерисовке.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const money = isNode ? require('../calculations/money') : root.MortgageCalc.money;

  /** Копейки → компактная подпись оси: 4 800 000 ₽ → «4,8 млн». */
  function compactRub(kop) {
    const rub = Math.abs(kop) / 100;
    const sign = kop < 0 ? '\u2212' : '';
    if (rub >= 1e9) {
      return sign + trim(rub / 1e9) + ' млрд';
    }
    if (rub >= 1e6) {
      return sign + trim(rub / 1e6) + ' млн';
    }
    if (rub >= 1e3) {
      return sign + trim(rub / 1e3) + ' тыс.';
    }
    return sign + String(Math.round(rub));
  }

  function trim(x) {
    return (Math.round(x * 10) / 10).toString().replace('.', ',');
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      down: cssVar('--c-down'),
      principal: cssVar('--c-principal'),
      interest: cssVar('--c-interest'),
      grid: cssVar('--c-grid'),
      text: cssVar('--muted'),
      ink: cssVar('--ink'),
      surface: cssVar('--surface'),
    };
  }

  function baseOptions(c) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      font: { family: '"IBM Plex Sans", system-ui, sans-serif' },
      color: c.text,
      plugins: {
        legend: { position: 'bottom', labels: { color: c.text, boxWidth: 12, boxHeight: 12, usePointStyle: true } },
      },
    };
  }

  function moneyTooltip(ctx) {
    const v = ctx.parsed.y !== undefined && ctx.parsed.y !== null ? ctx.parsed.y : ctx.parsed;
    return ` ${ctx.dataset.label}: ${money.formatKop(v, { kop: false })}`;
  }

  /**
   * Перерисовывает все графики. Возвращает набор экземпляров для последующего destroy().
   * @param {Function} ChartCtor конструктор Chart
   * @param {{balance: HTMLCanvasElement, years: HTMLCanvasElement, share: HTMLCanvasElement}} canvases
   * @param {object} result результат mortgage.calculate().result
   * @param {object|null} previous предыдущие экземпляры
   */
  function renderCharts(ChartCtor, canvases, result, previous) {
    if (previous) {
      Object.values(previous).forEach((ch) => ch.destroy());
    }
    const c = palette();
    const rows = result.schedule;

    // 1. остаток долга + накопленные проценты по месяцам
    let cumInterest = 0;
    const labels = [];
    const balance = [result.loanKop];
    const interest = [0];
    labels.push('старт');
    rows.forEach((r) => {
      cumInterest += r.interest;
      labels.push(money.formatRuDate(r.date));
      balance.push(r.balance);
      interest.push(cumInterest);
    });
    const balanceChart = new ChartCtor(canvases.balance, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Остаток долга',
            data: balance,
            borderColor: c.principal,
            backgroundColor: c.principal + '22',
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
          {
            label: 'Выплачено процентов',
            data: interest,
            borderColor: c.interest,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
        ],
      },
      options: {
        ...baseOptions(c),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          ...baseOptions(c).plugins,
          tooltip: { callbacks: { label: moneyTooltip } },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: c.text,
              maxTicksLimit: 8,
              maxRotation: 0,
              callback(value) {
                const label = this.getLabelForValue(value);
                return label === 'старт' ? label : label.slice(6);
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            ticks: { color: c.text, callback: (v) => compactRub(v) },
          },
        },
      },
    });

    // 2. платежи по календарным годам
    const yearsChart = new ChartCtor(canvases.years, {
      type: 'bar',
      data: {
        labels: result.yearly.map((y) => String(y.year)),
        datasets: [
          { label: 'Основной долг', data: result.yearly.map((y) => y.principal), backgroundColor: c.principal, stack: 's' },
          { label: 'Проценты', data: result.yearly.map((y) => y.interest), backgroundColor: c.interest, stack: 's' },
        ],
      },
      options: {
        ...baseOptions(c),
        interaction: { mode: 'index', intersect: false },
        plugins: { ...baseOptions(c).plugins, tooltip: { callbacks: { label: moneyTooltip } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: c.text, maxTicksLimit: 10, maxRotation: 0 } },
          y: { stacked: true, grid: { color: c.grid }, ticks: { color: c.text, callback: (v) => compactRub(v) } },
        },
      },
    });

    // 3. структура расходов: взнос / основной долг / проценты
    const shareChart = new ChartCtor(canvases.share, {
      type: 'doughnut',
      data: {
        labels: ['Первоначальный взнос', 'Основной долг', 'Проценты'],
        datasets: [
          {
            data: [result.downKop, result.loanKop, result.interestKop],
            backgroundColor: [c.down, c.principal, c.interest],
            borderColor: c.surface,
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...baseOptions(c),
        cutout: '62%',
        plugins: {
          ...baseOptions(c).plugins,
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${money.formatKop(ctx.parsed, { kop: false })}`,
            },
          },
        },
      },
    });

    return { balance: balanceChart, years: yearsChart, share: shareChart };
  }

  const api = { compactRub, renderCharts };
  if (isNode) {
    module.exports = api;
  } else {
    root.MortgageCalc = root.MortgageCalc || {};
    root.MortgageCalc.charts = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
