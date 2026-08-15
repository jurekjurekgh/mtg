import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * M100/E10 (P10 — Żywy Tester h02/h13): linie typów na kartach bez podtypów
 * („Kappa Tech-Wrecker · Creature", „Hunter's Blowgun · Artifact") — dane kart
 * nie miały subtypes. Podtyp to nie kosmetyka: liczą się go efekty plemienne,
 * changeling Barkform Harvestera, wyszukiwania „Equipment you control" itd.
 * Wzorce: docs/cards/scryfall-*.json (type_line).
 */

const REGISTRY = createCardRegistry();

const CASES = [
  ['kappa-tech-wrecker', ['Turtle', 'Ninja']],       // docs/cards: Creature — Turtle Ninja
  ['segmented-krotiq', ['Insect']],                  // Creature — Insect
  ['highland-game', ['Elk']],                        // Creature — Elk
  ['hunters-blowgun', ['Equipment']],                // Artifact — Equipment
];

for (const [id, expected] of CASES) {
  test(`P10: ${id} ma podtypy Oracle (${expected.join(' + ')})`, () => {
    const card = REGISTRY.get(id);
    assert.ok(card, `brak karty ${id}`);
    for (const sub of expected) {
      assert.ok((card.subtypes ?? []).includes(sub),
        `${id} nie ma podtypu „${sub}" — ma: [${(card.subtypes ?? []).join(', ')}]`);
    }
  });
}

test('P10: equipment nosi podtyp Equipment (warunek: deskryptor ⇒ podtyp)', () => {
  for (const card of REGISTRY.all()) {
    if (card.equipment) {
      assert.ok((card.subtypes ?? []).includes('Equipment'),
        `${card.id} ma deskryptor equipment, ale nie podtyp Equipment`);
    }
  }
});
