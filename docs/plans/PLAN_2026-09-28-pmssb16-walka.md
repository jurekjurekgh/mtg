# Plan PMSSB-16 — walka bez fazy walki (fight/bite) (2026-09-28)

## Wybór rodziny

`fight` (3) + `damage_from_target_power` (3) + `damage_creatures_with_keyword` (1)
= 7 kart spoza rejestru PMSSB (nie było audytu; stary model = Batch 45):

| Karta | MV | Efekt |
|---|---|---|
| Malamet Battle Glyph | 1 sorc | +1/+1 counter (jeśli wszedł teraz) + fight |
| Hunt the Weak | 4 sorc | +1/+1 counter (bezwarunkowy!) + fight |
| Time to Feed | 3 sorc | fight + gain 3 życia jeśli cel zginie |
| Diplomatic Relations | 3 instant | +1/+0 + vigilance, bite |
| Assert Perfection | 2 sorc | +1/+0, bite (cel 2 opcjonalny) |
| Knockout Maneuver | 3 sorc | +1/+1 counter + bite |
| Sagittars' Volley | 3 instant | destroy (flying) + 1 dmg ich flyerom |

## Semantyka engine (CR 701.14a–d, cyt. dosłowne w kodzie)

Fight = obustronne damage równe mocy, **jednocześnie** (701.14a), nielegalny
cel = żaden nie zadaje (701.14b); damage **nie-bojowy** (701.14d) → deathtouch
(704.5h) i lifelink/infect działają, first strike/trample NIE. Bite =
jednostronny damage = moc dealera (`dealNonCombatDamage`).

## Findingi (do weryfikacji sondą PRZED)

- **R1 (ridery):** bite liczy tylko `pump` w mocy dealera (Knockout Maneuver:
  `add_counter` POMINIĘTY → lethal liczony zaniżony!); fight liczy counter
  TYLKO warunkowy `onlyIfTargetEnteredThisTurn` (Hunt the Weak pominięty!).
- **R2 (deathtouch):** progi `killsTheirs/losesMine` = power ≥ toughness —
  DT ignorowany w obu kierunkach (mój 1/1 DT powinien zjadać 6/6!).
- **R3 (lifelink):** fight/bite z moim lifelinkiem = zysk życia (damage
  nie-bojowe!); ich lifelink = koszt. Wycena pomija.
- **R4 (wymiana asymetryczna):** walka „zabijam ich 1/1, ginie mój 6/6" =
  stare +25+2·1−20 = **+7** (bot chętnie wymienia się w dół!). Kara śmierci
  płaska 20 zamiast wartości ciała (2p+t+mv — skala M149/A3/sac-economics).
- **R5 (kierunek bite):** targety typowane (`creature_you_control/
  opponent_controls`) blokują zły kierunek w kartach, ale wycena jest
  ślepa na kierunek (defence-in-depth jak M231/gain_control).
- **R6 (okno/obrona, lekkie):** walka w zadeklarowanym combacie, gdy victim
  to ich napastnik z lethalem na twarz/mojego stwora = zapobiega temu
  (lustro fog `fogWindowSavedCreatureValue`/lethal) — dziś zero wymiaru.

## Fale

- **Fala A (R1–R5):** wspólny `fightExchangeValue(view, {dealer, victim, buffs})`
  (L41 dla fight + bite): buffy riderów W PEŁNI (pump + add_counter, obie
  strony), DT w progach, lifelink przez `gainLifeValue` (PMSSB-4, L41),
  kara śmierci = wartość ciała (2p+t+mv), guard kierunku bite. Kotwice
  anty-over-fix: kill-only = stara wartość (25+2·power), bite-chip =
  8+2·power, bite-lethal +15.
- **Fala B (R6):** lekki wymiar okna walki (ofiara = napastnik z zagrożeniem).
- Pokrętła `fight*` w `heuristic-params.js` (wartości = z audytu).

## Testy / ewaluacja / bramy

- `test/audyt-pmssb16-walka.test.js` (scenariusze R1–R6 + anty-over-fix +
  mutacje) — RED→GREEN. Golden-master: cel BEZ regeneracji (sprawdzić diff).
- fast + test:all + build; tie-audit; Żywy Tester; push po kroku; raport w
  hubie + rejestr + PROJECT_HISTORY.
