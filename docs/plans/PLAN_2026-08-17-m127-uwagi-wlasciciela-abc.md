# PLAN M127–M129 — uwagi właściciela A/B/C z testów (2026-08-17)

Data: 2026-08-17 · gałąź `arena/01a01143-mtg` · PR: (do otwarcia)

Punkt startowy: czysty `main` po scaleniu PR #57.
Baseline zmierzony na starcie sesji: `npm run test:all` → **2133/2133, 0 failów**.

## Zlecenie właściciela (dosłownie)

> **A.** Jeśli w Rozgrywce podawane są informacje o kreaturze zagranej jako
> morph to zręczniej byłoby pisać go z wielkiej litery: Morph.
>
> **B.** Przeciwnik wystawił Seer's Lantern po czym od razu ją tapnął dla many,
> której nie zużył i się zmarnowała. Po co tapował latarnię? Nie lepiej
> poczekać aż mana będzie potrzebna? Takie tapowanie na zapas i marnowanie
> jest bez sensu.
>
> **C.** Pola wyboru (ptaszki) podczas wybierania atakujących i blokujących są
> strasznie małe i trudno w nie trafić palcem na telefonie — nie dałoby rady
> jakoś zwiększyć aktywne pole wokół tych pól?

## Rozpoznanie (stan przed zmianą)

### A — „morph" małą literą

Etykieta zakrytej karty (CR 708.2) jest wpisana jako **surowy literał
`'morph'` w ośmiu niezależnych miejscach** czterech modułów warstwy stołu:

| plik | miejsca |
|---|---|
| `src/table/session.js` | log `permanent_cast`, log `spell_resolved`, `nameOfObject` |
| `src/table/render.js` | `nameOfObjectId`, `cardInfo.morphBadge`, etykieta flipa, opis stosu/triggera |
| `src/table/choice-request.js` | `objectName` (wizardy walki i obrażeń) |
| `src/table/main.js` | nazwa czaru na stosie |

To dokładnie wzorzec z lekcji **L30** (ukrycie/oznaczenie informacji musi być
w KAŻDEJ ścieżce renderu) i **L28** (n-ty punktowy literał zamiast jednego
źródła prawdy). Zmiana samej wielkości litery „w miejscu zgłoszenia" zostawi
7 pozostałych ścieżek małą literą.

### B — bot marnuje manę z niesamoczynnego źródła

`producibleMana` (silnik) auto-tapuje **wyłącznie lądy** — mana z artefaktów
(Seer's Lantern, Apprentice Wizard, Dragonbroods' Relic) wymaga JAWNEJ
aktywacji, żeby czar w ogóle pojawił się w `legalCommands`. Wycena
`add_mana` w `heuristic-bot.js` sprawdza dziś tylko, czy w ręce jest
COKOLWIEK płatnego (`hasPlayable`), a nie czy ta konkretna mana **odblokowuje
zagranie**. Skutki:

* jest co zagrać i tak stać bota bez latarni ⇒ `+4·net` i tap „na zapas";
* nie ma czego zagrać ⇒ base `score = 2` > `pass = 0` ⇒ tap mimo wszystko.

Mana znika w cleanup (CR 500.4), więc oba przypadki to czysta strata tempa —
a przy Seer's Lantern dodatkowo blokada drugiej zdolności ({2},{T}: Scry 1).

### C — mikroskopijne ptaszki w wizardzie walki

`renderCombatWizard` tworzy `label.combat-wizard-row` + `input.combat-wizard-toggle`,
ale **w `src/table/index.html` nie istnieje ANI JEDNA reguła CSS dla
`.combat-wizard-*`** (grep: 0 trafień). Ptaszek ma więc domyślny rozmiar
przeglądarki (~13–16 px), a wiersz nie ma ani paddingu, ani minimalnej
wysokości. Dla porównania ptaszek wyciszenia w panelu akcji dostał już taką
opiekę w M91 (`.action-ignore`, padding 6/12 px).

## Etapy

- [x] **E0.** Rozpoznanie + baseline `test:all` (2133/2133) + ten plan jako
      osobny commit przed kodowaniem.
- [x] **E1 (M127, uwaga A).** Jedno źródło prawdy dla etykiety zakrytej karty:
      stała + helper w `src/table/session.js`, użyte we WSZYSTKICH ośmiu
      ścieżkach. Test-niezmiennik czytający ŹRÓDŁO (L31): żaden moduł stołu
      nie może zawierać literału `'morph'` w pozycji etykiety (dozwolone
      wyłącznie porównania deskryptora `keyword === 'morph'`). Do tego testy
      behawioralne dla logu, kafla, wizarda i etykiet celów.
- [x] **E2 (M128, uwaga B).** Root cause w `scoreCommand`/`add_mana`:
      aktywacja zdolności many ma wartość tylko wtedy, gdy **odblokowuje
      zagranie niedostępne bez niej**. Reguła generyczna po deskryptorach
      (koszt karty vs mana dostępna teraz), zero nazw kart (ADR 0002).
      Anty-over-fix: gdy mana faktycznie odblokowuje czar — bot ma ją nadal
      brać (osobny test).
- [x] **E3 (M129, uwaga C).** Reguły CSS dla wizarda walki: cały wiersz jako
      cel dotyku (min. 44 px wysokości — próg Apple HIG), ptaszek 24 px,
      wyraźny stan zaznaczenia. Strażnik czytający `index.html` (wzorzec
      `test/ios-viewport.test.js` i `test/look-wizard-contrast.test.js`).
- [x] **E4.** `npm run test:all` (całość, nie wycinek), `npm run build`,
      benchmark profilu szybkiego, aktualizacja `docs/PROJECT_STATE.md`,
      `docs/LESSONS.md`, `docs/TODO.md` i opisu PR.

## Kryteria ukończenia

1. `npm run test:all` zielony w całości (≥ 2133 + nowe testy).
2. `npm run build` produkuje `dist/mtg-table.html`.
3. Benchmark profilu szybkiego bez regresji względem 61,7 % vs aggro
   (`tools/b16-m126-2026-08-17.txt`).
4. Każda z trzech uwag ma test regresyjny **i** test anty-over-fix.

## Ryzyka i pułapki

* **A:** część istniejących testów asertuje małą literę (`assert.equal(...,
  'morph')`, `/morph/` case-sensitive) — to kontrakt brzmienia, więc trzeba je
  świadomie zaktualizować, a nie obchodzić. Uwaga na `tools/table-tester`
  (ekstraktor czyta znacznik z kafla).
* **A:** nie ruszamy semantyki FoW — własny zakryty permanent nadal jest
  nazwany (CR 708.6), wrogi pozostaje bezimienny (CR 708.2). Zmienia się
  WYŁĄCZNIE wielkość litery.
* **B:** ryzyko over-fixu — zbyt ostra kara wyłączyłaby manę z artefaktów
  w ogóle i osłabiła bota (mierzone benchmarkiem). Kara musi zależeć od
  „czy to odblokowuje zagranie", nie od typu źródła.
* **B:** bot widzi wyłącznie `PlayerView` — dostępną manę trzeba policzyć
  z widoku (pula + nietapnięte lądy), nie z funkcji silnika.
* **C:** wiersz jest `<label>`, więc klik w dowolne miejsce przełącza ptaszek;
  klik w nazwę karty (fullscreen) MUSI dalej być wyłączony z przełączania
  (`stopPropagation`/`preventDefault` — test już istnieje).

## Wykonanie

(uzupełniane w trakcie — patrz sekcja „Podsumowanie" na końcu)
