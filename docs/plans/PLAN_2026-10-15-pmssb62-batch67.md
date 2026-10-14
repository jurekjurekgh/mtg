# Plan — PMSSB-62: jakościowe domknięcie batcha 67 (10 kart)

Zlecenie właściciela (2026-10-15): pełna pętla PMSSB (metoda M429) dla
wszystkich mechanik nowych kart batcha 67, z ręcznym strojeniem scoringu bota —
z wyjątkiem mechanik, które mają już zamkniętą rodzinę w rejestrze `docs/PMSSB.md`.

## Zakres i pokrycie wstępne (rejestr rodzin)

| karta | mechanika | rodzina w rejestrze | status |
|---|---|---|---|
| 394 Cancel | `counter_spell` | kontry (PMSSB-5) | ZAMKNIĘTA → kontrola dodatnia |
| 380 Artful Maneuver | `pump` + rebound | pump/grant (M96/M173/M179/M218) | ZAMKNIĘTA → kontrola dodatnia |
| 398 Intrepid Tenderfoot | aktywowany `add_counter` w main | liczniki (PMSSB-23) | ZAMKNIĘTA → kontrola dodatnia |
| 397 Render Speechless | reveal-hand → discard + 2× licznik „up to one" | odrzut (PMSSB-6) + liczniki (PMSSB-23) | ZAMKNIĘTA → kontrola dodatnia |
| 371 Spellkeeper Weird | zwrot karty instant/sorcery z grobu | zwroty z grobu (PMSSB-36 „cel własny ETB", PMSSB-58 tryby-grob) | **do zmierzenia** (nowy cel `instant_or_sorcery_card_in_graveyard`) |
| 369 Improbable Alliance | trigger „second card each turn" → token 1/1 U flying | tokeny (PMSSB-2) + dobieranie (PMSSB-3) | **NOWA** — zdarzenie `you_draw_second_card_each_turn` NIE występuje w bocie |
| 391 Wolf's Quarry | 3× token Boar, każdy z `dies` → Food | tokeny (PMSSB-2) + triggery dies (PMSSB-9) | **do zmierzenia** (rider Food na tokenie) |
| 392 Kuldotha Ringleader | battle cry + `mustAttack` | `buff_attacking_creatures` (PMSSB-43) + attak-if-able (508.1d) | ZAMKNIĘTA → kontrola dodatnia |
| 390 Battlefield Butcher | obniżka kosztu AKTYWOWANEJ zdolności za karty-stwory w grobie | koszt aktywacji (PMSSB-34) + obniżki (PMSSB-60/F6 dotyczy CZARÓW) | **NOWA** — bot liczy koszt z definicji (pełne {5}), silnik z grobu ({2}) |
| 378 Sentry Bot | (a) obniżka kosztu CZARU za atakujących, (b) `get_energy` z dynamiczną kwotą, (c) opcjonalna opłata `{E}{E}{E}` | obniżki (PMSSB-60/F6), energia kosztu zdolności (PMSSB-56 — tylko `activate_ability`) | **NOWE** — (a) warunek nieznany botowi, (b) wpis świadomie wyjęty z tabeli ETB, (c) brak modelu kosztu energii na ścieżce triggera |

Wstępne findingi do zmierzenia sondą (z rozpoznania kodu, 2026-10-15):

- **F1** `you_draw_second_card_each_turn` — zero wystąpień w `heuristic-bot.js`;
  permanent, który zamienia co drugą kartę w token, wygląda dla bota jak puste
  zaklęcie (klasa PMSSB-38 „licznik czarów w widoku bota").
- **F2** obniżka kosztu zdolności AKTYWOWANEJ (`perCreatureCardInGraveyard`) —
  bot karze pełnym `ability.cost.mana` (PMSSB-34), silnik pobiera kwotę
  obniżoną (CR 602.2b/601.2f) → bot zaniża wartość aktywacji i nie widzi
  „darmowej" aktywacji przy pięciu kartach w grobie.
- **F3** obniżka kosztu CZARU `perCreatureAttackingYou` — `cardCostReductionForView`
  zna wyłącznie `affinityToEnchantments`, więc Sentry Bot wygląda na pełne
  {4}{W} nawet przy czterech atakujących (S11: oferta i wycena muszą liczyć
  TEN SAM koszt).
- **F4** koszt ENERGII na ścieżce triggera (`trigger.payEnergy`) — model
  „−3 za licznik" istnieje tylko w `activate_ability` (PMSSB-56); decyzja
  `resolve_optional_pay_choice` i antycypacja rzutu nosiciela nie widzą ceny.
- **F5** `get_energy` z `amountFrom` — poza tabelą ETB (świadomy wyjątek E8,
  bo kwota dynamiczna); z widoku da się ją policzyć (`combat.attackers` +
  `defendingPlayerId`), a wartość licznika jest już zamodelowana (PMSSB-56).
- **F6** rider `dies` → Food na tokenie Boara (Wolf's Quarry) — do zmierzenia,
  czy `tokenBodyValue` widzi wartość Food (artefakt, nie stworzenie).


## Pomiar PRZED (sonda `tools/pmssb62-batch67-sonda.mjs`, seed 2067, 2026-10-15)

| # | scenariusz | PRZED | werdykt |
|---|---|---|---|
| F1 | Improbable Alliance — rzut (pełna) | 59,3964 | **równo z kontrfaktem** → trigger drugiej karty niewidoczny |
| F1k | kontrfakt bez `you_draw_second_card_each_turn` | 59,3964 | brak różnicy = finding |
| F2 | Butcher, 0 kart w grobie (koszt {5}) | −3,0000 | aktywacja odrzucana |
| F2 | Butcher, 3 karty w grobie (koszt {2}) | −3,0000 | **bez zmian**, choć silnik liczy {2} |
| F2 | Butcher, 5 kart w grobie (koszt {0}, darmowa) | −3,0000 | **bez zmian** — bot nie widzi, że jest darmowa |
| F2k | kontrfakt bez `costReduction` | −3,0000 | brak różnicy = finding (także: `lose_life_each_opponent` w ścieżce aktywacji nie dolicza wartości — efekt „2 życia każdemu" daje 0) |
| F3 | Sentry Bot, 0 atakujących | 65,7027 | baza |
| F3 | Sentry Bot, 2 atakujących | 69,3027 | +3,6 (obronna wartość blokera, nie obniżka) |
| F3 | Sentry Bot, 4 atakujących | 69,3027 | **nasycone** — obniżka {2} vs {W} nierozróżnialna |
| F3k | kontrfakt bez `costReduction`, 2 atakujących | 69,3027 | brak różnicy = finding (S11) |
| F4 | decyzja o opłacie {E}{E}{E} | 75,0000 vs 15,0000 | **brak wymiaru kosztu** |
| F4k | ta sama decyzja bez kosztu (darmowa) | 75,0000 vs 15,0000 | identyczne = finding (3 liczniki nie różnią się od zera) |
| F4 | antycypacja rzutu: 0 energii / 3 liczniki | 65,7027 / 65,7027 | payoff opłaty nie jest liczony w rzucie nosiciela |
| F6 | Wolf's Quarry — rzut (Boar z `dies` → Food) | 79,9400 | |
| F6k | kontrfakt: token Boar bez triggera śmierci | 79,9400 | brak różnicy = finding |
| F7 | Kuldotha z battle cry — decyzja ataku | `[ring]` | |
| F7k | kontrfakt bez battle cry | `[ring]` | identyczny wybór = finding (nagroda za „inne atakujące +1/+0" nie wchodzi do decyzji) |
| K1 | Cancel na czarze o wysokim wpływie | 108,0000 | kontrola dodatnia ✓ |
| K2 | Spellkeeper — zwrot instantu z grobu | 0,0000 i wybrana | kontrola dodatnia ✓ (najniższa wartość, ale > pass) |
| K3 | Shipwreck Moray — aktywacja {E} | −25,0000 | kontrola: kara za {E} działa w `activate_ability` |

## Fale (każda = osobny commit)

- **Fala A — pomiar PRZED:** `tools/pmssb62-batch67-sonda.mjs` + tabela w tym
  planie (scenariusze: 6 findingów + 4 kontrole dodatnie).
- **Fala B — energia:** wspólny model kosztu liczników (L41: `activate_ability`
  ↔ `resolve_optional_pay_choice` ↔ antycypacja rzutu) + wartość `get_energy`
  z dynamiczną kwotą liczona z widoku, ale TYLKO gdy własna talia ma konsumenta
  energii (`ownDeck`, wzorzec Rakish z PMSSB-61/B).
- **Fala C — obniżki widoczne dla bota:** `cardCostReductionForView` rozszerzone
  o `perCreatureAttackingYou`; koszt zdolności aktywowanej liczony na widoku
  (`perCreatureCardInGraveyard`).
- **Fala D — payoffy triggerów:** `you_draw_second_card_each_turn` → token
  (jedna ścieżka wyceny: `boardCastPayoffValue`/payoff rzutu), rider `dies` →
  Food na tokenie.
- **Fala E — domknięcie:** testy `test/audyt-pmssb62-batch67.test.js` (RED→GREEN
  + mutacje), piny kontrolek, wpis do rejestru `docs/PMSSB.md`, raport
  `docs/audits/PMSSB62_BATCH67_2026-10-15.md`, `PROJECT_HISTORY.md`, bramy.

## Kontrole obowiązkowe (procedura PMSSB krok 2)

- (a) L41: ta sama wycena na wszystkich ścieżkach (`cast_spell`,
  `activate_ability`, `resolve_optional_pay_choice`, antycypacja triggera).
- (b) wymiar KOSZTU: 5 vs 2 many oraz 3 vs 0 liczników energii nie mogą
  remisować bez uzasadnienia.
- (c) anty-over-fix M429: brak konsumenta energii / brak atakujących = dawna
  wartość (zero nowych premii bez dowodu).

## Ewaluacja i granice

- `bot-scoring-snapshot` — cel: bez regeneracji fixture (jeśli dryf, dowód
  przed/po i jawna decyzja).
- `tie-audit` + `benchmark` szybki (ADR 0018 — pełnego B0 nie uruchamiamy).
- Żywy Tester: partie z taliami niosącymi nowe karty (worek-baśni, wiedzmin-bg,
  mirrodin-brg, eldraine).
- Bramy końcowe: `run-tests.mjs all`, build, `check-card-printings`,
  `git diff --check`.
