# Plan sesji 2026-10-03j — audyt PR #153 (PMSSB-41 runda 2 … PMSSB-48) + naprawy u root cause

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: inkrementalne
commity, D: tylko przyrostowo) + ADR 0021 (pętla domyślna — prompt „Kontynuujemy
projekt" nie nazywa tematu).

**Wejście:** `main` po scaleniu PR #153 (squash `05aa83e`, 2026-10-03 18:11 UTC).
Gałąź sesji: `arena/01a102f7-mtg`. Baseline: `npm test` **7500/7500** (0 fail,
103 s), build 70 modułów.

## Zakres audytu (ADR 0020 B / ADR 0016)

PR #153 zmienił 29 plików, w tym 6 źródeł: `src/engine/spells.js`,
`src/engine/game-state.js`, `src/engine/resources.js`,
`src/controllers/heuristic-bot.js`, `src/table/session.js`, `src/table/render.js`
(+ 8 plików testów, 12 dokumentów). Audyt obejmuje każdy z nich pod kątem:
poprawności wobec CR/Oracle, generyczności (ADR 0002), kompletności widoku
(ADR 0017), kontraktu oferta=walidacja (L48) i tego, czy testy mierzą to, co
deklarują (L13, weryfikacja mutacyjna).

## Znaleziska (wstępne, potwierdzone sondą `.arena/probe-audyt153.mjs`)

### F1 (błąd, klasa L13 §6 + ADR 0022) — PMSSB-47 zabrał wchodzącemu stworowi prawo bycia własnym gospodarzem ETB

`etbFriendlyCounterTargetAvailable` po zmianie wymaga **istniejącego** stwora na
polu bitwy, a wchodzący permanent stoi już na polu, gdy ETB wchodzi na stos
(CR 603.6d) — sam jest legalnym celem dla „target creature (you control)"
bez `notSelf`.

Dowód (silnik, nie pamięć): przy pustym stole własnym rzut Weftblade Enhancer
daje **jedną** ofertę celu ETB — `permanent-1`, czyli wchodzącego stwora
(`view.legalCommands` → `resolve_trigger_target { targetIds: ['permanent-1'] }`;
`legalTargetCandidates(..., {type:'creature'}) === ['permanent-1']`).
Oracle karty: „put a +1/+1 counter on each of up to two target creatures"
(ruling/CR 603.6d: cel wybierany, gdy permanent już jest na polu).

Skutek: bot liczy 0 premii ETB tam, gdzie realnie dostaje +1/+1 (albo +2/+2 —
Simian Simulacrum), czyli **zaniża** rzut; dodatkowo `test/audyt-pmssb35-odroczenie.test.js`
A4 przesunięto z 71.103 na 65.703, utrwalając błędną regułę (L13 §6).

Katalog objęty wadą (6 kart, skan rejestru): `cloudbound-moogle`,
`simian-simulacrum`, `weftblade-enhancer` (wchodzący jest stworzeniem → sam
jest gospodarzem), `jade-bearer` (`notSelf` — poprawnie wymaga innego Merfolka),
`idyllic-grange` (LĄD — nie może być własnym gospodarzem; tu PMSSB-47 naprawił
realną zawyżkę), `lodestone-needle` (spec wrogi — bez zmian).

### F2 (błąd kontraktu porządku) — PMSSB-46 zmienia kolejność puli także wtedy, gdy pula NIE jest przycinana

`dividedDamageDivisions` rezerwuje miejsca dla klas 1/2 **zawsze**, więc pula
zaczyna się od gracza-wroga również przy `candidates.length <= CAP`, wbrew
komentarzowi bloku („kolejność niesie treść: najpierw stwory przeciwników,
potem gracze…") i intencji planu („rezerwacja ma znaczenie tylko przy cięciu").

Pomiar (sonda, `legalTargetCandidates` → pula): n=3 `[e0,e1,e2,p2,p1]` →
`[p2,e0,e1,e2,p1]`; n=7 `[e0…e6,p2]` → `[p2,e0…e6]`; pierwsza oferta
`cast` zmienia cel z `e0` na `p2`. Kolejność ofert jest tie-breakerem (L117),
więc to zmiana zachowania nieobjęta zamysłem PR.

### F3 (dług L41/L5) — drugi zapis `cantBeBlockedByPower` w `playerView` jest zbędny

Widok już ustawia to pole z **helpera silnika** (`attackerBlockPowerRestriction`
— linia ~6691, obejmuje też ewazję nadaną sprzętem), a nowy blok PMSSB-45
nadpisuje je tą samą wartością z własnych zdolności (`effectiveAbilities`),
z komentarzem twierdzącym, że „liczy sprzęt" — czego `effectiveAbilities` nie
robi. Dwa źródła jednego faktu (L41); drugi zapis jest martwy, komentarz myli.

### F4 (defekt dokumentacji kodu) — zdublowany blok komentarza PMSSB-46 w `spells.js`

Ten sam akapit komentarza wklejony dwa razy pod rząd.

### F5 (higiena dokumentów) — plany 03h/03i z odhaczonymi zadaniami mają puste checkboxy

Realizacja zadań jest w `main`, ale `PLAN_2026-10-03h-…` ma `[ ]` w etapach 1–6,
a `PLAN_2026-10-03i-…` w etapach 1–7; `HANDOFF_2026-10-03e.md` twierdzi
„Jeszcze nie commitowane" po scaleniu. Do domknięcia w tej sesji.

## Kolejność commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. `docs(plan): sesja 2026-10-03j — audyt PR #153` (ten plik) → PR na GitHubie.
2. `docs(audit): AUDYT_PR153 — 5 znalezisk (F1–F5) z dowodami sondy`.
3. `fix(pmssb47): wchodzący stwór jest gospodarzem własnego ETB (CR 603.6d)` —
   F1 + piny E1–E4 (dwie strony: self liczy się / `notSelf` wymaga innego
   stwora) + korekta kotwicy A4 w `audyt-pmssb35-odroczenie` (65.703 → 71.103)
   z weryfikacją mutacyjną (usunięcie gałęzi self → RED).
4. `fix(pmssb46): rezerwacja klas w puli tylko przy PRZYCIĘCIU (kolejność ofert bez zmian)` —
   F2 + piny O5a/O5b (pierwsza oferta = stwór wroga; `p2` obecny przy n≥8).
5. `fix(pmssb45): jedno źródło cantBeBlockedByPower w widoku (helper silnika)` —
   F3 + usunięcie zdublowanego komentarza (F4).
6. `docs(pmssb47/48): odhaczenie etapów planów i sprostowanie handoffu 03e` — F5.
7. `docs: domknięcie sesji` — handoff `HANDOFF_2026-10-03f.md`, wpis
   w `docs/PROJECT_HISTORY.md`, Hub PMSSB, opis PR.

## Wykonanie (2026-10-03j)

- [x] Commit 1 — `846ef29` docs(plan) · PR #154 otwarty przed kodowaniem (ADR 0020 A).
- [x] Commit 2 — `9043114` docs(audit): F1–F6 z dowodami sond (ADR 0020 B).
- [x] Commit 3 — `6fa26e4` fix(pmssb47): F1 (bramka + piny E1–E4 + kotwica A4 71.103); mutacja m1 → A4+E1 RED.
- [x] Commit 4 — `4ab6e80` fix(pmssb46): F2 **razem z F4** (zdublowany komentarz był częścią przepisywanego bloku — odchylenie od kolejności w planie); piny O5/O6; mutacje m2/m3.
- [x] Commit 5 — `b40e865` fix(pmssb45): F3; mutacja m4 → A2 RED.
- [x] Commit 6 — `233ffaa` docs(pmssb47/48): F5 (etapy, hub §47/§48, HISTORY `2026-10-03h/i`).
- [x] Commit 7 — docs: status audytu, ten plan, handoff `HANDOFF_2026-10-03f.md`; opis PR #154 zaktualizowany.
- Dodatkowo zweryfikowane mutacyjnie piny PMSSB-48 (W1/W2 → RED) jako dowód dla
  domykanych etapów planu 03i.
- Bramki końcowe: `npm test` 7503/7503 EXIT 0, `npm run test:all` 7774/7774
  EXIT 0, build 70 modułów/4801,5 kB, event-contract-audit 0, snapshot 4/4.
- Poza zakresem sesji (kolejka): F6 (jedno źródło „czy obiekt jest kartą"),
  `warp_card` vs rzut w następnej turze, premia ewazyjna deathtouch/double strike,
  `castFutileEtbPenalty` (etap 2 PMSSB-47) — tylko z kartą demonstrującą lukę.

## Kryteria ukończenia

- `npm test` zielony (oczekiwane 7500 + nowe piny), `npm run build` bez błędu,
  `node tools/event-contract-audit.mjs` 0 naruszeń,
  `node tools/bot-scoring-snapshot.mjs` bez dryfu (albo świadoma regeneracja
  z uzasadnieniem w commicie).
- Każdy pin zweryfikowany mutacyjnie (naprawa cofnięta → RED), wynik w opisie
  commita i w raporcie audytu.
- Audyt: raport w `docs/audits/AUDYT_PR153_2026-10-03.md`, streszczenie w opisie
  PR sesji.
- Sprzątnięte sondy `.arena/probe-*` przed bramką (L173, `TESTER_STOLU.md`).

## Ryzyka i pułapki

- **Kolejność ofert a golden-master** (L117/L124): zmiana porządku
  `legalCommands` może ruszyć `bot-scoring-snapshot`; jeśli drgnie — trzy
  drzewa (przed / tylko porządek / porządek + treść), nie „podnieś próg”.
- **Nie zamiatać F1 pod zmianę kotwicy** (L13 §6): pin A4 wraca do 71.103
  dopiero razem z naprawą root cause.
- **Bez kodu na zapas** (ADR 0022 §4): F3 usuwamy, nie rozbudowujemy.
- Testy pinujące przez realną ścieżkę (`setupCardMatch`/`execute`), nie przez
  własne helpery (L21 pkt 3).
