# PLAN — sesja 2026-09-27b: audyt PR #140 (113 commitów squash, 16 760 linii) + pętla domyślna

Prompt: „Kontynuujemy projekt.” + doprecyzowanie właściciela w czacie: **poprzedni
PR do audytu to #140** — różnica między bieżącym HEAD a zamknięciem #139.

- Gałąź: `arena/01a0e482-mtg` · Bazowy diff: `605a8dc` (squash #139) → `1194476`
  (= drzewo czoła `arena/01a0d980-mtg@34bc9a0`, zweryfikowane pustym diffem).
- Skala: **154 pliki, +16 760 / −391** (93 nowe, 61 zmodyfikowanych), 113 commitów.
- Stan wchodni: po lekturze obowiązkowej (AGENTS.md 373 + ADR 0001–0030 w całości
  + LESSONS.md L1–L171 + ENVIRONMENT.md + handoff 25g). Bez otwartych PR.

## Kontekst stalym (fakty, nie przypuszczenia)

- PR-y na GitHubie kończą się na #140; praca 2026-09-25h…27 (PMSSB-1..14,
  AI-OpenRouter E0–R7, manifest testów, **batch 60 — 10 kart**, Fix A/B)
  nie przeszła osobnym PR — weszła w squash #140 różnicą `605a8dc..HEAD`.
- `docs/audits/` ma audyty do PR #139 włącznie → **#140 nie zaudytowany**.
- Batch 60 w kodzie wygląda na kompletny (10 kart w `card-data.js`, koszty,
  `test/real-cards-batch60.test.js`, `test/batch60-bot-wycena.test.js`, talie),
  ale dziennik kończy się na „TESTY (2026-09-27, manifest)” — brak wpisów
  o batchu 60 / AI-R4b..R7 / Fix A/B i handoffu końcowego sesji poprzedniej.
- Baseline: `npm run build` 69 modułów / 4522,6 kB; `npm test` mierzony na starcie.

## Etapy (kolejność ADR 0020/0021)

- [ ] **A. PR na starcie** — ten plan, push, otwarty PR (ADR 0020 A).
- [ ] **B. Baseline** — `npm test` (spodziewane 6641 fast wg wpisu TESTY) +
      `npm run build` (jest: 69/4522,6 kB) + `node --test test/bot-benchmark.test.js`.
- [ ] **C. Audyt PR #140** → raport `docs/audits/AUDYT_PR140_2026-09-27.md`.
      Minimum z ADR 0016/0020 B: każdy zmieniony plik (154) wobec CR MtG,
      ADR 0002 (zero przypadków specjalnych po nazwie/ID w core), testów RED→GREEN,
      Oracle batcha 60 (pliki `docs/cards/scryfall-*.json`).
      Prowadzenie po obszarach (fale, po jednym+\commitcie na domknięcie fali):
      1. **C1 engine**: abilities/combat/effect-intent/effects/fingerprint/
         game-state/identity/objects/permanents/resources/spells/triggers —
         nowe mechaniki: `castDuringMainPhase` (Addendum), `blocks_if_able…`
         (Timely-zkickowany), `preventAllCombatDamage` (fog), prywatny „look”
         (Revealing Wind), strip zdolności + trwały subtyp (Xu-Ifit), imprint
         (Clone Shell), generyczny you-may decline (Fix A), chump-block (Fix B).
      2. **C2 bot**: heuristic-bot.js + heuristic-params.js + 12 sond PMSSB-3..14
         (raporty w `docs/PMSSB.md` jako wykładnia; pokrętła vs ADR 0018/0005).
      3. **C3 karty batcha 60**: każda z 10 wobec Oracle (tekst z snapshotów),
         pola, `limitations` (ma być puste, ADR 0022), rulingi z planu,
         talie (`repo-decks.test.js` spójność), artId (świadomy brak — plan).
      4. **C4 UI/stół**: ai-*.js (7 nowych: config/client/mock/modes/panel/
         queue/drive/chat), choice-request, mana-wizard, multi-target, render,
         session, topbar-toggles, index.html; FoW prywatnego looka (CR 406.3).
      5. **C5 narzędzia/dane**: test-manifest.json, tune-card.mjs,
         collection-art-ids.csv, README, decks.
- [ ] **D. Naprawy znalezisk** — od razu, osobne commity (AGENTS.md „Znalezione
      błędy naprawiasz od razu”), każdy z testem RED→GREEN i (tam, gdzie się da)
      weryfikacją mutacyjną (L13).
- [ ] **E. Domknięcie dokumentacji sesji batcha 60** — wpis w
      `docs/PROJECT_HISTORY.md` (batch 60, AI-R4b..R7, Fix A/B, PMSSB-13/14
      uzupełnić jeśli braki) + `docs/setup/HANDOFF_2026-09-27.md` — stan faktyczny
      po audycie (poprzednia sesja urwała się bez obu).
- [ ] **F. Pętla jakości** (ADR 0021.4, tylko gdy budżet pozwoli i C–E domknięte):
      kandydaci z handoffu 25g — explore-maszyna, gift/obietnice,
      delve+convoke+redukcje, regeneration; nowe seedy Żywego Testera
      (nie 203/77/91/15).
- [ ] **G. Zamknięcie**: bramy `npm test` + `npm run test:all` + build, opis PR
      kumulatywny, blok przekazania w czacie.

## Ryzyka i bramy

- ADR 0030: każdy claim regułowy znaleziska — z cytatem CR u źródła PRZED fixem;
  przy braku dostępu do źródła: „do weryfikacji u źródła”, bez zmiany.
- Nie wymyślam kart (ADR 0029); nie ruszam progu B0 (ADR 0018); bez pełnego B0.
- Anty-over-fix (ADR 0022/L57): znalezisko kontra Oracle → zgłaszam, nie wdrażam.
- Anty-over-fix PMSSB (M429): najsłabszy realny wariant = dawna wartość.
- L78: każdy artefakt raportu kończę kompletem (raport audytu nie jest „skrótem”).
- git: tylko przyrostowo (ADR 0020 D), commit per zielony krok, push po każdym.
