import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { buildDecks } from '../tools/generate-plan-decks.mjs';
import { parseCSV } from '../tools/fetch-art-ids.mjs';

const ids = ['vampire-hounds','curse-of-the-bloody-tome','rumbling-rockslide','ambassador-oak','tail-slash','changeling-berserker','sphinxs-herald','anticipate','trumpet-blast','violent-urge'];

test('A30: dane 625–634 zgadzają się z CSV i snapshotami Scryfall', () => {
  const registry = createCardRegistry();
  const rows = parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8'));
  for (const [offset, id] of ids.entries()) {
    const card = registry.get(id);
    const snapshot = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
    const matches = rows.filter(row => row[0] === `${625 + offset}${snapshot.set.toUpperCase()}`);
    assert.equal(matches.length, 1, id);
    assert.equal(card.name, snapshot.name, id);
    assert.equal(matches[0][1], card.name, id);
    assert.equal(matches[0][2], card.plan, id);
    assert.equal(card.artId, 625 + offset, id);
    assert.equal(card.set.toLowerCase(), snapshot.set, id);
    assert.equal(MANA_COSTS[id], snapshot.mana_cost, id);
    assert.equal(card.manaCost, snapshot.cmc, id);
  }
});

test('A30: talie zapisane są identyczne z wynikiem generatora bez zapisu', () => {
  const files = buildDecks();
  const existing = fs.readdirSync('decks').filter(name => name.endsWith('.txt')).sort();
  assert.deepEqual(existing, [...files.keys()].map(name => `${name}.txt`).sort());
  for (const [name, text] of files) assert.equal(fs.readFileSync(`decks/${name}.txt`, 'utf8'), text, name);
});
