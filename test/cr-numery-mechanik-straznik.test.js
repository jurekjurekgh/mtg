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
// Audyt PR #135 (2026-09-24) dopisał dwie rzeczy:
//   1. Wydanie CR, z którego pochodzą numery: pary poniżej weryfikowane wobec
//      CR efektywnego 2026-08-07, a następnie przeliczone na CR 2026-09-25
//      (Reality Fracture) — dosłowny spis sekcji 702 z mtg.wiki/page/Keyword_ability.
//      L164: lustro `ancestral.vision` BYWA o wydanie do tyłu (sekcja 712 DFC:
//      tam 712.4a = cechy twarzy, w CR 2026-09-25 meld wchłonął 712.4/712.5,
//      a cechy twarzy to 712.8/712.8a) — przed masowym przenumerowaniem trzeba
//      potwierdzić numer w BIEŻĄCYM wydaniu, nie w pierwszym znalezionym lustrze.
//   2. Detektor OKNA: pary poniżej są liniowe (mechanika i numer na jednej
//      linii), więc nie łapią cytatu o linię obok nazwy mechaniki. Tym
//      przypadkiem zajmuje się `test/cr-numery-702-tabela-straznik.test.js`
//      (każdy cytat 702.<n> musi mieć nazwę mechaniki 702.<n> w oknie ±8 linii).
//      L41: mechanizmy się nie dublują — tu historia par i numery spoza 702.x,
//      tam tabela bieżącego wydania.
//
// Zakres: `src/**/*.js` i `test/**/*.js` — pliki źródłowe, nie dokumenty
// (dokumenty historyczne, np. `docs/PROJECT_HISTORY.md` i stare plany,
// cytują numery z epoki i zostają bez zmian).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pliki, które CELOWO cytują numery błędne i przestarzałe, żeby je opisać
 * (historia rozjazdów, tabela mapowania, dowody RED). Bez wyłączenia pary
 * poniżej świeciłyby na własną dokumentację — audyt PR #135 dodał dwa takie
 * pliki i oba muszą być na tej liście.
 */
const PLIKI_STRAGNIKOW = new Set([
  'test/cr-numery-mechanik-straznik.test.js',
  'test/cr-numery-702-tabela-straznik.test.js',
  'test/audyt-pr134-2026-09-24-cytaty-cr.test.js',
]);

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
  // Dwie pary dodane przez audyt PR #116 (2026-09-14, znaleziska P4 i P6):
  // 1) „timing ignorowany" madnessu NIE jest w 702.35b — 702.35b to płatność
  //    kosztu alternatywnego (601.2b, 601.2f–h). Rzut w rozstrzyganiu zdolności
  //    to 702.35a; ignorowanie timingu potwierdza ruling DMU 2023-01-06
  //    (mtg.wiki/page/Madness): „Casting a spell with madness ignores the
  //    timing rules based on the card's type."
  // 2) „Warunek liczony przy każdym odczycie" NIE jest w 604.3 — 604.3 definiuje
  //    characteristic-defining abilities (604.3a(5) wyklucza zdolności
  //    warunkowe). Właściwy przepis to 611.3a (mtg.wiki/page/Continuous_effect):
  //    „A continuous effect generated by a static ability isn't „locked in";
  //    it applies at any given moment to whatever its text indicates."
  //    Wyjątek: DOSŁOWNY cytat CR 702.73a (changeling) zawiera „See rule 604.3."
  //    i jest poprawny — wzorzec poniżej łapie tylko parę „przeliczane + 604.3".
  { mechanika: /madness/i, zakazany: /702\.35b/, poprawny: '702.35a',
    zrodlo: '702.35a: rzut w rozstrzyganiu zdolności; 702.35b to koszt alternatywny (601.2b/f-h); timing: ruling DMU 2023-01-06' },
  { mechanika: /przelicza(ne|ny)|liczony przy (każdym )?odczycie/, zakazany: /604\.3/, poprawny: '611.3a',
    zrodlo: '604.3 to CDA (604.3a(5) wyklucza warunkowe); 611.3a: „isn\'t locked in"' },
  // Pary dodane przez audyt PR #134 → PR #135 (2026-09-24, F-3/F-6/F-7).
  // Numery z CR 2026-09-25 (Reality Fracture), spis 702.x z mtg.wiki/page/Keyword_ability.
  { mechanika: /surge/i, zakazany: /702\.111(?![0-9])/, poprawny: '702.117',
    wyklucz: /menace/i, zrodlo: '702.111 to Menace, 702.117 to Surge (F-3)' },
  { mechanika: /finality/i, zakazany: /122\.1e(?![0-9a-z])/, poprawny: '122.1h',
    wyklucz: /loyalty/i, zrodlo: '122.1e to loyalty counters, 122.1h to finality (F-3)' },
  { mechanika: /cloak|zasłon/i, zakazany: /701\.56/, poprawny: '701.58',
    zrodlo: '701.58a–h Cloak w CR 2025-11-14, 2026-08-07 i 2026-09-25 (F-3)' },
  { mechanika: /vigilance|czujno/i, zakazany: /702\.21(?![0-9])/, poprawny: '702.20',
    wyklucz: /ward/i, zrodlo: '702.20 Vigilance, 702.21 Ward (F-7a)' },
  { mechanika: /flashback/i, zakazany: /702\.33/, poprawny: '702.34',
    wyklucz: /kicker/i, zrodlo: '702.33 Kicker, 702.34 Flashback (F-7d)' },
  { mechanika: /plot/i, zakazany: /702\.168/, poprawny: '702.170',
    wyklucz: /disguise/i, zrodlo: '702.168 Disguise, 702.170 Plot (F-7b)' },
  { mechanika: /endure/i, zakazany: /702\.174/, poprawny: '701.63 (keyword action)',
    zrodlo: '701.63a Endure (mtg.wiki/page/Endure, CR 2026-09-25); 702.174 to Gift (F-7c)' },
  { mechanika: /infect/i, zakazany: /702\.89/, poprawny: '702.90',
    wyklucz: /umbra/i, zrodlo: '702.89 Umbra Armor, 702.90 Infect (F-7f)' },
  { mechanika: /outlast/i, zakazany: /702\.100/, poprawny: '702.107',
    wyklucz: /evolve/i, zrodlo: '702.100 Evolve, 702.107 Outlast (F-6)' },
  { mechanika: /equipment|sprzęt/i, zakazany: /702\.16(?![0-9])/, poprawny: '702.6a / 704.5n',
    wyklucz: /protection|ochron|chronion/i,
    zrodlo: '702.6a equip celuje w stwora, 704.5n odłącza sprzęt; 702.16 to Protection (F-7g)' },
  // Karty dwustronne: sekcja 711 z wydań ≤2025 i 712.4x ze starszego lustra CR
  // nie opisują już DFC. W CR 2026-09-25: 712.6 obie strony widoczne,
  // 712.7 ukryte strefy, 712.8/8a cechy twarzy (poza polem bitwy tylko przód),
  // 712.8e MV permanentu z tyłem = koszt przodu, 712.9 transform nie-DFC = nic,
  // 712.11 rzut przodem na stos, 712.13 rozstrzygnięty czar wchodzi tą samą
  // twarzą, 712.14 wejście z innej strefy niż stos przodem, 712.18 transform
  // nie tworzy nowego obiektu. Meld to 712.4/712.5 (wykluczony: brak kart meld).
  { mechanika: /dwustronn|DFC|dwie twarze|twarz|transform/i,
    zakazany: /711\.\d|712\.4(?![0-9])/, poprawny: '712.8/712.8a/712.8e/712.9/712.11/712.13/712.14/712.18',
    wyklucz: /meld/i, zrodlo: 'CR 2026-09-25, mtg.wiki/page/Double-faced_card §Rules (F-3, fala 2)' },
];

/** Rekurencyjna lista plików `.js` w katalogu (bez node_modules). */
function plikiJs(katalog) {
  const out = [];
  for (const wejscie of fs.readdirSync(katalog, { withFileTypes: true })) {
    if (wejscie.name === 'node_modules') continue;
    const pelna = path.join(katalog, wejscie.name);
    if (wejscie.isDirectory()) out.push(...plikiJs(pelna));
    else if (wejscie.name.endsWith('.js') && !PLIKI_STRAGNIKOW.has(pelna)) out.push(pelna);
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
