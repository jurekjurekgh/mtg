// Strażnik ISTNIENIA numerów CR (rekomendacja C3 audytu scalonego PR #135 —
// `docs/audits/AUDYT_PR135_2026-09-24b.md` §3/F-1 i §7).
//
// Po co: strażnicy `cr-numery-701-*` / `cr-numery-702-*` pokrywają TYLKO sekcje
// 701/702, a `cr-numery-mechanik-straznik` to pary „mechanika ↔ numer". Numer
// z innej sekcji (albo litera podreguły, która nie istnieje) nie był sprawdzany
// przez nic — audyt PR #135 znalazł tak 16 martwych numerów / 57 wystąpień,
// w tym `CR 103.7a` w 26 miejscach (poprawnie: 103.8a).
//
// Jak: cytat `CR <numer>` w `src/`, `test/`, `tools/` musi być na liście
// `test/helpers/cr-numery-tabela.js` — tabeli numerów ZWERYFIKOWANYCH wobec
// dosłownego tekstu CR 2026-09-25 (ADR 0030; sha256 w nagłówku tabeli).
// Nowy numer NIE jest błędem sam w sobie — to sygnał: sprawdź w BIEŻĄCYM
// wydaniu (L164: masowe przenumerowanie bywa o wydanie do tyłu) i uruchom
// `node tools/cr-numery.mjs --zapisz --cr <plik CR>`; ręczna edycja tabeli jest
// możliwa, ale musi mieć pokrycie w źródle.
//
// Wykrywanie/lista wyjątków żyją w `tools/cr-numery.mjs` (L41: jedno miejsce na
// regułę) — tu są tylko inwarianty i próby własne (L39: strażnik mierzy to, co
// deklaruje; fixtury detektora są poza skanem, więc nie zaśmiecają wyniku).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WYKLUCZONE,
  cytatyWKodzie,
  cytatyZTekstu,
  plikiKodu,
  wczytajTabele,
} from '../tools/cr-numery.mjs';

const tabela = await wczytajTabele();
const { wpisy, unikalne } = cytatyWKodzie();

test('CR-numery: każdy cytat CR w src/test/tools istnieje w zweryfikowanej tabeli', () => {
  assert.equal(tabela.brak, false,
    'brak tabeli test/helpers/cr-numery-tabela.js — wygeneruj: node tools/cr-numery.mjs --zapisz --cr <plik CR>');
  const brakujace = [...unikalne.keys()].filter((numer) => !tabela.numery.has(numer)).sort();
  assert.deepEqual(brakujace, [],
    'te numery nie są w tabeli numerów ZWERYFIKOWANYCH wobec dosłownego CR (ADR 0030).\n'
    + 'Sprawdź numer w BIEŻĄCYM wydaniu CR (L164 — lustro/parafraza bywa o wydanie do tyłu),\n'
    + 'napraw cytat albo uruchom: node tools/cr-numery.mjs --zapisz --cr <plik CR>\n'
    + brakujace.map((n) => `  CR ${n} — ${wpisy.filter((w) => w.numer === n).slice(0, 3).map((w) => `${w.plik}:${w.linia}`).join(', ')}`).join('\n'));
});

test('CR-numery: tabela jest wersjonowana (wydanie, data, sha256 źródła)', () => {
  assert.equal(tabela.brak, false, 'brak tabeli');
  assert.match(tabela.wydanie ?? '', /^\d{4}-\d{2}-\d{2}$/, 'wydanie CR w formacie ISO');
  assert.match(tabela.sha256 ?? '', /^[0-9a-f]{64}$/, 'sha256 pliku CR (dowód, na czym weryfikowano)');
  assert.match(tabela.pobrano ?? '', /^\d{4}-\d{2}-\d{2}$/, 'data pobrania pliku CR');
  assert.match(tabela.zrodlo ?? '', /cr-raw|MediaCompRules|wizards/i, 'skąd wzięto tekst CR (ADR 0030)');
});

test('CR-numery: rozmiar skanu i tabeli chroni przed pustym przejściem', () => {
  assert.ok(plikiKodu().length > 200, 'skan obejmuje src+test+tools (setki plików)');
  assert.ok(wpisy.length > 1000, 'w repo są tysiące cytatów CR');
  assert.ok(tabela.numery.size > 300, 'tabela obejmuje wszystkie cytowane numery (ponad 300)');
  // Kotwice treści: numer naprawiony w C1 (103.8a) i klasyk z sekcji 7xx.
  assert.ok(tabela.numery.has('103.8a'), 'tabela zna 103.8a (skok draw stepu — naprawa F-1)');
  assert.ok(tabela.numery.has('704.5c'), 'tabela zna 704.5c (przegrana na licznikach trucizny)');
  assert.ok(!tabela.numery.has('701.99'), 'fixture strażnika 701 nie może wejść do tabeli');
});

test('CR-numery: detektor cytatów działa (próba własna, L39)', () => {
  assert.deepEqual(cytatyZTekstu('// coś (CR 999.99) i CR 103.8a oraz CR 704.5c/d'),
    ['999.99', '103.8a', '704.5c']);
  assert.deepEqual(cytatyZTekstu('bez cytatu — 103.8a bez prefiksu'), []);
  // Wykluczenia są realne: tabela i ten plik nie mogą wejść do skanu cytatów.
  for (const plik of ['test/helpers/cr-numery-tabela.js', 'test/cr-numery-istnienie-straznik.test.js']) {
    assert.ok(WYKLUCZONE.has(plik), `${plik} musi być na liście wykluczeń skanu`);
  }
});
