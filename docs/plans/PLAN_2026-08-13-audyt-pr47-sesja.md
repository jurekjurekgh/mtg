# Plan: audyt PR #47 + naprawa CR/Oracle (2026-08-13)

Sesja: `arena/019ffc29-mtg`. Start z `main` = `d3ea9a2` (squash PR #47).
Obowiązek ADR 0016 A: audyt scalonego PR, potem naprawa znalezionych naruszeń
CR/Oracle u root cause. Batch 33 czeka na listę właściciela — nie zaczynać.

## Cel

1. Udokumentować audyt PR #47 (Batch 32 + hexproof/Fear + brąz + 100% Oracle
   + grant mana Embrace).
2. Naprawić 3 twarde błędy vs CR/Oracle odsłonięte przez Ballista Watcher
   (`supported` + `limitations:[]` = pierwsza realna karta daybound) i
   Soulbright Flamekin.
3. Nie ruszać: Jwari „you may copy", Awaken „you may destroy equipment",
   uproszczenia katalogu 1–31, bot (poza tym, że benchmark może złapać bug).

## Audyt PR #47 — wnioski (wykonany przed planem)

Źródło: commity PR #47 przed squash (`8dd8d92` plan → `3fca599` hexproof/Fear
→ `a44dbde` feat B32 → `2c56df4` brąz → `f82556d` 100% Oracle → `94e226e`
grant Embrace) oraz kod na `main`.

### OK — nie ruszać

- Flashback: `cast_flashback`, `flashedBack` → exile (resolve +
  `moveObjectDirectly` CR 702.34b, także kontrczar).
- Shield: replacement damage/destroy, NIE `damagedThisTurn`; 0 toughness
  NIE zużywa tarczy.
- Constellation: `enchantment_you_control_enters` — aura po attach ma
  `kind:'aura'`, ale `types` wciąż `Enchantment`.
- Saddle 2: jak crew, `timing:'sorcery'`, exclude self, `effectivePower`.
- Fathom: `creature_opponent_damaged_this_turn`; infect →
  `markDealtDamageThisTurn`.
- Fierce Empath search: `librarySearchMatches` honoruje `minManaValue`/`kind`.
- Embrace: `creature_or_land`; +2/+2 tylko gdy host jest stworem;
  grant `{T}: 2 many JEDNEGO koloru`; `planGrantManaColors` w `spendMana`.
- Hexproof w `legalTargetCandidates` artifact/aura; Fear ETB `requiresTarget`
  + `exile_opponent_creature`.
- ADR 0002: mechaniki B32 generyczne (brak warunków na nazwę/ID karty).
- Plany `Śródziemie`/`Wiedźmin` są ze słownika kolekcji — nie „naprawiać".

### BUG A — Day/Night CR 502.2 / 730.2 (Ballista = pierwsza realna karta daybound)

M68 jest **błędne** vs aktualne CR (502.2 + 730.2 / 702.145):

- TERAZ (źle): dowolny rzut czaru przy daybound na stole → natychmiast noc
  (`triggers.js` ~1576–1582). To nigdy nie było regułą MID; reminder daybound
  mówi „it becomes night **next turn**".
- TERAZ (źle): upkeep w nocy + `lastTurnSpellsCastByPlayer[aktywny]===0` → dzień
  (`triggers.js` ~1778–1783). Zły moment (upkeep zamiast untap), zły gracz
  (nowy aktywny zamiast poprzedniego) i zły próg (0 zamiast ≥2).
- POWINNO (CR 502.2, turn-based action, nie używa stosu):
  na początku tury, **przed untapem** (po phasing — silnik nie ma phasing),
  wg **poprzedniego aktywnego**:
  - day + previous active cast **0** spells → night
  - night + previous active cast **≥2** spells → day
  - `dayNight === null` → brak checku (730.2c / 502.2)
- ZACHOWAĆ: ETB daybound gdy null → day (702.145c); ETB w nocy → nightbound
  face (702.145e); `setDayNight` transformuje in-place (702.145g).
- Testy `test/daybound-nightbound.test.js` **kodują złą regułę** — przepisać.

Hook: w `game-state.js` `pass_priority` **przed** `nextTurnStep` zapisać
`previousActivePlayerId`; po zmianie numeru tury, po skopiowaniu
`lastTurnSpellsCastByPlayer`, **przed** `beginTurn` wołać
`checkDayNightAtTurnStart(state, previousActivePlayerId)`.

### BUG B — Soulbright 8 many bezbarwnej zamiast {R}×8

Oracle: „you may add {R}{R}{R}{R}{R}{R}{R}{R}".
Definicja: `onNthResolve: { n: 3, may: true, effect: { type: 'add_mana', amount: 8 } }`
(brak `colors`).
`applyEffect` add_mana: `colors = effect.colors ?? getSourceForObject(source)?.colors ?? []`.
`getSourceForObject` dla stwora spoza `MANA_SOURCE_MAP` zwraca `null` → `[]`
→ 8 bezbarwnej (klucz `''` w puli).
Fix: `colors: ['R']` w deskryptorze. `addMana(..., 8, { colors: ['R'] })` =
8 czerwonych jednostek.

### BUG C — `abilityResolvedThisTurn` nie resetuje się w cleanup

`clearStatModifiers` (`permanents.js` ~708–723) zeruje licznik TYLKO gdy
`saddled || tempBasePT || damagedThisTurn` albo dirty modifiers. Soulbright
bez pumpów na sobie zostaje na 3 na zawsze → 3. resolve nigdy więcej.
Jest też zduplikowany klucz `abilityResolvedThisTurn: 0, abilityResolvedThisTurn: 0`.
Po pierwszym `replaceObject` gałąź dirty czyta **stary** obiekt.

Fix:
- zawsze zerować, gdy `abilityResolvedThisTurn > 0`;
- w dirty branch brać świeży obiekt (`state.objects.get(object.id)`);
- inkrementować tylko gdy `ability.onNthResolve` (Oracle: „this ability").

## Etapy

- [ ] E0 — plan w repo (ten plik) jako pierwszy commit PR; push; otwórz PR
- [ ] E1 — testy RED: `test/bug-hunt-2026-08-13-audyt-pr47.test.js`
  + przepisanie `test/daybound-nightbound.test.js` do CR 502.2/730.2
- [ ] E2 — fixy chirurgiczne (A/B/C) w engine + deskryptor Soulbright
- [ ] E3 — `npm test` (najpierw bez bot-benchmark), potem pełny + `npm run build`
- [ ] E4 — docs: `PROJECT_STATE.md`, `docs/setup/HANDOFF_2026-08-13-audyt-pr47.md`,
  ten plan (odhacz + podsumowanie); aktualizacja opisu PR

Kolejność commitów (każdy samodzielnie zielony po E2):

1. `docs: plan audytu PR #47 + naprawa day/night, Soulbright, cleanup`
2. `fix(engine): CR 502.2 day/night + Soulbright {R}×8 + reset onNthResolve`
3. `docs: PROJECT_STATE + HANDOFF po audycie PR #47`

## Kryteria ukończenia

- Rzut czaru przy daybound na stole **nie** robi nocy.
- Start tury, previous active 0 spell, jest dzień → noc + transform daybound.
- Start tury, previous active ≥2, jest noc → dzień + transform nightbound.
- Start tury, previous active 0 lub 1, jest noc → zostaje noc.
- `dayNight === null` → check nie rusza designation.
- Soulbright 3. resolve + „tak" → `manaPool.R === 8` (nie bezbarwna / nie any).
- Soulbright: po cleanup 3. resolve znowu działa w następnej turze.
- `npm test` 0 fail; `npm run build` przechodzi.
- Bot nietknięty.

## Ryzyka / pułapki

- `edit_file` psuje polskie znaki → `python3 Path.read_text/write_text`.
- Nie commituj bez testów.
- CI = `node --test 'test/**/*.test.js'` (w tym bot-benchmark ~2.5 min).
  Suite bez niego: `node --test $(find test -name '*.test.js' ! -name 'bot-benchmark.test.js' | sort)`.
- Patch chirurgiczny (ADR 0016 B): nie przepisywać `processTriggers` ani
  `clearStatModifiers` w całości — tylko bloki A/C.
- `lastTurnSpellsCastByPlayer` kopiuje czary **całej** poprzedniej tury gry
  (per gracz). CR 502.2 liczy czary **poprzedniego aktywnego** w tej turze —
  to pole `[previousActivePlayerId]` jest poprawnym źródłem.
- Transform in-place (id zostaje, cardId się zmienia) — testy po cardId.
- Day/night NIE dotyka starych transformów (warunek po keywordach).
- `attachedTo` NIE przechodzi przez `addObject`/`createGameObject`.
- Nie Sherlockować batchy 1–31 / Jwari / Awaken bez prośby właściciela.
