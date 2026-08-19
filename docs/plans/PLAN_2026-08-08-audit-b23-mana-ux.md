# PLAN 2026-08-08 — Audyt Batch 23 + UX kosztów many (dwa tematy właściciela)

- **Data:** 2026-08-08
- **Sesja:** `arena/019fe265-mtg` (1 sesja = 1 PR do `main`)
- **Stan wejściowy:** `main` == `66fffbb` (PR #35 scalony: fix B23 UI + Batch 23). `npm test` 1084/1084, build 49/1172.0 kB, withArt 158.

## Temat A — Audyt implementacji Batch 23 (nieufność do poprzedniego agenta)

Weryfikacja runtime wszystkich 10 kart (nie asercje definicji):
skrypt `node /tmp/audit-b23.mjs` (end-to-end przez cast/activate/triggers) → **8/11 PASS**.
**Trzy realne bugi silnika + luka w testach (asercje „pole istnieje" zamiast zachowania):**

1. **Greater Tanuki — Channel nie działa (ReferenceError).**
   `activateChannel` zadeklarowana WEWNĄTRZ `activateCycling` (abilities.js:836),
   wywoływana z `activateAbility` (abilities.js:508) → `ReferenceError: activateChannel is not defined`
   w momencie aktywacji. Test `real-cards-batch23-third` sprawdza tylko
   `def.abilities[0].channel` (istnienie pola) — nigdy nie aktywuje.
   Fix: przenieść `activateChannel` na poziom modułu (root cause = scope funkcji);
   przy okazji naprawić `card_searched` event (po `moveObjectDirectly` stary id
   znika z `state.objects` → `cardId: null`).

2. **Feedback — „Enchant enchantment" nie da się rzucić.**
   `legalAuraCasts` oferuje cel-enchantment (resources.js:546), ale
   `castAuraSpell` (resources.js:486) wymaga `host.kind === 'creature'`
   → „Celem czaru aury musi być stwór na polu bitwy" przy rzucaniu.
   Nawet po obejściu: `resolveAuraSpell` (spells.js:683), `attachAuraToCreature`
   (attachments.js:103) i SBA `removeIllegalAttachments` (attachments.js:212)
   też twardo wymagają `host.kind === 'creature'` (aura zniszczona w SBA).
   Fix: wspólny helper legalności gospodarza dla załącznika (creature /
   enchantment / artifact_or_creature) użyty w 4 miejscach.

3. **Vandalize — tryb „Destroy both" niszczy tylko artefakt.**
   `destroy_permanent` (effects.js:1066) używa `targets[0]` ignorując
   `effect.targetIndex` — drugi efekt ponownie celuje w artefakt (już w grobie →
   no-op). Konwencja w engine: `targets[effect.targetIndex ?? 0]`
   (tap_permanent, return_creature_card_to_hand, player_sacrifices_creature).
   Fix: dostosować `destroy_permanent` do konwencji.

4. **Luka testowa (jak 1–3 przeszły):** `engine-batch23.test.js` i większość
   `real-cards-batch23-*` to asercje definicji. Tylko Scorch (trigger attacks)
   i Expunge (legalTargetCandidates) są behawioralne.
   Fix: nowy `test/audit-batch23-fixes.test.js` — end-to-end: Vandalize 3 tryby,
   Feedback cast+upkeep, Channel aktywacja, Deepwood redukcja, Welder, Shiv's,
   Vow cantAttackYou, Turn the Tide -2/-0.

5. **Korekta danych (po uwadze właściciela):** Greater Tanuki (NEO) i Turn
   the Tide (MBS) — sety wg listy właściciela; pliki Scryfall pobrane przez
   poprzedniego agenta wskazywały wydruki DSC/CNS. Poprawić JSON-i i imageUri
   do właściwych wydruków NEO #189 / MBS #35, NIE zmieniać setów.

## Temat B — UX: koszty many łamią się w HTML (zgłoszenie ponowne)

- Poprzednia łatka (M51, HANDOFF 2026-08-08b commit „C") ustawiła `.ms`
  na `inline-block` + `white-space: nowrap` — zapobiega łamaniu WEWNĄTRZ
  pojedynczej ikony, ale NIE MIĘDZY ikonami: `{2}{W}` to dwa osobne spany,
  przeglądarka może złamać linię między nimi (np. `Rzuć: ... (koszt {2}` / `{W})`),
  w logu dodatkowo `word-break: break-word` (index.html:414) łamie byle gdzie.
- Root cause: sekwencja ikon jednego kosztu nie jest atomowa.
- Fix: `mana-icons.js` — `manaSymbolsHtml` owija wyjście w
  `<span class="ms-group">` (tylko gdy był ≥1 symbol) + CSS
  `.ms-group { display: inline-block; white-space: nowrap; word-break: normal;
  overflow-wrap: normal; vertical-align: -0.12em; }` z zerowaniem marginesów
  skrajnych ikon. W flex `.action` cała grupa = jeden flex-item (nie łamie się),
  w tekście inline przenosi się w całości do następnej linii.
- Nie zamieniamy ikon na litery — da się okiełznać bez utraty czytelności.
- Test: `test/mana-icons-group.test.js` — struktura HTML (ms-group + ikony
  w środku), brak grupy dla tekstu bez symboli.

## Commity (1 sesja = 1 PR, push po każdym)

1. `plan: Audyt Batch 23 + UX kosztów many` (ten plik)
2. `fix(engine): Batch 23 — channel ReferenceError, Feedback enchant enchantment, Vandalize both + testy behawioralne`
3. `fix(UX): koszty many jako niełamliwa grupa (.ms-group)`
4. `docs: raport audytu B23 + korekta setów NEO/MBS + HANDOFF_2026-08-08f`

## Weryfikacja

- `npm test` (1084 + nowe) zielone po każdym commicie, `npm run build` 49 modułów.
- Po fixach skrypt `/tmp/audit-b23.mjs` → 11/11 PASS.
- B0: bez zmian bota — progi 0.78/0.57 nietknięte (nie ruszamy heurystyki).

## Ryzyka / pułapki

- `edit_file` psuje polskie znaki → python3 `Path.read_text/write_text`.
- Fix Feedback dotyka 4 plików — wspólny helper, żeby SBA nie zabiło aury.
- `.ms-group` w wąskich kontenerach: grupa przenosi się w całości (inline-block),
  nie przelewa — sprawdzić przyciski `.action` (width 100%).
- Channel: determinizm (pierwszy basic land w bibliotece + tasowanie seedem).


## Podsumowanie wykonania

- **Commit 1 (plan):** ten plik.
- **Commit 2 (fix engine):** trzy bugi naprawione — channel hoisted na
  poziom modułu (+ usunięty nieistniejący event `card_searched`),
  `isLegalAuraHost` w attachments.js (4 miejsca: legalAuraCasts był już OK,
  castAuraSpell / resolveAuraSpell / attachAuraToCreature / SBA),
  `destroy_permanent` respektuje `targetIndex`. Nowy
  `test/audit-batch23-fixes.test.js` (12 behawioralnych) + rozszerzony
  `test/attachment.test.js` (enchant enchantment). npm test 1097/1097,
  build 49/1174.1 kB.
- **Commit 3 (fix UX):** `manaSymbolsHtml` owija w `.ms-group` (atomowy
  koszt), CSS w index.html. `test/mana-icons-group.test.js` (7). npm test
  1104/1104, build 49/1175.5 kB.
- **Commit 4 (docs):** M54 w ENGINE_MILESTONES/PROJECT_STATE/ROADMAP,
  HANDOFF_2026-08-08f.md, korekta setów NEO/MBS (Greater Tanuki / Turn the Tide).
- **Audyt runtime:** `/tmp/audit-b23.mjs` 8/11 przed → **11/11 po fixach**.
- **B0:** nie mierzony (fixy silnika + CSS; bot deterministyczny, heurystyka
  nietknięta — progi 0.78/0.57 bez zmian).
