# Plan 2026-09-15c — audyt PR #120 (ADR 0020 A/B)

**Prompt:** „Kontynuujemy projekt." — bez nazwanego tematu → pętla domyślna
ADR 0020/0021: PR na starcie → audyt ostatniego scalonego PR (#120) →
naprawa znalezisk → domknięcie (dokumentacja, handoff, opis PR).

**Stan wejściowy (zmierzony 2026-09-15):**
- `main` = `01c22a9` (squash PR #120); `origin/main` ten sam.
- Gałąź sesji `arena/01a0a506-mtg` nowa, czysta od main.
- `npm test` **5496/5496** (0 fail, ~191 s), `npm run build` **61 modułów / 3681,5 kB**.
- Najnowszy handoff w repo: `HANDOFF_2026-09-15.md` (sesja PR #119) — PR #120
  handoffu NIE zostawił (znalezisko P2).

## 0. Rozpoznanie PR #120 (punkt zaczepienia)

PR #120 „Znaleziska A–G" (6 commitów, 8 plików, +445/−18): bot (Savage Surge
okna, Spare lethal-protection, drenaż biblioteki draw/mill), kreator many
(Powerstone `spendOnly`), log odrzuceń (Civilized Scholar), badge X Altaru.
**Zero plików testowych, zero handoffu, plan sesji nieodhaczony, README nieświeże.**

### Znaleziska audytu (szczegóły i repro: `docs/audits/AUDYT_PR120_2026-09-15.md`)

| ID | Klasa | Stan | Działanie |
|---|---|---|---|
| A1 | **błąd blokujący** — gałąź `resolve_optional_trigger_choice` w `libraryDrainTax` czyta `view.pendingOptionalTrigger.ability`, a widok (playerView) wystawia tylko `{sourceCardId, effect}` (klasa L1/ADR 0017 — kontroler ślepy) → kara za may-fire Murder of Crows nigdy nie działa, zgłoszenie E pozostaje otwarte | niepoprawnie | naprawa na `pending.effect` + test RED→GREEN |
| A2 | **brak testów** na nową funkcjonalność A/B/C/D/E/F/G (ADR 0020 B: RED→GREEN) | brak | testy regresyjne dla znalezisk |
| A3 | martwy kod: `artifactPurposeFor` (main.js) zdefiniowany, niezwołany; logika inline ×2 (L41/L5) | jakość | unifikacja: realny przepływ przez funkcję, kopia vm z uzasadnieniem |
| A4 | `end_of_combat` w oknie Spare: obrażenia w tym kroku już zadane (engine: `resolve_combat` w `combat_damage` → skok na `end_of_combat`) → +35 za kartę, której ochrona niczego nie zapobiegnie | błąd wyceny | usunięcie kroku z okna |
| A5 | `// DEBUG` + skomentowany `console.log` w `protectionPreventsAnyLethal` (L58) | higiena | usunięcie |
| A6 | gałąź `else if (upkeep/draw/end/cleanup/untap) trick = -75; else trick = -75;` — obie gałęzie identyczne (L5) | higiena | uproszczenie |
| O1 | gałąź `resolve_optional_draw` w `libraryDrainTax`: `oneShotDeckOutPenalty(view, 1)` to 0 matematycznie zawsze (lib 0 → zwolnienie; lib ≥ 1 → zapas ≥ 0) — martwa gałąź; prawdziwa blokada deck-outu siedzi w `scoreCommand` (−100 przy pustej) | jakość | usunięcie martwej gałęzi |
| P1 | plan PR #120 nieodhaczony (E1–E7) mimo zakończenia pracy | proces | odhaczenie + korekta (L142: sprostowanie jawne) |
| P2 | brak handoffu sesji PR #120 | proces | handoff sesji na końcu |
| P3 | README „Bieżący stan" sprzed PR (5496/5496, 3660,4 kB) | proces | odświeżenie |

Obserwacje (bez zmian, dokumentowane w raporcie): O2 (zwolnienie `lib===0` w
`libraryLossPenalty` uzasadnione komentarzami testami — w realnej grze
obronne, ale zapach), O3 (druga pętla `protectionPreventsAnyLethal` zakłada
ochronę WSZYSTKICH blokerów — poprawna dla Spare „creatures you control"),
O4 (Savage: `trick + target.power` — arbitralna premia; ofensywa
`inCombat && !pumpChangesOutcome` w `beginning_of_combat` to gałąź niemal
martwa).

## 1. Etapy (inkrementalnie, każdy commit zielony: `npm test` + `npm run build`)

- [ ] **E0** — ten plan (commit + push + otwarcie PR sesji) — ADR 0020 A
- [ ] **E1** — raport audytu `docs/audits/AUDYT_PR120_2026-09-15.md`
      (komplet: A1–A6, O1–O4, P1–P3 + bramki + dodatek CR)
- [ ] **E2** — **A1 fix**: `heuristic-bot.js` — gałąź `resolve_optional_trigger_choice`
      czyta `view.pendingOptionalTrigger.effect` (kontrakt widoku M221/B) +
      test regresyjny (Murder may-fire przy 4 kartach: odmowa wygrywa; mutacja
      pola widoku → RED)
- [ ] **E3** — **A3+A4+A5+A6+O1**: `main.js` (unifikacja `artifactPurposeFor`) +
      `heuristic-bot.js` (okno Spare bez `end_of_combat`, usunięcie DEBUG,
      gałąź `-75/-75`, martwa gałąź `resolve_optional_draw`) — pin testem
      (okno: end_of_combat bez walki → kara; DEBUG/gałęzie: strażnik źródła)
- [ ] **E4** — **A2 testy regresyjne** reszty znalezisk PR #120:
      F (rzut Skaab mill-4 przy cienkiej bibliotece), G (badge X Altara —
      `cardInfo.altarX` na realnej sesji), D (kreator: źródła `spendOnly`
      przez `manaSourcesOf`), C (log odrzucenia z źródłem — `describeGameEvent`
      + `card_discarded` w `BOT_MOVE_CARD_EVENTS`)
- [ ] **E5** — **P1+P3**: plan PR #120 odhaczony + sprostowanie (L142),
      README „Bieżący stan" na finalnym headzie
- [ ] **E6** — domknięcie: handoff sesji, `PROJECT_HISTORY`, opis PR
      kumulatywny, bramki finalne (`npm test` / `build` / quick benchmark)

## 2. Weryfikacja (ADR 0030)

Zmiany regułowe w tym PR to wyłącznie WYCENY BOTA i warstwy prezentacji —
zero zmian semantyki silnika. Cytaty CR w raporcie: 508.1/508.2 (krok
końcowy walki — po zadaniu obrażeń), 702.16 (protection), 121.4 (deck-out),
400.2 (jawność grobu), 205.2a (typy kart), 106.3 (restricted mana). Źródła:
yawgatog/mtg.wiki (pobrane w E1/E3, data dostępu w raporcie).

## 3. Granice

- Bez nowych kart, bez zmian Oracle, bez pełnego B0 (ADR 0018).
- Zero wyjątków po nazwie karty (ADR 0002); bot czyta PlayerView (ADR 0017)
  — naprawa A1 IDZIE W KIERUNKU kontraktu widoku (`effect`), nie rozszerza widoku.
- Chirurgiczne patchowanie (ADR 0016) + L13 (mutacyjność każdego testu).
- Tylko przyrostowo, zero force push (ADR 0020 D).
