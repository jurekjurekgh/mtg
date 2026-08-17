# PLAN M122 — polowanie na 10 błędów Żywym Testerem (z nowymi detektorami)

Data: 2026-08-17 · gałąź `arena/01a00fa6-mtg` · PR #57

## Zlecenie właściciela

> „Z wykorzystaniem nowych detektorów postaraj się na żywym testerze znaleźć
> i naprawić 10 błędów.”

Kontynuacja M120/M121 (audyt mechanik ofensywnych + detektor self-targetingu).

## Metoda

Pięć serii po 12 partii (F, G, H, I, K) — 60 rozgrywek na prawdziwym artefakcie
`dist/mtg-table.html`, wszystkie kombinacje talii i pięć profili gracza.
Po każdej serii: przegląd zgłoszeń detektorów + skany celowane na klasy błędów,
których żaden detektor jeszcze nie zna (L27: „zero zgłoszeń” znaczy „nie mam
takiej reguły”, nie „jest czysto”).

## Znaleziska (10 naprawionych)

| # | Błąd | Warstwa | Naprawa |
|---|---|---|---|
| 1 | `fingerprint` gubił `cantBeBlocked`/`cantBlock` | **engine** | oba pola w odcisku stanu |
| 2 | 17 identycznych „Szukanie: Forest” jako 17 ofert | **engine** | dedup po `(cardId, destination)` |
| 3 | slug `trigger (enchanted_permanent_tapped)` w logu | UI | +2 etykiety, strażnik na 35 eventów |
| 4 | 5 fałszywych „ofert bez skutku” dla zdolności many | detektor | sygnał strukturalny zamiast regexu po tekście |
| 5 | slug `efekt (attach_equipment_to_source)` w panelu | UI | +9 etykiet, strażnik na 121 typów |
| 6 | slug `trigger (delayed)` (źródło: silnik, nie karty) | UI | etykieta + strażnik rozszerzony o `triggers.js` |
| 7 | transkrypt gubił P/T i „zakryty (morph)” | tester | ekstraktor czyta nakładkę `ovl-*` |
| 8 | `Ruch odrzucony: wrong_combat_timing` | UI | mapa 15 kodów + fallback po prefiksie |
| 9 | fałszywe „bot powtórzył akcję 4× w turze” | detektor | granica tury też z nagłówka kroku |
| 10 | „blokuje: Armored Skaab**choroba**” | tester | separator między sąsiednimi badge |

## Decyzje projektowe

- **Rodzina, nie pojedynczy przypadek (L28).** Trzy znaleziska (#3, #5, #6) to
  ta sama klasa: surowy identyfikator w tekście dla gracza, przepuszczony przez
  fallback `?? slug`. Zamiast łatać zgłoszony slug, za każdym razem
  zinwentaryzowałem **wszystkie** wartości w bazie (35 eventów triggerów,
  121 typów efektów) i dodałem **strażnika**. Tester trafił 1 z 2 i 1 z 9 braków
  — reszta czekała na rzadszy układ partii.
- **Detektor to też produkt (L12).** Trzy znaleziska (#4, #7, #9, #10) są
  w narzędziu audytowym, nie w grze. Fałszywy alarm kosztuje czas audytora tak
  samo jak przeoczony błąd, a zubożony transkrypt psuje wszystkie detektory naraz.
- **Weryfikacja przed zgłoszeniem.** Odrzucone jako fałszywe tropy: Jeskai
  Devotee „21 aktywacji” (duplikaty snapshotów; `oncePerTurn` działa),
  Soulmender „4× w turze” (cztery różne tury), „1 życia”/„3 obrażeń” (poprawny
  dopełniacz), „partia bez końca” (kończy się innym napisem), `-3/2` na kaflu
  (**poprawna** ujemna moc: 1/2 pod dwoma efektami −2/−0).

## Pomiary

- `npm run test:all` — pełny zestaw zielony (+21 testów od M121).
- Benchmark szybki: `tools/b14-m122-2026-08-17.txt`.

## Ryzyka

- Dedup ofert szukania (#2) zmienia liczbę legalnych komend, więc przesuwa
  przebieg partii przy stałym seedzie — dwa testy scenariuszowe wymagały
  przelosowania seeda hunterem. Sens obu testów zachowany (opis w kodzie).
