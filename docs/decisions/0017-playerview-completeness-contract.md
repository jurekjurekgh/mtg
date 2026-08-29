# ADR 0017: Kompletność informacji publicznych w PlayerView (kontrakt widok↔kontroler)

- **Status:** Zaakceptowana
- **Data:** 2026-08-14
- **Decydenci:** właściciel projektu (zlecenie po M91/M92)

## Kontekst

ADR 0003 rozstrzygnął, czego kontroler **nie może** widzieć (FoW). Brakowało
decyzji o kierunku odwrotnym — czego kontroler **musi** widzieć, żeby decydować
sensownie. Trzy niezależne zgłoszenia z rozgrywki miały jedną przyczynę:

| Sesja | Objaw zgłoszony jako „głupi bot" | Faktyczna przyczyna |
|---|---|---|
| M84 | bot pompował liczniki Station bez końca | `station` nie było w `PlayerView` |
| M82 | bot celował zdolnością w nielegalne obiekty | brak wspólnej enumeracji celów |
| M91 | bot rzucił Inspire Awe i zaatakował we własną prewencję | `preventCombatExceptEnchanted` nie było w `PlayerView` |

Audyt M92 (zestawienie pól `createGameState` × `playerView` × odczytów bota)
znalazł kolejne pięć luk tej samej klasy, w tym brak `types` permanentu na polu
bitwy — informacji wydrukowanej wprost na karcie.

Wspólny mianownik: **kontroler nie jest głupi — jest ślepy.** Skoro dostaje
widok, a nie stan (ADR 0003), pole nieobecne w widoku jest fizycznie
nieosiągalne i żadna poprawka heurystyki tego nie naprawi.

Dodatkowa obserwacja z M92: **benchmark bota nie wykrywa tej klasy błędów.** Po
naprawie pięciu luk pełna macierz (5616 meczów) dała wynik identyczny co do
0,1 pp, bo karty wnoszące prewencję są w jednej talii i różnica ginie w
uśrednieniu. Dopiero pomiar ukierunkowany pokazał zysk (65,2% → 69,8% vs aggro).

## Decyzja

`PlayerView` jest **kompletną projekcją informacji publicznych**, nie tylko
filtrem informacji ukrytych. Trzy reguły:

1. **Kompletność.** Jeśli w prawdziwej partii MtG informacja jest jawna dla
   gracza (widoczna na stole, wydrukowana na karcie, wynikająca z
   rozstrzygniętego efektu), `PlayerView` musi ją nieść — również stan globalny
   tury: aktywne prewencje, tarcze, znaczniki i flagi ustawione przez
   rozstrzygnięte efekty.
2. **Zakaz „na zapas".** Nie wystawiamy pól, których żaden kontroler nie używa
   do wyboru komendy — zwłaszcza wewnętrznej księgowości engine (liczniki
   turowe obsługujące warunki triggerów, kolejki opóźnionych efektów, dane
   techniczne). Kryterium: **czy kontroler potrzebuje tego, aby podjąć
   decyzję?** Jeśli warunek rozstrzyga engine — pole zostaje ukryte.
3. **Diagnostyka przed poprawką heurystyki.** Zanim uznamy zachowanie
   kontrolera za błąd heurystyki, sprawdzamy, czy `PlayerView` w ogóle niesie
   potrzebne dane. Naprawa braku danych jest naprawą u root cause; strojenie wag
   wokół brakującej informacji jest maskowaniem (por. AGENTS.md).

Widok pozostaje niemutowalnym zdjęciem stanu: wystawiane kolekcje są kopiami,
nie referencjami do struktur `GameState`.

Przy każdym batchu kart wnoszącym **nowe pole stanu** autor odpowiada w opisie
PR: „czy kontroler musi to widzieć, żeby decydować sensownie?". Odpowiedź „nie"
jest w pełni akceptowalna — ma być świadoma.

## Konsekwencje

### Pozytywne

- Znika cała klasa błędów „bot robi coś bez sensu", której nie da się naprawić
  strojeniem wag.
- Granica z ADR 0003 nienaruszona: rosną wyłącznie informacje jawne.
- Diagnostyka staje się powtarzalna — inwentaryzacja stan × widok × odczyty
  jest mechaniczna i możliwa w każdej sesji.
- Każdy kontroler (heurystyczny, aggro, przyszły LLM) zyskuje jednakowo.

### Koszty i ryzyka

- `PlayerView` rośnie; każde nowe pole wymaga rozstrzygnięcia „jawne czy
  ukryte" i testu FoW.
- Ryzyko odwrotnego błędu: wystawienia informacji ukrytej. Reguła 2 jest
  równie wiążąca jak reguła 1.
- Benchmark nie jest siecią bezpieczeństwa dla tej klasy błędów — potrzebne są
  testy kontraktu widoku i pomiary ukierunkowane na talie z daną mechaniką.

## Rozważone alternatywy

- **Pełny `GameState` dla kontrolera** — łamie ADR 0003 i niweczy FoW.
- **Diagnoza przez strojenie wag** — nie da się wycenić informacji, której się
  nie widzi; to maskowanie objawu.
- **Cały stan poza strefami ukrytymi w widoku** — wypycha do kontrolerów
  wewnętrzną księgowość engine, utrwala przypadkowe zależności, utrudnia zmiany.
- **Reguła tylko w handoffie sesji** — handoff opisuje jedną sesję i traci
  aktualność; reguła trwała należy do ADR (uwaga właściciela, 2026-08-14).

## Powiązania

- [ADR 0003](0003-player-specific-views-and-fow.md) — FoW (ten ADR uzupełnia go
  o kierunek „kompletność informacji jawnych").
- [ADR 0004](0004-pluggable-controllers-bot-first.md) — wymienne kontrolery.
- [ADR 0002](0002-authoritative-card-agnostic-engine.md) — reguły czytające
  widok muszą być generyczne.
- [docs/LESSONS.md](../LESSONS.md) — m.in. o ślepocie benchmarku na rzadkie
  mechaniki. Historia: M84 (Station), M91/A1 (Inspire Awe), M92 (audyt luk).
