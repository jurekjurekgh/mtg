// PMSSB-71 (2026-10-20) — riot Gruul Beastmaster: wycena trybów modalnych przy wejściu.
// Plan: docs/plans/PLAN_2026-10-20c-batch69-kolekcja-412-425.md. Dane Oracle i rulingi:
// docs/cards/scryfall-<slug>.json (pobrane 2026-10-20).
// Mechaniki generyczne (ADR 0002) testowane na prawdziwych kartach i prawdziwym silniku:
// convoke (Kavu Primarch), riot (Gruul Beastmaster), kicker z licznikiem „if kicked\",
// koszt „sacrifice enchanted creature\" (Bloodfire Infusion), prewencja obrażeń bojowych
// celu (Fleeting Flight), trample dla stworów z licznikiem (Tuskguard Captain),
// aktywacja z cmentarza przy „control an enchantment\" (Heron-Blessed Geist),
// redukcja kosztu za przeciwników z obrażeniami (Gnoll War Band).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 69, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) {
    for (let i = 0; i < 8; i += 1) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  }
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const find = (state, cardId, zone = 'battlefield') => [...state.objects.values()]
  .find((object) => object.cardId === cardId && object.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function run(state, command) {
  assert.ok(command, 'oferta komendy istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, `${result.reason ?? 'odrzucono'}: ${JSON.stringify(result.events ?? [])}`);
  return result;
}

/** Rozstrzyga stos i pytania triggerów; [choose] wybiera cel, [mode] tryb modalny. */
function settle(state, { choose = null, mode = null, max = 120 } = {}) {
  for (let i = 0; i < max; i += 1) {
    const list = commands(state);
    if (state.pendingModalTrigger && mode != null) {
      const pick = list.find((c) => c.type === 'resolve_modal_choice' && c.modeIndex === mode);
      assert.ok(pick, 'wybór trybu dostępny');
      run(state, pick);
      continue;
    }
    const trig = list.find((c) => c.type === 'resolve_trigger_target');
    if (trig) {
      const pick = choose ? list.find((c) => c.type === 'resolve_trigger_target' && c.targetId === choose) : null;
      run(state, pick ?? trig);
      continue;
    }
    const resolving = list.find((c) => c.type.startsWith('resolve_'));
    if (resolving) { run(state, resolving); continue; }
    if (state.zones.stack.length === 0) return;
    const pass = list.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

const castCmd = (state, objectId, extra = {}) => commands(state).find((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent')
  && c.objectId === objectId && Object.entries(extra).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v)));

import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

function blank(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

/** Rzut Beastmastera z ręki do chwili oczekującego triggera riot; zwraca widok i wycenę trybów. */
function riotDecision({ foeLife = 20, mate = false, foeBlocker = null, params = undefined } = {}) {
  const state = game();
  if (foeLife !== 20) state.players.find((p) => p.id === 'p2').life = foeLife;
  if (mate) blank(state, 'mate', 'p1', 2, 2);
  if (foeBlocker) blank(state, 'foeb', 'p2', foeBlocker[0], foeBlocker[1]);
  put(state, 'gruul', 'gruul-beastmaster');
  addMana(state, 'p1', 4, { colors: ['G'] });
  run(state, castCmd(state, 'gruul'));
  for (let i = 0; i < 40 && !state.pendingModalTrigger; i += 1) run(state, commands(state).find((c) => c.type === 'pass_priority'));
  assert.ok(state.pendingModalTrigger, 'trigger riot oczekuje na wybór');
  const bot = createHeuristicBot({ seed: 7, params });
  const chosen = bot.chooseCommand(playerView(state, 'p1'), {});
  const scores = Object.fromEntries((bot.trace().at(-1)?.options ?? [])
    .filter((o) => o.cmd.startsWith('resolve_modal_choice'))
    .map((o) => [o.cmd, o.score]));
  return { chosen, scores };
}

test('PMSSB-71: LETAL — pośpiech Beastmastera (atak 2 + pompa +2 = 6) bije licznik przy życiu wroga 4', () => {
  const { chosen } = riotDecision({ foeLife: 4, mate: true });
  assert.equal(chosen.modeIndex, 1, `przy letalu z pośpiechem bot ma wybrać haste, wybrał ${chosen.modeIndex}`);
});

test('PMSSB-71 L41: wycena trybów riot = ta sama miara co słowa i ciała (haste = creatureKwHaste·moc/3; +1/+1 = 2+1)', () => {
  // Pomiar PRZED (docs/plans/PLAN_2026-10-20e): haste 10 (tryb 0 dostawał 0), licznik 15 (stała 5).
  // Po wdrożeniu: haste = 10 + 6·(2/3) = 14; licznik = 10 + (creaturePowerWeight + creatureToughnessWeight) = 13.
  const { scores } = riotDecision({ mate: true });
  assert.equal(scores['resolve_modal_choice(1)'], 14, 'haste = 10 + kotwica słowa przy mocy 2');
  assert.equal(scores['resolve_modal_choice(0)'], 13, 'licznik = 10 + wartość ciała +1/+1');
});

test('PMSSB-71 pokrętło: creatureKwHaste = 0 zdejmuje wartość trybu haste i bot wraca do licznika', () => {
  const params = normalizeHeuristicParams({ creatureKwHaste: 0 });
  const { chosen, scores } = riotDecision({ foeLife: 4, mate: true, params });
  assert.equal(scores['resolve_modal_choice(1)'], 10, 'bez kotwicy słowa haste wartość trybu = 0');
  assert.equal(chosen.modeIndex, 0, 'bez wartości haste wygrywa licznik');
});

test('PMSSB-71 anti-over-fix: bloker 4/4 wroga nie zmienia wyboru riotu bez letalu (pomiar 13 vs 14)', () => {
  const { chosen } = riotDecision({ foeLife: 20, mate: true, foeBlocker: [4, 4] });
  assert.equal(chosen.modeIndex, 1, 'tempo haste nadal wygrywa w pomiarze PMSSB-71 (14 > 13)');
});

test('PMSSB-71 F0 (RED): rzut Beastmastera ma skończoną wycenę — pompa source_power nie daje NaN', () => {
  // Pomiar PRZED: cast_permanent(gruul)=NaN, bo ETB_EFFECT_BONUS.pump czytał tekst 'source_power' jak liczbę
  // (przez anticipatedAttacksValue — trigger ataku Beastmastera). NaN zrywa wycenę rzutu: bot nie rzucał karty.
  const state = game();
  put(state, 'gruul', 'gruul-beastmaster');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const cast = (bot.trace().at(-1)?.options ?? []).find((o) => o.cmd.startsWith('cast_permanent'));
  assert.ok(cast, 'rzut Beastmastera jest w ofercie');
  assert.ok(Number.isFinite(cast.score), `wycena rzutu ma być skończona, jest ${cast.score}`);
});

test('PMSSB-71 F0 (RED): bot WYBIERA rzut Beastmastera z ręki przy pustym stole (wycena > pass 0)', () => {
  const state = game();
  put(state, 'gruul', 'gruul-beastmaster');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const chosen = createHeuristicBot({ seed: 7 }).chooseCommand(playerView(state, 'p1'), {});
  assert.equal(chosen.type, 'cast_permanent', `bot ma rzucić Beastmastera, wybrał ${chosen.type}`);
});
