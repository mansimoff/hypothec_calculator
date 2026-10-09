'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { calculate } = require('../src/js/calculations/mortgage');
const { buildPdf } = require('../src/js/exports/pdfExport');
const { buildWorkbook } = require('../src/js/exports/excelExport');
const { compactRub } = require('../src/js/charts/mortgageCharts');

const vendor = (name) => path.join(__dirname, '..', 'src', 'vendor', name);

function loadFonts() {
  const sandbox = { MortgageCalc: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'exports', 'fonts', 'plex-vfs.js'), 'utf8');
  new Function('self', 'globalThis', src)(sandbox, sandbox);
  return sandbox.MortgageCalc.fonts;
}

function report(type = 'annuity') {
  const out = calculate(
    { price: '8 000 000', downPayment: { mode: 'pct', value: '20' }, rate: '12', term: { value: '20', unit: 'years' }, type, startDate: '2026-11-05' },
    'cost',
  );
  assert.equal(out.ok, true);
  return {
    result: out.result,
    params: { modeLabel: 'Расчёт по стоимости', typeLabel: 'Аннуитетные платежи', rateText: '12 %', termText: '20 лет', startDate: '2026-11-05' },
    generatedAt: '06.10.2026',
  };
}

test('PDF: собирается с кириллицей, ≥1 страницы, корректная сигнатура', () => {
  const { jsPDF } = require(vendor('jspdf.umd.min.js'));
  const doc = buildPdf(jsPDF, loadFonts(), report());
  const bytes = Buffer.from(doc.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(doc.getNumberOfPages() >= 2, 'графики и таблица по годам занимают не менее 2 страниц');
  assert.ok(bytes.length > 20_000, 'шрифт встроен');
  if (process.env.WRITE_SAMPLES) {
    fs.mkdirSync(path.join(__dirname, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'tmp', 'sample.pdf'), bytes);
  }
});

test('PDF: дифференцированный график тоже строится', () => {
  const { jsPDF } = require(vendor('jspdf.umd.min.js'));
  const r = report('differentiated');
  r.params.typeLabel = 'Дифференцированные платежи';
  const doc = buildPdf(jsPDF, loadFonts(), r);
  assert.ok(doc.getNumberOfPages() >= 2);
});

test('Excel: три листа, суммы — числа в рублях, итоги сходятся', () => {
  const XLSX = require(vendor('xlsx.full.min.js'));
  const rep = report();
  const wb = buildWorkbook(XLSX, rep);
  assert.deepEqual(wb.SheetNames, ['Расчёт', 'График по месяцам', 'По годам']);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'buffer' });

  const monthly = XLSX.utils.sheet_to_json(back.Sheets['График по месяцам'], { header: 1 });
  assert.equal(monthly.length, 241, 'заголовок + 240 строк');
  const interestSum = monthly.slice(1).reduce((s, row) => s + Math.round(row[4] * 100), 0);
  assert.equal(interestSum, rep.result.interestKop);
  assert.equal(monthly[240][5], 0, 'остаток после последнего платежа');
  assert.equal(typeof monthly[1][2], 'number');

  const yearly = XLSX.utils.sheet_to_json(back.Sheets['По годам'], { header: 1 });
  assert.equal(yearly.length, rep.result.yearly.length + 1);

  const summary = XLSX.utils.sheet_to_json(back.Sheets['Расчёт'], { header: 1 });
  const loanRow = summary.find((r) => r[0] === 'Сумма кредита, ₽');
  assert.equal(loanRow[1], rep.result.loanKop / 100);
});

test('compactRub: подписи осей', () => {
  assert.equal(compactRub(480_000_000), '4,8 млн');
  assert.equal(compactRub(150_000_00), '150 тыс.');
  assert.equal(compactRub(500), '5');
  assert.equal(compactRub(0), '0');
  assert.equal(compactRub(2_500_000_000_00), '2,5 млрд');
});
