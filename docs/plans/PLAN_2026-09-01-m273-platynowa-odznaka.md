# Plan M273 — Odznaka PLATYNOWA (pierwsza w historii projektu)

- **Data:** 2026-09-01
- **Gałąź:** `arena/01a058db-mtg` (PR #91)
- **Poprzednie odznaki:** M269 brąz, M270 srebro, M271 złoto, M272 diament
  (łącznie 25 błędów reguł, wszystkie u root cause)

## Dlaczego platyna musi być INNA

Brąz→diament to cztery razy ta sama metoda: polowanie ręczne, pięć błędów,
strażnik na każdy. Piąte powtórzenie byłoby ilościowe, nie jakościowe.

Twarda obserwacja z tych czterech serii: **wzorzec L107 („choke point istnieje,
ale ścieżka go omija") dał 10 z 25 błędów**, w tym trzy ostatnie z rzędu.
Za każdym razem leczyliśmy POJEDYNCZY OBJAW. Skala żyły (pomiar 2026-09-01):

| sygnał | liczba |
|---|---|
| emitery `object_moved` | 50 |
| emitery `permanent_sacrificed` | 13 |
| emitery `permanent_entered_battlefield` | 12 |
| ręczne mutacje `tapped` | 14 |
| ręczne mutacje `controllerId` | 10 |

Dopóki wykrywanie jest ręczne, każda nowa ścieżka dokłada dług liniowo.

## Definicja odznaki PLATYNOWEJ (decyzja właściciela, 2026-09-01)

Platynę zdobywa się **narzędziem, nie oczami**. Trzy warunki łącznie:

1. **Analizator statyczny klasy L107 + kontraktów zdarzeń** w `tools/`,
   uruchamiany w `npm test`. Wykrywa:
   - ręczną mutację pola, które ma swój choke point (`tapped`, `counters`,
     `damage`, `life`, `zone`, `controllerId`);
   - emiter zdarzenia pomijający choke point;
   - **kontrakt zdarzenia**: zdarzenie danego typu musi nieść komplet pól,
     których oczekują konsumenci (to złapało błąd #20 — brak `toZone`).
2. **Pięć NOWYCH błędów reguł (#22–#26) wskazanych przez analizator**, nie
   przez audyt ręczny. Każdy z: repro przed naprawą, naprawą u root cause
   (ADR 0002), strażnikiem klasowym i weryfikacją mutacyjną per ścieżka (L13).
3. **Lista wyjątków JAWNA i UZASADNIONA** — każdy dopuszczony przypadek
   ręcznej mutacji ma w kodzie powód (np. czar wchodzący na stos nie jest
   permanentem, więc `tapped: false` jest legalne). Wyjątek bez uzasadnienia
   = naruszenie.

Analizator zostaje w repo na stałe: od tej pory żadna przyszła ścieżka
omijająca choke point nie ma prawa wejść, więc klasa L107 przestaje rosnąć.

## Ryzyko i plan awaryjny

Główne ryzyko: **klasa L107 może być już przetrzebiona** i analizator nie
znajdzie pięciu NOWYCH błędów (właściciel wybrał wariant C świadom tego).
Reakcja, gdyby tak było — w tej kolejności, bez rozmiękczania kryterium:
1. rozszerzyć analizator o kontrakty zdarzeń (drugi wymiar, wybrany zakres);
2. rozszerzyć o niespójność między bliźniaczymi implementacjami (L11 poz. 1 —
   historycznie najskuteczniejsza technika);
3. dopiero gdy oba wyczerpane — zameldować właścicielowi stan faktyczny
   („znaleziono N < 5") i poprosić o decyzję. NIE dopisywać błędów na siłę
   ani nie zaliczać jako błąd czegoś, co jest świadomym kontraktem.

## Metoda (bez zmian — L11/L12/L13, ADR 0002)

1. Repro headless PRZED naprawą; sonda przez PEŁNĄ komendę, nie `applyEffect`
   (L111 — inaczej pomija akcje stanowe).
2. Grep nazwy zdarzenia w CAŁYM `src/` przed pisaniem naprawy.
3. Naprawa u źródła, zero specjalnych przypadków po nazwie karty.
4. Strażnik klasowy + weryfikacja mutacyjna KAŻDEJ ścieżki osobno.
5. `npm test` + `node --test test/bot-benchmark.test.js` + `npm run build`
   przed każdym commitem; commity inkrementalne, bez force push.

## Kryteria ukończenia

- [ ] `tools/` zawiera analizator, `npm test` go uruchamia
- [ ] błędy #22–#26 znalezione analizatorem, naprawione u root cause
- [ ] każdy ze strażnikiem klasowym i weryfikacją mutacyjną
- [ ] lista wyjątków jawna i uzasadniona
- [ ] wpis M273 w ENGINE_MILESTONES + ADR definiujący odznakę + handoff
- [ ] `npm test`, benchmark botów i build zielone
