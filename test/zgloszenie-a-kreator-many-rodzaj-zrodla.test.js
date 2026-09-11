// Zgłoszenie właściciela A (2026-09-10, sesja arena/01a08d0e).
//
// Objaw przy stole: jeden Forest i nietapnięty Scorned Villager ({T}: Add {G}),
// rzut Snarling Wolf za {G} — silnik sam tapuje Forest, a powinien otworzyć
// kreator many, bo gracz mógł chcieć zapłacić stworzeniem.
//
// Przyczyna źródłowa (zmierzona): src/table/mana-wizard.js `countPaymentVariants`
// buduje klucz wariantu z `kolory#ilość#kosztAktywacji` — BEZ rodzaju źródła.
// Forest (`kind: 'land'`) i Scorned Villager (`kind: 'ability'`) produkują
// identyczne {G}, więc dostają TEN SAM klucz → 1 wariant → `shouldOpenManaWizard`
// = false → kreator się nie otwiera.
//
// Dlaczego to realny wybór, a nie kosmetyka: tapnięcie STWORA ma koszt
// alternatywny (nie zaatakuje/nie zablokuje w tej turze), więc przy tym samym
// profilu many gracz ma dwie różne decyzje. Dwa LĄDY o tym samym profilu to
// nadal jedna decyzja (anty-over-fix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPaymentVariants, shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const forest = (id) => ({ id, cardId: 'forest', colors: ['G'], amount: 1, kind: 'land' });
const villager = (id) => ({ id, cardId: 'scorned-villager', colors: ['G'], amount: 1, kind: 'ability' });

function decyzja(sources) {
  return shouldOpenManaWizard({ sources, poolMana: 0, totalNeeded: 1, requirements: [['G']] });
}

test('A/1: ląd i stwór-zdolność o tym samym kolorze to DWA warianty płatności', () => {
  const sources = [forest('las'), villager('sv')];
  assert.equal(countPaymentVariants(sources, 0, 1, [['G']]), 2,
    'Forest {G} i Scorned Villager {G} muszą być liczone jako dwa kształty płatności');
  assert.equal(decyzja(sources), true, 'kreator many musi się otworzyć');
});

test('A/2 (anty-over-fix): dwa lądy o tym samym profilu to nadal JEDEN wariant', () => {
  const sources = [forest('las1'), forest('las2')];
  assert.equal(countPaymentVariants(sources, 0, 1, [['G']]), 1,
    'dwa identyczne lasy nie są wyborem — kreator byłby klikaniem „dalej"');
  assert.equal(decyzja(sources), false, 'przy braku wyboru kreator się nie otwiera');
});

test('A/3 (anty-over-fix): jedno użyteczne źródło — kreator zbędny', () => {
  assert.equal(decyzja([forest('las')]), false, 'jeden las = brak wyboru');
  assert.equal(decyzja([villager('sv')]), false, 'jedno źródło-zdolność = brak wyboru');
});

test('A/4 (zakres fixu): dwa źródła-zdolności o tym samym profilu to jeden kształt', () => {
  // Świadoma granica: kreator otwiera się, gdy wybór jest między RÓŻNYMI
  // RODZAJAMI źródła (ląd vs stwór-zdolność) — to jest realny kompromis
  // (tapnięty stwór nie atakuje/nie blokuje). Dwa identyczne stwory-zdolności
  // o tym samym profilu many są zamienne, więc pozostają jednym kształtem
  // (inaczej kreator otwierałby się przy każdej parze takich samych stworów).
  const sources = [
    { id: 'a', cardId: 'scorned-villager', colors: ['G'], amount: 1, kind: 'ability' },
    { id: 'b', cardId: 'moonscarred-werewolf', colors: ['G'], amount: 1, kind: 'ability' },
  ];
  assert.equal(countPaymentVariants(sources, 0, 1, [['G']]), 1,
    'ten sam rodzaj i profil = jeden kształt płatności');
});
