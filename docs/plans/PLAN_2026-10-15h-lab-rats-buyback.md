# Plan 2026-10-15h — Lab Rats: buyback z własną etykietą

Zgłoszenie testera (tura 14, uwaga M): Lab Rats ma Buyback {4}. Oferta z buyback
i zwykły rzut mają identyczną etykietę „Rzuć: Lab Rats (koszt B)”, więc gracz
nie wie, który przycisk to który.

## Rozpoznanie

- Decyzja o buyback zapada PRZY RZUCANIU (CR 702.27a „as you cast this spell”,
  dodatkowy koszt jak kicker). Silnik: flaga `buyback: true` na komendzie
  `cast_spell` (`src/engine/spells.js` ≈3572–3584 enumeruje wariant tylko wtedy,
  gdy stać na bazę + {4}). Na stosie decyzji nie ma. Oferta jest więc już
  poprawna jako osobny wariant rzutu; brakuje etykiety.
- Etykieta: `commandLabel` (`src/table/render.js` ≈3580) składa koszt z druku
  (`costOfCard`), `xPart`, `kickerPart`, `phy`. Nie zna `buyback`.
- Klucz grupy: `choiceRequestGroupKey` (`render.js` ≈462) i fallback w
  `src/table/main.js` ≈1826 rozdzielają kicker, ale nie buyback. Dla czarów z
  celem warianty z buyback wpadłyby do jednej grupy z rzutem zwykłym.
- Tytuł grupy celowanej: `castCostWithKickerHtml` (`render.js` ≈2466) — tu też
  trzeba dopłaty buyback, żeby tytuł nie podawał samego druku.

## Zakres

1. `test/uwaga-m-lab-rats-buyback-2026-10-15.test.js` — RED (M/2, M/4).
2. `render.js`: helper `buybackCostSuffixOf` (` + buyback {4}`, format jak kicker),
   użyty w `commandLabel` (cast_spell) i w `castCostWithKickerHtml`.
3. Klucz grupy: `choiceRequestGroupKey` i fallback w `main.js` — `:buyback`.
4. `npm test` z logiem, build, push, PR #166 przez REST (bez scalania).

## Mini-roadmapa

- [x] Rozpoznanie (moment decyzji: przy rzucaniu, jak kicker).
- [x] RED M/2 i M/4 (odtwarza tekst zgłoszenia).
- [ ] GREEN (etykieta + klucz grupy).
- [ ] Testy powiązane, `npm test` rc=0, build rc=0.
- [ ] Push, opis PR #166, odpowiedź właścicielowi.
