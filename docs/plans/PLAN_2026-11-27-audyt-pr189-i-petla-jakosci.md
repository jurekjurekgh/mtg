# Plan sesji 2026-11-27 — Audyt PR #189 i pętla jakości (ADR 0020 / ADR 0021)

- **Gałąź sesji:** `arena/307361fc-mtg`
- **Baza (`main`):** `dd1f587c3c053080bf32be19158fb55a4a461ffd` (scalenie PR #189)
- **Tryb:** ADR 0020 (PR na starcie → pełny audyt PR #189 → inkrementalne commity) +
  ADR 0021 (pętla jakości przy braku wskazania konkretnego zadania w prompcie
  „Kontynuujemy projekt.” — nie wymyślam nowego batcha kart; kolekcja kończy się
  na 665, Batch 74 zamknięty w PR #187).

## Rozpoznanie bazowe (zweryfikowane na `dd1f587`)

- PR #189 („Audyt PR #188 i pętla jakości (sesja 2026-11-21)”, `arena/03166ca3-mtg`,
  scalony 2026-11-27 06:38 UTC) to **64 pliki (+3154/−212)**, 22 commity, DWIE fazy:
  1. **Faza 1 (2026-11-21, E0–E3):** audyt PR #188 (dokumenty), klasowy strażnik
     surowych slugów (`test/surowy-slug-kafel-katalog.test.js`), 23 partie Żywo
     Testera (0 defektów) — opisane w handoffach `HANDOFF_2026-11-21*.md`.
  2. **Faza 2 (2026-11-23 → 11-25, zgłoszenia właściciela, opisane w body PR):**
     - **F3** — `matchColorRequirements` (`src/engine/mana-cost.js`): backtracking
       enumerujący permutacje jednostek (silnia; wisiało na czarach X typu Consume
       Spirit) → algorytm Kuhna (dokładne dopasowanie bipartite, O(req·units·edges)).
     - **F1/F2** — kreator grupowy Lash of the Balrog (cel + ofiara ALBO zapłata
       {4}): `sacrificeCastPlanOf` z wariantami `payAltCost`, wiersz
       `ALT_PAY_ROW_ID`, `paymentDescriptorOf` z pełną kwotą (baza + {4}),
       `assertNoCombinationRows` wykrywa też PEŁNY krzyż wymiarów skalarnych
       (fail-closed, wyjątek tylko dla okna rzutu M300).
     - **G** — Glorifier of Suffering: zakaz poświęcania zdrowych permanentów dla
       refleksu licznikowego (`counterReflexSacrificeGuard`,
       `deficientCounterReflexSacrifice` — obca aura / TMC≤1 / token 1/1).
     - **H** — Epic Experiment: dwa removaly w TEN SAM cel na MOIM stosie → kara
       (`stackRemovalDuplicationPenalty`, CR 608.2b fizzle dolnej instancji).
     - **J** — Containment Membrane: zakaz buforowania (aura/equip/licznik+pump)
       gospodarza unieruchomionego wrogą aurą (`attachTargetDisabled`,
       `disabledAttachTargetPenalty` = 1000).
     - **J-Moldgraf** — self-mill ETB: wartość `selfMillValue`/`foeMillValue`
       (miller), potem korekta właściciela: twarde weto „PO millu < 10”.
     - **J2** — UNIFIKACJA bramek drenażu biblioteki: jedna funkcja
       `commandSelfDrain` (natychmiastowy ubytek per typ komendy) + jedna bramka
       `libraryDrainVeto` (podłoga `libraryDrainFloor: 10` PO drenażu + reguły
       rodzinne: wyścig symetryczny, fizzle tutora, loot); wchłonięte haki:
       `selfMillFloorVeto`, `symmetricDrainVeto`, `cloakCastVeto`, `thinBandCastVeto`,
       `springbloomDrainVeto` (podłoga; fizzle zostaje), próg lootu.
     - **79892** — brak stopu na początku tury przeciwnika: odprysk gestu na
       „Rozumiem”/X (`MODAL_OPEN_GUARD_MS` w main.js) + guard `recheckAutoPass`
       przy `awaitingBotAck` (session.js).
     - Testy „liczące inaczej” zmienione wg mandatu J2 (~30 plików testów),
       golden-master zregenerowany świadomie (`fa4ae83`).
- **Baseline tej sesji (zmierzony):** `npm test` → **10 585 / 10 585, fail 0**
  (~151 s); `npm run build` → **79 modułów / 6016,9 kB, EXIT 0**. PR #189 raportuje
  `test:all` **10 867/10 867** i benchmark quick **90,0% (605/672)** — obie liczby
  do potwierdzenia pomiarem w tej sesji (L56/L92).
- Kolekcja właściciela kończy się na 665 — **żadnego nowego batcha kart** (ADR 0029,
  ADR 0021 pkt 4c).

## Etapy pracy i kolejność commitów

### E0. Plan i PR na starcie (ADR 0020 A) — ten commit
- [ ] Spisanie planu w `docs/plans/PLAN_2026-11-27-audyt-pr189-i-petla-jakosci.md`.
- [ ] Push gałęzi `arena/307361fc-mtg` i otwarcie PR na GitHubie PRZED jakimkolwiek
  kodowaniem (PR może na starcie zawierać tylko ten plan).

### E1. Audyt techniczny PR #189 (ADR 0020 B / ADR 0016)
- [ ] Inwentarz 64/64 plików (`gh api pulls/189/files --paginate` vs `^diff --git `
  w `gh pr diff 189`; L190) → `docs/audits/PR189_MAPA_PLIKOW_2026-11-27.md`.
- [ ] **F3 (Kuhna):** weryfikacja poprawności — sonda różnicowa stary backtracking
  vs Kuhn na losowych zbiorach jednostek/wymagań (deterministycznie seedowana);
  sprawdzenie determinizmu (kolejność przypisań), brak zmiany semantyki
  `matchColorRequirements` dla poprawnych danych; testy F3 (`test/f3-match-color-*`).
- [ ] **F1/F2 (UI):** fail-closed (`payAltCost` bez kwoty → brak kreatora), brak
  budowania komend „z palca” (L48 — komenda szukana w legalnych), wyjątek
  `allowScalarProduct` tylko dla castWindowMode; `assertNoCombinationRows` — ryzyko
  fałszywych alarmów na legalnych listach (test:all jako bramka + lektura).
- [ ] **G/H/J (bot):** rozpoznanie deskryptorowe (ADR 0002 — bez nazw kart),
  symetria gałęzi (L41: aura/equip/licznik/pump/wielocelowe), anty-over-fix
  (pokrętła ×0), zgodność wycen z CR (G: CR 704.5m; H: CR 608.2b; J: deskryptor
  aury wroga).
- [ ] **J-Moldgraf + J2 (drenaż):** kompletność `commandSelfDrain` wobec katalogu
  (rodziny efektów drenażu vs zbiory `LIBRARY_DRAIN_EFFECTS`/`SYMMETRIC_DRAIN_EFFECTS`/
  `FACE_DOWN_LIBRARY_EFFECT_TYPES`), usunięte haki — czy nic nie zniknęło poza
  mandatem (mutacyjny przegląd par „wchłonięty próg” → nowa podłoga).
- [ ] **79892 (pauza):** guard odprysku na obu przyciskach (Rozumiem + X),
  `age >= 0` (zegar testowy), `recheckAutoPass` no-op przy pauzie — pin
  `test/zgloszenie-j-pauza-granicy-tury.test.js` na prawdziwym `main.js`.
- [ ] Testy zmienione wg mandatu (~30 plików) — spot-check: piny cienkie → −∞,
  sceny podbite nad próg; żadnego poluzowania asercji bez mandatu (L181).
- [ ] Zgodność z ADR 0002/0017/0022; **RED→GREEN** mutacjami na kluczowych testach
  (L13) — min.: Kuhn (F3), `libraryDrainVeto` (J2), `attachTargetDisabled` (J),
  odprysk „Rozumiem” (79892).
- [ ] Potwierdzenie benchmarku quick (`node tools/benchmark.mjs` — profil szybki,
  ADR 0018) wobec raportu PR (90,0%/605).
- [ ] Raport `docs/audits/AUDYT_PR189_2026-11-27.md` + wpis `PROJECT_HISTORY.md`;
  znalezione błędy naprawiane od razu (osobny commit, RED→GREEN).

### E2. Pętla jakości (ADR 0021 pkt 4a/4b)
- [ ] (b) Polowanie na niezgodności z CR **inną ścieżką niż sesja #189** (tam:
  statyczny skan kafli + kompletność map kwot + Tester): **audyt kompletności
  nowego `commandSelfDrain`** — enumeracja rodzin drenażu biblioteki w katalogu
  (`mill_*`, tutor, płatności, cloak/manifest, symetryczne) vs zbiory efektów w
  bocie; luka = kandydat do naprawy u root cause + strażnik klasowy.
- [ ] (a) Żywy Tester (świeże pary talii + profile, `npm run build` przed biegiem —
  L76; `npm i` w `tools/table-tester`): osie audytu wg `TESTER_STOLU.md`; **dokończyć
  żywe pokrycie batcha 74** (otwarty punkt handoffu #189: Grollub / Arrow Storm /
  Frilled / Memorial-ability / Saltfield / Temur Banner nie zagrały — dobrać seedy
  z `--list-decks`/`BENCH_DECKS`, nie zgadywać); naprawy u root cause + nowe
  detektory, gdy klasa błędu się powtórzy (L27).
- [ ] Bramy po każdym kroku: `npm test` (cicho, `.arena/`) + `npm run build` —
  zielone przed każdym commitem.

### E3. Domknięcie sesji
- [ ] `npm run test:all` (pełna brama PR, cicho, `.arena/test-all.log`; baza
  raportu PR #189: 10 867/10 867 — L192: delta od pomiaru).
- [ ] Odświeżenie „bieżącego stanu” NA KONIEC sesji (L92): README/handoff liczbami
  z pomiaru.
- [ ] `docs/setup/HANDOFF_2026-11-27.md` + wpis `PROJECT_HISTORY.md` + opis PR
  kumulacyjnie; blok przekazania w czacie (ADR 0013 pkt 2).

## Ryzyka / pułapki

- Sandbox: klon ma projekt jako jeden squash-commit — audyt PR przez `gh api`/
  `gh pr diff` (L190), nie `git log`.
- Testy wyłącznie z przekierowaniem do `.arena/` (ENVIRONMENT §5a); żadnego pełnego
  wyjścia do czatu.
- `edit_file` psuje polskie znaki → edycje docs przez `python3` (UTF-8); nowe pliki
  przez `write_file`.
- Kuhn w `matchColorRequirements` to ZMIANA SEMPLICZNA w silniku płatności many —
  sonda różnicowa PRZED uznaniem równoważności (L118); mutacje tylko kopią pliku
  do `/tmp` (L34/L136), nigdy `git checkout` na plikach z pracą.
- Brak decyzji właściciela w zakresie: żadnych nowych kart, żadnego pełnego B0
  (ADR 0018), żadnych zmian architektury.
