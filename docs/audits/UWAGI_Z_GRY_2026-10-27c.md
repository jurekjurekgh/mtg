# Uwagi właściciela z gry — 2026-10-27c (PR #177)

> Sesja: gałąź `arena/d5e963c4-mtg`, [PR #177](https://github.com/jurekjurekgh/mtg/pull/177).
> Plan: [PLAN_2026-10-27c](../plans/PLAN_2026-10-27c-audyt-pr176-petla-jakosci.md).
> Wejście: cztery uwagi właściciela z rozgrywki (A–D), wszystkie do naprawy
> w tym samym PR. Metoda (ADR 0020 C): rozpoznanie na żywym silniku → naprawa
> u root cause (ADR 0002/0016) → pin czerwieniejący bez naprawy + mutacja
> sprawdzona eksperymentalnie → osobny commit.

## Podsumowanie

| Uwaga | Objaw | Root cause | Naprawa | Commit |
|---|---|---|---|---|
| **A** | Fathom Fleet Cutthroat rzucany w Głównej 1 — ETB nigdy nie działa | reguła „czekaj na Główną 2" znała tylko `entersWithCountersIf.morbid`; `etbEnemyHasTarget` uznawał cel „obrażony w tej turze" za spełniony przez samo ISTNIENIE wrogiego permanentu | rodzina ETB z celem wymagającym stanu z tej tury czeka na Główną 2, wspólny predykat `dealtDamageThisTurn` | `4151064` |
| **B** | opłata zdolności many z własnym kosztem (Apprentice Wizard, ląd „{1},{T}: Add {G}") tapowała lądy deterministycznie | `onTapSource` kreatora wysyłał `activate_ability` prosto do silnika → auto-tap `spendMana` | kreator PODRZĘDNY na koszt aktywacji + powrót do nadrzędnego | `5affe89` |
| **C** | bot z 1/2 nie blokował niczego przy ataku 3/2 + 1/2 + 1/3 | blok bezkosztowy dawał `+1 −1 = 0` → remis z passem rozstrzygała kolejność ofert | premia `blockFreeAbsorbBonus` za wchłonięte obrażenia bez utraty ciała | `8b2ddeb` |
| **D** | Cuombajj Witches zabiła Cenn's Tactician, który miał walczyć z mojego Time to Feed | brak wyceny slotu wskazywanego przez przeciwnika; brak wiedzy, że cel ma rozstrzygnąć mój własny obiekt na stosie | `isMyPendingStackTarget` + `opponentChosenDamageCost` + model „zasobu ryzykownego" | `6d3e1fd` |

Wszystkie cztery naprawy są w warstwie **wyceny/decyzji bota** albo **UI
płatności** — żadna nie zmienia legalności ruchów (L57), więc katalog
`support: supported` i walidacja silnika zostają nietknięte.

## A — ETB „cel obrażony w tej turze" musi poczekać na Główną 2

**Oracle** (karta z katalogu, `src/cards/card-data.js`): Fathom Fleet Cutthroat
— „When this creature enters, destroy target creature an opponent controls that
was dealt damage this turn."

**Objaw (sonda, `probe-abcd.mjs`)**: w Głównej 1, przy nietkniętym stworze
przeciwnika, bot wybierał `cast_permanent`. Trigger nie miał legalnego celu,
więc w ogóle nie wchodził na stos (CR 603.3d — zdolność triggerowana wymagająca
celu nie jest kładziona bez celu), a karta i mana przepadały. Efekt: karta
leżała w ręce, dopóki nie było „okazji", a gdy bot ją rzucał — tracił ETB.

**Root cause**: preferencja Głównej 2 była zaszyta w warunku
`def?.entersWithCountersIf?.morbid === true` (jedna karta-rodzina), a bramka
dostępności celu ETB (`etbEnemyHasTarget`) dla specy „obrażony w tej turze"
spadała do gałęzi domyślnej `foes.length > 0` — czyli uznawała cel za
istniejący, mimo że żaden wrogi stwór nie oberwał. Premia ETB (18) była więc
przyznawana za trigger, który nie mógł się odpalić.

**Naprawa** (`src/controllers/heuristic-bot.js`):
1. `etbEnemyHasTarget` ma jawną gałąź dla `creature_opponent_damaged_this_turn`
   (stwór wroga z obrażeniami w tej turze),
2. wspólny predykat `dealtDamageThisTurn(object)` — L41: ta sama wiedza dla
   oferty celu ETB (`publicEtbTargets`) i dla bramki wartości ETB,
3. `etbDefersForThisTurnsDamage(view, def)` — rodzina specy celów zależnych od
   zdarzeń tury jest jawna (`THIS_TURN_STATE_TARGET_SPECS`), a reguła
   „poczekaj na Główną 2" rozciąga się na nią; **wyjątek**: cel już istnieje
   (czekanie byłoby stratą tempa). Reguła czyta deskryptor i stan stołu, nie
   nazwę karty (ADR 0002).

**Pin**: `test/audyt-pr177-a-etb-uszkodzenie-w-turze.test.js` (3 testy):
Główna 1 → `pass_priority`, Główna 2 z obrażonym celem → `cast_permanent`,
cel już obrażony w Głównej 1 → rzut od razu, plus kontrola braku nadgorliwości
(vanilla stwór w Głównej 1 nadal rzucany). Mutacje: usunięcie rozszerzenia
reguły **RED**, usunięcie gałęzi w `etbEnemyHasTarget` **RED**.

## B — koszt aktywacji zdolności many płaci drugi kreator

**Oracle**: Apprentice Wizard — „{U}, {T}: Add {C}{C}{C}." Lądy-konwertery
(np. „{1}, {T}: Add {G}") mają ten sam kształt: zdolność many z kosztem many.

**Objaw**: gracz otwiera kreator płatności czaru, sięga po zdolność many —
a koszt tej zdolności opłaca **auto-tap silnika** (`spendMana` sortuje źródła
własną kolejnością). Gracz nie decyduje, które lądy płacą {U}/{1}, a kreator
pierwotnego czaru nie wie, że trwa druga płatność.

**Root cause**: `onTapSource` w `src/table/main.js` wysyłał komendę
`activate_ability` wprost przez `playDirect`. Model płatności (M311) już
doliczał koszt aktywacji do zapotrzebowania, ale **wykonanie** nie miało
drugiego kreatora.

**Naprawa** (warstwa UI, silnik bez zmian):
- `manaSourceTapPlan(source)` — czysta funkcja: źródło z `activationCost`
  wymaga kreatora podrzędnego,
- stos `manaWizardParents` + `openNestedManaWizard` / `returnToParentManaWizard`:
  koszt aktywacji zbiera osobny kreator, po jego dokończeniu gra wraca do
  kreatora pierwotnego czaru, gdzie produkcja zdolności jest już w puli,
- Anuluj / ✕ / tło w kreatorze podrzędnym **wracają do nadrzędnego** (wstrzymany
  czar nie przepada), a przerwanie akcją z panelu czyści cały stos (M106/Z10),
- `manaWizardFor` sam zamyka się, gdy wyboru nie ma (pula pokrywa koszt albo
  jest jeden kształt płatności) — oferta = walidacja (L48).

**Pin**: `test/audyt-pr177-mana-wizard-koszt-aktywacji.test.js` (5 testów):
plan tapnięcia dla lądu i dla zdolności, model kosztu kreatora podrzędnego
(`totalNeeded`/`requirements` z deskryptora zdolności), semantyka stosu
kreatorów, oraz kontrakt silnika „pula przed auto-tapem" (po zebraniu {U}
aktywacja płaci z puli i **nie** tapuje kolejnego lądu). Mutacja
`nested: false` **RED**. Test M348 dostał `manaSourceTapPlan` do kontekstu vm
(nowa zależność wyjmowanej funkcji).

## C — blok bezkosztowy bije pass

**Objaw**: bot z 1/2 przepuszczał cały atak 3/2 + 1/2 + 1/3 (3 obrażenia),
choć blok 1/2 (albo 1/3) zatrzymywał jedno obrażenie bez żadnej straty.

**Root cause**: wycena bloku sumowała `+absorbedDamage` (1) i `−blockersUsed`
(1), więc blok, w którym nikt nie ginie, dawał **dokładnie 0** — tyle samo co
pass. Remis rozstrzygała kolejność ofert, czyli „nic nie rób".

**Naprawa**: nowe pokrętło `blockFreeAbsorbBonus` (domyślnie 1) — premia za
każde wchłonięte obrażenie, **tylko gdy żadne ciało nie ginie**. Ginący bloker
zostaje przy swojej ostrzejszej drabinie (PMSSB-31 + `blockGoodTradePerPoint`,
L3/L41 — kara/premia musi być liczona względem siebie, inaczej jest martwa).

**Pin**: `test/audyt-pr177-c-blok-bezkosztowy.test.js` (2 testy: blok 1/2 przy
ataku 3/2+1/2+1/3 → jeden blok na atakującego o sile 1; 2/2 vs 3/3 nadal
passuje — brak nadgorliwości). Mutacja `blockFreeAbsorbBonus: 0` **RED**.

**Świadome skutki**: (a) drabinka progów życia w
`test/audyt-pr149-stempel-wygnania.test.js` przesuwa się o +2 w każdym paśmie
(same progi bez zmian — komentarz w teście); (b) golden-master
(`test/bot-scoring-snapshot.test.js`) regenerowany po przeglądzie różnic:
**jedna opcja nie-wybrana** `block[permanent-53<permanent-68]` 1 → 3 na partii
`ravnica-wur|innistrad-wu@1001` tura 18; wybrane komendy (321 decyzji)
i `scoreSum` ścieżki (3185,9745) identyczne — żadna decyzja się nie odwróciła.

## D — Cuombajj Witches: drugi cel wskazuje przeciwnik

**Oracle**: Cuombajj Witches — „{T}: This creature deals 1 damage to any target
and 1 damage to any target of an opponent's choice."

**Objaw (sonda)**: bot rzucał Time to Feed („Target creature you control fights
that creature"), po czym **przed rozstrzygnięciem** aktywował Cuombajj Witches
i zabił wskazanego celu za 1 obrażenie. Czar tracił cel → nie rozstrzygał się
(CR 608.2b), więc 3 many i karta przepadały. Dodatkowo slot wybierany przez
przeciwnika nie był wyceniany **wcale** — bot widział sam zysk.

**Root cause** (trzy niezależne braki):
1. brak wiedzy o WŁASNYM stosie: `damageTargetValue` nie odróżniał celu,
   który ma rozstrzygnąć mój czar/zdolność (cele na stosie są publiczne —
   ADR 0017, `playerView.zones.stack[].targets`),
2. brak wyceny slotu przeciwnika: efekty z `targetIndex` równym długości
   `ability.targets` (silnik dokłada tam wybór przeciwnika, CR 601.2c) nie
   miały `slot` w `cmd.targets`, więc wypadały z pętli bez kary,
3. model „wielorazowego pingu" traktował zdolność jak darmowy zysk.

**Naprawa**:
- `isMyPendingStackTarget(view, targetId)` — zakaz (−90) dobijania celu, który
  ma rozstrzygnąć mój własny obiekt na stosie,
- `opponentChosenDamageCost(view, amount)` — najgorszy realny skutek wyboru
  przeciwnika (dobicie mojego stwora w skali removal, inaczej chip/życie),
  odejmowany od wyniku,
- zdolność z `opponentChoosesTarget` dostaje model **zasobu ryzykownego** (ta
  sama drabina co zasób limitowany): użycie tylko na realny zysk — dobicie
  uszkodzonego stwora albo dociśnięcie gracza przy niskim życiu; „podstrzelenie"
  zdrowego celu jest zabronione.

**Pin**: `test/audyt-pr177-d-cuombajj-wycena.test.js` (6 testów: brak
aktywacji przy moim czarze na stosie — wariant celu taniego i wartościowego,
dobicie gracza przy 4 życiach, dobicie uszkodzonego 2/2, zakaz chipu w zdrowego,
ryzyko przy 2 życiach przeważa nad zyskiem). Mutacje: każdy z trzech składników
osobno **RED**.

## Bramy (zmierzone na końcowym drzewie, L92)

| Brama | Wynik |
|---|---|
| `npm test` | **8998/8998**, EXIT 0 (151 s) |
| `npm run test:slow` | **268/268**, EXIT 0 (352 s) |
| `npm run build` | **76 modułów / 5530,4 kB**, EXIT 0 |
| benchmark quick | 672 mecze, 161 s — heuristic **88,2%** (593/672), aggro 20,2%, random 3,3% |

Wejście sesji (`ae7d9a2`): 8982/8982, 268/268, 76 / 5519,9 kB, heuristic 88,1%
— przyrost +16 pinów (3 + 2 + 6 + 5), reszta w granicach szumu pomiaru.

## Co pozostaje otwarte

1. **O-3** — generyczny trigger `counter_removed` bez „this way" (czeka na
   kartę w katalogu; bez nośnika mechaniki karta syntetyczna w teście).
2. **O-5** — `tools/run-game.mjs:1303` ucina etykiety do 110 znaków
   (usprawnienie narzędzia testera, nie gry).
3. Pełny benchmark B0 (23 400 meczów) — tylko na wyraźne polecenie właściciela
   (ADR 0018).
4. Decyzja o scaleniu PR #177 — właściciel (agent nie scala, ADR 0007/0020).
