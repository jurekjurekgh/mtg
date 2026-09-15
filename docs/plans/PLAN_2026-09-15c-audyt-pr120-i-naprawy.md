# Plan 2026-09-15c — audyt PR #120 + naprawa znalezisk (ADR 0020 A/B)

**Zlecenie:** „Kontynuujemy projekt." — prompt nie nazywa tematu → pętla domyślna
ADR 0021: PR sesji → audyt ostatniego scalonego PR (**#120**) → naprawy → pętla jakości.

**Stan wejściowy (zmierzony 2026-09-15):**
- `main` = `01c22a9` (squash PR #120); gałąź sesji `arena/01a0a505-mtg` czysta.
- `npm test` **5496/5496** (0 fail, ~204 s), `node --test test/bot-benchmark.test.js`
  **10/10** (próbka regresji, ADR 0016), `npm run build` 61 modułów / 3660,4 kB.
- Golden-master `test/bot-scoring-snapshot.test.js` 4/4 na main.

## 0. Audyt PR #120 (ADR 0020 B)

PR #120 = „Znaleziska A–G" (Savage Surge, Spare from Evil, Civilized Scholar log,
Powerstone restricted, Murder/Skaab draw-mill, Altar badge). 8 plików: 2 dokumenty,
6 źródłowych (+445/−18), **zero plików testowych**. Wyniki w
`docs/audits/AUDYT_PR120_2026-09-15.md` (E1). Skrót:

- **F1 (blokujące, naprawa E2)** — wycena `resolve_optional_trigger_choice` czyta
  `view.pendingOptionalTrigger.ability`, a widok projektuje `{sourceCardId, effect}`
  (`game-state.js` ~7871). Martwy kod: kara cienkiej biblioteki nigdy nie naliczona.
  Repro headless: biblioteka 4 karty → bot pali triggera (score 50 > 0), identycznie
  jak przy 25. Klaim commita „Murder przy 4 kartach teraz passują" niespełniony.
- **F2 (naprawa E3)** — kreator many odcina Powerstone (`spendOnly: 'artifact'`) od
  płatności za `activate_ability`; Oracle (Scryfall API, BRO token, 2026-09-15):
  „This mana can't be spent to cast a nonartifact spell." — zdolności NIE są objęte;
  silnik (`restrictedManaBlocked` = `castingSpell && !artifactSpell`) też pozwala.
  Rozjazd kreator↔silnik (L48), zawężenie legalnej akcji gracza.
- **F3 (sprzątanie E4)** — martwy kod z PR #120: nieużywana `artifactPurposeFor`
  (0 wywołań), identyczne gałęzie `else if (...) trick = -75; else trick = -75;`,
  zakomentowany `// DEBUG console.log` (L58), nieużywany `export`
  `protectionPreventsAnyLethal` (test, dla którego był, nie istnieje w repo).
- **F4 (dokumentacja E5)** — błędne numery CR w komentarzach: „CR 709.2a" przy
  Altarze (CR 709 = „Split Cards" — weryfikacja online 2026-09-15); zamienione
  d↔e przy protection (702.16e = prewencja obrażeń).
- **F5 (proces, bez kodu)** — sesja #120 nie zamknęła dokumentacji: plan
  `PLAN_2026-09-15b` z nieodhaczonymi E1–E7 i bez podsumowania; brak handoffu i
  wpisu `PROJECT_HISTORY`; README „Bieżący stan" niezmierzony. Klaimy commitów bez
  pokrycia w repo: „Snapshot zaktualizowany (--write)" (fixture identyczny przed i
  po — test na main zielony), „11 testów zielonych" / „Test: Main1 -> pass" (testów
  brak).

## Etapy (inkrementalnie, każdy commit zielony: `npm test` + `npm run build`)

- [x] **E0** — ten plan + PR sesji (ADR 0020 A)
- [x] **E1** — raport audytu `docs/audits/AUDYT_PR120_2026-09-15.md` (pełny, z repro)
- [x] **E2** — **F1**: czytanie `pending.effect` w wycenie optional-trigger + testy
      (RED przed fixem: fire przy 4 kartach; GREEN po: pass przy 4, fire przy 25;
      mutacja fixu → RED, L13)
- [x] **E3** — **F2**: kreator many — ograniczenie `spendOnly` stosowane wyłącznie
      do rzutów czarów nie-artefaktowych (mirror `restrictedManaBlocked`) + testy
- [x] **E4** — **F3**: usunięcie martwego kodu z PR #120 (L5: martwy wartownik)
- [x] **E5** — **F4**: sprostowanie cytatów CR w komentarzach (dosłowne cytaty,
      ADR 0030 pkt 3)
- [ ] **E6** — domknięcie: `npm run test:all`, README „Bieżący stan" (L92),
      handoff, `PROJECT_HISTORY` (z adnotacją o braku zamknięcia sesji #120),
      opis PR kumulacyjnie

## Weryfikacja regułowa (ADR 0030 — źródła, 2026-09-15)

- Powerstone token (BRO T7, `d45fe4b6…` — zgodne z `imageUri` w repo):
  `{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.`
  → api.scryfall.com (fetch_page). Ograniczenie NIE obejmuje zdolności.
- CR 709 = „Split Cards" (yawgatog + mtg.fandom/Fuse „see rule 709, Split Cards").
- CR 702.16e = „Any damage that would be dealt by sources that have the stated
  quality to a permanent or player with protection is prevented." (prewencja);
  702.16f = atakujący z protection nie może być blokowany.
- CR 400.2 = strefy publiczne (cmentarz jawnie publiczny) — cytaty w PR #120 poprawne.

## Granice

- Bez nowych kart (ADR 0029), bez zmian Oracle/katalogu.
- Zero wyjątków po nazwie karty w core (ADR 0002).
- Bot czyta PlayerView (ADR 0017) — naprawa F1 jest u root cause kontraktu widoku,
  nie w heurystyce wokół brakującej informacji.
- Surgical patching (ADR 0016), testy z weryfikacją mutacyjną (L13), B0 tylko na
  komendę właściciela (ADR 0018).

## Podsumowanie wykonania (2026-09-15)

- E0–E5 wykonane commitami `8ef681e`, `9170ff3`, `75a987d`, `0f979a8`, `56c918f`,
  `bf8585d` (każdy samodzielnie zielony, ADR 0020 C/D). E6 = domknięcie
  (test:all 5513/5513, README, handoff `HANDOFF_2026-09-15b.md`, dziennik,
  opis PR #121 kumulatywnie).
- F1 naprawione i przypięte testem z weryfikacją mutacyjną (RED przed/po).
- F2 naprawione (wspólny kontrakt kreatora i silnika) + testy vm + mutacja.
- F3/F4 posprzątane; F5 opisany w audycie i uzupełniony w tej sesji
  (plan 15b, dziennik, README, handoff).
- Pozostały obserwacje O1/O2/O3/O4/O5 (raport audytu) — nieblokujące.
