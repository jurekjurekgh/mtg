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

- [ ] **E0.** Rozpoznanie (wyżej) + ten plan jako osobny commit.
- [ ] **E1 (M134, temat 1).** Strażnik dwustronny kompletności zdarzeń:
      (a) każde zdarzenie emitowane w engine ma opis w `describeGameEvent`,
      (b) każdy typ w `EVENT_TYPES` jest gdzieś używany (koniec martwych
      wpisów). Usunięcie 4 martwych typów.
- [ ] **E2 (M135, temat 2).** Wycena scry/surveil w bocie: dziś „pierwsza
      oferta". Reguła po deskryptorach (ADR 0002): land vs czar, stan ręki,
      krzywa many. Benchmark musi potwierdzić brak regresji.
- [ ] **E3 (M136, temat 3).** Klucz sondy dla wizarda surveil i wizarda
      obrażeń — pokrycie narzędzia audytowego, wzorzec z M112 (walka).
- [ ] **E4 (M137, temat 4).** Walidacja kontraktu `addObject` — wariant, który
      wskaże literówki, nie wywracając istniejących testów.
- [ ] **E5.** `npm run test:all`, `npm run build`, benchmark, dokumentacja.

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

## Wykonanie

(uzupełniane w trakcie)
