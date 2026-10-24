// G — zgłoszenie właściciela z gry (2026-10-24, Trostani Discordant):
//
//   „Na wszystkich kreaturach mam poprawnie badge +1/+1 z wyjątkiem
//    kreatury z Disguise ([Riftburst] Hellion). Poprawnie dodaje mu +1/+1
//    do statystyk, ale brakuje badge'a. Po odwróceniu karty z Disguise
//    badge się pojawiło, ale na zakrytej nie było go."
//
// Trostani Discordant: „Other creatures you control get +1/+1." Silnik
// liczył dobrze (zakryty 2/2 pod anthemem to 3/3 — warstwa ciągła działa
// na zakrytym permanencie), ginął tylko BADGE. Dwa punkty zrzutu:
//   1) `cardInfo` (render.js) twardo zerował `grantedPower/Toughness` dla
//      każdego zakrytego permanentu — badge z efektu ciągłego (M188/A)
//      nigdy nie powstawał, choć widok właściciela kwoty niósł;
//   2) `playerView` (game-state.js) liczył nadane P/T tylko przy
//      `!hiddenFromViewer`, więc po stronie PRZECIWNIKA zakryty pod
//      anthemem też milczał — mimo że jego efektywne P/T (3/3) widok
//      i tak drukuje, a baza zakrycia to definicyjne 2/2 (kwota bonusu
//      nie ujawnia tożsamości spod rewersu).
// Fix: koniec zerowania w cardInfo + jawne nadane P/T dla zakrytego
// permanentu na polu bitwy w widoku (nazwy mechanik bonusu zostają za
// bramką tożsamości). Reguły gry bez zmian — to była czysta prezentacja.
//
//   G/1 — właściciel: zakryty Hellion pod Trostani ma badge „+1/+1"
//         (obok „Ward {2}" ze zgłoszenia F), tak jak zwykły stwór;
//   G/2 — przeciwnik: ten sam badge przy zachowanej mgle wojny
//         (bez cardId/nazwy zakrytego);
//   G/3 — kontrola niepustości: bez anthemu zakryty NIE ma badge'a +1/+1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { cardInfo, buildStateOverlay } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [] } }),
};

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };
const badgesOf = (info) => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge') && el.children.length === 0)
    .map((el) => el.textContent);
};

function putCard(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function scenario({ withAnthem = true } = {}) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  if (withAnthem) putCard(state, 'trostani', 'trostani-discordant', 'p1');
  putCard(state, 'vanilla', 'goblin-piker', 'p1');
  const h = putCard(state, 'hellion-fd', 'riftburst-hellion', 'p1');
  state.objects.set('hellion-fd', Object.freeze({
    ...h, faceDown: true, faceDownCause: 'disguise', ward: 2,
    keywords: Object.freeze(['ward']), power: 2, toughness: 2, cardName: null,
    summoningSickness: false,
  }));
  return state;
}

function entryOf(state, viewer, id) {
  return playerView(state, viewer).zones.battlefield.find((o) => o.id === id);
}

test('G/1: właściciel widzi badge „+1/+1" z Trostani na zakrytym Hellionie (i na zwykłym stworze)', () => {
  const state = scenario();
  const hellion = entryOf(state, 'p1', 'hellion-fd');
  // Statystyki były poprawne już przed zgłoszeniem (3/3) — bug dotyczył badge'a.
  assert.equal(hellion.power, 3);
  assert.equal(hellion.toughness, 3);
  assert.equal(hellion.grantedPower, 1);
  const hellionBadges = badgesOf(cardInfo(SESSION_MOCK, { ...hellion, isBattlefield: true }));
  assert.ok(hellionBadges.includes('+1/+1'), `badge +1/+1 na zakrytym: [${hellionBadges}]`);
  assert.ok(hellionBadges.includes('Ward {2}'), `badge Ward {2} obok (zgłoszenie F): [${hellionBadges}]`);
  const vanillaBadges = badgesOf(cardInfo(SESSION_MOCK, { ...entryOf(state, 'p1', 'vanilla'), isBattlefield: true }));
  assert.ok(vanillaBadges.includes('+1/+1'), `badge +1/+1 na zwykłym (kontrola): [${vanillaBadges}]`);
});

test('G/2: przeciwnik też widzi badge „+1/+1" na zakrytym — mgła wojny bez zmian', () => {
  const state = scenario();
  const hellion = entryOf(state, 'p2', 'hellion-fd');
  assert.equal(hellion.power, 3, 'efektywne P/T publiczne jak dotąd');
  assert.equal(hellion.grantedPower, 1, 'kwota bonusu jawna (baza zakrycia to definicyjne 2/2)');
  assert.ok(hellion.cardId == null, 'tożsamość zakrytego nadal ukryta');
  assert.ok(!hellion.cardName, 'nazwa zakrytego nadal ukryta');
  const badges = badgesOf(cardInfo(SESSION_MOCK, { ...hellion, isBattlefield: true }));
  assert.ok(badges.includes('+1/+1'), `badge +1/+1 u przeciwnika: [${badges}]`);
});

test('G/3: bez anthemu zakryty NIE dostaje badge’a +1/+1 (kontrola)', () => {
  const state = scenario({ withAnthem: false });
  const hellion = entryOf(state, 'p1', 'hellion-fd');
  assert.equal(hellion.power, 2);
  const badges = badgesOf(cardInfo(SESSION_MOCK, { ...hellion, isBattlefield: true }));
  assert.ok(!badges.includes('+1/+1'), `bez anthemu brak badge'a: [${badges}]`);
  assert.ok(badges.includes('Ward {2}'), `Ward zostaje: [${badges}]`);
});
