# Plan A/B — nagłówki partii AI i lokalne MP3 (2026-09-28)

## Zlecenie i stan początkowy

- A: każda nowa partia w logu Dokumentu Google ma osobny H1 z obiema taliami
  i nową stronę. Właściciel zgłosił brak dla `observer` i `skit`.
- B: dźwięk rzutu ma najpierw korzystać z `snd/<numer kolekcji>.mp3`,
  a przy braku/niedostępności pliku używać obecnej syntezy typu i koloru.
- Nadal jedna gałąź `arena/01a0e6ce-mtg`, jeden otwarty PR #142.
  Audyt #140 i F1–F9 zakończone w poprzedniej części tej sesji.
- Odtworzenie po resecie workspace: HEAD wrócił do `1194476`, pliki były
  bitowo identyczne z wypchniętym `ea184ac`. Backup diffu i plików nowych,
  fetch oraz reset **mixed** przywróciły historię bez nadpisywania plików.
- Baseline A/B: **6901/6901**, 7 suites, 0 fail/skip (90000,647775 ms);
  build **69 modułów / 4529,5 kB**, exit 0.
- W tej kopii workspace nie ma katalogu `snd`. Nie blokuje to obsługi
  opcjonalnych zasobów; nie przenosimy plików audio do Git ani do HTML.

## Kolejność commitów i kryteria

### 0. Plan — osobno, przed kodem

- [x] Wypchnąć plan do istniejącego PR. Nie otwierać drugiego PR.

### A. Nagłówki — prześledzić klienta i rzeczywisty kod Apps Script

- [x] Zachować poprawkę F2 (brak `newGame` nie jest jawnym false).
  Pierwszy wpis rozróżniać też według trybu i URL-a, nie wspólnie dla kart
  dokumentu; nie zużywać pierwszego wpisu przy nieudanej próbie wysłania.
- [x] Writer `Code.gs` ustala, czy partia już występuje w wybranej karcie,
  z trwałych metadanych zapisanych w samym dokumencie, pod istniejącym lockiem.
  Nagłówek nie zależy wyłącznie od ulotnej flagi klienta, także przy starym
  `newGame:false`, ponowieniu tury 1, przeładowaniu klienta i zmianie trybu.
  Bez nowego magazynu PropertiesService, bez sekretów w repo.
- [x] Natywny `HEADING1` Google Docs, matchup X vs Y i podział strony przed
  kolejną partią. Na pustej karcie bez pustej pierwszej strony. Treść wpisów
  ma styl NORMAL; działają `observer`, `skit`, pozostałe tryby i fallback
  brakującej karty. Wyszukiwanie obejmuje także karty zagnieżdżone.
- [x] Testy wykonują **prawdziwy Code.gs** w VM z atrapą API dokumentu oraz
  rzeczywisty logger ze stubem fetch (nie tylko regexy). RED przed poprawką,
  GREEN po niej; osobne mutacje granic klient/writer, H1/podziału i dedupu.
- [x] Uzupełnić instrukcję aktualizacji istniejącego `/exec`: wkleić nowy
  Code.gs, zachować własny DOC_ID, wdrożyć **Nową wersję**. Sama aktualizacja
  stołu nie aktualizuje skryptu właściciela. Dokument powinien być w trybie
  stron, żeby podziały stron były widoczne. Bez wywołania prawdziwego Drive.
- [x] Cały `npm test` + build, osobny commit i push.

### B. Dźwięki — opcjonalna paczka zasobów, synteza jako fallback

- [x] Numer pliku pochodzi z `card.artId` (numer kolekcji), nie ze sluga
  karty ani numeru druku Scryfall. Walidacja liczbowego ID, brak hardkodów kart.
- [x] Osobna warstwa odtwarzania lokalnego pliku nad istniejącą syntezą.
  HTMLAudioElement obsługuje HTTP(S) i lokalny `file:` bez wymagania fetch
  plików lokalnych. Zachować obecną fasadę i 49 syntetycznych brzmień.
- [x] Ścieżka z zachowaniem podkatalogu Pages: `snd/N.mp3` obok strony;
  dla `dist/mtg-table.html` najpierw `../snd/N.mp3` (katalog repo), potem
  `snd/N.mp3` obok artefaktu. Żadnych localhostów ani ścieżek z komputera agenta.
- [x] Plik dostępny → wyłącznie MP3. Brak/404, błąd dekodowania, zablokowane
  odtwarzanie lub brak API → jedna próba syntezy z tego samego typu/koloru.
  Odczyt ma limit czasu, nie zatrzymuje gry i nie odrzuca nieobsłużonej Promise.
- [x] OFF = brak żądań i odtwarzania. Wyłączenie, następny dźwięk, zamknięcie
  warstwy lub nowa partia unieważniają spóźnione żądania. Dźwięk zostaje
  zsynchronizowany z otwieraną pozycją kolejki hi-gfx, także dla bota.
  Ukryty rzut przeciwnika nie może ujawniać karty przez plik audio/URL.
- [x] Testy fake media + prawdziwa fasada: sukces, oba warianty lokalizacji,
  błędy i timeout, konkurencyjne rzuty, OFF, późny reject, fallback dokładnie
  raz, brak artId, zwykłe brzmienia i grant zgody autoplay. Wybrane RED/mutacje.
- [x] `snd/` ignorowany jak lokalne `img/`; README opisuje układ katalogów,
  brak paczki na Pages i ograniczenia autoplay. Bez masowego uploadu/embedded MP3.
- [x] Sprawdzenie w prawdziwej przeglądarce, jeśli dostępna: realne MP3 testowe
  poza Git + 404, na zbudowanym artefakcie. Jawnie opisać granice, jeżeli API
  przeglądarki/plików właściciela nie da się tutaj zweryfikować.
- [x] Cały `npm test` + build, osobny commit i push.

### C. Końcowa bramka i przekazanie

- [x] Pełny `npm run test:all`, build, aktualizacja historii/handoffu i PR.
- [x] Wynik A odróżnia poprawność lokalnego kontraktu od wdrożenia na koncie
  Google właściciela; nie twierdzić, że zdalny dokument został przetestowany.
- [x] Wynik B odróżnia działanie loadera od odsłuchu nieobecnych tutaj plików.
- [x] Bez merge, force push, zmian reguł gry, progów testów i płatnych API.

## Ryzyka

- Flaga per gameId jest za szeroka dla osobnych kart trybów; stan przeglądarki
  nie dowodzi, co zapisano w dokumencie. Źródłem prawdy jest wybrana karta Docs.
- Style akapitów i karty dokumentu wymagają testu writer-a, nie samego body POST.
- `fetch(file:)` bywa blokowany mimo dostępności lokalnego audio — odtwarzacz
  mediów nie może polegać wyłącznie na pobraniu pliku do Web Audio.
- Asynchroniczny błąd MP3 nie może uruchomić starego dźwięku po nowym rzucie
  ani po wyciszeniu; błędy autoplay nie są dowodem braku pliku.
- Dodanie paczki audio nie jest częścią tego commita ani wymogiem działania
  aplikacji. Synteza nadal działa, jeśli `snd` nie istnieje.


## Wyniki A

Plan wypchnięty przed kodem: `f9c8caa`. Poprawka F2 poprzedniego audytu
była obecna, ale nie obejmowała osobnych trybów/URL-i ani trwałości nagłówka
po stronie Dokumentu. Nowe 10 testów: **10 RED → 10 GREEN**, z wcześniejszymi
pinami **25/25**. Wykonują prawdziwy Code.gs w VM i rzeczywisty logger.
10 podmian/mutacji wykrytych (klient/writer, tryb/URL, flaga klienta,
H1/podział, style, karty zagnieżdżone, zapamiętanie nieudanego zapisu).
Bramka A: **6911/6911**, 7 suites, 0 fail/skip, **92718,4105 ms**;
build **69 / 4529,4 kB**, exit 0. Nie było wywołania konta Google.
Instrukcja wyjaśnia aktualizację `/exec`, Pages/Bez stron i brak retroaktywnej
przebudowy starych wpisów. Następny krok B (MP3).


## Wyniki B i bramka końcowa

B: `snd/<artId>.mp3` najpierw, synteza fallback. 19 nowych testów
**16 RED → 19 GREEN**; ze starszymi dźwiękowymi **49/49**.
Przeglądarka Chromium z web security ON (sparticuz chromium + playwright):
HTTP project/ missing→synth / dist parent / file sibling + artefakt dist
z jednym rzutem MP3 bez syntezy i zatrzymaniem po Escape — **zero wyjątków**.
Fast **6934/6934**, build **70 / 4536,3 kB**. `snd/` ignorowany jak `img/`.

Końcowy `npm run test:all` A/B: **7205/7205**, 7 suites, 0 fail/cancelled/skipped/todo,
**367835,299555 ms**, exit 0; build **70 / 4536,3 kB**. Względem bazy #140
**+174 testy** (6760→6934 fast, 7031→7205 all). PR #142 OPEN, CI SUCCESS.
Bez nowych kart, progów, B0-full i płatnych API. Granice przeglądarki/plików
i wdrożenia Docs opisane w raporcie i instrukcji.
