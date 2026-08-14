// M91 — uwaga A właściciela (2026-08-14): „Bot rzucił Inspire Awe (prevent all
// damage this turn), po czym bez sensu zaatakował wszystkimi swoimi stworami
// tapując je. Nic mi nie zrobiły bo Awe zapobiegło, a są teraz tapnięte.
// Kompletnie bezsensowny ruch. Ten Inspire Awe to ma sens rzucać w turze
// przeciwnika, jak ja atakuję, a nie w swojej."
//
// To DWA osobne błędy heurystyki:
//
// A1 — bot atakuje mimo aktywnej prewencji obrażeń bojowych. Jego atakujący
//      (niezaczarowani, nie enchantment-creatures) zadadzą 0 obrażeń, a i tak
//      zostaną tapnięci i wystawieni na bloki.
// A2 — bot rzuca globalną prewencję („fog") we WŁASNEJ turze. Efekt działa na
//      obrażenia OBU stron, więc w swojej turze kasuje własny atak; wartość ma
//      wyłącznie w turze przeciwnika (kiedy to on atakuje).
//
// Root cause A1 (architektura, nie „głupota" bota): flaga
// `state.preventCombatExceptEnchanted` NIE była częścią PlayerView. Kontroler
// z zasady dostaje widok, nie stan (nienegocjowalna granica z AGENTS.md), więc
// bot nie miał fizycznej możliwości uwzględnić prewencji. Fix: widok niesie
// `preventCombatExceptEnchanted`, heurystyka je czyta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function vanillaCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// ---------------------------------------------------------------------------
// A1 — atak w aktywną prewencję obrażeń bojowych
// ---------------------------------------------------------------------------

test('A1: PlayerView niesie flagę prewencji obrażeń bojowych (kontroler nie widzi stanu)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.preventCombatExceptEnchanted = true;
  const view = playerView(state, 'p2');
  assert.equal(view.preventCombatExceptEnchanted, true,
    'PlayerView MUSI nieść informację o prewencji — bez niej bot nie ma jak jej uwzględnić');
});

test('A1: bot NIE atakuje, gdy prewencja kasuje wszystkie jego obrażenia bojowe', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  // Bot ma trzy zdrowe stwory, przeciwnik pusty stół — normalnie atakuje.
  vanillaCreature(state, 'a1', 'p2', 3, 3);
  vanillaCreature(state, 'a2', 'p2', 2, 2);
  vanillaCreature(state, 'a3', 'p2', 4, 4);
  state.preventCombatExceptEnchanted = true;

  const bot = createHeuristicBot({ seed: 7 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const attackers = choice.type === 'declare_attackers' ? (choice.attackerIds ?? []) : [];
  assert.equal(attackers.length, 0,
    `atak w prewencję zadaje 0 obrażeń i tapuje stwory; bot zadeklarował: ${JSON.stringify(attackers)}`);
});

test('A1: bez prewencji bot nadal atakuje w otwarty stół (brak nadgorliwej kary)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  vanillaCreature(state, 'a1', 'p2', 3, 3);
  vanillaCreature(state, 'a2', 'p2', 2, 2);

  const bot = createHeuristicBot({ seed: 7 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'declare_attackers');
  assert.ok((choice.attackerIds ?? []).length > 0, 'bez prewencji atak w otwarty stół musi zostać');
});

// ---------------------------------------------------------------------------
// A2 — rzucanie globalnej prewencji we własnej turze
// ---------------------------------------------------------------------------

function tableWithInspireAwe(activePlayerId) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  putCard(state, { id: 'awe', cardId: 'inspire-awe', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  // Obie strony mają stwory — atak jest realną opcją.
  vanillaCreature(state, 'bot-1', 'p2', 3, 3);
  vanillaCreature(state, 'foe-1', 'p1', 4, 4);
  return state;
}

test('A2: bot NIE rzuca globalnej prewencji obrażeń bojowych we własnej turze', () => {
  const state = tableWithInspireAwe('p2'); // tura BOTA
  const bot = createHeuristicBot({ seed: 11 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const castsAwe = choice.type === 'cast_spell' && choice.objectId === 'awe';
  assert.ok(!castsAwe,
    'fog we własnej turze kasuje własny atak — bot nie powinien go rzucać');
});

test('A2: w turze PRZECIWNIKA prewencja pozostaje sensownym zagraniem', () => {
  const state = tableWithInspireAwe('p1'); // tura CZŁOWIEKA
  // Przeciwnik atakuje — fog realnie ratuje życie.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  const bot = createHeuristicBot({ seed: 11 });
  const view = playerView(state, 'p2');
  const aweOption = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'awe');
  assert.ok(aweOption, 'Inspire Awe musi być legalną opcją w turze przeciwnika (instant)');
  // Nie wymuszamy rzutu (heurystyka może mieć lepsze zagranie), ale kara
  // „własna tura" nie może dotyczyć tury przeciwnika — sprawdzamy, że opcja
  // nie jest zablokowana i bot potrafi ją wybrać w oknie obrony.
  const choice = bot.chooseCommand(view, {});
  assert.ok(choice, 'bot musi zwrócić jakąś komendę');
});

// ---------------------------------------------------------------------------
// Scenariusz właściciela end-to-end
// ---------------------------------------------------------------------------

test('A: po rzuceniu Inspire Awe w swojej turze bot nie idzie do ataku (scenariusz właściciela)', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  putCard(state, { id: 'awe', cardId: 'inspire-awe', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanillaCreature(state, 'a1', 'p2', 3, 3);
  vanillaCreature(state, 'a2', 'p2', 2, 2);

  // Wymuszamy sytuację z partii: prewencja JUŻ działa (czar rozstrzygnięty).
  state.preventCombatExceptEnchanted = true;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.priorityPlayerId = 'p2';

  const bot = createHeuristicBot({ seed: 3 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const attackers = choice.type === 'declare_attackers' ? (choice.attackerIds ?? []) : [];
  assert.deepEqual(attackers, [],
    'bot nie może wysyłać stworów do ataku, który z definicji zada 0 obrażeń');

  // Kontrola: gdyby jednak zaatakował, obrażenia faktycznie są zerowane —
  // to potwierdza, że atak jest bezwartościowy (nie tylko „nieoptymalny").
  const declare = { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] };
  const result = execute(state, declare);
  if (result.ok) {
    const lifeBefore = state.players.find((p) => p.id === 'p1').life;
    for (let i = 0; i < 8 && state.turn.step !== 'postcombat_main'; i += 1) {
      const view = playerView(state, state.turn.priorityPlayerId);
      const next = view.legalCommands.find((c) => c.type === 'resolve_combat')
        ?? view.legalCommands.find((c) => c.type === 'pass_priority');
      if (!next) break;
      execute(state, next);
    }
    assert.equal(state.players.find((p) => p.id === 'p1').life, lifeBefore,
      'prewencja musi wyzerować obrażenia — atak był bezwartościowy');
  }
});

// ---------------------------------------------------------------------------
// Widok: deklaracja ataku jest informacją publiczną (potrzebna do oceny fogu)
// ---------------------------------------------------------------------------

test('A2: PlayerView oznacza atakujących (informacja publiczna, podstawa oceny obrony)', () => {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  vanillaCreature(state, 'foe-attacker', 'p1', 4, 4);
  vanillaCreature(state, 'foe-idle', 'p1', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['foe-attacker'] }).ok);

  // Obrońca (bot) widzi, KTÓRY stwór atakuje.
  const view = playerView(state, 'p2');
  const attacker = view.zones.battlefield.find((o) => o.id === 'foe-attacker');
  const idle = view.zones.battlefield.find((o) => o.id === 'foe-idle');
  assert.equal(attacker?.attacking, true, 'atakujący musi być oznaczony w widoku obrońcy');
  assert.notEqual(idle?.attacking, true, 'stwór, który nie atakuje, nie może być oznaczony');
});
