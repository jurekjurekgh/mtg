# PLAN 2026-10-21b — kontynuacja: audyt PR #169 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → ADR 0020/0021:
PR sesji → audyt poprzedniego scalonego PR → niedokończony plan z `main` → pętla
jakości. Bez samowolnego dodawania kart (ADR 0029), bez pełnego B0 (ADR 0018).

**Gałąź:** `arena/3ff39ec9-mtg`, baza `main` @ `c249792` (scalony PR #169).
**Lektura:** AGENTS §0, ADR 0001–0030, LESSONS L1–L186, ENVIRONMENT, PR #169
(diff `.arena/pr169.diff`), najnowszy handoff `HANDOFF_2026-10-21.md` (opisuje
sesję PR #169 — z zastrzeżeniami z tamtej pętli, fakty sprawdzać w repo).

## Rozpoznanie przed kodowaniem

- `git status`: czysto; `gh pr list`: #169 scalony (squash `c249792`), brak
  otwartych PR. Gałąź sesji istnieje lokalnie = baza `main`.
- PR #169 to sesja naprawcza po audycie PR #168: 56 zmienionych plików,
  ~+2 587/−589 linii. Zawiera: A-1…A-3 (convoke/riot/inicjatywa wg CR),
  A-4…A-10 (bot, płatność, UI), A-11…A-13 (erraty dokumentacji, dobrowolne
  convoke z capem 64, golden master), skrócenie 13 wpisów LESSONS (budżet
  ~98,5k/100k), PMSSB-77 oraz Q-1 (log `object_attached` po `via:
  'living_weapon'`). Diff tylko roboczo w `.arena/` (nie commitować).
- `npm test` na bazie: rc=0 (136,6 s); `npm run build`: rc=0, 75 modułów,
  5308,1 kB. Pełny pakiet (`test:all`) na domknięcie PR (deklarowane 8930).
- Handoff nie wymienia niedokończonego planu z `main`; plany PMSSB-68–77
  zostały domknięte w #168/#169. Sprawdzić najnowsze PLAN_* pod kątem
  nieodhaczanych kryteriów — nie brać backlogu za kolejkę.

## Etapy i planowane oddzielne commity (kolejno, każdy zielony + push)

0. [x] **Plan i PR:** ten dokument jako osobny commit, push,
   `gh pr create --base main --head arena/3ff39ec9-mtg`; PR istnieje przed
   jakimkolwiek kodowaniem (ADR 0020 A).
1. [ ] **Audyt techniczny PR #169:** przejść KAŻDĄ z 56 ścieżek diffu.
   W grupach: (a) silnik — convoke (`resources.js`), riot (`riot.js`,
   `spells.js`, `card-data.js`), inicjatywa (`effects.js`), tokeny, triggery,
   fingerprint, protokół; (b) bot — wycena trample/blockers, params, golden
   master; (c) UI — `choice-request.js`, `render.js`, `session.js` (Q-1),
   `index.html`; (d) testy (w tym RED→GREEN vs implementacja), fixture
   golden, narzędzia (`generate-plan-decks.mjs`); (e) dokumentacja — erraty,
   LESSONS/PRZYPADKI (budżet i reguły), PMSSB, historia, handoff, README.
   Dla reguł krytycznych (convoke CR 702.51a, riot CR 702.136a, inicjatywa
   CR 726) — weryfikacja dosłownym CR online przed uznaniem/uzgodnieniem
   (ADR 0030); brak źródła = brak zmiany regułowej. Ustalenia, dowody i status
   każdej ścieżki do `docs/audits/AUDYT_PR169_2026-10-21.md`; opis PR uzupełnić.
2. [ ] **Każdy wykryty błąd:** osobny mały krok: repro/test RED → naprawa u
   root cause (bez wyjątków po nazwie karty) → GREEN + mutacja/anty-over-fix
   → `npm test` + build → commit i push. Nie mieszać niezależnych fixów.
3. [ ] **Pętla jakości:** Żywy Tester na świeżym `dist/` (build + `npm i`
   w `tools/table-tester`), przeczytać transkrypty ręcznie w trzech osiach
   (bot, log/modal, auto-pass); poprawki u root cause + detektor dla nowej
   klasy błędu. Polowanie na niezgodności CR inną ścieżką niż #168/#169
   (tam: convoke, riot, inicjatywa, clash, CR 122.1d stun) — z repro i
   cytatem źródła. Oddzielne zielone commity.
4. [ ] **Domknięcie:** `npm run test:all` cicho do ignorowanego logu,
   `npm run build`, `node tools/cr-numery.mjs --sprawdz`, strażnik budżetu
   lektury, `git diff --check`, zgodność z `origin/main`; uaktualnić
   `docs/PROJECT_HISTORY.md`, handoff `HANDOFF_2026-10-21b.md`, podsumowanie
   tego planu i kumulacyjny opis PR. Push bez force; PR do decyzji właściciela,
   NIE scalać.

## Ryzyka i kontrola

- PR #169 zmieniał reguły silnika przy kartach batcha 69 — audyt musi
  rozdzielić „test zielony, bo test i kod napisała ta sama sesja" od reguły
  potwierdzonej źródłem (ADR 0030, L13).
- Golden master odnowiony w #169 (3 hashe) — nie traktować zgodności hasha
  jako dowodu poprawności reguł; przy własnych zmianach bota — pełne
  porównanie `--dump` przed/po.
- Engine/view/bot bez rozgałęzień po nazwie karty (ADR 0002/0017); karty i
  talie tylko z kolekcji właściciela (ADR 0029). Nie podnosić limitu 64
  wariantów convoke ani progu 100 stworów O-2 bez decyzji właściciela.
- Testy fast/slow/all ZAWSZE do `.arena/*.log` z zachowaniem exit code;
  tester czyta `dist/` — build przed pomiarem; długi bieg w tle, bez `tee`.
- Każdy push: `git status`/`git log`, fetch i porównanie z origin; tylko
  nowe commity na gałęzi sesji (ADR 0020 D). Żaden merge bez decyzji
  właściciela.

## Podsumowanie wykonania

(do uzupełnienia przy domknięciu sesji)
