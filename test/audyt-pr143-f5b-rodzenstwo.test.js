import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { tapLandForMana, grantManaOnLand, landCanProduceMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';

// Rodzeństwo F5b (audyt PR #143, 2026-09-28d): domknięcie rodziny „land, który
// utracił własną zdolność many" w warstwie OFERTY (UI) i PRODUKCJI (komenda).
// Naprawa #143 (88a4cc1) zamknęła ścieżkę płatności w silniku
// (`landCanProduceMana` + `untappedLandManaSources` + `tapLandForMana`), ale
// przegląd rodzeństwa (L72) zostawił dwa rozjazdy oferty/walidacji (L48):
//
// F1 (oferta): `mana-wizard.isUntappedLandSource` rozstrzyga „czy to źródło"
//   przez `getSourceForObject(obiekt WIDOKU)` — a `playerView` nie niesie
//   `abilitiesStripped` (brak faktu publicznego, ADR 0017/L1), więc land po
//   stripie nadal wchodził do kreatora many jako `tap_for_mana`, którego
//   silnik odrzuca (`illegal_mana_source`).
// F2 (produkcja): bare `tap_for_mana` (handler nie przekazywał `grantColor`)
//   na landzie, którego JEDYNĄ zdolnością many jest grant aury, fabrykował
//   1 bezbarwną (`amount = useGrant ? grant : 1`, `colors = src?.colors ?? []`
//   przy `src = null`) — choć taka zdolność nie istnieje (CR 605.1a).
//
// Podstawy regułowe (ADR 0030):
// - Oracle Nature's Embrace (Scryfall API, pobrane 2026-09-28):
//   „As long as enchanted permanent is a land, it has "{T}: Add two mana of
//   any one color."\" — grantowana zdolność produkuje 2 many JEDNEGO koloru,
//   nigdy 1 bezbarwną. Rulingi WotC: brak (pusta lista).
// - CR 305.6 + 613.1f + 605.1a (CR 2026-09-25, SHA-256 8d860e45…c070ca —
//   cytaty i weryfikacja u źródła w `test/audyt-pr142-land-strip-mana.test.js`):
//   zdolność many to zdolność AKTYWOWANA dodająca manę; po stripie nie ma
//   czego aktywować, a grant PÓŹNIEJSZY zostaje (model warstw F5).
// - Granica zakresu sygnalizowana jawnym rejectem (L52): aktywacja grantu
//   bez wyboru koloru nie ma czego rozstrzygać — komenda `tap_for_mana`
//   przyjmuje opcjonalne `grantColor` (auto-tap podawał je zawsze).
//
// Scenariusze są SYNTERETYCZNE (L52): katalog nie ma dziś taliowalnego
// Land+stripa (Xu-Ifit celuje w creature card) ani landu bez własnej
// produkcji (29 landów, wszystkie amount 1) — niezmiennik rodziny musi być
// zapięty, zanim katalog go dosięgnie (jak pin F5b z #143).
const registry = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1', patch = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function game({ strip = false, aura = false } = {}) {
  const state = createGameState({ seed: 143, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < 4; i++) put(state, `lib-${p}-${i}`, 'basic-swamp', 'library', p);
  put(state, 'forest', 'basic-forest', 'battlefield', 'p1',
    strip ? { abilitiesStripped: true, abilitiesStrippedAt: 1 } : {});
  if (aura) {
    put(state, 'embrace', 'natures-embrace', 'battlefield', 'p1');
    attachAuraToCreature(state, 'embrace', 'forest');
  }
  return state;
}
const reasonOf = (result) => result?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

test('PR143/rodz.: widok niesie abilitiesStripped — fakt publiczny, bez pól „na zapas" (ADR 0017)', () => {
  const striped = playerView(game({ strip: true }), 'p1').zones.battlefield.find((o) => o.id === 'forest');
  assert.equal(striped.abilitiesStripped, true);
  const normal = playerView(game(), 'p1').zones.battlefield.find((o) => o.id === 'forest');
  assert.equal('abilitiesStripped' in normal, false, 'zwykły land nie dostaje flagi na zapas');
});

test('PR143/rodz.: kreator many NIE oferuje tap_for_mana dla landu po utracie zdolności (L48)', () => {
  // Oferta i walidacja mają jeden filtr (L48): silnik odrzuca tap_for_mana
  // (`illegal_mana_source` — pin w audyt-pr142-land-strip-mana), więc
  // kreator nie może tego wariantu pokazywać.
  const sources = manaSourcesOf(playerView(game({ strip: true }), 'p1'), 'p1', () => null);
  assert.deepEqual(sources.map((s) => s.id), []);
  // Anty-over-fix: zwykły Las nadal jest oferowany (z G).
  const okSources = manaSourcesOf(playerView(game(), 'p1'), 'p1', () => null);
  assert.deepEqual(okSources.map((s) => s.id), ['forest']);
  assert.deepEqual(okSources[0].colors, ['G']);
});

test('PR143/rodz.: bare tap_for_mana na landzie z SAMYM grantem aury nie fabrykuje bezbarwnej (CR 605.1a)', () => {
  const state = game({ strip: true, aura: true });
  assert.equal(grantManaOnLand(state, 'forest'), 2);
  assert.equal(landCanProduceMana(state, state.objects.get('forest')), true);
  assert.equal(getSourceForObject(state.objects.get('forest'), state), null);
  const result = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(reasonOf(result), /^illegal_mana_source:/);
  // Atomowość (L48): brak mutacji po odrzuceniu.
  assert.equal(state.objects.get('forest').tapped, false);
  assert.equal(state.players[0].mana, 0);
  assert.deepEqual(state.players[0].manaPool, {});
});

test('PR143/rodz.: tap_for_mana z grantColor aktywuje zdolność aury (2 many wybranego koloru)', () => {
  const state = game({ strip: true, aura: true });
  const result = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest', grantColor: 'G' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.objects.get('forest').tapped, true);
  assert.equal(state.players[0].mana, 2);
  assert.deepEqual(state.players[0].manaPool, { G: 2 });
});

test('PR143/rodz.: anty-over-fix — zwykły land płaci 1, grant na zwykłym landzie nie zmienia bare tapu', () => {
  // Własna zdolność many działa bez zmian (kontrola gałęzi src != null).
  const plain = game();
  assert.equal(execute(plain, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' }).ok, true);
  assert.equal(plain.players[0].mana, 1);
  assert.deepEqual(plain.players[0].manaPool, { G: 1 });
  // Zwykły Las z grantem: bare tap nadal aktywuje WŁASNĄ zdolność ({T}: Add
  // {G}); grant jest dostępny przez grantColor/auto-tap — dotychczasowe
  // zachowanie komendy bez wyboru koloru pozostaje nietknięte.
  const granted = game({ aura: true });
  assert.equal(execute(granted, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' }).ok, true);
  assert.equal(granted.players[0].mana, 1);
  assert.deepEqual(granted.players[0].manaPool, { G: 1 });
});
