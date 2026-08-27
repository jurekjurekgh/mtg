// M158 — zgłoszenie właściciela A: w „Rozgrywce" odkrycie morpha pokazywało
// „Nieprzyjaciel aktywuje zdolność: Woolly Loxodon" BEZ nazwy zdolności.
// Root cause: event ability_activated nie niósł pola `keyword`, a etykieta
// nie miała gałęzi morph/megamorph (efekt odkrycia jest bezdeskryptorowy).
// Fix: `keyword` w obu ścieżkach eventów + gałąź etykiety.
//
// M238 (rewizja testów): plik był oparty na createSession({seed}) — mimo
// ręcznego wstawienia morpha, apply() szło przez pipeline sesji zależny od
// seeda (przy innym seedzie brak eventu ability_activated). Przepisane
// DETERMINISTYCZNIE: stan z createGameState, obrót przez engine execute,
// a etykieta przez describeGameEvent (ten sam czytelnik co session.log).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Bot' };
const describe = (e) => describeGameEvent(e, {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => REGISTRY.get(id)?.name ?? String(id),
  isPlayer: (id) => id === 'p1' || id === 'p2',
}, NAMES, { drugaOsoba: false });

test('A: odkrycie morpha nazywa zdolność — event i etykieta „aktywuje Morph: …"', () => {
  const state = createGameState({ seed: 158, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';

  const def = REGISTRY.get('woolly-loxodon');
  addObject(state, {
    id: 'loxy', instanceId: 'i-loxy', cardId: 'woolly-loxodon', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [],
    subtypes: def.subtypes ?? [],
  });
  // Stan jak po zagrywce twarzą w dół: 2/2, wstrzyknięta zdolność obrotu.
  const flipAbility = Object.freeze({
    type: 'activated', keyword: 'morph',
    cost: Object.freeze({ mana: def.morph.morphCost, colors: [...(def.morph.colors ?? [])] }),
    effect: Object.freeze({ type: 'turn_face_up' }),
    trigger: null,
  });
  state.objects.set('loxy', Object.freeze({
    ...state.objects.get('loxy'),
    faceDown: true, tapped: false, summoningSickness: false,
    power: 2, toughness: 2, abilities: Object.freeze([flipAbility]),
  }));
  addMana(state, 'p2', 10, { colors: ['G'] });

  const offer = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'loxy');
  assert.ok(offer, 'oferta odkrycia morpha');
  const result = execute(state, { ...offer, playerId: 'p2' });
  assert.ok(result.ok, result.events?.[0]?.reason ?? 'odrzucone');

  const ev = state.events.slice().reverse().find((e) => e.type === 'ability_activated');
  assert.ok(ev, 'event aktywacji');
  assert.equal(ev.keyword, 'morph', 'keyword „morph" w zdarzeniu (root cause fix)');
  assert.equal(state.objects.get('loxy').faceDown, false, 'stwór odkryty');

  // Etykieta z tego samego czytelnika co session.log.
  const texts = state.events.map((e) => describe(e)).filter((t) => typeof t === 'string');
  const joined = texts.join('\n');
  assert.match(joined, /aktywuje Morph: Woolly Loxodon/, `log nazywa zdolność: ${joined.slice(-200)}`);
  assert.match(joined, /zostaje obrócony twarzą do góry/, 'sąsiednia linia opisuje obrót');
});
