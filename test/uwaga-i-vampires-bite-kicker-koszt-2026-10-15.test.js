// Zgłoszenie I testera (2026-10-15, Vampire's Bite): w panelu „Twoje działania”
// grupa rzutu z kickerem pokazywała „Cel czaru: Vampire's Bite (kicker) (koszt B)”.
// Koszt rzutu z kickerem to baza + kicker (CR 702.33a, Oracle: {B} + kicker {2}{B}
// = 2BB). Etykiety pojedynczych opcji były poprawne; błąd był w tytule grupy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { choiceGroupTitle, commandLabel } from '../src/table/render.js';

const REG = createCardRegistry();
const plain = (s) => String(s).replace(/<[^>]+>/g, '');

function vampiresBiteOffers() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.phase = 'precombat_main';
  const put = (id, cardId, controllerId, zone) => {
    const def = REG.get(cardId); const data = gameObjectDataOf(def);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...data, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], spell: def.spell });
  };
  put('vb', 'vampires-bite', 'p1', 'hand');
  put('rager', 'phyrexian-rager', 'p2', 'battlefield');
  for (const i of [1, 2, 3, 4]) put(`sw${i}`, 'basic-swamp', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  const session = { nameOf: (id) => REG.get(id)?.name ?? id, nameOfObject: (id) => id, cardDetails: () => null, state, abilitiesOf: () => [] };
  const offers = view.legalCommands.filter((c) => c.objectId === 'vb');
  return { view, session, offers };
}

test('I: tytuł grupy rzutu Z kickerem niesie koszt łączny (baza + kicker)', () => {
  const { view, session, offers } = vampiresBiteOffers();
  const kicked = offers.filter((c) => c.kicked);
  assert.equal(kicked.length, 1, 'jedna oferta z kickerem (Rager jako cel)');
  const title = plain(choiceGroupTitle({ options: kicked }, session, view));
  assert.match(title, /\(kicker\)/, `tytuł nazywa wariant kicker (${title})`);
  assert.match(title, /koszt B \+ kicker 2B/, `koszt łączny, nie sam wydruk (${title})`);
});

test('I: tytuł grupy BEZ kickera zostaje przy kosztem wydruku', () => {
  const { view, session, offers } = vampiresBiteOffers();
  const plainOffers = offers.filter((c) => !c.kicked);
  const title = plain(choiceGroupTitle({ options: plainOffers }, session, view));
  assert.match(title, /\(koszt B\)/, title);
  assert.doesNotMatch(title, /kicker/, title);
});

test('I: etykieta pojedynczej opcji z kickerem jest poprawna (strażnik, nie zmieniać)', () => {
  const { session, view, offers } = vampiresBiteOffers();
  const kicked = offers.find((c) => c.kicked);
  assert.match(plain(commandLabel(kicked, session, view)), /koszt B \+ kicker 2B/);
});
