# Plan sesji 2026-09-05 (arena/01a071d1) — audyt PR #98 + pętla jakości

> Sesja agentska 1 = 1 gałąź = 1 PR (ADR 0013/0020). Kontynuacja po PR #98.
> Prompt właściciela: „kontynuujemy projekt" (brak nazwanego tematu → ADR 0021,
> pętla domyślna, bez pytania o kolejkę).

## Etap 0 — start sesji (ADR 0020 A) — WYKONANE w ramach tego commitu
- [x] Lektura obowiązkowa: AGENTS.md, wszystkie ADR (0001–0028), LESSONS.md,
      ENVIRONMENT.md, PR #98, najnowszy HANDOFF.
- [x] `npm test` zielone (4482/4482) na `main` po scaleniu PR #98.
- [x] Otwarcie PR sesji (gałąź `arena/01a071d1-mtg`).

## Etap 1 — audyt poprzedniego PR (ADR 0020 B / 0016) — WYKONANE
- [x] Przegląd każdego zmienionego pliku PR #98 (engine + render + bot).
- [x] Weryfikacja ADR 0002 (brak hardkodów nazw kart — grep potwierdza).
- [x] Wpis `docs/audits/AUDYT_PR98_2026-09-05.md`. Werdykt: PR dobry, 0 F,
      obserwacje O1–O4 (bez akcji).

## Etap 2 — pętla jakości (ADR 0021 4a/4b), dopóki właściciel nie wskaże inaczej
Kryteria ukończenia per krok: RED→GREEN + `npm test` + `npm run build`.

- [ ] **Krok A — Żywy Tester z perspektywy gracza.** `npm run build` +
      `npm i` w `tools/table-tester`, przebieg 2–3 matchupów (w tym nowy
      z PR #98: innistrad-brg×worek-dziki — storm/ward; zendikar×srodziemie —
      warunki triggerów). Nowe detektory + naprawy u root cause (nie maskowanie).
- [ ] **Krok B — statyczna pętla CR (ADR 0027).** `npm test` wpięty
      `tools/event-contract-audit.mjs` (klasa L107): przejrzeć ewentualne
      nowe trafienia / wyjątki; polować na kolejną klasę błędów inną ścieżką
      niż poprzednia sesja.
- [ ] **Krok C — dokumentacja i handoff.** `docs/PROJECT_HISTORY.md`,
      `docs/setup/HANDOFF_2026-09-05d.md`, odświeżenie liczb stanu (L92) na
      zakończenie.

## Zasady nienegocjowalne
- Tylko PRZEKRÓJ przyrostowy (ADR 0020 C): każdy zielony krok = osobny commit
  + push. Nigdy force push (ADR 0020 D).
- Brak nowych batchy kart (karty tylko z listy właściciela w czacie — ADR 0021).
- Pełny B0 tylko na wyraźną komendę właściciela (ADR 0018/0025).
- Naprawy u root cause (AGENTS: „Znalezione błędy naprawiaj u root cause").
- Komunikaty commitów przez plik (ENVIRONMENT §3: polskie znaki w edit_file
  potrafią się zgubić — używać python3/pathlib).

## Ryzyka / pułapki
- Sandbox może zresetować workspace (ENVIRONMENT §2) — commit + push po
  każdym kroku; po resecie `git reset --hard FETCH_HEAD`.
- Żywy Tester ładuje `dist/`, nie `src/` (L76) — `npm run build` przed każdym
  pomiarem.
- GH_TOKEN może wygasnąć (ENVIRONMENT §3) — push przez `gh`/`git` może
  poprosić o reconnect; nie prosić o token.
