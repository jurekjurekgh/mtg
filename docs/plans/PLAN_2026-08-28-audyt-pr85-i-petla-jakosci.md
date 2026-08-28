# PLAN 2026-08-28 — audyt PR #85 i pętla jakości (sesja arena/01a047db)

**Sesja:** `arena/01a047db-mtg`. **Baza:** `main` @ `2a1e79d` (squash PR #85).
**Prompt:** „Kontynuujemy projekt." — brak nazwanego tematu → ADR 0021 (pętla domyślna).
**Zasady:** ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity; bez force push).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3611/3611 pass** (~122 s) — zgodne z handoffem poprzedniej sesji.
- `npm run build`: OK, `dist/mtg-table.html` = 55 modułów / 2829.6 kB — zgodne z handoffem.

## Etap 1 — audyt PR #85 (ADR 0020 B / ADR 0016)

Zakres PR #85 (squash `2a1e79d`): fix E1 (fingerprint: `pendingEscapeExile` w
`PENDING_DECISION_FIELDS`), nowy `test/pr84-fingerprint-escape-pending.test.js`,
dokumentacja (AUDYT_PR84, PLAN, HANDOFF, PROJECT_HISTORY).

### Kroki
- [ ] Przegląd diffa każdego zmienionego pliku (kod ×2, docs ×4).
- [ ] Weryfikacja RED→GREEN testu E1 **mutacją** (L61): skasować `'pendingEscapeExile'`
      z listy → test MUSI paść; przywrócić → zielony.
- [ ] Skan kompletności **klasy L16**: zestawić pola czytane przez
      `firstPendingDecisionPlayerId` (ground truth: co faktycznie BLOKUJE grę)
      z projekcją fingerprintu (16 pozycji ręcznych + `PENDING_DECISION_FIELDS`).
      Kandydaci na lukę (ujawnieni skanem na starcie): `pendingManifestDread`,
      `pendingSuspendCast`, `pendingOpponentTarget`, `pendingFabricate`,
      `pendingCopyTargets` — każdy zweryfikować osobno (czy blokujący).
- [ ] Spisanie wniosków → `docs/audits/AUDYT_PR85_2026-08-28.md`, wynik do opisu PR.

## Etap 2 — naprawa u root cause klasy L16 (jeśli potwierdzona)

- [ ] Dopisać potwierdzone brakujące pola blokujące do fingerprintu.
- [ ] Testy zachowania: fingerprint różnicuje stan przed/po otwarciu decyzji
      (dla każdego dopisanego pola) + projekcja obecna w `pendingDecisions`.
- [ ] **Strażnik klasy** (L39/L28): test źródłowy czytający ciało
      `firstPendingDecisionPlayerId` i wymagający, by KAŻDE konsultowane tam pole
      `pending*` było pokryte w fingerprintu (lista albo projekcja ręczna) —
      zamyka klasę przy przyszłych decyzjach, nie tylko dziś.
- [ ] Weryfikacja mutacyjna strażnika (skasować pole z fingerprintu → RED).

## Etap 3 — pętla jakości projektu (ADR 0021)

- [ ] Audyt Żywym Testerem z perspektywy gracza na najmniej przeczesanych taliach
      (handoff poprzedniej sesji: `innistrad-wu`, `tarkir-bg`, `srodziemie`,
      `zendikar`, `wiedzmin`…, spoza próbki benchmarku). Zakres: bezsensowne
      działania bota, kompletność logu/modalu, ptaszki auto-pass.
- [ ] Znalezione klasy problemów → naprawy u root cause + nowe detektory.
- [ ] Alternatywnie/uzupełniająco: polowanie na niezgodności z CR inną ścieżką
      niż poprzednia sesja.
- **Nie** wymyślać nowego batcha kart (ADR 0021 pkt 4c).

## Ryzyka / pułapki

- Żywy Tester mierzy `dist/`, nie `src/` — przebudować po każdej zmianie (L76);
  wymaga `npm i` w `tools/table-tester` (izolacja sesji, ENVIRONMENT §1).
- Strażnik źródłowy = uzupełnienie, nigdy jedyne zabezpieczenie (L5) — obok
  testów zachowania.
- `npm test` = szybki rdzeń; brama PR to `npm run test:all` (ADR 0019).
- Pełny B0 tylko na komendę właściciela (ADR 0018); `stateFingerprint` zwraca
  JSON string (handoff poprzedniej sesji).
- Force push zakazany (ADR 0020 D); push po każdym zielonym kroku.

## Kolejność commitów

1. (ten plik) PLAN + otwarcie PR (ADR 0020 A).
2. Audyt PR #85 → `docs/audits/AUDYT_PR85_*.md` (osobny commit dokumentacyjny).
3. Fix klasy L16 + testy + strażnik (osobny commit funkcjonalny).
4. (pętla jakości — dopełniane w miarę pracy; handoff na końcu sesji.)

## Podsumowanie wykonania

(dopisywane na końcu sesji)
