// M212 (zgłoszenie B właściciela): STRAŻNIK — kod nie rozpoznaje konkretnej
// karty po nazwie ani po identyfikatorze.
//
// Powód: Roiling Regrowth przedstawiał się w UI jako „Springbloom Druid", bo
// nazwa PIERWSZEJ karty, która wprowadziła mechanikę, była zaszyta w etykiecie
// decyzji. Gdy tę samą mechanikę dostaje druga karta, dziedziczy cudze imię
// (ADR 0002 — core card-agnostic; L41 — dwie kopie tej samej reguły).
//
// Strażnik działa jak ZAPADKA: istniejące wystąpienia są wypisane w
// ZAMROZONE poniżej i nie blokują builda, ale NOWEGO wystąpienia dodać się
// nie da. Każdy wpis to dług do spłacenia przy okazji dotykania danego kodu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCardRegistry } from '../src/cards/card-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = createCardRegistry();

// Podtypy i nazwy tokenów to SŁOWNIK REGUŁ (CR), nie odwołania do kart:
// „Island" jest podtypem lądu, „Treasure"/„Clue"/„Food" to tokeny tworzone
// przez efekty. Basicki mają produkcję many wprost z CR 305.6.
const SLOWNIK_REGUL = new Set([
  'Treasure', 'Clue', 'Food', 'Germ', 'Hero', 'Skeleton', 'Spirit', 'Clone',
  'Incubator', 'Phyrexian', 'Island', 'Plains', 'Swamp', 'Mountain', 'Forest',
  'Catacombs', 'Gate',
]);
const DOZWOLONE_ID = new Set([
  'basic-plains', 'basic-island', 'basic-swamp', 'basic-mountain', 'basic-forest',
]);

// Świadome TABELE DANYCH (nie rozgałęzienia kodu po karcie): mana-sources.js
// ma własnego strażnika M200/N1 pilnującego, by nie cieniowała deskryptorów.
const PLIKI_DANYCH = new Set(['src/engine/mana-sources.js', 'src/table/deck-builder.js']);

// ZAPADKA: stan zastany w chwili wprowadzenia strażnika (M212). Wyłącznie
// etykiety UI i komunikaty błędów — żadne z tych miejsc nie rozgałęzia
// ZACHOWANIA po karcie. Lista może się skracać, nigdy wydłużać.
const ZAMROZONE = new Set([
  'src/engine/spells.js|Fireball',
  'src/engine/spells.js|Lash of the Balrog',
  'src/table/choice-request.js|Index',
  'src/table/render.js|Dreams of Steel and Oil',
  'src/table/render.js|Epic Experiment',
  'src/table/render.js|Fertile Thicket',
  'src/table/render.js|Halo Forager',
  'src/table/render.js|Index',
  'src/table/render.js|Stomping Slabs',
  'src/table/render.js|Underdark Explorer',
  'src/table/render.js|Willbender',
  'src/table/session.js|Dragon Arch',
  'src/table/session.js|Epic Experiment',
  'src/table/session.js|Fertile Thicket',
  'src/table/session.js|Force Away',
  'src/table/session.js|Forever Young',
  'src/table/session.js|Index',
  'src/table/session.js|Inspire Awe',
  'src/table/session.js|Moonlit Meditation',
  'src/table/session.js|Stomping Slabs',
  'src/table/session.js|Willbender',
]);

function plikiZrodlowe() {
  const out = [];
  for (const katalog of ['src/engine', 'src/controllers', 'src/table', 'src/protocol']) {
    for (const nazwa of readdirSync(join(ROOT, katalog))) {
      if (nazwa.endsWith('.js')) out.push(`${katalog}/${nazwa}`);
    }
  }
  return out;
}

const escapeRe = (tekst) => tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Nazwy kart szukamy WEWNĄTRZ literałów tekstowych (nie tylko jako całego
 * napisu) — oryginalny błąd brzmiał „Springbloom Druid — land do
 * poświęcenia", więc dopasowanie całości by go przegapiło.
 */
export function znajdzOdwolaniaDoKart(pliki, czytaj, idKart, nazwyKart, zamrozone = new Set()) {
  const trafienia = [];
  for (const plik of pliki) {
    if (PLIKI_DANYCH.has(plik)) continue;
    czytaj(plik).split('\n').forEach((linia, i) => {
      // Literał w komentarzu to dokumentacja, nie logika.
      const kod = linia.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (!kod.trim()) return;
      for (const m of kod.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)) {
        if (idKart.has(m[1]) && !DOZWOLONE_ID.has(m[1]) && !zamrozone.has(`${plik}|${m[1]}`)) {
          trafienia.push(`${plik}:${i + 1} → id '${m[1]}'`);
        }
      }
      for (const m of kod.matchAll(/'([^']*)'|`([^`]*)`/g)) {
        const literal = m[1] ?? m[2] ?? '';
        if (!literal) continue;
        for (const nazwa of nazwyKart) {
          if (zamrozone.has(`${plik}|${nazwa}`)) continue;
          if (new RegExp(`(^|[^A-Za-z])${escapeRe(nazwa)}([^A-Za-z]|$)`).test(literal)) {
            trafienia.push(`${plik}:${i + 1} → nazwa '${nazwa}'`);
          }
        }
      }
    });
  }
  return trafienia;
}

function nazwyIId() {
  const idKart = new Set();
  const nazwyKart = new Set();
  for (const karta of REGISTRY.all()) {
    idKart.add(karta.id);
    if (karta.name && !SLOWNIK_REGUL.has(karta.name)) nazwyKart.add(karta.name);
  }
  return { idKart, nazwyKart };
}

test('M212: kod nie zaszywa nazw ani ID kart (poza zamrożoną listą długu)', () => {
  const { idKart, nazwyKart } = nazwyIId();
  const trafienia = znajdzOdwolaniaDoKart(
    plikiZrodlowe(),
    (plik) => readFileSync(join(ROOT, plik), 'utf8'),
    idKart,
    nazwyKart,
    ZAMROZONE,
  );
  assert.deepEqual(trafienia, [],
    'NOWE odwołanie do konkretnej karty w kodzie (ADR 0002). Zachowanie opisz '
    + 'deskryptorem w danych karty, a nazwę do UI weź ze źródła decyzji '
    + '(wzorzec: pendingSpringbloom.sourceCardId):\n' + trafienia.join('\n'));
});

test('M212: zamrożona lista długu nie zawiera martwych wpisów', () => {
  // Wpis, który przestał być prawdą, musi zniknąć — inaczej lista rośnie
  // w nieskończoność i przestaje cokolwiek znaczyć.
  const { idKart, nazwyKart } = nazwyIId();
  const wszystkie = znajdzOdwolaniaDoKart(
    plikiZrodlowe(),
    (plik) => readFileSync(join(ROOT, plik), 'utf8'),
    idKart,
    nazwyKart,
    new Set(),
  );
  const zywe = new Set(wszystkie.map((wpis) => {
    const [lokacja, reszta] = wpis.split(' → ');
    return `${lokacja.split(':')[0]}|${reszta.replace(/^(id|nazwa) '/, '').replace(/'$/, '')}`;
  }));
  const martwe = [...ZAMROZONE].filter((wpis) => !zywe.has(wpis));
  assert.deepEqual(martwe, [], `wpisy do usunięcia z ZAMROZONE (dług spłacony): ${martwe.join(', ')}`);
});

test('M212: strażnik sam się sprawdza — trafia i milczy (weryfikacja mutacyjna)', () => {
  // Bez tego strażnik byłby dekoracją, która nigdy nic nie wykryje (L13).
  const idKart = new Set(['roiling-regrowth']);
  const nazwyKart = new Set(['Springbloom Druid']);
  const pliki = ['src/engine/fake.js'];

  assert.deepEqual(
    znajdzOdwolaniaDoKart(pliki, () => "const x = 'roiling-regrowth';", idKart, nazwyKart),
    ["src/engine/fake.js:1 → id 'roiling-regrowth'"]);

  // DOKŁADNIE objaw zgłoszenia B: nazwa w środku dłuższej etykiety.
  assert.deepEqual(
    znajdzOdwolaniaDoKart(pliki, () => "  resolve_springbloom: 'Springbloom Druid — land do poświęcenia',", idKart, nazwyKart),
    ["src/engine/fake.js:1 → nazwa 'Springbloom Druid'"]);

  // Zapadka wycisza wpis znany, ale tylko jego.
  assert.deepEqual(
    znajdzOdwolaniaDoKart(pliki, () => "return 'Springbloom Druid';", idKart, nazwyKart,
      new Set(['src/engine/fake.js|Springbloom Druid'])), []);

  // Komentarz i czysty kod nie mogą fałszywie alarmować.
  assert.deepEqual(
    znajdzOdwolaniaDoKart(pliki, () => "// historycznie: 'roiling-regrowth' po id", idKart, nazwyKart), []);
  assert.deepEqual(
    znajdzOdwolaniaDoKart(pliki, () => 'return source.cardId ?? null;', idKart, nazwyKart), []);
});
