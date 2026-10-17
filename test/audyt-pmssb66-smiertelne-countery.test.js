// =============================================================================
// PMSSB-66 · Ad 2 (właściciel 2026-10-17) — skutki licznikowe ŚMIERTELNE wykonujemy ASAP.
//
// Zasada właściciela: nie odraczamy do okna many tego, co ma skutek śmiertelny TERAZ:
//  • −1/−1 zabijające wrogi stwór (generycznie: licznik zmniejszający wytrzymałość, toughness ≤ ubytek);
//  • +1/+1 ratujące nasz stwór przed śmiertelnym uszkodzeniem (walka albo czar na stosie, generycznie
//    po delcie licznika). Usunięcie/wygnanie na stosie nie jest ratowalne licznikiem.
// Reszta (licznik, który nie zabija, nie ratuje) — bez zmian: odroczona poza oknem.
// Sonda PRZED/PO: tools/pmssb66-smiertelne-countery-sonda.mjs. Lekki test (pojedyncze decyzje, bez symulacji).
// Przy okazji: wycena „skazany stwór zeruje licznik" (counterDoomedHostPenalty) nie dotyczy stworzenia,
// które licznik właśnie ocala — dawniej bot pasował na ratunek przed Shockiem (K3: −19 → +15).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETHAL_SCENARIOS, lethalDecision } from '../tools/pmssb66-smiertelne-countery-sonda.mjs';

for (const sc of LETHAL_SCENARIOS) {
  test(`PMSSB-66 Ad 2 ${sc.id}: ${sc.opis}`, () => {
    const r = lethalDecision(sc.args);
    assert.ok(sc.oczekuje(r), `wybór=${r.chosenCmd} aktywacje=${r.act.map((x) => x.toFixed(2)).join('/')}`);
  });
}

test('PMSSB-66 Ad 2: zabójcze −1/−1 wykonane ma wynik dodatni (nie tylko „nie pass”)', () => {
  const r = lethalDecision(LETHAL_SCENARIOS.find((s) => s.id.startsWith('K1-')).args);
  const best = Math.max(...r.act);
  assert.ok(best > 0, `najlepsza aktywacja=${best}`);
});
