// E7/C planu 2026-09-07 (zgłoszenie właściciela): Shock (artId 562, set AER)
// trafił do katalogu z planem „Kaladesh" (realny blok wydania AER — Aether
// Revolt) i do talii kaladesh.txt, a wg kolumny plan WŁAŚCICIELA karta należy
// do transpozycji „Warhammer Fantasy" (połowa kart projektu jest przeniesiona
// do innych settingów — liczy się plan z kolumny, nie realny blok MtG).
//
// Pin danych (nie zachowanie): plan w katalogu + przynależność talii.
// Kolory decydują o docelowej talii Warhammer: Shock jest mono-R, więc musi
// siedzieć w połowie, której sufiks zawiera R.
// Batch 74/Etap 3: generator przeliczył podział planu po dodaniu kart 656–665
// (Grollub, Loxodon Partisan, Arrow Storm, Temur Banner) — nowa para to
// `warhammer-ub` (UB) + `warhammer-wrg` (WRG), imbalance 0 (było 9 przy
// UBR/WG). Shock jest mono-R, więc trafia do `warhammer-wrg`; invariant
// („w połowie, która płaci R, nie w kaladesh") zostaje bez zmian.
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

test('E7/C: Shock siedzi w połowie Warhammera, która płaci R, nie w kaladesh', () => {
  const polowy = ['warhammer-ub', 'warhammer-wrg'].filter((n) => talia(n).includes('1x Shock'));
  assert.deepEqual(polowy, ['warhammer-wrg'],
    `Shock (mono-R) musi być w dokładnie jednej połowie planu — tej z R (jest: ${polowy.join(', ') || 'brak'})`);
  assert.ok(!talia('kaladesh').includes('1x Shock'),
    'kaladesh nie zawiera Shocka — karta przeniesiona wg planu');
});
