import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  parseAuditArgs, assertAuditCommand, assertAuditFinished, allChosenTargetsAbsent,
} from '../tools/scoring-audit-utils.mjs';

test('AUD154/F6: opcje bez liczby seedów zachowują domyślną dodatnią próbkę', () => {
  assert.equal(parseAuditArgs([], 2).seeds, 2);
  const parsed = parseAuditArgs(['--all', '--decks=all'], 2, ['--all', '--decks=all']);
  assert.equal(parsed.seeds, 2, 'dawne Number(--all) = NaN nie może dawać zera partii');
  assert.deepEqual([...parsed.flags], ['--all', '--decks=all']);
  assert.equal(parseAuditArgs(['--all', '3'], 2, ['--all']).seeds, 3);
});

test('AUD154/F6: pusta/nieskończona/niecałkowita próba i nieznane opcje są błędem', () => {
  for (const argv of [['0'], ['-1'], ['NaN'], ['Infinity'], ['1.5'], ['1', '2'], ['--literowka']]) {
    assert.throws(() => parseAuditArgs(argv, 2), undefined, argv.join(' '));
  }
});

for (const name of ['choice-space-audit', 'mulligan-audit', 'pay-census', 'unvalued-audit']) {
  test(`AUD154/F6: CLI scoring-${name} odrzuca 0 zamiast sukcesu bez pomiaru`, () => {
    const r = spawnSync(process.execPath, [`tools/scoring-${name}.mjs`, '0'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /dodatnią liczbą całkowitą/);
    assert.doesNotMatch(r.stdout, /WYNIK:.*POPRAWNE/);
  });
}

test('AUD154/F6: odrzucenie/brak komendy i niedokończona partia nie przechodzą na zielono', () => {
  assert.doesNotThrow(() => assertAuditCommand({ ok: true }, { type: 'pass_priority' }));
  assert.throws(() => assertAuditCommand({ ok: false, events: [{ reason: 'invalid' }] }, { type: 'pass_priority' }), /odrzucona komenda/);
  assert.throws(() => assertAuditCommand(undefined, undefined), /brak potwierdzenia/);
  assert.doesNotThrow(() => assertAuditFinished({ status: 'finished' }));
  assert.throws(() => assertAuditFinished({ status: 'active' }), /Niepełny pomiar/);
});

const view = (targets) => ({
  players: [{ id: 'p1' }, { id: 'p2' }],
  zones: {
    stack: [{ id: 'spell', targets }], battlefield: [{ id: 'creature' }],
    graveyard: [{ id: 'card' }], exile: [{ id: 'exiled-card' }],
  },
});

test('AUD154/F6: obecność celu obejmuje graczy, grób, exile i stos', () => {
  for (const id of ['p2', 'creature', 'card', 'exiled-card', 'spell']) {
    assert.equal(allChosenTargetsAbsent(view([id]), 'spell'), false, id);
  }
});

test('AUD154/F6: zero celów i częściowa utrata to nie utrata wszystkich wybranych', () => {
  for (const targets of [[], [null], ['missing', 'p2'], [null, 'card']]) {
    assert.equal(allChosenTargetsAbsent(view(targets), 'spell'), false);
  }
  assert.equal(allChosenTargetsAbsent(view(['missing', null]), 'spell'), true);
  assert.equal(allChosenTargetsAbsent(view(['missing']), 'unknown-spell'), false);
});
