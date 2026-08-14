# Żywy tester stołu — audyt rozgrywki „z perspektywy gracza"

> Narzędzie: `tools/table-tester/` (automatyczny gracz na artefakcie przez jsdom).
> Wprowadzone: M73b (2026-08-11, PR #42). Pomysł właściciela: „wciel się w
> gracza, rozegraj partię i obserwuj stół".

## Po co to jest

Testy engine (`npm test`) weryfikują reguły i protokół. Ale **nie weryfikują
tego, co faktycznie widzi gracz**: etykiet akcji, modalów wyboru, zachowania
bota, kolejności rozstrzygania na stole, logu. „Żywy tester" wypełnia tę lukę:

- ładuje **prawdziwy zbudowany artefakt** `dist/mtg-table.html` (ten sam plik,
  który otwierasz na telefonie),
- uruchamia partię człowiek-vs-bot i **gra rolę gracza** — klika akcje w panelu
  „Twoje działania", odpowiada na modale (mulligan, szukanie w bibliotece,
  scry/surveil, wizardy atakujących/blokujących, wybory celów), zamyka modal
  „Ruch przeciwnika",
- zapisuje **transkrypt**: wskaźnik tury, stos, panel akcji, ręka, pola,
  ogon logu w kolejnych krokach.

To narzędzie **audytowe** — wykrywa błędy UX i „głupie zachowania", które
przeszłyby przez testy engine. Nie zastępuje `npm test` ani testów na
telefonie (jsdom nie renderuje layoutu/obrazów — patrz „Ograniczenia").

## Jak używać (dla agentów)

```bash
npm run build                      # 1. zbuduj artefakt (wymagany)
cd tools/table-tester && npm i     # 2. zainstaluj jsdom (jedyna zależność)
node run-game.mjs --human green --bot red --seed 42 --steps 300 --out g1.txt
```

Opcje:

| Opcja | Znaczenie | Domyślnie |
|---|---|---|
| `--human <talia>` | talia gracza (nazwa z `decks/*.txt` bez `.txt`) | `green` |
| `--bot <talia>` | talia bota | `red` |
| `--seed <n>` | seed partii | `42` |
| `--steps <n>` | limit kroków gry | `300` |
| `--out <plik>` | plik transkryptu | `transcript.txt` |
| `--quiet` | bez snapshotów co krok (mniejszy transkrypt) | — |
| `--profile <p>` | profil gracza: `greedy`/`random`/`defensive`/`explorer` | `greedy` |
| `--policy-seed <n>` | seed decyzji profilu (powtarzalność) | `1` |
| `--tick-rate <0..1>` | jak często gracz ptaszkuje akcję (auto-pass) | `0` |
| `--snapshot-every <n>` | snapshot co n kroków (przy `--quiet`) | `3` |
| `--help` | pomoc | — |

Dostępne talie: lista `decks/*.txt` (aktualnie: azorius, black, graveyard,
green, innistrad, red, spellslinger, tokens, wiedzmin).

Przykłady kombinacji do audytu: `green vs red` (ramp vs aggro),
`tokens vs spellslinger` (tokeny i czary), `innistrad vs wiedzmin` (wilkołaki
i transformy), `azorius vs black` (aura/protection vs destroy).

### Jak czytać transkrypt

```
--- krok 12 | T. 4 On | Ty: 15 ż. | On: 20 ż. | Główna 1 ---
  STOS: Caravan Vigil (rzuca: Ty)          ← co na stosie (i kto rzucił)
  AKCJE: ...                               ← panel „Twoje działania"
  RĘKA: Forest | Servant of the Scale ...  ← kafle ręki (po jednym na kartę)
  MOJE POLA: ...                           ← kafle Twojego bitwiska
  POLA WROGA: ...                          ← kafle bitwiska wroga
  LOG: ...                                 ← ogon logu partii
  >> Zagraj ląd: Forest                    ← akcja, którą „kliknął" gracz
  [modal choice] Wybierz: Szukanie ... -> klikam opcję: ...
```

- `[STOP] brak akcji` — gra utknęła w oknie bez akcji: **sygnał do zbadania**
  (albo bug, albo okno wymagające innej interakcji — sprawdź też modale).
- `== KONIEC PARTII ==` — naturalny koniec (wygrana/przegrana/deck-out).
- `== LIMIT KROKÓW ==` — partia dłuższa niż `--steps` (podnieś limit).
- Etykiety akcji i modali to **to, co zobaczyłby gracz** — zwracaj uwagę na:
  czytelność, dublowanie kosztów, brakujące nazwy (`?`), polskie opisy.

### Profile gracza (M97)

Do wersji M96 tester zawsze klikał „pierwszą sensowną akcję" i „pierwszą opcję
modala" — całe gałęzie UI (inne tryby modalne, alternatywne cele, bloki,
ptaszki) nigdy nie były odwiedzane. Teraz `--profile` wybiera zachowanie:

| Profil | Zachowanie | Do czego |
|---|---|---|
| `greedy` (domyślny) | pierwsza sensowna akcja, atak wszystkim | regresja wyników z M80–M96 |
| `random` | losowa akcja i losowa opcja modala, czasem pass | rzadkie gałęzie UI, nietypowe sekwencje |
| `defensive` | unika ataku, blokuje czym się da, woli zdolności i pass | okna reakcji, długie partie, obrona |
| `explorer` | preferuje akcje jeszcze NIEklikane w tej partii | maksymalne pokrycie interfejsu |

Losowość jest **deterministyczna** (`--policy-seed`, xorshift32 — ADR 0005):
ten sam seed daje ten sam przebieg, więc znaleziska da się odtworzyć.

`--tick-rate <0..1>` każe graczowi czasem zaznaczyć ptaszek „nie przerywaj
auto-passu" — sprawdza oś 3 w ruchu (czy wyciszenie faktycznie przewija okna).

Przykład szerokiego audytu:

```bash
node run-game.mjs --human tokens --bot black --seed 5 --profile explorer \
  --policy-seed 3 --tick-rate 0.25 --steps 400 --out audyt.txt
```

### Detektory — automatyczny przesiew transkryptu (M97)

Każdy przebieg kończy się sekcjami `== POKRYCIE UI ==` i `== DETEKTORY ==`.
Detektory (`tools/table-tester/detectors.mjs`, testy:
`test/table-tester-detectors.test.js`) zgłaszają miejsca warte obejrzenia:

- **`info`** — surowe nazwy stref (`library → hand`), identyfikatory zdarzeń
  w snake_case, modal „Ruch przeciwnika" z samymi nagłówkami;
- **`bot`** — ta sama akcja powtórzona ≥4× w jednej turze, bot celujący
  własnym efektem w siebie;
- **`ui`** — placeholdery (`?`, `undefined`, `null`), akcja wyciszalna bez
  ptaszka;
- **`rules`** — odrzucona komenda gracza, „zadaje 0 obrażeń" w logu, komunikaty
  typu „to nie powinno się zdarzyć".

**Zgłoszenie detektora to hipoteza, nie werdykt.** Każde trzeba potwierdzić
w kodzie (patrz „Ograniczenie ≠ usprawiedliwienie" niżej) — część to artefakty
jsdom albo świadome decyzje projektowe.

### Polityka „gracza"

Sterownik wybiera akcje w ustalonej kolejności priorytetów:
dobierz kartę → zagraj ląd → rzuć czar (`Rzuć:`) → zagraj permanent (`Zagraj:`)
→ aktywuj zdolność (`Aktywuj:`) → wznow grę bota → otwórz wybór (`Wybierz:`)
→ pass. W modalu wyboru klika **pierwszą opcję** (albo zatwierdza wizarda,
a w wizardze atakujących zaznacza pierwszego dowolnego atakującego). To prosta
heurystyka — ma odgrywać partię sensownie, nie optymalnie.

## Czego szukać — osie audytu (checklista)

Decyzja właściciela (2026-08-14): audyt „z perspektywy gracza" prowadzi się
wzdłuż **trzech osi**. Każda sesja audytowa powinna przejść je wszystkie —
to one wyznaczają, co uznajemy za znalezisko, a co za szum.

### Oś 1 — bezsensowne działania bota

Czy ruch bota ma jakikolwiek sens dla gracza po drugiej stronie stołu?
Sygnały do zbadania:

- akcja **bez wpływu na grę** albo szkodząca samemu botowi (mielenie własnej
  biblioteki, niszczenie własnego permanentu, atak, który z definicji zada
  0 obrażeń, pompowanie licznika ponad próg);
- **powtarzanie** tej samej akcji w kółko (re-equip, station, mill) — zwykle
  znak, że wycena nie ma progu nasycenia;
- zagranie **jałowe wobec reguł** (removal w cel z prewencją/tarczą/regeneracją,
  „fog" we własnej turze);
- ⚠️ **zanim uznasz to za słabą heurystykę, sprawdź `PlayerView`** — bot może
  być *ślepy*, a nie głupi (ADR 0017 i lekcja L1 w `docs/LESSONS.md`).

### Oś 2 — kompletność informacji w logu i modalu „Ruch przeciwnika"

Zasada właściciela: **„wszystko poza szumem powinno tam być".** Gracz nie widzi
ruchów bota na stole, więc modal i log są jego jedynym źródłem wiedzy. Sprawdzaj,
czy widoczne są:

- zadane obrażenia **oraz** wynikająca z nich zmiana życia;
- wyniki działania czarów i zdolności (co znaleziono, kogo poświęcono, jaki
  tryb wybrano, co zostało wygnane/odbite);
- wejścia stworów, tokenów i liczników na stół;
- dobrania kart z efektów (nie z kroku dobierania — to szum);
- nadane keywordy (haste!), transformacje, obroty kart.

Szum świadomie wyciszony: `priority_passed`, `mana_changed`, `mana_produced`,
`step_advanced`, `turn_started`, `object_tapped`, `object_untapped`,
`damage_marked`, `stats_modified`, dobranie z kroku draw.

**Test mechaniczny tej osi:** przelecieć wszystkie `EVENT_TYPES` przez
`describeGameEvent` i wypisać te, które zwracają `null` — każde takie zdarzenie
jest dla gracza niewidzialne. Trzeba wtedy rozstrzygnąć: szum czy brak opisu?
Uwaga na **niespójne warianty jednego zdarzenia** (np. „nie poświęca" ma opis,
a „poświęca X" nie) — to prawie zawsze przeoczenie.

### Oś 3 — ptaszki wyciszenia auto-pass

Czy każda opcja, którą gracz może chcieć **pomijać**, ma pole ptaszka
(„nie przerywaj auto-passu")? Dotyczy czarów i zdolności — także tych
schowanych w grupach wariantów i w wizardach wyboru. Akcje obowiązkowe
albo zawsze pożądane (zagranie lądu, dobranie karty, decyzje `resolve_*`)
ptaszka **nie** dostają i to jest poprawne.

**Test mechaniczny:** wyrenderować panel akcji dla każdego typu komendy
z `OPTION_IGNORABLE_TYPES` i sprawdzić obecność `label.action-ignore`.

## Ograniczenia (ważne)

- **jsdom nie renderuje obrazów ani layoutu** — audyt dotyczy treści DOM
  (etykiety, modale, kolejność), **nie wyglądu**. Wygląd weryfikuj na telefonie
  (Pages) albo w prawdziwej przeglądarce.
- Wymagany **świeży `npm run build`** — tester działa na artefakcie, nie na
  źródłach.
- Nie testuje: hover, pełnego ekranu, gestów dotyku, kreatora talii,
  zapisu/wznowienia (wymagają przeglądarki/IndexedDB).
- Część modalów (np. rozdzielanie obrażeń combat, wybór celu z listy) działa
  przez „pierwszą opcję" — do głębszych scenariuszy sterownik można rozbudować
  (patrz roadmapa).
- jsdom bywa wolniejszy niż Node — partie z limitem 300–600 kroków trwają
  sekundy–minuty.

### Ograniczenie ≠ usprawiedliwienie — tester też się naprawia

Decyzja właściciela (2026-08-14): **jeśli tester czegoś nie widzi albo nie
obsługuje, poprawiamy TESTER — nie akceptujemy braku.** Narzędzie audytowe,
które omija fragment gry, cicho zawęża zakres każdego kolejnego audytu.

W praktyce:

- `[STOP] brak akcji` w oknie, w którym człowiek po prostu kliknąłby przycisk,
  to **luka w polityce gracza** (`pickAction` w `run-game.mjs`) — dopisz wzorzec
  etykiety i uruchom partię ponownie. Przykład: M96 — akcja „Epic Experiment:
  zakończ (reszta kart do grobu)" zatrzymywała audyt.
- Mechanika, której tester nie potrafi rozegrać (modal bez obsługi, wizard
  z nietypowym układem), wymaga rozszerzenia `resolveModal` — nie pominięcia
  talii z tą mechaniką.
- Jeżeli danej rzeczy **nie da się** sprawdzić w jsdom (wygląd, gesty, hover,
  obrazy), zapisz to jawnie w sekcji „Ograniczenia" i zweryfikuj na telefonie —
  ale nie myl tego z brakiem obsługi, który da się naprawić kodem.
- Zmiany w testerze idą tym samym rygorem co produkcja: mają test
  (`test/table-tester-output.test.js`) i opis w commicie.

**Odróżniaj artefakt narzędzia od błędu produktu.** Sklejony wskaźnik tury czy
brak P/T na kaflach w transkrypcie wynikają z tego, że jsdom nie liczy CSS
(`gap`) ani nie renderuje nakładek — to nie są błędy UI i nie zgłaszaj ich jako
znalezisk. Zawsze potwierdź źródło w kodzie, zanim opiszesz coś jako bug.

## Zgłaszanie wyników

Audyty „żywym testerem" zgłaszaj jak inne audyty (wzorzec M54/M65/M73):
- opisz **co widział gracz** (cytat z transkryptu) i dlaczego to błąd/niejasność;
- napraw u root cause (nie maskuj);
- dodaj test regresyjny (engine lub UI) blokujący powrót błędu;
- transkrypt (`--out`) zachowaj w PR lub wklej fragment do opisu.

## Rozwój narzędzia (opcje na kolejne sesje)

Pełna lista: `docs/ROADMAP.md` → sekcja „Rozwój żywego testera stołu". Krótko:
tryb interaktywny (agent steruje w pętli), screenshoty przez headless
Chromium, więcej polityk gracza, wykrywanie podejrzanych etykiet (automatyczne
flagi: `?`, dublowane koszty, puste modale), integracja z CI jako test
opcjonalny.
