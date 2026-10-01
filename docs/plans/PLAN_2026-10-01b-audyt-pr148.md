# Plan sesji 2026-10-01b — audyt scalonego PR #148 + pętla jakości

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: commity
inkrementalne, D: bez force push) + ADR 0021 (prompt „Kontynuujemy projekt."
nie nazywa tematu ⇒ pętla domyślna, bez pytania o kolejkę) + ADR 0016.

## Rozpoznanie

| Pomiar | Wartość |
|---|---|
| `main` (baza sesji) | `30de664` = squash PR #148 („Audyt PR #147 + pętla jakości — sesja 2026-10-01") |
| Poprzedni scalony PR | #148, 27 plików (8 × `src/`, 6 × dokumentacja, 12 × testy, 1 × narzędzie) |
| Pliki `src/` w #148 | `heuristic-bot.js` (+44/−18), `heuristic-params.js` (+5/−2), `combat.js` (+58/−17), `game-state.js` (+10/−3), `ai-config.js` (+4), `ai-modes.js` (+99/−3), `choice-request.js` (+1/−1), `render.js` (+4/−1) |
| Baseline `npm test` / `build` | **7219/7219**, build **70 / 4673,2 kB** (zmierzone na starcie sesji) |
| Niedokończone plany na `main` | brak nieodhaczonych kryteriów (`PLAN_2026-10-01-audyt-pr147.md` kompletny) |

## Etapy

- [x] **Etap 0 — lektura startowa**: `AGENTS.md`, ADR 0001–0030 (w całości),
  `LESSONS.md` L1–L171, `ENVIRONMENT.md`, handoff `2026-10-01`, opis i diff PR #148
  (`gh pr diff 148`, 1394 linie, czytany plik po pliku).
- [x] **Etap 1 — PR na starcie** (ADR 0020 A): PR #149 istnieje przed pierwszym
  commitem kodu; plan sesji w `aaeb4fd`.
- [x] **Etap 2 — audyt PR #148**: przegląd każdego zmienionego pliku `src/` pod
  kątem CR, ADR 0002 (zero przypadków po nazwie/ID karty) i generyczności;
  weryfikacja pinów mutacjami (5 mutacji, każda cofnięta); sondy na żywym
  silniku; źródła CR (wydanie 2026-09-25) pobrane online przed wnioskami
  (ADR 0030). Raport: `docs/audits/AUDYT_PR148_2026-10-01.md` (`f6cea15`).
  Wynik: **APPROVE — brak nowych znalezisk**; F1/F2/F3 z poprzedniej sesji
  domknięte i sprawdzone mutacyjnie; O1 zweryfikowane (sonda `faceDown`);
  sweep 702.2b→702.2c sparowany poprawnie.
- [x] **Etap 3 — naprawy znalezisk**: brak znalezisk do naprawy (audyt czysty);
  obserwacje O-a/O-b/O-c zapisane w raporcie jako otwarte (O-b nieosiągalne).
- [x] **Etap 4 — pętla jakości** (ADR 0021 §4):
  - Żywy Tester 3 partie: s201 `zendikar`/`tarkir-bg`, s202 `kaladesh`/`theros`,
    s203 `eldraine`/`ravnica` — 0 zgłoszeń detektorów, 0 niewycenionych ruchów,
    brak `[STOP]`/`LIMIT`; transkrypty w `/home/user/scratch/tester-s20*.txt`.
  - **U4** z #146 („{C} tapie ląd dający zielony") — 5 wariantów sondy NIE
    odtwarza; domknięcie pinami `test/audyt-pr148b-pip-c-zrodlo.test.js` (3;
    mutacja „każda jednostka opłaca {C}" czerwieni U4/1+U4/2) — `bfbcbe6`.
  - **U3** z #146 — cytaty 615.4/615.6 (prewencja), 701.14a/d (fight),
    714.2b (Saga) potwierdzone dosłownie u źródła (CR 2026-09-25) i znaczone
    w komentarzach; brak rozjazdów do naprawy.
  - Ścieżki tej sesji (badge zakazu ataku, trample w wycenie bloku) nie były
    powtarzane — zgodnie z ADR 0021 §4b.
- [x] **Etap 5 — zamknięcie**: `docs/setup/HANDOFF_2026-10-01b.md`,
  `docs/PROJECT_HISTORY.md`, opis PR #149, blok przekazania dla następnej sesji.
- [x] **Etap 6 — domknięcie O2 i O-a z audytu** (kolejna fala pętli jakości,
  „kontynuuj"): O2 — drabinka „presji życia" w `declare_blockers` czytana
  z `lifeAfter` (wynik wariantu) remisowała PMSSB-31/B4 (39 = 39); premia liczy
  się teraz ze STANU (moje życie), więc jest niemalejąca względem zatrzymanych
  obrażeń, a bramka `lifeAfter >= 1` zostaje jako pierwszeństwo (M146).
  O-a — `attackerNeutralizedByProtection` liczy „lethal" blokera z wytrzymałości
  EFEKTYWNEJ (CR 510.1c + 702.19b), tą samą miarą co `blockAbsorbedDamageOf`
  (L41). Piny: B4 przepisany + `test/audyt-pr148b-ochrona-lethal-blokera.test.js`
  (O-a/1–4); mutacje czerwienią odpowiednio B4, M146 i O-a/1. Golden-master bota
  bez zmian fixture'a; Żywy Tester 4× czysto (s401–s404).

- [x] **Etap 7 — AI-R10 (zlecenie właściciela w trakcie sesji)**: limit
  odpowiedzi trybu `talkshow` obniżony 1200 → 900 znaków
  (`TALKSHOW_COMMENT_LIMIT` w `src/table/ai-modes.js`; decyzja: „1200 to za
  dużo”). Pin wartości w `test/ai-modes.test.js` (mutacja „powrót 1200”
  czerwieni test talkshow). Prompt-only — bez zmian w `Code.gs`.

- [x] **Etap 8 — U5/O3 z audytu #146 (fala z planem)**: liczby wariantu Food
  (+5/+5 za poświęcenie, +3/+3 inaczej) przeniesione z silnika i bota do
  DESKRYPTORA karty (`powerIfSacrificed`/`toughnessIfSacrificed`,
  `powerIfKept`/`toughnessIfKept`); silnik tylko stosuje, oczekująca decyzja
  niesie oba warianty, a widok wystawia je decydentowi
  (`view.pendingFoodChoice`, ADR 0017). Próg „mało życia” (10) i mnożnik ×2
  to pokrętła (`foodKeepLowLifeThreshold`, `foodKeepLowLifeMultiplier`).
  Piny: `test/audyt-u5-o3-food-deskryptor.test.js` (9; mutacje: twarde 5/3
  w bocie → D1+D2, `sacrificed ? 5 : 3` w silniku → B3, twarde +3 auto →
  B4, deskryptor bez liczb → strażnik katalogu A). Żywy Tester runda 4
  (s501–s505 na świeżym buildzie) — 0 zgłoszeń; w s504 bot rzuca Insatiable
  Appetite, więc nowa ścieżka przeszła żywą partię.

## Ryzyka

- Budżet lektury: po wpisaniu **L172** (O2/O-a) i kondensacji L163/L164/L165/
  L168/L169 `LESSONS.md` = 138 422 B, budżet **99 942/100 000** (zapas 58
  tokenów) — próg NIE podniesiony, kolejny wpis znowu płaci się skróceniem.
- Re-provisioning sandboxa: na starcie każdej tury `git rev-parse HEAD` vs
  `git ls-remote`; push jest jedynym trwałym zapisem pracy (ENVIRONMENT §2).
- Golden-master bota: każda zmiana wyceny wymaga świadomej regeneracji fixture'a
  (próg regresji bez zmian).

## Podsumowanie wykonania

- **Audyt #148:** APPROVE, brak nowych znalezisk. Najmocniejszy dowód: macierz
  mutacji (A→F1/2, B→F1/1, C→F1/3+F1/5, D→O1/2, E→O1/1+O1/5) — każdy pin
  testów z #147/#148 rozróżnia swoją regułę.
- **Pętla jakości:** Żywy Tester 3× czysto; U4 zamknięte pinami (nie odtwarza
  się), U3 zamknięte weryfikacją u źródła (wszystkie cztery cytaty zgodne).
- **Bramka końcowa:** `npm test` **7222/7222** (7219 + 3 piny U4),
  `npm run build` **70 / 4673,6 kB**; `npm run test:all` **7493/7493** (handoff).
- **Etap 8 (U5/O3):** `npm test` **7235/7235**, `npm run build` **70 / 4680,0 kB**;
  brak zmian zachowania (wartości domyślne == dawne stałe, golden-master zielony).
- **Etap 7 (AI-R10):** limit talkshow 900 (pin + mutacja), build 70 / 4674,8 kB.
- **Etap 6 (O2 + O-a):** `4fcbff7`; `npm test` **7226/7226** (baza 7222 + 4 piny
  O-a), `npm run build` **70 / 4674,6 kB**; Żywy Tester 4 partie (s401 defensive
  zendikar/innistrad-wu 30 akcji/1 modal, s402 greedy theros/warhammer-ubr 18/2,
  s403 random kaladesh/tarkir-bg 14/0, s404 hoarder eldraine/dominaria-brg 16/0)
  — 0 zgłoszeń detektorów, 0 niewycenionych ruchów, brak `[STOP]`.
