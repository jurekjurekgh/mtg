import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { hasCounter } from '../src/engine/counters.js';
import fs from 'node:fs';

/**
 * Pierwszy batch realnych kart (Etap 2, ADR 0010): Highland Game (KTK),
 * Kappa Tech-Wrecker (NEO) i Segmented Krotiq (DTK). Dane Oracle pobrane
 * ze Scryfall (docs/cards/scryfall-*.json); testy weryfikują zachowanie
 * w symulatorze — triggery, liczniki, ninjutsu i megamorph.
 */

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



/** Registry jak w produkcji — definicje dostarczają abilities/morph/liczniki. */
const REGISTRY = createCardRegistry();

/** Main phase p1 z podaną ilością many. */
function mainPhase(state, mana = 0) {
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  if (mana > 0) addMana(state, 'p1', mana);
  return state;
}

function addHand(state, id, cardId, { power, toughness, manaCost, morph, entersWithCounters, abilities } = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand',
    kind: 'creature', power: power ?? def?.power, toughness: toughness ?? def?.toughness,
    manaCost: manaCost ?? def?.manaCost, morph: morph ?? def?.morph ?? null,
    entersWithCounters: entersWithCounters ?? def?.entersWithCounters ?? null,
    abilities: abilities ?? def?.abilities ?? [],
  });
}

function addBattlefield(state, id, cardId, controllerId, { kind = 'creature', power, toughness, abilities } = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', kind,
    power: power ?? def?.power, toughness: toughness ?? def?.toughness,
    abilities: abilities ?? def?.abilities ?? [],
  });
}

function passRoundResolving(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  let rounds = 0;
  for (;;) {
    const holder = state.turn.priorityPlayerId;
    const r1 = execute(state, { type: 'pass_priority', playerId: holder });
    if (!r1.ok) break;
    if (state.zones.stack.length === 0 && rounds >= 1) break;
    const r2 = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r2.ok) break;
    rounds += 1;
    if (state.zones.stack.length === 0 && rounds >= 1) break;
    if (rounds > 12) break;
  }
}

// --- Highland Game: dies trigger --------------------------------------

test('Highland Game: śmierć w walce daje kontrolerowi 2 życia', () => {
  const state = game();
  addBattlefield(state, 'elk', 'highland-game', 'p1', { power: 2, toughness: 1 });
  addBattlefield(state, 'bear', 'highland-game', 'p2', { power: 2, toughness: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['elk'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { elk: ['bear'] } });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  // Highland Game (2/1) ginie od 2 obrażeń blokera; trigger daje +2 życia.
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'dies'), 'brak zdarzenia triggera dies');
  passRoundResolving(state); // T6: dies trigger ze stosu
  assert.equal(state.players.find((p) => p.id === 'p1').life, 22);
  assert.ok(state.events.some((e) => e.type === 'life_changed' && e.playerId === 'p1' && e.after === 22), 'brak zmiany życia z triggera');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'highland-game'), 'Highland Game nie ma w grobie');
});

test('Highland Game: brak triggera, gdy stwór przeżyje', () => {
  const state = game();
  addBattlefield(state, 'elk', 'highland-game', 'p1', { power: 2, toughness: 1 });
  // Bloker 0/1 nie zada śmiertelnych obrażeń.
  addBattlefield(state, 'chump', 'syn-apprentice-standin', 'p2', { power: 0, toughness: 1 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['elk'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { elk: ['chump'] } });
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20);
  assert.equal(state.objects.get('elk').zone, 'battlefield');
});

test('Highland Game: trigger odpala się też po śmierci z czaru (obrażenia)', () => {
  const state = mainPhase(game(), 1);
  addBattlefield(state, 'elk', 'highland-game', 'p1', { power: 2, toughness: 1 });
  addObject(state, {
    id: 'shock', instanceId: 'i-shock', cardId: 'syn-shock', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
  });
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['elk'] });
  passRoundResolving(state);
  assert.equal(state.players.find((p) => p.id === 'p1').life, 22, 'brak życia z dies triggera po czarze');
});

// --- Kappa Tech-Wrecker: wejście z licznikiem, ninjutsu, trigger ------

test('Kappa Tech-Wrecker: wchodzi z licznikiem deathtouch', () => {
  const state = mainPhase(game(), 2);
  addHand(state, 'kappa', 'kappa-tech-wrecker', { power: 1, toughness: 3, manaCost: 2, entersWithCounters: { deathtouch: 1 } });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kappa' });
  assert.equal(result.ok, true);
  resolveStack(state); // T1: licznik ETB ląduje przy rozstrzygnięciu stosu
  assert.ok(state.events.some((e) => e.type === 'counter_added' && e.counter === 'deathtouch'), 'brak counter_added');
  const kappa = [...state.objects.values()].find((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'battlefield');
  assert.ok(kappa, 'Kappa nie ma na bitwisku');
  assert.ok(hasCounter(kappa, 'deathtouch'), 'brak licznika deathtouch');
  const view = playerView(state, 'p1');
  const battlefieldKappa = view.zones.battlefield.find((o) => o.id === kappa.id);
  assert.deepEqual(battlefieldKappa.counters, { deathtouch: 1 });
});

function ninjutsuSetup() {
  const state = game();
  addBattlefield(state, 'attacker', 'highland-game', 'p1', { power: 2, toughness: 2 });
  addHand(state, 'kappa', 'kappa-tech-wrecker', { power: 1, toughness: 3, manaCost: 2, entersWithCounters: { deathtouch: 1 } });
  // Krok obrażeń: atakujący zadeklarowani, blokerów brak, priorytet atakującego.
  state.combat = { attackingPlayerId: 'p1', attackers: ['attacker'], blockers: new Map() };
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.turn.activePlayerId = 'p1';
  addMana(state, 'p1', 2);
  return state;
}

test('Kappa Tech-Wrecker: ninjutsu zwraca atakującego i wchodzi zatapnięta i atakująca', () => {
  const state = ninjutsuSetup();
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'kappa' && c.attackerId === 'attacker');
  assert.ok(cmd, 'brak oferty ninjutsu z attackerId');
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.events[0]?.reason);
  // Atakujący wrócił do ręki p1 (nowy obiekt o nowym id — stary zniknął).
  const returned = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(returned, 'atakujący nie wrócił do ręki');
  assert.equal(state.combat.attackers.includes('attacker'), false);
  // Kappa jest na bitwisku: zatapnięta, atakująca, z licznikiem deathtouch.
  const kappa = [...state.objects.values()].find((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'battlefield');
  assert.ok(kappa, 'Kappa nie weszła na bitwisko');
  assert.equal(kappa.tapped, true);
  assert.ok(state.combat.attackers.includes(kappa.id), 'Kappa nie jest atakująca');
  assert.ok(hasCounter(kappa, 'deathtouch'), 'wejście przez ninjutsu nie dało licznika');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'koszt ninjutsu nie został zapłacony');
});

test('Kappa Tech-Wrecker: po ninjutsu zadaje obrażenia w walce', () => {
  const state = ninjutsuSetup();
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'kappa');
  execute(state, cmd);
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 19, 'Kappa nie zadała obrażeń');
});

test('Kappa Tech-Wrecker: ninjutsu nie działa na zablokowanego atakującego', () => {
  const state = ninjutsuSetup();
  state.combat.blockers.set('attacker', ['blocker']);
  addBattlefield(state, 'blocker', 'kappa-tech-wrecker', 'p2', { power: 2, toughness: 3 });
  const view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((c) => c.type === 'activate_ability' && c.keyword === undefined && c.objectId === 'kappa'), false);
  const anyNinjutsu = view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'kappa');
  assert.equal(anyNinjutsu, false, 'ninjutsu nie powinno być oferowane dla zablokowanego atakującego');
});

test('Kappa Tech-Wrecker: trigger po obrażeniach usuwa licznik i wygania artefakt', () => {
  const state = ninjutsuSetup();
  addBattlefield(state, 'artifact', 'syn-artifact', 'p2', { kind: 'artifact' });
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'kappa'));
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'combat_damage_to_player'), 'brak triggera combat damage');
  // Temat 2: „you may ... exile target artifact" — cel wybiera kontroler.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'artifact' }).ok);
  passRoundResolving(state); // T6: trigger ze stosu
  const kappa = [...state.objects.values()].find((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'battlefield');
  assert.equal(hasCounter(kappa, 'deathtouch'), false, 'licznik deathtouch nie został usunięty');
  assert.ok(state.zones.exile.some((id) => state.objects.get(id)?.cardId === 'syn-artifact'), 'artefakt nie został wygnany');
});

test('Kappa Tech-Wrecker: bez celu trigger nie odpala się (licznik zostaje)', () => {
  const state = ninjutsuSetup();
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'kappa'));
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(!result.events.some((e) => e.type === 'ability_triggered'), 'trigger nie powinien odpalić się bez celu');
  const kappa = [...state.objects.values()].find((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'battlefield');
  assert.ok(hasCounter(kappa, 'deathtouch'), 'licznik nie powinien zostać zdjęty bez celu');
});

// --- Segmented Krotiq: megamorph / morph ------------------------------

function krotiqInHand(state, mana) {
  mainPhase(state, mana);
  addHand(state, 'krotiq', 'segmented-krotiq', {
    power: 6, toughness: 5, manaCost: 6, morph: { cost: 3, megamorphCost: 7 },
  });
  return state;
}

test('Segmented Krotiq: normalne zagranie daje 6/5 za 6 many', () => {
  const state = krotiqInHand(game(), 6);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'krotiq' });
  resolveStack(state);

  assert.equal(result.ok, true);
  const krotiq = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq' && o.zone === 'battlefield');
  assert.equal(krotiq.faceDown, false);
  assert.equal(krotiq.power, 6);
  assert.equal(krotiq.toughness, 5);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0);
});

test('Segmented Krotiq: zagranie twarzą w dół za 3 many daje 2/2 bez tożsamości', () => {
  const state = krotiqInHand(game(), 3);
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'krotiq' && c.faceDown === true);
  assert.ok(cmd, 'brak oferty zagrania face-down');
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.events[0]?.reason);
  resolveStack(state); // T1: czar face-down rozstrzyga się po rundzie passów
  const krotiq = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq' && o.zone === 'battlefield');
  assert.equal(krotiq.faceDown, true);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'zapłacono koszt morph 3');
  const ownView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === krotiq.id);
  assert.equal(ownView.power, 2);
  assert.equal(ownView.toughness, 2);
  assert.equal(ownView.faceDown, true);
  // Przeciwnik nie widzi tożsamości face-down karty (FoW).
  const foeView = playerView(state, 'p2').zones.battlefield.find((o) => o.id === krotiq.id);
  assert.equal(foeView.cardId, null);
  assert.equal(JSON.stringify(playerView(state, 'p2')).includes('segmented-krotiq'), false);
});

test('Segmented Krotiq: obrócenie twarzą do góry za megamorph daje 6/5 + licznik +1/+1', () => {
  const state = krotiqInHand(game(), 3);
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.faceDown));
  resolveStack(state); // T1: rozstrzygnięcie czaru face-down
  addMana(state, 'p1', 7);
  const faceDownId = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq' && o.zone === 'battlefield').id;
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === faceDownId);
  assert.ok(cmd, 'brak zdolności megamorph na face-down permanencie');
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.events[0]?.reason);
  const krotiq = state.objects.get(faceDownId);
  assert.equal(krotiq.faceDown, false, 'karta nie została obrócona');
  assert.ok(result.events.some((e) => e.type === 'object_flipped'), 'brak zdarzenia object_flipped');
  assert.ok(result.events.some((e) => e.type === 'counter_added' && e.counter === '+1/+1'), 'brak licznika +1/+1');
  assert.ok(hasCounter(krotiq, '+1/+1'), 'brak licznika +1/+1 na obiekcie');
  const view = playerView(state, 'p1').zones.battlefield.find((o) => o.id === faceDownId);
  assert.equal(view.power, 7, '6/5 + licznik powinno dać 7');
  assert.equal(view.toughness, 6);
});

test('Segmented Krotiq: bez many nie ma zdolności obrócenia, po obrocie znika', () => {
  const state = krotiqInHand(game(), 3);
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.faceDown));
  resolveStack(state); // T1: rozstrzygnięcie czaru face-down
  const faceDownId = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq' && o.zone === 'battlefield').id;
  // 0 many po face-down cast (koszt 3) — megamorph (7) niedostępny.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === faceDownId), false);
  addMana(state, 'p1', 7);
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === faceDownId));
  // Po obrocie zdolność znika (nie ma już face-down).
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === faceDownId), false);
});

// --- Warstwa danych i talia -------------------------------------------

test('realne karty mają dane Oracle i status supported w registry', () => {
  const registry = createCardRegistry();
  const highland = registry.get('highland-game');
  assert.equal(highland.set, 'KTK');
  assert.equal(highland.oracleText, 'When this creature dies, you gain 2 life.');
  assert.equal(highland.support.status, 'supported');
  assert.equal(registry.get('kappa-tech-wrecker').set, 'NEO');
  assert.equal(registry.get('segmented-krotiq').set, 'DTK');
  assert.equal(registry.get('segmented-krotiq').morph.megamorphCost, 7);
  assert.deepEqual(registry.get('kappa-tech-wrecker').entersWithCounters, { deathtouch: 1 });
});

test('materializacja przenosi morph i entersWithCounters do obiektu gry', () => {
  const registry = createCardRegistry();
  assert.deepEqual(gameObjectDataOf(registry.get('highland-game')), { kind: 'creature', power: 2, toughness: 1, manaCost: 2, abilities: registry.get('highland-game').abilities, colors: ['G'], cardName: 'Highland Game' });
  const kappa = gameObjectDataOf(registry.get('kappa-tech-wrecker'));
  assert.deepEqual(kappa.entersWithCounters, { deathtouch: 1 });
  const krotiq = gameObjectDataOf(registry.get('segmented-krotiq'));
  assert.deepEqual(krotiq.morph, { cost: 3, megamorphCost: 7, colors: ['G'] });
});

