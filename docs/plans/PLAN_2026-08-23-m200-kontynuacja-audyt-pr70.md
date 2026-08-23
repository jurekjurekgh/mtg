# Plan sesji M200 (kontynuacja) — przejęcie PR #71 + audyt PR #70 + pętla jakości

- **Data:** 2026-08-23
- **Sesja:** `arena/01a02f35-mtg`, PR sesji: otwierany po tym commicie (ADR 0020 A)
- **Wzorzec:** ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity),
  ADR 0021 (pętla domyślna — prompt „kontynuujemy"), ADR 0016 (metoda audytu),
  ADR 0018 (pełne B0 NIE), ADR 0019 (tiers testów).

## Kontekst — przejęcie odrzuconej pracy (PR #71)

Poprzednia sesja (`arena/01a02ebc-mtg`, PR #71, M200) została **zamknięta bez
scalenia** przez właściciela z uwagi na wątpliwości co do jakości. Praca
została odzyskana z gałęzi na GitHubie (`11ed952`) i **przeze mnie
zweryfikowana** przed przejęciem (L7/L11/L56 — repo i pomiary, nie deklaracje):

1. **Stan `11ed952` jest zielony:** `npm test` **3003/3003**, `npm run build`
   **53 moduły / 2549.2 kB**, `node --test test/bot-benchmark.test.js` **9/9**.
2. **Weryfikacja mutacyjna testów na kodzie PR #70 (`aa61167`)** — każdy test
   musi czerwienieć tam, gdzie ma:
   - N1: strażnik mapy **RED** (łapie 4 cienie: manor-gate,
     scorned-villager, moonscarred-werewolf, seers-lantern); snapshoty
     zachowania GREEN (zachowanie się nie zmienia).
   - N2: **5/9 RED** (oferta życiowa, kolejność wariantów, koszt 4 many,
     płatność życiem, dane zdarzenia + log).
   - N3: **2/3 RED** (pełna ścieżka, edge case); anty-over-fix GREEN.
3. **Weryfikacja faktów z opisów fixów:**
   - `ruthless-invasion` = pierwszy CZAR z pitem phyrexian
     (`MANA_COSTS: "{3}{R/P}"`, `manaCost 3 + phyrexianManaCost 1`; jedyna
     inna karta z pitem phyrexian to stwór);
   - na `main` zdarzenie `combat_damage_to_you` występuje TYLKO w tablicy
     etykiet `session.js` — framework triggerów go nie emitował ani nie
     skanował (trigger Contested Game Ball martwy; testy batcha 48 wołały
     `applyEffect` wprost = fałszywie zielone, L5/L21 — naruszenie ADR 0022);
   - ścieżka `castPermanent` (resources.js) od dawna ma pełne warianty
     `phyrexianPayWithLife`; ścieżka czarów ich nie miała;
   - `coloredPipsOf(cardId, lifePaid)` i `changeLife` istnieją, import
     `players.js` w `spells.js` nie tworzy cyklu (players importuje tylko
     `protocol/types.js`);
   - kolejność wariantów w panelu: `playerView` wstawia `legalSpellCasts`
     przez `unshift` → odwrotność; fix odwraca warianty przy pushu (k=0
     pierwsze) — zgodne z konwencją `cast_permanent`.
4. **Wnioski:** trzy fixy (N1, N2, N3) są **poprawne i warte przejęcia**.
   Znalazłem przy okazji dwie obserwacje:
   - **O-N3:** gałąź triggeru w `triggers.js` ma redundantny pre-check
     `conditionHolds(ability.trigger, state, candidate, {})` z PUSTYM
     eventData, podczas gdy `tryFire` i tak sprawdza warunek z pełnym
     `extra` — dziś bezskuteczny (brak warunków czytających eventData), ale
     pułapka na przyszłość. Fix chirurgiczny: usunięcie linijki.
   - **O1** (z commitu N3, nienaprawiane): nadwyżka trample BLOKERA nie idzie
     w gracza, którego bloker broni (CR 702.19) — oddzielny temat (S4b).

## Etapy (każdy zielony krok = osobny commit + push)

### S0 — Roadmapa (ten plik) → commit/push, otwarcie PR.
- Kryterium: PR na GitHubie z gałęzi `arena/01a02f35-mtg`.

### S1 — Przejęcie N1 (cherry-pick `c8b570b`) + push.
- Kryterium: `npm test` + `npm run build` zielone na HEAD po cherry-picku.

### S2 — Przejęcie N2 (cherry-pick `0aa2bc9`) + push.
- Kryterium: j.w.

### S3 — Przejęcie N3 (cherry-pick `11ed952`) + push.
- Kryterium: j.w.

### S4 — Fix chirurgiczny O-N3 (redundantny pre-check) + push.
- Kryterium: testy N3 (pełna ścieżka) nadal zielone (warunek przechodzi przez
  `tryFire`), `npm test` + build zielone.

### S5 — Dokończenie audytu PR #70 (ADR 0020 B; checklista E2a–E2e z planu
  poprzedniej sesji — ten plik przejmuje ją bez zmian). Poprzednia sesja
  zrobiła rozpoznanie i 3 fixy; **raportu audytu nie ma** — powstaje w
  `docs/audits/AUDYT_PR70_2026-08-23.md` (commit z pierwszym fixem audytowym
  albo osobno, gdyby audyt był czysty).
- E2a: Batche 46–48 vs Oracle (strażniki katalogowe + testy batchy vs
  scenariusze Oracle).
- E2b: ADR 0002 — zero nazw/ID kart z PR w core.
- E2c: nowe mechaniki vs CR (m.in. `blockers_declared`, equip z warunkiem
  podtypu, `formidable`, flash podtypu, `outlast`, `freeIfCondition`,
  `combat_damage_to_you` [S3], wielocelowość, FoW przebiegu tur [M199],
  źródła many [M193 — w tym weryfikacja mutacyjna K5 niedokończonego planu]).
- E2d: oferta = walidacja (L48) — nowe pendingi/pola widoku.
- E2e: weryfikacja mutacyjna 2–3 obszarów PR.
- Kryterium: raport w `docs/audits/` + wynik w opisie PR; znalezione błędy
  naprawione u root cause z testami RED→GREEN.

### S6 — Pętla jakości (ADR 0021) + dokończenie dokumentacji M193.
- S6a: Żywy Tester (6–10 partii, talie batchy 46–48 + worki, profile
  greedy/explorer/defensive/random/impatient; oś audytu z TESTER_STOLU.md).
- S6b: polowanie na CR inną ścieżką niż M187/M192 (kandydaci: declare
  blockers CR 509, transfer kontroli CR 712, flash CR 701.8, outlast
  CR 702.100a + 2–3 obszary nienotykanie; w tym O1 trample blokera).
- S6c: dokumentacja M193 (plan miał nieodhaczone K5–K7): odhaczanie + wpis
  M193/M192 w `docs/PROJECT_STATE.md` (milestone'y istnieją w kodzie i
  testach, nie w stanie — luka dokumentacyjna).
- Kryterium: transkrypty + detektory w `tools/table-tester/`; fixy u root
  cause + nowe detektory; PROJECT_STATE opisuje stan.

### S7 — Zamknięcie sesji.
- `npm run test:all` (brama PR) + build + próba bota zielone.
- `docs/PROJECT_STATE.md` (wpis M200), `docs/setup/HANDOFF_2026-08-23-m200.md`,
  opis PR kumulatywny, blok przekazania w czacie.
- Sprzątanie: usunięcie worktrees weryfikacyjnych.

## Ryzyka i pułapki

- Cherry-picki mogą kolidować z fixami S5 (te same pliki) — przejęcie idzie
  PRZED dalszym audytem, żeby diffy były czyste.
- Reset workspace (ENVIRONMENT §2) — commit+push po każdym zielonym kroku.
- `edit_file` psuje polskie znaki — edycje PL przez `python3` (ENVIRONMENT §4).
- Żywy Tester gra na ZBUDOWANYM artefakcie (`npm run build` przed użyciem;
  `npm i` w `tools/table-tester` przy pierwszym użyciu).
- Brama PR = `npm run test:all` (ADR 0019); pełne B0 zabronione (ADR 0018).
- Pułapki L21 (pole spoza kontraktu), L48 (oferta ≠ walidacja), L15
  (połowa tropów fałszywa — dokumentować), L33 (tester kłamie o stanie gry).
- Nie wymyślać nowych batchy kart (ADR 0021 §4c).

## Podsumowanie wykonania (2026-08-23)

- **S0** ✓ roadmapa, PR #72 otwarty.
- **S1–S3** ✓ N1/N2/N3 przejęte (każdy zweryfikowany: stan zielony 2991→3000→3003,
  weryfikacja mutacyjna na kodzie PR #70), S4 ✓ O-N3.
- **Uwagi właściciela (wpłynęły w trakcie):** A (wycofane — Oracle), A2 ✓, B ✓
  (root cause: `cardIdByName` nieeksponowane), C/C2 ✓, D+E2 ✓ (root cause:
  `any_creature_dies` na nie-stworach), E ✓ (bramka kreatora), F ✓ (werdykt:
  poprawne wg CR 502.4/601.2f — test pinuje), G ✓, H ✓, R ✓ (wycena self-millu).
- **S5 (audyt)** ✓ raport `docs/audits/AUDYT_PR70_2026-08-23.md`: N5, L
  (prawdziwy błąd — fix turn-level), Formidable (WYCOFANE na decyzję
  właściciela), M/M2 (werdykt: poprawne — testy pinują), E2a–E2e zamknięte.
- **S6** częściowo: pętla jakości Żywym Testerem na zbudowanym artefakcie
  **niewykonana** (decyzja właściciela: zakończyć sesję po fixach zgłoszeń);
  domknięto M193 (K5–K7). Do następnej sesji: Żywy Tester + U2 + O1.
- **S7** ✓ handoff, PROJECT_STATE, opis PR; pakiet 3023/3023, build
  53/2561.2 kB; PR #72 otwarty (scalanie — decyzja właściciela).
