# Plan: Jill, Shiva's Dominant — cel ETB także własne permanenty

Sesja `arena/019ff818-mtg`. Uwaga A z testów właściciela (po merge M79):

> Karta Jill, Shiva's Dominant — celuje tylko w permanenty przeciwnika.
> Czy wśród opcji nie powinno być także własnych?

## Ustalenie reguły

Oracle Jill (Scryfall, `docs/cards/scryfall-jill-shivas-dominant.json`):

> When Jill enters, return **up to one other target nonland permanent**
> to its owner's hand.

Brak ograniczenia „an opponent controls" — cel to **dowolny** permanent
niebędący lądem, inny niż samo źródło, w tym własne kontrolera.
Odpowiedź na pytanie właściciela: TAK — własne też powinny być w opcjach.

## Root cause

`src/engine/triggers.js`, typ celu `other_nonland_permanent` (używany
wyłącznie przez Jill) odfiltrowuje własne permanenty źródła:

```js
if (object.controllerId === sourceObject.controllerId) return false;
```

## Fix

Usunąć ten filtr: kandydatami są wszystkie nie-landy poza źródłem (obu
graczy), bez hexproof, najsilniejszy pierwszy. Ujednolicić z generycznym
`nonland_permanent` (Thistledown Players), który już nie ogranicza do
przeciwnika. Poprawić komentarz („nie-landy PRZECIWNIKA" → „inne niż
źródło, obu graczy").

Walidacja (`resolve_trigger_target` w game-state.js) używa
`legalTriggerTargetCandidates` → ten sam `triggerTargetCandidates`, więc
wybór własnego permanentu będzie akceptowany.

## Testy

- Zaktualizować `test/real-cards-batch16.test.js`:
  - `'Jill: nie zwraca własnych permanentów ani landów'` — błędny
    (własne nie-landy mają być CELAMI). Podzielić: landy pozostają
    wykluczone, własne nie-landy stają się legalnymi kandydatami.
  - Dodać pozytywny test: kontroler celuje we własny stwór i wraca on
    na rękę; cel przeciwnika nadal dostępny.
- Upewnić się, że test `'Jill: „up to one"'` (allowNone) w
  `trigger-target-decisions.test.js` nadal przechodzi.

## Kolejność commitów

1. `docs(plan): Jill Shiva's Dominant — cel ETB także własne permanenty`
2. `fix(engine): other_nonland_permanent celuje w obu graczy (Jill)`
3. `test(engine): Jill celuje we własne nie-landy + regresje`
4. `docs: M80 PROJECT_STATE`

## Weryfikacja

- `npm test` zielone (+ nowe regresje).
- `npm run build`.
- Bot bez zmian → pełne B0 niewymagane.

## Ryzyka

- `edit_file` psuje polskie znaki → python3 Path.read_text/write_text.
- `other_nonland_permanent` jest generyczne — sprawdzić, że nie jest
  używane przez inną kartę z intencją „tylko przeciwnik" (grep: tylko Jill).


## Wykonanie (2026-08-12)

- [x] Plan jako pierwszy commit PR sesji.
- [x] `other_nonland_permanent`: usunięty filtr `controllerId === sourceObject.controllerId`
  — kandydatami dowolne nie-landy poza źródłem (własne i przeciwnika).
- [x] Testy: kandydaci obejmują własny stwór; cel własny wraca na rękę;
  cel przeciwnika nadal działa; same landy → brak celu. Zaktualizowano
  błędny test „nie zwraca własnych permanentów".
- [x] `npm test` 1413/0, `npm run build` 50 modułów / 1530.9 kB.
- [x] Docs: M80 w PROJECT_STATE.
