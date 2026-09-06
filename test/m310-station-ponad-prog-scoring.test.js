// M310 (sesja arena/01a07711, decyzja właściciela): Station PONAD PRÓG w
// scoringu bota — pompowanie charge powyżej poziomu aktywacji jest legalne
// (CR: Station bez górnej granicy), ale BEZSENSOWNE: marnuje tapnięcie
// stworów, a poziom nic nie daje (ostatni próg = najwyższy poziom).
//
// Stan na moment zgłoszenia: gałąź `charge >= threshold → −15` w
// `scoreCommand` (kontynuacja M120/M153/A2) istniała, ale NIE miała pinu
// testowego (klasa L13 — mutacja usuwająca karę byłaby zielona). Ten plik
// jest strażnikiem behawioralnym tej kary:
//  - para graniczna na tym samym deskryptorze (Gunship, próg 6):
//    charge 5 → bot JESZCZE buduje; charge 6 → bot PRZESTAJE (niżej passu);
//  - próg czytany z DESKRYPTORA karty (ADR 0002), nie ze stałej: Rammer
//    (próg 9) na charge 6 dalej buduje, Gunship (próg 6) na tym samym
//    charge 6 — nie.
// Mutacje weryfikujące pin (zmierzone w tej sesji): usunięcie/kara dodatnia
// → T1 i T2b RED; stała „6” zamiast deskryptora → T3 RED.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState(phase = 'postcombat_main', active = 'p1') {
  const state = createGameState({ seed: 310, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  state.turn.phase = phase;
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, ctrl, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone: 'battlefield',
    kind: extra.kind ?? data.kind, power: extra.power ?? data.power,
    toughness: extra.toughness ?? data.toughness, manaCost: extra.manaCost ?? data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: extra.types ?? def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, station: def.station,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Statek na charge `charge` + dwa stwory do kosztu tap-another, puste ręce. */
function stationBoard(shipCardId, charge) {
  const state = newState();
  put(state, 'ship', shipCardId, 'p1');
  put(state, 'sold', 'token_soldier', 'p1', { kind: 'creature', power: 2, toughness: 2 });
  put(state, 'robo', 'token_robot', 'p1', { kind: 'creature', power: 2, toughness: 2 });
  if (charge > 0) addCounter(state, 'ship', 'charge', charge);
  return playerView(state, 'p1');
}

const jestOfertaStation = (view, objectId) => view.legalCommands
  .some((c) => c.type === 'activate_ability' && c.objectId === objectId);

test('M310/1 (granica od dołu): Gunship na charge 5 < próg 6 — bot JESZCZE buduje w Głównej 2', () => {
  const view = stationBoard('warmaker-gunship', 5);
  assert.ok(jestOfertaStation(view, 'ship'), 'aktywacja Station legalna (CR: bez górnej granicy oferty)');
  const bot = createHeuristicBot({ seed: 310 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.objectId, 'ship',
    `pod progiem bot ma budować statek w Głównej 2: ${JSON.stringify(chosen)}`);
});

test('M310/2 (pin kary): Gunship na charge 6 = próg — aktywacja PONAD poziom jest niżej passu', () => {
  const view = stationBoard('warmaker-gunship', 6);
  assert.ok(jestOfertaStation(view, 'ship'), 'aktywacja ponad próg jest LEGALNA — oferta zostaje');
  const bot = createHeuristicBot({ seed: 310 });
  const chosen = bot.chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'ship'),
    `bot pompował Station PONAD próg (marnotrawstwo tapnięcia): ${JSON.stringify(chosen)}`);
});

test('M310/3 (próg z deskryptora, ADR 0002): Rammer na charge 6 (próg 9) dalej buduje', () => {
  const view = stationBoard('wedgelight-rammer', 6);
  assert.ok(jestOfertaStation(view, 'ship'));
  const bot = createHeuristicBot({ seed: 310 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.objectId, 'ship',
    `ten sam charge 6, ale Rammer ma próg 9 — budowa trwa: ${JSON.stringify(chosen)}`);
});
