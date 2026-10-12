# Plan 2026-10-12 — Village Rites: bot poświęca wyłącznie stworzenia 1/1

## Zgłoszenie i stan wyjściowy

Właściciel odtworzył sytuację, w której bot rzuca Village Rites:

> As an additional cost to cast this spell, sacrifice a creature. Draw two
> cards.

Bot poświęca zakrytego Morpha 2/2, którego kartą jest Segmented Krotiq. Ma
sześć many, czyli brakuje mu tylko jednej do kosztu Megamorph `{6}{G}`; po
obróceniu dostałby 6/5 z licznikiem +1/+1. Oddanie tego zasobu za dwa dobrania
jest bezsensowne.

Sonda na produkcyjnym `playerView` odtwarza błąd przed zmianą:

- Segmented Krotiq został legalnie rzucony jako Morph i jest zakrytym 2/2;
- bot ma 6 many, więc nie ma jeszcze oferty Megamorph za 7;
- jedyna oferta Village Rites poświęca tego Morpha;
- scoring daje Village Rites **5**, pass **0** i bot wybiera rzut;
- face-down wpis ma `manaCost: 0`, więc obecna kara widzi tylko ciało 2/2 i nie
  widzi przyszłej wartości 6/5 + licznika.

Istniejące testy rodziny dodatkowych kosztów, darmowych rzutów i Morphów są
zielone: **99/99**.

## Wiążąca polityka właściciela

Dla **rzucania czarów** z dodatkowym kosztem „poświęć stwora” bot może
poświęcić wyłącznie własne stworzenie, którego bieżące efektywne statystyki w
`PlayerView` wynoszą dokładnie **1/1**. Dotyczy to zarówno tokenów 1/1, jak i
kart-stworów 1/1.

To jest twarda bramka wyboru, nie kolejna mała kara punktowa:

- Morph 2/2 jest zabroniony niezależnie od tożsamości i kosztu obrotu;
- 1/2, 2/1, 2/2 i większe stworzenia są zabronione;
- modyfikowane stworzenie liczy się według bieżących efektywnych P/T widocznych
  botowi;
- gdy brak dozwolonej ofiary, bot nie rzuca czaru tą ścieżką — wybiera pass,
  rezygnację z darmowego rzutu albo alternatywną zapłatę, jeśli istnieje;
- losowość profilu bota nie może ominąć zakazu.

## Zakres i granice

Naprawa jest po semantycznym polu komendy `sacrificeTargetId`, nigdy po nazwie
Village Rites, Segmented Krotiq ani `cardId` (ADR 0002).

Obejmuje wszystkie ścieżki **rzutu czaru**, które mogą nieść ten sam koszt:

- zwykłe `cast_spell` i inne bezpośrednie warianty rzutu;
- discover, suspend, rebound, Epic Experiment;
- rzuty z ręki, grobu i wygnania w oknach zdolności;
- madness i inne komendy `resolve_*`, jeżeli niosą `sacrificeTargetId`.

Nie zmienia:

- legalności engine ani ofert dla człowieka — człowiek nadal może świadomie
  poświęcić dowolnego legalnego stwora;
- wymuszonych poświęceń przeciwnika;
- Exploit, Devour i dobrowolnych decyzji efektów;
- kosztów zdolności aktywowanych (`sacrificeCreatureId`, `sacrificeSelf`);
- decyzji o Food ani innych zasobach niebędących kosztem rzutu.

## Roadmapa i kolejność commitów

### V0 — plan i dowód stanu wyjściowego

- [x] Odtworzyć prawdziwy rzut Morpha i ofertę Village Rites.
- [x] Zmierzyć ranking: Village Rites **5** > pass **0**.
- [x] Prześledzić bezpośrednią wycenę `cast_spell`, wspólną wycenę darmowych
  rzutów oraz wszystkie generatory komend z `sacrificeTargetId`.
- [x] Potwierdzić zieloną bramę bazową rodziny: **99/99**.
- [x] Przejść bramę dokumentacji: **23/23**.
- [x] Commit i push planu przed kodem.

### V1 — RED: polityka i produkcyjny scenariusz

- [x] Dodać produkcyjny test: prawdziwy Segmented Krotiq jako Morph 2/2,
  prawdziwe Village Rites i sześć many; engine nadal oferuje legalny wariant,
  ale bot wybiera pass.
- [x] Dodać 1/1 obok Morpha: bot rzuca Village Rites wyłącznie z ofiarą 1/1,
  komenda przechodzi przez `execute`, 1/1 ginie, Morph zostaje, a bot dobiera.
- [x] Przypiąć, że zwykła karta-stwór 1/1 oraz token 1/1 są dozwolone.
- [x] Przypiąć zakaz dla 1/2, 2/1, 2/2 i większych stworzeń.
- [x] Przypiąć co najmniej jedno okno darmowego/warunkowego rzutu z możliwością
  rezygnacji, żeby polityka nie żyła wyłącznie w `cast_spell`.
- [x] Przypiąć profil z `randomness: 1`, aby zakaz nie wrócił przez losowanie
  z trzech najwyższych ofert.
- [x] Przypiąć anty-over-fix: engine i UI człowieka nadal widzą wszystkie
  legalne ofiary.
- [x] Uruchomić nowy plik i zachować RED przed implementacją.

### V2 — jedna twarda bramka komend bota

- [x] Dodać czysty predykat: brak `sacrificeTargetId` = komenda neutralna;
  koszt poświęcenia = tylko własne stworzenie o efektywnym P/T 1/1.
- [x] Użyć predykatu w jednym wspólnym zbiorze kandydatów bota, z którego
  korzystają normalny wybór, zachłanna polityka symulacji i lookahead.
- [x] Zabezpieczyć także pomocnicze sondy sekwencjonowania many, żeby bot nie
  produkował many pod rzut, którego potem zgodnie z polityką nie wykona.
- [x] Zachować obronę w `scoreCommand` (`NEVER`) dla wywołań syntetycznych i
  przyszłych konsumentów, bez kopiowania warunku 1/1.
- [x] Nie dodawać parametru tunera: jest to wiążący zakaz właściciela, nie
  miękka preferencja strategii.
- [x] GREEN wszystkich pinów V i istniejącej rodziny.
- [x] Dowód mutacyjny: pominięcie bramki musi przywracać poświęcenie Morpha.

### V3 — bramy i domknięcie

- [x] Celowane testy V oraz powiązane testy kosztów dodatkowych/Morph/bota.
- [x] Golden master bez automatycznej regeneracji; każdą zmianę potraktować
  jako finding i wyjaśnić.
- [x] `npm test` z pełnym stdout/stderr w `.arena/*.log`.
- [x] Szybki benchmark bota, ponieważ zmienia się przestrzeń jego decyzji.
- [x] `npm run build` z pełnym stdout/stderr w `.arena/*.log`.
- [x] `npm run test:all` uruchomić raz po domknięciu kodu, również do logu.
- [x] `git diff --check`.
- [x] Osobny commit kodu/testów i push.
- [x] Uzupełnić plan, historię projektu, handoff i PR #163.
- [x] Osobny commit dokumentacji, push i końcowy zielony GitHub CI.

## Ryzyka i strażniki

1. **Miękka kara zamiast zakazu.** Baza czaru albo dwie dobrane karty mogą
   przebić kolejną karę. Niedozwolony wariant ma wypaść ze zbioru kandydatów.
2. **Losowość.** `randomness` losuje spośród top 3; samo `-Infinity` bez
   odfiltrowania nadal może być niebezpieczne przy małej liczbie ofert.
3. **Rozjazd ścieżek rzutu.** Koszt dodatkowy jest wspólnym polem komendy, więc
   nie wolno naprawić tylko `cast_spell` i zostawić discover/rebound/exile.
4. **Zepsucie reguł dla człowieka.** Filtr należy wyłącznie do kontrolera bota;
   engine nadal enumeruje i akceptuje wszystkie legalne ofiary.
5. **Za szeroki zakaz.** `sacrificeTargetId` dotyczy kosztu rzutu. Exploit,
   Devour, wymuszone poświęcenia i koszty zdolności mają inne pola/typy komend
   i pozostają poza polityką.
6. **Stan efektywny.** Ocena 1/1 korzysta z P/T w `PlayerView`, nie z druku ani
   ukrytej tożsamości Morpha.

## Wynik końcowy

Wdrożono w commicie kodu/testów `98d6f8f`:

- `botMayPayCreatureSacrificeCost` rozpoznaje semantyczne pole
  `sacrificeTargetId` i dopuszcza wyłącznie własne stworzenie o efektywnym
  P/T dokładnie 1/1;
- `botCommandCandidates` jest wspólną pulą normalnego rankingu, lookahead,
  zachłannej i prostej polityki symulacji oraz sond pomocniczych;
- zakaz ma drugą linię obrony `NEVER` w `scoreCommand`, a losowość wybiera
  wyłącznie spośród komend o skończonym wyniku — nie zamienia odfiltrowanego
  rzutu w losowe `concede`;
- sondy odblokowania many znają koszt poświęcenia: bot nie spala Skarbu pod
  Village Rites, którego potem nie może zgodnie z polityką rzucić; wariant
  „albo zapłać {N}” pozostaje dostępny;
- engine oraz oferty człowieka nie zostały zmienione.

Dowody RED→GREEN i mutacyjne:

- pierwszy RED nowego pliku: **0/6**;
- osobny RED sondy Skarbu: **6/7**, jedyną porażką było niepotrzebne
  poświęcenie Skarbu na manę;
- końcowy plik V: **7/7**;
- mutacja usuwająca warunek 1/1: **2/7 PASS, 5/7 FAIL**, więc piny naprawdę
  zależą od bramki;
- stary pin Severed Strands został uzgodniony z wiążącą polityką: zachowuje
  wycenę dozwolonej ofiary 1/1 i jawnie odrzuca 1/4 oraz 1/7.

Bramy końcowe:

- rodzina celowana: **123/123**;
- golden master: **4/4**, bez regeneracji;
- `npm test`: **8079/8079**;
- `npm run test:all`: **8344/8344**;
- benchmark: **672 mecze**, heuristic **92,0%** wszystkich zwycięstw;
- build: **73 moduły / 5053,1 kB**;
- `git diff --check`: czysto;
- GitHub CI commitu kodu: **SUCCESS**, run `38290364410`.

Wszystkie długie testy, benchmark i watcher CI zapisały pełny stdout/stderr w
ignorowanych `.arena/*.log`; na terminal trafiły wyłącznie krótkie statusy i
końcowe podsumowania.
