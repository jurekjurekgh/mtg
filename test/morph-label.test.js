// M158 — zgłoszenie właściciela A: w „Rozgrywce" odkrycie morpha pokazywało
// „Nieprzyfaciel aktywuje zdolność: Woolly Loxodon" BEZ nazwy zdolności.
// Root cause: event ability_activated nie niósł pola `keyword`, a etykieta
// nie miała gałęzi morph/megamorph (efekt odkrycia jest bezdeskryptorowy —
// effectTypes puste, desc pusty).
//
// Fix: `keyword` w obu ścieżkach eventów (performActivation natychmiastowa —
// morph/mana; queueActivatedAbilityToStack na stos) + gałąź etykiety.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

test('A: odkrycie morpha nazywa zdolność — log „aktywuje Morph: …"', () => {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  // M197/K3: seed 20 -> 22. Plany 8 kart zsynchronizowane z arkuszem kolekcji
  // (m.in. warhammer +Lab Rats +Reassembling Skeleton), wiec tasowanie sie
  // przesunelo i seed 20 nie dawal juz morpha — przelosowane hunterem (L25).
  const session = createSession({ seed: 22, registry: REGISTRY, decks });
  const state = session.state;
  // Goły stan do testu: domknij startowe decyzje sesji (mulligany) i ustaw
  // turę bota na main — w testach jednostkowych robimy to wprost.
  state.pendingMulligans = [];
  state.pendingMulliganBottom = null;
  state.turn = jumpToStep(state.turn, 'main', BOT_ID);
  state.turn.activePlayerId = BOT_ID;
  state.turn.priorityPlayerId = BOT_ID;


  const def = REGISTRY.get('woolly-loxodon');

  addObject(state, {
    id: 'loxy', instanceId: 'i-loxy', cardId: 'woolly-loxodon', controllerId: BOT_ID, ownerId: BOT_ID,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [],
    subtypes: def.subtypes ?? [],
  });
  // Stan jak po zagrywce twarzą w dół: faceDown + zwrócone cechy 2/2 +
  // wstrzyknięta zdolność obrotu (faceDownAbilities w resources.js robi to
  // przy rzucie faceDown; tutaj odtwarzamy stan docelowy bez rzutu).
  const flipAbility = Object.freeze({
    type: 'activated', keyword: 'morph',
    cost: Object.freeze({ mana: def.morph.morphCost, colors: [...(def.morph.colors ?? [])] }),
    effect: Object.freeze({ type: 'turn_face_up' }),
    trigger: null,
  });
  state.objects.set('loxy', Object.freeze({
    ...state.objects.get('loxy'),
    faceDown: true, tapped: false, summoningSickness: false,
    power: 2, toughness: 2,
    abilities: Object.freeze([flipAbility]),
  }));

  addMana(state, BOT_ID, 10, { colors: ['G'] });
  const offer = playerView(state, BOT_ID).legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'loxy');
  assert.ok(offer, 'oferta odkrycia morpha');
  const r = session.apply(offer);
  assert.ok(r.ok, r.reason ?? 'odrzucone');

  const ev = state.events.slice().reverse().find((e) => e.type === 'ability_activated');
  assert.ok(ev, 'event aktywacji');
  assert.equal(ev.keyword, 'morph', 'keyword w zdarzeniu');
  assert.equal(state.objects.get('loxy').faceDown, false, 'odkryty');

  const text = session.log.map((entry) => entry.text).join('\n');
  assert.match(text, /aktywuje Morph: Woolly Loxodon/, `log nazywa zdolność: ${text.slice(-300)}`);
  assert.match(text, /zostaje obrócony twarzą do góry/, 'sąsiednia linia opisuje obrót');
});
