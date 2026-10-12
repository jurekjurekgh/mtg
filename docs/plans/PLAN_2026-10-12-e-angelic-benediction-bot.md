# Plan 2026-10-12 — E: bot wykorzystuje Angelic Benediction w ataku

## Zgłoszenie i stan RED

Właściciel odtworzył planszę, na której bot kontroluje **Angelic Benediction**
oraz dwa stworzenia 2/2, a przeciwnik jedno nietapnięte 5/4. Bot wybiera
„Brak ataku”, mimo że samotny atak odpala dwa triggery Benediction: exalted
(+1/+1 dla atakującego) oraz opcjonalne tapnięcie docelowego stwora. Po
zatapowaniu 5/4 przeciwnik nie ma legalnego blokera, więc samotny atak przechodzi.

Sonda na produkcyjnym `playerView` potwierdza root cause przed zmianą:

- `attack[]`: **0**;
- `attack[2/2]`: **−10** (dla obu pojedynczych wariantów);
- `attack[2/2,2/2]`: **−20**.

Wycena deklaracji atakujących bierze surową listę
`untappedEnemyBlockers(view)` dla każdego wariantu. Nie projektuje triggerów
`attacks_alone`, choć silnik po deklaracji rzeczywiście umieszcza je na stosie,
pozwala wybrać cel i rozstrzyga je przed deklaracją blokujących.

## Weryfikacja reguł i granice

Snapshot Scryfalla w repozytorium podaje:

> Exalted (Whenever a creature you control attacks alone, that creature gets
> +1/+1 until end of turn.)
> Whenever a creature you control attacks alone, you may tap target creature.

Implementacja engine jest już zgodna: `attackers_declared` przy dokładnie
jednym atakującym odpala wszystkie kontrolowane triggery `attacks_alone`, a
`requiresTarget` i `mayFire` zapewniają wybór legalnego celu oraz możliwość
odmowy. Naprawiany jest wyłącznie model decyzyjny bota — bez zmiany legalności
lub działania karty.

Nienegocjowalne granice:

- zero rozpoznawania `angelic-benediction`, nazwy lub `cardId` w kontrolerze;
- projekcja wyłącznie z publicznych deskryptorów triggerów i `PlayerView`;
- trigger działa tylko przy **dokładnie jednym** deklarowanym atakującym;
- tapnięcie usuwa wyłącznie legalny, nietapnięty cel, który naprawdę może
  blokować tego atakującego; shroud, hexproof i protection pozostają barierą;
- jeden trigger `tap_permanent` nie może „usunąć” dwóch blokerów;
- atak wieloma stworami nie dostaje ani tapnięcia, ani exalted;
- właściwa decyzja celu i rzeczywiste rozstrzygnięcie pozostają autorytetem
  engine — scoring jedynie przewiduje ich publicznie pewny skutek.

## Roadmapa i kolejność commitów

### E0 — plan i dowód stanu wyjściowego (osobny commit)

- [x] Odtworzyć zgłoszenie sondą na produkcyjnym `playerView`.
- [x] Potwierdzić Oracle w `docs/cards/scryfall-angelic-benediction.json`.
- [x] Wskazać root cause w gałęzi `declare_attackers`.
- [x] Uruchomić bramę dokumentacji (**25/25**), szybki rdzeń
  (**8060/8060**) oraz build (**73 moduły / 5039,4 kB**).
- [x] Commit i push planu do istniejącego PR #163 przed kodowaniem.

### E1 — produkcyjne RED-y decyzji i wykonania

- [ ] Dodać test z prawdziwą Angelic Benediction, dwoma gotowymi 2/2 i
  nietapniętym wrogim 5/4; bot ma zadeklarować **dokładnie jednego** atakującego.
- [ ] Wykonać wybraną komendę przez `execute`, pozwolić temu samemu botowi
  wybrać wrogie 5/4 jako cel i doprowadzić stos do rozstrzygnięcia.
- [ ] Przed deklaracją blokujących potwierdzić: 5/4 jest tapnięte, samotny
  atakujący dostał +1/+1, a przeciwnik nie może go zablokować tym stworzeniem.
- [ ] Dodać kotwice anty-over-fix:
  1. identyczna plansza bez triggera tapującego nadal nie uzasadnia samobójczego
     ataku 2/2 w 5/4;
  2. dwa wrogie 5/4 i tylko jeden trigger pozostawiają legalnego blokera;
  3. nietargetowalny 5/4 (co najmniej hexproof/shroud) nie jest pozornie
     usuwany z projekcji;
  4. wariant z dwoma atakującymi nie korzysta z `attacks_alone`.
- [ ] Uruchomić plik osobno i zachować czerwony wynik głównego pinu.

### E2 — generyczna projekcja `attacks_alone`

- [ ] Wydzielić mały helper projekcji samotnego ataku, który skanuje aktywne,
  kontrolowane źródła na polu bitwy po `trigger.event === 'attacks_alone'`.
- [ ] Zsumować automatyczne pompy samotnego atakującego (`exalted_pump` i
  zgodne deskryptorowe pompy do końca tury) przez wspólny `pumpDelta`.
- [ ] Dla opcjonalnych `tap_permanent` wybrać legalne wrogie blokery przez ten
  sam publiczny filtr celu co inne antycypowane efekty i usunąć najwyżej jeden
  różny bloker na trigger.
- [ ] Użyć projektowanego atakującego i listy blokerów konsekwentnie w całej
  wycenie wariantu: wymiana, obrażenia, lethal/poison i wartość presji.
- [ ] Nie mutować `PlayerView` ani stanu gry.
- [ ] GREEN wszystkich pinów E.
- [ ] Dowód mutacyjny: wyłączenie projekcji tapnięcia musi czerwienić dokładny
  scenariusz właściciela.

### E3 — bramy i domknięcie

- [ ] Test celowany E wraz z istniejącymi testami Angelic Benediction.
- [ ] `npm test` (cichy log).
- [ ] Golden master `test/bot-scoring-snapshot.test.js` bez regeneracji; każdą
  zmianę snapshotu traktować jako finding, nie akceptować automatycznie.
- [ ] Szybki benchmark bota (`node tools/benchmark.mjs`, bez `--full`).
- [ ] `npm run build`.
- [ ] `npm run test:all` (cichy log).
- [ ] `git diff --check`.
- [ ] Osobny commit kodu/testów i push.
- [ ] Uzupełnić ten plan, `docs/PROJECT_HISTORY.md`, handoff sesji i opis PR #163.
- [ ] Osobny commit dokumentacji, push oraz końcowe zielone GitHub CI.

## Ryzyka i strażniki

1. **Rozjazd predykcji z targetowaniem.** Nie wolno po prostu usuwać
   „największego” blokera: musi być legalnym celem triggera i móc blokować
   konkretnego atakującego.
2. **Nadmierna liczba tapnięć.** Każdy trigger daje najwyżej jeden cel; wybrany
   bloker nie może być policzony ponownie jako drugi różny zysk.
3. **Ukryta wiedza.** Definicje publicznych permanentów są jawne, lecz scoring
   nie może zaglądać do stanu ani ręki przeciwnika.
4. **Kolejność triggerów.** Engine pozostaje autorytetem. Test produkcyjny ma
   wykonać komendy, a nie tylko sprawdzić syntetyczny wynik scoringu.
5. **Golden master i benchmark.** To zmiana polityki ataku. Oczekiwany jest
   lokalny wpływ na plansze z triggerami `attacks_alone`; nie wolno maskować
   szerszej regresji regeneracją snapshotu lub pełnym tuningiem parametrów.

## Wynik końcowy

_Do uzupełnienia po wdrożeniu._
