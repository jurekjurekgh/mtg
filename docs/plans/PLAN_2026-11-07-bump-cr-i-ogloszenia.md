# Plan 2026-11-07 — bump pina CR do wydania 2026-11-06 + ogłoszenia modala „Rozgrywka" (PR #181, kontynuacja)

Zlecenie właściciela: „zrób 1 i 2 zgodnie z sugestią" — dwie otwarte pozycje z
`docs/setup/HANDOFF_2026-11-06-audyt-pr180.md`. Kontynuacja sesji
`arena/b2771170-mtg` (PR #181); drugi reset workspace w sesji odzyskany
(fetch → `reset --hard FETCH_HEAD`, zero strat — pliki drzewa były wersjami
środkowymi, zdalny 7df963f kompletny).

## Zadanie 1 — bump pinu CR (decyzja właściciela; ADR 0030: źródło, nie pamięć)

- Źródło: mirror `nwgarne/mtg-data` rules/cr-raw.txt, commit `28fa7b128c`
  „effective November 6, 2026" (rules=3182); sha256
  `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`.
  Stare wydanie pobrane z historii mirrora (`3257633334`, 2026-09-25) — sha256
  zgodne z pinem `8d860e45…` (dowód, że porównuję właściwe pliki).
- Analiza różnic tekstów WSZYSTKICH 555 cytowanych numerów (stare vs nowe):
  513 identycznych, 5 brakujących w nowym, 37 o zmienionym tekście.
  Kluczowe zmiany wydania: NOWA sekcja **713 Meld Cards** (meld wydzielony z
  712), sekcje 713–733 przesunięte +1, restrukturyzacja 712 (DFC), nowe
  podreguły 701.27h–j/701.28g–h, nowe akcje/zdolności: 701.72 Assimilate,
  702.196 Beam me up, typy/tokensy Star Trek (Aenar, Andorian, Android,
  Communicator), ability word „battlefront", nowa reguła o rzucaniu więcej
  niż jednego czaru w rozstrzyganiu (608.2g), 603.7g.
- Renumeracja cytatów w `src/`/`test/`/`tools/` (jednoprzebiegowy skrypt,
  kontynuacje po ukośniku ręcznie): 712.7→712.5, 712.8→712.6, 712.8a→712.6a,
  712.9→712.7 (+ zdanie „nothing happens" przeniesione do 701.27d/701.28d —
  adnotacja w m264), 712.11→712.8, 712.13→712.10, 712.18→712.15, cała sekcja
  Sag 714.x→715.x, Przygody 715.x→716.x, Monarcha 725.4→726.4, Inicjatywa
  726.x→727.x, Merge 730.2b/c→731.2b/c, Dzień/Noc 731.2a→732.2a, Nielegalne
  akcje 733.1→734.1. Pliki historyczne (audyt-pr134, dowody RED) nietknięte.
- Strażnicy: para DFC w `cr-numery-mechanik-straznik` (zakazany/poprawny/zrodło
  + komentarz żywy) na nową numerację; TABELA_702 + 702.196 „Beam me up"
  i nagłówek źródła; regeneracja tabeli `tools/cr-numery.mjs --zapisz`.
- Weryfikacja: `cr-numery.mjs --cr` → OK; grep starych numerów → 0;
  strażnicy + pełny fast suite + build; test:all na końcu sesji.

## Zadanie 2 — ogłoszenia w modalu „Rozgrywka" zdarzeń z płatności kreatora

- Obserwacja z partii 4B (AUDYT_PR180 §8): linie „Mielisz …" z triggerów
  rozstrzyganych W TRAKCIE płatności kreatora many nie trafiają do strumienia
  modala „Rozgrywka" (ogon LOG-u tnie starsze wpisy). Warstwa ogłoszeń, nie
  reguły — stan gry zweryfikowany rekonstrukcją biblioteki.
- Naprawa u root cause w mechanizmie zasilania strumienia ogłoszeń + pin
  behawioralny (RED→GREEN) na scenariuszu F-CYK (Chronic Flooding podczas
  płatności za cycling).

## Commity

1. Ten plan.
2. Zadanie 1 (renumeracja + strażnicy + tabela + weryfikacja).
3. Zadanie 2 (fix + pin).
4. Dokumenty zamknięcia (historia, handoff — dopisek o wykonaniu pozycji 1–2).
