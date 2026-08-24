// M201/N1b (zgłoszenie właściciela 2026-08-23, artefakt z Pages):
// „Klikam »Zatrzymaj rękę 7 kart«. Nic się nie dzieje. Klikam drugi raz:
//  mulligan_not_your_decision. W »Twoje działania« nie ma żadnych opcji.”
//
// Przyczyna pierwotna: debug `process.env` w bocie (M201/N1) — w przeglądarce
// `process` nie istnieje, więc pętla bota rzucała ReferenceError. Ale objaw
// był NIEDIAGNOZOWALNY: wyjątek leciał przez `session.apply` do handlera
// kliknięcia, więc render się nie wykonywał, log milczał, a stan gry był już
// po komendzie gracza — stół wyglądał na zawieszony.
//
// To druga, niezależna wada (klasa L24: skutek bez śladu nie istnieje dla
// gracza). KAŻDY wyjątek w pętli bota — dziś i w przyszłości — musi:
//  1. zostać wypisany w logu partii (gracz wie, że coś padło),
//  2. nie wynosić się poza `apply` (UI renderuje dalej, stół żyje),
//  3. być odróżnialny maszynowo (`internalError`), żeby UI mógł pokazać
//     komunikat zamiast udawać, że klik nic nie znaczył.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

/** Bot, który wywraca się dokładnie tak, jak N1 w przeglądarce. */
function explodingBotFactory() {
  return {
    chooseCommand() { throw new ReferenceError('process is not defined'); },
  };
}

function sessionWithBrokenBot() {
  const decks = new Map([
    [HUMAN_ID, [...Array(12).fill('basic-swamp'), ...Array(8).fill('reassembling-skeleton')]],
    [BOT_ID, [...Array(12).fill('basic-mountain'), ...Array(8).fill('goblin-piker')]],
  ]);
  return createSession({ seed: 7, registry: REGISTRY, decks, pauseOnBotMoves: true, botFactory: explodingBotFactory });
}

test('M201/N1b: wyjątek w pętli bota NIE wychodzi poza apply (stół nie zamiera)', () => {
  const session = sessionWithBrokenBot();
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
  assert.ok(keep, 'oferta „Zatrzymaj tę rękę”');
  let result;
  assert.doesNotThrow(() => { result = session.apply(keep); },
    'klik gracza nie może przerwać renderu wyjątkiem — UI traci wtedy całą pętlę');
  assert.equal(typeof result?.internalError, 'string', 'wynik niesie maszynowo rozpoznawalny błąd');
  assert.match(result.internalError, /process is not defined/, 'komunikat zachowuje przyczynę');
});

test('M201/N1b: awaria zostaje w logu partii (L24 — skutek bez śladu nie istnieje)', () => {
  const session = sessionWithBrokenBot();
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
  session.apply(keep);
  const entry = session.log.find((line) => /błąd wewnętrzny/i.test(line.text ?? ''));
  assert.ok(entry, `log musi nazwać awarię; zapisano: ${JSON.stringify(session.log.slice(-3))}`);
});

test('M201/N1b: po awarii sesja nadal odpowiada na widok (bez zombie-stanu)', () => {
  const session = sessionWithBrokenBot();
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
  session.apply(keep);
  assert.doesNotThrow(() => session.view(), 'widok po awarii musi się policzyć');
  assert.equal(session.botPausePending, false, 'pauza bota nie może zostać wisząca po wyjątku');
});

test('M201/N1b: anty-over-fix — sprawny bot działa bez pola internalError', () => {
  const decks = new Map([
    [HUMAN_ID, [...Array(12).fill('basic-swamp'), ...Array(8).fill('reassembling-skeleton')]],
    [BOT_ID, [...Array(12).fill('basic-mountain'), ...Array(8).fill('goblin-piker')]],
  ]);
  const session = createSession({ seed: 7, registry: REGISTRY, decks, pauseOnBotMoves: true });
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
  const result = session.apply(keep);
  assert.equal(result.ok, true);
  assert.equal(result.internalError, undefined, 'zdrowa partia nie zgłasza awarii');
  assert.ok(!session.log.some((line) => /błąd wewnętrzny/i.test(line.text ?? '')), 'log bez fałszywego alarmu');
});
