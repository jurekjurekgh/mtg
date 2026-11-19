import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Zgłoszenie C (playtest 2026-11-16): bot rzuca Epic Experiment (X=3),
// wygania Expose to Daylight, Summary Judgment i Withstand (3 własne stwory
// na stole, brak artefaktu/enchantmentu i tapniętych stworów). Dwa pierwsze
// nie mają legalnych celów, a Withstand ma (własne stwory i siebie samego),
// lecz bot wybierał `done: true` i wyrzucał go do grobu zamiast rzucić za 0
// many w siebie lub swojego stwora (tarcza prewencji + dobranie karty).
//
// Przyczyna: `preventShieldValue` zwracał `fogWindowWastedValue` (−75) przy
// braku zagrożenia niezależnie od tego, czy odmowa pozwala zachować kartę
// (ręka / discover / hand_free_cast), czy też traci ją bezpowrotnie
// (Epic Experiment / suspend / rebound / grave_free_cast). W tym drugim
// przypadku dla Withstanda 70 + 5 − 75 = 0 remisowało z `done: true` (0)
// pierwszym na liście.

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  const { tapped, ...rest } = extra;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
    ...rest,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: false,
    ...(tapped ? { tapped: true } : {}),
  }));
  return state.objects.get(id);
}

function botMainTurn() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10, { colors: ['U', 'U', 'R', 'R', 'W'] });
  for (let i = 0; i < 20; i++) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function choose(state, playerId = 'p2') {
  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

test('C1: Epic Experiment (X=3) po wygnaniu Expose/Summary/Withstand rzuca Withstand we własną stronę zamiast done', () => {
  const state = botMainTurn();
  // 3 własne stwory i 1 wrogi nietapnięty; brak artefaktów/enchantmentów.
  putCreature(state, 'c1', 'p2', 2, 2);
  putCreature(state, 'c2', 'p2', 3, 3);
  putCreature(state, 'c3', 'p2', 4, 4);
  putCreature(state, 'e1', 'p1', 2, 2);

  // Wierzch biblioteki p2 (kolejność slice(0, 3) z końca strefy albo kolejność dodania — sprawdzamy dokładnie po rozstrzygnięciu).
  // Ustawiamy bibliotekę bezpośrednio tak, by top 3 to dokładnie te trzy karty.
  for (const id of [...state.zones.library]) {
    state.zones.library.splice(state.zones.library.indexOf(id), 1);
    state.objects.delete(id);
  }
  putCard(state, 'lib-expose', 'expose-to-daylight', 'p2', 'library');
  putCard(state, 'lib-summary', 'summary-judgment', 'p2', 'library');
  putCard(state, 'lib-withstand', 'withstand', 'p2', 'library');
  for (let i = 0; i < 15; i++) putCard(state, `lib-tail-${i}`, 'highland-game', 'p2', 'library');

  putCard(state, 'epic', 'epic-experiment', 'p2', 'hand');
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'epic', xValue: 3 });
  assert.equal(cast.ok, true, JSON.stringify(cast));
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);

  assert.ok(state.pendingEpicExperiment, 'Epic Experiment powinien otworzyć pendingEpicExperiment');
  const { choice } = choose(state);
  assert.equal(choice.type, 'resolve_epic_choice');
  assert.notEqual(choice.done, true, `bot ma rzucić Withstand za 0 many, nie odrzucić do grobu: ${JSON.stringify(choice)}`);
  const exiledWithstand = state.objects.get(choice.cardId);
  assert.equal(exiledWithstand?.cardId, 'withstand');
  assert.ok(['p2', 'c1', 'c2', 'c3'].includes(choice.targets?.[0]),
    `cel musi być po własnej stronie (stwór albo gracz p2), nigdy wróg: ${JSON.stringify(choice)}`);

  // Wykonanie rzutu + zakończenie Epic Experiment + rozstrzygnięcie Withstanda (dobranie karty + tarcza).
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(execute(state, choice).ok, true);
  const afterCast = choose(state).choice;
  assert.equal(afterCast.type, 'resolve_epic_choice');
  assert.equal(afterCast.done, true, 'po rzuceniu Withstanda zostają tylko niecelowalne Expose i Summary → done');
  assert.equal(execute(state, afterCast).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);

  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(handAfter, handBefore + 1, 'Withstand ze stosu ma dobrać 1 kartę');
  assert.ok((state.damageShields ?? []).some((s) => s.targetId === choice.targets[0] && s.remaining === 3),
    'Withstand ma zostawić tarczę prewencji 3 na wybranym własnym celu');
});

test('C2: w Epic Experiment zagrożony własny stwór (burn na stosie) wygrywa celowanie Withstanda', () => {
  const state = botMainTurn();
  putCreature(state, 'c1', 'p2', 2, 2);
  putCreature(state, 'c2', 'p2', 3, 3);
  putCreature(state, 'e1', 'p1', 2, 2);
  const bolt = putCard(state, 'bolt', 'shock', 'p1', 'stack');
  state.objects.set('bolt', Object.freeze({ ...bolt, chosenTargets: ['c1'] }));
  putCard(state, 'w-ex', 'withstand', 'p2', 'exile');
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 3, restorePriorityTo: 'p2',
  };
  const { choice } = choose(state);
  assert.equal(choice.type, 'resolve_epic_choice');
  assert.notEqual(choice.done, true);
  assert.deepEqual(choice.targets, ['c1'], 'zagrożony lethalem stwór c1 ma wygrywać ze zdrowym c2 i graczem');
});

test('C3: okna bez możliwości zachowania karty (suspend/rebound/grave_free) rzucają Withstand, a hand/discover nadal czekają', () => {
  // Suspend
  {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    const w = putCard(state, 'w-ex', 'withstand', 'p2', 'exile');
    state.objects.set(w.id, Object.freeze({ ...w, suspended: true, timeCounters: 0 }));
    state.pendingSuspendCast = { playerId: 'p2', objectId: w.id, cardId: w.cardId };
    const { choice, options } = choose(state);
    assert.equal(choice.type, 'resolve_suspend_cast');
    assert.equal(choice.cast, true, 'suspend: odmowa traci kartę na stałe, więc Withstand powinien być rzucony');
    assert.ok(['p2', 'c1'].includes(choice.targets?.[0]));
    assert.ok(options[0]?.score > 0, `suspend: rzut ma wygrywać z odmową (0), nie remisować: ${JSON.stringify(options[0])}`);
  }
  // Rebound
  {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    const w = putCard(state, 'w-ex', 'withstand', 'p2', 'exile');
    state.objects.set(w.id, Object.freeze({ ...w, reboundReady: true }));
    state.pendingReboundCast = { playerId: 'p2', objectId: w.id, cardId: w.cardId };
    const { choice, options } = choose(state);
    assert.equal(choice.type, 'resolve_rebound_cast');
    assert.equal(choice.cast, true, 'rebound: odmowa traci darmowy rzut, więc Withstand powinien być rzucony');
    assert.ok(['p2', 'c1'].includes(choice.targets?.[0]));
    assert.ok(options[0]?.score > 0, `rebound: rzut ma wygrywać z odmową (0), nie remisować: ${JSON.stringify(options[0])}`);
  }
  // Grave free cast (Halo Forager — po zapłaceniu X darmowy rzut z grobu)
  {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    const w = putCard(state, 'w-gy', 'withstand', 'p2', 'graveyard');
    state.pendingGraveFreeCast = {
      playerId: 'p2', sourceId: 'hf', stage: 'target', xValue: 3, objectId: w.id,
    };
    const { choice } = choose(state);
    assert.equal(choice.type, 'resolve_grave_free_cast');
    assert.notEqual(choice.decline, true, 'grave free cast: darmowy Withstand w grobie daje dobór za 0 many');
    assert.ok(['p2', 'c1'].includes(choice.targets?.[0]));
  }
  // Anty-over-fix: Discover (odmowa bierze do ręki) i Hand-free-cast (zostaje w ręce) nadal czekają!
  {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    const w = putCard(state, 'w-ex', 'withstand', 'p2', 'exile');
    state.pendingDiscover = {
      playerId: 'p2', sourceId: 'ga', maxMV: 3, foundExileId: w.id, exiledOtherIds: [],
    };
    const { choice } = choose(state);
    assert.equal(choice.type, 'resolve_discover_choice');
    assert.equal(choice.castFree, false, 'discover: lepiej wziąć Withstand do ręki niż spalić bez zagrożenia');
  }
  {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    putCard(state, 'w-h', 'withstand', 'p2', 'hand');
    state.pendingHandFreeCast = {
      playerId: 'p2', sourceId: 'bkz', maxManaValue: 4, cardTypes: ['Instant'],
    };
    const { choice } = choose(state);
    assert.equal(choice.type, 'resolve_hand_free_cast');
    assert.equal(choice.decline, true, 'hand free cast: odmowa zachowuje Withstand w ręce na walkę');
  }
});

test('C4: Epic Experiment ogólnie rzuca pożyteczne czary (removal/pump/token/cantrip) i odrzuca X=0 / jałowe / własny fog', () => {
  // Pożyteczne czary mają być rzucane
  for (const [cardId, setup] of [
    ['shock', (s) => putCreature(s, 'e1', 'p1', 2, 2)],
    ['inspiration', null],
    ['raise-the-alarm', null],
    ['fake-your-own-death', (s) => putCreature(s, 'c1', 'p2', 2, 2)],
  ]) {
    const state = botMainTurn();
    if (setup) setup(state);
    putCard(state, 'ex', cardId, 'p2', 'exile');
    state.pendingEpicExperiment = {
      playerId: 'p2', sourceCardId: 'epic', exileIds: ['ex'], maxMV: 5, restorePriorityTo: 'p2',
    };
    const { choice } = choose(state);
    assert.equal(choice.type, 'resolve_epic_choice');
    assert.notEqual(choice.done, true, `Epic Experiment powinien rzucić ${cardId}, a wybrał done`);
  }

  // X=0 (Fireball), jałowy (Flurry of Wings poza walką), fog we własnej turze (Revealing Wind) → done: true
  for (const cardId of ['fireball', 'flurry-of-wings', 'revealing-wind']) {
    const state = botMainTurn();
    putCreature(state, 'c1', 'p2', 2, 2);
    putCreature(state, 'e1', 'p1', 2, 2);
    putCard(state, 'ex', cardId, 'p2', 'exile');
    state.pendingEpicExperiment = {
      playerId: 'p2', sourceCardId: 'epic', exileIds: ['ex'], maxMV: 5, restorePriorityTo: 'p2',
    };
    const { choice } = choose(state);
    assert.equal(choice.type, 'resolve_epic_choice');
    assert.equal(choice.done, true, `Epic Experiment nie powinien marnować/szkodzić czarem ${cardId}`);
  }
});
