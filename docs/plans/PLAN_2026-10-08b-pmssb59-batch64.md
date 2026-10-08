# PLAN PMSSB-59 — pętla jakości dla mechanik batcha 64 (2026-10-08)

Zlecenie właściciela (po batchcie 64): „teraz poproszę pętlę PMSSB dla mechanik
nowych kart". Gałąź `arena/6b9bb8b8-mtg`, PR #158 (ta sama sesja — AGENTS.md
„1 sesja = 1 gałąź = 1 PR"). Plan commitem PRZED kodem (ADR 0020 A/C).

 precedens: PMSSB-58 (`docs/audits/PMSSB58_BATCH63_2026-10-05.md`) — sam komplet
10/10 kart w engine nie był kompletem PMSSB; poniżej odrębne dowody jakości.

## 1. Zakres — mechaniki nowe w batchcie 64

Karty (artId): 261 Universal Solvent (CMR), 263 Man-o'-War (MH1), 266 Druid of
the Cowl (M19), 269 Scouting Hawk (CLB), 280 Sultai Scavenger (KTK), 323
Quandrix Campus (STX), 324 Spineseeker Centipede (DSK), 325 Narset's Rebuke
(TDM), 327 Brave-Kin Duo (BLB), 328 Bog Hoodlums (LRW).

Generycznie NOWE elementy silnika (ADR 0002 — testujemy po typie efektu i
deskryptorze, nie po nazwie karty):

| # | Mechanika | Gdzie | Nowość |
|---|---|---|---|
| M1 | aktywowane `destroy_permanent` na DOWOLNY permanent | `activate_ability` | jedyna karta z celem `permanent` w katalogu |
| M2 | pompka „do końca tury" z **ograniczeniem sorcery** | `activate_ability` | pierwsza sorcery-speed pump w katalogu |
| M3 | zdolność many na STWORZE (tap za {G}) | `activate_ability` | nowy nosiciel w rodzinie many |
| M4 | clash z nagrodą licznikiem | `resolve_clash_choice` + `counterOnWin` | nowy kształt decyzji |
| M5 | Keen Sight (warunek triggera) | `conditionHolds` | nowy warunek |
| M6 | delirium jako warunek STATYCZNY | `staticConditionHolds` | nowy konsument licznika typów |
| M7 | „Add {U}{R}{W}" (trzy jednostki many) | `add_mana` ×3 | nowy kształt efektu |
| M8 | ląd z wpisem MANA_SOURCE_MAP + skrut | `play_land` / `activate_ability` | kolejny wpis mapy |

## 2. Metoda

- Sceny na RZECZYWISTYM silniku (`createGameState` + `addObject` +
  `playerView`), komendy wybrane przez prawdziwego bota (`createHeuristicBot`,
  seed zamrożony, `randomness = 0`, `lookahead = 0` — konfiguracja produkcyjna
  z `session.js`). Punkty per wariant z `bot.trace()`.
- Izolacja wartości przez kontrfaktyk: ta sama karta z USUNIĘTYM efektem,
  przy niezmienionym ciele i koszcie (wzorzec PMSSB-58 §1).
- **Pułapka metodyczna (kosztowna, zapisuję dla następnych pętli):** karty
  właściciela NIE są w `REAL_CARDS` — siedzą w `VIRTUAL_BASIC_LANDS`
  (`card-data.js`, 418 wpisów mimo nazwy). Kontrfaktyczny rejestr budowany ze
  `REAL_CARDS` dla tych kart jest NIESKUTECZNY (override przepada), więc
  wszystkie porównania wychodzą zerowe i wyglądają jak „brak wyceny". Trzeba
  modyfikować `VIRTUAL_BASIC_LANDS` (albo `createRegistry([...])` z własną
  kopią). Pierwszy przebieg pomiarów M5/M6 przez to padł — powtórzony.
- Bramki: `npm test` (fast) i `node tools/run-tests.mjs all` (pełny pakiet CI)
  + `npm run build`, cicho, per commit (ADR 0020).

## 3. Findingi PRZED (stan na `ab68fa8` + `a15275e`)

| ID | Pomiar | Przyczyna / zakres |
|----|--------|--------------------|
| **F1** | Universal Solvent: 10 many, wrogi 4/4 na stole → `pass_priority`. Wariant aktywacji **−5** dla celu 4/4, **−5** dla 1/1, **−5** dla lądu (cel NIE ma znaczenia); wariant we własny permanent −95 | W ścieżce `activate_ability` twarde usuwanie (`destroy_permanent`, `exile_permanent`) nie ma PREMII za cel wroga — wyceniana jest tylko rodzina `BOUNCE_STRENGTH` (`P.removalEnemyBase + P.removalWorthWeight × worth + enemyRemovalTargetBonus`). W ścieżce `cast_spell` ten sam typ efektu jest wyceniany skalą ofiary. Kara za własny cel (−90) działa, więc asymetria jest jednostronna: płaci się koszt ({7} + tap + poświęcenie ≈ −95) i nie dostaje niczego. Klasa L41 (bliźniacze gałęzie rozjechane) + L50 (brak wyceny → remis → dominuje koszt) |
| **F2** | Brave-Kin Duo: 3 many, własny 2/2 na stole, main1 → `pass_priority`; aktywacja **−28** (wariant we własnego stwora −57) | Dwie kary nakładają się na jedyny legalny okres tej zdolności: (a) „pump «do końca tury» poza walką w mojej turze −26" — reguła pisana dla sztuczek INSTANT-speed, które można odłożyć do walki; zdolność sorcery-speed nie ma późniejszego okna; (b) „tap kosztem ataku −(moc+3)" liczy utratę ataku na **ODBIORCY** pompki, choć tapnięte jest ŹRÓDŁO (Duo) — odbiorca atakuje dalej |
| **F3** | Druid of the Cowl: 0 many, Shock w ręce, wrogi 2/2 → `pass_priority`; aktywacja **−6** | Zdolność many na stworze nie jest opłacana automatycznie (inaczej niż `tap_for_mana` lądów — M101/A: lądy tapię się przy płatności), a wycena nie rozumie „odblokowanie rzutu": −8 za tapnięcie ciała (utrata blokera) przeciw wartości many 0. Rodzina istnieje w katalogu (Apprentice Wizard, Scorned Villager, Soulbright Flamekin), więc defekt jest wiodący, nie tylko batch64 |
| **F4** | Bog Hoodlums: rzut → `cast_permanent` (+64,8); clash rozstrzygany sensownie (karta o wartości trzymana/odrzucana wg `cardKeepValue`) | BRAK defektu — kontrola dodatnia. `cantBlockPrinted` nie zabrania ataku (strażnik M379/C pilnuje tylko instalacji talii) |
| **F5** | Scouting Hawk: rzut +73,8 zarówno gdy trigger PYJ (wróg 4 lądy, bot 0), jak i gdy nie pyj — wkład triggera **+9** (`searchToBattlefieldBase` 10 × waga 0,9), potwierdzony kontrfaktyką | BRAK defektu wyceny — kontrola dodatnia. ALE: przy bibliotece < 21 kart rzut spada do −72 (podatek „search = drenaż biblioteki" idzie PEŁNĄ drabiną `libraryLossPenalty`, podczas gdy jednorazowy drenaż ETB tego samego rozmiaru — Rager draw 1 — idzie drabiną `oneShotDeckOutPenalty` „tylko deck-out"). Nieścisłość wobec własnego komentarza w kodzie; w realnej partii (biblioteka ~50) nie dotkliwe |
| **F6** | Quandrix Campus: `play_land` (+), skrut 1 za {4} → −14 (nigdy) | Uznane za ZACHOWANIE POPRAWNE: skrut kosztem tapu lądu produkcyjnego w mojej turze, gdy mana jest sporna — strata tempa. Bez zmiany |
| **F7** | Narset's Rebuke: 6 many, wrogi 5/5, Shock w ręce → `cast_spell(rebuke->foe)` 82 (najlepszy wariant) | BRAK defektu — kontrola dodatnia |

## 4. Fale napraw (każda z testem i dowodem mutacyjnym)

**Fala A — F1 (usuwanie w ścieżce zdolności).** W `activate_ability` dodać
gałąź twardego removalu lustrzaną do `BOUNCE_STRENGTH`: cel wroga →
`P.removalEnemyBase + P.removalWorthWeight × worth + enemyRemovalTargetBonus`,
cel własny → −90 (+ istniejące `selfHarmPenalty` nie może podwajać), czysty ląd
→ `P.removalPureLandPenalty`, regeneracja → pomijać premię (jak `cast_spell`).
Typy: ten zestaw co `REMOVAL_EFFECTS` w ścieżce czarów (L41 — jeden zestaw, nie
kopia). Pin: Universal Solvent aktywuje się na wrogim 4/4 przy 10 many i NIE
aktywuje przy 3 many; cel 1/1 < cel 4/4 (skala ofiary); własny cel karany.

**Fala B — F2 (sorcery-speed pump + tap na źródle).** Dwie zmiany w bloku
pompowym `activate_ability`: (a) gdy `ability.timing === 'sorcery'`, kara „poza
walką w mojej turze" nie należy się — jedyne okno tej zdolności jest w głównej
fazie; zamiast tego premiujemy intencję ataku (`intendsToAttackThisTurn`) i
karamy jałowość bez niej; (b) utratę ataku za tap liczymy na TAPNIĘTYM
permanencie (źródło), nie na odbiorcy — inaczej zdolność pompująca innego stwora
płaci za atak, którego nie odbiera. Pin: Duo pompuje 2/2 w main1 przy zamiarze
ataku i nie pompuje bez celu do ataku.

**Fala C — F3 (many ze stworów).** Dla zdolności, której efekty to wyłącznie
`add_mana`: gdy odblokowuje ona w ręce ZAGRALNĄ kartę (ten sam rachunek co
`manaUnlockCandidates`, L41), dodać wartość odblokowania zamiast kary za
tapnięcie ciała. Pin: Druid tapowany, gdy w ręce jest czar do rzucenia i many
braka; nie tapowany, gdy w ręce nie ma nic zagralnego.

**Fala D — F5 (podatek biblioteczny za ETB-search).** Sprawdzić i — jeśli
potwierdzi się niezgodność z komentarzem — przełączyć jednorazowy ETB-search na
drabinę „tylko deck-out" (`oneShotDeckOutPenalty`), tak jak jednorazowy drenaż
ETB (Rager/Skaab). Decyzja po pomiarze: czy próg 20 słusznie karze rzut karty,
która zabiera 1 kartę z biblioteki i dokłada permanent.

## 5. Kryteria ukończenia

- [ ] Fala A zielona + pin mutacyjny (usunięcie gałęzi = czerwień)
- [ ] Fala B zielona + pin mutacyjny
- [ ] Fala C zielona + pin mutacyjny
- [ ] Fala D: werdykt + ewentualna zmiana z pinem
- [ ] kontrole dodatnie (F4/F7) zapisane jako testy — regresja nie może wyceny
      „naprawić" w drugą stronę
- [ ] `npm test` i `node tools/run-tests.mjs all` + `npm run build` zielone
- [ ] raport `docs/audits/PMSSB59_BATCH64_2026-10-08.md`, wpis w `PMSSB.md`,
      historia, opis PR #158
- [ ] push na `arena/6b9bb8b8-mtg` (bez force-push, bez merge, nic na `main`)
