// PMSSB-69 (inicjatywa, `take_initiative`) — sonda POMIARU PRZED / PO dla wyceny bota.
// Uruchomienie: node tools/pmssb69-initiative-sonda.mjs
//
// Rodzina: `take_initiative` (CR 725) — trzy karty z ETB „you take the initiative”:
//   * Underdark Explorer (5/3, koszt 5), Stirring Bard (0/4 defender, koszt 4),
//     Caves of Chaos Adventurer (5/3, koszt 4).
// Pytanie (L41): czy wycena ETB zależy od tego, kto ma inicjatywę (nikt / ja / wróg),
// i od tego, ile stworów wroga może zaatakować (ryzyko utraty)?
// Sonda NIE jest testem zachowania — piny są w test/audyt-pmssb69-initiative.test.js.
import { playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { botTurn, putCard, putSynthCreature } from './pmssb63-batch68-sonda.mjs';
import { scoreOf } from './pmssb68-amass-sonda.mjs';

/**
 * Stół: bot p2 w głównej, 6 many, karta z inicjatywą w ręce, wróg p1 z opcjonalnymi stworami.
 * `holder` — kto ma inicjatywę przed zagraniem: null | 'p2' (ja) | 'p1' (wróg).
 */
export function table({ card, holder = null, foes = 0 }) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 6, { colors: ['B', 'R', 'G', 'W', 'U'] });
  putCard(state, 'x', card, 'p2', 'hand');
  for (let i = 0; i < foes; i += 1) {
    putSynthCreature(state, `f${i}`, 'p1', { power: 2, toughness: 2, mv: 2 });
  }
  state.initiativePlayerId = holder;
  return state;
}

/** Wynik kandydata na czar (cast_permanent) przy danym stole. */
export function probe({ card, holder = null, foes = 0 }) {
  const state = table({ card, holder, foes });
  const bot = createHeuristicBot({ seed: 69 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  return scoreOf(bot, 'cast_permanent(x');
}

export const VARIANTS = [
  { id: 'nikt-wrog-0', holder: null, foes: 0 },
  { id: 'nikt-wrog-2', holder: null, foes: 2 },
  { id: 'ja-wrog-0', holder: 'p2', foes: 0 },
  { id: 'wrog-inic-0', holder: 'p1', foes: 0 },
  { id: 'wrog-inic-2', holder: 'p1', foes: 2 },
];

export const CARDS = [
  { id: 'underdark-explorer', label: 'Underdark Explorer (5/3, ETB)' },
  { id: 'stirring-bard', label: 'Stirring Bard (0/4 def, ETB)' },
  { id: 'caves-of-chaos-adventurer', label: 'Caves of Chaos Adv. (5/3, ETB)' },
];

// Uruchomienie bezpośrednie: tabela PRZED/PO.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const card of CARDS) {
    const row = VARIANTS.map((v) => {
      const s = probe({ card: card.id, holder: v.holder, foes: v.foes });
      return `${v.id}=${s === null ? 'brak' : s.toFixed(4)}`;
    });
    console.log(`${card.label.padEnd(34)} ${row.join('  ')}`);
  }
}
