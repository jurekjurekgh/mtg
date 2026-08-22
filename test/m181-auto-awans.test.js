// M181 (ADR 0023 §2/§4, zlecenie właściciela): plan w worku, który osiągnie
// 15 kart, AUTOMATYCZNIE wychodzi z worka jako własna talia — generator
// przelicza całość (landy, składy) bez ręcznej edycji map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecks, slugifyPlan, WOREK_DECKS } from '../tools/generate-plan-decks.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';

/** Minimalny rejestr syntetyczny (API: all/get) do symulacji awansu. */
function syntheticRegistry(planCounts) {
  const cards = [];
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  let n = 0;
  for (const [plan, count] of Object.entries(planCounts)) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      cards.push({
        id: `syn-${slugifyPlan(plan)}-${i}`, name: `Syn ${plan} ${i}`,
        plan, types: ['Creature'], colors: [COLORS[n % COLORS.length]],
        manaCost: 2, support: { status: 'supported' },
      });
    }
  }
  // Generator dosypuje basic landy — rejestr musi je znać (walidator talii).
  const BASICS = [
    ['basic-plains', 'Plains'], ['basic-island', 'Island'], ['basic-swamp', 'Swamp'],
    ['basic-mountain', 'Mountain'], ['basic-forest', 'Forest'],
  ];
  for (const [id, name] of BASICS) {
    cards.push({ id, name, types: ['Basic', 'Land'], colors: [], support: { status: 'supported' } });
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  return { all: () => cards, get: (id) => byId.get(id) };
}

test('M181/a: plan workowy dobity do 15 kart AUTOMATYCZNIE dostaje własną talię', () => {
  // Theros jest w WOREK_DECKS (worek-legend); przy 15 kartach generator ma
  // go awansować bez edycji map — wpis w worku staje się martwy.
  assert.equal(WOREK_DECKS.Theros, 'worek-legend', 'założenie: Theros mieszka w worku');
  const registry = syntheticRegistry({
    Theros: 15, 'Śródziemie': 11, Amonkhet: 3, Shandalar: 3, Rath: 2,
  });
  const files = buildDecks(registry);
  assert.ok(files.has('theros'), 'nowa talia theros (auto-awans, slug z nazwy planu)');
  const theros = files.get('theros');
  assert.equal((theros.match(/^1x Syn Theros /gm) ?? []).length, 15, '15 kart planu w nowej talii');
  const worek = files.get('worek-legend');
  assert.ok(worek, 'worek-legend istnieje dalej (19 pozostałych kart)');
  assert.ok(!/Syn Theros /.test(worek), 'karty Theros WYJĘTE z worka');
});

test('M181/b: worek poniżej minimum po awansie = CZYTELNY błąd (świadome przetasowanie)', () => {
  const registry = syntheticRegistry({ Theros: 15, Amonkhet: 3, Rath: 2 });
  assert.throws(() => buildDecks(registry), /worek-legend.*przetasuj plany w WOREK_DECKS/s);
});

test('M181/c: slugifyPlan — diakrytyki i spacje', () => {
  assert.equal(slugifyPlan('Śródziemie'), 'srodziemie');
  assert.equal(slugifyPlan('Final Fantasy'), 'final-fantasy');
  assert.equal(slugifyPlan('Wiedźmin'), 'wiedzmin');
  assert.equal(slugifyPlan('Thunder Junction'), 'thunder-junction');
});

test('M181/d: realny katalog — żaden plan workowy nie siedzi w worku mając 15+ kart', () => {
  const registry = createCardRegistry();
  const perPlan = new Map();
  for (const c of registry.all()) {
    if (c.support?.status !== 'supported' || c.id.startsWith('basic-')) continue;
    perPlan.set(c.plan, (perPlan.get(c.plan) ?? 0) + 1);
  }
  const files = buildDecks(registry);
  for (const [plan, count] of perPlan) {
    if (count < 15 || !WOREK_DECKS[plan]) continue;
    // Plan z 15+ kartami wymieniony w mapie worka: generator MUSI go
    // awansować — talia o slugu planu istnieje, worek bez jego kart.
    assert.ok(files.has(slugifyPlan(plan)), `plan ${plan} (${count} kart) nie został awansowany z worka`);
  }
});
