# Plan sesji 2026-09-15d — audyt PR #121 + pętla jakości (ADR 0020/0021)

- **Sesja/gałąź:** `arena/01a0a5a7-mtg` → PR do `main` (ADR 0020 A).
- **Zlecenie:** „Kontynuujemy projekt." — bez nazwanego tematu → pętla domyślna
  ADR 0021: PR → audyt poprzedniego scalonego PR (#121) → niedokończony plan
  (brak: `PLAN_2026-09-15c` w całości odhaczony + podsumowanie) → pętla jakości.
- **Stan wejściowy (zmierzony):** `npm test` **5514/5514** (0 fail, ~204 s),
  `git status` czysty na `1d5b5df` (= `origin/main`, squash PR #121).
- **Lektura startowa (§0 AGENTS.md):** AGENTS.md, wszystkie ADR-y (0001–0030),
  `docs/LESSONS.md` w całości (linie 1–2354, L1–L143), `ENVIRONMENT.md`,
  ostatni PR (#121: pliki + diff `01c22a9..1d5b5df`), najnowszy handoff
  (`HANDOFF_2026-09-15b.md`). `PROJECT_HISTORY.md`/archiwa — tylko grep punktowy.

## E0 — ten plan + PR sesji (ADR 0020 A) [x]

- [x] Plan w repo, commit, push, otwarcie PR przed jakimkolwiek kodowaniem.
- [x] Bramka: `npm test` 5514/5514 (baseline z tła sesji).

## E1 — raport audytu PR #121 (ADR 0020 B) [x]

- [x] `docs/audits/AUDYT_PR121_2026-09-15.md` — werdykt APPROVE, V1–V10, G1/G2/G3, O1–O4.
- [x] Wynik w opisie PR #123 (kumulatywnie).

Diff `01c22a9..1d5b5df`: 21 plików (+1400/−80), w tym 6 nowych plików testowych,
5 miejsc `src/` (bot, mana-sources, main, render, session), fixture golden-mastera,
regeneracja 1 linii w `m348`. Metoda: każdy plik w diffie + weryfikacja mechaniczna
klaimów (git diff + pomiar + grep + mutacja punktowa, nie opis — L56/L92/L13),
cytaty CR z literalnego źródła online (ADR 0030).

Wstępne wyniki (zweryfikowane w tej sesji, przed raportem):

- **V1–V10 (potwierdzone):** F1 root cause (`playerView` → `{sourceCardId, effect}`,
  `game-state.js:7871`, brak `ability`) + mutacja pre-F1 → 1 RED; O1
  (`oneShotDeckOutPenalty(v,1)` ≡ 0, fallback 0); F2 mirror
  (`restrictedSpellBlockedFor` ≡ `restrictedManaBlocked`); fixture **bit w bit**
  == gałąź `arena/01a0a506-mtg` (sha256 `b5a5dbf3…`); oskarżenia F5 wobec #120
  (8 plików, 0 testów, fixture identyczny); Z1 enumeracja nośników
  (3 karty, tylko Scholar aktywowany); Z2 (`abilitiesOf` czyta rejestr,
  16 efektów/9 tokenów, dryf 0, kolejność deskryptor→mapa, kopie niosą
  zdolności); cytat 702.16e **dosłowny** (mtg.wiki CR 2026-08-07); kod okna A4
  poprawny (end_of_combat słusznie poza; 511.1 ✓); ADR 0002 (0 literałów kart
  w kodzie); Oracle Powerstone w snapshotach repo ✓.
- **G1 (znalezisko: błędny cytat CR, tylko komentarz — logika poprawna):**
  A4 wprowadza „CR 510.1 daje priorytet przed rozdaniem" (komentarz w bocie +
  nagłówek testu + proza raportu O2 „zmiana zasad 2018"). Literalnie: 510.1 =
  ogłaszanie przydziału, 510.2 = rozdanie + „No player has the chance to cast
  spells or activate abilities between…", 510.3 = priorytet PO rozdaniu.
  Okno priorytetu silnika w `combat_damage` ODPOWIADA oknu po blokach z
  **CR 509.2** („Second, the active player gets priority") — silnik skacze
  `declare_blockers`→`combat_damage` (M172/C), a przydział+rozdanie dzieją się
  razem w `resolve_combat` bez okna pomiędzy (bramki `pendingDamageAssignment`,
  `game-state.js:5427/7186` — zgodne z 510.2). Kod A4 słuszny, sygnatura
  regułowa błędna (klasa L44/L143 — grozi utrwaleniem fałszywego modelu „510
  daje priorytet przed obrażeniami").
- **G2 (styczność, pre-existing, komentarz):** M172/C cytuje „CR 509.4" dla okna
  odpowiedzi — dziś 509.4 = „put onto battlefield blocking" (priorytet = 509.2;
  dryf numeracji Foundations, L143). Ten sam fix co G1 (jedna rodzina reguł,
  oba zweryfikowane literalnie).
- **O-obserwacje (nieblokujące):** (a) F2 fail-open przy nierozpoznanym `cardId`
  (degenerat; silnik waliduje ściśle); (b) widok ucina efekt may-trigger do
  `effect[0]` (M221/B) — drenaż poza pierwszą pozycją ominąłby karę F1; dziś
  bez ofiary (jedyny mayFire-tablicowy to gain_life); warunek uruchomienia:
  pierwsza karta mayFire z drenażem nie-na-pierwszym-miejscu; (c) proza „8 z 11"
  miesza zbiory (9 unikalnych tokenów z deskryptora vs 11 wpisów; incubator/clue
  poza strażnikiem — pre-existing); (d) M221/E (cytat 702.16e przy blokadzie,
  PR #107) — do potwierdzenia: blok = **702.16f** (zweryfikowane literalnie);
  jeśli komentarz myli e↔f, fix w pakiecie G1/G2.

Kryterium: `docs/audits/AUDYT_PR121_2026-09-15.md` + wynik w opisie PR.

## E2 — fix G1/G2/G3: sprostowanie cytatów CR (komentarze) [x]

- [x] G1: komentarz A4 w bocie + nagłówek testu (podstawa: CR 509.2, nie 510.1).
- [x] G2: M172/C 509.4→509.2 (game-state.js).
- [x] G3: M221/E — doprecyzowanie nagłówka + 4× 702.16c→702.16e w bocie.
- [x] Raport: G3 ×4 + O5 (inwentarz pozostałych cytatów 702.16, poza zakresem).
- [x] Weryfikacja: diff wyłącznie komentarzowy (grep `^[+-]` poza `//|*` pusty).

- [x] Bramka: `npm test` + `npm run build` zielone (zmiana komentarzy — brak
      dryfu liczb; L92: liczb nie przepisuję z pamięci).
- Notatka: raporty z MERGE'owanych sesji (AUDYT_PR120) mrożone; raport własnej
  sesji (AUDYT_PR121_*) żyje do merge'a — stąd G3 ×4 + O5 dopisane w E2
  (wzorzec: §Zbieżność dopisany do raportu #121 w E9 tamtej sesji).

## E3 — pętla jakości ADR 0021 (inna ścieżka niż sesja #121) [x]

- [x] Wariant B (zamiast A — E2 to komentarze, partie celowane nieproporcjonalne):
      audyt kontraktu `pendingDamageAssignment` (oferta vs walidacja, L48) —
      CZYSTY, V8 potwierdzone z obu stron; wynik w raporcie (§Pętla jakości).
- [x] Benchmark `--quick`: heuristic 82.9% (557/672) = README/main — tożsamość
      behawioralna E2 zmierzona (672 mecze, ~141 s).

Sesja #121 robiła Żywego Testera celowanego w naprawy (5 partii, Z1/Z2).
Tutejsza pętla (dopóki właściciel nie wskaże tematu):

- [ ] Wariant A (preferowany): partie celowane w okno A4/Spare + may-draw F1 —
      potwierdzenie żywe okna `combat_damage` i odmowy may-draw przy cienkiej
      bibliotece (talie: `innistrad-wu` — Murder/Spare; seed hunter).
- [ ] Wariant B (fallback, gdy tester drogi): polowanie CR inną ścieżką —
      audyt контракта `pendingDamageAssignment` (oferta vs walidacja, L48)
      albo skan snapshotów Scryfall po danych kart (L96).
- [ ] Każde znalezisko: repro → fix u root cause → test RED→GREEN → mutacja (L13).

## E4 — domknięcie sesji (ENVIRONMENT §7) [x]

- [x] Bramki ZMIERZONE: `npm test` 5514/5514, `test:all` 5524/5524, build
      61/3685,6 kB, regresja B0 10/10, quick 82,9% (557/672, bez zmian).
- [x] README „Bieżący stan" (3685,6 kB + notka PR #123), PROJECT_HISTORY
      (§2026-09-15d), HANDOFF_2026-09-15c, opis PR #123 kumulatywnie.
- [x] LESSONS.md: BEZ wpisu — G1 to klasa L44/L143 (cytat CR), nie nowa lekcja.
- [x] Blok przekazania w czacie (ADR 0013).

- [ ] `npm test` + `npm run build` + `test:all` (brama PR) + benchmark quick
      (bez `--full` — ADR 0018) — liczby ZMIERZONE (L56/L92).
- [ ] README „Bieżący stan", `PROJECT_HISTORY.md`, `HANDOFF_2026-09-15c.md`,
      opis PR kumulatywnie, lekcja w `LESSONS.md` tylko jeśli klasa NOWA
      (G1 to L44/L143 — bez nowej lekcji; wpis płaciłby się skróceniem innej).
- [ ] Blok przekazania w czacie (ADR 0013).

## Ryzyka / pułapki

- Pułapka B4/F3 (PR #105): claim regułowy bez literalnego cytatu — NIE ruszać
  logiki walki; G1/G2 to wyłącznie komentarze (znaczenie zweryfikowane, L143).
- Raporty audytów to historia — nie edytować `AUDYT_PR120_*` wstecz (L142).
- `git checkout` na plikach z pracą sesji — zakaz praktyczny (L8/L136);
  mutacje przez `cp /tmp/*.bak` + `python3` (`assert count==1`, L139).
- Benchmark/start bez `| tail` (log buforowany; czekać na `exit`).
- Talie trzymają NAZWY wyświetlane, nie slugi (handoff 15b).
- `npm test` ~3,5 min, `test:all` ~6 min — bramki planować z wyprzedzeniem.
