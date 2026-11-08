// Strażnik cytowań CR — sekcje 70x/73x po bumpie pinu do wydania 2026-11-06
// (audyt PR #181, sesja 2026-11-08).
//
// CO ZNALEZIONO: bump pinu CR (commit 0acbc43, PR #181) porównał TEKSTY 555
// cytowanych numerów i przenumerował ~112 miejsc, ale warstwa komentarzy
// o dniu/nocy została w starej numeracji — a strażnik ISTNIENIA numerów
// (test/cr-numery-istnienie-straznik.test.js) tego nie widzi, bo 730.2
// i 731.2 w nowym wydaniu ISTNIEJĄ, tylko znaczą co innego (L164).
//
// DOSŁOWNY TEKST CR, wydanie „effective as of November 6, 2026”
// (mirror nwgarne/mtg-data, rules/cr-raw.txt, sha256 d7cdcc11…):
// - 730. Subgames / 731. Merging with Permanents — silnik nie implementuje
//   ani subgier (730.1: „One card (Shahrazad) allows players to play a Magic
//   subgame”), ani merge (731.1: „One keyword causes an object to merge with
//   a permanent. See rule 702.140, ‘Mutate.’”). Żadne cytowanie tych sekcji
//   nie ma prawa występować w `src/`.
// - 732. Day and Night: 732.1 („Day and night are designations that the game
//   itself can have…”), 732.2 („As the second part of the untap step, the game
//   checks the previous turn to see if the game’s day/night designation should
//   change”), 732.2a (dzień + 0 czarów → noc), 732.2b (noc + ≥2 czary → dzień),
//   732.2c („If it’s neither day nor night, this check doesn’t happen”).
// - 502.2 = ta sama akcja stanowa w untapie; 702.145 = keyword daybound/
//   nightbound (702.145b: „If it is night … it enters transformed”).
// - 708.9 = ujawnianie ZAKRYTYCH obiektów przy zmianie strefy (nie dzień/noc).
//
// KLASA BŁĘDU (L164 + L191): numer istnieje w bieżącym wydaniu, więc test
// istnienia przechodzi, a komentarz uczy następnego agenta złej reguły.
// Strażnik mierzy więc NIEZMIENNIK znaczenia (kierunek odwrócony), nie listę
// znanych literówek: „każde cytowanie 732.x stoi przy słownictwie dnia/nocy”
// i „żadne cytowanie 730/731/708.9 nie stoi przy słownictwie dnia/nocy”.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KATALOG = 'src';

/** Pliki źródłowe silnika/stołu (rekurencyjnie, tylko `.js`). */
function plikiZrodlowe(katalog = KATALOG) {
  const out = [];
  for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) out.push(...plikiZrodlowe(sciezka));
    else if (wpis.name.endsWith('.js')) out.push(sciezka);
  }
  return out.sort();
}

const CYTAT = /\b(\d{3})\.(\d+)([a-z]{0,2})\b/g;
const SLOWNICTWO_DN = /(dayNight|daybound|nightbound|Dzień\/Noc|Day\/Night|dzień\/noc|dzien\/noc|dzie[nń]|noc[y]?\b)/i;

/** Cytaty CR (grupy: sekcja, podpunkt, litera) z danego fragmentu tekstu. */
export function cytatyCr(tekst) {
  return [...tekst.matchAll(CYTAT)].map((m) => ({ numer: `${m[1]}.${m[2]}${m[3]}`, sekcja: m[1] }));
}

/**
 * Strażnik znaczenia: zwraca listę naruszeń dla JEDNEGO pliku.
 * `okno` = liczba linii kontekstu (L165: cytat bywa o linię obok słowa).
 */
export function naruszeniaCytowan(tekst, { okno = 4 } = {}) {
  const linie = tekst.split('\n');
  const naruszenia = [];
  for (let i = 0; i < linie.length; i += 1) {
    const cytaty = cytatyCr(linie[i]);
    if (cytaty.length === 0) continue;
    const kontekst = linie.slice(Math.max(0, i - okno), i + okno + 1).join('\n');
    const oDniuNocy = SLOWNICTWO_DN.test(kontekst);
    for (const cytat of cytaty) {
      // (1) Silnik nie zna subgier (730) ani merge'a (731) — każdy cytat to
      //     ślad starej numeracji dnia/nocy albo martwy numer.
      if (cytat.sekcja === '730' || cytat.sekcja === '731') {
        naruszenia.push(`linia ${i + 1}: cytat ${cytat.numer} — sekcja ${cytat.sekcja} `
          + '(CR 2026-11-06: 730 = Subgames, 731 = Merging); dzień/noc to 732');
      }
      // (2) 708.9 = ujawnianie zakrytych obiektów przy zmianie strefy.
      if (cytat.numer === '708.9' && oDniuNocy) {
        naruszenia.push(`linia ${i + 1}: 708.9 przy słownictwie dnia/nocy — `
          + 'CR 708.9 dotyczy zakrytych obiektów, dzień/noc to 732.1/732.2');
      }
    }
    // (3) Numer dnia/nocy musi być w oknie przy słownictwie dnia/nocy —
    //     sprawdzane po stronie cytatu (testy niżej), nie po stronie dowolnego
    //     numeru w oknie: w komentarzu o untapie stoi obok siebie 503.1
    //     i wzmianka o nocy, a to nie jest twierdzenie o dniu/nocy.
  }
  return naruszenia;
}

/** Wbudowany dowód działania detektora (mutacja klasy L164 bez zmiany kodu). */
test('CR/73x: detektor czerwienieje na kształcie błędu z audytu PR #181', () => {
  const stare = '  // M68 (daybound/nightbound, CR 708.9 / 502.2 / 730.2): globalny znacznik\n';
  assert.ok(naruszeniaCytowan(stare).length >= 2, 'stara numeracja dnia/nocy = naruszenie');
  const nowe = '  // M68 (daybound/nightbound, CR 732.1 + 502.2): globalny znacznik\n';
  assert.deepEqual(naruszeniaCytowan(nowe), [], 'poprawna numeracja = cisza');
  // Numer istniejący, ale znaczący co innego (L164) — 731.2 to merge.
  assert.ok(naruszeniaCytowan('  // CR 731.2b: poprzedni aktywny\n').length >= 1);
});

test('CR/73x: żaden plik src/ nie cytuje sekcji 730 (Subgames) ani 731 (Merging)', () => {
  const zle = [];
  for (const plik of plikiZrodlowe()) {
    for (const n of naruszeniaCytowan(readFileSync(plik, 'utf8'))) zle.push(`${plik}: ${n}`);
  }
  assert.deepEqual(zle, [], `cytowania starej numeracji dnia/nocy:\n${zle.join('\n')}`);
});

test('CR/73x: dzień/noc cytuje 732.x (a nie 708.9) we wszystkich warstwach', () => {
  // Warstwy, w których audyt #181 znalazł starą numerację — pin obecności
  // poprawki (L26: „brak danych = pomijam” nie może ukryć braku cytatu).
  const pliki = ['src/engine/game-state.js', 'src/engine/triggers.js', 'src/cards/card-data.js',
    'src/engine/spells.js', 'src/table/render.js'];
  const tekst = pliki.map((p) => readFileSync(p, 'utf8')).join('\n');
  assert.match(tekst, /CR 732\.1/, 'definicja dnia/nocy (732.1) jest cytowana');
  assert.match(tekst, /732\.2[abc]/, 'zmiana oznaczenia w untapie (732.2a/b/c) jest cytowana');
  assert.ok(!/CR 708\.9[^\n]*dzie[nń]/i.test(tekst), '708.9 nie opisuje dnia/nocy');
});

test('CR/715: Saga dostaje licznik lore w precombat main (715.3c), nie „po kroku dobierania”', () => {
  const tekst = readFileSync('src/engine/triggers.js', 'utf8');
  assert.match(tekst, /715\.3c/, 'cytat akcji stanowej „precombat main begins” (CR 715.3c)');
  // Stare brzmienie żyje w Oracle text drukowanych Sag (ADR 0010 §2 — tekst
  // dosłowny), ale NIE może wracać jako UZASADNIENIE reguły obok 715.3b.
  const uzasadnienie = /715\.3b[^\n]{0,120}draw step/i;
  assert.ok(!uzasadnienie.test(tekst),
    'licznik lore Sag to 715.3c (precombat main), nie 715.3b + „after your draw step”');
});

test('CR/732.2c: cytat stoi przy sprawdzeniu w untapie, nie przy wejściu (F-1 audytu #182)', () => {
  const tekst = readFileSync('src/engine/triggers.js', 'utf8');
  // Prawdziwy dom 732.2c („If it's neither day nor night, this check
  // doesn't happen"): wczesny powrót w applyDayNightAtTurnStart.
  const start = tekst.indexOf('export function applyDayNightAtTurnStart');
  assert.ok(start >= 0, 'applyDayNightAtTurnStart istnieje');
  const cialo = tekst.slice(start, tekst.indexOf('\n}\n', start) + 3);
  assert.ok(cialo.includes('732.2c'), '732.2c cytowane w applyDayNightAtTurnStart');
  // Blok ETB (designation=null) implementuje 702.145d/g (wejście ustawia
  // dzień ALBO noc), nie regułę sprawdzenia w untapie.
  const etb = tekst.indexOf('state.dayNight === null');
  assert.ok(etb >= 0, 'blok ETB designation=null istnieje');
  const okno = tekst.slice(Math.max(0, etb - 600), etb + 600);
  assert.ok(!okno.includes('732.2c'), 'blok ETB nie cytuje 732.2c (to reguła untapu)');
  assert.ok(okno.includes('702.145d') && okno.includes('702.145g'),
    'blok ETB cytuje 702.145d (dzień) i 702.145g (noc)');
});
