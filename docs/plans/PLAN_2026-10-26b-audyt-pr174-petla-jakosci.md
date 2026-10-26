# PLAN 2026-10-26b — kontynuacja: audyt PR #174 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt." Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021.

**Gałąź:** `arena/30278238-mtg` (od `main` @ `697d49b` = squash PR #174).
Jeden PR sesji, kumulatywny opis.

## Stan bazowy (zmierzony 2026-10-26)

- lektura obowiązkowa w całości: `AGENTS.md`, rejestr ADR + ADR 0001–0030,
  `docs/LESSONS.md` (2267 linii, L1–L189), `docs/setup/ENVIRONMENT.md`,
  `docs/setup/HANDOFF_2026-10-26.md`;
- `npm test` (cicho): **8852/8852 pass**, ~158 s;
- `npm run build`: **76 modułów / 5442,8 kB** — zgodnie z handoffem PR #174;
- brak otwartych PR-ów; najnowszy plan na `main`
  (`PLAN_2026-10-26-audyt-pr173-petla-jakosci.md`) ma 0 nieodhaczonych
  kryteriów (sprawdzone grepem `- [ ]`).

## Etapy i kryteria ukończenia

### Etap 0 — rozpoznanie i plan

- [x] Kryterium: powyższy stan bazowy + ten plik. Brak zmian w `src/`.
      (commit `bae1788`)

### Etap 1 — PR na starcie (ADR 0020 A)

- [x] Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
      z szablonu opisu **przed** pierwszą zmianą kodu — PR
      [#175](https://github.com/jurekjurekgh/mtg/pull/175) (commit `bae1788`).

### Etap 2 — techniczny audyt scalonego PR #174 (ADR 0020 B / 0016 / 0030)

- [x] **WYKONANE** — raport `docs/audits/AUDYT_PR174_2026-10-26.md`
      (16/16 plików, cytaty CR zweryfikowane w tabeli z pinem SHA-256,
      mutacje M1–M4 wszystkie RED).
      Znaleziska z poprzedniego audytu (PR #173): **F-1** podwójne liczenie
      Skarbu, **F-2** mana ograniczona w automacie, **F-3** brak pinu
      ścieżki M2, **F-4** aliasy importu w artefakcie, **CR 104.1** trigger
      po końcu gry — wszystkie 5 napraw APPROVE (root cause, zero maskowania).

Kryterium: raport audytu w repo + co najmniej 4 mutacje RED/GREEN + każdy
zmieniony plik wymieniony w raporcie jako sprawdzony. Bramka: `npm test` +
`npm run build` nadal zielone (audyt nie zmienia kodu).

### Etap 3 — naprawy znalezisk audytu (osobne zielone commity)

- [x] **PUSTY** — audyt PR #174 nie znalazł usterek do naprawy. Wszystkie
      5 zmian produkcyjnych (F-1, F-2, F-3, F-4, CR 104.1) APPROVE: root
      cause, zero maskowania, cytaty CR dosłowne, FoW/determinizm nienaruszone.

### Etap 4 — pętla domyślna (ADR 0021 pkt 4)

Bez nowego batcha kart (ADR 0029).

- [x] **Żywy Tester (4/4 partie, wszystkie ukończone naturalnie):**
      theros↔ravnica-rg (explorer, tick 0,2, seed 8001), mirrodin-brg↔wiedzmin-bg
      (defensive, 8002), innistrad-brg↔tarkir-wur (random, 8003), wiedzmin-wur↔zendikar-rg
      (impatient, 8004); `--steps 400 --quiet`, transkrypty `tools/table-tester/.arena/tt-{1..4}.txt`.
      **Oś 1 (detektory):** 0 zgłoszeń we wszystkich 4. **Oś 2 (niewycenione):**
      0 — każdy wybrany ruch bota miał dedykowaną wycenę. **Oś 3 (pokrycie UI):**
      7–20 akcji widzianych partię, kliknięte 6–17, modale 0–3, sondy noop 27–54.
      Ręczna lektura: brak błędów, brak nielegalnych ruchów, brak `[STOP]`.
- [x] **Analizatory** (wszystkie zielone): `event-contract-audit` — brak naruszeń;
      `family-audit` — brak naruszeń; `scoring-unvalued-audit` 12 partii / 5615 komend —
      BRAK decyzji bez wyceny; `scoring-pay-census` 12 partii — BRAK zapłat w próbce
      talii (zapisane jako brak danych, nie wynik).
- [x] **Polowanie CR (ścieżka 613/603/704 — inna niż 510/704/104):** przegląd
      `timestamps.js` (CR 613.7 — znaczniki czasu efektów ciągłych), `triggers.js`
      (CR 603.4 intervening-if, CR 603.10 LKI, CR 603.7 delayed triggers),
      `state-based.js` (CR 704.5f toughness <= 0, CR 702.2b deathtouch),
      `game-state.js` (CR 601.2h koszty dodatkowe, CR 608.2g płatność many przed
      rzutem, CR 608.2b fizzle). Wszystkie ścieżki obsługiwane poprawnie — brak
      znalezisk. Cytaty CR dosłowne z pinem SHA-256 (wyd. 2026-09-25).

### Etap 5 — domknięcie sesji

- [x] **WYKONANE** — bramy: `npm test` **8852/8852**, `npm run build` **76 modułów
      / 5442,8 kB**, benchmark quick **672 mecze — heuristic 87,8% (590/672)**
      (bez regresji; `--full` nie uruchamiano, ADR 0018). Dokumentacja: README
      (bez zmian — liczby z poprzedniej sesji nadal aktualne), plan (odhaczone
      Etapy 3–5), ten plik; stan czysty; merge niewykonywany.

## Planowana kolejność commitów

1. `docs(plan)` — ten plan + otwarcie PR.
2. `docs(audyt)` — raport audytu PR #174 + odhaczone Etapy 0–2.
3. `fix(...)` × N — po jednym na znalezisko audytu (test + kod + pin).
4. `fix(...)/docs(...)` × M — znaleziska pętli jakości.
5. `docs` — domknięcie: liczby, historia, handoff, opis PR.

## Ryzyka i pułapki (z rejestru lekcji)

| Ryzyko | Obrona |
|---|---|
| Reset sandboxa | commit + push po KAŻDYM zielonym kroku; ADR 0020 D |
| Mutacja „zielona" = martwy pin | mutuj DOKŁADNY blok, weryfikuj wykonanie, przywracaj kopią z `.arena/` (L34/L136/L159) |
| Błędna interpretacja CR | dosłowny cytat z `cr-raw.txt` (ADR 0030, L164/L165) |
| Testy zalewające czat | zawsze `> .arena/*.log 2>&1` (ENVIRONMENT §5a) |
| Pełny benchmark | tylko `node tools/benchmark.mjs` (quick), nigdy `--full` (ADR 0018) |
| Nowe karty z inwencji | ADR 0029 — katalog rośnie wyłącznie z kolekcji właściciela |
| Budżet LESSONS | wpis Przypadek/Reguła/Strażnik, proza do LESSONS_PRZYPADKI.md |

## Podsumowanie wykonania

**Sesja 2026-10-26b (PR #175, gałąź `arena/30278238-mtg` od `697d49b` = squash
PR #174).** Kolejność commitów: `bae1788` plan → `0cf7b1b` raport audytu
(16/16 plików, mutacje M1–M4 RED).

Audyt PR #174: 5 napraw produkcyjnych (F-1 podwójne liczenie Skarbu, F-2 mana
ograniczona w automacie, F-3 pin ścieżki M2, F-4 aliasy importu w artefakcie,
CR 104.1 trigger po końcu gry) — wszystkie APPROVE (root cause, zero maskowania,
c cytaty CR dosłowne z pinem SHA-256, FoW/determinizm nienaruszone). Mutacje
RED: M1 (paymentReachableMana) 2 fail, M2 (autoManaUnits) 1 fail, M3 (gate
triggerów) 1 fail, M4 (gate kroku) 1 fail — wszystkie piny mierzą reguły,
nie implementacje (L5/L160).

Pętla jakości (Etap 4): 4 partie testera 0 zgłoszeń na trzech osiach; 4
analizatory zielone; polowanie CR na ścieżce 613/603/704 (znaczniki czasu,
intervening-if, LKI, SBA, deathtouch, koszty, fizzle) — wszystkie ścieżki
obsługiwane poprawnie, brak znalezisk.

Bramki KOŃCOWE (zmierzone): `npm test` **8852/8852** (bez zmian), `npm run
build` **76 modułów / 5442,8 kB** (bez zmian), benchmark quick **heuristic
87,8%** (590/672, bez regresji; `--full` nieuruchamiany zgodnie z ADR 0018).

**Brak commitów funkcjonalnych** — sesja audytowa bez napraw (wszystkie zmiany
z poprzedniego PR poprawne). Dokumentacja: raport audytu, plan, handoff.
