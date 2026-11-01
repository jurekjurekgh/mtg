// PMSSB-83 (batch 71) — MILL ZACZAROWANEGO GRACZA (Curse of the Bloody Tome,
// ISD: „At the beginning of the enchanted player's upkeep, that player mills
// two cards.”; Aura „Enchant player”, CR 303.4).
//
// SONDA PRZED (biblioteka wroga 25/10/4/2/1): wycena rzutu = 36 pkt w KAŻDYM
// stanie. Klątwa była płaską bazą `curseEnemyBase` (40), więc:
//  • mill 2 nie różnił się od klątwy bez millu (ten sam koszt karty i many),
//  • przy bibliotece wroga 1 karta kolejne podtrzymanie to WYGRANA — a bot
//    wyceniał to identycznie jak mill na 25 kart.
// PO: baza + `foeMillValue` (ta sama skala presji deck-outu, której używa
// zwykły mill — L41) × `curseMillUpkeepWeight` (0,5 — liczby podtrzymań nie
// znamy): 25 → 47,7; 10 → 54,9; 4 → 65,7; 2/1 → 227,7.
//
// Audyt kosztu (anty-over-fix): rzut na SIEBIE zostaje karą klasy −900
// (`curseSelfTargetPenalty`), a zwykłe aury-wrogi na permanentach nietknięte
// (inna gałąź: `auraHostileEnemyBase`). Waga nie mnoży premii za cel, tylko
// powtarzalny skutek — kolejna klątwa mieląca dostanie to samo z deskryptora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REG = createCardRegistry();

function scene({ enemyLibrary = 25 } = {}) {
  const state = createGameState({ seed: 83, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 6, { colors: ['U'] });
  for (const [playerId, n] of [['p1', 25], ['p2', enemyLibrary]]) {
    for (let i = 0; i < n; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  const def = REG.get('curse-of-the-bloody-tome');
  addObject(state, {
    id: 'tome', instanceId: 'i-tome', cardId: 'curse-of-the-bloody-tome',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  return state;
}

function scores(state) {
  const bot = createHeuristicBot({ seed: 84, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  return new Map(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
}

// =========================================================================

test('PMSSB-83/1: klątwa celuje w PRZECIWNIKA, nigdy w siebie', () => {
  const rows = scores(scene());
  assert.ok(rows.get('cast_permanent(tome->p2)') > 0);
  assert.ok(rows.get('cast_permanent(tome->p1)') < -500,
    `rzut na siebie = kara klasy „strzał w stopę” (${rows.get('cast_permanent(tome->p1)')})`);
});

test('PMSSB-83/2: im cieńsza biblioteka wroga, tym cenniejsza klątwa', () => {
  const gruba = scores(scene({ enemyLibrary: 25 })).get('cast_permanent(tome->p2)');
  const cienka = scores(scene({ enemyLibrary: 4 })).get('cast_permanent(tome->p2)');
  assert.ok(cienka > gruba + 10,
    `presja deck-outu musi być widoczna (${cienka} vs ${gruba})`);
});

test('PMSSB-83/3: przy bibliotece wroga na wyczerpaniu klątwa jest WYGRANA, nie „dobrą kartą”', () => {
  const krytyczna = scores(scene({ enemyLibrary: 1 })).get('cast_permanent(tome->p2)');
  const zwykla = scores(scene({ enemyLibrary: 25 })).get('cast_permanent(tome->p2)');
  assert.ok(krytyczna > 3 * zwykla,
    `mill 2 przy 1 karcie = deck-out w następnym podtrzymaniu (${krytyczna} vs ${zwykla})`);
});

test('PMSSB-83/4: pokrętło powtarzalności jest jawne i sterowalne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.curseMillUpkeepWeight, 0.5);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.curseEnemyBase, 40, 'baza klątwy nietknięta');
});
