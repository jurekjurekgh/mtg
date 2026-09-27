import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { markDamage, replaceObject } from '../src/engine/permanents.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { destroyPermanents } from '../src/engine/destruction.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

/**
 * Pętla jakości 2026-09-25g (polowanie L11 na Kumano's Blessing, Batch 59):
 * „If a creature dealt damage by enchanted creature this turn would die,
 * exile it instead" — efekt zastępczy stosuje się też do TOKENU-stwora
 * (CR 700.4: dies = grób z pola bitwy; CR 614/616: replacement zmienia
 * zdarzenie PRZED jego zajściem), a token w exile przestaje istnieć
 * w następnym SBA (CR 704.5d) — bez triggerów „dies".
 *
 * Sonda headless (por. /tmp/sonda-kumano-token.mjs z sesji): token 1/1 po
 * obrażeniach od zaczarowanego dealera idzie do exile z odznaką
 * `meta.exiledBy = kumanos-blessing`, SBA emituje `token_ceased_to_exist`
 * i czyści obiekt oraz indeks strefy. Oba testy pinują tę drogę (L39:
 * przegląd profilaktyczny wychodzi z testem, nie z pustymi rękami).
 */

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, playerId, zone = 'battlefield') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
}

test('Kumano + token: ofiara-token idzie na WYGNANIE z odznaką, potem przestaje istnieć (CR 614 + 704.5d)', () => {
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1');
  put(state, 'aura', 'kumanos-blessing', 'p1');
  replaceObject(state, state.objects.get('aura'), { kind: 'aura', attachedTo: 'dealer' });
  const token = createBattlefieldToken(state, 'p2', {
    cardId: 'phyrexian-mite-token', name: 'Phyrexian Mite', power: 1, toughness: 1,
  });
  markDamage(state, token.id, 1, 'dealer');
  destroyPermanents(state, [token.id]);
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'phyrexian-mite-token');
  assert.ok(exiled, 'token po zastąpionej śmierci istnieje w exile (dopiero SBA go czyści)');
  assert.equal(exiled.zone, 'exile', 'replacement Kumano stosuje się do tokenu-stwora (CR 614)');
  assert.equal(exiled.meta?.exiledBy, 'kumanos-blessing', 'odznaka źródła (M262)');
  assert.ok(state.zones.exile.includes(exiled.id), 'indeks exile niesie token');
  assert.ok(!state.zones.graveyard.includes(exiled.id), 'token nie dotyka grobu (dies nie nastąpiło)');
  const sba = runStateBasedActions(state).map((e) => e.type);
  assert.ok(sba.includes('token_ceased_to_exist'), 'SBA: token w exile przestaje istnieć (CR 704.5d)');
  assert.ok(!state.objects.has(exiled.id), 'obiekt usunięty');
  assert.ok(!state.zones.exile.includes(exiled.id), 'indeks exile czysty');
});

test('Kumano + token: bez aury ten sam token idzie do GROBU (kontrola — test 1 mierzy Kumano)', () => {
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1');
  const token = createBattlefieldToken(state, 'p2', {
    cardId: 'phyrexian-mite-token', name: 'Phyrexian Mite', power: 1, toughness: 1,
  });
  markDamage(state, token.id, 1, 'dealer');
  destroyPermanents(state, [token.id]);
  const grave = [...state.objects.values()].find((o) => o.cardId === 'phyrexian-mite-token');
  assert.ok(grave, 'token po śmierci istnieje w grobie (dopiero SBA go czyści)');
  assert.equal(grave.zone, 'graveyard', 'bez aury brak replacementu — zwykła śmierć');
  runStateBasedActions(state);
  assert.ok(!state.objects.has(grave.id), 'SBA czyści token także z grobu (CR 704.5d)');
});
