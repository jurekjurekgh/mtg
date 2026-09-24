// Uwaga F1 z gry (właściciel, 2026-09-23c): „upkeep Veiled Ascension (»you may
// cloak«) = opcja w »Twoje działania«; klik = wykonaj, »Dalej (Pass)« = odmowa;
// bez modala".
//
// Stan przed: silnik oferował DWA warianty `resolve_optional_trigger_choice`
// (fire true/false), a panel składał je w MODAL „command" (żadna z tych opcji
// nie była rozpoznana jako rezygnacja przez `isDeclineOption`), więc decyzja
// „you may" wymagała wejścia w okno i kliknięcia „Zrezygnuj z efektu".
//
// Kontrakt po:
//   1) oferta wykonania stoi w panelu jako ZWYKŁA akcja (etykieta nazywa kartę
//      i efekt — M221/B), BEZ modala;
//   2) odmową jest ZWYKŁY `pass_priority` (przycisk „Dalej (Pass)", pierwszy w
//      panelu — reguła E z tej samej sesji); silnik przyjmuje go jako
//      rozstrzygnięcie decyzji z `fired: false`;
//   3) pierwsza oferta `legalCommands` to nadal WYKONANIE — boty i replaye
//      („pierwsza oferta = dotychczasowe zachowanie") nie mogą zacząć
//      odmawiać po cichu;
//   4) stary kształt `fire: false` wykonuje się dalej (zgodność replayów).
//
// Przebieg jest REALNY: Veiled Ascension na polu bitwy + passy do podtrzymania
// (pętla `execute`), nie ręczne wstawienie `pendingOptionalTrigger`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { buildActionEntries, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
};

function put(state, id, cardId, zone, playerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
}

/** Podtrzymanie p1 z Veiled Ascension na stole — decyzja „you may cloak". */
function upkeepVA() {
  const state = createGameState({ seed: 9231, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'va', 'veiled-ascension', 'battlefield');
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) put(state, `lib-${pid}-${i}`, 'basic-swamp', 'library', pid);
  }
  put(state, 'top', 'highland-game', 'library');
  let guard = 0;
  while (guard < 200 && state.status === 'active' && !state.pendingOptionalTrigger) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) throw new Error(`pass zablokowany: ${r.events?.[0]?.reason}`);
    guard += 1;
  }
  if (!state.pendingOptionalTrigger) throw new Error('decyzja „you may" nie wystąpiła');
  return state;
}

const zakryte = (state) => [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.faceDown);

test('F1/1: oferta „you may" to wykonanie + ZWYKŁY pass (bez osobnego „Zrezygnuj")', () => {
  const state = upkeepVA();
  const commands = playerView(state, 'p1').legalCommands;
  const fire = commands.find((c) => c.type === 'resolve_optional_trigger_choice');
  assert.ok(fire, 'oferta wykonania istnieje');
  assert.equal(fire.fire, true, 'jedyny wariant resolve_optional_trigger_choice to wykonanie');
  assert.equal(commands.filter((c) => c.type === 'resolve_optional_trigger_choice').length, 1,
    'nie ma już drugiego wariantu resolve_optional_trigger_choice (fire: false)');
  assert.ok(commands.some((c) => c.type === 'pass_priority'),
    'odmowa idzie przez zwykły pass (przycisk „Dalej (Pass)")');
  assert.equal(commands[0].type, 'resolve_optional_trigger_choice',
    'PIERWSZA oferta = wykonanie (boty/replaye: „pierwsza oferta = dotychczasowe zachowanie")');
});

test('F1/2: „Dalej (Pass)" = odmowa — decyzja zamknięta jako fired: false', () => {
  const state = upkeepVA();
  const tura = state.turn.number;
  const krok = state.turn.step;
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'pass_priority');
  const r = execute(state, decline);
  assert.equal(r.ok, true, 'pass jest legalnym rozstrzygnięciem decyzji „you may"');
  assert.equal(state.pendingOptionalTrigger, null, 'decyzja zamknięta');
  assert.equal(state.status, 'active', 'gra trwa (pass nie kończy partii)');
  assert.deepEqual(zakryte(state), [], 'odmowa: wierzchnia karta biblioteki NIE została zakryta');
  const resolved = state.events.filter((e) => e.type === 'optional_trigger_resolved').at(-1);
  assert.equal(resolved?.fired, false, 'zdarzenie niesie fired: false');
  assert.equal(state.turn.number, tura, 'odmowa nie przesuwa tury');
  assert.equal(state.turn.step, krok, '…ani kroku');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet wraca do właściciela decyzji');
  assert.equal(state.turn.passes, 0, 'to nie jest pass rundy priorytetu — licznik wyzerowany');
});

test('F1/3: klik w akcję = wykonanie (cloak wierzchniej karty biblioteki)', () => {
  const state = upkeepVA();
  const fire = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
  const r = execute(state, fire);
  assert.equal(r.ok, true, 'wykonanie przyjęte');
  assert.equal(state.pendingOptionalTrigger, null, 'decyzja zamknięta');
  // Cloak idzie na STOS (T6) — rozstrzyga się po passach, jak każdy trigger.
  let guard = 0;
  while (guard < 20 && state.status === 'active' && zakryte(state).length === 0) {
    const pass = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!pass.ok) throw new Error(`pass zablokowany: ${pass.events?.[0]?.reason}`);
    guard += 1;
  }
  const zakryta = zakryte(state);
  assert.equal(zakryta.length, 1, 'wykonanie: wierzchnia karta biblioteki leży zakryta na stole');
  assert.equal(zakryta[0].faceDownCause, 'cloak', 'zakrycie pochodzi z mechaniki cloak (CR 701.58)');
});

test('F1/4: panel — dwie ZWYKŁE akcje, żadnego modala („bez modala")', () => {
  const state = upkeepVA();
  const view = playerView(state, 'p1');
  // Panel gracza odsiewa `concede` (pkt b właściciela) — tę samą listę
  // podajemy grupowaniu, żeby pin mierzył realny zestaw przycisków.
  const commands = view.legalCommands.filter((c) => c.type !== 'concede');
  const entries = buildActionEntries(commands.slice(), SESSION, view);
  assert.equal(entries.length, 2, `oczekiwano 2 przycisków: ${JSON.stringify(entries.map((e) => e.command?.type))}`);
  assert.ok(entries.every((e) => !e.request), 'decyzja „you may" nie może otwierać modala');
  // E (ta sama sesja): pass jest ZAWSZE pierwszy.
  assert.equal(entries[0].command.type, 'pass_priority', 'pierwszy przycisk to „Dalej (Pass)"');
  assert.match(commandLabel(entries[0].command, SESSION, view), /Dalej \(pass\)/, 'etykieta przycisku pass');
  const akcja = entries.find((e) => e.command.type === 'resolve_optional_trigger_choice');
  assert.ok(akcja, 'oferta wykonania jest w panelu');
  const label = akcja.label ?? commandLabel(akcja.command, SESSION, view);
  assert.match(label, /Veiled Ascension/, `etykieta nazywa kartę: ${label}`);
  assert.doesNotMatch(label, /^Efekt dobrowolny/, 'etykieta nie jest gołym „Efekt dobrowolny"');
});

test('F1/5 (zgodność): stary kształt fire: false nadal jest odmową', () => {
  const state = upkeepVA();
  const r = execute(state, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: false });
  assert.equal(r.ok, true, 'replaye i starsze testy mają prawo używać dawnego kształtu');
  assert.equal(state.pendingOptionalTrigger, null, 'decyzja zamknięta');
  const resolved = state.events.filter((e) => e.type === 'optional_trigger_resolved').at(-1);
  assert.equal(resolved?.fired, false, 'fired: false');
});
