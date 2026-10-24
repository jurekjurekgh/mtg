/**
 * Zgłoszenie właściciela J (2026-10-24): Izzet Charm, tryb „Draw two cards,
 * then discard two cards”. Bot wybierał ten tryb i odrzucał swoje grywalne
 * karty; wybrał go także przy 3 kartach w bibliotece.
 *
 * Diagnoza: wybór SAMYCH odrzucanych kart jest zdrowy (`discardCostPreference`
 * bot najpierw oddaje karty utknięte kolorowo, keeperów najgorszych najpierw) —
 * brakowało BRAMKI na decyzję o loocie. Podatek biblioteczny (kara wagowa)
 * nie zatrzymywał lootu przy 3 kartach (ryzyko CR 704.5b — porażka z braku
 * kart). Reguła właściciela jako twarde weto wariantu rzutu (`lootCastVeto`,
 * klasa po typie efektu `draw_then_discard` — ADR 0002): loot wolno tylko,
 * gdy (a) w ręce poza rzucanym czarem jest co najmniej tyle kart
 * „utkniętych na pipach” (pip, którego koloru nie daje żaden nietapnięty
 * land bota), ile trzeba odrzucić, oraz (b) biblioteka bota ma ≥10 kart
 * i w paśmie 11–20 nie jest mniejsza od biblioteki przeciwnika.
 *
 * Sceny fabrykowane na stanie silnika: bot (p2) w swojej fazie głównej,
 * nietapnięte Island + Mountain (kolory {U,R}), Izzet Charm w ręce; bez
 * stworów przeciwnika i bez zaklęć na stosie silnik oferuje tylko tryb
 * lootu — decyzja bota to czysta bramka J. Highland Game {1}{G} = karta
 * utknięta (brak zielonej), Hill Giant {3}{R} = keeper grywalny kolorem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** hand: lista [objectId, cardId] kart bota poza landami startowymi. */
function scena({ hand, myLib = 30, oppLib = 30 }) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  put(state, 'isl1', 'basic-island', 'battlefield', 'p2');
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p2');
  for (const [id, cardId] of hand) put(state, id, cardId, 'hand', 'p2');
  for (let i = 0; i < myLib; i++) put(state, `lib${i}`, 'basic-island', 'library', 'p2');
  for (let i = 0; i < oppLib; i++) put(state, `libp1-${i}`, 'basic-island', 'library', 'p1');
  return state;
}

const bot = () => createHeuristicBot({ seed: 5 });
const botChoice = (state) => bot().chooseCommand(playerView(state, 'p2'), {});
const ofertyLootu = (state) => playerView(state, 'p2').legalCommands
  .filter((c) => c.type.startsWith('cast') && c.objectId === 'charm' && c.modeIndex === 2);

/** Wykonuje rzut bota i prowadzi grę przez decyzje discardu/priorytety. */
function przeprowadz(state, firstCmd) {
  assert.equal(execute(state, firstCmd).ok, true);
  const decydent = bot();
  for (let i = 0; i < 40; i++) {
    const view = playerView(state, 'p2');
    if (view.legalCommands.some((c) => c.type === 'resolve_discard_choice')) {
      assert.equal(execute(state, decydent.chooseCommand(view, {})).ok, true);
      continue;
    }
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

const wStrefie = (state, zoneName) => [...state.objects.values()]
  .filter((o) => o.zone === zoneName && o.controllerId === 'p2').map((o) => o.cardId);

test('J/1: brak kart utkniętych na pipach — bot NIGDY nie wybiera trybu lootu', () => {
  const state = scena({
    hand: [['charm', 'izzet-charm'], ['gigant1', 'hill-giant'], ['gigant2', 'hill-giant']],
  });
  assert.ok(ofertyLootu(state).length > 0, 'silnik oferuje tryb lootu (pin testuje weto, nie brak oferty)');
  assert.notEqual(botChoice(state).objectId, 'charm',
    'tylko keeperzy w ręce = loot zawetowany');
});

test('J/2: dwie karty utknięte + zdrowa biblioteka — bot lootu i odrzuca DOKŁADNIE te dwie', () => {
  const state = scena({
    hand: [['charm', 'izzet-charm'], ['zielona', 'highland-game'],
      ['zielona2', 'highland-game'], ['bomba', 'hill-giant']],
  });
  const choice = botChoice(state);
  assert.equal(choice.objectId, 'charm');
  assert.equal(choice.modeIndex, 2, 'tryb 3: Draw two, then discard two');
  przeprowadz(state, choice);
  const grob = wStrefie(state, 'graveyard');
  assert.deepEqual(grob.sort(), ['highland-game', 'highland-game', 'izzet-charm'].sort(),
    'odrzucone dokładnie obie utknięte (plus sam Charm)');
  assert.ok(wStrefie(state, 'hand').includes('hill-giant'),
    'najlepsza grywalna karta zostaje w ręce');
});

test('J/3: utknięte karty są, ale biblioteka ma 3 karty — loot zawetowany', () => {
  const state = scena({
    hand: [['charm', 'izzet-charm'], ['zielona', 'highland-game'],
      ['zielona2', 'highland-game'], ['bomba', 'hill-giant']],
    myLib: 3,
  });
  assert.ok(ofertyLootu(state).length > 0);
  assert.notEqual(botChoice(state).objectId, 'charm',
    '<10 kart w bibliotece = nigdy nie lootujemy');
});

test('J/4: tylko JEDNA karta utknięta (trzeba odrzucić dwie) — loot zawetowany', () => {
  const state = scena({
    hand: [['charm', 'izzet-charm'], ['zielona', 'highland-game'],
      ['gigant1', 'hill-giant'], ['gigant2', 'hill-giant']],
  });
  assert.ok(ofertyLootu(state).length > 0);
  assert.notEqual(botChoice(state).objectId, 'charm');
});

test('J/5: pasmo biblioteki 11–20 — mniejsza od przeciwnika wetuje, większa/poza pasmem gra', () => {
  const hand = [['charm', 'izzet-charm'], ['zielona', 'highland-game'],
    ['zielona2', 'highland-game'], ['bomba', 'hill-giant']];
  // 15 vs 30: w paśmie i z tyłu → weto.
  const za = scena({ hand, myLib: 15, oppLib: 30 });
  assert.notEqual(botChoice(za).objectId, 'charm',
    'biblioteka 15 przy 30 przeciwnika = nie lootujemy');
  // 15 vs 10: w paśmie, ale z przodu → wolno.
  const przed = scena({ hand, myLib: 15, oppLib: 10 });
  assert.equal(botChoice(przed).objectId, 'charm');
  assert.equal(botChoice(przed).modeIndex, 2);
  // 25 vs 30: poza pasmem → wolno mimo mniejszej biblioteki.
  const poza = scena({ hand, myLib: 25, oppLib: 30 });
  assert.equal(botChoice(poza).objectId, 'charm');
  // Dokładnie 10 kart przechodzi (właściciel: „<10” i pasmo 11–20) — jawny
  // pin krawędzi, żeby nikt jej po cichu nie przesunął.
  const dziesiec = scena({ hand, myLib: 10, oppLib: 30 });
  assert.equal(botChoice(dziesiec).objectId, 'charm');
});
