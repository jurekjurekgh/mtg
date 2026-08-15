// M92 — audyt wzorca z M91/A1: „bot robi coś głupiego, bo PlayerView nie niesie
// danych potrzebnych do tej decyzji".
//
// Kontroler z zasady dostaje WIDOK, nie stan (nienegocjowalna granica
// z AGENTS.md), więc pole nieobecne w PlayerView jest dla bota fizycznie
// niewidoczne — żadna heurystyka go nie uratuje. Inwentaryzacja stanu vs widoku
// wykazała cztery luki z mierzalnym wpływem na decyzje:
//
//   preventDamageThisTurn      (Ethersworn Shieldmage — „prevent all damage to
//                               artifact creatures this turn")
//   damageShields              (Withstand — „prevent the next 3 damage")
//   regenerationShields        (CR 701.12 — „the next time it would be destroyed")
//   cantBeRegeneratedThisTurn  (Rage of Purphoros — blokada regeneracji)
//
// Objawy potwierdzone repro PRZED naprawą:
//  1. bot rzucał Fiery Fall (5 dmg) w cel z pełną prewencją → 0 obrażeń,
//     karta zmarnowana;
//  2. to samo z tarczą Withstand na celu;
//  3. bot NIE atakował artefaktowym stworem, choć prewencja czyniła ten atak
//     całkowicie bezpiecznym (stwór nie mógł zginąć w bloku).
//
// FoW: wszystkie te efekty są rozstrzygnięte na stole i publiczne dla obu
// graczy, więc ujawnienie ich w widoku nie łamie Fog of War.

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

function vanilla(state, id, controllerId, power, toughness, types = ['Creature']) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types, colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botMain(seed = 5) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

// ---------------------------------------------------------------------------
// 1. PlayerView musi nieść publiczne efekty prewencji i regeneracji
// ---------------------------------------------------------------------------

test('widok: filtry prewencji obrażeń (preventDamageThisTurn) są w PlayerView', () => {
  const state = botMain();
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];
  const view = playerView(state, 'p2');
  assert.deepEqual(view.preventDamageThisTurn, [{ typesInclude: ['Artifact'], isCreature: true }],
    'kontroler musi widzieć aktywną prewencję — inaczej pali removal w chroniony cel');
});

test('widok: tarcze prewencji (damageShields) są w PlayerView', () => {
  const state = botMain();
  state.damageShields = [{ targetId: 'foe', remaining: 3 }];
  const view = playerView(state, 'p2');
  assert.deepEqual(view.damageShields, [{ targetId: 'foe', remaining: 3 }],
    'tarcza Withstand jest publiczna — kontroler musi ją widzieć');
});

test('widok: tarcze regeneracji i blokada regeneracji są w PlayerView', () => {
  const state = botMain();
  state.regenerationShields = ['foe'];
  state.cantBeRegeneratedThisTurn = ['other'];
  const view = playerView(state, 'p2');
  assert.deepEqual(view.regenerationShields, ['foe']);
  assert.deepEqual(view.cantBeRegeneratedThisTurn, ['other']);
});

test('widok: puste efekty dają puste listy (stabilny kontrakt, bez undefined)', () => {
  const view = playerView(botMain(), 'p2');
  assert.deepEqual(view.preventDamageThisTurn, []);
  assert.deepEqual(view.damageShields, []);
  assert.deepEqual(view.regenerationShields, []);
  assert.deepEqual(view.cantBeRegeneratedThisTurn, []);
});

// ---------------------------------------------------------------------------
// 2. Bot nie marnuje removalu w cel chroniony prewencją
// ---------------------------------------------------------------------------

test('bot NIE pali czaru obrażeniowego w cel z pełną prewencją (Ethersworn Shieldmage)', () => {
  const state = botMain(5);
  putCard(state, { id: 'burn', cardId: 'fiery-fall', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanilla(state, 'foe-art', 'p1', 2, 2, ['Artifact', 'Creature']);
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];

  const choice = createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p2'), {});
  const burnsProtected = choice.type === 'cast_spell' && choice.objectId === 'burn'
    && (choice.targets ?? []).includes('foe-art');
  assert.ok(!burnsProtected,
    `bot zmarnował removal w cel chroniony prewencją: ${JSON.stringify(choice)}`);
});

test('bot NIE pali czaru obrażeniowego w cel z tarczą pochłaniającą całość (Withstand)', () => {
  const state = botMain(6);
  putCard(state, { id: 'burn', cardId: 'fiery-fall', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanilla(state, 'foe', 'p1', 3, 3);
  state.damageShields = [{ targetId: 'foe', remaining: 99 }];

  const choice = createHeuristicBot({ seed: 6 }).chooseCommand(playerView(state, 'p2'), {});
  const burnsShielded = choice.type === 'cast_spell' && choice.objectId === 'burn'
    && (choice.targets ?? []).includes('foe');
  assert.ok(!burnsShielded,
    `bot zmarnował removal w cel z tarczą prewencji: ${JSON.stringify(choice)}`);
});

test('bot NADAL pali removal w cel bez ochrony (brak nadgorliwej kary)', () => {
  const state = botMain(6);
  putCard(state, { id: 'burn', cardId: 'fiery-fall', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanilla(state, 'foe', 'p1', 3, 3);

  const choice = createHeuristicBot({ seed: 6 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_spell', `bot powinien usunąć niechroniony cel; wybrał: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['foe']);
});

test('tarcza CZĘŚCIOWA (mniejsza niż obrażenia) nie blokuje rzutu — czar wciąż działa', () => {
  const state = botMain(6);
  putCard(state, { id: 'burn', cardId: 'fiery-fall', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanilla(state, 'foe', 'p1', 3, 3);
  // Fiery Fall zadaje 5; tarcza na 1 zostawia 4 obrażenia — cel i tak ginie.
  state.damageShields = [{ targetId: 'foe', remaining: 1 }];

  const choice = createHeuristicBot({ seed: 6 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_spell', 'częściowa tarcza nie może blokować sensownego removalu');
});

// ---------------------------------------------------------------------------
// 3. Bot widzi, że jego stwór jest w tej turze bezpieczny (darmowy atak)
// ---------------------------------------------------------------------------

test('bot atakuje stworem chronionym prewencją — nie zginie w bloku (darmowe obrażenia)', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  vanilla(state, 'bot-art', 'p2', 2, 2, ['Artifact', 'Creature']);
  vanilla(state, 'foe-big', 'p1', 5, 5);
  // Prewencja chroni artefaktowe stwory (obu graczy) — atak jest bezpieczny.
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];

  const choice = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(state, 'p2'), {});
  const attackers = choice.type === 'declare_attackers' ? (choice.attackerIds ?? []) : [];
  assert.deepEqual(attackers, ['bot-art'],
    'atak stworem, który w tej turze nie może zginąć, jest darmowy — bot musi go wykonać');
});

test('bez prewencji ten sam atak 2/2 w 5/5 pozostaje odrzucony (kontrola: to nie regresja chump)', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  vanilla(state, 'bot-art', 'p2', 2, 2, ['Artifact', 'Creature']);
  vanilla(state, 'foe-big', 'p1', 5, 5);

  const choice = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(state, 'p2'), {});
  const attackers = choice.type === 'declare_attackers' ? (choice.attackerIds ?? []) : [];
  assert.deepEqual(attackers, [], 'bez ochrony chump-atak 2/2 w 5/5 nadal jest błędem (M90/E)');
});

// ---------------------------------------------------------------------------
// 4. Regeneracja: „destroy" w cel z tarczą regeneracji to strata karty
// ---------------------------------------------------------------------------

test('bot NIE niszczy celu z tarczą regeneracji (efekt zostanie zregenerowany)', () => {
  const state = botMain(11);
  putCard(state, { id: 'shatter', cardId: 'shatter', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  putCard(state, { id: 'foe-art', cardId: 'angels-feather', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' });
  state.regenerationShields = ['foe-art'];

  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(playerView(state, 'p2'), {});
  const destroysRegenerating = choice.type === 'cast_spell' && (choice.targets ?? []).includes('foe-art');
  assert.ok(!destroysRegenerating,
    `bot zmarnował removal w cel z tarczą regeneracji: ${JSON.stringify(choice)}`);
});

test('gdy regeneracja jest zablokowana (cantBeRegeneratedThisTurn), removal znów ma sens', () => {
  const state = botMain(11);
  putCard(state, { id: 'shatter', cardId: 'shatter', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  putCard(state, { id: 'foe-art', cardId: 'angels-feather', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' });
  state.regenerationShields = ['foe-art'];
  state.cantBeRegeneratedThisTurn = ['foe-art'];

  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_spell',
    'blokada regeneracji unieważnia tarczę — removal znów jest wartościowy');
  assert.deepEqual(choice.targets, ['foe-art']);
});

// ---------------------------------------------------------------------------
// 5. Kontrola end-to-end: engine potwierdza, że unikane zagrania są jałowe
// ---------------------------------------------------------------------------

test('kontrola: czar w cel z pełną prewencją faktycznie zadaje 0 obrażeń (zagranie jałowe)', () => {
  const state = botMain(5);
  putCard(state, { id: 'burn', cardId: 'fiery-fall', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  vanilla(state, 'foe-art', 'p1', 2, 2, ['Artifact', 'Creature']);
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];

  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'burn' && (c.targets ?? []).includes('foe-art'));
  assert.ok(cast, 'czar jest legalny (engine pozwala) — to decyzja bota ma być mądra');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const target = state.objects.get('foe-art');
  assert.equal(target.zone, 'battlefield', 'cel przeżył');
  assert.ok(!target.damage, 'obrażenia w pełni zapobiegnięte — karta zmarnowana');
});
