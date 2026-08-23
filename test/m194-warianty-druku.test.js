// M194/K1 — talie muszą jednoznacznie wskazywać EGZEMPLARZ karty.
//
// Batch 47 (zlecenie właściciela) dodaje DRUGIE warianty kart już obecnych
// w katalogu: Curate (STX, plan Arcavios) obok Curate (BRO, Forgotten Realms)
// oraz Negate (M15, Warhammer Fantasy) obok Negate (M20, Wiedźmin). Każdy
// wariant ma własny art i trafia do INNEJ talii.
//
// Problem wykryty w rozpoznaniu PRZED kodowaniem: pliki talii zapisują karty
// po NAZWIE („1x Curate"), a parser bierze PIERWSZĄ kartę o tej nazwie. Dwa
// egzemplarze rozjechałyby się po cichu — obie talie wskazywałyby ten sam
// cardId, więc jedna karta zniknęłaby z gry, a strażniki ADR 0023 („każda
// wspierana karta w dokładnie jednej talii") zaczęłyby kłamać.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { parseDeckText, writeDeckText } from '../src/cards/deck-text.js';

/** Rejestr z DWOMA egzemplarzami tej samej nazwy (jak Curate BRO/STX). */
const registry = createRegistry([
  defineCard({ id: 'island', name: 'Island', types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'curate', name: 'Curate', set: 'BRO', types: ['Instant'], support: { status: 'supported' } }),
  defineCard({ id: 'curate-stx', name: 'Curate', set: 'STX', types: ['Instant'], support: { status: 'supported' } }),
  defineCard({ id: 'bolt', name: 'Lightning Bolt', set: 'M10', types: ['Instant'], support: { status: 'supported' } }),
]);

test('M194/K1: writer rozróżnia egzemplarze o tej samej nazwie (sufiks setu)', () => {
  const text = writeDeckText({ name: 'A', cardIds: ['curate-stx', 'island'] }, registry, { minNonland: 0 });
  assert.match(text, /1x Curate \(STX\)/,
    `karta o zdublowanej nazwie musi nieść set: ${JSON.stringify(text)}`);
});

test('M194/K1: parser wraca do TEGO SAMEGO egzemplarza (round-trip)', () => {
  for (const id of ['curate', 'curate-stx']) {
    const text = writeDeckText({ name: 'A', cardIds: [id, 'island'] }, registry, { minNonland: 0 });
    const parsed = parseDeckText(text, registry);
    assert.ok(parsed.cardIds.includes(id),
      `„${text.trim().split('\n').pop()}" musi wrócić na ${id}, dostałem ${parsed.cardIds}`);
    assert.equal(writeDeckText(parsed, registry, { minNonland: 0 }), text, 'write→parse→write stabilne');
  }
});

test('M194/K1: dwa warianty w JEDNEJ talii to dwie różne karty (nie duplikat)', () => {
  // Singleton (ADR 0023) dotyczy EGZEMPLARZA, nie nazwy — dwa różne druki
  // to dwie różne karty katalogu.
  const text = writeDeckText({ name: 'A', cardIds: ['curate', 'curate-stx', 'island'] }, registry, { minNonland: 0 });
  const parsed = parseDeckText(text, registry);
  assert.deepEqual([...new Set(parsed.cardIds)].sort(), ['curate', 'curate-stx', 'island']);
});

test('M194/K1: karta o UNIKALNEJ nazwie zapisuje się bez sufiksu (zero zmian w istniejących taliach)', () => {
  // Anty-over-fix: 15 plików talii w repo nie może się zmienić przez tę
  // funkcję — sufiks pojawia się WYŁĄCZNIE przy realnej kolizji nazw.
  const text = writeDeckText({ name: 'A', cardIds: ['bolt', 'island'] }, registry, { minNonland: 0 });
  assert.match(text, /1x Lightning Bolt$/m, `bez sufiksu: ${JSON.stringify(text)}`);
  assert.doesNotMatch(text, /Lightning Bolt \(/, 'brak kolizji = brak sufiksu');
});

test('M194/K1: nazwa bez sufiksu przy kolizji jest ODRZUCONA, nie zgadywana', () => {
  // Cicha zgadywanka („weź pierwszą pasującą") to dokładnie ten bug, przed
  // którym bronimy: talia musi powiedzieć WPROST, o który egzemplarz chodzi.
  assert.throws(() => parseDeckText('# X\n1x Curate\n', registry),
    /niejednoznaczn|Curate/i,
    'przy dwóch egzemplarzach sama nazwa jest niejednoznaczna');
});

test('M194/K1: nieznany set w sufiksie to błąd, nie ciche dopasowanie', () => {
  assert.throws(() => parseDeckText('# X\n1x Curate (ZZZ)\n', registry), /Nieznana karta/);
});
