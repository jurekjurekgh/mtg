# PLAN M159 — audyt PR #66 + pętla jakości (sesja 2026-08-20, PR #67)

Prompt startowy bez tematu („Kontynuujemy projekt") → ADR 0021: pętla
domyślna. Sesja startuje z `main` = `238ff70` (squash PR #66: M156+M157+M158).

## Etapy

- [x] **0. Lektura obowiązkowa** (AGENTS.md §0, wszystkie ADR-y 0001–0022,
  LESSONS L1–L51, ENVIRONMENT, PROJECT_STATE, handoff M158) + baseline:
  `npm test` 2475/2475, build 51 modułów / 2122.2 kB.
- [x] **1. PR na starcie** (ADR 0020 A): commit planu → push → PR #67.
- [x] **2. Audyt PR #66** (ADR 0020 B / 0016): diff `1a5accc..238ff70`
  (M156 audyt+fixy F1–F3/Q1–Q2, M157 uwagi właściciela A–F + ADR 0022 +
  Weftblade wielocelowy + L28-inwentaryzacja, M158 Batch 39: Madness,
  Saga Invasion, apply_to_each_target, regenerate, Wishful, Lightblade,
  Ravager, morph-label). Kryteria: zgodność z CR i ADR 0002/0022,
  generyczność mechanik, testy RED→GREEN, wyceny botów (L50/L51),
  FoW/playerView (ADR 0003/0017). Raport `docs/audits/AUDYT_PR66_2026-08-20.md`,
  znaleziska naprawiane od razu (RED→GREEN, osobne zielone commity).
  Wynik: 4 znaleziska (F1 timing madness/CR 702.34e + crash bota, F2 oferta
  madness bez walidacji płatności, F3 obowiązkowy cel Revolutionista jako
  optional, F4 etykieta bez nazwy karty) + 2 obserwacje.
- [ ] **3. Pętla jakości (ADR 0021 §4):** audyt Żywym Testerem z perspektywy
  gracza na taliach z kartami Batch 39 (spellslinger: Invasion/Revolutionist;
  azorius; black: Ravager/Magmarch; red: Wrap in Flames) — kolejka handoffu
  M158 wskazuje ten krok jawnie. Trzy osie (TESTER_STOLU): bezsens bota,
  kompletność logu/modali, ptaszki auto-pass. Naprawy u root cause +
  detektory na znalezione klasy.
- [ ] **4. Zamknięcie:** PROJECT_STATE, handoff, opis PR kumulacyjnie,
  blok przekazania w czacie.

## Ryzyka / pułapki

- Madness i pendingi (pendingMadnessCast, pendingRevealChoice) — checklista
  6 bramek nowego pendingu (handoff M158); audyt sprawdza każdą bramkę.
- Testy scenariuszowe z zamrożonymi seedami (L25) — zmiany w taliach
  wykluczone poza naprawami.
- Żywy Tester: `npm run build` + `npm i` w `tools/table-tester` (świeży
  sandbox); braki testera naprawiać w testerze (L12).
- GH_TOKEN potrafi wygasnąć (ENVIRONMENT §3) — push po każdym commicie.
- B0 pełny ZAKAZANY bez komendy właściciela (ADR 0018).

## Podsumowanie wykonania

(uzupełniane na końcu sesji)
