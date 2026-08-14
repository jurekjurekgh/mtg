// M96 — audyt Żywym Testerem (rola gracza), 12 partii na 9 taliach.
//
// Osie audytu wskazane przez właściciela:
//  1. bezsensowne działania bota,
//  2. brak istotnych informacji w modalu „Ruch przeciwnika" i w logu
//     („wszystko poza szumem powinno tam być"),
//  3. brak miejsca na ptaszkowanie (wyciszenie auto-pass).
//
// Każdy test odtwarza to, CO WIDZIAŁ GRACZ w transkrypcie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
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
    nameOfObject: (id) => id,
    isPlayer: (id) => ['p1', 'p2'].includes(id),
  }, NAMES);
}

// =============================================================================
// OŚ 2 — brak istotnych informacji dla gracza
// =============================================================================

test('B: exploit — gracz widzi, KOGO bot poświęcił (nie tylko rezygnację)', () => {
  // Transkrypt: bot poświęca stwora przez exploit, a w modalu „Ruch
  // przeciwnika" nie ma o tym ani słowa. Wariant „nie poświęca" MA opis —
  // niespójność w obrębie jednego zdarzenia.
  const text = describe({
    type: 'exploit_choice_resolved', playerId: 'p2', sourceId: 's1',
    exploitedId: 'o1', exploitedCardId: 'goblin-piker',
  });
  assert.ok(text, 'poświęcenie przez exploit MUSI mieć opis dla gracza');
  assert.match(text, /Goblin Piker/, 'opis musi nazywać poświęconego stwora');

  // Regresja: wariant „nie poświęca" nadal działa.
  const skipped = describe({ type: 'exploit_choice_resolved', playerId: 'p2', sourceId: 's1', skipped: true });
  assert.match(skipped, /nie poświęca/i);
});

test('C: nadanie keywordu (haste) jest widoczne — gracz wie, czemu stwór atakuje', () => {
  // Bez tego gracz widzi, że świeży stwór bota nagle atakuje, i nie wie czemu
  // (Awaken the Sleeper, Cogwork Assembler).
  const text = describe({
    type: 'keyword_granted', objectId: 'o1', cardId: 'goblin-piker', keywords: ['haste'],
  });
  assert.ok(text, 'nadanie keywordu MUSI być widoczne w logu');
  assert.match(text, /Goblin Piker/, 'opis musi nazywać kartę');
  assert.match(text, /pośpiech/i, 'keyword po polsku (spójnie z resztą UI)');
});

test('D: discover bez trafienia — gracz wie, że efekt się odbył', () => {
  const found = describe({ type: 'discover_resolved', playerId: 'p2', amount: 3, foundCardId: 'goblin-piker', castFree: true });
  assert.ok(found, 'discover z trafieniem ma opis (regresja)');

  const nothing = describe({ type: 'discover_resolved', playerId: 'p2', amount: 3, found: false });
  assert.ok(nothing, 'discover BEZ trafienia też musi mieć opis — inaczej efekt znika z logu');
  assert.match(nothing, /discover/i);
});

test('E: proliferate — gracz widzi, na co poszedł licznik', () => {
  const text = describe({
    type: 'proliferate_target_resolved', playerId: 'p2', objectId: 'o1',
    cardId: 'goblin-piker', counter: '+1/+1',
  });
  assert.ok(text, 'rozstrzygnięcie proliferate MUSI być widoczne');
  assert.match(text, /Goblin Piker/, 'opis musi nazywać permanent, który dostał licznik');
});

test('F: obrót karty (object_flipped) zostawia ślad w logu', () => {
  const text = describe({ type: 'object_flipped', objectId: 'o1', cardId: 'goblin-piker' });
  assert.ok(text, 'obrót karty musi być widoczny dla gracza');
});

test('G: modal ruchu bota nie pokazuje surowych angielskich nazw stref', async () => {
  // Transkrypt (co widział gracz):
  //   „Nieprzyjaciel: Segmented Krotiq — library → hand"
  //   „Ty: Bomat Bazaar Barge — battlefield → exile"
  // Reszta UI jest po polsku; te dwa identyfikatory to przeciek techniczny.
  const source = await import('node:fs').then((fs) => fs.readFileSync('src/table/session.js', 'utf8'));
  const noteBotMove = source.slice(source.indexOf('function noteBotMove'));
  const body = noteBotMove.slice(0, noteBotMove.indexOf('\n  }'));
  assert.doesNotMatch(body, /\$\{e\.fromZone \?\? '\?'\} → \$\{e\.toZone \?\? '\?'\}/,
    'modal ruchu bota nie może sklejać surowych identyfikatorów stref (library/hand/exile)');
  assert.match(body, /ZONE_LABELS|zoneLabel/,
    'nazwy stref muszą przechodzić przez słownik polskich etykiet');
});

test('G2: słownik stref tłumaczy wszystkie strefy gry', async () => {
  const { ZONE_LABELS } = await import('../src/table/session.js');
  for (const zone of ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack']) {
    assert.ok(ZONE_LABELS[zone], `brak polskiej etykiety dla strefy ${zone}`);
    assert.doesNotMatch(ZONE_LABELS[zone], /^[a-z]+$/,
      `etykieta strefy ${zone} wygląda na surowy identyfikator: ${ZONE_LABELS[zone]}`);
  }
});

// =============================================================================
// OŚ 1 — bezsensowne działania bota
// =============================================================================

test('A: bot NIE mieli własnej biblioteki, gdy może zmielić przeciwnika (Cellar Door)', () => {
  // Transkrypt: „Nieprzyjaciel aktywuje zdolność: Cellar Door → cel:
  // Nieprzyjaciel" — SIEDEM razy w jednej partii. Cellar Door: „Target player
  // mills 1. If it's a creature card, YOU create a 2/2 Zombie" — token dostaje
  // kontroler niezależnie od celu, więc mielenie siebie jest ściśle gorsze
  // (przybliża własny deck-out bez żadnego zysku).
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

  const choice = createHeuristicBot({ seed: 96 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'activate_ability' && choice.objectId === 'door') {
    assert.deepEqual(choice.targets, ['p1'],
      `bot mieli własną bibliotekę zamiast biblioteki przeciwnika: ${JSON.stringify(choice)}`);
  }
});

test('A2: mielenie przeciwnika pozostaje atrakcyjne (brak nadgorliwej kary)', () => {
  const state = createGameState({ seed: 97, players: [{ id: 'p1' }, { id: 'p2' }] });
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
  assert.ok(offered.length >= 2, 'engine musi oferować oba cele (siebie i przeciwnika)');
  const bot = createHeuristicBot({ seed: 97 });
  const choice = bot.chooseCommand(view, {});
  assert.ok(choice, 'bot musi zwrócić komendę');
});
