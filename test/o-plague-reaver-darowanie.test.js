// O (zgłoszenie właściciela 2026-10-30, Plague Reaver): „bot rzuca ją, po czym
// natychmiast mi ją przekazuje jej zdolnością, tracąc dodatkowo dwie karty
// z ręki… Rzucenie tej karty ma sens tylko wtedy, gdy bot nie ma na stole
// innych kreatur i planuje atakować nią przeciwnika… Ja bym w ogóle zakazał
// botowi przekazywania tej kreatury, chyba że przeciwnik ma naprawdę mega
// armię, powiedzmy >12 poweru kreatur w sumie.”
//
// Trzy ROOT CAUSES (wszystkie generyczne — deskryptor, nie nazwa karty,
// ADR 0002; L41: bliźniacze wymiary w jednym miejscu):
//
// 1. Trigger „sacrifice each other creature you control” wyceniany jak
//    SYMETRYCZNY wrath („edge = enemy − mine” × 10). Wróg nie traci NICZEGO
//    (silnik: effects.js `otherCreaturesYouControl`), a bot dostawał premię
//    za wielkość wrogiej planszy — stąd rzut 74,71 IDENTYCZNY przy 0 i przy
//    2 własnych stworach. Teraz: −Σ cena własnych ciał + twarda kara
//    `selfSacrificeWrathOwnBoardPenalty`, gdy własna plansza nie jest pusta.
//
// 2. Koszt `discardCards: N` nie był wyceniany w ogóle (`abilityDiscardLoss`
//    znała tylko `discardCard`). Aktywacja „odrzuć DWIE karty, poświęć to
//    stworzenie” płaciła wyłącznie ciałem. Pomiar (main1, 2 karty w ręce):
//    −218 przed poprawką (2 lądy) → −254 po (2 × 18 straty).
//
// 3. Darowanie własnego stworu przeciwnikowi nie miało wyceny KIERUNKU.
//    Teraz: poniżej progu `giftedSelfSacrificeMinEnemyPower` (12 pkt mocy —
//    wartość wskazana przez właściciela) dar jest karany jak strata ciała,
//    powyżej progu wartość = Σ ciał wrogich stworów, które padną w JEGO
//    end stepie (`giftedSelfSacrificeEnemyLossWeight`).

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

function put(state, { id, cardId, controllerId, zone, power = null, toughness = null, manaCost = null }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell, abilities: card.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: false,
    power: power ?? (card.power ?? null),
    toughness: toughness ?? (card.toughness ?? null),
    manaCost: manaCost ?? (card.manaCost ?? 0),
  }));
}

function creature(state, id, controllerId, power, toughness) {
  put(state, { id, cardId: 'highland-game', controllerId, zone: 'battlefield', power, toughness, manaCost: power });
}

/** Tura bota (p2), priorytet bota, 10 many. */
function scena({ reaverNaStole = false, reka = [] } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10, { colors: ['B'] });
  put(state, {
    id: 'reaver', cardId: 'plague-reaver', controllerId: 'p2',
    zone: reaverNaStole ? 'battlefield' : 'hand',
  });
  reka.forEach((cardId, i) => put(state, { id: `h${i}`, cardId, controllerId: 'p2', zone: 'hand' }));
  return state;
}

function ocena(state) {
  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  const score = (re) => options.find((o) => re.test(o.cmd))?.score;
  return {
    choice,
    scoreReaver: score(/cast_permanent\(reaver/),
    scoreActivate: score(/activate_ability\(reaver/),
    scorePass: score(/pass_priority/),
  };
}

// ---- 1. rzut: tylko na pustą własną planszę -------------------------------

test('O/1: pusty własny stół → bot rzuca Plague Reavera', () => {
  const { choice } = ocena(scena());
  assert.equal(choice.type, 'cast_permanent', `rzut na pustą planszę: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'reaver');
});

test('O/2: dwie WŁASNE kreatury → bot NIE rzuca (end-step wrath zjadłby planszę)', () => {
  const state = scena();
  creature(state, 'm1', 'p2', 2, 2);
  creature(state, 'm2', 'p2', 2, 2);
  const { choice, scoreReaver, scorePass } = ocena(state);

  assert.equal(choice.type, 'pass_priority',
    `rzut przy własnej planszy ma przegrać z passem: ${JSON.stringify(choice)}`);
  assert.ok(scoreReaver < scorePass, `score ${scoreReaver} < pass ${scorePass}`);
});

test('O/3: wroga armia NIE jest premią przy rzucie (wróg nic nie poświęca)', () => {
  const pusty = ocena(scena());
  const state = scena();
  for (let i = 0; i < 3; i += 1) creature(state, `f${i}`, 'p1', 4, 4);
  const zWrogiem = ocena(state);

  // Zmierzone: 74,71 bez wroga i 78,31 przy trzech 4/4 — różnica 3,6 to
  // zwykła premia za blokowanie atakujących (0,9 × 4), NIE dawna premia
  // „wrath” (przed poprawką ten sam stół dawał 91,81 = +17,1).
  assert.ok(zWrogiem.scoreReaver - pusty.scoreReaver <= 5,
    `wroga armia nie może windować rzutu: ${pusty.scoreReaver} → ${zWrogiem.scoreReaver}`);
  assert.ok(zWrogiem.scoreReaver < 91.81, `stara premia wrath zniknęła: ${zWrogiem.scoreReaver}`);
});

// ---- 2. darowanie: próg „mega armii” --------------------------------------

test('O/4: wróg bez mega armii → bot NIE oddaje Reavera (poniżej progu 12 mocy)', () => {
  const state = scena({ reaverNaStole: true, reka: ['highland-game', 'highland-game'] });
  creature(state, 'f1', 'p1', 2, 2);
  creature(state, 'f2', 'p1', 3, 3); // 5 mocy < 12
  const { choice, scoreActivate, scorePass } = ocena(state);

  assert.equal(choice.type, 'pass_priority', `dar poniżej progu: ${JSON.stringify(choice)}`);
  assert.ok(scoreActivate < scorePass, `aktywacja ${scoreActivate} < pass ${scorePass}`);
});

test('O/5: wróg z mega armią (16 mocy) → bot oddaje Reavera', () => {
  const state = scena({ reaverNaStole: true, reka: ['highland-game', 'highland-game'] });
  for (let i = 0; i < 4; i += 1) creature(state, `f${i}`, 'p1', 4, 4);
  const { choice, scoreActivate } = ocena(state);

  assert.equal(choice.type, 'activate_ability',
    `powyżej progu dar ma sens (wróg poświęci własną planszę): ${JSON.stringify(choice)}`);
  assert.ok(scoreActivate > 0, `aktywacja dodatnia: ${scoreActivate}`);
});

// ---- 3. koszt `discardCards: N` ------------------------------------------

test('O/6: koszt „odrzuć 2 karty” jest wyceniany (ręka pełna wartości = większa strata)', () => {
  const smieci = scena({ reaverNaStole: true, reka: ['highland-game', 'highland-game'] });
  const wartosciowa = scena({ reaverNaStole: true, reka: ['basic-swamp', 'basic-swamp'] });
  const a = ocena(smieci).scoreActivate;
  const b = ocena(wartosciowa).scoreActivate;
  // Piny zmierzone: przed poprawką OBA warianty = −218 (koszt ręki = 0 pkt).
  assert.equal(a, -218, `ręka ze śmieci: ${a}`);
  assert.equal(b, -254, `ręka z potrzebnych lądów: ${b}`);
  assert.ok(b < a, 'odrzucenie dwóch potrzebnych kart musi boleć bardziej niż śmieci');
});

test('O/7: progi O są pokrętłami parametrów (próg mocy wroga = 12)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.giftedSelfSacrificeMinEnemyPower, 12);
  assert.ok(DEFAULT_HEURISTIC_PARAMS.selfSacrificeWrathOwnBoardPenalty > 0);
  assert.ok(DEFAULT_HEURISTIC_PARAMS.giftedSelfSacrificeEnemyLossWeight > 0);
});
