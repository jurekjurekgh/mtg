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
- [ ] 🔒 definicje pierwszych realnych kart z polami `Set` i `Plan`;
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

Do zrobienia (bez pierwszej potrzebującej karty — świadomie odłożone):
triggered i static abilities zgodnie z regułami, załączniki wpięte w reguły engine.

**Exit:** zdolność aktywowana i token działają w pełnej partii przez protokół,
są opisywane po polsku w logu i odtwarzają się w replayu — potwierdzone testami.

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
      (modal z pełną twarzą, danymi i próbą ilustracji Scryfall);
- [x] rozwijane panele (`<details>`) dla akcji, logu i zapisu zamiast sekcji-karty;
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

- lista pierwszych realnych kart i ich dane `Set`/`Plan` (odłożona przez właściciela
  na koniec prac możliwych na danych syntetycznych);
- ~~docelowy rozmiar pierwszego formatu talii~~ — rozstrzygnięte 2026-08-01:
  bez minimalnej wielkości, talia dowolnej wielkości z kreatora;
- ewentualne dodatkowe reguły ponad minimalny sandbox.
