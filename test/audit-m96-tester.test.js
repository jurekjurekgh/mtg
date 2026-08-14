// M96 — audyt Żywym Testerem (rola gracza): 12 partii na 9 taliach.
//
// Osie audytu (docs/setup/TESTER_STOLU.md → „Czego szukać"):
//  1. bezsensowne działania bota,
//  2. kompletność informacji w logu i modalu „Ruch przeciwnika"
//     („wszystko poza szumem powinno tam być"),
//  3. ptaszki wyciszenia auto-pass.
//
// Każdy test odtwarza to, CO WIDZIAŁ GRACZ w transkrypcie.
//
// UWAGA METODYCZNA: część pierwotnych podejrzeń odpadła po sprawdzeniu, czy
// obok „niemego" zdarzenia engine emituje inne, które niesie tę samą treść
// (np. poświęcenie przez exploit opisuje zdarzenie `exploited`, a discover
// bez trafienia — `discover_started`). Zgłaszamy tylko realne luki.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent, ZONE_LABELS } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function describe(event) {
  return describeGameEvent(event, {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => 'Goblin Piker',
    isPlayer: (id) => ['p1', 'p2'].includes(id),
  }, NAMES);
}

// =============================================================================
// OŚ 2 — kompletność informacji dla gracza
// =============================================================================

test('M96/1: nadanie keywordu (haste) jest widoczne — gracz wie, czemu stwór atakuje', () => {
  // Transkrypt: stwór bota wchodzi i od razu atakuje (Awaken the Sleeper,
  // Cogwork Assembler). Gracz nie ma w logu ANI SŁOWA o nadaniu pośpiechu.
  // Engine emituje `keyword_granted`, ale zdarzenie nie miało opisu.
  const text = describe({
    type: 'keyword_granted', objectId: 'o1', cardId: 'goblin-piker', keywords: ['haste'],
  });
  assert.ok(text, 'nadanie keywordu MUSI być widoczne w logu');
  assert.match(text, /Goblin Piker/, 'opis musi nazywać kartę');
  assert.match(text, /pośpiech/i, 'keyword po polsku — spójnie z resztą UI');
});

test('M96/1b: nadanie kilku keywordów wymienia wszystkie', () => {
  const text = describe({
    type: 'keyword_granted', objectId: 'o1', cardId: 'goblin-piker',
    keywords: ['flying', 'trample'],
  });
  assert.match(text, /latanie/i);
  assert.match(text, /zadeptywanie/i);
});

test('M96/2: proliferate_resolved nie pokazuje surowej nazwy zdarzenia', () => {
  // Gracz widział w logu dosłownie „proliferate_resolved" — przeciek
  // techniczny z protokołu do interfejsu.
  const text = describe({ type: 'proliferate_resolved', playerId: 'p2' });
  assert.doesNotMatch(String(text ?? ''), /proliferate_resolved/,
    'log nie może pokazywać surowego identyfikatora zdarzenia');
});

test('M96/3: modal ruchu bota nie pokazuje angielskich nazw stref', async () => {
  // Transkrypt (co widział gracz):
  //   „Nieprzyjaciel: Segmented Krotiq — library → hand"
  //   „Ty: Bomat Bazaar Barge — battlefield → exile"
  // Reszta UI jest po polsku; to przeciek identyfikatorów stref z engine.
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const start = source.indexOf('function noteBotMove');
  assert.ok(start > 0, 'noteBotMove musi istnieć');
  const body = source.slice(start, start + 4000);
  assert.doesNotMatch(body, /\$\{e\.fromZone \?\? '\?'\} → \$\{e\.toZone \?\? '\?'\}/,
    'modal ruchu bota nie może sklejać surowych identyfikatorów stref');
  assert.match(body, /ZONE_LABELS|zoneLabel/,
    'nazwy stref muszą przechodzić przez słownik polskich etykiet');
});

test('M96/3b: słownik stref tłumaczy wszystkie strefy gry', () => {
  for (const zone of ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack']) {
    const label = ZONE_LABELS?.[zone];
    assert.ok(label, `brak polskiej etykiety dla strefy ${zone}`);
    assert.notEqual(label, zone, `etykieta strefy ${zone} to surowy identyfikator`);
  }
});

// --- Strażniki: informacje, które JUŻ działają (nie wolno ich zgubić) -------

test('M96 strażnik: poświęcenie przez exploit jest widoczne (zdarzenie `exploited`)', () => {
  const text = describe({ type: 'exploited', exploiterId: 's1', exploitedId: 'o1' });
  assert.match(text, /Goblin Piker/, 'gracz musi widzieć, kogo poświęcono');
});

test('M96 strażnik: discover bez trafienia widać przez `discover_started`', () => {
  const started = describe({ type: 'discover_started', playerId: 'p2', amount: 3 });
  assert.match(started, /discover/i, 'początek discover musi być w logu');
});

test('M96 strażnik: obrót karty widać przez `turned_face_up` / `object_transformed`', () => {
  assert.ok(describe({ type: 'turned_face_up', objectId: 'o1', cardId: 'goblin-piker' }));
  assert.match(
    describe({ type: 'object_transformed', objectId: 'o1', fromCardId: 'goblin-piker', cardId: 'ballista-watcher' }),
    /przemienia się/,
  );
});

// =============================================================================
// OŚ 1 — bezsensowne działania bota
// =============================================================================

test('M96/4: bot NIE mieli własnej biblioteki, gdy może zmielić przeciwnika (Cellar Door)', () => {
  // Transkrypt: „Nieprzyjaciel aktywuje zdolność: Cellar Door → cel:
  // Nieprzyjaciel" — SIEDEM razy w jednej partii. Cellar Door: „Target player
  // mills 1. If it's a creature card, YOU create a 2/2 Zombie" — token dostaje
  // kontroler NIEZALEŻNIE od celu, więc mielenie siebie jest ściśle gorsze
  // (przybliża własny deck-out bez żadnego zysku).
  //
  // Root cause: scoring `activate_ability` w ogóle nie wyceniał efektów
  // mill/damage/lose_life względem CELU — każdy wariant dostawał `score = 2`.
  // Ścieżka `cast_spell` rozróżnia własny/wrogi mill — niespójność.
  const state = createGameState({ seed: 96, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const card = REGISTRY.get('cellar-door');
  addObject(state, {
    id: 'door', instanceId: 'i-door', cardId: 'cellar-door', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  });

  const view = playerView(state, 'p2');
  const offered = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'door');
  assert.ok(offered.length >= 2, 'engine oferuje oba cele — wybór należy do bota');

  const choice = createHeuristicBot({ seed: 96 }).chooseCommand(view, {});
  if (choice.type === 'activate_ability' && choice.objectId === 'door') {
    assert.deepEqual(choice.targets, ['p1'],
      `bot mieli WŁASNĄ bibliotekę zamiast biblioteki przeciwnika: ${JSON.stringify(choice)}`);
  }
});

test('M96/4b: bot nie kieruje w siebie zdolności zadającej obrażenia', () => {
  // Ta sama luka wyceny dotyczy „deals N damage to any target" (Ballista
  // Watcher): cel-gracz nie był w ogóle wyceniany.
  const state = createGameState({ seed: 98, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const card = REGISTRY.get('ballista-watcher');
  addObject(state, {
    id: 'bw', instanceId: 'i-bw', cardId: 'ballista-watcher', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  });
  state.objects.set('bw', Object.freeze({ ...state.objects.get('bw'), summoningSickness: false }));

  const choice = createHeuristicBot({ seed: 98 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'activate_ability' && choice.objectId === 'bw') {
    assert.notDeepEqual(choice.targets, ['p2'],
      `bot celuje zdolnością obrażeniową w SIEBIE: ${JSON.stringify(choice)}`);
  }
});
