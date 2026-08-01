import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_MODE, cardImageSources, detectImageMode, imageFileName, localImagePath, scryfallImageUrl } from '../src/table/card-images.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const razorback = createCardRegistry().get('syn-razorback');

test('nazwa pliku ilustracji jest stabilnym slugiem', () => {
  assert.equal(imageFileName('Synthetic Razorback'), 'synthetic_razorback');
  assert.equal(imageFileName("Jace, the Mind Sculptor"), 'jace_the_mind_sculptor');
  assert.equal(imageFileName('  Fire / Ice  '), 'fire_ice');
  assert.throws(() => imageFileName(''), TypeError);
});

test('ścieżka lokalna uwzględnia zestaw i slug nazwy', () => {
  assert.equal(localImagePath(razorback), 'img/SYNTH/synthetic_razorback.jpg');
  assert.throws(() => localImagePath({ name: 'Bez setu' }), TypeError);
});

test('adres Scryfall koduje nazwę i prosi o wersję obrazu', () => {
  const url = scryfallImageUrl(razorback);
  assert.match(url, /^https:\/\/api\.scryfall\.com\/cards\/named\?exact=/);
  assert.match(url, /exact=Synthetic%20Razorback/);
  assert.match(url, /format=image&version=normal/);
  assert.match(scryfallImageUrl(razorback, { version: 'art_crop' }), /version=art_crop/);
});

test('kolejność kandydatów zależy od trybu, ale zawiera te same adresy', () => {
  const local = cardImageSources(razorback, { mode: IMAGE_MODE.localFirst });
  const remote = cardImageSources(razorback, { mode: IMAGE_MODE.remoteFirst });
  assert.equal(local[0], 'img/SYNTH/synthetic_razorback.jpg');
  assert.match(local[1], /^https:\/\/api\.scryfall\.com/);
  assert.deepEqual([...remote].sort(), [...local].sort());
  assert.equal(remote[0], local[1]);
});

test('tryb wykrywany po protokole strony', () => {
  assert.equal(detectImageMode('file:'), IMAGE_MODE.localFirst);
  assert.equal(detectImageMode('https:'), IMAGE_MODE.remoteFirst);
  assert.equal(detectImageMode('http:'), IMAGE_MODE.remoteFirst);
});
