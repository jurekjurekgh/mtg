// O-5 z audytu PR #176 (domknięcie w sesji 2026-10-27c, PR #177).
//
// `tools/table-tester/run-game.mjs` logował klikniętą akcję jako
// `pick.t.slice(0, 110)`. Od PR #177 etykiety ofert niosą na KOŃCU ostrzeżenie
// stanu („… — ponowna aktywacja nic nie zmieni, a koszt (tapnięcie)
// przepadnie”), więc ciche ucięcie wypadało dokładnie w ostrzeżeniu: transkrypt
// pokazywał zwykłą akcję, choć gracz widział w panelu ostrzeżenie. Weryfikacja
// O-1 wymagała wtedy doraźnego podniesienia limitu (L27: najpierw podejrzewaj
// narzędzie).
//
// Naprawa: wspólny helper `actionLabelForLog` (jawne ucięcie wielokropkiem,
// zwinięte białe znaki) + limit dobrany do realnych etykiet panelu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTION_LABEL_LOG_CAP,
  ACTION_LABEL_TRUNCATION_MARK,
  actionLabelForLog,
} from '../tools/table-tester/labels.mjs';

const RUN_GAME = readFileSync(new URL('../tools/table-tester/run-game.mjs', import.meta.url), 'utf8');

/** Etykieta aktywacji z ostrzeżeniem stanu (O-1) — realny kształt z panelu. */
const SADDLE_LABEL = 'Osiodłaj: Trained Arynx (tapnij stwory o łącznej sile 2) — '
  + 'jest już osiodłany do końca tury — ponowna aktywacja nic nie zmieni, '
  + 'a koszt (tapnięcie) przepadnie';

test('O-5: etykieta z ostrzeżeniem stanu trafia do logu w CAŁOŚCI', () => {
  assert.ok(SADDLE_LABEL.length > 110, 'to dłuższe niż dawny limit 110 znaków — to był cały problem');
  assert.equal(actionLabelForLog(SADDLE_LABEL), SADDLE_LABEL,
    'ostrzeżenie na końcu etykiety nie może zostać ucięte');
});

test('O-5: ucięcie powyżej limitu jest JAWNE (wielokropek), nie ciche', () => {
  const long = 'Wybierz: Cel (' + 'bardzo długa nazwa celu, '.repeat(40) + ')';
  const logged = actionLabelForLog(long);
  assert.equal(logged.length, ACTION_LABEL_LOG_CAP, 'log trzyma się limitu');
  assert.ok(logged.endsWith(ACTION_LABEL_TRUNCATION_MARK),
    `ucięcie musi być widoczne w transkrypcie (dostałem: …${logged.slice(-24)})`);
  assert.ok(!logged.includes('\n'), 'jedna linia logu');
});

test('O-5: białe znaki zwinięte — etykieta panelu bywa wielolinijkowa', () => {
  assert.equal(actionLabelForLog('  Rzuć:\n  Shock\t(1 mana)  '), 'Rzuć: Shock (1 mana)');
});

test('O-5: run-game.mjs loguje etykiety przez helper (koniec cichych `slice`)', () => {
  assert.match(RUN_GAME, /import \{ actionLabelForLog \} from '\.\/labels\.mjs';/);
  assert.match(RUN_GAME, /logL\(`  >> \$\{actionLabelForLog\(pick\.t\)\}`\);/);
  assert.doesNotMatch(RUN_GAME, /pick\.t\.slice\(0, 110\)/,
    'stary cichy limit nie może wrócić — to on chował ostrzeżenia');
});
