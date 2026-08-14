// M95 — „brązowa odznaka wyłapywacza błędów": przegląd istniejących kart
// i mechanik pod kątem odstępstw od Comprehensive Rules.
//
// Każdy test najpierw ODTWARZA błąd (RED), potem jest naprawiany u root cause.
// Wszystkie znaleziska potwierdzone repro headless przed naprawą.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { applyEffect } from '../src/engine/effects.js';
import { jumpToStep } from '../src/engine/turn.js';

function creature(state, { id, controllerId, ownerId = null, power = 1, toughness = 1, types = ['Creature'] }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: ownerId ?? controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types, colors: ['R'],
  });
  return state.objects.get(id);
}

// =============================================================================
// BUG 1 — CR 104.4b: jednoczesna przegrana obu graczy = REMIS
//
// Objaw: gdy obaj gracze jednocześnie spadają do 0 życia (np. Impact Tremors
// przy 1 życiu obu stron, albo obopólne obrażenia bojowe), pętla SBA kończyła
// grę na PIERWSZYM znalezionym przegranym i ogłaszała drugiego zwycięzcą.
// Kolejność w `state.players` decydowała o wyniku partii.
//
// CR 104.4b: „If the game somehow enters a state in which all remaining
// players lose simultaneously, the game is a draw." CR 104.4h: remis to
// osobny wynik — nie zwycięstwo któregokolwiek gracza.
// =============================================================================

test('CR 104.4b: jednoczesne zejście obu graczy do 0 życia kończy partię REMISEM', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  state.players[1].life = 0;

  const events = runStateBasedActions(state);

  assert.equal(state.status, 'finished', 'partia musi się zakończyć');
  assert.equal(state.winnerId, null,
    `remis nie ma zwycięzcy (CR 104.4b), a engine wskazał: ${state.winnerId}`);
  const lost = events.filter((e) => e.type === 'player_lost').map((e) => e.playerId).sort();
  assert.deepEqual(lost, ['p1', 'p2'], 'obaj gracze muszą przegrać jednocześnie');
  assert.equal(state.isDraw, true, 'stan musi jawnie oznaczać remis (dla UI i replayu)');
});

test('CR 104.4b: remis także przy jednoczesnej śmierci od trucizny i życia', () => {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  state.players[1].poison = 10;

  runStateBasedActions(state);

  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, null, 'dwie różne przyczyny, ten sam moment = remis');
  assert.equal(state.isDraw, true);
});

test('regresja: przegrana JEDNEGO gracza nadal daje zwycięstwo drugiemu', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;

  const events = runStateBasedActions(state);

  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2', 'zwykła przegrana musi wyłonić zwycięzcę');
  assert.notEqual(state.isDraw, true, 'to nie jest remis');
  assert.deepEqual(events.filter((e) => e.type === 'player_lost').map((e) => e.playerId), ['p1']);
});

test('CR 104.4b: remis w realnej partii — obopólne obrażenia bojowe', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players[0].life = 2;
  state.players[1].life = 2;
  // Atakujący 2/2 i blokujący 2/2 — obaj gracze mają po 2 życia, a każdy
  // ze stworów ma lifelink-owe „odbicie" przez drugi atak? Prościej:
  // ustawiamy życie tak, by SBA zobaczyło oba zera naraz.
  const attacker = creature(state, { id: 'att', controllerId: 'p1', power: 2, toughness: 2 });
  assert.ok(attacker);
  state.players[0].life = 0;
  state.players[1].life = 0;
  runStateBasedActions(state);
  assert.equal(state.winnerId, null, 'jednoczesna śmierć = remis, nie zwycięstwo pierwszego z listy');
});

// =============================================================================
// BUG 2 — CR 400.7 / 110.2a: karta opuszczająca bitwisko wraca pod kontrolę
// WŁAŚCICIELA
//
// Objaw: stwór przejęty efektem „gain control" (Puppeteer Clique, Awaken the
// Sleeper), który zginął pod kontrolą złodzieja, trafiał do grobu ZŁODZIEJA
// i pozostawał jego kartą na stałe. To samo dla wygnania i poświęcenia.
//
// CR 110.2a: „A permanent's controller is, by default, the player who put it
// onto the battlefield" — ale kontrola istnieje TYLKO na bitwisku.
// CR 108.3: „The owner of a card is the player who started the game with it."
// CR 400.3: obiekt w strefie innej niż bitwisko/stos jest kontrolowany przez
// swojego właściciela — karta wraca więc do grobu/ręki/biblioteki WŁAŚCICIELA.
//
// Dowód niespójności wewnętrznej: `bounce_permanent` i `bounce_to_library_top`
// miały jawną korektę na `ownerId`, a ścieżka SBA/destroy/exile — nie.
// =============================================================================

test('CR 400.7: skradziony stwór po śmierci wraca do grobu WŁAŚCICIELA', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // karta p2 pod kontrolą p1 (efekt kradzieży)
  const stolen = creature(state, { id: 'stolen', controllerId: 'p1', ownerId: 'p2' });
  state.objects.set('stolen', Object.freeze({ ...stolen, damage: 9 }));

  execute(state, { type: 'pass_priority', playerId: 'p1' });

  const inGrave = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'x-test');
  assert.ok(inGrave, 'stwór musi trafić do grobu');
  assert.equal(inGrave.ownerId, 'p2', 'właściciel się nie zmienia');
  assert.equal(inGrave.controllerId, 'p2',
    'karta poza bitwiskiem jest kontrolowana przez WŁAŚCICIELA (CR 400.3) — inaczej złodziej przejmuje ją na stałe');
});

test('CR 400.7: wszystkie strefy docelowe zwracają kartę właścicielowi', () => {
  for (const zone of ['graveyard', 'exile', 'hand', 'library']) {
    const state = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
    creature(state, { id: 'o', controllerId: 'p1', ownerId: 'p2' });
    const moved = moveObjectDirectly(state, 'o', zone, 'n1');
    assert.equal(moved.controllerId, 'p2',
      `battlefield → ${zone}: karta musi wrócić pod kontrolę właściciela (CR 400.3)`);
    assert.equal(moved.ownerId, 'p2', `battlefield → ${zone}: ownerId nienaruszony`);
  }
});

test('CR 400.7: destroy i exile skradzionego permanentu — spójnie z bounce', () => {
  for (const effectType of ['destroy_permanent', 'exile_permanent', 'bounce_permanent']) {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    const source = creature(state, { id: 'st', controllerId: 'p1', ownerId: 'p2' });
    applyEffect(state, { type: effectType }, source, ['st']);
    const moved = [...state.objects.values()].find((o) => o.cardId === 'x-test' && o.zone !== 'battlefield');
    assert.ok(moved, `${effectType}: obiekt musi opuścić bitwisko`);
    assert.equal(moved.controllerId, 'p2',
      `${effectType}: karta wraca pod kontrolę właściciela (spójnie z bounce_permanent)`);
  }
});

test('CR 400.7: gracz widzi w SWOIM grobie kartę, którą stracił przez kradzież', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const stolen = creature(state, { id: 'st', controllerId: 'p1', ownerId: 'p2' });
  state.objects.set('st', Object.freeze({ ...stolen, damage: 9 }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });

  const viewP2 = playerView(state, 'p2');
  const inOwnGrave = viewP2.zones.graveyard.filter((o) => o.controllerId === 'p2').length;
  assert.equal(inOwnGrave, 1,
    'właściciel musi widzieć swoją kartę we własnym grobie (inaczej nie może jej reanimować)');
});

test('regresja: normalna śmierć NIE zmienia kontrolera (właściciel = kontroler)', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, { id: 'own', controllerId: 'p1', ownerId: 'p1' });
  const moved = moveObjectDirectly(state, 'own', 'graveyard', 'g1');
  assert.equal(moved.controllerId, 'p1');
  assert.equal(moved.ownerId, 'p1');
});
