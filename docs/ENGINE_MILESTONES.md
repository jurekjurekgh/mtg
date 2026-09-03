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

- [x] UI renderujące PlayerView (`src/table/render.js` — status tury, stos, pola bitwy,
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
      na polu bitwy i zatapnięte) — „doesn't untap for as long as this artifact remains
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
      na polu bitwy zdolność jest martwa — skanowanie `legalActivatedAbilities`
      ją pomija (regresja wykryta partią botów: widok oferował komendę, którą
      execute słusznie odrzucał);
- [x] **załączniki uogólnione** (`src/engine/attachments.js` przepisany):
      jedna warstwa dla trzech rodzin — bestow, czysta aura, equipment —
      ze wspólnym deskryptorem buffu (`attachmentGrant`), liczonym w
      `effective*` z uproszczonej warstwy CR 613; polityki utraty gospodarza:
      bestow → zostaje jako stwór (CR 702.103b), equipment → zostaje
      odłączony na polu bitwy (CR 704.5n), czysta aura → grób właściciela
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
      śmierć nosiciela zostawia equipment odłączony na polu bitwy;
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
      `Wyposaż…`, `Backup…`), karta na polu bitwy pokazuje załączone aury i
      equipment (badgie);
- [x] testy `test/real-cards-batch4.test.js` (29 scenariuszy: legalne i
      nielegalne przypadki każdej karty — blok menace ≥2, haste vs choroba,
      backup self/other/grant-cleanup/queue, cycling find/fail-to-find/
      bez-many/martwy-na-polu bitwy, aura cast/stos/fizzle/zgon gospodarza,
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
      **odłącza się i zostaje na polu bitwy jako stwór** (CR 702.103b, zdarzenie
      `object_detached` z samej zmiany strefy gospodarza — relacja attachedTo
      nigdy nie wskazuje obiektu spoza pola bitwy, pilnuje inwariant); cel
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
      gdy ręka/pole bitwy są nasycone landami), aggro traktuje `resolve_scry`
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
- [x] **stół na całą szerokość**: pole bitwy wroga u góry, stos pośrodku, Twoje
      pole bitwy na dole, ręka na samym dole (układ „naprzeciwko\" jak fizyczny stół);
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
- landfall dotyczy wyłącznie wejścia landa na pole bitwy (CR 702.36: „a land
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
      `permanent_cast` niesie obiekt już na polu bitwy — casting SAMEJ karty
      nie poświęca jej (w MtG źródło jest na stosie, nie na polu bitwy);
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
- [x] **powrót na pole bitwy zatapniętego** (`return_to_battlefield_tapped`)
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
- [x] inwariant combat usuwa z atakujących obiekt opuszczający pole bitwy, a dla
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
- mill nie kaskaduje triggerów na odejście z pola bitwy, bo biblioteka nie jest
      polem bitwy; dynamiczny X jest deterministycznym odczytem stanu;
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
listą legalnych celów (stworów na polu bitwy / odsłoniętych kart), Trap! —
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
      rozstrzygnięcie wchodzi na pole bitwy z `enchantedPlayerId` (kind
      'enchantment', nie 'aura' — gracz nie opuszcza pola bitwy, więc aura nigdy
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
  pole bitwy kładzie licznik lore i odpala rozdział I (714.3a/2a), po kroku
  dobierania kontrolera („after your draw step\", 714.3b — w engine: wejście
  do precombat main aktywnego) kolejny licznik odpala następny rozdział;
  po ostatnim rozdziale Saga jest poświęcana (714.4) — chyba że sama
  opuściła pole bitwy w trakcie rozdziału (Shiva: przemiana w Jill). Efekty
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
  (Ramroller) — `controlsAnotherArtifact` sprawdza pole bitwy i groby
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
  na polu bitwy nie znikają (pre-istniejąca luka wszystkich legendarnych
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
pole bitwy kontrolera rzucającego (static z `costModifier{spellTypes,
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
castPermanent kładzie permanent od razu na polu bitwy) — asercje zapisywane
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
  odejście źródła z pola bitwy cofa animację celu (choke point
  moveObjectDirectly — wszystkie zmiany stref) (Skilled Animator).
- **Triggery:** `land_entered_under_opponent_control` (Nightshade Harvester —
  „that player loses 1 life" przez kontekst zdarzenia),
  `card_put_into_graveyard_from_nonbattlefield` z filtrem podtypu (Disa —
  Lhurgoyf z ręki/biblioteki na pole bitwy), `any_combat_damage_to_player`
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

Rozdział obrażeń (510.1c), mana per step (106.4), tokeny poza polem bitwy (704.5d), legend face-down (708.2), morph koszty z pipami (702.37). UX morph label, koszty w etykietach, face-down odsłaniane. 983/983.

## T1–T6 / Stos, cele triggerów, auto-tap, mulligan, regeneracja, triggery na stosie (2026-08-07, PR #32 domknięcie)

- T1 permanenty na stosie (601/608), T2 cele triggerów jako wybór gracza (15 kart, resolve_trigger_target), T3 auto-tap właściwą maną, T4 mulligan londyński (resolve_mulligan_choice/bottom), T5 regeneracja (tarcza), T6 triggery na stosie (wspólny stos LIFO, intervening-if, LKI, bramki). Fix crasha B0 (pump na znikniętym źródle → no-op, LKI stub). Stan 1025/1025, 49 modułów / 1090 kB, B0 90.4% vs random, 61.7% vs aggro.

## M49 / PR #33 — UX A+B + czyszczenie luk (2026-08-08)

- A wskaźnik tury jako warstwa fixed (1100 < 1500 < 2600), B etykiety mulligana (dwie rozróżnialne, bottom z nazwami, rank -3)
- Czyszczenie Jawnych Ograniczeń: 7 kart (highland, rupture płatność, kor/pilgrims/fiery/moonlit deterministyczne, rage can't be regenerated) + 10 kart any-color bezbarwnie → kolorowa mana (M41) + tap-creature deterministycznie → wybór gracza (Holdout, Dragonbroods, Wedgelight Station) + Escape wygnanie 4 kart jako wybór gracza + any-target dragon → player choice
- 1025/1025 testów, 49 modułów / 1090 kB, B0 progi 0.78/0.57

## M50 / PR #34 — Saga Mesmerize jako wybór gracza + audyt limitations (2026-08-08)

Na zgłoszenie właściciela: **Mesmerize (Shiva, Warden of Ice — rozdziały I/II Sagi)** celował dotąd deterministycznie we własnego najsilniejszego stwora. Nowa implementacja: cel wybiera **KONTROLER Sagi** blokującą decyzją `resolve_trigger_target` (wzorzec T2: jak Forge Devil, Kor Sanctifiers, Puppeteer Clique, Greatsword of Tyr). Kolejność kandydatów (pole bitwy) = dawny determinizm, więc proste boty biorą pierwszą ofertę i zachowują dotychczasowe zachowanie.

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

## M53 / Batch 23 — 10 kart: Vandalize, Expunge, Shiv's Embrace, Deepwood Denizen, Welder Automaton, Feedback, Vow of Wildness, Greater Tanuki, Scorch Spitter, Turn the Tide (2026-08-08, PR #35)

Dziesięć realnych kart z kolejki właściciela 2026-08-08 (handoff `HANDOFF_2026-08-08e.md`), wszystkie `supported` w 100% Oracle (ADR 0010 §2a). Scryfall JSON w `docs/cards/scryfall-*.json` (10 plików pobranych przed kodowaniem), artId/plan ze słownika `tools/collection-art-ids.csv` (Vandalize 499 Tarkir, Expunge 40 Dominaria, Shiv's 496 Dominaria, Deepwood 51 Śródziemie, Welder 113 Kaladesh, Feedback 249 Warhammer, Vow 396 Tarkir, Greater Tanuki 449 Kamigawa, Scorch 495 Forgotten, Turn the Tide 529 Mirrodin).

**Nowe mechaniki engine (ADR 0002, generyczne):**
- `land` / `enchantment` / `nonartifact_nonblack_creature` target (Vandalize, Feedback, Expunge) — `legalTargetCandidates` + `validateTargets` w `spells.js`
- `enchantedPermanentControllerUpkeep` (Feedback) — `triggers.js` condition, `effects.js` `damage_enchanted_permanent_controller`
- `damage_defending_player` (Scorch Spitter) — `effects.js`, trigger `attacks` (istniejący) → damage do `state.combat.defendingPlayerId`
- `pump_enchanted_creature` (Shiv's Embrace) — `effects.js`, aktywowana {R} na aurze
- `buff_opponents_creatures` (Turn the Tide, re-use Hysterical Blindness) — `effects.js` `power:-2`
- `channel` z ręki (Greater Tanuki) — `abilities.js` `channel` (jak cycling), `activateChannel` search basic land tapped + shuffle
- `costReduction` per +1/+1 (Deepwood Denizen) — `abilities.js` `effectiveAbilityManaCost`, `costReduction: { perCounter: '+1/+1' }`
- `cantAttackYou` (Vow of Wildness) — `registry.js` + `identity.js` + `permanents.js` `attachmentRestrictions` (1v1: aura przeciwnika → cantAttack)

**Fix B23 UI (początek sesji, commit ffb8240):** `src/table/main.js` — `closeBotMoveModalPause` → `rerender()` + `rerender()` wstrzykuje `▶ Wznów grę bota` gdy `botPausePending`; `openCardFullscreenByCardId` nie chowa `bot-move` (z-index 2600>1500), `closeCardFullscreen` przywraca modal jeśli `fullscreenOpenedFromBotMove` i pauza.

**Karty:**
- Vandalize (DTK) {4}{R} Sorcery — Choose one or both → 3 tryby (artifact / land / both) — re-use `destroy_permanent`
- Expunge (USG) {2}{B} Instant — Destroy nonartifact nonblack + cant_be_regenerated + Cycling {2}
- Shiv's Embrace (M11) {2}{R}{R} Aura — +2/+2 flying + {R} pump_enchanted
- Deepwood Denizen (MH2) {2}{G} 3/2 Vigilance — {5}{G},{T} Draw, cost -1 per +1/+1
- Welder Automaton (AER) {2} 2/1 — {3}{R} damage_each_opponent 1
- Feedback (5ED) {2}{U} Aura enchant enchantment — upkeep damage 1 to enchanted controller
- Vow of Wildness (CMR) {2}{G} Aura — +3/+3 trample + cantAttackYou
- Greater Tanuki (NEO) {4}{G}{G} 6/5 Trample — Channel {2}{G} discard search basic land tapped
- Scorch Spitter (M20) {R} 1/1 — attacks trigger damage_defending_player 1
- Turn the Tide (MBS) {1}{U} Instant — buff_opponents_creatures -2/-0

**Testy.** Nowe: `test/engine-batch23.test.js` (7), `test/real-cards-batch23-first.test.js` (3), `test/real-cards-batch23-second.test.js` (3), `test/real-cards-batch23-third.test.js` (4) — razem 17 nowych, art-ids 148→158.

**Exit:** **1084/1084** testów, artefakt **49 modułów / 1172.0 kB**, `npm test` i `npm run build` zielone.


## M54 / Audyt Batch 23 + UX kosztów many (2026-08-08, PR sesji `arena/019fe265-mtg`)

Audyt runtime wszystkich 10 kart Batch 23 (skrypt end-to-end przez
cast/activate/triggers, NIE asercje definicji) po nieufności właściciela
do poprzedniej sesji. Wykryte i naprawione 3 realne bugi silnika + luka
testowa (testy sprawdzały „pole istnieje" zamiast zachowania):

**1. Channel (Greater Tanuki) — ReferenceError przy aktywacji.**
`activateChannel` była zadeklarowana WEWNĄTRZ `activateCycling` (scope
funkcji), a wołana z `activateAbility` → `ReferenceError: activateChannel
is not defined` w momencie aktywacji. Dodatkowo emitowała nieistniejący typ
zdarzenia `card_searched` (brak w `EVENT_TYPES`) — usunięty (`library_searched`
już niesie informację o szukaniu). Fix: `activateChannel` na poziomie modułu.

**2. Feedback — „Enchant enchantment" nie do rzucenia.** `legalAuraCasts`
oferował cel-enchantment, ale cztery miejsca twardo wymagały
`host.kind === 'creature'`: `castAuraSpell` (resources.js), `resolveAuraSpell`
(spells.js), `attachAuraToCreature` (attachments.js) i SBA
`removeIllegalAttachments` (attachments.js — aura byłaby niszczona co SBA).
Fix: wspólny helper `isLegalAuraHost` (creature / enchantment /
artifact_or_creature) w `attachments.js`, użyty w ofercie, walidacji rzutu,
rozstrzygnięciu i SBA — spójność oferta/walidacja/stan.

**3. Vandalize — tryb „Destroy both" niszczył tylko artefakt.**
`destroy_permanent` brał `targets[0]` ignorując `effect.targetIndex`
(konwencja reszty efektów: `targets[effect.targetIndex ?? 0]` — tap_permanent,
return_creature_card_to_hand, player_sacrifices_creature). Drugi efekt
ponownie celował w artefakt (już w grobie → no-op); land nigdy nie ginął.

**UX kosztów many (zgłoszenie ponowne właściciela):** poprzednia łatka
(M51 „C") dała `.ms` inline-block + nowrap — zapobiega łamaniu WEWNĄTRZ
pojedynczej ikony, ale nie MIĘDZY ikonami jednego kosztu (`{2}{W}` = dwa
spany). Fix: `manaSymbolsHtml` owija sekwencję w `<span class="ms-group">`
(inline-block + white-space: nowrap + word-break: normal) — koszt jest
atomowy: przenosi się w całości do następnej linii, w flex `.action` jest
jednym flex-itemem. Bez zamiany ikon na litery.

**Korekta danych (po uwagach właściciela):** sety Greater Tanuki i Turn the
Tide pozostają **NEO** i **MBS** (decyzja właściciela). Poprzedni agent pobrał
Scryfall po nazwie bez setu (`/cards/named?exact=...`) i dostał wydruki DSC
(Duskmourn Commander) / CNS (Conspiracy) — w M54 zmieniono sety pod złe dane,
co było błędem. W M55 przywrócono sety NEO/MBS i **poprawiono pliki Scryfall
oraz imageUri do właściwych wydruków**: Greater Tanuki (NEO #189, Kamigawa:
Neon Dynasty), Turn the Tide (MBS #35, Mirrodin Besieged).

**Testy.** `test/audit-batch23-fixes.test.js` (12 behawioralnych end-to-end:
Vandalize 3 tryby, Expunge, Shiv's, Deepwood redukcja z podłogą {G}, Welder,
Feedback rzut+upkeep przez prawdziwe passy, Vow cantAttackYou, Channel,
Scorch, Turn the Tide, zgodność Scryfall), `test/mana-icons-group.test.js`
(7: atomowość grupy, hybrydy/phyrexian, brak grupy dla tekstu bez symboli),
rozszerzony `test/attachment.test.js` (enchant enchantment: attach + SBA).

**Exit:** **1104/1104** testów, artefakt **49 modułów / 1175.5 kB**,
`npm test` i `npm run build` zielone. B0: bez zmian bota (progi 0.78/0.57
nietknięte — nie ruszano heurystyki).

## M55 / Batch 24 — 10 kart + nowe mechaniki (2026-08-08, PR sesji `arena/019fe265-mtg`)

Dziesięć realnych kart z kolejki właściciela. Scryfall pobrane **z parametrem
`set=`** (lekcja M54 — poprzedni batch pobierał po nazwie i dostawał złe
wydruki). artId/plan ze słownika.

**Karty:** Faceless Butcher (TOR), Unbreakable Bond (IKO), Spinewoods Paladin
(OTJ), Tome Scour (M11), Goblin Battle Jester (M13), Brawler's Plate (M15),
Glitch Ghost Surveyor (DFT), Mystic Sanctuary (ELD), Willbender (DD2), Scion
Summoner (OGW).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Plot dla PERMANENTÓW** (Spinewoods Paladin — pierwsza karta z plotem):
  plotCard dla creature/artifact/enchantment + pipy kolorów kosztu;
  castPermanent z exile+plotted (koszt 0); oferta w legalCommands.
- **Linked exile stwora** (Faceless Butcher): `exile_target_creature` +
  `return_exiled_to_battlefield` (LKI).
- **Lifelink counter** (Unbreakable Bond): licznik-lifelink nadaje keyword
  (CR 122.1b), `return_permanent_from_graveyard` z counters.
- **Speed / Start your engines! / Max speed** (Glitch Ghost Surveyor):
  player.speed (0..4), `start_engines`, wzrost raz na turę przy obrażeniach
  przeciwnika, `condition.maxSpeed` bramkuje zdolność z grobu.
- **turned_face_up + redirect celu** (Willbender): nowy event + trigger,
  kandydat `spell_with_single_target_on_stack`, `redirect_spell_target` +
  bramka `resolve_redirect_choice` (kandydaci = legalne cele czaru minus
  obecny). Ograniczenie: tylko czary (engine nie ma zdolności na stosie).
- **Sanctuary lands** (Mystic Sanctuary): `islands_you_control_at_least`
  (inne wyspy), warunek `enteredUntapped`, kandydat
  `instant_or_sorcery_card_in_graveyard`, `put_graveyard_card_on_top`.

**Root cause naprawione (ujawnione przez batch, nie maskowane):**
- `triggerTargetDecisionPending`/`triggerConditionHolds` bez kontekstu
  zdarzenia → trigger z requiresTarget + warunkiem zdarzenia cicho
  porzucany (spellColorsInclude Jestera, enteredUntapped Sanctuary).
- CR 704.5d (usuwanie tokenów) nie odczepiało załączników → dangling.
- `detachOrphanedAttachment` (czysta aura do grobu) nie odczepiało
  WŁASNYCH załączników aury (Feedback na Hobble) → dangling.
- face-down cast zastępował abilities flip-ability bez zachowania oryginału
  (po obrocie stwór tracił zdolności — trigger Willbendera).

**Testy.** `test/real-cards-batch24.test.js` (10 behawioralnych end-to-end),
art-ids 158→168, talie zaktualizowane. **Exit:** npm test **1121/1121**,
build 49 modułów / 1219.6 kB, benchmark 2160 meczów 0 niedokończonych/0 crashy.

## M56 / Srebrna odznaka — 5 błędów vs zasady MtG (2026-08-08, PR sesji `arena/019fe265-mtg`)

Audyt istniejących kart i mechanik (drugi przegląd — srebrna odznaka) wykrył
5 naruszeń reguł MtG; wszystkie naprawione root-cause (nie maskowane):

1. **Goad (CR 701.38c)** — wygasał w cleanup TEJ SAMEJ tury (funkcja
   `goadUntilEndOfTurn`) zamiast trwać do początku NASTĘPNEJ tury goadującego;
   zaczarowany stwór nie musiał atakować w turze przeciwnika (pokoje lochu
   Forge/Arena). Fix: `goadedUntilTurn` = turn.number + 2, wygaszenie na
   starcie tury w game-state.js.
2. **Aury a hexproof (CR 702.11b)** — `castAuraSpell`/`legalAuraCasts` nie
   sprawdzały hexproof: czar aury mógł zaczarować cudzego stwora z hexproof.
   Fix: wspólny `auraTargetHexproof`.
3. **Lifelink na obrażeniach niecombat (CR 702.15)** — damage_each_opponent,
   damage_defending_player i aury Curse/Feedback nie dawały zysku życia
   (Welder + True Conviction). Fix: wspólny `dealNonCombatDamage`.
4. **Curse a prewencja (CR 615)** — `damage_enchanted_player` ignorował tarcze
   (Withstand). Fix: ścieżka przez `dealNonCombatDamage`.
5. **Zdarzenie damage_dealt (CR 119.3)** — niosło kwotę PRZED prewencją;
   delirium (Fear of Burning Alive „deals that much damage") przeszacowywało
   obrażenia. Fix: event z kwotą ZADANĄ (po prewencji); przy okazji naprawiony
   latentny bypass filtra „prevent all damage this turn" (Ethersworn
   Shieldmage) przy infect do stwora.

**Testy.** `test/engine-silver-badge.test.js` (5 end-to-end), zaktualizowany
test goadu (real-cards-batch11). **Exit:** npm test **1126/1126**, build
49 modułów / 1221.5 kB, benchmark 1080 meczów 0 crashy.

## M57 / Złota odznaka — 5 błędów vs zasady MtG (2026-08-08, PR sesji `arena/019fe265-mtg`)

Trzeci przegląd mechanik (po brązowej i srebrnej odznace) — 5 naruszeń reguł,
wszystkie naprawione root-cause:

1. **CR 514.1** — limit ręki w cleanup dotyczył OBU graczy; nieaktywny był
   zmuszany do odrzucania do 7. Fix: tylko aktywny gracz.
2. **CR 119.3** — combat `damage_dealt` niósł kwotę przed prewencją; triggery
   „deals combat damage" odpalały przy 0 zadanych. Fix: event z kwotą zadaną
   + guard `ev.amount > 0` + tracker bloodthirst.
3. **CR 611.2c** — buffy „do końca tury" (Hysterical Blindness, Turn the
   Tide, Angel of the Dawn, Your Temple) były jednorazowe — stwory wchodzące
   później nie dostawały modyfikatora. Fix: `state.untilEndOfTurnBuffs`
   (efekty ciągłe czytane przy każdym odczycie statystyk).
4. **Opcjonalne płatności triggerów** (Panic Spellbomb {R}, Zoraline {W}{B})
   — `canPayTrigger` liczył manę tylko z puli; gracz z nietapniętym landem
   nie widział oferty. Fix: `producibleMana` (spójnie z płatnością spendMana).
5. **CR 104.3c** — dobranie z pustej biblioteki przez EFEKT karty nie kończyło
   gry (przegrana tylko z próby dobrania w kroku draw). Fix: `drawPlayerCards`
   kończy grę, gdy gracz musi dobrać więcej kart, niż ma.

**Testy.** `test/engine-gold-badge.test.js` (5 end-to-end); zaktualizowane
testy utrwalające stary zły stan. **Exit:** npm test **1131/1131**, build
49 modułów / 1225.8 kB, benchmark 1080 meczów 0 crashy.
## M58 / Platynowa odznaka — 5 błędów vs zasady MtG (2026-08-09, PR sesji `arena/019fe265-mtg`)

Czwarty przegląd mechanik (po brązowej, srebrnej i złotej odznace) — 5 naruszeń
reguł, wszystkie naprawione root-cause:

1. **CR 510.1c/702.19b — przydział obrażeń combat ignoruje prewencję.**
   `combat.js` przy wyznaczaniu „lethal" odejmował tarcze prewencji od
   wytrzymałości (`baseLethal - blockerShields`) i zerował lethal przy filtrze
   „prevent all damage this turn". Zasady: „When checking for assigned lethal
   damage ... but not any abilities or effects that might change the amount of
   damage that's actually dealt" — prewencję IGNORUJE się przy przydziale
   (liczy się tylko przy zadaniu). Skutek: trample 5/5 vs 3/3 z tarczą 2
   (Withstand) przydzielał 1 i przepuszczał 4 na gracza; poprawnie: przydział
   3 na blokera (tarcza zjada 2, 1 doszło) + 2 na gracza. Fix: `lethal =
   baseLethal` (deathtouch = 1), prewencja liczona dopiero przy zadaniu
   (filtr + tarcze → `dealt`).
2. **CR 119.3 — `damage_dealt` z kwotą przed prewencją w 3 ścieżkach.**
   Combat atakujący→bloker i bloker→atakujący raportowały `amount` sprzed
   prewencji (niespójnie z konwencją złotej odznaki dla graczy), a
   `damage_to_controller` (Forge Devil) w ogóle pomijał prewencję w evencie.
   Fix: event niesie kwotę faktycznie zadaną; zdarzenia `damage_prevented`
   (filtr + tarcze) trafiają do strumienia wyniku komendy (jak w
   `dealCombatDamageToPlayer`).
3. **CR 701.27a — proliferate a trucizna.** Kandydaci i aplikacja czytali/
   pisali `player.counters.poison`, a trucizna mieszka w `player.poison`
   (jedyna ścieżka `addPoisonCounters`, SBA czyta `player.poison`). Gracz
   z poison > 0 nigdy nie był oferowany jako cel proliferate (Courage in
   Crisis), a wymuszony +1 szedł w złe pole. Fix: `player.poison` w obu
   miejscach.
4. **CR 401.4 — `mill_from_bottom` celował w złą bibliotekę.** Biblioteka
   to wspólna lista obu graczy ([0] = wierzch); „spód własnej biblioteki"
   = ostatnia WŁASNA karta gracza-celu. Engine brał ostatni element wspólnej
   listy — po scry/mulligan-bottom P1 ostatni element należał do P1 i Cellar
   Door celujący w P2 młynował kartę P1 (i tworzył Zombie z NIE tej karty).
   Fix: skan wspólnej listy od końca do pierwszej karty celu.
5. **CR 108.3/400.7 — `bounce_permanent` wracał na rękę kontrolera.**
   Jill („to its owner's hand") i Lunar Rejection zwracały stwora na rękę
   DOTYCHCZASOWEGO kontrolera — przejęty przez Puppeteer Clique stwór
   wracał do złodzieja. `ownerId` jest już śledzone (Trostani); fix: ręka
   właściciela + `controllerId = ownerId`.

**Testy.** `test/engine-platinum-badge.test.js` (8 testów, po 1–2 na bug);
`test/engine-batch22.test.js` zaktualizowany (test proliferate ustawiał
nieczytane `player.counters.poison`). **Exit:** npm test **1139/1139**, build
49 modułów / 1228.5 kB, benchmark 1080 meczów 0 crashy (heuristic 88.1% vs
random, 63.1% vs aggro — progi 0.78/0.57 utrzymane).

## M59 / Batch 25 — 10 kart: buyback, protection, Plains-condition, reveal, sacrifice-search (2026-08-09, PR #37 0afe5a4)

Dziesięć realnych kart z kolejki właściciela (plan `docs/plans/PLAN_2026-08-09-batch25-cards.md`). Scryfall pobrane **z parametrem `set=`** (lekcja M54), `imageUri` zgodne ze Scryfall (6 poprawek w M60). artId + plan ze słownika `tools/collection-art-ids.csv` (+10).

**Karty:** Trestle Troll (RTR, 1/4 BG defender/reach {1}{B}{G}: Regenerate), Lab Rats (STH, sorcery {B} buyback {4} → 1/1 Rat), Anthem of Champions (FDN, {G}{W} enchantment +1/+1 anthem), Goblin Deathraiders (ALA, 3/1 BR trample), Fertile Thicket (BFZ, land entersTapped ETB reveal top 5), Reassembling Skeleton (M19, 1/1 B {1}{B} z grobu tapped), Idyllic Grange (ELD, Plains entersTapped warunkowy + ETB licznik), Deadly Recluse (M10, 1/2 G reach/deathtouch), Benevolent Blessing (CMR, aura W flash choose color protection), Springbloom Druid (MH1, 1/1 G ETB sacrifice-search 2 lands tapped).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Buyback CR 702.26** (Lab Rats): dopłata jako wariant `legalSpellCasts`; po `resolveTopOfStack` → `finishPendingSpell` sprawdza `wasBuyback` → na rękę zamiast graveyard (`pendingSpellReturnToHand`).
- **Protection from color CR 702.16** (Benevolent Blessing): `protectionFromColors` na obiekcie, `effectiveProtectionFromColors(state, obj)` (non-mutating, dla frozen view), `pendingColorChoice` + `resolve_color_choice`, filtry `validateTargets`/`legalBlockerOptions`/`isDamagePreventedByProtection`/`removeIllegalAttachments` (wyjątek „your own” — patrz M62/M63).
- **Conditional entersTapped** (Idyllic Grange): `entersTappedCondition: { minOtherPlains: 3 }` — zlicza Plains kontrolera bez self.
- **ETB reveal top N** (Fertile Thicket): `pendingFertileThicket` — obejrzyj top 5, wybór 0-1 basic land na top (opcjonalny), reszta na bottom w kolejności gracza.
- **ETB sacrifice-search** (Springbloom Druid): `pendingSpringbloom` — może poświęcić land; jeśli tak → search up to 2 basic lands tapped (kandydaci z biblioteki).
- **Static anthem `all_creatures_you_control`** (Anthem of Champions): zakres w `staticBonuses` (dotąd tylko pojedyncze typy).

**Talie:** singleton 9 talii (green/black/red/azorius/innistrad + graveyard/tokens/spellslinger/wiedzmin) — Batch25 karty dopisane (hunter seed). **Testy:** `test/real-cards-batch25.test.js` (11 end-to-end: Scryfall sanity, każdy legal/nielegal, determinizm). **Exit:** `npm test` **1153/1153** (przed M60), build **49 modułów / 1252.9 kB**, benchmark 1080 0 crashy (87.2%/71.4%).

## M60 / UI A–F: choice grouping, obrazy, bot modal (2026-08-09, PR #37 0afe5a4)

Sześć poprawek UX bez nowych kart (zgłoszenia po Batch25):
- **A. choiceRequestGroupKey** — grupowanie WSZYSTKICH `resolve_*` (nie tylko trigger-target) → modal „wybierz cel/poświęć/etc.” zamiast losowej nazwy wariantu (dotąd `resolve_scry` vs `resolve_backup` pokazywał pojedynczy label).
- **B. Obraz w menu kontekstowym** — klik miniatury otwiera fullscreen (dotąd tylko kafla).
- **C. 6 imageUri** — Wormfang Newt, Courage in Crisis, Enter the Enigma, Healer of the Glade, Raise the Alarm, Selesnya Charm — poprawione na właściwe druki ze Scryfall (wcześniej złe sety DSC/CNS przez fetch bez `set=`).
- **D. Bot modal** — `noteBotMove` filtrowane flagą `isBotAdvancing` — ETB ludzkich czarów (`land_played` etc.) nie trafiały do „Ruch przeciwnika”.
- **E. Badge hosta** — aura/equipment renderują „Aura → Gospodarz” (czytelność stołu).
- **F. Kor Cartographer ETB** — `resolve_trigger_target` grupowany do modala (dotąd surowa nazwa funkcji).

Bez zmian engine (poza `choiceRequestGroupKey`). **Exit:** 1153/1153, build **49 modułów / 1259.2 kB**.

## M61 / B2-w2 lookahead infra (2026-08-09, PR #37 0afe5a4, domyślnie OFF)

Infrastruktura lookahead bota (B2) — ~4× wolniej, więc OFF domyślnie (`createHeuristicBot({ lookahead: 1 })` włącza):
- **evalView:** keywords (flying/deathtouch/lifelink/trample/vigilance/menace/first_strike), evasion power, presja library ≤5, skalowanie przewagi życia, jakość stwora (P/T vs koszt).
- **simpleChoice polityka przeciwnika:** gra landy → rzuca stwory → blokuje jeśli zabija → rozstrzyga pending — realistyczniej niż greedy (greedy blokował optymalnie i zaniżał wartość ataku o 34 p.p.).
- **Threshold** 2 → 1 (mniej odrzuceń).
- **Wiring:** `src/table/session.js` `makeSimulate(state)` → `helpers.simulate` do `bot.chooseCommand` (wcześniej brak — lookahead nigdy nie aktywowany).

Benchmark (2 seedy, 540 gier, lookahead ON vs OFF): vs random **84.0%** (+5.0), vs aggro **80.0%** (+34). Pełny B0 (OFF): **87.2%/71.4%**, 1080 meczów 0 crashy, progi 0.78/0.57 utrzymane.

## M62 / Brązowa odznaka po Batch25: 5 błędów vs MtG (2026-08-09, PR #37 0afe5a4)

Drugi przegląd po Batch25 (brąz):
1. **CR 702.16a — protection a obrażenia (DEBT D):** `isDamagePreventedByProtection` brak w `markDamage` → damage od chronionego koloru przechodziło (Benevolent Blessing). Fix: `effectiveProtectionFromColors` + `isDamagePreventedByProtection` w `markDamage`.
2. **CR 702.16b — protection a załączniki:** `removeIllegalAttachments` nie zdejmował istniejących aur/equipment chronionego koloru (wyjątek „your own” błędnie uogólniony na cały silnik). Fix: sprawdza kolory attachment vs `hostProtection`, `effectiveProtectionFromColors` przeniesione z `permanents.js` → `attachments.js` (usunięcie cyklu).
3. **CR 514.3a — cleanup bez pętli:** trigger/SBA w cleanup nie powtarza cleanupu — udokumentowane jako jawne ograniczenie (brak karty w katalogu tego wymagającej; przyszłe karty z triggerem w cleanup → ADR).
4. **declareBlockers a protection:** walidacja tylko w `legalBlockerOptions`, brak w `execute` → nielegalny blok przechodził przez API. Fix: walidacja w `declareBlockers`.
5. **Fertile Thicket „you may look”:** brak opcji rezygnacji — teraz `pendingFertileThicket` oferuje skip lub obejrzenie i wybór 0/1.

**Exit:** 1153/1153, build **50 modułów / 1268.3 kB**.

## M63 / Srebrna odznaka po Batch25: 5 błędów vs MtG (2026-08-09, PR #37 0afe5a4)

Trzeci przegląd po Batch25 (srebro):
1. **CR 702.136 — plot „later turn”:** `castPermanent` pozwalał rzucić `plotted` w tej samej turze (`plottedAtTurn` nie śledzone). Fix: `plottedAtTurn = state.turn.number` przy `plotCard`, walidacja `state.turn.number > plottedAtTurn` w `castPermanent` i `legalCommands`.
2. **CR 702.16a — protection w combat:** `combat.js` wołał `markDamage` bez `sourceId` → `isDamagePreventedByProtection` nie mogło sprawdzić kolorów źródła. Fix: `sourceId` dla attacker→blocker i blocker→attacker.
3. **CR 702.16a — protection blocking kierunek:** `canBlock`/`declareBlockers` sprawdzały ochronę BLOKERA vs kolory atakującego — odwrotnie per CR („can't be blocked by [quality] creatures” → ochrona ATAKUJĄCEGO vs kolory blokera). Fix: `attackerProt` vs `blockerColors`.
4. **CR 702.16a — protection w non-combat:** `dealNonCombatDamage` nie sprawdzał ochrony → Feedback/Curse od chronionego koloru zadawało obrażenia. Fix: check ochrony przed filtrem.
5. **CR 702.16b — protection own-exception:** wyjątek „nie zdejmuj własnych” dotyczył tylko Benevolent Blessing („Enchant creature you control”), nie ogólnej reguły. Fix: `removeIllegalAttachments` zdejmuje WSZYSTKIE załączniki chronionego koloru (specjal-casing Benevolent usunięty —`controllerId` check z M62 cofnięty).

**Exit:** 1153/1153, build **50 modułów / 1269.6 kB**, benchmark 1080 0 crashy (87.2%/71.4%), progi 0.78/0.57.

## M64 / Batch 26 — 10 kart: Level Up, Index, pump by count, discard each, attack restriction (2026-08-09, PR `arena/019fe7bf-mtg`)

Dziesięć realnych kart z kolejki właściciela (plan `docs/plans/PLAN_2026-08-09-batch26-cards.md`). Scryfall pobrane **z parametrem `set=`** (lekcja M54), `imageUri` zgodne ze Scryfall, artId + plan ze słownika `tools/collection-art-ids.csv` (+10).

**Karty:** Kabira Vindicator (ROE, 2/4 W Level Up {2}{W} sorcery, LEVEL 2-4 3/6 other +1/+1, LEVEL 5+ 4/8 other +2/+2), Great Furnace (MRD, artifact land {T}: Add {R}), Bomat Bazaar Barge (KLD, 5/5 Vehicle ETB draw + Crew 3), Index (APC, sorcery {U} index_look top 5 any order), Bladed Sentinel (MBS, 2/4 {W}: vigilance), Might of the Masses (2XM, instant {G} pump +1/+1 per creature), Magic Damper (FIN, instant {U} +1/+1 hexproof untap), Hecteyes (FIN, 1/1 ETB discard each opponent), Carapace Forger (SOM, 2/2 metalcraft +2/+2), Lurking Green Dragon (CLB, 4/4 flying cant attack unless defender has flying).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Level Up CR 702.86** (Kabira): activated {2}{W} sorcery `add_counter level`, static progi `minLevel`/`maxLevel` (2-4 i 5+) w `staticConditionHolds` → self pump (+1/+2, +2/+4) i anthem other_creatures (+1/+1, +2/+2) w `permanents.js` (`effectivePower`/`anthemBonuses`).
- **Index** (APC): `pendingIndex` + `resolve_index_choice` (permutacja top 5, blokuje jak scry/surveil, kończy `pendingSpell`), `legalCommands` jedna oferta (oryginalna kolejność), `execute` przyjmuje dowolną permutację, `EVENT_TYPES` + `COMMAND_TYPES` rozszerzone.
- **pump_by_creature_count** (Might): liczy `battlefield` stwory kontrolera, `modifyStats` +N/+N.
- **discard_each_opponent** (Hecteyes): ETB każdy przeciwnik odrzuca 1 (pendingDiscard, 1v1 jeden, `purpose:effect`).
- **Attack restriction** (Lurking): `cantAttackUnlessDefenderHasFlying` (static + `isLegalAttacker` w `combat.js` sprawdza `defendingPlayer` ma stwora z `flying` via `effectiveKeywords`).
- **Artifact land** (Great Furnace): `MANA_SOURCE_MAP` R + type `Artifact Land` (liczy się dla metalcraft).

**Talie:** singleton 9 talii — azorius +Kabira/Bladed, green +Might/Carapace/Lurking, black +Hecteyes, red +Great Furnace/Bomat (16 landów, 31 spells, total 47), spellslinger +Index/Magic Damper (hunter przelosowane). **Testy:** `test/real-cards-batch26.test.js` (14 testów), aktualizacje `art-ids` 178→188, `repo-decks` red 45→47, `table-session` hunter seeds. **Exit:** `npm test` **1167/1167**, build **50 modułów / 1284.3 kB**, benchmark 1080 0 crashy (progi 0.78/0.57).

## M65 / Audyt Batchu 26 — 4 błędy vs MtG + crash pełnego B0 (2026-08-09, PR #39 `arena/019fe7ec-mtg`)

Audyt kart Batchu 26 (i przy okazji Batchu 25/21) na zlecenie właściciela: „100% zgodne
z MtG bez uproszczeń i ograniczeń". Sonda behawioralna (nie testy definicyjne!) na żywym
engine znalazła 4 tematy + 1 latentny crash pełnego B0. Plan:
`docs/plans/PLAN_2026-08-09-audyt-b26.md`.

1. **Crew = instant (CR 701.36)** — Oracle Bomat Bazaar Barge (B26) i Irontread Crusher
   (B21) nie ma „Activate only as a sorcery", a definicje ustawiały `timing: 'sorcery'`.
   Fix: usunięty timing (domyślne 'instant') — crew działa z priorytetem, w turze
   przeciwnika i w odpowiedzi na czar.
2. **Kolorowe koszty zdolności (CR 118.2)** — Batch 25/26 użyły zagnieżdżonych
   `colors: [['W']]` zamiast płaskich `['W']` (konwencja M45). Przez
   `colorRequirementsOf` (map → [kolor]) dawało to `[[['W']]]` i
   `matchColorRequirements` nigdy nie dopasowywał → zdolności NIE były oferowane ani
   aktywowalne („Brak kolorowego źródła many"): Kabira Vindicator level up {2}{W},
   Bladed Sentinel {W}: vigilance, Trestle Troll {1}{B}{G}: Regenerate (B25),
   Reassembling Skeleton {1}{B} z grobu (B25). Fix: spłaszczone do `['W']` / `['B','G']`.
3. **Trestle Troll regenerate (bug znaleziony audytem)** — `effect: {type:'regenerate'}`
   nie istnieje w `applyEffect`; po ścieżce keyword (addRegenerationShield)
   `performActivation` i tak aplikował efekt → aktywacja ODRZUCANA („Nieznany typ
   efektu") z cichą mutacją tarczy przed odrzuceniem. Fix: `effect: []` (jak syntetyczna
   karta w testach T5).
4. **Index (APC) — wybór gracza** — engine reorder działał, ale gracz-człowiek nie mógł
   wykonać wyboru: PlayerView nie wystawiał `pendingIndex` (UI nie widziało top 5),
   `legalCommands` oferowały 1 komendę (oryginalna kolejność = no-op), brak wizarda.
   Fix: `pendingIndex` w PlayerView (FoW jak scry — decydent widzi karty, przeciwnik
   tylko count), pojedynczy `resolve_index_choice` pakowany w request 'index', wizard
   w `choice-request.js` (lista kart → kolejność od góry klikaną po kolei → `{ order }`),
   `commandLabel`, polskie etykiety `index_started`/`index_resolved` w session.
5. **Face-down bez keywordów (CR 708.2)** — `effectiveKeywords` zwracało oryginalne
   keywordy zakrytego stwora (np. flying Monastery Flock) → zakryty flyer błędnie
   odblokowywał Lurking Green Dragon i mógł blokować flyery. Fix: `[]` dla `faceDown`
   (odsłonięcie przywraca keywordy — pole `keywords` niezmienione).
6. **Crash pełnego B0 (pre-existing, M65)** — „Obiekt bez transformTo odpala transform":
   trigger transform wilkołaka (upkeep) na stosie, źródło umiera w oknie priorytetu
   (seed 1025, random red vs heuristic green — -1/-1 z Trigonu), resolveTriggerEntry
   buduje stub LKI bez `transformTo`, efekt transform rzucał błąd. Fix: transform
   dotyczy permanentu NA polu bitwy — przy źródle poza polem bitwy no-op (CR 608.2b),
   jak `exile_return_transformed` (Jill). Pełne B0 nie było liczone po M64 — bug latentny.

**Zweryfikowane OK (bez zmian):** Might of the Masses (liczba stworów w chwili
rozstrzygnięcia, cel dowolny), Magic Damper (+1/+1, hexproof blokuje celowanie
przeciwnika, untap), Hecteyes (obowiązkowe odrzucenie przeciwnika, wybór odrzucającego,
0 kart = skip), Great Furnace (artifact land, {R}, metalcraft, cel Shatter), Carapace
Forger (metalcraft liczy artifact lands/creatures), Bomat (ETB draw, sickness w turze
wejścia), Kabira statics (progi 2-4/5+, anthem „other", licznik level ≠ +1/+1),
proliferate dodaje liczniki level (CR 701.27), Lurking Green Dragon (bez flyera
odrzucone, z flyerem — także przez equipment grant — dozwolone).

**Testy:** `test/audit-batch26-fixes.test.js` (13 behawioralnych: crew instant ×2,
4 zdolności kolorowe, Index ×3 + wizard UI ×2 w `choice-request-ui.test.js`, face-down
×3, transform LKI). **Exit:** `npm test` **1182/1182**, build **50 modułów /
1289.5 kB**, **pełne B0 13500 meczów / 0 crashy** (heuristic 92.0% vs random, 65.5% vs
aggro, aggro 94.2% vs random — progi 0.78/0.57 utrzymane; por. 90.4%/61.8% przed
audytem — wzrost dzięki działającym zdolnościom kolorowym/crew).

## M66 / UX walki i many — uwagi właściciela A/B/C/D/R (2026-08-09, PR #39 `arena/019fe7ec-mtg`)

Uwagi z testów na iPadzie + 2 błędy wykryte rozpoznaniem. Plan:
`docs/plans/PLAN_2026-08-09-ux-walka-i-many.md`.

1. **A — spacja przed `)` w kosztach akcji.** `.action` był flexem z `gap:8px`;
   każda ikona many (`.ms-group`) i fragment tekstu stawały się osobnymi flex-itemami
   i gap wstawiał lukę między kosztem a `)`. Fix: `gap:0`, separacja diamentu przez
   `margin-right:8px` na `.action::before`.
2. **A2 — MANA_COSTS kończyło się na Batchu 24** (39 kart supported bez wpisu, od
   serras-embrace po lurking-green-dragon): walidacja kolorów przy rzucie pominięta
   (Might of the Masses {G} dało się rzucić za {U}!) + etykiety bez ikon. Fix: wpisy
   z plików Scryfall (181 wpisów, posortowane) + strażnik pokrycia w card-data.test.js.
3. **B — atakujący/blokujący bez list kombinacji.** `groupCombatDecisions` (render.js)
   zwija wszystkie warianty `declare_attackers`/`declare_blockers` do JEDNEGO
   wpisu-wizarda; `renderCombatWizard` (choice-request.js) — przełączniki tak/nie przy
   każdym zdolnym stworze (obowiązkowi goad/must-attack zablokowani; menace 0/≥2,
   cantBlockAlone z partnerem). Engine nadal enumeruje dla botów; UI nigdy nie
   pokazuje kombinacji.
4. **C — log walki gubił nazwy (`?`).** Zdarzenia niosły tylko ID; po śmierci w SBA
   obiekt znikał z `state.objects` (nowe ID w grobie) → `nameOfObject` → `?`. Fix:
   `sourceCardId`/`targetCardId` w `damage_dealt`, `attackerCardIds` w
   `attackers_declared`, mapa `cards` w `blockers_declared` (session.js nazywa przez
   cardId z fallbackiem). Dodatkowo `blockers_declared` mylił atakującego z blokerem
   (klucz = atakujący) — render „<blokerzy> blokuje <atakujący>".
5. **D — pojedynczy bloker dostawał lethal zamiast pełnej mocy** (3/3 vs 1/1 = 1).
   MtG: gracz wybiera ilość (CR 510.1d); przy jednym blokerze pełna moc to naturalny
   wybór — auto (bez decyzji). Trample zostaje lethal-first (nadmiar na gracza).
6. **R — rozdzielanie obrażeń przy wielu blokerach = decyzja gracza (CR 510.1c/d).**
   Nowa decyzja engine `pendingDamageAssignment`: `resolve_combat` kolejkuje ją, gdy
   zablokowany atakujący ma >1 blokera albo trample; `resolve_damage_assignment`
   wznawia przebieg. `legalCommands` oferuje DOKŁADNIE JEDEN wariant (lethal-first —
   obecne zachowanie botów; kombinacji nie enumerujemy). PlayerView: `pendingDamageAssignment`
   (moc, żywi blokerzy, lethal na żywo). Walidacja: permutacja żywych blokerów,
   suma ≤ moc, „≥ lethal przed następnym" (CR 510.1d). UI: `renderDamageWizard` —
   steppery +/− przy blokerach, przycisk „Domyślnie". Po drodze 2 crashe pełnego B0:
   kolejność pending (triggery celów przed przydziałem obrażeń) i `remove_counter`
   jako efekt (Kappa ×2) = no-op przy braku licznika.

**Exit:** `npm test` **1197/1197**, build **50 modułów / 1317.2 kB**, **pełne B0
13500 meczów / 0 crashy** — heuristic **91.7% vs random, 65.6% vs aggro**, aggro
93.7% vs random (progi 0.78/0.57 utrzymane; por. 92.0%/65.5% po M65).

## M67 / Batch 27 — 10 realnych kart (2026-08-09, PR #39 `arena/019fe7ec-mtg`)

Kolejka właściciela (plan `docs/plans/PLAN_2026-08-09-batch27-cards.md`). Scryfall
pobrane **z `set=`** przez `fetch_page` (api.scryfall.com zablokowane w sandboxie —
curl i node fetch: błąd SSL/sieci), artId + plan ze słownika kolekcji, MANA_COSTS
uzupełnione (strażnik M66).

**Karty:** Civilized Scholar // Homicidal Brute (ISD DFC), Battle-Rattle Shaman (M21),
Jeskai Devotee (TDM), High Stride (BLB), Inspiration (8ED), Minotaur Abomination (M14),
Guildsworn Prowler (CLB), Giant Spider (M19), Scroll Thief (M13), Force Away (KTK).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **draw_then_discard z transformem** (Civilized Scholar): `{T}: Draw a card, then
  discard a card. If a creature card is discarded this way, untap this creature, then
  transform it." — draw 1 → pendingDiscardChoice z `onCreatureDiscard { sourceId,
  untap, transform }`; resolve_discard_choice po odrzuceniu karty-stwora odkręca
  i przemienia źródło (transform in-place).
- **didntAttackThisTurn** (Homicidal Brute — tył): flaga `attackedThisTurn` na
  atakujących (declareAttackers), condition w triggerze end_step („your end step" =
  aktywny gracz), czyszczenie w cleanup; efekt tap + transform.
- **draw_cards applyTo:'target'** (Inspiration): cel-gracz dobiera 2 (jak discard_cards
  Dementia Bat).
- **dies + „wasn't blocking"** (Guildsworn Prowler): flaga `isBlockingThisCombat` na
  blokerach (declareBlockers); `fireDeathTriggers` przekazuje LKI `wasBlocking` w extra
  triggera dies; condition `notBlocking` czyta z extra (trigger na stosie po SBA).
- **ferocious draw/discard** (Force Away): przy rozstrzyganiu czaru sprawdza stwora
  power ≥ 4 (żywo), kolejkuje `pendingOptionalDraw` (tak/nie, 2 warianty w
  legalCommands); po TAK draw 1 + łańcuch resolve_discard_choice; komenda
  `resolve_optional_draw`.
- **add_mana z kolorami z efektu** (Jeskai Devotee `{1}: Add {U}, {R}, or {W}` —
  jednostka WUR opłaca każdy pip; oncePerTurn).

Reuse: Battle-Rattle (beginning_of_combat + requiresTarget optional + pump),
Jeskai flurry (you_cast_second_spell_each_turn — Illvoi), High Stride
(pump+grant reach+untap), Scroll Thief (combat_damage_to_player + draw),
Giant Spider/Minotaur (vanilla).

**Talie:** spellslinger +5 (Scholar, Devotee, Inspiration, Scroll Thief, Force Away;
landy 7I/8M), red +Battle-Rattle, black +Minotaur/Guildsworn, green +High
Stride/Giant Spider. **Testy:** `test/real-cards-batch27.test.js` (16 behawioralnych:
per karta legalny scenariusz + Scryfall sanity + determinizm green vs red); hunter
seeds przelosowane (table-session, bot-pausa, audit C2); repo-decks red 47→49,
art-ids 188→199. **Exit:** `npm test` **1213/1213**, build **50 modułów /
1336.1 kB**, **pełne B0 13500 meczów / 0 crashy** — heuristic **63.1% vs aggro /
92.3% vs random** (progi 0.78/0.57 utrzymane; por. 65.6%/91.7% po M66 — drobne
wahanie od dodania kart, bez zmiany bota).

## M68 / daybound/nightbound — globalny znacznik dnia/nocy (2026-08-10, PR #39 `arena/019fe7ec-mtg`)

Zgłoszenie właściciela: „czy daybound wilkołaków jest w engine? powinien być globalny
znacznik — specjalna karta na stole (img day/night ze Scryfall); globalne mechanizmy
(Inicjatywa/Lochy) powinny być spójne". Plan: `docs/plans/PLAN_2026-08-10-daybound-nightbound.md`.

**Stan przed zmianą:** Inicjatywa + Lochy JUŻ zaimplementowane (M24) — globalna karta
The Undercity na stole (img ze Scryfall tclb/20), znacznik „Inicjatywa: <gracz>", pokoje
per gracz (renderUndercity). Daybound/nightbound NIE było; Civilized Scholar // Homicidal
Brute to zwykły transform DFC (ISD 2011), NIE daybound — jego przemiana zależy od
odrzucenia stwora / ataku i nie powinna zależeć od dnia/nocy.

**Implementacja (CR 708.9, generyczna):**
- `state.dayNight: null|'day'|'night'` — GLOBALNY znacznik gry (jak inicjatywa) +
  `lastTurnSpellsCastByPlayer` (czary poprzedniej tury per gracz).
- `setDayNight(designation)` — zmienia znacznik, transformuje in-place wszystkie
  permanenty z keywordem `daybound` (→ night) / `nightbound` (→ day); emituje
  `day_night_changed`. Karty bez tych keywordów (zwykły transform DFC) nietknięte.
- Wyzwalacze: wejście daybound przy null → day (CR 708.9c); rzut czaru przy
  `dayNight !== 'night'` i daybound na polu bitwy → night (CR 708.9d — warunek naturalnie
  ogranicza do pierwszego rzutu); upkeep aktywnego przy night bez czaru w JEGO poprzedniej
  turze → day (CR 708.9f).
- Wejście nightbound: permanent z daybound wchodzący w nocy wchodzi jako nightbound
  (transform przed zdarzeniem wejścia — ETB na właściwej stronie).
- PlayerView: `dayNight` (publiczna, jak initiativePlayerId); fingerprint: `dayNight`
  (determinizm replay).

**UI (spójne z lochami):** `renderDayNight` — karta Day//Night na stole (img ze Scryfall
TVOW 21, front przy dniu / back przy nocy), status „Dzień"/„Noc" + nota mechaniki; panel
ukryty, gdy designation nieustalone. `DAY_NIGHT_TOKEN` w card-data.js, `#daynight`
w index.html (+CSS), els.daynight w main.js.

**Testy:** `test/daybound-nightbound.test.js` (9, syntetyczne obiekty — brak realnych kart
daybound w katalogu): wejście daybound → day, rzut czaru → night + transform,
bez daybounda → brak zmiany, upkeep bez czaru poprzedniej tury → day + transform wstecz,
upkeep z czarem → noc zostaje, wejście w nocy → nightbound, Civilized Scholar (zwykły
transform) nietknięty przy day/night, dayNight publiczne w PlayerView + fingerprint,
setDayNight globalny (day_night_changed + transform obu graczy). + renderDayNight
w table-ui (front/back, hidden).

**Exit:** `npm test` **1223/1223**, build **50 modułów / 1343.2 kB**, benchmark 1080 meczów
0 crashy (77.5%/60.7% — procesTriggers zmienione, boty/talie bez zmian; progi 0.78/0.57).

## M69 / Batch 28 — 9 realnych kart (2026-08-10, PR #39 `arena/019fe7ec-mtg`)

Kolejka właściciela (plan `docs/plans/PLAN_2026-08-10-batch28-cards.md` + decyzja (a)
o Moonscarred). Scryfall z `set=` przez fetch_page, artId/plan ze słownika, MANA_COSTS
191→200 (strażnik M66).

**Karty:** Silumgar Butcher (DTK), Relic Robber (ZNR), Flurry of Wings (ARB), Expose to
Daylight (RNA), Etherium Abomination (ARB), Awaken the Bear (KTK), Security Rhox (SNC),
Dreams of Steel and Oil (BRO), Tenth District Veteran (RNA). **Moonscarred Werewolf
zostaje tyłem DFC** (limited — decyzja właściciela: klasyczny transform upkeep a
day/night to osobne mechaniki MtG).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Exploit (CR 702.110)** — enter_battlefield kolejkuje `pendingExploits`
  (resolve_exploit_choice: poświęć INNEGO stwora albo skip; bez kandydatów decyzji
  brak); po poświęceniu zdarzenie `exploited` odpala trigger „exploits" na źródle
  (extra niesie exploitedId LKI).
- **Unearth (CR 702.87)** — z grobu na pole bitwy pod kontrolą właściciela z haste;
  flaga `unearthExile` — moveObjectDirectly wygnuje zamiast opuścić pole bitwy;
  delayed exile na najbliższym end step.
- **Alternatywny koszt ze Skarbów (Security Rhox)** — wariant `treasureAlt` cast_permanent:
  koszt alternatywny (bez redukcji), „Spend only mana produced by Treasures" —
  walidacja treasureManaAvailable (pula + nietapnięte Skarby), dołożenie Skarbów do
  puli, spendMana wydaje skarbową pierwszą.
- **Reveal + wybory (Dreams)** — cel przeciwnik (spec.opponent), `pendingRevealExile`
  z etapami hand→grave (wybór OBOWIĄZKOWY — null tylko przy braku kandydatów; fix
  stallu B0: bot odrzucał wybór w pętli), exile obu wybranych; po reveal ręka jawna
  w PlayerView.
- **Tokeny** — `controllerFromEvent` (Relic Robber: token u OFIARY), amount
  `attacking_creatures_count` (Flurry), `cantBlock` na tokenie (Goblin Construct
  „can't block") + upkeep damage do kontrolera.
- **Cele czarów** — `artifact_or_enchantment` (Expose), player z `opponent`.

**Fixy wykryte testami/benchmarkiem:** `transfer_counters_on_dies` — cel poza polem bitwy
= no-op (CR 608.2b, crash przy rozstrzyganiu triggera na stosie).

**Talie:** black +3 (Silumgar, Dreams, Etherium; 15S), red +Relic Robber (17M), green
+Awaken/Security Rhox (19F+2M), azorius +Expose/Tenth (14P), tokens +Flurry (5F+3I).
Tokeny: token_bird_soldier (1/1 W flying), token_goblin_construct (0/1 bezbarwny
artifact creature, cantBlock, upkeep 1 dmg).

**Testy:** `test/real-cards-batch28.test.js` (13 behawioralnych: exploit ×2, Relic Robber
token u ofiary, Flurry X, Expose destroy+scry, Etherium unearth, Awaken, Security Rhox
warianty, Dreams reveal+wybory, Tenth District, determinizm); hunter seeds przelosowane
(audit C2 3, bot-pausa 7, endure 4, delirium 25, Forever Young 12, session-abilities 4);
repo-decks red 51; art-ids 208. **Exit:** `npm test` **1236/1236**, build **50 modułów /
1375.7 kB**, **pełne B0 13500 meczów / 0 crashy** (heuristic 78.6% ogółem; próbka
58.3% vs aggro > próg 57%, ~92% vs random — progi 0.78/0.57 utrzymane).

## M70 — UX wyborów i etykiet + Idyllic Grange entersTapped (2026-08-10, PR #40 `arena/019febbd-mtg`)

Uwagi właściciela z testów na iPhonie (GitHub Pages, screenshoty): **A** generyczne
etykiety grup wyborów („Wybierz: wybierz (2 opcji)”) + surowy HTML many w opcjach
modala aury, **B** czarne nazwy kart na ciemnych chipach w wizardzie Surveil,
**C** Idyllic Grange weszła nietapnięta przy <3 innych Plains, **D** etykieta akcji
z kosztem many łamie się na 3 „kolumny". Plan:
`docs/plans/PLAN_2026-08-10-ux-wybory-i-idyllic.md`.

**C — engine (root cause + sonda Batchu 25):**
- `idyllic-grange`: dodane brakujące `entersTapped: true` obok
  `entersTappedCondition { minOtherPlains: 3 }` — warunek tylko UCHYLA wejście
  tapnięte (`playLand` czyta flagę); Grange była jedyną kartą z warunkiem bez flagi.
- Trigger „When this land enters untapped, put a +1/+1 counter…" był w całości
  martwy DWOJAKO: `event: 'enters'` (engine obsługuje wyłącznie
  `'enter_battlefield'` — obiektowa lista 26 zdarzeń w strażniku) oraz
  `requiresTarget` podany jako top-level param `createAbility` (cichy drop;
  pole należy do obiektu `trigger`, jak w Mystic Sanctuary).
- Ta sama klasa błędu w `fertile-thicket` i `springbloom-druid`: `event: 'enters'`
  → oba ETB martwe od dodania batcha.
- `fertile_thicket_reveal` (CR 401.4): gracz ogląda wierzch WŁASNEJ biblioteki —
  efekt czytał wspólną przeplatanymi kartami listę `zones.library` bez filtra
  kontrolera (analogia do `mill_from_bottom` z M58); `resolve_fertile_thicket`
  składa `[wybrany, ...przeplot bez zmian, ...reszta na spód]` i waliduje opcjonalny
  `bottomOrder` jako permutację (konwencja Stomping Slabs/Index: engine akceptuje
  dowolną permutację, oferta pokazuje jedną domyślną).
- `springbloom_sacrifice_search`: „up to two basic lands" to dwie kolejne decyzje
  `resolve_search_choice` GRACZA (0/1/2 — CR 701.19b; `queueSearchChoice`
  wydzielone na top-level effects.js z parametrem `chain`); wcześniej handler brał
  deterministycznie pierwsze 2 Basic Landy ze WSPÓLNEJ listy bibliotek (mógł
  ukraść landy przeciwnika i odbierał graczowi wybór liczby).
- Kontrolery: aggro-bot i heuristic-bot nauczone nowych blokujących komend
  `resolve_fertile_thicket` / `resolve_springbloom` (ożywione ETB produkuje je
  w partiach — synthetic-game i bot-benchmark padały na „Kontroler nie znalazł
  ruchu mimo legalnych komend").

**A — UI etykiet:**
- Przyciski grup wyborów opisują CO wybieramy: „Wybierz: Mulligan (2 opcje)",
  „Wybierz: Deklaracja atakujących (2 opcje)", a grupy celów z nazwą źródła bez
  prefiksu: „Aura: Benevolent Blessing (3 opcje)", „Cel czaru: …", „Bestow: …".
  Pełne mapy deskryptorów typów żądań i komend resolve_*, odmiana liczebnika
  (1 opcja / 2–4 opcje / 5+ opcji / 12–14 opcji), nagłówek modala = ten sam opis
  (`choiceGroupTitle` jako `introLabel`), fallback `commandLabel` przez
  REASONING_ACTION_LABELS zamiast surowego typu.
- Opcje modala przez `innerHTML` (koniec surowego `<span class="ms-group">…`
  w koszcie many; nazwy kart nadal escape'owane w commandLabel).

**B — CSS:** `.look-wizard-card` jasny chip (`#f4f4f5`/`#e4e4e7`/`color: var(--text)`)
jak `.bot-move-line` — koniec czarnego tekstu na ciemnym tle w jasnym modalu.

**D — CSS+markup:** cała treść etykiety akcji w jednym inline
`span.action-label` (min-width:0) — flex przycisku ma dokładnie dwoje dzieci
(diament `::before` + span), tekst z ikonami łamie się jak akapit zamiast
tworzyć kolumny. Zastosowane w panelu akcji, opcjach modala i menu kontekstowym
(tam też „Wybierz wariant (N): …" zastąpione wspólną `choiceGroupLabel`).

**Testy:** batch25-etb-enters-fix (10 behawioralnych: Grange tapped/untapped+counter,
„other Plains" bez własnego, strażnik entersTappedCondition, Fertile pending+scoping
CR 401.4 + skład biblioteki z przeplotem, Springbloom pełny łańcuch 2 landy tapped
+ rezygnacja na 2. kroku, strażnik 26 zdarzeń triggerów); choice-request-ui
(modal innerHTML, etykiety grup ×5, introLabel); table-ui (MiniEl z semantyką
przeglądarki innerHTML/textContent, przyciski akcji w jednym span.action-label);
look-wizard-contrast (jasność tła chipa > 0.7 + jawny kolor tekstu).

**Exit:** `npm test` **1255/1255**, build **50 modułów / 1385.2 kB**, quick B0 1080
**0 crashy (heuristic 79.2% ogółem; 61.4% vs aggro / 96.9% vs random)**, pełne B0 13500 **0 crashy (heuristic 78.6% ogółem; 63.4% vs aggro / 93.8% vs random)** (ożywione ETB Grange/Fertile/Springbloom
zmieniają rozgrywkę botów; progi 0.78/0.57).

## M71 — srebrna odznaka: 4 twarde błędy vs CR + zgłoszenia właściciela A–D (2026-08-11, PR `arena/019fed61-mtg`)

Łowy błędów jak Sherlock (RED→GREEN, strażniki formy). Plan:
`docs/plans/PLAN_2026-08-11-lowy-srebne-odznaka.md`.

**Znalezione i naprawione błędy vs CR:**
1. **CR 510.4/510.5** — `resolveCombatDamage` używał `startPass = resume.pass`
   (boolean) jako indeksu `passes=[true,false]`: `passes[true]`=first-strike
   pass pomijany przy wznowieniu decyzji; `passes[false]`=regular pass
   re-rozgrywał niezablokowanych atakujących (**podwójne obrażenia — objaw D**).
   Fix: numeryczny startIndex (true→0, false→1).
2. **CR 702.16d+702.15** — lifelink/deathtouch liczyły `dealt` sprzed prewencji
   protection w obu ścieżkach combat. Fix: kwota po prewencji protection.
3. **CR 702.16b** — check protection-celowania brał kolory GRACZA (puste);
   czar/zdolność źródła chronionego koloru mógł celować w chronionego. Fix:
   `sourceColors` przekazywane przez validateTargets/collectLegalTargets.
4. **CR 702/704** — `creature_destroyed` bez `cardId` → log „? ginie\" (objaw C).
   Fix: cardId w evencie + render przez nameOf.

**Zgłoszenia właściciela:** **A** karta Undercity klikalna → pełny ekran
(`renderUndercity` + `openUndercityFullscreen`); **B** boty szukają w Secret
Entrance (`resolve_search_choice` punktowany w heuristic, aggro bierze
`found != null`); **C** log „? ginie\" (wyżej); **D** podwójna walka (wyżej).

**Testy:** `test/bug-hunt-2026-08-11.test.js` (7 testów behawioralnych:
first/double-strike resume ×3, protection-lifelink ×2, protection-target,
podwójna walka, creature_destroyed cardId, boty szukają ×2) + table-ui
(renderUndercity klik). Hunter seed delirium table-session 25→48 (po zmianie
zachowania bota).

**Exit:** `npm test` **1292/1292**, build **50 modułów / 1402.0 kB**, quick B0 1080
**0 crashy (heuristic 74.3% ogółem; 53.6% vs aggro / 95.0% vs random)**,
pełne B0 13500 — wynik w opisie PR (progi 0.78/0.57).

## M72 — Batch 29: 10 kart + generyczne rozdzielanie obrażeń (2026-08-11, PR `arena/019fed61-mtg`)

Batch 29 (lista właściciela): Mournful Zombie, Necrosquito, Curiosity, Veiled
Ascension, Angelic Benediction, Frontline War-Rager, Lash of the Balrog,
Fireball, Spread the Sickness, Warmaker Gunship.

**Nowe mechaniki engine (generyczne, ADR 0002):**
1. **Licznik oil (Necrosquito)** — nowy typ licznika; +1/+1 za każdy licznik
   (`counterDelta` w permanents.js), ETB z licznikami (`entersWithCounters`),
   trigger „another creature/artifact you control dies -> oil" (`other_permanent_you_control_dies`).
2. **Licznik flying (Veiled Ascension)** — CR 122.1b (counters grant abilities),
   jak deathtouch/lifelink; face-down stwory dostają flying counter.
3. **Aura „deals damage to opponent" (Curiosity)** — trigger
   `enchanted_creature_combat_damage_to_opponent` na aurze + may-draw.
4. **Exalted + attacks-alone (Angelic Benediction)** — trigger `attacks_alone`
   (dokładnie 1 atakujący); exalted_pump +1/+1 do końca tury; druga zdolność
   „you may tap target creature" z requiresTarget.
5. **Cloak (Veiled Ascension)** — upkeep „you may cloak top card" = wierzch
   biblioteki na pole bitwy face-down 2/2; flying counter od statycznej zdolności
   `faceDownEnterFlyingCounter`.
6. **Lash sacrifice-or-pay** — dodatkowy koszt „sacrifice a creature OR pay {4}"
   (`orPayMana` + `payAltCost`); wariant poświęcenia i zapłaty maną.
7. **Fireball + GENERYCZNE rozdzielanie obrażeń** — patrz niżej.
8. **Frontline** — end_step trigger z intervening-if `minTappedCreaturesControlled`.
9. **Warmaker Gunship** — station (wzorzec Wedgelight Rammer, próg 6+ flying) +
   ETB damage wg liczby artefaktów (`amount: 'artifacts_you_control'`) z celem
   `creature_opponent_controls`.

**Generyczne rozdzielanie obrażeń niecombat (Fireball, CR 119.4):**
- `pendingDamageDistribution` + `resolve_damage_distribution` — gracz rozdziela
  X między cele (każdemu tyle, ile chce; suma <= total, reszta przepada).
- `queueDamageDistribution` (effects.js) — każdy efekt `{ type:
  'damage_distribution' }` kolejkuje tę samą decyzję (reużywalne dla przyszłych
  czarów/zdolności). Fireball: przy rzucie wybór X + celów; czar czeka na stosie
  (state.pendingSpell) do decyzji. Wizard UI (renderDamageDistributionWizard),
  default u botów = równy podział.
- **FIX deadlocka benchmarku:** pendingOptionalTrigger jest teraz PRZED celami
  triggerów w firstPendingDecisionPlayerId i enumeracji (execute był źródłem
  prawdy) — gdy optional trigger (Curiosity/Veiled) i cel triggera czekały u
  tego samego gracza, oferowany trigger target był odrzucany bramką optional
  trigger (optional_trigger_unresolved).

**Testy:** `test/real-cards-batch29.test.js` (Scryfall sanity ×2, Mournful,
Necrosquito, Curiosity, Veiled, Angelic, Frontline, Lash ×2, Fireball ×2 +
walidacja + regresja deadlocka, Spread, Warmaker, determinizm partii).

**Exit:** `npm test` **1308/1308**, build **50 modułów / ~1443.6 kB**, quick B0
1080 **0 crashy** (heuristic ~76% ogółem), **pełne B0 13500 0 crashy (heuristic
78.4% ogółem; 62.7% vs aggro / 94.1% vs random)** — brak regresji vs M71; progi
0.78/0.57 utrzymane.

## M72b — zgłoszenia A-F przed mergem + D (aktywowane zdolności na stos) (2026-08-11, PR `arena/019fed61-mtg`)

Uwagi właściciela z testów na telefonie (przed mergem):

- **A** liczniki (+1/+1, oil, charge, lore, flying, deathtouch, lifelink, finality)
  pokazane na kartach na stole — badge w buildFace i nakładce ilustracji
  (COUNTER_LABELS).
- **B** etykieta aktywacji nie dubluje kosztu — describeAbility z withCost:false
  w commandLabel (koszt już osobno w costPart); Death-Hood Cobra opisany
  („zdobądź Zasięg/Dotykanie śmierci do końca tury").
- **C** górny panel pokazuje „Stos — <nazwa>" gdy coś na stosie (priorytet
  odpowiedzi instanitem). **C2** w tym samym panelu życie swoje i przeciwnika.
- **D** niemane zdolności aktywowane idą NA STOS (CR 602.2a) — Soulmender
  {T}:gain 1 life daje okno odpowiedzi instanitem. Wyjątki: mana abilities
  (CR 605.1a) i morph/megamorph (CR 702.36e). `ability_resolved` event + log.
- **E** w modalach wyboru przy permanentach na polu bitwy dopisywana nazwa
  właściciela („(Ty)"/„(Nieprzyjaciel)").
- **F** karta-gospodarz pokazuje przypięte aury/equipmenty („zaczarowana: X",
  „wyposażona: X").

Zaktualizowano ~27 plików testów aktywowanych zdolności o rozstrzygnięcie stosu
(D) — `npm test` **1310/1310**, build **50 modułów / ~1453.6 kB**. Pełne B0 13500
**0 crashy (heuristic 78.5% ogółem; 65.3% aggro / 93.9% random)**. D ujawniło
też 2 crashy Station (cel/źródło poza polem bitwy przed rozstrzygnięciem) —
naprawione (CR 608.2b).

## M73 — Audyt PR #41: 9 błędów naprawionych (2026-08-11, PR #42 `arena/019ff0e1-mtg`)

Audyt behawioralny ostatniego scalonego PR (M71+M72+M72b) na zlecenie właściciela.
Plan: `docs/plans/PLAN_2026-08-11-audyt-pr41.md`. Wszystkie naprawy RED→GREEN
u root cause:

1. **Fireball — divided evenly, rounded down (Oracle JVC).** Usunięta machineria
   free-distribution (`pendingDamageDistribution`, `resolve_damage_distribution`,
   `queueDamageDistribution`, wizard, wpisy protokołu/botów/UI/logu) — Fireball
   dzieli deterministycznie floor(X/n), reszta przepada; 0 celów i X=0 legalne
   („any number of targets"); protection od koloru czaru w walidacji i ofercie.
2. **attacks_alone — filtr kontrolera** (CR 702.82): cudza Benediction nie
   odpala przy moim samotnym ataku.
3. **Curiosity — każde obrażenia** (nie tylko combat): wspólny hook
   `enchanted_creature_damage_to_opponent`.
4. **Veiled — flying counter dla KAŻDEGO face-down** (morph + cloak): helper
   `maybeAddFaceDownFlyingCounter`; `effectiveKeywords` faceDown zwraca keywordy
   z liczników (CR 122.1b; drukowane nadal zakryte — CR 708.2).
5. **Oil — bez generalizacji**: statyczny pump `oil_counters` na Necrosquito.
6. **Protection w ścieżce aury** (CR 702.16b): castAuraSpell/legalAuraCasts +
   rewalidacja w resolveAuraSpell (fizzle czystej aury, bestow jako stwór).
7. **Zdolności aktywowane NA STOSIE — domknięcie CR 602.2a**: rewalidacja celów
   przy rozstrzyganiu (Lira: cel urósł ponad X → fizzle); **equip instant+stos**
   (CR 702.6a, fizzle przy nielegalnym celu); **cycling/channel** (odrzut=koszt,
   efekt przy rozstrzyganiu); **ninjutsu** (CR 702.48a, koszty przy aktywacji,
   wejście przy rozstrzyganiu).
8. **B8**: sonda mechanik M72 OK (Necrosquito artefakt/self, Veiled ETB,
   Warmaker station) — utrwalone testami.
9. **B9**: UI M72b E/F utrwalone testami render.

**Weryfikacja reguły priorytetu (CR 117.3c):** rzucający zachowuje priorytet po
rzucie czaru/aktywacji zdolności i może odpowiedzieć własnym instanitem na
wierzch stosu (LIFO). Engine realizuje to poprawnie (testy B10).

**Exit:** `npm test` **1334/1334** (+24), build **50 modułów / 1453.2 kB**,
quick B0 1080 meczów 0 crashy, pełne B0 13500 — wynik w opisie PR #42
(progi 0.78/0.57 utrzymane).


## M73c — Brązowa odznaka: 5 błędów wykrytych żywym testerem stołu (2026-08-11, PR #42)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (tools/table-tester,
5 partii różnymi taliami). Naprawione: (1) „efekt." jako opis triggerów/
zdolności na kaflach — pełna mapa polskich opisów ~70 typów efektów w
describeEffect; (2) surowe slugi efektów czaru — describeSpellEffects używa
wspólnych opisów (+fix „+-" w pumpach); (3) „cel: ?" dla face-down celu —
nameOfObject/commandLabel zwracają „morph" (CR 708.2); (4) „? — blokujący:"
w wizardze blokujących — objectName zwraca „morph"; (5) gołe „Koniec partii" —
wskaźnik pokazuje zwycięzcę. Testy +6 (RED→GREEN); npm test 1347/1347,
build 50 modułów / 1465.4 kB.


## M73d — Srebrna odznaka: 10 błędów wykrytych żywym testerem stołu (2026-08-11, PR #42)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (tools/table-tester,
10 partii różnymi taliami). Naprawione: (1) „efekt (undefined)" — puste effect:{}
w zdolnościach statycznych/cyclyng; (2) „: ." — pusty opis triggera modalnego;
(3) surowe typy celów (TARGET_TYPE_LABELS); (4) cel-gracz jako „?" (imię);
(5) surowe eventy triggerów (TRIGGER_EVENT_LABELS); (6) „→ cel:" dla zdolności
bez celu; (7) „zadaje 0 obrażeń" w logu; (8) „choroba" na nie-stworach;
(9) reveal „wskazuje ?" (cardId zamiast objectId); (10) odmiana „1 karty".
Testy +7; npm test 1354/1354, build 50 modułów / 1471.0 kB.

## M76 — Batch 30: 10 realnych kart (2026-08-11, PR #44 `arena/019ff280-mtg`)

Kolejka właściciela (handoff po PR #43). Scryfall z `set=`; artId/plan ze
słownika; MANA_COSTS +10. Plan: `docs/plans/PLAN_2026-08-11-batch30-kart.md`.

**Karty:** Banishment Decree (MBS), Crew Captain (SNC), Consume Spirit (MRD),
Altar of the Goyf (MH2), Instant Ramen (FIN), Inspiring Bard (AFR),
Seismic Monstrosaur (LCI), Epic Experiment (OTC), Gurmag Drowner (DTK),
Wavecrash Triton (THS).

**Nowe mechaniki generyczne (ADR 0002):**
1. `bounce_to_library_top` — Banishment Decree (CR 108.3/400.7: wierzch
   biblioteki WŁAŚCICIELA); cel `artifact_or_creature_or_enchantment`.
2. Generyczny X-cost czar (`spell.xCost`) — Consume Spirit, Epic Experiment;
   X wybiera gracz, koszt = manaCost + X, `spellX` na obiekcie stosu
   (`amount: 'X'` resolwowane w applyEffect).
3. Statyk `enteredThisTurn` (Crew Captain — indestructible w turze wejścia;
   proxy summoningSickness, CR 302.6).
4. Statyczny grant wg podtypu (`scope.affects: 'creatures_with_subtype'`) —
   Altar of the Goyf: Lhurgoyf mają trample.
5. Koszt aktywacji `sacrificeLand` (Seismic Monstrosaur — {2}{R}, poświęć
   ląd: dobierz; wybór landa w komendzie `sacrificeLandId`).
6. Modalny trigger ETB z celem (Inspiring Bard — choose one). Tryb bez
   legalnego celu NIE jest oferowany (jak modalny czar) — fix crasha
   benchmarku (illegal_modal_trigger_target).
7. `epic_experiment` — exile top X, free-cast inst/sorc MV≤X, reszta do grobu
   (pendingEpicExperiment + resolve_epic_choice).
8. `look_top_put_one_hand_rest_grave` (Gurmag Drowner — po exploicie;
   pendingLookTopN + resolve_look_top_choice).
9. Heroic — event `spell_targets_this_creature` (Wavecrash Triton: tap stwora
   przeciwnika + lock_untap; cel przez queueTargetDecision).

Registry: `xCost` w freezeSpell; EVENT_TYPES/COMMAND_TYPES rozszerzone
(look_top_*, epic_experiment_*, resolve_*). Talie singleton +10. Tester stołu
obsługuje „Odrzuć:". Boty znają resolve_epic_choice / resolve_look_top_choice.

Testy: `test/real-cards-batch30.test.js` (13 behawioralnych). `npm test`
**1393/1393**, build 50 modułów / ~1519 kB. Pełne B0 (2160 meczów, 0 crashy):
heuristic **79.5% ogółem** (64.6% vs aggro / 94.4% vs random) — progi
0.78/0.57 utrzymane (dodanie kart, nie zmiana bota).


## M82 — Batch 31: 10 realnych kart + nowe talie (2026-08-13, PR sesji `arena/019ff818-mtg`)

Lista właściciela (10 kart): Furious Forebear (TDM), Jwari Shapeshifter (WWK),
Floodhound (MH2), Inspire Awe (THB), Cogwork Assembler (2XM),
Dread Warlock (M10), Steel Sabotage (2XM), Warrior's Sword (FIN),
Awaken the Sleeper (ONE), Impact Tremors (DTK). Plan:
`docs/plans/PLAN_2026-08-13-batch31-kart.md`.

**Nowe generyczne mechaniki (ADR 0002):**
- `other_creature_you_control_dies` — trigger ze źródłem w grobie (Furious
  Forebear) + opcjonalna płatność `payMana`/`payColors` → `return_source_from_graveyard_to_hand`.
- `enterAsCopy` — „enter as a copy" rozstrzygane PRZY wejściu (przed SBA, CR 707):
  Jwari kopiuje najsilniejszego Ally; bez Ally 0/0 ginie SBA.
- `investigate` + `token_clue` (Floodhound) — token Clue z `{2}, Sacrifice: draw`.
- `preventCombatExceptEnchanted` — Inspire Awe: prewencja combat „except by
  enchanted/enchantment creatures".
- `create_copy_token` (Cogwork Assembler) — token-kopia artefaktu z haste
  + delayed exile (end step kontrolera).
- `cantBeBlockedExceptByColors` (Dread Warlock) — statyczna restrykcja blokowania.
- `artifact_spell_on_stack` (Steel Sabotage) — „Counter target artifact spell".
- `job_select` (Warrior's Sword) — Hero token + attach; equipment nadaje podtyp
  (`subtypes` w attachmentGrant/registry/identity).
- `gain_control_until_end_of_turn` + `destroy_equipment_attached` (Awaken the
  Sleeper) — czasowa kontrola (revert w cleanup) + zniszczenie equipment.
- `creature_you_control_enters` (Impact Tremors) — 1 obrażenia każdemu przeciwnikowi.

**Root cause naprawiony:** `legalActivatedAbilities` oferował TYLKO stwory jako
cele zdolności (niezależnie od typu celu) — Cogwork Assembler (cel `artifact`)
dostawał stwory, a bot wybierał nielegalny cel (`illegal_ability:Nielegalny cel`).
Naprawa: enumeracja celów przez wspólną `legalTargetCandidates`.

**Talie:** `decks/ostrza.txt`, `decks/mechanicy.txt`, `decks/sojusznicy.txt` +
dopiski do azorius/green/black/red.

Testy: `test/real-cards-batch31.test.js` (12 behawioralnych). `npm test`
**1442/1442**, build 50 modułów / ~1570.3 kB. Bot bez zmian → pełne B0
niewymagane (progi 0.78/0.57, pomiar #44).


## M83 — audyt rozgrywki żywym testerem (2026-08-13, PR #46 `arena/019ff818-mtg`)

10 błędów z audytu „z perspektywy gracza" (żywy tester). Plan:
`docs/plans/PLAN_2026-08-13-audyt-zywy-tester-m83.md`.

- UI/log: gramatyka logu walki („blokują"), nagłówek fazy („Główna 1"),
  „Brak bloków" pomijany, morph koszt w PlayerView, cel-gracz na stosie,
  opisy 13 triggerów, etykieta czaru X=N, opis Insatiable Appetite.
- Bot: kara za re-equip obecnego nosiciela (pętla).
- Engine: craft bez artefaktu do wygnania = no-op (CR 608.2b) zamiast crasha.

Testy: `test/audit-m83-tester.test.js` (10). `npm test` **1452/1452**,
build 50 modułów / ~1574 kB. Bot zmieniony → pełne B0 bez niedokończonych,
progi win-rate utrzymane.

## M256 — Runda 2 Żywym Testerem: precyzja „trigger bez efektu" i okno bloodrushu (2026-08-29, PR #87)

**Zlecenie:** „runda Żywym Testerem do wyczerpania budżetu" + domknięcie dwóch
kardynałów z M255. Pełny raport i dowody:
`docs/audits/AUDYT_M256_ZYWY_TESTER_2026-08-29.md`.

- **Engine + log (H):** `EMPTY_RECEIVER_EFFECTS` (triggers.js) — tabela
  selektorów odbiorców kluczowana TYPEM EFEKTU, zwracająca POWÓD (`no_targets`,
  `empty_library`) zamiast booleanu; selektory wyeksportowane z `effects.js`
  i używane też przez same efekty (jedna definicja zbioru, L41/L48). 12
  nieprecyzyjnych komunikatów „nie było czego wykonać" w 18 partiach → 0 po
  poprawce (kontrola na tych samych adresach: Trostani ×4, Veiled Ascension ×2,
  Jyoti ×2, Plague Reaver ×1 → „brak legalnych celów"; Chronic Flooding →
  „pusta biblioteka").
- **Engine (I):** `STATE_IDEMPOTENT_MASS_EFFECTS` — efekt zbiorowy, który ma
  w zbiorze SAMO ŹRÓDŁO (Village Bell-Ringer: „untap all creatures you
  control"), nie może zgłosić pustego zbioru; „wszystkie już odkręcone" to
  legalny no-op (CR 701.20b, M106/Z2), nie porażka triggera.
- **Narzędzie:** nowy profil testera `hoarder` (trzyma w ręce karty mechanik
  „z ręki") — bloodrush przeszedł end-to-end po raz pierwszy (0 okien
  w 33 partiach starymi profilami, 2 okna w 10 partiach z `hoarder`; premia
  policzona: 2 → 4 obrażenia).
- **Zgłoszenie detektora `[noop]` (Thunderstaff aktywowany bez atakujących)
  uznane za poprawne**: aktywacja jest legalna, UI nie ukrywa akcji gracza;
  naprawa z M255/E dotyczyła bota.

- **Engine (J, runda 3):** `untap_enchanted_permanent` (Silken Strength —
  „untap enchanted permanent"): odkręcenie OD KRĘCONEGO gospodarza to legalny
  no-op (CR 701.20b), nie „trigger bez efektu". Obiekt efektu idempotentnego
  bierze nowa tabela `STATE_IDEMPOTENT_TARGET` — aura działa na GOSPODARZA
  (`attachedTo`), nie na cel z wyboru ani na źródło.

Nowa lekcja **L91**. Testy `test/m256-zywy-tester-runda2.test.js` (18: H1–H7,
J1–J1c) — każda asercja o braku komunikatu ma kontrolę pozytywną; 11 mutacji
(MUT11 to mutant RÓWNOWAŻNY — zapisane jawnie w raporcie); strażnik H7 skanuje
katalog pod kątem „zbiorowych" typów efektów. `npm test` **3725/3725**,
build 56 modułów / 2893.8 kB.

## M255 — Pętla jakości Żywym Testerem po Batchu 51 (2026-08-29, PR #87)

**Zlecenie:** „pętla jakości żywym testerem ze szczególnym akcentem na nowe
karty”. 18 partii (tali z Batcha 51 i kart z uwag A–E), detektory: 0 zgłoszeń;
pięć napraw wyszło z lektury transkryptów. Szczegóły i dowody:
`docs/audits/AUDYT_M255_ZYWY_TESTER_2026-08-29.md`, testy
`test/m255-petla-jakosci.test.js` (13, każdy z mutacją).

- **A (silnik):** `buff_creature_until_end_of_turn` emituje `stats_modified` i
  `keyword_granted` — bez tego `resolveTrigger` raportował „trigger bez efektu”
  dla skutku, który realnie wszedł (Kulrath Mystic; dotyczyłoby też Altara of
  the Goyf po M254/E). Wyjątek M99 w `isBotMoveNoise` (czysta funkcja wyeksportowana
  z session.js) przepuszcza buffy `untilEndOfTurn` do modalu „Rozgrywka”.
- **B (log):** `ability_activated` z `bloodrush: true` nazywa mechanikę
  (CR 702.63) i odrzucenie karty jako koszt; `card_discarded` z `cost: true`
  dostaje dopisek „(koszt: bloodrush)”.
- **C (log):** `ABILITY_EFFECT_LABELS` uzupełnione o 31 typów (brakowało 29 z
  52 używanych przez zdolności aktywowane) + strażnik M255/C1.
- **D (panel):** `ptPair` i etykieta `pump` drukują „+X/+X (X = …)” dla
  wartości dynamicznych (koniec surowego sluga i zgubionego „+X/+X”).
- **E (bot):** `buff_attacking_creatures` w `TEMPORARY_PUMP_EFFECTS` +
  reprezentant zbioru (własny atakujący) — bot przestał palić {2} + tap w
  Głównej 1 i nadal używa premii w oknie walki (test E2 anty-over-fix).
- **F (silnik + narzędzie, z próby pełnej macierzy):** obrońca w kroku obrażeń
  dostaje `pass_priority` (reguła `closingCombatPassBlocked` — jedna funkcja
  dla oferty i walidacji; zakaz domykającego passu dotyczy wyłącznie gracza
  aktywnego, bo tylko on ma `resolve_combat`). Pełna runda passów w tym kroku
  oddaje priorytet aktywnemu zamiast domykać krok (obrażenia nie zostaną
  pominięte: regresja M172/C). Przed poprawką oferta obrońcy w oknie obrażeń
  to było `concede` (+ ewentualna aktywacja) — martwy punkt, przez który
  pełna macierz benchmarku kończyła się wyjątkiem aggro-bota w 15. turze.
  Narzędzie: wyjątek kontrolera niesie krok/komendy, `runBenchmark` — adres
  meczu (L88).

## M254 — Batch 51: 8 kart właściciela (2026-08-28, PR #87)

**Zakres:** Skinbrand Goblin (GTC), Typhoid Rats (FRF), Invasive Species (M15),
Dromoka Warrior (DTK), Akroan Sergeant (ORI), Thunderstaff (DST), Savage Surge
(THS), Kulrath Mystic (ECL). Plan:
`docs/plans/PLAN_2026-08-28-m254-batch51-kart.md`. Dane Oracle ze Scryfalla
przed kodowaniem (ADR 0010 §2a).

**Nowe mechaniki (generyczne, ADR 0002):**

- **Bloodrush** — zdolność aktywowana z RĘKI (`{R}, Discard this card: Target
  attacking creature gets +2/+1`) z nowym filtrem celu `attacking_creature`
  (poza walką oferty nie ma — CR 508.1k).
- **Renown N** (CR 702.112) — licznik +1/+1 za pierwsze obrażenia bojowe
  zadane graczowi; flaga *renowned* blokuje powtórzenie.
- **`bounce_permanent` + filtr `permanent` z `controlledBy: 'controller'`**
  (Invasive Species) — cel obowiązkowy, brak kandydata = `no_targets`
  (CR 603.3d).
- **`preventCombatDamageToController`** (Thunderstaff, CR 615.1a) — statyczna
  prewencja liczona per źródło obrażeń, przed jednorazowymi tarczami.
- **`buff_attacking_creatures`** (Thunderstaff) — zbiór atakujących mrożony
  przy rozstrzygnięciu (CR 611.2c).
- **Warunek `spellManaValueAtLeast`** (Kulrath Mystic) — mana value czytana z
  OBIEKTU czaru, nie z kwoty zapłaconej (L85).

**Świadome ograniczenia:** prewencja Thunderstaffa działa wyłącznie na
obrażenia bojowe zadawane kontrolerowi (Oracle nie obejmuje innych źródeł);
bloodrush nie ma wariantu „z pola bitwy\" (karta działa tylko z ręki).

**Naprawa znaleziona pełną macierzą:** kolizja dwóch pendingów tego samego
gracza (`pendingReboundCast` + `pendingUndercityRoute`) — `legalCommands`
oferowało komendę, którą bramka `execute` odrzucała (`rebound_unresolved`).
Gałąź ofert reboundu stała PO undercity, choć jej bramka jest PRZED; przywrócona
zgodność (reguła przy `firstPendingDecisionPlayerId`, dopisek do L48).

**Wycena bota:** wspólny mianownik efektów pump (`TEMPORARY_PUMP_EFFECTS` +
`temporaryPumpOf`) zamiast łańcucha nazw typów; przy okazji naprawiony debuff
Downwind Ambushera (klasa M202/G) i TDZ przy premii za odkręcenie celu.

**Wynik:** `npm test` **3661/3661** (+36 testów), build **55 modułów /
2861.8 kB**, `npm run test:slow` (próbka B0) **9/9**. Złoty fixture bota
zregenerowany, progi win-rate bez zmian.

## M269 — Brązowa odznaka: 5 błędów reguł wykrytych polowaniem na niezgodności z CR (2026-08-31, PR #91 `arena/01a058db-mtg`)

Pierwsza odznaka zdobyta metodą L11 (skan kodu silnika), a nie Żywym Testerem
— po M267/M268 pięć z sześciu ostatnich lekcji dotyczyło warstwy prezentacji,
więc szukaliśmy tam, gdzie tester z definicji nie widzi. Cztery z pięciu
znalezisk pochodzą z techniki L11 #1 (niespójność między analogicznymi
implementacjami tego samego mechanizmu).

**Naprawione:**
1. **CR 611.2c** — buff „do końca tury" znikał przy zmianie kontroli.
   `untilEndOfTurnBonuses` filtrowała wpisy po BIEŻĄCYM kontrolerze, mimo
   zamrożonego przy rozstrzygnięciu zbioru obiektów (M101/B2). Kradzież
   buffowanego stwora kasowała +X/+X, a przy buffie ujemnym (Hysterical
   Blindness) wręcz LECZYŁA osłabienie. → lekcja L106.
2. **CR 701.27 + 205.1** — proliferate dokładał liczniki własną
   re-inkarnacją obiektu zamiast helperem `addCounter`, omijając
   `syncStationKind`: Spacecraft dobity proliferatem do progu station
   zostawał zwykłym artefaktem (nie mógł atakować ani blokować).
3. **CR 701.21a** — „gains control of this artifact and untaps it"
   (Contested Game Ball) emitowało `object_untapped` tylko w gałęzi „ten sam
   kontroler". W ścieżce typowej odkręcenie było ciche (klasa lekcji L24).
4. **CR 701.27a** — proliferate trucizny nabijał `player.poison += 1`
   z pominięciem `addPoisonCounters`: brak `poison_counters_added`, więc log
   stołu pisał „? dostaje +1 licznik poison" (klasa L29), a heurystyczny bot
   nie widział postępu do wygranej przez truciznę.
5. **CR 701.17a + 122.1e** — cztery ścieżki poświęcenia (koszt dodatkowy,
   exploit, devour, wybór ofiary / Food) szły na sztywno do cmentarza zamiast
   pytać `deathZoneFor`: stwór z licznikiem finality dawał się reanimować
   drugi raz.

Każda naprawa u root cause (ADR 0002), każda ze strażnikiem KLASOWYM
(mechanizm / równoważność ścieżek, nie nazwa karty) i weryfikacją mutacyjną
(L13). Testy: `test/m269-buff-zmiana-kontroli.test.js` (4),
`m269-proliferate-station` (4), `m269-untap-zdarzenie` (3),
`m269-proliferate-trucizna` (3), `m269-poswiecenie-strefa-smierci` (5).

**Wynik:** `npm test` **3970/3970** (+14), `npm run test:all` **3985/3985**,
build **56 modułów / 3006.5 kB**.

## M270 — Odznaka SREBRNA: 5 kolejnych unikalnych błędów CR (2026-09-01)

Kontynuacja M269 (brąz) tą samą metodą, ale wyłącznie techniką **L107**
(rodziny ścieżek duplikujących wspólny helper). Piąty błąd zamknął klasę,
którą trzeci otworzył — to najlepszy dowód, że L107 działa jako *metoda*,
a nie seria szczęśliwych trafień.

**Naprawione:**
6. **CR 400.7** — `enteredOnTurn` nie było ustawiane przy powrocie z wygnania
   z transformacją i przy craft: obiekt wracał na pole bitwy jako „nowy",
   ale bez znacznika tury wejścia (trzy emitery pola, dwa niekompletne).
7. **CR 122.1e** — `destroy_equipment_attached` szło na sztywno do cmentarza
   zamiast pytać `deathZoneFor`: ta sama luka finality co w błędzie #5,
   tyle że na ścieżce niszczenia Equipmentu (L107 #2 — porównanie ładunków
   dwóch emiterów jednego zdarzenia).
8. **CR 122.1b** — licznik tarczy zdejmowany ręcznie w dwóch miejscach
   zamiast helperem: brak `counter_removed`, więc log stołu i konsumenci
   zdarzenia widzieli tylko część zdjęć tarczy.
9. **CR 508.1c — DEADLOCK.** Goadowany stwór z „can't attack alone", będący
   jedynym zdolnym do ataku: pusta deklaracja łamała wymóg ataku, a
   deklaracja z nim łamała zakaz samotnego ataku — gracz nie miał **ani
   jednej legalnej komendy**. Wymóg „attacks each combat IF ABLE" nie
   dotyczy stwora, który legalnie zaatakować nie może. Naprawa w OBU
   połowach: walidacja (`declareAttackers`) i oferta
   (`legalAttackerOptions`) — klasyczne L48.
10. **CR 122.1b + 704.5g** — TRZECIA kopia zdejmowania tarczy, pominięta
    przy #8: state-based actions przy śmierci z obrażeń, czyli **najczęstsza
    ścieżka w realnej grze**. Domknięcie klasy enumeracyjnie.

Każda naprawa u root cause (ADR 0002), każda ze strażnikiem KLASOWYM
i weryfikacją mutacyjną per ścieżka (L13). Nowe/rozszerzone testy:
`m270-powrot-na-pole-entered` (4), `m270-zniszczenie-equipment-finality` (4),
`m270-licznik-tarczy-rownowaznosc` (6), `m270-wymog-ataku-if-able` (4).

**Wynik:** `npm test` **3990/3990**, `npm run test:all` **4003/4003**,
build **56 modułów / 3010.8 kB**. Nowa lekcja: **L108**.

## M271 — Odznaka ZŁOTA: 5 kolejnych unikalnych błędów CR (2026-09-01)

Trzecia odznaka tej sesji (po brązie M269 i srebrze M270), ta sama metoda
**L107**. Cechą wspólną całej piątki jest jeden wzorzec: reguła CR zapisana
RÓWNOLEGLE w kilku miejscach zamiast we wspólnym helperze — i część kopii,
która o niej zapomina.

**Naprawione:**
11. **CR 400.3 + 110.2a** — aura bez legalnego gospodarza (CR 704.5m)
    opuszczała pole bitwy ręczną kopią kodu przenoszenia, więc ukradziona
    aura lądowała w grobie ZŁODZIEJA zamiast właściciela.
12. **CR 122.1e** — ta sama kopia ignorowała `deathZoneFor`: aura z licznikiem
    finality szła do grobu zamiast na wygnanie i dawała się odzyskać.
13. **CR 608.2b** — czar MODALNY, który stracił jedyny cel, rozstrzygał się
    mimo wszystko i wykonywał efekty NIECELOWANE (bliźniacza ścieżka
    zdolności miała ten test od M90).
14. **CR 118.9** — dwie ścieżki modalne gubiły `exileInsteadOfGraveyard`
    (Halo Forager): czar rzucony z grobu wracał do grobu i dawał się rzucić
    ponownie.
15. **CR 701.5a + 118.9** — to samo przy KONTRZE: pięć kopii kodu
    kontrującego szło na sztywno do grobu. Domknięcie klasy otwartej przez #14.
16. **Bonus** — odczepianie KILKU aur od jednego gospodarza sprawdzało
    inwarianty na stanie pośrednim i wywracało partię wyjątkiem. Znaleziony
    jako regresja naprawy #11/#12 przez benchmark botów, ale błąd samoistny.

**Dług architektoniczny spłacony przy okazji:** reguła „gdzie ląduje czar po
zejściu ze stosu" istniała w OŚMIU kopiach (`spells.js` + `effects.js` +
`game-state.js`) — teraz jest jedna funkcja `spellExitZone` w `zones.js`.
Podobnie `deathZoneFor` zeszło do `zones.js`, a nowy `mover.js` udostępnia
choke point zmian stref warstwom leżącym niżej w grafie importów, bez cyklu.

Każda naprawa u root cause (ADR 0002), każda ze strażnikiem KLASOWYM
i weryfikacją mutacyjną per ścieżka (L13). Nowe testy:
`m271-aura-bez-gospodarza-strefa` (7), `m271-czar-modalny-fizzle` (5),
`m271-strefa-zejscia-czaru` (4), `m271-kontra-strefa-zejscia` (5).

**Wynik:** `npm test` 4011/4011, `npm run test:all` **4022/4022**,
build **57 modułów / 3016.3 kB**. Nowe lekcje: **L109**, **L110**.

## M272 — Odznaka DIAMENTOWA: 5 kolejnych unikalnych błędów CR (2026-09-01)

Piąta z rzędu seria po pięć błędów reguł, tą samą metodą L11 (repro przed
naprawą → root cause → strażnik klasowy → weryfikacja mutacyjna per ścieżka).

17. **CR 704.5s + 122.1e** — Saga poświęcana przez akcję stanową szła na
    sztywno na cmentarz, z pominięciem `deathZoneFor`: Saga z licznikiem
    finality dawała się odzyskać, choć powinna zostać wygnana.
18. **CR 122.1d + 614.6** — liczniki stun tworzą efekt zastępujący działający
    przy odkręceniu z DOWOLNEGO powodu. Znał go tylko helper `untapObject`;
    PIĘĆ ścieżek efektów mutowało `tapped: false` ręcznie, omijając zarówno
    stun, jak i blokadę odkręcania (`untapLockedBy`). Stwór ze stunem wstawał
    z Twiddle za darmo, zachowując licznik. Nowy wspólny `untapByEffect`.
19. **CR 701.7a + 702.12** — „destroy" to jedna procedura z warstwą efektów
    zastępujących (indestructible → shield → regeneracja → strefa śmierci).
    Znała ją tylko ścieżka `destroy_permanent`; bliźniacza
    `destroy_equipment_attached` miała uboższą kopię i niszczyła chroniony
    Equipment. Nowy wspólny `destroyPermanentByEffect`.
20. **CR 122.1b** — PIĘĆ emiterów `permanent_sacrificed` przenosiło permanent
    przez `deathZoneFor`, ale strefy nie przekazywało w ZDARZENIU. Triggery
    śmierci filtrują po `ev.toZone === 'exile'`, więc zdolności „dies"
    odpalały mimo wygnania przez finality. Piątego emitera (Springbloom Druid)
    znalazł dopiero strażnik skanujący źródła — audyt ręczny go przeoczył.
21. **CR 704.5m + 104.4b** — znacznik przegranej z pustej biblioteki stawiały
    tylko dwie z czterech ścieżek dobierania. Wycyklowanie ostatniej karty nie
    kończyło partii.

**Fałszywy alarm wycofany w całości:** „zmiana kontroli nie usuwa z walki"
(CR 506.4) okazała się artefaktem sondy wołającej `applyEffect` bez przebiegu
akcji stanowych — regułę egzekwuje `state-based.js` od M201. Naprawa, import
i strażnik cofnięte; wniosek zapisany jako **L111**.

**Wzorzec L107 („helper istnieje, ścieżka go omija") dał w tej serii błędy
#18, #19 i #20** — łącznie ósma, dziewiąta i dziesiąta ofiara. Najskuteczniejszym
narzędziem okazał się strażnik SKANUJĄCY ŹRÓDŁA: sprawdza kontrakt u każdego
emitera zdarzenia, także przyszłego, i dwukrotnie znalazł ścieżkę, której nie
wychwycił audyt ręczny.

Nowe testy: `m272-saga-poswiecenie-strefa` (5),
`m272-stun-przy-odkrecaniu-efektem` (7), `m272-destroy-equipment-ochrona` (4),
`m272-poswiecenie-strefa-w-zdarzeniu` (3),
`m272-cyklowanie-pusta-biblioteka` (4).

**Wynik:** `npm test` **4037/4037**, `node --test test/bot-benchmark.test.js`
**10/10**, build **57 modułów / 3021,2 kB**. Nowa lekcja: **L111**.

## M273 (2026-09-01) — Odznaka PLATYNOWA: analizator statyczny tępiący klasę L107

Cztery poprzednie odznaki (M269 brąz, M270 srebro, M271 złoto, M272 diament)
naprawiły 25 błędów reguł tą samą metodą ręczną. **10 z nich należało do
jednego wzorca L107** — ścieżka omija choke point albo gubi pole zdarzenia
oczekiwane przez konsumenta. Platyny (ADR 0027) nie zdobywa się liczbą
błędów, tylko NARZĘDZIEM zamykającym drogę ich powstawania.

**`tools/event-contract-audit.mjs`** — analizator statyczny wpięty w
`npm test` (`test/m273-kontrakty-zdarzen.test.js`, 5 testów), trzy wymiary:

1. **Rozjazd ładunków zdarzeń** — pole niesione przez ≥60% i <100% emiterów
   danego typu: konsument (log stołu, triggery, bot) dostanie `undefined`.
2. **Cechy wejścia na pole bitwy** — ile ścieżek ETB zna daną cechę.
3. **Ręczne mutacje `state.zones`** — ominięcie choke pointu gubi jego reguły.

**Lista wyjątków jest jawna i uzasadniona** (37 pozycji, ADR 0027 pkt 3):
niestandardowy ładunek bywa świadomym kontraktem (wygnanie zakryte nie niesie
`cardId` — mgła wojny; cel-gracz nie ma `cardId`). Osobny test pilnuje, że
każdy wyjątek ma realny POWÓD — wyłapał moje własne leniwe „Jak wyżej".

### Pięć błędów wskazanych PRZEZ NARZĘDZIE

22. **Log kłamał (klasa L29)** — `card_revealed` z rozstrzygnięcia wyboru
    odsłaniania niosło `fromId` i `object`, ale nie `cardId`, którego woła
    `nameOf(e.cardId)`. Gracz czytał „odsłania ?".
23. **CR 202.2** — PIĘĆ ścieżek alternatywnego rzucania (z grobu, suspend,
    rebound, discover-czar, discover-permanent) nie niosło pola `colors`.
    `triggers.js` czyta `eventData.colors` dla „whenever a player casts
    a WHITE spell" (Angel's Feather) i „casts a COLORLESS spell": czar rzucony
    taką ścieżką udawał BEZBARWNY — trigger na kolor milczał, a trigger na
    bezbarwność odpaliłby fałszywie.
24. **CR 121.6 + 614.1c** — liczniki WEJŚCIA znała 1 z 18 ścieżek
    wprowadzających permanent. Reanimowany Servant of the Scale wracał jako
    0/0 i ginął natychmiast (CR 704.5f), Trigon of Corruption tracił trzy
    liczniki charge, Kappa Tech-Wrecker deathtouch. Wspólny helper
    `applyEnterCounters` w dziesięciu ścieżkach; permanent zakryty liczników
    nie dostaje (CR 708.2).
25. **CR 506.4** — token skasowany BEZPOŚREDNIO z pola bitwy zostawiał wiszące
    id w `state.combat` (atakujący/bloker bez obiektu w `state.objects`). Dwie
    ścieżki omijały choke point, więc nie wołały `removeFromCombat`. Ten sam
    rodzaj niespójności wywrócił partię w M271 (#16), tyle że dla załączników.

Błędy #22 i #23 znalazł wymiar 1, #24 wymiar 2, #25 wymiar 3.

**Skan źródeł znów bił audyt wzrokowy:** przy #24 i #25 strażnik sam wskazał
ścieżki, których pierwsza naprawa nie objęła (odpowiednio 3 i 1).

**Analizator też jest produktem (L12):** prototyp gubił pola stojące po
komentarzu i produkował fałszywe braki (`permanent_sacrificed.fromId`,
`spell_cast.manaSpent`). Poprawka plus dwa testy regresyjne na parser.
Fałszywe alarmy strażników poprawiane w TESTACH, nie w działającym kodzie.

**Odsiew:** z 36 kandydatów wymiaru 1 realnymi błędami były 2 — reszta to
świadome kontrakty (zweryfikowane wobec konsumenta gałąź po gałęzi).
Sprawdzone i odrzucone: `exile_all` bez ochrony (indestructible nie chroni
przed wygnaniem), mielenie z pustej biblioteki (CR 701.13b nie jest
przegraną), rodzina `destroy` (w pełni skonsolidowana po #19), `entersTapped`
przy reanimacji (dotyczy wyłącznie lądów, które tymi ścieżkami nie chodzą),
`dealDamageToPlayer` bez prewencji (martwy kod, używany tylko przez testy).

Nowe testy: `m273-kontrakty-zdarzen` (5),
`m273-liczniki-wejscia-reanimacja` (5), `m273-kasowanie-tokena-a-walka` (4).

**Wynik:** `npm test` **4051/4051**, `node --test test/bot-benchmark.test.js`
**10/10**, build **57 modułów / 3027,4 kB**. Nowa lekcja: **L112**.
Nowy ADR: **0027**.

## M274 (2026-09-01) — Kontynuacja platyny wg handoffu: analizator znajduje dalej

Etap prowadzony wprost z trzech kierunków wskazanych w handoffie M273. Wszystkie
trzy dały wynik — dowód, że analizator z ADR 0027 nie był jednorazowy.

### Kierunek 1: bliźniacze implementacje (rodziny `exile` 13 / `return` 11)

Porównanie zbioru helperów wołanych przez każdy wariant efektu wskazało trzy
kolejne ścieżki ETB bez liczników wejścia: Pyxis of Pandemonium (`effects.js`),
opóźniony powrót Plague Reavera (`triggers.js`) i Dragon Arch (`game-state.js`).

**Ważniejsze od samych ścieżek: znalazły się tam, bo STRAŻNIK z M273 miał dwie
dziury i przepuścił je cicho.**
1. Skanował wyłącznie `effects.js`, a ścieżki ETB są też w `triggers.js`
   i `game-state.js`.
2. Filtr wykluczał okno zawierające `faceDown` (miał pomijać morph), ale Pyxis
   ustawia `faceDown: false`, czyli ODKRYWA kartę — wyciszenie złapało ścieżkę,
   której miało pilnować.

Naprawiony skan (3 pliki, filtr po INTENCJI: `faceDown: true`, nie po samym
ciągu znaków) sam wskazał trzecią ścieżkę — Dragon Arch, której nie było
w moim ręcznym przeglądzie rodzin.

### Kierunek 3: cechy wejścia inne niż liczniki

26. **CR 702.54a** — bloodthirst działał wyłącznie przy rzucie. Słowo kluczowe
    WYDRUKOWANE na karcie jest efektem zastępującym wejście, więc obowiązuje
    także przy reanimacji: Gorehorn Minotaurs wracał bez dwóch liczników +1/+1.
    Weryfikacja wobec CR przed naprawą (L57): ruling Bloodghasta rozróżnia
    bloodthirst wydrukowany (każde wejście) od NADANEGO czarom przez inny
    permanent (wymaga rzutu) — silnik zna tylko ten pierwszy.

    **Konsolidacja przy okazji:** `spells.js` miał własną kopię logiki cech
    wejścia (liczniki, warunkowe morbid/adamant, bloodthirst), a rodzina
    reanimacji nie miała żadnej — wzorzec L107 w czystej postaci.
    `applyEnterCounters` obejmuje teraz KOMPLET cech i jest jedynym źródłem dla
    wszystkich ścieżek; z `spells.js` usunięte 1453 znaki duplikatu.

### Kierunek 2: kontrakt widoku gracza

27. **ADR 0017 + CR 400.2** — widok GROBU nie niósł `kind`, `types`, `power`,
    `toughness` ani `manaCost`, a `heuristic-bot.js` filtruje zawartość grobu
    dokładnie po tych polach (`o.kind === 'creature'`, `types.includes(
    'Artifact')`, `o.power` przy wycenie reanimacji). Wszystkie dostawały
    `undefined`: **stwór 3/3 w cudzym grobie wyceniał się na ZERO**, więc
    reanimacja i odpowiedź na nią były dla bota niewidoczne. Wygnanie (strefa
    też jawna, CR 406.3) `kind`/`types` już wysyłało — grób został w tyle.
    Klasa L102 pkt 2.

**Sprawdzone i odrzucone:** bounce tokena do ręki (SBA sprząta poprawnie,
CR 111.7), indestructible w rodzinie `exile` (nie chroni przed wygnaniem),
`entersWithCountersIf`/`renown` (brak kart w katalogu), `entersTapped` przy
reanimacji (dotyczy tylko lądów), `sourceId` w widoku stosu (**fałszywy alarm
mojej sondy** — pole jest wysyłane warunkowo dla zdolności aktywowanych,
naprawione już w M175/A2), widok wygnania (kompletny).

Nowe testy: `m274-widok-grobu-kontrakt` (4, w tym skan źródeł wyciągający
z bota listę pól żądanych od grobu) oraz 4 testy dołożone do
`m273-liczniki-wejscia-reanimacja` (Pyxis, Dragon Arch, bloodthirst
+ kontrola negatywna).

**Wynik:** `npm test` **4059/4059**, `node --test test/bot-benchmark.test.js`
**10/10**, build **57 modułów / 3029,6 kB**.

## M275–M276 (2026-09-01) — Porządkowanie wiedzy + rodzina `damage`

### M275: strukturalne łączenie lekcji i ADR-ów (decyzja właściciela)

Właściciel odrzucił pomysł archiwizowania wpisów „bo stare": **starsze lekcje
nie są mniej ważne — bywają cenniejsze, bo ich klasa zdążyła wrócić kilka razy.**
Kierunek: łączyć to, co opisuje JEDNĄ klasę, a do archiwum przenosić wyłącznie
decyzje NIEAKTUALNE.

**Archiwum ADR** (`docs/decisions/archive/`): ADR 0008 („bez kroku budowania")
miał status *Zastąpiona* od czasu ADR 0011, ale leżał w lekturze obowiązkowej —
i, co ważniejsze, ADR 0011 tylko ODSYŁAŁ do jego sekcji „Czego świadomie nie
dostajemy". Żywe zasady (język i moduły ESM, `node:test`, JSDoc, struktura
katalogów, cała tabela kompromisów) przeniesione do ADR 0011; w archiwum zostało
wyłącznie historyczne uzasadnienie decyzji, która już nie obowiązuje.

**Wpisy zbiorcze w LESSONS.md** — pięć klas miało po kilka wpisów:

| Klasa | Wpis główny | Kotwice |
|---|---|---|
| Jawna lista pól gubi dane po cichu (fabryka → generator → transport → widok) | L21 | L93, L94, L101 |
| Weryfikacja mutacyjna: jedyny dowód działania | L13 | L61, L70 |
| Strażnik mierzy regułę, nie tekst źródła | L5 | L26, L31, L44, L83 |
| Zero zgłoszeń detektorów to pomiar narzędzia | L27 | L40, L73, L75 |
| Oferta i walidacja: jeden filtr, porządek, rejestr | L48 | L90 |

Wpis główny niesie tabelę wariantów i wspólną regułę; kotwica zachowuje opis
WŁASNEGO przypadku (karta, test, plik, numer CR) plus odsyłacz. **Żaden numer nie
znika** — są cytowane w kodzie ~1150 razy.

Sześć nowych strażników (`test/docs-decisions.test.js`) pilnuje archiwum
(tylko statusy zastąpiona/wycofana/odrzucona, nota z datą, link do następcy, wpis
w README, zakaz cytowania z AGENTS.md) oraz integralności kotwic (każda prowadzi
do wpisu głównego i zachowuje min. 300 znaków własnego konkretu).

**Znalezione przez nowe strażniki:** AGENTS.md powoływał się na zarchiwizowany
ADR 0008 jako źródło zasady „zero zależności"; lekcje L108–L113 (moje wpisy
z tej i poprzedniej sesji) łamały obowiązkowy format nagłówka z datą; cztery
kotwice rodziny L107 nie odsyłały do klasy nadrzędnej.

Zapas budżetu lektury: **714 tokenów** (po M274 było ~0).

### M276: rodzina `damage` — ostatnia niezbadana rodzina bliźniacza

28. **CR 702.15 + 702.90b** — `damage_to_controller` (Forge Devil: „deals
    1 damage to target creature and 1 damage to you") odtwarzało kontrakt
    obrażeń WŁASNYM kodem (prewencja tarcz + `changeLife`), zamiast wołać choke
    point `dealNonCombatDamage`. Gubiło przez to **lifelink** (Forge Devil
    z licznikiem lifelink — CR 122.1b — nie dawał życia za obrażenia zadane
    własnemu kontrolerowi, choć te same obrażenia zadane przeciwnikowi życie
    dawały), **infect** (obrażenia w gracza mają dawać liczniki trucizny) oraz
    filtr „prevent all damage this turn". Ta sama karta, dwie ścieżki, dwa
    wyniki — klasa L107.

Analizator rodzin pokazał, że 9 z 14 wariantów `damage` deleguje do choke
pointu; z pięciu pozostałych cztery obrażeń w ogóle nie zadają (prewencja,
reveal + trigger) — realny błąd był jeden.

Nowe testy: `m276-obrazenia-choke-point` (6, w tym test RÓWNOWAŻNOŚCI obu
ścieżek dla tego samego źródła i skan źródeł wymuszający choke point).

**Wynik:** `npm test` **4071/4071**, `node --test test/bot-benchmark.test.js`
**10/10**, build **57 modułów / 3029,5 kB**.

## M277 (2026-09-01) — Domknięcie kierunków z handoffu: kontrakt renderu i statusy ADR

Etap zamykający listę kierunków otwartych po M276. Dwa wyniki: jedna poprawka
dokumentu, który kłamał o stanie faktycznym, i jeden strażnik utrwalający
przegląd, który nie znalazł błędu.

### ADR 0015 miał status „Proponowana", choć jest wdrożony od M41

Uzupełnienie konsolidacji z M275 — tam przeglądałem ADR-y pod kątem decyzji
NIEAKTUALNYCH, tu pod kątem zgodności statusu ze stanem kodu. „Kolorowa pula
many" nosiła status propozycji, podczas gdy `player.manaPool`,
`canPayColoredCost` i `spendMana` żyją w `src/engine/resources.js` od M41.
Po poprawce **wszystkie 27 aktywnych ADR-ów ma status Zaakceptowana**, a
dokumenty Zastąpiona/Wycofana mieszkają w `docs/decisions/archive/`.

### Kontrakt widok ↔ render (kierunek 3): luki nie ma, jest strażnik

M274 (#27) domknął kontrakt widok ↔ bot dla grobu. Druga strona: `cardInfo`
w `render.js` czyta 43 pola z wpisu widoku, a `playerView` część dokłada
warunkowo. Przegląd wykazał komplet — pola warunkowe pojawiają się, gdy cecha
istnieje na obiekcie. Zamiast raportu „sprawdzone, czysto" został
`test/m277-widok-render-kontrakt.test.js` (3 testy: implikacja „permanent ma
cechę ⇒ widok ją niesie", skan źródeł `cardInfo` vs `playerView`, kontrola
negatywna na mgłę wojny).

**Metodycznie ważne:** pierwsza wersja skanu parsowała źródło `playerView`
regexem i dawała fałszywe braki dla pól wchodzących spreadem (`counters`,
`damage`, `toughness`). Zbiór „pól wysyłanych" buduję teraz z PRAWDZIWYCH
wpisów widoku — narzędzie ma mierzyć zachowanie, nie tekst (L5).

### Kierunki 1–2: przeczesane, czysto

Rodziny `counter` (9), `tap` (10), `untap` (6), `sacrifice` (6), `mill` (3) —
bez znalezisk. Odkręcanie w całości przechodzi przez `untapByEffect` po M272
(także `attacker_gains_control_and_untaps`, którego mój pierwszy grep nie
pokazał — wywołanie leży 27 linii od nagłówka, poza oknem skanu). Wszystkie
13 emiterów `permanent_sacrificed` niesie `toZone`, więc klasa #20 się trzyma.
Żadna ścieżka nie wyprowadza permanentu z pola bitwy ręczną mutacją
`state.zones`, a każde ręczne przejście do strefy ukrytej ma korektę
`ownerId` (CR 400.3).

Odnotowane, nie naprawiane: `tapObject` nie ma odpowiednika `untapByEffect`
dla CUDZYCH permanentów (rzuca wyjątkiem przy obcym kontrolerze), więc efekty
tapujące cele przeciwnika mutują pole wprost. Każda z tych ścieżek emituje
`object_tapped`, a tapowanie — w odróżnieniu od odkręcania (stun, CR 122.1d) —
nie ma dziś w katalogu efektu zastępującego. To dług do spłaty, gdy pojawi się
pierwsza karta z takim efektem, nie błąd.

**Wynik:** `npm test` **4074/4074**, build **57 modułów / 3029,5 kB**.

## M278 — Batch 52: 9 kart właściciela (2026-09-01, PR #92)

**Zakres:** Loporrit Scout (FIN), Ulna Alley Shopkeep (SOS), Vaan, Street
Thief (FIN), Kill Shot (KTK), Merfolk Falconer (ZNR), Jolrael, Mwonvuli
Recluse (MKC), Fourth Bridge Prowler (AER), Leonin Surveyor (DFT), Cemetery
Recruitment (EMN). Plan: `docs/plans/PLAN_2026-09-01-batch52-kart.md`.
Dane Oracle ze Scryfalla przed kodowaniem (ADR 0010 §2a); artId/plan ze
słownika `tools/collection-art-ids.csv` (580–588).

**Nowe mechaniki (generyczne, ADR 0002):**

- **Infusion** (Ulna Alley Shopkeep, CR — „as long as you gained life this
  turn") — licznik `state.lifeGainedThisTurn` per gracz (choke point
  `changeLife`), reset przy zmianie tury; static condition `gainedLifeThisTurn`
  → pump +2/+0.
- **`you_cast_kicked_spell`** (Merfolk Falconer) — trigger na rzucie z
  opłaconym kickerem (`permanent_cast.kicked` / `object.wasKicked`) → scry 2.
- **`you_draw_second_card_each_turn`** (Jolrael) — trigger na doborze, po
  którym `cardsDrawnThisTurn` dobił do 2 (licznik per gracz) → token 2/2 Cat;
  aktywowane `set_base_pt_creatures_you_control` z `power: 'hand_size'`
  (X = karty w ręce, CR 608.2g) → per-creature `tempBasePT` + `stats_modified`.
- **`any_combat_damage_to_player` z filtrem podtypów** (Vaan, „one or more
  Scouts, Pirates and/or Rogues") — dedup po kluczu `kontroler|podtypy`;
  efekt `exile_top_of_player_library_and_may_cast` (blokująca decyzja
  `resolve_exile_cast`; rzut TERAZ ignorujący timing — ruling WotC; rezygnacja
  → Treasure) oraz `you_cast_spell_you_dont_own` (ownerId ≠ controllerId,
  CR 109.4) → `add_counter_to_creatures_you_control` per podtyp.
- **`activePlayerIsController`** (Leonin Surveyor) — first strike tylko w
  turze kontrolera; start engines + max speed z grobu (wzorzec Glitch Ghost
  Surveyor, M202).
- **`drawIfSubtypes`** (Cemetery Recruitment) — po zwrocie z grobu do ręki,
  jeśli karta ma podtyp z listy → dobierz (filtr po podtypie, ADR 0002).
- **`buff_creature_until_end_of_turn` z ujemnym znakiem** (Fourth Bridge
  Prowler) — ETB „you may" przez OPCJONALNY CEL (`requiresTarget.optional`),
  nie `mayFire` (to drugie jest dla „you may" bez celu).

**Świadome ograniczenia:** rzut Vaana z wygnania obejmuje proste
instant/sorcery (bez X/fireball/additionalCost) i permanenty niebędące aurami
— land i karty spoza zakresu dają tylko rezygnację → Treasure (zakres tożsamy
z bramką, L48).

**Wycena bota:** `set_base_pt_creatures_you_control` w IDEMPOTENT_EOT_EFFECTS
(B1), `buff_creature_until_end_of_turn` klasyfikowany po znaku w
effect-intent (618), `return_card_from_graveyard_to_hand` w REVIEWED_UNVALUED
(własna karta z grobu). Golden-master bota zregenerowany (batch zmienia
partie), progi win-rate bez zmian.

**Talie (ADR 0023):** Kaladesh dobiło do 15 kart i auto-awansowało z worka do
własnej talii (M181); Thunder Junction wróciło do `worek-dziki` (bilans:
legendy 18, dzikie 17).

**Wynik:** `npm test` **4113/4113** (+28 testów `test/batch52-kart.test.js`),
test:all **4123/4123**, build **57 modułów / 3065.1 kB**.

## M279 — Żywy Tester na batchu 52 + audyt wyceny bota (2026-09-01, PR #92)

Zlecenie właściciela: „testy Żywym Testerem na taliach z nowymi kartami
i baczny audyt poprawności kart oraz poprawności bota w ich użyciu".
Metodyka `docs/setup/TESTER_STOLU.md`.

**Karty:** 28 testów batch 52 zielonych; żywe partie potwierdziły kluczowe
zachowania (Leonin draw z grobu, Cemetery Recruitment zwrot, Fourth Bridge
Prowler odmowa celu bez wrogiego stwora). Zero zgłoszeń detektorów dla nowych
kart (2 „noop” z Discover = pre-existing, poza batch 52).

**Bot — trzy luki wyceny zamknięte u root cause (+5 testów regresyjnych
`test/batch52-bot-wycena.test.js`):**

- `return_card_from_graveyard_to_hand` (Cemetery Recruitment) — wyjście z
  REVIEWED_UNVALUED: card advantage + ciało + bonus `drawIfSubtypes` (Zombie);
  warianty celu przestały remisować.
- `set_base_pt_creatures_you_control` (Jolrael) — wycena sumy zmian P/T +
  okno; bot przestał aktywować X/X, gdy osłabiało własną planszę.
- zdolności `fromGraveyard` — `abilityObject` rozszerzony o `zoneCard` (L41),
  więc `draw_cards`/scry/token z grobu dostają realną wycenę zamiast gołych 2 pkt.

Golden-master bota zregenerowany (świadoma zmiana wycen), progi win-rate bez
zmian.

**Wynik:** `npm test` **4118/4118** (+5 testów `test/batch52-bot-wycena.test.js`),
test:all **4128/4128**, build **57 modułów / 3069.2 kB**.

---

## M281 (2026-09-02) — Audyt PR #92: pięć znalezisk pętli jakości (arena/01a06193, PR #93)

> **Uwaga numeracyjna (żeby nie szukać dziury):** M280 figuruje w
> `docs/audits/AUDYT_M280_AF_ZYWTESTER_2026-09-02.md` i w
> `docs/PROJECT_HISTORY.md`, ale nie dostało wpisu tutaj — stąd przeskok
> M279 → M281. Uzupełnianie M280 *post factum* byłoby falsyfikowaniem
> rejestru, więc zostaje adnotacja.

Sesja bez nowego tematu od właściciela („kontynuujemy projekt") → pętla
domyślna ADR 0021: PR przed kodowaniem, audyt ostatnio scalonego PR-a,
każdy commit osobno zielony.

**Co wyszło z audytu (detale: `docs/audits/AUDYT_PR92_2026-09-02.md`):**

| # | defekt | naprawa | commit |
|---|---|---|---|
| 1+2 | dwa `pending*` poza odciskiem stanu, a strażnik L16 vacuous (ground truth z ciała-delegata = `[]`) | skan obu ciał + próg liczebności + pin nie-vacuous + `pendingWardPay`/`pendingExileCast` w `PENDING_DECISION_FIELDS` | `fb92c01` |
| 3 | Jolrael liczył „drugie dobranie" ze STANU; trzy ścieżki podnosiły licznik rozjechanie → batch 1+2 dawał 2 triggery, 2+1 zero | choke point `recordCardDrawn` stempluje `drawNumberThisTurn` w `card_drawn`; mulligan jawnie `null` (CR 701.3b) | `094a8c0` |
| 4 | grupowe triggery „one or more … deal combat damage to a player" dedupowane po KONTROLERZE → druga instancja zdolności milczała (CR 603.3) | klucz per żywiciel + indeks zdolności + filtr + poszkodowany | `0b409fd` |
| 5 | oferta Discover zawężona (M280/F), walidacja została szersza → fizzle poza ofertą; trzy kopie filtru rozjechane | `outsideHandCastScope(card, { allowTargets })` — jeden predykat dla ofert i walidacji Discovera i Vaana | `10f7a39` |

**Przegląd mechaniczny (punkt 2.3 planu):** 68 nazw `pending*` w silniku,
64 blokują priorytet, 68 w projekcji odcisku (100%); 4 pozostałe to
księgowość przejściowa sparowana z prawdziwą decyzją — sprawdzone ręcznie,
nie tylko policzone.

**Bramy:** `npm test` **4143/4143**, `npm run test:all` **4153/4153**, build
**57 modułów / 3084,1 kB**, `node --test test/bot-benchmark.test.js` **10/10**,
`tools/event-contract-audit.mjs` i `tools/family-audit.mjs` bez naruszeń,
`tools/oracle-coverage.mjs --only` dla 9 kart batchu 52 = **100%**. Zero nowych
kart, zero zmian w UI, zero zmian wycen bota (golden-master nietknięty).

**Strażnicy klasy (punkt 2.2 planu):** rodzina pól `draws` w
`tools/family-audit.mjs` (każdy zapis `cardsDrawnThisTurn` poza `players.js` =
naruszenie) oraz `CONTRACT_REQUIRED_FIELDS` w `tools/event-contract-audit.mjs` —
te drugie powstało, bo przy testowaniu własnego założenia wyszło, że reguła
większościowa (`CONTRACT_RATIO = 0.6`) nie widzi brakującego pola w rodzinie
dwuemiterowej (1/2 = 50%). Oba strażniki mają piny anty-vacuous (próbki
`bypass`/`legal` w `test/family-audit.test.js`, syntetyczni emiterzy w
`test/m273-kontrakty-zdarzen.test.js`).

**Lekcje:** L48 rozszerzone o „zawężenie samej oferty nie domyka luki";
odkrycie, że `addObject` odrzuca pola spoza kontraktu (L21), udokumentowane
w teście — bez tego pozytywowana ścieżka Vaana wydaje się zepsuta.

**Otwarte (trafiło do `docs/backlog.md`):** siostrzana grupa `leftBattlefield`
(też per kontroler), Treasure Vaana składany ręcznie zamiast z katalogu
tokenów (klasa L107), brak `rulings` w snapshotach Scryfall, kicker na
instant/sorcery (Merfolk Falconer).


## M282 (2026-09-02) — Audyt PR #92 tura 2: cztery rozstrzygnięcia właściciela w kodzie (arena/01a06193, PR #93)

Tura 1 zrobiła rozpoznanie i raport (`docs/audits/AUDYT_PR92_2026-09-02.md`),
tura 2 wdrożyła odpowiedzi właściciela na cztery pytania. Details w §9 raportu;
tu sedno.

**Rulingi stały się danymi w repo.** `tools/fetch-card-rulings.mjs` czyta `set`
+ `collector_number` ze snapshotu karty, pobiera `…/rulings` z API Scryfalla
(przez `fetch_page` — `curl` z sandboxa nie ma egressu) i dopisuje
`rulings`/`rulingsSource`/`rulingsPobrano`. Idempotentne; pusta lista znaczy
„ściągnięto, WotC nie ma nic". 9 kart batchu 52 ma teraz rulingi, punkt
kontrolny „rulingi do snapshotu" wszedł do `docs/cards/HOW_TO_ADD_CARD.md`.

**„Start your engines!" to akcja stanowa (CR 603.3 + ruling 2025-02-07), nie
trigger ETB.** Karty deklarują zdolność `static` z `effect: [{type:
'start_engines'}]`; `runStateBasedActions` ma jeden pass, który pyta
`effectiveAbilities` permanentów pola bitwy — dzięki temu działa przejęcie
cudzego permanentu z silnikami i zdolność nadana, a prędkość nie cofa się po
utracie źródła. Zapis wyłącznie przez choke pointy `setPlayerSpeed` (klamra
0..4 + zdarzenie `speed_changed`) i `startEnginesFor`; rodzina pól `speed`
w `tools/family-audit.mjs` pilnuje, że nikt nie pisnie `.speed` z boku. Zero
nazw kart w rdzeniu (ADR 0002 w wersji właściciela: „engine headless,
name-agnostic").

**Okno rzutu z wygnania = decyzja, nie stempel.** Ruling WotC 2025-02-10 dla
Vaana: „You can't wait to cast it later in the turn". Efekt nie zakłada już
`playableUntilTurn`; uprawnienie do rzutu z exile i poza timingiem nosi flaga
`abilityWindowCast` (renoma dawnego `vaanCast` — nazwa karty w rdzeniu).
Dzięki temu nie ma „czego zapomnieć wyczyścić" — okno znika razem z decyzją.

**Jeden Skarb.** `TREASURE_TOKEN_EFFECT` w `src/engine/tokens.js` zastąpił trzy
ręczne kopie deskryptora w rdzeniu (Stash, Marut, rezygnacja Vaana), a katalog
`token_treasure` dostał wreszcie własną zdolność (wzorzec `token_food`) —
test `audyt-treasure-katalog` porównuje oba źródła i skanuje cały katalog pod
kątem `create_token` dla Skarbu (6 literali po stronie kart, pin anty-vacuous).

**Kicker na instant/sorcery (decyzja: „oczywiście obsłużyć").** `castSpell`
dostał `kicked`: walidacja, pipy kickera w wymaganiach, koszt poza obniżkami
(CR 601.2f), `wasKicked` na obiekcie stosu (CR 702.33a) i `kicked` w
`spell_cast` — czyli dokładnie tam, od czego `triggers.js` czekał dla Merfolk
Falconer. Oferta enumeruje wariant kicked z tą samą arytmetyką co płatność
(L48), UI dostał klucz grupowania, etykietę i liczenie kosztu; ścieżki modalna
/X/Fireball dostają JAWNY błąd zamiast cichego zignorowania.

**Grupowanie wyzwalaczy deklaruje karta.** Tag `trigger.groupPer`
(`'affected_player'` | `'controller'`) + jeden `mayFireGrouped` w rdzeniu
zamiast dwóch osobnych zbiorów dedupu rozłączanych po nazwie zdarzenia.
Przy okazji padł prawdziwy błąd: `combat_damage_to_you` dedupowało po graczu,
więc druga kopia tego samego artefaktu nie wyzwalała (CR 603.3). Test
katalogu pilnuje, żeby każda zdolność grupowa miała tag — bez tego cisza w
danych oznacza dziś zmianę zachowania.

**Lekcje:** L114 (kontrola mutacji musi ZACISKAĆ bramkę, nie ją poluzowywać —
odwrócona mutacja puściłaby test bez wartości), L115 (agregacja to fakt
drukowany na karcie; mierzyć liczbą wyzwań, nie skutkiem, gdy decyzja blokuje),
L116 (harness: `createGameState` bez talii ma puste strefy, `addObject` nie
kolejkuje triggerów — testy regułowe muszą iść komendami).

**Budżet lektury startowej.** Dopisanie L114–L116 przepełniło próg 100k
tokenów (`test/dokumentacja-budzet-lektury.test.js`), więc rejestr został
skondensowany: kotwice linkują krótko (`[L21]`), narracja L91 i L106 poszła do
nowego `docs/LESSONS_PRZYPADKI.md` (archiwum, nie lektura), a przy okazji
sklejona głowica wpisu L105 odzyskała własny nagłówek. Lektura: ~99,84k.
**Bramy:** `npm test` **4168/4168**, `npm run test:all` **4178/4178** (~250 s),
`npm run build` **57 modułów / 3097,4 kB**, `family-audit` i
`event-contract-audit` bez naruszeń, zero zmian w katalogu kart poza
deskryptorami (tagi grupowania, zdolność tokenu Skarbu, zdolność `static`
dwóch silników), zero zmian wycen bota (golden-master nietknięty).

## M283 (2026-09-02) — Audyt PR #92 tura 3: API, fakt w danych, rodzina pól, kontrzenie zdolności (arena/01a06193, PR #93)

**Ogon `options` w `castSpell`.** Sześć flag pozycyjnych (kicker,
`abilityWindowCast`, madness, warp, freeImpulse, `phyrexianPayWithLife`)
sklejone w jeden obiekt `options`, tak jak `castPermanent` robi od początku.
Sama zmiana jest zerowa behawioralnie; wartościowa jest jej konsekwencja —
`requireSpell` i trzej wołający przestali się mijać o jedno przesunięcie
argumentu, a to był mechanism, w którym taki błąd jest niemy (pozycja jest
`undefined`, nie błędnym typem).

**Skarb przestał być nazwą karty w rdzeniu.** Kolory jednostki to dana
deskryptora (`effect.colors` w katalogu tokenów, w `TREASURE_TOKEN_EFFECT` i w
sześciu efektach `create_token`, które ich nigdy nie miały), zdolność czyta
`treasureManaAbilityOf` po koszcie `{T, sacrificeSelf}` i znaczniku
`fromTreasure`, a `player.treasureManaColors` niesie kolory tego, co faktycznie
wyprodukowano. Wpis `'token_treasure'` w `MANA_SOURCE_MAP` zniknął — mapa,
która sama siebie oskarżała w komentarzu o bycie „cieniem danych karty", trzymała
tę samą regułę co dwa literały w `resources.js`. Dwie mutacje (przywrócenie
porównań po `cardId`; usunięcie kolorów z danych) RED-ują właściwe testy — fakt
mieszka tam, gdzie powinien.

**Okno impulsu ma właściciela.** Nowy `src/engine/impulse-window.js` to jedyny
pisarz `playableUntilTurn`/`playableWithoutPaying`; siedem zapisów w dwóch
plikach i trzynaście odczytów w czterech przeszło przez pięć funkcji. Audyt
rodzin (`tools/family-audit.mjs`) dostał rodziny `impulse-window` i
`impulse-free-cast` — wcześniej pola te nie miały nadzoru właśnie dlatego, że
nikt nie wpisał ich do `FIELD_FAMILIES` (wątek 4 z HANDOFF tury 2).

**Zdolność na stosie daje się skontrować.** Stifle (CNS #108, snapshot z
rulingami WotC) + typ celu `ability_on_stack` + efekt `counter_ability` przez
wspólny `counterStackObject`; `playerView` projection dostał `abilityEffects`,
żeby bot i stół widziały, CO jest kontrace (ADR 0017). To zamknęło pytanie z §9
o `pendingExileCast` Vaana: skontrowany trigger nie rozstrzyga się, więc nie ma
wygnania, nie ma Skarbu i nie ma decyzji (CR 118.12/608.2a) — a obrażenia, które
go uruchomiły, zostają. „Mana abilities can't be targeted" wyszło z konstrukcji
(CR 605.1a — zdolność many nie wchodzi na stos) i test 4 pilnuje, żeby nikt
tego nie „poprawił".

**Bramy:** `npm test` **4186/4186**, `npm run test:all` **4196/4196** (0 fail),
`npm run build` **58 modułów / 3111,8 kB**, `family-audit` (dwie nowe rodziny)
i `event-contract-audit` bez naruszeń, `npm run benchmark` **bez zmian**
(heuristic 82,7%, aggro 28,9%) — nowa karta nie gra w BENCH_DECKS, progi
regresji nietknięte. Rejestr lekcji nietknięty: budżet lektury startowej ma
455 B zapasu (M282), więc narracja tury poszła do §10 raportu
`docs/audits/AUDYT_PR92_2026-09-02.md`, nie do `docs/LESSONS.md`.

## M284 (2026-09-02) — budżet lektury startowej odzyskany kondensacją rejestru (PR #93, tura 4)

Decyzja właściciela: miejsce w lekturze startowej robi się **streszczeniem, nie
podniesieniem progu**. `docs/LESSONS.md` 151 441 → 113 852 B (75 z 116 wpisów w
postaci: nagłówek + jednozdaniowy `**Przypadek**` + `**Reguła**` + `**Strażnik**`
+ odsyłacz), cała proza (Objaw, Przyczyna, tabele wariantów, dowody mutacyjne) w
`docs/LESSONS_PRZYPADKI.md` pod tym samym numerem — 2 272 → 65 885 B, plik poza
lekturą obowiązkową. Lektura startowa: 242 564 B / 280 000 (zapas zamiast 455 B
jest ~80-krotnie większy), `AGENTS.md` §0 dostał wpisany przepis, jak to robić.

Wzorzec wpisu w rejestrze opisuje stan faktyczny (bez pól Objaw/Przyczyna), a
`test/docs-decisions.test.js` pilnuje samego wyniesienia: odsyłacz musi mieć
adresata w archiwum, archiwum nie może śmiecić wpisami bez lekcji, skrót musi
zostać regułą (≥50 wyniesień, zakaz powrotu prozy do templatu). Przy okazji
naprawione dwie wady rejestru z PR #92: urwany cytat w L91 i pospolite `.**` na
końcu ośmiu linii odsyłacza w kotwicach.

**Bramy:** `npm test` **4187/4187**, `npm run test:all` **4197/4197** (0 fail),
`npm run build` bez zmiany (**58 modułów / 3111,8 kB** — zmiana jest dokumentacyjna
plus jeden test), strażnicy dokumentacji **24/24**. Commity: `19ab3ed`, `dbf5b16`,
ten dokumentacyjny. Numery w message `dbf5b16` (240 265 / 39 735 B) są sprzed
ostatniej edycji nagłówka rejestru; stan końcowy to wiersz wyżej.

## M285 (2026-09-02) — audyt bota: punkty remisu jako miara braku wyceny; wybór lądu scored (PR #93, tura 5)

**Pomiar.** `tools/bot-tie-audit.mjs` (nowe narzędzie, eksport `audytRemisow`) rozgrywa
12 partii parami talii spoza próbki benchmarku i klasyfikuje każdą decyzję z
`bot.trace()`: `single` / `decided` / `tie_top` / `tie_all`. Stan przed: 5340 decyzji,
1025 z alternatywami, 312 remisów na maksimum (30,4%): `block` 188, `play_land` 75,
`attack` 35. Remis = wybór arbitralny = identyczny skutek jak brak wyceny, niewidoczny
w źródle. Równoległy przebieg Żywego Testera (8 gier, 3 profile): „brak zgłoszeń" w 8/8
transkryptach, więc wartość audytu leży po stronie scoringu, nie mechaniki.

**Naprawa `play_land`.** Baza 90 + `landPlayDelta` ∈ [-14, 16]. `landAnaliza` liczy
fakty deklaratywnie (ADR 0002): kolory kandydata przez nowy
`manaSourceOfCardDefinition` w `src/engine/mana-sources.js` (CR 305.6 + deskryptor
zdolności), lądy na polu bitwy przez `getSourceForObject`, zapotrzebowanie ręki przez
`coloredPipsOf`. Preferencje: pokrycie pipów (monotonicznie 10/12/14/15/16), pierwszy
kolor +3, {T}: Add {C}{C} +4, zdolność niemanowa przy bazie ≥2 +2, `entersTapped` −8,
bezbarwny przy brakach −3. `summarize` dla lądu nosi karte (`play_land(id:cardId)`),
`tieProjection` wystawia wejścia delty do śladu — bramka liczy groźby na nich, nie na
tożsamości wariantów, więc lądy zamienne moga pozostać w remisie.

**Reguła z tego odcinka:** sufit klampy psuje porządkowanie. Wersja „10 + min(6, n−1)
per kolor ze wspólnym min(16, suma)" gniotła pokrycie 2 i 3 pipów do tej samej liczby —
remis przy róźnych danych. Wykrył to audyt na grach; test jednostkowy („lepszy ląd
wygrywa") przechodził. Mapowanie musi być monotoniczne w zakresie, który realnie
występuje, a nie „wystarczająco duże".

**Bramy:** `npm test` 4192/4192, `npm run test:all` i build w wierszu ponizej, benchmark
quick: heuristic **83,6%** (przed 82,7%), aggro 28,9% bez zmian. Commity: `16fec68`.

## M286 (2026-09-02) — audyt bota #2: klasyfikacja no-opów i saturacja metryki (PR #93, tura 6)

**Problem drugiego rzędu.** M285 dał liczbę (30,4% remisów), ale liczbę
nieużyteczną: 208 z 308 remisów to nadwyżka oferty silnika (`block[]`/`attack[]`
obok `pass_priority` w tym samym kroku), a nie dylemat bota. Wycięcie tej klasy
poprzedził **dowód regułowy** (test 1 w `test/audyt-bot-walka-remisy.test.js`):
`declare_blockers{}` i pass obrońcy w kroku bloków prowadzą do identycznego stanu
po obrażeniach — badane: życie, skład i tapnięcie stołu, krok fazy. Bez tego testu
klasyfikacja byłaby założeniem.

**Druga strona tego samego błędu.** Reguła „brak projekcji u którejkolwiek opcji ⇒
bez danych" zacierała realne przeoczenia (null przy `pass_priority` pochłaniał
całą decyzję). Narzędzie odrzuca teraz opcje bez projekcji i orzeka na reszcie —
wypłyneły 4 groźby (2 block, 2 attack). Jednocześnie surowa suma siły ataku
okazała się złą osią: przy ataku śmiertelnym 16 i 17 obrażeń to ten sam wynik
partii, a obrona w domu nie ma znaczenia, bo gra się kończy. Projekcja walki
saturuje więc na lethalu (`sila = min(sila, życie wroga)`, `obronaWDomu` tylko
dla ataków nieśmiertelnych).

**Reguła:** metryka audytowa ma pytać o dane, które mogą zmienić wynik partii —
każde inne rozszerzenie porównania produje findingi pozorne i zużywa zaufanie do
prawdziwych. Dotyczy to też liczników zbiorczych: zanim wyłączysz klasę przypadków
z pomiaru, udowodnij w teście, że jest równoważna.

**Bramy:** `npm test` **4195/4195** (3 nowe testy), golden-master regenerowany
przez metadane śladu (wagi bez zmian), benchmark quick **heuristic 83,6% /
aggro 28,9%** — identycznie, co jest tu wynikiem pożądanym. Commit: `cf978f0`.

## M287 (2026-09-02) — wycena rzutu stwora poznała cenę many; projekcje rzutów i zdolności (PR #93, tura 7)

**Znalezisko.** Grzechotka audytu (M286) zmierzyła 4 na 8 remisów `cast_permanent`
pomiędzy parami stworów o identycznym korpusie i **różnym koszcie** (ex aequo 73,8
/ 74,7 / 71,1). Formuła gałęzi to `creatureBase + power × 2 + toughness × 1` — bez
żadnego składnika kosztowego, więc „tempo" nie istniało w wyborze, choć istniało w
każdym innym miejscu projektu. Naprawa: `creatureManaCostWeight` (nowy nazwany
parametr, domyślnie 1 punkt za punkt many, tj. mniej niż waga siły, żeby większy
korpus obronił swoją cenę) odjąć od wyniku rzutu stwora.

**Akceptacja wyłącznie liczbowa** (plan wymagał benchmarku, nie testu), z baseline'em
zmierzonym na tej samej próbie (`git worktree` na `HEAD`): quick 83,6% → 83,8%;
`--seeds 24` 2016 meczów: **85,7% → 85,5%** (Δ = −3 mecze, czyli szum). Werdykt:
**neutralne**, przyjęte ze względu na lukę modelową (formuła bez składnika ceny),
nie ze względu na win-rate — próg planu brzmiał „brak regresji". Plus 4 testy jednostkowe (`test/audyt-bot-cena-stwora.test.js`) z pinem
arytmetycznym `Δwyniku = Δkoszt × waga × waga rodziny` — 3,6 dla 4 many, bo
`permanent` ma wagę 0,9.

**Projekcje dalej.** `cast_*` i `activate_ability` dostały `tieProjection`, więc
21 remisów, o których pomiar milczał, stało się mierzalnych: wszystkie okazały się
równe po stronie danych (0 groźb). Przy okazji wypadły dwie wady samej metryki:
suma P/T jako „wartość ciała" (model gorszy niż mierzony kod — siła i
wytrzymałość ważą inaczej) oraz „obrona zostawiona w domu" (fałsz regułowy: atak
tapuje do *naszego* następnego kroku odświeżania, CR 502.3, wyjątek „doesn't
untap" ma osobną gałąź). Oba pola usunięte; dla rzutów została jedna liczba
`waluta` = wycena korpusu minus koszt.

**Cofnięte świadomie:** rozszerzenie `summarize` o `cardId` dla `cast_*` — ~19
testów (m234/m235/m247/m257/batch52) parsuje format `cast_*(objectId)`; wariant
jest w nim rozstrzygalny, a dane różnicujące niesie projekcja. Zysk czytelności
nie był wart przepisania pinsów pilnujących wyceny.

**Bramy:** `npm test` **4199/4199** (4 nowe testy + grzechotka przerobiona na
sufity per kind), golden-master zregenerowany (świadoma zmiana wyceny), benchmark
`--seeds 24`: heuristic 85,5% (baseline 85,7%) / aggro 24,5% / random 4,5%. Commity: kod z testami,
osobno dokumentacja.

## M288 (2026-09-02) — uwagi właściciela z żywej gry A–D: picker, hover, equip, nakładka (PR #93, tura 8)

**Zakres.** Cztery uwagi po partii testowej, każda w osobnym comicie:
A „modal Knockout Maneuver jest inny niż modal blokowania — zróbcie jeden
elastyczny helper do efektów wielocelowych (logika per efekt, wygląd wspólny)";
B „karty specjalne (Undercity, Day/Night, Poison) mają powiększać się na hover,
teraz działa tylko klik"; C „bot w jednej turze przełożył Thieves' Tools
dwukrotnie — ukrócić"; D „w nakładce końca gry dodaj życia końcowe i — jeśli
koniec gry to wyczerpanie biblioteki — u kogo".

**B i A mają wspólny kształt usterki (L120):** komponent był poprawny, a
połączenie — nie. `renderUndercity` umiał hover od M153/C, ale `renderTableView`
podawał `hover` tylko Day/Night; test jednostyczny przechodził rok, bo podawał
stub sam. Kreator wielocelowy i kreator escape nie miały **ani jednej** reguły
CSS (`.multi-target-*`, `.escape-exile-*` nie istniały w `index.html`), więc ich
wiersze były gołymi `<button>` z marką `[ ]`/`[x]` w tekście i osobnym
przyciskiem „Podgląd". Naprawa: `src/table/picker.js` (`renderPickerRow` z
`kind` checkbox|radio, `group`, klasami rodzinnymi na `<input>`, uchwytami
`setChecked`/`setDisabled`) używany przez kreator celów (lista, pozycje,
poświęcenie, mulligan), wizard atakujących/bloków i kreator kosztu escape;
`attachSpecialCardHover` jako jedyne miejsce podłączania hovera + reguły
`:hover`/`cursor` dla trzech kart specjalnych; tester stołu czyta teraz
`checked` (fallback na „[x]") i nazwę z `.picker-name`.

**C (wycena, nie limit).** Repro na zgłoszonej parze kart: sprzęt przypięty do
własnego 2/1 → oferta `activate_ability(tools#0->marut)` = **+11,00**, bo gałąź
przeniesienia liczyła wyłącznie `delta = power(cel) − power(nosiciel)` i nie
pytała, czy sprzęt w ogóle coś daje (Thieves' Tools nie mają pompy, a ich
warunkowa ewazja `cantBeBlockedMaxPower: 3` jest na 7/7 martwa). Zamiast
wprowadzać zakaz „jedno equipnięcie na turę" (CR 702.6a dozwala wiele aktywacji,
a zakaz zablokowałby *naprawę* błędnego nosiciela) — wydobyto wspólny predykat
`equipValuation(view, source, creature)` i podpięto go pod **obie** gałęzie:
przeniesienie nic-nie-dodaje = −12 (kara jak przy pierwszym założeniu),
przeniesienie budzące efekt = premia, przeniesienie za samym ciałem = dawne
`delta ≥ 2` (M100/E13 nietknięte). Po naprawie: → Marut −10,00 (bot pasuje),
→ Invoker +14 (naprawa dozwolona).

**D.** Etykiety przyczyn przegranej leżały w środku formatowania logu; wyniesione
do `LOSS_REASON_LABELS` + czysty `gameOverNotice(view, state)` (życia, przyczyny
z `player_lost`/`player_conceded`, dedup, fallback na `state.log`), a gałąź
kończąca `updateTurnIndicator` buduje spany `ti-result`/`ti-life`/`ti-reason`.
`life_zero` pomijany w nakładce — widać go po licznikach.

**Akceptacja C liczbowa, na tej samej próbie co zawsze** (`git worktree` na
`ae8bc24` vs kandydat, `--seeds 24`, 2016 meczów): **85,5% (1724) → 85,5%
(1723)**, Δ = −1 mecz = szum, aggro 24,5% → 24,6%, random 4,5% bez zmian.
Werdykt: **brak regresji** — przyjęto dla spójności modelu (ta sama zasada w obu
gałęziach), nie dla win-rate. Golden-master bota NIE wymagał regeneracji
(fixture nie zawiera pozycji z przeniesieniem sprzętu).

**Bramy tury:** `npm test` 4224/4224 · `npm run test:all` 4234/4234 ·
`npm run build` 59 modułów (picker.js) / 3140,2 kB · strażnicy dokumentacji 24/24
· 32 nowe testy w czterech plikach `test/uwagi-tura8-*.test.js` · partia Żywego
Testera (12 gier) poniżej w §13.4 raportu.

## M289 (2026-09-02) — Pompa ważona tym, co nosiciel umie z nią zrobić (PR #93, tura 10)

**Zgłoszenie (pytanie kontrolne po uwadze C):** „gdyby były dwie kreatury, którym
obu ten equipment daje pompę, to czy zablokowane jest bezsensowne wydawanie many na
dwukrotne przerzucanie? Chodzi o to, żeby wybrał najlepszy cel i tam już zostawił,
a nie zaraz przerzucał na inną kreaturę, której też coś daje, zabierając go z tej
pierwszej lepszej".

**Czyta się w dwie strony i obie zostały zmierzone.** (1) Ruch boczny jest
zablokowany: dwa atakujące ciała o tej samej sile, sprzęt daje im tyle samo →
oferta przeniesienia −4,00 przy passie 0,00 (Wooden Stake na Highland Game 2/1 z
kandydatem Leafcrown Dryad 2/2; Brawler's Plate +2/+2 z trample'em na tej samej
parze — samo −4,00, bo w tym miejscu modelu nie ma osobnej wagi kosztu aktywacji).
Schody 2/1 → 2/2 → 7/7 dają JEDEN krok na najlepsze ciało (+10,00 na Maruta,
−4,00 na ciało pośrednie), więc drugiego opłaconego equipu w turze nie ma. Drabina
`wornByMine` jest antysymetryczna, a to znaczy, że X->Y i Y->X nie mogą być dodatnie
jednocześnie — ping-pong nie ma jak powstać; sprawdzane na wszystkich 40 parach
(5 ciał × 2 sprzęty), z wymuszeniem ≥3 dozwolonych awansów, żeby test nie przechodził
przez pusto. (2) Ale ta sama drabina potrafiła ZAKOTWICZYĆ pompę na ciele, które
nie umie jej użyć: na defenderze 3/2 ładunek (+1/+0) wyceniał się identycznie jak na
atakującym 3/2, więc przeniesienie za {1} było karane −6. To nie jest marnotrawstwo,
to utracona poprawka (L121).

**Naprawa (jedyne miejsce):** w `equipValuation` wartość siły zależy od
spożytkowania — ciało z `cantAttackStatic` albo takie, którego obrażenia zapobiega
ochrona blokera (`attackerNeutralizedByProtection`, CR 702.16c), liczy połowę wagi
pompy (siła wciąż decyduje o bilansie bloku), reszta planu bez zmian:
`value = (jałowy ? pumpPower : 2·pumpPower) + pumpToughness + ofensywne`. Zmiana
siedzi w definicji, więc obie gałęzie equipu dostają ją gratis (L28), a relacja
„lepszy dom" pozostaje antysymetryczna (funkcja zależna od pary sprzęt-nosiciel,
nie od kierunku ruchu). Po naprawie: Merfolk-defender → Undead Servant +7,00
(wcześniej −4,00), Monastery Flock 0/5 → Undead Servant +7,00 i bot płaci, ruch
boczny między atakującymi zostaje −4,00.

**Akceptacja wagowa:** `git worktree` na `54c4371` vs kandydat,
`node tools/benchmark.mjs --seeds 24` (2016 meczów) — wynik w §13.7 raportu; progiem
planu jest brak regresji, a nie wzrost. Bramy: `test/uwagi-tura9-bot-rowne-ciala-equip.test.js`
8/8, subset reżimu bota 242/242, `npm test` 4240/4240, `npm run test:all` 4250/4250.

## M290 (2026-09-02) — Jakość ciała nosiciela w wadze pompy sprzętu (PR #93, tura 11)

Kropla po M289: wycena ładunku patrzyła, czy nosiciel WOGOLE może zaatakować, ale nie
patrzyła, czy jego cios przejdzie przez ścianę. Efekt: para „vanilla 3/2 z pompą" vs
„latacz 3/3 bez niczego" była dla drabiny `wornByMine` równa w obie strony (−4,00 i
−4,00), więc sprzęt zostawał na gorszym ciele, a właściciel słusznie nazywał to
„przerzucaniem na pierwszą lepszą". `equipValuation` (src/controllers/heuristic-bot.js)
dostaje trzeci stopień wagi siły:

    wagaSily = atakJałowy ? 1 : (2 + (bearingEvasion ? 1 : 0))

`bearingEvasion` = `creature.cantBeBlocked` ALBO latanie nosiciela przy blokerach bez
latania i bez reacha — czyli TA SAME przesłanka, którą funkcja stosuje do ewazji
GRANTOWANEJ przez sprzęt, tylko czytana ze stanu nosiciela. Liczona raz, w definicji
wyceny (L28/L121), więc obie gałęzie equipu dostają ją gratis i nie da się jej
podwoić w `ofensywne` (pilnuje tego T11/8).

Pomiar (Wooden Stake +1/+0): D4 3/2 → latacz 3/3: −4,00 → +7,00 (bot płaci {1} i robi
ruch); D3 w drugą stronę: −4,00 (bez zmian); para o IDENTYCZNYCH statystykach
(gorehorn-minotaurs vs angel-of-the-dawn, 3/3 vanilla vs 3/3 latacz): −4,00/−4,00 →
+7,00/−4,00 — to dokładnie ten wypadek, który backlog §3 zostawiał „świadomie
netknięte". Ściana kasuje premię: z wrogim reachem albo wrogim lataczem D4 wraca do
−4,00, więc premia nie jest premią za kartę z lataniem. Świadomie NIE ruszone: gałąź
pierwszego założenia (FRESH) — tam waga nadal idzie od mocy nosiciela i dla pary
3/2 vs 3/3 daje remis 18,00/18,00 (pin T11/7); jej piny siedzą w kilkudziesięciu
testach i zasługują na osobny commit z osobnym A/B.

Akceptacja wagowa: benchmark A/B `node tools/benchmark.mjs --seeds 24` (2016 meczów),
baseline = `f6a5459` przez `git worktree`, profil identyczny: heuristic 85,5%
(1723/2016) → 85,5% (1724/2016), aggro 24,6% (248/1008) → 24,5% (247/1008), random
4,5% (45/1008) → 4,5%. Zero regresu, jeden przełączony mecz — zmiana broni zasady,
nie metryki. Bramy: rodzina equipu 17/17 (9 nowych T11 w
`test/uwagi-tura11-bot-jakosc-ciala-equip.test.js`, w tym antysymetria na siatce
6 ciał × 2 sprzętów = 30 parach kierunkowych).

## M291 (2026-09-02 → cofnięte 2026-09-03) — próba dwóch kart wielocelowych i luka w torze czaru (PR #93, tura 11)

**Ten kamień nie zostawia kodu.** Właściciel cofnął zgodę na dokładkę kart do
katalogu i nakazał usunięcie tego, co weszło; commit `0434199` (opisany niżej)
został zrevertowany, więc rejestr kart, `src/cards/mana-costs-data.js`,
`src/engine/spells.js`, `decks/*.txt`, fixture bota, sufit grzechotki i seed
scenariusza M101/D są w stanie z `f6a5459`. Wpis zostaje, bo dwie rzeczy z tej
gałęzi są warte odnotowania niezależnie od kart: zmierzona luka silnika i cena
wejścia jednej karty do repo.

**Zmierzona luka (nie naprawiona).** Fan-out „each of up to N" żył od M157 tylko w
torze triggerów (`src/engine/triggers.js`); tor czaru aplikuje efekty raz z pełną
tablicą celów, a `pump`, `grant_keywords_until_end_of_turn` i `damage` czytają
`targets[effect.targetIndex ?? 0]` w `src/engine/effects.js`. Praktyczny skutek:
każdy przyszły czar w stylu „up to two target creatures" pompowałby pierwszy cel
dwa razy, a drugi wcale. Patch, który był w drzewie i został wycofany: generyczny
deskryptor `allTargets: true` w pętli efektów `src/engine/spells.js` (aplikacja
per cel, `continue` przed obsługą `pendingSpell`, zakaz łączenia z efektami
blokującymi decyzję) + strażnik, że silnik nie zna żadnej nazwy karty (ADR 0002).
Wzorzec jest opisany w L123; wdrożenie czeka na decyzję właściciela o kartach
wielocelowych, bo bez takiej karty jest martwym kodem.

**Cena wejścia dwóch kart (pomiar, nie opinion).** Ścieżka to osiem bramek:
snapshot `docs/cards/scryfall-*.json` (tekst reguł 1:1 z API przez `fetch_page`,
egress nie był potrzebny — konkluzja z tury 10 była błędna), wpis w
`src/cards/card-data.js`, wpis w `src/cards/mana-costs-data.js` (strażnik pokrycia
w `test/card-data.test.js`), przydział talii WYŁĄCZNIE przez
`tools/generate-plan-decks.mjs` (ręczne przepisywanie talii zabrania L122 i ADR
0023), `npm run build`, `test/repo-decks.test.js` (M178 singleton + M228 sumy
nielandów 36 → 37, bo karta w planie >18 przestawia podział Innistradu),
`test/m138-audyt-stolu.test.js` (Z5, runtime etykieta slotów),
`test/bot-scoring-snapshot.test.js` (golden-master regenerowany NA KONIEC, na
gotowym drzewie), `test/audyt-bot-walka-remisy.test.js` (sufit `block` 4 → 5 po
atrybucji trzema drzewami — L124) i re-hunt seedu w
`test/panel-rozgrywka-tura-przeciwnika.test.js` (talia człowieka jest tam sztywno
`decks/innistrad-brg.txt`). Ostatnia pozycja to był rykosz, którego nie
przewidziałem: L25 dotyczy też testów scenariuszowych, nie tylko benchmarku.

**Weryfikacja po revercie:** `node --test` na rodzinie equip tury 9 i 11,
fixture bota, `test/repo-decks`, `test/card-data`, `test/card-sources-guard`,
`test/m138-audyt-stolu`, `test/m132-proporcje-landow`,
`test/m203-talie-testera-i-dokumentacji`, `test/panel-rozgrywka-tura-przeciwnika`,
`test/audyt-bot-walka-remisy`, `test/m195-multi-target` → **124/124**.
Baseline benchmarku wrócił do liczb z M290 (heuristic 85,5%, aggro 24,5%, random
4,5%), bo talie są znowu identyczne jak przy `358ee35`.
