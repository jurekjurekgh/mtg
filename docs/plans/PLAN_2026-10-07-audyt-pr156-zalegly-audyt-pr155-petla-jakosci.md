# PLAN 2026-10-07 — Audyt PR #156 + zaległy audyt PR #155 + pętla jakości

> Sesja: gałąź `arena/7c7286d7-mtg`, tryb ADR 0020 (PR → audyt → inkrementalne
> commity), pętla domyślna ADR 0021 (prompt „Kontynuujemy projekt", bez tematu).

## Rozpoznanie (wykonane)

- Lektura obowiązkowa kompletna: AGENTS.md (381/381), wszystkie ADR-y
  (README + 0001–0030), LESSONS.md (L1–L180, 2436/2436 linii),
  ENVIRONMENT.md (§1–§7).
- Bazowy stan `main` = `d7fd1a9` (squash PR #156). Zmierzone na starcie:
  `npm test` **7750/7750** exit 0 (122 s), `npm run build` **72 moduły /
  4896,6 kB** exit 0.
- Poprzedni scalony PR: **#156** (13 plików, +577/−136).

### Kluczowe znalezisko wstępne (rozjazd dokumentacji PR #156)

Ciało PR #156 i wpis `PROJECT_HISTORY.md` „2026-10-05c" opisują commity
`562b806` (plan), `001ef66` (audyt PR #155 → `docs/audits/AUDYT_PR155_2026-10-05.md`),
`c72b26d` (plan + Żywy Tester) i `291eabe` (handoff + historia).
**Żaden z tych commitów nie jest w PR #156** (API: 4 commity — wyłącznie
kod Halo Forager / Waveskimmer Aven / Grazing Gladehart), a pliki
`docs/audits/AUDYT_PR155_2026-10-05.md`, `docs/plans/PLAN_2026-10-05c*`
i `docs/setup/HANDOFF_2026-10-05c*` **nie istnieją w `main`**. Wniosek:
audyt PR #155 nigdy nie wylądował w repozytorium — łańcuch audytów
(ADR 0020 B) ma dziurę, a historia projektu cytuje nieistniejące artefakty
(klasa L56/L142: twierdzenie o stanie danych bez pokrycia).

Konsekwencja dla tej sesji: audytujemy PR #156 (obowiązek) ORAZ odrabiamy
zaległy audyt PR #155 (124 pliki, +4689/−631), zamiast ufać opisowi, który
okazał się nierzetelny.

## Etapy i kryteria ukończenia

- [x] E0. Lektura obowiązkowa + baseline (`npm test` 7750/7750, build 72/4896,6 kB).
- [x] E1. Ten plan wypchnięty jako osobny commit + otwarty PR (ADR 0020 A).
- [x] E2. **Audyt PR #156** (13 plików) — przegląd każdego zmienionego pliku:
  - `src/engine/game-state.js` (+241/−81): sekwencyjne modale Halo Forager
    (`pendingGfc`), Treasure-mana Waveskimmer Aven (offer=payment, L48);
  - `src/engine/resources.js` (+91/−1), `effects.js`, `fingerprint.js`,
    `src/table/render.js`;
  - `src/controllers/heuristic-bot.js` (+141/−13):
    `landDropWastesLandfallPenalty` (kolejność stwór→ląd przy landfall);
  - `tools/event-contract-audit.mjs` (+8);
  - 5 zmienionych plików testowych — co faktycznie testują;
  - zgodność z CR (ADR 0030: cytaty dosłowne ze źródeł przez `fetch_page`;
    gdy źródło niedostępne — adnotacja „do weryfikacji u źródła", bez zmian
    regułowych), generyczność (ADR 0002), kompletność widoku (ADR 0017).
  - Kryterium: `docs/audits/AUDYT_PR156_2026-10-07.md` z werdyktem i listą
    znalezisk (każde z dowodem).
- [ ] E3. **Zaległy audyt PR #155** (a362efa → 70fed53, 124 pliki) — obszary:
  - engine: `battles.js`, `effect-values.js`, `damage_divided` (CR 601.2d/
    603.3d/608.2b), kolejka modalnych ETB, re-walidacja celów triggerów
    (CR 608.2b), ward batch (CR 603.3), SBA bitew (CR 310.7/704.5v-w);
  - Batch 63: karty 212/254/259/260 + tokeny Blood/Spawn — zgodność
    z Oracle (snapshoty `docs/cards/scryfall-*.json`), proweniencja CSV
    (ADR 0029);
  - bot (+649 linii), podział talii Dominaria (ADR 0024), fix CI;
  - testy PMSSB-58 (98 pinów) — wyrywkowa weryfikacja mutacyjna (L13).
  - Kryterium: `docs/audits/AUDYT_PR155_2026-10-07.md` z werdyktem.
- [ ] E4. Naprawa znalezisk z E2/E3 u root cause (jeśli będą) — każdy fix
  osobnym commitem z testem RED→GREEN; korekta rozjazdu dokumentacji
  (wpis-sprostowanie w `PROJECT_HISTORY.md`, bez przepisywania historii).
- [ ] E5. **Pętla jakości** (ADR 0021 pkt 4): partie Żywym Testerem
  (naturalne końce, detektory, oś „bezsensowne działania bota / kompletność
  logu / ptaszki auto-pass") + polowanie na niezgodności z CR ścieżką inną
  niż poprzednie sesje. Bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018).
- [ ] E6. Domknięcie: handoff `docs/setup/HANDOFF_2026-10-07.md`, opis PR
  kumulacyjnie, brama końcowa (`npm test` + `npm run build`, a przed końcem
  `npm run test:all` na zamrożonym drzewie — L174, wyciszone do logu).

## Kolejność commitów (planowana)

1. Plan (ten plik) → push → PR.
2. Audyt PR #156 (dokument) + ew. drobne korekty dokumentacyjne.
3. Audyt zaległy PR #155 (dokument) + wpis-sprostowanie w historii.
4. Fix(y) znalezisk — każdy osobno, z testem.
5. Pętla jakości — commit(y) napraw/detektorów.
6. Handoff + aktualizacja planu (podsumowanie).

## Ryzyka i pułapki

- **Budżet sesji:** dwa audyty to dużo; nie skracać przez pobieżność —
  raczej zawęzić pętlę jakości (E5) niż audyty.
- **ADR 0030:** w sandboxie egress ograniczony (github/npm/pypi); źródła CR
  osiągane wyłącznie przez `fetch_page`. Gdy się nie uda — NIE zgłaszać
  znalezisk regułowych z pamięci (F3/B4), tylko adnotacja.
- **L174/E2E:** bramki na zamrożonym drzewie; logi do `.arena/`, bez pełnego
  wyjścia testów (ENVIRONMENT §5a).
- **Żywy Tester:** wymaga `npm run build` (jest) i `npm i` w
  `tools/table-tester` przy pierwszym użyciu; mierzy `dist/`, nie `src/` (L76).
- Nie merge'ujemy; PR scala wyłącznie właściciel (ADR 0007/0013).

## Podsumowanie wykonania

_(uzupełniane wraz z postępem; na końcu sesji)_
