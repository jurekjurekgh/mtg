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
  „Rozgrywka",
- zapisuje **transkrypt**: wskaźnik tury, stos, panel akcji, ręka, pola,
  ogon logu w kolejnych krokach.

To narzędzie **audytowe** — wykrywa błędy UX i „głupie zachowania", które
przeszłyby przez testy engine. Nie zastępuje `npm test` ani testów na
telefonie (jsdom nie renderuje layoutu/obrazów — patrz „Ograniczenia").

## Jak używać (dla agentów)

```bash
npm run build                      # 1. zbuduj artefakt (wymagany)
cd tools/table-tester && npm i     # 2. zainstaluj jsdom (jedyna zależność)
node run-game.mjs --human dominaria-brg --bot ravnica --seed 42 --steps 300 --out g1.txt
```

Opcje:

| Opcja | Znaczenie | Domyślnie |
|---|---|---|
| `--human <talia>` | talia gracza (nazwa z `decks/*.txt` bez `.txt`) | `dominaria-brg` |
| `--bot <talia>` | talia bota | `ravnica` |
| `--seed <n>` | seed partii | `42` |
| `--steps <n>` | limit kroków gry | `300` |
| `--out <plik>` | plik transkryptu | `transcript.txt` |
| `--quiet` | bez snapshotów co krok (mniejszy transkrypt) | — |
| `--profile <p>` | profil gracza: `greedy`/`random`/`defensive`/`explorer`/`impatient` | `greedy` |
| `--policy-seed <n>` | seed decyzji profilu (powtarzalność) | `1` |
| `--tick-rate <0..1>` | jak często gracz ptaszkuje akcję (auto-pass) | `0` |
| `--snapshot-every <n>` | snapshot co n kroków (przy `--quiet`) | `3` |
| `--help` | pomoc | — |

Dostępne talie: lista `decks/*.txt` — **aktualną listę wypisuje
`node run-game.mjs --list-decks`** (nie przepisuj jej tutaj: talie buduje
generator `tools/generate-plan-decks.mjs`, ADR 0023, więc skład zmienia się
przy każdym batchu kart). Nieistniejąca nazwa to jawny błąd z listą
dostępnych — tester nie gra już „czymkolwiek" (M203).

Przykłady kombinacji do audytu: `dominaria vs ravnica`, `innistrad vs
wiedzmin` (wilkołaki i transformy), `tarkir vs mirrodin`, `worek-dziki vs
worek-mroczny`.

### Priorytet doboru talii (decyzja właściciela, 2026-08-26)

Audyt „z perspektywy gracza" ma świadomie iść tam, gdzie błędy są NAJmniej
przeczesane. Kolejność priorytetów przy wyborze talii:

1. **Talie, które ostatnio dostały nowe karty** — świeży kod/dane najczęściej
   niosą nowe klasy błędów. Ustal je grepem po historii, np.
   `git log --oneline -5 -- decks/<talia>.txt` albo diffem ostatniego batcha
   (`git show <sha> -- decks/`).
2. **Talie, które NIE biorą udziału w benchmarku** (spoza `BENCH_DECKS`
   w `tools/benchmark.mjs`) — są mniej przebadane. Próbka benchmarku
   (`BENCH_DECKS`) jest odgrywana w każdej regresji bota (`bot-benchmark`),
   więc jej ścieżki są nieustannie przeczesywane; talie spoza niej bywają
   tygodniami nieodwiedzane na żywym stole.

Dopiero po nich sięgaj po talie z próbki benchmarku (to na niej mierzone są
progi bota — warto je audytować, ale mają najmniejszą szansę na świeży błąd).
`BENCH_DECKS` sprawdź w kodzie (`grep BENCH_DECKS tools/benchmark.mjs`), a listę
wszystkich talii — `node run-game.mjs --list-decks`; nie przepisuj ich tutaj,
bo generator (ADR 0023) zmienia skład przy każdym batchu.

### Jak czytać transkrypt

```
--- krok 12 | T. 4 On | Ty: 15 ż. | On: 20 ż. | Główna 1 ---
  STOS: Caravan Vigil (rzuca: Ty)          ← co na stosie (i kto rzucił)
  AKCJE: ...                               ← panel „Twoje działania"
  RĘKA: Forest | Servant of the Scale ...  ← kafle ręki (po jednym na kartę)
  MOJE POLA: ...                           ← kafle Twojego pola bitwy
  POLA WROGA: ...                          ← kafle pola bitwy wroga
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
| `greedy` (domyślny) | pierwsza sensowna akcja, atak wszystkim; na końcu kliknie **dowolną** dostępną akcję zamiast zgłaszać STOP (M250) | regresja wyników z M80–M96 |
| `random` | losowa akcja i losowa opcja modala, czasem pass | rzadkie gałęzie UI, nietypowe sekwencje |
| `defensive` | unika ataku, blokuje czym się da, woli zdolności i pass | okna reakcji, długie partie, obrona |
| `explorer` | preferuje akcje jeszcze NIEklikane w tej partii | maksymalne pokrycie interfejsu |
| `impatient` (M99) | **nie czeka** na zamknięcie pauzy bota, klika „przez" modal, czasem stuka dwa razy (double-tap) | błędy stanu po ODRZUCONEJ komendzie (Forever Young) |

Profil `impatient` powstał, bo pozostałe cztery **nie były w stanie** odtworzyć
przypadku właściciela „ekran z jedyną opcją *Poddaj partię*". Każdy z nich
najpierw zamykał modal „Rozgrywka", więc żaden nigdy nie wysłał komendy
w trakcie pauzy bota — a to jedyna droga do tej klasy błędów. Odrzucenia komend
są w tym profilu **oczekiwane** (detektor `rules` je pomija); sprawdzana jest
ich KONSEKWENCJA: czy gracz nie został bez wyjścia.

Losowość jest **deterministyczna** (`--policy-seed`, xorshift32 — ADR 0005):
ten sam seed daje ten sam przebieg, więc znaleziska da się odtworzyć.

`--tick-rate <0..1>` każe graczowi czasem zaznaczyć ptaszek „nie przerywaj
auto-passu" — sprawdza oś 3 w ruchu (czy wyciszenie faktycznie przewija okna).

Przykład szerokiego audytu:

```bash
node run-game.mjs --human worek-legend --bot theros --seed 5 --profile explorer \
  --policy-seed 3 --tick-rate 0.25 --steps 400 --out audyt.txt
```

### Detektory — automatyczny przesiew transkryptu (M97)

Każdy przebieg kończy się sekcjami `== POKRYCIE UI ==` i `== DETEKTORY ==`.
Detektory (`tools/table-tester/detectors.mjs`, testy:
`test/table-tester-detectors.test.js`) zgłaszają miejsca warte obejrzenia:

- **`info`** — surowe nazwy stref (`library → hand`), identyfikatory zdarzeń
  w snake_case, modal „Rozgrywka" z samymi nagłówkami;
- **`bot`** — ta sama akcja powtórzona ≥4× w jednej turze, bot celujący
  własnym efektem w siebie;
- **`ui`** — placeholdery (`?`, `undefined`, `null`), akcja wyciszalna bez
  ptaszka;
- **`rules`** — odrzucona komenda gracza, „zadaje 0 obrażeń" w logu, komunikaty
  typu „to nie powinno się zdarzyć".

#### Detektor nie może zależeć od poziomu logowania (M99)

Weryfikacja mutacyjna wykryła dwa detektory czytające **wyłącznie linie
snapshotów** (`STOS:`, `AKCJE:`), których pod `--quiet` w ogóle nie ma:

- `detectNoResponseWindow` produkował fałszywy alarm (czar „Index", przy którym
  gracz priorytet dostał) — bo jedynym dowodem „okno było" była linia `STOS:`;
- `detectDeadEndWindow` w 300-krokowym przebiegu oglądał **jedno** okno zamiast
  wszystkich, więc mógł przegapić właśnie ten przypadek, dla którego powstał.

Reguła: **detektor opiera się na faktach, nie na tym, ile sterownik akurat
wypisał.** Dane strukturalne (`windowRecords`, `actionRecords`,
`probeRecords`, `rejectionRecords`) zbiera sterownik w każdym kroku
i przekazuje do `runDetectors`; parsowanie linii zostaje tylko
dla transkryptów z archiwum. Nowy detektor zawsze uruchamiaj w OBU trybach
(`--quiet` i `--snapshot-every 1`) — rozjazd wyników to błąd detektora.

**M104 — trzeci taki przypadek: ODRZUCENIA komend.** `detectRuleSmells`
czytał „Ruch odrzucony" wyłącznie z linii `LOG:` snapshotu, więc pod
`--quiet` ten sam przebieg dawał 0 zgłoszeń, a ze snapshotami 3 (azorius
vs black, seed 7, profil random, `--tick-rate 0.2`). Sterownik zbiera je
teraz z DOM (`.log-rejection`) po każdym kliknięciu. Przy okazji ujawniła
się przyczyna tych trzech — i był to REALNY błąd UI: zaznaczenie ptaszka
przewija grę (`session.recheckAutoPass`, feature 2026-08-11 — semantyka
poprawna, decyzja właściciela 2026-08-16), ale `toggleIgnoredOption` nie
przerysowywał ekranu PO przewinięciu, więc gracz widział panel z minionego
okna, a jego kolejne tapnięcie kończyło się „Ruch odrzucony". Naprawione
w `src/table/main.js` (M104/E7); rekord odrzucenia nadal niesie kontekst
„[tuż po ptaszku wyciszenia]", ale kategoria pozostaje `rules`, żeby nawrót
był widoczny.

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

### Oś 2 — kompletność informacji w logu i modalu „Rozgrywka"

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
`step_advanced`, `object_tapped`, `object_untapped`, `damage_marked`,
`stats_modified`, dobranie z kroku draw.

⚠️ **`turn_started` NIE jest szumem** (decyzja właściciela, 2026-08-14):
„Początek każdej tury to bardzo istotna informacja — chcę ją widzieć, nawet
jeśli nic innego się nie dzieje". Modal „Rozgrywka" zawierający sam
wpis „Tura N — X" jest poprawny. Szumem jest wyłącznie sama nazwa FAZY
(„Faza: Główna 1"), która ma sens tylko jako kontekst konkretnego zagrania.
Uwaga na tę różnicę przy ocenie zgłoszeń detektora — łatwo tu o fałszywy alarm
(popełniłem go w M97).

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

### Oś 4 (M103, L15) — oferty bez skutku (kategoria detektora `noop`)

Czy panel oferuje akcję, która **nic nie zmienia albo jest pewną stratą**?
To wzorzec z M102 (U8: czar celujący w stwora poświęcanego jako własny koszt,
U9: equip na obecnego nosiciela, U10: fizzle udający sukces) — dotąd wymagał
ręcznego czytania transkryptów (`grep -ohP "^\s*>> \K.*" transkrypt | uniq -d`).

Od M103 oś jest **automatyczna** — sonda `probeCommandEffect`
(`src/table/noop-probe.js`) wykonuje komendę na **klonie stanu** z w pełni
pasywnym przeciwnikiem (polityka: zawsze pass) i porównuje fingerprint stanu
przed/po. Klasyfikacja detektora `detectNoEffectOffers`:

1. fingerprint identyczny → „kliknięcie nie zmienia stanu gry";
2. obiekt komendy fizzlował przy pasywnym przeciwniku → „pewna strata";
3. jedyna zmiana to zapłacony koszt (tapnięte własne lądy / pula many /
   życie / zdjęty licznik kosztu, zgodnie z `costSignature` komendy) →
   „jedyna zmiana to koszt".

**Co jest mierzone (M104).** Sonda obejmuje TRZY zakresy:

- przyciski panelu „Twoje działania",
- **opcje w modalach wyboru** (`renderChoiceRequest` — cele, tryby, warianty
  kosztu); do M103 mierzony był wyłącznie pierwszy wariant grupy,
- **skan całego okna**: każda widoczna oferta jest sondowana raz na partię,
  nawet jeśli polityka gracza kliknie co innego (limit 600 sond/partię).
  Bez skanu no-op bywał niewidoczny — weryfikacja mutacyjna M104 pokazała
  ofertę „odkręć nietapnięty ląd" w panelu przy zerowej liczbie zgłoszeń.

Raport `== POKRYCIE UI ==` podaje rozbicie `sondy noop: N (panel X, modal Y)`.

Wymagania techniczne: artefakt otwarty z **`?tester=1`** (mostek
`window.__mtgDebug`, instalowany przy starcie strony) oraz świeży
`npm run build` — przyciski niosą `data-option-key`.

Bramki fałszywych alarmów: etykiety produkcji many (mana to efekt poza
fingerprint), pass/concede/wznowienie, tapnięcia/untapnięcia cudzych
permanentów (to SKUTEK, nie koszt), zysk życia oraz — w MODALU — opcje
rezygnacji („rezygnuję", „nie płać", „bez celów", „Bez bloków"): wybór
„nic nie rób" jest tam legalną decyzją gracza, nie wadą oferty. Zgłoszenie
pozostaje hipotezą — ale teraz z pomiarem zamiast wrażenia.

### Oś 5 (M138) — klasy błędów z audytu „wcielam się w gracza”

Audyt M138 (22 partie) dał **zero** zgłoszeń detektorów i **jedenaście**
znalezisk z ręcznego czytania transkryptu. Wniosek nie brzmi „detektory są
złe”, tylko „nie miały reguł dla tych klas” (L27/L40). Trzy reguły dopisano:

- **`detectBotBuffsMyCreatures`** (`bot`) — bot płaci za efekt KORZYSTNY
  wycelowany w permanent GRACZA. To druga przekątna macierzy, której pilnował
  `detectBotSelfTargeting` (efekt SZKODLIWY w SIEBIE). Objaw z partii:
  24 aktywacje Soulbright Flamekin dające Zadeptywanie moim stworom.
  Wymaga `myPermanentNames` / `enemyPermanentNames` ze sterownika — nazwa
  widziana po OBU stronach jest pomijana (zmiana kontrolera, dwa egzemplarze).
- **`detectFalseNoEffect`** (`rules`) — log mówi „nic się nie wydarzyło
  (zerowy wynik)”, a obok widać skutek. Łapie efekty mutujące stan bez emisji
  zdarzenia (L24) — cisza, która produkuje aktywnie fałszywy komunikat.
  Rozwija sklejony ogon logu (`⏎`), więc działa w obu trybach (reguła M99).
- **`detectTruncatedCardText`** (`ui`) — opis karty urwany: warunek bez skutku
  („gdy ma licznik +1/+1” i tyle), cel bez parametru („stwór o sile ≥” bez
  liczby), kafel aury bez żadnej treści reguł. Jedna reguła na całą rodzinę
  Z2/Z3/Z5/Z9 — i to ona znalazła Z11 (Moonlit Meditation) w audycie
  kontrolnym, już po naprawach.

**Weryfikacja dwustronna jest obowiązkowa.** Każdy z tych detektorów
sprawdzono na transkrypcie SPRZED naprawy (musi zgłosić: 10/1/2 trafienia)
i PO naprawie (musi zamilknąć: 0). Detektor, który tylko „nie hałasuje”, nie
dowodzi niczego.

### Oś 6 (M151) — przeciek szumu do logu gracza

`detectLogNoiseLeak` (`info`) — strażnik dokumentowanego wyciszenia
`mana_produced` („przygotowuje manę”) i `step_advanced` („— faza/krok —”).
Root cause (M151): `apply()`/`streamAutoEvents` logowały `describeEvent`
bez filtra, więc log gracza zalewało 18× „przygotowuje manę” i 140× „— …/… —”
w jednej partii, mimo że TESTER_STOLU.md dokumentuje je jako wyciszone.
Od M151 obowiązuje `MAIN_LOG_NOISE` w `session.js`; detektor pilnuje nawrotu.
Jeśli detektor zgłasza „przygotowuje manę”/„— faza/krok —” w logu gracza,
to znaczy, że filtr przestał działać (regresja).

### M151 — obsługa nowych wzorców akcji w Testerze

Tester zna teraz akcje `Poświęć: …` (Liliana's Triumph — każdy przeciwnik
poświęca stwora), `Rzuć z odbiciem: …` / `Rzuć zawieszone: …` (rebound/suspend
free-cast) i `Zostaw w wygnaniu (koniec odbicia/zawieszenia)`. Bez tych wzorców
tester zatrzymywał się w oknie, w którym człowiek po prostu kliknąłby — a to
blokowało audyt talii z tymi mechanikami (naprawiono w `run-game.mjs`).

**M151 — detektor `detectFalseNoEffect` używa okna POJEDYNCZEGO (naprzód).**
Poprzednie ±4 mieszało dwa niezależne triggery w tym samym oknie (Veiled
Ascension „zerowy wynik” + osobny pump Akrasan Squire) i produkowało fałszywe
alarmy. Legalny przypadek L24 (efekt mutuje stan bez zdarzenia) ma skutek jako
NASTĘPNY wpis; inny trigger wchodzi między nie innymi zdarzeniami.

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
  zakończ (reszta kart do grobu)" zatrzymywała audyt. M250: etykiety z
  `choiceSourceTitle` (konwencja „Nazwa — opis małą literą", M162/C) łamały
  wielkoliterowe wzorce — „Chittering Rats — karta z ręki na wierzch
  biblioteki" nie przechodziło przez `Karta z ręki`; w tej samej klasie
  leżały Exploit, Satyr (odsłoniętych), phyrexian (zapłata: mana czy życie),
  Escape (karty do wygnania) i „Cel dla:". Od M250 greedy ma też ostateczny
  fallback na pierwszy klikalny przycisk — przy wzorcu ‟dopisz etykietę”
  fałszywe STOP-y powinny zniknąć; zostają prawdziwe ugrzęźnięcia (samo
  „Poddaj partię").
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
- transkryptu (`--out`) **nie commituj** — wklej do opisu PR albo do raportu
  w `docs/audits/` tylko fragmenty, które są dowodem.

### Transkrypty nie trafiają do repozytorium (decyzja właściciela 2026-08-28)

Transkrypt to artefakt przebiegu, nie dowód, który musi żyć w historii: przez
kilka sesji katalogi `tmp-audyt-*/` w korzeniu (konwencja M239) i śledzone
`tools/table-tester/audyt*` (sprzed reguł `.gitignore` z M203/M205) urosły do
**205 plików / ~9 MB**. Wszystkie zostały usunięte z repo (zostają w historii
gita). Obowiązuje teraz:

- `--out` zapisujesz, gdzie chcesz (domyślnie `tools/table-tester/transcript.txt`,
  gitignorowany) — po prostu **nie dodawaj pliku do commita**;
- wzorce `tmp-audyt-*/`, `tools/table-tester/**/*.{txt,log,zip}` są w
  `.gitignore`, a `test/repo-artefakty-audytu.test.js` pilnuje, żeby żaden
  taki plik nie wrócił do indeksu;
- wyniki benchmarku (`tools/b1-final-*.txt`, ADR 0018) i talie (`decks/*.txt`)
  to dane projektu — tych strażnik wymaga (kontrola pozytywna).

## Rozwój narzędzia (opcje na kolejne sesje)

Pełna lista: `docs/ROADMAP.md` → sekcja „Rozwój żywego testera stołu". Krótko:
tryb interaktywny (agent steruje w pętli), screenshoty przez headless
Chromium, więcej polityk gracza, wykrywanie podejrzanych etykiet (automatyczne
flagi: `?`, dublowane koszty, puste modale), integracja z CI jako test
opcjonalny.
