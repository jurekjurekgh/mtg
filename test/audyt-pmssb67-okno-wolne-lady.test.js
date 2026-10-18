// PMSSB-67 (rozstrzygnięcie właściciela 2026-10-18, pkt 3): kara M243/C i odroczenie many są zdjęte
// TYLKO w oknie = END STEP PRZECIWNIKA, i TYLKO gdy nasze wolne lądy (+pula) pokrywają koszt.
// Reguła już działa (freeManaWindowNow: koszt ≤ manaAvailableNow − rezerwa). Ten plik ją przypina:
// bez wolnych lądów okno się nie otwiera. Scenariusze W1 (2 lądy → aktywacja) są w audyt-pmssb66-okno.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oknoDecision } from '../tools/pmssb66-okno-many-sonda.mjs';

const halo = (lands) => oknoDecision({ step: 'end-opp', lands, cardId: 'halo-scarab', where: 'graveyard', objectId: 'halo' });

for (const lands of [0, 1]) {
  test(`okno zamknięte: end step przeciwnika, ${lands} wolnych lądów < koszt Halo (2) → brak darmowej aktywacji`, () => {
    const r = halo(lands);
    assert.ok(!(r.chosenCmd ?? '').startsWith('activate_ability(halo'),
      `przy ${lands} lądach wybrano ${r.chosenCmd} — okno nie może się otworzyć bez wolnych lądów`);
  });
}

test('okno otwarte: end step przeciwnika, 2 wolne lądy pokrywają koszt Halo → aktywacja', () => {
  const r = halo(2);
  assert.ok((r.chosenCmd ?? '').startsWith('activate_ability(halo'), `wybór=${r.chosenCmd}`);
});
