// Strażnik par „numer ↔ pojęcie" dla deklaracji atakujących/blokerów
// (audyt PR #145, 2026-09-29, znalezisko F5).
//
// Po co: `cr-numery-istnienie-straznik` sprawdza, że numer ISTNIEJE w CR, a
// `cr-numery-mechanik-straznik` pilnuje par mechanika↔numer w sekcji 702.x.
// Nic nie pilnowało, że numer z sekcji 508/509 jest przypisany do WŁAŚCIEGO
// pojęcia — a zamiana literą obok jest niewidoczna dla obu strażników.
// Dokładnie tak było: „attacks each combat if able" (WYMÓG) cytowano jako
// 508.1c, a „can't attack alone" (RESTRYKCJĘ) jako 508.1d, w ~20 miejscach
// w `src/` i `test/`. Audyt PR #134 (§„Numery CR") tę zamianę POTWIERDZIŁ —
// czyli weryfikacja „z pamięci" utrwaliła błąd (ADR 0030: pamięć nie jest
// źródłem). Naprawione 2026-09-29; ten test pilnuje, żeby nie wróciła.
//
// Dosłowny tekst CR (ADR 0030; dostęp 2026-09-29, trzy niezależne lustra
// CR — mtg.fandom.com/wiki/Declare_attackers_step, magicarena.fandom.com/wiki/
// Attacking, mtg.fandom.com/wiki/Requirement — wszystkie zgodne):
//
//   508.1c „The active player checks each creature they control to see whether
//          it's affected by any restrictions (effects that say a creature can't
//          attack, or that it can't attack unless some condition is met). If any
//          restrictions are being disobeyed, the declaration of attackers is
//          illegal. Example: A player controls two creatures, each with a
//          restriction that states '[This creature] can't attack alone.' It's
//          legal to declare both as attackers."
//   508.1d „The active player checks each creature they control to see whether
//          it's affected by any requirements (effects that say a creature
//          attacks if able, or that it attacks if some condition is met). If the
//          number of requirements that are being obeyed is fewer than the
//          maximum possible number of requirements that could be obeyed without
//          disobeying any restrictions, the declaration of attackers is
//          illegal."
//   509.1b „The defending player checks each creature they control to see
//          whether it's affected by any restrictions (effects that say a
//          creature can't block, or that it can't block unless some condition
//          is met). If any restrictions are being disobeyed, the declaration
//          of blockers is illegal." (+ zdanie o evasion abilities)
//   509.1c „The defending player checks each creature they control to see
//          whether it's affected by any requirements (effects that say a
//          creature must block, or that it must block if some condition is
//          met). If the number of requirements that are being obeyed is fewer
//          than the maximum possible number of requirements that could be
//          obeyed without disobeying any restrictions, the declaration of
//          blockers is illegal."
//          (dostęp 2026-09-29: mtg.fandom.com/wiki/Declare_blockers_step,
//          cytat CR z wydania November 14, 2025 — Teenage Mutant Ninja
//          Turtles; glossary: „Requirement: ... See rules 508.1d and 509.1c")
//
// Czyli: 508.1c/509.1b = restrykcje („can't"), 508.1d/509.1c = wymogi („if
// able"). Zamiana w jedną stronę jest tak samo błędna jak w drugą.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import path from 'node:path';
import { WYKLUCZONE, cytatyZTekstu, plikiKodu } from '../tools/cr-numery.mjs';

/** Linie kodu cytujące którykolwiek z podanych numerów (z tekstem linii). */
function linieZCytatami(numery) {
  const szukane = new Set(numery);
  const out = [];
  for (const plik of plikiKodu()) {
    const rel = path.relative(process.cwd(), plik).split(path.sep).join('/');
    // Fixtury detektorów (w tym ten plik) cytują numery CELOWO — lista
    // wyłączeń jest jedna dla wszystkich strażników CR (L41).
    if (WYKLUCZONE.has(rel)) continue;
    fs.readFileSync(plik, 'utf8').split('\n').forEach((linia, i) => {
      const trafione = cytatyZTekstu(linia).filter((n) => szukane.has(n));
      if (trafione.length) out.push({ rel, nr: i + 1, linia, trafione });
    });
  }
  return out;
}

// Linie cytujące OBA numery naraz (np. „CR 508.1c/508.1d" przy opisie
// interakcji restrykcji z wymogiem) są celowo pomijane: nie przypisują
// pojęcia do jednego numeru.
const wieloznaczne = (wpis) => wpis.trafione.includes('508.1c') && wpis.trafione.includes('508.1d');

const WYMÓG = /attacks (each combat )?if able|wymóg ataku|wymuszeni atakujący|mustAttack/i;
const RESTRYKCJA = /attack alone|nie może atakować sam|restrykcj/i;

// Audyt PR #146 (zn. F2): plik deklarował w nagłówku parę 508.1c/509.1b
// (restrykcje) i 508.1d/509.1c (wymogi), ale skanował WYŁĄCZNIE 508.1c/508.1d
// — w `src/` jest 16 cytatów sekcji 509, więc zamiana literą obok przeszłaby
// zielono (L5/L39: przegląd bez strażnika jest ważny przez jeden commit).
// Kierunek potwierdzony u źródła (patrz cytat 509.1b/509.1c wyżej).
const WYMÓG_BLOK = /wymóg|wymog|requirement|must block|blocks if able/i;
const RESTRYKCJA_BLOK = /can'?t block|can'?t be blocked|nie może blokować|nieblokowaln|ewazj|evasion|attack\/block alone|attack or block alone/i;

test('CR-numery 508/509: wymóg („attacks if able") to 508.1d, nie 508.1c', () => {
  const zle = linieZCytatami(['508.1c', '508.1d'])
    .filter((w) => !wieloznaczne(w))
    .filter((w) => WYMÓG.test(w.linia) && w.trafione.includes('508.1c'));
  assert.deepEqual(zle.map((w) => `${w.rel}:${w.nr}`), [],
    '„attacks if able" to WYMÓG (CR 508.1d); 508.1c to restrykcje „can\'t attack"');
});

test('CR-numery 508/509: restrykcja („can\'t attack alone") to 508.1c, nie 508.1d', () => {
  const zle = linieZCytatami(['508.1c', '508.1d'])
    .filter((w) => !wieloznaczne(w))
    .filter((w) => RESTRYKCJA.test(w.linia) && w.trafione.includes('508.1d'));
  assert.deepEqual(zle.map((w) => `${w.rel}:${w.nr}`), [],
    '„can\'t attack alone" to RESTRYKCJA (CR 508.1c, tam jest przykład CR)');
});

test('CR-numery 509: wymóg blokowania („must block") to 509.1c, nie 509.1b', () => {
  const zle = linieZCytatami(['509.1b', '509.1c'])
    .filter((w) => w.trafione.includes('509.1b') && !w.trafione.includes('509.1c'))
    .filter((w) => WYMÓG_BLOK.test(w.linia) && !RESTRYKCJA_BLOK.test(w.linia));
  assert.deepEqual(zle.map((w) => `${w.rel}:${w.nr}`), [],
    '„must block"/„wymóg blokowania" to WYMÓG (CR 509.1c); 509.1b to restrykcje „can\'t block"');
});

test('CR-numery 509: restrykcja blokowania („can\'t block") to 509.1b, nie 509.1c', () => {
  const zle = linieZCytatami(['509.1b', '509.1c'])
    .filter((w) => w.trafione.includes('509.1c') && !w.trafione.includes('509.1b'))
    .filter((w) => RESTRYKCJA_BLOK.test(w.linia) && !WYMÓG_BLOK.test(w.linia));
  assert.deepEqual(zle.map((w) => `${w.rel}:${w.nr}`), [],
    '„can\'t block"/ewazja to RESTRYKCJA (CR 509.1b), nie wymóg 509.1c');
});

test('CR-numery 508/509: strażnik nie przechodzi pusto (kotwice treści)', () => {
  // L29: bez kotwic skan „przechodzi" też wtedy, gdy numery znikną z kodu.
  const wszystkie = linieZCytatami(['508.1c', '508.1d']);
  const wymogi = wszystkie.filter((w) => w.trafione.includes('508.1d') && WYMÓG.test(w.linia));
  const restrykcje = wszystkie.filter((w) => w.trafione.includes('508.1c') && RESTRYKCJA.test(w.linia));
  assert.ok(wymogi.length >= 3, `cytaty 508.1d przy wymogu ataku: ${wymogi.length}`);
  assert.ok(restrykcje.length >= 2, `cytaty 508.1c przy restrykcji: ${restrykcje.length}`);
  const blok509 = linieZCytatami(['509.1b', '509.1c']);
  const bRestr = blok509.filter((w) => w.trafione.includes('509.1b') && RESTRYKCJA_BLOK.test(w.linia));
  const bWymog = blok509.filter((w) => w.trafione.includes('509.1c') && WYMÓG_BLOK.test(w.linia));
  assert.ok(bRestr.length >= 3, `cytaty 509.1b przy restrykcji blokowania: ${bRestr.length}`);
  assert.ok(bWymog.length >= 2, `cytaty 509.1c przy wymogu blokowania: ${bWymog.length}`);
});

test('CR-numery 508/509: dowód RED — detektor widzi zamianę w obie strony', () => {
  // Próba własna (L39): reguły wyżej muszą łapać dokładnie te dwa zdania.
  const fixture = [
    { rel: 'fixture', nr: 1, trafione: ['508.1c'], linia: '// „attacks each combat if able" (CR 508.1c) — wymóg ataku' },
    { rel: 'fixture', nr: 2, trafione: ['508.1d'], linia: '// „can\'t attack alone" (CR 508.1d) — jedyny zdolny do ataku' },
    { rel: 'fixture', nr: 3, trafione: ['509.1b'], linia: '// „must block if able" — wymóg blokowania (CR 509.1b)' },
    { rel: 'fixture', nr: 4, trafione: ['509.1c'], linia: '// „can\'t be blocked by [podtyp]" (CR 509.1c)' },
  ];
  assert.ok(fixture.filter((w) => WYMÓG.test(w.linia) && w.trafione.includes('508.1c')).length === 1,
    'detektor wymogu łapie 508.1c przy „attacks if able"');
  assert.ok(fixture.filter((w) => RESTRYKCJA.test(w.linia) && w.trafione.includes('508.1d')).length === 1,
    'detektor restrykcji łapie 508.1d przy „attack alone"');
  assert.ok(fixture.filter((w) => w.trafione.includes('509.1b')
    && WYMÓG_BLOK.test(w.linia) && !RESTRYKCJA_BLOK.test(w.linia)).length === 1,
    'detektor wymogu blokowania łapie 509.1b przy „must block"');
  assert.ok(fixture.filter((w) => w.trafione.includes('509.1c')
    && RESTRYKCJA_BLOK.test(w.linia) && !WYMÓG_BLOK.test(w.linia)).length === 1,
    'detektor restrykcji blokowania łapie 509.1c przy „can\'t be blocked"');
});
