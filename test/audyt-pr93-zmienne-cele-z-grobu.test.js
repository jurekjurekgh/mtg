// Audyt PR #93 (2026-09-03), znalezisko F — TA SAMA KLASA, INNA ŚCIEŻKA:
// darmowy rzut z grobu (Halo Forager, M174/M203) nie potrafił rzucić karty,
// której tryb ma CELE ZMIENNE („up to three target creatures”, CR 601.2c) —
// oferta omijała takie tryby (`variableTargets`), a wykonanie wręcz je
// odrzucało. Vaan dostał tę naprawę w tej samej sesji (znalezisko A/B);
// okno grobu zostało pominięte, bo audyt szedł ścieżką okna zdolności.
//
// Oracle Halo Foragera: „you may pay {X}. When you do, you may cast target
// instant or sorcery card with mana value X from a graveyard without paying
// its mana cost.” — bez wyłączenia kart, których cele wybiera gracz.
// Miara: `wrap-in-flames` (MV 4) w `decks/warhammer-brg.txt`,
// Halo Forager w `decks/worek-basni.txt`; okno czyta DOWOLNY cmentarz.
//
// Discover zostaje przy takich trybach zamknięte ŚWIADOMIE i przypięte
// testem (to okno w ogóle nie wylicza celów — CR 608.2b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const VARIABLE_TARGETS = 'wrap-in-flames'; // MV 4, „deals 1 damage to each of up to three target creatures”

function game(playerId = 'p1') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

/** Halo Forager: „rzuć czar z DOWOLNEGO grobu, płaćąc {X} = MV karty”. */
function graveState(cardId, { graveOwner = 'p2', mana = 6 } = {}) {
  const state = game('p1');
  addMana(state, 'p1', mana, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'mine', 'p1');
  addSimpleCreature(state, 'foe1', 'p2');
  addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'grave', cardId, graveOwner, 'graveyard');
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager' };
  return state;
}

const graveCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
  return state;
}

test('A93/F: Halo Forager — tryb z celami zmiennymi: liczbę celów wybiera gracz (CR 601.2c)', () => {
  const state = graveState(VARIABLE_TARGETS);
  const offers = graveCasts(state);
  assert.ok(offers.length > 0,
    'Oracle pozwala rzucić dowolnego instanta/sorcery o MV = X — „up to three” nie wyłącza karty');
  const counts = new Set(offers.map((c) => (c.targets ?? []).length));
  assert.ok(counts.has(1) && counts.has(2) && counts.has(3),
    `oferta obejmuje 1, 2 i 3 cele (dziś: [${[...counts].sort().join(', ')}])`);
  assert.ok(offers.every((c) => c.modeIndex === 0), 'warianty niosą wybrany tryb');
  assert.ok(offers.every((c) => c.xValue === 4), 'każdy wariant płaci {X} = MV karty (4)');
});

test('A93/F: Halo Forager — rzut z dwoma celami: mana {X}, obrażenia i zakaz blokowania', () => {
  const state = graveState(VARIABLE_TARGETS);
  const cast = graveCasts(state).find((c) => (c.targets ?? []).length === 2
    && c.targets.includes('foe1') && c.targets.includes('foe2'));
  assert.ok(cast, 'wariant z dwoma wrogimi stworami');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut przyjęty (${r.events[0]?.reason ?? ''})`);
  assert.equal(manaBefore - state.players.find((p) => p.id === 'p1').mana, 4, 'płacimy {X} = MV, koszt czaru to {0}');
  resolveStack(state);
  for (const id of ['foe1', 'foe2']) {
    assert.equal(state.objects.get(id).damage, 1, `${id} dostaje 1 obrażenie`);
    assert.equal(state.objects.get(id).cantBlock, true, `${id} nie może blokować`);
  }
  assert.equal(state.objects.get('mine').damage, 0, 'własny stwór nie jest celem');
});

test('A93/F: L48 — każda oferta okna grobu wykonuje się bez odrzucenia', () => {
  const template = graveState(VARIABLE_TARGETS);
  const offers = graveCasts(template);
  assert.ok(offers.length > 4, 'wariantów jest kilka');
  for (const offer of offers) {
    const state = graveState(VARIABLE_TARGETS);
    const same = graveCasts(state).find((c) => (c.targets ?? []).join('|') === (offer.targets ?? []).join('|'));
    assert.ok(same, `wariant [${(offer.targets ?? []).join(' ')}] jest w ofercie`);
    const r = execute(state, same);
    assert.ok(r.ok, `wariant [${(offer.targets ?? []).join(' ')}] wykonany (${r.events[0]?.reason ?? ''})`);
  }
});

test('A93/F: walidacja odrzuca cel nielegalny — komenda spoza oferty (L48)', () => {
  const state = graveState(VARIABLE_TARGETS);
  // Artefakt NIE jest stworem: „up to three target CREATURES” go nie obejmuje,
  // więc komenda o DOBREJ LICZBIE celów, ale złym celu, musi zostać odrzucona.
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'test-art', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [],
  });
  const r = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: ['art'],
  });
  assert.equal(r.ok, false, 'cel spoza oferty (artefakt zamiast stwora) odrzucony');
  assert.equal(state.zones.stack.length, 0, 'odrzucony rzut nie zostawia nic na stosie');
});

test('A93/F: Discover — tryb z celami zmiennymi nadal bez oferty (okno nie wylicza celów)', () => {
  const state = game('p1');
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'foe1', 'p2');
  put(state, 'found', VARIABLE_TARGETS, 'p1', 'exile');
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: VARIABLE_TARGETS,
    restExileIds: [], restorePriorityTo: 'p1', amount: 4,
  };
  const free = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_discover_choice' && c.castFree === true);
  assert.equal(free.length, 0, 'Discover nie wylicza celów — czar z celem nie ma oferty (CR 608.2b)');
});
