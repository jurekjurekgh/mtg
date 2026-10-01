// Audyt PR #146, znalezisko F1 (klasa L48/L41/L107): predykat „czy to źródło
// many pasuje do któregokolwiek wymaganego pipa" ma JEDNO miejsce prawdy.
//
// Historia: PR #145 (zn. F6) naprawił awarię `bot-tie-audit` — pętla LANDÓW
// w `spendMana` filtrowała źródła ręcznym `srcColors.some((c) =>
// reqColors.has(c))`, które dla źródła BEZBARWNEGO (pusty zbiór kolorów) nie
// zachodzi nigdy, więc `{C}` (Kozilek's Shrieker + Holdout Settlement
// „{T}: Add {C}", CR 107.4c) było nie do zapłacenia mimo oferty. Naprawa
// wprowadziła wspólny `unitCoversAnyRequirement`, ale tylko w JEDNYM z
// miejsc: pomiar audytu (grep po `src/engine/resources.js`) pokazał, że
// ręczna kopia tej samej reguły została jeszcze w 6 liniach — dwa komparatory
// sortu (faza pipów i auto-tap sumy) oraz dwa FILTRY w bloku „obrona w głąch"
// (seed 2027) o dokładnie tym samym kształcie co naprawiony błąd.
//
// Zasięg dziś (pomiar, nie hipoteza — L105): katalog ma JEDNĄ kartę z pipem
// {C} (`kozileks-shrieker`, koszt ZDOLNOŚCI {C}, kwota 1), więc ścieżka
// „obrony w głąch" nie jest dla {C} osiągalna i błąd jest UTAJONY, nie żywy.
// Dlatego strażnikiem jest skan źródła (jak w `audyt-pr112-protection-
// jeden-predykat`), a nie scenariusz: następna karta z {C} w koszcie czaru
// nie może zastać czterech kopii reguły.
//
// Czego ten strażnik NIE dotyczy: `compareGenericConsume`/`poolPaysFreelyFor`
// używają `preserved.has(c)` do innej reguły (których jednostek NIE jeść przy
// finansowaniu źródła kosztowego) — tam bezbarwna jednostka też jest
// niewidoczna, ale zmiana porządku konsumpcji bez repro byłaby zgadywaniem
// (odnotowane jako uwaga otwarta w `docs/audits/AUDYT_PR146_2026-09-29.md`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { singleColorRequirements, unitCoversAnyRequirement } from '../src/engine/mana-cost.js';
import { consumeManaPool } from '../src/engine/resources.js';

const PLIK = 'src/engine/resources.js';
const kod = () => fs.readFileSync(PLIK, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')   // komentarze blokowe PRZED skanem (L83)
  .replace(/^\s*\/\/.*$/gm, '');

/** Ręczna kopia reguły: przecięcie zbioru kolorów źródła z wymaganymi pipami. */
const RECZNY_PREDYKAT = /\.some\(\(c\) => (?:reqColors|neededColors|pipReqs|preserved|preserveSet)\.has\(c\)\)/g;
/** Ręczne budowanie wymagań jednokolorowych obok wspólnej funkcji. */
const RECZNE_MAPOWANIE = /\.map\(\(c\) => \[c\]\)/g;

test('F1/1: w resources.js nie ma ręcznej kopii predykatu pokrycia pipa', () => {
  const trafienia = [...kod().matchAll(RECZNY_PREDYKAT)].map((m) => m[0]);
  assert.deepEqual(trafienia, [],
    'predykat „źródło pasuje do pipa" ma jedno miejsce prawdy: unitCoversAnyRequirement');
});

test('F1/2: reguła jest wołana przez wspólną funkcję (kotwica, nie pusty skan)', () => {
  // L29/L39: skan „zero trafień" przechodzi też wtedy, gdy reguła zniknie —
  // kotwica mówi, ile wywołań wspólnej funkcji jest w pliku.
  const wywolania = [...kod().matchAll(/unitCoversAnyRequirement\(/g)].length;
  assert.equal(wywolania, 17,
    `oczekiwane 17 wywołań unitCoversAnyRequirement w ${PLIK} (pomiar audytu PR #146); `
    + 'nowe miejsce = świadoma aktualizacja kotwicy');
});

test('F1/3: wymagania jednokolorowe buduje JEDNA funkcja (brak ręcznego .map)', () => {
  const trafienia = [...kod().matchAll(RECZNE_MAPOWANIE)].map((m) => m[0]);
  assert.deepEqual(trafienia, [],
    'mapowanie kolorów na wymagania jednokolorowe żyje w singleColorRequirements');
});

test('F1/4: dowód RED — detektor widzi obie ręczne postacie', () => {
  const fixture = [
    'const am = ca.some((c) => reqColors.has(c)) ? 0 : 1;',
    'if (!entry.colors.some((c) => neededColors.has(c))) continue;',
    'const pipReqs = entry.costPips.map((c) => [c]);',
    'const pa = units[a].some((c) => preserved.has(c)) ? 1 : 0;',
  ].join('\n');
  assert.equal([...fixture.matchAll(RECZNY_PREDYKAT)].length, 3,
    'detektor kopii predykatu łapie oba zbiory kolorów');
  assert.equal([...fixture.matchAll(RECZNE_MAPOWANIE)].length, 1,
    'detektor ręcznego mapowania łapie .map((c) => [c])');
});

test('F1/5: semantyka — bezbarwne źródło płaci {C}, kolorowe nie (CR 107.4c)', () => {
  const req = singleColorRequirements(['C']);
  assert.deepEqual(req, [['C']]);
  assert.equal(unitCoversAnyRequirement([], req), true,
    'źródło bezbarwne (pusty zbiór kolorów) pokrywa pip {C}');
  assert.equal(unitCoversAnyRequirement(['U'], req), false,
    'mana niebieska NIE płaci pipa {C}');
});

test('F1/6: semantyka — hybryda {R/G} zostaje opłacalna jednym kolorem (CR 107.4e)', () => {
  // Zbiór kolorów wymagań (Set z requirements.flat()) rozbijamy na wymagania
  // jednokolorowe — dlatego {R/G} nie znika z filtru po spłaszczeniu.
  const req = singleColorRequirements(new Set(['R', 'G', 'C']));
  assert.deepEqual(req, [['R'], ['G'], ['C']]);
  assert.equal(unitCoversAnyRequirement(['R'], req), true);
  assert.equal(unitCoversAnyRequirement(['G'], req), true);
  assert.equal(unitCoversAnyRequirement(['U'], req), false);
  assert.equal(unitCoversAnyRequirement([], req), true, '{C} w zbiorze wymagań');
});

// ---------------------------------------------------------------------------
// U1 z `docs/audits/AUDYT_PR146_2026-09-29.md` §8 — ta sama klasa, druga reguła:
// `preserveColors` chroni manę potrzebną pipom płatności („kolory wymagań
// płatności schodzą z puli OSTATNIE" — komentarz przy `compareGenericConsume`),
// ale jednostka BEZBARWNA (`[]`) nie zawiera żadnego koloru, więc
// `unit.some((c) => preserved.has(c))` nie widzi jej nawet wtedy, gdy `'C'`
// jest chronione. Efekt mierzony sondą: pula `{'': 1, G: 1}`
// i `preserveColors: ['C']` → zjedzona została jednostka BEZBARWNA (ta, która
// opłaca pip {C}), a zielona została.
//
// Zasięg: `consumeManaPool(..., preserveColors)` jest wołany z
// `tapCostedManaSource` (finansowanie kosztu źródła), a `'C'` trafia do
// `preserveColors` tylko przy płatności z pipem {C} — w katalogu to jedna karta
// (`kozileks-shrieker`, koszt ZDOLNOŚCI {C}, suma 1), więc end-to-end wymagałoby
// puli z bezbarwną rezerwą I konieczności finansowania źródła naraz. Pin jest
// jednostkowy (poziom reguły), nie scenariuszowy — ale reguła ma być jedna.
// ---------------------------------------------------------------------------
test('F1/7: rezerwa pod pip {C} chroni jednostkę BEZBARWNĄ (preserveColors)', () => {
  const player = { id: 'p1', manaPool: { '': 1, G: 1 }, restrictedPool: {} };
  const wydane = consumeManaPool(player, 1, [], true, ['C']);
  assert.deepEqual(wydane, ['G'],
    'generic zjada jednostkę NIEchronioną (zieloną), bezbarwna zostaje na pip {C}');
  assert.deepEqual(player.manaPool, { '': 1 },
    'jednostka bezbarwna przetrwała — to ona opłaca pip {C} (CR 107.4c)');
});

test('F1/8: bez rezerwy kolejność konsumpcji pozostaje dotychczasowa', () => {
  // Kotwica regresji: zmiana nie może przestawić konsumpcji tam, gdzie żadna
  // rezerwa nie zachodzi (bezb. najpierw — „od najmniej kolorowych").
  const player = { id: 'p1', manaPool: { '': 1, G: 1 }, restrictedPool: {} };
  const wydane = consumeManaPool(player, 1, [], true, []);
  assert.deepEqual(wydane, [], 'jednostka bezbarwna nie ma koloru do zaksięgowania');
  assert.deepEqual(player.manaPool, { G: 1 }, 'bez preserveColors bezbarwna schodzi pierwsza');
});
