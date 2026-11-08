// Audyt PR #183, F1 (2026-11-08c): wynik efektu opartego o `source_power`
// nie może być ujemny. CR 107.1b: „If a calculation that would determine
// the result of an effect yields a negative number, zero is used instead,
// unless that effect doubles, triples, or sets to a specific value […] the
// power and/or toughness of a creature or creature card.” Ruling Gruul
// Beastmaster (RNA, 2019-01-25, Scryfall): „If Gruul Beastmaster’s power
// is negative as its triggered ability resolves, X is considered to be 0.
// In other words, that ability can’t cause the creature to lose power.”
//
// Ważne rozróżnienie: MOC ŹRÓDŁA może być ujemna (to cecha gry), ale WYNIK
// EFEKTU +X/+0 ma dolne zero. Clamp nie należy do effectivePower.
// Nośnik debuffu i efekt buff_creature są SYNTETYCZNE (ADR 0029) — w
// katalogu nie ma karty, która wystawiałaby dokładnie ten kształt.
//
// Mutacja: usunięcie dolnego zera z gałęzi `source_power` wspólnego
// resolvera delty → F1-1, F1-2, F1-3 i F1-6 czerwienieją; F1-4/F1-5
// (zero i dodatnia moc) pozostają zielone jako kontrola zakresu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { temporaryPumpOf } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1') {
  const state = createGameState({ seed: 183, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  // L21: pole spoza kontraktu addObject nadajemy PO utworzeniu obiektu.
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function run(state, command) {
  assert.ok(command, 'oferta istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result.events));
  return result;
}

function passBoth(state) {
  for (let i = 0; i < 2; i++) run(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

/** Legalna zdolność syntetyczna -3/+3 na realnym nośniku (nie nowa karta). */
function debuffSource(state, sourceId) {
  const source = state.objects.get(sourceId);
  const synthetic = { type: 'activated', cost: {}, effect: { type: 'pump', power: -3, toughness: 3 } };
  state.objects.set(sourceId, Object.freeze({ ...source, abilities: [synthetic, ...(source.abilities ?? [])] }));
  const view = playerView(state, 'p1');
  run(state, view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId && c.abilityIndex === 0));
  passBoth(state);
  assert.ok(effectivePower(state.objects.get(sourceId), state) < 0, 'kontrola: źródło ma ujemną moc');
}

test('F1-1: Beastmaster z ujemną mocą atakuje — trigger daje +0/+0, nie obniża celu', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  debuffSource(state, 'beast'); // 2/2 → -1/5
  assert.equal(effectivePower(state.objects.get('beast'), state), -1, 'ujemna moc źródła pozostaje cechą gry');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] });
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 2, 'X=0: cel nie traci mocy (ruling RNA 2019-01-25)');
  assert.equal(state.objects.get('elk').powerModifier ?? 0, 0, 'żadna ujemna delta nie została zapisana');
});

test('F1-2: buff_creature_until_end_of_turn z ujemnym source_power daje +0/+0', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  debuffSource(state, 'beast');
  const source = state.objects.get('beast');
  const synthetic = { type: 'activated', cost: {}, targets: [{ type: 'creature' }], effect: { type: 'buff_creature_until_end_of_turn', power: 'source_power', toughness: 'source_power' } };
  state.objects.set('beast', Object.freeze({ ...source, abilities: [...source.abilities, synthetic] }));
  // Bezpośrednia komenda execute: po naprawie delta 0 jest no-opem, więc
  // enumeracja ofert może ją słusznie ukryć (M104); test sprawdza resolver.
  run(state, { type: 'activate_ability', playerId: 'p1', objectId: 'beast', abilityIndex: source.abilities.length, targets: ['elk'] });
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 2, 'moc celu bez zmian');
  assert.equal(effectiveToughness(state.objects.get('elk'), state), 1, 'wytrzymałość celu bez zmian (Highland Game 2/1)');
});

test('F1-3: Jyoti z ujemną mocą nie obniża land creatures (ta sama rodzina delty)', () => {
  const state = game();
  putCard(state, 'jyoti', 'jyoti-moag-ancient');
  putCard(state, 'dryad', 'token_forest_dryad', { kind: 'creature', power: 1, toughness: 1, isToken: true });
  debuffSource(state, 'jyoti'); // 2/4 → -1/7
  // Dwa pasy z pustego stosu w main1 przechodzą do beginning_of_combat
  // i odpalają trigger Jyoti (jumpToStep sam nie emituje triggerów kroku).
  passBoth(state);
  assert.ok(state.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'beginning_of_combat'), 'kontrola: trigger początku walki wszedł na stos');
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('dryad'), state), 1, 'land creature bez ujemnej delty');
  assert.equal(effectiveToughness(state.objects.get('dryad'), state), 1, 'wytrzymałość bez ujemnej delty');
});

test('F1-4 (kontrola): zerowa moc źródła daje +0/+0', () => {
  const state = game('declare_attackers');
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  state.objects.set('beast', Object.freeze({ ...state.objects.get('beast'), powerModifier: -2 })); // moc 0
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] });
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 2);
});

test('F1-5 (kontrola): dodatnia moc źródła nadal daje +X/+0', () => {
  const state = game('declare_attackers');
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] });
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 4, '2 + X(2)');
});

test('F1-6: projekcja bota temporaryPumpOf zeruje ujemny source_power', () => {
  const view = { zones: { battlefield: [], graveyard: [] } };
  const source = { id: 's', power: -1, toughness: 5 };
  const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'source_power', toughness: 'source_power' }, view, source);
  assert.deepEqual(pump, { power: 0, toughness: 0 }, 'bot nie może wyceniać ujemnego X jako zysku/straty innej niż silnik');
});
