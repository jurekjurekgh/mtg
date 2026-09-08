import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDetectors } from '../tools/table-tester/detectors.mjs';

// E1 planu 2026-09-07: detektor „akcja bez wyceny" w Żywym Testerze.
// Telemetria z mostka __mtgDebug.botUnvalued (typ → trafienia) zamienia się
// w zgłoszenia — pilnuje, by NOWE typy komend silnika nie rodziły się już
// niewycenione (wynik z kolejności ofert, antywzorzec L41).

test('detektor: każdy typ ≠ pass_priority dostaje osobne zgłoszenie', () => {
  const findings = runDetectors([], {
    botUnvalued: { resolve_optional_draw: 3, resolve_damage_target: 1, pass_priority: 40 },
  });
  const mine = findings.filter((f) => f.message.includes('bez dedykowanej wyceny'));
  assert.equal(mine.length, 2, `dwa zgłoszenia (pass pominięty): ${JSON.stringify(mine)}`);
  const typy = mine.map((f) => f.message).join('|');
  assert.ok(typy.includes('resolve_optional_draw'), 'nazywa typ komendy');
  assert.ok(typy.includes('×3'), 'niesie liczbę trafień');
  assert.ok(!typy.includes('pass_priority'), 'pass_priority wyłącznie informacyjnie');
  for (const f of mine) {
    assert.equal(f.category, 'info');
    assert.ok(f.message.includes('scoreCommand'), 'wskazuje miejsce naprawy');
  }
});

test('detektor: pusta telemetria i brak mostka = zero zgłoszeń', () => {
  assert.equal(runDetectors([], { botUnvalued: {} }).length, 0);
  assert.equal(runDetectors([], { botUnvalued: null }).length, 0);
  assert.equal(runDetectors([], {}).length, 0);
});

test('detektor: pasywny kształt (sortowanie wg liczby trafień malejąco)', () => {
  const findings = runDetectors([], {
    botUnvalued: { resolve_a: 1, resolve_b: 5 },
  });
  const mine = findings.filter((f) => f.message.includes('bez dedykowanej wyceny'));
  assert.deepEqual(mine.map((f) => f.evidence), ['NIEWYCENIONE: resolve_b×5', 'NIEWYCENIONE: resolve_a×1']);
});
