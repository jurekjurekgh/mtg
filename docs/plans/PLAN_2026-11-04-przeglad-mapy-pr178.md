# PLAN 2026-11-04 — semantyczny przegląd mapy PR #178

## Cel

Kontynuować audyt #178 po zamknięciu wymuszonych RED A84–A113. Zmniejszać liczbę otwartych wierszy mapy wyłącznie przez rzeczywisty przegląd treści, nie przez sam zielony przebieg testów. Nie dodajemy kart, nie uruchamiamy pełnego B0, nie wdrażamy `NIE_WDRAZAC`, nie scalamy PR.

## Metoda każdego wiersza

1. Przeczytać cały plik i jego diff z PR #178 (`7aff9b6..04ca8e9`, pobrany przez `gh pr diff 178`).
2. Sprawdzić, czy asercje odpowiadają temu, co deklarują: rzeczywiste komendy, jawny setup syntetyczny, ukryta informacja, ostatni znany stan, kolejność, replay/fingerprint tam, gdzie potrzebne.
3. Porównać z Oracle z `docs/cards/scryfall-*.json` i przypiętym CR (SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`).
4. Uruchomić plik/partię i zapisać krótkie podsumowanie w `.arena/`.
5. Zamknąć wiersz mapy tylko z konkretną notą zakresu. Jeżeli pojawi się błąd: osobna reprodukcja RED, najmniejsza poprawka, mutacja, kontrole, pełny fast + build, osobny commit i push.

## Partia 1 — A10–A17 (wykonana)

- [x] A10 bestow/inwestycja; A11 powrót kreatora; A12 koszt kwalifikowany; A13 cel ląd-stwór; A14 wynik kreatora/convoke; A15 zarezerwowane źródła; A16 improvise; A17 rozstrzygnięcie celów.
- [x] Pełny przegląd ośmiu plików, diff PR #178, Oracle/CR, przebieg łączny **30/30 pass / 0 fail / 0 skip**.
- [x] Bez zmiany produkcji; mapa aktualizowana o noty zakresu. Nie zamyka to rodzin A84–A113 ponownie ani całego audytu.

## Partia 2 — kolejność/manualna płatność (kandydaci)

- [ ] A75–A93: APNAP ląd/walka/aktywacja/mana, Ward/manual, rupture/manual, optional/manual, kolory kreatora, Holdout, rezerwacje/atomiczność bramki, animowany koszt własny.
- Kryterium: ten sam przegląd pełnego pliku i diffu; szczególne ryzyko mylenia polityki bota z regułą CR oraz setupu syntetycznego z osiągalnym stanem.

## Partia 3 — dokumentacja historyczna

- [ ] `docs/PROJECT_HISTORY.md`, `AUDYT_PR177_2026-11-01.md`, `PR177_MAPA_PLIKOW_2026-11-02.md`, `PLAN_2026-11-01-audyt-pr177.md`, `HANDOFF_2026-11-01-audyt-pr177.md`.
- Kryterium: przegląd zmienionych fragmentów, spójność z obecnym stanem i jawne oznaczenie wpisów historycznych; brak zmian runtime.

## Bramy i przekazanie

- Dokumentacja: strażniki dokumentów + pełny fast/build, jeśli partia dotyka także testów lub kodu.
- Kod/test: RED→GREEN, mutacja, kontrole, pełny fast + build, osobny commit i natychmiast push.
- Przed końcem: pełny `test:all`, aktualizacja mapy/raportu/historii/handoffu/opisu PR, CI i `mergeable_state`.
- Fetch i porównanie przed każdym push; żadnych force push. Logi testów tylko do `.arena/`.
