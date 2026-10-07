// Audyt PR #156, znalezisko O2 (2026-10-07, klasa Z1c/M106): zdarzenie
// `grave_free_cast_required` ma TRZY emisje po jednej na etap decyzji
// (stage 'x' → 'card' → 'target'), a session.js renderował IDENTYCZNY wpis
// dla wszystkich trzech — log opisywał pierwszą decyzję i milczał o dwóch
// kolejnych (trzy takie same linie pod rząd). Wpis musi być zależny od stage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const ctx = { nameOf: (id) => (id === 'halo-forager' ? 'Halo Forager' : id), nameOfObject: () => 'obiekt' };

const evX = { type: 'grave_free_cast_required', playerId: 'p1', sourceCardId: 'halo-forager', stage: 'x' };
const evCard = { type: 'grave_free_cast_required', playerId: 'p1', sourceCardId: 'halo-forager', stage: 'card', xValue: 2 };
const evTarget = { type: 'grave_free_cast_required', playerId: 'p1', sourceCardId: 'halo-forager', stage: 'target', xValue: 2, objectId: 'g1', cardId: 'spin-out' };

test('O2/1: trzy etapy mają TRZY RÓŻNE wpisy (nie jeden identyczny)', () => {
  const texts = [evX, evCard, evTarget].map((ev) => describeGameEvent(ev, ctx));
  assert.equal(new Set(texts).size, 3, `wpisy muszą się różnić: ${JSON.stringify(texts)}`);
});

test('O2/2: wpis etapu karty niesie wartość X', () => {
  const text = describeGameEvent(evCard, ctx);
  assert.match(text, /=2/, `X w etapie karty: ${text}`);
  assert.match(text, /kartę/, 'etap karty prosi o wybór karty');
  assert.doesNotMatch(text, /undefined/);
});

test('O2/3: wpis etapu celów niesie nazwę rzucanego czaru i X', () => {
  const text = describeGameEvent(evTarget, ctx);
  assert.match(text, /spin-out/, 'nazwa rzucanej karty w etapie celów');
  assert.match(text, /=2/, 'X w etapie celów');
  assert.doesNotMatch(text, /undefined/);
});

test('O2/4: wpis etapu X (brak X/karty) nadal czytelny, bez undefined', () => {
  const text = describeGameEvent(evX, ctx);
  assert.match(text, /Halo Forager/, 'źródło decyzji nazwane');
  assert.doesNotMatch(text, /undefined/);
});
