import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-23 (metoda M429) — rodzina LICZNIKÓW (`add_counter` i rodzeństwo).
// 33 karty w katalogu (25× `+1/+1`, 2× stun, 2× charge, 2× oil, 1× `-1/-1`,
// 1× level, 1× point); okna: 7 czarów, 7 zdolności aktywowanych, ~19 triggerów.
//
// Pomiar PRZED (sondy /home/user/scratch/pmssb23-*.mjs, tabela w planie
// docs/plans/PLAN_2026-09-29e-pmssb23-liczniki.md):
//   F1 (L41) — w `cast_spell` wyceniane były TYLKO liczniki przyjazne; `stun`
//     i `-1/-1` rzucone czarem dawały 0, choć ta sama instrukcja ze zdolności
//     dostawała 10 + 4·amount. Stall Out na tapniętym 6/6 = 38, czyli trzy
//     liczniki stun (CR 122.1d: cel nie odkręci się trzy razy) wnosiły tyle
//     co nic, a `dont_untap_next_untap_step` (Sleep of the Dead, jedna tura)
//     był wyceniony. Trzy kopie klasyfikacji: BENEFICIAL_COUNTERS, lista
//     `beneficial` w czarach, DEBUFF_COUNTERS w zdolnościach.
//   F2 — cel wrogiego licznika bez wymiaru zagrożenia (1/1 = 8/8).
//   F3 — rider `add_counter_to_creatures_you_control` (trwałe +1/+1 na każdy
//     mój stwór z licznikiem) = 0 pkt.
//   F4 — ewazja gospodarza niewidoczna (Flying = wanilia).
//   F5 — timing: main1 = main2 (zero różnicy).
//
// Fala A (ten plik): jedna klasyfikacja (`STAT_COUNTERS`/`DEBUFF_COUNTERS`)
// i jedna wycena `counterEffectValue` w obu ścieżkach. Kotwica anty-over-fix
// (M429): wartości liczników przyjaznych i zdolnościowych BEZ zmian.

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    ownerId: controllerId, zone: 'battlefield', kind: 'creature', power, toughness,
    manaCost: 3, types: ['Creature'], subtypes: extra.subtypes ?? [], colors: [],
    abilities: [], keywords: extra.keywords ?? [],
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false,
    ...(extra.tapped ? { tapped: true } : {}),
  }));
  if (extra.counters) for (const [kind, n] of Object.entries(extra.counters)) addCounter(state, id, kind, n);
  return state.objects.get(id);
}

function base({ step = 'main1', mana = 12 } = {}) {
  const state = createGameState({ seed: 23, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', mana);
  for (let i = 0; i < 8; i++) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function decide(state, actor = 'p2', params = undefined) {
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, actor), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function scoreOf(state, cmd, params = undefined, actor = 'p2') {
  const { options } = decide(state, actor, params);
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// F1 — wrogi licznik rzucony CZAREM jest wyceniony (był 0).
// ---------------------------------------------------------------------------

test('PMSSB-23/A1: Stall Out na wrogim 6/6 = 71 (PRZED 40 — trzy liczniki stun warte 0)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'] });
  // 40 (PRZED) + 10 + 4·3 (Fala A: wspólna wycena licznika wrogiego)
  // + 9 (Fala B: dopłata za zagrożenie 0,5 × worth(6/6) = 0,5 × 18) = 71.
  assert.equal(scoreOf(state, 'cast_spell(so->foe)'), 71);
});

test('PMSSB-23/A2: wartość stun zostaje, gdy tapnięcie jest no-opem (cel już tapnięty)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'], tapped: true });
  // PRZED: 38 — skoro tap nic nie zmienia, cała reszta to baza czaru, czyli
  // stun nie był wyceniony wcale. PO: 38 + 22 (Fala A) + 9 (Fala B) = 69.
  assert.equal(scoreOf(state, 'cast_spell(so->foe)'), 69);
});

test('PMSSB-23/A3: blokada na trzy tury (3× stun) bije blokadę na jedną (dont_untap)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCard(state, 'sd', 'sleep-of-the-dead', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'] });
  const trzyTury = scoreOf(state, 'cast_spell(so->foe)');
  const jednaTura = scoreOf(state, 'cast_spell(sd->foe)');
  assert.equal(trzyTury, 71);
  assert.equal(jednaTura, 23);
  assert.ok(trzyTury > jednaTura, 'dłuższa blokada musi być warta więcej');
});

test('PMSSB-23/A4: stun na WŁASNYM stworze = samobój (−89, PRZED +1)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', 3, 3);
  putCreature(state, 'mine', 'p2', 2, 2);
  const wrogi = scoreOf(state, 'cast_spell(so->foe)');
  const wlasny = scoreOf(state, 'cast_spell(so->mine)');
  assert.equal(wlasny, -89, 'PRZED: +1 — gałąź wrogich liczników w czarze nie istniała');
  assert.ok(wrogi > 0 && wrogi > wlasny, 'kierunek musi rozstrzygać wybór celu');
  const { choice } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'so', targets: ['foe'] });
});

// ---------------------------------------------------------------------------
// Kotwice anty-over-fix (M429): to, co było wycenione, nie drgnęło.
// ---------------------------------------------------------------------------

test('PMSSB-23/A5: liczniki przyjazne bez zmian — Courage 70/−92, Dragonscale 86/68/62)', () => {
  const courage = base();
  putCard(courage, 'cic', 'courage-in-crisis', 'p2');
  putCreature(courage, 'mine', 'p2', 2, 2);
  putCreature(courage, 'foe', 'p1', 2, 2);
  assert.equal(scoreOf(courage, 'cast_spell(cic->mine)'), 70, 'kotwica PMSSB-18/R1+R2');
  assert.equal(scoreOf(courage, 'cast_spell(cic->foe)'), -92, 'kotwica M155');

  const boon = base();
  putCard(boon, 'db', 'dragonscale-boon', 'p2');
  putCreature(boon, 'duze', 'p2', 5, 5);
  putCreature(boon, 'srednie', 'p2', 2, 2);
  putCreature(boon, 'male', 'p2', 1, 1);
  // counterHostValue: 2 + 4·2 + 2·(2P+T) — waga ciała gospodarza bez zmian.
  assert.equal(scoreOf(boon, 'cast_spell(db->duze)'), 86);
  assert.equal(scoreOf(boon, 'cast_spell(db->srednie)'), 68);
  assert.equal(scoreOf(boon, 'cast_spell(db->male)'), 62);
});

test('PMSSB-23/A6: ścieżka zdolności bez zmian (Trigon 34/16, Rustvine −6)', () => {
  const trigon = base();
  putCard(trigon, 'trig', 'trigon-of-corruption', 'p2', 'battlefield');
  addCounter(trigon, 'trig', 'charge', 3);
  putCreature(trigon, 'kruchy', 'p1', 1, 1);
  putCreature(trigon, 'sredni', 'p1', 3, 3);
  // M221/F: dobiecie licznikiem -1/-1 (CR 704.5f) = 30 + 2·moc; inaczej 10 + 4.
  assert.equal(scoreOf(trigon, 'activate_ability(trig#1->kruchy)'), 34);
  assert.equal(scoreOf(trigon, 'activate_ability(trig#1->sredni)'), 20.5); // 16 + 4,5 (Fala B)

  const rustvine = base();
  putCard(rustvine, 'rc', 'rustvine-cultivator', 'p2', 'battlefield');
  // M173/D: licznik zasobowy bez konsumenta, który miałby co robić = −6 → pass.
  assert.equal(scoreOf(rustvine, 'activate_ability(rc#0)'), -6);
  assert.equal(decide(rustvine).choice.type, 'pass_priority');
});

// ---------------------------------------------------------------------------
// F2 — cel wrogiego licznika: dopłata za zagrożenie (PRZED: remis 62/62).
// ---------------------------------------------------------------------------

function stallOutNa(foe, extra = {}) {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', foe[0], foe[1], extra);
  return state;
}

test('PMSSB-23/B1: im większe zagrożenie, tym droższa blokada (74 / 71 / 66,5 / 63,5)', () => {
  // PRZED: 62 / 62 / 62 / 62 — trzy liczniki stun na 8/8 warte tyle, co na 1/1.
  assert.equal(scoreOf(stallOutNa([8, 8]), 'cast_spell(so->foe)'), 74);
  assert.equal(scoreOf(stallOutNa([6, 6], { keywords: ['Trample'] }), 'cast_spell(so->foe)'), 71);
  assert.equal(scoreOf(stallOutNa([3, 3]), 'cast_spell(so->foe)'), 66.5);
  assert.equal(scoreOf(stallOutNa([1, 1]), 'cast_spell(so->foe)'), 63.5);
});

test('PMSSB-23/B2: przy dwóch wrogach bot wybiera większe zagrożenie, nie pierwszy cel', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'grozny', 'p1', 6, 6, { keywords: ['Trample'] });
  putCreature(state, 'drobny', 'p1', 1, 1);
  assert.equal(scoreOf(state, 'cast_spell(so->grozny)'), 71);
  assert.equal(scoreOf(state, 'cast_spell(so->drobny)'), 63.5);
  assert.deepEqual(decide(state).choice.targets, ['grozny']);
});

test('PMSSB-23/B3: waga ×0 przywraca dawny remis (kotwica anty-over-fix M429)', () => {
  for (const foe of [[8, 8], [6, 6], [3, 3], [1, 1]]) {
    assert.equal(
      scoreOf(stallOutNa(foe), 'cast_spell(so->foe)', { counterThreatWeight: 0 }),
      62, `dla ${foe[0]}/${foe[1]} waga ×0 musi dawać dawną wartość`,
    );
  }
});

test('PMSSB-23/B4: dopłata nie przebija dobicia — „zabij 1/1" zostaje najwyżej', () => {
  const state = base();
  putCard(state, 'trig', 'trigon-of-corruption', 'p2', 'battlefield');
  addCounter(state, 'trig', 'charge', 3);
  putCreature(state, 'kruchy', 'p1', 1, 1);
  putCreature(state, 'sredni', 'p1', 3, 3);
  putCreature(state, 'grozny', 'p1', 6, 6);
  const kill = scoreOf(state, 'activate_ability(trig#1->kruchy)');
  const duzy = scoreOf(state, 'activate_ability(trig#1->grozny)');
  const maly = scoreOf(state, 'activate_ability(trig#1->sredni)');
  assert.equal(kill, 34, 'dobijanie bez zmian (30 + 2·moc) — limit dopłaty pilnuje kolejności');
  assert.equal(duzy, 25, 'PRZED 16: -1/-1 na 6/6 warte tyle, co na 3/3');
  assert.equal(maly, 20.5);
  assert.ok(kill > duzy && duzy > maly, 'dobicie > duże zagrożenie > małe');
  // Kotwica: przy wadze ×0 obie gałęzie „cel przeżyje" wracają do 16.
  assert.equal(scoreOf(state, 'activate_ability(trig#1->grozny)', { counterThreatWeight: 0 }), 16);
  assert.equal(scoreOf(state, 'activate_ability(trig#1->kruchy)', { counterThreatWeight: 0 }), 34);
});

// ---------------------------------------------------------------------------
// F3 — rider „połóż licznik na KAŻDYM moim stworze z licznikiem" (PRZED: 0).
// ---------------------------------------------------------------------------

function lifecrafterZ(n) {
  const state = base();
  putCard(state, 'lg', 'lifecrafters-gift', 'p2');
  for (let i = 0; i < n; i++) putCreature(state, `c${i}`, 'p2', 2, 2, { counters: { '+1/+1': 1 } });
  if (n === 0) putCreature(state, 'cel', 'p2', 2, 2);
  return { state, cmd: `cast_spell(lg->${n === 0 ? 'cel' : 'c0'})` };
}

test('PMSSB-23/B5: rider rozlania rośnie z liczbą odbiorców (72 / 78 / 82 / 90)', () => {
  // PRZED: 68 / 74 / 74 / 74 — rider `add_counter_to_creatures_you_control`
  // nie miał gałęzi wyceny, więc 4 trwałe +1/+1 były warte tyle, co 1.
  // Odbiorcy = moi stwory z licznikiem (cel główny dostaje licznik z efektu
  // celowanego, więc przy zeru nosicieli i tak jest jeden odbiorca — cel).
  for (const [n, want] of [[0, 72], [1, 78], [2, 82], [4, 90]]) {
    const { state, cmd } = lifecrafterZ(n);
    assert.equal(scoreOf(state, cmd), want, `dla ${n} stworów z licznikiem`);
  }
});

test('PMSSB-23/B6: dopłata za odbiorcę ×0 przywraca dawne wartości (kotwica)', () => {
  for (const [n, want] of [[0, 68], [1, 74], [2, 74], [4, 74]]) {
    const { state, cmd } = lifecrafterZ(n);
    assert.equal(scoreOf(state, cmd, { counterSpreadPerRecipient: 0 }), want,
      `dla ${n} stworów z licznikiem`);
  }
});
