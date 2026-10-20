// PMSSB-69 (inicjatywa, `take_initiative`) — piny wyceny bota (wzorzec PMSSB-68).
// Sonda: tools/pmssb69-initiative-sonda.mjs (PRZED: .arena/pmssb69-przed.txt).
// Skala: Explorer / Bard / Caves — ETB „you take the initiative”; wartość ETB dawniej = stała 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probe, CARDS } from '../tools/pmssb69-initiative-sonda.mjs';

const EXPLORER = 'underdark-explorer';
// Waga rodziny `cast_permanent` = 0.9 (jak w PMSSB-68): składnik ETB wchodzi do wyniku jako 0.9 × wartość.
const W = 0.9;
const eps = 1e-6;
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < eps,
  `${msg}: oczekiwano ${expected}, jest ${actual}`);

// Wartości PRZED (sonda): nikt-wrog-0 79.2063; nikt-wrog-2 81.6813 (wróg dokłada wartość ciała stołu).
const BASE_0 = 79.2063;
const BASE_2 = 81.6813;

test('PMSSB-69 anty-over-fix: nikt nie ma inicjatywy, wróg bez stworów = dawne 6 (bez zmiany)', () => {
  near(probe({ card: EXPLORER, holder: null, foes: 0 }), BASE_0, 'nikt-wrog-0');
});

test('PMSSB-69/F1: już mam inicjatywę → objęcie nic nie daje (składnik ETB = 0, nie 6)', () => {
  near(probe({ card: EXPLORER, holder: 'p2', foes: 0 }), BASE_0 - 6 * W, 'ja-wrog-0');
  near(probe({ card: EXPLORER, holder: 'p2', foes: 2 }), BASE_2 - 6 * W, 'ja-wrog-2');
});

test('PMSSB-69/F1 na wszystkich trzech kartach: delta „ja posiadam” = −6', () => {
  for (const card of CARDS) {
    const nikt = probe({ card: card.id, holder: null, foes: 0 });
    const ja = probe({ card: card.id, holder: 'p2', foes: 0 });
    near(ja - nikt, -6 * W, `${card.id} ja − nikt`);
  }
});

test('PMSSB-69/F2: wróg ma inicjatywę → objęcie zabiera mu postęp (dopłata +6)', () => {
  near(probe({ card: EXPLORER, holder: 'p1', foes: 0 }), BASE_0 + 6 * W, 'wrog-inic-0');
});

test('PMSSB-69/F3: każdy atakujący stwór wroga = kara 2 (cap 6); wróg z 2 stworami bez inicjatywy', () => {
  near(probe({ card: EXPLORER, holder: null, foes: 2 }), BASE_2 - 4 * W, 'nikt-wrog-2 (2 × 2)');
});

test('PMSSB-69/F2+F3 razem: wróg ma inicjatywę i 2 stwory → +6 − 4', () => {
  near(probe({ card: EXPLORER, holder: 'p1', foes: 2 }), BASE_2 + 2 * W, 'wrog-inic-2');
});

test('PMSSB-69/F3 cap: kara nie schodzi poniżej składnika ETB 0 (cap 6 przy wielu stworach)', () => {
  // Sonda: cap domyślny 6 — przy 2 stworach kara 4 < 6; ustawienie cap 0 zdejmuje karę w całości.
  const kapped = probe({ card: EXPLORER, holder: null, foes: 2, params: { initiativeExposureCap: 0 } });
  near(kapped - probe({ card: EXPLORER, holder: null, foes: 2 }), 4 * W, 'cap 0 znosi karę 4 × 0.9');
});

test('PMSSB-69 pokrętła ×0: stealBonus 0 i exposurePenalty 0 przywracają wycenę sprzed zmiany (ETB 6)', () => {
  const off = { initiativeStealBonus: 0, initiativeExposurePenalty: 0 };
  near(probe({ card: EXPLORER, holder: 'p1', foes: 2, params: off }), BASE_2, 'wrog-inic-2 przy pokrętłach 0');
  near(probe({ card: EXPLORER, holder: null, foes: 2, params: off }), BASE_2, 'nikt-wrog-2 przy pokrętłach 0');
});
