import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEventContracts, auditBattlefieldDeletions, formatViolations, collectEmitters,
  CONTRACT_EXCEPTIONS,
} from '../tools/event-contract-audit.mjs';

/**
 * M273 (odznaka PLATYNOWA, ADR 0027) — strażnik KLASY, nie pojedynczego błędu.
 *
 * Cztery poprzednie odznaki naprawiły 25 błędów, z czego 10 należało do
 * jednego wzorca (L107): ścieżka omija choke point albo gubi pole zdarzenia,
 * którego oczekuje konsument. Audyt wzrokowy tej klasy nie nadąża — emiterów
 * jednego zdarzenia bywa kilkanaście.
 *
 * Ten test zamyka drogę powstawania takich błędów: nowa ścieżka, która zgubi
 * pole niesione przez większość emiterów, NIE PRZEJDZIE `npm test`.
 */

test('kontrakty zdarzeń: żaden emiter nie gubi pola wymaganego przez konsumentów', () => {
  const violations = auditEventContracts();
  assert.equal(
    violations.length, 0,
    'Wykryto rozjazd ładunków zdarzeń — konsument (log stołu, triggery, bot) '
    + 'dostanie `undefined` z tych ścieżek:\n' + formatViolations(violations)
    + '\n\nNapraw ścieżkę albo — jeśli brak pola jest ŚWIADOMY — dopisz wpis '
    + 'z uzasadnieniem do CONTRACT_EXCEPTIONS w tools/event-contract-audit.mjs '
    + '(ADR 0027 pkt 3: wyjątek bez powodu jest naruszeniem).',
  );
});

test('każdy wyjątek ma niepuste uzasadnienie (ADR 0027 pkt 3)', () => {
  for (const [key, reason] of Object.entries(CONTRACT_EXCEPTIONS)) {
    assert.match(key, /^[a-z_]+\.[a-zA-Z_$][\w$]*$/, `zły klucz wyjątku: ${key}`);
    assert.ok(
      typeof reason === 'string' && reason.trim().length >= 30,
      `Wyjątek ${key} nie ma sensownego uzasadnienia — ADR 0027 wymaga POWODU, `
      + 'nie samego wyciszenia.',
    );
  }
});

test('parser nie gubi pól stojących za komentarzem', () => {
  // Regresja z budowy narzędzia: `//` zjadał pole zaraz za sobą, przez co
  // analizator zgłaszał fałszywy brak `fromId` w poprawnym emiterze.
  const zrodlo = `state.events.push(event('probny_typ', {
    // komentarz opisujący kontrakt
    fromId: a, objectId: b, toZone: c,
  }));`;
  const [emiter] = collectEmitters(zrodlo, 'test.js');
  assert.deepEqual([...emiter.fields].sort(), ['fromId', 'objectId', 'toZone']);
});

test('parser radzi sobie z polami zagnieżdżonymi i rozwinięciem', () => {
  const zrodlo = `state.events.push(event('probny_typ', {
    ...baza, objectId: x, meta: { a: 1, b: [2, 3] }, last: true,
  }));`;
  const [emiter] = collectEmitters(zrodlo, 'test.js');
  // Pola zagnieżdżone (a, b) NIE mogą wyciec na poziom kontraktu.
  assert.deepEqual([...emiter.fields].sort(), ['baza', 'last', 'meta', 'objectId']);
});

test('choke point stref: kasowanie obiektu z pola bitwy przechodzi przez removeFromCombat', () => {
  // Drugi wymiar analizatora (błąd #25): ścieżka mutująca `state.zones`
  // wprost omija reguły choke pointu — m.in. wyjście z walki (CR 506.4).
  const violations = auditBattlefieldDeletions();
  assert.equal(
    violations.length, 0,
    'Obiekt kasowany z pola bitwy bez removeFromCombat — w state.combat zostanie '
    + 'wiszące id nieistniejącego obiektu:\n'
    + violations.map((v) => `    ${v.file}:${v.line} (delete ${v.objectRef})`).join('\n'),
  );
});
