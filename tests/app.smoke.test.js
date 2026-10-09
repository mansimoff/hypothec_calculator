'use strict';

/**
 * Дымовой тест UI: реальные index.html + app.js в jsdom, Chart/jsPDF/SheetJS — заглушки.
 * Проверяет «проводку»: форма → расчёт → результаты/ошибки/таблица/экспорт.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src');
// порядок и состав скриптов берём из самого index.html — тест ловит ошибки порядка загрузки
const SCRIPTS = [...fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);

function boot() {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  const chartCalls = [];
  const saved = { pdf: [], xlsx: [] };
  window.Chart = class {
    constructor(canvas, cfg) {
      this.cfg = cfg;
      chartCalls.push(cfg);
    }
    destroy() {
      this.destroyed = true;
    }
  };
  window.jspdf = {
    jsPDF: class {
      constructor() {
        this.n = 0;
      }
      addFileToVFS() {}
      addFont() {}
      setProperties() {}
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setDrawColor() {}
      setFillColor() {}
      setLineWidth() {}
      text() {}
      line() {}
      rect() {}
      addPage() {}
      setPage() {}
      getNumberOfPages() {
        return 1;
      }
      save(name) {
        saved.pdf.push(name);
      }
    },
  };
  window.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => ({ aoa }),
      book_append_sheet: (wb, ws, name) => wb.SheetNames.push(name),
      encode_cell: () => 'A1',
    },
    writeFile: (wb, name) => saved.xlsx.push({ name, sheets: wb.SheetNames }),
  };

  for (const file of SCRIPTS) {
    window.eval(fs.readFileSync(path.join(SRC, file), 'utf8'));
  }
  return { window, document: window.document, chartCalls, saved };
}

function type(window, el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function pick(window, document, name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new window.Event('change', { bubbles: true }));
}

const nb = (s) => s.replace(/\u00A0/g, ' ');

test('старт: вкладка «Ипотека», расчёт по стоимости с дефолтами, 3 графика, таблица по годам', () => {
  const { document, chartCalls } = boot();
  assert.equal(document.getElementById('tab-mortgage').getAttribute('aria-selected'), 'true');
  assert.equal(nb(document.getElementById('hero-value').textContent), '70 469,51 ₽');
  assert.equal(document.getElementById('hero-label').textContent, 'Ежемесячный платёж');
  assert.deepEqual(chartCalls.map((c) => c.type), ['line', 'bar', 'doughnut']);
  assert.ok(document.querySelectorAll('#facts .facts__row').length >= 6);
  assert.equal(document.querySelectorAll('#schedule-table tbody tr').length, 21, '20 лет со сдвигом старта → 20–21 календарных года');
  assert.equal(nb(document.getElementById('hint-downPayment').textContent), '= 1 600 000 ₽');
});

test('ввод стоимости пересчитывает результат и перерисовывает графики', () => {
  const { window, document, chartCalls } = boot();
  const before = chartCalls.length;
  type(window, document.getElementById('price'), '6 000 000');
  type(window, document.getElementById('rate'), '10');
  assert.notEqual(nb(document.getElementById('hero-value').textContent), '70 469,51 ₽');
  assert.ok(chartCalls.length > before);
});

test('режим «по платежу»: поле платежа показано, цена скрыта, hero — максимальная стоимость', () => {
  const { window, document } = boot();
  pick(window, document, 'mode', 'payment');
  assert.equal(document.getElementById('field-price').hidden, true);
  assert.equal(document.getElementById('field-payment').hidden, false);
  assert.equal(document.getElementById('hero-label').textContent, 'Можно купить недвижимость до');
  assert.match(nb(document.getElementById('hero-value').textContent), /^[\d ]+ ₽$/);
  assert.match(document.getElementById('mode-lead').textContent, /посильный платёж/);

  type(window, document.getElementById('payment'), '52 853,58');
  type(window, document.getElementById('downPayment'), '20');
  assert.match(nb(document.getElementById('facts').textContent), /Максимальный кредит/);
});

test('ошибки: подсветка поля, текст, пустые результаты; исправление возвращает результаты', () => {
  const { window, document } = boot();
  type(window, document.getElementById('price'), 'abc');
  assert.ok(document.getElementById('err-price').textContent.length > 0);
  assert.ok(document.getElementById('field-price').classList.contains('is-invalid'));
  assert.equal(document.getElementById('price').getAttribute('aria-invalid'), 'true');
  assert.equal(document.getElementById('results-empty').hidden, false);
  assert.equal(document.getElementById('results-body').hidden, true);

  type(window, document.getElementById('price'), '8000000');
  assert.equal(document.getElementById('err-price').textContent, '');
  assert.equal(document.getElementById('results-body').hidden, false);
  assert.equal(document.getElementById('price').hasAttribute('aria-invalid'), false);
});

test('взнос ≥ стоимости даёт ошибку у поля взноса', () => {
  const { window, document } = boot();
  pick(window, document, 'downMode', 'rub');
  type(window, document.getElementById('downPayment'), '9 000 000');
  assert.match(document.getElementById('err-downPayment').textContent, /меньше стоимости/);
});

test('переключение единицы взноса конвертирует значение: 20 % ↔ 1 600 000 ₽', () => {
  const { window, document } = boot();
  pick(window, document, 'downMode', 'rub');
  assert.equal(nb(document.getElementById('downPayment').value), '1 600 000');
  assert.equal(document.getElementById('down-unit').textContent, '₽');
  pick(window, document, 'downMode', 'pct');
  assert.equal(document.getElementById('downPayment').value, '20');
});

test('дифференцированный тип меняет заголовок и подпись', () => {
  const { window, document } = boot();
  pick(window, document, 'type', 'differentiated');
  assert.match(document.getElementById('hero-label').textContent, /Первый платёж/);
  assert.match(document.getElementById('hero-sub').textContent, /Последний платёж/);
});

test('таблица: переключение «по месяцам» даёт 240 строк', () => {
  const { window, document } = boot();
  pick(window, document, 'scheduleView', 'month');
  assert.equal(document.querySelectorAll('#schedule-table tbody tr').length, 240);
  assert.equal(document.querySelectorAll('#schedule-table thead th').length, 6);
});

test('экспорт: PDF и Excel вызываются с датой в имени; при ошибках формы — сообщение', () => {
  const { window, document, saved } = boot();
  document.getElementById('btn-pdf').click();
  document.getElementById('btn-xlsx').click();
  assert.match(saved.pdf[0], /^ipoteka_\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.match(saved.xlsx[0].name, /^ipoteka_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.deepEqual(saved.xlsx[0].sheets, ['Расчёт', 'График по месяцам', 'По годам']);

  type(window, document.getElementById('rate'), 'zzz');
  document.getElementById('btn-pdf').click();
  assert.match(document.getElementById('export-error').textContent, /исправьте ошибки/i);
});

test('блок композиции расходов: доли в сумме 100 %', () => {
  const { document } = boot();
  const parse = (id) => Number(document.getElementById(id).textContent.replace(/\s/g, '').replace(',', '.').replace('%', ''));
  const sum = parse('share-down') + parse('share-principal') + parse('share-interest');
  assert.ok(Math.abs(sum - 100) < 0.2, `сумма долей ${sum}`);
});
