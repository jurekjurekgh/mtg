# PLAN 2026-09-20e — audyt PR #131 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „Kontynuujemy projekt." → ADR 0021: bez pytania
o kolejkę, pętla domyślna (PR → audyt poprzedniego scalonego PR → naprawy
u root cause → pętla jakości). Gałąź `arena/01a0c0af-mtg`, baza `614613e`
(squash PR #131).

## Rozpoznanie (zmierzone w tej sesji, nie przepisane — L7/L92)

- `git log --oneline -1` → `614613e Sesja 2026-09-20b/c/d: audyt PR #130 +
  pętla jakości + pomiar pozycji otwartych (ADR 0020/0021) (#131)`;
  drzewo czyste; klon płytki (`git fetch --deepen=20 origin main` przed
  policzeniem diffu).
- `npm test` (szybki rdzeń) → **6048/6048, 0 fail** (~216 s) — zgodne
  z `docs/setup/HANDOFF_2026-09-20c.md` (aktualizacja 2026-09-20d).
- `npm run build` → **59 modułów / 3970,7 kB** — zgodne z handoffem.
- `gh pr list` → ostatni scalony PR to **#131** (MERGED 2026-09-20 20:51 UTC,
  squash `614613e`), **45 plików, +3196 / −212**, 15 commitów sesyjnych.
- `node --test test/dokumentacja-budzet-lektury.test.js` → 2/2 (budżet
  lektury startowej pod progiem 100k).
- Lektura obowiązkowa (AGENTS.md §0) wykonana PRZED tym commitem:
  `AGENTS.md` (367 linii), rejestr ADR + **wszystkie ADR-y 0001–0030**
  (2214 linii), `docs/LESSONS.md` (2354 linie, L1–L158 w całości, czytane
  zakresami `sed -n` po `stdout_truncated` — L78), `docs/setup/ENVIRONMENT.md`
  (190 linii), opis i diff PR #131, `docs/setup/HANDOFF_2026-09-20c.md`.

## Zakres audytu (45 plików PR #131)

Diff `0b49b12…614613e` zawiera PIĘĆ niezależnych tematów; każdy audytuję
osobno, bo ma inne ryzyko regułowe (ADR 0030 — twierdzenia regułowe
weryfikuję u źródła, nie z pamięci):

| Temat | Pliki | Ryzyko |
|---|---|---|
| T1. Znaleziska A/B/C audytu PR #130 — Delve (CR 702.66) i licznik tury (Baral) | `spells.js`, `resources.js`, `mana-cost.js`, `game-state.js`, `heuristic-bot.js` | oferta = walidacja (L48), atomowość kosztu (CR 601.2h), limit z kosztu CAŁKOWITEGO vs wydruku |
| T2. Znalezisko D — gospodarz aury wracającej z grobu wybierany przez gracza (CR 303.4f) | `effects.js`, `game-state.js`, `fingerprint.js`, `protocol/types.js`, `session.js`, `render.js`, `choice-request.js`, oba boty | nowa decyzja blokująca = SIEDEM bramek (L48 pkt 8), odcisk stanu (L16), FoW, ponowna walidacja przy wykonaniu (CR 608.2b) |
| T3. E4/E5 pętla jakości — Delve na kaflu i w podglądzie, intro modalu w testerze, skan pism niełacińskich | `render.js`, `tools/table-tester/{extract,run-game}.mjs` | warstwa prezentacji kłamie przy poprawnym silniku (L97), jedno źródło brzmienia (L137), narzędzie audytu jako produkt (L12) |
| T4. E6 — pełna pula blokerów ponad capem menu (CR 509.1b) + E7 — usunięcie lustra kaskady | `combat.js`, `multi-target.js`, `main.js`, `render.js`, `choice-request.js`, `heuristic-bot.js` | cap tnie MENU, nie legalność (L151/L158), pin na funkcjach produkcji (L5) |
| T5. D/5 — niezmiennik pipów zdolności dla kart KOLOROWYCH | `test/zgloszenie-d-pipy-zdolnosci-podzial.test.js`, `tools/generate-plan-decks.mjs` (jeśli dotknięte) | dziura w pinie (D/4 pomijał karty kolorowe), ratchet w obie strony |

Pliki czysto dokumentacyjne (`docs/*`, `README.md`) audytuję pod kątem
zgodności twierdzeń ze stanem kodu (L56 — zdanie o danych sprawdzam grepem).

## Etapy

### E1 — PR na starcie (ADR 0020 A)

- [ ] ten plik jako osobny commit + push gałęzi `arena/01a0c0af-mtg`;
- [ ] otwarcie PR do `main` PRZED kodowaniem.

### E2 — audyt silnika PR #131 (ADR 0020 B / 0016 / 0030)

Przegląd każdego zmienionego pliku `src/` pod kątem logiki, zgodności z CR
(twierdzenia regułowe weryfikowane u źródła), generyczności (ADR 0002 — brak
przypadków po nazwie/ID karty), kompletności widoku (ADR 0017), determinizmu
(ADR 0005) i kontraktów zdarzeń (L112/L153). Każde znalezisko: test RED →
naprawa u root cause → GREEN → mutacja (L13) → bramy → commit → push.

- [ ] E2.1 T1: `delveGenericMana` (jedno źródło limitu), `affordableDelveCounts`
      (bramka czarów i permanentów), strażnik sumy przed pierwszą mutacją,
      `producibleMana` w `castSpell`, reset licznika instancji/sorcery.
- [ ] E2.2 T2: ścieżka `pendingAuraHost`/`resolve_aura_host` — siedem warstw
      L48 pkt 8; kolejność zdarzeń powrotu (wjazd aury do strefy, wybór
      gospodarza PRZED wejściem, brak gospodarza → karta zostaje w grobie).
- [ ] E2.3 T3/T5: `cardInfo`/`renderCardPreview`/`rulesText` dla Delve,
      `modalIntroText` w narzędziu, skan znaków niełacińskich.
- [ ] E2.4 T4: `blockCandidatePool` vs `legalBlockerOptions` (cap), pole
      `blockCandidates` w widoku, wiersze wizarda; brak `modeFollowUpPlanOf`
      i piny na funkcjach produkcji.
- [ ] E2.5 raport `docs/audits/AUDYT_PR131_2026-09-20.md` + wpis w opisie PR.

### E3 — pętla jakości (ADR 0021 pkt 4a)

- [ ] `npm run build`, `npm i` w `tools/table-tester`, partie Żywym Testerem
      na `dist/` (co najmniej 8, różne talie/seedy) — L76;
- [ ] ręczna lektura transkryptów (L27 — zero zgłoszeń to pomiar narzędzia),
      każde znalezisko: naprawa u root cause + nowy detektor/pin.

### E4 — domknięcie

- [ ] bramy: `node tools/run-tests.mjs all`, `npm run build`,
      `node --test test/bot-benchmark.test.js`, `node tools/benchmark.mjs --quick`
      (bez pełnej macierzy — ADR 0018);
- [ ] `docs/LESSONS.md` (nowe lekcje + rozliczenie budżetu lektury),
      `docs/ENGINE_MILESTONES.md`, `docs/PROJECT_HISTORY.md`,
      `docs/setup/HANDOFF_2026-09-20e.md`, README (liczby mierzone — L92);
- [ ] opis PR zaktualizowany kumulatywnie; blok przekazania w czacie.

## Ryzyka i pułapki (z rejestru lekcji)

- **L13/L61** — każdy pin musi realnie czerwienieć; mutacja per gałąź,
  nie per plik.
- **L48 pkt 8** — nowa decyzja blokująca ma SIEDEM bramek do zmutowania;
  happy-path zostawia pięć żywych.
- **L5** — strażnik mierzy regułę z KONSTRUKTÓW, nie z komentarza.
- **L136** — mutacje testowe robię kopią pliku (`cp … /tmp/…`), nie
  `git checkout`; jeden finding = jeden commit = push.
- **L76** — tester czyta `dist/`, po każdej zmianie w `src/` przebudowa.
- **L92** — liczby „bieżącego stanu" mierzę na końcu, nie w środku PR.
- **ADR 0018** — pełna macierz B0 tylko na wyraźną komendę właściciela.
- **ADR 0029/0022** — nie dodaję kart; brak nośnika → karta syntetyczna
  w pliku testu.
- **Token GitHub** wygasał w poprzedniej sesji — push po każdym zielonym
  kroku, bez force pusha (ADR 0020 D).
