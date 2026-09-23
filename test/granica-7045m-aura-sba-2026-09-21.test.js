// Granica SBA aury — CR 704.5m w TRZECH przypadkach (łowów E3 poza ścieżkami
// PR #132, sonda `scratch/probe-7045m.mjs`, 2026-09-21). Cytat (ADR 0030,
// CR 704.5m): „If an Aura is attached to an illegal object or player, or is
// not attached to an object or player, that Aura is put into its owner's
// graveyard."
//
// Piny mierzą KOMPLET reguły, nie implementację:
//   H/1 — host odszedł z pola bitwy → aura do grobu (zachowanie historyczne);
//   H/2 — host ŻYWY, ale nielegalny („enchant creature” na non-creature) →
//         aura do grobu — legalność to predykat CHWILI (L48), SBA musi ją
//         przeliczać, nie pamiętać z momentu attachu;
//   H/3 — aura na polu bitwy NIE przypięta do niczego (trzeci przypadek
//         reguły — „or is not attached to an object or player”) → aura do
//         grobu. Pomiar sondą: pętla `removeIllegalAttachments` przeskakiwała
//         `attachedTo == null`, więc kształt zostawał na stole w nieskończoność;
//   H/4 — anty-over-fix: aura na GRACZA (reprezentacja `attachAuraToPlayer`:
//         `attachedTo: null` + `enchantedPlayerId`) jest PRZYPINIA do gracza —
//         nie wolno jej potraktować jako „bez hosta”.
//
// Setup idzie REALNYM `attachAuraToCreature` (L21 — `addObject` zrzuca
// `attachedTo` jako pole spoza kontraktu), a chirurgia stanu dotyka wyłącznie
// badanego kształtu (H/2: charakterystyki hosta; H/3: zerwanie `attachedTo`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { destroyPermanents } from '../src/engine/destruction.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 704, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.number = 5;
  state.pendingMulligans = [];
  return state;
}

function put(state, id, cardId, zone = 'battlefield') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name,
  });
  return state.objects.get(id);
}

/** Aura po PRZENIESIENIU dostaje nowe id (`grave-N`) — szukamy po cardId. */
const strefaAury = (state, cardId) => {
  const zones = [...state.objects.values()].filter((o) => o.cardId === cardId).map((o) => o.zone);
  return zones.join(',') || 'BRAK';
};

test('H/1: host odszedł z pola bitwy → aura do grobu (CR 704.5m, przypadek 1)', () => {
  const s = game();
  put(s, 'host', 'lightwalker');
  put(s, 'aure', 'containment-membrane');
  attachAuraToCreature(s, 'aure', 'host');
  destroyPermanents(s, ['host'], {});
  runStateBasedActions(s);
  assert.equal(strefaAury(s, 'containment-membrane'), 'graveyard', 'aura za martwym hostem idzie do grobu');
});

test('H/2: host ŻYWY nielegalny (utracony typ stwora) → aura do grobu (CR 704.5m, przypadek 2)', () => {
  const s = game();
  put(s, 'host', 'lightwalker');
  put(s, 'aure', 'containment-membrane');
  attachAuraToCreature(s, 'aure', 'host');
  // Host przestaje być stworem NA ŻYWO (np. koniec animacji — predykat
  // chwili `isLegalAuraHost` czyta `kind`, tu: chirurgia charakterystyk).
  s.objects.set('host', Object.freeze({ ...s.objects.get('host'), kind: 'land', types: ['Land'], subtypes: [] }));
  runStateBasedActions(s);
  assert.equal(strefaAury(s, 'containment-membrane'), 'graveyard',
    'aura na żywym nielegalnym hostzie jest zrzucana przez SBA — legalność to chwila, nie moment attachu');
});

test('H/3: aura NIE przypięta do niczego → do grobu (CR 704.5m, przypadek 3)', () => {
  const s = game();
  put(s, 'host', 'lightwalker');
  put(s, 'aure', 'containment-membrane');
  attachAuraToCreature(s, 'aure', 'host');
  // Kształt „przypięta do niczego” — trzeci przypadek reguły, wprost
  // nazwany w CR 704.5m („or is not attached to an object or player”).
  s.objects.set('aure', Object.freeze({ ...s.objects.get('aure'), attachedTo: null }));
  runStateBasedActions(s);
  assert.equal(strefaAury(s, 'containment-membrane'), 'graveyard',
    'czysta aura bez zaczarowanego obiektu nie może leżeć na polu bitwy');
});

test('H/4 (anty-over-fix): aura na GRACZA (attachedTo null + enchantedPlayerId) ZOSTAJE', () => {
  const s = game();
  put(s, 'aure', 'clawing-torment');
  // Reprezentacja `attachAuraToPlayer` (T1 audytu PR #132): attach do GRACZA
  // = `attachedTo: null` + `enchantedPlayerId` — to NIE jest „bez hosta”.
  s.objects.set('aure', Object.freeze({
    ...s.objects.get('aure'), attachedTo: null, enchantPlayer: true, enchantedPlayerId: 'p2',
  }));
  runStateBasedActions(s);
  assert.equal(strefaAury(s, 'clawing-torment'), 'battlefield',
    'klątwa na graczu jest przypięta do gracza — trzeci przypadek jej nie obejmuje');
});
