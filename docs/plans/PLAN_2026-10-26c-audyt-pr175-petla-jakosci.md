# PLAN 2026-10-26c — kontynuacja: audyt PR #175 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt." Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021.

**Gałąź:** `arena/3e188a7c-mtg` (od `main` @ `d7150b1` = squash PR #175).
Jeden PR sesji, kumulatywny opis.

## Stan bazowy (zmierzony 2026-10-26, po scaleniu PR #175)

- lektura obowiązkowa w całości: `AGENTS.md`, rejestr ADR + ADR 0001–0030,
  `docs/LESSONS.md` (2268 linii, L1–L189), `docs/setup/ENVIRONMENT.md`,
  `docs/setup/HANDOFF_2026-10-26b.md`;
- `npm test` (cicho, `.arena/test-base.log`): **8856/8856 pass**, 0 fail,
  ~156 s. Handoff PR #175 podaje 8852 — różnica to 4 piny
  `test/uwaga-w-delve-wygnanie-w-logu.test.js` dopisane PO handoffie
  (commit `50c1243`), więc handoff/README mają liczby sprzed ostatniego
  commita sesji (L92 — sygnał do odświeżenia w domknięciu);
- `npm run build`: **76 modułów / 5443,3 kB** (handoff: 5442,8 kB — ta sama
  przyczyna: ostatni commit PR #175);
- brak otwartych PR-ów; najnowszy plan na `main`
  (`PLAN_2026-10-26b-audyt-pr174-petla-jakosci.md`) ma 0 nieodhaczonych
  kryteriów (grep `- [ ]`).

## Etapy i kryteria ukończenia

### Etap 0 — rozpoznanie i plan

- [x] Kryterium: powyższy stan bazowy (zmierzony, nie przepisany z handoffu)
      + ten plik. Brak zmian w `src/`.

### Etap 1 — PR na starcie (ADR 0020 A)

- [x] Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
      z szablonu opisu **przed** pierwszą zmianą kodu.

### Etap 2 — techniczny audyt scalonego PR #175 (ADR 0020 B / 0016 / 0030)

Zakres: 5 plików zmienionych w squash `d7150b1`
(`gh pr diff 175`, 624 linie):

| Plik | Rola |
|---|---|
| `src/table/session.js` | naprawa funkcjonalna: opis `object_moved` z `delve: true` |
| `test/uwaga-w-delve-wygnanie-w-logu.test.js` | 4 piny (W/1–W/4) |
| `docs/audits/AUDYT_PR174_2026-10-26.md` | raport audytu poprzedniej sesji |
| `docs/plans/PLAN_2026-10-26b-*.md` | roadmapa poprzedniej sesji |
| `docs/setup/HANDOFF_2026-10-26b.md` | handoff poprzedniej sesji |

Pytania audytowe (każde z odpowiedzią w raporcie):

1. **Kompletność ścieżek:** czy `delve: true` jest emitowane przez OBIE
   ścieżki rzutu (`castSpell` i `castPermanent`, CR 702.66a) — i czy opis
   dociera do logu stołu ORAZ modalu „Rozgrywka" (dwie warstwy, L99)?
2. **Kolejność gałęzi:** czy `e.delve` może współwystępować z `e.escape` /
   `e.additionalCost` (wtedy opis kłamie o koszcie)?
3. **FoW:** czy opis nie ujawnia niczego, co nie jest jawne (cmentarz, CR 400.2)?
4. **Jakość pinów (L29/L13):** czy piny czerwienieją po cofnięciu naprawy
   i czy nie przepuszczają surowego `cardId` (fallback `?? id` w `nameOf`)?
5. **Liczby dokumentacji (L92):** czy handoff/README niosą stan PO ostatnim
   commicie PR (#175 deklaruje 8852/5442,8 kB, a drzewo ma 8856/5443,3 kB)?

Kryterium: raport `docs/audits/AUDYT_PR175_2026-10-26.md` w repo + co najmniej
3 mutacje RED/GREEN + każdy zmieniony plik oceniony. Bramka: `npm test` +
`npm run build` zielone.

- [x] **WYKONANE** — `docs/audits/AUDYT_PR175_2026-10-26.md`: 5/5 plików
      ocenionych; mutacje M1 (gałąź `e.delve`) i M2 (flaga `delve: true` w
      emisji) — obie RED (W/1, W/2, W/4). Znaleziska: **F-1** (oś „modal"
      niedomknięta dla płatności człowieka — `isMainLogEvent` zna tylko
      `additionalCost`), **F-2** (piny przepuszczają surowy `cardId`, L29),
      **F-3** (liczby README/handoffu sprzed ostatniego commita PR, L92).
      Werdykt: APPROVE z zastrzeżeniem.

### Etap 3 — naprawy znalezisk audytu (osobne zielone commity)

- [ ] Każde znalezisko: test RED → naprawa u root cause → GREEN.
      Oczekiwane kandydaci (potwierdzić w audycie, nie zakładać):
      pin W/1–W/2 dopuszczający surowy `cardId`, liczby w README/handoffie
      po ostatnim commicie PR #175.

### Etap 4 — pętla domyślna (ADR 0021 pkt 4)

Bez nowego batcha kart (ADR 0029).

- [ ] **Żywy Tester:** 4 partie (`--steps 400 --quiet`), partie ukończone
      naturalnie; trzy osie audytu (`docs/setup/TESTER_STOLU.md`), ręczna
      lektura transkryptów.
- [ ] **Analizatory:** `event-contract-audit`, `family-audit`,
      `scoring-unvalued-audit`, `scoring-pay-census` (+ `bot-tie-audit`
      jeśli próbka da dane).
- [ ] **Polowanie CR (nowa ścieżka):** poprzednie sesje sprawdziły
      510/704/104 oraz 613/603/704. Ta sesja: **CR 614 (efekty zastępcze)
      + CR 616 (interakcja efektów zastępczych)** oraz CR 106/601.2
      (płatność many) — z dosłownym cytatem CR i pinem SHA-256 (ADR 0030).
- [ ] Każde znalezisko: repro headless → naprawa u root cause → pin
      z cytatem + mutacja RED (L11/L13/L44).

### Etap 5 — domknięcie sesji

- [ ] Bramy: `npm test`, `npm run build`, `node tools/benchmark.mjs`
      (quick; `--full` nieuruchamiany — ADR 0018).
- [ ] Odświeżone LICZBY w `README.md` (stan bieżący), `docs/ROADMAP.md`
      jeśli dotyczy, wpis w `docs/PROJECT_HISTORY.md`, handoff
      `docs/setup/HANDOFF_2026-10-26c.md`, plan odhaczony, opis PR
      zaktualizowany kumulatywnie.

## Planowana kolejność commitów

1. `docs(plan)` — ten plan + otwarcie PR.
2. `docs(audyt)` — raport audytu PR #175 (+ odhaczone Etapy 0–2).
3. `fix(...)` × N — po jednym na znalezisko audytu (test + kod + pin).
4. `fix(...)`/`docs(...)` × M — znaleziska pętli jakości.
5. `docs` — domknięcie: liczby, historia, handoff, opis PR.

## Ryzyka i pułapki (z rejestru lekcji)

| Ryzyko | Obrona |
|---|---|
| Reset sandboxa | commit + push po KAŻDYM zielonym kroku; ADR 0020 D |
| Mutacja „zielona" = martwy pin | mutuj DOKŁADNY blok (`sed -n` przed zmianą), przywracaj kopią z `.arena/` (L34/L136/L159) |
| Błędna interpretacja CR | dosłowny cytat z bieżącego wydania CR (ADR 0030, L164/L165) |
| Testy zalewające czat | zawsze `> .arena/*.log 2>&1` (ENVIRONMENT §5a) |
| Pełny benchmark | tylko `node tools/benchmark.mjs` (quick), nigdy `--full` (ADR 0018) |
| Nowe karty z inwencji | ADR 0029 — katalog rośnie wyłącznie z kolekcji właściciela |
| Pin przepuszczający fallback nazwy | asercja na nazwę z rejestru, zakaz `cardId` w opisie dla gracza (L29) |
| Budżet LESSONS | wpis Przypadek/Reguła/Strażnik, proza do LESSONS_PRZYPADKI.md |
