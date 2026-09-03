// Audyt PR #93 — znalezisko I: plot i klauzula „on a later turn" (CR 702.170d).
//
// CR 702.170d: „A plotted card's owner may cast it from exile without paying
// its mana cost during their main phase while the stack is empty **during any
// turn after the turn in which it became plotted**." (przypomnienie na karcie:
// „Cast it as a sorcery **on a later turn** without paying its mana cost").
//
// Stan przed fixem: klauzulę „późniejsza tura" znała WYŁĄCZNIE ścieżka
// permanentów (`castPermanent` w resources.js — Spinewoods Paladin, Batch 24);
// ścieżka czarów (`plottedCastAllowed` w spells.js) pilnowała tylko „własna
// faza main, pusty stos" z CR 702.170d, więc zaplotowany CZAR wracał z exile
// na stos w TEJ SAMEJ turze. Luka była ŻYWA w talii `worek-dziki`:
// Tumbleweed Rising (sorcery z plotem) — zaplonuj i rzucaj od razu, podczas
// gdy stwór z tej samej talii (Spinewoods Paladin) czekał grzecznie do
// następnej tury. Dwie ścieżki, dwie różne odpowiedzi na to samo pytanie.
//
// Fix: jeden predykat `plottedTurnReached` w impulse-window.js (module, który
// już jest jedynym miejscem prawdy o stemplach grywalności z exile) czyta
// `plottedAtTurn` dla obu ścieżek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { plottedTurnReached } from '../src/engine/impulse-window.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

/** Własna faza main, pusty stos, numer tury do ustawienia. */
function atMain(turnNumber = 3) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

/** Zaplotowany CZAR w exile, zaplonowany w `plottedAtTurn`. */
function plottedSpell(state, { id = 'plot1', plottedAtTurn, timing = 'sorcery' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'synthetic-plotted-spell', controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', kind: 'spell', manaCost: 4, types: ['Sorcery'], subtypes: [], colors: [],
    plotted: true, plottedAtTurn,
    spell: { timing, targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    abilities: [],
  });
  return state.objects.get(id);
}

/** Zaplotowany PERMANENT w exile (ścieżka cast_permanent — od Batcha 24). */
function plottedPermanent(state, { id = 'plot2', plottedAtTurn } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'synthetic-plotted-creature', controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', kind: 'creature', power: 3, toughness: 3, manaCost: 4,
    types: ['Creature'], subtypes: [], colors: [],
    plotted: true, plottedAtTurn, abilities: [], keywords: [],
  });
  return state.objects.get(id);
}

function offersOf(state, type, objectId) {
  return playerView(state, 'p1').legalCommands.filter((c) => c.type === type && c.objectId === objectId);
}

test('I (CR 702.170d): zaplotowany CZAR nie jest oferowany w turze zaplonowania', () => {
  const state = atMain(5);
  plottedSpell(state, { plottedAtTurn: 5 }); // zaplonowany w TEJ turze
  assert.deepEqual(offersOf(state, 'cast_spell', 'plot1'), [],
    '„on a later turn": zaplotowany czar czeka do następnej tury — tak jak permanent');
});

test('I (CR 702.170d): walidacja odrzuca rzut zaplotowanego czaru w tej samej turze', () => {
  const state = atMain(5);
  plottedSpell(state, { plottedAtTurn: 5 });
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'plot1', targets: [] });
  assert.equal(res.ok, false, 'execute nie może przyjąć rzutu, którego oferta nie pokazuje (L48)');
});

test('I (anty-over-fix): w turze po zaplonowaniu czar wraca do oferty i idzie na stos bez many', () => {
  const state = atMain(6);
  plottedSpell(state, { plottedAtTurn: 5 });
  const offers = offersOf(state, 'cast_spell', 'plot1');
  assert.equal(offers.length, 1, 'oferta wraca w późniejszej turze');
  const res = execute(state, offers[0]);
  assert.ok(res.ok, 'rzut akceptowany: ' + JSON.stringify(res.events?.[0]?.reason ?? ''));
  assert.equal(state.players[0].mana, 0, 'zaplotowany czar nie kosztuje many (CR 702.170d)');
});

test('I: zaplotowany PERMANENT trzyma tę samą granicę po przepięciu na wspólny predykat', () => {
  const same = atMain(5);
  plottedPermanent(same, { plottedAtTurn: 5 });
  assert.deepEqual(offersOf(same, 'cast_permanent', 'plot2'), [], 'ta sama tura → brak oferty');
  const forced = execute(same, { type: 'cast_permanent', playerId: 'p1', objectId: 'plot2' });
  assert.equal(forced.ok, false, 'walidacja odrzuca (regresja ścieżki z Batcha 24)');

  const later = atMain(6);
  plottedPermanent(later, { plottedAtTurn: 5 });
  const offers = offersOf(later, 'cast_permanent', 'plot2');
  assert.equal(offers.length, 1, 'późniejsza tura → oferta wraca');
  assert.ok(execute(later, offers[0]).ok, 'i wykonuje się');
});

test('I (integracja, talia worek-dziki): plot_card → cisza w tej turze, oferta w następnej', () => {
  const state = atMain(5);
  const def = REGISTRY.get('tumbleweed-rising');
  addMana(state, 'p1', 6, { colors: ['R', 'G'] });
  addObject(state, {
    id: 'tw', instanceId: 'i-tw', cardId: 'tumbleweed-rising', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], colors: ['R'],
  });
  const plotted = execute(state, { type: 'plot_card', playerId: 'p1', objectId: 'tw' });
  assert.ok(plotted.ok, 'plot wykonany: ' + JSON.stringify(plotted.events?.[0]?.reason ?? ''));
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'tumbleweed-rising' && o.zone === 'exile');
  assert.ok(exiled?.plotted, 'karta leży w exile jako zaplotowana');
  assert.equal(exiled.plottedAtTurn, 5, 'stempel tury zaplonowania');
  assert.deepEqual(offersOf(state, 'cast_spell', exiled.id), [],
    'Tumbleweed Rising nie wraca na stos w tej samej turze (CR 702.170d)');

  const next = atMain(5); // ta sama karta, ale tura dalej — symulacja „następnej tury"
  plottedSpell(next, { id: 'tw2', plottedAtTurn: 5 });
  next.turn.number = 6;
  assert.equal(offersOf(next, 'cast_spell', 'tw2').length, 1, 'w następnej turze oferta jest');
});

test('I (anty-over-fix): bramka „późniejszej tury" dotyczy wyłącznie kart zaplotowanych', () => {
  const state = atMain(5);
  // 1. zwykły czar z ręki — bez stempla plot
  addObject(state, {
    id: 'hand1', instanceId: 'i-hand1', cardId: 'synthetic-hand-spell', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: 0, types: ['Sorcery'], subtypes: [], colors: [],
    spell: { timing: 'sorcery', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] }, abilities: [],
  });
  assert.equal(plottedTurnReached(state.objects.get('hand1'), state), true, 'ręka — poza bramką');
  // 2. karta wygnana IMPULSEM (playableUntilTurn) — inny stempel, inna reguła
  addObject(state, {
    id: 'imp1', instanceId: 'i-imp1', cardId: 'synthetic-impulse', controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', kind: 'spell', manaCost: 1, types: ['Instant'], subtypes: [], colors: [],
    playableUntilTurn: 6, abilities: [],
    spell: { timing: 'instant', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
  });
  assert.equal(plottedTurnReached(state.objects.get('imp1'), state), true, 'impuls — poza bramką');
  // 3. zaplotowana karta BEZ stempla tury (stare zapisy, obiekty z testów) — nie blokujemy
  plottedSpell(state, { id: 'nostamp', plottedAtTurn: undefined });
  const nostamp = state.objects.get('nostamp');
  assert.equal(nostamp.plottedAtTurn, null, 'addObject normalizuje brak stempla do null');
  assert.equal(plottedTurnReached(nostamp, state), true, 'brak stempla → zachowanie sprzed fixa');
});
