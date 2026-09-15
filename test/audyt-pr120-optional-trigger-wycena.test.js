// =============================================================================
// Audyt PR #120 (2026-09-15, sesja arena/01a0a505-mtg) — F1: martwa wycena
// `resolve_optional_trigger_choice`.
//
// Objaw: wycena czytała `view.pendingOptionalTrigger.ability`, a `playerView`
// projektuje tę decyzję jako `{ sourceCardId, effect }` (pole `ability` NIE
// istnieje w PlayerView, game-state.js ~7871). Katalog błędów: L1/ADR 0017
// (pole poza widokiem = ślepota kontrolera) + L48 (oferta silnika i wycena bota
// czytały różne kształty danych). Skutek zgłoszenia właściciela E (Murder of
// Crows „you may draw; if you do discard") NIE był naprawiony: przy cienkiej
// bibliotece bot dalej palił triggera bez kary.
//
// Reguły: CR 121.4 (próba dobrania z pustej biblioteki przegrywa partię —
// powtarzalne „may draw" przy cienkiej bibliotece to droga do deck-outu) i
// CR 603.7 (trigger „you may" = decyzja kontrolera). Wycena po DANYCH efektu
// (`draw_then_discard`, brak `applyTo` = moja biblioteka), zero nazw kart
// (ADR 0002).
//
// Kontrakt widoku pinowany osobno (klasa L21/L48): decyzja „you may" wychodzi
// do kontrolera jako `{ sourceCardId, effect }`.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const BOT = 'p1';

function gra(ileKartWBibliotece, sourceCardId = 'murder-of-crows') {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', BOT);
  state.turn.activePlayerId = BOT;
  state.turn.priorityPlayerId = BOT;
  state.turn.phase = 'precombat_main';

  const def = REGISTRY.get(sourceCardId);
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: sourceCardId, controllerId: BOT, ownerId: BOT,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  const ląd = REGISTRY.get('basic-forest');
  for (let i = 0; i < ileKartWBibliotece; i += 1) {
    addObject(state, {
      id: `L${i}`, instanceId: `il-${i}`, cardId: 'basic-forest', controllerId: BOT,
      ownerId: BOT, zone: 'library', ...gameObjectDataOf(ląd), types: ląd.types ?? [],
    });
  }
  // Kształt pendingu dokładnie jak w triggers.js (ścieżka produkcyjna, L21 pkt 3).
  const ability = def.abilities.find((a) => a?.trigger?.mayFire) ?? def.abilities[0];
  state.pendingOptionalTrigger = {
    playerId: BOT, sourceId: 'src', ability: Object.freeze({ ...ability }),
    extra: Object.freeze({}), restorePriorityTo: 'p2',
  };
  return state;
}

function decyzjaBota(state) {
  const bot = createHeuristicBot({ seed: 7 });
  const chosen = bot.chooseCommand(playerView(state, BOT));
  const opcje = bot.trace().at(-1)?.options ?? [];
  const fire = opcje.find((o) => String(o.cmd).includes('fire":true') || (o.cmd?.fire === true));
  return { chosen, fireScore: fire?.score ?? null };
}

test('F1 (kontrakt widoku): decyzja „you may" = { sourceCardId, effect }, bez ability', () => {
  const view = playerView(gra(25), BOT);
  const pending = view.pendingOptionalTrigger;
  assert.ok(pending, 'widok niesie pendingOptionalTrigger dla właściciela');
  assert.equal(pending.sourceCardId, 'murder-of-crows');
  assert.ok(pending.effect, 'widok projektuje effect (first effect zdolności)');
  assert.equal(pending.effect.type, 'draw_then_discard');
  assert.equal('ability' in pending, false, 'pole `ability` nie istnieje w PlayerView — wycena nie może go czytać');
});

test('F1: Murder of Crows — przy 4 kartach zapas 3 < 20 bot NIE pali „may draw"', () => {
  const { chosen } = decyzjaBota(gra(4));
  assert.equal(chosen.type, 'resolve_optional_trigger_choice');
  assert.equal(chosen.fire, false, `przy cienkiej bibliotece fire musi przegrać z passem (wybrano: ${JSON.stringify(chosen)})`);
});

test('F1 (anty-over-fix): przy 25 kartach bot pali triggera (baza 50 wygrywa)', () => {
  const { chosen } = decyzjaBota(gra(25));
  assert.equal(chosen.type, 'resolve_optional_trigger_choice');
  assert.equal(chosen.fire, true, 'gruba biblioteka — kara 0, fire legalny i wart 50');
});

test('F1 (anty-over-fix): trigger NIE-drainujący (gain_life) nie dostaje kary biblioteki', () => {
  // „you may gain 1 life" nie sięga po bibliotekę — przy 4 kartach pozostaje wart.
  // Zdolność syntetyczna na realnym pendingu (ADR 0029: brak nośnika mechaniki w
  // kolekcji NIE poszerza katalogu; engine nie zna rejestru).
  const state = gra(4, 'murder-of-crows');
  state.pendingOptionalTrigger = {
    playerId: BOT, sourceId: 'src',
    ability: Object.freeze({ type: 'triggered', trigger: Object.freeze({ event: 'any_creature_dies', mayFire: true }), effect: Object.freeze({ type: 'gain_life', amount: 1 }) }),
    extra: Object.freeze({}), restorePriorityTo: 'p2',
  };
  const { chosen } = decyzjaBota(state);
  assert.equal(chosen.type, 'resolve_optional_trigger_choice');
  assert.equal(chosen.fire, true, 'gain_life nie drenuje biblioteki — kara 0');
});
