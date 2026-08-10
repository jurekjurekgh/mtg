# PLAN 2026-08-10 — Batch 28: 10 realnych kart (Silumgar Butcher … Tenth District Veteran)

Data: 2026-08-10. Sesja: `arena/019fe7ec-mtg` (PR #39). Kolejka właściciela.
Scryfall pobrane z `set=` przez fetch_page (api zablokowane), artId+plan ze słownika.

## Karty (Oracle ze Scryfall, set=)

| # | Karta | Set | Typ / P/T | Oracle | Nowe mechaniki |
|---|-------|-----|-----------|--------|----------------|
| 1 | Silumgar Butcher | DTK | Zombie Djinn 3/3 {4}{B} | Exploit (When this enters, you may sacrifice a creature.) When this exploits a creature, target creature gets -3/-3 until EOT. | **Exploit** — opcjonalne poświęcenie przy wejściu + trigger „exploits" z celem |
| 2 | Relic Robber | ZNR | Goblin Rogue 2/2 {2}{R} haste | Whenever this deals combat damage to a player, THAT PLAYER creates a 0/1 colorless Goblin Construct artifact creature token with „can't block" i „upkeep: deals 1 damage to you". | **token u CELA** (gracz-poszkodowany), token z upkeep-damage do kontrolera, can't block |
| 3 | Flurry of Wings | ARB | Instant {G}{W}{U} | Create X 1/1 white Bird Soldier creature tokens with flying, X = liczba atakujących stworów. | tokeny wg liczby atakujących (Bird Soldier 1/1 flying) |
| 4 | Expose to Daylight | RNA | Instant {2}{W} | Destroy target artifact or enchantment. Scry 1. | reuse (destroy + scry) |
| 5 | Etherium Abomination | ARB | Artifact Creature 4/3 {3}{U}{B} | Unearth {1}{U}{B} (z grobu: wróć z haste; exile na początku następnego end step ALBO gdy by opuściło battlefield; only as sorcery). | **Unearth** — reanimacja z haste + delayed exile end step + replacement „leave → exile" |
| 6 | Awaken the Bear | KTK | Instant {2}{G} | Target creature gets +3/+3 and gains trample until EOT. | reuse |
| 7 | Security Rhox | SNC | Rhino Warrior 5/4 {2}{R}{G} | You may pay {R}{G} rather than pay this spell's mana cost. Spend only mana produced by Treasures to cast it this way. | **alternatywny koszt tylko ze Skarbów** (tracker treasureMana) |
| 8 | Dreams of Steel and Oil | BRO | Sorcery {B} | Target opponent reveals hand. You choose an artifact or creature card from it, then choose an artifact or creature card from their graveyard. Exile the chosen cards. | **reveal ręki + 2 wybory gracza** (ręka: artifact/creature; grób: artifact/creature) + exile obu |
| 9 | Moonscarred Werewolf | DKA | Werewolf 2/2 (tył Scorned Villager) | Vigilance. {T}: Add {G}{G}. Upkeep: if a player cast 2+ spells last turn, transform. | zmiana limited → **supported** (owner chce w talii); transformTo → scorned-villager |
| 10 | Tenth District Veteran | RNA | Human Soldier 2/3 {2}{W} vigilance | Whenever this attacks, untap another target creature you control. | trigger attacks z celem (untap another) |

**DECYZJA WŁAŚCICIELA (2026-08-10): (a) zgodnie z MtG.** Moonscarred Werewolf to tył
DFC (Scorned Villager, DKA) — zostaje `limited` „nie w talii" (jak krallenhorde-wantons,
homicidal-brute). NIE podpinamy go pod day/night (M68): klasyczny transform (upkeep
noSpellsLastTurn/minSpellsLastTurn) i day/night to OSOBNE mechaniki (różne progi i
zakresy liczenia — potwierdzone kontrprzykładem), Wizards celowo je rozdzielił.
Batch 28 = **9 nowych kart** + para Villager//Moonscarred (już kompletna od M36).

## Nowe mechaniki engine (generyczne, ADR 0002)

1. **Exploit (CR 702.110)** — enter_battlefield: pendingExploitChoice (tak/nie + który
   stwór kontrolera do poświęcenia; jak devour/endure — decyzja gracza); po poświęceniu
   odpala trigger „exploits" (zdarzenie exploited, źródło = exploiter) z celem
   (requiresTarget) — Silumgar: -3/-3 do końca tury.
2. **Unearth (CR 702.87)** — activated z grobu (sorcery, koszt {1}{U}{B}, fromGraveyard):
   wróć na battlefield z haste; `unearthExile` na obiekcie — delayed trigger „exile at
   the beginning of the next end step" ORAZ replacement „if it would leave the
   battlefield, exile instead" (moveObjectDirectly: obiekt z unearthExile przy wyjściu
   z bitwiska → exile).
3. **Token u ofiary (Relic Robber)** — combat_damage_to_player: create_token z
   controllerId = CEL (gracz poszkodowany); token_goblin_construct 0/1 bezbarwny
   artifact creature, keywords can't block, trigger upkeep: 1 damage do kontrolera.
4. **Tokeny wg liczby atakujących (Flurry)** — create_token amount:
   'attacking_creatures_count' (licznik atakujących w state.combat).
5. **Alternatywny koszt ze Skarbów (Security Rhox)** — cast_permanent wariant
   `treasureAltCost: {R}{G}`: koszt alternatywny {R}{G}, płatność WYŁĄCZNIE maną ze
   Skarbów (treasureMana + nietapnięte Skarby); spendMana już konsumuje treasure
   pierwsze — walidacja: treasureMana(available) >= 2 i pokrycie kolorów R,G z
   jednostek skarbowych.
6. **Reveal + wybory (Dreams of Steel and Oil)** — pendingRevealExile: cel-gracz
   (opponent) — gracz RZUTU widzi rękę (revealed cardIds w widoku), wybiera kartę
   artifact/creature z ręki (resolve_reveal_exile_hand), potem z grobu
   (resolve_reveal_exile_grave); exile obu.

Reuse: Expose (destroy_permanent + scry), Awaken (pump+trample), Tenth District
(attacks trigger + untap target — wzorzec untap triggers z Midnight Guard/Backup).

## ArtId (słownik) i MANA_COSTS

silumgar-butcher 92 · relic-robber 109 · flurry-of-wings 112 · expose-to-daylight 271 ·
etherium-abomination 36 · awaken-the-bear 173 · security-rhox 71 · dreams-of-steel-and-oil 421 ·
moonscarred-werewolf 485 (DKA) · tenth-district-veteran 516.
MANA_COSTS: {4}{B}/{2}{R}/{G}{W}{U}/{2}{W}/{3}{U}{B}/{2}{G}/{2}{R}{G}/{B}/—/{2}{W}
(moonscarred: bez kosztu — tył, wpis „" jak inne backi? back ma wpis? — sprawdzić
konwencję: krallenhorde-wantons bez wpisu? strażnik M66: każda SUPPORTED nie-ląd ma
wpis; moonscarred będzie supported → wpis "" (bez kosztu)).

## Etapy (commity w PR #39, każdy zielony)

1. **Plan** — ten plik.
2. **Scryfall data** — 10 plików docs/cards/scryfall-*.json (set=).
3. **Engine** — exploit (pendingExploitChoice + exploited), unearth (return+haste+
   delayedExile+leave→exile), token u celu, amount attacking_creatures_count,
   treasureAltCost, pendingRevealExile (2 wybory).
4. **Cards feat 1 (reuse):** Expose, Awaken, Tenth District, Flurry (token Bird Soldier),
   Relic Robber (token Goblin Construct) (5).
5. **Cards feat 2 (nowe):** Silumgar (exploit), Etherium (unearth), Security Rhox
   (treasure alt), Dreams (reveal+2 wybory) (4).
6. **Cards feat 3:** Moonscarred Werewolf limited→supported (1) + transformTo.
7. **Decks + testy** — talie singleton (black +Silumgar/Dreams, red +Relic Robber,
   azorius +Expose/Tenth/Flurry?, green +Awaken/Security/Moonscarred, graveyard
   +Etherium?), `test/real-cards-batch28.test.js` (behawioralne per karta + Scryfall
   sanity + determinizm), hunter seeds.
8. **Benchmark + docs** — pełne B0 (13500, 0 crashy, progi 0.78/0.57), ENGINE_MILESTONES
   M69, PROJECT_STATE, ROADMAP, HANDOFF_2026-08-10b, opis PR.

## Pułapki

- `edit_file` psuje PL → python3; commit msg przez /tmp.
- Exploit: trigger „exploits" odpala się TYLKO gdy poświęcono (flag na exploiterze
  `exploitedThisEntry`); cel -3/-3 z requiresTarget (decyzja gracza).
- Unearth: „exile at the beginning of the NEXT end step" — delayed trigger jak
  Puppeteer; „if it would leave the battlefield" — replacement w moveObjectDirectly
  (tylko gdy zone==='battlefield' i ma unearthExile); haste grant na wejściu.
- Security Rhox: walidacja „Spend only mana produced by Treasures" — dostępne Skarby
  (pula treasure + nietapnięte token_treasure) pokrywają {R}{G}; spendMana już wydaje
  treasure pierwsze (tracker treasureMana — Marut).
- Dreams: reveal — cel widzi, że ręka odsłonięta (FoW: tylko rzucił gracz widzi karty);
  kandydaci: artifact/creature z ręki, potem z grobu; opcja braku karty? „choose an
  artifact or creature card from it" — obowiązkowe, ale brak kandydata = fizzle części.
- Flurry: X liczone przy ROZSTRZYGANIU (attacking creatures w combacie).
- Moonscarred supported: transformTo na scorned-villager (pętla DFC); MANA_COSTS „";
  hunter seeds przelosować.
- Nowe komendy pending → bramki execute + firstPendingDecisionPlayerId + boty
  (heuristic 'ability', aggro 'simple') + PlayerView.
- Pełne B0 po zmianie przestrzeni komend bota.
