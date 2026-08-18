# PLAN M134–M137 — cztery tematy z backlogu wskazane przez właściciela

Data: 2026-08-18 · gałąź `arena/01a01143-mtg` · PR #58 (kontynuacja)

## Zlecenie właściciela

Z `docs/backlog.md` wskazane jako „godne ewentualnego zajęcia się dzisiaj":

1. **Puste kolejki decyzji** — przegląd profilaktyczny, czy każda decyzja ma
   opis w logu (L24 o „cichych skutkach").
2. **Wycena decyzji bota** — bot przy scry/surveil bierze pierwszą ofertę
   zamiast wybierać. Gra działa, po prostu mógłby grać lepiej.
3. **Sonda surveil / damage wizard** — luki w pokryciu *narzędzia audytowego*,
   nie w grze: te dwa miejsca nie są mierzone przez sondę „oferta bez skutku".
4. **Kontrakt `addObject`** — z L21: pole spoza kontraktu fabryki ginie po
   cichu, przez co dwa testy przechodziły z fałszywych powodów.

Właściciel zaznaczył charakter tych pozycji: to **pomysły profilaktyczne**,
nie zgłoszone usterki. Sukcesem jest więc rzetelny pomiar i trwały strażnik,
a nie „naprawa" czegoś, co działa.

## Rozpoznanie wstępne (zmierzone przed kodowaniem)

### Temat 1 — puste kolejki decyzji: **log jest kompletny**

| miara | wynik |
|---|---|
| zdarzenia emitowane w `src/engine/` | **177** |
| z nich opisanych w `describeGameEvent` | **177 (100 %)** |
| komendy `resolve_*` oferowane w widoku | 50 |
| z nich obsługiwane w `execute` | **50 (brak soft-locków)** |

Czyli sam przegląd nie znalazł usterki — i to jest wynik, nie porażka.
Realne znalezisko jest inne: **6 typów zdarzeń zarejestrowanych w
`EVENT_TYPES`, których nikt nigdy nie emituje**:

```
game_created                 (używany — lista wyciszeń w session.js)
proliferate_resolved         (używany — ma opis i test M96/2)
delayed_trigger_scheduled    MARTWY
proliferate_target_required  MARTWY
reveal_resolved              MARTWY
reveal_order_required        MARTWY
```

To L29 od drugiej strony: rejestr obiecuje zdarzenia, które nie istnieją.
Dodatkowo brakuje **strażnika w drugą stronę** — dziś nic nie pilnuje, żeby
nowe zdarzenie dostało opis; wyszłoby to dopiero surowym slugiem w logu
gracza (`default: return e.type`), czyli dokładnie tak, jak w M96 i M126.

### Temat 4 — kontrakt `addObject`: dług potwierdzony w L21

Lekcja L21 mówi wprost: „Strażnik »addObject rzuca na nieznane pole« byłby
ładniejszy, ale dziś wywraca ~40 plików testów". Trzeba zmierzyć, ile
naprawdę, i wybrać wariant, który nie wymaga przepisania pół repozytorium.

## Etapy

- [x] **E0.** Rozpoznanie (wyżej) + ten plan jako osobny commit.
- [x] **E1 (M134, temat 1).** Strażnik dwustronny kompletności zdarzeń:
      (a) każde zdarzenie emitowane w engine ma opis w `describeGameEvent`,
      (b) każdy typ w `EVENT_TYPES` jest gdzieś używany (koniec martwych
      wpisów). Usunięcie 4 martwych typów.
- [x] **E2 (M135, temat 2).** Wycena scry/surveil w bocie: dziś „pierwsza
      oferta". Reguła po deskryptorach (ADR 0002): land vs czar, stan ręki,
      krzywa many. Benchmark musi potwierdzić brak regresji.
- [x] **E3 (M136, temat 3).** Klucz sondy dla wizarda surveil i wizarda
      obrażeń — pokrycie narzędzia audytowego, wzorzec z M112 (walka).
- [x] **E4 (M137, temat 4).** Walidacja kontraktu `addObject` — wariant, który
      wskaże literówki, nie wywracając istniejących testów.
- [x] **E5.** `npm run test:all`, `npm run build`, benchmark, dokumentacja.

## Kryteria ukończenia

1. `npm run test:all` zielony w całości (baseline: 2169/2169).
2. `npm run build` produkuje `dist/mtg-table.html`.
3. Benchmark profilu szybkiego bez regresji (baseline 62,1 % vs aggro na
   8 seedach po M132).
4. Każdy temat kończy się **trwałym strażnikiem**, nie jednorazową poprawką —
   to były pozycje profilaktyczne, więc wartość jest w tym, że problem nie
   wróci.

## Ryzyka i pułapki

* **T1:** usunięcie typu z `EVENT_TYPES` może zepsuć kod, który go nazywa
  (np. lista wyciszeń) — sprawdzić każde wystąpienie osobno, nie hurtem.
* **T2:** zmiana decyzji bota wpływa na benchmark i na testy z zamrożonym
  seedem (koszt znany z M132) — mierzyć na 8 seedach, nie na 4 (L36).
* **T2:** scry/surveil ma odwrotną semantykę „dołu": przy scry karta idzie na
  spód biblioteki, przy surveil do GROBU. Wycena musi to rozróżniać, inaczej
  bot zacznie mielić sobie dobre karty.
* **T4:** twarda walidacja `addObject` wywraca ~40 plików (L21). Rozważyć
  wariant nieinwazyjny: strażnik jako TEST czytający źródło testów, albo
  walidacja włączana flagą w trybie testowym.
* Wszystkie cztery tematy są profilaktyczne — jeśli pomiar pokaże, że problemu
  nie ma, **wynikiem jest strażnik i zapis pomiaru**, a nie sztuczna zmiana.

## Podsumowanie wykonania

| temat | wynik | trwały strażnik |
|---|---|---|
| 1 — puste kolejki decyzji | log był **kompletny** (177/177); znalezione i usunięte **4 martwe typy** w `EVENT_TYPES` | `test/m134-kompletnosc-zdarzen.test.js` — dwustronny |
| 2 — wycena scry/surveil | **realna usterka**: warianty remisowały (`score: 20`), bot brał pierwszą ofertę i odkładał dobrego stwora | `test/m135-wycena-scry-surveil.test.js` |
| 3 — sonda wizardów | **3 luki** pokrycia: krok kolejności, damage wizard, wizard index | `test/m136-sonda-wizardow.test.js` |
| 4 — kontrakt `addObject` | **4 pola** ginęły po cichu; naprawione 39 wywołań w 23 plikach | `test/m137-kontrakt-addobject.test.js` |

### Temat 1 — przegląd, który „nic nie znalazł", i to jest wynik

Pomiar: 177/177 zdarzeń emitowanych przez silnik ma opis w logu, 50/50 komend
`resolve_*` ma obsługę w `execute` (brak soft-locków). Zamiast sztucznej
zmiany — **strażnik dwustronny**, bo dotąd kompletności logu nie pilnowało nic
i brak opisu wychodził dopiero surowym slugiem u gracza (tak powstały M96
i M126). Przy okazji: `EVENT_TYPES` obiecywał 6 zdarzeń, których nikt nie
emituje; 4 w pełni martwe usunięte, 2 (`game_created`, `proliferate_resolved`)
są używane przez warstwę stołu i zostają.

### Temat 2 — jedyna realna usterka w tej czwórce

Wycena rozpoznawała JEDEN przypadek („land przy przesycie"), wszystko inne
dostawało równe `20`. Trace potwierdził remis obu wariantów — stąd „pierwsza
oferta". Zmierzony skutek: przy scry 1 z Highland Game (2/1 za {2}) bot
odkładał dobrego, taniego stwora na spód biblioteki.

Naprawa: jedna funkcja `cardKeepValue` („czy chcemy tę kartę dobrać?") używana
przez scry, surveil i clash — zamiast trzech kopii tego samego warunku (L28).
Rozróżnia semantykę: scry odkłada na SPÓD (odsunięcie), surveil wyrzuca do
GROBU (CR 701.44 — strata nieodwracalna), więc surveil ma wyższy próg.

Benchmark po zmianie: **63,0 %** vs aggro (było 62,1 %) i **90,4 %** vs random
(było 89,3 %) — bot gra lepiej, dokładnie o to chodziło w zgłoszeniu.

### Temat 4 — dlaczego OSTRZEŻENIE, a nie wyjątek

L21 ostrzegała, że twardy strażnik „wywraca ~40 plików". Pomiar: cztery pola
w 24 plikach, a twardy rzut wywalił **141 testów** — bo pola trafiają tam
przez `...spread` w helperach (46 plików). Rozwiązanie dwutrybowe: domyślnie
ostrzeżenie z konkretną podpowiedzią (raz na pole), a `MTG_STRICT_ADD_OBJECT=1`
daje twardy wyjątek do sprzątania i dla strażnika. Kod produkcyjny (`src/`)
jest czysty i pilnuje tego osobny test.

**Ujawniony fałszywie zielony test** (dokładnie wzorzec z L21): „BUG3: Dunland
Crebain amass" oczekiwał 2 liczników, bo licznik startowy z `counters:` ginął
w fabryce. Po naprawie są 3 (1 startowy + 2 z amass) — asercja poprawiona
i rozszerzona o drugą armię.

### Pomiary

* `npm run test:all` — **2196/2196**, 0 failów (baseline sesji: 2169).
* `npm run build` — zielony.
* Benchmark (8 seedów, 2 496 meczów): heuristic **63,0 %** vs aggro,
  **90,4 %** vs random — poprawa względem 62,1 % / 89,3 %.
* Weryfikacja mutacyjna każdego strażnika (uszkodzenie kodu → test pada).
