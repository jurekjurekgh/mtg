# PLAN 2026-08-09 — Batch 27: 10 realnych kart (Civilized Scholar … Force Away)

Data: 2026-08-09. Sesja: `arena/019fe7ec-mtg` (PR #39 — kontynuacja po M65/M66).
Kolejka właściciela: Batch 27 (10 kart). Scryfall pobrane **z `set=`** przez `fetch_page`
(api zablokowane — curl/node fetch: SSL/sieć), artId + plan ze słownika kolekcji.

## Karty (Oracle z Scryfall, set=)

| # | Karta | Set | Typ / P/T | Oracle | Nowe mechaniki |
|---|-------|-----|-----------|--------|----------------|
| 1 | Civilized Scholar | ISD | DFC Human Advisor 0/1 {2}{U} | {T}: Draw a card, then discard a card. If a creature card is discarded this way, untap this creature, then transform it. | **draw+discard z transformem** (efekt z warunkiem „creature discarded") |
|   | → Homicidal Brute | ISD | DFC Human Mutant 5/1 (R) | At the beginning of your end step, if this creature didn't attack this turn, tap it, then transform it. | **didntAttackThisTurn** (tracker ataku per stwór) + end step trigger |
| 2 | Battle-Rattle Shaman | M21 | Goblin Shaman 2/2 {3}{R} | At the beginning of combat on your turn, you may have target creature get +2/+0 until end of turn. | beginning_of_combat + requiresTarget optional + pump |
| 3 | Jeskai Devotee | TDM | Orc Monk 2/2 {1}{R} | Flurry — Whenever you cast your second spell each turn, this creature gets +1/+1 until end of turn. {1}: Add {U}, {R}, or {W}. Activate only once each turn. | second-spell trigger (Illvoi), oncePerTurn add_mana URW |
| 4 | High Stride | BLB | Instant {G} | Target creature gets +1/+3 and gains reach until end of turn. Untap it. | reuse (pump + grant reach + untap) |
| 5 | Inspiration | 8ED | Instant {3}{U} | Target player draws two cards. | **draw_cards applyTo target** |
| 6 | Minotaur Abomination | M14 | Zombie Minotaur 4/6 {4}{B}{B} | — (vanilla) | reuse |
| 7 | Guildsworn Prowler | CLB | Tiefling Rogue Assassin 2/1 {1}{B} | Deathtouch. When this creature dies, if it wasn't blocking, draw a card. | **dies + „wasn't blocking"** (flaga blokera z LKI) |
| 8 | Giant Spider | M19 | Spider 2/4 {3}{G} | Reach | reuse |
| 9 | Scroll Thief | M13 | Merfolk Rogue 1/3 {2}{U} | Whenever this creature deals combat damage to a player, draw a card. | reuse (combat_damage_to_player) |
| 10 | Force Away | KTK | Instant {1}{U} | Return target creature to its owner's hand. Ferocious — If you control a creature with power 4 or greater, you may draw a card. If you do, discard a card. | **ferocious „you may draw, if you do discard"** (decyzja gracza w czarze) |

## Nowe mechaniki engine (generyczne, ADR 0002)

1. **draw_then_discard** (Civilized Scholar): draw 1 → pendingDiscardChoice (purpose effect)
   → po odrzuceniu karty-stwora untap + transform źródła (`pending.onCreatureDiscard
   { sourceId, untap: true, transform: true }`; resolve_discard_choice wykonuje).
2. **didntAttackThisTurn** (Homicidal Brute): flaga `attackedThisTurn` na atakujących
   (declareAttackers), condition `didntAttackThisTurn` w triggerze end step
   („your end step" = aktywny gracz); efekt tap + transform.
3. **draw_cards applyTo:'target'** (Inspiration): cel z targets[0] (drawPlayerCards).
4. **dies + wasn't blocking** (Guildsworn Prowler): flaga `isBlockingThisCombat` na
   blokerach (declareBlockers); zdarzenie śmierci niesie `wasBlocking` (LKI w extra
   triggera dies); condition `notBlocking` w triggers; flaga czyszczona w cleanup.
5. **ferocious draw/discard** (Force Away): efekt `ferocious_draw_discard` — gdy
   kontrolujesz stwora z power ≥ 4 (żywo przy rozstrzyganiu): decyzja „draw?" gracza
   (`pendingOptionalDraw`, tak/nie); po TAK: draw 1 + discard 1 (łańcuch decyzji,
   finishPendingSpell po zakończeniu). Bounce przez istniejący bounce_permanent.

Reuse: Battle-Rattle (beginning_of_combat + requiresTarget optional — wzorzec
Jyoti/Kappa; efekty triggera pump), Jeskai (you_cast_second_spell_each_turn —
Illvoi; {1}: add_mana colors ['U','R','W'] oncePerTurn), High Stride (pump+reach+
untap), Scroll Thief (combat_damage_to_player + draw), Giant Spider/Minotaur (vanilla).

## ArtId (słownik) i MANA_COSTS (strażnik M66!)

- artId: civilized-scholar 309 · battle-rattle-shaman 367 · jeskai-devotee 20 ·
  high-stride 206 · inspiration 360 · minotaur-abomination 296 · guildsworn-prowler 311 ·
  giant-spider 437 · scroll-thief 474 · force-away 517
- MANA_COSTS: {2}{U} / {3}{R} / {1}{R} / {G} / {3}{U} / {4}{B}{B} / {1}{B} / {3}{G} / {2}{U} / {1}{U}
- Plans: Innistrad / Zendikar / Tarkir / Bloomburrow / Wiedźmin / Warhammer Fantasy /
  Forgotten Realms / Dominaria / Shandalar / Tarkir

## Etapy (commity w PR #39, każdy zielony)

1. **Plan** — ten plik.
2. **Scryfall data** — 10 plików `docs/cards/scryfall-*.json` (z fetch_page, set=).
3. **Engine** — draw_then_discard + attackedThisTurn/didntAttackThisTurn + draw_cards
   applyTo target + wasBlocking/notBlocking + ferocious_draw_discard (efekty/triggery/
   game-state: pendingOptionalDraw, łańcuch decyzji).
4. **Cards feat 1 (reuse):** High Stride, Inspiration, Minotaur Abomination, Giant
   Spider, Scroll Thief, Battle-Rattle Shaman (6).
5. **Cards feat 2 (nowe):** Jeskai Devotee, Guildsworn Prowler, Force Away (3).
6. **Cards feat 3 (DFC):** Civilized Scholar // Homicidal Brute (1) + tył limited.
7. **Decks + testy** — talie singleton (spellslinger +5, red +1, black +2, green +2,
   landy dopasowane), `test/real-cards-batch27.test.js` (legalny/nielegalny per karta,
   Scryfall sanity, determinizm), hunter seeds.
8. **Benchmark + docs** — pełne B0 (13500, 0 crashy, progi 0.78/0.57), ENGINE_MILESTONES
   M67, PROJECT_STATE, ROADMAP, HANDOFF_2026-08-09f, opis PR.

## Pułapki

- `edit_file` psuje PL → python3; commit msg przez /tmp.
- DFC: tył (Homicidal Brute) `limited` (jak krallenhorde-wantons); transformTo na froncie;
  transform wymaga źródła NA polu bitwy (M65 fix — no-op przy LKI stub).
- attackedThisTurn: czyścić w cleanup (koniec tury); triggery end step przed cleanup.
- „Your end step" (Homicidal) — tylko aktywny gracz; trigger end step istnieje
  (Canonized/Puppeteer) — warunek controllerId === activePlayerId.
- Ferocious: warunek sprawdzany przy ROZSTRZYGANIU (czar na stosie — plansza mogła
  się zmienić); łańcuch decyzji (draw? → discard) kończy pendingSpell.
- draw_cards applyTo target: cel-gracz (nie stwór) — validateTargets typ 'player'.
- Guildsworn: LKI „wasn't blocking" — condition czyta z EXTRA zdarzenia dies, nie
  z żywego obiektu (trigger na stosie po SBA).
- Jeskai {1}: add URW — to NIE {T}; MANA_SOURCE_MAP bez wpisu (kreator many może nie
  oferować — akceptowalne, aktywacja ręczna z panelu; B0: bot może aktywować).
- Hunter seeds: przelosować po zmianie talii spellslinger/red/black/green.
- Pełne B0 po zmianie przestrzeni komend bota (nowe zdolności/karty w taliach).
