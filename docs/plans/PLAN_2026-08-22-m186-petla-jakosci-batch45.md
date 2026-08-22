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

- [x] build + npm i w table-tester; kontrola HEAD
- [x] G1: ravnica vs innistrad
- [x] G2: mirrodin vs worek-dziki (toxic vs fight/Pain for All)
- [x] G3: warhammer vs forgotten-realms
- [x] G4: worek-basni vs worek-mroczny
- [x] G5: ravnica vs mirrodin (inny seed)
- [x] G6: worek-dziki vs warhammer
- [x] Przegląd: DETEKTORY + ręczny grep kart Batchu 45; dogrywki pokrycia
- [x] Naprawy (osobne commity) + rebuild + weryfikacja v2
- [x] Dokumenty: plan, PROJECT_STATE, PR #69 sekcja 18

## Wynik

12 zapisów (9 gier + weryfikacje v2/v3; po drodze 9. RESET workspace —
odzyskane: HEAD z origin `7abbc4e`, pliki planu/testów/transkryptów
z commitów, przestarzałe kopie w working tree odrzucone na rzecz HEAD).

- **Z1 [rules/L48]** (commit 6c75e5a): martwa walidacja wizarda bloków —
  „can't attack/block alone" JAWNIE w widoku (entry.cantAttackAlone/
  cantBlockAlone liczone jak w combat.js); wcześniej wizard czytał
  entry.abilities, których playerView nigdy nie wysyłał (Ember Beast
  blokował sam, engine odrzucał komendę).
- **Z2 [ui]** (commit 7abbc4e): null w celach optional (Assert Perfection)
  bez pytajnika w etykietach (render commandLabel + session opis rzutu)
  + detektor: klik harnessu po game_over to szum testera, nie bug.
- **Z3 [ui]** (5e6080f): grupa darmowych rzutów Epic Experiment wyciszalna
  (resolve_epic_choice w OPTION_IGNORABLE_TYPES); wariant „zakończ"
  (done: true) traktowany jak decline/skip (klasa M180/Z4).
- **Z4 [ui]** (d889b77): opis another_creature_enters niesie filtry —
  Ivy Lane Denizen mówił „Gdy inny stwór wchodzi", obiecując trigger od
  KAŻDEGO stwora (Oracle: another GREEN creature YOU CONTROL).

Weryfikacje: v3-g1, v2-g4, v2-g7/v3-g7, v2-g2 — wszystkie 0 zgłoszeń.
Pokrycie Batchu 45: Pain for All (aura+trigger celu), Assert (oba
warianty), Unearth (cycling), Doomed Dissenter, Ghost Warden/Ivy Lane
(w gre); Patron/Chocobo/Crawling/Malamet — pełne cykle w testach
silnikowych batch45-kart (precedens M184). Testy: m186-petla-jakosci (4).
