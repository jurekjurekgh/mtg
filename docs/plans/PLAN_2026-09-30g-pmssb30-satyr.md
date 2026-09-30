# PLAN 2026-09-30g — PMSSB-30: podgląd satyra na wspólnej mierze + podłoga z ciała

Kontynuacja L41/L137 (jedna miara wartości karty). Fale: PMSSB-24 (scry/surveil),
PMSSB-25/26/27 (drabina lądów), PMSSB-28 (wybór koloru), PMSSB-29 (szukanie).

## 1. Znalezisko

`case 'resolve_satyr_look_choice'` (`src/controllers/heuristic-bot.js:10907`)
był **czwartą** równoległą miarą wartości karty:

```js
30 + (card.kind === 'land' ? 30 : 0) + 2 * power + toughness
```

Komentarz w kodzie obiecywał „Ląd premiami za manabazę" — ale premia była
**stała** (30 pkt) i nie czytała ani jednego lądu.

### Pomiar PRZED

Sonda `/home/user/scratch/pmssb30-satyr-przed.mjs`. Odsłonięte: land,
`delta-bloodflies` {1}{B} 1/2, `woolly-loxodon` {5}{G}{G} 6/7, `courage-in-crisis`.
Wyniki **identyczne przy 0, 3, 8 i 12 lądach** na stole:

| karta | 0 lądów | 3 | 8 | 12 |
|---|---|---|---|---|
| land | **60** | 60 | 60 | 60 |
| bomba {5}{G}{G} | 49 | 49 | 49 | 49 |
| stwór {1}{B} | 34 | 34 | 34 | 34 |
| czar | 30 | 30 | 30 | 30 |
| rezygnacja `resolve_satyr_look_choice(?)` | −5 | −5 | −5 | −5 |

Bot brał land tak samo chętnie przy pustym stole jak przy ośmiu źródłach many.

## 2. Rozwiązanie

```js
if (!card) return finish(P.satyrLookBase);
return finish(P.satyrLookBase
  + Math.max(handCardKeepValue(view, card), cardKeepValue(view, card)));
```

Nowe pokrętło `satyrLookBase: 30` (guard + default w `heuristic-params.js`).
Rezygnacja zostaje −5.

## 3. Sprostowanie własnego PMSSB-29 (najważniejsza część tej fali)

Pierwotnie podpiąłem tu **samą** wspólną miarę — i pękł pin
`test/real-cards-batch55.test.js:706` (B55/B4, Brightwood Tracker):

> `assert.equal(chosen.pickId, best, 'wycena P*2+T wybiera 4/5 nad 1/1')`

Przy 0 lądów próg zasięgu (`cost > reach + 2` → −3) wyceniał `rotting-legion`
4/5 za 5 na −3, a `typhoid-rats` 1/1 za 1 na +7 — bot odwracał wybór na gorszą
kartę.

**To obaliło tezę PMSSB-29**, że manabaza zmienia wybór przez próg zasięgu
bomby (22 przy 0 lądów → 37 przy 8). Karta podglądnięta *i* szukana idzie
**na stałe do ręki** — na dojście do many jest wiele tur, więc kara za chwilowy
brak many jest za ostra. Obowiązuje **podłoga z ciała**:
`max(handCardKeepValue, cardKeepValue)` — ten sam wzorzec, który
`discardCostPreference` dostał w PMSSB-26. Zastosowany w **obu** miejscach
(`resolve_search_choice` i `resolve_satyr_look_choice`).

### Mechanizm, który naprawdę działa

O kolejności decyduje **land** — jedyna karta, której ciało milczy
(`2 · manaCost` = 0):

| | search (baza 25) | satyr (baza 30) |
|---|---|---|
| land przy 0 lądów | **55** | **60** |
| land przy 3+ lądach | 25 | 30 |
| bomba {5}{G}{G} | 46 (stałe) | 51 (stałe) |
| stwór {1}{B} | 32→33 | 37→38 |
| wybór przy 0 lądów | **land** | **land** |
| wybór przy 3+ lądach | **bomba** | **bomba** |

Manabaza **nadal zmienia wybór** — ale przez drabinę lądów, nie przez zasięg.

### Druga obalona teza: „granica uczciwości" z B4

PMSSB-29 B4 twierdził, że dwa czary bez P/T muszą remisować, bo widok nie
wystawia treści karty z biblioteki (strefa ukryta, CR 400.2). Remis brał się
stąd, że `cardKeepValue` **ignorował koszt** dla karty w zasięgu. Podłoga
`2 · manaCost` rozróżnia je uczciwie: `courage-in-crisis` {3} → 31,
`serras-embrace` {4} → 33 (różnica dokładnie 2).

**Zawężona granica** (nadal prawdziwa): czary o tym samym koszcie i bez P/T
wciąż remisują — widok nie mówi, co robią. Fałszywego rozróżnienia nie
wymyślamy.

## 4. Piny

`test/audyt-pmssb30-satyr.test.js` (8) + skorygowane 8 w
`test/audyt-pmssb29-search.test.js`:

- **A1** — przy 0 lądów land bije wszystko (60 > 51)
- **A2** — przy przesycie lądów land spada pod każdą kartę z ciałem (30 < 51)
- **A3** — wynik bomby jest stały; o wyborze decyduje land
- **A4** — kolejność zmienia się z manabazą (land → bomba)
- **B1** — wzięcie karty zostaje daleko nad rezygnacją (−5)
- **B2** — baza jest pokrętłem, człon merytoryczny dochodzi osobno
- **B3** — drabina lądów PMSSB-26 dochodzi przez jej własne pokrętła
  (`landColoredNeutralMax` 2→3 przesuwa land 30 → 38)
- **B4** — search i satyr dzielą **jedną** miarę, różnią się tylko bazą

## 5. Bramy

| brama | wynik |
|---|---|
| search + satyr + batch55 | **73/73** |
| szybki zestaw (`npm test`) | **7195/7195** |
| build | 70 mod / **4659,5 kB** |
| `test:all` PRZED regeneracją | 7464/7466 — 2 faile, oba golden-master |
| `test:all` PO regeneracji | **7466/7466, EXIT=0**, `ok 1733/1734/1735` |

Regeneracja była konieczna: `scoreSum` partii `dominaria-brg|mirrodin-wu@1000`
2896.5881 → 2918.5881. PMSSB-28 i PMSSB-29 regeneracji **nie** wymagały — tamte
fale zmieniały ścieżki, których fixture nie pokrywa; PMSSB-30 dotyka wyceny
karty w realnej rozgrywce.

## 6. Dalej

- `resolve_graveyard_top_choice` (`:10676`) — kandydaci wyłącznie stworów,
  drabiny lądów nie ma gdzie zastosować; zostaje.
- `escapeExileCostOf` (`:1072`) — ostatni dwugałęziowy stub; zablokowany
  brakiem kart z `escape`/`flashback` w rejestrze.
- topdeck urgency multiplier — dotyka wspólnej `cardKeepValue`, więc też
  mill/`look_top`; wymaga osobnej fali.
