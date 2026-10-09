/**
 * app.js — оркестратор: читает форму, вызывает расчётное ядро, выводит
 * результаты, графики и таблицу. Никакой финансовой математики здесь нет.
 */
(function () {
  'use strict';

  const { decimal, money, mortgage, validate, charts, pdfExport, excelExport, fonts } = window.MortgageCalc;
  const MODE = validate.MODE;
  const NBSP = money.NBSP;

  const $ = (id) => document.getElementById(id);
  const form = $('calc-form');

  const state = {
    mode: MODE.BY_COST,
    downMode: validate.DOWN_MODE.PERCENT,
    scheduleView: 'year',
    result: null,
    params: null,
    charts: null,
    timer: null,
  };

  const ERROR_FIELDS = ['price', 'payment', 'downPayment', 'rate', 'term', 'startDate'];

  // ---------- чтение формы ----------

  function readForm() {
    return {
      price: $('price').value,
      payment: $('payment').value,
      downPayment: { mode: state.downMode, value: $('downPayment').value },
      rate: $('rate').value,
      term: { value: $('termValue').value, unit: $('termUnit').value },
      type: form.elements.type.value,
      startDate: $('startDate').value,
    };
  }

  // ---------- ошибки ----------

  function clearErrors() {
    ERROR_FIELDS.forEach((key) => {
      const err = $('err-' + key);
      if (err) {
        err.textContent = '';
        const field = err.closest('.field');
        if (field) {
          field.classList.remove('is-invalid');
        }
      }
      const input = key === 'term' ? $('termValue') : $(key);
      if (input) {
        input.removeAttribute('aria-invalid');
      }
    });
  }

  function showErrors(errors) {
    clearErrors();
    Object.entries(errors).forEach(([key, message]) => {
      const err = $('err-' + key);
      if (!err) {
        return;
      }
      err.textContent = message;
      err.closest('.field').classList.add('is-invalid');
      const input = key === 'term' ? $('termValue') : $(key);
      if (input) {
        input.setAttribute('aria-invalid', 'true');
      }
    });
  }

  // ---------- вывод результатов ----------

  const rub = (kop, withKop = true) => money.formatKop(kop, { kop: withKop });

  function fact(label, value, accent) {
    const row = document.createElement('div');
    row.className = 'facts__row' + (accent ? ' facts__row--accent' : '');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }

  function percentOf(part, whole) {
    return whole > 0 ? (part / whole) * 100 : 0;
  }

  function renderResults(r) {
    $('results-empty').hidden = true;
    $('results-body').hidden = false;

    const last = r.schedule[r.schedule.length - 1];
    const endDate = money.formatRuDate(last.date);
    const diff = r.type === 'differentiated';

    if (r.mode === MODE.BY_COST) {
      $('hero-label').textContent = diff ? 'Первый платёж (дальше уменьшается)' : 'Ежемесячный платёж';
      $('hero-value').textContent = rub(r.firstPaymentKop);
      $('hero-sub').textContent = diff
        ? `Последний платёж ${rub(r.lastPaymentKop)} · до ${endDate}`
        : `${money.formatTerm(r.months)} · последний платёж ${endDate}`;
    } else {
      $('hero-label').textContent = 'Можно купить недвижимость до';
      $('hero-value').textContent = rub(r.priceKop, false);
      $('hero-sub').textContent = `Кредит ${rub(r.loanKop, false)} при платеже ${rub(r.firstPaymentKop)}${diff ? ' (первый)' : ' в месяц'}`;
    }

    // композиция расходов
    const total = r.totalWithDownKop;
    const shares = {
      down: percentOf(r.downKop, total),
      principal: percentOf(r.loanKop, total),
      interest: percentOf(r.interestKop, total),
    };
    ['down', 'principal', 'interest'].forEach((key) => {
      const seg = $('seg-' + key);
      seg.style.flex = `${shares[key]} 1 0%`;
      seg.style.display = shares[key] > 0 ? 'block' : 'none';
      $('share-' + key).textContent = money.formatPercent(shares[key], 1);
    });

    // таблица фактов
    const facts = $('facts');
    facts.replaceChildren();
    const rows = [];
    if (r.mode === MODE.BY_PAYMENT) {
      rows.push(['Максимальный кредит', rub(r.loanKop, false)]);
    } else {
      rows.push(['Сумма кредита', rub(r.loanKop, false)]);
    }
    rows.push([
      'Первоначальный взнос',
      `${rub(r.downKop, false)} (${money.formatPercent(percentOf(r.downKop, r.priceKop), 1)})`,
    ]);
    if (r.mode === MODE.BY_PAYMENT) {
      rows.push(['Стоимость недвижимости', rub(r.priceKop, false)]);
    }
    if (diff) {
      rows.push(['Средний платёж', rub(r.avgPaymentKop)]);
    }
    rows.push(['Проценты (переплата)', `${rub(r.interestKop, false)} · ${money.formatPercent(r.overpaymentPercent, 1)}`, true]);
    rows.push(['Всего выплачено банку', rub(r.totalPaidKop, false)]);
    rows.push(['Расходы вместе со взносом', rub(r.totalWithDownKop, false)]);
    rows.push([`Необходимый доход (платёж ≤ 40${NBSP}%)`, rub(r.requiredIncomeKop, false)]);
    rows.push(['Срок', `${money.formatTerm(r.months)} · до ${endDate}`]);
    rows.forEach(([label, value, accent]) => facts.append(fact(label, value, accent)));
  }

  function showEmptyResults() {
    $('results-body').hidden = true;
    $('results-empty').hidden = false;
  }

  function updateDownHint(r) {
    const hint = $('hint-downPayment');
    if (!r) {
      hint.textContent = '';
      return;
    }
    hint.textContent =
      state.downMode === validate.DOWN_MODE.PERCENT
        ? `= ${rub(r.downKop, false)}`
        : `= ${money.formatNumber(percentOf(r.downKop, r.priceKop), 2)}${NBSP}% от стоимости`;
  }

  // ---------- графики ----------

  function drawCharts() {
    if (!state.result || typeof window.Chart === 'undefined') {
      return;
    }
    state.charts = charts.renderCharts(
      window.Chart,
      { balance: $('chart-balance'), years: $('chart-years'), share: $('chart-share') },
      state.result,
      state.charts,
    );
  }

  // ---------- таблица графика ----------

  function cell(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  function renderSchedule() {
    const r = state.result;
    const table = $('schedule-table');
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    thead.replaceChildren();
    tbody.replaceChildren();
    if (!r) {
      return;
    }

    const byYear = state.scheduleView === 'year';
    const headers = byYear
      ? ['Год', 'Платежей', 'Выплачено', 'Основной долг', 'Проценты', 'Остаток долга']
      : ['№', 'Дата', 'Платёж', 'Основной долг', 'Проценты', 'Остаток долга'];
    const headRow = document.createElement('tr');
    headers.forEach((h) => headRow.append(cell('th', h)));
    thead.append(headRow);

    const frag = document.createDocumentFragment();
    if (byYear) {
      r.yearly.forEach((y) => {
        const tr = document.createElement('tr');
        [String(y.year), String(y.count), rub(y.payment), rub(y.principal), rub(y.interest), rub(y.balance)].forEach((v) =>
          tr.append(cell('td', v)),
        );
        frag.append(tr);
      });
    } else {
      r.schedule.forEach((row) => {
        const tr = document.createElement('tr');
        [String(row.n), money.formatRuDate(row.date), rub(row.payment), rub(row.principal), rub(row.interest), rub(row.balance)].forEach(
          (v) => tr.append(cell('td', v)),
        );
        frag.append(tr);
      });
    }
    tbody.append(frag);
  }

  // ---------- главный цикл ----------

  function describeParams(raw) {
    const unit = raw.term.unit === 'months' ? 'months' : 'years';
    return {
      modeLabel: state.mode === MODE.BY_COST ? 'Расчёт по стоимости' : 'Расчёт по платежу',
      typeLabel: raw.type === 'differentiated' ? 'Дифференцированные платежи' : 'Аннуитетные платежи',
      rateText: `${String(raw.rate).trim().replace('.', ',')} %`,
      termText: unit === 'years' ? `${raw.term.value} ${money.plural(Number(raw.term.value), ['год', 'года', 'лет'])}` : money.formatTerm(Number(raw.term.value)),
      startDate: raw.startDate,
    };
  }

  function recalc() {
    const raw = readForm();
    const outcome = mortgage.calculate(raw, state.mode);
    if (!outcome.ok) {
      showErrors(outcome.errors);
      state.result = null;
      updateDownHint(null);
      showEmptyResults();
      return;
    }
    clearErrors();
    state.result = outcome.result;
    state.params = describeParams(raw);
    renderResults(state.result);
    updateDownHint(state.result);
    drawCharts();
    renderSchedule();
  }

  function scheduleRecalc() {
    clearTimeout(state.timer);
    state.timer = setTimeout(recalc, 120);
  }

  // ---------- режимы и единицы ----------

  function setMode(mode) {
    state.mode = mode;
    const byCost = mode === MODE.BY_COST;
    $('field-price').hidden = !byCost;
    $('field-payment').hidden = byCost;
    $('mode-lead').textContent = byCost
      ? 'Известна цена квартиры — считаем платёж и переплату.'
      : 'Известен посильный платёж — считаем, какую недвижимость можно купить.';
    recalc();
  }

  function setDownMode(mode) {
    const r = state.result;
    state.downMode = mode;
    $('down-unit').textContent = mode === validate.DOWN_MODE.PERCENT ? '%' : '₽';
    if (r) {
      $('downPayment').value =
        mode === validate.DOWN_MODE.PERCENT
          ? money.formatNumber(percentOf(r.downKop, r.priceKop), 2).replace(/,?0+$/, '')
          : money.kopToInputString(r.downKop);
    }
    recalc();
  }

  function formatMoneyOnBlur(input) {
    const parsed = decimal.parseDecimal(input.value, 2);
    if (parsed) {
      const kop = Number((parsed.num * 100n) / decimal.pow10(parsed.scale));
      input.value = money.kopToInputString(kop);
    }
  }

  // ---------- экспорт ----------

  function exportFileName(ext) {
    return `ipoteka_${money.todayISO()}.${ext}`;
  }

  function currentReport() {
    return { result: state.result, params: state.params, generatedAt: money.formatRuDate(money.todayISO()) };
  }

  function guardExport(action) {
    const errBox = $('export-error');
    errBox.textContent = '';
    if (!state.result) {
      errBox.textContent = 'Сначала исправьте ошибки в форме.';
      return;
    }
    try {
      action();
    } catch (e) {
      errBox.textContent = 'Не удалось создать файл: ' + (e && e.message ? e.message : e);
    }
  }

  function exportPdf() {
    guardExport(() => {
      if (!window.jspdf) {
        throw new Error('библиотека jsPDF не загружена');
      }
      const doc = pdfExport.buildPdf(window.jspdf.jsPDF, fonts, currentReport());
      doc.save(exportFileName('pdf'));
    });
  }

  function exportXlsx() {
    guardExport(() => {
      if (!window.XLSX) {
        throw new Error('библиотека SheetJS не загружена');
      }
      const wb = excelExport.buildWorkbook(window.XLSX, currentReport());
      window.XLSX.writeFile(wb, exportFileName('xlsx'));
    });
  }

  // ---------- инициализация ----------

  function init() {
    const start = money.addMonths(money.parseISODate(money.todayISO()), 1);
    $('startDate').value = money.formatISODate(start);

    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', (e) => {
      if (e.target.type === 'radio' || e.target.tagName === 'SELECT') {
        return;
      }
      scheduleRecalc();
    });
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'mode') {
        setMode(t.value);
      } else if (t.name === 'downMode') {
        setDownMode(t.value);
      } else {
        recalc();
      }
    });

    ['price', 'payment'].forEach((id) => $(id).addEventListener('blur', () => formatMoneyOnBlur($(id))));
    $('downPayment').addEventListener('blur', () => {
      if (state.downMode === validate.DOWN_MODE.RUB) {
        formatMoneyOnBlur($('downPayment'));
      }
    });

    document.querySelectorAll('input[name="scheduleView"]').forEach((radio) =>
      radio.addEventListener('change', () => {
        state.scheduleView = radio.value;
        renderSchedule();
      }),
    );

    $('btn-pdf').addEventListener('click', exportPdf);
    $('btn-xlsx').addEventListener('click', exportXlsx);

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCharts);
    }

    recalc();
  }

  init();
})();
