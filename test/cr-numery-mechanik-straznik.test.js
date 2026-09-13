// Strażnik numerów CR przy mechanikach (rekomendacja horyzontalna
// AUDYT_PR114 §6: „jeden przebieg »sweep numerów CR« po komentarzach —
// D1/D3 to drugi i trzeci taki przypadek w dwóch audytach").
//
// Źródło numeracji (ADR 0030 — pamięć nie jest źródłem): CR efektywny
// 2026-08-07, TXT pobrany z media.wizards.com 2026-09-13 w sesji PR #116
// (`MagicCompRules 20260819.txt`, link z magic.wizards.com/en/rules).
// Zweryfikowane cytaty:
//   702.2b „A creature with toughness greater than 0 that's been dealt
//          damage by a source with deathtouch ... is destroyed as a
//          state-based action." (deathtouch)
//   702.4  „Double Strike" — NIE deathtouch (i nie first strike)
//   702.7  „First Strike"
//   702.14 „Landwalk"
//   702.29 „Cycling"   |  702.30 „Echo"
//   702.34 „Flashback" |  702.35 „Madness"
//   702.77 „Reinforce"
//   702.122 „Crew"     |  702.123 „Fabricate"
//   207.2c „An ability word ... no special rules meaning and no individual
//          entries in the Comprehensive Rules. The ability words are ...
//          delirium ..." (delirium to słowo zdolności, nie mechanika 702.x)
//
// Sesja PR #116 znalazła w komentarzach 60+ rozjazdów tej samej klasy
// (deathtouch cytowany jako 702.4, landwalk jako 702.33, echo jako 702.29,
// madness jako 702.34, fabricate jako 702.122, reinforce jako 702.29a,
// delirium jako 702.34, crew jako 701.36 w dokumentach). Wszystkie
// naprawione; ten test pilnuje, żeby nie wróciły.
//
// Zakres: `src/**/*.js` i `test/**/*.js` — pliki źródłowe, nie dokumenty
// (dokumenty historyczne, np. `docs/PROJECT_HISTORY.md` i stare plany,
// cytują numery z epoki i zostają bez zmian).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Ten plik cytuje błędne pary, żeby je opisać — nie skanujemy go. */
const PLIK_STRAGNIKA = 'test/cr-numery-mechanik-straznik.test.js';

/**
 * Tabela-par: mechanika (wzorzec na linii) + numer, którego NIE wolno
 * z nią cytować + poprawny numer + skąd wiadomo.
 */
const PARY = [
  { mechanika: /deathtouch/i, zakazany: /702\.4(?!\d)/, poprawny: '702.2b',
    zrodlo: '702.2 Deathtouch; 702.4 to Double Strike' },
  { mechanika: /first strike/i, zakazany: /702\.4(?!\d)/, poprawny: '702.7',
    wyklucz: /double strike/i,
    zrodlo: '702.7 First Strike; 702.4 to Double Strike' },
  { mechanika: /echo/i, zakazany: /702\.29/, poprawny: '702.30',
    zrodlo: '702.29 to Cycling, 702.30 to Echo' },
  { mechanika: /madness/i, zakazany: /702\.34/, poprawny: '702.35',
    zrodlo: '702.34 to Flashback, 702.35 to Madness' },
  { mechanika: /(land|swamp|forest|island|plain|mountain)walk/i, zakazany: /702\.33(?![0-9a-z])/,
    poprawny: '702.14', zrodlo: '702.14 Landwalk; 702.33 to Kicker' },
  { mechanika: /fabricate/i, zakazany: /702\.12[12]/, poprawny: '702.123',
    zrodlo: '702.122 to Crew, 702.123 to Fabricate' },
  { mechanika: /reinforce/i, zakazany: /702\.29/, poprawny: '702.77',
    zrodlo: '702.29 to Cycling, 702.77 to Reinforce' },
  { mechanika: /delirium/i, zakazany: /702\.34/, poprawny: '207.2c (słowo zdolności)',
    zrodlo: '207.2c — ability word, brak indywidualnej reguły' },
  { mechanika: /flashback/i, zakazany: /702\.34b/, poprawny: '702.34a',
    zrodlo: '702.34a — jedyna podreguła Flashback (wygnanie po rzucie)' },
];

/** Rekurencyjna lista plików `.js` w katalogu (bez node_modules). */
function plikiJs(katalog) {
  const out = [];
  for (const wejscie of fs.readdirSync(katalog, { withFileTypes: true })) {
    if (wejscie.name === 'node_modules') continue;
    const pelna = path.join(katalog, wejscie.name);
    if (wejscie.isDirectory()) out.push(...plikiJs(pelna));
    else if (wejscie.name.endsWith('.js') && pelna !== PLIK_STRAGNIKA) out.push(pelna);
  }
  return out.sort();
}

const PLIKI = [...plikiJs('src'), ...plikiJs('test')];

/** Wiersze, w których współwystępują mechanika i zakazany numer. */
function wspolwystapienia(pary) {
  const trafienia = [];
  for (const plik of PLIKI) {
    const linie = fs.readFileSync(plik, 'utf8').split('\n');
    linie.forEach((linia, indeks) => {
      if (!pary.mechanika.test(linia)) return;
      if (pary.wyklucz && pary.wyklucz.test(linia)) return;
      if (pary.zakazany.test(linia)) {
        trafienia.push(`${plik}:${indeks + 1} — ${linia.trim()}`);
      }
    });
  }
  return trafienia;
}

for (const para of PARY) {
  test(`CR-numery: „${para.mechanika.source}" nie cytuje ${para.zakazany.source} (ma być ${para.poprawny})`, () => {
    const trafienia = wspolwystapienia(para);
    assert.deepEqual(trafienia, [],
      `poprawny numer: ${para.poprawny} (${para.zrodlo})\n` + trafienia.join('\n'));
  });
}

test('CR-numery: src/ nie zawiera starego numeru crew 701.36', () => {
  const trafienia = [];
  for (const plik of plikiJs('src')) {
    fs.readFileSync(plik, 'utf8').split('\n').forEach((linia, indeks) => {
      if (/701\.36/.test(linia)) trafienia.push(`${plik}:${indeks + 1} — ${linia.trim()}`);
    });
  }
  assert.deepEqual(trafienia, [],
    'crew to 702.122 (701.36 obowiązywał przed przenumerowaniem):\n' + trafienia.join('\n'));
});

test('CR-numery: strażnik faktycznie skanuje oba drzewa (kontrola własna)', () => {
  // Gdyby ścieżki przestały istnieć / pliki zniknęły, powyższe testy
  // przechodziłyby pusto. Ten test pinuje rozmiar skanu.
  assert.ok(plikiJs('src').length > 50, 'src/ ma pliki .js');
  assert.ok(plikiJs('test').length > 100, 'test/ ma pliki .js');
});
