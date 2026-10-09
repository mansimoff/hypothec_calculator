'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

test('все script/link из index.html существуют на диске', () => {
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css|vendor)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 12);
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(SRC, ref)), `нет файла ${ref}`);
  }
});

test('все id, которые использует app.js, есть в разметке', () => {
  const app = fs.readFileSync(path.join(SRC, 'js', 'app.js'), 'utf8');
  const ids = new Set([...app.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `в index.html нет id="${id}"`);
  }
  for (const key of ['price', 'payment', 'downPayment', 'rate', 'term', 'startDate']) {
    assert.ok(html.includes(`id="err-${key}"`), `нет контейнера ошибки err-${key}`);
  }
  for (const key of ['down', 'principal', 'interest']) {
    assert.ok(html.includes(`id="seg-${key}"`) && html.includes(`id="share-${key}"`));
  }
});

test('id в разметке уникальны', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'есть повторяющиеся id');
});

test('у вендорных библиотек лежат лицензии', () => {
  for (const f of ['LICENSE-chartjs.md', 'LICENSE-sheetjs.txt', 'LICENSE-jspdf.txt']) {
    assert.ok(fs.existsSync(path.join(SRC, 'vendor', f)), f);
  }
});
