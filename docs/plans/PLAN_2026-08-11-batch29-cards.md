# PLAN 2026-08-11 — Batch 29: 10 realnych kart (Mournful Zombie … Warmaker Gunship)

Data: 2026-08-11. Sesja: `arena/019fed61-mtg` (PR #41). Kolejka właściciela.
Scryfall pobrane z `set=` przez fetch_page (api zablokowane), artId+plan ze słownika.

## Karty (Oracle ze Scryfall)

| # | Karta | Set | Typ / P/T | Oracle | Nowe mechaniki |
|---|-------|-----|-----------|--------|----------------|
| 1 | Mournful Zombie | APC | Zombie 2/1 {2}{B} | {W}, {T}: Target player gains 1 life. | aktywowana cel-gracz + {W}+tap |
| 2 | Necrosquito | ONE | Phyrexian Insect 0/0 {3}{B} flying | enters 2 oil counters; +1/+1 per oil; gdy INNY stwór/artefakt kontrolera ginie → oil counter | **oil counter** (nowy typ), P/T z liczników, ETB counters, dies trigger |
| 3 | Curiosity | ISD | Aura {U} | Enchant creature. Whenever enchanted creature deals damage to an opponent, you may draw a card. | aura + trigger „enchanted creature deals combat damage to opponent" + may-draw |
| 4 | Veiled Ascension | MKC | Enchantment {3}{W} | enters: flying counter na każdym face-down; face-down wchodzące z flying counter; upkeep: you may cloak top card | **cloak** (face-down z biblioteki), flying counter |
| 5 | Angelic Benediction | ALA | Enchantment {3}{W} | Exalted + Whenever a creature you control attacks alone, you may tap target creature. | **exalted** + attacks-alone trigger |
| 6 | Frontline War-Rager | EOE | Kavu Soldier 2/3 {2}{R} | At beginning of your end step, if you control two or more tapped creatures, put +1/+1 counter on it. | end_step trigger + warunek tapped count |
| 7 | Lash of the Balrog | LTR | Sorcery {B} | As an additional cost, sacrifice a creature or pay {4}. Destroy target creature. | **additional cost sacrifice-or-pay** |
| 8 | Fireball | JVC | Sorcery {X}{R} | costs {1} more per target beyond first; X damage divided evenly rounded down among any number of targets | **X-cost**, variable targets, cost scaling, damage division |
| 9 | Spread the Sickness | MBS | Sorcery {4}{B} | Destroy target creature, then proliferate. | reuse (destroy + proliferate) |
| 10 | Warmaker Gunship | EOE | Artifact Spacecraft 4/3 {2}{R} | When this enters, deals damage = artifacts you control to target creature an opponent controls. Station (tap another creature: charge = its power; only as sorcery; artifact creature at 6+). 6+ Flying | reuse station + ETB damage + count artifacts |

## Nowe mechaniki engine (generyczne, ADR 0002)

1. **Oil counter (Necrosquito)** — nowy typ licznika; statyczne P/T = liczba liczników
   oil (`power/toughness = 'oil_counter_count'` marker jak card_types_in_all_graveyards);
   ETB z licznikami (`entersWithCounters: { oil: 2 }`); trigger „another creature or
   artifact you control dies" → addCounter oil.
2. **Curiosity (aura „deals damage to opponent")** — nowy trigger event na aurze:
   gdy zaczarowany stwór zadaje combat damage graczowi-przeciwnikowi, „you may draw"
   (mayFire + draw_cards). Skan auracji załączonych do źródła obrażeń.
3. **Cloak (Veiled Ascension)** — upkeep: „you may cloak the top card of your library"
   = wierzch biblioteki na pole bitwy FACE-DOWN jako 2/2 (CR 702.75); flying counter na
   face-down; face-down wchodzące z flying counter.
4. **Exalted + attacks-alone (Angelic Benediction)** — exalted (attacker alone +1/+1)
   + trigger „whenever a creature you control attacks alone, you may tap target creature".
5. **Frontline** — end_step trigger z warunkiem `minTappedCreaturesControlled`.
6. **Lash of the Balrog** — additional cost wybór: „sacrifice a creature OR pay {4}".
7. **Fireball** — X-cost czar z „any number of targets" (enumeracja podzbiorów),
   koszt +1 za każdy cel ponad pierwszy, podział X obrażeń po równo (zaokr. w dół).

Reuse: Spread (destroy+proliferate), Warmaker (station — wzorzec Wedgelight Rammer;
ETB damage wg liczby artefaktów; flying przy 6+).

## ArtId (słownik) i MANA_COSTS

mournful-zombie 172 · necrosquito 346 · curiosity 428 · veiled-ascension 57 ·
angelic-benediction 87 · frontline-war-rager 358 · lash-of-the-balrog 257 ·
fireball 436 · spread-the-sickness 506 · warmaker-gunship 515.
MANA_COSTS: {2}{B}/{3}{B}/{U}/{3}{W}/{3}{W}/{2}{R}/{B}/{X}{R}/{4}{B}/{2}{R}.

## Etapy (commity w PR #41, każdy zielony)
1. Plan — ten plik.
2. Scryfall data — 10 plików docs/cards/scryfall-*.json (set=).
3. Engine feat A — oil counter + P/T marker + dies trigger; Frontline condition.
4. Engine feat B — Curiosity aura trigger + may-draw; exalted + attacks-alone.
5. Engine feat C — cloak; Lash sacrifice-or-pay; Fireball X + division.
6. Cards (reuse) — Spread, Warmaker, Mournful, Frontline (4).
7. Cards (nowe) — Necrosquito, Curiosity, Angelic, Lash, Fireball, Veiled (6).
8. Decks + testy — talie singleton + test/real-cards-batch29.test.js, hunter seeds.
9. Benchmark + docs — pełne B0, ENGINE_MILESTONES M72, PROJECT_STATE, HANDOFF, opis PR.

## Pułapki
- edit_file psuje PL → python3; commit msg przez /tmp.
- Nowe typy liczników/markery → strażnik registry (keywordy/licezniki), sprawdzić
  guards w test/card-data i audit-*.
- Cloak: face-down 2/2 (CR 708.2); flying counter na face-down; upkeep may-cloak.
- Fireball: X + koszt za cele + podział po równo; boty (heuristic/aggro) muszą
  umieć odpowiedzieć na nowe decyzje (legalCommands gating).
- Exalted: attacks-alone = dokładnie 1 atakujący (attackers_declared length).
- Pełne npm test przed każdym commitem; hunter seeds po zmianie talii.

## Aktualizacja (w trakcie sesji) — inteligentne rozdzielanie obrażeń Fireballa

Właściciel (uwaga po batchu): **przydzielanie obrażeń z Fireballa ma być
inteligentne** — nie enumeracja wszystkich kombinacji celów × X, ale lista celów,
gdzie każdemu celowi gracz przypisuje wybraną ilość. Zbudowano GENERYCZNY,
reużywalny mechanizm dla wszystkich czarów/zdolności:

- `pendingDamageDistribution` + komenda `resolve_damage_distribution` — gracz
  rozdziela X między wybrane cele (każdemu tyle, ile chce; suma <= total).
- `queueDamageDistribution(state, source, { total, targetIds })` w effects.js —
  każdy efekt `{ type: 'damage_distribution' }` kolejkuje tę samą decyzję.
- Fireball: przy rzucie wybór X + celów; rozstrzygnięcie czeka na stosie
  (state.pendingSpell) do resolve_damage_distribution; wizard w UI
  (renderDamageDistributionWizard — steppery +/− przy każdym celu).
- Bots: default = równy podział (pierwsza oferta). Walidacja: komplet celów,
  suma <= X.
- **FIX deadlocka benchmarku:** pendingOptionalTrigger (Curiosity may-draw,
  Veiled cloak) jest teraz PRZED celami triggerów w firstPendingDecisionPlayerId
  i enumeracji (execute był źródłem prawdy) — inaczej oferowany trigger target
  był odrzucany bramką optional trigger (optional_trigger_unresolved).
