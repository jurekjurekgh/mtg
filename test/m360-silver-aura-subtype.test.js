import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { resolveUntilDecision, optionalTriggerOpen, triggerTargetOpen } from './helpers/deferred-trigger.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 360, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null,
  });
  return state.objects.get(id);
}

function slayerReturns(state, auraId, auraCardId) {
  addMana(state, 'p1', 6, { colors: ['W'] });
  addCard(state, 'is', 'ironclad-slayer', 'p1', 'hand');
  addCard(state, auraId, auraCardId, 'p1', 'graveyard');
  // Etap F (CR 603.5): cel „you may return target" jest obowiązkowy, więc
  // przy JEDYNYM kandydacie silnik wybiera go sam (M242). Drugi kandydat
  // (Equipment) utrzymuje decyzję celu, w której sprawdzamy ofertę Aury.
  addCard(state, 'decoy', 'greatsword-of-tyr', 'p1', 'graveyard');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'is' }).ok);
  resolveUntilDecision(state, triggerTargetOpen);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_trigger_target');
  return { offers, auraId };
}

// M360/Srebro B2 (dane vs Oracle, zweryfikowane online 2026-09-16):
// Spectral Prison (AVR/75) i Treefolk Umbra (MH1/185) to „Enchantment — Aura”
// (Scryfall type_line, oba druki), ale definicje nie niosły podtypu Aura.
// Filtr Ironclad Slayera („target Aura or Equipment card…”, CR 205.3h —
// Aura to podtyp) szuka po podtypie, więc obu kart nie dało się zawrócić.
test('M360/B2a: Ironclad Slayer zawraca Spectral Prison (Aura z grobu)', () => {
  const state = game();
  const { offers, auraId } = slayerReturns(state, 'prison', 'spectral-prison');
  const target = offers.find((c) => c.targetId === auraId);
  assert.ok(target, 'Spectral Prison w ofercie celu Slayera');
  assert.ok(execute(state, target).ok);
  assert.ok(resolveUntilDecision(state, optionalTriggerOpen), '„you may\" przy rozstrzyganiu');
  assert.ok(execute(state, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true }).ok);
  const back = [...state.objects.values()].find((o) => o.cardId === 'spectral-prison' && o.zone === 'hand');
  assert.ok(back, 'Spectral Prison wrócił do ręki');
});

test('M360/B2b: Ironclad Slayer zawraca Treefolk Umbrę (Aura z grobu)', () => {
  const state = game();
  const { offers, auraId } = slayerReturns(state, 'umbra', 'treefolk-umbra');
  const target = offers.find((c) => c.targetId === auraId);
  assert.ok(target, 'Treefolk Umbra w ofercie celu Slayera');
  assert.ok(execute(state, target).ok);
  assert.ok(resolveUntilDecision(state, optionalTriggerOpen), '„you may\" przy rozstrzyganiu');
  assert.ok(execute(state, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true }).ok);
  const back = [...state.objects.values()].find((o) => o.cardId === 'treefolk-umbra' && o.zone === 'hand');
  assert.ok(back, 'Treefolk Umbra wróciła do ręki');
});

// Strażnik klasowy (styl M358): każda karta z polem `aura` niesie podtyp Aura.
// Bestow NIE łamie niezmiennika — bestow-stwory nie mają pola `aura` w danych
// (Aura są tylko na stosie/polu jako bestowed, CR 702.103b).
test('M360/B2c: niezmiennik — każda Aura w danych ma podtyp Aura', () => {
  const missing = [];
  for (const card of REGISTRY.all()) {
    if (card.aura && !(card.subtypes ?? []).includes('Aura')) missing.push(card.id);
  }
  assert.deepEqual(missing, [], 'karty z polem aura bez podtypu Aura');
});
