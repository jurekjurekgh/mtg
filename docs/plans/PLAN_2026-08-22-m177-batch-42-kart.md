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

- [x] 0. Dane Scryfall + plan — commit.
- [x] A. Swooping Protector + You're Not Alone + Agate Assault (ostrza+tokens).
- [x] B. Makeshift Mauler + Rakshasa Vizier (graveyard, koszt zasila trigger).
- [x] C. Sifter Wurm + Final Parting.
- [x] D. Vanish from Sight (decyzja właściciela celu) + Swooping/regresje.
- [x] E. Azorius Justiciar (detain) + Merchant's Dockhand (tap X artefaktów).
- [x] F. Strażnik artId 328, PROJECT_STATE, opis PR, test:all, push, CI.

## Wynik

KOMPLET 10/10. Commity: e2a1ea5 (plan+dane), 0bde360 (A), b7d8729 (B),
ca452ca (C), a319c22 (D), c8c4dd5 (E). Testy `test/batch42-kart.test.js` (18).

- Nowe mechaniki: znacznik `exileIfDiesThisTurn` + `deathZoneFor` (jedno
  źródło prawdy dla 8 ścieżek śmierci), additionalCost
  `exileCreatureFromGraveyard`, trigger `cards_exiled_from_your_graveyard`
  (+`amountFromContext` w add_counter), rider `thenRevealTopGainLife` na scry,
  szukanie `mandatory` + destination `graveyard` (Final Parting), decyzja
  `pendingLibraryPlacement` (właściciel celu: wierzch/spód), DETAIN
  (CR 701.29: atak/blok/aktywacje + wygasanie jak goad), koszt `tapXArtifacts`
  + `look_top_put_one_hand_rest_bottom` (X z kosztu, reszta na spód).
- Fixy L48: walidacja celu `nonland_permanent` (była tylko oferta);
  CR 111.7: token odsyłany do biblioteki przestaje istnieć od razu
  (złamany niezmiennik pendingSurveil, wykryty testem M101/D seed 13).
- Przelosowany seed M101/D: 60→38 (L25). Strażnik artId 318→328.
- `npm test` 2666/2666 · test:all **2675/2675** · build 52 moduły /
  2303.3 kB · bot-benchmark 9/9.
