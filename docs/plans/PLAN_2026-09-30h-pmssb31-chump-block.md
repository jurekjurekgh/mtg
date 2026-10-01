# PLAN 2026-09-30h — PMSSB-31: chump-block tokenami (zgłoszenie właściciela z gry)

Fala z **obserwacji z rozgrywki**, nie z audytu remisów.

## 1. Zgłoszenie (dosłownie)

> „Bot ma 4 tokeny 1/1. Atakuję go kilkoma kreaturami w tym 4/4, 3/3 bez
> trample. Mimo to bot nie blokuje tymi disposable tokens i dostaje 7 dmg.
> Trochę słabo. Po to ma te małe token kreatury żeby go broniły przed atakiem
> większych kreatur."

## 2. Pomiar PRZED

Sonda `/home/user/scratch/pmssb31-warianty.mjs`, 4 tokeny 1/1 (Snarling Wolf)
u obrońcy vs atak 4/4 (`fear-of-burning-alive`) + 3/3 (`hill-giant`) = 7 obrażeń:

| wynik | wariant |
|---|---|
| **4** | `block[a44<tok0+tok1+tok2+tok3]` ← **wybór bota** |
| 3 | `block[a33<tok1+tok2+tok3]` (i permutacje) |
| 1 | `block[a44<tok0]` (×4) |
| **1** | `block[a44<tok0 a33<tok1]` ← **poprawne zagranie** |
| 0 | `block[a33<tok0]` (×4), `block[]`, `pass_priority` |
| −∞ | warianty marnujące blokery |

Bot topił **wszystkie cztery** tokeny w jednym 4/4 i wciąż dostawał 3 obrażenia,
zamiast zatrzymać całe 7 dwoma tokenami. Przy dwóch tokenach split remisował
z blokiem jednego ataku (1 = 1) i przegrywał kolejnością ofert.

**Uczciwa granica odtworzenia:** w minimalnej replice bot jednak *blokował*
(dostałby 3, nie 7). Pełnych 7 obrażeń bez żadnego bloku nie udało się
odtworzyć przy nietapniętych tokenach bez evasion — jedyny wariant dający
dokładnie ten obraz to **tokeny tapnięte** (wtedy `block[]` jest jedyną legalną
opcją i jest to zachowanie poprawne, CR 509.1a). Jeśli w partii właściciela
atakujący mieli flying/menace albo tokeny były tapnięte, to inna przyczyna —
do potwierdzenia.

## 3. Przyczyna

W `case 'declare_blockers'` zablokowane obrażenia i utracone ciała blokerów były
liczone **w tej samej skali 1:1**: `+attackerPower` vs `−(P+T)`. Skutek:

- chump 3/3 tokenem 1/1 = `3 − 2 − 1` = **0**, czyli **dokładnie tyle samo co
  pass** — model był obojętny na przyjęcie 3 obrażeń;
- premia za zabicie (`2P+T` = 12 dla 4/4) przeważała 3 punkty zablokowanych
  obrażeń i 2 zatrzymane tokeny, więc „cztery 1/1 na jednego 4/4" (4) biło
  „zatrzymać całe 7 dmg dwoma tokenami" (1).

## 4. Czego NIE zrobiłem i dlaczego

**Płaska waga obrażeń** (`score += attackerPower * 3`) naprawiała ten przypadek,
ale łamała **9 testów**, w tym piny jawnie anty-over-fix:

- `r5/B: 30 życia — blok 2/2 vs 3/3 NIE wygrywa z passem`
- `B (anty-over-fix): bot NIE marnuje WARTOŚCIOWEGO blokera (3/3)`
- `blok NIE ratujący: bot nie marnowuje blokera (3× 3/3, 5 życia)`

Wniosek: rozróżnikiem **nie jest** waga obrażeń, tylko **opłacalność wymiany**.

## 5. Rozwiązanie

Premia **tylko od nadwyżki** i **tylko gdy bloker realnie ginie**:

```js
if (blockerValueLost > 0 && attackerPower > blockerValueLost) {
  score += (attackerPower - blockerValueLost) * P.blockGoodTradePerPoint;
}
```

Nowe pokrętło `blockGoodTradePerPoint: 2`.

Token 1/1 za 3 obrażenia → nadwyżka 1 → premia. 2/2 za 3 obrażenia → nadwyżki
brak → premia nie zachodzi, więc piny anty-over-fix zostają zielone.

## 6. Pomiar PO

| wariant | PRZED | PO |
|---|---|---|
| 4 tokeny vs 4/4 + 3/3 | `a44<4 tokeny` → **3 dmg** | `a44<tok0 a33<tok1` (7) → **0 dmg** |
| 3 atakujących (10 dmg) | `a44<4 tokeny` → **6 dmg** | blokuje wszystkich trzema (21) → **0 dmg** |
| 2 tokeny vs 4/4 + 3/3 | `a44<tok0` (1) → **3 dmg** | `a44<tok0 a33<tok1` (7) → **0 dmg** |
| tokeny tapnięte | `block[]` | `block[]` (bez zmian, poprawne) |

## 7. Zmierzony forward (NIE naprawiony w tej fali)

Przy **lethal** drabinka `lifeAfter` jest **niemonotoniczna** względem
zablokowanych obrażeń (mniej życia po = większa premia). Przy 7 życiu i ataku
4/4 + 3/3:

- „blok tylko 4/4, dostaję 3": lifeAfter 4 → +4
- „blok obu, dostaję 0": lifeAfter 7 → +2

Różnica 2 punktów dokładnie kasuje przewagę lepszego bloku — **oba warianty
mają 39** i o wyborze decyduje kolejność ofert.

Próba domknięcia epsilonem `stoppedDamage * 0.01` rozstrzygała remis poprawnie
(wszystkie warianty sondy wybierały dobrze), ale **ułamkowy wynik łamał piny
wartości dokładnych** (`PMSSB-2/C/F8` Dissenter +19, Patron 6), więc została
wycofana. Właściwa naprawa: drabinka monotoniczna względem `stoppedDamage` —
osobna fala, bo dotyka pinów M146 i M257-r5.

## 8. Bramy

| brama | wynik |
|---|---|
| piny fali | **8/8** |
| szybki zestaw (`npm test`) | **7203/7203** |
| build | 70 mod / **4661,6 kB** |
| `test:all` przed regeneracją | 7472/7474 — 2 faile, oba golden-master |
| `test:all` po regeneracji | **7474/7474, EXIT=0** |

## 9. Lekcja do handoffu

**Piny anty-over-fix są wartością, nie przeszkodą.** Płaska waga „naprawiła"
zgłoszenie i zepsuła 9 testów, z których trzy powstały właśnie po to, żeby
ktoś kiedyś nie przesadził w drugą stronę. Gdy poprawka łamie pin
anty-over-fix, to zwykle znaczy, że wybrano złą zmienną — tu: wagę obrażeń
zamiast opłacalności wymiany.
