// H (zgłoszenie właściciela z gry 2026-10-29): „Karta Tiller of Flesh tworzy
// token Incubator. Po zapłaceniu Incubator zmienia się w token Phyrexian. Mimo
// to w grze w modalach do celowania ten permanent dalej nazywa się Incubator."
//
// Root cause (klasa L41): nazwa WIDOCZNA obiektu ma jedno źródło zależne od
// rodzaju — KARTA bierze ją z rejestru po `cardId` (`session.nameOf`), TOKEN
// i kopia niosą ją JAWNIE w `object.name` (M155), bo `cardId` tokenu jest poza
// rejestrem. Obie ścieżki zmiany twarzy (`transform` w miejscu oraz nowy
// obiekt: craft / powrót z wygnania / wejście nocną stroną) przepisywały
// `cardId` i `cardName`, ale NIE pole `name` — więc token po przemianie
// zachowywał nazwę strony opuszczanej i tak podpisywał się w kafelkach,
// modalach celowania i etykietach ofert.
//
// Fix jest generyczny (ADR 0002 — bez przypadków po nazwie/ID karty):
// `transformedDisplayName` (permanents.js) liczy nazwę nowej strony z
// deskryptora `transformTo` i jest wołany przez OBA buildery cech twarzy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { createBattlefieldToken, tokenNameFromCardId } from '../src/engine/tokens.js';
import { transformedCharacteristics, transformInPlaceFields } from '../src/engine/permanents.js';
import { commandLabel } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(seed = 429) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function tillerInPlay(state) {
  const def = REGISTRY.get('tiller-of-flesh');
  addObject(state, {
    id: 'tiller', instanceId: 'i-t', cardId: 'tiller-of-flesh',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes,
  });
  return state.objects.get('tiller');
}

/** Incubator na polu bitwy (mechanika `incubate`, nie ręcznie sklejony token). */
function incubatorInPlay(state) {
  const tiller = tillerInPlay(state);
  applyEffect(state, { type: 'incubate', amount: 2 }, tiller, []);
  return [...state.objects.values()].find((o) => o.cardId === 'token_incubator' && o.zone === 'battlefield');
}

/** Aktywacja `{2}: Transform` + rozstrzygnięcie stosu (bez asercji po drodze). */
function transformInPlace(state, token) {
  addMana(state, 'p1', 2, { colors: ['W'] });
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  assert.ok(offer, 'oferta „{2}: Transform" istnieje');
  const result = execute(state, offer);
  assert.ok(result.ok, `aktywacja przyjęta: ${JSON.stringify(result.events?.[0] ?? {})}`);
  for (let i = 0; i < 12; i += 1) {
    if (state.zones.stack.length === 0) break;
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  return state.objects.get(token.id);
}

/** Nazwy po stronie stołu — DOKŁADNIE ta reguła, co w sesji (session.js). */
const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? tokenNameFromCardId(cardId) ?? String(cardId);

test('H/1: po „{2}: Transform" token Incubator nazywa się Phyrexian w stanie silnika', () => {
  const state = game();
  const token = incubatorInPlay(state);
  assert.equal(token.name, 'Incubator', 'stan wyjściowy: token niesie nazwę strony przedniej');
  const after = transformInPlace(state, token);
  assert.equal(after.cardId, 'token_phyrexian', 'twarz się zmieniła');
  assert.equal(after.cardName, 'Phyrexian', 'cardName = nazwa nowej twarzy');
  assert.equal(after.name, 'Phyrexian', 'RED bez poprawki: „Incubator" — jawna nazwa tokenu nie szła za twarzą');
  assert.equal(after.kind, 'creature', 'strona tylna to artefaktowy stwór');
  assert.equal((after.counters ?? {})['+1/+1'], 2, 'liczniki zostają (CR 707.9)');
});

test('H/2: widok gracza (kafel + cele) niesie nową nazwę', () => {
  const state = game();
  const token = incubatorInPlay(state);
  const before = playerView(state, 'p1').zones.battlefield.find((o) => o.id === token.id);
  assert.equal(before.name, 'Incubator', 'przed przemianą kafel podpisany „Incubator"');
  transformInPlace(state, token);
  const view = playerView(state, 'p1');
  const after = view.zones.battlefield.find((o) => o.id === token.id);
  assert.equal(after.cardId, 'token_phyrexian');
  assert.equal(after.name, 'Phyrexian', 'unikalne źródło nazwy tokenu w widoku to `name`');
  assert.equal(after.isToken, true, 'to wciąż token');
});

test('H/3: etykiety ofert (modal celowania) używają nowej nazwy', () => {
  const state = game();
  const token = incubatorInPlay(state);
  // Przed przemianą: cel = Incubator (kontrola, że etykieta w ogóle czyta nazwę tokenu).
  const spellInHand = addObject(state, {
    id: 'spell1', instanceId: 'i-s1', cardId: 'glaring-aegis',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(REGISTRY.get('glaring-aegis')),
  });
  const before = playerView(state, 'p1');
  const session = { nameOf, nameOfObject: (id) => id === token.id ? token.name : nameOf(null) };
  const labelBefore = String(commandLabel({
    type: 'cast_spell', playerId: 'p1', objectId: spellInHand.id, targets: [token.id],
  }, session, before)).replace(/<[^>]+>/g, '');
  assert.match(labelBefore, /Incubator/, `etykieta przed przemianą: ${labelBefore}`);

  transformInPlace(state, token);
  const after = playerView(state, 'p1');
  const labelAfter = String(commandLabel({
    type: 'cast_spell', playerId: 'p1', objectId: spellInHand.id, targets: [token.id],
  }, session, after)).replace(/<[^>]+>/g, '');
  assert.match(labelAfter, /Phyrexian/, `RED bez poprawki: „Incubator" w etykiecie celu — było: ${labelAfter}`);
  assert.ok(!/Incubator/.test(labelAfter), `stara nazwa nie może zostać w etykiecie: ${labelAfter}`);
});

test('H/4: linia logu nazywa obie strony przemiany', () => {
  const state = game();
  const token = incubatorInPlay(state);
  state.events.length = 0;
  transformInPlace(state, token);
  const event = state.events.find((e) => e.type === 'object_transformed');
  assert.ok(event, 'zdarzenie transformacji istnieje');
  const line = describeGameEvent(event, { nameOf, nameOfObject: () => '?' }, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.match(line, /Incubator/, `strona opuszczana nazwana: ${line}`);
  assert.match(line, /Phyrexian/, `strona nowa nazwana: ${line}`);
});

test('H/5: reguła jest generyczna — dowolny token z jawną nazwą idzie za twarzą', () => {
  const state = game();
  const token = createBattlefieldToken(state, 'p1', {
    cardId: 'token_probe_a', name: 'Probe A', kind: 'artifact',
    types: ['Artifact', 'Token'], subtypes: [], colors: [],
    transformTo: {
      cardId: 'token_probe_b', cardName: 'Probe B', kind: 'creature',
      power: 0, toughness: 0, types: ['Artifact', 'Creature', 'Token'],
      subtypes: [], keywords: [], abilities: [],
    },
  });
  applyEffect(state, { type: 'transform' }, token, []);
  const after = state.objects.get(token.id);
  assert.equal(after.cardId, 'token_probe_b', 'twarz condition: nowa strona');
  assert.equal(after.name, 'Probe B', 'nazwa z deskryptora nowej strony, bez listy kart w kodzie');
});

test('H/6: karty (bez jawnej nazwy) nie dostają pola `name` — brak regresji', () => {
  // Karta nazwę bierze z rejestru po `cardId`; dopisanie jej do obiektu
  // rozjechałoby numerację kopii i porównania nazw w efektach.
  const cardSide = { cardId: 'jill-shivas-dominant', cardName: "Jill, Shiva's Dominant", power: 2, toughness: 2, types: ['Creature'], subtypes: ['Human'], abilities: [] };
  const backSide = { cardId: 'shiva-warden-of-ice', cardName: 'Shiva, Warden of Ice', power: 4, toughness: 5, types: ['Enchantment', 'Creature'], subtypes: ['Saga', 'Elemental'], abilities: [] };
  const newObject = transformedCharacteristics(backSide, cardSide);
  assert.equal('name' in newObject, false, 'nowy obiekt karty: bez pola `name`');
  const inPlace = transformInPlaceFields(cardSide, backSide);
  assert.equal('name' in inPlace.fields, false, 'transform w miejscu karty: bez pola `name`');
  // Token-kopia niesie nazwę jawnie → nowa strona ją przepisuje.
  const copied = transformedCharacteristics(backSide, { ...cardSide, name: 'Skopiowana' });
  assert.equal(copied.name, 'Shiva, Warden of Ice', 'kopia: nazwa nowej twarzy z payloadu');
});
