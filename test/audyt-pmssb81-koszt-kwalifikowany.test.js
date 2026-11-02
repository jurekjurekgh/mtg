// PMSSB-81 (batch 71) — koszt „odrzuć kartę o KWALIFIKATORZE” (Vampire Hounds,
// EXO: „Discard a creature card: This creature gets +2/+2 until end of turn.”
// Bez kosztu many i bez ograniczenia raz na turę. Pełna pętla: sonda PRZED → audyt
// kosztu i L41 → pokrętła + piny RED→GREEN.
//
// SONDA PRZED (blok 3/3, tura przeciwnika, `declare_blockers`):
//  • +2/+2 zmienia wynik walki (2/2 zabija 3/3 i przeżywa) → aktywacja +9;
//  • +2/+2 nic nie zmienia (blok 6/6) → aktywacja −19 (kara za spalenie karty);
//  • brak walki → −21.
// Koszt jest realny (karta ze ręki), więc aktywacja NIGDY nie jest „darmowym
// pompowaniem” — piny trzymają ten inwariant.
//
// DRUGI BŁĄD ZNALEZIONY W PĘTLI: picker odrzucenia (ten sam, którego używa
// koszt kwalifikowany) remisował dla kart NIEGRYWALNYCH — gałąź „bez koloru”
// miała clamp `min(10, wartość)`. Pomiar PRZED: 3/2 za 2 many (wartość 10)
// i 5/3 za 4 many (wartość 19) dostawały po 20 pkt → remis, wygrywała
// „pierwsza oferta z listy” (klasa L50 — dokładnie ten wzorzec, który
// właściciel zgłaszał przy M408: „odrzuca rewelacyjne kreatury”).
// Po (suwaki `discardUncastableClamp`/`discardUncastableScale`):
// 22,5 vs 20,25 preferencji → ginie tańszy/gorszy stwór.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView, execute,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REG = createCardRegistry();
const landDef = (id) => VIRTUAL_BASIC_LANDS.find((c) => c.id === id);

function land(state, id, landId = 'basic-swamp', controllerId = 'p1') {
  const def = landDef(landId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
}

function real(state, id, cardId, { zone = 'battlefield', controllerId = 'p1' } = {}) {
  const def = REG.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false }));
}

function creature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
    cardName: id,
  });
}

function scene({ lands = ['basic-swamp'], step = 'main', active = 'p1' } = {}) {
  const state = createGameState({ seed: 81, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  lands.forEach((landId, i) => land(state, `land${i}`, landId));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 25; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  return state;
}

function scores(state) {
  const bot = createHeuristicBot({ seed: 82, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  return new Map(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
}

/** Tura przeciwnika, mój stwór blokuje jego atakującego. */
function blockScene(enemyPower, enemyToughness) {
  const state = scene({ step: 'declare_blockers', active: 'p2' });
  real(state, 'hounds', 'vampire-hounds');
  real(state, 'fodder', 'vampire-hounds', { zone: 'hand' });
  creature(state, 'attacker', 'p2', enemyPower, enemyToughness);
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['attacker'], blockers: new Map([['attacker', ['hounds']]]),
  };
  addMana(state, 'p1', 4, { colors: ['B'] });
  return state;
}

// =========================================================================
// 1. Koszt kwalifikowany: silnik oferuje TYLKO stwory
// =========================================================================

test('PMSSB-81/1: koszt „odrzuć kartę stwora” nie proponuje czarów ani landów', () => {
  const state = scene();
  real(state, 'hounds', 'vampire-hounds');
  real(state, 'fodderA', 'vampire-hounds', { zone: 'hand' });
  real(state, 'fodderB', 'garruks-companion', { zone: 'hand' });
  real(state, 'spell', 'anticipate', { zone: 'hand' });
  land(state, 'handLand');
  addMana(state, 'p1', 4, { colors: ['B', 'G'] });
  const activation = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.ok(activation, 'oferta aktywacji');
  execute(state, activation);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_discard_choice');
  // Dwie karty kwalifikują się (stwory), więc decyzja JEST wyborem (przy jednej
  // karcie silnik odrzuca ją automatycznie i wyboru nie ma).
  assert.deepEqual(offers.map((c) => c.cardId).sort(), ['fodderA', 'fodderB'],
    'kwalifikator „creature card” przepuszcza wyłącznie stwory');
});

// =========================================================================
// 2. Wycena aktywacji: tylko gdy pump ZMIENIA wynik walki
// =========================================================================

test('PMSSB-81/2: pump, który ODWRACA walkę, bije pump jałowy o pełną wartość wymiany', () => {
  // Ta sama ręka (grywalny stwór za 2 many) i ten sam bloker w obu scenach —
  // różni się WYŁĄCZNIE wynik walki, więc różnica ocen to czysty uzysk
  // z odwrócenia wymiany (pomiar: 0 vs −28).
  const flip = scores(blockScene(3, 3)).get('activate_ability(hounds#0)'); // 4/4 zabija 3/3 i przeżywa
  const dud = scores(blockScene(6, 6)).get('activate_ability(hounds#0)');  // 4/4 dalej ginie
  assert.ok(flip >= 0, `odwrócenie walki nie może być karane (${flip})`);
  assert.ok(flip - dud >= 20, `uzysk z odwrócenia wymiany (${flip} vs ${dud})`);
});

test('PMSSB-81/3: pump, który nic nie zmienia, jest ujemny (karta nie ginie za darmo)', () => {
  const state = blockScene(6, 6);
  const activation = scores(state).get('activate_ability(hounds#0)');
  assert.ok(activation < 0, `spalenie karty bez zmiany wyniku (${activation})`);
});

test('PMSSB-81/4: bez walki aktywacja też jest ujemna', () => {
  const state = scene({ step: 'main' });
  real(state, 'hounds', 'vampire-hounds');
  real(state, 'fodder', 'vampire-hounds', { zone: 'hand' });
  addMana(state, 'p1', 4, { colors: ['B'] });
  const activation = scores(state).get('activate_ability(hounds#0)');
  assert.ok(activation < 0, `pusty pump nie jest wart karty (${activation})`);
});

// =========================================================================
// 3. Picker odrzucenia: rozróżnia karty NIEGRYWALNE (poprawka PMSSB-81)
// =========================================================================

test('PMSSB-81/5: z dwóch niegrywalnych stworów ginie TAŃSZY/ GORSZY', () => {
  // Same Swampy: 3/2 (G, 2 many) i 5/3 (R, 4 many) nie są grywalne.
  const state = scene({ lands: ['basic-swamp', 'basic-swamp', 'basic-swamp', 'basic-swamp', 'basic-swamp'] });
  real(state, 'hounds', 'vampire-hounds');
  real(state, 'cheap', 'garruks-companion', { zone: 'hand' });
  real(state, 'fat', 'changeling-berserker', { zone: 'hand' });
  addMana(state, 'p1', 6, { colors: ['B'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'hounds'));
  const pick = scores(state);
  const cheap = pick.get('resolve_discard_choice(cheap)');
  const fat = pick.get('resolve_discard_choice(fat)');
  assert.ok(Number.isFinite(cheap) && Number.isFinite(fat), 'obie oferty w wycenie');
  assert.ok(cheap > fat, `ginie 2-manowy 3/2 (${cheap}) przed 4-manowym 5/3 (${fat})`);
});

test('PMSSB-81/6: pokrętła różnicowania są jawne i sterowalne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.discardUncastableClamp, 20);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.discardUncastableScale, 0.25);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.discardUnwantedBonus, 5, 'baza gałęzi nietknięta');
});
