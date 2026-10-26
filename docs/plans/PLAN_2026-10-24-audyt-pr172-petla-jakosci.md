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

## Zgłoszenie właściciela F (po domknięciu, 2026-10-24)

Karty z Disguise mają z definicji Ward {2} (CR 702.168a): (a) brak badge'a
„Ward {2}" na kaflu zakrytego *Riftburst Helliona*; (b) bot celował Detainem
*Azorius Justiciara* w zakrytego Helliona bez many na dopłatę ward — zdolność
kontrowana w całości, przy okazji nie zatrzymał też drugiego legalnego celu
(Knighta) — co właściciel podejrzewał o błąd. Rozstrzygnięcia (naprawa
`eb133e5`): (a) chipy nakładki brały się tylko z `grantedKeywords`, a ward
zakrycia nie jest grantem — jawny flag Ward w `buildStateOverlay`;
(b) podatek ward bota czytał cele z `targets`/`targetId`, a warianty
wielocelowe `resolve_trigger_target` niosą `targetIds` — podatek wynosił 0;
po dopisaniu kształtu bot bez zapasu wybiera sam legalny cel, z zapasem
dopłaca i zdolność dochodzi. Sprawa Knighta: **nie błąd** — CR 702.21a
kontruje całą zdolność („counter that spell or ability"), w odróżnieniu od
nielegalnego celu z CR 608.2b; silnik zachowywał się poprawnie (pin F/4).
Bramka po F: `npm test` **8765/8765**, `test:slow` **268/268** (`test:all`
**9033/9033**), build **75 modułów / 5385,4 kB**.

## Zgłoszenie właściciela G (po domknięciu, 2026-10-24)

*Trostani Discordant* („Other creatures you control get +1/+1"): badge
„+1/+1" był na wszystkich stworach poza zakrytym Hellionem, choć statystyki
liczyły się poprawnie (3/3), a po obrocie badge wracał. Dwa punkty zrzutu
czystej prezentacji (naprawa `7c60e61`): `cardInfo` zerował
`grantedPower/Toughness` dla każdego zakrytego, a `playerView` liczył je
tylko przy `!hiddenFromViewer`. Kwota bonusu jest jawna (efektywne P/T
widok drukuje, baza zakrycia to 2/2 z definicji), więc badge wraca po obu
stronach stołu bez naruszania FoW; nazwy mechanik bonusu zostają za bramką
tożsamości. Bramka po G: `npm test` **8768/8768**, `test:slow` **268/268**
(`test:all` **9036/9036**), build **75 modułów / 5386,5 kB**.

## Zgłoszenia właściciela H i I (po domknięciu, 2026-10-24)

**H — *Baral and Kari Zev*:** po rzucie pierwszego instanta bez kandydata na
darmowy rzut silnik auto-domykał decyzję i tworzył *First Mate Ragavana*,
ale ani log, ani „Rozgrywka" o tym nie mówiły. Przyczyna kontraktowa:
`pruneDeadPendingDecisions` zwracał ręcznie zbieraną listę zdarzeń, a zdarzeń
dopisanych przez `applyEffect` (m.in. `token_created`) lista nie niosła —
powstawały tylko w historii stanu. Naprawa `295f4a5`: prune zwraca cały
plaster zdarzeń dopisanych podczas przycinania. **I — *Selesnya Charm*
przez Epic Experiment:** bot wybierał tryb wzmocnienia na własnego defendera
w głównej fazie zamiast tokena 2/2 (tryby remisowały w wycenie flat 70 okien
suspend/epic/rebound). Naprawa `1846318`: wspólny `freeCastEffectsScore` —
token wyceniany ciałem (`tokenBodyValue`), pump oknami walki
(`temporaryPumpPayoff`, defender = 0), bezwarunkowe usunięcie + materiał celu;
bot tworzy Knighta, a przy wrogim 6/6 wybiera wygnanie. Bramka po H+I:
`npm test` **8771/8771**, `test:slow` **268/268** (`test:all` **9039/9039**),
build **75 modułów / 5388,1 kB**; benchmark szybki 672 mecze (heuristic 87,8%).

## Zgłoszenie właściciela J (po H+I, 2026-10-24)

**J — *Izzet Charm*, tryb „Draw two, then discard two”:** bot wybierał tryb
lootu i odrzucał grywalne karty, a przy 3 kartach w bibliotece lootował
wprost w CR 704.5b. Sondy pokazały, że wybór SAMYCH kart do odrzucenia jest
zdrowy (`discardCostPreference`: najpierw utknięte kolorowo, keeperów od
najgorszego) — brakowało bramki DECYZJI o loocie, a podatek biblioteczny
(kara wagowa) jej nie zastępował. Naprawa `aabce9a`: twarde `lootCastVeto`
w `scoreCommand` (klasa po typie efektu `draw_then_discard` wybranego
wariantu rzutu, ADR 0002) — loot wolno tylko, gdy w ręce poza rzucanym
czarem jest co najmniej tyle kart „utkniętych na pipach” (pip, którego
koloru nie daje żaden nietapnięty land bota), ile trzeba odrzucić, oraz
biblioteka bota ma ≥10 kart i w paśmie 11–20 nie jest mniejsza od
biblioteki przeciwnika (dokładnie 10 przechodzi — słowa właściciela).
Aktywowani looterzy („{T}: draw, then discard”) poza zakresem — inna,
powtarzalna decyzja. Bramka po J: `npm test` **8776/8776**, `test:slow`
**268/268** (`test:all` **9044/9044**), build **75 modułów / 5391,9 kB**;
benchmark szybki 672 mecze (heuristic 87,8%, bez regresji).

## Zgłoszenie właściciela K (po J, 2026-10-24)

**K — *Abstruse Interference*:** gdy bot kontrował czar gracza („unless its
controller pays {1}”), w „Twoje działania” była tylko odmowa, choć gracz
mógł poświęcić własnego *Eldrazi Sciona* za {C}. Pierwsza próba (`f1b015b`:
aktywacja Sciona w panelu) odrzucona przez właściciela — właściwa droga to
przycisk „Zapłać {1}” i kreator many ze wszystkimi źródłami. Naprawa
`f767aaa` (CR 608.2g): oferta `pay:true` kontr-płatności i wardu powstaje
przy manie OSIĄGALNEJ (`paymentReachableMana` = producible + netto ręcznych
zdolności many, `manaAbilityHasManualCost`) — tej samej, którą bramka
decyzji liczy od Batcha 54; wszystkie cztery decyzje płatnicze niosą
w ofercie aktywacje many (kreator buduje z nich źródła); kreator otwiera
się też przy jednym kształcie płatności, gdy auto-tap nie pokrywa kosztu
(`autoPayableMana`); bot-płatnik najpierw produkuje manę i nigdy nie
wybiera odrzucanej płatności (losowy losuje z wykonywalnych od razu).
Panel akcji wraca do stanu sprzed `f1b015b`. Bramka po K: `npm test`
**8782/8782**, `test:slow` **268/268** (`test:all` **9050/9050**), build
**75 modułów / 5397,9 kB**, benchmark szybki bez regresji (87,8%).

## Zgłoszenie właściciela L (po K, 2026-10-24)

**L — *Manor Gate*:** po wyborze koloru przy wejściu kafel nie pokazywał
badge'a z wybranym kolorem dodatkowej produkcji. Ogniwa z A2 (2026-09-16)
istniały osobno — widok niesie `chosenColor`, `chosenColorBadge` daje
etykietę „Wybrany kolor: …”, `buildStateOverlay` ją wpycha — ale `cardInfo`
pola nie kopiowało do `info`, więc badge nie powstawał, a linia zdolności
(A3) milczała o drugim kolorze. Testy A2 pinowały końce łańcucha, nie jego
ciągłość. Naprawa `08752b2`: jedna linia w `cardInfo` (z bramką zakrycia
jak sąsiednie pola tożsamości) + okaz Manor Gate po realnym wyborze
w próbce strażnika kontraktu M277. Bramka po L: `npm test` **8785/8785**,
`test:slow` **268/268** (`test:all` **9053/9053**), build **75 modułów /
5398,4 kB**.

## Zgłoszenie właściciela M (po L, 2026-10-24) — werdykt I rundy: nie odtworzono (superseded: M2 niżej)

**M — *Revealing Wind*:** właściciel miał oferty rzutu tylko we własnych
fazach main, jak gdyby instant był zakodowany jako sorcery. Dochodzenie
warstwa po warstwie (definicja → materializacja → oferty silnika →
auto-pass sesji z `pauseOnBotMoves` → prawdziwy artefakt Żywym Testerem,
talia `tarkir-bg`) wykazało wszędzie poprawny instant w oknach
priorytetu tury przeciwnika (CR 117.1a, cytat verbatim z przypiętego
lustra). Pierwsza diagnoza (bramka many) była niepełna — właściciel
doprecyzował: „Miałem z 6 nietapniętych lądów, w tym ze 3 foresty” +
hipoteza o zakrytych kartach. Dochodzenie wznowiono: hipoteza
face-down obalona (oferta bezcelowego czaru nie zna tego warunku;
sceny z zakrytym atakującym/blokującym, cała walka komenda po komendzie,
okno po blokach — czyste). Próba przypisania przyczyny ptaszkowi
wyciszenia oferty była TEŻ błędna — właściciel odrzucił ją wprost
(nie wyciszył rzutu), a obserwacja podobieństwa objawów nie jest
dowodem na stan jego partii. Uczciwy status: incydentu NIE odtworzono,
przyczyna nieznana — dalsza praca wyłącznie na nowym materiale
(powtórka meczu/seed/export replaya). Kontrakt windows/bramki many
zostaje: `test/zgloszenie-m-revealing-wind-okna.test.js` (4 piny:
timing, okna, przy wystarczającej manie oferta, bez many milczenie);
mutacja timingu gasi piny okna/materializacji. Żadnych zmian
produkcyjnych — porównanie z bazą w 751dfe8.
Bramka po M: `npm test` **8789/8789** (cztery piny po rewerterze),
build **75 modułów / 5398,4 kB**.

## Zgłoszenie właściciela N (po M, korektor 2026-10-25) — oferta + kreator, bez wyjątku

**N — Scion w ofercie:** właściciel uogólnił i skorygował kształt:
czar osiągalny many po legalnej ręcznej aktywacji zdolności many
(poświęcenie Eldrazi Scion i krewni bez {T}-only) ma się pojawiać
w OFERCIE jak każdy inny, a kliknięcie ma otwierać KREATOR MANY
z wszystkimi sposobami pozyskania many (nie stop sesji + kafel —
ten kształt `b1f8479` właściciel odrzucił, wycofany w `751dfe8`).
Podstawa: CR 605.3a verbatim „A player may activate an activated mana
ability whenever they have priority, whenever they are casting a spell
or activating an ability that requires a mana payment…". Wdrożenie
`9d199eb`: jednotorowe liczenie jednostek osiągalnych
(`manualManaOfferUnits`, abilities — netto amount − koszt many zdolności,
Skarb wyłączony, bo producible liczy go jawnie) i bramki ofertowe
`manaAvailableForOffer`/`canPayColoredCostForOffer` w legalSpellCasts,
legalCleaveCasts i cast_permanent (wraz z phyrexian/surge/kicker/
offspring/buyback/X/fireball budgetami z tych samych bramek lokalnych).
Płatność niezmieniona: executor wymaga many wyprodukowanej, bez
auto-poświęceń (kontrakt K); człowiek produkuje w kreatorze many —
Scion jest na liście jego źródeł (manaSourcesOf czyta komendy activate
z widoku; bramka `shouldOpenManaWizard` przy autoPayableMana < koszt
kreator otwiera mimo jednego wariantu). Poświęcanie Sciona dla many
nadal nie trafia do „Twoje działania" (życzenie właściciela z K).
Kontrolery: wspólna miara automatu `mana-offer-guards` (ilość jednostek
z kolorami + pipy z obiektu widoku) — heuristic/aggro/random pomijają
cast poza automatem i najpierw produkują (dwufazowość K); kierowcy
testów stołu aktywują źródło przed castem jak kreator. Znaleziska:
legalManaAbilities nie pada już na ofertach bez deskryptora (ninjutsu);
koszt osiągalności liczony raz (amount − cost.mana); jeden nowy traf
grzechotki remisów (Wrap in Flames na tapniętego) przejrzany
z allowlistą. Test `test/zgloszenie-n-cast-z-scion-kreator.test.js`
(8 pinów: osiągalność, oferta permanent+czar, kolor {C}≠pip, lista
źródeł kreatora, bramka otwarcia, panel bez poświęcenia, obaj botowce
bez odrzucanych komend). Bramka po N: `npm test` **8797/8797**,
`test:slow` **268/268**, benchmark quick OK (heuristic 87,8%),
build **76 modułów / 5411,4 kB**.

## Zgłoszenie właściciela M2 (po N, 2026-10-25) — przyczyna M odnaleziona przez właściciela

Mechanizm potwierdzony w kodzie: `commandOptionKey` (session.js) zawiera PEŁNY
zestaw `targets`, a `ignoredOptionKeys` pamięta klucze wyciszonych wariantów.
Wyciszenie Revealing Wind przy stole X/Y dopisywało klucze kombinacji [X] i [Y];
nowe stworzenie Z sprawiało, że grupa nie była w pełni wyciszona (auto-pass
przestawał omijać czar — zachowanie zamierzone), ale po śmierci Z plansza
wracała do X/Y i STARE klucze znów pasowały — wyciszenie wracało bez decyzji
gracza. Stąd „czar nagle przestał być oferowany w połowie gry".

Żądanie właściciela: każda NOWA kombinacja celów TRWALE przerywa wyciszenie
danej akcji (kasuje jej klucze), nie tylko przestaje pasować chwilowo. Plan:
sesja przy każdym oknie decyzji człowieka skanuje oferowane warianty i gdy dla
grupy (typ + objectId + abilityIndex) pojawia się kombinacja celów niewidziana
od czasu wyciszenia (migawka per grupa), usuwa wszystkie klucze tej grupy ze
zbioru. Czysta funkcja eksportowana (jak `hasMeaningfulDecisionOf`) + test
scenariusza X/Y → +Z → Z ginie (auto-pass znów przestaje omijać czar).

**Wykonanie:** `interruptMutesOnNewTargetCombination` + migawki per grupa
w sesji (`110091b`); test 7 pinów. Z okazji nagłówek L188 zgodny z
docs-decisions (`1a990e8` — test archiwum złapał błąd formatu przy pełnej
bramce po N). Bramki: targeted M+M2 11/11, `npm test` 8804/8804, build
5415,0 kB.

## Zgłoszenie właściciela O (po M2, 2026-10-25) — Urborg Uprising bez zwrotu

Bot rzucał *Urborg Uprising* {4}{B} („Return up to two target creature cards
from your graveyard to your hand. Draw a card.") przy grobie bez kart stworzeń
— płacił cały koszt wyłącznie za dobranie. Klasa w wycenie `cast_spell`
(heuristic-bot.js): `graveReturnEffectValue` dla pustego slotu zwraca 0, więc
rzut trzymały `spellBase` 50 + draw `P.drawCardValue`, a kara biblioteczna
(`drawDeckingPenalty` + `libraryDrainTax`) przy zdrowej bibliotece = 0.

Żądanie właściciela: 0 zwróconych → wynik ujemny; 1 → minimalnie powyżej 0;
2 → sensownie dodatni; do tego kara doboru za uszczuplenie biblioteki (ta
istnieje: `drawDeckingPenalty` + `libraryDrainTax` — kara ma dominować przy
cienkiej bibliotece, nie zerować każdej karty doboru w repo).

Plan: kara PER niezrealizowany slot zwrotu z grobu do ręki (nowy parametr
`graveReturnEmptySlotPenalty` = 40; Urborg przy pustym grobie: 50 + 6 − 80 < 0;
przy jednej karcie: jeden pusty slot odejmuje 40, ale zrealizowany zwrot
niesie; przy dwóch: bez kary). Deskryptory efektów
`return_creature_card_to_hand` / `return_card_from_graveyard_to_hand` (ADR
0002, bez nazwy karty). Katalog: Cemetery Recruitment i Grave Exchange mają
cele wymagane (brak pustych wariantów — reguła ich nie rusza); ścieżka
free-cast dostaje premię za zrealizowany zwrot (rozstrzyganie remisów
wariantów, L41). Testy: 0/1/2 karty stwora w grobie + pin kary bibliotecznej.

**Wykonanie** (`d11f8ac`): kara `graveReturnEmptySlotPenalty` 40 w gałęzi
`cast_spell` przy każdym pustym slocie `graveReturnSlotCard` (jedno źródło
slotu dla wyceny/kary/free-cast, L41); free-cast +10 per zrealizowany
zwrot. Piny: `zgloszenie-o` (0/1/2/biblioteka/Cemetery), PMSSB-58 B14/B17
(knoby: szkielet −24/16/56; alias izolowany przy karze 0). Golden-master:
jedna ręcznie zweryfikowana rozbieżność (dominaria-brg|mirrodin-wu@1001,
decyzja 157, wariant bezcelowy 51 → −29; pozostałe 5 partii bez
różnic) — fixture zregenerowane. Bramki końcowe sesji: `npm test`
8809/8809, `test:slow` 268/268, build 76 modułów / 5417,2 kB,
benchmark quick 672/672, heuristic 87,8%.

## Korekta O2 (wątpliwość właściciela 2026-10-25): podatek biblioteczny działa od 10 kart w dół

Sonda w scenie testu O (Child of Night, 7 Swampów) wykazała, że kara
biblioteczna miała urwisko: `drawDeckingPenalty` kończy się na „pozostałe
≤3 karty”, więc bot rzucał *Urborg Uprising* z 2 zwrotami przy 2–5
kartach w bibliotece i z 1 zwrotem już od 5 kart. Majstersztyk decyzji
właściciela: przy 1–5 kartach w bibliotece bot nie powinien tego czaru
rzucać wcale (dobranie = −1 runda życia), przy 6–10 kartach tylko przy
dwóch zwrotach.

Plan: dla rzutów rodziny zwrotu z grobu do ręki Z DOBRANIEM
(`draw_cards`/`draw_then_discard` w tym samym deskryptorze)
stopniowana kara biblioteczna do `graveReturnDrawLibraryMargin` = 10:
podstawa 24 + 12 za każdą kartę poniżej pasma (po doborze), osobno
poruszająca koniec deck-outu (kara jak `libraryDeckOutPenalty`). Karty
wracające do RĘKI potrzebują kolejnych tur, żeby się zamienić w stół —
przy cienkiej bibliotece tych tur nie ma, a dobranie jeszcze je skraca
(inny profil niż reanimacja wprost na stół, stąd silniejsze pasmo niż
globalnego `drawDeckingPenalty`, którego progów NIE ruszamy: pin
Denisena 5→4 i drabina A–F/D pozostają). To samo pasmo w ścieżce
free-cast (L41). Piny: siatka bibliotek 2–12 × 0/1/2 zwroty w suite
`zgloszenie-o`; bramki jak zwykle + golden-master/benchmark.

**Wykonanie** (`acd64a0`): zgodnie z planem; sonda po zmianie daje
dokładną tabelę właściciela (≤5: brak rzutu przy 0/1/2 zwrotach;
6–10: tylko 2; ≥11: normalnie). Bramki: `zgloszenie-o` 7/7, `npm test`
8811/8811, `test:slow` 268/268 (golden-master bez rozbieżności),
build 76 modułów / 5421,0 kB, benchmark quick heuristic 87,8%.

## Zgłoszenie P — fundament Converge (kolory many wydanej na rzut)

Właściciel: „zbliża się karta z Converge, więc warto to zakodować” —
z propozycją, by manę ze źródeł wielokolorowych liczyć NA KOŃCU, jako kolor,
którego jeszcze nie policzono. Rekon: w katalogu nie ma żadnej karty
Converge/Sunburst ani implementacji; jest tylko ślad `manaColorsSpent`
budowanego dziś wyłącznie przez `castPermanent` pod Adamant. CR 207.2c:
Converge to ability word bez własnego znaczenia regułowego i bez osobnego
wpisu 702 — potrzebna jest generyczna wartość „liczba kolorów many wydanej
na rzut tego czaru”, nie osobny keyword-handler. Kształt:

1. `countColorsOfManaSpent` w `resources.js`: wpisy jednoznaczne liczy
   wprost; jednostki wielokolorowe rozwiązuje PO nich — każda daje co
   najwyżej JEDEN, jeszcze niepoliczony kolor (dopasowanie maksymalne; sama
   `WUBRG` = 1 kolor, nie 5). Bezbarwna = 0.
2. `manaColorsSpent` także dla instantów/sorcery i pozostałych ścieżek rzutu:
   jedno miejsce w `spendMana` dla płatności oznaczonej `spellManaPurpose`
   (z identyfikatorem rzucanego obiektu); kopie czaru (CR 707.10: kopia nie
   jest rzucana) i opuszczenie stosu/pola bitwy czyszczą ślad (CR 400.7).
   Dopłata spoza kosztu czaru w oknie darmowego rzutu (`extraMana`) nie liczy
   się do kosztu czaru (CR 601.2f — jak istniejące progi many).
3. Deskryptor kwoty `amount: 'colors_of_mana_spent'` rozwiązywany centralnie
   w `applyEffect`, w `resolveDamageAmount` oraz w `entersWithCounters`
   (kształt „wchodzi z licznikiem za każdy kolor”) — bez żadnej realnej karty
   w katalogu (ADR 0029; karta przyjdzie osobno od właściciela).
4. Test syntetyczny (ADR 0029): funkcja licząca + rzut instantu i permanenta
   za manę jedno-/wielokolorową/dowolnego koloru/bezbarwną; Adamant bez regresji.

Bramki: nowy plik, `npm test`, `test:slow`, build, benchmark quick.

**Wykonanie** (`1f7920d`): zgodnie z kształtem wyżej. Bramki:
`zgloszenie-p-converge-fundament` 5/5, Adamant+convoke 10/10,
`npm test` 8816/8816, `test:slow` 268/268, build 76 modułów / 5428,5 kB,
benchmark quick heuristic 87,8%. Karta Converge od właściciela będzie już
tylko danymi w katalogu (+ ew. wycena bota pod jej konkretny efekt);
silnikowe liczenie kolorów i deskryptor kwoty są gotowe.

## Zgłoszenie R — bot poświęca Sciona, choć lądy wystarczają na Predatora

Log właściciela: bot ma 4 nietapnięte lądy (w tym Forest) i Eldrazi Sciona.
Zagrywa *Fertile Thicket* (piąty ląd, tapnięty), po czym — jeszcze przy
triggerze Thicket na stosie — poświęca Sciona i dopiero potem rzuca
*Kozilek's Predator* za {3}{G} z trzech lądów + {C}. Sonda na żywym
silniku odtwarza sekwencję 1:1 po dołożeniu do ręki *Boulder Salvo*
({4}{R}, „deals 4 damage to target creature”): aktywacja Sciona dostaje
+6 i wygrywa z passem. Przyczyna: bramka `castScoreForUnlock`
(PMSSB-32/F6) pyta o wartość czaru z celem komendami SYNTEtycznymi dla
każdego obiektu pola bitwy ORAZ każdego gracza, bez sprawdzenia specu
celu — *Boulder Salvo* „w gracza” wycenia się dodatnio jako burn, choć
taki cel jest nielegalny (na stole nie ma żadnego stwora przeciwnika),
więc jednorazowe źródło many dostaje premię za fikcyjne odblokowanie.
Po rozstrzygnięciu triggera bot wybiera legalny, wyżej wyceniony rzut
Predatora i płaci pływającą maną ze Sciona zamiast czwartym lądem.

Naprawa u źródła (bot, bez nazw kart — ADR 0002): syntetyczne warianty
w `castScoreForUnlock` budujemy wyłącznie dla celów zgodnych ze specem
czaru (kategoria celu z deskryptora), a wariant bez celu dla czaru
z celem nie bierze udziału w wycenie. Piny: scena z logu (Thicket na
stosie → pass, potem Predator z samych lądów), anty-overfix (Skarb/
Scion nadal finansuje czar z legalnym celem, PMSSB-32/A5b) oraz bramki
jak zwykle.

**Wykonanie** (`bd0f0ae`): zgodnie z rozpoznaniem wyżej —
`syntheticTargetCandidatesOf` w `heuristic-bot.js` buduje syntetyczne cele
wyłącznie z kategorii specu deskryptora (stwór/permanent/gracz/stos/grób,
kontrola, specy złożone `_or_`, ograniczenia szczegółowe przez wspólny
`publicEtbTargets`), wariant bez celu nie uczestniczy w wycenie czaru
z celem, a brak kandydata właściwej kategorii zwraca −60 zamiast
fallbacku +1. Piny `zgloszenie-r-scion-falszywe-odblokowanie` 4/4 (scena
z logu 1:1, pusty stos bez celu, legalny cel nadal odblokowuje, realny
brak many wg zgłoszenia N nadal aktywuje). Bramki: `npm test`
8820/8820, `test:slow` 268/268, build 76 modułów / 5434,2 kB, benchmark
quick heuristic 87,8% (bez zmian).

## Zgłoszenia S–V — Clone Shell, atak 0/1, mana z Vestige, cel Nursery

Reguły zweryfikowane wobec przypiętego CR (`.arena/cr-raw.txt`, ADR 0030):
Imprint to dziś wyłącznie ability word bez znaczenia regułowego — o S
decyduje tekst Oracle *Clone Shell* („put the rest on the bottom of your
library in any order"); CR 106.4 (mana trafia do puli i znika na końcu
kroku/fazy), CR 117.3b (po rozstrzygnięciu zdolności priorytet wraca do
aktywnego gracza) i CR 605.1b (ETB-trigger *Crumbling Vestige* nie jest
zdolnością many — idzie na stos) wyznaczają U. T i V to wyceny bota, nie
legalność, więc reguł nie dotykają.

**S — Clone Shell bez sortowania spodu.** Sonda na produkcyjnej ścieżce:
silnik, `playerView.pendingLookTopN` i `renderPickOneRestBottomWizard`
poprawnie niosą `bottomOrder`, ale `openChoiceRequest` liczy
`singleTargetPlanOf` PRZED `lookWizardKindOf`, a generyczny detektor
przejmuje komendy `resolve_look_top_choice` po samym polu `cardId` i
kończy gołą komendą bez `bottomOrder` (silnik układa resztę w kolejności
biblioteki). Ta sama kradzież dotyczy *Impulse*; *Fertile Thicket* ma
osobny typ komendy, którego detektor nie zna, więc działa. Naprawa:
`resolve_look_top_choice` wychodzi z rodziny generycznego single-pick
(jego komendy nie niosą wymiaru kolejności — detektor oparty wyłącznie
na komendach nie może jej reprezentować), a kaskada wraca do
wyspecjalizowanego wizarda. Piny: produkcyjne oferty Clone Shell
i Impulse (`singleTargetPlanOf` = null, `lookWizardKindOf` =
„pick-one-rest-bottom", wykonanie z odwróconym `bottomOrder`),
anty-overfix dla reszty single-pick.

**T — samobójczy atak 0/1.** Sonda odtwarza scenę właściciela (życie
3/23, biblioteki 7/6, samotny 0/1 w 4/3): atak dostaje +8 i wygrywa
z brakiem ataku. Gałąź M155 (`dealsNoCombatDamage` = −12) jako jedyna
z gałęzi „bezsensownych" NIE inkrementuje `futileAttackers`, więc
premia wyścigu (+20 przy życiu przeciwnika ≤10, mimo łącznej siły 0)
„wskrzesza" atak ponad passa (klasa L3). Dodatkowo gałęzie
„nieblokowalny/odporny" biegną przed M155 i dają premię przebicia
atakującemu o sile 0. Naprawa: 0 obrażeń bojowych bez wypłaty
z ataku = atakujący daremny (bez premii wyścigu), a sprawdzenie M155
przed premiami za nieblokowalność/odporność/ewazję. Piny: scena
właściciela, warianty ewazyjne 0/x, anty-overfix dla drenażu z ataku.

**U — mana z Crumbling Vestige a oferta Xu-Ifita.** Dokładna scena
silnikowa (Vestige + Swamp + 6 Mountainów, obiekty z `createCardDeck`)
i ta sama scena przez prawdziwą sesję stołu DZIAŁAJĄ: po rozstrzygnięciu
triggera pula = `{WUBRG:1}`, `canPayColoredCost(BB)` = true, oferta
`cast_permanent` jest, auto-pass staje. Szukamy więc różnicy stanu
z żywej partii (odpowiedź bota na trigger, pauzy stołu, tapnięte źródła,
inne oczekujące decyzje) — bez zgadywania poprawki (L57/lekcja M).

**V — Molten Nursery w 4/3.** Sonda: 1 obrażenie w wrogie 4/3 = 41 pkt
(`30 + 2P + T`), w przeciwnika = 25. Gałąź `resolve_trigger_target`
premiuje lethal (+60, zgłoszenie F), ale obrażenia NIEletalne wycenia
jak ogólny efekt wrogi — rozmiarem celu — zamiast wspólną polityką
celów obrażeń (chip poza walką = strata). Naprawa: triggery obrażeń
oceniają cele wspólną wyceną `damageTargetValue` (jak czary): lethal
> twarz > nieletalny chip; zachowane zachowanie przy celach
wymuszonych i `allowNone`. Piny: scena właściciela (4/3 kontra twarz),
lethal nadal wygrywa, chip „dokładający" w walce nadal sensowny.

Każde zgłoszenie osobny, niezależnie zielony commit; bramki jak zwykle
(`npm test`, `test:slow`, build, benchmark quick — B0 tylko na rozkaz).

**Wykonanie:**
- **S (`6ca0724`):** zgodnie z rozpoznaniem — `resolve_look_top_choice`
  w `SINGLE_PICK_EXCLUDED_TYPES` (multi-target.js); piny
  `zgloszenie-s-clone-shell-sortowanie-spodu` 4/4 przez produkcyjne
  `buildActionEntries` (Clone Shell i Impulse: single-pick = null,
  `lookWizardKindOf` = „pick-one-rest-bottom", wykonanie z odwróconym
  `bottomOrder`); pokrewne modale 31/31, `npm test` 8824/8824.
- **T (`c18e364`):** gałąź 0 obrażeń liczy `futileAttackers`, premie za
  nieblokowalność/odporność wymagają `!dealsNoCombatDamage`, predykat
  przeniesiony na `faceDamageOf(combatObject)` (efektywne staty: pompa
  drużyny/becomes-blocked/przydział wytrzymałością; wyjątki: drenaż
  z ataku i stwór pożyczony). Sonda po fixie: solo 0/1 = −12 (brak
  ataku wygrywa), flying 0/1 = −9; piny `zgloszenie-t-atak-zero-mocy`
  5/5, `npm test` 8829/8829.
- **U (`3e70ce6`):** scena silnikowa i sesyjna działały od początku —
  przyczyna klasy M: klucze wyciszeń (`commandOptionKey`) osadzają
  `objectId`, które powtarza się między partiami (`hand-N`), a zbiór
  żył w pamięci strony, więc wyciszenie z poprzedniej partii potrafiło
  ukryć legalną ofertę przed auto-passem. Fix: `createSession` oraz
  podmiana stanu w `resumeReplayText` czyszczą zbiór (wyciszenie =
  decyzja na partię); test M314/6 stawia pinezkę po utworzeniu sesji.
  Piny `zgloszenie-u-vestige-mana-oferta` 3/3 (scena właściciela przez
  prawdziwą sesję + regresja wycieku + anty-overfix świadomego
  wyciszenia), `npm test` 8836/8836.
- **V (`2d46a6f`):** jednocelowe triggery obrażeń (`cmd.damage > 0`,
  nieprzyjazne) wyceniane wspólną `damageTargetValue` w gałęzi
  `resolve_trigger_target` (przed gałęzią braku celu na stole, więc
  cele-gracze też w tej skali; `targetId: null` i gałąź wielocelowa
  `damage_divided` bez zmian). Sonda po fixie: 4/3 = −80, przeciwnik
  = 8, lethal 1/1 = 30, dobicie gracza = 1000. Piny
  `zgloszenie-v-molten-nursery-cel-obrazen` 4/4; piny F (Warmaker)
  przeliczone na wspólną skalę; `npm test` 8833/8833.

**Bramki końcowe S–V:** `npm test` 8836/8836, `test:slow` 268/268,
build 76 modułów / 5438,3 kB, benchmark quick heuristic 87,8% (590/672,
bez zmian).

