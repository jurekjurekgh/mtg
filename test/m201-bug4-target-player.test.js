// M201 — polowanie na błędy (odznaka), znalezisko #4:
// „TARGET PLAYER” ZAWĘŻONE DO PRZECIWNIKA.
//
// Dementia Bat: „{4}{B}, Sacrifice this creature: Target PLAYER discards two
// cards.” Deskryptor celu w danych mówił `{ type: 'opponent' }`, więc gracz
// NIE MÓGŁ wskazać samego siebie — a to legalny cel (CR 115.4: cel wybiera
// się spośród wszystkiego, co spełnia opis; „target player” obejmuje ciebie).
//
// To nie jest teoretyczna różnica: w katalogu są karty madness (Revolutionist),
// dla których własny zrzut kart jest sensownym zagraniem, a każde zawężenie
// legalnych celów zmienia wynik partii. Ta sama klasa błędu, którą właściciel
// rozstrzygnął w M200/A: „legalny cel = zdolność musi móc go wskazać”.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

test('BUG4: „target player” pozwala wskazać SIEBIE (CR 115.4)', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('dementia-bat');
  addObject(state, {
    id: 'bat', instanceId: 'i-bat', cardId: 'dementia-bat', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set('bat', Object.freeze({ ...state.objects.get('bat'), summoningSickness: false }));
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `sw${i}`, instanceId: `i-sw${i}`, cardId: 'basic-swamp', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'], abilities: [],
    });
  }
  const targets = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'bat')
    .flatMap((c) => c.targets ?? []);
  assert.ok(targets.includes('p2'), 'przeciwnik jest legalnym celem');
  assert.ok(targets.includes('p1'),
    `„target player” obejmuje kontrolera — oferty: ${JSON.stringify(targets)}`);
});

/**
 * STRAŻNIK KLASY (L56 — porównanie dwóch reprezentacji tych samych danych):
 * Oracle mówi „target player”, a deskryptor zawęża do `opponent` (albo
 * odwrotnie) = cicha zmiana legalności celów. Nowa karta z takim rozjazdem
 * czerwienieje PRZED scaleniem.
 */
test('BUG4 (strażnik): deskryptory celu-gracza zgodne z Oracle', () => {
  const problems = [];
  for (const card of REGISTRY.all()) {
    const oracle = (card.oracleText ?? '').toLowerCase();
    const specs = JSON.stringify([
      card.spell?.targets ?? [],
      (card.abilities ?? []).map((a) => [a.targets ?? null, a.trigger?.requiresTarget ?? null]),
    ]);
    const saysOpponent = /target opponent/.test(oracle);
    const saysPlayer = /target player/.test(oracle);
    const specOpponent = /"type":"opponent"/.test(specs);
    const specPlayer = /"type":"player"/.test(specs);
    if (saysPlayer && !saysOpponent && specOpponent && !specPlayer) {
      problems.push(`${card.id}: Oracle „target player”, deskryptor zawęża do opponent`);
    }
    if (saysOpponent && !saysPlayer && specPlayer && !/"opponent":true|"prefer":"opponent"/.test(specs)) {
      problems.push(`${card.id}: Oracle „target opponent”, deskryptor dopuszcza dowolnego gracza`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
