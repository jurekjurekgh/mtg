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

- [ ] Kryterium: powyższy stan bazowy + ten plik. Brak zmian w `src/`.

### Etap 1 — PR na starcie (ADR 0020 A)

- [ ] Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
      z szablonu opisu **przed** pierwszą zmianą kodu.

### Etap 2 — techniczny audyt scalonego PR #174 (ADR 0020 B / 0016 / 0030)

- [ ] Zakres audytu: **wszystkie pliki** zmienione w PR #174 (squash `697d49b`,
      poprzedni commit na `main` to `60a516c` = squash PR #173).
- [ ] CR u źródła (ADR 0030): dosłowne cytaty z `cr-raw.txt` (wydanie
      2026-09-25, SHA-256 zgodny z pinem).
- [ ] Przegląd każdego zmienionego pliku produkcyjnego (`src/engine/*`,
      `src/controllers/*`, `src/table/*`, `tools/*`) pod kątem: logiki i
      maskowania objawu (root cause), ADR 0002 (zero rozgałęzień po nazwie/ID
      karty), ADR 0003/0017 (FoW i kompletność `PlayerView`), ADR 0005
      (determinizm), kontraktu zdarzeń (L107/L112/L130/L187).
- [ ] Przegląd testów: czy pin mierzy REGUŁĘ, nie implementację (L5/L160),
      czy okaz ma kształt kontraktu (L65). Co najmniej 4 piny do weryfikacji
      mutacyjnej.
- [ ] Wynik: `docs/audits/AUDYT_PR174_2026-10-26.md`, odhaczenie w tym
      planie, wpis w `docs/PROJECT_HISTORY.md`.

Kryterium: raport audytu w repo + co najmniej 4 mutacje RED/GREEN + każdy
zmieniony plik wymieniony w raporcie jako sprawdzony. Bramka: `npm test` +
`npm run build` nadal zielone (audyt nie zmienia kodu).

### Etap 3 — naprawy znalezisk audytu (osobne zielone commity)

- [ ] Każde znalezisko: test odtwarzający → naprawa u root cause →
      `npm test` + `npm run build` (cicho) → commit → push → odhaczenie.
- [ ] Kolejność: waga błędu (reguły/legalność → wycena bota → UI/log →
      dokumentacja). Zakaz maskowania.

### Etap 4 — pętla domyślna (ADR 0021 pkt 4)

Bez nowego batcha kart (ADR 0029).

1. **Żywy Tester stołu** na zbudowanym artefakcie: 4 partie taliami spoza
   próbki benchmarku, różne profile bota, transkrypty do `.arena/`. Trzy osie
   z `TESTER_STOLU.md`; ręczna lektura transkryptów.
2. **Analizatory statyczne:** `tools/event-contract-audit.mjs`,
   `tools/family-audit.mjs`, `tools/scoring-{unvalued,choice-space,pay-census}-audit.mjs`.
3. **Polowanie CR inną ścieżką niż poprzednia sesja** (poprzednia:
   510/704/104 — koniec gry bez triggera na stosie). Kandydaci na tę sesję:
   warstwy i znaczniki czasu (CR 613/611), efekty zastępcze (CR 614),
   state-based actions (CR 704 poza 704.5a), kolejność triggerów/priorytet
   (CR 603/117), płatność i pula many (CR 106/601.2).
4. **Anty-over-fix:** przy każdej zmianie wyceny bota — pin przeciwny,
   golden-master (`test:slow`) i próbka benchmarku.

### Etap 5 — domknięcie sesji

- [ ] Pełna brama: `npm test`, `npm run test:slow`, `npm run build`,
      benchmark quick (bez `--full` — ADR 0018).
- [ ] README, PROJECT_HISTORY, handoff, plan, opis PR.
- [ ] `git status` czysty, `git log origin/<gałąź>..HEAD` pusty.
- [ ] Bez merge — decyzja właściciela (ADR 0007/0020).

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
