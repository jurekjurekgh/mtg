// M257 runda 2 — „Uwagi z testów” właściciela (2026-08-29), taliow Warhammer.
//
// A: Squire's Lightblade — bot rzucił flash-Equipment NIE MAJĄC NA STOLE
//    ŻADNEJ KREATURY. ETB „attach to target creature you control” fizzluje
//    (CR 603.4b), a karta czeka za koszt Equip {3} zamiast darmowego attachu.
//    Root cause: wycena cast_permanent = P.creatureBase + P/T (equipment to
//    0/0) = 70 — tyle co zwykły stwór, zero kontekstu nosiciela. Fix: reguła
//    generyczna po deskryptorze equipmentu (ADR 0002): brak nosiciela = kara
//    poniżej passu (trzymaj; stwór z ręki grany PRZED equipmentem), nosiciel
//    na stole = premia za pompę.
//
// B: Rupture Spire — bot miał 3 nietapnięte lądy, a w decyzji „zapłać {1}
//    albo poświęć” wybrał POŚWIĘCENIE. Root cause: scoreCommand nie miało
//    case'u dla resolve_pay_or_sacrifice (domyślnie 0) → remis z wariantem
//    „poświęć” (również 0) → stabilny sort w chooseCommand bierze PIERWSZĄ
//    ofertę, a w enumeracji (game-state.js) na czele stało pay:false — bot
//    ZAWSZE poświęcał. Fix: jawna wycena (pay 90 / sacrifice 5 — decyzję
//    silnik prezentuje tylko gdy opłacalna, a w jej trakcie blokuje inne
//    akcje, więc płatność zawsze co najmniej tak dobra: CR 106.4) + odwrócenie
//    kolejności enumeracji na zgodną z udokumentowaną intencją. Ta sama
//    klasa braków case'u domknięta dla resolve_counter_pay_choice i
//    resolve_optional_pay_choice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/** Stół: p1 = bot (faza główna p1), p2 pusty. */
function game() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 6);
  return state;
}

function addHand(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'hand', ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

function addLandOnBoard(state, id, controllerId = 'p1') {
  const def = REGISTRY.get('basic-plains');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-plains', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'land', ...gameObjectDataOf(def),
    types: def.types ?? ['Land'], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

function addCreatureOnBoard(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(def),
    types: def.types ?? ['Creature'], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    abilities: def.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function scoresOf(bot, fragment) {
  const options = bot.trace()[0].options;
  return options.filter((o) => o.cmd.includes(fragment));
}

// ---------------------------------------------------------------------------
// B — Rupture Spire: „zapłać {1} albo poświęć”
// ---------------------------------------------------------------------------

function spireState() {
  // 2 nietapnięte lądy NA STOLE (jak w uwadze: „bot ma 3 nietapnięte lądy”),
  // Spire w ręce. Zagranie Spire (land drop) odpala ETB → decyzja.
  const state = game();
  addLandOnBoard(state, 'plains1');
  addLandOnBoard(state, 'plains2');
  addHand(state, 'spire', 'rupture-spire');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.ok(r.ok, `Spire ma wejść na stół: ${r.reason ?? ''}`);
  return state;
}

test('M257B1: decyzja pay-or-sacrifice — bot PŁACI (nie poświęca przy nietapniętych lądach)', () => {
  const state = spireState();
  assert.ok(state.pendingPayOrSacrifice, 'decyzja musi być oczekująca (silnik: opłacalna)');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(view, {});
  assert.equal(pick.type, 'resolve_pay_or_sacrifice');
  assert.equal(pick.pay, true, `bot musiał wybrać PŁATNOŚĆ (wybrał: ${pick.pay ? 'pay' : 'sacrifice'})`);
  const [pay, sac] = scoresOf(bot, 'resolve_pay_or_sacrifice');
  assert.ok(pay.score > sac.score, `jawna wycena: pay ${pay.score} > sacrifice ${sac.score}`);
});

test('M257B2: enumeracja — wariant „zapłać” OFEROWANY PIERWSZY (kolejność = intencja)', () => {
  const state = spireState();
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_pay_or_sacrifice');
  assert.equal(offers.length, 2, 'oba warianty w ofercie');
  assert.equal(offers[0].pay, true, 'pierwsza oferta = zapłata (dawniej pay:false — root cause błędu)');
  assert.equal(offers[0].cost, 1, 'komenda niesie koszt (M101/B)');
});

test('M257B3: end-to-end — po wyborze zapłaty Spire ZOSTAJE na stole', () => {
  const state = spireState();
  const sourceId = state.pendingPayOrSacrifice.sourceId;
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(view, {});
  const r = execute(state, { ...pick, playerId: 'p1' });
  assert.ok(r.ok, `zapłata musi przejść: ${r.reason ?? ''}`);
  const spire = state.objects.get(sourceId);
  assert.equal(spire?.zone, 'battlefield', 'Spire nie może trafić do grobu za decyzję, którą zapłacił');
  const paid = state.events.find((e) => e.type === 'pay_or_sacrifice_resolved' && e.paid === true);
  assert.ok(paid, 'zdarzenie pay_or_sacrifice_resolved{paid:true}');
});

// ---------------------------------------------------------------------------
// A — Squire's Lightblade: flash-Equipment bez nosiciela
// ---------------------------------------------------------------------------

test('M257A1: pusty stół, brak stwora w ręce — bot NIE RZUCA lightblade', () => {
  const state = game();
  addHand(state, 'blades', 'squires-lightblade');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(view, {});
  assert.notEqual(pick.type, 'cast_permanent', `bot nie rzuca equipmentu na pusty stół (wybrał: ${pick.type})`);
  const cast = scoresOf(bot, 'cast_permanent(blades)');
  assert.equal(cast.length, 1, 'rzut jest w ofercie (silnik go legalizuje)');
  assert.ok(cast[0].score < 0, `wycena poniżej passu (trzymaj kartę): ${cast[0].score}`);
});

test('M257A2: stwór w ręce — bot grany PRZED equipmentem, a potem lightblade ma sens (anti-overfix)', () => {
  const state = game();
  addHand(state, 'blades', 'squires-lightblade');
  addHand(state, 'game', 'highland-game');
  const view1 = playerView(state, 'p1');
  const bot1 = createHeuristicBot({ seed: 2026 });
  const first = bot1.chooseCommand(view1, {});
  assert.equal(first.objectId, 'game', `pierwszy wybór to stwór, nie equipment (wybrał: ${first.objectId ?? first.type})`);
  assert.ok(execute(state, { ...first, playerId: 'p1' }).ok);
  // Rozstrzygnij stos (stos → pole bitwy), żeby ETB lightblade miał cel.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  // Rozstrzygnięcie tworzy NOWY obiekt (id permanentu ≠ id czaru w ręce).
  const hostId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'highland-game'
    && state.objects.get(id)?.controllerId === 'p1');
  assert.ok(hostId, 'stwór wszedł na stół');
  const view2 = playerView(state, 'p1');
  const bot2 = createHeuristicBot({ seed: 2026 });
  const pick2 = bot2.chooseCommand(view2, {});
  const cast2 = scoresOf(bot2, 'cast_permanent(blades)');
  assert.ok(cast2[0].score > 0, `po wejściu stwora rzut lightblade jest WARTY (darmowy ETB attach): ${cast2[0].score}`);
  assert.equal(pick2.objectId, 'blades', 'bot teraz rzuca lightblade (za darmo uzbroi stwora)');
});

test('M257A3: własny stwór NA STOLE — lightblade ma premię pompy (anti-overfix)', () => {
  const state = game();
  addCreatureOnBoard(state, 'knight', 'highland-game');
  addHand(state, 'blades', 'squires-lightblade');
  const bot = createHeuristicBot({ seed: 2026 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const cast = scoresOf(bot, 'cast_permanent(blades)');
  // Baza 70 + pompa +1/+0 (wagi 2/1) = 72; waga rodziny „permanent” (0.9)
  // daje 64.8. Karany byłby tylko BRAK nosiciela (test A1: < 0).
  assert.ok(cast[0].score > 60, `nosiciel na stole = pełna wartość (+pompa): ${cast[0].score}`);
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(pick.objectId, 'blades', 'bot rzuca lightblade, gdy ma nosiciela');
});

test('M257A4: reguła generyczna — Blazing Torch (bez ETB-attachu) też trzymane bez nosiciela', () => {
  const state = game();
  addHand(state, 'torch', 'blazing-torch');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(view, {});
  assert.notEqual(pick.type, 'cast_permanent', `bez nosiciela torch nie wchodzi (wybrał: ${pick.type})`);
  const cast = scoresOf(bot, 'cast_permanent(torch)');
  assert.ok(cast[0].score < 0, `equipment bez ETB-attachu bez nosiciela poniżej passu: ${cast[0].score}`);
});

// ---------------------------------------------------------------------------
// Klasa B — ten sam brak case'u w sąsiednich decyzjach płatniczych
// ---------------------------------------------------------------------------

test('M257C1: counter-pay (Frightful Delusion) — bot PŁACI, żeby czar przetrwał', () => {
  const state = game();
  addHand(state, 'game', 'highland-game');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'game' });
  assert.ok(r.ok, `stos przyjmuje czar: ${r.reason ?? ''}`);
  const spellOnStack = state.zones.stack.find((id) => state.objects.get(id)?.cardId === 'highland-game');
  assert.ok(spellOnStack, 'czar czeka na stosie');
  // Decyzja należy do KONTROLERA celu (p1) — setup jak w m184 (pending
  // ustawiane bezpośrednio; oferta i walidacja idą normalną ścieżką).
  state.pendingCounterPay = {
    playerId: 'p1', amount: 1, sourceId: 'del-0', sourceCardId: 'frightful-delusion',
    targetId: spellOnStack, restorePriorityTo: 'p1',
  };
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(view, {});
  assert.equal(pick.type, 'resolve_counter_pay_choice', `oferta decyzji: ${view.legalCommands.map((c) => c.type).join(',')}`);
  assert.equal(pick.pay, true, 'czar na stosie jest warty więcej niż {1}');
  const res = execute(state, { ...pick, playerId: 'p1' });
  assert.ok(res.ok, `zapłata musi przejść: ${res.reason ?? ''}`);
  const spell = state.objects.get(spellOnStack);
  assert.equal(spell?.zone, 'stack', 'czar przetrwał (nie skontrowany)');
});
