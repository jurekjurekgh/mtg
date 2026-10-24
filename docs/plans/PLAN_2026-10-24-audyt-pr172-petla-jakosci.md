# PLAN 2026-10-24 — kontynuacja: audyt PR #172 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021:
1. Otwarcie PR sesji z niniejszą roadmapą przed kodowaniem (ADR 0020 A).
2. Pełny audyt poprzedniego scalonego PR #172 (ADR 0020 B / ADR 0016) — wszystkie
   32 zmienione pliki i 14 commitów (`11fb4d1..3ad2f6b`, squash `67dbd0f`).
3. Sprawdzenie niedokończonych planów na `main` (ADR 0021 pkt 3).
4. Pętla jakości (ADR 0021 pkt 4): Żywy Tester z perspektywy gracza + polowanie
   na niezgodności z CR ścieżką INNĄ niż poprzednia sesja (która domknęła
   rodzinę LKI / opuszczania stref, CR-1..CR-4), bez samowolnego dodawania
   kart (ADR 0029) i bez pełnego B0 (ADR 0018).

**Gałąź:** `arena/1e1d0ca7-mtg`, baza `main` @ `67dbd0f` (squash-merge PR #172
z 2026-10-24 10:12 UTC).
**Lektura wykonana przed planem (`AGENTS.md` §0):** `AGENTS.md` w całości,
`docs/decisions/README.md` oraz wszystkie ADR 0001–0030 (w tym 0002, 0003/0017,
0005, 0016, 0018, 0019, 0020, 0021, 0022, 0029, 0030), `docs/LESSONS.md`
w całości (2231 linii, L1–L187), `docs/setup/ENVIRONMENT.md`, PR #172
(opis, 14 commitów, lista 32 plików), najnowszy handoff
`docs/setup/HANDOFF_2026-10-24.md`.

## Rozpoznanie przed kodowaniem

- `git status`: drzewo czyste na `arena/1e1d0ca7-mtg` @ `67dbd0f`.
- **Stan bazowy zmierzony na `67dbd0f` (cicho, ENVIRONMENT §5a):**
  - `npm test` (fast): **8757/8757** pass, 0 fail (~143 s) — zgodny z handoffem PR #172;
  - `npm run build`: **75 modułów / 5383,3 kB** — zgodny z handoffem PR #172;
  - `npm run test:slow`: do zmierzenia w bramie końcowej (handoff: 268/268).
- **Niedokończone plany na `main` (ADR 0021 pkt 3):** skan najnowszych
  `docs/plans/PLAN_2026-10-*.md`: plan PR #172 ma wszystkie etapy odhaczone
  (5/5); plany `2026-10-21{a,b,c}` bez checkboxów etapów (zamknięte kolejnymi
  PR-ami #169–#172). Brak urwanego w połowie planu technicznego — sesja idzie
  w audyt PR #172 (ADR 0021 pkt 2), a potem w pętlę jakości (pkt 4).
- **Wstępna obserwacja:** PR #172 to wyłącznie naprawy znalezisk audytu PR #171
  (F-1..F-8) + pętla jakości (LT-1..LT-4, CR-1..CR-4); brak nowych kart
  (ADR 0029 nienaruszony — do potwierdzenia w audycie po `card-data.js`:
  pliku nie ma w diffie). Największe ryzyko siedzi w `objects.js`
  (kolejność `lkiSnapshot` vs `resetZoneChangeAttributes`, CR 603.10a/400.7),
  w `mana-wizard.js` (`wizardVariantKeyOf` — wycięcie pól Delve/Crew z porównania
  legalności) i w projekcji `ownerId` oraz `copiedAbilities` w `PlayerView`
  (ADR 0003/0017).

## Zakres audytu PR #172 (32 pliki)

Każdy plik sprawdzany pod kątem: zgodności z CR (weryfikacja u źródła wg
ADR 0030 — dosłowny tekst CR/rulingów PRZED uznaniem znaleziska), ADR 0002
(żadnych przypadków specjalnych po nazwie/ID karty), ADR 0003/0017 (FoW
i kompletność widoku), ADR 0005 (determinizm) oraz realności testów
RED→GREEN (L13/L34/L159: mutacja z gita, nie z kopii po edycji).

1. **Silnik (`src/engine/`, 9 plików):**
   `effects.js`, `game-state.js`, `identity.js`, `mana-sources.js`,
   `objects.js`, `permanents.js`, `resources.js`, `spells.js`, `triggers.js` —
   m.in. detain a zdolności manowe (F-2: CR 701.35a, CR 605.3), `enter_as_copy`
   i `originalBeforeCopy` (F-3: CR 400.7, CR 707.2), koszt kickera zwracający
   ląd (F-4: CR 702.33a, CR 400.3, CR 108.3), odkrycie druku zakrytych
   (CR-1: CR 708.9), LKI przed resetem atrybutów (CR-2/CR-4: CR 603.10a),
   skan wyzwalaczy odejścia tylko po `battlefield` (CR-3: CR 113.6).
2. **Kontroler bota (`src/controllers/`, 1 plik):**
   `heuristic-bot.js` — filtr ewazji w `blokowalne` przed `slice`
   (CR 509.1b), `haste`/`cantAttackStatic` w `canCreatureAttackNow`
   (CR 702.10, CR 508.1), projekcja `widokBezDefendera` przy
   `cantAttackExternal !== true` (F-7) — sprawdzić obie nogi: czy bot nie
   atakuje czymś, czym nie wolno, i czy nie mrożono legalnego ataku (L121).
3. **UI stołu (`src/table/`, 3 pliki):**
   `main.js` (+11/−66 — najwięcej usunięć: sprawdzić, czy nic istotnego nie
   zgubiono, ADR 0016 B), `mana-wizard.js` (`finishWizardPayment` bez
   podszywania pod bota, `wizardVariantKeyOf` — Delve/Crew/Convoke,
   `xCost.black` + `effectiveGeneric`: CR 107.3, CR 601.2f), `render.js`
   (`{ manaHtml: false }` w nagłówku modala, opisy LT-1..LT-4, znak `+0/-1`).
4. **Testy (13 plików):** nowe strażnice F-2/F-4/F-6/F-7, JT-1 Jwari,
   sondy `petla-jakosci-*`, przepisany test Chronic Flooding (+184/−127 —
   sprawdzić, czy przepisanie nie zgubiło asercji, L181), zmiany w pinach
   `b2-odcisk` i `karta-to-nie-token` oraz usunięte `console.log` (F-5).
   Weryfikacja mutacyjna kluczowych pinów (per gałąź, właściwy kierunek — L114).
5. **Dokumentacja (6 plików):** `README.md`, `docs/PROJECT_HISTORY.md`,
   `docs/audits/AUDYT_PR171_2026-10-21d.md` (korekta cudzego audytu — sprawdzić
   zakres), `docs/audits/AUDYT_PR171_2026-10-23.md`, plan PR #172, handoff —
   zgodność liczb z pomiarem (L92) i kompletność opisu commitów.

## Etapy i planowane commity (ADR 0020 C — każdy zielony i od razu wypchnięty)

- [x] **Etap 0 — Plan i otwarcie PR:** (commit `b52c971`, PR #173 otwarty przed kodowaniem) niniejsza roadmapa, walidacja strażników
      dokumentacji, commit + push na `arena/1e1d0ca7-mtg`, otwarcie PR do `main`
      przed jakimkolwiek kodowaniem (ADR 0020 A).
- [x] **Etap 1 — Audyt PR #172 (32/32 plików):** (raport `docs/audits/AUDYT_PR172_2026-10-24.md`; znaleziska F-1..F-3 + obserwacje O-1..O-3; wszystkie cytaty CR zweryfikowane w `cr-raw.txt` 2026-09-25, SHA zgodny; mutacje A/C2/D czerwienią, B ujawniła F-1) przegląd linia po linii diffu
      `11fb4d1..3ad2f6b` warstwami (silnik → bot → UI → testy → dokumentacja),
      weryfikacja twierdzeń CR u źródła (ADR 0030), sondy graniczne przez pełną
      komendę `execute` (L111/L68), mutacje kluczowych pinów z wersji git
      (L34). Raport: `docs/audits/AUDYT_PR172_2026-10-24.md`; znaleziska numerowane
      `F-1…` (kontynuacja konwencji), obszary sprawdzone i poprawne wypisane
      wprost (L11).
- [x] **Etap 2 — Naprawy znalezisk audytu:** (F-1: `3f05912` — okaz Skarbu o katalogowym kształcie + piny bazy, mutacja B czerwieni po naprawie; pin CR 708.9 ze stosu: `6223ffe`; F-2/F-3: `f28be64` — prawdziwe symbole LKI w dokumentacji i jedna numeracja CR-2/CR-3) każdy potwierdzony błąd naprawiony
      u root cause (nie maskowanie — AGENTS) OSOBNYM zielonym commitem
      z testem RED→GREEN i cytatem CR w komentarzu testu (ADR 0030 pkt 4).
      Znalezione przy okazji drobiazgi (literówka, martwy kod, kłamiący opis)
      naprawiane od razu, bez pytania właściciela (AGENTS § zasady pracy).
- [x] **Etap 3 — Pętla jakości (ADR 0021 pkt 4):** (4 partie Żywego Testera: ixalan↔kaladesh/explorer, srodziemie↔worek-legend/defensive, zendikar-wu↔the-edge/random, warhammer-ubr↔lorwyn/impatient — wszystkie ukończone, 0 zgłoszeń detektorów, ręczna lektura po 3 osiach bez znalezisk; analizator ADR 0027 czysty; sonda reguły legend CR 704.5j wobec kopii enter_as_copy poprawna)
      (a) Żywy Tester: partie na ZBUDOWANYM `dist/mtg-table.html` (L76),
      kombinacje talii/seedów INNE niż 9 partii sesji PR #172, ręczna lektura
      transkryptów po trzech osiach `docs/setup/TESTER_STOLU.md` (zero zgłoszeń
      detektorów nie zamyka tematu — L27); braki testera naprawiane w testerze
      (L12). (b) Polowanie CR inną ścieżką niż poprzednia sesja: rodzina
      opuszczania stref/LKI była domknięta w CR-1..CR-4 — kandydat do przeglądu
      wybierany na starcie etapu spośród obszarów nietkniętych w ostatnich
      audytach (np. pary wymóg×zakaz ataku/bloku — L108, albo choke pointy
      liczników/tapu — L107 przez analizator ADR 0027), z repro przed naprawą.
- [x] **Etap 4 — Domknięcie i pełna brama:** `npm test`, `npm run test:slow`
      (łącznie `test:all` — wyłącznie do logu w `.arena/`, ENVIRONMENT §5a),
      `npm run build`, strażniki dokumentacji i budżetu lektury; uzupełnienie
      `docs/PROJECT_HISTORY.md`, liczb w `README.md` (na KONIEC — L92),
      `docs/setup/HANDOFF_2026-10-24b.md`, kumulacyjny opis PR; blok przekazania
      projektu w czacie (ADR 0013). Bez pełnego B0 (ADR 0018) — co najwyżej
      próbka szybka `node --test test/bot-benchmark.test.js`, gdy zmiany dotkną
      bota albo enumeracji ofert.

## Ryzyka i pułapki

- **Fałszywe znalezisko z pamięci (ADR 0030):** każde twierdzenie regułowe
  audytu (w tym o kodzie PR #172) wymaga dosłownego cytatu CR pobranego z sieci
  (`fetch_page`; bash nie ma egressu — ENVIRONMENT §4). Brak źródła = odłożyć
  z adnotacją, nie zgłaszać.
- **Kolejność w `moveObject`:** audyt ma potwierdzić kolejność `lkiSnapshot`
  PRZED `resetZoneChangeAttributes` dla KAZDEJ ścieżki wyjścia ze strefy
  (śmierć, wygnanie, odbicie, powrót na rękę właściciela), nie tylko w pinach
  CR-2/CR-4 (klasa L107: grep po mutacji/emicie, nie po nazwie mechaniki).
- **`wizardVariantKeyOf`:** wycięcie pól składników kosztu z porównania legalności
  jest kirurgiczne — audyt sprawdza, że `modeIndex`, `kicked`, `abilityIndex`,
  `faceDown`, `targets`, `xValue` nadal muszą pasować (mutacja per pole).
- **Mutacje i pliki robocze (L136/L159/L184):** kopie tylko w `.arena/`,
  przywracanie KOPIĄ, nigdy `git checkout <plik>` na pliku z pracą z tury;
  po każdej mutacji `git status --short` czysty; każdy krok = commit + push.
- **Ciche testy (ENVIRONMENT §5a):** zawsze `> .arena/*.log 2>&1` z zachowaniem
  kodu wyjścia; bramkę uruchamiać na ZAMROŻONYM drzewie (L174).
- **Brak force pusha (ADR 0020 D):** przed każdym pushem `git log --oneline -3`
  + `git status` + `git fetch origin arena/1e1d0ca7-mtg` i porównanie
  `HEAD..FETCH_HEAD` z `FETCH_HEAD..HEAD` (gałąź zdalna powstaje z pierwszym
  pushem tej sesji).

## Podsumowanie wykonania (2026-10-24)

Wykonano wszystkie etapy. Audyt PR #172 nie wykazał żadnego błędu regułowego
w kodzie produkcyjnym — jedyne usterki to pusty pin testowy zatrzymanego
Skarbu (F-1, naprawiony z dowodem mutacyjnym) i dwie niespójności
dokumentacyjne po poprzedniej sesji (F-2 nieistniejące symbole mechanizmu
LKI, F-3 odwrócona numeracja CR-2/CR-3), obie poprawione. Pętla jakości
(4 partie Żywego Testera na zbudowanym artefakcie, analizator kontraktów
zdarzeń, sonda SBA/reguły legend wobec kopii) nie dała nowych znalezisk —
stan faktyczny odnotowany bez dopisywania usterek na siłę (ADR 0027).
Bramka końcowa: `npm test` **8758/8758** (+1 nowy pin CR 708.9),
`npm run test:slow` **268/268** (łącznie `test:all` **9026/9026**),
`npm run build` **75 modułów / 5383,3 kB**, próbka bota 20/20.
Commity: `b52c971` (plan), `acf9290` (audyt), `3f05912` (F-1), `6223ffe`
(pin 708.9), `f28be64` (F-2/F-3), domknięcie dokumentacji sesji.

## Zgłoszenie właściciela E (po domknięciu, 2026-10-24)

„W boksie Rozgrywka nie ma informacji, kogo kopiuje wprowadzona Jwari
(*Jwari Shapeshifter*). Jest w logu, brakuje w Rozgrywka." Diagnoza sesją
stołu: zdarzenie `enter_as_copy_resolved` nie należało do żadnego zbioru
bramki `isMainLogEvent`, więc poza oknem `botActing` nie trafiało do
`botMoves`; własna Jwari człowieka dawała w modalu tylko generyczne
„kopiuje cechy celu". Naprawa `9676041`: `COPY_DIGEST_EVENTS` w bramce
(tożsamość permanentu na polu bitwy jest publiczna — CR 400.2/707.2,
analogicznie do transformacji E6/A2) + test
`test/zgloszenie-e-jwari-rozgrywka.test.js` (predykat + sesje człowieka
i bota; mutacja członu czerwieni piny E/1–E/2). Bramka po E:
`npm test` **8761/8761**, `test:slow` **268/268** (`test:all` **9029/9029**),
build **75 modułów / 5384,4 kB**.
