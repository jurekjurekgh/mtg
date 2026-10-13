// Uwaga z testów E (2026-10-12): bot kontroluje Angelic Benediction oraz
// dwa stwory 2/2, przeciwnik ma jedno nietapnięte 5/4. Samotny atak odpala
// exalted i „you may tap target creature”, więc 5/4 zostaje tapnięte przed
// deklaracją blokujących, a 3/3 uderza w otwartego. Bot dotąd widział surowe
// 5/4 przez cały scoring i wybierał „Brak ataku”.
//
// Naprawa ma być klasą `attacks_alone`, nie wiedzą o nazwie/cardId: scoring
// projektuje publiczne triggery kontrolowanych permanentów, ich legalne cele
// oraz automatyczny pump, ale engine nadal jest autorytetem wykonania.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function putBody(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-body-${power}-${toughness}`,
    controllerId, ownerId: controllerId, zone: 'battlefield', kind: 'creature',
    types: ['Creature'], subtypes: [], abilities: [], keywords, colors: [],
    power, toughness, manaCost: 0,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false,
  }));
}

function putBenediction(state, { stripped = false } = {}) {
  const def = REGISTRY.get('angelic-benediction');
  assert.ok(def, 'prawdziwa Angelic Benediction istnieje w katalogu');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'benediction', instanceId: 'i-benediction', cardId: def.id,
    controllerId: 'bot', ownerId: 'bot', zone: 'battlefield',
  });
  if (stripped) {
    state.objects.set('benediction', Object.freeze({
      ...state.objects.get('benediction'), abilitiesStripped: true,
    }));
  }
}

function scene({ withBenediction = true, blockers = [{ id: 'human-5-4', power: 5, toughness: 4, keywords: [] }], stripped = false } = {}) {
  const state = createGameState({
    seed: 1210,
    players: [{ id: 'human' }, { id: 'bot' }],
  });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'bot');
  state.turn.activePlayerId = 'bot';
  state.turn.priorityPlayerId = 'bot';
  putBody(state, 'bot-a', 'bot', 2, 2);
  putBody(state, 'bot-b', 'bot', 2, 2);
  for (const blocker of blockers) {
    putBody(state, blocker.id, 'human', blocker.power, blocker.toughness, blocker.keywords ?? []);
  }
  if (withBenediction) putBenediction(state, { stripped });
  const bot = createHeuristicBot({ seed: 1211, randomness: 0 });
  return { state, bot, view: playerView(state, 'bot') };
}

function chosenAttackers(bot, view) {
  const choice = bot.chooseCommand(view, {});
  return { choice, ids: choice?.type === 'declare_attackers' ? choice.attackerIds ?? [] : [] };
}

function drainAttackTriggersToBlocks(state, bot) {
  let targetChoice = null;
  for (let guard = 0; guard < 40; guard += 1) {
    if (state.turn.step === 'declare_blockers'
      && state.zones.stack.length === 0
      && state.pendingTriggerTargets.length === 0) return targetChoice;
    const playerId = state.turn.priorityPlayerId;
    const view = playerView(state, playerId);
    let command;
    if (playerId === 'bot') {
      command = bot.chooseCommand(view, {});
      if (command?.type === 'resolve_trigger_target') targetChoice = command;
    } else {
      command = view.legalCommands.find((candidate) => candidate.type === 'pass_priority');
    }
    assert.ok(command, `brak komendy podczas rozstrzygania triggerów (${playerId})`);
    const result = execute(state, command);
    assert.equal(result.ok, true, `komenda ${command.type} musi się wykonać: ${result.reason ?? ''}`);
  }
  assert.fail('triggery samotnego ataku nie doszły do deklaracji blokujących');
}

test('E/1 RED produkcyjny: Benediction otwiera samotny atak 2/2 w jedyne 5/4', () => {
  const { state, bot, view } = scene();
  const { choice, ids } = chosenAttackers(bot, view);
  assert.equal(choice?.type, 'declare_attackers', `bot ma podjąć decyzję ataku: ${JSON.stringify(choice)}`);
  assert.equal(ids.length, 1,
    `tapnięcie jedynego 5/4 + exalted czyni dokładnie jeden atak opłacalnym: ${JSON.stringify(bot.trace().at(-1))}`);

  // Samotność jest istotna: wariant z oboma 2/2 nie odpala żadnego triggera
  // attacks_alone i nadal ma pozostać poniżej passu.
  const allIn = bot.trace().at(-1)?.options.find((option) =>
    option.cmd === 'attack[bot-a,bot-b]');
  assert.ok(allIn && allIn.score < 0,
    `dwóch atakujących nie może pożyczyć efektu attacks_alone: ${JSON.stringify(allIn)}`);

  const declared = execute(state, choice);
  assert.equal(declared.ok, true, `wybrany atak jest legalny: ${declared.reason ?? ''}`);
  const targetChoice = drainAttackTriggersToBlocks(state, bot);
  assert.equal(targetChoice?.targetId, 'human-5-4',
    `bot ma naprawdę wskazać jedynego blokera jako cel: ${JSON.stringify(targetChoice)}`);
  assert.equal(state.objects.get('human-5-4')?.tapped, true,
    'trigger Benediction tapuje 5/4 przed deklaracją blokujących');
  const attacker = state.objects.get(ids[0]);
  assert.equal(effectivePower(attacker, state), 3, 'exalted: samotny 2/2 jest teraz 3/3');
  assert.equal(effectiveToughness(attacker, state), 3, 'exalted daje także +1 wytrzymałości');

  const blockOffers = playerView(state, 'human').legalCommands
    .filter((command) => command.type === 'declare_blockers');
  assert.ok(blockOffers.length > 0, 'obrońca dostaje decyzję bloków');
  assert.ok(blockOffers.every((command) =>
    !Object.values(command.assignments ?? {}).flat().includes('human-5-4')),
  'tapnięte 5/4 nie występuje w żadnym legalnym przydziale bloków');
});

test('E/2 anty-over-fix: bez triggera tapującego 2/2 nadal nie atakuje w 5/4', () => {
  const { bot, view } = scene({ withBenediction: false });
  assert.deepEqual(chosenAttackers(bot, view).ids, [],
    'samobójczy atak bez Benediction pozostaje gorszy od passu');
});

test('E/3 anty-over-fix: jeden trigger nie usuwa dwóch blokerów 5/4', () => {
  const { bot, view } = scene({ blockers: [
    { id: 'human-5-4-a', power: 5, toughness: 4 },
    { id: 'human-5-4-b', power: 5, toughness: 4 },
  ] });
  assert.deepEqual(chosenAttackers(bot, view).ids, [],
    'po tapnięciu jednego 5/4 drugi nadal legalnie zabija samotnego 3/3');
});

test('E/4 anty-over-fix: hexproof blokera uniemożliwia pozorne tapnięcie', () => {
  const { bot, view } = scene({ blockers: [
    { id: 'hexproof-5-4', power: 5, toughness: 4, keywords: ['hexproof'] },
  ] });
  assert.deepEqual(chosenAttackers(bot, view).ids, [],
    'cudzy hexproof nie jest legalnym celem Benediction, więc 5/4 nadal blokuje');
});

test('E/5 anty-over-fix: utrata zdolności wyłącza oba triggery Benediction', () => {
  const { bot, view } = scene({ stripped: true });
  assert.equal(view.zones.battlefield.find((object) => object.id === 'benediction')?.abilitiesStripped, true,
    'PlayerView publikuje utratę zdolności');
  assert.deepEqual(chosenAttackers(bot, view).ids, [],
    'scoring nie może czytać wydrukowanych triggerów permanentu bez zdolności');
});

test('E/6: generyczny exalted zmienia nieopłacalny blok 2/2 vs 2/3 w wygrane starcie', () => {
  const { state, bot, view } = scene({
    withBenediction: false,
    blockers: [{ id: 'human-2-3', power: 2, toughness: 3 }],
  });
  assert.deepEqual(chosenAttackers(bot, view).ids, [],
    'bez exalted gołe 2/2 ginie w 2/3 i nie zabija blokera');

  const squire = REGISTRY.get('akrasan-squire');
  assert.ok(squire, 'prawdziwy Akrasan Squire istnieje w katalogu');
  addObject(state, {
    ...gameObjectDataOf(squire),
    id: 'squire', instanceId: 'i-squire', cardId: squire.id,
    controllerId: 'bot', ownerId: 'bot', zone: 'battlefield',
  });
  state.objects.set('squire', Object.freeze({
    ...state.objects.get('squire'), summoningSickness: false,
  }));

  const withExalted = chosenAttackers(bot, playerView(state, 'bot')).ids;
  assert.equal(withExalted.length, 1,
    `jeden 2/2 atakuje jako 3/3 dzięki deskryptorowi exalted: ${JSON.stringify(bot.trace().at(-1))}`);
  assert.ok(['bot-a', 'bot-b'].includes(withExalted[0]),
    'atakującym jest 2/2, które po +1/+1 przeżywa i zabija 2/3');
});
