# HANDOFF 2026-11-05 — hover zamiast klikania w nazwę karty w modalach wyboru

## Stan

- Gałąź `arena/5d931b5a-mtg`, PR #179 (draft). Plan: `7534f5e`; kod: `ddf98bc`.
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

## Granice i następne kroki

- Bez scalania, force-push, nowych kart i pełnego benchmarku B0.
- Po pushu dokumentacji: potwierdzić CI bieżącego HEAD i `mergeable_state`, zaktualizować wiersz CI w treści PR #179.
- Wiersze-przyciski kreatora many (źródła many, wybór stwora do tapnięcia) nie miały wcześniej klikalnej nazwy (cały wiersz jest akcją), więc zakres ich nie objął; hover tam to osobna decyzja właściciela.
