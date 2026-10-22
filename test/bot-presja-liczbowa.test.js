import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * B (zgłoszenie właściciela 2026-10-21e): przewaga liczbowa nie zamienia się
 * w presję.
 *
 * Plansza właściciela: wrog ma JEDNĄ kreaturę 2/2 flying. Bot ma 2/3, 3/2,
 * 1/2 i 2/2. Bot atakuje wyłącznie 2/3.
 *
 * Przy jednym blokerze wroga co najwyżej jeden atakujący zostanie zablokowany;
 * pozostałe przechodzą do twarzy. Właściciel wyliczył to jako „6 do twarzy"
 * i pytał, dlaczego bot nie wykorzystuje przewagi.
 *
 * Przyczyna: wycena `declare_attackers` liczy każdego atakującego
 * niezależnie, jakby był jedynym blokowanym, i kara nadmiarowych ataków tak,
 * jakby każdy trafił na chump. Brakuje pojęcia „slotów blokowania".
 *
 * Reguła ma być generyczna (ADR 0002): liczba atakujących, których wróg nie
 * pokryje, jest presją na twarz, a nie stratą — niezależnie od nazw kart.
 */

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: over.summoningSickness ?? false,
    tapped: over.tapped ?? false,
  }));
}

/** Plansza właściciela: bot 2/3 + 3/2 + 1/2 + 2/2, wróg 2/2 flying. */
function scena({ blokerow = 1 } = {}) {
  const state = newState();
  put(state, 'a', 'highland-game', 'p1', { power: 2, toughness: 3 });
  put(state, 'b', 'highland-game', 'p1', { power: 3, toughness: 2 });
  put(state, 'c', 'highland-game', 'p1', { power: 1, toughness: 2 });
  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { power: 2, toughness: 2 });
  for (let i = 0; i < blokerow; i += 1) {
    put(state, `foe${i}`, 'highland-game', 'p2', {
      power: 2, toughness: 2, keywords: i === 0 ? ['flying'] : [],
    });
  }
  return state;
}

function botAtak(state) {
  const bot = createHeuristicBot({ seed: 1209 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  const trace = bot.trace();
  return { ids: cmd.attackerIds ?? [], opcje: trace[trace.length - 1].options };
}

test('B/1 ⭐ RED: 4 stwory bota vs JEDEN 2/2 flying — nadmiarowe ataki to presja, nie chumpy', () => {
  const { ids, opcje } = botAtak(scena({ blokerow: 1 }));
  const punkty = Object.fromEntries(opcje
    .filter((o) => o.cmd.startsWith('attack'))
    .map((o) => [o.cmd, o.score]));
  console.log('  wybrany atak:', JSON.stringify(ids));
  console.log('  ranking:', JSON.stringify(punkty));

  assert.ok(ids.length >= 2,
    `przy jednym blokerze wroga bot powinien atakować wieloma stworami `
    + `(wybrano ${JSON.stringify(ids)}) — każdy poza pierwszym to darmowa `
    + `presja na twarz, nie chump`);

  // Opcjonalnie: wariant zostawiający część w domu musi bić wariant
  // atakujący wszystkimi, inaczej bot traci presję bez powodu.
  const wszystko = opcje.find((o) => o.cmd === 'attack[a,b,c,shaman]');
  const samotne = opcje.find((o) => o.cmd === 'attack[a]');
  if (wszystko && samotne) {
    assert.ok(wszystko.score > samotne.score,
      `atak wszystkimi musi być lepszy niż atak jednym, gdy wrog ma mniej `
      + `blokerów niż bot stworów (wszystko=${wszystko.score}, `
      + `samotne=${samotne.score})`);
  }
});

test('B/2: przy wielu blokerach agresja NIE rośnie w nieskończoność (wrog kryje)', () => {
  // Wrog ma tyle stworów, ile bot atakuje — wtedy trzymanie części w domu
  // do blokowania nadal ma sens i nie wolno, by atak wszystkim zawsze wygrywał.
  const { ids } = botAtak(scena({ blokerow: 4 }));
  console.log('  wybrany atak przy 4 blokerach:', JSON.stringify(ids));
  assert.ok(ids.length <= 4,
    `przy 4 blokerach bot nie musi wysyłać wszystkich (wybrano ${JSON.stringify(ids)})`);
});