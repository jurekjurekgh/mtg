# AUDYT ŻYWYM TESTEREM M258 (2026-08-30) — pętla jakości PR #89: 2 silnikowe + 1 narzędziowe znalezisko naprawione; F3 (ward) domknięte decyzją właściciela

**Sesja:** `arena/01a0526d-mtg` (PR #89). **Etap:** 2.2 planu
`docs/plans/PLAN_2026-08-30-m258-audyt-pr88-i-petla-jakosci.md` — Żywy
Tester na puli kart **niewidzianej** w cyklu PR #88.

**Baza:** `ccba0a3` (po fixie K2). Bramy: `npm test` 3810/3810, build
56 mod/2934.8 kB.

## Dobór talii (decyzja właściciela 2026-08-26: świeży kod > benchmark)

Pula „niewidziana" = talie spoza puli PR #88 (innistrad-*, forgotten-realms,
warhammer-*, tarkir-*, wiedzmin, theros, worek-basni, worek-legend);
w obrębie niej priorytet: (1) świeże karty z Batchu 51 = **worek-mroczny,
ravnica**, (2) talie spoza `BENCH_DECKS` = mirrodin-*, srodziemie,
worek-dziki, zendikar. BENCH_DECKS (pominięte): alara, dominaria-*,
final-fantasy, forgotten-realms, innistrad-brg.

## Metoda

- 6 partii, seeds 3001–3006, 400 kroków, profile: greedy ×3, explorer,
  defensive, random — `tools/table-tester` na świeżym `dist/`.
- Lektura **każdego** transkryptu od deski do deski (osie 1–4 z
  `docs/setup/TESTER_STOLU.md`); każde podejrzenie weryfikowane w kodzie
  i w danych Scryfall (L57) przed uznaniem za błąd.
- Transkrypty poza repo (konwencja M253).

## Wynik macierzy

| seed | talia (gracz ↔ bot) | profil | wynik | detektory |
|---|---|---|---|---|
| 3001 | worek-mroczny ↔ ravnica | greedy | wygrywa Gracz | 0 |
| 3002 | worek-mroczny ↔ ravnica | defensive | wygrywa Bot | 0 |
| 3003 | srodziemie ↔ mirrodin-wu | greedy | wygrywa Bot | 0 |
| 3004 | srodziemie ↔ mirrodin-wu | explorer | wygrywa Bot | 0 |
| 3005 | zendikar ↔ worek-dziki | greedy | wygrywa Bot | 0 |
| 3006 | zendikar ↔ worek-dziki | random | wygrywa Bot | 0 |

Zero zgłoszeń detektorów (noop/fizzle/STOP/`undefined`/`NaN`/`cel: ?`);
wszystkie partie kończą się naturalnie. Oś 1 (sens bota): bez zastrzeżeń —
bot używa czujności z aktywacji przed atakiem, celuje removal w artefakty,
dokłada liczniki Trigonem od razu po wejściu, przejmuje stwory i atakuje
nim z pośpiechem. Oś 2: kompletne opisy (ofiara kosztu Lash widoczna jako
osobny wpis, clash z wyborem wierzch/spód, trigger „bez efektu" L91).
Oś 3: bez zmian. Oś 4: sondy noop 53–95 na partię, brak zgłoszeń.

Uwaga metodologiczna: **partia 3004 przerwana wyjątkiem** (znalezisko T1)
— po naprawie sterownika odpalona ponownie (ten sam seed, profil), dokończona
naturalnie z realnym rzutem Lash of the Balrog przez kreator ofiary.

## Znaleziska

### T1 (narzędziowe, NAPRAWIONE — `b14a532`): sterownik nie umiał domknąć kreatora „cel + poświęcenie"

Kreator ofiary z **M257-r5/C (PR #88!)** — sacMode w
`renderMultiTargetWizard` — nigdy nie był przećwiczony na żywym stole.
`run-game.mjs` liczył liczbę pozycji z intro „zaznacz cele (N)", a intro
sacMode („wskaż cel czaru oraz stwora do poświęcenia (koszt)") liczbę
niesie w ogóle → `needed=1`; po kliknięciu CELU Zatwierdź dalej gaśnie
(brakuje OFIARY), a drugi klik pętla M103 cofała jako „ponad limit" →
5 prób i `Kreator wielocelowy nie do zamknięcia`, partia bez transkryptu.

**Fix:** gałąź sacrifice wizard — wiersze celu to `.multi-target-row` bez
slot-row, ofiary `.multi-target-slot-row`; polityka klika legalną parę
(najpierw omijając parę cel=ofiara = pewny fizzle CR 601.2c), legalność
potwierdza silnik. Po fixie partia 3004 realnie rzuca Lash: cel
Crawling Chorus, ofiara Soldier, log pokazuje poświęcenie-koszt i
zniszczenie celu (CR 601.2h — kolejność poprawna).

### F1 (silnik, NAJCIĘŻSZE, NAPRAWIONE — `3809b61`): pięć deskryptorów mechanik ginęło po cichu w prawdziwych partiach

**Objaw (g3004):** Crawling Chorus (toxic 1) zadał graczowi obrażenia
bojowe 3× — zero znaków trucizny; licznik ruszył dopiero od tokenu Mite.
Sonda: obiekt z materializacji talii miał `toxic=null`, tylko keyword
w `keywords` (kafel „Toksyczny" kłamał, combat czyta `source.toxic`).

**Root cause (L21/M146 — recydywa klasy):** `installDeck`
(`src/engine/deck.js`) kładzie na obiekcie biblioteki JAWNĄ listę pól z
wpisu talii, a `gameObjectDataOf` (materialize.js) kładzie ich więcej.
Ginęły: **echo** (Bone Shredder — brak pytania o płatność w upkeep),
**madness** (Revolutionist, Terminal Agony — odrzucenie bez oferty rzutu),
**surge** (Jwar Isle Avenger — brak {2}{U} po czarze w turze), **toxic**
(Crawling Chorus), **warp** (Weftblade Enhancer). Testy jednostkowe były
zielone, bo helpery (`putCard` + `gameObjectDataOf`) **omijają installDeck**
— dokładnie pułapka z komentarza M146 w deck.js.

**Druga luka echa:** znacznik `echoUnpaid` stawiało wyłącznie `addObject`
(helpery), a realna ścieżka rzutu (stos → pole bitwy przez
`moveObjectDirectly`) go pomijała — test B46/7c ustawiał go RĘCZNIE.

**Fix:** deck.js przenosi pięć pól; objects.js stawia echoUnpaid w choke
poincie wejścia na pole bitwy. Testy przez PRAWDZIWĄ ścieżkę
`setupCardMatch` (D1 pola, D2 toxic w ataku — symptom z żywego stołu, D3
echoUnpaid). Mutacyjnie: bez deck.js → D1–D3 czerwone; bez objects.js → D3.

### F2 (silnik, NAPRAWIONE — `66a5e4c`): kolejka decyzji madness (regresja ujawniona przez F1)

Gdy deskryptory doszły do realnych partii, **pełna partia bota na talii
Batch 3** (real-cards-batch3, seed 31) zaczęła ginąć wyjątkiem
`madness_unresolved`: odrzucenie karty z madness otwierało
`pendingMadnessCast` NATYCHMIAST, także w środku SEKWENCJI odrzuceń
(cleanup z 2 kartami nad limit) — oferta (gałąź odrzuceń wygrywa) i
walidacja (bramka madness wyżej) rozjeżdżały się; bot bez legalnej komendy.

**Fix (CR 702.34a):** karty z madness kolejkują się (`madnessQueue`);
promocja po zakończeniu sekwencji odrzuceń (gałąź normalna i rezygnacja),
kolejnych — po rozstrzygnięciu poprzedniej; bramka madness i
`firstPendingDecision` spójne z ofertą (L48, wzorzec rebound/undercity).

### F4+F5 (drobne, NAPRAWIONE — `3c7f33e`): Roiling Regrowth i log poświęcenia

- **F4:** „Sacrifice a land." to instrukcja ROZSTRZYGNIĘCIA, nie koszt —
  bez lądu na polu instrykję pomija się (CR 101.3/608.2b), ale szukanie
  pozostaje; silnik kończył cały efekt. Springbloom Druid („you may...
  If you do") bez zmian.
- **F5:** log „może poświęcić land" także przy obowiązkowym poświęceniu —
  fałszywe „may" (oś 2). Zdarzenie niesie `mandatory`, opis rozgałęzia.

### F3 (NAPRAWIONE — `f602ee4`, decyzja właściciela „nie akceptuję żadnych limitations"): cloak bez ward {2} (Veiled Ascension)

Veiled Ascension (MKC) cloakuje wierzch biblioteki. Implementacja poprawna
co do istoty (prawdziwa karta idzie na stół twarzą w dół, 2/2, lata z
licznika flying — potwierdzone w g3002), ale wg oficjalnych rulingów
karta pod cloakiem to 2/2 **z ward {2}** (Gatherer/Wizards MKM release
notes; w repo cytowane CR 702.75). Mechanika **ward nie istnieje w
silniku w ogóle** (żadna karta kolekcji jej nie ma), a
`veiled-ascension` deklaruje `limitations: []`.

**Rekomendacja:** albo (a) wdrożyć ward jako mechanikę (wymaga wyboru
płacisz/nie przy celowaniu — nowa klasa decyzji, bot + UI), albo (b)
uczciwie odnotować w `support.limitations` („cloak bez ward {2}").
Opcja (a) to feature — zostawiam właścicielowi (równolegle: D3/D4 z
HANDOFF_2026-08-29 — później zamknięte przez właściciela jako bezzasadne). Praktyczny wpływ obecnie zerowy (ward nigdy nie
wchodzi do gry — nikt nie celuje w cudzego Morph inaczej niż już jest).

**ROZSTRZYGNIĘCIE (2026-08-30, po Etapie 2.3):** właściciel wybrał (a) —
„Nie akceptuję żadnych limitations". Ward wdrożony jako PEŁNA mechanika
CR 702.21 (commit `f602ee4`): trigger ward nad czarem/zdolnością
celującą (LIFO), decyzja blokująca `resolve_ward_pay_choice` (zapłać
albo kontr; bez many automatyczny kontr), kontr czarów i ZDOLNOŚCI
(aktywowanych i triggerowanych z celem), boty, kreator many, log i
kafel („Ward {2}" na zakrytym). Testy W1–W9 + sanity 5 pełnych partii
botów (0 odrzuceń komend; zapłaty i kontry obserwowane).

## Fałszywe alarmy (odrzucone po weryfikacji — L57)

- **Assert Perfection bez wpisu o skutku (g3001):** pump to wyciszony
  `stats_modified` (świadomy szum, oś 2); obrażenia drugiego celu nie
  było, bo tester rzucił wariant bez drugiego celu (optional).
- **Jwari Shapeshifter umiera bez pytania o kopię (g3005):** kopiuje
  tylko Ally; na stole nie było Ally → 0/0 ginie (SBA) — poprawnie.
- **Bot ravnica gra same landy (g3001):** dobrał 2 landy w ~16 kartach,
  reszta wymagała kolorów — pech, nie ślepota PlayerView.
- **Banishment Decree „od razu dobrana karta" (g3003):** karta wraca NA
  WIERZCH biblioteki (Oracle) — dobicie w następnej turze poprawne.
- **Spreading Insurrection „trigger bez efektu" (g3005):** storm bez
  wcześniejszych czarów = 0 kopii; bazowy czar rozstrzygnął się normalnie.

## Wnioski dla procesu

1. **Recydywa L21/M146** w deck.js (jawna lista pól vs generator) — silnik
   dane traci w jednym miejscu, testy jednostkowe omijają je helperami.
   Pyny z Etapu 2.2 (D1–D3) trzymają się przez `setupCardMatch`.
2. **Testy „pełnej partii bota" łapią to, czego unit nie widzi** —
   regresja F2 ujawniła się DOPIERO po fixie F1 (madness realnie doszedł
   do botów). Warto trzymać przynajmniej jedną taką partię na talii z
   mechanikami nietypowymi (już jest: real-cards-batch3, warhammer-ubr).
3. **Kreator z PR #88 był martwy dla sterownika** — nowe modale UI wymagają
   gałęzi w run-game.mjs, inaczej Żywy Tester nigdy ich nie przećwiczy
   (drugie takie znalezisko po M203; wzorzec: gałąź per modal + limit prób).

## Bramy po zmianach

`npm test` **3819/3819** (3810 + 3 D + 3 M + 3 R); build 56 mod/2939.9 kB;
commity: `b14a532` (T1) → `3809b61` (F1) → `66a5e4c` (F2) → `3c7f33e`
(F4+F5). Pozycja na starcie Etapu 2.3 (CR hunting).

## Etap 2.3 — CR hunting: CR 202.3b, MV kopii tylnej twarzy DFC (`548ea00`)

Metoda: przegląd strukturalny RODZINY kopiowania (L11 — wszystkie ścieżki
jednej reguły czytane razem; L72 — przegląd rodzeństwa po fixie K2).
Skatalogizowano wszystkie ścieżki kopiowania w silniku: `create_copy_token`
(Cogwork Assembler — artefakty), `enterAsCopy` (Jwari Shapeshifter — Ally),
`token_clone` (Moonlit Meditation). Reguła wzorcowa: **CR 202.3b** — kopia
TYLNEJ twarzy DFC ma MV 0; kopia przedniej twarzy/permanentu — koszt
pierwowzoru (CR 707.2/707.3 — koszt many jest wartością kopiowalną).

**Znaleziona klasa błędu (trzy ścieżki, jeden root cause):**

| Ścieżka | Objaw | Root cause |
|---|---|---|
| `create_copy_token` | `manaCost` przekazywany do `createBattlefieldToken` ginął CICHO — KAŻDY token-kopia miał MV 0 (kopia przedniej twarzy powinna dziedziczyć koszt pierwowzoru; MV obiektu czyta m.in. Divine Offering jako zysk życia) | destrukturyzacja fabryki (tokens.js) nie znała pola `manaCost` — kontrakt zerwany bez żadnego błędu |
| `enterAsCopy` (Jwari) | koszt many NIE kopiowany wcale — kopia nosiła własny koszt Jwari (2) zamiast kosztu celu (CR 707.2) | pole pominięte na liście nadpisań w handlerze `resolve_enter_as_copy` |
| `token_clone` (Moonlit) | jw. — kopia bez MV pierwowzoru | jw. |

**Fix u root cause:** wspólny helper `copyManaValueOf()` (src/engine/identity.js)
— tył w górę rozpoznawany po `cardId ≠ frontFaceId` → MV 0, w przeciwnym
razie koszt pierwowzoru; `createBattlefieldToken` przyjmuje nowy parametr
`manaCost` (domyślnie 0 — zwykłe tokeny bez zmian). Testy RED→GREEN:
`test/m258-cr202-kopia-tylu-dfc.test.js` (C1 kopia tyłu → MV 0; C2 kopia
przodu → koszt przedni — anty-over-fix; C3/C4 enterAsCopy: tył → 0, przód →
koszt celu — to C4 spina CR 707.2: koszt many kopiowalny).

**Osiągalność zweryfikowana po katalogu (16 DFC):** tylko dwa tyły to
artefakty copyowalne przez Cogworka — Guidestone Compass (test C1) i Balamb
Airborne (koszt przedni 0 = MV 0 „przypadkiem" zgodne); Jwari kopiuje
wyłącznie Ally, więc C3/C4 wchodzą wprost do handlera (kontrakt generyczny,
filtr Ally siedzi w enumeracji spells.js).

**Znane ograniczenie → LIKWIDOWANE (`b481387`, decyzja właściciela „nie akceptuję żadnych limitations"):** pierwotna wersja tego rozdziału
tylnej twarzy, który przekształci się z powrotem w przód (craft na kopii),
zachowuje MV 0 zamiast kosztu przedniej strony — efekty `transform`/
`craft_transform` celowo nie ruszają `manaCost` (trzymają 712.8e: permanent
z tyłem w górze ma MV przedniej strony). Poprawny model wymagałby odrębnego
pola MV od pola kosztu; scenariusz podwójnie wąski (kopia przekształconego
Lodestone Needle + craft NA KOPII) — nie opłaca się.

Po decyzji właściciela ograniczenie usunięte: payload transformTo dostał jednolitą
semantykę (manaCost = MV obiektu z TĄ twarzą w górę = koszt przedniej, CR 202.3b
zd. 1), a wszystkie ścieżki zmiany twarzy (transform, craft, exile_return,
reset K5, nightbound) ją aplikują symetrycznie. Testy C5–C8 RED→GREEN.

**Rodzina pay-or-sacrifice (kandydat #2 planu 2.3) — zweryfikowana CZYSTA:**
wszystkie trzy człony rodziny strzegą płatności funkcją `producibleMana`/
`canPayTrigger` PRZED kolejkowaniem decyzji, a przy braku many wybierają
skutek automatycznie: `queuePayOrSacrifice` (Rupture Spire/echo — auto-
poświęcenie, CR 118.12), `counter_spell_unless_pays` (Frightful Delusion —
auto-kontr + discard), `fireOrQueuePay` (Panic Spellbomb/Zoraline — trigger
nie odpala). Brak dywergencji do naprawienia.



## Etap 2.3b + F3 — decyzja właściciela: „Nie akceptuję żadnych limitations"

Po zamknięciu Etapu 2.3 właściciel odrzucił OBIE pozycje zostawione do
decyzji (ograniczenie MV tokenu-kopii + F3 jako support.limitations).
Obie wdrożone jako pełne reguły:

| Pozycja | Commit | Zakres |
|---|---|---|
| MV dwustronnych tokenów-kopii (CR 707.8a + 202.3b) | `b481387` | jednolita semantyka payloadu transformTo (manaCost = MV z daną twarzą w górę); transform/craft/exile_return/K5-reset/nightbound aplikują ją symetrycznie; testy C5–C8 |
| WARD (CR 702.21) — cloak 2/2 z ward {2} (CR 702.75) | `f602ee4` | trigger nad czarem/zdolnością celującą (LIFO, CR 603.3), decyzja blokująca resolve_ward_pay_choice, auto-kontr bez many, kontr czarów i zdolności (aktywowanych + triggerowanych z celem), effectiveKeywords nie tłumi warda dla faceDown, boty (heuristic/aggro), kreator many, log, kafel „Ward {2}"; testy W1–W9 |

Weryfikacja: `npm test` **3836/3836**, `npm run test:all` **3846/3846**,
build 56 modułów / **2957.4 kB**; sanity 5 pełnych partii botów na
ravnica + 4× Veiled Ascension vs 4× Shock (seeds 71–75): 0 odrzuceń
komend, ward odpala (decyzje zapłaty, zapłaty i kontry zaobserwowane).

Nowa lekcja **L95**: nowa decyzja blokująca w silniku to NIE jeden
handler — lista kontrolna punktów integracji (6 strażników priorytetu,
EVENT_TYPES, COMMAND_TYPES, klasyfikatory obu botów, PAYMENT_DECISION_TYPES,
log, 3 mapy render). Pierwsze dwa redy testów W2 to dokładnie pominięte
wpisy w EVENT_TYPES/COMMAND_TYPES.
