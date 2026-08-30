# PLAN M257 r5 — „Uwagi z testów” (2026-08-30) — A: hover w Rozgrywce, B: blok pod presją życia, C: ekran cel/poświęcenie

**Sesja:** `arena/01a04e98-mtg` (PR #88 — kontynuacja; 1 sesja = 1 gałąź = 1 PR).
**Baza:** `a6f2373` (po r4: fix A CR 508.1, T1/T4 aura, pętla 0 defektów;
`npm test` 3765/3765, build 2914.8 kB).

## Zlecenie właściciela (runda 5 uwag)

> **A.** Na warstwie Rozgrywka najechanie kursorem na miniaturkę karty powinno
> powodować wyświetlenie hovera powiększonej karty (ze scryfall) analogicznie
> jak na stole (bez trybów FOT i KON).
>
> **B.** Bot ma 5 życia i na stole kreaturę 2/2. Ja atakuję kreaturą 3/3. Bot
> nie blokuje. To trochę bez sensu w takim stanie życia.
>
> **C.** Czar Bone Splinters. Ponownie tworzenie wszystkich możliwych
> kombinacji zamiast osobnych wyborów „ptaszkiem” wśród → cel czaru z możliwych
> celów i → cel poświęcenia z możliwych celów.

## Rozpoznanie (root cause przed kodowaniem)

### A — brak hovera w modalu „Rozgrywka”
- `renderBotMoves` (render.js) buduje miniaturki z `buildCardVisual` + gestem
  tap (pełny ekran) — **bez** `mouseenter/mouseleave`. Kafle stołu mają hover
  (`tile()` → `opts.hover.start(info, e)` → `renderHoverPreview(els.hoverPreview,
  info, mode)` + pozycjonowanie przy kursorze).
- Warstwa preview (`.hover-preview`, z-index 2400) jest WYŻEJ od modali
  (z-index 1500) — po dopięciu handlera podgląd zadziała w środku modala.
- „bez trybów FOT i KON” = tor `scryfall` stały (bez cyklowania scrollem).

### B — wycena bloku nie zna presji życia
- `declare_blockers` (heuristic-bot.js): blok = `+mocAtakującego
  − (moc+w. ginącego blokera) − 1` = 3 − 4 − 1 = **−2 < 0 (pass)** w scenariuszu
  5 życia / 2/2 vs 3/3. Bony życia (±40/±30, M146) działają tylko przy
  ataku **lethalnym** (3 ≥ 5? nie) — obrażenia 3 z 5 życia nie liczą się wcale.
- Fix: premia przeżycia do wariantu blokującego, gdy atak bez bloku zostawia
  gracza przy niskim życiu (progi: ≤2 → +6, ≤5 → +4, ≤8 → +2, wyżej → 0).
  Wariant pass bez zmian; wysokie życie = wycena jak dotąd (brak regresji).

### C — enumeracja kombinacji (cel × poświęcenie) w modalu
- `legalSpellCasts` (spells.js) enumeruje iloczyn kartezjański
  (cele × `sacrificeTargetId`) jako osobne komendy `cast_spell` — poprawne dla
  botów; UI grupuje warianty w JEDNĄ grupę (`spell:${objectId}`), ale modal
  pokazuje KAŻDĄ kombinację osobno (3×3 = 9 wierszy).
- Istnieje już dokładnie żądany wzorzec: `renderMultiTargetWizard`
  (ekran „ptaszki”, M195/C1 Fireball, M200/C mulligan, M207 pozycje celu) —
  zatwierdzenie oddaje komendę z `legalCommands` (L48). Brakuje w nim wymiaru
  **poświęcenie** (slot = `cmd.sacrificeTargetId`, nie `cmd.targets[i]`).
- Zakres kart z kosztem „sacrifice a creature” (sprawdzone w rejestrze):
  `bone-splinters`, `severed-strands` (cel + poświęcenie), `village-rites`
  (sam poświęcenie, bez celu — lista prosta zostaje), `lash-of-the-balrog`
  (warianty poświęcenia ORAZ alternatywny pay {4} — grupa mieszana; ekran
  obejmowałby tylko część wariantów i chował payAlt → zostaje lista).
  Plan ekranu: grupa, w której **wszystkie** warianty niosą `sacrificeTargetId`
  i mają ≥1 cel, oraz ≥2 unikalnych poświęceń.

## Etapy

### Etap 1 — A: hover scryfall na miniaturkach w „Rozgrywce” — commit
- render.js:
  - wyciągnięcie pozycjonowania/pokazywania preview w `showHoverPreviewAt(els,
    info, e, mode)` (hover stołu zostaje identyczny, z cyklowaniem trybów);
  - `createScryfallHover(els)` — hover z toru STAŁEGO `scryfall` (bez
    cyklowania; `null` na dotyku — jak stół);
  - `renderHoverPreview(..., { showCycleHint })` — bez podpowiedzi „scroll
    zmienia tor” przy torze stałym;
  - `renderBotMoves(host, moves, session, { onCardClick, hover })` —
    `mouseenter/mouseleave` na miniaturce.
- main.js: hover scryfall tworzony raz (els stałe) i przekazywany do
  `renderBotMoves`.
- Test (MiniDom, wzorzec m195): miniaturka wywołuje `hover.start` z danymi
  karty (cardId/name) i `hover.end` po opuszczeniu; bez `hover` — brak
  listenerów.
- Bramki: `npm test` + `npm run build`. Commit + push.

### Etap 2 — B: premia przeżycia w wycenie bloku — commit
- RED: test właściciela (bot 5 życia, własny 2/2 bez choroby, atakujący 3/3,
  krok `declare_blockers`) — bot BLOKUJE; anti-overfix: 30 życia — wycena
  bloku poniżej passu (scenariusz bez zmian).
- Fix: `declare_blockers` w heuristic-bot.js — `lifeAfter = myLife −
  attackThreat`; do wariantu blokującego premia `≤2 → +6, ≤5 → +4, ≤8 → +2`.
- Golden-master (`test/fixtures/bot-scoring-snapshot.json`): świadoma
  regeneracja, jeśli zmiana ruszy ślady (jak przy fixu A r4).
- Szybki profil benchmarku (regresja bota) PRZED i PO — `node
  tools/benchmark.mjs` (bez `--full`, ADR 0018).
- Bramki: `npm test` + `npm run build`. Commit + push.

### Etap 3 — C: ekran „cel + poświęcenie” (ptaszki) — commit
- multi-target.js:
  - `sacrificeCastPlanOf(commands)` — plan dla grupy rzutów, gdzie wszystkie
    warianty mają `sacrificeTargetId` i ≥1 cel oraz ≥2 unikalne poświęcenia
    (generycznie po kształcie — ADR 0002); `slots: [cele, ofiary]`,
    `sacrificeSlot: 1`;
  - `commandForSacrificeSelection(commands, { target, sacrifice })` — komenda
    z legalCommands albo null (L48).
- choice-request.js: `renderMultiTargetWizard` — slot `plan.sacrificeSlot`
  dopasowuje do `cmd.sacrificeTargetId` (nie `cmd.targets[i]`); klucze toggle
  w trybie slotowym per-slot (pule celu i ofiary MOGĄ się nakładać — M207
  zakładał rozłączne sloty, tu nakładanie jest regułą).
- main.js `openChoiceRequest`: po gałęzi `multiPlan` — `sacrificePlan` →
  `renderMultiTargetWizard` (etykiety slotów: pozycja celu z Oracle
  `spell.targets[0]` + „Poświęcenie (koszt)”).
- Testy: plan (czysty) — 3×3 → 2 sloty; grupa 1-ofiara / mieszana (payAlt) /
  bez celu → null; `commandForSacrificeSelection` (legalny + nielegalny +
  fizzle target=ofiara); wizard MiniDom — wiersze per slot, „Zatwierdź”
  zablokowany dopóki nie oba sloty, zatwierdzenie oddaje komendę z listy.
- Bramki: `npm test` + `npm run build`. Commit + push.

### Etap 4 — dokumentacja — commit
- Opis PR #88: sekcja „Etap r5” (A/B/C + bramki + benchmark) + odświeżenie
  „Jak sprawdzono”; `docs/PROJECT_HISTORY.md` (wpis sesji); aktualizacja planu
  (odhaczenia + podsumowanie). Push.

## Ryzyka / pułapki

- **C:** nakładające się id w pulach (cel = własny stwór może być też ofiarą)
  → klucze toggle per-slot; fizzle (cel = ofiara) musi pozostać osiągalny
  (komenda istnieje → „Zatwierdź” włącza; M102/U8).
- **C:** nie chować wariantów `payAltCost` (Lash of the Balrog) — plan tylko
  dla grup 100% „poświęcenie”.
- **C:** L48 — UI nie buduje komend; zatwierdzenie = komenda z
  `legalCommands` (brak = przycisk wygaszony).
- **B:** zmiana wyceny = możliwa regeneracja snapshota (świadoma) + regresja
  benchmarku quick profile do opisu commita.
- **A:** z-index preview (2400) > modal (1500) — zweryfikowane; rerender modala
  przy każdym ruchu bota podmienia węzły (listeners przy nowym renderze).
- Bash ucina długie wyjścia (L78); pliki z polską treścią edytuj przez
  python3 (ENVIRONMENT §4).
