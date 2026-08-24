// M202/C — zgłoszenie właściciela (Springbloom Druid, ETB):
//
//   Springbloom Druid — trigger się rozstrzyga
//   Springbloom Druid: Nieprzyjaciel może poświęcić land
//   Springbloom Druid — trigger (wejście na pole bitwy)
//
//   „W logu i w Rozgrywce brakuje informacji czy i jaki ląd poświęcił Bot.”
//
// Zdarzenie `springbloom_resolved` niesie `sacrificedLandId`, ale opis go nie
// używał — gracz widział sam fakt poświęcenia bez nazwy lądu. Odmowa (`skipped`)
// była opisana wprost, więc brakowało połowy informacji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const NAME_BY_ID = new Map(REGISTRY.all().map((c) => [c.id, c.name]));
// nameOfObject odwzorowuje id obiektu na nazwę karty — tak jak w sesji
// (z pamięcią LKI dla obiektów, które zmieniły strefę).
const OBJECT_CARDS = new Map([['grave-7', 'basic-forest']]);
const helpers = {
  nameOf: (cardId) => NAME_BY_ID.get(cardId) ?? cardId,
  nameOfObject: (id) => NAME_BY_ID.get(OBJECT_CARDS.get(id) ?? id) ?? id,
};
const describe = (e) => describeGameEvent(e, helpers);

test('M202/C: log nazywa poświęcony land (Springbloom Druid)', () => {
  const text = describe({
    type: 'springbloom_resolved', controllerId: 'p2', cardId: 'springbloom-druid',
    sacrificedLandId: 'grave-7',
  });
  assert.match(text, /Springbloom Druid/, 'źródło z danych, nie zaszyta nazwa');
  assert.match(text, /poświęca Forest/, `log musi nazwać poświęcony land: ${text}`);
  assert.match(text, /szukanie do dwóch bazowych lądów/);
});

test('M202/C (anty-over-fix): odmowa poświęcenia nadal jest opisana wprost', () => {
  const text = describe({ type: 'springbloom_skipped', controllerId: 'p2', cardId: 'springbloom-druid' });
  assert.match(text, /nie poświęca landa/, `odmowa musi być widoczna: ${text}`);
});

test('M202/C (anty-over-fix): brak `sacrificedLandId` nie wypuszcza „undefined”', () => {
  const text = describe({ type: 'springbloom_resolved', controllerId: 'p2', cardId: 'springbloom-druid' });
  assert.doesNotMatch(text, /undefined/);
  assert.match(text, /poświęca land/, `fallback na ogólne „land”: ${text}`);
});
