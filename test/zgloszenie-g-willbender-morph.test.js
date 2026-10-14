// Zgłoszenie G (2026-10-14): bot i Willbender — karta z morph.
// Właściciel: „Rzuca jako zwykłego potwora 1/2 jak tylko ma manę. (…) sugeruję,
// żeby bot: (a) rzucał go tylko w formie morph, chyba że to sam początek gry
// i ma tylko 2 lądy (…)”. Do tego dochodzi część (b) — patrz
// `test/zgloszenie-g-willbender-flip.test.js`.
//
// Reguły, na których opiera się polityka (deskryptorowo, ADR 0002 — bez nazw
// kart w kodzie; nazwa jest tylko w nazwie pliku i w komentarzu):
//  • rzut twarzą w dół to 2/2 bez tekstu i bez nazwy za {3} dowolnej many
//    (CR 702.37a), a permanent wchodzący zakryty ma te same cechy (CR 708.2a),
//  • obrót twarzą do góry ujawnia awers i odpala trigger „turned face up”
//    (CR 702.37e; trigger — CR 603.3d), więc rzucenie karty z payoffem obrotu
//    twarzą do GÓRY pali cały ambush.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: data.types ?? [],
    colors: data.colors ?? [], cardName: def.name, morph: data.morph ?? null,
  });
  return state.objects.get(id);
}

/** Scena: talia bota (p1) z Willbenderem w ręce i `lądyRazem` lądami, z czego
 *  `lądyNiezatapowane` jest odkręconych (mana dostępna). */
function scena({ lądyNiezatapowane, lądyRazem, tura = 8, dodatkowaKarta = null }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = tura;
  for (let i = 0; i < lądyRazem; i += 1) {
    const land = put(state, `isl${i}`, 'basic-island', 'p1', 'battlefield');
    if (i >= lądyNiezatapowane) {
      state.objects.set(land.id, Object.freeze({ ...state.objects.get(land.id), tapped: true }));
    }
  }
  put(state, 'wb', dodatkowaKarta ?? 'willbender', 'p1', 'hand');
  return state;
}

const wyborBota = (state) => {
  const view = playerView(state, 'p1');
  // Oferty czytamy PRZED wyborem — `chooseCommand` modyfikuje `legalCommands`
  // (m.in. odsiewa komendy), więc filtr po wyborze widziałby pustą listę.
  const ofertyKarty = view.legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'wb');
  const wybor = createHeuristicBot({ seed: 7 }).chooseCommand(view);
  return { view, wybor, ofertyKarty };
};

test('Zgłoszenie G/(a): gdy morph jest oferowany, bot rzuca Willbendera TWARZĄ W DÓŁ', () => {
  const state = scena({ lądyNiezatapowane: 3, lądyRazem: 3 });
  const { wybor, ofertyKarty } = wyborBota(state);
  assert.deepEqual(ofertyKarty.map((c) => (c.faceDown ? 'morph' : 'twarz')).sort(), ['morph', 'twarz'],
    'silnik oferuje oba warianty (3 many pokrywają koszt morpha {3} i rzut {1}{U})');
  assert.equal(wybor.type, 'cast_permanent', `bot rzuca kartę, a nie coś innego: ${wybor.type}`);
  assert.equal(wybor.objectId, 'wb', 'rzuca Willbendera');
  assert.equal(wybor.faceDown, true,
    'wybrany wariant to rzut twarzą w dół — zakryty 2/2 za {3}, nie 1/2 za {1}{U}');
});

test('Zgłoszenie G/(a): wczesna gra z DWOMA lądami — bot może zagrać Willbendera jako 1/2', () => {
  // Wyjątek właściciela: „chyba że to sam początek gry i ma tylko 2 lądy,
  // wtedy ewentualnie może go użyć jako wczesnego stwora do chipania”.
  const state = scena({ lądyNiezatapowane: 2, lądyRazem: 2, tura: 3 });
  const { wybor, ofertyKarty } = wyborBota(state);
  assert.deepEqual(ofertyKarty.map((c) => (c.faceDown ? 'morph' : 'twarz')), ['twarz'],
    'przy 2 manach morph ({3}) nie jest oferowany');
  assert.equal(wybor.objectId, 'wb', `bot gra kartę: ${wybor.type}`);
  // Komenda twarzą do góry nie niesie `faceDown: false` — pole jest nieobecne.
  assert.ok(!wybor.faceDown, 'rzut twarzą do góry (1/2 do chipowania)');
});

test('Zgłoszenie G/(a): poza wczesną grą bot CZEKA z rzutem, gdy morphu nie stać', () => {
  // 5 lądów, ale tylko 2 odkręcone (morph za {3} nieosiągalny). Rzut twarzą do
  // góry zmarnowałby ambush, więc bot trzyma kartę (pass) zamiast wystawiać 1/2.
  const state = scena({ lądyNiezatapowane: 2, lądyRazem: 5 });
  const { wybor, ofertyKarty } = wyborBota(state);
  assert.deepEqual(ofertyKarty.map((c) => (c.faceDown ? 'morph' : 'twarz')), ['twarz'],
    'morph nieosiągalny — jedyna oferta to rzut twarzą do góry');
  assert.notEqual(wybor.objectId, 'wb',
    `bot NIE wystawia Willbendera jako 1/2 poza wczesną grą (wybrał: ${wybor.type})`);
});

test('Zgłoszenie G/(a) anty-over-fix: zwykły stwór bez morpha gra się normalnie', () => {
  // Karta BEZ deskryptora morpha nie może dostać kary „trzymaj na morph”.
  // `maritime-guard` = 2/3 za {1}{U} — mieści się w dwóch Wyspach.
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 8;
  for (let i = 0; i < 5; i += 1) {
    const land = put(state, `isl${i}`, 'basic-island', 'p1', 'battlefield');
    if (i >= 2) state.objects.set(land.id, Object.freeze({ ...state.objects.get(land.id), tapped: true }));
  }
  put(state, 'mg', 'maritime-guard', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const wybor = createHeuristicBot({ seed: 7 }).chooseCommand(view);
  assert.equal(wybor.objectId, 'mg', `zwykły stwór za 2 many wychodzi: ${wybor.type}`);
  assert.equal(wybor.faceDown, undefined, 'karta bez morpha nie ma wariantu twarzą w dół');
});
