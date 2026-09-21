import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// M360/Srebro B5 (FAQ Betrayers of Kamigawa 2005-02-20, cyt. za
// mtg.wiki/Ninjutsu, pobrane 2026-09-16): „The ninjutsu ability can be
// activated during the declare blockers, combat damage, or end of combat
// steps if you have an unblocked attacking creature." Silnik oferował
// ninjutsu TYLKO w combat_damage (abilities.js ninjutsuWindow +
// activateNinjutsu) — po obrażeniach combat znikał i okno end_of_combat
// nie istniało. (Okno declare_blockers celowo złączone z combat_damage
// przez M172/C — tu tylko end_of_combat.)

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], colors: def.colors ?? [],
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  return state.objects.get(id);
}

// Pełna walka: sarge atakuje, bloki wg assignments, obrażenia rozstrzygnięte.
// Zwraca stan w end_of_combat (priorytet: p1).
function fightToEoc(assignments) {
  const state = createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'hand');
  if (Object.values(assignments).flat().length > 0) {
    putCard(state, 'blk', 'skinbrand-goblin', 'p2', 'battlefield');
  }
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['sarge'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const resolve = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_combat');
  assert.ok(resolve, 'oferta resolve_combat');
  assert.ok(execute(state, resolve).ok, 'obrażenia rozstrzygnięte');
  // Uwaga: sarge ma first strike — zwykły przebieg po drugim resolve (M360 B3).
  if (state.pendingCombatSecondPass) {
    const second = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_combat');
    assert.ok(second, 'oferta drugiego resolve_combat');
    assert.ok(execute(state, second).ok, 'drugi resolve');
  }
  assert.equal(state.turn.step, 'end_of_combat', 'walka skończona');
  return state;
}

function ninjutsuOffers(state, by = 'p1') {
  return playerView(state, by).legalCommands.filter((c) => c.type === 'activate_ability'
    && (c.attackerId || state.objects.get(c.objectId)?.cardId === 'kappa-tech-wrecker'));
}

test('M360/B5a: ninjutsu po obrażeniach (end_of_combat) — ninja wchodzi, atakujący wraca', () => {
  const state = fightToEoc({}); // sarge niezablokowany, przeżył, zadał 2
  assert.equal(state.players[1].life, 18, 'sarge zadał obrażenia przed ninjutsu');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const offers = ninjutsuOffers(state);
  assert.equal(offers.length, 1, 'oferta ninjutsu w end_of_combat');
  assert.equal(offers[0].attackerId, 'sarge', 'zwracany: niezablokowany atakujący');
  assert.ok(execute(state, offers[0]).ok, 'aktywacja');
  // Ruch strefy rename'uje obiekt (hand-N) — szukamy po karcie.
  const returned = state.zones.hand.map((id) => state.objects.get(id))
    .find((o) => o?.cardId === 'akroan-sergeant');
  assert.ok(returned, 'koszt: sarge wraca do ręki');
  assert.equal(state.zones.stack.length, 1, 'zdolność na stosie');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const ninja = state.zones.battlefield.map((id) => state.objects.get(id))
    .find((o) => o?.cardId === 'kappa-tech-wrecker');
  assert.ok(ninja, 'ninja na polu bitwy');
  assert.equal(ninja.tapped, true, 'ninja wchodzi tapnięty');
  assert.equal(ninja.counters?.deathtouch, 1, 'ETB: licznik deathtouch');
});

test('M360/B5b (pin): zablokowany atakujący nie wraca (end_of_combat)', () => {
  const state = fightToEoc({ sarge: ['blk'] }); // sarge zablokowany, obaj przeżyli (2/2 vs 2/1? blk ginie)
  addMana(state, 'p1', 2, { colors: ['G'] });
  const offers = ninjutsuOffers(state);
  assert.ok(!offers.some((o) => o.attackerId === 'sarge'), 'brak oferty dla zablokowanego');
});

test('M360/B5c (strażnik): bez walki w turze brak oferty (stary snapshot nie liczy się)', () => {
  const state = createGameState({ seed: 18, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  // Sztucznie podkładamy STARY snapshot (z poprzedniej tury).
  state.lastCombat = {
    turn: state.turn.number - 1, attackingPlayerId: 'p1',
    attackers: ['sarge'], blocked: [],
  };
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  assert.equal(ninjutsuOffers(state).length, 0, 'snapshot ze starej tury nie otwiera okna');
});
