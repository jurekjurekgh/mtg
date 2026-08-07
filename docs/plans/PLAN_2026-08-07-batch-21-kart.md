# Plan: Batch 21 — 10 realnych kart (kolejka z handoffu 2026-08-07)

- **Data:** 2026-08-07
- **Sesja:** `arena/019fdc3d-mtg` (nowy PR po scaleniu PR #31 — M42)
- **Karty:** Servant of the Scale (DTK), Gray Slaad (CLB), Ember Beast (GTC),
  Kor Sanctifiers (HOP), Irontread Crusher (AER), Skilled Animator (CMR),
  Withstand (GPT), Nightshade Harvester (CMR), True Conviction (SOM),
  Disa the Restless (M3C).
- **Procedura:** ADR 0010 §2a — dane Scryfall pobrane PRZED kodowaniem
  (11 plików `docs/cards/scryfall-*.json` + token Tarmogoyf), artId + plan
  ze słownika `tools/collection-art-ids.csv`.

## Mechaniki i stopień trudności

### Łatwe (istniejące mechaniki)
- **Servant of the Scale (DTK)** {G} 0/0 — ETB +1/+1 counter (istnieje:
  `entersWithCounters`), dies → przenieś liczniki na cel-stwora. **Nowy
  efekt:** `transfer_counters_on_dies` (LKI przez `formerCounters`).
- **Nightshade Harvester (CMR)** {3}{B} 2/2 — trigger „land an opponent
  controls enters": ten gracz traci 1 życie + licznik +1/+1 na źródło.
  **Nowy event triggera:** `land_entered_under_opponent_control` (obok
  istniejącego landfallu), efekt `lose_life` z `targetPlayerId` z kontekstu.

### Umiarkowane (nowe mechaniki)
- **Ember Beast (GTC)** {2}{R} 3/4 — „can't attack or block alone".
  **Nowe flagi zdolności:** `cantAttackAlone` / `cantBlockAlone` —
  walidacja w `declareAttackers`/`declareBlockers` (inny atakujący/blokujący
  tego samego celu wymagany).
- **Withstand (GPT)** {2}{W} Instant — „Prevent the next 3 damage that
  would be dealt to any target this turn. Draw a card." **Nowa tarcza
  prewencji:** `state.damageShields` [{ targetId, remaining }] — redukcja
  w `markDamage` i ścieżkach obrażeń w gracza; cel „any target" (stwór albo
  gracz); draw (istnieje).
- **True Conviction (SOM)** {3}{W}{W}{W} — globalny static: stwory
  kontrolera mają **double strike i lifelink**. **Nowe keywordy w engine:**
  `double_strike` (obrażenia w OBU przebiegach combat — CR 702.4e/702.7)
  i `lifelink` (zysk życia = zadane obrażenia, combat i nie-combat);
  globalny grant keywordów przez scope-anthem (istnieje — Trostani).
- **Skilled Animator (CMR)** {2}{U} 1/3 — ETB: celowy artefakt staje się
  artefaktowym stworem 5/5 „**for as long as this creature remains on the
  battlefield**". **Nowy efekt:** `animate_linked` — animacja z linkiem do
  źródła; rekoncyliacja (cofnięcie animacji) przy odejściu źródła
  z bitwiska (choke point: `moveObjectDirectly` + ścieżki wygnań).

### Trudne (nowe mechaniki batcha)
- **Kor Sanctifiers (HOP)** {2}{W} 2/3 — **Kicker {W}** + ETB „if it was
  kicked, destroy target artifact or enchantment". **Nowa mechanika:
  Kicker** — deskryptor `kicker` na karcie, wariant `kicked: true` komendy
  `cast_permanent` (dodatkowy koszt + pip koloru), flaga `wasKicked` na
  permanencie, warunek triggera `{ wasKicked: true }`, kreator many E.3a.
- **Irontread Crusher (AER)** {4} Artifact — Vehicle 6/6 — **Crew 3**.
  **Nowa mechanika: Crew/Vehicle** — zdolność aktywowana z kosztem
  `{ crewPower: N }` + tapnięciem DOWOLNEJ liczby stworów kontrolera
  (łączna moc ≥ N, wybór gracza), efekt: animacja samego źródła do końca
  tury (6/6, typ Creature) — `animate_permanent_until_end_of_turn`
  (istnieje). Summoning sickness zostaje poprawny (flaga jest na
  permanencie od wejścia; CR 302.6).
- **Gray Slaad (CLB)** — **Adventure** (Gray Slaad {2}{B} 4/1 // Entropic
  Decay {1}{B} Sorcery — Adventure „Mill four cards"). **Nowa mechanika:
  Adventure** — deskryptor `adventure` na karcie, komenda `cast_adventure`
  (sorcery z ręki → rozstrzygnięcie → EXILE zamiast grobu), komenda
  `cast_adventure_creature` (rzut stwora z exile), oferta w legalCommands,
  kreator many. Do tego statyczny warunek `minCreatureCardsInGraveyard`
  (menace+deathtouch przy ≥ 4 kartach stwora w grobie).
- **Disa the Restless (M3C)** {2}{B}{R}{G} 5/6 Legendary — dwa nowe
  triggery: (1) „Lhurgoyf permanent card put into your graveyard from
  anywhere other than the battlefield → put it onto the battlefield"
  (nowy event `card_put_into_graveyard_from_nonbattlefield` z filtrem
  podtypu; efekt `put_graveyard_card_onto_battlefield`); (2) „one or more
  creatures you control deal combat damage to a player → create a
  Tarmogoyf token" (nowy event `any_combat_damage_to_player`, grupowany
  raz na komendę jak leftBattlefield). **Token Tarmogoyf:** dynamiczne
  P/T = liczba typów kart we WSZYSTKICH grobach (+1 do wytrzymałości) —
  nowy marker statycznego pumpa (`card_types_in_all_graveyards`).

## Kryteria ukończenia

- [ ] `npm test` zielone (+ testy legalnych/nielegalnych scenariuszy każdej
      karty, sanity Scryfall z `fs.readFileSync`).
- [ ] `npm run build` przechodzi.
- [ ] Karty `supported` w 100% mechaniki (decyzja właściciela 2026-08-03).
- [ ] Dopisane do istniejących talii singleton (green/black/red/azorius/
      graveyard/tokens), liczniki lądów dostosowane; NIE pliki batchowe.
- [ ] Pełny B0 informacyjnie (dodanie kart, nie zmiana bota — progi 0.78/0.57
      bez zmian).

## Plan commitów

- cz. 0 — roadmapa + dane Scryfall (11 plików) + artId/plan.
- cz. 1 — mechaniki engine (double strike, lifelink, tarcze prewencji,
  cantAttack/BlockAlone, triggery Nightshade/Disa, transfer liczników,
  linked animation, token Tarmogoyf).
- cz. 2 — Kicker + Adventure + Crew (komendy, oferty, kreator many).
- cz. 3 — definicje 10 kart + token + MANA_COSTS.
- cz. 4 — testy `test/real-cards-batch21.test.js`.
- cz. 5 — talie singleton + pełny B0 + docs (PROJECT_STATE, ENGINE_MILESTONES,
  HANDOFF).

## Ryzyka / pułapki

- **Adventure** — największy feature batcha: nowe strefy rzutu (z ręki na
  stos, z exile na bitwisko) i dwie komendy; wzorzec: Escape (cast_escape).
  Reszta ryzyka: kreator many E.3a (paymentDescriptorOf) musi znać nowe
  warianty rzutów.
- **Crew** — koszt „tap any number of creatures" to pierwszy koszt ze
  zmienną liczbą wybranych stworów (wzorzec: devour wybór „any number").
- **Skilled Animator** — linked animation wymaga cofnięcia animacji przy
  odejściu źródła; choke point `moveObjectDirectly` (wszystkie zmiany strefy).
- **Disa** — „one or more" combat damage grupujemy raz na komendę (jak
  Nefarious Imp / leftBattlefield); Tarmogoyf czyta typy kart z obu grobów.
- **edit_file psuje polskie znaki** → `python3`; komunikaty commitów plikiem
  w `/home/user`; commit+push po każdym fragmencie; `gh pr edit` nie działa
  — opis PR przez `gh api -X PATCH`.
