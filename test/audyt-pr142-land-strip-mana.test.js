import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { producibleMana, untappedLandManaSources, tapLandForMana, grantManaOnLand } from '../src/engine/resources.js';
import { getSourceForObject, colorsProducibleBySubtype } from '../src/engine/mana-sources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';

// F5b (audyt PR #142, 2026-09-28): domknięcie bramki „utrata zdolności" na
// ścieżce MANY. PR #142 wprowadził strip do czytników źródeł
// (`mana-sources.js`: `isLand && !abilitiesStripped`, `if (abilitiesStripped)
// return null`), ale enumeracja lądów w `resources.js`
// (`untappedLandManaSources`, :705) nie filtrowała zdolności: producibleMana
// liczyła „grant > 0 ? grant : 1" za KAŻDY nietapnięty land, auto-tap go
// tapnął, a `tapLandForMana` oddawał 1 bezbarwną jednostkę (src = null →
// colors = []). Mutacja M3 (wyłączenie OBU bramek stripa naraz) przechodziła
// CAŁĄ szybką suitę — brak pinu.
//
// Podstawy reguł (ADR 0030; CR 2026-09-25, SHA-256
// 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca, ten sam
// plik co w `test/helpers/cr-numery-tabela.js`):
// - CR 305.6: land z podstawowym podtypem ma WEWNĘTRZNĄ zdolność many
//   („{T}: Add {G}" dla Forest).
// - CR 613.1f: zdolności dodające/usuwające działają w warstwie 6 —
//   „has no abilities" usuwa także zdolność wewnętrzną podtypu.
// - CR 605.1a: mana ability to zdolność AKTYWOWANA dodająca manę — bez
//   zdolności nie ma czego aktywować (0 many, nie „1 bezbarwna").
// - Grant PÓŹNIEJSZY (aura Nature's Embrace) zostaje — model warstw z F5
//   (ruling Xu-Ifit 2025-07-25: „gains an ability after ... will keep that
//   ability"); dlatego bramka nie może być łapana po samym
//   `abilitiesStripped`, a po braku JAKIEGOKOLWIEK źródła (grant albo
//   deskryptor/podtyp/mapa).
//
// Pin jest SYNTEtyczny (klasa L52): w katalogu nie ma taliowalnego Land+
// stripa — Xu-Ifit (`stripAbilities`) celuje wyłącznie w creature card, a
// jedynym Land+Creature jest token `token_forest_dryad`. Scenariusz jest
// jednak generyczną mechaniką rdzenia (deskryptor danych, ADR 0002), więc
// niezmiennik musi być zapięty, zanim katalog kiedyś go dosięgnie.
const registry = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1', patch = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

/** Las (basic-forest, CR 305.6) + artefakt {1} (hunters-blowgun) w ręce. */
function game({ strip = false } = {}) {
  const state = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < 8; i++) put(state, `lib-${p}-${i}`, 'basic-swamp', 'library', p);
  put(state, 'forest', 'basic-forest', 'battlefield', 'p1',
    strip ? { abilitiesStripped: true, abilitiesStrippedAt: 1 } : {});
  put(state, 'spell', 'hunters-blowgun', 'hand', 'p1');
  return state;
}
const castOffer = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'cast_permanent' && c.objectId === 'spell');
const reasonOf = (result) => result?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

test('PR142/F5b: kontrola — nietknięty Las liczy się jako źródło i płaci {1}', () => {
  const state = game();
  const forest = state.objects.get('forest');
  assert.deepEqual(getSourceForObject(forest, state)?.colors, ['G']);
  assert.equal(producibleMana(state, 'p1'), 1);
  assert.deepEqual(colorsProducibleBySubtype(state, 'p1', 'Forest'), ['G']);
  const result = execute(state, castOffer(state));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.objects.get('forest').tapped, true);
  assert.equal(state.players[0].mana, 0);
  // Rzut tworzy obiekt stosu (nowe id) — karta zniknęła z ręki.
  assert.equal(state.objects.get('spell'), undefined);
  assert.equal(state.zones.stack.length, 1);
  assert.equal(state.objects.get(state.zones.stack[0]).cardId, 'hunters-blowgun');
});

test('PR142/F5b: land po utracie zdolności NIE jest źródłem many (CR 305.6+613.1f)', () => {
  const state = game({ strip: true });
  const forest = state.objects.get('forest');
  assert.equal(forest.abilitiesStripped, true);
  assert.equal(getSourceForObject(forest, state), null);
  assert.deepEqual(colorsProducibleBySubtype(state, 'p1', 'Forest'), []);
  assert.equal(producibleMana(state, 'p1'), 0);
  assert.deepEqual(untappedLandManaSources(state, 'p1').map((o) => o.id), []);
});

test('PR142/F5b: tap_for_mana na landzie bez zdolności odrzucone, zero mutacji', () => {
  const state = game({ strip: true });
  const result = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(reasonOf(result), /^illegal_mana_source:/);
  assert.equal(state.objects.get('forest').tapped, false);
  assert.equal(state.players[0].mana, 0);
  assert.deepEqual(state.players[0].manaPool, {});
});

test('PR142/F5b: {1} bez źródła — brak oferty, rzut odrzucony, land nietapnięty', () => {
  const state = game({ strip: true });
  assert.equal(castOffer(state), undefined);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'spell' });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(reasonOf(result), /^illegal_cast:/);
  assert.equal(state.objects.get('forest').tapped, false);
  assert.equal(state.objects.get('spell').zone, 'hand');
  assert.equal(state.players[0].mana, 0);
});

test('PR142/F5b: grant aury PO stripie zostaje (CR 613.1f, model F5)', () => {
  const state = game({ strip: true });
  put(state, 'embrace', 'natures-embrace', 'battlefield', 'p1');
  attachAuraToCreature(state, 'embrace', 'forest');
  assert.equal(grantManaOnLand(state, 'forest'), 2);
  assert.deepEqual(untappedLandManaSources(state, 'p1').map((o) => o.id), ['forest']);
  assert.equal(producibleMana(state, 'p1'), 2);
  tapLandForMana(state, 'p1', 'forest', { grantColor: 'G' });
  assert.equal(state.players[0].mana, 2);
  assert.deepEqual(state.players[0].manaPool, { G: 2 });
});
