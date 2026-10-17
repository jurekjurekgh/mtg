// Uwaga J z gry (właściciel, 2026-10-15, tura 11): Azorius Justiciar — „detain up
// to two target creatures your opponents control”. Właściciel: „Modal wyboru to
// ZABRONIONY modal ze wszystkimi permutacjami. Jedynym dozwolonym rodzajem modala
// wielocelowego jest wybór wielu i zatwierdzenie!!!!!”
//
// Przyczyna (odczyt kodu + sonda silnika): `upToTargetsPlanOf` zwracał `null`,
// gdy kandydatów było ≤ maxTargets (np. dwóch przeciwników przy „up to two”) albo
// gdy największy wariant miał 1 cel. Wtedy panel dostawał zwykłą listę
// podzbiorów `[c1,c2] [c1] [c2] []` jako przyciski — dokładnie zakazany modal.
// Brak ptaszków przy 2 kandydatach = brak wyboru „0, 1 albo 2”.
//
// Kontrakt po: dla KAŻDEJ liczby kandydatów 1–4 oferta „up to two” to JEDEN plan
// wyboru wielu (ptaszki + Zatwierdź), a nie lista podzbiorów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { upToTargetsPlanOf } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();

function stol(foes) {
  const state = createGameState({ seed: 2310, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, zone, playerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
      keywords: def.keywords ?? [], spell: def.spell,
    });
  };
  for (let i = 0; i < 4; i += 1) put(`plains${i}`, 'basic-plains', 'battlefield');
  for (let i = 0; i < foes; i += 1) put(`foe${i}`, 'goblin-piker', 'battlefield', 'p2');
  for (let i = 0; i < 6; i += 1) put(`lib${i}`, 'basic-swamp', 'library');
  put('justiciar', 'azorius-justiciar', 'hand');
  return state;
}

/** Rzuca Justiciera i doprowadza do decyzji triggera (jak w B1). */
function opcjeTriggera(foes) {
  const state = stol(foes);
  addMana(state, 'p1', 4, { colors: ['W'] });
  const view0 = playerView(state, 'p1');
  const cast = view0.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'justiciar');
  assert.ok(cast, 'setup: oferta rzutu Azorius Justiciar');
  execute(state, cast);
  for (let i = 0; i < 10 && !state.pendingTriggerTargets?.length && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const view = playerView(state, 'p1');
  return view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
}

for (const foes of [1, 2, 3, 4]) {
  test(`J/${foes}: „up to two” z ${foes} kandydatami → jeden plan wyboru wielu, nie lista podzbiorów`, () => {
    const opcje = opcjeTriggera(foes);
    assert.ok(opcje.length >= 2, `silnik oferuje warianty (jest ${opcje.length})`);
    const plan = upToTargetsPlanOf(opcje);
    assert.ok(plan, `plan wyboru wielu dla ${foes} kandydatów (ptaszki + Zatwierdź)`);
    assert.equal(plan.targets.length, foes, 'wiersze = kandydaci, nie kombinacje');
    assert.equal(plan.minTargets, 0, '„up to” pozwala na zero celów');
    assert.ok(plan.maxTargets <= 2 && plan.maxTargets >= 1, `walidacja górna ≤ 2 (jest ${plan.maxTargets})`);
  });
}
