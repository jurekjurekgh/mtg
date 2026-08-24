// M202/K — strażnik: każdy token tworzony przez `create_token` musi mieć wpis
// w katalogu z grafiką Scryfall.
//
// Przyczyna zgłoszenia właściciela („Token Phyrexian Mite nie ma grafiki
// scryfall”): token działał poprawnie — tworzy go efekt `create_token` z cechami
// inline (ADR 0002) — ale kafel bierze `imageUri` z `session.cardDetails(cardId)`,
// czyli z REJESTRU kart. Bez wpisu `details` jest puste, `tileImageSources`
// zwraca [] i kafel renderuje syntetyczną zaślepkę.
//
// Cztery tokeny przeszły tak przez wiele batchów, bo żaden test nie łączył
// efektu `create_token` z katalogiem (klasa L31: strażnik kompletności jednego
// zbioru nie pilnuje drugiego). Ten test chodzi po CAŁYM katalogu, więc nowy
// token bez wpisu czerwieni się od razu — a nie dopiero na telefonie właściciela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

/** Wszystkie efekty `create_token` w katalogu (zagnieżdżone w dowolnej strukturze). */
function collectCreateTokenEffects(card) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const entry of node) walk(entry); return; }
    if (node.type === 'create_token' && typeof node.cardId === 'string') {
      found.push({ cardId: node.cardId, name: node.name ?? null });
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(card);
  return found;
}

test('M202/K (strażnik): każdy token z `create_token` ma wpis w katalogu', () => {
  const missing = new Map();
  for (const card of REGISTRY.all()) {
    for (const effect of collectCreateTokenEffects(card)) {
      if (REGISTRY.get(effect.cardId)) continue;
      if (!missing.has(effect.cardId)) missing.set(effect.cardId, effect.name ?? '?');
    }
  }
  assert.deepEqual([...missing.entries()], [],
    'Tokeny bez wpisu w katalogu (kafel renderuje syntetyczną zaślepkę zamiast '
    + `grafiki Scryfall): ${[...missing.entries()].map(([id, name]) => `${id} (${name})`).join(', ')}`);
});

test('M202/K (strażnik): każdy token ma grafikę Scryfall', () => {
  const noImage = [];
  for (const card of REGISTRY.all()) {
    for (const effect of collectCreateTokenEffects(card)) {
      const details = REGISTRY.get(effect.cardId);
      if (!details) continue; // brak wpisu łapie test wyżej
      if (!/^https:\/\/cards\.scryfall\.io\//.test(details.imageUri ?? '')) {
        noImage.push(`${effect.cardId} (imageUri: ${details.imageUri ?? 'brak'})`);
      }
    }
  }
  assert.deepEqual(noImage, [], 'Tokeny bez grafiki Scryfall: ' + noImage.join(', '));
});

test('M202/K (strażnik): wpis tokena zgadza się z deskryptorem `create_token`', () => {
  // Wpis katalogowy jest danymi prezentacji, ale nie może KŁAMAĆ o druku:
  // P/T, kolory i typy muszą odpowiadać temu, co tworzy efekt (L23: dwie
  // reprezentacje tych samych danych porównuj maszynowo).
  const problems = [];
  for (const card of REGISTRY.all()) {
    for (const effect of collectCreateTokenEffects(card)) {
      const details = REGISTRY.get(effect.cardId);
      if (!details) continue;
      const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      if (effect.power != null && Number(details.power) !== Number(effect.power)) {
        problems.push(`${effect.cardId}: power ${details.power} w katalogu vs ${effect.power} w create_token`);
      }
      if (effect.toughness != null && Number(details.toughness) !== Number(effect.toughness)) {
        problems.push(`${effect.cardId}: toughness ${details.toughness} w katalogu vs ${effect.toughness} w create_token`);
      }
      if (effect.colors && !same(details.colors, effect.colors)) {
        problems.push(`${effect.cardId}: colors ${JSON.stringify(details.colors)} vs ${JSON.stringify(effect.colors)}`);
      }
      for (const type of effect.types ?? []) {
        if (!(details.types ?? []).includes(type)) {
          problems.push(`${effect.cardId}: typ ${type} z create_token nie ma go w katalogu (${JSON.stringify(details.types)})`);
        }
      }
      for (const sub of effect.subtypes ?? []) {
        if (!(details.subtypes ?? []).includes(sub)) {
          problems.push(`${effect.cardId}: podtyp ${sub} z create_token nie ma go w katalogu (${JSON.stringify(details.subtypes)})`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
