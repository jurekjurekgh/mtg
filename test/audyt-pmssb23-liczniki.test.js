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

function scoreOf(state, cmd, actor = 'p2', params = undefined) {
  const { options } = decide(state, actor, params);
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// F1 — wrogi licznik rzucony CZAREM jest wyceniony (był 0).
// ---------------------------------------------------------------------------

test('PMSSB-23/A1: Stall Out na wrogim 6/6 = 62 (PRZED 40 — trzy liczniki stun warte 0)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'] });
  // 40 (PRZED) + 10 + 4·3 (wspólna wycena licznika wrogiego) = 62.
  assert.equal(scoreOf(state, 'cast_spell(so->foe)'), 62);
});

test('PMSSB-23/A2: wartość stun zostaje, gdy tapnięcie jest no-opem (cel już tapnięty)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'], tapped: true });
  // PRZED: 38 — skoro tap nic nie zmienia, cała reszta to baza czaru, czyli
  // stun nie był wyceniony wcale. PO: 38 + 22 = 60.
  assert.equal(scoreOf(state, 'cast_spell(so->foe)'), 60);
});

test('PMSSB-23/A3: blokada na trzy tury (3× stun) bije blokadę na jedną (dont_untap)', () => {
  const state = base();
  putCard(state, 'so', 'stall-out', 'p2');
  putCard(state, 'sd', 'sleep-of-the-dead', 'p2');
  putCreature(state, 'foe', 'p1', 6, 6, { keywords: ['Trample'] });
  const trzyTury = scoreOf(state, 'cast_spell(so->foe)');
  const jednaTura = scoreOf(state, 'cast_spell(sd->foe)');
  assert.equal(trzyTury, 62);
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
  assert.equal(scoreOf(trigon, 'activate_ability(trig#1->sredni)'), 16);

  const rustvine = base();
  putCard(rustvine, 'rc', 'rustvine-cultivator', 'p2', 'battlefield');
  // M173/D: licznik zasobowy bez konsumenta, który miałby co robić = −6 → pass.
  assert.equal(scoreOf(rustvine, 'activate_ability(rc#0)'), -6);
  assert.equal(decide(rustvine).choice.type, 'pass_priority');
});
