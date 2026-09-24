/**
 * Pin O-2 z audytu PR #134 (docs/audits/AUDYT_PR134_2026-09-24.md, §5/O-2).
 *
 * O-2: zamknięta lista TYPÓW KART siedziała w dwóch plikach — `DELIRIUM_CARD_TYPES`
 * w `triggers.js` (próg delirium, CR 207.2c) i `ALL_GRAVEYARD_CARD_TYPES` w
 * `permanents.js` (Tarmogoyf — token Disy the Restless). 16 elementów, zero
 * różnicy, a od PR #134 jedna z tych kopii DECYDOWAŁA O DOSTĘPNOŚCI ZDOLNOŚCI
 * (bramka delirium dla karty z katalogu). Reguły projektu wymagają dokładnie
 * odwrotnie: jedno źródło, jedna definicja (ADR 0002 — silnik bez specjalnych
 * przypadków; LESSONS L41 — jedna definicja zamiast duplikatu; L48 — duplikat
 * listy to rozjazd w oczekiwaniu).
 *
 * Naprawa: `CARD_TYPES` (CR 205.2a) jest eksportem `permanents.js`; `triggers.js`
 * importuje go zamiast trzymać własną kopię; komentarz w `render.js` wskazuje
 * tę samą nazwę. Ten plik broni, by duplikat nie wrócił i by obie ścieżki
 * liczenia typów kart nie mogły się rozejść.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { graveyardCardTypeCount } from '../src/engine/triggers.js';
import { CARD_TYPES, allGraveyardsCardTypeCount } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();
const WYPELNIACZ = 'highland-game';

function putObject(state, id, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(WYPELNIACZ);
  assert.ok(def, `karta ${WYPELNIACZ} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: WYPELNIACZ, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

test('O-2/1: delirium i licznik wszystkich grobów czytają TĘ SAMĄ listę typów kart', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Trzy rzadkie typy kart + stworzenie z nadtypami: nadtypy (Basic, Legendary)
  // nie są typami kart, więc nie mogą podnieść licznika.
  putObject(state, 'g1', 'p1', 'graveyard', { types: ['Dungeon'] });
  putObject(state, 'g2', 'p1', 'graveyard', { types: ['Kindred'] });
  putObject(state, 'g3', 'p1', 'graveyard', { types: ['Battle'] });
  putObject(state, 'g4', 'p1', 'graveyard', {
    types: ['Creature'], supertypes: ['Basic', 'Legendary'],
  });
  // Token w grobie nie jest kartą (name ustawione) i nie wnosi typu.
  putObject(state, 'g5', 'p1', 'graveyard', { name: 'Goblin', types: ['Creature'] });

  assert.equal(graveyardCardTypeCount(state, 'p1'), 4,
    'delirium: 4 typy kart (Dungeon, Kindred, Battle, Creature) — token i nadtypy się nie liczą');
  assert.equal(allGraveyardsCardTypeCount(state), 4,
    'licznik wszystkich grobów: te same 4 typy — obie ścieżki czytają jedną listę');
});

test('O-2/2: lista typów kart ma JEDNO źródło w src/ (permanents.js)', () => {
  const pliki = [];
  const stos = [path.join(import.meta.dirname, '..', 'src')];
  while (stos.length > 0) {
    const katalog = stos.pop();
    for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
      if (wpis.isDirectory()) stos.push(path.join(katalog, wpis.name));
      else if (wpis.name.endsWith('.js')) pliki.push(path.join(katalog, wpis.name));
    }
  }
  const definicje = pliki.filter((plik) => /'Artifact',\s*'Battle',\s*'Conspiracy'/.test(fs.readFileSync(plik, 'utf8')));
  assert.deepEqual(definicje.map((p) => path.relative(path.join(import.meta.dirname, '..'), p)),
    ['src/engine/permanents.js'],
    'dokładnie jeden plik definiuje listę typów kart (duplikat = rozjazd w oczekiwaniu, L41/L48)');
  assert.ok(!fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'engine', 'triggers.js'), 'utf8')
    .includes('DELIRIUM_CARD_TYPES'), 'triggers.js nie ma już własnej kopii listy');
});

test('O-2/3: CARD_TYPES to typy kart (CR 205.2a), nie nadtypy i nie zamrożona kopia', () => {
  assert.equal(CARD_TYPES.length, 16, 'szesnaście typów kart');
  assert.ok(Object.isFrozen(CARD_TYPES), 'lista zamrożona');
  for (const nadtyp of ['Basic', 'Legendary', 'Snow', 'World']) {
    assert.ok(!CARD_TYPES.includes(nadtyp), `${nadtyp} to nadtyp, nie typ karty`);
  }
  for (const typ of ['Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
    'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker', 'Scheme', 'Sorcery',
    'Tribal', 'Vanguard']) {
    assert.ok(CARD_TYPES.includes(typ), `${typ} jest typem karty`);
  }
});
