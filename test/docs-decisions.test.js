// Spójność dokumentacji decyzji (ADR) i rejestru lekcji.
//
// Uwaga właściciela (2026-08-14): „Lepiej takie zasady zapisywać w jakichś
// generalnych zasadach projektu, a nie w handoffie, który jest jednorazowy
// i przepada". Reguły trwałe mieszkają więc w `docs/decisions/` (ADR) oraz
// `docs/LESSONS.md` — a te dokumenty muszą pozostać spójne z repozytorium,
// inaczej po kilku sesjach znów staną się nieaktualne.
//
// Test pilnuje kontraktu dokumentacji (nie treści merytorycznej):
//  - każdy plik ADR jest wpisany do tabeli w README i odwrotnie;
//  - numeracja plików zgadza się z numerem w nagłówku i linkiem w tabeli;
//  - każdy ADR ma wymagane sekcje i status ze słownika;
//  - `docs/LESSONS.md` istnieje, jest podlinkowany z AGENTS.md i ma lekcje
//    w spójnym formacie (LN + data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DECISIONS_DIR = 'docs/decisions';
const README = path.join(DECISIONS_DIR, 'README.md');
const VALID_STATUSES = ['Proponowana', 'Zaakceptowana', 'Odrzucona', 'Zastąpiona', 'Wycofana'];

function adrFiles() {
  return fs.readdirSync(DECISIONS_DIR)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort();
}

function readmeRows() {
  const readme = fs.readFileSync(README, 'utf8');
  // Wiersze tabeli: | [0001](0001-....md) | Tytuł | Status |
  return [...readme.matchAll(/^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|([^|]+)\|([^|]+)\|/gm)]
    .map((m) => ({ number: m[1], link: m[2], title: m[3].trim(), status: m[4].trim() }));
}

test('ADR: każdy plik decyzji jest wpisany do tabeli w README', () => {
  const rows = readmeRows();
  const listed = new Set(rows.map((r) => r.link));
  for (const file of adrFiles()) {
    assert.ok(listed.has(file),
      `ADR ${file} istnieje, ale nie ma go w tabeli docs/decisions/README.md`);
  }
});

test('ADR: każdy wiersz tabeli wskazuje istniejący plik', () => {
  for (const row of readmeRows()) {
    const full = path.join(DECISIONS_DIR, row.link);
    assert.ok(fs.existsSync(full),
      `tabela README wskazuje nieistniejący plik: ${row.link}`);
  }
});

test('ADR: numer w nazwie pliku zgadza się z numerem w nagłówku i w tabeli', () => {
  const rows = new Map(readmeRows().map((r) => [r.link, r]));
  for (const file of adrFiles()) {
    const number = file.slice(0, 4);
    const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
    const heading = content.match(/^#\s*ADR\s*(\d{4}):/m);
    assert.ok(heading, `${file}: brak nagłówka „# ADR NNNN: Tytuł"`);
    assert.equal(heading[1], number,
      `${file}: numer w nagłówku (${heading[1]}) różni się od numeru w nazwie pliku (${number})`);
    assert.equal(rows.get(file)?.number, number,
      `${file}: numer w tabeli README nie zgadza się z nazwą pliku`);
  }
});

test('ADR: każdy dokument ma status ze słownika i wymagane sekcje', () => {
  for (const file of adrFiles()) {
    const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
    const status = content.match(/^-\s*\*\*Status:\*\*\s*(.+)$/m);
    assert.ok(status, `${file}: brak pola „**Status:**"`);
    const value = status[1].trim().split(' ')[0];
    assert.ok(VALID_STATUSES.includes(value),
      `${file}: nieznany status „${value}" (dozwolone: ${VALID_STATUSES.join(', ')})`);
    for (const section of ['## Kontekst', '## Decyzja', '## Konsekwencje']) {
      assert.ok(content.includes(section), `${file}: brak sekcji „${section}"`);
    }
  }
});

test('ADR 0017 (kompletność PlayerView) istnieje i jest zaakceptowany', () => {
  const file = adrFiles().find((name) => name.startsWith('0017-'));
  assert.ok(file, 'ADR 0017 (kontrakt widok↔kontroler) powinien istnieć');
  const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
  assert.match(content, /\*\*Status:\*\*\s*Zaakceptowana/, 'ADR 0017 musi być zaakceptowany');
  // Reguła musi wprost wiązać widok z decyzjami kontrolera i chronić przed
  // odwrotnym błędem („wystawiajmy wszystko na zapas").
  assert.match(content, /PlayerView/, 'ADR 0017 musi mówić o PlayerView');
  assert.match(content, /na zapas/i, 'ADR 0017 musi zawierać zakaz wystawiania pól „na zapas"');
});

test('LESSONS: rejestr lekcji istnieje i ma spójny format wpisów', () => {
  assert.ok(fs.existsSync('docs/LESSONS.md'), 'docs/LESSONS.md musi istnieć (trwały rejestr lekcji)');
  const lessons = fs.readFileSync('docs/LESSONS.md', 'utf8');
  const entries = [...lessons.matchAll(/^##\s*(L\d+)\s*\((\d{4}-\d{2}-\d{2})\)\s*—\s*.+$/gm)];
  assert.ok(entries.length >= 1, 'rejestr lekcji musi mieć wpisy w formacie „## LN (YYYY-MM-DD) — tytuł"');
  const ids = entries.map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `zduplikowane identyfikatory lekcji: ${ids.join(', ')}`);
});

test('LESSONS i ADR są podlinkowane z AGENTS.md (żeby nowa sesja je przeczytała)', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /docs\/LESSONS\.md/,
    'AGENTS.md musi kierować do docs/LESSONS.md — inaczej rejestr lekcji zostanie pominięty');
  assert.match(agents, /docs\/decisions/,
    'AGENTS.md musi kierować do rejestru ADR');
});
