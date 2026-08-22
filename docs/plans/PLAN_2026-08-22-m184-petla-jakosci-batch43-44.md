# PLAN M184 — pętla jakości Żywym Testerem: Batche 43–44 + talia theros (2026-08-22)

Zlecenie właściciela: pętla jakości Żywym Testerem po dwóch batchach
(M182/M183). Metoda jak M180: build → tools/table-tester (jsdom, realny
DOM stołu) → transkrypty z DETEKTORAMI; zgłoszenia → naprawy → ponowna
weryfikacja do 0 zgłoszeń.

Priorytety pokrycia: nowa talia `theros` (pierwszy auto-awans; Sleep of
the Dead escape, Sea God's Scorn, Glaring Aegis), innistrad (Frightful
Delusion, Tireless Hauler DFC, Farbog), forgotten-realms (Heap Gate,
Thieves' Tools), tarkir (Rush of Battle, Descendant of Storms), dominaria
(Blanchwood Prowler), ravnica (Severed Strands, Forced Landing), alara
(Dispeller's Capsule, Angel's Herald), warhammer (Hill Giant, Dismal
Backwater), worek-mroczny (Balamb Garden), wiedzmin (Fleeting Distraction).

## Kroki

- [x] `node tools/build.mjs` + `cd tools/table-tester && npm i` (jsdom)
- [x] G1: theros vs innistrad
- [x] G2: forgotten-realms vs tarkir
- [x] G3: dominaria vs ravnica
- [x] G4: alara vs wiedzmin
- [x] G5: warhammer vs worek-mroczny
- [x] G6: theros vs worek-legend (talia po awansie vs odchudzony worek)
- [x] G7: innistrad vs forgotten-realms
- [x] Przegląd transkryptów: DETEKTORY (źródło prawdy) + ręczny grep
      nowych kart (scan.mjs tylko pomocniczo — szumi, L54/M180)
- [x] Naprawy zgłoszeń (każda osobny commit) + rebuild + ponowne gry
- [x] Dokumenty: plan odhaczony, PROJECT_STATE, PR #69 sekcja 16

## Wynik

12 gier (7 podstawowych + 3 dogrywki pokrycia + 2 weryfikacje v2).
Zgłoszenia i naprawy (wszystkie zweryfikowane ponownymi grami — 0 zgłoszeń):

- **Z1 [ui]**: Sea God's Scorn opisywał się jako „wybierz jedno — ten sam
  efekt na każdym z celów" — apply_to_each_target opisuje teraz efekty
  WEWNĘTRZNE, a czar z jednym trybem nie udaje wyboru.
- **Z2 [ui]**: opis Blanchwood Prowlera nie niósł liczby kart (3) ani
  nagrody za odmowę (+1/+1) — reveal_top_pick_land_rest_grave czyta
  amount/counterIfNone z deskryptora.
- **Z3 [ui]**: opcja „Nie bierz lądu" nie mówiła o liczniku — komenda
  niesie flagę counterIfNone (Satyr Wayfinder celowo bez zmian — Z3b).
- **Z4 [ui]**: kafel Thieves' Tools nie wspominał o nieblokowalności
  nosiciela ≤3 — equipLine z cantBeBlockedMaxPower.
- **Z5 [ui/LKI]**: „Nieprzyjaciel poświęca ?" (Rupture Spire,
  pay_or_sacrifice) — obiekt po poświęceniu ma nowe id w grobie; zdarzenie
  niesie teraz cardId (wzorzec spell_countered/counteredByCardId).

Pokrycie kart Batchy 43–44 w transkryptach: Sleep of the Dead (rzut +
oferta Escape), Sea God's Scorn, Glaring Aegis (trigger z celem), Severed
Strands (LKI toughness 2/2 z anthemu Trostani — POPRAWNE +2), Blanchwood
(obie ścieżki), Thieves' Tools (ETB Treasure), Tireless Hauler, Heap Gate
(mana), Balamb (land+mana G/U), Dismal (tapnięty+trigger+mana), Hill
Giant, Greenwood, Farbog, Dispeller. Karty sytuacyjne bez zagrań testerem
(Rush of Battle, Descendant, Angel's Herald, Dire-Strain transform) mają
pełne cykle w testach silnikowych batch43/44-kart.
Testy: test/m184-petla-jakosci.test.js (6).
