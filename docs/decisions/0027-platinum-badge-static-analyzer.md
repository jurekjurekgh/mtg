# ADR 0027: Odznaka platynowa — klasę błędów tępi ANALIZATOR, nie oczy

- **Status:** Zaakceptowana
- **Data:** 2026-09-01
- **Decydenci:** właściciel projektu („wymyślmy odznakę platynową”; wybór
  poprzeczki: wariant C, zakres szeroki)

## Kontekst

Odznaki M269–M272 to cztery serie po pięć błędów reguł, znalezione tą samą
metodą ręczną (L11). Skuteczne — 25 błędów — ale metoda się nie zmieniała,
więc piąta seria byłaby powtórzeniem ilościowym.

**Wzorzec L107 („choke point istnieje, ale ścieżka go omija”) odpowiada za 10
z tych 25 błędów**, w tym trzy ostatnie z rzędu. Skala żyły: 50 emiterów
`object_moved`, 13 `permanent_sacrificed`, 12 ETB, 14 ręcznych mutacji
`tapped`. Dopóki wykrywanie jest ręczne, każda nowa ścieżka dokłada dług
liniowo. Dowód z M272: piątego emitera bez `toZone` znalazł dopiero skan
źródeł — audyt wzrokowy tej rodziny go przeoczył.

## Decyzja

Platyny **nie zdobywa się liczbą błędów, tylko narzędziem tępiącym klasę**.
Trzy warunki łącznie:

1. **Analizator statyczny w `tools/`, wpięty w `npm test`** — wykrywa
   naruszenia L107 (ręczna mutacja pola mającego choke point; emiter
   omijający choke point) oraz **kontrakty zdarzeń** (komplet pól wymaganych
   przez konsumentów — ten wymiar złapał błąd #20).
2. **Pięć nowych błędów wskazanych PRZEZ ANALIZATOR**, nie wzrokiem. Każdy
   z repro przed naprawą, naprawą u root cause (ADR 0002), strażnikiem
   klasowym i weryfikacją mutacyjną per ścieżka (L13).
3. **Jawna, uzasadniona lista wyjątków** — część ręcznych mutacji jest legalna
   (czar wchodzący na stos nie jest permanentem). Wyjątek bez powodu w kodzie
   jest naruszeniem, nie wyjątkiem.

Analizator zostaje w repo na stałe: nowa ścieżka omijająca choke point nie
przejdzie `npm test`. Diament naprawia pięć błędów — platyna zamyka drogę ich
powstawania.

## Konsekwencje

- Kolejna odznaka tej rangi wymaga NOWEJ klasy i nowego narzędzia.
- Narzędzie z fałszywymi alarmami jest gorsze niż jego brak (L12) — każde
  trafienie wymaga realnego przeglądu wobec konsumenta.
- **Ryzyko przyjęte świadomie:** klasa może być przetrzebiona. Wtedy rozszerz
  analizator, a gdy to nie wystarczy — zamelduj stan faktyczny. **Nie wolno**
  dopisywać błędów na siłę ani zaliczać świadomego kontraktu jako błędu
  (L57, ADR 0022).
- Fałszywy alarm poprawia się w analizatorze albo na liście wyjątków — nigdy
  przez „naprawę” poprawnego kodu.

## Wynik (2026-09-01)

Zrealizowane: `tools/event-contract-audit.mjs` (3 wymiary skanu) + błędy
#22–#25 w czterech ścieżkach naprawy. Szczegóły metody: L112.
