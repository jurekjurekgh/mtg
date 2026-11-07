# HANDOFF 2026-11-07 — bump pinu CR 2026-11-06 + ogłoszenia modala „Rozgrywka" (pozycje 1–2 z handoffu 2026-11-06-audyt-pr180)

## Stan

- Gałąź `arena/b2771170-mtg`, PR #181 (otwarty). Kontynuacja sesji audytu
  PR #180 — zlecenie właściciela: „zrób 1 i 2 zgodnie z sugestią" (otwarte
  pozycje z `docs/setup/HANDOFF_2026-11-06-audyt-pr180.md`).
- Plan: `docs/plans/PLAN_2026-11-07-bump-cr-i-ogloszenia.md` (commity:
  `a7cd367` plan, `0acbc43` CR bump, `05a2cf0` F-OGŁ, + dokumenty zamknięcia).
- Zdarzenie operacyjne: **drugi reset workspace w obrębie PR #181** (wskaźnik
  gałęzi na bazie `d2e0d61`, pliki sesji w drzewie jako zmiany lokalne — wersje
  ŚRODKOWE sprzed `7df963f`). Odzyskane proceduralnie (fetch → weryfikacja
  bajtowa → `reset --hard FETCH_HEAD`), zero strat — zdalny `7df963f` kompletny.

## Zadanie 1 — bump pinu CR do wydania 2026-11-06 (DONE)

- **Źródło (ADR 0030):** mirror `nwgarne/mtg-data` rules/cr-raw.txt, commit
  `28fa7b128c` („effective November 6, 2026", rules=3182), sha256
  `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`.
  Stare wydanie pobrane z HISTORII mirrora (`3257633334`) — sha256 zgodne
  z dotychczasowym pinem `8d860e45…` (dowód porównywania właściwych plików).
- **Metoda:** diff tekstów WSZYSTKICH 555 cytowanych numerów między wydaniami
  (513 identycznych, 5 brakujących, 37 renumeracji/edycji) — nie tylko test
  istnienia numerów, bo przesunięcie sekcji zostawia numery „istniejące, ale
  znaczące co innego" (klasa F-1 z PR #136).
- **Zmiany wydania:** NOWA sekcja **713 Meld Cards** (meld wydzielony z 712),
  sekcje 713–733 przesunięte +1, restrukturyzacja 712 (712.4 oglądanie obu
  stron, 712.5 ukryte strefy, 712.6/6a/6d cechy twarzy/MV, 712.7 transform
  nie-DFC, 712.8 rzut przodem, 712.10 wejście tą samą twarzą, 712.11 wejście
  z innej strefy, 712.15 ten sam obiekt); zdanie „nothing happens" z 712.9 →
  701.27d/701.28d; Sagi 714→715, Przygody 715→716, Monarcha 725.4→726.4,
  Inicjatywa 726→727, Merge 730→731, Dzień/Noc 731.2a→732.2a, Nielegalne
  akcje 733.1→734.1. Nowa treść: 701.72 Assimilate, 702.196 Beam me up,
  701.27h–j/701.28g–h, typy Star Trek (Aenar/Andorian/Android/Communicator),
  ability word „battlefront", rozszerzenie 608.2g, 603.7g.
- **Wykonanie:** renumeracja ~112 miejsc cytatów w `src/`/`test/`/`tools/`
  (jednoprzebiegowy skrypt bez łańcuchowania + 7 linii ręcznych: kontynuacje
  po ukośniku i numery bez prefiksu „CR "). Pliki historyczne (dowody RED
  audytu PR #134) nietknięte. Strażnicy doprowadzeni do nowego wydania: para
  DFC w `cr-numery-mechanik-straznik` (zakazany 711.x; 712.4/712.5 już
  legalne — ban 712.5 przeniesiony do pary „transform↔712.5" z wykluczeniem
  kontekstu ukrytych stref), TABELA_701 + 701.72, TABELA_702 + 702.196,
  tytuły/komunikaty o edycję, C1/C2 audytu PR #134 (POMIN o tabelę danych;
  WYMAGANE na nowe numery). Tabela istnienia zregenerowana: **570 numerów,
  CR 2026-11-06, sha256 d7cdcc11…**; `tools/cr-numery.mjs --cr` → WYNIK: OK.

## Zadanie 2 — ogłoszenia modala „Rozgrywka" z czasu płatności kreatora (DONE, F-OGŁ)

- Obserwacja z partii 4B audytu PR #180: linie „Mielisz …" z triggerów
  rozstrzyganych W TRAKCIE płatności kreatora nie trafiały do modala
  (ogon LOG-u tyczył starsze wpisy) — stan gry zgodny z CR, warstwa ogłoszeń
  gubiła skutek triggera.
- **Root cause (ślad sondy):** `session.apply` czyści bufor `botMoves` przy
  KAŻDEJ komendzie człowieka (polityka „jedna komenda = jedna jednostka
  ogłoszeń"), a płatność kreatora to SEKWENCJA komend (tap_for_mana × N →
  pass drenażu → commit): drugie tapnięcie wycierało ogłoszenie triggera,
  commit — mielenia z drenażu.
- **Fix u root cause:** opcja `paymentUnit` w `apply` — komendy płatności
  doklejają się do JEDNEJ jednostki ogłoszeń (pierwszy krok otwiera ją zwykłym
  czyszczeniem + nagłówek tury; pass drenażu i kolejne tapy dopisują; commit
  `paymentUnit: 'end'` domyka). Kreator podrzędny KONTYNUUJE jednostkę rodzica
  (main.js nadpisuje 'end'→true przy nested). Pierwsza zwykła komenda zamyka
  jednostkę — samonaprawa po anulowaniu kreatora. Starsi wołający bez opcji:
  zachowanie bez zmian.
- **Dowód:** piny F-OGŁ/1 (behawioralny: botMoves po płatności niesie mielenia
  + rozstrzygnięcie triggera + cycling w kolejności stosu, CR 603.3) i F-OGŁ/2
  (skan źródeł UI) — RED→GREEN; re-run partii seed 4242: modal pokazuje
  „Mielisz Fiery Hellhound / Final Parting / Kavu Primarch" → „Chronic
  Flooding — trigger się rozstrzyga" → „Aktywujesz cycling: Expunge" →
  „Dobierasz: Mountain"; wynik partii i detektory bez zmian.

## Bramy (drzewo końcowe)

- `npm test`: **10 070 pass / 0 fail / 0 skip** (baza `7df963f`: 10 068 —
  przyrost = 2 piny F-OGŁ; przyrost wzgl. bazy sesji audytu: +5).
- `npm run test:all`: **10 339 pass / 0 fail / 0 skip** (10 336 na `7df963f`
  + 2 piny F-OGŁ + 1 para „transform↔712.5" w strażniku mechanik-pary).
- `npm run build`: **78 modułów / 5 763,3 kB**.
- Strażnicy CR po bumpie: 42/42 (istnienie, mechanik-pary, 701, 702,
  508/509, C1–C3 audytu PR #134). Strażnik budżetu lektury zielony — lektury
  obowiązkowe nietknięte (zmiany dokumentacyjne poza budżetem).
- Szybki benchmark NIE był uruchamiany (brak zmian bota/wyceny; ADR 0018).

## Granice i co NIE jest dowiedzione

- Bump zweryfikował ISTNIENIE i teksty cytowanych numerów; nie jest audytem
  treści nowych reguł wydania (701.72, 702.196, 608.2g-addendum) — żadna z
  nich nie jest jeszcze cytowana w repo, więc nie ma czego pić.
- F-OGŁ pinuje ścieżkę tap→drenaż→commit i przepływ bufora; nie pinuje
  wizualnego składu modala po anulowaniu płatności (samonaprawa przez pierwszy
  zwykłą komendę jest zachowaniem awaryjnym, nie ścieżką główną).

## Następny krok

Po scaleniu #181: zgodnie z ADR 0020 — audyt #181, potem praca produktowa wg
kolejki właściciela. Otwarte pozycje handoffu 2026-11-06-audyt-pr180: **obie
wykonane** (bump CR — ten handoff; kosmetyka modala — F-OGŁ).
