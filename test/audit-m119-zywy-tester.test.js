// M119 — audyt „z perspektywy gracza” Żywym Testerem (2026-08-17).
//
// Dwanaście partii na prawdziwym artefakcie (dist/mtg-table.html), osiem
// kombinacji talii, pięć profili gracza. Wszystkie przebiegi zakończyły się
// komunikatem „DETEKTORY: brak zgłoszeń” — każde znalezisko poniżej pochodzi
// z ręcznego czytania transkryptu w roli gracza. Dlatego razem z poprawkami
// powstały NOWE detektory (tools/table-tester/detectors.mjs), żeby te klasy
// błędów wykrywały się same w kolejnych audytach.
//
// Plan i pełna lista znalezisk: docs/plans/2026-08-17-m119-audyt-zywy-tester.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

const HELPERS = { nameOf: () => 'Karta', nameOfObject: () => 'Obiekt' };
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const describe = (event) => describeGameEvent(event, HELPERS, NAMES);

// =============================================================================
// Z1 — log nie odmieniał liczników.
// Transkrypt (green vs red, seed 42): „Leafcrown Dryad dostaje +2 licznik
// +1/+1 (razem 2)”. Po polsku: „+2 LICZNIKI”. `polishPlural` był w tym samym
// pliku (obrażenia, karty) — liczniki go nie używały.
// =============================================================================

test('M119/Z1: „dostaje +N licznik” odmienia się przez liczbę', () => {
  const added = (n) => describe({ type: 'counter_added', objectId: 'o', counter: '+1/+1', amount: n, total: n });
  assert.match(added(1), /dostaje \+1 licznik \+1\/\+1/);
  assert.match(added(2), /dostaje \+2 liczniki \+1\/\+1/, '2–4 → „liczniki”');
  assert.match(added(3), /dostaje \+3 liczniki/);
  assert.match(added(5), /dostaje \+5 liczników/, '5+ → „liczników”');
  assert.match(added(12), /dostaje \+12 liczników/, '12 to wyjątek (nie „liczniki”)');
  assert.match(added(22), /dostaje \+22 liczniki/, '22 wraca do formy 2–4');
});

test('M119/Z1: „traci N licznik” też się odmienia', () => {
  const removed = (n) => describe({ type: 'counter_removed', objectId: 'o', counter: 'stun', amount: n, total: 0 });
  assert.match(removed(1), /traci 1 licznik stun/);
  assert.match(removed(2), /traci 2 liczniki stun/);
  assert.match(removed(5), /traci 5 liczników stun/);
  // Anihilacja +1/+1 z −1/−1 ma własny opis i nie może się zepsuć.
  assert.match(
    describe({ type: 'counter_removed', objectId: 'o', counter: 'mixed', amount: 2, annihilated: true }),
    /anihilacja 2 par liczników/,
  );
});

// =============================================================================
// Z2 — odmiana „na piechotę” w dwóch innych opisach: „2 celów”, „5 karty”.
// =============================================================================

test('M119/Z2: proliferate mówi „2 cele”, nie „2 celów”', () => {
  const proliferated = (n) => describe({ type: 'proliferated', playerId: 'p1', count: n });
  assert.match(proliferated(1), /1 cel /);
  assert.match(proliferated(2), /2 cele /);
  assert.match(proliferated(5), /5 celów /);
});

test('M119/Z2: mulligan mówi „odłóż 5 kart”, nie „5 karty”', () => {
  const bottom = (n) => describe({ type: 'mulligan_bottom_required', playerId: 'p1', count: n });
  assert.match(bottom(1), /odłóż 1 kartę /);
  assert.match(bottom(2), /odłóż 2 karty /);
  assert.match(bottom(5), /odłóż 5 kart /);
});

// =============================================================================
// Z3 — mulligan londyński: 35 ofert, w tym 15 nieodróżnialnych „Mountain,
// Mountain”. Lekcja L19 (cap enumeracji) + M102/U3 (opcje muszą się różnić).
// =============================================================================

test('M119/Z3: warianty mulligana o tym samym składzie NIE dublują się', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    ['p1', Array(20).fill('basic-mountain')],
    ['p2', Array(20).fill('basic-forest')],
  ]);
  const state = setupCardMatch({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry, openingHandSize: 7 });
  const hand = state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1').slice(0, 7);
  state.pendingMulliganBottom = { playerId: 'p1', count: 3, handIds: hand, restorePriorityTo: 'p1' };
  state.status = 'active';
  state.turn.priorityPlayerId = 'p1';

  const options = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_mulligan_bottom_choice');
  // Siedem identycznych Gór: jest DOKŁADNIE JEDNA realna decyzja
  // („odłóż trzy Góry”), a nie 35 wariantów C(7,3).
  assert.equal(options.length, 1, `oczekiwano 1 realnej decyzji, było ${options.length}`);
  assert.equal(options[0].cardIds.length, 3);
});

test('M119/Z3: enumeracja mulligana ma cap (lekcja L19)', () => {
  // Ręka z samych RÓŻNYCH kart nie daje się zdeduplikować — wtedy broni cap.
  const registry = createCardRegistry();
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.status = 'active';
  const distinct = ['basic-plains', 'basic-island', 'basic-swamp', 'basic-mountain',
    'basic-forest', 'highland-game', 'goblin-piker'];
  const handIds = [];
  distinct.forEach((cardId, index) => {
    const id = `h${index}`;
    const card = registry.get(cardId);
    state.objects.set(id, Object.freeze({
      id, instanceId: `i${index}`, cardId, controllerId: 'p1', ownerId: 'p1',
      zone: 'hand', kind: card.types?.includes('Land') ? 'land' : 'creature',
      power: card.power ?? null, toughness: card.toughness ?? null,
      manaCost: card.manaCost ?? 0, abilities: [], keywords: [], subtypes: [],
      types: card.types ?? [], colors: [], counters: {},
    }));
    state.zones.hand.push(id);
    handIds.push(id);
  });
  state.pendingMulliganBottom = { playerId: 'p1', count: 3, handIds, restorePriorityTo: 'p1' };
  state.turn.priorityPlayerId = 'p1';

  const options = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_mulligan_bottom_choice');
  assert.ok(options.length <= 32, `cap 32 (L19), było ${options.length}`);
  assert.ok(options.length > 1, 'różne karty = realnie różne decyzje, muszą zostać');
});

// =============================================================================
// Z4 — koszt zdolności renderowany jako „T2” zamiast „{2}, {T}”.
// Transkrypt (wiedzmin vs tokens, seed 31):
//   „Aktywuj: Seer's Lantern (Ty) (koszt T2) — scry 1”
// Oracle: „{2}, {T}: Scry 1”. Obok stała druga zdolność „(koszt T)”, więc
// gracz nie widział, że ta droższa wymaga dwóch many.
// =============================================================================

test('M119/Z4: koszt zdolności ma kolejność Oracle — mana, potem {T}', () => {
  const registry = createCardRegistry();
  const lantern = registry.get('seers-lantern');
  const view = {
    zones: { hand: [], battlefield: [{ id: 'sl', cardId: 'seers-lantern', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' }], stack: [], graveyard: [], library: [], exile: [] },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  };
  const session = {
    nameOf: (id) => registry.get(id)?.name ?? String(id),
    nameOfObject: () => 'Seer\u2019s Lantern',
    cardDetails: () => null,
    abilitiesOf: () => lantern.abilities,
  };
  const plain = (html) => String(html).replace(/<[^>]+>/g, '');

  const scry = plain(commandLabel({ type: 'activate_ability', playerId: 'p1', objectId: 'sl', abilityIndex: 1 }, session, view));
  assert.match(scry, /koszt 2, T/, `koszt {2},{T} ma być czytelny, było: ${scry}`);
  assert.ok(!/koszt T2/.test(scry), 'sklejone „T2” czyta się jak jeden symbol');

  // Zdolność z samym tapnięciem zostaje bez zmian.
  const mana = plain(commandLabel({ type: 'activate_ability', playerId: 'p1', objectId: 'sl', abilityIndex: 0 }, session, view));
  assert.match(mana, /koszt T\b/);
});

// =============================================================================
// Z5 — bot filtrował manę bez powodu (Jeskai Devotee „{1}: Add {U},{R},{W}”):
// 16 aktywacji w partii, także w turach bez rzucania czarów. Bilans 1→1,
// a niewykorzystana mana znika w cleanup (CR 500.4).
// =============================================================================

test('M119/Z5: bot NIE filtruje many, gdy nie ma czego zagrać', () => {
  // Jeskai Devotee: „{1}: Add {U}, {R}, or {W}. Activate only once each turn.”
  // Bilans 1→1. Przy pustej ręce aktywacja nie przybliża bota do niczego,
  // a mana i tak zniknie w cleanup (CR 500.4).
  const registry = createCardRegistry();
  const state = createGameState({ seed: 700, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;

  const def = registry.get('jeskai-devotee');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'jd', instanceId: 'i-jd', cardId: 'jeskai-devotee', controllerId: 'p1',
    zone: 'battlefield', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set('jd', Object.freeze({ ...state.objects.get('jd'), summoningSickness: false }));
  addMana(state, 'p1', 3, { colors: ['R', 'R', 'R'] });

  const view = playerView(state, 'p1');
  const filterOffer = view.legalCommands.find((cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'jd');
  assert.ok(filterOffer, 'filtr many jest w ofercie (legalny ruch)');

  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.notEqual(chosen.type, 'activate_ability',
    `pusta ręka: filtrowanie many to strata tempa, bot wybrał ${JSON.stringify(chosen)}`);
});
