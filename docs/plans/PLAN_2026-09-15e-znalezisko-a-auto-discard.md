# Plan 2026-09-15e — znalezisko A: wymuszony discard bez modala

Kontynuacja sesji 15d na tej samej gałęzi (`arena/01a0a5a7-mtg`, PR #123):
zgłoszenie właściciela A — Cathartic Reunion przy dokładnie 2 kartach w ręce
otwiera modal wyboru, choć wyboru nie ma (wyrzucić trzeba obie).

## Reguła (generyczna, nie pod kartę)

Wymuszony discard całości (`!allowDecline`, kandydaci == liczbie wymaganej,
> 0) rozstrzyga się sam w tej samej komendzie — bez `pendingDiscardChoice`,
bez `discard_choice_required`, bez modala. Obejmuje koszty (Reunion, Plague
Reaver), efekty (Mindstab z krótką ręką, Scholar z 1 kartą, Toll mandatory
z 1 nonlandem) i dokończenia sekwencyjne. Modal ZOSTAJE gdy: realny wybór
(3 ręka / discard 2), `allowDecline` (Nightsnare — rezygnacja to opcja),
limit ręki (nigdy całość — nietknięte z konstrukcji).

## Projekt (jeden predykat, jedna implementacja — L41/L48)

- `effects.js` (jedyny moduł bez cykli dla 4 konsumentów): `shouldAutoDiscard`
  + `discardCardsForced` (port pętli resolvera: madness→exile+kolejka,
  grób, eventy, `onCreatureDiscard`; bez kontynuacji i priorytetu).
- 11 miejsc kolejkowania dostaje gałąź auto (koszty/efekty kontynuują normalnie
  zamiast zawieszać; `hand_size` nietknięte). Resolver używa tego samego EPICa
  (zero drugiej implementacji).
- `promoteNextMadness` → poziom modułu; hook w `accepted()`: kolejka madness
  + brak otwartych decyzji → promocja (na ścieżce ręcznej no-op: decyzja już
  otwarta synchronicznie). Timing identyczny: promocja po dokończeniu
  sekwencji/efektu, w tej samej komendzie.
- Decyzja w chwili kolejkowania (nie post-pass): brak eventu w logu, brak
  splicingu, replay deterministyczny (re-egzekucja).

## Kroki

- [ ] E0: ten plan (commit docs).
- [ ] E1: test repro `test/owner-cathartic-reunion-auto-discard.test.js` → RED
      (dziś: pending + modal przy 2/2).
- [ ] E2: implementacja → GREEN + mutacja (strażnik auto: usunięcie gałęzi → RED).
- [ ] E3: przegląd breaksów suity — znane: Mindstab w `owner-discard-selection`
      (2/3), A4-1/4 (3/3); każdy break = intended albo bugfix, jawnie w commicie.
- [ ] E4: bramki (`npm test`, `test:all`, build, quick; golden-master: dryf tylko
      uzasadniony stanowo-identyczny) + domknięcie (dopiski handoff/PH/README,
      opis PR #123, lekcja tylko przy nowej klasie).

## Ryzyka

- Madness: auto MUSI otwierać decyzję w tej samej komendzie (test pinuje).
- Trigger scanning: eventy EPICa wchodzą w `slice(before)` bram (cast/ability
  budują `[e, ...slice]` po mutacji) — jak dziś.
- Suite 5514 jako arbiter: każdy RED czytany, nie klepany.
