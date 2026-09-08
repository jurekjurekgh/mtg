# Plan sesji 2026-09-08 — audyt PR #106 + pętla jakości

Gałąź: `arena/01a08274-mtg`. Tryb: ADR 0020 (PR → audyt → inkrementalne
commity) + ADR 0021 (prompt bez tematu = pętla domyślna, bez pytania
o kolejkę). Poprzedni PR #106 scalony (squash `5677ffb`, 115 plików):
Batch 54 (karty 599–608) + badge Animatora + wspólny wybór odrzucenia.

## Etapy

- [x] **P0: PR na starcie.** Ten plan jako osobny commit, push, otwarcie PR
  do `main` przed jakimkolwiek kodowaniem (ADR 0020 A).
  Kryterium: PR OPEN na GitHubie, opis z planem audytu.
  → PR #107 OPEN („Sesja arena/01a08274: audyt PR #106 + pętla jakości”).
- [x] **P1: baza zmierzona.** `npm test` + `npm run build` na stanie `main`
  (= HEAD gałęzi). Kryterium: liczby fast/build zgodne z handoffem
  `HANDOFF_2026-09-08j` (all 4970/4970, build 60/3433,3 kB) albo rozjazd
  zgłoszony jawnie.
  → fast 4960/4960, build 60/3433,3 kB (rozjazd vs handoff j: drzewo nowsze
  niż handoff; przyjęto jako bazę, §5 audytu).
- [x] **P2: audyt PR #106** (ADR 0020 B / ADR 0016, bez pełnego B0):
  (a) poprawność zmian w engine (reguły, stan, FoW, determinizm);
  (b) zakodowanie kart batcha 54 vs Oracle text ze snapshotów Scryfall;
  (c) generyczność mechanik (deskryptory, zero przypadków po nazwie/ID —
  ADR 0002); (d) testy RED→GREEN (mutacje kontrolne).
  Wynik: `docs/audits/AUDYT_PR106_2026-09-08.md` + streszczenie w opisie PR.
  Kryterium: każdy z 115 plików sklasyfikowany (przejrzany / bezfunkcyjny),
  każdy finding ma repro albo jest odrzucony z powodem.
- [x] **P3: naprawy findings u root cause** (jeśli audyt coś znajdzie).
  Każda naprawa: test RED → fix → GREEN → mutacja kontrolna → osobny
  commit + push (`npm test` + `npm run build` przed każdym).
  Zmiany regułowe TYLKO po pobraniu dosłownego CR/rulingów (ADR 0030);
  pamięć treningowa nie jest źródłem.
  → `e12428b`: F1–F5 (per-ID cause, cytat 614, kopie-tapped, martwy kod,
  cross-ref), fast 4963/4963.
- [x] **P4: pętla jakości** (ADR 0021 pkt 4, innymi ścieżkami niż sesja #106):
  (a) Żywy Tester z perspektywy gracza na taliach batcha 54;
  (b) polowanie na niezgodności z CR poza obszarami P2/P3.
  Bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018).
  → `636247b`: 5 gier (0 detektorów po fixie), „Exploit: ?” naprawiony,
  4 sondy silnika czyste (w tym 2 pozycje z §3 audytu).
- [x] **P5: domknięcie.** `npm run test:all`, `npm run build`, szybki
  benchmark, odświeżenie liczb w README (L92 — na koniec), handoff sesji,
  wpis w PROJECT_HISTORY, kumulatywny opis PR. Kryterium: `git status`
  czysty, wszystko wypchnięte.
  → all 4975/4975 (fast 4965/4965), build 60/3433,2 kB, quick 84,8%
  (570/672 — identycznie jak w README, brak zmian zachowania);
  README L36; HANDOFF_2026-09-08k; §6 audytu.

## Ryzyka / pułapki

- 115 plików w PR #106 — audyt plik po pliku, diff `aa2eb3f..5677ffb`.
- ADR 0030: każdy claim regułowy z cytatem CR pobranym z sieci; mutacje
  kontrolne kopiami plików (`cp` + `finally`), NIGDY `git checkout`
  na plikach z pracą sesji (L136).
- Liczby stanu dopiero w P5 (L92). Talie/generator: po zmianach kart
  `node tools/generate-plan-decks.mjs` (ADR 0023/0024).
- Workspace może się zresetować w trakcie sesji (ENVIRONMENT §2):
  push po każdym zielonym commicie, przed pushem procedura HEAD/diff.

## Przebieg wykonania

- P0: plan napisany, commit + push + PR (w toku).
