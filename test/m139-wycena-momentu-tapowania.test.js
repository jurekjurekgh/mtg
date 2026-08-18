// =============================================================================
// M139 (uwaga właściciela) — WARTOŚĆ TAPNIĘCIA ZALEŻY OD MOMENTU.
//
// „Najefektywniejsze jest tapowanie kreatur przeciwnika po jego fazie untap —
// wtedy taka kreatura jest nieczynna i w ataku, i w obronie. Warto to
// uwzględnić w wycenie.”
//
// STAN PRZED: wycena znała tylko CEL (`8 + 2*power`), nie znała CHWILI. Każde
// okno było warte tyle samo, więc bot tapował kiedy popadnie — również we
// własnej turze, gdzie efekt kasuje się przy najbliższym untap stepie
// przeciwnika (untapControlled odkręca permanenty AKTYWNEGO gracza).
//
// REGUŁY, które to porządkują:
//  * CR 502.x — untap step odkręca permanenty aktywnego gracza. Tapnięcie
//    w mojej turze zniknie, zanim przeciwnik zacznie działać.
//  * CR 506.4 — tapnięcie zadeklarowanego atakującego NIE wycofuje go z walki;
//    obrażenia i tak padną. Zysk zostaje tylko „nie zablokuje u mnie”.
//  * CR 509.1a — tapnięty stwór nie może blokować.
//
// Stąd hierarchia okien: upkeep/draw przeciwnika (wyłącza atak I obronę)
// > jego main przed deklaracją > moja tura przed atakiem (samo zdjęcie
// blokera) > mój koniec tury (wyparuje, nic nie kupuje).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/**
 * Bot (p1) kontroluje Entrancing Lyre ({X},{T}: tapnij cel o sile ≤ X
 * + blokada odkręcania) i sześć lądów. Przeciwnik (p2) ma stwora 3/3.
 *
 * UWAGA na pułapkę pomiarową: `jumpToStep` NIE zmienia aktywnego gracza —
 * trzeba ustawić `activePlayerId` jawnie, inaczej „tura przeciwnika”
 * w scenariuszu wcale nią nie jest (na tym poległ pierwszy pomiar tej zmiany).
 */
function scenario(step, activePlayerId, { foeTapped = false, foeAttacking = false } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY });
  const card = REGISTRY.get('entrancing-lyre');
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id: 'lyre', instanceId: 'i-lyre', cardId: 'entrancing-lyre',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...data,
  });
  state.objects.set('lyre', Object.freeze({ ...state.objects.get('lyre'), summoningSickness: false }));
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: 'mountain',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      kind: 'land', types: ['Land'], subtypes: ['Mountain'], keywords: [], abilities: [], colors: [], manaCost: 0,
    });
  }
  addObject(state, {
    id: 'foe', instanceId: 'i-foe', cardId: 'x-foe', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 3,
  });
  state.objects.set('foe', Object.freeze({
    ...state.objects.get('foe'), summoningSickness: false, tapped: foeTapped,
  }));
  state.turn = jumpToStep(state.turn, step, activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = 'p1';
  if (foeAttacking) {
    state.combat = { attackingPlayerId: 'p2', attackers: ['foe'], blockers: new Map(), blockedAttackers: new Set() };
  }
  return playerView(state, 'p1');
}

/** Najlepszy wynik oferty tapnięcia w danym oknie (z rankingu bota). */
function tapScore(view) {
  const bot = createHeuristicBot({ seed: 5 });
  bot.chooseCommand(view, {});
  const last = bot.trace().at(-1);
  const taps = last.options.filter((o) => String(o.cmd).startsWith('activate_ability'));
  assert.ok(taps.length > 0, 'scenariusz musi oferować tapnięcie — inaczej test nic nie mierzy');
  return Math.max(...taps.map((o) => o.score));
}

test('M139: okno PO untap przeciwnika jest wyceniane najwyżej', () => {
  const afterUntap = tapScore(scenario('upkeep', 'p2'));
  const myMain = tapScore(scenario('main', 'p1'));
  const myEnd = tapScore(scenario('end', 'p1'));

  assert.ok(afterUntap > myMain,
    `tapnięcie po untap przeciwnika (${afterUntap}) musi bić tapnięcie w mojej turze (${myMain}) — tam wyparuje przy jego untapie`);
  assert.ok(afterUntap > myEnd,
    `tapnięcie po untap przeciwnika (${afterUntap}) musi bić koniec mojej tury (${myEnd})`);
});

test('M139: w moim końcu tury bot NIE tapuje (efekt zniknie przy jego untapie)', () => {
  const view = scenario('end', 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  assert.notEqual(choice.type, 'activate_ability',
    'tapnięcie tuż przed untap stepem przeciwnika to wyrzucona mana — CR 502.x');
});

test('M139: w upkeepie przeciwnika bot tapuje (wyłącza atak I obronę)', () => {
  const view = scenario('upkeep', 'p2');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'activate_ability', 'to jest najlepsze okno — bot ma z niego korzystać');
  assert.ok((choice.targets ?? []).includes('foe'), 'celem musi być stwór przeciwnika');
});

test('M139: tapnięcie ZADEKLAROWANEGO atakującego warte mniej niż przed deklaracją (CR 506.4)', () => {
  const beforeDeclaration = tapScore(scenario('upkeep', 'p2'));
  const afterDeclaration = tapScore(scenario('declare_attackers', 'p2', { foeAttacking: true }));
  assert.ok(afterDeclaration < beforeDeclaration,
    `po deklaracji ataku tapnięcie nie cofa obrażeń (${afterDeclaration}) — musi być warte mniej niż okno przed nią (${beforeDeclaration})`);
});

test('M139: cel JUŻ tapnięty jest wyceniany niżej niż gotowy do działania', () => {
  const ready = tapScore(scenario('upkeep', 'p2'));
  const alreadyTapped = tapScore(scenario('upkeep', 'p2', { foeTapped: true }));
  assert.ok(alreadyTapped < ready,
    `tapowanie tapniętego stwora niewiele wnosi (${alreadyTapped}) wobec gotowego (${ready})`);
});

test('M139: bot NADAL nie tapuje WŁASNYCH permanentów (bramka M121 nienaruszona)', () => {
  // Regresja: premia za dobre okno nie może przebić kary za autoagresję.
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY });
  const card = REGISTRY.get('entrancing-lyre');
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id: 'lyre', instanceId: 'i-lyre', cardId: 'entrancing-lyre',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...data,
  });
  state.objects.set('lyre', Object.freeze({ ...state.objects.get('lyre'), summoningSickness: false }));
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: 'mountain',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      kind: 'land', types: ['Land'], subtypes: ['Mountain'], keywords: [], abilities: [], colors: [], manaCost: 0,
    });
  }
  // JEDYNY stwór na stole jest MÓJ — bot nie ma legalnego wrogiego celu.
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'x-mine', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 3,
  });
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'upkeep', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';

  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  const tapsOwn = choice.type === 'activate_ability' && (choice.targets ?? []).includes('mine');
  assert.ok(!tapsOwn, 'nawet w optymalnym oknie bot nie może unieruchamiać własnego stwora');
});

test('M139: kara za złe okno NIE dotyczy efektów grywalnych tylko w mojej turze', () => {
  // Pułapka, w którą łatwo wpaść przy tej zmianie: „nie tapuj w swojej turze”
  // zamieniłoby SORCERY tapujące (Aerith Rescue Mission) w kartę nie do
  // zagrania NIGDY — sorcery wolno rzucić wyłącznie we własnej głównej fazie.
  // Rozróżnienie po deskryptorze (`timing` / typ karty), nie po nazwie (ADR 0002).
  const source = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  assert.ok(/canWait/.test(source), 'brak rozróżnienia „czy da się poczekać na lepsze okno”');

  const timingFn = /const tapTimingBonus = \(view, target, \{[\s\S]*?\n  \};/.exec(source);
  assert.ok(timingFn, 'nie znaleziono funkcji wyceny momentu');
  assert.ok(/canWait \? -4 : 0/.test(timingFn[0]),
    'kara za tapowanie w swojej turze musi znikać, gdy czekanie jest niewykonalne');

  // Oba miejsca ustalają canWait z deskryptora, nie na sztywno.
  assert.ok(/ability\?\.timing !== 'sorcery'/.test(source),
    'ścieżka zdolności musi czytać `timing` (activate only as a sorcery)');
  assert.ok(/cardTypes\.includes\('Instant'\)/.test(source),
    'ścieżka czarów musi rozpoznawać instant/flash');
});

test('M139: wycena momentu jest wspólna dla czarów i zdolności (jedna funkcja)', () => {
  // L41 — dwie kopie tej samej logiki rozjeżdżają się cicho. Ścieżka czarów
  // NIE MIAŁA wyceny pozytywnej dla tapowania w ogóle.
  const source = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  assert.ok(/const tapTargetValue = /.test(source), 'brak wspólnej funkcji wyceny tapnięcia');
  assert.ok(/const tapTimingBonus = /.test(source), 'brak funkcji wyceniającej MOMENT tapnięcia');

  // Obie gałęzie scoringu muszą wołać tę samą funkcję: ścieżka czarów
  // (cast_spell) i ścieżka zdolności (activate_ability).
  const spellBranch = source.slice(source.indexOf("case 'cast_spell'"), source.indexOf("case 'activate_ability'"));
  const abilityBranch = source.slice(source.indexOf("case 'activate_ability'"));
  assert.ok(/tapTargetValue\(/.test(spellBranch),
    'ścieżka CZARÓW nie wycenia tapowania — to był realny brak, nie hipoteza (L41)');
  assert.ok(/tapTargetValue\(/.test(abilityBranch),
    'ścieżka ZDOLNOŚCI musi używać tej samej wyceny co czary');
});
