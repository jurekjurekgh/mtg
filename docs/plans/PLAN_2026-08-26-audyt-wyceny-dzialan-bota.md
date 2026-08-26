# PLAN 2026-08-26 — Audyt heurystyki i wyceny działań bota wg grup czarów/zdolności

- **Sesja:** `arena/01a038fe-mtg`, PR **#78** (kontynuacja; PR otwarty od M205)
- **Tryb:** ADR 0020 (A–D) + ADR 0021. Żadnych nowych kart — zlecenie właściciela
  dotyczy wyceny DZIAŁAŃ istniejącego katalogu.
- **Baza zmierzona przed pracą:** `npm test` **3336/3336** (~2:17),
  `npm run build` **54 moduły / 2698,8 kB**, `HEAD` = `4756567` (M217),
  zgodność z `origin/arena/01a038fe-mtg` potwierdzona (fetch: 0/0).

## Zlecenie właściciela (kryteria akceptacji)

Rygorystyczny, szczegółowy przegląd heurystyki/wyceny bota w **grupach**
czarów i zdolności. „Proste zasady typu «mam manę»" nie wystarczą — każdy typ
ma optimum efektywności w ściśle określonych sytuacjach:

1. **Bojowe pumpy/debuffy** — sens wyłącznie w konkretnych sytuacjach
   bojowych; czary/zdolności **instant** TYLKO w fazie walki, TYLKO **po
   deklaracji atakujących** (wzmacnianie ataku) i **po deklaracji
   blokujących** (wzmacnianie bloku).
2. **Meaningfulness** — pump, który NIE zmienia wyniku walki, nie ma wartości
   (przykład właściciela: atakujący 1/1 blokowany przez 5/5, +2/+2 nic nie
   daje). Weryfikować wynik walki przed i po.
3. **Keywordy mają własną logikę** — flying na atakujących, gdy przeciwnik
   nie ma latających; reach tylko na blokujących PRZED ustaleniem bloków;
   first strike analogicznie.
4. **Sorcery, scry, regenerate** itd. — odrębne ścieżki optymalnego użycia.
5. Podzielność na etapy/sesje z odhaczaniem — dopuszczalne, plan musi być
   kontynuowalny.

## Wyniki rozpoznania (stan 2026-08-26, przed zmianami)

`src/controllers/heuristic-bot.js` (3223 linie) — `scoreCommand` (l. 852):
jeden switch po `cmd.type`; `commandFamily` (l. 795) → wagi `weightedScore`
(l. 846). Gałęzie istotne dla zlecenia:

| Obszar | Linie | Stan |
|---|---|---|
| `cast_spell` pump (pojedynczy) | 1656–1685 | **A1: LUKA** — `inCombat = phase === 'combat'`, bez `participatesInCombat` i bez wykluczenia `beginning_of_combat` |
| `cast_spell` mass buff (`buff_creatures_you_control`/`buff_*`) | 1542–1549 | **A2: LUKA** — ta sama bramka `phase === 'combat'` |
| `cast_spell` negative pump (debuff wroga) | 1637–1642 | **A3: LUKA** — `+25 + 4*|x|` bez okna i bez meaningfulness |
| `activate_ability` pump | 1870–1930 | ✅ naprawione w M206 (`participatesInCombat` + `step !== 'beginning_of_combat'`) — wzorzec do przeniesienia |
| `keywordGrantWindowValue` | 812–845 | **A4: LUKA** — flying nagle skacze +2+power przy `attacking` bez sprawdzenia latających/reach wroga; reach nie sprawdza `cantBlock`; first_strike bez meaning |
| `regenerate` | — | **A5: LUKA** — brak gałęzi wyceny (tylko k=40 w `FRIENDLY_TARGET_EFFECTS` i lista STACKING); brak modelu „zagrożenie" |
| `scry`/`surveil` jako CZAR | — | **A6: częściowe** — M211 naprawił wycenę w `activate_ability` (DECK_ARRANGING_EFFECTS); w `cast_spell` brak gałęzi |
| `declare_attackers` | 2389+ | ✅ reference: helpery `attackerCanBeBlocked`/`diesBeforeDealingDamage`/`attackerStrikesFirst` (l. 39–78) — **nieużywane w wycenie pumpów** |
| `declare_blockers` | 2584+ | ✅ reference: wycena multi-block, lethal, B3 (pump wroga) |

Kluczowa obserwacja: **naprawa M206/L64 objęła tylko `activate_ability`**;
bliźniacza gałąź `cast_spell` (czary-instanty) zachowała dokładnie ten sam
błąd (`phase === 'combat'` obejmuje `beginning_of_combat`, `end_of_combat`,
a nawet `declare_attackers` bez udziału stwora w walce). To L64 w czystej
postaci — i cel nr 1 tego zadania.

**Inwentaryzacja efektów silnika:** 169 typów `effect.type` w
`src/engine/effects.js`; bot ma bezpośrednie wzmianki o 78. 97 pozostałych
wymaga klasyfikacji „nie dotyczy decyzji / wyceniane pośrednio / LUKA" —
wykonujemy w Etapie 5 (audyt katalogowy; nie blokuje Etapów 1–4).

## Etapy

### 0. Roadmapa i baza (ten commit)
- [x] PR #78 istnieje (ADR 0020 A — kontynuacja tej samej gałęzi/sesji).
- [x] `git fetch` — HEAD = origin, 0/0 (ADR 0020 D).
- [x] Baza zmierzona: `npm test` 3336/3336, build 54/2698,8 kB.
- [x] Plan zapisany w `docs/plans/PLAN_2026-08-26-audyt-wyceny-dzialan-bota.md`.
- [ ] Commit + push (osobny, tylko dokument).

### 1. Wspólny helper okien walki + naprawa A1/A2 (L64 w czarach) ✅
Kryteria: testy RED→GREEN w stylu M206, ale dla CZARÓW (nie zdolności).
Cel: `beginning_of_combat`/`end_of_combat`/`upkeep`/`main2` — brak pumpu;
`declare_blockers` z udziałem w walce — pump.
- [x] Helper `combatTrickWindow(view, recipient)` — uczestnictwo z
  `view.combat` (atakujący z listy, blokerzy z mapy `blockers`), nie nazwa
  fazy; wspólny dla `cast_spell` i `activate_ability` (L41: jedna reguła,
  jeden odczyt).
- [x] `cast_spell` pump → helper; usunięte bezwarunkowe `!myTurnNow → 12`
  (upkeep wroga = jałowe okno; M206/A1c dla zdolności).
- [x] `cast_spell` mass buff (`buff_*`) → helper + rozróżnienie instant/sorcery
  (sorcery: Główna 1 przed atakiem, inaczej −60).
- [x] `activate_ability`: M206 czytał `recipient?.blocking`, którego widok NIE
  wystawia (tylko `entry.attacking` z `state.combat.attackers`) — bloker
  wyglądał na nieuczestniczącego; przesiadka na wspólny helper (1i: bloker
  1/1 vs 2/2 → pump).
- [x] Testy: `test/m218-audyt-wyceny-pumpow.test.js` — 10 scenariuszy
  RED→GREEN (1a–1e czar-pump, 1f–1h masowy debuff, 1i–1j zdolność/bloker).
- [x] `npm test` **3346/3346** (3336 + 10 nowych) + build **54 modułów /
  2701,5 kB** → commit M218/1 + push.

### 2. Meaningfulness pumpów (A3 + A8)
Kryterium właściciela: pump niezmieniający wyniku walki = 0 wartości.
- [ ] Helper `pumpChangesOutcome(view, recipient, {power, toughness})`:
  symulacja pojedynczej walki (atakujący/blokujący z `view.combat`,
  blockerzy wg mapy `blockers`, `damage` obiektów, first/double strike,
  deathtouch) — wynik „kto ginie, ile obrażeń przechodzi" przed i po.
- [ ] Wpięcie do `cast_spell` pump: wartość tylko gdy wynik się zmienia
  (atakujący zabija/przeżywa/robi obronę; bloker przeżywa/zabija).
  Przykład właściciela: 1/1 vs 5/5 → pomimo okna wartość ~0, nie rzucamy.
- [ ] Negative pump (debuff wroga, 1. 1637): okno walki + meaningfulness
  (osłabienie zmienia wynik — np. 5/5 schodzi do 3/5 i ginie od 4/4).
- [ ] Testy RED→GREEN: 1/1 vs 5/5 (bez pumpu), 1/1 vs 1/1 (pump decyduje),
  debuff 5/5 vs 4/4 (znaczący), debuff 5/5 vs 2/2 (jałowy).
- [ ] `npm test` + build → commit + push.

### 3. Keywordy — własne logiki (A4)
Kryteria właściciela: flying na atakujących gdy WRÓG NIE MA latających;
reach tylko blokującym PRZED ustaleniem bloków; first strike analogicznie.
- [ ] `keywordGrantWindowValue` — flying: premia tylko gdy
  `!enemyCanBlockWithFlyingOrReach(view, recipient)` (lub gdy latający
  bloker wroga jest słabszy — wariant drugorzędny; do decyzji przy
  implementacji, wymagany test).
- [ ] reach: dodać `cantBlock` z widoku (l. 827 sprawdza tylko `tapped`).
- [ ] first_strike/double_strike: value tylko gdy zmienia wynik walki
  (helper z Etapu 2 — atakujący „ginie zanim zada" vs „zada i przeżyje").
- [ ] Testy: flying vs brak flyerów (grant), flying vs flyer wroga (brak),
  reach na `cantBlock` (brak), FS zmieniający/niezmieniający wynik.
- [ ] `npm test` + build → commit + push.

### 4. Regenerate + scry-czary (A5/A6)
- [ ] `regenerate`: nowa gałąź wyceny — wartość tylko gdy stwór jest
  ZAGROŻONY w tej turze (zadeklarowany atak/blok z lethal, albo efekt
  destroy/exile w zasięgu many wroga); poza zagrożeniem — kara (przedwczesny
  wydatek, jak M146).
- [ ] `cast_spell` scry/surveil: okno jak M211 (end step przeciwnika = +,
  wczesne okno = kara) — osobno dla instanta i sorcery (sorcery nie czeka).
- [ ] Testy RED→GREEN.
- [ ] `npm test` + build → commit + push.

### 5. Audyt katalogowy (169 typów efektów)
- [ ] Klasyfikacja 97 typów bez bezpośredniej wzmianki w bocie:
  „nie dotyczy (wewnętrzny/koszt/replacement)" / „wyceniane pośrednio
  (`allEffectsInertNow`, `selfHarmPenalty`, klamry)" / „LUKA → zadanie".
- [ ] Tabela w `docs/audits/INWENTARZ_WYCENY_BOTA_2026-08-26.md`.
- [ ] Naprawy z kategorii „LUKA" jeśli małe; większe → kolejny etap/sesja.

### 6. Benchmark + podsumowanie
- [ ] `node tools/benchmark.mjs` (profil szybki, ADR 0018 — BEZ `--full`).
- [ ] Porównanie z `tools/b1-final-*.json` (walka o progi: tylko notatka,
      bez podnoszenia progów bez pełnej B0).
- [ ] Aktualizacja: `docs/PROJECT_HISTORY.md`, opis PR #78,
      podsumowanie w tym planie.

## Kolejność commitów (wszystkie samodzielnie zielone)
1. `M218: plan audytu wyceny działań bota — roadmapa (ADR 0020, przed kodowaniem)`
2. `M218/1: okna walki w czarach (L64 w cast_spell) — helper + testy RED→GREEN`
3. `M218/2: meaningfulness pumpów — symulacja wyniku walki`
4. `M218/3: keywordy (flying/reach/first strike) — logiki właściciela`
5. `M218/4: regenerate + scry/surveil w czarach`
6. `M218/5: inwentaryzacja 169 typów efektów + tabela audytowa`
7. `M218: benchmark szybki + podsumowanie sesji`

## Ryzyka i pułapki
- **L64 (faza ≠ moment)** — nie wystarczy `phase === 'combat'`; reguła: STAN
  (`attacking || blocking`), nie etykieta kroku. Test `attacking` ustawiony
  wprost na obiekcie NIE działa — widok wyprowadza z `state.combat` (M206).
- **L3 (kara musi przebić premię)** — przy wartościowaniu „pump nie zmienia
  wyniku" kara/brak premii musi zepchnąć wariant poniżej passu.
- **L41 (bliźniacze gałęzie)** — każda nowa reguła idzie do WSPÓLNEGO
  helpera (`combatTrickWindow`, `pumpChangesOutcome`), użytego w
  `cast_spell` ORAZ `activate_ability`; nie kopiować logiki.
- **L42 (efekt «do końca tury» + zegar)** — wycena zawsze razem z oknem.
- **L48 (oferta vs walidacja)** — helpery czytają WYŁĄCZNIE `PlayerView`
  (ADR 0017); nie sięgać do stanu silnika.
- **ADR 0002** — zero nazw/ID kart w regułach; helpery po deskryptorach
  (keyword, `cantBlock`, typy efektów).
- **ADR 0018** — pełny B0 tylko na komendę; profil szybki wystarczy.
- **ADR 0022** — karty katalogu są w 100% Oracle; nie zmieniamy kart,
  tylko wycenę.
- Podczas pracy kontrolować HEAD przed każdym push (ADR 0020 D: fetch +
  porównanie, nigdy force push).
