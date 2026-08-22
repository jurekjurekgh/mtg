# PLAN M186 — pętla jakości Żywym Testerem: Batch 45 (2026-08-22)

Zlecenie właściciela: pętla jakości po Batchu 45. Metoda jak M180/M184:
build → tools/table-tester → transkrypty z DETEKTORAMI; zgłoszenia →
naprawy → weryfikacja do 0 zgłoszeń.

Priorytety pokrycia (talie z kartami Batchu 45): ravnica (Ghost Warden,
Ivy Lane Denizen), innistrad (Doomed Dissenter), forgotten-realms (Patron
of the Arts), warhammer (Unearth), mirrodin (Crawling Chorus — toxic!),
worek-mroczny (Call the Mountain Chocobo), worek-dziki (Malamet — fight,
Pain for All), worek-basni (Assert Perfection).

## Kroki

- [ ] build + npm i w table-tester; kontrola HEAD
- [ ] G1: ravnica vs innistrad
- [ ] G2: mirrodin vs worek-dziki (toxic vs fight/Pain for All)
- [ ] G3: warhammer vs forgotten-realms
- [ ] G4: worek-basni vs worek-mroczny
- [ ] G5: ravnica vs mirrodin (inny seed)
- [ ] G6: worek-dziki vs warhammer
- [ ] Przegląd: DETEKTORY + ręczny grep kart Batchu 45; dogrywki pokrycia
- [ ] Naprawy (osobne commity) + rebuild + weryfikacja v2
- [ ] Dokumenty: plan, PROJECT_STATE, PR #69 sekcja 18
