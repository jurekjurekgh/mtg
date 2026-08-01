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
