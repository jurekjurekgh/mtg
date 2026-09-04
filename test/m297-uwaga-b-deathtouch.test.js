// M297 — uwaga B właściciela z żywej gry (2026-09-03):
//
//   „Bot atakuje 4/4, podczas gdy ja mam małego nietapniętego stwora, który
//   może KUPIĆ zdolność deathtouch (Death-Hood Cobra / Coat with Venom),
//   i mam na to manę — to trochę nierozsądne.”
//
// Deathtouch kupiony w oknie walki oznacza, że DOWOLNY bloker zabija naszego
// atakującego (CR 702.4). Bot modeluje już ryzyko removalu (B3) z talii
// przeciwnika — tu ta sama klasa dla trików deathtouch:
//  (2) przeciwnik ma na polu nietapniętego stwora z aktywowaną zdolnością
//      dającą deathtouch + manę — kupno pewne, ryzyko pełne;
//  (3) przeciwnik może trzymać instant dający deathtouch (model
//      hipergeometryczny B3) + ma manę i blokera — ryzyko ważone.
// Uwaga (zakres): statyczny bloker z DRUKOWANYM deathtouch to osobna klasa
// (wymaga oceny gang-ataków, nie per-attacker) — backlog, poza tą uwagą.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId) ?? {
    id: cardId, name: cardId, types: ['Creature'], power: 1, toughness: 1, manaCost: 1,
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? ['Creature'], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Stan: tura p1, krok deklaracji atakujących; p1 = bot (4/4), p2 = obrońca. */
function attackState({ blocker = null, blockerPatch = {}, foeLands = 0, foeHand = 0, foeLib = 30 }) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'big', 'thornhide-wolves', 'p1', 'battlefield', { power: 4, toughness: 4 });
  if (blocker) put(state, 'small', blocker, 'p2', 'battlefield', blockerPatch);
  for (let i = 0; i < foeLands; i += 1) put(state, `fland-${i}`, 'basic-forest', 'p2');
  for (let i = 0; i < foeHand; i += 1) put(state, `fhand-${i}`, 'basic-forest', 'p2', 'hand');
  for (let i = 0; i < foeLib; i += 1) put(state, `flib-${i}`, 'basic-forest', 'p2', 'library');
  for (let i = 0; i < 30; i += 1) put(state, `mlib-${i}`, 'basic-forest', 'p1', 'library');
  return state;
}

function attackersChosenBy(state, opponentDeck) {
  const bot = createHeuristicBot({ seed: 1, randomness: 0, opponentDeck, registry: REGISTRY });
  const view = playerView(state, 'p1');
  const cmd = bot.chooseCommand(view, {});
  assert.equal(cmd.type, 'declare_attackers', `oczekiwano decyzji ataku, jest ${cmd.type}`);
  return cmd.attackerIds;
}

const DECK_BEZ_TRIKU = Array(40).fill('basic-forest');

// -----------------------------------------------------------------------------
// (1) Sanity: 4/4 atakuje zwykłego 1/1 bez żadnych trików (punkt odniesienia).
// -----------------------------------------------------------------------------

test('M297/B1 (sanity): bez deathtouch 4/4 atakuje w 1/1', () => {
  const state = attackState({ blocker: 'token_insect' }); // 1/1 bez deathtouch
  const ids = attackersChosenBy(state, DECK_BEZ_TRIKU);
  assert.ok(ids.includes('big'), `4/4 powinien atakować w zwykłego 1/1: ${ids.join(',')}`);
});

// -----------------------------------------------------------------------------
// (2) Kupno WIDOCZNE: nietapnięty stwór z aktywacją „daje deathtouch" + mana.
// -----------------------------------------------------------------------------

test('M297/B2: 4/4 nie atakuje, gdy obrońca może kupić deathtouch (Cobra + mana)', () => {
  const state = attackState({ blocker: 'death-hood-cobra', foeLands: 2 });
  const ids = attackersChosenBy(state, DECK_BEZ_TRIKU);
  assert.ok(!ids.includes('big'), `4/4 w Cobrę z otwartą maną na {1}{G}: ${ids.join(',')}`);
});

test('M297/B2 (kontrola): Cobra bez many to zwykły bloker 2/2 — atak wchodzi', () => {
  const state = attackState({ blocker: 'death-hood-cobra', foeLands: 0 });
  const ids = attackersChosenBy(state, DECK_BEZ_TRIKU);
  assert.ok(ids.includes('big'), `4/4 vs Cobra bez many: ${ids.join(',')}`);
});

// -----------------------------------------------------------------------------
// (3) Kupno UKRYTE: instant dający deathtouch w talii przeciwnika + mana
// + bloker — ryzyko ważone prawdopodobieństwem (model B3).
// -----------------------------------------------------------------------------

const DECK_Z_TRIKIEM = [...Array(4).fill('coat-with-venom'), ...Array(36).fill('basic-forest')];

test('M297/B3: 4/4 nie atakuje w blokera, gdy w talii obrońcy jest instant z deathtouch', () => {
  const state = attackState({ blocker: 'token_insect', foeLands: 1, foeHand: 7, foeLib: 33 });
  const ids = attackersChosenBy(state, DECK_Z_TRIKIEM);
  assert.ok(!ids.includes('big'), `4/4 przy ryzyku Coat with Venom: ${ids.join(',')}`);
});

test('M297/B3 (kontrola): ten sam obrońca bez triku w talii — atak wchodzi', () => {
  const state = attackState({ blocker: 'token_insect', foeLands: 1, foeHand: 7, foeLib: 33 });
  const ids = attackersChosenBy(state, DECK_BEZ_TRIKU);
  assert.ok(ids.includes('big'), `4/4 bez ryzyka triku: ${ids.join(',')}`);
});

test('M297/B3 (anty-over-fix): bez blokera trick nie gasi ataku (nie ma komu kupić)', () => {
  const state = attackState({ blocker: null, foeLands: 2, foeHand: 7, foeLib: 33 });
  const ids = attackersChosenBy(state, DECK_Z_TRIKIEM);
  assert.ok(ids.includes('big'), `4/4 w otwartego mimo triku w talii: ${ids.join(',')}`);
});
