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

## Partia 2 — kolejność/manualna płatność (wykonana)

- [x] A75–A93: APNAP ląd/walka/aktywacja/mana, Ward/manual, rupture/manual, optional/manual, kolory kreatora, Holdout, rezerwacje/atomiczność bramki, animowany koszt własny.
- [x] Pełny przegląd 19 plików, diff PR #178, Oracle/CR, przebieg łączny **165/165 pass / 0 fail / 0 skip**.
- [x] Bez zmiany produkcji; odświeżono dwa nieaktualne komentarze w A86/A87. A84 ma już osobną poprawkę i mutację z wcześniejszego kroku.
- Kryterium utrzymane: polityka bota nie jest regułą CR, a setup syntetyczny jest opisany jako granica/kontrola.

## Partia 3 — rodziny naprawione w #179 (wykonana)

- [x] A94–A98 i A100–A108: pełny przegląd 14 plików, diff PR #178, przebieg **82/82 pass / 0 fail / 0 skip**.
- [x] Wiersze mapy domknięte jako przejrzane; A98/A100–A108 mają osobne poprawki i mutacje z wcześniejszych kroków, A94/A101 korekty asercji do CR.
- [x] Odświeżono komentarze A96/A97 i usunięto nieużywany alias w A94; bez zmiany asercji ani produkcji.

## Partia 9 — bestow/champion/converge/klątwa/Morbid (wykonana)

- [x] Pięć otwartych plików rodzin: typy bestow, champion na stosie, dobór many converge, upkeep klątwy, Morbid a bestow.
- [x] Pełny przegląd, diff PR #178, Oracle/CR; bez zmiany produkcji i asercji. Przebieg w łącznej bramie 20 pozostałych plików: **197/197 pass / 0 fail / 0 skip** (`.arena/next-audit/map-remaining-baseline.log`).

## Partia 8 — A59–A73 (wykonana)

- [x] Force Away, Frightful Delusion, Oak/Ivy, batch 71, Edifice/protection, Hounds, token/Morbid, Spider, Scorn/aury, Kaleidoscorch, inwestycje bounce, kwalifikatory i strefy wyszukiwania.
- [x] Pełny przegląd 13 plików, diff PR #178, Oracle/CR, przebieg **79/79 pass / 0 fail / 0 skip**. Bez zmiany produkcji i asercji.

## Partia 7 — A47–A58 (wykonana)

- [x] README/talie, Spire, proliferate/infect, Final Parting, Edifice, kontry, Rockslide, Hounds, etykieta Gila, Violent Urge, źródło ofiary, Elk.
- [x] Pełny przegląd 12 plików, diff PR #178, Oracle/CR, przebieg **51/51 pass / 0 fail / 0 skip**. Bez zmiany produkcji i asercji.

## Partia 6 — A35–A46 (wykonana)

- [x] Banquet, Reaver/finality, Anticipate, Trumpet Blast, Tail Slash, champion-bot, blok, klątwa, Cutthroat, Cuombajj, Tail-bot, Benevolent Blessing.
- [x] Pełny przegląd 12 plików, diff PR #178, Oracle/CR, przebieg **73/73 pass / 0 fail / 0 skip**. Bez zmiany produkcji; poprawiono literówkę URL w komentarzu A37.

## Partia 5 — A7–A9 i A25–A34 (wykonana)

- [x] A7 ostrzeżenia animacji, A8 priorytet zagnieżdżonej many, A9 opłata nielądowa; A25 delirium, A26 champion/kontrola, A29 Magma, A30 dane/talie, A31 champion/shroud/token, A32 transformacje, A33 bounce/stun, A34 poświęcenie/ochrona.
- [x] Pełny przegląd 11 plików, diff PR #178, Oracle/CR, przebieg **47/47 pass / 0 fail / 0 skip**. Bez zmiany produkcji i asercji.

## Partia 4 — dokumentacja historyczna (wykonana)

- [x] `docs/PROJECT_HISTORY.md`, `AUDYT_PR177_2026-11-01.md`, `PR177_MAPA_PLIKOW_2026-11-02.md`, `PLAN_2026-11-01-audyt-pr177.md`, `HANDOFF_2026-11-01-audyt-pr177.md`.
- [x] Przegląd zmienionych fragmentów diffu PR #178; cztery dokumenty #177 dostały banner stanu historycznego i odesłanie do bieżącego audytu #178/#179. PROJECT_HISTORY ma aktualne sekcje PR #179 na górze.
- Kryterium utrzymane: wpisy historyczne nie są pomiarami obecnego drzewa; brak zmian runtime.

## Bramy i przekazanie

- Dokumentacja: strażniki dokumentów + pełny fast/build, jeśli partia dotyka także testów lub kodu.
- Kod/test: RED→GREEN, mutacja, kontrole, pełny fast + build, osobny commit i natychmiast push.
- Przed końcem: pełny `test:all`, aktualizacja mapy/raportu/historii/handoffu/opisu PR, CI i `mergeable_state`.
- Fetch i porównanie przed każdym push; żadnych force push. Logi testów tylko do `.arena/`.
