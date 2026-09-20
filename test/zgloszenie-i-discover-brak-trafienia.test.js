import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { describeGameEvent, isMainLogEvent } from '../src/table/session.js';

/**
 * Zgłoszenie I (właściciel, 2026-09-20): Geological Appraiser (ETB „discover 3”)
 * przejrzał CAŁĄ bibliotekę i nie trafił karty. Karty wróciły do biblioteki,
 * ale „Rozgrywka” i log milczały: brak informacji, że biblioteka się
 * wyczerpała, że nie było trafienia i że karty wróciły na spód w LOSOWEJ
 * kolejności (CR 701.53). Wpis kończył się na „trigger się rozstrzyga”.
 *
 * Trzy warstwy kontraktu pinowane tutaj:
 * 1. SILNIK: `discover_resolved` niesie fakty (found:false, ile kart wróciło,
 *    czy biblioteka się wyczerpała) — bez nich warstwa tekstu nie ma z czego
 *    zbudować zdania;
 * 2. TEKST: `describeGameEvent` opisuje brak trafienia (wcześniej `null`);
 * 3. BRAMKA: wpis dochodzi do logu/„Rozgrywki” (`isMainLogEvent`).
 */

const REGISTRY = createCardRegistry();

const NAZWY = Object.fromEntries(
  ['geological-appraiser', 'basic-swamp', 'basic-forest', 'basic-island', 'basic-mountain',
    'spreading-insurrection', 'unbreakable-bond'].map((id) => [id, REGISTRY.get(id)?.name ?? id]),
);

/** Stół: Appraiser na stosie (rzucony) + biblioteka wyłącznie z landów. */
function stolPoRzucie(library) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, zone, extra = {}) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
    });
  };
  // Mana na rzut ({2}{R}): Góry na polu bitwy.
  put('m1', 'basic-mountain', 'battlefield');
  put('m2', 'basic-mountain', 'battlefield');
  put('m3', 'basic-mountain', 'battlefield');
  put('m4', 'basic-mountain', 'battlefield');
  put('appr', 'geological-appraiser', 'hand');
  library.forEach((cardId, i) => put(`lib${i}`, cardId, 'library'));
  return state;
}

/** Rzuca Appraisera i rozstrzyga stos (ETB odpala discover). */
function rzucAppraisera(state) {
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'appr');
  assert.ok(cmd, 'brak oferty rzutu Geological Appraiser');
  const result = execute(state, cmd);
  assert.ok(result.ok, `rzut odrzucony: ${result.events?.[0]?.reason}`);
  return playerView(state, 'p1');
}

test('I: silnik mówi, ile kart wróciło na spód i czy biblioteka się wyczerpała', () => {
  const state = stolPoRzucie(['basic-swamp', 'basic-forest']);
  const view = rzucAppraisera(state);
  // Po rzucie trigger ETB jest na stosie; rozstrzygamy go komendą pass (jak
  // w partii) — biblioteka z samych landów = brak trafienia discover 3.
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority' || c.type === 'pass');
    if (!pass) break;
    assert.ok(execute(state, pass).ok, 'pass odrzucony');
  }
  const zdarzenie = state.events.filter((e) => e.type === 'discover_resolved').at(-1);
  assert.ok(zdarzenie, 'brak zdarzenia discover_resolved (discover nie rozstrzygnął się?)');
  assert.equal(zdarzenie.found, false, 'w bibliotece z samych landów nie ma trafienia');
  assert.equal(zdarzenie.bottomCount, 2, 'obie odsłonięte karty mają wrócić na spód');
  assert.deepEqual(zdarzenie.revealedCardIds, ['basic-swamp', 'basic-forest'], 'fakty o odsłoniętych kartach');
  assert.equal(zdarzenie.libraryExhausted, true, 'biblioteka się wyczerpała');
  assert.equal(view.zones.library.length, 2, 'biblioteka ma z powrotem obie karty');
});

test('I: brak trafienia ma pełny opis w logu (biblioteka wyczerpana, karty na spód w losowej kolejności)', () => {
  const opis = describeGameEvent({
    type: 'discover_resolved', playerId: 'p1', amount: 3, found: false,
    revealedCardIds: ['basic-swamp', 'basic-forest'], bottomCount: 2, libraryExhausted: true,
  }, { nameOf: (cardId) => NAZWY[cardId] ?? cardId, nameOfObject: () => '?' },
  { p1: 'Ty', p2: 'Nieprzyjaciel' }, { drugaOsoba: false });
  assert.equal(typeof opis, 'string', `brak wpisu w logu (null) — zgłoszenie I: ${opis}`);
  assert.match(opis, /bibliotek/i, `opis bez wzmianki o bibliotece: ${opis}`);
  assert.match(opis, /wyczerpa/i, `opis bez informacji, że biblioteka się wyczerpała: ${opis}`);
  assert.match(opis, /spód/i, `opis bez informacji, że karty wróciły na spód: ${opis}`);
  assert.match(opis, /losow/i, `opis bez informacji o LOSOWEJ kolejności: ${opis}`);
});

test('I: trafienie też mówi, co stało się z resztą kart', () => {
  const opis = describeGameEvent({
    type: 'discover_resolved', playerId: 'p1', amount: 3,
    foundCardId: 'basic-island', castFree: true, bottomCount: 3,
  }, { nameOf: (cardId) => NAZWY[cardId] ?? cardId, nameOfObject: () => '?' },
  { p1: 'Ty', p2: 'Nieprzyjaciel' }, { drugaOsoba: false });
  assert.match(opis, /Island/, `brak nazwy trafionej karty: ${opis}`);
  assert.match(opis, /\(3\)/, `brak liczby kart odłożonych na spód: ${opis}`);
  assert.match(opis, /losow/i, `brak informacji o losowej kolejności: ${opis}`);
});

test('I: wynik discover dochodzi do logu i „Rozgrywki" (bramka zdarzeń)', () => {
  const ctx = { botActing: false, phase: 'main1', stackSize: 0, humanId: 'p1' };
  for (const type of ['discover_started', 'discover_resolved']) {
    assert.equal(isMainLogEvent({ type, playerId: 'p1' }, ctx), true,
      `${type} nie dochodzi do logu gracza (zgłoszenie I: „wpis kończył się na trigger się rozstrzyga”)`);
  }
});
