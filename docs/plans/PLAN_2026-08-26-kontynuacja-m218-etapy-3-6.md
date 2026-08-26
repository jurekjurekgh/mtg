# PLAN 2026-08-26 — Kontynuacja M218: etapy 3–6 audytu wyceny działań bota

- **Sesja:** `arena/01a03e3a-mtg`
- **PR:** bieżący PR sesji (utworzony przed kodowaniem wg ADR 0020 A)
- **Baza:** `main` @ `2275dd1` — 3358 testów, build 54 / 2710.9 kB, `combatTrickWindow` + `pumpChangesOutcome` już w kodzie (M218/1-2 zamknięte w PR #78)
- **Tryb:** ADR 0020 A–D + ADR 0021 (kontynuacja pętli jakości, bez nowych kart, bez pełnego B0)

## Punkt startowy

Plan `PLAN_2026-08-26-audyt-wyceny-dzialan-bota.md` istnieje na `main` z etapami 1–6.
Etap 1 (helper okien walki + naprawa A1/A2) zamknięty w PR #78 (commit M218/1).
Etap 2 (meaningfulness) zaimplementowany w kodzie (`pumpChangesOutcome` używane w `cast_spell` i `activate_ability`), ale bez osobnego wpisu w planie — weryfikujemy testami.

Pozostają:

- **Etap 3:** keywordy — flying/reach/first_strike/double_strike — własne logiki właściciela
- **Etap 4:** regenerate + scry/surveil w czarach
- **Etap 5:** audyt katalogowy 169 typów efektów
- **Etap 6:** benchmark szybki + podsumowanie

## Zlecenie właściciela (kryteria)

1. Bojowe pumpy/debuffy — sens wyłącznie w konkretnych sytuacjach bojowych; instant TYLKO w fazie walki, TYLKO po deklaracji atakujących (atak) i po deklaracji blokujących (blok). **DONE**
2. Meaningfulness — pump niezmieniający wyniku walki = 0 wartości (1/1 vs 5/5 +2/+2 nic nie daje). **DONE** (helper `pumpChangesOutcome`)
3. Keywordy mają własną logikę — flying na atakujących gdy przeciwnik nie ma latających; reach tylko na blokujących PRZED ustaleniem bloków; first strike analogicznie. **TODO — etap 3**
4. Sorcery, scry, regenerate itd. — odrębne ścieżki optymalnego użycia. **TODO — etap 4**
5. Podzielność na etapy/sesje z odhaczaniem — dopuszczalne, plan kontynuowalny.

## Rozpoznanie — luki w `heuristic-bot.js` (stan 2026-08-26)

| Obszar | Linie | Stan |
|---|---|---|
| `keywordGrantWindowValue` | 1013–1058 | LUKA: flying +2+power przy `attacking` bez sprawdzenia latających/reach wroga; reach nie sprawdza `cantBlock`; first_strike bez meaningfulness |
| `regenerate` (zdolność) | — | LUKA: brak gałęzi wyceny, tylko k=40 w FRIENDLY_TARGET_EFFECTS i lista STACKING; brak modelu zagrożenia |
| `cast_spell` scry/surveil | — | LUKA: M211 naprawił wycenę w `activate_ability` (DECK_ARRANGING), w `cast_spell` brak gałęzi |
| `cast_spell` regenerate/prevent | — | częściowe: grant_protection ma okno, ale regenerate jako czar? (np. z efektu) nie |
| 169 typów efektów | effects.js | 78 wzmiankowane w bocie, 91 pozostałych do klasyfikacji |

## Etapy tej sesji

### 0. Start i audyt poprzedniego PR (ten commit)
- [x] PR sesji utworzony (branch push, commit planu + audytu)
- [x] Audyt PR #78 zapisany w `docs/audits/AUDYT_PR78_2026-08-26.md`
- [x] Baza zmierzona: `npm test` 3358/3358, build 54 / 2710.9 kB
- [x] Plan kontynuacji zapisany
- [ ] Commit + push (osobny, tylko dokumenty) — ADR 0020 C

### 1. Etap 3 — keywordy (flying/reach/first strike/double strike)
Kryteria właściciela:
- flying na atakujących gdy WRÓG NIE MA latających/reach; jeśli ma — brak wartości (chyba że latający bloker jest słabszy — wariant drugorzędny)
- reach tylko blokującym PRZED ustaleniem bloków; `cantBlock` wyklucza wartość
- first_strike/double_strike: value tylko gdy zmienia wynik walki (helper z Etapu 2)

Zadania:
- [ ] Helper `enemyCanBlockWithFlyingOrReach(view, recipient)` — czy wróg ma nietapniętego flyera/reach mogącego zablokować `recipient`
- [ ] Helper `enemyHasFlyingBlocker(view)` — czy wróg ma jakiegokolwiek flyera/reach
- [ ] `keywordGrantWindowValue` — flying: premia tylko gdy `!enemyCanBlockWithFlyingOrReach`; reach: dodać `cantBlock` + tylko przed deklaracją bloków; first_strike/double_strike: `pumpChangesOutcome` z delta mocy 0 ale ze zmianą first_strike (symulacja wyniku)
- [ ] Testy RED→GREEN: flying vs brak flyerów (grant), flying vs flyer wroga (brak), reach na `cantBlock` (brak), FS zmieniający/niezmieniający wynik (1/1 vs 1/1, 2/2 vs 1/1)
- [ ] `npm test` + `npm run build` → commit + push

### 2. Etap 4 — regenerate + scry/surveil w czarach
- [ ] `regenerate`: nowa gałąź wyceny w `activate_ability` i `cast_spell` (jeśli efekt regenerate) — wartość tylko gdy stwór ZAGROŻONY (zadeklarowany atak/blok z lethal, albo efekt destroy/exile w zasięgu many wroga); poza zagrożeniem — kara (jak M146)
- [ ] `cast_spell` scry/surveil: okno jak M211 (end step przeciwnika = +, wczesne okno = kara) — osobno instant/sorcery; sorcery nie czeka na turę przeciwnika
- [ ] Testy RED→GREEN: regenerate zagrożony (atak 1/1 vs 2/2), regenerate niezagrożony (brak ataku), scry instant w end step przeciwnika (wartość), scry w main1 (kara)
- [ ] `npm test` + `npm run build` → commit + push

### 3. Etap 5 — audyt katalogowy 169 typów efektów
- [ ] Klasyfikacja 91 typów bez bezpośredniej wzmianki w bocie: „nie dotyczy (wewnętrzny/koszt/replacement)” / „wyceniane pośrednio (allEffectsInertNow, selfHarmPenalty, klamry)” / „LUKA → zadanie”
- [ ] Tabela w `docs/audits/INWENTARZ_WYCENY_BOTA_2026-08-26.md`
- [ ] Naprawy małych luk jeśli znajdą się (osobny commit)
- [ ] `npm test` + `npm run build` → commit + push

### 4. Etap 6 — benchmark + zamknięcie
- [ ] `node tools/benchmark.mjs` (profil szybki, ADR 0018 — BEZ --full)
- [ ] Porównanie z `tools/b1-final-*.json` (notatka, bez podnoszenia progów bez pełnej B0)
- [ ] Aktualizacja `docs/PROJECT_HISTORY.md`, handoff `HANDOFF_2026-08-26-m218-kontynuacja.md`, opis PR
- [ ] `npm test` + `npm run build` → commit + push

## Kolejność commitów (wszystkie samodzielnie zielone)

1. `M218/0: audyt PR #78 + roadmapa kontynuacji (ADR 0020, przed kodowaniem)`
2. `M218/3: keywordy (flying/reach/first strike) — logiki właściciela + testy`
3. `M218/4: regenerate + scry/surveil w czarach — okna i zagrożenie + testy`
4. `M218/5: inwentaryzacja 169 typów efektów + tabela audytowa`
5. `M218/6: benchmark szybki + podsumowanie sesji`

## Ryzyka i pułapki

- **L64 (faza ≠ moment)** — nie wystarczy `phase === 'combat'`; reguła: STAN (`attacking || blocking`), nie etykieta kroku.
- **L3 (kara musi przebić premię)** — przy „pump nie zmienia wyniku” kara/brak premii musi zepchnąć wariant poniżej passu.
- **L41 (bliźniacze gałęzie)** — każda nowa reguła idzie do WSPÓLNEGO helpera (`combatTrickWindow`, `pumpChangesOutcome`, `keywordGrantWindowValue`), użytego w `cast_spell` ORAZ `activate_ability`; nie kopiować logiki.
- **L42 (efekt „do końca tury” + zegar)** — wycena zawsze razem z oknem.
- **L48 (oferta vs walidacja)** — helpery czytają WYŁĄCZNIE `PlayerView` (ADR 0017); nie sięgać do stanu silnika.
- **ADR 0002** — zero nazw/ID kart w regułach; helpery po deskryptorach (keyword, `cantBlock`, typy efektów).
- **ADR 0018** — pełny B0 tylko na komendę; profil szybki wystarczy.
- **ADR 0022** — karty katalogu są w 100% Oracle; nie zmieniamy kart, tylko wycenę.
- **Procedura push:** przed każdym pushem `git fetch origin <gałąź>` + porównanie HEAD..FETCH_HEAD (ADR 0020 D), nigdy force push.
