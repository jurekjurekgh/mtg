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

- [ ] **0.** Dane Scryfall ×10 + ten plan (commit).
- [ ] **1. Transza A (reuse):** Kitsune, Knockout Maneuver, Krotiq Nestguard
  (+ testy per karta; MANA_COSTS + strażniki L23/L26).
- [ ] **2. Transza B ( nowe słowa kluczowe proste):** Cacophodon (enrage),
  Feed the Infection (corrupted), Mosquito Guard (reinforce).
- [ ] **3. Transza C (płatność/warunki):** Locthwain Paladin (adamant —
  kolory wydanej many), Sarkhan's Rage (controlsNoSubtype).
- [ ] **4. Transza D (decyzja podziału):** Inferno Titan (damage divided
  as you choose — pending + komenda + COMMAND_TYPES + boty + render +
  strażnik A3: etykieta/grupowanie nowej decyzji!).
- [ ] **5. Transza E (combat model):** Cenn's Tactician (block additional
  — legalBlockerOptions/validate + wycena bota + render informacji).
- [ ] **6.** Catalog-coverage zielony (auto), testy batcha
  `test/batch40-kart.test.js`, wyceny botów dla nowych efektów (L50),
  PROJECT_STATE/handoff, opis PR.

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
