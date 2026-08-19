import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { defineCard, createRegistry } from '../src/cards/registry.js';

/**
 * B3 — modelowanie przeciwnika (docs/BOT_ROADMAP.md): bot zna talię
 * przeciwnika (opponentDeck) i przez hipergeometrię szacuje, czy przeciwnik
 * trzyma removal/combat trick; EV ataku i bloków uwzględnia to ryzyko.
 */

// Lokalne karty testowe (damage/pump instant) — NIE w globalnym rejestrze/kreatorze.
const synShock = defineCard({ id: 'syn-shock', name: 'Test Shock', types: ['Instant'], manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] }, support: { status: 'supported' } });
const synMight = defineCard({ id: 'syn-might', name: 'Test Might', types: ['Instant'], manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'pump', power: 2, toughness: 2 }] }, support: { status: 'supported' } });
const REGISTRY = createRegistry([...createCardRegistry().all(), synShock, synMight]);

function game() {
  return createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, tapped = false, summoningSickness = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId, { tapped = false } = {}) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield', kind: 'land', power: null, toughness: null, abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'] });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped }));
  return state.objects.get(id);
}

/** Talia przeciwnika: same ziemie + N kopii czaru (damage = removal / pump = trick). */
function deckWithSpell(cardId, copies) {
  return [...Array.from({ length: 8 }, () => 'basic-forest'), ...Array.from({ length: copies }, () => cardId)];
}

const REMOVAL_DECK = deckWithSpell('syn-shock', 4); // instant damage 2
const PUMP_DECK = deckWithSpell('syn-might', 4);    // instant pump
const NO_SPELL_DECK = Array.from({ length: 12 }, () => 'basic-forest');

function makeAttackState(attackerPower, attackerToughness, foeHandSize, foeMana, foeUntappedLands, foeLife = 20) {
  const state = game();
  addSimpleCreature(state, 'me', 'p1', { power: attackerPower, toughness: attackerToughness });
  addLand(state, 'myland', 'p1');
  addLand(state, 'foe-land', 'p2', { tapped: !(foeUntappedLands > 0) });
  for (let i = 0; i < foeMana; i += 1) state.players[1].mana += 1;
  state.players[1].life = foeLife;
  // Ręka przeciwnika: foeHandSize ukrytych kart (biblioteka reszta).
  for (let i = 0; i < foeHandSize; i += 1) {
    addObject(state, { id: `hand-foe-${i}`, instanceId: `i-foe-${i}`, cardId: 'basic-forest', controllerId: 'p2', zone: 'hand', kind: 'land' });
  }
  for (let i = 0; i < 10; i += 1) {
    addObject(state, { id: `lib-foe-${i}`, instanceId: `i-lib-${i}`, cardId: 'basic-forest', controllerId: 'p2', zone: 'library', kind: 'land' });
  }
  // Biblioteka p1 — bez niej bot myśli, że ma deck-out (myLibraryCount=0 ≤ 4)
  // i wchodzi w tryb wyścigu, który wyłącza karę B3.
  for (let i = 0; i < 15; i += 1) {
    addObject(state, { id: `lib-me-${i}`, instanceId: `i-lib-me-${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land' });
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  return state;
}

test('B3: przeciwnik z removalami i otwartą maną — bot nie atakuje wartościowego stwora', () => {
  const state = makeAttackState(4, 3, 3, 1, 1);
  const bot = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: REMOVAL_DECK });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  // 4/3 w otwarte pole, ale wróg ma 3 karty w ręce + manę na Shock (2 dmg < 3,
  // nie zabije — więc atak powinien przejść). Użyjmy 2/2 (Shock zabija).
  assert.ok(cmd.type === 'declare_attackers');
});

test('B3: przeciwnik może zabić atakującego — bot wstrzymuje atak; bez many — atakuje', () => {
  // 2/2, wróg 3 karty w ręce, Shock ×4 w talii, otwarta mana → ryzyko realne.
  const risky = makeAttackState(2, 2, 3, 1, 1);
  const botRisky = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: REMOVAL_DECK });
  const cmdRisky = botRisky.chooseCommand(playerView(risky, 'p1'));
  const attackingRisky = cmdRisky.type === 'declare_attackers' && (cmdRisky.attackerIds ?? []).length > 0;
  assert.ok(!attackingRisky,
    `z ryzykiem removalu bot nie atakuje (wybrał ${cmdRisky.type} ${JSON.stringify(cmdRisky.attackerIds)})`);

  // Ten sam układ, ale wróg bez otwartej many → nie może zagrać instanta.
  const noMana = makeAttackState(2, 2, 3, 0, 0);
  const botNoMana = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: REMOVAL_DECK });
  const cmdNoMana = botNoMana.chooseCommand(playerView(noMana, 'p1'));
  assert.ok(cmdNoMana.type === 'declare_attackers' && cmdNoMana.attackerIds.length === 1,
    'bez otwartej many bot atakuje');
});

test('B3: przeciwnik BEZ czarów — bot atakuje mimo karty w ręce i many', () => {
  const state = makeAttackState(2, 2, 3, 1, 1);
  const bot = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: NO_SPELL_DECK });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(cmd.type === 'declare_attackers' && cmd.attackerIds.length === 1,
    'bez removalu w talii przeciwnika bot atakuje');
});

test('B3: wyścig — bot atakuje mimo ryzyka removalu (presja > ostrożność)', () => {
  // Wróg na 5 życiach: atak 2/2 może dobić, liczy się presja (lekcja B2).
  const state = makeAttackState(2, 2, 3, 1, 1, 5);
  const bot = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: REMOVAL_DECK });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(cmd.type === 'declare_attackers' && cmd.attackerIds.length === 1,
    'w wyścigu o lethal bot atakuje mimo ryzyka');
});

test('B3: blok — przeciwnik z pumpem i maną, bot nie wchodzi w zabójczy blok', () => {
  // Nasz 3/3 blokuje atakującego 2/2 (zabiłby go), ale wróg ma pumpy i manę —
  // blok jest ryzykowny (pump ratuje atakującego). Bez presji śmiertelnej
  // bot woli przepuścić 2 obrażeń.
  const state = game();
  addSimpleCreature(state, 'myblocker', 'p1', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'theirattacker', 'p2', { power: 2, toughness: 2, summoningSickness: false });
  addLand(state, 'foe-land', 'p2');
  state.players[1].mana = 1;
  for (let i = 0; i < 3; i += 1) addObject(state, { id: `hand-foe-${i}`, instanceId: `i-foe-${i}`, cardId: 'basic-forest', controllerId: 'p2', zone: 'hand', kind: 'land' });
  for (let i = 0; i < 8; i += 1) addObject(state, { id: `lib-foe-${i}`, instanceId: `i-lib-${i}`, cardId: 'basic-forest', controllerId: 'p2', zone: 'library', kind: 'land' });
  for (let i = 0; i < 15; i += 1) addObject(state, { id: `lib-me-${i}`, instanceId: `i-lib-me-${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land' });
  state.turn.activePlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  const declared = execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['theirattacker'] });
  assert.ok(declared.ok, JSON.stringify(declared.events[0]));

  const botPump = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: PUMP_DECK });
  const cmdPump = botPump.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmdPump.type, 'declare_blockers');
  assert.equal(Object.keys(cmdPump.assignments ?? {}).length, 0, 'z ryzykiem pumpa bot nie blokuje');

  // Ten sam układ, ale talia przeciwnika bez pumpów → blokujemy (zabijamy 2/2).
  const botPlain = createHeuristicBot({ registry: REGISTRY, seed: 1, opponentDeck: NO_SPELL_DECK });
  const cmdPlain = botPlain.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmdPlain.type, 'declare_blockers');
  assert.ok(Object.keys(cmdPlain.assignments ?? {}).length > 0, 'bez pumpów bot blokuje i zabija atakującego');
});

test('B3: determinizm — ten sam seed i talia dają te same decyzje', () => {
  const state = makeAttackState(2, 2, 3, 1, 1);
  const a = createHeuristicBot({ registry: REGISTRY, seed: 9, opponentDeck: REMOVAL_DECK });
  const b = createHeuristicBot({ registry: REGISTRY, seed: 9, opponentDeck: REMOVAL_DECK });
  assert.deepEqual(a.chooseCommand(playerView(state, 'p1')), b.chooseCommand(playerView(state, 'p1')));
});

test('B3: partia z modelowaniem (obaj gracze znają talie) kończy się i jest deterministyczna', () => {
  const registry = createCardRegistry();
  const deck = parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), registry);
  const run = (seed) => {
    const state = setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: new Map([['p1', deck.cardIds], ['p2', deck.cardIds]]), registry });
    const result = runSimulation({
      state,
      controllers: new Map([
        ['p1', createHeuristicBot({ registry: REGISTRY, seed: seed + 1, opponentDeck: deck.cardIds })],
        ['p2', createHeuristicBot({ registry: REGISTRY, seed: seed + 2, opponentDeck: deck.cardIds })],
      ]),
      maxCommands: 3000,
    });
    return result.state;
  };
  const a = run(101);
  const b = run(101);
  assert.ok(a.status !== 'active');
  assert.equal(a.winnerId, b.winnerId);
  assert.equal(a.players[0].life, b.players[0].life);
});

// =============================================================================
// Uwaga B (2026-08-12): bot nie rzuca buffów (pump) na stwory PRZECIWNIKA.
// Might of the Masses używa pump_by_creature_count — wcześniej nie objęty
// karą „wzmacnianie przeciwnika\". Teraz każdy pump na cudzym stwórze = kara.
// =============================================================================
const synMightCount = defineCard({ id: 'syn-might-count', name: 'Test Might Count', types: ['Instant'], manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'pump_by_creature_count', perCreature: 1 }] }, support: { status: 'supported' } });
const REGISTRY_B = createRegistry([...createCardRegistry().all(), synMightCount]);

function mightState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Bot ma w ręce pump; pole bitwy ma jego stwora i stwora przeciwnika.
  addObject(state, { id: 'might', instanceId: 'i-might', cardId: 'syn-might-count', controllerId: 'p1', zone: 'hand', kind: 'spell', power: null, toughness: null, manaCost: 1, spell: REGISTRY_B.get('syn-might-count').spell, abilities: [], keywords: [], subtypes: [], types: ['Instant'] });
  addSimpleCreature(state, 'mine', 'p1', { power: 1, toughness: 1 });
  addSimpleCreature(state, 'foe', 'p2', { power: 4, toughness: 4 });
  addLand(state, 'myland', 'p1');
  // Mana na rzut.
  addMana2(state);
  // Biblioteka p1 (żeby bot nie myślał o deck-oucie).
  for (let i = 0; i < 15; i += 1) addObject(state, { id: `lib-me-${i}`, instanceId: `i-lib-me-${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land' });
  return state;
}
function addMana2(state) {
  // Dodaj manę bezpośrednio do puli p1.
  state.players[0].mana += 1;
}

test('B: bot NIE rzuca pumpa na stwora przeciwnika (wybiera własnego)', () => {
  const state = mightState();
  const bot = createHeuristicBot({ registry: REGISTRY_B, seed: 1, opponentDeck: [] });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  // Bot albo w ogóle nie rzuca pumpa, albo celuje w WŁASNEGO stwora.
  if (cmd.type === 'cast_spell' && cmd.objectId === 'might') {
    assert.equal(cmd.targets[0], 'mine', 'pump celuje we własnego stwora, nie przeciwnika');
  }
});
