/**
 * AUDYT BOTA tura 5 (PR #93): wybór lądu był niescoringowany.
 *
 * Zgłoszenie z pomiaru, nie z kodu: `tools/bot-tie-audit.mjs` na 12 partiach
 * (5293 decyzje) policzył 30,3% remisów na maksimum wśród decyzji
 * z alternatywami, a `play_land` był drugi co wielkość (75 remisów). Przyczyna:
 * `scoreCommand` dla `play_land` zwracał PŁASKIE 90 — przy dwóch ziemiach w
 * ręce decyzja o manabazie zapadała w kolejności `legalCommands` (i w rng puli
 * top-3), czyli arbitralnie. Niniejszy plik zamyka tę dziurę po stronie wyceny
 * i pilnuje dwóch rzeczy naraz:
 *   1) ląd użytkowy (pokrywa zapotrzebowanie, daje pierwszy kolor, jest
 *      natychmiast gotowy) ma WYŻSZY wynik niż ląd gorszy — bot nie może
 *      polegać na kolejności listy;
 *   2) lądy zamienne (identyczne dane decyzyjne) nadal mają wynik RÓWNY —
 *      rozstrzyganie ich na siłę byłoby kłamstwem wyceny (L5: strażnik mierzy
 *      regułę, nie szum; L1: test musi wynikać z właściwości, nie z kodu).
 * Dodatkowo bramka na grach: żaden remis `play_land` nie może mieć różnych
 * WEJŚĆ delty przy równym wyniku (to łapie np. sufit klampy gniotący pokrycie
 * 2 i 3 pipów do jednej liczby).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { audytRemisow } from '../tools/bot-tie-audit.mjs';

function sto({ reka = [], pola = [] } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const [id, cardId, kolor] of pola) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, cardName: cardId, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', manaCost: 0, subtypes: [], types: ['Basic', 'Land'],
      abilities: [], keywords: [], colors: kolor ? [kolor] : [],
    });
  }
  for (const [id, cardId, kind, extras = {}] of reka) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      kind, manaCost: 0, subtypes: [], types: [], abilities: [], keywords: [], colors: [],
      ...extras,
    });
  }
  return state;
}

const decyzja = (state, seed = 3) => {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  const wpis = bot.trace().at(-1);
  return { cmd, wpis, dla: (prefiks) => wpis.options.filter((o) => o.cmd.startsWith(prefiks)) };
};

test('lądy: pokrycie zapotrzebowania rozbija remis — źle dobrany ląd NIE może być brany „bo pierwszy na liście”', () => {
  // Ręka: najpierw góra (kolor już zapewniony przez pole), potem las, do tego
  // stworzenie za {1}{G}. Kolejność w ręce jest taka, że bot bez wyceny bierze
  // górę; jedynym powodem, by wziął las, jest porównanie danych.
  const state = sto({
    pola: [['m1', 'basic-mountain', 'R']],
    reka: [['land-m', 'basic-mountain', 'land'], ['land-f', 'basic-forest', 'land'],
      ['kreg', 'highland-game', 'creature', { power: 2, toughness: 1, types: ['Creature'] }]],
  });
  const { cmd, wpis, dla } = decyzja(state);
  const gora = dla('play_land(').find((o) => o.cmd.includes('basic-mountain'));
  const las = dla('play_land(').find((o) => o.cmd.includes('basic-forest'));
  assert.ok(gora && las, 'oba lądy są w ofercie (sprawdź harness, nie bota)');
  assert.ok(las.score > gora.score,
    `las pokrywa {G} stworzenia, góra nie: ${las.cmd}=${las.score} vs ${gora.cmd}=${gora.score}`);
  assert.equal(cmd.type, 'play_land');
  assert.ok(wpis.chosen.includes('basic-forest'),
    `wybór musi wynikać z wyceny, nie z pozycji na liście: ${wpis.chosen}`);
});

test('lądy zamienne (dwa lasy, brak zapotrzebowania) POZOSTAJĄ w remisie', () => {
  const state = sto({
    reka: [['l1', 'basic-forest', 'land'], ['l2', 'basic-forest', 'land']],
  });
  const { wpis, dla } = decyzja(state);
  const oba = dla('play_land(');
  assert.equal(oba.length, 2, 'dwa lądy w ofercie');
  assert.equal(oba[0].score, oba[1].score,
    `identyczne dane ⇒ identyczny wynik (rozsądek, nie sztuczny tie-breaker): ${JSON.stringify(oba)}`);
  assert.ok(wpis.tie, 'remis jest ogłoszony w śladzie z projekcją danych');
  const sygnatury = wpis.tie.map((t) => JSON.stringify(t.proj));
  assert.equal(new Set(sygnatury).size, 1, `projekcje te same: ${sygnatury.join(' vs ')}`);
});

test('lądy: wejdzie tapnięty = mana dopiero w następnej turze, więc przegrywa z zamiennikiem', () => {
  // Fertile Thicket wchodzi tapnięty, las — nie; żaden nie jest potrzebny do
  // czegokolwiek w tej turze, więc decyduje wyłącznie ta jedna różnica.
  const state = sto({
    pola: [['m1', 'basic-mountain', 'R']],
    reka: [['thicket', 'fertile-thicket', 'land'], ['las', 'basic-forest', 'land']],
  });
  const { cmd, wpis, dla } = decyzja(state);
  const thicket = dla('play_land(').find((o) => o.cmd.includes('fertile-thicket'));
  const las = dla('play_land(').find((o) => o.cmd.includes('basic-forest'));
  assert.ok(thicket && las, 'oba warianty w ofercie');
  assert.ok(las.score > thicket.score, `entersTapped karane: ${las.score} vs ${thicket.score}`);
  assert.ok(wpis.chosen.includes('basic-forest'), `bot bierze gotowy ląd: ${wpis.chosen}`);
  assert.equal(cmd.type, 'play_land');
});

test('śladowi wystarczy nazwa typu decyzji — wariant musi być w śladzie (kontrakt audytu)', () => {
  const state = sto({ reka: [['l1', 'basic-forest', 'land']] });
  const { wpis } = decyzja(state);
  assert.match(wpis.chosen, /^play_land\(l1:basic-forest\)$/,
    'ślad niesie id obiektu i kartę — na tym trzyma się klasyfikacja remisów');
  assert.equal(wpis.tie, undefined, 'decyzja jednowariantowa nie ma „tie”');
});

test('bramka na grach: remis play_land tylko przy równych wejściach wyceny', () => {
  // Pary talii spoza próbki benchmarku; 2 partie wystarczają, by wejść w setki
  // decyzji, a trzymają test w szybkim tierze (ADR 0019).
  const { global, rows } = audytRemisow({
    pary: [['ravnica', 'innistrad-wu'], ['wiedzmin', 'tarkir-bg'], ['srodziemie', 'theros']],
    gry: 1,
  });
  const lad = rows.find((r) => r.kind === 'play_land');
  assert.ok(lad, 'w audycie są decyzje play_land');
  assert.ok(lad.tie_top > 0,
    'test nie może być próżniowy: remisy między lądami muszą w ogóle występować');
  assert.equal(lad.rozroznialne, 0,
    `remisy z różnymi wejściami delty (przeoczenie wyceny): ${lad.przyklady.filter((p) => typeof p === 'string').join('\n')}`);
  assert.ok(lad.bezDanych === 0, 'play_land ma zdefiniowaną projekcję — brak danych = regresja śladu');
  assert.equal(global.gry, 3, 'trzy pary po jednej partii (obie strony w jednej rozgrywce)');
});
