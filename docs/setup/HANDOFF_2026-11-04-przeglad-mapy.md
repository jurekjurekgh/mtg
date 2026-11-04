# Handoff 2026-11-04 — semantyczny przegląd mapy PR #178

## Stan

- Gałąź: `arena/5d931b5a-mtg`, PR #179 (draft). Ostatni zweryfikowany head przed tym wpisem: `ca9d42d`; ten handoff jest kolejnym przyrostem dokumentacyjnym.
- Nie ma zmian produkcji w tej kontynuacji. Zmieniano wyłącznie dokumentację, mapę, plany i komentarze/alias w testach. Wszystkie wcześniejsze poprawki A84–A113 pozostają bez zmian.
- Wymuszone RED: **0**. `test:audit` jest zieloną bramą regresji, nie kwarantanną.

## Co domknięto w mapie

Mapa `docs/audits/PR178_MAPA_PLIKOW_2026-11-03.md` miała 194 wiersze i 114 otwartych. Po czterech partiach przeglądu semantycznego zostało **68 otwartych wierszy**, wszystkie `test/fixture`.

1. **A10–A17**: bestow/inwestycja, powrót kreatora, koszt kwalifikowany, cel ląd-stwór, wynik kreatora/convoke, rezerwacje, improvise, rozstrzyganie celów. Przebieg **30/30**.
2. **A75–A93**: APNAP ląd/walka/aktywacja/mana, Ward/manual, rupture/echo/manual, optional/manual, kolory kreatora, Holdout, rezerwacje i atomowość bramki, animowany koszt własny. Przebieg **165/165**.
3. **A94–A108**: rodziny naprawione lub skorygowane w #179; pełny przegląd bieżących asercji i diffu. Przebieg **82/82**. A94/A101 mają korekty do CR, A98/A100–A108 osobne poprawki i mutacje z wcześniejszych kroków.
4. **Dokumentacja historyczna**: `PROJECT_HISTORY.md` oraz raport/mapa/plan/handoff PR #177. Cztery dokumenty #177 dostały banner stanu historycznego i odesłanie do bieżącego audytu #178/#179.

Łącznie partie testowe: **277/277 pass, 0 fail, 0 skip**. Sam zielony przebieg nie był podstawą zamknięcia wiersza; każdy wiersz dostał notę zakresu, a setup syntetyczny/polityka bota są oddzielone od reguły CR.

## Bramy

- Strażniki dokumentów/audytu: **27/27 pass** po partiach dokumentacyjnych.
- Pełny fast po partiach z komentarzami testowymi: **9956/9956 pass, 0 fail, 0 skip**.
- Build: **77 modułów / 5689,3 kB**.
- Pełny `npm run test:all` po przeglądzie mapy, na drzewie `ca9d42d`: **10224/10224 pass, 0 fail, 0 skip**, 555,8 s (`.arena/test-all-map-review.log`).
- Logi: `.arena/next-audit/map-*.log`, `.arena/fast-map-*.log`, `.arena/build-map-*.log`.

## Co nadal otwarte

- **68 wierszy testów/helperów** w mapie #178, m.in. pozostałe A7–A9/A25–A74, bestow/champion/converge/klątwa/morbid, batch39/batch41, m161/m200/m277/m359, pr66-audit-fixes, real-cards-batch7 oraz pliki `uwagi-*`/zgłoszenie N.
- Nie zaimplementowano pełnego wspólnego checkpointu wszystkich rodzajów zdarzeń. ADR 0031 opisuje kierunek i lokalne przyrosty; nie wolno tego czytać jako zamknięcia całego audytu.
- Dokumentacja historyczna PR #177 jest przejrzana jako historia, nie jako ponowny dowód wszystkich interakcji.

## Następne kroki

1. Kontynuować przegląd mapy partiami, np. A7–A9 i A25–A34, potem pozostałe testy realnych kart. Czytać cały plik i diff PR #178, porównywać z Oracle/CR, dopiero wtedy zmieniać status wiersza.
2. Jeżeli pojawi się osiągalny błąd: reprodukcja RED na rzeczywistych kartach/komendach, najmniejsza poprawka, mutacja, kontrole, pełny fast + build, osobny commit i natychmiast push.
3. Nie zamykać rodzin na samych kontrolach sąsiednich; nie podnosić progu budżetu lektury; nie przywracać flag `AUDIT_A*_ENFORCE`.
4. Przed końcem kolejnej sesji: pełny `test:all`, aktualizacja mapy/planu/historii/handoffu/opisu PR, fetch/porównanie przed push, CI i `mergeable_state`.

## Zakazy bez komendy właściciela

Force-push, merge, nowe karty, pełny B0, wdrożenie eksperymentów `NIE_WDRAZAC`. Logi testów tylko do `.arena/`; drzewo zamrożone podczas bram.
