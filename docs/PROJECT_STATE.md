# Bieżący stan projektu

- **Ostatnia aktualizacja:** 2026-08-02
- **Faza:** Etapy 1–4 zamknięte na katalogu syntetycznym; M5–M7 wdrożone — przez
  stołowy HTML można rozegrać pełną partię człowiek–bot. **M6: zdolności aktywowane
  i tworzenie tokenów wpięte w engine. M7: nowy układ stołu** — karty jako kolorowe
  kafelki (syntetyczna twarz), stół na całą szerokość (wróg u góry, Ty na dole, ręka
  na samym dole), strefy w modalnym inspektorze, podgląd hover i klik, rozwijane panele.
  **M8–M16: siedem batchy REALNYCH kart w katalogu** (23 karty: Highland Game, Kappa
  Tech-Wrecker, Segmented Krotiq, Grizzled Outcasts, Entrancing Lyre, Zoraline,
  Rupture Spire, Leafcrown Dryad, Prismari Campus, Gloomfang Mauler, Serra's
  Embrace, Cloak of the Bat, Midnight Guard, Holdout Settlement, Skyclave
  Geopede, Soulmender, Illusory Demon, Jyoti, Moag Ancient) — blokada braku
  prawdziwego katalogu (Etap 2/3)
  częściowo zniesiona. Batch 4 wniósł do engine: **menace, haste, backup
  (decyzja `resolve_backup`), typecycling, czyste aury i equipment** (załączniki
  uogólnione z bestow); Batch 5: **triggery wejścia (untap/landfall),
  trample, koszt „tap stwora"**; Batch 6: **trigger „when you cast a spell",
  land creatures, trigger beginning_of_combat**; Batch 7 (5 kart):
  **liczniki -1/-1, granty zdolności do końca tury, LKI, persist,
  reanimacja ze zmianą kontroli, opóźnione triggery, tokeny nie-stwory,
  koszt „Sacrifice this", atomowe koszty, zmiana typu podstawowego landa**. **B0: harness pomiarowy bota wdrożony**
  — każda kolejna zmiana bota (B1+) jest mierzona macierzą win-rate z
  `tools/benchmark.mjs` ([docs/BOT_ROADMAP.md](BOT_ROADMAP.md)).
  **M12: ilustracje realnych kart na stole** — kafle renderują druk ze Scryfalla,
  syntetyczna twarz jest fallbackiem.
- **Kod produkcyjny:** headless engine (`src/engine/`, `src/protocol/`), warstwa kart
  (`src/cards/`) z syntetycznym katalogiem i taliami w `decks/`, bot heurystyczny
  (`src/controllers/`), stół (`src/table/`) publikowany przez Pages

Ten plik jest krótkim punktem wejścia dla właściciela, nowych współpracowników i agentów.
Powinien być aktualizowany po każdej istotnej zmianie zakresu, architektury lub etapu prac.

## Proces pracy

Gałąź `main` jest chroniona i każda zmiana wchodzi przez Pull Request: bez bezpośredniego pusha
i force pusha, z pustą bypass list, 0 wymaganymi approvals, obowiązkiem rozwiązania komentarzy
i scalaniem metodą `Squash and merge` po jawnej decyzji właściciela. Required status checks
włączymy dopiero po zbudowaniu stabilnego CI.

Praca agentska przebiega w modelu sesyjnym: **1 sesja = 1 gałąź (`arena/...`) = 1 PR**.
PR sesji żyje przez całą sesję — kolejne tematy dopisują mu osobne, zielone commity,
a opis jest aktualizowany kumulacyjnie. Scalenie lub zamknięcie PR kończy sesję;
nowa sesja startuje od aktualnego `main`. Szczegóły:
[workflow — praca z sesją agentską](WORKFLOW.md#praca-z-sesją-agentską-arena).

Projekt realizują agenci **Agent Arena** ([ADR 0013](decisions/0013-agent-arena-sessions-and-mandatory-handoff.md)):
scalenie PR kończy sesję kodowania (brak dalszych modyfikacji GitHuba), a nowa sesja
nie widzi stanu lokalnego poprzedniej — startuje z `main` i z tekstu pierwszego promptu.
Dlatego **obowiązkowym etapem zamknięcia sesji jest instrukcja przekazania**: blok tekstu
w czacie do wklejenia następnemu agentowi + trwały zapis w tym pliku i w
`docs/setup/HANDOFF_<data>.md`.

Szczegóły: [workflow](WORKFLOW.md), [polityka bezpieczeństwa](../SECURITY.md),
[ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Co już wiemy o istniejącej aplikacji

Właściciel wgrał do repozytorium `card_viewer_12_10_for_Github.html` — jeden plik,
9 257 linii, z wyciętymi sekretami. Aplikacja została uruchomiona i przeanalizowana.
Pełny opis: **[docs/AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)**.

Najważniejsze ustalenia:

1. **Wirtualny Stół jest logicznie niezależny** — 30% kodu w dwóch blokach, sześć zależności
   od reszty aplikacji, jedno wywołanie w drugą stronę. Rozplątywanie nie jest potrzebne.
2. **Arkusz kolekcji nie zawiera danych reguł** — brak kosztu many, typów i P/T. To dlatego
   obecny prompt każe modelowi wyszukiwać statystyki kart w internecie.
3. **Stan gry jest mutowany z 105 miejsc** w handlerach UI, bez walidacji i warstwy komend.
4. **Fog of War nie istnieje** — ręka przeciwnika jest renderowana w całości, celowo.
5. **Brak determinizmu** — tasowanie przez `sort(() => Math.random() - 0.5)`, brak seeda.
6. **Kilka reguł MtG jest już poprawnie zakodowanych** (zmiana strefy czyści znaczniki,
   summoning sickness, znikanie tokenów) — to gotowa lista wymagań dla engine.

## Decyzje podjęte po audycie

| Decyzja | ADR |
|---|---|
| Czysty JavaScript (ESM) — język, testy i struktura katalogów | [0008](decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona przez 0011) |
| Budujemy standalone Wirtualny Stół, nie adapter w starej aplikacji | [0009](decisions/0009-standalone-game-table-instead-of-extraction.md) |
| Dane reguł kart pobierane ze Scryfall przed kodowaniem, potem trzymane w repozytorium | [0010](decisions/0010-card-rules-data-in-repository.md) |
| Modularne źródła, jednoplikowy artefakt, dwa tryby uruchomienia | [0011](decisions/0011-modular-sources-single-file-artifact.md) |

Konsekwencja dla zakresu: repozytorium **nie utrzymuje** aplikacji kolekcjonerskiej,
mang, komiksów, teleturnieju ani rankingu modeli AI. Właściciel ma własną kopię z tymi funkcjami.

### Jak to będzie działać w praktyce

- **Właściciel nie instaluje ani nie buduje niczego.** Sklejaniem modułów w jeden plik
  zajmuje się CI przy każdej zmianie na `main`.
- **iPad:** wejście na adres GitHub Pages, ilustracje ze Scryfall.
- **Komputer:** pobrany plik HTML otwierany bezpośrednio, ilustracje z lokalnego `./img/`.
- **Reguły, talie i przebieg partii są w obu trybach identyczne** — różni je tylko warstwa obrazów.
- **Talie są plikami w repozytorium.** Świadomy koszt: nowej talii nie zbuduje się z iPada
  w trakcie grania.
- **Partie zapisują się jako seed i lista ruchów**, więc każdy błąd da się odtworzyć
  z małego pliku tekstowego.
- **Cała warstwa AI znika** — brak klucza API, brak listy modeli, brak wywołań LLM.

Ważne zastrzeżenie techniczne: Safari na iOS kasuje `localStorage` po siedmiu dniach bez
wejścia na stronę (polityka ITP Apple). Dlatego przeglądarka służy wyłącznie jako wygodny
cache, a trwałość zapewniają pliki w repozytorium i eksport zapisu partii.

## Ustalony kierunek

- Budujemy **core engine bez zakodowanych konkretnych kart**.
- Core zawiera pojęcia i procedury gry, a karty są osobnymi definicjami korzystającymi
  ze współdzielonych mechanik.
- Karty dodajemy pojedynczo lub małymi partiami wraz z testami i danymi reguł.
- Nie dążymy do obsługi wszystkich kart MtG.
- Pierwszym praktycznym celem jest rozgrywka z taliami zbudowanymi z około 20 obsługiwanych kart.
- Engine jest jedynym autorytetem stanu i legalności działań.
- Wirtualny Stół powstaje jako samodzielna aplikacja korzystająca z engine.
- Gra ma zapewniać widok gracza zgodny z Fog of War; kontroler nie dostaje ukrytych danych przeciwnika.
- Pierwszy przeciwnik jest algorytmiczny i deterministyczny. Agent LLM pozostaje opcjonalny.

Szczegóły i uzasadnienia: [rejestr decyzji](decisions/README.md).

## ~~⚠️ Wymaga działania właściciela~~ ✔ Wykonane

Właściciel wgrał workflow CI i publikacji oraz włączył GitHub Pages
(instrukcja: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md)).
Oba workflow (`ci.yml`, `pages.yml`) przechodzą na `main`, więc artefakt
jednoplikowy publikuje się automatycznie po każdym scaleniu — testowanie
z iPhone'a/iPada działa.

## Najbliższe zadanie

**M1–M5 są zamknięte na katalogu syntetycznym: sandbox, zasoby, combat, warstwa danych,
bot heurystyczny i pierwsza pionowa ścieżka UI (gra człowiek–bot przez jeden plik HTML).**

Stan techniczny:

- M1: odtwarzalny headless sandbox — zamknięty, z formalnym testem pełnej ścieżki replay;
- M2: land drop, mana, creature permanent, koszt, tap/untap i summoning sickness — zamknięte;
- M3: combat syntetyczny w kontrakcie `legalCommands` (test własnościowy: każda oferowana
  komenda jest akceptowana), centralne state-based actions po każdej komendzie, spójny automat
  kroków — zamknięte; znane uproszczenia udokumentowane w `docs/ENGINE_MILESTONES.md`;
- M4: registry, statusy wsparcia, parser/writer tekstu talii, walidacja kopii, filtry
  i podsumowania — gotowe; **syntetyczny katalog testowy** (`src/cards/card-data.js`)
  z materializacją do obiektów gry i taliami wersjonowanymi w `decks/`; stos z czarami
  instant/sorcery, targetowaniem i pierwszymi efektami (damage/pump); bot heurystyczny
  ze śladem uzasadnień (`src/controllers/heuristic-bot.js`);
- M5: stół w jednym HTML (`src/table/`): sesja prowadzi partię człowiek–bot przez protokół
  (auto-ruchy bota, auto-przewijanie okien samego pasa, polski log zdarzeń); UI renderuje
  PlayerView, kliki wysyłają komendy, replay eksportuje się do pliku i importuje z walidacją;
  talie `decks/*.txt` wstrzykiwane do artefaktu przez build (ADR 0011/0012);
- artefakt jednoplikowy zawiera pełny stół: self-test w HTML uruchamia komendy przez
  `PlayerView`, a moduły źródeł są strzeżone przed cyklami importów i kolizjami nazw;
- pełna partia syntetyczna (talia z pliku → definicja → obiekt gry → symulacja → replay)
  kończy się rozstrzygnięciem w engine, także sterowana kliknięciami UI;
- UI kreatora talii — celowo jeszcze niezaimplementowane (ADR 0012).

Rozszerzenie Etapu 5 (bez decyzji właściciela):

- inspektor grobów i menu biblioteki z nazwami z registry;
- moduł adresów ilustracji (`./img/` vs Scryfall) — Etap 0b;
- framework abilities (activated/triggered/static), tokeny i załączniki;
- podgląd karty z ilustracją, autosave (`localStorage`) i wznawianie partii
  (z zapisu pola oraz z autosave);
- **zdolności aktywowane wpięte w engine** (`activate_ability` w `legalCommands`/
  `execute`: koszt tap + efekt pump), wspólny interpreter efektów
  (`src/engine/effects.js`) dla czarów i zdolności, **tworzenie tokenów przez
  efekt `create_token`**; syntetyczne karty `syn-warboar` (zdolność {T}: +1/+1)
  i `syn-swarmsummon` (czar: 1/1 Goblin) + definicja tokenu; talia
  `decks/synthetic-abilities.txt`; log tłumaczy nowe zdarzenia na polski.
- **M7 (nowy układ stołu, praca tylko w warstwie UI):** karty jako kafelki
  wyglądające jak karty (syntetyczna kolorowa twarz: nazwa, koszt, typ, pole
  reguł, P/T) zamiast tekstowych chipów; stół na całą szerokość (bitwisko wroga
  u góry, stos pośrodku, Twoje bitwisko na dole, ręka na samym dole) z układem
  perspektywicznym lądów/stworów; pasek statusu i pasek graczy (życie/biblioteka);
  **strefy (groby/exile/biblioteka) w modalnym inspektorze** zamiast pionowej listy;
  **podgląd karty** — hover (desktop) i klik (menu kontekstowe / modal z pełną twarzą);
  rozwijane panele akcji/logu/zapisu. Menu kontekstowe filtruje dozwolone akcje (komendy)
  po kliknięciu karty, również z optymalizacją dla touch/mobile (nagłówek jako miniatura karty).
  Zachowane wszystkie dotychczasowe funkcje stołu; engine i protokół nietknięte.
- **M8 (pierwszy batch realnych kart, 2026-08-01):** Highland Game (KTK),
  Kappa Tech-Wrecker (NEO), Segmented Krotiq (DTK). Dane ze Scryfall (ADR 0010 §2a)
  w `docs/cards/scryfall-*.json`, definicje `supported` w `src/cards/card-data.js`
  (z polem `oracleText` i adresem ilustracji druku), talia `decks/real-batch1.txt`.
  Nowe mechaniki w engine (minimalny wymiar dla tych kart): **liczniki** (+1/+1
  i znaczniki jak deathtouch), **triggered abilities** (`dies`,
  `combat_damage_to_player`), **ninjutsu** (z ręki, zwrot nieblokowanego
  atakującego, wejście tapped/atakujące), **morph/megamorph** (zagranie 2/2
  twarzą w dół za {3}, obrót za koszt megamorph z +1/+1, FoW tożsamości).
  Nowe efekty w `applyEffect`: gain_life, add/remove_counter, exile_permanent,
  turn_face_up. Testy `test/real-cards-batch1.test.js`; fingerprint uwzględnia
  liczniki i face-down; log i render stołu obsługują nowe karty (face-down jako 2/2).
- **M9 (drugi batch realnych kart, 2026-08-01):** Grizzled Outcasts (ISD, transform DFC
  na Krallenhorde Wantons 7/7), Entrancing Lyre (THB, {X},{T} z blokadą odkręcania),
  Zoraline, Cosmos Caller (BLB, flying/vigilance, tribał nietoperzy, reanimacja z finality).
  Nowe mechaniki: **transform** (trigger upkeep wg liczby czarów poprzedniej tury),
  **artefakty jako permanenty**, **koszt {X}**, **blokada odkręcania** (`untapLockedBy`),
  **flying/vigilance** w combacie, **subtypy** i trigger `bat_attacks`, **opcjonalna
  płatność triggera** (mana/życie), **reanimacja z finality counterem** (śmierć → exile).
  Bot heurystyczny punktuje zdolności aktywowane (używa {X}). Talia `decks/real-batch2.txt`;
  testy `test/real-cards-batch2.test.js`; 227/227 zielonych.
- **M10 (trzeci batch realnych kart, 2026-08-01):** Rupture Spire (CON, land ETB
  tapped + obowiązkowe „sacrifice it unless you pay {1}" z auto-tapem innego landa),
  Leafcrown Dryad (THS, enchantment creature z PEŁNYM bestow {3}{G} — czar aury
  na stosie, załączenie (nie-stwór), odłączenie w stwora, specjalna reguła
  nielegalnego celu; załączniki wpisane w engine na zawsze), Prismari Campus
  (STX, land ETB tapped + {4},{T}: Scry 1). Nowe mechaniki: **entersTapped** i
  obowiązkowy trigger „płać albo poświęć", **linie typów (types)** na obiektach
  (predykat artefakt/enchantment Kap-py łapie enchantment creature), **reach** w
  combacie, **załączniki aury bestow** (buff +2/+2 i reach w efektywnych
  statystykach), **scry 1** z blokującą decyzją `resolve_scry` (FoW: przeciwnik
  widzi tylko fakt, nie treść). Przy okazji naprawa regresji: instalacja talii
  gubiła deskryptory (`types`/`entersTapped`/`bestow`) w prawdziwych partiach.
  Talia `decks/real-batch3.txt`; testy `test/real-cards-batch3.test.js`;
  benchmark B0 przemierzony; 279/279 zielonych.
- **M7c (UX po uwagach właściciela z iPada, 2026-08-01):** hover wyłączony na dotyku
  (tap → tylko menu kontekstowe, bez migającego podglądu); auto-pass okien bez realnej
  decyzji — sam pass, samo tapnięcie landów (chyba że po odkręceniu staje się wykonalne
  zagranie), puste deklaracje ataku/bloków i puste rozstrzygnięcie walki przewijają się
  same, więc tura bota i puste fazy nie wymagają klikania; **akcje w wysuwanym panelu**
  (szuflada z lewej na desktopie / bottom-sheet na mobile, przycisk FAB z licznikiem)
  zamiast przewijanej listy na dole strony. Testy `test/session-autopass.test.js`.
- **B0 (harness pomiarowy bota, 2026-08-01):** `tools/benchmark.mjs` mierzy macierz
  win-rate bot-vs-bot (`aggro`/`heuristic`/`random`) na wszystkich taliach
  `decks/*.txt`, na N seedach (domyślnie 50), z meczami na obu stronach stołu na
  tych samych rozdaniach; bot aggro przeniesiony do produkcyjnych kontrolerów
  (`src/controllers/aggro-bot.js`), `random` w benchmarku gra bez losowej
  kapitulacji. Test regresji `test/bot-benchmark.test.js` pilnuje progów win-rate
  na deterministycznej próbce. Od B0 każda zmiana bota jest mierzona tym harnessem
  (tabela w opisie PR). Roadmapa bota B0–B5 wraz z rozstrzygnięciami właściciela
  (max trudność, okienko rozumowania domyślnie zwinięte, warunek dla ML):
  [docs/BOT_ROADMAP.md](BOT_ROADMAP.md). Baseline (po Batchu 4, 9 talii):
  heuristic 67.4% vs random, 59.0% vs aggro, aggro 71.4% vs random
  (13 500 meczów, 0 niedokończonych).
- **M11 (czwarty batch realnych kart, 2026-08-01):** Gloomfang Mauler (DSK,
  menace + swampcycling {2}), Serra's Embrace (czysta aura: +2/+2, flying,
  vigilance), Cloak of the Bat (equipment: +1/+1, flying, haste). Nowe mechaniki:
  **menace**, **haste**, **backup 2** (blokująca decyzja `resolve_backup`),
  **typecycling** z ręki (odrzucenie → wyszukanie → reveal → tasowanie seedem),
  **załączniki uogólnione** (jedna warstwa dla bestow, czystych aur i equipmentu)
  oraz **wirtualne landy podstawowe** (`VIRTUAL_BASIC_LANDS`). Talia
  `decks/real-batch4.txt`; testy `test/real-cards-batch4.test.js`;
  313/313 zielonych.
- **M12 (ilustracje realnych kart na stole, 2026-08-02; tylko warstwa UI):**
  kafel karty z realnym drukiem renderuje obraz ze Scryfalla (`imageUri`
  przeskalowany do `normal`, `loading="lazy"`), a syntetyczna twarz zostaje
  **fallbackiem** — widocznym do czasu wczytania i na stałe po błędzie
  (404/offline). Hover (desktop) i pełny podgląd pokazują ten sam druk w
  rozmiarze `large`; **scroll nad kartą przełącza tor podglądu**
  (scryfall → FOT → KON) jak w pliku legacy, z kształtami okien 320×448 /
  900×386 / 900×550. Karty zakryte mają wspólny rewers (FoW: adres nie zależy
  od karty), DFC po transformacji pokazuje `/back/`, tapnięcie obraca cały
  kafel z obrazem, a nakładka stanu (obrażenia, choroba, aura/equipment,
  efektywne P/T) rysuje się na ilustracji. Wirtualne landy dostały „stały
  druk" — przekierowanie po nazwie (`api.scryfall.com`), jak w legacy.
  Nowe: `artId` w definicji karty + `tools/fetch-art-ids.mjs` (uzupełnia
  numery ilustracji z opublikowanego CSV arkusza kolekcji; adres wyłącznie
  ze zmiennej `MTG_COLLECTION_CSV_URL`, nigdy w repozytorium).
  Testy `test/table-card-art.test.js`, `test/art-ids-tool.test.js`,
  rozszerzony `test/card-images.test.js`; 342/342 zielonych. Instrukcja:
  [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
- **M13 (artId z arkusza kolekcji, 2026-08-02; dane + narzędzie):**
  `tools/fetch-art-ids.mjs` uzupełnił `artId` w definicjach **wszystkich
  13 realnych kart** (Highland Game 509, Kappa Tech-Wrecker 278, Segmented
  Krotiq 523, Grizzled Outcasts 171, Krallenhorde Wantons 486, Entrancing
  Lyre 195, Zoraline 480, Rupture Spire 448, Leafcrown Dryad 521, Prismari
  Campus 459, Gloomfang Mauler 199, Serra's Embrace 110, Cloak of the Bat 200).
  Ekstrakcja numeru obsługuje formaty `412FOT.png`, `77.png`, `9KRA.png`
  oraz `1LTR` (liczba + kod setu — aktualny format kolumny `Ilustracja`),
  a aktualizacja istniejącego `artId` zachowuje przecinek (poprawka
  idempotencji przy zmianie numeru). Tory podglądu FOT/KON używają teraz
  lokalnych `./img/<artId>FOT.png`/`KON.png`, gdy plik istnieje, z fallbackiem
  na Scryfall; bez zmian w runtime. Testy `test/art-ids-tool.test.js`,
  `test/card-images.test.js` zaktualizowane do stanu „karty mają artId";
  342/342 zielonych.
- **M13b (słownik kart kolekcji w repo, 2026-08-02; dane + narzędzie):**
  pełna lista kart z arkusza (542 karty, kolumny `Ilustracja`,`Nazwa Karty`,
  z ID setu: `1LTR` = nr 1 z LTR, `5_2XM` = nr 5 z 2XM) wersjonowana
  w `tools/collection-art-ids.csv`; **duplikaty nazw z różnych setów
  zachowane**. Logika narzędzia: 1) słownik lokalny (offline, domyślnie),
  2) karty spoza słownika → fetch z arkusza, 3) nadal bez numeru → bez
  `artId` (tory FOT/KON spadają na Scryfall). Dopasowanie rozstrzyga
  duplikaty po secie karty (`pickArtId`), inaczej pierwszym wpisem;
  `--csv` to pełne nadpisanie źródeł. Test pilnuje spójności słownika
  z `card-data.js` (każda karta z `artId` ma zgodny wpis — także po secie).
  Procedura odświeżania: docs/setup/ILUSTRACJE_KART.md. 345/345 zielonych.
- **M14 (piąty batch realnych kart, 2026-08-02):** Midnight Guard (DKA —
  trigger „another creature enters" odkręca źródło), Holdout Settlement (OGW —
  land: {T}: Add {C} + {T}, tap untapped creature: add one mana),
  Skyclave Geopede (ZNR — trample + Landfall +2/+2 do końca tury). Nowe
  mechaniki w engine: **trigger wejścia na cudze źródła** (untap i landfall),
  **trample** (nadmiar obrażeń nad blokerami na gracza), **koszt „tap
  stwora"** (`tapCreature` — deterministyczny jak płatności M10), efekty
  `untap_permanent` i `add_mana` (dowolny kolor = 1 bezbarwna). Wszystkie 3
  karty mają `artId` ze słownika (385/79/493). Talia `decks/real-batch5.txt`;
  testy `test/real-cards-batch5.test.js` (13); benchmark z 10 taliami
  (16 500 meczów): heuristic 77.1% vs random, 60.4% vs aggro, 73.5% aggro vs
  random — próbka regresji 74.8%/63.2%, progi podniesione do 0.59/0.48.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  359/359 zielonych.
- **B2 (infrastruktura lookahead, 2026-08-02):** `src/engine/lookahead.js`
  (`makeSimulate` — kandydat na `structuredClone` stanu + dogranie polityką,
  horyzonty combat/main_phase, deterministyczne), `runSimulation` przekazuje
  `helpers.simulate`, `createHeuristicBot({ lookahead: 1 })` (domyślnie 0).
  **Pomiar wykazał pogorszenie** (baseline 76.5% vs random → 70.3% z lookahead
  na próbce 10 seedów; wszystkie 4 warianty strojenia poniżej baseline) —
  lookahead zbyt często rezygnuje z ataków, a w małych taliach (deck-out)
  presja ataku jest więcej warta. Zgodnie z zasadą B0 (zakaz pogorszenia)
  funkcja **domyślnie wyłączona**; infrastruktura + testy
  (`test/bot-lookahead.test.js`, 8) zostają jako fundament pod B2-w2.
  Szczegóły i tabela pomiarów: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
  367/367 zielonych.
- **B5 (okienko rozumowania bota, 2026-08-02; decyzja właściciela
  2026-08-01 — tylko warstwa UX):** nowy panel stołu „Rozumowanie bota"
  obok Logu partii, **domyślnie zwinięty** (`<details>` bez `open`); po
  rozwinięciu pokazuje „dlaczego bot zagrał X" — ślad decyzji z `trace()`
  bota (wybrana opcja, ocena, najlepsze alternatywy, np. `T3 · Faza
  główna — Zagranie landa (ocena 90); najlepsza z 3 opcji. Alternatywy:
  Zagranie permanentu (70), Pass priorytetu (0).`). Sesja zbiera wpisy
  (bufor 60, czyszczony przy wznowieniu), boty bez trace nie psują sesji
  (panel: „Brak danych"). Engine/protokół/bot nietknięte — bez pomiaru
  benchmarku (to nie zmiana bota). Testy `test/bot-reasoning.test.js` (8);
  375/375 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **M15 (szósty batch realnych kart, 2026-08-02):** Soulmender (M20 — {T}:
  zysk 1 życia), Illusory Demon (ARB — flying + trigger „when you cast a
  spell" → poświęcenie źródła), Jyoti, Moag Ancient (M3C — ETB tworzy
  tokeny Forest Dryad wg liczby rzuceń commandera (tu zawsze 0 — brak
  command zone, mechanicznie poprawne) + na początku walki pompuje land
  creatures o moc Jyoti). Nowe w engine: **trigger „when you cast a spell"**
  (dla spell_cast i permanent_cast; casting samej karty nie poświęca jej —
  poprawność wg CR), **land creatures** (token Forest Dryad: typ Land +
  rodzaj creature — walczy i tapuje się na manę), **trigger
  beginning_of_combat**, dynamiczny pump `source_power`, `create_token`
  z liczbą `commander_casts`, efekt `buff_land_creatures`. Bot unika
  rzucania czarów przy własnym demonie (kara wg wartości stwora). Wszystkie
  3 karty mają `artId` ze słownika (13/305/307). Talia `decks/real-batch6.txt`;
  testy `test/real-cards-batch6.test.js` (15); benchmark z 11 taliami
  (19 800 meczów): heuristic 74.7% vs random, 58.6% vs aggro, 73.2% aggro
  vs random — próbka regresji 72.7%/62.5%, progi 0.59/0.48 bez zmian.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  391/391 zielonych.
- **M16 (siódmy batch realnych kart, 2026-08-02; od tego batcha 5 kart na
  batch — decyzja właściciela):** Fake Your Own Death (OTJ), Puppeteer
  Clique (SHM), Unstable Frontier (CON), Apprentice Wizard (2XM), Delta
  Bloodflies (TDM). Nowe w engine (generycznie, ADR 0002): **liczniki
  -1/-1** w statystykach, **granty zdolności „do końca tury"**
  (`abilityGrants` + `grant_abilities`), **LKI** (`formerCounters`,
  `formerAbilityGrants` — CR 603.10), **persist** (CR 702.79),
  **reanimacja z grobu przeciwnika ze zmianą kontroli**, **opóźnione
  triggery** (`state.delayedTriggers`, CR 603.7), **tokeny niebędące
  stworami** (Treasure z własną zdolnością), **koszt „Sacrifice this"**,
  **atomowe koszty zdolności** (naprawiony błąd: nieudana aktywacja
  zostawiała permanent zatapniony), **cel „land you control" + tymczasowa
  zmiana typu podstawowego**, **`lose_life`** i **intervening if**.
  Wszystkie 5 kart ma `artId` ze słownika (295/343/49/188/431). Talia
  `decks/real-batch7.txt`; testy `test/real-cards-batch7.test.js` (25);
  benchmark z 12 taliami (23 400 meczów): heuristic 76.9% vs random,
  61.3% vs aggro, 75.8% aggro vs random — próbka regresji 74.8%/64.6%,
  próg vs aggro podniesiony do 0.49. Szczegóły:
  [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md). 427/427 zielonych.
- **B3 (modelowanie przeciwnika, 2026-08-02; pozycja 10.4):**
  `src/engine/hypergeom.js` (deterministyczna hipergeometria) + bot zna
  talię przeciwnika (`opponentDeck` — przekazywana z benchmarku i sesji)
  i klasyfikuje jego czary generycznie (instant damage = removal, pump =
  combat trick). Model ręki: N = biblioteka+ręka, K = kopie odpowiedzi minus
  widoczne w strefach publicznych (adaptacja w trakcie partii), n = ręka.
  **EV ataku**: kara ≈ wartość stwora × P(removal) przy otwartej manie wroga
  i P>45% (nie w wyścigu — lekcja B2); **EV bloku**: kara za blok zabijający
  atakującego przy ryzyku pumpa (poza presją śmiertelną). Pomiar: pełna
  macierz 19 800 meczów — 74.5% vs random, 58.6% vs aggro (baseline
  74.7/58.6 — neutralny wobec botów benchmarku; wartość w grze z człowiekiem
  trzymającym odpowiedzi); próbka regresji 72.5%/62.5%, progi 0.59/0.48
  bez zmian. Testy `test/hypergeom.test.js` + `test/bot-opponent-model.test.js`
  (11); 402/402 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **B1 (lepsza heurystyka bota, 2026-08-02; pozycja 10.3 kolejki):**
  świadomość kroków tury (bez tapowania many/zdolności {T} w untap/upkeep/
  draw/end/cleanup), zegar (blisko lethal, wyścig, deck-out), ocena planszy
  (flying-evasion, parytet stworów, ceny bloków), wycena zdolności z definicji
  karty (pump − koszt tapu, neutralizacja Liry wg celu, equip, cycling,
  ninjutsu). **Naprawiona patologia deck-out** na `synthetic-abilities`
  (heuristic 0% → 100% vs random w mirrorze — bot stał z zatapianymi
  stworem i wypalał własną bibliotekę). Pełna macierz 50 seedów (13 500
  meczów): heuristic vs random **75.4%** (było 67.4%), vs aggro **60.9%**
  (było 59.0%), agregat heuristic 68.1% (było 63.2%); próbka regresji
  73.1% / 63.3%, progi w `test/bot-benchmark.test.js` podniesione do
  0.58 / 0.48. Szczegóły i tabele: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).

Następny większy pakiet: kolejny batch realnych kart (lista od właściciela; każda
karta z danymi ze Scryfall — ADR 0010 §2a). Zamknięte: ilustracje (poz. 10.1),
Batche 1–6 (18 kart), B1 i B5 (UX) bota; B2 — infrastruktura lookahead
(eksperyment nie przeszedł progu jakości, funkcja wyłączona).
Świadome uproszczenia M8–M11 (brak kaskadowania triggerów,
deterministyczne „you may", wymuszana płatność „unless you pay", scry tylko na
własnej bibliotece, uproszczony model continuous effects dla aur bestow itd.)
są udokumentowane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

> **Odstępstwo od ADR 0010 §1:** ADR przewiduje „jedna karta = jeden plik"
> w `src/cards/definitions/`, ale repozytorium ewoluowało do pojedynczego modułu
> `src/cards/card-data.js`. Decyzją właściciela definicje realnych kart Batchu 1
> trafiły tam (sekcja `REAL_CARDS`). Aktualizacja ADR lub wydzielenie katalogu
> definicji do rozważenia przy większych partiach kart.

Milestone’y i kryteria są zapisane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

Historyczna kolejność pierwszych kroków (zrealizowana w bieżącym PR):

1. Szkielet `src/engine/`, `src/protocol/` i `test/` zgodny z ADR 0011.
2. CI uruchamiający `node --test` przy każdym PR.
3. `build.mjs` + publikacja na GitHub Pages — żeby każdy kolejny przyrost był od razu
   sprawdzalny na iPadzie, a nie dopiero na końcu projektu.
4. Tożsamość obiektów i strefy z kontrolowaną zmianą strefy.
5. Seedowane RNG i poprawne tasowanie.
6. `GameState` → `PlayerView` z testem braku wycieku ukrytych informacji.

## Otwarte pytania

Audyt zamknął większość pytań z poprzedniej wersji tego dokumentu (zob. §9 audytu).
Pozostają:

1. **Które karty wchodzą do pierwszego zestawu?** **Batche 1–6 (18 kart) zakodowane;
   kolejny batch czeka na listę właściciela.** Dostarczone i zamknięte
   (Batch 1: Highland Game, Kappa Tech-Wrecker, Segmented Krotiq; Batch 2: Grizzled
   Outcasts, Entrancing Lyre, Zoraline, Cosmos Caller; Batch 3: Rupture Spire,
   Leafcrown Dryad, Prismari Campus; Batch 4: Gloomfang Mauler, Serra's Embrace,
   Cloak of the Bat; **Batch 5 (2026-08-02): Midnight Guard, Holdout Settlement,
   Skyclave Geopede**). Przed kodowaniem każdej karty obowiązkowy pobór danych
   ze Scryfall (ADR 0010 §2a). Docelowo ~20 wspieranych kart.
   *(częściowo rozstrzygnięte 2026-08-01, Batch 5 2026-08-02)*
2. ~~**Jaki rozmiar talii dla pierwszych rozgrywek?**~~ **Rozstrzygnięte 2026-08-01:**
   bez minimalnej wielkości — talia ma tyle kart, ile wyjdzie z kreatora. Walidacja
   rozmiaru (`size` w `validateDeck`) pozostaje opcjonalna i domyślnie wyłączona.
3. **Jaki docelowy poziom ochrony FoW?** W aplikacji czysto klienckiej realnie osiągalne jest
   „uczciwe UI + kontroler bez dostępu do ukrytych danych". Pełna poufność wymaga backendu.
   Decyzja potrzebna dopiero przy Etapie 6.
4. **Czy stół ma zachować tryb swobodny (sandbox)** jako narzędzie diagnostyczne obok
   trybu sterowanego regułami?
5. **Kreator talii:** rozstrzygnięte w ADR 0012 — powstanie po pierwszych kartach; bez `localStorage`,
   z filtrami `Plan`/`Set`/nazwa, walidacją talii i wspólnym tekstowym formatem eksportu oraz plików repozytorium.
6. ~~**Czy podnieść ADR 0005 do „Zaakceptowana"?**~~ **Rozstrzygnięte 2026-08-01:**
   [ADR 0005](decisions/0005-deterministic-replayable-execution.md) jest zaakceptowana —
   determinizm jest wymogiem działania zapisu partii.
7. ~~**Czy prawdziwe landy (Forest/Mountain…) wejdą do katalogu?**~~ **Rozstrzygnięte
   2026-08-01:** NIE. Landy podstawowe istnieją wirtualnie — do talii dobiera się
   dowolną liczbę sztuk, a ilustracje wyświetlają się ze Scryfall tak jak w pliku
   legacy HTML. **Zaimplementowane od Batchu 4 (M11):** `VIRTUAL_BASIC_LANDS`
   w `src/cards/card-data.js` (Plains/Island/Swamp/Mountain/Forest jako
   `supported`, typy `['Basic','Land']` + podtyp), `parseDeckText` przyjmuje
   dokładne nazwy, `validateDeck` nie limituje kopii, typecycling ma realny cel
   wyszukiwania; talia `decks/real-batch4.txt` używa `8x Swamp`. Pozostaje
   ilustracja: **zrobiona 2026-08-02** — stały druk landów podstawowych to
   przekierowanie po nazwie do Scryfalla (`imageUri` w `VIRTUAL_BASIC_LANDS`),
   jak w pliku legacy.
8. ~~**Docelowy poziom trudności bota i prezentacja jego rozumowania w UI.**~~
   **Rozstrzygnięte 2026-08-01:** trudność maksymalna dostępna; rozumowanie w osobnym
   okienku stołu, domyślnie zwiniętym, docelowo rozwiniętym. Szczegóły:
   [docs/BOT_ROADMAP.md](BOT_ROADMAP.md) (B5).
9. ~~**Czy wolno wprowadzić zależność ML (B4)?**~~ **Rozstrzygnięte warunkowo
   2026-08-01:** tylko jeśli stół nadal działa lokalnie (z pobranego pliku / lokalnego
   serwera HTTP) i zdalnie z GitHub Pages na iPadzie/iPhonie bez instalowania czegokolwiek
   — w praktyce czysty JS w jednoplikowym artefakcie (ADR 0011). Framework ML wymaga
   osobnej decyzji i ADR.
10. **Kolejka zadań zatwierdzona przez właściciela 2026-08-01** (priorytet malejący;
    handoff: [docs/setup/HANDOFF_2026-08-01.md](setup/HANDOFF_2026-08-01.md)):
    1. ~~**Ilustracje prawdziwych kart na stole.**~~ **Zrobione 2026-08-02**
       (M12 niżej): kafel realnej karty renderuje druk z `imageUri` (rozmiar
       `normal`, lazy-load), hover i pełny podgląd pokazują ten sam obraz w
       `large`, syntetyczna twarz jest fallbackiem. Objęte: DFC (po transformacji
       tył), tapnięcie (obrót całego kafla), rewers dla kart zakrytych, wirtualne
       landy (druk domyślny Scryfalla), tory podglądu FOT/KON przełączane
       scrollem jak w legacy. Instrukcja:
       [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
    2. ~~**Batch 5 realnych kart**~~ **Zrobione 2026-08-02 (M14):** Midnight
       Guard, Holdout Settlement, Skyclave Geopede (procedura ADR 0010 §2a;
       triggery wejścia, trample, koszt „tap stwora"). **Batch 6 (M15,
       2026-08-02): Soulmender, Illusory Demon, Jyoti, Moag Ancient
       (when you cast a spell, land creatures, beginning_of_combat).**
       **Batch 7 (M16, 2026-08-02, 5 kart): Fake Your Own Death, Puppeteer
       Clique, Unstable Frontier, Apprentice Wizard, Delta Bloodflies
       (granty zdolności, persist, reanimacja, opóźnione triggery).**
    3. ~~**Etap B1 bota**~~ **Zrobione 2026-08-02** — każda zmiana mierzona
       `node tools/benchmark.mjs` (tabela przed/po w opisie PR), progi w
       `test/bot-benchmark.test.js` podniesione (0.59 / 0.48 po Batchu 5).
       Wynik: 75.4% → 77.1% vs random (9 → 10 talii), 60.9% → 60.4% vs aggro;
       patologia deck-out naprawiona. Szczegóły: [BOT_ROADMAP](BOT_ROADMAP.md).

## Aktualny bloker

Brak dalszej listy realnych kart — **Batche 1–7 (23 karty) zakodowane; kolejny
batch (5 kart) czeka na przesłanie listy przez właściciela.** Poz. 10.1
(ilustracje), **Batche 2–7 i B1 oraz B5 (UX) są zamknięte**; B2 — infrastruktura lookahead
(eksperyment nie przeszedł progu jakości, wyłączona; szczegóły:
[docs/BOT_ROADMAP.md](BOT_ROADMAP.md)). Do czasu listy kart rozwój może iść
→ B4 (uczenie/strojenie wag heurystyki przez ewolucję) — decyzja właściciela.

Poboczna zaległość z poz. 10.1: **zamknięta 2026-08-02 (M13)** — `artId`
dla wszystkich 13 realnych kart uzupełniony z opublikowanego arkusza
(adres wyłącznie w `MTG_COLLECTION_CSV_URL` / `tools/collection.config.json`,
nigdy w artefakcie stołu); pełny słownik kolekcji (542 karty) wersjonowany
w `tools/collection-art-ids.csv` (M13b). Tory FOT/KON działają, gdy pliki `./img/`
istnieją; bez plików cicho spadają na Scryfall.

## Kryterium ukończenia aktualnej fazy

Etap 1 kończy się, kiedy:

- istnieje uruchamialny headless engine bez zależności od DOM-u i sieci;
- `node --test` przechodzi lokalnie i w CI;
- kontrakty `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest` są zaimplementowane
  i opisane w JSDoc;
- test potwierdza brak wycieku ukrytych informacji do `PlayerView`;
- ten sam seed i ta sama sekwencja komend dają identyczny przebieg symulacji;
- dwa `RandomBot`-y przechodzą przez minimalną symulację tur.

## Zasada aktualizacji

Każdy PR zmieniający kierunek projektu powinien odpowiednio aktualizować:

- ten plik — jeśli zmienia się bieżący stan lub następny krok;
- `docs/ROADMAP.md` — jeśli zmienia się kolejność etapów;
- ADR — jeśli zapada lub zmienia się decyzja architektoniczna;
- dokumentację karty/mechaniki — jeśli zmienia się zakres jej obsługi.
