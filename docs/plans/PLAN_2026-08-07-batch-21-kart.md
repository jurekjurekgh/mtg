# Plan: Batch 21 — 10 realnych kart (lista właściciela 2026-08-07)

- **Data:** 2026-08-07
- **Sesja:** `arena/019fdb8c-mtg` (kontynuacja PR #31 — już scalony)
- **Karty (10):** Servant of the Scale (DTK), Gray Slaad // Entropic Decay (CLB), Ember Beast (GTC), Kor Sanctifiers (HOP/C15), Irontread Crusher (AER), Skilled Animator (CMR), Withstand (GPT), Nightshade Harvester (DSC/CMR), True Conviction (SOM), Disa the Restless (M3C)
- **Procedura:** ADR 0010 §2a — dane Scryfall pobrane PRZED kodowaniem (10 plików `docs/cards/scryfall-*.json`), `artId` + `plan` ze słownika `tools/collection-art-ids.csv` (wszystkie 10 w słowniku).

## Pozycja wyjściowa

- `npm test` → **911/911** zielonych (po PR #31, M40–M42)
- `npm run build` → **48 modułów / 933,4 kB**
- Katalog: **~128 supported + 5 virtual** (M42 + true), 9 talii singleton

## Mechaniki i stopień trudności

### Łatwe (istniejące mechaniki / drobne rozszerzenia)
- **True Conviction (SOM)** {3}{W}{W}{W} Enchantment — „Creatures you control have double strike and lifelink.” **Statyczny hymn keywordów** — `static` z `grantKeywords: ['double_strike','lifelink']`, zakres `you_control` już istnieje (Trostani, itp.). Brak nowego kodu.
- **Nightshade Harvester (DSC)** {3}{B} 2/2 — „Whenever a land an opponent controls enters, that player loses 1 life. Put a +1/+1 counter on this creature.” Trigger `opponent_land_enters` (wzorzec `land_entered_under_your_control` → uogólnienie na `land_entered_under_opponent_control`). Efekt `lose_life` + licznik.
- **Ember Beast (GTC)** {2}{R} 3/4 — „can't attack or block alone.” Statyczna restrykcja ataku/bloku (`cantAttackAlone` / `cantBlockAlone`) — nowy warunek w `isLegalAttacker` / `legalBlockerOptions` (jak `defender`), sprawdzana przy deklaracji n atakujących.

### Umiarkowane
- **Servant of the Scale (DTK)** {G} 0/0 — enters with +1/+1, dies → put X +1/+1 counters on target creature you control where X = counters on this (LKI). `entersWithCounters` istnieje; dies trigger z `amountFrom: 'dyingCounters'` — nowy efekt `put_counters_where_x_is_dying_counters` (LKI z `dies` w `triggers.js`: zapis `counters` zmarłego obiektu do kontekstu).
- **Kor Sanctifiers (HOP)** {2}{W} 2/3 Kicker {W} — if kicked, destroy target artifact or enchantment. **Kicker** jako alternatywny koszt (jak `costReduction`/`phyrexian`): `kicker: { cost: 1, effectIfKicked: destroy }`. `legalSpellCasts` enumeruje warianty `kicked/unkicked`; `castPermanent` zapisuje `kicked` na obiekcie; trigger `enter_battlefield` z `condition: { wasKicked: true }` (jak `wasCast`).
- **Withstand (GPT)** {2}{W} Instant — „Prevent the next 3 damage that would be dealt to any target this turn. Draw a card.” Efekt `prevent_next_damage { amount:3, targetType }` + `draw_cards`. Nowy wpis w `state.preventNextDamage` (shield 3, filtr po `objectId`/player), konsumowany w `permanents.applyPrevention`; wygasa w cleanup.
- **Irontread Crusher (AER)** {4} 6/6 Vehicle Crew 3 — „Tap any number of creatures you control with total power 3+ : this Vehicle becomes artifact creature until end of turn.” **Crew** jako aktywowana zdolność Vehicle: koszt `tapCreaturesWithTotalPower >= 3` + efekt `animate_vehicle` (do EOT). Nowy keyword w `identity`, animacja w `effects` + `permanents.effectiveTypes`.

### Trudniejsze
- **Skilled Animator (CMR)** {2}{U} 1/3 — ETB: target artifact you control becomes 5/5 artifact creature for as long as this remains on battlefield. **Animacja ciągła zależna od obecności źródła** (jak `animate_land_8_8` ale z dependency `asLongAsSourceRemains`). Statyczny efekt na celu (`animatorAnimate` w `state.animatorAnimations` map `targetId→{sourceId, p/t}`), usuwane gdy źródło opuści bitwisko (triggery LTB).
- **Gray Slaad // Entropic Decay (CLB)** {2}{B} 4/1 Adventure — rewers Sorcery **Mill 4**, przód ma **menace+deathtouch gdy ≥4 creature cards w grobie**. **Adventure** (CR 715): karta dwulicowa `layout: adventure` — kasta przygody z grobu? nie, z ręki na stos jako Sorcery, potem exile → można castować stwora z exile (mechanika `adventure`). Static condition `graveyardCreatureCards >=4` → conditionalKeywords (jak `hasCounter` lecz nowy warunek). Adventure wymaga `spell.adventure` deskryptora + stos `cast_adventure` + `adventureExile`.

### Najtrudniejsza
- **Disa the Restless (M3C)** {2}{B}{R}{G} 5/6 Legendary — (1) Whenever a Lhurgoyf permanent card is put into your graveyard from anywhere other than battlefield, put it onto battlefield. (2) Whenever one or more creatures you control deal combat damage to a player, create a Tarmogoyf token (*/*+1). Trigger1: `lhurgoyf_card_to_graveyard_not_from_battlefield` — sprawdza `cardTypes` (subtype Lhurgoyf) + `fromZone != battlefield`. Efekt `return_to_battlefield` (reanimacja jak Persist, ale z grobu). Trigger2: `combat_damage_to_player` grupowane → `create_token` (token_tarmogoyf z **CDA P/T**: liczba typów kart w grobach). Drugi trigger = nowy typ zdarzenia + agregacja damage. Token Tarmogoyf: P/T = `cardTypesInAllGraveyards` / `+1` — wymaga `effectivePower/Toughness` z dynamicznym `tarmogoyf` (jak Hydra?), uproszczenie: liczone przy odczycie jak u innych P/T-setterów. Wzorzec `Isles`? Najtrudniejszy → rozważyć token vanilla 0/1 + note limitations jeśli zabraknie czasu, ale dążyć do pełnej.

## Nowe/reużyte mechaniki engine (generyczne, ADR 0002)

1. `cantAttackAlone` / `cantBlockAlone` (Ember Beast) — restrykcje combat.
2. Kicker {cost} + `wasKicked` condition (Kor Sanctifiers).
3. `opponent_land_entered` trigger + `lose_life` dla gracza-przeciwnika (Nightshade).
4. `dyingCounters` → `add_counter amountFrom: 'dyingCounters'` (Servant).
5. `prevent_next_damage` shield (Withstand) — nowy `state.preventNextDamage`.
6. Vehicle + Crew (Irontread) — `vehicle` flag + `crew` ability.
7. `animator_animation` ciągła zależna od źródła (Skilled Animator).
8. Adventure: `adventure` layout + `cast_adventure` + conditional keywords `graveyardCreatureCardsAtLeast` (Gray Slaad).
9. Disa: `lhurgoyf_to_graveyard_not_from_battlefield` trigger + `tarmogoyf` CDA token.
10. True Conviction — reużycie `grantKeywords` static (double_strike + lifelink).

## Bot / UI

Boty deterministycznie na nowe decyzje (brak nowych wyborów gracza poza celem — deterministyczne). Zwiększa przestrzeń komend `cast_kicker`, `crew_vehicle`, `cast_adventure`. Wyceny heuristic bez zmian (ADT 0005) — ewentualnie boost dla hymnu double strike.

## Kryteria ukończenia

- [ ] 10 plików `scryfall-*.json` (ADR 0010 §2a)
- [ ] 10 definicji `REAL_CARDS` `supported`/ `limited` tokeny, `artId` z tabeli, `imageUri` ze Scryfall large
- [ ] Nowe mechaniki generyczne (bez warunków na nazwę karty) + testy
- [ ] Każda karta: scenariusz legalny + nielegalny + sanity danych + determinizm replay (jak Batch 20)
- [ ] Talie singleton dopisane (green/black/red/innistrad/azorius/wiedzmin + spellslinger/graveyard/tokens wg koloru)
- [ ] `npm test` zielone, `npm run build` 48-49 modułów, `tools/benchmark.mjs` informacyjnie (progi 0.78/0.57 tylko w górę)
- [ ] Docs: wpis M43 w ENGINE_MILESTONES.md, aktualizacja PROJECT_STATE.md

## Kolejność commitów (każdy zielony)

1. **cz.0** — ten plan (push przed kodem)
2. **cz.1** — dane Scryfall (10 JSON) — walidacja `fs.readFileSync`
3. **cz.2** — infrastruktura mechanik łatwych/średnich (hymn, alone-restrykcje, opponent-land, dyingCounters, kicker, prevention)
4. **cz.3** — infrastruktura trudnych (vehicle/crew, animator, adventure, disa)
5. **cz.4** — definicje kart + mana-costs + talie singleton
6. **cz.5** — testy `real-cards-batch21` (legal/illegal per karta, interakcje, determinizm) + `art-ids`
7. **cz.6** — B0, docs (M43), sprzątanie limitations

## Ryzyka / pułapki

- Adventure + Kicker + Crew to trzy koszty-specjalne w jednym batchu — ryzyko kolizji walidacji `legalSpellCasts`/`legalActivatedAbilities`; ścisłe rozdzielenie ścieżek `cast_permanent` vs `cast_adventure` vs `cast_kicker`.
- Disa Lhurgoyf: identyfikacja kart z podtypem Lhurgoyf (Card subtype, nie Object kind) + fromZone tracking; wymaga rozszerzenia event `card_put_to_graveyard` o `fromZone`.
- Tarmogoyf CDA: dynamiczne P/T liczy `DELIRIUM_CARD_TYPES` po wszystkich grobach — może wymagać nowego `effectivePower` branching (istnieje już `cardTypesInAllGraveyards`? jak delirium).
- Vehicle animacja do EOT vs animator „as long as source remains” — dwa różne lifetime w jednym węźle efektu.
- Withstand prevention 3: musi przechować pozostałą osłonę po częściowej konsumpcji (np. 2 obrażeń → 1 zostaje).
- Gray Slaad menace+deathtouch warunkowy: reużycie `conditionalKeywords` ale z nowym warunkiem `graveyardCreatureCards`.
- `edit_file` na PL znakach psuje → `python3` UTF-8; komunikaty commitów plikiem `/home/user`; `write_file` NIE do `/tmp`; `git fetch` + `reset --mixed` przy fresh clone.
