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

## Runda 2 — decyzje właściciela i nowe zgłoszenia (2026-08-17, po PR #58)

### Decyzje właściciela

1. **Test „bot tapuje latarnię przy pustej ręce" USUNIĘTY.** Właściciel:
   „tapowanie latarni przy pustej ręce to jakiś bezsens (…) Usuń to."
   Scenariusz z M126 opisywał zachowanie, które jest po prostu błędne —
   nie należało go ratować przeredagowaniem (jak zrobiłem w rundzie 1),
   tylko skasować. Pozostałe testy anty-over-fix M128 pokrywają regułę.
2. **`docs/TODO.md` → `docs/backlog.md`.** Plik pełni rolę zbioru pomysłów,
   nie kolejki zadań; nazwa ma to odzwierciedlać.

### Nowe zgłoszenia z testów

* **A.** „Gloomfang Mauler — zdolność swampcycling działa tylko na Swamp,
  więc jaki sens ma modal wyboru celu tej zdolności?"
* **B.** „Sprawdź czy po dodaniu do talii wielu nowych kart dodałeś też
  odpowiednią ilość lądów — mam wrażenie, że proporcje 2 do 1 nie są
  zachowane i lądów jest w taliach za mało."

### Rozpoznanie A (zmierzone, nie zgadywane)

Swampcycling po dedup z M122 daje w modalu **dokładnie 2 opcje**: jedno
bagno (wszystkie kopie są nierozróżnialne) + „nie znajduj karty". Modal
jest więc pytaniem „czy chcesz to, o co właśnie poprosiłeś?". Dodatkowo
etykieta pokazuje **surowy identyfikator obiektu** (`Szukanie: s-6`), bo
`session.nameOfObject` nie zna kart biblioteki (strefa ukryta, FoW).

Dwie wady w jednym miejscu: zbędna decyzja + wyciek sluga (L29).

### Rozpoznanie B (zmierzone)

Stosunek kart nielandowych do lądów w `decks/*.txt`:

| talia | nieland | landy | nieland/land | % lądów |
|---|---|---|---|---|
| azorius | 61 | 28 | 2,18 | 31,5 % |
| green | 53 | 21 | 2,52 | 28,4 % |
| red | 44 | 19 | 2,32 | 30,2 % |
| black | 45 | 20 | 2,25 | 30,8 % |
| spellslinger | 26 | 17 | 1,53 | 39,5 % |
| innistrad | 31 | 17 | 1,82 | 35,4 % |
| graveyard | 21 | 13 | 1,62 | 38,2 % |
| tokens | 21 | 15 | 1,40 | 41,7 % |
| wiedzmin | 18 | 15 | 1,20 | 45,5 % |
| mechanicy | 19 | 18 | 1,06 | 48,6 % |
| ostrza | 19 | 18 | 1,06 | 48,6 % |
| sojusznicy | 17 | 18 | 0,94 | 51,4 % |

Intuicja właściciela potwierdzona: talie, które rosły z batchami
(azorius, green, red, black), mają **28–31 % lądów** przy typowym dla
Magic **~40 %** (17/40). Rozjazd sięga 2,52 : 1 przy oczekiwanym 2 : 1.
Talie małe mają odwrotny problem (do 51 % lądów).

### Naprawy rundy 2

* **M130.** Usunięty test „bot tapuje latarnię przy pustej ręce"; `docs/TODO.md`
  → `docs/backlog.md` wraz z przeredagowanym nagłówkiem (pomysły, nie kolejka)
  i wpisem w `AGENTS.md`, żeby kolejna sesja nie traktowała go jak listy zadań.
* **M131 (zgłoszenie A).** Decyzja z JEDNYM realnym wariantem nie otwiera już
  modala — idzie do panelu jako zwykła akcja, a rezygnacja zostaje osobnym
  przyciskiem. Reguła po kształcie decyzji (opcja `found: null` / `skip: true`),
  więc obejmuje też przyszłe decyzje opcjonalne, nie tylko typecycling.
* **M132 (zgłoszenie B).** Dosypane lądy: green +6, azorius +3, black +3,
  red +3. Root cause to brak strażnika — konwencja żyła wyłącznie w prozie
  `decks/README.md`, więc każdy batch dokładał czary bez lądów. Dodany
  `test/m132-proporcje-landow.test.js` (próg 2:1, górny limit 55 %) podaje
  wprost, ilu lądów brakuje.
* **M133 (znalezione przy okazji).** Zmiana talii ujawniła **crash silnika**:
  `Error: Nieprawidłowy cel obrażeń` wywracał cały benchmark, gdy cel zdolności
  opuścił pole bitwy przed rozstrzygnięciem. Wbrew CR 608.2b engine rzucał
  wyjątkiem zamiast fizzlować. Naprawione u źródła + nowe zdarzenie
  `damage_fizzled` z powodem (L24) i opisem w logu.

### Koszt uboczny: przelosowane seedy

Zmiana składu talii przesunęła rozdania, więc pięć testów opartych na
zamrożonych seedach trzeba było przelosować hunterem (konwencja z
`test/table-session.test.js`: „przy zmianie talii przelosować tym samym
hunterem"). To nie regresje — scenariusze po prostu wypadają przy innych
seedach: endure 4→3, delirium 22→112, graveyard-top 1→14, surveil +5/63/67,
pauza bota 2→3. Szósty przypadek (mulligan) okazał się **testem opisującym
przypadek zamiast reguły**: zakładał 7 unikalnych kart w ręce, a po dosypaniu
lądów rozdanie ma duplikat. Przepisany na regułę „oferta = liczba RÓŻNYCH
kart" (dedup z M119/Z3), więc nie pęknie przy kolejnej zmianie talii.

## Podsumowanie wykonania

Wszystkie trzy uwagi naprawione **u root cause**, każda z testem regresyjnym,
testem anty-over-fix i **weryfikacją mutacyjną** (uszkodzenie kodu → test pada).

| Uwaga | Root cause | Naprawa | Testy |
|---|---|---|---|
| A | etykieta jako surowy literał w 8 miejscach 4 modułów | `FACE_DOWN_LABEL` + `faceDownName()` + 2 niezmienniki źródła | 10 |
| B | wycena pytała „czy jest co zagrać", nie „czy mana coś zmienia" | próg opłacalności liczony z widoku | 6 |
| C | dla `.combat-wizard-*` nie istniała żadna reguła CSS | cel dotyku ≥ 44 px (Apple HIG), ptaszek 24 px | 6 |

### Co wyszło poza pierwotny zakres

* **A:** mapa `KEYWORD_LABELS` nie miała wpisu `megamorph` — kolejny cichy
  wyciek slugu do UI (L29). Dodane wraz ze strażnikiem.
* **A (druga oś):** po naprawie ośmiu ścieżek NAZWY Żywy Tester pokazał
  wciąż 10 wystąpień małą literą — nazwa mechaniki w ŚRODKU zdania („potem
  obrócić za koszt morph"). Pierwszy strażnik jej nie widział, bo patrzył na
  literały w pozycji wartości. Dołożony drugi niezmiennik, czytający treść
  tekstów widocznych dla gracza. Po poprawce: 0 wystąpień małą literą, 21
  poprawnych w transkrypcie.
* **C:** ta sama wada dotyczyła stepperów przydziału obrażeń — objęte tą samą
  regułą (L28: rodzina, nie łatka).
* **Konflikt kontraktów:** test `M126/#10 (anty-over-fix)` wymagał, by bot
  tapował Seer's Lantern przy pustej ręce — czyli dokładnie zachowania
  zgłoszonego teraz jako błąd. Scenariusz przeredagowany tak, by zachować
  intencję M126 (jałowe scry nie wyłącza produkcji many), ale w sytuacji,
  gdzie mana faktycznie odblokowuje zagranie.

### Pomiary

* `npm run test:all` — **2155/2155**, 0 failów (baseline sesji: 2133).
* `npm run build` — `dist/mtg-table.html`, 51 modułów.
* Benchmark (profil szybki, 1248 meczów): heuristic vs aggro **61,5 %**,
  ogółem **75,1 %**, vs random 88,6 % — bez regresji wobec 61,7 % / 75,3 %
  z M126 (różnica w granicach szumu próbki).
* Żywy Tester: 4 partie na zbudowanym artefakcie, 0 zgłoszeń detektorów.

### Nowe lekcje

* **L34** — kopia „przed naprawą" zrobiona po edycji kłamie; wersję bazową
  bierz z `git show HEAD:`, a diagnostyka ma drukować pełną decyzję, nie
  wynik predykatu. Test, którego nie widziałeś czerwonego, nie jest testem
  regresyjnym.
* **L35** — nowy widget dziedziczy dług dotykowy, jeśli cała rodzina kontrolek
  nie ma reguły; pytaj o rodzinę (wszystkie checkboxy/steppery), nie o
  zgłoszony element.
