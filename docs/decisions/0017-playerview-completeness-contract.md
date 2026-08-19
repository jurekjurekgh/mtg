# ADR 0017: Kompletność informacji publicznych w PlayerView (kontrakt widok↔kontroler)

- **Status:** Zaakceptowana
- **Data:** 2026-08-14
- **Decydenci:** właściciel projektu (zlecenie po M91/M92)

## Kontekst

ADR 0003 rozstrzygnął, czego kontroler **nie może** widzieć (Fog of War):
`PlayerView` jest filtrem odcinającym informacje ukryte. W praktyce okazało
się, że brakuje decyzji o kierunku odwrotnym — czego kontroler **musi**
widzieć, żeby w ogóle móc decydować sensownie.

Trzy niezależne zgłoszenia właściciela z rozgrywki miały tę samą przyczynę:

| Sesja | Objaw zgłoszony jako „głupi bot" | Faktyczna przyczyna |
|---|---|---|
| M84 | bot pompował liczniki Station bez końca | `station` nie było w `PlayerView` |
| M82 | bot celował zdolnością w nielegalne obiekty | brak wspólnej enumeracji celów |
| M91 | bot rzucił Inspire Awe i zaatakował we własną prewencję | `preventCombatExceptEnchanted` nie było w `PlayerView` |

Audyt M92 (systematyczne zestawienie pól `createGameState` × `playerView` ×
odczytów bota) znalazł kolejne pięć luk tej samej klasy — w tym brak `types`
permanentu na polu bitwy, czyli informacji wydrukowanej wprost na karcie.

Wspólny mianownik: **kontroler nie jest głupi — jest ślepy.** Skoro dostaje
widok, a nie stan (ADR 0003), to pole nieobecne w widoku jest dla niego
fizycznie nieosiągalne i żadna poprawka heurystyki tego nie naprawi.

Dodatkowa obserwacja z M92: **benchmark bota nie wykrywa tej klasy błędów.**
Po naprawie pięciu luk pełna macierz (5616 meczów) dała wynik identyczny co do
0,1 pp, bo karty wnoszące prewencję występują w jednej talii i różnica ginie
w uśrednieniu. Dopiero pomiar ukierunkowany na talie z tymi kartami pokazał
zysk (65,2% → 69,8% vs aggro).

## Decyzja

`PlayerView` jest **kompletną projekcją informacji publicznych**, a nie tylko
filtrem informacji ukrytych. Obowiązują trzy reguły:

1. **Kompletność.** Jeżeli w prawdziwej partii MtG informacja jest jawna dla
   danego gracza (widoczna na stole, wydrukowana na karcie, wynikająca
   z rozstrzygniętego efektu), to `PlayerView` tego gracza musi ją nieść.
   Dotyczy to również stanu globalnego tury: aktywnych prewencji, tarcz,
   znaczników i flag ustawionych przez rozstrzygnięte efekty.

2. **Zakaz „na zapas".** Nie wystawiamy pól, których żaden kontroler nie używa
   do wyboru komendy — zwłaszcza wewnętrznej księgowości engine (liczniki
   turowe obsługujące warunki triggerów, kolejki opóźnionych efektów, dane
   techniczne). Kryterium jest jedno: **czy kontroler potrzebuje tego, aby
   podjąć decyzję?** Jeśli warunek rozstrzyga engine — pole zostaje ukryte.

3. **Diagnostyka przed poprawką heurystyki.** Zanim uznamy zachowanie
   kontrolera za błąd heurystyki, sprawdzamy, czy `PlayerView` w ogóle niesie
   dane potrzebne do tej decyzji. Naprawa braku danych jest naprawą u root
   cause; strojenie wag wokół brakującej informacji jest maskowaniem
   (por. AGENTS.md — „naprawiaj u root cause, nie maskuj").

Widok pozostaje niemutowalnym zdjęciem stanu: wystawiane kolekcje są kopiami,
nie referencjami do struktur `GameState`.

Przy każdym batchu kart wnoszącym **nowe pole stanu** autor zmiany odpowiada
w opisie PR na pytanie: „czy kontroler musi to widzieć, żeby decydować
sensownie?". Odpowiedź „nie" jest w pełni akceptowalna — ma być świadoma.

## Konsekwencje

### Pozytywne

- Znika cała klasa błędów „bot robi coś bez sensu", której nie da się naprawić
  strojeniem wag.
- Granica z ADR 0003 pozostaje nienaruszona: rosną wyłącznie informacje jawne.
- Diagnostyka staje się powtarzalna — inwentaryzacja stan × widok × odczyty
  kontrolera jest mechaniczna i możliwa do wykonania w każdej sesji.
- Każdy kontroler (bot heurystyczny, aggro, przyszły LLM) zyskuje jednakowo,
  bo wszystkie czytają ten sam widok.

### Koszty i ryzyka

- `PlayerView` rośnie; każde nowe pole wymaga rozstrzygnięcia „jawne czy
  ukryte" i testu FoW.
- Ryzyko odwrotnego błędu: wystawienia informacji ukrytej. Dlatego reguła 2
  jest równie wiążąca jak reguła 1, a każde nowe pole wymaga świadomej decyzji.
- Benchmark nie jest siecią bezpieczeństwa dla tej klasy błędów — potrzebne są
  testy kontraktu widoku i pomiary ukierunkowane na talie z daną mechaniką.

## Rozważone alternatywy

- **Przekazywać kontrolerowi pełny `GameState`.** Odrzucone — łamie ADR 0003
  i niweczy Fog of War.
- **Zostawić diagnozę heurystyce (strojenie wag).** Odrzucone — nie da się
  wycenić informacji, której się nie widzi; to maskowanie objawu.
- **Wystawić w widoku cały stan poza strefami ukrytymi.** Odrzucone — wypycha
  do kontrolerów wewnętrzną księgowość engine, utrwala przypadkowe zależności
  i utrudnia zmiany w engine.
- **Zapisać regułę tylko w handoffie sesji.** Odrzucone — handoff opisuje stan
  jednej sesji i traci aktualność; reguła trwała należy do ADR (uwaga
  właściciela, 2026-08-14).

## Powiązania

- [ADR 0003](0003-player-specific-views-and-fow.md) — widoki graczy i FoW
  (ten ADR uzupełnia go o kierunek „kompletność informacji jawnych").
- [ADR 0004](0004-pluggable-controllers-bot-first.md) — wymienne kontrolery.
- [ADR 0002](0002-authoritative-card-agnostic-engine.md) — brak specjalnych
  przypadków po nazwie karty (reguły czytające widok muszą być generyczne).
- [docs/LESSONS.md](../LESSONS.md) — trwały rejestr lekcji, m.in. o ślepocie
  benchmarku na rzadkie mechaniki.
- Historia: M84 (Station), M91/A1 (Inspire Awe), M92 (audyt pięciu luk).
