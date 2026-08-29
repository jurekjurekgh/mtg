# ADR 0023: Talie per PLAN (worki dla małych planów) i stała próbka benchmarku

- **Status:** Zaakceptowana
- **Data:** 2026-08-22
- **Decydenci:** właściciel projektu (zlecenie M178 + dwa doprecyzowania)

## Kontekst

Do M177 karty z batchów trafiały wyłącznie do trzech talii (tokens/ostrza/
graveyard), bo pozostałe miały „zamrożone seedy" testów scenariuszowych. Efekt:
talie od 30 do 70 kart, składy bez tożsamości, a każda zmiana talii i tak
wymuszała przelosowanie seedów (recydywa L25 — niektóre testy miały po 10+
wpisów historii hunterów).

## Decyzja

1. **Talie buduje generator** `tools/generate-plan-decks.mjs` (źródło prawdy
   przydziału; strażnik `repo-decks.test.js` pilnuje zgodności plików z
   generatorem i pokrycia katalogu 1:1).
2. **Plan z ≥15 kartami wspieranymi = własna talia jednoplanowa.** Mniejsze
   plany trafiają do jednego z 4 „worków" (baśnie/legendy/dzikie światy/mroczne
   światy — mapa w generatorze). Każda wspierana karta jest w DOKŁADNIE jednej
   talii. **(M181)** Awans jest AUTOMATYCZNY: generator sam wyjmuje plan z
   worka, gdy ten dobije do progu (talia o slugu nazwy planu, landy
   przeliczone) — bez edycji map; wpis planu w mapie worka staje się wtedy
   martwy (generator ostrzega, sprzątnięcie przy okazji).
3. **Singleton** (1x poza basic landami); **landy = ceil(nielandów/2)**, kolory
   proporcjonalnie do pipów kosztów many (każdy używany kolor ≥1).
4. **Worki są przejściowe:** gdy plan uzbiera 15+ kart, generator przy
   najbliższym uruchomieniu AUTOMATYCZNIE przenosi go do własnej talii (strażnik
   `test/m181-auto-awans` + „pliki = generator" w repo-decks wymuszają
   regenerację). Jeśli worek spadłby po awansie poniżej 15 nielandów — generator
   zatrzymuje się czytelnym błędem: przetasowanie planów między workami to
   świadoma decyzja w mapie, nie automat.
5. **Testy i benchmark korzystają WYŁĄCZNIE z talii jednoplanowych** (decyzja
   właściciela): konwersja worka nie może wymuszać przeróbek testów ani
   rekalibracji progów. Benchmark gra na STAŁEJ próbce `BENCH_DECKS` (6 talii
   jednoplanowych, ~672 mecze) zamiast pełnej macierzy `decks/*.txt`; pełne B0
   dalej tylko na komendę (ADR 0018).

## Procedura dla przyszłych batchów

- Nowa karta → talia jej PLANU; po dopisaniu karty uruchom
  `node tools/generate-plan-decks.mjs` — to JEDYNY krok ręczny: generator
  przelicza landy i awansuje plany, które dobiły do 15+.
- Nowy plan → dopisz do `WOREK_DECKS` (motyw + najmniejsza talia); generator
  wywróci się jawnym błędem, jeśli plan nie ma przydziału.
- Zmiana talii jednoplanowej z próbki benchmarku może przesunąć wyniki — progi
  rekalibrujemy regułą „zmierzone −15 p.p., tylko w górę" (historia w nagłówku
  `test/bot-benchmark.test.js`).
- Testy scenariuszowe: preferuj deterministyczne scenariusze silnikowe (wzorzec:
  4 testy etykiet w table-session po M178) zamiast zamrożonych seedów pełnych
  partii; gdy seed konieczny — hunter jak dotąd (L25).

## Konsekwencje

- Skład talii przewidywalny i równy (23–39 kart), tożsamość = plan.
- Benchmark szybszy (~80 s vs ~6 min) i odporny na wzrost liczby talii.
- Stare nazwy talii (green/red/black/azorius/graveyard/tokens/ostrza/
  sojusznicy/spellslinger/mechanicy) przestały istnieć — testy przepięte.
