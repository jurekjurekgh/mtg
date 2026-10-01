// U2 z audytu PR #146 (kolejka otwarta) — konwencja `keywords` bez strażnika.
//
// Problem: katalog może zadeklarować keyword, którego NIKT nie czyta i nikt nie
// sklasyfikował. Dwa realne przebrania tej klasy:
//   1) LITERÓWKA („flyng” zamiast „flying”) — karta zachowuje się jak bez
//      keywordu, a walidacja rejestru (mały snake_case) przepuszcza ją zielono;
//   2) MECHANIKA, KTÓREJ NIE MA — keyword deklarowany, ale ani silnik, ani
//      deskryptor zdolności go nie realizuje (karta „supported”, choć działa
//      połowicznie — ADR 0022).
// Odwrotność też boli: sklasyfikowanie keywordu jako etykiety, gdy mechanika
// faktycznie żyje w zdolnościach/polu, gubi wiedzę o tym, gdzie jej szukać (L5).
//
// Ten strażnik wymaga, żeby KAŻDY keyword katalogu był w JEDNEJ z dwóch klas:
//   `CZYTA_SILNIK` — wskazany plik MUSI zawierać literal keywordu (dowód
//     czytania, nie deklaracja dobrej woli);
//   `ETYKIETA` — keyword jest etykietą dla mechaniki żyjącej gdzie indziej;
//     wpis MUSI wskazać gdzie (`abilities` / `pole` / `colors_puste`),
//     a strażnik weryfikuje to strukturalnie na kartach.
//
// Mutacje, które ten plik łapie: nowy keyword bez klasy (U2/1), usunięcie
// keywordu z katalogu przy zostawieniu wpisu (U2/2), przeniesienie czytania do
// innego pliku (U2/3), karta z etykietą bez zdolności/pola (U2/4, U2/5),
// „devoid” na karcie z kolorami (U2/6).

import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

/** keyword → karty, które go deklarują (z katalogu). */
const W_KATALOGU = new Map();
for (const def of REGISTRY.all()) {
  for (const kw of def.keywords ?? []) {
    if (!W_KATALOGU.has(kw)) W_KATALOGU.set(kw, []);
    W_KATALOGU.get(kw).push(def);
  }
}

/**
 * Keywordy czytane przez kod — wartość to plik, w którym literal keywordu
 * MUSI wystąpić (dowód). Jeden reprezentant wystarcza; plik dobrano tak, by
 * był MIEJSCEM REGUŁY, nie listą pól (inaczej „czytanie” byłoby pozorne —
 * np. `toxic` trafia w listę pól obiektu i nie jest tam mechaniką).
 */
const CZYTA_SILNIK = Object.freeze({
  changeling: 'src/engine/permanents.js',
  daybound: 'src/engine/effects.js',
  deathtouch: 'src/engine/combat.js',
  defender: 'src/engine/combat.js',
  double_strike: 'src/engine/combat.js',
  echo: 'src/engine/triggers.js', // syntetyczna zdolność echo budowana z pola `echo` (CR 702.30)
  first_strike: 'src/engine/combat.js',
  flash: 'src/engine/game-state.js',
  flying: 'src/engine/combat.js',
  haste: 'src/engine/abilities.js',
  infect: 'src/engine/combat.js',
  lifelink: 'src/engine/combat.js',
  menace: 'src/engine/combat.js',
  morph: 'src/engine/abilities.js',
  nightbound: 'src/engine/effects.js',
  reach: 'src/engine/combat.js',
  trample: 'src/engine/combat.js',
  transform: 'src/engine/abilities.js',
  vigilance: 'src/engine/combat.js',
});

/**
 * Keywordy-ETYKIETY: mechanika żyje w deskryptorach zdolności, w polu obiektu
 * albo w kolorach karty. `mechanika` mówi, GDZIE strażnik ma to sprawdzić.
 */
const ETYKIETA = Object.freeze({
  // Cecha koloru (CR 702.114a, weryfikacja u źródła 2026-10-01): „Devoid is
  // a characteristic-defining ability. «Devoid» means «This object is
  // colorless.»” — silnik czyta `colors`, nie keyword, dlatego każde
  // wystąpienie musi mieć colors: [].
  devoid: { mechanika: 'colors_puste' },
  // Zdolności triggerowane: `exalted_pump` (atak w pojedynkę).
  exalted: { mechanika: 'abilities' },
  // Zdolność aktywowana + statyki z warunkiem `minLevel` (CR 702.87).
  level_up: { mechanika: 'abilities' },
  // Zdolność aktywowana z kosztem tap + counter `outlast` (CR 702.107).
  outlast: { mechanika: 'abilities' },
  // Trigger `dies` + `return_with_counter: '-1/-1'` (CR 702.79). Uwaga: keyword
  // czyta jeszcze BOT (wartość wymiany), ale mechanikę realizuje deskryptor.
  persist: { mechanika: 'abilities' },
  // Zdolność aktywowana `set_saddled` + trigger `condition: { saddled: true }`.
  saddle: { mechanika: 'abilities' },
  // Trigger treningu (CR 702.149) w deskryptorze zdolności karty.
  training: { mechanika: 'abilities' },
  // Mechanika w POLU obiektu (`toxic`, CR 702.164): combat.js dokłada truciznę
  // z `source.toxic`, a keyword jest tylko etykietą dla UI/reguł.
  toxic: { mechanika: 'pole', pole: 'toxic' },
});

const klasy = () => new Set([...Object.keys(CZYTA_SILNIK), ...Object.keys(ETYKIETA)]);

test('U2/1: każdy keyword katalogu jest sklasyfikowany (silnik albo etykieta)', () => {
  const nieznane = [...W_KATALOGU.keys()].filter((kw) => !klasy().has(kw)).sort();
  assert.deepEqual(nieznane, [],
    `keyword bez klasy: dopisz czytelnika w CZYTA_SILNIK albo etykietę z mechaniką: ${nieznane.join(', ')}`);
});

test('U2/2: klasyfikacja jest świeża — żaden wpis nie opisuje keywordu spoza katalogu', () => {
  const martwe = [...klasy()].filter((kw) => !W_KATALOGU.has(kw)).sort();
  assert.deepEqual(martwe, [],
    `wpis bez karty w katalogu (stęchła klasyfikacja): ${martwe.join(', ')}`);
});

test('U2/3: „czyta silnik” jest dowodem — literal keywordu w zadeklarowanym pliku', () => {
  const braki = [];
  for (const [kw, plik] of Object.entries(CZYTA_SILNIK)) {
    assert.ok(fs.existsSync(plik), `plik czytelnika nie istnieje: ${plik} (${kw})`);
    const src = fs.readFileSync(plik, 'utf8');
    if (!src.includes(`'${kw}'`) && !src.includes(`"${kw}"`)) braki.push(`${kw} → ${plik}`);
  }
  assert.deepEqual(braki, [],
    `deklaracja czytania bez literału w pliku (przeniesiono regułę? popraw wskaźnik): ${braki.join(', ')}`);
});

test('U2/4: etykieta „abilities” — każda karta z keywordem ma deskryptor zdolności', () => {
  const braki = [];
  for (const [kw, opis] of Object.entries(ETYKIETA)) {
    if (opis.mechanika !== 'abilities') continue;
    for (const def of W_KATALOGU.get(kw) ?? []) {
      if ((def.abilities ?? []).length === 0) braki.push(`${kw} → ${def.id}`);
    }
  }
  assert.deepEqual(braki, [],
    `etykieta bez mechaniki (keyword deklarowany, ale nic go nie realizuje): ${braki.join(', ')}`);
});

test('U2/5: etykieta „pole” — każda karta niesie pole mechaniki', () => {
  const braki = [];
  for (const [kw, opis] of Object.entries(ETYKIETA)) {
    if (opis.mechanika !== 'pole') continue;
    for (const def of W_KATALOGU.get(kw) ?? []) {
      if (def[opis.pole] == null) braki.push(`${kw} → ${def.id} (brak ${opis.pole})`);
    }
  }
  assert.deepEqual(braki, [], `etykieta na polu bez pola: ${braki.join(', ')}`);
});

test('U2/6: devoid to cecha koloru — każda karta z keywordem jest bezbarwna (CR 702.114a)', () => {
  const kolorowe = (W_KATALOGU.get('devoid') ?? [])
    .filter((def) => (def.colors ?? []).length > 0)
    .map((def) => `${def.id}: ${JSON.stringify(def.colors)}`);
  assert.deepEqual(kolorowe, [], `devoid na kolorowej karcie: ${kolorowe.join(', ')}`);
});
