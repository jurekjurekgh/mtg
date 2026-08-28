// M243 — zgłoszenia C i E właściciela (2026-08-27): mana-marnotrawstwo bota.
//
// C: Heap Gate {1},{T},Tap an untapped Gate: Create a Treasure — bot wybierał
//    ją przy PUSTEJ ręce (najwyższy wynik): płacił 1 manę i tapował DWA lądy
//    (Heap Gate + inna Gate), żeby wyprodukować Skarb-bank many na przyszłość.
//    Bilans w tej turze: −1 mana, −2 tapnięte źródła. Bot nie planuje portfela
//    na następną turę — to zwyczajna strata tempa w ocenie bieżącej.
//
// E: Treasure token — bot POŚWIĘCAŁ Skarb na manę, choć spel dało się spłacić
//    samymi nietapniętymi lądami. Root cause: token nie ma wpisu w card-data
//    (cardId 'token_treasure' istnieje w rejestrze, ale jako defineCard BEZ
//    abilities — zdolność siedzi w deskryptorze obiektu), a bot czytał
//    zdolność WYŁĄCZNIE z rejestru → effects=[] → żadna kara za „produkcję
//    many bez potrzeby" ani poświęcenie się nie załapała → goła baza 2 > pass.
//    Fix: playerView niesie publiczną listę activatableAbilities obiektu
//    (tę samą, po której indeksuje silnik — L48), a bot czyta ją NAJPIERW.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game({ heap = false, treasure = false, handCosts = [], lands = 3 } = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < lands; i += 1) {
    addObject(state, {
      id: `mtn${i}`, instanceId: `i-mtn${i}`, cardId: 'basic-mountain', cardName: 'Mountain',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0,
      subtypes: ['Mountain'], types: ['Basic', 'Land'], abilities: [], keywords: [], colors: ['R'],
    });
  }
  if (heap) {
    const heapDef = REGISTRY.get('heap-gate');
    addObject(state, {
      id: 'heap', instanceId: 'i-heap', cardId: 'heap-gate', cardName: 'Heap Gate',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0,
      subtypes: ['Gate'], types: ['Land'], abilities: heapDef.abilities, keywords: [], colors: [],
    });
    // Druga brama (koszt heap#2: tapnięcie innego Gate).
    addObject(state, {
      id: 'gate2', instanceId: 'i-gate2', cardId: 'basic-land', cardName: 'Gate',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0,
      subtypes: ['Gate'], types: ['Land'], abilities: [], keywords: [], colors: ['C'],
    });
  }
  if (treasure) {
    addObject(state, {
      id: 'treas', instanceId: 'i-treas', cardId: 'token_treasure', cardName: 'Treasure',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', manaCost: 0,
      subtypes: ['Treasure'], types: ['Artifact'], keywords: [], colors: [],
      // Deskryptor JAK produkuje engine (effects.js create_token — zdolność
      // w OBIEKCIE, nie w rejestrze kart).
      abilities: [Object.freeze({
        type: 'activated', timing: 'instant', keyword: null,
        cost: Object.freeze({ tap: true, sacrificeSelf: true }),
        effect: Object.freeze({ type: 'add_mana', amount: 1, fromTreasure: true }),
        trigger: null, targets: null, cycling: null, condition: null, pump: null,
        keywords: null, oncePerTurn: false, mustAttack: false,
      })],
    });
  }
  handCosts.forEach((cost, i) => addObject(state, {
    id: `h${i}`, instanceId: `i-h${i}`, cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'creature', manaCost: cost, power: 2, toughness: 1,
    types: ['Creature'], subtypes: [], colors: ['G'], abilities: [], keywords: [],
  }));
  return state;
}

const pickScores = (state, seed = 2026) => {
  const bot = createHeuristicBot({ seed });
  bot.chooseCommand(playerView(state, 'p1'), {});
  return { pick: bot.trace()[0].chosen, options: bot.trace()[0].options };
};

test('M243/E: bot NIE poświęca Treasure na manę, gdy czary spłacają same lądy', () => {
  const state = game({ treasure: true, handCosts: [2, 2, 2] });
  const { pick, options } = pickScores(state);
  const treasureOpt = options.find((o) => o.cmd.startsWith('activate_ability(treas'));
  assert.ok(treasureOpt, 'opcja aktywacji Skarba w ogóle istnieje w ofercie');
  assert.ok(treasureOpt.score < 0,
    `kara za poświęcenie banku many bez potrzeby (M128 dla tokenów): score=${treasureOpt.score}`);
  assert.notEqual(pick, treasureOpt.cmd, 'bot bierze rzut lub pass, nie Skarb');
});

test('M243/E2: Treasure NA POŻYCIE pozostaje legalny, gdy ODblokowuje rzut (regresja: nie panikuj)', () => {
  // Jedna Mountain + jeden Skarb + karta za 2: bez Skarba nie stać nas na nic.
  const state = game({ treasure: true, handCosts: [2, 2], lands: 1 });
  const { options } = pickScores(state);
  const treasureOpt = options.find((o) => o.cmd.startsWith('activate_ability(treas'));
  assert.ok(treasureOpt, 'oferta istnieje');
  assert.ok(treasureOpt.score > 0,
    `Skarb odblokowujący rzut jest nadal dobry (unlocksSomething): score=${treasureOpt.score}`);
});

test('M243/C: Heap Gate #3 (Treasure za {1},{T}+tap bramy) nie wygrywa z passem', () => {
  const state = game({ heap: true, handCosts: [2, 2, 2] });
  const { pick, options } = pickScores(state);
  for (const heapOpt of options.filter((o) => o.cmd.startsWith('activate_ability(heap'))) {
    assert.ok(heapOpt.score < 0,
      `zdolności many Heap Gate poniżej passu gdy nic nie odblokowują: ${heapOpt.cmd}=${heapOpt.score}`);
  }
  assert.ok(!pick.startsWith('activate_ability(heap)'), `bot nie klika Heap Gate na zapas: ${pick}`);
});
