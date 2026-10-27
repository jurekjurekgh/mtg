// Audyt PR #176 (sesja 2026-10-27c), O-2: płatność czaru, który LICZY KOLORY
// wydanej many (Converge — ability word, CR 207.2c; Kaleidoscorch, MH2 133:
// „Kaleidoscorch deals X damage to any target, where X is the number of colors
// of mana spent to cast this spell.”).
//
// Objaw (sonda audytu): pula {R}{R}{G}, koszt {1}{R} — silnik wydawał dwie
// czerwone jednostki, więc kolorów było 1 (X = 1), choć gracz mógł wydać {R}+{G}
// i mieć X = 2. Płatność była LEGALNA (CR 601.2h: „the player may pay... in any
// order”, wybór jednostek należy do płacącego), ale silnik brał pierwszą
// z brzegu — a przy czarze Converge to dosłownie zmarnowana połowa karty.
//
// Naprawa: marker `colors_of_mana_spent` w treści efektu ustawia flagę CELU
// płatności (`maximizeManaColors` w `spellManaPurpose`), a komparator
// `compareGenericConsume` schodzi z puli tak, by wnosić kolor JESZCZE nieużyty
// (najpierw kolor spoza pipów, potem kolor już zapłacony, na końcu bezbarwna —
// CR 106.1a: bezbarwna nie jest kolorem). Flaga jest wąska: Adamant („three
// <color> mana was spent”) i zwykłe rzuty zachowują dawną kolejność.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, spellCountsManaColors } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 176, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function real(state, cardId, { id, zone = 'battlefield', controllerId = 'p1' } = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: [...(def.types ?? [])], subtypes: [...(def.subtypes ?? [])],
  });
  return state.objects.get(id);
}

function resolveAll(state) {
  for (let i = 0; i < 8; i += 1) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

function lifes(state) {
  return Object.fromEntries(state.players.map((p) => [p.id, p.life]));
}

test('O-2: Kaleidoscorch z puli {R}{R}{G} zadaje 2 obrażenia (dwa KOLORY, nie dwie czerwone)', () => {
  const state = game();
  const kal = real(state, 'kaleidoscorch', { id: 'kal', zone: 'hand' });
  addMana(state, 'p1', 2, { colors: ['R'] });
  addMana(state, 'p1', 1, { colors: ['G'] });
  const oferta = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'kal' && c.targets?.[0] === 'p2');
  assert.ok(oferta, 'oferta rzutu w gracza');
  assert.equal(execute(state, oferta).ok, true);
  resolveAll(state);
  assert.equal(lifes(state).p2, 18,
    'X = liczba KOLORÓW wydanej many (CR 207.2c): {R}+{G} = 2, nie {R}+{R} = 1');
});

test('O-2: przy trzech kolorach w puli płacone są DWA różne kolory (koszt {1}{R} = 2 many)', () => {
  const state = game();
  const kal = real(state, 'kaleidoscorch', { id: 'kal', zone: 'hand' });
  addMana(state, 'p1', 1, { colors: ['R'] });
  addMana(state, 'p1', 1, { colors: ['G'] });
  addMana(state, 'p1', 1, { colors: ['U'] });
  const oferta = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'kal' && c.targets?.[0] === 'p2');
  assert.ok(oferta, 'oferta rzutu w gracza');
  assert.equal(execute(state, oferta).ok, true);
  resolveAll(state);
  // Koszt to 2 many, więc maksimum to 2 kolory — ale muszą być RÓŻNE (pip {R}
  // plus inny kolor w części generycznej), nie dwie czerwone jednostki.
  assert.equal(lifes(state).p2, 18, 'dwa różne kolory z trzech dostępnych');
});

test('O-2 anty-over-fix: czar BEZ markera kolorów zachowuje dawną kolejność puli', () => {
  // Jilt {1}{U} nie liczy kolorów — płatność nie ma powodu drgać, a Adamant
  // („three <color> mana”) wprost wymaga wydania JEDNEGO koloru.
  const state = game();
  real(state, 'jilt', { id: 'jilt', zone: 'hand' });
  real(state, 'arlinns-wolf', { id: 'wolf', controllerId: 'p2' });
  const jilt = state.objects.get('jilt');
  assert.equal(spellCountsManaColors(jilt), false, 'Jilt nie jest czarem Converge');
  assert.equal(spellCountsManaColors(state.objects.get('wolf')), false, 'permanent nie ma deskryptora czaru');
  // marker czytany z treści efektu, nie z nazwy karty (ADR 0002)
  const synthetic = { spell: { effects: [{ type: 'damage', amount: 'colors_of_mana_spent' }] } };
  assert.equal(spellCountsManaColors(synthetic), true, 'marker wykryty w efekcie');
  const modal = { spell: { effects: [], modes: [{ effects: [{ type: 'damage', amount: 'colors_of_mana_spent' }] }] } };
  assert.equal(spellCountsManaColors(modal), true, 'marker wykryty w trybie modalnym');
});
