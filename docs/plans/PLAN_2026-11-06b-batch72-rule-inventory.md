# Batch 72 — B2: inwentarz reguł i zakres generycznych zmian

Data: 2026-11-06. Zakres wyłącznie kolekcja 635–644; źródła to zapisane
snapshoty Scryfall z B1 i rulings właściwych druków.

## Inwentarz 10 kart

| Karta | Mechanika z Oracle | Stan repozytorium / działanie |
|---|---|---|
| Feral Ridgewolf | Trample; aktywowane `+2/+0` do końca tury za `{1}{R}` | Evergreen trample, płatne zdolności i efekt `pump` już istnieją. Użyć wspólnego modelu aktywacji; nie dodawać reguły po nazwie. |
| Creeping Peeper | Tap: `{U}`, wyłącznie na rzut zaklęcia, odblokowanie drzwi albo obrót permanenta twarzą do góry | `spendOnly`/oddzielna pula istnieją, ale wyłącznie dla artefaktowych czarów (Powerstone); brak typów celu dla enchantmentu, specjalnej akcji drzwi i obrotu. Nowa generyczna kwalifikacja przeznaczenia many. Ruling 2024-09-20 w snapshotie potwierdza opłacanie morph/disguise i kosztów manifest/cloak. |
| Vortex Runner | Przy co najmniej 8 lądach: `+1/+0` i nie może być blokowany | Static warunek `minLandsControlled` i static `cantBeBlocked` istnieją osobno. Combat nie sprawdza warunku static przy tej ewazji; ujednolicić predykat aktywności statycznej i stosować read-time w blokowaniu/widoku/bocie. |
| Kraken Hatchling | Vanilla 0/4 | Tylko definicja danych. |
| Open the Gates | Wyszukiwanie basic land **albo** Gate do ręki | `search_library_to_hand` i kwalifikator `anyOf` istnieją (wspólny predykat kandydatów i rewalidacji, wcześniejszy batch 58). Użyć dwóch alternatyw: `{types:['Basic','Land']}` lub `{subtypes:['Gate']}`. |
| Living History | ETB: token Spirit 2/2 czerwono-biały; przy ataku, jeśli karta opuściła twój cmentarz w tej turze, wskazany atakujący dostaje `+2/+0` do końca tury | ETB/token/target pump istnieją. Brakuje per-player faktu „karta opuściła mój cmentarz w tej turze” oraz warunku triggera ataku (intervening-if, sprawdzany przy wyzwalaniu i rozpatrywaniu). Zarejestrować generycznie w centralnym choke poincie zmiany stref; tokeny nie są kartami. |
| Banishing Light | ETB wygnaj wskazany nie-ląd przeciwnika do odejścia tego enchantmentu | Linked exile, target legality, LTB return i obsługa tokena istnieją (Static Net); odtworzyć wzorzec. 4 rulingi są zapisane w snapshotie. |
| Pheres-Band Centaurs | Vanilla 3/7 | Tylko definicja danych. |
| Shining Aerosaur | Flying | Evergreen flying. |
| Lich's Caress | Zniszcz wskazanego stwora, zyskaj 3 życia | Istniejący target/spell resolution i `destroy_permanent` + `gain_life`; nielegalny jedyny cel musi zakończyć rozpatrywanie całego czaru bez zysku życia. Ruling 2018-07-13 zapisany w snapshotie. |

## Nowe / niepokryte wcześniej pętle reguł

1. **Przeznaczenie restricted mana (`spendOnly` jako generyczne dozwolone
   cele).** Pętla PMSSB osobno od wcześniejszej pętli Powerstone: legalny rzut
   enchantmentu, legalne obrócenie permanenta face-up (morph/disguise,
   manifest/cloak), odrzucenie zwykłego non-enchantment spell/aktywacji oraz
   kontrola wspólnej bramki oferty i rzeczywistej płatności. Zarezerwować cel
   `unlock_door` w modelu przeznaczenia, mimo że aktualny katalog nie ma
   deskryptora drzwi; nie implementować kart spoza zakresu batcha.
2. **Karta opuszcza cmentarz w tej turze.** Pętla PMSSB dla ruchu z cmentarza
   do dowolnej strefy: legalny trigger ataku po ruchu, brak wyzwolenia przed
   ruchem / po nowej turze / po ruchu samego tokena oraz brak rozpatrzenia,
   jeśli warunek przestanie zachodzić przed rozpatrzeniem triggera.
3. **Static próg lądów połączony z zakazem blokowania.** Pętla PMSSB dla 7/8/9
   lądów, read-time zmiany liczby lądów oraz kontroli legalności blokera,
   deklaracji ataku, widoku i wyceny bota. `+1/+0` i ewazja mają ten sam
   warunek, bez zamrażania wyniku przy wejściu/ataku.

Pozostałe mechaniki batcha są reuse istniejących, już wcześniej strojonych
rodzin. W B5 trzeba odnotować dowód powiązania testów i nie wykonywać pełnego
B0; pełny benchmark wymaga jawnej prośby właściciela.

## Kolejność wdrożenia

B3: najpierw generyczne deskryptory/warunki i zmiany silnika powyżej, potem
10 definicji oraz artId/plan zgodne 1:1 z B0. B4: testy legalne/nielegalne i
cztery wymagane dowiązania dla nowych deskryptorów/zdarzeń. B5: trzy pętle
PMSSB opisane wyżej, następnie pomiar i raport. B6: wyłącznie generator
`node tools/generate-plan-decks.mjs` i audyt wszystkich zmian talii.
