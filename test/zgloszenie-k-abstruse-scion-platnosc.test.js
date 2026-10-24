/**
 * Zgłoszenie właściciela K (2026-10-24): Abstruse Interference —
 * „Counter target spell unless its controller pays {1}. You create a 1/1
 * colorless Eldrazi Scion creature token…”. Gdy bot kontrował czar gracza,
 * w panelu „Twoje działania” była TYLKO opcja „Nie płać — czar
 * skontrowany”, mimo że gracz mógł pozyskać manę z poświęcenia własnego
 * Eldrazi Sciona/Spawna.
 *
 * Diagnoza: silnik jest kompletny — przy `pendingCounterPay` oferuje
 * aktywacje zdolności many (CR 608.2g: „If an effect gives a player the
 * option to pay mana, they may activate mana abilities before taking that
 * action”), a wykonawca je przepuszcza (`manaGeneratingCommandFor`).
 * Gubiła je PREZENTACJA: `buildActionEntries` (render.js, M369/G) filtruje
 * z panelu wszystkie „czyste” zdolności many — także te z kosztem
 * poświęcenia, których automatyczna płatność (`spendMana`/`producibleMana`)
 * z definicji nie odpala sama. Przy pustej puli i tapniętych landach gracz
 * nie miał żadnej klikalnej drogi do zapłaty.
 *
 * Naprawa: w trakcie oczekującej decyzji płatniczej (rodzina
 * PAYMENT_DECISION_TYPES) panel pokazuje aktywacje zdolności many
 * o RĘCZNYM koszcie (`isManualManaAbilityCommand` — koszt wykracza poza
 * samo {T}/manę: poświęcenie, odrzut itd.). Zwykłe źródła {T} dalej kryje
 * auto-tap (przycisk „Zapłać”), a poza decyzjami płatniczymi filtr M369/G
 * działa bez zmian.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Fałszywa sesja stołu w kształcie używanym przez testy panelu akcji. */
function fakeSession(state) {
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId),
    nameOfObject: (objectId) => state.objects.get(objectId)?.cardName ?? String(objectId),
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
    state,
  };
}

/** Wszystkie komendy niesione przez wpisy panelu (pojedyncze i grupowane). */
function panelCommands(entries) {
  const out = [];
  for (const entry of entries) {
    if (entry.command) out.push(entry.command);
    for (const option of entry.request?.options ?? []) out.push(option);
  }
  return out;
}

function pass(state) {
  const pid = state.turn.priorityPlayerId;
  const cmd = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(cmd, `pass dostępny dla ${pid}`);
  assert.equal(execute(state, cmd).ok, true);
}

/**
 * Scena zgłoszenia: gracz (p1) rzuca Goblin Pikera za obie Góry (pula pusta,
 * landy tapnięte), ma Eldrazi Sciona; bot (p2) kontruje Abstruse Interference.
 * Po kontrze gra stoi na decyzji płatności p1.
 */
function scenaKontry() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'mtn2', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  put(state, 'isl1', 'basic-island', 'battlefield', 'p2');
  put(state, 'isl2', 'basic-island', 'battlefield', 'p2');
  put(state, 'isl3', 'basic-island', 'battlefield', 'p2');
  put(state, 'abstruse', 'abstruse-interference', 'hand', 'p2');

  const rzut = playerView(state, 'p1').legalCommands
    .find((c) => c.type.startsWith('cast') && c.objectId === 'piker');
  assert.ok(rzut);
  assert.equal(execute(state, rzut).ok, true);
  pass(state);
  const kontra = playerView(state, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast') && c.objectId === 'abstruse');
  assert.ok(kontra);
  assert.equal(execute(state, kontra).ok, true);
  pass(state); pass(state);
  assert.ok(state.pendingCounterPay, 'decyzja płatności otwarta (kontrakt silnika)');
  assert.equal(state.pendingCounterPay.playerId, 'p1');
  return state;
}

test('K/1: panel „Twoje działania” pokazuje poświęcenie Sciona przy decyzji kontr-płatności', () => {
  const state = scenaKontry();
  const view = playerView(state, 'p1');
  const session = fakeSession(state);
  // Kontrakt silnika (jest i był): aktywacja Sciona jest legalną komendą.
  const aktywacja = view.legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.ok(aktywacja, 'silnik oferuje poświęcenie Sciona (CR 608.2g)');
  // Zgłoszenie: panel musi tę komendę POKAZAĆ, nie tylko „Nie płać”.
  const komendy = panelCommands(buildActionEntries(view.legalCommands, session, view));
  assert.ok(komendy.some((c) => c.type === 'resolve_counter_pay_choice' && c.pay === false),
    'odmowa nadal w panelu');
  const wpisSciona = komendy.find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.ok(wpisSciona, 'PRZYCISK poświęcenia Eldrazi Sciona jest w panelu');
  const etykieta = commandLabel(wpisSciona, session, view);
  assert.ok(etykieta.includes('Eldrazi Scion'), `etykieta nazywa źródło: ${etykieta}`);
});

test('K/2: cała droga gracza — poświęć Sciona, zapłać {1}, czar zostaje w grze', () => {
  const state = scenaKontry();
  const aktywacja = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.equal(execute(state, aktywacja).ok, true);
  const poPoswieceniu = playerView(state, 'p1').legalCommands;
  const zaplac = poPoswieceniu.find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
  assert.ok(zaplac, 'po pozyskaniu many silnik oferuje „Zapłać {1}”');
  assert.equal(execute(state, zaplac).ok, true);
  // Abstruse dokańcza rozstrzyganie (bot dostaje swojego Sciona), Piker wchodzi.
  pass(state); pass(state);
  const stale = [...state.objects.values()].filter((o) => o.zone === 'battlefield');
  assert.ok(stale.some((o) => o.cardId === 'goblin-piker' && o.controllerId === 'p1'),
    'Goblin Piker NIE został skontrowany');
  assert.ok(!stale.some((o) => o.id === 'scion'), 'Scion gracza poświęcony');
  assert.ok(stale.some((o) => o.cardId === 'token_eldrazi_scion' && o.controllerId === 'p2'),
    'bot utworzył token z drugiej części Abstruse Interference');
});

test('K/3: poza decyzją płatniczą filtr M369/G działa jak dotąd (Scion nie zaśmieca panelu)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'silnik aktywację oferuje (kontrakt bez zmian)');
  const komendy = panelCommands(buildActionEntries(view.legalCommands, fakeSession(state), view));
  assert.ok(komendy.length > 0, 'panel niepusty');
  assert.ok(!komendy.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'bez otwartej płatności poświęcenie Sciona dalej poza panelem');
});

test('K/4: ta sama reguła przy ward — ręczne źródło widać, zwykłe {T} dalej kryje auto-tap', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'wilk', 'moonscarred-werewolf', 'battlefield', 'p1'); // „{T}: Add {G}{G}”
  const view = playerView(state, 'p1');
  const komendySyntetyczne = [
    { type: 'resolve_ward_pay_choice', playerId: 'p1', pay: false, cost: 2, sourceId: 'wilk', targetId: 'wilk' },
    { type: 'activate_ability', playerId: 'p1', objectId: 'scion', abilityIndex: 0 },
    { type: 'activate_ability', playerId: 'p1', objectId: 'wilk', abilityIndex: 0 },
    { type: 'concede', playerId: 'p1' },
  ];
  const komendy = panelCommands(buildActionEntries(komendySyntetyczne, fakeSession(state), view));
  assert.ok(komendy.some((c) => c.type === 'resolve_ward_pay_choice'),
    'decyzja ward w panelu');
  assert.ok(komendy.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'poświęcenie Sciona widoczne także przy ward (jedna rodzina płatności)');
  assert.ok(!komendy.some((c) => c.type === 'activate_ability' && c.objectId === 'wilk'),
    'czyste {T} dalej schowane — pokrywa je auto-tap przycisku „Zapłać”');
});
