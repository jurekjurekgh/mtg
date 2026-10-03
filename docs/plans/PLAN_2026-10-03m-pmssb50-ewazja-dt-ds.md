# PLAN 2026-10-03m — PMSSB-50: premia ewazyjna deathtouch / double strike w wycenie ataku

Zlecenie: pozycja 3 kolejki z `docs/setup/HANDOFF_2026-10-03g.md` i 03h
(„premia ewazyjna deathtouch/double strike w wycenie bloku", granica (1)
z sekcji PMSSB-41: „premia ewazyjna w `warpEtbHostPayoff` jest wąska").

## Problem (zmierzony, nie przeczuty)

Wycena deklaracji atakujących liczyła progi zabicia **gołą mocą**
(`power >= blocker.toughness`) i mocą pojedynczą w obrażeniach w twarz. Sonda
`tools/probe-pmssb50-evazja-dt-ds.mjs` (usunięta po naprawie — liczby niżej):

| Scenariusz | PRZED | Dlaczego źle |
|---|---|---|
| A1: 1/1 bez keywordów vs bloker 5/5 | −10 | dobrze (chump) — KOTWICA |
| A2: 1/1 **deathtouch** vs bloker 5/5 | **−10** | identycznie jak bez DT; obrońca nie odda 5/5 za 1/1, więc blok nie przyjdzie, a 1 obrażenie wchodzi |
| A3: 3/3 bez keywordów vs bloker 5/5 | −10 | dobrze — KOTWICA |
| A4: 3/3 **deathtouch** vs bloker 5/5 | **−10** | jak A2; blok = śmierć 5/5 |
| A5: 3/3 **deathtouch** vs bloker 1/5 | **−2** | gałąź „przeżyje, ale nie zabije” — z DT bloker GINIE (próg to 1) |
| B1: otwarty stół, 2/2 bez keywordów | 13 | dobrze — KOTWICA |
| B2: otwarty stół, 2/2 **double strike** | **13** | DS bije w twarz w OBU odsłonach: 4, nie 2 |
| B3: obrońca 4 życia, 2/2 **DS** | **33** | 4 obrażenia ≥ 4 życia = lethal, a model go nie widział |
| B4: obrońca 4 życia, 2/2 bez keywordów | 33 | dobrze — KOTWICA |
| B5: 2/2 **DS** vs bloker 4/4 | **−10** | 2+2 = 4 ≥ 4: bloker ginie, więc to WYMIANA, nie chump |

## Zakres (jedno źródło reguły — L41; generycznie, ADR 0002/0017)

1. `lethalDamageOf(object)` — ile obrażeń wystarcza na śmiertelne:
   deathtouch (CR 702.2b) → ∞ przy mocy ≥ 1, double strike (CR 702.7b) →
   2 × moc, reszta → moc. Użyte w progach „zabija blokera": gałąź
   „przeżyje i zabije", gang blokerów, wymiana.
2. `killsBeforeBlockerStrikes` — próg „zabija, ZANIM bloker odpowie" zostaje
   przy JEDNEJ odsłonie (first strike CR 702.7, pierwsza odsłona DS), bo dwie
   odsłony to próg WYMIANY: bloker zdąży oddać (2/2 DS vs 4/4 = trade).
   Rozdzielenie wyszło z pinu E6 (pierwsza wersja z `lethalDamageOf` w tym
   progu dawała „przeżyje” dla wymiany — over-fix złapany przez sondę, m6).
3. `faceDamageOf(object)` — obrażenia dochodzące do GRACZA: double strike
   podwaja (2/2 DS = 4). Użyte w gałęziach „przechodzi” (nieblokowalny,
   immunitet, otwarty stół, cantBlock, czasowa kontrola) i w `totalPower`
   (próg lethal `penetratingPower >= enemyLife`).
4. Gałąź „deathtouch praktycznie nieblokowalny": gdy KAŻDY nietapnięty bloker
   jest cenniejszy (moc + wytrzymałość — ta sama skala co `blockerValueLost`)
   niż atakujący, blok nie przyjdzie (obrońca nie odda 5/5 za 1/1) → atak
   liczy się jak ewazyjny (M202/H), a nie jak chump. Próg jest OSTRA
   nierównością: równa wymiana zostaje wymianą (pin E9).
5. Nowy plik pinów `test/pmssb50-ewazja-dt-ds.test.js` (E1–E9).

Bez nowych pokręteł: to reguły CR (deathtouch/DS), nie wagi — pokrętła mają
sens dla liczb strojonych, nie dla faktów regułowych.

## Kryteria ukończenia

- [x] `npm test` zielone (fast) i `npm run build` zielone.
- [x] Każdy pin czerwienieje po cofnięciu naprawy (m1–m8 udokumentowane).
- [x] Anty-over-fix: bez keywordów wycena bez zmian (A1/A3/B1/B4/B7 = kotwice),
      próg ewazji nieostry łapany pinem E9, podwojenie obrażeń poza DS pinem E4.
- [x] Zero nazw kart w kodzie (ADR 0002); karty w testach z katalogu
      właściciela (ADR 0029 — nic nie dodano).
- [x] Golden-master: dryf JEDNEJ partii zlokalizowany i świadomy (niżej),
      fixture zregenerowany z uzasadnieniem (precedens PMSSB-32).
- [x] Sondy usunięte z drzewa po naprawie (L173); liczby w tym planie.
- [x] Wpis w `docs/PROJECT_HISTORY.md`, sekcja `## PMSSB-50` w `docs/PMSSB.md`
      (granica (1) §PMSSB-41 oznaczona jako domknięta) + handoff 03i.

## Dowód dryfu golden-mastera (świadomy)

Jedna partia na sześć: `tarkir-bg|warhammer-ubr@1001` — decyzja **#104**
(tura 9, `declare_attackers`), przy decyzjach 218 → 217 i `scoreSum`
2755,6261 → 2758,6261:

```
PRZED: chosen attack[permanent-12]              score 1
       attack[permanent-22]                     score −10   ← chump
AFTER: chosen attack[permanent-12,permanent-22] score 5
       attack[permanent-22]                     score 4     ← 1 + premia przejścia 3
```

Deskryptor stanu (zrzut z przebiegu diagnostycznego): bot kontroluje
`woolly-loxodon` 2/2 (`permanent-12`) i `typhoid-rats` 1/1 **deathtouch**
(`permanent-22`), a wrogie nietapnięte blokery to `goblin-piker` 2/1
i `goblin-battle-jester` 2/2 — oba CENNIEJSZE od 1/1 (3 i 4 > 2), więc blok
jest dla obrońcy wymianą w dół i nie przyjdzie. Bot po naprawie atakuje oboma
stwórami (`typhoid-rats` = moc 1 + premia przejścia 3 = 4, dokładnie pin E1) —
to zamierzony efekt rundy, a nie regresja.

## Wykonanie (2026-10-03m)

- Commit `98b8de9` — naprawa + piny + regenerowany fixture; `npm test`
  **7531/7531** EXIT 0 (117,5 s), build **70 modułów / 4809,8 kB**,
  `bot-scoring-snapshot` 4/4 po regeneracji, `event-contract-audit`
  0 naruszeń, regresja skoncentrowana (M188/M202/M218/M221/M237/M239/M297/
  M317/M325 + PMSSB-16/31/49) **252/252**.
- Mutacje (oczekiwane RED → po przywróceniu zielone): m1 → E3,E6;
  m2 → E3; m3 → E6; m4 → E1,E2; m5 → E4,E5; m6 (over-fix progu „przed
  blokerem") → E6; m7 (nierówność nieostra) → E9; m8 (podwojenie zawsze) →
  E4,E5.
- Dokumentacja: ten plan, `## PMSSB-50` w `docs/PMSSB.md`, `docs/PROJECT_HISTORY.md`
  `2026-10-03m`, handoff `docs/setup/HANDOFF_2026-10-03i.md`.
