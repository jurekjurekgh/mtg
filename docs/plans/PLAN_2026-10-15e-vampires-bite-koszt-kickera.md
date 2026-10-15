# Plan: Vampire's Bite — koszt kickera w tytule grupy (zgłoszenie I)

Data: 2026-10-15. Gałąź: `arena/3a534672-mtg`. PR: #166.

## Rozpoznanie

- Karta: `{B}` + kicker `{2}{B}` (Scryfall, `docs/cards/scryfall-vampires-bite.json`); łącznie 2BB. Dane w
  `card-data.js` są zgodne (`kicker: { cost: 3, colors: ['B'] }`).
- Etykiety pojedynczych opcji (`commandLabel`) są poprawne: „koszt B + kicker 2B”.
- Błąd: tytuł grupy panelu („Twoje działania”), `choiceGroupTitle` → gałąź „Cel czaru:” w `render.js`,
  dla grupy kickerowej pokazuje „Cel czaru: Vampire's Bite (kicker) (koszt B)”. Koszt bierze się z wydruku
  (`cardCostHtml(object)`) i nie dolicza kickera.

## Etapy

1. [x] RED — test `test/uwaga-i-vampires-bite-kicker-koszt-2026-10-15.test.js`: tytuł grupy kickerowej nosi koszt łączny
   („koszt B + kicker 2B”); grupa bez kickera zostaje „koszt B”.
2. [x] GREEN — wspólny helper kosztu rzutu (baza + kicker, z danych karty), użyty w gałęzi tytułu grupy.
3. [x] Mutacja — helper nie dolicza kickera → test pada.
4. [x] `npm test > log 2>&1`, build, commit, push, opis PR #166 (wiersz I).

## Ryzyka

- Kicker zwrotem lądu (Chocobo Kick) ma inną składankę (`zwrot lądu`); etykieta opcji już ją obsługuje, tytuł musi
  zgodnie z nią. Nie zmieniać treści tytułów testowanych gdzie indziej bez przeglądu.
- Nie scalać PR (decyzja właściciela).

## Wykonanie (2026-10-15)

- RED: 1/3 pada (tytuł kickerowy), strażniki przechodzą.
- GREEN: 3/3. Helper `castCostWithKickerHtml` w `render.js`, użyty w `choiceSourceTitle` (gałąź „Cel czaru”/„Tryb czaru”).
- Mutacja (helper bez kickera) → test 1 pada.
- Powiązane (kicker/tytuły grup): 916/916. `npm test`: 8252/8252 rc=0. Build OK.
- Nie zmieniano gałęzi grup wielotrybowych (`choiceGroupTitle`, „Rzuć: … (koszt)”): żadna karta z kickerem nie ma w niej trybów; przy takiej karcie ta gałąź wymaga osobnego zgłoszenia.
