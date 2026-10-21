// PMSSB-68 (amass) — audyt wyceny amass (CR 701.47) z MODELU STOŁU.
// Procedura: docs/PMSSB.md (metoda M429). Plan: docs/plans/PLAN_2026-10-20-pmssb68-amass.md.
// Pomiar PRZED: tools/pmssb68-amass-sonda.mjs (zapis: .arena/pmssb68-przed.txt):
//   Dunland (ETB amass 2): brak 73.4991 · armia 1/1 69.8991 · armia 3/3 69.8991
//   Toll (cast amass 1):   brak 59.0000 · armia 1/1 59.0000 · armia 3/3 59.0000
//
// Ten plik to piny:
//  (a) F1 — obecność armii zmienia wycenę i jest to ta sama miara co add_counter
//      (+1/+1 na 3/3 = counterHostValue; PMSSB-23). Uwaga: wcześniejsza hipoteza
//      „licznik na armii < nowe ciało” została OBALONA pomiarem (74 > 60) — skali
//      licznika nie zmieniamy w tej pętli (osobna rodzina, L41);
//  (b) F2 — rozmiar armii ma znaczenie: licznik na większym ciele jest wart więcej;
//  (c) F3/F4 (L41) — amass bez armii = token N/N w tej samej jednostce co `create_token`
//      (`tokenBodyValue` = 10·(2P+T)/3): ETB i czar liczą to samo;
//  (d) anty-over-fix (M429 c): najsłabszy realny wariant (brak armii, N=1) nie spada
//      poniżej dawnej wartości 9, a wybór czaru w stole mieszanym się nie odwraca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMana } from '../src/engine/resources.js';
import { playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { botTurn, putCard, putSynthCreature } from '../tools/pmssb63-batch68-sonda.mjs';
import { putArmy, scoreOf } from '../tools/pmssb68-amass-sonda.mjs';

/** Wynik najlepszej opcji o prefiksie `cmd` przy stole: bot p2, 6 many, karta w ręce, wróg 2/2. */
function scoreFor({ card, army = null, prefix }) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 6, { colors: ['B', 'R', 'G', 'W', 'U'] });
  putCard(state, 'x', card, 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  if (army) putArmy(state, 'army', army);
  const bot = createHeuristicBot({ seed: 68 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  return scoreOf(bot, prefix);
}

/** Pierwsza wybrana komenda przy stole z dwiema kartami amass w ręce (Dunland + Toll). */
function chosenWithBoth() {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 6, { colors: ['B', 'R', 'G', 'W', 'U'] });
  putCard(state, 'dun', 'dunland-crebain', 'p2', 'hand');
  putCard(state, 'toll', 'toll-of-the-invasion', 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  const bot = createHeuristicBot({ seed: 68 });
  return bot.chooseCommand(playerView(state, 'p2'), {});
}

const TOLL = { card: 'toll-of-the-invasion', prefix: 'cast_spell(x' };
const DUN = { card: 'dunland-crebain', prefix: 'cast_permanent(x)' };

test('F1: obecność armii zmienia wycenę Tolla; licznik na 3/3 = miara add_counter (74 = 50 + 24), brak = token 1/1 (60 = 50 + 10)', () => {
  // Pomiar PRZED: 59 / 59 / 59 (armia ignorowana). PO: brak 60.0, armia 3/3 74.0.
  const brak = scoreFor({ ...TOLL, army: null });
  const armia = scoreFor({ ...TOLL, army: { power: 3, toughness: 3 } });
  // PMSSB-77: presja wroga 2/2 przy życiu 20 = +0.6 na token 1/1 (brak armii).
  assert.ok(Math.abs(brak - 60.6) < 1e-3, `brak=${brak}`);
  assert.ok(Math.abs(armia - 74.0) < 1e-3, `armia=${armia}`);
  assert.notEqual(brak, armia);
});

test('F2: licznik amass na większej armii jest wart więcej (Dunland: armia 3/3 > armia 1/1)', () => {
  const mała = scoreFor({ ...DUN, army: { power: 1, toughness: 1 } });
  const duża = scoreFor({ ...DUN, army: { power: 3, toughness: 3 } });
  assert.ok(duża > mała, `1/1=${mała} 3/3=${duża}`);
});

test('F3/F4 (L41): Dunland bez armii = token 2/2 (tokenBodyValue 20) zamiast flat 6, po wadze cast_permanent ×0.9', () => {
  // Pomiar PRZED: 73.4991 = 68.0991 (reszta karty) + 5.4 (flat 6 × 0.9).
  // PO: reszta bez zmian + 18 (20 × 0.9) = 86.0991.
  const wynik = scoreFor({ ...DUN, army: null });
  // PMSSB-77: + presja 0.6 × 0.9 (cast_permanent) = 86.6391.
  assert.ok(Math.abs(wynik - 86.6391) < 1e-3, `wynik=${wynik}`);
});

test('F3/F4 (L41): Toll bez armii = token 1/1 (10·3/3 = 10), prawie jak dawne 9 (anty-over-fix)', () => {
  // Pomiar PRZED: 59.0 = 50.0 + 9 (6+3·1). PO: 50.0 + 10 = 60.0.
  const wynik = scoreFor({ ...TOLL, army: null });
  // PMSSB-77: + presja 0.6 (wróg 2/2, życie 20).
  assert.ok(Math.abs(wynik - 60.6) < 1e-3, `wynik=${wynik}`);
  assert.ok(wynik >= 59, 'najsłabszy realny wariant nie może spaść poniżej dawnej wartości');
});

test('(d) stół mieszany: Dunland (token 2/2) nadal wygrywa z Tollem (token 1/1)', () => {
  const c = chosenWithBoth();
  assert.equal(c.type, 'cast_permanent');
  assert.equal(c.objectId, 'dun');
});

test('(d) armia 1/1 nie zeruje wartości amass: Dunland z armią jest nadal dodatnio warty', () => {
  const armia = scoreFor({ ...DUN, army: { power: 1, toughness: 1 } });
  assert.ok(armia > 0, `armia=${armia}`);
});
