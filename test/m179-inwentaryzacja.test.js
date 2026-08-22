// M179 — inwentaryzacja i łatanie dziur (zlecenie właściciela A–F).
// Oś D: nielandowe źródła czystej many w ofercie i płatności.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, producibleMana, untappedFreeManaSources } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 179, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// ---- D: nielandowe źródła czystej many --------------------------------------

test('D1: producibleMana liczy Seer\'s Lantern i Scorned Villager (czysty {T}: add mana)', () => {
  const state = game('p1');
  assert.equal(producibleMana(state, 'p1'), 0, 'bez źródeł zero');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  assert.equal(producibleMana(state, 'p1'), 2, 'artefakt + stwór bez choroby');
  const free = untappedFreeManaSources(state, 'p1');
  assert.equal(free.length, 2);
});

test('D2: stwór z chorobą przywołania NIE liczy się (CR 302.6); źródła z kosztami/skutkami poza listą', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1');
  // addObject nie przenosi summoningSickness z patcha (L21) — ustaw wprost.
  state.objects.set('villager', Object.freeze({ ...state.objects.get('villager'), summoningSickness: true }));
  assert.equal(producibleMana(state, 'p1'), 0, 'choroba przywołania blokuje {T}');
  // Apprentice Wizard (koszt {1}{U}) i Pristine Talisman (skutek uboczny —
  // życie) NIE wchodzą do auto-many (świadoma decyzja gracza).
  putCard(state, 'wizard', 'apprentice-wizard', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'talisman', 'pristine-talisman', 'p1');
  assert.equal(untappedFreeManaSources(state, 'p1').length, 0, 'wizard/talisman poza czystą maną');
});

test('D3: oferta rzutu widzi manę z Lantern/Villager i płatność je auto-tapuje (L48)', () => {
  const state = game('p1');
  // Highland Game {1}{G}: 1 Forest (na pipa {G}) + Seer\'s Lantern (generic).
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta rzutu z maną land+artefakt (bez ręcznej aktywacji)');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('lantern').tapped, true, 'Lantern auto-tapnięty w płatności');
  assert.equal(state.objects.get('forest').tapped, true, 'Forest tapnięty na pipa {G}');
});

test('D3b: pip kolorowy pokrywa nielandowe źródło (Scorned Villager → {G})', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'island', 'basic-island', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand'); // {1}{G}
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta: {G} z Villagera + generic z Island');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('villager').tapped, true, 'Villager tapnięty na pipa {G}');
});

// ---- A1: triki bojowe — czary rzucane we właściwym oknie walki ---------------

function sick(state, id, value) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: value }));
}

test('A1a: bot NIE rzuca instant-trika (Awaken the Bear) we własnej main — czeka na walkę', () => {
  const state = game('p2');
  putCard(state, 'bear-spell', 'awaken-the-bear', 'p2', 'hand');
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 3, { colors: ['G'] });
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'bear-spell'), 'oferta istnieje');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'bear-spell'),
    `trik w main = strata okna (wybrał: ${chosen.type})`);
});

test('A1b: bot RZUCA instant-trik na WŁASNEGO zadeklarowanego atakującego (pump+trample)', () => {
  const state = game('p2');
  putCard(state, 'bear-spell', 'awaken-the-bear', 'p2', 'hand');
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 3, { colors: ['G'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['me'] }).ok);
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bear-spell' && c.targets?.[0] === 'me');
  assert.ok(cast, 'oferta trika w walce');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'cast_spell' && chosen.objectId === 'bear-spell' && chosen.targets?.[0] === 'me',
    `trik na atakującym = właściwe okno (wybrał: ${JSON.stringify(chosen)})`);
});

// ---- C: sorcery-triki — Główna 1 przed atakiem, nie postcombat ----------------

const SORCERY_PUMP = Object.freeze({
  timing: 'sorcery',
  targets: [{ type: 'creature' }],
  effects: [{ type: 'pump', power: 3, toughness: 1 }],
});

test('C1: sorcery-pump rzucany w Głównej 1, gdy stwór może zaatakować', () => {
  const state = game('p2');
  putCard(state, 'sorc', 'titans-strength', 'p2', 'hand', { spell: SORCERY_PUMP });
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, phase: 'precombat_main', step: 'main' };
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sorc' && c.targets?.[0] === 'me');
  assert.ok(cast, 'oferta sorcery-pumpa w Głównej 1');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'cast_spell' && chosen.objectId === 'sorc',
    `sorcery nie poczeka na combat — Główna 1 przed atakiem to jego okno (wybrał: ${chosen.type})`);
});

test('C2: sorcery-pump NIE rzucany w Głównej 2 (efekt wyparuje w cleanup)', () => {
  const state = game('p2');
  putCard(state, 'sorc', 'titans-strength', 'p2', 'hand', { spell: SORCERY_PUMP });
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, phase: 'postcombat_main', step: 'main' };
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'sorc'), 'oferta istnieje');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'sorc'),
    `pump w Głównej 2 nie zdąży pomóc (wybrał: ${chosen.type})`);
});
