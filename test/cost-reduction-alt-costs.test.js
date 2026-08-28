// M111 — obniżki kosztu a koszty ALTERNATYWNE (CR 601.2f).
// Etherium Sculptor („Artifact spells you cast cost {1} less to cast\") miał
// zapisane w limitations, że obniżka omija bestow/escape/flashback/cleave/
// adventure. Oracle nie zna takiego wyjątku: obniżka stosuje się do KOSZTU
// CAŁKOWITEGO, niezależnie od tego, czy gracz płaci koszt wydrukowany, czy
// alternatywny (kolejność z 601.2f: koszt alternatywny → podwyżki → obniżki).
// Test jest generyczny — modyfikator kosztu wystawia syntetyczny permanent,
// więc reguła nie zależy od nazwy karty (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { reduceAlternativeCost } from '../src/engine/mana-cost.js';

function newState() {
  const state = createGameState({ seed: 111, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Permanent z modyfikatorem kosztu („czary kosztują {N} mniej"). */
function putReducer(state, { spellTypes = [], amount = 1 } = {}) {
  addObject(state, {
    id: 'reducer', instanceId: 'i-reducer', cardId: 'x-reducer', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 2, keywords: [], subtypes: [],
    types: ['Artifact'], colors: [], cardName: 'Redukator',
    abilities: [Object.freeze({
      type: 'static', costModifier: Object.freeze({ spellTypes, amount }),
      cost: null, effect: null, trigger: null,
    })],
  });
}

function putSpellCard(state, id, { types, manaCost, extra = {} }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', zone: 'hand',
    kind: 'spell', manaCost, keywords: [], subtypes: [], types, colors: [],
    cardName: id, ...extra,
  });
  return state.objects.get(id);
}

test('reduceAlternativeCost: obniżka zjada część GENERYCZNĄ kosztu alternatywnego', () => {
  const state = newState();
  putReducer(state, { spellTypes: [], amount: 1 });
  const card = putSpellCard(state, 'czar', { types: ['Instant'], manaCost: 5 });
  // Flashback {3}{U}: całość 4, kolorowy pip 1 → obniżka {1} tnie generyk.
  assert.equal(reduceAlternativeCost(state, card, 4, ['U']), 3);
  // Koszt złożony z samych pipów kolorowych ({U}{U}) nie da się obniżyć.
  assert.equal(reduceAlternativeCost(state, card, 2, ['U', 'U']), 2);
  // Brak modyfikatora dla typu = brak obniżki.
  const state2 = newState();
  putReducer(state2, { spellTypes: ['Artifact'], amount: 1 });
  const nonArtifact = putSpellCard(state2, 'czar', { types: ['Instant'], manaCost: 5 });
  assert.equal(reduceAlternativeCost(state2, nonArtifact, 4, []), 4);
});

test('reduceAlternativeCost: modyfikator z filtrem typu łapie czar tego typu', () => {
  const state = newState();
  putReducer(state, { spellTypes: ['Artifact'], amount: 1 });
  const artifact = putSpellCard(state, 'artefakt', { types: ['Artifact'], manaCost: 5 });
  assert.equal(reduceAlternativeCost(state, artifact, 4, []), 3);
});

test('Etherium Sculptor: karta bez ograniczeń (obniżka działa też przy kosztach alternatywnych)', async () => {
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  assert.deepEqual(createCardRegistry().get('etherium-sculptor').support.limitations, []);
});

test('Escape: obniżka kosztu z permanentu tnie koszt ucieczki (pełna ścieżka rzutu)', async () => {
  const { execute, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { addMana } = await import('../src/engine/resources.js');
  const registry = createCardRegistry();
  const state = newState();
  putReducer(state, { spellTypes: [], amount: 1 });
  // Sweet Oblivion: Escape—{3}{U} (koszt 4) + wygnanie 4 innych kart z grobu.
  const def = registry.get('sweet-oblivion');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'obliv', instanceId: 'i-obliv', cardId: 'sweet-oblivion', controllerId: 'p1', zone: 'graveyard',
    kind: data.kind, manaCost: data.manaCost, spell: data.spell, abilities: [], keywords: [],
    subtypes: [], types: def.types, colors: data.colors ?? [], cardName: def.name,
  });
  for (const id of ['g1', 'g2', 'g3', 'g4']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-grob', controllerId: 'p1', zone: 'graveyard',
      kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [], cardName: 'Karta w grobie',
    });
  }
  // Dokładnie 3 many (koszt escape 4 → po obniżce 3): bez obniżki rzut byłby
  // nielegalny, więc sama OBECNOŚĆ oferty dowodzi, że obniżka zadziałała.
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_escape' && c.objectId === 'obliv');
  assert.ok(cast, 'escape za 3 many jest oferowany (koszt 4 − obniżka 1)');
  const result = execute(state, cast);
  assert.equal(result.ok, true, `rzut przyjęty: ${result.events?.[0]?.reason ?? ''}`);
  // M241: mana płacona przy DOMKNIĘCIU kosztu (pendingEscapeExile), nie przy deklaracji.
  assert.ok(state.pendingEscapeExile, 'koszt wygnania to kolejna decyzja (zgłoszenie J)');
  const candidates = state.pendingEscapeExile.candidateIds.slice(0, state.pendingEscapeExile.exileCount);
  const done = execute(state, { type: 'resolve_escape_exile', playerId: 'p1', exileIds: candidates });
  assert.equal(done.ok, true, `koszt przyjęty: ${done.events?.[0]?.reason ?? ''}`);
  const player = state.players.find((p) => p.id === 'p1');
  const left = Object.values(player.manaPool ?? {}).reduce((sum, n) => sum + n, 0);
  assert.equal(left, 0, 'zapłacono dokładnie 3 many (całą pulę), nie 4');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'sweet-oblivion'),
    'Sweet Oblivion na stosie po płatności');
});

test('Bestow i modal: obniżka też je obejmuje (CR 601.2f — koszt to koszt)', async () => {
  const { legalAuraCasts } = await import('../src/engine/resources.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { addMana } = await import('../src/engine/resources.js');
  const registry = createCardRegistry();
  const state = newState();
  putReducer(state, { spellTypes: [], amount: 1 });
  const def = registry.get('leafcrown-dryad'); // Bestow {4}{G}
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'dryad', instanceId: 'i-dryad', cardId: def.id, controllerId: 'p1', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types,
    colors: data.colors ?? [], cardName: def.name, bestow: def.bestow, aura: def.aura,
  });
  addObject(state, {
    id: 'host', instanceId: 'i-host', cardId: 'x-host', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: 'Gospodarz',
  });
  const bestowCost = def.bestow.cost;
  addMana(state, 'p1', bestowCost - 1, { colors: ['G'] });
  const casts = legalAuraCasts(state, 'p1').filter((c) => c.objectId === 'dryad' && c.bestow);
  assert.ok(casts.length > 0, `bestow za ${bestowCost - 1} many jest oferowany (koszt ${bestowCost} − 1)`);
});
