// G (zgłoszenie właściciela 2026-10-29, Sea God's Scorn): „Mam wątpliwości w
// jaki sposób bot wybiera jakie permanenty mają wrócić do ręki przeciwnika […]
// ranking powinien układać permanenty przeciwnika wg ich TMC + TMC
// aur/enchantmentów + bonus za każdy pozytywny counter. A tak nie jest, bo
// przed chwilą bot zwrócił najmniejsze kreatury, a zostawił na stole
// największe.”
//
// Model właściciela = „rynek inwestycji”: cel bounce wybieramy po tym, ILE
// PRZECIWNIK W NIEGO WŁOŻYŁ, bo zwrot do ręki:
//  - liczniki zabiera NA STAŁE (CR 122.2 — „if a permanent leaves the
//    battlefield, its counters cease to exist”; karta wraca bez nich),
//  - aury zabiera NA STAŁE (CR 704.5m — aura bez gospodarza idzie do grobu),
//  - equipment zostaje na stole (CR 704.5n), ale przełożenie kosztuje manę,
//  - sam permanent trzeba rzucić ponownie (TMC = koszt odbudowy).
//
// Przed naprawą bounce wyceniał wyłącznie CIAŁO (2 × (P+T)) + TMC w wadze 2
// i płaskie +30 za aurę: tanie wielkie ciało wygrywało z tanim drobiazgiem
// niosącym drogi equipment/liczniki. Teraz `bounceInvestmentDelta`
// (heuristic-bot.js) dokłada:
//   P.bounceTmcWeight × TMC + P.bounceAuraTmcWeight × TMC aur
//   + P.bounceEquipmentTmcWeight × TMC equipmentów
//   + P.bounceCounterBonus × liczba pozytywnych liczników.
// Wymiary są BOUNCE'OWE (nie ruszają destroy/exile — tam karta ginie i liczy
// się ciało, nie inwestycja).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { attachAuraToCreature, attachEquipmentToCreature } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

function addReal(state, id, cardId, pid, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, zone,
    ...data, types: card.types ?? [], cardName: card.name, ownerId: pid, ...extra,
  });
  return state.objects.get(id);
}
function freeze(state, id, extra = {}) {
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false, ...extra,
  }));
}
/** Stół: p1 rzuca Sea God's Scorn (6 many), celem są permanenty p2. */
function scornBoard() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  addReal(state, 'scorn', 'sea-gods-scorn', 'p1', 'hand');
  for (let i = 0; i < 6; i += 1) addReal(state, `isl${i}`, 'basic-island', 'p1', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['U', 'U', 'U', 'U', 'U', 'U'] });
  return state;
}
/**
 * Ślad decyzji bota → wycena KAŻDEGO pojedynczego celu (warianty „scorn->id”).
 * Porównywanie wariantów jedno-celowych pokazuje RANKING celów niezależnie od
 * tego, ile celów zmieści się w „up to three”.
 */
function targetScores(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell', `bot rzucił czar (dostał ${JSON.stringify(chosen)})`);
  const trace = bot.trace();
  const entry = trace[trace.length - 1];
  const scores = new Map();
  for (const option of entry.options) {
    const match = /^cast_spell\(scorn->([^+]+)\)$/.exec(option.cmd);
    if (match) scores.set(match[1], option.score);
  }
  return { chosen, targets: chosen.targets ?? [], scores, view };
}
function assertPreferred(state, winner, loser, why) {
  const { scores } = targetScores(state);
  assert.ok(scores.has(winner) && scores.has(loser),
    `oba warianty jedno-celowe są w ofercie (${[...scores.keys()].join(', ')})`);
  assert.ok(scores.get(winner) > scores.get(loser),
    `${why} → ${winner}=${scores.get(winner)} vs ${loser}=${scores.get(loser)}`);
}

// ---------------------------------------------------------------------------
// 1. TMC DECYDUJE: tanie wielkie ciało vs drogi drobiazg. Wygrywa DROGI.
// ---------------------------------------------------------------------------
test("G/1: Sea God's Scorn — TMC celu waży więcej niż samo P/T", () => {
  const state = scornBoard();
  addReal(state, 'cheapBig', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'cheapBig', { power: 8, toughness: 8, manaCost: 1 });
  addReal(state, 'priceySmall', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'priceySmall', { power: 1, toughness: 1, manaCost: 6 });
  assertPreferred(state, 'priceySmall', 'cheapBig',
    'drobiazg za 6 many (odbudowa) bije 8/8 za 1 manę');
});

// ---------------------------------------------------------------------------
// 2. EQUIPMENT NA CELU: wcześniej niewidziany w ogóle (attachedAurasOf zna
//    tylko aury). Nosiciel ma być wybrany przed gołym, nawet większym ciałem.
// ---------------------------------------------------------------------------
test("G/2: Sea God's Scorn — equipment na celu podnosi jego wartość", () => {
  const state = scornBoard();
  // Bliźniaki o RÓWNYM ciele (2/2 + sword +3/+2 = 5/4) i TMC — różnicę robi
  // WYŁĄCZNIE equipment (TMC 4).
  addReal(state, 'bare', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'bare', { power: 5, toughness: 4, manaCost: 3 });
  addReal(state, 'equipped', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'equipped', { power: 2, toughness: 2, manaCost: 3 });
  addReal(state, 'equip', 'warriors-sword', 'p2', 'battlefield');
  attachEquipmentToCreature(state, 'equip', 'equipped');
  assertPreferred(state, 'equipped', 'bare',
    'bliźniak z equipmentem (TMC 4) bije gołego — przełożenie kosztuje manę');
});

// ---------------------------------------------------------------------------
// 3. AURA NA CELU: droga aura bije tanią (płaskie +30 nie różnicowało kosztu).
// ---------------------------------------------------------------------------
test("G/3: Sea God's Scorn — TMC aury na celu różnicuje wybór", () => {
  const state = scornBoard();
  // Dwie aury BEZ pompy (Curiosity TMC 1, Capture Sphere TMC 4), bliźniacze
  // ciała i ta sama TMC stworu — płaskie +30 za aurę znosi się, więc różnicę
  // robi wyłącznie TMC samej aury (karta ginie z hostem, CR 704.5m).
  addReal(state, 'cheapAura', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'cheapAura', { power: 2, toughness: 2, manaCost: 3 });
  addReal(state, 'a1', 'curiosity', 'p2', 'battlefield');
  attachAuraToCreature(state, 'a1', 'cheapAura');
  addReal(state, 'priceyAura', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'priceyAura', { power: 2, toughness: 2, manaCost: 3 });
  addReal(state, 'a2', 'capture-sphere', 'p2', 'battlefield');
  attachAuraToCreature(state, 'a2', 'priceyAura');
  assertPreferred(state, 'priceyAura', 'cheapAura',
    'aura za 4 many (ginie z hostem) bije aurę za 1 manę');
});

// ---------------------------------------------------------------------------
// 4. LICZNIKI: +1/+1 znikają NA STAŁE (CR 122.2). Stwór z licznikami ma być
//    celem przed identycznym ciałem bez liczników (ta sama baza, ta sama TMC).
// ---------------------------------------------------------------------------
test("G/4: Sea God's Scorn — pozytywne liczniki podnoszą wartość celu", () => {
  const state = scornBoard();
  // RÓWNE efektywne ciało (3/3): goły 3/3 vs 1/1 z dwoma +1/+1 — różnicę
  // robi wyłącznie to, że liczniki przepadają na stałe (CR 122.2).
  addReal(state, 'plain', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'plain', { power: 3, toughness: 3, manaCost: 3 });
  addReal(state, 'countered', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'countered', { power: 1, toughness: 1, manaCost: 3, counters: { '+1/+1': 2 } });
  assertPreferred(state, 'countered', 'plain',
    'liczniki +1/+1 przepadają na stałe (CR 122.2)');
});

// ---------------------------------------------------------------------------
// 5. ANTY-OVER-FIX: liczniki MINUSOWE nie są walorem (to obciążenie, nie
//    inwestycja) — cel z -1/-1 nie może wygrywać z bliźniakiem bez liczników.
// ---------------------------------------------------------------------------
test("G/5: Sea God's Scorn — liczniki -1/-1 nie udają wartości", () => {
  const state = scornBoard();
  addReal(state, 'plain', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'plain', { power: 3, toughness: 3, manaCost: 3 });
  addReal(state, 'mired', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'mired', { power: 3, toughness: 3, manaCost: 3, counters: { '-1/-1': 3 } });
  assertPreferred(state, 'plain', 'mired',
    'liczniki -1/-1 nie są inwestycją (premia liczy tylko rodzaje dodatnie)');
});

// ---------------------------------------------------------------------------
// 6. PEŁNA DECYZJA (4 cele, „up to three”): najmniej zainwestowany zostaje.
//    To jest dokładnie zgłoszony objaw — „zostawił na stole największe”.
// ---------------------------------------------------------------------------
test("G/6: Sea God's Scorn — z czterech celów odpada NAJMNIEJ zainwestowany", () => {
  const state = scornBoard();
  // Największe CIAŁO, ale najtańsze w odbudowie i bez załączników.
  addReal(state, 'bigCheap', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'bigCheap', { power: 8, toughness: 8, manaCost: 1 });
  // Dwa ciała średnie, droższe w odbudowie.
  for (const [id, tmc] of [['mid1', 4], ['mid2', 4]]) {
    addReal(state, id, 'highland-game', 'p2', 'battlefield');
    freeze(state, id, { power: 4, toughness: 4, manaCost: tmc });
  }
  // Cel „zainwestowany”: drogi i z dwoma licznikami.
  addReal(state, 'invested', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'invested', { power: 1, toughness: 1, manaCost: 6, counters: { '+1/+1': 2 } });

  const { targets } = targetScores(state);
  assert.equal(targets.length, 3, '„up to three” = trzy cele');
  assert.ok(targets.includes('invested'), 'najbardziej zainwestowany jest wśród celów');
  assert.ok(!targets.includes('bigCheap'),
    `najmniej zainwestowany (8/8 za 1) zostaje na stole; wybrano: ${targets.join(',')}`);
});
