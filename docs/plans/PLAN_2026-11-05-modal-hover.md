# PLAN 2026-11-05 — hover zamiast klikania w nazwę karty w modalach wyboru

## Zgłoszenie właściciela

> „Chciałbym zrobić taką zmianę UX-ową -> modale wyboru (mam nadzieję, że
> wszystkie tworzone są jedną zunifikowaną funkcją z opcjami, a nie 30 różnymi
> funkcjami dublującymi kod). Dzisiaj karty które wybiera się w modalach można
> kliknąć i wtedy otwierają się one na pełny ekran. Chciałbym to zmienić
> i zamiast klikania chciałbym zrobić hover. Czyli jak najadę nad nazwę takiej
> karty w modalu wyboru to otwiera mi się hover z ilustracją karty - dokładnie
> taki sam jak po najechaniu na kartę leżącą na stole albo na cmentarzu).
> Bez klikania. Klikanie w nazwę usuń."

Decyzje doprecyzowane przez właściciela (ankieta w sesji):

- **Dotyk:** na urządzeniach dotykowych tapnięcie w nazwę nadal otwiera pełny
  ekran — to jedyna droga podglądu bez kursora. Hover dotyczy wskaźnika
  precyzyjnego (mysz).
- **Zakres:** tylko modale wyboru. Log, stos i kafle na stole bez zmian — tam
  klik w nazwę nadal otwiera pełny ekran, a hover już działa.

## Rozpoznanie (pomiar, nie zgadywanie)

Modale wyboru NIE są 30 funkcjami. Stoją na jednym fundamencie:

- jeden modal `#choice-request` i jeden moduł `src/table/choice-request.js`,
- jeden wspólny wiersz wyboru `renderPickerRow` oraz lista chipów
  `renderPickerChipList` z `src/table/picker.js` (checkbox / radio / stepper /
  przycisk / chip),
- jeden komponent klikalnej nazwy-podglądu `renderPeekButton`
  (`choice-request.js`, M303),
- kreator many (`src/table/mana-wizard.js`) używa tego samego pickera.

Klik w nazwę = pełny ekran jest więc podpięty w DOKŁADNIE trzech miejscach
wspólnych: `renderPickerName` (wiersze), `renderPickerChip` (chipy) oraz
`renderPeekButton` (opcje decyzji i nagłówek clash). Reszta to przekazywanie
parametru `onOpenCard` / `onOpenCardByCardId` przez kreatory. Zmiana zachowania
ląduje w tych trzech miejscach i w okablowaniu `main.js` — nie w każdym
kreatorze z osobna.

Istniejący hover stołu: `showHoverPreviewAt` + `renderHoverPreview`
(`render.js`) z warstwą `els.hoverPreview`; dla miniaturek w modalu
„Rozgrywka" istnieje już `createScryfallHover(els)` — ten sam podgląd
Scryfall, tor stały. Modal wyboru ma dostać IDENTYCZNY wizualnie podgląd:
tę samą warstwę i ten sam renderer, zasilany informacją o karcie rozwiązaną
z identyfikatora wiersza (objectId → `cardInfo(session, obiekt)`;
cardId → szczegóły z katalogu sesji, jak w `openCardFullscreenByCardId`).

Pułapki:

- Nazwy wierszy niosą dziś klasę `log-card` + `dataset.cardId`, a delegacja
  kliknięć w `main.js` otwiera po nich pełny ekran globalnie. W trybie hover
  nazwa NIE może nieść tego haka, inaczej klik nadal otworzy kartę.
- Klik w nazwę wewnątrz `<label>` pickera przełączałby ptaszek — hover nie
  może zostawić martwego kliku, który zaznacza wiersz „przy okazji".
  W wierszu checkbox/radio klik w nazwę ma zachowywać się jak klik w resztę
  wiersza (zaznaczenie), a w stepperze/chipie nie robić nic.
- Elementy modala są przerysowywane pod kursorem (rerender po każdej zmianie
  wyboru) — sam `mouseenter` wtedy milczy; potrzebny jest `mousemove`-revive,
  jak w hoverze stołu (`revive` w `createScryfallHover`).
- Zakryte karty przeciwnika (FoW): hover nie może pokazać prawdziwej
  ilustracji karty, której gracz nie widzi — ścieżka objectId idzie przez
  `cardInfo`, który maskowanie już respektuje; ścieżka cardId dotyczy tylko
  kart jawnych dla decydenta.

## Etapy

- [x] Etap 1: testy RED w nowym pliku `test/modal-hover-nazwy.test.js`:
  wiersz pickera (checkbox/radio/stepper), chip i `renderPeekButton` —
  `mouseenter` w nazwę wywołuje hover z identyfikatorem karty, `mouseleave`
  go chowa, a `click` w nazwę NIE otwiera pełnego ekranu ani nie niesie
  `log-card`/`dataset.cardId`. Wariant bez hovera (dotyk): klik nadal otwiera.
  Dodatkowo strażnik źródła: picker nie zna już ścieżki „klik = pełny ekran",
  gdy podano hover.
- [x] Etap 2: `src/table/picker.js` — parametry `onHoverCard(id, event)` /
  `onHoverCardEnd()` w `renderPickerName`, `renderPickerChip` /
  `renderPickerChipList` i `renderPickerRow`; hover ma pierwszeństwo przed
  klikiem, `onOpenCard` zostaje wyłącznie ścieżką dotykową. Aktualizacja
  komentarza kontraktu pliku.
- [x] Etap 3: `src/table/choice-request.js` — `renderPeekButton` dostaje
  `onHover` / `onHoverEnd`; wszystkie kreatory (look/chipy, walka, podział
  obrażeń, wielocelowy, damage, escape, delve, search-batch) oraz
  `renderChoiceRequest` przepinają parametry hover obok dotychczasowych
  `onOpenCard*`. `src/table/mana-wizard.js` — wiersze Delve tak samo.
- [x] Etap 4: `src/table/main.js` — adapter hovera modala: rozwiązuje
  objectId/cardId na `info` i woła istniejący `createScryfallHover(els)`;
  okablowanie wszystkich wywołań kreatorów: przy dostępnym hoverze (mysz)
  podajemy wyłącznie callbacki hover, na dotyku — dotychczasowe `onOpenCard*`.
  CSS nazw: kursor/podkreślenie hovera zamiast pozoru klikalności
  (`index.html`, tylko klasy modalowe pickera).
- [x] Etap 5: istniejące testy przypinające stary klik w modalach
  (m.in. `m303-*`, `m293-*`, `m129-*`, `choice-request-ui`,
  `uwagi-2026-09-21-b-klik-w-nazwe-otwiera-obraz` w części modalowej,
  `m300/m301/m302`, `a-search-batch`, `look-wizard-contrast`) przepięte na
  nowy kontrakt BEZ osłabiania asercji o wyborze/kluczach sondy; testy panelu
  akcji i logu (poza zakresem) zostają przy kliku. Pełny `npm test`,
  `npm run build`, potem `npm run test:all`.
- [x] Etap 6: dokumentacja — plan odhaczony, wpis w `docs/PROJECT_HISTORY.md`,
  handoff `docs/setup/HANDOFF_2026-11-05-modal-hover.md`, opis PR #179;
  CI i `mergeable_state` potwierdzone po pushu.

Każdy zielony etap = osobny commit i natychmiastowy push (fetch/compare
przed pushem, nigdy force). Bez scalania, bez nowych kart, bez pełnego
benchmarku B0.

## Wykonanie (2026-11-05)

- Testy RED 1/5 → GREEN 5/5 (`test/modal-hover-nazwy.test.js`); mutacja
  (usunięcie podpięcia hovera w pickerze) 2/5 czerwonych, po przywróceniu 5/5.
- Istniejące testy modali NIE wymagały osłabiania: kreatory wołane bez
  callbacków hover działają w ścieżce dotykowej (klik), więc stare asercje
  o wyborze i kluczach sondy przeszły bez zmian (pakiety pokrewne 178/178
  i 192/192). Dwie poprawki po drodze: strzeżone wyprowadzenie callbacku
  hover w kreatorze wielocelowym (pusty hover nie wolno tłumić kliku
  dotykowego) oraz strażniki `typeof` przy propsach hover w `main.js`
  (harnessy wyciągające funkcje stołu do izolowanego kontekstu, wzorzec
  `typeof openCardFullscreenByCardId`).
- Bramy: szybki pakiet **9975/9975**, build **77 modułów / 5702,0 kB**,
  pełny `test:all` **10243/10243** (605,6 s), 0 fail / 0 skip.

## Etap 7 (dopytanie właściciela 2026-11-05): nazwa czaru na szczycie modala wyboru trybu

Pytanie właściciela: czy hover objął też nazwę karty na szczycie modala
wyboru trybu czaru modalnego („Rzucasz czar X, wybierz jego efekt") oraz listę
kart na szczycie kreatorów biblioteki (scry i podobne)?

Pomiar:
- Kreatory biblioteki: TAK — lista na szczycie to chipy wspólnego pickera,
  hover działa od etapu 2–4 (test HOVER/3).
- Wybór trybu: NIE w pełni — nagłówek to zwykły tekst z `choiceGroupTitle`;
  hoverowalna nazwa (`introCard`) działała tylko dla clash i Epic Experiment.

Zakres etapu:
- [x] Test RED: nagłówek kreatora wielocelowego z `introCard` osadza
  hoverowalną nazwę WEWNĄTRZ zdania nagłówka (bez dublowania nazwy),
  klik nie otwiera; bez `introCard` nagłówek bez zmian.
- [x] `renderMultiTargetWizard`: gdy zdanie nagłówka zawiera nazwę
  `introCard`, nazwa staje się segmentem-podglądem (hover/dotyk jak wiersze);
  w przeciwnym razie dotychczasowe zachowanie (nazwa na początku).
- [x] `main.js`: `introCard` dla ścieżek wyboru trybu (castMode,
  chooseModes — także krok „rzuć albo odmów", chooseOneOrBoth), z obiektu
  źródłowego decyzji; pozostałe kreatory bez zmian.
- [x] Bramy: `npm test` + `npm run build`, osobny commit i push; pełny
  `test:all` przed końcem zadania, aktualizacja historii/handoffu/PR.
