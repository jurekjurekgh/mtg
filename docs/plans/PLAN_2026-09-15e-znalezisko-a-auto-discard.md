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

- [x] E0: ten plan (commit docs).
- [x] E1: test repro `test/owner-cathartic-reunion-auto-discard.test.js` → RED
      (5 fail: Reunion 2/2, madness, Scholar, Reaver, ogon Nightsnare; strażniki green).
- [x] E2: implementacja → GREEN (8/8) + mutacja predykatu (false → 5 RED, restore → 8/8).
- [x] E3: 13 breaksów, każdy przeczytany: 1 PRAWDZIWY bug (kontrakt
      declined.count — fix count: 0, log-identyczny); 10 intended (M258→2/3,
      Bat, Toll→2 nonlandy, N2, Picker, Reaver, Óin, B44/13 ×2, Mindstab,
      A4-1/4, Nightsnare-19); determinizm = skrypt zależny od bloku (biblioteka
      p1 — skrypt NAPRAWDĘ się wykonuje); golden-master = uzasadniona regen
      (1 wymuszona decyzja mniej, downstream bit w bit, 5/6 partii identyczne).
- [x] Suita: 5522/5522 (5514 + 8 nowych).
- [x] E4: bramki ZMIERZONE: `npm test` 5522/5522, `test:all` 5532/5532, build
      61/3693,6 kB, quick 82,9% (557/672, bez zmian); golden-master regen
      uzasadniona (5/6 partii bit w bit + 1 wpis mniej).
- [x] Domknięcie: README (5522/5532/3693,6 + notka A), PROJECT_HISTORY
      (dopisek 15d), HANDOFF_2026-09-15c (dopisek), PR #123 (zakres dopisany KOMENTARZEM —
      edit tytułu/body blokuje błąd GraphQL projectCards po stronie GitHub),
      lekcja L144 + PRZYPADKI (nowa klasa; L66 skondensowana — budżet 100k).
- [x] Blok przekazania w czacie (ADR 0013).

## Ryzyka

- Madness: auto MUSI otwierać decyzję w tej samej komendzie (test pinuje).
- Trigger scanning: eventy EPICa wchodzą w `slice(before)` bram (cast/ability
  budują `[e, ...slice]` po mutacji) — jak dziś.
- Suite 5514 jako arbiter: każdy RED czytany, nie klepany.
