/**
 * Pole `plan` — reguła właściciela (ustalona 2026-10-09, audyt batcha 64).
 *
 * `plan` to **fabularne przyporządkowanie karty do planu/świata**, przekazane
 * przez właściciela przy dostawie batcha i zapisane w katalogu jako prawda
 * obowiązująca. NIE jest pochodzeniem z dodatku: Druid of the Cowl (druk M19)
 * i Universal Solvent (druk CMR) są fabularnie z Kaladeshu — Cowl to część
 * Ghirapur — i `tools/generate-plan-decks.mjs` układa z tego talie. Dlatego
 * istnieją talie Wiedźmina i Warhammer Fantasy, choć w vanilla MtG nie ma
 * takich setów ani planów; grupa „Kaldheim" miesza KHM z ALA/ORI/2XM/2X2/MOM,
 * a „Warhammer Fantasy" 42 karty z 30 dodatków.
 *
 * Wniosek dla audytów: **set karty nie jest dowodem na błędny `plan`.**
 * Zgłoszenie B-3 w pierwszej wersji `AUDYT_BATCH64_MECHANIKI_2026-10-09.md`
 * orzekło „plan niezgodny z faktycznym planem" dokładnie tym błędnym kryterium
 * i zostało wycofane.
 *
 * Reguła właściciela: żadna REGULARNA karta nie ma prawa nie mieć planu. Bez
 * planu zostają wyłącznie basic landy, tokeny, karty specjalne i tylne strony
 * kart dwustronnych. Ten plik jej pilnuje — `generate-plan-decks.mjs` rzuca
 * `Karta bez planu` dopiero przy generowaniu talii, czyli późno i z komunikatem,
 * który nie mówi, że to reguła (L27: detektor przy regule, nie przy skutku).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();

test('każda regularna karta ma plan; bez planu tylko basic landy, tokeny, karty specjalne i tylne strony DFC', () => {
  const bezPlanu = registry.all().filter((c) => !c.plan);

  const kategorie = { basic: [], token: [], reszta: [] };
  for (const c of bezPlanu) {
    if (c.id.startsWith('basic-')) kategorie.basic.push(c.id);
    else if (c.id.startsWith('token_')) kategorie.token.push(c.id);
    else kategorie.reszta.push(`${c.id} [set ${c.set ?? 'null'}, support ${c.support?.status ?? '?'}]`);
  }

  assert.deepEqual(kategorie.reszta, [],
    'Karty regularne bez planu — właściciel przypisuje plan przy dostawie batcha '
    + '(fabularne przyporządkowanie, nie set): ' + kategorie.reszta.join(', '));

  // Pilnujemy też kształtu wyjątków: gdyby basic land albo token zaczął nosić
  // plan, talie planowe zaczęłyby łapać obiekty, które nie są kartami talii.
  assert.ok(kategorie.basic.length >= 5,
    `oczekiwano 5 basic landów bez planu, jest ${kategorie.basic.length}`);
  assert.ok(kategorie.token.length >= 1,
    'tokeny powinny być bez planu (nie wchodzą do talii planowych)');

  // Regularne karty wspierane (te, które generator bierze do talii) — żadna bez
  // planu. To warunek, przy którym `generate-plan-decks.mjs` rzuca wyjątek.
  const wspieraneBezPlanu = registry.all()
    .filter((c) => c.support?.status === 'supported' && !c.plan && !c.id.startsWith('basic-'));
  assert.deepEqual(wspieraneBezPlanu.map((c) => c.id), [],
    'karta wspierana i nie-basic bez planu zatrzymałaby generator talii');
});

// Pin faktów, na których opiera się reguła — gdyby ktoś je „uporządkował",
// straż wyżej przestałaby mierzyć to, co ma mierzyć.
test('pole `plan` nie jest setem: grupy planowe mieszają dodatki (Wiedźmin, Warhammer, Kaldheim)', () => {
  const grupy = new Map();
  for (const c of registry.all()) {
    if (!c.plan) continue;
    if (!grupy.has(c.plan)) grupy.set(c.plan, new Set());
    grupy.get(c.plan).add(c.set ?? 'null');
  }
  const mieszane = [...grupy.entries()].filter(([, sety]) => sety.size >= 4);
  assert.ok(mieszane.length >= 10,
    `oczekiwano co najmniej 10 grup planowych z 4+ dodatkami (pole jest workiem fabularnym), `
    + `jest ${mieszane.length}`);

  // Konkrety z katalogu, żeby komunikat był sprawdzalny bez uruchamiania.
  assert.equal(registry.get('druid-of-the-cowl').plan, 'Kaladesh',
    'Druid of the Cowl: druk M19, fabularnie Kaladesh (Cowl to część Ghirapur)');
  assert.equal(registry.get('universal-solvent').plan, 'Kaladesh');
  assert.equal(registry.get('scouting-hawk').plan, 'Kaldheim');
  assert.ok(grupy.has('Wiedźmin') && grupy.get('Wiedźmin').size >= 4,
    'talia Wiedźmina istnieje mimo braku takiego setu/planu w vanilla MtG');
  assert.ok(grupy.has('Warhammer Fantasy') && grupy.get('Warhammer Fantasy').size >= 4,
    'talia Warhammer Fantasy istnieje mimo braku takiego setu/planu w vanilla MtG');
});
