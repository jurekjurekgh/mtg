# Plan: Kolorowa pula many (MtG-correct) — naprawa bezbarwnej puli

- **Data:** 2026-08-06
- **Sesja:** `arena/019fd8a4-mtg` (kontynuacja PR #31)
- **Decyzja właściciela:** „Zdecydowanie i jednoznacznie 1" — kolorowa pula many.
- **Cel:** rzucanie czarów zgodne z zasadami MtG — do rzutu potrzebne źródła many,
  **które można użyć (untapped)**, sprawdzone **przed** tapnięciem; tapnięcie
  produkuje **kolorową** manę, która naturalnie opłaca pip koloru.

## Root cause (dlaczego był nonsens)

Pula many w engine jest **bezbarwna** (`player.mana` = liczba; udokumentowane
uproszczenie z M2). Engine nie wie, że mana z Wyspy jest niebieska, więc kolory
sprawdza **statycznie** (`hasColorForObject` → `allControlledManaSources` — liczy
wszystkie kontrolowane źródła, **wliczając tapnięte/zużyte**). Stąd nonsens:
rzut czaru {U} „wystarczy posiadać" Wyspę, nawet tapniętą. Kreator próbował to
obeść bandażem „committed" (śledzenie tapniętych w sesji) — wsteczne i błędne.

## Projekt: kolorowa pula, `player.mana` jako total

**Klucz zachowania wstecz i małego blast radius:** `player.mana` ZOSTAJE liczbą
(total many w puli) — dla amount, wyświetlania, `producibleMana`, fingerprintu,
botów i większości testów. **Równolegle** dodajemy `player.manaPool` — mapę
jednostek many po ich „profilu kolorów" (klucz = posortowane kolory; wartość =
liczba). Suma wartości == `player.mana`.

Jednostka many = zbiór kolorów, jakie może opłacić jako pip:
- Wyspa → `['U']`; Równina → `['W']`; Las → `['G']` itd.
- dwubarwny land (Prismari Campus, Raucous Carnival) → `['U','R']` / `['R','W']`
  (poprawnie: opłaca U LUB R, nie G).
- „dowolny kolor" (Rupture Spire, Skarb, Holdout, Dragonbroods' Relic) →
  `['W','U','B','R','G']` (opłaca dowolny pip).
- bezbarwna (Apprentice Wizard {C}{C}{C}, Unstable Frontier {C}) → `[]`
  (opłaca tylko generyczną).

`canPayColoredCost(pool, untappedSourceUnits, requirements, genericNeeded)` —
dopasowanie (backtracking) pipów do jednostek many (pula + untapped źródła);
każdy pip do innej jednostki o przecinającym się zbiorze, reszta na generyczną.

## Komponenty do zmiany

1. **`src/engine/mana-sources.js`** — `getSourceForObject` już daje `colors`.
   Dodać pomocniczą `manaUnitColors(source)` (pojedynczy → ten kolor; dowolny →
   5 kolorów; pusty → `[]` generyk). Używana przez tapLandForMana i add_mana.
2. **`src/engine/resources.js`** (rdzeń):
   - `initializeResources`/`resetTurnResources`: `player.manaPool = {}` (pusto).
   - `addMana(state, playerId, amount, { colors = [], fromTreasure })`:
     `mana += amount`; `manaPool[key(colors)] += amount` (kompatybilne wstecz —
     stara sygnatura `addMana(state, p, amount)` → `colors=[]` = generyk).
   - `tapLandForMana`: produkuje **kolor** landu (`manaUnitColors(getSourceForObject)`),
     nie 1 bezbarwną.
   - `spendMana(state, playerId, amount, requirements = [])`: konsumuje z puli
     po pipach (każdy pip → pasująca jednostka; reszta generyczna); `mana -= amount`.
     Auto-tap (gdy pula < amount): tapuje **kolorowopasujące** źródła najpierw
     (dla niepokrytych pipów), potem generyczne — by wyprodukowana mana miała
     właściwe kolory. `treasureMana` zachowane.
   - `hasColorManaForCard`: **pool + untapped źródła** pokryją koszt (nie
     `allControlledManaSources`). To jest MtG-correct check **przed** tapnięciem.
3. **`src/engine/mana-cost.js`** — `canPayColoredCost(units, requirements,
   genericNeeded)` (nowy); `canPayManaCost`/`canPayColorRequirements` przepięte
   na jednostki (lub pozostają jako pomocnicze dla starych ścieżek).
4. **`src/engine/spells.js`** + **`game-state.js`** — `hasColorForSpell`/
   `hasColorForCardId`/`hasColorManaForObject`: pool + untapped (jak wyżej).
   Wszystkie ścieżki rzutów (`castSpell`, `castCleave`, `castEscape`,
   `castPermanent`, `castAuraSpell`, `castModalSpell`, `plotCard`) przekazują
   `requirements` do `spendMana` (pipy kolorowe z `parseManaCost(MANA_COSTS)`,
   po phyrexian/life).
5. **`src/engine/effects.js`** — handler `add_mana`: produkuje **kolor** źródła
   (`manaUnitColors(getSourceForObject(sourceObject))`; `fromTreasure` → dowolny).
6. **`src/engine/abilities.js`** — `activateAbility` mana: `spendMana` z
   requirements kolorowych kosztu zdolności (zwykle puste — zdolności płacą
   bezbarwną). `manaForActivation` bez zmian (amount).
7. **Kreator `src/table/mana-wizard.js` + `main.js`** — **usunąć „committed"**
   (cz. 4). `wizardProgress` sprawdza, czy **kolorowa pula** (z `session.state`
   przez main.js) pokrywa koszt — pula odzwierciedla kolory tapniętych źródeł,
   więc check jest MtG-correct (bez śledzenia „co tapnąłeś"). Offer
   (castability) = untapped źródła (silnik) — check **przed** tapnięciem.
8. **`src/engine/fingerprint.js`** — `manaPool` do odcisku gracza (determinizm
   replay; zamrożone stringi w `test/fingerprint.test.js` do aktualizacji).
9. **`playerView`** — `manaPool` opcjonalnie w widoku (gdyby kreator chciał z
   widoku); domyślnie main.js czyta `session.state`. `mana_changed` niesie
   `colors` (log UI).

## Boty / benchmark

Boty czytają `player.mana` (total) — **bez zmian**. Ale `hasColor` (untapped)
zmienia, które rzuty są oferowane → **może wpłynąć na B0**. W praktyce boty nie
pre-tapują (M34 usunął `tap_for_mana` z oferty), więc przy rzucie źródła są
nietapnięte → `allControlled ≈ untapped` → oferta w większości bez zmian.
**Pełny B0 mierzony (6300 meczów, progi 0.78/0.57 tylko w górę).**

## Kryteria ukończenia

- [ ] `npm test` zielone (testy kodujące stary nonsens zaktualizowane).
- [ ] `npm run build` przechodzi.
- [ ] Kreator many: check z puli kolorowej (nie committed); offer untapped.
- [ ] Pełny B0: 0 niedokończonych, progi 0.78/0.57 utrzymane.
- [ ] Docs: wpis w `PROJECT_STATE.md`, ADR (pula bezbarwna → kolorowa).

## Kolejność commitów (zielone po każdym)

1. **cz. 5** — ta roadmapa.
2. **cz. 6** — rdzeń kolorowej puli (`manaPool`, `addMana`/`tapLandForMana`/
   `resetTurnResources`/`spendMana(requirements)`/`canPayColoredCost`), addytywnie
   (stare `hasColor` jeszcze działa). Testy jednostkowe puli.
3. **cz. 7** — `hasColor` → pool + untapped (resources/spells/game-state);
   `requirements` przepuszczone przez ścieżki rzutów; `add_mana` kolorowy
   (effects). Poprawka testów kodujących stary model.
4. **cz. 8** — kreator: usunięcie `committed`, check z puli kolorowej; testy.
5. **cz. 9** — fingerprint, `mana_changed` colors, pełny B0, docs (M-wpis + ADR).

## Ryzyka / pułapki

- **Dual lands** (Campus, Carnival): jednostka `['U','R']` opłaca U LUB R
  (poprawnie), nie G — model jednostek-setów obsługuje to dokładnie.
- **Treasure „any color"** + `fromTreasure` (Marut): jednostka 5-kolorowa +
  `treasureMana` zachowane (konsumpcja Skarbów pierwsza).
- **Testy ustawiające `player.mana = N` bezpośrednio** (land-drop.test.js) —
  `manaPool` niezgodny z `mana`. Naprawić: przez `addMana` lub zsynchronizować.
- **fingerprint.test.js** — zamrożone stringi; dodać `manaPool`, aktualizować.
- **Pre-tap kreatora + untapped hasColor**: z kolorową pulą pre-tap działa
  (pula odzwierciedla kolory) — to była blokada przy bezbarwnej puli.
- **Determinizm**: kolejność konsumpcji/spendMana określona (ADR 0005).
- **edit_file psuje polskie znaki** → `python3` (UTF-8); komunikaty commitów
  plikiem w `/home/user`; commit+push po każdym fragmencie.
