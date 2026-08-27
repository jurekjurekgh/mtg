// M235 — audyt Żywym Testerem (2026-08-27), partia ravnica (gracz) vs
// srodziemie (bot), seed 55: bot rzucił Benevolent Blessing (aura protekcji
// z FLASH, 2 many) na własnego stwora w SWOIM UPKEEPIE — bez walki.
//
// Uwaga właściciela: to nie jest błąd „aura na tokenie" (token to pełnoprawna
// kreatura). Błąd to TIMING: Benevolent Blessing ma flash (jest instantem),
// więc aura-ochrona to sztuczka bojowa — jej wartość zależy od OKNA:
//   - moja walka: ochrona atakującego przed blokerami danego koloru,
//   - tura przeciwnika po deklaracji atakujących: bezstratny blok.
// W upkeepie/kroku bez walki to zmarnowana elastyczność — lepiej trzymać kartę.
//
// Oś 1 audytu. Reguła po deskryptorze (flash + czysta ochrona: `protection`
// albo `chooseColor`, bez pumpa i keywordów), zero nazw kart (ADR 0002).
// Okno liczone z PlayerView (view.combat + faza/krok), ADR 0017.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], aura: d.aura, bestow: d.bestow,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

// Bot (p2) ma flash-aurę ochronną w ręce, własnego stwora-gospodarza i
// wielokolorowego wroga (protekcja ma sens). `step`/`phase`/`combat` sterują oknem.
function scenario({ step, phase, activePlayer = 'p2', combat = null } = {}) {
  const state = createGameState({ seed: 235, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, phase === 'upkeep' ? 'upkeep' : 'main', activePlayer);
  state.turn.activePlayerId = activePlayer;
  state.turn.priorityPlayerId = 'p2';
  if (step) state.turn.step = step;
  if (phase) state.turn.phase = phase;
  addMana(state, 'p2', 10);
  put(state, 'aura', 'benevolent-blessing', 'p2', 'hand');
  put(state, 'mine', 'chained-throatseeker', 'p2', 'battlefield');
  put(state, 'foe', 'trostani-discordant', 'p1', 'battlefield', { tapped: true });
  if (combat) state.combat = combat;
  return state;
}

function auraScore(state) {
  const bot = createHeuristicBot({ seed: 235 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const opt = bot.trace()[0].options.find((o) => o.cmd === 'cast_permanent(aura->mine)');
  const pass = bot.trace()[0].options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  return { aura: opt?.score, pass };
}

test('M235 params: kara timingu flash-aury ochronnej jest WŁĄCZONA', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.flashProtectionAuraOffWindowPenalty, 120);
});

test('M235: flash-aura ochronna w MOIM UPKEEPIE schodzi poniżej passu (bot trzyma kartę)', () => {
  const { aura, pass } = auraScore(scenario({ step: 'upkeep', phase: 'upkeep' }));
  assert.ok(aura < pass, `aura w upkeepie (${aura}) musi być < pass (${pass}) — to zmarnowana elastyczność`);
});

test('M235: bot w upkeepie NIE rzuca flash-aury ochronnej (wybiera pass)', () => {
  const choice = createHeuristicBot({ seed: 235 })
    .chooseCommand(playerView(scenario({ step: 'upkeep', phase: 'upkeep' }), 'p2'), {});
  assert.notEqual(choice.type === 'cast_permanent' && choice.objectId === 'aura' ? 'cast' : 'inne', 'cast',
    `bot nie powinien rzucać flash-aury ochronnej w upkeepie: ${JSON.stringify(choice)}`);
});

test('M235: flash-aura ochronna w mojej GŁÓWNEJ 1 (ustawiam atak) — bez kary', () => {
  const { aura, pass } = auraScore(scenario({ step: 'main1', phase: 'precombat_main' }));
  assert.ok(aura > pass, `w Głównej 1 z gotowym atakującym aura (${aura}) ma być > pass (${pass})`);
});

test('M235: flash-aura ochronna w OKNIE WALKI (gospodarz atakuje) — bez kary', () => {
  const combat = { attackers: ['mine'], blockers: new Map(), attackingPlayerId: 'p2' };
  const { aura, pass } = auraScore(scenario({ step: 'declare_attackers', phase: 'combat', combat }));
  assert.ok(aura > pass, `w oknie walki aura (${aura}) ma być > pass (${pass})`);
});
