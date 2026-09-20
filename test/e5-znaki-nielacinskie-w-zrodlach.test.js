// =============================================================================
// E5 — STRAŻNIK KLASY: znaki pisma NIEŁACIŃSKIEGO w tekstach repozytorium.
//
// Zgłoszenie właściciela 2026-09-20c (po lekturze audytu PR #130, pozycja
// „nie naprawiane świadomie"): „Błędy powinny być natychmiast naprawiane, a nie
// «świadomie nie naprawiane»."
//
// Klasa: PROJECT_HISTORY 2026-09-20c opisała JEDNORAZOWY skan pod kątem
// cyrylicy/CJK, który wtedy wyszedł czysto — ale bez stałego strażnika plama
// wróciła i urosła do **15 znaków w 13 plikach** (pomiar 2026-09-20c: 2 w
// `src/`, 2 w `test/`, 11 w `docs/`), np. `stworы` (U+044B), `Wardенem`,
// `обectomywane` zamiast „wybierane", `Test-контракт`, `sluchа`, `lukі`. To ta
// sama klasa co incydent `本地` (PROJECT_HISTORY 2026-09-20c): znak innego pisma
// wklejony w polski tekst — w kodzie nieszkodliwy (siedział w komentarzach), ale
// (a) psuje grep/szukanie po haśle, (b) dowodzi, że jednokrotny skan bez pinu
// niczego nie gwarantuje (L5: strażnik klasy, nie sprzątanie jednego miejsca).
//
// Kontrakt: każdy trackowany plik tekstowy repozytorium zawiera WYŁĄCZNIE pismo
// łacińskie (z polskimi znakami diakrytycznymi) oraz dozwoloną interpunkcję i
// symbole techniczne (`—`, `×`, `✔`, `→`, `≈`, `≤`, emoji, box-drawing). Wyjątki
// są JAWNE, opisane powodem i zliczone — lista nie może rosnąć po cichu.
//
// Naprawa 2026-09-20c: 14 skażeń usuniętych w `src/`, `test/` i `docs/`;
// jedyny legalny znak niełaciński to cytowany `本地` w PROJECT_HISTORY.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Rozszerzenia tekstowe, które przeglądamy (kod, testy, dokumenty, dane kart).
const ROZSZERZENIA = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.md', '.json', '.html', '.css', '.txt',
  '.csv', '.yml', '.yaml',
]);
// Katalogi, których nie przeglądamy: zależności i artefakty (nie nasz tekst).
const POMIN_KATALOGI = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.cache',
  '.venv', '__pycache__', '.arena',
]);
const MAX_BAJTY = 4 * 1024 * 1024;
// Pliki pomijane w całości: ten strażnik MUSI cytować znaki, które wykrywa
// (`本地`, `ы`) — inaczej czerwieniłby sam siebie. Lista jest zliczona w E5/2,
// więc nie może po cichu urosnąć.
const POMIN_PLIKI = new Set(['test/e5-znaki-nielacinskie-w-zrodlach.test.js']);

// Zakresy pisma NIEŁACIŃSKIEGO: cyrylica, hebrajski, arabski, CJK, kana,
// hangul, pełnoszerokie ASCII, tajski, dewanagari. Cyrylica jest najważniejsza:
// jej А/В/С/Е/О/Р/Х są NIEROZRÓŻNIALNE od łacińskich w edytorze (stąd `stworы`).
const NIELACINSKIE = /[\u0400-\u052f\u0590-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

// Greka jest osobno: litery greckie służą w tym repo jako SYMBOLE matematyczne
// (pomiar 2026-09-20c: Δ ×25, β ×37, Σ ×9, μ ×1, λ ×1 — tabele benchmarków i
// wzory w `docs/BOT_ROADMAP.md`), więc dozwolony jest DOKŁADNIE ten zestaw.
// Każda inna grecka litera (np. wklejone „контракт"-opodobne skażenie) czerwieni
// test; dodanie symbolu wymaga świadomej zmiany listy i jest sprawdzane w E5/2.
const GRECKIE = /[\u0370-\u03ff]/g;
const GRECKIE_DOZWOLONE = new Set(['Δ', 'β', 'Σ', 'μ', 'λ']);

function liniaSkazona(linia) {
  if (NIELACINSKIE.test(linia)) return true;
  for (const m of linia.matchAll(GRECKIE)) if (!GRECKIE_DOZWOLONE.has(m[0])) return true;
  return false;
}

function* plikiTekstowe(katalog = ROOT) {
  for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
    const sciezka = path.join(katalog, wpis.name);
    if (wpis.isDirectory()) {
      if (POMIN_KATALOGI.has(wpis.name)) continue;
      yield* plikiTekstowe(sciezka);
      continue;
    }
    if (!ROZSZERZENIA.has(path.extname(wpis.name).toLowerCase())) continue;
    if (POMIN_PLIKI.has(path.relative(ROOT, sciezka).replaceAll('\\', '/'))) continue;
    if (fs.statSync(sciezka).size > MAX_BAJTY) continue;
    yield sciezka;
  }
}

/** Lista trafień: { plik (ścieżka względna), linia, tekst }. */
export function skanujNielacinskie(katalog = ROOT) {
  const trafienia = [];
  for (const plik of plikiTekstowe(katalog)) {
    let tresc;
    try { tresc = fs.readFileSync(plik, 'utf8'); } catch { continue; }
    const wzgledna = path.relative(katalog, plik).replaceAll('\\', '/');
    tresc.split('\n').forEach((linia, i) => {
      if (liniaSkazona(linia)) {
        trafienia.push({ plik: wzgledna, linia: i + 1, tekst: linia.trim().slice(0, 120) });
      }
    });
  }
  return trafienia;
}

// Jawne wyjątki: znak niełaciński MUSI mieć powód (cytat, dane zewnętrzne).
// Ratchet działa w obie strony: nowe skażenie czerwieni test, a wyjątek, który
// przestał pasować (bo tekst naprawiono), też — żeby lista nie obrastała.
const WYJATKI = [
  {
    plik: 'docs/PROJECT_HISTORY.md',
    fragment: 'został mi znak `本地`',
    powod: 'dosłowny cytat z opisu incydentu 2026-09-20c — znak, który wtedy '
      + 'został w kodzie, jest TREŚCIĄ wpisu (bez niego wpis nie opisuje plamy)',
  },
];

test('E5/1: repozytorium nie zawiera znaków pisma niełacińskiego (klasa „本地")', () => {
  const trafienia = skanujNielacinskie();
  const nieusprawiedliwione = trafienia.filter((t) => !WYJATKI.some((w) => w.plik === t.plik
    && (t.tekst.includes(w.fragment) || t.tekst.includes(w.fragment.replace(/`/g, '')))));
  assert.deepEqual(nieusprawiedliwione, [],
    'znaki pisma niełacińskiego w tekstach repozytorium (grep psuje się, klasa incydentu '
    + `„本地"): ${JSON.stringify(nieusprawiedliwione, null, 1)}`);
});

test('E5/2: lista wyjątków jest jawna, opisana powodem i NIE rośnie (ratchet)', () => {
  assert.ok(WYJATKI.length >= 1, 'strażnik ma co najmniej jeden udokumentowany wyjątek');
  for (const w of WYJATKI) {
    assert.ok(w.powod && w.powod.length > 20, `wyjątek ${w.plik} musi mieć opisany powód`);
  }
  // Ratchet w górę: liczba wyjątków jest przypięta — dodanie kolejnego wymaga
  // świadomej zmiany tej liczby WRAZ z powodem (nie rośnie po cichu).
  assert.equal(POMIN_PLIKI.size, 1,
    'tylko ten strażnik jest pomijany w skanie (cytuje znaki, które wykrywa)');
  assert.ok(fs.existsSync(path.join(ROOT, [...POMIN_PLIKI][0])),
    'pomijany plik istnieje (inaczej pominięcie jest martwe)');
  // Dozwolone greckie symbole: każdy musi być FAKTYCZNIE użyty (ratchet w dół —
  // pozwolenie, którego nic nie potrzebuje, jest martwe i zawęża strażnika).
  const teksty = [...plikiTekstowe()].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  for (const symbol of GRECKIE_DOZWOLONE) {
    assert.ok(teksty.includes(symbol),
      `grecki symbol ${symbol} jest dozwolony, ale nigdzie nie występuje — usuń go z listy`);
  }
  assert.equal(WYJATKI.length, 1,
    `liczba wyjątków od reguły „tylko pismo łacińskie" wynosi ${WYJATKI.length} (oczekiwano 1)`);
  // Ratchet w dół: każdy wyjątek musi nadal pasować do treści (inaczej jest martwy).
  const trafienia = skanujNielacinskie();
  for (const w of WYJATKI) {
    const pasuje = trafienia.some((t) => t.plik === w.plik
      && (t.tekst.includes(w.fragment) || t.tekst.includes(w.fragment.replace(/`/g, ''))));
    assert.ok(pasuje, `wyjątek ${w.plik} („${w.fragment}") już nie pasuje — usuń go z listy`);
  }
});

test('E5/3: strażnik WIDZI skażenie (dowód działania detektora, nie tylko stanu repo)', () => {
  // Samo „repo czyste" nie dowodzi, że detektor działa (mógłby nic nie czytać).
  // Tworzymy plik z wklejoną cyrylicą/CJK i wymagamy wykrycia — mutacja progu
  // albo zakresów czerwieni ten test.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e5-skażenie-'));
  try {
    fs.writeFileSync(path.join(tmp, 'silnik.js'),
      '// Blokerzy, których czar faktycznie usuwa: nietapnięte stwory\n', 'utf8');
    assert.deepEqual(skanujNielacinskie(tmp), [], 'czysty plik nie daje trafień');

    fs.writeFileSync(path.join(tmp, 'skażony.js'),
      '// nietapnięte stwory przeciwnika (cyrylica: ы)\nconst a = 1;\n', 'utf8');
    const trafienia = skanujNielacinskie(tmp);
    assert.equal(trafienia.length, 1, `cyrylica w komentarzu musi być wykryta: ${JSON.stringify(trafienia)}`);
    assert.equal(trafienia[0].plik, 'skażony.js');
    assert.equal(trafienia[0].linia, 1, 'trafienie wskazuje numer linii');

    fs.writeFileSync(path.join(tmp, 'cjk.md'), '## Nagłówek 本地\n', 'utf8');
    assert.ok(skanujNielacinskie(tmp).some((t) => t.plik === 'cjk.md'),
      'CJK w dokumencie musi być wykryte');
    // Zależności nie są naszym tekstem — nie skanujemy ich.
    fs.mkdirSync(path.join(tmp, 'node_modules', 'pakiet'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'pakiet', 'idn.js'),
      'const domeny = ["xn--80ak6aa92e.com"]; // przykład IDN\n', 'utf8');
    assert.ok(!skanujNielacinskie(tmp).some((t) => t.plik.includes('node_modules')),
      'node_modules jest pomijane (to nie tekst repozytorium)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
