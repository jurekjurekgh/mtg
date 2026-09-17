# MTG Engine

> **Agent / nowa sesja:** jedyny plik startowy, niezależny od wiadomości
> w czacie, to [`AGENTS.md`](AGENTS.md). Czytasz go cały, potem **wszystkie**
> ADR-y (`docs/decisions/`, w tym [0020](docs/decisions/0020-mandatory-session-workflow-pr-audit-incremental.md)),
> potem `docs/LESSONS.md` i `docs/setup/ENVIRONMENT.md` — **zanim** napiszesz
> do właściciela albo zaczniesz kodować.

Headless, rozwijalny silnik do rozgrywania partii **Magic: The Gathering** dla kontrolowanego, stopniowo rozszerzanego zbioru kart. Docelowo silnik będzie zasilał samodzielny Wirtualny Stół, walidował wszystkie działania i umożliwiał grę człowieka z przeciwnikiem sterowanym algorytmicznie.

> Projekt nie próbuje obsłużyć wszystkich istniejących kart MtG ani od razu zaimplementować całych Comprehensive Rules. Obsługiwany zakres rośnie karta po karcie, wraz z testami wymaganych mechanik.

## Status

Headless engine działa: zamknięte milestone'y **M1–M5** (odtwarzalny sandbox, zasoby,
combat, warstwa danych i pierwsza pionowa ścieżka UI — przez stołowy HTML rozgrywa
się pełną partię człowiek–bot), a na nim **M8–M43: Batche 1–21 (138 wspieranych kart
realnych**, pełne mechaniki — od liczników, morph i ninjutsu po Adventure, Kicker,
Crew, double strike, lifelink, Station (EOE Spacecraft), Sagę CR 714 (Jill//Shiva),
Metalcraft, prewencję „this turn", must-attack, kontrczary na dowolny czar, ping-pong
kontroli, inicjatywę, clash, phyrexian manę, czary wielocelowe, aury Enchant player,
defender, flash, Food, discover, explore, craft, Escape, modal Choose one, Tarmogoyf)
oraz **M31–M32: kreator talii singleton** — max 1 kopia (lądy podstawowe dowolnie),
min. 15 nielandowych; **9 talii** (green/black/red/innistrad/azorius/wiedzmin/graveyard/tokens/spellslinger)
zastąpiło dotychczasowe, **M34/M39–M42: UX stołu** — czary za manę produkowalną z auto-tapem,
wskaźnik tury jako warstwa fixed, kreator many, mulligan londyński, pauza po zagraniu bota
(klik „Rozumiem"), swipe karuzeli, polskie logi, tyły DFC poza taliami, mirror match,
oraz **M44–M48 / T1–T6: weryfikacja reguł MtG** — kolorowe koszty zdolności, finality dla każdej
przyczyny, dies/leaves, discard/hand-top wybory gracza, Unstable Frontier podtypy (CR 305.6),
search choice z fail-to-find, pay-or-sacrifice, optional pay, Moonlit, Lyre X, hexproof,
choroba + {T}, hand size 7, first-turn bez draw, anihilacja liczników, rozdział obrażeń
(CR 510.1c), mana per step, tokeny, legend face-down, morph koszty z pipami, permanenty
na stosie, cele triggerów jako wybór gracza (resolve_trigger_target), auto-tap pipów właściwą
maną, triggery na stosie, regeneracja.
B0 harness (B1–B5 bota, tune-bot), ilustracje Scryfall, ChoiceRequest i benchmark.
Bieżący stan: szybki rdzeń **5723/5723** (pełny tier **5733/5733**), artefakt **64 moduły / 3810,4 kB** (batch 56 ukończony, **10/10 kart** (artId 25–63) — energia {E} jako zasób gracza (`cost.energy`, „Pay {E}”), pojedynki usuwające (`exile_permanent` bez tranzytu przez grób; cel „artifact or land” + cycling), aury warunkowe (pomp/zakazy po podtypie czytane read-time; `tap_enchanted_permanent`), trigger ataku pojazdu („another target artifact or creature you control”) z crew 2, nowe zdarzenie drugiej fazy głównej z intervening-if i LKI, tokeny Goblin + ląd bliźniaczy; plan etapów: `docs/plans/PLAN_2026-09-17b-batch56-25-63.md`; **znaleziska właściciela A–J z gier testowych 2026-09-17c (etapy E1–E6, M369)**: stopka w strefie czytelnika, obraz tokenu Morph dla zakrytych permanentów, ilustracja tokenu Servo, etykiety decyzji i panel bez zdolności many, kontrola z chwili śmierci (LKI, lekcja L148), wymóg ataku a runda passów (Ramroller/goad), wycena exploita jako opłacalnej wymiany; plan: `docs/plans/PLAN_2026-09-17c-uwagi-wlasciciela-a-j.md`, handoff: [2026-09-17c](docs/setup/HANDOFF_2026-09-17c.md); **znalezisko L48 z E7 domknięte 2026-09-17d (M374, `55e0461`)**: grant lądu (Nature's Embrace) płacił w fazie pipów „za 1", a oferta obiecywała 2 — quick-25 (5 952 mecze) przechodzi bez przerwania (heuristic 87,0%, 0 niedokończonych); lekcja L149, plan: `docs/plans/PLAN_2026-09-17d-l48-grant-w-pipach.md`, handoff: [2026-09-17d](docs/setup/HANDOFF_2026-09-17d.md); znaleziska właściciela A–G wdrożone w PR #120; audyt PR #120 — APPROVE z zastrzeżeniami, PR #121 2026-09-15: naprawy F1 (wycena optional-trigger) i F2 (kreator many vs Powerstone), F3 sprzątanie, F4 cytaty CR, F5 domknięcie dokumentacji; port z równoległego audytu PR #122 (A4 okno Spare, O1 martwa gałąź, etykieta fire/skip; golden-master bit w bit zgodny z #122); Żywy Tester celowany w naprawy: Z1 Scholar — dobór z pustej biblioteki przegrywał na miejscu (draw_then_discard bez wyceny activate_ability), Z2 tokeny bez zdolności w rejestrze + niewidoczna restrykcja spendOnly — raport AUDYT_PR121_ZYWY_2026-09-15; audyt PR #121 — APPROVE, PR #123 2026-09-15: sprostowanie cytatów CR (G1 okno A4: podstawa CR 509.2 nie 510.1, G2 M172/C 509.4→509.2, G3 M221/E 4× 702.16c→702.16e; wyłącznie komentarze, raport AUDYT_PR121_2026-09-15; znalezisko A 2026-09-15 (ten sam PR): wymuszony discard całości bez modala — Reunion 2/2, koszty/efekty/sekwencje, madness w tej samej komendzie; lekcja L144; dźwięki czarów 2026-09-15 (ten sam PR): synteza Web Audio per typ, ikonki-toggle w belce, domyślnie dźwięki OFF / hi-gfx ON; 15g w tym samym PR: dźwięki per kolor 7×7, scryfall na warstwie bez KON, minima landów z pipów + regen 5 talii); **M359–M361 2026-09-16 (PR #123)**: odznaki regułowe Brąz/Srebro/Złoto — 15 błędów CR (M359 cleanup 514.3/514.3a + mentor/backup/delirium na stos 603.3; M360 Negate kontruje bestow-Aurę 702.103b, podtyp Aura w danych, dwa kroki obrażeń first/double strike 510.4+510.3, Station czyta LKI, ninjutsu w end_of_combat; M361 exploit źródłem własnym, Talion's Messenger 2 triggery, land drop z exile 701.18a/b, speed przy utracie życia, modalne cele przy rezolucji 608.2b); **audyt PR #123 — APPROVE z zastrzeżeniami** (raport AUDYT_PR123_2026-09-16), **PR #124 2026-09-16**: naprawa A1 — SBA wykonane w cleanupie otwierają priorytet (CR 514.3a dosłownie, dowody SBA w strumieniu zdarzeń), naprawa A2 — pendingCombatSecondPass trafia do odcisku stanu (L16/M323-F3), E3/O5 — 24 sprostowania kontekstu cytatów 702.16 po pełnym przeglądzie przeciw literalnemu CR 2026-08-07). Pełny zestaw: **5656/5656** (0 fail); bot-benchmark **10/10** (macierz w budżecie). Dopisek 3 (zlecenie właściciela): numeracja kopii nazw na polu bitwy — „Island #1, Island #2" na kaflu, w modalach i etykietach (strażnik unikalności + mutacja L13). Dopisek (ta sama sesja, zlecenie właściciela): domknięcie wszystkich obserwacji audytów #123 i #121 — O1 landSplit (jawny błąd zamiast NaN), O2 strażnik L16 engine-wide, O1–O4 z #121 (kreator many fail-closed, pełna tablica efektów may-trigger w widoku i wycenie F1, dokładne zbiory tokenów, badge mechanikowy). Dopisek 2 (ta sama sesja, znaleziska właściciela z testów): A1 tytuł wyboru koloru purpose-aware („produkcja many", nie „np. ochrona"), A2 badge „Wybrany kolor: Czarny" na karcie, A3 aktywacja Manor Gate produkuje i obiecuje {G} LUB wybrany kolor (union w effects.js + etykieta), B „The Undercity" wielką literą (nazwy wirtualnych kart w mapie sesji). **Audyt PR #124 — APPROVE bez nowych błędów** (raport AUDYT_PR124_2026-09-17; sondy mutacyjne potwierdziły, że strażniki A1/A2 realnie czerwienieją), **PR #125 2026-09-17**: O1 audytu — numeracja kopii nazw grupuje po nazwie WYŚWIETLANEJ (`battlefieldNameNumbers(objects, displayedNameOf)`; dwa wydruki jednego permanentu numerują się jak kopie, test sesyjny na klonie rejestru), E3 pętla jakości — Żywy Tester domyka warstwę wysoko-graficzną (`art-showcase` pauzuje grę przez `awaitingArtAck`), która kończyła partie fałszywym `[STOP]` i fałszywym detektorem „sam Poddaj partię" (luka narzędzia odtworzona na #123 i #124; po naprawie 4 partie po 400 kroków kończą się naturalnie, 0 zgłoszeń); **batch 56 2026-09-17b (ten sam PR)**: pomiar quick 25 talii wyłapał CZTERY bugi silnika — regeneracja blokowanego atakującego kasowała klucz `combat.blockers` (`3f4986f`), auto-tap zjadał jednostkę odłożoną na pip płatności (`51e5bef`, lekcja L147), kasowanie tokenu nie odpinało załączników living weapon (`038cc50`), oferta celów zdolności omijała wspólne źródło kandydatów i proponowała cudzy hexproof (`3453593`, kotwica L48); każdy zamknięty u root cause z pinem czerwieniejącym bez fixa, a detektor Żywego Testera przestał zgłaszać echo logu (`48087d5`) — 10 partii na taliach z nowymi kartami bez zgłoszeń. Integracja i znane uwagi jakościowe: [handoff 2026-09-17b](docs/setup/HANDOFF_2026-09-17b.md). Szczegóły:
[docs/ENGINE_MILESTONES.md](docs/ENGINE_MILESTONES.md) i [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md).

```bash
npm test          # szybki rdzeń (node tools/run-tests.mjs fast)
npm run test:all  # pełna brama PR, łącznie z regresją bota
npm run build     # skleja moduły w jeden plik HTML (dist/mtg-table.html)
```

### Jak zagrać

- **Przez adres URL:** artefakt publikuje się automatycznie na GitHub Pages po scaleniu
  do `main` (workflow `pages.yml`) — wejdź na adres strony z dowolnego urządzenia.
- **Z pobranego pliku:** uruchom `npm run build` i otwórz `dist/mtg-table.html`
  bezpośrednio w przeglądarce (moduły są sklejone, więc działa też z `file://`,
  np. na iPadzie — ADR 0011).

Na stronie wybierz seed i talie (są wstrzyknięte z katalogu `decks/`), naciśnij
„Rozpocznij partię" i graj przyciskami akcji: sesja sama rozgrywa ruchy bota
i przewija okna, w których masz do wyboru wyłącznie pass. Zapis partii (seed + komendy)
eksportujesz do pliku i importujesz w celu weryfikacji — replay odtwarza partię
komenda po komendzie.

Aktualny stan i rzeczy otwarte: **najnowszy [handoff sesji](docs/setup/)** oraz ostatni PR.
Dziennik przebiegu prac (historia sesji): [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md).

## Cel

System ma rozdzielać cztery odpowiedzialności:

1. **Engine** — autorytatywny stan gry, reguły, legalność działań, stos, priorytet, combat i efekty.
2. **Cards** — definicje obsługiwanych kart oraz mechaniki wielokrotnego użytku.
3. **Controllers** — ten sam interfejs decyzji dla człowieka, bota deterministycznego, bota przeszukującego i opcjonalnego agenta LLM.
4. **Game Table** — interfejs prezentujący dozwolony widok gry i wysyłający intencje, bez samodzielnego rozstrzygania reguł.

Najważniejsza granica systemu:

```text
kontroler → legalna intencja/wybór → engine → zdarzenia i nowy widok → UI
```

Kontroler ani UI nie modyfikują bezpośrednio autorytatywnego stanu.

## Zakres projektu

- obecny docelowy katalog właściciela to około 400 kart;
- karty będą implementowane pojedynczo lub małymi partiami;
- pierwsze testowe rozgrywki powinny być możliwe po obsłużeniu około 20 odpowiednio dobranych kart;
- każda obsługiwana karta musi mieć jawny status i testy;
- ukryte informacje mają być filtrowane zgodnie z zasadami MtG (Fog of War);
- początkowym przeciwnikiem będzie bot algorytmiczny; LLM pozostaje opcjonalnym kontrolerem na później.

## Dokumentacja

- [Karta projektu i zakres](docs/PRODUCT.md)
- [Docelowa architektura](docs/ARCHITECTURE.md)
- [Audyt istniejącej aplikacji](docs/AUDIT_LEGACY_APP.md)
- [Roadmapa](docs/ROADMAP.md)
- [Historia projektu (dziennik sesji)](docs/PROJECT_HISTORY.md)
- [Rejestr decyzji architektonicznych](docs/decisions/README.md)
- [Zasady współpracy](CONTRIBUTING.md)
- [Workflow pracy w repozytorium](docs/WORKFLOW.md)
- [Polityka bezpieczeństwa](SECURITY.md)
- [Instrukcja dla agentów](AGENTS.md)

## Talie

Talie **buduje generator** `tools/generate-plan-decks.mjs` (źródło prawdy
przydziału karty do talii); `test/repo-decks.test.js` pilnuje zgodności plików
w `decks/` z generatorem. Zasady: talie per PLAN
([ADR 0023](docs/decisions/0023-decks-per-plan-and-benchmark-sample.md)),
obowiązkowy podział kolorystyczny talii ≥30 kart nielandowych
([ADR 0024](docs/decisions/0024-deck-split-by-colors-and-rotating-benchmark.md)).
Zasady nadrzędne: singleton (1× karta poza basic-landami), basic-lądy ~2:1 do
reszty, min. 15 kart nielandowych na talię.

**Ta lista jest aktualizowana przy każdej zmianie zestawu talii** (liczności
liczone z plików `decks/*.txt`).

### Talie jednoplanowe

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | nielandowych |
|---|---|---|---:|---:|---:|
| `alara` | Alara | WUBRG | 36 | 12 | 24 |
| `dominaria-brg` | Dominaria (BRG) | BRG | 26 | 9 | 17 |
| `dominaria-wu` | Dominaria (WU) | WUB | 24 | 8 | 16 |
| `final-fantasy` | Final Fantasy | WUBRG | 26 | 9 | 17 |
| `forgotten-realms` | Forgotten Realms | WUBRG | 36 | 12 | 24 |
| `innistrad-brg` | Innistrad (BRG) | BRG | 27 | 9 | 18 |
| `innistrad-wu` | Innistrad (WU) | WU | 29 | 10 | 19 |
| `ixalan` | Ixalan | UBRG | 23 | 8 | 15 |
| `kaladesh` | Kaladesh | WUBRG | 26 | 9 | 17 |
| `mirrodin-brg` | Mirrodin (BRG) | BRG | 27 | 9 | 18 |
| `mirrodin-wu` | Mirrodin (WU) | WU | 27 | 9 | 18 |
| `ravnica` | Ravnica | WUBRG | 38 | 13 | 25 |
| `srodziemie` | Śródziemie | WUBRG | 30 | 10 | 20 |
| `tarkir-bg` | Tarkir (BG) | UBG | 33 | 11 | 22 |
| `tarkir-wur` | Tarkir (WUR) | WUR | 30 | 10 | 20 |
| `theros` | Theros | WUBRG | 27 | 9 | 18 |
| `warhammer-ubr` | Warhammer Fantasy (UBR) | UBR | 35 | 12 | 23 |
| `warhammer-wg` | Warhammer Fantasy (WG) | WG | 26 | 9 | 17 |
| `wiedzmin-bg` | Wiedźmin (BG) | BG | 24 | 8 | 16 |
| `wiedzmin-wur` | Wiedźmin (WUR) | WUR | 26 | 9 | 17 |
| `zendikar` | Zendikar | WURG | 32 | 11 | 21 |

### Worki (małe plany — przejściowe, ADR 0023)

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | nielandowych |
|---|---|---|---:|---:|---:|
| `worek-basni` | Worek: Baśnie | WUBRG | 36 | 12 | 24 |
| `worek-dziki` | Worek: Dzikie Światy | WUBRG | 27 | 9 | 18 |
| `worek-legend` | Worek: Legendy | WUBRG | 23 | 8 | 15 |
| `worek-mroczny` | Worek: Mroczne Światy | WUBRG | 27 | 9 | 18 |

Szczegóły formatu i manabazy: [`decks/README.md`](decks/README.md).

## Jak wprowadzamy zmiany

Gałąź `main` jest chroniona. Każda zmiana — także dokumentacyjna i także wykonana przez agenta —
trafia do `main` wyłącznie przez Pull Request:

- bezpośredni push i force push do `main` są zabronione, bypass list jest pusta;
- wymagane approvals: 0, ale wszystkie komentarze w PR muszą być rozwiązane;
- scalanie wykonuje właściciel świadomą decyzją, metodą `Squash and merge`;
- required status checks włączymy po zbudowaniu stabilnego CI.

Prosta instrukcja krok po kroku: **[docs/WORKFLOW.md](docs/WORKFLOW.md)**.
Uzasadnienie: [ADR 0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Stos technologiczny i uruchamianie

Czysty JavaScript w standardzie ES Modules, bez bibliotek i bez bundlera. Testy uruchamia
wbudowany `node --test`, kontrakty opisuje JSDoc, a pilnują ich testy inwariantów.

Źródła są modularne, ale **do grania dostarczamy jeden plik HTML** generowany automatycznie
przez CI. Powód: moduły ES nie działają po otwarciu pliku z dysku (`file://`), a właściciel
gra na iPadzie, gdzie nie da się uruchomić lokalnego serwera.

| Tryb | Jak uruchomić | Ilustracje |
|---|---|---|
| Online | wejście na adres GitHub Pages | Scryfall |
| Lokalnie | otwarcie pobranego pliku HTML | własne z `./img/`, fallback Scryfall |

Reguły, talie i przebieg partii są w obu trybach identyczne. **Właściciel nie instaluje
ani nie buduje niczego** — sklejaniem zajmuje się CI.

Uzasadnienie i lista świadomych kompromisów:
[ADR 0011](docs/decisions/0011-modular-sources-single-file-artifact.md)
oraz [ADR 0008](docs/decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona, ale
jej sekcja o kompromisach JavaScriptu nadal obowiązuje).

## Uruchomienie

```bash
npm test      # testy jednostkowe (node --test, bez zależności)
npm run build # sklejenie modułów -> dist/mtg-table.html
```

Zbudowany plik otwiera się dwuklikiem — także na iPadzie i iPhonie, bez serwera.

> **Konfiguracja publikacji:** włączenie CI i GitHub Pages wymaga uprawnień właściciela
> (agent nie ma `workflows` ani `pages`). Instrukcja: [docs/setup/URLOP_CHECKLISTA.md](docs/setup/URLOP_CHECKLISTA.md).

## Najbliższy etap

Etapy 1–5 zamknięte, Etap 2/3 przekroczony (472 wspierane karty realne + 8 tylnych stron
kart dwustronnych, poza taliami (`limited`) + 40 tokenów >> docelowe ~20), Etap 4 bota
zamknięty (heurystyka + modelowanie, harness B0, tune-bot), Etap 5 stołu zamknięty
(gra człowiek–bot na iPadzie przez Pages / file://).

Kolejne kroki:
1. **Kolejna lista kart od właściciela** — katalog nie rośnie bez niej (ADR 0029); numer nowego batcha wynika z aktualnego stanu projektu.
2. Dalsze czyszczenie luk MtG z listy właściciela — każda karta 100% Oracle albo niewspierana (ADR 0022), bez specjalnych przypadków po nazwie (ADR 0002).
3. Strojenie bota pod nowe mechaniki (Adventure/Kicker/Crew) i pętla jakości (Żywy Tester / zgodność CR); pełna macierz B0 tylko na komendę właściciela (ADR 0018).

Szczegóły kolejki i blokery: [docs/ROADMAP.md](docs/ROADMAP.md), najnowszy handoff sesji.

## Uwaga o pliku `card_viewer_12_10_for_Github.html`

To **zamrożony snapshot referencyjny** istniejącej aplikacji właściciela, z wyciętymi sekretami.
Służy wyłącznie jako materiał audytowy. Nie jest rozwijany, nie jest naprawiany i zostanie
usunięty po Etapie 5 ([ADR 0009](docs/decisions/0009-standalone-game-table-instead-of-extraction.md)).

## Ważna uwaga o nazwie i materiałach

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast. Magic: The Gathering i nazwy kart należą do ich odpowiednich właścicieli. Przed dodaniem dużej bazy danych lub grafik kart należy ustalić sposób ich przechowywania i status licencyjny; nie należy umieszczać ciężkich zasobów w Git bez uzgodnienia.
