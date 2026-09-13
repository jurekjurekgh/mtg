// Jeskai Devotee ({1}: Add {U},{R},{W} — once per turn): źródło kosztowe
// BEZ {T}, ale ograniczone (nie „re-używalne” — budżet once-per-turn).
// Oferta i auto-tap liczą je jak kosztowe; ewidencja wspólna z manualną.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { spendMana, addMana, producibleMana, fundableCostedSources } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function mapsSum(player) {
  return Object.values(player.manaPool ?? {}).reduce((a, b) => a + b, 0)
    + Object.values(player.restrictedPool ?? {}).reduce((a, b) => a + b, 0);
}

test('D/0: Wyspa + Devotee → Soulmender {W} oferowany i płaci (Devotee nietapnięty)', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'jd', 'jeskai-devotee', 'p1');
  putCard(state, 'sm', 'soulmender', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_permanent' && c.objectId === 'sm');
  assert.ok(offer, 'oferta istnieje (Wyspa funduje {1}, Devotee daje {W})');
  const result = execute(state, { ...offer });
  assert.equal(result.ok, true, 'płatność przechodzi');
  assert.equal(state.objects.get('jd').tapped ?? false, false, 'Devotee NIETAPNIĘTY (blokuje!)');
  assert.equal(state.abilityActivatedThisTurn?.['jd:1'], true, 'budżet once-per-turn zużyty (ten sam klucz co manual)');
  const sm = [...state.objects.values()].find((o) => o.cardId === 'soulmender');
  assert.ok(sm && sm.zone !== 'hand', 'Soulmender rzucony');
});

test('D/1: budżet jednorazowy — druga płatność {W} w turze bez Devotee pada', () => {
  const state = game('p1');
  putCard(state, 'i1', 'basic-island', 'p1');
  putCard(state, 'i2', 'basic-island', 'p1');
  putCard(state, 'jd', 'jeskai-devotee', 'p1');
  spendMana(state, 'p1', 1, [['W']], {});
  assert.equal(state.abilityActivatedThisTurn?.['jd:1'], true, 'pierwsza płatność zużyła Devotee');
  assert.deepEqual(fundableCostedSources(state, 'p1', [['W']], null, {}), [], 'bramka go już nie widzi');
  assert.throws(() => spendMana(state, 'p1', 1, [['W']], {}), /Brak kolorowej many/,
    'druga {W} nie do zapłaty (druga Wyspa daje {U}, Devotee zużyty)');
});

test('D/2: chory Devotee DZIAŁA (koszt bez {T} — CR 302.6, jak w manualnej)', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'jd', 'jeskai-devotee', 'p1');
  state.objects.set('jd', Object.freeze({ ...state.objects.get('jd'), summoningSickness: true }));
  putCard(state, 'sm', 'soulmender', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_permanent' && c.objectId === 'sm');
  assert.ok(offer, 'oferta istnieje mimo choroby');
  assert.equal(execute(state, { ...offer }).ok, true, 'płatność przechodzi');
});

test('D/3: kontrola — chory Apprentice ({U},{T}) WYKLUCZONY (choroba + {T})', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  state.objects.set('ap', Object.freeze({ ...state.objects.get('ap'), summoningSickness: true }));
  assert.deepEqual(fundableCostedSources(state, 'p1', [], null, {}), [], 'chory {T}-kosztowy poza bramką');
  assert.equal(producibleMana(state, 'p1', null, {}, []), 1, 'tylko Wyspa');
});

test('D/4: łańcuch Devotee→Devotee (Wyspa + Plains, płatność {R}{W})', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'p', 'basic-plains', 'p1');
  putCard(state, 'd1', 'jeskai-devotee', 'p1');
  putCard(state, 'd2', 'jeskai-devotee', 'p1');
  spendMana(state, 'p1', 2, [['R'], ['W']], {});
  const player = state.players.find((pl) => pl.id === 'p1');
  assert.equal(player.mana, mapsSum(player), 'M201: licznik = suma map');
  assert.equal(state.abilityActivatedThisTurn?.['d1:1'], true, 'pierwszy zużyty');
  assert.equal(state.abilityActivatedThisTurn?.['d2:1'], true, 'drugi zużyty');
  assert.equal(state.objects.get('d1').tapped ?? false, false, 'oba nietapnięte');
  assert.equal(state.objects.get('d2').tapped ?? false, false, 'oba nietapnięte');
});

test('D/5: manualne zużycie wycofuje Devotee z oferty (wspólny budżet, L48)', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'jd', 'jeskai-devotee', 'p1');
  putCard(state, 'sm', 'soulmender', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const manual = (view.legalCommands ?? []).find((c) => c.type === 'activate_ability' && c.objectId === 'jd');
  assert.ok(manual, 'manualna aktywacja oferowana');
  assert.equal(execute(state, { ...manual }).ok, true, 'manualna aktywacja płaci (Wyspa tapnięta auto)');
  // Pula ma profil [U,R,W] (nie {W} na sztywno — kreator/wybór odkłada kolor).
  assert.deepEqual(fundableCostedSources(state, 'p1', [['W']], null, {}), [], 'po manualu auto go nie widzi');
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'sm');
  assert.ok(offer, 'Soulmender nadal rzucalny (mana z manualnej aktywacji w puli)');
});
