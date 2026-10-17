// PMSSB-63 (batch 68) — audyt wyceny masowego zniszczenia (Austere Command) z MODELU STOŁU.
// Procedura: docs/PMSSB.md (metoda M429). Pomiar PRZED: tools/pmssb63-batch68-sonda.mjs
// (zapis: docs/audits/PMSSB63_BATCH68_2026-10-17.md). Ten plik to piny:
//  (a) decyzje na 9 scenariuszach stołu (kto ma więcej / silniejsze / TMC / życie / ręka),
//  (b) dokładne wyniki wyceny (pin liczbowy — składowe modelu są jawne),
//  (c) pokrętła ×0 sterują (każda składowa zmienia wynik o przewidziany przyrost),
//  (d) anty-over-fix: wymiana korzystna nadal jest rzucana (najsłabszy realny wariant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { HEURISTIC_PARAM_KEYS, DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';
import {
  SCENARIOS, runScenario, botTurn, putCard, putSynthCreature,
} from '../tools/pmssb63-batch68-sonda.mjs';

/** Maksimum wyniku rzutu Austere z trace (warianty `cast_spell(aus->)`). */
function bestAustereScore(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 68, params });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  const scores = (entry?.options ?? [])
    .filter((o) => o?.cmd?.startsWith('cast_spell(aus'))
    .map((o) => o.score);
  return Math.max(...scores);
}

function setupF3(state) {
  // Dwa stwory wroga 3/3 MV3 (atak 6) kontra jednego mojego 3/3 MV3; życie 3.
  putSynthCreature(state, 'f1', 'p1', { power: 3, toughness: 3, mv: 3 });
  putSynthCreature(state, 'f2', 'p1', { power: 3, toughness: 3, mv: 3 });
  putSynthCreature(state, 'm0', 'p2', { power: 3, toughness: 3, mv: 3 });
}

function austereState(life = 3, setup = setupF3) {
  const state = botTurn({ life });
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  setup(state);
  return state;
}

// ---------------------------------------------------------------------------
// (0) Parametry: rodzina zarejestrowana, wartości domyślne przemyślane
// ---------------------------------------------------------------------------

test('PMSSB-63/0 params: 6 kluczy massDestroy* w rejestrze, stare płaskie 75/90 usunięte', () => {
  const keys = ['massDestroyCardValue', 'massDestroyOwnMultiplier', 'massDestroyEvasionBonus',
    'massDestroyThreatWeight', 'massDestroyRebuildDiscount', 'massDestroyCastCost'];
  for (const key of keys) assert.ok(HEURISTIC_PARAM_KEYS.includes(key), `klucz ${key} na liście`);
  assert.equal(HEURISTIC_PARAM_KEYS.includes('massDestroyFoeFlat'), false);
  assert.equal(HEURISTIC_PARAM_KEYS.includes('massDestroyOwnFlat'), false);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.massDestroyCardValue, DEFAULT_HEURISTIC_PARAMS.drawCardValue,
    'wartość karty = drawCardValue (jedna skala karty w bocie)');
  assert.equal(DEFAULT_HEURISTIC_PARAMS.massDestroyCastCost, DEFAULT_HEURISTIC_PARAMS.massDestroyCardValue,
    'koszt zagranej karty = jej wartość');
});

// ---------------------------------------------------------------------------
// (a) Decyzje na scenariuszach stołu (pomiar PO = sonda)
// ---------------------------------------------------------------------------

for (const sc of SCENARIOS) {
  test(`PMSSB-63/a ${sc.id}: ${sc.opis.split('. ')[0]}`, () => {
    const r = runScenario(sc);
    assert.ok(r.ok, `oczekiwano zgodnie z opisem; bot: ${r.wybor}`);
  });
}

// ---------------------------------------------------------------------------
// (b) Pin liczbowy wyceny — składowe modelu są jawne
// ---------------------------------------------------------------------------

test('PMSSB-63/b H2 (życie 3): wynik rzutu = −6 (karta) + (2×18 − 21.6) + 20 (zagrożenie) = 28.4', () => {
  // wróg: 2× 3/3 MV3 → każdy: 6 + (2·3+3+3) = 18 → 36
  // ja:   1× 3/3 MV3 → 18 · 1.2 (własny mnożnik) · 1 (brak stworów w ręce) = 21.6
  // zagrożenie: nieblokowany atak przed 3 (6 − blok 3), po 0 → zabrane 3/3 życia = 1 → ×20
  const score = bestAustereScore(austereState(3));
  assert.ok(Math.abs(score - 28.4) < 1e-9, `wynik ${score}`);
});

test('PMSSB-63/b rebuild: 3 stworzenia-karty w mojej ręce zmniejszają moją stratę (×0.7)', () => {
  const state = austereState(3);
  for (let i = 0; i < 3; i += 1) {
    addObject(state, {
      id: `h${i}`, instanceId: `i-h${i}`, cardId: `synth-h${i}`, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
      kind: 'creature', types: ['Creature'], subtypes: [], power: 2, toughness: 2, manaCost: 2,
      keywords: [], abilities: [], colors: [], spell: null,
    });
  }
  // 36 − 18·1.2·0.7 + 20 − 6 = 34.88
  const score = bestAustereScore(state);
  assert.ok(Math.abs(score - 34.88) < 1e-9, `wynik z odbudową ${score}`);
});

// ---------------------------------------------------------------------------
// (c) Pokrętła ×0 sterują — każda składowa zmienia wynik o przewidziany przyrost
// ---------------------------------------------------------------------------

test('PMSSB-63/c pokrętło massDestroyThreatWeight ×0 zdejmuje dokładnie składnik zagrożenia (20)', () => {
  const base = bestAustereScore(austereState(3));
  const off = bestAustereScore(austereState(3), { massDestroyThreatWeight: 0 });
  assert.ok(Math.abs((base - off) - 20) < 1e-9, `różnica ${base - off}`);
});

test('PMSSB-63/c pokrętło massDestroyCastCost ×0 podnosi wynik o 6 (koszt karty znika)', () => {
  const base = bestAustereScore(austereState(3));
  const off = bestAustereScore(austereState(3), { massDestroyCastCost: 0 });
  assert.ok(Math.abs((off - base) - 6) < 1e-9, `różnica ${off - base}`);
});

test('PMSSB-63/c pokrętło massDestroyOwnMultiplier 1.0 zamiast 1.2 zmienia tylko stratę własną', () => {
  const base = bestAustereScore(austereState(3));
  const flat = bestAustereScore(austereState(3), { massDestroyOwnMultiplier: 1 });
  // strata własna 21.6 → 18: +3.6
  assert.ok(Math.abs((flat - base) - 3.6) < 1e-9, `różnica ${flat - base}`);
});

test('PMSSB-63/c pokrętło massDestroyCardValue ×0: sama materialność nadal liczy (ten sam znak w H2)', () => {
  const state = austereState(3);
  const base = bestAustereScore(state);
  const off = bestAustereScore(austereState(3), { massDestroyCardValue: 0 });
  // karta wroga −6·2 i karta własna −6·1.2: zmiana = −(2·6) + 1.2·6 = −4.8
  assert.ok(Math.abs((off - base) - (-4.8)) < 1e-9, `różnica ${off - base}`);
});

// ---------------------------------------------------------------------------
// (d) Anty-over-fix — wymiana korzystna jest rzucana, a pusty czar nie
// ---------------------------------------------------------------------------

test('PMSSB-63/d anty-over-fix: korzystna wymiana (E2, 2 artefakty wroga kontra mój MV1) nadal jest rzucana', () => {
  const e2 = SCENARIOS.find((s) => s.id.startsWith('E2'));
  assert.equal(runScenario(e2).ok, true);
});

test('PMSSB-63/d anty-over-fix: masowy czar bez trafień nadal = −70 (pusty filtr, nie model)', () => {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  // Brak permanentów pasujących do żadnej pary (same stwory MV≤3 na stole wroga są trafione,
  // więc stół pusty): każdy tryb pusty.
  const score = bestAustereScore(state);
  assert.equal(score, -70);
});
