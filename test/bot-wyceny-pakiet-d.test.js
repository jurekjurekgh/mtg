// E2/D planu 2026-09-07: decyzje JEDNOWARIANTOWE — wycena nie może zmienić
// wyboru (istnieje dokładnie jedna legalna komenda albo warianty są
// regułowo równoważne), więc dostają JAWNE case z komentarzem zamiast
// gałęzi default. Efekt uboczny jest mierzalny: telemetria „akcja bez
// wyceny" (E1) przestaje je liczyć — default zaczyna oznaczać wyłącznie
// NAPRAWDĘ nowy typ komendy silnika (detektor Testera = siatka na przyszłość).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const WIDOK = (cmd) => ({
  playerId: 'p1',
  turn: { number: 1, step: 'main' },
  players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
  zones: { hand: [], battlefield: [], library: [{ id: 'lib' }], graveyard: [], exile: [], stack: [] },
  legalCommands: [cmd],
});

const JEDNOWARIANTOWE = [
  // M66/R: rozdzielanie obrażeń combat — dokładnie JEDEN wariant
  // (lethal-first w kolejności deklaracji); człowiek ma wizard UI (CR 510.1c/d).
  { type: 'resolve_damage_assignment', playerId: 'p1', assignments: [] },
  // CR 616.1: regenerate vs shield — regułowo równoważne (oba „zamiast śmierci").
  { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' },
  // Stomping Slabs: jedna komenda (kolejność „jak w reveal"; permutacje nie
  // są enumerowane — ograniczenie enumeracji opisane w ofercie silnika).
  { type: 'resolve_reveal_order', playerId: 'p1', order: ['a', 'b'] },
  // Index (APC): jedna komenda (oryginalna kolejność; execute przyjmuje
  // dowolną permutację — patrz komentarz oferty silnika).
  { type: 'resolve_index_choice', playerId: 'p1', order: ['a'] },
  // Modalny trigger bez trybów z kandydatami: skip jest jedyną drogą (L48 —
  // inaczej deadlock „tylko kapituluj").
  { type: 'resolve_modal_choice', playerId: 'p1' },
];

for (const cmd of JEDNOWARIANTOWE) {
  test(`E2/D: ${cmd.type} ma jawne case — wybór nie trafia do telemetrii „niewycenione"`, () => {
    const bot = createHeuristicBot({ seed: 3 });
    const chosen = bot.chooseCommand(WIDOK(cmd), {});
    assert.equal(chosen.type, cmd.type, 'jedyna legalna komenda zostaje wybrana');
    assert.deepEqual(bot.unvaluedDecisions(), {},
      `${cmd.type} ma dedykowane case (nawet z wyceną 0) — default zarezerwowany dla nowych typów`);
  });
}
