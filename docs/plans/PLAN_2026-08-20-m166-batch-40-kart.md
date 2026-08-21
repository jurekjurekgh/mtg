# PLAN M166 — Batch 40: 10 kart (lista właściciela 2026-08-20, PR #68)

Lista: Krotiq Nestguard (TDM), Blade-Blizzard Kitsune (NEO), Inferno Titan
(LTC), Locthwain Paladin (ELD), Mosquito Guard (MOR), Sarkhan's Rage (DTK),
Feed the Infection (ONE), Cenn's Tactician (MOR), Cacophodon (RIX),
Knockout Maneuver (TDM).

Dane pobrane ze Scryfall (ADR 0010 §2a — obowiązkowo, printy wg setów
właściciela; Inferno Titan z LTC — named zwracał przedruk HOC 2026,
pobrano z `set=ltc`; Mosquito Guard MOR (nie DDF) i Sarkhan's Rage DTK
(nie JMP) — j.w.): `docs/cards/scryfall-*.json` ×10.

## Rozpoznanie mechanik vs engine (ADR 0022: pełne Oracle albo unsupported)

| Karta | Mechaniki | Status |
|---|---|---|
| Blade-Blizzard Kitsune | ninjutsu {3}{W} + double strike | REUSE (Kappa, Batch 21) |
| Knockout Maneuver | licznik +1/+1 na swoim, potem obrażenia = moc (z licznikiem) w stwora przeciwnika | REUSE (add_counter + damage_from_target_power z effectivePower — sekwencja efektów) |
| Krotiq Nestguard | defender; {2}{G}: atakuj jakby bez defendera do EOT | REUSE (lostKeywordsUntilEOT z becomes_subtype_until_end_of_day bez podtypów; cleanup istnieje) |
| Cacophodon | Enrage — gdy stwór otrzyma obrażenia, untap target permanent | NOWY trigger event `dealt_damage` (skan damage_dealt gdzie target == źródło); untap_permanent REUSE (Twiddle) |
| Feed the Infection | draw 3, lose 3; Corrupted — każdy przeciwnik z ≥3 poison traci 3 życia | draw/lose REUSE; NOWY efekt `opponents_lose_life_if_poison` (poison w engine jest) |
| Mosquito Guard | first strike; Reinforce 1—{1}{W} (discard z ręki: licznik na celu) | first strike REUSE; NOWE słowo `reinforce` (wzorzec cycling/channel — zdolność z RĘKI z kosztem odrzucenia + cel) |
| Locthwain Paladin | menace; Adamant — ≥3 czarnej many wydanej na rzut → ETB z +1/+1 | menace REUSE; NOWE `adamant` — śledzenie KOLORÓW wydanej many (rozszerzenie lastManaSpend o kolory zużytych jednostek z consumeManaPool) + entersWithCounters warunkowe |
| Sarkhan's Rage | 5 obrażeń any target; bez Smoka → 2 obrażenia w siebie | damage any_target REUSE; warunek generyczny `controlsNoSubtype` w efekcie conditional (wzorzec controlsPlaneswalkerWithSubtype) + damage self |
| Inferno Titan | {R}: +1/+0 EOT; ETB/atak: 3 obrażenia podzielone DOWOLNIE na 1-3 celów | pump REUSE; trigger attacks/ETB REUSE; NOWA decyzja podziału obrażeń „as you choose" (cel 1-3 + kwoty; nowy pending + komenda + boty + render — najcięższa karta batcha) |
| Cenn's Tactician | {W},{T}: licznik na celu Soldierowi; każdy stwór z +1/+1 może blokować DODATKOWEGO stwora | aktywowana REUSE; NOWA statyka `can_block_additional` (model deklaracji bloków — ten sam bloker w 2 slotach) |

## Etapy (transze, każda samodzielnie zielona: npm test + build)

- [x] **0.** Dane Scryfall ×10 + ten plan (commit).
- [x] **1. Transza A (reuse):** 14cf91a + fix talii 30c8729 (nauczka: M33+ wymaga talii od razu; tokens.txt). Kitsune, Knockout Maneuver, Krotiq Nestguard
  (+ testy per karta; MANA_COSTS + strażniki L23/L26).
- [x] **2. Transza B (nowe słowa kluczowe proste):** 9fb54af — Enrage z LKI (CR 603.10: targetLki w damage_dealt + sourceLki w pendingach triggerów), Corrupted, Reinforce (zdolność z ręki z discard + cel). Cacophodon (enrage),
  Feed the Infection (corrupted), Mosquito Guard (reinforce).
- [x] **3. Transza C (płatność/warunki):** 455aedd — Adamant (kolory wydanej many przez zwrot consumeManaPool — bez śladu w stanie, sonda U9), controlsNoCreatureSubtype. Locthwain Paladin (adamant —
  kolory wydanej many), Sarkhan's Rage (controlsNoSubtype).
- [x] **4. Transza D (decyzja podziału):** 425b696 — damage_divided + resolve_damage_division (kompozycje); rozdzielone wzorce each-of vs divided-among w applyTriggerEffects; fix bramek ofert play_land/cast (załamania linii). Inferno Titan (damage divided
  as you choose — pending + komenda + COMMAND_TYPES + boty + render +
  strażnik A3: etykieta/grupowanie nowej decyzji!).
- [x] **5. Transza E (combat model):** b6a5dfe — blockSlotsFor + usedBlockers jako mapa slotów + enumeracja z drugą rundą; cel Soldier przez creature_with_subtypes. Cenn's Tactician (block additional
  — legalBlockerOptions/validate + wycena bota + render informacji).
- [x] **6.** Catalog-coverage zielony (auto), testy batcha
  `test/batch40-kart.test.js`, wyceny botów dla nowych efektów (L50),
  PROJECT_STATE/handoff, opis PR.

## Reguła talii dla batcha (nauczka transzy A)

Nowe karty trafiają WYŁĄCZNIE do `decks/tokens.txt` (W/G/U, jedyna
wielokolorowa talia bez odwołań w testach): green/azorius/red/black mają
zamrożone seedy w testach scenariuszowych (L25) — dodanie karty do tych
talii łamie 5 testów i wymaga re-losowania seedów (wzorzec „huntera"
z library-manipulation-modal). Strażnik M33+ wymaga obecności w JAKIEJKOLIWIEK
talii — tokens spełnia.

## Ryzyka / pułapki

- Inferno Titan: decyzja podziału MUSI pełnić CR 608.2b/„divided as you
  choose" (kwoty ≥1 na cel, suma = 3) — wzorce: pendingDamageAssignment
  (walka), apply_to_each_target (Wrap in Flames). Nowa komenda → strażnik
  A3 z M163 wymusi etykietę i grupowanie od razu.
- Cenn's Tactician: „can block an additional creature" zmienia legalność
  MULTI-bloku — sprawdzić, gdzie bloker jest zdejmowany z puli po
  przypisaniu (combat.js assignments) i czy UI wizard obsłuży powtórzenie.
- Adamant: many wydane na koszt DODATKOWY też się liczy (CR); liczymy
  JEDNOSTKI kolorowe zużyte przez spendMana tego rzutu (pip + generic).
- Reinforce z ręki: wzorzec cycling — uwaga na FoW (karta własna, jawna)
  i na maszynowy strażnik limitations (ADR 0022: zero odchyłek).
- Wszystkie nowe resolve_*/efekty: przegląd pod kątem L48 (oferta=
  walidacja) i A3 (etykieta + grupowanie).

## Stan na przerwaniu (kontynuacja: transze D i E)

Wykonano 8/10 kart (transze A-C, commity 14cf91a…455aedd, pakiet 2538/2538).
Pozostały DWIE najcięższe:

- **D. Inferno Titan**: {R}:+1/+0 (pump reuse); trigger „enters or attacks"
  (dwa triggery: enter_battlefield + attacks) z 3 obrażeniami DZIELONYMI
  DOWOLNIE na 1-3 celów. Wymaga NOWEJ decyzji podziału (kwoty ≥1 na cel,
  suma = 3; wzorce: pendingDamageAssignment — walka, apply_to_each_target —
  Wrap in Flames). Nowa komenda resolve_* → COMMAND_TYPES + strażnik A3
  (etykieta + grupowanie!) + oba boty + render. Alternatywa projektowa:
  requiresTarget count 1-3 (upTo) + efekt damage_divided z decyzją kwot
  per cel w JEDNEJ komendzie (jak targetIds multi-target M157/F4a).
- **E. Cenn's Tactician**: {W},{T}: licznik na celu Soldierzie (reuse);
  STATYKA „each creature you control with a +1/+1 counter can block an
  additional creature" — model deklaracji bloków: legalBlockerOptions/
  walidacja assignments muszą dopuścić tego samego blokera w dwóch
  slotach, gdy kontroler ma to źródło; wycena bota + render informacji.

Dane Scryfall obu kart są w docs/cards/ (inferno-titan, cenns-tactician).
Reguła talii: tokens.txt (Cenn's Tactician {W} — Plains są); Inferno Titan
{4}{R}{R} → ostrza.txt (Mountain) — NIE red.txt (zamrożone seedy).

## Doprecyzowany projekt transzy D (Inferno Titan) — kontynuacja

Dwustopniowa decyzja, pełne Oracle, minimalny nowy kod:

1. **{R}: +1/+0 EOT** — reuse: aktywowana bez oncePerTurn (wzorzec Knight
   of the Skyward Eye), effect [{type:'pump', power:1, toughness:0}].
2. **Trigger „enters or attacks"** — DWA triggery (enter_battlefield +
   attacks; jeden Oracle-tekst = dwa zdarzenia, behavior tożsamy),
   każdy z requiresTarget {type:'any_target', count:3, upTo:true} —
   istniejąca maszyneria multi-target M157/F4a (targetIds w JEDNEJ
   komendzie, game-state ~2600).
3. **Podział kwot** — NOWE: efekt 'damage_divided' {amount:3}: przy 1 celu
   całość; przy >1 otwiera pendingDamageDivision {playerId, sourceId,
   cardId, targetIds, total, restorePriorityTo}; komenda
   resolve_damage_division {amounts[]} — walidacja: każdy cel ≥1,
   suma = total, komplet celów. ENUMERACJA ofert = kompozycje liczby 3
   na ≤3 części (3/[2,1]/[1,1,1]) — malutka, bez własnego wizarda.
   Do zrobienia: COMMAND_TYPES, firstPendingDecision + pass-gate +
   playerView, etykieta+grupowanie (strażnik A3!), oba boty (heurystyka:
   podział równomierny/największy gracz — deterministycznie), fingerprint,
   cleanup. Talia: ostrza.txt.

## Podsumowanie wykonania (Batch 40 KOMPLET 10/10)

- Transze A-E w commitach 14cf91a…b6a5dfe (każda zielona: test:all + build;
  incydenty CI naprawione przed przejściem dalej).
- Nowe mechaniki generyczne: Enrage z pełnym LKI (CR 603.10), Corrupted,
  Reinforce, Adamant, controlsNoCreatureSubtype, damage_divided (kwoty),
  grantsExtraBlockWithCounter (model bloków), defender-override (reuse).
  Strażniki klas (M122/M126/A3/HANDLED_TRIGGER_EVENTS/L23/L26) zielone.
- Stan końcowy: test:all 2554/2554, build 52 moduły / 2180.6 kB.
