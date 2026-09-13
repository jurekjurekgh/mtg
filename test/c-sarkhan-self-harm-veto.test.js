// C — znalezisko właściciela z testów (Sarkhan's Rage): bot przy 1 życiu
// rzucał Sarkhan's Rage we wrogi cel bez Smoka i ginął od własnych 2 obrażeń.
// Mechanizm: samouszkodzenie siedzi w `conditional` (controlsNoCreatureSubtype
// → damage_to_controller), a bot nie czytał ANI wrappera `conditional`, ANI
// typu `damage_to_controller` — widział tylko „5 obrażeń we wroga".
// Naprawa (lustro M169/K dla czarów, ADR 0002): selfHarmPenalty rozwija
// warunkowe samouszkodzenie (gałąź wg warunku z PlayerView; warunek
// nieweryfikowalny = konserwatywnie „zachodzi"), a gałąź cast_spell wetuje
// rzut samobójczy twardo (finish(-1000), jak ETB w M169/K).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function scenario({ life, withDragon }) {
  const s = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.players.find((p) => p.id === 'p1').life = life;
  const rage = gameObjectDataOf(REGISTRY.get('sarkhans-rage'));
  addObject(s, {
    id: 'rage', instanceId: 'i-rage', cardId: 'sarkhans-rage', controllerId: 'p1',
    zone: 'hand', kind: rage.kind, manaCost: rage.manaCost, spell: rage.spell,
    abilities: [], keywords: [], subtypes: [], types: rage.types ?? ['Instant'], colors: ['R'],
  });
  const p1 = s.players.find((p) => p.id === 'p1');
  p1.mana = 6;
  p1.manaPool = { R: 1 };
  // Wrogi cel wart 5 obrażeń.
  addObject(s, {
    id: 'foe', instanceId: 'i-foe', cardId: 'x-test', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 5, toughness: 5, abilities: [], subtypes: [], types: ['Creature'],
  });
  s.objects.set('foe', Object.freeze({ ...s.objects.get('foe'), summoningSickness: false }));
  if (withDragon) {
    addObject(s, {
      id: 'drake', instanceId: 'i-drake', cardId: 'x-test', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', power: 4, toughness: 4, abilities: [], subtypes: ['Dragon'], types: ['Creature'],
    });
    s.objects.set('drake', Object.freeze({ ...s.objects.get('drake'), summoningSickness: false }));
  }
  return s;
}

function botCastsRage(state) {
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
  return cmd?.type === 'cast_spell' && cmd?.objectId === 'rage' ? cmd : null;
}

test('C/1: 1 życie, brak Smoka — bot NIE rzuca Sarkhana (samobójstwo wetowane)', () => {
  const cmd = botCastsRage(scenario({ life: 1, withDragon: false }));
  assert.equal(cmd, null, 'rzut = śmierć od własnych 2 obrażeń; bot musi spasować');
});

test('C/2: 10 żyć, brak Smoka — bot MOŻE rzucić (wymiana 5-za-2 opłacalna)', () => {
  const cmd = botCastsRage(scenario({ life: 10, withDragon: false }));
  assert.ok(cmd, 'przy zdrowym życiu kara nie może blokować dobrej wymiany (anty-over-fix)');
});

test('C/3: 1 życie ZE Smokiem — bot rzuca (warunek niespełniony, brak samouszkodzenia)', () => {
  const cmd = botCastsRage(scenario({ life: 1, withDragon: true }));
  assert.ok(cmd, 'Smok na stole = brak 2 obrażeń w siebie; weto nie może strzelać');
});
