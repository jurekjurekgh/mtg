/**
 * M419 (2026-09-23, decyzja właściciela): status wpisu w katalogu mówi WPROST,
 * czym wpis jest. Zniknęła wspólna etykieta „limited”, która znaczyła naraz
 * „karta niedokończona” i „wpis, którego nie wkłada się do talii” — a przez to
 * sugerowała luki w kartach, których w katalogu nie ma (ADR 0022).
 *
 * Słownik: `supported` (pełna karta, taliowalna), `token` (token tworzony przez
 * karty/mechaniki), `back` (tylna strona karty dwustronnej — w talii jest tylko
 * przód, CR 712.8), a `unsupported`/`in-development` są zarezerwowane na prace
 * w toku (w katalogu nie występują).
 *
 * Ten strażnik pilnuje trzech rzeczy naraz:
 *  1. słownik i dane katalogu nie mają żadnej innej wartości (w tym „limited”);
 *  2. `token`/`back` wolno nadać wyłącznie temu, czym wpis jest naprawdę
 *     (token_*; cel `transformTo` karty `supported`) — nie da się etykietą
 *     ukryć niekartowego wpisu ani zdegradować prawdziwej karty;
 *  3. żadnego tokenu ani tyłu nie da się włożyć do talii.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { SUPPORT_STATUS, assertDeckSupported } from '../src/cards/registry.js';

const REGISTRY = createCardRegistry();
const ALL = REGISTRY.all();
const IMIONA_STATUSOW = ['supported', 'token', 'back'];

test('M419/A: słownik statusów nie zna „limited” ani innych etykiet zbiorczych', () => {
  assert.deepEqual([...SUPPORT_STATUS].sort(),
    ['back', 'in-development', 'supported', 'token', 'unsupported'],
    'dozwolone statusy: supported/token/back + rezerwowe unsupported/in-development');
  assert.equal(SUPPORT_STATUS.includes('limited'), false, '„limited” nie wraca do słownika');
  assert.equal(SUPPORT_STATUS.includes('special'), false, '„special” nie wchodzi zamiast token/back');
});

test('M419/B: każdy wpis katalogu ma status supported, token albo back', () => {
  const obce = ALL
    .filter((card) => !IMIONA_STATUSOW.includes(card.support?.status))
    .map((card) => `${card.id}: ${card.support?.status}`);
  assert.deepEqual(obce, [], 'status spoza supported/token/back');
  const tokeny = ALL.filter((c) => c.support.status === 'token').length;
  const tyly = ALL.filter((c) => c.support.status === 'back').length;
  const karty = ALL.filter((c) => c.support.status === 'supported').length;
  // Batch 59 (Slithering Cryptid): +token_mutagen (predefined token TMT) → 44.
  assert.equal(tokeny, 44, 'tyle tokenów zna katalog (stan po M419 + Batch 59)');
  assert.equal(tyly, 8, 'tyle tylnych stron DFC zna katalog (stan po M419)');
  assert.equal(karty + tokeny + tyly, ALL.length, 'każdy wpis policzony dokładnie raz');
});

test('M419/C: `token` tylko dla tokenów, `back` tylko dla tylnej strony pary transform', () => {
  for (const card of ALL) {
    if (card.support.status === 'token') {
      assert.ok(card.id.startsWith('token_'),
        `${card.id}: token_* to jedyne wpisy ze statusem token`);
      assert.equal(card.artId, null, `${card.id}: token nie pochodzi z arkusza kolekcji`);
      assert.equal(card.plan, null, `${card.id}: token nie ma planu talii`);
      continue;
    }
    if (card.support.status === 'back') {
      const front = ALL.find((f) => f.transformTo === card.id && f.support.status === 'supported');
      assert.ok(front, `${card.id}: status back wymaga karty supported, która w nią transformuje`);
      const notTokens = card.id.startsWith('token_');
      assert.equal(notTokens, false, `${card.id}: token nie jest tyłem karty dwustronnej`);
    }
  }
});

test('M419/D: wpis z arkusza kolekcji (artId + plan) nie jest tokenem', () => {
  const zArkusza = ALL.filter((c) => c.artId != null && c.plan != null);
  const nieKarty = zArkusza.filter((c) => !['supported', 'back'].includes(c.support.status));
  assert.deepEqual(nieKarty.map((c) => c.id), [],
    'pozycja z arkusza jest taliowalna (supported) albo tyłem DFC (back)');
  assert.equal(zArkusza.filter((c) => c.support.status === 'back').length, 8,
    'tylko 8 tylnych stron DFC pochodzi z arkusza');
});

test('M419/E: token i tył nie wchodzą do talii (bramka taliowalności)', () => {
  for (const card of ALL.filter((c) => c.support.status !== 'supported')) {
    assert.throws(() => assertDeckSupported([card.id], REGISTRY), /nieobsługiwane/,
      `${card.id} (${card.support.status}) nie może wejść do talii`);
  }
});

test('M419/F: słowo „limited” zniknęło ze źródeł katalogu (nie wróci cicho)', () => {
  for (const plik of ['src/cards/card-data.js', 'src/cards/registry.js', 'src/cards/deck-text.js']) {
    const tekst = fs.readFileSync(plik, 'utf8');
    assert.equal(tekst.includes('limited'), false, `${plik}: znaleziono „limited”`);
  }
});
