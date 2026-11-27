// H (zgłoszenie właściciela 2026-11-21, „uwagi z testów"): Epic Experiment
// odsłania Piercing Rays (exile tapniętego celu) i Summary Judgment (3
// obrażenia w tapnięty cel) — bot celuje OBA w tę samą kreaturę.
// Summary Judgment (góra stosu) zabija ją pierwszy, Piercing Rays (dół)
// rozstrzyga się drugi z nielegalnym celem: „cel nielegalny — bez efektu".
// Właściciel: „Bot oba te czary celuje w tą samą moją kreaturę zamiast w
// dwie różne. BEZ SENSU."
//
// Kontrakt: przy drugim (i kolejnym) darmowym rzucie removalu wariant
// celujący w obiekt JUŻ OZNACZONY przez mój czar na stosie dostaje karę
// (`stackRemovalDuplicationPenalty`) — remis wariantów przechyla na drugą
// istotę. Rozpoznanie po deskryptorach (ADR 0002): damage/hard-removal na
// obu stronach, tylko MOJE wpisy stosu (cudzy fizzle to nasz zysk).
// Pokrętło ×0 (anti-over-fix M429) przywraca dawne „pierwszy z listy".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function scene() {
  const state = createGameState({ seed: 1791, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];

  const put = (id, cardId, zone, playerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      ...gameObjectDataOf(def),
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      spell: def.spell,
    });
    return state.objects.get(id);
  };

  put('pr-ex', 'piercing-rays', 'exile');
  put('sj-ex', 'summary-judgment', 'exile');

  // Dwie IDENTYCZNE tapnięte kreatury wroga — oba czary wymagają
  // `tapped_creature`, oba je zabijają (exile / 3 dmg vs 2 wytrzymałości).
  // Identyczne statystyki = remis wariantów, więc stary kod bierze „pierwszy
  // z listy" dla OBU rzutów (dokładnie scenariusz z logu właściciela).
  for (const id of ['eye', 'oth']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    });
    // `taped` poza kontraktem addObject (L21) — patch jak w batch43/pr134.
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  }

  state.pendingEpicExperiment = {
    playerId: 'p1', sourceCardId: 'epic-experiment',
    exileIds: ['pr-ex', 'sj-ex'], maxMV: 2, restorePriorityTo: 'p1',
  };
  return state;
}

function pick(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, ...(params ? { params } : {}) });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  return { cmd, entry: bot.trace().at(-1) };
}

function stackedTargets(state) {
  return state.zones.stack.map((id) => state.objects.get(id))
    .filter((obj) => obj?.chosenTargets?.length)
    .map((obj) => ({ cardId: obj.cardId, target: obj.chosenTargets[0] }));
}

test('H/1: dwa removaly z Epic Experiment celują w DWIE RÓŻNE kreatury', () => {
  const state = scene();
  const first = pick(state).cmd;
  assert.equal(first.type, 'resolve_epic_choice');
  assert.ok(!first.done, 'bot rzuca pierwszy czar, nie kończy');
  assert.ok(execute(state, first).ok, 'pierwszy rzut zaakceptowany');

  const second = pick(state).cmd;
  assert.equal(second.type, 'resolve_epic_choice');
  assert.ok(!second.done, 'drugie darmowe rzuty też powinny pójść');
  assert.ok(execute(state, second).ok, 'drugi rzut zaakceptowany');

  const t1 = first.targets?.[0];
  const t2 = second.targets?.[0];
  assert.ok(t1 && t2, `oba rzuty mają cele: ${JSON.stringify({ t1, t2 })}`);
  assert.notEqual(t1, t2,
    `dwa removaly w jeden cel = drugi fizzluje (CR 608.2b); oczekiwano DWÓCH różnych, było ${t1} i ${t2}`);
  const stacked = stackedTargets(state);
  assert.equal(stacked.length, 2, 'oba czary są na stosie');
  assert.notEqual(stacked[0].target, stacked[1].target, 'cele na stosie różne');
});

test('H/2: anti-over-fix — stackRemovalDuplicationPenalty ×0 przywraca dawne zachowanie', () => {
  const state = scene();
  const first = pick(state, { stackRemovalDuplicationPenalty: 0 }).cmd;
  assert.ok(!first.done && execute(state, first).ok);
  const second = pick(state, { stackRemovalDuplicationPenalty: 0 }).cmd;
  assert.ok(!second.done && execute(state, second).ok);
  // Dawna polityka: remis wariantów → „pierwszy z listy" dla obu kart.
  assert.equal(first.targets?.[0], second.targets?.[0],
    'pokrętło ×0 = stare zachowanie (zdublowany cel)');
});

test('H/3: z jedynym legalnym celem rzut przechodzi mimo duplikatu (nie zawiesza decyzji)', () => {
  const state = scene();
  // Zostawiam tylko JEDNĄ tapniętą kreaturę — drugi czar nie ma alternatywy.
  state.objects.set('oth', Object.freeze({ ...state.objects.get('oth'), zone: 'graveyard' }));
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'oth');
  state.zones.graveyard.push('oth');
  const first = pick(state).cmd;
  assert.ok(!first.done && execute(state, first).ok, 'pierwszy rzut działa');
  const second = pick(state).cmd;
  assert.equal(second.type, 'resolve_epic_choice');
  assert.ok(!second.done,
    'przy jedynym celu rzut = i tak poszedłby do grobu (done daje ten sam stan) — bot rzuca');
  assert.equal(second.targets?.[0], first.targets?.[0], 'brak alternatywy = ten sam cel');
  assert.ok(execute(state, second).ok);
});
