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

- [ ] `node tools/build.mjs` + `cd tools/table-tester && npm i` (jsdom)
- [ ] G1: theros vs innistrad
- [ ] G2: forgotten-realms vs tarkir
- [ ] G3: dominaria vs ravnica
- [ ] G4: alara vs wiedzmin
- [ ] G5: warhammer vs worek-mroczny
- [ ] G6: theros vs worek-legend (talia po awansie vs odchudzony worek)
- [ ] G7: innistrad vs forgotten-realms
- [ ] Przegląd transkryptów: DETEKTORY (źródło prawdy) + ręczny grep
      nowych kart (scan.mjs tylko pomocniczo — szumi, L54/M180)
- [ ] Naprawy zgłoszeń (każda osobny commit) + rebuild + ponowne gry
- [ ] Dokumenty: plan odhaczony, PROJECT_STATE, PR #69 sekcja 16
