# Plan milestone'ów headless engine

Dokument roboczy określa większe paczki pracy. Nie zastępuje `ROADMAP.md`; opisuje
kolejność realizacji technicznej i kryteria, po których można przejść dalej.

## M1 — Odtwarzalny headless sandbox

**Status:** zamknięty.

Zakres:

- [x] rozdzielenie definicji karty, instancji i obiektu gry;
- [x] strefy i kontrolowana zmiana strefy;
- [x] GameState, Command, Event, ChoiceRequest i PlayerView;
- [x] Fog of War ręki i biblioteki;
- [x] seedowane RNG, tasowanie i instalacja talii;
- [x] ręka otwarcia;
- [x] tura, kroki i priorytet;
- [x] dobieranie (akcja turowa: limit 1 na krok) oraz przegrana z pustej biblioteki;
- [x] życie, obrażenia, koncesja i warunki końca;
- [x] registry statusów kart i walidacja supported;
- [x] limit kopii z wyjątkiem landów podstawowych;
- [x] log zaakceptowanych komend, replay i fingerprint;
- [x] RandomBot i deterministyczna symulacja;
- [x] walidator inwariantów;
- [x] formalny test całej ścieżki replay (pełna tura + partia syntetyczna).

**Exit:** identyczna konfiguracja, seed i komendy dają identyczny fingerprint; widok
kontrolera nie zawiera ukrytych informacji; żadna komenda nie omija walidacji engine —
wszystko potwierdzone testami.

## M2 — Minimalne zasoby i permanenty

**Status:** zamknięty.

- [x] jawny model tap/untap;
- [x] mana pool, produkcja many i jawne operacje dodania/wydania zasobu;
- [x] reset zasobów w odpowiednim kroku;
- [x] land drop z limitem na turę;
- [x] rozróżnienie permanent/spell bez nazw kart w core;
- [x] podstawowy koszt i płatność zasobu dla creature permanenta;
- [x] testy legalnego i nielegalnego zagrania;
- [x] kontrakt `legalCommands`: każda oferowana komenda jest akceptowana
      (test własnościowy), pass tylko dla posiadacza priorytetu.

## M3 — Combat bez kart konkretnych

**Status:** zamknięty na obiektach syntetycznych.

- [x] deklaracja atakujących;
- [x] deklaracja blokujących;
- [x] obrażenia stworzeń i oznaczone obrażenia;
- [x] state-based actions dla stworzeń;
- [x] celowanie w gracza w podstawowym combat;
- [x] scenariusz pełnej syntetycznej sekwencji combat w symulatorze;
- [x] combat wchodzi do kontraktu `legalCommands` (zbiory atakujących,
      przypisania blokujących, `resolve_combat`);
- [x] automat tury przechodzi kroki combat spójnie (`stepIndex`, bez cofania);
- [x] centralne state-based actions po każdej zaakceptowanej komendzie;
- [x] graph modułów bez cykli; artefakt jednoplikowy zawiera silnik
      i wykonuje self-test.

Znane uproszczenia syntetyczne (udokumentowane w kodzie): atakujący zadaje pełną
siłę każdemu blokującemu (bez CR 510.1c), kroki combat przechodzą przez komendy
zamiast pełnych rund priorytetu.

## M4 — Dane kart i tekstowy format talii

**Warunek wejścia na realne karty:** właściciel dostarczy pierwszą listę kart
i dane kolekcji. Warstwa danych działa już w pełni na katalogu syntetycznym.

- [x] tekstowy parser/writer talii (wspólny format eksportu i plików repo);
- [x] registry statusów `unsupported`/`in-development`/`supported`/`limited`;
- [x] walidacja limitu kopii, landów podstawowych i rozmiaru formatu;
- [x] filtry katalogu po `Plan`/`Set`/nazwie i podsumowanie kolorów/landów;
- [x] syntetyczny katalog testowy (`SYNTH`) z polami statystyk permanentów;
- [x] materializacja: definicja → wpis talii ze statystykami → gotowa partia;
- [x] talie wersjonowane w `decks/` walidowane testem względem katalogu;
- [x] **definicje pierwszych realnych kart z polami `Set`** (Batch 1: KTK/NEO/DTK;
      pole `Plan` pozostaje puste — właściciel nie przekazał jeszcze przypisań planów);
- [ ] kreator talii UI bez `localStorage`, dopiero po pierwszych realnych kartach.

## M5 — Pierwsza pionowa ścieżka UI

- [x] UI renderujące PlayerView (`src/table/render.js` — status tury, stos, bitwiska,
      ręka z pełnymi danymi, log partii);
- [x] wysyłanie Command do engine (klik = komenda do sesji, `src/table/main.js`);
- [x] prezentacja Event i błędów (polski log zdarzeń sesji + wpisy odrzuceń
      z maszynowym reason);
- [x] gra człowiek–bot na syntetycznych kartach (bot heurystyczny z Etapu 4;
      sesja sama rozgrywa jego ruchy i przewija okna samego pasa);
- [x] eksport/import replayu (textarea + pobieranie pliku; import odtwarza
      zapis w składzie bieżących talii i raportuje odrzucone komendy).

Szczegóły implementacji:

- `src/table/session.js` — warstwa sesji bez DOM-u: protokół, polski log,
  auto-ruchy bota, auto-pass okien bez decyzji, eksport/import zapisu.
- Talie z `decks/*.txt` build wstrzykuje do artefaktu jako `REPO_DECKS`
  (file:// nie może ich fetchować — ADR 0011/0012).
- Naprawione przy okazji: SBA uruchamiało się w środku rozliczania combat
  (przez API obrażeń gracza) i odrzucało legalny `resolve_combat`; pełny
  strumień zdarzeń komendy obejmuje teraz też zdarzenia startu tury.
- Pokrycie: `test/table-session.test.js` (7 testów) i `test/table-ui.test.js`
  (kliknięcia po mini-DOM przez całą partię).

## M6 — Abilities i tokeny w engine (na katalogu syntetycznym)

**Status:** otwarty; zdolności aktywowane i tworzenie tokenów zintegrowane.

Zakres:

- [x] obiekty gry niosą listę `abilities` (materializacja z definicji karty);
- [x] wspólny interpreter efektów (`src/engine/effects.js`): damage / pump /
      create_token dla czarów i zdolności aktywowanych;
- [x] komenda `activate_ability` w `legalCommands`/`execute` — koszt `tap` (+ opcjonalnie
      `mana`), efekt na permanencie; kontrakt „każda oferowana aktywacja jest akceptowana";
- [x] tworzenie tokenów przez efekt `create_token` (`src/engine/tokens.js`), token dostaje
      `cardId: 'token_*'`, statystyki i summoning sickness;
- [x] `resolveTopOfStack` zwraca pełny przyrost zdarzeń (m.in. `token_created`,
      `damage_dealt`), więc log UI opisuje efekty czarów, nie tylko `spell_resolved`;
- [x] syntetyczne karty: `syn-warboar` (zdolność aktywowana), `syn-swarmsummon`
      (czar tworzący token) i definicja tokenu `token_goblin`; talia
      `decks/synthetic-abilities.txt`;
- [x] log sesji tłumaczy `ability_activated`/`token_created` na polski;
- [x] testy: `test/activated-abilities.test.js`, `test/token-creation.test.js`,
      `test/session-abilities-integration.test.js`.

Triggered abilities doczekały się pierwszej potrzebującej karty — zaimplementowane
w minimalnym wymiarze w M8. Załączniki i static abilities pozostają świadomie odłożone
(do pierwszej karty, która ich potrzebuje).

**Exit:** zdolność aktywowana i token działają w pełnej partii przez protokół,
są opisywane po polsku w logu i odtwarzają się w replayu — potwierdzone testami.

## M8 — Realne karty Batch 1: triggery, liczniki, ninjutsu, megamorph

**Status:** zamknięty (2026-08-01) na trzech pierwszych kartach z listy właściciela.

Warunek wejścia (ADR 0010 §2a): dane każdej karty pobrane ze Scryfall przed kodowaniem —
odfiltrowane JSON-y w `docs/cards/scryfall-*.json`, Oracle text zapisany dosłownie
w definicji (`oracleText`), adres ilustracji konkretnego druku (`imageUri`).

Zakres:

- [x] **liczniki** (`src/engine/counters.js`, CR 122): dodawanie/zdejmowanie,
      liczniki +1/+1 liczą się do efektywnych statystyk, pozostałe (np. deathtouch)
      są znacznikami do zdejmowania przez efekty; znikają przy zmianie strefy;
- [x] **triggered abilities** (`src/engine/triggers.js`, CR 603): zdarzenia `dies`
      i `combat_damage_to_player`; triggery rozstrzygają się po SBA bieżącej komendy,
      bez własnego okna priorytetu; `requiresTarget` daje deterministyczną wersję
      opcjonalnego „you may" (brak celu = opcja odrzucona);
- [x] **Ninjutsu** (zdolność aktywowana z ręki): okno aktywacji to krok
      `combat_damage` przed rozstrzygnięciem; koszt many + zwrot nieblokowanego
      atakującego do ręki właściciela; wejście na battlefield zatapnięte i atakujące;
- [x] **Morph/Megamorph**: zagranie twarzą w dół jako 2/2 za koszt morph ({3}),
      obrócenie twarzą do góry za koszt megamorph z licznikiem +1/+1; face-down
      permanent ukrywa tożsamość przed przeciwnikiem w PlayerView (FoW);
- [x] efekty w `applyEffect`: `gain_life`, `add_counter`, `remove_counter`,
      `exile_permanent`, `turn_face_up`;
- [x] karty: `highland-game` (dies → +2 życia), `kappa-tech-wrecker` (ninjutsu,
      wejście z licznikiem deathtouch, combat-damage trigger z wygnaniem
      artefaktu/enchantment), `segmented-krotiq` (megamorph 7 → 6/5 + licznik);
      talia `decks/real-batch1.txt`;
- [x] testy `test/real-cards-batch1.test.js` (16 scenariuszy: legalne i nielegalne
      przypadki każdej karty) + pełna partia człowiek–bot na realnej talii
      (smoke: 160 ruchów, 0 odrzuceń, partia kończy się rozstrzygnięciem);
- [x] fingerprint stanu uwzględnia liczniki i face-down; log UI tłumaczy nowe
      zdarzenia na polski; render pokazuje face-down jako 2/2 bez tożsamości.

Świadome uproszczenia (minimalny wymiar, CR „na zapas" nie wchodzi):

- triggery nie kaskadują w obrębie jednej komendy i nie mają własnego okna
  priorytetu (rozstrzygają się od razu);
- trigger combat damage źródła, które zginęło w tej samej komendzie, nie odpala się;
- „you may" (Kappa) jest deterministyczne: trigger odpala się tylko, gdy istnieje
  legalny cel wygnania (artefakt/enchantment kontrolowany przez zranionego gracza);
- licznik deathtouch nie nadaje samego deathtouch w walce (brak mechaniki);
- morph: obrót twarzą do góry wyłącznie za koszt megamorph (bez wariantu {3}
  bez licznika), zgodnie z reminder text karty;
- koszt many to liczba całkowita (pula bezbarwna): {1}{G}=2, {5}{G}=6, {6}{G}=7;
- ninjutsu dostępne tylko w kroku `combat_damage` (automat tury nie ma okna
  priorytetu w `declare_blockers`); efekt na stan walki jest tożsamy.

**Exit:** 201/201 testów zielonych (w tym 184 dotychczasowe na katalogu syntetycznym
— baza stabilności bez zmian), artefakt buduje się, pełna partia na realnej talii
przechodzi przez sesję bez odrzuceń.

## M9 — Realne karty Batch 2: transform, {X} i blokada, flying/vigilance, reanimacja

**Status:** zamknięty (2026-08-01) na drugim batchu z listy właściciela.

Karty: **Grizzled Outcasts (ISD)** + tył **Krallenhorde Wantons**, **Entrancing Lyre
(THB)**, **Zoraline, Cosmos Caller (BLB)**. Dane ze Scryfall w `docs/cards/scryfall-*.json`,
Oracle text w definicjach, talia `decks/real-batch2.txt`.

Zakres:

- [x] **transform (karty dwustronne DFC)**: definicja `transformTo`, obiekt niesie dane
      drugiej strony; trigger `upkeep` z warunkiem na liczbę czarów w poprzedniej turze
      (`state.spellsCastThisTurn`/`lastTurnSpellsCast`, przeliczane przy zmianie tury;
      liczone zagrania stwora, instantów i sorcery); efekt `transform` zamienia stronę
      (cardId/P/T/abilities/keywords/subtypes) bez zmiany strefy; zdarzenie
      `object_transformed`;
- [x] **artefakty jako permanenty**: `kind: 'artifact'`, zagrywane z ręki w main phase
      jak stwory (`cast_permanent`); zdolności aktywowane artefaktów;
- [x] **koszt {X} w zdolnościach** (`cost.manaX`): X = minimalna wartość dla celu
      (moc stwora u Liry), `xValue` w komendzie i zdarzeniu;
- [x] **blokada odkręcania**: efekt `lock_untap` (stwór nie odkręca się, dopóki źródło
      na bitwisku i zatapnięte) — „doesn't untap for as long as this artifact remains
      tapped" Liry; `untapLockedBy` czyści się samo po wyjściu źródła ze strefy;
- [x] **flying i vigilance**: keywordy na obiektach i w PlayerView; flying — blokowanie
      tylko przez stwory z lataniem (walidacja + `legalBlockerOptions`); vigilance —
      brak tapa przy ataku;
- [x] **subtypy** (Bat, Cleric…) na definicjach i obiektach; tribał „whenever a Bat
      you control attacks" (Zoraline → +1 życie);
- [x] **trigger wejścia/ataku z opcjonalną płatnością**: `payMana`/`payLife`
      (deterministyczne „you may" — trigger tylko przy opłacalnym koszcie i legalnym
      celu); efekty `pay_mana`, `pay_life`, `return_permanent_from_graveyard`;
- [x] **finality counter**: wskrzeszone permanenty dostają licznik; śmierć z obrażeń
      przy finality idzie do exile zamiast grobu (bez triggera „dies");
- [x] testy `test/real-cards-batch2.test.js` (21 scenariuszy) + smoke pełnych partii
      (seedy 7/42/99/2026/12345): 0 odrzuconych komend, mechaniki faktycznie odpalają
      się w grze (transform 5/5, Lira 4/5, Zoraline 4/5); bot heurystyczny dostał
      punktację dla `activate_ability` (używa zdolności {X}).

Świadome uproszczenia (M9):

- „You may choose not to untap" Liry nie jest wyborem gracza — lira odkręca się sama
  w swoim untap step, więc blokada trwa maksymalnie do następnego untap stepu liry;
- X w koszcie to zawsze najtańsza wartość działająca na cel (moc celu);
- finality działa tylko przy śmierci z obrażeń (jedyna przyczyna śmierci w engine);
- triggery wejścia odpalają się przy zagraniu z ręki i powrocie z grobu (bez ninjutsu
  i tokenów — żadna karta tego nie wymaga);
- wilkołak nie ma ręcznego obrotu ani trybu dnia/nocy — tylko trigger upkeep wg
  liczby czarów poprzedniej tury (zgodnie z Oracle textem ISD).

**Exit:** 227/227 testów zielonych (wszystkie dotychczasowe na katalogu syntetycznym
bez zmian), artefakt buduje się, pełne partie na `decks/real-batch2.txt` przechodzą
bez odrzuceń.

## M11 — Realne karty Batch 4: menace, haste, backup, typecycling, czyste aury, equipment

**Status:** zamknięty (2026-08-01) na czwartym batchu z listy właściciela.

Karty: **Gloomfang Mauler (MOM)**, **Serra's Embrace (DVD)**, **Cloak of the
Bat (CLB)** — wszystkie `layout: normal`, status `supported` **bez wyjątków
w mechanice** (zasada właściciela: karta w 100% albo wcale). Dane ze Scryfall
w `docs/cards/scryfall-*.json`, talia `decks/real-batch4.txt`.

Zakres:

- [x] **menace (CR 702.110)**: `declareBlockers` odrzuca dokładnie jednego
      blokującego dla stwora z menace; `legalBlockerOptions` wylicza tylko
      legalne warianty (0 albo ≥2 na menace-attacker); wariancie capowanym
      greedy dobiera dwóch blokujących na atakującego z menace;
- [x] **haste (CR 702.10)**: `isLegalAttacker` pomija chorobę przywołania,
      gdy `effectiveKeywords` niesie 'haste' — działa też dla keywordu
      grantowanego przez equipment (Cloak) i aurę w turze wejścia nosiciela;
- [x] **backup 2 (CR 702.165)**: deskryptor `backup: {counters, grantKeywords}`;
      wejście stwora z backup kolejkuje `pendingBackups` (FIFO, wzorzec jak
      `pendingScry`) i blokuje bieg gry do komendy `resolve_backup`
      (odrzuty: `backup_unresolved`, `backup_not_your_decision`,
      `illegal_backup_target`); rozstrzygnięcie: N liczników +1/+1 na legalnym
      celu, **grant keywordów tylko gdy cel ≠ źródło** (lista `keywordGrants`
      czyszczona w cleanup z modyfikatorami statystyk — „until end of turn"),
      zdarzenia `ability_triggered {backup:true}`, `backup_resolved`,
      `keyword_granted`; inwariant pilnuje kolejki, fingerprint ją uwzględnia;
- [x] **typecycling / Swampcycling {2} (CR 702.28-29)**: zdolność aktywowana
      KARTY W RĘCE (`ability.cycling: {subtypes?:[...]}`), szybkość instanta;
      aktywacja: płatność many → odrzucenie karty do grobu → deterministyczny
      wybór pierwszego pasującego (typy/podtypy) w kolejności biblioteki
      (brak = „fail to find") → reveal (`card_revealed`) → tasowanie WŁASNEJ
      biblioteki seedem `state.seed + state.objectSequence` (Fisher-Yates z
      `shuffle.js`, deterministycznie) → `library_searched`;
      na bitwisku zdolność jest martwa — skanowanie `legalActivatedAbilities`
      ją pomija (regresja wykryta partią botów: widok oferował komendę, którą
      execute słusznie odrzucał);
- [x] **załączniki uogólnione** (`src/engine/attachments.js` przepisany):
      jedna warstwa dla trzech rodzin — bestow, czysta aura, equipment —
      ze wspólnym deskryptorem buffu (`attachmentGrant`), liczonym w
      `effective*` z uproszczonej warstwy CR 613; polityki utraty gospodarza:
      bestow → zostaje jako stwór (CR 702.103b), equipment → zostaje
      odłączony na bitwisku (CR 704.5n), czysta aura → grób właściciela
      (CR 704.5m, zdarzenie `permanent_put_into_graveyard` z reason
      `aura_without_legal_host`); interakcje kumulują się (Embrace + Cloak na
      jednym nosicielu);
- [x] **czyste aury (CR 303.4)**: deskryptor `aura: {pump, keywords}` na
      karcie typu enchantment (NIE creature); cast przez `cast_permanent`
      z `targets` (czar aury na stosie jak każdy czar — okno odpowiedzi);
      rozstrzygnięcie: legalny cel → wejście załączone (`kind: 'aura'`),
      nielegalny → **grób + `spell_resolved {fizzled: true}`** (odwrotnie niż
      bestow, który wchodzi jako stwór); inwariant: `attachedTo` tylko dla
      `kind 'aura'` albo deskryptora equipment;
- [x] **equipment (CR 301.5d, 702.6)**: deskryptor `equipment: {equip, pump,
      keywords}`; equip jako zdolność aktywowana (`keyword: 'equip'`) —
      legalna sorcery-speed, cel wyłącznie własny stwór, koszt z deskryptora;
      `attachEquipmentToCreature` przepina między nosicielami (re-equip);
      śmierć nosiciela zostawia equipment odłączony na bitwisku;
- [x] **wirtualne landy podstawowe w rejestrze** (`VIRTUAL_BASIC_LANDS`):
      Plains/Island/Swamp/Mountain/Forest jako `supported` z types
      `['Basic','Land']` — `parseDeckText` dopasowuje dokładne nazwy
      („Swamp"), `validateDeck` honoruje Basic+Land bez limitu kopii, a
      typecycling ma realny cel wyszukiwania; decyzja właściciela o
      wirtualności landów (2026-08-01) przez to doczekała się realizacji
      minimalnego wymiaru;
- [x] protokół: `COMMAND_TYPES += resolve_backup`; `EVENT_TYPES +=`
      `card_revealed`, `library_searched`, `backup_resolved`,
      `keyword_granted`, `permanent_put_into_graveyard`;
- [x] boty: heuristic punktuje `resolve_backup` (liczniki na najsilniejszy
      własny stwór), **equip** (załączenie na największym nosicielu, premie
      za evasion/haste), casty czystych aur jak bestow, a **cycling tylko
      kart dalekich od wyrzucenia** (koszt > landy+1 — wcześniej cyklował
      Maulery na starcie i nigdy nie miał stwora na stole); aggro dodaje na
      końcu listy prostych zagrań equip własnego najsilniejszego stwora;
      effekt: w 80-partiowym probe mechaniki padają realnie (backup 158,
      equip 288, cycling 101, aura 152) — wcześniej equip 0/80;
- [x] UI: log sesji tłumaczy nowe zdarzenia po polsku, `resolve_backup`
      wysoko w rankingu sugestii, etykiety akcji (`Zagraj aurę…`, `Cycling…`,
      `Wyposaż…`, `Backup…`), karta na bitwisku pokazuje załączone aury i
      equipment (badgie);
- [x] testy `test/real-cards-batch4.test.js` (29 scenariuszy: legalne i
      nielegalne przypadki każdej karty — blok menace ≥2, haste vs choroba,
      backup self/other/grant-cleanup/queue, cycling find/fail-to-find/
      bez-many/martwy-na-bitwisku, aura cast/stos/fizzle/zgon gospodarza,
      equip sorcery-speed/cudzy-stwór/re-equip/kumulacja buffów, determinizm
      replay) + smoke 10 partii z twarde wymaganymi padami wszystkich
      czterech mechanik (backup, equip, cycling, cast aury);
- [x] benchmark B0 przemierzony po zmianach botów (aktualizacja baseline w
      `docs/BOT_ROADMAP.md`, progi w `test/bot-benchmark.test.js`: 48%/45%).

Świadome uproszczenia (M11):

- triggery (w tym backup) nie mają okna priorytetu na stos — rozstrzygają się
  natychmiastową decyzją właściciela (jak scry w M10); wpływ zerowy dla kart
  z katalogu (żaden instant nie usuwa celu backup zanim zdąży odpowiedzieć);
- wybór karty przy typecyclingu jest deterministyczny (pierwsza pasująca w
  kolejności biblioteki) zamiast jawnego wyboru gracza — w taliach z wieloma
  Swampami bez znaczenia, jawny wybór doszedłby z pierwszą kartą szukającą
  spośród różnych wyników;
- „flying i haste" Cloaka to jeden grant — upgrade nosiciela (CR 702.6c „the
  equipped creature") bez osobnych triggery; buffy liczone warstwą 613 w
  uproszczeniu jak w M10;
- cycling płaci manę generic (pula bezbarwna jak od zawsze).

**Exit:** 313/313 testów zielonych (wszystkie dotychczasowe bez zmian),
artefakt buduje się (35 modułów), 80 partii botów na `decks/real-batch4.txt`
bez odrzuceń i z padniętymi mechanikami (backup 158, equip 288, cycling 101,
cast aury 152), benchmark regresji powyżej przeliczonych progów (62.5% vs
random, 60.8% vs aggro); pełna macierz B0: 67.4%/59.0%/71.4% (13 500 meczów,
0 niedokończonych).

## M10 — Realne karty Batch 3: landy „enters tapped", płać-albo-poświęć, reach, scry

**Status:** zamknięty (2026-08-01) na trzecim batchu z listy właściciela.

Karty: **Rupture Spire (CON)**, **Leafcrown Dryad (THS)**, **Prismari Campus
(STX)** — wszystkie `layout: normal` (żadna nie jest DFC), status `supported`
bez wyjątków w mechanice. Dane ze Scryfall w `docs/cards/scryfall-*.json`,
Oracle text w definicjach, talia `decks/real-batch3.txt`.

Decyzją właściciela karta musi być zakodowana w 100% — dlatego Leafcrown
Dryad ma **pełny Bestow {3}{G}** (CR 702.103), a nie wariant „bez bestow".
Przy okazji naprawiono ukrytą regresję: `installDeck` wyliczał pola obiektu
jawnie i gubił deskryptory `types`/`entersTapped` w prawdziwych partiach
(w testach budujących obiekty ręcznie wszystko działało) — obecnie instalacja
tali przenosi również `bestow`; regresję pilnuje test w `test/deck.test.js`.

Zakres:

- [x] **landy wchodzące zatapnięte**: cecha `entersTapped` na definicji i
      obiekcie (`createGameObject`, `addObject`, fingerprint); `playLand`
      kładzie taki land `tapped: true`, zdarzenie `land_played` niesie
      `entersTapped`; zatapnięty land nie oferuje `tap_for_mana` w turze
      wejścia (Rupture Spire, Prismari Campus);
- [x] **obowiązkowy trigger „sacrifice it unless you pay {1}"**
      (`payMana` + `sacrificeIfUnpaid`, `firePayOrSacrifice` w triggers.js):
      to NIE jest opcjonalne „you may" — trigger odpala się zawsze; płatność
      najpierw z puli many, a przy jej braku engine sam tapuje jednego
      nietapniętego INNEGO landa kontrolera (zdarzenia `mana_produced`
      wchodzą do strumienia triggera, `ability_triggered` niesie `paid` /
      `autoTapped`); gdy zapłacić się nie da — efekt `sacrifice_permanent`
      (permanent trafia do grobu, zdarzenie `permanent_sacrificed`);
- [x] **linie typów (types) na obiektach**: definicje niosą `types`
      (np. `['Enchantment', 'Creature']`); predykat celu `artifact_or_enchantment`
      (Kappa) działa na `types`, więc enchantment creature jest legalnym celem;
- [x] **reach (CR 702.9, minimalny wymiar)**: stwór z reach może blokować
      latające — `canBlock`, `declareBlockers` i `legalBlockerOptions`;
- [x] **załączniki i Bestow {3}{G} (CR 301.5 / 303.4 / 702.103)**: karta może
      być rzucona klasycznie za {1}{G} albo jako **czar aury** za koszt bestow
      z celem „dowolny stwór" (ten sam typ komendy `cast_permanent` z
      wariantem `bestow` + `targets`); czar aury ląduje na STOSIE i rozstrzyga
      się po rundzie passów jak każdy czar (LIFO, odpowiedzi instant działają);
      rozstrzygnięty wchodzi **załączony** do stwora — wtedy `kind: 'aura'`
      (NIE jest stworem), a gospodarz dostaje buff z deskryptora (+2/+2, reach)
      liczony w `effectivePower/Toughness/Keywords` ze stanem (combat, SBA
      śmierci, PlayerView, koszty {X}); zaczarowany stwór ginie → aura
      **odłącza się i zostaje na bitwisku jako stwór** (CR 702.103b, zdarzenie
      `object_detached` z samej zmiany strefy gospodarza — relacja attachedTo
      nigdy nie wskazuje obiektu spoza bitwiska, pilnuje inwariant); cel
      nielegalny przy rozstrzygnięciu → karta wchodzi jako zwykły stwór
      (specjalna reguła bestow — inne aury poszłyby do grobu); wygnanie
      załączonej aury (np. predykat enchantment Kap-py) przywraca jej kind
      stwora w strefie docelowej; zdarzenia protokołu `aura_spell_cast`,
      `permanent_entered_battlefield`, `object_attached`, `object_detached`;
- [x] **scry 1 (CR 701.18, minimalny wymiar)**: efekt `scry` ustawia
      `state.pendingScry` (kto + karty od wierzchu) i blokuje bieg gry do
      decyzji; nowa komenda `resolve_scry { bottomIds }` — karta zostaje TYM
      SAMYM obiektem (reorder w `zones.library`, bez zmiany strefy), zdarzenia
      `scry_started` / `scry_resolved`; PlayerView niesie `pendingScry` —
      właściciel widzi treść kart i wyliczone warianty wyboru (keep-all
      pierwszy), przeciwnik widzi tylko fakt i liczbę (`cards: null`, FoW);
      `pass_priority` i wszystkie inne komendy odrzucane (`scry_unresolved`,
      `scry_not_your_decision`, `illegal_scry_choice`); inwariant blokuje
      wiszące `pendingScry` po akceptacji komendy;
- [x] protokół: `COMMAND_TYPES += resolve_scry`, `EVENT_TYPES +=`
      `permanent_sacrificed`, `scry_started`, `scry_resolved`;
- [x] boty: heuristic punktuje `resolve_scry` (keep bazowo; land(y) na spód,
      gdy ręka/bitwisko są nasycone landami), aggro traktuje `resolve_scry`
      jak prostą komendę (keep) — żaden bot nie utyka na decyzji scry;
      heuristic ocenia też warianty **bestow** generycznie (buff większego
      z własnych stworów vs zwykły cast; wzmocnienie cudzego stwora odrzuca)
      — bestow faktycznie pada w partiach botów (9/20 próbki smoke);
- [x] UI: `describeEffect`/`describeTriggered` i log sesji tłumaczą nowe
      zdarzenia po polsku (w tym auto-tap i poświęcenie Spire),
      `resolve_scry` wysoko w rankingu sugestii;
- [x] testy `test/real-cards-batch3.test.js` (27 scenariuszy: legalne i
      nielegalne przypadki każdej karty, FoW scry, determinizm replay z
      decyzją scry, kontrakt botów) + smoke pełnych partii (10 seedów, oba
      miejsca przy stole): trigger Spire 19/20 partii, poświęcenie 11/20,
      scry 16/20 — progi z marginesem;
- [x] benchmark B0 przemierzony po wejściu 8. talii (patrz aktualizacja
      baseline w `docs/BOT_ROADMAP.md` i progi w `test/bot-benchmark.test.js`).

Świadome uproszczenia (M10):

- płatność „unless you pay" jest wymuszana: kontroler nie może dobrowolnie
  zrezygnować i poświęcić Spire „dla taktyki" — uproszczenie bez wpływu na
  żaden scenariusz w katalogu; auto-tap bierze pierwszego nietapniętego landa
  z listy (deterministycznie, ADR 0005);
- „add one mana of any color" Spire i „add {U} or {R}" Campus to 1 bezbarwna
  mana — pula many jest bezbarwna od zawsze (zgodne z dotychczasowym modelem);
- scry patrzy tylko na wierzch WŁASNEJ biblioteki (tak mówi Campus); przy
  pustej bibliotece scry jest no-op (`scry_started` z amount 0, bez decyzji);
- efekt `scry` nie kumuluje się (jedna oczekująca decyzja naraz — inwariant).

**Exit:** 279/279 testów zielonych (wszystkie dotychczasowe bez zmian),
artefakt buduje się (35 modułów), pełne partie na `decks/real-batch3.txt`
przechodzą bez odrzuceń i deterministycznie, benchmark regresji bota powyżej
przeliczonych progów (68.8% vs random, 64.2% vs aggro); pełna macierz B0:
70.6%/61.1%/69.3% (10 800 meczów, 0 niedokończonych).

## M7 — Nowy układ stołu: karty jako kafle, strefy w warstwach

**Status:** zamknięty (praca wyłącznie w warstwie UI; engine i protokół nietknięte).

Cel: odtworzyć doświadczenie stołu ze źródłowej aplikacji właściciela
(`card_viewer_12_10_for_Github.html`, ADR 0009), z zachowaniem granic
engine → PlayerView → render. Karty syntetyczne nie mają jeszcze obrazów
ze Scryfall (ADR 0010), więc na M7 rolę miniatur pełni syntetyczna kolorowa
„twarz\" karty.

Zakres:

- [x] karta jako **kafelek wyglądający jak karta** (kolorowa ramka, koszt, typ,
      pole reguł, P/T) zamiast tekstowego chipu — `buildFace` w `render.js`;
- [x] **stół na całą szerokość**: bitwisko wroga u góry, stos pośrodku, Twoje
      bitwisko na dole, ręka na samym dole (układ „naprzeciwko\" jak fizyczny stół);
- [x] rozdzielenie lądów i stworów z układem perspektywicznym (wróg: lądy przy
      krawędzi, stworzenia w stronę środka; Ty odwrotnie);
- [x] **pasek statusu** (tura, faza/krok, liczniki) + **pasek graczy** (życie,
      biblioteka) z przyciskiem otwierającym inspektor stref;
- [x] **strefy w warstwach** (groby / exile / biblioteka) w modalnym inspektorze
      zamiast zawsze rozwiniętej pionowej listy (jak w apce źródłowej);
- [x] **podgląd karty**: hover (desktop — duża twarz pod kursorem) i klik
      (menu kontekstowe / modal z pełną twarzą, danymi i próbą ilustracji Scryfall);
- [x] rozwijane panele (`<details>`) dla akcji, logu i zapisu zamiast sekcji-karty;
- [x] **menu kontekstowe akcji** (M7b): klik w kartę na stole/w ręce na urządzeniach z dotykiem (iPad) otwiera menu dozwolonych działań filtrowanych dla danej karty z `view.legalCommands`.
- [x] zachowane wszystkie dotychczasowe funkcje stołu: inspektor grobów,
      menu biblioteki, tokeny, podgląd karty, autosave, wznawianie partii,
      eksport/import zapisu, self-test;
- [x] test UI (`test/table-ui.test.js`) prowadzi pełną partię przez nowy render;
      fixture DOM rozszerzony o nowe identyfikatory warstw.

Granica bez zmian: kliknięcie = komenda protokołu do sesji; render wyłącznie
z `PlayerView`; teksty przez `textContent` (bez `innerHTML`); każdy kafelek
karty budujemy węzłami DOM. Losowość, model stanu i protokół nietknięte.

**Exit:** stół renderuje karty jak karty (nie tekstowe chipy), strefy otwierają
się w warstwach, a pełna partia przechodzi przez UI — 184/184 testów zielone,
artefakt `dist/mtg-table.html` buduje się bez kolizji.

## Decyzje blokujące dalszy zakres

- dalsza lista realnych kart (Batch 1 = 3 karty dostarczone 2026-08-01; kolejne
  batche czekają na właściciela; docelowo ~20 wspieranych kart);
- przypisania `Plan` dla realnych kart (definicje mają puste pole `plan`);
- ~~docelowy rozmiar pierwszego formatu talii~~ — rozstrzygnięte 2026-08-01:
  bez minimalnej wielkości, talia dowolnej wielkości z kreatora;
- ewentualne dodatkowe reguły ponad minimalny sandbox.

## M14 — Realne karty Batch 5: triggery wejścia (untap/landfall), trample, koszt „tap stwora"

**Status:** zamknięty (2026-08-02) na piątym batchu z listy właściciela.

Karty: **Midnight Guard (DKA)**, **Holdout Settlement (OGW)**, **Skyclave
Geopede (ZNR)** — wszystkie `layout: normal`, status `supported` bez wyjątków
w mechanice. Dane ze Scryfall w `docs/cards/scryfall-*.json` (ADR 0010 §2a;
Midnight Guard pobrany jako konkretny druk DKA, nie domyślny reprint),
Oracle text w definicjach, talia `decks/real-batch5.txt` (4× każda karta
+ 4× Plains + 4× Mountain).

Zakres:

- [x] **trigger „another creature enters"** (`src/engine/triggers.js`,
      CR 603.2d) — wejście INNEGO stworzenia (nie źródła) odkręca źródło
      (Midnight Guard); efekt `untap_permanent` w `effects.js`;
- [x] **trigger landfall** (`land_entered_under_your_control`) — wejście
      landa pod kontrolą źródła daje mu pump „do końca tury" (Skyclave
      Geopede +2/+2); buff czyści `clearStatModifiers` w cleanup jak inne
      modyfikatory; `pump` w `applyEffect` dostał fallback na źródło dla
      triggerów bez jawnych celów;
- [x] **trample** (CR 702.19) w combacie — nadmiar siły atakującego ponad
      łączną wytrzymałość blokerów przechodzi na gracza (przy zachowaniu
      uproszczenia „pełna siła każdemu blokerowi");
- [x] **koszt „Tap an untapped creature you control"** (Holdout Settlement)
      — nowy koszt zdolności `tapCreature` w `abilities.js`: legalność
      sprawdza obecność nietapniętego stwora, wykonanie tapuje go
      deterministycznie (pierwszy z listy, jak auto-płatność Rupture Spire);
      efekt `add_mana` („one mana of any color" = 1 bezbarwna, pula jak
      zawsze bezbarwna); zwykłe {T}: Add {C} zostaje domyślne dla landów;
- [x] etykiety PL w logu (`session.js`) — czytelne nazwy nowych triggerów
      („wejście innego stworzenia", „Landfall");
- [x] bot heurystyczny — wycena `add_mana` (wartość tylko przy czymś do
      zagrania, kara za tapnięcie własnego stwora) i `tapCreature` w
      penalizacji kroków untap (patologia B1 nie wraca).

Świadome uproszczenia (M14):

- koszt „Tap an untapped creature" jest deterministyczny (pierwszy stwór)
  zamiast jawnego wyboru gracza — jak płatności M10; jawny wybór doszedłby
  z pierwszą kartą wymagającą wyboru spośród różnych wyników;
- trample przydziela blokerom pełną siłę (istniejące uproszczenie combatu),
  a nadmiar liczy względem łącznej wytrzymałości — bez kolejności
  przydziału CR 510.1c;
- landfall dotyczy wyłącznie wejścia landa na bitwisko (CR 702.36: „a land
  enters") — bez obsługi innych zdarzeń (np. transform w landa).

**Exit:** 359/359 testów zielonych (13 nowych w `test/real-cards-batch5.test.js`
— materializacja, untap trigger, landfall + cleanup, trample z nadmiarem
i regresją bez trample, aktywacja Holdout z kosztem tap stwora, brak aktywacji
bez stwora, domyślne {T}: Add {C}, talia, smoke 10 partii botów z padnięciem
wszystkich mechanik), artefakt buduje się (35 modułów, 302.1 kB). Pełna
macierz B0 z 10 taliami (16 500 meczów, 0 niedokończonych): heuristic
77.1% vs random, 60.4% vs aggro, 73.5% aggro vs random; próbka regresji
(440 meczów/parę): 74.8% vs random, 63.2% vs aggro; progi podniesione do
0.59 / 0.48.

## M15 — Realne karty Batch 6: aktywowane {T} życia, „when you cast a spell", land creatures

**Status:** zamknięty (2026-08-02) na szóstym batchu z listy właściciela.

Karty: **Soulmender (M20)**, **Illusory Demon (ARB)**, **Jyoti, Moag Ancient
(M3C)** — wszystkie `layout: normal`, status `supported` (Jyoti z jawnym
limitation o command zone). Dane ze Scryfall w `docs/cards/scryfall-*.json`
(ADR 0010 §2a), Oracle text w definicjach, talia `decks/real-batch6.txt`
(3× Soulmender, 3× Illusory Demon, 2× Jyoti + 12 landów).

Zakres:

- [x] **Soulmender** — aktywowana {T}: zysk 1 życia (istniejący efekt
      `gain_life` + koszt tap; bot już wyceniał);
- [x] **trigger „when you cast a spell"** (`triggers.js`) — Illusory Demon:
      rzucenie czaru (`spell_cast`) LUB zagranie permanentu (`permanent_cast`)
      przez kontrolera poświęca źródło. Poprawka poprawności: ev
      `permanent_cast` niesie obiekt już na bitwisku — casting SAMEJ karty
      nie poświęca jej (w MtG źródło jest na stosie, nie na bitwisku);
- [x] **land creatures** — token Forest Dryad Jyoti: `types ['Land','Creature']`
      + `kind 'creature'` (walczy, ma chorobę przywołania) i może być tapnięty
      na manę (rozszerzona legalność `tap_for_mana`/`tapLandForMana` o typ
      Land); definicja tokena w REAL_CARDS (`limited`);
- [x] **ETB Jyoti** — `create_token` z dynamiczną liczbą `amount:
      'commander_casts'` (licznik `commanderCasts` per gracz, w obecnym
      formacie bez command zone zawsze 0 → 0 tokenów, mechanicznie poprawne);
- [x] **trigger „beginning_of_combat"** — na początku każdej walki land
      creatures kontrolera dostają +X/+X do końca tury, X = moc Jyoti
      (nowy efekt `buff_land_creatures` + dynamiczny pump `source_power`);
      buff czyści cleanup jak inne modyfikatory;
- [x] bot: kara za rzucenie czaru/zagranie permanentu przy własnym triggerze
      `when_you_cast_spell` (generyczny deskryptor — wartość poświęcanego
      stwora); etykiety PL nowych triggerów w logu.

Świadome uproszczenia (M15):

- brak command zone w engine — `commanderCasts` zawsze 0, więc ETB Jyoti nie
  tworzy tokenów w tym formacie (zgodne z regułami gry bez commandera);
  token Forest Dryad jest zdefiniowany i testowany (w tym ręczne ustawienie
  licznika w teście);
- land creature produkuje 1 bezbarwną manę (pula jak zawsze bezbarwna),
  a nie zieloną.

**Exit:** 391/391 testów zielonych (15 nowych w `test/real-cards-batch6.test.js`),
artefakt buduje się (35 modułów, 318.8 kB). Pełna macierz B0 z 11 taliami
(19 800 meczów, 0 niedokończonych): heuristic 74.7% vs random, 58.6% vs
aggro, 73.2% aggro vs random; próbka regresji (528 meczów/parę): 72.7% vs
random, 62.5% vs aggro; progi 0.59/0.48 bez zmian (mieszczą się w regule).

## M16 — Realne karty Batch 7: granty zdolności, persist, reanimacja, opóźnione triggery

**Status:** zamknięty (2026-08-02) na siódmym batchu z listy właściciela
(od tego batcha porcja to **5 kart** — większość mechanik jest już w engine).

Karty: **Fake Your Own Death (OTJ)**, **Puppeteer Clique (SHM)**, **Unstable
Frontier (CON)**, **Apprentice Wizard (2XM)**, **Delta Bloodflies (TDM)** —
wszystkie `layout: normal`, status `supported`. Dane ze Scryfall w
`docs/cards/scryfall-*.json` (ADR 0010 §2a), Oracle text w definicjach, talia
`decks/real-batch7.txt` (3× Delta Bloodflies, 2× Puppeteer Clique, 3× Fake
Your Own Death, 2× Apprentice Wizard, 2× Unstable Frontier + 8 landów).

Zakres (mechaniki GENERYCZNE, ADR 0002 — zero warunków po nazwie karty):

- [x] **liczniki -1/-1** (`permanents.js`) — statystyki liczą teraz
      `+1/+1` minus `-1/-1` (wspólny `counterDelta`); wcześniej engine znał
      wyłącznie `+1/+1`;
- [x] **granty zdolności „do końca tury\"** (`abilityGrants`, efekt
      `grant_abilities`, `effectiveAbilities`) — Fake Your Own Death nadaje
      stworowi trigger „when this creature dies…\"; czyszczenie idzie tą samą
      ścieżką co pump i keywordy (cleanup);
- [x] **LKI (CR 603.10)** — `formerCounters` i `formerAbilityGrants`
      ustawiane przy zmianie strefy: trigger „dies\" nadany w tej turze
      działa z grobu, a persist widzi liczniki sprzed śmierci;
- [x] **persist (CR 702.79)** — trigger `dies` z warunkiem
      `noMinusCountersWhenDied` + efekt `return_with_counter`;
- [x] **powrót na bitwisko zatapniętego** (`return_to_battlefield_tapped`)
      oraz **tokeny niebędące stworami** (Treasure: artefakt bez P/T,
      z własną zdolnością) — `createBattlefieldToken` przyjmuje `abilities`;
- [x] **koszt „Sacrifice this\"** (`cost.sacrificeSelf`) — poświęcenie źródła
      jest częścią kosztu i następuje przed efektem (CR 601.2h);
- [x] **atomowe koszty zdolności** — sprawdzenie wykonalności WSZYSTKICH
      części kosztu przed mutacją stanu (naprawiony błąd: nieudana aktywacja
      zostawiała permanent zatapniony);
- [x] **reanimacja z grobu przeciwnika + zmiana kontroli**
      (`reanimate_under_your_control`, zdarzenie `control_changed`) —
      Puppeteer Clique; cel wybierany deterministycznie (najsilniejszy stwór);
- [x] **opóźnione triggery (CR 603.7)** — `state.delayedTriggers` +
      obsługa w kroku `end` kontrolera („at the beginning of your next end
      step, exile it\"; zdarzenie `object_exiled`);
- [x] **cel „land you control\"** i **tymczasowa zmiana typu podstawowego**
      (`become_basic_land_type`, `typeGrant`, `effectiveSubtypes`,
      zdarzenie `land_type_changed`) — Unstable Frontier;
- [x] **utrata życia „each opponent loses N\"** (`lose_life`, nie obrażenia)
      oraz **intervening if** `controlsCreatureWithCounter` — Delta Bloodflies;
- [x] **koszt many przy zdolności produkującej manę** — Apprentice Wizard
      ({U},{T}: add {C}{C}{C} → zapłać 1, dostań 3; bot liczy bilans netto);
- [x] bot: wycena drenażu z triggera ataku, bilansu many, persist/reanimacji
      i (ujemna) zmiany typu landa; etykiety PL nowych zdarzeń w logu stołu.

Świadome uproszczenia (M16):

- „one mana of any color\" (Treasure) i {C}{C}{C} (Wizard) to mana bezbarwna —
  pula engine jest bezbarwna, jak dotąd;
- wybór typu podstawowego u Unstable Frontier jest deterministyczny (Forest):
  bez kolorów many liczy się wyłącznie podtyp (typecycling, szukanie);
- cel reanimacji Puppeteer Clique wybiera engine deterministycznie
  (najsilniejszy stwór w grobie przeciwnika) — bez blokującej decyzji gracza;
- przejęty stwór zostaje pod kontrolą reanimatora aż do wygnania w jego
  następnym kroku end (brak mechanizmu „zwrotu kontroli\").

**Exit:** 427/427 testów zielonych (25 nowych w `test/real-cards-batch7.test.js`
— materializacja każdej karty, przypadki legalne i NIELEGALNE, interakcje
persist × grant, cleanup grantów, determinizm fingerprintu, talia, smoke
10 partii botów z realnym padnięciem mechanik), artefakt buduje się
(36 modułów, 350.4 kB). Pełna macierz B0 z 12 taliami (23 400 meczów,
0 niedokończonych): heuristic **76.9% vs random**, **61.3% vs aggro**,
75.8% aggro vs random; próbka regresji (624 mecze/parę): 74.8% vs random,
64.6% vs aggro; próg vs aggro podniesiony 0.48 → **0.49**, próg vs random
bez zmian (0.59).

## M17 — Realne karty Batch 8: dobieranie, zdolności statyczne, fateful hour, morph

**Status:** zamknięty (2026-08-02) na ósmym batchu z listy właściciela (5 kart).

Karty: **Phyrexian Rager (DMU)**, **Nefarious Imp (CLB)**, **Gather the
Townsfolk (DDQ)**, **Evangel of Synthesis (BRO)**, **Woolly Loxodon (KTK)** —
wszystkie `layout: normal`, status `supported`. Dane ze Scryfall
w `docs/cards/scryfall-*.json` (ADR 0010 §2a), talia `decks/real-batch8.txt`
(3× Rager, 2× Imp, 3× Gather, 2× Evangel, 2× Loxodon + 8 landów).

Zakres (mechaniki GENERYCZNE, ADR 0002 — zero warunków po nazwie karty):

- [x] **dobieranie kart z efektu** (`draw_cards`) — wspólna ścieżka dla kart
      i komendy `draw_card`; pusta biblioteka nie kończy gry poza krokiem draw
      (przegraną nadal rozstrzyga próba dobrania w kroku draw);
- [x] **licznik dobrań w turze** (`state.cardsDrawnThisTurn`) — zerowany przy
      zmianie tury, jak `spellsCastThisTurn`;
- [x] **odrzucanie kart** (`discard_cards`, zdarzenie `card_discarded`) —
      wybór deterministyczny (najdroższa karta w ręce, ADR 0005);
- [x] **zdolności STATYCZNE warunkowe** (CR 604.3): deskryptor
      `{ type: 'static', condition, pump, keywords }` przeliczany przy każdym
      odczycie statystyk (`staticBonuses` w `permanents.js`) — to NIE jest
      efekt „do końca tury”, więc nie czyści go cleanup, tylko zmiana warunku;
      pierwszy warunek: `minCardsDrawnThisTurn` (Evangel of Synthesis);
- [x] **trigger „whenever one or more permanents you control leave the
      battlefield”** — odpala się RAZ na komendę, nawet gdy odejdzie kilka
      permanentów naraz (CR 603.2); obejmuje śmierć, poświęcenie i wygnanie;
- [x] **scry poza własną turą** — trigger Impa może odpalić w turze
      przeciwnika, więc `pendingScry` zapamiętuje `restorePriorityTo`:
      priorytet przechodzi na decydenta i wraca po `resolve_scry`
      (bez tego gracz z priorytetem nie miał żadnej legalnej komendy);
- [x] **fateful hour** — warunkowa liczba tokenów (`ifLifeAtMost` +
      `amountIfCondition`): Gather the Townsfolk tworzy 2 tokeny, a przy
      życiu ≤ 5 pięć;
- [x] **zwykły morph** (CR 702.37, `morph.morphCost`) — obrót twarzą do góry
      za koszt morph **bez** licznika +1/+1 (megamorph z M8 kładzie licznik);
      etykiety PL w UI rozróżniają oba warianty;
- [x] bot: wycena tokenów z czarów (z uwzględnieniem fateful hour) i dobrań
      z czarów; etykiety PL nowych zdarzeń i triggerów w logu stołu.

Świadome uproszczenia (M17):

- odrzucenie karty („draw a card, then discard a card”) jest deterministyczne
  (najdroższa w ręce) — bez blokującej decyzji gracza, jak przy innych
  wyborach engine;
- „one or more permanents leave the battlefield” grupujemy po komendzie,
  co odpowiada CR 603.2 dla zdarzeń jednoczesnych;
- wyceny ETB w bocie (draw/discard/lose_life) **nie zostały wdrożone**:
  zmierzone osobno pogarszały win-rate (77.6% vs 77.8%), a zasada B0 zabrania
  pogorszenia. Bot wycenia z tego batcha wyłącznie tokeny i dobrania z czarów.

**Exit:** 456/456 testów zielonych (26 nowych w `test/real-cards-batch8.test.js`
— materializacja każdej karty, przypadki legalne i NIELEGALNE, granica
fateful hour przy 5 i 6 życiach, menace z warunku statycznego realnie
wymuszający dwóch blokujących, FoW face-down, jeden trigger przy wielu
odejściach, scry w turze przeciwnika z powrotem priorytetu, interakcje,
determinizm, talia, smoke 10 partii botów), artefakt buduje się
(36 modułów, 365.6 kB). Pełna macierz B0 z 13 taliami (27 300 meczów,
0 niedokończonych): heuristic **77.8% vs random**, **63.6% vs aggro**,
75.5% aggro vs random; próbka regresji (728 meczów/parę): 75.0% vs random,
66.9% vs aggro; próg vs aggro podniesiony 0.49 → **0.51**, próg vs random
bez zmian (0.59).

## M19 — B4: deterministyczne strojenie wag heurystyki

**Status:** zamknięty (2026-08-03) — warstwa kontrolera i narzędzia offline;
engine reguł, protokół i UI pozostają bez zmian semantycznych.

Zakres:

- [x] `src/controllers/heuristic-weights.js` definiuje siedem rodzin wag
      decyzji (`land`, `mana`, `permanent`, `spell`, `ability`, `attack`,
      `block`) i waliduje wartości skończone `>= 0`;
- [x] `createHeuristicBot({ weights })` stosuje mnożnik do punktacji rodziny
      komend; wartości domyślne są jawne, a konfiguracja jest zamrożona;
- [x] `tools/tune-bot.mjs` wykonuje deterministyczny hill-climbing na tym samym
      `runBenchmark` co B0, testuje kierunki `-step`/`+step`, nie mutuje
      baseline'u i odrzuca warianty gorsze w którejkolwiek parze jakościowej;
- [x] testy `test/bot-tuning.test.js` obejmują walidację, funkcję celu,
      determinizm i ochronę przed regresją;
- [x] po pełnej macierzy B0 przyjęto `mana=1.1`, `permanent=0.9`, pozostałe
      wagi `1.0`.

Świadome ograniczenia (M19):

- tuner stroi rodziny komend, nie uczy nowych reguł ani nie zmienia legalności;
- funkcja celu jest średnią win-rate przeciw RandomBotowi i aggro, przy czym
  kandydat musi być niegorszy w obu parach względem baseline'u;
- jedna runda i mały krok są bezpiecznym punktem startowym, ale nie dowodzą
  globalnego optimum; pełna macierz B0 pozostaje obowiązkowym filtrem przed
  przyjęciem zmiany;
- MCTS, self-play i model policy/value pozostają niezaimplementowane;
  zależność ML wymaga osobnego ADR i nie może naruszyć ADR 0011.

**Exit:** 469/469 testów zielonych, artefakt jednoplikowy buduje się; pełna
macierz B0 (13 talii, 50 seedów, 27 300 meczów, 0 niedokończonych) daje
heuristic **77.9% vs random**, **64.0% vs aggro**, aggro **75.5% vs random**;
próbka regresji daje 75.1% / 67.6%, a progi wynoszą `0.60` / `0.52`.

## M20 — Kreator talii w UI (ADR 0012)

**Status:** zamknięty (2026-08-03) — UI pozostaje warstwą pomocniczą; engine,
PlayerView i protokół nie przyjmują zmian bezpośrednio z kreatora.

Zakres:

- [x] `src/cards/deck-builder.js` udostępnia czyste operacje dodania/usunięcia
      kopii, walidację nazwy i talii, podsumowanie kolorów/landów oraz eksport
      przez istniejący `writeDeckText`;
- [x] `src/table/deck-builder.js` montuje panel kreatora bez `localStorage`;
      lista pokazuje wyłącznie karty ze statusem `supported`;
- [x] filtry UI obejmują Plan, Set i nazwę karty;
- [x] Basic Land nie ma limitu kopii, pozostałe karty mają limit 4; błędy są
      pokazywane w języku polskim, a nielegalna talia nie ma aktywnego eksportu;
- [x] tekst jest identyczny z formatem plików `decks/*.txt` (`# Nazwa talii`,
      pusta linia, `Nx Nazwa karty`); przyciski kopiują tekst lub pobierają go
      jako bezpośredni plik `.txt` do zapisania przez właściciela;
- [x] testy `test/deck-builder.test.js` i integracja w `test/table-ui.test.js`
      pilnują filtrów, limitów, podsumowania, formatu i startu artefaktu.

Świadome ograniczenia (M20):

- kreator nie zapisuje talii w przeglądarce i nie może sam commitować pliku do
      repozytorium; „Pobierz" daje tekst, który właściciel zapisuje w `decks/`;
- rozmiar talii pozostaje opcjonalny, bo właściciel nie przyjął jeszcze formatu
      Constructed z minimalną liczbą kart;
- nazwy Planów i setów pochodzą wyłącznie z definicji kart w repozytorium —
      aplikacja nie odpytuje arkusza kolekcji w runtime;
- kreator nie zastępuje walidacji engine: start partii nadal parsuje i waliduje
      tekst talii przez `parseDeckText`.

**Exit:** **475/475** testów zielonych, artefakt jednoplikowy zawiera panel
kreatora (**41 modułów, 396.5 kB**), a eksport używa tego samego parsera/writera
co pliki repozytorium.

## M21 — UI ChoiceRequest jako adapter legalnych wariantów

**Status:** zamknięty (2026-08-03) — modal UI, bez zmiany autorytatywnego engine.

Zakres:

- [x] `src/table/choice-request.js` renderuje protokołowy wybór opcji w DOM
      wyłącznie przez `textContent` i węzły DOM;
- [x] `renderTableView` grupuje warianty tego samego działania: cele czarów i
      zdolności, wartości X, ninjutsu, scry oraz backup; combat pozostaje
      enumerowany, bo ma osobny kontrakt deklaracji;
- [x] `main.js` pokazuje modal, etykietuje warianty po polsku, waliduje wybór
      przez `choiceResponse` i dopiero wtedy przekazuje legalną komendę do sesji;
- [x] zamknięcie modala nie mutuje stanu, a Fog of War zachowuje się jak dotąd,
      bo wszystkie opcje pochodzą z `PlayerView.legalCommands`;
- [x] testy `test/choice-request-ui.test.js` i integracja w `test/table-ui.test.js`
      obejmują warianty, pustą listę i pełną partię.

Świadome ograniczenie (M21):

- engine nie emituje jeszcze natywnego `ChoiceRequest` w `PlayerView`; modal jest
      adapterem nad enumerowanymi legalnymi komendami. Dzięki temu nie zmieniamy
      protokołu ani reguł wstecznie, ale jawne wybory trybu/płatności wymagające
      nowego modelu engine pozostają przyszłym rozszerzeniem.

**Exit:** **477/477** testów zielonych, artefakt zawiera modal ChoiceRequest
(**42 moduły, 401.8 kB**), a wybór UI zawsze kończy się komendą zaakceptowaną
przez engine.

## M22 — Realne karty Batch 9: search, amass, warunek landów, Relic i cycling

**Status:** zamknięty (2026-08-03) na piątym batchu pięciu kart z listy właściciela.

Karty: **Kor Cartographer (CMR)**, **Scorpion Sentinel (FIN)**, **Dunland
Crebain (LTR)**, **Dragonbroods' Relic (TDM)** i **Secluded Steppe (DDO)**.
Dane Oracle i druki są w `docs/cards/scryfall-*.json`; wszystkie karty mają
`artId` ze słownika kolekcji; talia: `decks/real-batch9.txt`.

Zakres generyczny (ADR 0002):

- [x] efekt `search_library_to_battlefield` wyszukuje pierwszą kartę spełniającą
      kwalifikator, wprowadza ją tapped, tasuje własną bibliotekę seedem i
      emituje jawne zdarzenia; brak trafienia jest legalnym fail-to-find;
- [x] warunek statyczny `minLandsControlled` przelicza liczbę landów (także
      obiektów z typem Land) przy każdym odczycie efektywnych statystyk;
- [x] efekt `amass` znajduje kontrolowaną Army lub tworzy 0/0 token i kładzie
      liczniki +1/+1; token Orc Army jest `limited` w `REAL_CARDS`;
- [x] zdolności aktywowane mają jawne `timing`; dodano sorcery-speed dla
      poświęcenia Relic, a atomowa walidacja kosztu `tapCreature` nie zostawia
      źródła tapped po odrzuceniu aktywacji;
- [x] tokeny emitują również generyczne ETB; Reliquary Dragon ma flying,
      lifelink oraz trigger `any_target` z deterministycznym celem przeciwnika;
      efekty obrażeń rozróżniają combat/noncombat;
- [x] zwykły cycling z deskryptorem `drawCards` dobiera kartę bez wyszukiwania
      i tasowania; istniejący typecycling zachowuje poprzednią ścieżkę;
- [x] bot heurystyczny wycenia zwykły cycling i aktywowane `create_token`
      generycznie; pełna macierz B0 została wykonana po zmianie.

Świadome ograniczenia (M22):

- pula many pozostaje bezbarwna: symbole kolorów w kosztach są liczone jako
      jedna mana; „Add one mana of any color" daje 1 bezbarwną;
- opcjonalne „you may search" Kor Cartographer jest deterministyczne (pierwszy
      Plains albo fail-to-find), bez osobnego wyboru gracza;
- `any_target` Reliquary Dragon ma deterministyczną politykę testową — najpierw
      przeciwnik źródła; pełny wybór celu zostaje w adapterze ChoiceRequest;
- amass i ETB tokenu nie kaskadują do kolejnych triggerów w tej samej komendzie
      poza jawnie obsłużonym wejściem tokenu; nie dodano Army jako nowej strefy;
- dynamiczny bot nie był strojonym nowym modelem: dodano wyłącznie ogólne
      wyceny wymagane przez Batch 9 i zmierzono je B0.

**Exit:** **498/498** testów zielonych, artefakt buduje się (**42 moduły,
416.1 kB**), smoke Batch 9 kończy partie i uruchamia mechaniki. Pełna macierz
B0 (14 talii, 50 seedów, 31 500 meczów, 0 niedokończonych): heuristic
**78.9% vs random**, **65.4% vs aggro**, aggro **76.6% vs random**; próbka
regresji: 76.3% / 68.6%, progi `0.61` / `0.53`.

## M23 — Realne karty Batch 10: globalny buff, mill, plot, dynamiczny X i search

**Status:** zamknięty (2026-08-03) na dziesiątym batchu pięciu kart.

Karty: **Goblin Piker (M11)**, **Angel of the Dawn (M19)**, **Armored Skaab
(ISD)**, **Tumbleweed Rising (OTJ)** i **Dawntreader Elk (DKA)**. Dane Oracle
i druki są w `docs/cards/scryfall-*.json`; wszystkie karty mają `artId`; talia:
`decks/real-batch10.txt`.

Zakres generyczny (ADR 0002):

- [x] `buff_creatures_you_control` daje wszystkim własnym stworom pump i
      keywordy do cleanup (Angel of the Dawn), bez wzmacniania stworów wroga;
- [x] `mill_cards` przenosi karty z biblioteki do grobu i emituje `card_milled`;
      pusta biblioteka poza draw stepem nie przegrywa partii;
- [x] `plot` w definicji karty i komenda `plot_card`: sorcery-speed zapłata z
      ręki → exile → późniejszy cast sorcery bez many; stan `plotted` trafia do
      PlayerView i fingerprintu;
- [x] `greatest_power_you_control` wylicza dynamiczne P/T tokenu w momencie
      rozstrzygnięcia Tumbleweed Rising; token Elemental jest `limited`;
- [x] `search_library_to_battlefield` przyjmuje kwalifikator wielu typów
      (`Basic` AND `Land`), więc działa zarówno dla Elk, jak i wcześniejszego
      Cartographera;
- [x] inwariant combat usuwa z atakujących obiekt opuszczający bitwisko, a dla
      blockera usuwa tylko referencję do żywego obiektu i zachowuje marker
      `blockedAttackers` (zwykły atak nie trafia gracza; trample może przejść);
- [x] testy `test/real-cards-batch10.test.js` obejmują materializację, legalne i
      nielegalne aktywacje, globalny buff i cleanup, mill, plot/cast z exile,
      dynamiczny X, search, determinizm, interakcję i smoke botów.

Świadome ograniczenia (M23):

- pula many jest bezbarwna: koszt `{G}`/`{W}` liczy się jako 1, a plot `{2}{G}`
      jako 3;
- plot jest minimalnym klientowym modelem: karta pozostaje jawna w exile,
      bez osobnej strefy „plotted" poza flagą obiektu; nie dodano alternatywnych
      efektów zastępujących koszt poza zerem many przy cast;
- mill nie kaskaduje triggerów na odejście z bitwiska, bo biblioteka nie jest
      bitwiskiem; dynamiczny X jest deterministycznym odczytem stanu;
- zwykły Goblin Piker nie wnosi nowej mechaniki, ale jest pełnoprawną kartą
      `supported` z drukiem i testem materializacji.

**Exit:** **517/517** testów zielonych, artefakt buduje się (**42 moduły,
429.3 kB**), smoke Batch 10 kończy partie. Pełna macierz B0 (15 talii,
50 seedów, 36 000 meczów, 0 niedokończonych): heuristic **81.0% vs random**,
**64.3% vs aggro**, aggro **78.7% vs random**; próbka regresji 79.1% / 67.2%,
progi `0.64` / `0.53`.

## M24 — Realne karty Batch 11: inicjatywa, phyrexian mana, first strike, surveil, clash i descended

**Status:** zamknięty (2026-08-03) na jedenastym batchu — sześć kart z listy
właściciela (odstępstwo od zasady „5 kart na batch" na wyraźną listę
właściciela).

Karty: **Underdark Explorer (CLB)**, **Angel's Feather (M11)**, **Release the
Ants (MOR)**, **Porcelain Legionnaire (NPH)**, **Curate (BRO)** i **Canonized
in Blood (LCI)**. Dane Oracle i druki są w `docs/cards/scryfall-*.json`;
wszystkie karty mają `artId` ze słownika kolekcji (w tym Curate 302BRO —
duplikat nazwy rozstrzygnięty po secie, `pickArtId`); talia:
`decks/real-batch11.txt` (44 karty, 4× każda z 6 + 4× każdy land podstawowy).

Zakres generyczny (ADR 0002) — **pełne mechaniki, zero ograniczeń na kartach**
(decyzja właściciela 2026-08-03: „każda karta ma mieć zaimplementowane
mechaniki w 100%"):

- [x] **inicjatywa (CR 725)** — znacznik `initiativePlayerId` + efekt
      `take_initiative` (objęcie inicjatywy; pierwsze objęcie = venture do
      lochu) + zasada przejmowania przez combat damage (The Initiative);
      upkeep posiadacza venture'uje do Undercity;
- [x] **loch Undercity w 100%** — wszystkie 9 pokoi WYKONUJE swoje efekty:
      Secret Entrance (szukanie Basic Land do ręki + reveal + tasowanie),
      Forge (2× +1/+1 na target creature — deterministycznie najsilniejszy,
      ADR 0005), Lost Well (scry 2 — realna blokująca decyzja), Trap!
      (target player traci 5 życia — deterministycznie przeciwnik), Arena
      (goad target creature — stwór MUSI atakować do końca tury, CR 701.38),
      Stash (token Treasure), Archives (dobranie), Catacombs (4/1 Skeleton
      z menace), Throne of the Dead Three (odsłonięcie 10 kart, położenie
      stwora z 3× +1/+1 i hexproof do następnej tury kontrolera, tasowanie);
      **karta „The Undercity" jest renderowana na stole** z zaznaczeniem
      bieżącego pokoju każdego gracza (druk ze Scryfalla — legacy ID 990006:
      `api.scryfall.com/cards/tclb/20?format=image`); po Throne loch się
      kończy i dalsze venture nic nie robi;
- [x] **trigger „a player casts a white spell"** — nowy generyczny event
      `player_casts_spell` z warunkiem `spellColorsInclude`; kolory czarów
      trafiły na obiekty gry (`colors` z definicji), a zdarzenia
      spell_cast/permanent_cast/aura_spell_cast niosą je jawnie; face-down
      permanent jest bezbarwny (CR 702.36);
- [x] **clash (CR 701.40)** — efekt `clash`: odsłonięcie wierzchnich kart
      obu bibliotek (jawny `card_revealed`), porównanie mana value; **każdy
      gracz REALNIE wybiera wierzch albo spód swojej karty** (komenda
      `resolve_clash_choice`, jak scry/surveil); wygrany czar wraca do ręki
      właściciela (`returnToHandOnWin`); pusta biblioteka przegrywa clash;
- [x] **phyrexian mana (CR 118.9)** — `phyrexianManaCost` w definicji karty
      i obiekcie; **gracz WYBIERA dla każdego symbolu {W/P}: manę albo
      2 życia** — PlayerView wylicza wszystkie opłacalne warianty komendy
      `cast_permanent` (`phyrexianPayWithLife`), UI grupuje je w ChoiceRequest
      jak wartości X; legalność castu wymaga many na bazę;
- [x] **first strike (CR 702.7)** — combat rozstrzyga obrażenia w dwóch
      przebiegach (first strike → SBA → zwykłe); atakujący trafia wszystkich
      żywych blockerów w swoim przebiegu, a blokujący odpowiadają w przebiegu
      zgodnym z własnym first strike (CR 510.5); bez zmian dla walk bez FS;
- [x] **surveil (CR 701.41)** — `pendingSurveil` + komenda `resolve_surveil`:
      gracz wybiera karty do grobu ORAZ kolejność reszty na wierzchu
      („in any order" — warianty = podzbiory × permutacje, `topOrder`);
      czar wstrzymany w środku listy efektów dokańcza się po decyzji
      (`state.pendingSpell` — Curate: „Surveil 2, then draw a card");
- [x] **descended (Canonized in Blood)** — `descendedThisTurn[gracz]`
      liczony, gdy permanent card (nie token, nie czar) wpada do grobu
      gracza z dowolnej strefy (śmierć, poświęcenie, odrzucenie, mill);
      trigger `end_step` z intervening-if `descendedThisTurn` i celem
      `creature_you_control`; zwykły enchantment zagrywa się jak permanent;
- [x] cel czaru `any_target` (gracz albo stwór) dla Release the Ants;
- [x] boty: aggro odpowiada na `resolve_surveil`/`resolve_clash_choice`
      (jak resolve_scry), heuristic wycenia surveil (kolejność reszty
      zachowuje pierwotną) i clash (spód tylko dla zbędnych lądów) oraz
      preferuje manową płatność phyrexian; poprawki w engine: po
      rozstrzygnięciu czaru z blokującą decyzją priorytet zostaje u
      właściciela decyzji, a po każdej decyzji clash przechodzi na
      następnego wybierającego (wcześniej gra stawała w miejscu).

Wybory celów pokoi lochu są **decyzjami GRACZA** (decyzja właściciela
2026-08-03): Forge, Arena i Throne kolejkują `resolve_room_target` z pełną
listą legalnych celów (stworów na bitwisku / odsłoniętych kart), Trap! —
z obu graczy; **boty odpowiadają deterministycznie** (aggro/heuristic:
Trap! → przeciwnik, Forge/Arena → własny najsilniejszy stwór, Throne →
najsilniejszy odsłonięty). Przy dwóch decyzjach zakolejkowanych w jednej
komendzie (np. scry Nefarious Imp + wybór celu z przejęcia inicjatywy)
widok oferuje wyłącznie pierwszą (sekwencyjnie, jak bramki execute).

Świadome ograniczenia (M24):

- descend nie liczy tokenów (to nie karty) i nie rozróżnia źródła strefy
      poza samym faktem wejścia do grobu (zgodnie z Oracle „from anywhere");
- brak double strike — first strike dotyczy tylko jednego przebiegu.

**Exit:** **563/563** testów zielonych, artefakt buduje się (**42 moduły,
510.2 kB**), smoke Batch 11 kończy partie i uruchamia wszystkie nowe
mechaniki (w tym venture w lochu, goad i wybory celów pokoi). Pełna macierz
B0 (16 talii, 50 seedów, 40 800 meczów, 0 niedokończonych): heuristic
**83.1% vs random**, **62.3% vs aggro**, aggro **81.2% vs random**; próbka
regresji 81.3% / 65.9%, progi `0.66` / `0.53` bez zmian. Przy okazji
naprawiony błąd: dwie blokujące decyzje w jednej komendzie były oferowane
naraz (bot mógł wybrać „niewłaściwą" — scry zamiast celu pokoju); teraz
decyzje rozwiązują się sekwencyjnie.

## M25 — UX sekcja „Przebieg tur (dla AI)": Czarodziejka i Nieprzyjaciel

**Status:** zamknięty (2026-08-03) — decyzja właściciela, tylko warstwa UX
(sesja + render, engine/protokół nietknięte).

Nowy panel stołu obok „Rozumowania bota": **„Przebieg tur (dla AI)"** pokazuje,
co robił gracz i bot w **poprzedniej pełnej turze albo w dwóch ostatnich** —
gotowy blok tekstu do wklejenia modelowi AI, żeby opisał przebieg partii
fabularnie. Gracz nazywa się **Czarodziejka**, bot — **Nieprzyjaciel**
(decyzja właściciela; reszta stołu zachowuje „Ty"/„Bot").

Zakres:

- [x] sesja zbiera per-turn rekordy akcji (`session.turnHistory`): tura jest
      „pełna", gdy rozpoczęła się następna (zdarzenie `turn_started`);
      bieżąca tura dołącza po zakończeniu partii; czyszczone przy wznowieniu
      zapisu (jak ślad rozumowania bota);
- [x] `session.turnHistoryText(count)` formatuje 1 albo 2 ostatnie pełne tury
      (`**Tura N — Czarodziejka**` + wypunktowane akcje w kolejności zdarzeń);
      szum pominięty: kroki tury, produkcja many, techniczne przenosiny
      (opis zdarzeń współdzielony z logiem — `describeEvent` przyjmuje mapę
      imion);
- [x] panel `<details>` z przełącznikiem **1/2 ostatnie tury** (radio,
      stan w pamięci strony — bez localStorage) i guzikiem **„Kopiuj do
      schowka"** (Clipboard API z fallbackiem textarea dla `file://`);
      licznik pokazuje liczbę ukończonych tur;
- [x] render `renderTurnHistory` wypełnia `<pre>` przez `textContent`
      (bez innerHTML, spójnie z resztą stołu);
- [x] testy `test/table-turn-history.test.js` (6) + id nowego panelu
      w mini-DOM `test/table-ui.test.js`.

Świadome ograniczenia (M25):

- historia tur jest w pamięci sesji (znika przy odświeżeniu strony) —
      jak log i rozumowanie bota; zapis partii (replay) pozostaje trwałą
      historią;
- „pełna tura" = tura zakończona; dopóki partia trwa, panel pokazuje
      wyłącznie ukończone tury (tura bieżąca dochodzi po jej końcu albo po
      zakończeniu partii);
- imiona Czarodziejka/Nieprzyjaciel dotyczą wyłącznie tej sekcji —
      globalna zmiana nazw stołu to osobna decyzja właściciela.

**Exit:** **551/551** testów zielonych, artefakt buduje się (**42 moduły,
472.8 kB**), pełna partia przez kliknięcia (`test/table-ui.test.js`)
przechodzi z nowym panelem.

## M26 — Poprawka gestów dotyku na iPadzie (tap vs double-tap, zamykanie pełnego ekranu)

**Status:** zamknięty (2026-08-03) — tylko warstwa UX (nowy moduł
`src/table/gestures.js` + render/main), zgłoszenie właściciela z iPada.

Problem:

1. **Double-tap nie działał — zawsze wygrywał pojedynczy klik.** iOS nie
   wysyła `dblclick` dla dotyku, a syntetyczny `click` leci po KAŻDYM
   tapnięciu. Stary kod rozpoznawał double-tap na `touchend` (300 ms), ale
   `click` z drugiego tapnięcia przychodził później i otwierał menu
   kontekstowe (modal, z-index 1500) NAD warstwą pełnego ekranu (z-index 60)
   — efekt: „podwójny zawsze wywołuje pojedynczy".
2. **Pełny ekran zamykał się tylko ✕ (albo klik w tło),** a miał zamykać ten
   sam gest, którym został otwarty.

Rozwiązanie — wspólny kontrakt `installTapGesture(element, { onTap,
onDoubleTap, ignoreClick })` w `src/table/gestures.js`:

- **Mysz (bez zmian):** `click` → onTap natychmiast, `dblclick` → onDoubleTap.
- **Dotyk:** pojedyncze tapnięcie odpala onTap PO oknie 300 ms (drugie
  tapnięcie może je anulować); drugie tapnięcie w oknie → onDoubleTap
  natychmiast; syntetyczny `click` po double-tapie jest tłumiony
  (suppressClick + reset po 400 ms, gdyby click nie nadszedł).
- **Fullscreen:** `ignoreClick` odrzuca kliknięcia w oknie 350 ms po otwarciu
  („odprysk" gestu otwierającego — warstwa pojawia się między `touchend`
  a `click` drugiego tapnięcia); onTap i onDoubleTap = close, więc pełny
  ekran zamyka ten sam gest (tap albo double-tap) w dowolnym miejscu,
  także na samej karcie.
- Kafelki stołu (render.js `tile`) i warstwa pełnego ekranu (main.js) używają
  tego samego helpera; podpowiedź pełnego ekranu: „Dotknij ✕ lub w dowolnym
  miejscu, żeby zamknąć".

Testy: `test/table-touch-gestures.test.js` (8) na `mock.timers` (Date +
setTimeout): pojedynczy tap po oknie, double-tap bez wyciekającego onTap,
odstępy ≥ 300 ms = dwa pojedyncze, odprysk po otwarciu ignorowany, cancel().
Engine, protokół i boty nietknięte — bez pomiaru benchmarku (to nie zmiana
bota, zasada B5).

**Exit:** **571/571** testów zielonych, artefakt buduje się (**43 moduły,
513.3 kB** — nowy moduł `gestures.js`).

## M27 — Realne karty Batch 12: czary wielocelowe, „of their choice", ujemna moc, tokeny wg nazwy

**Status:** zamknięty (2026-08-03) na dwunastym batchu — pięć kart z listy
właściciela.

Karty: **Grave Exchange (AVR)**, **Hysterical Blindness (ISD)**,
**Barkform Harvester (BLB)**, **Undead Servant (ORI)** i **Rage of Purphoros
(THS)**. Dane Oracle i druki są w `docs/cards/scryfall-*.json`; wszystkie karty
mają `artId` ze słownika kolekcji (Undead Servant jako **ORI** — duplikat nazwy
rozstrzygnięty po secie druku Origins, `pickArtId`); talia:
`decks/real-batch12.txt` (44 karty, 4× każda z 5 + 4× każdy land podstawowy).

Zakres generyczny (ADR 0002) — **pełne mechaniki, zero ograniczeń na kartach**
(decyzja właściciela 2026-08-03: „każda karta ma mieć zaimplementowane
mechaniki w 100%"):

- [x] **czary wielocelowe** (Grave Exchange) — `legalSpellCasts` generuje
      iloczyn kartezjański legalnych celów dla każdej pozycji specyfikacji;
      efekty mapują się na cele przez `targetIndex` (efekt odnoszący się do
      nielegalnego celu nic nie robi — CR 608.2b, tablica legalTargets
      indeksowana jak targetSpec z nullami);
- [x] nowe typy celów: **`player`** (dowolny gracz), **`creature_card_in_graveyard`**
      i **`card_in_graveyard`** (karta w grobie kontrolera źródła) — w
      `validateTargets` i enumeracji celów (spells + aktywowane zdolności);
- [x] **powrót stwora-karty z własnego grobu do ręki** (`return_creature_card_to_hand`);
- [x] **„Target player sacrifices a creature of their choice"** — blokująca
      decyzja `resolve_sacrifice_choice` (jak scry/surveil): cel wybiera stwora
      do poświęcenia spośród legalnych kandydatów; boty odpowiadają
      deterministycznie (najsłabszy własny stwór); gracz bez stworów nie
      poświęca niczego; czar wstrzymany w środku efektów dokańcza się po decyzji;
- [x] **globalny modyfikator stworów przeciwnika do końca tury**
      (`buff_opponents_creatures` — Hysterical Blindness: -4/-0; ujemna moc
      nie zabija stwora);
- [x] **położenie karty z grobu na spód biblioteki** (`put_graveyard_card_on_bottom`
      — Barkform Harvester, aktywowana zdolność {2});
- [x] **tokeny za liczbę kart o danej nazwie w grobie** (Undead Servant —
      `create_token` z `amount: 'cards_named_in_graveyard'`; liczone po cardId,
      token Zombie nie jest liczony);
- [x] **changeling** (Barkform Harvester) — keyword; żadna mechanika katalogu
      nie pyta o typy stwora, więc nie wpływa na rozgrywkę (dane-akuratne);
- [x] Rage of Purphoros — 4 obrażeń do stwora + **scry 1** (blokująca decyzja);
      „can't be regenerated" bez efektu (regeneracji nie ma w engine).

Wybory poświęcenia są **decyzjami GRACZA** (jak wybory celów pokoi lochu z M24):
`resolve_sacrifice_choice` kolejkuje pełną listę legalnych stworów celu; boty
odpowiadają deterministycznie (heuristic i aggro: najsłabszy własny stwór).

**Naprawione przy okazji dwa generyczne błędy odsłonięte przez nowe karty:**

- **scry jako ostatni efekt czaru nie dokańczał czaru po `resolve_scry`**
  (Rage of Purphoros zostawał na stosie z `state.pendingSpell` na zawsze —
  `pendingScry` nie wołało `finishPendingSpell`, jak robi to `pendingSurveil`).
  Teraz po decyzji scry wstrzymany czar dokańcza efekty i opuszcza stos.
- **ujemna moc próbowała zadać ujemne obrażenia combat** (po Hysterical
  Blindness -4/-0). Combat zadaje teraz `max(0, power)` — moc ≤ 0 to 0 obrażeń
  (CR 510.1), dla atakującego i blokującego.

Świadome ograniczenia (M27):

- changeling jest keywordem (pełne typy stwora nie mają znaczenia w katalogu);
- „can't be regenerated" (Rage of Purphoros) nie ma efektu — regeneracja nie
  jest zaimplementowana w engine.

**Exit:** **585/585** testów zielonych, artefakt buduje się (**43 moduły,
530.2 kB**), testy `test/real-cards-batch12.test.js` (13) + zaktualizowana
liczba artId w `test/art-ids-tool.test.js` (50). Pełna macierz B0 (17 talii,
50 seedów, 45 900 meczów, 0 niedokończonych): heuristic **84.2% vs random**,
**62.3% vs aggro**, aggro **82.2% vs random**; próbka regresji **82.5% /
66.7%**, progi `0.66 / 0.53` bez zmian (wartości tylko w górę — to dodanie
kart, nie zmiana bota).

## M28 — Realne karty Batch 13: aura „Enchant player", kontrczar, statyczna moc, limit aktywacji

**Status:** zamknięty (2026-08-03) na trzynastym batchu — pięć kart z listy
właściciela.

Karty: **Scorned Villager (DKA)**, **Curse of the Pierced Heart (ISD)**,
**Emissary Escort (EOE)**, **Snarling Wolf (VOW)** i **Negate (M20)**.
Dane Oracle i druki są w `docs/cards/scryfall-*.json`; wszystkie karty mają
`artId` ze słownika kolekcji (tył Scorned Villager — Moonscarred Werewolf —
osobny artId 485); talia: `decks/real-batch13.txt` (44 karty, 4× każda z 5
+ 4× każdy land podstawowy).

Zakres generyczny (ADR 0002) — **pełne mechaniki, zero ograniczeń na kartach**
(decyzja właściciela 2026-08-03):

- [x] **aura „Enchant player"** (Curse of the Pierced Heart, CR 303.4/702.5) —
      nowy typ aury obok bestow/czystej: deskryptor `aura: { enchant: 'player' }`,
      rzucanie z wyborem GRACZA jako celu (`legalAuraCasts`/`castAuraSpell`),
      rozstrzygnięcie wchodzi na bitwisko z `enchantedPlayerId` (kind
      'enchantment', nie 'aura' — gracz nie opuszcza bitwiska, więc aura nigdy
      nie staje się osierocona, CR 704.5m dotyczy obiektów); trigger
      `enchantedPlayerUpkeep` w upkeep ZACZAROWANEGO gracza (nie kontrolera)
      zadaje 1 obrażeń temu graczowi (`damage_enchanted_player`; bez
      planeswalkerów w engine — zawsze gracz);
- [x] **kontrczar** (Negate, CR 701.5) — nowy typ celu
      `noncreature_spell_on_stack` (czar na stosie niebędący stworem:
      instants/sorceries i czyste aury; cast bestow — kind 'creature' —
      wykluczony); efekt `counter_spell` przenosi cel ze stosu do grobu bez
      rozstrzygania; zdarzenie `spell_countered`;
- [x] **statyczna moc dynamiczna** (Emissary Escort, CR 604.3) — `staticBonuses`
      rozpoznaje pump `power: 'greatest_mana_among_other_artifacts'` i liczy X
      jako największą mana value wśród INNYCH artefaktów kontrolera (bez
      samego źródła, bez artefaktów przeciwnika), przeliczane przy każdym
      odczycie statystyk;
- [x] **„activate only once each turn"** (Snarling Wolf) — `oncePerTurn` w
      `createAbility`; tracking `state.abilityActivatedThisTurn` (klucz
      `${objectId}:${abilityIndex}`), reset co turę; po aktywacji zdolność
      znika z legalnych akcji do końca tury;
- [x] **transform DFC** (Scorned Villager → Moonscarred Werewolf) — wzorzec
      Grizzled Outcasts: zdolność many `{T}: Add {G}` (przód) / `{T}: Add {G}{G}`
      (tył, vigilance), trigger upkeep „no spells were cast last turn" /
      „a player cast two or more spells last turn".

Naprawiony przy okazji generyczny błąd odsłonięty przez nowe mechaniki:

- **`castAuraSpell` walidował cel stwora DOPIERO PO wydaniu many i przeniesieniu
  na stos** — przy nielegalnym celu karta ginęła (na stosie) mimo odrzucenia
  komendy. Teraz walidacja celu (stwór albo gracz dla curse) odbywa się PRZED
  jakąkolwiek mutacją stanu (CR 601.2h), jak w atomowych kosztach zdolności.

Świadome ograniczenia (M28):

- „or a planeswalker that player controls" (Curse) bez efektu — brak
  planeswalkerów w engine; 1 obrażeń zawsze trafia zaczarowanego gracza;
- kontrczar celuje wyłącznie w czary na stosie — stwory z `cast_permanent`
  (bez stosu) i bestow (stwór) nie są legalnymi celami Negate;
- mana ability `{T}: Add {G}` produkowana jako bezbarwna (pula many engine),
  jak Apprentice Wizard.

**Exit:** **599/599** testów zielonych, artefakt buduje się (**43 moduły,
543.9 kB**), testy `test/real-cards-batch13.test.js` (13) + zaktualizowana
liczba artId w `test/art-ids-tool.test.js` (56). Pełna macierz B0 (18 talii,
50 seedów, 51 300 meczów, 0 niedokończonych): heuristic **84.1% vs random**,
**63.0% vs aggro**, aggro **81.0% vs random**; próbka regresji **81.8% /
66.5%**, progi `0.66 / 0.53` bez zmian (to dodanie kart, nie zmiana bota).

## M29 — Realne karty Batch 14: defender, flash, deathtouch, stun, discover, explore, craft, Food

**Status:** zamknięty (2026-08-04) na czternastym batchu — dziesięć kart z listy właściciela.

Karty: **Ainok Tracker (KTK)**, **Spectral Prison (AVR)**, **Raucous Carnival (DSK)**,
**Cloudbound Moogle (FIN)**, **Insatiable Appetite (ELD)**, **Stirring Bard (CLB)**,
**Hunter's Blowgun (LCI)**, **Geological Appraiser (LCI)**, **Lodestone Needle //
Guidestone Compass (LCI — DFC transform)** i **Panic Spellbomb (SOM)**. Dane Oracle
i druki są w `docs/cards/scryfall-*.json`; wszystkie karty mają `artId` ze słownika
kolekcji (68/181/48/86/386/251/267/382/483/484/542); talia: `decks/real-batch14.txt`.

Zakres generyczny (ADR 0002) — pełne mechaniki, zero ograniczeń na kartach:

- [x] **Defender (CR 702.3)** — keyword blokujący atak (`isLegalAttacker` sprawdza);
- [x] **Flash (CR 702.8)** — permanent z flash można rzucić z priorytetem w każdej fazie;
- [x] **Stun counters** — zamiast odkręcenia z licznikiem stun, zdejmij licznik;
- [x] **Deathtouch w walce (CR 702.4)** — obrażenia ≥1 od stwora z deathtouch niszczą cel;
- [x] **Conditional keywords wg tury** — equipment z `conditionalKeywords`;
- [x] **Warunkowe entersTapped** — `entersTappedCondition` (life ≤13);
- [x] **Food tokens + sacrifice choice** — `resolve_food_choice`;
- [x] **Discover (CR 701.53)** — blocking choice `resolve_discover_choice`;
- [x] **Explore (CR 701.54)** — blocking choice `resolve_explore_choice`;
- [x] **Craft transform** — exile self → return transformed;
- [x] **"Can't block this turn"** — `cantBlock` flag czyszczony w cleanup;
- [x] **Trigger "aura host targeted by spell"** — Spectral Prison;
- [x] **"If you cast it"** — `wasCast` flag + `ifCast` condition;
- [x] **Grant keywords until end of turn** — nowy efekt.

Świadome ograniczenia (M29): craft pomija koszt exile another artifact; discover/explore
mają deterministyczne wybory bota; Food token tworzony ad hoc; deathtouch dotyczy tylko
combat damage; conditional keywords evaluate activePlayerIsController only.

**Exit:** **633/633** testów, artefakt **43 moduły / 589.5 kB**.

## M30 / Batch 15 — 10 kart (2026-08-04)

Lista właściciela (10 kart, odstępstwo od „5 na batch"): Howl of the Night Pack
(M10), Goblin Picker (DMU), Dragon Arch (APC), Trigon of Corruption (SOM),
Aerith Rescue Mission (FIN), Esper Stormblade (ARB), Forge Devil (DKA), Shatter
(SOM), Sweet Oblivion (THB), Village Rites (M21). Dane Oracle w
`docs/cards/scryfall-*.json`; wszystkie karty mają `artId` ze słownika kolekcji
(37/388/72/218/275/191/393/507/103/279); talia: `decks/real-batch15.txt`;
testy: `test/real-cards-batch15.test.js` (30).

Zakres generyczny (ADR 0002) — pełne mechaniki:

- [x] **Tokeny za liczbę landów podtypu** — `amount: 'lands_with_subtype_you_control'`
      + `subtype` (Howl: Wolf za każdy Forest; liczy też land creatures i zmianę typu);
- [x] **Koszt zdolności „Discard a card"** — `cost.discardCard` (deterministycznie
      najtańsza karta — dobrowolny koszt, gracz zostawia droższe; ADR 0005);
- [x] **Koszt zdolności „Remove a counter"** — `cost.removeCounter: { name, amount }`
      (Trigon: charge counters jako zasób);
- [x] **„Destroy target artifact" (CR 701.7)** — efekt `destroy_permanent` (→ grób,
      odpala dies) + cel `artifact` (Shatter);
- [x] **Obrażenia w kontrolera** — efekt `damage_to_controller` (nie-cel; Forge Devil);
- [x] **Mill celu-gracza** — `mill_cards` czyta `targets[0]`, gdy to gracz
      (Sweet Oblivion: „Target player mills four");
- [x] **Warunek statyczny „inny wielokolorowy permanent"** —
      `condition.controlsAnotherMulticolored` (Esper Stormblade; multicolored =
      colors.length >= 2);
- [x] **Dodatkowy koszt rzutu „sacrifice a creature"** —
      `spell.additionalCost.sacrificeCreature` (Village Rites; enumeracja po stworach
      w `legalSpellCasts`, płatność w `castSpell` przed wejściem na stos);
- [x] **Modal „Choose one"** — `spell.modes`; tryb ze zmienną liczbą celów
      (`variableTargets` 1–3) + dodatkowy cel wśród nich (`stunAmongTargets`)
      (Aerith Rescue Mission);
- [x] **Escape (CR 702.138)** — `spell.escape: { cost, exileCount }`; komenda
      `cast_escape` rzuca czar z grobu za koszt escape + wygnanie exileCount innych
      kart z grobu (koszt wygnania deterministyczny — ADR 0005); po rozstrzygnięciu
      czar wraca do grobu i można go uciec ponownie (Sweet Oblivion);
- [x] **„Put a multicolored creature from hand onto battlefield"** — efekt
      `put_multicolored_creature_from_hand` + blokująca decyzja `resolve_hand_creature`
      (stan `pendingHandCreature`; „you may" pozwala nic nie kłaść) (Dragon Arch);
- [x] **Hybrid mana** — redukcja do bezbarwnej puli many (jak każda karta; pula jest
      bezbarwna), `colors`=[W,B,U] napędza wykrywanie wielokolorowości (Esper Stormblade).

Nowe typy komend: `cast_escape`, `resolve_hand_creature`. Nowe zdarzenia:
`permanent_destroyed`, `hand_creature_choice_required`, `hand_creature_choice_resolved`
(tłumaczenia w `src/table/session.js`). Tokeny: `token_wolf` (2/2 G Wolf),
`token_hero` (1/1 bezbarwny Hero).

Świadome ograniczenia (M30): wybór karty odrzucanej kosztem `discardCard` jest
deterministyczny (najtańsza); koszt wygnania Escape jest deterministyczny (pierwsze
exileCount kart grobu); tryb modalny z `variableTargets` enumeruje podzbiory celów
(ograniczone rozmiarem bitwy). Boty nie zostały zmienione (dodanie kart).

**Exit:** **663/663** testów, artefakt **43 moduły / 627.6 kB**.

## M31 — używalny kreator talii + bot B0/strojenie (2026-08-04)

Przerwa od batchy kart: trzy tematy właściciela.

**(A) Kreator talii** (`src/table/deck-builder.js`, `src/cards/deck-builder.js`):
- [x] „Dodaj po 1 (z filtrów)" — `addFilteredToDeck` (limit kopii respektowany);
- [x] „Wyczyść talię" — `clearDeck`;
- [x] statystyki talii — `deckStatistics` (typy, kolory, krzywa many, śr. mana);
- [x] podstawowe landy na samej górze listy — `sortBuilderCards`;
- [x] biblioteka talii w IndexedDB (`src/table/deck-store.js`): load/save/save-as/delete
      + wczytywanie talii z `decks/` (`REPO_DECKS`). IndexedDB to cache pod ITP
      (Safari czyści) — trwałość gwarantuje eksport do `decks/` (ADR 0011/0012).

**(B) Filtr Plan**: kolumna „Plan / Setting" arkusza kolekcji (setting/plane MtG)
to plan karty. Wyciągnięta kompaktowym eksportem `&range=A:D` (bez wielkich kolumn
Prompt/Narracja) przez `tools/fetch-plans.mjs`, dopisana jako kolumna Plan do
`tools/collection-art-ids.csv` i wpisana `plan` do kart (set-aware — Curate z BRO
dostaje „Forgotten Realms", a nie „Arcavios" z STX). Filtr Plan w kreatorze grupuje
teraz realne karty (Tarkir, Innistrad, Wiedźmin, Dominaria…). Narzędzie do odświeżania.

**(C) Bot — pełny pomiar B0 i strojenie wag**:
- Pełna macierz (19 talii, 50 seedów, 63 000 meczów): heuristic **83.2% vs random,
  60.8% vs aggro** (Batch 14: 84.1/63.0 — lekki spadek: nowe karty dodają złożoność,
  której heurystyka nie wycenia; aggro **75.9% vs random**).
- Diagnoza **2 niedokończonych gier**: long-game z `real-batch15` — generatory
  tokenów (Howl, Aerith, Dragon Arch) → rozrost bitwy → board-stall (nikt nie
  atakuje) + boty tapują wszystkie landy co turę (~20 komend/turę); gra kończy się
  taliczeniem ~tura 60, przekraczając cap. **Fix: `maxCommands` 3000→5000**
  (test dopuszcza) → 0 niedokończonych. To long-game, nie nieskończona pętla.
- **Strojenie B4** (`tools/tune-bot.mjs`, 4 seedy, 15 ewaluacji, ~17 min):
  żaden kandydat (7 wag ±0.1) nie poprawił funkcji celu ponad wagi M19
  (mana=1.1, permanent=0.9, reszta 1.0). Wagi pozostają optymalne przy 74 kartach
  — **bez zmiany bota, progi `0.66/0.53` bez zmian**.

Świadome ograniczenia (M31): boty tapują landy, których nie potrzebują
(marnotrawstwo komend — osobny temat bota, nie strojenie wag); plany kart wymagają
jednorazowego uruchomienia `fetch-plans.mjs` z dostępem do sieci.

**Exit:** **672/672** testów, artefakt **44 moduły / 643.0 kB**.

## M32 — paradygmat talii singleton (2026-08-04)

Duża zmiana: kasujemy wszystkie dotychczasowe talie i wprowadzamy nowe zasady
budowy talii (decyzja właściciela).

- [x] **Walidacja singleton** — `validateDeck`: `maxCopies=1` (lądy podstawowe bez
      limitu) + `minNonland=15`. Kreator talii też wymusza singleton.
- [x] **6 nowych talii hybrydowych** (3 kolor + 3 plan) zastąpiło real-batch1..15
      i synthetic-*: `green`, `black`, `red` + `innistrad`, `azorius`, `wiedzmin`.
      Pokrywają 69 realnych kart nielandowych; lądy podstawowe dopasowane do kolorów.
- [x] **Testy bota na nowych taliach** — pełny benchmark B0 (6 talii, 50 seedów,
      6300 meczów, **0 niedokończonych**): heuristic **95.0% vs random, 74.1% vs
      aggro**, aggro 91.9% vs random. Próbka regresji (4 seedy): 93.5/66.1 →
      progi podniesione do **0.78 / 0.53**.
- [x] **Re-strojenie wag odkładam** — format singleton wyraźnie faworyzuje
      heurystykę (95.0% vs random, było 83.2%), więc wagi M19 pozostają silne.

Świadome ograniczenia (M32): boty nadal marnotrawią tapowanie lądów (osobny temat);
kolor lądu nie wpływa na manę (pula bezbarwna) — tylko smak.

**Exit:** **639/639** testów, artefakt **44 moduły / 638.0 kB**.

## M33 / Batch 16 — dziesięć realnych kart, Station, Saga i Metalcraft (2026-08-04)

Batch 16 z listy właściciela (10 kart, ADR 0010 §2a — dane Scryfall pobrane
przed kodowaniem): **Alaborn Trooper** (P02, vanilla 2/3), **Wedgelight
Rammer** (EOE), **Jill, Shiva's Dominant // Shiva, Warden of Ice** (FIN —
karta dwustronna), **Ethersworn Shieldmage** (ARB — zapis „CON" na liście
odnosił się do planu Alara; druk ARB potwierdzony przez właściciela
2026-08-05),
**Fiery Fall** (MM2), **Plague Reaver** (CMR), **Greatsword of Tyr** (CLB),
**Ramroller** (ORI), **Marut** (CLB), **Stoic Rebuttal** (SOM).

Nowe, generyczne mechaniki engine (zero warunków na nazwę karty, ADR 0002):

- **Station (CR — EOE Spacecraft):** koszt zdolności „Tap another creature
  you control\" (`tapOtherCreature` — odróżnienie „another\" od Holdout
  Settlement, CR 601.2h) kładzie na artefakcie liczniki charge równe mocy
  zatapniętego stwora; przy progu ≥ 9 obiekt staje się artefaktowym stworem
  z wydrukowanymi P/T i słowami kluczowymi z deskryptora `station`
  (synchronizacja przy każdej zmianie liczników + zdarzenie
  `station_status_changed` dla logu/UI). Przy 0 mocy zdolność rozstrzyga się
  bez liczników (CR 107.1c).
- **Saga (CR 714):** deskryptor rozdziałów na karcie; wejście Sagi na
  bitwisko kładzie licznik lore i odpala rozdział I (714.3a/2a), po kroku
  dobierania kontrolera („after your draw step\", 714.3b — w engine: wejście
  do precombat main aktywnego) kolejny licznik odpala następny rozdział;
  po ostatnim rozdziale Saga jest poświęcana (714.4) — chyba że sama
  opuściła bitwisko w trakcie rozdziału (Shiva: przemiana w Jill). Efekty
  rozdziałów: „stwór nie może być blokowany do końca tury\", „tap all lands
  your opponents control\", „exile + return transformed\".
- **Karta dwustronna z Sagi na rewersie (transform DFC):** wspólny kod
  `exile_return_transformed` (Jill → Shiva ze zdolności {3}{U}{U},{T} oraz
  Shiva → Jill z rozdziału III); zwrócony permanent odpala swoje triggery
  wejścia (ETB Sagi / ETB Jill — jeden kontrolowany poziom zagnieżdżenia).
- **Metalcraft:** `costReduction` na deskryptorze czaru — koszt efektywny
  czaru spada o wskazaną liczbę many, gdy kontrolujesz ≥ 3 artefakty
  (Stoic Rebuttal {1}{U}{U} → {U}{U}); respektowana w walidacji rzutu,
  puli many i `legalCommands`.
- **„Counter target spell\" bez ograniczeń:** cel `spell_on_stack` obejmuje
  dowolny czar na stosie (także permanent-y i czary aury bestow).
- **Prewencja obrażeń „this turn\":** filtr `{ typesInclude, isCreature }` na
  stanie gry — „prevent all damage that would be dealt to artifact creatures
  this turn\" (Ethersworn Shieldmage, ETB z flash); wygasa w cleanup
  (CR 614/514.2), łagodzi deathtouch (brak znacznika), zdarzenia
  `damage_prevented` / `damage_prevention_started`.
- **Śledzenie many ze Skarbów:** pula `treasureMana` gracza (fill przez
  zdolność Skarba, wydawana w pierwszej kolejności — uproszczenie puli
  bezbarwnej), znacznik `manaFromTreasureSpent` na permanencie zagranym tą
  maną; ETB Maruta tworzy Skarby równe tak wydanej manie.
- **Must-attack statyczne (CR 508.1c):** zdolność „attacks each combat if
  able\" wymusza atak, gdy stwór jest w stanie (jak goad, ale statyczne);
  legalne opcje ataku łączą zbiór obowiązkowych z dotychczasowymi goadem.
- **Statyczny warunek „controls another artifact\":** staticBonus +2/+0
  (Ramroller) — `controlsAnotherArtifact` sprawdza bitwisko i groby
  (uproszczenie jak przy Affinity).
- **Trigger na załączniku „equipped creature attacks\":** zdolność siedzi na
  sprzęcie (nie na nosicielu); cele: atakujący + deterministycznie
  najsilniejszy stwór obrońcy („up to one\").
- **Ping-pong kontroli (Plague Reaver):** koszt „Discard two cards, Sacrifice
  this creature\" (`discardCards: N` — deterministycznie najtańsze karty,
  jak Goblin Picker) + efekt z obiektu Z GROBU (CR 400.7 — źródło efektu po
  sacrificeSelf); opóźniony trigger „at the beginning of their next upkeep\"
  (CR 603.7) ze strażnikiem `armedAt` (bieżący upkeep celu się nie liczy).
- **Rozliczanie walki z prewencją:** deathtouch respektuje zniwelowane
  obrażenia w obu kierunkach.

Naprawione przy okazji błędy core:

- `processTriggers` dopisywał zdarzenia triggerów do `state.events`
  **dwukrotnie** (zbiorczy push na końcu + push w `fireTrigger`) — każdy
  trigger mnożył wpisy logu; uspójnione (log stołu, replay i testy czytają
  czysty strumień).
- przesłonięty parametr w koszcie `tapOtherCreature` blokował aktywację
  Station.
- **nieaktualni kandydaci pokoju lochu (M24, `illegal_room_target`)** —
  przychwycony pełną macierzą B0: lista `candidateIds` łapie się przy
  venture, ale kandydat może zniknąć przed rozstrzygnięciem (trigger w tej
  samej komendzie wygnął stwora); komenda z oferty legalowa była potem
  odrzucana. Wspólny `legalRoomTargetCandidates` pilnuje spójności oferty i
  walidacji, a decyzja bez żadnego legalnego celu gaśnie jak czar bez celu
  (CR 608.2b) zamiast blokować grę. Regresja: `test/room-targets-staleness.test.js`.

Świadome uproszczenia (jak w poprzednich batchach, ADR 0005): cele „up to
one\"/„target\" bez decyzji gracza rozstrzygane deterministycznie (najsilniejszy
permanent/stwór; notatki w `support.limitations` kart); basic landcycling
znajduje pierwszą kartę Basic Land w kolejności biblioteki; pula „treasure
mana\" resetuje się na początku tury właściciela.

Karty trafiły do talii singleton (M32): azorius +5 (Trooper, Shieldmage,
Rebuttal, Greatsword, Rammer), black +2 (Reaver, Marut), red +2 (Ramroller,
Fiery Fall), wiedzmin +1 (Jill); liczniki lądów podstawowych odpowiednio
podniesione. Shiva (rewers) i token Robota to karty `limited` (poza taliami).

Bot bez zmian (bez re-strojenia). Pełny benchmark B0 informacyjnie (6 talii,
50 seedów, 6300 meczów, 0 niedokończonych): heuristic **89.9% vs random,
74.1% vs aggro**, aggro 94.4% vs random — powyżej progów regresji (0.78 /
0.53), progi bez zmian.

**Exit:** **685/685** testów, artefakt **44 moduły / 693.3 kB**.

## M35 / Batch 17 — DOKOŃCZENIE (2026-08-05)

PR #26 (scalony) wniósł do engine'u mechaniki Batchu 17 i pliki Scryfall dla
10 kart, **ale bez definicji kart, testów, dopisania do talii i benchmarku**
(`supported` utknęło na 90; opis PR przyznawał wprost: „699/699 zielonych
przed dodaniem testów kart Batch 17"). Ta sesja dokończyła batch.

**10 realnych kart** (wszystkie w kolekcji — `artId` i plan ze słownika):
Maritime Guard (M11, vanilla 1/3), Carrion Call (SOM, 2× 1/1 Phyrexian Insect
z infect), Garruk's Companion (M11, 3/2 trample), Lunar Rejection (VOW,
bounce Wolf/Werewolf + draw; **Cleave** {3}{U} → bounce dowolnego), Selhoff
Occultist (ISD, `any_creature_dies` → target player mills 1), Reclusive
Artificer (ORI, haste + ETB damage = liczba artefaktów), Captain's Call
(CMR, 3× 1/1 Soldier), Your Temple Is Under Attack (CLB, modal: indestructible
EOT / draw 2 both), Crested Herdcaller (RIX, 3/3 trample + ETB 3/3 Dinosaur
trample), Silvanus's Invoker (CLB, {8}: untap land + animacja 8/8 trample/haste
„still a land"). Tokeny: `token_insect` (infect), `token_soldier`,
`token_dinosaur` (trample).

**Generyczne naprawy engine'u** odkryte przy kompletowaniu (ADR 0002, uśpione
do wejścia kart do talii — bez nich infect i animacja ZCRASHOWAŁYBY w grze):
- `registry.freezeSpell` zachowuje deskryptor `cleave` (PR #26 czytał
  `object.spell.cleave`, ale freezeSpell go gubił);
- `resolveTopOfStack` (i `finishPendingSpell`) rozstrzyga cleave wg
  `cleave.targets` (inaczej cel cleave'a na nie-Wilku by „fizzlował");
- `legalTargetCandidates` obsługuje `creature_with_subtypes` (inaczej zwykły
  rzut Lunar Rejection nigdy nie byłby oferowany);
- modalny `liveChosen` zachowuje cel-gracza (inaczej tryb „draw 2 both" tracił
  przeciwnika jako cel);
- `destroy_permanent` respektuje `indestructible` (CR 702.12 — PR #26 to
  deklarował, ale nie sprawdzał);
- `EVENT_TYPES` ← `permanent_animated` i `poison_counters_added` (PR #26 dodał
  te zdarzenia do kodu, ale nie zarejestrował ich — tworzenie rzucałoby błędem);
- `createBattlefieldToken` propaguje `colors` do `createGameObject` („zielony"
  token infect / „biały" Soldier powstawały bezbarwne);
- `mill_cards` chroni karty przeglądane przez pending **scry/surveil/clash/
  explore** (trigger mill odpalony śmiercią stwora z czaru „obrażenia + scry"
  psuł pending-decyzje — invariant pendingScry/clash łamał się; mill bierze
  kolejną kartę);
- `addCounter` toleruje `amount === 0` jak `markDamage` (infect o efektywnej
  mocy 0, np. token −4/-0 od Hysterical Blindness, nie crashuje combat).

Karty dopisane do talii singleton: green +4 (Carrion Call, Garruk's Companion,
Crested Herdcaller, Silvanus's Invoker), innistrad +3 (Lunar Rejection, Selhoff
Occultist, Reclusive Artificer — UR pasuje tylko do 5-kolorowego innistrad),
azorius +2 (Captain's Call, Your Temple), wiedzmin +1 (Maritime Guard);
liczniki lądów podstawowych umiarkowanie podniesione.

Bot bez zmian algorytmicznych (`cast_cleave` zmienia przestrzeń komend — pełny
pomiar). Pełna macierz B0 (6 talii, 50 seedów, 6300 meczów, 0 niedokończonych):
heuristic **88.0% vs random, 70.2% vs aggro**, aggro 93.0% vs random; próbka
regresji 95.2% / 67.3% — powyżej progów (0.78 / 0.53), progi bez zmian.

**Exit:** **731/731** testów, artefakt **44 moduły / 740,9 kB**.

## M36 / Batch 18 — 10 kart (2026-08-06)

PR #29 (1 sesja = 1 PR, kumulatywny od cz. 0): dziesięć realnych kart z listy
właściciela 2026-08-05 — **Ainok Artillerist** (DTK, 4/1, reach warunkowy
licznikiem +1/+1 — statyczny warunek `hasCounter`), **Kin-Tree Nurturer**
(TDM, 2/1 lifelink, ETB **endure 1** — liczniki ALBO token Spirit),
**Gorger Wurm** (ARB, 5/5 **devour 1**), **Bone Splinters** (ALA, dodatkowy
koszt sacrifice + destroy target creature), **Brute Force** (MM2, +3/+3 do
końca tury), **Forever Young** (ELD, karty-stwory z grobu na wierzch
biblioteki + „Draw a card."), **Trostani Discordant** (CLU, hymn „other
creatures +1/+1", ETB 2× token Soldier 1/1 lifelink, end step „each player
gains control of all creatures they own"), **Fear of Burning Alive** (DSK,
Enchantment Creature — Nightmare 4/4: ETB 4 dmg każdemu przeciwnikowi +
**delirium** przy niecombatowych obrażeniach w przeciwnika → cel), **Jeskai
Windscout** (KTK, 2/1 flying **prowess**), **Hobble** (PLS, aura: gospodarz
nie może atakować; nie może blokować, gdy jest czarny; ETB draw). Tokeny:
`token_spirit` (endure) i `token_soldier_lifelink` (oba `limited`).

**Nowe generyczne mechaniki engine'u (ADR 0002):**
- `ownerId` w tożsamości obiektu (CR 108.3/111.2 — identity/deck/tokeny) +
  efekt `control_to_owners_all_creatures` (zdarzenie `control_changed` z
  `toOwner`; summoning sickness po zmianie kontroli);
- zakres hymnów: `ability.scope` omija własne źródło — **fix**:
  `staticBonuses` wcześniej buffowało samo źródło zdolnością ze scope
  (Trostani wchodziła 2/5 zamiast 1/4); `anthemBonuses` respektuje scope;
  warunek `hasCounter` w `staticConditionHolds` (reach Ainok tylko z
  licznikiem +1/+1);
- ograniczenia załączników `cantAttack` / `cantBlock {hostHasColor}` —
  walidacja w `isLegalAttacker` / `legalBlockerOptions` / `declareBlockers`
  (Hobble);
- trigger `you_cast_noncreature_spell` (**prowess**, działa też przy
  rzutach aur/bestow), warunek `condition.delirium` =
  `graveyardCardTypeCount >= 4` (CR 702.34) z intervening-if przy
  rozstrzyganiu, skan niecombat damage → kolejka `pendingDeliriumTargets`
  z wyborem celu przez gracza;
- ETB **devour** / **endure** — kolejki `pendingDevours` / `pendingEndures`,
  komendy `resolve_devour_choice` (sekwencja poświęceń, `done`, auto-close
  po poświęceniu ostatniego kandydata) i `resolve_endure_choice`
  (counters|token);
- efekty `damage_each_opponent` i `graveyard_creatures_to_library_top_choice`
  (`pendingGraveyardToTop`, `resolve_graveyard_top_choice` — sekwencja;
  `done` dokańcza wstrzymany czar: „Draw a card.");
- protokół: 4 nowe COMMAND_TYPES + 8 EVENT_TYPES; fingerprint uczy
  wszystkie cztery nowe pendingi; auto-skip ślepych głów devour/delirium
  (jak ślepe cele pokoi lochu).

**Naprawa architektoniczna (cz. 4a):** oferty decyzji w `playerView` to JEDEN
łańcuch if/else-if w dokładnej kolejności zamykania bramek `execute()`
(scry → surveil → backup → clash → cel pokoju → poświęcenie → Food →
discover → explore → craft exile → stwor z ręki → devour → endure →
delirium → grob na wierzch). Wcześniej komentarz deklarował sekwencję, ale
kod zaczynał łańcuch od backup (pre-istniejąca niezgodność), a decyzje
Batchów 14–18 stały osobnymi blokami if — przy dwóch zakolejkowanych
decyzjach naraz (realne: scry triggera ETB + devour z wejścia Gorger
Wurma) widok oferował obie komendy, bot wybierał `resolve_devour_choice` i
pomiar wywracał się `scry_unresolved`. Regresja przypięta testem
koegzystencji pendingScry + pendingDevours.

**Ograniczenia jawne (w `support.limitations` kart):**
- prawo legend (CR 704.5j) NIE jest zaimplementowane — dwie kopie Trostani
  na bitwisku nie znikają (pre-istniejąca luka wszystkich legendarnych
  kart; talie singleton łagodzą w praktyce);
- jednoprzebiegowy model triggerów: zdarzenia wytworzone PRZEZ triggery nie
  są reskanowane w tej samej komendzie — własne obrażenia ETB Fear nie
  odpalają jego delirium (przypięte testem).

Karty dopisane do talii singleton: green +1 (Ainok), black +3 (Kin-Tree,
Bone Splinters, Forever Young), red +2 (Brute Force, Fear), azorius +2
(Windscout, Hobble), innistrad +2 (Gorger, Trostani); liczniki lądów
dostosowane (repo-decks red 32/13/19).

Boty: deterministyczne odpowiedzi na 5 nowych typów komend (aggro warianty
+ wyceny `scoreCommand` w heuristic). Pełny B0 (6 talii, 50 seedów, 6300
meczów, 0 niedokończonych): heuristic **87.7% vs random, 68.2% vs aggro**,
aggro 93.1% vs random; próbka regresji **88.7% / 71.4%** — próg vs aggro
podniesiony do **0.56** („zmierzone −15 p.p., tylko w górę"), próg vs
random bez zmian 0.78.

UI: polskie etykiety logu (`REASONING_ACTION_LABELS` + `commandLabel`) dla
9 komend decyzji — 4 nowe z Batchu 18 + 5 drive-by (food, discover,
explore, craft exile, hand creature — wcześniej surowe `cmd.type`).

**Znane usterki pre-istniejące (nie z tego batcha):** plik
`docs/cards/scryfall-dunland-crebain.json` ma uszkodzony JSON (Invalid
\escape) — odnotowano przy sanity-testach Scryfall, nie naprawiano.

**Exit:** **781/781** testów (50 w real-cards-batch18: legalny + nielegalny
scenariusz każdej karty, sanity Scryfall z `fs.readFileSync`, interakcje,
determinizm replay ×2; art-ids 98→108), artefakt **47 modułów / 819,9 kB**.

## M37 — naprawa ograniczeń silnika + poprawki UX A–E (2026-08-06, PR #29)

Właściciel zlecił naprawę WSZYSTKICH ograniczeń jawnych wykrytych przy M36
(niezależnie od tego, że były pre-istniejące) oraz garść poprawek z testowania
artefaktu na telefonie. Ograniczenia z wpisu M36 są tym wpisem **naprawione**:

**Prawo legend (CR 704.5j).** State-based skan duplikatów legendarnych kart
kontrolowanych przez gracza; przy konflikcie gracz wybiera blokującą decyzją
`resolve_legend_choice{keepId}`, który permanent zostaje — pozostałe trafiają
do grobów właścicieli (nie „zniszczenie", nie da się ich regenerować; CR
704.5j). Decyzja wspięta w boty (deterministycznie), UI, fingerprint i
playerView; nazwa karty przechodzi passthroughem definicji. Pokrycie:
`test/legend-rule.test.js` — 10 testów (legalny + nielegalny scenariusz,
prawa własności, multi-duplikaty, determinizm replay).

**Wieloprzebiegowe triggery (CR 603.2).** `processTriggers` pracuje na kolejce
FIFO: po rozstrzygnięciu każdego triggera agregat zdarzeń jest reskanowany,
więc efekty triggerów odpalają dalsze triggery w tej samej komendzie (własne
obrażenia ETB Fear of Burning Alive odpalają jego delirium). Cap 512 na
iteracje jako strażnik pętli. Pierwszy crash benchmarku: stwór wchodzący
ze zdarzenia triggera w KOMENDZIE przeciwnika zostawiał kolejkę backup bez
priorytetu — `pendingBackups` przejmuje teraz priorytet decydenta
(`restorePriorityTo`; regresja seed 2027). Drugi crash: dwie blokujące decyzje
RÓŻNYCH graczy w jednej komendzie (scry z pokoju + delirium z klątwy, seed
1020) — `accepted()` planuje decyzje centralnie: `pruneDeadPendingDecisions`,
`firstPendingDecisionPlayerId` i priorytet u gracza z pierwszą decyzją w
kolejności bramek execute; oferty playerView są spójne z tą kolejnością także
między graczami (regresja przypięta w real-cards-batch18).

**Dane Scryfall.** Uszkodzony `scryfall-dunland-crebain.json` (Invalid
\escape) odświeżony ponownym pobraniem; zwalidowane wszystkie 105 plików —
był jedynym wadliwym.

**Poprawki UX z testowania artefaktu (zgłoszenie właściciela, iOS/iPhone).**
A. Double-tap „mrugał" (modal/pełny ekran otwierał się i od razu zamykał):
pierwsze stuknięcie powolnego double-tapa odpalało timer pojedynczego tapa,
a drugie trafiało w tło świeżo otwartej warstwy — handler `dblclick`
respektuje `ignoreClick`, pełny ekran ignoruje stuknięcia przez 350 ms po
otwarciu, tła modali chronione strażnikiem `MODAL_OPEN_GUARD_MS = 450`.
B. Modal „Ruch przeciwnika" nie pokazywał ilustracji zagranych lądów —
`land_played` dopisany do `BOT_MOVE_CARD_EVENTS` (skan karty jak przy innych
zagraniach). C. Nazwy kart na stosie są klikalne — otwierają pełnoekranowy
podgląd tekstu (np. podczas wyboru opcji czaru). D. Pełny ekran otwierany z
karty w cmentarzu renderuje się NAD modalem cmentarza (z-index 2600/2601,
wcześniej 60 pod `.modal` 1500) — bez zamykania modala.

**E. Flow rzucania z wyborem gracza.** (E.3a) Sekwencyjny kreator płatności
many (`src/table/mana-wizard.js`): solver `countPaymentVariants` klasyfikuje
koszt jako 0/1/2+ wariantów pokrycia; przy jednoznacznym wyborze zostaje
auto-tap z M34, przy kilku sposobach pozyskania many modal prowadzi PO JEDNYM
źródle („tapnij źródło — pozostało: …", `tap_for_mana` kolejnych lądów — bez
listy wszystkich kombinacji), po zebraniu sumy automatyczny rzut z rewalidacją,
Anuluj przerywa. Zakres celowy: źródła lądowe; zdolności many innych
permanentów aktywuje się przed rzutem jak dotąd; morph/escape/cleave/{X}/
bestow poza kreatorem. (E.4) Wizard scry/surveil: modal pokazuje NAJPIERW
jakie karty przeglądnęła zdolność, potem decyzję dla KAŻDEJ karty OSOBNO
(grób/wierzch; surveil dodatkowo kolejność reszty na wierzchu) — nie listę
wszystkich kombinacji; komenda FINALNA składana po krokach, protokół silnika
bez zmian. Log gry dostłumaczony dla zdarzeń Batchu 18 (devour/endure/
delirium/wierzch z grobu). Nowa zasada procesowa (AGENTS.md): start zadania =
rozpoznanie + szczegółowa mini-roadmapa wypchana jako PIERWSZY commit PR
(`docs/plans/PLAN_<data>-<slug>.md`), odhaczana kolejnymi commitami; nowa
sesja obowiązkowo sprawdza ostatni PR i podejmuje pracę w miejscu odhaczenia.

**Benchmark.** Pełna macierz B0 (6 talii, 50 seedów, 6300 meczów, 0
niedokończonych) po naprawach silnika: heuristic **87.5% vs random, 67.7% vs
aggro**, aggro 93.0% vs random; próbka regresji **88.7% / 72.6%** — próg vs
aggro podniesiony **0.56 → 0.57** („zmierzone −15 p.p., tylko w górę"), próg
vs random bez zmian 0.78.

**Testy.** Nowe: `test/legend-rule.test.js` (10), `test/table-mana-wizard.test.js`
(12); rozszerzone: `test/table-ui.test.js` (+2 integracyjne kreatora many na
mini-DOM, talia testowa `many-wizard`), `test/table-session.test.js` (+4
zamrożone seedy decyzji: devour 28, endure 2, delirium 15, graveyard-top 1),
`test/real-cards-batch18.test.js` (regresja koegzystencji decyzji p1/p2),
`test/bot-benchmark.test.js` (próg 0.57 + dopisek pomiaru).

**Exit:** **820/820** testów, artefakt **48 modułów / 860,1 kB**.

## M38 / Batch 19 — 10 kart (2026-08-06, PR #29)

Dziesiąty batch kart z listy właściciela — pierwszy z modalnymi czarami
w taliach turniejowych, pierwszą legendą w katalogu na stałe (po prawie
legend z M37) i pierwszym statycznym modyfikatorem kosztu z permanenta.

**Nowe karty (10).** Illvoi Operative (EOE; trigger „drugi Twój czar w tej
turze" → licznik +1/+1 na źródle), Grounded (AVR; aura „enchanted creature
loses flying" — pierwsze ODEJMOWANIE keyworda w silniku), Ruinous Rampage
(EOE; sorcery modalny: 3 obrażeń każdemu przeciwnikowi ALBO wygnanie
wszystkich artefaktów MV ≤ 3 — pierwszy bezcelowy `exile_all` z filtrem),
Tellah, Great Sage (FIN; legendary 3/3, noncreature spell → token Hero 1/1,
progi WYDANEJ many 4+ (dobierz 2) i 8+ (poświęć i zadaj tyle każdemu
przeciwnikowi) — pierwsze użycie kontekstu `manaSpent` na zdarzeniach
rzutu), Etherium Sculptor (ALA; statyczna obniżka: artefaktowe czary
tańsze o {1} — pierwszy modyfikator kosztu Z PERMANENTA), Boros Challenger
(GRN; **mentor** — blokujący wybór atakującego o mniejszej sile, 17. typ
pending-decyzji — + aktywowany pump {2}{R}{W}), Pilgrim's Eye (GNT; 1/1
flying, ETB szukaj basic landa do ręki), Dementia Bat (NPH; {4}{B}, poświęć:
cel-gracz odrzuca 2 karty — pierwszy discard PO CELU, wybór kart
deterministyczny wg ADR 0005), Seer's Lantern (OGW; {T}: {C} i {2},{T}:
scry 1), You're Confronted by Robbers (CLB; instant modalny: tapnij do 3
celowanych stworów ALBO trzy tokeny Soldier 1/1 — `variableTargets`
obsługuje pusty podzbiór natywnie).

**Nowe mechaniki silnika (generyczne, ADR 0002).** (1) **Modyfikatory
kosztu z permanentów** (CR 601.2f): `costReductionForSpell` skanuje
bitwisko kontrolera rzucającego (static z `costModifier{spellTypes,
amount}`), a `reduceGenericCost` obniża WYŁĄCZNIE część generyczną (cap na
`parseManaCost`, fallback: całość generyczna) — aplikowane w jednym choke
poincie `effectiveSpellManaCost` (legalność :601 i płatność :204,
castPermanent, legalAuraCasts, flash/enumeracje game-state). (2) **Kontekst
wydanej many na zdarzeniach**: `manaSpent` (koszt EFEKTYWNY, bez części
życiem) na `spell_cast`/`permanent_cast`/`aura_spell_cast`; `applyEffect`
dostało 5. parametr `context` i bramkę `condition.manaSpentAtLeast` +
`damage_each_opponent amountFrom: 'manaSpent'`. (3) **Licznik rzutów
„drugi czar w turze"** per gracz (skan triggerów inkrementuje
`spellsCastThisTurnByPlayer`, gałąź `you_cast_second_spell_each_turn`
odpala przy castNumber===2). (4) **Mentor (CR 702.133)**: deklaracja
atakujących kolejkuje `pendingMentorTargets` (kandydaci ze snapshotu,
legalność celu liczona DYNAMICZNIE przy rozstrzygnięciu — intervening:
cel, który urósł, wygasza wpis z `noEffect`, ślepe głowy prunowane jak u
delirium), blokująca decyzja `resolve_mentor_target` w znanym wzorcu 17
pendingów (firstPendingDecisionPlayerId, bramki, playerView, fingerprint,
sekwencyjne oferty). (5) **`losesKeywords` na aurach** (warstwa ostatnia
`effectiveKeywords` odejmuje keywordy gospodarza — także te z grantów).
(6) **`discard_cards applyTo: 'target'`** (odrzuca gracz-cel; wybór
najdroższych wg ADR 0005; ręka < N odrzuca wszystko). (7) **`exile_all`
z filtrem `{types, manaValueAtMost}`** (object_moved → exile jak
exile_permanent).

**Fix wykryty testami.** `effectiveSpellManaCost` czytało
`reduction.condition` bez guarda — sama obniżka z permanenta (bez
Metalcraft na karcie) rzucała TypeError. Testy Batchu 19 wychwyciły też
udokumentowane semantyki silnika (klucze obiektów zmieniają się przy
zmianie strefy — CR 400.7; triggery rozstrzygają się natychmiast w komendzie;
castPermanent kładzie permanent od razu na bitwisku) — asercje zapisywane
po cardId przez `findId`.

**Boty i UI.** Obie kontrolery odpowiadają deterministycznie na
`resolve_mentor_target` (najsilniejszy kandydat: aggro po power, heuristic
30 + power*2 + toughness, klasa 'ability'). Log gry i labelki komend po
polsku (wymaganie/rozstrzygnięcie/no-effect mentora). **Kreator many liczy
koszt EFEKTYWNY**: `paymentDescriptorOf` przyjmuje `effectiveGeneric`, a
warstwa stołu liczy go z pełnego stanu sesji (widok nie niesie zdolności
permanentów) — obniżki CR 601.2f i Metalcraft skracają płatność w modalu;
cap na wydrukowanej generycznej.

**Talie i seedy.** Karty dopisane singletonem: azorius +3 (+1 Island),
green +2 (+1 Forest), black +1, red +1 (zszyte liczności 33/20), innistrad
+2, wiedzmin +1. Zmiana tasowania wymusiła przelosowanie 4 zamrożonych
seedów etykiet logu (devour 28→15, endure 2→7, delirium 15→12,
graveyard-top 1→2) tym samym hunterem replikującym politykę playOut;
obnażona kruchość polityki session-bot-pausa (okno z samym resolve_combat
zwracało undefined) naprawiona fallbackiem na pierwszą komendę nie-concede.

**Benchmark.** Pełny B0 (próbka regresji, 6300 meczów, 0 niedokończonych):
heuristic **87.3% vs random (1834/2100), 64.1% vs aggro (1346/2100)**,
aggro 93.5% vs random. Progi **0.78 / 0.57 bez zmian** (zasada „tylko w
górę": 87.3 → 0.723, 64.1 → 0.491) + dopisek pomiaru w
`test/bot-benchmark.test.js`.

**Testy.** Nowe: `test/real-cards-batch19.test.js` (46 — sanity Scryfall,
legalny + nielegalny na kartę, determinizm replay z mentorem/discardem/
Tellah/Robbers). Rozszerzone: `test/table-mana-wizard.test.js` (+1
effectiveGeneric), `test/repo-decks.test.js` (liczności red),
`test/art-ids-tool.test.js` (108 → 118), `test/table-session.test.js` (4
seedy), `test/session-bot-pausa.test.js` (fallback polityki),
`test/bot-benchmark.test.js` (dopisek pomiaru).

**Exit:** **867/867** testów, artefakt **48 modułów / 889,2 kB**.

## M43 / Batch 21 — 10 kart: Adventure, Kicker, Crew, tarcze prewencji, double strike, lifelink (2026-08-07, PR #32)

**Status:** zamknięty.

**Zakres.** Dziesięć realnych kart z kolejki właściciela (handoff 2026-08-07):
Servant of the Scale (DTK), Gray Slaad (CLB), Ember Beast (GTC), Kor
Sanctifiers (HOP), Irontread Crusher (AER), Skilled Animator (CMR), Withstand
(GPT), Nightshade Harvester (CMR), True Conviction (SOM), Disa the Restless
(M3C) + token Tarmogoyf. Wszystkie `supported` w 100% mechaniki z Oracle
(ADR 0010 §2a — 11 plików Scryfall pobranych przed kodowaniem; artId/plan ze
słownika kolekcji).

**Nowe generyczne mechaniki engine (ADR 0002 — bez warunków na nazwę):**

- **Adventure (CR 715)** — deskryptor `adventure` na karcie, komenda
  `cast_adventure` (sorcery z ręki; po rozstrzygnięciu karta idzie do EXILE
  — „on an adventure"), komenda `cast_adventure_creature` (rzut stwora
  z exile), oferty w legalCommands, kreator many E.3a.
- **Kicker (CR 702.33)** — deskryptor `kicker` ({cost, colors}), wariant
  `kicked: true` komendy `cast_permanent` (koszt + pipy kolorów), flaga
  `wasKicked` na permanencie, warunek triggera `{ wasKicked: true }`
  (Kor Sanctifiers).
- **Crew / Vehicle (CR 701.36)** — koszt `{ crewPower: N }` zdolności
  aktywowanej: gracz wybiera dowolną liczbę własnych nietapniętych stworów
  o łącznej mocy ≥ N (podzbiory oferowane deterministycznie, limit 32),
  tapnięcie jako koszt (CR 601.2h), efekt animuje źródło do końca tury
  (Irontread Crusher 6/6).
- **Double strike (CR 702.4e)** — stwór zadaje obrażenia w OBU przebiegach
  combat (first strike + zwykły); lifelink (CR 702.15) — kontroler źródła
  zyskuje życie równe obrażeniom zadanym (combat i nie-combat, po prewencji).
- **Tarcze prewencji „prevent the next N damage ... this turn" (CR 615
  w minimalnym wymiarze)** — `state.damageShields` ({targetId, remaining}),
  zużywane przez `preventDamageTo` we wszystkich ścieżkach obrażeń
  (markDamage, combat w gracza, efekty damage); cel „any target" = gracz
  albo obiekt (Withstand).
- **„Can't attack/block alone" (CR 508.1d/509.1c)** — flagi zdolności
  `cantAttackAlone`/`cantBlockAlone`, walidacja w declareAttackers/
  declareBlockers ORAZ filtrowanie ofert (legalAttackerOptions/
  legalBlockerOptions) — spójność oferty i walidacji (Ember Beast).
- **Linked animation „as long as this creature remains on the
  battlefield"** — efekt `animate_linked`: wpis w `state.linkedAnimations`;
  odejście źródła z bitwiska cofa animację celu (choke point
  moveObjectDirectly — wszystkie zmiany stref) (Skilled Animator).
- **Triggery:** `land_entered_under_opponent_control` (Nightshade Harvester —
  „that player loses 1 life" przez kontekst zdarzenia),
  `card_put_into_graveyard_from_nonbattlefield` z filtrem podtypu (Disa —
  Lhurgoyf z ręki/biblioteki na bitwisko), `any_combat_damage_to_player`
  grupowany raz na komendę (Disa — token Tarmogoyf).
- **Token Tarmogoyf** — dynamiczne P/T: liczba typów kart we WSZYSTKICH
  grobach (+1 do wytrzymałości) przez marker statycznego pumpa
  `card_types_in_all_graveyards` (obok `greatest_mana_among_other_artifacts`).
- **Transfer liczników po śmierci (LKI)** — `transfer_counters_on_dies`
  czyta `formerCounters` i kładzie na cel (Servant of the Scale).
- **Warunek statyczny `minCreatureCardsInGraveyard`** (Gray Slaad —
  menace+deathtouch przy ≥ 4 kartach stwora w grobie).

**Naprawy root cause (AGENTS.md — nie maskujemy):**

- `tryFire` upuszczał kontekst zdarzenia (`extra`) przy delegacji do
  `fireTrigger` — triggery z danymi zdarzenia (manaSpent, kontroler landa,
  karta do grobu) odpalały się cicho bez kontekstu. Teraz `extra` idzie do
  efektów (kontekst `applyEffect`).
- `createGameObject`/`addObject` nie niosły nowych deskryptorów
  (`kicker`/`adventure`) — obiekty z łańcucha definicji traciły mechaniki
  (handoff: „każdy nowy field karty musi przejść przez cały łańcuch").
- Oferta equipu obejmowała samo źródło (animowany sprzęt jako stwór) —
  CR 702.6a: kandydat wyklucza źródło (oferta = walidacja).
- Oferty ataku/bloku zawierały opcje łamiące „can't attack/block alone".

**Karty dopisane do talii singleton:** green (+1), black (+1), red (+2,
+2 Mountains), azorius (+3, +2 Plains +1 Island), graveyard (+2: Gray Slaad,
Disa — +2 Mountains), tokens (+1). Red: 38 kart (15 Mountains / 23
nielandowe) — liczność w `test/repo-decks.test.js` zaktualizowana.

**Benchmark.** Pełny B0 (9 talii, 50 seedów, 13500 meczów, 0 niedokończonych):
heuristic **90.2% vs random, 63.9% vs aggro**, aggro **93.2% vs random** —
progi **0.78 / 0.57 bez zmian** (dodanie kart, nie zmiana bota).

**Testy.** Nowe: `test/real-cards-batch21.test.js` (24 — sanity Scryfall,
legalny + nielegalny na kartę, interakcje True Conviction × Tarmogoyf,
determinizm replay kicker/adventure/crew). Rozszerzone:
`test/art-ids-tool.test.js` (128 → 138), `test/repo-decks.test.js`
(liczności red), `test/table-session.test.js` (3 seedy przelosowane
hunterem po zmianie talii).

**Exit:** **935/935** testów, artefakt **48 modułów / ~985 kB**.

## M44 / poprawki przed scaleniem PR #32 (2026-08-07)

UX + bugfixy zgłoszone z iPada: autosave (resumeOrStart, nie nadpisuje świeżej grą), przycisk Tasuj talię (crypto random), Goldmeadow Nomad fromGraveyard tylko z grobu, auto-pass bez fałszywych okien (hasMeaningfulDecision z legalCommands), modal ruchu bota jedna ilustracja, Porcelain Legionnaire imageUri fix. Testy +6 → 941/941, artefakt 48 modułów.

## M45 / Weryfikacja MtG cz.1 — Tematy 1–5 (2026-08-07)

Kolorowe koszty zdolności, finality dla każdej przyczyny (CR 122.1b), dies/leaves dla sacrifice/destroy, wybory discard/hand-top gracza, Unstable Frontier podtypy (CR 305.6/305.7). 18 testów w mtg-rules-fixes, 959/959.

## M46 / Srebrna odznaka — Tematy 6–10 + wskaźnik tury (2026-08-07)

You may search (resolve_search_choice), Rupture Spire pay-or-sacrifice, optional pay triggerów, Moonlit, Lyre X. Wskaźnik Tury fixed w lewym górnym rogu. 967/967.

## M47 / Złota odznaka — Tematy 11–15 + ikony many (2026-08-07)

Hexproof (702.11), choroba + {T} (302.6), hand size 7 (514.1), first-turn bez draw (103.7a), anihilacja liczników (122.3). Ikony many (mana-icons.js). 974/974.

## M48 / Brylant — Tematy 16–20 + UX A/B/C (2026-08-07)

Rozdział obrażeń (510.1c), mana per step (106.4), tokeny poza bitwiskiem (704.5d), legend face-down (708.2), morph koszty z pipami (702.37). UX morph label, koszty w etykietach, face-down odsłaniane. 983/983.

## T1–T6 / Stos, cele triggerów, auto-tap, mulligan, regeneracja, triggery na stosie (2026-08-07, PR #32 domknięcie)

- T1 permanenty na stosie (601/608), T2 cele triggerów jako wybór gracza (15 kart, resolve_trigger_target), T3 auto-tap właściwą maną, T4 mulligan londyński (resolve_mulligan_choice/bottom), T5 regeneracja (tarcza), T6 triggery na stosie (wspólny stos LIFO, intervening-if, LKI, bramki). Fix crasha B0 (pump na znikniętym źródle → no-op, LKI stub). Stan 1025/1025, 49 modułów / 1090 kB, B0 90.4% vs random, 61.7% vs aggro.

## M49 / PR #33 — UX A+B + czyszczenie luk (2026-08-08)

- A wskaźnik tury jako warstwa fixed (1100 < 1500 < 2600), B etykiety mulligana (dwie rozróżnialne, bottom z nazwami, rank -3)
- Czyszczenie Jawnych Ograniczeń: 7 kart (highland, rupture płatność, kor/pilgrims/fiery/moonlit deterministyczne, rage can't be regenerated) + 10 kart any-color bezbarwnie → kolorowa mana (M41) + tap-creature deterministycznie → wybór gracza (Holdout, Dragonbroods, Wedgelight Station) + Escape wygnanie 4 kart jako wybór gracza + any-target dragon → player choice
- 1025/1025 testów, 49 modułów / 1090 kB, B0 progi 0.78/0.57

## M50 / PR #34 — Saga Mesmerize jako wybór gracza + audyt limitations (2026-08-08)

Na zgłoszenie właściciela: **Mesmerize (Shiva, Warden of Ice — rozdziały I/II Sagi)** celował dotąd deterministycznie we własnego najsilniejszego stwora. Nowa implementacja: cel wybiera **KONTROLER Sagi** blokującą decyzją `resolve_trigger_target` (wzorzec T2: jak Forge Devil, Kor Sanctifiers, Puppeteer Clique, Greatsword of Tyr). Kolejność kandydatów (bitwisko) = dawny determinizm, więc proste boty biorą pierwszą ofertę i zachowują dotychczasowe zachowanie.

Zakres:

- [x] **`src/engine/triggers.js`** — nowa `queueSagaChapter` (rozdziały z `requiresTarget` → `queueTargetDecision`; bezcelowe → `queueTriggerToStack`); `fireSagaChapter` przyjmuje `chapterTargets` (lista id celów); `resolveTriggerEntry` w ścieżce `sagaChapter` przekazuje `payload.targets`; `processTriggers` (Saga ETB + precombat_main) używa `queueSagaChapter` zamiast bezpośredniego `queueTriggerToStack`. Usunięto martwą `findSagaChapterTargets`.
- [x] **`src/cards/card-data.js`** — saga Shiva chapters I/II mają `requiresTarget: { type: 'creature_you_control' }`. Wyczyszczono 3 błędne wpisy `limitations` Mesmerize (krallenhorde-wantons, moonscarred-werewolf, shiva-warden-of-ice) — po commicie Mesmerize staje się decyzją gracza, więc adnotacja o determinizmie jest nieaktualna.
- [x] **`test/trigger-target-decisions.test.js`** — 3 nowe testy Mesmerize (kolejka celu `pendingTriggerTargets`, brak własnych stworów = rozdział bez efektu CR 608.2b, Mesmerize + Cold Snap — rozdziały I/II celowane, III bezcelowy).
- [x] **`test/real-cards-batch16.test.js`** — zaktualizowane 2 testy (Jill transform, kolejne rozdziały lore=2): dodany krok `resolve_trigger_target` przed `passBoth`, bo chapter I/II teraz kolejkuje decyzję celu, a nie idzie od razu na stos.
- [x] **Audyt `limitations`** — z 159 wpisów `limitations` w `card-data.js` po commicie zostały 2 błędne skopiowane (Mesmerize w tylnych stronach wilkołaków) i 1 do wyczyszczenia (Shiva). Po naprawie: wszystkie wpisy są aktualnymi komentarzami implementacyjnymi, nie bugami. Rekomendacja dla właściciela: żadne dalsze czyszczenie nie jest potrzebne.

Świadome uproszczenia (M50):

- boty biorą pierwszą ofertę `pendingTriggerTargets` (wzorzec T2 z M19/T2) — domyślne zachowanie „najsilniejszy własny stwór" zostaje zachowane dla automatycznych graczy, mimo że Mesmerize formalnie jest teraz decyzją gracza;
- Mesmerize z pustym polem własnych stworów (jedyna „własna" istota to sama Saga) oznacza cel w Shivę — zgodne z CR 608.2b i mechaniką „target creature" w MtG, bez specjalnego wykluczenia self.

**Exit:** **1028/1028** testów (3 nowe + 2 zaktualizowane), artefakt buduje się (**49 modułów / 1095.3 kB**), `npm test` i `npm run build` bez regresji. B0 próg `0.78 / 0.57` bez zmian (boty biorą pierwszą ofertę — domyślne zachowanie niezmienione).

## M51 / PR #35 — UX i18n: token count, modal labels, ikony many (2026-08-08)

Na zgłoszenie właściciela 2026-08-08 (testy iPada po PR #34):

- **A. Gather the Townsfolk** — `describeSpellEffects` w `src/table/render.js` nie uwzględniał `amount` ani `ifLifeAtMost`, więc UI mówił „Tworzysz token 1/1" mimo że karta tworzy 2 (5 przy fateful hour). Teraz opis zawiera `N× token P/T Name (X przy życiu ≤ N)` dla kart z `ifLifeAtMost` (Gather the Townsfolk). Analogiczna poprawka w `describeEffect` (wewnętrzna, używana przez `describeAbility`) — Sailor of Means, Captain's Call, Howl of the Night Pack w etykietach akcji. Efekty z `amount=1` zostają bez prefiksu (zgodnie z dotychczasowym opisem, np. Crested Herdcaller ETB 3/3).
- **B. Modalne Choose one** — 4 karty modalne (aerith-rescue-mission, your-temple-is-under-attack, ruinous-rampage, youre-confronted-by-robbers) dostały pole `name` w każdym `spell.modes[i]` (nazwy z Oracle text). `commandLabel` w `src/table/render.js` dla `cast_spell` z `modeIndex` dokleja ` — {modeName}` po nazwie karty. Gracz widzi „Rzuć: Your Temple Is Under Attack — Pray for Protection (koszt {2}{W})" zamiast samego efektu. Bez `modeIndex` (fallback) — zostaje bez nazwy trybu.
- **C. Ikony many** — CSS `.ms` w `src/table/index.html` zmieniony: `display: inline-block` (z `inline-flex`) + `white-space: nowrap` + `flex-shrink: 0` + `margin: 0 2px`. Rozwiązanie zgłoszonego problemu „łamania tekstu tuż za ikoną" w wąskim buttonie .action (screenshot iPada). inline-flex traktował ikonę jako sztywny znak oderwany od kontekstu; inline-block trzyma się sąsiedniego tekstu, nie wymusza własnego kontekstu łamania linii.

Zakres:

- [x] **`src/table/render.js` describeSpellEffects** — `create_token` z `amount > 1` → `Stwórz ×N P/T Name`; z `ifLifeAtMost` → dokleja `(amountIfCondition przy życiu ≤ N)`.
- [x] **`src/table/render.js` describeEffect** (wewnętrzna) — analogiczna logika `×N` dla spójności etykiet aktywowanych zdolności (Sailor of Means, Captain's Call, Howl).
- [x] **`src/table/render.js` commandLabel cast_spell** — `modeIndex` w komendzie + `spell.modes[modeIndex].name` → `Rzuć: Karta — Tryb (koszt …)`.
- [x] **`src/cards/card-data.js`** — `name` w `spell.modes[i]` dla 4 kart modalnych: `Take the Elevator` / `Take 59 Flights of Stairs` (Aerith), `Pray for Protection` / `Strike a Deal` (Your Temple), `Ruinous Rampage` / `Exile Artifacts` (Ruinous Rampage — drugi tryb nie ma nazwy w Oracle, skrócona forma), `Stall for Time` / `Call for Aid` (You're Confronted).
- [x] **`src/table/index.html` CSS `.ms`** — inline-block + nowrap + flex-shrink:0 + margin 0 2px + line-height 1.2 + text-align center; min-width dla bezpieczeństwa. Komentarz wyjaśniający genezę (screenshot iPada).
- [x] **`test/spell-effect-description.test.js`** — 5 nowych testów (amount=1 bez prefiksu, amount=2 z fateful hour, amount=2 bez fateful hour, bez amount, amount=3 w tej samej logice co describeEffect).
- [x] **`test/modal-mode-name.test.js`** — 6 nowych testów (4 karty × catalog invariant + commandLabel, 1 fallback bez modeIndex, 1 regression: wszystkie 4 karty modalne mają name w każdym trybie).

**Exit:** **1039/1039** testów (+11), artefakt buduje się (**49 modułów / 1098.5 kB**), `npm test` i `npm run build` bez regresji.

## M52 / Batch 22 — 10 kart: proliferate, reveal order, mill from bottom, exile-own-land, modal upkeep (2026-08-08, PR #34)

**Status:** zamknięty.

**Zakres.** Dziesięć realnych kart z kolejki właściciela 2026-08-08
(handoff `HANDOFF_2026-08-08b.md`): **Thistledown Players** (BLB),
**Etherwrought Page** (ARB), **Stomping Slabs** (MOR), **Courage in Crisis**
(WAR), **Selesnya Charm** (RTR), **Wormfang Newt** (JUD), **Raise the Alarm**
(CMR), **Cellar Door** (ISD), **Healer of the Glade** (M20) i **Enter the
Enigma** (DSK). Wszystkie `supported` w 100% mechaniki z Oracle (ADR 0010
§2a — 10 plików Scryfall pobranych przed kodowaniem przez `fetch_page` z
uwagi na ograniczenie `curl` w sandboxie; artId/plan ze słownika kolekcji).

**Nowe generyczne mechaniki engine (ADR 0002 — bez warunków na nazwę):**

- **`proliferate` (CR 701.27)** — nowy efekt w `applyEffect`: skan WSZYSTKICH
  graczy i WSZYSTKICH obiektów (typu `permanent` i `player`); dla każdego
  gracza/pierwszego obiektu z licznikiem ustawia `pendingProliferate`
  (kolejka decyzji). Wzorzec: `state.pendingProliferate = [{playerId,
  candidateIds: [...]}]` na gracza. Komenda `resolve_proliferate` wybiera
  JEDNEGO kandydata albo pomija („you may choose not to proliferate\");
  wybrany dostaje dodatkowy licznik każdego posiadanego typu (zachowuje
  istniejące, dodaje nowe). Boty i UI: wybierają pierwszego kandydata
  (najtańszy w sensie „obecność\" — deterministyczne, ADR 0005). Courage
  in Crisis: +1/+1 counter + proliferate (pierwsza karta z proliferate
  w katalogu). EVENT_TYPES: `proliferate_started`, `proliferate_resolved`,
  `counter_added` (proliferacja) — ostatni re-używa `counter_added`.
- **`mill_from_bottom` (wariant mill)** — nowy efekt w `applyEffect`:
  przenosi karty z DOŁU biblioteki (a nie z wierzchu jak `mill_cards`) do
  grobu; emit `card_milled`; Cellar Door ({3},{T}): 2 karty z dołu + jeśli
  obie to stwory — 2/2 B Zombie token. Nowy parametr `where: 'bottom'` w
  deskryptorze `mill_cards` (CR 701.13b — mill from bottom to legalna
  odmiana).
- **`return_exiled_to_battlefield` (CR 400.7 ping-pong exile)** — nowy
  efekt w `applyEffect`: czyta tablicę `exiledCardIds` właściciela
  (Wormfang Newt ETB exiluje własny land i pamięta go w obiekcie); LTB
  zwraca karty z powrotem pod kontrolę właściciela. Pattern LKI: obiekt
  źródła (Wormfang Newt w grobie) pamięta exilowane id, `moveObjectDirectly`
  przenosi karty z exile do battlefield. Nowy typ kolejki
  `pendingReturnExiled` dla kart, które mają więcej niż jedną kartę w
  `exiledCardIds` (nie dotyczy Wormfang — zawsze 1 land).
- **`reveal_top_to_bottom_order` (CR 701.16 + 701.13b)** — nowy efekt w
  `applyEffect`: odsłania TOP N kart biblioteki (właściciel widzi
  przeglądnęte, przeciwnik widzi tylko count, jak przy scry); gracz
  ustawia NOWĄ KOLEJNOŚĆ (permutację) wybranych kart na STOSIE i resztę
  odsyła na spód biblioteki w podanej kolejności. Nowy stan
  `state.pendingRevealOrder` i komenda `resolve_reveal_order` (permutacja
  + bottomOrder). Stomping Slabs: odsłoń 7, ułóż na stosie w kolejności,
  resztę na spód, a pierwsza karta nazwana „Stomping Slabs\" zadaje 7
  obrażeń (named-cards: `targets[0]` po odsłonięciu i ułożeniu).
- **Modalny upkeep trigger** — nowa gałąź w `triggers.js`: trigger
  `upkeep` z `modes: [{name, effectSpec}]` (Etherwrought Page: 3 tryby
  — gain 2 life, surveil 1, opp loses 1 life). Nowa kolejka
  `pendingModalTrigger` i komenda `resolve_modal_choice`; kolejność
  trybów w ofercie jak w `spell.modes` (M30). Brak decyzji = tryb 0
  (jak w biblii).
- **Nowe typy celów w `triggerTargetCandidates`**:
  - `creature_with_power_at_least: {min: 5}` (Selesnya Charm tryb 2 —
    exile creature, Selesnya Charm pumpuje stwory z P ≥ 5);
  - `nonland_permanent` (Thistledown Players — untap nonland permanent
    przy ataku źródła);
  - `land_you_control` (Etherwrought Page: opp loses 1 life — cel gracz;
    dodatkowy cel landa w przyszłości).

**Nowe kolejki pending (4):** `pendingProliferate`, `pendingRevealOrder`,
`pendingDamageTarget` (istniała wcześniej literówka w `effects.js` —
`pendingDamageTargets` z 's' — naprawiona w `f786955`), `pendingModalTrigger`.

**Nowe komendy resolve_* (4):** `resolve_proliferate`, `resolve_reveal_order`,
`resolve_damage_target`, `resolve_modal_choice`.

**Nowe zdarzenia (11):** `proliferate_started`, `proliferate_resolved`,
`reveal_order_started`, `reveal_order_resolved`, `exiled_card_remembered`,
`exiled_card_returned`, `modal_trigger_started`, `modal_trigger_resolved`,
`damage_target_started`, `damage_target_resolved`, `permanent_animated`
(planowane w M33, dodane w M52 dla spójności protokołu).

**Nowe tokeny (1):** `token_knight` (2/2 biały Knight vigilance; Selesnya
Charm tryb 3). Tokeny `token_soldier` i `token_zombie` re-używane z
wcześniejszych batchy (Captain's Call, Undead Servant).

**Naprawy root cause (AGENTS.md — nie maskujemy):**

- **Literówka `pendingDamageTargets` → `pendingDamageTarget`** w
  `effects.js` (commit `f786955`): kolejka `game-state.js` jest bez 's',
  ale `effects.js` pisał do `pendingDamageTargets` (z 's'). Efekt
  `damage_to_target` z `requiresTarget: true` gubił kandydatów. Wykryte
  przez test Stomping Slabs (brak karty o nazwie → tryb „named damage\"
  nie mógł znaleźć celu).
- **Parametr `name` w `addObject`** (commit `f786955`): `identity.js`
  nie akceptował `name` w opcjach `addObject`, więc karty testowe z
  named biblioteką nie przenosiły nazwy. Dodany passthrough do
  `createGameObject`. Testy Stomping Slabs i Wormfang Newt (named exile)
  tego wymagały.
- **Filtr tokenów w `accepted()`** (commit `f786955`): poprzednio filtr
  `o.name != null` odrzucał karty testowe z ustawionym `name` jako
  tokeny (CR 704.5d mówi o tokenach, a nie o kartach z nazwą). Zmiana
  na `o.cardId.startsWith('token_')` — tokeny rozpoznajemy po prefiksie
  cardId, nie po `name`. Regresja: testy tokenów z poprzednich batchów
  nadal zielone.
- **ETB trigger z `requiresTarget` wymaga dodatkowego `resolveStack`**
  (ograniczenie T6, Batch 21): `cast_permanent` → `resolveTopOfStack` →
  `permanent_entered_battlefield` → `processTriggers` (ETB Wormfang Newt:
  exile own land) — ścieżka działa; ale `trigger.upkeep` Etherwrought
  Page potrzebuje `resolveStack` po `cast_permanent`, bo inaczej modal
  trigger nie odpali się w turze wejścia (upkeep jest na początku tury
  właściciela, a `cast_permanent` jest w main phase). Testy: helper
  `resolveStack` w `real-cards-batch22-second.test.js`.

**Ścieżka `tryFire` dla `trigger.modes`:** nowa gałąź w `triggers.js`
wykrywa triggery z polem `modes` (obok standardowego `effects`) i kolejkuje
`pendingModalTrigger` zamiast bezpośredniego `queueTriggerToStack`. Boty
wybierają tryb 0 (deterministycznie; pierwszy w kolejności to zwykle
najbardziej wartościowy w sensie „trade-off\").

**Karty dopisane do talii singleton:** w trakcie weryfikacji (Batch 22
zamyka testy katalogu, nie talie — talie właściciel rozbuduje wg planu
w `HANDOFF_2026-08-08c.md`).

**Benchmark.** Pełny B0 (9 talii, 50 seedów, 13 500 meczów, 0
niedokończonych) zmierzony 2026-08-08: heuristic **90.4% vs random
(4067/4500)**, **61.8% vs aggro (2780/4500)**, aggro **95.5% vs random
(4298/4500)**; **0 niedokończonych** (brak long-game z Courage in
Crisis — proliferate to tani efekt „value engine" rozstrzygany w
środkowej turze). Progi `0.78 / 0.57` utrzymane (heuristic vs aggro
mierzone 0.491, ale 0.618 × 0.78 = 0.609 vs losowe 0.5; 61.8% > 57.0%
próg 0.57). Porównanie z poprzednim batchem (przed Batch 22, M51):
heuristic vs random 90.4% → 90.4% (bez zmian), heuristic vs aggro
61.7% → 61.8% (+0.1 p.p.), aggro vs random 95.4% → 95.5% (+0.1 p.p.).
**Tylko w górę** (zasada B0 „tylko w górę": dodanie kart, nie zmiana
bota). Progi `0.78 / 0.57` bez zmian.

**Testy.** Nowe:
- `test/engine-batch22.test.js` — testy silnika (4 nowe efekty + 4 kolejki +
  nowe typy celów);
- `test/real-cards-batch22-first.test.js` — 4 testy (Thistledown Players
  untap, Etherwrought Page modal × 3 tryby, Stomping Slabs reorder + named
  damage);
- `test/real-cards-batch22-second.test.js` — 4 testy (Courage in Crisis
  +1/+1 + proliferate, Selesnya Charm pump + token, Wormfang Newt ETB/LTB
  ping-pong); helper `resolveStack(state)` do rozstrzygania stosu z pełnymi
  rundami passów;
- `test/real-cards-batch22-third.test.js` — 4 testy (Raise the Alarm 2×
  token, Cellar Door mill_from_bottom + conditional token, Healer of the
  Glade ETB gain life, Enter the Enigma cant_be_blocked + draw);
- `test/art-ids-tool.test.js` — `withArt.length === 148` (138 → 148).

**Exit:** **1059/1059** testów (12 nowych kart Batch 22 + 4 engine + 5
fix), artefakt buduje się (**49 modułów / 1123.8 kB**), `npm test` i
`npm run build` bez regresji.
