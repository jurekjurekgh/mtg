# PLAN 2026-10-21c — kontynuacja: audyt PR #170 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → ADR 0020/0021:
PR sesji → audyt poprzedniego scalonego PR → niedokończony plan z `main` → pętla
jakości. Bez samowolnego dodawania kart (ADR 0029), bez pełnego B0 (ADR 0018).

**Gałąź:** `arena/5d252dbf-mtg`, baza `main` @ `9b25142` (scalony PR #170).
**Lektura:** AGENTS §0, ADR 0001–0030, LESSONS L1–L187, ENVIRONMENT, PR #170
(11 plików), handoff `HANDOFF_2026-10-21b.md`, plan sesji poprzedniej.

## Rozpoznanie przed kodowaniem

- `git status`: czysto; `origin/main` = `9b25142` = HEAD gałęzi sesji (bez
  ruchu). PR #170 scalony 2026-10-21 17:58 UTC (squash).
- PR #170 = sesja 2026-10-21b: **11 plików**, jedyna zmiana kodu to
  `src/engine/combat.js` (+7/−2) — fix duplikatu `damage_dealt` w strumieniu
  komendy (`slice(before)` → `slice(before, -1)`), guard
  `test/audyt-pr170-duplikat-damage-dealt-2026-10-21.test.js` (2 testy),
  wpis `702.15b` w tabeli numerów CR i dokumentacja (LESSONS L187,
  PRZYPADKI, PROJECT_HISTORY, handoff, README).
- Baza: `npm test` **8665/8665** (123,9 s), `npm run build` 75 modułów /
  5308,5 kB — zgodne z handoffiem.

## Wyniki audytu PR #170 (11/11 plików)

**Fix `combat.js` — POPRAWNY.** `damage_dealt` jest zawsze ostatnim elementem
`state.events` w oknie `before` (tarcze + statyczna prewencja wypychane są
wcześniej), więc `slice(before, -1)` odcina dokładnie tę jedną pozycję przy
dowolnej liczbie zdarzeń `damage_prevented`. Sprawdzone sondą na 5 wariantach
nieuwzględnionych przez test PR (dwie tarcze 2+2, dwie tarcze 1+1, tarcza
nadmiarowa 10, tarcza na atakującym, mgła + tarcza): `damage_dealt` w strumieniu
komendy i w `state.events` dokładnie raz, żadne zdarzenie prewencji nie ginie.

**Strażnik realny (L13/L34).** Mutacja `slice(before, -1)` → `slice(before)`
czerwieni OBA testy (2/2 fail), powrót → 2/2 GREEN; drzewo czyste po mutacji
(`git status` pusty).

**Klasa L130/L187 poza fixem — sprawdzona.** Wszystkie pozostałe
`events.push(...state.events.slice(checkpoint))` mają checkpoint TUŻ przed
jednym helperem i nie są po nich obok explicit pushy (`combat.js` 158/1393/1410/
1420/1477/1493/1501, `triggers.js` 980/1975/2409/3139,
`state-based.js` 266). Brak drugiego wystąpienia klasy.

**Źródło CR zweryfikowane u źródła (ADR 0030).** `rules/cr-raw.txt` z mirrora
`nwgarne/mtg-data`: SHA-256 `8d860e45…` — zgodny z nagłówkiem tabeli, wydanie
2026-09-25. 702.15a–f, 615.6, 702.2b, 510.2 odczytane dosłownie.

### ZNALEZISKO — C-1: błędna podstawa regułowa „zapobiegnięte ≠ zadane"

**Objaw.** PR #170 uzasadnia fix cytatem **CR 119.3** (kod: `combat.js:76,120`;
test: 3×). W CR 2026-09-25 **119.3** to *„If an effect causes a player to gain
life or lose life, that player's life total is adjusted accordingly"* — nic o
zapobieganiu. Właściwa podstawa to **615.6**: *„If damage that would be dealt is
prevented, it never happens."* (CR 615.7 opisuje tarczę „prevent the next N").

**Zakres.** To nie jest regresja PR #170 — rozsiany rozejście z 2026 r.: **32
wystąpienia `119.3` w 11 plikach** (`combat.js`, `effects.js`, `game-state.js`,
`triggers.js`, `session.js`, `abilities.js`, `heuristic-bot.js`,
`engine-gold-badge.test.js` …). PR #170 dopisał 3. Reguła jest W KAŻDEJ z tych
etykiet: „zapobiegnięte obrażenia NIE są zadane".

**Dlaczego to nie było złapane.** Strażniki numerów CR pilnują TYLKO
(i) istnienia cytowanego numera i (ii) par „temat ↔ zakazany numer" dla
mechanik 702.x. Nic nie sprawdza, że cytowany numer **znaczy to, co komentarz
twierdzi** dla numerów spoza 702 — `119.3` istnieje, więc strażnik istnienia
milczał (dokładnie ta sama luka co F-1 z audytu PR #136, tylko w innym
wymiarze: tam „numer spoza sekcji", tu „numer z sekcji, ale o innym znaczeniu").

**Naprawa.** (1) korekta podstawy w całej rodzinie 119.3 → 615.6/615.7 (tam,
gdzie chodzi o prewencję; `119.3` zostaje tam, gdzie faktycznie opisuje życie —
np. `lose_life` w `effects.js:3320`, `abilities.js:65`); (2) para w tabeli
`test/cr-numery-mechanik-straznik.test.js`: „zapobiegnięte obrażenia nie są
zadane" nie może cytować `119.3`; (3) weryfikacja mutacyjna pary (RED po
wstawieniu 119.3 obok tematu).

**Ryzyko.** Uwaga: `engine-gold-badge.test.js` i kilka plików cytują 119.3 jako
„złotą odznakę" — korekta podstawy nie zmienia zachowania, wyłącznie
prawidłowość komentarza i testu-pinu. Kod bez zmian.

## Etapy i planowane oddzielne commity (każdy zielony + push)

0. [x] **Plan i PR:** ten dokument jako osobny commit + push, PR otwarty
   przed kodowaniem (ADR 0020 A).
1. [x] **Audyt PR #170** (11/11 plików) — wynik powyżej; sprawozdanie
   `docs/audits/AUDYT_PR170_2026-10-21.md`.
2. [ ] **C-1 — naprawa podstawy regułowej:** korekta 119.3 → 615.6/615.7
   w całej rodzinie „zapobiegnięte ≠ zadane" + para w strażniku numerów CR +
   test mutacyjny RED→GREEN. Kod silnika BEZ zmian.
3. [ ] **Pętla jakości** (ADR 0021): 4 partie Żywego Testera na taliach spoza
   próbki benchmarku (rotacja, L179) + polowanie CR ścieżką inną niż poprzednia
   sesja (poprzednia: 702.15 lifelink / 119.3). kandydaci: 702.164b/615.7
   (toxic + tarcza), 510.1c (przydział po prewencji), 120.4b.
4. [ ] **Domknięcie:** `npm run test:all`, `cr-numery --sprawdz`, budżet lektury,
   build, README/PROJECT_HISTORY/handoff/PR.

## Pułapki

- Sandbox potrafi zresetować drzewo — każdy commit pushujemy od razu.
- Mutacje: kopia w `.arena/`, `git status --short` pusty po każdej.
- `.arena/` jest poza repo (nie commitować); `tools/table-tester/*.txt`
  ignorowane.