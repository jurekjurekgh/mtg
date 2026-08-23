// M200 — audyt PR #70 (ADR 0020 B), znalezisko N1:
//
// N1: MANA_SOURCE_MAP cieniowała deskryptory add_mana (klasa L41/L14).
//     Batch 46 dopisał 'manor-gate' do mapy, choć karta MA deskryptor
//     {T}: add_mana — M193 ustalił, że kolory produkcji czytane są z
//     DESKRYPTORA (mapa = tylko produkcja niewyrażona deskryptorem).
//     Wpis mapy + dedykowana gałąź `chosenColor` w getSourceForObject
//     były martwym drugim źródłem prawdy: gałąź deskryptora zwracała
//     wcześniej, więc mapa i tak nigdy nie obowiązywała. Trzy starsze
//     wpisy tej samej klasy (scorned-villager, moonscarred-werewolf,
//     seers-lantern) usunięte razem — zachowanie identyczne (por. testy
//     zachowania poniżej).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { manaAbilityColors, getSourceForObject } from '../src/engine/mana-sources.js';

const REGISTRY = createCardRegistry();

/** Wpisów MANA_SOURCE_MAP — skan źródła (wzorzec strażników L29/L31). */
function mapEntries() {
  const src = readFileSync(new URL('../src/engine/mana-sources.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const MANA_SOURCE_MAP'), src.indexOf('export function getManaSourceInfo'));
  return [...block.matchAll(/'([a-z0-9_-]+)'\s*:/g)].map((m) => m[1]);
}

/**
 * Rdzeń strażnika (czysty predykat — osobno testowany, L13/L34): z listy
 * wpisów mapy wybiera te, których karta ma DARMOWĄ zdolność
 * „{T}: Add …" w danych — dla nich mapa jest cieniem deskryptora.
 */
function findShadowedEntries(entries, descriptorColorsOf) {
  const shadowed = [];
  for (const cardId of entries) {
    const colors = descriptorColorsOf(cardId);
    if (colors) shadowed.push(cardId);
  }
  return shadowed;
}

function descriptorColorsOfRegistry(cardId) {
  const def = REGISTRY.get(cardId);
  if (!def) return null; // tokeny spoza rejestru — mapa jedynym źródłem
  const object = {
    id: 'probe', cardId, controllerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
  };
  return manaAbilityColors(object);
}

test('M200/N1: STRAŻNIK — MANA_SOURCE_MAP nie cieniuje deskryptorów add_mana', () => {
  // Root cause (L41): dwa źródła prawdy dla tych samych danych (kolory/
  // ilość produkcji many) rozjeżdżają się w ciszy, bo gałąź deskryptora
  // w getSourceForObject ma pierwszeństwo i mapa nigdy nie obowiązuje —
  // ale kłamie o tym, czym jest. Nowa karta z deskryptorem NIE może
  // dostać wpisu w mapie (polityka M193, komunikat strażnika tam).
  const shadowed = findShadowedEntries(mapEntries(), descriptorColorsOfRegistry);
  assert.deepEqual(shadowed, [],
    'wpisy mapy cieniujące deskryptor (druga kopia tej samej reguły — usuń, '
    + `źródłem prawdy jest deskryptor karty): ${shadowed.join(', ')}`);
});

test('M200/N1: strażnik sam się sprawdza — wykryłby cień (weryfikacja mutacyjna)', () => {
  // Predykat musi zarówno trafić, jak i milczeć — inaczej jest dekoracją (L13).
  const colorsOf = (id) => (id === 'fake-gate' ? ['G'] : id === 'fake-lantern' ? null : null);
  assert.deepEqual(findShadowedEntries(['fake-gate', 'fake-lantern'], colorsOf), ['fake-gate']);
  assert.deepEqual(findShadowedEntries(['fake-lantern'], colorsOf), []);
  assert.deepEqual(findShadowedEntries([], colorsOf), []);
});

// ---- N1: zachowanie zachowane po usunięciu cieni (snapshot PRZED fixem) --
// Wyniki zmierzone na kodzie PR #70 (przed usunięciem wpisów) — muszą być
// identyczne po fixie, bo deskryptor od M193 i tak wygrywał.

function probeSource(cardId, patch = {}) {
  const def = REGISTRY.get(cardId);
  const object = {
    id: 'probe', cardId, controllerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    ...patch,
  };
  return getSourceForObject(object, null);
}

test('M200/N1: zachowanie zachowane — manor-gate {G} + wybrany kolor', () => {
  assert.deepEqual(probeSource('manor-gate', { chosenColor: 'W' }).colors, ['G', 'W']);
  assert.equal(probeSource('manor-gate', { chosenColor: 'W' }).amount, 1);
  // bez wyboru koloru (przed ETB) — baza {G}
  assert.deepEqual(probeSource('manor-gate').colors, ['G']);
});

test('M200/N1: zachowanie zachowane — trzy starsze cienie bez zmian', () => {
  assert.deepEqual(probeSource('scorned-villager').colors, ['G']);
  assert.equal(probeSource('scorned-villager').amount, 1);
  assert.deepEqual(probeSource('moonscarred-werewolf').colors, ['G']);
  assert.equal(probeSource('moonscarred-werewolf').amount, 2, '„{T}: Add {G}{G}" — dwie many');
  assert.deepEqual(probeSource('seers-lantern').colors, [], '„{T}: Add {C}" — bezbarwna');
});
