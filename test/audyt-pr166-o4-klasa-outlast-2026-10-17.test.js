// Audyt PR #166, O-4 (2026-10-17): klasa „outlast” w wycenie bota (N, Enduring
// Sliver) rozpoznawała licznik na sobie tylko po TYPIE efektu `add_counter`.
// Efekt z polem wskazującym INNY obiekt (`targetFromContext`, `applyTo`,
// `targetIndex`, `amountFromContext`, `condition`) przeszedłby jako „licznik na
// sobie” i dostałby karę −40 w głównej 1. Ta klasa ma być wąska: czysty efekt
// `{ type: 'add_counter', counter, amount? }` i bez celów zdolności.
//
// Strażnik katalogu: w katalogu dziś tylko Enduring Sliver pasuje do klasy
// (token_mutagen ma cel w definicji zdolności — poza klasą). Nowa karta w tej
// klasie wymaga świadomej decyzji (test pada i wskazuje kartę).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bot from '../src/controllers/heuristic-bot.js';
const isSelfCounterEffects = (...args) => bot.isSelfCounterEffects?.(...args) ?? false;
import { createCardRegistry } from '../src/cards/card-data.js';

test('O-4/0: eksport klasyfikatora licznika na sobie', () => {
  assert.equal(typeof bot.isSelfCounterEffects, 'function');
});

test('O-4/1: czysty licznik na sobie (type/counter/amount) należy do klasy', () => {
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', amount: 1 }]), true);
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1' }]), true);
});

test('O-4/2: licznik na obiekcie z kontekstu zdarzenia nie należy do klasy', () => {
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', targetFromContext: 'that' }]), false);
});

test('O-4/3: licznik przez applyTo / targetIndex / amountFromContext / condition nie należy do klasy', () => {
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', applyTo: 'enchanted_controller' }]), false);
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', targetIndex: 1 }]), false);
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', amountFromContext: 'n' }]), false);
  assert.equal(isSelfCounterEffects([{ type: 'add_counter', counter: '+1/+1', condition: { wasKicked: true } }]), false);
});

test('O-4/4: zdolność z innym efektem obok licznika nie należy do klasy; pusta lista też nie', () => {
  assert.equal(isSelfCounterEffects([{ type: 'draw_cards', amount: 1 }, { type: 'add_counter', counter: '+1/+1' }]), false);
  assert.equal(isSelfCounterEffects([]), false);
  assert.equal(isSelfCounterEffects(undefined), false);
});

test('O-4/5: katalog — w klasie outlast (sorcery, {T} na sobie, bez celów) są Enduring Sliver i Tuskguard Captain (batch 69, ta sama klasyfikacja po efekcie)', () => {
  const reg = createCardRegistry();
  const pasujace = new Set();
  for (const card of reg.all()) {
    const zdolnosci = [...(card.abilities ?? [])];
    for (const ab of card.abilities ?? []) {
      for (const g of ab?.scope?.grantsAbilities ?? []) zdolnosci.push(g);
    }
    for (const ab of zdolnosci) {
      if (ab?.type !== 'activated' || !ab.cost?.tap || ab.timing !== 'sorcery') continue;
      if ((ab.targets ?? []).length) continue;
      const effects = Array.isArray(ab.effect) ? ab.effect : (ab.effect ? [ab.effect] : []);
      if (isSelfCounterEffects(effects)) pasujace.add(card.id);
    }
  }
  assert.deepEqual([...pasujace].sort(), ['enduring-sliver', 'tuskguard-captain'], `karty w klasie outlast: ${[...pasujace].join(', ')}`);
});
