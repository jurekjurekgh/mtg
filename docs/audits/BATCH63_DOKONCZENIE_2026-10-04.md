# Dokończenie batcha 63 — źródła, mechaniki i migracja (2026-10-04)

PR #155, gałąź `arena/01a108d2-mtg`. Kontynuacja planu `2026-10-04g`;
naprawy poprzednika są osobno w `AUDYT_PR154_2026-10-04.md`.
Ten dokument zapisuje dowody, nie zastępuje wyniku końcowej bramy.

## 1. Zakres i źródła

| artId / druk właściciela | Karta / Plan | Exact-set snapshot |
|---|---|---|
| 212 VOW | Bloodtithe Harvester / Innistrad | [VOW 232](../cards/scryfall-bloodtithe-harvester.json) |
| 254 DMU | Snarespinner / Dominaria | [DMU 179](../cards/scryfall-snarespinner.json) |
| 259 2XM | Kozilek's Predator / Zendikar | [2XM 173](../cards/scryfall-kozileks-predator.json) |
| 260 MOM | Etched Host Doombringer / Kaldheim | [MOM 102](../cards/scryfall-etched-host-doombringer.json) |

Tokeny pomocnicze, nie nowe karty kolekcji: [Blood, TVOW 17](../cards/scryfall-token_blood.json)
i [Eldrazi Spawn, T2XM 1](../cards/scryfall-token_eldrazi_spawn.json).
Wszystkie sześć snapshotów pobrano 2026-10-04; niosą URL źródłowy, Oracle,
UUID druku, ilustrację i rulingi. `artId` nie jest collector number.

Literalne CR 2026-09-25: SHA-256
`8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`.
Tabela cytatów wygenerowana ponownie tym samym narzędziem, bez osłabienia
strażnika. Reguły kluczowe: 111.10g (Blood), 608.2h (wartości dynamiczne),
603.3c / 608.2b (tryb, cel, rozstrzygnięcie), 310.9a/e (protektor bitwy
nie jest jej kontrolerem), 310.7–8 (zero obrony), 603.6a / 113.7a (ETB i LKI).

## 2. Mechaniki i pełna ścieżka

- **Blood / Harvester.** Kanoniczny token używany przez katalog i kreator.
  Koszt to jednocześnie {1}, {T}, odrzucenie karty i poświęcenie; dobór
  korzysta ze stosu. Przy kilku kartach wybiera kontroler, nie silnik.
  `permanent_count` liczy własne **artefaktowe tokeny** z podtypem Blood,
  także z dodatkowymi podtypami; mnożnik −2. Wartość jest ustalana dopiero
  przy zastosowaniu efektu, nie przy aktywacji, a potem pozostaje stała do
  końca tury. Silnik, klasyfikacja debuffu, wycena i opis −X/−X czytają ten
  sam deskryptor. Aktywacja respektuje sorcery timing i chorobę przy {T}.
- **Snarespinner.** Zdarzenie `blocks` z filtrem `blockedHasKeyword` było już
  wdrożone przez poprzednika (`cd0858d`); zostało wykorzystane, nie dublowane.
  Doszły dane karty, polski opis i wspólna projekcja pompy dla wyceny bloków
  oraz atakowania w takiego obrońcę. Testy odróżniają latanie od nielatania;
  nie ma warunku po nazwie karty ani nowych wag bota.
- **Predator / Spawn.** ETB tworzy dokładnie dwa kanoniczne bezbarwne 0/1
  Eldrazi Spawn. Ofiara daje jedną manę bezbarwną, nie dowolny kolor;
  zdolność many nie używa stosu ani {T}, więc działa w turze wejścia.
- **Doombringer.** Pierwszy tryb dotyczy wybranego przeciwnika (pin także
  dla 3 graczy), drugi liczy ±3 obrony według **protektora w chwili
  rozstrzygnięcia**, nie właściciela ani kontrolera bitwy. Nowy kontrakt
  `protectorId` przechodzi przez obiekt, widok i kafel; etykiety obrony
  są po polsku. Efekt zdejmuje najwyżej istniejące liczniki, nie rzuca
  wyjątku jak koszt wymagający dokładnie 3.

Zakres Battle jest kontraktem celu, roli protektora i obrony potrzebnym tej
karcie. **Nie dodano żadnej karty Battle do kolekcji.** Nie jest to deklaracja
kompletnego systemu atakowania bitew ani Oracle wszystkich Siege/tylnych
stron; pierwsza rzeczywista karta Battle nadal wymaga swojej pełnej procedury
wdrożenia (ADR 0022/0029). Regresje używają jawnych syntetycznych pozycji
bitwy, nie zmyślonej karty katalogu.

## 3. Naprawy wspólnej rodziny triggerów

Stary modal wybierał tryb przed stosowaniem efektu, ale **sam wybór wykonywał
skutek bez stosu i okna odpowiedzi**. Dodatkowo czyścił decyzję/logował sukces
przed walidacją celu. Po zmianie:

1. wybór trybu/celu jest walidowany przed jakąkolwiek mutacją;
2. wybrana zdolność idzie na stos i korzysta ze wspólnej rewalidacji celów;
3. źródło może zniknąć, a trigger pozostaje; migawka LKI działa również przy
   ETB i śmierci w tym samym przejściu SBA (dodatkowy pin RED→GREEN);
4. kilka modalnych ETB nie nadpisuje jedynego rekordu decyzji;
5. ward odpala dokładnie raz także od trybu i jedynego automatycznego celu.
   Ward od zapowiedzianego triggera jest **kolejną partią APNAP**, nie częścią
   partii rodzica. Piny sprawdzają obu aktywnych graczy.

Cztery stare oczekiwania natychmiastowego efektu (Etherwrought Page,
Downwind Ambusher) zostały zastąpione asercją braku skutku przy wyborze,
akceptowanymi passami i dopiero asercją rozstrzygnięcia. Efekty nie zostały
wyłączone ani złagodzone.

## 4. Dowody testowe i mutacyjne

- `test/real-cards-batch63-completion.test.js`: **32/32** — źródła i koszty,
  legalna oferta → zaakceptowana komenda → odpowiedź → stos → SBA, a także
  transport/UI/log oraz decyzje bota. Testy bitwy jasno oznaczają fixture.
- Pierwsza poprawna sonda przed mechanikami: **11/20**, dziewięć rzeczywistych
  FAIL dla dynamicznego X, bota, atomowości modala i bitwy. Późniejszy pin
  ETB 3/0 odsłonił brak historycznej migawki wejścia — również naprawiony.
- Integracja źródeł/katalogu/talii/snapshotu: **123/123**. Pierwszy przebieg
  ujawnił błędne nazwy dwóch plików tokenów i dwie stare liczności (40→41
  Innistrad, 46→48 tokenów); poprawiono dane i jawne oczekiwania, nie strażniki.
- Integracja modalna i PMSSB-50: **149/149**; integracja wardu: **80/80**
  (wcześniejsze punkty kontrolne, przed rozszerzeniem nowego pliku do 32 pinów).
- Mutacja `controllerId` zamiast protektora: **2 FAIL** (oba rozdzielenia ról).
- Mutacja usuwająca projekcję blokera: pierwotny pin samego wyboru pozostał
  zielony przez premię za reach. Pin wzmocniono pomiarem **różnicy wyceny**
  względem identycznego publicznego widoku bez triggera: następnie **1 FAIL**.
- Mutacja usuwająca projekcję przy ataku: **1 FAIL**. Wszystkie mutacje
  przywrócone bajt w bajt; logi robocze są ignorowane w `.arena/`.

## 5. Pomiar migracji talii i golden-mastera

Generator pozostał źródłem prawdy, bez zamrożenia starych kolorów.
Liczba plików pozostała **27**. Dominaria: **38 nie-basiców → 19+19**, nazwy
`dominaria-wu` / `dominaria-brg` → `dominaria-ub` / `dominaria-wrg`
(leak 1, imbalance 0). Zmieniono 40 aktywnych plików odwołań, oddzielnie
fixture snapshotu i pliki talii; historyczne raporty/handoffy zachowano.

Inne zmiany zmierzone przed zapisaniem generatora:

| Talia | Zmiana kart / manabazy |
|---|---|
| Innistrad BRG | +Harvester, Scroll of Avacyn do WU; Swamp 3→4, Forest 5→4 |
| Innistrad WU | +Scroll of Avacyn; Plains 4→5 |
| Worek Dzikie Światy | +Doombringer; Swamp 1→2, Mountain 3→2 |
| Zendikar | +Predator; Plains 2→1, Forest 3→4 |

**Kontrola przyczynowa:** nowy kod z poprzednimi taliami i poprzednimi nazwami
par odtworzył dokładnie stary hash
`5daea64988d36998b1a0701b68a0c016f5d10086a0dc6046d319db5e7da7f564`.
Nowe talie zmieniły 4/6 śladów. Dopiero po porównaniu zapisano fixture
`577aa78e659cbafc31f2392bd44daf6f49f3f6b2b32afcffab07b8fda65e481c`.

| Para / seed | Pierwsza różnica (indeks od zera) |
|---|---|
| Ravnica–Innistrad WU / 1000 | 35: Swamp, 93 → Mountain, 103 |
| Ravnica–Innistrad WU / 1001 | 67: inna lista legalnych celów (`options[4]`); wybrana komenda i 61 bez zmiany |
| Dominaria–Mirrodin WU / 1000 | 1: pass w upkeepie → wybór karty na spód po mulliganie, −40 |
| Dominaria–Mirrodin WU / 1001 | 3: Swamp w otwarciu 5, 108 → Plains w otwarciu 4, 107 |

README przeliczone z parsera rzeczywistych talii. Katalog: **549 supported**
(w tym 5 wirtualnych basic-landów), **9 back**, **48 token**, razem **606**.

## 6. Bramy

Pierwszy szybki przebieg: **7624/7633**, 9 FAIL. Były to: brak czterech
wierszy CSV kolekcji, stare kotwice liczności (artId/efekty), brak `blocks`
w ręcznym manifeście obsługiwanych zdarzeń, semantyka kolumny nie-basic
w README, próbka kontraktu widoku bez Battle, deklaracje reducerów po
projekcji P/T oraz przeniesiony wyjątek pipu W dla Mournful Zombie do UB.
Po naprawach integracja tych strażników i kart: **79/79**. Próbkę kontraktu
widoku rozszerzono o prawdziwy `playerView` bitwy, bez whitelistowania pola.
CSV ma teraz **553 wiersze / 550 unikalnych nazw** (set 2XM: `259_2XM`).
Ponowna zamrożona brama: **7633/7633** (122 471,954399 ms), snapshot **4/4**,
build **72 moduły / 4849,8 kB**, exit 0. Implementacja i integracja
zapisane i wypchnięte jako **`05947b9`**. Raporty benchmarkowe i historyczny
komentarz nie podlegają migracji nazw — zachowano ich oryginalną treść.
Pierwszy pełny przebieg na `05947b9`: **7902/7904**, exit 1, 463 755,470401 ms.
Dwa znaleziska spoza fast:

- M212: definicje nazw Blood/Spawn były danymi, ale leżały w module rdzenia.
  Przeniesione do `src/cards/card-data.js`; silnik konsumuje deskryptor.
  Nie dodano wyjątków ani długu do strażnika nazw.
- Stary test panelu losował 14 seedów na zmiennych taliach i po migracji nie
  obserwował żadnego zniszczenia. Nie sprawdzał nawet obecności Cutthroat.
  Zastąpiony dwoma scenariuszami prawdziwej karty (ostatni pass obu graczy),
  **całą ścieżką przez sesję**, dokładnie jednym zniszczeniem, wpisem w logu,
  wpisem w panelu i poprawną miniaturą ofiary. Mutacja pomijająca ten event
  w panelu: **2 FAIL**. Plik zszedł do **0,37 s** i wrócił do fast.

Po korektach celowane **44/44**, exit 0. Brama napraw: fast **7642/7642**
(117 163,631567 ms), build **72 moduły / 4850,0 kB**, exit 0. Commit **`f54e21a`**
zapisany i natychmiast wypchnięty. Wyniki ponownej pełnej bramy i quick są poniżej. CI `05947b9` było czerwone (run `37241242392`),
więc nie opisujemy go jako końcowego zielonego stanu.


### Wynik końcowy (zamknięcie 2026-10-05)

Na niezmienionym kodzie **`f54e21a`**:

| Brama | Wynik |
|---|---|
| `node tools/run-tests.mjs all` (stdout i stderr do logu) | **7905/7905**, exit 0, 631 615,783105 ms |
| Build | **72 moduły / 4850,0 kB**, exit 0 |
| `benchmark --quick` | **672/672 ukończonych**, 0 niedokończonych, exit 0, 570 131 ms |
| GitHub CI (testy + build) | **PASS**, [37242752307](https://github.com/jurekjurekgh/mtg/actions/runs/37242752307), 5m28s |

Pełny pakiet i quick pracowały równolegle na zamrożonym drzewie; czasy nie są
porównaniem wydajności do wcześniejszych przebiegów wykonywanych osobno.
Próba quick: Alara, Dominaria UB, Dominaria WRG, Eldraine, Final Fantasy,
Forgotten Realms; po 8 seedów od 2026, limit 8000 komend, 21 par talii.
Heuristic wygrał **585/672 (87,1%)**: vs random **315/336 (93,8%)**, vs aggro
**270/336 (80,4%)**. Zmieniły się wejściowe talie — nie przypisujemy różnicy
win-rate samej heurystyce. Próba nie pokrywa wszystkich czterech nowych kart;
pokrycie ich reguł zapewniają scenariusze. Pełnego B0 nie uruchamiano.

Po tej bramie poprawiano jedynie dokumentację. Podsumowanie i dalszy punkt
zaczepienia: [handoff](../setup/HANDOFF_2026-10-05.md).
