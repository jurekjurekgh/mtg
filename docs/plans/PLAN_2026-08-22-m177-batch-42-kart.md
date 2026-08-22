# PLAN 2026-08-22 — M177: Batch 42 — 10 kart (lista właściciela)

Karty: Sifter Wurm (HOU), Azorius Justiciar (RTR), Rakshasa Vizier (KTK),
Agate Assault (BLB), Vanish from Sight (DSK), Merchant's Dockhand (AER),
Makeshift Mauler (ISD), You're Not Alone (FIN), Final Parting (DOM),
Swooping Protector (SNC). Dane Oracle: `docs/cards/scryfall-*.json`
(pobrano 2026-08-22). ArtId + plan już w `tools/collection-art-ids.csv`
(6/12/29/111/183/226/236/379/512/520); strażnik artId 318→328 (per transza).

## Przydział do talii (ADR: tylko tokens/ostrza/graveyard)

- **tokens** (W/G/U): Swooping Protector {3}{W}, You're Not Alone {W},
  Azorius Justiciar {2}{W}{W}, Sifter Wurm {5}{G}{G}, Merchant's Dockhand {1}.
- **ostrza** (mono-R): Agate Assault {2}{R}.
- **graveyard** (B/G/R + U): Makeshift Mauler {3}{U}, Rakshasa Vizier
  {2}{B}{G}{U} (Forest/Island/Swamp już w talii), Final Parting {3}{B}{B},
  Vanish from Sight {3}{U} (surveil = synergia grobu).

## Analiza mechanik (reuse vs nowe)

- Swooping Protector: PEŁNY REUSE (flash+flying+entersWithCounters shield —
  wzorzec Voice of the Vermin; shield przy damage/destroy już w silniku).
- You're Not Alone: pump z warunkiem „3+ stwory → +4/+4 zamiast +2/+2” —
  rozszerzenie efektu pump o warunkowy bonus (liczę przy ROZSTRZYGANIU).
- Agate Assault: czar modalny (reuse) + NOWY znacznik „if it would die this
  turn, exile it instead” (`exileIfDiesThisTurn`, czyszczony w cleanup;
  ścieżki śmierci jak licznik finality) + exile_permanent (reuse).
- Makeshift Mauler: NOWY additionalCost { exileCreatureFromGraveyard } —
  wzorzec exileCreature (Fear of Abduction), ale kandydaci z WŁASNEGO grobu.
- Rakshasa Vizier: NOWY trigger `cards_exiled_from_your_graveyard`
  (X kart → X liczników +1/+1; zasilany przez koszt Maulera i każdą
  przyszłą ścieżkę grob→exile).
- Sifter Wurm: scry 3 (reuse) + NOWE „then”: pendingScry.afterEffect —
  po resolve_scry reveal wierzchu + gain life = MV karty.
- Final Parting: przeszukanie o DWÓCH kartach — pierwszy wybór do ręki,
  drugi do grobu (łańcuch jak Springbloom Druid, różne destination).
- Vanish from Sight: NOWA blokująca decyzja WŁAŚCICIELA celu (top/bottom
  biblioteki) + surveil 1 rzucającego (reuse).
- Merchant's Dockhand: NOWY koszt „tap X untapped artifacts you control”
  (wybór artefaktów w komendzie, X = ilość) + look top X → 1 do ręki,
  reszta na SPÓD (wariant look_top_put_one_hand_rest_grave).
- Azorius Justiciar: NOWY detain (CR 701.29) — znacznik detainedUntilTurn
  (do początku następnej tury kontrolującego detain): cel nie atakuje,
  nie blokuje, nie aktywuje zdolności (oferta+walidacja); trigger ETB
  „up to two target creatures” (upTo w celach triggerów — reuse).

## Transze (commit po każdej, testy test/batch42-kart.test.js)

- [ ] 0. Dane Scryfall + plan — commit.
- [ ] A. Swooping Protector + You're Not Alone + Agate Assault (ostrza+tokens).
- [ ] B. Makeshift Mauler + Rakshasa Vizier (graveyard, koszt zasila trigger).
- [ ] C. Sifter Wurm + Final Parting.
- [ ] D. Vanish from Sight (decyzja właściciela celu) + Swooping/regresje.
- [ ] E. Azorius Justiciar (detain) + Merchant's Dockhand (tap X artefaktów).
- [ ] F. Strażnik artId 328, PROJECT_STATE, opis PR, test:all, push, CI.

## Wynik

(uzupełnić po wykonaniu)
