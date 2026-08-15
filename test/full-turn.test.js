import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';

/**
 * Pełny przebieg jednej tury sterowany wyłącznie komendami oferowanymi przez
 * PlayerView: untap → upkeep → draw → main → combat (bez ataku, stwór chory)
 * → postcombat → end → cleanup → początek tury następnego gracza.
 */

function buildState(seed = 5) {
  const state = createGameState({ seed, players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
  // CR 103.7a: pierwsza tura gry pomija draw step — testujemy pełną turę
  // z dobraniem, więc zaczynamy od tury 2.
  state.turn = { ...state.turn, number: 2 };
  addObject(state, { id: 'p1-top', instanceId: 'it', cardId: 'Top', controllerId: 'p1', zone: 'library', kind: 'land' });
  addObject(state, { id: 'p1-land', instanceId: 'il', cardId: 'Land', controllerId: 'p1', zone: 'hand', kind: 'land' });
  addObject(state, { id: 'p1-cub', instanceId: 'ic', cardId: 'Cub', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 1, toughness: 1, manaCost: 1 });
  const old = addObject(state, { id: 'p1-veteran', instanceId: 'iv', cardId: 'Vet', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 3 });
  state.objects.set('p1-veteran', Object.freeze({ ...old, damage: 1 }));
  return state;
}

function doFor(state, playerId, ...types) {
  const view = playerView(state, playerId);
  for (const type of types) {
    const cmd = view.legalCommands.find((c) => c.type === type);
    assert.ok(cmd, `gracz ${playerId} nie ma oferty ${type} w kroku ${state.turn.step}`);
    const result = execute(state, cmd);
    assert.equal(result.ok, true, `${type} odrzucona: ${result.events[0]?.reason}`);
    return result;
  }
  throw new Error('doFor wymaga przynajmniej jednego typu');
}

function passRound(state) {
  for (let i = 0; i < 2; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const result = doFor(state, holder, 'pass_priority');
    assert.equal(result.ok, true);
  }
}

function advancedSteps(state) {
  return state.events.filter((e) => e.type === 'step_advanced').map((e) => e.step);
}

test('pełna tura przechodzi wszystkie kroki przez legalCommands', () => {
  const state = buildState();
  assert.equal(state.turn.step, 'untap');

  passRound(state); // untap
  assert.equal(state.turn.step, 'upkeep');
  passRound(state); // upkeep
  assert.equal(state.turn.step, 'draw');

  // M101/A (CR 504.1): dobranie to akcja turowa — wykonała się sama przy
  // wejściu w krok, więc NIKT nie ma tu oferty `draw_card`.
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'draw_card'), false);
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'draw_card'), false);
  assert.equal(state.turn.drawnInStep, true, 'karta dobrana automatycznie');
  assert.equal(state.zones.hand.length, 3);

  passRound(state); // draw
  assert.equal(state.turn.phase, 'precombat_main');

  const landPlayed = doFor(state, 'p1', 'play_land');
  const landId = landPlayed.events[0].object.id;
  // tap_for_mana nie jest już oferowany: zagranie z pustą pulą jest dostępną
  // akcją od razu, a płatność sama tapuje land (auto-tap, spendMana).
  const cast = doFor(state, 'p1', 'cast_permanent');
  const cubId = cast.events[0].object.id;
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.objects.get(landId).tapped, true, 'płatność automatycznie zatapuje land');
  assert.ok(cast.events.some((e) => e.type === 'mana_produced'), 'log pokazuje zebranie many (auto-tap)');
  assert.equal(state.objects.get(cubId).summoningSickness, true);

  passRound(state); // T1: pełna runda rozstrzyga czar stwora (stos)
  passRound(state); // precombat main
  assert.equal(state.turn.step, 'beginning_of_combat');
  passRound(state);
  assert.equal(state.turn.step, 'declare_attackers');

  // Cub ma summoning sickness, weteran jest nietapnięty i może atakować.
  const attacks = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.ok(attacks.some((c) => c.attackerIds.length === 1 && c.attackerIds[0] === 'p1-veteran'));
  assert.equal(attacks.some((c) => c.attackerIds.includes(cubId)), false);
  doFor(state, 'p1', 'declare_attackers'); // pierwsza oferta — deterministyczny wybór pełnego ataku nie jest wymagany
  assert.equal(state.turn.step, 'declare_blockers');

  doFor(state, 'p2', 'declare_blockers');
  assert.equal(state.turn.step, 'combat_damage');
  doFor(state, 'p1', 'resolve_combat');
  assert.equal(state.turn.step, 'end_of_combat');

  passRound(state); // end of combat
  assert.equal(state.turn.phase, 'postcombat_main');
  passRound(state);
  assert.equal(state.turn.step, 'end');

  // Przed cleanup: land p1 wciąż tapped, a oznaczone obrażenia czekają na weteranie.
  assert.equal(state.objects.get(landId).tapped, true);
  assert.equal(state.objects.get('p1-veteran').damage, 1);

  passRound(state); // end
  assert.equal(state.turn.step, 'cleanup');
  assert.equal(state.objects.get('p1-veteran').damage, 0);

  passRound(state); // cleanup → następna tura gracza p2 (3, bo zaczęliśmy od 2)
  assert.equal(state.turn.number, 3);
  assert.equal(state.turn.activePlayerId, 'p2');
  assert.equal(state.turn.step, 'untap');

  // Zasoby p2 są gotowe; land p1 odstanie dopiero w jego własnym untapie.
  assert.equal(state.players[1].mana, 0);
  assert.equal(state.players[1].landPlays, 1);
  assert.equal(state.objects.get(landId).tapped, true);
  assert.ok(state.events.some((e) => e.type === 'turn_started' && e.playerId === 'p2'));

  // Cała sekwencja kroków została zgłoszona zdarzeniami w oczekiwanym porządku.
  assert.deepEqual(advancedSteps(state), [
    'upkeep', 'draw', 'main', 'beginning_of_combat', 'declare_attackers',
    'declare_blockers', 'combat_damage', 'end_of_combat', 'main', 'end', 'cleanup', 'untap',
  ]);
});

test('pełna tura jest odtwarzalna z zapisu komend', () => {
  const state = buildState();
  passRound(state);
  passRound(state);
  // M101/A: krok dobierania nie wymaga komendy (akcja turowa).
  passRound(state);
  doFor(state, 'p1', 'play_land');
  doFor(state, 'p1', 'cast_permanent');
  passRound(state); // T1: rozstrzyga czar stwora
  passRound(state);
  passRound(state);
  doFor(state, 'p1', 'declare_attackers');
  doFor(state, 'p2', 'declare_blockers');
  doFor(state, 'p1', 'resolve_combat');
  passRound(state);
  passRound(state);
  passRound(state);
  passRound(state);

  const verification = verifyReplay(replayFromState(state), () => {
    const fresh = buildState();
    return fresh;
  }, execute);
  assert.equal(verification.deterministic, true);
  assert.equal(verification.results.length, state.commands.length);
});
