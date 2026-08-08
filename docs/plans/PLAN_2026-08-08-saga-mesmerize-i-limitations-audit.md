# PLAN 2026-08-08 — Saga Mesmerize jako wybór gracza + audyt `limitations`

## Kontekst

Właściciel poprosił o kontynuację projektu po PR #33 (scalony 2026-08-08). W kolejce są dwa tematy z ostatniej sesji:

1. **Mesmerize (Shiva, Warden of Ice — Saga rozdziały I/II)** — `PLAN_2026-08-08-escape-anytarget-mesmerize.md` zostawia Mesmerize jako świadome ograniczenie („wymaga osobnej kolejki `pendingSagaTarget`, odłożone na kolejny commit"). PR #33 domknął Sweet Oblivion Escape i Dragon any-target, ale Mesmerize zostało.
2. **Audyt `limitations`** — po każdej naprawie silnika (T1–T6, M41, M46) wiele wpisów w `card-data.js` mogło stać się przestarzałymi. Plan sesji ma zaproponować co wyczyścić, ale samą decyzję (które karty, jakie ograniczenia są nadal aktualne) podejmuje właściciel.

## Rozpoznanie (przed planem)

**Silnik Sagi** (`src/engine/triggers.js`):

- Saga jest zdolnością triggerowaną z `event: 'saga_chapter'`; wywołuje ją `processTriggers`:
  - **Wejście Sagi** (linia 1094) → `addCounter(lore)` + `queueTriggerToStack` z `sagaChapter: 1` (rozdział I).
  - **Po `step_advanced` do main phase** (linia 1340) → `addCounter(lore)` + `queueTriggerToStack` z `sagaChapter: lore` (rozdziały II, III).
  - **Rozdział trafia na WSPÓLNY STOS** (T6): rozstrzyga się po pełnej rundzie passów jak każdy inny trigger, z LIFO i możliwością odpowiedzi instanitem.
- `fireSagaChapter(state, sagaObject, chapterNumber, events)` (linia 338) dla każdego efektu rozdziału wywołuje `applyEffect(state, effect, sagaObject, findSagaChapterTargets(state, effect, sagaObject))`.
- `findSagaChapterTargets` (linia 308–326) to DETERMINISTYCZNA implementacja: dla `cant_block` zwraca `[najsilniejszy własny stwór]` (tu: `power*2 + toughness`, max na bitwisku). To właśnie problem Mesmerize.

**Wzorzec rozwiązania (T2)**: w `tryFire` (linia ~680) jest gotowa ścieżka dla `requiresTarget` w triggerze:

```js
const candidates = triggerTargetCandidates(state, spec, source, extra);
return queueTargetDecision(state, ability, source, candidates, Boolean(spec.optional), [], events, extra);
```

To kolejkuje `state.pendingTriggerTargets` z listą kandydatów (kolejność = dawna polityka deterministyczna, więc boty wstecznie zgodne), `state.turn.priorityPlayerId = controllerId`, emituje `trigger_target_required`. Gracz wybiera komendą `resolve_trigger_target { targetId }` (game-state.js linia 1063 + 2343/2349).

**`triggerTargetCandidates` ma już `creature_you_control`** (linia 224) — wybór stwora spośród kontrolowanych przez źródło. Idealnie pasuje do Mesmerize: „Target creature" = jeden z własnych stworów gracza Shivy (rozdziały I/II nie określają, czy własny czy cudzy — Shivanie nie zależy, bo i tak efekt jest symetryczny: niezależnie od kontrolera niezblokowalny stwór wzmacnia atak).

**Bieżące wpisy `limitations` w `card-data.js`** (159 wystąpień, w tym wiele wciąż aktualnych — to świadome komentarze, nie bugi):

- `highland-game` (linia 89): `obrót twarzą do góry tylko za koszt megamorph` — **aktualne** (mechanika silnika: morph bez kolorów pipów, megamorph z pipami — to dwa różne pola).
- `grizzled-outcasts` (linia 111): `transform tylko przez trigger upkeep` — **aktualne** (silnik nie ma ręcznego obrotu; CR 702.26d: tylko trigger).
- `krallenhorde-wantons` (linia 129): `…; cel Mesmerize wybierany deterministycznie…` — **BŁĘDNE** (to NIE jest karta Sagi Mesmerize; to tylna strona DFC wilkołaka — wpis „skopiowany" z `shiva-warden-of-ice`). Powinno zostać `tylna strona transform — nie można umieścić w talii`.
- `prismari-campus` (linia 240): `scry 1: decyzja wierzch/spód jest realna…` — **aktualne** (resolve_scry działa).
- `jyoti-moag-ancient` (linia 424): 2 wpisy — **obydwa aktualne** (commander zone brak, land creatures to mechanika).
- `armored-skaab` (linia 866): `mill nie kończy gry poza draw stepem` — **aktualne** (świadome uproszczenie).
- `tumbleweed-rising` (linia 885): `Plot działa jako deterministyczna akcja z ręki` — **aktualne** (Plot to deterministyczny alternate cost w naszym silniku; nie ma wyboru timingu, jak w wielu grach deckbuilder — wpis poprawnie opisuje zachowanie).
- `release-the-ants` (linia 957): 2 wpisy o clash — **obydwa aktualne** (resolve_clash_choice, pusta biblioteka przegrywa).
- `porcelain-legionnaire` (linia 967): 2 wpisy (phyrexian, first strike) — **obydwa aktualne** (phyrexian = wybór gracza mana/życie, first strike bez double strike).
- `curate` (linia 984): 2 wpisy o surveil — **obydwa aktualne** (resolve_surveil + czeka na decyzję).
- `cloudshift`/inne aury: `lock_untap` (linia 1288) — **aktualne**.
- `aerith-rescue-mission` (linia 1621): `modal Choose one: gracz wybiera tryb i cele` — **aktualne** (M40 enumeracja wariantów).
- `porcelain-legionnaire` artId `4e63` (literówka z PR #33) — **nieaktualny** w opisie, ale kod poprawiony. Wpis w limitations nie istnieje, więc nic do roboty.
- `scorned-villager` (linia 1156): `transform tylko przez trigger upkeep` — **aktualne** (jak wyżej).
- `moonscarred-werewolf` (linia 1181): ten sam błąd co `krallenhorde-wantons` — Mesmerize wpisany do wilkołaka. **BŁĘDNE**.
- `terror`-aury `cant_block if black` (linia 2512): `ograniczenia liczone przy odczycie` — **aktualne** (CR 604.3, poprawne).
- `etherium-sculptor` (linia 2622): `obniżka redukuje wyłącznie część generyczną kosztu…` — **aktualne** (CR 601.2f, nasz `effectiveSpellManaCost` z capem).
- `seers-lantern` (linia 2708): `produkcja {C} = 1 bezbarwna many` — **aktualne** (po M41).
- `marut` (linia 1988): `mana from a Treasure…` — **aktualne** (CR 601.2f).

**Reasumując**: z 159 wpisów znalazłem **2 błędne** (skopiowane Mesmerize w wilkołakach) i **1 do dopisania** (Shiva po naprawie). Reszta jest aktualna.

## Cel

1. **Mesmerize (Shiva, Warden of Ice)** — rozdziały I/II „Target creature can't be blocked this turn" to WYBÓR kontrolera Sagi (blokująca decyzja `resolve_trigger_target`), a nie determinizm.
2. **Cleanup `limitations`** — usunąć błędne wpisy Mesmerize z `krallenhorde-wantons` i `moonscarred-werewolf`; `shiva-warden-of-ice` po naprawie dostaje `[]` (oprócz `tylna strona transform…`).
3. **Bez zmian mechanik botów** — boty biorą pierwszą ofertę (wzorzec z T2, T6), więc dotychczasowe zachowanie „najsilniejszy własny stwór" zostaje jako domyślne, gdy kontroler nie wskaże inaczej.

## Zakres (3 commity po planie)

### Commit 1 — `feat: Mesmerize (Shiva I/II) — wybór gracza przez resolve_trigger_target`

**Silnik** (`src/engine/triggers.js`):
- `findSagaChapterTargets` (linia 308–326) — usunąć obsługę `cant_block`; ta funkcja powinna teraz ZAWSZE zwracać `[]` (sagi z celowanymi efektami korzystają z `pendingTriggerTargets` + T2 ścieżka; boty: pierwsza oferta = dawny wybór = „najsilniejszy własny stwór" według `triggerTargetCandidates`).
- Nowa funkcja `sagaTargetCandidates(state, effect, source)` — dla `cant_block` zwraca stwory kontrolera źródła (jak `creature_you_control`). Używana przez `tryFire` (świeża ścieżka dla Sagi) do zebrania kandydatów przed `queueTargetDecision`.

**Saga jako trigger z celem** (`src/engine/triggers.js`):
- Dodać pole `effectRequiresTarget: { type: 'creature_you_control' }` do deskryptora zdolności rozdziału Sagi (per rozdział) — ale czy w ogóle potrzebne? **Sprawdzone**: rozdziały Sagi w engine nie mają `requiresTarget` na zdolności (są generowane automatycznie: `{ type: 'triggered', trigger: { event: 'saga_chapter' }, effect: [] }`). Decyzja: zamiast rozszerzać kontrakt Sagi, **rozdzielić rozstrzyganie Sagi na dwa tryby**:
  - **Bez `requiresTarget`**: deterministyczne (zachowanie obecne, zostaje jako fallback, choć po commicie 1 i tak nie obsługuje już `cant_block`).
  - **Z `requiresTarget` w `chapterEffect`**: nowa gałąź w `fireSagaChapter` — przed `applyEffect` kolejkuje `pendingTriggerTargets` z listą kandydatów, a `applyEffect` dostaje `targets = [chosen]` przy rozstrzyganiu.

- Konkretna implementacja (najprostsza):
  - W `fireSagaChapter`, dla efektu z `requiresTarget` → `queueTargetDecision(state, ability, source, candidates, optional, [], events, extra)`, gdzie `ability` = świeża struktura `{ type: 'triggered', trigger: { event: 'saga_chapter', requiresTarget: effect.requiresTarget }, effect: [effect] }`. Kolejka `pendingTriggerTargets` ma już obsługę `resolve_trigger_target` w `accepted()` (game-state.js linia 2343/2349) + `resolveTriggerEntry` w triggers.js (T2). Gracz wybiera → `resolve_trigger_target { targetId }` → wpis w `pendingTriggerTargets` jest konsumowany → `resolveTopOfStack` ściąga rozdział ze stosu → `resolveTriggerEntry` → ścieżka `sagaChapter` → ponowne `fireSagaChapter` z już wybranym celem (zapisanym w `pendingTriggerTargets.targetId` → `targets` przy rozstrzyganiu).
  
  **Ale to dwuprzebiegowe** (najpierw kolejka decyzji, potem rozstrzygnięcie Sagi). Sprawdźmy jak to się robi w Greatsword (equipment): jest to `specOverride` + `queueTargetDecision` z `fixedTargetIds` — JEDNO wejście do `resolveTriggerEntry` z już wybranym celem. Czyli rozwiązanie jest proste: po wybraniu celu przez gracza `queueTargetDecision` → `resolveTriggerEntry` → ścieżka `sagaChapter` → `fireSagaChapter` z `targets` pochodzącymi z `payload.targets` (które T2 obsługuje).

  **Ostatnia weryfikacja**: T2 + Greatsword mają już gotowe `targets` w `payload.targets` przy `resolveTriggerEntry` (linia ~415 w `resolveTriggerEntry` po `applyTriggerEffects(state, payload.ability, source, payload.targets ?? [], ...)`). Trzeba jedynie:
  1. w `fireSagaChapter` dodać gałąź „jeśli efekt ma `requiresTarget`, KOLEJKUJ `queueTargetDecision` zamiast `applyEffect`" (resolveTriggerEntry i tak ma ścieżkę `sagaChapter` poniżej);
  2. w definicji Sagi w `card-data.js` dodać `requiresTarget: { type: 'creature_you_control' }` do rozdziałów I/II.

  **Najprostsze**: `fireSagaChapter` pobiera `targets` z zewnątrz (jak `Greatsword` z `specOverride` + `queueTargetDecision`). W `resolveTriggerEntry` ścieżka sagaChapter już wywołuje `fireSagaChapter(state, source, extra.sagaChapter, localEvents)` BEZ targets. Musimy przekazać targets do `fireSagaChapter` z `payload.targets`. To jest minimalna zmiana.

**Karta** (`src/cards/card-data.js`, `shiva-warden-of-ice`):
- W `saga.chapters[0]` i `saga.chapters[1]` rozdziały I/II mają `[{ type: 'cant_block' }]` — zmienić na `[{ type: 'cant_block', requiresTarget: { type: 'creature_you_control' } }]`. Efekt `cant_block` z celem typu `creature_you_control` już istnieje w `effects.js` (linia 1345) — przy `targets[0]` ustawia `cantBlock: true` na stworze. **Nie wymaga zmian w `effects.js`**.
- `limitations`: usunąć `; cel Mesmerize wybierany deterministycznie: własny najsilniejszy stwór` (zostaje tylko `tylna strona transform — nie można umieścić w talii`). Status pozostaje `limited` (DFC back face).

**Testy** (`test/trigger-target-decisions.test.js`):
- Nowy test `Shiva Mesmerize: rozdział I kolejkuje resolve_trigger_target (własne stwory jako kandydaci)`:
  - setup: p1 ma Shivę (Saga) na bitwisku + 2 stwory (np. `addCreature(state, 'cre1', 'p1', 3, 3)` + 'cre2', 'p1', 1, 1).
  - `jumpToStep` do `main, p1` → saga powinna zwiększyć lore i odpalić rozdział I (jest już na stosie z ETB; ponownie rozdział II po `step_advanced` do main? Sprawdzić: rozdziały I/II/III = 3; Shivanie wchodzi z lore=1 → rozdział I, potem po draw stepie lore=2 → rozdział II, lore=3 → rozdział III; rozdziały I/II mają efekt `cant_block` z celem). Setup bezpośredni: ustaw `lore=2` na Shivie + ręcznie wywołaj `queueTriggerToStack` z rozdziałem II (jak w istniejących testach rozdziałów — albo lepiej: pełna ścieżka `step_advanced`).
  - Oczekiwane: `state.pendingTriggerTargets.length === 1`, `candidates: ['cre1', 'cre2']` (w kolejności bitwiska), `priorityPlayerId === 'p1'`.
  - `playerView(p1).legalCommands` zawiera `resolve_trigger_target` z `targetId` w kolejności `cre1, cre2`.
  - Gracz wybiera `cre2`: `cantBlock: true` ustawiony na `cre2`; `trigger_resolved` w `state.events`; bot wstecznie zgodny.
- Test `Shiva Mesmerize: brak własnych stworów = rozdział bez efektu (CR 608.2b)`:
  - Setup: tylko Shivanie na bitwisku, lore=1.
  - Oczekiwane: `findSagaChapterTargets`/`sagaTargetCandidates` zwraca `[]`; trigger NIE odpala (jak `requiresTarget` z `optional: false` i pustymi kandydatami — ścieżka T2 w `tryFire`); w `pendingTriggerTargets` pusto. Rozdział zostaje na stosie, ale nie wywołuje `applyEffect` (i tak nic by nie zrobił, bo brak celu).
  - Sprawdzić: czy to jest poprawne zachowanie MtG? W MtG: „Target creature can't be blocked this turn" wymaga celu — bez legalnego celu rozdział I/II Shivy nic nie robi (CR 608.2b: „If an effect requires a choice and there are no options, the effect does nothing"). Tak, to poprawne.

**Build**:
- `npm test` → 1025 + 2 nowe = 1027/1027.
- `npm run build` → 49 modułów / 1091 kB (bez zmian struktury).
- `node tools/benchmark.mjs` → B0 informacyjnie, **bez progu regresji** (zmiana dotyczy 1 karty, która i tak jest limited/nie do talii — brak wpływu na boty na taliach singleton). Wykonać PRZYNAJMNIEJ jeden pełny B0 (9 talii, 50 seedów, 13500 meczów) dla pewności, że nic się nie zepsuło.

### Commit 2 — `chore: cleanup błędnych wpisów Mesmerize w tylnych stronach DFC wilkołaków`

`src/cards/card-data.js`:
- `krallenhorde-wantons` (linia 129): `limitations: ['tylna strona transform — nie można umieścić w talii; cel Mesmerize wybierany deterministycznie: własny najsilniejszy stwór']` → `limitations: ['tylna strona transform — nie można umieścić w talii']`.
- `moonscarred-werewolf` (linia 1181): j.w.

To jest **środkowy krok sprzątania** po commicie 1 (który usuwa Mesmerize z `shiva-warden-of-ice`).

### Commit 3 — `docs: aktualizacja dokumentacji (HANDOFF, PROJECT_STATE, ENGINE_MILESTONES, ROADMAP)`

- `docs/setup/HANDOFF_2026-08-08.md` — nowy plik z podsumowaniem sesji (wzór: poprzednie handoffy).
- `docs/PROJECT_STATE.md` — dopisek sekcji „Sesja 2026-08-08 — M50 (Saga Mesmerize jako wybór gracza + audyt limitations)".
- `docs/ENGINE_MILESTONES.md` — krótki wpis M50 + T21 (Sagi celowane).
- `docs/ROADMAP.md` — tytuł z aktualizacją stanu (jeśli dotychczasowy tytuł nie wspomina o 50 milestone).
- `docs/PROJECT_STATE.md` — krótka informacja o nowej sesji w sekcji „Aktualny bloker".

## Kolejność w PR

1. **commit 1** (roadmapa sesji — ten plik).
2. **commit 2** (Mesmerize: silnik + karta + testy + B0).
3. **commit 3** (cleanup Mesmerize z wilkołaków).
4. **commit 4** (dokumentacja).

## Ryzyka

- **Saga celowana na stosie**: dwuprzebiegowość (kolejka celu → rozstrzygnięcie rozdziału). T2 z Greatsword już ma ten wzorzec (`specOverride` + `fixedTargetIds`). Trzeba upewnić się, że `resolveTriggerEntry` w ścieżce `sagaChapter` (linia ~537) konsumuje `payload.targets` (które `queueTargetDecision` ustawia) i przekazuje do `fireSagaChapter`. **Weryfikacja** przy implementacji.
- **Brak własnych stworów**: rozdział I/II Shivy nic nie robi (CR 608.2b). Test to potwierdza.
- **Determinizm botów**: boty biorą pierwszą ofertę. W MtG „target creature" = `creature_you_control` (najsilniejszy pierwszy, jak dawny determinizm). Kompatybilność wsteczna zachowana.
- **Polskie znaki w `card-data.js`**: edycja `python3` heredoc, NIE `edit_file`.
- **B0**: brak progu regresji (limitations, nie zmiana bota), ale wykonać pełny benchmark dla pewności (~9 min).

## Poza zakresem

- Batch 22 (nowe karty z listy właściciela).
- Resztkowe ograniczenie auto-tapu (priorytetyzacja kolorowych źródeł w `spendMana`).
- Inne „wybór gracza zamiast determinizmu" — jeśli po audycie limitations właściciel zgłosi dodatkowe karty, dopiszemy w kolejnej sesji.

## Podsumowanie wykonania (do wypełnienia po commicie 4)

(sekcja do wypełnienia po zakończeniu pracy — wg AGENTS.md, „etap zamknięcia sesji")
