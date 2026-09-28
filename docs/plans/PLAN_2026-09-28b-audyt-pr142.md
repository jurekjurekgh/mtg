# Plan sesji 2026-09-28b — audyt scalonego PR #142 (F1–F9 + A/B) i pętla jakości

## Zlecenie i stan początkowy

- Prompt właściciela: „Kontynuujemy projekt.” — brak nazwanego tematu ⇒ ADR 0021
  (pętla domyślna). Krok 1 i 2 pętli: PR na starcie (ADR 0020 A) i **audyt
  poprzedniego scalonego PR** (ADR 0020 B / ADR 0016).
- Poprzedni PR: **[#142](https://github.com/jurekjrekgh/mtg/pull/142)** „Audyt PR
  #140 + A/B: nagłówki AI i dźwięki MP3”, scalony 2026-09-28T12:49:30Z jako
  `332a7fd`. To ostatni commit `main` i baza tej gałęzi.
- Zakres #142 (58 plików, +6 786 linii diffu): 9 napraw z audytu #140 (F1–F9)
  + dwie transze zlecenia właściciela (A: nagłówki Dokumentu AI; B: lokalne
  MP3 `snd/<artId>.mp3` z fallbackiem syntezy).
- Baza sesji: `arena/01a0e812-mtg` = `main` = `332a7fd`; gałąź **nie istniała**
  na origin przed tą sesją (potwierdzone `git ls-remote --heads origin`).
- Środowisko: 2 vCPU, `npm test` (szybki rdzeń) trwa kilkanaście minut;
  cięższe warstwy (`test:slow`) tylko punktowo.

## Roadmapa: etapy, kryteria ukończenia, kolejność commitów

### 0. PR na starcie (ADR 0020 A)

- [x] Plan (ten plik) jako pierwszy commit gałęzi → push → PR do `main`.
- [x] PR zawiera na starcie plan audytu i listę znanych punktów kontrolnych.

### 1. Baseline i rozpoznanie

- [x] `npm test` (szybki rdzeń) + `npm run build` na `332a7fd` — porównanie
  liczby testów i rozmiaru artefaktu z handoffem 2026-09-28
  (fast **6934/6934**, build **70 / 4536,3 kB**).
- [x] Inwentaryzacja diffu #142 per plik (podział na źródła silnika, UI, AI,
  Apps Script, testy) — zrobione lokalnie w `.arena/pr142/`.

### 2. Audyt PR #142 (ADR 0020 B, bez pełnego B0 — ADR 0018)

Kryteria: każdy zmieniony plik źródłowy przeczytany; zgodność z CR
weryfikowana **u źródła** (ADR 0030: CR 2026-09-25 + rulingi Scryfall);
zero przypadków specjalnych po nazwie/ID karty (ADR 0002); testy potwierdzone
mutacyjnie (L13), nie tylko „zielone”.

- [x] F1: bramka przed mutacją; **M1** (usunięty pre-check) → ≥8 RED
  `test/audyt-pr140-look-top-atomic.test.js`.
- [x] F5: model warstwy 6 potwierdzony (CR 613.7a/613.7n, ruling Xu-Ifit
  2025-07-25); **M5** (`abilityRemovalTimestamp` ignoruje strip) → 2 RED.
  **F5b (P1, znalezisko):** bramka stripa nie obejmowała ścieżki płatności —
  M3 (oba gate'y `mana-sources.js`) przechodziło CAŁĄ szybką suitę; naprawa
  `88a4cc1` + strażnik `test/audyt-pr142-land-strip-mana.test.js`
  (M3/M3c/M4a/M4b → RED).
- [x] F6: oferta/walidacja/solver na jednym predykacie; CR 509.1c/506.5/509.1a
  potwierdzone u źródła; **M6** (menu bez filtru maksimum) → 5 RED
  (`test/audyt-pr140-block-requirements.test.js`, 19 testów).
- [x] F7: Twiddle niemodalny, wybór przy rozstrzyganiu (ruling 2004-10-04),
  jedno źródło wariantów; **M7** (zawsze `tap_permanent`) → 11 RED.
- [x] F8: oferta i walidatory na pustym stosie; sondy runtime potwierdziły
  (instant w oknie deklaracji → deklaracja znika; pass → `declare_blockers`
  bez `combat`); **M2** (guard `combat.js:290`) → 2 RED; CR 508.1 u źródła.
- [x] F9: opisy płatnych triggerów z warunkiem „jeśli tak”, koszt raz;
  **M12** (`render.js` cena jako rider) → 8 RED (`audyt-live-paid-trigger-text`).
- [x] F2/F3: `newGame` null-safe, scope `[url, mode, gameId]`; **M9** (scope
  bez `gameId`) → 1 RED, **M10** (brak rozróżnienia timeout/anulowanie) → 3 RED.
- [x] F4: `manaSourceOfView` w wycenie płatnych triggerów; **M11**
  (`koloryZrodlaWidoku` puste) → 6 RED (`audyt-pr140-pay-mana-source`).
- [x] A/B: ścieżki `snd/<artId>.mp3` z jednego źródła (`cardSoundUrls`),
  fallback syntezy, brak Node-globali w artefakcie; **M8** (brak preferencji
  MP3) → 15 RED; `snd/` ignorowany.
- [x] Raport `docs/audits/AUDYT_PR142_2026-09-28.md` (inwentarz, tabela 13
  mutantów, F5b, granice) + opis PR aktualizowany kumulatywnie.
### 3. Naprawy znalezisk z audytu (jeśli wystąpią)

- [x] F5b `88a4cc1` — RED→GREEN (3/5→5/5), mutacje M3/M3c/M4a/M4b → RED,
  fast 6939/6939 + build zielone (szczegóły w raporcie).
- [ ] Każde KOLEJNE znalezisko: RED→GREEN, naprawa u root cause (ADR 0002, L57),
  anty-over-fix, niezależna mutacja, `npm test` + `npm run build`,
  osobny commit i push (ADR 0020 C).
- [ ] Reguła trwała z wniosku (jeśli nowa) → ADR / `docs/LESSONS.md` /
  `AGENTS.md`; nie do handoffu (decyzja właściciela 2026-08-14).

### 4. Pętla jakości (ADR 0021) — po domknięciu audytu

- [x] Przegląd planów: wszystkie `PLAN_*.md` z 2026-09-19…2026-09-28
  (poza bieżącym) mają 0 otwartych kryteriów; otwarte były tylko etapy 4/5
  tego planu.
- [x] Żywy Tester: 2 partie po 300 kroków (`wiedzmin-wur` vs `innistrad-wu`,
  seed 2027 — naturalny koniec, 0 `[STOP]`, 1 zgłoszenie detektora Dream Twist
  do triage'u; `mirrodin-brg` vs `ravnica`, seed 2033 — czysto, 0 zgłoszeń,
  NIEWYCENIONE: brak). Talie z Twiddle i płatnymi triggerami.
- [ ] Polowanie na niezgodności z CR w nowym obszarze — pozostaje dla
  kolejnej sesji (w audycie potwierdzono u źródła 305.6/305.7/613.1f/605.1a
  oraz 509.1c/506.5/508.1).
- [x] Bez nowego batcha kart (ADR 0029); katalog i progi bez zmian.

### 5. Domknięcie sesji

- [x] `npm run test:all` **7210/7210**, 7 suites, 0 fail/cancelled/skipped/todo,
  **493 366 ms**, exit 0; build **70 / 4537,3 kB** (liczby mierzone).
- [x] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-28b.md`,
  opis PR zaktualizowany kumulatywnie, blok przekazania (ADR 0013).
- [x] Bez merge i bez force push (ADR 0020 D, ADR 0007).

## Ryzyka i pułapki (z lektury startowej)

- **Reset workspace w trakcie sesji** (ENVIRONMENT §2): push po każdym zielonym
  commicie; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`.
- **Mutacje tylko na kopiach** (`cp plik /tmp/plik.bak`), nigdy
  `git checkout <plik>` na pliku z pracą tej tury (L136); po mutacji `git diff`
  musi być pusty poza zamierzoną zmianą (L159).
- **Cytaty CR z bieżącego wydania** (L164): numer sekcji potwierdzać w CR
  2026-09-25, nie przenosić arytmetycznie.
- **Solver bloków to logika wykładnicza w najgorszym razie** — sprawdzić capy
  i determinizm (ADR 0005) oraz to, że `legalBlockerOptions` nie eksploduje
  przy wielu wymogach.
- **Brak egressu w bashu**: dane u źródła pobierać `fetch_page` (ENVIRONMENT §4).
- **Testy długie**: 2 vCPU — pełna brama `test:all` liczona w minutach
  (ostatnio ~6–9 min); nie mnożyć przebiegów pełnych.

## Kryterium ukończenia całości

Audyt #142 zakończony raportem i naprawami (jeśli znaleziska), wszystkie
commity wypchnięte, `npm test` + `npm run build` zielone, opis PR i handoff
zaktualizowane, PR otwarty do decyzji właściciela.
