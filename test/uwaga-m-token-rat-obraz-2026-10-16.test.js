// Uwaga M (właściciel, 2026-10-16): po rzuceniu Lab Rats na stole pojawia się
// obraz KARTY Lab Rats zamiast obrazu tokena Rat. Przyczyna: `token_rat` ma
// `imageUri` skopiowany z karty Lab Rats (ten sam identyfikator Scryfall
// 3132c128-…). Kafel tokena bierze obraz z definicji po `cardId`, więc
// pokazuje kartę. Kontrakt: token ma własny druk Scryfall tokena Rat
// (3b69ac36-…, komponent `token` w `all_parts` karty Lab Rats), jak w ADR 0010 §2a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { tileImageSources } from '../src/table/card-images.js';

const REGISTRY = createCardRegistry();
const RAT_TOKEN_PRINT = '3b69ac36-617d-4e55-a625-0e6f0d0dfbd3';

test('M/7: token Rat ma obraz tokena, nie obraz karty Lab Rats', () => {
  const rat = REGISTRY.get('token_rat');
  const lab = REGISTRY.get('lab-rats');
  assert.ok(rat?.imageUri, 'token_rat ma imageUri');
  assert.notEqual(rat.imageUri, lab.imageUri, 'imageUri tokena nie może być kopią obrazu karty Lab Rats');
  assert.match(rat.imageUri, new RegExp(RAT_TOKEN_PRINT), `imageUri tokena to druk Scryfall ${RAT_TOKEN_PRINT}`);
});

test('M/8: kafel tokena Rat na stole pokazuje obraz tokena', () => {
  const [src] = tileImageSources(REGISTRY.get('token_rat'));
  assert.ok(src, 'kafel tokena ma źródło obrazu');
  assert.match(src, new RegExp(RAT_TOKEN_PRINT), src);
  assert.doesNotMatch(src, /3132c128/, 'kafel nie pokazuje karty Lab Rats');
});
