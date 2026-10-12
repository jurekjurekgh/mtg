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

- [x] Dodać test z prawdziwą Angelic Benediction, dwoma gotowymi 2/2 i
  nietapniętym wrogim 5/4; bot ma zadeklarować **dokładnie jednego** atakującego.
- [x] Wykonać wybraną komendę przez `execute`, pozwolić temu samemu botowi
  wybrać wrogie 5/4 jako cel i doprowadzić stos do rozstrzygnięcia.
- [x] Przed deklaracją blokujących potwierdzić: 5/4 jest tapnięte, samotny
  atakujący dostał +1/+1, a przeciwnik nie może go zablokować tym stworzeniem.
- [x] Dodać kotwice anty-over-fix:
  1. identyczna plansza bez triggera tapującego nadal nie uzasadnia samobójczego
     ataku 2/2 w 5/4;
  2. dwa wrogie 5/4 i tylko jeden trigger pozostawiają legalnego blokera;
  3. nietargetowalny 5/4 (hexproof) nie jest pozornie usuwany z projekcji;
  4. wariant z dwoma atakującymi nie korzysta z `attacks_alone`;
  5. permanent po utracie zdolności nie dostarcza wydrukowanych triggerów.
- [x] Uruchomić plik osobno i zachować czerwony wynik głównego pinu (**4/5**
  przed fixem: tylko E/1 czerwony; po dodaniu pinu exalted pakiet ma **6/6**).

### E2 — generyczna projekcja `attacks_alone`

- [x] Wydzielić mały helper projekcji samotnego ataku, który skanuje aktywne,
  kontrolowane źródła na polu bitwy po `trigger.event === 'attacks_alone'`.
- [x] Zsumować automatyczne pompy samotnego atakującego (`exalted_pump` i
  zgodne deskryptorowe pompy do końca tury) przez wspólny `pumpDelta`.
- [x] Dla opcjonalnych `tap_permanent` wybrać legalne wrogie blokery przez ten
  sam publiczny filtr celu co inne antycypowane efekty i usunąć najwyżej jeden
  różny bloker na trigger.
- [x] Użyć projektowanego atakującego i listy blokerów konsekwentnie w całej
  wycenie wariantu: wymiana, obrażenia, lethal/poison i wartość presji.
- [x] Nie mutować `PlayerView` ani stanu gry.
- [x] GREEN wszystkich pinów E (**6/6**).
- [x] Dowody mutacyjne: wyłączenie projekcji tapnięcia czerwieni E/1, a
  wyłączenie automatycznej pompy exalted czerwieni E/6.

### E3 — bramy i domknięcie

- [x] Test celowany E wraz z istniejącymi testami Angelic Benediction:
  **163/163**.
- [x] `npm test`: **8066/8066**.
- [x] Golden master `test/bot-scoring-snapshot.test.js`: **4/4**, bez
  regeneracji.
- [x] Szybki benchmark bota (`node tools/benchmark.mjs`, bez `--full`):
  **672 mecze**, 0 niedokończonych; heuristic **86,0%** vs aggro i **98,5%**
  vs random.
- [x] `npm run build`: **73 moduły / 5043,7 kB**.
- [x] `npm run test:all`: **8331/8331**.
- [x] `git diff --check`.
- [x] Osobny commit kodu/testów `f55d97e` i push.
- [x] Żywy Tester: `dominaria-brg` vs bot `alara`, seed 42, profil defensive;
  bot wielokrotnie atakuje samotnie, wybiera Disę jako cel, korzysta z
  „you may”, dostaje exalted i wygrywa; **0 zgłoszeń detektorów**, brak
  niewycenionych decyzji.
- [x] GitHub CI kodu: **SUCCESS**, run `38280661610`.
- [x] Uzupełnić ten plan, `docs/PROJECT_HISTORY.md`, handoff sesji i opis PR #163.
- [x] Osobny commit dokumentacji, push oraz końcowe zielone GitHub CI.

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

Commit `f55d97e` naprawia scoring bez specjalnego przypadku karty. Dla
pojedynczego atakującego bot projektuje aktywne, publiczne triggery
`attacks_alone`: automatyczny pump trafia do wszystkich dalszych obliczeń
walki, a każdy legalny `tap_permanent` usuwa najwyżej jednego rzeczywistego
blokera. W dokładnym scenariuszu właściciela bot wybiera jedno z dwóch 2/2,
wykonuje legalną deklarację, celuje Benediction w 5/4, korzysta z opcjonalnego
efektu, tapuje je przed blokami i atakuje jako 3/3.

Kotwice zachowują pass bez Benediction, przy drugim 5/4, hexproofie oraz
utracie zdolności; atak dwoma stworami nie pożycza premii samotnego ataku.
Osobny pin Akrasan Squire dowodzi, że sama projekcja exalted jest częścią
wyniku, a nie martwą dokumentacją. Dwie mutacje root cause są zabijane.
Golden master pozostał bez zmian, a szybki benchmark nie wykazał regresji.
