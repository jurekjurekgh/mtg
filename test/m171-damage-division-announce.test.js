// M171/Z6 (pętla jakości, oś CR): „divided as you choose" — podział
// OGŁASZA SIĘ przy umieszczaniu na stosie (CR 601.2d dla czarów,
// CR 603.3d dla zdolności triggerowanych), nie przy rozstrzyganiu.
// Dotychczas kwoty wybierał kontroler PO oknie odpowiedzi — znał reakcję
// przeciwnika przed deklaracją (przewaga informacyjna niezgodna z CR),
// a zabity w odpowiedzi cel pozwalał na cichą realokację obrażeń.
// CR 608.2b: cel nielegalny przy rozstrzyganiu NIE otrzymuje przydzielonych
// obrażeń i nie wolno ich przenieść na pozostałe cele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 172, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function castTitanAndPickTwoTargets(state) {
  putCard(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Tytana');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  assert.ok(state.pendingTriggerTargets?.[0], 'decyzja celów triggera otwarta');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe1', 'foe2'] }).ok);
}

test('Z6a: kwoty deklarowane przy UMIESZCZANIU triggera na stosie (CR 603.3d)', () => {
  const state = game('p1');
  putCard(state, 'foe1', 'highland-game', 'p2'); // 2/1
  putCard(state, 'foe2', 'segmented-krotiq', 'p2'); // 6/5
  castTitanAndPickTwoTargets(state);
  // Decyzja kwot otwiera się OD RAZU po wyborze celów — trigger wciąż na stosie.
  assert.ok(state.pendingDamageDivision, 'decyzja kwot natychmiast po wyborze celów');
  assert.ok(state.zones.stack.length > 0, 'trigger NIE został jeszcze rozstrzygnięty');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_damage_division' && JSON.stringify(c.amounts) === JSON.stringify([2, 1]));
  assert.ok(offer, 'oferta podziału 2+1');
  assert.ok(execute(state, offer).ok);
  // Po deklaracji kwot obrażenia NIE są jeszcze zadane (stos czeka na passy).
  assert.equal(state.objects.get('foe1').damage ?? 0, 0, 'przed rozstrzygnięciem brak obrażeń');
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  // 2 obrażenia zabijają 2/1; 1 obrażenie na 6/5.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'), '2/1 ginie (2)');
  assert.equal(state.objects.get('foe2').damage, 1, '6/5 dostaje 1');
});

test('Z6b: cel zabity W ODPOWIEDZI — jego kwota przepada, bez realokacji (CR 608.2b)', () => {
  const state = game('p1');
  putCard(state, 'foe1', 'highland-game', 'p2'); // 2/1 — dostanie 2
  putCard(state, 'foe2', 'segmented-krotiq', 'p2'); // 6/5 — dostanie 1
  castTitanAndPickTwoTargets(state);
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_damage_division' && JSON.stringify(c.amounts) === JSON.stringify([2, 1]));
  assert.ok(offer, 'oferta podziału 2+1');
  assert.ok(execute(state, offer).ok);
  // „Odpowiedź": foe1 znika z pola bitwy PRZED rozstrzygnięciem triggera.
  moveObjectDirectly(state, 'foe1', 'graveyard', 'grave-foe1');
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  // Kwota foe1 (2) przepada; foe2 dostaje DOKŁADNIE swoją 1 (nie 3).
  assert.equal(state.objects.get('foe2').damage, 1, 'bez realokacji na pozostały cel');
});

test('Z6c (strażnik, L52): czar z damage_divided wymaga ścieżki announce w castSpell', () => {
  // CR 601.2d: przy CZARZE podział też deklaruje się przy rzucaniu. Dziś
  // jedynym producentem damage_divided jest trigger (Inferno Titan) —
  // announce żyje w resolve_trigger_target. Pierwsza karta typu „Fireball
  // divided" (czar z efektem damage_divided) czerwieni ten test: dodaj
  // deklarację kwot w castSpell/castMadnessSpell i zaktualizuj strażnika.
  const offenders = [];
  for (const card of REGISTRY.all()) {
    const effects = [
      ...(card.spell?.effects ?? []),
      ...(card.spell?.modes ?? []).flatMap((m) => m.effects ?? []),
    ];
    if (effects.some((e) => e?.type === 'damage_divided')) offenders.push(card.id);
  }
  assert.deepEqual(offenders, [], 'czar z damage_divided bez ścieżki announce (CR 601.2d)');
});
