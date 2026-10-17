// Pętla jakości 2026-10-15c — Żywy Tester, partia 67006 (the-edge × mirrodin-brg):
// modal „Rozgrywka\" pokazał graczowi „Ambulatory Edifice — trigger (reflexive_pay)\".
// Detektor Osi 2 (`detectRawText`) MILCZAŁ — a L27 mówi, że każda klasa znaleziona
// ręcznie kończy się detektorem.
//
// Root cause (klasa): `SNAKE_CASE_EVENT` wymagał DWÓCH podkreślników (`{2,}`) —
// tak było celowo dla kodów z M348/B5, ale slugi z JEDNYM podkreślnikiem
// (`reflexive_pay`, `illegal_land`) przechodziły. Zostają dwa rodzaje:
//   • przeciek (slug zdarzenia/efektu) → MUSI być zgłoszony;
//   • celowy kod techniczny w nawiasie przy odrzuceniu (`rejectionReasonLabel`:
//     „ruch niezgodny z zasadami (illegal_ability:…)\") → NIE zgłaszamy (decyzja
//     projektowa: kod zostaje dla zgłoszeń błędów, L6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRawText } from '../tools/table-tester/detectors.mjs';

test('detektor: jednopodkreślnikowy slug zdarzenia w linii modala gracza jest zgłaszany', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • Ambulatory Edifice — trigger (reflexive_pay)',
  ]);
  assert.equal(found.length, 1, `reflexive_pay musi być zgłoszony: ${JSON.stringify(found)}`);
  assert.equal(found[0].category, 'info');
  assert.match(found[0].message, /reflexive_pay/);
});

test('detektor: slug w linii LOG: też jest zgłaszany', () => {
  const found = detectRawText(['  LOG: Clone Shell — trigger (enchanted_permanent_tapped) ⏎ Ty: życie 3 → 2']);
  assert.ok(found.length >= 1);
});

test('detektor (anty-over-fix): celowy kod w nawiasie przy odrzuceniu NIE jest zgłaszany', () => {
  const found = detectRawText([
    '  LOG: Ruch odrzucony: ruch niezgodny z zasadami (illegal_ability:Obiekt jest już tapped)',
    '  LOG: Ruch odrzucony: ruch niezgodny z zasadami (illegal_land:Nielegalny land drop)',
  ]);
  assert.deepEqual(found, [], `kod techniczny odrzucenia jest celowy: ${JSON.stringify(found)}`);
});

test('detektor (anty-over-fix): zwykły polski/angielski tekst bez podkreślników jest czysty', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • Nieprzyjaciel: Forest — biblioteka → pole bitwy',
    '  [ROZGRYWKA]   • Battlefield Butcher zadaje 1 obrażenie (Ty)',
  ]);
  // Pierwsza linia ma „biblioteka → pole bitwy\" — to osobna reguła stref (RAW_IDENTIFIER
  // widzi tylko angielskie nazwy stref), więc oczekujemy zera zgłoszeń o SLUGU.
  assert.equal(found.filter((f) => /identyfikator/.test(f.message)).length, 0);
});
