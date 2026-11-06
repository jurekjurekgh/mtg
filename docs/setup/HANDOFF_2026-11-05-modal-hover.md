# HANDOFF 2026-11-05 — hover zamiast klikania w nazwę karty w modalach wyboru

## Stan

- Gałąź `arena/5d931b5a-mtg`, PR #179 (draft). Plan: `7534f5e`; kod: `ddf98bc`; etap 7 (nazwa czaru w nagłówku wyboru trybu): plan `64c071e`, kod `afa6d99`.
- Właściciel: w modalach wyboru klik w nazwę karty otwierał pełny ekran — zamiast tego najechanie kursorem pokazuje hover z ilustracją (dokładnie ten sam co na stole/cmentarzu). Klikanie w nazwę usunięte. Doprecyzowanie właściciela: na dotyku tap w nazwę nadal otwiera pełny ekran; zakres to tylko modale wyboru (log, stos i kafle stołu bez zmian).

## Co zrobiono

- Modale NIE są 30 funkcjami: jeden modal `#choice-request`, wspólny picker (`renderPickerRow` / `renderPickerChipList` w `src/table/picker.js`) i jeden komponent nazwy-podglądu `renderPeekButton`. Klik był podpięty w dokładnie tych trzech miejscach wspólnych.
- `picker.js`: parametry `onHoverCard(id, event)` / `onHoverCardEnd()` w wierszach (checkbox/radio/stepper) i chipach. Przy hoverze nazwa nie dostaje handlera kliku ani `log-card`/`dataset.cardId`; `mousemove` podnosi podgląd po przerysowaniu wiersza pod kursorem (wzorzec revive). `onOpenCard` zostaje wyłącznie ścieżką dotykową.
- `choice-request.js`: `renderPeekButton` z `onHover`/`onHoverEnd`; callbacki przepięte przez kreatory look (chipy), walki, podziału obrażeń, wielocelowy, damage, escape, delve, search-batch i siatkę `renderChoiceRequest`. `mana-wizard.js`: wiersze Delve.
- `main.js`: adapter hovera modala rozwiązuje objectId (przez widok i `cardInfo`, ukryte karty przeciwnika pomijane — mgła wojny) oraz cardId (katalog sesji) na informacje dla istniejącego `createScryfallHover(els)` — ta sama warstwa `hoverPreview` i renderer co stół. Przy propsach hover stoją strażniki `typeof` (harnessy wyciągające funkcje stołu do izolowanego kontekstu).

## Dowody

- NOWE testy: `test/modal-hover-nazwy.test.js` — RED 1/5 → GREEN 5/5; mutacja podpięcia hovera w pickerze 2/5 czerwonych.
- Pakiety pokrewne bez zmian w starych testach: 178/178 i 192/192 (ścieżka dotykowa zachowana, asercje o wyborze/kluczach sondy nietknięte).
- Bramy: szybki pakiet **9975/9975**; build **77 modułów / 5702,0 kB**; pełny `test:all` **10243/10243** (605,6 s), 0 fail / 0 skip.

## Etap 7 — nazwa czaru na szczycie modala wyboru trybu

- Dopytanie właściciela rozstrzygnięte pomiarem: chipy kreatorów biblioteki (scry/surveil/układanie) miały hover od etapów 2–4; nagłówek wyboru trybu czaru modalnego był zwykłym tekstem, a hoverowalna nazwa działała tylko dla clash i Epic Experiment.
- Teraz: `renderMultiTargetWizard` osadza nazwę `introCard` w zdaniu nagłówka bez dublowania („Rzuć: X (koszt…) — wybierz tryb:" — X jest segmentem-podglądem), a `main.js` podaje `introCard` dla castMode, chooseModes (też „rzuć albo odmów") i chooseOneOrBoth. Test `HOVER/6`: RED 5/6 → GREEN 6/6, mutacja segmentacji złapana; pokrewne modalne 100/100; fast **9976/9976**, build **77/5703,7 kB**, pełny `test:all` **10244/10244**, 0 fail / 0 skip.

## Granice i następne kroki

- Bez scalania, force-push, nowych kart i pełnego benchmarku B0.
- Po pushu dokumentacji: potwierdzić CI bieżącego HEAD i `mergeable_state`, zaktualizować wiersz CI w treści PR #179.
- Wiersze-przyciski kreatora many (źródła many, wybór stwora do tapnięcia) nie miały wcześniej klikalnej nazwy (cały wiersz jest akcją), więc zakres ich nie objął; hover tam to osobna decyzja właściciela.
