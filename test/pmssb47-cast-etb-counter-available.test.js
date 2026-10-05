// PMSSB-47 (2026-10-03h) — bramka celu ETB `add_counter` przy rzucie
// permanentu; KOREKTA po audycie PR #153 (sesja 2026-10-03j).
//
// Wersja z PR #153 wymagała stwora JUŻ na polu bitwy, więc rzut Weftblade
// Enhancer przy pustym stole własnym nie dostawał premii ETB. Tymczasem
// wchodzący permanent JEST na polu bitwy, gdy trigger ETB trafia na stos
// (CR 603.6a) i — bez `notSelf` — sam jest legalnym celem („up to two target
// creatures”, „target creature you control”; silnik oferuje go w
// `resolve_trigger_target` jako `permanent-N`). Wchodzący LĄD/artefakt
// (Idyllic Grange) nadal nie może być własnym gospodarzem, a spec `notSelf`
// („another target Merfolk you control” — Jade Bearer) wymaga INNEGO stwora.
//
// Piny mierzą wycenę ścieżką bota (`trace()`), nie helper wewnętrzny:
//  E1 — self-host liczy się przy pustym stole (brak ~6-punktowej dziury);
//  E2 — bot nadal wybiera rzut, gdy cel istnieje;
//  E3 — przy pustym stole oferta rzutu jest skończona (korpus jest coś wart);
//  E4 — `notSelf` bez innego Merfolka daje 0 premii, z innym Merfolkiem +6
//       (kontrola braku over-fixu w drugą stronę), nadmiarowy Merfolk nic
//       nie dodaje (premia jest o DOSTĘPNOŚĆ, nie o liczbę).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const R = createCardRegistry();
const cardDef = (cid) => R.get(cid);

function put(state, id, cid, ctl, zone, patch = {}) {
  const d = cardDef(cid);
  addObject(state, {
    id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [],
    subtypes: d.subtypes ?? [], spell: d.spell, manaCost: d.manaCost,
    warp: d.warp ? { ...d.warp } : undefined, abilities: d.abilities ?? [],
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
}

/** Plansza: 6 lądów (jeden typ many na rzut), `hand` w ręce, N stworów na stole. */
function setup(hand, { lands = 'basic-plains', n = 0, subtype = null } = {}) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...jumpToStep(state.turn, 'main', 'p1'), activePlayerId: 'p1', priorityPlayerId: 'p1' };
  const landSub = lands === 'basic-forest' ? 'Forest' : 'Plains';
  for (let i = 0; i < 6; i++) put(state, `l${i}`, lands, 'p1', 'battlefield', { subtypes: [landSub] });
  for (let i = 0; i < n; i++) {
    put(state, `m${i}`, 'goblin-piker', 'p1', 'battlefield', {
      power: 2, toughness: 2, summoningSickness: false,
      ...(subtype ? { subtypes: [subtype] } : {}),
    });
  }
  put(state, 'h', hand, 'p1', 'hand');
  return state;
}

/** Wycena oferty `cast_permanent` z ostatniej decyzji bota (te same kształty co ślad). */
function castScore(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const t = bot.trace().at(-1);
  const opt = t.options.find((o) => typeof o.cmd === 'string' && o.cmd.startsWith('cast_permanent'));
  return opt?.score ?? -Infinity;
}

describe('PMSSB-47 (po korekcie audytu PR #153): bramka celu ETB widzi wchodzącego i stół', () => {
  let score0, score1, scoreJade0, scoreJade1, scoreJade2;
  before(() => {
    score0 = castScore(setup('weftblade-enhancer', { n: 0 }));
    score1 = castScore(setup('weftblade-enhancer', { n: 1 }));
    // Jade Bearer: spec { type: 'creature_you_control', notSelf: true, subtype: 'Merfolk' }.
    scoreJade0 = castScore(setup('jade-bearer', { lands: 'basic-forest', n: 0 }));
    scoreJade1 = castScore(setup('jade-bearer', { lands: 'basic-forest', n: 1, subtype: 'Merfolk' }));
    scoreJade2 = castScore(setup('jade-bearer', { lands: 'basic-forest', n: 2, subtype: 'Merfolk' }));
  });

  it('E1 (CR 603.6a): wchodzący stwór jest własnym gospodarzem — brak dziury ~6 pkt przy pustym stole', () => {
    assert.ok(score0 >= score1 - 3,
      `score przy 0 stworach (${score0}) nie może być niższy od score przy 1 stworze (${score1}) o premię ETB — wchodzący stwór jest legalnym celem`);
  });

  it('E2 przy 1 własnym stwórze bot wybiera cast_permanent', () => {
    const s = setup('weftblade-enhancer', { n: 1 });
    const view = playerView(s, 'p1');
    const bot = createHeuristicBot({ seed: 1 });
    const cmd = bot.chooseCommand(view, {});
    assert.ok(String(cmd.type ?? cmd.cmd ?? '').startsWith('cast_permanent'), 'bot wybiera rzut przy dostępnym celu');
  });

  it('E3 przy 0 własnych stworach score rzutu jest liczbą skończoną', () => {
    assert.ok(Number.isFinite(score0), 'oferta rzutu istnieje (sam korpus jest wart zagrania)');
  });

  it('E4 (kontrola `notSelf`): „another target Merfolk you control” wymaga INNEGO Merfolka', () => {
    assert.ok(scoreJade1 > scoreJade0 + 3,
      `z Merfolkiem (${scoreJade1}) premia ETB musi być, bez Merfolka (${scoreJade0}) nie ma — notSelf wyklucza wchodzącego`);
    assert.ok(Math.abs(scoreJade2 - scoreJade1) < 1,
      `drugi Merfolk nie zmienia premii (${scoreJade2} vs ${scoreJade1}) — liczy się dostępność, nie liczba`);
  });
});
