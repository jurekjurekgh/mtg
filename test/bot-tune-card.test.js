import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import {
  DESCRIPTOR_PARAMS,
  cardDescriptors,
  paramsForDescriptors,
  decksContainingCard,
  hillClimbParams,
  tuneCard,
} from '../tools/tune-card.mjs';
import { HEURISTIC_PARAM_KEYS } from '../src/controllers/heuristic-params.js';

/**
 * B6 T4 — „tryb jednej karty". Testy używają WSTRZYKNIĘTEJ funkcji evaluate
 * (czysta, deterministyczna) — nie uruchamiają pełnego benchmarku, więc plik
 * jest szybki (tier fast, ADR 0019). Sprawdzają: wykrywanie deskryptorów,
 * mapowanie na parametry, zawężanie talii i determinizm hill-climbingu.
 */

test('deskryptory: stwór z surge daje creature + surge', () => {
  const def = createCardRegistry().get('jwar-isle-avenger');
  const d = cardDescriptors(def);
  assert.ok(d.includes('creature'));
  assert.ok(d.includes('surge'));
});

test('deskryptory: manifest sorcery daje spell + manifest', () => {
  const def = createCardRegistry().get('manifest-dread');
  const d = cardDescriptors(def);
  assert.ok(d.includes('spell'));
  assert.ok(d.includes('manifest'));
});

test('mapowanie: creature → parametry stwora (baza + agresja), surge → brak (jeszcze)', () => {
  const { keys, withoutParams } = paramsForDescriptors(['creature', 'surge']);
  assert.deepEqual(keys.sort(), [
    'attackEvasionBonus', 'attackOpenBoardBonus', 'attackThroughBonus',
    'creatureBase', 'creaturePowerWeight', 'creatureToughnessWeight',
  ]);
  assert.deepEqual(withoutParams, ['surge']); // uczciwie: surge nie ma jeszcze parametrów
});

test('mapowanie: wszystkie parametry w DESCRIPTOR_PARAMS istnieją w kontrakcie', () => {
  for (const keys of Object.values(DESCRIPTOR_PARAMS)) {
    for (const key of keys) assert.ok(HEURISTIC_PARAM_KEYS.includes(key), `nieznany parametr: ${key}`);
  }
});

test('zawężenie talii: dimir-guildgate jest w ravnice', () => {
  const decks = decksContainingCard('dimir-guildgate');
  assert.ok(decks.includes('ravnica'), `oczekiwano ravnica w ${JSON.stringify(decks)}`);
});

test('hillClimbParams: deterministyczny, poprawia funkcję celu', () => {
  // Sztuczna funkcja celu: optimum creatureBase = 80 (parabola). Tuner ma
  // wspiąć się z 70 w stronę 80 krokiem 5 (bez RNG, powtarzalnie).
  const evaluate = (params) => {
    const dist = Math.abs(params.creatureBase - 80);
    const rate = Math.max(0, 1 - dist / 100);
    // Kształt zgodny z runBenchmark: pary + unfinished=0.
    return {
      pairs: {
        'heuristic | random': { games: 10, unfinished: 0, wins: { heuristic: Math.round(rate * 10) } },
        'aggro | heuristic': { games: 10, unfinished: 0, wins: { heuristic: Math.round(rate * 10) } },
      },
    };
  };
  const run = () => hillClimbParams({ keys: ['creatureBase'], step: 5, rounds: 3, evaluate });
  const a = run();
  const b = run();
  assert.equal(a.params.creatureBase, b.params.creatureBase, 'wynik ma być deterministyczny');
  assert.ok(a.params.creatureBase > 70, `tuner powinien ruszyć w stronę optimum (${a.params.creatureBase})`);
  assert.ok(a.params.creatureBase <= 80);
});

test('tuneCard: karta bez parametrów zwraca uczciwą uwagę, nie strojenie', () => {
  // dimir-guildgate to Land — nie ma deskryptorów z parametrami.
  const result = tuneCard({ cardId: 'dimir-guildgate', evaluate: () => { throw new Error('nie powinno się liczyć'); } });
  assert.equal(result.tuned, null);
  assert.match(result.note, /Brak parametrów/);
});

test('tuneCard: nieznana karta rzuca czytelny błąd', () => {
  assert.throws(() => tuneCard({ cardId: 'nie-ma-takiej' }), /Nieznana karta/);
});

test('tuneCard: creature-owa karta stroi parametry bazy stwora (evaluate wstrzyknięty)', () => {
  let calls = 0;
  const evaluate = (params) => {
    calls += 1;
    const dist = Math.abs(params.creatureBase - 85);
    const rate = Math.max(0, 1 - dist / 100);
    return {
      pairs: {
        'heuristic | random': { games: 10, unfinished: 0, wins: { heuristic: Math.round(rate * 10) } },
        'aggro | heuristic': { games: 10, unfinished: 0, wins: { heuristic: Math.round(rate * 10) } },
      },
    };
  };
  const result = tuneCard({ cardId: 'razorfoot-griffin', descriptors: null, evaluate, rounds: 2, step: 5 });
  assert.ok(result.plan.tunableParams.includes('creatureBase'));
  assert.ok(calls > 1, 'evaluate powinno być wywołane wielokrotnie');
  assert.ok(result.tuned.params.creatureBase >= 70);
});

test('hillClimbParams: β>0 kieruje się PROXY, gdy win-rate jest płaski (T2)', () => {
  // Win-rate identyczny dla wszystkich wariantów (nasycenie), ale proxy rośnie
  // ku creatureBase=90. Z β=0 tuner nie ma czego szukać; z β>0 wspina się ku 90.
  const evaluate = (params) => {
    const proxy = Math.max(0, 1 - Math.abs(params.creatureBase - 90) / 100);
    return {
      pairs: {
        'heuristic | random': { games: 10, unfinished: 0, wins: { heuristic: 6 }, proxyMean: proxy },
        'aggro | heuristic': { games: 10, unfinished: 0, wins: { heuristic: 6 }, proxyMean: proxy },
      },
    };
  };
  const flat = hillClimbParams({ keys: ['creatureBase'], step: 5, rounds: 3, evaluate, proxyWeight: 0 });
  const guided = hillClimbParams({ keys: ['creatureBase'], step: 5, rounds: 3, evaluate, proxyWeight: 0.5 });
  assert.equal(flat.params.creatureBase, 70, 'β=0: płaski win-rate → brak ruchu');
  assert.ok(guided.params.creatureBase > 70, `β>0: proxy prowadzi ku 90 (${guided.params.creatureBase})`);
  assert.ok(guided.params.creatureBase <= 90);
});

test('tuneCard: proxyWeight jest przekazywane do hill-climbingu', () => {
  // Ten sam płaski win-rate + proxy jak wyżej — z β>0 wynik ma się ruszyć.
  const evaluate = (params) => {
    const proxy = Math.max(0, 1 - Math.abs(params.creatureBase - 90) / 100);
    return {
      pairs: {
        'heuristic | random': { games: 10, unfinished: 0, wins: { heuristic: 6 }, proxyMean: proxy },
        'aggro | heuristic': { games: 10, unfinished: 0, wins: { heuristic: 6 }, proxyMean: proxy },
      },
    };
  };
  const guided = tuneCard({ cardId: 'razorfoot-griffin', evaluate, rounds: 2, step: 5, proxyWeight: 0.5 });
  assert.ok(guided.tuned.params.creatureBase > 70, 'proxyWeight musi dotrzeć do hill-climbingu');
});
