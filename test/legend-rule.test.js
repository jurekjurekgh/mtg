import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Prawo legend (CR 704.5j): gracz kontrolujący DWA lub więcej legendarnych
 * permanentów o TEJ SAMEJ nazwie wybiera blokującą decyzją
 * resolve_legend_choice, który zostaje — pozostałe idą do grobu („dies"
 * odpala się normalnie: prawo legend kładzie obiekty z bitwiska do grobu,
 * CR 700.4). Skan jest częścią state-based actions (po śmierciach i
 * rozłączeniach załączników); kolejne grupy duplikatów obsługiwane są
 * jedna po drugiej (kolejne SBA po każdej komendzie).
 *
 * Nazwa pochodzi z pola `cardName` (dane definicji, ADR 0002) — dwa wydania
 * tej samej karty mają tę samą nazwę mimo innych id.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.stepIndex = 3;
  state.turn.passes = 0;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, opts = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: data.cardName ?? null,
    ownerId: opts.ownerId ?? null,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 1, toughness = 1 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
    cardName: 'Highland Game',
  });
  return state.objects.get(id);
}

function legendChoiceQueued(state) {
  assert.ok(state.pendingLegendChoice, 'wybór prawa legend zakolejkowany');
  return state.pendingLegendChoice;
}

test('prawo legend: dwie kopie tej samej legendy pod jednym kontrolerem kolejkują wybór po SBA', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  assert.equal(state.pendingLegendChoice, null, 'SBA uruchamiają się dopiero przy komendzie');
  addRealCard(state, 'isle', 'basic-island', 'p1', 'battlefield');
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isle' }).ok);
  const pending = legendChoiceQueued(state);
  assert.equal(pending.playerId, 'p1');
  assert.equal(pending.name, 'Trostani Discordant');
  assert.deepEqual(pending.candidateIds, ['tr-1', 'tr-2'], 'kandydaci w kolejności wejścia');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet przechodzi do decydującego');
  assert.ok(state.events.some((e) => e.type === 'legend_rule_choice_started' && e.name === 'Trostani Discordant'));
});

test('prawo legend: inne komendy są zablokowane; oferta widoku wyłącznie dla właściciela decyzji', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'isle', 'basic-island', 'p1', 'battlefield');
  execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isle' });
  legendChoiceQueued(state);
  const blocked = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.events[0].reason, 'legend_choice_unresolved');
  const viewMine = playerView(state, 'p1');
  assert.ok(viewMine.legalCommands.some((c) => c.type === 'resolve_legend_choice' && c.keepId === 'tr-1'));
  assert.ok(viewMine.legalCommands.some((c) => c.type === 'resolve_legend_choice' && c.keepId === 'tr-2'));
  assert.equal(viewMine.legalCommands.some((c) => c.type === 'pass_priority'), false, 'pass niedostępny do decyzji');
  const viewOther = playerView(state, 'p2');
  assert.equal(viewOther.legalCommands.some((c) => c.type === 'resolve_legend_choice'), false, 'p2 nie decyduje');
  assert.equal(viewOther.pendingLegendChoice.name, 'Trostani Discordant', 'decyzja jest publiczna (bitwisko)');
  assert.deepEqual(viewOther.pendingLegendChoice.candidateIds, ['tr-1', 'tr-2']);
});

test('prawo legend: wybór grzebie pozostałe kopie; źle wybrany lub cudzy wybór jest odrzucany', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'isle', 'basic-island', 'p1', 'battlefield');
  execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isle' });
  legendChoiceQueued(state);
  const wrongPlayer = execute(state, { type: 'resolve_legend_choice', playerId: 'p2', keepId: 'tr-1' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'legend_choice_not_your_decision');
  const badKeep = execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'inny' });
  assert.equal(badKeep.ok, false);
  assert.equal(badKeep.events[0].reason, 'illegal_legend_choice');
  const resolved = execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tr-2' });
  assert.ok(resolved.ok);
  assert.equal(state.pendingLegendChoice, null);
  assert.ok(state.objects.get('tr-2')?.zone === 'battlefield', 'wybrana kopia zostaje');
  assert.equal(state.objects.get('tr-1'), undefined, 'grzebana kopia znika ze starego id');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'trostani-discordant' && o.zone === 'graveyard'), 'pozostała kopia w grobie');
  assert.ok(resolved.events.some((e) => e.type === 'object_moved' && e.legendRule === true && e.fromId === 'tr-1'));
  assert.ok(resolved.events.some((e) => e.type === 'legend_rule_resolved' && e.keepId === 'tr-2' && e.buriedIds.length === 1));
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'gra toczy się dalej');
});

test('prawo legend: pochowana kopia odpala „dies" (Selhoff młynuje przeciwnika)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'occ', 'selhoff-occultist', 'p1', 'battlefield');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'p2lib', 'shatter', 'p2', 'library');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  legendChoiceQueued(state);
  assert.ok(execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tr-1' }).ok);
  // Temat 2: Selhoff celuje „target player" — kontroler wybiera przeciwnika.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  // T6: trigger Selhoffa ze stosu — pełna runda passów.
  {
    const first = state.turn.priorityPlayerId;
    const other = state.players.find((p) => p.id !== first).id;
    execute(state, { type: 'pass_priority', playerId: first });
    execute(state, { type: 'pass_priority', playerId: other });
  }
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'shatter' && o.zone === 'graveyard' && o.controllerId === 'p2'),
    'trigger any_creature_dies odpalił się na pochowanej kopii (CR 700.4)');
});

test('prawo legend: trzy kopie — jedna decyzja grzebie dwie pozostałe', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-3', 'trostani-discordant', 'p1', 'battlefield');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const pending = legendChoiceQueued(state);
  assert.equal(pending.candidateIds.length, 3);
  const resolved = execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tr-1' });
  assert.ok(resolved.ok);
  assert.equal(resolved.events.find((e) => e.type === 'legend_rule_resolved').buriedIds.length, 2);
  assert.equal(state.pendingLegendChoice, null, 'jedna grupa = jedna decyzja');
  assert.equal([...state.objects.values()].filter((o) => o.cardId === 'trostani-discordant' && o.zone === 'battlefield').length, 1);
});

test('prawo legend: różne legendy u tego samego gracza oraz ta sama legenda u dwóch graczy NIE kolejkują', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'zor-1', 'zoraline', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p2', 'battlefield');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.pendingLegendChoice, null, 'różne nazwy / różni kontrolerzy to nie duplikaty');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
});

test('prawo legend: nielegendarne duplikaty (zwykłe stwory, tokeny) nie kolejkują', () => {
  const state = game();
  mainPhase(state, 'p1');
  addSimpleCreature(state, 'c-1', 'p1');
  addSimpleCreature(state, 'c-2', 'p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.pendingLegendChoice, null);
});

test('prawo legend: dwie grupy duplikatów obsługiwane kolejno (druga po SBA następnej komendy)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
  addRealCard(state, 'zor-1', 'zoraline', 'p1', 'battlefield');
  addRealCard(state, 'zor-2', 'zoraline', 'p1', 'battlefield');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const first = legendChoiceQueued(state);
  assert.equal(first.name, 'Trostani Discordant', 'pierwsza grupa w kolejności bitwiska');
  assert.ok(execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tr-1' }).ok);
  const second = legendChoiceQueued(state);
  assert.equal(second.name, 'Zoraline, Cosmos Caller', 'następna grupa po SBA');
  assert.ok(execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'zor-2' }).ok);
  assert.equal(state.pendingLegendChoice, null);
  assert.ok(state.objects.get('tr-1')?.zone === 'battlefield');
  assert.ok(state.objects.get('zor-2')?.zone === 'battlefield');
});

test('prawo legend: priorytet wraca do właściciela po rozstrzygnięciu decyzji', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tr-1', 'trostani-discordant', 'p2', 'battlefield');
  addRealCard(state, 'tr-2', 'trostani-discordant', 'p2', 'battlefield');
  addRealCard(state, 'isle', 'basic-island', 'p1', 'battlefield');
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isle' }).ok);
  const pending = legendChoiceQueued(state);
  assert.equal(pending.playerId, 'p2', 'duplikaty p2 — decyzja p2');
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet przechodzi do decydującego');
  assert.ok(execute(state, { type: 'resolve_legend_choice', playerId: 'p2', keepId: 'tr-1' }).ok);
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet wraca do poprzedniego właściciela');
});

test('prawo legend: determinizm — replay z sekwencją wyboru jest odtwarzalny', () => {
  const build = () => {
    const state = game();
    mainPhase(state, 'p1');
    addRealCard(state, 'tr-1', 'trostani-discordant', 'p1', 'battlefield');
    addRealCard(state, 'tr-2', 'trostani-discordant', 'p1', 'battlefield');
    addRealCard(state, 'isle', 'basic-island', 'p1', 'battlefield');
    execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isle' });
    execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tr-2' });
    execute(state, { type: 'pass_priority', playerId: 'p1' });
    execute(state, { type: 'pass_priority', playerId: 'p2' });
    return state;
  };
  const verification = verifyReplay(replayFromState(build()), build, execute);
  assert.equal(verification.deterministic, true);
});
