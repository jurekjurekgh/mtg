# Plan sesji 2026-09-28d — audyt scalonego PR #143 i pętla jakości (etap 4 planu 28b)

## Zlecenie i stan początkowy

- Prompt właściciela: „Kontynuujemy projekt.” — brak nazwanego tematu ⇒ ADR 0021
  (pętla domyślna). Krok 1 i 2 pętli: PR na starcie (ADR 0020 A) i **audyt
  poprzedniego scalonego PR** (ADR 0020 B / ADR 0016).
- Poprzedni PR: **[#143](https://github.com/jurekjurekgh/mtg/pull/143)** „Audyt
  PR #142 + petla jakosci (sesja 2026-09-28b)”, scalony 2026-09-28T12:55:49Z
  jako `abfa7cba57038fd2e198ce7b5bc8ff3f94030038`. To ostatni commit `main`
  i baza tej gałęzi.
- Zakres #143 (8 plików, +651/−29): plan/raport/handoff/historia sesji 28b,
  **naprawa F5b** (land pozbawiony zdolności produkowania many — bramka
  `landCanProduceMana` w `resources.js`), **naprawa MP3 z dysku** (Etap 2b
  sesji 28c: `card-sound-player.js` — ścieżki względne najpierw, timeout
  4000 ms, jawny `audio.load()`), strażniki `test/audyt-pr142-land-strip-mana.test.js`
  i `test/card-sound-mp3.test.js`.
- Baza sesji: `arena/01a0e84d-mtg` = `main` = `abfa7cb`; gałąź nie istniała
  na origin przed tą sesją.
- Środowisko: 2 vCPU; `npm test` ~1,5 min; brama `test:all` w minutach.

## Roadmapa: etapy, kryteria ukończenia, kolejność commitów

### 0. PR na starcie (ADR 0020 A)

- [x] Plan (ten plik) jako pierwszy commit gałęzi → push → PR do `main`.
- [x] PR zawiera na starcie plan audytu i listę punktów kontrolnych.

### 1. Baseline i rozpoznanie

- [x] `npm test` (szybki rdzeń) + `npm run build` na `abfa7cb` — zmierzone:
  fast **6941/6941** (84 568 ms), build **70 / 4538,3 kB** — zgodne
  z handoffem 2026-09-28b/28c.
- [x] Inwentaryzacja diffu #143 per plik (8 plików; 2 pliki źródłowe,
  2 strażniki testowe, 4 dokumenty).

### 2. Audyt PR #143 (ADR 0020 B, bez pełnego B0 — ADR 0018)

Kryteria: każdy zmieniony plik źródłowy przeczytany w diffie; twierdzenia
regułowe potwierdzone u źródła tam, gdzie wnoszą CR (ADR 0030); zero przypadków
specjalnych po nazwie/ID karty (ADR 0002); testy potwierdzone mutacyjnie (L13),
nie tylko „zielone”; chirurgiczność patchy (ADR 0016 B).

- [x] `src/engine/resources.js` (F5b): predykat `landCanProduceMana` —
  kompletność filtracji potwierdzona (`untappedLandManaSources`,
  `producibleMana`, auto-tap, `tapLandForMana` — gate PRZED mutacją),
  zgodność z CR 305.6/613.1f/605.1a; grant-landy nietknięte (L149).
  **Znalezisko rodzeństwa F1 (widok/kreator, L1/L48) i F2 (fabrykacja
  1 bezbarwnej z grantu, L52) — naprawione `ff6543c`, patrz etap 3.**
- [x] `src/table/card-sound-player.js` (MP3): kolejność kandydatów
  (względne najpierw), tryby online/dist, timeout, `audio.load()` — OK;
  brak Node-globali (L58), `playCard` bez odrzuconych Promise. **Verba.**
- [x] `test/audyt-pr142-land-strip-mana.test.js` + `test/card-sound-mp3.test.js`:
  pinują to, co deklarują (M3 → 3 RED, M8 → 6 RED — niezależna
  weryfikacja twierdzeń 28b).
- [x] Dokumenty: spójne; jedna uwaga historyczna (D1 — liczby „bramka
  końcowa” w handoffzie 28b sprzed ostatniego commita #143) — odnotowana
  w raporcie §6, bez poprawek historycznych handoffów (L92).
- [x] Raport `docs/audits/AUDYT_PR143_2026-09-28.md` + opis PR kumulatywnie.

### 3. Naprawy znalezisk z audytu (jeśli wystąpią)

- [x] Znaleziska F1+F2 (rodzeństwo F5b) — `ff6543c`: RED→GREEN
  (4/5 → 5/5 strażnika `audyt-pr143-f5b-rodzenstwo.test.js`), root cause
  (projekcja widoku / bramka produkcji + passthrough `grantColor`),
  anty-over-fix (zwykły land = 1 G; zwykły+grant bare = 1 G własną
  zdolnością), mutacje M-A/M-B/M-C → celne RED (L13/L136), fast 6946/6946
  + build 70 / 4539,6 kB; osobny commit i push (ADR 0020 C).
- [x] Reguła trwała z wniosku: brak nowej reguły — wnioski to zastosowanie
  istniejących L48/L52/L72/ADR 0017; brak zmian w LESSONS/AGENTS.

### 4. Pętla jakości (ADR 0021) — kontynuacja etapu 4 planu 2026-09-28b

- [x] **Triage zgłoszenia Dream Twist** (Żywy Tester 28b, seed 2027):
  **fałszywy alarm** — dwa REALNE rzuty z osobnymi rozstrzygnięciami
  (cast → 3 mielenia → resolve ×2), brak błędu silnika. Refinement
  detektora M266/C2 u root cause (`0846ead`: rozstrzygnięcie karty
  pomiędzy powtórzeniami rozstrzyga parę) + regresja z realnej partii
  w `test/m266-detektory-klas.test.js` (mutacja filtra → RED); seed 2027
  po zmianie: 0 zgłoszeń.
- [x] **Polowanie na niezgodności z CR w NOWYM obszarze** — rodzina
  **616.x** (kolejność efektów zastępczych) + **122.1c** (licznik tarczy):
  tekst dosłowny pobrany z CR 2026-09-25 (nwgarne/mtg-data, ADR 0030),
  weryfikacja kodu: wybór do kontrolera (616.1, APNAP), must-choose
  (616.1a), kolejność destroy→die (616.1g), bramka `cause === 'effect'`
  licznika tarczy **trafna wobec 122.1c** — werdykt pozytywny, bez zmian
  kodu (raport §5). Kandydaci 608.2h/„if able”/514/704.5 — już pinowani
  w starszych audytach (batch54, pr123), potwierdzone pokrycie.
- [x] Bez nowego batcha kart (ADR 0029); katalog, progi i manifest bez zmian.

### 5. Domknięcie sesji

- [x] `npm run test:all` **7218/7218** (7 suites, 371 566 ms, 0 fail/
  cancelled/skipped/todo) + `npm run build` **70 / 4539,6 kB** — liczby
  mierzone (L92); fast 6946/6946.
- [x] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-28d.md`,
  opis PR kumulatywnie, blok przekazania w czacie (ADR 0013).
- [x] Bez merge i bez force push (ADR 0020 D, ADR 0007).

## Ryzyka i pułapki (z lektury startowej)

- **Reset workspace w trakcie sesji** (ENVIRONMENT §2): push po każdym zielonym
  commicie; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`.
- **Mutacje tylko na kopiach** (`cp plik /tmp/plik.bak`), nigdy
  `git checkout <plik>` na pliku z pracą tej tury (L136); po mutacji `git diff`
  pusty poza zamierzoną zmianą (L159).
- **Cytaty CR z bieżącego wydania** (L164): numer sekcji potwierdzać u źródła
  (CR 2026-09-25), nie z pamięci (ADR 0030 — pamięć treningowa nie jest
  źródłem).
- **Brak egressu w bashu**: dane u źródła pobierać `fetch_page` (ENVIRONMENT §4).
- **Zgłoszenie ≠ reguła** (L57): findingi z Żywego Testera weryfikować wobec
  Oracle/CR PRZED wdrożeniem.
- **Testy długie**: 2 vCPU — pełna brama `test:all` w minutach; nie mnożyć
  przebiegów pełnych.

## Kryterium ukończenia całości

Audyt #143 zakończony raportem i naprawami (jeśli znaleziska), triage Dream
Twist domknięty, co najmniej jedna nowa ścieżka CR sprawdzona z ewentualnymi
naprawami, wszystkie commity wypchnięte, `npm test` + `npm run build` zielone,
opis PR i handoff zaktualizowane, PR otwarty do decyzji właściciela.
