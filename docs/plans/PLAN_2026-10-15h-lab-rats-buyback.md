# Plan 2026-10-15h — Lab Rats: buyback z własną etykietą i poprawnym logiem

Zgłoszenie testera (tura 14, uwaga M): Lab Rats ma Buyback {4}. Oferta z buyback
i zwykły rzut mają identyczną etykietę „Rzuć: Lab Rats (koszt B)”, więc gracz
nie wie, który przycisk to który.

Zgłoszenie właściciela (tura 15, rozszerzenie M):
- (a) rzucenie Lab Rats ma dać token Rat 1/1, a właściciel widzi kartę Sorcery
  wchodzącą na pole jako permanent;
- (b) log rozstrzygnięcia buyback mówi „wygrany clash zwraca czar do ręki właściciela”.

## Rozpoznanie

- Decyzja o buyback zapada PRZY RZUCANIU (CR 702.27a „as you cast this spell”,
  dodatkowy koszt jak kicker, CR 702.33). Silnik: flaga `buyback: true` na komendzie
  `cast_spell` (`src/engine/spells.js` ≈3572–3584 enumeruje wariant tylko wtedy,
  gdy stać na bazę + {4}). Na stosie decyzji nie ma.
- Etykieta: `commandLabel` (`src/table/render.js`) nie znała `buyback`.
- Klucz grupy: `choiceRequestGroupKey` (`render.js` ≈462) i fallback w
  `src/table/main.js` ≈1826 nie rozdzielały buyback.
- (b) PRZYCZYNA POTWIERDZONA: buyback ustawia `state.pendingSpellReturnToHand`
  (`spells.js` ≈2451–2452, ≈2883), a `spell_resolved` niesie tylko `returnToHand`.
  Opis w `src/table/session.js` ≈1326 dopisywał clash dla każdego `returnToHand`.
- (a) NIE ODTWORZONE. Sprawdzone ścieżki: (1) talia z `createCardDeck` + `installDeck`
  + dobranie; (2) `execute` cast_spell (zwykły i buyback); (3) `playerView` i lista
  legalnych komend. Wynik: karta w ręce to `kind:'spell'`, `types:['Sorcery']`;
  rzut daje `token_created` (Rat 1/1) i `permanent_entered_battlefield` tylko dla
  tokena; karta idzie na cmentarz, a z buyback wraca do ręki. Tekst logu
  `permanent_cast` dotyczy tylko kart wchodzących jako permanent. Nie znaleziono
  gałęzi UI, która zamienia Sorcery w permanent. Przyczyna nieznana: potrzebny
  zapis kroków albo log właściciela z gry.
- Moment decyzji i etykieta: jak kicker (wariant rzutu z dopłatą, nie drugi wpis o tej samej etykiecie).

## Zakres

1. `test/uwaga-m-lab-rats-buyback-2026-10-15.test.js` — RED (M/2, M/4, M/5), M/6 (clash bez zmian).
2. `render.js`: helper `buybackCostSuffixOf` (` + buyback {4}`, format jak kicker),
   użyty w `commandLabel` (cast_spell) i w `castCostWithKickerHtml`.
3. Klucz grupy: `choiceRequestGroupKey` i fallback w `main.js` — `:buyback`.
4. (b) `spells.js`: `spell_resolved` dostaje `returnedByBuyback` (dwa miejsca zwrotu).
   `session.js`: tekst „buyback: czar wraca do ręki właściciela”; clash tylko bez buyback.
5. `npm test` z logiem, build, push bez force, PR #166 (wiersz M).

## Kontrola zakresu

- `multi-target.js` (kreator załogi): startuje pusty (decyzja A2); `defaultCrewSubset`
  to domyślny podzbiór silnika/bota, więc kreator nie wymaga zmiany.
- `main.js` `openChoiceRequest` (J): zależne od DOM, bez testu jednostkowego. Logika
  wyboru jest w `upToTargetsPlanOf` (`multi-target.js`), pokryta przez
  `test/uwaga-j-up-to-dwoch-kandydatow-2026-10-15.test.js` (4/4). Weryfikacja w żywej grze
  przez właściciela (Justiciar z dwoma przeciwnikami).

## Mini-roadmapa

- [x] Rozpoznanie (moment decyzji: przy rzucaniu, jak kicker).
- [x] RED M/2, M/4 (etykieta, klucz) oraz M/5 (log buyback).
- [x] GREEN (etykieta + klucz grupy): M/1–M/4 zielone.
- [x] GREEN (b): log buyback bez clash, `returnedByBuyback`; M/5, M/6 zielone.
- [x] Próby (a) na silniku, talii, UI: nie odtworzone (patrz Rozpoznanie).
- [x] Testy powiązane (54 pliki, 903/903), `npm test` 8277/8277 rc=0, build rc=0.
- [ ] Commit, push bez force, opis PR #166 (wiersz M).
- [ ] Odpowiedź właścicielowi: (a) poprosić o kroki/log, (b) naprawione.
