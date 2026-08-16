// M102/U8 — czar z kosztem „poświęć stwora" celujący w TEGO SAMEGO stwora.
//
// Znalezione Żywym Testerem (partia graveyard vs innistrad, seed 101, krok 47):
// gracz dostał listę 20 wariantów Bone Splinters, a PIERWSZYM z nich było
//   „Rzuć: Bone Splinters (koszt B) → cel: Midnight Guard — poświęć Midnight Guard"
// czyli wariant, w którym koszt zabija własny cel. Log potwierdził skutek:
//   „Midnight Guard zostaje poświęcony"
//   „Bone Splinters zostaje rozstrzygnięty (cel nielegalny — bez efektu)"
// Gracz stracił kartę, stwora i manę, nie osiągając niczego.
//
// Zasady: to zagranie jest LEGALNE. Cele wybiera się przy rzucaniu
// (CR 601.2c), a koszty płaci później (CR 601.2h), więc czar trafia na stos
// z celem, który zaraz przestaje istnieć; przy rozstrzygnięciu fizzluje
// (CR 608.2b). Istnieje nawet nisza, gdzie gracz chce fizzla świadomie.
// Dlatego NIE usuwamy wariantu z oferty — ale interfejs musi:
//   1. oznaczyć go czytelnie jako samozniszczenie („czar fizzluje"),
//   2. nigdy nie stawiać go PIERWSZYM, bo pierwsza opcja jest domyślną
//      sugestią UI (i to ją kliknął tester).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
  return state.objects.get(id);
}

/** Stan: gracz ma Bone Splinters w ręce i dwa własne stwory + jeden wrogi. */
function boneSplintersState() {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'spell', 'bone-splinters', 'p1', 'hand');
  addRealCard(state, 'mine-a', 'midnight-guard', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'mine-b', 'gorger-wurm', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'theirs', 'armored-skaab', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 5, { colors: ['B'] });
  return state;
}

function castCommands(state) {
  return playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'spell');
}

// Uwaga na kontrakt kolejności: playerView wstawia komendy rzutu przez
// `unshift`, więc kolejność z legalSpellCasts jest odwracana. Testy poniżej
// celowo patrzą na `playerView(...).legalCommands` — czyli DOKŁADNIE to, co
// widzi gracz — a nie na surowe wyjście generatora.
test('U8: wariant „cel = poświęcony stwór" nadal istnieje (jest legalny, CR 601.2c)', () => {
  const state = boneSplintersState();
  const casts = castCommands(state);
  assert.ok(casts.length > 0, 'czar musi być w ofercie');
  const selfKill = casts.filter((c) => c.sacrificeTargetId != null
    && (c.targets ?? []).includes(c.sacrificeTargetId));
  assert.ok(selfKill.length > 0,
    'wariantu nie usuwamy — bywa świadomym zagraniem (fizzle na życzenie)');
});

test('U8: samoznoszący się wariant NIE jest pierwszy w ofercie', () => {
  const state = boneSplintersState();
  const casts = castCommands(state);
  const first = casts[0];
  const firstIsSelfKill = first.sacrificeTargetId != null
    && (first.targets ?? []).includes(first.sacrificeTargetId);
  assert.equal(firstIsSelfKill, false,
    'pierwsza opcja to domyślna sugestia UI — nie może być gwarantowanym fizzlem '
    + `(dostałem: cel ${JSON.stringify(first.targets)}, poświęcenie ${first.sacrificeTargetId})`);
});

test('U8: wszystkie sensowne warianty stoją przed samoznoszącymi się', () => {
  const state = boneSplintersState();
  const casts = castCommands(state);
  const isSelfKill = (c) => c.sacrificeTargetId != null
    && (c.targets ?? []).includes(c.sacrificeTargetId);
  const firstSelfKill = casts.findIndex(isSelfKill);
  const lastSensible = casts.map(isSelfKill).lastIndexOf(false);
  assert.ok(firstSelfKill === -1 || firstSelfKill > lastSensible,
    'warianty-fizzle mają być zepchnięte na koniec listy, nie przeplatane z sensownymi');
});

test('U8: etykieta ostrzega, że czar sam siebie unieważni', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const state = boneSplintersState();
  const casts = castCommands(state);
  const selfKill = casts.find((c) => c.sacrificeTargetId != null
    && (c.targets ?? []).includes(c.sacrificeTargetId));
  assert.ok(selfKill, 'wariant istnieje');

  const view = playerView(state, 'p1');
  const session = {
    view: () => view,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  const label = commandLabel(selfKill, session, view);
  assert.match(label, /fizzl|bez efektu|sam siebie|unieważni/i,
    `etykieta musi ostrzegać przed pewnym fizzlem, dostałem: „${label}"`);
});

test('U8: zwykły wariant (cel wroga, poświęcenie własnego) nie dostaje ostrzeżenia', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const state = boneSplintersState();
  const casts = castCommands(state);
  const sensible = casts.find((c) => (c.targets ?? []).includes('theirs')
    && c.sacrificeTargetId === 'mine-a');
  assert.ok(sensible, 'sensowny wariant istnieje');

  const view = playerView(state, 'p1');
  const session = {
    view: () => view,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  const label = commandLabel(sensible, session, view);
  assert.doesNotMatch(label, /fizzl|bez efektu/i,
    `sensowny rzut nie może straszyć fizzlem: „${label}"`);
});
