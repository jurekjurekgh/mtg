// Etap F (PR #135, polecenie właściciela: „żadnych uproszczeń wpływających
// na grę") — koszt alternatywny ZASTĘPUJE koszt many (CR 118.9: „Some spells
// or abilities provide an alternative cost ... that a player may pay rather
// than the mana cost"; kolejność wyliczenia CR 601.2f). Escape i cleave
// sprawdzały dotąd bramkę kolorów WYDRUKU karty (hasColorForObject →
// MANA_COSTS[cardId]) i liczyły budżet z pipami wydruku. W katalogu pipy
// kosztu alternatywnego pokrywają się z wydrukiem (Sweet Oblivion {1}{U} /
// escape {3}{U}, Lunar Rejection {1}{U} / cleave {3}{U}), więc błąd był
// utajony — ale pierwsza karta z innym kolorem alt-kosztu byłaby nierzucalna
// (albo oferowana bez możliwości zapłaty). Lustro: legalFlashbackCasts.
// Test jest syntetyczny (podmienione pipy kosztu alternatywnego), bo reguła
// nie zależy od karty (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const registry = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 424, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, zone, spellPatch) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone,
    kind: data.kind, manaCost: data.manaCost, spell: { ...data.spell, ...spellPatch },
    abilities: [], keywords: [], subtypes: [], types: def.types, colors: data.colors ?? [], cardName: def.name,
  });
}

function fillGraveyard(state, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `g${i}`, instanceId: `i-g${i}`, cardId: 'x-grob', controllerId: 'p1', zone: 'graveyard',
      kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [], cardName: 'Karta w grobie',
    });
  }
}

const escapeOffer = (state) => playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_escape');
const cleaveOffer = (state) => playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_cleave');

test('Etap F: escape płaci SWOJE pipy — {R} alt-kosztu wystarcza bez {U} z wydruku', () => {
  const state = newState();
  putCard(state, 'esc', 'sweet-oblivion', 'graveyard', { escape: { cost: 4, colors: ['R'], exileCount: 4 } });
  fillGraveyard(state, 4);
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = escapeOffer(state);
  assert.ok(cast, 'escape oferowany: pula {R}{R}{R}{R} pokrywa koszt escape {3}{R} (wydruk {1}{U} nieistotny)');
  assert.equal(execute(state, cast).ok, true);
  const exileIds = state.pendingEscapeExile.candidateIds.slice(0, 4);
  const done = execute(state, { type: 'resolve_escape_exile', playerId: 'p1', exileIds });
  assert.equal(done.ok, true, `koszt przyjęty: ${done.events?.[0]?.reason ?? ''}`);
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'sweet-oblivion'));
});

test('Etap F: escape NIE jest oferowany, gdy brak pipu alt-kosztu (choć pip wydruku jest)', () => {
  const state = newState();
  putCard(state, 'esc', 'sweet-oblivion', 'graveyard', { escape: { cost: 4, colors: ['R'], exileCount: 4 } });
  fillGraveyard(state, 4);
  addMana(state, 'p1', 4, { colors: ['U'] });
  assert.equal(escapeOffer(state), undefined, 'bez {R} escape {3}{R} jest nieopłacalny — brak oferty');
  const res = execute(state, { type: 'cast_escape', playerId: 'p1', objectId: 'esc', targets: ['p2'] });
  assert.equal(res.ok, false, 'walidacja odrzuca ten sam rzut (oferta = walidacja, L48)');
});

test('Etap F: cleave płaci SWOJE pipy — oferta i rzut bez pipu wydruku', () => {
  const state = newState();
  putCard(state, 'clv', 'lunar-rejection', 'hand', {
    cleave: { ...gameObjectDataOf(registry.get('lunar-rejection')).spell.cleave, colors: ['R'] },
  });
  addObject(state, {
    id: 'cel', instanceId: 'i-cel', cardId: 'x-cel', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: 'Cel',
  });
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = cleaveOffer(state);
  assert.ok(cast, 'cleave {3}{R} oferowany z pulą {R}x4 (wydruk {1}{U} nieistotny)');
  const res = execute(state, cast);
  assert.equal(res.ok, true, `rzut przyjęty: ${res.events?.[0]?.reason ?? ''}`);
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'lunar-rejection'));
});

test('Etap F: cleave NIE jest oferowany bez pipu alt-kosztu', () => {
  const state = newState();
  putCard(state, 'clv', 'lunar-rejection', 'hand', {
    cleave: { ...gameObjectDataOf(registry.get('lunar-rejection')).spell.cleave, colors: ['R'] },
  });
  addObject(state, {
    id: 'cel', instanceId: 'i-cel', cardId: 'x-cel', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: 'Cel',
  });
  addMana(state, 'p1', 4, { colors: ['U'] });
  assert.equal(cleaveOffer(state), undefined);
});
