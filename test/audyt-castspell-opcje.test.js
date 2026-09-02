/**
 * Opcje rzutu czaru jako OBIEKT, nie ogon pozycyjny — audyt PR #93 (tura 3).
 *
 * Rozstrzygnięcie właściciela (2026-09-02): `castSpell` miał 13 argumentów
 * pozycyjnych, z czego sześć ostatnich to flagi (`buyback, payAltCost, xValue,
 * phyrexianPayWithLife, abilityWindowCast, kicked`). Każde nowe uprawnienie
 * dokładało pozycję, a `false, false, undefined, 0, true` jest zapisem, w którym
 * pomyłka kolejności NIE daje żadnego błędu — zamiana `abilityWindowCast` z
 * `kicked` miejscami to rzut z uprawnieniem, którego gracz nie miał.
 *
 * Po: ogon jedzie obiektem `options` (kształt `castPermanent`), a lista nazw
 * `CAST_SPELL_OPTIONS` jest jedynym źródłem prawdy — nieznany klucz odrzucamy,
 * więc literówka w nazwie opcji nie udaje uprawnienia (klasa L21: jawna lista
 * pól; tu użyta odwrotnie, jako bramka antyliterówkowa).
 *
 * Strażnik skanuje ŹRÓDŁO (L5/L27): nowa flaga w `castSpell` musi wejść na
 * listę, inaczej jest cicho odrzucana.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { castSpell, CAST_SPELL_OPTIONS } from '../src/engine/spells.js';

const REGISTRY = createCardRegistry();
const SPELL = REGISTRY.get('raise-the-alarm');

function setup() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: SPELL.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(SPELL), types: SPELL.types ?? ['Instant'],
  });
  state.zones.hand.push('spell');
  addMana(state, 'p1', 10, { colors: ['W'] });
  return state;
}

test('1) sygnatura: 7 argumentów pozycyjnych + options, ogon pozycyjny nie wróci', () => {
  assert.equal(castSpell.length, 7,
    'castSpell ma przyjąć (state, playerId, objectId, targets, sacrificeTargetId, modeIndex, stunTargetId, options) — '
    + 'kolejna flaga pozycyjna to klasa błędu, którą ta naprawa zamyka');
  // `fn.length` liczy parametry PRZED pierwszym z wartością domyślną, więc sam
  // nie widzi-flagi dopisanej PO `options`. Czytamy nagłówek z pliku: ósmy i
  // ostatni parametr musi nazywać się `options = {}`.
  const src = fs.readFileSync(new URL('../src/engine/spells.js', import.meta.url), 'utf8');
  const head = src.slice(src.indexOf('export function castSpell('), src.indexOf(') {', src.indexOf('export function castSpell(')));
  const params = head.replace('export function castSpell(', '').split(',').map((s) => s.trim());
  assert.equal(params.length, 8, `castSpell ma mieć 8 parametrów, ma ${params.length}: ${params.join(', ')}`);
  assert.equal(params[7], 'options = {}', 'ogon rzutu czaru to JEDEN parametr `options = {}`');
});

test('2) nieznana opcja jest odrzucana, a nie ignorowana', () => {
  const state = setup();
  assert.throws(() => castSpell(state, 'p1', 'spell', [], undefined, undefined, undefined, { kikced: true }),
    /Nieznana opcja rzutu czaru: kikced/);
});

test('3) znane opcje przechodzą walidację nazw i docierają do logiki', () => {
  const state = setup();
  // Brak kickera na karcie → `kicked: true` musi być ODRZUCONE przez regułę
  // kickera (CR 702.33), nie przez bramkę opcji: to dowód, że nazwa jest znana
  // i że wartość faktycznie trafiła do ciała funkcji.
  assert.throws(() => castSpell(state, 'p1', 'spell', [], undefined, undefined, undefined, { kicked: true }),
    /Ta karta nie ma mechaniki kicker/);
  // A zwykły rzut bez opcji nadal działa.
  const r = castSpell(state, 'p1', 'spell', [], undefined, undefined, undefined, {});
  assert.ok(r, 'rzut bez opcji powinien przejść');
});

test('4) komenda cast_spell mapuje pola na nazwane opcje (UI i bot nie liczą pozycji)', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [] });
  assert.equal(r.ok, true, 'komenda bez flag nadal rzuca');
});

test('5) skan źródła: każda flaga w ciele castSpell jest na liście opcji i każda jest użyta', () => {
  const src = fs.readFileSync(new URL('../src/engine/spells.js', import.meta.url), 'utf8');
  const start = src.indexOf('export function castSpell(');
  assert.notEqual(start, -1, 'brak castSpell w spells.js');
  const end = src.indexOf('\nexport function ', start + 10);
  const body = src.slice(start, end === -1 ? undefined : end);

  const destructure = body.match(/const \{([^}]*)\} = options;/);
  assert.ok(destructure, 'castSpell musi czytać opcje z `const { … } = options;`');
  const names = destructure[1]
    .split(',')
    .map((part) => part.trim().split(/[\s:=]+/)[0])
    .filter((n) => n && n !== '');

  assert.ok(names.length >= 6, `dekodowanych opcji musi być >= 6, jest ${names.length}`);
  for (const name of names) {
    assert.ok(CAST_SPELL_OPTIONS.includes(name),
      `flaga \`${name}\` jest czytana z options, ale jej NIE MA w CAST_SPELL_OPTIONS — `
      + 'spells.js by ją przyjął, a bramka odrzuciła (albo odwrotnie); lista jest jednym źródłem prawdy');
  }
  // Lista nie może utrzymywać martwej opcji: każda nazwa musi gdzieś w ciele
  // wystąpić poza samym destructure (inaczej oferta/UI wystawia flagę bez skutku).
  for (const name of CAST_SPELL_OPTIONS) {
    const pozaDekonstrukcja = body.replace(destructure[0], '').includes(name);
    assert.ok(pozaDekonstrukcja, `opcja \`${name}\` jest zadeklarowana, ale nigdzie nie użyta w castSpell`);
  }
});

test('6) CAST_SPELL_OPTIONS jest zamrożone (nikt nie dopisze opcji w locie)', () => {
  assert.ok(Object.isFrozen(CAST_SPELL_OPTIONS),
    'lista opcji musi być Object.freeze — to kontrakt sygnatury, nie zestaw do modyfikacji');
});
