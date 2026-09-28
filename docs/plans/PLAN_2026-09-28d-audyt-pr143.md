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

- [ ] `src/engine/resources.js` (F5b): predykat `landCanProduceMana` —
  kompletność filtracji (`untappedLandManaSources`, `producibleMana`,
  auto-tap, `tapLandForMana`), zgodność z CR 305.6/613.1f/605.1a (cytaty
  w strażniku), brak regresji grant-landów (L149).
- [ ] `src/table/card-sound-player.js` (MP3): kolejność ścieżek względnych,
  zachowanie trybu online/dist, timeout 4000 ms, `audio.load()` — brak
  Node-globali w artefakcie (L58), brak regresji starszego odtwarzacza.
- [ ] `test/audyt-pr142-land-strip-mana.test.js` + `test/card-sound-mp3.test.js`:
  testy testują to, co deklarują (RED→GREEN); mutacje z raportu odtworzone
  (L13/L34 — wersja bazowa z gita).
- [ ] Dokumenty (plan 28b, AUDYT_PR142, handoff 28b, historia): spójność
  liczb i faktów ze stanem repo (L56/L92).
- [ ] Raport `docs/audits/AUDYT_PR143_2026-09-28.md` + opis PR kumulatywnie.

### 3. Naprawy znalezisk z audytu (jeśli wystąpią)

- [ ] Każde znalezisko: RED→GREEN, naprawa u root cause (ADR 0002, L57),
  anty-over-fix, niezależna mutacja, `npm test` + `npm run build`,
  osobny commit i push (ADR 0020 C).
- [ ] Reguła trwała z wniosku (jeśli nowa) → ADR / `docs/LESSONS.md` /
  `AGENTS.md`; nie do handoffu.

### 4. Pętla jakości (ADR 0021) — kontynuacja etapu 4 planu 2026-09-28b

- [ ] **Triage zgłoszenia Dream Twist** ( Żywy Tester 28b, seed 2027):
  wpis „Nieprzyjaciel rzuca Dream Twist → cel: Ty” dwukrotnie w jednej
  paczce modala przy dwóch realnych rzutach — rozstrzygnąć, czy to
  duplikat narracji (L79/L170), czy dwa rzeczywiste zdarzenia opisane
  zgodnie z prawdą; jeśli bug — naprawa u root cause + strażnik.
- [ ] **Polowanie na niezgodności z CR w NOWYM obszarze** (nie w obszarach
  potwierdzonych w audytach #140/#142: 305.x/613.x/605.1/509.1/506.5/508.1):
  kandydaci z lektury lekcji — LKI vs fizzle (608.2h), „if able” (L108),
  warstwy 613.7, cleanup 514, SBA 704.5, kolejność replacementów 616.1.
  Znaleziska: repro headless PRZED naprawą (L11), cytaty CR u źródła
  (ADR 0030), naprawy RED→GREEN.
- [ ] Bez nowego batcha kart (ADR 0029); katalog, progi i manifest bez zmian.

### 5. Domknięcie sesji

- [ ] `npm run test:all` + `npm run build` (liczby mierzone, L92).
- [ ] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-28d.md`,
  opis PR kumulatywnie, blok przekazania w czacie (ADR 0013).
- [ ] Bez merge i bez force push (ADR 0020 D, ADR 0007).

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
