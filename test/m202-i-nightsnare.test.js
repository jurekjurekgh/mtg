// M202/I — zgłoszenie właściciela:
//
//   „Karta Nightsnare. Bot rzuca ten czar. Bot wybrał jakąś bezsensowną kartę
//    z mojej ręki do wyrzucenia - miałem dużo lepsze. Jeśli to jest trudne,
//    żeby wybrać jedną kartę i robi to losowo to lepiej niech wybierze drugą
//    opcję tego czaru, czyli ja wybieram sam 2 karty do wyrzucenia zamiast
//    jednej wybranej przez niego.”
//
// Przyczyna: bot nie miał ŻADNEJ wyceny `resolve_discard_choice`, więc wszystkie
// warianty remisowały i brał pierwszą ofertę z listy (klasa L51: decyzja bez
// klasyfikacji → remis → pierwsza oferta). Oracle Nightsnare: „You may choose
// a nonland card from it. If you do, that player discards that card. If you
// don't, that player discards two cards.” — dwie karty odrzucone bez wyboru są
// warte więcej niż jedna wybrana na chybił trafił.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

/** Stan z aktywną decyzją Nightsnare: bot wybiera z odsłoniętej ręki wroga. */
function setup() {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, number: 4, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const put = (id, cardId, controllerId, zone = 'hand') => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
  };
  // ręka przeciwnika (odsłonięta przez Nightsnare)
  put('h1', 'hill-giant', 'p2');
  put('h2', 'goblin-piker', 'p2');
  put('h3', 'basic-forest', 'p2');
  // decyzja: bot (p1) wybiera kartę z ręki p2 albo rezygnuje (wtedy p2 odrzuca 2)
  state.pendingDiscardChoice = {
    playerId: 'p1', chooserId: 'p1', count: 1, handIds: ['h1', 'h2', 'h3'],
    allowDecline: true, declineAmount: 2, purpose: 'effect', sourceCardId: 'nightsnare',
  };
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('M202/I: przy odsłoniętej ręce wroga bot wybiera rezygnację (wróg odrzuca 2 karty)', () => {
  const state = setup();
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.length >= 2, `oczekiwano wariantów wyboru i rezygnacji, jest: ${JSON.stringify(offers)}`);
  assert.ok(offers.some((c) => c.cardId == null), 'oferta rezygnacji musi istnieć (CR: „You may choose”)');
  const cmd = createHeuristicBot({ seed: 23 }).chooseCommand(view, { simulate: null });
  assert.equal(cmd?.type, 'resolve_discard_choice', `bot wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.cardId, null,
    'jedna karta wybrana na chybił trafił jest warta mniej niż dwie odrzucone bez wyboru');
});

test('M202/I (anty-over-fix): przy WŁASNEJ ręce (koszt) bot woli oddać najtańszą kartę', () => {
  const state = setup();
  // ta sama decyzja, ale dotycząca MOJEJ ręki (np. koszt odrzucenia)
  state.pendingDiscardChoice = { ...state.pendingDiscardChoice, handIds: ['m1', 'm2'], allowDecline: false };
  const put = (id, cardId) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
  };
  put('m1', 'goblin-piker');   // tani
  put('m2', 'inferno-titan');  // drogi
  const view = playerView(state, 'p1');
  const cmd = createHeuristicBot({ seed: 29 }).chooseCommand(view, { simulate: null });
  assert.equal(cmd?.type, 'resolve_discard_choice', `bot wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.cardId, 'm1', 'jako koszt oddaję najtańszą kartę, nie najdroższą');
});
