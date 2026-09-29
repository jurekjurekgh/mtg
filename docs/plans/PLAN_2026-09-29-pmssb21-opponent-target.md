# Plan sesji 2026-09-29 — PMSSB-21 (mikro): cel wskazywany przez przeciwnika

## Zlecenie i stan początkowy

- Etap 2 pętli domyślnej ADR 0021 po audycie PR #144 (raport
  `docs/audits/AUDYT_PR144_2026-09-29.md`, naprawy F1–F3, PR #145).
- Rozpoznanie rodziny (krok 2 procedury PMSSB): inwentarz typów efektów
  katalogu (178 typów / 519 kart) × rejestr `docs/PMSSB.md` — wszystkie
  rodziny z rejestru są DONE/POKRYTE; **nowy dowód** daje audyt remisów:
  `node tools/bot-tie-audit.mjs --gry=60` (720 partii, 12 par talii) →
  `resolve_opponent_target`: 305 decyzji, **190 remisów na maksimum i
  WSZYSTKIE 190 rozróżnialne** (dane się różnią, punkty nie) — największy
  klaster poza rodzinami POKRYTYMI i poza walką (blok/atak = szum
  równoważnych tokenów).
- Rejestr opisuje tę rodzinę jako „Cuombajj (1 karta) — OUT (mikro-pętla,
  nie PMSSB); 41 remisów w tie-audycie". Ten plan realizuje **mikro-pętlę**
  (bez fal i bez nowych kart): ponowny audyt po nowym dowodzie pomiarowym
  (procedura PMSSB dopuszcza powrót tylko z nowym dowodem).

## Zakres (jedna decyzja)

`resolve_opponent_target` — Cuombajj Witches (CMR, `cuombajj-witches`,
`decks/wiedzmin-bg.txt`): „{T}: This creature deals 1 damage to any target
and 1 damage to any target of an opponent's choice" (CR 601.2c — drugi cel
wskazuje przeciwnik; aktywacja czeka na jego decyzję przed zapłatą kosztów).
Kandydatów enumeruje `opponentTargetCandidates` (najpierw stworzenia
aktywującego, potem reszta, na końcu gracze).

## Pomiar PRZED (sonda `tools/pmssb21-cuombajj-sonda.mjs`)

| Scenariusz | oferty bota (p2 = wybierający) | WYBÓR |
|---|---|---|
| A: 4/4 i 1/3 aktywującego (oba ocalają) | 30 / 30 / 30 (czarownica, big, small), gracz p1 = 15, p2 = −40 | pierwsza oferta (czarownica 1/3) |
| B: 1/1 (ping zabija) + 3/3 | 102 (fragile), 30 / 30 | fragile ✓ |
| C: własny stwór p2 2/2 | 30 / 30 (wrogowie), własny = 6, gracz wroga = 15 | pierwsza oferta |
| D: tylko gracze | 30 (czarownica aktywującego) / 15 / −40 | pierwsza oferta |

**FINDING F1** (klasa L131): gałąź „wrogi stwór, który OCALA" ma stałą 30 —
wybór między ocalałymi celami jest arbitralny (kolejność enumeracji), mimo
że projekcja audytu niesie różne wartości (moc·2 + wytrzymałość). 190/190
remisów rozróżnialnych w audycie.
**Nie ruszamy** (poza zakresem, odnotowane): relacja „ocalały stwór 30 >
gracz 15" oraz wartości w gałęziach lethal/własny/gracz — to nie remisy,
tylko wybory modelu (anty-over-fix M429).

## Fala (jedna)

**R1 — wymiar zagrożenia w gałęzi ocalałego wroga**: `opponentTargetFoeBase`
(30 — kotwica, dawna wartość) + `min(opponentTargetThreatCap,
(2·moc + wytrzymałość) · opponentTargetThreatWeight)` (domyślnie cap 15,
waga 0,5). Bonus jest DOPŁATĄ, ograniczoną tak, by nie zbliżyć się do progu
dobicia (100 + 2·moc). Uzasadnienie: 1 obrażenie trwa do końca tury
(CR 514.2) — wśród ocalałych celów wartość rośnie z zagrożeniem (miękczenie
największego atakującego/blokera prowadzi do zabicia w tej samej turze).
Waga ×0 = powrót dawnego remisu (kotwica anty-over-fix).

## Kroki i kryteria ukończenia

- [ ] Krok 1: sonda PRZED (`tools/pmssb21-cuombajj-sonda.mjs`) — tabela wyżej.
- [ ] Krok 2: implementacja R1 + pokrętła w `heuristic-params.js` (klucze na
  liście + defaults z uzasadnieniem).
- [ ] Krok 3: `test/audyt-pmssb21-opponent-target.test.js` — piny: duże
  zagrożenie bije małe (A), lethal bez zmian (B), własny/gracz bez zmian
  (C/D), waga ×0 = remis (kotwica M429).
- [ ] Krok 4: mutacje (L13) + sonda PO + `bot-tie-audit` PO (cel: remisy
  rozróżnialne tej decyzji → 0; remisy równoważne (te same statystyki)
  zostają — to remisy uczciwe, L5).
- [ ] Krok 5: golden-master bez dryfu (pary golden nie zawierają Cuombajj —
  `decks/wiedzmin-bg.txt` tylko w tie-audicie; potwierdzić pomiarem).
- [ ] Krok 6: dokumentacja — sekcja w `docs/PMSSB.md` + wiersz rejestru
  (OUT → DONE (mikro)), `docs/PROJECT_HISTORY.md`, handoff, opis PR.
- [ ] Bramy: `npm test`, `npm run build`, `npm run test:all`.

## Ryzyka

- Zmiana wyceny w jednej decyzji jednej karty — dryf golden możliwy tylko,
  gdyby Cuombajj trafiła do par golden (nie trafia).
- Scope creep: sąsiednie remisy rodziny (`resolve_color_choice` 14/14,
  `resolve_discard_choice` 49) — świadomie POZA tą mikro-pętlą.
