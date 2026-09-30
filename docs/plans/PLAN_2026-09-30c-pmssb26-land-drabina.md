# PLAN_2026-09-30c — PMSSB-26: wartość landu jako drabina

Data: 2026-09-30 · Metoda: **M429** · Gałąź: `arena/01a0eec8-mtg` · Baza: `88638ff`
Sonda pomiarowa: `scratch/pmssb26-land-przed.mjs` · Commit: `5f31e00`

## 0. Źródło: specyfikacja właściciela, nie domysł

Pętla otwarta z forwardu PMSSB-25 (D4): przy koszcie odrzucenia land przegrywał z każdą
kartą o niezerowym koszcie, bo reguła ciała liczy land jako `2 · manaCost` = 0. Pomiar
dodatkowy (`scratch/pmssb25-d4b.mjs`) pokazał, że przy 0 lądów bot wyrzuca land i zostawia
artefakt za {2}, którego nie ma z czego rzucić (19 vs 15).

Właściciel podał regułę (2026-09-30):

> **land KOLOROWY** — wartość proporcjonalna do ilości danego pipa na stole i w ręce:
> 0 → bardzo duża (nigdy nie odrzucaj) · 1 → spora (zwykle nie) · 2 → neutralna (raczej nie) · 3+ → niska (raczej odrzucaj)
>
> **land BEZBARWNY i/lub utylitarny** — od sumy lądów na stole i w ręce:
> 0-2 → bardzo duża · 3-4 → spora · 5-6 → neutralna · 7+ → niska

## 1. POMIAR PRZED

| Scenariusz | PRZED | Czytanie |
|---|---|---|
| basic-forest, 1 / 2 / 3 / 5 źródeł {G} | **20 / 20 / 20 / 20** | wartość landu w ogóle nie zależała od manabazy |
| land utylitarny, suma 1 / 3 / 5 lądów | **19 / 19 / 19** | j.w. |
| land utylitarny, suma 7 / 10 lądów | 31 / 31 | jedyny próg: stary `landsInHand>=3 \|\| landsOnBoard>=6` |
| 0 lądów, land vs artefakt {2} | land **19**, artefakt 15 | **błąd** — wyrzuca land, zostawia kartę bez many |

Stara reguła była jednoprogowa (`−6` przy przesycie, inaczej `8`/`3`) i nie rozróżniała
kolorów: pięć lasów i jeden las były warte tyle samo.

## 2. Wdrożenie

**`landKeepValue(view, card)`** w `heuristic-bot.js` (przed `cardKeepValue`), podłączona
w miejsce starej gałęzi landu — więc działa wszędzie tam, gdzie wspólna miara:
`resolve_scry`, `resolve_surveil`, `resolve_look_top_choice`, `resolve_clash_choice`, mill
i od PMSSB-25 także `resolve_discard_choice`.

Kolory landu z `koloryZrodlaWidoku` = `getSourceForObject` (`src/engine/mana-sources.js`):
podtypy podstawowe wg **CR 305.6** (Plains/Island/Swamp/Mountain/Forest → W/U/B/R/G) plus
deskryptory zdolności many. Jedno źródło prawdy z `colorCastable`, zero map nazw kart
(ADR 0002).

**Dwie decyzje interpretacyjne, obie dosłowne wobec specyfikacji:**
1. Licznik obejmuje rękę, więc land oceniany **w ręce liczy sam siebie** — stopień „0"
   pojawia się dopiero, gdy land leży poza nią (np. na wierzchu biblioteki przy scry).
   Dlatego przy koszcie odrzucenia najlepszy stopień dla jedynego źródła koloru to „spora".
2. Land wielokolorowy liczony po **najmniejszym** liczniku spośród jego kolorów: wartość
   dyktuje najbardziej brakujący kolor.

**Domknięcie od drugiej strony:** `discardCostPreference` czytał wspólną miarę tylko gdy
ujemna, więc cała dodatnia drabina (30/18/8) zapadała się do jednego wyniku. Teraz
`-min(30, max(ciało, wspólna))` — reguła ciała pozostaje suwitem dla dużych ciał
(6/6 = 18 > 12 ze wspólnej), a wspólna dochodzi do głosu tam, gdzie ciało milczy.

**Pokrętła (10):** `landKeepCritical` 30 · `landKeepHigh` 18 · `landKeepNeutral` 8 ·
`landKeepSaturated` −6 · `landColoredCriticalMax` 0 · `landColoredHighMax` 1 ·
`landColoredNeutralMax` 2 · `landTotalCriticalMax` 2 · `landTotalHighMax` 4 ·
`landTotalNeutralMax` 6.

## 3. POMIAR PO

Drabina widoczna w decyzji odrzucenia (land vs stwór 2/1 = 11 pkt):

| Stopień | Licznik | Land | Werdykt |
|---|---|---|---|
| bardzo duża | 0 źródeł / suma 1 | **−10** | nigdy nie odrzucaj |
| spora | 1 źródło / suma 3 | **2** | zwykle nie odrzucaj |
| neutralna | 2 źródła / suma 5 | **12** | remis ±1 ze zwykłym stworem |
| niska | 3+ źródeł / suma 7 | **31** | raczej odrzucaj |

## 4. Piny i mutacja

`test/audyt-pmssb26-land-drabina.test.js` (13): A1–A4 drabina kolorowa (w tym A4 przez
scry, bo „0" wymaga landu poza ręką), B1–B4 drabina bezbarwna, C1 kotwica M408,
C2 niezależność od `cardDuplicateDiscount`, C3 `Math.min` po kolorach (Prismari Campus
{U}{R} przy 4 wyspach: 5 źródeł {U}, 1 źródło {R} ⇒ 2 pkt, nie 31), C4 progi jako
pokrętła, C5 monotoniczność.

**Zaktualizowane piny kotwiczące starą płaską regułę** (każdy z zachowaniem pierwotnej
intencji testu):
- `PMSSB-24/C3` — 12/12 → **2/12** (druga kopia landu zmienia wartość przez drabinę, nie
  przez regułę duplikatów; C2 sprawdza, że `cardDuplicateDiscount` nie ma wpływu).
- `PMSSB-25/A2` — przesycenie liczone per pip (3 źródła {G}), nie po sumie lądów.
- `PMSSB-25/A4` — z „karty grywalne bez zmian" na „bierze lepszą z dwóch miar" (14 → 11).
- `audyt-pr105-bot-hand-top` **B** — przypadek brzegowy przesunięty z 2 na **0** lądów;
  nowy **B2** kotwiczy, że 3 źródła tego samego pipa to przesycenie.
- `bot-wyceny-pakiet-c` **E2/C1** — mechanizm „bierze najcenniejszą, nie pierwszą"
  kotwiczony przy stojącej manabazie (3 lasy); nowy **C2**: przy 0 lądów bierze land.

**Mutacja M1** (drabina zastąpiona starą płaską regułą) → RED: **14 pinów w 5 plikach**
(PMSSB-24/C3, PMSSB-25/A2, PMSSB-26/A1/A3/A4/B1/B2/B3/C2/C3/C4/C5, pr105/B2, pakiet-c/C2).
Po przywróceniu 7172/7172.

## 5. Bramki

- `npm test` **7172/7172** · `npm run build` 70 mod / **4654.1 kB**
- `npm run test:all` **7443 / 7443, exit 0** — dopiero po **świadomej regeneracji**
  golden-mastera (`node tools/bot-scoring-snapshot.mjs --write`,
  overallHash `6f6ccbbd…` → `8c459fdc…`). Pierwsze przejście: 7441/7443, dwa faile
  golden-mastera — nowa wycena landu zmienia ślad bota w pełnych partiach
  (`ravnica|innistrad-wu@1001`: decyzje 241 → 245, scoreSum 2702.6908 → 2706.7108).
  Komunikat testu wprost rozróżnia refaktor od świadomej zmiany parametrów i dla tej
  drugiej każe regenerować; to specyfikacja właściciela, nie refaktor.

## 6. Konsekwencja do potwierdzenia — ROZWIĄZANA przez PMSSB-27

Drabina per pip **zmieniała wcześniej uzgodnione zachowanie** z `audyt-pr105-bot-hand-top`
(„nie wyrzucaj automatycznie lądu — przy niedoborze many zachowaj go"): przy 2 lasach na
stole i trzecim w ręce bot oddawał trzeci las zamiast 9-manowego czaru poza zasięgiem.

Wątpliwość wynikała z licznika obejmującego kartę rozważaną. Właściciel doprecyzował
(2026-09-30): „raczej odrzucaj" miało znaczyć **3 na stole albo 2 na stole i 1 dodatkowy
w ręku — poza tym rozważanym**. Licznik źródeł nie obejmuje więc karty ocenianej, próg
`landColoredNeutralMax` zostaje 2, a pierwotny pin `audyt-pr105` B wrócił do postaci sprzed
PMSSB-26. Szczegóły i pomiar PO: `docs/PROJECT_HISTORY.md` §2026-09-30d.
