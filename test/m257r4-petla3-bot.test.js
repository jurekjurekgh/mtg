import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { clearStatModifiers } from '../src/engine/permanents.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

/**
 * M257 r4 — pętla jakości bota (Żywy Tester, seeds 3001–3006; oś wzmocniona
 * przez właściciela: POPRAWNOŚĆ, LOGICZNOŚĆ, OPTYMALNOŚĆ).
 *
 * Znalezisko Z1 (partia 3002, worek-legend vs warhammer-wu, bot = warhammer-wu,
 * tury 26/28/30): bot co turę załogowywał Irontread Crusher (crew 3, animacja
 * do końca tury) i przypinał Brawler's Plate {4} + Wooden Stake {1}.
 *
 * PODEJRZENIE: „re-equip" na nosiciela, do którego sprzęt już jest przypięty
 * (no-op za 5–8 many). Werdykt po pełnym prześledzeniu transkrypcji (seed 3002
 * jest deterministyczny — partia odtworzona 1:1): BRAK DEFENSY.
 *
 * Mechanizm (poprawny wg CR): sprzęt może być przypięty tylko do stwora
 * (CR 702.16 / 702.6). Pojazd animowany crewem jest stworem TYLKO do końca
 * tury — w cleanupu (`clearStatModifiers`) animacja wygasa, pojazd traci
 * typ Creature, a SBA (`removeIllegalAttachments`) odłącza sprzęt. Każde
 * kolejne przypięcie to więc PRZYPINANIE ŚWIEŻE (legalne, potrzebne do ataku
 * 9/8 z trample) — dokładnie wzorzec optymalny dla talii Irontread.
 *
 * Testy kodują odkryte inwarianty (anti-regresja):
 *  1. koniec animacji → sprzęt z pojazdu odłącza się (SBA);
 *  2. pozycja z partii 3002 (załogowany pojazd + sprzęt luzem) — bot
 *     wycenia przypięcie powyżej passu (wykonał je w żywej grze);
 *  3. sprzęt przypięty do STAŁEGO stwora — oferta no-op re-equipu na bieżącego
 *     nosiciela NIE ISTNIEJE (M102/U9, filtr na poziomie oferty), a przepięcie
 *     na wyraźnie lepszego nosiciela (delta ≥ 2 skutecznej siły) jest oferowane
 *     i wyceniane powyżej passu (M100/E13).
 */

const REGISTRY = createCardRegistry();

function addCard(state, id, cardId, extra = {}) {
  const card = REGISTRY.get(cardId);
  const data = gameObjectDataOf(card);
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'battlefield',
    kind: data.kind, power: data.power ?? null, toughness: data.toughness ?? null,
    manaCost: data.manaCost ?? 0, spell: data.spell ?? null,
    abilities: data.abilities ?? [],
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    equipment: data.equipment ?? null,
    ...extra,
  });
}

function main1WithLands(state, lands = 6) {
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  initializeResources(state);
  for (let i = 0; i < lands; i += 1) {
    addObject(state, {
      id: `land-${i}`, instanceId: `i-land-${i}`, cardId: 'land-syn', controllerId: 'p1',
      zone: 'battlefield', kind: 'land', power: null, toughness: null, manaCost: 0,
      types: ['Basic Land', 'Plains'], keywords: [], subtypes: ['Plains'], abilities: [],
    });
  }
}

/** Pojazd animowany crewem do końca tury (stan po rozstrzygnięciu crew,
 *  wzorzec M230: originalBeforeAnimation + typy z Creature). */
function crewedIrontread(state, animated) {
  const card = REGISTRY.get('irontread-crusher');
  addCard(state, 'irontread', 'irontread-crusher');
  if (!animated) return;
  const base = REGISTRY.get('irontread-crusher');
  const data = gameObjectDataOf(base);
  state.objects.set('irontread', Object.freeze({
    ...state.objects.get('irontread'),
    kind: 'creature',
    power: 6, toughness: 6,
    types: ['Artifact', 'Creature'],
    subtypes: ['Vehicle'],
    originalBeforeAnimation: Object.freeze({
      kind: data.kind, types: base.types, subtypes: base.subtypes,
      power: base.power, toughness: base.toughness,
    }),
  }));
}

function botScores(view) {
  const bot = createHeuristicBot({ seed: 3002, registry: REGISTRY });
  bot.chooseCommand(view, {});
  const entry = bot.trace().at(-1);
  const pass = (entry.options ?? []).find((o) => o.cmd.startsWith('pass'))?.score ?? 0;
  return { entry, pass, bot };
}

test('Z1/1: koniec animacji crew — sprzęt z pojazdu odłącza się (SBA, CR 702.16)', () => {
  const state = createGameState({ seed: 3002, players: [{ id: 'p1' }, { id: 'p2' }] });
  crewedIrontread(state, true);
  addCard(state, 'plate', 'brawlers-plate');
  addCard(state, 'c1', 'highland-game', { power: 2, toughness: 2 });
  main1WithLands(state, 3);
  attachEquipmentToCreature(state, 'plate', 'irontread');
  assert.equal(state.objects.get('plate').attachedTo, 'irontread');
  // Cleanup: animacja wygasa (pojazd traci typ Creature).
  clearStatModifiers(state);
  runStateBasedActions(state);
  assert.equal(state.objects.get('irontread').kind, 'artifact', 'pojazd wraca do bycia pojazdem');
  assert.equal(state.objects.get('plate').attachedTo, null,
    'sprzęt odłącza się, gdy gospodarz przestaje być stworem (stan po t.26 partii 3002)');
});

test('Z1/2: pozycja z partii 3002 — załogowany pojazd + sprzęt luzem: bot wycenia przypięcie powyżej passu', () => {
  const state = createGameState({ seed: 3002, players: [{ id: 'p1' }, { id: 'p2' }] });
  crewedIrontread(state, true);
  addCard(state, 'plate', 'brawlers-plate');
  addCard(state, 'stake', 'wooden-stake');
  main1WithLands(state, 6);
  const { entry, pass } = botScores(playerView(state, 'p1'));
  const equipPlate = (entry.options ?? []).find((o) => o.cmd.includes('plate') && o.cmd.includes('irontread'));
  const equipStake = (entry.options ?? []).find((o) => o.cmd.includes('stake') && o.cmd.includes('irontread'));
  assert.ok(equipPlate != null, 'oferta przypięcia Plate do załogowanego Irontread istnieje');
  assert.ok(equipStake != null, 'oferta przypięcia Stake do załogowanego Irontread istnieje');
  assert.ok(equipPlate.score > pass, `Plate: ${equipPlate.score} > pass ${pass} (bot założył oba w żywej grze)`);
  assert.ok(equipStake.score > pass, `Stake: ${equipStake.score} > pass ${pass}`);
});

test('Z1/3: sprzęt na STAŁYM stwore — no-op re-equip nie jest oferowany (M102/U9), przepięcie na lepszego nosiciela jest (M100/E13)', () => {
  const state = createGameState({ seed: 3002, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCard(state, 'host', 'highland-game'); // 2/1 + Plate(+2/+2) + Stake(+1/+0) = skutecznie 5/3
  addCard(state, 'plate', 'brawlers-plate');
  addCard(state, 'stake', 'wooden-stake');
  main1WithLands(state, 6);
  attachEquipmentToCreature(state, 'plate', 'host');
  attachEquipmentToCreature(state, 'stake', 'host');
  const view = playerView(state, 'p1');
  const noop = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'plate' && c.targets?.[0] === 'host');
  assert.equal(noop, undefined, 'no-op re-equip na bieżącego nosiciela nie jest OFERTOWANY (CR: czysty no-op)');
  // Przepięcie na nosiciela o Δ skutecznego pułapu ataku ≥ 2 (7/4 vs 5/3).
  addCard(state, 'big', 'highland-game', { power: 7, toughness: 4 });
  const { entry, pass } = botScores(playerView(state, 'p1'));
  const toBig = (entry.options ?? []).find((o) => o.cmd.includes('plate') && o.cmd.includes('big'));
  assert.ok(toBig != null, 'oferta przepięcia na lepszego nosiciela istnieje');
  assert.ok(toBig.score > pass, `przepięcie 5→7 siły wygrywa z passem: ${toBig.score} > ${pass}`);
});
