// E7/C planu 2026-09-07 (zgłoszenie właściciela): Shock (artId 562, set AER)
// trafił do katalogu z planem „Kaladesh" (realny blok wydania AER — Aether
// Revolt) i do talii kaladesh.txt, a wg kolumny plan WŁAŚCICIELA karta należy
// do transpozycji „Warhammer Fantasy" (połowa kart projektu jest przeniesiona
// do innych settingów — liczy się plan z kolumny, nie realny blok MtG).
//
// Pin danych (nie zachowanie): plan w katalogu + przynależność talii.
// Kolory decydują o docelowej talii Warhammer: Shock jest mono-R, więc
// warhammer-ubr (UBR); warhammer-wg (W/G) nie ma czerwonego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REGISTRY = (await import('../src/cards/card-data.js')).createCardRegistry();

test('E7/C: Shock ma plan „Warhammer Fantasy" (kolumna plan właściciela, nie blok AER)', () => {
  const card = REGISTRY.get('shock');
  assert.ok(card, 'Shock w katalogu');
  assert.equal(card.plan, 'Warhammer Fantasy',
    `plan Shocka: oczekiwany „Warhammer Fantasy" (zgłoszenie C), jest „${card.plan}"`);
  assert.equal(card.set, 'AER', 'set zostaje realny (AER — identyfikator wydania)');
});

const talia = (nazwa) => readFileSync(`decks/${nazwa}.txt`, 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('E7/C: Shock siedzi w talii warhammer-ubr (mono-R), nie w kaladesh', () => {
  assert.ok(talia('warhammer-ubr').includes('1x Shock'),
    'warhammer-ubr zawiera 1x Shock');
  assert.ok(!talia('kaladesh').includes('Shock'),
    'kaladesh nie zawiera Shocka — karta przeniesiona wg planu');
});
