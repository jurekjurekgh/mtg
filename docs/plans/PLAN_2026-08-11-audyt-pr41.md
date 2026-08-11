# PLAN 2026-08-11 — Audyt PR #41 (M71 + M72 + M72b) i naprawa znalezionych błędów

## Cel

Pełny audyt behawioralny ostatniego scalonego PR (#41, `467917b`): M71 (srebrna
odznaka — 4 fixy vs CR + zgłoszenia A–D), M72 (Batch 29 — 10 kart + generyczne
rozdzielanie obrażeń), M72b (zgłoszenia A–F + zdolności aktywowane na stosie).
Wzorzec M54/M65: **sonda behawioralna end-to-end na żywym engine, NIE testy
definicyjne** — testy sprawdzają zachowanie, nie istnienie pól. Naprawa u root
cause (AGENTS.md), zero maskowania. Każda naprawa: test RED→GREEN.

## Stan wyjściowy

- `npm test` **1310/1310**, build **50 modułów / 1453.6 kB**, quick B0 1080 meczów
  0 crashy (zweryfikowane na starcie sesji).
- Diff PR #41: 74 pliki, +2872/−90 (diff `9a89744..467917b`).
- History: `git fetch --deepen` wykonany — pełny diff dostępny lokalnie.

## Status wykonania (aktualizacja 2026-08-11)

- [x] **B1 Fireball** — commit `8c7cfca`: podział po równo wg Oracle, reszta przepada,
  usunięta machineria free-distribution, protection w walidacji, 0 celów/X=0 legalne.
- [x] **B2 attacks_alone** — commit `5d46cbd`: filtr kontrolera (CR 702.82).
- [x] **B3 Curiosity** — commit `5d46cbd`: hook dla combat i niecombat damage.
- [x] **B4 Veiled flying counter** — commit `5d46cbd`: helper dla cloak + morph;
  licznik flying daje flying także face-down (CR 122.1b, ruling cloak).
- [x] **B5 oil** — commit `5d46cbd`: statyczny pump oil_counters na Necrosquito,
  cofnięta generyczna zmiana counterDelta.
- [x] **B6 protection w aurach** — commit `6f16628`: castAuraSpell/legalAuraCasts/
  resolveAuraSpell (fizzle czystej aury, bestow jako stwór).
- [x] **B7 zdolności na stosie** — commit `6f16628`: equip instant+stos (fizzle przy
  nielegalnym celu), cycling/channel (odrzut=koszt, efekt przy rozstrzyganiu),
  ninjutsu na stos. ~30 testów zaktualizowanych o rozstrzyganie stosu.
- [x] **B8 sonda mechanik M72** — commit `4019566`: Necrosquito artefakt/self,
  Veiled ETB, Warmaker station — wszystkie OK.
- [x] **B9 UI M72b** — commit `4019566`: testy render E/F.

- [x] **Żywy tester stołu opublikowany** — `tools/table-tester/` (automatyczny
  gracz na artefakcie przez jsdom) + `docs/setup/TESTER_STOLU.md` + wpis w
  AGENTS.md i ROADMAP.md (sekcja rozwoju). Pomysł właściciela: audyt
  rozgrywki „z perspektywy gracza". Smoke-partia przeszła; tester wykrył
  bug UX „Stos — ?" (panel górny nie pokazuje nazwy wierzchniej karty —
  naprawiony osobno).

- [x] **Audyt żywym testerem (M73c, brązowa odznaka)** — 5 partii różnymi
  taliami (green/red, tokens/spellslinger, innistrad/wiedzmin, azorius/black,
  black/green); transkrypty `/tmp/table-audit/audit-*.txt`. Znalezione błędy:
  1. „efekt." jako opis triggerów/zdolności na kaflach (describeEffect fallback
     'efekt') — gracz nie wie, co robi karta.
  2. Surowe slugi efektów czaru na kaflach (describeSpellEffects fallback
     effect.type) — „cant_be_regenerated_this_turn + destroy_permanent".
  3. „cel: ? (Nieprzyjaciel)" dla face-down celu (Expunge na morph) —
     nameOfObject nie obsługuje faceDown → powinno być „morph".
  4. „? — blokujący:" w wizardzie blokujących dla face-down atakującego
     (objectName w renderCombatWizard nie obsługuje faceDown).
  5. Po zakończeniu partii wskaźnik pokazuje tylko „Koniec partii" — bez
     zwycięzcy (trzeba czytać log).

## Ustalenia rozpoznania — potwierdzone błędy do naprawy

### B1. Fireball (JVC) — podział obrażeń niezgodny z Oracle (twardy błąd)
Oracle karty (w repo, `docs/cards/scryfall-fireball.json`): *„Fireball deals X
damage divided **evenly, rounded down**, among any number of targets"* + *„This
spell costs {1} more to cast for each target beyond the first"*.

Implementacja (M72):
1. `queueDamageDistribution`/`resolve_damage_distribution`/wizard pozwalają
   graczowi rozdzielać X DOWOLNIE („każdemu tyle, ile chce; suma <= total") —
   niezgodne z „divided evenly".
2. Default bota ROZDYSPONOWUJE resztę z dzielenia po 1 od pierwszego celu
   („żeby suma zgadzała się z total") — wg Oracle reszta **przepada**
   („rounded down").
3. Oferta: X = 1..15 (X=0 legalne wg Oracle), max 3 cele („any number" — bez
   limitu; cap oferty do decyzji, walidacja ma być pełna), wymagany ≥1 cel.
4. Walidacja celów nie sprawdza protection od koloru czaru (Fireball = {R}).

**Fix:** usunięcie machinerii free-distribution (pendingDamageDistribution,
resolve_damage_distribution, damage_distribution_required/resolved, wizard,
bot case) — jedyna karta używająca tego mechanizmu to Fireball, a jego podział
jest DETERMINISTYCZNY. `resolveFireball`: per = floor(X / liczba celów z rzutu),
każdy żywy cel dostaje per, reszta przepada (ruling Fireballa: oryginalny
podział obowiązuje; udziały celów nielegalnych przy rozstrzygnięciu przepadają).
Walidacja: X ≥ 0 (0 legalne), 0 celów legalne („any number"), cel z protection
od koloru czaru nielegalny (CR 702.16b). Oferta botów zostaje rozsądnie
ograniczona (cap 3 cele / X≤15) jako limit UI — zgodny z uwagą właściciela
„NIE enumerujemy kombinacji celów × X" — ale walidacja przyjmuje dowolny legalny
wariant.

### B2. attacks_alone (Angelic Benediction) — brak filtra kontrolera
`processTriggers` dla `attacks_alone` odpala trigger na KAŻDYM źródle na
bitwisku; „Whenever a creature **you control** attacks alone" — trigger na
Benediction przeciwnika odpala się, gdy JA atakuję samotnie (błędny exalted
pump mojego stwora + „you may tap target creature" przeciwnika).
**Fix:** `tryFire` tylko gdy `source.controllerId === attacker.controllerId`.

### B3. Curiosity (ISD) — tylko combat damage
Hook `enchanted_creature_combat_damage_to_opponent` siedzi w handlerze
`damage_dealt && ev.combat !== false && isPlayerId(target)`; Oracle: „Whenever
enchanted creature **deals damage** to an opponent" — każde obrażenia (także
niecombat, np. zdolność Weldera Automaton zaczarowanego Curiosity).
**Fix:** wspólny hook dla combat i niecombat damage do przeciwnika
(zmiana nazwy zdarzenia na `enchanted_creature_damage_to_opponent` + strażnik).

### B4. Veiled Ascension (MKC) — flying counter tylko przy cloak
Statyczna zdolność „Face-down creatures you control enter with a flying counter
on them" jest realizowana wyłącznie w efekcie `cloak`. Morph face-down
(Monastery Flock — azorius ma i Veiled, i Flocka) wchodzący przy Veiled nie
dostaje licznika. **Fix:** generyczny hook przy wejściu dowolnego face-down
stwora kontrolera (cloak + morph + inne ścieżki), jeśli źródło ze zdolnością
`faceDownEnterFlyingCounter` na bitwisku.

### B5. Oil counters — nadmierna generalizacja w counterDelta
`counterDelta` dodaje `oil` do P/T dla KAŻDEGO obiektu. Sam licznik oil nie
daje +1/+1 — daje go dopiero zdolność Necrosquito („This creature gets +1/+1
for each oil counter on it"). **Fix:** cofnięcie generycznej zmiany; statyczny
pump na Necrosquito czytający liczbę oil (wzorzec dynamicznych statyków).

### B6. Protection — luka fixu M71 w ścieżce aury i Fireballa
M71 przekazał `sourceColors` przez validateTargets/collectLegalTargets, ale:
1. `castAuraSpell`/`legalAuraCasts` walidują tylko hexproof — aura koloru X
   może zaczarować stwora z protection od X (osiągalne: Curiosity {U} vs
   protection from blue z Benevolent Blessing).
2. `resolveAuraSpell` — brak rewalidacji protection przy rozstrzygnięciu
   (gospodarz zyskał protection na stosie → fizzle, CR 608.2b).
3. `castFireball` — brak checka protection (patrz B1.4).
**Fix:** wspólny check protection-celowania (kolory źródła) w castAuraSpell,
legalAuraCasts, resolveAuraSpell i castFireball.

### B7. D — zdolności aktywowane na stosie (CR 602.2a): luki
Wykonane dla ścieżki `performActivation` (niemane, bez morph/megamorph).
1. **Brak rewalidacji celów przy rozstrzyganiu** zdolności ze stosu:
   `resolveActivatedAbilityEntry` aplikuje efekty do celów z chwili aktywacji;
   cel nielegalny przy rozstrzygnięciu powinien no-op (CR 608.2b). Osiągalne:
   Entrancing Lyre {X} vs stwór, którego moc urosła ponad X w oknie odpowiedzi.
   **Fix:** rewalidacja celów przy rozstrzyganiu (wzorzec collectLegalTargets).
2. **Zdolności OMIAJĄCE stos** (mimo deklaracji „NIEmany zdolności idą na
   stos"): equip, cycling, channel, ninjutsu (osobne ścieżki — nie przechodzą
   przez performActivation). Dodatkowo **equip jest u nas sorcery-speed, a wg
   CR 702.6a to instant speed** (wszystkie 4 sprzęty katalogu bez klauzuli
   „activate only as a sorcery").
   **Fix:** equip → instant timing + rozstrzyganie ze stosu (cel rewalidowany,
   przy fizzlu sprzęt zostaje odłączony); cycling/channel → rozstrzyganie ze
   stosu (efekt po rundzie passów). Ninjutsu — audyt; jeśli fix bezpieczny —
   stos, inaczej jawne ograniczenie w limitations + dopisek w raporcie.

### B8. Weryfikacja pozostałych mechanik M72 (sonda behawioralna)
- Necrosquito: trigger „another creature OR ARTIFACT you control dies" — artefakty
  (także token Treasure), nie-self; oil przez proliferate.
- Frontline War-Rager: intervening-if end step (2+ tapped) — licznik tylko gdy
  warunek w momencie triggera.
- Lash: oba warianty (sacrifice / pay {4}); walidacja braku obu opcji.
- Spread the Sickness: destroy → proliferate (kolejność, cele).
- Warmaker Gunship: station próg 6 (flying), ETB damage = liczba artefaktów
  (z samym Gunshipem), cel „creature an opponent controls".
- Mournful Zombie: cel-gracz, zysk życia CELU (nie kontrolera).
- M71 combat: 1a–1c, 2a–2b, 3, 4, 5 — testy istnieją; dodać brakujące krawędzie
  (np. first-strike resume z rozdzielaniem po wznowieniu w obu kierunkach
  protection-lifelink).

### B9. UI A–F (M72b) — weryfikacja
- A: COUNTER_LABELS — sprawdzić kompletność (stun, level, poison?) i poprawność
  badge na kaflu i nakładce.
- C/C2: „Stos — nazwa" + życie w górnym panelu — przy zdolności na stosie.
- D: log ability_resolved — po polsku, z nazwą.
- E: właściciele w modalach — (Ty)/(Nieprzyjaciel) tylko dla permanentów na
  bitwisku (nie dla kart w ręce/grobie — tam kontroler nie ma sensu).
- F: „zaczarowana: X"/„wyposażona: X" na gospodarzu.

## Porządek commitów

1. **plan** — ten dokument (PIERWSZY commit PR sesji, wymóg AGENTS.md).
2. **fix(engine): Fireball — podział po równo wg Oracle** (B1) + testy RED→GREEN
   (przepisanie testów Fireball w batch29; usunięcie machinerii
   damage_distribution).
3. **fix(engine): attacks_alone + Curiosity + cloak-flying + oil** (B2–B5) +
   testy.
4. **fix(engine): protection w aurach i Fireballu** (B6) + testy.
5. **fix(engine): D-luki — rewalidacja celów zdolności na stosie, equip
   instant+stos, cycling/channel na stos** (B7) + aktualizacja testów.
6. **fix(table): UI A/C/D/E/F — weryfikacja i poprawki** (B9) + testy.
7. **docs**: PROJECT_STATE (M73 — audyt), ENGINE_MILESTONES (M73), HANDOFF.
8. **weryfikacja**: pełne `npm test`, `npm run build`, quick B0 (`--seeds 4`),
   pełne B0 13500 (jeśli zmiany bota/komend — tak, zmieniamy ofertę i timing).

## Ryzyka / pułapki

- `edit_file` psuje polskie znaki → python3 Path.read_text/write_text.
- Po każdym commicie `git push origin arena/019ff0e1-mtg` (sandbox potrafi
  cofnąć HEAD do main); przy rozjeździe `git fetch && git reset --mixed
  FETCH_HEAD`.
- Zmiana oferty komend bota (Fireball bez decyzji, equip instant) = pełny B0
  obowiązkowy; hunter seeds w table-session mogą wymagać przelosowania.
- Eventy triggerów = zamknięta lista (strażnik) — zmiana nazwy
  `enchanted_creature_combat_damage_to_opponent` wymaga aktualizacji strażnika.
- Zdolności na stosie — aktualizacja ~wszystkich testów equip/cycling (wzorzec
  resolveStack z D); determinizm replay pilnowany fingerprintem.
