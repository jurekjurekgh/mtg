# PLAN 2026-10-27b — PMSSB-79: nowe mechaniki batcha 70

> **STATUS: WYKONANY (2026-10-27, commity `3a5d93e`/`3c065c3`/`52cd45b`).**
> Raport: `docs/PMSSB.md` §PMSSB-79. Werdykty: 4 DONE (ewazja po typie
> blokera, trigger manifest dread, licznik z cmentarza, Converge damage),
> 4 ZAMKNIĘTE BEZ ZMIANY (X w koszcie permanentu, prewencja zdejmująca
> liczniki, Improvise, drugi cel kickera). Piny:
> `test/audyt-pmssb79-batch70.test.js` (17 + 4 mutacje).
> Etapy P0–P7 odhaczone 2026-10-27c (higiena: plan był WYKONANY, ale
> checkboxy zostały puste — dryf dokumentacji, ADR 0021 pkt 3); treść
> kryteriów bez zmian, odsyłacze do commitów w nagłówku statusu.

Wejście: zgłoszenie właściciela (2026-10-27) — batch 70 domknięty na zielonym
silniku, ale **bez pętli PMSSB**. Wniosek proceduralny (Krok 7 runbooka,
`docs/cards/HOW_TO_ADD_CARD.md`) jest już wpisany osobno (`d2b385b`); ten plan
realizuje samą pętlę dla mechanik batcha.

## Inwentarz mechanik batcha 70 (co już strojone, co nie)

| Mechanika (deskryptor / ścieżka) | Karta | Wcześniejsza pętla? | Decyzja |
|---|---|---|---|
| `xCost` + `cast_permanent {xValue}` (X w koszcie PERMANENTU) | Magma Pummeler | **NIE** (X czarów: PMSSB-? tylko dla `cast_spell`) | pętla |
| `preventDamageByRemovingCounter` (efekt zastępujący, CR 615.1a) | Magma Pummeler | **NIE** | pętla |
| Improvise (`improvisePayments`) | Fen Hauler | **NIE** (bliźniak: convoke PMSSB-72 DONE) | pętla |
| `cantBeBlockedByTypes` (ewazja po typie blokera) | Fen Hauler | **NIE** (bliźniak: `cantBeBlockedByKeywords` PMSSB-60/E) | pętla |
| `manifest_dread_resolved` (trigger) | Paranormal Analyst | **NIE** | pętla |
| `amountFromGraveyardCardType` (kwota licznika) | Moldgraf Millipede | **NIE** (bliźniak: PMSSB-23 liczniki) | pętla |
| Converge: `damage { amount: 'colors_of_mana_spent' }` | Kaleidoscorch | **NIE** | pętla |
| `onlyIfKicked` + `anotherTarget` (drugi cel czaru) | Jilt | częściowo (PMSSB-78 kicker) | pętla (wymiar: drugi cel) |
| produkcja many artefaktu-lądu (`MANA_SOURCE_MAP`) | Vault of Whispers | TAK — PMSSB-32 (mana) | bez pętli, pin istnieje |
| liczniki charge + koszt aktywacji (pump) | Trigon of Rage | TAK — PMSSB-23 + PMSSB-34 | bez pętli, piny istnieją |
| look-top w zdolności aktywowanej | Orazca Puzzle-Door | TAK — PMSSB-24 (filtrowanie) | bez pętli, pin E5 |
| ewazja po mocy (`cantBeBlockedByPower`) | Arlinn's Wolf | TAK — M380/PMSSB-60 | bez pętli |

## Etapy

- [x] **P0** (ten plik) — plan + inwentarz, commit przed kodowaniem.
- [x] **P1** Pomiar PRZED: `tools/pmssb79-batch70-sonda.mjs` — tabele
      score per scenariusz (kierunek × cel × timing × stan) dla 8 mechanik
      z pętli. Wynik w `.arena/pmssb79-pre.txt`.
- [x] **P2** Audyt findingów F1…Fn + fale; kontrole obowiązkowe: L41 (rzut /
      zdolność / trigger-decyzja liczą to samo), koszt (S11), anty-over-fix
      (M429 — najsłabszy realny wariant = dawna wartość).
- [x] **P3** Wdrożenie: pokrętła `<rodzina>*` w `heuristic-params.js`
      (0 = dawne zachowanie) + wspólne helpery w `heuristic-bot.js`.
- [x] **P4** Testy `test/audyt-pmssb79-batch70.test.js` RED→GREEN + mutacje
      (wyzerowanie pokrętła / wyłączenie gałęzi).
- [x] **P5** Ewaluacja: `bot-scoring-snapshot` (bez regeneracji, chyba że
      różnice są zamierzone), tie-audit PO, mirror-eval reguły vs off.
- [x] **P6** Dokumentacja: raport PMSSB-79 + wiersz w rejestrze
      `docs/PMSSB.md`, wpis w `PROJECT_HISTORY.md`, handoff.
- [x] **P7** Bramy: `npm test`, `npm run build`, `npm run test:slow`,
      benchmark quick; push po każdym kroku.

## Ryzyka / pułapki

- Sonda musi stawiać kartę w **realnym oknie** (mana pokrywa koszt, poprawny
  krok tury) — inaczej `scoreOf` zwraca `null` i „brak różnicy” jest artefaktem.
- `damage` z kwotą będącą stringiem spada w bocie do `0` (gałąź
  `Number.isInteger(effect.amount) ? effect.amount : 0`) — to nie „zero
  obrażeń”, a brak gałęzi; każdy nowy string kwoty musi dostać lustro
  licznika z silnika (L41).
- Combat-sim bota zna **shield counter** i tarcze prewencji, ale nie efekt
  zastępujący „zapobiegnij i zdejmij liczniki” — Magma Pummeler wychodzi
  w symulacji jako 0/0, który ginie od pierwszego obrażenia.
- Golden-master: każda zmiana wyceny przesuwa hash; regeneracja tylko po
  przeglądzie różnic (procedura PMSSB krok 5).

## Kryterium ukończenia

Każda z 8 mechanik ma w raporcie werdykt (DONE / ZAMKNIĘTE BEZ ZMIANY) wraz
z liczbami PRZED i PO, a każda zmiana kodu ma pin RED→GREEN i mutację.

**Spełnione (2026-10-27):** tabela PRZED/PO dla ośmiu rodzin w §PMSSB-79,
17 pinów, 4 mutacje RED, golden bez regeneracji, tie-audit i lustro
udokumentowane. Dwa fałszywe alarmy pomiaru sprostowane w raporcie
(obrażenia czytane przed rozstrzygnięciem stosu; 0/0 z X=0 a SBA).
