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
